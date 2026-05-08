import path from 'path';
import { promises as fs } from 'fs';
import { SnapsContentTransformService } from '@gitroom/nestjs-libraries/snaps/transform/content-transform.service';
import { buildSnapsPublishingPayload } from '@gitroom/nestjs-libraries/snaps/schedule/publishing-payload.builder';
import { SnapsFeedbackInboxService } from '@gitroom/nestjs-libraries/snaps/inbox/feedback-inbox.service';
import { SnapsVectorStoreService } from '@gitroom/nestjs-libraries/snaps/rag/vector-store.service';
import { SnapsRagService } from '@gitroom/nestjs-libraries/snaps/rag/rag.service';
import { SnapsReportGeneratorService } from '@gitroom/nestjs-libraries/snaps/analytics/report-generator.service';
import { SnapsShortVideoService } from '@gitroom/nestjs-libraries/snaps/video/short-video.service';
import { SnapsSourceLibraryService } from '@gitroom/nestjs-libraries/snaps/library/source-library.service';
import { SnapsActivityLogService } from '@gitroom/nestjs-libraries/snaps/activity/activity-log.service';
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

  afterEach(async () => {
    process.env.SNAPS_ALLOW_RULE_FALLBACK = originalFallback;
    if (originalDataDir === undefined) {
      delete process.env.SNAPS_DATA_DIR;
    } else {
      process.env.SNAPS_DATA_DIR = originalDataDir;
    }
    jest.clearAllMocks();
  });

  it('keeps Naver Blog and KakaoTalk as assist-only rule fallback variants', async () => {
    process.env.SNAPS_ALLOW_RULE_FALLBACK = 'true';
    const transformer = new SnapsContentTransformService(
      new OfflineOllama() as any,
      emptyRag as any
    );

    const result = await transformer.transform('jest-org', {
      sourceText: '이번 주 신제품 업데이트와 고객 반응을 플랫폼별 게시물로 정리합니다.',
      targetPlatforms: ['naver-blog', 'kakao-talk'],
      useRag: false,
    });

    const naverBlog = result.variants.find(
      (variant) => variant.platform === 'naver-blog'
    );
    const kakaoTalk = result.variants.find(
      (variant) => variant.platform === 'kakao-talk'
    );

    expect(result.provider).toBe('rule-fallback');
    expect(naverBlog?.publishMode).toBe('assist');
    expect(naverBlog?.content).toContain('목차');
    expect(naverBlog?.content).toContain('본문');
    expect(kakaoTalk?.publishMode).toBe('assist');
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
    expect(malformedThreads?.hashtags).toEqual(['#threads', '#update']);
  });

  it('preserves valid schedule payloads while warning about invalid Naver Cafe settings', () => {
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
      ],
      integrations: [
        { platform: 'instagram', integrationId: 'instagram-id' },
        { platform: 'naver-cafe', integrationId: 'naver-cafe-id' },
      ],
      publishDate: '2026-05-05T10:00:00.000Z',
      scheduleType: 'schedule',
    });

    expect(result.payload?.posts).toHaveLength(1);
    expect(result.payload?.posts[0].integration.id).toBe('instagram-id');
    expect(result.warnings).toContain(
      'Naver Cafe scheduling requires clubId and menuId settings. The Naver Cafe variant was skipped.'
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
      expect(seen.postBody).toContain('subject=Smoke+subject');
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
