import { BadRequestException, Injectable } from '@nestjs/common';
import { SnapsSourceLibraryInputDto } from '@gitroom/nestjs-libraries/snaps/dto/source-library.dto';
import {
  SnapsTargetPlatform,
  snapsPlatformRules,
  snapsTargetPlatforms,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';

export type SnapsTrendRadarStage =
  | 'emerging'
  | 'accelerating'
  | 'mainstream'
  | 'fatigue'
  | 'risk';

export type SnapsTrendRadarCategory =
  | 'keyword'
  | 'hashtag'
  | 'competitor'
  | 'audience'
  | 'visual'
  | 'audio'
  | 'risk';

export type SnapsTrendRadarSentiment =
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'mixed';

export type SnapsTrendRadarRequest = {
  title?: unknown;
  industry?: unknown;
  region?: unknown;
  windowDays?: unknown;
  keywords?: unknown;
  targetPlatforms?: unknown;
  sourceText?: unknown;
  importText?: unknown;
  items?: unknown;
  listeningPreview?: unknown;
  competitorSummary?: unknown;
  hashtagTrackerPreview?: unknown;
  tone?: unknown;
  maxTrends?: unknown;
};

export type SnapsTrendRadarEvidence = {
  source: string;
  label: string;
  value: number;
  detail?: string;
};

export type SnapsTrendRadarTrend = {
  id: string;
  topic: string;
  category: SnapsTrendRadarCategory;
  stage: SnapsTrendRadarStage;
  score: number;
  velocity: number;
  volume: number;
  previousVolume: number;
  engagement: number;
  engagementRate: number;
  shareOfVoice: number;
  sentiment: SnapsTrendRadarSentiment;
  confidence: number;
  keywords: string[];
  platforms: SnapsTargetPlatform[];
  competitorLead?: string;
  evidence: SnapsTrendRadarEvidence[];
  creativeAngles: string[];
  recommendedFormats: string[];
  action: string;
};

export type SnapsTrendRadarCluster = {
  id: string;
  label: string;
  count: number;
  averageScore: number;
  stage: SnapsTrendRadarStage;
  topics: string[];
  action: string;
};

export type SnapsTrendRadarAlert = {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  trendId?: string;
  action: string;
};

export type SnapsTrendRadarContentIdea = {
  id: string;
  trendId: string;
  platform: SnapsTargetPlatform;
  format: string;
  hook: string;
  captionBrief: string;
  cta: string;
  sourceText: string;
  score: number;
};

export type SnapsTrendRadarPreview = {
  product: 'snaps';
  source: 'snaps-trend-radar';
  title: string;
  industry: string;
  region: string;
  windowDays: number;
  targetPlatforms: SnapsTargetPlatform[];
  totalSignals: number;
  totalTrends: number;
  trendingNow: string[];
  trends: SnapsTrendRadarTrend[];
  clusters: SnapsTrendRadarCluster[];
  alerts: SnapsTrendRadarAlert[];
  contentIdeas: SnapsTrendRadarContentIdea[];
  recommendations: string[];
  warnings: string[];
};

type TrendSignal = {
  topic: string;
  source: string;
  category: SnapsTrendRadarCategory;
  platform?: SnapsTargetPlatform;
  volume: number;
  previousVolume: number;
  engagement: number;
  sentiment: SnapsTrendRadarSentiment;
  competitorName?: string;
  keywords: string[];
  detail?: string;
  explicitMetrics: boolean;
};

type TrendGroup = {
  topic: string;
  signals: TrendSignal[];
};

@Injectable()
export class SnapsTrendRadarService {
  preview(body?: SnapsTrendRadarRequest): SnapsTrendRadarPreview {
    const request = body || {};
    const industry =
      this.cleanText(request.industry, 120) || 'SNS 콘텐츠 운영';
    const region = this.cleanText(request.region, 80) || 'KR';
    const windowDays = this.clampNumber(request.windowDays, 7, 1, 90);
    const targetPlatforms = this.cleanPlatforms(request.targetPlatforms);
    const platforms = targetPlatforms.length
      ? targetPlatforms
      : (['instagram', 'threads', 'linkedin'] as SnapsTargetPlatform[]);
    const keywords = this.uniqueStrings(
      this.cleanStringArray(request.keywords, 30, 80)
    );
    const sourceText = this.cleanText(request.sourceText, 20000);
    const maxTrends = this.clampNumber(request.maxTrends, 8, 3, 16);
    const title =
      this.cleanText(request.title, 140) ||
      `${industry} trend radar`;
    const warnings: string[] = [];

    const signals = [
      ...this.parseImportText(request.importText, platforms),
      ...this.cleanItems(request.items, platforms),
      ...this.signalsFromSourceText(sourceText, platforms),
      ...this.signalsFromKeywords(keywords, platforms),
      ...this.signalsFromListening(request.listeningPreview, platforms),
      ...this.signalsFromCompetitors(request.competitorSummary, platforms),
      ...this.signalsFromHashtagTracker(request.hashtagTrackerPreview, platforms),
    ];

    if (!signals.length) {
      throw new BadRequestException(
        'trend radar needs keywords, import text, source text, listening preview, competitor summary, or hashtag tracker evidence.'
      );
    }
    if (!signals.some((signal) => signal.explicitMetrics)) {
      warnings.push(
        'No explicit trend metrics were supplied, so snaps estimated velocity from text, keyword, and planning evidence.'
      );
    }
    if (signals.length > 400) {
      warnings.push('Trend radar input was capped at 400 signals.');
    }

    const groups = this.groupSignals(signals.slice(0, 400));
    const totalVolume = groups.reduce(
      (sum, group) =>
        sum + group.signals.reduce((inner, signal) => inner + signal.volume, 0),
      0
    );
    const trends = groups
      .map((group) => this.scoreGroup(group, platforms, totalVolume))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxTrends);
    const clusters = this.buildClusters(trends);
    const alerts = this.buildAlerts(trends);
    const contentIdeas = this.buildContentIdeas(
      trends,
      platforms,
      this.cleanText(request.tone, 160)
    );

    return {
      product: 'snaps',
      source: 'snaps-trend-radar',
      title,
      industry,
      region,
      windowDays,
      targetPlatforms: platforms,
      totalSignals: signals.length,
      totalTrends: trends.length,
      trendingNow: trends.slice(0, 5).map((trend) => trend.topic),
      trends,
      clusters,
      alerts,
      contentIdeas,
      recommendations: this.recommendations(trends, alerts, contentIdeas),
      warnings,
    };
  }

  toSourceInputs(preview: SnapsTrendRadarPreview): SnapsSourceLibraryInputDto[] {
    return preview.contentIdeas.map((idea) => {
      const trend = preview.trends.find((item) => item.id === idea.trendId);
      return {
        title: idea.hook,
        sourceText: idea.sourceText,
        topic: trend?.topic || preview.industry,
        tone: '트렌드 반응형, 과장 없이 빠른 실행 톤',
        sourcePlatform: 'trend-radar',
        tags: [
          'trend-radar',
          idea.platform,
          idea.format,
          trend?.stage || 'trend',
          ...(trend?.keywords || []),
        ].filter(Boolean),
      };
    });
  }

  private scoreGroup(
    group: TrendGroup,
    fallbackPlatforms: SnapsTargetPlatform[],
    totalVolume: number
  ): SnapsTrendRadarTrend {
    const signals = group.signals;
    const volume = signals.reduce((sum, signal) => sum + signal.volume, 0);
    const previousVolume = signals.reduce(
      (sum, signal) => sum + signal.previousVolume,
      0
    );
    const engagement = signals.reduce((sum, signal) => sum + signal.engagement, 0);
    const explicitMetrics = signals.filter((signal) => signal.explicitMetrics).length;
    const velocity = this.round(
      ((volume - previousVolume) / Math.max(1, previousVolume || volume * 0.6)) *
        100,
      1
    );
    const engagementRate = this.round((engagement / Math.max(1, volume)) * 100, 1);
    const category = this.leadingCategory(signals);
    const sentiment = this.leadingSentiment(signals);
    const platforms =
      this.uniquePlatforms(
        signals
          .map((signal) => signal.platform)
          .filter((platform): platform is SnapsTargetPlatform => !!platform)
      ) || fallbackPlatforms;
    const competitorLead = this.leadingCompetitor(signals);
    const stage = this.stageFor({
      category,
      sentiment,
      velocity,
      volume,
      previousVolume,
      engagementRate,
    });
    const evidence = this.buildEvidence(signals);
    const keywords = this.uniqueStrings(
      signals.flatMap((signal) => signal.keywords)
    ).slice(0, 8);
    const relevance = signals.some((signal) => signal.source === 'keyword')
      ? 10
      : keywords.length * 1.5;
    const score = this.clamp(
      velocity * 0.34 +
        Math.log10(volume + 10) * 16 +
        Math.log10(engagement + 10) * 14 +
        relevance +
        explicitMetrics * 4 +
        (stage === 'risk' ? 14 : 0) +
        (competitorLead ? 6 : 0),
      1,
      100
    );
    const shareOfVoice = this.round((volume / Math.max(1, totalVolume)) * 100, 1);

    return {
      id: this.slugify(group.topic),
      topic: group.topic,
      category,
      stage,
      score: this.round(score, 1),
      velocity,
      volume,
      previousVolume,
      engagement,
      engagementRate,
      shareOfVoice,
      sentiment,
      confidence: this.confidence(signals, explicitMetrics),
      keywords,
      platforms: platforms.length ? platforms : fallbackPlatforms,
      competitorLead,
      evidence,
      creativeAngles: this.creativeAngles(group.topic, stage, category, competitorLead),
      recommendedFormats: this.recommendedFormats(category, platforms),
      action: this.actionFor(group.topic, stage, category, competitorLead),
    };
  }

  private buildClusters(trends: SnapsTrendRadarTrend[]): SnapsTrendRadarCluster[] {
    const byCategory = new Map<SnapsTrendRadarCategory, SnapsTrendRadarTrend[]>();
    for (const trend of trends) {
      byCategory.set(trend.category, [
        ...(byCategory.get(trend.category) || []),
        trend,
      ]);
    }
    return Array.from(byCategory.entries())
      .map(([category, items]) => {
        const averageScore = this.round(
          items.reduce((sum, item) => sum + item.score, 0) /
            Math.max(1, items.length),
          1
        );
        const stage = items.sort((a, b) => b.score - a.score)[0]?.stage || 'emerging';
        return {
          id: category,
          label: this.categoryLabel(category),
          count: items.length,
          averageScore,
          stage,
          topics: items.map((item) => item.topic).slice(0, 5),
          action: this.clusterAction(category, stage),
        };
      })
      .sort((a, b) => b.averageScore - a.averageScore)
      .slice(0, 6);
  }

  private buildAlerts(trends: SnapsTrendRadarTrend[]): SnapsTrendRadarAlert[] {
    const alerts: SnapsTrendRadarAlert[] = [];
    for (const trend of trends.slice(0, 8)) {
      if (trend.stage === 'risk') {
        alerts.push({
          id: `${trend.id}-risk`,
          severity: 'high',
          title: `${trend.topic} 리스크 신호`,
          detail: `부정/혼합 반응과 ${trend.velocity}% velocity가 같이 잡혔습니다.`,
          trendId: trend.id,
          action: '공개 답변, 내부 원인 확인, 후속 콘텐츠를 분리하세요.',
        });
      } else if (trend.stage === 'accelerating' && trend.velocity >= 45) {
        alerts.push({
          id: `${trend.id}-spike`,
          severity: 'high',
          title: `${trend.topic} 급상승`,
          detail: `현재 볼륨 ${trend.volume}, 이전 대비 ${trend.velocity}% 상승입니다.`,
          trendId: trend.id,
          action: '오늘 안에 짧은 반응형 게시물과 저장형 후속 원문을 만드세요.',
        });
      } else if (trend.competitorLead) {
        alerts.push({
          id: `${trend.id}-competitor`,
          severity: 'medium',
          title: `${trend.competitorLead} 선점 신호`,
          detail: `${trend.topic}에서 경쟁 계정 증거가 포함됐습니다.`,
          trendId: trend.id,
          action: '훅은 빌리되 증거/CTA/포지셔닝은 우리 메시지로 바꿔 큐에 넣으세요.',
        });
      } else if (trend.stage === 'fatigue') {
        alerts.push({
          id: `${trend.id}-fatigue`,
          severity: 'medium',
          title: `${trend.topic} 피로 경고`,
          detail: '볼륨 대비 참여율이 낮거나 이전 대비 약해졌습니다.',
          trendId: trend.id,
          action: '같은 키워드 반복 대신 좁은 사례나 반대 관점으로 변주하세요.',
        });
      }
    }

    return alerts.slice(0, 6);
  }

  private buildContentIdeas(
    trends: SnapsTrendRadarTrend[],
    platforms: SnapsTargetPlatform[],
    tone?: string
  ): SnapsTrendRadarContentIdea[] {
    return trends.slice(0, 4).flatMap((trend, trendIndex) =>
      platforms.slice(0, 3).map((platform, platformIndex) => {
        const format = this.recommendedFormats(trend.category, [platform])[0];
        const hook = this.hookFor(trend, platform, trendIndex + platformIndex);
        const cta =
          trend.stage === 'risk'
            ? '댓글로 실제로 겪은 문제를 남겨주세요.'
            : trend.category === 'competitor'
              ? '비교표가 필요하면 댓글에 "비교"라고 남겨주세요.'
              : '저장해두고 이번 주 콘텐츠 회의에서 바로 써보세요.';
        const sourceText = [
          `Trend: ${trend.topic}`,
          `Stage: ${trend.stage}`,
          `Evidence: ${trend.evidence.map((item) => `${item.label} ${item.value}`).join(', ')}`,
          `Angle: ${trend.creativeAngles[0]}`,
          `Format: ${format}`,
          tone ? `Tone: ${tone}` : '',
          `CTA: ${cta}`,
        ]
          .filter(Boolean)
          .join('\n');
        return {
          id: `${trend.id}-${platform}-${platformIndex + 1}`,
          trendId: trend.id,
          platform,
          format,
          hook,
          captionBrief: `${targetPlatformLabel(platform)}에서 ${trend.topic}를 ${trend.stage} 관점으로 풀어 ${trend.action}`,
          cta,
          sourceText,
          score: this.round(
            trend.score - platformIndex * 3 + (platform === 'instagram' ? 2 : 0),
            1
          ),
        };
      })
    );
  }

  private recommendations(
    trends: SnapsTrendRadarTrend[],
    alerts: SnapsTrendRadarAlert[],
    contentIdeas: SnapsTrendRadarContentIdea[]
  ) {
    const top = trends[0];
    return [
      top
        ? `${top.topic}를 첫 번째 반응형 콘텐츠로 처리하세요. stage=${top.stage}, velocity=${top.velocity}%.`
        : '입력 신호를 추가하면 우선 트렌드가 정렬됩니다.',
      alerts.some((alert) => alert.severity === 'high')
        ? 'High alert는 받은 반응함/승인 워크플로우와 분리해 당일 처리하세요.'
        : '긴급 알림은 없습니다. 상위 아이디어를 캘린더/카테고리 큐로 넘기세요.',
      contentIdeas.length
        ? `콘텐츠 아이디어 ${contentIdeas.length}개를 원문 라이브러리로 가져와 바로 변환할 수 있습니다.`
        : '트렌드별 플랫폼 아이디어를 만들려면 지원 플랫폼을 1개 이상 선택하세요.',
    ];
  }

  private parseImportText(
    value: unknown,
    fallbackPlatforms: SnapsTargetPlatform[]
  ): TrendSignal[] {
    const text = typeof value === 'string' ? value.trim().slice(0, 500000) : '';
    if (!text) {
      return [];
    }
    if (text.startsWith('{') || text.startsWith('[')) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new BadRequestException('Trend radar import JSON is invalid.');
      }
      return this.jsonRecords(parsed).flatMap((record) =>
        this.signalFromRecord(record, fallbackPlatforms)
      );
    }

    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) {
      return [];
    }
    const headers = this.splitCsvLine(lines[0]).map((header) =>
      this.normalizeHeader(header)
    );
    const hasHeader = headers.some((header) =>
      [
        'topic',
        'keyword',
        'hashtag',
        'volume',
        'mentions',
        'engagement',
        'previousvolume',
        'sentiment',
      ].includes(header)
    );
    if (hasHeader) {
      return lines.slice(1).flatMap((line) => {
        const values = this.splitCsvLine(line);
        const record = headers.reduce<Record<string, unknown>>((all, header, index) => {
          all[header] = values[index] || '';
          return all;
        }, {});
        return this.signalFromRecord(record, fallbackPlatforms);
      });
    }

    return lines.flatMap((line) =>
      this.signalsFromSourceText(line, fallbackPlatforms)
    );
  }

  private cleanItems(
    value: unknown,
    fallbackPlatforms: SnapsTargetPlatform[]
  ): TrendSignal[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.flatMap((item) => this.signalFromRecord(item, fallbackPlatforms));
  }

  private signalFromRecord(
    value: unknown,
    fallbackPlatforms: SnapsTargetPlatform[]
  ): TrendSignal[] {
    if (!value || typeof value !== 'object') {
      return [];
    }
    const record = value as Record<string, unknown>;
    const topic =
      this.cleanTopic(
        this.pick(record, ['topic', 'keyword', 'hashtag', 'tag', 'theme', 'title'])
      ) ||
      this.extractTopic(
        this.cleanText(this.pick(record, ['content', 'text', 'message', 'caption', 'notes']), 2000)
      );
    if (!topic) {
      return [];
    }
    const platform =
      this.cleanPlatform(this.pick(record, ['platform', 'channel', 'network'])) ||
      fallbackPlatforms[0];
    const volume =
      this.cleanNumber(this.pick(record, ['volume', 'mentions', 'count', 'uses', 'posts'])) ||
      1;
    const previousVolume = this.cleanNumber(
      this.pick(record, [
        'previousvolume',
        'previousVolume',
        'prevvolume',
        'previous',
        'baseline',
      ])
    );
    const engagement = this.cleanNumber(
      this.pick(record, ['engagement', 'interactions', 'likes', 'saves', 'comments', 'shares'])
    );
    const sentiment = this.cleanSentiment(this.pick(record, ['sentiment', 'mood']));
    const competitorName = this.cleanText(
      this.pick(record, ['competitor', 'competitorname', 'competitorName', 'account', 'brand']),
      120
    );
    const format = this.cleanText(this.pick(record, ['format', 'type']), 80);
    const content = this.cleanText(
      this.pick(record, ['content', 'text', 'message', 'caption', 'notes']),
      1000
    );
    const category = this.categoryFrom(topic, content, format, !!competitorName, sentiment);
    const keywords = this.uniqueStrings([
      topic,
      ...this.extractHashtags(`${topic} ${content}`),
      ...this.extractKeywords(`${topic} ${content}`),
    ]).slice(0, 8);
    return [
      {
        topic,
        source: this.cleanText(this.pick(record, ['source']), 80) || 'import',
        category,
        platform,
        volume,
        previousVolume: previousVolume || Math.max(0, Math.round(volume * 0.55)),
        engagement,
        sentiment,
        competitorName: competitorName || undefined,
        keywords,
        detail: content || undefined,
        explicitMetrics: volume > 1 || previousVolume > 0 || engagement > 0,
      },
    ];
  }

  private signalsFromSourceText(
    sourceText: string,
    fallbackPlatforms: SnapsTargetPlatform[]
  ): TrendSignal[] {
    if (!sourceText) {
      return [];
    }
    const tokens = this.uniqueStrings([
      ...this.extractHashtags(sourceText),
      ...this.extractKeywords(sourceText),
    ]).slice(0, 20);
    return tokens
      .map((token): TrendSignal => ({
        topic: this.cleanTopic(token),
        source: 'source-text',
        category: token.startsWith('#') ? 'hashtag' : this.categoryFrom(token, sourceText),
        platform: fallbackPlatforms[0],
        volume: 2,
        previousVolume: 1,
        engagement: 0,
        sentiment: this.detectSentiment(sourceText),
        keywords: [token],
        detail: sourceText.slice(0, 180),
        explicitMetrics: false,
      }))
      .filter((signal) => !!signal.topic);
  }

  private signalsFromKeywords(
    keywords: string[],
    fallbackPlatforms: SnapsTargetPlatform[]
  ): TrendSignal[] {
    return keywords
      .map((keyword): TrendSignal => ({
        topic: this.cleanTopic(keyword),
        source: 'keyword',
        category: keyword.trim().startsWith('#') ? 'hashtag' : 'keyword',
        platform: fallbackPlatforms[0],
        volume: 3,
        previousVolume: 1,
        engagement: 0,
        sentiment: 'neutral',
        keywords: [keyword],
        explicitMetrics: false,
      }))
      .filter((signal) => !!signal.topic);
  }

  private signalsFromListening(
    value: unknown,
    fallbackPlatforms: SnapsTargetPlatform[]
  ): TrendSignal[] {
    if (!value || typeof value !== 'object') {
      return [];
    }
    const record = value as Record<string, unknown>;
    const clusterSignals = Array.isArray(record.clusters)
      ? record.clusters.flatMap((cluster) => {
          if (!cluster || typeof cluster !== 'object') {
            return [];
          }
          const item = cluster as Record<string, unknown>;
          const topic =
            this.cleanTopic(item.label || item.id) ||
            this.cleanTopic(this.cleanStringArray(item.keywords, 1, 80)[0]);
          if (!topic) {
            return [];
          }
          const count = this.cleanNumber(item.count) || 1;
          const sentiment = this.cleanSentiment(item.sentiment);
          return [{
            topic,
            source: 'social-listening',
            category: this.categoryFrom(topic, this.cleanText(item.action, 300), '', false, sentiment),
            platform: fallbackPlatforms[0],
            volume: count,
            previousVolume: Math.max(0, Math.round(count * 0.5)),
            engagement: count * 3,
            sentiment,
            keywords: this.cleanStringArray(item.keywords, 8, 80),
            detail: this.cleanText(item.action, 240),
            explicitMetrics: true,
          } as TrendSignal];
        })
      : [];
    const mentionSignals = Array.isArray(record.mentions)
      ? record.mentions.flatMap((mention) => this.signalFromRecord({
          ...(mention as Record<string, unknown>),
          topic:
            this.cleanStringArray((mention as Record<string, unknown>).matchedKeywords, 1, 80)[0] ||
            (mention as Record<string, unknown>).intent,
          source: 'social-listening',
          volume: 1,
          previousVolume: 0,
          engagement: (mention as Record<string, unknown>).engagement,
        }, fallbackPlatforms))
      : [];
    return [...clusterSignals, ...mentionSignals];
  }

  private signalsFromCompetitors(
    value: unknown,
    fallbackPlatforms: SnapsTargetPlatform[]
  ): TrendSignal[] {
    if (!value || typeof value !== 'object') {
      return [];
    }
    const record = value as Record<string, unknown>;
    const topPosts = Array.isArray(record.topPosts) ? record.topPosts : [];
    const topCompetitors = Array.isArray(record.topCompetitors)
      ? record.topCompetitors
      : [];
    const postSignals = topPosts.flatMap((post) => {
      if (!post || typeof post !== 'object') {
        return [];
      }
      const item = post as Record<string, unknown>;
      const topic =
        this.cleanTopic(item.hook || item.title) ||
        this.extractTopic(this.cleanText(item.notes, 500));
      if (!topic) {
        return [];
      }
      return [{
        topic,
        source: 'competitor-analysis',
        category: this.categoryFrom(topic, this.cleanText(item.notes, 500), this.cleanText(item.format, 80), true),
        platform: this.cleanPlatform(item.platform) || fallbackPlatforms[0],
        volume: 1,
        previousVolume: 0,
        engagement: this.cleanNumber(item.engagement),
        sentiment: 'neutral' as SnapsTrendRadarSentiment,
        competitorName: this.cleanText(item.competitorName, 120) || undefined,
        keywords: this.extractKeywords(`${item.title || ''} ${item.hook || ''}`),
        detail: this.cleanText(item.title, 220),
        explicitMetrics: true,
      } as TrendSignal];
    });
    const competitorSignals = topCompetitors.flatMap((competitor) => {
      if (!competitor || typeof competitor !== 'object') {
        return [];
      }
      const item = competitor as Record<string, unknown>;
      const profile = item.competitor as Record<string, unknown> | undefined;
      const latest = item.latest as Record<string, unknown> | undefined;
      const name = this.cleanText(profile?.name, 120);
      const topic = this.cleanTopic(`${name} momentum`);
      if (!topic) {
        return [];
      }
      const engagement = this.cleanNumber(latest?.engagement);
      const volume = this.cleanNumber(latest?.postsCount) || 1;
      return [{
        topic,
        source: 'competitor-analysis',
        category: 'competitor',
        platform: this.cleanPlatform(profile?.platform) || fallbackPlatforms[0],
        volume,
        previousVolume: Math.max(0, volume - this.cleanNumber(item.postsDelta)),
        engagement,
        sentiment: 'neutral' as SnapsTrendRadarSentiment,
        competitorName: name || undefined,
        keywords: [name].filter(Boolean),
        detail: name ? `${name} competitor momentum` : undefined,
        explicitMetrics: true,
      } as TrendSignal];
    });
    return [...postSignals, ...competitorSignals];
  }

  private signalsFromHashtagTracker(
    value: unknown,
    fallbackPlatforms: SnapsTargetPlatform[]
  ): TrendSignal[] {
    if (!value || typeof value !== 'object') {
      return [];
    }
    const record = value as Record<string, unknown>;
    if (!Array.isArray(record.items)) {
      return [];
    }
    return record.items.flatMap((item) => {
      if (!item || typeof item !== 'object') {
        return [];
      }
      const row = item as Record<string, unknown>;
      const topic = this.cleanTopic(row.hashtag);
      if (!topic) {
        return [];
      }
      const posts = this.cleanNumber(row.posts) || 1;
      const engagement = this.cleanNumber(row.engagements);
      return [{
        topic,
        source: 'hashtag-tracker',
        category: 'hashtag',
        platform:
          this.cleanPlatforms(row.platforms)[0] ||
          fallbackPlatforms[0],
        volume: posts,
        previousVolume:
          this.cleanText(row.trend, 20) === 'rising'
            ? Math.max(0, Math.round(posts * 0.45))
            : Math.max(0, Math.round(posts * 0.8)),
        engagement,
        sentiment: 'neutral' as SnapsTrendRadarSentiment,
        keywords: [topic],
        detail: this.cleanText(row.reason, 240),
        explicitMetrics: true,
      } as TrendSignal];
    });
  }

  private groupSignals(signals: TrendSignal[]): TrendGroup[] {
    const groups = new Map<string, TrendGroup>();
    for (const signal of signals) {
      const key = this.topicKey(signal.topic);
      if (!key) {
        continue;
      }
      const group = groups.get(key) || { topic: signal.topic, signals: [] };
      group.signals.push(signal);
      if (signal.topic.length < group.topic.length) {
        group.topic = signal.topic;
      }
      groups.set(key, group);
    }
    return Array.from(groups.values());
  }

  private leadingCategory(signals: TrendSignal[]) {
    return this.leadingBy(signals, (signal) => signal.category) || 'keyword';
  }

  private leadingSentiment(signals: TrendSignal[]) {
    const values = signals.map((signal) => signal.sentiment);
    if (values.includes('mixed')) {
      return 'mixed';
    }
    return this.leadingBy(signals, (signal) => signal.sentiment) || 'neutral';
  }

  private leadingCompetitor(signals: TrendSignal[]) {
    const competitors = signals
      .map((signal) => signal.competitorName)
      .filter((item): item is string => !!item);
    return this.leadingValue(competitors);
  }

  private buildEvidence(signals: TrendSignal[]): SnapsTrendRadarEvidence[] {
    return signals
      .sort((a, b) => b.volume + b.engagement - (a.volume + a.engagement))
      .slice(0, 4)
      .map((signal) => ({
        source: signal.source,
        label: signal.platform
          ? `${targetPlatformLabel(signal.platform)} ${signal.source}`
          : signal.source,
        value: signal.volume || signal.engagement || 1,
        detail: signal.detail,
      }));
  }

  private stageFor(input: {
    category: SnapsTrendRadarCategory;
    sentiment: SnapsTrendRadarSentiment;
    velocity: number;
    volume: number;
    previousVolume: number;
    engagementRate: number;
  }): SnapsTrendRadarStage {
    if (
      input.category === 'risk' ||
      input.sentiment === 'negative' ||
      (input.sentiment === 'mixed' && input.velocity >= 25)
    ) {
      return 'risk';
    }
    if (
      input.previousVolume > input.volume ||
      (input.volume >= 40 && input.engagementRate < 35)
    ) {
      return 'fatigue';
    }
    if (input.velocity >= 45) {
      return 'accelerating';
    }
    if (input.volume >= 24) {
      return 'mainstream';
    }
    return 'emerging';
  }

  private confidence(signals: TrendSignal[], explicitMetrics: number) {
    return this.round(
      this.clamp(
        34 + signals.length * 8 + explicitMetrics * 12 + this.uniqueValues(signals.map((signal) => signal.source)).length * 5,
        20,
        96
      ),
      1
    );
  }

  private actionFor(
    topic: string,
    stage: SnapsTrendRadarStage,
    category: SnapsTrendRadarCategory,
    competitorLead?: string
  ) {
    if (stage === 'risk') {
      return `${topic} 이슈를 먼저 답변/FAQ/내부 메모로 분리합니다.`;
    }
    if (stage === 'accelerating') {
      return `${topic} 급상승에 맞춰 24시간 안에 반응형 숏폼과 저장형 카드뉴스를 만듭니다.`;
    }
    if (stage === 'fatigue') {
      return `${topic} 반복 사용을 줄이고 좁은 사례나 반대 관점으로 테스트합니다.`;
    }
    if (category === 'competitor' && competitorLead) {
      return `${competitorLead}의 훅을 비교하되 우리 증거와 CTA로 재포지셔닝합니다.`;
    }
    return `${topic}를 이번 주 콘텐츠 캘린더의 실험 소재로 넣습니다.`;
  }

  private creativeAngles(
    topic: string,
    stage: SnapsTrendRadarStage,
    category: SnapsTrendRadarCategory,
    competitorLead?: string
  ) {
    return [
      stage === 'risk'
        ? `${topic}에서 사람들이 걱정하는 지점을 먼저 인정하고 해결 순서를 보여주기`
        : `${topic}가 왜 지금 올라오는지 3가지 근거로 설명하기`,
      category === 'competitor' && competitorLead
        ? `${competitorLead}가 선점한 훅을 우리 고객 사례로 바꿔 말하기`
        : `${topic}를 체크리스트, 전후 비교, 댓글 질문으로 쪼개기`,
      stage === 'accelerating'
        ? `${topic} 급상승 신호를 오늘 쓸 수 있는 짧은 릴스/스레드로 전환하기`
        : `${topic}를 다음 주 반복 가능한 에버그린 원문으로 저장하기`,
    ];
  }

  private recommendedFormats(
    category: SnapsTrendRadarCategory,
    platforms: SnapsTargetPlatform[]
  ) {
    const base =
      category === 'visual'
        ? ['reels', 'carousel', 'before-after']
        : category === 'audio'
          ? ['shorts', 'reels', 'sound-led hook']
          : category === 'competitor'
            ? ['comparison post', 'carousel', 'thread']
            : category === 'risk'
              ? ['FAQ post', 'public reply', 'checklist']
              : ['carousel', 'short thread', 'caption'];
    if (platforms.includes('linkedin')) {
      return this.uniqueStrings(['insight post', ...base]).slice(0, 3);
    }
    if (platforms.includes('instagram')) {
      return this.uniqueStrings(['reels', 'carousel', ...base]).slice(0, 3);
    }
    return base.slice(0, 3);
  }

  private hookFor(
    trend: SnapsTrendRadarTrend,
    platform: SnapsTargetPlatform,
    index: number
  ) {
    const templates = [
      `${trend.topic}, 지금 따라가도 되는 트렌드일까?`,
      `${trend.topic}가 올라오는 이유를 숫자로 보면 다릅니다`,
      `${trend.topic}를 그대로 베끼면 안 되는 이유`,
      `${targetPlatformLabel(platform)}에서 ${trend.topic}를 쓰는 가장 빠른 방법`,
    ];
    return templates[index % templates.length];
  }

  private categoryFrom(
    topic: unknown,
    content = '',
    format = '',
    competitor = false,
    sentiment: SnapsTrendRadarSentiment = 'neutral'
  ): SnapsTrendRadarCategory {
    const text = `${this.cleanText(topic, 200)} ${content} ${format}`.toLowerCase();
    if (competitor || /(competitor|rival|경쟁|대안|vs\.?|versus)/i.test(text)) {
      return 'competitor';
    }
    if (sentiment === 'negative' || /(오류|불만|위기|문제|실패|risk|crisis|broken)/i.test(text)) {
      return 'risk';
    }
    if (/^#|hashtag|태그/.test(text)) {
      return 'hashtag';
    }
    if (/(reels?|shorts?|video|visual|image|carousel|릴스|쇼츠|영상|비주얼|카드뉴스|썸네일|장면)/i.test(text)) {
      return 'visual';
    }
    if (/(sound|audio|music|음원|소리|밈 사운드|사운드)/i.test(text)) {
      return 'audio';
    }
    if (/(고객|댓글|문의|질문|audience|mention|conversation)/i.test(text)) {
      return 'audience';
    }
    return 'keyword';
  }

  private detectSentiment(value: string): SnapsTrendRadarSentiment {
    const positive = /(좋|감사|유용|상승|성공|추천|great|love|useful|positive)/i.test(value);
    const negative = /(불편|문제|오류|실패|하락|나쁨|bad|broken|negative|risk)/i.test(value);
    if (positive && negative) {
      return 'mixed';
    }
    if (negative) {
      return 'negative';
    }
    if (positive) {
      return 'positive';
    }
    return 'neutral';
  }

  private cleanSentiment(value: unknown): SnapsTrendRadarSentiment {
    const text = this.cleanText(value, 40).toLowerCase();
    if (['positive', 'neutral', 'negative', 'mixed'].includes(text)) {
      return text as SnapsTrendRadarSentiment;
    }
    if (/좋|칭찬|praise/.test(text)) {
      return 'positive';
    }
    if (/불만|complaint|risk/.test(text)) {
      return 'negative';
    }
    return 'neutral';
  }

  private clusterAction(category: SnapsTrendRadarCategory, stage: SnapsTrendRadarStage) {
    if (stage === 'risk') {
      return '리스크 답변과 원인 확인 메모를 먼저 만듭니다.';
    }
    if (category === 'competitor') {
      return '경쟁 훅/형식은 벤치마크하고 우리 증거 중심으로 재작성합니다.';
    }
    if (category === 'visual' || category === 'audio') {
      return '숏폼 브리프와 썸네일/첫 장면 지시로 넘깁니다.';
    }
    return '상위 주제를 아이디어 보드와 콘텐츠 캘린더에 넣습니다.';
  }

  private categoryLabel(category: SnapsTrendRadarCategory) {
    const labels: Record<SnapsTrendRadarCategory, string> = {
      keyword: '키워드/토픽',
      hashtag: '해시태그',
      competitor: '경쟁 선점',
      audience: '고객 대화',
      visual: '비주얼/영상',
      audio: '오디오/사운드',
      risk: '리스크',
    };
    return labels[category];
  }

  private targetPlatformLabel(platform: SnapsTargetPlatform) {
    return targetPlatformLabel(platform);
  }

  private splitCsvLine(line: string) {
    const values: string[] = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];
      if (quoted) {
        if (char === '"' && next === '"') {
          current += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          current += char;
        }
        continue;
      }
      if (char === '"') {
        quoted = true;
        continue;
      }
      if (char === ',') {
        values.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    values.push(current.trim());
    return values;
  }

  private jsonRecords(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) {
      return value
        .map((item) => (item && typeof item === 'object' ? item : undefined))
        .filter((item): item is Record<string, unknown> => !!item);
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of ['items', 'rows', 'signals', 'trends', 'data']) {
        if (Array.isArray(record[key])) {
          return this.jsonRecords(record[key]);
        }
      }
      return [record];
    }
    return [];
  }

  private pick(record: Record<string, unknown>, keys: string[]) {
    const index = new Map(
      Object.entries(record).map(([key, value]) => [this.normalizeHeader(key), value])
    );
    for (const key of keys) {
      const value = index.get(this.normalizeHeader(key));
      if (typeof value !== 'undefined') {
        return value;
      }
    }
    return undefined;
  }

  private cleanPlatforms(value: unknown): SnapsTargetPlatform[] {
    const raw = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[,\n| ]+/)
        : [];
    return this.uniquePlatforms(
      raw
        .map((item) => this.cleanPlatform(item))
        .filter((item): item is SnapsTargetPlatform => !!item)
    ).slice(0, 10);
  }

  private cleanPlatform(value: unknown): SnapsTargetPlatform | undefined {
    const normalized = this.cleanText(value, 80)
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[\s_]+/g, '-');
    const aliases: Record<string, SnapsTargetPlatform> = {
      ig: 'instagram',
      insta: 'instagram',
      instagram: 'instagram',
      thread: 'threads',
      threads: 'threads',
      bsky: 'bluesky',
      bluesky: 'bluesky',
      facebook: 'facebook',
      fb: 'facebook',
      pinterest: 'pinterest',
      pin: 'pinterest',
      youtube: 'youtube',
      shorts: 'youtube',
      tiktok: 'tiktok',
      xhs: 'xiaohongshu',
      xiaohongshu: 'xiaohongshu',
      blog: 'naver-blog',
      'naver-blog': 'naver-blog',
      cafe: 'naver-cafe',
      'naver-cafe': 'naver-cafe',
      kakao: 'kakao-talk',
      'kakao-talk': 'kakao-talk',
      linkedin: 'linkedin',
      twitter: 'x',
      x: 'x',
    };
    const platform = aliases[normalized] || normalized;
    return (snapsTargetPlatforms as readonly string[]).includes(platform)
      ? (platform as SnapsTargetPlatform)
      : undefined;
  }

  private uniquePlatforms(platforms: SnapsTargetPlatform[]) {
    return [...new Set(platforms)];
  }

  private cleanStringArray(value: unknown, maxItems: number, maxLength: number) {
    const raw = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[,\n|]+/)
        : [];
    return this.uniqueStrings(
      raw.map((item) => this.cleanText(item, maxLength)).filter(Boolean)
    ).slice(0, maxItems);
  }

  private cleanTopic(value: unknown) {
    const text = this.cleanText(value, 120)
      .replace(/^#+/, '#')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text || text.length < 2) {
      return '';
    }
    return text;
  }

  private extractTopic(value: string) {
    return this.extractHashtags(value)[0] || this.extractKeywords(value)[0] || '';
  }

  private extractHashtags(value: string) {
    return this.uniqueStrings(value.match(/#[\p{L}\p{N}_-]+/gu) || []).slice(0, 20);
  }

  private extractKeywords(value: string) {
    const stop = new Set([
      'the',
      'and',
      'for',
      'with',
      'this',
      'that',
      'from',
      '오늘',
      '이번',
      '그리고',
      '있는',
      '없는',
      '합니다',
      '콘텐츠',
    ]);
    const tokens = value
      .replace(/https?:\/\/\S+/g, ' ')
      .match(/[\p{L}\p{N}_]{2,24}/gu);
    if (!tokens) {
      return [];
    }
    const counts = new Map<string, number>();
    for (const token of tokens) {
      const cleaned = token.trim();
      const key = cleaned.toLowerCase();
      if (!cleaned || stop.has(key) || /^\d+$/.test(cleaned)) {
        continue;
      }
      counts.set(cleaned, (counts.get(cleaned) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([token]) => token)
      .slice(0, 10);
  }

  private topicKey(value: string) {
    return value
      .toLowerCase()
      .replace(/^#+/, '')
      .replace(/[^a-z0-9가-힣]/g, '')
      .trim();
  }

  private normalizeHeader(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
  }

  private leadingBy<T extends string>(
    signals: TrendSignal[],
    pick: (signal: TrendSignal) => T
  ): T | undefined {
    return this.leadingValue(signals.map(pick));
  }

  private leadingValue<T extends string>(values: T[]): T | undefined {
    const counts = new Map<T, number>();
    for (const value of values.filter(Boolean)) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  }

  private uniqueValues<T>(values: T[]) {
    return [...new Set(values.filter(Boolean))];
  }

  private uniqueStrings(values: unknown[]) {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
      const text = this.cleanText(value, 120);
      const key = text.toLowerCase();
      if (!text || seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(text);
    }
    return result;
  }

  private cleanNumber(value: unknown) {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
    }
    const raw = this.cleanText(value, 80).toLowerCase().replace(/,/g, '');
    if (!raw) {
      return 0;
    }
    const multiplier = raw.endsWith('k') ? 1000 : raw.endsWith('m') ? 1000000 : 1;
    const number = Number(raw.replace(/[km%]/g, ''));
    return Number.isFinite(number) ? Math.max(0, Math.round(number * multiplier)) : 0;
  }

  private cleanText(value: unknown, maxLength = 1000) {
    let raw = '';
    if (typeof value === 'string') {
      raw = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      raw = String(value);
    } else if (Array.isArray(value)) {
      raw = value
        .map((item) => this.cleanText(item, maxLength))
        .filter(Boolean)
        .join(' ');
    }
    return raw.trim().replace(/\s+/g, ' ').slice(0, maxLength);
  }

  private clampNumber(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(parsed)));
  }

  private slugify(value: string) {
    const slug = this.topicKey(value).slice(0, 60);
    return slug || 'trend';
  }

  private clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  private round(value: number, digits: number) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }
}

function targetPlatformLabel(platform: SnapsTargetPlatform) {
  return snapsPlatformRules[platform]?.label || platform;
}
