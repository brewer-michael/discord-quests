/**
 * The engine side of combat: who the heroes face, what each hero can do,
 * and how a fight shows up in the story and on screen. The rules
 * themselves live in @dq/core/combat.
 */
import {
  buildEncounter,
  type CombatEvent,
  type CombatState,
  foeCondition,
  type HeroCombatant,
  heroCombatant,
  isDownHero,
  rollFoes,
} from "@dq/core/combat";
import { balanceEncounter, type Difficulty } from "@dq/core/combat/balance";
import { creatureAllowed, pickWild, type TableRules } from "@dq/core/combat/bestiary";
import type { Condition } from "@dq/core/rules";
import { deriveStats, isCondition } from "@dq/core/rules";
import { SRD_CLASSES, sneakAttackDice } from "@dq/core/srd";
import type { CreatureDef, WorldIndex } from "@dq/core/world";
import type { characters, inventoryItems } from "@dq/db";
import { buildFor } from "./character-rules";
import type { SceneEntityState, SceneSpec } from "./director";
import type { RollView } from "./views";

type CharacterRow = typeof characters.$inferSelect;
type InventoryRow = typeof inventoryItems.$inferSelect;

/** Spell slots a hero has used since their last long rest, by level (resources.slotsUsed1, …). */
export function slotsUsed(resources: Record<string, number>): number[] {
  return Array.from({ length: 9 }, (_, i) => resources[`slotsUsed${i + 1}`] ?? 0);
}

export function heroesFor(
  index: WorldIndex,
  party: readonly CharacterRow[],
  inventory: readonly InventoryRow[],
): HeroCombatant[] {
  const out: HeroCombatant[] = [];
  for (const p of party) {
    const build = buildFor(index, p);
    const cls = p.classId ? index.classes.get(p.classId) : undefined;
    if (!build || !cls) continue;
    const d = deriveStats(build);
    const srd = SRD_CLASSES[build.classId];
    const mine = inventory.filter((i) => i.characterId === p.id && i.qty > 0);
    const weapons = mine.flatMap((i) => {
      const w = index.world.items.weapons.find((x) => x.id === i.itemId);
      return w ? [{ id: w.id, name: w.name, base: w.base }] : [];
    });
    const potions = mine.flatMap((i) => {
      const c = index.world.items.consumables.find((x) => x.id === i.itemId);
      return c?.effect.kind === "heal"
        ? [{ itemId: c.id, name: c.name, dice: c.effect.dice, qty: i.qty }]
        : [];
    });
    out.push(
      heroCombatant({
        id: p.id,
        name: p.name,
        level: p.level,
        hp: p.hp,
        hpMax: p.hpMax,
        tempHp: p.tempHp,
        ac: d.armorClass,
        conditions: p.conditions.filter(isCondition) as Condition[],
        abilities: build.abilities,
        proficiencyBonus: d.proficiencyBonus,
        saves: d.savingThrows,
        initiativeBonus: d.initiative,
        weapons,
        spellIds: cls.suggestedSpells,
        spellcastingAbility: srd.spellcastingAbility ?? null,
        srdClass: build.classId,
        slotsMax: d.spellSlots,
        slotsUsed: slotsUsed(p.resources),
        potions,
        sneakDice: build.classId === "rogue" ? sneakAttackDice(p.level) : null,
      }),
    );
  }
  return out;
}

/**
 * Adds a fight to a scene when it needs one: every combat beat, and now and
 * then an ambush on the road (the destination region's encounter chance).
 * The world says which creatures; the balance decides how many and how tough
 * for this party's levels and size (an ambush is a low fight, a story fight a
 * moderate one, a boss a high one). Foes join the scene's cast, so the story
 * and the loom can see them.
 */
export function withEncounter(
  index: WorldIndex,
  spec: SceneSpec,
  party: readonly CharacterRow[],
  heroes: readonly HeroCombatant[],
  rng: import("@dq/core/rng").Rng,
  rules: TableRules = { intensity: "classic", avoid: [] },
): SceneSpec {
  if (spec.combat || party.length === 0 || heroes.length === 0) return spec;
  const region = index.regions.get(spec.regionId);
  const allowed = (c: CreatureDef) => creatureAllowed(c, rules);
  const levels = heroes.map((h) => h.level);
  const wild = (difficulty: Difficulty) =>
    region ? pickWild({ creatures: index.creatures, region, levels, difficulty, rules, rng }) : [];
  let wanted: Array<{ creature: CreatureDef; count: number }> = [];
  if (spec.kind === "combat") {
    // The story's own foes, unless the table left them out; then whatever lives here.
    const beat = spec.beatId ? index.beats.get(spec.beatId)?.beat : undefined;
    if (beat?.foes?.length)
      wanted = rollFoes(beat.foes, party.length, rng, "all").flatMap((t) => {
        const creature = index.creatures.get(t.creature);
        return creature && allowed(creature) ? [{ creature, count: t.count }] : [];
      });
    if (wanted.length === 0) wanted = wild("moderate");
  } else if (spec.kind === "travel" && region && rng.chance(region.encounters.chance)) {
    wanted = wild("low");
  }
  if (wanted.length === 0) return spec;
  const difficulty: Difficulty = wanted.some((w) => w.creature.tags.includes("boss"))
    ? "high"
    : spec.kind === "travel"
      ? "low"
      : "moderate";
  const { foes } = balanceEncounter({
    foes: wanted,
    heroes,
    difficulty,
    creatures: index.creatures,
    allowed,
  });
  const combat = buildEncounter({ foes, heroes, rng });
  const entities: SceneEntityState[] = [
    ...spec.entities,
    ...combat.foes.map((f) => {
      const c = index.creatures.get(f.creatureId);
      return {
        ref: {
          kind: "faction" as const,
          id: f.id,
          name: f.name,
          tags: c?.tags ?? [],
          ...(c?.faction ? { faction: c.faction } : {}),
        },
        kind: "creature" as const,
        status: "hostile" as const,
        lowly: false,
        present: true,
        ...(c ? { note: c.description } : {}),
      };
    }),
  ];
  const ambush = spec.kind === "travel";
  return {
    ...spec,
    entities,
    combat,
    ...(ambush
      ? {
          summary: `${spec.summary} On the way, ${listFoes(combat)} ${combat.foes.length === 1 ? "leaps" : "leap"} out to block the path!`,
          goals: [...spec.goals, "Get past the creatures blocking the road."],
        }
      : {}),
  };
}

