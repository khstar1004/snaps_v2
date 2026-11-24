import { BadRequestException, Injectable } from '@nestjs/common';
import { SnapsSourceLibraryInputDto } from '@gitroom/nestjs-libraries/snaps/dto/source-library.dto';
import { SnapsVariant } from '@gitroom/nestjs-libraries/snaps/dto/transform-result.dto';
import {
  SnapsTargetPlatform,
  snapsPlatformRules,
  snapsTargetPlatforms,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';

export type SnapsPostVariationGoal =
  | 'engagement'
  | 'saves'
  | 'comments'
  | 'clicks'
  | 'leads';

export type SnapsPostVariationRequest = {
  sourceText?: unknown;
  title?: unknown;
  topic?: unknown;
  tone?: unknown;
  audience?: unknown;
  cta?: unknown;
  targetPlatforms?: unknown;
  variantCount?: unknown;
  goal?: unknown;
  winningMetric?: unknown;
  competitorHook?: unknown;
  tags?: unknown;
};

export type SnapsPostVariationStatus = 'winner' | 'ready' | 'needs-review';

export type SnapsPostVariationItem = {
  id: string;
  rank: number;
  variationIndex: number;
  platform: SnapsTargetPlatform;
  platformLabel: string;
  title: string;
  angle: string;
  hook: string;
  caption: string;
  cta: string;
  hashtags: string[];
  hypothesis: string;
  expectedMetric: string;
  score: number;
  scoreBreakdown: {
    hook: number;
    clarity: number;
    specificity: number;
    cta: number;
    novelty: number;
  };
  status: SnapsPostVariationStatus;
  warnings: string[];
};

export type SnapsPostVariationPreview = {
  product: 'snaps';
  source: 'snaps-post-variation-lab';
  title: string;
  topic: string;
  goal: SnapsPostVariationGoal;
  winningMetric: string;
  variantCount: number;
  platforms: SnapsTargetPlatform[];
  totalVariants: number;
  winningVariantId?: string;
  items: SnapsPostVariationItem[];
  recommendations: string[];
  warnings: string[];
};

type VariationDefaults = {
  sourceText: string;
  title: string;
  topic: string;
  tone?: string;
  audience?: string;
  cta: string;
  platforms: SnapsTargetPlatform[];
  variantCount: number;
  goal: SnapsPostVariationGoal;
  winningMetric: string;
  competitorHook?: string;
  tags: string[];
};

@Injectable()
export class SnapsPostVariationService {
  preview(body: SnapsPostVariationRequest = {}): SnapsPostVariationPreview {
    const defaults = this.defaultsFor(body);
    const points = this.extractPoints(defaults.sourceText);
    const warnings: string[] = [];
    if (points.length < defaults.variantCount) {
      warnings.push('Source text had fewer distinct proof points than requested variations.');
    }
    if (defaults.platforms.some((platform) => snapsPlatformRules[platform].publishMode === 'assist')) {
      warnings.push('Assist-only platforms can be ranked here but still need manual publishing.');
    }

    const items = this.buildItems(defaults, points);
    const sorted = [...items].sort((a, b) => b.score - a.score);
    const ranked = sorted.map((item, index) => {
      const status: SnapsPostVariationStatus =
        index === 0
          ? 'winner'
          : item.score >= 70
            ? 'ready'
            : 'needs-review';
      return {
        ...item,
        rank: index + 1,
        status,
      };
    });

    return {
      product: 'snaps',
      source: 'snaps-post-variation-lab',
      title: defaults.title,
      topic: defaults.topic,
      goal: defaults.goal,
      winningMetric: defaults.winningMetric,
      variantCount: defaults.variantCount,
      platforms: defaults.platforms,
      totalVariants: ranked.length,
      winningVariantId: ranked[0]?.id,
      items: ranked,
      recommendations: this.recommendations(ranked, defaults),
      warnings,
    };
  }

  toSourceInputs(items: SnapsPostVariationItem[]): SnapsSourceLibraryInputDto[] {
    return items.map((item) => ({
      title: item.title,
      sourceText: [
        item.hook,
        item.caption,
        '',
        `Experiment hypothesis: ${item.hypothesis}`,
        `Expected metric: ${item.expectedMetric}`,
      ].join('\n'),
      topic: item.angle,
      sourcePlatform: 'post-variation-lab',
      tags: [
        'post-variation-lab',
        item.status,
        item.platform,
        item.angle,
        ...item.hashtags.map((tag) => tag.replace(/^#/, '')),
      ],
    }));
  }

  toVariants(items: SnapsPostVariationItem[]): SnapsVariant[] {
    return items
      .filter((item) => item.status !== 'needs-review')
      .map((item) => {
        const rule = snapsPlatformRules[item.platform];
        return {
          platform: item.platform,
          label: item.platformLabel,
          title: item.title,
          content: this.truncate(
            [item.hook, item.caption, item.cta].filter(Boolean).join('\n\n'),
            rule.maxLength
          ),
          hashtags: item.hashtags.slice(0, rule.hashtagLimit),
          settings: {
            source: 'snaps-post-variation-lab',
            variationId: item.id,
            rank: item.rank,
            score: item.score,
            hypothesis: item.hypothesis,
            expectedMetric: item.expectedMetric,
          },
          publishMode: rule.publishMode,
          notes: [
            `angle: ${item.angle}`,
            `score: ${item.score}`,
            `status: ${item.status}`,
          ],
        };
      });
  }

  private defaultsFor(request: SnapsPostVariationRequest): VariationDefaults {
    const sourceText = this.cleanText(request.sourceText, 6000);
    if (sourceText.length < 10) {
      throw new BadRequestException('sourceText is required for post variation lab.');
    }

    const title =
      this.cleanText(request.title, 160) ||
      this.firstLine(sourceText).slice(0, 90) ||
      'Post variation experiment';
    const topic =
      this.cleanText(request.topic, 120) ||
      this.extractTopic(title || sourceText);
    const cta =
      this.cleanText(request.cta, 180) ||
      '댓글로 필요한 자료를 알려주세요.';
    const platforms = this.cleanPlatforms(request.targetPlatforms);
    const variantCount = this.clampNumber(request.variantCount, 5, 2, 12);
    const goal = this.cleanGoal(request.goal);
    const winningMetric =
      this.cleanText(request.winningMetric, 80) ||
      this.defaultMetric(goal);

    return {
      sourceText,
      title,
      topic,
      tone: this.cleanText(request.tone, 160) || undefined,
      audience: this.cleanText(request.audience, 160) || undefined,
      cta,
      platforms: platforms.length
        ? platforms
        : (['threads', 'instagram', 'linkedin'] as SnapsTargetPlatform[]),
      variantCount,
      goal,
      winningMetric,
      competitorHook: this.cleanText(request.competitorHook, 180) || undefined,
      tags: this.cleanTags(request.tags),
    };
  }

  private buildItems(
    defaults: VariationDefaults,
    points: string[]
  ): SnapsPostVariationItem[] {
    const seed = points.length ? points : [defaults.sourceText.slice(0, 180)];
    return Array.from({ length: defaults.variantCount }, (_, index) => {
      const platform = defaults.platforms[index % defaults.platforms.length];
      const rule = snapsPlatformRules[platform];
      const angle = this.angleFor(index, defaults.goal);
      const proofPoint = seed[index % seed.length];
      const hook = this.buildHook(defaults, angle, proofPoint, index);
      const cta = this.ctaFor(defaults, index);
      const caption = this.captionFor(defaults, proofPoint, angle, rule.maxLength);
      const hashtags = this.hashtagsFor(defaults, rule.hashtagLimit);
      const scoreBreakdown = this.scoreBreakdown({
        hook,
        caption,
        cta,
        angle,
        defaults,
      });
      const score = Math.round(
        scoreBreakdown.hook * 0.28 +
          scoreBreakdown.clarity * 0.22 +
          scoreBreakdown.specificity * 0.2 +
          scoreBreakdown.cta * 0.18 +
          scoreBreakdown.novelty * 0.12
      );
      const warnings: string[] = [];
      if (rule.publishMode === 'assist') {
        warnings.push(`${rule.label} is assist-only and needs manual publishing.`);
      }
      if (caption.length > rule.maxLength) {
        warnings.push(`${rule.label} caption was trimmed to the platform limit.`);
      }

      return {
        id: `variation-${index + 1}-${platform}`,
        rank: index + 1,
        variationIndex: index + 1,
        platform,
        platformLabel: rule.label,
        title: `${defaults.title} - ${angle}`,
        angle,
        hook,
        caption: this.truncate(caption, Math.max(80, rule.maxLength - cta.length - 4)),
        cta,
        hashtags,
        hypothesis: this.hypothesisFor(defaults, angle),
        expectedMetric: defaults.winningMetric,
        score,
        scoreBreakdown,
        status: score >= 72 ? 'ready' : 'needs-review',
        warnings,
      };
    });
  }

  private buildHook(
    defaults: VariationDefaults,
    angle: string,
    proofPoint: string,
    index: number
  ) {
    const topic = defaults.topic;
    const hooks = [
      `${topic}, 아직도 매번 새로 만들고 있나요?`,
      `${topic}에서 시간을 줄인 팀은 이 순서부터 바꿉니다.`,
      `좋은 게시물 하나를 ${defaults.platforms.length}개 채널 실험으로 바꾸는 법`,
      `${defaults.audience || '작은 팀'}이 놓치기 쉬운 ${topic} 체크포인트`,
      `경쟁 훅보다 더 선명하게: ${this.shortLine(proofPoint, 48)}`,
      `${angle} 관점으로 보면 ${topic}의 답이 달라집니다.`,
    ];
    if (defaults.competitorHook) {
      hooks.unshift(`경쟁사는 "${defaults.competitorHook}"라고 말합니다. 우리는 이렇게 바꿉니다.`);
    }
    return this.truncate(hooks[index % hooks.length], 110);
  }

  private captionFor(
    defaults: VariationDefaults,
    proofPoint: string,
    angle: string,
    limit: number
  ) {
    const parts = [
      defaults.tone ? `톤: ${defaults.tone}` : '',
      defaults.audience ? `${defaults.audience}에게 필요한 관점입니다.` : '',
      `${angle}: ${this.shortLine(proofPoint, 220)}`,
      '한 번에 완성하려고 하지 말고, 훅/증거/CTA를 나눠서 테스트하세요.',
    ].filter(Boolean);
    return this.truncate(parts.join('\n'), Math.max(120, limit - 120));
  }

  private ctaFor(defaults: VariationDefaults, index: number) {
    const options = [
      defaults.cta,
      '저장해두고 다음 게시물 작성 전에 확인하세요.',
      '댓글로 지금 막히는 채널을 남겨주세요.',
      '팀에 공유하고 이번 주 콘텐츠 실험으로 써보세요.',
    ];
    return this.truncate(options[index % options.length], 170);
  }

  private scoreBreakdown(input: {
    hook: string;
    caption: string;
    cta: string;
    angle: string;
    defaults: VariationDefaults;
  }) {
    const hook =
      45 +
      (/[0-9]|왜|아직|줄인|놓치|바꾸|경쟁/.test(input.hook) ? 24 : 0) +
      (input.hook.length >= 15 && input.hook.length <= 95 ? 18 : 0) +
      (/[?？]/.test(input.hook) ? 8 : 0);
    const clarity =
      48 +
      (input.caption.split(/\n+/).length >= 2 ? 18 : 0) +
      (/테스트|실험|순서|체크|관점/.test(input.caption) ? 18 : 0) +
      (input.defaults.audience ? 10 : 0);
    const specificity =
      40 +
      (/[0-9]/.test(input.hook + input.caption) ? 22 : 0) +
      (input.defaults.competitorHook ? 18 : 0) +
      (input.defaults.tags.length ? 10 : 0);
    const cta =
      45 +
      (/댓글|저장|공유|신청|확인|남겨/.test(input.cta) ? 28 : 0) +
      (input.cta.length >= 10 && input.cta.length <= 120 ? 18 : 0);
    const novelty =
      50 +
      (/반전|경쟁|증거|체크|비용|고객/.test(input.angle) ? 25 : 0) +
      (input.defaults.goal === 'leads' ? 8 : 0);

    return {
      hook: this.clamp(hook),
      clarity: this.clamp(clarity),
      specificity: this.clamp(specificity),
      cta: this.clamp(cta),
      novelty: this.clamp(novelty),
    };
  }

  private recommendations(
    items: SnapsPostVariationItem[],
    defaults: VariationDefaults
  ) {
    const winner = items[0];
    const reviewCount = items.filter((item) => item.status === 'needs-review').length;
    return [
      winner
        ? `Start with ${winner.platformLabel} variation #${winner.variationIndex} for ${defaults.winningMetric}.`
        : '',
      reviewCount
        ? `${reviewCount} lower-scoring variations need a stronger proof point or CTA before scheduling.`
        : 'All generated variations are ready for queue review.',
      defaults.competitorHook
        ? 'Competitor hook was used as contrast, not copied verbatim.'
        : 'Add a competitor hook to make the next experiment more specific.',
    ].filter(Boolean);
  }

  private hypothesisFor(defaults: VariationDefaults, angle: string) {
    const audience = defaults.audience || 'target operators';
    return `${angle} should improve ${defaults.winningMetric} because ${audience} can see a clearer reason to stop, save, or reply.`;
  }

  private angleFor(index: number, goal: SnapsPostVariationGoal) {
    const base = [
      '문제 인식',
      '숫자/증거',
      '반전 훅',
      '체크리스트',
      '고객 질문',
      '비용 절감',
      '경쟁 비교',
      '실행 순서',
      '전후 비교',
      '리스크 회피',
      '저장 가치',
      '전환 CTA',
    ];
    if (goal === 'leads') {
      base.unshift('구매 의도');
    }
    if (goal === 'comments') {
      base.unshift('질문 유도');
    }
    if (goal === 'saves') {
      base.unshift('저장 가치');
    }
    return base[index % base.length];
  }

  private defaultMetric(goal: SnapsPostVariationGoal) {
    return (
      {
        engagement: 'engagement rate',
        saves: 'save rate',
        comments: 'comment rate',
        clicks: 'click-through rate',
        leads: 'qualified replies/leads',
      } satisfies Record<SnapsPostVariationGoal, string>
    )[goal];
  }

  private cleanGoal(value: unknown): SnapsPostVariationGoal {
    const normalized = this.cleanText(value, 40).toLowerCase();
    if (['saves', 'save', '저장'].includes(normalized)) {
      return 'saves';
    }
    if (['comments', 'comment', 'reply', '댓글'].includes(normalized)) {
      return 'comments';
    }
    if (['clicks', 'click', 'ctr', '클릭'].includes(normalized)) {
      return 'clicks';
    }
    if (['leads', 'lead', 'sales', '전환', '리드'].includes(normalized)) {
      return 'leads';
    }
    return 'engagement';
  }

  private extractPoints(sourceText: string) {
    const lines = sourceText
      .split(/\r?\n|[.!?。！？]\s+/)
      .map((line) => line.replace(/^[-*0-9.)\s]+/, '').trim())
      .filter((line) => line.length >= 12);
    return [...new Set(lines)].slice(0, 20);
  }

  private cleanPlatforms(value: unknown): SnapsTargetPlatform[] {
    const raw = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[,|\s]+/)
        : [];
    return raw
      .map((platform) => this.cleanText(platform, 40).toLowerCase())
      .map((platform) => {
        const aliases: Record<string, SnapsTargetPlatform> = {
          thread: 'threads',
          threads: 'threads',
          instagram: 'instagram',
          insta: 'instagram',
          linkedin: 'linkedin',
          linkedIn: 'linkedin',
          x: 'x',
          twitter: 'x',
          tiktok: 'tiktok',
          youtube: 'youtube',
          shorts: 'youtube',
          bluesky: 'bluesky',
          bsky: 'bluesky',
          facebook: 'facebook',
          fb: 'facebook',
          pinterest: 'pinterest',
          pin: 'pinterest',
          'naver-blog': 'naver-blog',
          naver: 'naver-blog',
          'naver-cafe': 'naver-cafe',
          cafe: 'naver-cafe',
          kakao: 'kakao-talk',
          kakaotalk: 'kakao-talk',
          xiaohongshu: 'xiaohongshu',
          rednote: 'xiaohongshu',
        };
        return aliases[platform] || platform;
      })
      .filter((platform): platform is SnapsTargetPlatform =>
        snapsTargetPlatforms.includes(platform as SnapsTargetPlatform)
      )
      .filter((platform, index, list) => list.indexOf(platform) === index);
  }

  private hashtagsFor(defaults: VariationDefaults, limit: number) {
    return this.cleanTags([
      defaults.topic,
      defaults.goal,
      ...defaults.tags,
      'contentops',
      'snaps',
    ]).slice(0, Math.max(0, limit));
  }

  private cleanTags(value: unknown): string[] {
    const raw = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[,#\s]+/)
        : [];
    return raw
      .map((tag) => this.cleanText(tag, 40).replace(/^#/, '').trim())
      .filter(Boolean)
      .map((tag) => `#${tag}`)
      .filter((tag, index, list) => list.indexOf(tag) === index)
      .slice(0, 12);
  }

  private extractTopic(text: string) {
    return (
      this.firstLine(text)
        .replace(/[#*_`]/g, '')
        .split(/\s+/)
        .slice(0, 8)
        .join(' ') || 'content experiment'
    );
  }

  private firstLine(value: string) {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) || '';
  }

  private shortLine(value: string, limit: number) {
    return this.truncate(value.replace(/\s+/g, ' ').trim(), limit);
  }

  private cleanText(value: unknown, limit: number) {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return '';
    }
    return String(value).replace(/\u0000/g, '').trim().slice(0, limit);
  }

  private clampNumber(value: unknown, fallback: number, min: number, max: number) {
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : NaN;
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(parsed)));
  }

  private truncate(value: string, limit: number) {
    if (value.length <= limit) {
      return value;
    }
    return `${value.slice(0, Math.max(0, limit - 1)).trim()}…`;
  }

  private clamp(value: number) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }
}
