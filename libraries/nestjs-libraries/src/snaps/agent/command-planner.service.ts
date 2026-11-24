import { BadRequestException, Injectable } from '@nestjs/common';
import { SNAPS_DEFAULT_TIMEZONE_OFFSET_MINUTES } from '@gitroom/nestjs-libraries/snaps/time/default-timezone';
import { snapsWeightedLength } from '@gitroom/nestjs-libraries/snaps/text/weighted-length';
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
  SnapsCardNewsDeck,
  SnapsCardNewsService,
} from '@gitroom/nestjs-libraries/snaps/cardnews/card-news.service';
import {
  SnapsTransformResult,
  SnapsVariant,
} from '@gitroom/nestjs-libraries/snaps/dto/transform-result.dto';
import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';
import { snapsComposeHangul } from '@gitroom/nestjs-libraries/snaps/text/compose-hangul';

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
  /**
   * Which path decided this plan, matching the label every other snaps result
   * carries. The plan is what picks the target channels, the schedule and
   * whether card news and shorts are produced, so a keyword-matched fallback
   * standing in for the model changes what actually gets published - and it
   * was indistinguishable from an understood command.
   */
  provider: 'ollama' | 'deepseek' | 'rule-fallback';
  command: string;
  intent: 'prepare-and-confirm';
  sourceText: string;
  topic?: string;
  tone: string;
  targetPlatforms: SnapsTargetPlatform[];
  scheduleType: SnapsAgentScheduleType;
  publishDate?: string;
  publishDateLocal?: string;
  /**
   * The offset `publishDateLocal` is rendered in, as `Date.getTimezoneOffset()`
   * reports it - KST is -540.
   *
   * The workspace sends the browser's offset; the chat tool cannot know one
   * and so gets the KST default. Measured on the same command: the chat
   * path scheduled 01:00Z where a UTC browser scheduled 10:00Z - nine hours
   * apart - and `publishDateLocal` read `10:00` in both, so nothing in the
   * answer showed which assumption had been made.
   */
  publishTimezoneOffsetMinutes?: number;
  includeShortVideo: boolean;
  shortVideoPlatform: SnapsAgentShortVideoPlatform;
  shortVideoTargetPlatforms: SnapsTargetPlatform[];
  includeCardNews: boolean;
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
  cardNews?: SnapsCardNewsDeck;
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
  includeCardNews: unknown;
  assumptions: unknown;
}>;

/**
 * How an operator writes each channel's name.
 *
 * At module scope rather than inside detectTargetPlatforms() because asksFor()
 * needs the same words: a denial written behind a different channel belongs to
 * that channel, and telling them apart means knowing what a channel name looks
 * like. Two copies of this list would drift, and the one asksFor() read would
 * be the one nobody remembered to update.
 */
const SNAPS_CHANNEL_WORDS: Array<[SnapsTargetPlatform, RegExp[]]> = [
  ['instagram', [/인스타/, /instagram/, /\big\b/, /릴스/, /reels?/]],
  // 쓰레드 is how the app's name is written at least as often as 스레드.
  ['threads', [/스레드/, /쓰레드/, /threads?/]],
  ['linkedin', [/링크드인/, /linkedin/]],
  ['youtube', [/유튜브/, /youtube/]],
  ['tiktok', [/틱톡/, /tiktok/]],
  [
    'xiaohongshu',
    [/샤오홍슈/, /소홍서/, /레드노트/, /xiaohongshu/, /\bxhs\b/, /rednote/, /小红书/],
  ],
  // 엑스 is the Korean name of the platform and was not read at all, so
  // `엑스에 올려줘` fell through to the default set and published to four
  // channels the operator had not asked for. 엑스레이 is excluded because
  // it is a different word that happens to start the same way.
  ['x', [/트위터/, /트윗/, /엑스(?!레이)/, /\bx\b/, /twitter/]],
  ['naver-blog', [/네이버\s*블로그/, /naver\s*blog/]],
  // `네이버 블로그랑 카페에만 올릴 거야` named two channels and planned one:
  // 카페 only counted with 네이버 in front of it. Bare 카페 is a common noun,
  // so it counts only where a destination particle follows it - 카페에,
  // 카페로 - which is how a channel is named in a command and not how the
  // word appears in `카페 관련 내용으로`.
  ['naver-cafe', [/네이버\s*카페/, /naver\s*cafe/, /카페(?=에|로)/]],
  ['kakao-talk', [/카카오/, /카톡/, /kakao/]],
];

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

