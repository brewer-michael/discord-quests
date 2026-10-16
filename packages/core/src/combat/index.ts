/**
 * Turn-based combat, kid-safe. Everyone picks an action at once, then the
 * round plays out in initiative order. Nobody dies: foes faint, give up, run
 * off or pop into smoke, and heroes at 0 hit points are Dazed until they
 * Rally or a friend helps. Foes never pick on a hero who is already down.
 *
 * Pure and deterministic: all randomness comes from the Rng passed in.
 */
import { z } from "zod";
import type { Rng } from "../rng/index";
import { type Ability, abilityModifier } from "../rules/abilities";
import { type RollMode, rollD20 } from "../rules/checks";
import { applyDamageToHero, healHero, moraleCheck, rollAttack, rollDamage, rollRally } from "../rules/combat";
import { attackRollMode, type Condition } from "../rules/conditions";
import { averageDice, rollDice } from "../rules/dice";
import { SRD_WEAPONS } from "../srd/equipment";
import { type SpellEffect, SRD_SPELLS } from "../srd/spells";
import type { CreatureDef } from "../world/schema";

/** After this many rounds, any foes still fighting give up and slip away. */
export const MAX_COMBAT_ROUNDS = 8;

export type FoeStatus = "fighting" | "at_mercy" | "fled" | "spared";

export interface Foe {
  id: string;
  creatureId: string;
  name: string;
  hp: number;
  hpMax: number;
  ac: number;
  initiative: number;
  status: FoeStatus;
  /** How it left the fight, in story words that suit every intensity ("was knocked senseless", "fled"). */
  exit?: string;
  conditions: Condition[];
  /** Rounds left on conditions from spells. */
  conditionRounds: Partial<Record<Condition, number>>;
  bloodiedChecked: boolean;
  /** The next attack against it has advantage. */
  distracted: boolean;
}

export interface CombatState {
  phase: "fighting" | "aftermath" | "over";
  /** Rounds played so far. */
  round: number;
  foes: Foe[];
  order: Array<{ id: string; side: "hero" | "foe"; initiative: number }>;
  outcome: "victory" | "party_down" | null;
  /** Heroes under Bless: +1d4 to attack rolls for the rest of the fight. */
  blessed: string[];
  /** Lasting armor bonuses (Shield of Faith), by hero id. */
  warded: Record<string, number>;
}

export interface HeroAttack {
  id: string;
  name: string;
  bonus: number;
  damage: string;
  ranged: boolean;
}

export interface HeroSpell {
  id: string;
  name: string;
  level: number;
  target: "foe" | "ally" | "self";
  effect: SpellEffect;
}

export interface HeroPotion {
  itemId: string;
  name: string;
  dice: string;
  qty: number;
}

export interface HeroCombatant {
  id: string;
  name: string;
  level: number;
  hp: number;
  hpMax: number;
  tempHp: number;
  ac: number;
  conditions: Condition[];
  initiativeBonus: number;
  saves: Record<Ability, number>;
  attacks: HeroAttack[];
  spells: HeroSpell[];
  spellAttack: number | null;
  spellDc: number | null;
  spellMod: number;
  /** Spell slots still available; index 0 is level 1. */
  slots: number[];
  potions: HeroPotion[];
  /** Extra damage once per turn when attacking with the upper hand (Scouts). */
  sneakDice: string | null;
}

// ------------------------------------------------------------------ actions

export const CombatActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("attack"),
    attackId: z.string().max(40).optional(),
    targetId: z.string().max(40).optional(),
  }),
  z.object({ kind: z.literal("cast"), spellId: z.string().max(40), targetId: z.string().max(80).optional() }),
  z.object({ kind: z.literal("defend") }),
  z.object({ kind: z.literal("help"), targetId: z.string().max(40).optional() }),
  z.object({ kind: z.literal("item"), itemId: z.string().max(60), targetId: z.string().max(80).optional() }),
  z.object({ kind: z.literal("spare"), targetId: z.string().max(40) }),
]);
export type ChosenAction = z.infer<typeof CombatActionSchema>;

/** What a hero does this round. "trick" comes from free text, resolved as a skill check beforehand. */
export type CombatAction =
  | ChosenAction
  | {
      kind: "trick";
      summary: string;
      success: boolean;
      targetId?: string;
      roll?: CombatRoll;
    }
  | { kind: "none"; summary?: string };

