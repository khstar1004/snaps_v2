import path from 'path';
import { promises as fs } from 'fs';
import { OllamaClient } from '@gitroom/nestjs-libraries/snaps/ai/ollama.client';
import { snapsAnalyticsToMetricInputs } from '@gitroom/nestjs-libraries/snaps/analytics/analytics-metric.mapper';
import {
  SnapsMetricInput,
  SnapsReportGeneratorService,
} from '@gitroom/nestjs-libraries/snaps/analytics/report-generator.service';
import { SnapsShortVideoService } from '@gitroom/nestjs-libraries/snaps/video/short-video.service';
import { SnapsVideoVoiceoverCaptionService } from '@gitroom/nestjs-libraries/snaps/video/voiceover-caption.service';
import { SnapsVideoPublishGuardService } from '@gitroom/nestjs-libraries/snaps/video/video-publish-guard.service';
import { SnapsVectorStoreService } from '@gitroom/nestjs-libraries/snaps/rag/vector-store.service';
import { SnapsRagService } from '@gitroom/nestjs-libraries/snaps/rag/rag.service';
import { SnapsContentTransformService } from '@gitroom/nestjs-libraries/snaps/transform/content-transform.service';
import { SnapsSourceLibraryService } from '@gitroom/nestjs-libraries/snaps/library/source-library.service';
import { SnapsFeedbackInboxService } from '@gitroom/nestjs-libraries/snaps/inbox/feedback-inbox.service';
import { SnapsActivityLogService } from '@gitroom/nestjs-libraries/snaps/activity/activity-log.service';
import { SnapsLinkAttributionService } from '@gitroom/nestjs-libraries/snaps/sales/link-attribution.service';
import { SnapsCompetitorAnalyticsService } from '@gitroom/nestjs-libraries/snaps/competitors/competitor-analytics.service';
import { SnapsBulkCampaignService } from '@gitroom/nestjs-libraries/snaps/bulk/bulk-campaign.service';
import { SnapsFeedIntakeService } from '@gitroom/nestjs-libraries/snaps/feeds/feed-intake.service';
import { SnapsCarouselVisualService } from '@gitroom/nestjs-libraries/snaps/visuals/carousel-visual.service';
import { SnapsVisualFeedPlannerService } from '@gitroom/nestjs-libraries/snaps/planner/visual-feed-planner.service';
import { SnapsFirstCommentService } from '@gitroom/nestjs-libraries/snaps/comments/first-comment.service';
import { SnapsHashtagSetService } from '@gitroom/nestjs-libraries/snaps/hashtags/hashtag-set.service';
import { SnapsHashtagTrackerService } from '@gitroom/nestjs-libraries/snaps/hashtags/hashtag-tracker.service';
import { SnapsSocialListeningService } from '@gitroom/nestjs-libraries/snaps/listening/social-listening.service';
import { SnapsTrendRadarService } from '@gitroom/nestjs-libraries/snaps/trends/trend-radar.service';
import { SnapsPostPreviewService } from '@gitroom/nestjs-libraries/snaps/previews/post-preview.service';
import { SnapsAdDisclosureGuardService } from '@gitroom/nestjs-libraries/snaps/compliance/ad-disclosure-guard.service';
import { SnapsEvergreenRecycleService } from '@gitroom/nestjs-libraries/snaps/recycle/evergreen-recycle.service';
import { SnapsRecurringPostService } from '@gitroom/nestjs-libraries/snaps/recurring/recurring-post.service';
import { SnapsRepurposeQueueService } from '@gitroom/nestjs-libraries/snaps/repurpose/repurpose-queue.service';
import { SnapsApprovalWorkflowService } from '@gitroom/nestjs-libraries/snaps/approvals/approval-workflow.service';
import { SnapsViralCoachService } from '@gitroom/nestjs-libraries/snaps/coach/viral-coach.service';
import { SnapsPostVariationService } from '@gitroom/nestjs-libraries/snaps/experiments/post-variation.service';
import { SnapsSourceResolverService } from '@gitroom/nestjs-libraries/snaps/source-resolver/source-resolver.service';
import { SnapsContentCalendarService } from '@gitroom/nestjs-libraries/snaps/calendar/content-calendar.service';
import { SnapsPostConditionService } from '@gitroom/nestjs-libraries/snaps/conditions/post-condition.service';
import { SnapsContentCategoryService } from '@gitroom/nestjs-libraries/snaps/categories/content-category.service';
import { SnapsContentIdeaService } from '@gitroom/nestjs-libraries/snaps/ideas/content-idea.service';
import { SnapsBrandKitService } from '@gitroom/nestjs-libraries/snaps/brand/brand-kit.service';
import { SnapsMediaAssetService } from '@gitroom/nestjs-libraries/snaps/media/media-asset.service';
import { SnapsCreativeBriefService } from '@gitroom/nestjs-libraries/snaps/creative/creative-brief.service';
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
    const voiceoverCaptions = new SnapsVideoVoiceoverCaptionService();
    const videoPublishGuard = new SnapsVideoPublishGuardService();
    const activity = new SnapsActivityLogService();
    const sales = new SnapsLinkAttributionService();
    const competitors = new SnapsCompetitorAnalyticsService();
    const bulk = new SnapsBulkCampaignService();
    const feeds = new SnapsFeedIntakeService();
    const carouselVisuals = new SnapsCarouselVisualService();
    const visualFeedPlanner = new SnapsVisualFeedPlannerService();
    const firstComments = new SnapsFirstCommentService();
    const hashtagSets = new SnapsHashtagSetService();
    const hashtagTracker = new SnapsHashtagTrackerService();
    const socialListening = new SnapsSocialListeningService();
    const trendRadar = new SnapsTrendRadarService();
    const postPreviews = new SnapsPostPreviewService();
    const adDisclosureGuard = new SnapsAdDisclosureGuardService();
    const recycler = new SnapsEvergreenRecycleService();
    const recurringPosts = new SnapsRecurringPostService();
    const repurposeQueue = new SnapsRepurposeQueueService();
    const approvals = new SnapsApprovalWorkflowService();
    const viralCoach = new SnapsViralCoachService();
    const postVariations = new SnapsPostVariationService();
    const sourceResolver = new SnapsSourceResolverService();
    const contentCalendar = new SnapsContentCalendarService();
    const postConditions = new SnapsPostConditionService();
    const contentCategories = new SnapsContentCategoryService();
    const ideas = new SnapsContentIdeaService();
    const brandKits = new SnapsBrandKitService();
    const mediaAssets = new SnapsMediaAssetService();
    const creativeBriefs = new SnapsCreativeBriefService();

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

    const salesCampaign = await sales.saveCampaign(orgId, {
      title: 'Smoke sales campaign',
      destinationUrl: 'https://example.com/offer',
      cta: '상담 신청',
      platform: 'instagram',
      tags: ['sales', 'smoke'],
    });
    const secondarySalesCampaign = await sales.saveCampaign(orgId, {
      title: 'Smoke sales webinar',
      destinationUrl: 'https://example.com/webinar',
      cta: '웨비나 신청',
      platform: 'linkedin',
      tags: ['sales', 'webinar'],
    });
    assert(
      salesCampaign.trackingUrl.includes('utm_campaign=smoke-sales-campaign') &&
        salesCampaign.linkInBioUrl.includes('/snaps/link/'),
      'sales campaign should create tracking and link-in-bio URLs'
    );
    await sales.recordEvent(orgId, {
      campaignId: salesCampaign.id,
      eventType: 'click',
      platform: 'instagram',
    });
    await sales.recordEvent(orgId, {
      campaignId: salesCampaign.id,
      eventType: 'purchase',
      amount: 49000,
      currency: 'KRW',
    });
    const salesSummary = await sales.summary(orgId);
    assert(
      salesSummary.clicks === 1 &&
        salesSummary.purchases === 1 &&
        salesSummary.revenue === 49000,
      'sales summary should attribute clicks, purchases, and revenue'
    );
    const salesReport = await sales.report(orgId);
    assert(
      salesReport.metrics.sales.revenue === 49000 &&
        salesReport.source === 'snaps-sales-attribution',
      'sales report should expose revenue metrics'
    );
    const salesProposal = await sales.proposal(orgId, {
      leadName: 'Smoke lead',
      segment: 'B2B marketing team',
      sourceAsset: salesCampaign.title,
      pilotDays: 14,
      targetRevenue: 299000,
    });
    assert(
      salesProposal.source === 'snaps-sales-proposal' &&
        salesProposal.pricing.pilotFee > 0 &&
        salesProposal.followUpMessages.length >= 2 &&
        salesProposal.successMetrics.some((metric) => metric.includes('299000')),
      'sales proposal should turn attribution data into an executable pilot offer'
    );
    const publicSalesLink = await sales.publicLink(salesCampaign.slug, orgId);
    assert(
      publicSalesLink.source === 'snaps-public-sales-link' &&
        publicSalesLink.clickPath.includes(`/public/snaps/link/${orgId}/`) &&
        publicSalesLink.destinationHost === 'example.com',
      'sales public link should expose a link-in-bio landing contract'
    );
    const publicSalesHub = await sales.publicHub(orgId);
    const publicSalesEntry = await sales.publicEntry(orgId);
    assert(
      publicSalesHub.source === 'snaps-public-sales-hub' &&
        publicSalesHub.linkInBioUrl.endsWith(`/snaps/link/${encodeURIComponent(orgId)}`) &&
        publicSalesHub.links.some((link) => link.campaignId === salesCampaign.id) &&
        publicSalesHub.links.some((link) => link.campaignId === secondarySalesCampaign.id) &&
        publicSalesEntry.source === 'snaps-public-sales-hub',
      'sales public hub should expose multiple organization links'
    );
    const publicSalesClick = await sales.recordPublicClick(salesCampaign.slug, orgId, {
      smoke: true,
    });
    const salesSummaryAfterPublicClick = await sales.summary(orgId);
    assert(
      publicSalesClick.redirectUrl.includes('utm_campaign=smoke-sales-campaign') &&
        salesSummaryAfterPublicClick.clicks === 2,
      'sales public link click should record attribution and return a redirect URL'
    );

    const competitor = await competitors.saveProfile(orgId, {
      name: 'Smoke Rival',
      handle: '@smokerival',
      profileUrl: 'https://instagram.com/smokerival',
      platform: 'instagram',
      niche: 'AI content ops',
      tags: ['competitor', 'smoke'],
    });
    await competitors.recordSnapshot(orgId, {
      competitorId: competitor.id,
      followers: 12000,
      followersGrowth: 320,
      postsCount: 8,
      videosCount: 4,
      photosCount: 4,
      engagement: 560,
      engagementRate: 4.7,
      topPosts: [
        {
          title: 'Rival top reel',
          format: 'video',
          engagement: 560,
          hook: '3초 안에 문제를 보여준다',
        },
      ],
    });
    const competitorSummary = await competitors.summary(orgId);
    assert(
      competitorSummary.competitors === 1 &&
        competitorSummary.totalEngagement === 560 &&
        competitorSummary.videoShare === 0.5,
      'competitor summary should rank profiles and content mix'
    );
    const competitorReport = await competitors.report(orgId);
    assert(
      competitorReport.metrics.competitors.engagement === 560 &&
        competitorReport.source === 'snaps-competitor-analysis',
      'competitor report should expose competitor metrics'
    );
    const competitorImportPreview = competitors.previewImport({
      importText:
        'name,handle,profileUrl,platform,niche,followers,followersGrowth,postsCount,videosCount,photosCount,engagement,engagementRate,topPostTitle,topPostFormat,topPostEngagement,topPostHook\n' +
        'CSV Rival,@csvrival,https://instagram.com/csvrival,instagram,AI content ops,15000,260,10,6,4,760,5.1,"CSV rival reel",video,760,"show the problem fast"',
    });
    assert(
      competitorImportPreview.acceptedRows === 1 &&
        competitorImportPreview.snapshotRows === 1 &&
        competitorImportPreview.rows[0].topPosts[0].title === 'CSV rival reel',
      'competitor import preview should parse public CSV snapshots'
    );
    const competitorImport = await competitors.importPublicSnapshots(orgId, {
      importText: JSON.stringify({
        insights: [
          {
            account: {
              name: 'JSON Rival',
              username: 'jsonrival',
              provider: 'instagram',
            },
            followers: 21000,
            followers_growth: 310,
            posts_count: 9,
            videos_count: 5,
            photos_count: 4,
            engagement: 880,
            engagement_rate: 4.2,
          },
        ],
      }),
    });
    assert(
      competitorImport.imported.profiles === 1 &&
        competitorImport.imported.snapshots === 1,
      'competitor import should persist public JSON snapshots'
    );

    const ideaPreview = ideas.generate({
      topic: 'AI 콘텐츠 운영 14일 챌린지',
      audience: 'B2B 마케터',
      goal: '상담 댓글 증가',
      targetPlatforms: ['threads', 'instagram'],
      count: 4,
      cta: '댓글로 파일럿이라고 남기세요.',
    });
    assert(
      ideaPreview.source === 'snaps-idea-board' &&
        ideaPreview.ideas.length === 4 &&
        ideaPreview.ideas[0].targetPlatforms.includes('threads'),
      'idea board should generate channel-agnostic ideas'
    );
    const savedIdea = await ideas.save(orgId, {
      ...ideaPreview.ideas[0],
      linkUrl: 'https://example.com/idea',
    });
    assert(
      savedIdea.status === 'inbox' && savedIdea.tags.includes('idea'),
      'idea board should save generated ideas'
    );
    const plannedIdea = await ideas.updateStatus(orgId, savedIdea.id, {
      status: 'planned',
      group: 'This week',
    });
    assert(
      plannedIdea.idea.status === 'planned' &&
        plannedIdea.idea.group === 'This week',
      'idea board should update idea status and group'
    );
    const promotedIdeaSource = await sourceLibrary.saveSource(
      orgId,
      ideas.toSourceInput(plannedIdea.idea)
    );
    const promotedIdea = await ideas.markPromoted(orgId, savedIdea.id);
    assert(
      promotedIdea.status === 'drafted' &&
        promotedIdeaSource.sourcePlatform === 'idea-board',
      'idea board should promote ideas into source library input'
    );
    const importedIdeas = await ideas.importIdeas(orgId, [promotedIdea]);
    assert(
      importedIdeas.imported === 1,
      'idea board should import stored ideas'
    );
    const malformedIdea = await ideas
      .save(orgId, { body: { invalid: true } })
      .then(() => false)
      .catch(() => true);
    assert(malformedIdea, 'idea board should reject malformed ideas');

    const brandKitPreview = brandKits.analyze({
      name: 'snaps B2B 파일럿',
      audience: '5인 이하 B2B 브랜드 대표와 마케터',
      voice: '명확하고 실무적인 조언자',
      tone: '근거 중심, 과장 없음',
      targetPlatforms: ['threads', 'instagram'],
      requiredTerms: ['snaps', '콘텐츠 운영'],
      bannedTerms: ['무조건', '완벽한'],
      hashtags: ['#콘텐츠운영', '#snaps'],
      websiteText: 'Brand: snaps B2B 파일럿\n데이터와 사례를 바탕으로 말합니다.',
    });
    assert(
      brandKitPreview.source === 'snaps-brand-kit' &&
        brandKitPreview.targetPlatforms.includes('threads') &&
        brandKitPreview.promptGuidance.includes('Required terms'),
      'brand kit should analyze voice, audience, and platform guidance'
    );
    const savedBrandKit = await brandKits.save(orgId, brandKitPreview);
    const appliedBrandKit = await brandKits.apply(orgId, savedBrandKit.id, {
      sourceText: '이번 주 콘텐츠 운영 메모',
    });
    assert(
      appliedBrandKit.source === 'snaps-brand-kit-application' &&
        appliedBrandKit.transformPatch.tone.includes('명확') &&
        appliedBrandKit.hashtagAppend.includes('#snaps'),
      'brand kit should apply guidance to transform inputs'
    );
    const importedBrandKits = await brandKits.importBrandKits(orgId, [
      savedBrandKit,
    ]);
    assert(
      importedBrandKits.imported === 1,
      'brand kit should import stored guidance'
    );
    const malformedBrandKit = await brandKits
      .save(orgId, { bannedTerms: ['only invalid without voice signal'] })
      .then(() => false)
      .catch(() => true);
    assert(malformedBrandKit, 'brand kit should reject malformed guidance saves');

    const mediaAssetPreview = mediaAssets.preview({
      title: 'AI 콘텐츠 운영 카드뉴스 커버',
      url: 'https://example.com/snaps-cover.png',
      mediaType: 'image',
      altText: '콘텐츠 운영 과정을 보여주는 카드뉴스 커버',
      caption: '원문 하나를 SNS별 콘텐츠로 바꾸는 흐름을 보여줍니다.',
      campaign: '서비스 스모크 캠페인',
      tags: ['media', 'pilot'],
      targetPlatforms: ['instagram', 'youtube'],
      width: 1080,
      height: 1350,
    });
    assert(
      mediaAssetPreview.source === 'snaps-media-library' &&
        mediaAssetPreview.platformFit.some((fit) => fit.platform === 'youtube') &&
        mediaAssetPreview.warnings.some((warning) => warning.includes('YouTube')),
      'media library should preview platform fit and warnings'
    );
    const savedMediaAsset = await mediaAssets.save(orgId, mediaAssetPreview);
    const attachedMediaAsset = await mediaAssets.attach(orgId, savedMediaAsset.id, {
      targetPlatforms: ['instagram', 'linkedin'],
    });
    assert(
      attachedMediaAsset.source === 'snaps-media-library-attach' &&
        attachedMediaAsset.transform.variants.length === 2 &&
        attachedMediaAsset.transform.variants[0].media?.[0]?.path === savedMediaAsset.url,
      'media library should attach assets to platform variants'
    );
    const importedMediaAssets = await mediaAssets.importAssets(orgId, [
      savedMediaAsset,
    ]);
    assert(
      importedMediaAssets.imported === 1,
      'media library should import stored assets'
    );
    const malformedMediaAsset = await mediaAssets
      .save(orgId, { title: 'missing url' })
      .then(() => false)
      .catch(() => true);
    assert(malformedMediaAsset, 'media library should reject malformed assets');

    const creativeBriefPreview = creativeBriefs.preview({
      title: 'AI 콘텐츠 운영 디자인 브리프',
      sourceText:
        '원문 하나를 카드뉴스, 숏폼 커버, 링크드인 이미지로 재사용하는 캠페인입니다.',
      mediaType: 'video',
      aspectRatio: 'story',
      targetPlatforms: ['instagram', 'youtube'],
      cta: '댓글로 파일럿이라고 남겨주세요.',
    });
    assert(
      creativeBriefPreview.source === 'snaps-creative-brief' &&
        creativeBriefPreview.items.length === 3 &&
        creativeBriefPreview.items[0].storyboard.length >= 3,
      'creative briefs should generate design handoff items and storyboards'
    );
    const creativeBriefMediaInput = creativeBriefs.toMediaAssetInput(
      creativeBriefPreview,
      { itemId: creativeBriefPreview.items[0].id }
    );
    assert(
      String(creativeBriefMediaInput.url).startsWith('data:image/svg+xml') &&
        creativeBriefMediaInput.source === 'snaps-creative-brief',
      'creative briefs should prepare media-library inputs'
    );

    const approval = await approvals.submit(orgId, {
      title: 'Approval service smoke',
      reviewer: 'client@example.com',
      variants: [
        {
          platform: 'threads',
          label: 'Threads',
          content: '승인 워크플로우 서비스 스모크 콘텐츠입니다.',
          hashtags: ['#snaps'],
          settings: {},
          publishMode: 'schedule',
        },
      ],
      note: 'client approval',
    });
    assert(
      approval.status === 'pending' && approval.variants.length === 1,
      'approval workflow should submit pending variant requests'
    );
    const publicApprovalLink = await approvals.createPublicReviewLink(
      orgId,
      approval.id,
      {
        reviewer: 'client@example.com',
        note: 'share externally',
        expiresInDays: 14,
        allowDecision: true,
      }
    );
    const publicApprovalReview = await approvals.publicReview(
      orgId,
      publicApprovalLink.token
    );
    assert(
      publicApprovalLink.source === 'snaps-approval-public-link' &&
        publicApprovalLink.publicReviewUrl.includes('/snaps/review/') &&
        publicApprovalReview.source === 'snaps-public-approval-review' &&
        publicApprovalReview.approvalId === approval.id,
      'approval workflow should create public client review links'
    );
    const publicApprovalComment = await approvals.addPublicReviewComment(
      orgId,
      publicApprovalLink.token,
      {
        actor: 'client@example.com',
        message: '공개 리뷰 링크에서 남긴 피드백입니다.',
        selection: '공개 CTA',
      }
    );
    assert(
      publicApprovalComment.source === 'snaps-public-approval-comment' &&
        publicApprovalComment.review.comments.length === 1,
      'approval workflow should accept public review comments'
    );
    const publicApprovalDecision = await approvals.publicReviewDecision(
      orgId,
      publicApprovalLink.token,
      {
        decision: 'request-changes',
        reviewer: 'client@example.com',
        note: 'public changes requested',
      }
    );
    assert(
      publicApprovalDecision.review.status === 'changes-requested',
      'approval workflow should accept public approval decisions when enabled'
    );
    const approvalComment = await approvals.addComment(orgId, approval.id, {
      actor: 'client@example.com',
      message: 'CTA를 더 구체적으로 바꾸면 좋겠습니다.',
      visibility: 'reviewer',
      variantPlatform: 'threads',
      variantIndex: 0,
      selection: 'CTA',
    });
    assert(
      approvalComment.approval.comments.length >= 2 &&
        approvalComment.comment.resolved === false,
      'approval workflow should store draft comments'
    );
    const resolvedApprovalComment = await approvals.resolveComment(
      orgId,
      approval.id,
      approvalComment.comment.id,
      {
        actor: 'snaps operator',
        resolved: true,
      }
    );
    assert(
      resolvedApprovalComment.comment.resolved === true &&
        resolvedApprovalComment.approval.comments[0].resolved === true,
      'approval workflow should resolve draft comments'
    );
    const rejectedApprovalComment = await approvals
      .addComment(orgId, approval.id, {
        message: { invalid: true },
      })
      .then(() => false)
      .catch(() => true);
    assert(
      rejectedApprovalComment,
      'approval workflow should reject malformed comment messages'
    );
    const approved = await approvals.review(orgId, approval.id, {
      decision: 'approve',
      reviewer: 'client@example.com',
      note: 'approved',
    });
    assert(
      approved.status === 'approved' && approved.history[0].action === 'approve',
      'approval workflow should approve requests with history'
    );
    const scheduledApproval = await approvals.markScheduled(orgId, approval.id, {
      note: 'draft created',
    });
    assert(
      scheduledApproval.status === 'scheduled',
      'approval workflow should mark approved requests as scheduled'
    );
    const importedApprovals = await approvals.importApprovals(orgId, [
      scheduledApproval,
    ]);
    assert(
      importedApprovals.imported === 1,
      'approval workflow should import stored approval requests'
    );
    const importedApprovalList = await approvals.list(orgId);
    assert(
      importedApprovalList.some(
        (item) =>
          item.id === scheduledApproval.id &&
          item.comments.some((comment) => comment.resolved)
      ),
      'approval workflow should preserve resolved comments during import'
    );

    const scorecard = viralCoach.score({
      platform: 'instagram',
      title: 'AI 콘텐츠 운영 체크리스트',
      content:
        '콘텐츠 만드는 사람이 가장 많이 놓치는 첫 3초 훅을 고치는 방법입니다. 문제를 먼저 보여주고 저장할 만한 체크리스트로 정리하세요. 댓글로 다음 주제를 알려주세요.',
      visualDescription:
        '첫 화면에 큰 자막, 체크리스트 카드, 문제 장면이 순서대로 보입니다.',
      hashtags: ['#콘텐츠', '#마케팅', '#릴스'],
      durationSeconds: 30,
    });
    assert(
      scorecard.source === 'snaps-viral-ai-coach' &&
        scorecard.categories.length === 6 &&
        scorecard.suggestedHooks.length === 10 &&
        scorecard.hashtagPlan.final.length <= scorecard.hashtagPlan.limit,
      'viral coach should score drafts and return hooks plus hashtag plan'
    );

    const variationLab = postVariations.preview({
      sourceText:
        '하나의 성과 좋은 게시물을 여러 훅과 CTA로 바꿔 테스트합니다.\n숫자 증거, 체크리스트, 댓글 질문을 나눠서 어떤 메시지가 저장과 리드를 만드는지 확인합니다.',
      title: 'Smoke post variation lab',
      topic: '콘텐츠 실험',
      audience: 'B2B 마케터',
      cta: '댓글로 실험이라고 남기면 샘플 훅을 보내드립니다.',
      targetPlatforms: ['threads', 'instagram', 'linkedin'],
      variantCount: 5,
      goal: 'leads',
      competitorHook: '손작업 콘텐츠를 줄이세요',
      tags: ['experiment', 'runtime'],
    });
    const variationSources = postVariations.toSourceInputs(variationLab.items);
    const variationVariants = postVariations.toVariants(variationLab.items);
    assert(
      variationLab.source === 'snaps-post-variation-lab' &&
        variationLab.totalVariants === 5 &&
        !!variationLab.winningVariantId &&
        variationLab.items[0].status === 'winner' &&
        variationSources[0].sourcePlatform === 'post-variation-lab' &&
        variationVariants.some((variant) => variant.settings.source === 'snaps-post-variation-lab'),
      'post variation lab should rank hooks and convert ready winners to sources and variants'
    );

    const articlePreview = await sourceResolver.preview({
      url: 'https://example.com/article',
      htmlText:
        '<html><head><title>Resolved Article</title><meta name="description" content="A source resolver smoke article" /></head><body><article><h1>Resolved Article</h1><p>Source resolver extracts article body text from public pages and turns it into reusable social source material.</p><p>Teams can remix this page into posts, carousels, approvals, and reports without manually copying every paragraph.</p></article></body></html>',
      customInstructions: 'Turn this into Korean B2B social posts.',
      tags: ['resolver', 'article'],
    });
    assert(
      articlePreview.source === 'snaps-source-resolver' &&
        articlePreview.sourceType === 'article' &&
        articlePreview.sourceInput.sourceText.includes('Source resolver extracts article body text'),
      'source resolver should extract article HTML into source input'
    );
    const researchPreview = await sourceResolver.preview({
      sourceType: 'research',
      query: 'AI 콘텐츠 자동화',
    });
    assert(
      researchPreview.sourceType === 'research' &&
        researchPreview.sourceInput.sourcePlatform === 'ai-research',
      'source resolver should build deterministic research source briefs'
    );

    const calendarPreview = contentCalendar.preview({
      sourceText:
        'AI 콘텐츠 운영 14일 캠페인은 하나의 원문을 플랫폼별 게시물, 쇼츠, 카드뉴스로 재사용합니다.',
      campaign: 'Smoke content calendar',
      audience: 'B2B 콘텐츠 마케터',
      cadence: 'weekdays',
      days: 7,
      postsPerDay: 1,
      targetPlatforms: ['threads', 'instagram', 'linkedin'],
      contentPillars: '교육,문제 인식,사례',
      goals: 'reach,save,lead',
      formats: 'text,carousel,short-video',
      startDate: '2026-06-01T09:00:00+09:00',
    });
    assert(
      calendarPreview.source === 'snaps-content-calendar' &&
        calendarPreview.acceptedItems >= 5 &&
        calendarPreview.items.some((item) => item.format === 'short-video'),
      'content calendar should build dated multi-platform campaign slots'
    );
    const calendarSources = contentCalendar.toSourceInputs(calendarPreview.items);
    const calendarVariants = contentCalendar.toVariants(calendarPreview.items[0]);
    assert(
      calendarSources[0].sourcePlatform === 'content-calendar' &&
        calendarVariants[0].settings.source === 'snaps-content-calendar',
      'content calendar slots should convert to source imports and schedulable variants'
    );

    const categoryPreview = contentCategories.preview({
      sourceText:
        'SocialBee식 콘텐츠 카테고리 큐는 교육, 사례, 프로모션 버킷을 일정 순서로 반복합니다.',
      campaign: 'Smoke category queue',
      categories:
        '교육|evergreen|#12b8b8|저장형 튜토리얼|2\n사례|share-once|#f6c85f|고객 전후 비교|1\n프로모션|share-once|#ef6f6c|상담 CTA|1',
      categorySequence: '교육,교육,사례,프로모션',
      days: 7,
      postsPerDay: 1,
      targetPlatforms: ['threads', 'instagram'],
      startDate: '2026-06-01T09:00:00+09:00',
      linkUrl: 'https://example.com/offer',
    });
    assert(
      categoryPreview.source === 'snaps-content-categories' &&
        categoryPreview.acceptedItems >= 7 &&
        categoryPreview.categoryMix.some((category) => category.name === '교육'),
      'content categories should build weighted category-based queues'
    );
    const categorySources = contentCategories.toSourceInputs(categoryPreview.items);
    const categoryVariants = contentCategories.toVariants(categoryPreview.items[0]);
    assert(
      categorySources[0].sourcePlatform === 'content-categories' &&
        categoryVariants[0].settings.source === 'snaps-content-categories' &&
        categoryVariants[0].content.includes('utm_campaign='),
      'content categories should convert queue items to source imports and schedulable variants'
    );

    const conditionPreview = postConditions.preview({
      parentTitle: 'Smoke parent post',
      parentPlatform: 'instagram',
      parentPublishedAt: '2026-06-01T09:00:00+09:00',
      followUpText:
        '조건이 충족된 상위 게시물에 자료 링크와 상담 CTA를 후속 댓글로 붙입니다.',
      conditionType: 'engagement-rate',
      threshold: 3.5,
      metrics: {
        likes: 120,
        comments: 18,
        impressions: 4200,
        engagementRate: 4.2,
      },
      baseline: {
        averageImpressions: 3000,
        averageEngagementRate: 3.1,
      },
      targetPlatforms: ['instagram', 'threads'],
      tags: ['condition', 'runtime'],
    });
    assert(
      conditionPreview.source === 'snaps-post-condition' &&
        conditionPreview.triggerMet === true &&
        conditionPreview.status === 'ready',
      'post conditions should evaluate engagement triggers'
    );
    const conditionSource = postConditions.toSourceInput(conditionPreview.item);
    const conditionVariants = postConditions.toVariants(conditionPreview.item);
    assert(
      conditionSource.sourcePlatform === 'post-condition' &&
        conditionVariants.some((variant) => variant.platform === 'threads'),
      'post conditions should convert triggered follow-ups to source input and variants'
    );
    const waitingCondition = postConditions.preview({
      followUpText: '아직 조건이 충족되지 않은 후속 포스트입니다.',
      conditionType: 'comments',
      threshold: 10,
      metrics: { comments: 2 },
      targetPlatforms: ['threads'],
    });
    assert(
      waitingCondition.status === 'waiting' &&
        postConditions.toVariants(waitingCondition.item).length === 0,
      'post conditions should not queue waiting follow-ups'
    );

    const bulkFuturePublishDate = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    const bulkPreview = bulk.preview({
      csvText:
        'title,topic,caption,platforms,publishDate,linkUrl,tags\n' +
        `Bulk row,CSV campaign,"캠페인 CSV 행을 한번에 검증합니다.","instagram|threads",${bulkFuturePublishDate},https://example.com/bulk,"csv|bulk"`,
      defaultTone: '간결한 한국어',
    });
    assert(
      bulkPreview.acceptedRows === 1 &&
        bulkPreview.readyToSchedule === 1 &&
        bulkPreview.rows[0].platforms.includes('instagram'),
      'bulk CSV preview should parse platform and schedule rows'
    );
    const bulkSources = bulk.toSourceInputs(bulkPreview.rows);
    const bulkVariants = bulk.toVariants(bulkPreview.rows[0]);
    assert(
      bulkSources[0].sourcePlatform === 'bulk-csv' &&
        bulkVariants.some((variant) => variant.platform === 'threads'),
      'bulk CSV rows should convert to source imports and schedulable variants'
    );

    const feedPreview = await feeds.preview({
      feedXml:
        '<rss><channel><item><title>Feed row</title><link>https://example.com/feed</link><description>RSS 피드 항목을 콘텐츠 큐로 검증합니다.</description><category>rss</category></item></channel></rss>',
      defaultPlatforms: ['instagram', 'threads'],
      defaultTone: '간결한 한국어',
    });
    assert(
      feedPreview.acceptedItems === 1 &&
        feedPreview.readyToSchedule === 1 &&
        feedPreview.items[0].platforms.includes('instagram'),
      'RSS feed preview should parse items and selected platforms'
    );
    const feedSources = feeds.toSourceInputs(feedPreview.items);
    const feedVariants = feeds.toVariants(feedPreview.items[0]);
    assert(
      feedSources[0].sourcePlatform === 'rss-feed' &&
        feedVariants.some((variant) => variant.platform === 'threads'),
      'RSS feed items should convert to source imports and schedulable variants'
    );

    const carouselPreview = carouselVisuals.preview({
      sourceText:
        'AI 콘텐츠 운영 체크리스트\n원문을 플랫폼별 문법으로 재작성합니다.\n저장할 만한 인사이트를 카드뉴스로 쪼갭니다.\n마지막 장에는 상담 CTA를 둡니다.',
      title: 'Smoke carousel',
      topic: 'visual smoke',
      targetPlatforms: ['instagram', 'linkedin'],
      template: 'report',
      aspectRatio: 'portrait',
      slideCount: 5,
    });
    assert(
      carouselPreview.slideCount >= 3 &&
        carouselPreview.media.length === carouselPreview.slideCount &&
        carouselPreview.exportHtml.includes('Smoke carousel'),
      'carousel visual preview should build slide media and export HTML'
    );
    const carouselVariants = carouselVisuals.toVariants(carouselPreview, [
      'instagram',
      'linkedin',
    ]);
    assert(
      carouselVariants.length === 2 &&
        carouselVariants.every((variant) => variant.media?.length === carouselPreview.slideCount),
      'carousel visual preview should convert to media-bearing platform variants'
    );
    const visualPlannerPreview = visualFeedPlanner.preview({
      platform: 'instagram',
      viewMode: 'vertical',
      items: [
        {
          title: 'Launch cover',
          imageUrl: 'https://example.com/launch-cover.png',
          status: 'scheduled',
          caption: '런칭 커버가 피드 첫 줄에서 자연스러운지 확인합니다.',
          mediaType: 'image',
        },
        {
          title: 'Reels cover',
          imageUrl: 'https://example.com/reels-cover.png',
          status: 'draft',
          caption: '릴스 커버를 두 번째 칸에 배치합니다.',
          mediaType: 'video',
        },
      ],
    });
    const visualPlannerVariants = visualFeedPlanner.toVariants(
      visualPlannerPreview,
      ['instagram']
    );
    assert(
      visualPlannerPreview.source === 'snaps-visual-feed-planner' &&
        visualPlannerPreview.columns === 3 &&
        visualPlannerPreview.items[0].row === 1 &&
        visualPlannerPreview.recommendations.length >= 1 &&
        visualPlannerVariants.length === 2 &&
        visualPlannerVariants[0].settings.source === 'snaps-visual-feed-planner',
      'visual feed planner should preview grid cells and convert them to variants'
    );
    const firstCommentPreview = firstComments.preview({
      sourceText:
        '첫 댓글에는 해시태그와 자료 링크를 분리해 캡션을 가볍게 유지합니다. https://example.com/guide',
      topic: 'first comment smoke',
      globalComment: '#snaps #firstcomment\n\n댓글로 파일럿이라고 남기면 자료를 보내드립니다.',
      strategy: 'hashtags',
      variants: [
        {
          platform: 'instagram',
          label: 'Instagram',
          title: 'First comment smoke',
          content: '본문은 간결하게 유지합니다.',
          hashtags: ['#snaps', '#firstcomment'],
          settings: { __type: 'instagram', post_type: 'post' },
          publishMode: 'schedule',
        },
      ],
    });
    const firstCommentVariants = firstComments.toVariants(firstCommentPreview);
    const firstCommentPayload = buildSnapsPublishingPayload({
      variants: firstCommentVariants,
      integrations: [{ platform: 'instagram', integrationId: 'ig-first-comment' }],
      scheduleType: 'draft',
    });
    assert(
      firstCommentPreview.source === 'snaps-first-comment-planner' &&
        firstCommentPreview.supportedItems === 1 &&
        firstCommentVariants[0].settings.firstComment &&
        firstCommentPayload.payload?.posts[0]?.value.length === 2,
      'first comment planner should attach a first comment to the publishing value chain'
    );
    const hashtagSetPreview = hashtagSets.preview({
      title: 'Smoke hashtag group',
      topic: 'hashtag smoke',
      hashtagText: '#snaps #firstcomment #콘텐츠운영 #마케팅자동화 #파일럿 #초과태그',
      reusableText: '자료가 필요하면 댓글로 파일럿이라고 남겨주세요.',
      placement: 'first-comment',
      strategy: 'campaign',
      targetPlatforms: ['instagram', 'linkedin'],
      variants: firstCommentVariants,
    });
    assert(
      hashtagSetPreview.source === 'snaps-hashtag-set' &&
        hashtagSetPreview.hashtags.length >= 5 &&
        hashtagSetPreview.platformPlans.some((plan) => plan.overLimit > 0),
      'hashtag set manager should preview stored hashtag groups with platform limits'
    );
    const savedHashtagSet = await hashtagSets.save(orgId, hashtagSetPreview);
    const appliedHashtagSet = await hashtagSets.apply(orgId, savedHashtagSet.id, {
      variants: firstCommentVariants,
      placement: 'first-comment',
    });
    const hashtagSetPayload = buildSnapsPublishingPayload({
      variants: appliedHashtagSet.transform.variants,
      integrations: [{ platform: 'instagram', integrationId: 'ig-hashtag-set' }],
      scheduleType: 'draft',
    });
    assert(
      appliedHashtagSet.source === 'snaps-hashtag-set-application' &&
        appliedHashtagSet.transform.variants[0].settings.hashtagSetId ===
          savedHashtagSet.id &&
        String(appliedHashtagSet.transform.variants[0].settings.firstComment).includes('#snaps') &&
        hashtagSetPayload.payload?.posts[0]?.value.length === 2,
      'hashtag set manager should apply saved groups to captions or first comments'
    );
    const importedHashtagSets = await hashtagSets.importSets(orgId, [
      savedHashtagSet,
    ]);
    assert(
      importedHashtagSets.imported === 1,
      'hashtag set manager should import stored sets'
    );
    const malformedHashtagSet = await hashtagSets
      .save(orgId, { tags: ['missing real hashtag signal'] })
      .then(() => false)
      .catch(() => true);
    assert(malformedHashtagSet, 'hashtag set manager should reject malformed saves');

    const hashtagTrackerPreview = hashtagTracker.preview({
      title: 'Smoke hashtag tracker',
      topic: 'hashtag smoke',
      goal: 'engagement',
      hashtagText: '#snaps #firstcomment #콘텐츠운영 #마케팅자동화',
      targetPlatforms: ['instagram', 'x'],
      variants: firstCommentVariants,
      importText:
        'hashtag,platform,posts,impressions,engagements,comments,saves,clicks\n' +
        '#snaps,instagram,7,11200,740,44,116,51\n' +
        '#firstcomment,instagram,4,6800,288,30,42,18\n' +
        '#마케팅자동화,x,11,17400,540,39,21,72',
    });
    const trackedSetInput = hashtagTracker.toHashtagSetInput(hashtagTrackerPreview, {
      setTitle: 'Tracked smoke hashtags',
    });
    assert(
      hashtagTrackerPreview.source === 'snaps-hashtag-tracker' &&
        hashtagTrackerPreview.trackedHashtags >= 3 &&
        hashtagTrackerPreview.items[0].action === 'keep' &&
        Array.isArray(trackedSetInput.hashtags) &&
        trackedSetInput.hashtags.length >= 2,
      'hashtag tracker should score metrics and produce a reusable hashtag set input'
    );

    const listeningPreview = socialListening.preview({
      title: 'Smoke listening monitor',
      query: 'snaps OR #콘텐츠자동화',
      keywords: ['snaps', '#콘텐츠자동화', '가격', '데모', 'Buffer', '비교'],
      excludeKeywords: ['카지노'],
      targetPlatforms: ['instagram', 'threads', 'x'],
      importText: [
        'platform,author,content,postId,engagement',
        'instagram,@lead,"snaps 가격표와 데모 링크 받을 수 있나요? #콘텐츠자동화",ig-1,24',
        'threads,@ops,"Buffer랑 비교하면 댓글 응대까지 되나요?",th-2,7',
        'x,@spam,"카지노 무료머니 snaps",x-3,2',
      ].join('\n'),
      campaign: 'smoke listening',
    });
    assert(
      listeningPreview.source === 'snaps-social-listening' &&
        listeningPreview.matchedItems >= 2 &&
        listeningPreview.highIntentItems >= 1 &&
        listeningPreview.noiseItems >= 1 &&
        listeningPreview.signals.some((signal) => signal.id === 'pricing') &&
        listeningPreview.clusters.some((cluster) => cluster.id === 'lead'),
      'social listening should classify keyword matches, noise, signals, and clusters'
    );
    const savedListeningMonitor = await socialListening.save(orgId, {
      ...listeningPreview,
      tags: ['listening', 'smoke'],
      importText:
        'platform,author,content,postId,engagement\ninstagram,@lead,"snaps 가격표와 데모 링크 받을 수 있나요?",ig-1,24',
    });
    const listeningRun = await socialListening.run(orgId, savedListeningMonitor.id, {
      importText:
        'platform,author,content,postId,engagement\ninstagram,@lead,"snaps 데모와 가격이 궁금합니다",ig-4,31',
    });
    const listeningInboxImport = socialListening.toInboxImport(listeningRun.preview);
    assert(
      listeningRun.preview.highIntentItems === 1 &&
        listeningInboxImport.items.length === 1 &&
        listeningInboxImport.items[0].platform === 'instagram',
      'social listening should run saved monitors and promote high-intent mentions to inbox input'
    );
    const importedListeningMonitors = await socialListening.importMonitors(orgId, [
      savedListeningMonitor,
    ]);
    assert(
      importedListeningMonitors.imported === 1,
      'social listening should import stored monitors'
    );
    const malformedListeningMonitor = await socialListening
      .save(orgId, { tags: ['missing real listening signal'] })
      .then(() => false)
      .catch(() => true);
    assert(
      malformedListeningMonitor,
      'social listening should reject malformed monitor saves'
    );

    const trendPreview = trendRadar.preview({
      title: 'Smoke trend radar',
      industry: 'B2B 콘텐츠 자동화',
      region: 'KR',
      windowDays: 7,
      targetPlatforms: ['instagram', 'threads', 'linkedin'],
      keywords: ['#콘텐츠자동화', '가격 문의', '예약 발행'],
      importText: [
        'topic,platform,volume,previousVolume,engagement,sentiment,competitor,format,content,source',
        '#콘텐츠자동화,instagram,46,18,930,positive,Rival Studio,reels,"3초 안에 수작업 문제를 보여준 릴스",competitor',
        '가격 문의 자동응대,threads,22,8,210,mixed,,thread,"가격표와 데모 링크를 요청하는 댓글이 늘어남",listening',
        '예약 발행 오류 알림,x,18,5,160,negative,,post,"오류가 있으면 바로 알려줘야 한다는 불만 리스크",listening',
      ].join('\n'),
      listeningPreview,
      hashtagTrackerPreview,
    });
    const trendSources = trendRadar.toSourceInputs(trendPreview);
    assert(
      trendPreview.source === 'snaps-trend-radar' &&
        trendPreview.totalTrends >= 3 &&
        trendPreview.alerts.some((alert) => alert.severity === 'high') &&
        trendPreview.trends.some((trend) => trend.competitorLead === 'Rival Studio') &&
        trendSources.length === trendPreview.contentIdeas.length &&
        trendSources[0].sourcePlatform === 'trend-radar',
      'trend radar should merge listening, competitor, hashtag signals into alerts and source ideas'
    );

    const postPreview = postPreviews.preview({
      content:
        '가격 문의가 많은 B2B 콘텐츠 운영팀을 위해 첫 줄 훅과 링크 카드, 이미지 alt text를 게시 전에 확인합니다. '.repeat(
          4
        ) + 'https://example.com/service-smoke #snaps',
      targetPlatforms: ['instagram', 'linkedin', 'x'],
      device: 'desktop',
      linkUrl: 'https://example.com/service-smoke',
      linkTitle: 'Service smoke link preview',
      linkDescription: 'Post preview smoke covers platform feed cuts.',
      linkImage: 'https://example.com/preview.png',
      media: [{ path: 'https://example.com/preview.png' }],
      imageDescription: 'Generated platform preview cards',
    });
    assert(
      postPreview.source === 'snaps-post-preview-inspector' &&
        postPreview.cards.length >= 3 &&
        postPreview.cards.some((card) => card.hiddenCharacters >= 0) &&
        postPreview.cards.some((card) => card.mediaPreview.altTextSuggestion) &&
        postPreview.averageAccessibilityScore > 0,
      'post preview inspector should score feed cuts, link previews, and alt text'
    );
    const adDisclosure = adDisclosureGuard.check({
      relationship: 'affiliate',
      variants: [
        { platform: 'threads', content: '제휴 링크로 산 키보드 후기입니다.\n#키보드 #데스크셋업' },
        { platform: 'linkedin', content: '[광고] 제휴 링크, 구매 시 수수료를 받습니다\n키보드 후기' },
      ],
    });
    assert(
      adDisclosure.status === 'block' &&
        adDisclosure.cards[0].findings.some((item) => item.rule === 'disclosure-missing') &&
        adDisclosure.cards[0].fixedContent.startsWith('[광고] 제휴 마케팅 활동의 일환으로') &&
        adDisclosure.cards[1].status === 'pass',
      'ad disclosure guard should block undisclosed affiliate posts and pass disclosed ones'
    );

    const recyclePreview = recycler.preview({
      sourceText:
        '성과가 좋았던 체크리스트를 재활용합니다.\n문제 인식형으로 다시 보여줍니다.\n실행 순서형으로 다시 정리합니다.\n성과 근거를 붙여 신뢰도를 높입니다.',
      title: 'Smoke evergreen',
      topic: 'evergreen smoke',
      category: 'education',
      cadence: 'biweekly',
      repeatCount: 4,
      targetPlatforms: ['instagram', 'threads'],
      performanceNote: '저장률이 높은 게시물',
    });
    assert(
      recyclePreview.acceptedItems === 4 &&
        recyclePreview.items[0].cadence === 'biweekly' &&
        recyclePreview.items[0].angle,
      'evergreen recycle preview should build recurring angle items'
    );
    const recycleSources = recycler.toSourceInputs(recyclePreview.items);
    const recycleVariants = recycler.toVariants(recyclePreview.items[0]);
    assert(
      recycleSources[0].sourcePlatform === 'evergreen-recycle' &&
        recycleVariants.some((variant) => variant.platform === 'threads'),
      'evergreen recycle items should convert to source imports and schedulable variants'
    );

    const recurringPreview = recurringPosts.preview({
      sourceText:
        '2주 파일럿 모집 반복 게시\n같은 제안을 매주 다른 각도로 보여줍니다.\n댓글과 상담 CTA를 유지하고 날짜별 큐를 만듭니다.',
      title: 'Smoke recurring',
      topic: 'recurring smoke',
      cadence: 'weekly',
      repeatCount: 4,
      localTime: '10:30',
      targetPlatforms: ['instagram', 'threads'],
      cta: '댓글로 파일럿이라고 남겨주세요.',
    });
    assert(
      recurringPreview.source === 'snaps-recurring-posts' &&
        recurringPreview.acceptedItems === 4 &&
        recurringPreview.items[0].publishDate &&
        recurringPreview.items[0].variation,
      'recurring post preview should build dated recurring items'
    );
    const recurringSources = recurringPosts.toSourceInputs(recurringPreview.items);
    const recurringVariants = recurringPosts.toVariants(recurringPreview.items[0]);
    assert(
      recurringSources[0].sourcePlatform === 'recurring-posts' &&
        recurringVariants.some((variant) => variant.platform === 'threads'),
      'recurring post items should convert to source imports and schedulable variants'
    );

    const repurposePreview = repurposeQueue.preview({
      sourceText: repurposeQueue.sampleSource,
      sourcePlatform: 'youtube',
      workflowMode: 'schedule',
      contentFilter: 'all-content',
      targetPlatforms: ['threads', 'linkedin'],
      scheduleSlots:
        'Authority|monday|09:00|10:00\nCommunity|wednesday|15:00|16:00',
      now: '2026-06-01T09:00:00+09:00',
      activatedAt: '2026-06-01T09:00:00+09:00',
      dedupeExisting: true,
    });
    assert(
      repurposePreview.source === 'snaps-repurpose-queue' &&
        repurposePreview.acceptedItems >= 3 &&
        repurposePreview.scheduleSlots.length === 2 &&
        repurposePreview.items.some((item) => item.contentScope === 'existing') &&
        repurposePreview.recommendations.some((item) => item.includes('Check Now')),
      'repurpose queue should map source items into posting-plan slots'
    );
    const repurposeSources = repurposeQueue.toSourceInputs(repurposePreview.items);
    const repurposeVariants = repurposeQueue.toVariants(repurposePreview.items[0]);
    assert(
      repurposeSources[0].sourcePlatform === 'repurpose-queue' &&
        repurposeVariants.some((variant) => variant.platform === 'threads') &&
        repurposeVariants[0].settings?.source === 'snaps-repurpose-queue',
      'repurpose queue items should convert to source imports and schedulable variants'
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
    const expandedPlatformTransform = await transformer.transform(orgId, {
      sourceText: '고객 전환 신호를 바탕으로 커뮤니티, 페이지, 핀 채널용 게시물을 준비합니다.',
      targetPlatforms: ['bluesky', 'facebook', 'pinterest'],
      useRag: false,
    });
    const expandedPlatforms = expandedPlatformTransform.variants.map(
      (variant) => variant.platform
    );
    assert(
      expandedPlatforms.includes('bluesky') &&
        expandedPlatforms.includes('facebook') &&
        expandedPlatforms.includes('pinterest'),
      'expanded Blotato-style platforms should produce variants'
    );
    const expandedBluesky = expandedPlatformTransform.variants.find(
      (variant) => variant.platform === 'bluesky'
    );
    assert(
      !!expandedBluesky && expandedBluesky.content.length <= 300,
      'Bluesky fallback should respect the post length budget'
    );
    assert(
      (expandedPlatformTransform.variants.find(
        (variant) => variant.platform === 'pinterest'
      )?.settings as Record<string, unknown>)?.__type === 'pinterest',
      'Pinterest fallback should carry provider settings'
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
        malformedThreads.hashtags.join(' ') === '#threads',
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
      publishDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
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
    assert(
      imported.items.every((item) => item.status === 'unread' && !item.readAt),
      'feedback inbox should default imported items to unread'
    );
    const unreadFeedback = await inbox.listItems(orgId, {
      status: 'unread',
      search: '기능',
    });
    assert(
      unreadFeedback.some((item) => item.id === imported.items[0].id),
      'feedback inbox should filter unread items by search'
    );
    const markedUnresolved = await inbox.updateItemStatus(orgId, imported.items[0].id, {
      status: 'unresolved',
    });
    assert(
      markedUnresolved.updated &&
        markedUnresolved.item?.status === 'unresolved' &&
        !!markedUnresolved.item.readAt &&
        !markedUnresolved.item.resolvedAt,
      'feedback inbox should mark unread items as read and unresolved'
    );
    const unresolvedFeedback = await inbox.listItems(orgId, {
      status: 'unresolved',
      search: '기능',
    });
    assert(
      unresolvedFeedback.some((item) => item.id === imported.items[0].id),
      'feedback inbox should filter unresolved items by search'
    );
    const markedResolved = await inbox.updateItemStatus(orgId, imported.items[0].id, {
      status: 'resolved',
    });
    assert(
      markedResolved.updated &&
        markedResolved.item?.status === 'resolved' &&
        !!markedResolved.item.readAt &&
        !!markedResolved.item.resolvedAt,
      'feedback inbox should mark items as resolved'
    );
    const resolvedFeedback = await inbox.listItems(orgId, {
      status: 'resolved',
      search: '기능',
    });
    assert(
      resolvedFeedback.some((item) => item.id === imported.items[0].id),
      'feedback inbox should filter resolved items by search'
    );
    const rejectedFeedbackStatus = await inbox
      .updateItemStatus(orgId, imported.items[0].id, { status: 'waiting' })
      .then(() => false)
      .catch(() => true);
    assert(rejectedFeedbackStatus, 'feedback inbox should reject invalid statuses');
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
    const savedReplyTemplate = await inbox.saveReplyTemplate(orgId, {
      title: '질문 링크 안내',
      platform: 'instagram',
      sentiment: 'question',
      body: '문의 주셔서 감사합니다. 자료 링크를 바로 안내드릴게요.',
      cta: '필요하시면 DM으로 예시도 보내드리겠습니다.',
      tags: ['FAQ', '링크 요청'],
    });
    const listedReplyTemplates = await inbox.listReplyTemplates(orgId, {
      platform: 'instagram',
      sentiment: 'question',
    });
    assert(
      savedReplyTemplate.saved &&
        listedReplyTemplates.some(
          (template) =>
            template.id === savedReplyTemplate.template.id &&
            template.body.includes('자료 링크') &&
            template.tags.includes('FAQ')
        ),
      'feedback reply templates should save and filter by platform/sentiment'
    );
    const rejectedReplyTemplate = await inbox
      .saveReplyTemplate(orgId, { body: { invalid: true } })
      .then(() => false)
      .catch(() => true);
    assert(rejectedReplyTemplate, 'feedback reply template should reject malformed body');
    const importedReplyTemplates = await inbox.importReplyTemplates(orgId, [
      {
        id: {
          invalid: true,
        },
        platform: 'threads',
        sentiment: 'positive',
        body: '좋게 봐주셔서 감사합니다. 다음 편도 이어서 정리하겠습니다.',
        tags: ['칭찬'],
      },
      {
        platform: 'instagram',
        body: {
          invalid: true,
        },
      },
    ]);
    assert(
      importedReplyTemplates.imported === 1 &&
        (await inbox.listReplyTemplates(orgId)).some(
          (template) =>
            template.platform === 'threads' &&
            template.sentiment === 'praise' &&
            !JSON.stringify(template).includes('[object Object]')
        ),
      'feedback reply template import should normalize sentiment and reject malformed content'
    );
    const deletedReplyTemplate = await inbox.deleteReplyTemplate(
      orgId,
      savedReplyTemplate.template.id
    );
    assert(deletedReplyTemplate.deleted, 'feedback reply template delete failed');
    const savedInboxNote = await inbox.saveInboxNote(orgId, {
      platform: 'instagram',
      author: 'lead-a',
      postId: 'post-123',
      note: '가격 문의 리드입니다. 다음 답변에서 파일럿 CTA를 포함합니다.',
      tags: ['lead', 'pricing'],
    });
    const listedInboxNotes = await inbox.listInboxNotes(orgId, {
      platform: 'instagram',
      author: 'lead',
    });
    assert(
      savedInboxNote.saved &&
        listedInboxNotes.some(
          (note) =>
            note.id === savedInboxNote.note.id &&
            note.note.includes('파일럿') &&
            note.tags.includes('pricing')
        ),
      'feedback inbox notes should save and filter customer context'
    );
    const assignmentReplyTemplate = await inbox.saveReplyTemplate(orgId, {
      title: '배정 가격 질문 답변',
      platform: 'instagram',
      sentiment: 'question',
      body: '가격표와 구매 링크를 함께 안내드리겠습니다.',
      tags: ['assignment', 'pricing'],
    });
    await inbox.importItems(orgId, {
      items: [
        {
          platform: 'instagram',
          author: 'lead-a',
          postId: 'post-123',
          content: '가격은 얼마이고 구매 링크는 어디서 보나요?',
        },
      ],
    });
    const assignmentPreview = await inbox.previewAssignments(orgId, {
      status: 'unread',
      search: '가격',
      defaultSlaMinutes: 90,
    });
    assert(
      assignmentPreview.source === 'snaps-inbox-assignments' &&
        assignmentPreview.total >= 1 &&
        assignmentPreview.cases.some(
          (item) =>
            item.assigneeRole === 'sales' &&
            item.replyTemplateId === assignmentReplyTemplate.template.id &&
            item.noteMatches.some((note) => note.id === savedInboxNote.note.id)
        ),
      'feedback assignment preview should route sales cases with templates and customer notes'
    );
    const moderationPreview = await inbox.previewAssignments(orgId, {
      items: [
        {
          platform: 'threads',
          content: '카지노 광고 링크입니다 http://spam.example',
        },
      ],
    });
    assert(
      moderationPreview.cases[0]?.assigneeRole === 'moderation' &&
        moderationPreview.warnings.some((warning) => warning.includes('스팸')),
      'feedback assignment preview should flag spam for moderation'
    );
    const rejectedInboxNote = await inbox
      .saveInboxNote(orgId, { note: '대상 없는 메모' })
      .then(() => false)
      .catch(() => true);
    assert(rejectedInboxNote, 'feedback inbox note should require author or postId');
    const importedInboxNotes = await inbox.importInboxNotes(orgId, [
      {
        id: {
          invalid: true,
        },
        platform: 'threads',
        author: 'lead-b',
        note: '상담 신청 링크를 요청했습니다.',
        tags: ['상담'],
      },
      {
        platform: 'instagram',
        author: 'bad-note',
        note: {
          invalid: true,
        },
      },
    ]);
    assert(
      importedInboxNotes.imported === 1 &&
        (await inbox.listInboxNotes(orgId)).some(
          (note) =>
            note.platform === 'threads' &&
            note.author === 'lead-b' &&
            !JSON.stringify(note).includes('[object Object]')
        ),
      'feedback inbox note import should normalize customer notes and reject malformed content'
    );
    const deletedInboxNote = await inbox.deleteInboxNote(
      orgId,
      savedInboxNote.note.id
    );
    assert(deletedInboxNote.deleted, 'feedback inbox note delete failed');
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
    assert(
      script.storyboard.length >= 4 &&
        script.storyboard[script.storyboard.length - 1].endSecond === 45,
      'shorts fallback storyboard missing'
    );
    assert(script.uploadMetadata.hashtags.includes('#shorts'), 'shorts upload metadata missing');
    const voiceoverCaptionPreview = voiceoverCaptions.preview({
      sourceText: source.sourceText,
      script,
      durationSeconds: 45,
      platform: 'instagram',
      voiceStyle: 'energetic',
      captionStyle: 'karaoke',
    });
    assert(
      voiceoverCaptionPreview.source === 'snaps-video-voiceover-captions' &&
        voiceoverCaptionPreview.captions.length >= 3 &&
        voiceoverCaptionPreview.exports.srt.includes('-->') &&
        voiceoverCaptionPreview.sceneAlignments.length >= 3 &&
        voiceoverCaptionPreview.summary.alignmentScore > 0,
      'voiceover caption preview should produce caption cues, scene alignment, SRT export, and a score'
    );
    const videoPublishGuardPreview = videoPublishGuard.preview({
      durationSeconds: 45,
      targetPlatforms: ['instagram', 'youtube', 'tiktok'],
      sceneCount: script.storyboard.length,
      generatedImageCount: script.storyboard.length,
      generatedVideoCount: 0,
      customAssetCount: 1,
      textToImageModel: 'flux-schnell',
      imageToVideoModel: 'none',
      aiVoice: true,
      aiGeneratedVisuals: true,
      realisticPeople: true,
      targetLanguages: ['Korean', 'English', 'Japanese'],
      sourceLanguage: 'Korean',
      captionLanguage: 'Korean',
    });
    assert(
      videoPublishGuardPreview.source === 'snaps-video-publish-guard' &&
        videoPublishGuardPreview.creditBudget.totalCredits > 0 &&
        videoPublishGuardPreview.disclosureChecklist.some(
          (item) => item.platform === 'youtube' && item.labelRequired
        ) &&
        videoPublishGuardPreview.disclosureChecklist.some(
          (item) => item.platform === 'tiktok' && item.labelRequired
        ) &&
        videoPublishGuardPreview.disclosureChecklist.some(
          (item) => item.platform === 'instagram' && item.labelRequired
        ) &&
        videoPublishGuardPreview.localizationPlan.rows.length >= 2 &&
        videoPublishGuardPreview.publishReadinessScore > 0,
      'video publish guard should estimate credits, disclosures, localization, and readiness'
    );
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
    assert(
      decodeURIComponent(new URLSearchParams(capturedBody).get('subject') || '') === 'Smoke subject',
      'Naver Cafe subject missing'
    );
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
  const originalPixelleHostUrl = process.env.PIXELLE_VIDEO_HOST_URL;
  const seen = {
    generateUrl: '',
    generateBody: '',
    statusUrl: '',
    fallbackGenerateUrl: '',
  };

  try {
    process.env.PIXELLE_VIDEO_URL = 'https://pixelle.example.test/root/';
    delete process.env.PIXELLE_VIDEO_HOST_URL;
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

    process.env.PIXELLE_VIDEO_URL = 'http://snaps-pixelle-video:8000/';
    globalThis.fetch = (async (url: string | URL) => {
      const requestUrl = String(url);
      if (requestUrl.startsWith('http://snaps-pixelle-video:8000')) {
        throw new Error('simulated Docker DNS failure from host backend');
      }
      if (requestUrl === 'http://localhost:8000/generate') {
        seen.fallbackGenerateUrl = requestUrl;
        return new Response(JSON.stringify({ jobId: 'pixelle-fallback-job', status: 'queued' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'unexpected fallback pixelle path' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;
    const fallbackGenerated = await shorts.generate({
      sourceText,
      durationSeconds: 30,
      platform: 'tiktok',
    });
    assert(
      fallbackGenerated.jobId === 'pixelle-fallback-job',
      'Pixelle generate did not use localhost fallback for Docker service URL'
    );
    assert(
      seen.fallbackGenerateUrl === 'http://localhost:8000/generate',
      'Pixelle localhost fallback URL was not attempted'
    );

    process.env.PIXELLE_VIDEO_URL = 'https://pixelle.example.test/root/';
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
      failureMessage.includes('Pixelle request failed at https://pixelle.example.test/root: 502 Bad Gateway') &&
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
    if (typeof originalPixelleHostUrl === 'undefined') {
      delete process.env.PIXELLE_VIDEO_HOST_URL;
    } else {
      process.env.PIXELLE_VIDEO_HOST_URL = originalPixelleHostUrl;
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
