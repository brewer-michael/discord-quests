import { createHash } from "node:crypto";
import {
  type CombatAction,
  CombatActionSchema,
  type CombatRules,
  type CombatState,
  canCast,
  fightingFoes,
  foeCondition,
  foesAtMercy,
  isDownHero,
  resolveCombatRound,
} from "@dq/core/combat";
import { type DeltaContext, type DeltaProposal, validateDeltas } from "@dq/core/deltas";
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
import { chapterComplete, clockKey, cruxDc, storyProgress, tickClock } from "@dq/core/story";
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
  syncEntities,
  withEncounter,
} from "./combat";
import { type EngineDeps, GameError, realDice, silentLogger } from "./deps";
import { nextSceneSpec, type SceneEntityState, type SceneSpec } from "./director";
import { clearPendingLoom, loadLoom, loadPendingLoom, saveLoom, savePendingLoom } from "./loom-store";
import { narrate } from "./narrator";
import { applyPlan, latestPlan, planChapter } from "./planner";
import { applyRestorePoint, loadRestorePoint, restorePointSeqs, saveRestorePoint } from "./restore-points";
import { campaignStory } from "./story-profile";
import { asStory, isRewound, type StoryState } from "./story-state";
import type { DmDraft, PreparedTurn, ResolveResult, RollView, SubmitResult, TurnView } from "./views";

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
}

const SHORTCUT_EVIDENCE: DeedCandidate["evidence"] = {};

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);
}

