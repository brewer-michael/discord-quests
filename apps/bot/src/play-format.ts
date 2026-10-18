/**
 * Plain text for `pnpm play`: what the table and the DM room would see in Discord, as lines in a terminal (or
 * a Markdown transcript). No Discord types: everything here works from the engine's own views.
 */
import type { ChosenAction } from "@dq/core/combat";
import type { CharacterSheetView, DmDraft, RollView, TurnView } from "@dq/engine";

const bar = (share: number, width = 10) => {
  const full = Math.max(0, Math.min(width, Math.round(share * width)));
  return `${"█".repeat(full)}${"░".repeat(width - full)}`;
};

const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export function formatRoll(r: RollView): string {
  const dice = r.rolls.length > 1 ? `${r.rolls.join(", ")} (${r.mode}), took ${r.natural}` : `${r.natural}`;
  const result = r.success ? "✓" : r.graze ? "~ graze" : "✗";
  const extra = [
    r.damage !== undefined ? `${r.damage} damage` : null,
    r.rerolled ? `Courage rerolled ${r.rerolled.join(", ")}` : null,
  ].filter(Boolean);
  return `🎲 ${r.characterName}, ${r.label}: ${dice} ${sign(r.modifier)} = ${r.total} vs ${r.difficulty} ${result}${extra.length ? ` (${extra.join(", ")})` : ""}`;
}

/** A turn as the table sees it: the scene when it changes, the story, the voices, the dice and what's next. */
export function formatTurn(view: TurnView): string {
  const lines: string[] = [];
  if (view.sceneChanged) lines.push("", `═══ ${view.sceneTitle} · ${view.locationName} ═══`);
  lines.push("", view.narration);
  for (const v of view.npcLines) lines.push(`  ${v.name}: “${v.line}”`);
  if (view.rolls.length > 0) lines.push("", ...view.rolls.map(formatRoll));
  for (const l of view.levelUps) lines.push(`⭐ ${l.name} can reach level ${l.toLevel}.`);
  if (view.combat) lines.push("", ...formatCombat(view.combat));
  if (view.campaignEnded) lines.push("", "— The End —");
  else if (view.choices.length > 0)
    lines.push("", "What do you do?", ...view.choices.map((c) => `  ${c.index + 1}) ${c.label}`));
  return lines.join("\n");
}

export function formatCombat(combat: NonNullable<TurnView["combat"]>): string[] {
  const lines = [
    `⚔️ Battle, round ${combat.round + 1}${combat.phase === "fighting" ? "" : ` (${combat.phase})`}`,
  ];
  for (const f of combat.foes) lines.push(`  ${f.name.padEnd(18)} ${bar(f.health)} ${f.condition}`);
  for (const h of combat.heroes)
    lines.push(
      `  ${h.name.padEnd(18)} ${h.hp}/${h.hpMax} hp${h.down ? ", down" : ""}${h.courage ? ", ✨ Courage" : ""}`,
    );
  for (const l of combat.log.slice(-6)) lines.push(`  · ${l}`);
  return lines;
}

/** What the DM room sees: an Assist draft, or a turn the storyteller couldn't tell, with what's settled. */
export function formatDraft(d: DmDraft): string {
  const lines = [
    "",
    `┌─ DM room: ${d.handoff ? "the storyteller couldn't tell this turn" : "draft"} · ${d.sceneTitle}`,
  ];
  if (d.handoff) {
    lines.push("│ Why:", ...d.handoff.reasons.map((r) => `│   - ${r}`));
    lines.push(`│ Scene: ${d.handoff.scene.title}: ${d.handoff.scene.summary}`);
    if (d.handoff.scene.goals.length) lines.push(`│   Goals: ${d.handoff.scene.goals.join("; ")}`);
    if (d.handoff.next) lines.push(`│ Then: ${d.handoff.next.title}: ${d.handoff.next.summary}`);
    if (d.handoff.decisions.length) lines.push("│ Settled:", ...d.handoff.decisions.map((x) => `│   - ${x}`));
  }
  if (d.actions.length) lines.push("│ What the heroes did:", ...d.actions.map((a) => `│   - ${a}`));
  if (d.rolls.length) lines.push(...d.rolls.map((r) => `│ ${formatRoll(r)}`));
  if (d.dmNotes.length) lines.push("│ Hidden hand (DM only):", ...d.dmNotes.map((n) => `│   - ${n}`));
  if (d.narration) lines.push("│ Draft:", ...d.narration.split("\n").map((l) => `│   ${l}`));
  for (const v of d.npcLines) lines.push(`│   ${v}`);
  if (d.choices.length) lines.push("│ Choices:", ...d.choices.map((c, i) => `│   ${i + 1}) ${c}`));
  lines.push("└─");
  return lines.join("\n");
}

