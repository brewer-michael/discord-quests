import { GameError } from "@dq/engine";
import {
  type ButtonInteraction,
  ChannelType,
  type ChatInputCommandInteraction,
  ThreadAutoArchiveDuration,
} from "discord.js";
import type { BotContext } from "../context";
import { postTurn, sendableChannel } from "../flows";
import { renderHub } from "../render/hub";
import { campaignHere, refreshHub, say } from "./shared";

export async function campaignNew(ctx: BotContext, i: ChatInputCommandInteraction) {
  const channel = i.channel;
  if (!i.guildId || !channel || channel.type !== ChannelType.GuildText) {
    throw new GameError(
      "bad channel",
      "Use `/campaign new` in a regular text channel. I'll make a thread for the adventure.",
    );
  }
  await i.deferReply({ flags: ["Ephemeral"] });
  const mode = (i.options.getString("storyteller") ?? "ai_dm") as "ai_dm" | "assist";
  const audience = (i.options.getString("audience") ?? "family") as "family" | "teen";
  const dm = i.options.getUser("dm");
  if (mode === "assist" && !dm)
    throw new GameError("no dm", "Pick the human DM with the `dm` option, or let the bot tell the story.");
  const name = i.options.getString("name", true);
  const c = await ctx.engine.campaigns.create({
    guildId: i.guildId,
    guildName: i.guild?.name ?? "",
    channelId: channel.id,
    name,
    mode,
    createdBy: i.user.id,
    dmUserId: dm?.id ?? null,
    settings: { audience },
  });
  const thread = await channel.threads.create({
    name: `🏮 ${name}`.slice(0, 100),
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
    reason: "New Discord Quests campaign",
  });
  let dmThreadId: string | null = null;
  if (mode === "assist" && dm) {
    const screen = await channel.threads.create({
      name: `DM screen: ${name}`.slice(0, 100),
      type: ChannelType.PrivateThread,
      invitable: false,
      reason: "Private DM screen",
    });
    await screen.members.add(dm.id).catch(() => {});
    dmThreadId = screen.id;
    await screen.send(
      "This private thread is your DM screen. Drafts of each turn will appear here for you to approve, edit or redo.",
    );
  }
  await ctx.engine.campaigns.setThreads(c.id, thread.id, dmThreadId);
  const { index } = ctx.worlds.get(c.worldId);
  const hub = await thread.send(
    renderHub({
      campaignId: c.id,
      name: c.name,
      worldName: index.world.meta.name,
      tagline: index.world.meta.tagline,
      mode,
      dmUserId: dm?.id ?? null,
      status: "setup",
      audience,
      heroes: [],
    }) as never,
  );
  await hub.pin().catch(() => {});
  await ctx.engine.campaigns.updateSettings(c.id, { hubMessageId: hub.id });
  await thread.members.add(i.user.id).catch(() => {});
  await i.editReply({
    content: `Your adventure begins in ${thread.toString()}. Invite your friends to press **Join** there!`,
  });
}

export async function campaignJoin(
  ctx: BotContext,
  i: ChatInputCommandInteraction | ButtonInteraction,
  campaignId?: string,
) {
  const c = campaignId ? await ctx.engine.campaigns.require(campaignId) : await campaignHere(ctx, i);
  await ctx.engine.campaigns.join(c.id, i.user.id);
  await say(i, "You've joined! Press **Make my hero** (or use `/character create`) to build your hero.");
  await refreshHub(ctx, c.id);
}

export async function campaignStart(
  ctx: BotContext,
  i: ChatInputCommandInteraction | ButtonInteraction,
  campaignId?: string,
) {
  const c = campaignId ? await ctx.engine.campaigns.require(campaignId) : await campaignHere(ctx, i);
  await i.deferReply({ flags: ["Ephemeral"] });
  const view = await ctx.engine.turns.openCampaign(c.id, i.user.id);
  const ch = await sendableChannel(ctx, c.threadId);
  if (ch) await postTurn(ctx, ch, view);
  await i.editReply({ content: "The adventure has begun! 🏮" });
  await refreshHub(ctx, c.id);
}

export async function campaignCommand(ctx: BotContext, i: ChatInputCommandInteraction) {
  const sub = i.options.getSubcommand();
  if (sub === "new") return campaignNew(ctx, i);
  if (sub === "join") return campaignJoin(ctx, i);
  if (sub === "start") return campaignStart(ctx, i);
  const c = await campaignHere(ctx, i);
  switch (sub) {
    case "leave":
      await ctx.engine.campaigns.leave(c.id, i.user.id);
      await say(i, "You've left this campaign. Your hero waves goodbye.");
      await refreshHub(ctx, c.id);
      return;
    case "status": {
      const s = await ctx.engine.campaigns.status(c.id);
      await say(
        i,
        [
          `**${s.campaign.name}** · ${s.worldName}`,
          `Status: ${s.campaign.status} · Now in: ${s.regionName}${s.chapter ? ` · ${s.chapter}` : ""}`,
          `Heroes: ${s.party.map((p) => `${p.name || "(unnamed)"} (level ${p.level}${p.ready ? "" : ", still being made"})`).join(", ") || "none yet"}`,
          s.quests.length ? `Quests: ${s.quests.map((q) => q.title).join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
      return;
    }
    case "pause":
    case "resume":
    case "end":
      await ctx.engine.campaigns.setStatus(
        c.id,
        i.user.id,
        sub === "pause" ? "paused" : sub === "resume" ? "active" : "ended",
      );
      await say(
        i,
        sub === "pause"
          ? "Adventure paused. Use `/campaign resume` to pick it back up."
          : sub === "resume"
            ? "Welcome back! The story continues."
            : "The adventure has ended. Thank you for playing!",
      );
      await refreshHub(ctx, c.id);
      return;
    case "delete": {
      if (!i.options.getBoolean("confirm", true)) {
        await say(i, "Nothing deleted.");
        return;
      }
      await ctx.engine.campaigns.purge(c.id, i.user.id);
      await say(i, "This campaign and its history have been permanently deleted.");
      const thread = i.channel;
      if (thread?.isThread()) await thread.setArchived(true).catch(() => {});
      return;
    }
  }
}