/**
 * The words that name an output format rather than a subject.
 *
 * Both lists were written out twice already, at
 * the places that decide whether to build each. trimTopic() needs the same
 * vocabulary - `주제: 겨울 코트 추천을 카드뉴스로 만들어줘` names its format
 * with the same particle that names a subject, so 카드뉴스 was read as part
 * of the subject - and a third and fourth copy is how lists like this
 * drift apart.
 */
const SNAPS_SHORT_VIDEO_WORDS = /쇼츠|숏츠|shorts?|숏폼|릴스|reels?|틱톡|tiktok/i;
const SNAPS_CARD_NEWS_WORDS = /카드뉴스|카드 뉴스|card\s?news|캐러셀|carousel/i;

/** Anything the operator could be refusing: a channel, or a format. */
const SNAPS_TOPIC_WORDS = new RegExp(
  [
    ...SNAPS_CHANNEL_WORDS.flatMap(([, patterns]) => patterns),
    SNAPS_SHORT_VIDEO_WORDS,
    SNAPS_CARD_NEWS_WORDS,
  ]
    .map((pattern) => pattern.source)
    .join('|'),
  'i'
);

const SNAPS_DENIAL_WORDS =
  /(만들지\s*마|만들지\s*말|하지\s*마|하지\s*말|빼고|빼줘|없이|제외|말고|아니고|필요\s*없)/;

/**
 * A refusal said as a prohibition, attached to the format it refuses.
 *
 * `금지`, `보류` and `중단` were missing from the denial words, so `카드뉴스
 * 금지` read as a *request* - and since a request now decides the flag outright,
 * the operator who wrote 금지 got card news. The publish-intent detector had
 * the same gap and was widened the same way.
 *
 * Anchored to the keyword rather than searched for in the window the denial
 * words use, because these three are ordinary content words: `카드뉴스로 서비스
 * 중단 안내 만들어줘` and `쇼츠로 주차 금지 안내 만들어줘` are requests, and a
 * window would read them as refusals. Only `<format>(은|는|이|가)? 금지` counts.
 */
const SNAPS_PROHIBITION = /^\s*(은|는|이|가)?\s*(금지|보류|중단)/;

/** Asking for the formal register, which Korean marks explicitly. */
const SNAPS_FORMAL_WORDS = /정중|격식|공손|존댓말|높임말|정중히/;

@Injectable()
export class SnapsCommandPlannerService {
  constructor(
    private readonly ollama: OllamaClient,
    private readonly transformer: SnapsContentTransformService,
    private readonly shortVideo: SnapsShortVideoService,
    private readonly cardNews: SnapsCardNewsService
  ) {}

