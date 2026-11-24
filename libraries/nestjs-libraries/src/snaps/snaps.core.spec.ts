import path from 'path';
import { promises as fs } from 'fs';
import { SnapsContentTransformService } from '@gitroom/nestjs-libraries/snaps/transform/content-transform.service';
import { buildSnapsTransformUserPrompt } from '@gitroom/nestjs-libraries/snaps/ai/prompt.builder';
import {
  snapsPlatformRules,
  snapsTargetPlatforms,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import {
  buildSnapsPublishingPayload,
  unsafeSnapsMediaReason,
} from '@gitroom/nestjs-libraries/snaps/schedule/publishing-payload.builder';
import { SnapsFeedbackInboxService } from '@gitroom/nestjs-libraries/snaps/inbox/feedback-inbox.service';
import { SnapsVectorStoreService } from '@gitroom/nestjs-libraries/snaps/rag/vector-store.service';
import { SnapsRagService } from '@gitroom/nestjs-libraries/snaps/rag/rag.service';
import { SnapsReportGeneratorService } from '@gitroom/nestjs-libraries/snaps/analytics/report-generator.service';
import { SnapsShortVideoService } from '@gitroom/nestjs-libraries/snaps/video/short-video.service';
import { SnapsVideoVoiceoverCaptionService } from '@gitroom/nestjs-libraries/snaps/video/voiceover-caption.service';
import { SnapsVideoPublishGuardService } from '@gitroom/nestjs-libraries/snaps/video/video-publish-guard.service';
import { SnapsRepurposeQueueService } from '@gitroom/nestjs-libraries/snaps/repurpose/repurpose-queue.service';
import { SnapsAdDisclosureGuardService } from '@gitroom/nestjs-libraries/snaps/compliance/ad-disclosure-guard.service';
import { SnapsSourceLibraryService } from '@gitroom/nestjs-libraries/snaps/library/source-library.service';
import { describeSnapsScheduleResult } from '@gitroom/helpers/utils/snaps.schedule.result';
import { SnapsSourceResolverService } from '@gitroom/nestjs-libraries/snaps/source-resolver/source-resolver.service';
import { SnapsFeedIntakeService } from '@gitroom/nestjs-libraries/snaps/feeds/feed-intake.service';
import { SnapsContentIdeaService } from '@gitroom/nestjs-libraries/snaps/ideas/content-idea.service';
import {
  SnapsLinkAttributionService,
  isSnapsPreviewBot,
} from '@gitroom/nestjs-libraries/snaps/sales/link-attribution.service';
import { runSnapsSerialized } from '@gitroom/nestjs-libraries/snaps/utils/serialized-store';
import { weightedLength } from '@gitroom/helpers/utils/count.length';
import { SnapsContentCalendarService } from '@gitroom/nestjs-libraries/snaps/calendar/content-calendar.service';
import { SnapsContentCategoryService } from '@gitroom/nestjs-libraries/snaps/categories/content-category.service';
import {
  nextSnapsZonedOccurrence,
  snapsTimezoneOffsetMinutes,
  snapsZonedTimeToDate,
} from '@gitroom/nestjs-libraries/snaps/utils/zoned-time';
import { SnapsApprovalWorkflowService } from '@gitroom/nestjs-libraries/snaps/approvals/approval-workflow.service';
import { SnapsBulkCampaignService } from '@gitroom/nestjs-libraries/snaps/bulk/bulk-campaign.service';
import { SnapsPostConditionService } from '@gitroom/nestjs-libraries/snaps/conditions/post-condition.service';
import { SnapsRecurringPostService } from '@gitroom/nestjs-libraries/snaps/recurring/recurring-post.service';
import { cleanSnapsMultilineText } from '@gitroom/nestjs-libraries/snaps/utils/multiline-text';
import { SnapsActivityLogService } from '@gitroom/nestjs-libraries/snaps/activity/activity-log.service';
import { SnapsCommandPlannerService } from '@gitroom/nestjs-libraries/snaps/agent/command-planner.service';
import { SnapsAgentTaskService } from '@gitroom/nestjs-libraries/snaps/agent/agent-task.service';
import { SnapsPostVariationService } from '@gitroom/nestjs-libraries/snaps/experiments/post-variation.service';
import { SnapsCreativeBriefService } from '@gitroom/nestjs-libraries/snaps/creative/creative-brief.service';
import { SnapsHashtagTrackerService } from '@gitroom/nestjs-libraries/snaps/hashtags/hashtag-tracker.service';
import { SnapsTrendRadarService } from '@gitroom/nestjs-libraries/snaps/trends/trend-radar.service';
import { SnapsPostPreviewService } from '@gitroom/nestjs-libraries/snaps/previews/post-preview.service';
import { NaverCafeProvider } from '@gitroom/nestjs-libraries/integrations/social/naver-cafe.provider';
import { OllamaClient } from '@gitroom/nestjs-libraries/snaps/ai/ollama.client';

class OfflineOllama {
  get model() {
    return 'jest-offline-ollama';
  }

  async chatJson<T>(): Promise<T> {
    throw new Error('offline test path');
  }
}

class PartialOllama extends OfflineOllama {
  get model() {
    return 'jest-partial-ollama';
  }

  async chatJson<T>(): Promise<T> {
    return {
      variants: [
        {
          platform: 'instagram',
          title: 'AI normalized title',
          content: 'AI normalized Instagram content',
          hashtags: 'snaps #snaps 마케팅',
          notes: 'notes should be ignored because it is not an array',
        },
      ],
    } as T;
  }
}

class MalformedVariantOllama extends OfflineOllama {
  get model() {
    return 'jest-malformed-variant-ollama';
  }

  async chatJson<T>(): Promise<T> {
    return {
      variants: [
        {
          platform: 'instagram',
          title: {
            invalid: true,
          },
          content: {
            invalid: true,
          },
          hashtags: ['좋은 태그', '#중복', '중복', 'bad!tag'],
          notes: [' 정상 노트 ', null],
        },
        {
          platform: 'threads',
          content: '정상 Threads 결과',
          hashtags: ['threads update', '#threads'],
        },
      ],
    } as T;
  }
}

class LegacyFeedbackSummaryOllama extends OfflineOllama {
  async chatJson<T>(): Promise<T> {
    return {
      total: '2',
      byPlatform: {
        threads: '2',
      },
      bySentiment: {
        positive: '1',
        negative: '1',
      },
      highlights: ['legacy sentiment aliases normalized'],
      replySuggestions: [
        {
          target: 'negative',
          reply: '불편하셨던 부분을 확인하고 보완하겠습니다.',
        },
      ],
    } as T;
  }
}

class UndercountingFeedbackSummaryOllama extends OfflineOllama {
  async chatJson<T>(): Promise<T> {
    return {
      total: 0,
      byPlatform: {
        threads: 0,
        instagram: 0,
      },
      bySentiment: {
        question: 0,
        collaboration: 0,
      },
      highlights: ['llm undercount should not erase deterministic counts'],
      replySuggestions: [],
    } as T;
  }
}

class MalformedReportOllama extends OfflineOllama {
  async chatJson<T>(): Promise<T> {
    return {
      summary: {
        invalid: true,
      },
    } as T;
  }
}

class MalformedShortsOllama extends OfflineOllama {
  async chatJson<T>(): Promise<T> {
    return {
      title: {
        invalid: true,
      },
      coreSummary: ['요약', '문장'],
      hook: {
        invalid: true,
      },
      durationSeconds: '60',
      narration: ['첫 문장', '둘째 문장'],
      storyboard: [
        null,
        {
          scene: '2',
          startSecond: 'bad',
          endSecond: 999,
          visual: {
            invalid: true,
          },
          narration: ['장면', '나레이션'],
          overlayText: ['오버레이'],
          pixellePrompt: {
            invalid: true,
          },
        },
        {
          scene: 3,
          visual: '정상 영상 장면',
        },
        'bad scene',
      ],
      uploadMetadata: {
        title: {
          invalid: true,
        },
        description: ['업로드', '설명'],
        hashtags: 'shorts #snaps 나쁜!태그',
      },
    } as T;
  }
}

class EmbeddingOllama extends OfflineOllama {
  async embed(input: string | string[]): Promise<number[][]> {
    const values = Array.isArray(input) ? input : [input];
    return values.map((value) => [
      value.includes('인스타그램') || value.includes('instagram') ? 1 : 0,
      value.includes('고객') ? 1 : 0,
      value.length / 1000,
    ]);
  }
}

class MalformedEmbeddingOllama extends OfflineOllama {
  async embed(): Promise<number[][]> {
    return [[1, Number.NaN, Number.POSITIVE_INFINITY, 'bad' as unknown as number, 0.5]];
  }
}

const emptyRag = {
  search: jest.fn().mockResolvedValue([]),
};

describe('snaps core behavior', () => {
  const originalDataDir = process.env.SNAPS_DATA_DIR;
  const originalFallback = process.env.SNAPS_ALLOW_RULE_FALLBACK;
  const originalPixelleUrl = process.env.PIXELLE_VIDEO_URL;

  afterEach(async () => {
    process.env.SNAPS_ALLOW_RULE_FALLBACK = originalFallback;
    if (originalPixelleUrl === undefined) {
      delete process.env.PIXELLE_VIDEO_URL;
    } else {
      process.env.PIXELLE_VIDEO_URL = originalPixelleUrl;
    }
    if (originalDataDir === undefined) {
      delete process.env.SNAPS_DATA_DIR;
    } else {
      process.env.SNAPS_DATA_DIR = originalDataDir;
    }
    jest.clearAllMocks();
  });

  it('keeps every target platform backed by a detailed culture playbook', () => {
    for (const platform of snapsTargetPlatforms) {
      const playbook = snapsPlatformRules[platform].playbook;

      expect(playbook.sourceBasis.length).toBeGreaterThan(0);
      expect(playbook.audienceMindset.length).toBeGreaterThan(20);
      expect(playbook.nativeGrammar.length).toBeGreaterThan(1);
      expect(playbook.openingMoves.length).toBeGreaterThan(1);
      expect(playbook.bodyMoves.length).toBeGreaterThan(1);
      expect(playbook.ctaMoves.length).toBeGreaterThan(0);
      expect(playbook.avoid.length).toBeGreaterThan(1);
    }
  });

  it('passes research-backed playbooks into the transform prompt', () => {
    const prompt = buildSnapsTransformUserPrompt({
      body: {
        sourceText: '새로운 제품 업데이트를 여러 SNS에 맞게 바꿉니다.',
        targetPlatforms: ['threads', 'instagram', 'naver-blog', 'xiaohongshu'],
        useRag: false,
      } as any,
      targetPlatforms: ['threads', 'instagram', 'naver-blog', 'xiaohongshu'],
      ragHits: [],
    });
    const parsed = JSON.parse(prompt);
    const rulesByPlatform = new Map(
      parsed.platformRules.map((rule: any) => [rule.platform, rule])
    );

    expect(rulesByPlatform.get('threads').playbook.nativeGrammar.join(' ')).toContain(
      'blank lines'
    );
    expect(rulesByPlatform.get('instagram').playbook.sourceBasis.join(' ')).toContain(
      'five relevant hashtags'
    );
    expect(rulesByPlatform.get('naver-blog').playbook.nativeGrammar.join(' ')).toContain(
      'table of contents'
    );
    expect(rulesByPlatform.get('xiaohongshu').playbook.bodyMoves.join(' ')).toContain(
      'numbered tips'
    );
  });

  it('keeps Naver Blog, KakaoTalk, and Xiaohongshu as assist-only rule fallback variants', async () => {
    process.env.SNAPS_ALLOW_RULE_FALLBACK = 'true';
    const transformer = new SnapsContentTransformService(
      new OfflineOllama() as any,
      emptyRag as any
    );

    const result = await transformer.transform('jest-org', {
      sourceText: '이번 주 신제품 업데이트와 고객 반응을 플랫폼별 게시물로 정리합니다.',
      targetPlatforms: ['naver-blog', 'kakao-talk', 'xiaohongshu'],
      useRag: false,
    });

    const naverBlog = result.variants.find(
      (variant) => variant.platform === 'naver-blog'
    );
    const kakaoTalk = result.variants.find(
      (variant) => variant.platform === 'kakao-talk'
    );
    const xiaohongshu = result.variants.find(
      (variant) => variant.platform === 'xiaohongshu'
    );

    expect(result.provider).toBe('rule-fallback');
    expect(naverBlog?.publishMode).toBe('assist');
    expect(naverBlog?.content).toContain('목차');
    expect(naverBlog?.content).toContain('본문');
    expect(kakaoTalk?.publishMode).toBe('assist');
    expect(xiaohongshu?.publishMode).toBe('assist');
    expect(xiaohongshu?.content).toContain('중국 SNS 노트');
  });

  it('creates schedulable Bluesky, Facebook, and Pinterest fallback variants', async () => {
    process.env.SNAPS_ALLOW_RULE_FALLBACK = 'true';
    const transformer = new SnapsContentTransformService(
      new OfflineOllama() as any,
      emptyRag as any
    );

    const result = await transformer.transform('jest-org', {
      sourceText: '신규 리포트에서 발견한 고객 전환 신호와 콘텐츠 아이디어를 요약합니다.',
      targetPlatforms: ['bluesky', 'facebook', 'pinterest'],
      useRag: false,
    });

    const bluesky = result.variants.find((variant) => variant.platform === 'bluesky');
    const facebook = result.variants.find((variant) => variant.platform === 'facebook');
    const pinterest = result.variants.find((variant) => variant.platform === 'pinterest');

    expect(result.provider).toBe('rule-fallback');
    expect(bluesky?.publishMode).toBe('schedule');
    expect(bluesky?.content.length).toBeLessThanOrEqual(300);
    expect(facebook?.settings).toMatchObject({ __type: 'facebook' });
    expect(pinterest?.title).toBeTruthy();
    expect(pinterest?.settings).toMatchObject({ __type: 'pinterest', board: '' });
  });

  it('normalizes partial Ollama variants and fills omitted requested platforms', async () => {
    const transformer = new SnapsContentTransformService(
      new PartialOllama() as any,
      emptyRag as any
    );

    const result = await transformer.transform('jest-org', {
      sourceText: 'LLM이 일부 플랫폼만 반환해도 나머지는 보정되어야 합니다.',
      targetPlatforms: ['instagram', 'threads'],
      useRag: false,
    });

    const instagram = result.variants.find(
      (variant) => variant.platform === 'instagram'
    );
    const threads = result.variants.find(
      (variant) => variant.platform === 'threads'
    );

    expect(result.provider).toBe('ollama');
    expect(result.variants).toHaveLength(2);
    expect(instagram?.content).toBe('AI normalized Instagram content');
    expect(instagram?.hashtags).toEqual(['#snaps', '#마케팅']);
    expect(instagram?.notes).toEqual([]);
    expect(threads?.content).toContain('LLM이 일부 플랫폼만 반환해도');
    expect(result.warnings).toContainEqual(
      expect.stringContaining('Ollama omitted threads')
    );

    const malformedResult = await new SnapsContentTransformService(
      new MalformedVariantOllama() as any,
      emptyRag as any
    ).transform('jest-org', {
      sourceText: '비정상 variant가 와도 나머지 플랫폼은 유지되어야 합니다.',
      targetPlatforms: ['instagram', 'threads'],
      useRag: false,
    });
    const malformedInstagram = malformedResult.variants.find(
      (variant) => variant.platform === 'instagram'
    );
    const malformedThreads = malformedResult.variants.find(
      (variant) => variant.platform === 'threads'
    );
    expect(malformedResult.provider).toBe('ollama');
    expect(malformedInstagram?.content).toContain('비정상 variant');
    expect(malformedThreads?.content).toBe('정상 Threads 결과');
    expect(malformedThreads?.hashtags).toEqual(['#threads']);
  });

  it('preserves valid schedule payloads while warning about invalid Naver Cafe settings and Pinterest board settings', () => {
    const result = buildSnapsPublishingPayload({
      variants: [
        {
          platform: 'instagram',
          label: 'Instagram',
          content: 'Instagram body',
          hashtags: [],
          settings: { __type: 'instagram', post_type: 'post' },
          publishMode: 'schedule',
        },
        {
          platform: 'naver-cafe',
          label: 'Naver Cafe',
          content: 'Cafe body',
          hashtags: [],
          settings: { __type: 'naver-cafe' },
          publishMode: 'schedule',
        },
        {
          platform: 'pinterest',
          label: 'Pinterest',
          title: 'Pin title',
          content: 'Pinterest body',
          hashtags: [],
          settings: { __type: 'pinterest' },
          publishMode: 'schedule',
        },
      ],
      integrations: [
        { platform: 'instagram', integrationId: 'instagram-id' },
        { platform: 'naver-cafe', integrationId: 'naver-cafe-id' },
        { platform: 'pinterest', integrationId: 'pinterest-id' },
      ],
      publishDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      scheduleType: 'schedule',
    });

    expect(result.payload?.posts).toHaveLength(1);
    expect(result.payload?.posts[0].integration.id).toBe('instagram-id');
    expect(result.warnings).toContain(
      'Naver Cafe scheduling requires clubId and menuId settings. The Naver Cafe variant was skipped.'
    );
    expect(result.warnings).toContain(
      'Pinterest scheduling requires a board setting. The Pinterest variant was skipped.'
    );

    const invalidScheduleType = buildSnapsPublishingPayload({
      variants: [
        {
          platform: 'instagram',
          label: 'Instagram',
          content: 'Instagram body',
          hashtags: [],
          settings: { __type: 'instagram', post_type: 'post' },
          publishMode: 'schedule',
        },
      ],
      integrations: [{ platform: 'instagram', integrationId: 'instagram-id' }],
      scheduleType: 'publish-now' as any,
    });

    expect(invalidScheduleType.payload?.type).toBe('draft');
  });

  it('splits long Threads variants into reply-chain draft values', () => {
    const longThreadsContent = [
      '1/3 이건 짧게 보면 돼. 첫 문장은 바로 대화가 열리게 만들고, 핵심 주장 하나만 던진다.',
      '2/3 그다음 댓글에서는 왜 그런지 설명한다. 정보는 한 번에 몰아넣기보다 댓글마다 한 포인트씩 나누는 편이 읽기 쉽다.'.repeat(12),
      '3/3 마지막 댓글은 질문으로 닫는다. 너라면 이 상황에서 어떤 기준으로 판단할 것 같아?',
    ].join('\n\n');

    const result = buildSnapsPublishingPayload({
      variants: [
        {
          platform: 'threads',
          label: 'Threads',
          content: longThreadsContent,
          hashtags: [],
          settings: { __type: 'threads' },
          publishMode: 'schedule',
        },
      ],
      integrations: [{ platform: 'threads', integrationId: 'threads-id' }],
      scheduleType: 'draft',
    });

    const values = result.payload?.posts[0].value || [];
    expect(values.length).toBeGreaterThan(1);
    expect(values.every((value) => value.content.length <= 500)).toBe(true);
    expect(values[0].delay).toBe(0);
    expect(values.slice(1).every((value) => value.delay === 1)).toBe(true);
  });

  it('ranks post variation experiments and converts winners to schedulable variants', () => {
    const service = new SnapsPostVariationService();
    const preview = service.preview({
      sourceText:
        '성과 좋은 게시물 하나를 여러 훅으로 바꿔 실험합니다.\n저장 가치, 댓글 질문, 숫자 증거를 나눠서 리드 전환 가능성을 확인합니다.',
      title: 'Post variation smoke',
      topic: '콘텐츠 실험',
      audience: 'B2B 마케터',
      cta: '댓글로 실험이라고 남기면 샘플 훅을 보내드립니다.',
      targetPlatforms: ['threads', 'instagram', 'linkedin'],
      variantCount: 5,
      goal: 'leads',
      competitorHook: '손작업 콘텐츠를 줄이세요',
      tags: ['experiment'],
    });
    const sources = service.toSourceInputs(preview.items);
    const variants = service.toVariants(preview.items);

    expect(preview.source).toBe('snaps-post-variation-lab');
    expect(preview.totalVariants).toBe(5);
    expect(preview.items[0]).toMatchObject({
      rank: 1,
      status: 'winner',
    });
    expect(preview.winningVariantId).toBe(preview.items[0].id);
    expect(sources[0].sourcePlatform).toBe('post-variation-lab');
    expect(variants.length).toBeGreaterThan(0);
    expect(variants[0].settings.source).toBe('snaps-post-variation-lab');
  });

  it('scores hashtag performance and prepares tracked hashtag sets', () => {
    const service = new SnapsHashtagTrackerService();
    const preview = service.preview({
      title: 'Hashtag tracker smoke',
      topic: '콘텐츠 운영',
      goal: 'engagement',
      hashtagText: '#snaps #콘텐츠운영 #마케팅자동화',
      targetPlatforms: ['instagram', 'x'],
      importText:
        'hashtag,platform,posts,impressions,engagements,comments,saves,clicks\n' +
        '#snaps,instagram,7,11200,740,44,116,51\n' +
        '#콘텐츠운영,instagram,6,9100,512,35,71,44\n' +
        '#마케팅자동화,x,11,17400,540,39,21,72',
    });
    const setInput = service.toHashtagSetInput(preview, {
      setTitle: 'Tracked smoke hashtags',
    });

    expect(preview.source).toBe('snaps-hashtag-tracker');
    expect(preview.trackedHashtags).toBeGreaterThanOrEqual(3);
    expect(preview.items[0].action).toBe('keep');
    expect(preview.bestHashtag).toBe(preview.items[0].hashtag);
    expect(setInput.source).toBe('snaps-hashtag-tracker');
    expect(setInput.hashtags).toContain(preview.bestHashtag);
  });

  it('turns trend radar signals into alerts and source ideas', () => {
    const service = new SnapsTrendRadarService();
    const preview = service.preview({
      title: 'Trend radar smoke',
      industry: 'B2B 콘텐츠 자동화',
      region: 'KR',
      keywords: ['#콘텐츠자동화', '가격 문의'],
      targetPlatforms: ['instagram', 'threads'],
      importText:
        'topic,platform,volume,previousVolume,engagement,sentiment,competitor,format,content,source\n' +
        '#콘텐츠자동화,instagram,46,18,930,positive,Rival Studio,reels,"3초 문제 훅이 올라옴",competitor\n' +
        '예약 오류 알림,x,18,5,160,negative,,post,"오류가 있으면 바로 알려줘야 함",listening',
    });
    const sources = service.toSourceInputs(preview);

    expect(preview.source).toBe('snaps-trend-radar');
    expect(preview.trends.length).toBeGreaterThanOrEqual(2);
    expect(preview.alerts.some((alert) => alert.severity === 'high')).toBe(true);
    expect(preview.trends.some((trend) => trend.competitorLead === 'Rival Studio')).toBe(true);
    expect(sources.length).toBe(preview.contentIdeas.length);
    expect(sources[0].sourcePlatform).toBe('trend-radar');
  });

  it('previews platform feed cuts and accessibility before publishing', () => {
    const service = new SnapsPostPreviewService();
    const preview = service.preview({
      variants: [
        {
          platform: 'instagram',
          label: 'Instagram',
          title: 'Preview smoke',
          content:
            '가격 문의가 많은 B2B 콘텐츠 운영팀을 위한 긴 캡션입니다. '.repeat(8) +
            'https://example.com/report #snaps',
          hashtags: ['#snaps'],
          media: [{ id: 'media-1', path: 'https://example.com/cover.png' }],
          settings: {},
          publishMode: 'schedule',
        },
        {
          platform: 'linkedin',
          label: 'LinkedIn',
          title: 'Preview smoke',
          content: '업무 맥락에서 링크 프리뷰와 첫 줄 컷을 확인합니다. https://example.com/report',
          hashtags: ['#B2B'],
          settings: {},
          publishMode: 'schedule',
        },
      ],
      linkUrl: 'https://example.com/report',
      linkTitle: 'AI 콘텐츠 운영 리포트',
      linkDescription: '게시 전 링크 카드가 충분한지 확인합니다.',
      device: 'mobile',
    });

    expect(preview.source).toBe('snaps-post-preview-inspector');
    expect(preview.cards).toHaveLength(2);
    expect(preview.cards[0].feedPreview).toContain('더보기');
    expect(preview.cards[0].warnings).toContain('Media is missing alt text for accessibility.');
    expect(preview.cards[0].mediaPreview.altTextSuggestion).toContain('Preview smoke');
    expect(preview.averageAccessibilityScore).toBeGreaterThan(0);
  });

  it('builds creative design briefs and media-library handoff inputs', () => {
    const service = new SnapsCreativeBriefService();
    const preview = service.preview({
      title: 'Creative brief smoke',
      sourceText:
        'AI 콘텐츠 운영 캠페인을 카드뉴스 커버와 숏폼 썸네일로 재사용합니다.',
      mediaType: 'carousel',
      aspectRatio: 'portrait',
      targetPlatforms: ['instagram', 'linkedin'],
      cta: '댓글로 파일럿이라고 남겨주세요.',
    });
    const mediaInput = service.toMediaAssetInput(preview, {
      itemId: preview.items[0].id,
    });

    expect(preview.source).toBe('snaps-creative-brief');
    expect(preview.items).toHaveLength(3);
    expect(preview.items[0].svgDataUrl).toMatch(/^data:image\/svg\+xml/);
    expect(preview.items[0].productionNotes.join(' ')).toContain('slide');
    expect(mediaInput.source).toBe('snaps-creative-brief');
    expect(mediaInput.targetPlatforms).toEqual(['instagram', 'linkedin']);
  });

  it('prepares natural language agent orders as drafts with confirmation required', async () => {
    delete process.env.PIXELLE_VIDEO_URL;
    process.env.SNAPS_ALLOW_RULE_FALLBACK = 'true';
    const transformer = new SnapsContentTransformService(
      new OfflineOllama() as any,
      emptyRag as any
    );
    const shorts = new SnapsShortVideoService(new OfflineOllama() as any);
    const planner = new SnapsCommandPlannerService(
      new OfflineOllama() as any,
      transformer,
      shorts
    );

    const prepared = await planner.prepare('jest-org', {
      command:
        '내일 10시에 인공지능 관련 게시글 작성해서 인스타, 스레드, 링크드인에 올려줘. 관련 내용으로 쇼츠도 웃기게 만들어서 알아서 올려줘.',
      useRag: false,
      now: '2026-05-12T00:00:00',
      timezoneOffsetMinutes: -540,
    });

    expect(prepared.plan.scheduleType).toBe('schedule');
    expect(prepared.plan.needsConfirmation).toBe(true);
    expect(prepared.plan.publishDateLocal).toContain('2026-05-13T10:00');
    expect(prepared.plan.targetPlatforms).toEqual(
      expect.arrayContaining(['instagram', 'threads', 'linkedin', 'youtube'])
    );
    expect(prepared.plan.shortVideoTargetPlatforms).toEqual(
      expect.arrayContaining(['instagram', 'youtube'])
    );
    expect(prepared.transform.variants.map((variant) => variant.platform)).toEqual(
      expect.arrayContaining(['instagram', 'threads', 'linkedin', 'youtube'])
    );
    expect(prepared.plan.marketingStrategy).toMatchObject({
      framework: 'Monetize-Publish-Engage-Create',
      inspiredBy: 'AiToEarn',
      revenueModels: expect.arrayContaining(['CPE', 'CPM']),
    });
    expect(prepared.plan.marketingStrategy.lanes.map((lane) => lane.lane)).toEqual([
      'monetize',
      'publish',
      'engage',
      'create',
    ]);
    expect(prepared.plan.marketingStrategy.engagementSignals).toContainEqual(
      expect.objectContaining({
        id: 'link-request',
        priority: 'high',
      })
    );
    expect(prepared.plan.operatorSummary.join(' ')).toContain('예약 실행 전 확인');
    expect(prepared.plan.missingInputs).toEqual(
      expect.arrayContaining(['연동 계정 선택', '쇼츠 영상 생성 승인 또는 영상 URL'])
    );
    expect(prepared.plan.confirmationChecklist).toContainEqual(
      expect.objectContaining({
        id: 'final-confirmation',
        status: 'attention',
      })
    );
    expect(prepared.plan.campaignTimeline.map((item) => item.id)).toEqual([
      'prepare',
      'publish',
      'monitor',
      'engage',
      'repurpose',
    ]);
    expect(prepared.plan.marketingStrategy.batchIdeas.join(' ')).toContain('쇼츠');
    expect(prepared.plan.competitorPlaybook.parityFeatures).toContainEqual(
      expect.objectContaining({
        id: 'agent-automation',
        status: 'implemented',
      })
    );
    expect(prepared.plan.competitorPlaybook.parityFeatures).toContainEqual(
      expect.objectContaining({
        id: 'evergreen-recycle',
        status: 'implemented',
      })
    );
    expect(prepared.plan.goToMarketPlan.segments).toContainEqual(
      expect.objectContaining({
        id: 'solo-creator',
      })
    );
    expect(prepared.plan.scenarioRun.workflow.join(' ')).toContain('RAG');
    expect(prepared.plan.scenarioRun.preparedOutputs.join(' ')).toContain(
      '채널 초안'
    );
    expect(prepared.operation).toMatchObject({
      status: 'requires_confirmation',
      requiresConfirmation: true,
    });
    expect(prepared.operation.readiness.score).toBeGreaterThan(0);
    expect(prepared.operation.qualityGates).toContainEqual(
      expect.objectContaining({
        id: 'short-video-asset',
      })
    );
    expect(prepared.operation.recommendedActions).toContainEqual(
      expect.objectContaining({
        actionType: 'send-shorts',
        priority: 'high',
      })
    );
    expect(prepared.operation.progress).toBeGreaterThanOrEqual(80);
    expect(prepared.operation.progressSteps.map((step) => step.id)).toContain(
      'confirmation'
    );
    expect(prepared.operation.platformReadiness).toContainEqual(
      expect.objectContaining({
        platform: 'instagram',
        status: 'ready',
      })
    );
    expect((prepared.video as any).status).toBe('script-ready');
    expect(prepared.warnings.join(' ')).toContain('confirmation');
  });

  it('stores searchable and rateable agent task history', async () => {
    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-agent-task-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    process.env.SNAPS_ALLOW_RULE_FALLBACK = 'true';
    const transformer = new SnapsContentTransformService(
      new OfflineOllama() as any,
      emptyRag as any
    );
    const shorts = new SnapsShortVideoService(new OfflineOllama() as any);
    const planner = new SnapsCommandPlannerService(
      new OfflineOllama() as any,
      transformer,
      shorts
    );
    const tasks = new SnapsAgentTaskService();

    try {
      const prepared = await planner.prepare('jest-org', {
        command: '내일 10시에 AI 마케팅 게시글을 링크드인에 올려줘.',
        useRag: false,
        now: '2026-05-12T00:00:00',
        timezoneOffsetMinutes: -540,
      });
      const stored = await tasks.createFromPrepared('jest-org', prepared);
      const listed = await tasks.list('jest-org', {
        keyword: 'AI 마케팅',
        pageSize: 4,
      });
      const favorited = await tasks.setFavorite('jest-org', stored.id, true);
      const rated = await tasks.setRating('jest-org', stored.id, 5, '좋은 운영맵');
      const exported = await tasks.exportTasks('jest-org');

      expect(stored.status).toBe('requires_confirmation');
      expect(stored.messages.map((message) => message.type)).toEqual([
        'user',
        'assistant',
        'result',
      ]);
      expect(stored.messages[2].content).toContain('확인 필요');
      expect(listed.total).toBe(1);
      expect(listed.list[0]).toMatchObject({
        id: stored.id,
        progress: prepared.operation.progress,
      });
      expect(favorited?.favorite).toBe(true);
      expect(rated?.rating).toBe(5);
      expect(exported).toHaveLength(1);
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  it('ignores malformed feedback import and summary items without crashing', async () => {
    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    const inbox = new SnapsFeedbackInboxService(new OfflineOllama() as any);

    try {
      const imported = await inbox.importItems('jest-org', {
        items: [
          null,
          { platform: 'unknown-platform', content: 'ignored feedback' },
          { platform: 'threads', content: '' },
          { platform: 'threads', content: { invalid: true } },
        ] as any,
      });
      const importedStored = await inbox.importStoredItems('jest-org', [
        {
          id: { invalid: true },
          platform: 'threads',
          content: { invalid: true },
        },
        {
          id: 'clean-feedback',
          platform: 'instagram',
          content: '정상 피드백만 저장되어야 합니다.',
          author: { invalid: true },
        },
      ]);
      const summary = await inbox.summarize('jest-org', {
        items: [
          { platform: 'threads', content: '이 기능은 어떻게 쓰나요?' },
          { platform: 'bad-platform', content: 'ignored' },
          { platform: 'instagram', content: '' },
        ] as any,
      });

      expect(imported.imported).toBe(0);
      expect(imported.total).toBe(0);
      expect(importedStored.imported).toBe(1);
      await expect(inbox.listItems('jest-org')).resolves.toEqual([
        expect.objectContaining({
          id: 'clean-feedback',
          author: undefined,
        }),
      ]);
      expect(summary.total).toBe(1);
      expect(summary.bySentiment.question).toBe(1);
      expect(summary.conversionSignals).toContainEqual(
        expect.objectContaining({
          id: 'how-to-use',
          count: 1,
        })
      );

      const legacyInbox = new SnapsFeedbackInboxService(
        new LegacyFeedbackSummaryOllama() as any
      );
      await legacyInbox.importItems('jest-org', {
        items: [
          { platform: 'threads', content: '좋아요' },
          { platform: 'threads', content: '불편합니다' },
        ],
      });
      const legacySummary = await legacyInbox.summarize('jest-org');
      expect(legacySummary.bySentiment.praise).toBe(1);
      expect(legacySummary.bySentiment.complaint).toBe(1);
      expect(legacySummary.replySuggestions[0].target).toBe('complaint');

      const undercountInbox = new SnapsFeedbackInboxService(
        new UndercountingFeedbackSummaryOllama() as any
      );
      await undercountInbox.importItems('jest-org-undercount', {
        items: [
          { platform: 'threads', content: '이 기능은 어떻게 쓰나요?' },
          { platform: 'instagram', content: '협업 문의 드립니다.' },
        ],
      });
      const undercountSummary = await undercountInbox.summarize(
        'jest-org-undercount'
      );
      expect(undercountSummary.total).toBe(2);
      expect(undercountSummary.byPlatform.threads).toBe(1);
      expect(undercountSummary.byPlatform.instagram).toBe(1);
      expect(undercountSummary.bySentiment.question).toBe(1);
      expect(undercountSummary.bySentiment.collaboration).toBe(1);
      expect(undercountSummary.conversionSignals).toContainEqual(
        expect.objectContaining({
          id: 'collaboration',
          count: 1,
        })
      );
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  it('routes inbox cases into team assignment lanes', async () => {
    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-inbox-assign-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    const inbox = new SnapsFeedbackInboxService(new OfflineOllama() as any);

    try {
      const template = await inbox.saveReplyTemplate('jest-org-assign', {
        title: '가격 질문 답변',
        platform: 'instagram',
        sentiment: 'question',
        body: '가격표와 데모 링크를 안내드리겠습니다.',
      });
      const note = await inbox.saveInboxNote('jest-org-assign', {
        platform: 'instagram',
        author: 'lead-a',
        postId: 'post-assign',
        note: '이전에 파일럿 가격표를 요청한 리드입니다.',
        tags: ['lead', 'pricing'],
      });
      await inbox.importItems('jest-org-assign', {
        items: [
          {
            platform: 'instagram',
            author: 'lead-a',
            postId: 'post-assign',
            content: '가격은 얼마이고 구매 링크는 어디서 보나요?',
          },
          {
            platform: 'threads',
            author: 'spam-user',
            content: '카지노 광고 링크입니다 http://spam.example',
          },
        ],
      });

      const preview = await inbox.previewAssignments('jest-org-assign', {
        defaultSlaMinutes: 90,
      });
      const salesCase = preview.cases.find(
        (item) => item.assigneeRole === 'sales'
      );
      const moderationCase = preview.cases.find(
        (item) => item.assigneeRole === 'moderation'
      );

      expect(preview.source).toBe('snaps-inbox-assignments');
      expect(preview.total).toBe(2);
      expect(salesCase).toEqual(
        expect.objectContaining({
          priority: 'urgent',
          replyTemplateId: template.template.id,
        })
      );
      expect(salesCase?.noteMatches[0]?.id).toBe(note.note.id);
      expect(moderationCase?.action).toContain('스팸');
      expect(preview.teamLoad).toContainEqual(
        expect.objectContaining({
          role: 'sales',
          count: 1,
        })
      );
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  it('saves, searches, imports, rebuilds, and deletes RAG style examples', async () => {
    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-rag-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    const vectorStore = new SnapsVectorStoreService();
    const rag = new SnapsRagService(new EmbeddingOllama() as any, vectorStore);

    try {
      const example = await rag.addExample('jest-org', {
        platform: 'instagram',
        content: '고객 반응을 짧은 인스타그램 문장과 해시태그로 정리한 예시입니다.',
        topic: 'customer reaction',
      });
      const hits = await rag.search(
        'jest-org',
        '고객 반응 인스타그램 예시',
        'instagram',
        3
      );
      const imported = await rag.importExamples('jest-org', [
        {
          id: 'threads-imported-example',
          platform: 'threads',
          content: '짧은 대화체 스레드 스타일 예시입니다.',
        },
        {
          platform: 'unknown-platform',
          content: 'ignored',
        },
      ]);
      const rebuilt = await rag.rebuildEmbeddings('jest-org');
      const malformedEmbeddingExample = await new SnapsRagService(
        new MalformedEmbeddingOllama() as any,
        vectorStore
      ).addExample('jest-org', {
        platform: 'threads',
        content: '비정상 임베딩 값은 유한한 숫자만 남겨야 합니다.',
      });
      await expect(
        rag.addExample('jest-org', {
          platform: 'unknown-platform',
          content: '잘못된 플랫폼은 RAG 예시로 저장되면 안 됩니다.',
        } as any)
      ).rejects.toThrow('platform is required');
      await expect(
        rag.addExample('jest-org', {
          platform: 'threads',
          content: { invalid: true },
        } as any)
      ).rejects.toThrow('content must be at least 5 characters');
      const importedMalformed = await vectorStore.importExamples('jest-org', [
        {
          platform: 'instagram',
          content: {
            invalid: true,
          },
        },
        {
          id: 'finite-embedding-import',
          platform: 'instagram',
          content: '유한한 임베딩 값만 복구하는 예시입니다.',
          authorType: {
            invalid: true,
          },
          embedding: [1, Number.NaN, 0.25],
        },
      ]);
      const fallbackTopKHits = await vectorStore.search('jest-org', {
        query: '임베딩 예시',
        topK: Number.NaN,
      });
      const cappedImport = await vectorStore.importExamples(
        'jest-cap-org',
        Array.from({ length: 505 }, (_, index) => ({
          id: `style-cap-${index}`,
          platform: 'threads',
          content: `상한 검증용 RAG 스타일 예시 ${index} 입니다.`,
        }))
      );
      const finiteImported = (await vectorStore.listExamples('jest-org')).find(
        (item) => item.id === 'finite-embedding-import'
      );
      const cappedList = await vectorStore.listExamples('jest-cap-org');
      const deleted = await rag.deleteExample('jest-org', example.id);

      expect(hits[0].id).toBe(example.id);
      expect(imported.imported).toBe(1);
      expect(rebuilt.total).toBeGreaterThanOrEqual(2);
      expect(rebuilt.rebuilt).toBeGreaterThanOrEqual(2);
      expect(malformedEmbeddingExample.embedding).toEqual([1, 0.5]);
      expect(importedMalformed.imported).toBe(1);
      expect(finiteImported?.embedding).toEqual([1, 0.25]);
      expect(finiteImported?.authorType).toBeUndefined();
      expect(fallbackTopKHits.length).toBeGreaterThan(0);
      expect(cappedImport.imported).toBe(500);
      expect(cappedList).toHaveLength(500);
      expect(deleted.deleted).toBe(true);
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  it('normalizes source library imports and report exports without object strings', async () => {
    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-source-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    const library = new SnapsSourceLibraryService();

    try {
      const invalidSaved = library.saveSource('jest-org', {
        sourceText: { invalid: true },
      } as any);
      await expect(invalidSaved).rejects.toThrow('sourceText must be a string');

      const importedSources = await library.importSources('jest-org', [
        {
          id: { invalid: true },
          sourceText: { invalid: true },
        },
        {
          id: 'clean-source',
          title: { invalid: true },
          sourceText: '정상 원문만 source library에 남아야 합니다.',
          tags: ['tag', { invalid: true }, 'tag', 7],
        },
      ]);
      const sources = await library.listSources('jest-org');
      const source = sources.find((item) => item.id === 'clean-source');

      const importedReports = await library.importReports('jest-org', [
        {
          title: { invalid: true },
          report: {
            title: { invalid: true },
          },
        },
        {
          id: 'clean-report',
          title: 'Clean report',
          report: {
            title: 'Clean report',
            summary: { invalid: true },
            warnings: ['수집 실패 경고', { invalid: true }],
            insights: ['정상 인사이트', { invalid: true }],
            actionItems: [{ invalid: true }, '정상 액션'],
            trends: [
              {
                platform: { invalid: true },
                metricKey: 'likes',
                firstValue: 1,
                lastValue: 3,
                delta: { invalid: true },
              },
            ],
            metrics: {
              instagram: {
                likes: 3,
                broken: { invalid: true },
              },
            },
          },
        },
      ]);
      const exportedMarkdown = await library.exportReport(
        'jest-org',
        'clean-report',
        'markdown'
      );
      const exportedHtml = await library.exportReport(
        'jest-org',
        'clean-report',
        'html'
      );

      expect(importedSources.imported).toBe(1);
      expect(source?.title).toContain('정상 원문만');
      expect(source?.tags).toEqual(['tag', '7']);
      expect(importedReports.imported).toBe(1);
      expect(exportedMarkdown?.content).toContain('## Warnings');
      expect(exportedMarkdown?.content).toContain('수집 실패 경고');
      expect(exportedMarkdown?.content).toContain('정상 인사이트');
      expect(exportedMarkdown?.content).toContain('정상 액션');
      expect(exportedMarkdown?.content).toContain('- likes: 3');
      expect(exportedMarkdown?.content).not.toContain('[object Object]');
      expect(exportedHtml?.content).not.toContain('<script>');
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  it('normalizes imported activity entries without object-string titles', async () => {
    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-activity-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    const activity = new SnapsActivityLogService();

    try {
      await expect(
        activity.record('jest-org', {
          type: 'source',
          title: { invalid: true },
        } as any)
      ).rejects.toThrow('activity type and title');

      const imported = await activity.importEntries('jest-org', [
        {
          type: 'bad',
          title: 'ignored bad type',
        },
        {
          id: { invalid: true },
          type: 'source',
          title: { invalid: true },
        },
        {
          id: 'activity-clean',
          type: 'source',
          title: ['정상', '활동'],
          detail: [{ invalid: true }],
        },
      ]);
      const entries = await activity.list('jest-org');

      expect(imported.imported).toBe(1);
      expect(entries[0]).toMatchObject({
        id: 'activity-clean',
        title: '정상 활동',
      });
      expect(entries[0].detail).toBeUndefined();
      expect(JSON.stringify(entries)).not.toContain('[object Object]');
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  it('generates deterministic analytics report insights and action items', async () => {
    const reports = new SnapsReportGeneratorService(new OfflineOllama() as any);

    const report = await reports.generate({
      title: 'Jest analytics report',
      metrics: [
        {
          platform: 'instagram',
          metricKey: 'impressions',
          metricValue: 1000,
          collectedAt: '2026-05-01T00:00:00.000Z',
        },
        {
          platform: 'instagram',
          metricKey: 'likes',
          metricValue: 50,
          collectedAt: '2026-05-02T00:00:00.000Z',
        },
        {
          platform: 'instagram',
          metricKey: 'comments',
          metricValue: 1,
          collectedAt: '2026-05-02T00:00:00.000Z',
        },
      ],
    });

    expect(report.title).toBe('Jest analytics report');
    expect(report.metrics.instagram.impressions).toBe(1000);
    expect(report.insights.join(' ')).toContain('추정 참여율');
    expect(report.actionItems).toContainEqual(
      expect.stringContaining('질문형 CTA')
    );
    expect(report.charts.length).toBeGreaterThan(0);

    const malformedAiReport = await new SnapsReportGeneratorService(
      new MalformedReportOllama() as any
    ).generate({
      title: 'Malformed AI report',
      metrics: [
        {
          platform: 'threads',
          metricKey: 'likes',
          metricValue: 5,
          collectedAt: '2026-05-05T00:00:00.000Z',
        },
      ],
    });
    expect(typeof malformedAiReport.summary).toBe('string');
    expect(malformedAiReport.summary).toContain('threads');
  });

  it('returns script-ready Pixelle fallback when no Pixelle URL is configured', async () => {
    delete process.env.PIXELLE_VIDEO_URL;
    const shorts = new SnapsShortVideoService(new OfflineOllama() as any);

    const result = await shorts.generate({
      sourceText: '신제품 업데이트 핵심을 쇼츠로 요약합니다.',
      durationSeconds: 30,
      platform: 'youtube',
    });
    const status = await shorts.status('missing-pixelle-job');

    expect(result.status).toBe('script-ready');
    expect(result.script.durationSeconds).toBe(30);
    expect(result.script.storyboard).toHaveLength(4);
    expect(result.script.storyboard[0].pixellePrompt).toContain('Vertical');
    expect(status.status).toBe('not-configured');
  });

  it('keeps custom shorts duration instead of forcing 30/45/60 buckets', async () => {
    delete process.env.PIXELLE_VIDEO_URL;
    const shorts = new SnapsShortVideoService(new OfflineOllama() as any);

    const result = await shorts.generate({
      sourceText: '긴 제품 설명을 75초 쇼츠로 구성합니다.',
      durationSeconds: 75,
      platform: 'instagram',
    });

    expect(result.script.durationSeconds).toBe(75);
    expect(result.script.storyboard).toHaveLength(6);
    expect(result.script.storyboard[result.script.storyboard.length - 1].endSecond).toBe(75);
  });

  it('normalizes malformed shorts LLM script fields without leaking object strings', async () => {
    const shorts = new SnapsShortVideoService(new MalformedShortsOllama() as any);

    const script = await shorts.script({
      sourceText: '잘못된 쇼츠 대본 응답도 UI에서 안전하게 보여야 합니다.',
      platform: 'tiktok',
    });
    const serialized = JSON.stringify(script);

    expect(script.durationSeconds).toBe(60);
    expect(script.coreSummary).toContain('요약 문장');
    expect(script.title).toBe('snaps 쇼츠 초안');
    expect(script.storyboard).toHaveLength(4);
    expect(script.storyboard[1].endSecond).toBe(60);
    expect(script.uploadMetadata.description).toContain('업로드 설명');
    expect(script.uploadMetadata.hashtags).toEqual([
      '#shorts',
      '#snaps',
      '#나쁜태그',
    ]);
    expect(serialized).not.toContain('[object Object]');
  });

  it('previews voiceover captions and timed subtitle exports for shorts', () => {
    const voiceoverCaptions = new SnapsVideoVoiceoverCaptionService();

    const preview = voiceoverCaptions.preview({
      sourceText:
        '첫 1초에 문제를 보여주고, 다음 장면에서 자동화 전후 시간을 비교합니다. 마지막에는 댓글로 체크리스트를 요청하게 만듭니다.',
      durationSeconds: 40,
      platform: 'instagram',
      voiceStyle: 'energetic',
      captionStyle: 'karaoke',
      script: {
        title: '자동화 체크리스트 쇼츠',
        narration:
          '콘텐츠 운영 시간이 계속 늘어나나요? 이 체크리스트 하나로 원문, 카드뉴스, 쇼츠, 답글까지 한 번에 정리할 수 있습니다.',
        storyboard: [
          {
            scene: 1,
            startSecond: 0,
            endSecond: 8,
            visual: '수작업 게시판',
            narration: '콘텐츠 운영 시간이 계속 늘어나나요?',
            overlayText: '수작업 6시간',
          },
          {
            scene: 2,
            startSecond: 8,
            endSecond: 24,
            visual: '자동화 대시보드',
            narration: '원문, 카드뉴스, 쇼츠, 답글까지 한 번에 정리합니다.',
            overlayText: '한 번에 정리',
          },
        ],
      },
    });

    expect(preview.source).toBe('snaps-video-voiceover-captions');
    expect(preview.captions.length).toBeGreaterThanOrEqual(2);
    expect(preview.sceneAlignments.length).toBe(2);
    expect(preview.exports.srt).toContain('-->');
    expect(preview.exports.webVtt).toContain('WEBVTT');
    expect(preview.summary.alignmentScore).toBeGreaterThan(0);
    expect(preview.recommendations.join(' ')).toContain('voiceover');
  });

  it('estimates video credits and disclosure before publishing AI shorts', () => {
    const publishGuard = new SnapsVideoPublishGuardService();

    const preview = publishGuard.preview({
      durationSeconds: 45,
      targetPlatforms: ['instagram', 'youtube', 'tiktok'],
      sceneCount: 4,
      generatedImageCount: 4,
      generatedVideoCount: 0,
      customAssetCount: 2,
      textToImageModel: 'flux-schnell',
      imageToVideoModel: 'none',
      aiVoice: true,
      aiGeneratedVisuals: true,
      realisticPeople: true,
      realisticPlacesEvents: false,
      sourceLanguage: 'Korean',
      captionLanguage: 'Korean',
      targetLanguages: ['Korean', 'English', 'Japanese'],
    });

    expect(preview.source).toBe('snaps-video-publish-guard');
    expect(preview.creditBudget.billableOnlyOnSuccess).toBe(true);
    expect(preview.creditBudget.totalCredits).toBe(4);
    expect(preview.disclosureChecklist).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ platform: 'youtube', labelRequired: true }),
        expect.objectContaining({ platform: 'tiktok', labelRequired: true }),
        expect.objectContaining({ platform: 'instagram', labelRequired: true }),
      ])
    );
    expect(preview.localizationPlan.rows).toHaveLength(3);
    expect(preview.localizationPlan.rows.every((row) => row.supported)).toBe(true);
    expect(preview.publishReadinessScore).toBeGreaterThan(0);
    expect(preview.recommendations.join(' ')).toContain('AI disclosure');
  });

  it('blocks sponsored posts without a clear Korean disclosure up front', () => {
    const guard = new SnapsAdDisclosureGuardService();

    const result = guard.check({
      relationship: 'paid',
      advertiser: '스냅스',
      variants: [
        { platform: 'threads', content: '체험단으로 써본 세럼 후기' },
        { platform: 'x', content: 'Great serum #ad' },
        {
          platform: 'instagram',
          content:
            '요즘 매일 쓰는 세럼 후기입니다. 흡수가 빠르고 끈적임이 없어서 아침 저녁으로 바르고 있어요. 피부결이 정돈되는 느낌이 좋습니다.\n#세럼 #뷰티 #데일리 #스킨케어 #광고',
        },
        { platform: 'naver-blog', title: '[광고] 세럼 후기', content: '오래 써본 후기입니다.' },
      ],
    });

    expect(result.source).toBe('snaps-ad-disclosure-guard');
    expect(result.status).toBe('block');
    const rules = result.cards.map((card) => card.findings.map((item) => item.rule));
    expect(rules[0]).toContain('disclosure-ambiguous');
    expect(rules[1]).toContain('disclosure-english-only');
    expect(rules[2]).toEqual(
      expect.arrayContaining(['disclosure-not-first', 'disclosure-buried-in-hashtags'])
    );
    expect(result.cards[3].status).toBe('pass');
    expect(result.cards[0].fixedContent.startsWith('[광고] 스냅스로부터 대가를 받아')).toBe(true);
    expect(result.cards[1].fixedContent.startsWith('[광고] 스냅스 유료 광고')).toBe(true);
  });

  it('applies messenger ad rules and night-send consent to KakaoTalk', () => {
    const guard = new SnapsAdDisclosureGuardService();

    const night = guard.check({
      relationship: 'own-brand',
      senderName: '스냅스',
      sendAt: '2026-10-06T13:30:00Z',
      variants: [{ platform: 'kakao-talk', content: '오픈 기념 30% 할인 쿠폰을 드립니다.' }],
    });
    expect(night.cards[0].findings.map((item) => item.rule)).toEqual(
      expect.arrayContaining([
        'message-ad-prefix-missing',
        'message-opt-out-missing',
        'message-night-send',
      ])
    );
    expect(night.cards[0].fixedContent).toMatch(/^\(광고\) 스냅스 /);
    expect(night.cards[0].fixedContent).toContain('수신거부');

    const consented = guard.check({
      relationship: 'own-brand',
      senderName: '스냅스',
      sendAt: '2026-10-06T13:30:00Z',
      nightConsent: true,
      variants: [{ platform: 'kakao-talk', content: night.cards[0].fixedContent }],
    });
    expect(consented.status).toBe('pass');
  });

  it('flags undisclosed sponsorship signals and risky claims without blocking', () => {
    const guard = new SnapsAdDisclosureGuardService();

    const result = guard.check({
      content: '할인 코드 SNAPS10 쓰면 당뇨 걱정 끝, 원금 보장 상품도 국내 최초',
      targetPlatforms: ['threads'],
    });
    expect(result.status).toBe('review');
    expect(result.cards[0].findings.map((item) => item.rule)).toEqual(
      expect.arrayContaining(['relationship-signal', 'claim-health', 'claim-finance', 'claim-superlative'])
    );
    expect(() => guard.check({})).toThrow();
  });

  it('keeps post line breaks through approvals, sources, bulk, conditions, recurring, and inbox', async () => {
    const body = '첫 문단입니다.\n\n둘째 문단입니다.\n- 체크 1\n- 체크 2';
    expect(cleanSnapsMultilineText('  a   b \r\n\r\n\r\n c\t', 100)).toBe('a b\n\nc');

    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-multiline-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    try {
      const approval = await new SnapsApprovalWorkflowService().submit('jest-org', {
        title: 'multiline approval',
        variants: [{ platform: 'threads', content: body }],
      } as any);
      expect(approval.variants[0].content).toBe(body);

      const commented = await new SnapsApprovalWorkflowService().addComment('jest-org', approval.id, {
        message: '수정 요청\n1. CTA 문구\n2. 해시태그',
      } as any);
      expect(commented.comment.message).toBe('수정 요청\n1. CTA 문구\n2. 해시태그');
      const idea = await new SnapsContentIdeaService().save('jest-org', {
        title: '아이디어',
        body: '훅: 질문형\n본문: 사례 3개',
      } as any);
      expect(idea.body).toBe('훅: 질문형\n본문: 사례 3개');

      const source = await new SnapsSourceLibraryService().saveSource('jest-org', {
        title: 'multiline source',
        sourceText: body,
      });
      expect(source.sourceText).toBe(body);

      const inbox = new SnapsFeedbackInboxService(new OfflineOllama() as any);
      // A legacy item stored before line breaks were preserved dedupes against the re-import.
      await inbox.importItems('jest-org', {
        items: [{ platform: 'threads', author: 'kim', content: '질문 있어요 가격이 궁금해요' }],
      } as any);
      await inbox.importItems('jest-org', {
        items: [{ platform: 'threads', author: 'kim', content: '질문 있어요\n가격이 궁금해요' }],
      } as any);
      const items = await inbox.listItems('jest-org');
      expect(items).toHaveLength(1);
      expect(items[0].content).toContain('\n');
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }

    const bulk = new SnapsBulkCampaignService().preview({
      csvText: `title,caption,platforms\nRow,"${body}",threads`,
    });
    expect(bulk.rows[0].sourceText).toBe(body);

    const condition = new SnapsPostConditionService().preview({
      followUpText: body,
      conditionType: 'comments',
      threshold: 1,
      metrics: { comments: 3 },
      targetPlatforms: ['threads'],
    });
    expect(condition.item.sourceText).toContain(body);

    const recurring = new SnapsRecurringPostService();
    const recurringPreview = recurring.preview({
      sourceText: body,
      occurrences: 1,
      targetPlatforms: ['threads'],
    });
    expect(recurring.toVariants(recurringPreview.items[0])[0].content).toContain('둘째 문단입니다.\n- 체크 1');
  });

  it('schedules posting slots in the workspace timezone even when the server runs in UTC', () => {
    // Preflight reruns this test with TZ=UTC, the timezone the Docker app container uses.
    const kst = (iso?: string) =>
      new Date(String(iso)).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
    {
      expect(
        snapsZonedTimeToDate(
          { year: 2026, month: 6, day: 1, hour: 9, minute: 0 },
          'Asia/Seoul'
        ).toISOString()
      ).toBe('2026-06-01T00:00:00.000Z');
      expect(
        nextSnapsZonedOccurrence(new Date('2026-06-01T09:30:00+09:00'), 1, '09:00', 'Asia/Seoul').toISOString()
      ).toBe('2026-06-08T00:00:00.000Z');

      const repurpose = new SnapsRepurposeQueueService().preview({
        sourceText: 'youtube|2030-01-06T11:00:00+09:00|https://example.com/a|title|본문 텍스트입니다',
        scheduleSlots: 'Authority|monday|09:00|10:00',
        now: '2026-06-01T09:30:00+09:00',
      });
      expect(kst(repurpose.scheduleSlots[0].nextOccurrenceAt)).toBe('2026-06-08 09:00:00');

      const recurring = new SnapsRecurringPostService().preview({
        sourceText: '반복 게시 원문입니다.',
        occurrences: 2,
        startDate: '2026-06-02',
        localTime: '10:00',
        targetPlatforms: ['threads'],
      } as any);
      const recurringTimes = recurring.items.map((item: any) => kst(item.publishDate));
      expect(recurringTimes[0]).toBe('2026-06-02 10:00:00');
      expect(recurringTimes.every((time: string) => time.endsWith(' 10:00:00'))).toBe(true);
      expect((recurring.items[0] as any).localTime).toBe('10:00');

      const calendar = new SnapsContentCalendarService().preview({
        sourceText: '캘린더 원문입니다.',
        startDate: '2026-06-01',
        days: 3,
        cadence: 'daily',
        targetPlatforms: ['threads'],
      } as any);
      expect(kst(calendar.items[0].publishDate)).toBe('2026-06-01 09:30:00');

      const category = new SnapsContentCategoryService().preview({
        sourceText: '카테고리 원문입니다.',
        startDate: '2026-06-01',
        targetPlatforms: ['threads'],
      } as any);
      expect(kst(category.items[0].publishDate)).toBe('2026-06-01 09:00:00');
    }
  });

  it('measures and splits X posts with X weighted counting for Korean text', () => {
    const korean = '한국어 문장으로 작성한 긴 게시물입니다. '.repeat(20).trim();

    const preview = new SnapsPostPreviewService().preview({
      variants: [{ platform: 'x', content: korean.slice(0, 250) }],
    });
    expect(preview.cards[0].characterCount).toBe(weightedLength(korean.slice(0, 250)));
    expect(preview.cards[0].hardLimitExceeded).toBe(true);

    const recurring = new SnapsRecurringPostService();
    const recurringPreview = recurring.preview({
      sourceText: korean,
      occurrences: 1,
      targetPlatforms: ['x'],
    } as any);
    expect(weightedLength(recurring.toVariants(recurringPreview.items[0])[0].content)).toBeLessThanOrEqual(280);

    const built = buildSnapsPublishingPayload({
      variants: [
        {
          platform: 'x',
          label: 'X',
          content: korean,
          hashtags: [],
          settings: { __type: 'x' },
          publishMode: 'schedule',
        } as any,
      ],
      integrations: [{ platform: 'x', integrationId: 'x-integration' }] as any,
      scheduleType: 'draft',
    });
    const parts = built.payload!.posts[0].value.map((value) => value.content);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => weightedLength(part) <= 280)).toBe(true);
    expect(parts.join(' ').replace(/\s+/g, ' ')).toBe(korean.replace(/\s+/g, ' '));
    expect(built.warnings.join(' ')).toContain('weighted');

    // 200 characters passes a plain .length check but is ~350 by X counting.
    const underPlainLimit = korean.slice(0, 200).trim();
    expect(underPlainLimit.length).toBeLessThanOrEqual(280);
    expect(weightedLength(underPlainLimit)).toBeGreaterThan(280);
    const builtUnderPlain = buildSnapsPublishingPayload({
      variants: [
        { platform: 'x', label: 'X', content: underPlainLimit, hashtags: [], settings: { __type: 'x' }, publishMode: 'schedule' } as any,
      ],
      integrations: [{ platform: 'x', integrationId: 'x-integration' }] as any,
      scheduleType: 'draft',
    });
    expect(builtUnderPlain.payload!.posts[0].value.length).toBeGreaterThan(1);

    const shortX = buildSnapsPublishingPayload({
      variants: [
        { platform: 'x', label: 'X', content: '짧은 한국어 글', hashtags: [], settings: { __type: 'x' }, publishMode: 'schedule' } as any,
      ],
      integrations: [{ platform: 'x', integrationId: 'x-integration' }] as any,
      scheduleType: 'draft',
    });
    expect(shortX.payload!.posts[0].value).toHaveLength(1);
    expect(shortX.warnings).toHaveLength(0);
  });

  it('publishes Studio hashtags that the caption does not already carry', () => {
    const build = (variant: Record<string, unknown>, platform = 'instagram') =>
      buildSnapsPublishingPayload({
        variants: [
          {
            platform,
            label: platform,
            hashtags: [],
            settings: { __type: platform },
            publishMode: 'schedule',
            ...variant,
          } as any,
        ],
        integrations: [{ platform, integrationId: `${platform}-integration` }] as any,
        scheduleType: 'draft',
      }).payload!.posts[0].value[0].content;

    expect(build({ content: '오늘의 운영 팁', hashtags: ['#운영', '마케팅'] })).toBe(
      '오늘의 운영 팁\n\n#운영 #마케팅'
    );
    expect(build({ content: '오늘의 운영 팁\n\n#운영', hashtags: ['#운영', '#마케팅'] })).toBe(
      '오늘의 운영 팁\n\n#운영\n\n#마케팅'
    );
    expect(
      build({
        content: '첫 댓글에 태그를 둡니다',
        hashtags: ['#운영'],
        settings: { __type: 'instagram', hashtagPlacement: 'first-comment', firstComment: '#운영' },
      })
    ).toBe('첫 댓글에 태그를 둡니다');
    // Placement alone keeps tags out of the caption, even before the first comment is filled.
    expect(
      build({
        content: '첫 댓글 배치',
        hashtags: ['#운영'],
        settings: { __type: 'instagram', hashtagPlacement: 'first-comment' },
      })
    ).toBe('첫 댓글 배치');
    expect(build({ content: '카카오 안내', hashtags: ['#운영'] }, 'kakao-talk')).toBe('카카오 안내');
    expect(build({ content: 'Threads 글', hashtags: ['#하나', '#둘'] }, 'threads')).toBe(
      'Threads 글\n\n#하나'
    );
  });

  it('keeps every concurrent write to the per-organization JSON stores', async () => {
    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-concurrency-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    try {
      const library = new SnapsSourceLibraryService();
      const saved = await Promise.allSettled(
        Array.from({ length: 20 }, (_value, index) =>
          library.saveSource('race-org', {
            title: `source ${index}`,
            sourceText: `동시 저장 테스트 원문 ${index}`,
          })
        )
      );
      expect(saved.filter((result) => result.status === 'rejected')).toHaveLength(0);
      expect(await library.listSources('race-org')).toHaveLength(20);

      const approvals = new SnapsApprovalWorkflowService();
      const approval = await approvals.submit('race-org', {
        title: 'concurrent comments',
        variants: [{ platform: 'threads', content: '승인 본문입니다' }],
      } as any);
      await Promise.all(
        ['kim', 'lee', 'park', 'choi', 'jung'].map((author) =>
          approvals.addComment('race-org', approval.id, { message: `${author} 의견`, author } as any)
        )
      );
      expect((await approvals.get('race-org', approval.id))?.comments).toHaveLength(5);

      const sales = new SnapsLinkAttributionService();
      const campaign = await sales.saveCampaign('race-org', {
        title: 'concurrent clicks',
        destinationUrl: 'https://example.com/pilot',
        platform: 'instagram',
      } as any);
      await Promise.all(
        Array.from({ length: 10 }, () =>
          sales.recordEvent('race-org', { campaignId: campaign.id, eventType: 'click' } as any)
        )
      );
      const events = await sales.listEvents('race-org');
      expect(events.filter((event: any) => event.campaignId === campaign.id)).toHaveLength(10);
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }

    // A failing task releases the queue, and nested calls on the same key do not deadlock.
    await expect(
      runSnapsSerialized('jest:key', async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    await expect(
      runSnapsSerialized('jest:key', () => runSnapsSerialized('jest:key', async () => 'nested'))
    ).resolves.toBe('nested');
  });

  it('issues unguessable public review tokens that expire, rotate, and can be revoked', async () => {
    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-public-link-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    const realNow = Date.now;
    try {
      const approvals = new SnapsApprovalWorkflowService();
      const approval = await approvals.submit('link-org', {
        title: 'public link',
        variants: [{ platform: 'threads', content: '승인 본문입니다' }],
      } as any);

      const first = await approvals.createPublicReviewLink('link-org', approval.id, { expiresInDays: 7 });
      expect(first.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
      const reshared = await approvals.createPublicReviewLink('link-org', approval.id, {});
      expect(reshared.token).toBe(first.token);
      const rotated = await approvals.createPublicReviewLink('link-org', approval.id, { rotate: true });
      expect(rotated.token).not.toBe(first.token);
      await expect(approvals.publicReview('link-org', first.token)).rejects.toThrow();
      await expect(approvals.publicReview('link-org', rotated.token)).resolves.toBeTruthy();

      const later = realNow() + 8 * 24 * 60 * 60 * 1000;
      Date.now = () => later;
      await expect(approvals.publicReview('link-org', rotated.token)).rejects.toThrow();
      const renewed = await approvals.createPublicReviewLink('link-org', approval.id, {});
      expect(renewed.token).not.toBe(rotated.token);
      Date.now = realNow;

      const revoked = await approvals.revokePublicReviewLink('link-org', approval.id);
      expect(revoked.revoked).toBe(true);
      expect(revoked.approval.publicReviewEnabled).toBe(false);
      expect(revoked.approval.history[0].action).toBe('public-review-revoked');
      await expect(approvals.publicReview('link-org', renewed.token)).rejects.toThrow();
      await expect(
        approvals.addPublicReviewComment('link-org', renewed.token, { message: '폐기 후 댓글' } as any)
      ).rejects.toThrow();
      expect((await approvals.revokePublicReviewLink('link-org', approval.id)).revoked).toBe(false);
    } finally {
      Date.now = realNow;
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  it('keeps purchases and click totals when public clicks overflow the event log', async () => {
    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-sales-retention-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    try {
      const sales = new SnapsLinkAttributionService();
      const campaign = await sales.saveCampaign('sales-org', {
        title: 'retention',
        destinationUrl: 'https://example.com/pilot',
        archivedClicks: 999,
      } as any);
      expect(campaign.archivedClicks).toBeUndefined();

      await sales.recordEvent('sales-org', {
        campaignId: campaign.id,
        eventType: 'purchase',
        amount: 50000,
        currency: 'KRW',
        occurredAt: '2026-06-01T00:00:00.000Z',
      } as any);
      await sales.importEvents(
        'sales-org',
        Array.from({ length: 2005 }, (_value, index) => ({
          id: `bulk-click-${index}`,
          campaignId: campaign.id,
          eventType: 'click',
          occurredAt: new Date(Date.UTC(2026, 5, 2, 0, 0, index)).toISOString(),
        }))
      );
      for (let index = 0; index < 3; index += 1) {
        await sales.recordPublicClick(campaign.slug, 'sales-org');
      }

      const summary = await sales.summary('sales-org');
      expect(summary.purchases).toBe(1);
      expect(summary.revenue).toBe(50000);
      expect(summary.clicks).toBe(2008);
      expect(summary.campaignSummaries[0].clicks).toBe(2008);
      const stored = await sales.listEvents('sales-org');
      expect(stored.filter((event) => event.eventType === 'click').length).toBeLessThanOrEqual(2000);
      expect(stored.some((event) => event.eventType === 'purchase')).toBe(true);
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  it('keeps internal notes and decisions when public reviewers flood an approval', async () => {
    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-approval-retention-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    try {
      const approvals = new SnapsApprovalWorkflowService();
      const approval = await approvals.submit('flood-org', {
        title: 'flood',
        variants: [{ platform: 'threads', content: '승인 본문입니다' }],
      } as any);
      await approvals.addComment('flood-org', approval.id, {
        message: '내부 메모: 법무 확인 필요',
        visibility: 'internal',
      } as any);
      await approvals.review('flood-org', approval.id, { decision: 'approve', reviewer: 'lead' } as any);
      const link = await approvals.createPublicReviewLink('flood-org', approval.id, {});

      for (let index = 0; index < 100; index += 1) {
        await approvals.addPublicReviewComment('flood-org', link.token, { message: `외부 의견 ${index}` } as any);
      }
      await expect(
        approvals.addPublicReviewComment('flood-org', link.token, { message: '101번째' } as any)
      ).rejects.toThrow('comment limit');

      const stored = (await approvals.get('flood-org', approval.id))!;
      expect(stored.comments.filter((comment) => comment.visibility === 'reviewer')).toHaveLength(100);
      expect(stored.comments.some((comment) => comment.message.includes('법무 확인'))).toBe(true);
      expect(stored.history.length).toBeLessThanOrEqual(50);
      expect(stored.history.some((entry) => entry.action === 'approve')).toBe(true);
      expect(stored.history.some((entry) => entry.action === 'submitted')).toBe(true);
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  it('counts real visitors once and ignores link-preview bots on public sales links', async () => {
    const bots = [
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'kakaotalk-scrap/1.0; +https://devtalk.kakao.com/',
      'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
      'Twitterbot/1.0',
      'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
      'Mozilla/5.0 (compatible; Yeti/1.1; +http://naver.me/spd)',
      'Mozilla/5.0 (compatible; Daumoa/4.0)',
    ];
    const humans = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.4.5',
      'Mozilla/5.0 (Linux; Android 13; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 DaumApps/6.0',
      'Mozilla/5.0 (Linux; Android 12; Cubot X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0',
    ];
    expect(bots.filter((ua) => !isSnapsPreviewBot(ua))).toEqual([]);
    expect(humans.filter((ua) => isSnapsPreviewBot(ua))).toEqual([]);

    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-click-quality-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    try {
      const sales = new SnapsLinkAttributionService();
      const campaign = await sales.saveCampaign('click-org', {
        title: 'click quality',
        destinationUrl: 'https://example.com/pilot',
      } as any);
      const click = (ip: string, userAgent: string) =>
        sales.recordPublicClick(campaign.slug, 'click-org', { ip, userAgent });

      const preview = await click('203.0.113.9', bots[1]);
      expect(preview).toMatchObject({ counted: false, skippedReason: 'bot' });
      expect(preview.redirectUrl).toContain('example.com');

      const first = await click('198.51.100.7', humans[0]);
      const repeat = await click('198.51.100.7', humans[0]);
      const other = await click('198.51.100.8', humans[0]);
      expect(first.counted).toBe(true);
      expect(repeat).toMatchObject({ counted: false, skippedReason: 'duplicate', eventId: first.eventId });
      expect(other.counted).toBe(true);

      expect((await sales.summary('click-org')).clicks).toBe(2);
      const stored = JSON.stringify(await sales.listEvents('click-org'));
      expect(stored).not.toContain('198.51.100.7');
      expect(stored).toContain('visitorHash');

      // Events stored before hashing carried the raw IP; normalizing drops it.
      await sales.importEvents('click-org', [
        {
          id: 'legacy-click',
          campaignId: campaign.id,
          eventType: 'click',
          occurredAt: '2026-01-01T00:00:00.000Z',
          metadata: { ip: '192.0.2.44', userAgent: humans[1] },
        },
      ]);
      const legacy = (await sales.listEvents('click-org')).find((event) => event.id === 'legacy-click');
      expect(legacy?.metadata).toEqual({ userAgent: humans[1] });
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  it('refuses to schedule a past publishDate that would publish immediately', () => {
    const build = (publishDate: string, scheduleType: 'draft' | 'schedule' = 'schedule') =>
      buildSnapsPublishingPayload({
        variants: [
          { platform: 'instagram', label: 'Instagram', content: '게시물', hashtags: [], settings: { __type: 'instagram' }, publishMode: 'schedule' } as any,
        ],
        integrations: [{ platform: 'instagram', integrationId: 'instagram-id' }] as any,
        publishDate,
        scheduleType,
      });

    const past = build(new Date(Date.now() - 60 * 60 * 1000).toISOString());
    expect(past.payload).toBeUndefined();
    expect(past.warnings.join(' ')).toContain('in the past');

    expect(build(new Date(Date.now() - 60 * 1000).toISOString()).payload?.type).toBe('schedule');
    expect(build(new Date(Date.now() + 60 * 60 * 1000).toISOString()).payload?.type).toBe('schedule');
    expect(build(new Date(Date.now() - 60 * 60 * 1000).toISOString(), 'draft').payload?.type).toBe('draft');
  });

  it('reads agent schedule phrases in the workspace timezone when the caller sends no offset', async () => {
    process.env.SNAPS_ALLOW_RULE_FALLBACK = 'true';
    const transformer = new SnapsContentTransformService(
      new OfflineOllama() as any,
      emptyRag as any
    );
    const planner = new SnapsCommandPlannerService(
      new OfflineOllama() as any,
      transformer,
      new SnapsShortVideoService(new OfflineOllama() as any)
    );
    const prepared = await planner.prepare('jest-org', {
      command: '내일 오전 9시에 인공지능 관련 게시글을 스레드에 올려줘.',
      useRag: false,
      now: '2026-05-12T00:00:00.000Z',
    });
    // 2026-05-12 09:00 KST -> tomorrow 09:00 KST is 2026-05-13T00:00Z.
    expect(prepared.plan.publishDate).toBe('2026-05-13T00:00:00.000Z');
    expect(prepared.plan.publishDateLocal).toContain('2026-05-13T09:00');
    expect(snapsTimezoneOffsetMinutes(new Date('2026-05-12T00:00:00Z'), 'Asia/Seoul')).toBe(-540);
  });

  it('keeps public review tokens out of workspace backups and restores', async () => {
    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-backup-token-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    try {
      const approvals = new SnapsApprovalWorkflowService();
      const approval = await approvals.submit('backup-org', {
        title: 'backup',
        variants: [{ platform: 'threads', content: '승인 본문입니다' }],
      } as any);
      const link = await approvals.createPublicReviewLink('backup-org', approval.id, {});

      const exported = await approvals.exportApprovals('backup-org');
      expect(JSON.stringify(exported)).not.toContain(link.token);
      expect(exported[0].publicReviewEnabled).toBe(false);

      // An old backup taken while the link was live, restored after revoking it.
      const oldBackup = await approvals.list('backup-org');
      await approvals.revokePublicReviewLink('backup-org', approval.id);
      await approvals.importApprovals('backup-org', oldBackup);
      await expect(approvals.publicReview('backup-org', link.token)).rejects.toThrow();

      // Re-importing a sanitized export keeps the link that is live right now.
      const live = await approvals.createPublicReviewLink('backup-org', approval.id, {});
      await approvals.importApprovals('backup-org', await approvals.exportApprovals('backup-org'));
      await expect(approvals.publicReview('backup-org', live.token)).resolves.toBeTruthy();

      // A token planted in an imported file for a new item is ignored.
      await approvals.importApprovals('backup-org', [
        { ...oldBackup[0], id: 'planted', publicReviewToken: 'planted-token', publicReviewEnabled: true },
      ]);
      await expect(approvals.publicReview('backup-org', 'planted-token')).rejects.toThrow();
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  it('prevents one organization from taking over another organization\'s public links', async () => {
    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-slug-isolation-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    const victimOrg = '1c993dfe-2c3e-41ac-9c31-beeac7bce436';
    const otherOrg = '26f55b07-9274-46e8-9283-443f8549f743';
    try {
      const sales = new SnapsLinkAttributionService();
      await sales.saveCampaign(victimOrg, {
        title: 'pilot',
        slug: 'pilot',
        destinationUrl: 'https://victim.example.com/pilot',
      } as any);
      await new Promise((resolve) => setTimeout(resolve, 5));
      await sales.saveCampaign(otherOrg, {
        title: 'pilot',
        slug: 'pilot',
        destinationUrl: 'https://attacker.example.com/pilot',
      } as any);

      // Legacy slug-only link keeps pointing at the first claimant.
      const legacy = await sales.recordPublicClick('pilot', undefined, { userAgent: 'Mozilla/5.0' });
      expect(legacy.redirectUrl).toContain('victim.example.com');

      // A slug that impersonates the victim's organization id cannot shadow its hub.
      const impostor = await sales.saveCampaign(otherOrg, {
        title: 'impostor',
        slug: victimOrg,
        destinationUrl: 'https://attacker.example.com/hub',
      } as any);
      expect(impostor.slug).toBe(`link-${victimOrg}`);
      const hub = await sales.publicEntry(victimOrg);
      expect(hub.source).toBe('snaps-public-sales-hub');
      expect(JSON.stringify(hub)).not.toContain('attacker.example.com');
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  it('double-encodes Naver Cafe subject and content the way the cafe API decodes them', async () => {
    const provider = new NaverCafeProvider();
    let body = '';
    (provider as any).fetch = async (_url: string, init: RequestInit) => {
      body = String(init.body);
      return new Response(
        JSON.stringify({ message: { result: { articleId: 7, articleUrl: 'https://cafe.naver.com/x/7' } } }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    };
    await provider.post(
      'id',
      'token',
      [
        {
          id: 'post-1',
          message: '30% 할인 + 무료 배송\n문의는 댓글로',
          settings: { clubId: 'club', menuId: 'menu', subject: '10월 이벤트 + 30% 할인' },
        } as any,
      ],
      {} as any
    );
    const form = new URLSearchParams(body);
    // The API decodes form encoding, then URL-decodes once more.
    expect(decodeURIComponent(form.get('subject') || '')).toBe('10월 이벤트 + 30% 할인');
    expect(decodeURIComponent(form.get('content') || '')).toContain('30% 할인 + 무료 배송');
    expect(decodeURIComponent(form.get('content') || '')).toBe('30% 할인 + 무료 배송<br>문의는 댓글로');
  });

  it('refuses source and feed URLs that point into the server network', async () => {
    const resolver = new SnapsSourceResolverService();
    const feeds = new SnapsFeedIntakeService();
    const originalFetch = globalThis.fetch;
    const requested: string[] = [];
    try {
      globalThis.fetch = (async (url: string | URL) => {
        requested.push(String(url));
        if (String(url).startsWith('https://public.example.com/redirect')) {
          return new Response('', { status: 302, headers: { location: 'http://10.0.0.5/admin' } });
        }
        return new Response('<html><head><title>공개 글</title></head><body><p>공개 본문입니다.</p></body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }) as typeof fetch;

      for (const url of [
        'http://127.0.0.1:5432/',
        'http://localhost:11434/api/tags',
        'http://169.254.169.254/latest/meta-data/',
        'http://[::1]:7233/',
        'http://192.168.0.10/',
      ]) {
        await expect(resolver.preview({ url } as any)).rejects.toThrow('not allowed');
        await expect(feeds.preview({ feedUrl: url } as any)).rejects.toThrow('not allowed');
      }
      expect(requested).toEqual([]);

      await expect(
        resolver.preview({ url: 'https://public.example.com/redirect' } as any)
      ).rejects.toThrow('not allowed');
      expect(requested).toEqual(['https://public.example.com/redirect']);

      const ok = await resolver.preview({ url: 'https://public.example.com/post' } as any);
      expect(ok.title).toBe('공개 글');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('refuses media paths that would read server files or fetch internal hosts', () => {
    const originalFrontend = process.env.FRONTEND_URL;
    const originalPixelle = process.env.PIXELLE_VIDEO_URL;
    process.env.FRONTEND_URL = 'http://localhost:4200';
    process.env.PIXELLE_VIDEO_URL = 'http://snaps-pixelle-video:8000';
    try {
      for (const bad of [
        '/../../.env',
        '..\\..\\windows\\win.ini',
        'file:///etc/passwd',
        'C:\\Windows\\win.ini',
        'http://169.254.169.254/latest/meta-data/iam.png',
        'http://127.0.0.1:6379/x.png',
        'http://redis:6379/x.png',
        'http://localhost:11434/x.png',
        'http://[::1]/x.png',
      ]) {
        expect(unsafeSnapsMediaReason(bad)).toBeTruthy();
      }
      for (const good of [
        'https://cdn.example.com/media/a.png',
        '/2026/10/upload.png',
        'http://localhost:4200/uploads/2026/10/a.png',
        'http://snaps-pixelle-video:8000/api/files/short.mp4',
      ]) {
        expect(unsafeSnapsMediaReason(good)).toBeUndefined();
      }

      const built = buildSnapsPublishingPayload({
        variants: [
          { platform: 'x', label: 'X', content: '이미지 게시물', hashtags: [], settings: { __type: 'x' }, publishMode: 'schedule', media: [{ id: 'm1', path: '/../../.env' }] } as any,
          { platform: 'threads', label: 'Threads', content: '정상 게시물', hashtags: [], settings: { __type: 'threads' }, publishMode: 'schedule', media: [{ id: 'm2', path: 'https://cdn.example.com/a.png' }] } as any,
        ],
        integrations: [
          { platform: 'x', integrationId: 'x-id' },
          { platform: 'threads', integrationId: 'threads-id' },
        ] as any,
        scheduleType: 'draft',
      });
      expect(built.payload!.posts.map((post) => post.integration.id)).toEqual(['threads-id']);
      expect(built.warnings.join(' ')).toContain('cannot leave the upload directory');
    } finally {
      process.env.FRONTEND_URL = originalFrontend;
      if (originalPixelle === undefined) {
        delete process.env.PIXELLE_VIDEO_URL;
      } else {
        process.env.PIXELLE_VIDEO_URL = originalPixelle;
      }
    }
  });

  it('tells Studio how many posts were really created and why none were', () => {
    const nothing = describeSnapsScheduleResult('반복 게시 큐', {
      items: [
        { scheduled: [], warnings: ['publishDate 2026-01-01T00:00:00.000Z is in the past; snaps will not publish it immediately.'] },
        { scheduled: [], warnings: [] },
      ],
    });
    expect(nothing.ok).toBe(false);
    expect(nothing.tone).toBe('warning');
    expect(nothing.message).toContain('만들어진 게시물이 없습니다');
    expect(nothing.message).toContain('in the past');

    const partial = describeSnapsScheduleResult('CSV 큐', {
      rows: [
        { scheduled: [{ id: 'a' }, { id: 'b' }], warnings: [] },
        { scheduled: [], warnings: ['X: media URL points at an internal host, so this variant was skipped.'] },
      ],
    });
    expect(partial).toMatchObject({ ok: true, tone: 'warning', summary: { created: 2 } });
    expect(partial.message).toContain('2개 생성');

    const approval = describeSnapsScheduleResult('승인 요청 예약', {
      approval: { id: 'x' },
      scheduled: { scheduled: [{ id: 'p' }], warnings: [] },
    });
    expect(approval).toMatchObject({ ok: true, tone: undefined, summary: { created: 1 } });

    const duplicate = describeSnapsScheduleResult('snaps 예약', {
      scheduled: [{ id: 'p' }],
      duplicate: true,
      warnings: ['The same posts were already created for these channels and time a moment ago, so they were not created again.'],
    });
    expect(duplicate.ok).toBe(true);
    expect(duplicate.message).toContain('중복 생성하지 않았습니다');
  });

  it('keeps multi-line repurpose sources as separate queue items', () => {
    const repurposeQueue = new SnapsRepurposeQueueService();

    const preview = repurposeQueue.preview({
      sourceText: repurposeQueue.sampleSource,
      contentFilter: 'all-content',
      scheduleSlots: 'Authority|monday|09:00|10:00\nCommunity|wednesday|15:00|16:00',
      now: '2026-06-01T09:00:00+09:00',
    });

    expect(preview.totalItems).toBe(3);
    expect(preview.scheduleSlots).toHaveLength(2);
  });

  it('previews source repurpose queues with posting-plan slots', () => {
    const repurposeQueue = new SnapsRepurposeQueueService();

    const preview = repurposeQueue.preview({
      sourceText: repurposeQueue.sampleSource,
      workflowMode: 'schedule',
      contentFilter: 'all-content',
      targetPlatforms: ['threads', 'linkedin'],
      scheduleSlots:
        'Authority|monday|09:00|10:00\nCommunity|wednesday|15:00|16:00',
      now: '2026-06-01T09:00:00+09:00',
      activatedAt: '2026-06-01T09:00:00+09:00',
    });

    expect(preview.source).toBe('snaps-repurpose-queue');
    expect(preview.acceptedItems).toBeGreaterThanOrEqual(3);
    expect(preview.scheduleSlots).toHaveLength(2);
    expect(preview.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contentScope: 'future',
          action: 'fill-next-plan-slot',
        }),
        expect.objectContaining({
          contentScope: 'existing',
          status: 'queued',
        }),
      ])
    );
    expect(preview.recommendations.join(' ')).toContain('Check Now');

    const sourceInputs = repurposeQueue.toSourceInputs(preview.items);
    const variants = repurposeQueue.toVariants(preview.items[0]);
    expect(sourceInputs[0].sourcePlatform).toBe('repurpose-queue');
    expect(variants.map((variant) => variant.platform)).toEqual(
      expect.arrayContaining(['threads', 'linkedin'])
    );
    expect(variants[0].settings?.source).toBe('snaps-repurpose-queue');
  });

  it('normalizes Naver Cafe OAuth, refresh, post payload, and token errors', async () => {
    const provider = new NaverCafeProvider();
    const originalFetch = globalThis.fetch;
    const originalEnv = {
      FRONTEND_URL: process.env.FRONTEND_URL,
      NAVER_CLIENT_ID: process.env.NAVER_CLIENT_ID,
      NAVER_CLIENT_SECRET: process.env.NAVER_CLIENT_SECRET,
    };
    const seen = {
      tokenBodies: [] as string[],
      postUrl: '',
      postBody: '',
    };

    try {
      process.env.FRONTEND_URL = 'https://snaps.example.test';
      process.env.NAVER_CLIENT_ID = 'naver-client';
      process.env.NAVER_CLIENT_SECRET = 'naver-secret';
      globalThis.fetch = (async (url: string | URL, options?: RequestInit) => {
        const requestUrl = String(url);
        if (requestUrl.includes('/oauth2.0/token')) {
          seen.tokenBodies.push(String(options?.body || ''));
          return new Response(
            JSON.stringify({
              access_token: 'naver-access',
              expires_in: 3600,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (requestUrl.includes('/v1/nid/me')) {
          return new Response(
            JSON.stringify({
              response: {
                id: 'naver-user',
                nickname: 'snaps User',
                email: 'snaps@example.test',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (requestUrl.includes('/v1/cafe/')) {
          seen.postUrl = requestUrl;
          seen.postBody = String(options?.body || '');
          return new Response(
            JSON.stringify({
              message: {
                result: {
                  articleId: 123,
                  articleUrl: 'https://cafe.naver.com/snaps/123',
                  msg: 'ok',
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response(JSON.stringify({ error: 'unexpected path' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof fetch;

      const authUrl = await provider.generateAuthUrl();
      const authenticated = await provider.authenticate({
        code: 'auth-code',
        codeVerifier: authUrl.state,
      });
      const refreshed = await provider.refreshToken('refresh-fallback');
      const posted = await provider.post(
        'internal-id',
        'naver-access',
        [
          {
            id: 'post-1',
            message: '<p><strong>snaps</strong> Naver Cafe smoke</p>',
            settings: {
              clubId: 'snap cafe',
              menuId: 'board 1',
              subject: 'Smoke subject',
              category: 'notice',
            },
            media: [],
          },
        ],
        {} as any
      );
      const refreshError = provider.handleErrors(
        JSON.stringify({ error: 'invalid_token', message: 'expired' }),
        401
      );

      globalThis.fetch = (async () =>
        new Response('<html><body>Naver auth gateway failed</body></html>', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/html' },
        })) as typeof fetch;
      const failedAuth = await provider.authenticate({
        code: 'auth-code',
        codeVerifier: authUrl.state,
      });
      let failedRefresh = '';
      try {
        await provider.refreshToken('refresh-fallback');
      } catch (error) {
        failedRefresh = error instanceof Error ? error.message : String(error);
      }

      expect(authUrl.url).toContain('client_id=naver-client');
      expect(authUrl.url).toContain('scope=profile%2Ccafe');
      expect(authUrl.codeVerifier).toBe(authUrl.state);
      expect(authenticated).toMatchObject({
        id: 'naver-user',
        accessToken: 'naver-access',
        username: 'snaps@example.test',
      });
      expect(refreshed).toMatchObject({
        refreshToken: 'refresh-fallback',
      });
      expect(seen.tokenBodies.join('\n')).toContain('client_secret=naver-secret');
      expect(seen.postUrl).toContain('/snap%20cafe/menu/board%201/articles');
      expect(decodeURIComponent(new URLSearchParams(seen.postBody).get('subject') || '')).toBe('Smoke subject');
      expect(seen.postBody).toContain('category=notice');
      expect(posted[0]).toMatchObject({
        postId: '123',
        releaseURL: 'https://cafe.naver.com/snaps/123',
        status: 'ok',
      });
      expect(refreshError?.type).toBe('refresh-token');
      expect(failedAuth).toContain('503 Service Unavailable');
      expect(String(failedAuth)).not.toContain('<html>');
      expect(failedRefresh).toContain('503 Service Unavailable');
      expect(failedRefresh).not.toContain('<html>');
    } finally {
      globalThis.fetch = originalFetch;
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      });
    }
  });

  it('parses Ollama health, fenced JSON, prefixed JSON, embeds, and thinking-only failures', async () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = {
      OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
      OLLAMA_CHAT_MODEL: process.env.OLLAMA_CHAT_MODEL,
      OLLAMA_EMBED_MODEL: process.env.OLLAMA_EMBED_MODEL,
      OLLAMA_DISABLE_THINKING: process.env.OLLAMA_DISABLE_THINKING,
      OLLAMA_NUM_PREDICT: process.env.OLLAMA_NUM_PREDICT,
    };
    const chatBodies: string[] = [];
    let chatCount = 0;

    try {
      process.env.OLLAMA_BASE_URL = 'https://ollama.example.test';
      process.env.OLLAMA_CHAT_MODEL = 'qwen-jest';
      process.env.OLLAMA_EMBED_MODEL = 'nomic-jest';
      process.env.OLLAMA_DISABLE_THINKING = 'true';
      process.env.OLLAMA_NUM_PREDICT = '8192';
      globalThis.fetch = (async (url: string | URL, options?: RequestInit) => {
        const requestUrl = String(url);
        if (requestUrl.endsWith('/api/tags')) {
          return new Response(
            JSON.stringify({
              models: [{ name: 'qwen-jest' }, { model: 'nomic-jest' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (requestUrl.endsWith('/api/chat')) {
          chatBodies.push(String(options?.body || ''));
          chatCount += 1;
          if (chatCount === 1) {
            return new Response(
              JSON.stringify({
                message: { content: '```json\n{"ok":true,"mode":"fenced"}\n```' },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          if (chatCount === 2) {
            return new Response(
              JSON.stringify({
                message: { content: 'final answer:\n{"ok":true,"mode":"prefixed"}' },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return new Response(
            JSON.stringify({
              message: { content: '', thinking: 'hidden thinking only' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (requestUrl.endsWith('/api/embed')) {
          return new Response(
            JSON.stringify({ embeddings: [[0.1, 'bad', 0.2], [], 'bad-row'] }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        return new Response(JSON.stringify({ error: 'unexpected path' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof fetch;

      const client = new OllamaClient();
      const health = await client.health();
      const fenced = await client.chatJson<{ ok: boolean; mode: string }>([
        { role: 'user', content: 'return fenced json' },
      ]);
      const prefixed = await client.chatJson<{ ok: boolean; mode: string }>([
        { role: 'user', content: 'return prefixed json' },
      ]);
      const embeddings = await client.embed('embed this');

      await expect(
        client.chatJson([{ role: 'user', content: 'thinking only' }])
      ).rejects.toThrow('thinking output without final JSON content');

      globalThis.fetch = (async (url: string | URL) => {
        if (String(url).endsWith('/api/tags')) {
          return new Response(
            JSON.stringify({ models: [{ name: 'qwen-jest' }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response(JSON.stringify({ error: 'unexpected path' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof fetch;
      const missingEmbedHealth = await new OllamaClient().health();

      const firstChatBody = JSON.parse(chatBodies[0]);
      expect(health).toMatchObject({
        ok: true,
        chatModel: 'qwen-jest',
        embedModel: 'nomic-jest',
        chatModelAvailable: true,
        embedModelAvailable: true,
        missingModels: [],
      });
      expect(health.models).toEqual(['qwen-jest', 'nomic-jest']);
      expect(missingEmbedHealth).toMatchObject({
        ok: false,
        chatModelAvailable: true,
        embedModelAvailable: false,
        missingModels: ['nomic-jest'],
      });
      expect(fenced).toEqual({ ok: true, mode: 'fenced' });
      expect(prefixed).toEqual({ ok: true, mode: 'prefixed' });
      expect(embeddings).toEqual([[0.1, 0.2]]);
      expect(firstChatBody.think).toBe(false);
      expect(firstChatBody.options.num_predict).toBe(8192);
      expect(firstChatBody.messages[0].content).toContain('Return final JSON only');
    } finally {
      globalThis.fetch = originalFetch;
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      });
    }
  });

  it('retries localhost Ollama health over IPv4 when localhost resolves to IPv6 only', async () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = {
      OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
      OLLAMA_CHAT_MODEL: process.env.OLLAMA_CHAT_MODEL,
      OLLAMA_EMBED_MODEL: process.env.OLLAMA_EMBED_MODEL,
    };
    const requestUrls: string[] = [];

    try {
      process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
      process.env.OLLAMA_CHAT_MODEL = 'qwen-jest';
      process.env.OLLAMA_EMBED_MODEL = 'nomic-jest';
      globalThis.fetch = (async (url: string | URL) => {
        const requestUrl = String(url);
        requestUrls.push(requestUrl);

        if (requestUrl.startsWith('http://localhost:11434')) {
          throw new TypeError('fetch failed');
        }

        if (requestUrl === 'http://127.0.0.1:11434/api/tags') {
          return new Response(
            JSON.stringify({
              models: [{ name: 'qwen-jest' }, { name: 'nomic-jest' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response(JSON.stringify({ error: 'unexpected path' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof fetch;

      const health = await new OllamaClient().health();

      expect(health.ok).toBe(true);
      expect(health.models).toEqual(['qwen-jest', 'nomic-jest']);
      expect(requestUrls).toEqual([
        'http://localhost:11434/api/tags',
        'http://127.0.0.1:11434/api/tags',
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      });
    }
  });
});
