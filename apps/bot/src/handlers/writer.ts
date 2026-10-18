/** The Try again button on a story-writer job that was given up on. Host, DM or guardian only. */
import { GameError } from "@dq/engine";
import type { ButtonInteraction } from "discord.js";
import type { BotContext } from "../context";
import type { CustomId } from "../ids";
import { notice } from "../render/common";

export async function writerRetryInteraction(
  ctx: BotContext,
  i: ButtonInteraction,
  id: Extract<CustomId, { kind: "writer-retry" }>,
) {
  try {
    const { message } = await ctx.engine.turns.retryStoryJob(id.jobId, i.user.id);
    await i.reply(notice(message));
  } catch (e) {
    await i
      .reply(notice(e instanceof GameError ? e.userMessage : "I couldn't do that just now."))
      .catch(() => {});
  }
}
