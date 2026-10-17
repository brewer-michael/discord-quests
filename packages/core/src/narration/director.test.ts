import { describe, expect, it } from "vitest";
import { starterIndex } from "../loom/test-helpers";
import { planFromSeed } from "../story/living";
import { directorSystem, frameUser, seedUser } from "./director";
import { type NarrationStory, narratorSystem, narratorUser, publicSceneView } from "./prompts";

const index = starterIndex();
const world = index.world;
const story: NarrationStory = {
  intensity: "classic",
  voice: "classic",
  humor: "some",
  premise: "",
  lines: [],
  veils: [],
};

const text = (blocks: Array<{ text: string }>) => blocks.map((b) => b.text).join("\n");

describe("the storyteller's prompt", () => {
  it("carries the world's tone but never the whole world", () => {
    const system = text(narratorSystem(world, story));
    expect(system).toContain(world.tone.trim().slice(0, 60));
    // No digest of every place, faction and class.
    for (const region of world.regions.slice(1)) expect(system).not.toContain(region.description.trim());
    for (const faction of world.factions) expect(system).not.toContain(faction.description.trim());
    expect(system.length).toBeLessThan(12_000);
  });

  it("gives only the scene in front of the heroes: its question, the people there and the clues to find", () => {
    const user = text(
      narratorUser(
        publicSceneView({
          mode: "continue",
          story,
          scene: {
            title: "The Thief in the Lamp-House",
            kind: "social",
            locationName: "The Lamp-House",
            regionName: "Hearthmoor",
            placeNote: "An old stone mill where the village keeps its lantern oil.",
            summary: "The heroes catch a shivering thief hugging the last warm coal.",
            question: "What becomes of Snibbet?",
            people: [
              {
                ref: "snibbet",
                name: "Snibbet",
                role: "the lantern-thief",
                agenda: "To stay warm and stay free.",
                voice: "Mumbles, flinches, and calls everyone 'sir'.",
                attitude: "wary",
                secret: "He was once an apprentice Lamplighter named Pip.",
                status: "active",
              },
            ],
            foes: [],
            clues: [{ id: "the-missing-coal-4", text: "His hands are scarred like an apprentice's." }],
            opportunities: [],
          },
          nextScene: null,
          party: [],
          storySoFar: "Hearthmoor's lantern went out on Festival Eve.",
          discoveries: [],
          goals: [],
          promises: [],
          troubles: ["Village lanterns gutter and go out, one after another."],
          sceneLog: ["The heroes followed sooty footprints to the Lamp-House."],
          lastNarration: "",
          actions: [],
          rolls: [],
          crux: null,
          allowedLoot: [],
          epilogue: [],
        }),
        [],
      ),
    );
    expect(user).toContain("The question this scene turns on: What becomes of Snibbet?");
    expect(user).toContain(
      "Hidden (let it show; never say it): He was once an apprentice Lamplighter named Pip.",
    );
    expect(user).toContain("[clue: the-missing-coal-4]");
    expect(user).toContain("Village lanterns gutter and go out");
    expect(user).toContain("The heroes followed sooty footprints to the Lamp-House.");
  });
});

describe("the director's prompts", () => {
  const seed = index.seeds.get("the-dimming");
  if (!seed) throw new Error("no seed");

  it("set it up to follow the heroes, move threats, and keep three ways into every truth", () => {
    const system = text(directorSystem(world, story));
    expect(system).toContain("Follow the heroes");
    expect(system).toContain("at least three ways in");
    expect(system).toContain("At most one step per threat per scene");
  });

  it("seed a campaign from the heroes and the whole seed", () => {
    const user = text(
      seedUser({
        world,
        heroes: [
          {
            ref: "h1",
            name: "Wren",
            species: "Hearthkin",
            className: "Lamplighter",
            background: "Apprentice baker",
            keepsake: "her grandmother's thimble",
            path: "The Long Road",
            look: "Tall, freckled, flour on her sleeves.",
          },
        ],
        seed: {
          title: seed.title,
          pitch: seed.pitch,
          openings: seed.openings,
          stakes: seed.stakes,
          fronts: seed.fronts.map((f) => ({ ...f, portents: f.portents })),
          cast: [
            {
              ref: "snibbet",
              name: "Snibbet",
              role: "lantern-thief",
              description: "A shivering thief.",
              secret: null,
            },
          ],
          mysteries: seed.mysteries,
          moments: seed.moments,
        },
        places: [
          { regionId: "hearthmoor", regionName: "Hearthmoor", description: "A sleepy village.", pois: [] },
        ],
        setPieces: [],
      }),
    );
    expect(user).toContain("Wren [ref: h1]");
    expect(user).toContain("[front: the-long-night]");
    expect(user).toContain("the-missing-coal-1");
    expect(user).toContain("A stake, never a destiny.");
  });

  it("frame a scene from where the heroes are heading, with the plan's fronts and clues", () => {
    const plan = planFromSeed(seed, "standard");
    const user = text(
      frameUser({
        story: {
          title: plan.title,
          pitch: plan.pitch,
          stakes: plan.stakes,
          storySoFar: "",
          scenesDone: 3,
          scenesTarget: 20,
          finaleAllowed: false,
          chapter: "Chapter 1",
        },
        fronts: plan.fronts.map((f) => ({ ...f, stage: 1 })),
        mysteries: plan.mysteries,
        cast: [],
        hooks: [],
        moments: plan.moments,
        ended: {
          title: "The Thief",
          question: "What becomes of Snibbet?",
          log: ["They let Snibbet go."],
          lastNarration: "",
        },
        heading: ["Wren sets off for Lantern Hall."],
        places: {
          here: { regionId: "hearthmoor", name: "Hearthmoor", description: "", pois: [] },
          nearby: [{ regionId: "reedmarsh", name: "Reedmarsh", days: 3, road: true, pois: [] }],
        },
        setPieces: [],
        temptations: [],
        creatures: [],
      }),
    );
    expect(user).toContain("Wren sets off for Lantern Hall.");
    expect(user).toContain("[has come true]");
    expect(user).toContain("[clue: the-missing-coal-1]");
    expect(user).toContain("It's too early for the finale.");
  });
});
