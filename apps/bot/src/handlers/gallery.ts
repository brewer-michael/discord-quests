/**
 * The picture gallery: every picture the campaign has, page by page, or only the ones a search finds. Browsing
 * is private to whoever asked; a picture can be shared with the table from there.
 */
import { GameError, pictureSearchWords } from "@dq/engine";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import type { BotContext } from "../context";
import { sendableChannel } from "../flows";
import { notice, V2 } from "../render/common";
import { renderGallery } from "../render/gallery";
import { renderScenePicture, sceneAttachment } from "../render/turn";

interface GalleryCampaign {
  id: string;
  name: string;
  guildId: string;
  threadId: string | null;
}

/** Edits a deferred reply: it's already private, and only the Components V2 flag may be set now. */
const asEdit = <T extends { flags?: unknown }>(payload: T) => ({ ...payload, flags: V2 });

async function galleryPage(ctx: BotContext, c: GalleryCampaign, words: string[], index: number) {
  const pictures = await ctx.engine.campaigns.findPictures(c.id, words);
  if (pictures.length === 0) return null;
  const at = Math.min(Math.max(0, index), pictures.length - 1);
  const entry = pictures[at];
  if (!entry) return null;
  const unpainted = (await ctx.engine.campaigns.sceneGallery(c.id)).filter((s) => !s.imageAssetId).length;
  const image =
    entry.imageAssetId && ctx.images ? await ctx.images.load(c.guildId, entry.imageAssetId) : null;
  const att = image ? sceneAttachment(image.bytes, image.mime) : null;
  return {
    ...renderGallery({
      campaignId: c.id,
      campaignName: c.name,
      entry,
      index: at,
      total: pictures.length,
      words,
      imageName: att?.name ?? null,
      unpainted,
    }),
    files: att ? [att.file] : [],
  };
}

export async function galleryCommand(ctx: BotContext, i: ChatInputCommandInteraction, c: GalleryCampaign) {
  const words = pictureSearchWords(i.options.getString("search"));
  // Pictures are a few megabytes: answer Discord now, then upload.
  await i.deferReply({ flags: ["Ephemeral"] });
  const page = await galleryPage(ctx, c, words, 0);
  if (!page) {
    await i.editReply(
      asEdit(
        notice(
          words.length > 0
            ? `No pictures match “${words.join(" ")}”. Try a place's name, or leave the search out to see them all.`
            : "This campaign doesn't have any pictures yet. With a picture service set up, each new place gets one, and the host or DM can run `/campaign pictures` to paint the places you've already been.",
        ),
      ) as never,
    );
    return;
  }
  await i.editReply(asEdit(page) as never);
}

export async function galleryButton(
  ctx: BotContext,
  i: ButtonInteraction,
  id: { campaignId: string; index: number; words: string[] },
) {
  const c = await ctx.engine.campaigns.require(id.campaignId);
  await i.deferUpdate();
  const page = await galleryPage(ctx, c, id.words, id.index);
  if (!page) {
    await i.editReply(
      asEdit({ ...notice("There are no pictures to show any more."), files: [], attachments: [] }) as never,
    );
    return;
  }
  // attachments: [] drops the previous page's picture; files brings this page's.
  await i.editReply(asEdit({ ...page, attachments: [] }) as never);
}

export async function galleryShare(
  ctx: BotContext,
  i: ButtonInteraction,
  campaignId: string,
  sceneId: string,
) {
  const c = await ctx.engine.campaigns.require(campaignId);
  const members = await ctx.engine.campaigns.members(c.id);
  if (!members.some((m) => m.userId === i.user.id))
    throw new GameError("not a member", "Join this campaign to share its pictures with the table.");
  await i.deferReply({ flags: ["Ephemeral"] });
  const entry = (await ctx.engine.campaigns.sceneGallery(c.id)).find((s) => s.sceneId === sceneId);
  const image =
    entry?.imageAssetId && ctx.images ? await ctx.images.load(c.guildId, entry.imageAssetId) : null;
  const thread = await sendableChannel(ctx, c.threadId);
  if (!entry || !image || !thread) {
    await i.editReply(asEdit(notice("I couldn't find that picture to share.")) as never);
    return;
  }
  const att = sceneAttachment(image.bytes, image.mime);
  await thread.send({ ...renderScenePicture(entry, att.name), files: [att.file] } as never);
  await i.editReply(asEdit(notice(`📌 Shared **${entry.title}** in the thread.`)) as never);
}
