/**
 * Builds the bestiary every world can draw on: SRD 5.2.1 creatures, converted to the world's creature format and
 * curated in tools/bestiary/curation.yaml (which ones, at what intensity, where they live, and in whose words).
 * Writes packages/core/src/srd/bestiary.generated.ts.
 *
 * The stat blocks come from the 5e-bits database (MIT), which holds the SRD as JSON:
 *   curl -o /tmp/srd-monsters.json \
 *     https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2024/en/5e-SRD-Monsters.json
 *   pnpm bestiary /tmp/srd-monsters.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Ability } from "@dq/core/rules";
import { checkNarration } from "@dq/core/safety";
import { CreatureDef, loadWorld, type World } from "@dq/core/world";
import { readWorldFiles } from "@dq/core/world-fs";
import { parse } from "yaml";
import { z } from "zod";

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const OUT = root("packages/core/src/srd/bestiary.generated.ts");

const Curated = z.strictObject({
  i: z.enum(["light", "classic", "epic"]),
  h: z.array(z.string()).min(1),
  d: z.string().min(10),
  name: z.string().optional(),
  kind: z.string().optional(),
  defeat: z.string().optional(),
  morale: z.string().optional(),
  friendly: z.boolean().optional(),
  boss: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  rename: z.record(z.string(), z.string()).optional(),
  drop: z.array(z.string()).optional(),
  /** A multiattack the data doesn't spell out, by attack name ("as many Bite attacks as it has heads"). */
  multi: z.record(z.string(), z.number().int().min(1).max(6)).optional(),
});
type Curated = z.infer<typeof Curated>;

interface SrdDamage {
  damage_dice?: string;
  damage_type?: { index: string };
  choose?: number;
  from?: { options?: SrdDamage[] };
}
interface SrdAction {
  name: string;
  desc: string;
  attack_bonus?: number;
  damage?: SrdDamage[];
  dc?: { dc_type: { index: string }; dc_value: number; success_type?: string };
  usage?: { type: string; min_value?: number };
  multiattack_type?: "actions" | "action_options";
  actions?: Array<{ action_name: string; count: number | string }>;
  action_options?: {
    choose: number;
    from: {
      options: Array<{
        option_type: string;
        action_name?: string;
        count?: number | string;
        items?: Array<{ action_name: string; count: number | string }>;
      }>;
    };
  };
}
interface SrdMonster {
  index: string;
  name: string;
  size: string;
  type: string;
  armor_class: Array<{ value: number }>;
  hit_points_roll: string;
  speed: Record<string, string>;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  damage_resistances: string[];
  damage_immunities: string[];
  damage_vulnerabilities: string[];
  condition_immunities: Array<{ index: string }>;
  challenge_rating: number;
  proficiency_bonus: number;
  special_abilities?: Array<{ name: string; desc: string }>;
  actions?: SrdAction[];
}

const KIND: Record<string, string> = {
  beast: "beast",
  "swarm of tiny beasts": "beast",
  humanoid: "person",
  monstrosity: "monster",
  aberration: "monster",
  fiend: "monster",
  dragon: "dragon",
  giant: "giant",
  elemental: "elemental",
  fey: "fey",
  construct: "construct",
  plant: "plant",
  ooze: "ooze",
  undead: "undead",
  celestial: "spirit",
};

/** How each kind fights on and leaves a fight, unless the curation says otherwise. */
const TEMPERAMENT: Record<string, { morale: string; defeat: string }> = {
  beast: { morale: "normal", defeat: "flees" },
  person: { morale: "normal", defeat: "surrenders" },
  monster: { morale: "normal", defeat: "flees" },
  dragon: { morale: "brave", defeat: "flees" },
  giant: { morale: "normal", defeat: "flees" },
  undead: { morale: "brave", defeat: "crumbles" },
  construct: { morale: "brave", defeat: "crumbles" },
  elemental: { morale: "brave", defeat: "fades" },
  fey: { morale: "skittish", defeat: "flees" },
  plant: { morale: "brave", defeat: "crumbles" },
  ooze: { morale: "brave", defeat: "crumbles" },
  spirit: { morale: "normal", defeat: "flees" },
};

