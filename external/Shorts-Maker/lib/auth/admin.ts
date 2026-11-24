import { listRecentAuditLogs, type AuditLogEntry } from "@/lib/audit/server";
import { getUserCategoryAccessPolicy, listUserCategoryPermissionMap, type CategoryAccessMode, type CategoryPermissionAssignment, type CategoryPermissionLevel } from "@/lib/auth/category-permissions";
import { listAuthUsers } from "@/lib/auth/store";
import type { AuthUser } from "@/lib/auth/types";
import { toCategoryLabel } from "@/lib/publish/categories";
import { selectSupabaseRows } from "@/lib/supabase/server";

type PublishCategoryRow = {
  user_id: string;
  customer_key: string;
};

type PublishJobRow = {
  user_id: string;
  status: string;
  publish_category?: string | null;
};

type YoutubeAccountRow = {
  user_id: string;
  channel_id: string;
};

type VideoAssetRow = {
  user_id: string;
  publish_category?: string | null;
};

export type AdminUserSummary = {
  id: string;
  loginId: string;
  displayName: string;
  email: string;
  role: AuthUser["role"];
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  categories: string[];
  categoryCount: number;
  jobCount: number;
  pendingJobCount: number;
  publishedJobCount: number;
  channelCount: number;
  accessMode: CategoryAccessMode;
  allAccessLevel: CategoryPermissionLevel;
  grantedCategoryPermissions: CategoryPermissionAssignment[];
  grantedCategories: string[];
  hasCategoryRestrictions: boolean;
};

export type AdminOverviewMetrics = {
  totalUsers: number;
  activeUsers: number;
  memberUsers: number;
  adminUsers: number;
  totalCategories: number;
  totalChannels: number;
  totalJobs: number;
  pendingJobs: number;
  publishedJobs: number;
  totalAssets: number;
};

export type AdminCategorySummary = {
  key: string;
  label: string;
  userCount: number;
  jobCount: number;
  pendingJobCount: number;
  publishedJobCount: number;
  assetCount: number;
};

export type AdminOverviewSnapshot = {
  metrics: AdminOverviewMetrics;
  topUsers: AdminUserSummary[];
  topCategories: AdminCategorySummary[];
  recentAuditLogs: AuditLogEntry[];
};

type AdminWorkspaceDataset = {
  users: AuthUser[];
  categoryRows: PublishCategoryRow[];
  jobRows: PublishJobRow[];
  accountRows: YoutubeAccountRow[];
  assetRows: VideoAssetRow[];
};

async function loadAdminWorkspaceDataset(): Promise<AdminWorkspaceDataset> {
  const [users, categoryRows, jobRows, accountRows, assetRows] = await Promise.all([
    listAuthUsers(500),
    selectSupabaseRows<PublishCategoryRow>("publish_customers", {
      select: "user_id,customer_key",
      filters: {
        deleted_at_ms: null,
      },
      orderBy: { column: "created_at_ms", ascending: true },
      limit: 20000,
    }),
    selectSupabaseRows<PublishJobRow>("publish_jobs", {
      select: "user_id,status,publish_category",
      filters: {
        deleted_at_ms: null,
      },
      orderBy: { column: "created_at_ms", ascending: false },
      limit: 20000,
    }),
    selectSupabaseRows<YoutubeAccountRow>("youtube_accounts", {
      select: "user_id,channel_id",
      orderBy: { column: "updated_at_ms", ascending: false },
      limit: 10000,
    }),
    selectSupabaseRows<VideoAssetRow>("video_assets", {
      select: "user_id,publish_category",
      filters: {
        deleted_at_ms: null,
      },
      orderBy: { column: "created_at_ms", ascending: false },
      limit: 20000,
    }),
  ]);
  return {
    users,
    categoryRows,
    jobRows,
    accountRows,
    assetRows,
  };
}

function buildAdminUserSummaries(dataset: AdminWorkspaceDataset): AdminUserSummary[] {
  const { users, categoryRows, jobRows, accountRows } = dataset;
  const categoriesByUser = new Map<string, string[]>();
  for (const row of categoryRows) {
    const userId = String(row.user_id || "").trim();
    const category = String(row.customer_key || "").trim();
    if (!userId || !category) continue;
    const current = categoriesByUser.get(userId) || [];
    if (!current.includes(category)) current.push(category);
    categoriesByUser.set(userId, current);
  }

  const jobStatsByUser = new Map<string, { total: number; pending: number; published: number }>();
  for (const row of jobRows) {
    const userId = String(row.user_id || "").trim();
    if (!userId) continue;
    const current = jobStatsByUser.get(userId) || { total: 0, pending: 0, published: 0 };
    current.total += 1;
    if (row.status === "pending" || row.status === "processing") current.pending += 1;
    if (row.status === "published") current.published += 1;
    jobStatsByUser.set(userId, current);
  }

  const channelsByUser = new Map<string, Set<string>>();
  for (const row of accountRows) {
    const userId = String(row.user_id || "").trim();
    const channelId = String(row.channel_id || "").trim();
    if (!userId || !channelId) continue;
    const current = channelsByUser.get(userId) || new Set<string>();
    current.add(channelId);
    channelsByUser.set(userId, current);
  }

  return users
    .filter((user) => user.role !== "system")
    .map((user) => {
      const categories = (categoriesByUser.get(user.id) || []).sort((left, right) => left.localeCompare(right, "ko-KR"));
      const jobStats = jobStatsByUser.get(user.id) || { total: 0, pending: 0, published: 0 };
      return {
        id: user.id,
        loginId: user.loginId,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        categories,
        categoryCount: categories.length,
        jobCount: jobStats.total,
        pendingJobCount: jobStats.pending,
        publishedJobCount: jobStats.published,
        channelCount: channelsByUser.get(user.id)?.size || 0,
        accessMode: "all" as CategoryAccessMode,
        allAccessLevel: "manage" as CategoryPermissionLevel,
        grantedCategoryPermissions: [],
        grantedCategories: [],
        hasCategoryRestrictions: false,
      };
    })
    .sort((left, right) => {
      if (left.role !== right.role) return left.role === "admin" ? -1 : 1;
      return left.displayName.localeCompare(right.displayName, "ko-KR");
    });
}

