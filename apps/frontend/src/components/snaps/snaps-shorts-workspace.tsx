'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ConnectedIntegration,
  confirmOperatorAction,
  defaultPublishDate,
  snapsPublishDateProblem,
} from '@gitroom/frontend/components/snaps/snaps-workspace.shared';
import {
  SnapsShortsScript,
  SnapsStoryboardScene,
  SnapsVideoResult,
  snapsShortsHandoffKey,
  readSnapsShortsMakerScript,
  readSnapsShortsPoll,
  SnapsShortsMakerScriptAnswer,
  snapsShortsBadges,
  SnapsShortsBadgeTone,
} from '@gitroom/frontend/components/snaps/snaps-shorts.shared';
import {
  readSnapsError,
  withSnapsJsonHeaders,
} from '@gitroom/frontend/components/snaps/snaps-fetch.helpers';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { describeSnapsAttachResult } from '@gitroom/frontend/components/snaps/snaps-workspace.shared';

const videoTargetPlatforms = [
  { id: 'instagram', label: 'Instagram Reels' },
  { id: 'youtube', label: 'YouTube Shorts' },
  { id: 'tiktok', label: 'TikTok' },
] as const;

type VideoTargetPlatform = (typeof videoTargetPlatforms)[number]['id'];
const videoTargetPlatformIds = videoTargetPlatforms.map(
  (platform) => platform.id
);
type SnapsVideoMode = 'html_render' | 'ai_generation';

type SnapsShortsHealth = {
  ok?: boolean;
  error?: string;
  ollama?: {
    ok?: boolean;
    provider?: 'ollama' | 'deepseek';
    chatModel?: string;
    chatModelAvailable?: boolean;
  };
  pixelle?: {
    configured?: boolean;
    ok?: boolean;
    runtimeOk?: boolean;
    serviceOk?: boolean;
    message?: string;
    comfyui?: {
      ok?: boolean;
      url?: string;
      message?: string;
    };
    workflows?: Record<
      string,
      {
        key?: string;
        exists?: boolean;
        path?: string;
      }
    >;
  };
  shortsMaker?: {
    configured?: boolean;
    ok?: boolean;
    reachable?: boolean;
    authPassed?: boolean;
    url?: string;
    status?: number;
    message?: string;
    error?: string;
  };
};

type VideoWorkStatus =
  | 'idle'
  | 'script-ready'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'development';

const videoStatusLabels: Record<VideoWorkStatus, string> = {
  idle: '대기',
  'script-ready': '대본 준비',
  queued: '작업 등록',
  running: '생성 중',
  completed: '완료',
  failed: '실패',
  development: '개발중',
};

const videoStatusClassNames: Record<VideoWorkStatus, string> = {
  idle: 'bg-newBgLineColor text-textItemBlur',
  'script-ready': 'bg-sky-500/15 text-sky-200',
  queued: 'bg-indigo-500/15 text-indigo-200',
  running: 'bg-amber-500/15 text-amber-200',
  completed: 'bg-emerald-500/15 text-emerald-200',
  failed: 'bg-red-500/15 text-red-200',
  development: 'bg-amber-500/15 text-amber-200',
};

/**
 * The only place a badge tone becomes a colour. Severity is decided in
 * snapsShortsBadges, so the words and the colour cannot disagree.
 */
const SNAPS_SHORTS_BADGE_TONE_CLASS: Record<SnapsShortsBadgeTone, string> = {
  ok: 'bg-emerald-500/15 text-emerald-200',
  warn: 'bg-amber-500/15 text-amber-200',
  bad: 'bg-red-500/15 text-red-200',
};

type SnapsShortsHandoff = {
  sourceText?: unknown;
  durationSeconds?: unknown;
  scriptPlatform?: unknown;
  targetPlatforms?: unknown;
  scheduleType?: unknown;
  publishDate?: unknown;
  videoResult?: unknown;
};

const extractVideoUrl = (value: unknown): string => {
  if (!value || typeof value !== 'object') {
    return typeof value === 'string' && /\.(mp4|mov|webm)(\?|$)/i.test(value)
      ? value
      : '';
  }

  const record = value as Record<string, unknown>;
  const direct =
    record.videoUrl ||
    record.video_url ||
    record.url ||
    record.downloadUrl ||
    record.download_url ||
    record.output ||
    record.result;

  if (typeof direct === 'string' && /\.(mp4|mov|webm)(\?|$)/i.test(direct)) {
    return direct;
  }

  if (Array.isArray(direct)) {
    const found = direct.find(
      (item) => typeof item === 'string' && /\.(mp4|mov|webm)(\?|$)/i.test(item)
    );
    if (found) {
      return found;
    }
  }

  for (const nested of Object.values(record)) {
    const found = extractVideoUrl(nested);
    if (found) {
      return found;
    }
  }

  return '';
};

