import { createRng } from "@dq/core/rng";
import { formatDiceResult, parseDice, rollDice } from "@dq/core/rules";
import { GameError, type SubmitResult } from "@dq/engine";
import { renderMap } from "@dq/map-render";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  ContainerBuilder,
  LabelBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ModalBuilder,
  type ModalSubmitInteraction,
  StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { BotContext } from "../context";
import { refreshWaiting, resolveAndPost, sendableChannel } from "../flows";
import { encodeId } from "../ids";
import { typedActions } from "../rate-limit";
import { COLORS, esc, text, V2_EPHEMERAL } from "../render/common";
import { renderJournal } from "../render/misc";
import { campaignHere, say } from "./shared";

async function afterSubmit(
  ctx: BotContext,
  i: ButtonInteraction | ModalSubmitInteraction | ChatInputCommandInteraction,
  roundId: string,
  res: SubmitResult,
  what: string,
) {
  if (!res.ok) return say(i, res.message);
  if ("deflection" in res) return say(i, `*${res.deflection}*`);
  await say(i, `${what}${res.allSubmitted ? "" : ` Waiting on: ${res.waitingOn.map(esc).join(", ")}.`}`);
  const ch = i.channel?.isSendable() ? i.channel : null;
  if (!ch) return;
  if (res.allSubmitted) await resolveAndPost(ctx, roundId, ch);
  else await refreshWaiting(ctx, roundId, ch);
}

export async function choiceButton(ctx: BotContext, i: ButtonInteraction, roundId: string, index: number) {
  const round = await ctx.engine.turns.getRound(roundId);
  const choice = (round?.choices as Array<{ label: string }> | undefined)?.[index];
  const res = await ctx.engine.turns.submitAction({
    roundId,
    userId: i.user.id,
    kind: "choice",
    choiceIndex: index,
    interactionId: i.id,
  });
  await afterSubmit(ctx, i, roundId, res, `You chose: **${choice?.label ?? "that"}**.`);
}

export async function passButton(
  ctx: BotContext,
  i: ButtonInteraction | ChatInputCommandInteraction,
  roundId: string,
) {
  const res = await ctx.engine.turns.submitAction({
    roundId,
    userId: i.user.id,
    kind: "pass",
    interactionId: i.id,
  });
  await afterSubmit(ctx, i, roundId, res, "Your hero watches and waits.");
}

export async function freeformButton(i: ButtonInteraction, roundId: string) {
  await i.showModal(
    new ModalBuilder()
      .setCustomId(encodeId({ kind: "freeform-modal", roundId }))
      .setTitle("What does your hero do?")
      .addLabelComponents(
        new LabelBuilder()
          .setLabel("Your action")
          .setDescription("Describe it in your own words. Keep it in the story!")
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId("what")
              .setStyle(TextInputStyle.Paragraph)
              .setMaxLength(500)
              .setRequired(true),
          ),
      ),
  );
}

function slowDown(wait: number) {
  return `Whoa, lots of ideas! Take a breath and try again in ${wait} second${wait === 1 ? "" : "s"}.`;
}

export async function freeformSubmit(ctx: BotContext, i: ModalSubmitInteraction, roundId: string) {
  const wait = typedActions.take(i.user.id);
  if (wait > 0) return say(i, slowDown(wait));
  await i.deferReply({ flags: ["Ephemeral"] });
  const res = await ctx.engine.turns.submitAction({
    roundId,
    userId: i.user.id,
    kind: "freeform",
    text: i.fields.getTextInputValue("what"),
    interactionId: i.id,
  });
  await afterSubmit(ctx, i, roundId, res, "Got it!");
}

export async function actCommand(ctx: BotContext, i: ChatInputCommandInteraction) {
  const c = await campaignHere(ctx, i);
  const round = await ctx.engine.turns.currentRound(c.id);
  if (!round) throw new GameError("no round", "There's nothing to do right now. Wait for the next scene!");
  const wait = typedActions.take(i.user.id);
  if (wait > 0) return say(i, slowDown(wait));
  await i.deferReply({ flags: ["Ephemeral"] });
  const res = await ctx.engine.turns.submitAction({
    roundId: round.id,
    userId: i.user.id,
    kind: "freeform",
    text: i.options.getString("what", true),
    interactionId: i.id,
  });
  await afterSubmit(ctx, i, round.id, res, "Got it!");
}

