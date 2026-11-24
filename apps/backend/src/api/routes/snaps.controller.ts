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
import {
  SnapsVideoVoiceoverCaptionRequest,
  SnapsVideoVoiceoverCaptionService,
} from '@gitroom/nestjs-libraries/snaps/video/voiceover-caption.service';
import {
  SnapsVideoPublishGuardRequest,
  SnapsVideoPublishGuardService,
} from '@gitroom/nestjs-libraries/snaps/video/video-publish-guard.service';
import {
  SnapsInboxAssignmentRequest,
  SnapsFeedbackInboxService,
  SnapsFeedbackStatus,
  SnapsInboxNoteInput,
  SnapsReplyTemplateInput,
} from '@gitroom/nestjs-libraries/snaps/inbox/feedback-inbox.service';
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
  snapsContentLength,
  snapsPlatformRules,
  snapsTargetPlatforms,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import { cleanSnapsMultilineText } from '@gitroom/nestjs-libraries/snaps/utils/multiline-text';
import { runSnapsSerialized } from '@gitroom/nestjs-libraries/snaps/utils/serialized-store';
import { createHash } from 'crypto';
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
import {
  SnapsLinkAttributionService,
  SnapsSalesCampaignInput,
  SnapsSalesEventInput,
  SnapsSalesProposalRequest,
} from '@gitroom/nestjs-libraries/snaps/sales/link-attribution.service';
import {
  SnapsCompetitorAnalyticsService,
  SnapsCompetitorImportRequest,
  SnapsCompetitorProfileInput,
  SnapsCompetitorSnapshotInput,
} from '@gitroom/nestjs-libraries/snaps/competitors/competitor-analytics.service';
import {
  SnapsBulkCampaignRequest,
  SnapsBulkCampaignService,
} from '@gitroom/nestjs-libraries/snaps/bulk/bulk-campaign.service';
import {
  SnapsFeedIntakeRequest,
  SnapsFeedIntakeService,
} from '@gitroom/nestjs-libraries/snaps/feeds/feed-intake.service';
import {
  SnapsCarouselVisualRequest,
  SnapsCarouselVisualService,
} from '@gitroom/nestjs-libraries/snaps/visuals/carousel-visual.service';
import {
  SnapsVisualFeedPlannerRequest,
  SnapsVisualFeedPlannerService,
} from '@gitroom/nestjs-libraries/snaps/planner/visual-feed-planner.service';
import {
  SnapsFirstCommentRequest,
  SnapsFirstCommentService,
} from '@gitroom/nestjs-libraries/snaps/comments/first-comment.service';
import {
  SnapsHashtagSetApplyRequest,
  SnapsHashtagSetInput,
  SnapsHashtagSetListQuery,
  SnapsHashtagSetService,
} from '@gitroom/nestjs-libraries/snaps/hashtags/hashtag-set.service';
import {
  SnapsHashtagTrackerRequest,
  SnapsHashtagTrackerSaveRequest,
  SnapsHashtagTrackerService,
} from '@gitroom/nestjs-libraries/snaps/hashtags/hashtag-tracker.service';
import {
  SnapsSocialListeningListQuery,
  SnapsSocialListeningRequest,
  SnapsSocialListeningService,
} from '@gitroom/nestjs-libraries/snaps/listening/social-listening.service';
import {
  SnapsTrendRadarRequest,
  SnapsTrendRadarService,
} from '@gitroom/nestjs-libraries/snaps/trends/trend-radar.service';
import {
  SnapsPostPreviewRequest,
  SnapsPostPreviewService,
} from '@gitroom/nestjs-libraries/snaps/previews/post-preview.service';
import {
  SnapsEvergreenRecycleRequest,
  SnapsEvergreenRecycleService,
} from '@gitroom/nestjs-libraries/snaps/recycle/evergreen-recycle.service';
import {
  SnapsRecurringPostRequest,
  SnapsRecurringPostScheduleRequest,
  SnapsRecurringPostService,
} from '@gitroom/nestjs-libraries/snaps/recurring/recurring-post.service';
import {
  SnapsRepurposeQueueRequest,
  SnapsRepurposeQueueService,
} from '@gitroom/nestjs-libraries/snaps/repurpose/repurpose-queue.service';
import {
  SnapsAdDisclosureGuardRequest,
  SnapsAdDisclosureGuardService,
} from '@gitroom/nestjs-libraries/snaps/compliance/ad-disclosure-guard.service';
import {
  SnapsApprovalCommentInput,
  SnapsApprovalPublicLinkInput,
  SnapsApprovalRequestInput,
  SnapsApprovalReviewInput,
  SnapsApprovalWorkflowService,
} from '@gitroom/nestjs-libraries/snaps/approvals/approval-workflow.service';
import {
  SnapsViralCoachRequest,
  SnapsViralCoachService,
} from '@gitroom/nestjs-libraries/snaps/coach/viral-coach.service';
import {
  SnapsSourceResolverRequest,
  SnapsSourceResolverService,
} from '@gitroom/nestjs-libraries/snaps/source-resolver/source-resolver.service';
import {
  SnapsContentCalendarRequest,
  SnapsContentCalendarService,
} from '@gitroom/nestjs-libraries/snaps/calendar/content-calendar.service';
import {
  SnapsPostConditionRequest,
  SnapsPostConditionService,
} from '@gitroom/nestjs-libraries/snaps/conditions/post-condition.service';
import {
  SnapsContentCategoryRequest,
  SnapsContentCategoryService,
} from '@gitroom/nestjs-libraries/snaps/categories/content-category.service';
import {
  SnapsContentIdeaService,
  SnapsIdeaGenerateRequest,
  SnapsIdeaInput,
  SnapsIdeaListQuery,
  SnapsIdeaStatusInput,
} from '@gitroom/nestjs-libraries/snaps/ideas/content-idea.service';
import {
  SnapsBrandKitAnalyzeRequest,
  SnapsBrandKitApplyRequest,
  SnapsBrandKitInput,
  SnapsBrandKitService,
} from '@gitroom/nestjs-libraries/snaps/brand/brand-kit.service';
import {
  SnapsMediaAssetAttachRequest,
  SnapsMediaAssetInput,
  SnapsMediaAssetListQuery,
  SnapsMediaAssetScheduleRequest,
  SnapsMediaAssetService,
} from '@gitroom/nestjs-libraries/snaps/media/media-asset.service';
import {
  SnapsCreativeBriefRequest,
  SnapsCreativeBriefSaveRequest,
  SnapsCreativeBriefService,
} from '@gitroom/nestjs-libraries/snaps/creative/creative-brief.service';
import {
  SnapsPostVariationRequest,
  SnapsPostVariationService,
} from '@gitroom/nestjs-libraries/snaps/experiments/post-variation.service';

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
  salesCampaigns?: unknown[];
  salesEvents?: unknown[];
  competitorProfiles?: unknown[];
  competitorSnapshots?: unknown[];
  approvalRequests?: unknown[];
  ideas?: unknown[];
  brandKits?: unknown[];
  mediaAssets?: unknown[];
  hashtagSets?: unknown[];
  listeningMonitors?: unknown[];
  agentTasks?: unknown[];
  inboxItems?: unknown[];
  replyTemplates?: unknown[];
  inboxNotes?: unknown[];
  feedbackItems?: unknown[];
  activity?: unknown[];
};

type SnapsBulkCampaignScheduleRequest = SnapsBulkCampaignRequest & {
  integrations?: unknown;
  publishDate?: unknown;
  scheduleType?: unknown;
  operatorConfirmed?: boolean;
};

type SnapsFeedScheduleRequest = SnapsFeedIntakeRequest & {
  integrations?: unknown;
  publishDate?: unknown;
  scheduleType?: unknown;
  operatorConfirmed?: boolean;
};

type SnapsCarouselVisualScheduleRequest = SnapsCarouselVisualRequest & {
  integrations?: unknown;
  publishDate?: unknown;
  scheduleType?: unknown;
  operatorConfirmed?: boolean;
};

type SnapsVisualFeedPlannerScheduleRequest = SnapsVisualFeedPlannerRequest & {
  integrations?: unknown;
  publishDate?: unknown;
  scheduleType?: unknown;
  operatorConfirmed?: boolean;
};

type SnapsFirstCommentScheduleRequest = SnapsFirstCommentRequest & {
  integrations?: unknown;
  publishDate?: unknown;
  scheduleType?: unknown;
  operatorConfirmed?: boolean;
};

type SnapsHashtagSetScheduleRequest = SnapsHashtagSetApplyRequest & {
  integrations?: unknown;
  publishDate?: unknown;
  scheduleType?: unknown;
  operatorConfirmed?: boolean;
};

type SnapsEvergreenRecycleScheduleRequest = SnapsEvergreenRecycleRequest & {
  integrations?: unknown;
  publishDate?: unknown;
  scheduleType?: unknown;
  operatorConfirmed?: boolean;
};

type SnapsContentCalendarScheduleRequest = SnapsContentCalendarRequest & {
  integrations?: unknown;
  publishDate?: unknown;
  scheduleType?: unknown;
  operatorConfirmed?: boolean;
};

type SnapsPostVariationScheduleRequest = SnapsPostVariationRequest & {
  integrations?: unknown;
  publishDate?: unknown;
  scheduleType?: unknown;
  operatorConfirmed?: boolean;
};

type SnapsRepurposeQueueScheduleRequest = SnapsRepurposeQueueRequest & {
  integrations?: unknown;
  publishDate?: unknown;
  scheduleType?: unknown;
  operatorConfirmed?: boolean;
};

type SnapsContentCategoryScheduleRequest = SnapsContentCategoryRequest & {
  integrations?: unknown;
  publishDate?: unknown;
  scheduleType?: unknown;
  operatorConfirmed?: boolean;
};

type SnapsPostConditionScheduleRequest = SnapsPostConditionRequest & {
  integrations?: unknown;
  publishDate?: unknown;
  scheduleType?: unknown;
  operatorConfirmed?: boolean;
};

type SnapsApprovalScheduleRequest = {
  integrations?: unknown;
  publishDate?: unknown;
  scheduleType?: unknown;
  operatorConfirmed?: boolean;
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

type SnapsFeedbackStatusRequest = {
  status?: unknown;
};

const duplicateScheduleWindowMs = 10 * 60 * 1000;
type SnapsScheduledPosts = Awaited<ReturnType<PostsService['createPost']>>;
const recentSchedules = new Map<
  string,
  Map<string, { at: number; scheduled: SnapsScheduledPosts }>
>();

/** Identity of a schedule request, ignoring the random group/value ids the builder adds. */
const scheduleFingerprint = (payload: {
  type: string;
  date: string;
  posts: Array<{
    integration: { id: string };
    settings: unknown;
    value: Array<{ content: string; image?: unknown }>;
  }>;
}) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        type: payload.type,
        // Drafts get a fresh "now + 1h" placeholder date on every call.
        date: payload.type === 'draft' ? 'draft' : payload.date,
        posts: payload.posts
          .map((post) => ({
            integration: post.integration.id,
            settings: post.settings,
            value: post.value.map((value) => ({ content: value.content, image: value.image })),
          }))
          .sort((a, b) => a.integration.localeCompare(b.integration)),
      })
    )
    .digest('hex');