  async prepare(
    organizationId: string,
    body?: SnapsAgentCommandRequest
  ): Promise<SnapsAgentPrepareResult> {
    const command = this.cleanText(body?.command, 4000);
    if (command.length < 5) {
      throw new BadRequestException('에이전트 명령은 최소 5자 이상이어야 합니다.');
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
          `쇼츠 영상 생성에 실패해 대본만 준비했습니다: ${
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

    // Card news is prepared as a script-only deck, mirroring how short-form
    // video stops at the script unless the operator explicitly asks to render:
    // rendering slides uploads real media, so it stays a separate operator step.
    let cardNews: SnapsCardNewsDeck | undefined;
    if (plan.includeCardNews) {
      try {
        cardNews = await this.cardNews.script({
          sourceText: plan.sourceText,
          tone: plan.tone,
        });
      } catch (error) {
        warnings.push(
          `카드뉴스 덱 준비에 실패했습니다: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    const preparedPlan = {
      ...plan,
      targetPlatforms: allTargetPlatforms,
    };

    return {
      plan: preparedPlan,
      transform,
      operation: this.buildOperationPreview(preparedPlan, transform, video, cardNews),
      ...(video ? { video } : {}),
      ...(cardNews ? { cardNews } : {}),
      warnings: [
        ...warnings,
        ...(plan.includeShortVideo
          ? [
              '쇼츠 영상은 초안 자산으로만 준비됩니다. 예약하려면 운영자 확인이 필요합니다.',
            ]
          : []),
        ...(cardNews
          ? [
              '카드뉴스는 대본까지만 준비됩니다. 슬라이드 이미지 생성과 첨부에는 운영자 확인이 필요합니다.',
            ]
          : []),
      ],
    };
  }

  async plan(
    command: string,
    now = new Date(),
    timezoneOffsetMinutes = SNAPS_DEFAULT_TIMEZONE_OFFSET_MINUTES
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
              includeCardNews: 'boolean',
              assumptions: ['string'],
            },
            rules: [
              'If the user asks to post, publish, upload, or schedule at a time, scheduleType is schedule, but confirmation is still required later.',
              'Do not include platforms the user clearly excluded.',
              'If the user says Shorts or 쇼츠, include youtube as a short-video target. If Instagram is also requested, include instagram as a short-video target too.',
              'If the user says 릴스 or Reels, include instagram as a short-video target.',
              'If the user says TikTok or 틱톡, include tiktok as a short-video target.',
              // Without this rule the model reads includeCardNews from the field
              // name alone and gets 캐러셀/carousel wrong. detectCardNews() does
              // not rescue it: normalizeOllamaPlan keeps any boolean the model
              // returns, so the deterministic detector only runs when the field
              // is missing entirely.
              'If the user says 카드뉴스, 카드 뉴스, card news, 캐러셀, or carousel, set includeCardNews to true. Set it to false when the user asks not to make one.',
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
    // What the operator wrote down wins. The model is interpreting the same
    // command, so when the command names channels outright it cannot know
    // better - measured, a command reading `엑스에만` came back planned for
    // instagram and linkedin because the model said so.
    const namedPlatforms = this.namedTargetPlatforms(command);
    const targetPlatforms = namedPlatforms.length
      ? namedPlatforms
      : this.mergePlatforms(this.cleanPlatformArray(payload.targetPlatforms));
    // Both directions, not just the refusal. A command that names the format
    // is as explicit as one that rules it out, and only the refusal was
    // outranking the model: measured, `유튜브 쇼츠로 만들어줘` with a model
    // answering `includeShortVideo: false` produced a plan with no video at
    // all, so the operator who typed the words got nothing back and no reason
    // why. The model decides when the command is silent, which is what it is
    // there for.
    const includeShortVideo = this.refuses(command, SNAPS_SHORT_VIDEO_WORDS)
      ? false
      : this.asksFor(command, SNAPS_SHORT_VIDEO_WORDS)
      ? true
      : typeof payload.includeShortVideo === 'boolean'
      ? payload.includeShortVideo
      : fallback.includeShortVideo;
    // Same rule as the channels above: a video channel the command names is a
    // fact from the operator's own words. Measured, `유튜브 쇼츠로 만들어줘`
    // came back planned for tiktok because the model said so, which is a video
    // built to the wrong specification.
    const namedVideoPlatforms = this.namedShortVideoPlatforms(command);
    const shortVideoPlatform = namedVideoPlatforms.length
      ? this.pickShortVideoPlatform(namedVideoPlatforms)
      : this.cleanVideoPlatform(
          payload.shortVideoPlatform,
          fallback.shortVideoPlatform
        );
    const shortVideoTargetPlatforms = namedVideoPlatforms.length
      ? this.cleanVideoTargetPlatforms(
          namedVideoPlatforms,
          fallback.shortVideoTargetPlatforms
        )
      : this.cleanVideoTargetPlatforms(
          payload.shortVideoTargetPlatforms,
          fallback.shortVideoTargetPlatforms
        );
    // A refusal is as explicit as a request: `카드뉴스는 만들지 마` used to
    // produce card news whether the model agreed or not - and for three
    // revisions this comment said "as explicit as a request" while only the
    // refusal was honoured. Same shape as the video above.
    const includeCardNews = this.refuses(command, SNAPS_CARD_NEWS_WORDS)
      ? false
      : this.asksFor(command, SNAPS_CARD_NEWS_WORDS)
      ? true
      : typeof payload.includeCardNews === 'boolean'
      ? payload.includeCardNews
      : fallback.includeCardNews;
    // Same rule for the time. The command's own words are parsed by
    // detectPublishDate; the model moved a plan that read `내일 오후 3시` to
    // 2030 simply by saying so.
    // What the operator's own words resolved to always wins; that part was
    // already settled. What was not: a date the *model* supplied is a
    // guess, and a guess in the past used to go straight into the plan.
    // The publishing builder refuses a past time now, so the operator met
    // an error about a moment they never chose, at the schedule step,
    // having typed no time at all. A model date behind the clock is
    // dropped and the default is used instead.
    const operatorPublishDate = this.cleanPublishDate(
      fallback.publishDate || '',
      timezoneOffsetMinutes
    );
    const modelPublishDate = this.cleanPublishDate(
      payload.publishDate,
      timezoneOffsetMinutes
    );
    const parsedPublishDate =
      operatorPublishDate ||
      (modelPublishDate &&
      new Date(modelPublishDate).getTime() >= now.getTime()
        ? modelPublishDate
        : '');
    const scheduleType = this.refusesToPublish(command)
      ? 'draft'
      : payload.scheduleType === 'schedule' ||
        fallback.scheduleType === 'schedule'
      ? 'schedule'
      : 'draft';
    const finalPublishDate =
      scheduleType === 'schedule'
        ? parsedPublishDate ||
          fallback.publishDate ||
          this.defaultPublishDate(now, timezoneOffsetMinutes)
        : undefined;

    return this.withExecutionPlan({
      // The engine that actually answered; was the literal 'ollama'.
      provider: this.ollama.provider(),
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
            publishTimezoneOffsetMinutes: timezoneOffsetMinutes,
          }
        : {}),
      includeShortVideo,
      shortVideoPlatform,
      shortVideoTargetPlatforms,
      includeCardNews,
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
      // Keyword matching stood in for the model here, so the channels, the
      // schedule and whether card news runs were all decided by rules.
      provider: 'rule-fallback',
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
            publishTimezoneOffsetMinutes: timezoneOffsetMinutes,
          }
        : {}),
      includeShortVideo,
      shortVideoPlatform: this.pickShortVideoPlatform(shortVideoTargetPlatforms),
      shortVideoTargetPlatforms,
      includeCardNews: this.detectCardNews(command),
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
    video?: unknown,
    cardNews?: SnapsCardNewsDeck
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
          id: 'generating_card_news',
          label: '카드뉴스 대본 준비',
          detail: plan.includeCardNews
            ? cardNews
              ? `대본 ${cardNews.slides.length}장 준비됨. 이미지 렌더링은 확인 후 진행합니다.`
              : '카드뉴스 대본 준비에 실패했습니다. 경고를 확인하세요.'
            : '요청된 카드뉴스 작업이 없습니다.',
          status: plan.includeCardNews ? (cardNews ? 'done' : 'blocked') : 'waiting',
          progress: 74,
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
        ...(cardNews ? ['카드뉴스 대본 확인 후 슬라이드 이미지 생성'] : []),
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
      // X counts units, not characters - Hangul weighs two - so a 200
      // character Korean post is 400 to X and is refused at publish. Comparing
      // characters against 280 reported it as ready. Where the rule declares a
      // weighted limit, that is what decides and what is shown.
      const limit = rule.weightedLimit ?? rule.maxLength;
      const measured = rule.weightedLimit
        ? snapsWeightedLength(
            [
              variant.title || '',
              variant.content || '',
              ...(Array.isArray(variant.hashtags) ? variant.hashtags : []),
            ]
              .join(' ')
              .trim()
          )
        : contentLength;
      const blockers: string[] = [];
      const checks = [
        rule.weightedLimit
          ? `${measured}/${limit}자 분량 (한글 2자)`
          : `${contentLength}/${rule.maxLength}자`,
        `${rule.publishMode === 'assist' ? '수동 보조' : '예약 가능'} 채널`,
      ];

