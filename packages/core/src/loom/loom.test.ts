import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createRng } from "../rng/index";
import { loomContext } from "./context";
import { costFactor } from "./deeds";
import { evaluateLoom } from "./engine";
import { compileEpilogue } from "./epilogue";
import { deed, entity, inputAt, SNIBBET, starterIndex, TUMBLE } from "./test-helpers";
import { emptyLoomState, type LoomInput, type LoomState } from "./types";

const index = starterIndex();
const ctx = loomContext(index);
const rng = (k = "seed") => createRng(k);

function spareSnibbet(state = emptyLoomState()): LoomState {
  const input = inputAt(index, "ch1-the-thief-in-the-lamp-house", {
    scene: { entities: [entity(SNIBBET, "at_mercy", true)] },
    deedCandidates: [
      deed("mercy", SNIBBET, {
        summary: "Let Snibbet go free in the Lamp-House",
        evidence: { forgoneBenefit: 2, goldForgone: 20 },
      }),
    ],
  });
  return evaluateLoom(state, input, ctx, rng()).state;
}

function crux(
  state: LoomState,
  beatId: string,
  success: boolean,
  margin = -4,
  extra: Partial<LoomInput> = {},
) {
  const input = inputAt(index, beatId, {
    check: { kind: "crux", beatId, success, margin, pSuccess: 0.1 },
    ...extra,
  });
  return evaluateLoom(state, input, ctx, rng(`crux-${beatId}`));
}

describe("deeds and threads", () => {
  it("mercy to Snibbet plants a thread, makes him a shadowing bearer, and reserves him for the finale", () => {
    const state = spareSnibbet();
    expect(state.threads).toHaveLength(1);
    const t = state.threads[0];
    expect(t?.tag).toBe("mercy");
    expect(t?.reservedForBeat).toBe("ch8-the-last-step");
    expect(state.bearers[0]).toMatchObject({ npcId: "snibbet", presence: "shadowing", mustSurvive: true });
    expect(state.ledgers["hero-a"]?.grace).toBeGreaterThan(0);
  });

  it("mercy needs someone actually at the heroes' mercy", () => {
    const silas = { kind: "npc" as const, id: "silas-coin", name: "Silas Coin", faction: "gilded-ledger" };
    const input = inputAt(index, "ch3-the-toll-bridge", {
      scene: { entities: [entity(silas, "neutral", false)] },
      deedCandidates: [deed("mercy", silas)],
    });
    const out = evaluateLoom(emptyLoomState(), input, ctx, rng());
    expect(out.state.threads).toHaveLength(0);
    expect(out.audit.some((a) => a.detail.includes("rejected mercy"))).toBe(true);
  });

  it("'mercy' toward someone lowly who wasn't at the heroes' mercy counts as kindness instead", () => {
    const input = inputAt(index, "ch1-hatties-request", {
      scene: { entities: [entity(SNIBBET, "neutral", true)] },
      deedCandidates: [deed("mercy", SNIBBET)],
    });
    expect(evaluateLoom(emptyLoomState(), input, ctx, rng()).state.threads[0]?.tag).toBe("kindness_to_lowly");
  });

  it("patience only counts when a shortcut was on offer", () => {
    const offered = inputAt(index, "ch2-the-fork-in-the-road", {
      deedCandidates: [deed("patience", null, { evidence: { shortcutDeclined: "fox-door" } })],
    });
    expect(evaluateLoom(emptyLoomState(), offered, ctx, rng()).state.threads).toHaveLength(1);
    const nothing = inputAt(index, "ch1-the-last-flame", { deedCandidates: [deed("patience", null)] });
    expect(evaluateLoom(emptyLoomState(), nothing, ctx, rng()).state.threads).toHaveLength(0);
  });

  it("narrator-detected deeds weigh half as much", () => {
    const scene = { entities: [entity(TUMBLE, "neutral", true)] };
    const chosen = evaluateLoom(
      emptyLoomState(),
      inputAt(index, "ch2-the-lost-river-child", {
        scene,
        deedCandidates: [deed("kindness_to_lowly", TUMBLE)],
      }),
      ctx,
      rng(),
    );
    const narrated = evaluateLoom(
      emptyLoomState(),
      inputAt(index, "ch2-the-lost-river-child", {
        scene,
        deedCandidates: [deed("kindness_to_lowly", TUMBLE, { source: "narrator" })],
      }),
      ctx,
      rng(),
    );
    expect(narrated.state.threads[0]?.weight).toBeCloseTo((chosen.state.threads[0]?.weight ?? 0) / 2);
  });

  it("a virtue that cost nothing counts for little", () => {
    expect(costFactor({})).toBe(0.3);
    expect(costFactor({ forgoneBenefit: 3, riskTaken: true, shortcutDeclined: "x" })).toBeGreaterThan(1.2);
    expect(costFactor({ forgoneBenefit: 3, rewardExpected: true })).toBeLessThan(
      costFactor({ forgoneBenefit: 3 }),
    );
  });

  it("repeating the same kindness to the same person is damped", () => {
    let state = emptyLoomState();
    const weights: number[] = [];
    for (let i = 0; i < 3; i++) {
      const input = inputAt(index, "ch2-the-lost-river-child", {
        turn: 10 + i,
        scene: { id: `s${i}`, entities: [entity(TUMBLE, "neutral", true)] },
        deedCandidates: [deed("kindness_to_lowly", TUMBLE)],
      });
      state = evaluateLoom(state, input, ctx, rng(`k${i}`)).state;
      weights.push(state.threads.at(-1)?.weight ?? 0);
    }
    expect(weights[1]).toBeLessThan(weights[0] as number);
    expect(weights[2]).toBeLessThan(weights[1] as number);
  });

  it("exploiting someone right after sparing them makes the mercy ring hollow", () => {
    let state = spareSnibbet();
    const input = inputAt(index, "ch1-hatties-request", {
      scene: { entities: [entity(SNIBBET, "neutral", true)] },
      deedCandidates: [deed("steal", SNIBBET, { confidence: 0.9 })],
    });
    state = evaluateLoom(state, input, ctx, rng()).state;
    expect(state.threads[0]?.sincerity).toBeLessThan(1);
    expect(state.snares).toHaveLength(1);
  });
});

