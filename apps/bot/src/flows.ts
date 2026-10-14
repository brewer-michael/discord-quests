import {
  type DmDraft,
  GameError,
  type PaceSettings,
  paceOf,
  reminderAt,
  type TurnView,
  whenTimeIsUp,
} from "@dq/engine";
import type { Message, SendableChannels } from "discord.js";
import type { BotContext } from "./context";
import { notice, V2 } from "./render/common";
import { renderDraft } from "./render/draft";
import { freezeComponents, renderTurn, sceneAttachment, waitingLine } from "./render/turn";

export async function sendableChannel(
  ctx: BotContext,
  channelId: string | null,
): Promise<SendableChannels | null> {
  if (!channelId) return null;
  const ch = await ctx.client.channels.fetch(channelId).catch(() => null);
  return ch?.isSendable() ? ch : null;
}

function deadlineFor(pace: PaceSettings, from = Date.now()): Date | null {
  return pace.roundTimerSeconds > 0 ? new Date(from + pace.roundTimerSeconds * 1000) : null;
}

/** Posts a turn, remembers its message, starts the round's clock, and fetches scene art in the background. */
export async function postTurn(ctx: BotContext, channel: SendableChannels, view: TurnView): Promise<Message> {
  const campaign = await ctx.engine.campaigns.get(view.campaignId);
  const pace = paceOf(campaign?.settings as Record<string, unknown> | undefined);
  const deadline = view.roundId ? deadlineFor(pace) : null;
  const waitingOn = view.roundId ? await ctx.engine.turns.waitingOn(view.roundId, view.campaignId) : [];
  const message = await channel.send(renderTurn(view, { waitingOn, deadline }));
  if (view.roundId) {
    await ctx.engine.turns.setRoundMessage(view.roundId, message.id, deadline);
    const round = await ctx.engine.turns.getRound(view.roundId);
    if (round) armRound(ctx, round, pace, channel.id);
    if (pace.pingPlayers && !view.campaignEnded)
      await pingTurn(ctx, channel, view.roundId, view.campaignId, deadline, "new");
  }
  if (view.levelUps.length > 0) {
    await channel.send({
      content: `🎉 ${view.levelUps.map((l) => `<@${l.userId}>`).join(", ")}: your hero${view.levelUps.length > 1 ? "es are" : " is"} ready to level up! Use \`/character levelup\`.`,
      allowedMentions: { users: view.levelUps.map((l) => l.userId) },
    });
  }
  void addSceneImage(ctx, message, view);
  return message;
}

type RoundRow = NonNullable<Awaited<ReturnType<BotContext["engine"]["turns"]["getRound"]>>>;

/** Sets a round's timers: the deadline (if any) and the next reminder (play by post). */
export function armRound(ctx: BotContext, round: RoundRow, pace: PaceSettings, channelId: string) {
  ctx.scheduler.cancelRound(round.id);
  if (round.deadlineAt) {
    ctx.scheduler.schedule(
      `${round.id}:deadline`,
      round.deadlineAt,
      () => void onDeadline(ctx, round.id, channelId),
    );
  }
  const remind = reminderAt(pace, round);
  if (remind)
    ctx.scheduler.schedule(`${round.id}:reminder`, remind, () => void sendReminder(ctx, round.id, channelId));
}

/** Mentions the players who still need to act. Only the people who haven't chosen get pinged. */
export async function pingTurn(
  ctx: BotContext,
  channel: SendableChannels,
  roundId: string,
  campaignId: string,
  deadline: Date | null,
  kind: "new" | "reminder" | "resumed",
) {
  const players = await ctx.engine.turns.waitingOnPlayers(roundId, campaignId);
  const users = [...new Set(players.map((p) => p.userId))];
  if (users.length === 0) return;
  const when = deadline
    ? ` The story moves on <t:${Math.floor(deadline.getTime() / 1000)}:R> (<t:${Math.floor(deadline.getTime() / 1000)}:f>).`
    : " There's no rush: the story waits for everyone.";
  const lead =
    kind === "new"
      ? "🔔 A new turn is ready!"
      : kind === "resumed"
        ? "▶️ The adventure is back on!"
        : "⏳ Friendly reminder: your heroes are waiting.";
  await channel
    .send({
      content: `${lead} ${users.map((u) => `<@${u}>`).join(" ")}, choose what your hero does.${when}`,
      allowedMentions: { users },
    })
    .catch((e: Error) => ctx.log.warn("ping failed", { error: e.message }));
}

