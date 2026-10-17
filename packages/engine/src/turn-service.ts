import { createHash } from "node:crypto";
import {
  type CombatAction,
  CombatActionSchema,
  type CombatRules,
  type CombatState,
  canCast,
  DEFENSE_FOR,
  defensesOf,
  fightingFoes,
  foeCondition,
  foesAtMercy,
  isDownHero,
  resolveCombatRound,
  weakSpotWords,
} from "@dq/core/combat";
import type { TableRules } from "@dq/core/combat/bestiary";
import {
  compileEpilogue,
  type DeedCandidate,
  type EpilogueStyle,
  evaluateLoom,
  isShortcutTag,
  type LoomInput,
  type LoomResult,
  loomContext,
  type NarrativeDirective,
  type SceneEntity,
  snarePressure,
} from "@dq/core/loom";
import {
  DIFFICULTY_DC,
  type Difficulty,
  type IntentHint,
  IntentOutput,
  intentSystem,
  intentUser,
  NARRATION_LIMITS,
  type NarrationMode,
  type NarrationStory,
  type NarratorOutput,
  type PublicSceneData,
  type PublicSceneView,
  playerSafetySystem,
  publicSceneView,
  SafetyOutput,
  type SceneSpecView,
} from "@dq/core/narration";
import { deriveRng } from "@dq/core/rng";
import {
  type Ability,
  type CheckResult,
  type Condition,
  checkRollMode,
  combineMode,
  deriveStats,
  difficultyLabel,
  isAbility,
  isCondition,
  isSkill,
  type RollMode,
  resolveCheck,
  SKILL_NAMES,
  SKILLS,
  type Skill,
  successProbability,
} from "@dq/core/rules";
import { bannedTermsFor, checkPlayerText, isMetaProbe, pickDeflection } from "@dq/core/safety";
import {
  type ChangeContext,
  cruxDc,
  type StoryChange,
  type StoryPlan,
  storyProgress,
  validateChanges,
} from "@dq/core/story";
import type { WorldIndex } from "@dq/core/world";
import {
  approvalRequests,
  campaignMembers,
  campaignRegions,
  campaigns,
  canonEntities,
  characters,
  events,
  inventoryItems,
  npcs,
  pendingActions,
  promises,
  quests,
  rounds,
  safetyEvents,
  scenes,
  type Tx,
  turns,
} from "@dq/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { buildFor } from "./character-rules";
import { chapterRecaps, writeChapterRecap } from "./chronicle";
import {
  aftermathChoices,
  type CombatView,
  combatView,
  heroesFor,
  listFoes,
  rollViewsFrom,
  startFight,
  syncEntities,
  withEncounter,
} from "./combat";
import { type EngineDeps, GameError, realDice, silentLogger } from "./deps";
import {
  authoredPlan,
  type DirectorHero,
  frameNextScene,
  MAX_SCENE_LOG,
  normalizeSpec,
  pickSeed,
  provisionalScene,
  type SceneEntityState,
  type SceneSpec,
  sceneSpecView,
  seedStory,
  whereItCouldGo,
} from "./director";
import { clearPendingLoom, loadLoom, loadPendingLoom, saveLoom, savePendingLoom } from "./loom-store";
import { type NarrationResult, narrate } from "./narrator";
import { applyRestorePoint, loadRestorePoint, restorePointSeqs, saveRestorePoint } from "./restore-points";
import {
  castFromWorld,
  castMember,
  heroHook,
  loadPlan,
  loomMoments,
  normalizeLoom,
  personAnchor,
  savePlan,
  slug,
  troubles,
} from "./story-plan";
import { type CampaignStory, campaignStory, profileOf } from "./story-profile";
import { asStory, isRewound, type StoryState } from "./story-state";
import type {
  DmDraft,
  DraftHandoff,
  PreparedTurn,
  ResolveResult,
  RollView,
  SceneBrief,
  SubmitResult,
  TurnView,
} from "./views";

type CharacterRow = typeof characters.$inferSelect;
type CampaignRow = typeof campaigns.$inferSelect;

export interface StoredChoice {
  label: string;
  intent: IntentHint;
}

interface ResolvedAction {
  characterId: string;
  userId: string;
  name: string;
  summary: string;
  skill: Skill | null;
  ability: Ability | null;
  difficulty: Difficulty;
  targetRef: string | null;
  helpsCharacterId: string | null;
  deeds: DeedCandidate[];
  keepsPromiseTo: string | null;
  makesPromiseTo: string | null;
  passed: boolean;
  /** Why what the player typed couldn't be read into an action, when it couldn't. */
  unread?: string;
}

const SHORTCUT_EVIDENCE: DeedCandidate["evidence"] = {};

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);
}

export function campaignSettings(c: CampaignRow) {
  const s = c.settings as Record<string, unknown>;
  return {
    epilogueStyle: (s.epilogueStyle as EpilogueStyle) ?? "subtle",
    /**
     * Table rules for fights. The DM room's fight-rules switch (stored as partialHits) turns on the new rules
     * together: partial hits and the defense mix. Off unless the campaign switches them on.
     */
    combatRules: {
      partialHits: s.partialHits === true,
      defenseMix: s.partialHits === true,
    } satisfies CombatRules,
  };
}

/** The table's rules for fights: how dark the story gets, what it leaves out, and the fight rules. */
function tableRules(c: CampaignRow, told: CampaignStory): TableRules {
  return {
    intensity: told.story.intensity,
    avoid: told.story.lines,
    combat: campaignSettings(c).combatRules,
  };
}

/** A person's note to the storyteller, from the DM room. */
function dmNote(guidance: string): NarrativeDirective {
  return {
    kind: "dm_note",
    text: `The DM's note for this turn: ${guidance.trim().slice(0, 500)}`,
    mustNot: [],
  };
}

export class TurnService {
  constructor(private readonly deps: EngineDeps) {}

  private dice(campaignSeed: string, turnSeq: number, purpose: string) {
    return (this.deps.dice ?? realDice)(campaignSeed, turnSeq, purpose);
  }

  private get log() {
    return this.deps.log ?? silentLogger;
  }

  // ------------------------------------------------------------ opening

