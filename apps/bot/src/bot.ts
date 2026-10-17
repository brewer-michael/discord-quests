import { guilds } from "@dq/db";
import { paceOf } from "@dq/engine";
import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  type Guild,
  Partials,
  PermissionFlagsBits,
  type TextChannel,
} from "discord.js";
import { eq, notInArray } from "drizzle-orm";
import type { BotContext } from "./context";
import { armRound } from "./flows";
import { rewindMention } from "./handlers/rewind";
import { renderWelcome } from "./render/guide";
import { route } from "./router";

/**
 * A Discord client wired to the engine. Guilds, plus guild messages so a mention of the bot in the DM room
 * (a rewind request) reaches it. Not the Message Content intent: Discord shares a message's text with a bot
 * only when the message mentions it, and those are the only messages read.
 */
export function createClient(): Client {
  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    partials: [Partials.Channel],
  });
}

/** Lets the setup page show which servers the bot is in. Returns true when the bot has just arrived. */
async function markPresent(ctx: BotContext, g: Pick<Guild, "id" | "name">): Promise<boolean> {
  const [before] = await ctx.engine.deps.db
    .select({ botPresent: guilds.botPresent })
    .from(guilds)
    .where(eq(guilds.id, g.id));
  await ctx.engine.deps.db
    .insert(guilds)
    .values({ id: g.id, name: g.name, botPresent: true })
    .onConflictDoUpdate({
      target: guilds.id,
      set: { name: g.name, botPresent: true, updatedAt: new Date() },
    });
  return !before?.botPresent;
}

/** Where to say hello: the server's system channel, else the first room the bot may post in. */
export function welcomeChannel(guild: Guild): TextChannel | null {
  const me = guild.members.me;
  if (!me) return null;
  const canPost = (c: TextChannel | null | undefined): c is TextChannel =>
    Boolean(
      c
        ?.permissionsFor(me)
        .has([
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
        ]),
    );
  const system = guild.systemChannel;
  if (system?.type === ChannelType.GuildText && canPost(system)) return system;
  const rooms = [...guild.channels.cache.values()]
    .filter((c): c is TextChannel => c.type === ChannelType.GuildText)
    .sort((a, b) => a.rawPosition - b.rawPosition);
  return rooms.find(canPost) ?? null;
}

/** Once, when the bot joins a server: what it needs (two rooms) and where the guide is. */
async function welcome(ctx: BotContext, guild: Guild) {
  const message = renderWelcome(ctx.env.WEB_BASE_URL);
  const room = welcomeChannel(guild);
  if (room) {
    await room.send(message as never);
    return;
  }
  const owner = await guild.fetchOwner().catch(() => null);
  await owner?.send(message as never).catch(() => {});
}

export function wire(ctx: BotContext) {
  ctx.client.on(Events.InteractionCreate, (i) => {
    void route(ctx, i);
  });
  ctx.client.on(Events.MessageCreate, (m) => {
    void rewindMention(ctx, m).catch((e: Error) =>
      ctx.log.warn("rewind mention failed", { channelId: m.channelId, error: e.message }),
    );
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
    // Bring back deadlines and reminders that were waiting before a restart.
    for (const { round, campaign } of await ctx.engine.turns.openRounds()) {
      if (campaign.threadId)
        armRound(ctx, round, paceOf(campaign.settings as Record<string, unknown>), campaign.threadId);
    }
  });
  ctx.client.on(Events.GuildCreate, (g) => {
    void (async () => {
      const arrived = await markPresent(ctx, g);
      // Only for a real new invite, not a server coming back online.
      if (arrived && Date.now() - (g.joinedTimestamp ?? 0) < 10 * 60_000) await welcome(ctx, g);
    })().catch((e: Error) => ctx.log.warn("welcome failed", { guildId: g.id, error: e.message }));
  });
  ctx.client.on(Events.GuildDelete, (g) => {
    void ctx.engine.deps.db
      .update(guilds)
      .set({ botPresent: false, updatedAt: new Date() })
      .where(eq(guilds.id, g.id))
      .catch(() => {});
  });
  ctx.client.on(Events.Error, (e) => ctx.log.error("discord client error", { error: e.message }));
}
