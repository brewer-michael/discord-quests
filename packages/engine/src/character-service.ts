import {
  ABILITIES,
  ABILITY_NAMES,
  type Ability,
  type AbilityIncrements,
  canDecrement,
  canIncrement,
  deriveStats,
  isLegalAsi,
  pointsRemaining,
  previewLevelUp,
  SKILL_NAMES,
  type Skill,
} from "@dq/core/rules";
import { checkPlayerText } from "@dq/core/safety";
import { SRD_CLASSES } from "@dq/core/srd";
import { campaigns, characters, inventoryItems } from "@dq/db";
import { and, eq } from "drizzle-orm";
import {
  buildFinalCharacter,
  buildFor,
  type CreationState,
  classSkillChoices,
  currentBase,
  draftRefs,
  finalAbilities,
  formativeOptions,
  missingSteps,
  recommendedFormative,
  recommendedSkills,
  recommendedUpbringing,
} from "./character-rules";
import { type EngineDeps, GameError } from "./deps";
import type { CharacterSheetView } from "./views";

export type DraftOp =
  | { op: "mode"; mode: "guided" | "advanced" }
  | { op: "class"; classId: string }
  | { op: "path"; pathId: string }
  | { op: "background"; backgroundId: string }
  | { op: "species"; speciesId: string }
  | { op: "upbringing"; upbringingId: string }
  | { op: "formative"; optionId: string }
  | { op: "ability"; ability: Ability; delta: 1 | -1 }
  | { op: "reset-abilities" }
  | { op: "recommended" }
  | { op: "skills"; skills: string[] }
  | { op: "keepsake"; keepsakeId: string }
  | { op: "name"; name: string; look: string };

export interface DraftView {
  characterId: string;
  mode: "guided" | "advanced";
  name: string;
  look: string;
  classId: string | null;
  pathId: string | null;
  backgroundId: string | null;
  speciesId: string | null;
  upbringingId: string | null;
  keepsakeId: string | null;
  base: Record<Ability, number>;
  bonus: AbilityIncrements;
  final: Record<Ability, number>;
  pointsRemaining: number;
  canIncrement: Record<Ability, boolean>;
  canDecrement: Record<Ability, boolean>;
  formativeOptions: Array<{ id: string; label: string; description: string; selected: boolean }>;
  skillOptions: Array<{ id: string; name: string; selected: boolean }>;
  skillCount: number;
  keepsakeOptions: Array<{ id: string; name: string; description: string }>;
  preview: { hpMax: number; armorClass: number; topSkills: string[] } | null;
  missing: string[];
}

export class CharacterService {
  constructor(private readonly deps: EngineDeps) {}

