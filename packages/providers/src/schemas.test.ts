import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { IntentOutput, JudgeOutput, NarratorOutput, SafetyOutput } from "@dq/core/narration";
import { describe, expect, it } from "vitest";
import { strictJsonSchema } from "./json-schema";

const ALL = { NarratorOutput, IntentOutput, SafetyOutput, JudgeOutput };

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
      proposedDeltas: [
        { kind: "npc_status", npcId: "snibbet", status: "fled" },
        { kind: "introduce_entity", entityKind: "npc", name: "Marigold", description: "A baker.", tags: [] },
        { kind: "move_party", regionId: "whisperwood", poiId: null },
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
      arrivedAt: null,
      imageBrief: null,
      significance: "minor",
    };
    expect(NarratorOutput.parse(sample).proposedDeltas).toHaveLength(3);
  });
});