describe("snares", () => {
  it("taking the Fox Door ties a snare that withholds a payoff at the crux", () => {
    const input = inputAt(index, "ch2-the-fork-in-the-road", {
      deedCandidates: [
        deed(
          "fox_bargain",
          { kind: "npc", id: "saffron-the-fox", name: "Saffron" },
          { shortcutId: "fox-door" },
        ),
      ],
    });
    const state = evaluateLoom(emptyLoomState(), input, ctx, rng()).state;
    expect(state.snares[0]).toMatchObject({
      effect: "withhold_socket",
      socket: "object_reveals",
      state: "latent",
    });
    expect(state.ledgers["hero-a"]?.debt).toBe(2);
  });

  it("borrowed luck is recalled a few beats later as disadvantage", () => {
    let state = evaluateLoom(
      emptyLoomState(),
      inputAt(index, "ch2-the-fork-in-the-road", {
        deedCandidates: [deed("fox_bargain", null, { shortcutId: "borrowed-luck" })],
      }),
      ctx,
      rng(),
    ).state;
    const later = evaluateLoom(state, inputAt(index, "ch3-lantern-hall"), ctx, rng());
    state = later.state;
    expect(later.effects).toContainEqual({ kind: "disadvantage_next_roll", characterIds: ["hero-a"] });
    expect(state.snares[0]?.state).toBe("sprung");
    expect(later.directives.some((d) => d.kind === "snare_springs")).toBe(true);
  });

  it("making amends unknots a snare and plants a redemption thread", () => {
    const fox = {
      kind: "npc" as const,
      id: "saffron-the-fox",
      name: "Saffron",
      faction: "court-of-the-bargain-fox",
    };
    let state = evaluateLoom(
      emptyLoomState(),
      inputAt(index, "ch2-the-fork-in-the-road", {
        deedCandidates: [deed("fox_bargain", fox, { shortcutId: "fox-door" })],
      }),
      ctx,
      rng(),
    ).state;
    state = evaluateLoom(
      state,
      inputAt(index, "ch2-the-hollow-oak", {
        scene: { entities: [entity(fox)] },
        deedCandidates: [deed("amends", fox)],
      }),
      ctx,
      rng(),
    ).state;
    expect(state.snares[0]?.state).toBe("unknotted");
    expect(state.threads.at(-1)?.tag).toBe("amends");
  });
});

