import { GameError } from "@dq/engine";
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from "discord.js";
import type { BotContext } from "../context";
import { sendableChannel } from "../flows";
import { notice } from "../render/common";
import { renderHub } from "../render/hub";

export type AnyInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | StringSelectMenuInteraction
  | ModalSubmitInteraction;

/** Replies (or follows up) with a small private message. */
export async function say(i: AnyInteraction, message: string) {
  const payload = notice(message);
  if (i.replied || i.deferred) await i.followUp(payload as never);
  else await i.reply(payload as never);
}

export async function campaignHere(ctx: BotContext, i: AnyInteraction) {
  const c = i.channelId ? await ctx.engine.campaigns.findByThread(i.channelId) : null;
  if (!c)
    throw new GameError(
      "not a campaign thread",
      "Use this inside a campaign's thread. Start one with `/campaign new`.",
    );
  return c;
}

export function friendly(e: unknown): string {
  if (e instanceof GameError) return e.userMessage;
  return "Something went wrong on our side. Please try again in a moment.";
}

/** Rebuilds the pinned welcome message with the current heroes and status. */
export async function refreshHub(ctx: BotContext, campaignId: string) {
  const status = await ctx.engine.campaigns.status(campaignId);
  const c = status.campaign;
  const settings = c.settings as Record<string, unknown>;
  const hubId = settings.hubMessageId as string | undefined;
  const ch = await sendableChannel(ctx, c.threadId);
  if (!hubId || !ch) return;
  const { index } = ctx.worlds.get(c.worldId);
  const msg = await ch.messages.fetch(hubId).catch(() => null);
  await msg
    ?.edit(
      renderHub({
        campaignId: c.id,
        name: c.name,
        worldName: index.world.meta.name,
        tagline: index.world.meta.tagline,
        mode: c.mode,
        dmUserId: c.dmUserId,
        status: c.status,
        audience: (settings.audience as "family" | "teen") ?? "family",
        heroes: status.party,
        pace: status.pace,
        story: status.story,
      }) as never,
    )
    .catch(() => {});
}