export function campaignSettings(c: CampaignRow) {
  const s = c.settings as Record<string, unknown>;
  return {
    epilogueStyle: (s.epilogueStyle as EpilogueStyle) ?? "subtle",
    /** Table rules for fights. Off unless the campaign switches them on. */
    combatRules: { partialHits: s.partialHits === true } satisfies CombatRules,
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

  /** Starts the adventure: plans the first scene and narrates the opening. */
  async openCampaign(campaignId: string, userId: string): Promise<TurnView> {
    const db = this.deps.db;
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!c) throw new GameError("no campaign", "That campaign doesn't exist.");
    if (c.status !== "setup") throw new GameError("already started", "This campaign has already started.");
    if (c.createdBy !== userId && c.dmUserId !== userId)
      throw new GameError("not host", "Only the host or the DM can start the campaign.");
    const party = await this.party(campaignId);
    if (party.length === 0)
      throw new GameError("no heroes", "At least one hero needs to be ready before the adventure can begin.");

    const { index } = this.deps.worlds.get(c.worldId);
    const loom = await loadLoom(db, campaignId);
    const story = asStory(c.story);
    const planned = nextSceneSpec(index, story, loom.state);
    if (!planned) throw new GameError("empty world", "This world has no story to tell yet.");
    const seq = c.turnSeq + 1;
    const told = await campaignStory(this.deps.db, c);
    const spec = withEncounter(
      index,
      planned,
      party,
      heroesFor(index, party, await this.inventoryFor(party)),
      this.dice(loom.masterSeed, seq, "encounter"),
      { intensity: told.story.intensity, avoid: told.story.lines, combat: campaignSettings(c).combatRules },
    );

    const view = this.publicView({
      index,
      mode: "opening",
      story: told.story,
      spec,
      nextSpec: null,
      party,
      actions: [],
      rolls: [],
      crux: null,
      epilogue: [],
      recent: [],
      quests: [],
      canon: [],
    });
    const narration = await narrate({
      llm: this.deps.llm,
      world: index.world,
      view,
      directives: [],
      scope: { guildId: c.guildId, campaignId },
      log: this.log,
      choicesFor: view.scene,
    });

    return db.transaction(async (tx) => {
      const [locked] = await tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).for("update");
      if (locked?.status !== "setup")
        throw new GameError("already started", "This campaign has already started.");
      const sceneId = await this.insertScene(tx, campaignId, spec, seq);
      const fightStarts = spec.combat?.phase === "fighting";
      const roundId = await this.insertRound(
        tx,
        campaignId,
        sceneId,
        1,
        fightStarts ? [] : narration.output.choices,
        fightStarts ? "combat" : "exploration",
      );
      const nextStory: StoryState = {
        ...story,
        sceneId,
        sceneKind: spec.kind,
        beatId: spec.beatId,
        poiId: spec.poiId,
        roundsInScene: 0,
        closeNextRound: false,
      };
      const opened = await this.applyNarratorDeltas(
        tx,
        index,
        locked,
        nextStory,
        party,
        narration.output.proposedDeltas,
        new Map(),
        seq,
        spec,
      );
      if (opened.entitiesChanged)
        await tx
          .update(scenes)
          .set({ state: spec as unknown as Record<string, unknown> })
          .where(eq(scenes.id, sceneId));
      await tx.insert(turns).values({
        campaignId,
        seq,
        status: "committed",
        stage: "committed",
        data: { mode: "opening", narration: narration.output, fallback: narration.fallback },
        committedAt: new Date(),
      });
      await tx
        .insert(events)
        .values({ campaignId, turnSeq: seq, type: "campaign_started", payload: { sceneId } });
      await tx
        .update(campaigns)
        .set({
          status: "active",
          turnSeq: seq,
          story: nextStory as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campaignId));
      await saveRestorePoint(tx, campaignId, seq, roundId);
      return this.turnView({
        c: locked,
        index,
        seq,
        spec,
        out: narration.output,
        rolls: [],
        roundId,
        sceneChanged: true,
        levelUps: [],
        ended: false,
        fallback: narration.fallback,
        combat: spec.combat ? combatView(spec.combat, party) : null,
        ...(fightStarts ? { choices: [] } : {}),
      });
    });
  }

  // ------------------------------------------------------------ actions

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
      {
        const verdict = await this.deps.llm.structured(
          {
            task: "safety",
            system: playerSafetySystem(index.world, told.story.intensity),
            user: [{ text }],
            schema: SafetyOutput,
            schemaName: "verdict",
            maxOutputTokens: 1000,
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
   * for the human DM instead. Returns null if someone else is already
   * resolving this round.
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
      if (c?.mode === "assist" && c.dmUserId)
        return { kind: "draft", draft: await this.saveDraft(prepared, c.dmUserId) };
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

  /** Everything up to (not including) the commit: intents, dice, loom, narration. Writes nothing. */
  private async prepare(
    round: typeof rounds.$inferSelect,
  ): Promise<{ turn: PreparedTurn; loom: LoomResult; inputHash: string }> {
    const db = this.deps.db;
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, round.campaignId));
    if (!c) throw new GameError("no campaign", "That campaign doesn't exist.");
    const [sceneRow] = await db.select().from(scenes).where(eq(scenes.id, round.sceneId));
    if (!sceneRow) throw new Error("scene missing");
    const spec = sceneRow.state as unknown as SceneSpec;
    const { index } = this.deps.worlds.get(c.worldId);
    const world = index.world;
    const story = asStory(c.story);
    const party = await this.party(c.id);
    const acted = await db.select().from(pendingActions).where(eq(pendingActions.roundId, round.id));
    const loom = await loadLoom(db, c.id);
    const seq = c.turnSeq + 1;
    const settings = campaignSettings(c);
    const told = await campaignStory(this.deps.db, c);
    const ctx = loomContext(index);

    const inventory = await this.inventoryFor(party);

    // 1. Intents.
    const actions = await this.resolveIntents(c, index, spec, party, acted, round.choices as StoredChoice[]);

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
    const closing = fight
      ? fight.result.state.phase === "over"
      : spec.isCrux ||
        story.closeNextRound ||
        story.roundsInScene + 1 >= spec.targetRounds ||
        spec.combat?.phase === "aftermath";
    const { rollViews, failures, crux } = fight
      ? { rollViews: fight.rolls, failures: [], crux: null }
      : this.rollDice(index, loom.masterSeed, seq, spec, story, party, actions, loom.state, closing);
    const partyDown = fight?.result.state.outcome === "party_down";

    // 3. The loom (unless the DM has switched it off).
    const completedAfter =
      closing && spec.beatId ? [...story.completedBeats, spec.beatId] : story.completedBeats;
    const chapterRef = spec.beatId ? index.beats.get(spec.beatId) : undefined;
    const chapterEnded = Boolean(
      closing && chapterRef && chapterComplete(index, chapterRef.chapter.id, new Set(completedAfter)),
    );
    const promisesKept = await this.promisesKeptBy(c.id, actions);
    const input: LoomInput = {
      story: {
        turn: seq,
        progress: storyProgress(index, story.completedBeats),
        chapterNumber: spec.chapterNumber,
        actNumber: spec.actNumber,
        completedBeats: story.completedBeats,
        sceneChanged: story.roundsInScene === 0,
        chapterEnded,
      },
      scene: {
        id: sceneRow.id,
        kind: spec.kind,
        beatId: spec.beatId,
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
        : crux
          ? {
              kind: "crux",
              beatId: spec.beatId as string,
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
          state: loom.state,
          directives: [],
          constraints: [],
          effects: [],
          crux: null,
          audit: [{ step: "off", detail: "loom switched off by the DM" }],
        }
      : evaluateLoom(loom.state, input, ctx, deriveRng(loom.masterSeed, "loom", seq));

    // 4. What comes next. A failed crux may open a branch of the story.
    const cruxRef = crux && spec.beatId ? index.beats.get(spec.beatId)?.beat.crux : undefined;
    const failedForward = Boolean(
      crux && !crux.check.success && (!loomResult.crux || loomResult.crux.outcome === "fail_forward"),
    );
    const branchesAfter =
      failedForward && cruxRef?.onFailForward.beat
        ? [...new Set([...(story.branches ?? []), cruxRef.onFailForward.beat])]
        : (story.branches ?? []);
    let storyAfter: StoryState = { ...story, completedBeats: completedAfter, branches: branchesAfter };
    if (closing && spec.kind === "travel")
      storyAfter = { ...storyAfter, regionId: spec.regionId, poiId: null };
    const arcNext = closing ? nextSceneSpec(index, storyAfter, loomResult.state) : null;
    const plannedNext = arcNext ? applyPlan(index, arcNext, await latestPlan(db, c.id)) : null;
    const nextSpec = plannedNext
      ? withEncounter(
          index,
          plannedNext,
          party,
          heroesFor(index, party, inventory),
          this.dice(loom.masterSeed, seq, "encounter"),
          { intensity: told.story.intensity, avoid: told.story.lines, combat: settings.combatRules },
        )
      : null;
    const mode: NarrationMode = !closing ? "continue" : nextSpec ? "close_and_open" : "finale";
    const epilogue =
      mode === "finale"
        ? compileEpilogue(
            loomResult.state,
            world,
            settings.epilogueStyle,
            deriveRng(loom.masterSeed, "flavor", seq),
          )
        : [];

    // 5. Narration.
    const [questRows, canonRows] = await Promise.all([
      db.select().from(quests).where(eq(quests.campaignId, c.id)),
      db.select().from(canonEntities).where(eq(canonEntities.campaignId, c.id)).limit(30),
    ]);
    const [recent, recaps] = await Promise.all([this.recentNarration(c.id, 3), chapterRecaps(db, c.id, 3)]);
    const view = this.publicView({
      index,
      mode,
      story: told.story,
      spec: sceneSpec,
      nextSpec,
      party: fight ? this.partyAfterFight(party, fight.result.heroes) : party,
      actions: fight ? [] : actions,
      rolls: rollViews,
      crux: crux ? { label: crux.label, success: crux.check.success } : null,
      epilogue,
      recent,
      quests: questRows,
      canon: canonRows,
      steerAway: Boolean(story.steerAway),
      summaries: recaps.map((r) => `Chapter ${r.chapter}: ${r.text}`),
      ...(fight
        ? {
            battle: {
              round: fight.result.state.round,
              log: fight.result.events.map((e) => e.text),
              foes: fightingFoes(fight.result.state).map((f) => ({
                name: f.name,
                condition: foeCondition(f),
              })),
              outcome: fight.result.state.outcome ?? "ongoing",
              atMercy: foesAtMercy(fight.result.state).map((f) => f.name),
            },
          }
        : {}),
    });
    const choicesFor = nextSpec ? this.sceneSpecView(index, nextSpec) : view.scene;
    const narration = await narrate({
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
        chapterEnded,
        completedAfter,
        branchesAfter,
        promisesKept,
        view,
        choicesFor,
        narration: narration.output,
        fallback: narration.fallback,
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

  /** Work that follows a committed turn: at a chapter's end, its recap for the journal. */
  private async afterCommit(turn: PreparedTurn) {
    if (!turn.chapterEnded) return;
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
        chapterNumber: turn.spec.chapterNumber,
        telling,
      });
      // Tailor the next chapter to what the heroes did, starting with the scene that just opened.
      const story = asStory(c.story);
      if (story.ended || !story.sceneId) return;
      const [sceneRow] = await this.deps.db.select().from(scenes).where(eq(scenes.id, story.sceneId));
      const current = sceneRow?.state as unknown as SceneSpec | undefined;
      if (!current || current.chapterNumber <= turn.spec.chapterNumber) return;
      const plan = await planChapter({
        db: this.deps.db,
        llm: this.deps.llm,
        index,
        log: this.log,
        campaignId: c.id,
        guildId: c.guildId,
        chapter: current.chapterNumber,
        story,
        telling,
      });
      const tailored = applyPlan(index, current, plan);
      if (tailored !== current)
        await this.deps.db
          .update(scenes)
          .set({ state: tailored as unknown as Record<string, unknown> })
          .where(eq(scenes.id, story.sceneId));
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
      } else if (a?.kind === "freeform" && ra && !ra.passed) {
        // A clever idea of the player's own. A skill check decides whether it works.
        const p = party.find((x) => x.id === h.id) as CharacterRow;
        const targetId =
          ra.targetRef && combat.foes.some((f) => f.id === ra.targetRef) ? ra.targetRef : undefined;
        if (ra.skill || ra.ability) {
          const check = resolveCheck(
            {
              modifier: this.modifierFor(index, p, ra.skill, ra.ability),
              dc: DIFFICULTY_DC[ra.difficulty],
              mode: checkRollMode(p.conditions.filter(isCondition)),
            },
            this.dice(seed, seq, `trick:${h.id}`),
          );
          const v = rollView(h.name, ra.skill ? SKILL_NAMES[ra.skill] : "Clever idea", check);
          chosen[h.id] = {
            kind: "trick",
            summary: ra.summary,
            success: check.success,
            ...(targetId ? { targetId } : {}),
            roll: {
              label: v.label,
              natural: v.natural,
              rolls: v.rolls,
              modifier: v.modifier,
              total: v.total,
              against: v.difficulty,
              success: v.success,
              mode: v.mode,
            },
          };
        } else
          chosen[h.id] = {
            kind: "trick",
            summary: ra.summary,
            success: true,
            ...(targetId ? { targetId } : {}),
          };
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
    if (party.length === 0) return [];
    return this.deps.db
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
    const { seq, spec, nextSpec, closing, mode } = prepared;
    const narration = { output: prepared.narration, fallback: prepared.fallback };
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
      let party = await this.partyTx(tx, c.id);

      const levelUps: TurnView["levelUps"] = [];
      let storyAfter: StoryState = {
        ...story,
        completedBeats: prepared.completedAfter,
        branches: prepared.branchesAfter,
        roundsInScene: story.roundsInScene + 1,
        // Only the dice end a fight, never the narrator.
        closeNextRound: !closing && !prepared.combat && !spec.combat && narration.output.goalMet,
        steerAway: false,
      };
      if (closing && spec.kind === "travel")
        storyAfter = { ...storyAfter, regionId: spec.regionId, poiId: null };
      if (prepared.combat) {
        await this.applyFight(tx, prepared.combat, party, ruledHp);
        party = await this.partyTx(tx, c.id);
      }
      await this.applyLoomEffects(tx, loomResult, party, storyAfter);
      const applied = await this.applyNarratorDeltas(
        tx,
        index,
        c,
        storyAfter,
        party,
        narration.output.proposedDeltas,
        ruledHp,
        seq,
        spec,
      );
      if ((applied.entitiesChanged || prepared.combat) && !closing) {
        await tx
          .update(scenes)
          .set({ state: spec as unknown as Record<string, unknown> })
          .where(eq(scenes.id, prepared.sceneId));
      }
      for (const a of prepared.actions) {
        if (
          a.makesPromiseTo &&
          (index.namedNpcs.has(a.makesPromiseTo) || spec.entities.some((e) => e.ref.id === a.makesPromiseTo))
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

      let roundId: string | null = null;
      let ended = false;
      if (closing) {
        await tx
          .update(scenes)
          .set({ endedTurn: seq, state: spec as unknown as Record<string, unknown> })
          .where(eq(scenes.id, prepared.sceneId));
        // Beaten heroes are rescued and wake up safe; arriving somewhere new (or a rest) is a good night's sleep.
        if (prepared.combat?.outcome === "party_down") await this.rescue(tx, party);
        else if (spec.kind === "travel" || spec.kind === "rest") await this.longRest(tx, party);
        if (spec.kind === "travel") {
          await tx
            .insert(campaignRegions)
            .values({ campaignId: c.id, regionId: spec.regionId, state: "visited" })
            .onConflictDoUpdate({
              target: [campaignRegions.campaignId, campaignRegions.regionId],
              set: { state: "visited" },
            });
          const neighbors = index.regions.get(spec.regionId)?.edges.map((e) => e.to) ?? [];
          storyAfter.discoveredRegions = [
            ...new Set([...storyAfter.discoveredRegions, spec.regionId, ...neighbors]),
          ];
        }
        if (prepared.cruxLabel && spec.beatId) {
          const cruxSpec = index.beats.get(spec.beatId)?.beat.crux;
          if (loomResult.crux?.outcome === "fail_forward" && cruxSpec?.clock) {
            storyAfter.clocks = tickClock(
              index,
              storyAfter.clocks,
              clockKey(cruxSpec.clock.faction, cruxSpec.clock.clock),
              1,
            );
          }
        }
        if (prepared.chapterEnded) {
          storyAfter.clocks = tickClock(index, storyAfter.clocks, clockKey("gloam-host", "long-night"), 1);
          if (spec.actNumber >= 2)
            storyAfter.clocks = tickClock(index, storyAfter.clocks, clockKey("gloam-host", "ember-dims"), 1);
        }
        const beat = spec.beatId ? index.beats.get(spec.beatId)?.beat : undefined;
        if (beat?.milestone) {
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
        if (beat?.quest) {
          await tx
            .insert(quests)
            .values({
              campaignId: c.id,
              questId: beat.quest.id,
              title: beat.quest.title,
              objective: beat.quest.objective,
            })
            .onConflictDoNothing();
        }
        if (nextSpec) {
          const sceneId = await this.insertScene(tx, c.id, nextSpec, seq);
          const fightStarts = nextSpec.combat?.phase === "fighting";
          roundId = await this.insertRound(
            tx,
            c.id,
            sceneId,
            1,
            fightStarts ? [] : narration.output.choices,
            fightStarts ? "combat" : "exploration",
          );
          storyAfter = {
            ...storyAfter,
            sceneId,
            sceneKind: nextSpec.kind,
            beatId: nextSpec.beatId,
            poiId: nextSpec.poiId,
            roundsInScene: 0,
            closeNextRound: false,
          };
        } else {
          ended = true;
          storyAfter = { ...storyAfter, ended: true, sceneId: null };
        }
      } else {
        const fightOn = spec.combat?.phase === "fighting";
        const mercyNow = prepared.combat && spec.combat?.phase === "aftermath";
        roundId = await this.insertRound(
          tx,
          c.id,
          prepared.sceneId,
          prepared.roundN + 1,
          fightOn ? [] : mercyNow && spec.combat ? aftermathChoices(spec.combat) : narration.output.choices,
          fightOn ? "combat" : "exploration",
        );
      }

      await tx.update(rounds).set({ status: "resolved" }).where(eq(rounds.id, prepared.roundId));
      const turnData = {
        mode,
        actions: prepared.actions.map((a) => ({
          characterId: a.characterId,
          summary: a.summary,
          passed: a.passed,
        })),
        rolls: prepared.rolls,
        narration: narration.output,
        fallback: narration.fallback,
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
          beatId: spec.beatId,
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
      return this.turnView({
        c: locked,
        index,
        seq,
        spec: shown,
        out: narration.output,
        rolls: prepared.rolls,
        roundId,
        sceneChanged: Boolean(nextSpec),
        levelUps,
        ended,
        fallback: narration.fallback,
        combat:
          shown.combat && !ended
            ? combatView(shown.combat, partyNow, nextSpec ? [] : (prepared.combat?.log ?? []))
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

  // ------------------------------------------------------------ assist mode

  /** Saves a prepared turn as a draft for the human DM. The hidden part stays in the loom schema. */
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
          draft: { seq: prepared.turn.seq },
        })
        .returning();
      return req?.id as string;
    });
    return this.draftFor(approvalId, prepared.turn, prepared.loom);
  }

  private draftFor(approvalId: string, turn: PreparedTurn, loom: LoomResult): DmDraft {
    const notes = loom.directives.map((d) => `${d.kind.replaceAll("_", " ")}: ${d.text}`);
    if (loom.crux) {
      notes.unshift(
        `Decisive moment: ${loom.crux.outcome.replaceAll("_", " ")}${loom.crux.socket ? ` (${loom.crux.socket.replaceAll("_", " ")})` : ""}${
          loom.crux.withheldSockets.length
            ? `; held back by earlier shortcuts: ${loom.crux.withheldSockets.join(", ")}`
            : ""
        }`,
      );
    }
    return {
      approvalId,
      campaignId: turn.campaignId,
      seq: turn.seq,
      sceneTitle: (turn.nextSpec ?? turn.spec).title,
      narration: turn.narration.narration,
      npcLines: turn.narration.npcLines.map((l) => l.line),
      rolls: turn.rolls,
      choices: turn.narration.choices.map((c) => c.label),
      actions: turn.actions.map((a) => a.summary),
      dmNotes: notes,
      fallback: turn.fallback,
    };
  }

  private async loadDraft(approvalId: string, dmUserId: string) {
    const db = this.deps.db;
    const [req] = await db.select().from(approvalRequests).where(eq(approvalRequests.id, approvalId));
    if (!req) throw new GameError("no draft", "That draft doesn't exist anymore.");
    if (req.dmUserId !== dmUserId) throw new GameError("not dm", "Only this campaign's DM can do that.");
    if (req.status !== "pending") throw new GameError("decided", "That draft has already been decided.");
    const [turnRow] = await db.select().from(turns).where(eq(turns.id, req.turnId));
    if (turnRow?.status !== "awaiting_approval") throw new GameError("stale", "That draft is out of date.");
    const pending = await loadPendingLoom(db, req.campaignId);
    const turn = turnRow.data as unknown as PreparedTurn;
    if (!pending || pending.seq !== turn.seq) throw new GameError("stale", "That draft is out of date.");
    return { req, turn, pending };
  }

  /** The current draft, for the DM's edit form. */
  async getDmDraft(approvalId: string, dmUserId: string): Promise<DmDraft> {
    const { turn, pending } = await this.loadDraft(approvalId, dmUserId);
    return this.draftFor(approvalId, turn, pending.result);
  }

  /** Which round (and campaign) a draft belongs to. */
  async draftRound(approvalId: string): Promise<{ roundId: string; campaignId: string } | null> {
    const [req] = await this.deps.db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, approvalId));
    if (!req) return null;
    const [turnRow] = await this.deps.db.select().from(turns).where(eq(turns.id, req.turnId));
    return turnRow?.roundId ? { roundId: turnRow.roundId, campaignId: req.campaignId } : null;
  }

  /** The DM approves a draft, optionally with their own narration or choices. */
  async approveDraft(
    approvalId: string,
    dmUserId: string,
    edits: { narration?: string; choices?: string[] } = {},
  ): Promise<TurnView> {
    const { req, turn, pending } = await this.loadDraft(approvalId, dmUserId);
    const final =
      edits.narration !== undefined || edits.choices !== undefined ? this.applyDmEdits(turn, edits) : turn;
    const view = await this.commit(final, pending.result, pending.inputHash);
    await this.afterCommit(final);
    await this.deps.db
      .update(approvalRequests)
      .set({
        status: edits.narration !== undefined || edits.choices !== undefined ? "edited" : "approved",
        dmEdits: edits,
        decidedAt: new Date(),
      })
      .where(eq(approvalRequests.id, req.id));
    await clearPendingLoom(this.deps.db, req.campaignId);
    return view;
  }

  /** Writes the narration again, with the DM's guidance. Dice and the hidden hand stay as they were. */
  async regenerateDraft(approvalId: string, dmUserId: string, guidance: string): Promise<DmDraft> {
    const { req, turn, pending } = await this.loadDraft(approvalId, dmUserId);
    const [c] = await this.deps.db.select().from(campaigns).where(eq(campaigns.id, req.campaignId));
    if (!c) throw new GameError("no campaign", "That campaign doesn't exist.");
    const { index } = this.deps.worlds.get(c.worldId);
    const guided: NarrativeDirective[] = guidance.trim()
      ? [
          ...pending.result.directives,
          {
            kind: "dm_note",
            text: `The DM's note for this turn: ${guidance.trim().slice(0, 500)}`,
            mustNot: [],
          },
        ]
      : pending.result.directives;
    const narration = await narrate({
      llm: this.deps.llm,
      world: index.world,
      view: turn.view as PublicSceneView,
      directives: guided,
      scope: { guildId: c.guildId, campaignId: c.id },
      log: this.log,
      choicesFor: turn.choicesFor,
    });
    const next: PreparedTurn = { ...turn, narration: narration.output, fallback: narration.fallback };
    await this.deps.db
      .update(turns)
      .set({ data: next as unknown as Record<string, unknown> })
      .where(eq(turns.id, req.turnId));
    return this.draftFor(approvalId, next, pending.result);
  }

  private applyDmEdits(turn: PreparedTurn, edits: { narration?: string; choices?: string[] }): PreparedTurn {
    const out = { ...turn, narration: { ...turn.narration } };
    if (edits.narration !== undefined) {
      const text = edits.narration.trim();
      if (text.length < 10) throw new GameError("too short", "The narration needs at least a sentence.");
      out.narration.narration = text.slice(0, NARRATION_LIMITS.narration);
      out.fallback = false;
    }
    if (edits.choices !== undefined && turn.mode !== "finale") {
      const labels = edits.choices
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 4);
      if (labels.length === 0) throw new GameError("no choices", "Give the players at least one choice.");
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
    spec: SceneSpec,
    party: CharacterRow[],
    acted: Array<typeof pendingActions.$inferSelect>,
    choices: StoredChoice[],
  ): Promise<ResolvedAction[]> {
    const byChar = new Map(acted.map((a) => [a.characterId, a]));
    const freeform = acted.filter((a) => a.kind === "freeform");
    let parsed: IntentOutput["actions"] = [];
    if (freeform.length > 0) {
      const res = await this.deps.llm.structured(
        {
          task: "intent",
          system: intentSystem(index.world),
          user: intentUser(
            this.sceneSpecView(index, spec),
            party.map((p) => ({ ref: p.id, name: p.name })),
            freeform.map((a) => ({ characterRef: a.characterId, text: String(a.payload.text ?? "") })),
          ),
          schema: IntentOutput,
          schemaName: "actions",
          maxOutputTokens: 4000,
          effort: "low",
        },
        { guildId: c.guildId, campaignId: c.id },
      );
      if (res.ok) parsed = res.value.actions;
      else this.log.warn("intent parse unavailable", { stop: res.stop });
    }

    const entityAnchor = (ref: string | null) => {
      if (!ref) return null;
      return spec.entities.find((e) => e.ref.id === ref)?.ref ?? null;
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
      if (!pa) return { ...base, summary: `tries this: "${text.slice(0, 200)}"`, passed: false };
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
    spec: SceneSpec,
    story: StoryState,
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

    if (spec.isCrux && closing && spec.beatId) {
      const cruxSpec = index.beats.get(spec.beatId)?.beat.crux;
      if (cruxSpec) {
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
          const dc = cruxDc(cruxSpec, story.clocks, snarePressure(loomState));
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

  private async applyNarratorDeltas(
    tx: Tx,
    index: WorldIndex,
    c: CampaignRow,
    story: StoryState,
    party: CharacterRow[],
    proposed: DeltaProposal[],
    ruledHp: Map<string, number>,
    seq: number,
    spec: SceneSpec,
  ): Promise<{ entitiesChanged: boolean }> {
    let entitiesChanged = false;
    if (proposed.length === 0) return { entitiesChanged };
    const invRows = party.length
      ? await tx
          .select()
          .from(inventoryItems)
          .where(
            sql`${inventoryItems.characterId} in (${sql.join(
              party.map((p) => sql`${p.id}`),
              sql`, `,
            )})`,
          )
      : [];
    const [questRows, promiseRows, canonRows, npcRows] = await Promise.all([
      tx.select().from(quests).where(eq(quests.campaignId, c.id)),
      tx.select().from(promises).where(eq(promises.campaignId, c.id)),
      tx.select().from(canonEntities).where(eq(canonEntities.campaignId, c.id)),
      tx.select().from(npcs).where(eq(npcs.campaignId, c.id)),
    ]);
    const loot = new Set<string>();
    const region = index.regions.get(spec.regionId);
    const table = region?.lootTable
      ? index.world.items.lootTables.find((t) => t.id === region.lootTable)
      : undefined;
    for (const e of table?.entries ?? []) loot.add(e.item);
    const loomRec = await loadLoom(tx, c.id);
    const protectedNpcs = new Set(loomRec.state.bearers.filter((b) => b.mustSurvive).map((b) => b.npcId));
    const ctx: DeltaContext = {
      index,
      partyRegionId: story.regionId,
      characters: new Map(
        party.map((p) => [
          p.id,
          {
            level: p.level,
            hp: p.hp,
            hpMax: p.hpMax,
            gold: p.gold,
            inventory: new Map(invRows.filter((i) => i.characterId === p.id).map((i) => [i.itemId, i.qty])),
          },
        ]),
      ),
      ruledHpChanges: ruledHp,
      allowedLoot: loot,
      milestoneBeats: new Set(),
      sceneHasHazard: false,
      npcs: new Map([
        ...spec.entities.map((e) => [e.ref.id, { protected: protectedNpcs.has(e.ref.id) }] as const),
        ...npcRows.map((n) => [n.id, { protected: protectedNpcs.has(n.id) }] as const),
      ]),
      quests: new Set([
        ...questRows.map((q) => q.questId),
        ...index.beatOrder.flatMap((b) => (b.beat.quest ? [b.beat.quest.id] : [])),
      ]),
      promises: new Set(promiseRows.map((p) => p.id)),
      knownEntityNames: new Set([
        ...canonRows.map((r) => r.name.toLowerCase()),
        ...index.world.npcs.named.map((n) => n.name.toLowerCase()),
        ...party.map((p) => p.name.toLowerCase()),
      ]),
      bannedTerms: bannedTermsFor(index.world, (await campaignStory(tx, c)).story.intensity),
    };
    const { accepted } = validateDeltas(proposed, ctx);
    for (const d of accepted) {
      switch (d.kind) {
        case "item_grant":
          await tx
            .insert(inventoryItems)
            .values({ characterId: d.characterId, itemId: d.itemId, qty: d.qty })
            .onConflictDoUpdate({
              target: [inventoryItems.characterId, inventoryItems.itemId],
              set: { qty: sql`${inventoryItems.qty} + ${d.qty}` },
            });
          break;
        case "item_remove":
          await tx
            .update(inventoryItems)
            .set({ qty: sql`${inventoryItems.qty} - ${d.qty}` })
            .where(and(eq(inventoryItems.characterId, d.characterId), eq(inventoryItems.itemId, d.itemId)));
          await tx
            .delete(inventoryItems)
            .where(and(eq(inventoryItems.characterId, d.characterId), sql`${inventoryItems.qty} <= 0`));
          break;
        case "gold":
          await tx
            .update(characters)
            .set({ gold: sql`${characters.gold} + ${d.amount}` })
            .where(eq(characters.id, d.characterId));
          break;
        case "condition": {
          const p = party.find((x) => x.id === d.characterId);
          if (!p) break;
          const next =
            d.action === "add"
              ? [...new Set([...p.conditions, d.condition])]
              : p.conditions.filter((x) => x !== d.condition);
          await tx.update(characters).set({ conditions: next }).where(eq(characters.id, p.id));
          break;
        }
        case "hp_change": {
          const p = party.find((x) => x.id === d.characterId);
          if (p)
            await tx
              .update(characters)
              .set({ hp: Math.max(0, Math.min(p.hpMax, p.hp + d.amount)) })
              .where(eq(characters.id, p.id));
          break;
        }
        case "npc_status":
        case "npc_disposition": {
          const named = index.namedNpcs.get(d.npcId);
          const entity = spec.entities.find((e) => e.ref.id === d.npcId);
          const name = named?.name ?? entity?.ref.name ?? d.npcId;
          await tx
            .insert(npcs)
            .values({
              campaignId: c.id,
              id: d.npcId,
              name,
              status: d.kind === "npc_status" ? d.status : "active",
              disposition: d.kind === "npc_disposition" ? d.delta : 0,
              factionId: named?.faction ?? null,
              tags: named?.tags ?? [],
              firstMetTurn: seq,
            })
            .onConflictDoUpdate({
              target: [npcs.campaignId, npcs.id],
              set:
                d.kind === "npc_status"
                  ? { status: d.status }
                  : { disposition: sql`${npcs.disposition} + ${d.delta}` },
            });
          if (entity && d.kind === "npc_status") {
            entity.status = d.status === "defeated" ? "fled" : d.status === "active" ? "neutral" : d.status;
            entitiesChanged = true;
          }
          break;
        }
        case "reveal_region":
          await tx
            .insert(campaignRegions)
            .values({ campaignId: c.id, regionId: d.regionId, state: "discovered" })
            .onConflictDoNothing();
          story.discoveredRegions = [...new Set([...story.discoveredRegions, d.regionId])];
          break;
        case "quest_update":
          await tx
            .update(quests)
            .set({ status: d.status })
            .where(and(eq(quests.campaignId, c.id), eq(quests.questId, d.questId)));
          break;
        case "promise_made":
          await tx.insert(promises).values({ campaignId: c.id, npcId: d.npcId, text: d.text, madeTurn: seq });
          break;
        case "promise_resolved":
          await tx
            .update(promises)
            .set({ status: d.kept ? "kept" : "broken" })
            .where(eq(promises.id, d.promiseId));
          break;
        case "introduce_entity":
          await tx
            .insert(canonEntities)
            .values({
              campaignId: c.id,
              kind: d.entityKind,
              name: d.name,
              description: d.description,
              tags: d.tags,
              introducedTurn: seq,
            })
            .onConflictDoNothing();
          break;
        case "move_party":
        case "xp_milestone":
        case "flag":
          break;
      }
    }
    return { entitiesChanged };
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
      const spec = point.scene.state as unknown as SceneSpec;
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
        seq,
        spec,
        out: said ?? quietNarration(`The story returns to ${spec.title}.`),
        rolls: [],
        roundId,
        sceneChanged: true,
        levelUps: [],
        ended: false,
        fallback: false,
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
    const spec = row?.state as unknown as SceneSpec | undefined;
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
      beatId: old.kind === "combat" ? old.beatId : null,
      entities: old.entities.filter((e) => !oldFoes.has(e.ref.id)),
    };
    delete bare.combat;
    const built = withEncounter(
      index,
      bare,
      party,
      heroesFor(index, party, await this.inventoryFor(party)),
      this.dice(loom.masterSeed, c.turnSeq + 1, "rebuild"),
      { intensity: told.story.intensity, avoid: told.story.lines, combat: campaignSettings(c).combatRules },
    );
    if (!built.combat)
      throw new GameError("no foes", "I couldn't find foes that fit here. Try a rewind instead.");
    // A stun or a web from the old foes still wears off on time.
    const combat = { ...built.combat, heroConditionRounds: old.combat?.heroConditionRounds ?? {} };
    const spec: SceneSpec = { ...built, combat, kind: old.kind, beatId: old.beatId };
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
        fallback: false,
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
        beatId: spec.beatId,
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

  sceneSpecView(index: WorldIndex, spec: SceneSpec): SceneSpecView {
    const region = index.regions.get(spec.regionId);
    const poi = spec.poiId ? index.pois.get(spec.poiId)?.poi : undefined;
    return {
      title: spec.title,
      kind: spec.kind,
      locationName: poi?.name ?? region?.name ?? spec.regionId,
      regionName: region?.name ?? spec.regionId,
      summary: spec.summary,
      goals: spec.goals,
      entities: spec.entities
        .filter((e) => e.present)
        .map((e) => ({
          ref: e.ref.id,
          name: e.ref.name ?? e.ref.id,
          kind: e.kind,
          status: e.status,
          ...(e.note ? { note: e.note } : {}),
        })),
      opportunities: spec.opportunities,
      ...(spec.directorNote ? { directorNote: spec.directorNote } : {}),
    };
  }

  private publicView(args: {
    index: WorldIndex;
    mode: NarrationMode;
    story: NarrationStory;
    spec: SceneSpec;
    nextSpec: SceneSpec | null;
    party: CharacterRow[];
    actions: ResolvedAction[];
    rolls: RollView[];
    crux: { label: string; success: boolean } | null;
    epilogue: string[];
    recent: string[];
    quests: Array<typeof quests.$inferSelect>;
    canon: Array<typeof canonEntities.$inferSelect>;
    steerAway?: boolean;
    summaries?: string[];
    battle?: PublicSceneData["battle"];
  }) {
    const { index } = args;
    const data: PublicSceneData = {
      mode: args.mode,
      story: args.story,
      scene: this.sceneSpecView(index, args.spec),
      nextScene: args.nextSpec ? this.sceneSpecView(index, args.nextSpec) : null,
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
        level: p.level,
        hp: p.hp,
        hpMax: p.hpMax,
        conditions: p.conditions,
      })),
      chapterSummaries: args.summaries ?? [],
      recentTurns: args.recent,
      canon: args.canon.map((c) => ({ name: c.name, kind: c.kind, description: c.description })),
      quests: args.quests.map((q) => ({ title: q.title, objective: q.objective, status: q.status })),
      actions: args.actions.map((a) => ({
        characterRef: a.characterId,
        characterName: a.name,
        summary: a.summary,
      })),
      rolls: args.rolls.map((r) => ({
        characterName: r.characterName,
        label: r.label,
        total: r.total,
        difficulty: r.difficulty,
        success: r.success,
        natural: r.natural,
        ...(r.damage ? { damage: r.damage } : {}),
      })),
      crux: args.crux,
      allowedLoot: (() => {
        const region = index.regions.get(args.spec.regionId);
        const table = region?.lootTable
          ? index.world.items.lootTables.find((t) => t.id === region.lootTable)
          : undefined;
        return (table?.entries ?? []).map((e) => ({
          id: e.item,
          name: index.items.get(e.item)?.name ?? e.item,
        }));
      })(),
      epilogue: args.epilogue,
      steerAway: args.steerAway ?? false,
      ...(args.battle ? { battle: args.battle } : {}),
    };
    return publicSceneView(data);
  }

  private turnView(args: {
    c: CampaignRow;
    index: WorldIndex;
    seq: number;
    spec: SceneSpec;
    out: NarratorOutput;
    rolls: RollView[];
    roundId: string | null;
    sceneChanged: boolean;
    levelUps: TurnView["levelUps"];
    ended: boolean;
    fallback: boolean;
    combat?: CombatView | null;
    /** Overrides the narrator's choices (battle rounds have none; the mercy moment has its own). */
    choices?: Array<{ label: string }>;
  }): TurnView {
    const v = this.sceneSpecView(args.index, args.spec);
    const nameOf = (ref: string) =>
      args.spec.entities.find((e) => e.ref.id === ref)?.ref.name ??
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
      fallback: args.fallback,
      combat: args.combat ?? null,
    };
  }
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
    proposedDeltas: [],
    choices: [],
    goalMet: false,
    imageBrief: null,
    significance: "minor",
  };
}
