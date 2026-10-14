import type { Logger } from "./deps";

const SECRET_KEY = /(key|token|secret|password|authorization|cookie|ciphertext)/i;
const SECRET_VALUE =
  /\b(sk|pk|rk|xai|gsk|r8|fal|ghp|xox[abp])[-_][A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/-]{12,}=*/g;

/** Keeps API keys and tokens out of the logs, however they turn up. */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.replace(SECRET_VALUE, "[redacted]");
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redact(value.message, depth + 1) };
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1),
    ]),
  );
}

/**
 * One JSON object per line (time, level, message, data) for log collectors,
 * or readable lines while developing. Secrets are always redacted.
 */
export function createLogger(
  opts: {
    format?: "json" | "pretty";
    service?: string;
    write?: (line: string, level: "info" | "warn" | "error") => void;
  } = {},
): Logger {
  const format = opts.format ?? (process.env.NODE_ENV === "production" ? "json" : "pretty");
  const write =
    opts.write ??
    ((line: string, level: "info" | "warn" | "error") =>
      (level === "info" ? process.stdout : process.stderr).write(`${line}\n`));
  const emit = (level: "info" | "warn" | "error") => (msg: string, data?: Record<string, unknown>) => {
    const clean = data ? (redact(data) as Record<string, unknown>) : undefined;
    if (format === "json") {
      write(
        JSON.stringify({
          time: new Date().toISOString(),
          level,
          ...(opts.service ? { service: opts.service } : {}),
          msg: redact(msg),
          ...clean,
        }),
        level,
      );
    } else {
      const extra = clean && Object.keys(clean).length > 0 ? ` ${JSON.stringify(clean)}` : "";
      write(
        `${new Date().toISOString().slice(11, 19)} ${level.toUpperCase().padEnd(5)} ${redact(msg)}${extra}`,
        level,
      );
    }
  };
  return { info: emit("info"), warn: emit("warn"), error: emit("error") };
}
