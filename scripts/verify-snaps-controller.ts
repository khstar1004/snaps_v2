import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SnapsController } from '@gitroom/backend/api/routes/snaps.controller';
import { SnapsTargetPlatform } from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import fsSync from 'fs';
import nodeOs from 'os';
import nodePath from 'path';
import { SnapsCardNewsService } from '@gitroom/nestjs-libraries/snaps/cardnews/card-news.service';
import { SnapsCardNewsRendererService } from '@gitroom/nestjs-libraries/snaps/cardnews/card-news-renderer.service';
import { SnapsRenderJobOwnershipService } from '@gitroom/nestjs-libraries/snaps/video/render-job-ownership.service';
import { ShortsMakerClientService } from '@gitroom/nestjs-libraries/snaps/shorts-maker/shorts-maker-client.service';
import { SnapsActivityLogService } from '@gitroom/nestjs-libraries/snaps/activity/activity-log.service';
import { SnapsAgentTaskService } from '@gitroom/nestjs-libraries/snaps/agent/agent-task.service';
import { SnapsCommandPlannerService } from '@gitroom/nestjs-libraries/snaps/agent/command-planner.service';
import { SnapsContentTransformService } from '@gitroom/nestjs-libraries/snaps/transform/content-transform.service';
import { SnapsShortVideoService } from '@gitroom/nestjs-libraries/snaps/video/short-video.service';
import { SnapsRagService } from '@gitroom/nestjs-libraries/snaps/rag/rag.service';
import { SnapsVectorStoreService } from '@gitroom/nestjs-libraries/snaps/rag/vector-store.service';

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

let completed = false;
let failed = false;

// The real activity log writes to disk. Without this it writes into the
// repository's own var/snaps and the run leaves its records behind.
const controllerDataDir = fsSync.mkdtempSync(
  nodePath.join(nodeOs.tmpdir(), 'snaps-controller-')
);
process.env.SNAPS_DATA_DIR = controllerDataDir;

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
const analyticsCalls: string[] = [];
const commentFetches: string[] = [];
let lastMappedPayload: Record<string, unknown> | undefined;
let publishedReply: Record<string, unknown> | undefined;

// Stands in for OllamaClient. `provider()` matters: the card news service
// asks which engine answered, and a double without it throws inside the try,
// which labels every deck as the deterministic fallback whether it was one or
// not.
const offlineOllama = {
  async health() {
    return { ok: false, baseUrl: '', chatModel: '' };
  },
  provider(): 'ollama' | 'deepseek' {
    return 'ollama';
  },
  async chatJson<T>(): Promise<T> {
    throw new Error('offline controller smoke uses the deterministic fallback');
  },
  async embed(): Promise<number[]> {
    throw new Error('offline controller smoke has no embedder');
  },
};

// Real services rather than stubs. Each is constructible offline, and the
// card-news pair in particular has to be real here: the defect these routes
// hid was the controller recording an activity kind the log refused, which
// only a real activity log and a real route can show.
// The command planner, built from its own real collaborators rather than
// stubbed. /snaps/agent/prepare was the one handler of fifty that no smoke
// called, and it is the route that fans out into the transformer, the short
// video service and the card news service at once - the most glue of any of
// them. These instances are the planner's alone; the controller keeps its own
// doubles for the arguments it is given directly, so nothing above changes.
const plannerRag = new SnapsRagService(
  offlineOllama as never,
  new SnapsVectorStoreService()
);
const plannerTransformer = new SnapsContentTransformService(
  offlineOllama as never,
  plannerRag as never
);
const plannerShortVideo = new SnapsShortVideoService(offlineOllama as never);
const agentTasks = new SnapsAgentTaskService();
const cardNews = new SnapsCardNewsService(offlineOllama as never);
const cardNewsRenderer = new SnapsCardNewsRendererService();
const commandPlanner = new SnapsCommandPlannerService(
  offlineOllama as never,
  plannerTransformer as never,
  plannerShortVideo as never,
  cardNews as never
);
const renderJobOwners = new SnapsRenderJobOwnershipService();
const shortsMaker = new ShortsMakerClientService();

