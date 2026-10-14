import { NextResponse } from "next/server";
import { requireGuild } from "@/server/access";
import { exportCampaign } from "@/server/campaigns";
import { services } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ guildId: string; campaignId: string }> },
) {
  const { guildId, campaignId } = await params;
  await requireGuild(guildId);
  const data = await exportCampaign(services().handle.db, guildId, campaignId);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  const file = `${
    data.campaign.name
      .replace(/[^\w -]+/g, "")
      .trim()
      .replace(/\s+/g, "-") || "campaign"
  }.json`;
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${file}"`,
      "cache-control": "no-store",
    },
  });
}
