/**
 * Story settings in Discord: the "Shape your adventure" card after /campaign new, and /campaign story to see or
 * change them later. The engine decides who may change what (host, DM or guardian; only a guardian picks Epic
 * on a family campaign) and checks what the table types.
 */
import { describeProfile, parseTopics, type StoryProfile } from "@dq/core/narration";
import { audienceOf, GameError } from "@dq/engine";
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from "discord.js";
import type { BotContext } from "../context";
import type { StoryAction } from "../ids";
import { renderStoryCard, renderStoryDone, type StoryCardInfo, storyModal } from "../render/story";
import { refreshHub, say } from "./shared";

async function cardInfo(ctx: BotContext, campaignId: string, problem?: string): Promise<StoryCardInfo> {
  const c = await ctx.engine.campaigns.require(campaignId);
  const s = await ctx.engine.campaigns.storyFor(campaignId);
  return {
    campaignId,
    campaignName: c.name,
    profile: s.profile,
    told: s.story.intensity,
    audience: audienceOf(c),
    ...(problem ? { problem } : {}),
  };
}

/** The card itself, for the host right after /campaign new. */
export async function storyCard(ctx: BotContext, campaignId: string) {
  return renderStoryCard(await cardInfo(ctx, campaignId));
}

/** Changes the settings, turning a refusal into a line on the card rather than an error. */
async function change(ctx: BotContext, campaignId: string, userId: string, patch: Partial<StoryProfile>) {
  try {
    await ctx.engine.campaigns.setStory(campaignId, userId, patch);
    await refreshHub(ctx, campaignId);
    return undefined;
  } catch (e) {
    if (e instanceof GameError) return e.userMessage;
    throw e;
  }
}

export async function storyCommand(ctx: BotContext, i: ChatInputCommandInteraction, c: { id: string }) {
  const patch: Partial<StoryProfile> = {};
  const intensity = i.options.getString("intensity");
  const voice = i.options.getString("voice");
  const humor = i.options.getString("humor");
  const length = i.options.getString("length");
  if (intensity) patch.intensity = intensity as StoryProfile["intensity"];
  if (length) patch.length = length as StoryProfile["length"];
  if (voice) patch.voice = voice as StoryProfile["voice"];
  if (humor) patch.humor = humor as StoryProfile["humor"];
  const premise = i.options.getString("premise");
  if (premise !== null) patch.premise = premise;
  if (Object.keys(patch).length > 0) {
    const problem = await change(ctx, c.id, i.user.id, patch);
    if (problem && !(await ctx.engine.campaigns.canSupervise(c.id, i.user.id))) {
      await say(i, problem);
      return;
    }
    // Show the whole card afterwards, so the rest (pictures, topics) is a click away.
    await i.reply(renderStoryCard(await cardInfo(ctx, c.id, problem)) as never);
    return;
  }
  if (!(await ctx.engine.campaigns.canSupervise(c.id, i.user.id))) {
    const s = await ctx.engine.campaigns.storyFor(c.id);
    await say(
      i,
      `This story is told at: ${describeProfile(s.profile, s.story.intensity)}. The host, the DM or a guardian can change it.`,
    );
    return;
  }
  await i.reply(renderStoryCard(await cardInfo(ctx, c.id)) as never);
}

export async function storyInteraction(
  ctx: BotContext,
  i: ButtonInteraction | StringSelectMenuInteraction,
  id: { campaignId: string; action: StoryAction },
) {
  if (id.action === "wishes") {
    if (!i.isButton()) return;
    const s = await ctx.engine.campaigns.storyFor(id.campaignId);
    await i.showModal(storyModal(id.campaignId, s.profile));
    return;
  }
  if (id.action === "done") {
    await i.update(renderStoryDone(await cardInfo(ctx, id.campaignId)) as never);
    return;
  }
  if (!i.isStringSelectMenu()) return;
  const problem = await change(ctx, id.campaignId, i.user.id, { [id.action]: i.values[0] });
  await i.update(renderStoryCard(await cardInfo(ctx, id.campaignId, problem)) as never);
}

export async function storyModalSubmit(ctx: BotContext, i: ModalSubmitInteraction, campaignId: string) {
  const current = (await ctx.engine.campaigns.storyFor(campaignId)).profile;
  const field = (name: string) => i.fields.getTextInputValue(name) ?? "";
  const art = field("art").trim();
  const problem = await change(ctx, campaignId, i.user.id, {
    premise: field("premise"),
    lines: parseTopics(field("lines")),
    veils: parseTopics(field("veils")),
    artCustom: art,
    // Writing a style switches to it; clearing it goes back to classic book illustration.
    art: art ? "custom" : current.art === "custom" ? "book" : current.art,
  });
  const card = renderStoryCard(await cardInfo(ctx, campaignId, problem));
  if (i.isFromMessage()) await i.update(card as never);
  else await i.reply(card as never);
}