/** SRD conditions as the game's conditions; the stronger ones become a dizzy spell. */
const CONDITION: Record<string, string> = {
  blinded: "blinded",
  charmed: "charmed",
  frightened: "frightened",
  grappled: "grappled",
  poisoned: "poisoned",
  prone: "prone",
  restrained: "restrained",
  stunned: "stunned",
  paralyzed: "stunned",
  petrified: "stunned",
  incapacitated: "stunned",
  unconscious: "stunned",
};
const SAVE_FOR: Record<string, Ability> = {
  grappled: "str",
  prone: "str",
  restrained: "str",
  poisoned: "con",
  blinded: "con",
  stunned: "con",
  frightened: "wis",
  charmed: "wis",
};
const ABILITY_WORD: Record<string, Ability> = {
  Strength: "str",
  Dexterity: "dex",
  Constitution: "con",
  Intelligence: "int",
  Wisdom: "wis",
  Charisma: "cha",
};
const DAMAGE_TYPES = new Set([
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
]);
/** Attack names that read badly in a story for every age (and trip the safety check), wherever they appear. */
const NAME_SWAPS: Record<string, string> = { Gore: "Charge" };

/** Trait text that reads too grim for the table, whatever the intensity; the traits are flavor, never rules. */
const GRIM =
  /\b(sever\w*|blood\w*|flesh|corpses?|gore|devour\w*|eats?|kills?|death|dead|dies?|soul\w*|undead)\b/i;
const CR = (n: number) => (n === 0.125 ? "1/8" : n === 0.25 ? "1/4" : n === 0.5 ? "1/2" : String(n));
const mod = (score: number) => Math.floor((score - 10) / 2);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** "2d6+6" as the SRD prints it in text: "(2d6 + 6)". */
const printed = (dice: string) => `(${dice.replace(/\s+/g, "").replace(/([+-])/g, " $1 ")})`;

function damageParts(parts: SrdDamage[] = []): Array<{ dice: string; type: string }> {
  return parts.flatMap((p) => {
    const pick = p.damage_dice ? p : p.from?.options?.[0];
    return pick?.damage_dice
      ? [{ dice: pick.damage_dice.replace(/\s+/g, ""), type: pick.damage_type?.index ?? "bludgeoning" }]
      : [];
  });
}

/** The always-on damage: the first part, plus any "plus 7 (2d6) Poison damage" that isn't only sometimes. */
function steadyDamage(a: SrdAction): { dice: string; type: string } | null {
  const parts = damageParts(a.damage);
  const first = parts[0];
  if (!first) {
    // A flat hit with no dice: "Hit: 1 Slashing damage."
    const flat = /Hit: (\d+) (\w+) damage/.exec(a.desc);
    return flat ? { dice: flat[1] as string, type: (flat[2] as string).toLowerCase() } : null;
  }
  const dice = [first.dice];
  let from = a.desc.indexOf(printed(first.dice));
  for (const extra of parts.slice(1)) {
    const at = a.desc.indexOf(printed(extra.dice), Math.max(0, from + 1));
    if (at < 0) continue;
    const clause = a.desc.slice(at, a.desc.indexOf(".", at) + 1 || undefined);
    // Only sometimes ("if the attack had Advantage"), or later ("at the start of each of its turns").
    if (/\b(if|while|instead|when|against|start of|end of|each of)\b/i.test(clause)) continue;
    dice.push(extra.dice);
    from = at;
  }
  return { dice: dice.join("+"), type: first.type };
}

function conditionIn(text: string): string | undefined {
  const m = /has the (\w+) condition/i.exec(text);
  return m ? CONDITION[m[1]?.toLowerCase() ?? ""] : undefined;
}

