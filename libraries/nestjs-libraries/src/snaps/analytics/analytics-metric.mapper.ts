import { AnalyticsData } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { SnapsMetricInput } from '@gitroom/nestjs-libraries/snaps/analytics/report-generator.service';

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
      metricValue: normalizeMetricValue(
        point?.total ?? point?.value ?? point?.count ?? point?.metricValue
      ),
      collectedAt:
        point?.date || point?.collectedAt || point?.createdAt || new Date().toISOString(),
    }));
  });
}

function normalizeMetricKey(value?: string) {
  return String(value || 'metric')
    .trim()
    .toLowerCase()
    .replace(/[^\w가-힣]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'metric';
}

function normalizeMetricValue(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}
