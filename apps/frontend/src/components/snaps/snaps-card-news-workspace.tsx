'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ConnectedIntegration,
  confirmOperatorAction,
  defaultPublishDate,
  snapsPublishDateProblem,
  readSnapsCardNewsDeck,
  snapsCardNewsHandoffKey,
} from '@gitroom/frontend/components/snaps/snaps-workspace.shared';
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
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';
import { describeSnapsAttachResult } from '@gitroom/frontend/components/snaps/snaps-workspace.shared';

const cardNewsTargetPlatforms = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'threads', label: 'Threads' },
  { id: 'x', label: 'X' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'naver-blog', label: '네이버 블로그' },
  { id: 'naver-cafe', label: '네이버 카페' },
  { id: 'xiaohongshu', label: '샤오홍슈' },
  { id: 'kakao-talk', label: '카카오톡' },
] as const;

type CardNewsTargetPlatform = (typeof cardNewsTargetPlatforms)[number]['id'];
const cardNewsTargetPlatformIds = cardNewsTargetPlatforms.map(
  (platform) => platform.id
);

type CardNewsTemplate = 'editorial' | 'bold' | 'minimal';

const cardNewsTemplates: Array<{
  id: CardNewsTemplate;
  title: string;
  description: string;
}> = [
  {
    id: 'editorial',
    title: '에디토리얼',
    description: '신문/매거진 스타일의 정돈된 레이아웃',
  },
  {
    id: 'bold',
    title: '볼드',
    description: '큰 타이포와 강한 대비로 시선을 끄는 스타일',
  },
  {
    id: 'minimal',
    title: '미니멀',
    description: '여백 중심의 담백하고 차분한 스타일',
  },
];

const defaultBrandColor = '#1F2937';
const defaultTone = '한국 SNS 카드뉴스 톤';

type SnapsCardNewsSlide = {
  order: number;
  eyebrow: string;
  heading: string;
  body: string;
};

type SnapsCardNewsDeck = {
  // The service degrades to a deterministic template deck when the model call
  // fails or comes back with unusable slides, and it answers 200 either way.
  // Without this label the workspace reported both as "생성했습니다".
  provider?: 'ollama' | 'deepseek' | 'rule-fallback';
  title: string;
  templateId: CardNewsTemplate;
  brandColor: string;
  slides: SnapsCardNewsSlide[];
  caption: string;
  hashtags: string[];
};

type SnapsCardNewsMediaItem = {
  id: string;
  name?: string;
  originalName?: string;
  path: string;
  thumbnail?: string;
  alt?: string;
};

type CardNewsWorkStatus =
  | 'idle'
  | 'script-ready'
  | 'rendering'
  | 'images-ready'
  | 'drafting'
  | 'completed'
  | 'failed';

const cardNewsStatusLabels: Record<CardNewsWorkStatus, string> = {
  idle: '대기',
  'script-ready': '대본 준비',
  rendering: '이미지 생성 중',
  'images-ready': '이미지 준비',
  drafting: '첨부 중',
  completed: '완료',
  failed: '실패',
};

const cardNewsStatusClassNames: Record<CardNewsWorkStatus, string> = {
  idle: 'bg-newBgLineColor text-textItemBlur',
  'script-ready': 'bg-sky-500/15 text-sky-200',
  rendering: 'bg-amber-500/15 text-amber-200',
  'images-ready': 'bg-indigo-500/15 text-indigo-200',
  drafting: 'bg-amber-500/15 text-amber-200',
  completed: 'bg-emerald-500/15 text-emerald-200',
  failed: 'bg-red-500/15 text-red-200',
};

const isValidHexColor = (value: string) => /^#[0-9A-Fa-f]{6}$/.test(value);

