import path from 'path';
import { promises as fs } from 'fs';
import { SnapsActivityLogService } from '@gitroom/nestjs-libraries/snaps/activity/activity-log.service';
import { SnapsCommandPlannerService } from '@gitroom/nestjs-libraries/snaps/agent/command-planner.service';
import { SnapsReportGeneratorService } from '@gitroom/nestjs-libraries/snaps/analytics/report-generator.service';
import { SnapsApprovalWorkflowService } from '@gitroom/nestjs-libraries/snaps/approvals/approval-workflow.service';
import { SnapsBulkCampaignService } from '@gitroom/nestjs-libraries/snaps/bulk/bulk-campaign.service';
import { SnapsContentCalendarService } from '@gitroom/nestjs-libraries/snaps/calendar/content-calendar.service';
import { SnapsContentCategoryService } from '@gitroom/nestjs-libraries/snaps/categories/content-category.service';
import { SnapsViralCoachService } from '@gitroom/nestjs-libraries/snaps/coach/viral-coach.service';
import { SnapsCompetitorAnalyticsService } from '@gitroom/nestjs-libraries/snaps/competitors/competitor-analytics.service';
import { SnapsPostConditionService } from '@gitroom/nestjs-libraries/snaps/conditions/post-condition.service';
import { SnapsFeedIntakeService } from '@gitroom/nestjs-libraries/snaps/feeds/feed-intake.service';
import { SnapsContentIdeaService } from '@gitroom/nestjs-libraries/snaps/ideas/content-idea.service';
import { SnapsPostVariationService } from '@gitroom/nestjs-libraries/snaps/experiments/post-variation.service';
import { SnapsBrandKitService } from '@gitroom/nestjs-libraries/snaps/brand/brand-kit.service';
import { SnapsFeedbackInboxService } from '@gitroom/nestjs-libraries/snaps/inbox/feedback-inbox.service';
import { SnapsSourceLibraryService } from '@gitroom/nestjs-libraries/snaps/library/source-library.service';
import { SnapsMediaAssetService } from '@gitroom/nestjs-libraries/snaps/media/media-asset.service';
import { SnapsCreativeBriefService } from '@gitroom/nestjs-libraries/snaps/creative/creative-brief.service';
import { SnapsRagService } from '@gitroom/nestjs-libraries/snaps/rag/rag.service';
import { SnapsVectorStoreService } from '@gitroom/nestjs-libraries/snaps/rag/vector-store.service';
import { SnapsEvergreenRecycleService } from '@gitroom/nestjs-libraries/snaps/recycle/evergreen-recycle.service';
import { SnapsRecurringPostService } from '@gitroom/nestjs-libraries/snaps/recurring/recurring-post.service';
import { SnapsLinkAttributionService } from '@gitroom/nestjs-libraries/snaps/sales/link-attribution.service';
import { SnapsSourceResolverService } from '@gitroom/nestjs-libraries/snaps/source-resolver/source-resolver.service';
import { SnapsContentTransformService } from '@gitroom/nestjs-libraries/snaps/transform/content-transform.service';
import { SnapsCarouselVisualService } from '@gitroom/nestjs-libraries/snaps/visuals/carousel-visual.service';
import { SnapsVisualFeedPlannerService } from '@gitroom/nestjs-libraries/snaps/planner/visual-feed-planner.service';
import { SnapsFirstCommentService } from '@gitroom/nestjs-libraries/snaps/comments/first-comment.service';
import { SnapsHashtagSetService } from '@gitroom/nestjs-libraries/snaps/hashtags/hashtag-set.service';
import { SnapsHashtagTrackerService } from '@gitroom/nestjs-libraries/snaps/hashtags/hashtag-tracker.service';
import { SnapsSocialListeningService } from '@gitroom/nestjs-libraries/snaps/listening/social-listening.service';
import { SnapsTrendRadarService } from '@gitroom/nestjs-libraries/snaps/trends/trend-radar.service';
import { SnapsPostPreviewService } from '@gitroom/nestjs-libraries/snaps/previews/post-preview.service';
import { SnapsShortVideoService } from '@gitroom/nestjs-libraries/snaps/video/short-video.service';
import { SnapsVideoVoiceoverCaptionService } from '@gitroom/nestjs-libraries/snaps/video/voiceover-caption.service';
import { SnapsVideoPublishGuardService } from '@gitroom/nestjs-libraries/snaps/video/video-publish-guard.service';
import { SnapsRepurposeQueueService } from '@gitroom/nestjs-libraries/snaps/repurpose/repurpose-queue.service';

class ScenarioOllama {
  get model() {
    return 'offline-scenario-smoke';
  }

  async chatJson<T>(): Promise<T> {
    throw new Error('scenario smoke uses deterministic fallback');
  }

  async embed(input: string | string[]) {
    const values = Array.isArray(input) ? input : [input];
    return values.map((value) => this.embedding(value));
  }

