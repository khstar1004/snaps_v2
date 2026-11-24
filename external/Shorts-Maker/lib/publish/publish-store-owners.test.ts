import assert from "node:assert/strict";
import test from "node:test";
import { createPublishStoreOwnersService, type PublishCustomerOwnerRecord } from "./publish-store-owners";

type PublishCustomerRow = {
  user_id: string;
  customer_key: string;
  deleted_at_ms?: number | null;
  updated_at_ms: number;
};

function createFakeDeps() {
  const publishCustomers: PublishCustomerRow[] = [];

  const matchesFilter = (row: Record<string, unknown>, key: string, value: unknown): boolean => {
    if (value === null) return row[key] == null;
    if (value && typeof value === "object" && "op" in value) {
      const filter = value as { op?: string; value?: number };
      if (filter.op === "gt") {
        return Number(row[key] || 0) > Number(filter.value || 0);
      }
    }
    return row[key] === value;
  };

  const selectRows = <T>(rows: T[], query: any): T[] => {
    const filters = query?.filters || {};
    let out = rows.filter((row) =>
      Object.entries(filters).every(([key, value]) => matchesFilter(row as Record<string, unknown>, key, value))
    );
    const orderBy = query?.orderBy;
    if (orderBy?.column) {
      const column = orderBy.column as keyof T;
      out = [...out].sort((left, right) => {
        const leftValue = (left as Record<string, unknown>)[column as string];
        const rightValue = (right as Record<string, unknown>)[column as string];
        if (typeof leftValue === "number" && typeof rightValue === "number") {
          return orderBy.ascending ? leftValue - rightValue : rightValue - leftValue;
        }
        const leftText = String(leftValue || "");
        const rightText = String(rightValue || "");
        return orderBy.ascending ? leftText.localeCompare(rightText) : rightText.localeCompare(leftText);
      });
    }
    if (typeof query?.limit === "number") {
      out = out.slice(0, query.limit);
    }
    return out.map((row) => ({ ...(row as Record<string, unknown>) } as T));
  };

  return {
    publishCustomers,
    deps: {
      selectSupabaseRows: async <T>(table: string, query: any): Promise<T[]> => {
        if (table !== "publish_customers") throw new Error(`unexpected table: ${table}`);
        return selectRows(publishCustomers, query) as T[];
      },
    },
  };
}

test("publish store owners service lists, dedupes, and resolves preferred owner rows", async () => {
  const fake = createFakeDeps();
  const service = createPublishStoreOwnersService(fake.deps);

  fake.publishCustomers.push(
    { user_id: "user_a", customer_key: "alpha", updated_at_ms: 100, deleted_at_ms: null },
    { user_id: "user_b", customer_key: "beta", updated_at_ms: 200, deleted_at_ms: null },
    { user_id: "user_c", customer_key: "alpha", updated_at_ms: 300, deleted_at_ms: null },
    { user_id: "user_d", customer_key: "deleted", updated_at_ms: 400, deleted_at_ms: 500 }
  );

  const owners = await service.listGlobalPublishCustomerOwners();
  assert.deepEqual(owners, [
    { key: "alpha", ownerUserId: "user_c" },
    { key: "beta", ownerUserId: "user_b" },
  ] satisfies PublishCustomerOwnerRecord[]);

  const customers = await service.listGlobalPublishCustomers();
  assert.equal(new Set(customers).size, customers.length);
  assert.ok(customers.includes("alpha"));
  assert.ok(customers.includes("beta"));

  assert.equal(await service.resolvePublishCustomerOwnerUserId("alpha", "user_a"), "user_a");
  assert.equal(await service.resolvePublishCustomerOwnerUserId("alpha", "missing"), "user_c");
  assert.equal(await service.resolvePublishCustomerOwnerUserId("", "user_a"), null);
});
