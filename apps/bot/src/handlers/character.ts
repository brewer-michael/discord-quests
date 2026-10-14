import type { Ability } from "@dq/core/rules";
import { type DraftOp, GameError } from "@dq/engine";
import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  type ChatInputCommandInteraction,
  ContainerBuilder,
  type ModalSubmitInteraction,
  StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import type { BotContext } from "../context";
import { sendableChannel } from "../flows";
import { encodeId } from "../ids";
import { COLORS, esc, text, V2_EPHEMERAL } from "../render/common";
import { renderSheet } from "../render/sheet";
import { nameModal, renderWizard } from "../render/wizard";
import { campaignHere, refreshHub, say } from "./shared";

export async function openWizard(
  ctx: BotContext,
  i: ChatInputCommandInteraction | ButtonInteraction,
  campaignId?: string,
) {
  const c = campaignId ? await ctx.engine.campaigns.require(campaignId) : await campaignHere(ctx, i);
  await ctx.engine.campaigns.join(c.id, i.user.id);
  const existing = await ctx.engine.characters.characterFor(c.id, i.user.id);
  if (existing) {
    await i.reply(renderSheet(await ctx.engine.characters.sheet(existing.id)) as never);
    return;
  }
  const draft = await ctx.engine.characters.startDraft(c.id, i.user.id);
  const { index } = ctx.worlds.get(c.worldId);
  await i.reply(renderWizard(index.world, c.id, draft, 0) as never);
}

function opFor(action: string, values: readonly string[]): DraftOp | { page: number } | "finish" | null {
  if (action.startsWith("page-")) return { page: Number(action.slice(5)) };
  if (action === "mode-guided") return { op: "mode", mode: "guided" };
  if (action === "mode-advanced") return { op: "mode", mode: "advanced" };
  if (action === "recommended") return { op: "recommended" };
  if (action === "reset") return { op: "reset-abilities" };
  if (action === "finish") return "finish";
  if (action.startsWith("inc-")) return { op: "ability", ability: action.slice(4) as Ability, delta: 1 };
  if (action.startsWith("dec-")) return { op: "ability", ability: action.slice(4) as Ability, delta: -1 };
  const v = values[0] ?? "";
  switch (action) {
    case "class":
      return { op: "class", classId: v };
    case "path":
      return { op: "path", pathId: v };
    case "background":
      return { op: "background", backgroundId: v };
    case "species":
      return { op: "species", speciesId: v };
    case "upbringing":
      return { op: "upbringing", upbringingId: v };
    case "formative":
      return { op: "formative", optionId: v };
    case "keepsake":
      return { op: "keepsake", keepsakeId: v };
    case "skills":
      return { op: "skills", skills: [...values] };
  }
  return null;
}

export async function wizardInteraction(
  ctx: BotContext,
  i: ButtonInteraction | StringSelectMenuInteraction,
  id: { campaignId: string; page: number; action: string },
) {
  const c = await ctx.engine.campaigns.require(id.campaignId);
  const { index } = ctx.worlds.get(c.worldId);
  const values = i.isStringSelectMenu() ? i.values : [];
  const op = opFor(id.action, values);
  if (!op) return;
  if (op === "finish") {
    const sheet = await ctx.engine.characters.finalize(c.id, i.user.id);
    await i.update({
      components: [
        new ContainerBuilder()
          .setAccentColor(COLORS.forest)
          .addTextDisplayComponents(
            text(
              `## ${esc(sheet.name)} is ready!\nYour hero waits for the adventure to begin. Use \`/character sheet\` any time to see them.`,
            ),
          ),
      ],
      flags: V2_EPHEMERAL,
    } as never);
    const ch = await sendableChannel(ctx, c.threadId);
    await ch?.send({
      content: `🧙 **${esc(sheet.name)}** joins the party: a level ${sheet.level} ${sheet.speciesName} ${sheet.className} on *${sheet.pathName}*.`,
      allowedMentions: { parse: [] },
    });
    await refreshHub(ctx, c.id);
    return;
  }
  let page = id.page;
  let draft: Awaited<ReturnType<typeof ctx.engine.characters.updateDraft>> | null;
  if ("page" in op) {
    page = Math.max(0, Math.min(3, op.page));
    draft = await ctx.engine.characters.getDraft(c.id, i.user.id);
  } else {
    draft = await ctx.engine.characters.updateDraft(c.id, i.user.id, op as DraftOp);
  }
  if (!draft) throw new GameError("no draft", "Start your hero again with `/character create`.");
  await i.update(renderWizard(index.world, c.id, draft, page) as never);
}

