import type { CallScope, LlmGateway, StructuredCall, StructuredOutcome } from "@dq/core/llm";
import type { IntentOutput, JudgeOutput, NarratorOutput, SafetyOutput } from "@dq/core/narration";

type Handler = (call: StructuredCall<unknown>, scope: CallScope) => unknown | Promise<unknown>;

/**
 * A scripted stand-in for a real AI, for tests, the simulator and offline
 * demos. It reads the prompt format the engine writes and answers plausibly.
 */
export class FakeLlm implements LlmGateway {
  readonly calls: Array<{ task: string; user: string }> = [];

  constructor(private readonly overrides: Partial<Record<string, Handler>> = {}) {}

  async structured<T>(call: StructuredCall<T>, scope: CallScope): Promise<StructuredOutcome<T>> {
    const user = call.user.map((b) => b.text).join("\n");
    this.calls.push({ task: call.task, user });
    const handler = this.overrides[call.task] ?? DEFAULTS[call.task];
    if (!handler) return { ok: false, stop: "unconfigured" };
    const value = await handler(call as StructuredCall<unknown>, scope);
    if (value instanceof Error) return { ok: false, stop: "error", error: value.message };
    const parsed = call.schema.safeParse(value);
    if (!parsed.success) return { ok: false, stop: "invalid", error: parsed.error.message };
    return {
      ok: true,
      value: parsed.data,
      usage: { inputTokens: user.length / 4, outputTokens: 200 },
      model: "fake",
      fellBack: false,
    };
  }
}

/** Always unavailable: for what happens when no AI answers (turns go to a person in the DM room). */
export class UnconfiguredLlm implements LlmGateway {
  async structured<T>(): Promise<StructuredOutcome<T>> {
    return { ok: false, stop: "unconfigured" };
  }
}

function lastSection(user: string, heading: string): string {
  const i = user.lastIndexOf(heading);
  if (i < 0) return "";
  const rest = user.slice(i + heading.length);
  const end = rest.search(/\n## /);
  return end >= 0 ? rest.slice(0, end) : rest;
}

const DEFAULTS: Record<string, Handler> = {
  director: (call) => {
    const user = call.user.map((b) => b.text).join("\n");
    const beats = [...user.matchAll(/- beat: ([a-z0-9-]+) \| ([^(]+)/g)].map((m) => ({
      beatId: m[1] as string,
      note: `Let the heroes' earlier kindness show in ${m[2]?.trim()}.`,
      callback: null,
      featured: user.includes("[id: hattie-wick]") ? ["hattie-wick"] : [],
    }));
    return { theme: "Friends found along the way.", beats };
  },
  summarizer: (call) => {
    const user = call.user.map((b) => b.text).join("\n");
    const first = user.split("\n- ")[1]?.split(/[.!?]/)[0] ?? "The heroes pressed on";
    return {
      recap: `${first.trim()}. The heroes kept going, together, and the road ahead grew a little brighter.`,
    };
  },
  narrator: (call): NarratorOutput => {
    const user = call.user.map((b) => b.text).join("\n");
    const finale = user.includes("This is the end of the adventure");
    const target = user.includes("## Next scene:")
      ? lastSection(user, "## Next scene:")
      : lastSection(user, "## Current scene:");
    const choices: NarratorOutput["choices"] = [];
    for (const m of target.matchAll(/- deed "([a-z_]+)"(?: toward ([a-z0-9-]+))?: ([^\n]+)/g)) {
      choices.push({
        label: (m[3] ?? "Do the kind thing").split(/[,.]/)[0]?.slice(0, 70) ?? "Do the kind thing",
        intent: {
          approach: m[3] ?? "",
          skill: "none",
          difficulty: "medium",
          deed: m[1] ?? "none",
          targetRef: m[2] ?? null,
          shortcutId: null,
        },
      });
    }
    for (const m of target.matchAll(/- shortcut "([a-z0-9-]+)": ([^:\n]+)/g)) {
      choices.push({
        label: `Take the offer: ${m[2] ?? "a shortcut"}`.slice(0, 70),
        intent: {
          approach: "take the shortcut",
          skill: "none",
          difficulty: "easy",
          deed: "fox_bargain",
          targetRef: null,
          shortcutId: m[1] ?? null,
        },
      });
    }
    choices.push({
      label: "Look around carefully",
      intent: {
        approach: "look around",
        skill: "perception",
        difficulty: "medium",
        deed: "none",
        targetRef: null,
        shortcutId: null,
      },
    });
    if (choices.length < 2) {
      choices.push({
        label: "Press on",
        intent: {
          approach: "press on",
          skill: "none",
          difficulty: "easy",
          deed: "none",
          targetRef: null,
          shortcutId: null,
        },
      });
    }
    const notes = lastSection(user, "## Story notes for this turn");
    const title = (target.split("\n")[0] ?? "").trim();
    return {
      narration:
        `Old Wick turns the page. ${title ? `${title}. ` : ""}The heroes press on through the story, lanterns swinging. ${notes ? "Something unexpected happens along the way." : ""}`.trim(),
      npcLines: [],
      proposedDeltas: [],
      choices: finale ? [] : choices.slice(0, 4),
      sceneOver: true,
      arrivedAt: null,
      imageBrief: {
        setting: title || "a winding road",
        subjects: ["three young heroes"],
        mood: "hopeful",
        timeOfDay: "dusk",
      },
      significance: "notable",
    };
  },
  intent: (call): IntentOutput => {
    const user = call.user.map((b) => b.text).join("\n");
    const actions: IntentOutput["actions"] = [];
    for (const m of user.matchAll(/- ([0-9a-f-]{36}): """([^"]*)"""/g)) {
      const text = m[2] ?? "";
      const mercy = /\b(spare|let (him|her|them) go|forgive)\b/i.test(text);
      actions.push({
        characterRef: m[1] ?? "",
        summary: text.slice(0, 120) || "looks around",
        approach: text,
        needsRoll: /\b(climb|sneak|search|jump)\b/i.test(text),
        ability: "none",
        skill: /\bsneak\b/i.test(text) ? "stealth" : /\bsearch\b/i.test(text) ? "investigation" : "athletics",
        difficulty: "medium",
        targetRef: null,
        helpsCharacterRef: null,
        deeds: mercy
          ? [{ tag: "mercy", targetRef: "snibbet", evidence: text, forgoneBenefit: 2, riskTaken: false }]
          : [],
        keepsPromiseTo: null,
        makesPromiseTo: null,
        isMetaQuestion: false,
      });
    }
    return { actions };
  },
  safety: (): SafetyOutput => ({ allow: true, categories: [], isMetaProbe: false, isPromptInjection: false }),
  judge: (): JudgeOutput => ({
    revealsHiddenMechanic: false,
    explainsCauseOfLuck: false,
    crossesLimits: false,
    note: "",
  }),
};
