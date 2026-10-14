import type { LlmGateway } from "@dq/core/llm";
import type { Db } from "@dq/db";
import type { WorldCache } from "./world-cache";

export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

export const consoleLogger: Logger = {
  info: (msg, data) => console.log(msg, data ?? ""),
  warn: (msg, data) => console.warn(msg, data ?? ""),
  error: (msg, data) => console.error(msg, data ?? ""),
};

export const silentLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} };

export interface EngineDeps {
  db: Db;
  worlds: WorldCache;
  llm: LlmGateway;
  log?: Logger;
  now?: () => Date;
}

export class GameError extends Error {
  constructor(
    message: string,
    /** Safe to show to the player. */
    readonly userMessage: string = message,
  ) {
    super(message);
  }
}
