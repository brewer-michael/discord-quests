import { GameError, type TurnView } from "@dq/engine";
import type { Message, SendableChannels } from "discord.js";
import type { BotContext } from "./context";
import { notice, V2 } from "./render/common";
import { freezeComponents, renderTurn, sceneAttachment } from "./render/turn";

export async function sendableChannel(
  ctx: BotContext,
  channelId: string | null,
): Promise<SendableChannels | null> {
  if (!channelId) return null;
  const ch = await ctx.client.channels.fetch(channelId).catch(() => null);
  return ch?.isSendable() ? ch : null;
}

/** Posts a turn, remembers its message, starts the round timer, and fetches scene art in the background. */
export async function postTurn(ctx: BotContext, channel: SendableChannels, view: TurnView): Promise<Message> {
  const waitingOn = view.roundId ? await ctx.engine.turns.waitingOn(view.roundId, view.campaignId) : [];
  const message = await channel.send(renderTurn(view, { waitingOn }));
  if (view.roundId) {
    const campaign = await ctx.engine.campaigns.get(view.campaignId);
    const seconds = Number(
      (campaign?.settings as Record<string, unknown> | undefined)?.roundTimerSeconds ?? 0,
    );
    const deadline = seconds > 0 ? new Date(Date.now() + seconds * 1000) : null;
    await ctx.engine.turns.setRoundMessage(view.roundId, message.id, deadline);
    if (deadline) scheduleRound(ctx, view.roundId, deadline, channel.id);
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

export function scheduleRound(ctx: BotContext, roundId: string, at: Date, channelId: string) {
  ctx.scheduler.schedule(roundId, at, () => {
    void sendableChannel(ctx, channelId).then((ch) => (ch ? resolveAndPost(ctx, roundId, ch) : undefined));
  });
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
  ctx.scheduler.cancel(roundId);
  const typing = setInterval(() => void channel.sendTyping().catch(() => {}), 8000);
  void channel.sendTyping().catch(() => {});
  try {
    const round = await ctx.engine.turns.getRound(roundId);
    const view = await ctx.engine.turns.resolveRound(roundId);
    if (!view) return;
    if (round?.discordMessageId) {
      const old = await channel.messages.fetch(round.discordMessageId).catch(() => null);
      if (old)
        await old
          .edit({
            components: freezeComponents(old.components.map((c) => c.toJSON())) as never,
            flags: V2,
          } as never)
          .catch(() => {});
    }
    await postTurn(ctx, channel, view);
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
      o.content =
        waitingOn.length > 0
          ? `-# Waiting on: ${waitingOn.join(", ")}`
          : "-# Everyone has chosen. The story continues…";
    }
    if (Array.isArray(o.components)) o.components = o.components.map(update);
    return o;
  };
  await msg.edit({ components: json.map(update) as never, flags: V2 } as never).catch(() => {});
}
