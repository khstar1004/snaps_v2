import { Module } from '@nestjs/common';
import { OllamaClient } from '@gitroom/nestjs-libraries/snaps/ai/ollama.client';
import { SnapsContentTransformService } from '@gitroom/nestjs-libraries/snaps/transform/content-transform.service';
import { SnapsVectorStoreService } from '@gitroom/nestjs-libraries/snaps/rag/vector-store.service';
import { SnapsRagService } from '@gitroom/nestjs-libraries/snaps/rag/rag.service';
import { SnapsReportGeneratorService } from '@gitroom/nestjs-libraries/snaps/analytics/report-generator.service';
import { SnapsShortVideoService } from '@gitroom/nestjs-libraries/snaps/video/short-video.service';
import { SnapsVideoVoiceoverCaptionService } from '@gitroom/nestjs-libraries/snaps/video/voiceover-caption.service';
import { SnapsVideoPublishGuardService } from '@gitroom/nestjs-libraries/snaps/video/video-publish-guard.service';
import { SnapsFeedbackInboxService } from '@gitroom/nestjs-libraries/snaps/inbox/feedback-inbox.service';
import { SnapsSourceLibraryService } from '@gitroom/nestjs-libraries/snaps/library/source-library.service';
import { SnapsActivityLogService } from '@gitroom/nestjs-libraries/snaps/activity/activity-log.service';
import { SnapsCommandPlannerService } from '@gitroom/nestjs-libraries/snaps/agent/command-planner.service';
import { SnapsAgentTaskService } from '@gitroom/nestjs-libraries/snaps/agent/agent-task.service';
import { SnapsLinkAttributionService } from '@gitroom/nestjs-libraries/snaps/sales/link-attribution.service';
import { SnapsCompetitorAnalyticsService } from '@gitroom/nestjs-libraries/snaps/competitors/competitor-analytics.service';
import { SnapsBulkCampaignService } from '@gitroom/nestjs-libraries/snaps/bulk/bulk-campaign.service';
import { SnapsFeedIntakeService } from '@gitroom/nestjs-libraries/snaps/feeds/feed-intake.service';
import { SnapsCarouselVisualService } from '@gitroom/nestjs-libraries/snaps/visuals/carousel-visual.service';
import { SnapsEvergreenRecycleService } from '@gitroom/nestjs-libraries/snaps/recycle/evergreen-recycle.service';
import { SnapsApprovalWorkflowService } from '@gitroom/nestjs-libraries/snaps/approvals/approval-workflow.service';
import { SnapsViralCoachService } from '@gitroom/nestjs-libraries/snaps/coach/viral-coach.service';
import { SnapsSourceResolverService } from '@gitroom/nestjs-libraries/snaps/source-resolver/source-resolver.service';
import { SnapsContentCalendarService } from '@gitroom/nestjs-libraries/snaps/calendar/content-calendar.service';
import { SnapsPostConditionService } from '@gitroom/nestjs-libraries/snaps/conditions/post-condition.service';
import { SnapsContentCategoryService } from '@gitroom/nestjs-libraries/snaps/categories/content-category.service';
import { SnapsRecurringPostService } from '@gitroom/nestjs-libraries/snaps/recurring/recurring-post.service';
import { SnapsRepurposeQueueService } from '@gitroom/nestjs-libraries/snaps/repurpose/repurpose-queue.service';
import { SnapsContentIdeaService } from '@gitroom/nestjs-libraries/snaps/ideas/content-idea.service';
import { SnapsBrandKitService } from '@gitroom/nestjs-libraries/snaps/brand/brand-kit.service';
import { SnapsMediaAssetService } from '@gitroom/nestjs-libraries/snaps/media/media-asset.service';
import { SnapsCreativeBriefService } from '@gitroom/nestjs-libraries/snaps/creative/creative-brief.service';
import { SnapsVisualFeedPlannerService } from '@gitroom/nestjs-libraries/snaps/planner/visual-feed-planner.service';
import { SnapsFirstCommentService } from '@gitroom/nestjs-libraries/snaps/comments/first-comment.service';
import { SnapsHashtagSetService } from '@gitroom/nestjs-libraries/snaps/hashtags/hashtag-set.service';
import { SnapsHashtagTrackerService } from '@gitroom/nestjs-libraries/snaps/hashtags/hashtag-tracker.service';
import { SnapsSocialListeningService } from '@gitroom/nestjs-libraries/snaps/listening/social-listening.service';
import { SnapsTrendRadarService } from '@gitroom/nestjs-libraries/snaps/trends/trend-radar.service';
import { SnapsPostPreviewService } from '@gitroom/nestjs-libraries/snaps/previews/post-preview.service';
import { SnapsAdDisclosureGuardService } from '@gitroom/nestjs-libraries/snaps/compliance/ad-disclosure-guard.service';
import { SnapsPostVariationService } from '@gitroom/nestjs-libraries/snaps/experiments/post-variation.service';

