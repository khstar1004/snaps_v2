import { BadRequestException, Injectable } from '@nestjs/common';
import { OllamaClient } from '@gitroom/nestjs-libraries/snaps/ai/ollama.client';
import { SnapsContentTransformService } from '@gitroom/nestjs-libraries/snaps/transform/content-transform.service';
import {
  normalizeTargetPlatforms,
  SnapsTargetPlatform,
  snapsPlatformRules,
  snapsTargetPlatforms,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import { SnapsShortVideoService } from '@gitroom/nestjs-libraries/snaps/video/short-video.service';
import {
  SnapsTransformResult,
  SnapsVariant,
} from '@gitroom/nestjs-libraries/snaps/dto/transform-result.dto';

type SnapsAgentScheduleType = 'draft' | 'schedule';
type SnapsAgentShortVideoPlatform = 'instagram' | 'youtube' | 'tiktok';
type SnapsAgentRevenueModel = 'CPS' | 'CPE' | 'CPM';
type SnapsAgentMarketingLane = 'monetize' | 'publish' | 'engage' | 'create';
type SnapsAgentSignalPriority = 'high' | 'medium' | 'low';
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

export type SnapsAgentOperationPreview = {
  status: SnapsAgentRunStatus;
  progress: number;
  headline: string;
  progressSteps: SnapsAgentProgressStep[];
  platformReadiness: SnapsAgentPlatformReadiness[];
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
  marketingStrategy: SnapsAgentMarketingStrategy;
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
> & {
  marketingStrategy?: SnapsAgentMarketingStrategy;
  executionPlan?: SnapsAgentExecutionStep[];
  operatorSummary?: string[];
  missingInputs?: string[];
  confirmationChecklist?: SnapsAgentConfirmationChecklistItem[];
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
      body?.timezoneOffsetMinutes
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
    timezoneOffsetMinutes = new Date().getTimezoneOffset()
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
    return {
      ...plan,
      marketingStrategy,
      operatorSummary:
        plan.operatorSummary || this.buildOperatorSummary(plan, missingInputs),
      missingInputs,
      confirmationChecklist:
        plan.confirmationChecklist ||
        this.buildConfirmationChecklist(plan, missingInputs),
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

  private buildPlatformReadiness(
    variants: SnapsVariant[]
  ): SnapsAgentPlatformReadiness[] {
    return variants.map((variant) => {
      const rule = snapsPlatformRules[variant.platform];
      const contentLength = [
        variant.title || '',
        variant.content || '',
        ...(Array.isArray(variant.hashtags) ? variant.hashtags : []),
      ]
        .join(' ')
        .trim().length;
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

  private cleanTimezoneOffset(value: unknown) {
    const offset = Number(value);
    return Number.isFinite(offset) && Math.abs(offset) <= 14 * 60
      ? offset
      : new Date().getTimezoneOffset();
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
