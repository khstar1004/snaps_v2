import path from 'path';
import { promises as fs } from 'fs';
import { OllamaClient } from '@gitroom/nestjs-libraries/snaps/ai/ollama.client';
import { snapsAnalyticsToMetricInputs } from '@gitroom/nestjs-libraries/snaps/analytics/analytics-metric.mapper';
import {
  SnapsMetricInput,
  SnapsReportGeneratorService,
} from '@gitroom/nestjs-libraries/snaps/analytics/report-generator.service';
import { SnapsShortVideoService } from '@gitroom/nestjs-libraries/snaps/video/short-video.service';
import { SnapsVectorStoreService } from '@gitroom/nestjs-libraries/snaps/rag/vector-store.service';
import { SnapsRagService } from '@gitroom/nestjs-libraries/snaps/rag/rag.service';
import { SnapsContentTransformService } from '@gitroom/nestjs-libraries/snaps/transform/content-transform.service';
import { SnapsSourceLibraryService } from '@gitroom/nestjs-libraries/snaps/library/source-library.service';
import { SnapsFeedbackInboxService } from '@gitroom/nestjs-libraries/snaps/inbox/feedback-inbox.service';
import { SnapsActivityLogService } from '@gitroom/nestjs-libraries/snaps/activity/activity-log.service';
import { buildSnapsPublishingPayload } from '@gitroom/nestjs-libraries/snaps/schedule/publishing-payload.builder';
import { buildSnapsVideoVariants } from '@gitroom/nestjs-libraries/snaps/video/video-variant.builder';
import { NaverCafeProvider } from '@gitroom/nestjs-libraries/integrations/social/naver-cafe.provider';

class OfflineOllama {
  get model() {
    return 'offline-service-smoke';
  }

  async chatJson<T>(): Promise<T> {
    throw new Error('offline smoke uses deterministic fallback');
  }

  async embed(input: string | string[]) {
    const values = Array.isArray(input) ? input : [input];
    return values.map((value) => this.embedding(value));
  }

  private embedding(value: string) {
    const vector = [0, 0, 0, 0, 0, 0];
    for (let index = 0; index < value.length; index += 1) {
      vector[index % vector.length] += value.charCodeAt(index) % 101;
    }
    return vector.map((entry) => entry / 1000);
  }
}

class MalformedEmbeddingOllama extends OfflineOllama {
  async embed(): Promise<number[][]> {
    return [[1, Number.NaN, Number.POSITIVE_INFINITY, 'bad' as unknown as number, 0.5]];
  }
}

class PartialOllama extends OfflineOllama {
  get model() {
    return 'partial-ollama-service-smoke';
  }

  async chatJson<T>(): Promise<T> {
    return {
      variants: [
        {
          platform: 'instagram',
          title: 'AI normalized title',
          content: 'AI normalized Instagram content',
          hashtags: 'snaps #snaps 마케팅',
          notes: 'string notes should be ignored',
        },
        {
          platform: 'unknown-platform',
          content: 'This variant should be ignored',
        },
      ],
    } as T;
  }
}

