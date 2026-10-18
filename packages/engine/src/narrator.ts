import type { LlmGateway, StructuredOutcome } from "@dq/core/llm";
import type { NarrativeDirective } from "@dq/core/loom";
import {
  type IntentHint,
  JudgeOutput,
  judgeSystem,
  judgeUser,
  NARRATION_LIMITS,
  NarratorOutput,
  narratorSystem,
  narratorUser,
  type PublicSceneView,
  type SceneSpecView,
} from "@dq/core/narration";
import { checkNarration } from "@dq/core/safety";
import type { World } from "@dq/core/world";
import type { Logger } from "./deps";

/**
 * The storyteller's passage, or why it couldn't write one. Nothing stands in for it: a turn it can't finish goes
 * to a person in the DM room, with these reasons.
 */
export type NarrationResult = { ok: true; output: NarratorOutput } | { ok: false; reasons: string[] };

const PROSE_DIRECTIVES = new Set<NarrativeDirective["kind"]>([
  "convergence",
  "fail_forward",
  "minor_grace",
  "detour_setup",
  "detour_payoff",
  "snare_springs",
]);

/**
 * Asks the configured AI to narrate, checks the result (and has the reviewer read it when the story calls for
 * it), and retries once with feedback. If the AI can't be reached or keeps getting it wrong, it says why.
 */
export async function narrate(opts: {
  llm: LlmGateway;
  world: World;
  view: PublicSceneView;
  directives: readonly NarrativeDirective[];
  scope: { guildId: string; campaignId: string };
  log: Logger;
  choicesFor: SceneSpecView;
}): Promise<NarrationResult> {
  const { llm, world, view, directives, scope, log } = opts;
  const system = narratorSystem(world, view.story);
  const user = narratorUser(view, directives);
  // The reviewer reads turns where the hidden hand acts, the finale (the one place it may be revealed, as far as
  // the epilogue goes), and every turn of a story told at Epic.
  const review =
    view.story.intensity === "epic" ||
    view.mode === "finale" ||
    directives.some((d) => PROSE_DIRECTIVES.has(d.kind));

  let problems: string[] = [];
  let reasons: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const feedback =
      attempt === 0 || problems.length === 0
        ? []
        : [
            {
              text: `Your previous draft had these problems. Write it again without them:\n${problems.map((p) => `- ${p}`).join("\n")}`,
            },
          ];
    const res: StructuredOutcome<NarratorOutput> = await llm.structured(
      {
        task: "narrator",
        system,
        user: [...user, ...feedback],
        schema: NarratorOutput,
        schemaName: "narration",
        expectTokens: 2000,
        effort: attempt === 0 ? "medium" : "low",
      },
      scope,
    );
    if (!res.ok) {
      log.warn("narrator unavailable", { ...scope, attempt: attempt + 1, stop: res.stop, error: res.error });
      reasons = [STOPPED[res.stop] ?? `The storyteller stopped (${res.stop}).`];
      if (res.error) reasons.push(`What the service said: ${res.error.slice(0, 300)}`);
      problems = [`narrator ${res.stop}`];
      if (res.stop === "unconfigured" || res.stop === "budget" || res.stop === "error") break;
      continue;
    }
    const cleaned = tidy(
      res.value,
      opts.choicesFor,
      view.mode,
      (view.later ?? []).map((l) => l.ref),
    );
    problems = checkOutput(cleaned, world, view);
    if (problems.length === 0 && review) {
      const judged = await llm.structured(
        {
          task: "judge",
          system: judgeSystem(world, view.story),
          user: judgeUser(cleaned, directives, { epilogue: view.mode === "finale" ? view.epilogue : [] }),
          schema: JudgeOutput,
          schemaName: "review",
          expectTokens: 300,
          effort: "low",
        },
        scope,
      );
      if (!judged.ok) {
        // A passage that needs reading before the table sees it never goes out unread.
        log.warn("reviewer unavailable", {
          ...scope,
          attempt: attempt + 1,
          stop: judged.stop,
          error: judged.error,
        });
        reasons = [
          `The reviewer that reads each passage before the table sees it didn't answer (${judged.stop}).`,
          ...(judged.error ? [`What the service said: ${judged.error.slice(0, 300)}`] : []),
        ];
        continue;
      }
      // The reviewer quotes what it flagged, so the rewrite changes what's said and the DM sees what was turned back.
      const note = judged.value.note.trim();
      const flagged = (what: string) =>
        note ? `${what}: ${/[.!?"'”]$/.test(note) ? note : `${note}.`}` : `${what}.`;
      if (judged.value.revealsHiddenMechanic)
        problems.push(`${flagged("It shows the players a game mechanic")} Tell the story without it.`);
      if (judged.value.explainsCauseOfLuck)
        problems.push(
          `${flagged("It tells the heroes what is kept for the epilogue: that they are guided, or that this turn repays an earlier deed")} Show it happening; don't show why.`,
        );
      if (judged.value.crossesLimits) problems.push(flagged("It goes beyond what this story allows"));
    }
    if (problems.length === 0) return { ok: true, output: cleaned };
    log.warn("narration rejected", { ...scope, attempt: attempt + 1, problems });
    reasons = problems.map((p) => `The storyteller's draft was turned back: ${p}`);
  }
  log.warn("narration handed to a person", { ...scope, reasons });
  return { ok: false, reasons };
}

