import { Injectable } from '@nestjs/common';
import { OllamaClient } from '@gitroom/nestjs-libraries/snaps/ai/ollama.client';

export type SnapsMetricInput = {
  platform: string;
  postId?: string;
  metricKey: string;
  metricValue: number;
  collectedAt: string;
};

export type SnapsReportRequest = {
  title?: string;
  periodStart?: string;
  periodEnd?: string;
  metrics: SnapsMetricInput[];
};

type NormalizedMetricRow = {
  platform: string;
  metricKey: string;
  metricValue: number;
  collectedAt: string;
};

@Injectable()
export class SnapsReportGeneratorService {
  constructor(private readonly ollama: OllamaClient) {}

  async generate(body: Partial<SnapsReportRequest> | null = { metrics: [] }) {
    const request = this.normalizeRequest(body);
    const metrics = this.normalizeRows(
      Array.isArray(request.metrics) ? request.metrics : []
    );
    const grouped = this.groupMetrics(metrics);
    const charts = this.chartSeries(metrics);
    const trends = this.trendSummary(metrics);
    const deterministicInsights = this.deterministicInsights(grouped, trends);
    const actionItems = this.actionItems(grouped, trends);

    const fallbackSummary = deterministicInsights.join(' ');
    let aiSummary: string | undefined;
    try {
      const response = await this.ollama.chatJson<{ summary?: unknown }>([
        {
          role: 'system',
          content:
            'You are snaps analytics. Return JSON only with a concise Korean executive summary. Do not invent metrics.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            title: request.title || 'snaps performance report',
            grouped,
            trends,
            deterministicInsights,
            actionItems,
          }),
        },
      ]);
      aiSummary = this.normalizeSummary(response.summary);
    } catch {
      aiSummary = undefined;
    }

    return {
      title: request.title || 'snaps 성과 분석 보고서',
      periodStart: request.periodStart,
      periodEnd: request.periodEnd,
      summary: aiSummary || fallbackSummary,
      metrics: grouped,
      charts,
      trends,
      insights: deterministicInsights,
      actionItems,
      generatedAt: new Date().toISOString(),
    };
  }

  private normalizeRequest(
    body: Partial<SnapsReportRequest> | null | undefined
  ): SnapsReportRequest {
    const request =
      body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    return {
      title: this.text(request.title, '', 160) || undefined,
      periodStart: this.text(request.periodStart, '', 80) || undefined,
      periodEnd: this.text(request.periodEnd, '', 80) || undefined,
      metrics: Array.isArray(request.metrics) ? request.metrics : [],
    };
  }

  private normalizeRows(metrics: unknown[]): NormalizedMetricRow[] {
    return metrics
      .filter(
        (metric): metric is Partial<SnapsMetricInput> =>
          !!metric && typeof metric === 'object'
      )
      .map((metric) => ({
        platform: String(metric.platform || 'unknown'),
        metricKey: this.normalizeKey(metric.metricKey),
        metricValue: this.numeric(metric.metricValue),
        collectedAt: metric.collectedAt || new Date().toISOString(),
      }))
      .filter((metric) => Number.isFinite(metric.metricValue));
  }

  private numeric(value: unknown) {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private normalizeSummary(value: unknown) {
    const summary = Array.isArray(value)
      ? value.map((item) => String(item || '').trim()).filter(Boolean).join(' ')
      : typeof value === 'string'
      ? value.trim()
      : '';
    return summary ? summary.slice(0, 2000) : undefined;
  }

  private text(value: unknown, fallback = '', maxLength = 1000) {
    const text = typeof value === 'string' ? value : '';
    return (text.trim().replace(/\s+/g, ' ') || fallback).slice(0, maxLength);
  }

  private groupMetrics(metrics: NormalizedMetricRow[]) {
    return metrics.reduce<Record<string, Record<string, number>>>((all, metric) => {
      all[metric.platform] = all[metric.platform] || {};
      all[metric.platform][metric.metricKey] =
        (all[metric.platform][metric.metricKey] || 0) + Number(metric.metricValue || 0);
      return all;
    }, {});
  }

  private chartSeries(metrics: NormalizedMetricRow[]) {
    const series = metrics.reduce<
      Record<string, { platform: string; metricKey: string; points: Array<{ date: string; value: number }> }>
    >((all, metric) => {
      const key = `${metric.platform}::${metric.metricKey}`;
      all[key] = all[key] || {
        platform: metric.platform,
        metricKey: metric.metricKey,
        points: [],
      };
      all[key].points.push({
        date: metric.collectedAt,
        value: metric.metricValue,
      });
      return all;
    }, {});

    return Object.values(series).map((item) => ({
      ...item,
      points: item.points.sort((a, b) => a.date.localeCompare(b.date)),
    }));
  }

  private trendSummary(metrics: NormalizedMetricRow[]) {
    const byMetric = this.chartSeries(metrics);
    return byMetric
      .map((series) => {
        const first = series.points[0];
        const last = series.points[series.points.length - 1];
        const delta = last && first ? last.value - first.value : 0;
        const deltaRate = first?.value ? delta / first.value : 0;
        return {
          platform: series.platform,
          metricKey: series.metricKey,
          firstValue: first?.value || 0,
          lastValue: last?.value || 0,
          delta,
          deltaRate,
        };
      })
      .filter((item) => item.firstValue !== item.lastValue);
  }

  private deterministicInsights(
    grouped: Record<string, Record<string, number>>,
    trends: ReturnType<SnapsReportGeneratorService['trendSummary']>
  ) {
    const insights: string[] = [];
    for (const [platform, metrics] of Object.entries(grouped)) {
      const impressions =
        metrics.impressions || metrics.impression || metrics.reach || metrics.views || 0;
      const engagement =
        (metrics.likes || 0) +
        (metrics.like || 0) +
        (metrics.comments || 0) +
        (metrics.comment || 0) +
        (metrics.shares || 0) +
        (metrics.share || 0) +
        (metrics.saves || 0) +
        (metrics.clicks || 0);
      if (impressions > 0) {
        insights.push(
          `${platform}의 추정 참여율은 ${((engagement / impressions) * 100).toFixed(2)}%입니다.`
        );
      } else {
        insights.push(`${platform}에서 추적된 참여 행동은 총 ${engagement}건입니다.`);
      }

      const growing = trends
        .filter((trend) => trend.platform === platform && trend.delta > 0)
        .sort((a, b) => b.delta - a.delta)[0];
      if (growing) {
        insights.push(
          `${platform}의 ${growing.metricKey} 지표가 기간 내 ${this.formatDelta(growing.delta)} 증가했습니다.`
        );
      }
    }

    return insights.length
      ? insights
      : ['분석할 지표가 아직 없습니다. 플랫폼 analytics 또는 수동 metric JSON을 먼저 수집하세요.'];
  }

  private actionItems(
    grouped: Record<string, Record<string, number>>,
    trends: ReturnType<SnapsReportGeneratorService['trendSummary']>
  ) {
    const actions: string[] = [];
    for (const [platform, metrics] of Object.entries(grouped)) {
      const impressions =
        metrics.impressions || metrics.impression || metrics.reach || metrics.views || 0;
      const comments = (metrics.comments || 0) + (metrics.comment || 0);
      const shares = (metrics.shares || 0) + (metrics.share || 0);
      const likes = (metrics.likes || 0) + (metrics.like || 0);

      if (impressions > 0 && comments / impressions < 0.002) {
        actions.push(`${platform}: 다음 게시물에는 질문형 CTA를 넣어 댓글 반응을 유도하세요.`);
      }
      if (shares > likes && shares > 0) {
        actions.push(`${platform}: 공유 반응이 강하므로 요약 카드나 체크리스트형 후속 콘텐츠로 확장하세요.`);
      }

      const declining = trends
        .filter((trend) => trend.platform === platform && trend.delta < 0)
        .sort((a, b) => a.delta - b.delta)[0];
      if (declining) {
        actions.push(
          `${platform}: ${declining.metricKey} 하락 원인을 게시 시간, 후킹 문장, 썸네일 기준으로 점검하세요.`
        );
      }
    }

    return actions.length
      ? actions
      : ['최근 성과가 좋은 콘텐츠의 주제, 첫 문장, 해시태그를 RAG 예시로 저장해 다음 변환에 반영하세요.'];
  }

  private normalizeKey(value: string) {
    return String(value || 'metric')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9가-힣]+/gi, '_')
      .replace(/^_+|_+$/g, '');
  }

  private formatDelta(value: number) {
    return value > 0 ? `+${value}` : String(value);
  }
}