/**
 * Time's up. Whoever hasn't chosen watches and waits, and the story goes on.
 * But if nobody has chosen anything, moving on would waste the turn: at game
 * night the story simply waits; in play by post it gives everyone another go.
 */
async function onDeadline(ctx: BotContext, roundId: string, channelId: string) {
  const channel = await sendableChannel(ctx, channelId);
  const round = await ctx.engine.turns.getRound(roundId);
  if (!channel || round?.status !== "collecting") return;
  const campaign = await ctx.engine.campaigns.get(round.campaignId);
  if (campaign?.status !== "active") return;
  const waiting = await ctx.engine.turns.waitingOnPlayers(roundId, campaign.id);
  const party = await ctx.engine.characters.activeCharacters(campaign.id);
  const pace = paceOf(campaign.settings as Record<string, unknown>);
  const next = whenTimeIsUp(pace, party.length, waiting.length);
  if (next === "resolve") return resolveAndPost(ctx, roundId, channel);
  if (next === "extend") {
    const deadline = deadlineFor(pace);
    await ctx.engine.turns.setRoundDeadline(roundId, deadline);
    await channel
      .send({
        content: "-# Nobody has chosen yet, so the story is waiting a little longer.",
        allowedMentions: { parse: [] },
      })
      .catch(() => {});
    if (pace.pingPlayers) await pingTurn(ctx, channel, roundId, campaign.id, deadline, "reminder");
    const fresh = await ctx.engine.turns.getRound(roundId);
    if (fresh) armRound(ctx, fresh, pace, channelId);
  } else {
    await ctx.engine.turns.setRoundDeadline(roundId, null);
    await channel
      .send({
        content:
          "-# Nobody has chosen yet. The story will wait until someone does (or the host presses **Continue the story**).",
        allowedMentions: { parse: [] },
      })
      .catch(() => {});
  }
  await refreshWaiting(ctx, roundId, channel);
}

async function sendReminder(ctx: BotContext, roundId: string, channelId: string) {
  const round = await ctx.engine.turns.getRound(roundId);
  if (round?.status !== "collecting") return;
  const campaign = await ctx.engine.campaigns.get(round.campaignId);
  if (campaign?.status !== "active") return;
  const pace = paceOf(campaign.settings as Record<string, unknown>);
  if (!pace.pingPlayers) return;
  const channel = await sendableChannel(ctx, channelId);
  if (!channel) return;
  await pingTurn(ctx, channel, roundId, campaign.id, round.deadlineAt, "reminder");
  await ctx.engine.turns.markReminded(roundId);
  const fresh = await ctx.engine.turns.getRound(roundId);
  if (fresh) armRound(ctx, fresh, pace, channelId);
}

/** Pausing stops the clock: no deadline, no reminders. */
export async function stopClock(ctx: BotContext, campaignId: string) {
  const round = await ctx.engine.turns.currentRound(campaignId);
  if (!round) return;
  ctx.scheduler.cancelRound(round.id);
  await ctx.engine.turns.setRoundDeadline(round.id, null);
}

/** Starts the open round's clock afresh (after resuming, or a change of pace). */
export async function restartClock(ctx: BotContext, campaignId: string, kind: "resumed" | "new") {
  const campaign = await ctx.engine.campaigns.get(campaignId);
  const round = await ctx.engine.turns.currentRound(campaignId);
  if (!campaign || !round || campaign.status !== "active") return null;
  const pace = paceOf(campaign.settings as Record<string, unknown>);
  const deadline = deadlineFor(pace);
  await ctx.engine.turns.setRoundDeadline(round.id, deadline);
  const channel = await sendableChannel(ctx, campaign.threadId);
  if (!channel) return deadline;
  if (pace.pingPlayers) {
    await pingTurn(ctx, channel, round.id, campaign.id, deadline, kind);
    await ctx.engine.turns.markReminded(round.id);
  }
  const fresh = await ctx.engine.turns.getRound(round.id);
  if (fresh) armRound(ctx, fresh, pace, channel.id);
  await refreshWaiting(ctx, round.id, channel);
  return deadline;
}

