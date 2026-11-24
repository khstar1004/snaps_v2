import type { WorkflowTelemetryRecord } from "@/lib/publish/publish-store";
import type { StudioRenderEngine } from "@/types/studio-renderer";

type ParsedDetail = Record<string, string>;

type TimingSummary = {
  samples: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
};

type RendererAttemptSummary = {
  success: number;
  failure: number;
  successRate: number;
  timingMs: TimingSummary;
};

export type HybridRendererSummary = {
  window: {
    sinceTs: number;
    untilTs: number;
    hours: number;
    totalEvents: number;
    sampledEvents: number;
  };
  selection: {
    totalPlans: number;
    heavyPlans: number;
    canaryMatchedPlans: number;
    selected: Record<StudioRenderEngine, number>;
  };
  attempts: {
    total: number;
    success: number;
    failure: number;
    successRate: number;
    byRenderer: Record<StudioRenderEngine, RendererAttemptSummary>;
  };
  fallback: {
    count: number;
    routes: Record<string, number>;
  };
  heavyJobs: {
    sessions: number;
    sessionsWithAttempts: number;
    successSessions: number;
    failedSessions: number;
    successRate: number;
    attemptTimingMs: TimingSummary;
    renderPipelineMs: TimingSummary;
  };
};

function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function parseDetailMap(detail: string | undefined): ParsedDetail {
  const raw = String(detail || "").trim();
  if (!raw) return {};
  const out: ParsedDetail = {};
  const chunks = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  for (const chunk of chunks) {
    const eq = chunk.indexOf("=");
    if (eq <= 0) continue;
    const key = chunk.slice(0, eq).trim();
    const value = chunk.slice(eq + 1).trim();
    if (!key) continue;
    out[key] = value;
  }
  return out;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const clamped = Math.max(0, Math.min(100, p));
  const idx = Math.min(sorted.length - 1, Math.floor(((sorted.length - 1) * clamped) / 100));
  return sorted[idx];
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, cur) => acc + cur, 0) / values.length;
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

function toTimingSummary(values: number[]): TimingSummary {
  return {
    samples: values.length,
    avg: average(values),
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
  };
}

function normalizeRenderer(value: string | undefined): StudioRenderEngine | null {
  if (value === "client_wasm" || value === "server_native") return value;
  return null;
}

function bumpRouteCounter(map: Record<string, number>, route: string): void {
  const key = route.trim();
  if (!key) return;
  map[key] = (map[key] || 0) + 1;
}