@Module({
  providers: [
    OllamaClient,
    SnapsContentTransformService,
    SnapsVectorStoreService,
    SnapsRagService,
    SnapsReportGeneratorService,
    SnapsShortVideoService,
    SnapsVideoVoiceoverCaptionService,
    SnapsVideoPublishGuardService,
    SnapsFeedbackInboxService,
    SnapsSourceLibraryService,
    SnapsActivityLogService,
    SnapsCommandPlannerService,
    SnapsAgentTaskService,
    SnapsLinkAttributionService,
    SnapsCompetitorAnalyticsService,
    SnapsBulkCampaignService,
    SnapsFeedIntakeService,
    SnapsCarouselVisualService,
    SnapsEvergreenRecycleService,
    SnapsApprovalWorkflowService,
    SnapsViralCoachService,
    SnapsSourceResolverService,
    SnapsContentCalendarService,
    SnapsPostConditionService,
    SnapsContentCategoryService,
    SnapsRecurringPostService,
    SnapsRepurposeQueueService,
    SnapsContentIdeaService,
    SnapsBrandKitService,
    SnapsMediaAssetService,
    SnapsCreativeBriefService,
    SnapsVisualFeedPlannerService,
    SnapsFirstCommentService,
    SnapsHashtagSetService,
    SnapsHashtagTrackerService,
    SnapsSocialListeningService,
    SnapsTrendRadarService,
    SnapsPostPreviewService,
    SnapsAdDisclosureGuardService,
    SnapsPostVariationService,
  ],
  exports: [
    OllamaClient,
    SnapsContentTransformService,
    SnapsVectorStoreService,
    SnapsRagService,
    SnapsReportGeneratorService,
    SnapsShortVideoService,
    SnapsVideoVoiceoverCaptionService,
    SnapsVideoPublishGuardService,
    SnapsFeedbackInboxService,
    SnapsSourceLibraryService,
    SnapsActivityLogService,
    SnapsCommandPlannerService,
    SnapsAgentTaskService,
    SnapsLinkAttributionService,
    SnapsCompetitorAnalyticsService,
    SnapsBulkCampaignService,
    SnapsFeedIntakeService,
    SnapsCarouselVisualService,
    SnapsEvergreenRecycleService,
    SnapsApprovalWorkflowService,
    SnapsViralCoachService,
    SnapsSourceResolverService,
    SnapsContentCalendarService,
    SnapsPostConditionService,
    SnapsContentCategoryService,
    SnapsRecurringPostService,
    SnapsRepurposeQueueService,
    SnapsContentIdeaService,
    SnapsBrandKitService,
    SnapsMediaAssetService,
    SnapsCreativeBriefService,
    SnapsVisualFeedPlannerService,
    SnapsFirstCommentService,
    SnapsHashtagSetService,
    SnapsHashtagTrackerService,
    SnapsSocialListeningService,
    SnapsTrendRadarService,
    SnapsPostPreviewService,
    SnapsAdDisclosureGuardService,
    SnapsPostVariationService,
  ],
})
export class SnapsModule {}