  private async campaign(campaignId: string) {
    const [c] = await this.deps.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!c) throw new GameError("campaign not found", "That campaign doesn't exist anymore.");
    return c;
  }

  private async draftRow(campaignId: string, userId: string) {
    const [row] = await this.deps.db
      .select()
      .from(characters)
      .where(
        and(
          eq(characters.campaignId, campaignId),
          eq(characters.userId, userId),
          eq(characters.status, "draft"),
        ),
      );
    return row;
  }

  /** Starts (or resumes) a hero for this player in this campaign. */
  async startDraft(campaignId: string, userId: string): Promise<DraftView> {
    const c = await this.campaign(campaignId);
    const [active] = await this.deps.db
      .select()
      .from(characters)
      .where(
        and(
          eq(characters.campaignId, campaignId),
          eq(characters.userId, userId),
          eq(characters.status, "active"),
        ),
      );
    if (active)
      throw new GameError("already has a hero", `You already have a hero in this campaign: ${active.name}.`);
    let row = await this.draftRow(campaignId, userId);
    if (!row) {
      const creation: CreationState = { mode: "guided" };
      [row] = await this.deps.db
        .insert(characters)
        .values({ campaignId, userId, creation: creation as unknown as Record<string, unknown> })
        .returning();
    }
    if (!row) throw new Error("could not create draft");
    return this.view(c.worldId, row);
  }

  async updateDraft(campaignId: string, userId: string, op: DraftOp): Promise<DraftView> {
    const c = await this.campaign(campaignId);
    const row = await this.draftRow(campaignId, userId);
    if (!row) throw new GameError("no draft", "Start a new hero first with /character create.");
    const { index } = this.deps.worlds.get(c.worldId);
    const world = index.world;
    const state = { ...(row.creation as unknown as CreationState) };
    const patch: Partial<typeof characters.$inferInsert> = {};
    const refs = draftRefs(index, row);

    switch (op.op) {
      case "mode":
        state.mode = op.mode;
        break;
      case "class":
        if (!index.classes.has(op.classId)) throw new GameError("bad class", "That class isn't available.");
        patch.classId = op.classId;
        state.skillChoices = undefined;
        break;
      case "path":
        if (!world.paths.some((p) => p.id === op.pathId))
          throw new GameError("bad path", "That path isn't available.");
        patch.pathId = op.pathId;
        break;
      case "background":
        if (!index.backgrounds.has(op.backgroundId))
          throw new GameError("bad background", "That background isn't available.");
        patch.backgroundId = op.backgroundId;
        state.bonus = undefined;
        state.skillChoices = undefined;
        break;
      case "species":
        if (!index.species.has(op.speciesId))
          throw new GameError("bad species", "That people isn't available.");
        patch.speciesId = op.speciesId;
        break;
      case "upbringing": {
        const up = world.guided.upbringings.find((u) => u.id === op.upbringingId);
        if (!up) throw new GameError("bad upbringing", "That upbringing isn't available.");
        state.upbringingId = up.id;
        state.base = { ...up.scores };
        break;
      }
      case "formative": {
        const background = refs.background;
        if (!background) throw new GameError("no background", "Pick a background first.");
        const opt = formativeOptions(world, background).find((o) => o.id === op.optionId);
        if (!opt) throw new GameError("bad option", "That choice isn't available.");
        state.bonus = opt.increments;
        break;
      }
      case "ability": {
        const base = currentBase(state);
        if (op.delta === 1 ? !canIncrement(base, op.ability) : !canDecrement(base, op.ability)) break;
        state.base = { ...base, [op.ability]: base[op.ability] + op.delta };
        state.upbringingId = undefined;
        break;
      }
      case "reset-abilities":
        state.base = undefined;
        state.upbringingId = undefined;
        break;
      case "recommended": {
        if (!refs.cls) throw new GameError("no class", "Pick a class first.");
        const up = recommendedUpbringing(world, refs.cls.id);
        if (up) {
          state.base = { ...up.scores };
          state.upbringingId = up.id;
        }
        if (refs.background) {
          state.bonus = recommendedFormative(world, refs.background, refs.cls).increments;
          state.skillChoices = recommendedSkills(refs.cls, refs.background);
        }
        break;
      }
      case "skills": {
        if (!refs.cls) throw new GameError("no class", "Pick a class first.");
        const { count, from } = classSkillChoices(refs.cls, refs.background);
        const picks = op.skills.filter((s): s is Skill => from.includes(s as Skill));
        if (picks.length !== count || new Set(picks).size !== count) {
          throw new GameError("bad skills", `Pick exactly ${count} different skills from the list.`);
        }
        state.skillChoices = picks;
        break;
      }
      case "keepsake":
        if (!world.items.keepsakes.some((k) => k.id === op.keepsakeId))
          throw new GameError("bad keepsake", "That keepsake isn't available.");
        patch.keepsakeId = op.keepsakeId;
        break;
      case "name": {
        const name = op.name.trim().replace(/\s+/g, " ");
        const look = op.look.trim().replace(/\s+/g, " ");
        if (name.length < 2 || name.length > 32)
          throw new GameError("bad name", "Hero names need 2 to 32 letters.");
        if (look.length > 200) throw new GameError("bad look", "Keep the description under 200 characters.");
        const verdict = checkPlayerText(`${name}. ${look}`, world);
        if (!verdict.allow) throw new GameError("unsafe name", verdict.message ?? "Try a different name.");
        patch.name = name;
        patch.look = look;
        break;
      }
    }

    const [updated] = await this.deps.db
      .update(characters)
      .set({ ...patch, creation: state as unknown as Record<string, unknown>, updatedAt: new Date() })
      .where(eq(characters.id, row.id))
      .returning();
    return this.view(c.worldId, updated ?? row);
  }

  async getDraft(campaignId: string, userId: string): Promise<DraftView | null> {
    const c = await this.campaign(campaignId);
    const row = await this.draftRow(campaignId, userId);
    return row ? this.view(c.worldId, row) : null;
  }

  private view(worldId: string, row: typeof characters.$inferSelect): DraftView {
    const { index } = this.deps.worlds.get(worldId);
    const world = index.world;
    const state = row.creation as unknown as CreationState;
    const refs = draftRefs(index, row);
    const base = currentBase(state);
    const final = (() => {
      try {
        return finalAbilities(state);
      } catch {
        return base;
      }
    })();
    const skillSel = new Set(state.skillChoices ?? []);
    const skillSpec = refs.cls
      ? classSkillChoices(refs.cls, refs.background)
      : { count: 0, from: [] as Skill[] };
    let preview: DraftView["preview"] = null;
    if (refs.cls && refs.species) {
      const build = buildFor(index, {
        classId: refs.cls.id,
        speciesId: refs.species.id,
        level: 1,
        abilities: final,
        skills: [...(refs.background?.skills ?? []), ...(state.skillChoices ?? [])],
        expertise: [],
        armorId: refs.cls.startingKit.armor
          ? (world.items.armor.find((a) => a.id === refs.cls?.startingKit.armor)?.base ?? null)
          : null,
        shield: refs.cls.startingKit.shield,
      });
      if (build) {
        const d = deriveStats(build);
        const top = Object.entries(d.skills)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([s, v]) => `${SKILL_NAMES[s as Skill]} ${v >= 0 ? "+" : ""}${v}`);
        preview = { hpMax: d.hitPointMax, armorClass: d.armorClass, topSkills: top };
      }
    }
    const keepsakeIds = refs.background?.keepsakeSuggestions ?? [];
    const keepsakes = [
      ...world.items.keepsakes.filter((k) => keepsakeIds.includes(k.id)),
      ...world.items.keepsakes.filter((k) => !keepsakeIds.includes(k.id)),
    ];
    return {
      characterId: row.id,
      mode: state.mode,
      name: row.name,
      look: row.look,
      classId: row.classId,
      pathId: row.pathId,
      backgroundId: row.backgroundId,
      speciesId: row.speciesId,
      upbringingId: state.upbringingId ?? null,
      keepsakeId: row.keepsakeId,
      base,
      bonus: state.bonus ?? {},
      final,
      pointsRemaining: pointsRemaining(base),
      canIncrement: Object.fromEntries(ABILITIES.map((a) => [a, canIncrement(base, a)])) as Record<
        Ability,
        boolean
      >,
      canDecrement: Object.fromEntries(ABILITIES.map((a) => [a, canDecrement(base, a)])) as Record<
        Ability,
        boolean
      >,
      formativeOptions: refs.background
        ? formativeOptions(world, refs.background).map((o) => ({
            id: o.id,
            label: o.label,
            description: o.description,
            selected: JSON.stringify(o.increments) === JSON.stringify(state.bonus ?? null),
          }))
        : [],
      skillOptions: skillSpec.from.map((s) => ({ id: s, name: SKILL_NAMES[s], selected: skillSel.has(s) })),
      skillCount: skillSpec.count,
      keepsakeOptions: keepsakes.map((k) => ({ id: k.id, name: k.name, description: k.description })),
      preview,
      missing: missingSteps(row, state, refs),
    };
  }

  /** Locks in the hero: final scores, starting kit, hit points. */
  async finalize(campaignId: string, userId: string): Promise<CharacterSheetView> {
    const c = await this.campaign(campaignId);
    const row = await this.draftRow(campaignId, userId);
    if (!row) throw new GameError("no draft", "Start a new hero first with /character create.");
    const { index } = this.deps.worlds.get(c.worldId);
    const state = row.creation as unknown as CreationState;
    const refs = draftRefs(index, row);
    const missing = missingSteps(row, state, refs);
    if (missing.length > 0 || !refs.cls || !refs.background || !refs.species || !row.keepsakeId) {
      throw new GameError("incomplete", `Your hero still needs: ${missing.join(", ")}.`);
    }
    let final: ReturnType<typeof buildFinalCharacter>;
    try {
      final = buildFinalCharacter(
        index,
        { cls: refs.cls, background: refs.background, species: refs.species },
        state,
        row.keepsakeId,
      );
    } catch (e) {
      throw new GameError(
        (e as Error).message,
        `Something about this hero isn't quite right: ${(e as Error).message}.`,
      );
    }
    await this.deps.db.transaction(async (tx) => {
      await tx
        .update(characters)
        .set({
          status: "active",
          guided: state.mode === "guided",
          abilities: final.abilities,
          skills: final.skills,
          expertise: final.expertise,
          armorId: final.armorId,
          shield: final.shield,
          hp: final.hpMax,
          hpMax: final.hpMax,
          gold: final.gold,
          level: index.world.meta.startingLevel,
          updatedAt: new Date(),
        })
        .where(eq(characters.id, row.id));
      if (final.inventory.length > 0) {
        await tx.insert(inventoryItems).values(final.inventory.map((it) => ({ characterId: row.id, ...it })));
      }
    });
    return this.sheet(row.id);
  }

  async activeCharacters(campaignId: string) {
    return this.deps.db
      .select()
      .from(characters)
      .where(and(eq(characters.campaignId, campaignId), eq(characters.status, "active")));
  }

  async characterFor(campaignId: string, userId: string) {
    const [row] = await this.deps.db
      .select()
      .from(characters)
      .where(
        and(
          eq(characters.campaignId, campaignId),
          eq(characters.userId, userId),
          eq(characters.status, "active"),
        ),
      );
    return row ?? null;
  }

  async sheet(characterId: string): Promise<CharacterSheetView> {
    const [row] = await this.deps.db.select().from(characters).where(eq(characters.id, characterId));
    if (!row) throw new GameError("no character", "That hero doesn't exist.");
    const [c] = await this.deps.db.select().from(campaigns).where(eq(campaigns.id, row.campaignId));
    if (!c) throw new GameError("no campaign", "That campaign doesn't exist.");
    const { index } = this.deps.worlds.get(c.worldId);
    const world = index.world;
    const build = buildFor(index, row);
    if (!build) throw new GameError("incomplete", "That hero isn't finished yet.");
    const d = deriveStats(build);
    const inv = await this.deps.db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.characterId, row.id));
    const cls = row.classId ? index.classes.get(row.classId) : undefined;
    const path = world.paths.find((p) => p.id === row.pathId);
    const srd = cls ? SRD_CLASSES[cls.srdClass] : undefined;
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      look: row.look,
      className: cls?.name ?? "?",
      pathName: path?.name ?? "?",
      speciesName: (row.speciesId && index.species.get(row.speciesId)?.name) || "?",
      backgroundName: (row.backgroundId && index.backgrounds.get(row.backgroundId)?.name) || "?",
      level: row.level,
      xpNote: "Heroes grow at the big moments of the story.",
      hp: row.hp,
      hpMax: row.hpMax,
      armorClass: d.armorClass,
      speed: d.speed,
      abilities: Object.fromEntries(
        ABILITIES.map((a) => [ABILITY_NAMES[a], { score: build.abilities[a], modifier: d.modifiers[a] }]),
      ),
      proficiencyBonus: d.proficiencyBonus,
      skills: (Object.keys(d.skills) as Skill[]).map((s) => ({
        name: SKILL_NAMES[s],
        modifier: d.skills[s],
        proficient: row.skills.includes(s),
        expertise: row.expertise.includes(s),
      })),
      savingThrows: Object.fromEntries(ABILITIES.map((a) => [ABILITY_NAMES[a], d.savingThrows[a]])),
      conditions: row.conditions,
      inventory: inv.map((i) => ({
        name: index.items.get(i.itemId)?.name ?? i.itemId,
        qty: i.qty,
        equipped: i.equipped,
      })),
      gold: row.gold,
      keepsake: row.keepsakeId ? (index.items.get(row.keepsakeId)?.name ?? null) : null,
      spellSlots: d.spellSlots,
      features: (srd?.features ?? [])
        .filter((f) => f.level <= row.level)
        .map((f) => `${f.name}: ${f.summary}`),
      perks: (path?.perks ?? []).map((p) => `${p.name}: ${p.description}`),
      pendingLevelUp: (row.resources.pendingLevels ?? 0) > 0,
    };
  }

  /** Spends one pending level. Guided players pick a story option; advanced players pick increments. */
  async levelUp(
    characterId: string,
    userId: string,
    choice: { asiOptionId?: string; increments?: AbilityIncrements },
  ) {
    const [row] = await this.deps.db.select().from(characters).where(eq(characters.id, characterId));
    if (!row || row.userId !== userId) throw new GameError("not yours", "That isn't your hero.");
    if ((row.resources.pendingLevels ?? 0) <= 0)
      throw new GameError("no level", "Your hero isn't ready to level up yet.");
    const [c] = await this.deps.db.select().from(campaigns).where(eq(campaigns.id, row.campaignId));
    if (!c) throw new GameError("no campaign", "That campaign doesn't exist.");
    const { index } = this.deps.worlds.get(c.worldId);
    const cls = row.classId ? index.classes.get(row.classId) : undefined;
    if (!cls) throw new GameError("no class", "That hero has no class.");
    const preview = previewLevelUp(cls.srdClass, row.level);
    let abilities = { ...row.abilities };
    if (preview.abilityScoreImprovement) {
      const inc =
        choice.increments ??
        index.world.guided.asiOptions.find((o) => o.id === choice.asiOptionId)?.increments ??
        null;
      if (!inc || !isLegalAsi(inc))
        throw new GameError("bad asi", "Choose how your hero grows: +2 to one ability, or +1 to two.");
      for (const a of ABILITIES) {
        const next = (abilities[a] ?? 10) + (inc[a] ?? 0);
        if (next > 20) throw new GameError("cap", "Abilities can't go above 20.");
        abilities = { ...abilities, [a]: next };
      }
    }
    const build = buildFor(index, { ...row, abilities, level: preview.toLevel });
    if (!build) throw new GameError("incomplete", "That hero isn't finished yet.");
    const hpMax = deriveStats(build).hitPointMax;
    await this.deps.db
      .update(characters)
      .set({
        level: preview.toLevel,
        abilities,
        hpMax,
        hp: Math.min(hpMax, row.hp + (hpMax - row.hpMax)),
        resources: { ...row.resources, pendingLevels: (row.resources.pendingLevels ?? 1) - 1 },
        updatedAt: new Date(),
      })
      .where(eq(characters.id, row.id));
    return { preview, sheet: await this.sheet(row.id) };
  }
}