describe("convergence at decisive moments", () => {
  it("a crux the heroes win on their own spends nothing", () => {
    const state = spareSnibbet();
    const out = crux(state, "ch3-the-siege-of-lantern-hall", true);
    expect(out.crux?.outcome).toBe("success");
    expect(out.state.threads.every((t) => t.state !== "woven")).toBe(true);
  });

  it("with no threads, a failed crux fails forward and the story goes on", () => {
    const out = crux(emptyLoomState(), "ch3-the-siege-of-lantern-hall", false);
    expect(out.crux?.outcome).toBe("fail_forward");
    expect(out.directives[0]?.kind).toBe("fail_forward");
  });

  it("kindness to Tumble brings the River Folk boats when the Hall would fall", () => {
    let state = emptyLoomState();
    state = evaluateLoom(
      state,
      inputAt(index, "ch2-the-lost-river-child", {
        scene: { entities: [entity(TUMBLE, "neutral", true)] },
        deedCandidates: [
          deed("kindness_to_lowly", TUMBLE, {
            evidence: { daysLost: 1, forgoneBenefit: 1 },
            summary: "Walked Tumble all the way home",
          }),
        ],
        promisesKept: ["tumble"],
      }),
      ctx,
      rng(),
    ).state;
    state = evaluateLoom(
      state,
      inputAt(index, "ch2-the-lost-river-child", {
        turn: 30,
        scene: { id: "s2", entities: [entity(TUMBLE, "neutral", true)] },
        deedCandidates: [deed("promise_kept", TUMBLE, { evidence: { daysLost: 1 } })],
        promisesKept: ["tumble"],
      }),
      ctx,
      rng(),
    ).state;
    const out = crux(state, "ch3-the-siege-of-lantern-hall", false, -3);
    expect(["success_by_convergence", "costly_success"]).toContain(out.crux?.outcome);
    const d = out.directives.find((x) => x.kind === "convergence");
    expect(d && d.kind === "convergence" && d.socket).toBe("ally_arrives");
    expect(d?.text).toContain("River Folk");
    expect(out.state.threads.some((t) => t.state === "woven")).toBe(true);
  });

  it("Snibbet's mercy is never spent before the final crux", () => {
    const state = spareSnibbet();
    const out = crux(state, "ch3-the-siege-of-lantern-hall", false);
    expect(out.state.threads.find((t) => t.anchor?.id === "snibbet")?.state).not.toBe("woven");
  });

  it("mercy toward Snibbet alone is enough to carry the Last Step, at a cost", () => {
    const out = crux(spareSnibbet(), "ch8-the-last-step", false, -6, {
      scene: { entities: [entity(SNIBBET, "neutral", true)] },
    } as Partial<LoomInput>);
    expect(["costly_success", "success_by_convergence"]).toContain(out.crux?.outcome);
  });

  it("at the Last Step, the spared one finishes what the hero could not", () => {
    const patient = inputAt(index, "ch2-the-fork-in-the-road", {
      deedCandidates: [
        deed("patience", null, {
          evidence: { shortcutDeclined: "fox-door", daysLost: 3 },
          summary: "Took the long road around the Whisperwood",
        }),
      ],
    });
    const state = evaluateLoom(spareSnibbet(), patient, ctx, rng()).state;
    const out = crux(state, "ch8-the-last-step", false, -6, {
      scene: { entities: [entity(SNIBBET, "neutral", true)] },
    } as Partial<LoomInput>);
    expect(out.crux?.outcome).toBe("success_by_convergence");
    const d = out.directives[0];
    expect(d?.kind).toBe("convergence");
    if (d?.kind === "convergence") {
      expect(d.socket).toBe("spared_one_acts");
      expect(d.agentName).toBe("Snibbet");
      expect(d.text).toContain("Snibbet");
      expect(d.mustNot.join(" ")).toContain("fall short");
    }
  });

  it("a traded keepsake closes the keepsake payoff at the crux", () => {
    let state = evaluateLoom(
      emptyLoomState(),
      inputAt(index, "ch2-the-fork-in-the-road", {
        deedCandidates: [deed("fox_bargain", null, { shortcutId: "fox-door" })],
      }),
      ctx,
      rng(),
    ).state;
    const out = crux(state, "ch7-the-ember-vault", false);
    state = out.state;
    expect(out.crux?.withheldSockets).toContain("object_reveals");
    expect(state.snares[0]?.state).toBe("sprung");
  });
});

