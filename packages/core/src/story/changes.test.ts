import { describe, expect, it } from "vitest";
import { starterIndex } from "../loom/test-helpers";
import { type ChangeContext, type StoryChange, validateChanges } from "./changes";

const index = starterIndex();

const ctx = (over: Partial<ChangeContext> = {}): ChangeContext => ({
  index,
  heroes: new Map([["h1", { level: 1, gold: 10, inventory: new Map([["healing-potion", 1]]) }]]),
  cast: new Map([
    ["snibbet", { protected: true }],
    ["mayor-hobb", { protected: false }],
  ]),
  present: new Set(["snibbet", "mayor-hobb"]),
  clues: new Set(["the-missing-coal-4"]),
  allowedLoot: new Set(),
  foes: new Set(["gloom-mite"]),
  fighting: false,
  promises: new Set(),
  goals: new Set(["g1"]),
  knownNames: new Set(["snibbet"]),
  bannedTerms: index.world.content.bannedTerms,
  sceneHasHazard: false,
  ...over,
});

const run = (changes: StoryChange[], over: Partial<ChangeContext> = {}) =>
  validateChanges(changes, ctx(over));

describe("story changes", () => {
  it("lets only the people present change how they feel or where they go", () => {
    const out = run([
      { kind: "attitude", who: "mayor-hobb", by: 1 },
      { kind: "attitude", who: "granny-reed", by: 1 },
      { kind: "attitude", who: "mayor-hobb", by: 5 },
    ]);
    expect(out.accepted).toEqual([{ kind: "attitude", who: "mayor-hobb", by: 1 }]);
    expect(out.rejected).toHaveLength(2);
  });

  it("keeps someone the hidden hand needs alive: they flee instead of being beaten or captured", () => {
    const out = run([{ kind: "whereabouts", who: "snibbet", status: "captured" }]);
    expect(out.accepted).toEqual([{ kind: "whereabouts", who: "snibbet", status: "fled" }]);
  });

  it("finds only the clues the scene holds, once each", () => {
    const out = run([
      { kind: "clue", clue: "the-missing-coal-4" },
      { kind: "clue", clue: "the-missing-coal-4" },
      { kind: "clue", clue: "where-the-ember-went-1" },
    ]);
    expect(out.accepted).toHaveLength(1);
    expect(out.rejected.map((r) => r.reason)).toEqual(["already found", "that clue isn't here to find"]);
  });

  it("starts a fight only with foes the scene allows, and never during one", () => {
    expect(run([{ kind: "fight", foes: ["gloom-mite", "the-gloam-king"] }]).accepted).toEqual([
      { kind: "fight", foes: ["gloom-mite"] },
    ]);
    expect(run([{ kind: "fight", foes: ["gloom-mite"] }], { fighting: true }).accepted).toHaveLength(0);
    expect(run([{ kind: "fight", foes: ["shadow-wolf"] }]).accepted).toHaveLength(0);
  });

  it("allows hurt only from a dangerous scene, and new names only once", () => {
    expect(run([{ kind: "hazard", hero: "h1", amount: 2 }]).accepted).toHaveLength(0);
    expect(run([{ kind: "hazard", hero: "h1", amount: 2 }], { sceneHasHazard: true }).accepted).toHaveLength(
      1,
    );
    const names = run([
      { kind: "new_person", name: "Wren Hollis", description: "The baker." },
      { kind: "new_place", name: "wren hollis", description: "A bakery." },
      { kind: "new_person", name: "Snibbet", description: "Again." },
    ]);
    expect(names.accepted).toHaveLength(1);
  });
});
