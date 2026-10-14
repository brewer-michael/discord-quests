"use server";

import type { RouteTask } from "@dq/providers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/form-state";
import { requireGuild } from "@/server/access";
import { deleteCampaign, grantSpoilerConsent, setCampaignStatus } from "@/server/campaigns";
import { services } from "@/server/db";
import { webEnv } from "@/server/env";
import {
  deleteProvider,
  listModels,
  parseProviderForm,
  saveProvider,
  type TestResult,
  testProvider,
} from "@/server/providers";
import { parseRouteForm, saveTaskRoutes } from "@/server/routes";
import { saveServerSettings } from "@/server/settings";
import { isTask } from "@/server/tasks";

const allowPrivate = () => webEnv().ALLOW_PRIVATE_ENDPOINTS === "true";

export async function saveProviderAction(
  guildId: string,
  existingId: string | null,
  fd: FormData,
): Promise<FormState> {
  const { userId, guild } = await requireGuild(guildId);
  const parsed = parseProviderForm(fd);
  if (!parsed.ok) return { ok: false, errors: parsed.errors, message: "Please fix the highlighted fields." };
  const { handle, keys, store } = services();
  const res = await saveProvider(handle.db, keys, {
    guild: { id: guild.id, name: guild.name },
    userId,
    input: parsed.value,
    existingId: existingId ?? undefined,
    allowPrivate: allowPrivate(),
  });
  if (!res.ok)
    return {
      ok: false,
      errors: res.errors,
      message: res.errors.form ?? "Please fix the highlighted fields.",
    };
  store.invalidate(res.id);
  revalidatePath(`/servers/${guildId}`, "layout");
  if (!existingId) redirect(`/servers/${guildId}/providers/${res.id}?added=1`);
  return { ok: true, message: "Saved." };
}

export async function deleteProviderAction(guildId: string, id: string): Promise<FormState> {
  const { userId } = await requireGuild(guildId);
  const { handle, store } = services();
  await deleteProvider(handle.db, guildId, userId, id);
  store.invalidate(id);
  revalidatePath(`/servers/${guildId}`, "layout");
  redirect(`/servers/${guildId}`);
}

export async function testProviderAction(guildId: string, id: string): Promise<TestResult> {
  const { userId } = await requireGuild(guildId);
  const { handle, store, budget } = services();
  return testProvider(
    { db: handle.db, store, budget, allowPrivate: allowPrivate() },
    { guildId, userId, id },
  );
}

export async function listModelsAction(
  guildId: string,
  id: string,
): Promise<{ ok: true; models: string[] } | { ok: false; message: string }> {
  await requireGuild(guildId);
  const { handle, store } = services();
  try {
    const models = await listModels({ db: handle.db, store, allowPrivate: allowPrivate() }, { guildId, id });
    return { ok: true, models };
  } catch (e) {
    return {
      ok: false,
      message: `The service didn't list its models: ${(e as Error).message.slice(0, 200)}`,
    };
  }
}

export async function saveRoutesAction(guildId: string, task: string, fd: FormData): Promise<FormState> {
  const { userId } = await requireGuild(guildId);
  if (!isTask(task)) return { ok: false, message: "Unknown job" };
  const parsed = parseRouteForm(fd);
  if (!parsed.ok) return { ok: false, message: parsed.error };
  const res = await saveTaskRoutes(services().handle.db, {
    guildId,
    userId,
    task: task as RouteTask,
    rows: parsed.rows,
  });
  if (!res.ok) return { ok: false, message: res.error };
  revalidatePath(`/servers/${guildId}`, "layout");
  return { ok: true, message: parsed.rows.length > 0 ? "Saved." : "Cleared. Server defaults apply." };
}

export async function saveSettingsAction(guildId: string, fd: FormData): Promise<FormState> {
  const { userId, guild } = await requireGuild(guildId);
  const res = await saveServerSettings(services().handle.db, {
    guild: { id: guild.id, name: guild.name },
    userId,
    fd,
  });
  if (!res.ok) return { ok: false, message: res.error };
  revalidatePath(`/servers/${guildId}`, "layout");
  return { ok: true, message: "Saved. New campaigns will use these defaults." };
}

export async function campaignStatusAction(
  guildId: string,
  campaignId: string,
  status: "paused" | "active" | "ended",
): Promise<FormState> {
  const { userId } = await requireGuild(guildId);
  const ok = await setCampaignStatus(services().handle.db, { guildId, userId, campaignId, status });
  revalidatePath(`/servers/${guildId}/campaigns`);
  return ok ? { ok: true } : { ok: false, message: "That campaign can't change right now." };
}

export async function deleteCampaignAction(
  guildId: string,
  campaignId: string,
  fd: FormData,
): Promise<FormState> {
  const { userId } = await requireGuild(guildId);
  const res = await deleteCampaign(services().handle.db, {
    guildId,
    userId,
    campaignId,
    confirmName: String(fd.get("confirmName") ?? ""),
  });
  if (!res.ok) return { ok: false, message: res.error };
  revalidatePath(`/servers/${guildId}/campaigns`);
  return { ok: true, message: "Deleted." };
}

export async function grantSpoilerAction(guildId: string, campaignId: string): Promise<FormState> {
  const { userId } = await requireGuild(guildId);
  await grantSpoilerConsent(services().handle.db, { guildId, userId, campaignId });
  revalidatePath(`/servers/${guildId}/campaigns/${campaignId}/loom`);
  return { ok: true };
}
