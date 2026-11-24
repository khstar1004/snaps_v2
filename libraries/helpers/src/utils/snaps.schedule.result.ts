export type SnapsScheduleResultSummary = {
  /** Post records the scheduler actually created. */
  created: number;
  warnings: string[];
  duplicate: boolean;
};

type ResultNode = {
  scheduled?: unknown;
  warnings?: unknown;
  duplicate?: unknown;
  rows?: unknown;
  items?: unknown;
};

const asNode = (value: unknown): ResultNode =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as ResultNode) : {};

/**
 * Reads every snaps schedule response shape: a direct `{ scheduled, warnings }`, a
 * queue of `rows`/`items` each carrying their own, or an approval response whose
 * `scheduled` field is itself a result. Counts created posts instead of input items.
 */
export const summarizeSnapsScheduleResult = (response: unknown): SnapsScheduleResultSummary => {
  const summary: SnapsScheduleResultSummary = { created: 0, warnings: [], duplicate: false };
  const visit = (value: unknown, depth: number) => {
    const node = asNode(value);
    if (depth > 3) {
      return;
    }
    if (Array.isArray(node.scheduled)) {
      summary.created += node.scheduled.length;
    } else if (node.scheduled && typeof node.scheduled === 'object') {
      visit(node.scheduled, depth + 1);
    }
    if (Array.isArray(node.warnings)) {
      summary.warnings.push(...node.warnings.filter((item): item is string => typeof item === 'string'));
    }
    if (node.duplicate === true) {
      summary.duplicate = true;
    }
    for (const list of [node.rows, node.items]) {
      if (Array.isArray(list)) {
        list.forEach((entry) => visit(entry, depth + 1));
      }
    }
  };
  visit(response, 0);
  summary.warnings = Array.from(new Set(summary.warnings));
  return summary;
};

/** Korean toast copy for a schedule result; `ok` is false when nothing was created. */
export const describeSnapsScheduleResult = (label: string, response: unknown) => {
  const summary = summarizeSnapsScheduleResult(response);
  if (summary.duplicate && !summary.created) {
    return { ok: false, tone: 'warning' as const, message: `${label}: 이미 만든 게시물이라 다시 만들지 않았습니다.`, summary };
  }
  if (!summary.created) {
    return {
      ok: false,
      tone: 'warning' as const,
      message: `${label}: 만들어진 게시물이 없습니다.${summary.warnings[0] ? ` ${summary.warnings[0]}` : ''}`,
      summary,
    };
  }
  if (summary.duplicate) {
    return { ok: true, tone: 'warning' as const, message: `${label}: 같은 게시물이 이미 있어 중복 생성하지 않았습니다.`, summary };
  }
  if (summary.warnings.length) {
    return {
      ok: true,
      tone: 'warning' as const,
      message: `${label}: ${summary.created}개 생성 · 확인 필요: ${summary.warnings[0]}`,
      summary,
    };
  }
  return { ok: true, tone: undefined as 'warning' | undefined, message: `${label}: ${summary.created}개 생성 완료`, summary };
};
