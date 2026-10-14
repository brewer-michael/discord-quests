import type { LlmGateway, StructuredOutcome } from "@dq/core/llm";
import type { NarrativeDirective } from "@dq/core/loom";
import {
  type IntentHint,
  JudgeOutput,
  judgeSystem,
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

export interface NarrationResult {
  output: NarratorOutput;
  fallback: boolean;
  problems: string[];
}

const PROSE_DIRECTIVES = new Set<NarrativeDirective["kind"]>([
  "convergence",
  "fail_forward",
  "minor_grace",
  "detour_setup",
  "detour_payoff",
  "snare_springs",
]);

/**
 * Asks the configured AI to narrate, checks the result, retries once with
 * feedback, and falls back to a plain engine-written turn if the AI is
 * unavailable or keeps getting it wrong. The table never stalls.
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
  const system = narratorSystem(world, view.contentLevel);
  const user = narratorUser(view, directives);
  const loomTouched = directives.some((d) => PROSE_DIRECTIVES.has(d.kind));

  let problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const feedback =
      attempt === 0
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
        maxOutputTokens: 16000,
        effort: attempt === 0 ? undefined : "low",
      },
      scope,
    );
    if (!res.ok) {
      log.warn("narrator unavailable", { stop: res.stop, error: res.error });
      problems = [`narrator ${res.stop}`];
      if (res.stop === "unconfigured" || res.stop === "budget" || res.stop === "error") break;
      continue;
    }
    const cleaned = tidy(res.value, opts.choicesFor, view.mode);
    problems = checkOutput(cleaned, world, view);
    if (problems.length === 0 && loomTouched) {
      const judged = await llm.structured(
        {
          task: "judge",
          system: judgeSystem(),
          user: [{ text: cleaned.narration }],
          schema: JudgeOutput,
          schemaName: "review",
          maxOutputTokens: 2000,
          effort: "low",
        },
        scope,
      );
      if (judged.ok) {
        if (judged.value.revealsHiddenMechanic) problems.push("It mentions a hidden mechanic. Don't.");
        if (judged.value.explainsCauseOfLuck)
          problems.push(
            "It explains that the good outcome was caused by an earlier kindness. Show what happens; don't explain why.",
          );
        if (judged.value.unsafeForChildren)
          problems.push(`Not suitable for young children: ${judged.value.note}`);
      }
    }
    if (problems.length === 0) return { output: cleaned, fallback: false, problems: [] };
    log.warn("narration rejected", { problems });
  }
  return { output: fallbackNarration(view, directives, opts.choicesFor), fallback: true, problems };
}

function clip(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
}

/** Enforces the limits the schema can't express, and keeps choice intents honest. */
export function tidy(
  out: NarratorOutput,
  scene: SceneSpecView,
  mode: PublicSceneView["mode"],
): NarratorOutput {
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
    narration: clip(out.narration, NARRATION_LIMITS.narration),
    npcLines: out.npcLines
      .slice(0, NARRATION_LIMITS.maxNpcLines)
      .map((l) => ({ ...l, line: clip(l.line, NARRATION_LIMITS.npcLine) })),
    choices,
  };
}

function checkOutput(out: NarratorOutput, world: World, view: PublicSceneView): string[] {
  const problems: string[] = [];
  const text = [out.narration, ...out.npcLines.map((l) => l.line), ...out.choices.map((c) => c.label)].join(
    "\n",
  );
  const verdict = checkNarration(text, world, { contentLevel: view.contentLevel });
  for (const f of verdict.findings) {
    if (f.category === "banned_word")
      problems.push(`It uses the word "${f.match}", which isn't allowed here.`);
    if (f.category === "hidden_leak")
      problems.push(`It hints at hidden mechanics or explains luck ("${f.match}"). Don't.`);
    if (f.category === "personal_info")
      problems.push("It includes something that looks like real personal information.");
  }
  if (out.narration.trim().length < 40) problems.push("The narration is too short.");
  if (view.mode !== "finale" && out.choices.length < NARRATION_LIMITS.minChoices)
    problems.push("Offer at least two choices.");
  return problems;
}

/** A plain, safe turn the engine can always tell on its own. */
export function fallbackNarration(
  view: PublicSceneView,
  directives: readonly NarrativeDirective[],
  choicesFor: SceneSpecView,
): NarratorOutput {
  const parts: string[] = [];
  if (view.mode === "opening") parts.push(`${view.scene.title}. ${view.scene.summary}`);
  if (view.battle) {
    parts.push(...view.battle.log);
    if (view.battle.outcome === "party_down")
      parts.push(
        "The heroes are overwhelmed and everything goes dizzy. When they wake, they are safe, and the story goes on.",
      );
    else if (view.battle.atMercy.length > 0)
      parts.push(
        `${view.battle.atMercy.join(", ")} ${view.battle.atMercy.length === 1 ? "waits" : "wait"} to see what the heroes will do.`,
      );
  } else for (const a of view.actions) parts.push(`${a.characterName} ${a.summary.replace(/\.$/, "")}.`);
  for (const r of view.battle ? [] : view.rolls)
    parts.push(
      r.success
        ? `${r.characterName}'s ${r.label.toLowerCase()} works!`
        : `${r.characterName}'s ${r.label.toLowerCase()} doesn't go to plan.`,
    );
  for (const d of directives) if (PROSE_DIRECTIVES.has(d.kind)) parts.push(d.text);
  if (view.nextScene && view.mode === "close_and_open")
    parts.push(`${view.nextScene.title}. ${view.nextScene.summary}`);
  for (const line of view.epilogue) parts.push(line);
  const narration = clip(parts.join(" "), NARRATION_LIMITS.narration);

  const choices: NarratorOutput["choices"] = [];
  if (view.mode !== "finale") {
    for (const o of choicesFor.opportunities.slice(0, 2)) {
      choices.push({
        label: clip(o.text.split(":")[0] ?? o.text, NARRATION_LIMITS.choiceLabel),
        intent: {
          approach: o.text,
          skill: "none",
          difficulty: "medium",
          deed: o.kind === "virtue" ? o.key : "none",
          targetRef: o.targetRef ?? null,
          shortcutId: o.kind === "shortcut" ? o.key : null,
        },
      });
    }
    const npc = choicesFor.entities.find((e) => e.kind === "npc");
    if (npc) {
      choices.push({
        label: clip(`Talk with ${npc.name}`, NARRATION_LIMITS.choiceLabel),
        intent: {
          approach: `talk with ${npc.name}`,
          skill: "persuasion",
          difficulty: "easy",
          deed: "none",
          targetRef: npc.ref,
          shortcutId: null,
        },
      });
    }
    choices.push({
      label: "Look around carefully",
      intent: {
        approach: "look around carefully",
        skill: "perception",
        difficulty: "medium",
        deed: "none",
        targetRef: null,
        shortcutId: null,
      },
    });
    if (choices.length < 3) {
      choices.push({
        label: "Press on together",
        intent: {
          approach: "press on together",
          skill: "none",
          difficulty: "easy",
          deed: "none",
          targetRef: null,
          shortcutId: null,
        },
      });
    }
  }
  return {
    narration,
    npcLines: [],
    proposedDeltas: [],
    choices: choices.slice(0, NARRATION_LIMITS.maxChoices),
    goalMet: view.mode !== "continue",
    imageBrief: null,
    significance: "minor",
  };
}
