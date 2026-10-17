import type { CallScope, LlmGateway, StructuredCall, StructuredOutcome } from "@dq/core/llm";
import type { IntentOutput, JudgeOutput, NarratorOutput, SafetyOutput, SceneDraft } from "@dq/core/narration";

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
    const handler = this.overrides[call.task] ?? FAKE_ANSWERS[call.task];
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

/** Lines of one section of a prompt: from its heading to the next heading. */
function section(user: string, heading: string): string[] {
  return lastSection(user, heading).split("\n");
}

const ids = (text: string, kind: string) =>
  [...text.matchAll(new RegExp(`\\[${kind}: ([a-z0-9-]+)\\]`, "g"))].map((m) => m[1] as string);

/** A plausible scene for the stand-in director: where the heroes are, the first person and clue on offer. */
function draftScene(
  user: string,
  opts: { regionId: string; present: string[]; clues: string[]; foes?: string[]; momentId?: string | null },
): SceneDraft {
  const foes = opts.foes ?? [];
  return {
    title: opts.momentId ? "The Decisive Hour" : foes.length > 0 ? "Ambush on the Path" : "A Quiet Lane",
    kind: opts.momentId ? "crux" : foes.length > 0 ? "combat" : "social",
    regionId: opts.regionId,
    poiId: null,
    situation: "Lanterns sway in the evening wind as the heroes arrive, and someone is waiting for them.",
    question: "Will the heroes earn the help they need here?",
    present: opts.present,
    newPeople: [],
    clues: opts.clues,
    shortcuts: ids(user, "shortcut").slice(0, 1),
    foes: foes.map((creature) => ({ creature, count: 2 })),
    chances: opts.present[0]
      ? [{ deed: "kindness_to_lowly", toward: opts.present[0], what: "They look cold and tired." }]
      : [],
    dangerous: false,
    momentId: opts.momentId ?? null,
    situationId: null,
    note: "The people here remember what the heroes did last time.",
  };
}

/** What the stand-in AI answers for each job, for tests that change one answer and keep the rest. */
export const FAKE_ANSWERS: Record<string, Handler> = {
  director: (call) => {
    const user = call.user.map((b) => b.text).join("\n");
    if (call.schemaName === "story_seed") {
      const fronts: Array<{ id: string; portents: string[] }> = [];
      const mysteries: Array<{ id: string; clues: string[] }> = [];
      let open: { portents?: string[]; clues?: string[] } | null = null;
      for (const line of user.split("\n")) {
        const front = line.match(/^- \[front: ([a-z0-9-]+)\]/);
        const mystery = line.match(/^- \[mystery: ([a-z0-9-]+)\]/);
        if (front) {
          const f = { id: front[1] as string, portents: [] as string[] };
          fronts.push(f);
          open = f;
        } else if (mystery) {
          const m = { id: mystery[1] as string, clues: [] as string[] };
          mysteries.push(m);
          open = m;
        } else if (open?.portents && /^ {2}\d+\. /.test(line))
          open.portents.push(line.replace(/^ {2}\d+\. /, ""));
        else if (open?.clues && line.startsWith("  - ")) open.clues.push(line.slice(4));
        else if (!line.startsWith("  ")) open = null;
      }
      const heroes = ids(section(user, "## The heroes").join("\n"), "ref");
      const cast = [...user.matchAll(/^- \[ref: ([a-z0-9-]+)\]/gm)].map((m) => m[1] as string);
      const region = ids(lastSection(user, "## Where it can begin"), "region")[0] ?? "";
      return {
        pitch: "A trouble is spreading, and only these heroes have noticed.",
        stakes: "If nobody acts, the lights of the valley go out one by one.",
        storySoFar: "The heroes have just arrived, and something is already wrong.",
        fronts,
        cast: cast.map((ref) => ({
          ref,
          role: "someone caught up in the trouble",
          agenda: "To see it put right.",
          voice: "Speaks quickly and keeps glancing over one shoulder.",
          secret: null,
          attitude: 0,
        })),
        newCast: [],
        mysteries,
        hooks: heroes.map((heroRef) => ({
          heroRef,
          hook: "Someone they love lives where the trouble is spreading.",
        })),
        opening: draftScene(user, {
          regionId: region,
          present: cast.slice(0, 1),
          clues: mysteries[0] ? [`${mysteries[0].id}-1`] : [],
        }),
      };
    }
    // Framing the next scene.
    const here = user.match(/Here: \[region: ([a-z0-9-]+)\]/)?.[1] ?? "";
    const scene = Number(user.match(/\(scene (\d+) of about/)?.[1] ?? "1");
    const finaleAllowed = user.includes("long enough for its finale");
    const moments = [...user.matchAll(/^- \[moment: ([a-z0-9-]+)\] [^\n]*?( \(the finale\))?:/gm)].map(
      (m) => ({
        id: m[1] as string,
        finale: Boolean(m[2]),
      }),
    );
    const finale = moments.find((m) => m.finale);
    const moment =
      finaleAllowed && finale ? finale : scene % 3 === 0 ? (moments.find((m) => !m.finale) ?? null) : null;
    const people = [...user.matchAll(/^- \[ref: ([a-z0-9-]+)\][^\n]*?(active|with heroes)/gm)].map(
      (m) => m[1] as string,
    );
    const clues = [...user.matchAll(/\[clue: ([a-z0-9-]+)\] (?!\(found\))/g)].map((m) => m[1] as string);
    const creatures = ids(user, "creature");
    const fight = !moment && scene % 4 === 0 && creatures[0] ? [creatures[0]] : [];
    const milestone = scene % 3 === 0;
    return {
      sceneSummary: "The heroes did what they set out to do, and the people there will remember it.",
      storySoFar: "The heroes are following the trouble from place to place, and it is following them.",
      frontChanges: ids(user, "front")
        .slice(0, 1)
        .map((front) => ({ front, change: scene % 2 === 0 ? "advance" : "none", why: "Time passed." })),
      milestone,
      chapterTitle: milestone ? "The Road Grows Darker" : null,
      next: draftScene(user, {
        regionId: here,
        present: people.slice(0, 1),
        clues: clues.slice(0, 1),
        foes: fight,
        momentId: moment?.id ?? null,
      }),
    };
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
    const target = user.includes("## The next scene:")
      ? lastSection(user, "## The next scene:")
      : lastSection(user, "## This scene:");
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
    const clue = lastSection(user, "## This scene:").match(/\[clue: ([a-z0-9-]+)\]/)?.[1];
    return {
      narration:
        `Old Wick turns the page. ${title ? `${title}. ` : ""}The heroes press on through the story, lanterns swinging. ${notes ? "Something unexpected happens along the way." : ""}`.trim(),
      npcLines: [],
      choices: finale ? [] : choices.slice(0, 4),
      sceneOver: true,
      happened: "The heroes looked around and pressed on.",
      changes: clue ? [{ kind: "clue", clue }] : [],
      imageBrief: {
        setting: title || "a winding road",
        subjects: ["three young heroes"],
        mood: "hopeful",
        timeOfDay: "dusk",
      },
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
