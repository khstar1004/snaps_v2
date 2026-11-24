import { PUBLISH_CATEGORIES } from "@/lib/publish/category-metadata";
import type { PublishCategory } from "@/lib/publish/types";
import { selectSupabaseRows } from "@/lib/supabase/server";

export type PublishCustomerOwnerRecord = {
  key: PublishCategory;
  ownerUserId: string;
};

type PublishCategoryRow = {
  user_id: string;
  customer_key: string;
  deleted_at_ms?: number | null;
  updated_at_ms: number;
};

type PublishStoreOwnersServiceDeps = {
  selectSupabaseRows: typeof selectSupabaseRows;
};

export type PublishStoreOwnersService = {
  listGlobalPublishCustomers(): Promise<PublishCategory[]>;
  listGlobalPublishCustomerOwners(): Promise<PublishCustomerOwnerRecord[]>;
  resolvePublishCustomerOwnerUserId(category: PublishCategory, preferredUserId?: string | null): Promise<string | null>;
};

function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUserScope(userId: string): string {
  const safe = userId.trim();
  if (!safe) {
    throw new Error("userId is required");
  }
  return safe.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function toSoftDeleteFilter() {
  return null;
}

function dedupePublishCustomerOwners(rows: PublishCategoryRow[]): PublishCustomerOwnerRecord[] {
  const result = new Map<PublishCategory, PublishCustomerOwnerRecord>();
  for (const row of rows) {
    const key = safeTrim(row.customer_key);
    const ownerUserId = safeTrim(row.user_id);
    if (!key || !ownerUserId || result.has(key)) continue;
    result.set(key, { key, ownerUserId });
  }
  return Array.from(result.values());
}

function createPublishStoreOwnersService(
  deps: Partial<PublishStoreOwnersServiceDeps> = {}
): PublishStoreOwnersService {
  const ownersDeps: PublishStoreOwnersServiceDeps = {
    selectSupabaseRows: deps.selectSupabaseRows || selectSupabaseRows,
  };

  async function listAllActivePublishCategoryRows(): Promise<PublishCategoryRow[]> {
    return ownersDeps.selectSupabaseRows<PublishCategoryRow>("publish_customers", {
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

  async function listGlobalPublishCustomers(): Promise<PublishCategory[]> {
    const discovered = dedupePublishCustomerOwners(await listAllActivePublishCategoryRows()).map((item) => item.key);
    return Array.from(new Set([...PUBLISH_CATEGORIES, ...discovered]));
  }

  async function listGlobalPublishCustomerOwners(): Promise<PublishCustomerOwnerRecord[]> {
    return dedupePublishCustomerOwners(await listAllActivePublishCategoryRows());
  }

  async function resolvePublishCustomerOwnerUserId(
    category: PublishCategory,
    preferredUserId?: string | null
  ): Promise<string | null> {
    const safeCategory = safeTrim(category);
    if (!safeCategory) return null;
    const preferred = safeTrim(preferredUserId);
    if (preferred) {
      const current = await ownersDeps.selectSupabaseRows<Pick<PublishCategoryRow, "user_id">>("publish_customers", {
        filters: {
          user_id: normalizeUserScope(preferred),
          customer_key: safeCategory,
          deleted_at_ms: toSoftDeleteFilter(),
        },
        limit: 1,
      });
      if (current[0]?.user_id) return safeTrim(current[0].user_id);
    }
    const rows = await ownersDeps.selectSupabaseRows<Pick<PublishCategoryRow, "user_id">>("publish_customers", {
      select: "user_id",
      filters: {
        customer_key: safeCategory,
        deleted_at_ms: toSoftDeleteFilter(),
      },
      orderBy: {
        column: "updated_at_ms",
        ascending: false,
      },
      limit: 1,
    });
    return safeTrim(rows[0]?.user_id) || null;
  }

  return {
    listGlobalPublishCustomers,
    listGlobalPublishCustomerOwners,
    resolvePublishCustomerOwnerUserId,
  };
}

const publishStoreOwnersService = createPublishStoreOwnersService();

export {
  createPublishStoreOwnersService,
  publishStoreOwnersService,
  publishStoreOwnersService as defaultPublishStoreOwnersService,
};

export const listGlobalPublishCustomers = publishStoreOwnersService.listGlobalPublishCustomers;
export const listGlobalPublishCustomerOwners = publishStoreOwnersService.listGlobalPublishCustomerOwners;
export const resolvePublishCustomerOwnerUserId = publishStoreOwnersService.resolvePublishCustomerOwnerUserId;
