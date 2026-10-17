import { describeProfile } from "@dq/core/narration";
import { GameError, PACES, type Pace, paceOf } from "@dq/engine";
import {
  type ButtonInteraction,
  ChannelType,
  type ChatInputCommandInteraction,
  type TextChannel,
  ThreadAutoArchiveDuration,
} from "discord.js";
import type { BotContext } from "../context";
import { postDraft, postTurn, restartClock, sendableChannel, stopClock } from "../flows";
import { describePace, renderHub } from "../render/hub";
import { renderScenePicture, sceneAttachment } from "../render/turn";
import { canSeeRoom, checkRoom, fetchRoom } from "../rooms";
import { galleryCommand } from "./gallery";
import { campaignHere, refreshHub, say } from "./shared";
import { storyCard, storyCommand } from "./story";

export async function campaignNew(ctx: BotContext, i: ChatInputCommandInteraction) {
  const guild = i.guild;
  if (!i.guildId || !guild) throw new GameError("no guild", "Start campaigns in a server.");
  const rooms = await ctx.engine.campaigns.rooms(i.guildId);
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const setupHint = "Someone with Manage Server can fix this with `/setup` (or see `/help topic:setup`).";

  // The table room: the server's chosen room, or (before /setup) the channel the command was used in.
  let table: TextChannel;
  if (rooms.table) {
    const found = await fetchRoom(guild, rooms.table.id);
    if (!found)
      throw new GameError("table gone", `I can't find this server's table room any more. ${setupHint}`);
    table = found;
  } else {
    if (i.channel?.type !== ChannelType.GuildText)
      throw new GameError(
        "bad channel",
        `This server hasn't chosen a table room yet, so use \`/campaign new\` in a regular text channel. ${setupHint}`,
      );
    table = i.channel;
  }
  const tableProblems = checkRoom("table", table, me);
  if (tableProblems.length > 0)
    throw new GameError(
      "table perms",
      `I can't run a game in ${table.toString()} yet:\n${tableProblems.map((p) => `- ${p}`).join("\n")}\n${setupHint}`,
    );

  const mode = (i.options.getString("storyteller") ?? "ai_dm") as "ai_dm" | "assist";
  const audience = (i.options.getString("audience") ?? "family") as "family" | "teen";
  const place = (i.options.getString("place") ?? "thread") as "thread" | "room";
  const pace = i.options.getString("pace") as Pace | null;
  const dm = i.options.getUser("dm");
  if (mode === "assist" && !dm)
    throw new GameError("no dm", "Pick the human DM with the `dm` option, or let the bot tell the story.");

  // The DM's private screen lives in the DM room, so the DM has to be able to see it.
  let screenParent: TextChannel | null = null;
  if (mode === "assist" && dm) {
    if (rooms.dm) {
      const dmRoom = await fetchRoom(guild, rooms.dm.id);
      if (!dmRoom)
        throw new GameError("dm room gone", `I can't find this server's DM room any more. ${setupHint}`);
      const problems = checkRoom("dm", dmRoom, me);
      if (problems.length > 0)
        throw new GameError(
          "dm perms",
          `The DM room isn't ready:\n${problems.map((p) => `- ${p}`).join("\n")}\n${setupHint}`,
        );
      if (!(await canSeeRoom(guild, dmRoom, dm.id)))
        throw new GameError(
          "dm cant see",
          `${dm.toString()} can't see the DM room (${dmRoom.toString()}). Add them to it first: their private screen lives there.`,
        );
      screenParent = dmRoom;
    } else screenParent = table;
  }
  if (place === "room" && (await ctx.engine.campaigns.runningIn(table.id)))
    throw new GameError(
      "room busy",
      `A campaign is already being played right in ${table.toString()}. Start this one in its own thread instead.`,
    );

  await i.deferReply({ flags: ["Ephemeral"] });
  const name = i.options.getString("name", true);
  const c = await ctx.engine.campaigns.create({
    guildId: i.guildId,
    guildName: guild.name,
    channelId: table.id,
    name,
    mode,
    createdBy: i.user.id,
    dmUserId: dm?.id ?? null,
    settings: {
      audience,
      ...(pace
        ? { pace, roundTimerSeconds: PACES[pace].roundTimerSeconds, pingPlayers: PACES[pace].pingPlayers }
        : {}),
    },
  });
  try {
    const home =
      place === "room"
        ? table
        : await table.threads.create({
            name: `🏮 ${name}`.slice(0, 100),
            autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
            reason: "New Discord Quests campaign",
          });
    let dmThreadId: string | null = null;
    if (screenParent && dm) {
      const screen = await screenParent.threads.create({
        name: `DM screen: ${name}`.slice(0, 100),
        type: ChannelType.PrivateThread,
        invitable: false,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        reason: "Private DM screen",
      });
      await screen.members.add(dm.id).catch(() => {});
      dmThreadId = screen.id;
      await screen.send({
        content: `${dm.toString()}, this private thread is your DM screen for **${name}**. Each turn is drafted here for you to send, edit or redo before the players see it. \`/loom view\` and \`/dm say\` work here too.`,
        allowedMentions: { users: [dm.id] },
      });
    }
    await ctx.engine.campaigns.setThreads(c.id, home.id, dmThreadId);
    const { index } = ctx.worlds.get(c.worldId);
    const hub = await home.send(
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
        pace: paceOf(c.settings as Record<string, unknown>),
        story: await ctx.engine.campaigns
          .storyFor(c.id)
          .then((s) => describeProfile(s.profile, s.story.intensity)),
      }) as never,
    );
    await hub.pin().catch(() => {});
    await ctx.engine.campaigns.updateSettings(c.id, { hubMessageId: hub.id });
    if (home.isThread()) await home.members.add(i.user.id).catch(() => {});
    const where = home.isThread() ? `${home.toString()} (in ${table.toString()})` : table.toString();
    await i.editReply({
      content: [
        `Your adventure begins in ${where}. Invite your friends to press **Join** there!`,
        rooms.table
          ? ""
          : "-# Tip: someone with Manage Server can give the bot a table room and a private DM room with `/setup`.",
      ]
        .filter(Boolean)
        .join("\n"),
    });
    // Before anyone joins, the host shapes how the story will be told.
    await i.followUp((await storyCard(ctx, c.id)) as never);
  } catch (e) {
    // Don't leave a half-made campaign behind.
    await ctx.engine.campaigns.purge(c.id, i.user.id).catch(() => {});
    throw e;
  }
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
  const started = await ctx.engine.turns.startCampaign(c.id, i.user.id);
  const ch = await sendableChannel(ctx, c.threadId);
  if (started.kind === "draft") {
    // The storyteller couldn't tell the opening: a person in the DM room tells it, and the adventure starts then.
    const posted = await postDraft(ctx, started.draft);
    if (posted && ch)
      await ch
        .send({
          content:
            "-# 🕯️ A person in the DM room is telling the opening. The adventure begins as soon as they have.",
          allowedMentions: { parse: [] },
        })
        .catch(() => {});
    await i.editReply({
      content: posted
        ? "The storyteller couldn't tell the opening, so it's waiting in the DM room for you to tell."
        : "The storyteller couldn't tell the opening, and there's no DM room to hand it to. Set one up with `/setup`, then start again.",
    });
    return;
  }
  if (ch) await postTurn(ctx, ch, started.view);
  await i.editReply({ content: "The adventure has begun! 🏮" });
  await refreshHub(ctx, c.id);
}

