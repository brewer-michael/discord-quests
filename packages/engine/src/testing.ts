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
  // The story writer: each step of its jobs, by the shape asked for; recaps when a server sends them its way.
  writer: (call, scope) => {
    if (call.schemaName === "recap") return DEFAULTS.summarizer?.(call, scope);
    const step = WRITER_STEPS[call.schemaName ?? ""];
    return step ? step(writerPrompt(call)) : new Error(`no scripted answer for ${call.schemaName}`);
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

interface WriterPrompt {
  text: string;
  chapters: Array<{ number: number; title: string; beats: Array<{ id: string; place: string }> }>;
  places: string[];
  people: Array<{ id: string; name: string }>;
  factions: string[];
  played: Set<string>;
  partyChapter: number;
  partyPlace: string;
}

/** What the story writer is told, read back: the world's chapters, places and people, and where the party is. */
function writerPrompt(call: StructuredCall<unknown>): WriterPrompt {
  const text = [...call.system, ...call.user].map((b) => b.text).join("\n");
  const chapters: WriterPrompt["chapters"] = [];
  for (const line of text.split("\n")) {
    const head = /^### Chapter (\d+): ([^.]+)\./.exec(line);
    if (head) chapters.push({ number: Number(head[1]), title: head[2] ?? "", beats: [] });
    const beat = /^- beat: ([a-z0-9-]+) \|.*? at ([a-z0-9-]+):/.exec(line);
    if (beat && chapters.length) chapters.at(-1)?.beats.push({ id: beat[1] ?? "", place: beat[2] ?? "" });
  }
  const where = /- Chapter (\d+), at ([a-z0-9-]+)\. Beats already played: ([^\n]*)\./.exec(text);
  return {
    text,
    chapters,
    places: [...text.matchAll(/^ *- place: ([a-z0-9-]+) \|/gm)].map((m) => m[1] ?? ""),
    people: [...text.matchAll(/^- person: ([a-z0-9-]+) \| ([^:]+):/gm)].map((m) => ({
      id: m[1] ?? "",
      name: m[2] ?? "",
    })),
    factions: [...text.matchAll(/^- faction: ([a-z0-9-]+) \|/gm)].map((m) => m[1] ?? ""),
    played: new Set((where?.[3] ?? "").split(", ").filter((x) => x && x !== "none")),
    partyChapter: Number(where?.[1] ?? 1),
    partyPlace: where?.[2] ?? "",
  };
}

function preparedChapter(p: WriterPrompt, n: number) {
  const beats = (p.chapters.find((c) => c.number === n)?.beats ?? [])
    .filter((b) => !p.played.has(b.id))
    .slice(0, 5);
  const elsewhere = (place: string) => p.places.find((x) => x !== place) ?? place;
  const first = beats[0]?.place ?? p.partyPlace ?? p.places[0] ?? "";
  const scene = (beatId: string | null, place: string) => ({
    beatId,
    place,
    situation: "The heroes arrive to find the trouble has moved on a little since they last heard of it.",
    question: "What will the heroes do about it?",
    people: [],
    clues: [{ text: "A trail of sooty footprints.", alsoAt: [elsewhere(place)] }],
    encounter: null,
    temptation: null,
  });
  return { chapter: n, scenes: [...beats.map((b) => scene(b.id, b.place)), scene(null, first)] };
}

const WRITER_STEPS: Record<string, (p: WriterPrompt) => unknown> = {
  outline: (p) => ({
    pitch: "The heroes set out to bring the light home, one kindness at a time.",
    shape: "a quest for a stolen thing",
    stakes: "Without the flame, the long night settles over every village.",
    villain: { name: "The Gloam King", want: "to keep every warm thing for himself" },
    chapters: p.chapters.map((c) => ({
      number: c.number,
      title: c.title,
      purpose: "The heroes take the next step on the road.",
    })),
  }),
  bible: (p) => ({
    places: p.places.slice(0, 4).map((id) => ({ id, now: "Quiet, and waiting for news.", routes: [] })),
    factions: p.factions
      .slice(0, 2)
      .map((id) => ({ id, wants: "Its own way.", towardHeroes: "Watching them." })),
    cast: [
      ...p.people.slice(0, 3).map((x) => ({
        id: x.id,
        name: x.name,
        role: "someone the heroes meet on the road",
        pronouns: "they/them",
        personality: "Warm and a little nervous.",
        wants: "To see the lanterns lit again.",
        secret: "They know more than they say.",
        voice: "Quick and kind.",
      })),
      {
        id: "new-pell",
        name: "Pell",
        role: "a lamp-boy who wants to help",
        pronouns: "he/him",
        personality: "Eager.",
        wants: "To be useful.",
        secret: "He has never left the village.",
        voice: "Breathless.",
      },
    ],
    facts: ["The adventure is just beginning."],
  }),
  spine: (p) => ({
    chapters: p.chapters.map((c) => ({
      number: c.number,
      marker: `The heroes finish what ${c.title} is about.`,
      hook: "Someone asks the heroes for help.",
      forks:
        c.number === 1
          ? [
              {
                id: "fork-mercy",
                question: "Will the heroes show mercy?",
                options: [
                  { choice: "Show mercy", keepsOpen: ["light-returns", "light-shared"] },
                  { choice: "Turn away", keepsOpen: ["long-road"] },
                ],
              },
            ]
          : [],
    })),
    endings: [
      {
        id: "light-returns",
        title: "The Light Returns",
        summary: "The flame comes home.",
        reachedWhen: "The Ember reaches the forge.",
      },
      {
        id: "light-shared",
        title: "The Light Shared",
        summary: "The flame is shared by all.",
        reachedWhen: "The heroes share it.",
      },
      {
        id: "long-road",
        title: "The Long Road",
        summary: "The heroes walk home in the dark.",
        reachedWhen: "The Ember is lost.",
      },
    ],
  }),
  chapter_detail: (p) =>
    preparedChapter(p, Number(/Write chapter (\d+) in detail/.exec(p.text)?.[1] ?? p.partyChapter)),
  side_quests: (p) => ({
    sideQuests: [
      {
        id: `sq-${p.partyPlace || "road"}`,
        title: "A small trouble nearby",
        place: p.partyPlace || (p.places[0] ?? ""),
        people: [],
        hook: "Someone nearby needs a hand.",
        complication: "It's harder than it looks.",
        payoff: "A new friend who remembers the favor.",
        leadsBack: "the chapter's marker",
      },
    ],
  }),
  rework: (p) => ({
    facts: ["The DM's telling of the turn stands."],
    chapter: preparedChapter(p, p.partyChapter),
    sideQuests: [],
  }),
  self_check: (p) => {
    const line = p.text.split("## The material this job wrote\n")[1]?.split("\n")[0] ?? "{}";
    return { problems: [], ...(JSON.parse(line) as Record<string, unknown>) };
  },
};

/** The scripted answers, by AI job, for tests that change one answer and keep the rest. */
export const FAKE_ANSWERS: Readonly<Record<string, Handler>> = DEFAULTS;