export function summarizeHybridRenderer(params: {
  events: WorkflowTelemetryRecord[];
  nowTs?: number;
  hours?: number;
}): HybridRendererSummary {
  const nowTs = Number.isFinite(params.nowTs) ? Number(params.nowTs) : Date.now();
  const hours = Number.isFinite(params.hours) ? Math.max(1, Math.floor(Number(params.hours))) : 24;
  const sinceTs = nowTs - hours * 60 * 60 * 1000;
  const scoped = params.events.filter((event) => Number(event.ts) >= sinceTs && Number(event.ts) <= nowTs);

  const selected: Record<StudioRenderEngine, number> = {
    client_wasm: 0,
    server_native: 0,
  };
  let totalPlans = 0;
  let heavyPlans = 0;
  let canaryMatchedPlans = 0;
  const sessionPlanById = new Map<string, { heavyJob: boolean }>();
  const heavySessionIds = new Set<string>();

  for (const event of scoped) {
    if (event.name !== "stage_timing" || event.stage !== "renderer_plan") continue;
    totalPlans += 1;
    const detailMap = parseDetailMap(event.detail);
    const selectedRenderer = normalizeRenderer(detailMap.selected);
    if (selectedRenderer) {
      selected[selectedRenderer] += 1;
    }
    const heavyJob = detailMap.heavy_job === "1";
    if (heavyJob) {
      heavyPlans += 1;
    }
    if (detailMap.canary === "1") {
      canaryMatchedPlans += 1;
    }
    const sessionId = String(event.sessionId || "").trim();
    if (sessionId) {
      sessionPlanById.set(sessionId, { heavyJob });
      if (heavyJob) {
        heavySessionIds.add(sessionId);
      }
    }
  }

  const byRendererSuccess: Record<StudioRenderEngine, number> = {
    client_wasm: 0,
    server_native: 0,
  };
  const byRendererFailure: Record<StudioRenderEngine, number> = {
    client_wasm: 0,
    server_native: 0,
  };
  const byRendererTiming: Record<StudioRenderEngine, number[]> = {
    client_wasm: [],
    server_native: [],
  };
  let totalAttempts = 0;
  let successAttempts = 0;
  let failedAttempts = 0;

  const heavySessionAttemptStatus = new Map<string, { hasAttempt: boolean; success: boolean; failure: boolean }>();
  const heavyAttemptTimingValues: number[] = [];
  const heavyRenderPipelineValues: number[] = [];

  const fallbackRoutes: Record<string, number> = {};
  let fallbackCount = 0;

  for (const event of scoped) {
    if (event.name === "stage_timing" && event.stage === "renderer_attempt") {
      const detailMap = parseDetailMap(event.detail);
      const renderer = normalizeRenderer(detailMap.renderer);
      if (!renderer) continue;
      totalAttempts += 1;
      const attemptMs = parseNumber(detailMap.attempt_ms);
      if (event.status === "success") {
        successAttempts += 1;
        byRendererSuccess[renderer] += 1;
        if (attemptMs !== null && attemptMs >= 0) {
          byRendererTiming[renderer].push(attemptMs);
        }
      } else if (event.status === "failure") {
        failedAttempts += 1;
        byRendererFailure[renderer] += 1;
      }

      const sessionId = String(event.sessionId || "").trim();
      if (sessionId && sessionPlanById.get(sessionId)?.heavyJob) {
        const current = heavySessionAttemptStatus.get(sessionId) || {
          hasAttempt: false,
          success: false,
          failure: false,
        };
        current.hasAttempt = true;
        if (event.status === "success") current.success = true;
        if (event.status === "failure") current.failure = true;
        heavySessionAttemptStatus.set(sessionId, current);
        if (event.status === "success" && attemptMs !== null && attemptMs >= 0) {
          heavyAttemptTimingValues.push(attemptMs);
        }
      }
      continue;
    }

    if (event.name === "stage_timing" && event.stage === "renderer_fallback") {
      fallbackCount += 1;
      const detailMap = parseDetailMap(event.detail);
      const from = detailMap.from || "unknown";
      const to = detailMap.to || "unknown";
      bumpRouteCounter(fallbackRoutes, `${from}->${to}`);
      continue;
    }

    if (event.name === "render_succeeded" && event.stage === "render") {
      const sessionId = String(event.sessionId || "").trim();
      if (!sessionId || !sessionPlanById.get(sessionId)?.heavyJob) continue;
      const detailMap = parseDetailMap(event.detail);
      const pipelineMs = parseNumber(detailMap.render_pipeline_ms);
      if (pipelineMs !== null && pipelineMs >= 0) {
        heavyRenderPipelineValues.push(pipelineMs);
      }
    }
  }

  let heavySessionsWithAttempts = 0;
  let heavySuccessSessions = 0;
  let heavyFailedSessions = 0;
  for (const sessionId of heavySessionIds) {
    const status = heavySessionAttemptStatus.get(sessionId);
    if (!status || !status.hasAttempt) continue;
    heavySessionsWithAttempts += 1;
    if (status.success) {
      heavySuccessSessions += 1;
    } else if (status.failure) {
      heavyFailedSessions += 1;
    }
  }

  const byRenderer: Record<StudioRenderEngine, RendererAttemptSummary> = {
    client_wasm: {
      success: byRendererSuccess.client_wasm,
      failure: byRendererFailure.client_wasm,
      successRate: ratio(byRendererSuccess.client_wasm, byRendererSuccess.client_wasm + byRendererFailure.client_wasm),
      timingMs: toTimingSummary(byRendererTiming.client_wasm),
    },
    server_native: {
      success: byRendererSuccess.server_native,
      failure: byRendererFailure.server_native,
      successRate: ratio(byRendererSuccess.server_native, byRendererSuccess.server_native + byRendererFailure.server_native),
      timingMs: toTimingSummary(byRendererTiming.server_native),
    },
  };

  return {
    window: {
      sinceTs,
      untilTs: nowTs,
      hours,
      totalEvents: params.events.length,
      sampledEvents: scoped.length,
    },
    selection: {
      totalPlans,
      heavyPlans,
      canaryMatchedPlans,
      selected,
    },
    attempts: {
      total: totalAttempts,
      success: successAttempts,
      failure: failedAttempts,
      successRate: ratio(successAttempts, successAttempts + failedAttempts),
      byRenderer,
    },
    fallback: {
      count: fallbackCount,
      routes: fallbackRoutes,
    },
    heavyJobs: {
      sessions: heavySessionIds.size,
      sessionsWithAttempts: heavySessionsWithAttempts,
      successSessions: heavySuccessSessions,
      failedSessions: heavyFailedSessions,
      successRate: ratio(heavySuccessSessions, heavySessionsWithAttempts),
      attemptTimingMs: toTimingSummary(heavyAttemptTimingValues),
      renderPipelineMs: toTimingSummary(heavyRenderPipelineValues),
    },
  };
}
