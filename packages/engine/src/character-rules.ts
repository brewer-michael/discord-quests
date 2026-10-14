import {
  ABILITIES,
  ABILITY_NAMES,
  type Ability,
  type AbilityIncrements,
  type AbilityScores,
  addIncrements,
  basePointBuyScores,
  type CharacterBuild,
  deriveStats,
  isLegalBackgroundBonus,
  isLegalPointBuy,
  SKILL_IDS,
  type Skill,
} from "@dq/core/rules";
import { SRD_ARMOR, SRD_CLASSES } from "@dq/core/srd";
import type { BackgroundDef, ClassDef, SpeciesDef, World, WorldIndex } from "@dq/core/world";

/** Character-creation wizard progress, stored on the draft character. */
export interface CreationState {
  mode: "guided" | "advanced";
  upbringingId?: string;
  base?: AbilityScores;
  bonus?: AbilityIncrements;
  skillChoices?: Skill[];
}

export interface FormativeOption {
  id: string;
  label: string;
  description: string;
  increments: AbilityIncrements;
}

/** Background bonus choices, phrased as story moments for guided players. */
export function formativeOptions(world: World, background: BackgroundDef): FormativeOption[] {
  const [a, b, c] = background.abilities;
  const flavor = world.guided.abilityFlavor;
  const out: FormativeOption[] = [];
  for (const plus2 of [a, b, c]) {
    for (const plus1 of [a, b, c]) {
      if (plus1 === plus2) continue;
      out.push({
        id: `${plus2}2-${plus1}1`,
        label: `${ABILITY_NAMES[plus2]} +2, ${ABILITY_NAMES[plus1]} +1`,
        description: `${flavor[plus2].plus2} ${flavor[plus1].plus1}`,
        increments: { [plus2]: 2, [plus1]: 1 },
      });
    }
  }
  out.push({
    id: "balanced",
    label: `${ABILITY_NAMES[a]}, ${ABILITY_NAMES[b]} and ${ABILITY_NAMES[c]} +1`,
    description: `${flavor[a].plus1} ${flavor[b].plus1} ${flavor[c].plus1}`,
    increments: { [a]: 1, [b]: 1, [c]: 1 },
  });
  return out;
}

export function recommendedUpbringing(world: World, classId: string) {
  return (
    world.guided.upbringings.find((u) => u.classAffinity.includes(classId)) ?? world.guided.upbringings[0]
  );
}

export function recommendedFormative(
  world: World,
  background: BackgroundDef,
  cls: ClassDef,
): FormativeOption {
  const options = formativeOptions(world, background);
  const primary = SRD_CLASSES[cls.srdClass].primaryAbilities;
  return (
    options.find((o) => primary.some((p) => o.increments[p] === 2)) ??
    options.find((o) => primary.some((p) => o.increments[p] === 1)) ??
    (options[0] as FormativeOption)
  );
}

export function classSkillChoices(
  cls: ClassDef,
  background: BackgroundDef | undefined,
): { count: number; from: Skill[] } {
  const srd = SRD_CLASSES[cls.srdClass];
  const pool = srd.skillChoices.from === "any" ? SKILL_IDS : srd.skillChoices.from;
  const taken = new Set<string>(background?.skills ?? []);
  return { count: srd.skillChoices.count, from: pool.filter((s) => !taken.has(s)) };
}

export function recommendedSkills(cls: ClassDef, background: BackgroundDef | undefined): Skill[] {
  const { count, from } = classSkillChoices(cls, background);
  const picks = (cls.suggestedSkills as Skill[]).filter((s) => from.includes(s));
  for (const s of from) if (picks.length < count && !picks.includes(s)) picks.push(s);
  return picks.slice(0, count);
}

export interface DraftRefs {
  cls?: ClassDef;
  background?: BackgroundDef;
  species?: SpeciesDef;
}

export function draftRefs(
  index: WorldIndex,
  row: { classId: string | null; backgroundId: string | null; speciesId: string | null },
): DraftRefs {
  return {
    ...(row.classId && index.classes.has(row.classId) ? { cls: index.classes.get(row.classId) } : {}),
    ...(row.backgroundId && index.backgrounds.has(row.backgroundId)
      ? { background: index.backgrounds.get(row.backgroundId) }
      : {}),
    ...(row.speciesId && index.species.has(row.speciesId)
      ? { species: index.species.get(row.speciesId) }
      : {}),
  };
}

export function currentBase(state: CreationState): AbilityScores {
  return state.base ?? basePointBuyScores();
}

export function finalAbilities(state: CreationState): AbilityScores {
  return addIncrements(currentBase(state), state.bonus ?? {});
}

export function speciesSkills(species: SpeciesDef | undefined): Skill[] {
  return (species?.traits ?? []).flatMap((t) => (t.effect.kind === "skill" ? [t.effect.skill as Skill] : []));
}

export function speciesHpBonus(species: SpeciesDef | undefined): number {
  return (species?.traits ?? []).reduce(
    (s, t) => s + (t.effect.kind === "hp_per_level" ? t.effect.amount : 0),
    0,
  );
}