  /**
   * Starts the adventure: the director makes the campaign's own story from a seed and the heroes, with its first
   * scene, and the storyteller tells the opening. If either can't, the opening goes to a person in the DM room
   * with everything they need, and the adventure starts when they've told it.
   */
  async startCampaign(campaignId: string, userId: string): Promise<ResolveResult> {
    const db = this.deps.db;
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!c) throw new GameError("no campaign", "That campaign doesn't exist.");
    if (c.status !== "setup") throw new GameError("already started", "This campaign has already started.");
    if (c.createdBy !== userId && c.dmUserId !== userId)
      throw new GameError("not host", "Only the host or the DM can start the campaign.");
    const party = await this.party(campaignId);
    if (party.length === 0)
      throw new GameError("no heroes", "At least one hero needs to be ready before the adventure can begin.");
    const opening = await this.tellOpening(c, party);
    if (opening.handoff) return { kind: "draft", draft: await this.handOffOpening(c, opening) };
    return { kind: "turn", view: await this.commitOpening(opening) };
  }

  /** The director's story and first scene, and the storyteller's opening: or why they couldn't. Writes nothing. */
  private async tellOpening(c: CampaignRow, party: CharacterRow[], guidance = ""): Promise<OpeningDraft> {
    const db = this.deps.db;
    const { index } = this.deps.worlds.get(c.worldId);
    const loom = await loadLoom(db, c.id);
    const told = await campaignStory(db, c);
    const seed = pickSeed(index, told.story.premise, loom.masterSeed);
    if (!seed) throw new GameError("empty world", "This world has no stories to tell yet.");
    const seq = c.turnSeq + 1;
    const rules = tableRules(c, told);
    const scope = { guildId: c.guildId, campaignId: c.id };
    const seeded = await seedStory({
      llm: this.deps.llm,
      log: this.log,
      scope,
      index,
      telling: told.story,
      seed,
      length: told.profile.length,
      heroes: this.directorHeroes(index, party),
      loom: loom.state,
      rules,
      masterSeed: loom.masterSeed,
    });
    const base = { opening: true as const, campaignId: c.id, seq, mode: "opening" as const };
    if (!seeded.ok) {
      // A person starts the story from the seed as written; the director frames the next scene properly.
      const plan = authoredPlan(index, seed, told.profile.length);
      const regionId = seed.startRegions[0] as string;
      const spec = provisionalScene(index, plan, { regionId, poiId: null, chapter: 1 }, "");
      const view = await this.publicView({ c, index, plan, mode: "opening", story: told.story, spec, party });
      const where = seed.startRegions.map((id) => index.regions.get(id)?.name ?? id).join(", ");
      return {
        ...base,
        framed: false,
        plan,
        spec,
        view,
        choicesFor: view.scene,
        narration: blankNarration(),
        handoff: seeded.reasons,
        options: [
          ...seed.openings.map((o) => `It could begin: ${o.replace(/\s+/g, " ").trim()}`),
          `Where it can begin: ${where}.`,
          `Stakes: ${plan.stakes}`,
          ...plan.cast.map((m) => `${m.name}, ${m.role}.`),
        ],
      };
    }
    const { plan } = seeded.value;
    const spec = withEncounter(
      index,
      seeded.value.opening,
      party,
      heroesFor(index, party, await this.inventoryFor(party)),
      this.dice(loom.masterSeed, seq, "encounter"),
      rules,
    );
    const view = await this.publicView({ c, index, plan, mode: "opening", story: told.story, spec, party });
    const narration = await narrate({
      llm: this.deps.llm,
      world: index.world,
      view,
      directives: guidance ? [dmNote(guidance)] : [],
      scope,
      log: this.log,
      choicesFor: view.scene,
    });
    return {
      ...base,
      framed: true,
      plan,
      spec,
      view,
      choicesFor: view.scene,
      narration: narration.ok ? narration.output : blankNarration(),
      handoff: narration.ok ? null : narration.reasons,
      options: [],
    };
  }

  /** Starts the adventure and returns its opening, for callers that only go on once it's been told. */
  async openCampaign(campaignId: string, userId: string): Promise<TurnView> {
    const started = await this.startCampaign(campaignId, userId);
    if (started.kind === "turn") return started.view;
    throw new GameError(
      "handed off",
      "The storyteller couldn't tell the opening, so it's waiting for a person in the DM room.",
    );
  }

  /** Saves an opening the AI couldn't tell for a person in the DM room. */
  private async handOffOpening(c: CampaignRow, opening: OpeningDraft): Promise<DmDraft> {
    const approvalId = await this.deps.db.transaction(async (tx) => {
      await tx
        .insert(turns)
        .values({
          campaignId: c.id,
          seq: opening.seq,
          status: "awaiting_approval",
          stage: "opening",
          data: opening as unknown as Record<string, unknown>,
        })
        .onConflictDoUpdate({
          target: [turns.campaignId, turns.seq],
          set: {
            status: "awaiting_approval",
            stage: "opening",
            data: opening as unknown as Record<string, unknown>,
          },
        });
      const [turnRow] = await tx
        .select()
        .from(turns)
        .where(and(eq(turns.campaignId, c.id), eq(turns.seq, opening.seq)));
      const [req] = await tx
        .insert(approvalRequests)
        .values({
          campaignId: c.id,
          turnId: turnRow?.id as string,
          dmUserId: c.dmUserId ?? c.createdBy,
          draft: { seq: opening.seq, handoff: true },
        })
        .returning();
      return req?.id as string;
    });
    return this.draftFor(approvalId, opening, null);
  }

  /** Commits the opening scene and its first round, with the story plan and the opening as told. */
  private async commitOpening(opening: OpeningDraft): Promise<TurnView> {
    const db = this.deps.db;
    const out = opening.narration;
    return db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, opening.campaignId))
        .for("update");
      if (locked?.status !== "setup")
        throw new GameError("already started", "This campaign has already started.");
      const campaignId = locked.id;
      const { index } = this.deps.worlds.get(locked.worldId);
      const plan = structuredClone(opening.plan);
      // A scene a person opened is what they told.
      let spec: SceneSpec = opening.framed
        ? opening.spec
        : { ...opening.spec, summary: out.narration.slice(0, 700) };
      const party = await this.partyTx(tx, campaignId);
      const seq = locked.turnSeq + 1;
      const neighbors = index.regions.get(spec.regionId)?.edges.map((e) => e.to) ?? [];
      const story: StoryState = {
        ...asStory(locked.story),
        regionId: spec.regionId,
        poiId: spec.poiId,
        momentId: spec.momentId,
        sceneKind: spec.kind,
        roundsInScene: 0,
        closeNextRound: false,
        chapter: plan.chapter.number,
        discoveredRegions: [
          ...new Set([...asStory(locked.story).discoveredRegions, spec.regionId, ...neighbors]),
        ],
      };
      // The story may begin somewhere other than where the campaign was set up to.
      const before = asStory(locked.story).regionId;
      if (before && before !== spec.regionId)
        await tx
          .update(campaignRegions)
          .set({ state: "rumored" })
          .where(and(eq(campaignRegions.campaignId, campaignId), eq(campaignRegions.regionId, before)));
      await this.visit(tx, campaignId, spec.regionId, neighbors);
      const applied = await this.applyChanges(tx, {
        index,
        c: locked,
        plan,
        scenes: [spec],
        party,
        changes: out.changes,
        seq,
        story,
      });
      spec = applied.scenes[0] as SceneSpec;
      if (out.happened) spec = { ...spec, log: [out.happened] };
      const loom = await loadLoom(tx, campaignId);
      if (applied.fight)
        spec = startFight(
          index,
          spec,
          applied.fight,
          heroesFor(index, party, await this.inventoryForTx(tx, party)),
          this.dice(loom.masterSeed, seq, "fight"),
          tableRules(locked, await campaignStory(tx, locked)),
        );
      const sceneId = await this.insertScene(tx, campaignId, spec, seq);
      const fightStarts = spec.combat?.phase === "fighting";
      const roundId = await this.insertRound(
        tx,
        campaignId,
        sceneId,
        1,
        fightStarts ? [] : out.choices,
        fightStarts ? "combat" : "exploration",
      );
      story.sceneId = sceneId;
      await savePlan(tx, campaignId, plan, "the story begins", "seed");
      const turnData = { mode: "opening", narration: out } as unknown as Record<string, unknown>;
      const [draftRow] = await tx
        .select()
        .from(turns)
        .where(and(eq(turns.campaignId, campaignId), eq(turns.seq, seq)));
      if (draftRow)
        await tx
          .update(turns)
          .set({ status: "committed", stage: "committed", data: turnData, committedAt: new Date() })
          .where(eq(turns.id, draftRow.id));
      else
        await tx.insert(turns).values({
          campaignId,
          seq,
          status: "committed",
          stage: "committed",
          data: turnData,
          committedAt: new Date(),
        });
      await tx.insert(events).values({
        campaignId,
        turnSeq: seq,
        type: "campaign_started",
        payload: { sceneId, seed: plan.seedId },
      });
      await tx
        .update(campaigns)
        .set({
          status: "active",
          turnSeq: seq,
          story: story as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campaignId));
      await saveRestorePoint(tx, campaignId, seq, roundId);
      return this.turnView({
        c: locked,
        index,
        plan,
        seq,
        spec,
        out,
        rolls: [],
        roundId,
        sceneChanged: true,
        levelUps: [],
        ended: false,
        combat: spec.combat ? combatView(spec.combat, party) : null,
        ...(fightStarts ? { choices: [] } : {}),
      });
    });
  }

  /** Marks a region visited and its neighbors heard of. */
  private async visit(tx: Tx, campaignId: string, regionId: string, neighbors: string[]) {
    await tx
      .insert(campaignRegions)
      .values({ campaignId, regionId, state: "visited" })
      .onConflictDoUpdate({
        target: [campaignRegions.campaignId, campaignRegions.regionId],
        set: { state: "visited" },
      });
    for (const id of neighbors)
      await tx
        .insert(campaignRegions)
        .values({ campaignId, regionId: id, state: "rumored" })
        .onConflictDoNothing();
  }

  /** The heroes as the director builds the story around them. */
  private directorHeroes(index: WorldIndex, party: CharacterRow[]): DirectorHero[] {
    return party.map((p) => ({
      id: p.id,
      name: p.name,
      species: (p.speciesId && index.species.get(p.speciesId)?.name) || "",
      className: (p.classId && index.classes.get(p.classId)?.name) || "hero",
      background: (p.backgroundId && index.backgrounds.get(p.backgroundId)?.name) || "wanderer",
      keepsake:
        index.world.items.keepsakes.find((k) => k.id === p.keepsakeId)?.name.toLowerCase() ??
        "nothing special",
      path: index.world.paths.find((x) => x.id === p.pathId)?.name ?? "their own road",
      look: p.look ?? "",
    }));
  }

  async currentRound(campaignId: string) {
    const [r] = await this.deps.db
      .select()
      .from(rounds)
      .where(and(eq(rounds.campaignId, campaignId), eq(rounds.status, "collecting")))
      .orderBy(sql`${rounds.createdAt} desc`)
      .limit(1);
    return r ?? null;
  }

  /** Records what a hero does this round. Free text is safety-checked first. */
  async submitAction(input: {
    roundId: string;
    userId: string;
    kind: "choice" | "freeform" | "pass" | "combat";
    choiceIndex?: number;
    text?: string;
    /** A battle action (see CombatActionSchema). */
    action?: unknown;
    interactionId?: string;
  }): Promise<SubmitResult> {
    const db = this.deps.db;
    const [round] = await db.select().from(rounds).where(eq(rounds.id, input.roundId));
    if (round?.status !== "collecting")
      return { ok: false, message: "That moment has passed. Look for the newest scene!" };
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, round.campaignId));
    if (c?.status !== "active") return { ok: false, message: "This campaign isn't running right now." };
    const [hero] = await db
      .select()
      .from(characters)
      .where(
        and(
          eq(characters.campaignId, c.id),
          eq(characters.userId, input.userId),
          eq(characters.status, "active"),
        ),
      );
    if (!hero)
      return { ok: false, message: "You need a hero in this campaign first. Try /character create." };
    const { index } = this.deps.worlds.get(c.worldId);

    let payload: Record<string, unknown> = {};
    if (round.kind === "combat" && input.kind === "choice")
      return { ok: false, message: "Pick a battle action instead." };
    if (round.kind !== "combat" && input.kind === "combat")
      return { ok: false, message: "There's no fight going on right now." };
    if (input.kind === "combat") {
      const parsed = CombatActionSchema.safeParse(input.action);
      if (!parsed.success) return { ok: false, message: "That action isn't available." };
      payload = { action: parsed.data };
    } else if (input.kind === "choice") {
      const choices = round.choices as StoredChoice[];
      const idx = input.choiceIndex ?? -1;
      if (!choices[idx]) return { ok: false, message: "That choice isn't available." };
      payload = { choiceIndex: idx };
    } else if (input.kind === "freeform") {
      const text = (input.text ?? "").trim();
      const told = await campaignStory(this.deps.db, c);
      const local = checkPlayerText(text, index.world, told.story.intensity);
      if (!local.allow) {
        await this.recordSafety(
          c,
          input.userId,
          "blocked",
          local.findings.map((f) => f.category),
          text,
        );
        return { ok: false, message: local.message ?? "Try saying that another way." };
      }
      if (local.metaProbe || isMetaProbe(text)) {
        const rng = deriveRng(input.interactionId ?? text, "flavor", 0);
        return { ok: true, deflection: pickDeflection(index.world, rng) };
      }
      // The word checks above run at every intensity; the AI's own read of what was typed, at Light.
      if (told.story.intensity === "light") {
        const verdict = await this.deps.llm.structured(
          {
            task: "safety",
            system: playerSafetySystem(index.world, told.story.intensity),
            user: [{ text }],
            schema: SafetyOutput,
            schemaName: "verdict",
            expectTokens: 200,
            effort: "low",
          },
          { guildId: c.guildId, campaignId: c.id },
        );
        if (verdict.ok && verdict.value.isMetaProbe) {
          return { ok: true, deflection: pickDeflection(index.world, deriveRng(text, "flavor", 0)) };
        }
        if (
          verdict.ok
            ? !verdict.value.allow || verdict.value.isPromptInjection
            : verdict.stop !== "unconfigured" && verdict.stop !== "budget"
        ) {
          await this.recordSafety(
            c,
            input.userId,
            verdict.ok ? "blocked" : "classifier_unavailable",
            verdict.ok ? verdict.value.categories : [],
            text,
          );
          return {
            ok: false,
            message: verdict.ok
              ? "Let's keep our tale friendly. Try another way!"
              : "The storyteller didn't quite catch that. Try again in a moment, or pick a choice.",
          };
        }
      }
      payload = { text };
    }

    await db
      .insert(pendingActions)
      .values({
        roundId: round.id,
        characterId: hero.id,
        userId: input.userId,
        kind: input.kind,
        payload,
        interactionId: input.interactionId ?? null,
      })
      .onConflictDoUpdate({
        target: [pendingActions.roundId, pendingActions.characterId],
        set: {
          kind: input.kind,
          payload,
          interactionId: input.interactionId ?? null,
          submittedAt: new Date(),
        },
      });
    const waitingOn = await this.waitingOn(round.id, c.id);
    return { ok: true, allSubmitted: waitingOn.length === 0, waitingOn };
  }

  async waitingOn(roundId: string, campaignId: string): Promise<string[]> {
    const party = await this.party(campaignId);
    const acted = await this.deps.db.select().from(pendingActions).where(eq(pendingActions.roundId, roundId));
    const done = new Set(acted.map((a) => a.characterId));
    return party.filter((p) => !done.has(p.id)).map((p) => p.name);
  }

  private async recordSafety(
    c: CampaignRow,
    userId: string,
    verdict: string,
    categories: string[],
    text: string,
  ) {
    await this.deps.db.insert(safetyEvents).values({
      guildId: c.guildId,
      campaignId: c.id,
      userId,
      stage: "input",
      verdict,
      categories,
      contentHash: hash(text),
    });
  }

  private async party(campaignId: string): Promise<CharacterRow[]> {
    return this.deps.db
      .select()
      .from(characters)
      .where(and(eq(characters.campaignId, campaignId), eq(characters.status, "active")))
      .orderBy(characters.createdAt);
  }

  // ------------------------------------------------------------ resolution

  /**
   * Resolves a round: intents, dice, the loom, narration, validation, and one
   * transaction that commits it all. In Assist campaigns the result is a draft
   * for the human DM instead, and in any campaign a turn the AI couldn't finish
   * is a draft for a person in the DM room to tell. Returns null if someone
   * else is already resolving this round.
   */
  async resolveRound(roundId: string): Promise<ResolveResult | null> {
    const db = this.deps.db;
    const [claimed] = await db
      .update(rounds)
      .set({ status: "resolving" })
      .where(and(eq(rounds.id, roundId), eq(rounds.status, "collecting")))
      .returning();
    if (!claimed) return null;
    try {
      const [c] = await db.select().from(campaigns).where(eq(campaigns.id, claimed.campaignId));
      // A paused campaign's clock is stopped: nothing moves on until it resumes.
      if (c?.status !== "active") {
        await db.update(rounds).set({ status: "collecting" }).where(eq(rounds.id, roundId));
        return null;
      }
      const prepared = await this.prepare(claimed);
      // Assist campaigns send every turn to their DM; any campaign sends a turn the AI couldn't finish to a person.
      if (prepared.turn.handoff || (c.mode === "assist" && c.dmUserId))
        return { kind: "draft", draft: await this.saveDraft(prepared, c.dmUserId ?? c.createdBy) };
      const view = await this.commit(prepared.turn, prepared.loom, prepared.inputHash);
      await this.afterCommit(prepared.turn);
      return { kind: "turn", view };
    } catch (e) {
      await db
        .update(rounds)
        .set({ status: "collecting" })
        .where(and(eq(rounds.id, roundId), eq(rounds.status, "resolving")));
      throw e;
    }
  }

  /** Everything up to (not including) the commit: intents, dice, loom, the next scene, narration. Writes nothing. */
  private async prepare(
    round: typeof rounds.$inferSelect,
  ): Promise<{ turn: PreparedTurn; loom: LoomResult; inputHash: string }> {
    const db = this.deps.db;
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, round.campaignId));
    if (!c) throw new GameError("no campaign", "That campaign doesn't exist.");
    const [sceneRow] = await db.select().from(scenes).where(eq(scenes.id, round.sceneId));
    if (!sceneRow) throw new Error("scene missing");
    const spec = normalizeSpec(sceneRow.state);
    const { index } = this.deps.worlds.get(c.worldId);
    const world = index.world;
    const story = asStory(c.story);
    const party = await this.party(c.id);
    const acted = await db.select().from(pendingActions).where(eq(pendingActions.roundId, round.id));
    const loom = await loadLoom(db, c.id);
    const plan = await loadPlan(db, c.id);
    const seq = c.turnSeq + 1;
    const settings = campaignSettings(c);
    const told = await campaignStory(this.deps.db, c);
    const rules = tableRules(c, told);
    const moments = loomMoments(index, plan);
    const ctx = loomContext(index, moments);
    const loomState = normalizeLoom(loom.state, new Set(moments.map((m) => m.id)));
    const inventory = await this.inventoryFor(party);

    // 1. Intents.
    const actions = await this.resolveIntents(
      c,
      index,
      plan,
      spec,
      party,
      acted,
      round.choices as StoredChoice[],
    );

    // 2. Dice: a round of a fight, or checks.
    const fight =
      spec.combat?.phase === "fighting"
        ? this.fightRound(
            index,
            loom.masterSeed,
            seq,
            spec.combat,
            party,
            inventory,
            actions,
            acted,
            settings.combatRules,
          )
        : null;
    const sceneSpec = fight ? syncEntities(spec, fight.result.state) : spec;
    // A scene ends when its story does: when the storyteller judged its question answered last turn and the
    // heroes have now made their move, when a decisive moment is decided, or when a fight is. A scene a person
    // opened closes at once, so the director can frame the next one properly. Never on a count of turns.
    const closing = fight
      ? fight.result.state.phase === "over"
      : Boolean(spec.momentId) ||
        Boolean(spec.provisional) ||
        story.closeNextRound ||
        spec.combat?.phase === "aftermath";
    const moment = spec.momentId
      ? plan?.moments.find((m) => m.id === spec.momentId && m.state === "ahead")
      : undefined;
    const portentsCome = moment ? (plan?.fronts.find((f) => f.id === moment.frontId)?.stage ?? 0) : 0;
    const { rollViews, failures, crux } = fight
      ? { rollViews: fight.rolls, failures: [], crux: null }
      : this.rollDice(
          index,
          loom.masterSeed,
          seq,
          moment ?? null,
          portentsCome,
          party,
          actions,
          loomState,
          closing,
        );
    const partyDown = fight?.result.state.outcome === "party_down";

    // 3. The hidden hand (unless the DM has switched it off).
    const promisesKept = await this.promisesKeptBy(c.id, actions);
    const input: LoomInput = {
      story: {
        turn: seq,
        progress: storyProgress(story.scenesDone, story.milestones),
        chapterNumber: story.chapter,
        doneMoments: plan?.moments.filter((m) => m.state === "done").map((m) => m.id) ?? [],
        sceneChanged: story.roundsInScene === 0,
        chapterEnded: Boolean(story.chapterEnded),
      },
      scene: {
        id: sceneRow.id,
        kind: spec.kind,
        momentId: spec.momentId,
        regionId: spec.regionId,
        terrain: index.regions.get(spec.regionId)?.terrain ?? [],
        // A foe spared this round was at the heroes' mercy when they chose.
        entities: sceneSpec.entities.map((e) =>
          toLoomEntity(
            fight?.result.spared.includes(e.ref.id) ? { ...e, status: "at_mercy", present: true } : e,
          ),
        ),
        offeredShortcuts: spec.offeredShortcuts,
        lieBenefit: false,
      },
      deedCandidates: [...actions.flatMap((a) => a.deeds), ...(fight?.mercy ?? [])],
      promisesKept,
      check: partyDown
        ? { kind: "failure", stakes: "high", margin: -5, characterIds: party.map((p) => p.id) }
        : crux && moment
          ? {
              kind: "crux",
              momentId: moment.id,
              success: crux.check.success,
              margin: crux.check.margin,
              pSuccess: crux.p,
            }
          : failures[0]
            ? {
                kind: "failure",
                stakes: failures[0].stakes,
                margin: failures[0].margin,
                characterIds: [failures[0].characterId],
              }
            : null,
      heroesDowned: fight?.result.downed ?? [],
      partyDown,
    };
    const loomOff = (c.settings as Record<string, unknown>).loomMode === "off";
    const loomResult: LoomResult = loomOff
      ? {
          state: loomState,
          directives: [],
          constraints: [],
          effects: [],
          crux: null,
          audit: [{ step: "off", detail: "loom switched off by the DM" }],
        }
      : evaluateLoom(loomState, input, ctx, deriveRng(loom.masterSeed, "loom", seq));

    // 4. What comes next: the decisive moment settled, and the next scene, from where the heroes chose to go.
    let planAfter = plan ? structuredClone(plan) : null;
    const played = moment && planAfter ? planAfter.moments.find((m) => m.id === moment.id) : undefined;
    if (played && crux) {
      played.state = "done";
      played.outcome = loomResult.crux?.outcome ?? (crux.check.success ? "success" : "fail_forward");
    }
    const finale = Boolean(closing && played?.finale);
    // How the scene's fight went, whether it ended this round or the heroes were deciding what came after.
    const endedLog = [
      ...sceneSpec.log,
      ...outcomeLines((fight?.result.state ?? spec.combat)?.outcome ?? null, played),
    ];
    const heading = actions
      .filter((a) => !a.passed)
      .map((a) => {
        const roll = rollViews.find((r) => r.characterName === a.name && !r.foe);
        return `${a.name} ${a.summary}${roll ? ` (${roll.label}: ${roll.success ? "it worked" : "it didn't work"})` : ""}`;
      });
    let nextSpec: SceneSpec | null = null;
    let milestone = false;
    let chapterTitle: string | null = null;
    let unframed: string[] | null = null;
    if (closing && !finale) {
      const framed = await this.frame({
        c,
        index,
        telling: told.story,
        plan: planAfter,
        story,
        seq,
        ended: sceneSpec,
        endedLog,
        heading,
        party,
        loom: loomResult,
        rules,
        masterSeed: loom.masterSeed,
      });
      if (framed.ok) {
        planAfter = framed.value.plan;
        milestone = framed.value.milestone;
        chapterTitle = framed.value.chapterTitle;
        nextSpec = withEncounter(
          index,
          framed.value.next,
          party,
          heroesFor(index, party, inventory),
          this.dice(loom.masterSeed, seq, "encounter"),
          rules,
        );
      } else unframed = framed.reasons;
    }
    const mode: NarrationMode = !closing ? "continue" : finale ? "finale" : "close_and_open";
    const epilogue = finale
      ? compileEpilogue(
          loomResult.state,
          world,
          settings.epilogueStyle,
          deriveRng(loom.masterSeed, "flavor", seq),
        )
      : [];

    // 5. Narration.
    const view = await this.publicView({
      c,
      index,
      plan: planAfter,
      mode,
      story: told.story,
      spec: sceneSpec,
      nextSpec,
      party: fight ? this.partyAfterFight(party, fight.result.heroes) : party,
      actions: fight ? [] : actions,
      rolls: rollViews,
      crux: crux ? { label: crux.label, success: crux.check.success } : null,
      epilogue,
      steerAway: Boolean(story.steerAway),
      ...(fight
        ? {
            battle: {
              round: fight.result.state.round,
              log: fight.result.events.map((e) => e.text),
              foes: fightingFoes(fight.result.state).map((f) => {
                const creature = index.creatures.get(f.creatureId);
                const weakSpot =
                  settings.combatRules.defenseMix && creature ? weakSpotWords(creature, f.ac) : null;
                return { name: f.name, condition: foeCondition(f), ...(weakSpot ? { weakSpot } : {}) };
              }),
              outcome: fight.result.state.outcome ?? "ongoing",
              atMercy: foesAtMercy(fight.result.state).map((f) => f.name),
            },
          }
        : {}),
    });
    const choicesFor = nextSpec ? sceneSpecView(index, planAfter, nextSpec) : view.scene;
    // What a player typed but the reader couldn't make sense of is never guessed at: the turn goes to a person.
    const unread = actions.filter((a) => a.unread);
    const narration: NarrationResult = unframed
      ? { ok: false, reasons: unframed }
      : unread.length > 0
        ? {
            ok: false,
            reasons: [
              ...new Set(unread.map((a) => a.unread as string)),
              ...unread.map((a) => `${NOT_READ}${a.name} ${a.summary}`),
            ],
          }
        : await narrate({
            llm: this.deps.llm,
            world,
            view,
            directives: loomResult.directives,
            scope: { guildId: c.guildId, campaignId: c.id },
            log: this.log,
            choicesFor,
          });

    return {
      turn: {
        campaignId: c.id,
        roundId: round.id,
        roundN: round.n,
        sceneId: sceneRow.id,
        seq,
        closing,
        mode,
        spec: sceneSpec,
        nextSpec,
        actions: actions.map((a) => ({
          characterId: a.characterId,
          summary: a.summary,
          passed: a.passed,
          makesPromiseTo: a.makesPromiseTo,
        })),
        rolls: rollViews,
        cruxLabel: crux?.label ?? null,
        cruxSuccess: crux ? crux.check.success : null,
        promisesKept,
        plan: planAfter,
        milestone,
        chapterTitle,
        endedChapter:
          plan && (chapterTitle || finale)
            ? { number: plan.chapter.number, title: plan.chapter.title }
            : null,
        heading,
        endedLog,
        options: unframed ? whereItCouldGo(index, planAfter, sceneSpec.regionId) : [],
        view,
        choicesFor,
        narration: narration.ok ? narration.output : blankNarration(),
        handoff: narration.ok ? null : narration.reasons,
        combat: fight
          ? {
              heroes: fight.result.heroes.map((h) => ({
                id: h.id,
                hp: h.hp,
                tempHp: h.tempHp,
                conditions: h.conditions,
              })),
              usedItems: fight.result.usedItems,
              usedSlots: fight.result.usedSlots,
              log: fight.result.events.map((e) => e.text),
              outcome: fight.result.state.outcome ?? "ongoing",
            }
          : null,
      },
      loom: loomResult,
      inputHash: hash(input),
    };
  }

  /**
   * The next scene, from the director. A campaign begun before the living story gets its own story first, grown
   * from what has happened so far.
   */
  private async frame(args: {
    c: CampaignRow;
    index: WorldIndex;
    telling: NarrationStory;
    plan: StoryPlan | null;
    story: StoryState;
    seq: number;
    ended: SceneSpec;
    endedLog: string[];
    heading: string[];
    party: CharacterRow[];
    loom: LoomResult;
    rules: TableRules;
    masterSeed: string;
  }) {
    const { c, index, story } = args;
    const scope = { guildId: c.guildId, campaignId: c.id };
    const heroes = this.directorHeroes(index, args.party);
    const lastNarration = (await this.recentNarration(c.id, 1))[0] ?? "";
    if (args.plan)
      return frameNextScene({
        llm: this.deps.llm,
        log: this.log,
        scope,
        index,
        telling: args.telling,
        plan: args.plan,
        story,
        seq: args.seq,
        ended: args.ended,
        endedLog: args.endedLog,
        lastNarration,
        heading: args.heading,
        heroes,
        loom: args.loom.state,
        tempt: args.loom.constraints.some((k) => k.kind === "tempt"),
        rules: args.rules,
        masterSeed: args.masterSeed,
      });
    const seed = pickSeed(index, args.telling.premise, args.masterSeed);
    if (!seed)
      return {
        ok: false as const,
        reasons: ["This world has no story seeds to grow this campaign's story from."],
      };
    const [recaps, recent] = await Promise.all([
      chapterRecaps(this.deps.db, c.id, 8),
      this.recentNarration(c.id, 4),
    ]);
    const seeded = await seedStory({
      llm: this.deps.llm,
      log: this.log,
      scope,
      index,
      telling: args.telling,
      seed,
      length: profileLength(c),
      heroes,
      loom: args.loom.state,
      rules: args.rules,
      masterSeed: args.masterSeed,
      underway: {
        history: [...recaps.map((r) => `Chapter ${r.chapter}: ${r.text}`), ...recent],
        heading: args.heading,
        regionId: args.ended.regionId || story.regionId,
        scenesDone: story.scenesDone,
        chapter: story.chapter,
      },
    });
    if (!seeded.ok) return seeded;
    const plan = seeded.value.plan;
    plan.scenes.push({
      seq: args.seq,
      chapter: story.chapter,
      title: args.ended.title,
      summary: args.ended.summary.slice(0, 300),
    });
    return {
      ok: true as const,
      value: { plan, next: seeded.value.opening, milestone: false, chapterTitle: null },
    };
  }

  /** Work that follows a committed turn: at a chapter's end, or the story's, its recap for the journal. */
  private async afterCommit(turn: PreparedTurn) {
    if (!turn.endedChapter) return;
    try {
      const [c] = await this.deps.db.select().from(campaigns).where(eq(campaigns.id, turn.campaignId));
      if (!c) return;
      const { index } = this.deps.worlds.get(c.worldId);
      const telling = (await campaignStory(this.deps.db, c)).story;
      await writeChapterRecap({
        db: this.deps.db,
        llm: this.deps.llm,
        index,
        log: this.log,
        campaignId: c.id,
        guildId: c.guildId,
        chapterNumber: turn.endedChapter.number,
        chapterTitle: turn.endedChapter.title,
        plan: await loadPlan(this.deps.db, c.id),
        telling,
      });
    } catch (e) {
      this.log.warn("chapter recap failed", { error: (e as Error).message });
    }
  }

  /** One round of a fight: everyone's chosen action, then initiative order. */
  private fightRound(
    index: WorldIndex,
    seed: string,
    seq: number,
    combat: NonNullable<SceneSpec["combat"]>,
    party: CharacterRow[],
    inventory: Array<typeof inventoryItems.$inferSelect>,
    actions: ResolvedAction[],
    acted: Array<typeof pendingActions.$inferSelect>,
    rules: CombatRules,
  ) {
    const heroes = heroesFor(index, party, inventory);
    const byChar = new Map(acted.map((a) => [a.characterId, a]));
    const chosen: Record<string, CombatAction> = {};
    for (const h of heroes) {
      const a = byChar.get(h.id);
      const ra = actions.find((x) => x.characterId === h.id);
      if (a?.kind === "combat") {
        const parsed = CombatActionSchema.safeParse(a.payload.action);
        chosen[h.id] = parsed.success ? parsed.data : { kind: "defend" };
      } else if (a?.kind === "freeform" && ra?.unread) {
        // Unread: it does nothing on its own; the person telling the turn decides what came of it.
        chosen[h.id] = { kind: "none", summary: ra.summary };
      } else if (a?.kind === "freeform" && ra && !ra.passed) {
        // A clever idea of the player's own. A skill check decides whether it works.
        const p = party.find((x) => x.id === h.id) as CharacterRow;
        const targetId =
          ra.targetRef && combat.foes.some((f) => f.id === ra.targetRef) ? ra.targetRef : undefined;
        if (ra.skill || ra.ability) {
          // Under the defense mix, the way the player chose to go about it decides which of the foe's defenses
          // it meets: the ability behind it (Strength to shove, Charisma to scare) pairs with Fortitude, Reflex
          // or Will. The foe's defenses grow with it, unlike a fixed difficulty.
          const ability = ra.ability ?? (ra.skill ? SKILLS[ra.skill] : null);
          const foe = fightingFoes(combat).find((f) => f.id === targetId) ?? fightingFoes(combat)[0];
          const creature = foe ? index.creatures.get(foe.creatureId) : undefined;
          const against = rules.defenseMix && foe && creature && ability ? DEFENSE_FOR[ability] : null;
          const defense = against && foe && creature ? defensesOf(creature, foe.ac)[against] : null;
          const check = resolveCheck(
            {
              modifier: this.modifierFor(index, p, ra.skill, ra.ability),
              dc: defense ?? DIFFICULTY_DC[ra.difficulty],
              mode: checkRollMode(p.conditions.filter(isCondition)),
            },
            this.dice(seed, seq, `trick:${h.id}`),
          );
          const v = rollView(h.name, ra.skill ? SKILL_NAMES[ra.skill] : "Clever idea", check);
          chosen[h.id] = {
            kind: "trick",
            summary: ra.summary,
            success: check.success,
            ...(against && foe ? { targetId: foe.id, defense: against } : targetId ? { targetId } : {}),
            roll: {
              label: v.label,
              natural: v.natural,
              rolls: v.rolls,
              modifier: v.modifier,
              total: v.total,
              against: defense !== null ? `defense ${defense}` : v.difficulty,
              success: v.success,
              mode: v.mode,
            },
          };
        }
        // With no roll there's no defense to get past: under the defense mix it's only told, not a free trick.
        else
          chosen[h.id] = rules.defenseMix
            ? { kind: "none", summary: ra.summary }
            : { kind: "trick", summary: ra.summary, success: true, ...(targetId ? { targetId } : {}) };
      } else chosen[h.id] = { kind: "defend" };
    }
    const result = resolveCombatRound(
      combat,
      heroes,
      chosen,
      index.creatures,
      this.dice(seed, seq, "combat"),
      rules,
    );
    const mercy: DeedCandidate[] = result.events
      .filter((e) => e.kind === "spare" && e.targetId)
      .flatMap((e) => {
        const entity = combat.foes.find((f) => f.id === e.targetId);
        if (!entity) return [];
        return [
          {
            tag: "mercy" as const,
            actorIds: [e.actorId],
            anchor: {
              kind: "faction" as const,
              id: entity.id,
              name: entity.name,
              ...this.foeFaction(index, entity.creatureId),
            },
            evidence: { forgoneBenefit: 1 },
            source: "choice" as const,
            confidence: 1,
            summary: `let ${entity.name} go free`,
          },
        ];
      });
    return { result, mercy, rolls: rollViewsFrom(result.events, new Set(party.map((p) => p.id))) };
  }

  private foeFaction(index: WorldIndex, creatureId: string): { faction?: string; tags?: string[] } {
    const c = index.creatures.get(creatureId);
    return { ...(c?.faction ? { faction: c.faction } : {}), tags: c?.tags ?? [] };
  }

  private partyAfterFight(
    party: CharacterRow[],
    heroes: Array<{ id: string; hp: number; conditions: string[] }>,
  ) {
    return party.map((p) => {
      const h = heroes.find((x) => x.id === p.id);
      return h ? { ...p, hp: h.hp, conditions: h.conditions } : p;
    });
  }

  private async inventoryFor(party: readonly CharacterRow[]) {
    return this.inventoryForTx(this.deps.db, party);
  }

  private async inventoryForTx(tx: Tx | EngineDeps["db"], party: readonly CharacterRow[]) {
    if (party.length === 0) return [];
    return tx
      .select()
      .from(inventoryItems)
      .where(
        inArray(
          inventoryItems.characterId,
          party.map((p) => p.id),
        ),
      );
  }

  private modifierFor(index: WorldIndex, p: CharacterRow, skill: Skill | null, ability: Ability | null) {
    const build = buildFor(index, p);
    if (!build) return 0;
    const d = deriveStats(build);
    if (skill) return d.skills[skill];
    if (ability) return d.modifiers[ability];
    return 0;
  }

  /** What a hero can do in the current fight, for the battle buttons. */
  async combatOptions(roundId: string, userId: string) {
    const db = this.deps.db;
    const [round] = await db.select().from(rounds).where(eq(rounds.id, roundId));
    if (round?.status !== "collecting" || round.kind !== "combat") return null;
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, round.campaignId));
    const [sceneRow] = await db.select().from(scenes).where(eq(scenes.id, round.sceneId));
    const combat = (sceneRow?.state as unknown as SceneSpec | undefined)?.combat;
    if (!c || !combat) return null;
    const party = await this.party(c.id);
    const me = party.find((p) => p.userId === userId);
    if (!me) return null;
    const { index } = this.deps.worlds.get(c.worldId);
    const hero = heroesFor(index, [me], await this.inventoryFor([me]))[0];
    if (!hero) return null;
    return {
      heroName: hero.name,
      down: isDownHero(hero),
      attacks: hero.attacks.map((a) => ({ id: a.id, name: a.name, ranged: a.ranged })),
      spells: hero.spells.map((sp) => ({
        id: sp.id,
        name: sp.name,
        level: sp.level,
        target: sp.target,
        available: canCast(hero, sp.id),
      })),
      potions: hero.potions.map((pt) => ({ itemId: pt.itemId, name: pt.name, qty: pt.qty })),
      foes: fightingFoes(combat).map((f) => ({ id: f.id, name: f.name, condition: foeCondition(f) })),
      atMercy: foesAtMercy(combat).map((f) => ({ id: f.id, name: f.name })),
      allies: party.map((p) => ({ id: p.id, name: p.name, hp: p.hp, hpMax: p.hpMax })),
    };
  }

  /** Commits a prepared turn in one transaction and returns what to show the players. */
  private async commit(prepared: PreparedTurn, loomResult: LoomResult, inputHash: string): Promise<TurnView> {
    const db = this.deps.db;
    const { seq, closing, mode } = prepared;
    const out = prepared.narration;
    const ruledHp = new Map<string, number>();
    return db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, prepared.campaignId))
        .for("update");
      if (!locked || locked.turnSeq !== seq - 1)
        throw new GameError("conflict", "Someone else just moved the story on. Try again!");
      const c = locked;
      const { index } = this.deps.worlds.get(c.worldId);
      const world = index.world;
      const story = asStory(c.story);
      const told = await campaignStory(tx, c);
      const rules = tableRules(c, told);
      const { masterSeed } = await loadLoom(tx, c.id);
      const plan = prepared.plan ? structuredClone(prepared.plan) : null;
      // The story's length as the table set it now, even if they changed it while this turn was being told.
      if (plan) plan.length = told.profile.length;
      let party = await this.partyTx(tx, c.id);

      const levelUps: TurnView["levelUps"] = [];
      let storyAfter: StoryState = {
        ...story,
        roundsInScene: story.roundsInScene + 1,
        // Only the dice end a fight, never the storyteller.
        closeNextRound: !closing && !prepared.combat && !prepared.spec.combat && out.sceneOver,
        steerAway: false,
        chapterEnded: false,
      };
      if (prepared.combat) {
        await this.applyFight(tx, prepared.combat, party, ruledHp);
        party = await this.partyTx(tx, c.id);
      }
      await this.applyLoomEffects(tx, loomResult, party, storyAfter);

      // A next scene the director couldn't frame is where the person who told this turn took the heroes.
      const opened =
        prepared.nextSpec ??
        (closing && mode === "close_and_open"
          ? provisionalScene(
              index,
              plan,
              {
                regionId: prepared.spec.regionId,
                poiId: prepared.spec.poiId,
                chapter: plan?.chapter.number ?? story.chapter,
              },
              out.narration,
            )
          : null);
      const applied = await this.applyChanges(tx, {
        index,
        c,
        plan,
        scenes: opened ? [prepared.spec, opened] : [prepared.spec],
        party,
        changes: out.changes,
        seq,
        story: storyAfter,
      });
      let spec = applied.scenes[0] as SceneSpec;
      let nextSpec = opened ? (applied.scenes[1] as SceneSpec) : null;
      for (const a of prepared.actions) {
        if (
          a.makesPromiseTo &&
          spec.entities.some((e) => e.kind === "npc" && e.ref.id === a.makesPromiseTo)
        ) {
          await tx
            .insert(promises)
            .values({ campaignId: c.id, npcId: a.makesPromiseTo, text: a.summary, madeTurn: seq });
        }
      }
      for (const npcId of prepared.promisesKept) {
        await tx
          .update(promises)
          .set({ status: "kept" })
          .where(
            and(eq(promises.campaignId, c.id), eq(promises.npcId, npcId), eq(promises.status, "pending")),
          );
      }
      await saveLoom(tx, c.id, seq, inputHash, loomResult);
      // This turn in a sentence, for the scene's memory.
      if (out.happened) spec = { ...spec, log: [...spec.log, out.happened].slice(-MAX_SCENE_LOG) };
      party = await this.partyTx(tx, c.id);
      const fightRng = () => this.dice(masterSeed, seq, "fight");
      const heroesNow = async () => heroesFor(index, party, await this.inventoryForTx(tx, party));

      let roundId: string | null = null;
      let ended = false;
      if (closing) {
        await tx
          .update(scenes)
          .set({ endedTurn: seq, state: spec as unknown as Record<string, unknown> })
          .where(eq(scenes.id, prepared.sceneId));
        // Beaten heroes are rescued and wake up safe; a journey's end or a rest is a good night's sleep.
        if (prepared.combat?.outcome === "party_down") await this.rescue(tx, party);
        else if (spec.kind === "travel" || spec.kind === "rest") await this.longRest(tx, party);
        storyAfter.scenesDone += 1;
        if (prepared.milestone) {
          storyAfter.milestones += 1;
          storyAfter.lastMilestoneAt = storyAfter.scenesDone;
          for (const p of party) {
            if (p.level + (p.resources.pendingLevels ?? 0) >= world.meta.maxLevel) continue;
            await tx
              .update(characters)
              .set({ resources: { ...p.resources, pendingLevels: (p.resources.pendingLevels ?? 0) + 1 } })
              .where(eq(characters.id, p.id));
            levelUps.push({
              characterId: p.id,
              userId: p.userId,
              name: p.name,
              toLevel: p.level + (p.resources.pendingLevels ?? 0) + 1,
            });
          }
        }
        if (plan && plan.chapter.number !== story.chapter) {
          storyAfter.chapter = plan.chapter.number;
          storyAfter.chapterEnded = true;
        }
        if (nextSpec) {
          if (applied.fight)
            nextSpec = startFight(index, nextSpec, applied.fight, await heroesNow(), fightRng(), rules);
          const sceneId = await this.insertScene(tx, c.id, nextSpec, seq);
          const fightStarts = nextSpec.combat?.phase === "fighting";
          roundId = await this.insertRound(
            tx,
            c.id,
            sceneId,
            1,
            fightStarts ? [] : out.choices,
            fightStarts ? "combat" : "exploration",
          );
          if (nextSpec.regionId !== story.regionId) {
            const neighbors = index.regions.get(nextSpec.regionId)?.edges.map((e) => e.to) ?? [];
            await this.visit(tx, c.id, nextSpec.regionId, neighbors);
            storyAfter.discoveredRegions = [
              ...new Set([...storyAfter.discoveredRegions, nextSpec.regionId, ...neighbors]),
            ];
          }
          storyAfter = {
            ...storyAfter,
            sceneId,
            sceneKind: nextSpec.kind,
            momentId: nextSpec.momentId,
            regionId: nextSpec.regionId,
            poiId: nextSpec.poiId,
            roundsInScene: 0,
            closeNextRound: false,
          };
        } else {
          ended = true;
          storyAfter = { ...storyAfter, ended: true, sceneId: null, momentId: null };
          // The last scene, for the last chapter's recap.
          if (plan && out.happened)
            plan.scenes.push({ seq, chapter: plan.chapter.number, title: spec.title, summary: out.happened });
        }
      } else {
        if (applied.fight)
          spec = startFight(index, spec, applied.fight, await heroesNow(), fightRng(), rules);
        const fightOn = spec.combat?.phase === "fighting";
        const mercyNow = prepared.combat && spec.combat?.phase === "aftermath";
        await tx
          .update(scenes)
          .set({ state: spec as unknown as Record<string, unknown> })
          .where(eq(scenes.id, prepared.sceneId));
        roundId = await this.insertRound(
          tx,
          c.id,
          prepared.sceneId,
          prepared.roundN + 1,
          fightOn ? [] : mercyNow && spec.combat ? aftermathChoices(spec.combat) : out.choices,
          fightOn ? "combat" : "exploration",
        );
      }
      if (plan && (closing || applied.planChanged))
        await savePlan(
          tx,
          c.id,
          plan,
          closing ? `scene ${storyAfter.scenesDone} ended (turn ${seq})` : `turn ${seq}`,
        );

      await tx.update(rounds).set({ status: "resolved" }).where(eq(rounds.id, prepared.roundId));
      const turnData = {
        mode,
        actions: prepared.actions.map((a) => ({
          characterId: a.characterId,
          summary: a.summary,
          passed: a.passed,
        })),
        rolls: prepared.rolls,
        narration: out,
      } as unknown as Record<string, unknown>;
      const [draftRow] = await tx
        .select()
        .from(turns)
        .where(and(eq(turns.campaignId, c.id), eq(turns.seq, seq)));
      if (draftRow) {
        await tx
          .update(turns)
          .set({ status: "committed", stage: "committed", data: turnData, committedAt: new Date() })
          .where(eq(turns.id, draftRow.id));
      } else {
        await tx.insert(turns).values({
          campaignId: c.id,
          seq,
          roundId: prepared.roundId,
          status: "committed",
          stage: "committed",
          data: turnData,
          committedAt: new Date(),
        });
      }
      await tx.insert(events).values({
        campaignId: c.id,
        turnSeq: seq,
        type: closing ? "scene_closed" : "round_resolved",
        payload: {
          sceneId: prepared.sceneId,
          momentId: spec.momentId,
          cruxOutcome: prepared.cruxSuccess === null ? null : prepared.cruxSuccess ? "success" : "failure",
        },
      });
      await tx
        .update(campaigns)
        .set({
          turnSeq: seq,
          story: storyAfter as unknown as Record<string, unknown>,
          status: ended ? "ended" : locked.status,
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, c.id));
      await saveRestorePoint(tx, c.id, seq, ended ? null : roundId);

      const shown = nextSpec ?? spec;
      const partyNow = await this.partyTx(tx, c.id);
      const mercyNow = Boolean(!closing && prepared.combat && spec.combat?.phase === "aftermath");
      const fightStartedNow = Boolean(applied.fight && shown.combat?.phase === "fighting");
      return this.turnView({
        c: locked,
        index,
        plan,
        seq,
        spec: shown,
        out,
        rolls: prepared.rolls,
        roundId,
        sceneChanged: Boolean(nextSpec),
        levelUps,
        ended,
        combat:
          shown.combat && !ended
            ? combatView(
                shown.combat,
                partyNow,
                nextSpec || fightStartedNow ? [] : (prepared.combat?.log ?? []),
              )
            : null,
        ...(shown.combat?.phase === "fighting" && roundId
          ? { choices: [] }
          : mercyNow && spec.combat
            ? { choices: aftermathChoices(spec.combat) }
            : {}),
      });
    });
  }

  private async partyTx(tx: Tx, campaignId: string) {
    return tx
      .select()
      .from(characters)
      .where(and(eq(characters.campaignId, campaignId), eq(characters.status, "active")))
      .orderBy(characters.createdAt);
  }

  /** Writes a fight round's results: hit points, conditions, spent spell slots and potions. */
  private async applyFight(
    tx: Tx,
    fight: NonNullable<PreparedTurn["combat"]>,
    party: CharacterRow[],
    ruledHp: Map<string, number>,
  ) {
    for (const h of fight.heroes) {
      const p = party.find((x) => x.id === h.id);
      if (!p) continue;
      const resources = { ...p.resources };
      for (const u of fight.usedSlots.filter((x) => x.heroId === h.id))
        resources[`slotsUsed${u.level}`] = (resources[`slotsUsed${u.level}`] ?? 0) + 1;
      ruledHp.set(p.id, h.hp - p.hp);
      await tx
        .update(characters)
        .set({
          hp: Math.max(0, Math.min(p.hpMax, h.hp)),
          tempHp: Math.max(0, h.tempHp),
          conditions: h.conditions,
          resources,
        })
        .where(eq(characters.id, p.id));
    }
    for (const u of fight.usedItems) {
      await tx
        .update(inventoryItems)
        .set({ qty: sql`${inventoryItems.qty} - 1` })
        .where(and(eq(inventoryItems.characterId, u.heroId), eq(inventoryItems.itemId, u.itemId)));
    }
    if (fight.usedItems.length > 0)
      await tx
        .delete(inventoryItems)
        .where(
          and(
            inArray(inventoryItems.characterId, [...new Set(fight.usedItems.map((u) => u.heroId))]),
            sql`${inventoryItems.qty} <= 0`,
          ),
        );
  }

  /** A good night's sleep: full health, troubles shaken off, magic back. */
  private async longRest(tx: Tx, party: CharacterRow[]) {
    for (const p of party) {
      const resources = Object.fromEntries(
        Object.entries(p.resources).filter(([k]) => !k.startsWith("slotsUsed")),
      );
      await tx
        .update(characters)
        .set({ hp: p.hpMax, tempHp: 0, conditions: [], resources })
        .where(eq(characters.id, p.id));
    }
  }

  /** After the whole party is knocked dazed: everyone wakes up safe with half their health. */
  private async rescue(tx: Tx, party: CharacterRow[]) {
    for (const p of party) {
      await tx
        .update(characters)
        .set({ hp: Math.max(p.hp, Math.ceil(p.hpMax / 2)), conditions: [] })
        .where(eq(characters.id, p.id));
    }
  }

  // ------------------------------------------------------------ the DM room: Assist drafts and handed-over turns

  /**
   * Saves a prepared turn as a draft for a person in the DM room: every turn in Assist campaigns, and any turn
   * the AI couldn't finish. The hidden part stays in the loom schema.
   */
  private async saveDraft(
    prepared: { turn: PreparedTurn; loom: LoomResult; inputHash: string },
    dmUserId: string,
  ): Promise<DmDraft> {
    const db = this.deps.db;
    const approvalId = await db.transaction(async (tx) => {
      await tx
        .insert(turns)
        .values({
          campaignId: prepared.turn.campaignId,
          seq: prepared.turn.seq,
          roundId: prepared.turn.roundId,
          status: "awaiting_approval",
          stage: "narrated",
          data: prepared.turn as unknown as Record<string, unknown>,
        })
        .onConflictDoUpdate({
          target: [turns.campaignId, turns.seq],
          set: {
            status: "awaiting_approval",
            stage: "narrated",
            data: prepared.turn as unknown as Record<string, unknown>,
          },
        });
      const [turnRow] = await tx
        .select()
        .from(turns)
        .where(and(eq(turns.campaignId, prepared.turn.campaignId), eq(turns.seq, prepared.turn.seq)));
      await savePendingLoom(tx, prepared.turn.campaignId, {
        seq: prepared.turn.seq,
        inputHash: prepared.inputHash,
        result: prepared.loom,
      });
      const [req] = await tx
        .insert(approvalRequests)
        .values({
          campaignId: prepared.turn.campaignId,
          turnId: turnRow?.id as string,
          dmUserId,
          draft: { seq: prepared.turn.seq, handoff: Boolean(prepared.turn.handoff) },
        })
        .returning();
      return req?.id as string;
    });
    return this.draftFor(approvalId, prepared.turn, prepared.loom);
  }

  private draftFor(approvalId: string, turn: PreparedTurn | OpeningDraft, loom: LoomResult | null): DmDraft {
    const notes = (loom?.directives ?? []).map((d) => `${d.kind.replaceAll("_", " ")}: ${d.text}`);
    if (loom?.crux) {
      notes.unshift(
        `Decisive moment: ${loom.crux.outcome.replaceAll("_", " ")}${loom.crux.socket ? ` (${loom.crux.socket.replaceAll("_", " ")})` : ""}${
          loom.crux.withheldSockets.length
            ? `; held back by earlier shortcuts: ${loom.crux.withheldSockets.join(", ")}`
            : ""
        }`,
      );
    }
    const prepared = isOpening(turn) ? null : turn;
    return {
      approvalId,
      campaignId: turn.campaignId,
      seq: turn.seq,
      sceneTitle: (prepared?.nextSpec ?? turn.spec).title,
      narration: turn.narration.narration,
      npcLines: turn.narration.npcLines.map((l) => l.line),
      rolls: prepared?.rolls ?? [],
      choices: turn.narration.choices.map((c) => c.label),
      actions: prepared?.actions.map((a) => a.summary) ?? [],
      dmNotes: notes,
      handoff: turn.handoff ? handoffFor(turn, turn.handoff) : null,
    };
  }

  /** The host, the DM or a guardian: who may tell a turn the AI couldn't. */
  private async canTakeOver(c: CampaignRow, userId: string): Promise<boolean> {
    if (c.createdBy === userId || c.dmUserId === userId) return true;
    const [m] = await this.deps.db
      .select()
      .from(campaignMembers)
      .where(and(eq(campaignMembers.campaignId, c.id), eq(campaignMembers.userId, userId)));
    return m?.role === "guardian";
  }

  private async loadDraft(approvalId: string, userId: string) {
    const db = this.deps.db;
    const [req] = await db.select().from(approvalRequests).where(eq(approvalRequests.id, approvalId));
    if (!req) throw new GameError("no draft", "That draft doesn't exist anymore.");
    if (req.dmUserId !== userId) {
      const [c] = await db.select().from(campaigns).where(eq(campaigns.id, req.campaignId));
      const handedOver = (req.draft as { handoff?: boolean }).handoff === true;
      if (!handedOver || !c || !(await this.canTakeOver(c, userId)))
        throw new GameError(
          "not dm",
          handedOver
            ? "Only the host, the DM or a guardian can tell this turn."
            : "Only this campaign's DM can do that.",
        );
    }
    if (req.status !== "pending") throw new GameError("decided", "That draft has already been decided.");
    const [turnRow] = await db.select().from(turns).where(eq(turns.id, req.turnId));
    if (turnRow?.status !== "awaiting_approval") throw new GameError("stale", "That draft is out of date.");
    const turn = turnRow.data as unknown as PreparedTurn | OpeningDraft;
    if (isOpening(turn)) return { req, turn, pending: null };
    const pending = await loadPendingLoom(db, req.campaignId);
    if (!pending || pending.seq !== turn.seq) throw new GameError("stale", "That draft is out of date.");
    return { req, turn, pending };
  }

  /** The current draft, for the DM's edit form. */
  async getDmDraft(approvalId: string, userId: string): Promise<DmDraft> {
    const { turn, pending } = await this.loadDraft(approvalId, userId);
    return this.draftFor(approvalId, turn, pending?.result ?? null);
  }

  /** Which round (and campaign) a draft belongs to. The opening has no round yet. */
  async draftRound(approvalId: string): Promise<{ roundId: string; campaignId: string } | null> {
    const [req] = await this.deps.db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, approvalId));
    if (!req) return null;
    const [turnRow] = await this.deps.db.select().from(turns).where(eq(turns.id, req.turnId));
    return turnRow?.roundId ? { roundId: turnRow.roundId, campaignId: req.campaignId } : null;
  }

  /**
   * The DM approves a draft, optionally with their own narration or choices. A turn the AI couldn't tell needs
   * the person's own narration.
   */
  async approveDraft(
    approvalId: string,
    userId: string,
    edits: { narration?: string; choices?: string[] } = {},
  ): Promise<TurnView> {
    const { req, turn, pending } = await this.loadDraft(approvalId, userId);
    const edited = edits.narration !== undefined || edits.choices !== undefined;
    if (turn.handoff && edits.narration === undefined)
      throw new GameError(
        "needs telling",
        "Write what happens first: the storyteller couldn't tell this turn.",
      );
    let view: TurnView;
    if (isOpening(turn)) {
      const final = edited ? this.applyDmEdits(turn, edits) : turn;
      view = await this.commitOpening(final);
    } else {
      if (!pending) throw new GameError("stale", "That draft is out of date.");
      const final = edited ? this.applyDmEdits(turn, edits) : turn;
      view = await this.commit(final, pending.result, pending.inputHash);
      await this.afterCommit(final);
    }
    await this.deps.db
      .update(approvalRequests)
      .set({ status: edited ? "edited" : "approved", dmEdits: edits, decidedAt: new Date() })
      .where(eq(approvalRequests.id, req.id));
    if (!isOpening(turn)) await clearPendingLoom(this.deps.db, req.campaignId);
    return view;
  }

  /**
   * Asks the AI to tell the turn again, with the DM's guidance: the director too, when it was the director that
   * couldn't answer. Dice and the hidden hand stay as they were. If it still can't, the draft says why and stays
   * with the person.
   */
  async regenerateDraft(approvalId: string, userId: string, guidance: string): Promise<DmDraft> {
    const { req, turn, pending } = await this.loadDraft(approvalId, userId);
    const [c] = await this.deps.db.select().from(campaigns).where(eq(campaigns.id, req.campaignId));
    if (!c) throw new GameError("no campaign", "That campaign doesn't exist.");
    const { index } = this.deps.worlds.get(c.worldId);
    let next: PreparedTurn | OpeningDraft;
    if (isOpening(turn) && !turn.framed) {
      next = await this.tellOpening(c, await this.party(c.id), guidance);
    } else {
      let base = turn;
      // The director couldn't frame the next scene: ask it again first.
      if (!isOpening(turn) && turn.closing && turn.mode === "close_and_open" && !turn.nextSpec && pending) {
        const told = await campaignStory(this.deps.db, c);
        const rules = tableRules(c, told);
        const party = await this.party(c.id);
        const { masterSeed } = await loadLoom(this.deps.db, c.id);
        const framed = await this.frame({
          c,
          index,
          telling: told.story,
          plan: turn.plan,
          story: asStory(c.story),
          seq: turn.seq,
          ended: turn.spec,
          endedLog: turn.endedLog,
          heading: turn.heading,
          party,
          loom: pending.result,
          rules,
          masterSeed,
        });
        if (!framed.ok) {
          const stuck = { ...turn, handoff: framed.reasons };
          await this.saveDraftData(req.turnId, stuck);
          return this.draftFor(approvalId, stuck, pending.result);
        }
        const nextSpec = withEncounter(
          index,
          framed.value.next,
          party,
          heroesFor(index, party, await this.inventoryFor(party)),
          this.dice(masterSeed, turn.seq, "encounter"),
          rules,
        );
        const nextScene = sceneSpecView(index, framed.value.plan, nextSpec);
        base = {
          ...turn,
          nextSpec,
          plan: framed.value.plan,
          milestone: framed.value.milestone,
          chapterTitle: framed.value.chapterTitle,
          endedChapter:
            turn.plan && framed.value.chapterTitle
              ? { number: turn.plan.chapter.number, title: turn.plan.chapter.title }
              : null,
          view: { ...turn.view, nextScene, storySoFar: framed.value.plan.storySoFar },
          choicesFor: nextScene,
          options: [],
        };
      }
      const directives = [
        ...(pending?.result.directives ?? []),
        ...(guidance.trim() ? [dmNote(guidance)] : []),
      ];
      const unread = isOpening(base) ? [] : (base.handoff ?? []).filter((r) => r.startsWith(NOT_READ));
      // An action nobody could read still can't be narrated by the AI: that stays with the person.
      const narration: NarrationResult =
        unread.length > 0
          ? { ok: false, reasons: base.handoff ?? [] }
          : await narrate({
              llm: this.deps.llm,
              world: index.world,
              view: base.view as PublicSceneView,
              directives,
              scope: { guildId: c.guildId, campaignId: c.id },
              log: this.log,
              choicesFor: base.choicesFor,
            });
      next = narration.ok
        ? { ...base, narration: narration.output, handoff: null }
        : { ...base, handoff: narration.reasons };
    }
    await this.saveDraftData(req.turnId, next);
    return this.draftFor(approvalId, next, pending?.result ?? null);
  }

  private async saveDraftData(turnId: string, data: PreparedTurn | OpeningDraft) {
    await this.deps.db
      .update(turns)
      .set({ data: data as unknown as Record<string, unknown> })
      .where(eq(turns.id, turnId));
  }

  private applyDmEdits<T extends PreparedTurn | OpeningDraft>(
    turn: T,
    edits: { narration?: string; choices?: string[] },
  ): T {
    const out = { ...turn, narration: { ...turn.narration } };
    if (edits.narration !== undefined) {
      const text = edits.narration.trim();
      if (text.length < 10) throw new GameError("too short", "The narration needs at least a sentence.");
      out.narration.narration = text.slice(0, NARRATION_LIMITS.narration);
      out.handoff = null;
    }
    if (edits.choices !== undefined && turn.mode !== "finale") {
      const labels = edits.choices
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 4);
      // In a fight the battle buttons are the choices.
      const shown = isOpening(turn) ? turn.spec : (turn.nextSpec ?? turn.spec);
      if (labels.length === 0 && shown.combat?.phase !== "fighting")
        throw new GameError("no choices", "Give the players at least one choice.");
      out.narration.choices = labels.map((label) => {
        const existing = turn.narration.choices.find((c) => c.label.toLowerCase() === label.toLowerCase());
        return (
          existing ?? {
            label: label.slice(0, 80),
            intent: {
              approach: label,
              skill: "none",
              difficulty: "medium",
              deed: "none",
              targetRef: null,
              shortcutId: null,
            },
          }
        );
      });
    }
    return out;
  }

  private async resolveIntents(
    c: CampaignRow,
    index: WorldIndex,
    plan: StoryPlan | null,
    spec: SceneSpec,
    party: CharacterRow[],
    acted: Array<typeof pendingActions.$inferSelect>,
    choices: StoredChoice[],
  ): Promise<ResolvedAction[]> {
    const byChar = new Map(acted.map((a) => [a.characterId, a]));
    const freeform = acted.filter((a) => a.kind === "freeform");
    let parsed: IntentOutput["actions"] = [];
    let unreadBecause = "The action reader left this out of its answer.";
    if (freeform.length > 0) {
      const res = await this.deps.llm.structured(
        {
          task: "intent",
          system: intentSystem(index.world),
          user: intentUser(
            sceneSpecView(index, plan, spec),
            party.map((p) => ({ ref: p.id, name: p.name })),
            freeform.map((a) => ({ characterRef: a.characterId, text: String(a.payload.text ?? "") })),
            { fight: spec.combat?.phase === "fighting" && campaignSettings(c).combatRules.defenseMix },
          ),
          schema: IntentOutput,
          schemaName: "actions",
          expectTokens: 800,
          effort: "low",
        },
        { guildId: c.guildId, campaignId: c.id },
      );
      if (res.ok) parsed = res.value.actions;
      else {
        this.log.warn("intent parse unavailable", { stop: res.stop });
        unreadBecause = `The action reader didn't answer (${res.stop}${res.error ? `: ${res.error.slice(0, 200)}` : ""}).`;
      }
    }

    const entityAnchor = (ref: string | null) => {
      if (!ref) return null;
      const here = spec.entities.find((e) => e.ref.id === ref)?.ref;
      if (here) return here;
      return castMember(plan, ref) || index.namedNpcs.has(ref) ? personAnchor(index, plan, ref) : null;
    };

    return party.map((p): ResolvedAction => {
      const a = byChar.get(p.id);
      const base: ResolvedAction = {
        characterId: p.id,
        userId: p.userId,
        name: p.name,
        summary: "waits and watches",
        skill: null,
        ability: null,
        difficulty: "medium",
        targetRef: null,
        helpsCharacterId: null,
        deeds: [],
        keepsPromiseTo: null,
        makesPromiseTo: null,
        passed: true,
      };
      if (!a || a.kind === "pass") return base;
      if (a.kind === "combat") return { ...base, summary: "acts in the fight", passed: false };
      if (a.kind === "choice") {
        const choice = choices[Number(a.payload.choiceIndex)];
        if (!choice) return base;
        const intent = choice.intent;
        const deeds: DeedCandidate[] = [];
        if (intent.deed !== "none") {
          const shortcut = intent.shortcutId ? index.shortcuts.get(intent.shortcutId) : undefined;
          deeds.push({
            tag: intent.deed as DeedCandidate["tag"],
            actorIds: [p.id],
            anchor: entityAnchor(intent.targetRef),
            evidence: isShortcutTag(intent.deed) ? SHORTCUT_EVIDENCE : { forgoneBenefit: 1 },
            source: "choice",
            confidence: 1,
            summary: lowerFirst(choice.label),
            ...(shortcut ? { shortcutId: shortcut.id } : {}),
          });
        }
        // Declining every offered shortcut in a choice scene is patience.
        if (
          spec.offeredShortcuts.length > 0 &&
          !intent.shortcutId &&
          intent.deed !== "none" &&
          !isShortcutTag(intent.deed)
        ) {
          deeds.push({
            tag: "patience",
            actorIds: [p.id],
            anchor: null,
            evidence: { shortcutDeclined: spec.offeredShortcuts[0] as string },
            source: "choice",
            confidence: 0.8,
            summary: "chose the long way instead of the quick one",
          });
        }
        return {
          ...base,
          summary: lowerFirst(choice.label),
          skill: isSkill(intent.skill) ? intent.skill : null,
          ability: isSkill(intent.skill) ? SKILLS[intent.skill] : null,
          difficulty: intent.difficulty,
          targetRef: intent.targetRef,
          deeds,
          passed: false,
        };
      }
      const pa = parsed.find((x) => x.characterRef === p.id);
      const text = String(a.payload.text ?? "");
      if (!pa)
        return {
          ...base,
          summary: `tries this: "${text.slice(0, 200)}"`,
          passed: false,
          unread: unreadBecause,
        };
      const deeds: DeedCandidate[] = pa.deeds.map((d) => ({
        tag: d.tag as DeedCandidate["tag"],
        actorIds: [p.id],
        anchor: entityAnchor(d.targetRef),
        evidence: { forgoneBenefit: Math.max(0, Math.min(3, d.forgoneBenefit)), riskTaken: d.riskTaken },
        source: "intent",
        confidence: 0.8,
        summary: pa.summary,
      }));
      const helper =
        pa.helpsCharacterRef && party.some((x) => x.id === pa.helpsCharacterRef)
          ? pa.helpsCharacterRef
          : null;
      return {
        ...base,
        summary: pa.summary,
        skill: pa.needsRoll && isSkill(pa.skill) ? pa.skill : null,
        ability: pa.needsRoll
          ? isSkill(pa.skill)
            ? SKILLS[pa.skill]
            : isAbility(pa.ability)
              ? pa.ability
              : null
          : null,
        difficulty: pa.difficulty,
        targetRef: pa.targetRef,
        helpsCharacterId: helper,
        deeds,
        keepsPromiseTo: pa.keepsPromiseTo,
        makesPromiseTo: pa.makesPromiseTo,
        passed: false,
      };
    });
  }

  private rollDice(
    index: WorldIndex,
    seed: string,
    seq: number,
    moment: StoryPlan["moments"][number] | null,
    portentsCome: number,
    party: CharacterRow[],
    actions: ResolvedAction[],
    loomState: Parameters<typeof snarePressure>[0],
    closing: boolean,
  ) {
    const rollViews: RollView[] = [];
    const failures: Array<{ characterId: string; stakes: "moderate" | "high"; margin: number }> = [];
    let crux: { label: string; check: CheckResult; p: number } | null = null;
    const helped = new Set(
      actions.filter((a) => a.helpsCharacterId).map((a) => a.helpsCharacterId as string),
    );

    const modifierFor = (p: CharacterRow, skill: Skill | null, ability: Ability | null) => {
      const build = buildFor(index, p);
      if (!build) return 0;
      const d = deriveStats(build);
      if (skill) return d.skills[skill];
      if (ability) return d.modifiers[ability];
      return 0;
    };
    const conds = (p: CharacterRow): Condition[] => p.conditions.filter(isCondition);

    // A decisive moment: the hero best suited to it leads, and everyone else who acts helps.
    if (moment && closing) {
      const cruxSpec = moment.crux;
      const skill = (cruxSpec.check.skill as Skill | undefined) ?? null;
      const ability = cruxSpec.check.ability;
      const lead = [...party].sort(
        (a, b) => modifierFor(b, skill, ability) - modifierFor(a, skill, ability),
      )[0];
      if (lead) {
        const others = actions.filter((a) => a.characterId !== lead.id && !a.passed).length;
        const disadvantage = (lead.resources.disadvantageNext ?? 0) > 0;
        const mode: RollMode = combineMode(others > 0, disadvantage);
        const mod = modifierFor(lead, skill, ability);
        const dc = cruxDc(cruxSpec, portentsCome, snarePressure(loomState));
        const check = resolveCheck(
          {
            modifier: mod,
            dc,
            mode: checkRollMode(conds(lead), {
              advantage: mode === "advantage",
              disadvantage: mode === "disadvantage",
            }),
          },
          this.dice(seed, seq, `crux:${lead.id}`),
        );
        crux = { label: cruxSpec.check.label, check, p: successProbability(mod, dc, check.mode) };
        rollViews.push(rollView(lead.name, cruxSpec.check.label, check));
      }
      return { rollViews, failures, crux };
    }

    for (const a of actions) {
      if (a.passed || (!a.skill && !a.ability)) continue;
      const p = party.find((x) => x.id === a.characterId);
      if (!p) continue;
      const disadvantage = (p.resources.disadvantageNext ?? 0) > 0;
      const mode = checkRollMode(conds(p), { advantage: helped.has(p.id), disadvantage });
      const check = resolveCheck(
        { modifier: modifierFor(p, a.skill, a.ability), dc: DIFFICULTY_DC[a.difficulty], mode },
        this.dice(seed, seq, p.id),
      );
      const label = a.skill ? SKILL_NAMES[a.skill] : a.ability ? `${a.ability.toUpperCase()} check` : "Check";
      rollViews.push(rollView(p.name, label, check));
      if (!check.success && a.difficulty !== "easy") {
        failures.push({
          characterId: p.id,
          stakes: a.difficulty === "hard" || a.difficulty === "very_hard" ? "high" : "moderate",
          margin: check.margin,
        });
      }
    }
    failures.sort((x, y) => x.margin - y.margin);
    return { rollViews, failures, crux };
  }

  private async promisesKeptBy(campaignId: string, actions: ResolvedAction[]): Promise<string[]> {
    const targets = actions.map((a) => a.keepsPromiseTo).filter((x): x is string => Boolean(x));
    if (targets.length === 0) return [];
    const pending = await this.deps.db
      .select()
      .from(promises)
      .where(and(eq(promises.campaignId, campaignId), eq(promises.status, "pending")));
    return [...new Set(targets.filter((t) => pending.some((p) => p.npcId === t)))];
  }

  private async applyLoomEffects(tx: Tx, result: LoomResult, party: CharacterRow[], story: StoryState) {
    const used = new Set<string>();
    for (const effect of result.effects) {
      switch (effect.kind) {
        case "disadvantage_next_roll":
          for (const id of effect.characterIds) {
            const p = party.find((x) => x.id === id);
            if (p)
              await tx
                .update(characters)
                .set({ resources: { ...p.resources, disadvantageNext: 1 } })
                .where(eq(characters.id, id));
            used.add(id);
          }
          break;
        case "faction_disposition":
          story.factionDisposition = {
            ...story.factionDisposition,
            [effect.factionId]: Math.max(
              -3,
              Math.min(3, (story.factionDisposition[effect.factionId] ?? 0) + effect.delta),
            ),
          };
          break;
        case "hero_rallies": {
          const p = party.find((x) => x.id === effect.characterId);
          if (p) {
            await tx
              .update(characters)
              .set({ hp: Math.max(1, p.hp), conditions: p.conditions.filter((cnd) => cnd !== "dazed") })
              .where(eq(characters.id, p.id));
          }
          break;
        }
        case "route_blocked":
        case "failure_softened":
          break;
      }
    }
    // Disadvantage tokens are spent by the roll they applied to.
    for (const p of party) {
      if (!used.has(p.id) && (p.resources.disadvantageNext ?? 0) > 0) {
        await tx
          .update(characters)
          .set({ resources: { ...p.resources, disadvantageNext: 0 } })
          .where(eq(characters.id, p.id));
      }
    }
  }

  /**
   * Applies what the storyteller says changed, once the rules have checked it: only the people present change how
   * they feel or where they go, only this scene's clues and loot can be found, and a fight breaks out only with
   * foes the scene allows. The scenes come back with their people as the changes leave them; the plan is changed
   * in place.
   */
  private async applyChanges(
    tx: Tx,
    args: {
      index: WorldIndex;
      c: CampaignRow;
      plan: StoryPlan | null;
      /** The scene this turn is in, and the one it opens if it changes scene. */
      scenes: SceneSpec[];
      party: CharacterRow[];
      changes: StoryChange[];
      seq: number;
      /** Changed in place: what the heroes have found out. */
      story: StoryState;
    },
  ): Promise<{ scenes: SceneSpec[]; fight: string[] | null; planChanged: boolean }> {
    const { index, c, plan, party, seq, story } = args;
    const scenesOut = args.scenes.map((s) => ({ ...s, entities: s.entities.map((e) => ({ ...e })) }));
    const result = { scenes: scenesOut, fight: null as string[] | null, planChanged: false };
    if (args.changes.length === 0) return result;
    const continuing = scenesOut.at(-1) as SceneSpec;
    const invRows = await this.inventoryForTx(tx, party);
    const [questRows, promiseRows, canonRows] = await Promise.all([
      tx.select().from(quests).where(eq(quests.campaignId, c.id)),
      tx.select().from(promises).where(eq(promises.campaignId, c.id)),
      tx.select().from(canonEntities).where(eq(canonEntities.campaignId, c.id)),
    ]);
    const loomRec = await loadLoom(tx, c.id);
    const guarded = new Set(loomRec.state.bearers.filter((b) => b.mustSurvive).map((b) => b.npcId));
    const present = new Set(
      scenesOut.flatMap((s) => s.entities.filter((e) => e.kind === "npc" && e.present).map((e) => e.ref.id)),
    );
    const found = new Set(
      plan?.mysteries.flatMap((m) => m.clues.filter((cl) => cl.found).map((cl) => cl.id)) ?? [],
    );
    const told = await campaignStory(tx, c);
    const ctx: ChangeContext = {
      index,
      heroes: new Map(
        party.map((p) => [
          p.id,
          {
            level: p.level,
            gold: p.gold,
            inventory: new Map(invRows.filter((i) => i.characterId === p.id).map((i) => [i.itemId, i.qty])),
          },
        ]),
      ),
      cast: new Map([...present].map((id) => [id, { protected: guarded.has(id) }])),
      present,
      clues: new Set(scenesOut.flatMap((s) => s.clues).filter((id) => !found.has(id))),
      allowedLoot: new Set(scenesOut.flatMap((s) => lootFor(index, s.regionId).map((l) => l.id))),
      foes: new Set(continuing.foes.map((f) => f.creature)),
      fighting: continuing.combat?.phase === "fighting",
      promises: new Set(promiseRows.filter((p) => p.status === "pending").map((p) => p.id)),
      goals: new Set(questRows.filter((q) => q.status === "active").map((q) => q.questId)),
      knownNames: new Set(
        [
          ...canonRows.map((r) => r.name),
          ...index.world.npcs.named.map((n) => n.name),
          ...party.map((p) => p.name),
          ...(plan?.cast.map((m) => m.name) ?? []),
        ].map((n) => n.toLowerCase()),
      ),
      bannedTerms: bannedTermsFor(index.world, told.story.intensity),
      sceneHasHazard: scenesOut.some((s) => s.dangerous),
    };
    const { accepted, rejected } = validateChanges(args.changes, ctx);
    if (rejected.length > 0)
      this.log.info("story changes turned back", {
        rejected: rejected.map((r) => `${r.change.kind}: ${r.reason}`),
      });

    const member = (id: string) => {
      if (!plan) return null;
      const known = castMember(plan, id);
      if (known) return known;
      const fromWorld = castFromWorld(index, id);
      if (fromWorld) plan.cast.push(fromWorld);
      return fromWorld;
    };
    const nameOf = (id: string) =>
      castMember(plan, id)?.name ??
      index.namedNpcs.get(id)?.name ??
      scenesOut.flatMap((s) => s.entities).find((e) => e.ref.id === id)?.ref.name ??
      id;
    const meet = async (id: string, set: { status?: string; disposition?: number }) => {
      const npc = index.namedNpcs.get(id);
      await tx
        .insert(npcs)
        .values({
          campaignId: c.id,
          id,
          name: nameOf(id),
          status: set.status ?? "active",
          disposition: set.disposition ?? 0,
          factionId: npc?.faction ?? castMember(plan, id)?.faction ?? null,
          tags: npc?.tags ?? [],
          firstMetTurn: seq,
        })
        .onConflictDoUpdate({
          target: [npcs.campaignId, npcs.id],
          set:
            set.status !== undefined
              ? { status: set.status }
              : { disposition: sql`${npcs.disposition} + ${set.disposition ?? 0}` },
        });
    };

    for (const d of accepted) {
      switch (d.kind) {
        case "attitude": {
          const m = member(d.who);
          if (m) {
            m.attitude = Math.max(-3, Math.min(3, m.attitude + d.by));
            result.planChanged = true;
          }
          await meet(d.who, { disposition: d.by });
          break;
        }
        case "whereabouts": {
          const m = member(d.who);
          if (m) {
            m.status = d.status;
            if (d.status !== "with_heroes") m.regionId = continuing.regionId;
            result.planChanged = true;
          }
          for (const sc of scenesOut)
            for (const e of sc.entities.filter((x) => x.ref.id === d.who)) {
              e.present = d.status === "active" || d.status === "with_heroes";
              e.status =
                d.status === "with_heroes"
                  ? "befriended"
                  : d.status === "captured"
                    ? "captured"
                    : d.status === "away"
                      ? "away"
                      : d.status === "active"
                        ? e.status
                        : "fled";
            }
          await meet(d.who, { status: d.status });
          break;
        }
        case "clue": {
          const mystery = plan?.mysteries.find((m) => m.clues.some((cl) => cl.id === d.clue));
          const clue = mystery?.clues.find((cl) => cl.id === d.clue);
          if (mystery && clue) {
            clue.found = true;
            mystery.solved = mystery.clues.filter((cl) => cl.found).length >= 2;
            story.discoveries = [...story.discoveries, clue.text].slice(-30);
            result.planChanged = true;
          }
          break;
        }
        case "promise":
          await tx
            .insert(promises)
            .values({ campaignId: c.id, npcId: d.who, text: d.text.trim(), madeTurn: seq });
          break;
        case "promise_settled":
          await tx
            .update(promises)
            .set({ status: d.kept ? "kept" : "broken" })
            .where(and(eq(promises.campaignId, c.id), eq(promises.id, d.promise)));
          break;
        case "item":
          await tx
            .insert(inventoryItems)
            .values({ characterId: d.hero, itemId: d.item, qty: 1 })
            .onConflictDoUpdate({
              target: [inventoryItems.characterId, inventoryItems.itemId],
              set: { qty: sql`${inventoryItems.qty} + 1` },
            });
          break;
        case "item_used":
          await tx
            .update(inventoryItems)
            .set({ qty: sql`${inventoryItems.qty} - 1` })
            .where(and(eq(inventoryItems.characterId, d.hero), eq(inventoryItems.itemId, d.item)));
          await tx
            .delete(inventoryItems)
            .where(and(eq(inventoryItems.characterId, d.hero), sql`${inventoryItems.qty} <= 0`));
          break;
        case "gold":
          await tx
            .update(characters)
            .set({ gold: sql`greatest(0, ${characters.gold} + ${d.amount})` })
            .where(eq(characters.id, d.hero));
          break;
        case "new_person": {
          await tx
            .insert(canonEntities)
            .values({
              campaignId: c.id,
              kind: "npc",
              name: d.name,
              description: d.description,
              tags: [],
              introducedTurn: seq,
            })
            .onConflictDoNothing();
          if (plan) {
            let id = `cast-${slug(d.name)}`;
            while (plan.cast.some((m) => m.id === id)) id = `${id}-2`;
            plan.cast.push({
              id,
              name: d.name,
              role: d.description.slice(0, 120),
              agenda: "",
              voice: "",
              secret: null,
              attitude: 0,
              status: "active",
              regionId: continuing.regionId,
              faction: null,
              tags: [],
            });
            continuing.entities.push({
              ref: { kind: "npc", id, name: d.name, tags: [] },
              kind: "npc",
              status: "neutral",
              lowly: false,
              present: true,
            });
            result.planChanged = true;
          }
          break;
        }
        case "new_place":
        case "new_thing":
          await tx
            .insert(canonEntities)
            .values({
              campaignId: c.id,
              kind: d.kind === "new_place" ? "place" : "item",
              name: d.name,
              description: d.description,
              tags: [],
              introducedTurn: seq,
            })
            .onConflictDoNothing();
          break;
        case "goal": {
          let id = `goal-${slug(d.title)}`;
          while (questRows.some((q) => q.questId === id)) id = `${id}-2`;
          questRows.push({
            campaignId: c.id,
            questId: id,
            title: d.title,
            objective: d.objective,
            status: "active",
          });
          await tx
            .insert(quests)
            .values({ campaignId: c.id, questId: id, title: d.title.trim(), objective: d.objective.trim() })
            .onConflictDoNothing();
          break;
        }
        case "goal_done":
          await tx
            .update(quests)
            .set({ status: d.done ? "completed" : "failed" })
            .where(and(eq(quests.campaignId, c.id), eq(quests.questId, d.goal)));
          break;
        case "fight":
          result.fight = d.foes;
          break;
        case "hazard": {
          // A scald or a fall hurts, but only a fight knocks a hero out.
          const p = party.find((x) => x.id === d.hero);
          if (p)
            await tx
              .update(characters)
              .set({ hp: Math.max(Math.min(p.hp, 1), p.hp - d.amount) })
              .where(eq(characters.id, p.id));
          break;
        }
        case "condition": {
          const p = party.find((x) => x.id === d.hero);
          if (!p) break;
          const next = d.add
            ? [...new Set([...p.conditions, d.condition])]
            : p.conditions.filter((x) => x !== d.condition);
          await tx.update(characters).set({ conditions: next }).where(eq(characters.id, p.id));
          break;
        }
      }
    }
    return result;
  }

  // ------------------------------------------------------------ table tools

  /** Remembers which Discord message shows a round, and when it times out. */
  async setRoundMessage(roundId: string, messageId: string, deadlineAt: Date | null) {
    await this.deps.db
      .update(rounds)
      .set({ discordMessageId: messageId, deadlineAt, remindedAt: null })
      .where(eq(rounds.id, roundId));
  }

  /** A new deadline (or none) for an open round, e.g. after a pause or a change of pace. */
  async setRoundDeadline(roundId: string, deadlineAt: Date | null) {
    await this.deps.db
      .update(rounds)
      .set({ deadlineAt, remindedAt: null })
      .where(and(eq(rounds.id, roundId), eq(rounds.status, "collecting")));
  }

  async markReminded(roundId: string, at = new Date()) {
    await this.deps.db.update(rounds).set({ remindedAt: at }).where(eq(rounds.id, roundId));
  }

  /** The players who haven't acted yet, for pings and reminders. */
  async waitingOnPlayers(
    roundId: string,
    campaignId: string,
  ): Promise<Array<{ userId: string; name: string }>> {
    const party = await this.party(campaignId);
    const acted = await this.deps.db.select().from(pendingActions).where(eq(pendingActions.roundId, roundId));
    const done = new Set(acted.map((a) => a.characterId));
    return party.filter((p) => !done.has(p.id)).map((p) => ({ userId: p.userId, name: p.name }));
  }

  /** Every open round in a running campaign, for bringing back timers and reminders after a restart. */
  async openRounds() {
    return this.deps.db
      .select({ round: rounds, campaign: campaigns })
      .from(rounds)
      .innerJoin(campaigns, eq(campaigns.id, rounds.campaignId))
      .where(and(eq(rounds.status, "collecting"), eq(campaigns.status, "active")));
  }

  async getRound(roundId: string) {
    const [r] = await this.deps.db.select().from(rounds).where(eq(rounds.id, roundId));
    return r ?? null;
  }

  /** Open rounds with a deadline, for rescheduling timers after a restart. */
  async openTimedRounds() {
    return this.deps.db
      .select({ round: rounds, campaign: campaigns })
      .from(rounds)
      .innerJoin(campaigns, eq(campaigns.id, rounds.campaignId))
      .where(
        and(
          eq(rounds.status, "collecting"),
          eq(campaigns.status, "active"),
          sql`${rounds.deadlineAt} is not null`,
        ),
      );
  }

  /** The X-card: anyone can quietly ask the story to move away from something. */
  async xcard(campaignId: string, _userId: string) {
    const db = this.deps.db;
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!c) throw new GameError("no campaign", "That campaign doesn't exist.");
    const story = asStory(c.story);
    await db
      .update(campaigns)
      .set({
        story: { ...story, steerAway: true } as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId));
    await db.insert(safetyEvents).values({
      guildId: c.guildId,
      campaignId,
      userId: null,
      stage: "xcard",
      verdict: "steer_away",
      categories: [],
    });
  }

  // ------------------------------------------------------------ rewinding

  /** The host, the DM or a guardian. */
  private async supervised(campaignId: string, userId: string): Promise<CampaignRow> {
    const [c] = await this.deps.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!c) throw new GameError("no campaign", "That campaign doesn't exist.");
    let ok = c.createdBy === userId || c.dmUserId === userId;
    if (!ok) {
      const [m] = await this.deps.db
        .select()
        .from(campaignMembers)
        .where(and(eq(campaignMembers.campaignId, c.id), eq(campaignMembers.userId, userId)));
      ok = m?.role === "guardian";
    }
    if (!ok) throw new GameError("not supervisor", "Only the host, the DM or a guardian can do that.");
    if (c.status === "setup") throw new GameError("not started", "The adventure hasn't started yet.");
    return c;
  }

  /** The turns this campaign can rewind to, newest first, and how the party stood after each. */
  async rewindPoints(campaignId: string, userId: string) {
    const c = await this.supervised(campaignId, userId);
    const party = await this.party(c.id);
    const names = new Map(party.map((p) => [p.id, p.name]));
    const points = await restorePointSeqs(this.deps.db, c.id, c.turnSeq, 15);
    return {
      campaignId: c.id,
      campaignName: c.name,
      turnSeq: c.turnSeq,
      party: party.map((p) => ({ name: p.name, hp: p.hp, hpMax: p.hpMax })),
      fighting: Boolean(asStory(c.story).sceneKind) && (await this.currentFight(c)) !== null,
      partialHits: campaignSettings(c).combatRules.partialHits,
      points: points
        .filter((p) => !isRewound(c.story, p.turnSeq))
        .slice(0, 10)
        .map((p) => ({
          turnSeq: p.turnSeq,
          turnsBack: c.turnSeq - p.turnSeq,
          sceneTitle: p.sceneTitle,
          fighting: p.fighting,
          battleRound: p.battleRound,
          party: p.heroes
            .filter((h) => names.has(h.id))
            .map((h) => ({ name: names.get(h.id) as string, hp: h.hp, hpMax: h.hpMax })),
        })),
    };
  }

  /**
   * Puts the game back as it stood after turn `toSeq`: the party, their packs, the scene and the choices
   * before them. History stays append-only; the turns after it are marked rewound and the storyteller
   * forgets them.
   */
  async rewind(
    campaignId: string,
    userId: string,
    toSeq: number,
    reason = "",
  ): Promise<{ view: TurnView; undone: number }> {
    await this.supervised(campaignId, userId);
    return this.deps.db.transaction(async (tx) => {
      const [locked] = await tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).for("update");
      if (!locked) throw new GameError("no campaign", "That campaign doesn't exist.");
      if (toSeq >= locked.turnSeq) throw new GameError("nothing to undo", "The story is already there.");
      if (isRewound(locked.story, toSeq))
        throw new GameError("already undone", "That turn was itself rewound. Pick another.");
      const point = await loadRestorePoint(tx, campaignId, toSeq);
      if (!point?.scene)
        throw new GameError(
          "no restore point",
          "I can't rewind that far: restore points begin with the first turn played after the update that added them.",
        );
      const seq = locked.turnSeq + 1;
      const why = reason.trim().slice(0, 300);
      await tx
        .update(rounds)
        .set({ status: "cancelled" })
        .where(and(eq(rounds.campaignId, campaignId), inArray(rounds.status, ["collecting", "resolving"])));
      // Drafts waiting for a DM are for a turn that won't happen now.
      await tx
        .delete(turns)
        .where(and(eq(turns.campaignId, campaignId), sql`${turns.seq} > ${locked.turnSeq}`));
      const { roundId } = await applyRestorePoint(tx, campaignId, point, seq);
      const story: StoryState = {
        ...asStory(point.story),
        rewound: [...(asStory(locked.story).rewound ?? []), [toSeq + 1, seq]],
      };
      await tx.insert(turns).values({
        campaignId,
        seq,
        status: "committed",
        stage: "committed",
        data: { mode: "rewind", toSeq, fromSeq: locked.turnSeq, by: userId, reason: why },
        committedAt: new Date(),
      });
      await tx.insert(events).values({
        campaignId,
        turnSeq: seq,
        type: "rewound",
        payload: { toSeq, fromSeq: locked.turnSeq, by: userId, reason: why },
      });
      await tx
        .update(campaigns)
        .set({
          turnSeq: seq,
          story: story as unknown as Record<string, unknown>,
          status: locked.status === "paused" ? "paused" : "active",
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campaignId));
      await saveRestorePoint(tx, campaignId, seq, roundId);

      const { index } = this.deps.worlds.get(locked.worldId);
      const spec = normalizeSpec(point.scene.state);
      const plan = await loadPlan(tx, campaignId);
      const [told] = await tx
        .select()
        .from(turns)
        .where(and(eq(turns.campaignId, campaignId), eq(turns.seq, toSeq)));
      const said = told?.data.narration as NarratorOutput | undefined;
      const party = await this.partyTx(tx, campaignId);
      const fighting = spec.combat?.phase === "fighting";
      const view = this.turnView({
        c: locked,
        index,
        plan,
        seq,
        spec,
        out: said ?? quietNarration(`The story returns to ${spec.title}.`),
        rolls: [],
        roundId,
        sceneChanged: true,
        levelUps: [],
        ended: false,
        combat: spec.combat ? combatView(spec.combat, party) : null,
        choices: fighting ? [] : ((point.round?.choices ?? []) as Array<{ label: string }>),
      });
      return { view, undone: locked.turnSeq - toSeq };
    });
  }

  private async currentFight(c: CampaignRow) {
    const sceneId = asStory(c.story).sceneId;
    if (!sceneId) return null;
    const [row] = await this.deps.db.select().from(scenes).where(eq(scenes.id, sceneId));
    const spec = row ? normalizeSpec(row.state) : undefined;
    return row && spec?.combat?.phase === "fighting" ? { row, spec } : null;
  }

  /** Switches partial hits on or off, from the next round of a fight. */
  async setPartialHits(campaignId: string, userId: string, on: boolean): Promise<void> {
    const c = await this.supervised(campaignId, userId);
    await this.deps.db.transaction(async (tx) => {
      await tx
        .update(campaigns)
        .set({
          settings: { ...(c.settings as Record<string, unknown>), partialHits: on },
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, c.id));
      await tx.insert(events).values({
        campaignId,
        turnSeq: c.turnSeq,
        type: "fight_rules_changed",
        payload: { by: userId, partialHits: on },
      });
    });
  }

  /** For any campaign, restore points or not: everyone back on their feet and fully rested. */
  async mendParty(campaignId: string, userId: string): Promise<string[]> {
    const c = await this.supervised(campaignId, userId);
    const party = await this.party(c.id);
    await this.deps.db.transaction(async (tx) => {
      await this.longRest(tx, party);
      await tx.insert(events).values({
        campaignId,
        turnSeq: c.turnSeq,
        type: "party_mended",
        payload: { by: userId, heroes: party.map((p) => ({ id: p.id, hp: p.hp, hpMax: p.hpMax })) },
      });
      await saveRestorePoint(tx, campaignId, c.turnSeq, (await this.currentRound(campaignId))?.id ?? null);
    });
    return party.map((p) => p.name);
  }

  /**
   * Builds the fight in progress again from the bestiary, balanced for the party as it is now. For fights
   * that began before the balance did, or that went wrong.
   */
  async rebuildFight(campaignId: string, userId: string): Promise<TurnView> {
    const c = await this.supervised(campaignId, userId);
    const fight = await this.currentFight(c);
    if (!fight) throw new GameError("no fight", "There's no fight going on right now.");
    const { index } = this.deps.worlds.get(c.worldId);
    const party = await this.party(c.id);
    const loom = await loadLoom(this.deps.db, c.id);
    const told = await campaignStory(this.deps.db, c);
    const old = fight.spec;
    const oldFoes = new Set(old.combat?.foes.map((f) => f.id) ?? []);
    // A story fight keeps its own foes (balanced now); a road ambush draws afresh from where it happens.
    const bare: SceneSpec = {
      ...old,
      kind: "combat",
      foes: old.kind === "combat" ? old.foes : [],
      entities: old.entities.filter((e) => !oldFoes.has(e.ref.id)),
    };
    delete bare.combat;
    const built = withEncounter(
      index,
      bare,
      party,
      heroesFor(index, party, await this.inventoryFor(party)),
      this.dice(loom.masterSeed, c.turnSeq + 1, "rebuild"),
      tableRules(c, told),
    );
    if (!built.combat)
      throw new GameError("no foes", "I couldn't find foes that fit here. Try a rewind instead.");
    // A stun or a web from the old foes still wears off on time.
    const combat = { ...built.combat, heroConditionRounds: old.combat?.heroConditionRounds ?? {} };
    const spec: SceneSpec = { ...built, combat, kind: old.kind, foes: old.foes };
    return this.deps.db.transaction(async (tx) => {
      const [open] = await tx
        .select()
        .from(rounds)
        .where(and(eq(rounds.campaignId, c.id), eq(rounds.status, "collecting")));
      await tx
        .update(rounds)
        .set({ status: "cancelled" })
        .where(and(eq(rounds.campaignId, c.id), inArray(rounds.status, ["collecting", "resolving"])));
      await tx
        .update(scenes)
        .set({ state: spec as unknown as Record<string, unknown> })
        .where(eq(scenes.id, fight.row.id));
      const roundId = await this.insertRound(tx, c.id, fight.row.id, (open?.n ?? 0) + 1, [], "combat");
      await tx.insert(events).values({
        campaignId,
        turnSeq: c.turnSeq,
        type: "fight_rebuilt",
        payload: { by: userId, foes: spec.combat?.foes.map((f) => f.creatureId) ?? [] },
      });
      await saveRestorePoint(tx, campaignId, c.turnSeq, roundId);
      const partyNow = await this.partyTx(tx, c.id);
      return this.turnView({
        plan: await loadPlan(tx, c.id),
        c,
        index,
        seq: c.turnSeq,
        spec,
        out: quietNarration(
          `The fight shifts. Now ${listFoes(spec.combat as CombatState)} stand against the heroes.`,
        ),
        rolls: [],
        roundId,
        sceneChanged: false,
        levelUps: [],
        ended: false,
        combat: spec.combat ? combatView(spec.combat, partyNow) : null,
        choices: [],
      });
    });
  }

  // ------------------------------------------------------------ helpers

  private async insertScene(tx: Tx, campaignId: string, spec: SceneSpec, seq: number): Promise<string> {
    const [row] = await tx
      .insert(scenes)
      .values({
        campaignId,
        momentId: spec.momentId,
        kind: spec.kind,
        regionId: spec.regionId,
        poiId: spec.poiId,
        title: spec.title,
        state: spec as unknown as Record<string, unknown>,
        startedTurn: seq,
      })
      .returning();
    if (!row) throw new Error("could not create scene");
    return row.id;
  }

  private async insertRound(
    tx: Tx,
    campaignId: string,
    sceneId: string,
    n: number,
    choices: NarratorOutput["choices"] | StoredChoice[],
    kind: "exploration" | "combat" = "exploration",
  ): Promise<string> {
    const [row] = await tx.insert(rounds).values({ campaignId, sceneId, n, choices, kind }).returning();
    if (!row) throw new Error("could not create round");
    return row.id;
  }

  private async recentNarration(campaignId: string, n: number): Promise<string[]> {
    const [c] = await this.deps.db
      .select({ story: campaigns.story })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId));
    const rows = await this.deps.db
      .select()
      .from(turns)
      .where(eq(turns.campaignId, campaignId))
      .orderBy(sql`${turns.seq} desc`)
      .limit(n + 30);
    return rows
      .filter((r) => !isRewound(c?.story, r.seq))
      .slice(0, n)
      .reverse()
      .map((r) => String((r.data.narration as { narration?: string } | undefined)?.narration ?? ""))
      .filter(Boolean)
      .map((t) => (t.length > 400 ? `${t.slice(0, 399)}…` : t));
  }

  /**
   * What the storyteller is given: the heroes, where the story stands in a few sentences, the scene in front of
   * them with only the people present and the clues there, this scene so far, and this turn. Never the whole
   * world, and never the hidden hand.
   */
  private async publicView(args: {
    c: CampaignRow;
    index: WorldIndex;
    plan: StoryPlan | null;
    mode: NarrationMode;
    story: NarrationStory;
    spec: SceneSpec;
    nextSpec?: SceneSpec | null;
    party: CharacterRow[];
    actions?: ResolvedAction[];
    rolls?: RollView[];
    crux?: { label: string; success: boolean } | null;
    epilogue?: string[];
    steerAway?: boolean;
    battle?: PublicSceneData["battle"];
  }): Promise<PublicSceneView> {
    const { c, index, plan } = args;
    const db = this.deps.db;
    const [questRows, promiseRows, recent, recaps] = await Promise.all([
      db
        .select()
        .from(quests)
        .where(and(eq(quests.campaignId, c.id), eq(quests.status, "active"))),
      db
        .select()
        .from(promises)
        .where(and(eq(promises.campaignId, c.id), eq(promises.status, "pending"))),
      this.recentNarration(c.id, 1),
      plan ? Promise.resolve([]) : chapterRecaps(db, c.id, 3),
    ]);
    const story = asStory(c.story);
    const nameOf = (id: string) => castMember(plan, id)?.name ?? index.namedNpcs.get(id)?.name ?? id;
    const loot = new Map(
      [args.spec, ...(args.nextSpec ? [args.nextSpec] : [])].flatMap((s) =>
        lootFor(index, s.regionId).map((l) => [l.id, l] as const),
      ),
    );
    const data: PublicSceneData = {
      mode: args.mode,
      story: args.story,
      scene: sceneSpecView(index, plan, args.spec),
      nextScene: args.nextSpec ? sceneSpecView(index, plan, args.nextSpec) : null,
      party: args.party.map((p) => ({
        ref: p.id,
        name: p.name,
        className: (p.classId && index.classes.get(p.classId)?.name) || "hero",
        pathName: index.world.paths.find((x) => x.id === p.pathId)?.name ?? "their own road",
        speciesName: (p.speciesId && index.species.get(p.speciesId)?.name) || "",
        backgroundName: (p.backgroundId && index.backgrounds.get(p.backgroundId)?.name) || "wanderer",
        keepsakeName:
          index.world.items.keepsakes.find((k) => k.id === p.keepsakeId)?.name.toLowerCase() ??
          "nothing special",
        look: p.look ?? "",
        hook: heroHook(plan, p.id),
        level: p.level,
        hp: p.hp,
        hpMax: p.hpMax,
        conditions: p.conditions,
      })),
      // Before the living story, the chapter recaps were the story's memory.
      storySoFar: plan?.storySoFar || recaps.map((r) => `Chapter ${r.chapter}: ${r.text}`).join(" "),
      discoveries: story.discoveries,
      goals: questRows.map((q) => ({ id: q.questId, title: q.title, objective: q.objective })),
      promises: promiseRows.map((p) => ({ id: p.id, to: nameOf(p.npcId), text: p.text })),
      troubles: troubles(plan),
      sceneLog: args.spec.log,
      lastNarration: recent[0] ?? "",
      actions: (args.actions ?? []).map((a) => ({
        characterRef: a.characterId,
        characterName: a.name,
        summary: a.summary,
      })),
      rolls: (args.rolls ?? []).map((r) => ({
        characterName: r.characterName,
        label: r.label,
        total: r.total,
        difficulty: r.difficulty,
        success: r.success,
        natural: r.natural,
        ...(r.damage ? { damage: r.damage } : {}),
      })),
      crux: args.crux ?? null,
      allowedLoot: [...loot.values()],
      epilogue: args.epilogue ?? [],
      steerAway: args.steerAway ?? false,
      ...(args.battle ? { battle: args.battle } : {}),
    };
    return publicSceneView(data);
  }

  private turnView(args: {
    c: CampaignRow;
    index: WorldIndex;
    plan: StoryPlan | null;
    seq: number;
    spec: SceneSpec;
    out: NarratorOutput;
    rolls: RollView[];
    roundId: string | null;
    sceneChanged: boolean;
    levelUps: TurnView["levelUps"];
    ended: boolean;
    combat?: CombatView | null;
    /** Overrides the narrator's choices (battle rounds have none; the mercy moment has its own). */
    choices?: Array<{ label: string }>;
  }): TurnView {
    const v = sceneSpecView(args.index, args.plan, args.spec);
    const nameOf = (ref: string) =>
      args.spec.entities.find((e) => e.ref.id === ref)?.ref.name ??
      castMember(args.plan, ref)?.name ??
      args.index.namedNpcs.get(ref)?.name ??
      ref;
    return {
      campaignId: args.c.id,
      seq: args.seq,
      sceneTitle: args.spec.title,
      sceneKind: args.spec.kind,
      locationName: v.locationName,
      regionId: args.spec.regionId,
      narration: args.out.narration,
      npcLines: args.out.npcLines.map((l) => ({ name: nameOf(l.npcRef), line: l.line })),
      rolls: args.rolls,
      choices: (args.choices ?? args.out.choices).map((ch, i) => ({ index: i, label: ch.label })),
      roundId: args.roundId,
      sceneChanged: args.sceneChanged,
      imageBrief: args.out.imageBrief,
      levelUps: args.levelUps,
      campaignEnded: args.ended,
      combat: args.combat ?? null,
    };
  }
}

