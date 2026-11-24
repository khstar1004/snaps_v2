import { selectSupabaseRows, upsertSupabaseRows } from "@/lib/supabase/server";
import type { PublishCategory } from "@/lib/publish/types";
import type { PublishCategoryRow, SoftDeleteMode } from "./publish-store-category-settings";
import { buildPublishCategoryRow, normalizeDeletedAt, normalizeUserScope, toSoftDeleteFilter } from "./publish-store-category-settings-helpers";

export type PublishCategorySettingsRowServiceDeps = {
  selectSupabaseRows: typeof selectSupabaseRows;
  upsertSupabaseRows: typeof upsertSupabaseRows;
};

export type PublishCategorySettingsRowService = {
  getPublishCategoryRow(userId: string, category: PublishCategory, options?: { softDeleteMode?: SoftDeleteMode }): Promise<PublishCategoryRow | null>;
  listPublishCategoryRows(userId: string, options?: { softDeleteMode?: SoftDeleteMode }): Promise<PublishCategoryRow[]>;
  ensurePublishCategoryRow(userId: string, category: PublishCategory): Promise<PublishCategoryRow>;
  listAllActivePublishCategoryRows(): Promise<PublishCategoryRow[]>;
};

export function createPublishCategorySettingsRowService(
  deps: Partial<PublishCategorySettingsRowServiceDeps> = {}
): PublishCategorySettingsRowService {
  const rowDeps: PublishCategorySettingsRowServiceDeps = {
    selectSupabaseRows: deps.selectSupabaseRows || selectSupabaseRows,
    upsertSupabaseRows: deps.upsertSupabaseRows || upsertSupabaseRows,
  };

  async function getPublishCategoryRow(
    userId: string,
    category: PublishCategory,
    options?: { softDeleteMode?: SoftDeleteMode }
  ): Promise<PublishCategoryRow | null> {
    const safeCategory = category.trim();
    if (!safeCategory) return null;
    const rows = await rowDeps.selectSupabaseRows<PublishCategoryRow>("publish_customers", {
      filters: {
        user_id: normalizeUserScope(userId),
        customer_key: safeCategory,
        deleted_at_ms: toSoftDeleteFilter(options?.softDeleteMode),
      },
      limit: 1,
    });
    return rows[0] || null;
  }

  async function listPublishCategoryRows(
    userId: string,
    options?: { softDeleteMode?: SoftDeleteMode }
  ): Promise<PublishCategoryRow[]> {
    return rowDeps.selectSupabaseRows<PublishCategoryRow>("publish_customers", {
      filters: {
        user_id: normalizeUserScope(userId),
        deleted_at_ms: toSoftDeleteFilter(options?.softDeleteMode),
      },
      orderBy: {
        column: options?.softDeleteMode === "deleted" ? "deleted_at_ms" : "created_at_ms",
        ascending: options?.softDeleteMode === "deleted" ? false : true,
      },
      limit: 5000,
    });
  }

  async function ensurePublishCategoryRow(userId: string, category: PublishCategory): Promise<PublishCategoryRow> {
    const existing = await getPublishCategoryRow(userId, category, { softDeleteMode: "all" });
    if (existing && !normalizeDeletedAt(existing.deleted_at_ms)) return existing;
    const row = buildPublishCategoryRow({
      userId,
      category,
      existing,
    });
    const upserted = await rowDeps.upsertSupabaseRows<PublishCategoryRow>("publish_customers", [row], {
      onConflict: ["user_id", "customer_key"],
    });
    return upserted[0] || row;
  }

  async function listAllActivePublishCategoryRows(): Promise<PublishCategoryRow[]> {
    return rowDeps.selectSupabaseRows<PublishCategoryRow>("publish_customers", {
      filters: {
        deleted_at_ms: toSoftDeleteFilter(),
      },
      orderBy: {
        column: "updated_at_ms",
        ascending: false,
      },
      limit: 5000,
    });
  }

  return {
    getPublishCategoryRow,
    listPublishCategoryRows,
    ensurePublishCategoryRow,
    listAllActivePublishCategoryRows,
  };
}