export interface CombatRoll {
  label: string;
  natural: number;
  rolls: number[];
  modifier: number;
  total: number;
  /** What the roll was against, in plain words ("armor 13", "Medium"). */
  against: string;
  success: boolean;
  mode: RollMode;
  /** Hit points it took, when it landed. */
  damage?: number;
}

export interface CombatEvent {
  actorId: string;
  actor: string;
  kind:
    | "attack"
    | "spell"
    | "heal"
    | "defend"
    | "distract"
    | "spare"
    | "trick"
    | "rally"
    | "item"
    | "buff"
    | "foe_attack"
    | "foe_leaves"
    | "retreat"
    | "wait";
  targetId?: string;
  target?: string;
  /** One short sentence for the narrator and the turn message. */
  text: string;
  roll?: CombatRoll;
}

export interface RoundResult {
  state: CombatState;
  heroes: HeroCombatant[];
  events: CombatEvent[];
  /** Heroes knocked down (Dazed) this round. */
  downed: string[];
  /** Foes the heroes chose to spare this round. */
  spared: string[];
  usedItems: Array<{ heroId: string; itemId: string }>;
  usedSlots: Array<{ heroId: string; level: number }>;
}

// ------------------------------------------------------------------ building

const LETTERS = "ABCDEFGHIJ";

export interface FoeTableEntry {
  creature: string;
  count: [number, number];
  weight?: number;
}

/**
 * How many of what. Counts in the world files are for a party of three and
 * scale with the party, so a lone hero isn't swarmed.
 */
export function rollFoes(
  entries: readonly FoeTableEntry[],
  partySize: number,
  rng: Rng,
  mode: "all" | "pick-one",
): Array<{ creature: string; count: number }> {
  if (entries.length === 0) return [];
  let chosen = [...entries];
  if (mode === "pick-one") {
    const total = entries.reduce((s, e) => s + (e.weight ?? 1), 0);
    let r = rng.next() * total;
    const pick = entries.find((e) => {
      r -= e.weight ?? 1;
      return r < 0;
    });
    chosen = [pick ?? (entries[entries.length - 1] as FoeTableEntry)];
  }
  return chosen.map((e) => {
    const rolled = rng.int(e.count[0], Math.max(e.count[0], e.count[1]));
    const scaled = Math.round((rolled * Math.max(1, partySize)) / 3);
    return { creature: e.creature, count: Math.max(1, Math.min(8, scaled)) };
  });
}

export function buildEncounter(args: {
  /** hpScale below 1 is a weaker one of its kind, so a small or new party can take it on. */
  foes: ReadonlyArray<{ creature: CreatureDef; count: number; hpScale?: number }>;
  heroes: ReadonlyArray<{ id: string; initiativeBonus: number }>;
  rng: Rng;
}): CombatState {
  const foes: Foe[] = [];
  for (const { creature, count, hpScale = 1 } of args.foes) {
    for (let i = 0; i < count; i++) {
      const hpMax = Math.max(1, Math.round(rollDice(creature.hp, args.rng).total * hpScale));
      foes.push({
        id: `foe-${foes.length + 1}`,
        creatureId: creature.id,
        name: count > 1 ? `${creature.name} ${LETTERS[i] ?? i + 1}` : creature.name,
        hp: hpMax,
        hpMax,
        ac: creature.ac,
        initiative: args.rng.int(1, 20) + abilityModifier(creature.abilities.dex),
        status: "fighting",
        conditions: [],
        conditionRounds: {},
        bloodiedChecked: false,
        distracted: false,
      });
    }
  }
  const order = [
    ...foes.map((f) => ({ id: f.id, side: "foe" as const, initiative: f.initiative })),
    ...args.heroes.map((h) => ({
      id: h.id,
      side: "hero" as const,
      initiative: args.rng.int(1, 20) + h.initiativeBonus,
    })),
  ];
  sortOrder(order);
  return { phase: "fighting", round: 0, foes, order, outcome: null, blessed: [], warded: {} };
}

