import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SnapsController } from '@gitroom/backend/api/routes/snaps.controller';
import { SnapsAdDisclosureGuardService } from '@gitroom/nestjs-libraries/snaps/compliance/ad-disclosure-guard.service';
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
    preview: (request: Record<string, unknown> = {}) => ({
      source: 'snaps-video-voiceover-captions',
      platform: request.platform || 'instagram',
      durationSeconds: request.durationSeconds || 30,
      voiceover: {
        voice: request.voice || 'Korean energetic creator',
        voiceStyle: request.voiceStyle || 'energetic',
        paceWpm: 168,
        estimatedWords: 12,
        estimatedVoiceSeconds: 4,
      },
      captionStyle: request.captionStyle || 'karaoke',
      captions: [
        {
          id: 'caption-1',
          index: 1,
          startSecond: 0.3,
          endSecond: 3.8,
          text: 'Controller voiceover cue',
          words: 3,
          readingLoad: 0.86,
          status: 'ready',
          warnings: [],
        },
      ],
      sceneAlignments: [
        {
          scene: 1,
          startSecond: 0,
          endSecond: 6,
          visual: 'Controller visual',
          captionText: 'Controller voiceover cue',
          pixellePrompt: 'Controller prompt',
          warnings: [],
        },
      ],
      exports: { srt: '1\n00:00:00,300 --> 00:00:03,800\nController voiceover cue', webVtt: 'WEBVTT' },
      summary: {
        captionCount: 1,
        overrunCaptions: 0,
        silentGaps: 0,
        alignmentScore: 96,
        reviewRequired: false,
      },
      warnings: [],
      recommendations: [],
    }),
  } as never,
  {
    preview: (request: Record<string, unknown> = {}) => ({
      source: 'snaps-video-publish-guard',
      durationSeconds: request.durationSeconds || 30,
      targetPlatforms: request.targetPlatforms || ['instagram', 'youtube', 'tiktok'],
      creditBudget: {
        textToImageModel: request.textToImageModel || 'flux-schnell',
        imageToVideoModel: request.imageToVideoModel || 'none',
        imageCredits: 4,
        videoCredits: 0,
        voiceCredits: 0,
        localizedVariantCredits: 0,
        customAssetCredits: 0,
        totalCredits: 4,
        billableOnlyOnSuccess: true,
        rows: [
          {
            id: 'ai-images',
            label: 'AI text-to-image tracks',
            unitCredits: 1,
            quantity: 4,
            totalCredits: 4,
            billable: true,
            note: 'controller smoke',
          },
        ],
      },
      disclosureChecklist: [
        {
          platform: 'youtube',
          labelRequired: true,
          severity: 'required',
          reason: 'controller altered or synthetic smoke',
          operatorAction: 'disclose',
        },
      ],
      localizationPlan: {
        sourceLanguage: 'Korean',
        captionLanguage: 'Korean',
        targetLanguages: ['Korean', 'English'],
        rows: [
          {
            language: 'Korean',
            scriptDirection: 'ltr',
            supported: true,
            voiceoverAction: 'voice',
            captionAction: 'caption',
            reviewAction: 'review',
            warnings: [],
          },
          {
            language: 'English',
            scriptDirection: 'ltr',
            supported: true,
            voiceoverAction: 'voice',
            captionAction: 'caption',
            reviewAction: 'review',
            warnings: [],
          },
        ],
        warnings: [],
        recommendations: [],
      },
      publishReadinessScore: 91,
      warnings: [],
      recommendations: [],
    }),
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
    listItems: async () => [
      {
        id: 'feedback-controller',
        platform: 'threads',
        status: 'unread',
        content: '컨트롤러 피드백',
      },
    ],
    updateItemStatus: async (
      _organizationId: string,
      itemId: string,
      body: Record<string, unknown> = {}
    ) => ({
      updated: true,
      total: 1,
      item: {
        id: itemId,
        status: body.status || 'unresolved',
      },
    }),
    clearItems: async () => ({ deleted: 1 }),
    deleteItem: async (_organizationId: string, itemId: string) => ({
      deleted: true,
      itemId,
    }),
    summarize: async () => ({ total: 1, highlights: [], replySuggestions: [] }),
    previewAssignments: async () => ({
      product: 'snaps',
      source: 'snaps-inbox-assignments',
      generatedAt: new Date(0).toISOString(),
      total: 1,
      lanes: { urgent: 1, high: 0, normal: 0, low: 0 },
      teamLoad: [
        {
          role: 'support',
          label: '고객지원',
          count: 1,
          urgent: 1,
          high: 0,
        },
      ],
      cases: [
        {
          id: 'case-feedback-controller',
          itemId: 'feedback-controller',
          platform: 'threads',
          excerpt: '컨트롤러 피드백',
          sentiment: 'question',
          conversionSignals: [],
          priority: 'urgent',
          assigneeRole: 'support',
          assigneeLabel: '고객지원',
          status: 'new',
          slaMinutes: 30,
          dueAt: new Date(0).toISOString(),
          tags: ['support'],
          noteMatches: [],
          action: '답변 준비',
          rationale: ['긴급 우선순위'],
        },
      ],
      nextActions: ['긴급 케이스를 처리합니다.'],
      automations: ['저장 답변이 매칭된 케이스는 답글 초안으로 이동합니다.'],
      warnings: [],
    }),
    listReplyTemplates: async () => [
      {
        id: 'reply-template-controller',
        title: '컨트롤러 저장 답변',
        body: '컨트롤러 저장 답변 본문',
      },
    ],
    saveReplyTemplate: async (
      _organizationId: string,
      template: Record<string, unknown> = {}
    ) => ({
      saved: true,
      total: 1,
      template: {
        id: 'reply-template-controller',
        title: template.title || '컨트롤러 저장 답변',
        body: template.body || '컨트롤러 저장 답변 본문',
        platform: template.platform,
        sentiment: template.sentiment,
      },
    }),
    deleteReplyTemplate: async (_organizationId: string, templateId: string) => ({
      deleted: true,
      templateId,
    }),
    importReplyTemplates: async (_organizationId: string, templates: unknown[]) => ({
      imported: templates.length,
      total: templates.length,
    }),
    listInboxNotes: async () => [
      {
        id: 'inbox-note-controller',
        author: 'lead-controller',
        note: '컨트롤러 고객 메모',
      },
    ],
    saveInboxNote: async (
      _organizationId: string,
      note: Record<string, unknown> = {}
    ) => ({
      saved: true,
      total: 1,
      note: {
        id: 'inbox-note-controller',
        author: note.author || 'lead-controller',
        postId: note.postId,
        note: note.note || '컨트롤러 고객 메모',
        platform: note.platform,
      },
    }),
    deleteInboxNote: async (_organizationId: string, noteId: string) => ({
      deleted: true,
      noteId,
    }),
    importInboxNotes: async (_organizationId: string, notes: unknown[]) => ({
      imported: notes.length,
      total: notes.length,
    }),
  } as never,
  {
    saveSource: async (_organizationId: string, source: Record<string, unknown> = {}) => ({
      ...source,
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
    prepare: async (_organizationId: string, request: Record<string, unknown>) => ({
      plan: {
        command: String(request.command || ''),
        targetPlatforms: ['threads'],
        includeShortVideo: false,
        marketingStrategy: {
          framework: 'Monetize-Publish-Engage-Create',
          revenueModels: ['CPE'],
        },
      },
      transform: { variants: [] },
      operation: { progress: 90 },
      warnings: [],
    }),
  } as never,
  {
    createFromPrepared: async () => ({ id: 'agent-task-controller' }),
    list: async () => ({ list: [], total: 0 }),
    get: async () => ({ id: 'agent-task-controller' }),
    setFavorite: async () => ({ id: 'agent-task-controller', favorite: true }),
    setRating: async () => ({ id: 'agent-task-controller', rating: 5 }),
    delete: async () => ({ deleted: true }),
    importTasks: async (_organizationId: string, tasks: unknown[]) => ({
      imported: tasks.length,
      total: tasks.length,
    }),
    exportTasks: async () => [],
  } as never,
  {
    preview: (body: { csvText?: string } = {}) => ({
      product: 'snaps',
      source: 'snaps-bulk-csv',
      columns: ['title', 'caption', 'platforms'],
      sampleCsv: 'title,caption,platforms',
      totalRows: 1,
      acceptedRows: 1,
      invalidRows: 0,
      readyToSchedule: 1,
      rows: [
        {
          rowNumber: 2,
          title: 'Bulk row',
          sourceText: body.csvText || 'bulk source row',
          platforms: ['instagram'],
          scheduleType: 'draft',
          tags: ['bulk'],
          warnings: [],
          status: 'ready',
        },
      ],
    }),
    toSourceInputs: (rows: Array<Record<string, unknown>>) =>
      rows.map((row) => ({
        title: row.title,
        sourceText: row.sourceText,
        sourcePlatform: 'bulk-csv',
        tags: ['bulk-csv'],
      })),
    toVariants: (row: Record<string, unknown>) => [
      {
        platform: 'instagram',
        label: 'Instagram',
        title: row.title,
        content: row.sourceText,
        hashtags: ['#bulk'],
        settings: {},
        publishMode: 'schedule',
      },
    ],
  } as never,
  {
    preview: async (body: { feedXml?: string } = {}) => ({
      product: 'snaps',
      source: 'snaps-rss-feed',
      sampleRss: '<rss><channel /></rss>',
      totalItems: 1,
      acceptedItems: 1,
      invalidItems: 0,
      readyToSchedule: 1,
      items: [
        {
          itemIndex: 1,
          title: 'Feed item',
          sourceText: body.feedXml || 'feed source item',
          linkUrl: 'https://example.com/feed',
          platforms: ['threads'],
          tags: ['feed'],
          warnings: [],
          status: 'ready',
        },
      ],
    }),
    toSourceInputs: (items: Array<Record<string, unknown>>) =>
      items.map((item) => ({
        title: item.title,
        sourceText: item.sourceText,
        sourcePlatform: 'rss-feed',
        tags: ['rss-feed'],
      })),
    toVariants: (item: Record<string, unknown>) => [
      {
        platform: 'threads',
        label: 'Threads',
        title: item.title,
        content: item.sourceText,
        hashtags: ['#feed'],
        settings: {},
        publishMode: 'schedule',
      },
    ],
  } as never,
  {
    preview: (body: { sourceText?: string; targetPlatforms?: string[] } = {}) => ({
      product: 'snaps',
      source: 'snaps-carousel-visual',
      template: 'listicle',
      aspectRatio: 'square',
      dimensions: { width: 1080, height: 1080 },
      slideCount: 3,
      title: 'Carousel row',
      captionSeed: 'Carousel row\n\n1. carousel source row\n\n#carousel',
      exportHtml: '<!doctype html><html><body>Carousel row</body></html>',
      warnings: [],
      media: [
        {
          id: 'snaps-carousel-01',
          path: 'data:image/svg+xml;base64,PHN2Zy8+',
          thumbnail: 'data:image/svg+xml;base64,PHN2Zy8+',
          alt: 'Carousel row',
        },
      ],
      slides: [
        {
          slideIndex: 1,
          kind: 'cover',
          eyebrow: 'Listicle',
          title: 'Carousel row',
          body: body.sourceText || 'carousel source row',
          footer: 'snaps carousel',
          visualPrompt: 'Listicle carousel slide',
          svg: '<svg />',
          svgDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
          alt: 'Carousel row',
          warnings: [],
        },
      ],
    }),
    toVariants: (
      preview: { title: string; captionSeed: string; media: unknown[]; slideCount: number },
      targetPlatforms?: string[]
    ) =>
      (targetPlatforms?.length ? targetPlatforms : ['instagram']).map((platform) => ({
        platform,
        label: platform,
        title: preview.title,
        content: preview.captionSeed,
        hashtags: ['#carousel'],
        media: preview.media,
        settings: { __type: platform, carouselSlides: preview.slideCount },
        publishMode: 'schedule',
      })),
  } as never,
  {
    preview: () => ({
      product: 'snaps',
      source: 'snaps-visual-feed-planner',
      platform: 'instagram',
      platformLabel: 'Instagram',
      viewMode: 'square',
      columns: 3,
      totalItems: 1,
      draftItems: 1,
      scheduledItems: 0,
      publishedItems: 0,
      rows: 1,
      aestheticScore: 86,
      warnings: [],
      recommendations: ['Grid balance looks ready for approval or draft queue handoff.'],
      items: [
        {
          id: 'visual-planner-controller',
          order: 0,
          title: 'Visual planner row',
          caption: 'visual planner caption',
          imageUrl: 'https://example.com/feed.png',
          thumbnail: 'https://example.com/feed.png',
          mediaType: 'image',
          status: 'draft',
          row: 1,
          column: 1,
          opacity: 0.62,
          warnings: [],
        },
      ],
    }),
    toVariants: () => [
      {
        platform: 'instagram',
        label: 'Instagram',
        title: 'Visual planner row',
        content: 'visual planner caption',
        hashtags: ['#feed'],
        media: [
          {
            id: 'visual-planner-controller',
            path: 'https://example.com/feed.png',
            thumbnail: 'https://example.com/feed.png',
          },
        ],
        settings: { __type: 'instagram', source: 'snaps-visual-feed-planner' },
        publishMode: 'schedule',
      },
    ],
  } as never,
  {
    preview: () => ({
      product: 'snaps',
      source: 'snaps-first-comment-planner',
      strategy: 'hashtags',
      totalItems: 1,
      supportedItems: 1,
      unsupportedItems: 0,
      supportedPlatforms: ['instagram'],
      unsupportedPlatforms: [],
      warnings: [],
      recommendations: ['First comment ready for draft queue handoff.'],
      items: [
        {
          platform: 'instagram',
          label: 'Instagram',
          title: 'First comment row',
          captionPreview: 'first comment caption',
          firstComment: '#snaps\n\n댓글로 파일럿이라고 남겨주세요.',
          strategy: 'hashtags',
          supported: true,
          characterLimit: 2196,
          hashtagCount: 1,
          warnings: [],
          variant: {
            platform: 'instagram',
            label: 'Instagram',
            title: 'First comment row',
            content: 'first comment caption',
            hashtags: ['#snaps'],
            settings: { __type: 'instagram', post_type: 'post' },
            publishMode: 'schedule',
          },
        },
      ],
    }),
    toVariants: () => [
      {
        platform: 'instagram',
        label: 'Instagram',
        title: 'First comment row',
        content: 'first comment caption',
        hashtags: ['#snaps'],
        settings: {
          __type: 'instagram',
          post_type: 'post',
          firstComment: '#snaps\n\n댓글로 파일럿이라고 남겨주세요.',
        },
        publishMode: 'schedule',
      },
    ],
  } as never,
  {
    preview: () => ({
      product: 'snaps',
      source: 'snaps-hashtag-set',
      title: 'Hashtag set controller',
      description: 'Controller hashtag set',
      topic: 'controller hashtag',
      strategy: 'balanced',
      placement: 'caption',
      reusableText: '댓글로 파일럿이라고 남겨주세요.',
      hashtags: ['#snaps', '#콘텐츠운영', '#파일럿'],
      mentions: [],
      tags: ['controller'],
      targetPlatforms: ['instagram'],
      platformPlans: [
        {
          platform: 'instagram',
          label: 'Instagram',
          hashtagLimit: 5,
          selectedHashtags: ['#snaps', '#콘텐츠운영', '#파일럿'],
          overLimit: 0,
          placementSupported: true,
          status: 'ready',
          warnings: [],
        },
      ],
      warnings: [],
      recommendations: ['Hashtag set ready.'],
    }),
    save: async (_organizationId: string) => ({
      product: 'snaps',
      source: 'snaps-hashtag-set',
      id: 'hashtag-set-controller',
      organizationId: _organizationId,
      title: 'Hashtag set controller',
      description: 'Controller hashtag set',
      topic: 'controller hashtag',
      strategy: 'balanced',
      placement: 'caption',
      reusableText: '댓글로 파일럿이라고 남겨주세요.',
      hashtags: ['#snaps', '#콘텐츠운영', '#파일럿'],
      mentions: [],
      tags: ['controller'],
      targetPlatforms: ['instagram'],
      platformPlans: [],
      warnings: [],
      recommendations: ['Hashtag set ready.'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    list: async () => [
      {
        product: 'snaps',
        source: 'snaps-hashtag-set',
        id: 'hashtag-set-controller',
        organizationId: org.id,
        title: 'Hashtag set controller',
        description: 'Controller hashtag set',
        topic: 'controller hashtag',
        strategy: 'balanced',
        placement: 'caption',
        reusableText: '댓글로 파일럿이라고 남겨주세요.',
        hashtags: ['#snaps', '#콘텐츠운영', '#파일럿'],
        mentions: [],
        tags: ['controller'],
        targetPlatforms: ['instagram'],
        platformPlans: [],
        warnings: [],
        recommendations: ['Hashtag set ready.'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    apply: async (_organizationId: string, setId: string) => ({
      product: 'snaps',
      source: 'snaps-hashtag-set-application',
      set: {
        product: 'snaps',
        source: 'snaps-hashtag-set',
        id: setId,
        organizationId: _organizationId,
        title: 'Hashtag set controller',
        description: 'Controller hashtag set',
        topic: 'controller hashtag',
        strategy: 'balanced',
        placement: 'caption',
        reusableText: '댓글로 파일럿이라고 남겨주세요.',
        hashtags: ['#snaps', '#콘텐츠운영', '#파일럿'],
        mentions: [],
        tags: ['controller'],
        targetPlatforms: ['instagram'],
        platformPlans: [],
        warnings: [],
        recommendations: ['Hashtag set ready.'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      placement: 'caption',
      transform: {
        provider: 'rule-fallback',
        model: 'hashtag-set',
        variants: [
          {
            platform: 'instagram',
            label: 'Instagram',
            title: 'Hashtag set row',
            content: 'hashtag set caption\n\n#snaps #콘텐츠운영 #파일럿',
            hashtags: ['#snaps', '#콘텐츠운영', '#파일럿'],
            settings: {
              __type: 'instagram',
              post_type: 'post',
              hashtagSetId: setId,
            },
            publishMode: 'schedule',
          },
        ],
        warnings: [],
        ragExamplesUsed: [],
      },
      checklist: ['Set: Hashtag set controller'],
      warnings: [],
    }),
    delete: async () => ({ deleted: true, hashtagSets: 0 }),
    importSets: async (_organizationId: string, hashtagSets: unknown[]) => ({
      imported: hashtagSets.length,
      total: hashtagSets.length,
    }),
  } as never,
  {
    preview: () => ({
      product: 'snaps',
      source: 'snaps-hashtag-tracker',
      title: 'Hashtag tracker controller',
      topic: 'controller hashtag',
      goal: 'engagement',
      targetPlatforms: ['instagram', 'x'],
      totalHashtags: 3,
      trackedHashtags: 3,
      bestHashtag: '#snaps',
      averageEngagementRate: 5.8,
      items: [
        {
          hashtag: '#snaps',
          source: 'metric',
          platforms: ['instagram'],
          posts: 7,
          impressions: 11200,
          engagements: 740,
          comments: 44,
          saves: 116,
          clicks: 51,
          engagementRate: 6.61,
          score: 92,
          trend: 'rising',
          action: 'keep',
          reason: 'historical metrics supports keeping it.',
          suggestedPairings: ['#snaps', '#콘텐츠운영'],
        },
      ],
      warnings: [],
      recommendations: ['Keep #snaps for engagement campaigns.'],
    }),
    toHashtagSetInput: () => ({
      title: 'Tracked controller hashtags',
      topic: 'controller hashtag',
      hashtagText: '#snaps #콘텐츠운영',
      hashtags: ['#snaps', '#콘텐츠운영'],
      targetPlatforms: ['instagram'],
      strategy: 'balanced',
      placement: 'caption',
      source: 'snaps-hashtag-tracker',
    }),
  } as never,
  {
    preview: () => ({
      product: 'snaps',
      source: 'snaps-social-listening',
      title: 'Listening controller',
      query: 'snaps OR #콘텐츠자동화',
      campaign: 'controller listening',
      keywords: ['snaps', '#콘텐츠자동화', '가격'],
      excludeKeywords: ['카지노'],
      targetPlatforms: ['instagram', 'threads'],
      totalItems: 2,
      matchedItems: 2,
      highIntentItems: 1,
      noiseItems: 0,
      byPlatform: { instagram: 1, threads: 1 },
      bySentiment: { positive: 0, neutral: 1, negative: 0, mixed: 1 },
      byIntent: {
        lead: 1,
        support: 1,
        complaint: 0,
        collaboration: 0,
        praise: 0,
        competitor: 0,
        spam: 0,
        awareness: 0,
      },
      signals: [
        {
          id: 'pricing',
          label: '가격 문의',
          priority: 'high',
          count: 1,
          examples: ['가격표 받을 수 있나요?'],
          action: '요금 응대 초안을 준비합니다.',
        },
      ],
      clusters: [
        {
          id: 'lead',
          label: '리드/전환',
          count: 1,
          priority: 'high',
          sentiment: 'neutral',
          keywords: ['가격'],
          examples: ['가격표 받을 수 있나요?'],
          action: '받은 반응함으로 승격합니다.',
        },
      ],
      mentions: [
        {
          id: 'mention-controller',
          platform: 'instagram',
          author: '@lead',
          content: 'snaps 가격표 받을 수 있나요?',
          postId: 'ig-listening',
          engagement: 12,
          matchedKeywords: ['snaps', '가격'],
          excludedKeywords: [],
          sentiment: 'neutral',
          intent: 'lead',
          priority: 'high',
          score: 98,
          signals: ['pricing'],
          noise: false,
          recommendedAction: '받은 반응함으로 승격합니다.',
        },
      ],
      warnings: [],
      recommendations: ['High-intent mention을 받은 반응함으로 승격합니다.'],
    }),
    save: async (_organizationId: string) => ({
      product: 'snaps',
      source: 'snaps-social-listening',
      id: 'listening-monitor-controller',
      organizationId: _organizationId,
      title: 'Listening controller',
      query: 'snaps OR #콘텐츠자동화',
      campaign: 'controller listening',
      keywords: ['snaps', '#콘텐츠자동화', '가격'],
      excludeKeywords: ['카지노'],
      targetPlatforms: ['instagram', 'threads'],
      tags: ['controller'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastRun: {
        matchedItems: 2,
        highIntentItems: 1,
        noiseItems: 0,
        signals: [],
        clusters: [],
      },
    }),
    list: async () => [
      {
        product: 'snaps',
        source: 'snaps-social-listening',
        id: 'listening-monitor-controller',
        organizationId: org.id,
        title: 'Listening controller',
        query: 'snaps OR #콘텐츠자동화',
        campaign: 'controller listening',
        keywords: ['snaps', '#콘텐츠자동화', '가격'],
        excludeKeywords: ['카지노'],
        targetPlatforms: ['instagram', 'threads'],
        tags: ['controller'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    run: async (_organizationId: string, monitorId: string) => ({
      product: 'snaps',
      source: 'snaps-social-listening-run',
      monitor: {
        id: monitorId,
        organizationId: _organizationId,
        title: 'Listening controller',
        query: 'snaps OR #콘텐츠자동화',
        keywords: ['snaps', '#콘텐츠자동화', '가격'],
        excludeKeywords: ['카지노'],
        targetPlatforms: ['instagram', 'threads'],
        tags: ['controller'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      preview: {
        product: 'snaps',
        source: 'snaps-social-listening',
        title: 'Listening controller',
        query: 'snaps OR #콘텐츠자동화',
        keywords: ['snaps', '#콘텐츠자동화', '가격'],
        excludeKeywords: ['카지노'],
        targetPlatforms: ['instagram', 'threads'],
        totalItems: 1,
        matchedItems: 1,
        highIntentItems: 1,
        noiseItems: 0,
        byPlatform: { instagram: 1 },
        bySentiment: { positive: 0, neutral: 1, negative: 0, mixed: 0 },
        byIntent: {
          lead: 1,
          support: 0,
          complaint: 0,
          collaboration: 0,
          praise: 0,
          competitor: 0,
          spam: 0,
          awareness: 0,
        },
        signals: [],
        clusters: [],
        mentions: [
          {
            id: 'mention-controller',
            platform: 'instagram',
            content: 'snaps 가격표 받을 수 있나요?',
            engagement: 12,
            matchedKeywords: ['snaps', '가격'],
            excludedKeywords: [],
            sentiment: 'neutral',
            intent: 'lead',
            priority: 'high',
            score: 98,
            signals: ['pricing'],
            noise: false,
            recommendedAction: '받은 반응함으로 승격합니다.',
          },
        ],
        warnings: [],
        recommendations: [],
      },
    }),
    toInboxImport: () => ({
      items: [
        {
          platform: 'instagram',
          content: 'snaps 가격표 받을 수 있나요?',
          postId: 'ig-listening',
        },
      ],
    }),
    delete: async () => ({ deleted: true, monitors: 0 }),
    importMonitors: async (_organizationId: string, monitors: unknown[]) => ({
      imported: monitors.length,
      total: monitors.length,
    }),
  } as never,
  {
    preview: () => ({
      product: 'snaps',
      source: 'snaps-trend-radar',
      title: 'Trend controller',
      industry: 'B2B 콘텐츠 자동화',
      region: 'KR',
      windowDays: 7,
      targetPlatforms: ['instagram', 'threads'],
      totalSignals: 3,
      totalTrends: 2,
      trendingNow: ['#콘텐츠자동화', '가격 문의'],
      trends: [
        {
          id: '콘텐츠자동화',
          topic: '#콘텐츠자동화',
          category: 'hashtag',
          stage: 'accelerating',
          score: 91,
          velocity: 120,
          volume: 42,
          previousVolume: 13,
          engagement: 760,
          engagementRate: 1810,
          shareOfVoice: 66,
          sentiment: 'positive',
          confidence: 88,
          keywords: ['#콘텐츠자동화'],
          platforms: ['instagram'],
          competitorLead: 'Rival Studio',
          evidence: [],
          creativeAngles: ['급상승 근거를 보여줍니다.'],
          recommendedFormats: ['reels'],
          action: '오늘 반응형 게시물로 전환합니다.',
        },
      ],
      clusters: [],
      alerts: [
        {
          id: '콘텐츠자동화-spike',
          severity: 'high',
          title: '#콘텐츠자동화 급상승',
          detail: 'velocity spike',
          action: '오늘 대응합니다.',
        },
      ],
      contentIdeas: [
        {
          id: 'trend-idea-controller',
          trendId: '콘텐츠자동화',
          platform: 'instagram',
          format: 'reels',
          hook: '#콘텐츠자동화 지금 따라가도 될까?',
          captionBrief: '트렌드를 릴스로 바꿉니다.',
          cta: '저장하세요.',
          sourceText: 'Trend: #콘텐츠자동화',
          score: 90,
        },
      ],
      recommendations: ['오늘 대응합니다.'],
      warnings: [],
    }),
    toSourceInputs: (preview: Record<string, unknown>) =>
      ((preview.contentIdeas as Array<Record<string, unknown>>) || []).map((idea) => ({
        title: idea.hook,
        sourceText: idea.sourceText,
        sourcePlatform: 'trend-radar',
        tags: ['trend-radar'],
      })),
  } as never,
  {
    preview: () => ({
      product: 'snaps',
      source: 'snaps-post-preview-inspector',
      device: 'desktop',
      totalCards: 2,
      needsRewrite: 1,
      averageAccessibilityScore: 86,
      cards: [
        {
          platform: 'instagram',
          label: 'Instagram',
          feedPreview: '가격표와 데모 링크 받을 수 있나요?... 더보기',
          characterCount: 160,
          characterLimit: 2200,
          feedCutoff: 125,
          hiddenCharacters: 35,
          hardLimitExceeded: false,
          accessibilityScore: 86,
          warnings: ['35 characters fall after the likely feed "see more" cut.'],
          recommendations: ['Move the strongest hook before the feed cutoff.'],
        },
      ],
      warnings: ['Instagram: 35 characters fall after the likely feed "see more" cut.'],
      recommendations: ['No hard platform character limits are exceeded.'],
    }),
  } as never,
  {
    preview: (body: { sourceText?: string } = {}) => ({
      product: 'snaps',
      source: 'snaps-evergreen-recycle',
      title: 'Recycle row',
      category: 'evergreen',
      cadence: 'weekly',
      repeatCount: 2,
      sampleSource: 'sample recycle source',
      totalItems: 2,
      acceptedItems: 2,
      invalidItems: 0,
      readyToSchedule: 2,
      warnings: [],
      items: [
        {
          itemIndex: 1,
          title: 'Recycle row · 문제 재조명',
          sourceText: body.sourceText || 'recycle source item',
          angle: '문제 재조명',
          category: 'evergreen',
          cadence: 'weekly',
          platforms: ['threads'],
          tags: ['evergreen'],
          warnings: [],
          status: 'ready',
        },
      ],
    }),
    toSourceInputs: (items: Array<Record<string, unknown>>) =>
      items.map((item) => ({
        title: item.title,
        sourceText: item.sourceText,
        sourcePlatform: 'evergreen-recycle',
        tags: ['evergreen-recycle'],
      })),
    toVariants: (item: Record<string, unknown>) => [
      {
        platform: 'threads',
        label: 'Threads',
        title: item.title,
        content: item.sourceText,
        hashtags: ['#evergreen'],
        settings: { __type: 'threads', source: 'snaps-evergreen-recycle' },
        publishMode: 'schedule',
      },
    ],
  } as never,
  {
    preview: (body: { sourceText?: string } = {}) => ({
      product: 'snaps',
      source: 'snaps-recurring-posts',
      title: 'Recurring row',
      cadence: 'weekly',
      intervalDays: 7,
      repeatCount: 2,
      variationMode: 'angle-rotation',
      sampleSource: 'sample recurring source',
      totalItems: 2,
      acceptedItems: 2,
      invalidItems: 0,
      readyToSchedule: 2,
      warnings: [],
      items: [
        {
          itemIndex: 1,
          title: 'Recurring row · R1',
          sourceText: body.sourceText || 'recurring source item',
          cadence: 'weekly',
          intervalDays: 7,
          publishDate: new Date(0).toISOString(),
          localTime: '10:00',
          variation: 'problem-reminder',
          cta: 'CTA',
          platforms: ['threads'],
          tags: ['recurring'],
          warnings: [],
          status: 'ready',
        },
      ],
    }),
    toSourceInputs: (items: Array<Record<string, unknown>>) =>
      items.map((item) => ({
        title: item.title,
        sourceText: item.sourceText,
        sourcePlatform: 'recurring-posts',
        tags: ['recurring-posts'],
      })),
    toVariants: (item: Record<string, unknown>) => [
      {
        platform: 'threads',
        label: 'Threads',
        title: item.title,
        content: item.sourceText,
        hashtags: ['#recurring'],
        settings: { __type: 'threads', source: 'snaps-recurring-posts' },
        publishMode: 'schedule',
      },
    ],
  } as never,
  {
    preview: (body: { sourceText?: string } = {}) => ({
      product: 'snaps',
      source: 'snaps-repurpose-queue',
      workflowMode: 'schedule',
      contentFilter: 'all-content',
      pollIntervalHours: 2,
      checkNowAvailable: true,
      timezone: 'Asia/Seoul',
      sampleSource: 'sample repurpose source',
      totalItems: 2,
      acceptedItems: 2,
      ignoredItems: 0,
      invalidItems: 0,
      readyToSchedule: 1,
      scheduleSlots: [
        {
          id: 'slot-1',
          label: 'Authority',
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '10:00',
          timezone: 'Asia/Seoul',
          nextOccurrenceAt: new Date(0).toISOString(),
          occupied: false,
        },
      ],
      items: [
        {
          itemIndex: 1,
          title: 'Repurpose row',
          sourcePlatform: 'youtube',
          sourceUrl: 'https://example.com/video',
          sourceText: body.sourceText || 'repurpose source item',
          detectedAt: new Date(0).toISOString(),
          contentScope: 'future',
          workflowMode: 'schedule',
          contentFilter: 'all-content',
          targetPlatforms: ['threads'],
          publishDate: new Date(0).toISOString(),
          assignedSlot: {
            id: 'slot-1',
            label: 'Authority',
            dayOfWeek: 1,
            startTime: '09:00',
            endTime: '10:00',
            timezone: 'Asia/Seoul',
            nextOccurrenceAt: new Date(0).toISOString(),
            occupied: false,
          },
          action: 'fill-next-plan-slot',
          tags: ['repurpose'],
          warnings: [],
          status: 'ready',
        },
      ],
      warnings: [],
      recommendations: ['Use Check Now after source publish.'],
    }),
    toSourceInputs: (items: Array<Record<string, unknown>>) =>
      items.map((item) => ({
        title: item.title,
        sourceText: item.sourceText,
        sourcePlatform: 'repurpose-queue',
        tags: ['repurpose-queue'],
      })),
    toVariants: (item: Record<string, unknown>) => [
      {
        platform: 'threads',
        label: 'Threads',
        title: item.title,
        content: item.sourceText,
        hashtags: ['#repurpose'],
        settings: { __type: 'threads', source: 'snaps-repurpose-queue' },
        publishMode: 'schedule',
      },
    ],
  } as never,
  new SnapsAdDisclosureGuardService() as never,
  {
    submit: async (_organizationId: string, body: Record<string, unknown> = {}) => ({
      id: 'approval-controller',
      title: body.title || 'Approval controller',
      status: 'pending',
      reviewer: body.reviewer || 'client@example.com',
      variants: Array.isArray(body.variants) ? body.variants : [],
      history: [{ action: 'submitted', status: 'pending' }],
      comments: [],
      scheduleType: body.scheduleType || 'draft',
      source: 'snaps-approval-workflow',
    }),
    list: async () => [
      {
        id: 'approval-controller',
        title: 'Approval controller',
        status: 'approved',
        reviewer: 'client@example.com',
        variants: [
          {
            platform: 'threads',
            label: 'Threads',
            content: 'approved approval variant',
            hashtags: ['#snaps'],
            settings: {},
            publishMode: 'schedule',
          },
        ],
        history: [{ action: 'approve', status: 'approved' }],
        comments: [],
        scheduleType: 'draft',
        source: 'snaps-approval-workflow',
      },
    ],
    get: async () => ({
      id: 'approval-controller',
      title: 'Approval controller',
      status: 'approved',
      reviewer: 'client@example.com',
      variants: [
        {
          platform: 'threads',
          label: 'Threads',
          content: 'approved approval variant',
          hashtags: ['#snaps'],
          settings: {},
          publishMode: 'schedule',
        },
      ],
      history: [{ action: 'approve', status: 'approved' }],
      comments: [],
      scheduleType: 'draft',
      source: 'snaps-approval-workflow',
    }),
    review: async (_organizationId: string, approvalId: string) => ({
      id: approvalId,
      title: 'Approval controller',
      status: 'approved',
      reviewer: 'client@example.com',
      variants: [],
      history: [{ action: 'approve', status: 'approved' }],
      comments: [],
      scheduleType: 'draft',
      source: 'snaps-approval-workflow',
    }),
    createPublicReviewLink: async (_organizationId: string, approvalId: string) => ({
      product: 'snaps',
      source: 'snaps-approval-public-link',
      token: 'public-review-controller-token',
      publicReviewPath:
        '/snaps/review/controller-org/public-review-controller-token',
      publicReviewUrl:
        'http://localhost:4200/snaps/review/controller-org/public-review-controller-token',
      publicApiPath:
        '/public/snaps/review/controller-org/public-review-controller-token',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      allowDecision: true,
      approval: {
        id: approvalId,
        title: 'Approval controller',
        status: 'pending',
        reviewer: 'client@example.com',
        variants: [],
        history: [{ action: 'public-review-shared', status: 'pending' }],
        comments: [],
        scheduleType: 'draft',
        source: 'snaps-approval-workflow',
        publicReviewUrl:
          'http://localhost:4200/snaps/review/controller-org/public-review-controller-token',
      },
    }),
    addComment: async (_organizationId: string, approvalId: string) => ({
      comment: {
        id: 'approval-comment-controller',
        actor: 'client@example.com',
        message: 'CTA를 더 구체적으로 바꾸면 좋겠습니다.',
        visibility: 'reviewer',
        resolved: false,
        createdAt: new Date().toISOString(),
      },
      approval: {
        id: approvalId,
        title: 'Approval controller',
        status: 'approved',
        reviewer: 'client@example.com',
        variants: [],
        history: [{ action: 'commented', status: 'approved' }],
        comments: [
          {
            id: 'approval-comment-controller',
            actor: 'client@example.com',
            message: 'CTA를 더 구체적으로 바꾸면 좋겠습니다.',
            visibility: 'reviewer',
            resolved: false,
            createdAt: new Date().toISOString(),
          },
        ],
        scheduleType: 'draft',
        source: 'snaps-approval-workflow',
      },
    }),
    resolveComment: async (
      _organizationId: string,
      approvalId: string,
      commentId: string
    ) => ({
      comment: {
        id: commentId,
        actor: 'client@example.com',
        message: 'CTA를 더 구체적으로 바꾸면 좋겠습니다.',
        visibility: 'reviewer',
        resolved: true,
        createdAt: new Date().toISOString(),
        resolvedAt: new Date().toISOString(),
      },
      approval: {
        id: approvalId,
        title: 'Approval controller',
        status: 'approved',
        reviewer: 'client@example.com',
        variants: [],
        history: [{ action: 'comment-resolved', status: 'approved' }],
        comments: [
          {
            id: commentId,
            actor: 'client@example.com',
            message: 'CTA를 더 구체적으로 바꾸면 좋겠습니다.',
            visibility: 'reviewer',
            resolved: true,
            createdAt: new Date().toISOString(),
            resolvedAt: new Date().toISOString(),
          },
        ],
        scheduleType: 'draft',
        source: 'snaps-approval-workflow',
      },
    }),
    markScheduled: async (_organizationId: string, approvalId: string) => ({
      id: approvalId,
      title: 'Approval controller',
      status: 'scheduled',
      reviewer: 'client@example.com',
      variants: [],
      history: [{ action: 'scheduled', status: 'scheduled' }],
      comments: [],
      scheduleType: 'draft',
      source: 'snaps-approval-workflow',
    }),
    delete: async () => ({ deleted: true, approvals: 0 }),
    exportApprovals: async () => [],
    importApprovals: async (_organizationId: string, approvals: unknown[]) => ({
      imported: approvals.length,
      total: approvals.length,
    }),
  } as never,
  {
    score: (body: Record<string, unknown> = {}) => ({
      product: 'snaps',
      source: 'snaps-viral-ai-coach',
      platform: body.platform || 'instagram',
      platformLabel: 'Instagram',
      score: 82,
      grade: 'ready',
      summary: '컨트롤러 코치 scorecard',
      categories: [
        {
          id: 'opening-hook',
          label: '오프닝 훅',
          score: 82,
          maxScore: 100,
          status: 'strong',
          feedback: '훅이 선명합니다.',
          checks: ['첫 줄이 선명합니다.'],
        },
      ],
      recommendations: ['첫 3초 훅을 더 선명하게 유지'],
      suggestedHooks: ['이 10초만 바꾸면 반응이 달라집니다.'],
      hashtagPlan: {
        broad: ['#콘텐츠'],
        niche: ['#SNS운영'],
        final: ['#콘텐츠', '#SNS운영'],
        limit: 5,
      },
      rewrite: {
        openingLine: '이 10초만 바꾸면 반응이 달라집니다.',
        caption: '이 10초만 바꾸면 반응이 달라집니다.\n\n컨트롤러 코치 본문',
      },
      warnings: [],
    }),
  } as never,
  {
    preview: async (body: Record<string, unknown> = {}) => ({
      product: 'snaps',
      source: 'snaps-source-resolver',
      sourceType: body.query ? 'research' : body.url ? 'article' : 'text',
      status: 'ready',
      title: body.query || body.title || 'Resolved source controller',
      sourceText:
        body.text ||
        body.query ||
        'Resolved source controller body with enough text for import.',
      sourceUrl: body.url,
      sourcePlatform: body.query ? 'ai-research' : 'source-text',
      topic: body.query || 'Resolved source controller',
      tone: body.defaultTone,
      tags: ['resolver'],
      wordCount: 8,
      metadata: { extractionMode: body.query ? 'research' : 'text' },
      sourceInput: {
        title: body.query || 'Resolved source controller',
        sourceText:
          body.text ||
          body.query ||
          'Resolved source controller body with enough text for import.',
        sourcePlatform: body.query ? 'ai-research' : 'source-text',
        topic: body.query || 'Resolved source controller',
        tags: ['resolver'],
      },
      warnings: [],
    }),
  } as never,
  {
    preview: (body: Record<string, unknown> = {}) => ({
      product: 'snaps',
      source: 'snaps-content-calendar',
      title: body.title || 'Calendar controller',
      campaign: body.campaign || 'Calendar campaign',
      cadence: body.cadence || 'weekdays',
      startDate: '2026-06-01T00:30:00.000Z',
      days: Number(body.days || 7),
      postsPerDay: Number(body.postsPerDay || 1),
      sampleBrief: 'calendar sample brief',
      totalItems: 1,
      acceptedItems: 1,
      invalidItems: 0,
      readyToSchedule: 1,
      warnings: [],
      items: [
        {
          itemIndex: 1,
          dayIndex: 1,
          publishDate: '2026-06-01T00:30:00.000Z',
          localTime: '09:30',
          title: 'Calendar controller · 교육 · Threads',
          sourceText: body.sourceText || 'calendar controller source item',
          platform: 'threads',
          platformLabel: 'Threads',
          pillar: '교육',
          goal: 'save',
          format: 'text',
          angle: '교육 체크리스트',
          hook: '교육 체크리스트를 바로 써먹는 방법',
          cta: '저장해두세요.',
          hashtags: ['#calendar'],
          warnings: [],
          status: 'ready',
        },
      ],
    }),
    toSourceInputs: (items: Array<Record<string, unknown>>) =>
      items.map((item) => ({
        title: item.title,
        sourceText: item.sourceText,
        sourcePlatform: 'content-calendar',
        tags: ['content-calendar'],
      })),
    toVariants: (item: Record<string, unknown>) => [
      {
        platform: item.platform || 'threads',
        label: 'Threads',
        title: item.title,
        content: item.sourceText,
        hashtags: ['#calendar'],
        settings: { source: 'snaps-content-calendar' },
        publishMode: 'schedule',
      },
    ],
  } as never,
  {
    preview: (body: Record<string, unknown> = {}) => ({
      product: 'snaps',
      source: 'snaps-content-categories',
      title: body.title || 'Category controller',
      campaign: body.campaign || 'Category campaign',
      startDate: '2026-06-01T00:30:00.000Z',
      days: Number(body.days || 7),
      postsPerDay: Number(body.postsPerDay || 1),
      sampleCategories: '교육|evergreen|#12b8b8|교육 글|2',
      totalItems: 1,
      acceptedItems: 1,
      invalidItems: 0,
      readyToSchedule: 1,
      categories: [
        {
          categoryIndex: 1,
          name: '교육',
          description: '교육 글',
          color: '#12b8b8',
          shareMode: 'evergreen',
          insertMode: 'bottom',
          randomize: false,
          weight: 2,
          warnings: [],
          status: 'ready',
        },
      ],
      categoryMix: [
        {
          name: '교육',
          count: 1,
          shareMode: 'evergreen',
          color: '#12b8b8',
        },
      ],
      warnings: [],
      items: [
        {
          itemIndex: 1,
          queueOrder: 1,
          categoryName: '교육',
          categoryColor: '#12b8b8',
          shareMode: 'evergreen',
          insertMode: 'bottom',
          platform: 'threads',
          platformLabel: 'Threads',
          publishDate: '2026-06-01T00:30:00.000Z',
          localTime: '09:30',
          title: 'Category controller · 교육',
          sourceText: body.sourceText || 'category controller source item',
          angle: '교육 체크리스트',
          cta: '저장해두세요.',
          hashtags: ['#category'],
          warnings: [],
          status: 'ready',
        },
      ],
    }),
    toSourceInputs: (items: Array<Record<string, unknown>>) =>
      items.map((item) => ({
        title: item.title,
        sourceText: item.sourceText,
        sourcePlatform: 'content-categories',
        tags: ['content-categories'],
      })),
    toVariants: (item: Record<string, unknown>) => [
      {
        platform: item.platform || 'threads',
        label: 'Threads',
        title: item.title,
        content: item.sourceText,
        hashtags: ['#category'],
        settings: { source: 'snaps-content-categories' },
        publishMode: 'schedule',
      },
    ],
  } as never,
  {
    preview: (body: Record<string, unknown> = {}) => ({
      product: 'snaps',
      source: 'snaps-post-condition',
      conditionType: body.conditionType || 'likes',
      status: 'ready',
      triggerMet: true,
      conditionSummary: 'likes 120 / 50: ready',
      metricValue: 120,
      threshold: Number(body.threshold || 50),
      delayMinutes: Number(body.delayMinutes || 45),
      recommendedPublishDate: '2026-06-01T01:15:00.000Z',
      metrics: {
        likes: 120,
        retweets: 8,
        comments: 18,
        impressions: 4200,
        engagementRate: 4.2,
      },
      baseline: {
        averageImpressions: 3000,
        averageEngagementRate: 3.1,
      },
      warnings: [],
      item: {
        title: body.followUpTitle || 'Conditional follow-up controller',
        sourceText: body.followUpText || 'conditional follow-up source',
        parentTitle: body.parentTitle || 'Parent post',
        parentPlatform: body.parentPlatform || 'threads',
        conditionType: body.conditionType || 'likes',
        conditionSummary: 'likes 120 / 50: ready',
        triggerMet: true,
        recommendedPublishDate: '2026-06-01T01:15:00.000Z',
        platforms: ['threads'],
        cta: body.cta || 'CTA',
        tags: ['condition'],
        warnings: [],
        status: 'ready',
      },
    }),
    toSourceInput: (item: Record<string, unknown>) => ({
      title: item.title,
      sourceText: item.sourceText,
      sourcePlatform: 'post-condition',
      tags: ['post-condition'],
    }),
    toVariants: (item: Record<string, unknown>) => [
      {
        platform: 'threads',
        label: 'Threads',
        title: item.title,
        content: item.sourceText,
        hashtags: ['#condition'],
        settings: { source: 'snaps-post-condition' },
        publishMode: 'schedule',
      },
    ],
  } as never,
  {
    generate: (body: Record<string, unknown> = {}) => ({
      product: 'snaps',
      source: 'snaps-idea-board',
      topic: body.topic || 'Idea controller',
      audience: body.audience || 'B2B marketers',
      goal: body.goal || 'More comments',
      totalIdeas: 1,
      warnings: [],
      samplePrompt: 'idea sample prompt',
      ideas: [
        {
          title: 'Idea controller',
          body: 'Hook: idea controller body',
          group: 'This week',
          tags: ['idea', 'controller'],
          targetPlatforms: ['threads'],
          priority: 'high',
          angle: 'checklist',
          format: 'text-post',
          cta: 'CTA',
        },
      ],
    }),
    save: async (_organizationId: string, body: Record<string, unknown> = {}) => ({
      id: 'idea-controller',
      organizationId: _organizationId,
      title: body.title || 'Idea controller',
      body: body.body || 'Hook: idea controller body',
      group: body.group || 'This week',
      status: body.status || 'inbox',
      tags: Array.isArray(body.tags) ? body.tags : ['idea'],
      mediaUrls: [],
      targetPlatforms: Array.isArray(body.targetPlatforms)
        ? body.targetPlatforms
        : ['threads'],
      priority: body.priority || 'high',
      source: 'snaps-idea-board',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    list: async () => [
      {
        id: 'idea-controller',
        organizationId: org.id,
        title: 'Idea controller',
        body: 'Hook: idea controller body',
        group: 'This week',
        status: 'inbox',
        tags: ['idea'],
        mediaUrls: [],
        targetPlatforms: ['threads'],
        priority: 'high',
        source: 'snaps-idea-board',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    get: async () => ({
      id: 'idea-controller',
      organizationId: org.id,
      title: 'Idea controller',
      body: 'Hook: idea controller body',
      group: 'This week',
      status: 'planned',
      tags: ['idea'],
      mediaUrls: [],
      targetPlatforms: ['threads'],
      priority: 'high',
      source: 'snaps-idea-board',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    updateStatus: async (
      _organizationId: string,
      ideaId: string,
      body: Record<string, unknown> = {}
    ) => ({
      updated: true,
      idea: {
        id: ideaId,
        organizationId: _organizationId,
        title: 'Idea controller',
        body: 'Hook: idea controller body',
        group: body.group || 'This week',
        status: body.status || 'planned',
        tags: ['idea'],
        mediaUrls: [],
        targetPlatforms: ['threads'],
        priority: 'high',
        source: 'snaps-idea-board',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }),
    markPromoted: async (_organizationId: string, ideaId: string) => ({
      id: ideaId,
      organizationId: _organizationId,
      title: 'Idea controller',
      body: 'Hook: idea controller body',
      group: 'This week',
      status: 'drafted',
      tags: ['idea'],
      mediaUrls: [],
      targetPlatforms: ['threads'],
      priority: 'high',
      source: 'snaps-idea-board',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      promotedAt: new Date().toISOString(),
    }),
    delete: async () => ({ deleted: true, ideas: 0 }),
    importIdeas: async (_organizationId: string, ideas: unknown[]) => ({
      imported: ideas.length,
      total: ideas.length,
    }),
    toSourceInput: (idea: Record<string, unknown>) => ({
      title: idea.title,
      sourceText: idea.body,
      sourcePlatform: 'idea-board',
      topic: idea.group,
      tags: ['idea-board'],
    }),
  } as never,
  {
    analyze: (body: Record<string, unknown> = {}) => ({
      product: 'snaps',
      source: 'snaps-brand-kit',
      name: body.name || 'Brand kit controller',
      audience: body.audience || 'B2B marketers',
      voice: body.voice || 'Clear expert',
      tone: body.tone || 'Practical and concise',
      values: ['clarity'],
      bannedTerms: ['perfect'],
      requiredTerms: ['snaps'],
      hashtags: ['#snaps'],
      cta: body.cta || 'Try the pilot',
      colors: ['#12b8b8'],
      targetPlatforms: ['threads'],
      examples: ['example post'],
      promptGuidance: 'Brand: Brand kit controller',
      warnings: [],
    }),
    save: async (_organizationId: string, body: Record<string, unknown> = {}) => ({
      product: 'snaps',
      source: 'snaps-brand-kit',
      id: 'brand-kit-controller',
      organizationId: _organizationId,
      name: body.name || 'Brand kit controller',
      audience: body.audience || 'B2B marketers',
      voice: body.voice || 'Clear expert',
      tone: body.tone || 'Practical and concise',
      values: ['clarity'],
      bannedTerms: ['perfect'],
      requiredTerms: ['snaps'],
      hashtags: ['#snaps'],
      cta: body.cta || 'Try the pilot',
      colors: ['#12b8b8'],
      targetPlatforms: ['threads'],
      examples: ['example post'],
      promptGuidance: 'Brand: Brand kit controller',
      warnings: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    list: async () => [
      {
        product: 'snaps',
        source: 'snaps-brand-kit',
        id: 'brand-kit-controller',
        organizationId: org.id,
        name: 'Brand kit controller',
        audience: 'B2B marketers',
        voice: 'Clear expert',
        tone: 'Practical and concise',
        values: ['clarity'],
        bannedTerms: ['perfect'],
        requiredTerms: ['snaps'],
        hashtags: ['#snaps'],
        cta: 'Try the pilot',
        colors: ['#12b8b8'],
        targetPlatforms: ['threads'],
        examples: ['example post'],
        promptGuidance: 'Brand: Brand kit controller',
        warnings: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    apply: async (_organizationId: string, brandKitId: string) => ({
      product: 'snaps',
      source: 'snaps-brand-kit-application',
      brandKit: {
        id: brandKitId,
        organizationId: _organizationId,
        name: 'Brand kit controller',
        audience: 'B2B marketers',
        voice: 'Clear expert',
        tone: 'Practical and concise',
        values: ['clarity'],
        bannedTerms: ['perfect'],
        requiredTerms: ['snaps'],
        hashtags: ['#snaps'],
        cta: 'Try the pilot',
        colors: ['#12b8b8'],
        targetPlatforms: ['threads'],
        examples: ['example post'],
        promptGuidance: 'Brand: Brand kit controller',
        warnings: [],
        product: 'snaps',
        source: 'snaps-brand-kit',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      transformPatch: {
        tone: 'Clear expert / Practical and concise',
        topic: 'clarity',
        targetPlatforms: ['threads'],
      },
      promptPrefix: 'Brand: Brand kit controller',
      complianceChecklist: ['Voice: Clear expert'],
      hashtagAppend: ['#snaps'],
      warnings: [],
    }),
    delete: async () => ({ deleted: true, brandKits: 0 }),
    importBrandKits: async (_organizationId: string, brandKits: unknown[]) => ({
      imported: brandKits.length,
      total: brandKits.length,
    }),
  } as never,
  {
    preview: (body: Record<string, unknown> = {}) => ({
      product: 'snaps',
      source: 'snaps-media-library',
      title: body.title || 'Media asset controller',
      url: body.url || 'https://example.com/media.png',
      thumbnail: body.thumbnail || 'https://example.com/media-thumb.png',
      mediaType: body.mediaType || 'image',
      altText: body.altText || 'Controller media alt text',
      caption: body.caption || 'Controller media caption',
      campaign: body.campaign || 'Controller campaign',
      tags: ['media', 'controller'],
      targetPlatforms: ['instagram'],
      width: 1080,
      height: 1350,
      platformFit: [
        {
          platform: 'instagram',
          label: 'Instagram',
          status: 'ready',
          recommendation: 'Ready for Instagram',
          warnings: [],
        },
      ],
      warnings: [],
    }),
    save: async (_organizationId: string, body: Record<string, unknown> = {}) => ({
      product: 'snaps',
      source: 'snaps-media-library',
      id: 'media-asset-controller',
      organizationId: _organizationId,
      title: body.title || 'Media asset controller',
      url: body.url || 'https://example.com/media.png',
      thumbnail: body.thumbnail || 'https://example.com/media-thumb.png',
      mediaType: body.mediaType || 'image',
      altText: body.altText || 'Controller media alt text',
      caption: body.caption || 'Controller media caption',
      campaign: body.campaign || 'Controller campaign',
      tags: ['media', 'controller'],
      targetPlatforms: ['instagram'],
      width: 1080,
      height: 1350,
      platformFit: [
        {
          platform: 'instagram',
          label: 'Instagram',
          status: 'ready',
          recommendation: 'Ready for Instagram',
          warnings: [],
        },
      ],
      warnings: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    list: async () => [
      {
        product: 'snaps',
        source: 'snaps-media-library',
        id: 'media-asset-controller',
        organizationId: org.id,
        title: 'Media asset controller',
        url: 'https://example.com/media.png',
        thumbnail: 'https://example.com/media-thumb.png',
        mediaType: 'image',
        altText: 'Controller media alt text',
        caption: 'Controller media caption',
        campaign: 'Controller campaign',
        tags: ['media', 'controller'],
        targetPlatforms: ['instagram'],
        width: 1080,
        height: 1350,
        platformFit: [
          {
            platform: 'instagram',
            label: 'Instagram',
            status: 'ready',
            recommendation: 'Ready for Instagram',
            warnings: [],
          },
        ],
        warnings: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    attach: async (_organizationId: string, assetId: string) => ({
      product: 'snaps',
      source: 'snaps-media-library-attach',
      asset: {
        id: assetId,
        organizationId: _organizationId,
        product: 'snaps',
        source: 'snaps-media-library',
        title: 'Media asset controller',
        url: 'https://example.com/media.png',
        thumbnail: 'https://example.com/media-thumb.png',
        mediaType: 'image',
        altText: 'Controller media alt text',
        caption: 'Controller media caption',
        campaign: 'Controller campaign',
        tags: ['media', 'controller'],
        targetPlatforms: ['instagram'],
        width: 1080,
        height: 1350,
        platformFit: [],
        warnings: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      transform: {
        provider: 'rule-fallback',
        model: 'media-library',
        variants: [
          {
            platform: 'instagram',
            label: 'Instagram media post',
            title: 'Media asset controller',
            content: 'Controller media caption',
            hashtags: ['#media'],
            media: [
              {
                id: assetId,
                path: 'https://example.com/media.png',
                thumbnail: 'https://example.com/media-thumb.png',
                alt: 'Controller media alt text',
              },
            ],
            settings: {},
            publishMode: 'schedule',
          },
        ],
        warnings: [],
        ragExamplesUsed: [],
      },
      checklist: ['Asset: Media asset controller'],
      warnings: [],
    }),
    delete: async () => ({ deleted: true, mediaAssets: 0 }),
    importAssets: async (_organizationId: string, mediaAssets: unknown[]) => ({
      imported: mediaAssets.length,
      total: mediaAssets.length,
    }),
  } as never,
  {
    preview: () => ({
      product: 'snaps',
      source: 'snaps-creative-brief',
      mediaType: 'image',
      aspectRatio: 'portrait',
      dimensions: { width: 1080, height: 1350 },
      title: 'Creative brief controller',
      topic: 'controller creative',
      campaign: 'Controller campaign',
      visualStyle: 'clean Korean SaaS editorial layout',
      targetPlatforms: ['instagram'],
      items: [
        {
          id: 'creative-hero',
          angle: 'hero',
          mediaType: 'image',
          aspectRatio: 'portrait',
          dimensions: { width: 1080, height: 1350 },
          title: 'Creative brief controller hero',
          overlayText: 'Creative brief controller',
          prompt: 'clean SaaS creative prompt',
          altText: 'Creative brief controller alt text',
          captionSeed: 'Creative brief caption',
          productionNotes: ['Lock the canvas to portrait before designing.'],
          storyboard: ['Main image: Creative brief controller'],
          referenceUrls: [],
          svgDataUrl: 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E',
          warnings: [],
        },
      ],
      checklist: ['Create a image design at 1080x1350.'],
      warnings: [],
    }),
    toMediaAssetInput: () => ({
      title: 'Creative brief controller hero',
      url: 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E',
      thumbnail: 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E',
      mediaType: 'image',
      altText: 'Creative brief controller alt text',
      caption: 'Creative brief caption',
      campaign: 'Controller campaign',
      tags: ['creative-brief'],
      targetPlatforms: ['instagram'],
      width: 1080,
      height: 1350,
      source: 'snaps-creative-brief',
    }),
  } as never,
  {
    preview: (body: Record<string, unknown> = {}) => ({
      product: 'snaps',
      source: 'snaps-post-variation-lab',
      title: body.title || 'Variation controller',
      topic: body.topic || 'variation',
      goal: body.goal || 'engagement',
      winningMetric: 'engagement rate',
      variantCount: 2,
      platforms: ['threads'],
      totalVariants: 2,
      winningVariantId: 'variation-controller-1',
      recommendations: ['Start with Threads variation #1.'],
      warnings: [],
      items: [
        {
          id: 'variation-controller-1',
          rank: 1,
          variationIndex: 1,
          platform: 'threads',
          platformLabel: 'Threads',
          title: 'Variation controller winner',
          angle: '문제 인식',
          hook: '이 훅부터 테스트하세요.',
          caption: body.sourceText || 'variation caption',
          cta: '댓글로 실험이라고 남겨주세요.',
          hashtags: ['#variation'],
          hypothesis: 'This hook should improve engagement.',
          expectedMetric: 'engagement rate',
          score: 88,
          scoreBreakdown: {
            hook: 90,
            clarity: 85,
            specificity: 80,
            cta: 92,
            novelty: 86,
          },
          status: 'winner',
          warnings: [],
        },
        {
          id: 'variation-controller-2',
          rank: 2,
          variationIndex: 2,
          platform: 'threads',
          platformLabel: 'Threads',
          title: 'Variation controller ready',
          angle: '체크리스트',
          hook: '체크리스트로 바꾸세요.',
          caption: body.sourceText || 'variation caption 2',
          cta: '저장해두세요.',
          hashtags: ['#variation'],
          hypothesis: 'Checklist should improve saves.',
          expectedMetric: 'engagement rate',
          score: 76,
          scoreBreakdown: {
            hook: 78,
            clarity: 80,
            specificity: 72,
            cta: 78,
            novelty: 74,
          },
          status: 'ready',
          warnings: [],
        },
      ],
    }),
    toSourceInputs: (items: Array<Record<string, unknown>>) =>
      items.map((item) => ({
        title: item.title,
        sourceText: item.caption,
        sourcePlatform: 'post-variation-lab',
        tags: ['post-variation-lab'],
      })),
    toVariants: (items: Array<Record<string, unknown>>) =>
      items.map((item) => ({
        platform: item.platform,
        label: item.platformLabel,
        title: item.title,
        content: [item.hook, item.caption, item.cta].filter(Boolean).join('\n\n'),
        hashtags: item.hashtags,
        settings: {
          source: 'snaps-post-variation-lab',
          variationId: item.id,
        },
        publishMode: 'schedule',
      })),
  } as never,
  {
    saveProfile: async (_organizationId: string, body: Record<string, unknown> = {}) => ({
      id: 'competitor-controller',
      name: body.name || 'Rival',
      handle: body.handle || '@rival',
      profileUrl: body.profileUrl || 'https://instagram.com/rival',
      platform: body.platform || 'instagram',
      tags: ['competitor'],
      favorite: false,
    }),
    listProfiles: async () => [{ id: 'competitor-controller', name: 'Rival', platform: 'instagram' }],
    deleteProfile: async () => ({ deleted: true, profiles: 0, snapshots: 0 }),
    recordSnapshot: async (_organizationId: string, body: Record<string, unknown> = {}) => ({
      id: 'competitor-snapshot-controller',
      competitorId: body.competitorId || 'competitor-controller',
      followers: Number(body.followers || 12000),
      followersGrowth: Number(body.followersGrowth || 320),
      postsCount: Number(body.postsCount || 8),
      videosCount: Number(body.videosCount || 4),
      engagement: Number(body.engagement || 560),
      engagementRate: 0.047,
      topPosts: [{ title: 'Top rival reel', engagement: 560, hook: 'fast hook' }],
    }),
    previewImport: () => ({
      product: 'snaps',
      source: 'snaps-competitor-import',
      format: 'csv',
      columns: ['name', 'platform', 'followers'],
      sampleCsv: 'name,platform,followers\nRival,instagram,12000',
      totalRows: 1,
      acceptedRows: 1,
      invalidRows: 0,
      profileRows: 1,
      snapshotRows: 1,
      rows: [
        {
          rowNumber: 2,
          name: 'Imported Rival',
          platform: 'instagram',
          followers: 12000,
          followersGrowth: 320,
          postsCount: 8,
          videosCount: 4,
          photosCount: 4,
          linksCount: 0,
          statusesCount: 0,
          engagement: 560,
          engagementRate: 0.047,
          reach: 0,
          topPosts: [{ title: 'Imported top reel', engagement: 560 }],
          tags: ['competitor'],
          warnings: [],
          status: 'ready',
        },
      ],
    }),
    importPublicSnapshots: async () => ({
      product: 'snaps',
      source: 'snaps-competitor-import',
      format: 'csv',
      columns: ['name', 'platform', 'followers'],
      sampleCsv: 'name,platform,followers\nRival,instagram,12000',
      totalRows: 1,
      acceptedRows: 1,
      invalidRows: 0,
      profileRows: 1,
      snapshotRows: 1,
      rows: [],
      imported: {
        profiles: 1,
        createdProfiles: 1,
        updatedProfiles: 0,
        snapshots: 1,
        totalProfiles: 1,
        totalSnapshots: 1,
      },
    }),
    summary: async () => ({
      competitors: 1,
      snapshots: 1,
      totalFollowers: 12000,
      totalEngagement: 560,
      averageEngagementRate: 0.047,
      videoShare: 0.5,
      contentMix: { posts: 8, videos: 4, photos: 4, links: 0, statuses: 0 },
      topCompetitors: [],
      topPosts: [{ title: 'Top rival reel', engagement: 560, hook: 'fast hook' }],
      actionItems: ['경쟁 훅을 다음 콘텐츠에 반영'],
    }),
    report: async () => ({
      title: 'snaps 경쟁 계정 분석 리포트',
      summary: '경쟁 계정 1개',
      insights: ['경쟁사 릴스 강세'],
      actionItems: ['쇼츠 실험'],
      metrics: { competitors: { engagement: 560 } },
      generatedAt: new Date(0).toISOString(),
      source: 'snaps-competitor-analysis',
    }),
    importProfiles: async (_organizationId: string, profiles: unknown[]) => ({
      imported: profiles.length,
      total: profiles.length,
    }),
    importSnapshots: async (_organizationId: string, snapshots: unknown[]) => ({
      imported: snapshots.length,
      total: snapshots.length,
    }),
    listSnapshots: async () => [{ id: 'competitor-snapshot-controller' }],
  } as never,
  {
    saveCampaign: async (_organizationId: string, body: Record<string, unknown> = {}) => ({
      id: 'sales-campaign-controller',
      title: body.title || 'Sales campaign',
      destinationUrl: body.destinationUrl || 'https://example.com/offer',
      trackingUrl: 'https://example.com/offer?utm_source=instagram&utm_medium=social&utm_campaign=sales-campaign',
      linkInBioUrl: 'http://localhost:4200/snaps/link/sales-campaign',
      cta: body.cta || '자세히 보기',
      platform: body.platform || 'instagram',
      slug: 'sales-campaign',
    }),
    listCampaigns: async () => [{ id: 'sales-campaign-controller' }],
    deleteCampaign: async () => ({ deleted: true, campaigns: 0, events: 0 }),
    recordEvent: async (_organizationId: string, body: Record<string, unknown> = {}) => ({
      id: 'sales-event-controller',
      campaignId: body.campaignId || 'sales-campaign-controller',
      eventType: body.eventType || 'purchase',
      amount: Number(body.amount || 49000),
      currency: 'KRW',
    }),
    summary: async () => ({
      campaigns: 1,
      clicks: 1,
      leads: 0,
      purchases: 1,
      revenue: 49000,
      currency: 'KRW',
      conversionRate: 1,
      earningsPerClick: 49000,
      campaignSummaries: [],
      actionItems: ['상위 캠페인을 RAG 예시로 승격'],
    }),
    report: async () => ({
      title: 'snaps 링크/매출 귀속 리포트',
      summary: '매출 49000KRW',
      insights: ['구매 전환 발생'],
      actionItems: ['CTA 반복'],
      metrics: { sales: { revenue: 49000 } },
      generatedAt: new Date(0).toISOString(),
      source: 'snaps-sales-attribution',
    }),
    proposal: async (_organizationId: string, body: Record<string, unknown> = {}) => ({
      source: 'snaps-sales-proposal',
      generatedAt: new Date(0).toISOString(),
      leadName: body.leadName || 'Controller lead',
      segment: body.segment || 'B2B team',
      packageName: body.packageName || '14일 콘텐츠 매출 파일럿',
      offer: 'Controller pilot offer',
      positioning: 'Controller positioning',
      pilotDays: Number(body.pilotDays || 14),
      targetRevenue: Number(body.targetRevenue || 299000),
      currency: 'KRW',
      evidence: {
        campaigns: 1,
        clicks: 1,
        leads: 0,
        purchases: 1,
        revenue: 49000,
        conversionRate: 1,
        earningsPerClick: 49000,
      },
      scope: ['source reuse'],
      demoAgenda: ['demo'],
      successMetrics: ['매출 299000KRW 목표'],
      timeline: [{ day: 'D0', work: 'kickoff', proof: 'proposal' }],
      pricing: {
        setupFee: 300000,
        monthlyFee: 990000,
        pilotFee: 762000,
        currency: 'KRW',
        note: 'controller proposal pricing',
      },
      pitch: 'Controller pitch',
      followUpMessages: [
        { channel: 'email', subject: 'pilot proposal', body: 'email body' },
        { channel: 'dm', subject: 'pilot follow-up', body: 'dm body' },
      ],
      riskReversals: ['approval first'],
      nextSteps: ['confirm kickoff'],
    }),
    importCampaigns: async (_organizationId: string, campaigns: unknown[]) => ({
      imported: campaigns.length,
      total: campaigns.length,
    }),
    importEvents: async (_organizationId: string, events: unknown[]) => ({
      imported: events.length,
      total: events.length,
    }),
    listEvents: async () => [{ id: 'sales-event-controller' }],
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
    findFreeDateTime: async (_organizationId: string, integrationId?: string) =>
      integrationId ? '2026-06-01T09:00:00' : '2026-06-01T13:00:00',
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
  const multilineTransform = await controller.transform(org, {
    sourceText: '첫 문단입니다.\n\n둘째 문단입니다.\n- 체크 1',
    targetPlatforms: ['threads'],
    useRag: false,
  });
  assert(
    multilineTransform.variants[0]?.content.startsWith('첫 문단입니다.\n\n둘째 문단입니다.\n- 체크 1'),
    'transform should pass source line breaks through to the transformer'
  );
  const multilineStyle = await controller.addStyleExample(org, {
    platform: 'threads',
    content: '스타일 예시 첫 줄\n둘째 줄',
  } as never);
  assert(
    String((multilineStyle as { content?: string }).content || JSON.stringify(multilineStyle)).includes('\n'),
    'style examples should keep line breaks through the controller'
  );
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

  const duplicateBody = {
    variants: [
      {
        platform: 'threads' as const,
        label: 'Threads',
        content: '중복 방지 본문',
        hashtags: [],
        settings: { __type: 'threads' },
        publishMode: 'schedule' as const,
      },
    ],
    integrations: [{ platform: 'threads' as const, integrationId: 'threads-int' }],
    scheduleType: 'schedule' as const,
    publishDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    operatorConfirmed: true,
  };
  const callsBeforeDuplicate = scheduledCalls.length;
  const [firstSchedule, secondSchedule] = await Promise.all([
    controller.scheduleVariants(org, duplicateBody as never),
    controller.scheduleVariants(org, duplicateBody as never),
  ]);
  assert(
    scheduledCalls.length === callsBeforeDuplicate + 1,
    'a double-submitted schedule should create posts once'
  );
  assert(
    [firstSchedule, secondSchedule].filter((item) => (item as { duplicate?: boolean }).duplicate).length === 1,
    'the repeated schedule should be reported as a duplicate'
  );
  await controller.scheduleVariants(org, {
    ...duplicateBody,
    publishDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  } as never);
  assert(
    scheduledCalls.length === callsBeforeDuplicate + 2,
    'the same content at a different time is a new schedule'
  );
  const draftBody = { ...duplicateBody, scheduleType: 'draft' as const, publishDate: undefined };
  await controller.scheduleVariants(org, draftBody as never);
  // Drafts get a "now + 1h" placeholder date; a later retry must still match.
  await new Promise((resolve) => setTimeout(resolve, 20));
  await controller.scheduleVariants(org, draftBody as never);
  assert(
    scheduledCalls.length === callsBeforeDuplicate + 3,
    'a double-submitted draft should be created once'
  );

  const bestTime = await controller.bestScheduleTime(org, 'reply-int');
  assert(
    bestTime.recommendedDateLocal === '2026-06-01T09:00',
    'best-time recommendation should expose local input value'
  );
  assert(bestTime.integrationId === 'reply-int', 'best-time should echo integration id');
  assert(bestTime.providerIdentifier === 'threads', 'best-time should include provider identifier');
  await expectRejects(
    'missing best-time integration',
    () => controller.bestScheduleTime(org, 'missing'),
    NotFoundException,
    'not found'
  );

  const bulkCsv = 'title,caption,platforms\nBulk row,bulk source row,instagram';
  const bulkPreview = controller.bulkPreview({ csvText: bulkCsv });
  assert(bulkPreview.acceptedRows === 1, 'bulk CSV preview should accept one row');
  const bulkImported = await controller.bulkImportSources(org, { csvText: bulkCsv });
  assert(
    bulkImported.imported.imported === 1,
    'bulk CSV source import should merge accepted rows'
  );
  const bulkScheduled = await controller.bulkSchedule(org, {
    csvText: bulkCsv,
    scheduleType: 'draft',
    integrations: [],
  });
  assert(
    bulkScheduled.rows.length === 1 && bulkScheduled.rows[0].warnings.length >= 1,
    'bulk CSV schedule should surface missing integration warnings'
  );

  const feedXml = '<rss><channel><item><title>Feed row</title><link>https://example.com/feed</link><description>feed source row</description></item></channel></rss>';
  const feedPreview = await controller.feedPreview({ feedXml });
  assert(feedPreview.acceptedItems === 1, 'RSS feed preview should accept one item');
  const feedImported = await controller.feedImportSources(org, { feedXml });
  assert(
    feedImported.imported.imported === 1,
    'RSS feed source import should merge accepted items'
  );
  const feedScheduled = await controller.feedSchedule(org, {
    feedXml,
    scheduleType: 'draft',
    integrations: [],
  });
  assert(
    feedScheduled.items.length === 1 && feedScheduled.items[0].warnings.length >= 1,
    'RSS feed schedule should surface missing integration warnings'
  );

  const carouselPreview = controller.carouselPreview({
    sourceText: 'Carousel source row for smoke checks',
    targetPlatforms: ['instagram'],
  });
  assert(
    carouselPreview.slideCount >= 3 && carouselPreview.media.length >= 1,
    'carousel visual preview should return slide media'
  );
  const carouselExport = controller.carouselExport({
    sourceText: 'Carousel source row for smoke checks',
  });
  assert(
    carouselExport.exportHtml.includes('Carousel row') &&
      carouselExport.slides.length >= 1,
    'carousel visual export should include HTML and slide SVG'
  );
  const carouselScheduled = await controller.carouselSchedule(org, {
    sourceText: 'Carousel source row for smoke checks',
    scheduleType: 'draft',
    targetPlatforms: ['instagram'],
    integrations: [],
  });
  assert(
    carouselScheduled.warnings.length >= 1 &&
      carouselScheduled.variants[0].media >= 1,
    'carousel visual schedule should surface missing integration warnings and media'
  );

  const visualPlannerPreview = controller.visualPlannerPreview({
    items: [
      {
        title: 'Visual planner row',
        imageUrl: 'https://example.com/feed.png',
        status: 'draft',
      },
    ],
  });
  assert(
    visualPlannerPreview.source === 'snaps-visual-feed-planner' &&
      visualPlannerPreview.items.length === 1,
    'visual feed planner preview should return grid items'
  );
  const visualPlannerScheduled = await controller.visualPlannerSchedule(org, {
    items: [
      {
        title: 'Visual planner row',
        imageUrl: 'https://example.com/feed.png',
        status: 'draft',
      },
    ],
    scheduleType: 'draft',
    targetPlatforms: ['instagram'],
    integrations: [],
  });
  assert(
    visualPlannerScheduled.source === 'snaps-visual-feed-planner' &&
      visualPlannerScheduled.warnings.length >= 1,
    'visual feed planner schedule should surface missing integration warnings'
  );

  const firstCommentPreview = controller.firstCommentsPreview({
    globalComment: '#snaps\n\n댓글로 파일럿이라고 남겨주세요.',
    targetPlatforms: ['instagram'],
  });
  assert(
    firstCommentPreview.source === 'snaps-first-comment-planner' &&
      firstCommentPreview.supportedItems === 1,
    'first comment planner preview should return supported first comment items'
  );
  const firstCommentScheduled = await controller.firstCommentsSchedule(org, {
    globalComment: '#snaps\n\n댓글로 파일럿이라고 남겨주세요.',
    scheduleType: 'draft',
    targetPlatforms: ['instagram'],
    integrations: [],
  });
  assert(
    firstCommentScheduled.source === 'snaps-first-comment-planner' &&
      firstCommentScheduled.warnings.length >= 1,
    'first comment planner schedule should surface missing integration warnings'
  );

  const hashtagSetPreview = controller.hashtagSetPreview({
    hashtagText: '#snaps #콘텐츠운영',
    targetPlatforms: ['instagram'],
  });
  assert(
    hashtagSetPreview.source === 'snaps-hashtag-set' &&
      hashtagSetPreview.hashtags.length >= 1,
    'hashtag set preview should return saved hashtag metadata'
  );
  const savedHashtagSet = await controller.saveHashtagSet(org, {
    hashtagText: '#snaps #콘텐츠운영',
  });
  assert(
    savedHashtagSet.id === 'hashtag-set-controller',
    'hashtag set save should return stored set'
  );
  const listedHashtagSets = await controller.listHashtagSets(org, {});
  assert(listedHashtagSets.length === 1, 'hashtag set list should return sets');
  const appliedHashtagSet = await controller.applyHashtagSet(org, savedHashtagSet.id, {
    targetPlatforms: ['instagram'],
  });
  assert(
    appliedHashtagSet.transform.variants[0].settings.hashtagSetId ===
      savedHashtagSet.id,
    'hashtag set apply should annotate variants'
  );
  const scheduledHashtagSet = await controller.scheduleHashtagSet(org, savedHashtagSet.id, {
    scheduleType: 'draft',
    targetPlatforms: ['instagram'],
    integrations: [],
  });
  assert(
    scheduledHashtagSet.source === 'snaps-hashtag-set' &&
      scheduledHashtagSet.warnings.length >= 1,
    'hashtag set schedule should surface missing integration warnings'
  );
  const hashtagTrackerPreview = controller.hashtagTrackerPreview({
    hashtagText: '#snaps #콘텐츠운영',
    importText:
      'hashtag,platform,posts,impressions,engagements,comments,saves,clicks\n' +
      '#snaps,instagram,7,11200,740,44,116,51',
    targetPlatforms: ['instagram'],
  });
  assert(
    hashtagTrackerPreview.source === 'snaps-hashtag-tracker' &&
      hashtagTrackerPreview.bestHashtag === '#snaps',
    'hashtag tracker preview should return scored hashtag recommendations'
  );
  const savedTrackedHashtagSet = await controller.saveHashtagTrackerSet(org, {
    hashtagText: '#snaps #콘텐츠운영',
    setTitle: 'Tracked controller hashtags',
  });
  assert(
    savedTrackedHashtagSet.source === 'snaps-hashtag-tracker' &&
      savedTrackedHashtagSet.set.id === 'hashtag-set-controller',
    'hashtag tracker should save recommended hashtags as a set'
  );
  const deletedHashtagSet = await controller.deleteHashtagSet(org, savedHashtagSet.id);
  assert(deletedHashtagSet.deleted, 'hashtag set delete should return deleted flag');

  const listeningPreview = controller.listeningPreview({
    query: 'snaps OR #콘텐츠자동화',
    keywords: ['snaps', '가격'],
  });
  assert(
    listeningPreview.source === 'snaps-social-listening' &&
      listeningPreview.highIntentItems === 1,
    'social listening preview should return high-intent monitor data'
  );
  const savedListeningMonitor = await controller.saveListeningMonitor(org, {
    query: 'snaps OR #콘텐츠자동화',
    keywords: ['snaps', '가격'],
  });
  assert(
    savedListeningMonitor.id === 'listening-monitor-controller',
    'social listening save should return stored monitor'
  );
  const listedListeningMonitors = await controller.listListeningMonitors(org, {});
  assert(
    listedListeningMonitors.length === 1,
    'social listening list should return monitors'
  );
  const ranListeningMonitor = await controller.runListeningMonitor(
    org,
    savedListeningMonitor.id,
    {}
  );
  assert(
    ranListeningMonitor.preview.highIntentItems === 1,
    'social listening run should return fresh preview'
  );
  const promotedListening = await controller.promoteListeningMonitorToInbox(
    org,
    savedListeningMonitor.id,
    {}
  );
  assert(
    promotedListening.inbox.imported === 1,
    'social listening promote should import high-intent mentions into inbox'
  );
  const deletedListeningMonitor = await controller.deleteListeningMonitor(
    org,
    savedListeningMonitor.id
  );
  assert(
    deletedListeningMonitor.deleted,
    'social listening delete should return deleted flag'
  );

  const trendRadarPreview = controller.trendRadarPreview({
    importText:
      'topic,platform,volume,previousVolume,engagement,sentiment\n' +
      '#콘텐츠자동화,instagram,42,13,760,positive',
  });
  assert(
    trendRadarPreview.source === 'snaps-trend-radar' &&
      trendRadarPreview.alerts.length >= 1,
    'trend radar preview should return scored trend alerts'
  );
  const trendRadarImported = await controller.trendRadarImportSources(org, {
    importText:
      'topic,platform,volume,previousVolume,engagement,sentiment\n' +
      '#콘텐츠자동화,instagram,42,13,760,positive',
  });
  assert(
    trendRadarImported.imported.imported === 1,
    'trend radar source import should merge content ideas'
  );

  const postPreview = controller.postPreview({
    variants: [
      {
        platform: 'instagram',
        label: 'Instagram',
        content: '가격표와 데모 링크 받을 수 있나요? '.repeat(8),
        hashtags: ['#snaps'],
        settings: {},
        publishMode: 'schedule',
      },
    ],
  });
  assert(
    postPreview.source === 'snaps-post-preview-inspector' &&
      postPreview.cards.length >= 1 &&
      postPreview.averageAccessibilityScore > 0,
    'post preview should return feed cards and accessibility scoring'
  );

  const recyclePreview = controller.recyclePreview({
    sourceText: 'Evergreen recycle source row for smoke checks',
  });
  assert(
    recyclePreview.acceptedItems === 2 && recyclePreview.items[0].angle,
    'evergreen recycle preview should return recycle items'
  );
  const recycleImported = await controller.recycleImportSources(org, {
    sourceText: 'Evergreen recycle source row for smoke checks',
  });
  assert(
    recycleImported.imported.imported === 1,
    'evergreen recycle source import should merge accepted items'
  );
  const recycleScheduled = await controller.recycleSchedule(org, {
    sourceText: 'Evergreen recycle source row for smoke checks',
    scheduleType: 'draft',
    integrations: [],
  });
  assert(
    recycleScheduled.items.length === 1 && recycleScheduled.items[0].warnings.length >= 1,
    'evergreen recycle schedule should surface missing integration warnings'
  );

  const recurringPreview = controller.recurringPreview({
    sourceText: 'Recurring source row for smoke checks',
  });
  assert(
    recurringPreview.acceptedItems === 2 && recurringPreview.items[0].variation,
    'recurring post preview should return recurring items'
  );
  const recurringImported = await controller.recurringImportSources(org, {
    sourceText: 'Recurring source row for smoke checks',
  });
  assert(
    recurringImported.imported.imported === 1,
    'recurring post source import should merge accepted items'
  );
  const recurringScheduled = await controller.recurringSchedule(org, {
    sourceText: 'Recurring source row for smoke checks',
    scheduleType: 'draft',
    integrations: [],
  });
  assert(
    recurringScheduled.items.length === 1 && recurringScheduled.items[0].warnings.length >= 1,
    'recurring post schedule should surface missing integration warnings'
  );

  const repurposePreview = controller.repurposePreview({
    sourceText: 'Repurpose source row for smoke checks',
  });
  assert(
    repurposePreview.source === 'snaps-repurpose-queue' &&
      repurposePreview.acceptedItems === 2 &&
      repurposePreview.scheduleSlots.length >= 1,
    'repurpose queue preview should return source-platform posting-plan items'
  );
  const repurposeImported = await controller.repurposeImportSources(org, {
    sourceText: 'Repurpose source row for smoke checks',
  });
  assert(
    repurposeImported.imported.imported === 1,
    'repurpose queue source import should merge accepted items'
  );
  const repurposeScheduled = await controller.repurposeSchedule(org, {
    sourceText: 'Repurpose source row for smoke checks',
    scheduleType: 'draft',
    integrations: [],
  });
  assert(
    repurposeScheduled.source === 'snaps-repurpose-queue' &&
      repurposeScheduled.items.length === 1 &&
      repurposeScheduled.items[0].warnings.length >= 1,
    'repurpose queue schedule should surface missing integration warnings'
  );
  const adDisclosure = controller.adDisclosureCheck({
    relationship: 'gifted',
    advertiser: '스냅스',
    variants: [
      { platform: 'instagram', content: '체험단으로 받은 세럼 후기\n#세럼' },
      { platform: 'kakao-talk', content: '오픈 기념 할인 쿠폰' },
    ],
  });
  assert(
    adDisclosure.source === 'snaps-ad-disclosure-guard' &&
      adDisclosure.status === 'block' &&
      adDisclosure.cards[0].findings.some((item) => item.rule === 'disclosure-ambiguous') &&
      adDisclosure.cards[0].fixedContent.startsWith('[협찬]') &&
      adDisclosure.cards[1].fixedContent.startsWith('(광고)'),
    'ad disclosure guard should block ambiguous sponsorship and fix messenger ads'
  );
  let adDisclosureEmptyRejected = false;
  try {
    controller.adDisclosureCheck({});
  } catch (error) {
    adDisclosureEmptyRejected = error instanceof BadRequestException;
  }
  assert(adDisclosureEmptyRejected, 'ad disclosure guard should reject empty requests');

  const ideaPreview = await controller.generateIdeas(org, {
    topic: 'Idea controller',
    audience: 'B2B marketers',
    targetPlatforms: ['threads'],
  });
  assert(
    ideaPreview.source === 'snaps-idea-board' && ideaPreview.ideas.length === 1,
    'idea board should generate ideas'
  );
  const savedIdea = await controller.saveIdea(org, ideaPreview.ideas[0]);
  assert(savedIdea.id === 'idea-controller', 'idea board should save ideas');
  const ideaList = await controller.listIdeas(org, { status: 'inbox' });
  assert(ideaList.length === 1, 'idea board should list ideas');
  const updatedIdea = await controller.updateIdeaStatus(org, 'idea-controller', {
    status: 'planned',
  });
  assert(updatedIdea.idea.status === 'planned', 'idea board should update ideas');
  const promotedIdea = await controller.promoteIdeaToSource(org, 'idea-controller');
  assert(
    promotedIdea.source.sourcePlatform === 'idea-board' &&
      promotedIdea.idea.status === 'drafted',
    'idea board should promote ideas to source library'
  );
  const deletedIdea = await controller.deleteIdea(org, 'idea-controller');
  assert(deletedIdea.deleted === true, 'idea board should delete ideas');

  const brandKitPreview = await controller.analyzeBrandKit(org, {
    name: 'Brand kit controller',
    audience: 'B2B marketers',
    voice: 'Clear expert',
  });
  assert(
    brandKitPreview.source === 'snaps-brand-kit' &&
      brandKitPreview.requiredTerms.includes('snaps'),
    'brand kit should analyze brand voice guidance'
  );
  const savedBrandKit = await controller.saveBrandKit(org, brandKitPreview);
  assert(
    savedBrandKit.id === 'brand-kit-controller',
    'brand kit should save guidance'
  );
  const brandKitList = await controller.listBrandKits(org);
  assert(brandKitList.length === 1, 'brand kit should list guidance');
  const appliedBrandKit = await controller.applyBrandKit(org, 'brand-kit-controller', {
    sourceText: 'Controller source',
  });
  assert(
    appliedBrandKit.transformPatch.targetPlatforms.includes('threads') &&
      appliedBrandKit.hashtagAppend.includes('#snaps'),
    'brand kit should apply guidance to composer fields'
  );
  const deletedBrandKit = await controller.deleteBrandKit(org, 'brand-kit-controller');
  assert(deletedBrandKit.deleted === true, 'brand kit should delete guidance');

  const mediaAssetPreview = await controller.previewMediaAsset(org, {
    title: 'Controller media asset',
    url: 'https://example.com/controller.png',
    targetPlatforms: ['instagram'],
  });
  assert(
    mediaAssetPreview.source === 'snaps-media-library' &&
      mediaAssetPreview.platformFit.length === 1,
    'media library should preview platform fit'
  );
  const savedMediaAsset = await controller.saveMediaAsset(org, mediaAssetPreview);
  assert(
    savedMediaAsset.id === 'media-asset-controller',
    'media library should save assets'
  );
  const mediaAssetList = await controller.listMediaAssets(org, {});
  assert(mediaAssetList.length === 1, 'media library should list assets');
  const attachedMediaAsset = await controller.attachMediaAsset(
    org,
    'media-asset-controller',
    {
      targetPlatforms: ['instagram'],
    }
  );
  assert(
    attachedMediaAsset.transform.variants[0].media?.[0]?.path ===
      'https://example.com/media.png',
    'media library should attach assets to variants'
  );
  const queuedMediaAsset = await controller.scheduleMediaAsset(
    org,
    'media-asset-controller',
    {
      targetPlatforms: ['instagram'],
      scheduleType: 'draft',
      integrations: [],
    }
  );
  assert(
    queuedMediaAsset.source === 'snaps-media-library',
    'media library should expose queue handoff'
  );
  const deletedMediaAsset = await controller.deleteMediaAsset(
    org,
    'media-asset-controller'
  );
  assert(deletedMediaAsset.deleted === true, 'media library should delete assets');

  const creativeBriefPreview = controller.creativeBriefPreview({
    title: 'Controller creative brief',
    sourceText: 'Design a campaign image for the controller smoke.',
    targetPlatforms: ['instagram'],
  });
  assert(
    creativeBriefPreview.source === 'snaps-creative-brief' &&
      creativeBriefPreview.items.length === 1,
    'creative briefs should preview design handoff items'
  );
  const savedCreativeBriefMedia = await controller.saveCreativeBriefMedia(org, {
    title: 'Controller creative brief',
    sourceText: 'Design a campaign image for the controller smoke.',
    targetPlatforms: ['instagram'],
    itemId: 'creative-hero',
  });
  assert(
    savedCreativeBriefMedia.asset.id === 'media-asset-controller',
    'creative briefs should save selected items into media library'
  );

  const approval = await controller.submitApprovalRequest(org, {
    title: 'Approval controller',
    reviewer: 'client@example.com',
    variants: [
      {
        platform: 'threads',
        label: 'Threads',
        content: 'approval variant content',
        hashtags: ['#snaps'],
        settings: {},
        publishMode: 'schedule',
      },
    ],
  });
  assert(approval.id === 'approval-controller', 'approval request should be submitted');
  const approvals = await controller.listApprovalRequests(org);
  assert(approvals.length === 1, 'approval requests should be listed');
  const approvalPublicLink = await controller.createApprovalPublicLink(
    org,
    'approval-controller',
    {
      reviewer: 'client@example.com',
      allowDecision: true,
      expiresInDays: 14,
    }
  );
  assert(
    approvalPublicLink.source === 'snaps-approval-public-link' &&
      approvalPublicLink.publicReviewUrl.includes('/snaps/review/'),
    'approval public review link should be created'
  );
  const approvalComment = await controller.addApprovalComment(
    org,
    'approval-controller',
    {
      actor: 'client@example.com',
      message: 'CTA를 더 구체적으로 바꾸면 좋겠습니다.',
      visibility: 'reviewer',
    }
  );
  assert(
    approvalComment.comment.id === 'approval-comment-controller',
    'approval comments should be stored'
  );
  const resolvedApprovalComment = await controller.resolveApprovalComment(
    org,
    'approval-controller',
    'approval-comment-controller',
    {
      resolved: true,
      actor: 'snaps operator',
    }
  );
  assert(
    resolvedApprovalComment.comment.resolved === true,
    'approval comments should be resolvable'
  );
  const reviewedApproval = await controller.reviewApprovalRequest(
    org,
    'approval-controller',
    {
      decision: 'approve',
      reviewer: 'client@example.com',
    }
  );
  assert(reviewedApproval.status === 'approved', 'approval request should be reviewable');
  const scheduledApproval = await controller.scheduleApprovedRequest(
    org,
    'approval-controller',
    {
      scheduleType: 'draft',
      integrations: [{ platform: 'threads', integrationId: 'int-threads' }],
    }
  );
  assert(
    scheduledApproval.scheduled.scheduled.length === 1,
    'approved request should hand off to draft creation'
  );
  const deletedApproval = await controller.deleteApprovalRequest(
    org,
    'approval-controller'
  );
  assert(deletedApproval.deleted === true, 'approval request should be deletable');

  const viralCoach = await controller.viralCoachScorecard(org, {
    platform: 'instagram',
    title: 'Viral coach controller',
    content: '콘텐츠 만드는 사람이 가장 많이 놓치는 첫 3초 훅을 고치는 방법입니다. 저장하고 다음 릴스에 적용하세요.',
    visualDescription: '첫 화면에 큰 자막과 체크리스트 장면이 보입니다.',
    hashtags: ['#콘텐츠', '#릴스'],
  });
  assert(viralCoach.score >= 80, 'viral coach should return a scorecard');
  assert(
    viralCoach.suggestedHooks.length >= 1,
    'viral coach should return suggested hooks'
  );

  const variationPreview = controller.variationLabPreview({
    sourceText: '컨트롤러 포스트 실험 랩이 여러 훅과 CTA 후보를 만듭니다.',
    title: 'Variation controller',
    targetPlatforms: ['threads'],
  });
  assert(
    variationPreview.source === 'snaps-post-variation-lab' &&
      variationPreview.totalVariants === 2 &&
      variationPreview.winningVariantId,
    'post variation lab should return ranked variations'
  );
  const variationImport = await controller.variationLabImportSources(org, {
    sourceText: '컨트롤러 포스트 실험 후보를 원문 라이브러리에 병합합니다.',
    title: 'Variation import controller',
  });
  assert(
    variationImport.imported.imported === 2,
    'post variation lab should import variations into source library'
  );
  const variationSchedule = await controller.variationLabSchedule(org, {
    sourceText: '컨트롤러 포스트 실험 후보를 연결 채널 큐로 보냅니다.',
    title: 'Variation schedule controller',
    scheduleType: 'draft',
    integrations: [],
  });
  assert(
    variationSchedule.warnings.length >= 1,
    'post variation lab should expose queue warnings without connected integrations'
  );

  const resolvedSourcePreview = await controller.previewResolvedSource({
    sourceType: 'text',
    text: '컨트롤러 소스 리졸버가 외부 원문을 Source Library 입력으로 바꿉니다.',
  });
  assert(
    resolvedSourcePreview.source === 'snaps-source-resolver',
    'source resolver preview should return resolved source metadata'
  );
  const resolvedSourceImport = await controller.importResolvedSource(org, {
    sourceType: 'research',
    query: 'AI 콘텐츠 자동화',
  });
  assert(
    resolvedSourceImport.imported.imported === 1,
    'source resolver import should merge resolved input into source library'
  );

  const contentCalendarPreview = await controller.planContentCalendar({
    sourceText: '컨트롤러 콘텐츠 캘린더가 캠페인 브리프를 날짜별 포스트 슬롯으로 바꿉니다.',
    campaign: 'Controller calendar',
    days: 7,
    targetPlatforms: ['threads'],
  });
  assert(
    contentCalendarPreview.source === 'snaps-content-calendar' &&
      contentCalendarPreview.acceptedItems === 1,
    'content calendar plan should return schedulable slots'
  );
  const contentCalendarImport = await controller.importContentCalendarSources(org, {
    sourceText: '캘린더 항목을 원문 라이브러리에 병합합니다.',
    campaign: 'Controller calendar',
  });
  assert(
    contentCalendarImport.imported.imported === 1,
    'content calendar import should merge generated slots into source library'
  );
  const contentCalendarSchedule = await controller.scheduleContentCalendar(org, {
    sourceText: '캘린더 항목을 연결된 큐로 넘깁니다.',
    campaign: 'Controller calendar',
    scheduleType: 'draft',
    integrations: [{ platform: 'threads', integrationId: 'int-threads' }],
  });
  assert(
    contentCalendarSchedule.items.length === 1,
    'content calendar schedule should hand slots to draft creation'
  );

  const contentCategoryPreview = await controller.planContentCategories({
    sourceText: '컨트롤러 콘텐츠 카테고리 큐가 캠페인 원문을 버킷별 일정으로 바꿉니다.',
    campaign: 'Controller category',
    days: 7,
    targetPlatforms: ['threads'],
  });
  assert(
    contentCategoryPreview.source === 'snaps-content-categories' &&
      contentCategoryPreview.acceptedItems === 1,
    'content category plan should return schedulable category slots'
  );
  const contentCategoryImport = await controller.importContentCategorySources(org, {
    sourceText: '카테고리 큐 항목을 원문 라이브러리에 병합합니다.',
    campaign: 'Controller category',
  });
  assert(
    contentCategoryImport.imported.imported === 1,
    'content category import should merge generated slots into source library'
  );
  const contentCategorySchedule = await controller.scheduleContentCategories(org, {
    sourceText: '카테고리 큐 항목을 연결된 큐로 넘깁니다.',
    campaign: 'Controller category',
    scheduleType: 'draft',
    integrations: [{ platform: 'threads', integrationId: 'int-threads' }],
  });
  assert(
    contentCategorySchedule.items.length === 1,
    'content category schedule should hand slots to draft creation'
  );

  const conditionPreview = await controller.previewPostCondition({
    parentTitle: 'Parent controller',
    followUpText: '조건이 충족되면 후속 댓글을 발행합니다.',
    conditionType: 'likes',
    threshold: 50,
    metrics: { likes: 120 },
  });
  assert(
    conditionPreview.source === 'snaps-post-condition' &&
      conditionPreview.triggerMet === true,
    'post condition preview should evaluate trigger state'
  );
  const conditionImport = await controller.importPostConditionSource(org, {
    parentTitle: 'Parent controller',
    followUpText: '조건부 후속을 원문 라이브러리에 병합합니다.',
    conditionType: 'likes',
    threshold: 50,
    metrics: { likes: 120 },
  });
  assert(
    conditionImport.imported.imported === 1,
    'post condition import should merge follow-up source'
  );
  const conditionSchedule = await controller.schedulePostCondition(org, {
    parentTitle: 'Parent controller',
    followUpText: '조건부 후속을 연결된 큐로 넘깁니다.',
    conditionType: 'likes',
    threshold: 50,
    metrics: { likes: 120 },
    scheduleType: 'draft',
    integrations: [{ platform: 'threads', integrationId: 'int-threads' }],
  });
  assert(
    conditionSchedule.scheduled.length === 1,
    'post condition schedule should queue triggered follow-up variants'
  );

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

  const competitor = await controller.saveCompetitorProfile(org, {
    name: '경쟁사',
    platform: 'instagram',
    handle: '@rival',
  });
  assert(competitor.id === 'competitor-controller', 'competitor profile should be saved');
  const competitorSnapshot = await controller.recordCompetitorSnapshot(org, {
    competitorId: 'competitor-controller',
    followers: 12000,
    postsCount: 8,
    videosCount: 4,
    engagement: 560,
  });
  assert(competitorSnapshot.engagement === 560, 'competitor snapshot should be recorded');
  const competitorImportPreview = await controller.competitorImportPreview({
    importText: 'name,platform,followers\nImported Rival,instagram,12000',
  });
  assert(
    competitorImportPreview.acceptedRows === 1,
    'competitor import preview should parse accepted rows'
  );
  const competitorImport = await controller.importCompetitorSnapshots(org, {
    importText: 'name,platform,followers\nImported Rival,instagram,12000',
  });
  assert(
    competitorImport.imported.snapshots === 1,
    'competitor import should persist public snapshots'
  );
  const competitorSummary = await controller.competitorSummary(org);
  assert(
    competitorSummary.totalEngagement === 560,
    'competitor summary should include engagement'
  );
  const competitorReport = await controller.competitorReport(org);
  assert(competitorReport.reportId === 'report-controller', 'competitor report should be stored');
  const deletedCompetitor = await controller.deleteCompetitorProfile(org, 'competitor-controller');
  assert(deletedCompetitor.deleted === true, 'competitor profile should be deletable');

  const salesCampaign = await controller.saveSalesCampaign(org, {
    title: '세일즈 링크',
    destinationUrl: 'https://example.com/offer',
    platform: 'instagram',
  });
  assert(
    salesCampaign.id === 'sales-campaign-controller',
    'sales campaign should be created'
  );
  const salesEvent = await controller.recordSalesEvent(org, {
    campaignId: 'sales-campaign-controller',
    eventType: 'purchase',
    amount: 49000,
  });
  assert(salesEvent.eventType === 'purchase', 'sales event should be recorded');
  const salesSummary = await controller.salesSummary(org);
  assert(salesSummary.revenue === 49000, 'sales summary should include revenue');
  const salesReport = await controller.salesReport(org);
  assert(salesReport.reportId === 'report-controller', 'sales report should be stored');
  const salesProposal = await controller.salesProposal(org, {
    leadName: '컨트롤러 리드',
    pilotDays: 14,
    targetRevenue: 299000,
  });
  assert(
    salesProposal.source === 'snaps-sales-proposal' &&
      salesProposal.followUpMessages.length === 2,
    'sales proposal should be generated'
  );
  const deletedSalesCampaign = await controller.deleteSalesCampaign(
    org,
    'sales-campaign-controller'
  );
  assert(deletedSalesCampaign.deleted === true, 'sales campaign should be deletable');

  const feedbackItems = await controller.listFeedback(
    org,
    'threads' as never,
    undefined,
    'unread' as never,
    '컨트롤러'
  );
  assert(
    feedbackItems.some((item) => item.id === 'feedback-controller'),
    'feedback list should pass status/search filters'
  );
  const assignmentPreview = await controller.previewInboxAssignments(org, {
    defaultSlaMinutes: 120,
  });
  assert(
    assignmentPreview.source === 'snaps-inbox-assignments' &&
      assignmentPreview.cases.length === 1 &&
      assignmentPreview.lanes.urgent === 1,
    'inbox assignment preview should return routed cases'
  );
  const updatedFeedbackStatus = await controller.updateFeedbackStatus(
    org,
    'feedback-controller',
    { status: 'resolved' }
  );
  assert(
    updatedFeedbackStatus.updated === true &&
      updatedFeedbackStatus.item.status === 'resolved',
    'feedback status update should return updated inbox item'
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
  const replyTemplates = await controller.listReplyTemplates(org, 'instagram', 'question');
  assert(
    replyTemplates.some((template) => template.id === 'reply-template-controller'),
    'reply template list should return stored templates'
  );
  const savedReplyTemplate = await controller.saveReplyTemplate(org, {
    title: '컨트롤러 질문 답변',
    platform: 'instagram',
    sentiment: 'question',
    body: '자료 링크를 안내드리겠습니다.',
  });
  assert(
    savedReplyTemplate.template.id === 'reply-template-controller',
    'reply template save should return saved template'
  );
  const deletedReplyTemplate = await controller.deleteReplyTemplate(
    org,
    'reply-template-controller'
  );
  assert(deletedReplyTemplate.deleted === true, 'reply template delete should work');
  const inboxNotes = await controller.listInboxNotes(
    org,
    'instagram',
    'lead',
    'post-controller'
  );
  assert(
    inboxNotes.some((note) => note.id === 'inbox-note-controller'),
    'inbox note list should return stored customer notes'
  );
  const savedInboxNote = await controller.saveInboxNote(org, {
    platform: 'instagram',
    author: 'lead-controller',
    postId: 'post-controller',
    note: '상담 링크를 요청한 리드입니다.',
  });
  assert(
    savedInboxNote.note.id === 'inbox-note-controller',
    'inbox note save should return saved customer note'
  );
  const deletedInboxNote = await controller.deleteInboxNote(
    org,
    'inbox-note-controller'
  );
  assert(deletedInboxNote.deleted === true, 'inbox note delete should work');

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
  await controller.publishReply(org, {
    integrationId: 'reply-int',
    platformPostId: 'platform-post',
    reply: '감사합니다.\n문의는 DM으로 주세요.',
  });
  assert(
    String((publishedReply?.replies as Array<{ message?: string }> | undefined)?.[0]?.message || '').includes('\n'),
    'published replies should keep line breaks'
  );
  await expectRejects(
    'threads reply over the per-post limit',
    () =>
      controller.publishReply(org, {
        integrationId: 'reply-int',
        platformPostId: 'platform-post',
        reply: '가'.repeat(501),
      }),
    BadRequestException,
    'characters'
  );

  await expectRejects(
    'missing video URL',
    () => controller.attachVideoToDraft(org, { integrations: [] } as never),
    BadRequestException,
    'videoUrl'
  );
  const voiceoverCaptionPreview = await controller.videoVoiceoverCaptionPreview(org, {
    sourceText: '컨트롤러 보이스오버 캡션',
    durationSeconds: 30,
    platform: 'instagram',
  });
  assert(
    voiceoverCaptionPreview.source === 'snaps-video-voiceover-captions' &&
      voiceoverCaptionPreview.summary.alignmentScore > 0 &&
      voiceoverCaptionPreview.exports.srt.includes('Controller voiceover cue'),
    'voiceover caption preview should return captions and SRT export'
  );
  const videoPublishGuardPreview = await controller.videoPublishGuardPreview(org, {
    durationSeconds: 30,
    targetPlatforms: ['instagram', 'youtube', 'tiktok'],
    sceneCount: 4,
    generatedImageCount: 4,
    textToImageModel: 'flux-schnell',
    aiGeneratedVisuals: true,
    realisticPeople: true,
    targetLanguages: ['Korean', 'English'],
  });
  assert(
    videoPublishGuardPreview.source === 'snaps-video-publish-guard' &&
      videoPublishGuardPreview.creditBudget.totalCredits > 0 &&
      videoPublishGuardPreview.disclosureChecklist.some(
        (item) => item.labelRequired
      ) &&
      videoPublishGuardPreview.localizationPlan.rows.length >= 2 &&
      videoPublishGuardPreview.publishReadinessScore > 0,
    'video publish guard preview should return credit, disclosure, and localization checks'
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
    hashtagSets: [{ title: 'Imported hashtags', hashtagText: '#snaps' }],
    listeningMonitors: [{ title: 'Imported listening', query: 'snaps', keywords: ['snaps'] }],
    inboxItems: [],
    replyTemplates: [],
    inboxNotes: [],
    activity: [],
  });
  assert(
    imported.product === 'snaps' &&
      imported.hashtagSets.imported === 1 &&
      imported.listeningMonitors.imported === 1,
    'workspace import should identify snaps and import listening monitors'
  );

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