export function formatSheet(s: CharacterSheetView): string {
  const abilities = Object.entries(s.abilities)
    .map(([k, v]) => `${k.toUpperCase()} ${v.score} (${sign(v.modifier)})`)
    .join("  ");
  return [
    `${s.name}: level ${s.level} ${s.speciesName} ${s.className}, ${s.pathName}`,
    `  ${s.hp}/${s.hpMax} hp · armor ${s.armorClass} · ${s.gold} gold${s.conditions.length ? ` · ${s.conditions.join(", ")}` : ""}`,
    `  ${abilities}`,
    `  Pack: ${s.inventory.map((i) => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name)).join(", ") || "empty"}`,
  ].join("\n");
}

export function formatJournal(j: {
  quests: Array<{ title: string; objective: string; status: string }>;
  promises: Array<{ to: string; text: string; status: string }>;
  chapters: Array<{ chapter: number; text: string }>;
}): string {
  if (j.chapters.length + j.quests.length + j.promises.length === 0) return "Journal: nothing written yet.";
  return [
    "Journal",
    ...j.chapters.map((c) => `  Chapter ${c.chapter}: ${c.text}`),
    ...(j.quests.length
      ? ["  Quests:", ...j.quests.map((q) => `    - ${q.title} (${q.status}): ${q.objective}`)]
      : []),
    ...(j.promises.length
      ? ["  Promises:", ...j.promises.map((p) => `    - to ${p.to}: “${p.text}” (${p.status})`)]
      : []),
  ].join("\n");
}

export interface BattleOptions {
  down: boolean;
  attacks: Array<{ id: string; name: string; ranged: boolean }>;
  spells: Array<{ id: string; name: string; level: number; target: string; available: boolean }>;
  potions: Array<{ itemId: string; name: string; qty: number }>;
  foes: Array<{ id: string; name: string; condition: string }>;
  atMercy: Array<{ id: string; name: string }>;
  allies: Array<{ id: string; name: string; hp: number; hpMax: number }>;
}

/** Every battle action open to a hero, numbered the way `pnpm play` offers them. */
export function battleChoices(
  o: BattleOptions,
  heroName: string,
): Array<{ label: string; action: ChosenAction }> {
  const out: Array<{ label: string; action: ChosenAction }> = [];
  const attack = o.attacks[0];
  for (const f of o.foes)
    out.push({
      label: `Attack ${f.name} (${f.condition})${attack ? ` with ${attack.name}` : ""}`,
      action: { kind: "attack", targetId: f.id, ...(attack ? { attackId: attack.id } : {}) },
    });
  for (const s of o.spells.filter((x) => x.available)) {
    if (s.target === "self") out.push({ label: `Cast ${s.name}`, action: { kind: "cast", spellId: s.id } });
    else
      for (const t of s.target === "ally" ? o.allies : o.foes)
        out.push({
          label: `Cast ${s.name} on ${t.name}`,
          action: { kind: "cast", spellId: s.id, targetId: t.id },
        });
  }
  out.push({ label: "Defend", action: { kind: "defend" } });
  for (const a of o.allies.filter((x) => x.name !== heroName))
    out.push({ label: `Help ${a.name}`, action: { kind: "help", targetId: a.id } });
  for (const p of o.potions) {
    const who = o.allies.find((a) => a.name === heroName) ?? o.allies[0];
    if (who)
      out.push({
        label: `Drink ${p.name} (${p.qty} left)`,
        action: { kind: "item", itemId: p.itemId, targetId: who.id },
      });
  }
  for (const f of o.atMercy)
    out.push({ label: `Spare ${f.name}`, action: { kind: "spare", targetId: f.id } });
  return out;
}
