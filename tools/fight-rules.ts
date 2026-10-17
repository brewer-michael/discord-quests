/**
 * Plays the research report's three fights through the real combat engine, with and without partial hits, and
 * prints how often hero turns come to nothing: `pnpm fight-rules [fights per row]`.
 *
 * Heroes are fighters with a longsword who attack every turn, as in the report's sim/fights.py, but everything else
 * is the engine's own: initiative, the foes' multiattacks and knockdowns, morale, Rally and the round limit.
 */
import { join } from "node:path";
import {
  buildEncounter,
  type CombatRules,
  type CombatState,
  type HeroCombatant,
  heroCombatant,
  MAX_COMBAT_ROUNDS,
  resolveCombatRound,
  STANDARD_RULES,
} from "@dq/core/combat";
import { createRng } from "@dq/core/rng";
import type { Ability } from "@dq/core/rules";
import { indexWorld, loadWorld, type World } from "@dq/core/world";
import { readWorldFiles } from "@dq/core/world-fs";

const FIGHTS = Number(process.argv[2] ?? 4000);
const { world } = loadWorld(readWorldFiles(join("worlds", "lanternreach")));
if (!world) throw new Error("the starter world didn't load");
const creatures = indexWorld(world as World).creatures;

const mod = (score: number) => Math.floor((score - 10) / 2);

/** A fighter with a longsword: Strength sets how strong a hitter they are. */
function fighter(id: string, level: number, str: number, hp: number, ac: number): HeroCombatant {
  const prof = level >= 5 ? 3 : 2;
  const abilities: Record<Ability, number> = { str, dex: 12, con: 14, int: 10, wis: 10, cha: 10 };
  const saves = Object.fromEntries(
    Object.entries(abilities).map(([a, s]) => [a, mod(s) + (a === "str" || a === "con" ? prof : 0)]),
  ) as Record<Ability, number>;
  return heroCombatant({
    id,
    name: id,
    level,
    hp,
    hpMax: hp,
    tempHp: 0,
    ac,
    conditions: [],
    abilities,
    proficiencyBonus: prof,
    saves,
    initiativeBonus: mod(12),
    weapons: [{ id: "longsword", name: "Longsword", base: "longsword" }],
    spellIds: [],
    spellcastingAbility: null,
    srdClass: "fighter",
    slotsMax: [],
    slotsUsed: [],
    potions: [],
  });
}

/** Weak, average and strong hitters: +3/+5/+7 to hit at level 1, +4/+7/+8 at level 5. */
const STRENGTH = { weak: [12, 12], average: [16, 18], strong: [20, 20] } as const;
type Hitter = keyof typeof STRENGTH;

const SCENES = [
  { name: "1 level-1 hero vs 1 wolf", foe: "wolf", heroes: 1, level: 1, hp: 12, ac: 15 },
  { name: "2 level-2 heroes vs 1 shadow wolf", foe: "shadow-wolf", heroes: 2, level: 2, hp: 20, ac: 15 },
  { name: "4 level-5 heroes vs 1 owlbear", foe: "owlbear", heroes: 4, level: 5, hp: 44, ac: 16 },
];

interface Tally {
  won: number;
  rounds: number;
  turns: number;
  empty: number;
  grazes: number;
  rerolls: number;
  damage: number;
  /** Hero-fights with three empty attack turns in a row. */
  streaks: number;
  heroFights: number;
}

function play(scene: (typeof SCENES)[number], hitter: Hitter, rules: CombatRules, seed: string): Tally {
  const creature = creatures.get(scene.foe);
  if (!creature) throw new Error(`no ${scene.foe}`);
  const str = STRENGTH[hitter][scene.level >= 5 ? 1 : 0];
  const party = Array.from({ length: scene.heroes }, (_, i) =>
    fighter(`hero-${i + 1}`, scene.level, str, scene.hp, scene.ac),
  );
  const rng = createRng(seed);
  const t: Tally = {
    won: 0,
    rounds: 0,
    turns: 0,
    empty: 0,
    grazes: 0,
    rerolls: 0,
    damage: 0,
    streaks: 0,
    heroFights: 0,
  };
  for (let n = 0; n < FIGHTS; n++) {
    let state: CombatState = buildEncounter({ foes: [{ creature, count: 1 }], heroes: party, rng });
    let heroes = party;
    const run = new Map(party.map((h) => [h.id, 0]));
    const streaked = new Set<string>();
    for (let r = 0; r < MAX_COMBAT_ROUNDS && state.phase === "fighting"; r++) {
      const actions = Object.fromEntries(heroes.map((h) => [h.id, { kind: "attack" as const }]));
      const res = resolveCombatRound(state, heroes, actions, creatures, rng, rules);
      for (const e of res.events) {
        if (e.kind !== "attack" || !e.roll) continue;
        t.turns++;
        t.damage += e.roll.damage ?? 0;
        if (e.roll.graze) t.grazes++;
        if (e.roll.rerolled) t.rerolls++;
        const empty = !e.roll.damage;
        if (empty) t.empty++;
        const len = empty ? (run.get(e.actorId) ?? 0) + 1 : 0;
        run.set(e.actorId, len);
        if (len >= 3) streaked.add(e.actorId);
      }
      state = res.state;
      heroes = res.heroes;
      t.rounds++;
    }
    if (state.outcome === "victory") t.won++;
    t.streaks += streaked.size;
    t.heroFights += party.length;
  }
  return t;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const rows: string[] = [
  `Each row is ${FIGHTS} fights. "Empty" is a hero attack that did no damage.`,
  "",
  "| Fight | Heroes | Rules | Heroes win | Rounds | Empty attacks | Three empty in a row | Grazes | Courage rerolls | Damage per attack |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
];
for (const scene of SCENES) {
  for (const hitter of Object.keys(STRENGTH) as Hitter[]) {
    for (const [label, rules] of [
      ["SRD", STANDARD_RULES],
      ["partial hits", { partialHits: true, defenseMix: false }],
    ] as const) {
      const t = play(scene, hitter, rules, `fight-rules|${scene.name}|${hitter}`);
      rows.push(
        `| ${scene.name} | ${hitter} | ${label} | ${pct(t.won / FIGHTS)} | ${(t.rounds / FIGHTS).toFixed(1)} | ${pct(t.empty / t.turns)} | ${pct(t.streaks / t.heroFights)} | ${pct(t.grazes / t.turns)} | ${pct(t.rerolls / t.turns)} | ${(t.damage / t.turns).toFixed(1)} |`,
      );
    }
  }
}
console.log(rows.join("\n"));
