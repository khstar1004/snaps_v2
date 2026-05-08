'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { snapsDemoWorkspace } from './snaps-demo-workspace';

const targetPlatforms = [
  { id: 'threads', label: 'Threads' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'youtube', label: 'YouTube 쇼츠' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'naver-blog', label: '네이버 블로그' },
  { id: 'naver-cafe', label: '네이버 카페' },
  { id: 'kakao-talk', label: '카카오톡' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'x', label: 'X' },
] as const;

type TargetPlatform = (typeof targetPlatforms)[number]['id'];

const feedbackSentimentLabels: Record<string, string> = {
  question: '질문',
  praise: '칭찬',
  complaint: '불만',
  spam: '스팸',
  collaboration: '협업',
  other: '기타',
};

type SnapsVariant = {
  platform: TargetPlatform;
  label: string;
  title?: string;
  content: string;
  hashtags: string[];
  media?: Array<{
    id: string;
    path: string;
    thumbnail?: string;
    alt?: string;
  }>;
  settings: Record<string, unknown>;
  publishMode: 'schedule' | 'assist';
  notes?: string[];
};

type SnapsTransformResult = {
  provider: 'ollama' | 'rule-fallback';
  model: string;
  variants: SnapsVariant[];
  warnings: string[];
};

type ConnectedIntegration = {
  id: string;
  name?: string;
  identifier?: string;
  providerIdentifier?: string;
  disabled?: boolean;
};

type ReplyCapability = {
  id: string;
  name?: string;
  providerIdentifier?: string;
  disabled?: boolean;
  commentable: boolean;
};

type SnapsHealth = {
  ok: boolean;
  error?: string;
  ollama?: {
    ok?: boolean;
    chatModel?: string;
    embedModel?: string;
    chatModelAvailable?: boolean;
    embedModelAvailable?: boolean;
    missingModels?: string[];
  };
  rag?: {
    enabled?: boolean;
    topK?: number;
  };
  pixelle?: {
    configured?: boolean;
  };
  koreanSns?: {
    naverCafeConfigured?: boolean;
  };
  fallback?: {
    ruleFallbackEnabled?: boolean;
  };
};

type SnapsStoredSource = {
  id: string;
  title: string;
  sourceText: string;
  topic?: string;
  tone?: string;
};

type SnapsStyleExample = {
  id: string;
  platform: TargetPlatform;
  content: string;
  score?: number;
};

type SnapsActivityEntry = {
  id: string;
  type: string;
  title: string;
  createdAt?: string;
};

type SnapsMetricPoint = {
  date?: string;
  value?: number | string;
};

type SnapsReportChart = {
  platform?: string;
  metricKey?: string;
  points?: SnapsMetricPoint[];
};

type SnapsReportChartView = {
  platform: string;
  metricKey: string;
  points: SnapsMetricPoint[];
  max: number;
};

type SnapsReportTrend = {
  platform?: string;
  metricKey?: string;
  firstValue?: number;
  lastValue?: number;
  delta?: number;
};

type SnapsReportResult = {
  reportId?: string;
  title?: string;
  summary?: string;
  warnings?: string[];
  insights?: string[];
  actionItems?: string[];
  trends?: SnapsReportTrend[];
  charts?: SnapsReportChart[];
  metrics?: Record<string, Record<string, number>>;
};

type SnapsStoredReport = {
  id: string;
  title: string;
  report: SnapsReportResult;
};

type SnapsStoryboardScene = {
  scene: string | number;
  startSecond?: number;
  endSecond?: number;
  visual?: string;
  overlayText?: string;
  narration?: string;
  pixellePrompt?: string;
};

type SnapsShortsScript = {
  title?: string;
  hook?: string;
  narration?: string;
  caption?: string;
  coreSummary?: string;
  storyboard?: SnapsStoryboardScene[];
  uploadMetadata?: {
    title?: string;
    description?: string;
    hashtags?: string[];
  };
};

type SnapsVideoResult = SnapsShortsScript & {
  script?: SnapsShortsScript;
  status?: string;
  jobId?: string;
};

type SnapsReplySuggestion = {
  target: string;
  reply: string;
};

type SnapsFeedbackView = {
  imported?: number;
  deleted?: number;
  total?: number;
  bySentiment?: Record<string, number>;
  highlights?: string[];
  replySuggestions?: SnapsReplySuggestion[];
};

const defaultPublishDate = () => {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};

const withSnapsJsonHeaders = (init?: RequestInit): RequestInit => {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const normalizedHeaders: Record<string, string> = {};
  headers.forEach((value, key) => {
    normalizedHeaders[key.toLowerCase() === 'content-type' ? 'Content-Type' : key] =
      value;
  });

  return {
    ...init,
    headers: normalizedHeaders,
  };
};

const extractSnapsErrorMessage = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (!value || typeof value !== 'object') {
    return '';
  }

  const record = value as Record<string, unknown>;
  const candidates = [record.message, record.error, record.detail];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
    if (Array.isArray(candidate)) {
      const messages = candidate
        .filter((item): item is string => typeof item === 'string' && !!item.trim())
        .map((item) => item.trim());
      if (messages.length) {
        return messages.join('\n');
      }
    }
  }

  return '';
};

const readSnapsError = async (
  response: Response,
  fallback = `snaps 요청 실패 (${response.status})`
) => {
  let raw = '';
  try {
    raw = await response.text();
  } catch {
    return fallback;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return fallback;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    const message = extractSnapsErrorMessage(parsed);
    if (message) {
      return message;
    }
  } catch {
    // Non-JSON error bodies are handled below.
  }

  if (trimmed.startsWith('<')) {
    return `${fallback}: ${response.statusText || '서버가 HTML 오류 응답을 반환했습니다.'}`;
  }

  return trimmed.slice(0, 500);
};

const confirmOperatorAction = (message: string) =>
  typeof window !== 'undefined' && window.confirm(message);
const confirmDestructive = confirmOperatorAction;

