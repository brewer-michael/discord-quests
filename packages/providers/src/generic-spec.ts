import { z } from "zod";
import type { GenericHttpSpec } from "./types";

const Path = z.string().regex(/^\$(\.[A-Za-z0-9_-]+|\[\d+\])*$/, "use a path like $.data[0].b64_json");

/** Validates a custom image endpoint description from a preset or the setup page. */
export const GenericHttpSpecSchema = z.strictObject({
  request: z.strictObject({
    method: z.enum(["POST", "GET"]),
    url: z.string().min(1).max(500),
    headers: z.record(z.string().max(100), z.string().max(500)).optional(),
    body: z.string().max(5000).optional(),
  }),
  response: z.discriminatedUnion("mode", [
    z
      .strictObject({
        mode: z.literal("sync"),
        imageBase64Path: Path.optional(),
        imageUrlPath: Path.optional(),
      })
      .refine(
        (r) => r.imageBase64Path || r.imageUrlPath,
        "say where the image is: imageBase64Path or imageUrlPath",
      ),
    z
      .strictObject({
        mode: z.literal("poll"),
        idPath: Path,
        statusUrl: z.string().min(1).max(500),
        statusPath: Path,
        done: z.array(z.string()).min(1),
        failed: z.array(z.string()),
        resultBase64Path: Path.optional(),
        resultUrlPath: Path.optional(),
        intervalMs: z.number().int().min(250).max(30_000).optional(),
        timeoutMs: z.number().int().min(1000).max(300_000).optional(),
      })
      .refine(
        (r) => r.resultBase64Path || r.resultUrlPath,
        "say where the finished image is: resultBase64Path or resultUrlPath",
      ),
  ]),
}) satisfies z.ZodType<GenericHttpSpec>;
