import assert from "node:assert/strict";
import test from "node:test";
import { createPublishStoreTelemetryService } from "./publish-store-telemetry";

type WorkflowTelemetryRow = {
  id: string;
  user_id: string;
  name: string;
  page: string;
  stage?: string | null;
  status?: string | null;
  detail?: string | null;
  error_code?: string | null;
  retryable?: boolean | null;
  route?: string | null;
  session_id?: string | null;
  ts_ms: number;
};

function createFakeDeps() {
  const events: WorkflowTelemetryRow[] = [];

  const matchesFilter = (row: Record<string, unknown>, key: string, value: unknown): boolean => row[key] === value;

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
        return String(leftValue || "").localeCompare(String(rightValue || ""));
      });
    }
    if (typeof query?.limit === "number") {
      out = out.slice(0, query.limit);
    }
    return out.map((row) => ({ ...(row as Record<string, unknown>) } as T));
  };

  return {
    events,
    deps: {
      selectSupabaseRows: async <T>(table: string, query: any): Promise<T[]> => {
        if (table !== "workflow_telemetry_events") throw new Error(`unexpected table: ${table}`);
        return selectRows(events, query) as T[];
      },
      upsertSupabaseRows: async <T>(
        table: string,
        rows: Array<Record<string, unknown>>,
        options?: { onConflict?: string | string[] }
      ): Promise<T[]> => {
        if (table !== "workflow_telemetry_events") throw new Error(`unexpected table: ${table}`);
        const keyFields = Array.isArray(options?.onConflict)
          ? options?.onConflict
          : options?.onConflict
            ? [options.onConflict]
            : [];
        const inserted: T[] = [];
        for (const row of rows) {
          const next = { ...row } as WorkflowTelemetryRow;
          const conflictIndex = keyFields.length
            ? events.findIndex((existing) =>
                keyFields.every(
                  (field) =>
                    String((existing as Record<string, unknown>)[field]) === String((next as Record<string, unknown>)[field])
                )
              )
            : -1;
          if (conflictIndex >= 0) {
            events[conflictIndex] = { ...events[conflictIndex], ...next };
            inserted.push({ ...events[conflictIndex] } as T);
            continue;
          }
          events.push(next);
          inserted.push({ ...next } as T);
        }
        return inserted;
      },
    },
  };
}

test("publish store telemetry service stores and lists telemetry events", async () => {
  const fake = createFakeDeps();
  const service = createPublishStoreTelemetryService(fake.deps);

  const first = await service.createWorkflowTelemetryEvent({
    userId: "user-a",
    name: "page_view",
    page: "studio",
    stage: "load",
    status: "success",
    retryable: false,
    ts: 100,
  });
  const second = await service.createWorkflowTelemetryEvent({
    userId: "user-a",
    name: "publish",
    page: "studio",
    detail: "queued",
    errorCode: "E123",
    sessionId: "session-1",
    ts: 200,
  });

  assert.equal(first.name, "page_view");
  assert.equal(second.errorCode, "E123");

  const events = await service.listWorkflowTelemetryEvents("user-a", 10);
  assert.equal(events.length, 2);
  assert.equal(events[0]?.id, second.id);
  assert.equal(events[1]?.id, first.id);
  assert.equal(events[0]?.sessionId, "session-1");
});
