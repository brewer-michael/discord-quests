/**
 * Tells the DM room what the story writer is doing. The writer service runs elsewhere and leaves its notices
 * on its jobs; the bot posts them to the campaign's DM screen, or the server's DM room, and clears them.
 */
import type { BotContext } from "./context";
import { sendableChannel } from "./flows";
import { renderWriterNotice } from "./render/writer";

const EVERY_MS = 20_000;

export function startWriterNotices(ctx: BotContext): () => void {
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    postWriterNotices(ctx)
      .catch((e) => ctx.log.warn("writer notices failed", { error: (e as Error).message }))
      .finally(() => {
        busy = false;
      });
  }, EVERY_MS);
  timer.unref();
  return () => clearInterval(timer);
}

export async function postWriterNotices(ctx: BotContext): Promise<number> {
  let posted = 0;
  for (const job of await ctx.engine.storyJobs.pendingNotices()) {
    const notice = job.notice;
    if (!notice) continue;
    const campaign = await ctx.engine.campaigns.get(job.campaignId);
    const screen = campaign
      ? ((await sendableChannel(ctx, campaign.dmThreadId)) ??
        (await sendableChannel(ctx, (await ctx.engine.campaigns.rooms(campaign.guildId)).dm?.id ?? null)))
      : null;
    if (campaign && screen) {
      try {
        await screen.send(renderWriterNotice(campaign.name, job.id, notice) as never);
        posted++;
      } catch (e) {
        // Discord is having a moment: the notice waits for the next round.
        ctx.log.warn("writer notice not posted", { jobId: job.id, error: (e as Error).message });
        continue;
      }
    } else {
      ctx.log.info("writer notice with nowhere to go", {
        jobId: job.id,
        campaignId: job.campaignId,
        notice: notice.text,
      });
    }
    await ctx.engine.storyJobs.markNoticed(job);
  }
  return posted;
}