export function SnapsWorkspace() {
  const router = useRouter();
  const toast = useToaster();
  const apiFetch = useFetch();
  const snapsFetch = (url: string, init?: RequestInit) =>
    apiFetch(url, withSnapsJsonHeaders(init));
  const { data: integrations = [] } = useIntegrationList();
  const [sourceText, setSourceText] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceTopic, setSourceTopic] = useState('');
  const [activeSourceId, setActiveSourceId] = useState('');
  const [sourceLibrary, setSourceLibrary] = useState<SnapsStoredSource[]>([]);
  const [savingSource, setSavingSource] = useState(false);
  const [health, setHealth] = useState<SnapsHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [activity, setActivity] = useState<SnapsActivityEntry[]>([]);
  const [workspaceImportText, setWorkspaceImportText] = useState('');
  const [workspaceImporting, setWorkspaceImporting] = useState(false);
  const [tone, setTone] = useState('한국 나노 인플루언서 스타일');
  const [useRag, setUseRag] = useState(true);
  const [selectedPlatforms, setSelectedPlatforms] = useState<TargetPlatform[]>([
    'threads',
    'instagram',
    'youtube',
    'tiktok',
    'naver-blog',
  ]);
  const [naverCafeClubId, setNaverCafeClubId] = useState('');
  const [naverCafeMenuId, setNaverCafeMenuId] = useState('');
  const [loading, setLoading] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [scheduleType, setScheduleType] = useState<'draft' | 'schedule'>('draft');
  const [publishDate, setPublishDate] = useState(defaultPublishDate);
  const [styleExample, setStyleExample] = useState('');
  const [stylePlatform, setStylePlatform] = useState<TargetPlatform>('instagram');
  const [styleExamples, setStyleExamples] = useState<SnapsStyleExample[]>([]);
  const [styleSearchQuery, setStyleSearchQuery] = useState('');
  const [styleSearchResult, setStyleSearchResult] = useState<SnapsStyleExample[]>([]);
  const [savingStyle, setSavingStyle] = useState(false);
  const [reportMetrics, setReportMetrics] = useState(
    '[{"platform":"instagram","metricKey":"impressions","metricValue":1000,"collectedAt":"2026-05-04T00:00:00.000Z"},{"platform":"instagram","metricKey":"likes","metricValue":82,"collectedAt":"2026-05-04T00:00:00.000Z"}]'
  );
  const [reportIntegrationIds, setReportIntegrationIds] = useState('');
  const [reportPostIds, setReportPostIds] = useState('');
  const [reportResult, setReportResult] = useState<SnapsReportResult | null>(null);
  const [activeReportId, setActiveReportId] = useState('');
  const [reportHistory, setReportHistory] = useState<SnapsStoredReport[]>([]);
  const [reporting, setReporting] = useState(false);
  const [videoResult, setVideoResult] = useState<SnapsVideoResult | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoDrafting, setVideoDrafting] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoThumbnail, setVideoThumbnail] = useState('');
  const [saveVideoToMediaLibrary, setSaveVideoToMediaLibrary] = useState(true);
  const [feedbackText, setFeedbackText] = useState(
    '[{"platform":"instagram","author":"user1","content":"이 내용 더 자세히 볼 수 있나요?"},{"platform":"threads","author":"user2","content":"정리 좋아요. 다음 편도 기대됩니다."}]'
  );
  const [feedbackPostIds, setFeedbackPostIds] = useState('');
  const [feedbackPostPlatform, setFeedbackPostPlatform] = useState<TargetPlatform>('instagram');
  const [feedbackReplyIntegrationId, setFeedbackReplyIntegrationId] = useState('');
  const [feedbackReplyPlatformPostId, setFeedbackReplyPlatformPostId] = useState('');
  const [feedbackReplyLastCommentId, setFeedbackReplyLastCommentId] = useState('');
  const [feedbackReplyPostId, setFeedbackReplyPostId] = useState('');
  const [feedbackReplyText, setFeedbackReplyText] = useState('');
  const [replyCapabilities, setReplyCapabilities] = useState<ReplyCapability[] | null>(null);
  const [feedbackResult, setFeedbackResult] = useState<SnapsFeedbackView | null>(null);
  const [feedbackSummary, setFeedbackSummary] = useState<SnapsFeedbackView | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [result, setResult] = useState<SnapsTransformResult | null>(null);
  const [activePlatform, setActivePlatform] = useState<TargetPlatform>('threads');

  const connectedByPlatform = useMemo(() => {
    return (integrations as ConnectedIntegration[]).reduce((all, integration) => {
      const key = integration.identifier || integration.providerIdentifier;
      if (key && !all[key] && !integration.disabled) {
        all[key] = integration;
      }
      return all;
    }, {} as Record<string, ConnectedIntegration>);
  }, [integrations]);

  const activeVariant = useMemo(() => {
    return (
      result?.variants.find((variant) => variant.platform === activePlatform) ||
      result?.variants[0]
    );
  }, [activePlatform, result]);

  const reportPlatformEntries = useMemo(() => {
    return reportResult?.metrics
      ? (Object.entries(reportResult.metrics) as Array<[string, Record<string, number>]>)
      : [];
  }, [reportResult]);

  const reportChartEntries = useMemo(() => {
    const charts = Array.isArray(reportResult?.charts) ? reportResult.charts : [];
    return charts.slice(0, 6).map((chart): SnapsReportChartView => {
      const points = Array.isArray(chart.points) ? chart.points.slice(-8) : [];
      const max = Math.max(
        1,
        ...points.map((point) => Number(point.value || 0))
      );
      return {
        platform: chart.platform || 'unknown',
        metricKey: chart.metricKey || 'metric',
        points,
        max,
      };
    });
  }, [reportResult]);

  const shortsScript = useMemo(() => {
    return videoResult?.script || videoResult;
  }, [videoResult]);

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

  const feedbackView = useMemo(() => {
    return feedbackSummary || feedbackResult;
  }, [feedbackResult, feedbackSummary]);

  const feedbackSentimentEntries = useMemo(() => {
    const bySentiment = feedbackView?.bySentiment || {};
    return Object.entries(feedbackSentimentLabels).map(([key, label]) => ({
      key,
      label,
      value: Number(bySentiment[key] || 0),
    }));
  }, [feedbackView]);

  const replyIntegrationOptions = useMemo(() => {
    const connected = (integrations as ConnectedIntegration[]).filter(
      (integration) => !integration.disabled
    );
    if (!replyCapabilities) {
      return connected;
    }

    const commentable = new Set(
      replyCapabilities
        .filter((capability) => capability.commentable && !capability.disabled)
        .map((capability) => capability.id)
    );
    return connected.filter((integration) => commentable.has(integration.id));
  }, [integrations, replyCapabilities]);

  const assistChecklist = (variant?: SnapsVariant) => {
    if (!variant || variant.publishMode !== 'assist') {
      return [];
    }

    if (variant.platform === 'naver-blog') {
      return [
        '제목, 목차, 본문 구분이 자연스러운지 확인',
        'HTML 또는 Markdown으로 복사해 네이버 블로그 편집기에 붙여넣기',
        '태그와 썸네일 문구를 블로그 주제에 맞게 최종 조정',
      ];
    }

    if (variant.platform === 'kakao-talk') {
      return [
        '공유 대상이 바로 이해할 수 있게 첫 문장 확인',
        '링크 카드 제목과 설명에 과장 표현이 없는지 확인',
        '복사 후 카카오톡 채널 또는 대화방에서 수동 공유',
      ];
    }

    return ['복사 후 해당 플랫폼 편집기에서 수동 발행'];
  };

  const loadStyleExamples = async () => {
    try {
      const response = await snapsFetch('/snaps/rag/examples');
      if (!response.ok) {
        return;
      }
      setStyleExamples(await response.json());
    } catch {
      setStyleExamples([]);
    }
  };

  const loadSourceLibrary = async () => {
    try {
      const response = await snapsFetch('/snaps/source-library');
      if (!response.ok) {
        return;
      }
      setSourceLibrary(await response.json());
    } catch {
      setSourceLibrary([]);
    }
  };

  const loadReportHistory = async () => {
    try {
      const response = await snapsFetch('/snaps/report/history');
      if (!response.ok) {
        return;
      }
      setReportHistory(await response.json());
    } catch {
      setReportHistory([]);
    }
  };

  const loadHealth = async () => {
    setHealthLoading(true);
    try {
      const response = await snapsFetch('/snaps/health');
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      setHealth(await response.json());
    } catch (error) {
      setHealth({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setHealthLoading(false);
    }
  };

  const copyWorkspaceExport = async () => {
    try {
      const response = await snapsFetch('/snaps/export');
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const exported = await response.json();
      await navigator.clipboard.writeText(JSON.stringify(exported, null, 2));
      toast.show('snaps workspace export JSON을 복사했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '워크스페이스 내보내기에 실패했습니다.',
        'warning'
      );
    }
  };

  const importWorkspaceBackup = async () => {
    if (!workspaceImportText.trim()) {
      toast.show('가져올 snaps 워크스페이스 JSON을 붙여넣으세요.', 'warning');
      return;
    }
    if (
      !confirmOperatorAction(
        'snaps 워크스페이스 백업을 가져와 현재 조직의 원문, RAG, 보고서, 받은 반응함, 작업 기록에 병합할까요?'
      )
    ) {
      return;
    }

    setWorkspaceImporting(true);
    try {
      const payload = JSON.parse(workspaceImportText);
      const response = await snapsFetch('/snaps/import', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const imported = await response.json();
      await Promise.all([
        loadSourceLibrary(),
        loadStyleExamples(),
        loadReportHistory(),
        loadActivity(),
      ]);
      toast.show(
        `워크스페이스 가져오기 완료: 원문 ${imported.sources?.imported || 0}개, RAG ${imported.styleExamples?.imported || 0}개`
      );
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '워크스페이스 가져오기에 실패했습니다.',
        'warning'
      );
    } finally {
      setWorkspaceImporting(false);
    }
  };

  const loadActivity = async () => {
    try {
      const response = await snapsFetch('/snaps/activity');
      if (!response.ok) {
        return;
      }
      setActivity(await response.json());
    } catch {
      setActivity([]);
    }
  };

  const loadReplyCapabilities = async () => {
    try {
      const response = await snapsFetch('/snaps/inbox/reply-capabilities');
      if (!response.ok) {
        return;
      }
      setReplyCapabilities(await response.json());
    } catch {
      setReplyCapabilities(null);
    }
  };

  useEffect(() => {
    loadHealth();
    loadActivity();
    loadStyleExamples();
    loadSourceLibrary();
    loadReportHistory();
    loadReplyCapabilities();
  }, []);

  const updateVariant = (
    platform: TargetPlatform,
    patch: Partial<Pick<SnapsVariant, 'title' | 'content' | 'hashtags'>>
  ) => {
    setResult((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        variants: current.variants.map((variant) =>
          variant.platform === platform ? { ...variant, ...patch } : variant
        ),
      };
    });
  };

  const formatVariantPlainText = (variant: SnapsVariant) => {
    return [
      variant.title,
      variant.content,
      variant.hashtags?.length ? variant.hashtags.join(' ') : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  };

  const formatVariantMarkdown = (variant: SnapsVariant) => {
    return [
      variant.title ? `# ${variant.title}` : '',
      variant.content,
      variant.hashtags?.length ? variant.hashtags.join(' ') : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  };

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const formatVariantHtml = (variant: SnapsVariant) => {
    const title = variant.title ? `<h1>${escapeHtml(variant.title)}</h1>` : '';
    const content = escapeHtml(variant.content).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br />');
    const tags = variant.hashtags?.length
      ? `<p>${variant.hashtags.map(escapeHtml).join(' ')}</p>`
      : '';
    return [title, `<p>${content}</p>`, tags].filter(Boolean).join('\n');
  };

  const transform = async () => {
    if (sourceText.trim().length < 5) {
      toast.show('원문을 먼저 입력하세요.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const response = await snapsFetch('/snaps/transform', {
        method: 'POST',
        body: JSON.stringify({
          sourceText,
          targetPlatforms: selectedPlatforms,
          tone,
          topic: sourceTopic,
          useRag,
        }),
      });

      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }

      const data = (await response.json()) as SnapsTransformResult;
      setResult(data);
      setActivePlatform(data.variants[0]?.platform || selectedPlatforms[0]);
      await loadActivity();
      toast.show('snaps 변환이 완료되었습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : 'snaps 변환에 실패했습니다.',
        'warning'
      );
    } finally {
      setLoading(false);
    }
  };

  const createDrafts = async () => {
    if (!result?.variants.length) {
      toast.show('먼저 변환 결과를 생성하세요.', 'warning');
      return;
    }

    const integrationsToUse = result.variants
      .filter((variant) => variant.publishMode === 'schedule')
      .map((variant) => ({
        platform: variant.platform,
        integrationId: connectedByPlatform[variant.platform]?.id,
      }))
      .filter((item) => item.integrationId);

    if (!integrationsToUse.length) {
      toast.show('연결된 발행 채널이 없습니다.', 'warning');
      return;
    }

    const needsNaverCafeSettings = integrationsToUse.some(
      (item) => item.platform === 'naver-cafe'
    );
    if (needsNaverCafeSettings && (!naverCafeClubId || !naverCafeMenuId)) {
      toast.show('네이버 카페 발행에는 카페 ID와 메뉴 ID가 필요합니다.', 'warning');
      return;
    }

    let publishDateIso: string | undefined;
    if (scheduleType === 'schedule') {
      const parsedPublishDate = new Date(publishDate);
      if (Number.isNaN(parsedPublishDate.getTime())) {
        toast.show('예약 시간을 입력하세요.', 'warning');
        return;
      }
      publishDateIso = parsedPublishDate.toISOString();
    }

    if (
      scheduleType === 'schedule' &&
      !confirmOperatorAction(
        `연결된 채널 ${integrationsToUse.length}개에 snaps 예약 게시물을 만들까요?`
      )
    ) {
      return;
    }

    const variantsForDraft = result.variants.map((variant) => {
      if (variant.platform !== 'naver-cafe') {
        return variant;
      }

      return {
        ...variant,
        settings: {
          ...variant.settings,
          clubId: naverCafeClubId,
          menuId: naverCafeMenuId,
          subject:
            variant.title ||
            variant.content.replace(/\s+/g, ' ').trim().slice(0, 80) ||
            'snaps 게시글',
        },
      };
    });

    setDrafting(true);
    try {
      const response = await snapsFetch('/snaps/schedule-variants', {
        method: 'POST',
        body: JSON.stringify({
          variants: variantsForDraft,
          scheduleType,
          ...(publishDateIso ? { publishDate: publishDateIso } : {}),
          integrations: integrationsToUse,
        }),
      });

      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }

      await response.json();
      await loadActivity();
      toast.show(
        scheduleType === 'schedule'
          ? '연결된 채널에 snaps 예약 게시물을 만들었습니다.'
          : '연결된 채널에 snaps 초안을 만들었습니다.'
      );
      router.push('/launches?display=list');
    } catch (error) {
      toast.show(
        error instanceof Error
          ? error.message
          : scheduleType === 'schedule'
            ? '예약 생성에 실패했습니다.'
            : '초안 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setDrafting(false);
    }
  };

  const togglePlatform = (platform: TargetPlatform) => {
    setSelectedPlatforms((current) => {
      if (current.includes(platform)) {
        return current.length === 1
          ? current
          : current.filter((item) => item !== platform);
      }
      return [...current, platform];
    });
  };

  const copyActive = async () => {
    if (!activeVariant) {
      return;
    }
    await navigator.clipboard.writeText(formatVariantPlainText(activeVariant));
    toast.show('클립보드에 복사했습니다.');
  };

  const copyActiveMarkdown = async () => {
    if (!activeVariant) {
      return;
    }
    await navigator.clipboard.writeText(formatVariantMarkdown(activeVariant));
    toast.show('Markdown으로 복사했습니다.');
  };

  const copyActiveHtml = async () => {
    if (!activeVariant) {
      return;
    }
    await navigator.clipboard.writeText(formatVariantHtml(activeVariant));
    toast.show('HTML로 복사했습니다.');
  };

  const saveSource = async () => {
    if (sourceText.trim().length < 5) {
      toast.show('저장할 원문을 입력하세요.', 'warning');
      return;
    }

    setSavingSource(true);
    try {
      const response = await snapsFetch('/snaps/source-library', {
        method: 'POST',
        body: JSON.stringify({
          title: sourceTitle,
          sourceText,
          sourcePlatform: 'manual',
          topic: sourceTopic,
          tone,
          tags: selectedPlatforms,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const saved = await response.json();
      setSourceTitle(saved.title || '');
      setActiveSourceId(saved.id || '');
      await loadSourceLibrary();
      await loadActivity();
      toast.show('원문을 snaps 라이브러리에 저장했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '원문 저장에 실패했습니다.',
        'warning'
      );
    } finally {
      setSavingSource(false);
    }
  };

  const deleteActiveSource = async () => {
    if (!activeSourceId) {
      toast.show('삭제할 저장 원문을 먼저 선택하세요.', 'warning');
      return;
    }

    const selectedSource = sourceLibrary.find((source) => source.id === activeSourceId);
    if (
      !confirmDestructive(
        `저장 원문 "${selectedSource?.title || activeSourceId}"을 삭제할까요?`
      )
    ) {
      return;
    }

    try {
      const response = await snapsFetch(`/snaps/source-library/${activeSourceId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      setActiveSourceId('');
      await loadSourceLibrary();
      await loadActivity();
      toast.show('저장 원문을 삭제했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '저장 원문 삭제에 실패했습니다.',
        'warning'
      );
    }
  };

  const promoteSourceToRag = async () => {
    if (!activeSourceId) {
      toast.show('RAG로 승격할 저장 원문을 먼저 선택하세요.', 'warning');
      return;
    }

    setSavingStyle(true);
    try {
      const response = await snapsFetch(
        `/snaps/source-library/${activeSourceId}/promote-to-rag`,
        {
          method: 'POST',
          body: JSON.stringify({
            platform: stylePlatform,
            tone,
            topic: sourceTopic || sourceTitle,
            authorType: 'source-library',
          }),
        }
      );
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const saved = await response.json();
      setStylePlatform(saved.platform || stylePlatform);
      setStyleSearchResult([]);
      await loadStyleExamples();
      await loadActivity();
      toast.show('저장 원문을 RAG 스타일 예시로 승격했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : 'RAG 승격에 실패했습니다.',
        'warning'
      );
    } finally {
      setSavingStyle(false);
    }
  };

  const saveStyleExample = async () => {
    if (styleExample.trim().length < 5) {
      toast.show('저장할 스타일 예시를 입력하세요.', 'warning');
      return;
    }

    setSavingStyle(true);
    try {
      const response = await snapsFetch('/snaps/rag/examples', {
        method: 'POST',
        body: JSON.stringify({
          platform: stylePlatform,
          content: styleExample,
          tone,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      setStyleExample('');
      await loadStyleExamples();
      await loadActivity();
      toast.show('RAG 스타일 예시를 저장했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '스타일 예시 저장에 실패했습니다.',
        'warning'
      );
    } finally {
      setSavingStyle(false);
    }
  };

  const searchStyleExamples = async () => {
    if (styleSearchQuery.trim().length < 2) {
      toast.show('검색할 문장을 입력하세요.', 'warning');
      return;
    }

    try {
      const response = await snapsFetch(
        `/snaps/rag/search?query=${encodeURIComponent(styleSearchQuery)}&platform=${stylePlatform}`
      );
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      setStyleSearchResult(await response.json());
      toast.show('유사 스타일 예시를 찾았습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '스타일 검색에 실패했습니다.',
        'warning'
      );
    }
  };

  const deleteStyleExample = async (exampleId: string) => {
    const selectedExample = [...styleSearchResult, ...styleExamples].find(
      (example) => example.id === exampleId
    );
    if (
      !confirmDestructive(
        `RAG 스타일 예시 "${selectedExample?.platform || exampleId}"를 삭제할까요?`
      )
    ) {
      return;
    }

    try {
      const response = await snapsFetch(`/snaps/rag/examples/${exampleId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      setStyleSearchResult((current) =>
        current.filter((example) => example.id !== exampleId)
      );
      await loadStyleExamples();
      await loadActivity();
      toast.show('RAG 스타일 예시를 삭제했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '스타일 예시 삭제에 실패했습니다.',
        'warning'
      );
    }
  };

  const rebuildRagEmbeddings = async () => {
    setSavingStyle(true);
    try {
      const response = await snapsFetch('/snaps/rag/rebuild', {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const rebuilt = await response.json();
      await loadStyleExamples();
      await loadActivity();
      toast.show(
        `RAG 임베딩 재생성 완료: ${rebuilt.rebuilt || 0}/${rebuilt.total || 0}`
      );
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : 'RAG 임베딩 재생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setSavingStyle(false);
    }
  };

  const generateReport = async () => {
    setReporting(true);
    try {
      const metrics = JSON.parse(reportMetrics);
      if (!Array.isArray(metrics)) {
        throw new Error('보고서 metrics JSON은 배열이어야 합니다.');
      }
      const response = await snapsFetch('/snaps/report/generate', {
        method: 'POST',
        body: JSON.stringify({
          title: 'snaps 성과 분석 보고서',
          metrics,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const report = await response.json();
      setReportResult(report);
      setActiveReportId(report.reportId || '');
      await loadReportHistory();
      await loadActivity();
      toast.show('분석 보고서를 생성했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '보고서 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setReporting(false);
    }
  };

  const generateExistingAnalyticsReport = async () => {
    const integrationIds = reportIntegrationIds
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const postIds = reportPostIds
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (!integrationIds.length && !postIds.length) {
      toast.show('통합 ID 또는 게시물 ID를 입력하세요.', 'warning');
      return;
    }

    setReporting(true);
    try {
      const response = await snapsFetch('/snaps/report/from-platform-analytics', {
        method: 'POST',
        body: JSON.stringify({
          title: 'snaps 분석 보고서',
          integrationIds,
          postIds,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const report = await response.json();
      setReportResult(report);
      setActiveReportId(report.reportId || '');
      await loadReportHistory();
      await loadActivity();
      toast.show('기존 analytics 기반 보고서를 생성했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '기존 analytics 보고서 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setReporting(false);
    }
  };

  const parseFeedbackItems = () => {
    const parsed: unknown = JSON.parse(feedbackText);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { items?: unknown }).items)
    ) {
      return (parsed as { items: unknown[] }).items;
    }
    throw new Error('피드백 JSON은 배열이거나 items 배열을 포함해야 합니다.');
  };

  const fillDemoWorkspaceImport = () => {
    setWorkspaceImportText(JSON.stringify(snapsDemoWorkspace, null, 2));
    toast.show('snaps demo workspace JSON을 채웠습니다.');
  };

  const copyReportExport = async (format: 'markdown' | 'html' | 'print-html') => {
    if (!activeReportId) {
      toast.show('먼저 저장된 보고서를 선택하거나 생성하세요.', 'warning');
      return;
    }

    try {
      const response = await snapsFetch(
        `/snaps/report/${activeReportId}/export?format=${format}`
      );
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const exported = await response.json();
      await navigator.clipboard.writeText(exported.content || '');
      toast.show(
        format === 'print-html'
          ? '브라우저 인쇄 PDF용 HTML을 복사했습니다.'
          : format === 'html'
          ? '보고서 HTML을 복사했습니다.'
          : '보고서 Markdown을 복사했습니다.'
      );
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '보고서 export에 실패했습니다.',
        'warning'
      );
    }
  };

  const deleteActiveReport = async () => {
    if (!activeReportId) {
      toast.show('삭제할 보고서를 먼저 선택하세요.', 'warning');
      return;
    }

    const selectedReport = reportHistory.find((report) => report.id === activeReportId);
    if (
      !confirmDestructive(
        `보고서 "${selectedReport?.title || reportResult?.title || activeReportId}"를 삭제할까요?`
      )
    ) {
      return;
    }

    try {
      const response = await snapsFetch(`/snaps/report/${activeReportId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      setActiveReportId('');
      setReportResult(null);
      await loadReportHistory();
      await loadActivity();
      toast.show('보고서를 삭제했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '보고서 삭제에 실패했습니다.',
        'warning'
      );
    }
  };

  const promoteReportToRag = async () => {
    if (!activeReportId) {
      toast.show('RAG로 저장할 보고서를 먼저 선택하거나 생성하세요.', 'warning');
      return;
    }

    setSavingStyle(true);
    try {
      const response = await snapsFetch(
        `/snaps/report/${activeReportId}/promote-to-rag`,
        {
          method: 'POST',
          body: JSON.stringify({
            platform: stylePlatform,
            tone,
            topic: sourceTopic || reportResult?.title || 'snaps 분석 보고서',
            authorType: 'analytics-report',
          }),
        }
      );
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      await response.json();
      await loadStyleExamples();
      await loadActivity();
      toast.show('보고서 인사이트를 RAG 스타일 가이드로 저장했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '보고서 RAG 저장에 실패했습니다.',
        'warning'
      );
    } finally {
      setSavingStyle(false);
    }
  };

  const importFeedback = async () => {
    setFeedbackLoading(true);
    try {
      const items = parseFeedbackItems();
      const response = await snapsFetch('/snaps/inbox/import', {
        method: 'POST',
        body: JSON.stringify({ items }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      setFeedbackResult(await response.json());
      await loadActivity();
      toast.show('피드백을 받은 반응함에 저장했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '피드백 저장에 실패했습니다.',
        'warning'
      );
    } finally {
      setFeedbackLoading(false);
    }
  };

  const importPostComments = async () => {
    const postIds = feedbackPostIds
      .split(/[\n,]/)
      .map((postId) => postId.trim())
      .filter(Boolean);

    if (!postIds.length) {
      toast.show('가져올 연결 게시물 ID를 입력하세요.', 'warning');
      return;
    }

    setFeedbackLoading(true);
    try {
      const response = await snapsFetch('/snaps/inbox/import-post-comments', {
        method: 'POST',
        body: JSON.stringify({
          defaultPlatform: feedbackPostPlatform,
          sources: postIds.map((postId) => ({
            postId,
            platform: feedbackPostPlatform,
          })),
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const imported = await response.json();
      setFeedbackResult(imported);

      const summaryResponse = await snapsFetch('/snaps/inbox/summary', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (summaryResponse.ok) {
        setFeedbackSummary(await summaryResponse.json());
      }

      await loadActivity();
      toast.show(`연결 게시물 댓글 ${imported.imported || 0}개를 받은 반응함으로 가져왔습니다.`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '연결 게시물 댓글 가져오기에 실패했습니다.',
        'warning'
      );
    } finally {
      setFeedbackLoading(false);
    }
  };

  const summarizeFeedback = async (fromText = false) => {
    setFeedbackLoading(true);
    try {
      const response = await snapsFetch('/snaps/inbox/summary', {
        method: 'POST',
        body: JSON.stringify(fromText ? { items: parseFeedbackItems() } : {}),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      setFeedbackSummary(await response.json());
      await loadActivity();
      toast.show('피드백 요약을 생성했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '피드백 요약에 실패했습니다.',
        'warning'
      );
    } finally {
      setFeedbackLoading(false);
    }
  };

  const createReplyDraft = async () => {
    if (!feedbackReplyPostId.trim() || !feedbackReplyText.trim()) {
      toast.show('답글을 저장할 post ID와 답글 내용을 입력하세요.', 'warning');
      return;
    }

    setFeedbackLoading(true);
    try {
      const response = await snapsFetch('/snaps/inbox/reply-draft', {
        method: 'POST',
        body: JSON.stringify({
          postId: feedbackReplyPostId.trim(),
          reply: feedbackReplyText.trim(),
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      await response.json();
      await loadActivity();
      toast.show('댓글 초안으로 저장했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '답글 초안 저장에 실패했습니다.',
        'warning'
      );
    } finally {
      setFeedbackLoading(false);
    }
  };

  const publishPlatformReply = async () => {
    if (!feedbackReplyIntegrationId || !feedbackReplyPlatformPostId.trim() || !feedbackReplyText.trim()) {
      toast.show('연결 채널, 플랫폼 post ID, 답글 내용을 입력하세요.', 'warning');
      return;
    }

    const selectedIntegration = replyIntegrationOptions.find(
      (integration) => integration.id === feedbackReplyIntegrationId
    );
    if (
      !confirmOperatorAction(
        `연결 채널 "${selectedIntegration?.name || feedbackReplyIntegrationId}"에 답글을 실제 게시할까요?`
      )
    ) {
      return;
    }

    setFeedbackLoading(true);
    try {
      const response = await snapsFetch('/snaps/inbox/publish-reply', {
        method: 'POST',
        body: JSON.stringify({
          integrationId: feedbackReplyIntegrationId,
          platformPostId: feedbackReplyPlatformPostId.trim(),
          lastCommentId: feedbackReplyLastCommentId.trim() || undefined,
          reply: feedbackReplyText.trim(),
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      await response.json();
      await loadActivity();
      toast.show('플랫폼 답글을 게시했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '플랫폼 답글 게시에 실패했습니다.',
        'warning'
      );
    } finally {
      setFeedbackLoading(false);
    }
  };

  const clearFeedbackInbox = async () => {
    if (!confirmDestructive('저장된 snaps 받은 반응함 피드백을 모두 비울까요?')) {
      return;
    }

    setFeedbackLoading(true);
    try {
      const response = await snapsFetch('/snaps/inbox/items', {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const cleared = await response.json();
      setFeedbackResult(null);
      setFeedbackSummary(null);
      await loadActivity();
      toast.show(`저장된 받은 반응함 피드백 ${cleared.deleted || 0}개를 비웠습니다.`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '저장된 받은 반응함 비우기에 실패했습니다.',
        'warning'
      );
    } finally {
      setFeedbackLoading(false);
    }
  };

  const generateShorts = async (generateVideo: boolean) => {
    if (sourceText.trim().length < 5) {
      toast.show('쇼츠 대본으로 만들 원문을 입력하세요.', 'warning');
      return;
    }

    if (
      generateVideo &&
      !confirmOperatorAction('Pixelle에 쇼츠 생성 작업을 요청할까요?')
    ) {
      return;
    }

    setVideoLoading(true);
    try {
      const response = await snapsFetch(
        generateVideo ? '/snaps/video/generate-short' : '/snaps/video/script',
        {
          method: 'POST',
          body: JSON.stringify({
            sourceText,
            durationSeconds: 45,
            platform: 'youtube',
          }),
        }
      );
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const data = await response.json();
      setVideoResult(data);
      const foundVideoUrl = extractVideoUrl(data);
      if (foundVideoUrl) {
        setVideoUrl(foundVideoUrl);
      }
      await loadActivity();
      toast.show(generateVideo ? 'Pixelle 쇼츠 요청을 처리했습니다.' : '쇼츠 대본을 생성했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '쇼츠 생성에 실패했습니다.',
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

    const targetPlatformsForVideo = (['instagram', 'youtube', 'tiktok'] as TargetPlatform[])
      .filter((platform) => selectedPlatforms.includes(platform))
      .filter((platform) => connectedByPlatform[platform]?.id);

    if (!targetPlatformsForVideo.length) {
      toast.show('Instagram, YouTube, TikTok 중 연결된 채널이 필요합니다.', 'warning');
      return;
    }

    setVideoDrafting(true);
    try {
      let publishDateIso: string | undefined;
      if (scheduleType === 'schedule') {
        const parsedPublishDate = new Date(publishDate);
        if (Number.isNaN(parsedPublishDate.getTime())) {
          toast.show('쇼츠 예약 시간을 입력하세요.', 'warning');
          setVideoDrafting(false);
          return;
        }
        publishDateIso = parsedPublishDate.toISOString();
      }

      if (
        scheduleType === 'schedule' &&
        !confirmOperatorAction(
          `연결된 쇼츠 채널 ${targetPlatformsForVideo.length}개에 예약 게시물을 만들까요?`
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
          title: shortsScript?.uploadMetadata?.title || shortsScript?.title || 'snaps 쇼츠',
          caption:
            shortsScript?.caption ||
            shortsScript?.uploadMetadata?.description ||
            shortsScript?.narration ||
            sourceText,
          saveToMediaLibrary: saveVideoToMediaLibrary,
          scheduleType,
          ...(publishDateIso ? { publishDate: publishDateIso } : {}),
          targetPlatforms: targetPlatformsForVideo,
          integrations: targetPlatformsForVideo.map((platform) => ({
            platform,
            integrationId: connectedByPlatform[platform].id,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }

      await response.json();
      await loadActivity();
      toast.show(
        scheduleType === 'schedule'
          ? '쇼츠 영상을 연결된 채널 예약 게시물에 첨부했습니다.'
          : '쇼츠 영상을 연결된 채널 초안에 첨부했습니다.'
      );
      router.push('/launches?display=list');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '쇼츠 초안 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setVideoDrafting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-[16px] text-newTextColor">
      <div className="flex flex-col gap-[6px]">
        <div className="text-[28px] font-[700]">snaps 스튜디오</div>
        <div className="text-[13px] text-textItemBlur">
          원문을 플랫폼별 발행 초안으로 변환합니다.
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] maxMedia:grid-cols-1 gap-[12px] bg-newBgColorInner border border-newBorder rounded-[8px] p-[14px]">
        <div className="grid grid-cols-7 maxMedia:grid-cols-2 gap-[10px] text-[12px]">
          <div>
            <div className="text-textItemBlur">Ollama</div>
            <div className={health?.ollama?.ok ? 'text-emerald-300' : 'text-amber-300'}>
              {health?.ollama?.ok ? '모델 준비됨' : '모델 확인 필요'}
            </div>
          </div>
          <div>
            <div className="text-textItemBlur">채팅 모델</div>
            <div>
              {health?.ollama?.chatModel || '-'}
              {health?.ollama?.chatModelAvailable === false ? ' 누락' : ''}
            </div>
          </div>
          <div>
            <div className="text-textItemBlur">임베딩 모델</div>
            <div>
              {health?.ollama?.embedModel || '-'}
              {health?.ollama?.embedModelAvailable === false ? ' 누락' : ''}
            </div>
          </div>
          <div>
            <div className="text-textItemBlur">RAG</div>
            <div>{health?.rag?.enabled ? `${health.rag.topK}개 참조` : '꺼짐'}</div>
          </div>
          <div>
            <div className="text-textItemBlur">Pixelle</div>
            <div>{health?.pixelle?.configured ? '연결됨' : '대본만'}</div>
          </div>
          <div>
            <div className="text-textItemBlur">네이버 카페</div>
            <div>{health?.koreanSns?.naverCafeConfigured ? '연결됨' : '설정 보조'}</div>
          </div>
          <div>
            <div className="text-textItemBlur">규칙 대체</div>
            <div>{health?.fallback?.ruleFallbackEnabled ? '사용' : '엄격'}</div>
          </div>
        </div>
        <div className="flex gap-[8px]">
          <Button
            secondary
            loading={healthLoading}
            onClick={loadHealth}
            className="rounded-[8px] !h-[38px]"
          >
            상태 확인
          </Button>
          <Button
            secondary
            onClick={copyWorkspaceExport}
            className="rounded-[8px] !h-[38px]"
          >
            내보내기
          </Button>
        </div>
      </div>

      <details className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[14px]">
        <summary className="cursor-pointer text-[13px] font-[700]">
          워크스페이스 가져오기
        </summary>
        <div className="mt-[12px] grid grid-cols-[1fr_120px_120px] maxMedia:grid-cols-1 gap-[8px]">
          <textarea
            value={workspaceImportText}
            onChange={(event) => setWorkspaceImportText(event.target.value)}
            className="min-h-[86px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.5] font-mono"
            placeholder="snaps 워크스페이스 내보내기 JSON"
          />
          <Button
            secondary
            onClick={fillDemoWorkspaceImport}
            className="rounded-[8px] !h-[38px]"
          >
            데모 채우기
          </Button>
          <Button
            secondary
            loading={workspaceImporting}
            onClick={importWorkspaceBackup}
            className="rounded-[8px] !h-[38px]"
          >
            가져오기
          </Button>
        </div>
      </details>

      <div className="grid grid-cols-[minmax(320px,0.95fr)_minmax(360px,1.35fr)] maxMedia:grid-cols-1 gap-[16px] min-h-0 flex-1">
        <section className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[18px] flex flex-col gap-[14px] min-h-[620px]">
          <div className="flex items-center justify-between gap-[10px]">
            <div className="text-[16px] font-[700]">원문</div>
            <div
              className={clsx(
                'text-[11px] px-[8px] py-[4px] rounded-[999px]',
                result?.provider === 'ollama'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-amber-500/15 text-amber-300'
              )}
            >
              {result ? `${result.provider} · ${result.model}` : '준비됨'}
            </div>
          </div>

          <div className="grid grid-cols-[1fr_112px] gap-[8px]">
            <input
              value={sourceTitle}
              onChange={(event) => setSourceTitle(event.target.value)}
              className="h-[40px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="원문 제목"
            />
            <Button
              secondary
              loading={savingSource}
              onClick={saveSource}
              className="rounded-[8px] !h-[40px]"
            >
              원문 저장
            </Button>
          </div>

          <input
            value={sourceTopic}
            onChange={(event) => setSourceTopic(event.target.value)}
            className="h-[40px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="주제 / 캠페인"
          />

          {!!sourceLibrary.length && (
            <div className="grid grid-cols-[1fr_72px_96px] maxMedia:grid-cols-1 gap-[8px]">
              <select
                value={activeSourceId}
                onChange={(event) => {
                  setActiveSourceId(event.target.value);
                  const selected = sourceLibrary.find(
                    (source) => source.id === event.target.value
                  );
                  if (selected) {
                    setSourceTitle(selected.title || '');
                    setSourceTopic(selected.topic || '');
                    setSourceText(selected.sourceText || '');
                    setTone(selected.tone || tone);
                  }
                }}
                className="h-[40px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              >
                <option value="">저장된 원문 불러오기</option>
                {sourceLibrary.slice(0, 20).map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.title}
                  </option>
                ))}
              </select>
              <Button
                secondary
                onClick={deleteActiveSource}
                className="rounded-[8px] !h-[40px]"
              >
                삭제
              </Button>
              <Button
                secondary
                loading={savingStyle}
                onClick={promoteSourceToRag}
                className="rounded-[8px] !h-[40px]"
              >
                RAG 승격
              </Button>
            </div>
          )}

          <textarea
            value={sourceText}
            onChange={(event) => setSourceText(event.target.value)}
            className="min-h-[250px] flex-1 resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[14px] text-[14px] leading-[1.7]"
            placeholder="원문 콘텐츠를 입력하세요."
          />

          <label className="flex flex-col gap-[8px] text-[13px]">
            톤
            <input
              value={tone}
              onChange={(event) => setTone(event.target.value)}
              className="h-[42px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[12px]"
            />
          </label>

          <div className="flex flex-wrap gap-[8px]">
            {targetPlatforms.map((platform) => (
              <button
                key={platform.id}
                onClick={() => togglePlatform(platform.id)}
                className={clsx(
                  'h-[34px] px-[12px] rounded-[8px] text-[12px] border',
                  selectedPlatforms.includes(platform.id)
                    ? 'bg-btnPrimary text-white border-btnPrimary'
                    : 'bg-newBgLineColor border-newBorder text-textItemBlur'
                )}
              >
                {platform.label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-[8px] text-[13px] text-textItemBlur">
            <input
              type="checkbox"
              checked={useRag}
              onChange={(event) => setUseRag(event.target.checked)}
            />
            RAG 스타일 예시 사용
          </label>

          {selectedPlatforms.includes('naver-cafe') && (
            <div className="grid grid-cols-2 gap-[8px]">
              <input
                value={naverCafeClubId}
                onChange={(event) => setNaverCafeClubId(event.target.value)}
                className="h-[40px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
                placeholder="네이버 카페 ID"
              />
              <input
                value={naverCafeMenuId}
                onChange={(event) => setNaverCafeMenuId(event.target.value)}
                className="h-[40px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
                placeholder="메뉴 ID"
              />
            </div>
          )}

          <div className="grid grid-cols-[140px_1fr] maxMedia:grid-cols-1 gap-[8px]">
            <select
              value={scheduleType}
              onChange={(event) =>
                setScheduleType(event.target.value as 'draft' | 'schedule')
              }
              className="h-[40px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            >
              <option value="draft">초안</option>
              <option value="schedule">예약</option>
            </select>
            <input
              type="datetime-local"
              value={publishDate}
              disabled={scheduleType === 'draft'}
              onChange={(event) => setPublishDate(event.target.value)}
              className="h-[40px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px] disabled:opacity-50"
            />
          </div>

          <div className="flex gap-[10px]">
            <Button
              loading={loading}
              onClick={transform}
              className="rounded-[8px] !h-[44px] flex-1"
            >
              AI 변환
            </Button>
            <Button
              secondary
              loading={drafting}
              onClick={createDrafts}
              className="rounded-[8px] !h-[44px] flex-1"
            >
              {scheduleType === 'schedule' ? '예약 생성' : '초안 생성'}
            </Button>
          </div>

          <div className="border-t border-newBorder pt-[14px] flex flex-col gap-[10px]">
            <div className="text-[14px] font-[700]">RAG 스타일</div>
            <div className="grid grid-cols-[1fr_1fr] gap-[8px]">
              <select
                value={stylePlatform}
                onChange={(event) => setStylePlatform(event.target.value as TargetPlatform)}
                className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              >
                {targetPlatforms.map((platform) => (
                  <option key={platform.id} value={platform.id}>
                    {platform.label}
                  </option>
                ))}
              </select>
              <Button
                secondary
                loading={savingStyle}
                onClick={saveStyleExample}
                className="rounded-[8px] !h-[38px]"
              >
                예시 저장
              </Button>
            </div>
            <Button
              secondary
              loading={savingStyle}
              onClick={rebuildRagEmbeddings}
              className="rounded-[8px] !h-[36px]"
            >
              RAG 임베딩 재생성
            </Button>
            <textarea
              value={styleExample}
              onChange={(event) => setStyleExample(event.target.value)}
              className="min-h-[82px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[12px] text-[12px] leading-[1.6]"
              placeholder="좋은 예시 게시물을 붙여넣으면 이후 변환에 스타일 근거로 사용됩니다."
            />
            <div className="grid grid-cols-[1fr_72px] gap-[8px]">
              <input
                value={styleSearchQuery}
                onChange={(event) => setStyleSearchQuery(event.target.value)}
                className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
                placeholder="유사 스타일 검색"
              />
              <Button
                secondary
                onClick={searchStyleExamples}
                className="rounded-[8px] !h-[38px]"
              >
                검색
              </Button>
            </div>
            <div className="max-h-[120px] overflow-auto rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px] leading-[1.5]">
              {(styleSearchResult.length ? styleSearchResult : styleExamples)
                .slice(0, 4)
                .map((example) => (
                  <div key={example.id} className="border-b border-newBorder last:border-0 py-[6px]">
                    <div className="flex items-center justify-between gap-[8px] text-textItemBlur">
                      <span>
                        {example.platform}
                        {typeof example.score === 'number'
                          ? ` · ${example.score.toFixed(2)}`
                          : ''}
                      </span>
                      <button
                        onClick={() => deleteStyleExample(example.id)}
                        className="text-[11px] text-amber-200 hover:text-amber-100"
                      >
                        삭제
                      </button>
                    </div>
                    <div className="line-clamp-2">{example.content}</div>
                  </div>
                ))}
              {!styleExamples.length && !styleSearchResult.length && (
                <div className="text-textItemBlur">저장된 스타일 예시가 없습니다.</div>
              )}
            </div>
          </div>

          <div className="border-t border-newBorder pt-[14px] flex flex-col gap-[10px]">
            <div className="text-[14px] font-[700]">쇼츠</div>
            <div className="grid grid-cols-[1fr_1fr] gap-[8px]">
              <Button
                secondary
                loading={videoLoading}
                onClick={() => generateShorts(false)}
                className="rounded-[8px] !h-[38px]"
              >
                대본 생성
              </Button>
              <Button
                secondary
                loading={videoLoading}
                onClick={() => generateShorts(true)}
                className="rounded-[8px] !h-[38px]"
              >
                Pixelle 요청
              </Button>
            </div>
          </div>
        </section>

        <section className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[18px] flex flex-col gap-[14px] min-h-[620px]">
          <div className="flex items-center justify-between gap-[10px]">
            <div className="text-[16px] font-[700]">채널별 결과</div>
            <div className="flex gap-[8px]">
              <button
                onClick={copyActive}
                disabled={!activeVariant}
                className="h-[34px] px-[12px] rounded-[8px] bg-btnSimple text-[12px] disabled:opacity-40"
              >
                복사
              </button>
              <button
                onClick={copyActiveMarkdown}
                disabled={!activeVariant}
                className="h-[34px] px-[12px] rounded-[8px] bg-btnSimple text-[12px] disabled:opacity-40"
              >
                MD
              </button>
              <button
                onClick={copyActiveHtml}
                disabled={!activeVariant}
                className="h-[34px] px-[12px] rounded-[8px] bg-btnSimple text-[12px] disabled:opacity-40"
              >
                HTML
              </button>
            </div>
          </div>

          <div className="flex gap-[8px] overflow-x-auto pb-[4px]">
            {(result?.variants || []).map((variant) => (
              <button
                key={variant.platform}
                onClick={() => setActivePlatform(variant.platform)}
                className={clsx(
                  'h-[34px] px-[12px] rounded-[8px] text-[12px] whitespace-nowrap border',
                  activeVariant?.platform === variant.platform
                    ? 'bg-btnPrimary border-btnPrimary text-white'
                    : 'bg-newBgLineColor border-newBorder text-textItemBlur'
                )}
              >
                {variant.label}
              </button>
            ))}
          </div>

          {!activeVariant ? (
            <div className="flex-1 rounded-[8px] border border-dashed border-newBorder bg-newBgLineColor flex items-center justify-center text-textItemBlur text-[14px]">
              변환 결과가 여기에 표시됩니다.
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col gap-[12px]">
              <div className="flex items-center gap-[8px]">
                <div className="text-[18px] font-[700]">{activeVariant.label}</div>
                <div className="text-[11px] px-[8px] py-[4px] rounded-[999px] bg-newBgLineColor text-textItemBlur">
                  {activeVariant.publishMode === 'schedule' ? '예약 가능' : '수동 보조'}
                </div>
                {connectedByPlatform[activeVariant.platform] && (
                  <div className="text-[11px] px-[8px] py-[4px] rounded-[999px] bg-emerald-500/15 text-emerald-300">
                    연결됨
                  </div>
                )}
              </div>

              <input
                value={activeVariant.title || ''}
                onChange={(event) =>
                  updateVariant(activeVariant.platform, {
                    title: event.target.value,
                  })
                }
                className="h-[42px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[12px] text-[14px]"
                placeholder="제목"
              />

              <textarea
                value={activeVariant.content}
                onChange={(event) =>
                  updateVariant(activeVariant.platform, {
                    content: event.target.value,
                  })
                }
                className="flex-1 min-h-[360px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[14px] text-[14px] leading-[1.7]"
              />

              <input
                value={activeVariant.hashtags?.join(' ') || ''}
                onChange={(event) =>
                  updateVariant(activeVariant.platform, {
                    hashtags: event.target.value
                      .split(/\s+/)
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  })
                }
                className="h-[42px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[12px] text-[13px]"
                placeholder="#태그 #해시태그"
              />

              {!!activeVariant.hashtags?.length && (
                <div className="flex flex-wrap gap-[8px] text-[12px]">
                  {activeVariant.hashtags.map((tag) => (
                    <span
                      key={tag}
                      className="px-[8px] py-[5px] rounded-[999px] bg-btnSimple"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {!!assistChecklist(activeVariant).length && (
                <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px] text-[12px] leading-[1.6]">
                  <div className="font-[700] mb-[6px]">수동 게시 체크리스트</div>
                  <div className="flex flex-col gap-[4px] text-textItemBlur">
                    {assistChecklist(activeVariant).map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!!result?.warnings?.length && (
            <div className="rounded-[8px] border border-amber-500/30 bg-amber-500/10 p-[12px] text-[12px] text-amber-200">
              {result.warnings[0]}
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-3 maxMedia:grid-cols-1 gap-[16px]">
        <section className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[18px] flex flex-col gap-[12px]">
          <div className="flex items-center justify-between gap-[10px]">
            <div className="text-[16px] font-[700]">성과 분석 보고서</div>
            <div className="flex gap-[8px]">
              <Button
                secondary
                loading={reporting}
                onClick={generateReport}
                className="rounded-[8px] !h-[36px]"
              >
                JSON
              </Button>
              <Button
                secondary
                loading={reporting}
                onClick={generateExistingAnalyticsReport}
                className="rounded-[8px] !h-[36px]"
              >
                기존 데이터
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-[8px]">
            <input
              value={reportIntegrationIds}
              onChange={(event) => setReportIntegrationIds(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="연동 채널 ID"
            />
            <input
              value={reportPostIds}
              onChange={(event) => setReportPostIds(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="게시물 ID"
            />
          </div>
          {!!reportHistory.length && (
            <div className="grid grid-cols-[1fr_72px] gap-[8px]">
              <select
                value={activeReportId}
                onChange={(event) => {
                  setActiveReportId(event.target.value);
                  const selected = reportHistory.find(
                    (report) => report.id === event.target.value
                  );
                  if (selected) {
                    setReportResult(selected.report);
                  }
                }}
                className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              >
                <option value="">저장된 보고서 불러오기</option>
                {reportHistory.slice(0, 20).map((report) => (
                  <option key={report.id} value={report.id}>
                    {report.title}
                  </option>
                ))}
              </select>
              <Button
                secondary
                onClick={deleteActiveReport}
                className="rounded-[8px] !h-[38px]"
              >
                삭제
              </Button>
            </div>
          )}
          <textarea
            value={reportMetrics}
            onChange={(event) => setReportMetrics(event.target.value)}
            className="min-h-[120px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[12px] text-[12px] leading-[1.6] font-mono"
          />
          {reportResult && (
            <div className="flex flex-col gap-[10px]">
              <div className="flex gap-[8px]">
                <Button
                  secondary
                  onClick={() => copyReportExport('markdown')}
                  className="rounded-[8px] !h-[34px]"
                >
                  MD 복사
                </Button>
                <Button
                  secondary
                  onClick={() => copyReportExport('html')}
                  className="rounded-[8px] !h-[34px]"
                >
                  HTML 복사
                </Button>
                <Button
                  secondary
                  onClick={() => copyReportExport('print-html')}
                  className="rounded-[8px] !h-[34px]"
                >
                  PDF HTML
                </Button>
                <Button
                  secondary
                  loading={savingStyle}
                  onClick={promoteReportToRag}
                  className="rounded-[8px] !h-[34px]"
                >
                  RAG 저장
                </Button>
              </div>
              <div className="rounded-[8px] bg-newBgLineColor border border-newBorder p-[12px] text-[13px] leading-[1.6]">
                <div className="font-[700] mb-[6px]">{reportResult.title}</div>
                {reportResult.summary}
              </div>
              {!!reportResult.warnings?.length && (
                <div className="rounded-[8px] border border-yellow-500/40 bg-yellow-500/10 p-[12px] text-[12px] leading-[1.6]">
                  <div className="font-[700] mb-[6px]">수집 경고</div>
                  <div className="flex flex-col gap-[4px]">
                    {reportResult.warnings.slice(0, 5).map((warning) => (
                      <div key={warning}>{warning}</div>
                    ))}
                  </div>
                </div>
              )}
              {!!reportResult.insights?.length && (
                <div className="flex flex-col gap-[6px] text-[12px]">
                  {reportResult.insights.map((insight: string) => (
                    <div key={insight} className="rounded-[8px] bg-btnSimple px-[10px] py-[8px]">
                      {insight}
                    </div>
                  ))}
                </div>
              )}
              {!!reportResult.actionItems?.length && (
                <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px]">
                  <div className="text-[12px] font-[700] mb-[8px]">다음 실행 항목</div>
                  <div className="flex flex-col gap-[6px] text-[12px] text-textItemBlur">
                    {reportResult.actionItems.map((action: string) => (
                      <div key={action}>{action}</div>
                    ))}
                  </div>
                </div>
              )}
              {!!reportResult.trends?.length && (
                <div className="grid grid-cols-2 gap-[8px]">
                  {reportResult.trends.slice(0, 6).map((trend) => (
                    <div
                      key={`${trend.platform}-${trend.metricKey}`}
                      className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
                    >
                      <div className="text-[11px] text-textItemBlur">{trend.platform}</div>
                      <div className="text-[12px] font-[700]">{trend.metricKey}</div>
                      <div className="mt-[4px] text-[11px] text-textItemBlur">
                        {trend.firstValue} {'->'} {trend.lastValue} ({trend.delta})
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!!reportChartEntries.length && (
                <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px]">
                  <div className="text-[12px] font-[700] mb-[10px]">지표 대시보드</div>
                  <div className="grid grid-cols-2 gap-[10px]">
                    {reportChartEntries.map((chart) => (
                      <div
                        key={`${chart.platform}-${chart.metricKey}`}
                        className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px]"
                      >
                        <div className="flex justify-between gap-[8px] text-[11px] mb-[8px]">
                          <span className="font-[700]">{chart.metricKey}</span>
                          <span className="text-textItemBlur">{chart.platform}</span>
                        </div>
                        <div className="flex flex-col gap-[5px]">
                          {chart.points.map((point, index) => (
                            <div
                              key={`${point.date}-${index}`}
                              className="grid grid-cols-[70px_1fr_44px] items-center gap-[6px] text-[10px] text-textItemBlur"
                            >
                              <span className="truncate">
                                {String(point.date || '').slice(5, 10) || '-'}
                              </span>
                              <div className="h-[6px] rounded-[999px] bg-black/20 overflow-hidden">
                                <div
                                  className="h-full rounded-[999px] bg-btnPrimary"
                                  style={{
                                    width: `${Math.max(
                                      4,
                                      Math.round((Number(point.value || 0) / chart.max) * 100)
                                    )}%`,
                                  }}
                                />
                              </div>
                              <span className="text-right">{Number(point.value || 0)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!!reportPlatformEntries.length && (
                <div className="grid grid-cols-2 gap-[8px]">
                  {reportPlatformEntries.map(([platform, metrics]) => (
                    <div key={platform} className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]">
                      <div className="text-[12px] font-[700] mb-[6px]">{platform}</div>
                      {Object.entries(metrics).map(([key, value]) => (
                        <div key={key} className="flex justify-between gap-[8px] text-[11px] text-textItemBlur">
                          <span>{key}</span>
                          <span>{value}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              <details className="text-[12px] text-textItemBlur">
                <summary className="cursor-pointer">JSON</summary>
                <pre className="mt-[8px] max-h-[180px] overflow-auto whitespace-pre-wrap bg-newBgLineColor border border-newBorder rounded-[8px] p-[12px] leading-[1.6]">
                  {JSON.stringify(reportResult, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </section>

        <section className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[18px] flex flex-col gap-[12px]">
          <div className="flex items-center justify-between gap-[10px]">
            <div className="text-[16px] font-[700]">Pixelle 쇼츠 결과</div>
            <Button
              secondary
              loading={videoDrafting}
              onClick={attachShortsToDraft}
              className="rounded-[8px] !h-[36px]"
            >
              {scheduleType === 'schedule' ? '예약 첨부' : '초안 첨부'}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-[8px]">
            <input
              value={videoUrl}
              onChange={(event) => setVideoUrl(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="영상 URL"
            />
            <input
              value={videoThumbnail}
              onChange={(event) => setVideoThumbnail(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="썸네일 URL"
            />
          </div>
          <label className="flex items-center gap-[8px] text-[12px] text-textItemBlur">
            <input
              type="checkbox"
              checked={saveVideoToMediaLibrary}
              onChange={(event) => setSaveVideoToMediaLibrary(event.target.checked)}
            />
            미디어 라이브러리에 영상 URL 저장
          </label>
          {shortsScript ? (
            <div className="flex flex-col gap-[10px]">
              {!!shortsScript.coreSummary && (
                <div className="rounded-[8px] bg-newBgLineColor border border-newBorder p-[10px] text-[12px] leading-[1.5]">
                  <div className="font-[700] mb-[4px]">핵심 요약</div>
                  {shortsScript.coreSummary}
                </div>
              )}
              <div className="rounded-[8px] bg-newBgLineColor border border-newBorder p-[12px]">
                <div className="text-[14px] font-[700]">{shortsScript.title}</div>
                <div className="mt-[6px] text-[12px] text-amber-200">{shortsScript.hook}</div>
              </div>
              <div className="rounded-[8px] bg-newBgLineColor border border-newBorder p-[12px] text-[12px] leading-[1.6]">
                {shortsScript.narration}
              </div>
              {!!shortsScript.storyboard?.length && (
                <div className="max-h-[180px] overflow-auto flex flex-col gap-[8px]">
                  {shortsScript.storyboard.map((scene) => (
                    <div key={scene.scene} className="rounded-[8px] bg-btnSimple p-[10px] text-[12px] leading-[1.5]">
                      <div className="font-[700]">
                        장면 {scene.scene}
                        {scene.startSecond !== undefined && scene.endSecond !== undefined
                          ? ` · ${scene.startSecond}-${scene.endSecond}s`
                          : ''}
                      </div>
                      <div>{scene.visual}</div>
                      {!!scene.overlayText && (
                        <div className="text-textItemBlur">화면 자막: {scene.overlayText}</div>
                      )}
                      <div className="text-textItemBlur">{scene.narration}</div>
                      {!!scene.pixellePrompt && (
                        <div className="mt-[4px] text-textItemBlur">
                          Pixelle: {scene.pixellePrompt}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {!!shortsScript.uploadMetadata && (
                <div className="rounded-[8px] bg-newBgLineColor border border-newBorder p-[10px] text-[12px] leading-[1.5]">
                  <div className="font-[700] mb-[4px]">업로드 메타데이터</div>
                  <div>{shortsScript.uploadMetadata.title}</div>
                  <div className="text-textItemBlur">{shortsScript.uploadMetadata.description}</div>
                  {!!shortsScript.uploadMetadata.hashtags?.length && (
                    <div className="mt-[6px] text-textItemBlur">
                      {shortsScript.uploadMetadata.hashtags.join(' ')}
                    </div>
                  )}
                </div>
              )}
              <details className="text-[12px] text-textItemBlur">
                <summary className="cursor-pointer">JSON</summary>
                <pre className="mt-[8px] max-h-[180px] overflow-auto whitespace-pre-wrap bg-newBgLineColor border border-newBorder rounded-[8px] p-[12px] leading-[1.6]">
                  {JSON.stringify(videoResult, null, 2)}
                </pre>
              </details>
            </div>
          ) : (
            <div className="min-h-[180px] rounded-[8px] border border-dashed border-newBorder bg-newBgLineColor flex items-center justify-center text-textItemBlur text-[14px]">
              쇼츠 대본 또는 Pixelle 작업 결과가 여기에 표시됩니다.
            </div>
          )}
        </section>

        <section className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[18px] flex flex-col gap-[12px]">
          <div className="flex items-center justify-between gap-[10px]">
            <div className="text-[16px] font-[700]">받은 반응함</div>
            <div className="flex gap-[8px]">
              <Button
                secondary
                loading={feedbackLoading}
                onClick={importFeedback}
                className="rounded-[8px] !h-[36px]"
              >
                저장
              </Button>
              <Button
                secondary
                loading={feedbackLoading}
                onClick={() => summarizeFeedback(true)}
                className="rounded-[8px] !h-[36px]"
              >
                요약
              </Button>
              <Button
                secondary
                loading={feedbackLoading}
                onClick={clearFeedbackInbox}
                className="rounded-[8px] !h-[36px]"
              >
                비우기
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-[1fr_150px_auto] maxMedia:grid-cols-1 gap-[8px]">
            <input
              value={feedbackPostIds}
              onChange={(event) => setFeedbackPostIds(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="연결된 게시물 ID"
            />
            <select
              value={feedbackPostPlatform}
              onChange={(event) => setFeedbackPostPlatform(event.target.value as TargetPlatform)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            >
              {targetPlatforms.map((platform) => (
                <option key={platform.id} value={platform.id}>
                  {platform.label}
                </option>
              ))}
            </select>
            <Button
              secondary
              loading={feedbackLoading}
              onClick={importPostComments}
              className="rounded-[8px] !h-[38px]"
            >
              댓글 가져오기
            </Button>
          </div>
          <textarea
            value={feedbackText}
            onChange={(event) => setFeedbackText(event.target.value)}
            className="min-h-[120px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[12px] text-[12px] leading-[1.6] font-mono"
          />
          <Button
            secondary
            loading={feedbackLoading}
            onClick={() => summarizeFeedback(false)}
            className="rounded-[8px] !h-[36px]"
          >
            저장된 받은 반응 요약
          </Button>
          <div className="grid grid-cols-[180px_1fr_auto] maxMedia:grid-cols-1 gap-[8px]">
            <input
              value={feedbackReplyPostId}
              onChange={(event) => setFeedbackReplyPostId(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="답글 대상 게시물 ID"
            />
            <input
              value={feedbackReplyText}
              onChange={(event) => setFeedbackReplyText(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="답글 초안"
            />
            <Button
              secondary
              loading={feedbackLoading}
              onClick={createReplyDraft}
              className="rounded-[8px] !h-[38px]"
            >
              답글 저장
            </Button>
          </div>
          <div className="grid grid-cols-[1fr_150px_150px_auto] maxMedia:grid-cols-1 gap-[8px]">
            <select
              value={feedbackReplyIntegrationId}
              onChange={(event) => setFeedbackReplyIntegrationId(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            >
              <option value="">답글 게시 채널</option>
              {replyIntegrationOptions.map((integration) => (
                <option key={integration.id} value={integration.id}>
                  {integration.name || integration.identifier || integration.providerIdentifier || integration.id}
                </option>
              ))}
            </select>
            <input
              value={feedbackReplyPlatformPostId}
              onChange={(event) => setFeedbackReplyPlatformPostId(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="플랫폼 게시물 ID"
            />
            <input
              value={feedbackReplyLastCommentId}
              onChange={(event) => setFeedbackReplyLastCommentId(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="마지막 댓글 ID"
            />
            <Button
              secondary
              loading={feedbackLoading}
              onClick={publishPlatformReply}
              className="rounded-[8px] !h-[38px]"
            >
              플랫폼 게시
            </Button>
          </div>
          {feedbackView && (
            <div className="flex flex-col gap-[10px]">
              <div className="grid grid-cols-3 gap-[8px]">
                {feedbackSentimentEntries.map((entry) => (
                  <div
                    key={entry.key}
                    className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
                  >
                    <div className="text-[11px] text-textItemBlur">{entry.label}</div>
                    <div className="text-[18px] font-[700]">{entry.value}</div>
                  </div>
                ))}
              </div>
              {!!feedbackView.highlights?.length && (
                <div className="flex flex-col gap-[6px]">
                  {feedbackView.highlights.map((highlight: string) => (
                    <div key={highlight} className="rounded-[8px] bg-btnSimple px-[10px] py-[8px] text-[12px] leading-[1.5]">
                      {highlight}
                    </div>
                  ))}
                </div>
              )}
              {!!feedbackView.replySuggestions?.length && (
                <div className="max-h-[150px] overflow-auto flex flex-col gap-[8px]">
                  {feedbackView.replySuggestions.map((suggestion) => (
                    <div key={`${suggestion.target}-${suggestion.reply}`} className="rounded-[8px] bg-newBgLineColor border border-newBorder p-[10px] text-[12px] leading-[1.5]">
                      <div className="flex items-center justify-between gap-[8px]">
                        <div className="font-[700]">{suggestion.target}</div>
                        <button
                          type="button"
                          onClick={() => setFeedbackReplyText(suggestion.reply || '')}
                          className="text-[11px] text-textColor"
                        >
                          초안 사용
                        </button>
                      </div>
                      <div>{suggestion.reply}</div>
                    </div>
                  ))}
                </div>
              )}
              <details className="text-[12px] text-textItemBlur">
                <summary className="cursor-pointer">JSON</summary>
                <pre className="mt-[8px] max-h-[180px] overflow-auto whitespace-pre-wrap bg-newBgLineColor border border-newBorder rounded-[8px] p-[12px] leading-[1.6]">
                  {JSON.stringify(feedbackView, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </section>
      </div>

      <section className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[18px] flex flex-col gap-[12px]">
        <div className="flex items-center justify-between gap-[10px]">
          <div className="text-[16px] font-[700]">작업 기록</div>
          <Button
            secondary
            onClick={loadActivity}
            className="rounded-[8px] !h-[34px]"
          >
            새로고침
          </Button>
        </div>
        <div className="grid grid-cols-3 maxMedia:grid-cols-1 gap-[8px]">
          {activity.slice(0, 9).map((entry) => (
            <div
              key={entry.id}
              className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px] leading-[1.5]"
            >
              <div className="flex items-center justify-between gap-[8px]">
                <span className="font-[700]">{entry.type}</span>
                <span className="text-textItemBlur">
                  {entry.createdAt?.slice(0, 16)?.replace('T', ' ')}
                </span>
              </div>
              <div className="mt-[6px]">{entry.title}</div>
            </div>
          ))}
          {!activity.length && (
            <div className="rounded-[8px] border border-dashed border-newBorder bg-newBgLineColor p-[14px] text-[12px] text-textItemBlur">
              아직 기록된 작업이 없습니다.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