export function SnapsCardNewsWorkspace() {
  const router = useRouter();
  const toast = useToaster();
  const apiFetch = useFetch();
  const mediaDirectory = useMediaDirectory();
  const snapsFetch = (url: string, init?: RequestInit) =>
    apiFetch(url, withSnapsJsonHeaders(init));
  const { data: integrations = [] } = useIntegrationList();

  const [sourceText, setSourceText] = useState('');
  const [slideCount, setSlideCount] = useState(6);
  const [tone, setTone] = useState(defaultTone);
  const [templateId, setTemplateId] = useState<CardNewsTemplate>('editorial');
  const [brandColor, setBrandColor] = useState(defaultBrandColor);

  const [deck, setDeck] = useState<SnapsCardNewsDeck | null>(null);
  const [media, setMedia] = useState<SnapsCardNewsMediaItem[]>([]);

  const [targetPlatforms, setTargetPlatforms] = useState<
    CardNewsTargetPlatform[]
  >([...cardNewsTargetPlatformIds]);
  const [scheduleType, setScheduleType] = useState<'draft' | 'schedule'>(
    'draft'
  );
  const [publishDate, setPublishDate] = useState(defaultPublishDate);

  // Picks up a deck handed over from the snaps agent (snaps-workspace.tsx),
  // which prepares the script but deliberately stops before rendering images.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(snapsCardNewsHandoffKey);
      if (!raw) {
        return;
      }
      window.localStorage.removeItem(snapsCardNewsHandoffKey);
      const handoff = JSON.parse(raw) as {
        sourceText?: unknown;
        tone?: unknown;
        deck?: SnapsCardNewsDeck | null;
        scheduleType?: unknown;
        publishDate?: unknown;
      };

      if (typeof handoff.sourceText === 'string' && handoff.sourceText.trim()) {
        setSourceText(handoff.sourceText);
      }
      if (typeof handoff.tone === 'string' && handoff.tone.trim()) {
        setTone(handoff.tone);
      }
      if (handoff.deck?.slides?.length) {
        setDeck(handoff.deck);
        setSlideCount(handoff.deck.slides.length);
        if (handoff.deck.templateId) {
          setTemplateId(handoff.deck.templateId);
        }
        if (handoff.deck.brandColor) {
          setBrandColor(handoff.deck.brandColor);
        }
        setStatus('script-ready');
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
    } catch {
      // A malformed handoff should never block the workspace from loading.
    }
  }, []);

  const [scriptLoading, setScriptLoading] = useState(false);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [status, setStatus] = useState<CardNewsWorkStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  // Warnings the publishing payload builder returned, e.g. an assist platform
  // that cannot be auto-published or settings a provider rejected.
  // Named for the schedule step, then fed only by it - so the deck step's
  // own warnings had nowhere to go and the operator was never told the
  // source had been cut. Each step reports into the same box now.
  const [stepWarnings, setStepWarnings] = useState<string[]>([]);

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

  const progressPercentage = useMemo(() => {
    if (status === 'completed') {
      return 100;
    }
    if (status === 'drafting') {
      return 88;
    }
    if (status === 'images-ready') {
      return 70;
    }
    if (status === 'rendering') {
      return 55;
    }
    if (status === 'script-ready') {
      return 34;
    }
    return 0;
  }, [status]);

  const canGenerateImages = !!deck?.slides?.length;
  const canAttach = !!media.length && !!connectedTargetPlatforms.length;

  const toggleTargetPlatform = (platform: CardNewsTargetPlatform) => {
    setTargetPlatforms((current) => {
      if (current.includes(platform)) {
        return current.length === 1
          ? current
          : current.filter((item) => item !== platform);
      }
      return [...current, platform];
    });
  };

  const updateSlideField = (
    order: number,
    field: 'eyebrow' | 'heading' | 'body',
    value: string
  ) => {
    setDeck((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        slides: current.slides.map((slide) =>
          slide.order === order ? { ...slide, [field]: value } : slide
        ),
      };
    });

    // Already-rendered slides are now stale: they still show the previous text.
    // Drop them so the preview can't disagree with what attach-to-draft would
    // publish, and send the operator back to the "generate images" step.
    if (media.length) {
      setMedia([]);
      setStatus('script-ready');
    }
  };

  const generateScript = async () => {
    if (sourceText.trim().length < 5) {
      toast.show('카드뉴스 대본으로 만들 원문을 입력하세요.', 'warning');
      return;
    }

    setErrorMessage('');
    setScriptLoading(true);
    setStatus('script-ready');
    try {
      const response = await snapsFetch('/snaps/card-news/script', {
        method: 'POST',
        body: JSON.stringify({
          sourceText,
          slideCount,
          tone: tone || undefined,
          templateId,
          brandColor: isValidHexColor(brandColor) ? brandColor : undefined,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      // A 200 does not mean a renderable deck: `{}`, `slides: null` and an
      // error body that arrived with a 200 all throw in the slide list and
      // take the panel down with them.
      const payload = await response.json();
      const data = readSnapsCardNewsDeck(payload);
      if (!data) {
        throw new Error(
          '카드뉴스 대본 응답에 슬라이드가 없습니다. 다시 생성해 주세요.'
        );
      }
      setDeck(data as unknown as SnapsCardNewsDeck);
      setMedia([]);
      setStatus('script-ready');
      // The route only sends this when it had to leave something out.
      const sourceWarnings = Array.isArray(
        (payload as { warnings?: unknown })?.warnings
      )
        ? ((payload as { warnings: string[] }).warnings)
        : [];
      setStepWarnings(sourceWarnings);
      if (data.provider === 'rule-fallback') {
        toast.show(
          'AI 생성에 실패해 기본 템플릿으로 카드뉴스 대본을 만들었습니다. 내용을 확인하고 필요하면 다시 생성하세요.',
          'warning'
        );
      } else {
        toast.show('카드뉴스 대본을 생성했습니다.');
      }
    } catch (error) {
      setStatus('failed');
      const message =
        error instanceof Error
          ? error.message
          : '카드뉴스 대본 생성에 실패했습니다.';
      setErrorMessage(message);
      toast.show(message, 'warning');
    } finally {
      setScriptLoading(false);
    }
  };

  const generateImages = async () => {
    if (!deck?.slides?.length) {
      toast.show('먼저 카드뉴스 대본을 생성하세요.', 'warning');
      return;
    }

    setErrorMessage('');
    setImagesLoading(true);
    setStatus('rendering');
    try {
      const response = await snapsFetch('/snaps/card-news/generate', {
        method: 'POST',
        body: JSON.stringify({ deck }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const data = (await response.json()) as {
        deck: SnapsCardNewsDeck;
        media: SnapsCardNewsMediaItem[];
      };
      setDeck(data.deck);
      setMedia(data.media || []);
      setStatus('images-ready');
      toast.show('카드뉴스 이미지를 생성했습니다.');
    } catch (error) {
      setStatus('failed');
      const message =
        error instanceof Error
          ? error.message
          : '카드뉴스 이미지 생성에 실패했습니다.';
      setErrorMessage(message);
      toast.show(message, 'warning');
    } finally {
      setImagesLoading(false);
    }
  };

  const attachCardNewsToDraft = async () => {
    if (!media.length) {
      toast.show('먼저 카드뉴스 이미지를 생성하세요.', 'warning');
      return;
    }

    if (!connectedTargetPlatforms.length) {
      toast.show('연결된 채널을 하나 이상 선택하세요.', 'warning');
      return;
    }

    setErrorMessage('');
    setDrafting(true);
    setStatus('drafting');
    try {
      let publishDateIso: string | undefined;
      if (scheduleType === 'schedule') {
        const parsedPublishDate = new Date(publishDate);
        // Not only what Date cannot parse: a time that has already gone
        // by is published immediately by the post workflow.
        const problem = snapsPublishDateProblem(publishDate);
        if (problem) {
          toast.show(problem, 'warning');
          setDrafting(false);
          setStatus('images-ready');
          return;
        }
        publishDateIso = parsedPublishDate.toISOString();
      }

      if (
        scheduleType === 'schedule' &&
        !confirmOperatorAction(
          `연결된 채널 ${connectedTargetPlatforms.length}개에 예약 게시물을 만들까요?`
        )
      ) {
        setDrafting(false);
        setStatus('images-ready');
        return;
      }

      const response = await snapsFetch('/snaps/card-news/attach-to-draft', {
        method: 'POST',
        body: JSON.stringify({
          title: deck?.title,
          caption: deck?.caption,
          hashtags: deck?.hashtags || [],
          media: media.map((item) => ({
            id: item.id,
            path: item.path,
            thumbnail: item.thumbnail,
            alt: item.alt,
          })),
          targetPlatforms: connectedTargetPlatforms,
          integrations: connectedTargetPlatforms.map((platform) => ({
            platform,
            integrationId: connectedByPlatform[platform].id,
          })),
          scheduleType,
          operatorConfirmed: scheduleType === 'schedule',
          ...(publishDateIso ? { publishDate: publishDateIso } : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }

      // The response carries the created posts and the builder's warnings. It
      // used to be discarded, so a run where every variant was dropped - an
      // assist-only platform, or settings the provider rejected - still showed
      // an unconditional success toast.
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
        '카드뉴스를'
      );

      if (outcome.tone === 'warning') {
        setStatus('failed');
        setErrorMessage(outcome.message);
        toast.show(outcome.message, 'warning');
        return;
      }

      setStatus('completed');
      toast.show(outcome.message);
      router.push('/launches?display=list');
    } catch (error) {
      setStatus('failed');
      const message =
        error instanceof Error
          ? error.message
          : '카드뉴스 초안 생성에 실패했습니다.';
      setErrorMessage(message);
      toast.show(message, 'warning');
    } finally {
      setDrafting(false);
    }
  };

  const resetWorkspace = () => {
    setSourceText('');
    setSlideCount(6);
    setTone(defaultTone);
    setTemplateId('editorial');
    setBrandColor(defaultBrandColor);
    setDeck(null);
    setMedia([]);
    setStatus('idle');
    setErrorMessage('');
  };

  return (
    <section className="bg-newBgColorInner border border-newBorder rounded-[8px] overflow-hidden text-newTextColor">
      <div className="border-b border-newBorder bg-newBgLineColor/45 px-[18px] py-[14px] flex items-center justify-between gap-[14px] maxMedia:flex-col maxMedia:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-[8px]">
            <h2 className="text-[20px] font-[700] leading-tight">
              카드뉴스 스튜디오
            </h2>
            <span
              className={clsx(
                'rounded-[999px] px-[9px] py-[4px] text-[11px] font-[700]',
                cardNewsStatusClassNames[status]
              )}
            >
              {cardNewsStatusLabels[status]}
            </span>
          </div>
          <div className="mt-[6px] flex flex-wrap gap-[8px] text-[11px] text-textItemBlur">
            <span>원문 {sourceMetrics.characters.toLocaleString()}자</span>
            <span>슬라이드 {deck?.slides?.length || slideCount}</span>
            <span>이미지 {media.length}</span>
            <span>
              채널 {connectedTargetPlatforms.length}/{targetPlatforms.length}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={resetWorkspace}
          className="h-[32px] rounded-[8px] border border-newBorder px-[12px] text-[12px] text-textItemBlur"
        >
          새 카드뉴스
        </button>
      </div>

      <div className="h-[3px] bg-newBgLineColor">
        <div
          className="h-full bg-btnPrimary transition-all"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      <div className="grid grid-cols-[minmax(360px,1.05fr)_minmax(360px,0.95fr)] maxMedia:grid-cols-1">
        <div className="border-r border-newBorder maxMedia:border-r-0 maxMedia:border-b p-[18px] flex flex-col gap-[14px]">
          <div className="flex flex-col gap-[8px]">
            <div className="flex items-center justify-between gap-[10px]">
              <label className="text-[13px] font-[700]">원문</label>
              <span className="text-[11px] text-textItemBlur">
                {sourceMetrics.characters.toLocaleString()}/6,000자
              </span>
            </div>
            <textarea
              value={sourceText}
              onChange={(event) =>
                // Grapheme-safe: a paste whose emoji straddles the cap left a
              // broken character in the state, and that is what is sent.
              setSourceText(snapsClampText(event.target.value, 6000))
              }
              className="min-h-[220px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[14px] text-[14px] leading-[1.7] outline-none focus:border-btnPrimary"
              placeholder="카드뉴스로 만들 원문, 기사 요약, 캠페인 메시지를 입력하세요."
            />
          </div>

          <div className="grid grid-cols-2 gap-[8px]">
            <div className="flex flex-col gap-[6px]">
              <label className="text-[12px] text-textItemBlur">
                슬라이드 수 (4-10)
              </label>
              <input
                type="number"
                min={4}
                max={10}
                value={slideCount}
                onChange={(event) =>
                  setSlideCount(
                    Math.min(10, Math.max(4, Number(event.target.value) || 6))
                  )
                }
                className="h-[40px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px] outline-none focus:border-btnPrimary"
              />
            </div>
            <div className="flex flex-col gap-[6px]">
              <label className="text-[12px] text-textItemBlur">톤</label>
              <input
                value={tone}
                onChange={(event) => setTone(event.target.value)}
                className="h-[40px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px] outline-none focus:border-btnPrimary"
                placeholder={defaultTone}
              />
            </div>
          </div>

          <div className="flex flex-col gap-[8px]">
            <label className="text-[13px] font-[700]">템플릿</label>
            <div className="grid grid-cols-3 gap-[8px]">
              {cardNewsTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setTemplateId(template.id)}
                  className={clsx(
                    'h-[74px] rounded-[8px] border px-[10px] py-[8px] text-left transition-colors',
                    templateId === template.id
                      ? 'border-btnPrimary bg-btnPrimary/15'
                      : 'border-newBorder bg-newBgLineColor text-textItemBlur'
                  )}
                >
                  <div className="text-[13px] font-[700]">{template.title}</div>
                  <div className="mt-[4px] text-[11px] leading-[1.4]">
                    {template.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-[6px]">
            <label className="text-[12px] text-textItemBlur">브랜드 컬러</label>
            <div className="flex items-center gap-[8px]">
              <input
                type="color"
                value={
                  isValidHexColor(brandColor) ? brandColor : defaultBrandColor
                }
                onChange={(event) => setBrandColor(event.target.value)}
                className="h-[40px] w-[48px] cursor-pointer rounded-[8px] border border-newBorder bg-newBgLineColor p-[4px]"
                aria-label="브랜드 컬러 선택"
              />
              <input
                value={brandColor}
                onChange={(event) => setBrandColor(event.target.value)}
                className="h-[40px] flex-1 bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px] outline-none focus:border-btnPrimary"
                placeholder={defaultBrandColor}
              />
            </div>
            {!isValidHexColor(brandColor) && (
              <div className="text-[11px] text-amber-200">
                #RRGGBB 형식이 아니면 기본 색상({defaultBrandColor})이
                적용됩니다.
              </div>
            )}
          </div>

          <Button
            secondary
            loading={scriptLoading}
            onClick={generateScript}
            className="rounded-[8px] !h-[44px]"
          >
            대본 생성
          </Button>
        </div>

        <div className="p-[18px] flex flex-col gap-[14px]">
          {!!errorMessage && (
            <div className="rounded-[8px] border border-red-500/40 bg-red-500/10 px-[12px] py-[10px] text-[12px] leading-[1.5] text-red-200">
              {errorMessage}
            </div>
          )}

          {!!stepWarnings.length && (
            <div className="rounded-[8px] border border-amber-500/30 bg-amber-500/10 px-[12px] py-[10px] text-[12px] leading-[1.5] text-amber-200 flex flex-col gap-[4px]">
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

          {deck ? (
            <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px] flex flex-col gap-[10px]">
              <div className="flex items-center justify-between gap-[10px]">
                <div className="text-[13px] font-[700] truncate">
                  {deck.title}
                </div>
                <Button
                  secondary={!canGenerateImages}
                  loading={imagesLoading}
                  onClick={generateImages}
                  disabled={!canGenerateImages}
                  className="rounded-[8px] !h-[36px] !w-auto shrink-0"
                >
                  이미지 생성
                </Button>
              </div>

              <div className="max-h-[300px] overflow-auto flex flex-col gap-[10px]">
                {deck.slides.map((slide) => (
                  <div
                    key={slide.order}
                    className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px] flex flex-col gap-[6px]"
                  >
                    <div className="text-[11px] font-[700] text-textItemBlur">
                      슬라이드 {slide.order}
                    </div>
                    <input
                      value={slide.eyebrow}
                      onChange={(event) =>
                        updateSlideField(
                          slide.order,
                          'eyebrow',
                          event.target.value
                        )
                      }
                      className="h-[32px] bg-newBgLineColor border border-newBorder rounded-[6px] px-[8px] text-[11px] outline-none focus:border-btnPrimary"
                      placeholder="에이브로우"
                    />
                    <input
                      value={slide.heading}
                      onChange={(event) =>
                        updateSlideField(
                          slide.order,
                          'heading',
                          event.target.value
                        )
                      }
                      className="h-[36px] bg-newBgLineColor border border-newBorder rounded-[6px] px-[8px] text-[13px] font-[700] outline-none focus:border-btnPrimary"
                      placeholder="제목"
                    />
                    <textarea
                      value={slide.body}
                      onChange={(event) =>
                        updateSlideField(
                          slide.order,
                          'body',
                          event.target.value
                        )
                      }
                      className="min-h-[54px] resize-none bg-newBgLineColor border border-newBorder rounded-[6px] px-[8px] py-[6px] text-[12px] leading-[1.5] outline-none focus:border-btnPrimary"
                      placeholder="본문"
                    />
                  </div>
                ))}
              </div>

              <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px] text-[12px] leading-[1.5]">
                <div className="text-[11px] font-[700] mb-[5px]">캡션</div>
                {deck.caption}
                {!!deck.hashtags?.length && (
                  <div className="mt-[8px] flex flex-wrap gap-[6px] text-[11px] text-textItemBlur">
                    {deck.hashtags.slice(0, 12).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="min-h-[170px] rounded-[8px] border border-dashed border-newBorder bg-newBgLineColor flex items-center justify-center text-textItemBlur text-[14px] text-center px-[12px]">
              대본을 생성하면 검수 화면이 열립니다.
            </div>
          )}

          {!!media.length && (
            <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px]">
              <div className="text-[13px] font-[700] mb-[10px]">
                슬라이드 미리보기
              </div>
              {/*
                Render in array order, not sorted by name: /card-news/generate
                returns media[i] for deck.slides[i], and attach-to-draft below
                posts `media` in that same array order. Sorting only the preview
                would let the user approve one slide order and publish another.
              */}
              <div className="grid grid-cols-3 gap-[8px] maxMedia:grid-cols-2">
                {media.map((item, index) => (
                  <div
                    key={item.id || index}
                    className="aspect-[4/5] overflow-hidden rounded-[8px] border border-newBorder bg-black"
                  >
                    <img
                      src={mediaDirectory.set(item.path)}
                      alt={item.alt || `slide-${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px] flex flex-col gap-[10px]">
            <div className="text-[13px] font-[700]">발행 채널</div>
            <div className="flex flex-wrap gap-[8px]">
              {cardNewsTargetPlatforms.map((platform) => {
                const connected = !!connectedByPlatform[platform.id];
                const selected = targetPlatforms.includes(platform.id);
                return (
                  <button
                    key={platform.id}
                    type="button"
                    onClick={() => toggleTargetPlatform(platform.id)}
                    className={clsx(
                      'h-[34px] px-[12px] rounded-[8px] text-[12px] border',
                      selected
                        ? 'bg-btnPrimary text-white border-btnPrimary'
                        : 'bg-newBgColorInner border-newBorder text-textItemBlur'
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
                className="h-[40px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px] outline-none focus:border-btnPrimary"
              >
                <option value="draft">초안</option>
                <option value="schedule">예약</option>
              </select>
              <input
                type="datetime-local"
                value={publishDate}
                disabled={scheduleType === 'draft'}
                onChange={(event) => setPublishDate(event.target.value)}
                className="h-[40px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px] outline-none focus:border-btnPrimary disabled:opacity-50"
              />
            </div>

            <Button
              secondary={!canAttach}
              loading={drafting}
              onClick={attachCardNewsToDraft}
              disabled={!canAttach}
              className="rounded-[8px] !h-[44px]"
            >
              {scheduleType === 'schedule' ? '예약 발행' : '초안에 추가'}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