class MalformedVariantOllama extends OfflineOllama {
  get model() {
    return 'malformed-variant-service-smoke';
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
      coreSummary: ['서비스', '스모크', '요약'],
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const dataDir = path.join(
    process.cwd(),
    'tmp',
    `snaps-service-smoke-${process.pid}`
  );
  process.env.SNAPS_DATA_DIR = dataDir;
  process.env.SNAPS_ALLOW_RULE_FALLBACK = 'true';
  delete process.env.PIXELLE_VIDEO_URL;

  try {
    await verifyOllamaClientParsing();
    verifyAnalyticsMetricMapper();

    const orgId = 'smoke-org';
    const ollama = new OfflineOllama() as any;
    const vectorStore = new SnapsVectorStoreService();
    const rag = new SnapsRagService(ollama, vectorStore);
    const transformer = new SnapsContentTransformService(ollama, rag);
    const sourceLibrary = new SnapsSourceLibraryService();
    const reports = new SnapsReportGeneratorService(ollama);
    const inbox = new SnapsFeedbackInboxService(ollama);
    const shorts = new SnapsShortVideoService(ollama);
    const activity = new SnapsActivityLogService();

    await verifyJsonStoreRecovery(dataDir, orgId, {
      sourceLibrary,
      rag,
      inbox,
      activity,
    });

    const activityEntry = await activity.record(orgId, {
      type: 'source',
      title: 'Smoke activity entry',
      detail: { phase: 'service-smoke' },
    });
    assert(activityEntry.id, 'activity record failed');
    const importedActivity = await activity.importEntries(orgId, [
      {
        id: 'imported-activity',
        type: 'rag',
        title: 'Imported activity entry',
        detail: { phase: 'import-smoke' },
      },
    ]);
    assert(importedActivity.imported === 1, 'activity import failed');
    const malformedActivity = await activity.importEntries(orgId, [
      {
        type: 'bad',
        title: 'ignored bad type',
      },
      {
        id: {
          invalid: true,
        },
        type: 'source',
        title: {
          invalid: true,
        },
      },
      {
        id: 'clean-activity-entry',
        type: 'source',
        title: ['정상', '활동'],
        detail: [{ invalid: true }],
      },
    ]);
    const activityList = await activity.list(orgId);
    assert(
      activityList.some((entry) => entry.id === activityEntry.id) &&
        activityList.some((entry) => entry.id === 'imported-activity'),
      'activity list did not include recorded and imported entries'
    );
    const cleanActivity = activityList.find(
      (entry) => entry.id === 'clean-activity-entry'
    );
    assert(
      malformedActivity.imported === 1 &&
        cleanActivity?.title === '정상 활동' &&
        !cleanActivity.detail &&
        !JSON.stringify(activityList).includes('[object Object]'),
      'activity import should reject object titles and array details'
    );

    const source = await sourceLibrary.saveSource(orgId, {
      title: 'Smoke source',
      sourceText: '이번 주 신제품 업데이트와 고객 반응을 플랫폼별 게시물로 정리합니다.',
      sourcePlatform: 'newsletter',
      topic: 'runtime smoke campaign',
      tone: '한국 나노 인플루언서 스타일',
      tags: ['smoke'],
    });
    assert(source.id && source.title === 'Smoke source', 'source save failed');
    const importedSources = await sourceLibrary.importSources(orgId, [
      {
        id: 'imported-source',
        title: 'Imported smoke source',
        sourceText: '업로드된 외부 원문을 snaps source library로 복원합니다.',
        sourcePlatform: 'backup',
        topic: 'import smoke',
        tone: '간결한 한국어',
        tags: ['import'],
      },
    ]);
    assert(importedSources.imported === 1, 'source import failed');
    const malformedSourceImport = await sourceLibrary.importSources(orgId, [
      {
        id: {
          invalid: true,
        },
        sourceText: {
          invalid: true,
        },
      },
      {
        id: 'clean-source-import',
        title: {
          invalid: true,
        },
        sourceText: '정상 원문만 source library에 남아야 합니다.',
        tags: ['tag', { invalid: true }, 'tag', 7],
      },
    ]);
    const cleanImportedSource = (await sourceLibrary.listSources(orgId)).find(
      (item) => item.id === 'clean-source-import'
    );
    assert(
      malformedSourceImport.imported === 1 &&
        cleanImportedSource?.title.includes('정상 원문만') &&
        cleanImportedSource.tags.join(',') === 'tag,7' &&
        !JSON.stringify(cleanImportedSource).includes('[object Object]'),
      'source library should reject object sourceText and normalize imported source fields'
    );

    const example = await rag.addExample(orgId, {
      platform: 'instagram',
      content: '고객 반응을 짧은 문장과 해시태그로 정리한 인스타그램 예시입니다.',
      authorType: 'brand',
      topic: 'runtime smoke campaign',
      tone: '한국 나노 인플루언서 스타일',
    });
    const hits = await rag.search(orgId, '고객 반응 인스타그램 예시', 'instagram', 3);
    assert(hits.some((hit) => hit.id === example.id), 'RAG search did not find saved example');
    const importedExamples = await rag.importExamples(orgId, [
      {
        id: 'imported-style-example',
        platform: 'threads',
        content: '짧은 대화체 스레드 스타일 예시입니다.',
        topic: 'import smoke',
      },
    ]);
    assert(importedExamples.imported === 1, 'RAG example import failed');
    const rebuilt = await rag.rebuildEmbeddings(orgId);
    assert(rebuilt.total >= 2 && rebuilt.rebuilt >= 2, 'RAG rebuild did not cover imported examples');
    const malformedEmbeddingExample = await new SnapsRagService(
      new MalformedEmbeddingOllama() as any,
      vectorStore
    ).addExample(orgId, {
      platform: 'threads',
      content: '비정상 임베딩 값은 유한한 숫자만 남겨야 합니다.',
    });
    assert(
      malformedEmbeddingExample.embedding?.join(',') === '1,0.5',
      'RAG addExample should keep only finite embedding values'
    );
    try {
      await rag.addExample(orgId, {
        platform: 'unknown-platform' as any,
        content: '잘못된 플랫폼은 RAG 예시로 저장되면 안 됩니다.',
      });
      throw new Error('RAG addExample accepted an invalid platform');
    } catch (error) {
      assert(
        String((error as Error).message).includes('platform is required'),
        'RAG addExample should reject invalid direct platform input'
      );
    }
    try {
      await rag.addExample(orgId, {
        platform: 'threads',
        content: { invalid: true } as any,
      });
      throw new Error('RAG addExample accepted object content');
    } catch (error) {
      assert(
        String((error as Error).message).includes('content must be at least 5 characters'),
        'RAG addExample should reject malformed direct content input'
      );
    }
    const malformedStyleImport = await vectorStore.importExamples(orgId, [
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
    const finiteImported = (await vectorStore.listExamples(orgId)).find(
      (item) => item.id === 'finite-embedding-import'
    );
    const fallbackTopKHits = await vectorStore.search(orgId, {
      query: '임베딩 예시',
      topK: Number.NaN,
    });
    assert(
      malformedStyleImport.imported === 1 &&
        finiteImported?.embedding?.join(',') === '1,0.25' &&
        !finiteImported.authorType &&
        fallbackTopKHits.length > 0,
      'RAG store should reject object content, keep finite embeddings, and clamp malformed topK'
    );
    const cappedStyleImport = await vectorStore.importExamples(
      `${orgId}-style-cap`,
      Array.from({ length: 505 }, (_, index) => ({
        id: `style-cap-${index}`,
        platform: 'threads',
        content: `상한 검증용 RAG 스타일 예시 ${index} 입니다.`,
      }))
    );
    assert(
      cappedStyleImport.imported === 500 &&
        (await vectorStore.listExamples(`${orgId}-style-cap`)).length === 500,
      'RAG store should cap imported style examples at 500'
    );

    const transform = await transformer.transform(orgId, {
      sourceText: source.sourceText,
      targetPlatforms: ['threads', 'instagram', 'xiaohongshu', 'naver-blog', 'kakao-talk'],
      tone: source.tone,
      topic: source.topic,
      useRag: true,
    });
    assert(transform.provider === 'rule-fallback', 'offline transform should use fallback');
    assert(transform.variants.length === 5, 'transform did not return all requested variants');
    const xiaohongshuVariant = transform.variants.find(
      (variant) => variant.platform === 'xiaohongshu'
    );
    const naverBlogVariant = transform.variants.find(
      (variant) => variant.platform === 'naver-blog'
    );
    const kakaoTalkVariant = transform.variants.find(
      (variant) => variant.platform === 'kakao-talk'
    );
    assert(
      xiaohongshuVariant?.publishMode === 'assist',
      'Xiaohongshu assist variant missing'
    );
    assert(
      xiaohongshuVariant?.content.includes('중국 SNS 노트'),
      'Xiaohongshu assist fallback should include note structure'
    );
    assert(
      naverBlogVariant?.publishMode === 'assist',
      'Naver Blog assist variant missing'
    );
    assert(
      naverBlogVariant.content.includes('목차') &&
        naverBlogVariant.content.includes('본문'),
      'Naver Blog assist fallback should include long-form blog structure'
    );
    assert(
      kakaoTalkVariant?.publishMode === 'assist',
      'KakaoTalk assist variant missing'
    );
    const partialTransformer = new SnapsContentTransformService(
      new PartialOllama() as any,
      rag
    );
    const partialTransform = await partialTransformer.transform(orgId, {
      sourceText: 'LLM이 일부 플랫폼만 반환해도 나머지는 보정되어야 합니다.',
      targetPlatforms: ['instagram', 'threads'],
      useRag: false,
    });
    assert(partialTransform.provider === 'ollama', 'partial Ollama transform should remain provider=ollama');
    assert(partialTransform.variants.length === 2, 'partial Ollama transform should fill omitted variants');
    assert(
      partialTransform.variants.some(
        (variant) =>
          variant.platform === 'instagram' &&
          variant.content === 'AI normalized Instagram content' &&
          variant.hashtags.join(' ') === '#snaps #마케팅'
      ),
      'partial Ollama transform did not normalize returned variant content and hashtags'
    );
    assert(
      partialTransform.warnings.some((warning) => warning.includes('Ollama omitted threads')),
      'partial Ollama transform did not warn about omitted platforms'
    );
    const malformedTransform = await new SnapsContentTransformService(
      new MalformedVariantOllama() as any,
      rag
    ).transform(orgId, {
      sourceText: '비정상 variant가 와도 나머지 플랫폼은 유지되어야 합니다.',
      targetPlatforms: ['instagram', 'threads'],
      useRag: false,
    });
    const malformedInstagram = malformedTransform.variants.find(
      (variant) => variant.platform === 'instagram'
    );
    const malformedThreads = malformedTransform.variants.find(
      (variant) => variant.platform === 'threads'
    );
    assert(
      malformedTransform.provider === 'ollama' &&
        malformedInstagram?.content.includes('비정상 variant') &&
        malformedThreads?.content === '정상 Threads 결과' &&
        malformedThreads.hashtags.join(' ') === '#threads #update',
      'malformed Ollama variants should fallback per platform without discarding valid variants'
    );
    const schedulePayload = buildSnapsPublishingPayload({
      variants: transform.variants,
      integrations: [
        {
          platform: 'instagram',
          integrationId: 'instagram-integration',
        },
      ],
      publishDate: '2026-05-05T10:00:00.000Z',
      scheduleType: 'schedule',
    });
    assert(schedulePayload.payload?.type === 'schedule', 'schedule payload type missing');
    assert(schedulePayload.payload.posts.length === 1, 'schedule payload should include only connected schedulable variants');
    assert(
      schedulePayload.payload.posts[0].integration.id === 'instagram-integration',
      'schedule payload integration mapping failed'
    );
    assert(
      schedulePayload.payload.posts[0].value[0].content,
      'schedule payload content missing'
    );
    const missingPublishDateSchedule = buildSnapsPublishingPayload({
      variants: transform.variants,
      integrations: [
        {
          platform: 'instagram',
          integrationId: 'instagram-integration',
        },
      ],
      scheduleType: 'schedule',
    });
    assert(
      !missingPublishDateSchedule.payload &&
        missingPublishDateSchedule.warnings.some((warning) =>
          warning.includes('publishDate is required')
        ),
      'schedule payload should require publishDate for real schedules'
    );
    const invalidScheduleTypePayload = buildSnapsPublishingPayload({
      variants: transform.variants,
      integrations: [
        {
          platform: 'instagram',
          integrationId: 'instagram-integration',
        },
      ],
      scheduleType: 'publish-now' as any,
    });
    assert(
      invalidScheduleTypePayload.payload?.type === 'draft',
      'schedule payload should coerce invalid scheduleType values to draft'
    );
    const naverCafePayload = buildSnapsPublishingPayload({
      variants: [
        {
          platform: 'naver-cafe',
          label: 'Naver Cafe',
          title: 'Cafe smoke subject',
          content: 'Cafe smoke body',
          hashtags: [],
          settings: {
            __type: 'naver-cafe',
            clubId: 'club-smoke',
            menuId: 'menu-smoke',
            subject: 'Cafe smoke subject',
          },
          publishMode: 'schedule',
        },
      ],
      integrations: [
        {
          platform: 'naver-cafe',
          integrationId: 'naver-cafe-integration',
        },
      ],
    });
    assert(
      naverCafePayload.payload?.posts[0].settings.clubId === 'club-smoke' &&
        naverCafePayload.payload?.posts[0].settings.menuId === 'menu-smoke' &&
        naverCafePayload.payload?.posts[0].settings.subject === 'Cafe smoke subject',
      'Naver Cafe schedule payload settings were not preserved'
    );
    const naverCafeDefaultSubjectPayload = buildSnapsPublishingPayload({
      variants: [
        {
          platform: 'naver-cafe',
          label: 'Naver Cafe',
          content: '본문에서 자동 제목을 만드는 카페 게시글입니다.',
          hashtags: [],
          settings: {
            __type: 'naver-cafe',
            clubId: 'club-smoke',
            menuId: 'menu-smoke',
          },
          publishMode: 'schedule',
        },
      ],
      integrations: [
        {
          platform: 'naver-cafe',
          integrationId: 'naver-cafe-integration',
        },
      ],
    });
    assert(
      naverCafeDefaultSubjectPayload.payload?.posts[0].settings.subject ===
        '본문에서 자동 제목을 만드는 카페 게시글입니다.',
      'Naver Cafe schedule payload did not derive a subject'
    );
    const invalidNaverCafePayload = buildSnapsPublishingPayload({
      variants: [
        {
          platform: 'naver-cafe',
          label: 'Naver Cafe',
          content: 'Cafe smoke body',
          hashtags: [],
          settings: {
            __type: 'naver-cafe',
          },
          publishMode: 'schedule',
        },
      ],
      integrations: [
        {
          platform: 'naver-cafe',
          integrationId: 'naver-cafe-integration',
        },
      ],
    });
    assert(
      !invalidNaverCafePayload.payload &&
        invalidNaverCafePayload.warnings.some((warning) =>
          warning.includes('Naver Cafe scheduling requires clubId and menuId')
        ),
      'Naver Cafe schedule payload should warn when cafe settings are missing'
    );
    const mixedNaverCafePayload = buildSnapsPublishingPayload({
      variants: [
        {
          platform: 'instagram',
          label: 'Instagram',
          content: 'Instagram should still be scheduled',
          hashtags: [],
          settings: {
            __type: 'instagram',
            post_type: 'post',
          },
          publishMode: 'schedule',
        },
        {
          platform: 'naver-cafe',
          label: 'Naver Cafe',
          content: 'Invalid cafe settings should be skipped',
          hashtags: [],
          settings: {
            __type: 'naver-cafe',
          },
          publishMode: 'schedule',
        },
      ],
      integrations: [
        {
          platform: 'instagram',
          integrationId: 'instagram-integration',
        },
        {
          platform: 'naver-cafe',
          integrationId: 'naver-cafe-integration',
        },
      ],
    });
    assert(
      mixedNaverCafePayload.payload?.posts.length === 1 &&
        mixedNaverCafePayload.warnings.some((warning) =>
          warning.includes('Naver Cafe scheduling requires clubId and menuId')
        ),
      'Mixed schedule payload should keep valid posts and warn about invalid Naver Cafe settings'
    );
    const noSchedulePayload = buildSnapsPublishingPayload({
      variants: transform.variants,
      integrations: [],
    });
    assert(!noSchedulePayload.payload && noSchedulePayload.warnings.length > 0, 'empty schedule payload warning missing');

    const report = await reports.generate({
      title: 'Smoke analytics report',
      metrics: [
        {
          platform: 'instagram',
          metricKey: 'impressions',
          metricValue: 100,
          collectedAt: '2026-05-04T00:00:00.000Z',
        },
        {
          platform: 'instagram',
          metricKey: 'impressions',
          metricValue: 140,
          collectedAt: '2026-05-05T00:00:00.000Z',
        },
        {
          platform: 'instagram',
          metricKey: 'likes',
          metricValue: 8,
          collectedAt: '2026-05-05T00:00:00.000Z',
        },
      ],
    });
    assert(report.insights.length > 0, 'report insights missing');
    assert(report.actionItems.length > 0, 'report action items missing');
    const malformedAiReport = await new SnapsReportGeneratorService(
      new MalformedReportOllama() as any
    ).generate({
      title: 'Malformed AI summary report',
      metrics: [
        {
          platform: 'threads',
          metricKey: 'likes',
          metricValue: 5,
          collectedAt: '2026-05-05T00:00:00.000Z',
        },
      ],
    });
    assert(
      typeof malformedAiReport.summary === 'string' &&
        malformedAiReport.summary.includes('threads'),
      'report generator should ignore malformed AI summary payloads'
    );
    const malformedReport = await reports.generate({
      title: 'Malformed metric report',
      metrics: [
        null,
        {
          platform: 'threads',
          metricKey: 'likes',
          metricValue: 'bad-number',
          collectedAt: '',
        },
      ] as unknown as SnapsMetricInput[],
    });
    assert(
      malformedReport.metrics.threads.likes === 0,
      'report generator should ignore malformed metric rows and normalize invalid values'
    );
    const emptyMalformedReport = await reports.generate({
      title: 'Non-array metric report',
      metrics: { invalid: true } as unknown as SnapsMetricInput[],
    });
    assert(
      Object.keys(emptyMalformedReport.metrics).length === 0,
      'report generator should treat non-array metric input as empty'
    );
    const nullBodyReport = await reports.generate(null);
    assert(
      nullBodyReport.title === 'snaps 성과 분석 보고서' &&
        Object.keys(nullBodyReport.metrics).length === 0,
      'report generator should treat null request bodies as empty reports'
    );
    const storedReport = await sourceLibrary.saveReport(orgId, report.title, report);
    const importedReports = await sourceLibrary.importReports(orgId, [
      {
        id: 'imported-report',
        title: 'Imported report',
        report,
      },
    ]);
    assert(importedReports.imported === 1, 'report import failed');
    const malformedReportImport = await sourceLibrary.importReports(orgId, [
      {
        title: {
          invalid: true,
        },
        report: {
          title: {
            invalid: true,
          },
        },
      },
      {
        id: 'clean-report-import',
        title: 'Clean report import',
        report: {
          title: 'Clean report import',
          summary: {
            invalid: true,
          },
          warnings: ['수집 실패 경고', { invalid: true }],
          insights: ['정상 인사이트', { invalid: true }],
          actionItems: [{ invalid: true }, '정상 액션'],
          trends: [
            {
              platform: {
                invalid: true,
              },
              metricKey: 'likes',
              firstValue: 1,
              lastValue: 3,
              delta: {
                invalid: true,
              },
            },
          ],
          metrics: {
            instagram: {
              likes: 3,
              broken: {
                invalid: true,
              },
            },
          },
        },
      },
    ]);
    const cleanReportExport = await sourceLibrary.exportReport(
      orgId,
      'clean-report-import',
      'markdown'
    );
    assert(
      malformedReportImport.imported === 1 &&
        cleanReportExport?.content.includes('정상 인사이트') &&
        cleanReportExport.content.includes('수집 실패 경고') &&
        cleanReportExport.content.includes('정상 액션') &&
        cleanReportExport.content.includes('- likes: 3') &&
        !cleanReportExport.content.includes('[object Object]'),
      'source library should reject malformed report titles and avoid object strings in report export'
    );
    const exportedReport = await sourceLibrary.exportReport(orgId, storedReport.id, 'print-html');
    assert(
      exportedReport?.content.includes('snaps Analytics Report'),
      'print HTML report export missing'
    );

    const imported = await inbox.importItems(orgId, {
      items: [
        {
          platform: 'instagram',
          author: 'user1',
          content: '이 기능은 어떻게 쓰나요?',
        },
        {
          platform: 'threads',
          author: 'partner',
          content: '협업 문의 드립니다.',
        },
      ],
    });
    assert(imported.imported === 2, 'feedback import failed');
    await inbox.importStoredItems(orgId, [
      {
        id: 'legacy-positive-feedback',
        platform: 'instagram',
        content: '좋아요. 회의 전에 보기 좋았습니다.',
        sentiment: 'positive',
      },
      {
        id: 'legacy-negative-feedback',
        platform: 'threads',
        content: '출처 링크가 없어서 확인하기 불편했습니다.',
        sentiment: 'negative',
      },
    ]);
    const malformedStoredFeedback = await inbox.importStoredItems(orgId, [
      {
        id: {
          invalid: true,
        },
        platform: 'threads',
        content: {
          invalid: true,
        },
      },
      {
        id: 'clean-feedback-import',
        platform: 'instagram',
        content: '정상 피드백만 inbox에 저장되어야 합니다.',
        author: {
          invalid: true,
        },
      },
    ]);
    const cleanFeedbackImport = (await inbox.listItems(orgId)).find(
      (item) => item.id === 'clean-feedback-import'
    );
    assert(
      malformedStoredFeedback.imported === 1 &&
        cleanFeedbackImport?.content.includes('정상 피드백') &&
        !cleanFeedbackImport.author &&
        !JSON.stringify(cleanFeedbackImport).includes('[object Object]'),
      'feedback inbox should reject object content and normalize optional string metadata'
    );
    const cappedFeedbackImport = await inbox.importItems(`${orgId}-feedback-cap`, {
      items: Array.from({ length: 1005 }, (_, index) => ({
        platform: 'threads',
        author: `cap-user-${index}`,
        content: `상한 검증용 피드백 ${index} 입니다.`,
      })),
    });
    assert(
      cappedFeedbackImport.imported === 1000 &&
        (await inbox.listItems(`${orgId}-feedback-cap`)).length === 1000,
      'feedback inbox should cap imported items at 1000'
    );
    const malformedImport = await inbox.importItems(orgId, {
      items: [
        null,
        { platform: 'instagram', content: '' },
        { platform: 'unknown-platform', content: 'ignored feedback' },
        { platform: 'threads', content: { invalid: true } },
      ] as any,
    });
    assert(
      malformedImport.imported === 0,
      'feedback import should ignore malformed items without crashing'
    );
    const malformedSummary = await inbox.summarize(orgId, {
      items: [
        null,
        { platform: 'instagram', content: '' },
        { platform: 'threads', content: '정상 질문인가요?' },
      ] as any,
    });
    assert(
      malformedSummary.total === 1 && malformedSummary.bySentiment.question === 1,
      'feedback summary should ignore malformed inline items'
    );
    const summary = await inbox.summarize(orgId, {});
    assert(summary.bySentiment.question >= 1, 'feedback question classification missing');
    assert(summary.bySentiment.praise >= 1, 'feedback praise classification missing');
    assert(summary.bySentiment.complaint >= 1, 'feedback complaint classification missing');
    assert(summary.bySentiment.collaboration >= 1, 'feedback collaboration classification missing');
    const feedbackItems = await inbox.listItems(orgId);
    const deletedFeedback = await inbox.deleteItem(orgId, feedbackItems[0].id);
    assert(deletedFeedback.deleted, 'feedback item delete failed');
    const clearedFeedback = await inbox.clearItems(orgId);
    assert(clearedFeedback.total === 0, 'feedback inbox clear failed');

    const script = await shorts.script({
      sourceText: source.sourceText,
      durationSeconds: 45,
      platform: 'youtube',
    });
    assert(script.coreSummary.length > 0, 'shorts core summary missing');
    assert(script.storyboard.length === 4, 'shorts fallback storyboard missing');
    assert(script.uploadMetadata.hashtags.includes('#shorts'), 'shorts upload metadata missing');
    const malformedScript = await new SnapsShortVideoService(
      new MalformedShortsOllama() as any
    ).script({
      sourceText: source.sourceText,
      platform: 'tiktok',
    });
    assert(
      malformedScript.durationSeconds === 60 &&
        malformedScript.storyboard.length === 4 &&
        malformedScript.uploadMetadata.hashtags.join(' ') ===
          '#shorts #snaps #나쁜태그' &&
        !JSON.stringify(malformedScript).includes('[object Object]'),
      'malformed shorts LLM script should be normalized without leaking object strings'
    );
    const videoVariants = buildSnapsVideoVariants({
      videoUrl: 'https://cdn.example.com/snaps-short.mp4',
      mediaId: 'manual-video',
      thumbnail: 'https://cdn.example.com/snaps-short.jpg',
      title: script.uploadMetadata.title,
      caption: script.caption,
      targetPlatforms: ['instagram', 'youtube', 'naver-blog'],
    });
    assert(videoVariants.targetPlatforms.length === 2, 'video variant builder should keep only video platforms');
    assert(
      videoVariants.variants.some((variant) => variant.platform === 'instagram' && (variant.settings as any).post_type === 'reel'),
      'instagram video variant should be a reel'
    );
    assert(
      videoVariants.variants.some((variant) => variant.platform === 'youtube' && (variant.settings as any).type === 'short'),
      'youtube video variant should be a short'
    );
    assert(
      videoVariants.media[0].thumbnail === 'https://cdn.example.com/snaps-short.jpg',
      'video variant media thumbnail missing'
    );

    const generated = await shorts.generate({
      sourceText: source.sourceText,
      durationSeconds: 45,
      platform: 'youtube',
    });
    assert(generated.status === 'script-ready', 'shorts generate fallback should be script-ready');
    const fallbackStatus = await shorts.status('pixelle-fallback-job');
    assert(
      fallbackStatus.status === 'not-configured',
      'shorts status fallback should be not-configured'
    );
    await verifyPixelleVideoClient(shorts, source.sourceText);

    await verifyNaverCafeProvider();

    const deletedStyle = await rag.deleteExample(orgId, example.id);
    assert(deletedStyle.deleted, 'RAG delete failed');
    const deletedSource = await sourceLibrary.deleteSource(orgId, source.id);
    assert(deletedSource.deleted, 'source delete failed');
    const deletedReport = await sourceLibrary.deleteReport(orgId, storedReport.id);
    assert(deletedReport.deleted, 'report delete failed');

    console.log(
      `verify-snaps-services-ok variants=${transform.variants.length} reportActions=${report.actionItems.length} ragRebuilt=${rebuilt.rebuilt} activity=${activityList.length}`
    );
  } finally {
    await removeSmokeDir(dataDir);
  }
}

async function verifyJsonStoreRecovery(
  dataDir: string,
  orgId: string,
  services: {
    sourceLibrary: SnapsSourceLibraryService;
    rag: SnapsRagService;
    inbox: SnapsFeedbackInboxService;
    activity: SnapsActivityLogService;
  }
) {
  await fs.mkdir(dataDir, { recursive: true });
  const safeOrg = orgId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const emptyOrg = 'smoke-corrupt-object';

  await Promise.all([
    fs.writeFile(
      path.join(dataDir, `${safeOrg}.sources.json`),
      JSON.stringify([
        {
          id: 'recovered-source',
          title: 'Recovered source',
          sourceText: '깨진 저장소에서 살아남아야 하는 원문입니다.',
        },
        { id: 'bad-source', sourceText: '' },
      ]),
      'utf8'
    ),
    fs.writeFile(
      path.join(dataDir, `${safeOrg}.reports.json`),
      JSON.stringify([
        {
          id: 'recovered-report',
          title: 'Recovered report',
          report: {
            title: 'Recovered report',
            summary: '깨진 저장소에서 살아남아야 하는 보고서입니다.',
          },
        },
        { id: 'bad-report', report: {} },
      ]),
      'utf8'
    ),
    fs.writeFile(
      path.join(dataDir, `${safeOrg}.style-examples.json`),
      JSON.stringify([
        {
          id: 'recovered-style',
          platform: 'instagram',
          content: '깨진 저장소에서 살아남아야 하는 인스타그램 스타일 예시입니다.',
          embedding: [1, 'bad', 0.5],
        },
        { platform: 'bad-platform', content: 'ignored' },
      ]),
      'utf8'
    ),
    fs.writeFile(
      path.join(dataDir, `${safeOrg}.feedback-inbox.json`),
      JSON.stringify([
        {
          id: 'recovered-feedback',
          platform: 'threads',
          content: '깨진 저장소에서 살아남아야 하는 피드백인가요?',
          sentiment: 'unknown',
        },
        { platform: 'bad-platform', content: 'ignored' },
      ]),
      'utf8'
    ),
    fs.writeFile(
      path.join(dataDir, `${safeOrg}.activity-log.json`),
      JSON.stringify([
        {
          id: 'recovered-activity',
          type: 'source',
          title: 'Recovered activity',
        },
        { id: 'bad-activity', type: 'bad', title: 'ignored' },
      ]),
      'utf8'
    ),
    fs.writeFile(
      path.join(dataDir, `${emptyOrg}.sources.json`),
      JSON.stringify({ not: 'an array' }),
      'utf8'
    ),
    fs.writeFile(
      path.join(dataDir, `${emptyOrg}.style-examples.json`),
      JSON.stringify({ not: 'an array' }),
      'utf8'
    ),
    fs.writeFile(
      path.join(dataDir, `${emptyOrg}.feedback-inbox.json`),
      JSON.stringify({ not: 'an array' }),
      'utf8'
    ),
    fs.writeFile(
      path.join(dataDir, `${emptyOrg}.activity-log.json`),
      JSON.stringify({ not: 'an array' }),
      'utf8'
    ),
  ]);

  const [sources, reports, styles, inboxItems, activityItems] = await Promise.all([
    services.sourceLibrary.listSources(orgId),
    services.sourceLibrary.listReports(orgId),
    services.rag.listExamples(orgId),
    services.inbox.listItems(orgId),
    services.activity.list(orgId),
  ]);

  assert(
    sources.length === 1 &&
      sources[0].id === 'recovered-source' &&
      sources[0].organizationId === orgId,
    'source library did not recover valid stored JSON entries'
  );
  assert(
    reports.length === 1 &&
      reports[0].id === 'recovered-report' &&
      reports[0].organizationId === orgId,
    'report library did not recover valid stored JSON entries'
  );
  assert(
    styles.length === 1 &&
      styles[0].id === 'recovered-style' &&
      styles[0].embedding?.length === 2,
    'RAG store did not recover valid stored JSON entries'
  );
  assert(
    inboxItems.length === 1 &&
      inboxItems[0].id === 'recovered-feedback' &&
      inboxItems[0].sentiment === 'question',
    'feedback inbox did not recover valid stored JSON entries'
  );
  assert(
    activityItems.length === 1 && activityItems[0].id === 'recovered-activity',
    'activity log did not recover valid stored JSON entries'
  );

  const [emptySources, emptyStyles, emptyInbox, emptyActivity] = await Promise.all([
    services.sourceLibrary.listSources(emptyOrg),
    services.rag.listExamples(emptyOrg),
    services.inbox.listItems(emptyOrg),
    services.activity.list(emptyOrg),
  ]);
  assert(
    !emptySources.length &&
      !emptyStyles.length &&
      !emptyInbox.length &&
      !emptyActivity.length,
    'non-array snaps JSON stores should be treated as empty'
  );
}

async function verifyNaverCafeProvider() {
  const provider = new NaverCafeProvider();
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    FRONTEND_URL: process.env.FRONTEND_URL,
    NAVER_CLIENT_ID: process.env.NAVER_CLIENT_ID,
    NAVER_CLIENT_SECRET: process.env.NAVER_CLIENT_SECRET,
  };
  let capturedUrl = '';
  let capturedBody = '';

  try {
    process.env.FRONTEND_URL = 'https://snaps.example.test';
    process.env.NAVER_CLIENT_ID = 'naver-client';
    process.env.NAVER_CLIENT_SECRET = 'naver-secret';

    const authUrl = await provider.generateAuthUrl();
    assert(
      authUrl.url.includes('client_id=naver-client') &&
        authUrl.url.includes('scope=profile%2Ccafe') &&
        authUrl.url.includes(
          encodeURIComponent('https://snaps.example.test/integrations/social/naver-cafe')
        ),
      'Naver Cafe auth URL did not include the configured client, scope, and redirect'
    );
    assert(
      authUrl.codeVerifier === authUrl.state,
      'Naver Cafe auth state and code verifier should match'
    );

    globalThis.fetch = (async (url: string, options?: RequestInit) => {
      const requestUrl = String(url);
      const body = String(options?.body || '');

      if (requestUrl.endsWith('/oauth2.0/token')) {
        if (body.includes('grant_type=authorization_code')) {
          assert(body.includes('code=auth-code'), 'Naver auth code was not sent');
          assert(body.includes('state=auth-state'), 'Naver auth state was not sent');
          return new Response(
            JSON.stringify({
              access_token: 'naver-access',
              refresh_token: 'naver-refresh',
              expires_in: '3600',
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        if (body.includes('grant_type=refresh_token')) {
          assert(
            body.includes('refresh_token=stored-refresh'),
            'Naver refresh token was not sent'
          );
          return new Response(
            JSON.stringify({
              access_token: 'naver-refreshed-access',
              expires_in: '3600',
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }
      }

      if (requestUrl.endsWith('/v1/nid/me')) {
        return new Response(
          JSON.stringify({
            response: {
              id: 'naver-user',
              nickname: 'snaps Cafe',
              email: 'snaps@example.test',
              profile_image: 'https://cdn.example.test/profile.png',
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(JSON.stringify({ error: 'unexpected naver auth path' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const authenticated = await provider.authenticate({
      code: 'auth-code',
      codeVerifier: 'auth-state',
    });
    assert(typeof authenticated !== 'string', 'Naver Cafe authentication returned an error');
    assert(
      authenticated.accessToken === 'naver-access' &&
        authenticated.refreshToken === 'naver-refresh' &&
        authenticated.id === 'naver-user',
      'Naver Cafe authentication response was not normalized'
    );

    const refreshed = await provider.refreshToken('stored-refresh');
    assert(
      refreshed.accessToken === 'naver-refreshed-access' &&
        refreshed.refreshToken === 'stored-refresh',
      'Naver Cafe refresh response did not preserve fallback refresh token'
    );

    globalThis.fetch = (async () =>
      new Response('<html><body>Naver token gateway failed</body></html>', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/html' },
      })) as typeof fetch;
    const failedAuth = await provider.authenticate({
      code: 'auth-code',
      codeVerifier: 'auth-state',
    });
    assert(
      typeof failedAuth === 'string' &&
        failedAuth.includes('503 Service Unavailable') &&
        !failedAuth.includes('<html>'),
      'Naver Cafe token HTML failure was not normalized'
    );
    let failedRefresh = '';
    try {
      await provider.refreshToken('stored-refresh');
    } catch (error) {
      failedRefresh = error instanceof Error ? error.message : String(error);
    }
    assert(
      failedRefresh.includes('503 Service Unavailable') &&
        !failedRefresh.includes('<html>'),
      'Naver Cafe refresh HTML failure was not normalized'
    );

    globalThis.fetch = (async (url: string, options?: RequestInit) => {
      capturedUrl = url;
      capturedBody = String(options?.body || '');
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
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }) as typeof fetch;

    const posted = await provider.post(
      'internal',
      'token',
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

    assert(
      capturedUrl.includes('/snap%20cafe/menu/board%201/articles'),
      'Naver Cafe URL did not encode club/menu ids'
    );
    assert(capturedBody.includes('subject=Smoke+subject'), 'Naver Cafe subject missing');
    assert(capturedBody.includes('category=notice'), 'Naver Cafe category missing');
    assert(posted[0]?.postId === '123', 'Naver Cafe post response not normalized');

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    let failed = false;
    try {
      await provider.post(
        'internal',
        'token',
        [
          {
            id: 'post-2',
            message: 'No article info',
            settings: {
              clubId: 'snap',
              menuId: 'board',
              subject: 'No article info',
            },
            media: [],
          },
        ],
        {} as any
      );
    } catch (error) {
      failed =
        error instanceof Error &&
        error.message.includes('did not return article information');
    }
    assert(failed, 'Naver Cafe empty success response was not rejected');

    const refresh = provider.handleErrors(
      JSON.stringify({ error: 'invalid_token', message: 'expired' }),
      401
    );
    assert(refresh?.type === 'refresh-token', 'Naver Cafe token error was not refreshable');
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (typeof value === 'undefined') {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function verifyOllamaClientParsing() {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
    OLLAMA_CHAT_MODEL: process.env.OLLAMA_CHAT_MODEL,
    OLLAMA_EMBED_MODEL: process.env.OLLAMA_EMBED_MODEL,
    OLLAMA_DISABLE_THINKING: process.env.OLLAMA_DISABLE_THINKING,
  };
  const seen = {
    chatBodies: [] as string[],
    embedBody: '',
  };

  try {
    process.env.OLLAMA_BASE_URL = 'https://ollama.example.test';
    process.env.OLLAMA_CHAT_MODEL = 'qwen-smoke';
    process.env.OLLAMA_EMBED_MODEL = 'nomic-smoke';
    process.env.OLLAMA_DISABLE_THINKING = 'true';

    let chatCount = 0;
    globalThis.fetch = (async (url: string | URL, options?: RequestInit) => {
      const requestUrl = String(url);

      if (requestUrl.endsWith('/api/tags')) {
        return new Response(
          JSON.stringify({
            models: [{ name: 'qwen-smoke' }, { model: 'nomic-smoke' }],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      if (requestUrl.endsWith('/api/chat')) {
        seen.chatBodies.push(String(options?.body || ''));
        chatCount += 1;
        return new Response(
          JSON.stringify({
            message: {
              content:
                chatCount === 1
                  ? '```json\n{"ok":true,"mode":"fenced"}\n```'
                  : 'final answer:\n{"ok":true,"mode":"prefixed"}',
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      if (requestUrl.endsWith('/api/embed')) {
        seen.embedBody = String(options?.body || '');
        return new Response(
          JSON.stringify({ embeddings: [[0.1, 'bad', 0.2], [], 'bad-row'] }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(JSON.stringify({ error: 'unexpected ollama path' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const client = new OllamaClient();
    const health = await client.health();
    assert(
      health.ok &&
        health.chatModelAvailable &&
        health.embedModelAvailable &&
        health.missingModels.length === 0 &&
        health.models.includes('qwen-smoke') &&
        health.models.includes('nomic-smoke'),
      'Ollama health did not confirm required model readiness'
    );

    globalThis.fetch = (async (url: string | URL) => {
      if (String(url).endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: 'qwen-smoke' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'unexpected ollama path' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;
    const missingEmbedHealth = await new OllamaClient().health();
    assert(
      !missingEmbedHealth.ok &&
        missingEmbedHealth.chatModelAvailable &&
        !missingEmbedHealth.embedModelAvailable &&
        missingEmbedHealth.missingModels.includes('nomic-smoke'),
      'Ollama health should fail when the configured embed model is missing'
    );

    const fallbackUrls: string[] = [];
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
    globalThis.fetch = (async (url: string | URL) => {
      const requestUrl = String(url);
      fallbackUrls.push(requestUrl);

      if (requestUrl.startsWith('http://localhost:11434')) {
        throw new TypeError('fetch failed');
      }

      if (requestUrl === 'http://127.0.0.1:11434/api/tags') {
        return new Response(
          JSON.stringify({
            models: [{ name: 'qwen-smoke' }, { model: 'nomic-smoke' }],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(JSON.stringify({ error: 'unexpected ollama path' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;
    const localhostFallbackHealth = await new OllamaClient().health();
    assert(
      localhostFallbackHealth.ok &&
        fallbackUrls.includes('http://127.0.0.1:11434/api/tags'),
      'Ollama localhost health did not retry through the IPv4 loopback fallback'
    );

    chatCount = 0;
    globalThis.fetch = (async (url: string | URL, options?: RequestInit) => {
      const requestUrl = String(url);

      if (requestUrl.endsWith('/api/chat')) {
        seen.chatBodies.push(String(options?.body || ''));
        chatCount += 1;
        return new Response(
          JSON.stringify({
            message: {
              content:
                chatCount === 1
                  ? '```json\n{"ok":true,"mode":"fenced"}\n```'
                  : 'final answer:\n{"ok":true,"mode":"prefixed"}',
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      if (requestUrl.endsWith('/api/embed')) {
        seen.embedBody = String(options?.body || '');
        return new Response(
          JSON.stringify({ embeddings: [[0.1, 'bad', 0.2], [], 'bad-row'] }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(JSON.stringify({ error: 'unexpected ollama path' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const fenced = await client.chatJson<{ ok: boolean; mode: string }>([
      { role: 'user', content: 'return fenced json' },
    ]);
    assert(fenced.ok && fenced.mode === 'fenced', 'Ollama fenced JSON parsing failed');

    const prefixed = await client.chatJson<{ ok: boolean; mode: string }>([
      { role: 'user', content: 'return prefixed json' },
    ]);
    assert(
      prefixed.ok && prefixed.mode === 'prefixed',
      'Ollama prefixed JSON extraction failed'
    );

    assert(
      seen.chatBodies.every((body) => body.includes('"think":false')),
      'Ollama chat body did not disable thinking'
    );

    const embeddings = await client.embed('snaps embedding parser smoke');
    assert(
      embeddings.length === 1 && embeddings[0]?.join(',') === '0.1,0.2',
      'Ollama embed response was not normalized to finite numeric vectors'
    );
    assert(
      seen.embedBody.includes('"model":"nomic-smoke"'),
      'Ollama embed body did not use configured model'
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (typeof value === 'undefined') {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function verifyAnalyticsMetricMapper() {
  const mapped = snapsAnalyticsToMetricInputs('instagram-integration', [
    {
      label: 'Follower Count',
      data: [{ total: '7', date: '2026-05-04T00:00:00.000Z' }],
      percentageChange: 0,
    },
    {
      label: 'Video Views',
      data: [
        {
          value: 12,
          collectedAt: '2026-05-05T00:00:00.000Z',
        } as any,
      ],
      percentageChange: 0,
    },
    {
      label: 'Broken Rows',
      data: null as any,
      percentageChange: 0,
    },
  ]);

  assert(mapped.length === 2, 'analytics metric mapper should ignore empty data rows');
  assert(
    mapped[0].metricKey === 'follower_count' && mapped[0].metricValue === 7,
    'analytics metric mapper did not normalize total values'
  );
  assert(
    mapped[1].metricKey === 'video_views' && mapped[1].metricValue === 12,
    'analytics metric mapper did not normalize value fields'
  );
  assert(
    snapsAnalyticsToMetricInputs('empty', null).length === 0,
    'analytics metric mapper should return an empty list for invalid analytics'
  );
}

async function verifyPixelleVideoClient(
  shorts: SnapsShortVideoService,
  sourceText: string
) {
  const originalFetch = globalThis.fetch;
  const originalPixelleUrl = process.env.PIXELLE_VIDEO_URL;
  const seen = {
    generateUrl: '',
    generateBody: '',
    statusUrl: '',
  };

  try {
    process.env.PIXELLE_VIDEO_URL = 'https://pixelle.example.test/root/';
    globalThis.fetch = (async (url: string | URL, options?: RequestInit) => {
      const requestUrl = String(url);
      if (requestUrl.endsWith('/generate')) {
        seen.generateUrl = requestUrl;
        seen.generateBody = String(options?.body || '');
        return new Response(
          JSON.stringify({
            status: {
              invalid: true,
            },
            data: {
              job_id: 'pixelle-smoke-job',
              state: 'queued',
              outputs: [
                {
                  video_url: 'https://cdn.example.com/pixelle-smoke.mp4',
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      if (requestUrl.endsWith('/status/pixelle-smoke-job')) {
        seen.statusUrl = requestUrl;
        return new Response(
          JSON.stringify({
            data: {
              jobId: 'pixelle-smoke-job',
              status: 'complete',
              result: {
                videoUrl: 'https://cdn.example.com/pixelle-smoke.mp4',
              },
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(JSON.stringify({ error: 'unexpected pixelle path' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const generated = await shorts.generate({
      sourceText,
      durationSeconds: 30,
      platform: 'tiktok',
    });
    assert(generated.jobId === 'pixelle-smoke-job', 'Pixelle generate response missing job id');
    assert(generated.status === 'queued', 'Pixelle generate nested status was not normalized');
    assert(
      generated.videoUrl === 'https://cdn.example.com/pixelle-smoke.mp4',
      'Pixelle generate nested video URL was not normalized'
    );
    assert(
      seen.generateUrl === 'https://pixelle.example.test/root/generate',
      'Pixelle generate URL was not normalized correctly'
    );
    assert(
      seen.generateBody.includes('"script"') && seen.generateBody.includes('"durationSeconds":30'),
      'Pixelle generate body did not include the script and request data'
    );

    const status = await shorts.status('pixelle-smoke-job');
    assert(status.status === 'complete', 'Pixelle status response missing complete status');
    assert(
      status.videoUrl === 'https://cdn.example.com/pixelle-smoke.mp4',
      'Pixelle status nested video URL was not normalized'
    );
    assert(
      seen.statusUrl === 'https://pixelle.example.test/root/status/pixelle-smoke-job',
      'Pixelle status URL was not normalized correctly'
    );

    globalThis.fetch = (async () =>
      new Response('<html><body>Pixelle gateway failed</body></html>', {
        status: 502,
        statusText: 'Bad Gateway',
        headers: { 'Content-Type': 'text/html' },
      })) as typeof fetch;
    let failureMessage = '';
    try {
      await shorts.generate({
        sourceText,
        durationSeconds: 30,
        platform: 'tiktok',
      });
    } catch (error) {
      failureMessage = error instanceof Error ? error.message : String(error);
    }
    assert(
      failureMessage.includes('Pixelle request failed: 502 Bad Gateway') &&
        !failureMessage.includes('<html>'),
      'Pixelle HTML failures should be compacted before surfacing'
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (typeof originalPixelleUrl === 'undefined') {
      delete process.env.PIXELLE_VIDEO_URL;
    } else {
      process.env.PIXELLE_VIDEO_URL = originalPixelleUrl;
    }
  }
}

async function removeSmokeDir(dataDir: string) {
  const allowedRoot = path.join(process.cwd(), 'tmp');
  const normalized = path.resolve(dataDir);
  if (
    normalized.startsWith(path.resolve(allowedRoot) + path.sep) &&
    path.basename(normalized).startsWith('snaps-service-smoke-')
  ) {
    await fs.rm(normalized, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