export async function passCommand(ctx: BotContext, i: ChatInputCommandInteraction) {
  const c = await campaignHere(ctx, i);
  const round = await ctx.engine.turns.currentRound(c.id);
  if (!round) throw new GameError("no round", "There's nothing to do right now.");
  await passButton(ctx, i, round.id);
}

export async function resolveButton(ctx: BotContext, i: ButtonInteraction, roundId: string) {
  const round = await ctx.engine.turns.getRound(roundId);
  if (round?.status !== "collecting") return say(i, "That moment has already passed.");
  const allowed = await ctx.engine.campaigns.isHostOrDm(round.campaignId, i.user.id);
  const waiting = await ctx.engine.turns.waitingOn(roundId, round.campaignId);
  if (!allowed && waiting.length > 0)
    return say(
      i,
      `Only the host or DM can move on before everyone has chosen. Waiting on: ${waiting.map(esc).join(", ")}.`,
    );
  await say(i, "On with the story!");
  const ch = i.channel?.isSendable() ? i.channel : null;
  if (ch) await resolveAndPost(ctx, roundId, ch);
}

export async function rollCommand(i: ChatInputCommandInteraction) {
  const notation = i.options.getString("dice", true);
  try {
    const result = rollDice(parseDice(notation), createRng(`${i.id}:${notation}`));
    await i.reply({
      content: `🎲 **${esc(i.member && "displayName" in i.member ? String(i.member.displayName) : i.user.username)}** rolls ${formatDiceResult(result)}`,
      allowedMentions: { parse: [] },
    });
  } catch {
    throw new GameError("bad dice", "I couldn't read those dice. Try something like `1d20+3` or `2d6`.");
  }
}

export async function xcard(
  ctx: BotContext,
  i: ChatInputCommandInteraction | ButtonInteraction,
  campaignId?: string,
) {
  const c = campaignId ? await ctx.engine.campaigns.require(campaignId) : await campaignHere(ctx, i);
  await ctx.engine.turns.xcard(c.id, i.user.id);
  await say(i, "Thank you. The story will gently move somewhere else. Nobody knows who asked.");
  const ch = await sendableChannel(ctx, c.threadId);
  await ch?.send({
    content: "✋ Someone has asked the story to steer away from what's happening. Old Wick turns the page…",
    allowedMentions: { parse: [] },
  });
}

export async function mapView(
  ctx: BotContext,
  i: ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction,
  campaignId?: string,
) {
  const c = campaignId ? await ctx.engine.campaigns.require(campaignId) : await campaignHere(ctx, i);
  const state = await ctx.engine.campaigns.mapState(c.id);
  const focus = i.isStringSelectMenu() ? (i.values[0] === "all" ? null : (i.values[0] ?? null)) : null;
  const png = renderMap({
    map: state.world.map,
    regions: state.world.regions,
    states: state.states,
    partyRegionId: state.partyRegionId,
    trail: state.trail,
    focusRegionId: focus,
  });
  const file = new AttachmentBuilder(png, {
    name: "map.png",
    description: `Map of ${state.world.meta.name}`,
  });
  const known = state.world.regions.filter(
    (r) => state.states[r.id] === "visited" || state.states[r.id] === "discovered",
  );
  const container = new ContainerBuilder()
    .setAccentColor(COLORS.forest)
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL("attachment://map.png")),
    )
    .addTextDisplayComponents(
      text(
        `-# The party is in **${state.world.regions.find((r) => r.id === state.partyRegionId)?.name ?? "?"}**. Places marked "?" are only rumors so far.`,
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(encodeId({ kind: "map-focus", campaignId: c.id }))
          .setPlaceholder("Look closer at…")
          .addOptions(
            new StringSelectMenuOptionBuilder().setValue("all").setLabel("The whole map"),
            ...known.slice(0, 24).map((r) =>
              new StringSelectMenuOptionBuilder()
                .setValue(r.id)
                .setLabel(r.name)
                .setDefault(r.id === focus),
            ),
          ),
      ),
    );
  const payload = { components: [container], files: [file], flags: V2_EPHEMERAL } as never;
  if (i.isStringSelectMenu()) await i.update(payload);
  else await i.reply(payload);
}

export async function journal(ctx: BotContext, i: ChatInputCommandInteraction) {
  const c = await campaignHere(ctx, i);
  await i.reply(renderJournal(await ctx.engine.campaigns.journal(c.id)) as never);
}
