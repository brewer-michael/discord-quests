import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  FrameOutput,
  IntentOutput,
  JudgeOutput,
  NarratorOutput,
  SafetyOutput,
  SeedOutput,
} from "@dq/core/narration";
import { describe, expect, it } from "vitest";
import { strictJsonSchema } from "./json-schema";

const ALL = { NarratorOutput, IntentOutput, SafetyOutput, JudgeOutput, SeedOutput, FrameOutput };

describe("engine output schemas", () => {
  it.each(Object.entries(ALL))("%s converts for Claude structured outputs", (_name, schema) => {
    const format = betaZodOutputFormat(schema);
    expect(format.type).toBe("json_schema");
    const text = JSON.stringify(format.schema);
    for (const unsupported of ['"minLength"', '"maxLength"', '"minimum"', '"maximum"', '"pattern"']) {
      expect(text).not.toContain(unsupported);
    }
  });

  it.each(Object.entries(ALL))("%s converts to a strict JSON schema for other providers", (_name, schema) => {
    expect(strictJsonSchema(schema).type).toBe("object");
  });

  it("round-trips a realistic narrator response", () => {
    const sample = {
      narration: "The lantern sputters.",
      npcLines: [{ npcRef: "hattie-wick", line: "Oh my stars." }],
      changes: [
        { kind: "whereabouts", who: "snibbet", status: "fled" },
        { kind: "new_person", name: "Marigold", description: "A baker." },
        { kind: "clue", clue: "the-missing-coal-2" },
      ],
      choices: [
        {
          label: "Follow the footprints",
          intent: {
            approach: "follow",
            skill: "survival",
            difficulty: "medium",
            deed: "none",
            targetRef: null,
            shortcutId: null,
          },
        },
      ],
      sceneOver: false,
      happened: "Snibbet fled into the night.",
      imageBrief: null,
    };
    expect(NarratorOutput.parse(sample).changes).toHaveLength(3);
  });
});