function sortOrder(order: CombatState["order"]) {
  // Heroes win ties: it's their story.
  order.sort(
    (a, b) => b.initiative - a.initiative || (a.side === "hero" ? -1 : 1) - (b.side === "hero" ? -1 : 1),
  );
}

function signed(dice: string, mod: number): string {
  return mod === 0 ? dice : `${dice}${mod > 0 ? "+" : "-"}${Math.abs(mod)}`;
}

function scaleCantrip(dice: string, level: number, at: readonly number[] | undefined): string {
  const times = 1 + (at ?? []).filter((l) => level >= l).length;
  const m = /^(\d+)d(\d+)$/.exec(dice);
  return m ? `${Number(m[1]) * times}d${m[2]}` : dice;
}

const COMBAT_EFFECTS = new Set(["attack", "save-damage", "save-condition", "heal", "auto-damage", "buff"]);

/** A hero's fighting options, from their sheet. */
export function heroCombatant(args: {
  id: string;
  name: string;
  level: number;
  hp: number;
  hpMax: number;
  tempHp: number;
  ac: number;
  conditions: Condition[];
  abilities: Record<Ability, number>;
  proficiencyBonus: number;
  saves: Record<Ability, number>;
  initiativeBonus: number;
  /** SRD weapon ids the hero carries. */
  weapons: ReadonlyArray<{ id: string; name: string; base: string }>;
  spellIds: readonly string[];
  spellcastingAbility: Ability | null;
  srdClass: string;
  slotsMax: readonly number[];
  slotsUsed: readonly number[];
  potions: HeroPotion[];
  sneakDice?: string | null;
}): HeroCombatant {
  const mod = (a: Ability) => abilityModifier(args.abilities[a] ?? 10);
  const attacks: HeroAttack[] = [];
  for (const w of args.weapons) {
    const srd = SRD_WEAPONS[w.base];
    if (!srd || attacks.some((a) => a.id === w.id)) continue;
    const ranged = srd.kind === "ranged";
    const abilityMod = srd.properties.includes("finesse")
      ? Math.max(mod("str"), mod("dex"))
      : ranged
        ? mod("dex")
        : mod("str");
    attacks.push({
      id: w.id,
      name: w.name,
      bonus: args.proficiencyBonus + abilityMod,
      damage: signed(srd.damage, abilityMod),
      ranged,
    });
  }
  if (attacks.length === 0)
    attacks.push({
      id: "bonk",
      name: "an unarmed blow",
      bonus: args.proficiencyBonus + mod("str"),
      damage: String(Math.max(1, 1 + mod("str"))),
      ranged: false,
    });
  attacks.sort((a, b) => averageDice(b.damage) + b.bonus - (averageDice(a.damage) + a.bonus));

  const spellMod = args.spellcastingAbility ? mod(args.spellcastingAbility) : 0;
  const spells: HeroSpell[] = [];
  if (args.spellcastingAbility) {
    for (const id of args.spellIds) {
      const s = SRD_SPELLS[id];
      if (!s || !COMBAT_EFFECTS.has(s.effect.kind)) continue;
      if (s.level > 0 && !args.slotsMax.some((n, i) => n > 0 && i + 1 >= s.level)) continue;
      const target: HeroSpell["target"] =
        s.effect.kind === "heal" || (s.effect.kind === "buff" && s.effect.targets === 1 && s.id !== "shield")
          ? "ally"
          : s.effect.kind === "buff"
            ? "self"
            : "foe";
      spells.push({ id: s.id, name: s.name, level: s.level, target, effect: s.effect });
    }
  }
  const pb = args.proficiencyBonus;
  return {
    id: args.id,
    name: args.name,
    level: args.level,
    hp: args.hp,
    hpMax: args.hpMax,
    tempHp: args.tempHp,
    ac: args.ac,
    conditions: [...args.conditions],
    initiativeBonus: args.initiativeBonus,
    saves: args.saves,
    attacks,
    spells,
    spellAttack: args.spellcastingAbility ? pb + spellMod : null,
    spellDc: args.spellcastingAbility ? 8 + pb + spellMod : null,
    spellMod,
    slots: args.slotsMax.map((n, i) => Math.max(0, n - (args.slotsUsed[i] ?? 0))),
    potions: args.potions.filter((p) => p.qty > 0),
    sneakDice: args.sneakDice ?? null,
  };
}

