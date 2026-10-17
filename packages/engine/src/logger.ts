import { AsyncLocalStorage } from "node:async_hooks";
import pino from "pino";
import type { Logger } from "./deps";

const SECRET_KEY = /(key|token|secret|password|authorization|cookie|ciphertext)/i;
const SECRET_VALUE =
  /\b(sk|pk|rk|xai|gsk|r8|fal|ghp|xox[abp])[-_][A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/-]{12,}=*/g;

/** Keeps API keys and tokens out of the logs, however they turn up. Counts (inputTokens) aren't secrets. */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.replace(SECRET_VALUE, "[redacted]");
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redact(value.message, depth + 1) };
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      SECRET_KEY.test(k) && typeof v !== "number" ? "[redacted]" : redact(v, depth + 1),
    ]),
  );
}

const context = new AsyncLocalStorage<Record<string, unknown>>();

/**
 * Runs `fn` with these fields (a round's id, say) added to every line logged while it runs, including lines
 * logged by the provider gateway for the AI calls it makes.
 */
export function withLogContext<T>(fields: Record<string, unknown>, fn: () => T): T {
  return context.run({ ...context.getStore(), ...fields }, fn);
}

export type LogLevel = "info" | "warn" | "error" | "silent";
type Level = Exclude<LogLevel, "silent">;

const META = new Set(["time", "level", "service", "msg"]);

/**
 * One JSON object per line (time, level, service, message, data) for log collectors, or readable lines while
 * developing. Built on pino. Secrets are always redacted. Info goes to stdout, warnings and errors to stderr.
 */
export function createLogger(
  opts: {
    format?: "json" | "pretty";
    service?: string;
    level?: LogLevel;
    write?: (line: string, level: Level) => void;
  } = {},
): Logger {
  const format = opts.format ?? (process.env.NODE_ENV === "production" ? "json" : "pretty");
  const write =
    opts.write ??
    ((line: string, level: Level) => (level === "info" ? process.stdout : process.stderr).write(`${line}\n`));
  const destination = {
    write(chunk: string) {
      const entry = JSON.parse(chunk) as Record<string, unknown>;
      const level = entry.level as Level;
      if (format === "json") {
        write(chunk.trimEnd(), level);
        return;
      }
      const data = Object.fromEntries(Object.entries(entry).filter(([k]) => !META.has(k)));
      const extra = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : "";
      write(
        `${String(entry.time).slice(11, 19)} ${level.toUpperCase().padEnd(5)} ${entry.msg}${extra}`,
        level,
      );
    },
  };
  const logger = pino(
    {
      level: opts.level ?? "info",
      base: opts.service ? { service: opts.service } : null,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      mixin: () => context.getStore() ?? {},
    },
    destination,
  );
  const emit = (level: Level) => (msg: string, data?: Record<string, unknown>) =>
    logger[level](data ? (redact(data) as Record<string, unknown>) : {}, redact(msg) as string);
  return { info: emit("info"), warn: emit("warn"), error: emit("error") };
}

/** LOG_LEVEL as a level, or undefined when it's unset or not one of them. */
export function logLevel(value: string | undefined): LogLevel | undefined {
  return value === "info" || value === "warn" || value === "error" || value === "silent" ? value : undefined;
}