describe("quiet-hand detours", () => {
  it("plants a detour with a registered purpose, then pays it off at the target beat", () => {
    const always = loomContext(index, { detourChance: 1 });
    const input = inputAt(index, "ch2-the-fork-in-the-road", { scene: { kind: "travel" } });
    const planted = evaluateLoom(emptyLoomState(), input, always, rng());
    expect(planted.state.detours).toHaveLength(1);
    const plan = planted.state.detours[0];
    expect(planted.directives.some((d) => d.kind === "detour_setup")).toBe(true);
    expect(planted.constraints.some((c) => c.kind === "need_socket")).toBe(true);
    if (!plan) return;
    const payoff = evaluateLoom(
      planted.state,
      inputAt(index, plan.target.beatId, { turn: 200 }),
      always,
      rng(),
    );
    expect(payoff.state.detours[0]?.state).toBe("paid_off");
    const text = payoff.directives.find((d) => d.kind === "detour_payoff")?.text ?? "";
    expect(text).not.toContain("{{");
  });

  it("never plants detours in combat or crux scenes", () => {
    const always = loomContext(index, { detourChance: 1 });
    for (const beatId of ["ch1-gloam-in-the-garden", "ch3-the-siege-of-lantern-hall"]) {
      expect(
        evaluateLoom(emptyLoomState(), inputAt(index, beatId), always, rng()).state.detours,
      ).toHaveLength(0);
    }
  });
});