// ------------------------------------------------------------------ helpers

export const isDownHero = (h: Pick<HeroCombatant, "hp" | "conditions">) =>
  h.hp <= 0 || h.conditions.includes("dazed");

export function fightingFoes(state: CombatState): Foe[] {
  return state.foes.filter((f) => f.status === "fighting");
}

export function foesAtMercy(state: CombatState): Foe[] {
  return state.foes.filter((f) => f.status === "at_mercy");
}

/** The lowest slot level that can cast a spell of this level, or null if none is left. */
function slotFor(h: HeroCombatant, level: number): number | null {
  for (let i = Math.max(0, level - 1); i < h.slots.length; i++) if ((h.slots[i] ?? 0) > 0) return i + 1;
  return null;
}

export function canCast(h: HeroCombatant, spellId: string): boolean {
  const s = h.spells.find((x) => x.id === spellId);
  return Boolean(s && (s.level === 0 || slotFor(h, s.level) !== null));
}

function toRoll(
  label: string,
  d20: { natural: number; rolls: number[]; mode: RollMode },
  modifier: number,
  total: number,
  against: string,
  success: boolean,
  damage = 0,
): CombatRoll {
  return {
    label,
    natural: d20.natural,
    rolls: d20.rolls,
    modifier,
    total,
    against,
    success,
    mode: d20.mode,
    ...(damage > 0 ? { damage } : {}),
  };
}

// ------------------------------------------------------------------ the round

