import type { Engine, Logger, WorldCache } from "@dq/engine";
import type { ImageService } from "@dq/providers";
import type { Client } from "discord.js";
import type { BotEnv } from "./env";
import type { RoundScheduler } from "./scheduler";

export interface BotContext {
  engine: Engine;
  images: ImageService | null;
  worlds: WorldCache;
  client: Client;
  scheduler: RoundScheduler;
  log: Logger;
  env: Pick<BotEnv, "WEB_BASE_URL" | "ANTHROPIC_API_KEY" | "OPENAI_API_KEY" | "GEMINI_API_KEY">;
  /** Rounds this process is resolving right now. */
  resolving: Set<string>;
}