  private embedding(value: string) {
    const vector = [0, 0, 0, 0, 0, 0];
    for (let index = 0; index < value.length; index += 1) {
      vector[index % vector.length] += value.charCodeAt(index) % 89;
    }
    return vector.map((entry) => entry / 1000);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const dataDir = path.join(process.cwd(), 'tmp', `snaps-scenario-${process.pid}`);
  process.env.SNAPS_DATA_DIR = dataDir;
  process.env.SNAPS_ALLOW_RULE_FALLBACK = 'true';
  delete process.env.PIXELLE_VIDEO_URL;

  try {
    const orgId = 'scenario-b2b-brand';
    const ollama = new ScenarioOllama() as any;
    const vectorStore = new SnapsVectorStoreService();
    const rag = new SnapsRagService(ollama, vectorStore);
    const transformer = new SnapsContentTransformService(ollama, rag);
    const shortVideo = new SnapsShortVideoService(ollama);
    const voiceoverCaptions = new SnapsVideoVoiceoverCaptionService();
    const videoPublishGuard = new SnapsVideoPublishGuardService();
    const agent = new SnapsCommandPlannerService(ollama, transformer, shortVideo);
    const sourceLibrary = new SnapsSourceLibraryService();
    const sourceResolver = new SnapsSourceResolverService();
    const contentCalendar = new SnapsContentCalendarService();
    const contentCategories = new SnapsContentCategoryService();
    const postConditions = new SnapsPostConditionService();
    const ideas = new SnapsContentIdeaService();
    const postVariations = new SnapsPostVariationService();
    const brandKits = new SnapsBrandKitService();
    const mediaAssets = new SnapsMediaAssetService();
    const creativeBriefs = new SnapsCreativeBriefService();
    const viralCoach = new SnapsViralCoachService();
    const approvals = new SnapsApprovalWorkflowService();
    const bulk = new SnapsBulkCampaignService();
    const feeds = new SnapsFeedIntakeService();
    const carousel = new SnapsCarouselVisualService();
    const visualFeedPlanner = new SnapsVisualFeedPlannerService();
    const firstComments = new SnapsFirstCommentService();
    const hashtagSets = new SnapsHashtagSetService();
    const hashtagTracker = new SnapsHashtagTrackerService();
    const socialListening = new SnapsSocialListeningService();
    const trendRadar = new SnapsTrendRadarService();
    const postPreviews = new SnapsPostPreviewService();
    const recycler = new SnapsEvergreenRecycleService();
    const recurringPosts = new SnapsRecurringPostService();
    const repurposeQueue = new SnapsRepurposeQueueService();
    const competitors = new SnapsCompetitorAnalyticsService();
    const sales = new SnapsLinkAttributionService();
    const reports = new SnapsReportGeneratorService(ollama);
    const inbox = new SnapsFeedbackInboxService(ollama);
    const activity = new SnapsActivityLogService();

    const weeklyMemo =
      '한국 B2B SaaS 팀은 고객 인터뷰와 제품 업데이트를 매주 한 번만 정리하지만, ' +
      '인스타그램, 스레드, 링크드인, 네이버 블로그, 카카오톡 공지까지 동시에 운영해야 합니다. ' +
      '이번 주 핵심 메시지는 콘텐츠 운영 시간을 줄이고 가격 문의 댓글을 영업 기회로 바꾸는 것입니다.';

    const resolved = await sourceResolver.preview({
      sourceType: 'article',
      url: 'https://example.com/weekly-market-memo',
      htmlText: `<article><h1>주간 시장 메모</h1><p>${weeklyMemo}</p><p>고객은 원문 하나로 카드뉴스, 짧은 글, 쇼츠 대본, 세일즈 답글까지 원합니다.</p></article>`,
      customInstructions: 'Korean B2B brand weekly campaign.',
      tags: ['scenario', 'weekly-memo'],
    });
    const importedSource = await sourceLibrary.importSources(orgId, [
      resolved.sourceInput,
    ]);
    assert(
      resolved.source === 'snaps-source-resolver' && importedSource.imported === 1,
      'scenario should resolve and import the weekly memo'
    );

    await rag.importExamples(orgId, [
      {
        platform: 'instagram',
        content: '첫 문장은 문제를 바로 보여주고, 마지막 줄은 저장/상담 CTA로 닫습니다.',
        topic: 'B2B content ops',
      },
      {
        platform: 'threads',
        content: '긴 설명 대신 짧은 실행 순서와 질문형 마무리로 대화를 엽니다.',
        topic: 'B2B content ops',
      },
    ]);
    const ragHits = await rag.search(orgId, '상담 CTA 저장', 'instagram', 2);
    assert(ragHits.length > 0, 'scenario should seed searchable RAG examples');

    const calendar = contentCalendar.preview({
      sourceText: weeklyMemo,
      campaign: 'Korean B2B weekly memo launch',
      audience: '5인 이하 B2B 브랜드 대표와 마케터',
      cadence: 'weekdays',
      days: 7,
      postsPerDay: 1,
      targetPlatforms: ['threads', 'instagram', 'linkedin', 'naver-blog'],
      contentPillars: '교육,문제 인식,고객 사례',
      goals: 'save,lead,reply',
      formats: 'text,carousel,short-video',
      cta: '자료 링크를 요청하거나 상담 신청하기',
      startDate: '2026-06-01T09:00:00+09:00',
    });
    assert(
      calendar.acceptedItems >= 5 &&
        calendar.items.some((item) => item.format === 'short-video'),
      'scenario should build a dated content calendar'
    );
    await sourceLibrary.importSources(orgId, contentCalendar.toSourceInputs(calendar.items));

    const categoryQueue = contentCategories.preview({
      sourceText: weeklyMemo,
      campaign: 'Korean B2B weekly memo launch',
      categories:
        '교육|evergreen|#12b8b8|저장형 체크리스트|2\n사례|share-once|#f6c85f|고객 전후 비교|1\n커뮤니티|evergreen|#7dd3fc|댓글 질문|1\n프로모션|share-once|#ef6f6c|상담 CTA|1',
      categorySequence: '교육,교육,사례,커뮤니티,프로모션',
      days: 7,
      postsPerDay: 1,
      targetPlatforms: ['threads', 'instagram'],
      startDate: '2026-06-01T09:00:00+09:00',
      linkUrl: 'https://snaps.example.com/weekly-offer',
    });
    assert(
      categoryQueue.categoryMix.length === 4 &&
        categoryQueue.items.some((item) => item.shareMode === 'evergreen'),
      'scenario should create a SocialBee-style category mix'
    );
    await sourceLibrary.importSources(
      orgId,
      contentCategories.toSourceInputs(categoryQueue.items)
    );

    const brandKitPreview = brandKits.analyze({
      name: 'Korean B2B weekly memo team',
      audience: '5인 이하 B2B 브랜드 대표와 마케터',
      voice: '명확하고 실무적인 한국어 조언자',
      tone: '근거 중심, 과장 없음, CTA는 부드럽게',
      requiredTerms: ['snaps', '콘텐츠 운영', '파일럿'],
      bannedTerms: ['무조건', '완벽한'],
      hashtags: ['#콘텐츠운영', '#마케팅자동화', '#snaps'],
      targetPlatforms: ['threads', 'instagram', 'linkedin'],
      websiteText: weeklyMemo,
    });
    const savedBrandKit = await brandKits.save(orgId, brandKitPreview);
    const appliedBrandKit = await brandKits.apply(orgId, savedBrandKit.id, {
      sourceText: weeklyMemo,
      topic: 'B2B content ops',
    });
    assert(
      appliedBrandKit.transformPatch.tone.includes('명확') &&
        appliedBrandKit.hashtagAppend.includes('#snaps'),
      'scenario should save and apply brand voice guidance before generating drafts'
    );

    const ideaPreview = ideas.generate({
      topic: 'AI 콘텐츠 운영 14일 챌린지',
      audience: '5인 이하 B2B 브랜드 대표와 마케터',
      goal: '상담 댓글 증가',
      targetPlatforms: ['threads', 'instagram'],
      count: 4,
      cta: '댓글로 파일럿이라고 남기면 샘플 캘린더를 보내드립니다.',
    });
    const savedIdea = await ideas.save(orgId, ideaPreview.ideas[0]);
    const plannedIdea = await ideas.updateStatus(orgId, savedIdea.id, {
      status: 'planned',
      group: 'This week',
    });
    const ideaSource = await sourceLibrary.saveSource(
      orgId,
      ideas.toSourceInput(plannedIdea.idea)
    );
    const draftedIdea = await ideas.markPromoted(orgId, savedIdea.id);
    assert(
      ideaPreview.ideas.length === 4 &&
        draftedIdea.status === 'drafted' &&
        ideaSource.sourcePlatform === 'idea-board',
      'scenario should generate ideas and convert one idea into reusable source material'
    );

    const agentResult = await agent.prepare(orgId, {
      command:
        '다음 주 화요일 오전 10시에 이 주간 메모를 인스타그램, 스레드, 링크드인, 네이버 블로그로 올릴 수 있게 준비하고 쇼츠 대본도 만들어줘. 원문: ' +
        weeklyMemo +
        ' 브랜드 톤: ' +
        appliedBrandKit.transformPatch.tone,
      useRag: true,
      generateVideo: false,
      now: '2026-06-01T09:00:00+09:00',
      timezoneOffsetMinutes: -540,
    });
    assert(
      agentResult.plan.competitorPlaybook.parityFeatures.length >= 15 &&
        agentResult.plan.scenarioRun.workflow.length >= 7 &&
        agentResult.plan.goToMarketPlan.segments.length === 4 &&
        agentResult.transform.variants.length >= 4,
      'scenario should produce competitor playbook, scenario rehearsal, GTM plan, and variants'
    );

    const shortsScript = await shortVideo.script({
      sourceText: weeklyMemo,
      durationSeconds: 45,
      platform: 'youtube',
    });
    const voiceoverCaptionPreview = voiceoverCaptions.preview({
      sourceText: weeklyMemo,
      script: shortsScript,
      durationSeconds: 45,
      platform: 'instagram',
      voiceStyle: 'energetic',
      captionStyle: 'karaoke',
    });
    assert(
      voiceoverCaptionPreview.source === 'snaps-video-voiceover-captions' &&
        voiceoverCaptionPreview.captions.length >= 3 &&
        voiceoverCaptionPreview.sceneAlignments.length >= 3 &&
        voiceoverCaptionPreview.exports.srt.includes('-->') &&
        voiceoverCaptionPreview.summary.alignmentScore > 0,
      'scenario should align short-form voiceover captions before Pixelle generation'
    );
    const videoPublishGuardPreview = videoPublishGuard.preview({
      durationSeconds: 45,
      targetPlatforms: ['instagram', 'youtube', 'tiktok'],
      sceneCount: shortsScript.storyboard.length,
      generatedImageCount: shortsScript.storyboard.length,
      generatedVideoCount: 0,
      customAssetCount: 1,
      textToImageModel: 'flux-schnell',
      imageToVideoModel: 'none',
      aiVoice: true,
      aiGeneratedVisuals: true,
      realisticPeople: true,
      realisticPlacesEvents: true,
      sourceLanguage: 'Korean',
      captionLanguage: 'Korean',
      targetLanguages: ['Korean', 'English', 'Japanese'],
    });
    assert(
      videoPublishGuardPreview.source === 'snaps-video-publish-guard' &&
        videoPublishGuardPreview.creditBudget.totalCredits > 0 &&
        videoPublishGuardPreview.disclosureChecklist.some(
          (item) => item.labelRequired
        ) &&
        videoPublishGuardPreview.localizationPlan.rows.length === 3 &&
        videoPublishGuardPreview.publishReadinessScore > 0,
      'scenario should check video credits, AI disclosures, and language variants before Pixelle generation'
    );

    const instagramVariant = agentResult.transform.variants.find(
      (variant) => variant.platform === 'instagram'
    );
    assert(instagramVariant, 'scenario should produce an Instagram variant');
    const coach = viralCoach.score({
      platform: 'instagram',
      title: instagramVariant.title,
      content: instagramVariant.content,
      hashtags: instagramVariant.hashtags,
      durationSeconds: 45,
      visualDescription: '문제 장면, 체크리스트 카드, 상담 CTA가 순서대로 보입니다.',
    });
    assert(
      coach.categories.length === 6 && coach.suggestedHooks.length >= 5,
      'scenario should score the draft before approval'
    );

    const variationLab = postVariations.preview({
      sourceText: instagramVariant.content,
      title: instagramVariant.title || 'Weekly memo variation lab',
      topic: 'B2B content ops',
      audience: '5인 이하 B2B 브랜드 대표와 마케터',
      cta: '댓글로 파일럿이라고 남기면 샘플 캘린더를 보내드립니다.',
      targetPlatforms: ['threads', 'instagram', 'linkedin'],
      variantCount: 5,
      goal: 'leads',
      competitorHook: '손작업 콘텐츠를 줄이세요',
      tags: ['scenario', 'experiment'],
    });
    await sourceLibrary.importSources(
      orgId,
      postVariations.toSourceInputs(variationLab.items)
    );
    assert(
      variationLab.totalVariants === 5 &&
        !!variationLab.winningVariantId &&
        postVariations.toVariants(variationLab.items).length >= 1,
      'scenario should rank post variations before approval'
    );

    const approval = await approvals.submit(orgId, {
      title: 'Weekly memo client approval',
      reviewer: 'client@example.com',
      variants: agentResult.transform.variants.slice(0, 3),
      note: 'Scenario approval request',
    });
    const publicApprovalLink = await approvals.createPublicReviewLink(
      orgId,
      approval.id,
      {
        reviewer: 'client@example.com',
        note: 'External client review',
        expiresInDays: 14,
        allowDecision: true,
      }
    );
    const publicApprovalComment = await approvals.addPublicReviewComment(
      orgId,
      publicApprovalLink.token,
      {
        actor: 'client@example.com',
        message: '공개 리뷰 링크에서 CTA를 더 명확하게 요청합니다.',
        selection: 'CTA',
      }
    );
    assert(
      publicApprovalLink.publicReviewUrl.includes('/snaps/review/') &&
        publicApprovalComment.review.comments.length === 1,
      'scenario should share a public client approval review link'
    );
    const approvalComment = await approvals.addComment(orgId, approval.id, {
      actor: 'client@example.com',
      message: '인스타그램 첫 문장에 파일럿 CTA를 더 선명하게 넣어주세요.',
      visibility: 'reviewer',
      variantPlatform: 'instagram',
      variantIndex: 0,
      selection: '첫 문장',
    });
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
      resolvedApprovalComment.comment.resolved &&
        resolvedApprovalComment.approval.comments.length === 2,
      'scenario should discuss and resolve approval feedback before approval'
    );
    const approved = await approvals.review(orgId, approval.id, {
      decision: 'approve',
      reviewer: 'client@example.com',
      note: 'Approved for draft queue',
    });
    assert(approved.status === 'approved', 'scenario should approve generated variants');

    const bulkPreview = bulk.preview({
      csvText:
        'title,topic,caption,platforms,publishDate,linkUrl,tags\n' +
        '고객 사례 후속,B2B content ops,"고객 사례를 후속 카드뉴스로 예약합니다.","instagram|threads",2026-06-03T10:00:00+09:00,https://snaps.example.com/case,"scenario|case"',
    });
    const feedPreview = await feeds.preview({
      feedXml:
        '<rss><channel><item><title>파트너 리서치</title><link>https://example.com/research</link><description>B2B 콘텐츠 운영 리서치 피드입니다.</description><category>research</category></item></channel></rss>',
      defaultPlatforms: ['linkedin', 'threads'],
    });
    const carouselPreview = carousel.preview({
      title: 'Weekly memo carousel',
      sourceText: weeklyMemo,
      template: 'problem',
      aspectRatio: 'portrait',
      slideCount: 5,
      targetPlatforms: ['instagram', 'linkedin'],
    });
    assert(
      bulkPreview.acceptedRows === 1 &&
        feedPreview.acceptedItems === 1 &&
        carouselPreview.slideCount >= 3 &&
        carouselPreview.media.length === carouselPreview.slideCount,
      'scenario should cover bulk, RSS, and carousel surfaces'
    );
    await sourceLibrary.importSources(orgId, bulk.toSourceInputs(bulkPreview.rows));
    await sourceLibrary.importSources(orgId, feeds.toSourceInputs(feedPreview.items));

    const savedMediaAsset = await mediaAssets.save(orgId, {
      title: 'Weekly memo card cover',
      url: carouselPreview.media[0].path,
      thumbnail: carouselPreview.media[0].thumbnail,
      mediaType: 'carousel',
      altText: '주간 시장 메모를 카드뉴스 커버로 정리한 이미지',
      caption: '주간 시장 메모에서 가장 저장할 만한 포인트를 카드뉴스로 정리했습니다.',
      campaign: 'Korean B2B weekly memo launch',
      tags: ['scenario', 'carousel', 'pilot'],
      targetPlatforms: ['instagram', 'linkedin'],
      width: 1080,
      height: 1350,
    });
    const creativeBriefPreview = creativeBriefs.preview({
      title: 'Weekly memo creative handoff',
      sourceText: weeklyMemo,
      mediaType: 'image',
      aspectRatio: 'portrait',
      visualStyle: 'clean Korean SaaS editorial cover',
      targetPlatforms: ['instagram', 'linkedin'],
      cta: '댓글로 파일럿이라고 남겨주세요.',
    });
    assert(
      creativeBriefPreview.items.length === 3 &&
        creativeBriefPreview.source === 'snaps-creative-brief',
      'scenario should generate creative design briefs before media handoff'
    );
    const savedCreativeBriefAsset = await mediaAssets.save(
      orgId,
      creativeBriefs.toMediaAssetInput(creativeBriefPreview, {
        itemId: creativeBriefPreview.items[0].id,
      })
    );
    assert(
      savedCreativeBriefAsset.source === 'snaps-media-library' &&
        savedCreativeBriefAsset.tags.includes('creative-brief'),
      'scenario should save creative brief output into media library'
    );
    const attachedMediaAsset = await mediaAssets.attach(orgId, savedMediaAsset.id, {
      targetPlatforms: ['instagram', 'linkedin'],
    });
    assert(
      attachedMediaAsset.transform.variants.length === 2 &&
        attachedMediaAsset.transform.variants[0].media?.[0]?.path ===
          savedMediaAsset.url,
      'scenario should store media assets and attach them to draft variants'
    );
    const visualFeedPreview = visualFeedPlanner.preview({
      platform: 'instagram',
      viewMode: 'vertical',
      items: [
        {
          title: savedMediaAsset.title,
          imageUrl: savedMediaAsset.thumbnail || savedMediaAsset.url,
          status: 'scheduled',
          caption: savedMediaAsset.caption,
          mediaType: savedMediaAsset.mediaType,
        },
        {
          title: 'Weekly memo Reel cover',
          imageUrl: carouselPreview.media[1]?.thumbnail,
          status: 'draft',
          caption: '릴스 커버와 카드뉴스 커버가 같은 첫 줄에서 자연스러운지 확인합니다.',
          mediaType: 'video',
        },
      ],
      variants: attachedMediaAsset.transform.variants,
    });
    assert(
      visualFeedPreview.source === 'snaps-visual-feed-planner' &&
        visualFeedPreview.columns === 3 &&
        visualFeedPreview.items.length >= 2 &&
        visualFeedPreview.aestheticScore > 0,
      'scenario should preview the Instagram grid before scheduling visual assets'
    );
    const postPreview = postPreviews.preview({
      variants: attachedMediaAsset.transform.variants,
      device: 'desktop',
      linkUrl: 'https://example.com/weekly-market-memo',
      linkTitle: '주간 시장 메모',
      linkDescription: '콘텐츠 운영 시간을 줄이고 가격 문의를 영업 기회로 바꾸는 운영 메모입니다.',
      linkImage: savedMediaAsset.thumbnail || savedMediaAsset.url,
      imageDescription: '주간 시장 메모 캠페인의 카드뉴스 커버',
    });
    assert(
      postPreview.source === 'snaps-post-preview-inspector' &&
        postPreview.cards.length >= 2 &&
        postPreview.cards.every((card) => card.feedCutoff > 0) &&
        postPreview.averageAccessibilityScore > 0,
      'scenario should preview platform feed cuts, link cards, and accessibility before approval'
    );
    const firstCommentPreview = firstComments.preview({
      sourceText: weeklyMemo,
      topic: 'Korean B2B weekly memo',
      globalComment:
        '#AI마케팅 #SNS운영 #콘텐츠자동화\n\n자료 예시가 필요하면 댓글로 파일럿이라고 남겨주세요.',
      strategy: 'hashtags',
      variants: attachedMediaAsset.transform.variants,
      targetPlatforms: ['instagram', 'linkedin'],
    });
    const firstCommentVariants = firstComments.toVariants(firstCommentPreview);
    assert(
      firstCommentPreview.source === 'snaps-first-comment-planner' &&
        firstCommentPreview.supportedItems >= 1 &&
        firstCommentVariants.some((variant) => variant.settings.firstComment),
      'scenario should prepare first comments before queueing supported social posts'
    );
    const hashtagSetPreview = hashtagSets.preview({
      title: 'Korean B2B weekly memo tags',
      topic: 'Korean B2B weekly memo',
      hashtagText:
        '#AI마케팅 #SNS운영 #콘텐츠자동화 #콘텐츠운영 #마케팅실무 #파일럿',
      reusableText: '자료 예시가 필요하면 댓글로 파일럿이라고 남겨주세요.',
      placement: 'first-comment',
      strategy: 'campaign',
      targetPlatforms: ['instagram', 'linkedin'],
      variants: attachedMediaAsset.transform.variants,
      sourceText: weeklyMemo,
    });
    const savedHashtagSet = await hashtagSets.save(orgId, hashtagSetPreview);
    const appliedHashtagSet = await hashtagSets.apply(
      orgId,
      savedHashtagSet.id,
      {
        variants: attachedMediaAsset.transform.variants,
        placement: 'first-comment',
      }
    );
    assert(
      hashtagSetPreview.source === 'snaps-hashtag-set' &&
        hashtagSetPreview.platformPlans.some((plan) => plan.overLimit > 0) &&
        appliedHashtagSet.transform.variants.some((variant) =>
          String(variant.settings.firstComment || '').includes('#AI마케팅')
        ),
      'scenario should save and apply a reusable hashtag set with platform limits'
    );
    const hashtagTrackerPreview = hashtagTracker.preview({
      title: 'Korean B2B hashtag tracker',
      topic: 'Korean B2B weekly memo',
      goal: 'engagement',
      hashtagText:
        '#AI마케팅 #SNS운영 #콘텐츠자동화 #콘텐츠운영 #마케팅실무 #파일럿',
      targetPlatforms: ['instagram', 'x'],
      variants: appliedHashtagSet.transform.variants,
      importText:
        'hashtag,platform,posts,impressions,engagements,comments,saves,clicks\n' +
        '#AI마케팅,instagram,8,12400,760,43,118,62\n' +
        '#SNS운영,instagram,6,9100,512,35,71,44\n' +
        '#콘텐츠자동화,x,10,18800,620,52,38,91\n' +
        '#마케팅실무,instagram,18,8400,174,9,12,8',
    });
    const savedTrackedHashtagSet = await hashtagSets.save(
      orgId,
      hashtagTracker.toHashtagSetInput(hashtagTrackerPreview, {
        setTitle: 'Korean B2B tracked hashtags',
      })
    );
    assert(
      hashtagTrackerPreview.source === 'snaps-hashtag-tracker' &&
        hashtagTrackerPreview.trackedHashtags >= 4 &&
        hashtagTrackerPreview.items.some((item) => item.action === 'keep') &&
        savedTrackedHashtagSet.hashtags.length >= 2,
      'scenario should score hashtag metrics and save tracked winners as a set'
    );

    const competitorImport = await competitors.importPublicSnapshots(orgId, {
      importText:
        'name,handle,profileUrl,platform,niche,followers,followersGrowth,postsCount,videosCount,photosCount,engagement,engagementRate,topPostTitle,topPostFormat,topPostEngagement,topPostHook\n' +
        'Rival Ops,@rivalops,https://instagram.com/rivalops,instagram,B2B content ops,18000,420,12,8,4,980,5.4,"3초 문제 훅",video,980,"3초 안에 시간을 아껴드립니다"',
    });
    const competitorSummary = await competitors.summary(orgId);
    assert(
      competitorImport.imported.snapshots === 1 &&
        competitorSummary.topPosts.some((post) => post.hook.includes('3초')),
      'scenario should import competitor evidence and extract top hooks'
    );

    const listeningPreview = socialListening.preview({
      title: 'Weekly memo brand listening',
      query: 'snaps OR 콘텐츠자동화 OR #콘텐츠자동화',
      keywords: ['snaps', '콘텐츠자동화', '#콘텐츠자동화', '가격', '데모', '비교'],
      excludeKeywords: ['카지노', '무료머니'],
      targetPlatforms: ['instagram', 'threads', 'x'],
      campaign: 'AI 콘텐츠 운영 14일 챌린지',
      importText:
        'platform,author,content,postId,sourceUrl,engagement\n' +
        'instagram,@lead_a,"snaps 가격표와 데모 링크 받을 수 있나요? #콘텐츠자동화",scenario-listen-1,https://example.com/ig/1,21\n' +
        'threads,@ops_b,"Buffer랑 비교했을 때 댓글 응대까지 되나요?",scenario-listen-2,https://example.com/th/2,8\n' +
        'x,@risk_c,"콘텐츠자동화는 좋은데 예약 오류가 있으면 바로 알려줘야 합니다",scenario-listen-3,https://example.com/x/3,34',
    });
    const savedListeningMonitor = await socialListening.save(orgId, {
      ...listeningPreview,
      tags: ['scenario', 'brand-health'],
      importText:
        'platform,author,content,postId,sourceUrl,engagement\n' +
        'instagram,@lead_a,"snaps 가격표와 데모 링크 받을 수 있나요? #콘텐츠자동화",scenario-listen-1,https://example.com/ig/1,21',
    });
    const listeningRun = await socialListening.run(
      orgId,
      savedListeningMonitor.id,
      {
        importText:
          'platform,author,content,postId,sourceUrl,engagement\n' +
          'instagram,@lead_a,"snaps 가격표와 데모 링크 받을 수 있나요? #콘텐츠자동화",scenario-listen-1,https://example.com/ig/1,21',
      }
    );
    const listeningInboxImport = await inbox.importItems(
      orgId,
      socialListening.toInboxImport(listeningRun.preview)
    );
    assert(
      listeningPreview.highIntentItems >= 1 &&
        listeningPreview.clusters.some((cluster) => cluster.id === 'lead') &&
        listeningInboxImport.imported === 1,
      'scenario should monitor social mentions and promote high-intent signals to inbox'
    );

    const trendRadarPreview = trendRadar.preview({
      title: 'Weekly memo trend radar',
      industry: 'B2B 콘텐츠 자동화',
      region: 'KR',
      windowDays: 7,
      targetPlatforms: ['instagram', 'threads', 'linkedin'],
      keywords: ['#콘텐츠자동화', '가격 문의', '예약 오류'],
      importText:
        'topic,platform,volume,previousVolume,engagement,sentiment,competitor,format,content,source\n' +
        '#콘텐츠자동화,instagram,46,18,930,positive,Rival Ops,reels,"3초 안에 수작업 문제를 보여준 릴스",competitor\n' +
        '가격 문의 자동응대,threads,22,8,210,mixed,,thread,"가격표와 데모 링크를 요청하는 댓글이 늘어남",listening\n' +
        '예약 오류 알림,x,18,5,160,negative,,post,"예약 오류가 있으면 바로 알려줘야 한다는 불만 리스크",listening',
      listeningPreview,
      competitorSummary,
      hashtagTrackerPreview,
    });
    const trendRadarSources = trendRadar.toSourceInputs(trendRadarPreview);
    const importedTrendRadarSources = await sourceLibrary.importSources(
      orgId,
      trendRadarSources
    );
    assert(
      trendRadarPreview.totalTrends >= 4 &&
        trendRadarPreview.alerts.some((alert) => alert.severity === 'high') &&
        trendRadarSources.length >= 3 &&
        importedTrendRadarSources.imported === trendRadarSources.length,
      'scenario should merge trend evidence into alert-backed source ideas'
    );

    const salesCampaign = await sales.saveCampaign(orgId, {
      title: 'Weekly memo pilot offer',
      destinationUrl: 'https://snaps.example.com/demo',
      platform: 'instagram',
      cta: '2주 파일럿 신청',
      slug: 'weekly-memo-pilot',
      tags: ['scenario', 'pilot'],
    });
    const salesWebinarCampaign = await sales.saveCampaign(orgId, {
      title: 'Weekly memo webinar offer',
      destinationUrl: 'https://snaps.example.com/webinar',
      platform: 'linkedin',
      cta: '웨비나 등록',
      slug: 'weekly-memo-webinar',
      tags: ['scenario', 'webinar'],
    });
    await sales.recordEvent(orgId, {
      campaignId: salesCampaign.id,
      eventType: 'click',
      platform: 'instagram',
    });
    await sales.recordEvent(orgId, {
      campaignId: salesCampaign.id,
      eventType: 'lead',
      platform: 'threads',
    });
    await sales.recordEvent(orgId, {
      campaignId: salesCampaign.id,
      eventType: 'purchase',
      platform: 'instagram',
      amount: 299000,
      currency: 'KRW',
    });
    const salesSummary = await sales.summary(orgId);
    assert(
      salesSummary.revenue === 299000 && salesSummary.purchases === 1,
      'scenario should attribute pilot revenue'
    );
    const salesProposal = await sales.proposal(orgId, {
      leadName: 'Korean B2B weekly memo team',
      segment: '5-person B2B brand',
      sourceAsset: 'weekly market memo',
      pilotDays: 14,
      targetRevenue: 299000,
    });
    assert(
      salesProposal.source === 'snaps-sales-proposal' &&
        salesProposal.successMetrics.some((metric) => metric.includes('299000')) &&
        salesProposal.followUpMessages.length >= 2,
      'scenario should turn pilot attribution into a sales proposal'
    );
    const publicSalesLink = await sales.publicLink(salesCampaign.slug, orgId);
    const publicSalesHub = await sales.publicHub(orgId);
    const publicSalesClick = await sales.recordPublicClick(salesCampaign.slug, orgId, {
      scenario: true,
    });
    assert(
      publicSalesLink.source === 'snaps-public-sales-link' &&
        publicSalesLink.linkInBioUrl.includes('/snaps/link/') &&
        publicSalesHub.source === 'snaps-public-sales-hub' &&
        publicSalesHub.links.some((link) => link.campaignId === salesCampaign.id) &&
        publicSalesHub.links.some((link) => link.campaignId === salesWebinarCampaign.id) &&
        publicSalesClick.redirectUrl.includes('utm_campaign=weekly-memo-pilot'),
      'scenario should expose and track public link-in-bio pages'
    );

    const inboxImport = await inbox.importItems(orgId, {
      items: [
        {
          platform: 'instagram',
          postId: 'scenario-post-1',
          author: 'lead-a',
          content: '가격이 어떻게 되나요? 자료 링크도 받을 수 있을까요?',
        },
        {
          platform: 'threads',
          postId: 'scenario-post-2',
          author: 'lead-b',
          content: '우리 팀에도 적용하고 싶은데 상담 신청 링크 주세요.',
        },
      ],
    });
    const inboxSummary = await inbox.summarize(orgId);
    assert(
      inboxImport.imported === 2 &&
        inboxSummary.conversionSignals.some((signal) => signal.id === 'pricing') &&
        inboxSummary.conversionSignals.some((signal) => signal.id === 'link-request'),
      'scenario should surface high-intent sales comments'
    );
    const savedAnswer = await inbox.saveReplyTemplate(orgId, {
      title: '가격/자료 링크 안내',
      platform: 'instagram',
      sentiment: 'question',
      body: '문의 주셔서 감사합니다. 가격표와 자료 링크를 바로 확인하실 수 있게 보내드리겠습니다.',
      cta: '댓글로 파일럿이라고 남기시면 14일 샘플 캘린더도 함께 드립니다.',
      tags: ['pricing', 'link-request', 'pilot'],
    });
    const savedAnswers = await inbox.listReplyTemplates(orgId, {
      platform: 'instagram',
      sentiment: 'question',
    });
    assert(
      savedAnswer.saved &&
        savedAnswers.some((answer) => answer.tags.includes('pilot')),
      'scenario should save a reusable inbox answer template'
    );
    const customerNote = await inbox.saveInboxNote(orgId, {
      platform: 'instagram',
      author: 'lead-a',
      postId: 'scenario-post-1',
      note: '가격표와 자료 링크를 요청했습니다. 다음 공개 답글에는 파일럿 CTA를 넣고 DM으로 샘플 캘린더를 안내합니다.',
      tags: ['pricing', 'support-note'],
    });
    const customerNotes = await inbox.listInboxNotes(orgId, {
      platform: 'instagram',
      author: 'lead-a',
    });
    assert(
      customerNote.saved &&
        customerNotes.some((note) => note.tags.includes('support-note')),
      'scenario should save customer notes for repeat inbox context'
    );
    const inboxAssignment = await inbox.previewAssignments(orgId, {
      status: 'unread',
      defaultSlaMinutes: 120,
    });
    assert(
      inboxAssignment.total >= 2 &&
        inboxAssignment.cases.some(
          (item) =>
            item.assigneeRole === 'sales' &&
            item.replyTemplateId === savedAnswer.template.id &&
            item.noteMatches.some((note) => note.id === customerNote.note.id)
        ),
      'scenario should route high-intent inbox cases with saved answers and customer notes'
    );
    const resolvedInboxItem = await inbox.updateItemStatus(
      orgId,
      inboxImport.items[0].id,
      { status: 'resolved' }
    );
    const resolvedInboxItems = await inbox.listItems(orgId, {
      status: 'resolved',
      search: '가격',
    });
    assert(
      resolvedInboxItem.updated &&
        resolvedInboxItems.some((item) => item.id === inboxImport.items[0].id),
      'scenario should triage inbox comments into resolved follow-up state'
    );

    const report = await reports.generate({
      title: 'Weekly memo scenario performance',
      metrics: [
        {
          platform: 'instagram',
          metricKey: 'impressions',
          metricValue: 4200,
          collectedAt: '2026-06-03T09:00:00+09:00',
        },
        {
          platform: 'instagram',
          metricKey: 'comments',
          metricValue: 24,
          collectedAt: '2026-06-03T09:00:00+09:00',
        },
        {
          platform: 'threads',
          metricKey: 'clicks',
          metricValue: 18,
          collectedAt: '2026-06-03T09:00:00+09:00',
        },
      ],
    });
    assert(
      report.insights.length > 0 && report.actionItems.length > 0,
      'scenario should generate performance insights'
    );

    const recycle = recycler.preview({
      sourceText: report.insights.join('\n'),
      title: 'Winning insight recycle',
      category: 'education',
      cadence: 'weekly',
      repeatCount: 3,
      targetPlatforms: ['instagram', 'threads'],
      performanceNote: '댓글과 클릭이 높은 인사이트',
    });
    const followUp = postConditions.preview({
      parentTitle: 'Weekly memo launch post',
      parentPlatform: 'instagram',
      parentPublishedAt: '2026-06-03T09:00:00+09:00',
      followUpText: '자료 링크와 2주 파일럿 신청 경로를 댓글로 안내합니다.',
      conditionType: 'engagement-rate',
      threshold: 3.5,
      metrics: {
        likes: 140,
        comments: 24,
        impressions: 4200,
        engagementRate: 4.2,
      },
      targetPlatforms: ['instagram', 'threads'],
    });
    const recurring = recurringPosts.preview({
      sourceText: '2주 파일럿 모집 CTA를 매주 다른 각도로 반복합니다.\n가격 문의 댓글과 데모 신청을 같은 링크 허브로 모읍니다.',
      title: 'Weekly memo recurring CTA',
      cadence: 'weekly',
      repeatCount: 4,
      targetPlatforms: ['instagram', 'linkedin'],
      cta: '댓글로 파일럿이라고 남기면 샘플 캘린더를 보냅니다.',
    });
    assert(
      recycle.acceptedItems === 3 &&
        recurring.acceptedItems === 4 &&
        followUp.triggerMet === true,
      'scenario should recycle winners, recur CTAs, and queue ready follow-ups'
    );
    await sourceLibrary.importSources(orgId, recycler.toSourceInputs(recycle.items));
    await sourceLibrary.importSources(orgId, recurringPosts.toSourceInputs(recurring.items));

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
        repurposePreview.scheduleSlots.length >= 2 &&
        repurposeQueue.toVariants(repurposePreview.items[0]).length >= 1,
      'scenario should turn source-platform content into posting-plan repurpose slots'
    );
    await sourceLibrary.importSources(
      orgId,
      repurposeQueue.toSourceInputs(repurposePreview.items)
    );