export function resolveCombatRound(
  input: CombatState,
  heroList: readonly HeroCombatant[],
  actions: Readonly<Record<string, CombatAction>>,
  creatures: ReadonlyMap<string, CreatureDef>,
  rng: Rng,
): RoundResult {
  const state: CombatState = structuredClone(input);
  const heroes = new Map(heroList.map((h) => [h.id, structuredClone(h) as HeroCombatant]));
  const events: CombatEvent[] = [];
  const downed: string[] = [];
  const spared: string[] = [];
  const usedItems: RoundResult["usedItems"] = [];
  const usedSlots: RoundResult["usedSlots"] = [];
  const foeById = new Map(state.foes.map((f) => [f.id, f]));

  // Heroes who joined mid-fight roll in; heroes who left drop out.
  state.order = state.order.filter((o) => o.side === "foe" || heroes.has(o.id));
  for (const h of heroes.values()) {
    if (!state.order.some((o) => o.id === h.id))
      state.order.push({ id: h.id, side: "hero", initiative: rng.int(1, 20) + h.initiativeBonus });
  }
  sortOrder(state.order);

  const defending = new Set(
    Object.entries(actions)
      .filter(([, a]) => a.kind === "defend")
      .map(([id]) => id),
  );
  const shielded = new Set<string>();

  const firstFighting = (preferId?: string) => {
    const preferred = preferId ? foeById.get(preferId) : undefined;
    if (preferred?.status === "fighting") return preferred;
    return state.foes.find((f) => f.status === "fighting");
  };
  const heroTarget = (self: HeroCombatant, preferId?: string) => {
    const preferred = preferId ? heroes.get(preferId) : undefined;
    if (preferred) return preferred;
    // Otherwise whoever needs it most: a Dazed friend first, then the most hurt.
    return (
      [...heroes.values()].sort(
        (a, b) => Number(isDownHero(b)) - Number(isDownHero(a)) || a.hp / a.hpMax - b.hp / b.hpMax,
      )[0] ?? self
    );
  };

  const foeLeaves = (f: Foe, why: "beaten" | "bloodied") => {
    const creature = creatures.get(f.creatureId);
    const style = creature?.defeat ?? "faints";
    if (why === "bloodied") {
      const m = moraleCheck(creature?.morale ?? "normal", rng);
      if (!m.breaks) return;
    }
    if (style === "flees") {
      f.status = "fled";
      f.exit = "fled";
    } else if (style === "poofs") {
      f.status = "fled";
      f.exit = "came apart into smoke";
    } else {
      f.status = "at_mercy";
      f.exit = style === "faints" && f.hp <= 0 ? "was knocked senseless" : "yielded";
    }
    events.push({ actorId: f.id, actor: f.name, kind: "foe_leaves", text: `${f.name} ${f.exit}.` });
  };

  const hurtFoe = (f: Foe, amount: number) => {
    f.hp = Math.max(0, f.hp - Math.max(0, amount));
    if (f.hp === 0) foeLeaves(f, "beaten");
    else if (!f.bloodiedChecked && f.hp <= f.hpMax / 2) {
      f.bloodiedChecked = true;
      foeLeaves(f, "bloodied");
    }
  };

  const heal = (target: HeroCombatant, amount: number) => {
    const wasDown = isDownHero(target);
    const v = healHero(
      { hp: target.hp, hpMax: target.hpMax, tempHp: target.tempHp, conditions: target.conditions },
      amount,
    );
    target.hp = v.hp;
    target.conditions = v.conditions;
    return wasDown && !isDownHero(target);
  };

  const heroTurn = (h: HeroCombatant, action: CombatAction) => {
    if (isDownHero(h)) {
      const r = rollRally({ hp: h.hp, hpMax: h.hpMax, tempHp: h.tempHp, conditions: h.conditions }, rng);
      h.hp = r.vitality.hp;
      h.conditions = r.vitality.conditions;
      events.push({
        actorId: h.id,
        actor: h.name,
        kind: "rally",
        text: r.success
          ? `${h.name} shakes off the daze and gets back up!`
          : `${h.name} is still seeing stars.`,
        roll: {
          label: "Rally",
          natural: r.natural,
          rolls: [r.natural],
          modifier: 0,
          total: r.natural,
          against: "10",
          success: r.success,
          mode: "normal",
        },
      });
      return;
    }
    if (h.conditions.includes("prone")) h.conditions = h.conditions.filter((c) => c !== "prone");
    if (h.conditions.includes("stunned")) {
      events.push({ actorId: h.id, actor: h.name, kind: "wait", text: `${h.name} is too dizzy to act.` });
      return;
    }

    switch (action.kind) {
      case "attack": {
        const foe = firstFighting(action.targetId);
        if (!foe) return;
        const atk = h.attacks.find((a) => a.id === action.attackId) ?? (h.attacks[0] as HeroAttack);
        const mode = attackRollMode({
          attacker: h.conditions,
          target: foe.conditions,
          melee: !atk.ranged,
          extraAdvantage: foe.distracted,
        });
        const upperHand = mode === "advantage" || foe.distracted;
        foe.distracted = false;
        const bless = state.blessed.includes(h.id) ? rng.int(1, 4) : 0;
        const roll = rollAttack(atk.bonus + bless, foe.ac, mode, rng);
        let text = `${h.name} ${atk.ranged ? "shoots" : "swings"} ${atk.name} at ${foe.name}`;
        let dmg = 0;
        if (roll.hit) {
          dmg = rollDamage(atk.damage, roll.critical, rng).total;
          if (h.sneakDice && upperHand) dmg += rollDamage(h.sneakDice, roll.critical, rng).total;
          text += roll.critical ? ` and lands a mighty hit for ${dmg}!` : ` and hits for ${dmg}.`;
        } else text += " but misses.";
        events.push({
          actorId: h.id,
          actor: h.name,
          kind: "attack",
          targetId: foe.id,
          target: foe.name,
          text,
          roll: toRoll(atk.name, roll, atk.bonus + bless, roll.total, `armor ${foe.ac}`, roll.hit, dmg),
        });
        if (dmg > 0) hurtFoe(foe, dmg);
        return;
      }
      case "cast": {
        const spell = h.spells.find((s) => s.id === action.spellId);
        if (!spell) return heroTurn(h, { kind: "defend" });
        if (spell.level > 0) {
          const slot = slotFor(h, spell.level);
          if (slot === null) {
            events.push({
              actorId: h.id,
              actor: h.name,
              kind: "wait",
              text: `${h.name} reaches for ${spell.name}, but their magic is all used up for today.`,
            });
            return;
          }
          h.slots[slot - 1] = (h.slots[slot - 1] ?? 1) - 1;
          usedSlots.push({ heroId: h.id, level: slot });
        }
        castSpell(h, spell, action.targetId);
        return;
      }
      case "defend":
        events.push({ actorId: h.id, actor: h.name, kind: "defend", text: `${h.name} raises their guard.` });
        return;
      case "help": {
        const foe = firstFighting(action.targetId);
        if (!foe) return;
        foe.distracted = true;
        events.push({
          actorId: h.id,
          actor: h.name,
          kind: "distract",
          targetId: foe.id,
          target: foe.name,
          text: `${h.name} distracts ${foe.name}, opening it up for a friend.`,
        });
        return;
      }
      case "item": {
        const potion = h.potions.find((p) => p.itemId === action.itemId && p.qty > 0);
        if (!potion) {
          events.push({
            actorId: h.id,
            actor: h.name,
            kind: "wait",
            text: `${h.name} rummages for a potion but finds none.`,
          });
          return;
        }
        potion.qty -= 1;
        usedItems.push({ heroId: h.id, itemId: potion.itemId });
        const target = heroTarget(h, action.targetId);
        const amount = Math.max(1, rollDice(potion.dice, rng).total);
        const woke = heal(target, amount);
        events.push({
          actorId: h.id,
          actor: h.name,
          kind: "item",
          targetId: target.id,
          target: target.name,
          text: `${h.name} shares ${potion.name} with ${target.id === h.id ? "themself" : target.name}, healing ${amount}${woke ? " and waking them up" : ""}.`,
        });
        return;
      }
      case "spare": {
        const foe = foeById.get(action.targetId);
        if (foe?.status !== "at_mercy") {
          events.push({
            actorId: h.id,
            actor: h.name,
            kind: "wait",
            text: `${h.name} looks for a foe who has given up, but none has yet.`,
          });
          return;
        }
        foe.status = "spared";
        foe.exit = "was spared and let go";
        spared.push(foe.id);
        events.push({
          actorId: h.id,
          actor: h.name,
          kind: "spare",
          targetId: foe.id,
          target: foe.name,
          text: `${h.name} lets ${foe.name} go free.`,
        });
        return;
      }
      case "trick": {
        const foe = firstFighting(action.targetId);
        let text = `${h.name} tries something clever: ${action.summary}`;
        if (action.success && foe) {
          foe.distracted = true;
          text += ` It works! ${foe.name} is thrown off balance.`;
          if (creatures.get(foe.creatureId)?.morale === "skittish") {
            foe.status = "fled";
            foe.exit = "fled in fear";
          }
        } else text += " It doesn't quite work.";
        events.push({
          actorId: h.id,
          actor: h.name,
          kind: "trick",
          ...(foe ? { targetId: foe.id, target: foe.name } : {}),
          text,
          ...(action.roll ? { roll: action.roll } : {}),
        });
        if (foe?.status === "fled")
          events.push({
            actorId: foe.id,
            actor: foe.name,
            kind: "foe_leaves",
            text: `${foe.name} ${foe.exit}.`,
          });
        return;
      }
      case "none":
        events.push({
          actorId: h.id,
          actor: h.name,
          kind: "wait",
          text: `${h.name} ${action.summary ?? "watches carefully"}.`,
        });
        return;
    }
  };

  const castSpell = (h: HeroCombatant, spell: HeroSpell, targetId?: string) => {
    const e = spell.effect;
    const base = { actorId: h.id, actor: h.name, kind: "spell" as const };
    switch (e.kind) {
      case "attack": {
        const foe = firstFighting(targetId);
        if (!foe) return;
        const mode = attackRollMode({
          attacker: h.conditions,
          target: foe.conditions,
          melee: false,
          extraAdvantage: foe.distracted,
        });
        foe.distracted = false;
        const bonus = h.spellAttack ?? 0;
        const roll = rollAttack(bonus, foe.ac, mode, rng);
        let text = `${h.name} casts ${spell.name} at ${foe.name}`;
        let dmg = 0;
        if (roll.hit) {
          dmg = rollDamage(scaleCantrip(e.damage, h.level, e.scalesAtLevels), roll.critical, rng).total;
          text += ` and hits for ${dmg}.`;
        } else text += " but it goes wide.";
        events.push({
          ...base,
          targetId: foe.id,
          target: foe.name,
          text,
          roll: toRoll(spell.name, roll, bonus, roll.total, `armor ${foe.ac}`, roll.hit, dmg),
        });
        if (dmg > 0) hurtFoe(foe, dmg);
        return;
      }
      case "save-damage":
      case "save-condition": {
        const foe = firstFighting(targetId);
        if (!foe) return;
        const creature = creatures.get(foe.creatureId);
        const saveMod = abilityModifier(creature?.abilities[e.save] ?? 10);
        const d20 = rollD20(
          rng,
          e.save === "dex" && foe.conditions.includes("restrained") ? "disadvantage" : "normal",
        );
        const total = d20.natural + saveMod;
        const dc = h.spellDc ?? 10;
        const saved = total >= dc;
        let text = `${h.name} casts ${spell.name} on ${foe.name}`;
        let dmg = 0;
        if (e.kind === "save-damage") {
          const full = rollDamage(scaleCantrip(e.damage, h.level, e.scalesAtLevels), false, rng).total;
          dmg = saved ? (e.halfOnSave ? Math.floor(full / 2) : 0) : full;
          text += dmg > 0 ? ` for ${dmg}.` : `, but ${foe.name} shrugs it off.`;
        } else if (saved) {
          text += `, but ${foe.name} shrugs it off.`;
        } else if (e.condition === "stunned") {
          foe.status = "at_mercy";
          foe.exit = "fell fast asleep";
          text += ` and ${foe.name} curls up and falls fast asleep.`;
        } else {
          foe.conditions = [...new Set([...foe.conditions, e.condition])];
          foe.conditionRounds[e.condition] = Math.min(e.rounds, 3);
          text += ` and ${foe.name} is ${e.condition === "restrained" ? "tangled up" : e.condition}.`;
        }
        const roll = toRoll(`${foe.name} resists`, d20, saveMod, total, `${dc}`, !saved, dmg);
        events.push({ ...base, targetId: foe.id, target: foe.name, text, roll });
        if (dmg > 0) hurtFoe(foe, dmg);
        return;
      }
      case "auto-damage": {
        const foe = firstFighting(targetId);
        if (!foe) return;
        let dmg = 0;
        for (let i = 0; i < e.darts; i++) dmg += rollDamage(e.dartDamage, false, rng).total;
        events.push({
          ...base,
          targetId: foe.id,
          target: foe.name,
          text: `${h.name}'s ${spell.name} streaks into ${foe.name} for ${dmg}.`,
        });
        hurtFoe(foe, dmg);
        return;
      }
      case "heal": {
        const target = heroTarget(h, targetId);
        const amount = Math.max(1, rollDice(e.dice, rng).total + (e.addModifier ? h.spellMod : 0));
        const woke = heal(target, amount);
        events.push({
          ...base,
          kind: "heal",
          targetId: target.id,
          target: target.name,
          text: `${h.name} casts ${spell.name} on ${target.id === h.id ? "themself" : target.name}, healing ${amount}${woke ? " and waking them up" : ""}.`,
        });
        return;
      }
      case "buff": {
        if (spell.id === "shield") {
          shielded.add(h.id);
          events.push({ ...base, kind: "buff", text: `${h.name} conjures a shimmering shield.` });
        } else if (e.appliesTo.includes("ac")) {
          const target = heroTarget(h, targetId);
          state.warded[target.id] = Math.max(state.warded[target.id] ?? 0, Number(e.bonus) || 2);
          events.push({
            ...base,
            kind: "buff",
            targetId: target.id,
            target: target.name,
            text: `${h.name} wraps ${target.id === h.id ? "themself" : target.name} in ${spell.name}.`,
          });
        } else {
          const targets = [h, ...[...heroes.values()].filter((x) => x.id !== h.id && !isDownHero(x))].slice(
            0,
            e.targets,
          );
          state.blessed = [...new Set([...state.blessed, ...targets.map((t) => t.id)])];
          events.push({
            ...base,
            kind: "buff",
            text: `${h.name} casts ${spell.name} on ${targets.map((t) => t.name).join(", ")}.`,
          });
        }
        return;
      }
      default:
        events.push({ ...base, kind: "wait", text: `${h.name} casts ${spell.name}.` });
    }
  };

  const foeTurn = (f: Foe) => {
    if (f.conditions.includes("stunned")) return;
    const creature = creatures.get(f.creatureId);
    if (!creature) return;
    // Gentle: foes only go after heroes who are still standing.
    const standing = [...heroes.values()].filter((h) => !isDownHero(h));
    if (standing.length === 0) return;
    const target = rng.pick(standing);
    const attack = rng.pick(creature.attacks);
    const packmate =
      creature.traits.some((t) => t.name === "Pack Tactics") &&
      state.foes.some((o) => o.id !== f.id && o.creatureId === f.creatureId && o.status === "fighting");
    const mode = attackRollMode({
      attacker: f.conditions,
      target: target.conditions,
      melee: !attack.range,
      extraAdvantage: packmate,
      extraDisadvantage: defending.has(target.id),
    });
    const ac = target.ac + (state.warded[target.id] ?? 0) + (shielded.has(target.id) ? 5 : 0);
    const roll = rollAttack(attack.bonus, ac, mode, rng);
    let text = `${f.name} tries ${attack.name} on ${target.name}`;
    let dmg = 0;
    if (roll.hit) {
      dmg = rollDamage(attack.damage, roll.critical, rng).total;
      const out = applyDamageToHero(
        { hp: target.hp, hpMax: target.hpMax, tempHp: target.tempHp, conditions: target.conditions },
        dmg,
      );
      target.hp = out.vitality.hp;
      target.tempHp = out.vitality.tempHp;
      target.conditions = out.vitality.conditions;
      text += ` and hits for ${dmg}.`;
      if (out.droppedToZero) {
        downed.push(target.id);
        text += ` ${target.name} is dazed!`;
      } else if (attack.effect && !target.conditions.includes(attack.effect.condition as Condition)) {
        const condition = attack.effect.condition as Condition;
        const save = rollD20(rng).natural + (target.saves[attack.effect.save as Ability] ?? 0);
        if (save < attack.effect.dc) {
          target.conditions = [...target.conditions, condition];
          text += ` ${target.name} is ${condition === "prone" ? "knocked down" : condition}.`;
        }
      }
    } else text += " but misses.";
    events.push({
      actorId: f.id,
      actor: f.name,
      kind: "foe_attack",
      targetId: target.id,
      target: target.name,
      text,
      roll: toRoll(attack.name, roll, attack.bonus, roll.total, `armor ${ac}`, roll.hit, dmg),
    });
  };

  for (const entry of state.order) {
    if (fightingFoes(state).length === 0) break;
    if (entry.side === "foe") {
      const f = foeById.get(entry.id);
      if (f?.status === "fighting") foeTurn(f);
    } else {
      const h = heroes.get(entry.id);
      if (h) heroTurn(h, actions[h.id] ?? { kind: "defend" });
    }
  }

  // Spell conditions wear off.
  for (const f of state.foes) {
    for (const [cond, left] of Object.entries(f.conditionRounds)) {
      const next = (left ?? 0) - 1;
      if (next <= 0) {
        delete f.conditionRounds[cond as Condition];
        f.conditions = f.conditions.filter((c) => c !== cond);
      } else f.conditionRounds[cond as Condition] = next;
    }
  }

  state.round += 1;
  if (state.round >= MAX_COMBAT_ROUNDS && fightingFoes(state).length > 0) {
    for (const f of fightingFoes(state)) {
      f.status = "fled";
      f.exit = "slipped away";
    }
    events.push({
      actorId: "foes",
      actor: "The foes",
      kind: "retreat",
      text: "Worn out, the last foes give up and slip away.",
    });
  }

  const allDown = [...heroes.values()].every(isDownHero);
  if (fightingFoes(state).length === 0) {
    state.outcome = "victory";
    state.phase = foesAtMercy(state).length > 0 ? "aftermath" : "over";
  } else if (allDown) {
    state.outcome = "party_down";
    state.phase = "over";
  }
  return { state, heroes: [...heroes.values()], events, downed, spared, usedItems, usedSlots };
}

/** For the narrator and screen: a foe's health in words, never numbers. */
export function foeCondition(f: Foe): string {
  if (f.status !== "fighting") return f.exit ?? f.status;
  const frac = f.hp / f.hpMax;
  if (frac > 0.75) return "fresh";
  if (frac > 0.5) return "a bit scuffed";
  if (frac > 0.25) return "wobbly";
  return "nearly done";
}