// The real activity log, not a double.
//
// A double here accepted every `type:` the controller handed it, so the three
// card-news routes answering 400 - the controller recorded a kind the real
// log's own list did not carry, and record() throws on one of those - passed
// this smoke unchanged. A stub that is more permissive than the service it
// replaces cannot fail for the reason the service would. Counting still goes
// through a wrapper so the summary line keeps its meaning.
const realActivity = new SnapsActivityLogService();
const activityLog = {
  record: async (organizationId: string, entry: Record<string, unknown>) => {
    const written = await realActivity.record(organizationId, entry as never);
    activityRecords.push({ organizationId, ...entry });
    return written;
  },
  list: (organizationId: string) => realActivity.list(organizationId),
  importEntries: (organizationId: string, entries: unknown[]) =>
    realActivity.importEntries(organizationId, entries),
  exportEntries: (organizationId: string) => realActivity.list(organizationId),
};

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
  activityLog as never,
  commandPlanner as never,
  agentTasks as never,
  {
    checkAnalytics: async (_organization: unknown, integrationId: string) => {
      analyticsCalls.push(integrationId);
      if (integrationId === 'bad-integration') {
        throw new Error('provider unavailable');
      }
      if (integrationId === 'counted-integration') {
        return [
          {
            label: 'Likes',
            data: [{ total: '10', date: '2026-05-04T00:00:00.000Z' }],
            percentageChange: 0,
          },
        ];
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
    getComments: async (postId: string) => {
      commentFetches.push(postId);
      return [
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
      ];
    },
    createComment: async (_organizationId: string, _userId: string, postId: string, reply: string) => ({
      id: 'comment-controller',
      postId,
      reply,
    }),
  } as never,
  cardNews as never,
  cardNewsRenderer as never,
  renderJobOwners as never,
  shortsMaker as never
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
    '원문을 찾을 수 없습니다'
  );

  const analyticsReport = await controller.reportFromPlatformAnalytics(org, {
    title: '플랫폼 경고 보고서',
    integrationIds: ['bad-integration'],
    postIds: ['post-ok'],
  });
  assert(analyticsReport.reportId === 'report-controller', 'analytics report should be stored');
  assert(analyticsReport.warnings.length === 1, 'analytics failures should become warnings');

  // The report sums every metric it is given, so the same channel listed twice
  // is counted twice - and the provider is asked twice, each call carrying its
  // own timeout. A repeated id is one channel.
  analyticsCalls.length = 0;
  const doubledReport = await controller.reportFromPlatformAnalytics(org, {
    title: '중복 채널 보고서',
    // A duplicate and a distinct id together: capping before the dedup
    // would spend the budget on the repeat and drop the other channel.
    integrationIds: ['counted-integration', 'counted-integration', 'other-integration'],
    postIds: ['post-ok', 'post-ok'],
  });
  assert(
    analyticsCalls.filter((id) => id === 'counted-integration').length === 1,
    'a repeated integrationId should be fetched once, not once per mention'
  );
  assert(
    analyticsCalls.includes('other-integration'),
    'a channel listed after a repeat must still be fetched'
  );
  const countedRows = (
    doubledReport.metrics as unknown as Array<{ platform: string }>
  ).filter((row) => row.platform === 'counted-integration');
  assert(
    countedRows.length === 1,
    `a repeated integrationId contributed ${countedRows.length} metric rows; ` +
      'the report sums them, so every figure for that channel doubled'
  );

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
    'unconfirmed publish',
    () =>
      controller.publishReply(org, {
        integrationId: 'reply-int',
        platformPostId: 'platform-post',
        reply: '답글',
      }),
    BadRequestException,
    'operatorConfirmed'
  );
  // and with the confirmation given, the channel itself is still checked.
  await expectRejects(
    'non-commentable publish',
    () =>
      controller.publishReply(org, {
        integrationId: 'no-comment-int',
        platformPostId: 'platform-post',
        reply: '답글',
        operatorConfirmed: true,
      } as never),
    BadRequestException,
    '댓글 게시를 지원하지 않습니다'
  );
  const reply = await controller.publishReply(org, {
    integrationId: 'reply-int',
    platformPostId: 'platform-post',
    reply: '답글입니다.',
    operatorConfirmed: true,
  } as never);
  // `result` is the provider's answer, typed as the union of every
  // provider shape; the stub returns the comment object this asserts on.
  const replyResult = reply.result as unknown as { id?: string };
  assert(
    replyResult.id === 'platform-reply-controller',
    'publish reply should call provider'
  );
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

  commentFetches.length = 0;
  const importedComments = await controller.importPostComments(org, {
    // The same source twice. The inbox deduplicates what it stores, so this
    // never produced duplicate feedback - it produced a second provider round
    // trip and an `imported` count the activity log then kept.
    sources: [
      { postId: 'post-ok', platform: 'threads' },
      { postId: 'post-ok', platform: 'threads' },
    ],
  });
  assert(importedComments.imported === 1, 'post comment import should skip other organizations');
  assert(
    commentFetches.filter((id) => id === 'post-ok').length === 1,
    `a repeated comment source was fetched ${commentFetches.length} times`
  );

  // Same post, two platform labels: that is two requests, not a repeat, and
  // collapsing them would drop one of the caller's channels without saying so.
  commentFetches.length = 0;
  const twoLabels = await controller.importPostComments(org, {
    sources: [
      { postId: 'post-ok', platform: 'threads' },
      { postId: 'post-ok', platform: 'instagram' },
    ],
  });
  assert(
    commentFetches.length === 2,
    'two platform labels for one post are two requests, not a repeat'
  );
  assert(
    twoLabels.imported === 2,
    `one post under two labels should import two items, got ${twoLabels.imported}`
  );

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

  // The routes this smoke never drove. Three card-news routes answered 400 to
  // a request that had succeeded - the controller recorded an activity kind
  // the activity log's own list did not carry, and record() throws on one of
  // those - and nothing here called them, so nothing saw it.
  const cardNewsDeck = await controller.cardNewsScript(org as never, {
    sourceText:
      '환절기에는 일교차가 커지면서 면역력이 떨어지기 쉽습니다. 실내 습도를 높게 유지하세요.',
    slideCount: 4,
  } as never);
  assert(
    Array.isArray(cardNewsDeck.slides) && cardNewsDeck.slides.length > 0,
    'card news script should return slides'
  );
  const cardNewsRendered = await controller.cardNewsGenerate(org as never, {
    request: {
      sourceText:
        '환절기에는 일교차가 커지면서 면역력이 떨어지기 쉽습니다. 실내 습도를 높게 유지하세요.',
      slideCount: 3,
    },
  } as never);
  assert(
    Array.isArray(cardNewsRendered.media) && cardNewsRendered.media.length > 0,
    'card news generate should return rendered media'
  );
  const videoScript = await controller.videoScript(org as never, {
    sourceText:
      '환절기에는 일교차가 커지면서 면역력이 떨어지기 쉽습니다. 실내 습도를 높게 유지하세요.',
    durationSeconds: 30,
  } as never);
  // The short video service is a stub here - the real one is driven by the
  // service smoke - so this asks only that the route returned its shape and
  // recorded its activity, which is the glue this file is for.
  // The route answers either the script or the script plus warnings, and
  // only one arm of that union declares `scenes`.
  assert(
    Array.isArray((videoScript as { scenes?: unknown }).scenes),
    'video script route should return a scenes array'
  );
  const feedbackImported = await controller.importFeedback(org as never, {
    items: [
      {
        platform: 'instagram',
        content: '환절기 팁 정말 도움이 됐어요. 감사합니다!',
        author: '구독자',
      },
    ],
  } as never);
  assert(
    feedbackImported.imported === 1,
    'feedback import should accept one item'
  );

  // Attaching a deck to a draft. The route writes real drafts, so the runtime
  // contract exempts it from having its own smoke and names this file instead.
  await expectRejects(
    'card news attach without media',
    () => controller.attachCardNewsToDraft(org as never, {} as never),
    BadRequestException,
    'media는 필수입니다'
  );
  const attachedDeck = await controller.attachCardNewsToDraft(org as never, {
    media: cardNewsRendered.media,
    integrations: [{ id: 'reply-int' }],
    scheduleType: 'draft',
    content: '환절기 건강관리 카드뉴스입니다.',
  } as never);
  assert(
    Array.isArray(attachedDeck.scheduled) || !!attachedDeck.scheduled,
    'card news attach should report what it scheduled'
  );

  // The agent task routes, which the runtime contract says run against a real
  // task store. They do now - the stub that stood here answered [] to every
  // read, so a route that never found its task passed anyway.
  const seededTask = {
    id: 'controller-agent-task',
    command: '환절기 건강관리 콘텐츠를 인스타그램에 준비해줘',
    status: 'prepared',
    result: {
      plan: {
        command: '환절기 건강관리 콘텐츠를 인스타그램에 준비해줘',
        targetPlatforms: ['instagram'],
        scheduleType: 'draft',
        includeShortVideo: false,
        sourceText: '환절기에는 일교차가 커지면서 면역력이 떨어지기 쉽습니다.',
        marketingStrategy: { framework: 'AIDA', revenueModels: [] },
      },
      transform: { variants: [{ platform: 'instagram', content: '본문' }] },
      operation: { progress: 100 },
    },
  };
  const seeded = await agentTasks.importTasks(org.id, [seededTask as never]);
  assert(seeded.imported === 1, 'the seeded agent task should be stored');

  // The route returns a page, not a bare array.
  const listedTasks = await controller.listAgentTasks(org as never, {});
  assert(
    listedTasks.list.length === 1 && listedTasks.total === 1,
    `agent task list should return the seeded task, got ${JSON.stringify(
      listedTasks
    ).slice(0, 160)}`
  );
  const fetchedTask = await controller.getAgentTask(
    org as never,
    'controller-agent-task'
  );
  assert(
    fetchedTask.id === 'controller-agent-task',
    'agent task fetch should return the seeded task'
  );
  await expectRejects(
    'missing agent task',
    () => controller.getAgentTask(org as never, 'no-such-task'),
    NotFoundException,
    '에이전트 작업'
  );
  const favorited = await controller.favoriteAgentTask(
    org as never,
    'controller-agent-task'
  );
  assert(favorited.favorite === true, 'favorite should mark the task');
  const unfavorited = await controller.unfavoriteAgentTask(
    org as never,
    'controller-agent-task'
  );
  assert(unfavorited.favorite === false, 'unfavorite should clear the mark');
  const rated = await controller.rateAgentTask(
    org as never,
    'controller-agent-task',
    { rating: 4, comment: '좋습니다' }
  );
  assert(rated.rating === 4, 'rating should be stored');
  const deletedTask = await controller.deleteAgentTask(
    org as never,
    'controller-agent-task'
  );
  assert(deletedTask.deleted === true, 'delete should remove the task');

  // The last handler of the fifty that nothing called.
  await expectRejects(
    'agent prepare with a command too short to act on',
    () => controller.prepareAgentCommand(org as never, { command: '짧다' } as never),
    BadRequestException,
    '최소 5자'
  );
  const prepared = await controller.prepareAgentCommand(org as never, {
    command:
      '환절기 건강관리 콘텐츠를 인스타그램과 스레드에 초안으로 준비해줘',
  } as never);
  assert(
    !!prepared.plan && !!prepared.transform && !!prepared.operation,
    'agent prepare should return a plan, a transform and an operation'
  );
  assert(
    Array.isArray(prepared.plan.targetPlatforms) &&
      prepared.plan.targetPlatforms.length > 0,
    'agent prepare should pick at least one target platform'
  );
  assert(
    !!prepared.task && !!prepared.task.id,
    'agent prepare should save the task it prepared'
  );
  // and the saved task is the one the list route returns.
  const preparedList = await controller.listAgentTasks(org as never, {});
  assert(
    preparedList.list.some(
      (task: { id?: string }) => task.id === prepared.task.id
    ),
    'the prepared task should be readable through the list route'
  );

  // The rest of the routes nothing drove. Measured before this block: 23 of
  // the 50 handlers were called by no smoke at all, which is the same gap the
  // card-news trio sat in - a route that does its work and throws on its last
  // line is invisible until something calls it.
  const postedHealth = await controller.postHealth();
  assert(postedHealth.product === 'snaps', 'POST health should identify snaps');

  const savedExample = await controller.addStyleExample(org as never, {
    platform: 'instagram',
    content: '환절기 건강관리 팁을 카드뉴스로 정리했습니다.',
  } as never);
  assert(!!savedExample, 'style example save should answer');
  const examples = await controller.listStyleExamples(org as never);
  assert(Array.isArray(examples), 'style example list should be an array');
  const searched = await controller.searchStyleExamples(
    org as never,
    '환절기',
    'instagram' as never,
    '3'
  );
  assert(Array.isArray(searched), 'style example search should be an array');
  const rebuilt = await controller.rebuildRagEmbeddings(org as never);
  assert(!!rebuilt, 'rag rebuild should answer');
  const deletedExample = await controller.deleteStyleExample(
    org as never,
    'style-controller'
  );
  assert(!!deletedExample, 'style example delete should answer');

  const report = await controller.generateReport(org as never, {
    title: '컨트롤러 스모크 리포트',
    metrics: [
      { name: '도달', metricValue: 1200 },
      { name: '저장', metricValue: 90 },
    ],
  } as never);
  assert(!!report.reportId, 'report generate should return a stored id');
  const history = await controller.listReportHistory(org as never);
  assert(Array.isArray(history), 'report history should be an array');
  const promotedReport = await controller.promoteReportToRag(
    org as never,
    'report-controller',
    { platform: 'threads' } as never
  );
  assert(!!promotedReport, 'report promotion should answer');

  const feedbackItems = await controller.listFeedback(org as never);
  assert(Array.isArray(feedbackItems), 'feedback list should be an array');
  const feedbackSummary = await controller.summarizeFeedback(org as never, {
    platform: 'instagram',
  } as never);
  assert(!!feedbackSummary, 'feedback summary should answer');
  await expectRejects(
    'reply draft without a post',
    () => controller.createReplyDraft(org as never, user as never, {} as never),
    BadRequestException,
    'postId는 필수입니다'
  );
  const replyDraft = await controller.createReplyDraft(
    org as never,
    user as never,
    { postId: 'platform-post', reply: '답글 초안입니다.' } as never
  );
  assert(!!replyDraft, 'reply draft should answer');
  const deletedItem = await controller.deleteFeedbackItem(
    org as never,
    'feedback-controller'
  );
  assert(!!deletedItem, 'feedback item delete should answer');
  const clearedFeedback = await controller.clearFeedback(org as never);
  assert(!!clearedFeedback, 'feedback clear should answer');

  // Shorts-Maker is not running here, so these ask that the route reports the
  // failure rather than throwing it at the operator - which is the behaviour
  // the client's error handling exists for.
  const topicScript = await controller.shortsMakerTopicToScript(org as never, {
    topic: '환절기 감기 예방',
  } as never);
  assert(
    typeof topicScript === 'object' && topicScript !== null,
    'shorts-maker topic-to-script should answer an object even when the service is down'
  );
  // The boundary rejects an incomplete payload by name rather than letting
  // Shorts-Maker fail confusingly at the far end.
  await expectRejects(
    'render job without audio',
    () => controller.shortsMakerCreateRenderJob(org as never, {} as never),
    BadRequestException,
    'fullAudio는 필수입니다'
  );
  const renderJob = await controller.shortsMakerCreateRenderJob(org as never, {
    fullAudio: 'https://cdn.example.com/audio.mp3',
    visuals: { frames: ['https://cdn.example.com/frame-1.png'] },
    frameDurationsSec: [3, 3, 4],
    durationMs: 30000,
  } as never);
  assert(
    typeof renderJob === 'object' && renderJob !== null,
    'shorts-maker render job should answer an object even when the service is down'
  );
  // A job this organisation never asked for is refused rather than polled.
  await expectRejects(
    'foreign render job status',
    () => controller.videoStatus(org as never, 'job-nobody-asked-for'),
    NotFoundException,
    '요청한 영상 작업을 찾을 수 없습니다'
  );
  await expectRejects(
    'foreign shorts-maker job status',
    () =>
      controller.shortsMakerRenderJobStatus(
        org as never,
        'job-nobody-asked-for'
      ),
    NotFoundException,
    '요청한 영상 작업을 찾을 수 없습니다'
  );

  // The two transform routes that also write. They go through the same
  // scheduler stub the schedule route above uses.
  const drafted = await controller.transformAndDraft(org as never, {
    sourceText:
      '환절기에는 일교차가 커지면서 면역력이 떨어지기 쉽습니다. 실내 습도를 높게 유지하세요.',
    targetPlatforms: ['instagram'],
    integrations: [{ id: 'reply-int' }],
  } as never);
  assert(!!drafted, 'transform-and-draft should answer');
  const scheduledTransform = await controller.transformAndSchedule(
    org as never,
    {
      sourceText:
        '환절기에는 일교차가 커지면서 면역력이 떨어지기 쉽습니다. 실내 습도를 높게 유지하세요.',
      targetPlatforms: ['instagram'],
      integrations: [{ id: 'reply-int' }],
      scheduleType: 'draft',
    } as never
  );
  assert(!!scheduledTransform, 'transform-and-schedule should answer');

  // Video generation with no Pixelle instance: the route has to report that
  // rather than throw it.
  const generated = await controller.generateShort(org as never, {
    sourceText:
      '환절기에는 일교차가 커지면서 면역력이 떨어지기 쉽습니다. 실내 습도를 높게 유지하세요.',
    durationSeconds: 30,
  } as never);
  assert(
    typeof generated === 'object' && generated !== null,
    'generate-short should answer an object when no renderer is configured'
  );

  const activityList = await controller.listActivity(org as never);
  assert(Array.isArray(activityList), 'activity list should be an array');

  // Every kind of activity these routes record has to have reached the log.
  // The card-news defect surfaced as a throw, but a route that swallowed the
  // failure would leave the history silently short instead.
  const kinds = Array.from(
    new Set(activityRecords.map((entry) => String(entry.type)))
  ).sort();
  for (const required of ['card-news', 'video', 'inbox']) {
    assert(
      kinds.includes(required),
      `no '${required}' activity entry was written; kinds seen: ${kinds.join(',')}`
    );
  }

  assert(scheduledCalls.length >= 2, 'schedule and video attach should call existing createPost');
  console.log(
    `verify-snaps-controller-ok activity=${activityRecords.length} scheduled=${scheduledCalls.length}`
  );
  fsSync.rmSync(controllerDataDir, { recursive: true, force: true });
  completed = true;
}

// Failing by default, cleared only when main() reaches its end.
//
// A promise that never settles does not hold the Node event loop open, so an
// await that hangs does not fail this script - it ends it, with every check
// after that point skipped and an exit code of 0. Measured here: deleting the
// analytics timeout stopped the run at that check and it still reported
// success.
process.exitCode = 1;

main().catch((error) => {
  failed = true;
  console.error(error);
  process.exit(1);
});

process.on('exit', () => {
  if (failed) {
    return;
  }
  if (completed) {
    process.exitCode = 0;
    return;
  }
  // Reported rather than just failed: without this line a run that stopped
  // early produced no output at all, only a non-zero code, and the check it
  // stopped on was invisible.
  console.error(
    'verify-snaps-controller did not finish: a check stopped without',
    'settling, so everything after it was skipped'
  );
  process.exitCode = 1;
});