export async function listAdminUserSummaries(): Promise<AdminUserSummary[]> {
  const dataset = await loadAdminWorkspaceDataset();
  const summaries = buildAdminUserSummaries(dataset);
  const permissionMap = await listUserCategoryPermissionMap(summaries.map((item) => item.id));
  const policyMap = new Map<string, { accessMode: CategoryAccessMode; allAccessLevel: CategoryPermissionLevel }>();
  for (const summary of summaries) {
    policyMap.set(summary.id, await getUserCategoryAccessPolicy(summary.id));
  }
  return summaries.map((summary) => {
    const policy = policyMap.get(summary.id) || { accessMode: "all" as CategoryAccessMode, allAccessLevel: "manage" as CategoryPermissionLevel };
    const grantedCategoryPermissions = (permissionMap.get(summary.id) || []).filter((entry) => summary.categories.includes(entry.category));
    const grantedCategories = grantedCategoryPermissions.map((entry) => entry.category);
    const accessMode = grantedCategoryPermissions.length > 0 && policy.accessMode === "all" ? "selected" : policy.accessMode;
    return {
      ...summary,
      accessMode,
      allAccessLevel: policy.allAccessLevel,
      grantedCategoryPermissions,
      grantedCategories,
      hasCategoryRestrictions: accessMode !== "all",
    };
  });
}

export async function getAdminOverviewSnapshot(): Promise<AdminOverviewSnapshot> {
  const dataset = await loadAdminWorkspaceDataset();
  const userSummaries = buildAdminUserSummaries(dataset);
  const categoryStats = new Map<string, {
    key: string;
    userIds: Set<string>;
    jobCount: number;
    pendingJobCount: number;
    publishedJobCount: number;
    assetCount: number;
  }>();

  for (const row of dataset.categoryRows) {
    const key = String(row.customer_key || "").trim();
    const userId = String(row.user_id || "").trim();
    if (!key || !userId) continue;
    const current = categoryStats.get(key) || {
      key,
      userIds: new Set<string>(),
      jobCount: 0,
      pendingJobCount: 0,
      publishedJobCount: 0,
      assetCount: 0,
    };
    current.userIds.add(userId);
    categoryStats.set(key, current);
  }

  for (const row of dataset.jobRows) {
    const categoryKey = String(row.publish_category || "").trim();
    if (!categoryKey) continue;
    const current = categoryStats.get(categoryKey) || {
      key: categoryKey,
      userIds: new Set<string>(),
      jobCount: 0,
      pendingJobCount: 0,
      publishedJobCount: 0,
      assetCount: 0,
    };
    current.jobCount += 1;
    if (row.status === "pending" || row.status === "processing") current.pendingJobCount += 1;
    if (row.status === "published") current.publishedJobCount += 1;
    categoryStats.set(categoryKey, current);
  }

  for (const row of dataset.assetRows) {
    const categoryKey = String(row.publish_category || "").trim();
    if (!categoryKey) continue;
    const current = categoryStats.get(categoryKey) || {
      key: categoryKey,
      userIds: new Set<string>(),
      jobCount: 0,
      pendingJobCount: 0,
      publishedJobCount: 0,
      assetCount: 0,
    };
    current.assetCount += 1;
    categoryStats.set(categoryKey, current);
  }

  const topCategories = Array.from(categoryStats.values())
    .map((entry) => ({
      key: entry.key,
      label: toCategoryLabel(entry.key),
      userCount: entry.userIds.size,
      jobCount: entry.jobCount,
      pendingJobCount: entry.pendingJobCount,
      publishedJobCount: entry.publishedJobCount,
      assetCount: entry.assetCount,
    }))
    .sort((left, right) => {
      if (left.jobCount !== right.jobCount) return right.jobCount - left.jobCount;
      if (left.assetCount !== right.assetCount) return right.assetCount - left.assetCount;
      if (left.userCount !== right.userCount) return right.userCount - left.userCount;
      return left.label.localeCompare(right.label, "ko-KR");
    })
    .slice(0, 12);

  const metrics: AdminOverviewMetrics = {
    totalUsers: userSummaries.length,
    activeUsers: userSummaries.filter((user) => user.isActive).length,
    memberUsers: userSummaries.filter((user) => user.role === "member").length,
    adminUsers: userSummaries.filter((user) => user.role === "admin").length,
    totalCategories: dataset.categoryRows.length,
    totalChannels: dataset.accountRows.length,
    totalJobs: dataset.jobRows.length,
    pendingJobs: dataset.jobRows.filter((row) => row.status === "pending" || row.status === "processing").length,
    publishedJobs: dataset.jobRows.filter((row) => row.status === "published").length,
    totalAssets: dataset.assetRows.length,
  };

  return {
    metrics,
    topUsers: [...userSummaries]
      .sort((left, right) => {
        if (left.jobCount !== right.jobCount) return right.jobCount - left.jobCount;
        if (left.categoryCount !== right.categoryCount) return right.categoryCount - left.categoryCount;
        return left.displayName.localeCompare(right.displayName, "ko-KR");
      })
      .slice(0, 8),
    topCategories,
    recentAuditLogs: await listRecentAuditLogs(20),
  };
}