function listFoes(combat: CombatState): string {
  const names = combat.foes.map((f) => f.name.replace(/ [A-J]$/, ""));
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts.entries()]
    .map(([n, k]) => (k === 1 ? `a ${n.toLowerCase()}` : `${k} ${n.toLowerCase()}s`))
    .join(" and ");
}

/** Keeps the scene's cast in step with the fight. */
export function syncEntities(spec: SceneSpec, combat: CombatState): SceneSpec {
  const byId = new Map(combat.foes.map((f) => [f.id, f]));
  return {
    ...spec,
    combat,
    entities: spec.entities.map((e) => {
      const f = byId.get(e.ref.id);
      if (!f) return e;
      const status: SceneEntityState["status"] =
        f.status === "fighting"
          ? "hostile"
          : f.status === "at_mercy"
            ? "at_mercy"
            : f.status === "spared"
              ? "befriended"
              : "fled";
      return { ...e, status, present: f.status === "fighting" || f.status === "at_mercy" };
    }),
  };
}

/** The choices after a won fight when some foes are left at the heroes' mercy. */
export function aftermathChoices(combat: CombatState) {
  const beaten = combat.foes.filter((f) => f.status === "at_mercy");
  const first = beaten[0];
  if (!first) return [];
  const who = beaten.length === 1 ? first.name : "the beaten foes";
  return [
    {
      label: `Let ${who} go free`,
      intent: {
        approach: `let ${who} go free`,
        skill: "none",
        difficulty: "easy" as const,
        deed: "mercy",
        targetRef: first.id,
        shortcutId: null,
      },
    },
    {
      label: "Tie them up for the Wardens to collect",
      intent: {
        approach: "tie them up for the Wardens",
        skill: "none",
        difficulty: "easy" as const,
        deed: "none",
        targetRef: null,
        shortcutId: null,
      },
    },
    {
      label: "Drive them off and press on",
      intent: {
        approach: "drive them off",
        skill: "none",
        difficulty: "easy" as const,
        deed: "none",
        targetRef: null,
        shortcutId: null,
      },
    },
  ];
}

/** Every roll of the round, the heroes' and the foes' attacks on them, in the order they happened. */
export function rollViewsFrom(events: readonly CombatEvent[], heroIds: ReadonlySet<string>): RollView[] {
  return events
    .filter((e) => e.roll && (heroIds.has(e.actorId) || e.kind === "foe_attack"))
    .map((e) => {
      const r = e.roll as NonNullable<CombatEvent["roll"]>;
      return {
        characterName: e.actor,
        label: r.label,
        natural: r.natural,
        rolls: r.rolls,
        modifier: r.modifier,
        total: r.total,
        difficulty: r.against,
        success: r.success,
        mode: r.mode,
        ...(r.damage ? { damage: r.damage } : {}),
        ...(heroIds.has(e.actorId) ? {} : { foe: true }),
      };
    });
}

/** What the screen shows about a fight. Foe health is a bar and a word, never numbers. */
export interface CombatView {
  phase: CombatState["phase"];
  round: number;
  /** health: the share of its hit points a foe has left, 0 to 1. */
  foes: Array<{ id: string; name: string; condition: string; status: string; health: number }>;
  heroes: Array<{ id: string; name: string; hp: number; hpMax: number; down: boolean }>;
  order: string[];
  log: string[];
}

export function combatView(
  combat: CombatState,
  party: readonly CharacterRow[],
  log: readonly string[] = [],
): CombatView {
  const names = new Map<string, string>([
    ...combat.foes.map((f) => [f.id, f.name] as const),
    ...party.map((p) => [p.id, p.name] as const),
  ]);
  return {
    phase: combat.phase,
    round: combat.round,
    foes: combat.foes.map((f) => ({
      id: f.id,
      name: f.name,
      condition: foeCondition(f),
      status: f.status,
      health: f.hpMax > 0 ? Math.round((f.hp / f.hpMax) * 100) / 100 : 0,
    })),
    heroes: party.map((p) => ({
      id: p.id,
      name: p.name,
      hp: p.hp,
      hpMax: p.hpMax,
      down: isDownHero({ hp: p.hp, conditions: p.conditions.filter(isCondition) as Condition[] }),
    })),
    order: combat.order.map((o) => names.get(o.id) ?? o.id).filter((n, i, a) => a.indexOf(n) === i),
    log: [...log],
  };
}
