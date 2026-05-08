import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SnapsController } from '@gitroom/backend/api/routes/snaps.controller';
import { SnapsTargetPlatform } from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';

process.on('warning', (warning) => {
  if (
    warning.name === 'DeprecationWarning' &&
    warning.message.includes('url.parse()')
  ) {
    return;
  }
  console.warn(warning);
});

type ScheduledCall = {
  organizationId: string;
  mapped: Record<string, unknown>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectRejects<T extends Error>(
  label: string,
  run: () => Promise<unknown>,
  expectedError: new (...args: unknown[]) => T,
  messagePart: string
) {
  try {
    await run();
  } catch (error) {
    assert(error instanceof expectedError, `${label} threw the wrong error type`);
    assert(
      error.message.includes(messagePart),
      `${label} error did not include "${messagePart}": ${error.message}`
    );
    return;
  }
  throw new Error(`${label} did not throw`);
}

const org = { id: 'org-controller-smoke' };
const user = { id: 'user-controller-smoke' };
const activityRecords: Array<Record<string, unknown>> = [];
const scheduledCalls: ScheduledCall[] = [];
let lastMappedPayload: Record<string, unknown> | undefined;
let publishedReply: Record<string, unknown> | undefined;

const controller = new SnapsController(
  {
    health: async () => ({
      ok: true,
      baseUrl: 'http://localhost:11434',
      chatModel: 'qwen3.5:9b',
      embedModel: 'nomic-embed-text:latest',
      missingModels: [],
    }),
  } as never,
  {
    transform: async (_organizationId: string, request: Record<string, unknown>) => {
      const platforms =
        Array.isArray(request.targetPlatforms) && request.targetPlatforms.length
          ? request.targetPlatforms
          : ['threads'];
      return {
        provider: 'controller-smoke',
        model: 'qwen3.5:9b',
        variants: platforms.map((platform) => ({
          platform,
          label: String(platform),
          content: `${request.sourceText} :: ${platform}`,
          hashtags: ['#snaps'],
          settings: { __type: platform },
          publishMode: 'schedule',
        })),
        ragExamplesUsed: [],
        warnings: [],
      };
    },
    buildDraftPayload: (result: Record<string, unknown>) => ({
      drafts: result.variants,
    }),
  } as never,
  {
    addExample: async (_organizationId: string, request: Record<string, unknown>) => ({
      id: 'rag-example-controller',
      ...request,
    }),
    listExamples: async () => [{ id: 'rag-example-controller', platform: 'threads' }],
    deleteExample: async (_organizationId: string, exampleId: string) => ({
      deleted: true,
      exampleId,
    }),
    search: async () => [{ id: 'rag-hit-controller', score: 1 }],
    rebuildEmbeddings: async () => ({ rebuilt: 1, failed: 0 }),
    importExamples: async (_organizationId: string, examples: unknown[]) => ({
      imported: examples.length,
      total: examples.length,
    }),
  } as never,
  {
    generate: async (request: Record<string, unknown> = {}) => ({
      title: String(request.title || 'snaps controller report'),
      summary: '컨트롤러 smoke 보고서',
      insights: ['정상 응답'],
      actionItems: ['다음 콘텐츠를 예약'],
      trends: [],
      charts: [],
      metrics: Array.isArray(request.metrics) ? request.metrics : [],
      generatedAt: new Date(0).toISOString(),
    }),
  } as never,
  {
    script: async (request: Record<string, unknown>) => ({
      platform: request.platform || 'instagram',
      durationSeconds: request.durationSeconds || 30,
      scenes: [],
    }),
    generate: async (request: Record<string, unknown>) => ({
      status: 'script-ready',
      platform: request.platform || 'instagram',
      jobId: undefined,
    }),
    status: async (jobId: string) => ({ jobId, status: 'not-configured' }),
  } as never,
  {
    importItems: async (_organizationId: string, body: { items?: unknown[] } = {}) => ({
      imported: Array.isArray(body.items) ? body.items.length : 0,
      total: Array.isArray(body.items) ? body.items.length : 0,
    }),
    importStoredItems: async (_organizationId: string, items: unknown[]) => ({
      imported: items.length,
      total: items.length,
    }),
    listItems: async () => [{ id: 'feedback-controller', platform: 'threads' }],
    clearItems: async () => ({ deleted: 1 }),
    deleteItem: async (_organizationId: string, itemId: string) => ({
      deleted: true,
      itemId,
    }),
    summarize: async () => ({ total: 1, highlights: [], replySuggestions: [] }),
  } as never,
  {
    saveSource: async (_organizationId: string, source: Record<string, unknown> = {}) => ({
      id: 'source-controller',
      title: source.title || 'Source',
      sourceText: source.sourceText || 'source body',
    }),
    listSources: async () => [{ id: 'source-controller' }],
    deleteSource: async (_organizationId: string, sourceId: string) => ({
      deleted: true,
      sourceId,
    }),
    getSource: async (_organizationId: string, sourceId: string) =>
      sourceId === 'missing'
        ? undefined
        : {
            id: sourceId,
            title: 'Saved source',
            sourceText: '좋은 예시 콘텐츠입니다.',
            sourcePlatform: 'newsletter',
            topic: '운영',
            tone: '차분한 한국어',
            tags: ['운영'],
          },
    saveReport: async (_organizationId: string, title: string, report: Record<string, unknown>) => ({
      id: 'report-controller',
      title,
      report,
    }),
    listReports: async () => [{ id: 'report-controller', title: 'Report' }],
    deleteReport: async (_organizationId: string, reportId: string) => ({
      deleted: true,
      reportId,
    }),
    getReport: async (_organizationId: string, reportId: string) =>
      reportId === 'missing'
        ? undefined
        : {
            id: reportId,
            title: 'Stored report',
            report: {
              summary: '성과 요약',
              insights: ['인사이트'],
              actionItems: ['액션'],
              generatedAt: new Date(0).toISOString(),
            },
          },
    exportReport: async (_organizationId: string, reportId: string, format: string) =>
      reportId === 'missing' ? undefined : { reportId, format, content: 'exported' },
    importSources: async (_organizationId: string, sources: unknown[]) => ({
      imported: sources.length,
      total: sources.length,
    }),
    importReports: async (_organizationId: string, reports: unknown[]) => ({
      imported: reports.length,
      total: reports.length,
    }),
  } as never,
  {
    record: async (organizationId: string, entry: Record<string, unknown>) => {
      activityRecords.push({ organizationId, ...entry });
      return entry;
    },
    list: async () => activityRecords,
    importEntries: async (_organizationId: string, entries: unknown[]) => ({
      imported: entries.length,
      total: entries.length,
    }),
  } as never,
  {
    checkAnalytics: async (_organization: unknown, integrationId: string) => {
      if (integrationId === 'bad-integration') {
        throw new Error('provider unavailable');
      }
      return [];
    },
    getIntegrationsList: async () => [
      {
        id: 'reply-int',
        name: 'Threads',
        providerIdentifier: 'threads',
        disabled: false,
      },
      {
        id: 'no-comment-int',
        name: 'Instagram',
        providerIdentifier: 'instagram',
        disabled: false,
      },
    ],
    getIntegrationById: async (_organizationId: string, integrationId: string) => {
      if (integrationId === 'reply-int') {
        return {
          id: 'reply-int',
          name: 'Threads',
          providerIdentifier: 'threads',
          internalId: 'threads-internal',
          token: 'token',
        };
      }
      if (integrationId === 'no-comment-int') {
        return {
          id: 'no-comment-int',
          name: 'Instagram',
          providerIdentifier: 'instagram',
          internalId: 'instagram-internal',
          token: 'token',
        };
      }
      return undefined;
    },
  } as never,
  {
    getSocialIntegration: (providerIdentifier: string) => {
      if (providerIdentifier === 'threads') {
        return {
          comment: async (
            internalId: string,
            platformPostId: string,
            _lastCommentId: string,
            token: string,
            replies: Array<Record<string, unknown>>
          ) => {
            publishedReply = { internalId, platformPostId, token, replies };
            return { id: 'platform-reply-controller' };
          },
        };
      }
      if (providerIdentifier === 'instagram') {
        return {};
      }
      throw new Error('missing provider');
    },
  } as never,
  {
    saveFile: async (_organizationId: string, fileName: string, path: string, alt: string) => ({
      id: 'media-controller',
      path,
      alt,
      thumbnail: 'https://cdn.example.com/thumb.jpg',
      fileName,
    }),
  } as never,
  {
    mapTypeToPost: async (payload: Record<string, unknown>, organizationId: string) => {
      lastMappedPayload = payload;
      return { ...payload, organizationId };
    },
    createPost: async (organizationId: string, mapped: Record<string, unknown>) => {
      scheduledCalls.push({ organizationId, mapped });
      return [{ id: 'post-controller', type: mapped.type }];
    },
    checkPostAnalytics: async () => [],
    getComments: async () => [
      {
        organizationId: org.id,
        userId: 'commenter',
        content: '좋은 글입니다.',
        createdAt: new Date(0),
      },
      {
        organizationId: 'other-org',
        content: 'skip me',
      },
    ],
    createComment: async (_organizationId: string, _userId: string, postId: string, reply: string) => ({
      id: 'comment-controller',
      postId,
      reply,
    }),
  } as never
);

async function main() {
  const health = await controller.health();
  assert(health.product === 'snaps', 'health should identify snaps');
  assert(health.ok === true, 'health should surface Ollama status');

  const transformed = await controller.transform(org, {
    sourceText: '  이번 주 바이오 업계 주요 뉴스입니다.  ',
    targetPlatforms: ['threads'],
    useRag: true,
  });
  assert(transformed.variants[0]?.platform === 'threads', 'transform should return requested platform');
  assert(
    activityRecords.some((entry) => entry.type === 'transform'),
    'transform should record activity'
  );

  await expectRejects(
    'short transform body',
    () => controller.transform(org, { sourceText: 'bad' } as never),
    BadRequestException,
    'sourceText'
  );

  const scheduled = await controller.scheduleVariants(org, {
    variants: [
      {
        platform: 'threads',
        label: 'Threads',
        content: '예약 본문',
        hashtags: [],
        settings: { __type: 'threads' },
        publishMode: 'schedule',
      },
    ],
    integrations: [{ platform: 'threads', integrationId: 'threads-int' }],
    scheduleType: 'invalid' as never,
  });
  assert(scheduled.scheduled.length === 1, 'schedule variants should create a draft');
  assert(lastMappedPayload?.type === 'draft', 'invalid scheduleType should coerce to draft');

  const promotedSource = await controller.promoteSourceToRag(org, 'source-controller', {
    platform: 'threads',
  });
  assert(promotedSource.id === 'rag-example-controller', 'source promotion should save RAG example');
  await expectRejects(
    'missing source promotion',
    () => controller.promoteSourceToRag(org, 'missing', { platform: 'threads' }),
    NotFoundException,
    'not found'
  );

  const analyticsReport = await controller.reportFromPlatformAnalytics(org, {
    title: '플랫폼 경고 보고서',
    integrationIds: ['bad-integration'],
    postIds: ['post-ok'],
  });
  assert(analyticsReport.reportId === 'report-controller', 'analytics report should be stored');
  assert(analyticsReport.warnings.length === 1, 'analytics failures should become warnings');

  const capabilities = await controller.replyCapabilities(org);
  assert(
    capabilities.some((item) => item.id === 'reply-int' && item.commentable),
    'reply capabilities should mark commentable integrations'
  );
  assert(
    capabilities.some((item) => item.id === 'no-comment-int' && !item.commentable),
    'reply capabilities should mark non-commentable integrations'
  );

  await expectRejects(
    'non-commentable publish',
    () =>
      controller.publishReply(org, {
        integrationId: 'no-comment-int',
        platformPostId: 'platform-post',
        reply: '답글',
      }),
    BadRequestException,
    'does not support'
  );
  const reply = await controller.publishReply(org, {
    integrationId: 'reply-int',
    platformPostId: 'platform-post',
    reply: '답글입니다.',
  });
  assert(reply.result.id === 'platform-reply-controller', 'publish reply should call provider');
  assert(publishedReply?.platformPostId === 'platform-post', 'provider should receive platform post id');

  await expectRejects(
    'missing video URL',
    () => controller.attachVideoToDraft(org, { integrations: [] } as never),
    BadRequestException,
    'videoUrl'
  );
  const attached = await controller.attachVideoToDraft(org, {
    videoUrl: 'https://cdn.example.com/snaps/video.mp4',
    targetPlatforms: ['instagram' as SnapsTargetPlatform],
    integrations: [{ platform: 'instagram', integrationId: 'instagram-int' }],
    saveToMediaLibrary: false,
  });
  assert(attached.scheduled.length === 1, 'video attach should schedule generated video variant');

  const importedComments = await controller.importPostComments(org, {
    sources: [{ postId: 'post-ok', platform: 'threads' }],
  });
  assert(importedComments.imported === 1, 'post comment import should skip other organizations');

  const exported = await controller.exportWorkspace(org);
  assert(exported.product === 'snaps', 'workspace export should identify snaps');
  const imported = await controller.importWorkspace(org, {
    sources: [{ title: 'Imported', sourceText: 'imported body' }],
    styleExamples: [],
    reports: [],
    inboxItems: [],
    activity: [],
  });
  assert(imported.product === 'snaps', 'workspace import should identify snaps');

  assert(scheduledCalls.length >= 2, 'schedule and video attach should call existing createPost');
  console.log(
    `verify-snaps-controller-ok activity=${activityRecords.length} scheduled=${scheduledCalls.length}`
  );
  process.exit(0);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
