import { guilds } from "@dq/db";
import { Client, Events, GatewayIntentBits, type Guild, Partials } from "discord.js";
import { eq, notInArray } from "drizzle-orm";
import type { BotContext } from "./context";
import { scheduleRound } from "./flows";
import { route } from "./router";

/** A Discord client wired to the engine. Only the Guilds intent: no message content is read. */
export function createClient(): Client {
  return new Client({ intents: [GatewayIntentBits.Guilds], partials: [Partials.Channel] });
}

/** Lets the setup page show which servers the bot is in. */
async function markPresent(ctx: BotContext, g: Pick<Guild, "id" | "name">) {
  await ctx.engine.deps.db
    .insert(guilds)
    .values({ id: g.id, name: g.name, botPresent: true })
    .onConflictDoUpdate({
      target: guilds.id,
      set: { name: g.name, botPresent: true, updatedAt: new Date() },
    });
}

export function wire(ctx: BotContext) {
  ctx.client.on(Events.InteractionCreate, (i) => {
    void route(ctx, i);
  });
  ctx.client.once(Events.ClientReady, async (c) => {
    ctx.log.info(`Logged in as ${c.user.tag} in ${c.guilds.cache.size} servers`);
    const here = [...c.guilds.cache.values()];
    for (const g of here) await markPresent(ctx, g).catch(() => {});
    await ctx.engine.deps.db
      .update(guilds)
      .set({ botPresent: false })
      .where(
        here.length > 0
          ? notInArray(
              guilds.id,
              here.map((g) => g.id),
            )
          : undefined,
      )
      .catch(() => {});
    // Bring back round timers that were running before a restart.
    for (const { round, campaign } of await ctx.engine.turns.openTimedRounds()) {
      if (round.deadlineAt && campaign.threadId)
        scheduleRound(ctx, round.id, round.deadlineAt, campaign.threadId);
    }
  });
  ctx.client.on(Events.GuildCreate, (g) => void markPresent(ctx, g).catch(() => {}));
  ctx.client.on(Events.GuildDelete, (g) => {
    void ctx.engine.deps.db
      .update(guilds)
      .set({ botPresent: false, updatedAt: new Date() })
      .where(eq(guilds.id, g.id))
      .catch(() => {});
  });
  ctx.client.on(Events.Error, (e) => ctx.log.error("discord client error", { error: e.message }));
}
