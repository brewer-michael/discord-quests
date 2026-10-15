import { type DbOrTx, guilds } from "@dq/db";
import { timerFitsPace, validTimer } from "@dq/engine/pace";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { audit } from "./audit";
import { ensureGuild } from "./providers";

/**
 * Defaults for new campaigns on this server. Each campaign can still change its own. Left unset, the turn timer
 * and pings follow the pace (3 minutes and no pings at game night, a day and pings by post).
 */
export const GameDefaults = z.object({
  imagePolicy: z.enum(["new_scenes", "cruxes_only", "off"]),
  epilogueStyle: z.enum(["subtle", "explicit", "off"]),
  roundTimerSeconds: z.number().refine(validTimer, "Pick a time from the list").optional(),
  loomMode: z.enum(["auto", "off"]),
  pace: z.enum(["live", "post"]),
  pingPlayers: z.boolean().optional(),
});
export type GameDefaults = z.infer<typeof GameDefaults>;

export const DEFAULT_GAME: GameDefaults = {
  imagePolicy: "new_scenes",
  epilogueStyle: "subtle",
  loomMode: "auto",
  pace: "live",
};

const optionalNumber = (max: number, int = false) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : null),
    (int ? z.number().int() : z.number()).min(0).max(max).nullable(),
  );

export const SettingsForm = z
  .object({
    usePlatformDefaults: z.preprocess((v) => v === "on", z.boolean()),
    dailyBudgetUsd: optionalNumber(10_000),
    dailyImageCap: optionalNumber(10_000, true),
    imagePolicy: GameDefaults.shape.imagePolicy,
    epilogueStyle: GameDefaults.shape.epilogueStyle,
    roundTimerSeconds: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : Number(v)),
      GameDefaults.shape.roundTimerSeconds,
    ),
    loomMode: GameDefaults.shape.loomMode,
    pace: GameDefaults.shape.pace,
    pingPlayers: z.preprocess(
      (v) => (v === "on" ? true : v === "off" ? false : undefined),
      z.boolean().optional(),
    ),
  })
  .superRefine((v, ctx) => {
    if (v.roundTimerSeconds !== undefined && !timerFitsPace(v.pace, v.roundTimerSeconds))
      ctx.addIssue({
        code: "custom",
        path: ["roundTimerSeconds"],
        message:
          v.pace === "post"
            ? "Play by post needs 12 hours or more per turn, or no limit"
            : "Game night turns are 10 minutes or less, or no limit",
      });
  });

export interface ServerSettings {
  usePlatformDefaults: boolean;
  dailyBudgetUsd: number | null;
  dailyImageCap: number | null;
  game: GameDefaults;
  /** The table room and DM room chosen in Discord with /setup. */
  rooms: { table?: { id: string; name: string }; dm?: { id: string; name: string } };
}

export async function serverSettings(db: DbOrTx, guildId: string): Promise<ServerSettings> {
  const [g] = await db.select().from(guilds).where(eq(guilds.id, guildId));
  const s = (g?.settings ?? {}) as Record<string, unknown>;
  const parsed = GameDefaults.safeParse({ ...DEFAULT_GAME, ...((s.gameDefaults as object) ?? {}) });
  const game = parsed.success ? parsed.data : DEFAULT_GAME;
  // Older setup pages saved a timer whatever the pace ("play by post, 3 minutes"); new campaigns ignore it.
  if (game.roundTimerSeconds !== undefined && !timerFitsPace(game.pace, game.roundTimerSeconds))
    delete game.roundTimerSeconds;
  return {
    usePlatformDefaults: s.usePlatformDefaults !== false,
    dailyBudgetUsd: typeof s.dailyBudgetUsd === "number" ? s.dailyBudgetUsd : null,
    dailyImageCap: typeof s.dailyImageCap === "number" ? s.dailyImageCap : null,
    game,
    rooms: (s.rooms as ServerSettings["rooms"] | undefined) ?? {},
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
        loomMode: v.loomMode,
        pace: v.pace,
        ...(v.roundTimerSeconds !== undefined ? { roundTimerSeconds: v.roundTimerSeconds } : {}),
        ...(v.pingPlayers !== undefined ? { pingPlayers: v.pingPlayers } : {}),
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