export async function wizardNameButton(ctx: BotContext, i: ButtonInteraction, campaignId: string) {
  const draft = await ctx.engine.characters.getDraft(campaignId, i.user.id);
  if (!draft) throw new GameError("no draft", "Start your hero again with `/character create`.");
  await i.showModal(nameModal(campaignId, draft));
}

export async function wizardNameSubmit(ctx: BotContext, i: ModalSubmitInteraction, campaignId: string) {
  const c = await ctx.engine.campaigns.require(campaignId);
  const { index } = ctx.worlds.get(c.worldId);
  const draft = await ctx.engine.characters.updateDraft(c.id, i.user.id, {
    op: "name",
    name: i.fields.getTextInputValue("name"),
    look: i.fields.getTextInputValue("look") ?? "",
  });
  if (i.isFromMessage()) await i.update(renderWizard(index.world, c.id, draft, 3) as never);
  else await i.reply(renderWizard(index.world, c.id, draft, 3) as never);
}

export async function characterCommand(ctx: BotContext, i: ChatInputCommandInteraction) {
  const sub = i.options.getSubcommand();
  if (sub === "create") return openWizard(ctx, i);
  const c = await campaignHere(ctx, i);
  const hero = await ctx.engine.characters.characterFor(c.id, i.user.id);
  if (!hero) throw new GameError("no hero", "You don't have a hero here yet. Use `/character create`.");
  if (sub === "sheet") {
    await i.reply(renderSheet(await ctx.engine.characters.sheet(hero.id)) as never);
    return;
  }
  if (sub === "levelup") {
    const info = await ctx.engine.characters.levelUpInfo(hero.id);
    if (!info.preview) {
      await say(i, "Your hero isn't ready to level up yet. Heroes grow at the big moments of the story.");
      return;
    }
    const container = new ContainerBuilder().setAccentColor(COLORS.lantern);
    container.addTextDisplayComponents(
      text(
        `## Level ${info.preview.toLevel}!\n${info.preview.newFeatures.map((f) => `- **${f.name}**: ${f.summary}`).join("\n") || "- More hit points and more experience."}`,
      ),
    );
    if (info.preview.abilityScoreImprovement) {
      container.addTextDisplayComponents(text("**How has your hero grown?**"));
      const options = info.asiOptions.map((o) =>
        new StringSelectMenuOptionBuilder()
          .setValue(o.id)
          .setLabel(o.label.slice(0, 100))
          .setDescription(
            Object.entries(o.increments)
              .map(([a, n]) => `${a.toUpperCase()} +${n}`)
              .join(", "),
          ),
      );
      container.addActionRowComponents(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(encodeId({ kind: "levelup", characterId: hero.id }))
            .setPlaceholder("Choose how you grew")
            .addOptions(options),
        ),
      );
    } else {
      container.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(encodeId({ kind: "levelup", characterId: hero.id }))
            .setLabel("Level up!")
            .setEmoji("🎉")
            .setStyle(ButtonStyle.Success),
        ),
      );
    }
    await i.reply({ components: [container], flags: V2_EPHEMERAL } as never);
  }
}

export async function levelUpInteraction(
  ctx: BotContext,
  i: ButtonInteraction | StringSelectMenuInteraction,
  characterId: string,
) {
  const choice = i.isStringSelectMenu() ? { asiOptionId: i.values[0] as string } : {};
  const { sheet } = await ctx.engine.characters.levelUp(characterId, i.user.id, choice);
  await i.update(renderSheet(sheet) as never);
}