export function SnapsShortsWorkspace() {
  const router = useRouter();
  const toast = useToaster();
  const apiFetch = useFetch();
  const snapsFetch = (url: string, init?: RequestInit) =>
    apiFetch(url, withSnapsJsonHeaders(init));
  const { data: integrations = [] } = useIntegrationList();
  const [sourceText, setSourceText] = useState('');
  // Shorts-Maker's topic-to-script step. The render side of that service needs
  // a payload only its own pipeline can assemble (see the adapter comment in
  // shorts-maker-client.service.ts), so this surfaces the one call that is
  // fully contracted and feeds its answer into the source box the rest of this
  // page already works from.
  const [shortsMakerTopic, setShortsMakerTopic] = useState('');
  const [shortsMakerMode, setShortsMakerMode] = useState<'normal' | 'dialogue'>(
    'normal'
  );
  const [shortsMakerLoading, setShortsMakerLoading] = useState(false);
  const [shortsMakerUsage, setShortsMakerUsage] = useState('');
  const [durationSeconds, setDurationSeconds] = useState(45);
  const [scriptPlatform, setScriptPlatform] =
    useState<VideoTargetPlatform>('youtube');
  const [targetPlatforms, setTargetPlatforms] = useState<VideoTargetPlatform[]>(
    ['instagram', 'youtube', 'tiktok']
  );
  const [scheduleType, setScheduleType] = useState<'draft' | 'schedule'>(
    'draft'
  );
  const [publishDate, setPublishDate] = useState(defaultPublishDate);
  const [videoResult, setVideoResult] = useState<SnapsVideoResult | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoDrafting, setVideoDrafting] = useState(false);
  // Warnings the publishing payload builder returned, e.g. an assist platform
  // that cannot be auto-published or settings a provider rejected.
  // Named for the schedule step, then fed only by it - so the script step's
  // own warnings had nowhere to go and the operator was never told the
  // source had been cut. Each step reports into the same box now.
  const [stepWarnings, setStepWarnings] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoThumbnail, setVideoThumbnail] = useState('');
  const [saveVideoToMediaLibrary, setSaveVideoToMediaLibrary] = useState(true);
  const [videoMode, setVideoMode] = useState<SnapsVideoMode>('ai_generation');
  const [videoStatus, setVideoStatus] = useState<VideoWorkStatus>('idle');
  const [currentJobId, setCurrentJobId] = useState('');
  const [statusCheckedAt, setStatusCheckedAt] = useState('');
  const [health, setHealth] = useState<SnapsShortsHealth | null>(null);
  // Separate from `health` being null, which also means "not loaded yet". The
  // badges below fall through to their emerald branch when health is absent,
  // so a failed fetch painted a green "LLM 확인중" and stayed that way.
  const [healthError, setHealthError] = useState('');

  const connectedByPlatform = useMemo(() => {
    return (integrations as ConnectedIntegration[]).reduce(
      (all, integration) => {
        const key = integration.identifier || integration.providerIdentifier;
        if (key && !all[key] && !integration.disabled) {
          all[key] = integration;
        }
        return all;
      },
      {} as Record<string, ConnectedIntegration>
    );
  }, [integrations]);

  const shortsScript = useMemo(() => {
    return videoResult?.script || videoResult;
  }, [videoResult]);

  const connectedTargetPlatforms = useMemo(() => {
    return targetPlatforms.filter(
      (platform) => connectedByPlatform[platform]?.id
    );
  }, [connectedByPlatform, targetPlatforms]);

  const sourceMetrics = useMemo(() => {
    const trimmed = sourceText.trim();
    return {
      characters: trimmed.length,
      lines: trimmed ? trimmed.split(/\n+/).length : 0,
    };
  }, [sourceText]);

  const selectedStatus = useMemo(() => {
    if (videoUrl) {
      return 'completed' as VideoWorkStatus;
    }
    if (videoResult?.status === 'failed') {
      return 'failed' as VideoWorkStatus;
    }
    if (videoResult?.status === 'development') {
      return 'development' as VideoWorkStatus;
    }
    if (videoResult?.status === 'queued' || videoResult?.status === 'running') {
      return videoResult.status;
    }
    return videoStatus;
  }, [videoResult?.status, videoStatus, videoUrl]);

  const progressPercentage = useMemo(() => {
    const explicit = Number(videoResult?.progress?.percentage);
    if (Number.isFinite(explicit) && explicit > 0) {
      return Math.min(100, Math.max(0, Math.round(explicit)));
    }
    if (selectedStatus === 'completed') {
      return 100;
    }
    if (selectedStatus === 'running') {
      return 62;
    }
    if (selectedStatus === 'queued') {
      return 24;
    }
    if (selectedStatus === 'script-ready') {
      return 34;
    }
    return 0;
  }, [selectedStatus, videoResult?.progress?.percentage]);

  const canAttachVideo = !!videoUrl.trim() && !!connectedTargetPlatforms.length;

  const generateShortsMakerScript = async () => {
    const topic = shortsMakerTopic.trim();
    if (!topic) {
      toast.show('대본을 만들 주제를 입력하세요.', 'warning');
      return;
    }
    // The answer lands in the source box, so anything already typed there is
    // about to be replaced. Every other action on this page that overwrites
    // the operator's own work asks first.
    if (
      sourceText.trim() &&
      !confirmOperatorAction(
        '원문 상자에 입력한 내용을 Shorts-Maker 대본으로 바꿀까요?'
      )
    ) {
      return;
    }

    setShortsMakerLoading(true);
    try {
      const response = await snapsFetch('/snaps/shorts-maker/topic-to-script', {
        method: 'POST',
        body: JSON.stringify({ topic, mode: shortsMakerMode }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }

      // The route answers 200 for all three outcomes, so the body decides.
      const outcome = readSnapsShortsMakerScript(
        (await response.json()) as SnapsShortsMakerScriptAnswer
      );
      if (!outcome.script) {
        setShortsMakerUsage('');
        toast.show(outcome.message, 'warning');
        return;
      }

      setSourceText(outcome.script);
      setShortsMakerUsage(outcome.usage);
      toast.show(outcome.message);
    } catch (error) {
      toast.show(
        error instanceof Error
          ? error.message
          : 'Shorts-Maker 대본 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setShortsMakerLoading(false);
    }
  };

  const loadHealth = async () => {
    try {
      const response = await snapsFetch('/snaps/health');
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      setHealth(await response.json());
      setHealthError('');
    } catch (error) {
      // The last good payload stays. A failed refresh is not evidence that the
      // runtime went away, and clearing it sent every badge back to its neutral
      // branch - which is the green one.
      setHealthError(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    loadHealth();
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(snapsShortsHandoffKey);
      if (!raw) {
        return;
      }
      window.localStorage.removeItem(snapsShortsHandoffKey);
      const handoff = JSON.parse(raw) as SnapsShortsHandoff;

      if (typeof handoff.sourceText === 'string' && handoff.sourceText.trim()) {
        setSourceText(handoff.sourceText);
      }

      const duration = Number(handoff.durationSeconds);
      if (Number.isFinite(duration) && duration >= 10 && duration <= 180) {
        setDurationSeconds(Math.round(duration));
      }

      if (
        typeof handoff.scriptPlatform === 'string' &&
        (videoTargetPlatformIds as readonly string[]).includes(
          handoff.scriptPlatform
        )
      ) {
        setScriptPlatform(handoff.scriptPlatform as VideoTargetPlatform);
      }

      if (Array.isArray(handoff.targetPlatforms)) {
        const normalizedTargets = handoff.targetPlatforms.filter(
          (platform): platform is VideoTargetPlatform =>
            typeof platform === 'string' &&
            (videoTargetPlatformIds as readonly string[]).includes(platform)
        );
        if (normalizedTargets.length) {
          setTargetPlatforms([...new Set(normalizedTargets)]);
        }
      }

      if (
        handoff.scheduleType === 'draft' ||
        handoff.scheduleType === 'schedule'
      ) {
        setScheduleType(handoff.scheduleType);
      }
      if (
        typeof handoff.publishDate === 'string' &&
        handoff.publishDate.trim()
      ) {
        setPublishDate(handoff.publishDate);
      }
      if (handoff.videoResult && typeof handoff.videoResult === 'object') {
        setVideoResult(handoff.videoResult as SnapsVideoResult);
        setVideoStatus('script-ready');
      }
      toast.show('에이전트 쇼츠 작업을 불러왔습니다.');
    } catch {
      window.localStorage.removeItem(snapsShortsHandoffKey);
    }
  }, []);

  const toggleTargetPlatform = (platform: VideoTargetPlatform) => {
    setTargetPlatforms((current) => {
      if (current.includes(platform)) {
        return current.length === 1
          ? current
          : current.filter((item) => item !== platform);
      }
      return [...current, platform];
    });
  };

  const pollVideoStatus = async (
    jobId: string,
    baseResult: SnapsVideoResult
  ) => {
    setCurrentJobId(jobId);
    setVideoStatus('running');
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const response = await snapsFetch(
        `/snaps/video/status/${encodeURIComponent(jobId)}`
      );
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const statusResult = (await response.json()) as SnapsVideoResult;
      const foundVideoUrl = extractVideoUrl(statusResult);
      const poll = readSnapsShortsPoll(statusResult.status, !!foundVideoUrl);
      setVideoStatus(poll.status);
      setStatusCheckedAt(
        new Date().toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      );
      setVideoResult({
        ...baseResult,
        ...statusResult,
        script: statusResult.script || baseResult.script,
      });
      if (foundVideoUrl) {
        setVideoUrl(foundVideoUrl);
      }
      if (poll.phase === 'completed') {
        toast.show('쇼츠 영상 생성이 완료됐습니다.');
        return;
      }
      if (poll.phase === 'failed') {
        throw new Error(
          statusResult.message || '쇼츠 영상 생성에 실패했습니다.'
        );
      }
      if (poll.phase === 'stopped') {
        // Nothing is coming. Ten minutes of polling used to follow this.
        throw new Error(
          statusResult.message ||
            '영상 작업 상태를 확인할 수 없습니다. Pixelle 설정을 확인하세요.'
        );
      }
    }
    toast.show(
      '영상 생성 작업이 계속 진행 중입니다. 잠시 후 상태를 다시 확인하세요.',
      'warning'
    );
  };

  const generateShorts = async (generateVideo: boolean) => {
    if (sourceText.trim().length < 5) {
      toast.show('쇼츠 대본으로 만들 원문을 입력하세요.', 'warning');
      return;
    }

    if (generateVideo && videoMode === 'html_render') {
      setVideoStatus('development');
      setVideoResult({
        status: 'development',
        message:
          'HTML 기반 영상화 모드는 개발중입니다. 현재는 AI 직접 생성 모드만 사용할 수 있습니다.',
      });
      toast.show('HTML 기반 영상화 모드는 개발중입니다.', 'warning');
      return;
    }

    if (generateVideo && health?.pixelle && !health.pixelle.ok) {
      toast.show(
        health.pixelle.message ||
          health.pixelle.comfyui?.message ||
          'Pixelle 또는 ComfyUI 준비 상태를 먼저 확인하세요.',
        'warning'
      );
      await loadHealth();
      return;
    }

    if (
      generateVideo &&
      !confirmOperatorAction('로컬 Pixelle 엔진에 쇼츠 생성 작업을 요청할까요?')
    ) {
      return;
    }

    setVideoLoading(true);
    setVideoStatus(generateVideo ? 'queued' : 'script-ready');
    setCurrentJobId('');
    setStatusCheckedAt('');
    try {
      const response = await snapsFetch(
        generateVideo ? '/snaps/video/generate-short' : '/snaps/video/script',
        {
          method: 'POST',
          body: JSON.stringify({
            sourceText,
            durationSeconds,
            platform: scriptPlatform,
            mode: videoMode,
          }),
        }
      );
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const data = await response.json();
      setVideoResult(data);
      setStepWarnings(
        Array.isArray(data?.warnings) ? (data.warnings as string[]) : []
      );
      if (data?.jobId) {
        setCurrentJobId(data.jobId);
      }
      const foundVideoUrl = extractVideoUrl(data);
      if (foundVideoUrl) {
        setVideoUrl(foundVideoUrl);
        setVideoStatus('completed');
      }
      if (generateVideo && data?.jobId && !foundVideoUrl) {
        await pollVideoStatus(data.jobId, data);
      } else if (!generateVideo) {
        setVideoStatus('script-ready');
      }
      // The service degrades to a deterministic script when the model call
      // fails or comes back without a storyboard, and answers 200 either way.
      // Both outcomes used to be reported as '대본을 생성했습니다'.
      const scriptProvider = (data?.script ?? data)?.provider;
      if (scriptProvider === 'rule-fallback') {
        toast.show(
          'AI 생성에 실패해 기본 템플릿으로 쇼츠 대본을 만들었습니다. 내용을 확인하고 필요하면 다시 생성하세요.',
          'warning'
        );
      } else {
        toast.show(
          generateVideo
            ? '로컬 Pixelle 쇼츠 작업을 시작했습니다.'
            : '쇼츠 대본을 생성했습니다.'
        );
      }
    } catch (error) {
      setVideoStatus('failed');
      toast.show(
        error instanceof Error ? error.message : '쇼츠 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setVideoLoading(false);
    }
  };

  const refreshCurrentJob = async () => {
    const jobId = currentJobId || videoResult?.jobId;
    if (!jobId) {
      toast.show('확인할 영상 작업이 없습니다.', 'warning');
      return;
    }

    setVideoLoading(true);
    try {
      const response = await snapsFetch(
        `/snaps/video/status/${encodeURIComponent(jobId)}`
      );
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const statusResult = (await response.json()) as SnapsVideoResult;
      setVideoResult((current) => ({
        ...(current || {}),
        ...statusResult,
        script: statusResult.script || current?.script,
      }));
      const foundVideoUrl = extractVideoUrl(statusResult);
      if (foundVideoUrl) {
        setVideoUrl(foundVideoUrl);
      }
      if (
        statusResult.status === 'queued' ||
        statusResult.status === 'running' ||
        statusResult.status === 'completed' ||
        statusResult.status === 'failed'
      ) {
        setVideoStatus(statusResult.status);
      }
      setStatusCheckedAt(
        new Date().toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      );
    } catch (error) {
      toast.show(
        error instanceof Error
          ? error.message
          : '작업 상태 확인에 실패했습니다.',
        'warning'
      );
    } finally {
      setVideoLoading(false);
    }
  };

  const attachShortsToDraft = async () => {
    if (!videoUrl.trim()) {
      toast.show('첨부할 영상 URL을 입력하세요.', 'warning');
      return;
    }

    if (!connectedTargetPlatforms.length) {
      toast.show(
        'Instagram, YouTube, TikTok 중 연결된 채널이 필요합니다.',
        'warning'
      );
      return;
    }

    setVideoDrafting(true);
    try {
      let publishDateIso: string | undefined;
      if (scheduleType === 'schedule') {
        const parsedPublishDate = new Date(publishDate);
        // Not only what Date cannot parse: a time that has already gone
        // by is published immediately by the post workflow.
        const problem = snapsPublishDateProblem(publishDate);
        if (problem) {
          toast.show(problem, 'warning');
          setVideoDrafting(false);
          return;
        }
        publishDateIso = parsedPublishDate.toISOString();
      }

      if (
        scheduleType === 'schedule' &&
        !confirmOperatorAction(
          `연결된 쇼츠 채널 ${connectedTargetPlatforms.length}개에 예약 게시물을 만들까요?`
        )
      ) {
        setVideoDrafting(false);
        return;
      }

      const response = await snapsFetch('/snaps/video/attach-to-draft', {
        method: 'POST',
        body: JSON.stringify({
          videoUrl,
          thumbnail: videoThumbnail || undefined,
          title:
            shortsScript?.uploadMetadata?.title ||
            shortsScript?.title ||
            'snaps 쇼츠',
          caption:
            shortsScript?.caption ||
            shortsScript?.uploadMetadata?.description ||
            shortsScript?.narration ||
            sourceText,
          saveToMediaLibrary: saveVideoToMediaLibrary,
          scheduleType,
          operatorConfirmed: scheduleType === 'schedule',
          ...(publishDateIso ? { publishDate: publishDateIso } : {}),
          targetPlatforms: connectedTargetPlatforms,
          integrations: connectedTargetPlatforms.map((platform) => ({
            platform,
            integrationId: connectedByPlatform[platform].id,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }

      // The response carries the created posts and the builder's warnings. It
      // used to be discarded, so a run where every variant was dropped still
      // showed an unconditional success toast.
      const result = (await response.json()) as {
        scheduled?: unknown[];
        schedulable?: unknown[];
        warnings?: string[];
      };
      const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
      setStepWarnings(warnings);
      // An empty `scheduled` does not mean nothing was created - see
      // describeSnapsAttachResult.
      const outcome = describeSnapsAttachResult(
        result,
        scheduleType,
        '쇼츠 영상을'
      );

      if (outcome.tone === 'warning') {
        toast.show(outcome.message, 'warning');
        return;
      }

      toast.show(outcome.message);
      router.push('/launches?display=list');
    } catch (error) {
      toast.show(
        error instanceof Error
          ? error.message
          : '쇼츠 초안 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setVideoDrafting(false);
    }
  };

  return (
    <section className="bg-newBgColorInner border border-newBorder rounded-[8px] overflow-hidden text-newTextColor">
      <div className="border-b border-newBorder bg-newBgLineColor/45 px-[18px] py-[14px] flex items-center justify-between gap-[14px] maxMedia:flex-col maxMedia:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-[8px]">
            <h2 className="text-[20px] font-[700] leading-tight">
              쇼츠 스튜디오
            </h2>
            <span
              className={clsx(
                'rounded-[999px] px-[9px] py-[4px] text-[11px] font-[700]',
                videoStatusClassNames[selectedStatus]
              )}
            >
              {videoStatusLabels[selectedStatus]}
            </span>
          </div>
          <div className="mt-[6px] flex flex-wrap gap-[8px] text-[11px] text-textItemBlur">
            <span>원문 {sourceMetrics.characters.toLocaleString()}자</span>
            <span>장면 {shortsScript?.storyboard?.length || '-'}</span>
            <span>
              채널 {connectedTargetPlatforms.length}/{targetPlatforms.length}
            </span>
            {currentJobId && <span>작업 {currentJobId.slice(0, 8)}</span>}
            {statusCheckedAt && <span>확인 {statusCheckedAt}</span>}
          </div>
          {!!stepWarnings.length && (
            <div className="mt-[8px] rounded-[8px] border border-amber-500/30 bg-amber-500/10 px-[12px] py-[10px] text-[12px] leading-[1.5] text-amber-200 flex flex-col gap-[4px]">
              {/* The builder emits one warning per skipped variant plus a
                  closing summary, so a run over every connected platform can
                  produce more than a dozen. Capping the list at five is fine;
                  dropping the rest without saying so is not - the operator
                  reads five lines and assumes that was all of it. */}
              {stepWarnings.slice(0, 5).map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
              {stepWarnings.length > 5 && (
                <div className="opacity-70">
                  외 {stepWarnings.length - 5}개의 경고가 더 있습니다.
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-[8px] text-[11px]">
          {/* The badges were three blocks of inline ternaries, and each
              decided its own severity. Measured: an unloaded LLM badge was
              green while its own text said 확인중, Pixelle and Shorts-Maker
              claimed 미설정 before anything had been asked, and a store that
              could not be written left all three green even though shorts
              work is saved there. They come from one function now. */}
          {snapsShortsBadges(health, healthError).map((badge) => (
            <span
              key={badge.id}
              className={clsx(
                'rounded-[999px] px-[9px] py-[4px]',
                SNAPS_SHORTS_BADGE_TONE_CLASS[badge.tone]
              )}
              title={badge.title}
            >
              {badge.label}
            </span>
          ))}
          <span
            className={clsx(
              'rounded-[999px] px-[9px] py-[4px]',
              health?.pixelle?.comfyui?.ok
                ? 'bg-emerald-500/15 text-emerald-200'
                : health?.pixelle?.configured
                ? 'bg-red-500/15 text-red-200'
                : 'bg-newBgLineColor text-textItemBlur'
            )}
            title={
              health?.pixelle?.comfyui?.message ||
              health?.pixelle?.comfyui?.url ||
              ''
            }
          >
            ComfyUI {health?.pixelle?.comfyui?.ok ? '온라인' : '오프라인'}
          </span>
          <span
            className={clsx(
              'rounded-[999px] px-[9px] py-[4px]',
              health?.pixelle?.workflows?.video?.exists
                ? 'bg-emerald-500/15 text-emerald-200'
                : 'bg-red-500/15 text-red-200'
            )}
            title={health?.pixelle?.workflows?.video?.key || ''}
          >
            워크플로우{' '}
            {health?.pixelle?.workflows?.video?.exists ? '확인' : '누락'}
          </span>
        </div>
      </div>

      <div className="h-[3px] bg-newBgLineColor">
        <div
          className="h-full bg-btnPrimary transition-all"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      <div className="grid grid-cols-[minmax(360px,1.05fr)_minmax(360px,0.95fr)] maxMedia:grid-cols-1">
        <div className="border-r border-newBorder maxMedia:border-r-0 maxMedia:border-b p-[18px] flex flex-col gap-[14px]">
          <div className="grid grid-cols-2 gap-[8px]">
            {[
              {
                id: 'ai_generation' as const,
                title: 'AI 직접 생성',
                state: '사용 가능',
              },
              {
                id: 'html_render' as const,
                title: 'HTML 영상화',
                state: '개발중',
              },
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setVideoMode(mode.id)}
                className={clsx(
                  'h-[58px] rounded-[8px] border px-[12px] text-left transition-colors',
                  videoMode === mode.id
                    ? 'border-btnPrimary bg-btnPrimary/15'
                    : 'border-newBorder bg-newBgLineColor text-textItemBlur'
                )}
              >
                <div className="text-[13px] font-[700]">{mode.title}</div>
                <div className="mt-[4px] text-[11px]">{mode.state}</div>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-[8px]">
            <div className="flex items-center justify-between gap-[10px]">
              <label className="text-[13px] font-[700]">원문</label>
              <span className="text-[11px] text-textItemBlur">
                {sourceMetrics.lines.toLocaleString()}줄
              </span>
            </div>
            <textarea
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
              className="min-h-[260px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[14px] text-[14px] leading-[1.7] outline-none focus:border-btnPrimary"
              placeholder="쇼츠로 만들 원문, 기사 요약, 제품 설명, 캠페인 메시지를 입력하세요."
            />
          </div>

          {/* Shorts-Maker had no operator surface at all: routes, a client and a
              contract check on the backend, and nothing on this page. Only the
              topic-to-script call is fully contracted - the render side needs a
              payload that Shorts-Maker's own pipeline assembles - so that is
              what this offers, writing its answer into the box above. */}
          <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px] flex flex-col gap-[8px]">
            <div className="flex items-center justify-between gap-[10px]">
              <div className="text-[13px] font-[700]">Shorts-Maker 대본</div>
              <span className="text-[11px] text-textItemBlur">
                {health?.shortsMaker?.ok
                  ? '주제에서 대본을 만들어 원문에 넣습니다'
                  : !health?.shortsMaker?.configured
                  ? 'SHORTS_MAKER_URL 미설정'
                  : '연결 확인 필요'}
              </span>
            </div>
            <div className="grid grid-cols-[1fr_118px] maxMedia:grid-cols-1 gap-[8px]">
              <input
                value={shortsMakerTopic}
                onChange={(event) => setShortsMakerTopic(event.target.value)}
                maxLength={160}
                className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px] outline-none focus:border-btnPrimary"
                placeholder="주제 (예: 환절기 건강관리 팁)"
              />
              <select
                value={shortsMakerMode}
                onChange={(event) =>
                  setShortsMakerMode(event.target.value as 'normal' | 'dialogue')
                }
                className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px] outline-none focus:border-btnPrimary"
              >
                <option value="normal">일반</option>
                <option value="dialogue">대화</option>
              </select>
            </div>
            <Button
              secondary
              loading={shortsMakerLoading}
              disabled={!health?.shortsMaker?.configured}
              onClick={generateShortsMakerScript}
              className="rounded-[8px] !h-[38px]"
            >
              대본 생성
            </Button>
            {!!shortsMakerUsage && (
              <div className="text-[11px] text-textItemBlur">
                {shortsMakerUsage}
              </div>
            )}
          </div>

          <div className="grid grid-cols-[1fr_118px] maxMedia:grid-cols-1 gap-[8px]">
            <select
              value={scriptPlatform}
              onChange={(event) =>
                setScriptPlatform(event.target.value as VideoTargetPlatform)
              }
              className="h-[40px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px] outline-none focus:border-btnPrimary"
            >
              {videoTargetPlatforms.map((platform) => (
                <option key={platform.id} value={platform.id}>
                  {platform.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={15}
              max={90}
              step={5}
              value={durationSeconds}
              onChange={(event) =>
                setDurationSeconds(
                  Math.min(90, Math.max(15, Number(event.target.value) || 45))
                )
              }
              className="h-[40px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px] outline-none focus:border-btnPrimary"
              aria-label="쇼츠 길이"
            />
          </div>

          <div className="flex flex-wrap gap-[8px]">
            {videoTargetPlatforms.map((platform) => {
              const connected = !!connectedByPlatform[platform.id];
              const selected = targetPlatforms.includes(platform.id);
              return (
                <button
                  key={platform.id}
                  onClick={() => toggleTargetPlatform(platform.id)}
                  className={clsx(
                    'h-[34px] px-[12px] rounded-[8px] text-[12px] border',
                    selected
                      ? 'bg-btnPrimary text-white border-btnPrimary'
                      : 'bg-newBgLineColor border-newBorder text-textItemBlur'
                  )}
                >
                  {platform.label} · {connected ? '연결' : '미연결'}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-[140px_1fr] maxMedia:grid-cols-1 gap-[8px]">
            <select
              value={scheduleType}
              onChange={(event) =>
                setScheduleType(event.target.value as 'draft' | 'schedule')
              }
              className="h-[40px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px] outline-none focus:border-btnPrimary"
            >
              <option value="draft">초안</option>
              <option value="schedule">예약</option>
            </select>
            <input
              type="datetime-local"
              value={publishDate}
              disabled={scheduleType === 'draft'}
              onChange={(event) => setPublishDate(event.target.value)}
              className="h-[40px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px] outline-none focus:border-btnPrimary disabled:opacity-50"
            />
          </div>

          <div className="grid grid-cols-2 maxMedia:grid-cols-1 gap-[10px]">
            <Button
              secondary
              loading={videoLoading && selectedStatus === 'script-ready'}
              onClick={() => generateShorts(false)}
              className="rounded-[8px] !h-[44px]"
            >
              대본만 생성
            </Button>
            <Button
              loading={videoLoading && selectedStatus !== 'script-ready'}
              onClick={() => generateShorts(true)}
              disabled={videoMode === 'html_render'}
              className="rounded-[8px] !h-[44px]"
            >
              AI 영상 생성
            </Button>
          </div>
        </div>

        <div className="p-[18px] flex flex-col gap-[14px]">
          <div className="grid grid-cols-[minmax(170px,230px)_1fr] maxMedia:grid-cols-1 gap-[14px]">
            <div className="mx-auto w-full max-w-[230px]">
              <div className="aspect-[9/16] overflow-hidden rounded-[8px] border border-newBorder bg-black">
                {videoUrl ? (
                  <video
                    src={videoUrl}
                    controls
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center px-[14px] text-center text-[12px] text-white/60">
                    <div className="text-[34px] leading-none">9:16</div>
                    <div className="mt-[8px]">
                      {selectedStatus === 'running'
                        ? '생성 작업 진행 중'
                        : '영상 미리보기'}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-[10px] min-w-0">
              <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px]">
                <div className="flex items-center justify-between gap-[10px]">
                  <div className="text-[13px] font-[700]">생성 상태</div>
                  {(currentJobId || videoResult?.jobId) && (
                    <button
                      type="button"
                      onClick={refreshCurrentJob}
                      className="text-[12px] text-textColor"
                    >
                      새로고침
                    </button>
                  )}
                </div>
                <div className="mt-[10px] h-[8px] overflow-hidden rounded-[999px] bg-black/20">
                  <div
                    className="h-full rounded-[999px] bg-btnPrimary transition-all"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
                <div className="mt-[8px] text-[12px] text-textItemBlur">
                  {videoResult?.message ||
                    videoResult?.progress?.message ||
                    videoStatusLabels[selectedStatus]}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-[8px]">
                <input
                  value={videoUrl}
                  onChange={(event) => setVideoUrl(event.target.value)}
                  className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px] outline-none focus:border-btnPrimary"
                  placeholder="영상 URL"
                />
                <input
                  value={videoThumbnail}
                  onChange={(event) => setVideoThumbnail(event.target.value)}
                  className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px] outline-none focus:border-btnPrimary"
                  placeholder="썸네일 URL"
                />
              </div>

              <label className="flex items-center gap-[8px] text-[12px] text-textItemBlur">
                <input
                  type="checkbox"
                  checked={saveVideoToMediaLibrary}
                  onChange={(event) =>
                    setSaveVideoToMediaLibrary(event.target.checked)
                  }
                />
                미디어 라이브러리에 저장
              </label>

              <Button
                secondary={!canAttachVideo}
                loading={videoDrafting}
                onClick={attachShortsToDraft}
                disabled={!canAttachVideo}
                className="rounded-[8px] !h-[42px]"
              >
                {scheduleType === 'schedule'
                  ? '예약 게시물에 첨부'
                  : '초안에 첨부'}
              </Button>
            </div>
          </div>

          {shortsScript ? (
            <div className="grid grid-cols-[1fr_1.1fr] maxMedia:grid-cols-1 gap-[10px]">
              <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px] min-w-0">
                <div className="text-[13px] font-[700] truncate">
                  {shortsScript.title || '쇼츠 초안'}
                </div>
                {!!shortsScript.hook && (
                  <div className="mt-[6px] text-[12px] text-amber-200 leading-[1.5]">
                    {shortsScript.hook}
                  </div>
                )}
                <div className="mt-[10px] max-h-[160px] overflow-auto text-[12px] leading-[1.6] text-textItemBlur">
                  {shortsScript.narration ||
                    shortsScript.coreSummary ||
                    videoResult?.message}
                </div>
                {!!shortsScript.coreSummary && (
                  <div className="mt-[10px] rounded-[8px] bg-newBgColorInner border border-newBorder p-[10px] text-[12px] leading-[1.5]">
                    <div className="text-[11px] font-[700] mb-[5px]">
                      핵심 요약
                    </div>
                    {shortsScript.coreSummary}
                  </div>
                )}
                {!!shortsScript.uploadMetadata && (
                  <div className="mt-[10px] rounded-[8px] bg-newBgColorInner border border-newBorder p-[10px] text-[12px] leading-[1.5]">
                    <div className="text-[11px] font-[700] mb-[5px]">
                      업로드 메타데이터
                    </div>
                    <div>
                      {shortsScript.uploadMetadata.title || shortsScript.title}
                    </div>
                    {!!shortsScript.uploadMetadata.description && (
                      <div className="mt-[4px] text-textItemBlur">
                        {shortsScript.uploadMetadata.description}
                      </div>
                    )}
                  </div>
                )}
                {!!shortsScript.uploadMetadata?.hashtags?.length && (
                  <div className="mt-[10px] flex flex-wrap gap-[6px] text-[11px] text-textItemBlur">
                    {shortsScript.uploadMetadata.hashtags
                      .slice(0, 8)
                      .map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                  </div>
                )}
              </div>

              <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px] min-w-0">
                <div className="text-[13px] font-[700]">스토리보드</div>
                {!!shortsScript.storyboard?.length ? (
                  <div className="mt-[10px] max-h-[230px] overflow-auto flex flex-col gap-[8px]">
                    {shortsScript.storyboard.map((scene, index) => (
                      <div
                        key={`${scene.scene}-${index}`}
                        className="border-l-2 border-btnPrimary pl-[10px] text-[12px] leading-[1.5]"
                      >
                        <div className="font-[700]">
                          장면 {scene.scene || index + 1}
                          {scene.startSecond !== undefined &&
                          scene.endSecond !== undefined
                            ? ` · ${scene.startSecond}-${scene.endSecond}s`
                            : ''}
                        </div>
                        <div className="mt-[3px]">{scene.visual}</div>
                        {!!scene.overlayText && (
                          <div className="mt-[3px] text-textItemBlur">
                            {scene.overlayText}
                          </div>
                        )}
                        {!!scene.pixellePrompt && (
                          <div className="mt-[4px] text-[11px] text-textItemBlur">
                            pixellePrompt: {scene.pixellePrompt}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-[10px] text-[12px] text-textItemBlur">
                    장면 정보가 없습니다.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="min-h-[170px] rounded-[8px] border border-dashed border-newBorder bg-newBgLineColor flex items-center justify-center text-textItemBlur text-[14px] text-center px-[12px]">
              대본을 생성하면 검수 화면이 열립니다.
            </div>
          )}

          {!!videoResult && (
            <details className="text-[12px] text-textItemBlur">
              <summary className="cursor-pointer">작업 JSON</summary>
              <pre className="mt-[8px] max-h-[180px] overflow-auto whitespace-pre-wrap bg-newBgLineColor border border-newBorder rounded-[8px] p-[12px] leading-[1.6]">
                {JSON.stringify(videoResult, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </section>
  );
}