async function addSceneImage(ctx: BotContext, message: Message, view: TurnView) {
  if (!ctx.images || !view.sceneChanged || !view.imageBrief || view.campaignEnded) return;
  try {
    const campaign = await ctx.engine.campaigns.get(view.campaignId);
    if (!campaign) return;
    const policy = (campaign.settings as Record<string, unknown>).imagePolicy ?? "new_scenes";
    if (policy === "off" || (policy === "cruxes_only" && view.sceneKind !== "crux")) return;
    const { index } = ctx.worlds.get(campaign.worldId);
    const image = await ctx.images.sceneImage(
      { guildId: campaign.guildId, campaignId: campaign.id },
      view.imageBrief,
      index.world,
    );
    if (!image) return;
    const att = sceneAttachment(image.bytes, image.mime);
    const round = view.roundId ? await ctx.engine.turns.getRound(view.roundId) : null;
    const stillOpen = round?.status === "collecting";
    const waitingOn =
      stillOpen && view.roundId ? await ctx.engine.turns.waitingOn(view.roundId, view.campaignId) : [];
    const payload = renderTurn(view, { waitingOn, image: { name: att.name } });
    const components = stillOpen
      ? payload.components
      : freezeComponents(payload.components.map((c) => c.toJSON()));
    await message.edit({ components: components as never, files: [att.file], flags: V2 } as never);
  } catch (e) {
    ctx.log.warn("scene image failed", { error: (e as Error).message });
  }
}

/** Resolves a round and posts what happens next. Safe to call from several places at once. */
export async function resolveAndPost(
  ctx: BotContext,
  roundId: string,
  channel: SendableChannels,
): Promise<void> {
  if (ctx.resolving.has(roundId)) return;
  ctx.resolving.add(roundId);
  ctx.scheduler.cancelRound(roundId);
  const typing = setInterval(() => void channel.sendTyping().catch(() => {}), 8000);
  void channel.sendTyping().catch(() => {});
  try {
    const result = await ctx.engine.turns.resolveRound(roundId);
    if (!result) return;
    if (result.kind === "draft") {
      await postDraft(ctx, result.draft);
      await channel
        .send({ content: "-# 🕯️ The DM is looking over what happens next…", allowedMentions: { parse: [] } })
        .catch(() => {});
      return;
    }
    await freezeRound(ctx, roundId, channel);
    await postTurn(ctx, channel, result.view);
  } catch (e) {
    const msg =
      e instanceof GameError
        ? e.userMessage
        : "The storyteller lost their place for a moment. Press **Continue the story** to try again.";
    ctx.log.error("resolve failed", { roundId, error: (e as Error).message });
    await channel.send({ ...notice(msg), flags: V2 }).catch(() => {});
  } finally {
    clearInterval(typing);
    ctx.resolving.delete(roundId);
  }
}

/** Refreshes the "waiting on" line of a round's message. */
export async function refreshWaiting(ctx: BotContext, roundId: string, channel: SendableChannels) {
  const round = await ctx.engine.turns.getRound(roundId);
  if (!round?.discordMessageId || round.status !== "collecting") return;
  const msg = await channel.messages.fetch(round.discordMessageId).catch(() => null);
  if (!msg) return;
  const waitingOn = await ctx.engine.turns.waitingOn(roundId, round.campaignId);
  const json = msg.components.map((c) => c.toJSON()) as unknown[];
  const update = (node: unknown): unknown => {
    if (!node || typeof node !== "object") return node;
    const o = { ...(node as Record<string, unknown>) };
    delete o.id;
    if (
      o.type === 10 &&
      typeof o.content === "string" &&
      (o.content.startsWith("-# Waiting on") || o.content.startsWith("-# Everyone has chosen"))
    ) {
      o.content = waitingLine(waitingOn, round.deadlineAt);
    }
    if (Array.isArray(o.components)) o.components = o.components.map(update);
    return o;
  };
  await msg.edit({ components: json.map(update) as never, flags: V2 } as never).catch(() => {});
}

/** Removes the buttons from a round's message once it's been resolved. */
export async function freezeRound(ctx: BotContext, roundId: string, channel: SendableChannels) {
  const round = await ctx.engine.turns.getRound(roundId);
  if (!round?.discordMessageId) return;
  const old = await channel.messages.fetch(round.discordMessageId).catch(() => null);
  if (old)
    await old
      .edit({
        components: freezeComponents(old.components.map((c) => c.toJSON())) as never,
        flags: V2,
      } as never)
      .catch(() => {});
}

/** Sends an Assist-mode draft to the DM's private screen. */
export async function postDraft(ctx: BotContext, draft: DmDraft) {
  const campaign = await ctx.engine.campaigns.get(draft.campaignId);
  const screen = await sendableChannel(ctx, campaign?.dmThreadId ?? null);
  if (!screen) {
    ctx.log.warn("no DM screen for draft", { campaignId: draft.campaignId });
    return;
  }
  const msg = await screen.send(renderDraft(draft) as never);
  await ctx.engine.dm.setApprovalMessage(draft.approvalId, msg.id);
}