function convert(m: SrdMonster, c: Curated, world: World) {
  const kind = c.kind ?? KIND[m.type] ?? "monster";
  const temperament = TEMPERAMENT[kind] ?? { morale: "normal", defeat: "flees" };
  const renamed = (n: string) => c.rename?.[n] ?? NAME_SWAPS[n] ?? n;
  const dropped = new Set(c.drop ?? []);
  const fallbackDc = 8 + m.proficiency_bonus + Math.max(mod(m.strength), mod(m.dexterity));

  const attacks: Array<Record<string, unknown>> = [];
  const specials: Array<Record<string, unknown>> = [];
  for (const a of m.actions ?? []) {
    if (a.multiattack_type || dropped.has(a.name)) continue;
    const damage = steadyDamage(a);
    if (a.attack_bonus !== undefined && damage) {
      const ranged = /Ranged Attack Roll/.test(a.desc) && !/Melee or Ranged/.test(a.desc);
      const range = /range (\d+)(?:\/(\d+))? ft/.exec(a.desc);
      const condition = conditionIn(a.desc.slice(a.desc.indexOf("Hit:")));
      const saveWord = /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw/.exec(
        a.desc,
      );
      const dc = /DC (\d+)/.exec(a.desc);
      attacks.push({
        name: renamed(a.name),
        bonus: a.attack_bonus,
        damage: damage.dice,
        damageType: damage.type,
        ...(ranged && range ? { range: [Number(range[1]), Number(range[2] ?? range[1])] } : {}),
        ...(condition
          ? {
              effect: {
                condition,
                save:
                  (saveWord ? ABILITY_WORD[saveWord[1] as string] : undefined) ??
                  SAVE_FOR[condition] ??
                  "str",
                dc: dc ? Number(dc[1]) : fallbackDc,
              },
            }
          : {}),
      });
    } else if (a.dc && a.attack_bonus === undefined) {
      const failure = a.desc.slice(Math.max(0, a.desc.indexOf("Failure:")));
      const condition = conditionIn(failure);
      if (!damage && !condition) continue;
      const recharge =
        a.usage?.type === "recharge on roll"
          ? (a.usage.min_value ?? 6)
          : a.usage?.type === "per day"
            ? 6
            : undefined;
      specials.push({
        name: renamed(a.name),
        save: a.dc.dc_type.index,
        dc: a.dc.dc_value,
        ...(damage ? { damage: damage.dice, damageType: damage.type } : {}),
        halfOnSave: a.dc.success_type === "half",
        ...(condition ? { condition } : {}),
        area: /each creature|creatures? in a/i.test(a.desc),
        ...(recharge ? { recharge } : {}),
      });
    }
  }

  // Multiattack, by the names of the attacks it's made of.
  const named = new Set(attacks.map((x) => x.name as string));
  let multiattack: Array<{ attack: string; count: number }> = [];
  for (const a of m.actions ?? []) {
    if (a.multiattack_type === "actions")
      multiattack = (a.actions ?? []).map((x) => ({
        attack: renamed(x.action_name),
        count: Number(x.count) || 1,
      }));
    else if (a.multiattack_type === "action_options") {
      for (const o of a.action_options?.from.options ?? []) {
        const items =
          o.option_type === "multiple"
            ? (o.items ?? [])
            : o.action_name
              ? [{ action_name: o.action_name, count: o.count ?? a.action_options?.choose ?? 1 }]
              : [];
        const set = items.map((x) => ({ attack: renamed(x.action_name), count: Number(x.count) || 1 }));
        if (set.length > 0 && set.every((x) => named.has(x.attack))) {
          multiattack = set;
          break;
        }
      }
    }
  }
  if (c.multi) multiattack = Object.entries(c.multi).map(([attack, count]) => ({ attack, count }));
  multiattack = multiattack
    .filter((x) => named.has(x.attack))
    .map((x) => ({ attack: x.attack, count: clamp(x.count, 1, 6) }));
  const swings = multiattack.reduce((n, x) => n + x.count, 0);

  const intensity = c.i;
  const safe = (text: string) => checkNarration(text, world, { intensity }).ok;
  const traits = (m.special_abilities ?? [])
    .filter((t) => !dropped.has(t.name))
    .map((t) => {
      const first = t.desc.split(/(?<=\.)\s/)[0] ?? t.desc;
      return { name: renamed(t.name), description: first.length > 240 ? `${first.slice(0, 237)}...` : first };
    })
    .filter((t) => safe(`${t.name}. ${t.description}`) && !GRIM.test(`${t.name} ${t.description}`));

  const types = (list: string[]) => [
    ...new Set(list.flatMap((s) => s.toLowerCase().split(/[^a-z]+/)).filter((w) => DAMAGE_TYPES.has(w))),
  ];
  const speedOf = (s: string | undefined) => Number(/(\d+)/.exec(s ?? "")?.[1] ?? 0);
  const walk = speedOf(m.speed.walk);
  const speed = walk || Math.max(0, ...Object.values(m.speed).map(speedOf));

  return {
    id: m.index,
    name: c.name ?? m.name,
    description: c.d,
    kind,
    size: m.size.toLowerCase().split(" ")[0],
    cr: CR(m.challenge_rating),
    ac: clamp(m.armor_class[0]?.value ?? 10, 5, 25),
    hp: m.hit_points_roll.replace(/\s+/g, ""),
    speed: clamp(speed, 0, 120),
    abilities: {
      str: clamp(m.strength, 1, 30),
      dex: clamp(m.dexterity, 1, 30),
      con: clamp(m.constitution, 1, 30),
      int: clamp(m.intelligence, 1, 30),
      wis: clamp(m.wisdom, 1, 30),
      cha: clamp(m.charisma, 1, 30),
    },
    attacks,
    ...(swings > 1 ? { multiattack } : {}),
    specials,
    resist: types(m.damage_resistances),
    immune: types(m.damage_immunities),
    vulnerable: types(m.damage_vulnerabilities),
    conditionImmune: [
      ...new Set(
        m.condition_immunities.map((x) => CONDITION[x.index]).filter((x): x is string => Boolean(x)),
      ),
    ],
    traits,
    morale: c.morale ?? temperament.morale,
    defeat: c.defeat ?? temperament.defeat,
    tags: [...new Set([...(c.tags ?? []), ...(c.boss ? ["boss"] : [])])],
    habitats: c.h,
    minIntensity: intensity,
    friendly: c.friendly ?? false,
  };
}

