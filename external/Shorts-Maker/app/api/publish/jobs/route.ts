import { NextRequest, NextResponse } from "next/server";
import { filterCategoriesByAccess, filterCategoryMapByAccess, getCategoryAccessScope } from "@/lib/auth/category-permissions";
import { requireAuthenticatedSessionUser, requireSessionUser, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { listPublishCategoryChannels, listPublishJobs, listYoutubeAccounts } from "@/lib/publish/publish-store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  const authUser = requireAuthenticatedSessionUser(request) || user;
  const scope = await getCategoryAccessScope({
    actorRole: authUser.role === "admin" ? "admin" : "member",
    workspaceUserId: user.id,
  });
  const categoryChannels = filterCategoryMapByAccess(await listPublishCategoryChannels(user.id), scope);
  const jobs = filterCategoriesByAccess(await listPublishJobs(user.id, 100), scope, (item) => item.publishCategory);
  const accessibleChannelIds = new Set<string>();
  for (const value of Object.values(categoryChannels)) {
    const channelId = typeof value === "string" ? value.trim() : "";
    if (channelId) accessibleChannelIds.add(channelId);
  }
  for (const job of jobs) {
    const channelId = typeof job.channelId === "string" ? job.channelId.trim() : "";
    if (channelId) accessibleChannelIds.add(channelId);
  }
  const accounts = scope.hasRestrictions
    ? (await listYoutubeAccounts(user.id)).filter((account) => accessibleChannelIds.has(account.channelId))
    : await listYoutubeAccounts(user.id);
  return NextResponse.json({
    ok: true,
    accounts,
    jobs,
    categoryChannels,
  });
}
