import { Injectable } from '@nestjs/common';
import { OllamaClient } from '@gitroom/nestjs-libraries/snaps/ai/ollama.client';
import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';
import { snapsComposeHangul } from '@gitroom/nestjs-libraries/snaps/text/compose-hangul';

export type SnapsMetricInput = {
  platform: string;
  postId?: string;
  metricKey: string;
  /**
   * As supplied, not as coerced. `normalizeRows()` converts and
   * `countUnreadableValues()` counts what it could not read - both need the
   * original. A producer that calls `Number()` first hands over a 0 that is
   * indistinguishable from a real zero, and the warning below goes quiet on
   * that path while the report states the figure as fact.
   */
  metricValue: number | string;
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
    const rows = Array.isArray(request.metrics) ? request.metrics : [];
    const metrics = this.normalizeRows(rows);
    // Counted before anything is grouped: a value that could not be read is
    // indistinguishable from a real zero once it is in the totals, and the
    // report would state it as a fact.
    const unreadable = this.countUnreadableValues(rows);
    const grouped = this.groupMetrics(metrics);
    const charts = this.chartSeries(metrics);
    const trends = this.trendSummary(metrics);
    const deterministicInsights = this.deterministicInsights(grouped, trends);
    const actionItems = this.actionItems(grouped, trends, unreadable);

    const fallbackSummary = deterministicInsights.join(' ');
    let aiSummary: string | undefined;
    try {
      const response = await this.ollama.chatJson<Record<string, unknown>>([
        {
          role: 'system',
          content:
            'You are snaps analytics. Return JSON only with a concise Korean executive summary. Do not invent metrics.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Write a concise Korean executive summary of this report.',
            // The output key has to be pinned: asking only for "an executive
            // summary" let models answer {"executiveSummary": "..."}, which was
            // silently dropped and replaced by the deterministic fallback.
            outputShape: { summary: 'string' },
            rules: [
              'Return a JSON object whose only key is "summary".',
              'Write in Korean.',
              'Do not invent metrics that are not in the input.',
            ],
            title: request.title || 'snaps performance report',
            grouped,
            trends,
            deterministicInsights,
            actionItems,
          }),
        },
      ]);
      aiSummary = this.normalizeSummary(this.pickSummaryField(response));
    } catch {
      aiSummary = undefined;
    }

    return {
      // Every other field here is deterministic by design; the summary is the
      // one part the model writes. Reporting which of the two produced it
      // matches the label the transform, card news and shorts results carry,
      // and replaces the live smoke guessing by comparing the summary to the
      // insights joined together.
      // The engine that actually answered; was the literal 'ollama'.
      provider: aiSummary ? this.ollama.provider() : 'rule-fallback',
      title: request.title || 'snaps 성과 분석 보고서',
      ...this.reportPeriod(request, metrics),
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

  /**
   * How many supplied values `numeric()` had to call zero.
   *
   * Measured: `metricValue: "1,200"` - the shape a dashboard displays and an
   * operator pastes into the manual metric JSON - comes back as 0, and the
   * report then states `참여 행동은 총 0건입니다` as a fact. Stripping the
   * separator would be a guess about the locale, since in several a comma is
   * the decimal point. Saying the value could not be read is not a guess.
   *
   * An absent value is not counted: leaving a metric out is not the same as
   * writing one that cannot be read.
   */
  private countUnreadableValues(metrics: unknown[]) {
    return metrics.filter((metric) => {
      if (!metric || typeof metric !== 'object') {
        return false;
      }
      const value = (metric as { metricValue?: unknown }).metricValue;
      if (value === undefined || value === null || value === '') {
        return false;
      }
      return !Number.isFinite(Number(value));
    }).length;
  }

  /**
   * Even with the shape pinned in the prompt, models occasionally rename the
   * key. Accept the common variants before falling back to the deterministic
   * summary so a working LLM response is never silently discarded.
   */
  private pickSummaryField(response: Record<string, unknown> | null | undefined) {
    if (!response || typeof response !== 'object') {
      return undefined;
    }

    const candidates = [
      'summary',
      'executiveSummary',
      'executive_summary',
      'reportSummary',
      'report_summary',
    ];
    for (const key of candidates) {
      const value = response[key];
      if (typeof value === 'string' ? value.trim() : Array.isArray(value) && value.length) {
        return value;
      }
    }
    return undefined;
  }

  private normalizeSummary(value: unknown) {
    const summary = Array.isArray(value)
      ? value.map((item) => String(item || '').trim()).filter(Boolean).join(' ')
      : typeof value === 'string'
      ? value.trim()
      : '';
    return summary ? snapsClampText(summary, 2000) : undefined;
  }

  private text(value: unknown, fallback = '', maxLength = 1000) {
    const text = typeof value === 'string' ? value : '';
    return snapsClampText(text.trim().replace(/\s+/g, ' ') || fallback, maxLength);
  }

  /**
   * Groups caller-supplied metrics by platform and metric key.
   *
   * Both keys come straight from the request body - /snaps/report/generate
   * normalises `platform` with `String(metric.platform || 'unknown')` and no
   * allowlist - and they used to index plain object literals. `all['__proto__']`
   * on a normal object is Object.prototype, which is truthy, so `|| {}` never
   * fired and the next line wrote onto the prototype. Measured: one request
   * carrying platform "__proto__" left every plain object in the backend
   * process reporting the metric value, for the life of the process.
   *
   * The inner map matters too, for a quieter reason: `metricKey: 'toString'`
   * read a function out of the prototype, so `(fn || 0) + value` produced a
   * string and every later sum on that key was string concatenation.
   *
   * Null-prototype objects remove both without needing the keys to be
   * validated. Object.entries, JSON.stringify and spreading all still work.
   */
  private groupMetrics(metrics: NormalizedMetricRow[]) {
    const all = Object.create(null) as Record<string, Record<string, number>>;
    for (const metric of metrics) {
      all[metric.platform] =
        all[metric.platform] || (Object.create(null) as Record<string, number>);
      all[metric.platform][metric.metricKey] =
        (all[metric.platform][metric.metricKey] || 0) + Number(metric.metricValue || 0);
    }
    return all;
  }

  private chartSeries(metrics: NormalizedMetricRow[]) {
    // Same null-prototype treatment as groupMetrics. This key happens to be
    // safe today because it always contains "::", so it can never equal
    // __proto__ - but that is a property of the separator, not a decision, and
    // it would stop holding the moment the key format changed.
    const series = Object.create(null) as Record<
      string,
      { platform: string; metricKey: string; points: Array<{ date: string; value: number }> }
    >;
    for (const metric of metrics) {
      const key = `${metric.platform}::${metric.metricKey}`;
      series[key] = series[key] || {
        platform: metric.platform,
        metricKey: metric.metricKey,
        points: [],
      };
      series[key].points.push({
        date: metric.collectedAt,
        value: metric.metricValue,
      });
    }

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
          `${platform}의 ${growing.metricKey} 지표가 기간 내 ` +
            `${this.formatDelta(growing.delta)}${this.formatRate(growing)} 증가했습니다.`
        );
      }
    }

    return insights.length
      ? insights
      : ['분석할 지표가 아직 없습니다. 플랫폼 analytics 또는 수동 metric JSON을 먼저 수집하세요.'];
  }

  private actionItems(
    grouped: Record<string, Record<string, number>>,
    trends: ReturnType<SnapsReportGeneratorService['trendSummary']>,
    unreadableValues = 0
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
          `${platform}: ${declining.metricKey} 지표가 ` +
            `${this.formatDelta(declining.delta)}${this.formatRate(declining)} ` +
            '하락했습니다. 원인을 게시 시간, 후킹 문장, 썸네일 기준으로 점검하세요.'
        );
      }
    }

    if (unreadableValues > 0) {
      // First, because every number below it was computed without those
      // values and the operator has to know that before reading them.
      actions.unshift(
        `지표 값 ${unreadableValues}개를 숫자로 읽지 못해 0으로 계산했습니다. ` +
          '천 단위 구분 기호나 % 기호를 빼고 숫자만 넣어 다시 집계하세요.'
      );
    }

    return actions.length
      ? actions
      : ['최근 성과가 좋은 콘텐츠의 주제, 첫 문장, 해시태그를 RAG 예시로 저장해 다음 변환에 반영하세요.'];
  }

  private normalizeKey(value: string) {
    // Composed first. Decomposed `좋아요` and `댓글` both stripped to an empty
    // key, so the report grouped two different metrics as one.
    return (snapsComposeHangul(value) || 'metric')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9가-힣]+/gi, '_')
      .replace(/^_+|_+$/g, '');
  }

  /**
   * The window the report actually covers.
   *
   * periodStart and periodEnd were accepted from the request and echoed back,
   * and nothing ever filled them: /report/from-platform-analytics does not pass
   * them and the workspace does not send them, so every report said "노출 3,000회"
   * with no window attached. The metrics carry collectedAt, which is where the
   * trend chart already gets its x-axis from, so the period is derivable rather
   * than missing. An explicit request value still wins.
   */
  private reportPeriod(
    request: { periodStart?: string; periodEnd?: string },
    metrics: NormalizedMetricRow[]
  ) {
    const dates = metrics
      .map((metric) => String(metric.collectedAt || '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    return {
      periodStart: request.periodStart || dates[0] || undefined,
      periodEnd: request.periodEnd || dates[dates.length - 1] || undefined,
    };
  }

  private formatDelta(value: number) {
    return value > 0 ? `+${value}` : String(value);
  }

  /**
   * The rate that goes with an absolute change, or nothing when there is no
   * honest one to report.
   *
   * trendSummary computes deltaRate and nothing read it, so every insight said
   * "+600 증가" - a number that means nothing without the 1,200 it started
   * from. The omission when firstValue is 0 is deliberate rather than a guard
   * against dividing: deltaRate is defined as 0 in that case, so a metric that
   * went from 0 to 1,800 would otherwise be reported as growing 0%.
   *
   * A negative starting value is the same problem with the sign flipped, and
   * `!trend.firstValue` did not catch it. Measured: a metric that went from
   * -100 to 50 was reported as `+150(-150%) 증가했습니다` - the sentence says
   * it grew and the number beside it says it shrank by half again. Metric
   * values arrive from imported JSON as well as from the platforms, and a
   * follower delta is legitimately negative.
   */
  private formatRate(trend: { firstValue: number; deltaRate: number }) {
    if (trend.firstValue <= 0 || !Number.isFinite(trend.deltaRate)) {
      return '';
    }
    const percent = trend.deltaRate * 100;
    const rounded = Math.abs(percent) >= 10 ? Math.round(percent) : Number(percent.toFixed(1));
    return `(${rounded > 0 ? '+' : ''}${rounded}%)`;
  }
}