function main() {
  const source = process.argv[2];
  if (!source) throw new Error("usage: pnpm bestiary <path to 5e-SRD-Monsters.json (2024)>");
  const srd = JSON.parse(readFileSync(source, "utf8")) as SrdMonster[];
  const byIndex = new Map(srd.map((m) => [m.index, m]));
  const curation = parse(readFileSync(root("tools/bestiary/curation.yaml"), "utf8")) as Record<
    string,
    unknown
  >;
  const { world } = loadWorld(readWorldFiles(root("worlds/lanternreach")));
  if (!world) throw new Error("the starter world must load: its content rules are the safety reference");

  const out: CreatureDef[] = [];
  const problems: string[] = [];
  for (const [id, raw] of Object.entries(curation)) {
    const c = Curated.safeParse(raw);
    if (!c.success) {
      problems.push(`${id}: ${c.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      continue;
    }
    const m = byIndex.get(id);
    if (!m) {
      problems.push(`${id}: not in the SRD data`);
      continue;
    }
    const creature = CreatureDef.safeParse(convert(m, c.data, world));
    if (!creature.success) {
      problems.push(
        `${id}: ${creature.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
      );
      continue;
    }
    // Everything a player or the storyteller may read must pass the safety check at the creature's intensity.
    const shown = [
      creature.data.name,
      creature.data.description,
      ...creature.data.attacks.map((a) => a.name),
      ...creature.data.specials.map((sp) => sp.name),
    ];
    for (const text of shown)
      if (!checkNarration(text, world, { intensity: creature.data.minIntensity }).ok)
        problems.push(`${id}: "${text}" isn't safe at ${creature.data.minIntensity}`);
    out.push(creature.data);
  }
  if (problems.length > 0) throw new Error(`bestiary problems:\n${problems.join("\n")}`);

  out.sort((a, b) => a.id.localeCompare(b.id));
  const body = out.map((c) => `  ${JSON.stringify(c)},`).join("\n");
  writeFileSync(
    OUT,
    [
      "// Generated by tools/gen-bestiary.ts from the SRD 5.2.1 (CC-BY-4.0, via the 5e-bits database, MIT) and",
      "// tools/bestiary/curation.yaml. Don't edit by hand: change the curation and run `pnpm bestiary`.",
      'import type { CreatureDef } from "../world/schema";',
      "",
      "export const SRD_BESTIARY: readonly CreatureDef[] = [",
      body,
      "];",
      "",
    ].join("\n"),
  );
  console.log(`wrote ${out.length} creatures to ${OUT}`);
}

main();
