import { ABILITIES, ABILITY_KID_HINTS, ABILITY_NAMES, abilityModifier } from "@dq/core/rules";
import type { World } from "@dq/core/world";
import type { DraftView } from "@dq/engine";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { encodeId } from "../ids";
import { COLORS, clip, divider, esc, text, V2_EPHEMERAL } from "./common";

export const WIZARD_PAGES = ["Basics", "Abilities", "Skills & keepsake", "Name & review"] as const;

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

function select(campaignId: string, page: number, action: string, placeholder: string) {
  return new StringSelectMenuBuilder()
    .setCustomId(encodeId({ kind: "wizard", campaignId, page, action }))
    .setPlaceholder(placeholder);
}

function option(value: string, label: string, description: string | undefined, selected: boolean) {
  const o = new StringSelectMenuOptionBuilder()
    .setValue(value)
    .setLabel(clip(label, 100))
    .setDefault(selected);
  if (description) o.setDescription(clip(description, 100));
  return o;
}

function nav(campaignId: string, page: number, extra: ButtonBuilder[] = []) {
  const row = new ActionRowBuilder<ButtonBuilder>();
  row.addComponents(...extra);
  if (page > 0) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(encodeId({ kind: "wizard", campaignId, page, action: `page-${page - 1}` }))
        .setLabel("← Back")
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (page < WIZARD_PAGES.length - 1) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(encodeId({ kind: "wizard", campaignId, page, action: `page-${page + 1}` }))
        .setLabel(`Next: ${WIZARD_PAGES[page + 1]} →`)
        .setStyle(ButtonStyle.Primary),
    );
  }
  return row;
}

function header(page: number, draft: DraftView) {
  const steps = WIZARD_PAGES.map((p, i) => (i === page ? `**${p}**` : p)).join(" › ");
  const mode =
    draft.mode === "guided"
      ? "Guided: pick story choices and the stats follow."
      : "Advanced: spend points yourself.";
  return text(`## Make your hero\n-# ${steps}\n-# ${mode}`);
}

function abilityLine(draft: DraftView) {
  return ABILITIES.map(
    (a) => `**${a.toUpperCase()}** ${draft.final[a]} (${signed(abilityModifier(draft.final[a]))})`,
  ).join(" · ");
}

