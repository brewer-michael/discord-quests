import type { CharacterSheetView } from "@dq/engine";
import { ContainerBuilder } from "discord.js";
import { COLORS, divider, esc, text, V2_EPHEMERAL } from "./common";

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export function renderSheet(s: CharacterSheetView) {
  const c = new ContainerBuilder().setAccentColor(COLORS.lantern);
  c.addTextDisplayComponents(
    text(
      `## ${esc(s.name)}\n**Level ${s.level} ${s.className}** · ${s.speciesName} · ${s.backgroundName} · *${s.pathName}*${s.look ? `\n-# ${esc(s.look)}` : ""}`,
    ),
  );
  c.addTextDisplayComponents(
    text(
      `❤️ **${s.hp}/${s.hpMax}** hit points · 🛡️ Armor ${s.armorClass} · 👣 Speed ${s.speed} ft · ⭐ Proficiency ${signed(s.proficiencyBonus)}${
        s.conditions.length ? `\n⚠️ ${s.conditions.join(", ")}` : ""
      }${s.pendingLevelUp ? "\n🎉 **Ready to level up!** Use `/character levelup`." : ""}`,
    ),
  );
  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(
    text(
      Object.entries(s.abilities)
        .map(([name, a]) => `**${name.slice(0, 3).toUpperCase()}** ${a.score} (${signed(a.modifier)})`)
        .join(" · "),
    ),
  );
  const trained = s.skills.filter((k) => k.proficient || k.expertise);
  c.addTextDisplayComponents(
    text(
      `**Skills:** ${trained.map((k) => `${k.name} ${signed(k.modifier)}${k.expertise ? "★" : ""}`).join(", ") || "none yet"}`,
    ),
  );
  if (s.spellSlots.length > 0)
    c.addTextDisplayComponents(
      text(`**Spell slots:** ${s.spellSlots.map((n, i) => `L${i + 1}×${n}`).join(" ")}`),
    );
  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(
    text(
      `**Gear:** ${s.inventory.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ""}${i.equipped ? " (equipped)" : ""}`).join(", ")}\n**Gold:** ${s.gold}${
        s.keepsake ? `\n**Keepsake:** ${s.keepsake}` : ""
      }`,
    ),
  );
  c.addTextDisplayComponents(text(`**Path perks:**\n${s.perks.map((p) => `- ${p}`).join("\n")}`));
  c.addTextDisplayComponents(text(`-# ${s.features.slice(-4).join(" · ")}`));
  return { components: [c], flags: V2_EPHEMERAL };
}