/** What can be found in a region, by its loot table. */
function lootFor(index: WorldIndex, regionId: string): Array<{ id: string; name: string }> {
  const region = index.regions.get(regionId);
  const table = region?.lootTable
    ? index.world.items.lootTables.find((t) => t.id === region.lootTable)
    : undefined;
  return (table?.entries ?? []).map((e) => ({ id: e.item, name: index.items.get(e.item)?.name ?? e.item }));
}

/** How a scene ended, for the director: the fight, or the decisive moment and what came of it. */
function outcomeLines(
  fight: "ongoing" | "victory" | "party_down" | null,
  played: StoryPlan["moments"][number] | undefined,
): string[] {
  const out: string[] = [];
  if (fight === "victory") out.push("The heroes won the fight.");
  if (fight === "party_down")
    out.push("The heroes were overwhelmed and knocked out of the fight; they wake up safe.");
  if (played?.outcome) {
    const said =
      played.outcome === "fail_forward"
        ? played.crux.onFailForward
        : played.outcome === "costly_success"
          ? played.crux.onCostlySuccess
          : played.crux.onSuccess;
    out.push(`Decisive moment, ${played.title}: ${said.replace(/\s+/g, " ").trim()}`);
  }
  return out;
}

function profileLength(c: CampaignRow) {
  return profileOf(c).length;
}