    await activity.record(orgId, {
      type: 'agent',
      title: 'Virtual scenario run',
      detail: {
        calendarItems: calendar.acceptedItems,
        categoryItems: categoryQueue.acceptedItems,
        recurringItems: recurring.acceptedItems,
        repurposeItems: repurposePreview.acceptedItems,
        revenue: salesSummary.revenue,
      },
    });
    const activityLog = await activity.list(orgId);
    const sourceCount = (await sourceLibrary.listSources(orgId)).length;
    const ideaCount = (await ideas.list(orgId)).length;
    const brandKitCount = (await brandKits.list(orgId)).length;
    const mediaAssetCount = (await mediaAssets.list(orgId)).length;
    const hashtagSetCount = (await hashtagSets.list(orgId)).length;
    const listeningMonitorCount = (await socialListening.list(orgId)).length;

    assert(
      sourceCount >= 8 &&
        ideaCount === 1 &&
        brandKitCount === 1 &&
        mediaAssetCount === 2 &&
        hashtagSetCount === 2 &&
        listeningMonitorCount === 1 &&
        activityLog.some((item) => item.title === 'Virtual scenario run'),
      'scenario should persist reusable assets and activity evidence'
    );

    console.log(
      [
        'verify-snaps-scenario-ok',
        `sources=${sourceCount}`,
        `variants=${agentResult.transform.variants.length}`,
        `calendar=${calendar.acceptedItems}`,
        `categories=${categoryQueue.acceptedItems}`,
        `ideas=${ideaCount}`,
        `brandKits=${brandKitCount}`,
        `mediaAssets=${mediaAssetCount}`,
        `hashtagSets=${hashtagSetCount}`,
        `hashtagTracker=${hashtagTrackerPreview.items.length}`,
        `listeningMonitors=${listeningMonitorCount}`,
        `trendRadar=${trendRadarPreview.trends.length}`,
        `postPreview=${postPreview.cards.length}`,
        `voiceoverCaptions=${voiceoverCaptionPreview.captions.length}`,
        `publishGuard=${videoPublishGuardPreview.creditBudget.totalCredits}`,
        `visualGrid=${visualFeedPreview.items.length}`,
        `firstComments=${firstCommentPreview.supportedItems}`,
        `variationLab=${variationLab.totalVariants}`,
        `publicReviewLinks=${publicApprovalLink.publicReviewUrl ? 1 : 0}`,
        `parity=${agentResult.plan.competitorPlaybook.parityFeatures.length}`,
        `revenue=${salesSummary.revenue}`,
        `listeningSignals=${listeningPreview.signals.length}`,
        `signals=${inboxSummary.conversionSignals.length}`,
        `assignments=${inboxAssignment.total}`,
        `approvalComments=${resolvedApprovalComment.approval.comments.length}`,
        `savedAnswers=${savedAnswers.length}`,
        `notes=${customerNotes.length}`,
        `resolved=${resolvedInboxItems.length}`,
        `recycle=${recycle.acceptedItems}`,
        `recurring=${recurring.acceptedItems}`,
        `repurpose=${repurposePreview.acceptedItems}`,
      ].join(' ')
    );
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
