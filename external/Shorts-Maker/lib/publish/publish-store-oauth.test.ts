import assert from "node:assert/strict";
import test from "node:test";
import { createPublishStoreOAuthService, type YoutubeAccountRow } from "./publish-store-oauth";

function createFakeDeps() {
  const accounts: YoutubeAccountRow[] = [];
  let tick = 0;
  const nextTs = () => (tick += 1000);

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
    accounts,
    deps: {
      selectSupabaseRows: async <T>(table: string, query: any): Promise<T[]> => {
        if (table !== "youtube_accounts") throw new Error(`unexpected table: ${table}`);
        return selectRows(accounts, query) as T[];
      },
      updateSupabaseRows: async <T>(
        table: string,
        filters: Record<string, unknown>,
        patch: Record<string, unknown>
      ): Promise<T[]> => {
        if (table !== "youtube_accounts") throw new Error(`unexpected table: ${table}`);
        const updated: T[] = [];
        for (const row of accounts) {
          if (!Object.entries(filters).every(([key, value]) => matchesFilter(row as Record<string, unknown>, key, value))) {
            continue;
          }
          Object.assign(row as Record<string, unknown>, patch);
          (row as Record<string, unknown>).updated_at_ms = nextTs();
          updated.push({ ...(row as Record<string, unknown>) } as T);
        }
        return updated;
      },
      upsertSupabaseRows: async <T>(
        table: string,
        rows: Array<Record<string, unknown>>,
        options?: { onConflict?: string | string[] }
      ): Promise<T[]> => {
        if (table !== "youtube_accounts") throw new Error(`unexpected table: ${table}`);
        const keyFields = Array.isArray(options?.onConflict)
          ? options?.onConflict
          : options?.onConflict
            ? [options.onConflict]
            : [];
        const inserted: T[] = [];
        for (const row of rows) {
          const next = { ...row } as YoutubeAccountRow;
          const conflictIndex = keyFields.length
            ? accounts.findIndex((existing) =>
                keyFields.every(
                  (field) =>
                    String((existing as Record<string, unknown>)[field]) === String((next as Record<string, unknown>)[field])
                )
              )
            : -1;
          if (conflictIndex >= 0) {
            accounts[conflictIndex] = {
              ...accounts[conflictIndex],
              ...next,
              created_at_ms: accounts[conflictIndex].created_at_ms,
              updated_at_ms: nextTs(),
            };
            inserted.push({ ...accounts[conflictIndex] } as T);
            continue;
          }
          accounts.push({
            ...next,
            created_at_ms: nextTs(),
            updated_at_ms: nextTs(),
          });
          inserted.push({ ...accounts[accounts.length - 1] } as T);
        }
        return inserted;
      },
    },
  };
}

test("publish store oauth service lists, fetches, upserts, and preserves createdAt on update", async () => {
  const fake = createFakeDeps();
  const service = createPublishStoreOAuthService(fake.deps);

  await service.upsertYoutubeAccount("user-a", {
    userId: "user-a",
    platform: "youtube",
    channelId: "channel-1",
    channelTitle: "Channel One",
    accessToken: "token-1",
    refreshToken: "refresh-1",
    expiryDate: 111,
    scope: " scope-1 ",
  });
  await service.upsertYoutubeAccount("user-a", {
    userId: "user-a",
    platform: "youtube",
    channelId: "channel-2",
    channelTitle: "Channel Two",
    accessToken: "token-2",
    refreshToken: "refresh-2",
    expiryDate: 222,
    scope: "scope-2",
  });

  assert.deepEqual((await service.listYoutubeAccounts(" user-a ")).map((account) => account.channelId), [
    "channel-2",
    "channel-1",
  ]);
  assert.equal((await service.getYoutubeAccount("user-a", "channel-1"))?.channelTitle, "Channel One");
  assert.equal((await service.getYoutubeAccount("user-a"))?.channelId, "channel-2");
  const createdAtBeforeUpdate = fake.accounts.find((account) => account.channel_id === "channel-1")?.created_at_ms;

  await service.upsertYoutubeAccount("user-a", {
    userId: "user-a",
    platform: "youtube",
    channelId: "channel-1",
    channelTitle: "Channel One Updated",
    accessToken: "token-1b",
    refreshToken: "refresh-1",
    expiryDate: 333,
    scope: "scope-1",
  });
  assert.equal(fake.accounts.find((account) => account.channel_id === "channel-1")?.created_at_ms, createdAtBeforeUpdate);
  assert.equal((await service.getYoutubeAccount("user-a", "channel-1"))?.channelTitle, "Channel One Updated");
});

test("publish store oauth service refreshes access tokens", async () => {
  const fake = createFakeDeps();
  const service = createPublishStoreOAuthService(fake.deps);

  await service.upsertYoutubeAccount("user-a", {
    userId: "user-a",
    platform: "youtube",
    channelId: "channel-1",
    channelTitle: "Channel One",
    accessToken: "token-1",
    refreshToken: "refresh-1",
    expiryDate: 111,
    scope: "scope-1",
  });

  const refreshed = await service.refreshYoutubeAccountToken({
    userId: "user-a",
    channelId: "channel-1",
    accessToken: "token-1b",
    expiryDate: 999,
  });
  assert.equal(refreshed?.accessToken, "token-1b");
  assert.equal(refreshed?.expiryDate, 999);
  assert.equal((await service.getYoutubeAccount("user-a", "channel-1"))?.accessToken, "token-1b");
  assert.equal(await service.refreshYoutubeAccountToken({
    userId: "user-a",
    channelId: "missing",
    accessToken: "noop",
    expiryDate: 1,
  }), null);
});
