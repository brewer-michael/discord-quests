import type { LlmGateway } from "@dq/core/llm";
import { deriveRng, type Rng, trueRng } from "@dq/core/rng";
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

/**
 * Where the dice come from: one set per campaign, turn and purpose ("combat", a hero's check). Rolls are saved
 * with the turn they belong to. A round that fails before it's saved rolls again, but nobody saw the first roll.
 */
export type Dice = (campaignSeed: string, turnSeq: number, purpose: string) => Rng;

/** Real dice, rolled fresh every time. What the game plays with. */
export const realDice: Dice = () => trueRng();

/** Dice that replay exactly from the campaign's seed, for tests and simulations. */
export const seededDice: Dice = (campaignSeed, turnSeq, purpose) =>
  deriveRng(campaignSeed, "rules", turnSeq, purpose);

export interface EngineDeps {
  db: Db;
  worlds: WorldCache;
  llm: LlmGateway;
  log?: Logger;
  now?: () => Date;
  /** Real dice unless a test passes seeded ones. */
  dice?: Dice;
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
