import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import type { BotContext } from "./context";
import { scheduleRound } from "./flows";
import { route } from "./router";

/** A Discord client wired to the engine. Only the Guilds intent: no message content is read. */
export function createClient(): Client {
  return new Client({ intents: [GatewayIntentBits.Guilds], partials: [Partials.Channel] });
}

export function wire(ctx: BotContext) {
  ctx.client.on(Events.InteractionCreate, (i) => {
    void route(ctx, i);
  });
  ctx.client.once(Events.ClientReady, async (c) => {
    ctx.log.info(`Logged in as ${c.user.tag} in ${c.guilds.cache.size} servers`);
    // Bring back round timers that were running before a restart.
    for (const { round, campaign } of await ctx.engine.turns.openTimedRounds()) {
      if (round.deadlineAt && campaign.threadId)
        scheduleRound(ctx, round.id, round.deadlineAt, campaign.threadId);
    }
  });
  ctx.client.on(Events.Error, (e) => ctx.log.error("discord client error", { error: e.message }));
}
