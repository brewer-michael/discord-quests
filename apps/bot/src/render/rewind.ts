/**
 * The DM tools card, shown only in the DM room: the turns the story can go back to (with how the party stood
 * after each), a confirm step, two fixes that work without a restore point (mend the party, and rebuild the
 * fight in progress), and the table's fight rules.
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { encodeId, type RewindAction } from "../ids";
import { COLORS, clip, divider, esc, text, V2 } from "./common";

export interface RewindInfo {
  campaignId: string;
  campaignName: string;
  turnSeq: number;
  fighting: boolean;
  /** Whether the new fight rules are on: partial hits and the defense mix. */
  partialHits: boolean;
  party: Array<{ name: string; hp: number; hpMax: number }>;
  points: Array<{
    turnSeq: number;
    turnsBack: number;
    sceneTitle: string;
    fighting: boolean;
    battleRound: number;
    party: Array<{ name: string; hp: number; hpMax: number }>;
  }>;
}

const hp = (party: RewindInfo["party"]) => party.map((h) => `${h.name} ${h.hp}/${h.hpMax}`).join(" · ");

const button = (campaignId: string, action: RewindAction, seq?: number) =>
  new ButtonBuilder().setCustomId(
    encodeId({ kind: "rewind", campaignId, action, ...(seq !== undefined ? { seq } : {}) }),
  );

function where(p: RewindInfo["points"][number]): string {
  const back = p.turnsBack === 1 ? "1 turn back" : `${p.turnsBack} turns back`;
  return `${back} · ${p.sceneTitle}${p.fighting ? ` (battle, round ${p.battleRound + 1})` : ""}`;
}

export function renderRewindCard(info: RewindInfo, problem?: string) {
  const c = new ContainerBuilder().setAccentColor(COLORS.dusk);
  c.addTextDisplayComponents(
    text(
      `## 🛠️ DM tools: ${esc(info.campaignName)}\n**⏪ Rewind** puts the party, their packs, the scene and the choices back as they were after an earlier turn.\n-# The turns after it are kept in the history, marked as undone, and the storyteller forgets them.`,
    ),
  );
  if (problem) c.addTextDisplayComponents(text(`⚠️ ${problem}`));
  c.addTextDisplayComponents(text(`**Now:** ${esc(hp(info.party)) || "no heroes"}`));
  if (info.points.length > 0) {
    c.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(encodeId({ kind: "rewind", campaignId: info.campaignId, action: "pick" }))
          .setPlaceholder("Go back to…")
          .addOptions(
            info.points.map((p) =>
              new StringSelectMenuOptionBuilder()
                .setValue(String(p.turnSeq))
                .setLabel(clip(where(p), 100))
                .setDescription(clip(hp(p.party) || "no heroes yet", 100)),
            ),
          ),
      ),
    );
  } else {
    c.addTextDisplayComponents(
      text(
        "-# No restore points yet. They're saved from the first turn played after this update, so for turns before that use the fixes below.",
      ),
    );
  }
  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(
    text(
      "**Fixes that work any time:** mend the party (everyone back to full health, conditions cleared, spells rested)" +
        (info.fighting ? ", or rebuild the fight going on now, sized for the party as it stands." : "."),
    ),
  );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    button(info.campaignId, "mend").setLabel("Mend the party").setEmoji("🌿").setStyle(ButtonStyle.Secondary),
  );
  if (info.fighting)
    row.addComponents(
      button(info.campaignId, "rebuild")
        .setLabel("Rebuild this fight")
        .setEmoji("⚔️")
        .setStyle(ButtonStyle.Secondary),
    );
  c.addActionRowComponents(row);
  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(
    text(
      info.partialHits
        ? "**⚔️ Fight rules: new.** A near miss grazes, a miss earns ✨ Courage for a second try, and every foe has a weak spot. What a hero tries in their own words (shoving it, tricking it, scaring it) is matched against how sturdy, quick or brave that foe is."
        : "**⚔️ Fight rules: standard.** As in the SRD: a miss is a miss, and armor is a foe's only defense. The new rules add grazes, ✨ Courage, and weak spots that heroes' own ideas can find.",
    ),
  );
  c.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      info.partialHits
        ? button(info.campaignId, "graze-off")
            .setLabel("Back to standard rules")
            .setStyle(ButtonStyle.Secondary)
        : button(info.campaignId, "graze-on")
            .setLabel("Turn on the new fight rules")
            .setEmoji("✨")
            .setStyle(ButtonStyle.Primary),
      button(info.campaignId, "cancel").setLabel("Never mind").setStyle(ButtonStyle.Secondary),
    ),
  );
  return { components: [c], flags: V2, allowedMentions: { parse: [] as never[] } };
}

export function renderRewindConfirm(info: RewindInfo, seq: number) {
  const p = info.points.find((x) => x.turnSeq === seq);
  const c = new ContainerBuilder().setAccentColor(COLORS.crux);
  c.addTextDisplayComponents(
    text(
      p
        ? `## ⏪ Go back ${p.turnsBack === 1 ? "1 turn" : `${p.turnsBack} turns`}?\nTo: **${esc(p.sceneTitle)}**${p.fighting ? ` (battle, round ${p.battleRound + 1})` : ""}\n**The party then:** ${esc(hp(p.party))}\n**The party now:** ${esc(hp(info.party))}\n-# The players see the story pick up from there.`
        : "That turn can't be rewound to any more.",
    ),
  );
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (p)
    row.addComponents(
      button(info.campaignId, "go", seq).setLabel("Rewind").setEmoji("⏪").setStyle(ButtonStyle.Danger),
    );
  row.addComponents(button(info.campaignId, "back").setLabel("Back").setStyle(ButtonStyle.Secondary));
  c.addActionRowComponents(row);
  return { components: [c], flags: V2, allowedMentions: { parse: [] as never[] } };
}

export function renderRewindDone(message: string) {
  const c = new ContainerBuilder().setAccentColor(COLORS.forest).addTextDisplayComponents(text(message));
  return { components: [c], flags: V2, allowedMentions: { parse: [] as never[] } };
}
