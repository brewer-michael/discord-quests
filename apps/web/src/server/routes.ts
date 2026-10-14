import { type DbOrTx, providerConfigs, taskRoutes } from "@dq/db";
import type { RouteTask } from "@dq/providers";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { audit } from "./audit";
import { ALL_TASKS, EFFORTS } from "./tasks";

export interface RouteRow {
  providerId: string;
  model: string;
  effort: (typeof EFFORTS)[number] | null;
}

/** The server's routes for every task, best first (campaign-specific routes aren't edited here). */
export async function guildRoutes(db: DbOrTx, guildId: string): Promise<Record<RouteTask, RouteRow[]>> {
  const rows = await db
    .select()
    .from(taskRoutes)
    .where(and(eq(taskRoutes.guildId, guildId), isNull(taskRoutes.campaignId)))
    .orderBy(taskRoutes.priority);
  const out = Object.fromEntries(ALL_TASKS.map((t) => [t, [] as RouteRow[]])) as Record<
    RouteTask,
    RouteRow[]
  >;
  for (const r of rows) {
    const list = out[r.task as RouteTask];
    if (!list) continue;
    const effort = (r.params as { effort?: string }).effort;
    list.push({
      providerId: r.providerConfigId,
      model: r.model,
      effort: (EFFORTS as readonly string[]).includes(effort ?? "") ? (effort as RouteRow["effort"]) : null,
    });
  }
  return out;
}

const Row = z.object({
  providerId: z.string().uuid(),
  model: z.string().trim().min(1, "Choose a model").max(150),
  effort: z.enum(EFFORTS).nullable(),
});

/** Reads "providerId.0", "model.0", "effort.0", … from the routing form. Empty slots are skipped. */
export function parseRouteForm(fd: FormData): { ok: true; rows: RouteRow[] } | { ok: false; error: string } {
  const rows: RouteRow[] = [];
  for (let i = 0; i < 3; i++) {
    const providerId = String(fd.get(`providerId.${i}`) ?? "");
    if (!providerId) continue;
    const effort = String(fd.get(`effort.${i}`) ?? "");
    const parsed = Row.safeParse({ providerId, model: fd.get(`model.${i}`) ?? "", effort: effort || null });
    if (!parsed.success) return { ok: false, error: `Choice ${i + 1}: ${parsed.error.issues[0]?.message}` };
    rows.push(parsed.data);
  }
  return { ok: true, rows };
}

export async function saveTaskRoutes(
  db: DbOrTx,
  args: { guildId: string; userId: string; task: RouteTask; rows: RouteRow[] },
): Promise<{ ok: true } | { ok: false; error: string }> {
  return db.transaction(async (tx) => {
    const providers = await tx
      .select()
      .from(providerConfigs)
      .where(eq(providerConfigs.guildId, args.guildId));
    const wantKind = args.task === "image" ? "image" : "llm";
    for (const r of args.rows) {
      const p = providers.find((x) => x.id === r.providerId);
      if (!p) return { ok: false as const, error: "That provider isn't set up on this server" };
      if (p.kind !== wantKind)
        return {
          ok: false as const,
          error:
            wantKind === "image" ? "Scene art needs a picture service" : "This job needs a story service",
        };
    }
    await tx
      .delete(taskRoutes)
      .where(
        and(
          eq(taskRoutes.guildId, args.guildId),
          isNull(taskRoutes.campaignId),
          eq(taskRoutes.task, args.task),
        ),
      );
    if (args.rows.length > 0) {
      await tx.insert(taskRoutes).values(
        args.rows.map((r, priority) => ({
          guildId: args.guildId,
          campaignId: null,
          task: args.task,
          providerConfigId: r.providerId,
          model: r.model,
          params: r.effort ? { effort: r.effort } : {},
          priority,
        })),
      );
    }
    await audit(tx, {
      guildId: args.guildId,
      userId: args.userId,
      action: "routes.update",
      target: args.task,
      detail: { routes: args.rows.map((r) => ({ providerId: r.providerId, model: r.model })) },
    });
    return { ok: true as const };
  });
}
