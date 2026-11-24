import { BadRequestException, Injectable } from '@nestjs/common';
import { OllamaClient } from '@gitroom/nestjs-libraries/snaps/ai/ollama.client';
import { SnapsContentTransformService } from '@gitroom/nestjs-libraries/snaps/transform/content-transform.service';
import {
  normalizeTargetPlatforms,
  SnapsTargetPlatform,
  snapsPlatformRules,
  snapsTargetPlatforms,
  snapsContentLength,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import { SnapsShortVideoService } from '@gitroom/nestjs-libraries/snaps/video/short-video.service';
import {
  SnapsTransformResult,
  SnapsVariant,
} from '@gitroom/nestjs-libraries/snaps/dto/transform-result.dto';
import { snapsTimezoneOffsetMinutes } from '@gitroom/nestjs-libraries/snaps/utils/zoned-time';

type SnapsAgentScheduleType = 'draft' | 'schedule';
type SnapsAgentShortVideoPlatform = 'instagram' | 'youtube' | 'tiktok';
type SnapsAgentRevenueModel = 'CPS' | 'CPE' | 'CPM';
type SnapsAgentMarketingLane = 'monetize' | 'publish' | 'engage' | 'create';
type SnapsAgentSignalPriority = 'high' | 'medium' | 'low';
type SnapsAgentRiskSeverity = 'blocker' | 'warning' | 'info';
type SnapsAgentReadinessLevel = 'ready' | 'needs-input' | 'manual-review';
type SnapsAgentRunStatus =
  | 'thinking'
  | 'generating_content'
  | 'generating_video'
  | 'requires_confirmation'
  | 'completed'
  | 'error';

export type SnapsAgentCommandRequest = {
  command?: unknown;
  useRag?: unknown;
  generateVideo?: unknown;
  timezoneOffsetMinutes?: unknown;
  now?: unknown;
};

export type SnapsAgentExecutionStep = {
  label: string;
  detail: string;
  status: 'ready' | 'needs-confirmation' | 'manual';
};

export type SnapsAgentConfirmationChecklistItem = {
  id:
    | 'content-preview'
    | 'account-connection'
    | 'publish-time'
    | 'short-video'
    | 'final-confirmation';
  label: string;
  detail: string;
  status: 'ready' | 'attention' | 'manual';
};

export type SnapsAgentEngagementSignal = {
  id:
    | 'link-request'
    | 'purchase-intent'
    | 'pricing'
    | 'how-to-use'
    | 'brand-mention'
    | 'collaboration';
  label: string;
  priority: SnapsAgentSignalPriority;
  triggerExamples: string[];
  action: string;
};

export type SnapsAgentMarketingLanePlan = {
  lane: SnapsAgentMarketingLane;
  label: string;
  goal: string;
  actions: string[];
  kpis: string[];
  status: 'ready' | 'needs-confirmation' | 'manual';
};

export type SnapsAgentMarketingStrategy = {
  framework: 'Monetize-Publish-Engage-Create';
  inspiredBy: 'AiToEarn';
  revenueModels: SnapsAgentRevenueModel[];
  lanes: SnapsAgentMarketingLanePlan[];
  engagementSignals: SnapsAgentEngagementSignal[];
  batchIdeas: string[];
  mcpReadyActions: string[];
  operatorGuardrails: string[];
};

type SnapsAgentCompetitorCoverageStatus =
  | 'implemented'
  | 'operator-assisted'
  | 'roadmap';

export type SnapsAgentCompetitorFeature = {
  id:
    | 'source-resolution'
    | 'agent-automation'
    | 'visual-video'
    | 'video-voiceover-captions'
    | 'video-publish-guard'
    | 'creative-brief-handoff'
    | 'visual-feed-planner'
    | 'first-comment-planner'
    | 'hashtag-set-manager'
    | 'hashtag-tracker'
    | 'social-listening-monitor'
    | 'trend-radar'
    | 'post-preview-inspector'
    | 'media-library'
    | 'viral-coach'
    | 'post-variation-lab'
    | 'calendar-schedule'
    | 'ai-content-calendar'
    | 'content-category-queue'
    | 'repurpose-queue'
    | 'post-condition'
    | 'approval-workflow'
    | 'analytics-report'
    | 'competitor-import'
    | 'engage-inbox'
    | 'inbox-assignment-router'
    | 'evergreen-recycle'
    | 'bulk-source'
    | 'feed-source';
  label: string;
  copiedFrom: string[];
  evidence: string;
  snapsSurface: string;
  status: SnapsAgentCompetitorCoverageStatus;
  operatorAction: string;
};

export type SnapsAgentCompetitorPlaybook = {
  headline: string;
  sources: string[];
  parityFeatures: SnapsAgentCompetitorFeature[];
  moat: string[];
  implementationNotes: string[];
};

export type SnapsAgentGoToMarketSegment = {
  id:
    | 'solo-creator'
    | 'agency'
    | 'b2b-content-team'
    | 'automation-consultant';
  label: string;
  pain: string;
  offer: string;
  channels: string[];
  firstPitch: string;
  pricing: string;
  proofMetric: string;
};

export type SnapsAgentGoToMarketPlan = {
  primaryBuyer: string;
  positioning: string;
  packages: string[];
  segments: SnapsAgentGoToMarketSegment[];
  salesMotion: string[];
  pricingNotes: string[];
};

export type SnapsAgentScenarioRun = {
  scenario: string;
  persona: string;
  sourceAsset: string;
  workflow: string[];
  preparedOutputs: string[];
  validationChecklist: string[];
  expectedBusinessOutcome: string;
};

export type SnapsAgentProgressStep = {
  id: string;
  label: string;
  detail: string;
  status: 'done' | 'active' | 'waiting' | 'blocked';
  progress: number;
};

export type SnapsAgentPlatformReadiness = {
  platform: SnapsTargetPlatform;
  label: string;
  publishMode: 'schedule' | 'assist';
  status: 'ready' | 'attention' | 'manual';
  checks: string[];
  blockers: string[];
};

export type SnapsAgentQualityGate = {
  id:
    | 'content-length'
    | 'missing-cta'
    | 'manual-publish'
    | 'publish-time'
    | 'short-video-asset'
    | 'operator-confirmation';
  label: string;
  detail: string;
  severity: SnapsAgentRiskSeverity;
  platform?: SnapsTargetPlatform;
  fixAction: string;
};

export type SnapsAgentRecommendedAction = {
  id:
    | 'review-preview'
    | 'save-source'
    | 'copy-brief'
    | 'send-shorts'
    | 'create-drafts'
    | 'resolve-inputs'
    | 'monitor-feedback';
  label: string;
  detail: string;
  actionType:
    | 'review-preview'
    | 'save-source'
    | 'copy-brief'
    | 'send-shorts'
    | 'create-drafts'
    | 'resolve-inputs'
    | 'monitor-feedback';
  priority: 'high' | 'medium' | 'low';
  enabled: boolean;
};

export type SnapsAgentReadiness = {
  score: number;
  level: SnapsAgentReadinessLevel;
  summary: string;
};

export type SnapsAgentCampaignTimelineItem = {
  id: 'prepare' | 'publish' | 'monitor' | 'engage' | 'repurpose';
  label: string;
  window: string;
  actions: string[];
  status: 'ready' | 'needs-confirmation' | 'manual';
};

export type SnapsAgentOperationPreview = {
  status: SnapsAgentRunStatus;
  progress: number;
  headline: string;
  progressSteps: SnapsAgentProgressStep[];
  platformReadiness: SnapsAgentPlatformReadiness[];
  readiness: SnapsAgentReadiness;
  qualityGates: SnapsAgentQualityGate[];
  recommendedActions: SnapsAgentRecommendedAction[];
  nextActions: string[];
  requiresConfirmation: true;
};

export type SnapsAgentCommandPlan = {
  command: string;
  intent: 'prepare-and-confirm';
  sourceText: string;
  topic?: string;
  tone: string;
  targetPlatforms: SnapsTargetPlatform[];
  scheduleType: SnapsAgentScheduleType;
  publishDate?: string;
  publishDateLocal?: string;
  includeShortVideo: boolean;
  shortVideoPlatform: SnapsAgentShortVideoPlatform;
  shortVideoTargetPlatforms: SnapsTargetPlatform[];
  needsConfirmation: true;
  confirmationPolicy: string;
  assumptions: string[];
  operatorSummary: string[];
  missingInputs: string[];
  confirmationChecklist: SnapsAgentConfirmationChecklistItem[];
  campaignTimeline: SnapsAgentCampaignTimelineItem[];
  marketingStrategy: SnapsAgentMarketingStrategy;
  competitorPlaybook: SnapsAgentCompetitorPlaybook;
  goToMarketPlan: SnapsAgentGoToMarketPlan;
  scenarioRun: SnapsAgentScenarioRun;
  executionPlan: SnapsAgentExecutionStep[];
};

export type SnapsAgentPrepareResult = {
  plan: SnapsAgentCommandPlan;
  transform: SnapsTransformResult;
  operation: SnapsAgentOperationPreview;
  video?: unknown;
  warnings: string[];
};

type OllamaPlanPayload = Partial<{
  sourceText: unknown;
  topic: unknown;
  tone: unknown;
  targetPlatforms: unknown;
  scheduleType: unknown;
  publishDate: unknown;
  includeShortVideo: unknown;
  shortVideoPlatform: unknown;
  shortVideoTargetPlatforms: unknown;
  assumptions: unknown;
}>;

const videoPlatforms = ['instagram', 'youtube', 'tiktok'] as const;

type SnapsAgentPlanDraft = Omit<
  SnapsAgentCommandPlan,
  | 'marketingStrategy'
  | 'executionPlan'
  | 'operatorSummary'
  | 'missingInputs'
  | 'confirmationChecklist'
  | 'campaignTimeline'
  | 'competitorPlaybook'
  | 'goToMarketPlan'
  | 'scenarioRun'
> & {
  marketingStrategy?: SnapsAgentMarketingStrategy;
  executionPlan?: SnapsAgentExecutionStep[];
  operatorSummary?: string[];
  missingInputs?: string[];
  confirmationChecklist?: SnapsAgentConfirmationChecklistItem[];
  campaignTimeline?: SnapsAgentCampaignTimelineItem[];
  competitorPlaybook?: SnapsAgentCompetitorPlaybook;
  goToMarketPlan?: SnapsAgentGoToMarketPlan;
  scenarioRun?: SnapsAgentScenarioRun;
};

@Injectable()
export class SnapsCommandPlannerService {
  constructor(
    private readonly ollama: OllamaClient,
    private readonly transformer: SnapsContentTransformService,
    private readonly shortVideo: SnapsShortVideoService
  ) {}

  async prepare(
    organizationId: string,
    body?: SnapsAgentCommandRequest
  ): Promise<SnapsAgentPrepareResult> {
    const command = this.cleanText(body?.command, 4000);
    if (command.length < 5) {
      throw new BadRequestException('agent command must be at least 5 characters.');
    }

    const now = this.parseNow(body?.now);
    const timezoneOffsetMinutes = this.cleanTimezoneOffset(
      body?.timezoneOffsetMinutes,
      now
    );
    const plan = await this.plan(command, now, timezoneOffsetMinutes);
    const allTargetPlatforms = this.mergePlatforms([
      ...plan.targetPlatforms,
      ...(plan.includeShortVideo ? plan.shortVideoTargetPlatforms : []),
    ]);

    const transform = await this.transformer.transform(organizationId, {
      sourceText: plan.sourceText,
      targetPlatforms: allTargetPlatforms,
      tone: plan.tone,
      topic: plan.topic,
      useRag: typeof body?.useRag === 'boolean' ? body.useRag : true,
    });

    const warnings = [...transform.warnings];
    let video: unknown;
    if (plan.includeShortVideo) {
      const generateVideo = body?.generateVideo === true;
      try {
        video = generateVideo
          ? await this.shortVideo.generate({
              sourceText: plan.sourceText,
              durationSeconds: 45,
              platform: plan.shortVideoPlatform,
            })
          : {
              status: 'script-ready',
              message:
                'Short-form script is ready. Video generation requires a separate operator action.',
              script: await this.shortVideo.script({
                sourceText: plan.sourceText,
                durationSeconds: 45,
                platform: plan.shortVideoPlatform,
              }),
            };
      } catch (error) {
        warnings.push(
          `Short-form video generation failed, script fallback was prepared: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        video = await this.shortVideo.script({
          sourceText: plan.sourceText,
          durationSeconds: 45,
          platform: plan.shortVideoPlatform,
        });
      }
    }

    const preparedPlan = {
      ...plan,
      targetPlatforms: allTargetPlatforms,
    };

    return {
      plan: preparedPlan,
      transform,
      operation: this.buildOperationPreview(preparedPlan, transform, video),
      ...(video ? { video } : {}),
      warnings: [
        ...warnings,
        ...(plan.includeShortVideo
          ? [
              'Short-form video is prepared as a draft asset only. Scheduling still requires operator confirmation.',
            ]
          : []),
      ],
    };
  }

  async plan(
    command: string,
    now = new Date(),
    timezoneOffsetMinutes = snapsTimezoneOffsetMinutes(now)
  ): Promise<SnapsAgentCommandPlan> {
    const fallback = this.fallbackPlan(command, now, timezoneOffsetMinutes);
    try {
      const payload = await this.ollama.chatJson<OllamaPlanPayload>([
        {
          role: 'system',
          content:
            'You are snaps operator planner. Return strict JSON only. Convert Korean natural-language social publishing commands into a safe execution plan. Map requests through Monetize, Publish, Engage, and Create lanes, but never mark publishing as confirmed.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            now: now.toISOString(),
            timezoneOffsetMinutes,
            command,
            outputShape: {
              sourceText: 'string: content brief only, without scheduling instructions',
              topic: 'string',
              tone: 'string',
              targetPlatforms: snapsTargetPlatforms,
              scheduleType: 'draft | schedule',
              publishDate: 'ISO datetime if the user asked for a time, otherwise empty',
              includeShortVideo: 'boolean',
              shortVideoPlatform: 'instagram | youtube | tiktok',
              shortVideoTargetPlatforms: ['instagram | youtube | tiktok'],
              assumptions: ['string'],
            },
            rules: [
              'If the user asks to post, publish, upload, or schedule at a time, scheduleType is schedule, but confirmation is still required later.',
              'Do not include platforms the user clearly excluded.',
              'If the user says Shorts or 쇼츠, include youtube as a short-video target. If Instagram is also requested, include instagram as a short-video target too.',
              'If the user says 릴스 or Reels, include instagram as a short-video target.',
              'If the user says TikTok or 틱톡, include tiktok as a short-video target.',
              'If the command is vague, create a useful content brief rather than asking a follow-up question.',
              'Treat real publishing, comment replies, and video uploads as operator-confirmed actions only.',
            ],
          }),
        },
      ]);
      return this.normalizeOllamaPlan(
        command,
        payload,
        fallback,
        now,
        timezoneOffsetMinutes
      );
    } catch {
      return fallback;
    }
  }

  private normalizeOllamaPlan(
    command: string,
    payload: OllamaPlanPayload,
    fallback: SnapsAgentCommandPlan,
    now: Date,
    timezoneOffsetMinutes: number
  ): SnapsAgentCommandPlan {
    const sourceText =
      this.cleanText(payload.sourceText, 12000) || fallback.sourceText;
    const topic = this.cleanText(payload.topic, 200) || fallback.topic;
    const tone = this.cleanText(payload.tone, 200) || fallback.tone;
    const targetPlatforms = this.mergePlatforms(
      this.cleanPlatformArray(payload.targetPlatforms)
    );
    const includeShortVideo =
      typeof payload.includeShortVideo === 'boolean'
        ? payload.includeShortVideo
        : fallback.includeShortVideo;
    const shortVideoPlatform = this.cleanVideoPlatform(
      payload.shortVideoPlatform,
      fallback.shortVideoPlatform
    );
    const shortVideoTargetPlatforms = this.cleanVideoTargetPlatforms(
      payload.shortVideoTargetPlatforms,
      fallback.shortVideoTargetPlatforms
    );
    const publishDateCandidate =
      this.cleanText(payload.publishDate, 120) || fallback.publishDate || '';
    const parsedPublishDate = this.cleanPublishDate(
      publishDateCandidate,
      timezoneOffsetMinutes
    );
    const scheduleType =
      payload.scheduleType === 'schedule' || fallback.scheduleType === 'schedule'
        ? 'schedule'
        : 'draft';
    const finalPublishDate =
      scheduleType === 'schedule'
        ? parsedPublishDate ||
          fallback.publishDate ||
          this.defaultPublishDate(now, timezoneOffsetMinutes)
        : undefined;

    return this.withExecutionPlan({
      command,
      intent: 'prepare-and-confirm',
      sourceText,
      topic,
      tone,
      targetPlatforms: targetPlatforms.length
        ? targetPlatforms
        : fallback.targetPlatforms,
      scheduleType,
      ...(finalPublishDate
        ? {
            publishDate: finalPublishDate,
            publishDateLocal: this.toLocalInputValue(
              new Date(finalPublishDate),
              timezoneOffsetMinutes
            ),
          }
        : {}),
      includeShortVideo,
      shortVideoPlatform,
      shortVideoTargetPlatforms,
      needsConfirmation: true,
      confirmationPolicy:
        'snaps prepares drafts and schedules only after the operator confirms the preview.',
      assumptions: this.cleanStringArray(payload.assumptions, 160, 8).length
        ? this.cleanStringArray(payload.assumptions, 160, 8)
        : fallback.assumptions,
    });
  }

  private fallbackPlan(
    command: string,
    now: Date,
    timezoneOffsetMinutes: number
  ): SnapsAgentCommandPlan {
    const targetPlatforms = this.detectTargetPlatforms(command);
    const includeShortVideo = this.detectShortVideo(command);
    const shortVideoTargetPlatforms = this.detectShortVideoTargets(
      command,
      targetPlatforms
    );
    const publishDate = this.detectPublishDate(
      command,
      now,
      timezoneOffsetMinutes
    );
    const topic = this.detectTopic(command) || 'snaps agent request';
    const sourceText = this.buildFallbackSourceText(command, topic, includeShortVideo);

    return this.withExecutionPlan({
      command,
      intent: 'prepare-and-confirm',
      sourceText,
      topic,
      tone: this.detectTone(command),
      targetPlatforms,
      scheduleType: publishDate || this.looksLikePublishIntent(command)
        ? 'schedule'
        : 'draft',
      ...(publishDate
        ? {
            publishDate,
            publishDateLocal: this.toLocalInputValue(
              new Date(publishDate),
              timezoneOffsetMinutes
            ),
          }
        : {}),
      includeShortVideo,
      shortVideoPlatform: this.pickShortVideoPlatform(shortVideoTargetPlatforms),
      shortVideoTargetPlatforms,
      needsConfirmation: true,
      confirmationPolicy:
        'snaps prepares drafts and schedules only after the operator confirms the preview.',
      assumptions: [
        '자연어 명령에서 명시되지 않은 세부 문구는 snaps 스타일 변환기가 채웁니다.',
        'AiToEarn 방식처럼 수익/KPI, 배포, 반응 대응, 제작을 한 번의 운영맵으로 묶어 준비합니다.',
        ...(includeShortVideo
          ? ['쇼츠는 영상 대본 또는 Pixelle 작업으로 먼저 준비하고, 영상 URL 첨부 후 예약합니다.']
          : []),
      ],
    });
  }

  private withExecutionPlan(plan: SnapsAgentPlanDraft): SnapsAgentCommandPlan {
    const marketingStrategy =
      plan.marketingStrategy || this.buildMarketingStrategy(plan);
    const missingInputs = plan.missingInputs || this.buildMissingInputs(plan);
    const competitorPlaybook =
      plan.competitorPlaybook || this.buildCompetitorPlaybook(plan);
    const goToMarketPlan =
      plan.goToMarketPlan || this.buildGoToMarketPlan(plan, marketingStrategy);
    const scenarioRun =
      plan.scenarioRun || this.buildScenarioRun(plan, marketingStrategy);
    return {
      ...plan,
      marketingStrategy,
      competitorPlaybook,
      goToMarketPlan,
      scenarioRun,
      operatorSummary:
        plan.operatorSummary || this.buildOperatorSummary(plan, missingInputs),
      missingInputs,
      confirmationChecklist:
        plan.confirmationChecklist ||
        this.buildConfirmationChecklist(plan, missingInputs),
      campaignTimeline:
        plan.campaignTimeline || this.buildCampaignTimeline(plan, missingInputs),
      executionPlan: [
        {
          label: '명령 해석',
          detail: `${plan.topic || '콘텐츠'} / ${plan.targetPlatforms.join(', ')}`,
          status: 'ready',
        },
        {
          label: '채널별 초안',
          detail: '연결 채널별 문안, 해시태그, 설정을 생성합니다.',
          status: 'ready',
        },
        ...(plan.includeShortVideo
          ? [
              {
                label: '쇼츠 준비',
                detail: `${plan.shortVideoTargetPlatforms.join(', ')}용 세로 영상 대본과 업로드 메타데이터를 준비합니다.`,
                status: 'ready' as const,
              },
            ]
          : []),
        {
          label:
            plan.scheduleType === 'schedule'
              ? '예약 생성 전 확인'
              : '초안 저장 전 확인',
          detail:
            plan.scheduleType === 'schedule'
              ? `예약 시간: ${plan.publishDateLocal || plan.publishDate || '미정'}`
              : '초안으로만 저장합니다.',
          status: 'needs-confirmation',
        },
      ],
    };
  }

  private buildCompetitorPlaybook(
    plan: SnapsAgentPlanDraft
  ): SnapsAgentCompetitorPlaybook {
    const requestedPlatforms = plan.targetPlatforms
      .map((platform) => snapsPlatformRules[platform]?.label || platform)
      .join(', ');

    return {
      headline: `${plan.topic || '이번 캠페인'}을 Blotato식 자동화와 Buffer/Metricool식 운영 대시보드로 준비합니다.`,
      sources: [
        'Blotato: API, n8n/Make/MCP, source resolution, AI Videos, AI voiceover captions, AI credits, multiple languages, visual templates, Viral AI Coach, publish/schedule, API dashboard',
        'Buffer: channel-aware composer, calendar, AI rewrite, analytics report export, community engagement',
        'Later/Publer: media library, media upload requirements, Canva/Drive-style imports, quick scheduling from assets',
        'Later/Planoly/Buffer: saved captions, hashtag groups, manager insert flows, first-comment handoff',
        'Hootsuite/Sprout/Metricool/Buffer: trend research, keyword streams, listening topics, hashtag tracking, comment community inbox, message assignments, case priorities',
        'Hootsuite/Publer: platform feed preview, link preview troubleshooting, AI alt text, accessibility checks',
        'FeedHive/Predis: AI content calendar, content planner, smart scheduling, post conditions, bulk auto-posting',
        'Publer/SocialBee: evergreen recycling, RSS feeds, post variations, content category queues, bulk scheduling, best-time analytics',
        'Metricool/Later/Repurpose.io/FeedHive/Buffer: calendar planning, posting plans, recurring tasks, link-in-bio, social listening, source auto-publish workflows, queue slots',
      ],
      parityFeatures: [
        {
          id: 'source-resolution',
          label: '원문/소스 허브',
          copiedFrom: ['Blotato Source', 'Blotato n8n Source', 'SocialBee categories'],
          evidence: 'URL, text, PDF, video, research query, RSS처럼 긴 원천을 캠페인 자산으로 먼저 모으는 흐름',
          snapsSurface: 'Source Resolver, Source Library, workspace import/export, RAG promotion',
          status: 'implemented',
          operatorAction: 'URL/텍스트/리서치 쿼리를 리졸브해 원문 저장 후 성과가 좋은 문구를 RAG 예시로 승격',
        },
        {
          id: 'agent-automation',
          label: '에이전트 자동화',
          copiedFrom: ['Blotato API', 'n8n', 'Make', 'MCP'],
          evidence: '자연어 또는 노코드 플로우에서 생성, 게시, 예약을 호출하는 구조',
          snapsSurface: 'Agent prepare API, task history, SDK/MCP-ready action names',
          status: 'implemented',
          operatorAction: '자연어 오더를 준비한 뒤 컨펌 전 실제 게시를 차단',
        },
        {
          id: 'visual-video',
          label: 'AI 영상/비주얼',
          copiedFrom: ['Blotato Visual', 'Buffer carousel posts', 'Publer Canva'],
          evidence: '템플릿 기반 캐러셀, 슬라이드쇼, 쇼츠/릴스 생성',
          snapsSurface:
            'Pixelle shorts workflow plus carousel visual kit with SVG/HTML export',
          status: 'implemented',
          operatorAction:
            '슬라이드와 대본을 확인한 뒤 HTML/SVG 내보내기, Pixelle 생성, 또는 연결 채널 큐 생성',
        },
        {
          id: 'video-voiceover-captions',
          label: 'AI 보이스오버 캡션',
          copiedFrom: ['Blotato AI Videos', 'Blotato AI Voiceover Captions', 'faceless video tools'],
          evidence: '대본, 이미지/영상 트랙, AI 음성, 자막 큐를 한 타임라인에 맞춰 쇼츠를 생성하는 운영',
          snapsSurface:
            'Voiceover Caption Studio with caption cue timing, SRT/WebVTT export, scene alignment, and Pixelle prompt handoff',
          status: 'implemented',
          operatorAction:
            '쇼츠 대본을 만든 뒤 보이스오버 캡션을 미리보고 자막/시각 트랙 정렬 경고를 해결한 다음 Pixelle 생성',
        },
        {
          id: 'video-publish-guard',
          label: '영상 게시 가드',
          copiedFrom: [
            'Blotato AI Video Credits',
            'Blotato Multiple Languages',
            'YouTube/TikTok/Meta AI disclosure labels',
          ],
          evidence:
            'AI 이미지/영상 모델별 크레딧, 성공 생성 시 과금, 다국어 보이스오버, 현실적인 AI 합성 콘텐츠 공개/라벨링을 게시 전에 점검하는 운영',
          snapsSurface:
            'Video Publish Guard with credit budget, AI disclosure checklist, localization readiness, and Pixelle generation risk scoring',
          status: 'implemented',
          operatorAction:
            'Pixelle 생성 전 크레딧 예상치, 플랫폼별 AI 공개 필요 여부, 언어별 캡션/보이스오버 검수를 확인',
        },
        {
          id: 'creative-brief-handoff',
          label: '크리에이티브 브리프',
          copiedFrom: ['Publer Canva', 'Canva/VistaCreate media handoff'],
          evidence: '미디어 타입과 비율을 먼저 고르고 외부 디자인 도구에서 제작한 뒤 다시 예약 대시보드로 가져오는 운영',
          snapsSurface:
            'Creative Brief with media type, aspect ratio, design prompt, storyboard, SVG thumbnail, and Media library save handoff',
          status: 'implemented',
          operatorAction: '브랜드 컬러와 CTA로 브리프를 만든 뒤 썸네일을 미디어 라이브러리에 저장해 첨부/큐에 연결',
        },
        {
          id: 'visual-feed-planner',
          label: '비주얼 피드 플래너',
          copiedFrom: ['Later Visual Instagram Planner', 'Metricool Feed Preview', 'Planoly grid planner'],
          evidence: '예약/초안/게시물을 3열 프로필 그리드에서 미리보고 순서와 커버 조화를 확인하는 운영',
          snapsSurface:
            'Visual Feed Planner with square/vertical grid preview, draft dimming, media-library rows, and connected draft/schedule queue',
          status: 'implemented',
          operatorAction: '캠페인 커버와 미디어 자산을 피드 그리드로 확인한 뒤 승인 또는 큐 생성',
        },
        {
          id: 'first-comment-planner',
          label: '첫 댓글 플래너',
          copiedFrom: ['Metricool first comment scheduling', 'Buffer first comment', 'Publer first comment'],
          evidence: '캡션은 가볍게 두고 해시태그, 링크, 질문, 추가 맥락을 첫 댓글로 분리해 예약하는 운영',
          snapsSurface:
            'First Comment Planner with strategy preview, platform safety limits, and connected draft/schedule queue',
          status: 'implemented',
          operatorAction: '본문과 첫 댓글을 함께 확인하고 연결 채널이 있는 경우에만 초안/예약 큐 생성',
        },
        {
          id: 'hashtag-set-manager',
          label: '해시태그 세트 매니저',
          copiedFrom: ['Later Saved Captions & Hashtags', 'Planoly Hashtag Manager', 'Buffer Hashtag Manager'],
          evidence: '반복 사용하는 해시태그 그룹과 짧은 캡션 조각을 저장하고 포스트 캡션 또는 첫 댓글에 삽입하는 운영',
          snapsSurface:
            'Hashtag Set Manager with saved sets, platform tag limits, caption/first-comment placement, import/export, and connected draft/schedule queue',
          status: 'implemented',
          operatorAction: '캠페인 태그 묶음을 저장하고 플랫폼별 제한을 확인한 뒤 현재 결과 또는 발행 큐에 적용',
        },
        {
          id: 'hashtag-tracker',
          label: '해시태그 트래커',
          copiedFrom: ['Metricool Hashtag Tracker', 'Later Hashtag Suggestions'],
          evidence: '해시태그 사용량, 도달, 참여, 저장, 클릭 데이터를 보고 유지/테스트/교체 태그를 고르는 운영',
          snapsSurface:
            'Hashtag Tracker with CSV/JSON metric scoring, keep/test/replace actions, related pairings, and recommended hashtag-set save',
          status: 'implemented',
          operatorAction: '해시태그 성과 CSV나 현재 초안 태그를 분석한 뒤 추천 조합을 저장 세트로 전환',
        },
        {
          id: 'social-listening-monitor',
          label: '소셜 리스닝 모니터',
          copiedFrom: ['Hootsuite Listening', 'Sprout Social Listening', 'Metricool Hashtag Tracker', 'Buffer Community'],
          evidence: '브랜드명, 키워드, 해시태그, 경쟁 대안을 저장 검색으로 추적하고 sentiment, intent, noise를 나눠 대응하는 운영',
          snapsSurface:
            'Social Listening Monitor with CSV/JSON mention import, keyword/exclusion matching, intent clusters, high-intent inbox promotion, and workspace export',
          status: 'implemented',
          operatorAction: '캠페인 키워드와 public mention export를 붙여 high-intent 언급만 받은 반응함으로 승격',
        },
        {
          id: 'trend-radar',
          label: '트렌드 레이더',
          copiedFrom: ['Hootsuite Trend Research', 'Sprout Listening trend discovery', 'Metricool social media trends'],
          evidence: 'mentions, hashtags, keywords, competitor benchmarks, sentiment shifts를 묶어 상승/리스크/피로 트렌드를 발견하고 콘텐츠로 전환하는 운영',
          snapsSurface:
            'Trend Radar with CSV/JSON signal import, listening/competitor/hashtag evidence merge, velocity scoring, alerts, and Source Library handoff',
          status: 'implemented',
          operatorAction: '리스닝/경쟁/해시태그 신호를 레이더로 합쳐 오늘 대응할 트렌드와 원문 아이디어를 가져오기',
        },
        {
          id: 'post-preview-inspector',
          label: '게시 전 미리보기',
          copiedFrom: ['Hootsuite Post Preview', 'Hootsuite Link Preview troubleshooting', 'Publer AI alt text'],
          evidence: '플랫폼별 feed cutoff, hard character limit, link card metadata, media alt text를 게시 전 한 화면에서 확인하는 운영',
          snapsSurface:
            'Post Preview Inspector with platform mock cuts, link metadata warnings, alt-text suggestions, and editor handoff',
          status: 'implemented',
          operatorAction: '생성된 variants를 프리뷰로 확인하고 더보기 컷/링크 카드/alt text 경고를 편집기에 반영',
        },
        {
          id: 'media-library',
          label: '미디어 라이브러리',
          copiedFrom: ['Later Media Library', 'Publer Media Library'],
          evidence: '이미지, 영상, GIF, 캐러셀 자산을 저장하고 태그/대체 텍스트/채널 요구사항을 확인한 뒤 일정으로 보내는 운영',
          snapsSurface:
            'Media library, platform-fit checks, attach-to-variant handoff, connected draft/schedule queue',
          status: 'implemented',
          operatorAction: '캠페인 미디어를 저장하고 플랫폼 적합성 경고를 확인한 뒤 변환 결과 또는 큐에 첨부',
        },
        {
          id: 'viral-coach',
          label: 'AI 바이럴 코치',
          copiedFrom: ['Blotato Viral AI Coach', 'viral hook libraries'],
          evidence: '게시 전 훅, 문제/효익, 무음 이해도, 정보 밀도, 공유성, 해시태그를 점수화하는 운영',
          snapsSurface:
            'AI 바이럴 코치 scorecard, suggested hooks, hashtag plan, rewrite handoff',
          status: 'implemented',
          operatorAction: '초안 점수를 확인하고 약한 훅이면 제안 훅을 적용한 뒤 승인/발행 큐로 이동',
        },
        {
          id: 'post-variation-lab',
          label: '포스트 실험 랩',
          copiedFrom: ['SocialBee Post Variations', 'Buffer AI Assistant A/B experiments', 'FeedHive AI variations'],
          evidence: '같은 주제를 여러 훅, 각도, CTA로 바꿔 테스트하고 다음 사이클에 승자 변형을 쓰는 운영',
          snapsSurface:
            'Post Variation Lab with ranked hooks, hypotheses, metrics, source import, and connected draft/schedule queue',
          status: 'implemented',
          operatorAction: '성과 좋은 원문을 여러 실험 후보로 만들고 승자 변형만 원문 저장 또는 발행 큐에 연결',
        },
        {
          id: 'calendar-schedule',
          label: '캘린더/예약',
          copiedFrom: ['Buffer Publish', 'Later scheduler', 'Metricool planner'],
          evidence: '채널별 미리보기, 최적 시간, 캘린더 중심 예약 운영',
          snapsSurface: `Draft/schedule handoff for ${requestedPlatforms || 'selected platforms'}`,
          status: 'implemented',
          operatorAction: '연동 계정과 예약 시간을 확인한 뒤 초안 또는 예약 생성',
        },
        {
          id: 'ai-content-calendar',
          label: 'AI 콘텐츠 캘린더',
          copiedFrom: ['FeedHive Content Planner', 'Predis AI content calendar'],
          evidence: '캠페인 기둥, 대상, 목표, 형식을 날짜별 포스트 슬롯과 bulk schedule로 바꾸는 운영',
          snapsSurface:
            'AI Content Calendar planner, source import, connected draft/schedule queue',
          status: 'implemented',
          operatorAction: '캠페인 브리프를 날짜별 슬롯으로 만든 뒤 원문 저장 또는 연결 채널 큐 생성',
        },
        {
          id: 'content-category-queue',
          label: '콘텐츠 카테고리 큐',
          copiedFrom: ['SocialBee Content Categories', 'SocialBee category-based scheduling'],
          evidence: '교육, 프로모션, 사례 같은 버킷을 Posting Schedule에 연결해 균형 잡힌 콘텐츠 믹스를 반복하는 운영',
          snapsSurface:
            'Content Category Queue, evergreen/share-once buckets, source import, connected draft/schedule queue',
          status: 'implemented',
          operatorAction: '카테고리별 가중치와 순서를 정하고 원문 저장 또는 연결 채널 큐 생성',
        },
        {
          id: 'repurpose-queue',
          label: '소스 재배포 큐',
          copiedFrom: [
            'Repurpose.io auto publishing workflows',
            'FeedHive posting plans',
            'Buffer queue schedule',
          ],
          evidence:
            '소스 플랫폼의 새 콘텐츠를 future-only 또는 ASAP로 감지하고, 주간 포스팅 플랜/큐 슬롯에 맞춰 목적지 채널 초안으로 전환하는 운영',
          snapsSurface:
            'Repurpose Queue with source rows, future/existing filters, Check Now guidance, posting-plan slots, source import, and connected draft/schedule handoff',
          status: 'implemented',
          operatorAction:
            'YouTube/TikTok/블로그 원천 항목을 검수하고 ASAP 또는 포스팅 플랜 슬롯 기준으로 원문 저장/큐 생성',
        },
        {
          id: 'post-condition',
          label: '조건부 후속 포스트',
          copiedFrom: ['FeedHive Post Conditions', 'comment trigger workflows'],
          evidence: '성과 좋은 게시물에만 지연, 좋아요, 댓글, 노출, 참여율 조건으로 후속 CTA를 붙이는 운영',
          snapsSurface:
            'Conditional follow-up evaluator, source import, connected draft/schedule queue',
          status: 'implemented',
          operatorAction: '부모 게시물 지표를 평가하고 조건이 충족된 후속 CTA만 큐 생성',
        },
        {
          id: 'approval-workflow',
          label: '승인 워크플로우',
          copiedFrom: ['Buffer Approvals', 'Later Content Approvals', 'Publer approval access'],
          evidence: '팀/클라이언트가 게시 전 초안을 검토하고 승인 또는 수정 요청하는 흐름',
          snapsSurface: 'Approval request queue, review decisions, approved-only draft/schedule handoff',
          status: 'implemented',
          operatorAction: '변환 결과를 승인 요청으로 저장하고 승인된 항목만 발행 큐로 이동',
        },
        {
          id: 'analytics-report',
          label: '성과 리포트',
          copiedFrom: ['Buffer Analyze', 'Publer Analytics', 'Metricool reports'],
          evidence: '게시물/채널별 성과, 베스트 타임, 내보내기 가능한 보고서',
          snapsSurface: 'Report generator, provider analytics ingestion, Markdown/HTML/print export',
          status: 'implemented',
          operatorAction: '성과 데이터를 리포트로 만들고 다음 배치 액션으로 회수',
        },
        {
          id: 'competitor-import',
          label: '경쟁 데이터 인입',
          copiedFrom: ['Publer Competitor Analysis', 'Metricool Competitors'],
          evidence: '경쟁 계정의 팔로워, 성장, 참여, 게시 믹스를 비교하는 운영',
          snapsSurface:
            'Competitor public/export CSV or JSON import, profile merge, snapshot report',
          status: 'implemented',
          operatorAction: '공개/내보낸 경쟁 데이터를 붙여넣고 리포트로 다음 훅을 뽑기',
        },
        {
          id: 'engage-inbox',
          label: '댓글/반응 인박스',
          copiedFrom: ['Buffer Community', 'Metricool saved replies'],
          evidence: '댓글을 한 화면에서 분류하고 답글 템플릿으로 처리',
          snapsSurface: 'Feedback Inbox, reply draft, publish reply with provider capability checks',
          status: 'implemented',
          operatorAction: '가격/링크/협업 신호를 우선순위로 답글 초안 생성',
        },
        {
          id: 'inbox-assignment-router',
          label: '인박스 배정 라우터',
          copiedFrom: ['Hootsuite Inbox assignments', 'Sprout Smart Inbox cases'],
          evidence: '댓글/DM을 팀원이나 케이스로 배정하고 우선순위와 SLA를 정해 중복 응대를 줄이는 운영',
          snapsSurface:
            'Inbox Assignment Router with priority lanes, assignee roles, SLA due times, saved-answer matching, and customer-note context',
          status: 'implemented',
          operatorAction: '미해결 받은 반응을 역할별 케이스로 라우팅하고 답글 준비 또는 고객 메모로 이어가기',
        },
        {
          id: 'evergreen-recycle',
          label: '에버그린 재활용',
          copiedFrom: ['Publer Recycling', 'SocialBee evergreen variations', 'Metricool Autolist'],
          evidence: '성과 좋은 게시물을 변형해 반복 공유하는 운영',
          snapsSurface: 'Evergreen recycle preview, source import, connected draft/schedule queue',
          status: 'implemented',
          operatorAction: '성과 좋은 원문을 주기별 변형으로 만들고 연결 채널 큐를 확인',
        },
        {
          id: 'bulk-source',
          label: '대량 운영',
          copiedFrom: ['Publer bulk scheduling', 'SocialBee bulk imports'],
          evidence: 'CSV, 미디어 라이브러리, 콘텐츠 카테고리로 여러 게시물을 한 번에 준비',
          snapsSurface: 'Bulk campaign CSV preview, source import, connected draft/schedule queue',
          status: 'implemented',
          operatorAction: '캠페인 원문을 묶어 가져오고 채널별 초안을 배치로 검토',
        },
        {
          id: 'feed-source',
          label: 'RSS/콘텐츠 피드',
          copiedFrom: ['Publer RSS feeds', 'SocialBee RSS import', 'Buffer content feeds'],
          evidence: '웹사이트와 블로그의 새 글을 피드에서 가져와 미리보고 큐에 넣는 운영',
          snapsSurface: 'RSS/Atom feed preview, source import, connected draft/schedule queue',
          status: 'implemented',
          operatorAction: '피드 항목을 미리보고 원문 저장 또는 연결 채널 큐 생성',
        },
      ],
      moat: [
        '한국어 플랫폼 문법과 네이버 카페/블로그/카카오 보조 흐름을 제품 안에 고정',
        '샤오홍슈 같은 China-channel assist를 일반 영문 스케줄러보다 먼저 지원',
        'Ollama/RAG 기반으로 고객 데이터와 브랜드 보이스를 로컬 운영 가능',
        'Postiz 기반 게시 인프라를 살려 self-hostable SNS 운영 제품으로 포지셔닝',
      ],
      implementationNotes: [
        '경쟁서비스의 보호되는 UI/카피/자산은 복제하지 않고 검증된 워크플로우 패턴만 제품화합니다.',
        '실제 게시, 댓글 게시, 영상 생성은 operator confirmation 없이는 실행하지 않습니다.',
        '지원하지 않는 외부 API 기능은 자동 게시처럼 보이게 숨기지 않고 assist-only 또는 operator-assisted로 표시합니다.',
      ],
    };
  }

  private buildGoToMarketPlan(
    plan: SnapsAgentPlanDraft,
    strategy: SnapsAgentMarketingStrategy
  ): SnapsAgentGoToMarketPlan {
    const topic = plan.topic || 'SNS 운영 자동화';
    const primaryBuyer = plan.targetPlatforms.some((platform) =>
      ['naver-blog', 'naver-cafe', 'kakao-talk', 'xiaohongshu'].includes(platform)
    )
      ? '한국/아시아 채널을 운영하는 소형 브랜드와 대행사'
      : '콘텐츠를 여러 글로벌 SNS에 반복 배포하는 1인 창업자와 소형 마케팅팀';

    return {
      primaryBuyer,
      positioning:
        'Blotato식 AI 콘텐츠 공장에 한국 SNS 문법, self-host 운영, 성과-답글 회수 루프를 더한 실무형 snaps 오퍼',
      packages: [
        'Solo: 월 49,000원, 3개 브랜드, Ollama/RAG 변환, 쇼츠 대본, 기본 리포트',
        'Agency: 월 299,000원, 20개 브랜드, 팀 운영, 대량 워크스페이스 import/export, 리포트 export',
        'Done-with-you Setup: 1회 1,500,000원부터, 채널 연결, RAG 예시 50개, 첫 30일 콘텐츠 캘린더 구축',
        'Self-host Enterprise: 월 990,000원부터, 온프레미스/전용 DB, 보안 리뷰, 커스텀 SNS 보조',
      ],
      segments: [
        {
          id: 'solo-creator',
          label: '1인 크리에이터/창업자',
          pain: '한 원문을 여러 채널 문법에 맞추는 시간이 매주 사라짐',
          offer: `${topic} 원문 하나로 게시글, 쇼츠 대본, 반응 답글까지 묶은 주간 콘텐츠 팩`,
          channels: ['YouTube/Threads creator communities', 'Naver Cafe creator boards', 'X build-in-public'],
          firstPitch:
            '이번 주 원문 하나를 보내면 10개 채널 초안, 쇼츠 대본, 댓글 응대 기준까지 15분 안에 보여드립니다.',
          pricing: 'Solo 월 49,000원 또는 첫 세팅 300,000원',
          proofMetric: '주당 콘텐츠 준비 시간 5시간 절감',
        },
        {
          id: 'agency',
          label: '소형 마케팅 대행사',
          pain: '고객사별 톤과 채널이 달라 검수/수정 비용이 커짐',
          offer: '브랜드별 RAG 예시와 승인 전 컨펌 게이트가 있는 대행사용 작업대',
          channels: ['LinkedIn outreach', 'KakaoTalk 오픈채팅', 'Naver Blog case study'],
          firstPitch:
            '고객사 5곳의 월간 콘텐츠 운영을 하나의 승인 대시보드와 리포트 export로 줄여드립니다.',
          pricing: 'Agency 월 299,000원부터, 고객사 온보딩 별도',
          proofMetric: '고객사당 월 20개 초안 생성 및 리포트 1개 자동화',
        },
        {
          id: 'b2b-content-team',
          label: 'B2B/헬스케어 콘텐츠팀',
          pain: '전문 원문은 많은데 SNS 문법으로 바꾸는 사람이 부족함',
          offer: '전문 자료를 링크드인, 네이버 블로그, 카카오 공지, 쇼츠로 변환하는 검수형 워크플로우',
          channels: ['Industry newsletter sponsorship', 'Webinar', 'LinkedIn ABM'],
          firstPitch:
            '리포트 한 편을 영업용 SNS 자산과 세일즈 응답 스크립트로 재활용해 드립니다.',
          pricing: '월 990,000원부터 또는 부서 단위 연간 계약',
          proofMetric: '전문 리포트 1개당 12개 배포 자산 생성',
        },
        {
          id: 'automation-consultant',
          label: 'n8n/Make 자동화 컨설턴트',
          pain: '콘텐츠 생성은 되지만 SNS 게시/검수/성과 루프가 약함',
          offer: '노코드 자동화에 붙일 수 있는 snaps API와 컨펌 기반 게시 엔진',
          channels: ['n8n community', 'automation agency partnerships', 'GitHub/SDK docs'],
          firstPitch:
            'Blotato API가 비싼 고객에게 self-host 가능한 한국형 콘텐츠 게시 레이어를 붙여드립니다.',
          pricing: '리셀러 20% 또는 구현 프로젝트당 2,000,000원부터',
          proofMetric: '자동화 플로우당 수동 복붙 단계 4개 제거',
        },
      ],
      salesMotion: [
        '첫 접촉은 무료 Before/After 리라이트 샘플로 시작',
        '데모 워크스페이스를 가져와 20분 안에 원문 저장, 변환, 쇼츠, 리포트, 인박스 흐름을 시연',
        `수익모델은 ${strategy.revenueModels.join('/')} KPI로 고객별 전환 기준을 맞춤`,
        '2주 파일럿 후 주간 준비 시간, 승인 횟수, 초안 수, 댓글 신호를 리포트로 제시',
      ],
      pricingNotes: [
        'Blotato, Buffer, Publer류 SaaS 가격보다 비싼 이유는 한국 채널 세팅과 RAG 온보딩을 패키지로 팔기 때문',
        '플랫폼 API 정책상 실제 자동 게시가 제한되는 채널은 수동 보조와 컨펌형 운영으로 판매',
        '대행사에는 월 구독보다 고객사당 세팅비와 월 운영 리포트 add-on을 함께 제안',
      ],
    };
  }

  private buildScenarioRun(
    plan: SnapsAgentPlanDraft,
    strategy: SnapsAgentMarketingStrategy
  ): SnapsAgentScenarioRun {
    const topic = plan.topic || '콘텐츠 캠페인';
    const platforms = plan.targetPlatforms
      .map((platform) => snapsPlatformRules[platform]?.label || platform)
      .join(', ');
    return {
      scenario: `${topic} 원문 하나로 ${platforms}에 배포할 주간 캠페인을 만든다.`,
      persona: '직원 5명 이하 브랜드의 대표 또는 마케터가 원문만 들고 들어온 상황',
      sourceAsset: plan.sourceText.slice(0, 240),
      workflow: [
        'Source Library에 원문 저장',
        'RAG 예시를 참조해 플랫폼별 문안 생성',
        plan.includeShortVideo
          ? '쇼츠 대본과 업로드 메타데이터 생성'
          : '성과가 좋은 문안을 쇼츠 후보로 표시',
        plan.scheduleType === 'schedule'
          ? '예약 시간과 연동 계정 확인 후 schedule handoff'
          : '연동 가능한 채널에 draft handoff',
        '게시 후 analytics report로 우승 포맷 확인',
        'Feedback Inbox에서 링크/가격/협업 신호를 답글 초안으로 처리',
        '성과 좋은 게시물을 RAG와 evergreen recycle 후보로 회수',
      ],
      preparedOutputs: [
        `${plan.targetPlatforms.length}개 채널 초안`,
        `${strategy.revenueModels.join('/')} 기준 수익화 KPI`,
        `${strategy.engagementSignals.length}개 반응 신호 분류 기준`,
        plan.includeShortVideo ? '쇼츠 대본/스토리보드/업로드 메타데이터' : '후속 쇼츠 아이디어',
      ],
      validationChecklist: [
        '모든 게시/예약/댓글/영상 생성은 operator confirmation 뒤에만 실행',
        'assist-only 채널은 복사/수동 게시 체크리스트로 표시',
        '연동 계정이 없으면 경고와 draft-only 결과를 반환',
        '성과 리포트와 인박스는 다음 배치 소재로 다시 연결',
      ],
      expectedBusinessOutcome:
        '첫 파일럿에서는 게시 수보다 준비 시간 절감, 검수 회전 감소, 고전환 댓글 신호 수를 돈 받을 근거로 삼습니다.',
    };
  }

  private buildCampaignTimeline(
    plan: SnapsAgentPlanDraft,
    missingInputs: string[]
  ): SnapsAgentCampaignTimelineItem[] {
    const publishWindow =
      plan.scheduleType === 'schedule'
        ? plan.publishDateLocal || plan.publishDate || '예약 시간 확인 후'
        : '초안 승인 후';
    const needsInput = missingInputs.length > 0;

    return [
      {
        id: 'prepare',
        label: '준비',
        window: '지금',
        actions: [
          '채널별 문안, 해시태그, CTA 확인',
          '원문을 라이브러리에 저장해 재사용 가능하게 정리',
          ...(plan.includeShortVideo ? ['쇼츠 대본과 업로드 메타데이터 확인'] : []),
        ],
        status: 'ready',
      },
      {
        id: 'publish',
        label: plan.scheduleType === 'schedule' ? '예약' : '초안 생성',
        window: publishWindow,
        actions: [
          plan.scheduleType === 'schedule'
            ? '연동 계정과 예약 시간을 확인한 뒤 예약 생성'
            : '연동 가능한 채널에 초안 생성',
          'assist-only 채널은 수동 게시 체크리스트로 처리',
        ],
        status: needsInput ? 'needs-confirmation' : 'ready',
      },
      {
        id: 'monitor',
        label: '모니터링',
        window: '게시 후 1시간 / 24시간',
        actions: [
          '노출, 클릭, 저장, 댓글 추이를 보고서 입력값으로 수집',
          '반응이 빠른 채널을 다음 배치 우선순위로 표시',
        ],
        status: 'manual',
      },
      {
        id: 'engage',
        label: '반응 대응',
        window: '댓글 유입 즉시',
        actions: [
          '링크 요청, 가격 문의, 사용법 질문을 고전환 신호로 분류',
          '답글은 초안 생성 후 operator confirmation을 거쳐 게시',
        ],
        status: 'manual',
      },
      {
        id: 'repurpose',
        label: '재활용',
        window: '성과 확인 후',
        actions: [
          '성과 좋은 문안을 RAG 스타일 예시로 승격',
          plan.includeShortVideo
            ? '쇼츠 훅을 카드뉴스/스레드 후속 소재로 변환'
            : '후속 쇼츠 또는 카드뉴스 소재로 재구성',
        ],
        status: 'ready',
      },
    ];
  }

  private buildOperatorSummary(
    plan: SnapsAgentPlanDraft,
    missingInputs: string[]
  ) {
    return [
      `${plan.topic || '요청 주제'}를 ${plan.targetPlatforms.join(', ')}용 초안으로 변환했습니다.`,
      plan.scheduleType === 'schedule'
        ? `${plan.publishDateLocal || plan.publishDate || '시간 미정'} 예약 실행 전 확인이 필요합니다.`
        : '현재 단계에서는 초안으로만 준비합니다.',
      plan.includeShortVideo
        ? `${plan.shortVideoTargetPlatforms.join(', ')} 쇼츠 대본과 업로드 메타데이터를 함께 준비했습니다.`
        : '쇼츠 작업은 포함하지 않았습니다.',
      missingInputs.length
        ? `확인 필요: ${missingInputs.join(', ')}`
        : '컨펌 전 핵심 입력은 모두 채워졌습니다.',
    ];
  }

  private buildMissingInputs(plan: SnapsAgentPlanDraft) {
    const missing: string[] = [];
    if (plan.scheduleType === 'schedule' && !plan.publishDateLocal && !plan.publishDate) {
      missing.push('예약 시간');
    }
    if (plan.scheduleType === 'schedule') {
      missing.push('연동 계정 선택');
    }
    if (plan.targetPlatforms.includes('naver-cafe')) {
      missing.push('네이버 카페 ID/메뉴 ID');
    }
    if (plan.includeShortVideo) {
      missing.push('쇼츠 영상 생성 승인 또는 영상 URL');
    }
    return [...new Set(missing)];
  }

  private buildConfirmationChecklist(
    plan: SnapsAgentPlanDraft,
    missingInputs: string[]
  ): SnapsAgentConfirmationChecklistItem[] {
    const hasSchedule = plan.scheduleType === 'schedule';
    return [
      {
        id: 'content-preview',
        label: '문안 확인',
        detail: `${plan.targetPlatforms.length}개 채널의 제목, 본문, 해시태그 확인`,
        status: 'ready',
      },
      {
        id: 'account-connection',
        label: '연동 계정',
        detail: hasSchedule
          ? '예약 가능한 채널의 실제 연동 계정 선택'
          : '초안 생성용 연동 계정 선택',
        status: missingInputs.includes('연동 계정 선택') ? 'attention' : 'ready',
      },
      {
        id: 'publish-time',
        label: '게시 시간',
        detail: hasSchedule
          ? plan.publishDateLocal || plan.publishDate || '예약 시간 입력 필요'
          : '초안 모드',
        status: hasSchedule && !plan.publishDateLocal && !plan.publishDate
          ? 'attention'
          : 'ready',
      },
      {
        id: 'short-video',
        label: '쇼츠 자산',
        detail: plan.includeShortVideo
          ? `${plan.shortVideoTargetPlatforms.join(', ')}용 대본 확인 후 영상 생성 또는 URL 첨부`
          : '요청 없음',
        status: plan.includeShortVideo ? 'manual' : 'ready',
      },
      {
        id: 'final-confirmation',
        label: '최종 컨펌',
        detail: '실제 예약, 게시, 댓글 게시, 영상 업로드는 컨펌 후 실행',
        status: 'attention',
      },
    ];
  }

  private buildMarketingStrategy(
    plan: Omit<SnapsAgentPlanDraft, 'marketingStrategy' | 'executionPlan'>
  ): SnapsAgentMarketingStrategy {
    const revenueModels = this.detectRevenueModels(plan.command, plan.sourceText);
    const signals = this.buildEngagementSignals();
    const topic = plan.topic || '콘텐츠';
    const publishTarget = plan.targetPlatforms.join(', ');
    const scheduleText =
      plan.scheduleType === 'schedule'
        ? plan.publishDateLocal || plan.publishDate || '예약 시간 확인 필요'
        : '초안 저장';

    return {
      framework: 'Monetize-Publish-Engage-Create',
      inspiredBy: 'AiToEarn',
      revenueModels,
      lanes: [
        {
          lane: 'monetize',
          label: 'Monetize',
          goal: `${topic} 콘텐츠를 ${revenueModels.join('/')} 기준으로 추적 가능한 캠페인으로 묶습니다.`,
          actions: [
            '게시물마다 전환 CTA와 추적 링크 메모를 남깁니다.',
            '댓글/DM에서 구매 의도와 자료 요청을 우선 응대 대상으로 분리합니다.',
          ],
          kpis: this.revenueKpis(revenueModels),
          status: 'ready',
        },
        {
          lane: 'publish',
          label: 'Publish',
          goal: `${publishTarget} 채널에 맞춘 초안과 게시 일정을 준비합니다.`,
          actions: [
            `게시 방식: ${scheduleText}`,
            '실제 게시/예약은 미리보기 확인 후 operatorConfirmed=true일 때만 실행합니다.',
          ],
          kpis: ['예약 성공률', '채널별 게시 상태', '게시 후 첫 24시간 도달'],
          status: 'needs-confirmation',
        },
        {
          lane: 'engage',
          label: 'Engage',
          goal: '받은 반응함에서 고전환 댓글 신호를 찾아 답글 초안을 생성합니다.',
          actions: [
            `우선 신호: ${signals
              .slice(0, 4)
              .map((signal) => signal.label)
              .join(', ')}`,
            '답글은 초안으로 저장하고 실제 게시 전 별도 확인을 받습니다.',
          ],
          kpis: ['고전환 댓글 수', '답글 초안 처리율', '문의 응답 시간'],
          status: 'manual',
        },
        {
          lane: 'create',
          label: 'Create',
          goal: plan.includeShortVideo
            ? '게시글 변환과 쇼츠 대본을 함께 만들어 재사용 가능한 원본 자산으로 둡니다.'
            : '게시글 변환 결과를 원문/RAG/성과 리포트로 다시 회수할 수 있게 정리합니다.',
          actions: [
            '플랫폼별 문안, 해시태그, 설정을 생성합니다.',
            ...(plan.includeShortVideo
              ? ['쇼츠는 대본 우선으로 준비하고 영상 생성은 별도 작업으로 분리합니다.']
              : ['성과가 좋은 문안은 RAG 예시로 승격합니다.']),
          ],
          kpis: ['초안 생성 수', '재사용 자산 수', 'RAG 승격 후보 수'],
          status: 'ready',
        },
      ],
      engagementSignals: signals,
      batchIdeas: this.buildBatchIdeas(plan),
      mcpReadyActions: [
        'prepare_platform_variants',
        'prepare_short_video_script',
        'summarize_conversion_signals',
        'create_schedule_after_confirmation',
        'publish_reply_after_confirmation',
      ],
      operatorGuardrails: [
        '게시, 예약, 댓글 게시, 영상 업로드는 모두 컨펌 후 실행합니다.',
        '연동 채널이 없거나 assist-only 플랫폼이면 수동 게시 체크리스트로 남깁니다.',
        'AI가 만든 일정과 문안은 실제 계정/채널/시간을 화면에서 확인한 뒤 진행합니다.',
      ],
    };
  }

  private buildOperationPreview(
    plan: SnapsAgentCommandPlan,
    transform: SnapsTransformResult,
    video?: unknown
  ): SnapsAgentOperationPreview {
    const platformReadiness = this.buildPlatformReadiness(transform.variants);
    const qualityGates = this.buildQualityGates(
      plan,
      transform,
      platformReadiness,
      video
    );
    const readiness = this.buildReadiness(qualityGates);
    const attentionCount = platformReadiness.filter(
      (item) => item.status !== 'ready'
    ).length;
    const headline =
      plan.scheduleType === 'schedule'
        ? `${plan.publishDateLocal || plan.publishDate || '예약 시간 확인 필요'} 게시 전 컨펌 대기`
        : '초안 저장 전 컨펌 대기';

    return {
      status: 'requires_confirmation',
      progress: attentionCount ? 88 : 94,
      headline,
      progressSteps: [
        {
          id: 'thinking',
          label: '명령 이해',
          detail: '자연어 오더를 실행 계획으로 변환했습니다.',
          status: 'done',
          progress: 12,
        },
        {
          id: 'generating_content',
          label: '채널 초안 생성',
          detail: `${transform.variants.length}개 채널 문안과 설정을 준비했습니다.`,
          status: 'done',
          progress: 48,
        },
        {
          id: 'generating_video',
          label: '쇼츠 자산 준비',
          detail: plan.includeShortVideo
            ? `상태: ${this.videoStatus(video)}`
            : '요청된 쇼츠 작업이 없습니다.',
          status: plan.includeShortVideo ? 'done' : 'waiting',
          progress: 68,
        },
        {
          id: 'engage',
          label: '반응 대응 루프',
          detail: '고전환 댓글 신호와 답글 초안 루프를 연결했습니다.',
          status: 'done',
          progress: 82,
        },
        {
          id: 'confirmation',
          label: '작업자 확인',
          detail: '실제 게시, 예약, 댓글 게시, 영상 업로드는 확인 후 실행합니다.',
          status: 'active',
          progress: 94,
        },
      ],
      platformReadiness,
      readiness,
      qualityGates,
      recommendedActions: this.buildRecommendedActions(plan, readiness, qualityGates),
      nextActions: [
        '플랫폼별 미리보기 문안 확인',
        ...(attentionCount
          ? ['주의 또는 수동 처리 채널의 체크리스트 확인']
          : []),
        plan.includeShortVideo
          ? '쇼츠 대본 확인 후 영상 생성 또는 URL 첨부'
          : '성과가 좋은 문안을 RAG 예시로 승격',
        plan.scheduleType === 'schedule'
          ? '확인 후 예약 생성'
          : '확인 후 초안 저장',
      ],
      requiresConfirmation: true,
    };
  }

  private buildQualityGates(
    plan: SnapsAgentCommandPlan,
    transform: SnapsTransformResult,
    platformReadiness: SnapsAgentPlatformReadiness[],
    video?: unknown
  ): SnapsAgentQualityGate[] {
    const gates: SnapsAgentQualityGate[] = [];

    if (plan.scheduleType === 'schedule' && !plan.publishDateLocal && !plan.publishDate) {
      gates.push({
        id: 'publish-time',
        label: '예약 시간 누락',
        detail: '예약 실행에는 명확한 게시 시간이 필요합니다.',
        severity: 'blocker',
        fixAction: '게시 시간을 입력한 뒤 다시 확인하세요.',
      });
    }

    for (const readiness of platformReadiness) {
      for (const blocker of readiness.blockers) {
        gates.push({
          id:
            readiness.publishMode === 'assist'
              ? 'manual-publish'
              : 'content-length',
          label:
            readiness.publishMode === 'assist'
              ? `${readiness.label} 수동 보조`
              : `${readiness.label} 제한 확인`,
          detail: blocker,
          severity: readiness.publishMode === 'assist' ? 'info' : 'warning',
          platform: readiness.platform,
          fixAction:
            readiness.publishMode === 'assist'
              ? '복사/수동 게시 체크리스트로 처리하세요.'
              : '문안을 줄이거나 플랫폼별 설정을 조정하세요.',
        });
      }
    }

    for (const variant of transform.variants) {
      if (!this.hasUsefulCta(variant.content)) {
        gates.push({
          id: 'missing-cta',
          label: `${variant.label} CTA 약함`,
          detail: '댓글, 저장, 신청, 문의, 링크 확인 같은 다음 행동이 뚜렷하지 않습니다.',
          severity: 'warning',
          platform: variant.platform,
          fixAction: '게시 전 채널 톤에 맞는 CTA를 한 문장 추가하세요.',
        });
      }
    }

    if (plan.includeShortVideo && this.videoStatus(video) !== 'completed') {
      gates.push({
        id: 'short-video-asset',
        label: '쇼츠 영상 미확정',
        detail: `현재 쇼츠 상태는 ${this.videoStatus(video)}입니다. 실제 업로드에는 영상 URL 또는 Pixelle 완료 결과가 필요합니다.`,
        severity: 'info',
        fixAction: '쇼츠 작업대로 보내 영상 생성 또는 영상 URL 첨부를 완료하세요.',
      });
    }

    gates.push({
      id: 'operator-confirmation',
      label: '최종 컨펌 필요',
      detail: 'snaps는 실제 게시, 예약, 댓글 게시, 영상 업로드를 작업자 확인 후에만 실행합니다.',
      severity: 'info',
      fixAction: '미리보기와 계정/시간을 확인한 뒤 초안 또는 예약 생성 버튼을 누르세요.',
    });

    return gates.slice(0, 20);
  }

  private buildReadiness(
    qualityGates: SnapsAgentQualityGate[]
  ): SnapsAgentReadiness {
    const blockers = qualityGates.filter((gate) => gate.severity === 'blocker');
    const warnings = qualityGates.filter((gate) => gate.severity === 'warning');
    const score = Math.max(
      0,
      Math.min(100, 100 - blockers.length * 28 - warnings.length * 9)
    );
    const level: SnapsAgentReadinessLevel = blockers.length
      ? 'needs-input'
      : warnings.length
      ? 'manual-review'
      : 'ready';
    return {
      score,
      level,
      summary: blockers.length
        ? `${blockers.length}개 입력이 막고 있습니다.`
        : warnings.length
        ? `${warnings.length}개 품질 항목을 확인하면 바로 진행할 수 있습니다.`
        : '컨펌만 받으면 실행 가능한 상태입니다.',
    };
  }

  private buildRecommendedActions(
    plan: SnapsAgentCommandPlan,
    readiness: SnapsAgentReadiness,
    qualityGates: SnapsAgentQualityGate[]
  ): SnapsAgentRecommendedAction[] {
    const hasBlocker = qualityGates.some((gate) => gate.severity === 'blocker');
    const actions: SnapsAgentRecommendedAction[] = [
      {
        id: 'review-preview',
        label: '채널 미리보기 검토',
        detail: '가장 먼저 플랫폼별 문안, 제목, 해시태그를 확인합니다.',
        actionType: 'review-preview',
        priority: 'high',
        enabled: true,
      },
    ];

    if (readiness.level === 'needs-input') {
      actions.push({
        id: 'resolve-inputs',
        label: '막힌 입력 해결',
        detail: readiness.summary,
        actionType: 'resolve-inputs',
        priority: 'high',
        enabled: true,
      });
    }

    actions.push(
      {
        id: 'save-source',
        label: '원문 저장',
        detail: '이번 오더의 원문과 주제를 라이브러리에 남깁니다.',
        actionType: 'save-source',
        priority: 'medium',
        enabled: true,
      }
    );

    if (plan.includeShortVideo) {
      actions.push({
        id: 'send-shorts',
        label: '쇼츠 작업대로 이동',
        detail: '대본, 대상 플랫폼, 예약 시간을 쇼츠 작업대에 넘깁니다.',
        actionType: 'send-shorts',
        priority: 'high',
        enabled: true,
      });
    }

    actions.push(
      {
        id: 'copy-brief',
        label: '운영 브리프 복사',
        detail: '팀 검토나 외부 확인용으로 전체 브리프를 복사합니다.',
        actionType: 'copy-brief',
        priority: 'medium',
        enabled: true,
      },
      {
        id: 'create-drafts',
        label: plan.scheduleType === 'schedule' ? '컨펌 후 예약 생성' : '초안 생성',
        detail: hasBlocker
          ? '막힌 입력을 해결한 뒤 실행하세요.'
          : '연동 계정이 준비된 채널에 초안 또는 예약을 생성합니다.',
        actionType: 'create-drafts',
        priority: hasBlocker ? 'low' : 'high',
        enabled: !hasBlocker,
      },
      {
        id: 'monitor-feedback',
        label: '게시 후 반응 루프',
        detail: '댓글을 받은 반응함으로 가져와 전환 신호와 답글 초안을 만듭니다.',
        actionType: 'monitor-feedback',
        priority: 'low',
        enabled: true,
      }
    );

    return actions;
  }

  private hasUsefulCta(content: string) {
    return /(댓글|저장|공유|팔로우|문의|신청|구매|링크|자료|확인|dm|comment|save|share|follow|link|learn more|sign up|buy|apply)/i.test(
      content
    );
  }

  private buildPlatformReadiness(
    variants: SnapsVariant[]
  ): SnapsAgentPlatformReadiness[] {
    return variants.map((variant) => {
      const rule = snapsPlatformRules[variant.platform];
      const contentLength = snapsContentLength(
        variant.platform,
        [
          variant.title || '',
          variant.content || '',
          ...(Array.isArray(variant.hashtags) ? variant.hashtags : []),
        ]
          .join(' ')
          .trim()
      );
      const blockers: string[] = [];
      const checks = [
        `${contentLength}/${rule.maxLength}자`,
        `${rule.publishMode === 'assist' ? '수동 보조' : '예약 가능'} 채널`,
      ];

      if (contentLength > rule.maxLength) {
        blockers.push(`${rule.label} 제한보다 ${contentLength - rule.maxLength}자 깁니다.`);
      }
      if (rule.publishMode === 'assist') {
        blockers.push('자동 예약 대신 수동 게시 체크리스트가 필요합니다.');
      }
      if (!variant.content.trim()) {
        blockers.push('본문이 비어 있습니다.');
      }

      return {
        platform: variant.platform,
        label: rule.label,
        publishMode: rule.publishMode,
        status: blockers.length
          ? rule.publishMode === 'assist'
            ? 'manual'
            : 'attention'
          : 'ready',
        checks,
        blockers,
      };
    });
  }

  private videoStatus(video: unknown) {
    if (!video || typeof video !== 'object') {
      return 'not-requested';
    }
    const record = video as Record<string, unknown>;
    return this.cleanText(record.status, 80) || 'script-ready';
  }

  private detectRevenueModels(
    command: string,
    sourceText: string
  ): SnapsAgentRevenueModel[] {
    const text = `${command} ${sourceText}`.toLowerCase();
    const models: SnapsAgentRevenueModel[] = [];
    if (/(구매|판매|매출|전환|신청|결제|자료\s*링크|구매\s*링크|신청\s*링크|링크\s*(주세요|줘|있나요|있어|공유|보내|달라|필요)|affiliate|sale|purchase|order|cps|\blink\b|\burl\b)/i.test(text)) {
      models.push('CPS');
    }
    if (/(댓글|반응|참여|좋아요|팔로우|문의|협업|engage|comment|follow|cpe)/i.test(text)) {
      models.push('CPE');
    }
    if (/(조회|노출|인지도|도달|view|impression|reach|awareness|cpm)/i.test(text)) {
      models.push('CPM');
    }
    if (!models.length) {
      models.push('CPE', 'CPM');
    }
    if (models.includes('CPS') && !models.includes('CPE')) {
      models.push('CPE');
    }
    return [...new Set(models)];
  }

  private revenueKpis(models: SnapsAgentRevenueModel[]) {
    const kpis: string[] = [];
    if (models.includes('CPS')) {
      kpis.push('구매/신청 전환');
    }
    if (models.includes('CPE')) {
      kpis.push('댓글/저장/공유/팔로우');
    }
    if (models.includes('CPM')) {
      kpis.push('조회수/도달/노출');
    }
    return kpis.length ? kpis : ['참여율', '도달'];
  }

  private buildEngagementSignals(): SnapsAgentEngagementSignal[] {
    return [
      {
        id: 'link-request',
        label: '링크 요청',
        priority: 'high',
        triggerExamples: ['링크 주세요', '자료 어디서 봐요?', 'URL 있나요?'],
        action: '관련 링크나 신청 경로를 담은 답글 초안을 우선 생성합니다.',
      },
      {
        id: 'purchase-intent',
        label: '구매/신청 의도',
        priority: 'high',
        triggerExamples: ['어떻게 구매해요?', '신청 가능한가요?', '주문하고 싶어요'],
        action: '전환 CTA, DM 유도, 후속 안내 문구를 분리해 준비합니다.',
      },
      {
        id: 'pricing',
        label: '가격 문의',
        priority: 'high',
        triggerExamples: ['가격이 얼마인가요?', '요금제 있나요?', '비용 궁금해요'],
        action: '가격 안내 가능 범위와 상담 유도 답글을 구분합니다.',
      },
      {
        id: 'how-to-use',
        label: '사용법 질문',
        priority: 'medium',
        triggerExamples: ['어떻게 쓰나요?', '방법 알려주세요', '가이드 있나요?'],
        action: '짧은 사용법 답글과 후속 튜토리얼 콘텐츠 후보를 만듭니다.',
      },
      {
        id: 'brand-mention',
        label: '브랜드 언급',
        priority: 'medium',
        triggerExamples: ['브랜드명 언급', '@계정 태그', '서비스 비교'],
        action: '브랜드 모니터링 대상으로 표시하고 톤을 맞춘 대응 초안을 둡니다.',
      },
      {
        id: 'collaboration',
        label: '협업 문의',
        priority: 'medium',
        triggerExamples: ['협업 문의', '제휴 가능?', '광고 진행'],
        action: '협업 응대 템플릿과 연락 채널 안내를 준비합니다.',
      },
    ];
  }

  private buildBatchIdeas(
    plan: Omit<SnapsAgentPlanDraft, 'marketingStrategy' | 'executionPlan'>
  ) {
    const topic = plan.topic || this.detectTopic(plan.command) || '요청 주제';
    return [
      `${topic} 문제-해결형 게시글 3개 변주`,
      `${topic} 실험담/전문가/체크리스트 톤 A/B 초안`,
      plan.includeShortVideo
        ? `${topic} 쇼츠 훅 3개와 15초/30초 버전 대본`
        : `${topic} 카드뉴스/스레드 후속 소재`,
      `${plan.targetPlatforms.slice(0, 3).join(', ')} 채널별 CTA 문구 비교`,
    ];
  }

  private detectTargetPlatforms(command: string): SnapsTargetPlatform[] {
    const lower = command.toLowerCase();
    const platforms: SnapsTargetPlatform[] = [];
    const add = (platform: SnapsTargetPlatform, patterns: RegExp[]) => {
      if (patterns.some((pattern) => pattern.test(lower))) {
        platforms.push(platform);
      }
    };

    add('instagram', [/인스타/, /instagram/, /\big\b/, /릴스/, /reels?/]);
    add('threads', [/스레드/, /threads?/]);
    add('bluesky', [/블루스카이/, /블스/, /bluesky/, /\bbsky\b/]);
    add('facebook', [/페이스북/, /facebook/, /\bfb\b/, /메타\s*페이지/]);
    add('pinterest', [/핀터레스트/, /pinterest/, /\bpin\b/, /핀\s*보드/]);
    add('linkedin', [/링크드인/, /linkedin/]);
    add('youtube', [/유튜브/, /youtube/]);
    add('tiktok', [/틱톡/, /tiktok/]);
    add('xiaohongshu', [/샤오홍슈/, /소홍서/, /xiaohongshu/, /\bxhs\b/, /rednote/, /小红书/]);
    add('x', [/트위터/, /\bx\b/, /twitter/]);
    add('naver-blog', [/네이버\s*블로그/, /naver\s*blog/]);
    add('naver-cafe', [/네이버\s*카페/, /naver\s*cafe/]);
    add('kakao-talk', [/카카오/, /카톡/, /kakao/]);

    return this.mergePlatforms(
      platforms.length ? platforms : normalizeTargetPlatforms()
    );
  }

  private detectShortVideo(command: string) {
    return /쇼츠|shorts?|숏폼|릴스|reels?|틱톡|tiktok/i.test(command);
  }

  private detectShortVideoTargets(
    command: string,
    targetPlatforms: SnapsTargetPlatform[]
  ): SnapsTargetPlatform[] {
    if (!this.detectShortVideo(command)) {
      return [];
    }

    const lower = command.toLowerCase();
    const platforms: SnapsTargetPlatform[] = [];
    if (/쇼츠|shorts?|유튜브|youtube/.test(lower)) {
      platforms.push('youtube');
    }
    if (/인스타|instagram|\big\b|릴스|reels?/.test(lower)) {
      platforms.push('instagram');
    }
    if (/틱톡|tiktok|숏폼/.test(lower)) {
      platforms.push('tiktok');
    }
    if (targetPlatforms.includes('instagram')) {
      platforms.push('instagram');
    }
    if (/숏폼/.test(lower)) {
      platforms.push('youtube', 'instagram', 'tiktok');
    }

    return this.cleanVideoTargetPlatforms(
      platforms,
      /쇼츠|shorts?/i.test(command) ? ['youtube'] : ['instagram']
    );
  }

  private detectPublishDate(
    command: string,
    now: Date,
    timezoneOffsetMinutes: number
  ) {
    const normalized = command.replace(/\s+/g, ' ');
    const dateOffset = /모레/.test(normalized)
      ? 2
      : /내일/.test(normalized)
      ? 1
      : /오늘/.test(normalized)
      ? 0
      : undefined;
    const explicitDate = normalized.match(
      /(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/
    );
    const timeMatch = normalized.match(
      /(오전|오후|아침|저녁|밤)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분?)?/
    );

    if (dateOffset === undefined && !explicitDate && !timeMatch) {
      return undefined;
    }

    const local = this.localParts(now, timezoneOffsetMinutes);
    const target = {
      year: local.year,
      month: local.month,
      day: local.day,
      hour: 10,
      minute: 0,
    };
    if (explicitDate) {
      target.year = Number(explicitDate[1]);
      target.month = Number(explicitDate[2]) - 1;
      target.day = Number(explicitDate[3]);
    } else {
      target.day += dateOffset || 0;
    }

    if (timeMatch) {
      const marker = timeMatch[1] || '';
      let hour = Number(timeMatch[2]);
      const minute = Number(timeMatch[3] || 0);
      if ((marker === '오후' || marker === '저녁' || marker === '밤') && hour < 12) {
        hour += 12;
      }
      if (marker === '오전' && hour === 12) {
        hour = 0;
      }
      target.hour = hour;
      target.minute = minute;
    }

    return this.fromLocalParts(target, timezoneOffsetMinutes).toISOString();
  }

  private detectTopic(command: string) {
    const related = command.match(/([가-힣A-Za-z0-9\s]{2,80}?)\s*관련/);
    if (related?.[1]) {
      return `${related[1].trim()} 관련`;
    }
    const about = command.match(/(?:주제|내용|소재)\s*[:：]?\s*([^\n,]+)$/);
    return about?.[1]?.trim().slice(0, 80) || '';
  }

  private detectTone(command: string) {
    if (/웃기|유머|재밌|밈|funny/i.test(command)) {
      return '한국 SNS에 맞는 자연스럽고 약간 유머 있는 톤';
    }
    if (/전문|비즈니스|b2b|링크드인|linkedin/i.test(command)) {
      return '플랫폼별로 자연스럽고, LinkedIn은 전문적인 인사이트 톤';
    }
    return '한국 나노 인플루언서 스타일';
  }

  private buildFallbackSourceText(
    command: string,
    topic: string,
    includeShortVideo: boolean
  ) {
    const cleaned = command
      .replace(/오늘|내일|모레/g, '')
      .replace(/오전|오후|아침|저녁|밤/g, '')
      .replace(/\d{1,2}\s*시(?:\s*\d{1,2}\s*분?)?/g, '')
      .replace(/올려줘|게시해줘|예약해줘|작성해서|만들어서/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const core = cleaned.length >= 12
      ? cleaned
      : `${topic || '요청한 주제'}에 대한 SNS 게시글을 작성합니다.`;

    return [
      core,
      includeShortVideo
        ? '같은 메시지를 짧고 웃기게 볼 수 있는 세로 쇼츠로도 재구성합니다.'
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private looksLikePublishIntent(command: string) {
    return /올려|게시|발행|예약|upload|publish|post/i.test(command);
  }

  private cleanPlatformArray(value: unknown): SnapsTargetPlatform[] {
    const values = Array.isArray(value) ? value : [];
    return values
      .map((item) => this.cleanText(item, 80).toLowerCase())
      .filter((platform): platform is SnapsTargetPlatform =>
        (snapsTargetPlatforms as readonly string[]).includes(platform)
      );
  }

  private mergePlatforms(platforms: SnapsTargetPlatform[]) {
    return [...new Set(platforms)].filter((platform): platform is SnapsTargetPlatform =>
      (snapsTargetPlatforms as readonly string[]).includes(platform)
    );
  }

  private cleanVideoTargetPlatforms(
    value: unknown,
    fallback: SnapsTargetPlatform[]
  ): SnapsTargetPlatform[] {
    const values = Array.isArray(value) ? value : [];
    const normalized = values
      .map((item) => this.cleanText(item, 80).toLowerCase())
      .filter((platform): platform is SnapsTargetPlatform =>
        (videoPlatforms as readonly string[]).includes(platform)
      );
    return [...new Set(normalized.length ? normalized : fallback)].filter(
      (platform): platform is SnapsTargetPlatform =>
        (videoPlatforms as readonly string[]).includes(platform)
    );
  }

  private cleanVideoPlatform(
    value: unknown,
    fallback: SnapsAgentShortVideoPlatform
  ): SnapsAgentShortVideoPlatform {
    const platform = this.cleanText(value, 80).toLowerCase();
    return (videoPlatforms as readonly string[]).includes(platform)
      ? (platform as SnapsAgentShortVideoPlatform)
      : fallback;
  }

  private pickShortVideoPlatform(
    platforms: SnapsTargetPlatform[]
  ): SnapsAgentShortVideoPlatform {
    const first = platforms.find((platform) =>
      (videoPlatforms as readonly string[]).includes(platform)
    );
    return (first || 'youtube') as SnapsAgentShortVideoPlatform;
  }

  private cleanStringArray(value: unknown, maxLength: number, maxItems: number) {
    return Array.isArray(value)
      ? value
          .map((item) => this.cleanText(item, maxLength))
          .filter(Boolean)
          .slice(0, maxItems)
      : [];
  }

  private cleanPublishDate(value: unknown, timezoneOffsetMinutes: number) {
    const text = this.cleanText(value, 120);
    if (!text) {
      return '';
    }
    const localDateTime = text.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})T(\d{1,2}):(\d{1,2})/
    );
    const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(text);
    if (localDateTime && !hasTimezone) {
      return this.fromLocalParts(
        {
          year: Number(localDateTime[1]),
          month: Number(localDateTime[2]) - 1,
          day: Number(localDateTime[3]),
          hour: Number(localDateTime[4]),
          minute: Number(localDateTime[5]),
        },
        timezoneOffsetMinutes
      ).toISOString();
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  }

  private defaultPublishDate(now: Date, timezoneOffsetMinutes: number) {
    const local = this.localParts(now, timezoneOffsetMinutes);
    return this.fromLocalParts(
      {
        ...local,
        hour: local.hour + 1,
        minute: 0,
      },
      timezoneOffsetMinutes
    ).toISOString();
  }

  private toLocalInputValue(date: Date, timezoneOffsetMinutes: number) {
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return new Date(date.getTime() - timezoneOffsetMinutes * 60000)
      .toISOString()
      .slice(0, 16);
  }

  private parseNow(value: unknown) {
    if (typeof value === 'string' && value.trim()) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return new Date();
  }

  private cleanTimezoneOffset(value: unknown, now: Date) {
    const offset = value === undefined || value === null || value === '' ? NaN : Number(value);
    // API, SDK, and MCP callers often omit the offset; fall back to the workspace
    // timezone rather than the server's (Docker runs in UTC).
    return Number.isFinite(offset) && Math.abs(offset) <= 14 * 60
      ? offset
      : snapsTimezoneOffsetMinutes(now);
  }

  private localParts(date: Date, timezoneOffsetMinutes: number) {
    const shifted = new Date(date.getTime() - timezoneOffsetMinutes * 60000);
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth(),
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
    };
  }

  private fromLocalParts(
    parts: {
      year: number;
      month: number;
      day: number;
      hour: number;
      minute: number;
    },
    timezoneOffsetMinutes: number
  ) {
    return new Date(
      Date.UTC(parts.year, parts.month, parts.day, parts.hour, parts.minute, 0, 0) +
        timezoneOffsetMinutes * 60000
    );
  }

  private cleanText(value: unknown, maxLength = 1000) {
    let raw = '';
    if (typeof value === 'string') {
      raw = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      raw = String(value);
    } else if (Array.isArray(value)) {
      raw = value
        .map((item) => this.cleanText(item, maxLength))
        .filter(Boolean)
        .join(' ');
    }

    return raw.trim().replace(/\s+/g, ' ').slice(0, maxLength);
  }
}