      if (measured > limit) {
        blockers.push(`${rule.label} 제한보다 ${measured - limit}자 깁니다.`);
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
      // Card news is a real pipeline now, so only suggest it as a manual idea
      // when this run did not already prepare a deck.
      plan.includeShortVideo
        ? `${topic} 쇼츠 훅 3개와 15초/30초 버전 대본`
        : plan.includeCardNews
        ? `${topic} 카드뉴스 슬라이드별 후킹 문구 대안`
        : `${topic} 카드뉴스/스레드 후속 소재`,
      `${plan.targetPlatforms.slice(0, 3).join(', ')} 채널별 CTA 문구 비교`,
    ];
  }

  /**
   * The channels the command itself names, empty when it names none.
   *
   * detectTargetPlatforms() answers with the default set in that case, which
   * is right for planning and useless for telling the two situations apart.
   * The difference matters: a channel the operator wrote down is a fact from
   * their own words, and the model was answering about the same command.
   */
  private namedTargetPlatforms(command: string): SnapsTargetPlatform[] {
    const detected = this.detectTargetPlatforms(command);
    const defaults = this.mergePlatforms(normalizeTargetPlatforms());
    return detected.join(',') === defaults.join(',') ? [] : detected;
  }

  private detectTargetPlatforms(command: string): SnapsTargetPlatform[] {
    const lower = command.toLowerCase();
    const platforms: SnapsTargetPlatform[] = [];
    // asksFor(), not test(): a channel the operator named in order to rule it
    // out was being added anyway. `인스타그램 말고 스레드에만 올려줘` planned
    // Instagram and Threads - the one channel the command excluded by name,
    // plus the one it asked for. The exclusion vocabulary was already written
    // for the card news and shorts flags; it just was not applied here.
    const add = (platform: SnapsTargetPlatform, patterns: RegExp[]) => {
      if (patterns.some((pattern) => this.asksFor(lower, pattern))) {
        platforms.push(platform);
      }
    };

    for (const [platform, patterns] of SNAPS_CHANNEL_WORDS) {
      add(platform, patterns);
    }

    return this.mergePlatforms(
      platforms.length ? platforms : normalizeTargetPlatforms()
    );
  }

  /**
   * Whether a keyword is asked for or refused.
   *
   * The detectors matched the word and stopped there, so `카드뉴스는 만들지
   * 마` read as a request for card news - the operator's explicit refusal
   * produced the very thing they refused. A denial marker close after the
   * keyword flips it: measured across ten phrasings, including `빼고`, `없이`,
   * `제외하고` and `말고`, which is how a refusal is actually written.
   */
  private asksFor(command: string, keyword: RegExp) {
    const match = keyword.exec(command);
    if (!match) {
      return false;
    }
    const rest = command.slice(match.index + match[0].length);
    // Attached to the keyword, so a content word further along is not read as
    // an instruction.
    if (SNAPS_PROHIBITION.test(rest)) {
      return false;
    }
    const after = rest.slice(0, 14);
    const denial = SNAPS_DENIAL_WORDS.exec(after);
    if (!denial) {
      return true;
    }
    // Whose refusal is it. A fixed window reads whatever is written behind the
    // keyword, including a refusal of something else: measured, `인스타에
    // 올리고 쇼츠는 빼줘` read 빼줘 as Instagram's, dropped the one channel the
    // operator named and published to the default four instead, and `쇼츠로
    // 만들고 카드뉴스는 빼줘` made no video. If another topic stands between
    // the keyword and the denial, the denial is that topic's.
    const other = SNAPS_TOPIC_WORDS.exec(after);
    return !!other && other.index < denial.index;
  }

  /** True only when the command refuses the keyword outright. */
  private refuses(command: string, keyword: RegExp) {
    return keyword.test(command) && !this.asksFor(command, keyword);
  }

  private detectShortVideo(command: string) {
    // 숏츠 is the same word as 쇼츠 and was the one spelling that missed.
    return this.asksFor(command, SNAPS_SHORT_VIDEO_WORDS);
  }

  private detectCardNews(command: string) {
    return this.asksFor(command, SNAPS_CARD_NEWS_WORDS);
  }

  /**
   * The video channels the command itself names, empty when it names none.
   *
   * detectShortVideoTargets() also folds in the post's own target platforms
   * and fans `숏폼` out to all three, which is right for planning and wrong
   * for deciding whether the operator actually chose a channel. `숏폼` is a
   * format, not a channel, so it is not a naming here.
   */
  private namedShortVideoPlatforms(command: string): SnapsTargetPlatform[] {
    if (!this.detectShortVideo(command)) {
      return [];
    }
    const lower = command.toLowerCase();
    const named: SnapsTargetPlatform[] = [];
    if (/쇼츠|숏츠|shorts?|유튜브|youtube/.test(lower)) {
      named.push('youtube');
    }
    if (/인스타|instagram|\big\b|릴스|reels?/.test(lower)) {
      named.push('instagram');
    }
    if (/틱톡|tiktok/.test(lower)) {
      named.push('tiktok');
    }
    return named;
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
    if (/쇼츠|숏츠|shorts?|유튜브|youtube/.test(lower)) {
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
    const dateOffset = /글피/.test(normalized)
      ? 3
      : /모레/.test(normalized)
      ? 2
      : /내일/.test(normalized)
      ? 1
      : /오늘/.test(normalized)
      ? 0
      : undefined;
    const explicitDate = normalized.match(
      /(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/
    );
    // The year left out, which is how a date is usually written in Korean.
    // Only the four-digit form was read, so the month and the day were thrown
    // away and the plan quietly used today: `12월 25일 오전 9시에 올려줘`
    // scheduled nine o'clock this morning.
    const monthDay = explicitDate
      ? null
      : normalized.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
    // Weekdays were not read either, so `다음 주 월요일 오전 10시에 올려줘`
    // published this morning instead.
    const weekdayMatch =
      explicitDate || monthDay
        ? null
        : normalized.match(/(다음|담|이번|금)?\s*주?\s*([월화수목금토일])요일/);
    // `시(?!간)`: `시간` is a duration, not a clock hour. Measured, `1시간
    // 뒤에 올려줘` matched the `시` inside `시간` and was planned for one
    // o'clock - said at 2pm it came out as 01:00 the next day, eleven hours
    // from what the operator asked for and on the wrong date. There is no
    // relative-offset parsing here, so the honest outcome is to read no time
    // at all and let the default stand.
    //
    // `반` is half past. It was not read, so `3시 반에 올려줘` planned 3:00 -
    // the operator said 반 and the plan dropped it in silence.
    const timeMatch = normalized.match(
      /(오전|오후|아침|저녁|밤|새벽)?\s*(\d{1,2})\s*시(?!간)(?:\s*(\d{1,2})\s*분?|\s*(반))?/
    );
    // Said as words rather than a number. Without these the operator's time
    // was dropped and the plan silently used the 10:00 default: `내일 자정에
    // 올려줘` scheduled 10:00 the next morning.
    const wordTime = timeMatch ? null : normalized.match(/(자정|정오)/);

    if (
      dateOffset === undefined &&
      !explicitDate &&
      !monthDay &&
      !weekdayMatch &&
      !timeMatch &&
      !wordTime
    ) {
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
    } else if (monthDay) {
      target.month = Number(monthDay[1]) - 1;
      target.day = Number(monthDay[2]);
      // A date already gone this year means the next one. Nobody schedules a
      // post into the past on purpose, and December said in May is the only
      // reading that leaves the request meaningful.
      const passed =
        target.month < local.month ||
        (target.month === local.month && target.day < local.day);
      if (passed) {
        target.year += 1;
      }
    } else if (weekdayMatch) {
      const names = ['일', '월', '화', '수', '목', '금', '토'];
      const wanted = names.indexOf(weekdayMatch[2]);
      const today = new Date(
        Date.UTC(local.year, local.month, local.day)
      ).getUTCDay();
      const qualifier = weekdayMatch[1] || '';
      if (qualifier === '다음' || qualifier === '담') {
        // The weekday of the following calendar week, not simply the next one
        // to come round: said on a Tuesday, 다음 주 금요일 is ten days away,
        // not three. Weeks start on Monday here, as they do on the calendar
        // this product ships.
        const toThisMonday = -((today + 6) % 7);
        target.day += toThisMonday + 7 + ((wanted + 6) % 7);
      } else if (qualifier === '이번') {
        // Literally this week's one, which can be behind us. That is what was
        // asked for, and the planner already accepts a past hour today.
        const toThisMonday = -((today + 6) % 7);
        target.day += toThisMonday + ((wanted + 6) % 7);
      } else {
        // Bare, or 금주: the next one to come round, today included.
        target.day += (wanted - today + 7) % 7;
      }
    } else {
      target.day += dateOffset || 0;
    }

    if (timeMatch) {
      const marker = timeMatch[1] || '';
      let hour = Number(timeMatch[2]);
      const minute = timeMatch[4] ? 30 : Number(timeMatch[3] || 0);
      // Twelve is the exception in both directions and has to be settled
      // first. 밤 12시 and 새벽 12시 are midnight in Korean, not noon - the
      // old order sent `오늘 밤 12시에 올려줘` out at lunchtime, twelve hours
      // early. 오후 12시 stays noon.
      if (
        hour === 12 &&
        (marker === '오전' || marker === '밤' || marker === '새벽')
      ) {
        hour = 0;
        // 밤 12시 is the midnight that ENDS the named day, so it belongs to
        // the next date. Reading it as 00:00 of the named day put the post
        // fourteen hours in the past: `오늘 밤 12시에 올려줘`, said at 2pm,
        // resolved to this morning's midnight and was scheduled behind the
        // clock. 새벽 12시 and 오전 12시 do start the named day, so they stay.
        if (marker === '밤') {
          target.day += 1;
        }
      } else if (
        (marker === '오후' || marker === '저녁' || marker === '밤') &&
        hour < 12
      ) {
        hour += 12;
      }
      target.hour = hour;
      target.minute = minute;
    } else if (wordTime) {
      target.hour = wordTime[1] === '정오' ? 12 : 0;
      target.minute = 0;
    }

    const resolved = this.fromLocalParts(target, timezoneOffsetMinutes);
    // Only a time of day was named, and it has already gone by. The next one
    // is the only reading that leaves the request meaningful - the same
    // reasoning the 월/일 branch above applies a year at a time. A command
    // that named a day is left alone: `이번 주 월요일` can be behind us and
    // that is what was asked for.
    const namedNoDay =
      dateOffset === undefined &&
      !explicitDate &&
      !monthDay &&
      !weekdayMatch &&
      (!!timeMatch || !!wordTime);
    if (namedNoDay && resolved.getTime() <= now.getTime()) {
      target.day += 1;
      return this.fromLocalParts(target, timezoneOffsetMinutes).toISOString();
    }

    return resolved.toISOString();
  }

  /**
   * The subject the operator named, as they named it.
   *
   * Measured on seven ways of saying it; four came back wrong.
   *
   * - `소재는 환절기 면역력 관리야` gave `는 환절기 면역력 관리야`. Only
   *   `:` was allowed after the keyword, so the Korean topic particle was
   *   captured as part of the subject.
   * - `주제: 가을 과일 추천을 인스타에 올려줘` gave the whole rest of the
   *   command, instruction included, as the subject.
   * - `주제: 가을 과일, 톤은 친근하게` gave **nothing**. The capture was
   *   anchored to the end of the string and could not cross a comma, so a
   *   comma anywhere later meant no match at all and the subject was
   *   dropped in silence.
   * - Sentence endings like `이야` stayed on the end.
   */
  private detectTopic(rawCommand: string) {
    // Composed first: every pattern below names the composed syllable block, so
    // a decomposed command lost its subject without saying anything.
    const command = snapsComposeHangul(rawCommand);
    const related = command.match(/([가-힣A-Za-z0-9\s]{2,80}?)\s*관련/);
    if (related?.[1]) {
      return `${related[1].trim()} 관련`;
    }

    // The keyword, then a colon or a Korean particle, then the subject up
    // to a comma, a newline or the end - not only to the end.
    const about = command.match(
      /(?:주제|내용|소재)\s*(?:[:：]|은|는|이|가|을|를)?\s*([^\n,]+)/
    );
    return snapsClampText(this.trimTopic(about?.[1] || ''), 80);
  }

  /**
   * Drops the instruction that follows the subject, and its sentence
   * ending.
   *
   * The particle attaches to the word in Korean, and which particle it is
   * decides whether that word belongs to the subject:
   *
   * - `주제를 환절기 건강으로 해줘` - 으로 marks what to make it about, so
   *   건강 is part of the subject and only the particle goes.
   * - `주제: 가을 과일 추천을 인스타에 올려줘` - 에 marks where to send it,
   *   so 인스타 is not part of the subject and the whole word goes.
   */
  private trimTopic(value: string) {
    const words = value.trim().split(/\s+/).filter(Boolean);
    const VERB = /(해|만들|써|정리|올려|게시|예약|업로드|뽑)/;
    const MEANS = /(으로|로)$/;
    const DESTINATION = /(에다|에게|에)$/;

    for (let index = 0; index < words.length - 1; index += 1) {
      if (!VERB.test(words[index + 1])) {
        continue;
      }
      if (MEANS.test(words[index])) {
        const stem = words[index].replace(MEANS, '');
        // 으로 usually marks what to make it about, but not when the word
        // names a format: `카드뉴스로 만들어줘` says how, not what.
        if (
          SNAPS_CARD_NEWS_WORDS.test(stem) ||
          SNAPS_SHORT_VIDEO_WORDS.test(stem)
        ) {
          words.length = index;
          break;
        }
        words.length = stem ? index + 1 : index;
        if (stem) {
          words[index] = stem;
        }
        break;
      }
      if (DESTINATION.test(words[index])) {
        words.length = index;
        break;
      }
    }

    return words
      .join(' ')
      .replace(/(?:이야|이에요|예요|입니다|이다|야)$/, '')
      .replace(/[은는이가을를]$/, '')
      .trim();
  }

  /**
   * The tone the command asked for.
   *
   * The default is a casual nano-influencer style, which is the opposite
   * register to the one Korean marks with 정중/격식/존댓말. Measured, five ways
   * of asking for the formal register - `정중하게 써줘`, `격식 있게 써줘`,
   * `공손하게 부탁해`, `존댓말로 써줘`, `높임말로 작성해줘` - all fell through
   * to the casual default, so the operator asked for one register and the plan
   * specified its opposite without saying so.
   *
   * Read through asksFor() rather than a bare test, so `격식 없이 써줘` stays
   * casual - the same refusal handling the format and channel words get.
   */
  private detectTone(command: string) {
    if (/웃기|유머|재밌|밈|funny/i.test(command)) {
      return '한국 SNS에 맞는 자연스럽고 약간 유머 있는 톤';
    }
    if (this.asksFor(command, SNAPS_FORMAL_WORDS)) {
      return '정중한 존댓말과 격식 있는 문장으로, 과한 줄임말과 이모지는 자제';
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

  /**
   * Whether the command says outright not to publish.
   *
   * scheduleType merged with an OR - `model === 'schedule' || fallback ===
   * 'schedule'` - so the model could only ever escalate a draft into a
   * schedule. Measured: `초안으로만 만들어줘. 올리지는 마.` with a model
   * answering `scheduleType: 'schedule'` produced a scheduled plan with an
   * invented publish time, which is the difference between a post that goes
   * out and one that does not.
   *
   * The verb stems are spelled out rather than matching a bare `지 마`, which
   * would fire on `페이지 마감` and `이미지 마스크`. Measured across twelve
   * phrasings, six refusals and six ordinary requests, with no false positive.
   */
  /**
   * Whether the command rules out publishing.
   *
   * The list was written from the imperative forms only, so three ordinary
   * ways of saying it fell through and the plan came back as `schedule`:
   * `예약은 필요 없어`, `게시는 안 해도 돼`, and the `-지는 말아줘` form, which
   * the `-지 마` patterns missed because of the topic particle between them.
   */
  /**
   * Whether the command says not to publish, in any of the ways it is said.
   *
   * Measured on commands that both prepare something and refuse to send it -
   * the shape an operator actually types, because they describe the work and
   * then set the limit. Four of five went out anyway:
   *
   *   내일 올려야 하는데 오늘은 포스팅 금지야   -> published
   *   예약 글 준비해줘. 업로드는 하지 마.       -> published
   *   게시할 내용 정리해줘. 게시는 하지 말고.    -> published
   *   발행용 원고 써줘. 발행은 보류.           -> published
   *
   * The publish word in the first half matched the intent test, and none of
   * these refusals matched, so the plan published what the operator had just
   * said not to send. The simple forms - `올리지 마`, `초안으로만` - were the
   * only ones read.
   */
  private refusesToPublish(command: string) {
    // Saying the draft is all that is wanted.
    if (/(초안으로만|초안만|초안으로|저장만|드래프트만)/.test(command)) {
      return true;
    }
    // Telling it not to: -지 마 / -지 말- with an optional topic particle.
    if (
      /(올리|게시하|발행하|업로드하|예약하|포스팅하)지\s*(는|은)?\s*(마|말)/.test(
        command
      )
    ) {
      return true;
    }
    // The noun form with the verb split off it, which is how the refusal is
    // usually written when the command also says what to prepare: `업로드는
    // 하지 마`, `게시는 하지 말고`. The pattern above wants the stem and `지
    // 마` joined - `업로드하지 마` - so these read as no refusal at all.
    if (
      /(올리기|게시|발행|업로드|예약|포스팅)\s*(은|는|이|가)?\s*하지\s*(는|은)?\s*(마|말)/.test(
        command
      )
    ) {
      return true;
    }
    // Said as a prohibition or a hold rather than as an instruction not to.
    if (
      /(올리기|게시|발행|업로드|예약|포스팅)\s*(은|는|이|가)?\s*(금지|보류|중단)/.test(
        command
      )
    ) {
      return true;
    }
    // `올리면 안 돼` - the conditional form.
    if (
      /(올리|게시하|발행하|업로드하|예약하|포스팅하)면\s*안\s*(돼|되|된다|됩니다)/.test(
        command
      )
    ) {
      return true;
    }
    // Saying it is not needed, which is not an imperative at all.
    return /(예약|게시|발행|업로드|포스팅|올리기)\s*(은|는|이|가)?\s*(필요\s*없|안\s*해도|하지\s*않아도|없어도)/.test(
      command
    );
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

  /**
   * The offset the planner interprets a local publish time in.
   *
   * The workspace sends the operator's browser offset, and that is what should
   * be used. The fallback is for callers that omit it, and it used to be
   * `new Date().getTimezoneOffset()` - the offset of whatever host the backend
   * runs on. Only the Pixelle service sets `TZ` in docker-compose.yaml; the
   * snaps backend does not, so on a normal Linux container that fallback was
   * UTC and a model-supplied local time like "2026-05-10T14:00" was scheduled
   * nine hours away from the 14:00 the operator read. Deployment location is
   * not a scheduling decision, so the default is stated here instead: KST, the
   * timezone this Korean-first product is built for and the one its tests use.
   */
  private cleanTimezoneOffset(value: unknown) {
    const offset = Number(value);
    return Number.isFinite(offset) && Math.abs(offset) <= 14 * 60
      ? offset
      : SNAPS_DEFAULT_TIMEZONE_OFFSET_MINUTES;
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

    return snapsClampText(raw.trim().replace(/\s+/g, ' '), maxLength);
  }
}
