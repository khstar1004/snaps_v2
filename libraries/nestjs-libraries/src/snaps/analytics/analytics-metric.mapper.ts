import { AnalyticsData } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { SnapsMetricInput } from '@gitroom/nestjs-libraries/snaps/analytics/report-generator.service';
import { snapsComposeHangul } from '@gitroom/nestjs-libraries/snaps/text/compose-hangul';

type SnapsAnalyticsPoint = {
  total?: unknown;
  value?: unknown;
  count?: unknown;
  metricValue?: unknown;
  date?: string;
  collectedAt?: string;
  createdAt?: string;
};

export function snapsAnalyticsToMetricInputs(
  source: string,
  analytics?: AnalyticsData[] | null
): SnapsMetricInput[] {
  if (!Array.isArray(analytics)) {
    return [];
  }

  return analytics.flatMap((metric) => {
    const rows: SnapsAnalyticsPoint[] = Array.isArray(metric?.data)
      ? metric.data
      : [];
    return rows.map((point) => ({
      platform: source,
      metricKey: normalizeMetricKey(metric?.label),
      metricValue: preserveMetricValue(
        point?.total ?? point?.value ?? point?.count ?? point?.metricValue
      ),
      collectedAt:
        point?.date || point?.collectedAt || point?.createdAt || new Date().toISOString(),
    }));
  });
}

function normalizeMetricKey(value?: string) {
  // Composed first. Decomposed `좋아요` and `댓글` both stripped to nothing and
  // fell back to the literal `metric`, so the report added two different
  // metrics together under one key.
  return (snapsComposeHangul(value) || 'metric')
    .trim()
    .toLowerCase()
    .replace(/[^\w가-힣]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'metric';
}

/**
 * Hands the value over as the provider wrote it.
 *
 * This used to be `Number(value ?? 0)` with a `Number.isFinite` fallback to 0 -
 * a second copy of the report's own `numeric()`, running first. The report
 * already converts, and it already counts the values it could not read so the
 * operator is told before reading the figures. Converting here deleted that
 * evidence: `total: '1,200'` - which is what a dashboard displays, and what
 * providers that format their numbers return - arrived as a finite 0, the
 * unreadable count stayed at 0, and the report stated `참여 행동은 총 0건입니다`
 * as a fact.
 *
 * Only two adjustments remain, and neither invents a number: an absent value
 * stays 0 as it is on every other intake path, and a value that is not a
 * primitive is stringified so it reaches the report as something it can
 * recognise as unreadable rather than as a silent zero.
 */
function preserveMetricValue(value: unknown): number | string {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  return String(value);
}
