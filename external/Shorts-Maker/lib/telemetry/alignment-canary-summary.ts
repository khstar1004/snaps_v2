import type { WorkflowTelemetryRecord } from "@/lib/publish/publish-store";

type ParsedDetail = Record<string, string>;

export type AlignmentCanarySummary = {
  window: {
    sinceTs: number;
    untilTs: number;
    hours: number;
    totalEvents: number;
    sampledEvents: number;
  };
  renderApi: {
    success: number;
    failure: number;
    successRate: number;
  };
  provider: {
    requested: Record<string, number>;
    resolved: Record<string, number>;
  };
  canary: {
    renders: number;
    fallbackRenders: number;
    fallbackRate: number;
  };
  forced: {
    renders: number;
    fallbackRenders: number;
    fallbackRate: number;
  };
  timing: {
    renderApiMs: {
      samples: number;
      avg: number;
      p50: number;
      p95: number;
      p99: number;
    };
    ttsServerMs: {
      samples: number;
      avg: number;
      p50: number;
      p95: number;
      p99: number;
    };
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
  const chunks = raw.split(",").map((item) => item.trim()).filter(Boolean);
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

function bump(map: Record<string, number>, key: string): void {
  const safe = key.trim();
  if (!safe) return;
  map[safe] = (map[safe] || 0) + 1;
}

export function summarizeAlignmentCanary(params: {
  events: WorkflowTelemetryRecord[];
  nowTs?: number;
  hours?: number;
}): AlignmentCanarySummary {
  const nowTs = Number.isFinite(params.nowTs) ? Number(params.nowTs) : Date.now();
  const hours = Number.isFinite(params.hours) ? Math.max(1, Math.floor(Number(params.hours))) : 24;
  const sinceTs = nowTs - hours * 60 * 60 * 1000;
  const scoped = params.events.filter((event) => Number(event.ts) >= sinceTs && Number(event.ts) <= nowTs);

  let renderApiSuccess = 0;
  let renderApiFailure = 0;
  let canaryRenders = 0;
  let canaryFallbackRenders = 0;
  let forcedRenders = 0;
  let forcedFallbackRenders = 0;

  const requestedProvider: Record<string, number> = {};
  const resolvedProvider: Record<string, number> = {};
  const renderApiMsValues: number[] = [];
  const ttsServerMsValues: number[] = [];

  for (const event of scoped) {
    if (event.name !== "stage_timing" || event.stage !== "render_api") continue;
    const detailMap = parseDetailMap(event.detail);

    if (event.status === "success") {
      renderApiSuccess += 1;
      const renderApiMs = parseNumber(detailMap.render_api_ms);
      if (renderApiMs !== null && renderApiMs >= 0) {
        renderApiMsValues.push(renderApiMs);
      }
      const ttsMs = parseNumber(detailMap.tts_server_ms);
      if (ttsMs !== null && ttsMs >= 0) {
        ttsServerMsValues.push(ttsMs);
      }
      const requested = String(detailMap.alignment_provider || "").trim();
      const resolved = String(detailMap.alignment_resolved || requested || "").trim();
      if (requested) {
        bump(requestedProvider, requested);
        if (detailMap.alignment_forced === "1") {
          forcedRenders += 1;
        }
      }
      if (resolved) {
        bump(resolvedProvider, resolved);
      }

      const canary = detailMap.alignment_canary === "1";
      const fallback = detailMap.alignment_fallback === "1";
      if (canary) {
        canaryRenders += 1;
        if (fallback) canaryFallbackRenders += 1;
      }
      if (detailMap.alignment_forced === "1" && fallback) {
        forcedFallbackRenders += 1;
      }
      continue;
    }

    if (event.status === "failure") {
      renderApiFailure += 1;
    }
  }

  return {
    window: {
      sinceTs,
      untilTs: nowTs,
      hours,
      totalEvents: params.events.length,
      sampledEvents: scoped.length,
    },
    renderApi: {
      success: renderApiSuccess,
      failure: renderApiFailure,
      successRate: ratio(renderApiSuccess, renderApiSuccess + renderApiFailure),
    },
    provider: {
      requested: requestedProvider,
      resolved: resolvedProvider,
    },
    canary: {
      renders: canaryRenders,
      fallbackRenders: canaryFallbackRenders,
      fallbackRate: ratio(canaryFallbackRenders, canaryRenders),
    },
    forced: {
      renders: forcedRenders,
      fallbackRenders: forcedFallbackRenders,
      fallbackRate: ratio(forcedFallbackRenders, forcedRenders),
    },
    timing: {
      renderApiMs: {
        samples: renderApiMsValues.length,
        avg: average(renderApiMsValues),
        p50: percentile(renderApiMsValues, 50),
        p95: percentile(renderApiMsValues, 95),
        p99: percentile(renderApiMsValues, 99),
      },
      ttsServerMs: {
        samples: ttsServerMsValues.length,
        avg: average(ttsServerMsValues),
        p50: percentile(ttsServerMsValues, 50),
        p95: percentile(ttsServerMsValues, 95),
        p99: percentile(ttsServerMsValues, 99),
      },
    },
  };
}
