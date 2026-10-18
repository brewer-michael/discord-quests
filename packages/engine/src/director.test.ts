import { type Deed, emptyLoomState, type LoomState } from "@dq/core/loom";
import { describe, expect, it } from "vitest";
import { laterInChapter, nextSceneSpec } from "./director";
import { initialStoryState, type StoryState } from "./story-state";
import { WorldCache } from "./world-cache";

const { index } = new WorldCache().get("lanternreach");
const TOLL = "ch3-the-toll-bridge";
const HALL = "ch3-lantern-hall";
const SIEGE = "ch3-the-siege-of-lantern-hall";

// Chapters 1 and 2 are done and the heroes are in the Whisperwood: the Toll Bridge, in the Reedmarsh, is next.
const throughCh2 = index.beatOrder.filter((b) => b.chapter.number < 3).map((b) => b.beat.id);
const story = (over: Partial<StoryState> = {}): StoryState => ({
  ...initialStoryState(index),
  completedBeats: throughCh2,
  regionId: "whisperwood",
  ...over,
});
const loomWith = (...deeds: Array<Pick<Deed, "tag"> & { target: string }>): LoomState => ({
  ...emptyLoomState(),
  deeds: deeds.map(
    (d, i) =>
      ({
        id: `d${i}`,
        turn: 1,
        tag: d.tag,
        actorIds: ["hero"],
        anchor: { kind: "npc", id: d.target, name: d.target, tags: [] },
        evidence: { forgoneBenefit: 1 },
        source: "choice",
        weight: 1,
        progress: 0,
        chapter: 2,
        summary: "helped",
      }) as Deed,
  ),
});
const helpedTumble = loomWith({ tag: "kindness_to_lowly", target: "tumble" });

describe("the road into the Reedmarsh", () => {
  it("ends at Coin Bridge, with Lantern Hall beyond it", () => {
    const road = nextSceneSpec(index, story(), emptyLoomState());
    expect(road?.kind).toBe("travel");
    expect(road?.goals).toEqual(["Reach Coin Bridge."]);
    expect(road?.summary).toContain("The journey ends at Coin Bridge: the heroes go no further this scene.");
    expect(road?.bypassed).toBeUndefined();
  });

  it("goes round the Toll Bridge by boat when the heroes helped Tumble, and comes out at Lantern Hall", () => {
    const road = nextSceneSpec(index, story(), helpedTumble);
    expect(road?.kind).toBe("travel");
    expect(road?.goals).toEqual(["Reach Lantern Hall."]);
    expect(road?.summary).toContain("Tumble's family poles the heroes through the back channels");
    expect(road?.bypassed).toEqual([TOLL]);

    // Once the road scene has opened (and recorded the bridge as gone round) and closed, the Hall is next.
    const arrived = story({
      completedBeats: [...throughCh2, TOLL],
      bypassedBeats: [TOLL],
      regionId: "reedmarsh",
    });
    const hall = nextSceneSpec(index, arrived, helpedTumble);
    expect(hall?.beatId).toBe(HALL);
    expect(hall?.bypassed).toBeUndefined();
  });

  it("only goes round for the deeds and the person the world names", () => {
    expect(
      nextSceneSpec(index, story(), loomWith({ tag: "mercy", target: "tumble" }))?.bypassed,
    ).toBeUndefined();
    expect(
      nextSceneSpec(index, story(), loomWith({ tag: "kindness_to_lowly", target: "snibbet" }))?.bypassed,
    ).toBeUndefined();
    expect(
      nextSceneSpec(index, story(), loomWith({ tag: "promise_kept", target: "tumble" }))?.bypassed,
    ).toEqual([TOLL]);
  });

  it("says how the heroes got there when they're already in the region", () => {
    const hall = nextSceneSpec(index, story({ regionId: "reedmarsh" }), helpedTumble);
    expect(hall?.beatId).toBe(HALL);
    expect(hall?.summary).toMatch(/^How the heroes got here: Tumble's family poles the heroes/);
    expect(hall?.bypassed).toEqual([TOLL]);
  });
});

describe("a route the storyteller reports", () => {
  it("opens the scene the story reached, going round the ones between", () => {
    const hall = nextSceneSpec(index, story({ regionId: "reedmarsh", arrivedAt: HALL }), emptyLoomState());
    expect(hall?.beatId).toBe(HALL);
    expect(hall?.bypassed).toEqual([TOLL]);
    expect(hall?.summary).not.toContain("How the heroes got here");
  });

  it("never goes round anything to reach a decisive scene", () => {
    const next = nextSceneSpec(index, story({ regionId: "reedmarsh", arrivedAt: SIEGE }), emptyLoomState());
    expect(next?.beatId).toBe(TOLL);
    expect(next?.bypassed).toBeUndefined();
  });

  it("is offered only the later scenes of this chapter, stopping before a decisive one", () => {
    const road = nextSceneSpec(index, story(), emptyLoomState());
    if (!road) throw new Error("expected the road scene");
    expect(laterInChapter(index, story(), road).map((r) => r.beat.id)).toEqual([HALL]);
    const bridge = nextSceneSpec(index, story({ regionId: "reedmarsh" }), emptyLoomState());
    if (!bridge) throw new Error("expected the Toll Bridge");
    expect(bridge.beatId).toBe(TOLL);
    expect(laterInChapter(index, story({ regionId: "reedmarsh" }), bridge).map((r) => r.beat.id)).toEqual([
      HALL,
    ]);
  });
});