const rememberSchedule = (
  organizationId: string,
  fingerprint: string,
  scheduled: SnapsScheduledPosts
) => {
  const now = Date.now();
  const entries = recentSchedules.get(organizationId) || new Map();
  for (const [key, entry] of entries) {
    if (now - entry.at >= duplicateScheduleWindowMs) {
      entries.delete(key);
    }
  }
  entries.set(fingerprint, { at: now, scheduled });
  recentSchedules.set(organizationId, entries);
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
    private readonly videoVoiceoverCaptions: SnapsVideoVoiceoverCaptionService,
    private readonly videoPublishGuard: SnapsVideoPublishGuardService,
    private readonly inbox: SnapsFeedbackInboxService,
    private readonly library: SnapsSourceLibraryService,
    private readonly activity: SnapsActivityLogService,
    private readonly commandPlanner: SnapsCommandPlannerService,
    private readonly agentTasks: SnapsAgentTaskService,
    private readonly bulk: SnapsBulkCampaignService,
    private readonly feeds: SnapsFeedIntakeService,
    private readonly carouselVisuals: SnapsCarouselVisualService,
    private readonly visualFeedPlanner: SnapsVisualFeedPlannerService,
    private readonly firstComments: SnapsFirstCommentService,
    private readonly hashtagSets: SnapsHashtagSetService,
    private readonly hashtagTracker: SnapsHashtagTrackerService,
    private readonly socialListening: SnapsSocialListeningService,
    private readonly trendRadar: SnapsTrendRadarService,
    private readonly postPreviews: SnapsPostPreviewService,
    private readonly recycler: SnapsEvergreenRecycleService,
    private readonly recurringPosts: SnapsRecurringPostService,
    private readonly repurposeQueue: SnapsRepurposeQueueService,
    private readonly adDisclosureGuard: SnapsAdDisclosureGuardService,
    private readonly approvals: SnapsApprovalWorkflowService,
    private readonly viralCoach: SnapsViralCoachService,
    private readonly sourceResolver: SnapsSourceResolverService,
    private readonly contentCalendar: SnapsContentCalendarService,
    private readonly contentCategories: SnapsContentCategoryService,
    private readonly postConditions: SnapsPostConditionService,
    private readonly ideas: SnapsContentIdeaService,
    private readonly brandKits: SnapsBrandKitService,
    private readonly mediaAssets: SnapsMediaAssetService,
    private readonly creativeBriefs: SnapsCreativeBriefService,
    private readonly postVariations: SnapsPostVariationService,
    private readonly competitors: SnapsCompetitorAnalyticsService,
    private readonly sales: SnapsLinkAttributionService,
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

  @Get('/schedule/best-time')
  async bestScheduleTime(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Query('integrationId') integrationId?: string
  ) {
    const cleanIntegrationId = this.cleanOptionalString(integrationId, 200);
    let integration:
      | Awaited<ReturnType<IntegrationService['getIntegrationById']>>
      | undefined;
    if (cleanIntegrationId) {
      integration = await this.integrationService.getIntegrationById(
        org.id,
        cleanIntegrationId
      );
      if (!integration) {
        throw new NotFoundException('snaps schedule integration was not found.');
      }
    }

    const recommendedDate = await this.postsService.findFreeDateTime(
      org.id,
      cleanIntegrationId || undefined
    );
    const recommendedDateLocal = recommendedDate.slice(0, 16);
    return {
      recommendedDate,
      recommendedDateLocal,
      integrationId: cleanIntegrationId || undefined,
      providerIdentifier: integration?.providerIdentifier,
      source: cleanIntegrationId
        ? 'connected-integration-posting-times'
        : 'workspace-posting-times',
      reason: cleanIntegrationId
        ? 'Selected channel posting windows and existing scheduled posts were checked.'
      : 'Workspace posting windows and existing scheduled posts were checked.',
    };
  }

  @Post('/ideas/generate')
  async generateIdeas(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsIdeaGenerateRequest
  ) {
    const preview = this.ideas.generate(body);
    await this.activity.record(org.id, {
      type: 'idea',
      title: 'Generated snaps content ideas',
      detail: {
        topic: preview.topic,
        ideas: preview.ideas.length,
        platforms: preview.ideas[0]?.targetPlatforms || [],
      },
    });
    return preview;
  }

  @Post('/ideas')
  async saveIdea(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsIdeaInput
  ) {
    const idea = await this.ideas.save(org.id, body);
    await this.activity.record(org.id, {
      type: 'idea',
      title: 'Saved snaps content idea',
      detail: {
        ideaId: idea.id,
        status: idea.status,
        group: idea.group,
        platforms: idea.targetPlatforms,
      },
    });
    return idea;
  }

  @Get('/ideas')
  listIdeas(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Query() query: SnapsIdeaListQuery
  ) {
    return this.ideas.list(org.id, query);
  }

  @Post('/ideas/:ideaId/status')
  async updateIdeaStatus(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('ideaId') ideaId: string,
    @Body() body?: SnapsIdeaStatusInput
  ) {
    const result = await this.ideas.updateStatus(org.id, ideaId, body);
    await this.activity.record(org.id, {
      type: 'idea',
      title: 'Updated snaps content idea',
      detail: {
        ideaId,
        status: result.idea.status,
        group: result.idea.group,
      },
    });
    return result;
  }

  @Post('/ideas/:ideaId/promote-to-source')
  async promoteIdeaToSource(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('ideaId') ideaId: string
  ) {
    const idea = await this.ideas.get(org.id, ideaId);
    const source = await this.library.saveSource(
      org.id,
      this.ideas.toSourceInput(idea)
    );
    const nextIdea = await this.ideas.markPromoted(org.id, ideaId);
    await this.activity.record(org.id, {
      type: 'idea',
      title: 'Promoted snaps idea to source library',
      detail: {
        ideaId,
        sourceId: source.id,
        status: nextIdea.status,
      },
    });
    return {
      idea: nextIdea,
      source,
    };
  }

  @Delete('/ideas/:ideaId')
  async deleteIdea(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('ideaId') ideaId: string
  ) {
    const deleted = await this.ideas.delete(org.id, ideaId);
    await this.activity.record(org.id, {
      type: 'delete',
      title: 'Deleted snaps content idea',
      detail: { ideaId, deleted: deleted.deleted },
    });
    return deleted;
  }

  @Post('/brand-kits/analyze')
  async analyzeBrandKit(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsBrandKitAnalyzeRequest
  ) {
    const preview = this.brandKits.analyze(body);
    await this.activity.record(org.id, {
      type: 'brand',
      title: 'Analyzed snaps brand kit',
      detail: {
        name: preview.name,
        platforms: preview.targetPlatforms,
        requiredTerms: preview.requiredTerms.length,
      },
    });
    return preview;
  }

  @Post('/brand-kits')
  async saveBrandKit(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsBrandKitInput
  ) {
    const brandKit = await this.brandKits.save(org.id, body);
    await this.activity.record(org.id, {
      type: 'brand',
      title: 'Saved snaps brand kit',
      detail: {
        brandKitId: brandKit.id,
        name: brandKit.name,
        platforms: brandKit.targetPlatforms,
      },
    });
    return brandKit;
  }

  @Get('/brand-kits')
  listBrandKits(@GetOrgFromRequest() org: SnapsOrganization) {
    return this.brandKits.list(org.id);
  }

  @Post('/brand-kits/:brandKitId/apply')
  async applyBrandKit(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('brandKitId') brandKitId: string,
    @Body() body?: SnapsBrandKitApplyRequest
  ) {
    const applied = await this.brandKits.apply(org.id, brandKitId, body);
    await this.activity.record(org.id, {
      type: 'brand',
      title: 'Applied snaps brand kit',
      detail: {
        brandKitId,
        name: applied.brandKit.name,
        platforms: applied.transformPatch.targetPlatforms,
      },
    });
    return applied;
  }

  @Delete('/brand-kits/:brandKitId')
  async deleteBrandKit(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('brandKitId') brandKitId: string
  ) {
    const deleted = await this.brandKits.delete(org.id, brandKitId);
    await this.activity.record(org.id, {
      type: 'delete',
      title: 'Deleted snaps brand kit',
      detail: { brandKitId, deleted: deleted.deleted },
    });
    return deleted;
  }

  @Post('/media-library/preview')
  async previewMediaAsset(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsMediaAssetInput
  ) {
    const preview = this.mediaAssets.preview(body);
    await this.activity.record(org.id, {
      type: 'media',
      title: 'Previewed snaps media asset',
      detail: {
        title: preview.title,
        mediaType: preview.mediaType,
        platforms: preview.targetPlatforms,
      },
    });
    return preview;
  }

  @Post('/media-library')
  async saveMediaAsset(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsMediaAssetInput
  ) {
    const asset = await this.mediaAssets.save(org.id, body);
    await this.activity.record(org.id, {
      type: 'media',
      title: 'Saved snaps media asset',
      detail: {
        mediaAssetId: asset.id,
        title: asset.title,
        mediaType: asset.mediaType,
        platforms: asset.targetPlatforms,
      },
    });
    return asset;
  }

  @Get('/media-library')
  listMediaAssets(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Query() query?: SnapsMediaAssetListQuery
  ) {
    return this.mediaAssets.list(org.id, query);
  }

  @Post('/media-library/:assetId/attach')
  async attachMediaAsset(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('assetId') assetId: string,
    @Body() body?: SnapsMediaAssetAttachRequest
  ) {
    const attached = await this.mediaAssets.attach(org.id, assetId, body);
    await this.activity.record(org.id, {
      type: 'media',
      title: 'Attached snaps media asset to variants',
      detail: {
        mediaAssetId: assetId,
        title: attached.asset.title,
        platforms: attached.transform.variants.map((variant) => variant.platform),
      },
    });
    return attached;
  }

  @Post('/media-library/:assetId/schedule')
  async scheduleMediaAsset(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('assetId') assetId: string,
    @Body() body?: SnapsMediaAssetScheduleRequest
  ) {
    const request = body || {};
    const scheduleType = this.cleanScheduleType(request.scheduleType) || 'draft';
    this.assertOperatorConfirmed(scheduleType, request.operatorConfirmed === true);
    const attached = await this.mediaAssets.attach(org.id, assetId, request);
    const scheduled = await this.scheduleVariantsForOrg(
      org.id,
      {
        variants: attached.transform.variants,
        integrations: this.normalizeScheduleIntegrations(request.integrations),
        publishDate: this.cleanOptionalString(request.publishDate, 80),
        scheduleType,
      },
      attached.transform
    );
    await this.activity.record(org.id, {
      type: 'media',
      title:
        scheduleType === 'schedule'
          ? 'Created scheduled posts from media library'
          : 'Created drafts from media library',
      detail: {
        mediaAssetId: assetId,
        title: attached.asset.title,
        scheduleType,
        scheduled: scheduled.scheduled?.length || 0,
      },
    });
    return {
      product: 'snaps',
      source: 'snaps-media-library',
      scheduleType,
      preview: attached,
      warnings: scheduled.warnings || attached.warnings,
      scheduled: scheduled.scheduled || [],
    };
  }

  @Delete('/media-library/:assetId')
  async deleteMediaAsset(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('assetId') assetId: string
  ) {
    const deleted = await this.mediaAssets.delete(org.id, assetId);
    await this.activity.record(org.id, {
      type: 'delete',
      title: 'Deleted snaps media asset',
      detail: { mediaAssetId: assetId, deleted: deleted.deleted },
    });
    return deleted;
  }

  @Post('/creative-briefs/preview')
  creativeBriefPreview(@Body() body?: SnapsCreativeBriefRequest) {
    return this.creativeBriefs.preview(body);
  }

  @Post('/creative-briefs/save-media')
  async saveCreativeBriefMedia(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsCreativeBriefSaveRequest
  ) {
    const preview = this.creativeBriefs.preview(body);
    const mediaInput = this.creativeBriefs.toMediaAssetInput(preview, body);
    const asset = await this.mediaAssets.save(org.id, mediaInput);
    await this.activity.record(org.id, {
      type: 'media',
      title: 'Saved creative brief media asset',
      detail: {
        mediaAssetId: asset.id,
        title: asset.title,
        mediaType: asset.mediaType,
        aspectRatio: preview.aspectRatio,
        platforms: preview.targetPlatforms,
      },
    });
    return {
      product: 'snaps',
      source: 'snaps-creative-brief',
      preview,
      asset,
    };
  }

  @Post('/approvals')
  async submitApprovalRequest(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsApprovalRequestInput
  ) {
    const approval = await this.approvals.submit(org.id, body);
    await this.activity.record(org.id, {
      type: 'approval',
      title: 'Submitted snaps approval request',
      detail: {
        approvalId: approval.id,
        status: approval.status,
        variants: approval.variants.length,
        reviewer: approval.reviewer,
      },
    });
    return approval;
  }

  @Get('/approvals')
  listApprovalRequests(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Query('status') status?: string
  ) {
    return this.approvals.list(org.id, status);
  }

  @Post('/approvals/:approvalId/public-link')
  async createApprovalPublicLink(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('approvalId') approvalId: string,
    @Body() body?: SnapsApprovalPublicLinkInput
  ) {
    const result = await this.approvals.createPublicReviewLink(
      org.id,
      approvalId,
      body
    );
    await this.activity.record(org.id, {
      type: 'approval',
      title: 'Created public approval review link',
      detail: {
        approvalId,
        expiresAt: result.expiresAt,
        allowDecision: result.allowDecision,
      },
    });
    return result;
  }

  @Delete('/approvals/:approvalId/public-link')
  async revokeApprovalPublicLink(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('approvalId') approvalId: string
  ) {
    const result = await this.approvals.revokePublicReviewLink(org.id, approvalId);
    await this.activity.record(org.id, {
      type: 'approval',
      title: 'Revoked public approval review link',
      detail: {
        approvalId,
        revoked: result.revoked,
      },
    });
    return result;
  }

  @Post('/coach/viral')
  async viralCoachScorecard(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsViralCoachRequest
  ) {
    const scorecard = this.viralCoach.score(body);
    await this.activity.record(org.id, {
      type: 'coach',
      title: 'Generated snaps viral coach scorecard',
      detail: {
        platform: scorecard.platform,
        score: scorecard.score,
        grade: scorecard.grade,
        source: scorecard.source,
      },
    });
    return scorecard;
  }

  @Post('/experiments/variations/preview')
  variationLabPreview(@Body() body?: SnapsPostVariationRequest) {
    return this.postVariations.preview(body);
  }

  @Post('/experiments/variations/import-sources')
  async variationLabImportSources(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsPostVariationRequest
  ) {
    const preview = this.postVariations.preview(body);
    const sources = this.postVariations.toSourceInputs(preview.items);
    if (!sources.length) {
      throw new BadRequestException('No valid post variations were available to import.');
    }
    const imported = await this.library.importSources(org.id, sources);
    await this.activity.record(org.id, {
      type: 'experiment',
      title: 'Imported post variation experiments into source library',
      detail: {
        variants: preview.totalVariants,
        winner: preview.winningVariantId,
        goal: preview.goal,
        imported,
      },
    });
    return {
      ...preview,
      imported,
    };
  }

  @Post('/experiments/variations/schedule')
  async variationLabSchedule(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsPostVariationScheduleRequest
  ) {
    const request = body || {};
    const scheduleType = this.cleanScheduleType(request.scheduleType) || 'draft';
    this.assertOperatorConfirmed(scheduleType, request.operatorConfirmed);
    const preview = this.postVariations.preview(request);
    const variants = this.postVariations.toVariants(preview.items);
    if (!variants.length) {
      throw new BadRequestException('No ready post variations were available to queue.');
    }
    const scheduled = await this.scheduleVariantsForOrg(
      org.id,
      {
        variants,
        integrations: this.normalizeScheduleIntegrations(request.integrations),
        publishDate: this.cleanOptionalString(request.publishDate, 80),
        scheduleType,
      },
      {
        provider: 'rule-fallback',
        model: 'post-variation-lab',
        variants,
        warnings: preview.warnings,
        ragExamplesUsed: [],
      }
    );
    await this.activity.record(org.id, {
      type: 'experiment',
      title:
        scheduleType === 'schedule'
          ? 'Created scheduled posts from variation lab'
          : 'Created drafts from variation lab',
      detail: {
        variants: preview.totalVariants,
        queued: variants.length,
        winner: preview.winningVariantId,
        goal: preview.goal,
        scheduleType,
      },
    });
    return {
      product: 'snaps',
      source: 'snaps-post-variation-lab',
      scheduleType,
      preview,
      warnings: scheduled.warnings || [],
      scheduled: scheduled.scheduled || [],
    };
  }

  @Post('/approvals/:approvalId/review')
  async reviewApprovalRequest(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('approvalId') approvalId: string,
    @Body() body?: SnapsApprovalReviewInput
  ) {
    const approval = await this.approvals.review(org.id, approvalId, body);
    await this.activity.record(org.id, {
      type: 'approval',
      title: 'Reviewed snaps approval request',
      detail: {
        approvalId,
        status: approval.status,
        reviewer: approval.reviewer,
      },
    });
    return approval;
  }

  @Post('/approvals/:approvalId/schedule')
  async scheduleApprovedRequest(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('approvalId') approvalId: string,
    @Body() body?: SnapsApprovalScheduleRequest
  ) {
    const approval = await this.approvals.get(org.id, approvalId);
    if (approval.status !== 'approved') {
      throw new BadRequestException(
        'approval must be approved before creating drafts or scheduled posts.'
      );
    }

    const scheduleType = this.cleanScheduleType(body?.scheduleType) || approval.scheduleType;
    this.assertOperatorConfirmed(scheduleType, body?.operatorConfirmed);
    const publishDate =
      this.cleanOptionalString(body?.publishDate, 80) || approval.publishDate;
    const scheduled = await this.scheduleVariantsForOrg(
      org.id,
      {
        variants: approval.variants,
        integrations: this.normalizeScheduleIntegrations(body?.integrations),
        publishDate,
        scheduleType,
      },
      {
        provider: 'rule-fallback',
        model: 'approval-workflow',
        variants: approval.variants,
        warnings: [],
        ragExamplesUsed: [],
      }
    );
    const nextApproval = scheduled.scheduled?.length
      ? await this.approvals.markScheduled(org.id, approvalId, {
          note: `${scheduleType} handoff created ${scheduled.scheduled.length} post records`,
        })
      : approval;
    await this.activity.record(org.id, {
      type: 'approval',
      title:
        scheduleType === 'schedule'
          ? 'Created scheduled posts from approved request'
          : 'Created drafts from approved request',
      detail: {
        approvalId,
        scheduleType,
        scheduled: scheduled.scheduled?.length || 0,
        warnings: scheduled.warnings?.length || 0,
      },
    });
    return {
      approval: nextApproval,
      scheduled,
    };
  }

  @Post('/approvals/:approvalId/comments')
  async addApprovalComment(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('approvalId') approvalId: string,
    @Body() body?: SnapsApprovalCommentInput
  ) {
    const result = await this.approvals.addComment(org.id, approvalId, body);
    await this.activity.record(org.id, {
      type: 'approval',
      title: 'Added approval comment',
      detail: {
        approvalId,
        commentId: result.comment.id,
        visibility: result.comment.visibility,
        resolved: result.comment.resolved,
      },
    });
    return result;
  }

  @Post('/approvals/:approvalId/comments/:commentId/resolve')
  async resolveApprovalComment(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('approvalId') approvalId: string,
    @Param('commentId') commentId: string,
    @Body() body?: { resolved?: unknown; actor?: unknown; note?: unknown }
  ) {
    const result = await this.approvals.resolveComment(
      org.id,
      approvalId,
      commentId,
      body
    );
    await this.activity.record(org.id, {
      type: 'approval',
      title: result.comment.resolved
        ? 'Resolved approval comment'
        : 'Reopened approval comment',
      detail: {
        approvalId,
        commentId,
        resolved: result.comment.resolved,
      },
    });
    return result;
  }

  @Delete('/approvals/:approvalId')
  async deleteApprovalRequest(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('approvalId') approvalId: string
  ) {
    const deleted = await this.approvals.delete(org.id, approvalId);
    await this.activity.record(org.id, {
      type: 'delete',
      title: 'Deleted snaps approval request',
      detail: { approvalId, deleted: deleted.deleted },
    });
    return deleted;
  }

  @Post('/bulk/preview')
  bulkPreview(@Body() body?: SnapsBulkCampaignRequest) {
    return this.bulk.preview(body);
  }

  @Post('/bulk/import-sources')
  async bulkImportSources(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsBulkCampaignRequest
  ) {
    const preview = this.bulk.preview(body);
    const sources = this.bulk.toSourceInputs(preview.rows);
    if (!sources.length) {
      throw new BadRequestException('No valid CSV rows were available to import.');
    }
    const imported = await this.library.importSources(org.id, sources);
    await this.activity.record(org.id, {
      type: 'bulk',
      title: 'Imported bulk campaign CSV into source library',
      detail: {
        rows: preview.totalRows,
        acceptedRows: preview.acceptedRows,
        invalidRows: preview.invalidRows,
        imported,
      },
    });
    return {
      ...preview,
      imported,
    };
  }

  @Post('/bulk/schedule')
  async bulkSchedule(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsBulkCampaignScheduleRequest
  ) {
    const request = body || {};
    const scheduleType = this.cleanScheduleType(request.scheduleType) || 'draft';
    this.assertOperatorConfirmed(scheduleType, request.operatorConfirmed);
    const preview = this.bulk.preview(request);
    const integrations = this.normalizeScheduleIntegrations(request.integrations);
    const fallbackPublishDate = this.cleanOptionalString(request.publishDate, 80);
    const scheduledRows = [];

    for (const row of preview.rows.filter((item) => item.status !== 'invalid')) {
      const variants = this.bulk.toVariants(row);
      const scheduled = await this.scheduleVariantsForOrg(
        org.id,
        {
          variants,
          integrations,
          publishDate: row.publishDate || fallbackPublishDate,
          scheduleType,
        },
        {
          provider: 'rule-fallback',
          model: 'bulk-csv',
          variants,
          warnings: row.warnings,
          ragExamplesUsed: [],
        }
      );
      scheduledRows.push({
        rowNumber: row.rowNumber,
        title: row.title,
        platforms: row.platforms,
        status: row.status,
        warnings: scheduled.warnings || [],
        scheduled: scheduled.scheduled || [],
      });
    }

    await this.activity.record(org.id, {
      type: 'bulk',
      title:
        scheduleType === 'schedule'
          ? 'Created scheduled posts from bulk campaign CSV'
          : 'Created drafts from bulk campaign CSV',
      detail: {
        rows: preview.totalRows,
        acceptedRows: preview.acceptedRows,
        invalidRows: preview.invalidRows,
        scheduleType,
        scheduledRows: scheduledRows.length,
      },
    });

    return {
      product: 'snaps',
      source: 'snaps-bulk-csv',
      scheduleType,
      preview,
      rows: scheduledRows,
    };
  }

  @Post('/feeds/preview')
  async feedPreview(@Body() body?: SnapsFeedIntakeRequest) {
    return this.feeds.preview(body);
  }

  @Post('/feeds/import-sources')
  async feedImportSources(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsFeedIntakeRequest
  ) {
    const preview = await this.feeds.preview(body);
    const sources = this.feeds.toSourceInputs(preview.items);
    if (!sources.length) {
      throw new BadRequestException('No valid RSS feed items were available to import.');
    }
    const imported = await this.library.importSources(org.id, sources);
    await this.activity.record(org.id, {
      type: 'feed',
      title: 'Imported RSS feed items into source library',
      detail: {
        items: preview.totalItems,
        acceptedItems: preview.acceptedItems,
        invalidItems: preview.invalidItems,
        imported,
      },
    });
    return {
      ...preview,
      imported,
    };
  }

  @Post('/feeds/schedule')
  async feedSchedule(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsFeedScheduleRequest
  ) {
    const request = body || {};
    const scheduleType = this.cleanScheduleType(request.scheduleType) || 'draft';
    this.assertOperatorConfirmed(scheduleType, request.operatorConfirmed);
    const preview = await this.feeds.preview(request);
    const integrations = this.normalizeScheduleIntegrations(request.integrations);
    const fallbackPublishDate = this.cleanOptionalString(request.publishDate, 80);
    const scheduledItems = [];

    for (const item of preview.items.filter((entry) => entry.status !== 'invalid')) {
      const variants = this.feeds.toVariants(item);
      const scheduled = await this.scheduleVariantsForOrg(
        org.id,
        {
          variants,
          integrations,
          publishDate: fallbackPublishDate,
          scheduleType,
        },
        {
          provider: 'rule-fallback',
          model: 'rss-feed',
          variants,
          warnings: item.warnings,
          ragExamplesUsed: [],
        }
      );
      scheduledItems.push({
        itemIndex: item.itemIndex,
        title: item.title,
        platforms: item.platforms,
        status: item.status,
        warnings: scheduled.warnings || [],
        scheduled: scheduled.scheduled || [],
      });
    }

    await this.activity.record(org.id, {
      type: 'feed',
      title:
        scheduleType === 'schedule'
          ? 'Created scheduled posts from RSS feed'
          : 'Created drafts from RSS feed',
      detail: {
        items: preview.totalItems,
        acceptedItems: preview.acceptedItems,
        invalidItems: preview.invalidItems,
        scheduleType,
        scheduledItems: scheduledItems.length,
      },
    });

    return {
      product: 'snaps',
      source: 'snaps-rss-feed',
      scheduleType,
      preview,
      items: scheduledItems,
    };
  }

  @Post('/visuals/carousel/preview')
  carouselPreview(@Body() body?: SnapsCarouselVisualRequest) {
    return this.carouselVisuals.preview(body);
  }

  @Post('/visuals/carousel/export')
  carouselExport(@Body() body?: SnapsCarouselVisualRequest) {
    const preview = this.carouselVisuals.preview(body);
    return {
      product: 'snaps',
      source: 'snaps-carousel-visual',
      title: preview.title,
      slideCount: preview.slideCount,
      exportHtml: preview.exportHtml,
      preview,
      slides: preview.slides.map((slide) => ({
        slideIndex: slide.slideIndex,
        title: slide.title,
        svg: slide.svg,
        svgDataUrl: slide.svgDataUrl,
      })),
    };
  }

  @Post('/visuals/carousel/schedule')
  async carouselSchedule(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsCarouselVisualScheduleRequest
  ) {
    const request = body || {};
    const scheduleType = this.cleanScheduleType(request.scheduleType) || 'draft';
    this.assertOperatorConfirmed(scheduleType, request.operatorConfirmed);
    const preview = this.carouselVisuals.preview(request);
    const variants = this.carouselVisuals.toVariants(preview, request.targetPlatforms);
    const integrations = this.normalizeScheduleIntegrations(request.integrations);
    const publishDate = this.cleanOptionalString(request.publishDate, 80);
    const scheduled = await this.scheduleVariantsForOrg(
      org.id,
      {
        variants,
        integrations,
        publishDate,
        scheduleType,
      },
      {
        provider: 'rule-fallback',
        model: 'carousel-visual',
        variants,
        warnings: preview.warnings,
        ragExamplesUsed: [],
      }
    );

    await this.activity.record(org.id, {
      type: 'visual',
      title:
        scheduleType === 'schedule'
          ? 'Created scheduled posts from carousel visual'
          : 'Created drafts from carousel visual',
      detail: {
        template: preview.template,
        aspectRatio: preview.aspectRatio,
        slides: preview.slideCount,
        scheduleType,
        scheduled: scheduled.scheduled?.length || 0,
      },
    });

    return {
      product: 'snaps',
      source: 'snaps-carousel-visual',
      scheduleType,
      preview,
      variants: variants.map((variant) => ({
        platform: variant.platform,
        title: variant.title,
        media: variant.media?.length || 0,
      })),
      warnings: scheduled.warnings || [],
      scheduled: scheduled.scheduled || [],
    };
  }

  @Post('/visual-planner/preview')
  visualPlannerPreview(@Body() body?: SnapsVisualFeedPlannerRequest) {
    return this.visualFeedPlanner.preview(body);
  }

  @Post('/visual-planner/schedule')
  async visualPlannerSchedule(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsVisualFeedPlannerScheduleRequest
  ) {
    const request = body || {};
    const scheduleType = this.cleanScheduleType(request.scheduleType) || 'draft';
    this.assertOperatorConfirmed(scheduleType, request.operatorConfirmed);
    const preview = this.visualFeedPlanner.preview(request);
    const variants = this.visualFeedPlanner.toVariants(
      preview,
      request.targetPlatforms
    );
    const scheduled = await this.scheduleVariantsForOrg(
      org.id,
      {
        variants,
        integrations: this.normalizeScheduleIntegrations(request.integrations),
        publishDate: this.cleanOptionalString(request.publishDate, 80),
        scheduleType,
      },
      {
        provider: 'rule-fallback',
        model: 'visual-feed-planner',
        variants,
        warnings: preview.warnings,
        ragExamplesUsed: [],
      }
    );

    await this.activity.record(org.id, {
      type: 'visual',
      title:
        scheduleType === 'schedule'
          ? 'Created scheduled posts from visual feed planner'
          : 'Created drafts from visual feed planner',
      detail: {
        platform: preview.platform,
        items: preview.totalItems,
        scheduleType,
        scheduled: scheduled.scheduled?.length || 0,
        warnings: scheduled.warnings?.length || 0,
      },
    });

    return {
      product: 'snaps',
      source: 'snaps-visual-feed-planner',
      scheduleType,
      preview,
      variants: variants.map((variant) => ({
        platform: variant.platform,
        title: variant.title,
        media: variant.media?.length || 0,
      })),
      warnings: scheduled.warnings || [],
      scheduled: scheduled.scheduled || [],
    };
  }

  @Post('/first-comments/preview')
  firstCommentsPreview(@Body() body?: SnapsFirstCommentRequest) {
    return this.firstComments.preview(body);
  }

  @Post('/first-comments/schedule')
  async firstCommentsSchedule(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsFirstCommentScheduleRequest
  ) {
    const request = body || {};
    const scheduleType = this.cleanScheduleType(request.scheduleType) || 'draft';
    this.assertOperatorConfirmed(scheduleType, request.operatorConfirmed);
    const preview = this.firstComments.preview(request);
    const variants = this.firstComments.toVariants(preview);
    const scheduled = await this.scheduleVariantsForOrg(
      org.id,
      {
        variants,
        integrations: this.normalizeScheduleIntegrations(request.integrations),
        publishDate: this.cleanOptionalString(request.publishDate, 80),
        scheduleType,
      },
      {
        provider: 'rule-fallback',
        model: 'first-comment-planner',
        variants,
        warnings: preview.warnings,
        ragExamplesUsed: [],
      }
    );

    await this.activity.record(org.id, {
      type: 'comment',
      title:
        scheduleType === 'schedule'
          ? 'Created scheduled posts with first comments'
          : 'Created drafts with first comments',
      detail: {
        strategy: preview.strategy,
        items: preview.totalItems,
        supportedItems: preview.supportedItems,
        scheduleType,
        scheduled: scheduled.scheduled?.length || 0,
        warnings: scheduled.warnings?.length || 0,
      },
    });

    return {
      product: 'snaps',
      source: 'snaps-first-comment-planner',
      scheduleType,
      preview,
      variants: variants.map((variant) => ({
        platform: variant.platform,
        title: variant.title,
        firstComment: variant.settings.firstComment,
      })),
      warnings: scheduled.warnings || [],
      scheduled: scheduled.scheduled || [],
    };
  }

  @Post('/hashtag-sets/preview')
  hashtagSetPreview(@Body() body?: SnapsHashtagSetInput) {
    return this.hashtagSets.preview(body);
  }

  @Post('/hashtag-sets')
  async saveHashtagSet(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsHashtagSetInput
  ) {
    const set = await this.hashtagSets.save(org.id, body);
    await this.activity.record(org.id, {
      type: 'hashtag',
      title: 'Saved snaps hashtag set',
      detail: {
        setId: set.id,
        title: set.title,
        hashtags: set.hashtags.length,
        platforms: set.targetPlatforms,
      },
    });
    return set;
  }

  @Get('/hashtag-sets')
  listHashtagSets(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Query() query?: SnapsHashtagSetListQuery
  ) {
    return this.hashtagSets.list(org.id, query);
  }

  @Post('/hashtag-sets/:setId/apply')
  async applyHashtagSet(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('setId') setId: string,
    @Body() body?: SnapsHashtagSetApplyRequest
  ) {
    const applied = await this.hashtagSets.apply(org.id, setId, body);
    await this.activity.record(org.id, {
      type: 'hashtag',
      title: 'Applied snaps hashtag set',
      detail: {
        setId,
        title: applied.set.title,
        placement: applied.placement,
        variants: applied.transform.variants.length,
      },
    });
    return applied;
  }

  @Post('/hashtag-sets/:setId/schedule')
  async scheduleHashtagSet(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('setId') setId: string,
    @Body() body?: SnapsHashtagSetScheduleRequest
  ) {
    const request = body || {};
    const scheduleType = this.cleanScheduleType(request.scheduleType) || 'draft';
    this.assertOperatorConfirmed(scheduleType, request.operatorConfirmed);
    const applied = await this.hashtagSets.apply(org.id, setId, request);
    const scheduled = await this.scheduleVariantsForOrg(
      org.id,
      {
        variants: applied.transform.variants,
        integrations: this.normalizeScheduleIntegrations(request.integrations),
        publishDate: this.cleanOptionalString(request.publishDate, 80),
        scheduleType,
      },
      applied.transform
    );

    await this.activity.record(org.id, {
      type: 'hashtag',
      title:
        scheduleType === 'schedule'
          ? 'Created scheduled posts with hashtag set'
          : 'Created drafts with hashtag set',
      detail: {
        setId,
        title: applied.set.title,
        placement: applied.placement,
        scheduleType,
        scheduled: scheduled.scheduled?.length || 0,
      },
    });

    return {
      product: 'snaps',
      source: 'snaps-hashtag-set',
      scheduleType,
      preview: applied,
      warnings: scheduled.warnings || applied.warnings,
      scheduled: scheduled.scheduled || [],
    };
  }

  @Post('/hashtags/tracker/preview')
  hashtagTrackerPreview(@Body() body?: SnapsHashtagTrackerRequest) {
    return this.hashtagTracker.preview(body);
  }

  @Post('/hashtags/tracker/save-set')
  async saveHashtagTrackerSet(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsHashtagTrackerSaveRequest
  ) {
    const preview = this.hashtagTracker.preview(body);
    const setInput = this.hashtagTracker.toHashtagSetInput(preview, body);
    const set = await this.hashtagSets.save(org.id, setInput);
    await this.activity.record(org.id, {
      type: 'hashtag',
      title: 'Saved tracked hashtag set',
      detail: {
        setId: set.id,
        title: set.title,
        bestHashtag: preview.bestHashtag,
        trackedHashtags: preview.trackedHashtags,
      },
    });
    return {
      product: 'snaps',
      source: 'snaps-hashtag-tracker',
      preview,
      set,
    };
  }

  @Delete('/hashtag-sets/:setId')
  async deleteHashtagSet(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('setId') setId: string
  ) {
    const deleted = await this.hashtagSets.delete(org.id, setId);
    await this.activity.record(org.id, {
      type: 'delete',
      title: 'Deleted snaps hashtag set',
      detail: { setId, deleted: deleted.deleted },
    });
    return deleted;
  }

  @Post('/listening/preview')
  listeningPreview(@Body() body?: SnapsSocialListeningRequest) {
    return this.socialListening.preview(body);
  }

  @Post('/listening/monitors')
  async saveListeningMonitor(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsSocialListeningRequest
  ) {
    const monitor = await this.socialListening.save(org.id, body);
    await this.activity.record(org.id, {
      type: 'listening',
      title: 'Saved snaps social listening monitor',
      detail: {
        monitorId: monitor.id,
        title: monitor.title,
        keywords: monitor.keywords.length,
        platforms: monitor.targetPlatforms,
      },
    });
    return monitor;
  }

  @Get('/listening/monitors')
  listListeningMonitors(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Query() query?: SnapsSocialListeningListQuery
  ) {
    return this.socialListening.list(org.id, query);
  }

  @Post('/listening/monitors/:monitorId/run')
  async runListeningMonitor(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('monitorId') monitorId: string,
    @Body() body?: SnapsSocialListeningRequest
  ) {
    const run = await this.socialListening.run(org.id, monitorId, body);
    await this.activity.record(org.id, {
      type: 'listening',
      title: 'Ran snaps social listening monitor',
      detail: {
        monitorId,
        title: run.monitor.title,
        matched: run.preview.matchedItems,
        highIntent: run.preview.highIntentItems,
      },
    });
    return run;
  }

  @Post('/listening/monitors/:monitorId/promote-to-inbox')
  async promoteListeningMonitorToInbox(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('monitorId') monitorId: string,
    @Body() body?: SnapsSocialListeningRequest
  ) {
    const run = await this.socialListening.run(org.id, monitorId, body);
    const inboxPayload = this.socialListening.toInboxImport(run.preview);
    const imported = await this.inbox.importItems(org.id, inboxPayload);
    await this.activity.record(org.id, {
      type: 'listening',
      title: 'Promoted listening mentions to inbox',
      detail: {
        monitorId,
        title: run.monitor.title,
        imported: imported.imported,
        highIntent: run.preview.highIntentItems,
      },
    });
    return {
      ...run,
      inbox: imported,
    };
  }

  @Delete('/listening/monitors/:monitorId')
  async deleteListeningMonitor(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('monitorId') monitorId: string
  ) {
    const deleted = await this.socialListening.delete(org.id, monitorId);
    await this.activity.record(org.id, {
      type: 'delete',
      title: 'Deleted snaps social listening monitor',
      detail: { monitorId, deleted: deleted.deleted },
    });
    return deleted;
  }

  @Post('/trends/radar/preview')
  trendRadarPreview(@Body() body?: SnapsTrendRadarRequest) {
    return this.trendRadar.preview(body);
  }

  @Post('/trends/radar/import-sources')
  async trendRadarImportSources(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsTrendRadarRequest
  ) {
    const preview = this.trendRadar.preview(body);
    const sources = this.trendRadar.toSourceInputs(preview);
    if (!sources.length) {
      throw new BadRequestException('No trend radar ideas were available to import.');
    }
    const imported = await this.library.importSources(org.id, sources);
    await this.activity.record(org.id, {
      type: 'trend',
      title: 'Imported trend radar ideas into source library',
      detail: {
        title: preview.title,
        trends: preview.totalTrends,
        ideas: preview.contentIdeas.length,
        alerts: preview.alerts.length,
        imported,
      },
    });
    return {
      ...preview,
      imported,
    };
  }

  @Post('/previews/post')
  postPreview(@Body() body?: SnapsPostPreviewRequest) {
    return this.postPreviews.preview(body);
  }

  @Post('/compliance/ad-disclosure')
  adDisclosureCheck(@Body() body?: SnapsAdDisclosureGuardRequest) {
    return this.adDisclosureGuard.check(body);
  }

  @Post('/recycle/preview')
  recyclePreview(@Body() body?: SnapsEvergreenRecycleRequest) {
    return this.recycler.preview(body);
  }

  @Post('/recycle/import-sources')
  async recycleImportSources(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsEvergreenRecycleRequest
  ) {
    const preview = this.recycler.preview(body);
    const sources = this.recycler.toSourceInputs(preview.items);
    if (!sources.length) {
      throw new BadRequestException('No valid evergreen recycle items were available to import.');
    }
    const imported = await this.library.importSources(org.id, sources);
    await this.activity.record(org.id, {
      type: 'recycle',
      title: 'Imported evergreen recycle items into source library',
      detail: {
        items: preview.totalItems,
        acceptedItems: preview.acceptedItems,
        invalidItems: preview.invalidItems,
        cadence: preview.cadence,
        imported,
      },
    });
    return {
      ...preview,
      imported,
    };
  }

  @Post('/recycle/schedule')
  async recycleSchedule(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsEvergreenRecycleScheduleRequest
  ) {
    const request = body || {};
    const scheduleType = this.cleanScheduleType(request.scheduleType) || 'draft';
    this.assertOperatorConfirmed(scheduleType, request.operatorConfirmed);
    const preview = this.recycler.preview(request);
    const integrations = this.normalizeScheduleIntegrations(request.integrations);
    const fallbackPublishDate = this.cleanOptionalString(request.publishDate, 80);
    const scheduledItems = [];

    for (const item of preview.items.filter((entry) => entry.status !== 'invalid')) {
      const variants = this.recycler.toVariants(item);
      const scheduled = await this.scheduleVariantsForOrg(
        org.id,
        {
          variants,
          integrations,
          publishDate: item.publishDate || fallbackPublishDate,
          scheduleType,
        },
        {
          provider: 'rule-fallback',
          model: 'evergreen-recycle',
          variants,
          warnings: item.warnings,
          ragExamplesUsed: [],
        }
      );
      scheduledItems.push({
        itemIndex: item.itemIndex,
        title: item.title,
        angle: item.angle,
        platforms: item.platforms,
        status: item.status,
        warnings: scheduled.warnings || [],
        scheduled: scheduled.scheduled || [],
      });
    }

    await this.activity.record(org.id, {
      type: 'recycle',
      title:
        scheduleType === 'schedule'
          ? 'Created scheduled posts from evergreen recycle queue'
          : 'Created drafts from evergreen recycle queue',
      detail: {
        items: preview.totalItems,
        acceptedItems: preview.acceptedItems,
        invalidItems: preview.invalidItems,
        cadence: preview.cadence,
        scheduleType,
        scheduledItems: scheduledItems.length,
      },
    });

    return {
      product: 'snaps',
      source: 'snaps-evergreen-recycle',
      scheduleType,
      preview,
      items: scheduledItems,
    };
  }

  @Post('/recurring/preview')
  recurringPreview(@Body() body?: SnapsRecurringPostRequest) {
    return this.recurringPosts.preview(body);
  }

  @Post('/recurring/import-sources')
  async recurringImportSources(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsRecurringPostRequest
  ) {
    const preview = this.recurringPosts.preview(body);
    const sources = this.recurringPosts.toSourceInputs(preview.items);
    if (!sources.length) {
      throw new BadRequestException('No valid recurring post items were available to import.');
    }
    const imported = await this.library.importSources(org.id, sources);
    await this.activity.record(org.id, {
      type: 'recurring',
      title: 'Imported recurring post items into source library',
      detail: {
        items: preview.totalItems,
        acceptedItems: preview.acceptedItems,
        invalidItems: preview.invalidItems,
        cadence: preview.cadence,
        imported,
      },
    });
    return {
      ...preview,
      imported,
    };
  }

  @Post('/recurring/schedule')
  async recurringSchedule(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsRecurringPostScheduleRequest
  ) {
    const request = body || {};
    const scheduleType = this.cleanScheduleType(request.scheduleType) || 'draft';
    this.assertOperatorConfirmed(scheduleType, request.operatorConfirmed);
    const preview = this.recurringPosts.preview(request);
    const integrations = this.normalizeScheduleIntegrations(request.integrations);
    const fallbackPublishDate = this.cleanOptionalString(request.publishDate, 80);
    const scheduledItems = [];

    for (const item of preview.items.filter((entry) => entry.status !== 'invalid')) {
      const variants = this.recurringPosts.toVariants(item);
      const scheduled = await this.scheduleVariantsForOrg(
        org.id,
        {
          variants,
          integrations,
          publishDate: item.publishDate || fallbackPublishDate,
          scheduleType,
        },
        {
          provider: 'rule-fallback',
          model: 'recurring-posts',
          variants,
          warnings: item.warnings,
          ragExamplesUsed: [],
        }
      );
      scheduledItems.push({
        itemIndex: item.itemIndex,
        title: item.title,
        variation: item.variation,
        publishDate: item.publishDate,
        platforms: item.platforms,
        status: item.status,
        warnings: scheduled.warnings || [],
        scheduled: scheduled.scheduled || [],
      });
    }

    await this.activity.record(org.id, {
      type: 'recurring',
      title:
        scheduleType === 'schedule'
          ? 'Created scheduled posts from recurring queue'
          : 'Created drafts from recurring queue',
      detail: {
        items: preview.totalItems,
        acceptedItems: preview.acceptedItems,
        invalidItems: preview.invalidItems,
        cadence: preview.cadence,
        intervalDays: preview.intervalDays,
        scheduleType,
        scheduledItems: scheduledItems.length,
      },
    });

    return {
      product: 'snaps',
      source: 'snaps-recurring-posts',
      scheduleType,
      preview,
      items: scheduledItems,
    };
  }

  @Post('/repurpose/preview')
  repurposePreview(@Body() body?: SnapsRepurposeQueueRequest) {
    return this.repurposeQueue.preview(body);
  }

  @Post('/repurpose/import-sources')
  async repurposeImportSources(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsRepurposeQueueRequest
  ) {
    const preview = this.repurposeQueue.preview(body);
    const sources = this.repurposeQueue.toSourceInputs(preview.items);
    if (!sources.length) {
      throw new BadRequestException('No valid repurpose queue items were available to import.');
    }
    const imported = await this.library.importSources(org.id, sources);
    await this.activity.record(org.id, {
      type: 'repurpose',
      title: 'Imported repurpose queue items into source library',
      detail: {
        items: preview.totalItems,
        acceptedItems: preview.acceptedItems,
        ignoredItems: preview.ignoredItems,
        invalidItems: preview.invalidItems,
        workflowMode: preview.workflowMode,
        contentFilter: preview.contentFilter,
        imported,
      },
    });
    return {
      ...preview,
      imported,
    };
  }

  @Post('/repurpose/schedule')
  async repurposeSchedule(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsRepurposeQueueScheduleRequest
  ) {
    const request = body || {};
    const scheduleType = this.cleanScheduleType(request.scheduleType) || 'draft';
    this.assertOperatorConfirmed(scheduleType, request.operatorConfirmed);
    const preview = this.repurposeQueue.preview(request);
    const integrations = this.normalizeScheduleIntegrations(request.integrations);
    const fallbackPublishDate = this.cleanOptionalString(request.publishDate, 80);
    const scheduledItems = [];

    for (const item of preview.items.filter(
      (entry) => entry.status === 'ready' || entry.status === 'queued'
    )) {
      const variants = this.repurposeQueue.toVariants(item);
      const scheduled = await this.scheduleVariantsForOrg(
        org.id,
        {
          variants,
          integrations,
          publishDate: item.publishDate || fallbackPublishDate,
          scheduleType,
        },
        {
          provider: 'rule-fallback',
          model: 'repurpose-queue',
          variants,
          warnings: item.warnings,
          ragExamplesUsed: [],
        }
      );
      scheduledItems.push({
        itemIndex: item.itemIndex,
        title: item.title,
        action: item.action,
        publishDate: item.publishDate,
        platforms: item.targetPlatforms,
        status: item.status,
        warnings: scheduled.warnings || [],
        scheduled: scheduled.scheduled || [],
      });
    }

    await this.activity.record(org.id, {
      type: 'repurpose',
      title:
        scheduleType === 'schedule'
          ? 'Created scheduled posts from repurpose queue'
          : 'Created drafts from repurpose queue',
      detail: {
        items: preview.totalItems,
        acceptedItems: preview.acceptedItems,
        ignoredItems: preview.ignoredItems,
        invalidItems: preview.invalidItems,
        workflowMode: preview.workflowMode,
        contentFilter: preview.contentFilter,
        scheduleType,
        scheduledItems: scheduledItems.length,
      },
    });

    return {
      product: 'snaps',
      source: 'snaps-repurpose-queue',
      scheduleType,
      preview,
      items: scheduledItems,
    };
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

    const payload = built.payload;
    const result = {
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
    };
    // A double click or a client retry would otherwise create (and later publish) the
    // same posts twice. Same channels + same content + same time within the window is
    // treated as the same request; serialized so two in-flight requests cannot both pass.
    const fingerprint = scheduleFingerprint(payload);
    return runSnapsSerialized(`SnapsSchedule:${organizationId}`, async () => {
      const previous = recentSchedules.get(organizationId)?.get(fingerprint);
      if (previous && Date.now() - previous.at < duplicateScheduleWindowMs) {
        return {
          ...result,
          duplicate: true,
          warnings: [
            ...result.warnings,
            'The same posts were already created for these channels and time a moment ago, so they were not created again.',
          ],
          scheduled: previous.scheduled,
        };
      }
      const mapped = await this.postsService.mapTypeToPost(
        payload as CreatePostDto,
        organizationId
      );
      const scheduled = await this.postsService.createPost(organizationId, mapped);
      rememberSchedule(organizationId, fingerprint, scheduled);
      return { ...result, scheduled };
    });
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

  @Post('/source-resolver/preview')
  async previewResolvedSource(@Body() body?: SnapsSourceResolverRequest) {
    return this.sourceResolver.preview(body);
  }

  @Post('/source-resolver/import')
  async importResolvedSource(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsSourceResolverRequest
  ) {
    const preview = await this.sourceResolver.preview(body);
    const imported = await this.library.importSources(org.id, [
      preview.sourceInput,
    ]);
    await this.activity.record(org.id, {
      type: 'source',
      title: 'Resolved external source into library',
      detail: {
        sourceType: preview.sourceType,
        title: preview.title,
        wordCount: preview.wordCount,
        warnings: preview.warnings.length,
      },
    });
    return {
      preview,
      imported,
    };
  }

  @Post('/calendar/plan')
  planContentCalendar(@Body() body?: SnapsContentCalendarRequest) {
    return this.contentCalendar.preview(body);
  }

  @Post('/calendar/import-sources')
  async importContentCalendarSources(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsContentCalendarRequest
  ) {
    const preview = this.contentCalendar.preview(body);
    const sources = this.contentCalendar.toSourceInputs(preview.items);
    if (!sources.length) {
      throw new BadRequestException('No valid content calendar items were available to import.');
    }
    const imported = await this.library.importSources(org.id, sources);
    await this.activity.record(org.id, {
      type: 'calendar',
      title: 'Imported content calendar items into source library',
      detail: {
        campaign: preview.campaign,
        items: preview.totalItems,
        acceptedItems: preview.acceptedItems,
        invalidItems: preview.invalidItems,
        imported,
      },
    });
    return {
      ...preview,
      imported,
    };
  }

  @Post('/calendar/schedule')
  async scheduleContentCalendar(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsContentCalendarScheduleRequest
  ) {
    const request = body || {};
    const scheduleType = this.cleanScheduleType(request.scheduleType) || 'draft';
    this.assertOperatorConfirmed(scheduleType, request.operatorConfirmed);
    const preview = this.contentCalendar.preview(request);
    const integrations = this.normalizeScheduleIntegrations(request.integrations);
    const fallbackPublishDate = this.cleanOptionalString(request.publishDate, 80);
    const scheduledItems = [];

    for (const item of preview.items.filter((entry) => entry.status !== 'invalid')) {
      const variants = this.contentCalendar.toVariants(item);
      const scheduled = await this.scheduleVariantsForOrg(
        org.id,
        {
          variants,
          integrations,
          publishDate: item.publishDate || fallbackPublishDate,
          scheduleType,
        },
        {
          provider: 'rule-fallback',
          model: 'content-calendar',
          variants,
          warnings: item.warnings,
          ragExamplesUsed: [],
        }
      );
      scheduledItems.push({
        itemIndex: item.itemIndex,
        title: item.title,
        platform: item.platform,
        format: item.format,
        pillar: item.pillar,
        publishDate: item.publishDate,
        status: item.status,
        warnings: scheduled.warnings || [],
        scheduled: scheduled.scheduled || [],
      });
    }

    await this.activity.record(org.id, {
      type: 'calendar',
      title:
        scheduleType === 'schedule'
          ? 'Created scheduled posts from content calendar'
          : 'Created drafts from content calendar',
      detail: {
        campaign: preview.campaign,
        items: preview.totalItems,
        acceptedItems: preview.acceptedItems,
        invalidItems: preview.invalidItems,
        scheduleType,
        scheduledItems: scheduledItems.length,
      },
    });

    return {
      product: 'snaps',
      source: 'snaps-content-calendar',
      scheduleType,
      preview,
      items: scheduledItems,
    };
  }

  @Post('/categories/plan')
  planContentCategories(@Body() body?: SnapsContentCategoryRequest) {
    return this.contentCategories.preview(body);
  }

  @Post('/categories/import-sources')
  async importContentCategorySources(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsContentCategoryRequest
  ) {
    const preview = this.contentCategories.preview(body);
    const sources = this.contentCategories.toSourceInputs(preview.items);
    if (!sources.length) {
      throw new BadRequestException('No valid content category items were available to import.');
    }
    const imported = await this.library.importSources(org.id, sources);
    await this.activity.record(org.id, {
      type: 'category',
      title: 'Imported content category queue into source library',
      detail: {
        campaign: preview.campaign,
        items: preview.totalItems,
        acceptedItems: preview.acceptedItems,
        invalidItems: preview.invalidItems,
        imported,
      },
    });
    return {
      ...preview,
      imported,
    };
  }

  @Post('/categories/schedule')
  async scheduleContentCategories(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsContentCategoryScheduleRequest
  ) {
    const request = body || {};
    const scheduleType = this.cleanScheduleType(request.scheduleType) || 'draft';
    this.assertOperatorConfirmed(scheduleType, request.operatorConfirmed);
    const preview = this.contentCategories.preview(request);
    const integrations = this.normalizeScheduleIntegrations(request.integrations);
    const fallbackPublishDate = this.cleanOptionalString(request.publishDate, 80);
    const scheduledItems: Array<{
      itemIndex: number;
      title: string;
      platform: SnapsTargetPlatform;
      categoryName: string;
      shareMode: string;
      publishDate: string;
      status: string;
      warnings: string[];
      scheduled: unknown[];
    }> = [];

    for (const item of preview.items.filter((entry) => entry.status !== 'invalid')) {
      const variants = this.contentCategories.toVariants(item);
      const scheduled = await this.scheduleVariantsForOrg(
        org.id,
        {
          variants,
          integrations,
          publishDate: item.publishDate || fallbackPublishDate,
          scheduleType,
        },
        {
          provider: 'rule-fallback',
          model: 'content-categories',
          variants,
          warnings: item.warnings,
          ragExamplesUsed: [] as SnapsTransformResult['ragExamplesUsed'],
        }
      );
      scheduledItems.push({
        itemIndex: item.itemIndex,
        title: item.title,
        platform: item.platform,
        categoryName: item.categoryName,
        shareMode: item.shareMode,
        publishDate: item.publishDate,
        status: item.status,
        warnings: scheduled.warnings || [],
        scheduled: scheduled.scheduled || [],
      });
    }

    await this.activity.record(org.id, {
      type: 'category',
      title:
        scheduleType === 'schedule'
          ? 'Created scheduled posts from content categories'
          : 'Created drafts from content categories',
      detail: {
        campaign: preview.campaign,
        items: preview.totalItems,
        acceptedItems: preview.acceptedItems,
        invalidItems: preview.invalidItems,
        scheduleType,
        scheduledItems: scheduledItems.length,
      },
    });

    return {
      product: 'snaps',
      source: 'snaps-content-categories',
      scheduleType,
      preview,
      items: scheduledItems,
    };
  }

  @Post('/conditions/preview')
  previewPostCondition(@Body() body?: SnapsPostConditionRequest) {
    return this.postConditions.preview(body);
  }

  @Post('/conditions/import-source')
  async importPostConditionSource(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsPostConditionRequest
  ) {
    const preview = this.postConditions.preview(body);
    const imported = await this.library.importSources(org.id, [
      this.postConditions.toSourceInput(preview.item),
    ]);
    await this.activity.record(org.id, {
      type: 'condition',
      title: 'Imported conditional follow-up into source library',
      detail: {
        conditionType: preview.conditionType,
        status: preview.status,
        triggerMet: preview.triggerMet,
        imported,
      },
    });
    return {
      preview,
      imported,
    };
  }

  @Post('/conditions/schedule')
  async schedulePostCondition(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsPostConditionScheduleRequest
  ) {
    const request = body || {};
    const scheduleType = this.cleanScheduleType(request.scheduleType) || 'draft';
    this.assertOperatorConfirmed(scheduleType, request.operatorConfirmed);
    const preview = this.postConditions.preview(request);
    const variants = this.postConditions.toVariants(preview.item);
    const warnings = [...preview.warnings];
    if (!variants.length) {
      warnings.push('Post condition has not triggered yet, so no follow-up was queued.');
    }
    const scheduled = variants.length
      ? await this.scheduleVariantsForOrg(
          org.id,
          {
            variants,
            integrations: this.normalizeScheduleIntegrations(request.integrations),
            publishDate:
              this.cleanOptionalString(request.publishDate, 80) ||
              preview.recommendedPublishDate,
            scheduleType,
          },
          {
            provider: 'rule-fallback',
          model: 'post-condition',
          variants,
          warnings,
          ragExamplesUsed: [] as SnapsTransformResult['ragExamplesUsed'],
        }
      )
      : {
          provider: 'rule-fallback',
          model: 'post-condition',
          variants,
          warnings,
          ragExamplesUsed: [] as SnapsTransformResult['ragExamplesUsed'],
          scheduled: [] as unknown[],
        };

    await this.activity.record(org.id, {
      type: 'condition',
      title:
        scheduleType === 'schedule'
          ? 'Evaluated conditional follow-up for scheduled queue'
          : 'Evaluated conditional follow-up for draft queue',
      detail: {
        conditionType: preview.conditionType,
        status: preview.status,
        triggerMet: preview.triggerMet,
        scheduled: scheduled.scheduled?.length || 0,
      },
    });

    return {
      product: 'snaps',
      source: 'snaps-post-condition',
      scheduleType,
      preview,
      warnings: scheduled.warnings || warnings,
      scheduled: scheduled.scheduled || [],
    };
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

  @Post('/competitors')
  async saveCompetitorProfile(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsCompetitorProfileInput
  ) {
    const profile = await this.competitors.saveProfile(org.id, body);
    await this.activity.record(org.id, {
      type: 'competitor',
      title: 'Saved competitor account',
      detail: {
        competitorId: profile.id,
        platform: profile.platform,
        name: profile.name,
      },
    });
    return profile;
  }

  @Get('/competitors')
  listCompetitorProfiles(@GetOrgFromRequest() org: SnapsOrganization) {
    return this.competitors.listProfiles(org.id);
  }

  @Delete('/competitors/:competitorId')
  async deleteCompetitorProfile(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('competitorId') competitorId: string
  ) {
    const deleted = await this.competitors.deleteProfile(org.id, competitorId);
    await this.activity.record(org.id, {
      type: 'delete',
      title: 'Deleted competitor account',
      detail: { competitorId, deleted: deleted.deleted },
    });
    return deleted;
  }

  @Post('/competitors/snapshots')
  async recordCompetitorSnapshot(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsCompetitorSnapshotInput
  ) {
    const snapshot = await this.competitors.recordSnapshot(org.id, body);
    await this.activity.record(org.id, {
      type: 'competitor',
      title: 'Recorded competitor analytics snapshot',
      detail: {
        competitorId: snapshot.competitorId,
        followers: snapshot.followers,
        engagement: snapshot.engagement,
        postsCount: snapshot.postsCount,
      },
    });
    return snapshot;
  }

  @Post('/competitors/import-preview')
  competitorImportPreview(
    @Body() body?: SnapsCompetitorImportRequest
  ) {
    return this.competitors.previewImport(body);
  }

  @Post('/competitors/import')
  async importCompetitorSnapshots(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsCompetitorImportRequest
  ) {
    const imported = await this.competitors.importPublicSnapshots(org.id, body);
    await this.activity.record(org.id, {
      type: 'competitor',
      title: 'Imported competitor public snapshots',
      detail: {
        profiles: imported.imported.profiles,
        snapshots: imported.imported.snapshots,
        acceptedRows: imported.acceptedRows,
        source: imported.source,
      },
    });
    return imported;
  }

  @Get('/competitors/summary')
  competitorSummary(@GetOrgFromRequest() org: SnapsOrganization) {
    return this.competitors.summary(org.id);
  }

  @Post('/competitors/report')
  async competitorReport(@GetOrgFromRequest() org: SnapsOrganization) {
    const report = await this.competitors.report(org.id);
    const stored = await this.library.saveReport(
      org.id,
      report.title,
      report as Record<string, unknown>
    );
    await this.activity.record(org.id, {
      type: 'report',
      title: 'Generated competitor analysis report',
      detail: { reportId: stored.id, source: report.source },
    });
    return { ...report, reportId: stored.id };
  }

  @Post('/sales/campaigns')
  async saveSalesCampaign(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsSalesCampaignInput
  ) {
    const campaign = await this.sales.saveCampaign(org.id, body);
    await this.activity.record(org.id, {
      type: 'sales',
      title: 'Created sales link campaign',
      detail: {
        campaignId: campaign.id,
        slug: campaign.slug,
        platform: campaign.platform,
      },
    });
    return campaign;
  }

  @Get('/sales/campaigns')
  listSalesCampaigns(@GetOrgFromRequest() org: SnapsOrganization) {
    return this.sales.listCampaigns(org.id);
  }

  @Delete('/sales/campaigns/:campaignId')
  async deleteSalesCampaign(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('campaignId') campaignId: string
  ) {
    const deleted = await this.sales.deleteCampaign(org.id, campaignId);
    await this.activity.record(org.id, {
      type: 'delete',
      title: 'Deleted sales link campaign',
      detail: { campaignId, deleted: deleted.deleted },
    });
    return deleted;
  }

  @Post('/sales/events')
  async recordSalesEvent(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsSalesEventInput
  ) {
    const event = await this.sales.recordEvent(org.id, body);
    await this.activity.record(org.id, {
      type: 'sales',
      title: 'Recorded sales attribution event',
      detail: {
        campaignId: event.campaignId,
        eventType: event.eventType,
        amount: event.amount,
        currency: event.currency,
      },
    });
    return event;
  }

  @Get('/sales/summary')
  salesSummary(@GetOrgFromRequest() org: SnapsOrganization) {
    return this.sales.summary(org.id);
  }

  @Post('/sales/report')
  async salesReport(@GetOrgFromRequest() org: SnapsOrganization) {
    const report = await this.sales.report(org.id);
    const stored = await this.library.saveReport(
      org.id,
      report.title,
      report as Record<string, unknown>
    );
    await this.activity.record(org.id, {
      type: 'report',
      title: 'Generated sales attribution report',
      detail: { reportId: stored.id, source: report.source },
    });
    return { ...report, reportId: stored.id };
  }

  @Post('/sales/proposal')
  async salesProposal(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsSalesProposalRequest
  ) {
    const proposal = await this.sales.proposal(org.id, body);
    await this.activity.record(org.id, {
      type: 'sales',
      title: 'Generated sales pilot proposal',
      detail: {
        source: proposal.source,
        leadName: proposal.leadName,
        packageName: proposal.packageName,
        pilotDays: proposal.pilotDays,
        targetRevenue: proposal.targetRevenue,
      },
    });
    return proposal;
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
    @Query('sentiment') sentiment?: SnapsFeedbackSentiment,
    @Query('status') status?: SnapsFeedbackStatus,
    @Query('search') search?: string
  ) {
    return this.inbox.listItems(org.id, { platform, sentiment, status, search });
  }

  @Post('/inbox/assignments/preview')
  async previewInboxAssignments(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsInboxAssignmentRequest
  ) {
    const preview = await this.inbox.previewAssignments(org.id, body || {});
    await this.activity.record(org.id, {
      type: 'inbox',
      title: 'Previewed inbox assignment router',
      detail: {
        total: preview.total,
        urgent: preview.lanes.urgent,
        high: preview.lanes.high,
      },
    });
    return preview;
  }

  @Post('/inbox/items/:itemId/status')
  async updateFeedbackStatus(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('itemId') itemId: string,
    @Body() body?: SnapsFeedbackStatusRequest
  ) {
    const updated = await this.inbox.updateItemStatus(org.id, itemId, body || {});
    await this.activity.record(org.id, {
      type: 'inbox',
      title: 'Updated feedback inbox status',
      detail: { itemId, status: updated.item?.status, updated: updated.updated },
    });
    return updated;
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

  @Get('/inbox/reply-templates')
  listReplyTemplates(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Query('platform') platform?: SnapsTargetPlatform,
    @Query('sentiment') sentiment?: SnapsFeedbackSentiment
  ) {
    return this.inbox.listReplyTemplates(org.id, { platform, sentiment });
  }

  @Post('/inbox/reply-templates')
  async saveReplyTemplate(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsReplyTemplateInput
  ) {
    const saved = await this.inbox.saveReplyTemplate(org.id, body || {});
    await this.activity.record(org.id, {
      type: 'inbox',
      title: 'Saved feedback reply template',
      detail: {
        templateId: saved.template.id,
        title: saved.template.title,
        platform: saved.template.platform,
        sentiment: saved.template.sentiment,
      },
    });
    return saved;
  }

  @Delete('/inbox/reply-templates/:templateId')
  async deleteReplyTemplate(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('templateId') templateId: string
  ) {
    const deleted = await this.inbox.deleteReplyTemplate(org.id, templateId);
    await this.activity.record(org.id, {
      type: 'delete',
      title: 'Deleted feedback reply template',
      detail: { templateId, ...deleted },
    });
    return deleted;
  }

  @Get('/inbox/notes')
  listInboxNotes(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Query('platform') platform?: SnapsTargetPlatform,
    @Query('author') author?: string,
    @Query('postId') postId?: string
  ) {
    return this.inbox.listInboxNotes(org.id, { platform, author, postId });
  }

  @Post('/inbox/notes')
  async saveInboxNote(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsInboxNoteInput
  ) {
    const saved = await this.inbox.saveInboxNote(org.id, body || {});
    await this.activity.record(org.id, {
      type: 'inbox',
      title: 'Saved feedback inbox note',
      detail: {
        noteId: saved.note.id,
        platform: saved.note.platform,
        author: saved.note.author,
        postId: saved.note.postId,
      },
    });
    return saved;
  }

  @Delete('/inbox/notes/:noteId')
  async deleteInboxNote(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Param('noteId') noteId: string
  ) {
    const deleted = await this.inbox.deleteInboxNote(org.id, noteId);
    await this.activity.record(org.id, {
      type: 'delete',
      title: 'Deleted feedback inbox note',
      detail: { noteId, ...deleted },
    });
    return deleted;
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
    const reply = cleanSnapsMultilineText(request.reply, 10000);
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
    const reply = cleanSnapsMultilineText(request.reply, 10000);
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
    this.assertReplyFitsPlatform(integration.providerIdentifier, reply);

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

  @Post('/video/voiceover-captions/preview')
  async videoVoiceoverCaptionPreview(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsVideoVoiceoverCaptionRequest
  ) {
    const preview = this.videoVoiceoverCaptions.preview(body);
    await this.activity.record(org.id, {
      type: 'video',
      title: 'Previewed voiceover captions',
      detail: {
        source: preview.source,
        platform: preview.platform,
        captions: preview.summary.captionCount,
        alignmentScore: preview.summary.alignmentScore,
      },
    });
    return preview;
  }

  @Post('/video/publish-guard/preview')
  async videoPublishGuardPreview(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsVideoPublishGuardRequest
  ) {
    const preview = this.videoPublishGuard.preview(body);
    await this.activity.record(org.id, {
      type: 'video',
      title: 'Previewed video publish guard',
      detail: {
        source: preview.source,
        platforms: preview.targetPlatforms,
        credits: preview.creditBudget.totalCredits,
        score: preview.publishReadinessScore,
        requiredDisclosures: preview.disclosureChecklist.filter(
          (item) => item.labelRequired
        ).length,
      },
    });
    return preview;
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
    const caption = cleanSnapsMultilineText(request.caption, 1000);
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
    const [
      sources,
      styleExamples,
      reports,
      salesCampaigns,
      salesEvents,
      competitorProfiles,
      competitorSnapshots,
      approvalRequests,
      ideas,
      brandKits,
      mediaAssets,
      hashtagSets,
      listeningMonitors,
      agentTasks,
      inboxItems,
      replyTemplates,
      inboxNotes,
      activity,
    ] =
      await Promise.all([
        this.library.listSources(org.id),
        this.rag.listExamples(org.id),
        this.library.listReports(org.id),
        this.sales.listCampaigns(org.id),
        this.sales.listEvents(org.id),
        this.competitors.listProfiles(org.id),
        this.competitors.listSnapshots(org.id),
        this.approvals.exportApprovals(org.id),
        this.ideas.list(org.id),
        this.brandKits.list(org.id),
        this.mediaAssets.list(org.id),
        this.hashtagSets.list(org.id),
        this.socialListening.list(org.id),
        this.agentTasks.exportTasks(org.id),
        this.inbox.listItems(org.id),
        this.inbox.listReplyTemplates(org.id),
        this.inbox.listInboxNotes(org.id),
        this.activity.list(org.id),
      ]);

    return {
      product: 'snaps',
      organizationId: org.id,
      exportedAt: new Date().toISOString(),
      sources,
      styleExamples,
      reports,
      salesCampaigns,
      salesEvents,
      competitorProfiles,
      competitorSnapshots,
      approvalRequests,
      ideas,
      brandKits,
      mediaAssets,
      hashtagSets,
      listeningMonitors,
      agentTasks,
      inboxItems,
      replyTemplates,
      inboxNotes,
      activity,
    };
  }

  @Post('/import')
  async importWorkspace(
    @GetOrgFromRequest() org: SnapsOrganization,
    @Body() body?: SnapsWorkspaceImportRequest
  ) {
    const [
      sources,
      styleExamples,
      reports,
      salesCampaigns,
      salesEvents,
      competitorProfiles,
      competitorSnapshots,
      approvalRequests,
      ideas,
      brandKits,
      mediaAssets,
      hashtagSets,
      listeningMonitors,
      agentTasks,
      inboxItems,
      replyTemplates,
      inboxNotes,
      activity,
    ] = await Promise.all([
      this.library.importSources(org.id, this.asArray(body?.sources)),
      this.rag.importExamples(
        org.id,
        this.asArray(body?.styleExamples).length
          ? this.asArray(body?.styleExamples)
          : this.asArray(body?.ragExamples)
      ),
      this.library.importReports(org.id, this.asArray(body?.reports)),
      this.sales.importCampaigns(org.id, this.asArray(body?.salesCampaigns)),
      this.sales.importEvents(org.id, this.asArray(body?.salesEvents)),
      this.competitors.importProfiles(
        org.id,
        this.asArray(body?.competitorProfiles)
      ),
      this.competitors.importSnapshots(
        org.id,
        this.asArray(body?.competitorSnapshots)
      ),
      this.approvals.importApprovals(
        org.id,
        this.asArray(body?.approvalRequests)
      ),
      this.ideas.importIdeas(org.id, this.asArray(body?.ideas)),
      this.brandKits.importBrandKits(org.id, this.asArray(body?.brandKits)),
      this.mediaAssets.importAssets(org.id, this.asArray(body?.mediaAssets)),
      this.hashtagSets.importSets(org.id, this.asArray(body?.hashtagSets)),
      this.socialListening.importMonitors(
        org.id,
        this.asArray(body?.listeningMonitors)
      ),
      this.agentTasks.importTasks(org.id, this.asArray(body?.agentTasks)),
      this.inbox.importStoredItems(
        org.id,
        this.asArray(body?.inboxItems).length
          ? this.asArray(body?.inboxItems)
          : this.asArray(body?.feedbackItems)
      ),
      this.inbox.importReplyTemplates(
        org.id,
        this.asArray(body?.replyTemplates)
      ),
      this.inbox.importInboxNotes(org.id, this.asArray(body?.inboxNotes)),
      this.activity.importEntries(org.id, this.asArray(body?.activity)),
    ]);

    const summary = {
      sources,
      styleExamples,
      reports,
      salesCampaigns,
      salesEvents,
      competitorProfiles,
      competitorSnapshots,
      approvalRequests,
      ideas,
      brandKits,
      mediaAssets,
      hashtagSets,
      listeningMonitors,
      agentTasks,
      inboxItems,
      replyTemplates,
      inboxNotes,
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

    const candidates = this.resolvePixelleBaseUrls(pixelleUrl);
    let bestResult: Record<string, unknown> | undefined;
    for (const baseUrl of candidates) {
      const service = await this.fetchJsonWithTimeout(`${baseUrl}/health`, 2500);
      const runtime = await this.fetchJsonWithTimeout(`${baseUrl}/snaps/runtime`, 3500);
      const runtimeRecord = this.asRecord(runtime.payload);
      const serviceRecord = this.asRecord(service.payload);
      const result = {
        configured: true,
        ok: service.ok && runtime.ok && runtimeRecord.ok === true,
        serviceOk: service.ok,
        runtimeOk: runtime.ok && runtimeRecord.ok === true,
        url: baseUrl,
        attemptedUrls: candidates,
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
      if (result.ok) {
        return result;
      }
      if (!bestResult || result.serviceOk || result.runtimeOk) {
        bestResult = result;
      }
    }

    return bestResult;
  }

  private resolvePixelleBaseUrls(configuredUrl: string) {
    const urls: string[] = [];
    const add = (value?: string) => {
      const normalized = this.cleanOptionalString(value, 2000).replace(/\/$/, '');
      if (normalized && !urls.includes(normalized)) {
        urls.push(normalized);
      }
    };

    add(process.env.PIXELLE_VIDEO_HOST_URL);
    add(configuredUrl);

    const parsed = this.parseUrl(configuredUrl);
    if (parsed && ['snaps-pixelle-video', 'pixelle-video'].includes(parsed.hostname)) {
      parsed.hostname = 'localhost';
      add(parsed.toString());
    }

    return urls;
  }

  private parseUrl(value: string) {
    try {
      return new URL(value);
    } catch {
      return undefined;
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

  /** Replies go straight to the provider API, so reject what the platform would reject. */
  private assertReplyFitsPlatform(providerIdentifier: string, reply: string) {
    if (!(snapsTargetPlatforms as readonly string[]).includes(providerIdentifier)) {
      return;
    }
    const platform = providerIdentifier as SnapsTargetPlatform;
    // A reply is a single post, so reply-chain platforms (Threads 500) use the per-post limit.
    const limit =
      snapsPlatformRules[platform].postMaxLength || snapsPlatformRules[platform].maxLength;
    const length = snapsContentLength(platform, reply);
    if (length > limit) {
      throw new BadRequestException(
        `reply is ${length}/${limit} characters for ${snapsPlatformRules[platform].label}${
          platform === 'x' ? ' (X counts Korean characters as 2)' : ''
        }. Shorten it before publishing.`
      );
    }
  }

  /** Single-line fields only (ids, titles, labels); post bodies use cleanSnapsMultilineText. */
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
    const sourceText = cleanSnapsMultilineText(request.sourceText, 50000);
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

  private normalizeScheduleIntegrations(
    value: unknown
  ): SnapsScheduleVariantsRequestDto['integrations'] {
    return (Array.isArray(value) ? value : [])
      .map((item) => {
        const record = this.asRecord(item);
        const platform = this.validPlatform(record?.platform);
        const integrationId = this.cleanOptionalString(record?.integrationId, 200);
        return platform && integrationId
          ? {
              platform,
              integrationId,
            }
          : undefined;
      })
      .filter(
        (item): item is NonNullable<SnapsScheduleVariantsRequestDto['integrations']>[number] =>
          !!item
      );
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
    const content = cleanSnapsMultilineText(request.content, 50000);
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
    const sourceText = cleanSnapsMultilineText(request.sourceText, 5000);
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
