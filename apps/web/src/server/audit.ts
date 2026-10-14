import { auditLog, type DbOrTx } from "@dq/db";
import { desc, eq } from "drizzle-orm";

export interface AuditEntry {
  guildId: string | null;
  userId: string;
  action: string;
  target?: string | null;
  detail?: Record<string, unknown>;
}

/** Every change made on the setup page is recorded: who, what and when. Never secrets. */
export async function audit(db: DbOrTx, e: AuditEntry) {
  await db.insert(auditLog).values({
    guildId: e.guildId,
    userId: e.userId,
    action: e.action,
    target: e.target ?? null,
    detail: e.detail ?? {},
  });
}

export async function recentAudit(db: DbOrTx, guildId: string, limit = 100) {
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.guildId, guildId))
    .orderBy(desc(auditLog.at))
    .limit(limit);
}