describe("guarantees", () => {
  const beats = index.beatOrder.map((b) => b.beat.id);
  const tags = [
    "mercy",
    "kindness_to_lowly",
    "patience",
    "honesty_at_cost",
    "steal",
    "fox_bargain",
    "promise_kept",
  ] as const;
  const step = fc.record({
    beat: fc.constantFrom(...beats),
    tag: fc.constantFrom(...tags),
    snibbet: fc.boolean(),
    fail: fc.boolean(),
    downed: fc.boolean(),
  });

  type Step = { beat: string; tag: (typeof tags)[number]; snibbet: boolean; fail: boolean; downed: boolean };

  function play(seed: string, steps: Step[]) {
    let state = emptyLoomState();
    const results = [];
    let turn = 1;
    for (const s of steps) {
      turn += 1;
      const ref = index.beats.get(s.beat);
      const anchor = s.snibbet ? SNIBBET : TUMBLE;
      const input = inputAt(index, s.beat, {
        turn,
        scene: {
          id: `scene-${turn}`,
          entities: [entity(anchor, s.tag === "mercy" ? "at_mercy" : "neutral", true)],
        },
        deedCandidates: [
          deed(s.tag, anchor, {
            shortcutId: s.tag === "fox_bargain" ? "fox-door" : undefined,
            confidence: 0.9,
          }),
        ],
        promisesKept: s.tag === "promise_kept" ? [anchor.id] : [],
        check: ref?.beat.decisive
          ? { kind: "crux", beatId: s.beat, success: !s.fail, margin: -3, pSuccess: 0.2 }
          : s.fail
            ? { kind: "failure", stakes: "moderate", margin: -2, characterIds: ["hero-a"] }
            : null,
        heroesDowned: s.downed ? ["hero-a"] : [],
      });
      const out = evaluateLoom(state, input, ctx, createRng(`${seed}-${turn}`));
      results.push(out);
      state = out.state;
    }
    return { state, results };
  }

  it("is deterministic", () => {
    fc.assert(
      fc.property(fc.string(), fc.array(step, { minLength: 1, maxLength: 25 }), (seed, steps) => {
        const a = play(seed, steps);
        const b = play(seed, steps);
        expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
        expect(JSON.stringify(a.results.map((r) => r.directives))).toBe(
          JSON.stringify(b.results.map((r) => r.directives)),
        );
      }),
      { numRuns: 60 },
    );
  });

  it("never weaves a thread twice, never exceeds the providence budget outside cruxes, and keeps bearers alive", () => {
    fc.assert(
      fc.property(fc.string(), fc.array(step, { minLength: 5, maxLength: 40 }), (seed, shuffled) => {
        // Stories only move forward, so play the beats in story order.
        const position = new Map(index.beatOrder.map((b, i) => [b.beat.id, i]));
        const steps = [...shuffled].sort((a, b) => (position.get(a.beat) ?? 0) - (position.get(b.beat) ?? 0));
        const { state, results } = play(seed, steps);
        const wovenIds = results.flatMap((r) => r.crux?.wovenThreadIds ?? []);
        expect(new Set(wovenIds).size).toBe(wovenIds.length);
        for (const r of results) {
          const graces = r.directives.filter((d) => d.kind === "minor_grace").length;
          expect(graces).toBeLessThanOrEqual(1);
        }
        const graceChapters = results.flatMap((r, i) =>
          r.directives.some((d) => d.kind === "minor_grace")
            ? [index.beats.get(steps[i]?.beat ?? "")?.chapter.number]
            : [],
        );
        expect(new Set(graceChapters).size).toBe(graceChapters.length);
        for (const b of state.bearers) {
          const live = state.threads.some(
            (t) => b.threadIds.includes(t.id) && t.state !== "woven" && t.state !== "lapsed",
          );
          expect(b.mustSurvive).toBe(live);
        }
        for (const t of state.threads) {
          expect(t.weight).toBeGreaterThan(0);
          expect(t.weight).toBeLessThanOrEqual(ctx.tuning.maxWeight);
        }
      }),
      { numRuns: 80 },
    );
  });

  it("a crux the heroes win never spends a thread", () => {
    fc.assert(
      fc.property(fc.string(), fc.array(step, { minLength: 1, maxLength: 20 }), (seed, steps) => {
        const { results } = play(seed, steps);
        for (const r of results) if (r.crux?.outcome === "success") expect(r.crux.wovenThreadIds).toEqual([]);
      }),
      { numRuns: 40 },
    );
  });
});

describe("epilogue", () => {
  it("hints without numbers or mechanics", () => {
    const patient = inputAt(index, "ch2-the-fork-in-the-road", {
      deedCandidates: [deed("patience", null, { evidence: { shortcutDeclined: "fox-door", daysLost: 3 } })],
    });
    const state = evaluateLoom(spareSnibbet(), patient, ctx, rng()).state;
    const out = crux(state, "ch8-the-last-step", false, -6, {
      scene: { entities: [entity(SNIBBET, "neutral", true)] },
    } as Partial<LoomInput>);
    for (const style of ["subtle", "explicit"] as const) {
      const lines = compileEpilogue(out.state, index.world, style, rng("epi"));
      const text = lines.join(" ");
      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toMatch(/\d/);
      expect(text).not.toMatch(/\b(thread|seed|weight|grace score|loom|providence|stat)\b/i);
      expect(text).not.toContain("{{");
    }
    const explicit = compileEpilogue(out.state, index.world, "explicit", rng("epi")).join(" ");
    expect(explicit).toContain("let Snibbet go free");
    expect(explicit).toContain("Snibbet lunges for the Ember");
    expect(explicit.match(/Looking back|It began|Of all the choices/g)).toHaveLength(1);
  });
});
