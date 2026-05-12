import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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
import { buildSnapsVideoVariants } from '@gitroom/nestjs-libraries/snaps/video/video-variant.builder';
import { snapsAnalyticsToMetricInputs } from '@gitroom/nestjs-libraries/snaps/analytics/analytics-metric.mapper';
import { CreatePostDto } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';
import { Organization } from '@prisma/client';
import {
  SnapsAgentCommandRequest,
  SnapsCommandPlannerService,
} from '@gitroom/nestjs-libraries/snaps/agent/command-planner.service';
import { SnapsAgentTaskService } from '@gitroom/nestjs-libraries/snaps/agent/agent-task.service';

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

@ApiTags('snaps')
@Controller(['/snaps', '/api/snaps'])
export class SnapsController {
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
    private readonly postsService: PostsService
  ) {}

  @Get('/health')
  async health() {
    const [ollama, pixelle] = await Promise.all([
      this.ollama.health(),
      this.pixelleRuntimeHealth(),
    ]);
    return {
      product: 'snaps',
      ok: ollama.ok,
      ollama,
      rag: {
        enabled: process.env.SNAPS_RAG_ENABLED !== 'false',
        topK: Number(process.env.SNAPS_RAG_TOP_K || 5),
      },
      pixelle,
      koreanSns: {
        naverCafeConfigured:
          !!process.env.NAVER_CLIENT_ID && !!process.env.NAVER_CLIENT_SECRET,
        naverBlogMode: 'assist',
        kakaoTalkMode: 'assist',
      },
      storage: {
        dataDir: process.env.SNAPS_DATA_DIR || './var/snaps',
      },
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
      throw new NotFoundException('snaps agent task was not found.');
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
      throw new NotFoundException('snaps agent task was not found.');
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
      throw new NotFoundException('snaps agent task was not found.');
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
      throw new NotFoundException('snaps agent task was not found.');
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
    const request = this.normalizeTransformRequest(body);
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
    return result;
  }

  @Post('/transform-and-draft')
  async transformAndDraft(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsTransformRequestDto
  ) {
    const request = this.normalizeTransformRequest(body);
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
    return this.transformer.buildDraftPayload(result);
  }

  @Post('/transform-and-schedule')
  async transformAndSchedule(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsTransformAndScheduleRequestDto
  ) {
    const request = this.normalizeTransformRequest(body);
    const scheduleRequest =
      (body || {}) as Partial<SnapsTransformAndScheduleRequestDto>;
    this.assertOperatorConfirmed(
      this.cleanScheduleType(scheduleRequest.scheduleType),
      scheduleRequest.operatorConfirmed
    );
    const result = await this.transformer.transform(org.id, request);
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
        platforms: result.variants.map((variant) => variant.platform),
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
        platforms: variants.map((variant) => variant.platform),
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
    return saved;
  }

  @Get('/rag/examples')
  listStyleExamples(@GetOrgFromRequest() org: SnapsOrganization) {
    return this.rag.listExamples(org.id);
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
  searchStyleExamples(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Query('query') query: string,
    @Query('platform') platform?: string,
    @Query('topK') topK?: string
  ) {
    return this.rag.search(org.id, query || '', platform, Number(topK || 5));
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
      throw new NotFoundException('snaps source was not found.');
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
    return saved;
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
        const analytics = await this.integrationService.checkAnalytics(
          this.asAnalyticsOrganization(org),
          integrationId,
          date
        );
        metrics.push(...snapsAnalyticsToMetricInputs(integrationId, analytics));
      } catch (error) {
        warnings.push(
          `Skipped integration analytics ${integrationId}: ${this.compactError(error)}`
        );
      }
    }

    for (const postId of postIds) {
      try {
        const analytics = await this.postsService.checkPostAnalytics(
          org.id,
          postId,
          timestamp
        );
        if (Array.isArray(analytics)) {
          metrics.push(...snapsAnalyticsToMetricInputs(postId, analytics));
        }
      } catch (error) {
        warnings.push(
          `Skipped post analytics ${postId}: ${this.compactError(error)}`
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
      throw new NotFoundException('snaps report was not found.');
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
      throw new NotFoundException('snaps report was not found.');
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
    return saved;
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
      detail: { total: summary.total },
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
    const reply = this.cleanOptionalString(request.reply, 2000);
    if (!postId) {
      throw new BadRequestException('postId is required.');
    }
    if (!reply) {
      throw new BadRequestException('reply is required.');
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
    const reply = this.cleanOptionalString(request.reply, 2000);
    if (!integrationId) {
      throw new BadRequestException('integrationId is required.');
    }
    if (!platformPostId) {
      throw new BadRequestException('platformPostId is required.');
    }
    if (!reply) {
      throw new BadRequestException('reply is required.');
    }

    const integration = await this.integrationService.getIntegrationById(
      org.id,
      integrationId
    );
    if (!integration) {
      throw new NotFoundException('snaps reply integration was not found.');
    }

    const provider = this.integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );
    if (!provider?.comment) {
      throw new BadRequestException(
        `${integration.providerIdentifier} does not support direct comments.`
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
    await this.activity.record(org.id, {
      type: 'inbox',
      title: 'Published feedback reply',
      detail: {
        integrationId: integration.id,
        provider: integration.providerIdentifier,
        platformPostId,
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
    const request = this.normalizeShortVideoRequest(body);
    const script = await this.shortVideo.script(request);
    await this.activity.record(org.id, {
      type: 'video',
      title: 'Generated shorts script',
      detail: { platform: request.platform, durationSeconds: request.durationSeconds },
    });
    return script;
  }

  @Post('/video/generate-short')
  async generateShort(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsShortVideoRequest
  ) {
    const request = this.normalizeShortVideoRequest(body);
    const generated = await this.shortVideo.generate(request);
    await this.activity.record(org.id, {
      type: 'video',
      title: 'Requested Pixelle short-form video',
      detail: { platform: request.platform, durationSeconds: request.durationSeconds },
    });
    return generated;
  }

  @Get('/video/status/:jobId')
  videoStatus(@Param('jobId') jobId: string) {
    return this.shortVideo.status(jobId);
  }

  @Post('/video/attach-to-draft')
  async attachVideoToDraft(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsAttachVideoDraftRequest
  ) {
    const request = body || ({} as SnapsAttachVideoDraftRequest);
    const videoUrl = this.cleanOptionalString(request.videoUrl, 2000);
    const title = this.cleanOptionalString(request.title, 120);
    const caption = this.cleanOptionalString(request.caption, 1000);
    const thumbnail = this.cleanOptionalString(request.thumbnail, 2000);

    if (!videoUrl) {
      throw new BadRequestException('videoUrl is required.');
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

    const videoVariants = buildSnapsVideoVariants({
      videoUrl,
      mediaId: mediaLibraryItem?.id || makeId(10),
      mediaPath: mediaLibraryItem?.path,
      thumbnail: thumbnail || mediaLibraryItem?.thumbnail,
      title: title || mediaLibraryItem?.alt || 'snaps short-form video',
      caption,
      targetPlatforms: this.asArray(request.targetPlatforms),
    });

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
    return {
      ...scheduled,
      mediaLibraryItem,
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
    const service = await this.fetchJsonWithTimeout(`${baseUrl}/health`, 2500);
    const runtime = await this.fetchJsonWithTimeout(`${baseUrl}/snaps/runtime`, 3500);
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
      const payload = text ? JSON.parse(text) : {};
      return {
        ok: response.ok,
        status: response.status,
        payload,
        ...(response.ok ? {} : { error: `${response.status} ${response.statusText}` }),
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

  private fileNameFromUrl(url: string) {
    const fallback = `snaps-short-${makeId(8)}.mp4`;
    try {
      const parsed = new URL(url);
      return decodeURIComponent(parsed.pathname.split('/').pop() || fallback)
        .replace(/[^\w.\-가-힣]/g, '_')
        .slice(0, 120) || fallback;
    } catch {
      return fallback;
    }
  }

  private asArray<T>(value: T[] | undefined | null): T[] {
    return Array.isArray(value) ? value : [];
  }

  private asStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.map((item) => String(item)).filter(Boolean)
      : [];
  }

  private cleanOptionalString(value: unknown, maxLength = 1000) {
    return typeof value === 'string'
      ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength)
      : '';
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private normalizeTransformRequest(
    body?: SnapsTransformRequestDto
  ): SnapsTransformRequestDto {
    const request = (body || {}) as Partial<SnapsTransformRequestDto>;
    const sourceText = this.cleanOptionalString(request.sourceText, 50000);
    if (sourceText.length < 5) {
      throw new BadRequestException('sourceText must be at least 5 characters.');
    }

    return {
      sourceText,
      sourcePlatform:
        this.cleanOptionalString(request.sourcePlatform, 120) || undefined,
      targetPlatforms: this.asStringArray(
        request.targetPlatforms
      ) as SnapsTargetPlatform[],
      tone: this.cleanOptionalString(request.tone, 200) || undefined,
      topic: this.cleanOptionalString(request.topic, 200) || undefined,
      useRag:
        typeof request.useRag === 'boolean' ? request.useRag : undefined,
    };
  }

  private cleanScheduleType(value: unknown): 'draft' | 'schedule' | undefined {
    return value === 'draft' || value === 'schedule' ? value : undefined;
  }

  private assertOperatorConfirmed(
    scheduleType: 'draft' | 'schedule' | undefined,
    operatorConfirmed?: boolean
  ) {
    if (scheduleType === 'schedule' && operatorConfirmed !== true) {
      throw new BadRequestException(
        'operatorConfirmed is required before creating scheduled snaps posts.'
      );
    }
  }

  private normalizeStyleExampleRequest(
    body?: SnapsStyleExampleDto
  ): SnapsStyleExampleDto {
    const request = (body || {}) as Partial<SnapsStyleExampleDto>;
    const platform = this.cleanOptionalString(request.platform, 60);
    const content = this.cleanOptionalString(request.content, 50000);
    if (!snapsTargetPlatforms.includes(platform as SnapsTargetPlatform)) {
      throw new BadRequestException('platform is required.');
    }
    if (content.length < 5) {
      throw new BadRequestException('content must be at least 5 characters.');
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
      throw new BadRequestException('platform is required.');
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
    const sourceText = this.cleanOptionalString(request.sourceText, 5000);
    if (!sourceText) {
      throw new BadRequestException('sourceText is required.');
    }

    return {
      ...request,
      sourceText,
    } as SnapsShortVideoRequest;
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

    return {
      sources,
      defaultPlatform,
    };
  }

  private validPlatform(value: unknown): SnapsTargetPlatform | undefined {
    const platform = this.cleanOptionalString(value, 60);
    return snapsTargetPlatforms.includes(platform as SnapsTargetPlatform)
      ? (platform as SnapsTargetPlatform)
      : undefined;
  }

  private cleanStringArray(value: unknown, maxLength: number, maxItems: number) {
    return Array.isArray(value)
      ? value
          .map((item) => this.cleanOptionalString(item, maxLength))
          .filter(Boolean)
          .slice(0, maxItems)
      : [];
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
    return message.replace(/\s+/g, ' ').slice(0, 240);
  }

  private asAnalyticsOrganization(org: SnapsOrganization): Organization {
    return { id: org.id } as Organization;
  }
}