function lowerFirst(s: string): string {
  return s.length > 0 ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function rollView(name: string, label: string, check: CheckResult): RollView {
  return {
    characterName: name,
    label,
    natural: check.natural,
    rolls: check.rolls,
    modifier: check.modifier + check.bonus,
    total: check.total,
    difficulty: difficultyLabel(check.dc),
    success: check.success,
    mode: check.mode,
  };
}

function toLoomEntity(e: SceneEntityState): SceneEntity {
  const status =
    e.status === "at_mercy" || e.status === "captured"
      ? "at_mercy"
      : e.status === "hostile"
        ? "hostile"
        : e.status === "friendly" || e.status === "befriended"
          ? "friendly"
          : "neutral";
  return {
    ref: e.ref,
    status,
    lowly: e.lowly,
    present: e.present && e.status !== "away" && e.status !== "fled",
  };
}

/** A line of narration with nothing else: no voices, choices, picture or changes. */
function quietNarration(narration: string): NarratorOutput {
  return {
    narration,
    npcLines: [],
    choices: [],
    sceneOver: false,
    happened: "",
    changes: [],
    imageBrief: null,
  };
}

/** An opening waiting for a person in the DM room, because the AI couldn't make or tell it. */
interface OpeningDraft {
  opening: true;
  campaignId: string;
  seq: number;
  mode: "opening";
  /** The director built this story and scene. When it couldn't, the seed's own plan and a scene a person opens. */
  framed: boolean;
  plan: StoryPlan;
  spec: SceneSpec;
  view: PublicSceneData;
  choicesFor: SceneSpecView;
  narration: NarratorOutput;
  handoff: string[] | null;
  /** When the director couldn't make the story: how the seed can begin, for the person starting it. */
  options: string[];
}

function isOpening(turn: PreparedTurn | OpeningDraft): turn is OpeningDraft {
  return "opening" in turn && turn.opening === true;
}

/** How a handed-over turn lists a player's words the action reader couldn't read. */
const NOT_READ = "Not read: ";

/** What a handed-over turn carries until a person tells it. */
function blankNarration(): NarratorOutput {
  return quietNarration("");
}

const sceneBrief = (s: SceneSpec): SceneBrief => ({
  title: s.title,
  summary: s.summary,
  question: s.question,
});

/** Everything a person needs to tell a turn the AI couldn't, besides the actions and dice already on the draft. */
function handoffFor(turn: PreparedTurn | OpeningDraft, reasons: string[]): DraftHandoff {
  const decisions: string[] = [];
  if (isOpening(turn)) {
    if (!turn.framed)
      return {
        reasons,
        scene: { title: turn.plan.title, summary: turn.plan.pitch, question: "How does the story begin?" },
        next: null,
        decisions: [
          "This is the start of the adventure: introduce the heroes and begin the story where it suits you. The story director takes it from there next turn.",
        ],
        options: turn.options,
      };
    decisions.push("This is the start of the adventure: introduce the heroes and set the first scene.");
    if (turn.spec.combat?.phase === "fighting")
      decisions.push(`A fight starts at once: ${listFoes(turn.spec.combat)}.`);
    return { reasons, scene: sceneBrief(turn.spec), next: null, decisions, options: [] };
  }
  if (turn.mode === "finale") decisions.push("This turn ends the adventure.");
  else if (turn.nextSpec) decisions.push("This turn closes the scene; the story moves on to the next scene.");
  else if (turn.closing)
    decisions.push(
      "This turn closes the scene, and the story director couldn't frame the next one: tell where the heroes go. The director takes it from there next turn.",
    );
  else decisions.push("The heroes stay in this scene.");
  if (turn.cruxLabel)
    decisions.push(
      `Decisive moment, ${turn.cruxLabel}: ${turn.cruxSuccess ? "it worked" : "it didn't work"}.`,
    );
  if (turn.combat) {
    decisions.push(...turn.combat.log.map((l) => `Fight: ${l}`));
    if (turn.combat.outcome === "victory") decisions.push("The heroes won the fight.");
    if (turn.combat.outcome === "party_down")
      decisions.push("Every hero was knocked out: they wake up safe, battered but whole, somewhere else.");
  }
  const view = turn.view as PublicSceneData;
  if (view.allowedLoot.length > 0)
    decisions.push(`May be found here: ${view.allowedLoot.map((l) => l.name).join(", ")}.`);
  if (view.epilogue.length > 0) decisions.push(...view.epilogue.map((l) => `Epilogue to weave in: ${l}`));
  return {
    reasons,
    scene: sceneBrief(turn.spec),
    next: turn.nextSpec ? sceneBrief(turn.nextSpec) : null,
    decisions,
    options: turn.options,
  };
}