export interface FinalCharacter {
  abilities: AbilityScores;
  skills: Skill[];
  expertise: Skill[];
  armorId: string | null;
  shield: boolean;
  hpMax: number;
  speed: number;
  inventory: Array<{ itemId: string; qty: number; equipped: boolean }>;
  gold: number;
}

export type Missing = Array<
  "class" | "path" | "background" | "species" | "abilities" | "skills" | "keepsake" | "name"
>;

export function missingSteps(
  row: {
    classId: string | null;
    pathId: string | null;
    backgroundId: string | null;
    speciesId: string | null;
    keepsakeId: string | null;
    name: string;
  },
  state: CreationState,
  refs: DraftRefs,
): Missing {
  const missing: Missing = [];
  if (!refs.cls) missing.push("class");
  if (!row.pathId) missing.push("path");
  if (!refs.background) missing.push("background");
  if (!refs.species) missing.push("species");
  if (!state.base || !state.bonus) missing.push("abilities");
  if (
    !state.skillChoices ||
    (refs.cls && state.skillChoices.length !== classSkillChoices(refs.cls, refs.background).count)
  ) {
    missing.push("skills");
  }
  if (!row.keepsakeId) missing.push("keepsake");
  if (row.name.trim().length < 2) missing.push("name");
  return missing;
}

/** Turns a completed draft into a playable level-1 character. Throws on anything invalid. */
export function buildFinalCharacter(
  index: WorldIndex,
  refs: Required<DraftRefs>,
  state: CreationState,
  keepsakeId: string,
): FinalCharacter {
  const { cls, background, species } = refs;
  const base = currentBase(state);
  if (!isLegalPointBuy(base)) throw new Error("ability scores are not a legal point buy");
  if (!state.bonus || !isLegalBackgroundBonus(state.bonus, background.abilities))
    throw new Error("background bonus is not legal");
  const abilities = finalAbilities(state);
  const { count, from } = classSkillChoices(cls, background);
  const chosen = state.skillChoices ?? [];
  if (
    chosen.length !== count ||
    chosen.some((s) => !from.includes(s)) ||
    new Set(chosen).size !== chosen.length
  ) {
    throw new Error(`choose ${count} different skills from the class list`);
  }
  const skills = [...new Set([...(background.skills as Skill[]), ...chosen, ...speciesSkills(species)])];
  const srd = SRD_CLASSES[cls.srdClass];
  const expertise = srd.expertiseAt?.[1] ? chosen.slice(0, srd.expertiseAt[1]) : [];

  const armorItem = cls.startingKit.armor
    ? index.world.items.armor.find((a) => a.id === cls.startingKit.armor)
    : undefined;
  const armorId = armorItem ? armorItem.base : null;
  if (armorId && !SRD_ARMOR[armorId]) throw new Error(`unknown armor ${armorId}`);
  const build: CharacterBuild = {
    classId: cls.srdClass,
    level: 1,
    abilities,
    skillProficiencies: skills,
    expertise,
    armorId,
    shield: cls.startingKit.shield,
    speed: species.speed,
    hpBonusPerLevel: speciesHpBonus(species),
  };
  const derived = deriveStats(build);
  const inventory = [
    ...cls.startingKit.weapons.map((id, i) => ({ itemId: id, qty: 1, equipped: i === 0 })),
    ...(cls.startingKit.armor ? [{ itemId: cls.startingKit.armor, qty: 1, equipped: true }] : []),
    ...(cls.startingKit.shield ? [{ itemId: "round-shield", qty: 1, equipped: true }] : []),
    ...cls.startingKit.gear.map((id) => ({ itemId: id, qty: 1, equipped: false })),
    { itemId: keepsakeId, qty: 1, equipped: false },
  ].filter((it) => index.items.has(it.itemId));
  return {
    abilities,
    skills,
    expertise,
    armorId,
    shield: cls.startingKit.shield,
    hpMax: derived.hitPointMax,
    speed: derived.speed,
    inventory,
    gold: 15,
  };
}

export function buildFor(
  index: WorldIndex,
  row: {
    classId: string | null;
    speciesId: string | null;
    level: number;
    abilities: Record<string, number>;
    skills: string[];
    expertise: string[];
    armorId: string | null;
    shield: boolean;
  },
): CharacterBuild | null {
  const cls = row.classId ? index.classes.get(row.classId) : undefined;
  if (!cls) return null;
  const species = row.speciesId ? index.species.get(row.speciesId) : undefined;
  const abilities = Object.fromEntries(ABILITIES.map((a) => [a, row.abilities[a] ?? 10])) as Record<
    Ability,
    number
  >;
  return {
    classId: cls.srdClass,
    level: row.level,
    abilities,
    skillProficiencies: row.skills as Skill[],
    expertise: row.expertise as Skill[],
    armorId: row.armorId,
    shield: row.shield,
    speed: species?.speed ?? 30,
    hpBonusPerLevel: speciesHpBonus(species),
  };
}