/** Why the storyteller didn't answer, for the person taking over. */
const STOPPED: Record<string, string> = {
  unconfigured: "No storyteller service is set for this server (the setup page's “Who does what”).",
  budget: "Today's spending limit for AI services has been reached.",
  error: "The storyteller service returned an error.",
  invalid: "The storyteller's answer wasn't in the shape the game needs.",
  refusal: "The storyteller declined to write this turn.",
  max_tokens: "The storyteller ran out of room before finishing.",
};

function clip(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
}

/**
 * Enforces the limits the schema can't express, and keeps choice intents honest. An arrival counts only at a
 * later scene the storyteller was offered, and only mid-scene; it ends the scene.
 */
export function tidy(
  out: NarratorOutput,
  scene: SceneSpecView,
  mode: PublicSceneView["mode"],
  arrivals: readonly string[] = [],
): NarratorOutput {
  const arrivedAt =
    mode === "continue" && out.arrivedAt && arrivals.includes(out.arrivedAt) ? out.arrivedAt : null;
  const refs = new Set(scene.entities.map((e) => e.ref));
  const shortcuts = new Set(scene.opportunities.filter((o) => o.kind === "shortcut").map((o) => o.key));
  const virtueTags = new Set(scene.opportunities.filter((o) => o.kind === "virtue").map((o) => o.key));
  const choices =
    mode === "finale"
      ? []
      : out.choices.slice(0, NARRATION_LIMITS.maxChoices).map((c) => {
          const intent: IntentHint = {
            ...c.intent,
            targetRef: c.intent.targetRef && refs.has(c.intent.targetRef) ? c.intent.targetRef : null,
            shortcutId:
              c.intent.shortcutId && shortcuts.has(c.intent.shortcutId) ? c.intent.shortcutId : null,
          };
          // Virtue deeds only where the scene offers them; shortcut deeds only for real shortcuts.
          const isShortcutDeed = [
            "cheat",
            "deceive",
            "break_promise",
            "fox_bargain",
            "trade_keepsake",
            "abandon_ally",
            "steal",
          ].includes(intent.deed);
          if (intent.deed !== "none" && !isShortcutDeed && !virtueTags.has(intent.deed)) intent.deed = "none";
          if (isShortcutDeed && !intent.shortcutId) intent.deed = "none";
          return { label: clip(c.label, NARRATION_LIMITS.choiceLabel), intent };
        });
  return {
    ...out,
    sceneOver: out.sceneOver || arrivedAt !== null,
    arrivedAt,
    narration: clip(out.narration, NARRATION_LIMITS.narration),
    npcLines: out.npcLines
      .slice(0, NARRATION_LIMITS.maxNpcLines)
      .map((l) => ({ ...l, line: clip(l.line, NARRATION_LIMITS.npcLine) })),
    choices,
  };
}

/** The sentence a match sits in, so the person reading (or the rewrite) sees what was said, not just the words. */
function sentenceAround(text: string, match: string): string {
  const at = text.toLowerCase().indexOf(match.toLowerCase());
  if (at < 0) return clip(match, 200);
  const before = text.slice(0, at).search(/[^.!?\n]*$/);
  const after = text.slice(at + match.length).search(/[.!?\n]|$/);
  const end = at + match.length + after + (/[.!?]/.test(text.charAt(at + match.length + after)) ? 1 : 0);
  return clip(text.slice(before, end), 200);
}

function checkOutput(out: NarratorOutput, world: World, view: PublicSceneView): string[] {
  const problems: string[] = [];
  const text = [out.narration, ...out.npcLines.map((l) => l.line), ...out.choices.map((c) => c.label)].join(
    "\n",
  );
  const verdict = checkNarration(text, world, { intensity: view.story.intensity });
  for (const f of verdict.findings) {
    if (f.category === "banned_word")
      problems.push(`It uses the word "${f.match}", which isn't allowed here.`);
    if (f.category === "hidden_leak")
      problems.push(
        `It names a game mechanic: "${sentenceAround(text, f.match)}" Tell the story without it.`,
      );
    if (f.category === "personal_info")
      problems.push("It includes something that looks like real personal information.");
  }
  if (out.narration.trim().length < 40) problems.push("The narration is too short.");
  if (view.mode !== "finale" && out.choices.length < NARRATION_LIMITS.minChoices)
    problems.push("Offer at least two choices.");
  return problems;
}
