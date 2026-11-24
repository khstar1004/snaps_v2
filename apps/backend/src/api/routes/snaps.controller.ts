import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Readable } from 'stream';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { OllamaClient } from '@gitroom/nestjs-libraries/snaps/ai/ollama.client';
import { SnapsContentTransformService } from '@gitroom/nestjs-libraries/snaps/transform/content-transform.service';
import {
  SnapsScheduleVariantsRequestDto,
  SnapsStyleExampleDto,
  SnapsTransformAndScheduleRequestDto,
  SnapsTransformRequestDto,
} from '@gitroom/nestjs-libraries/snaps/dto/transform-request.dto';
import {
  SnapsTransformResult,
  SnapsVariant,
} from '@gitroom/nestjs-libraries/snaps/dto/transform-result.dto';
import { SnapsRagService } from '@gitroom/nestjs-libraries/snaps/rag/rag.service';
import {
  SnapsReportGeneratorService,
  SnapsMetricInput,
  SnapsReportRequest,
} from '@gitroom/nestjs-libraries/snaps/analytics/report-generator.service';
import {
  SnapsShortVideoRequest,
  SnapsShortVideoService,
} from '@gitroom/nestjs-libraries/snaps/video/short-video.service';
import { SnapsFeedbackInboxService } from '@gitroom/nestjs-libraries/snaps/inbox/feedback-inbox.service';
import {
  SnapsFeedbackImportDto,
  SnapsFeedbackImportPostCommentsDto,
  SnapsFeedbackPublishReplyDto,
  SnapsFeedbackReplyDraftDto,
  SnapsFeedbackSummaryRequestDto,
  SnapsFeedbackSentiment,
} from '@gitroom/nestjs-libraries/snaps/dto/feedback-inbox.dto';
import {
  SnapsTargetPlatform,
  snapsTargetPlatforms,
  normalizeTargetPlatforms,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { SnapsSourceLibraryService } from '@gitroom/nestjs-libraries/snaps/library/source-library.service';
import {
  SnapsPromoteSourceToRagDto,
  SnapsSourceLibraryInputDto,
} from '@gitroom/nestjs-libraries/snaps/dto/source-library.dto';
import { SnapsActivityLogService } from '@gitroom/nestjs-libraries/snaps/activity/activity-log.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { buildSnapsPublishingPayload } from '@gitroom/nestjs-libraries/snaps/schedule/publishing-payload.builder';
import { snapsDataDirHealth } from '@gitroom/nestjs-libraries/snaps/storage/data-dir-health';
import { snapsMediaFileName } from '@gitroom/nestjs-libraries/snaps/text/media-file-name';
import {
  buildSnapsVideoVariants,
  SNAPS_VIDEO_PLATFORMS,
} from '@gitroom/nestjs-libraries/snaps/video/video-variant.builder';
import { snapsAnalyticsToMetricInputs } from '@gitroom/nestjs-libraries/snaps/analytics/analytics-metric.mapper';
import { CreatePostDto } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';
import { Organization } from '@prisma/client';
import {
  SnapsAgentCommandRequest,
  SnapsCommandPlannerService,
} from '@gitroom/nestjs-libraries/snaps/agent/command-planner.service';
import { SnapsAgentTaskService } from '@gitroom/nestjs-libraries/snaps/agent/agent-task.service';
import {
  SnapsCardNewsRequest,
  SnapsCardNewsDeck,
  SnapsCardNewsService,
  SNAPS_CARD_NEWS_MAX_SLIDES,
} from '@gitroom/nestjs-libraries/snaps/cardnews/card-news.service';
import { snapsTimeoutMs } from '@gitroom/nestjs-libraries/snaps/http/fetch-with-timeout';
import { SnapsRenderJobOwnershipService } from '@gitroom/nestjs-libraries/snaps/video/render-job-ownership.service';
import {
  resolveSnapsCardNewsTemplateId,
  SnapsCardNewsRendererService,
} from '@gitroom/nestjs-libraries/snaps/cardnews/card-news-renderer.service';
import {
  buildSnapsCardNewsVariants,
  SNAPS_CARD_NEWS_PLATFORMS,
} from '@gitroom/nestjs-libraries/snaps/cardnews/card-news-variant.builder';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { ValidUrlExtension } from '@gitroom/helpers/utils/valid.url.path';
import {
  ShortsMakerClientService,
  SnapsShortsMakerRenderJobRequest,
  SnapsShortsMakerScriptMode,
  SnapsShortsMakerTopicToScriptRequest,
} from '@gitroom/nestjs-libraries/snaps/shorts-maker/shorts-maker-client.service';
import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';
import { snapsCleanBodyText } from '@gitroom/nestjs-libraries/snaps/text/body-text';

type SnapsOrganization = {
  id: string;
};

type SnapsUser = {
  id: string;
};

type SnapsAttachVideoDraftRequest = {
  videoUrl?: unknown;
  thumbnail?: unknown;
  caption?: unknown;
  title?: unknown;
  targetPlatforms?: SnapsTargetPlatform[];
  integrations: SnapsScheduleVariantsRequestDto['integrations'];
  saveToMediaLibrary?: boolean;
  publishDate?: string;
  scheduleType?: 'draft' | 'schedule';
  operatorConfirmed?: boolean;
};

type SnapsAttachCardNewsDraftRequest = {
  title?: unknown;
  caption?: unknown;
  hashtags?: unknown;
  media: SnapsScheduleVariantsRequestDto['variants'][number]['media'];
  targetPlatforms?: SnapsTargetPlatform[];
  integrations: SnapsScheduleVariantsRequestDto['integrations'];
  publishDate?: string;
  scheduleType?: 'draft' | 'schedule';
  operatorConfirmed?: boolean;
};

type SnapsWorkspaceImportRequest = {
  sources?: unknown[];
  styleExamples?: unknown[];
  ragExamples?: unknown[];
  reports?: unknown[];
  agentTasks?: unknown[];
  inboxItems?: unknown[];
  feedbackItems?: unknown[];
  activity?: unknown[];
};

type SnapsStoredPostComment = {
  organizationId?: string | null;
  userId?: string | null;
  content?: unknown;
  createdAt?: string | Date | null;
};

type SnapsAnalyticsReportRequest = {
  title?: unknown;
  date?: unknown;
  integrationIds?: unknown[];
  postIds?: unknown[];
};

/**
 * UTF-16 units of source text a transform request may carry.
 *
 * The same 50,000 the inline clamp used; what changed is that going over
 * it is now reported rather than silently dropped.
 */
const SNAPS_TRANSFORM_SOURCE_LIMIT = 50000;

/**
 * Source-text budgets for the deck and shorts prompts.
 *
 * Deliberately smaller than the transform budget - a deck is six slides and
 * a short is thirty seconds, so feeding either a whole article wastes tokens
 * on text the output cannot hold. What was wrong is that the same paste was
 * cut to three different lengths depending on which button was pressed, and
 * none of them said so. The card news workspace receives its source by
 * handoff from the transform workspace, so an article that transformed whole
 * became a deck built from its first 6,000 characters in silence.
 */
const SNAPS_CARD_NEWS_SOURCE_LIMIT = 6000;
const SNAPS_SHORT_VIDEO_SOURCE_LIMIT = 5000;

@ApiTags('snaps')
@Controller(['/snaps', '/api/snaps'])
export class SnapsController {
  private readonly cardNewsStorage = UploadFactory.createStorage();

  constructor(
    private readonly ollama: OllamaClient,
    private readonly transformer: SnapsContentTransformService,
    private readonly rag: SnapsRagService,
    private readonly reportGenerator: SnapsReportGeneratorService,
    private readonly shortVideo: SnapsShortVideoService,
    private readonly inbox: SnapsFeedbackInboxService,
    private readonly library: SnapsSourceLibraryService,
    private readonly activity: SnapsActivityLogService,
    private readonly commandPlanner: SnapsCommandPlannerService,
    private readonly agentTasks: SnapsAgentTaskService,
    private readonly integrationService: IntegrationService,
    private readonly integrationManager: IntegrationManager,
    private readonly mediaService: MediaService,
    private readonly postsService: PostsService,
    private readonly cardNews: SnapsCardNewsService,
    private readonly cardNewsRenderer: SnapsCardNewsRendererService,
    private readonly renderJobOwners: SnapsRenderJobOwnershipService,
    private readonly shortsMaker: ShortsMakerClientService
  ) {}

  @Get('/health')
  async health() {
    const [ollama, pixelle, shortsMaker, storage] = await Promise.all([
      this.ollama.health(),
      this.pixelleRuntimeHealth(),
      this.shortsMakerHealth(),
      snapsDataDirHealth(),
    ]);
    return {
      product: 'snaps',
      // The store counts: with it unwritable nothing can be saved, and the
      // reads answer with an empty list rather than an error.
      ok: ollama.ok && storage.writable,
      ollama,
      rag: {
        enabled: process.env.SNAPS_RAG_ENABLED !== 'false',
        topK: Number(process.env.SNAPS_RAG_TOP_K || 5),
      },
      pixelle,
      shortsMaker,
      koreanSns: {
        naverCafeConfigured:
          !!process.env.NAVER_CLIENT_ID && !!process.env.NAVER_CLIENT_SECRET,
        naverBlogMode: 'assist',
        kakaoTalkMode: 'assist',
      },
      storage,
      fallback: {
        ruleFallbackEnabled: process.env.SNAPS_ALLOW_RULE_FALLBACK !== 'false',
        thinkingDisabled: process.env.OLLAMA_DISABLE_THINKING !== 'false',
      },
    };
  }

  @Post('/health')
  postHealth() {
    return this.health();
  }

  @Post('/agent/prepare')
  async prepareAgentCommand(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsAgentCommandRequest
  ) {
    const prepared = await this.commandPlanner.prepare(org.id, body);
    const task = await this.agentTasks.createFromPrepared(org.id, prepared);
    await this.activity.record(org.id, {
      type: 'agent',
      title: 'Prepared operator-confirmed agent plan',
      detail: {
        command: prepared.plan.command,
        platforms: prepared.plan.targetPlatforms,
        scheduleType: prepared.plan.scheduleType,
        includeShortVideo: prepared.plan.includeShortVideo,
        framework: prepared.plan.marketingStrategy.framework,
        revenueModels: prepared.plan.marketingStrategy.revenueModels,
        taskId: task.id,
      },
    });
    return {
      ...prepared,
      task,
    };
  }

  @Get('/agent/tasks')
  async listAgentTasks(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Query() query: Record<string, unknown>
  ) {
    return this.agentTasks.list(org.id, query);
  }

  @Get('/agent/tasks/:taskId')
  async getAgentTask(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('taskId') taskId: string
  ) {
    const task = await this.agentTasks.get(org.id, taskId);
    if (!task) {
      throw new NotFoundException('에이전트 작업을 찾을 수 없습니다.');
    }
    return task;
  }

  @Post('/agent/tasks/:taskId/favorite')
  async favoriteAgentTask(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('taskId') taskId: string
  ) {
    const task = await this.agentTasks.setFavorite(org.id, taskId, true);
    if (!task) {
      throw new NotFoundException('에이전트 작업을 찾을 수 없습니다.');
    }
    return task;
  }

  @Delete('/agent/tasks/:taskId/favorite')
  async unfavoriteAgentTask(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('taskId') taskId: string
  ) {
    const task = await this.agentTasks.setFavorite(org.id, taskId, false);
    if (!task) {
      throw new NotFoundException('에이전트 작업을 찾을 수 없습니다.');
    }
    return task;
  }

  @Post('/agent/tasks/:taskId/rating')
  async rateAgentTask(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('taskId') taskId: string,
    @Body() body?: { rating?: unknown; comment?: unknown }
  ) {
    const task = await this.agentTasks.setRating(
      org.id,
      taskId,
      body?.rating,
      body?.comment
    );
    if (!task) {
      throw new NotFoundException('에이전트 작업을 찾을 수 없습니다.');
    }
    return task;
  }

  @Delete('/agent/tasks/:taskId')
  async deleteAgentTask(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('taskId') taskId: string
  ) {
    const deleted = await this.agentTasks.delete(org.id, taskId);
    await this.activity.record(org.id, {
      type: 'delete',
      title: 'Deleted snaps agent task',
      detail: { taskId, deleted: deleted.deleted },
    });
    return deleted;
  }

  @Post('/transform')
  async transform(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsTransformRequestDto
  ) {
    const { request, warnings } = this.normalizeTransformRequest(body);
    const result = await this.transformer.transform(org.id, request);
    await this.activity.record(org.id, {
      type: 'transform',
      title: 'Generated platform variants',
      detail: {
        provider: result.provider,
        model: result.model,
        platforms: result.variants.map((variant) => variant.platform),
      },
    });
    return { ...result, warnings: [...warnings, ...result.warnings] };
  }

  @Post('/transform-and-draft')
  async transformAndDraft(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsTransformRequestDto
  ) {
    const { request, warnings } = this.normalizeTransformRequest(body);
    const result = await this.transformer.transform(org.id, request);
    await this.activity.record(org.id, {
      type: 'draft',
      title: 'Prepared draft payload from transform',
      detail: {
        provider: result.provider,
        model: result.model,
        platforms: result.variants.map((variant) => variant.platform),
      },
    });
    return this.transformer.buildDraftPayload({
      ...result,
      warnings: [...warnings, ...result.warnings],
    });
  }

  @Post('/transform-and-schedule')
  async transformAndSchedule(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsTransformAndScheduleRequestDto
  ) {
    const { request, warnings } = this.normalizeTransformRequest(body);
    const scheduleRequest =
      (body || {}) as Partial<SnapsTransformAndScheduleRequestDto>;
    this.assertOperatorConfirmed(
      this.cleanScheduleType(scheduleRequest.scheduleType),
      scheduleRequest.operatorConfirmed
    );
    const transformed = await this.transformer.transform(org.id, request);
    // Folded in before the schedule step, which merges the result's own
    // warnings with its own - putting it after would drop it.
    const result = {
      ...transformed,
      warnings: [...warnings, ...transformed.warnings],
    };
    const scheduled = await this.scheduleVariantsForOrg(org.id, {
      variants: result.variants,
      integrations: this.asArray(scheduleRequest.integrations),
      publishDate: this.cleanOptionalString(scheduleRequest.publishDate, 80),
      scheduleType: this.cleanScheduleType(scheduleRequest.scheduleType),
    }, result);
    await this.activity.record(org.id, {
      type: 'draft',
      title: 'Created scheduled variants from transform',
      detail: {
        scheduleType: this.cleanScheduleType(scheduleRequest.scheduleType) || 'draft',
        ...this.scheduledPlatformDetail(
          result.variants.map((variant) => variant.platform),
          scheduled.schedulable
        ),
      },
    });
    return scheduled;
  }

  @Post('/schedule-variants')
  async scheduleVariants(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsScheduleVariantsRequestDto
  ) {
    const variants = this.asArray(body?.variants);
    this.assertOperatorConfirmed(
      this.cleanScheduleType(body?.scheduleType),
      body?.operatorConfirmed
    );
    const scheduled = await this.scheduleVariantsForOrg(org.id, {
      variants,
      integrations: this.asArray(body?.integrations),
      publishDate: body?.publishDate,
      scheduleType: this.cleanScheduleType(body?.scheduleType),
    });
    await this.activity.record(org.id, {
      type: 'draft',
      title: 'Created drafts from edited variants',
      detail: {
        scheduleType: this.cleanScheduleType(body?.scheduleType) || 'draft',
        ...this.scheduledPlatformDetail(
          variants.map((variant) => variant.platform),
          scheduled.schedulable
        ),
      },
    });
    return scheduled;
  }

  private async scheduleVariantsForOrg(
    organizationId: string,
    body: {
      variants?: SnapsVariant[];
      integrations?: SnapsScheduleVariantsRequestDto['integrations'];
      publishDate?: string;
      scheduleType?: 'draft' | 'schedule';
    },
    baseResult?: SnapsTransformResult
  ) {
    const built = buildSnapsPublishingPayload(body);

    if (!built.payload) {
      return {
        ...(baseResult || {
          provider: 'rule-fallback',
          model: 'edited-variants',
          variants: built.variants,
          ragExamplesUsed: [],
        }),
        scheduled: [],
        schedulable: built.schedulable,
        warnings: [
          ...(baseResult?.warnings || []),
          ...built.warnings,
        ],
      };
    }

    const mapped = await this.postsService.mapTypeToPost(
      built.payload as CreatePostDto,
      organizationId
    );

    return {
      ...(baseResult || {
        provider: 'rule-fallback',
        model: 'edited-variants',
        variants: built.variants,
        ragExamplesUsed: [],
      }),
      warnings: [
        ...(baseResult?.warnings || []),
        ...built.warnings,
      ],
      // The activity log used to record every requested platform. The builder
      // skips variants - assist-only channels, platforms with no connected
      // integration, an incomplete Naver Cafe variant - so a run that reached
      // one channel was written into the history as having reached four.
      schedulable: built.schedulable,
      scheduled: await this.postsService.createPost(organizationId, mapped),
    };
  }

  @Post('/rag/examples')
  async addStyleExample(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsStyleExampleDto
  ) {
    const request = this.normalizeStyleExampleRequest(body);
    const saved = await this.rag.addExample(org.id, request);
    await this.activity.record(org.id, {
      type: 'rag',
      title: 'Saved RAG style example',
      detail: { platform: request.platform, id: saved.id },
    });
    return this.savedStyleExample(saved);
  }

  @Get('/rag/examples')
  async listStyleExamples(@GetOrgFromRequest() org: SnapsOrganization) {
    return (await this.rag.listExamples(org.id)).map((example) =>
      this.withoutEmbedding(example)
    );
  }

  @Delete('/rag/examples/:exampleId')
  async deleteStyleExample(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('exampleId') exampleId: string
  ) {
    const deleted = await this.rag.deleteExample(org.id, exampleId);
    await this.activity.record(org.id, {
      type: 'delete',
      title: 'Deleted RAG style example',
      detail: { exampleId, deleted: deleted.deleted },
    });
    return deleted;
  }

  @Get('/rag/search')
  async searchStyleExamples(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Query('query') query: string,
    @Query('platform') platform?: string,
    @Query('topK') topK?: string
  ) {
    const hits = await this.rag.search(
      org.id,
      query || '',
      platform,
      Number(topK || 5)
    );
    // `score` alone is ambiguous: it is a cosine similarity for an example the
    // query embedding could be compared against and a token-overlap fraction
    // for one it could not, and token overlap reaches exactly 1.0 whenever
    // every query word appears. An operator reading "1.00" next to "0.87" would
    // take the keyword match for the better example, which is backwards. Say
    // which basis produced the number.
    // A zero score is no evidence of a match, and the transform path has
    // always dropped those before using them. This route did not, so a
    // query with nothing in common came back with a full page of
    // unrelated examples - measured on `자동차 보험 비교` against a store
    // about 환절기 and 배송, three hits at 0.000 - and the workspace said
    // it had found similar examples. Two consumers of one function
    // disagreeing about what its answer means.
    return hits
      .filter((hit) => hit.score > 0)
      .map((hit) => ({
        ...this.withoutEmbedding(hit),
        // From the store, not re-derived: a stored embedding is not enough for
        // a cosine, so `hit.embedding` labelled token-scored hits 'embedding'
        // every time the query itself failed to embed.
        matchedBy: hit.matchedBy,
      }));
  }

  @Post('/rag/rebuild')
  async rebuildRagEmbeddings(@GetOrgFromRequest() org: SnapsOrganization) {
    const rebuilt = await this.rag.rebuildEmbeddings(org.id);
    await this.activity.record(org.id, {
      type: 'rag',
      title: 'Rebuilt RAG embeddings',
      detail: rebuilt,
    });
    return rebuilt;
  }

  @Post('/source-library')
  async saveSource(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsSourceLibraryInputDto
  ) {
    const saved = await this.library.saveSource(org.id, body);
    await this.activity.record(org.id, {
      type: 'source',
      title: 'Saved source content',
      detail: { sourceId: saved.id, title: saved.title },
    });
    return saved;
  }

  @Get('/source-library')
  listSources(@GetOrgFromRequest() org: SnapsOrganization) {
    return this.library.listSources(org.id);
  }

  @Delete('/source-library/:sourceId')
  async deleteSource(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('sourceId') sourceId: string
  ) {
    const deleted = await this.library.deleteSource(org.id, sourceId);
    await this.activity.record(org.id, {
      type: 'delete',
      title: 'Deleted source content',
      detail: { sourceId, deleted: deleted.deleted },
    });
    return deleted;
  }

  @Post('/source-library/:sourceId/promote-to-rag')
  async promoteSourceToRag(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('sourceId') sourceId: string,
    @Body() body?: SnapsPromoteSourceToRagDto
  ) {
    const source = await this.library.getSource(org.id, sourceId);
    if (!source) {
      throw new NotFoundException('원문을 찾을 수 없습니다.');
    }

    const request = this.normalizePromoteToRagRequest(body);
    const saved = await this.rag.addExample(org.id, {
      platform: request.platform,
      content: source.sourceText,
      authorType: request.authorType || 'source-library',
      topic: request.topic || source.topic || source.title,
      tone: request.tone || source.tone,
      metrics: {
        sourceId: source.id,
        sourceTitle: source.title,
        sourcePlatform: source.sourcePlatform,
        tags: source.tags || [],
      },
    });
    await this.activity.record(org.id, {
      type: 'rag',
      title: 'Promoted source content to RAG',
      detail: { sourceId: source.id, exampleId: saved.id, platform: request.platform },
    });
    return this.savedStyleExample(saved);
  }

  @Post('/report/generate')
  async generateReport(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsReportRequest
  ) {
    const report = await this.reportGenerator.generate(body);
    const stored = await this.library.saveReport(
      org.id,
      report.title,
      report as Record<string, unknown>
    );
    await this.activity.record(org.id, {
      type: 'report',
      title: 'Generated analytics report',
      detail: { reportId: stored.id, title: report.title },
    });
    return { ...report, reportId: stored.id };
  }

  @Post('/report/from-platform-analytics')
  async reportFromPlatformAnalytics(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsAnalyticsReportRequest
  ) {
    const { title, date, timestamp, integrationIds, postIds } =
      this.normalizeAnalyticsReportRequest(body);
    const metrics: SnapsMetricInput[] = [];
    const warnings: string[] = [];

    for (const integrationId of integrationIds) {
      try {
        const analytics = await this.withAnalyticsTimeout(
          this.integrationService.checkAnalytics(
            this.asAnalyticsOrganization(org),
            integrationId,
            date
          ),
          integrationId
        );
        metrics.push(...snapsAnalyticsToMetricInputs(integrationId, analytics));
      } catch (error) {
        warnings.push(
          `연동 분석을 건너뛰었습니다 ${integrationId}: ${this.compactError(error)}`
        );
      }
    }

    for (const postId of postIds) {
      try {
        const analytics = await this.withAnalyticsTimeout(
          this.postsService.checkPostAnalytics(org.id, postId, timestamp),
          postId
        );
        if (Array.isArray(analytics)) {
          metrics.push(...snapsAnalyticsToMetricInputs(postId, analytics));
        }
      } catch (error) {
        warnings.push(
          `게시물 분석을 건너뛰었습니다 ${postId}: ${this.compactError(error)}`
        );
      }
    }

    const report = await this.reportGenerator.generate({
      title,
      metrics,
    });
    const reportWithWarnings = {
      ...report,
      warnings,
    };
    const stored = await this.library.saveReport(
      org.id,
      reportWithWarnings.title,
      reportWithWarnings as Record<string, unknown>
    );
    await this.activity.record(org.id, {
      type: 'report',
      title: 'Generated report from platform analytics',
      detail: {
        reportId: stored.id,
        integrationIds,
        postIds,
        warnings: warnings.length,
      },
    });
    return { ...reportWithWarnings, reportId: stored.id };
  }

  @Get('/report/history')
  listReportHistory(@GetOrgFromRequest() org: SnapsOrganization) {
    return this.library.listReports(org.id);
  }

  @Delete('/report/:reportId')
  async deleteReport(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('reportId') reportId: string
  ) {
    const deleted = await this.library.deleteReport(org.id, reportId);
    await this.activity.record(org.id, {
      type: 'delete',
      title: 'Deleted report',
      detail: { reportId, deleted: deleted.deleted },
    });
    return deleted;
  }

  @Get('/report/:reportId/export')
  async exportReport(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('reportId') reportId: string,
    @Query('format') format?: 'markdown' | 'html' | 'print-html'
  ) {
    const exported = await this.library.exportReport(
      org.id,
      reportId,
      format === 'print-html'
        ? 'print-html'
        : format === 'html'
        ? 'html'
        : 'markdown'
    );
    if (!exported) {
      throw new NotFoundException('보고서를 찾을 수 없습니다.');
    }

    return exported;
  }

  @Post('/report/:reportId/promote-to-rag')
  async promoteReportToRag(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('reportId') reportId: string,
    @Body() body?: SnapsPromoteSourceToRagDto
  ) {
    const stored = await this.library.getReport(org.id, reportId);
    if (!stored) {
      throw new NotFoundException('보고서를 찾을 수 없습니다.');
    }

    const report = stored.report;
    const content = [
      typeof report.summary === 'string' ? report.summary : '',
      ...this.asStringArray(report.insights),
      ...this.asStringArray(report.actionItems),
    ]
      .filter(Boolean)
      .join('\n');

    const request = this.normalizePromoteToRagRequest(body);
    const saved = await this.rag.addExample(org.id, {
      platform: request.platform,
      content:
        content ||
        `${stored.title}: 최근 성과 보고서의 인사이트를 다음 콘텐츠 스타일에 반영하세요.`,
      authorType: request.authorType || 'analytics-report',
      topic: request.topic || stored.title,
      tone: request.tone,
      metrics: {
        reportId: stored.id,
        reportTitle: stored.title,
        generatedAt:
          typeof report.generatedAt === 'string' ? report.generatedAt : undefined,
      },
    });
    await this.activity.record(org.id, {
      type: 'rag',
      title: 'Promoted analytics report to RAG',
      detail: { reportId: stored.id, exampleId: saved.id, platform: request.platform },
    });
    return this.savedStyleExample(saved);
  }

  @Post('/inbox/import')
  async importFeedback(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsFeedbackImportDto
  ) {
    const imported = await this.inbox.importItems(org.id, body);
    await this.activity.record(org.id, {
      type: 'inbox',
      title: 'Imported feedback items',
      detail: { imported: imported.imported, total: imported.total },
    });
    return imported;
  }

  @Post('/inbox/import-post-comments')
  async importPostComments(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsFeedbackImportPostCommentsDto
  ) {
    const items = [];
    const { sources, defaultPlatform } = this.normalizePostCommentImportRequest(body);
    for (const source of sources) {
      const comments = this.asStoredPostComments(
        await this.postsService.getComments(source.postId)
      );
      for (const comment of comments) {
        if (comment.organizationId && comment.organizationId !== org.id) {
          continue;
        }
        if (!comment.content) {
          continue;
        }

        items.push({
          platform: source.platform || defaultPlatform || 'threads',
          postId: source.postId,
          author: comment.userId ? `user:${comment.userId}` : undefined,
          sourceUrl: source.sourceUrl,
          createdAt: comment.createdAt
            ? new Date(comment.createdAt).toISOString()
            : undefined,
          content: String(comment.content),
        });
      }
    }

    const imported = await this.inbox.importItems(org.id, { items });
    await this.activity.record(org.id, {
      type: 'inbox',
      title: 'Imported connected post comments',
      detail: {
        sourcePosts: sources.length,
        imported: imported.imported,
        total: imported.total,
      },
    });
    return {
      ...imported,
      sourcePosts: sources.length,
    };
  }

  private asStoredPostComments(value: unknown): SnapsStoredPostComment[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter(
      (comment): comment is SnapsStoredPostComment =>
        !!comment && typeof comment === 'object'
    );
  }

  @Get('/inbox/items')
  listFeedback(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Query('platform') platform?: SnapsTargetPlatform,
    @Query('sentiment') sentiment?: SnapsFeedbackSentiment
  ) {
    return this.inbox.listItems(org.id, { platform, sentiment });
  }

  @Delete('/inbox/items')
  async clearFeedback(@GetOrgFromRequest() org: SnapsOrganization) {
    const cleared = await this.inbox.clearItems(org.id);
    await this.activity.record(org.id, {
      type: 'delete',
      title: 'Cleared feedback inbox',
      detail: cleared,
    });
    return cleared;
  }

  @Delete('/inbox/items/:itemId')
  async deleteFeedbackItem(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('itemId') itemId: string
  ) {
    const deleted = await this.inbox.deleteItem(org.id, itemId);
    await this.activity.record(org.id, {
      type: 'delete',
      title: 'Deleted feedback inbox item',
      detail: { itemId, ...deleted },
    });
    return deleted;
  }

  @Get('/inbox/reply-capabilities')
  async replyCapabilities(@GetOrgFromRequest() org: SnapsOrganization) {
    const integrations = await this.integrationService.getIntegrationsList(org.id);
    return integrations.map((integration) => {
      let commentable = false;
      try {
        const provider = this.integrationManager.getSocialIntegration(
          integration.providerIdentifier
        );
        commentable = !!provider?.comment;
      } catch {
        commentable = false;
      }

      return {
        id: integration.id,
        name: integration.name,
        providerIdentifier: integration.providerIdentifier,
        disabled: integration.disabled,
        commentable,
      };
    });
  }

  @Post('/inbox/summary')
  async summarizeFeedback(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsFeedbackSummaryRequestDto
  ) {
    const summary = await this.inbox.summarize(org.id, body);
    await this.activity.record(org.id, {
      type: 'inbox',
      title: 'Generated feedback summary',
      // provider, like the transform record above: all three results carry
      // one, and all three warn the operator when it is 'rule-fallback'.
      // Without it the history cannot tell a run the model wrote from one
      // the deterministic path produced, which is the first thing to check
      // when an old post reads badly.
      detail: { provider: summary.provider, total: summary.total },
    });
    return summary;
  }

  @Post('/inbox/reply-draft')
  async createReplyDraft(
    @GetOrgFromRequest() org: SnapsOrganization,
    @GetUserFromRequest() user: SnapsUser,
    @Body() body?: SnapsFeedbackReplyDraftDto
  ) {
    const request = (body || {}) as Partial<SnapsFeedbackReplyDraftDto>;
    const postId = this.cleanOptionalString(request.postId, 200);
    const reply = this.cleanBodyText(request.reply, 2000);
    if (!postId) {
      throw new BadRequestException('postId는 필수입니다.');
    }
    if (!reply) {
      throw new BadRequestException('reply는 필수입니다.');
    }

    const comment = await this.postsService.createComment(
      org.id,
      user.id,
      postId,
      reply
    );
    await this.activity.record(org.id, {
      type: 'inbox',
      title: 'Saved feedback reply draft',
      detail: { postId, commentId: comment.id },
    });
    return comment;
  }

  @Post('/inbox/publish-reply')
  async publishReply(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsFeedbackPublishReplyDto
  ) {
    const request = (body || {}) as Partial<SnapsFeedbackPublishReplyDto>;
    const integrationId = this.cleanOptionalString(request.integrationId, 200);
    const platformPostId = this.cleanOptionalString(request.platformPostId, 500);
    const lastCommentId = this.cleanOptionalString(request.lastCommentId, 500);
    const reply = this.cleanBodyText(request.reply, 2000);
    if (!integrationId) {
      throw new BadRequestException('integrationId는 필수입니다.');
    }
    if (!platformPostId) {
      throw new BadRequestException('platformPostId는 필수입니다.');
    }
    if (!reply) {
      throw new BadRequestException('reply는 필수입니다.');
    }
    // This route posts to the connected channel immediately and cannot be
    // undone. The draft/schedule routes have always required an explicit
    // operator confirmation; this one relied on the workspace asking first,
    // which is not a boundary a direct API call has to respect.
    this.assertExternalPublishConfirmed(request.operatorConfirmed);

    const integration = await this.integrationService.getIntegrationById(
      org.id,
      integrationId
    );
    if (!integration) {
      throw new NotFoundException('답글을 게시할 연결 채널을 찾을 수 없습니다.');
    }

    const provider = this.integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );
    if (!provider?.comment) {
      throw new BadRequestException(
        `${integration.providerIdentifier} 채널은 댓글 게시를 지원하지 않습니다.`
      );
    }

    const result = await provider.comment(
      integration.internalId,
      platformPostId,
      lastCommentId,
      integration.token,
      [
        {
          id: makeId(10),
          message: reply,
          settings: this.asRecord(request.settings),
          media: [],
        },
      ],
      integration
    );
    // provider.comment() resolves to the posts it actually created, so an empty
    // array means the request succeeded and nothing reached the channel. The
    // workspace already warns about that case; the activity history recorded
    // 'Published feedback reply' either way, which is the audit trail claiming
    // a reply that was never posted.
    const published = Array.isArray(result) ? result.length : result ? 1 : 0;
    await this.activity.record(org.id, {
      type: 'inbox',
      title: published
        ? 'Published feedback reply'
        : 'Feedback reply was not published by the channel',
      detail: {
        integrationId: integration.id,
        provider: integration.providerIdentifier,
        platformPostId,
        published,
        result,
      },
    });
    return {
      provider: integration.providerIdentifier,
      result,
    };
  }

  @Post('/video/script')
  async videoScript(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsShortVideoRequest
  ) {
    const { request, warnings } = this.normalizeShortVideoRequest(body);
    const script = await this.shortVideo.script(request);
    await this.activity.record(org.id, {
      type: 'video',
      title: 'Generated shorts script',
      // provider, like the transform record above: all three results carry
      // one, and all three warn the operator when it is 'rule-fallback'.
      // Without it the history cannot tell a run the model wrote from one
      // the deterministic path produced, which is the first thing to check
      // when an old post reads badly.
      detail: {
        provider: script.provider,
        platform: request.platform,
        durationSeconds: request.durationSeconds,
      },
    });
    // The script now carries its own warning when the narration cannot be read
    // in the time asked for, so the two lists are joined rather than one
    // replacing the other: spreading the route's over the script's dropped the
    // pacing warning exactly when the request also had something wrong with it.
    // Only when there is something to say - an always-present empty array
    // trains the reader to ignore it.
    const scriptWarnings = Array.isArray(
      (script as { warnings?: unknown }).warnings
    )
      ? ((script as { warnings?: string[] }).warnings as string[])
      : [];
    const allWarnings = [...scriptWarnings, ...warnings];
    return allWarnings.length ? { ...script, warnings: allWarnings } : script;
  }

  @Post('/video/generate-short')
  async generateShort(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsShortVideoRequest
  ) {
    const { request, warnings } = this.normalizeShortVideoRequest(body);
    const generated = await this.shortVideo.generate(request);
    // The job id has to be written down here or ownership is unknowable:
    // /video/status/:jobId took no organisation and proxied straight to
    // Pixelle, so any authenticated user could read any job's status and the
    // resulting videoUrl by supplying its id.
    const generatedJobId = this.cleanOptionalString(
      (generated as { jobId?: unknown })?.jobId,
      200
    );
    // Recorded separately from the activity entry below, which is capped and
    // can evict this job while it is still rendering.
    if (generatedJobId) {
      await this.renderJobOwners.remember(org.id, generatedJobId);
    }
    await this.activity.record(org.id, {
      type: 'video',
      title: 'Requested Pixelle short-form video',
      detail: {
        platform: request.platform,
        durationSeconds: request.durationSeconds,
        ...(generatedJobId ? { jobId: generatedJobId } : {}),
      },
    });
    return warnings.length
      ? { ...(generated as Record<string, unknown>), warnings }
      : generated;
  }

  @Get('/video/status/:jobId')
  async videoStatus(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('jobId') jobId: string
  ) {
    const requested = this.cleanOptionalString(jobId, 200);
    if (!requested) {
      throw new BadRequestException('jobId는 필수입니다.');
    }
    await this.assertRenderJobBelongsToOrg(org.id, requested);
    return this.shortVideo.status(requested);
  }

  /**
   * Neither render backend knows anything about snaps organisations, so the
   * only record that a job belongs to one is the activity entry written when
   * it was requested. Pixelle jobs and Shorts-Maker render jobs both land in
   * the same 'video' activity type, so one check covers both.
   *
   * A job id this organisation never requested is refused. Jobs created
   * before the id was recorded have no entry at all, so they are refused too
   * rather than being treated as everyone's - re-requesting the render is the
   * safe recovery, and leaving unknown ids open would keep the hole open.
   */
  private async assertRenderJobBelongsToOrg(organizationId: string, jobId: string) {
    // The dedicated store first. Ownership used to be inferred from the activity
    // log alone, which is capped at 500 entries newest-first: a job that was
    // still rendering could have its record pushed out, and /snaps/import
    // evicts the whole log in one call because it merges up to 500 imported
    // entries in front. The operator then polled their own job and was told it
    // did not exist.
    if (await this.renderJobOwners.owns(organizationId, jobId)) {
      return;
    }

    // Still consulted, for jobs created before the store existed. Dropping this
    // would make every in-flight job from an older process unpollable.
    const entries = await this.activity.list(organizationId);
    const owned = entries.some(
      (entry) =>
        entry.type === 'video' &&
        this.cleanOptionalString(
          (entry.detail as { jobId?: unknown } | undefined)?.jobId,
          200
        ) === jobId
    );
    if (!owned) {
      throw new NotFoundException('요청한 영상 작업을 찾을 수 없습니다.');
    }
  }

  @Post('/shorts-maker/topic-to-script')
  async shortsMakerTopicToScript(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsShortsMakerTopicToScriptRequest
  ) {
    const request = this.normalizeShortsMakerTopicToScriptRequest(body);
    const result = await this.shortsMaker.topicToScript(request);
    await this.activity.record(org.id, {
      type: 'video',
      title: 'Requested Shorts-Maker script from topic',
      detail: { mode: request.mode, topicLength: request.topic.length },
    });
    return result;
  }

  @Post('/shorts-maker/render-jobs')
  async shortsMakerCreateRenderJob(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsShortsMakerRenderJobRequest
  ) {
    const request = this.normalizeShortsMakerRenderJobRequest(body);
    const result = await this.shortsMaker.createRenderJob(request);
    // Same reason as the Pixelle job above: without the id written down here,
    // /shorts-maker/render-jobs/:jobId cannot tell whose job it is.
    const renderJobId = this.cleanOptionalString(
      (result as { job?: { id?: unknown } })?.job?.id,
      200
    );
    // Same reason as the Pixelle job above.
    if (renderJobId) {
      await this.renderJobOwners.remember(org.id, renderJobId);
    }
    await this.activity.record(org.id, {
      type: 'video',
      title: 'Queued Shorts-Maker render job',
      detail: {
        durationMs: request.durationMs,
        ...(renderJobId ? { jobId: renderJobId } : {}),
      },
    });
    return result;
  }

  @Get('/shorts-maker/render-jobs/:jobId')
  async shortsMakerRenderJobStatus(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('jobId') jobId: string
  ) {
    const requested = this.cleanOptionalString(jobId, 200);
    if (!requested) {
      throw new BadRequestException('jobId는 필수입니다.');
    }
    await this.assertRenderJobBelongsToOrg(org.id, requested);
    return this.shortsMaker.getRenderJobStatus(requested);
  }

  @Post('/video/attach-to-draft')
  async attachVideoToDraft(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsAttachVideoDraftRequest
  ) {
    const request = body || ({} as SnapsAttachVideoDraftRequest);
    const videoUrl = this.cleanOptionalString(request.videoUrl, 2000);
    const title = this.cleanOptionalString(request.title, 120);
    const caption = this.cleanBodyText(request.caption, 1000);
    const thumbnail = this.cleanOptionalString(request.thumbnail, 2000);

    if (!videoUrl) {
      throw new BadRequestException('videoUrl은 필수입니다.');
    }
    this.assertOperatorConfirmed(
      this.cleanScheduleType(request.scheduleType),
      request.operatorConfirmed
    );

    const mediaLibraryItem =
      request.saveToMediaLibrary === false
        ? undefined
        : await this.mediaService.saveFile(
            org.id,
            this.fileNameFromUrl(videoUrl),
            videoUrl,
            title || 'snaps short-form video'
          );

    // The variant's media path ends up as MediaDto.path, which is validated by
    // ValidUrlExtension deep inside post creation. A .mov, .webm or
    // extension-less CDN URL therefore failed far from where the operator
    // supplied it. Run the same validator here so the answer arrives as a 400
    // on this request instead.
    const effectiveMediaPath = mediaLibraryItem?.path || videoUrl;
    if (!new ValidUrlExtension().validate(effectiveMediaPath, {} as never)) {
      throw new BadRequestException(
        `videoUrl은 미디어 파이프라인이 받아들이는 파일을 가리켜야 합니다. ${new ValidUrlExtension().defaultMessage(
          {} as never
        )}`
      );
    }

    const requestedVideoPlatforms = this.asArray(request.targetPlatforms);
    const videoVariants = buildSnapsVideoVariants({
      videoUrl,
      mediaId: mediaLibraryItem?.id || makeId(10),
      mediaPath: mediaLibraryItem?.path,
      thumbnail: thumbnail || mediaLibraryItem?.thumbnail,
      title: title || mediaLibraryItem?.alt || 'snaps short-form video',
      caption,
      targetPlatforms: requestedVideoPlatforms,
    });
    this.assertSupportedPlatforms(
      requestedVideoPlatforms,
      videoVariants.targetPlatforms,
      'short-form video',
      SNAPS_VIDEO_PLATFORMS
    );

    const scheduled = await this.scheduleVariantsForOrg(org.id, {
      variants: videoVariants.variants,
      integrations: this.asArray(request.integrations),
      publishDate: request.publishDate,
      scheduleType: this.cleanScheduleType(request.scheduleType) || 'draft',
    });
    await this.activity.record(org.id, {
      type: 'video',
      title:
        this.cleanScheduleType(request.scheduleType) === 'schedule'
          ? 'Attached short-form video to scheduled posts'
          : 'Attached short-form video to drafts',
      detail: {
        platforms: videoVariants.targetPlatforms,
        hasThumbnail: !!thumbnail,
        mediaId: mediaLibraryItem?.id,
        scheduleType: this.cleanScheduleType(request.scheduleType) || 'draft',
      },
    });
    // Same reason as the card news attach below: a warning that never reaches
    // the response is a warning the operator never sees.
    return {
      ...scheduled,
      warnings: [...videoVariants.warnings, ...(scheduled?.warnings || [])],
      mediaLibraryItem,
    };
  }

  @Post('/card-news/script')
  async cardNewsScript(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsCardNewsRequest
  ) {
    const { request, warnings } = this.normalizeCardNewsRequest(body);
    const deck = await this.cardNews.script(request);
    await this.activity.record(org.id, {
      type: 'card-news',
      title: 'Generated card-news deck',
      // provider, like the transform record above: all three results carry
      // one, and all three warn the operator when it is 'rule-fallback'.
      // Without it the history cannot tell a run the model wrote from one
      // the deterministic path produced, which is the first thing to check
      // when an old post reads badly.
      detail: {
        provider: deck.provider,
        slideCount: deck.slides.length,
        templateId: deck.templateId,
      },
    });
    return warnings.length ? { ...deck, warnings } : deck;
  }

  @Post('/card-news/generate')
  async cardNewsGenerate(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: { request?: SnapsCardNewsRequest; deck?: SnapsCardNewsDeck }
  ) {
    // A caller-supplied deck skips the service's own normalization, so the
    // slide cap has to be enforced here too - each slide becomes a PNG render
    // plus a media-library upload, and only the 50MB body limit would otherwise
    // bound how many a single request can ask for.
    const suppliedSlides = body?.deck?.slides as unknown;
    // Measured against the renderer: `slides: 'nope'` has a truthy .length, so
    // it passed the check below and reached renderDeck, which answered
    // "deck.slides.entries is not a function" - a 500 with a stack trace for
    // what is a malformed request. `slides: [null]` did the same. A string
    // element did not throw at all: it rendered a blank slide and uploaded it
    // to the media library.
    if (suppliedSlides != null && !Array.isArray(suppliedSlides)) {
      throw new BadRequestException('deck.slides는 배열이어야 합니다.');
    }
    if (Array.isArray(suppliedSlides)) {
      if (suppliedSlides.length > SNAPS_CARD_NEWS_MAX_SLIDES) {
        throw new BadRequestException(
          `deck.slides는 최대 ${SNAPS_CARD_NEWS_MAX_SLIDES}장까지만 허용됩니다.`
        );
      }
      const invalidIndex = suppliedSlides.findIndex(
        (slide) => !slide || typeof slide !== 'object' || Array.isArray(slide)
      );
      if (invalidIndex >= 0) {
        throw new BadRequestException(`deck.slides[${invalidIndex}]는 객체여야 합니다.`);
      }
    }

    // The renderer resolves an unknown templateId to editorial. Pin the same
    // answer onto the deck so the deck returned to the caller and the activity
    // entry name the template that was actually drawn, rather than the value
    // that was asked for and quietly ignored.
    const supplied = Array.isArray(suppliedSlides) && suppliedSlides.length;
    // Only the generated branch clamps a source, so only it can have
    // something to report - but that is the branch this route is normally
    // used through, and dropping the warning here would put it back exactly
    // where it was missing.
    const normalized = supplied
      ? { request: undefined, warnings: [] as string[] }
      : this.normalizeCardNewsRequest(body?.request);
    const deck = supplied
      ? {
          ...body.deck,
          templateId: resolveSnapsCardNewsTemplateId(
            body.deck.templateId
          ) as SnapsCardNewsDeck['templateId'],
        }
      : await this.cardNews.script(
          normalized.request as SnapsCardNewsRequest
        );

    const rendered = await this.cardNewsRenderer.renderDeck(deck);
    // The slide shows an ellipsis where its text ran out of room, which only
    // helps someone who opens the image. The caption trims are reported by the
    // variant builder and the model clamp by the transform; this was the one
    // cut nothing said out loud.
    const slideTrims = rendered
      .filter((slide) => (slide.trimmed || []).length)
      .map((slide) => {
        const parts = (slide.trimmed || []).map((what) =>
          what === 'heading' ? '제목' : '본문'
        );
        return `슬라이드 ${slide.order}의 ${parts.join('과 ')}이(가) 길어 ` +
          '이미지에서 잘렸습니다.';
      });
    const media = await Promise.all(
      rendered.map(async (slide) => {
        const uploaded = await this.cardNewsStorage.uploadFile({
          buffer: slide.buffer,
          mimetype: slide.mimetype,
          size: slide.buffer.length,
          originalname: slide.filename,
          filename: slide.filename,
          fieldname: 'file',
          destination: '',
          path: '',
          stream: new Readable(),
          encoding: '7bit',
        });
        return this.mediaService.saveFile(
          org.id,
          slide.filename,
          uploaded.path,
          `${deck.title} ${slide.order}`
        );
      })
    );

    await this.activity.record(org.id, {
      type: 'card-news',
      title: 'Rendered card-news slides',
      detail: { slideCount: media.length, templateId: deck.templateId },
    });

    // Both lists, not one or the other: a run can clamp the source and cut a
    // slide, and reporting only the first hides the second.
    const generateWarnings = [...normalized.warnings, ...slideTrims];
    return generateWarnings.length
      ? { deck, media, warnings: generateWarnings }
      : { deck, media };
  }

  @Post('/card-news/attach-to-draft')
  async attachCardNewsToDraft(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsAttachCardNewsDraftRequest
  ) {
    const request = body || ({} as SnapsAttachCardNewsDraftRequest);
    const media = this.asArray(request.media);
    if (!media.length) {
      throw new BadRequestException('media는 필수입니다.');
    }
    this.assertOperatorConfirmed(
      this.cleanScheduleType(request.scheduleType),
      request.operatorConfirmed
    );

    const requestedCardNewsPlatforms = this.asArray(request.targetPlatforms);
    const cardNewsVariants = buildSnapsCardNewsVariants({
      title: this.cleanOptionalString(request.title, 120),
      caption: this.cleanBodyText(request.caption, 2000),
      hashtags: this.asStringArray(request.hashtags),
      slides: media,
      targetPlatforms: requestedCardNewsPlatforms,
    });
    this.assertSupportedPlatforms(
      requestedCardNewsPlatforms,
      cardNewsVariants.targetPlatforms,
      'card news carousels',
      SNAPS_CARD_NEWS_PLATFORMS
    );

    const scheduled = await this.scheduleVariantsForOrg(org.id, {
      variants: cardNewsVariants.variants,
      integrations: this.asArray(request.integrations),
      publishDate: request.publishDate,
      scheduleType: this.cleanScheduleType(request.scheduleType) || 'draft',
    });
    await this.activity.record(org.id, {
      type: 'card-news',
      title:
        this.cleanScheduleType(request.scheduleType) === 'schedule'
          ? 'Attached card-news deck to scheduled posts'
          : 'Attached card-news deck to drafts',
      detail: {
        platforms: cardNewsVariants.targetPlatforms,
        slideCount: media.length,
        scheduleType: this.cleanScheduleType(request.scheduleType) || 'draft',
      },
    });
    // Per-platform attachment trimming happens in the variant builder, so its
    // warnings have to travel with the schedule result or the operator never
    // learns that a channel got fewer slides than the deck has.
    return {
      ...scheduled,
      warnings: [...cardNewsVariants.warnings, ...(scheduled?.warnings || [])],
    };
  }

  @Get('/activity')
  listActivity(@GetOrgFromRequest() org: SnapsOrganization) {
    return this.activity.list(org.id);
  }

  @Get('/export')
  async exportWorkspace(@GetOrgFromRequest() org: SnapsOrganization) {
    const [sources, styleExamples, reports, agentTasks, inboxItems, activity] =
      await Promise.all([
        this.library.listSources(org.id),
        this.rag.listExamples(org.id),
        this.library.listReports(org.id),
        this.agentTasks.exportTasks(org.id),
        this.inbox.listItems(org.id),
        this.activity.list(org.id),
      ]);

    return {
      product: 'snaps',
      organizationId: org.id,
      exportedAt: new Date().toISOString(),
      sources,
      styleExamples,
      reports,
      agentTasks,
      inboxItems,
      activity,
    };
  }

  @Post('/import')
  async importWorkspace(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsWorkspaceImportRequest
  ) {
    const [sources, styleExamples, reports, agentTasks, inboxItems, activity] = await Promise.all([
      this.library.importSources(org.id, this.asArray(body?.sources)),
      this.rag.importExamples(
        org.id,
        this.asArray(body?.styleExamples).length
          ? this.asArray(body?.styleExamples)
          : this.asArray(body?.ragExamples)
      ),
      this.library.importReports(org.id, this.asArray(body?.reports)),
      this.agentTasks.importTasks(org.id, this.asArray(body?.agentTasks)),
      this.inbox.importStoredItems(
        org.id,
        this.asArray(body?.inboxItems).length
          ? this.asArray(body?.inboxItems)
          : this.asArray(body?.feedbackItems)
      ),
      this.activity.importEntries(org.id, this.asArray(body?.activity)),
    ]);

    const summary = {
      sources,
      styleExamples,
      reports,
      agentTasks,
      inboxItems,
      activity,
    };
    await this.activity.record(org.id, {
      type: 'source',
      title: 'Imported snaps workspace backup',
      detail: summary,
    });

    return {
      product: 'snaps',
      importedAt: new Date().toISOString(),
      ...summary,
    };
  }

  private async pixelleRuntimeHealth() {
    const pixelleUrl = this.cleanOptionalString(process.env.PIXELLE_VIDEO_URL, 2000);
    if (!pixelleUrl) {
      return {
        configured: false,
        ok: false,
        runtimeOk: false,
        message: 'PIXELLE_VIDEO_URL is not configured.',
      };
    }

    const baseUrl = pixelleUrl.replace(/\/$/, '');
    // Both probes hit the same host and neither needs the other's answer, so
    // awaiting them in turn paid both timeouts. Measured against a host that
    // accepts a connection and never answers - a Pixelle container that is up
    // but wedged, which is exactly when a health check matters: 6,022ms in
    // sequence against 3,524ms together. /snaps/health runs on every workspace
    // load. OllamaClient.health() was changed for the same reason.
    const [service, runtime] = await Promise.all([
      this.fetchJsonWithTimeout(`${baseUrl}/health`, 2500),
      this.fetchJsonWithTimeout(`${baseUrl}/snaps/runtime`, 3500),
    ]);
    const runtimeRecord = this.asRecord(runtime.payload);
    const serviceRecord = this.asRecord(service.payload);

    return {
      configured: true,
      ok: service.ok && runtime.ok && runtimeRecord.ok === true,
      serviceOk: service.ok,
      runtimeOk: runtime.ok && runtimeRecord.ok === true,
      url: baseUrl,
      status: this.cleanOptionalString(serviceRecord.status, 80) || undefined,
      version: this.cleanOptionalString(serviceRecord.version, 80) || undefined,
      comfyui: this.asRecord(runtimeRecord.comfyui),
      workflows: this.asRecord(runtimeRecord.workflows),
      llm: this.asRecord(runtimeRecord.llm),
      message:
        service.error ||
        runtime.error ||
        this.cleanOptionalString(runtimeRecord.message, 300) ||
        undefined,
    };
  }

  /**
   * Shorts-Maker ships no dedicated health route, so this probes an API route
   * that answers in JSON. Calling render-jobs without an id is expected to
   * return 400 STUDIO_RENDER_JOB_ID_REQUIRED, and reaching that check proves
   * three things at once: the container is up, Next.js routing works, and the
   * request got past requireSessionUser - i.e. the AUTH_LOCAL_BYPASS assumption
   * this integration depends on is actually holding. See
   * docs/snaps-shorts-maker.md.
   */
  private async shortsMakerHealth() {
    const configuredUrl = this.cleanOptionalString(process.env.SHORTS_MAKER_URL, 2000);
    if (!configuredUrl) {
      return {
        configured: false,
        ok: false,
        message: 'SHORTS_MAKER_URL is not configured.',
      };
    }

    const baseUrl = configuredUrl.replace(/\/$/, '');
    const probe = await this.fetchJsonWithTimeout(
      `${baseUrl}/api/studio/render-jobs`,
      2500
    );
    const payload = this.asRecord(probe.payload);
    // The timeout helper omits `status` entirely when the request never got a
    // response (DNS failure, refused connection, abort), so its presence is
    // what distinguishes "answered" from "never reached".
    const httpStatus = 'status' in probe ? probe.status : undefined;
    const reachable = httpStatus !== undefined;
    const authPassed = payload.errorCode === 'STUDIO_RENDER_JOB_ID_REQUIRED';

    return {
      configured: true,
      ok: authPassed,
      reachable,
      authPassed,
      url: baseUrl,
      status: httpStatus,
      ...(authPassed
        ? {}
        : {
            // A 5xx means the container (or something in front of it) answered
            // and failed. Pointing that at AUTH_LOCAL_BYPASS sends the operator
            // after the wrong thing.
            message: !reachable
              ? 'Shorts-Maker is unreachable at SHORTS_MAKER_URL.'
              : (httpStatus ?? 0) >= 500
              ? `Shorts-Maker answered with ${httpStatus}; it is reachable but not healthy.`
              : 'Shorts-Maker answered but not with the expected render-jobs validation error; check AUTH_LOCAL_BYPASS on that container.',
          }),
      ...(probe.error ? { error: probe.error } : {}),
    };
  }

  /**
   * Splits the platforms an operator asked for into the ones that actually
   * reached a channel and the ones the publishing builder skipped, so the
   * activity history records what happened rather than what was requested.
   */
  private scheduledPlatformDetail(
    requested: string[],
    schedulable?: Array<{ platform?: string }>
  ) {
    const reached = (schedulable || [])
      .map((variant) => String(variant?.platform || ''))
      .filter(Boolean);
    const skipped = requested.filter((platform) => !reached.includes(platform));
    return {
      platforms: reached,
      requestedPlatforms: requested,
      ...(skipped.length ? { skippedPlatforms: skipped } : {}),
    };
  }

  /**
   * Bounds one provider analytics call.
   *
   * The loops around these already turn a failure into a warning and carry on,
   * but a provider that accepts the connection and then stalls is not a
   * failure - it is a wait, and there was nothing to end it. One stalled channel
   * held /snaps/report/from-platform-analytics open indefinitely, and the
   * workspace has no timeout of its own, so the operator watched a spinner.
   *
   * The underlying call cannot be cancelled - it goes through the core
   * integration service, which takes no abort signal - so it keeps running in
   * the background and its Redis cache entry still lands. What ends here is the
   * waiting, which is what the report needed.
   */
  private async withAnalyticsTimeout<T>(work: Promise<T>, label: string): Promise<T> {
    const timeoutMs = snapsTimeoutMs(
      process.env.SNAPS_ANALYTICS_TIMEOUT_MS,
      15000
    );
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error(`${label} 분석이 ${timeoutMs}ms 안에 응답하지 않았습니다`)),
            timeoutMs
          );
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private async fetchJsonWithTimeout(url: string, timeoutMs: number) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      const text = await response.text();
      // A non-JSON body used to throw out of here into the catch below, which
      // returns no `status` - and the caller reads a missing status as "never
      // reached". A proxy answering with an HTML 502 was therefore reported as
      // "Shorts-Maker is unreachable", sending the operator to check networking
      // for a container that had in fact answered. Keep the status and hand the
      // body back as a snippet, the way ShortsMakerClientService.readJsonPayload
      // already does.
      let payload: unknown = {};
      let nonJsonBody = '';
      if (text.trim()) {
        try {
          payload = JSON.parse(text);
        } catch {
          nonJsonBody = snapsClampText(text.trim(), 300);
        }
      }
      const ok = response.ok && !nonJsonBody;
      return {
        ok,
        status: response.status,
        payload,
        ...(ok
          ? {}
          : {
              error: nonJsonBody
                ? `${response.status} ${response.statusText} (non-JSON body: ${nonJsonBody})`
                : `${response.status} ${response.statusText}`,
            }),
      };
    } catch (error) {
      return {
        ok: false,
        error: this.compactError(error),
        payload: {},
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Delegates to the shared helper; see snapsMediaFileName for why. */
  private fileNameFromUrl(url: string) {
    return snapsMediaFileName(url);
  }

  /**
   * Drops the stored vector before a style example leaves the API.
   *
   * The vector store returns the whole record, embedding included, and both RAG
   * routes handed it straight to the browser. Measured on five examples with a
   * 768-dimension embedding: 78,376 bytes of response where 1,206 carry
   * everything the workspace uses. The store keeps up to 200 examples, and the
   * workspace lists them on every load.
   */
  /**
   * What a saved style example looks like to the caller.
   *
   * Two things were wrong with returning the stored record. The list route
   * strips the embedding and the three save routes did not, so the same
   * record had two shapes depending on which way you got it - and the vector
   * is several kilobytes of JSON the client never reads. Worse, an embed call
   * that fails is swallowed on purpose (a style example is still worth
   * keeping without one), so a brief Ollama outage silently produced examples
   * that only keyword search can find. The vector store says as much in its
   * own comment. `embedded` is the one bit that says which kind this is;
   * /snaps/rag/rebuild is the fix, and it already reports the same fact as
   * rebuilt-vs-fallback counts.
   */
  private savedStyleExample<T extends { embedding?: number[] }>(saved: T) {
    return {
      ...this.withoutEmbedding(saved),
      embedded: !!saved.embedding?.length,
    };
  }

  private withoutEmbedding<T extends { embedding?: number[] }>(record: T) {
    const { embedding, ...rest } = record;
    return rest;
  }

  private asArray<T>(value: T[] | undefined | null): T[] {
    return Array.isArray(value) ? value : [];
  }

  private asStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.map((item) => String(item)).filter(Boolean)
      : [];
  }

  /**
   * Clamps source text and says what it had to leave out.
   *
   * Grapheme-safe, because the cut position can otherwise land inside an
   * emoji and put a lone surrogate into the prompt.
   */
  private clampSourceText(value: unknown, limit: number) {
    const flattened =
      typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
    const sourceText = snapsClampText(flattened, limit);
    return {
      sourceText,
      warnings:
        flattened.length > sourceText.length
          ? [
              `원문이 ${flattened.length.toLocaleString('ko-KR')}자여서 앞 ` +
                `${sourceText.length.toLocaleString('ko-KR')}자만 사용했습니다. ` +
                '나머지는 나눠서 다시 시도하세요.',
            ]
          : [],
    };
  }

  /**
   * Cleans text the operator wrote as a body, keeping its line breaks.
   *
   * `cleanOptionalString` flattens every run of whitespace, which is right
   * for a title or an id and wrong for a body. Measured through this
   * controller: a seven-line reply draft and a seven-line RAG style example
   * both came back as one line. Publish-reply then sends that to a real
   * channel, and the style example - which exists to teach the model a
   * writing style - teaches one with no line breaks at all.
   *
   * Runs of spaces and tabs inside a line still collapse, and a run of blank
   * lines is capped at one, so a paste out of a word processor does not
   * arrive as a column of empty rows.
   */
  /** Delegates; see snapsCleanBodyText for why this is not cleanOptionalString. */
  private cleanBodyText(value: unknown, maxLength: number) {
    return snapsCleanBodyText(value, maxLength);
  }

  private cleanOptionalString(value: unknown, maxLength = 1000) {
    return typeof value === 'string'
      ? snapsClampText(value.trim().replace(/\s+/g, ' '), maxLength)
      : '';
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  /**
   * The transform request, and what was lost getting there.
   *
   * `cleanOptionalString` cuts silently. Measured through this route: an
   * 80,000 character paste came back as a successful transform with
   * `warnings: []` - thirty thousand characters of the operator's own
   * article gone, with the run reporting success. Every other place snaps
   * drops something says so; this one did not.
   *
   * The warning travels with the result rather than being thrown, because
   * transforming the first 50,000 characters is a reasonable thing to do -
   * it just is not the thing that was asked for.
   *
   * Returning a pair rather than adding an optional out-parameter is
   * deliberate: all three transform routes call this, and the compiler now
   * makes each of them deal with the warning. A guard would only catch the
   * ones someone remembered to guard.
   */
  private normalizeTransformRequest(body?: SnapsTransformRequestDto): {
    request: SnapsTransformRequestDto;
    warnings: string[];
  } {
    const request = (body || {}) as Partial<SnapsTransformRequestDto>;
    const rawSourceLength =
      typeof request.sourceText === 'string'
        ? request.sourceText.trim().replace(/\s+/g, ' ').length
        : 0;
    // Grapheme-safe, so a cut at the limit cannot land inside an emoji and
    // send a lone surrogate into the prompt.
    const sourceText = snapsClampText(
      typeof request.sourceText === 'string'
        ? request.sourceText.trim().replace(/\s+/g, ' ')
        : '',
      SNAPS_TRANSFORM_SOURCE_LIMIT
    );
    if (sourceText.length < 5) {
      throw new BadRequestException('sourceText는 최소 5자 이상이어야 합니다.');
    }
    // Asking only for platforms snaps does not support used to return Threads
    // and Instagram variants - channels nobody had named - as a success. The
    // card news and video paths already refuse that by name; so does this one.
    const requestedPlatforms = this.asStringArray(request.targetPlatforms);
    this.assertSupportedPlatforms(
      requestedPlatforms,
      normalizeTargetPlatforms(requestedPlatforms),
      '콘텐츠 변환',
      snapsTargetPlatforms
    );

    const warnings =
      rawSourceLength > sourceText.length
        ? [
            `원문이 ${rawSourceLength.toLocaleString('ko-KR')}자여서 앞 ` +
              `${sourceText.length.toLocaleString('ko-KR')}자만 변환했습니다. ` +
              '나머지는 나눠서 다시 변환하세요.',
          ]
        : [];

    return {
      warnings,
      request: {
        sourceText,
        sourcePlatform:
          this.cleanOptionalString(request.sourcePlatform, 120) || undefined,
        targetPlatforms: requestedPlatforms as SnapsTargetPlatform[],
        tone: this.cleanOptionalString(request.tone, 200) || undefined,
        topic: this.cleanOptionalString(request.topic, 200) || undefined,
        useRag:
          typeof request.useRag === 'boolean' ? request.useRag : undefined,
      },
    };
  }

  private cleanScheduleType(value: unknown): 'draft' | 'schedule' | undefined {
    return value === 'draft' || value === 'schedule' ? value : undefined;
  }

  private assertExternalPublishConfirmed(operatorConfirmed?: boolean) {
    if (operatorConfirmed !== true) {
      throw new BadRequestException(
        '연결된 채널에 답글을 게시하려면 operatorConfirmed 확인이 먼저 필요합니다.'
      );
    }
  }

  private assertOperatorConfirmed(
    scheduleType: 'draft' | 'schedule' | undefined,
    operatorConfirmed?: boolean
  ) {
    if (scheduleType === 'schedule' && operatorConfirmed !== true) {
      throw new BadRequestException(
        '예약 게시물을 만들려면 operatorConfirmed 확인이 먼저 필요합니다.'
      );
    }
  }

  /**
   * Short-form video cannot go to x/linkedin and a card news carousel cannot go
   * to youtube, so a caller can name platforms that all drop out of the
   * builder's allow-list. Scheduling zero variants then returns 200 having
   * created nothing - the media file is uploaded, no post exists, and nothing
   * says why. Fail loudly with the supported list instead.
   */
  private assertSupportedPlatforms(
    requested: unknown[],
    resolved: SnapsTargetPlatform[],
    kind: string,
    supported: readonly string[]
  ) {
    const rejected = requested
      .map((platform) => this.cleanOptionalString(platform, 60))
      .filter(
        (platform) =>
          !!platform &&
          !resolved.includes(platform as SnapsTargetPlatform)
      );

    if (requested.length && !resolved.length) {
      // Naming only the supported list makes the operator diff it against
      // their own request. The transform path already names what it threw
      // out; this one did not.
      throw new BadRequestException(
        `요청한 targetPlatforms 중 ${kind}을(를) 지원하는 채널이 없습니다. ` +
          `지원하지 않는 채널: ${rejected.join(', ')}. ` +
          `지원 채널: ${supported.join(', ')}.`
      );
    }

  }

  private normalizeStyleExampleRequest(
    body?: SnapsStyleExampleDto
  ): SnapsStyleExampleDto {
    const request = (body || {}) as Partial<SnapsStyleExampleDto>;
    const platform = this.cleanOptionalString(request.platform, 60);
    const content = this.cleanBodyText(request.content, 50000);
    if (!snapsTargetPlatforms.includes(platform as SnapsTargetPlatform)) {
      throw new BadRequestException('platform은 필수입니다.');
    }
    if (content.length < 5) {
      throw new BadRequestException('content는 최소 5자 이상이어야 합니다.');
    }

    return {
      platform: platform as SnapsTargetPlatform,
      content,
      authorType: this.cleanOptionalString(request.authorType, 120) || undefined,
      topic: this.cleanOptionalString(request.topic, 200) || undefined,
      tone: this.cleanOptionalString(request.tone, 200) || undefined,
      sourceUrl: this.cleanOptionalString(request.sourceUrl, 2000) || undefined,
      metrics: this.asRecord(request.metrics),
    };
  }

  private normalizePromoteToRagRequest(
    body?: SnapsPromoteSourceToRagDto
  ): SnapsPromoteSourceToRagDto {
    const request = (body || {}) as Partial<SnapsPromoteSourceToRagDto>;
    const platform = this.cleanOptionalString(request.platform, 60);
    if (!snapsTargetPlatforms.includes(platform as SnapsTargetPlatform)) {
      throw new BadRequestException('platform은 필수입니다.');
    }

    return {
      platform: platform as SnapsTargetPlatform,
      authorType: this.cleanOptionalString(request.authorType, 120) || undefined,
      topic: this.cleanOptionalString(request.topic, 200) || undefined,
      tone: this.cleanOptionalString(request.tone, 200) || undefined,
    };
  }

  private normalizeShortVideoRequest(body?: SnapsShortVideoRequest) {
    const request = (body || {}) as Partial<SnapsShortVideoRequest>;
    const { sourceText, warnings } = this.clampSourceText(
      request.sourceText,
      SNAPS_SHORT_VIDEO_SOURCE_LIMIT
    );
    if (!sourceText) {
      throw new BadRequestException('sourceText는 필수입니다.');
    }
    // An unsupported platform used to fall through to the YouTube styling:
    // asking for facebook returned a script titled 'snaps Shorts 초안' tagged
    // #shorts, with nothing saying the request had not been honoured. The
    // scheduling path already refuses unsupported video platforms by name -
    // see assertSupportedPlatforms - so refuse here the same way.
    const platform = this.cleanOptionalString(request.platform, 40);
    if (
      platform &&
      !(SNAPS_VIDEO_PLATFORMS as readonly string[]).includes(platform)
    ) {
      throw new BadRequestException(
        `${platform}은(는) 쇼츠 대본을 지원하지 않습니다. 지원 채널: ${SNAPS_VIDEO_PLATFORMS.join(', ')}.`
      );
    }

    return {
      warnings,
      request: {
        ...request,
        sourceText,
      } as SnapsShortVideoRequest,
    };
  }

  private normalizeShortsMakerTopicToScriptRequest(
    body?: SnapsShortsMakerTopicToScriptRequest
  ): SnapsShortsMakerTopicToScriptRequest {
    const request = (body || {}) as Partial<SnapsShortsMakerTopicToScriptRequest>;
    const topic = this.cleanOptionalString(request.topic, 160);
    if (!topic) {
      throw new BadRequestException('topic은 필수입니다.');
    }

    return {
      topic,
      mode: this.shortsMakerMode(request.mode),
      publishCategory:
        this.cleanOptionalString(request.publishCategory, 200) || undefined,
      templateId: this.cleanOptionalString(request.templateId, 120) || undefined,
      codexModel: this.cleanOptionalString(request.codexModel, 120) || undefined,
    };
  }

  private shortsMakerMode(value?: unknown): SnapsShortsMakerScriptMode {
    return value === 'dialogue' ? 'dialogue' : 'normal';
  }

  private normalizeShortsMakerRenderJobRequest(
    body?: SnapsShortsMakerRenderJobRequest
  ): SnapsShortsMakerRenderJobRequest {
    const request = (body || {}) as Partial<SnapsShortsMakerRenderJobRequest>;
    // Checking only the shape let a whitespace fullAudio, a negative or zero
    // duration, and frame durations of 'a', null, -1 or NaN through to
    // Shorts-Maker. NaN is the worst of them: JSON.stringify turns it into
    // null, so the render service receives a payload that is not the one the
    // caller sent. Reject at the boundary, naming the field, instead of
    // surfacing a confusing failure from the far end of the call.
    const fullAudio = this.cleanOptionalString(request.fullAudio, 4000);
    if (!fullAudio) {
      throw new BadRequestException('fullAudio는 필수입니다.');
    }
    if (!request.visuals || typeof request.visuals !== 'object') {
      throw new BadRequestException('visuals는 필수입니다.');
    }
    if (!Array.isArray(request.frameDurationsSec) || !request.frameDurationsSec.length) {
      throw new BadRequestException('frameDurationsSec는 필수입니다.');
    }
    // Strict, like the durationMs check below and like the declared type: a
    // numeric string is a different contract, and accepting it here while
    // rejecting it there would be the worst of both.
    const frameDurationsSec = request.frameDurationsSec as number[];
    if (frameDurationsSec.some((value) => !Number.isFinite(value) || value <= 0)) {
      throw new BadRequestException(
        'frameDurationsSec의 각 항목은 0보다 큰 숫자여야 합니다.'
      );
    }
    if (!Number.isFinite(request.durationMs) || Number(request.durationMs) <= 0) {
      throw new BadRequestException('durationMs는 0보다 큰 숫자여야 합니다.');
    }

    return {
      fullAudio,
      narration: this.asRecord(request.narration),
      durationMs: Number(request.durationMs),
      frameDurationsSec,
      audioOptions: this.asRecord(request.audioOptions),
      visuals: this.asRecord(request.visuals),
      asset: request.asset,
      meta: this.asRecord(request.meta),
    };
  }

  private normalizeCardNewsRequest(body?: SnapsCardNewsRequest) {
    const request = (body || {}) as Partial<SnapsCardNewsRequest>;
    const { sourceText, warnings } = this.clampSourceText(
      request.sourceText,
      SNAPS_CARD_NEWS_SOURCE_LIMIT
    );
    if (!sourceText) {
      throw new BadRequestException('sourceText는 필수입니다.');
    }

    return {
      warnings,
      request: {
        ...request,
        sourceText,
      } as SnapsCardNewsRequest,
    };
  }

  private normalizeAnalyticsReportRequest(body?: SnapsAnalyticsReportRequest) {
    const request =
      body && typeof body === 'object' && !Array.isArray(body)
        ? body
        : ({} as SnapsAnalyticsReportRequest);
    const timestamp = this.cleanTimestamp(request.date);

    return {
      title:
        this.cleanOptionalString(request.title, 160) ||
        'snaps analytics report',
      date: String(timestamp),
      timestamp,
      integrationIds: this.cleanStringArray(request.integrationIds, 200, 50),
      postIds: this.cleanStringArray(request.postIds, 200, 100),
    };
  }

  private normalizePostCommentImportRequest(
    body?: SnapsFeedbackImportPostCommentsDto
  ) {
    const request =
      body && typeof body === 'object' && !Array.isArray(body)
        ? body
        : ({} as Partial<SnapsFeedbackImportPostCommentsDto>);
    const defaultPlatform = this.validPlatform(request.defaultPlatform);
    const sources = this.asArray(request.sources)
      .map((source) =>
        source && typeof source === 'object' && !Array.isArray(source)
          ? source
          : undefined
      )
      .filter((source): source is NonNullable<typeof source> => !!source)
      .map((source) => ({
        postId: this.cleanOptionalString(source.postId, 200),
        platform: this.validPlatform(source.platform),
        sourceUrl: this.cleanOptionalString(source.sourceUrl, 2000) || undefined,
      }))
      .filter((source) => !!source.postId);

    // Exact repeats only - the same post under a different platform label is a
    // different request, however odd. The inbox deduplicates what it stores, so
    // a repeated source never produced duplicate feedback; what it did produce
    // was a second getComments() round trip per repeat, and an `imported` count
    // taken before that deduplication, which the activity log then kept as the
    // number of comments brought in.
    const seenSources = new Set<string>();
    const uniqueSources = sources.filter((source) => {
      const key = [source.postId, source.platform || '', source.sourceUrl || ''].join(
        '::'
      );
      if (seenSources.has(key)) {
        return false;
      }
      seenSources.add(key);
      return true;
    });

    return {
      sources: uniqueSources,
      defaultPlatform,
    };
  }

  private validPlatform(value: unknown): SnapsTargetPlatform | undefined {
    const platform = this.cleanOptionalString(value, 60);
    return snapsTargetPlatforms.includes(platform as SnapsTargetPlatform)
      ? (platform as SnapsTargetPlatform)
      : undefined;
  }

  /**
   * A list of ids, each appearing once.
   *
   * The analytics report sums every metric it is handed, so a channel listed
   * twice was counted twice and the report stated the doubled figure as fact -
   * and the provider was asked twice, each call carrying its own timeout.
   * Deduplication happens before the cap, so fifty distinct ids still fit where
   * fifty mentions of one id used to.
   */
  private cleanStringArray(value: unknown, maxLength: number, maxItems: number) {
    if (!Array.isArray(value)) {
      return [];
    }
    const seen = new Set<string>();
    const kept: string[] = [];
    for (const item of value) {
      const cleaned = this.cleanOptionalString(item, maxLength);
      if (!cleaned || seen.has(cleaned)) {
        continue;
      }
      seen.add(cleaned);
      kept.push(cleaned);
      if (kept.length >= maxItems) {
        break;
      }
    }
    return kept;
  }

  private cleanTimestamp(value: unknown) {
    const numeric =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN;
    return Number.isFinite(numeric) && numeric > 0 ? numeric : Date.now();
  }

  private compactError(value: unknown) {
    const message =
      value instanceof Error
        ? value.message
        : typeof value === 'string'
        ? value
        : 'unknown error';
    return snapsClampText(message.replace(/\s+/g, ' '), 240);
  }

  private asAnalyticsOrganization(org: SnapsOrganization): Organization {
    return { id: org.id } as Organization;
  }
}