/** One page of the character wizard. The draft lives in the database, so the wizard survives restarts. */
export function renderWizard(world: World, campaignId: string, draft: DraftView, page: number) {
  const c = new ContainerBuilder().setAccentColor(COLORS.lantern);
  c.addTextDisplayComponents(header(page, draft));

  if (page === 0) {
    c.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(encodeId({ kind: "wizard", campaignId, page, action: "mode-guided" }))
          .setLabel("Guided (story choices)")
          .setEmoji("📖")
          .setStyle(draft.mode === "guided" ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(encodeId({ kind: "wizard", campaignId, page, action: "mode-advanced" }))
          .setLabel("Advanced (points)")
          .setEmoji("🔢")
          .setStyle(draft.mode === "advanced" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      ),
    );
    c.addTextDisplayComponents(text("**Class**: what kind of hero are you?"));
    c.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        select(campaignId, page, "class", "Choose a class").addOptions(
          world.classes.map((cl) => option(cl.id, cl.name, cl.tagline, draft.classId === cl.id)),
        ),
      ),
    );
    c.addTextDisplayComponents(text("**Path**: how does your hero get things done?"));
    c.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        select(campaignId, page, "path", "Choose a path").addOptions(
          world.paths.map((p) => option(p.id, p.name, p.tagline, draft.pathId === p.id)),
        ),
      ),
    );
    c.addTextDisplayComponents(text("**Background** and **people**"));
    c.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        select(campaignId, page, "background", "Where are you from?").addOptions(
          world.backgrounds.map((b) => option(b.id, b.name, b.description, draft.backgroundId === b.id)),
        ),
      ),
    );
    c.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        select(campaignId, page, "species", "Which people are you?").addOptions(
          world.species.map((s) => option(s.id, s.name, s.description, draft.speciesId === s.id)),
        ),
      ),
    );
    c.addActionRowComponents(nav(campaignId, page));
  }

  if (page === 1) {
    if (draft.mode === "guided") {
      c.addTextDisplayComponents(text(abilityLine(draft)));
      c.addTextDisplayComponents(text("**Where did you grow up?**"));
      c.addActionRowComponents(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          select(campaignId, page, "upbringing", "Pick your upbringing").addOptions(
            world.guided.upbringings.map((u) =>
              option(u.id, u.label, u.description, draft.upbringingId === u.id),
            ),
          ),
        ),
      );
    } else {
      c.addTextDisplayComponents(
        text(`**${draft.pointsRemaining} of 27 points left.** Scores start at 8 and go up to 15.`),
      );
      for (const a of ABILITIES) {
        c.addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(encodeId({ kind: "wizard", campaignId, page, action: `dec-${a}` }))
              .setLabel("−")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(!draft.canDecrement[a]),
            new ButtonBuilder()
              .setCustomId(encodeId({ kind: "wizard", campaignId, page, action: `info-${a}` }))
              .setLabel(
                clip(
                  `${ABILITY_NAMES[a]} ${draft.base[a]} → ${draft.final[a]} (${signed(abilityModifier(draft.final[a]))})`,
                  80,
                ),
              )
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId(encodeId({ kind: "wizard", campaignId, page, action: `inc-${a}` }))
              .setLabel("+")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(!draft.canIncrement[a]),
          ),
        );
      }
    }
    if (draft.formativeOptions.length > 0) {
      c.addActionRowComponents(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          select(
            campaignId,
            page,
            "formative",
            draft.mode === "guided" ? "What made you who you are?" : "Background bonus",
          ).addOptions(
            draft.formativeOptions.map((o) =>
              option(
                o.id,
                draft.mode === "guided" ? clip(o.description, 100) : o.label,
                draft.mode === "guided" ? o.label : o.description,
                o.selected,
              ),
            ),
          ),
        ),
      );
    } else {
      c.addTextDisplayComponents(
        text("-# Pick a background on the first page to choose your growing-up bonus."),
      );
    }
    c.addActionRowComponents(
      nav(campaignId, page, [
        new ButtonBuilder()
          .setCustomId(encodeId({ kind: "wizard", campaignId, page, action: "recommended" }))
          .setLabel("Pick for me")
          .setEmoji("✨")
          .setStyle(ButtonStyle.Success)
          .setDisabled(!draft.classId),
        ...(draft.mode === "advanced"
          ? [
              new ButtonBuilder()
                .setCustomId(encodeId({ kind: "wizard", campaignId, page, action: "reset" }))
                .setLabel("Reset")
                .setStyle(ButtonStyle.Danger),
            ]
          : []),
      ]),
    );
  }

  if (page === 2) {
    if (draft.skillCount > 0) {
      c.addTextDisplayComponents(
        text(`**Skills:** pick ${draft.skillCount} things your hero is especially good at.`),
      );
      c.addActionRowComponents(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          select(campaignId, page, "skills", `Pick ${draft.skillCount} skills`)
            .setMinValues(draft.skillCount)
            .setMaxValues(draft.skillCount)
            .addOptions(draft.skillOptions.map((s) => option(s.id, s.name, undefined, s.selected))),
        ),
      );
    } else {
      c.addTextDisplayComponents(text("-# Pick a class on the first page to see your skill choices."));
    }
    c.addTextDisplayComponents(text("**Keepsake:** something small from home that you always carry."));
    c.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        select(campaignId, page, "keepsake", "Choose a keepsake").addOptions(
          draft.keepsakeOptions
            .slice(0, 25)
            .map((k) => option(k.id, k.name, k.description, draft.keepsakeId === k.id)),
        ),
      ),
    );
    c.addActionRowComponents(nav(campaignId, page));
  }

  if (page === 3) {
    const cls = world.classes.find((x) => x.id === draft.classId);
    const path = world.paths.find((x) => x.id === draft.pathId);
    const bg = world.backgrounds.find((x) => x.id === draft.backgroundId);
    const sp = world.species.find((x) => x.id === draft.speciesId);
    const keep = draft.keepsakeOptions.find((k) => k.id === draft.keepsakeId);
    c.addTextDisplayComponents(
      text(
        [
          `**${draft.name ? esc(draft.name) : "(no name yet)"}**${draft.look ? ` · ${esc(draft.look)}` : ""}`,
          `${cls?.name ?? "?"} · ${path?.name ?? "?"} · ${bg?.name ?? "?"} · ${sp?.name ?? "?"}`,
          abilityLine(draft),
          `**Skills:** ${
            draft.skillOptions
              .filter((s) => s.selected)
              .map((s) => s.name)
              .join(", ") || "?"
          }`,
          `**Keepsake:** ${keep?.name ?? "?"}`,
          draft.preview ? `❤️ ${draft.preview.hpMax} hit points · 🛡️ Armor ${draft.preview.armorClass}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    );
    if (draft.missing.length > 0)
      c.addTextDisplayComponents(text(`-# Still needed: ${draft.missing.join(", ")}`));
    c.addSeparatorComponents(divider());
    c.addActionRowComponents(
      nav(campaignId, page, [
        new ButtonBuilder()
          .setCustomId(encodeId({ kind: "wizard-name", campaignId }))
          .setLabel(draft.name ? "Change name" : "Name your hero")
          .setEmoji("✏️")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(encodeId({ kind: "wizard", campaignId, page, action: "finish" }))
          .setLabel("Ready for adventure!")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Success)
          .setDisabled(draft.missing.length > 0),
      ]),
    );
  }
  return { components: [c], flags: V2_EPHEMERAL };
}

export function nameModal(campaignId: string, draft: DraftView) {
  return new ModalBuilder()
    .setCustomId(encodeId({ kind: "wizard-name", campaignId }))
    .setTitle("Name your hero")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Hero name")
        .setDescription("Pick a fantasy name, not your real one.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("name")
            .setStyle(TextInputStyle.Short)
            .setMinLength(2)
            .setMaxLength(32)
            .setRequired(true)
            .setValue(draft.name || ""),
        ),
      new LabelBuilder()
        .setLabel("What do they look like?")
        .setDescription("Optional. A sentence or two.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("look")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(200)
            .setRequired(false)
            .setValue(draft.look || ""),
        ),
    );
}

export function abilityHelp(): string {
  return ABILITIES.map((a) => `**${ABILITY_NAMES[a]}**: ${ABILITY_KID_HINTS[a]}`).join("\n");
}