const SAFETY_WORDS: Record<string, string> = {
  banned_word: "strong language",
  personal_info: "real-life details",
  too_long: "too long",
  hidden_leak: "story secret",
  meta_probe: "question about the game itself",
  classifier_unavailable: "safety check was offline, so it was held back",
};

/** The guardian's view: when, what kind, and who. Never the words. */
export function renderSafetyLog(
  log: Array<{ at: Date; stage: string; verdict: string; categories: string[]; userId: string | null }>,
): string {
  if (log.length === 0) return "**Safety log**\nNothing has been stopped in this campaign. 🌟";
  const lines = log.map((e) => {
    const when = `<t:${Math.floor(e.at.getTime() / 1000)}:R>`;
    if (e.stage === "xcard") return `- ${when} · someone pressed **Not this**, and the story steered away`;
    const what = [...e.categories, ...(e.verdict === "classifier_unavailable" ? [e.verdict] : [])]
      .map((c) => SAFETY_WORDS[c] ?? c.replaceAll("_", " "))
      .join(", ");
    const where = e.stage === "input" ? "typed by" : e.stage === "image" ? "picture for" : "story text near";
    return `- ${when} · ${what || e.verdict.replaceAll("_", " ")} · ${where} ${e.userId ? `<@${e.userId}>` : "the storyteller"}`;
  });
  return `**Safety log** (newest first; the words themselves are never kept)\n${lines.join("\n")}`.slice(
    0,
    1900,
  );
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
          `Story: ${s.story}`,
          `Pace: ${describePace(s.pace)}${s.deadline ? ` · this turn moves on <t:${Math.floor(s.deadline.getTime() / 1000)}:R>` : ""}`,
          s.quests.length ? `Quests: ${s.quests.map((q) => q.title).join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
      return;
    }
    case "guardian":
      await ctx.engine.campaigns.join(c.id, i.user.id, "guardian");
      await say(
        i,
        "You're watching over this table. You can `/campaign pause` and `/campaign resume` it, `/campaign safety` shows what the safety checks stopped (never the words themselves), and `/campaign story` sets how dark the story may get (on a family campaign, only a guardian can choose Epic). You can still make a hero and play too.",
      );
      return;
    case "safety": {
      const log = await ctx.engine.campaigns.safetyLog(c.id, i.user.id);
      await say(i, renderSafetyLog(log));
      return;
    }
    case "pace": {
      const pace = i.options.getString("pace") as Pace | null;
      const timer = i.options.getInteger("timer");
      const pings = i.options.getBoolean("pings");
      if (!pace && timer === null && pings === null) {
        await say(i, `This campaign plays at **${describePace(await ctx.engine.campaigns.pace(c.id))}**.`);
        return;
      }
      const next = await ctx.engine.campaigns.setPace(c.id, i.user.id, {
        ...(pace ? { pace } : {}),
        ...(timer !== null ? { roundTimerSeconds: timer } : {}),
        ...(pings !== null ? { pingPlayers: pings } : {}),
      });
      // The turn that's open now gets a fresh clock under the new pace.
      await restartClock(ctx, c.id, "new");
      await say(i, `Now playing at **${describePace(next)}**.`);
      await refreshHub(ctx, c.id);
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
      // Pausing stops the clock; resuming starts the open turn's clock afresh.
      if (sub === "pause" || sub === "end") await stopClock(ctx, c.id);
      else await restartClock(ctx, c.id, "resumed");
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
    case "pictures":
      return paintPastScenes(ctx, i, c);
    case "gallery":
      return galleryCommand(ctx, i, c);
    case "story":
      return storyCommand(ctx, i, c);
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

/** Campaigns being painted right now, so asking twice doesn't post every picture twice. */
const painting = new Set<string>();
/** Pictures per request: enough to catch up a chapter without flooding the thread (or the GPU). */
export const PICTURES_PER_REQUEST = 10;

/** Paints the scenes the story has already passed that don't have a picture yet, oldest first. */
async function paintPastScenes(
  ctx: BotContext,
  i: ChatInputCommandInteraction,
  c: { id: string; guildId: string; worldId: string; threadId: string | null },
) {
  if (!(await ctx.engine.campaigns.isHostOrDm(c.id, i.user.id)))
    throw new GameError("not host", "Only the host or the DM can ask for pictures.");
  const images = ctx.images;
  const scope = { guildId: c.guildId, campaignId: c.id };
  if (!images || !(await images.available(scope)))
    throw new GameError(
      "no images",
      "No picture service is set up for this server yet. Add one on the setup page (**Add a picture service**).",
    );
  if (painting.has(c.id)) {
    await say(i, "I'm already painting this campaign's scenes. They'll appear in the thread one by one.");
    return;
  }
  painting.add(c.id);
  let todo: Awaited<ReturnType<typeof ctx.engine.campaigns.sceneGallery>>;
  let channel: Awaited<ReturnType<typeof sendableChannel>>;
  try {
    todo = (await ctx.engine.campaigns.sceneGallery(c.id)).filter((s) => !s.imageAssetId);
    channel = todo.length > 0 ? await sendableChannel(ctx, c.threadId) : null;
  } catch (e) {
    painting.delete(c.id);
    throw e;
  }
  if (todo.length === 0 || !channel) {
    painting.delete(c.id);
    if (todo.length === 0) await say(i, "Every scene so far already has its picture.");
    else throw new GameError("no thread", "I can't find this campaign's thread any more.");
    return;
  }
  const thread = channel;
  await say(
    i,
    `Painting the scenes that don't have a picture yet, oldest first (up to ${PICTURES_PER_REQUEST} new pictures at a time). They'll appear here one by one.`,
  ).catch((e) => {
    painting.delete(c.id);
    throw e;
  });
  void (async () => {
    const { index } = ctx.worlds.get(c.worldId);
    const look = await ctx.engine.campaigns.pictureLook(c.id);
    let painted = 0;
    let reused = 0;
    let stopped = false;
    for (const scene of todo) {
      // A return visit shares the picture of the place it went back to.
      const placeAsset = await ctx.engine.campaigns.placePicture(scene.sceneId);
      if (placeAsset) {
        await ctx.engine.campaigns.setSceneImage(scene.sceneId, placeAsset);
        reused++;
        continue;
      }
      if (painted >= PICTURES_PER_REQUEST) break;
      const image = await images.sceneImage(scope, scene.brief, index.world, { look }).catch((e: Error) => {
        ctx.log.warn("scene picture failed", { campaignId: c.id, error: e.message });
        return null;
      });
      if (!image) {
        stopped = true;
        break;
      }
      await ctx.engine.campaigns.setSceneImage(scene.sceneId, image.assetId);
      if (painted === 0)
        await thread.send({ content: "🖼️ **Scenes from the story so far**", allowedMentions: { parse: [] } });
      const att = sceneAttachment(image.bytes, image.mime);
      await thread.send({ ...renderScenePicture(scene, att.name), files: [att.file] } as never);
      painted++;
    }
    const left = todo.length - painted - reused;
    const shared =
      reused > 0
        ? ` ${reused} return visit${reused === 1 ? " shares" : "s share"} a picture of a place already painted.`
        : "";
    await say(
      i,
      stopped
        ? painted === 0
          ? `I couldn't paint any new pictures.${shared} The picture service didn't answer, or today's picture limit (on the setup page) is used up.`
          : `Painted ${painted}, then stopped: the picture service didn't answer, or today's picture limit is used up.${shared}`
        : left > 0
          ? `Painted ${painted}.${shared} ${left} more to go: run \`/campaign pictures\` again.`
          : `Painted ${painted}.${shared} Every scene so far has its picture now. \`/campaign gallery\` shows them all.`,
    ).catch(() => {});
  })()
    .catch((e: Error) => ctx.log.warn("painting scenes failed", { campaignId: c.id, error: e.message }))
    .finally(() => painting.delete(c.id));
}
