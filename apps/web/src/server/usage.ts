import { type DbOrTx, usageDaily, usageLedger } from "@dq/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";

export interface DayUsage {
  day: string;
  usd: number;
  tokens: number;
  images: number;
}

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** The last `days` days, oldest first, with empty days filled in. */
export async function dailyUsage(
  db: DbOrTx,
  guildId: string,
  days = 30,
  now = new Date(),
): Promise<DayUsage[]> {
  const from = new Date(now.getTime() - (days - 1) * 86_400_000);
  const rows = await db
    .select()
    .from(usageDaily)
    .where(and(eq(usageDaily.guildId, guildId), gte(usageDaily.day, isoDay(from))));
  const byDay = new Map(rows.map((r) => [String(r.day).slice(0, 10), r]));
  return Array.from({ length: days }, (_, i) => {
    const day = isoDay(new Date(from.getTime() + i * 86_400_000));
    const r = byDay.get(day);
    return { day, usd: (r?.costMicros ?? 0) / 1e6, tokens: r?.tokens ?? 0, images: r?.images ?? 0 };
  });
}

/** Spending by job and model over the last week. */
export async function usageBreakdown(db: DbOrTx, guildId: string, now = new Date()) {
  const since = new Date(now.getTime() - 7 * 86_400_000);
  return db
    .select({
      task: usageLedger.task,
      model: usageLedger.model,
      calls: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${usageLedger.inputTokens} + ${usageLedger.outputTokens}), 0)::bigint`,
      images: sql<number>`coalesce(sum(${usageLedger.images}), 0)::int`,
      usd: sql<number>`coalesce(sum(${usageLedger.costMicros}), 0)::float8 / 1e6`,
      fellBack: sql<number>`count(*) filter (where ${usageLedger.fellBack})::int`,
    })
    .from(usageLedger)
    .where(and(eq(usageLedger.guildId, guildId), gte(usageLedger.createdAt, since)))
    .groupBy(usageLedger.task, usageLedger.model)
    .orderBy(desc(sql`4`));
}
