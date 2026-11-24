import { selectSupabaseRows, upsertSupabaseRows } from "@/lib/supabase/server";

export type WorkflowTelemetryRecord = {
  id: string;
  name: string;
  page: string;
  stage?: string;
  status?: string;
  detail?: string;
  errorCode?: string;
  retryable?: boolean;
  route?: string;
  sessionId?: string;
  ts: number;
};

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

type PublishStoreTelemetryServiceDeps = {
  selectSupabaseRows: typeof selectSupabaseRows;
  upsertSupabaseRows: typeof upsertSupabaseRows;
};

export type PublishStoreTelemetryService = {
  createWorkflowTelemetryEvent(input: {
    userId: string;
    name: string;
    page: string;
    stage?: string;
    status?: string;
    detail?: string;
    errorCode?: string;
    retryable?: boolean;
    route?: string;
    sessionId?: string;
    ts?: number;
  }): Promise<WorkflowTelemetryRecord>;
  listWorkflowTelemetryEvents(userId: string, limit?: number): Promise<WorkflowTelemetryRecord[]>;
};

function normalizeUserScope(userId: string): string {
  const safe = userId.trim();
  if (!safe) {
    throw new Error("userId is required");
  }
  return safe.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function toWorkflowTelemetryRecord(row: WorkflowTelemetryRow): WorkflowTelemetryRecord {
  return {
    id: row.id,
    name: row.name,
    page: row.page,
    stage: row.stage || undefined,
    status: row.status || undefined,
    detail: row.detail || undefined,
    errorCode: row.error_code || undefined,
    retryable: typeof row.retryable === "boolean" ? row.retryable : undefined,
    route: row.route || undefined,
    sessionId: row.session_id || undefined,
    ts: row.ts_ms,
  };
}

function createPublishStoreTelemetryService(
  deps: Partial<PublishStoreTelemetryServiceDeps> = {}
): PublishStoreTelemetryService {
  const telemetryDeps: PublishStoreTelemetryServiceDeps = {
    selectSupabaseRows: deps.selectSupabaseRows || selectSupabaseRows,
    upsertSupabaseRows: deps.upsertSupabaseRows || upsertSupabaseRows,
  };

  async function createWorkflowTelemetryEvent(input: {
    userId: string;
    name: string;
    page: string;
    stage?: string;
    status?: string;
    detail?: string;
    errorCode?: string;
    retryable?: boolean;
    route?: string;
    sessionId?: string;
    ts?: number;
  }): Promise<WorkflowTelemetryRecord> {
    const ts = Number.isFinite(input.ts) ? Number(input.ts) : Date.now();
    const row: WorkflowTelemetryRow = {
      id: `${ts}-${Math.random().toString(36).slice(2, 10)}`,
      user_id: normalizeUserScope(input.userId),
      name: input.name.trim(),
      page: input.page.trim(),
      stage: input.stage?.trim() || null,
      status: input.status?.trim() || null,
      detail: input.detail?.trim() || null,
      error_code: input.errorCode?.trim() || null,
      retryable: typeof input.retryable === "boolean" ? input.retryable : null,
      route: input.route?.trim() || null,
      session_id: input.sessionId?.trim() || null,
      ts_ms: ts,
    };
    const inserted = await telemetryDeps.upsertSupabaseRows<WorkflowTelemetryRow>("workflow_telemetry_events", [row], {
      onConflict: "id",
    });
    return toWorkflowTelemetryRecord(inserted[0] || row);
  }

  async function listWorkflowTelemetryEvents(userId: string, limit = 50): Promise<WorkflowTelemetryRecord[]> {
    const rows = await telemetryDeps.selectSupabaseRows<WorkflowTelemetryRow>("workflow_telemetry_events", {
      filters: {
        user_id: normalizeUserScope(userId),
      },
      orderBy: {
        column: "ts_ms",
        ascending: false,
      },
      limit: Math.max(1, Math.min(5000, Math.floor(limit))),
    });
    return rows.map(toWorkflowTelemetryRecord);
  }

  return {
    createWorkflowTelemetryEvent,
    listWorkflowTelemetryEvents,
  };
}

const publishStoreTelemetryService = createPublishStoreTelemetryService();

export {
  createPublishStoreTelemetryService,
  publishStoreTelemetryService,
  publishStoreTelemetryService as defaultPublishStoreTelemetryService,
};

export const createWorkflowTelemetryEvent = publishStoreTelemetryService.createWorkflowTelemetryEvent;
export const listWorkflowTelemetryEvents = publishStoreTelemetryService.listWorkflowTelemetryEvents;
