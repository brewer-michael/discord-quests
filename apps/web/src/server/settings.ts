import { type DbOrTx, guilds } from "@dq/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { audit } from "./audit";
import { ensureGuild } from "./providers";

/** Defaults for new campaigns on this server. Each campaign can still change its own. */
export const GameDefaults = z.object({
  imagePolicy: z.enum(["new_scenes", "cruxes_only", "off"]),
  epilogueStyle: z.enum(["subtle", "explicit", "off"]),
  roundTimerSeconds: z.coerce.number().int().min(60).max(86_400),
  loomMode: z.enum(["auto", "off"]),
});
export type GameDefaults = z.infer<typeof GameDefaults>;

export const DEFAULT_GAME: GameDefaults = {
  imagePolicy: "new_scenes",
  epilogueStyle: "subtle",
  roundTimerSeconds: 180,
  loomMode: "auto",
};

const optionalNumber = (max: number, int = false) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : null),
    (int ? z.number().int() : z.number()).min(0).max(max).nullable(),
  );

export const SettingsForm = z.object({
  usePlatformDefaults: z.preprocess((v) => v === "on", z.boolean()),
  dailyBudgetUsd: optionalNumber(10_000),
  dailyImageCap: optionalNumber(10_000, true),
  imagePolicy: GameDefaults.shape.imagePolicy,
  epilogueStyle: GameDefaults.shape.epilogueStyle,
  roundTimerSeconds: GameDefaults.shape.roundTimerSeconds,
  loomMode: GameDefaults.shape.loomMode,
});

export interface ServerSettings {
  usePlatformDefaults: boolean;
  dailyBudgetUsd: number | null;
  dailyImageCap: number | null;
  game: GameDefaults;
}

export async function serverSettings(db: DbOrTx, guildId: string): Promise<ServerSettings> {
  const [g] = await db.select().from(guilds).where(eq(guilds.id, guildId));
  const s = (g?.settings ?? {}) as Record<string, unknown>;
  const game = GameDefaults.safeParse({ ...DEFAULT_GAME, ...((s.gameDefaults as object) ?? {}) });
  return {
    usePlatformDefaults: s.usePlatformDefaults !== false,
    dailyBudgetUsd: typeof s.dailyBudgetUsd === "number" ? s.dailyBudgetUsd : null,
    dailyImageCap: typeof s.dailyImageCap === "number" ? s.dailyImageCap : null,
    game: game.success ? game.data : DEFAULT_GAME,
  };
}

export async function saveServerSettings(
  db: DbOrTx,
  args: { guild: { id: string; name: string }; userId: string; fd: FormData },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = SettingsForm.safeParse(Object.fromEntries(args.fd.entries()));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { ok: false, error: `${i?.path.join(".")}: ${i?.message}` };
  }
  const v = parsed.data;
  return db.transaction(async (tx) => {
    await ensureGuild(tx, args.guild);
    const [g] = await tx.select().from(guilds).where(eq(guilds.id, args.guild.id)).for("update");
    const next = {
      ...((g?.settings ?? {}) as Record<string, unknown>),
      usePlatformDefaults: v.usePlatformDefaults,
      dailyBudgetUsd: v.dailyBudgetUsd,
      dailyImageCap: v.dailyImageCap,
      gameDefaults: {
        imagePolicy: v.imagePolicy,
        epilogueStyle: v.epilogueStyle,
        roundTimerSeconds: v.roundTimerSeconds,
        loomMode: v.loomMode,
      },
    };
    await tx
      .update(guilds)
      .set({ settings: next, updatedAt: new Date() })
      .where(eq(guilds.id, args.guild.id));
    await audit(tx, {
      guildId: args.guild.id,
      userId: args.userId,
      action: "settings.update",
      detail: {
        usePlatformDefaults: v.usePlatformDefaults,
        dailyBudgetUsd: v.dailyBudgetUsd,
        dailyImageCap: v.dailyImageCap,
      },
    });
    return { ok: true as const };
  });
}
