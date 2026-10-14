import {
  computeLedgers,
  emptyLoomState,
  type LoomState,
  loomContext,
  nextId,
  reserveForFinale,
  type Thread,
  upsertBearer,
  VIRTUE_TAGS,
  type VirtueTag,
} from "@dq/core/loom";
import { storyProgress } from "@dq/core/story";
import { approvalRequests, campaigns } from "@dq/db";
import { campaignLoom, evaluations } from "@dq/db/loom";
import { and, eq } from "drizzle-orm";
import { type EngineDeps, GameError } from "./deps";
import { npcAnchor } from "./director";
import { dmLoomView } from "./loom-store";
import { asStory } from "./story-state";

const SIZE_WEIGHT = { small: 0.5, medium: 0.9, large: 1.3 } as const;

/**
 * Tools for a human DM in Assist mode: peek at the hidden hand, plant a
 * thread by hand, or switch the loom off entirely.
 */
export class DmService {
  constructor(private readonly deps: EngineDeps) {}

  async requireDm(campaignId: string, userId: string) {
    const [c] = await this.deps.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!c) throw new GameError("no campaign", "That campaign doesn't exist.");
    if (c.mode !== "assist" || c.dmUserId !== userId)
      throw new GameError("not dm", "Only the human DM of an Assist-mode campaign can use DM tools.");
    return c;
  }

  async loomView(campaignId: string, userId: string) {
    await this.requireDm(campaignId, userId);
    return dmLoomView(this.deps.db, campaignId);
  }

  async setLoomMode(campaignId: string, userId: string, mode: "auto" | "off") {
    const c = await this.requireDm(campaignId, userId);
    await this.deps.db
      .update(campaigns)
      .set({
        settings: { ...(c.settings as Record<string, unknown>), loomMode: mode },
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId));
  }

  /** The DM decides a moment mattered, and records it as a thread. */
  async plant(
    campaignId: string,
    userId: string,
    input: { tag: string; npcId: string | null; summary: string; size: keyof typeof SIZE_WEIGHT },
  ) {
    const c = await this.requireDm(campaignId, userId);
    if (!(VIRTUE_TAGS as readonly string[]).includes(input.tag))
      throw new GameError("bad tag", "Choose one of the listed kinds of deed.");
    const { index } = this.deps.worlds.get(c.worldId);
    if (input.npcId && !index.namedNpcs.has(input.npcId))
      throw new GameError("bad npc", "That character isn't in this world.");
    const story = asStory(c.story);
    const ctx = loomContext(index);
    const progress = storyProgress(index, story.completedBeats);
    return this.deps.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(campaignLoom)
        .where(eq(campaignLoom.campaignId, campaignId))
        .for("update");
      const state = structuredClone((row?.state as unknown as LoomState) ?? emptyLoomState());
      const tag = input.tag as VirtueTag;
      const anchor = input.npcId ? npcAnchor(index, input.npcId) : null;
      const thread: Thread = {
        id: nextId(state, "t"),
        deedId: nextId(state, "d"),
        tag,
        actorIds: [],
        anchor,
        weight: SIZE_WEIGHT[input.size],
        sincerity: 1,
        plantedProgress: progress,
        plantedTurn: c.turnSeq,
        ripenSpan: ctx.tuning.ripenSpan[tag],
        state: "dormant",
        summary: input.summary.trim().slice(0, 200) || "did something that mattered",
      };
      state.threads.push(thread);
      if (anchor) {
        upsertBearer(state, thread, { story: { turn: c.turnSeq, progress } } as never, ctx);
      }
      reserveForFinale(state, ctx);
      state.ledgers = computeLedgers(state);
      await tx
        .update(campaignLoom)
        .set({ state: state as unknown as Record<string, unknown>, updatedAt: new Date() })
        .where(eq(campaignLoom.campaignId, campaignId));
      await tx.insert(evaluations).values({
        campaignId,
        turnSeq: c.turnSeq,
        inputHash: "dm-plant",
        result: { audit: [{ step: "dm", detail: `DM planted ${thread.id} (${tag})` }] },
      });
      return { threadId: thread.id };
    });
  }

  async pendingApproval(campaignId: string) {
    const [req] = await this.deps.db
      .select()
      .from(approvalRequests)
      .where(and(eq(approvalRequests.campaignId, campaignId), eq(approvalRequests.status, "pending")));
    return req ?? null;
  }

  async setApprovalMessage(approvalId: string, messageId: string) {
    await this.deps.db
      .update(approvalRequests)
      .set({ discordMessageId: messageId })
      .where(eq(approvalRequests.id, approvalId));
  }

  async getApproval(approvalId: string) {
    const [req] = await this.deps.db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, approvalId));
    return req ?? null;
  }
}
