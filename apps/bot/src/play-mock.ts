/**
 * A stand-in AI service for `pnpm play --ai mock`: a local server that speaks the OpenAI chat-completions API
 * and answers with the scripted story the tests use. Calls go through everything a real service's would (the
 * provider store, the gateway, the OpenAI-compatible adapter, the safe fetcher, budgets and logs); only the
 * model is pretend.
 */
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import type { CallScope, StructuredCall } from "@dq/core/llm";
import { FAKE_ANSWERS } from "@dq/engine/testing";
import { z } from "zod";

/** Which job a request is for, from the name of the shape it asks for. */
const TASK_FOR_SCHEMA: Record<string, string> = {
  narration: "narrator",
  review: "judge",
  actions: "intent",
  verdict: "safety",
  chapter_plan: "writer",
  chapter_plan_revised: "writer",
  recap: "summarizer",
  appearance: "summarizer",
};

export interface MockProvider {
  url: string;
  /** Requests answered, and requests whose caller hung up before the answer. */
  stats: { answered: number; abandoned: number; byTask: Record<string, number> };
  close(): Promise<void>;
}

async function body(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** Starts the stand-in on a free local port. `delayMs` slows each answer, like a real model thinking. */
export async function startMockProvider(opts: { delayMs?: [number, number] } = {}): Promise<MockProvider> {
  const stats: MockProvider["stats"] = { answered: 0, abandoned: 0, byTask: {} };
  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
      res.writeHead(404).end();
      return;
    }
    const request = JSON.parse(await body(req)) as {
      model?: string;
      messages?: Array<{ role: string; content: string }>;
      response_format?: { json_schema?: { name?: string } };
    };
    const schemaName = request.response_format?.json_schema?.name ?? "";
    const task = TASK_FOR_SCHEMA[schemaName] ?? "narrator";
    const text = (role: string) =>
      (request.messages ?? [])
        .filter((m) => m.role === role)
        .map((m) => m.content)
        .join("\n");
    const [min, max] = opts.delayMs ?? [0, 0];
    if (max > 0) {
      let hungUp = false;
      res.on("close", () => {
        if (!res.writableEnded) hungUp = true;
      });
      await new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
      if (hungUp || res.destroyed) {
        stats.abandoned++;
        return;
      }
    }
    const call = {
      task,
      system: [{ text: text("system") }],
      user: [{ text: text("user") }],
      schema: z.any(),
      schemaName,
      expectTokens: 0,
    } as unknown as StructuredCall<unknown>;
    const answer = await FAKE_ANSWERS[task]?.(call, { guildId: "mock" } satisfies CallScope);
    const content = JSON.stringify(answer ?? {});
    stats.answered++;
    stats.byTask[task] = (stats.byTask[task] ?? 0) + 1;
    res.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({
        model: request.model ?? "mock",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
        usage: {
          prompt_tokens: Math.ceil((text("system").length + text("user").length) / 4),
          completion_tokens: Math.ceil(content.length / 4),
        },
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/v1`,
    stats,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
