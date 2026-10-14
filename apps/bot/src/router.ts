import type { Interaction } from "discord.js";
import type { BotContext } from "./context";
import { campaignCommand, campaignJoin, campaignStart } from "./handlers/campaign";
import {
  characterCommand,
  levelUpInteraction,
  openWizard,
  wizardInteraction,
  wizardNameButton,
  wizardNameSubmit,
} from "./handlers/character";
import { approvalButton, approvalModal, dmCommand, loomCommand } from "./handlers/dm";
import {
  actCommand,
  choiceButton,
  freeformButton,
  freeformSubmit,
  journal,
  mapView,
  passButton,
  passCommand,
  resolveButton,
  rollCommand,
  xcard,
} from "./handlers/play";
import { friendly, say } from "./handlers/shared";
import { decodeId } from "./ids";
import { renderAbout, renderHelp, renderPrivacy } from "./render/misc";
import { renderSheet } from "./render/sheet";

/** Sends every interaction to its handler and turns errors into friendly messages. */
export async function route(ctx: BotContext, i: Interaction): Promise<void> {
  if (!i.isRepliable()) return;
  try {
    if (i.isChatInputCommand()) {
      switch (i.commandName) {
        case "campaign":
          return await campaignCommand(ctx, i);
        case "character":
          return await characterCommand(ctx, i);
        case "act":
          return await actCommand(ctx, i);
        case "pass":
          return await passCommand(ctx, i);
        case "roll":
          return await rollCommand(i);
        case "map":
          return await mapView(ctx, i);
        case "journal":
          return await journal(ctx, i);
        case "xcard":
          return await xcard(ctx, i);
        case "setup":
          return await setup(ctx, i);
        case "dm":
          return await dmCommand(ctx, i);
        case "loom":
          return await loomCommand(ctx, i);
        case "help":
          return void (await i.reply(renderHelp() as never));
        case "about":
          return void (await i.reply(renderAbout() as never));
        case "privacy":
          return void (await i.reply(renderPrivacy() as never));
      }
      return;
    }
    if (!(i.isButton() || i.isStringSelectMenu() || i.isModalSubmit())) return;
    const id = decodeId(i.customId);
    if (!id) return;
    switch (id.kind) {
      case "choice":
        if (i.isButton()) await choiceButton(ctx, i, id.roundId, id.index);
        return;
      case "pass":
        if (i.isButton()) await passButton(ctx, i, id.roundId);
        return;
      case "freeform":
        if (i.isButton()) await freeformButton(i, id.roundId);
        return;
      case "freeform-modal":
        if (i.isModalSubmit()) await freeformSubmit(ctx, i, id.roundId);
        return;
      case "resolve":
        if (i.isButton()) await resolveButton(ctx, i, id.roundId);
        return;
      case "join":
        if (i.isButton()) await campaignJoin(ctx, i, id.campaignId);
        return;
      case "start":
        if (i.isButton()) await campaignStart(ctx, i, id.campaignId);
        return;
      case "create":
        if (i.isButton()) await openWizard(ctx, i, id.campaignId);
        return;
      case "sheet": {
        const hero = await ctx.engine.characters.characterFor(id.campaignId, i.user.id);
        if (!hero)
          return void (await say(
            i,
            "You don't have a hero here yet. Press **Make my hero** in the campaign thread.",
          ));
        return void (await i.reply(renderSheet(await ctx.engine.characters.sheet(hero.id)) as never));
      }
      case "map":
      case "map-focus":
        if (i.isButton() || i.isStringSelectMenu()) await mapView(ctx, i, id.campaignId);
        return;
      case "xcard":
        if (i.isButton()) await xcard(ctx, i, id.campaignId);
        return;
      case "wizard":
        if (i.isButton() || i.isStringSelectMenu()) await wizardInteraction(ctx, i, id);
        return;
      case "wizard-name":
        if (i.isButton()) await wizardNameButton(ctx, i, id.campaignId);
        else if (i.isModalSubmit()) await wizardNameSubmit(ctx, i, id.campaignId);
        return;
      case "levelup":
        if (i.isButton() || i.isStringSelectMenu()) await levelUpInteraction(ctx, i, id.characterId);
        return;
      case "approval":
        if (i.isButton()) await approvalButton(ctx, i, id.approvalId, id.action);
        return;
      case "approval-modal":
        if (i.isModalSubmit()) await approvalModal(ctx, i, id.approvalId, id.action);
        return;
    }
  } catch (e) {
    ctx.log.error("interaction failed", {
      error: (e as Error).message,
      stack: (e as Error).stack?.split("\n").slice(0, 4).join(" | "),
    });
    await say(i as never, friendly(e)).catch(() => {});
  }
}

async function setup(ctx: BotContext, i: import("discord.js").ChatInputCommandInteraction) {
  const base = ctx.env.WEB_BASE_URL;
  const defaults = [
    ctx.env.ANTHROPIC_API_KEY ? "Claude" : null,
    ctx.env.OPENAI_API_KEY ? "OpenAI" : null,
    ctx.env.GEMINI_API_KEY ? "Gemini" : null,
  ].filter(Boolean);
  await say(
    i,
    [
      "## Setting up Discord Quests",
      base
        ? `Choose story and image providers, add API keys, and set budgets on the setup page: ${base}/servers/${i.guildId}`
        : "The setup page isn't configured on this bot yet (WEB_BASE_URL).",
      defaults.length > 0
        ? `Until then, this bot's server defaults are used: ${defaults.join(", ")}.`
        : "No server-default providers are configured, so the story will be told by the engine alone until providers are set up.",
    ].join("\n"),
  );
}
