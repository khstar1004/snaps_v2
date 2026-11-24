'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { describeSnapsScheduleResult } from '@gitroom/helpers/utils/snaps.schedule.result';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { snapsDemoWorkspace } from './snaps-demo-workspace';

const targetPlatforms = [
  { id: 'threads', label: 'Threads' },
  { id: 'bluesky', label: 'Bluesky' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'pinterest', label: 'Pinterest' },
  { id: 'youtube', label: 'YouTube 쇼츠' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'xiaohongshu', label: '샤오홍슈' },
  { id: 'naver-blog', label: '네이버 블로그' },
  { id: 'naver-cafe', label: '네이버 카페' },
  { id: 'kakao-talk', label: '카카오톡' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'x', label: 'X' },
] as const;

type TargetPlatform = (typeof targetPlatforms)[number]['id'];

const targetPlatformLabel = (platform: TargetPlatform) =>
  targetPlatforms.find((item) => item.id === platform)?.label || platform;

const platformGuides: Record<
  TargetPlatform,
  { concept: string; cue: string; limit: string }
> = {
  threads: {
    concept: '공개 대화',
    cue: '한 주장씩 500자 답글 체인, 댓글 유도',
    limit: '게시물당 500자',
  },
  bluesky: {
    concept: '탈중앙 공개 대화',
    cue: '300자 안에 한 주장, 링크/멘션은 그대로',
    limit: '300자',
  },
  instagram: {
    concept: '저장형 비주얼 캡션',
    cue: '첫 줄 장면/감정, 5개 이하 정밀 태그',
    limit: '태그 5개 이하',
  },
  facebook: {
    concept: '페이지 커뮤니티 업데이트',
    cue: '첫 줄 핵심, 짧은 맥락, 댓글/링크 유도',
    limit: '페이지 게시',
  },
  pinterest: {
    concept: '저장형 핀',
    cue: '타이틀, 이미지 설명, 검색 키워드, 보드 필요',
    limit: '보드/이미지 필요',
  },
  youtube: {
    concept: '검색형 쇼츠',
    cue: '제목 앞 키워드, 설명 첫 줄에 시청 보상',
    limit: '3분 이하 쇼츠',
  },
  tiktok: {
    concept: '훅 중심',
    cue: '영상 훅 보강, 트렌드/키워드형 태그',
    limit: '짧은 캡션 우선',
  },
  xiaohongshu: {
    concept: '저장형 샤오홍슈 노트',
    cue: '제목, 왜 저장할지, 번호 팁, 장면 태그',
    limit: '수동 보조',
  },
  'naver-blog': {
    concept: '검색형 정보 글',
    cue: '검색 의도 제목, 도입, 목차, 섹션, 요약',
    limit: '긴 글 수동 보조',
  },
  'naver-cafe': {
    concept: '게시판 커뮤니티 글',
    cue: '게시판 맥락, 회원 경험 질문, 홍보감 절제',
    limit: '카페/메뉴 필요',
  },
  'kakao-talk': {
    concept: '메신저 안내',
    cue: '짧은 제목, 한 문장 가치, 버튼형 CTA',
    limit: '수동 공유',
  },
  linkedin: {
    concept: '전문 판단',
    cue: '업무 관찰, 의사결정 맥락, 실행 포인트',
    limit: '게시물 3,000자',
  },
  x: {
    concept: '압축 주장',
    cue: '한 주장, 한 대비, 해시태그 최소화',
    limit: '280자',
  },
};

const agentCommandTemplates = [
  {
    label: '내일 오전 캠페인',
    command:
      '내일 오전 10시에 AI 생산성 관련 게시글을 인스타, 스레드, 링크드인에 올릴 수 있게 준비해줘. 같은 내용으로 쇼츠 대본도 웃기게 만들어줘.',
  },
  {
    label: '성과 기반 후속',
    command:
      '지난 성과 보고서 인사이트를 반영해서 이번 주에 올릴 후속 콘텐츠 3개를 인스타, 스레드, 링크드인용으로 준비해줘. 구매 문의가 오면 답글 방향도 같이 정리해줘.',
  },
  {
    label: '제품 업데이트',
    command:
      '신규 기능 업데이트를 고객이 바로 이해하도록 네이버 블로그, 링크드인, 카카오톡 공유용으로 바꿔줘. 블로그는 전문적으로, 카카오톡은 짧게 정리해줘.',
  },
  {
    label: '쇼츠 우선',
    command:
      '이 원문을 유튜브 쇼츠, 인스타 릴스, 틱톡에 맞는 30초 숏폼 캠페인으로 만들어줘. 훅은 웃기게, CTA는 댓글 유도형으로 해줘.',
  },
  {
    label: '중국 채널',
    command:
      '이 원문을 샤오홍슈에 맞게 저장하고 싶은 노트형 콘텐츠로 바꿔줘. 제목, 첫 문장, 번호형 팁, 해시태그까지 중국 SNS 감성으로 정리해줘.',
  },
] as const;

const snapsShortsHandoffKey = 'snaps.shorts.handoff.v1';

const bulkCampaignSampleCsv = [
  'title,topic,caption,platforms,publishDate,mediaUrl,linkUrl,tags',
  'AI 리포트 티저,B2B 콘텐츠 자동화,"이번 주 리포트에서 가장 많이 저장된 자동화 체크리스트를 요약합니다.","instagram|threads|linkedin",2026-06-02T10:00:00+09:00,https://example.com/visual.png,https://example.com/report,"AI|자동화|리포트"',
  '고객 질문 답변,세일즈 FAQ,"가격을 묻는 댓글에 바로 답할 수 있는 3문장 템플릿입니다.","threads|naver-blog",,,https://example.com/pricing,"FAQ|세일즈"',
].join('\n');

const competitorImportSampleCsv = [
  'name,handle,profileUrl,platform,niche,tags,followers,followersGrowth,postsCount,videosCount,photosCount,engagement,engagementRate,topPostTitle,topPostUrl,topPostFormat,topPostEngagement,topPostHook,collectedAt',
  'Rival Studio,@rivalstudio,https://instagram.com/rivalstudio,instagram,B2B 콘텐츠 자동화,"AI|릴스",18000,420,12,7,5,960,5.3,"3초 안에 자동화 문제를 보여준 릴스",https://example.com/rival-reel,video,960,"수작업 콘텐츠를 줄이세요",2026-05-31T09:00:00+09:00',
].join('\n');

const listeningSampleCsv = [
  'platform,author,content,postId,sourceUrl,engagement,createdAt',
  'instagram,@lead_a,"가격표와 데모 링크 받을 수 있나요? #콘텐츠자동화",ig-101,https://example.com/ig/101,18,2026-06-01T09:20:00+09:00',
  'threads,@ops_b,"Buffer랑 비교했을 때 댓글 응대까지 되나요?",th-204,https://example.com/th/204,9,2026-06-01T09:45:00+09:00',
  'x,@risk_c,"좋긴 한데 예약 발행 오류가 있으면 바로 알려줘야 함",x-17,https://example.com/x/17,31,2026-06-01T10:10:00+09:00',
].join('\n');

const trendRadarSampleCsv = [
  'topic,platform,volume,previousVolume,engagement,sentiment,competitor,format,content,source',
  '#콘텐츠자동화,instagram,46,18,930,positive,Rival Studio,reels,"3초 안에 수작업 문제를 보여준 릴스가 저장을 끌어냄",competitor',
  '가격 문의 자동응대,threads,22,8,210,mixed,,thread,"가격표와 데모 링크를 요청하는 댓글이 늘어남",listening',
  '예약 발행 오류 알림,x,18,5,160,negative,,post,"오류가 있으면 바로 알려줘야 한다는 불만 리스크",listening',
  'AI 운영 체크리스트,linkedin,31,17,420,positive,,carousel,"B2B 마케터가 저장하는 운영 체크리스트",hashtag',
].join('\n');

const feedIntakeSampleXml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<rss version="2.0">',
  '<channel>',
  '<title>snaps sample feed</title>',
  '<item>',
  '<title>AI 콘텐츠 운영 체크리스트</title>',
  '<link>https://example.com/blog/ai-content-ops</link>',
  '<description>이번 주 B2B 브랜드가 재사용할 수 있는 콘텐츠 운영 체크리스트입니다.</description>',
  '<pubDate>Tue, 02 Jun 2026 10:00:00 +0900</pubDate>',
  '<category>AI</category><category>자동화</category>',
  '<enclosure url="https://example.com/cover.png" type="image/png" />',
  '</item>',
  '<item>',
  '<title>세일즈 댓글 답변 템플릿</title>',
  '<link>https://example.com/blog/comment-sales</link>',
  '<description>가격과 상담 문의 댓글에 답하는 짧은 템플릿을 정리했습니다.</description>',
  '<category>세일즈</category>',
  '</item>',
  '</channel>',
  '</rss>',
].join('\n');

const carouselVisualSampleSource = [
  'AI 콘텐츠 운영 체크리스트',
  '1. 하나의 원문을 플랫폼별 문법으로 재작성합니다.',
  '2. 저장할 만한 인사이트를 카드뉴스로 쪼갭니다.',
  '3. 마지막 장에는 댓글이나 상담 CTA를 둡니다.',
  '4. 성과가 좋은 문장은 다음 주 RAG 예시로 승격합니다.',
].join('\n');

const visualFeedPlannerSample = [
  '런칭 카드 커버|https://example.com/feed-cover.png|scheduled|2026-06-03T10:00:00+09:00|AI 콘텐츠 운영 챌린지 첫 게시물|image',
  '체크리스트 릴스|https://example.com/reel-cover.png|draft|2026-06-04T10:00:00+09:00|릴스 커버가 그리드에서 튀지 않는지 확인|video',
  '고객 사례 캐러셀|https://example.com/case-carousel.png|scheduled|2026-06-05T10:00:00+09:00|사례 카드뉴스를 가운데 배치|carousel',
  '파일럿 CTA|https://example.com/pilot-cta.png|draft|2026-06-06T10:00:00+09:00|상담 CTA가 너무 광고처럼 보이지 않는지 확인|image',
].join('\n');

const firstCommentSample =
  '#AI마케팅 #SNS운영 #콘텐츠자동화\n\n자료 링크나 실제 적용 예시가 필요하면 댓글로 파일럿이라고 남겨주세요.';

const hashtagSetSample =
  '#AI마케팅 #SNS운영 #콘텐츠자동화 #콘텐츠운영 #마케팅실무 #파일럿';

const evergreenRecycleSampleSource = [
  '성과가 좋았던 AI 콘텐츠 운영 체크리스트',
  '원문을 플랫폼별 문법으로 재작성하면 제작 시간이 줄어듭니다.',
  '저장할 만한 인사이트는 카드뉴스와 짧은 CTA로 다시 쓸 수 있습니다.',
  '댓글 질문은 다음 재활용 포스트의 FAQ 소재가 됩니다.',
].join('\n');

const recurringPostSampleSource = [
  '2주 파일럿 모집 반복 게시',
  '콘텐츠 운영자는 매주 같은 CTA를 새로 쓰느라 시간을 잃습니다.',
  'snaps는 하나의 제안을 플랫폼별 문법과 반복 일정으로 나눠 큐에 올립니다.',
  '댓글로 파일럿이라고 남기면 샘플 캘린더를 보내드립니다.',
].join('\n');

const repurposeQueueSampleSource = [
  'youtube|2026-06-01T11:00:00+09:00|https://example.com/youtube/ops-demo|AI 운영 데모 영상|라이브 데모에서 원문 정리, 쇼츠, 댓글 응대를 한 번에 보여줬습니다.',
  'tiktok|2026-06-01T12:30:00+09:00|https://example.com/tiktok/hook-test|15초 훅 테스트|조회수가 높은 짧은 훅을 Threads와 LinkedIn용 문장으로 바꿉니다.',
  'blog|2026-05-20T09:00:00+09:00|https://example.com/blog/old-guide|기존 가이드|이미 공개된 글은 일정 기반 워크플로우에서만 재배포합니다.',
].join('\n');

const repurposeQueueSlotSample = [
  'Authority|1|09:00|10:00',
  'Education|2|10:00|11:00',
  'Shorts|3|12:00|13:00',
  'Community|4|15:00|16:00',
  'Promotion|5|11:00|12:00',
].join('\n');

const mediaAssetSampleCaption = [
  '하나의 원문을 카드뉴스, 쇼츠, 링크드인 포스트까지 다시 쓰는 과정을 보여주는 캠페인 비주얼입니다.',
  '첫 장면은 문제, 두 번째 장면은 자동화 흐름, 마지막 장면은 파일럿 CTA로 닫습니다.',
].join('\n');

const contentCalendarSampleBrief = [
  '캠페인: AI 콘텐츠 운영 14일 챌린지',
  '대상: 콘텐츠를 혼자 운영하는 B2B 마케터',
  '핵심 메시지: 하나의 원문을 플랫폼별 게시물, 쇼츠, 카드뉴스로 재사용한다.',
  '목표: 저장, 상담 문의, 데모 신청을 늘린다.',
].join('\n');

const contentCategorySampleSource = [
  'AI 콘텐츠 운영 14일 챌린지',
  '하나의 원문을 교육, 사례, 프로모션, 커뮤니티 카테고리로 나눠 반복 운영합니다.',
  '각 카테고리는 다른 CTA와 게시 목적을 갖고, 일정에는 카테고리 순서대로 들어갑니다.',
].join('\n');

const contentCategorySampleConfig = [
  '교육|evergreen|#12b8b8|저장형 체크리스트와 튜토리얼|2',
  '사례|share-once|#f6c85f|고객 사례와 전후 비교|1',
  '프로모션|share-once|#ef6f6c|상담 신청과 데모 CTA|1',
  '커뮤니티|evergreen|#7dd3fc|댓글 질문과 대화 소재|1',
].join('\n');

const conditionalFollowUpSample = [
  '자료 링크를 원하면 이 댓글을 저장해두세요.',
  '캠페인 체크리스트와 예시 캘린더를 한 번에 볼 수 있는 샘플을 준비했습니다.',
].join('\n');

const feedbackSentimentLabels: Record<string, string> = {
  question: '질문',
  praise: '칭찬',
  complaint: '불만',
  spam: '스팸',
  collaboration: '협업',
  other: '기타',
};

type SnapsFeedbackStatus = 'unread' | 'unresolved' | 'resolved';
type SnapsFeedbackStatusFilter = SnapsFeedbackStatus | 'all';

const feedbackStatusLabels: Record<SnapsFeedbackStatus, string> = {
  unread: '읽지 않음',
  unresolved: '미해결',
  resolved: '해결됨',
};

const feedbackStatusOptions: Array<{
  id: SnapsFeedbackStatusFilter;
  label: string;
}> = [
  { id: 'unread', label: '읽지 않음' },
  { id: 'unresolved', label: '미해결' },
  { id: 'resolved', label: '해결됨' },
  { id: 'all', label: '전체' },
];

const inboxAssignmentPriorityLabels: Record<SnapsInboxAssignmentPriority, string> = {
  urgent: '긴급',
  high: '높음',
  normal: '보통',
  low: '낮음',
};

const trendRadarStageLabels: Record<SnapsTrendRadarStage, string> = {
  emerging: '초기',
  accelerating: '급상승',
  mainstream: '메인',
  fatigue: '피로',
  risk: '리스크',
};

export type SnapsWorkspaceSurface = 'studio' | 'agent' | 'analytics';

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

type SnapsBestTimeRecommendation = {
  recommendedDate: string;
  recommendedDateLocal?: string;
  integrationId?: string;
  providerIdentifier?: string;
  source: string;
  reason: string;
};

type SnapsViralCoachCategory = {
  id: string;
  label: string;
  score: number;
  maxScore: number;
  status: 'strong' | 'ok' | 'weak';
  feedback: string;
  checks: string[];
};

type SnapsViralCoachScorecard = {
  product: 'snaps';
  source: 'snaps-viral-ai-coach';
  platform: TargetPlatform;
  platformLabel: string;
  score: number;
  grade: 'excellent' | 'ready' | 'needs-work' | 'rewrite';
  summary: string;
  categories: SnapsViralCoachCategory[];
  recommendations: string[];
  suggestedHooks: string[];
  hashtagPlan: {
    broad: string[];
    niche: string[];
    final: string[];
    limit: number;
  };
  rewrite: {
    openingLine: string;
    caption: string;
  };
  warnings: string[];
};

type SnapsPostVariationGoal =
  | 'engagement'
  | 'saves'
  | 'comments'
  | 'clicks'
  | 'leads';

type SnapsPostVariationItem = {
  id: string;
  rank: number;
  variationIndex: number;
  platform: TargetPlatform;
  platformLabel: string;
  title: string;
  angle: string;
  hook: string;
  caption: string;
  cta: string;
  hashtags: string[];
  hypothesis: string;
  expectedMetric: string;
  score: number;
  scoreBreakdown: {
    hook: number;
    clarity: number;
    specificity: number;
    cta: number;
    novelty: number;
  };
  status: 'winner' | 'ready' | 'needs-review';
  warnings: string[];
};

type SnapsPostVariationPreview = {
  product: 'snaps';
  source: 'snaps-post-variation-lab';
  title: string;
  topic: string;
  goal: SnapsPostVariationGoal;
  winningMetric: string;
  variantCount: number;
  platforms: TargetPlatform[];
  totalVariants: number;
  winningVariantId?: string;
  items: SnapsPostVariationItem[];
  recommendations: string[];
  warnings: string[];
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

type SnapsSalesCampaign = {
  id: string;
  organizationId: string;
  title: string;
  destinationUrl: string;
  trackingUrl: string;
  linkInBioUrl: string;
  cta: string;
  platform?: TargetPlatform;
  slug: string;
};

const salesHubLinkFromCampaign = (campaign?: SnapsSalesCampaign) => {
  if (!campaign?.linkInBioUrl) {
    return '';
  }
  try {
    const parsed = new URL(campaign.linkInBioUrl);
    parsed.pathname = ['', 'snaps', 'link', encodeURIComponent(campaign.organizationId)].join('/');
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return campaign.linkInBioUrl.replace(/\/[^/]+$/, '');
  }
};

type SnapsSalesSummary = {
  campaigns: number;
  clicks: number;
  leads: number;
  purchases: number;
  revenue: number;
  currency: string;
  conversionRate: number;
  earningsPerClick: number;
  campaignSummaries: Array<{
    campaign: SnapsSalesCampaign;
    clicks: number;
    leads: number;
    purchases: number;
    revenue: number;
    currency: string;
    conversionRate: number;
    earningsPerClick: number;
  }>;
  actionItems: string[];
};

type SnapsSalesProposal = {
  source: string;
  generatedAt: string;
  leadName: string;
  segment: string;
  packageName: string;
  offer: string;
  positioning: string;
  pilotDays: number;
  targetRevenue: number;
  currency: string;
  evidence: {
    campaigns: number;
    clicks: number;
    leads: number;
    purchases: number;
    revenue: number;
    conversionRate: number;
    earningsPerClick: number;
    topCampaign?: {
      title: string;
      platform?: TargetPlatform;
      revenue: number;
      clicks: number;
      trackingUrl: string;
    };
  };
  scope: string[];
  demoAgenda: string[];
  successMetrics: string[];
  timeline: Array<{
    day: string;
    work: string;
    proof: string;
  }>;
  pricing: {
    setupFee: number;
    monthlyFee: number;
    pilotFee: number;
    currency: string;
    note: string;
  };
  pitch: string;
  followUpMessages: Array<{
    channel: string;
    subject: string;
    body: string;
  }>;
  riskReversals: string[];
  nextSteps: string[];
};

type SnapsCompetitorProfile = {
  id: string;
  name: string;
  handle?: string;
  profileUrl?: string;
  platform: TargetPlatform;
  niche?: string;
  tags: string[];
  favorite: boolean;
};

type SnapsCompetitorTopPost = {
  title: string;
  url?: string;
  format?: string;
  engagement: number;
  hook?: string;
  competitorName?: string;
  platform?: TargetPlatform;
};

type SnapsCompetitorSummary = {
  competitors: number;
  snapshots: number;
  totalFollowers: number;
  totalEngagement: number;
  averageEngagementRate: number;
  videoShare: number;
  contentMix: {
    posts: number;
    videos: number;
    photos: number;
    links: number;
    statuses: number;
  };
  topCompetitors: Array<{
    competitor: SnapsCompetitorProfile;
    latest: {
      followers: number;
      followersGrowth: number;
      postsCount: number;
      videosCount: number;
      engagement: number;
      engagementRate: number;
    };
    followerDelta: number;
    engagementDelta: number;
    videoShare: number;
    score: number;
  }>;
  topPosts: SnapsCompetitorTopPost[];
  actionItems: string[];
};

type SnapsCompetitorImportRow = {
  rowNumber: number;
  name: string;
  handle?: string;
  profileUrl?: string;
  platform?: TargetPlatform;
  niche?: string;
  tags: string[];
  followers: number;
  followersGrowth: number;
  postsCount: number;
  videosCount: number;
  photosCount: number;
  engagement: number;
  engagementRate: number;
  topPosts: SnapsCompetitorTopPost[];
  warnings: string[];
  status: 'ready' | 'warning' | 'invalid';
};

type SnapsCompetitorImportPreview = {
  product: 'snaps';
  source: 'snaps-competitor-import';
  format: 'csv' | 'json';
  totalRows: number;
  acceptedRows: number;
  invalidRows: number;
  profileRows: number;
  snapshotRows: number;
  rows: SnapsCompetitorImportRow[];
  imported?: {
    profiles: number;
    createdProfiles: number;
    updatedProfiles: number;
    snapshots: number;
    totalProfiles: number;
    totalSnapshots: number;
  };
};

type SnapsApprovalStatus =
  | 'pending'
  | 'approved'
  | 'changes-requested'
  | 'rejected'
  | 'scheduled';

type SnapsApprovalComment = {
  id: string;
  actor?: string;
  message: string;
  visibility: 'internal' | 'reviewer';
  variantPlatform?: TargetPlatform;
  variantIndex?: number;
  selection?: string;
  resolved: boolean;
  createdAt: string;
  resolvedAt?: string;
};

type SnapsApprovalItem = {
  id: string;
  title: string;
  status: SnapsApprovalStatus;
  requestedBy?: string;
  reviewer?: string;
  note?: string;
  dueAt?: string;
  publishDate?: string;
  scheduleType: 'draft' | 'schedule';
  source: string;
  variants: SnapsVariant[];
  history: Array<{
    action: string;
    status: SnapsApprovalStatus;
    actor?: string;
    note?: string;
    createdAt: string;
  }>;
  comments: SnapsApprovalComment[];
  publicReviewEnabled?: boolean;
  publicReviewToken?: string;
  publicReviewPath?: string;
  publicReviewUrl?: string;
  publicReviewAllowDecision?: boolean;
  publicReviewExpiresAt?: string;
  publicReviewCreatedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type SnapsApprovalPublicLink = {
  product: 'snaps';
  source: 'snaps-approval-public-link';
  approval: SnapsApprovalItem;
  token: string;
  publicReviewPath: string;
  publicReviewUrl: string;
  publicApiPath: string;
  expiresAt?: string;
  allowDecision: boolean;
};

type SnapsIdeaStatus =
  | 'inbox'
  | 'planned'
  | 'drafted'
  | 'scheduled'
  | 'archived';

type SnapsIdeaStatusFilter = SnapsIdeaStatus | 'all';

type SnapsIdeaPriority = 'high' | 'medium' | 'low';

type SnapsIdeaSuggestion = {
  title: string;
  body: string;
  group: string;
  tags: string[];
  targetPlatforms: TargetPlatform[];
  priority: SnapsIdeaPriority;
  angle: string;
  format: string;
  cta: string;
};

type SnapsIdeaPreview = {
  product: 'snaps';
  source: 'snaps-idea-board';
  topic: string;
  audience: string;
  goal: string;
  totalIdeas: number;
  ideas: SnapsIdeaSuggestion[];
  warnings: string[];
  samplePrompt: string;
};

type SnapsIdeaItem = {
  id: string;
  organizationId: string;
  title: string;
  body: string;
  group: string;
  status: SnapsIdeaStatus;
  tags: string[];
  mediaUrls: string[];
  linkUrl?: string;
  sourceUrl?: string;
  targetPlatforms: TargetPlatform[];
  priority: SnapsIdeaPriority;
  note?: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  promotedAt?: string;
};

type SnapsBrandKitDraft = {
  product: 'snaps';
  source: 'snaps-brand-kit';
  name: string;
  audience: string;
  voice: string;
  tone: string;
  values: string[];
  bannedTerms: string[];
  requiredTerms: string[];
  hashtags: string[];
  cta: string;
  colors: string[];
  targetPlatforms: TargetPlatform[];
  examples: string[];
  promptGuidance: string;
  warnings: string[];
};

type SnapsBrandKitItem = SnapsBrandKitDraft & {
  id: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
};

type SnapsBrandKitApplication = {
  product: 'snaps';
  source: 'snaps-brand-kit-application';
  brandKit: SnapsBrandKitItem;
  transformPatch: {
    tone: string;
    topic: string;
    targetPlatforms: TargetPlatform[];
  };
  promptPrefix: string;
  complianceChecklist: string[];
  hashtagAppend: string[];
  warnings: string[];
};

type SnapsMediaAssetType =
  | 'image'
  | 'video'
  | 'gif'
  | 'carousel'
  | 'document'
  | 'unknown';

type SnapsMediaPlatformFit = {
  platform: TargetPlatform;
  label: string;
  status: 'ready' | 'needs-review' | 'assist-only';
  recommendation: string;
  warnings: string[];
};

type SnapsMediaAssetDraft = {
  product: 'snaps';
  source: 'snaps-media-library';
  title: string;
  url: string;
  thumbnail: string;
  mediaType: SnapsMediaAssetType;
  altText: string;
  caption: string;
  campaign: string;
  tags: string[];
  targetPlatforms: TargetPlatform[];
  width?: number;
  height?: number;
  durationSeconds?: number;
  platformFit: SnapsMediaPlatformFit[];
  warnings: string[];
};

type SnapsMediaAssetItem = SnapsMediaAssetDraft & {
  id: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
};

type SnapsMediaAssetAttachResult = {
  product: 'snaps';
  source: 'snaps-media-library-attach';
  asset: SnapsMediaAssetItem;
  transform: SnapsTransformResult;
  checklist: string[];
  warnings: string[];
};

type SnapsCreativeBriefMediaType = 'image' | 'video' | 'gif' | 'carousel';

type SnapsCreativeBriefAspectRatio =
  | 'square'
  | 'portrait'
  | 'story'
  | 'landscape';

type SnapsCreativeBriefItem = {
  id: string;
  angle: 'hero' | 'proof' | 'cta';
  mediaType: SnapsCreativeBriefMediaType;
  aspectRatio: SnapsCreativeBriefAspectRatio;
  dimensions: {
    width: number;
    height: number;
  };
  title: string;
  overlayText: string;
  prompt: string;
  altText: string;
  captionSeed: string;
  productionNotes: string[];
  storyboard: string[];
  referenceUrls: string[];
  svgDataUrl: string;
  warnings: string[];
};

type SnapsCreativeBriefPreview = {
  product: 'snaps';
  source: 'snaps-creative-brief';
  mediaType: SnapsCreativeBriefMediaType;
  aspectRatio: SnapsCreativeBriefAspectRatio;
  dimensions: {
    width: number;
    height: number;
  };
  title: string;
  topic: string;
  campaign: string;
  visualStyle: string;
  targetPlatforms: TargetPlatform[];
  items: SnapsCreativeBriefItem[];
  checklist: string[];
  warnings: string[];
};

type SnapsCreativeBriefSaveResult = {
  product: 'snaps';
  source: 'snaps-creative-brief';
  preview: SnapsCreativeBriefPreview;
  asset: SnapsMediaAssetItem;
};

const ideaStatusLabels: Record<SnapsIdeaStatus, string> = {
  inbox: '아이디어',
  planned: '계획됨',
  drafted: '초안화',
  scheduled: '예약됨',
  archived: '보관됨',
};

const ideaStatusOptions: Array<{
  id: SnapsIdeaStatusFilter;
  label: string;
}> = [
  { id: 'inbox', label: '아이디어' },
  { id: 'planned', label: '계획됨' },
  { id: 'drafted', label: '초안화' },
  { id: 'scheduled', label: '예약됨' },
  { id: 'archived', label: '보관됨' },
  { id: 'all', label: '전체' },
];

type SnapsSourceResolverType =
  | 'auto'
  | 'url'
  | 'article'
  | 'youtube'
  | 'tiktok'
  | 'x'
  | 'pdf'
  | 'audio'
  | 'text'
  | 'research';

type SnapsSourceResolverPreview = {
  product: 'snaps';
  source: 'snaps-source-resolver';
  sourceType: Exclude<SnapsSourceResolverType, 'auto'>;
  status: 'ready' | 'warning';
  title: string;
  sourceText: string;
  sourceUrl?: string;
  sourcePlatform: string;
  topic?: string;
  tone?: string;
  tags: string[];
  wordCount: number;
  metadata: {
    description?: string;
    contentType?: string;
    extractionMode: 'html' | 'text' | 'research' | 'metadata-fallback';
  };
  sourceInput: SnapsStoredSource;
  warnings: string[];
};

type SnapsBulkCampaignRow = {
  rowNumber: number;
  title: string;
  sourceText: string;
  topic?: string;
  tone?: string;
  platforms: TargetPlatform[];
  scheduleType: 'draft' | 'schedule';
  publishDate?: string;
  mediaUrl?: string;
  linkUrl?: string;
  tags: string[];
  warnings: string[];
  status: 'ready' | 'warning' | 'invalid';
};

type SnapsBulkCampaignPreview = {
  product: 'snaps';
  source: 'snaps-bulk-csv';
  columns: string[];
  sampleCsv: string;
  totalRows: number;
  acceptedRows: number;
  invalidRows: number;
  readyToSchedule: number;
  rows: SnapsBulkCampaignRow[];
};

type SnapsFeedItem = {
  itemIndex: number;
  title: string;
  sourceText: string;
  linkUrl?: string;
  imageUrl?: string;
  publishedAt?: string;
  topic?: string;
  tone?: string;
  platforms: TargetPlatform[];
  tags: string[];
  warnings: string[];
  status: 'ready' | 'warning' | 'invalid';
};

type SnapsFeedPreview = {
  product: 'snaps';
  source: 'snaps-rss-feed';
  feedUrl?: string;
  sampleRss: string;
  totalItems: number;
  acceptedItems: number;
  invalidItems: number;
  readyToSchedule: number;
  items: SnapsFeedItem[];
};

type SnapsCarouselTemplate =
  | 'listicle'
  | 'quote'
  | 'problem-solution'
  | 'report'
  | 'launch';

type SnapsCarouselAspectRatio = 'square' | 'portrait' | 'story' | 'landscape';

type SnapsCarouselVisualSlide = {
  slideIndex: number;
  kind: 'cover' | 'point' | 'quote' | 'cta';
  eyebrow: string;
  title: string;
  body: string;
  footer: string;
  visualPrompt: string;
  imageUrl?: string;
  svgDataUrl: string;
  alt: string;
  warnings: string[];
};

type SnapsCarouselVisualPreview = {
  product: 'snaps';
  source: 'snaps-carousel-visual';
  template: SnapsCarouselTemplate;
  aspectRatio: SnapsCarouselAspectRatio;
  dimensions: {
    width: number;
    height: number;
  };
  slideCount: number;
  title: string;
  topic?: string;
  captionSeed: string;
  exportHtml: string;
  media: NonNullable<SnapsVariant['media']>;
  slides: SnapsCarouselVisualSlide[];
  warnings: string[];
};

type SnapsVisualFeedPlannerStatus = 'draft' | 'scheduled' | 'published';
type SnapsVisualFeedPlannerViewMode = 'square' | 'vertical';

type SnapsVisualFeedPlannerItem = {
  id: string;
  order: number;
  title: string;
  caption: string;
  imageUrl: string;
  thumbnail: string;
  mediaType: 'image' | 'video' | 'carousel' | 'document' | 'unknown';
  status: SnapsVisualFeedPlannerStatus;
  publishDate?: string;
  source?: string;
  alt?: string;
  row: number;
  column: number;
  opacity: number;
  warnings: string[];
};

type SnapsVisualFeedPlannerPreview = {
  product: 'snaps';
  source: 'snaps-visual-feed-planner';
  platform: TargetPlatform;
  platformLabel: string;
  viewMode: SnapsVisualFeedPlannerViewMode;
  columns: 3;
  totalItems: number;
  draftItems: number;
  scheduledItems: number;
  publishedItems: number;
  rows: number;
  aestheticScore: number;
  items: SnapsVisualFeedPlannerItem[];
  warnings: string[];
  recommendations: string[];
};

type SnapsHashtagSetPlacement = 'caption' | 'first-comment';
type SnapsHashtagSetStrategy = 'balanced' | 'reach' | 'community' | 'campaign';

type SnapsHashtagSetPlatformPlan = {
  platform: TargetPlatform;
  label: string;
  hashtagLimit: number;
  selectedHashtags: string[];
  overLimit: number;
  placementSupported: boolean;
  status: 'ready' | 'warning';
  warnings: string[];
};

type SnapsHashtagSetDraft = {
  product: 'snaps';
  source: 'snaps-hashtag-set';
  title: string;
  description: string;
  topic: string;
  strategy: SnapsHashtagSetStrategy;
  placement: SnapsHashtagSetPlacement;
  reusableText: string;
  hashtags: string[];
  mentions: string[];
  tags: string[];
  targetPlatforms: TargetPlatform[];
  platformPlans: SnapsHashtagSetPlatformPlan[];
  warnings: string[];
  recommendations: string[];
};

type SnapsHashtagSetItem = SnapsHashtagSetDraft & {
  id: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
};

type SnapsHashtagSetApplication = {
  product: 'snaps';
  source: 'snaps-hashtag-set-application';
  set: SnapsHashtagSetItem;
  placement: SnapsHashtagSetPlacement;
  transform: SnapsTransformResult;
  checklist: string[];
  warnings: string[];
};

type SnapsHashtagTrackerGoal =
  | 'reach'
  | 'engagement'
  | 'saves'
  | 'clicks'
  | 'community';

type SnapsHashtagTrackerItem = {
  hashtag: string;
  source: 'metric' | 'variant' | 'generated';
  platforms: TargetPlatform[];
  posts: number;
  impressions: number;
  engagements: number;
  comments: number;
  saves: number;
  clicks: number;
  engagementRate: number;
  score: number;
  trend: 'rising' | 'steady' | 'watch' | 'fatigue';
  action: 'keep' | 'test' | 'replace';
  reason: string;
  suggestedPairings: string[];
};

type SnapsHashtagTrackerPreview = {
  product: 'snaps';
  source: 'snaps-hashtag-tracker';
  title: string;
  topic: string;
  goal: SnapsHashtagTrackerGoal;
  targetPlatforms: TargetPlatform[];
  totalHashtags: number;
  trackedHashtags: number;
  bestHashtag: string;
  averageEngagementRate: number;
  items: SnapsHashtagTrackerItem[];
  warnings: string[];
  recommendations: string[];
};

type SnapsSocialListeningSentiment =
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'mixed';

type SnapsSocialListeningIntent =
  | 'lead'
  | 'support'
  | 'complaint'
  | 'collaboration'
  | 'praise'
  | 'competitor'
  | 'spam'
  | 'awareness';

type SnapsSocialListeningPriority = 'high' | 'medium' | 'low';

type SnapsSocialListeningSignal = {
  id: string;
  label: string;
  priority: SnapsSocialListeningPriority;
  count: number;
  examples?: string[];
  action: string;
};

type SnapsSocialListeningCluster = {
  id: string;
  label: string;
  count: number;
  priority: SnapsSocialListeningPriority;
  sentiment: SnapsSocialListeningSentiment;
  keywords: string[];
  examples: string[];
  action: string;
};

type SnapsSocialListeningMention = {
  id: string;
  platform: TargetPlatform;
  author?: string;
  content: string;
  postId?: string;
  sourceUrl?: string;
  createdAt?: string;
  engagement: number;
  matchedKeywords: string[];
  excludedKeywords: string[];
  sentiment: SnapsSocialListeningSentiment;
  intent: SnapsSocialListeningIntent;
  priority: SnapsSocialListeningPriority;
  score: number;
  signals: string[];
  noise: boolean;
  recommendedAction: string;
};

type SnapsSocialListeningPreview = {
  product: 'snaps';
  source: 'snaps-social-listening';
  title: string;
  query: string;
  campaign?: string;
  keywords: string[];
  excludeKeywords: string[];
  targetPlatforms: TargetPlatform[];
  totalItems: number;
  matchedItems: number;
  highIntentItems: number;
  noiseItems: number;
  byPlatform: Record<string, number>;
  bySentiment: Record<SnapsSocialListeningSentiment, number>;
  byIntent: Record<SnapsSocialListeningIntent, number>;
  signals: SnapsSocialListeningSignal[];
  clusters: SnapsSocialListeningCluster[];
  mentions: SnapsSocialListeningMention[];
  warnings: string[];
  recommendations: string[];
};

type SnapsSocialListeningMonitor = Pick<
  SnapsSocialListeningPreview,
  'product' | 'source' | 'title' | 'query' | 'campaign' | 'keywords' | 'excludeKeywords' | 'targetPlatforms'
> & {
  id: string;
  organizationId: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastRun?: {
    matchedItems: number;
    highIntentItems: number;
    noiseItems: number;
    signals: SnapsSocialListeningSignal[];
    clusters: SnapsSocialListeningCluster[];
  };
};

type SnapsSocialListeningRunResult = {
  product: 'snaps';
  source: 'snaps-social-listening-run';
  monitor: SnapsSocialListeningMonitor;
  preview: SnapsSocialListeningPreview;
  inbox?: SnapsFeedbackView;
};

type SnapsTrendRadarStage =
  | 'emerging'
  | 'accelerating'
  | 'mainstream'
  | 'fatigue'
  | 'risk';

type SnapsTrendRadarCategory =
  | 'keyword'
  | 'hashtag'
  | 'competitor'
  | 'audience'
  | 'visual'
  | 'audio'
  | 'risk';

type SnapsTrendRadarTrend = {
  id: string;
  topic: string;
  category: SnapsTrendRadarCategory;
  stage: SnapsTrendRadarStage;
  score: number;
  velocity: number;
  volume: number;
  previousVolume: number;
  engagement: number;
  engagementRate: number;
  shareOfVoice: number;
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  confidence: number;
  keywords: string[];
  platforms: TargetPlatform[];
  competitorLead?: string;
  evidence: Array<{
    source: string;
    label: string;
    value: number;
    detail?: string;
  }>;
  creativeAngles: string[];
  recommendedFormats: string[];
  action: string;
};

type SnapsTrendRadarCluster = {
  id: string;
  label: string;
  count: number;
  averageScore: number;
  stage: SnapsTrendRadarStage;
  topics: string[];
  action: string;
};

type SnapsTrendRadarAlert = {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  trendId?: string;
  action: string;
};

type SnapsTrendRadarContentIdea = {
  id: string;
  trendId: string;
  platform: TargetPlatform;
  format: string;
  hook: string;
  captionBrief: string;
  cta: string;
  sourceText: string;
  score: number;
};

type SnapsTrendRadarPreview = {
  product: 'snaps';
  source: 'snaps-trend-radar';
  title: string;
  industry: string;
  region: string;
  windowDays: number;
  targetPlatforms: TargetPlatform[];
  totalSignals: number;
  totalTrends: number;
  trendingNow: string[];
  trends: SnapsTrendRadarTrend[];
  clusters: SnapsTrendRadarCluster[];
  alerts: SnapsTrendRadarAlert[];
  contentIdeas: SnapsTrendRadarContentIdea[];
  recommendations: string[];
  warnings: string[];
  imported?: {
    imported: number;
    total: number;
  };
};

type SnapsPostPreviewDevice = 'desktop' | 'mobile';

type SnapsPostPreviewCard = {
  platform: TargetPlatform;
  label: string;
  device: SnapsPostPreviewDevice;
  title: string;
  content: string;
  characterCount: number;
  characterLimit: number;
  feedCutoff: number;
  feedPreview: string;
  expandedPreview: string;
  hiddenCharacters: number;
  hardLimitExceeded: boolean;
  hashtagCount: number;
  mentionCount: number;
  urlCount: number;
  lineCount: number;
  linkPreview: {
    url?: string;
    title?: string;
    description?: string;
    image?: string;
    supported: boolean;
    customizable: boolean;
    missing: string[];
  };
  mediaPreview: {
    type: 'image' | 'video' | 'carousel' | 'unknown';
    url?: string;
    altText?: string;
    altTextSuggestion?: string;
    hasAltText: boolean;
  };
  accessibilityScore: number;
  warnings: string[];
  recommendations: string[];
  variant: SnapsVariant;
};

type SnapsPostPreviewSummary = {
  product: 'snaps';
  source: 'snaps-post-preview-inspector';
  device: SnapsPostPreviewDevice;
  totalCards: number;
  needsRewrite: number;
  averageAccessibilityScore: number;
  cards: SnapsPostPreviewCard[];
  warnings: string[];
  recommendations: string[];
};

type SnapsAdRelationship = 'none' | 'paid' | 'gifted' | 'affiliate' | 'employee' | 'own-brand';
type SnapsAdMediaType = 'text' | 'image' | 'video' | 'live';
type SnapsAdGuardStatus = 'pass' | 'review' | 'block';

type SnapsAdFinding = {
  rule: string;
  severity: 'blocker' | 'warning' | 'info';
  message: string;
  evidence?: string;
};

type SnapsAdDisclosureCard = {
  platform: TargetPlatform;
  label: string;
  title: string;
  content: string;
  visibleWindow: number;
  disclosureFound?: string;
  disclosureIndex: number;
  findings: SnapsAdFinding[];
  status: SnapsAdGuardStatus;
  fixedTitle: string;
  fixedContent: string;
  fixApplied: boolean;
  fixExceedsLimit: boolean;
};

type SnapsAdDisclosureSummary = {
  product: 'snaps';
  source: 'snaps-ad-disclosure-guard';
  relationship: SnapsAdRelationship;
  status: SnapsAdGuardStatus;
  totalCards: number;
  blockers: number;
  warnings: number;
  cards: SnapsAdDisclosureCard[];
  checklist: string[];
  references: string[];
  notice: string;
};

const adRelationshipOptions: Array<{ id: SnapsAdRelationship; label: string }> = [
  { id: 'none', label: '이해관계 없음' },
  { id: 'paid', label: '유료 광고' },
  { id: 'gifted', label: '제품 협찬' },
  { id: 'affiliate', label: '제휴 수수료' },
  { id: 'employee', label: '임직원 작성' },
  { id: 'own-brand', label: '자사 공식 계정' },
];

const adGuardStatusLabel: Record<SnapsAdGuardStatus, string> = {
  pass: '통과',
  review: '검토',
  block: '차단',
};

type SnapsFirstCommentStrategy = 'hashtags' | 'question' | 'link' | 'context';

type SnapsFirstCommentItem = {
  platform: TargetPlatform;
  label: string;
  title: string;
  captionPreview: string;
  firstComment: string;
  strategy: SnapsFirstCommentStrategy;
  supported: boolean;
  characterLimit: number;
  hashtagCount: number;
  warnings: string[];
};

type SnapsFirstCommentPreview = {
  product: 'snaps';
  source: 'snaps-first-comment-planner';
  strategy: SnapsFirstCommentStrategy;
  totalItems: number;
  supportedItems: number;
  unsupportedItems: number;
  supportedPlatforms: TargetPlatform[];
  unsupportedPlatforms: TargetPlatform[];
  items: SnapsFirstCommentItem[];
  warnings: string[];
  recommendations: string[];
};

type SnapsEvergreenCadence = 'weekly' | 'biweekly' | 'monthly';

type SnapsEvergreenRecycleItem = {
  itemIndex: number;
  title: string;
  sourceText: string;
  angle: string;
  category: string;
  cadence: SnapsEvergreenCadence;
  publishDate?: string;
  topPostUrl?: string;
  topic?: string;
  tone?: string;
  platforms: TargetPlatform[];
  tags: string[];
  warnings: string[];
  status: 'ready' | 'warning' | 'invalid';
};

type SnapsEvergreenRecyclePreview = {
  product: 'snaps';
  source: 'snaps-evergreen-recycle';
  title: string;
  category: string;
  cadence: SnapsEvergreenCadence;
  repeatCount: number;
  sampleSource: string;
  totalItems: number;
  acceptedItems: number;
  invalidItems: number;
  readyToSchedule: number;
  items: SnapsEvergreenRecycleItem[];
  warnings: string[];
};

type SnapsRecurringCadence =
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'custom-days';

type SnapsRecurringVariationMode = 'same' | 'angle-rotation';

type SnapsRecurringPostItem = {
  itemIndex: number;
  title: string;
  sourceText: string;
  topic?: string;
  tone?: string;
  cadence: SnapsRecurringCadence;
  intervalDays: number;
  publishDate: string;
  localTime: string;
  variation: string;
  cta: string;
  platforms: TargetPlatform[];
  tags: string[];
  warnings: string[];
  status: 'ready' | 'warning' | 'invalid';
};

type SnapsRecurringPostPreview = {
  product: 'snaps';
  source: 'snaps-recurring-posts';
  title: string;
  cadence: SnapsRecurringCadence;
  intervalDays: number;
  repeatCount: number;
  variationMode: SnapsRecurringVariationMode;
  sampleSource: string;
  totalItems: number;
  acceptedItems: number;
  invalidItems: number;
  readyToSchedule: number;
  items: SnapsRecurringPostItem[];
  warnings: string[];
};

type SnapsRepurposeWorkflowMode = 'asap' | 'schedule';
type SnapsRepurposeContentFilter =
  | 'future-only'
  | 'existing-only'
  | 'all-content';

type SnapsRepurposeScheduleSlot = {
  id: string;
  label: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone: string;
  nextOccurrenceAt: string;
  occupied: boolean;
};

type SnapsRepurposeQueueItem = {
  itemIndex: number;
  title: string;
  sourcePlatform: string;
  sourceUrl?: string;
  sourceText: string;
  detectedAt: string;
  contentScope: 'future' | 'existing';
  workflowMode: SnapsRepurposeWorkflowMode;
  contentFilter: SnapsRepurposeContentFilter;
  targetPlatforms: TargetPlatform[];
  publishDate?: string;
  assignedSlot?: SnapsRepurposeScheduleSlot;
  action:
    | 'publish-asap-after-refresh'
    | 'fill-next-plan-slot'
    | 'manual-review-only'
    | 'ignored-by-filter';
  tags: string[];
  warnings: string[];
  status: 'ready' | 'queued' | 'ignored' | 'invalid';
};

type SnapsRepurposeQueuePreview = {
  product: 'snaps';
  source: 'snaps-repurpose-queue';
  workflowMode: SnapsRepurposeWorkflowMode;
  contentFilter: SnapsRepurposeContentFilter;
  pollIntervalHours: number;
  checkNowAvailable: boolean;
  timezone: string;
  sampleSource: string;
  totalItems: number;
  acceptedItems: number;
  ignoredItems: number;
  invalidItems: number;
  readyToSchedule: number;
  scheduleSlots: SnapsRepurposeScheduleSlot[];
  items: SnapsRepurposeQueueItem[];
  warnings: string[];
  recommendations: string[];
};

type SnapsContentCalendarCadence =
  | 'daily'
  | 'weekdays'
  | 'three-per-week'
  | 'weekly-sprint';

type SnapsContentCalendarFormat =
  | 'text'
  | 'image'
  | 'carousel'
  | 'short-video'
  | 'story';

type SnapsContentCalendarItem = {
  itemIndex: number;
  dayIndex: number;
  publishDate: string;
  localTime: string;
  title: string;
  sourceText: string;
  platform: TargetPlatform;
  platformLabel: string;
  pillar: string;
  goal: string;
  format: SnapsContentCalendarFormat;
  angle: string;
  hook: string;
  cta: string;
  hashtags: string[];
  warnings: string[];
  status: 'ready' | 'warning' | 'invalid';
};

type SnapsContentCalendarPreview = {
  product: 'snaps';
  source: 'snaps-content-calendar';
  title: string;
  campaign: string;
  cadence: SnapsContentCalendarCadence;
  startDate: string;
  days: number;
  postsPerDay: number;
  sampleBrief: string;
  totalItems: number;
  acceptedItems: number;
  invalidItems: number;
  readyToSchedule: number;
  items: SnapsContentCalendarItem[];
  warnings: string[];
};

type SnapsContentCategoryShareMode = 'evergreen' | 'share-once';
type SnapsContentCategoryInsertMode = 'top' | 'bottom';

type SnapsContentCategoryDefinition = {
  categoryIndex: number;
  name: string;
  description: string;
  color: string;
  shareMode: SnapsContentCategoryShareMode;
  insertMode: SnapsContentCategoryInsertMode;
  randomize: boolean;
  weight: number;
  warnings: string[];
  status: 'ready' | 'warning' | 'invalid';
};

type SnapsContentCategoryQueueItem = {
  itemIndex: number;
  queueOrder: number;
  categoryName: string;
  categoryColor: string;
  shareMode: SnapsContentCategoryShareMode;
  insertMode: SnapsContentCategoryInsertMode;
  platform: TargetPlatform;
  platformLabel: string;
  publishDate: string;
  localTime: string;
  title: string;
  sourceText: string;
  angle: string;
  cta: string;
  linkUrl?: string;
  utmCampaign?: string;
  hashtags: string[];
  warnings: string[];
  status: 'ready' | 'warning' | 'invalid';
};

type SnapsContentCategoryPreview = {
  product: 'snaps';
  source: 'snaps-content-categories';
  title: string;
  campaign: string;
  startDate: string;
  days: number;
  postsPerDay: number;
  sampleCategories: string;
  categories: SnapsContentCategoryDefinition[];
  totalItems: number;
  acceptedItems: number;
  invalidItems: number;
  readyToSchedule: number;
  categoryMix: Array<{
    name: string;
    count: number;
    shareMode: SnapsContentCategoryShareMode;
    color: string;
  }>;
  items: SnapsContentCategoryQueueItem[];
  warnings: string[];
};

type SnapsPostConditionType =
  | 'above-average'
  | 'delay'
  | 'likes'
  | 'retweets'
  | 'comments'
  | 'impressions'
  | 'engagement-rate';

type SnapsPostConditionStatus = 'ready' | 'waiting' | 'blocked';

type SnapsPostConditionItem = {
  title: string;
  sourceText: string;
  parentTitle: string;
  parentUrl?: string;
  parentPlatform: TargetPlatform;
  conditionType: SnapsPostConditionType;
  conditionSummary: string;
  triggerMet: boolean;
  recommendedPublishDate?: string;
  platforms: TargetPlatform[];
  cta?: string;
  tags: string[];
  warnings: string[];
  status: SnapsPostConditionStatus;
};

type SnapsPostConditionPreview = {
  product: 'snaps';
  source: 'snaps-post-condition';
  conditionType: SnapsPostConditionType;
  status: SnapsPostConditionStatus;
  triggerMet: boolean;
  conditionSummary: string;
  metricValue: number;
  threshold: number;
  delayMinutes: number;
  elapsedMinutes?: number;
  recommendedPublishDate?: string;
  item: SnapsPostConditionItem;
  metrics: {
    likes: number;
    retweets: number;
    comments: number;
    impressions: number;
    engagementRate: number;
  };
  baseline: {
    averageImpressions: number;
    averageEngagementRate: number;
  };
  warnings: string[];
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

type SnapsReplyTemplate = {
  id: string;
  title: string;
  sentiment?: string;
  platform?: TargetPlatform;
  body: string;
  cta?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
};

type SnapsInboxNote = {
  id: string;
  platform?: TargetPlatform;
  author?: string;
  postId?: string;
  sourceUrl?: string;
  note: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
};

type SnapsFeedbackItemView = {
  id: string;
  platform: TargetPlatform;
  content: string;
  author?: string;
  postId?: string;
  sourceUrl?: string;
  sentiment?: string;
  status: SnapsFeedbackStatus;
  readAt?: string;
  resolvedAt?: string;
  importedAt?: string;
};

type SnapsInboxAssignmentPriority = 'urgent' | 'high' | 'normal' | 'low';
type SnapsInboxAssignmentRole =
  | 'support'
  | 'sales'
  | 'community'
  | 'moderation'
  | 'partnership';

type SnapsInboxAssignmentCase = {
  id: string;
  itemId: string;
  platform: TargetPlatform;
  author?: string;
  postId?: string;
  excerpt: string;
  sentiment: string;
  conversionSignals?: string[];
  priority: SnapsInboxAssignmentPriority;
  assigneeRole: SnapsInboxAssignmentRole;
  assigneeLabel: string;
  status: 'new' | 'open' | 'watch';
  slaMinutes: number;
  dueAt: string;
  tags: string[];
  replyTemplateId?: string;
  replyTemplateTitle?: string;
  noteMatches?: Array<{
    id: string;
    note: string;
    tags: string[];
  }>;
  action: string;
  rationale: string[];
};

type SnapsInboxAssignmentPreview = {
  product: 'snaps';
  source: 'snaps-inbox-assignments';
  generatedAt: string;
  total: number;
  lanes: Record<SnapsInboxAssignmentPriority, number>;
  teamLoad: Array<{
    role: SnapsInboxAssignmentRole;
    label: string;
    count: number;
    urgent: number;
    high: number;
  }>;
  cases: SnapsInboxAssignmentCase[];
  nextActions: string[];
  automations: string[];
  warnings: string[];
};

type SnapsFeedbackView = {
  imported?: number;
  deleted?: number;
  total?: number;
  bySentiment?: Record<string, number>;
  conversionSignals?: Array<{
    id: string;
    label: string;
    priority: 'high' | 'medium' | 'low';
    count: number;
    examples?: string[];
    action: string;
  }>;
  highlights?: string[];
  replySuggestions?: SnapsReplySuggestion[];
};

type SnapsAgentExecutionStep = {
  label: string;
  detail: string;
  status: 'ready' | 'needs-confirmation' | 'manual';
};

type SnapsAgentConfirmationChecklistItem = {
  id: string;
  label: string;
  detail: string;
  status: 'ready' | 'attention' | 'manual';
};

type SnapsAgentEngagementSignal = {
  id: string;
  label: string;
  priority: 'high' | 'medium' | 'low';
  triggerExamples: string[];
  action: string;
};

type SnapsAgentMarketingLanePlan = {
  lane: 'monetize' | 'publish' | 'engage' | 'create';
  label: string;
  goal: string;
  actions: string[];
  kpis: string[];
  status: 'ready' | 'needs-confirmation' | 'manual';
};

type SnapsAgentMarketingStrategy = {
  framework: 'Monetize-Publish-Engage-Create';
  inspiredBy: 'AiToEarn';
  revenueModels: Array<'CPS' | 'CPE' | 'CPM'>;
  lanes: SnapsAgentMarketingLanePlan[];
  engagementSignals: SnapsAgentEngagementSignal[];
  batchIdeas: string[];
  mcpReadyActions: string[];
  operatorGuardrails: string[];
};

type SnapsAgentCompetitorFeature = {
  id: string;
  label: string;
  copiedFrom: string[];
  evidence: string;
  snapsSurface: string;
  status: 'implemented' | 'operator-assisted' | 'roadmap';
  operatorAction: string;
};

type SnapsAgentCompetitorPlaybook = {
  headline: string;
  sources: string[];
  parityFeatures: SnapsAgentCompetitorFeature[];
  moat: string[];
  implementationNotes: string[];
};

type SnapsAgentGoToMarketSegment = {
  id: string;
  label: string;
  pain: string;
  offer: string;
  channels: string[];
  firstPitch: string;
  pricing: string;
  proofMetric: string;
};

type SnapsAgentGoToMarketPlan = {
  primaryBuyer: string;
  positioning: string;
  packages: string[];
  segments: SnapsAgentGoToMarketSegment[];
  salesMotion: string[];
  pricingNotes: string[];
};

type SnapsAgentScenarioRun = {
  scenario: string;
  persona: string;
  sourceAsset: string;
  workflow: string[];
  preparedOutputs: string[];
  validationChecklist: string[];
  expectedBusinessOutcome: string;
};

type SnapsAgentQualityGate = {
  id: string;
  label: string;
  detail: string;
  severity: 'blocker' | 'warning' | 'info';
  platform?: TargetPlatform;
  fixAction: string;
};

type SnapsAgentRecommendedAction = {
  id: string;
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

type SnapsAgentCampaignTimelineItem = {
  id: string;
  label: string;
  window: string;
  actions: string[];
  status: 'ready' | 'needs-confirmation' | 'manual';
};

type SnapsAgentOperationPreview = {
  status: 'thinking' | 'generating_content' | 'generating_video' | 'requires_confirmation' | 'completed' | 'error';
  progress: number;
  headline: string;
  progressSteps: Array<{
    id: string;
    label: string;
    detail: string;
    status: 'done' | 'active' | 'waiting' | 'blocked';
    progress: number;
  }>;
  platformReadiness: Array<{
    platform: TargetPlatform;
    label: string;
    publishMode: 'schedule' | 'assist';
    status: 'ready' | 'attention' | 'manual';
    checks: string[];
    blockers: string[];
  }>;
  readiness?: {
    score: number;
    level: 'ready' | 'needs-input' | 'manual-review';
    summary: string;
  };
  qualityGates?: SnapsAgentQualityGate[];
  recommendedActions?: SnapsAgentRecommendedAction[];
  nextActions: string[];
  requiresConfirmation: true;
};

type SnapsAgentPlan = {
  command: string;
  sourceText: string;
  topic?: string;
  tone: string;
  targetPlatforms: TargetPlatform[];
  scheduleType: 'draft' | 'schedule';
  publishDate?: string;
  publishDateLocal?: string;
  includeShortVideo: boolean;
  shortVideoPlatform: 'instagram' | 'youtube' | 'tiktok';
  shortVideoTargetPlatforms: TargetPlatform[];
  needsConfirmation: true;
  confirmationPolicy: string;
  assumptions?: string[];
  operatorSummary?: string[];
  missingInputs?: string[];
  confirmationChecklist?: SnapsAgentConfirmationChecklistItem[];
  campaignTimeline?: SnapsAgentCampaignTimelineItem[];
  marketingStrategy?: SnapsAgentMarketingStrategy;
  competitorPlaybook?: SnapsAgentCompetitorPlaybook;
  goToMarketPlan?: SnapsAgentGoToMarketPlan;
  scenarioRun?: SnapsAgentScenarioRun;
  executionPlan?: SnapsAgentExecutionStep[];
};

type SnapsAgentPreparedPayload = {
  plan: SnapsAgentPlan;
  transform: SnapsTransformResult;
  operation: SnapsAgentOperationPreview;
  video?: SnapsVideoResult;
  warnings?: string[];
};

type SnapsAgentPrepareResult = SnapsAgentPreparedPayload & {
  task?: SnapsAgentTaskDetail;
};

type SnapsAgentTaskListItem = {
  id: string;
  title: string;
  command: string;
  status: 'requires_confirmation' | 'completed' | 'error' | 'aborted';
  progress: number;
  platformCount: number;
  shortVideo: boolean;
  favorite: boolean;
  rating?: number;
  topic?: string;
  platforms?: TargetPlatform[];
  publishDateLocal?: string;
  createdAt?: string;
  updatedAt?: string;
};

type SnapsAgentTaskDetail = SnapsAgentTaskListItem & {
  result: SnapsAgentPreparedPayload;
  messages?: Array<{
    type: 'user' | 'assistant' | 'system' | 'result';
    content: string;
    createdAt: string;
  }>;
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

export function SnapsWorkspace({
  surface = 'studio',
}: {
  surface?: SnapsWorkspaceSurface;
} = {}) {
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
  const [resolverType, setResolverType] =
    useState<SnapsSourceResolverType>('auto');
  const [resolverUrl, setResolverUrl] = useState('');
  const [resolverText, setResolverText] = useState('');
  const [resolverQuery, setResolverQuery] = useState('AI 콘텐츠 자동화');
  const [resolverInstructions, setResolverInstructions] =
    useState('한국 B2B 브랜드 톤으로 재사용');
  const [resolverPreview, setResolverPreview] =
    useState<SnapsSourceResolverPreview | null>(null);
  const [resolverLoading, setResolverLoading] = useState(false);
  const [health, setHealth] = useState<SnapsHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [activity, setActivity] = useState<SnapsActivityEntry[]>([]);
  const [workspaceImportText, setWorkspaceImportText] = useState('');
  const [workspaceImporting, setWorkspaceImporting] = useState(false);
  const [bulkCsvText, setBulkCsvText] = useState(bulkCampaignSampleCsv);
  const [bulkPreview, setBulkPreview] = useState<SnapsBulkCampaignPreview | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [feedXmlText, setFeedXmlText] = useState(feedIntakeSampleXml);
  const [feedUrl, setFeedUrl] = useState('');
  const [feedPreview, setFeedPreview] = useState<SnapsFeedPreview | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [carouselSourceText, setCarouselSourceText] = useState(carouselVisualSampleSource);
  const [carouselTemplate, setCarouselTemplate] =
    useState<SnapsCarouselTemplate>('listicle');
  const [carouselAspectRatio, setCarouselAspectRatio] =
    useState<SnapsCarouselAspectRatio>('square');
  const [carouselBrandColor, setCarouselBrandColor] = useState('#12b8b8');
  const [carouselAccentColor, setCarouselAccentColor] = useState('#f6c85f');
  const [carouselCta, setCarouselCta] =
    useState('댓글로 필요한 내용을 알려주세요.');
  const [carouselPreview, setCarouselPreview] =
    useState<SnapsCarouselVisualPreview | null>(null);
  const [carouselLoading, setCarouselLoading] = useState(false);
  const [visualPlannerText, setVisualPlannerText] =
    useState(visualFeedPlannerSample);
  const [visualPlannerViewMode, setVisualPlannerViewMode] =
    useState<SnapsVisualFeedPlannerViewMode>('square');
  const [visualPlannerIncludeDrafts, setVisualPlannerIncludeDrafts] = useState(true);
  const [visualPlannerPreview, setVisualPlannerPreview] =
    useState<SnapsVisualFeedPlannerPreview | null>(null);
  const [visualPlannerLoading, setVisualPlannerLoading] = useState(false);
  const [hashtagSetTitle, setHashtagSetTitle] = useState('AI 콘텐츠 운영 태그');
  const [hashtagSetText, setHashtagSetText] = useState(hashtagSetSample);
  const [hashtagSetReusableText, setHashtagSetReusableText] = useState(
    '자료 링크나 실제 적용 예시가 필요하면 댓글로 파일럿이라고 남겨주세요.'
  );
  const [hashtagSetPlacement, setHashtagSetPlacement] =
    useState<SnapsHashtagSetPlacement>('caption');
  const [hashtagSetStrategy, setHashtagSetStrategy] =
    useState<SnapsHashtagSetStrategy>('balanced');
  const [hashtagSetPreview, setHashtagSetPreview] =
    useState<SnapsHashtagSetDraft | null>(null);
  const [hashtagSets, setHashtagSets] = useState<SnapsHashtagSetItem[]>([]);
  const [activeHashtagSetId, setActiveHashtagSetId] = useState('');
  const [hashtagSetApplication, setHashtagSetApplication] =
    useState<SnapsHashtagSetApplication | null>(null);
  const [hashtagSetLoading, setHashtagSetLoading] = useState(false);
  const [hashtagTrackerGoal, setHashtagTrackerGoal] =
    useState<SnapsHashtagTrackerGoal>('engagement');
  const [hashtagTrackerMetrics, setHashtagTrackerMetrics] = useState(
    'hashtag,platform,posts,impressions,engagements,comments,saves,clicks\n#AI마케팅,instagram,8,12400,760,43,118,62\n#SNS운영,instagram,6,9100,512,35,71,44\n#콘텐츠자동화,x,10,18800,620,52,38,91\n#마케팅실무,instagram,18,8400,174,9,12,8'
  );
  const [hashtagTrackerPreview, setHashtagTrackerPreview] =
    useState<SnapsHashtagTrackerPreview | null>(null);
  const [firstCommentText, setFirstCommentText] = useState(firstCommentSample);
  const [firstCommentStrategy, setFirstCommentStrategy] =
    useState<SnapsFirstCommentStrategy>('hashtags');
  const [firstCommentPreview, setFirstCommentPreview] =
    useState<SnapsFirstCommentPreview | null>(null);
  const [firstCommentLoading, setFirstCommentLoading] = useState(false);
  const [recycleSourceText, setRecycleSourceText] = useState(evergreenRecycleSampleSource);
  const [recycleCategory, setRecycleCategory] = useState('evergreen');
  const [recycleCadence, setRecycleCadence] =
    useState<SnapsEvergreenCadence>('weekly');
  const [recycleRepeatCount, setRecycleRepeatCount] = useState('4');
  const [recycleTopPostUrl, setRecycleTopPostUrl] = useState('');
  const [recyclePerformanceNote, setRecyclePerformanceNote] =
    useState('저장률과 댓글 질문이 높았던 게시물');
  const [recyclePreview, setRecyclePreview] =
    useState<SnapsEvergreenRecyclePreview | null>(null);
  const [recycleLoading, setRecycleLoading] = useState(false);
  const [recurringSourceText, setRecurringSourceText] =
    useState(recurringPostSampleSource);
  const [recurringCadence, setRecurringCadence] =
    useState<SnapsRecurringCadence>('weekly');
  const [recurringRepeatCount, setRecurringRepeatCount] = useState('4');
  const [recurringIntervalDays, setRecurringIntervalDays] = useState('7');
  const [recurringLocalTime, setRecurringLocalTime] = useState('10:00');
  const [recurringVariationMode, setRecurringVariationMode] =
    useState<SnapsRecurringVariationMode>('angle-rotation');
  const [recurringCta, setRecurringCta] =
    useState('댓글로 파일럿이라고 남기면 샘플 캘린더를 보내드립니다.');
  const [recurringPreview, setRecurringPreview] =
    useState<SnapsRecurringPostPreview | null>(null);
  const [recurringLoading, setRecurringLoading] = useState(false);
  const [repurposeSourceText, setRepurposeSourceText] =
    useState(repurposeQueueSampleSource);
  const [repurposeSlots, setRepurposeSlots] = useState(repurposeQueueSlotSample);
  const [repurposeWorkflowMode, setRepurposeWorkflowMode] =
    useState<SnapsRepurposeWorkflowMode>('schedule');
  const [repurposeContentFilter, setRepurposeContentFilter] =
    useState<SnapsRepurposeContentFilter>('all-content');
  const [repurposeSourcePlatform, setRepurposeSourcePlatform] = useState('youtube');
  const [repurposePreview, setRepurposePreview] =
    useState<SnapsRepurposeQueuePreview | null>(null);
  const [repurposeLoading, setRepurposeLoading] = useState(false);
  const [calendarBrief, setCalendarBrief] = useState(contentCalendarSampleBrief);
  const [calendarCampaign, setCalendarCampaign] =
    useState('AI 콘텐츠 운영 14일 챌린지');
  const [calendarAudience, setCalendarAudience] =
    useState('콘텐츠를 혼자 운영하는 B2B 마케터');
  const [calendarCadence, setCalendarCadence] =
    useState<SnapsContentCalendarCadence>('weekdays');
  const [calendarDays, setCalendarDays] = useState('14');
  const [calendarPostsPerDay, setCalendarPostsPerDay] = useState('1');
  const [calendarPillars, setCalendarPillars] =
    useState('교육,문제 인식,사례,전환');
  const [calendarGoals, setCalendarGoals] = useState('reach,save,comment,lead');
  const [calendarFormats, setCalendarFormats] =
    useState('text,carousel,short-video');
  const [calendarCta, setCalendarCta] =
    useState('댓글로 필요한 주제를 알려주세요.');
  const [calendarPreview, setCalendarPreview] =
    useState<SnapsContentCalendarPreview | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [categorySourceText, setCategorySourceText] =
    useState(contentCategorySampleSource);
  const [categoryCampaign, setCategoryCampaign] =
    useState('AI 콘텐츠 운영 14일 챌린지');
  const [categoryConfig, setCategoryConfig] =
    useState(contentCategorySampleConfig);
  const [categorySequence, setCategorySequence] =
    useState('교육,교육,사례,커뮤니티,프로모션');
  const [categoryDays, setCategoryDays] = useState('14');
  const [categoryPostsPerDay, setCategoryPostsPerDay] = useState('1');
  const [categoryCta, setCategoryCta] =
    useState('댓글로 필요한 카테고리를 알려주세요.');
  const [categoryLinkUrl, setCategoryLinkUrl] = useState('https://example.com/offer');
  const [categoryPreview, setCategoryPreview] =
    useState<SnapsContentCategoryPreview | null>(null);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [conditionParentTitle, setConditionParentTitle] =
    useState('AI 콘텐츠 운영 체크리스트');
  const [conditionParentUrl, setConditionParentUrl] = useState('');
  const [conditionParentPlatform, setConditionParentPlatform] =
    useState<TargetPlatform>('instagram');
  const [conditionPublishedAt, setConditionPublishedAt] = useState(defaultPublishDate);
  const [conditionType, setConditionType] =
    useState<SnapsPostConditionType>('engagement-rate');
  const [conditionThreshold, setConditionThreshold] = useState('3.5');
  const [conditionDelayMinutes, setConditionDelayMinutes] = useState('45');
  const [conditionLikes, setConditionLikes] = useState('120');
  const [conditionRetweets, setConditionRetweets] = useState('8');
  const [conditionComments, setConditionComments] = useState('18');
  const [conditionImpressions, setConditionImpressions] = useState('4200');
  const [conditionEngagementRate, setConditionEngagementRate] = useState('4.2');
  const [conditionAverageImpressions, setConditionAverageImpressions] =
    useState('3000');
  const [conditionAverageEngagementRate, setConditionAverageEngagementRate] =
    useState('3.1');
  const [conditionFollowUpText, setConditionFollowUpText] =
    useState(conditionalFollowUpSample);
  const [conditionCta, setConditionCta] = useState('샘플 링크를 확인하세요.');
  const [conditionPreview, setConditionPreview] =
    useState<SnapsPostConditionPreview | null>(null);
  const [conditionLoading, setConditionLoading] = useState(false);
  const [tone, setTone] = useState('한국 나노 인플루언서 스타일');
  const [useRag, setUseRag] = useState(true);
  const [selectedPlatforms, setSelectedPlatforms] = useState<TargetPlatform[]>([
    'threads',
    'instagram',
    'naver-blog',
  ]);
  const [naverCafeClubId, setNaverCafeClubId] = useState('');
  const [naverCafeMenuId, setNaverCafeMenuId] = useState('');
  const [loading, setLoading] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [scheduleType, setScheduleType] = useState<'draft' | 'schedule'>('draft');
  const [publishDate, setPublishDate] = useState(defaultPublishDate);
  const [bestTimeLoading, setBestTimeLoading] = useState(false);
  const [bestTime, setBestTime] = useState<SnapsBestTimeRecommendation | null>(null);
  const [coachPlatform, setCoachPlatform] = useState<TargetPlatform>('instagram');
  const [coachVisualDescription, setCoachVisualDescription] = useState(
    '첫 화면에 큰 자막, 문제 장면, 체크리스트 카드가 순서대로 보입니다.'
  );
  const [coachTargetAudience, setCoachTargetAudience] =
    useState('콘텐츠 만드는 사람');
  const [coachResult, setCoachResult] =
    useState<SnapsViralCoachScorecard | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [variationGoal, setVariationGoal] =
    useState<SnapsPostVariationGoal>('engagement');
  const [variationCount, setVariationCount] = useState('5');
  const [variationAudience, setVariationAudience] =
    useState('콘텐츠를 혼자 운영하는 B2B 마케터');
  const [variationCta, setVariationCta] =
    useState('댓글로 파일럿이라고 남기면 샘플 캘린더를 보내드립니다.');
  const [variationCompetitorHook, setVariationCompetitorHook] = useState(
    '손작업 콘텐츠를 줄이세요'
  );
  const [variationPreview, setVariationPreview] =
    useState<SnapsPostVariationPreview | null>(null);
  const [variationLoading, setVariationLoading] = useState(false);
  const [approvalTitle, setApprovalTitle] = useState('이번 캠페인 승인 요청');
  const [approvalReviewer, setApprovalReviewer] = useState('client@example.com');
  const [approvalNote, setApprovalNote] = useState('브랜드 톤과 CTA만 확인해주세요.');
  const [approvalRequests, setApprovalRequests] = useState<SnapsApprovalItem[]>([]);
  const [activeApprovalId, setActiveApprovalId] = useState('');
  const [approvalCommentActor, setApprovalCommentActor] =
    useState('snaps operator');
  const [approvalCommentVisibility, setApprovalCommentVisibility] =
    useState<'reviewer' | 'internal'>('reviewer');
  const [approvalCommentSelection, setApprovalCommentSelection] = useState('');
  const [approvalCommentText, setApprovalCommentText] = useState(
    'CTA 문구를 더 구체적으로 바꾸면 좋겠습니다.'
  );
  const [approvalPublicLink, setApprovalPublicLink] =
    useState<SnapsApprovalPublicLink | null>(null);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [ideaTopic, setIdeaTopic] = useState('AI 콘텐츠 운영 14일 챌린지');
  const [ideaAudience, setIdeaAudience] =
    useState('혼자 SNS를 운영하는 B2B 마케터');
  const [ideaGoal, setIdeaGoal] = useState('저장, 상담 댓글, 데모 신청');
  const [ideaGroup, setIdeaGroup] = useState('This week');
  const [ideaTags, setIdeaTags] = useState('idea, pilot, content-ops');
  const [ideaTitle, setIdeaTitle] = useState('반복 콘텐츠 운영 체크리스트');
  const [ideaBody, setIdeaBody] = useState(
    'Hook: 매주 무엇을 올릴지 고민하는 시간을 줄이는 5분 체크리스트\nCTA: 댓글로 파일럿이라고 남기면 샘플 캘린더를 보냅니다.'
  );
  const [ideaStatus, setIdeaStatus] = useState<SnapsIdeaStatusFilter>('inbox');
  const [ideaSearch, setIdeaSearch] = useState('');
  const [ideaPreview, setIdeaPreview] = useState<SnapsIdeaPreview | null>(null);
  const [ideas, setIdeas] = useState<SnapsIdeaItem[]>([]);
  const [activeIdeaId, setActiveIdeaId] = useState('');
  const [ideaLoading, setIdeaLoading] = useState(false);
  const [brandKitName, setBrandKitName] = useState('snaps B2B 파일럿');
  const [brandKitAudience, setBrandKitAudience] = useState('5인 이하 B2B 브랜드 대표와 마케터');
  const [brandKitVoice, setBrandKitVoice] = useState('명확하고 실무적인 한국어 조언자');
  const [brandKitTone, setBrandKitTone] = useState('근거 중심, 과장 없음, CTA는 부드럽게');
  const [brandKitValues, setBrandKitValues] = useState('명확함, 실행 가능성, 신뢰');
  const [brandKitRequiredTerms, setBrandKitRequiredTerms] = useState('snaps, 콘텐츠 운영, 파일럿');
  const [brandKitBannedTerms, setBrandKitBannedTerms] = useState('혁신적, 완벽한, 무조건');
  const [brandKitHashtags, setBrandKitHashtags] = useState('#콘텐츠운영, #마케팅자동화, #snaps');
  const [brandKitCta, setBrandKitCta] = useState('댓글로 파일럿이라고 남기면 샘플 캘린더를 보내드립니다.');
  const [brandKitColors, setBrandKitColors] = useState('#12b8b8, #f6c85f, #ef6f6c');
  const [brandKitExamples, setBrandKitExamples] = useState(
    '하나의 원문을 플랫폼별 문법으로 바꾸면 제작 시간이 줄어듭니다.\n과장보다 실제 작업 시간을 줄이는 흐름을 보여주세요.'
  );
  const [brandKitPreview, setBrandKitPreview] = useState<SnapsBrandKitDraft | null>(null);
  const [brandKits, setBrandKits] = useState<SnapsBrandKitItem[]>([]);
  const [activeBrandKitId, setActiveBrandKitId] = useState('');
  const [brandKitApplication, setBrandKitApplication] = useState<SnapsBrandKitApplication | null>(null);
  const [brandKitLoading, setBrandKitLoading] = useState(false);
  const [creativeBriefMediaType, setCreativeBriefMediaType] =
    useState<SnapsCreativeBriefMediaType>('image');
  const [creativeBriefAspectRatio, setCreativeBriefAspectRatio] =
    useState<SnapsCreativeBriefAspectRatio>('portrait');
  const [creativeBriefVisualStyle, setCreativeBriefVisualStyle] =
    useState('clean Korean SaaS editorial layout');
  const [creativeBriefCta, setCreativeBriefCta] =
    useState('저장하고 다음 콘텐츠 회의에서 확인하세요.');
  const [creativeBriefPreview, setCreativeBriefPreview] =
    useState<SnapsCreativeBriefPreview | null>(null);
  const [creativeBriefLoading, setCreativeBriefLoading] = useState(false);
  const [mediaAssetTitle, setMediaAssetTitle] = useState('AI 콘텐츠 운영 카드뉴스 커버');
  const [mediaAssetUrl, setMediaAssetUrl] = useState('https://example.com/snaps-content-ops-cover.png');
  const [mediaAssetThumbnail, setMediaAssetThumbnail] = useState('');
  const [mediaAssetType, setMediaAssetType] = useState<SnapsMediaAssetType>('image');
  const [mediaAssetAltText, setMediaAssetAltText] =
    useState('AI 콘텐츠 운영 과정을 세 단계로 보여주는 카드뉴스 커버');
  const [mediaAssetCaption, setMediaAssetCaption] = useState(mediaAssetSampleCaption);
  const [mediaAssetCampaign, setMediaAssetCampaign] = useState('AI 콘텐츠 운영 14일 챌린지');
  const [mediaAssetTags, setMediaAssetTags] = useState('media, carousel, pilot');
  const [mediaAssetWidth, setMediaAssetWidth] = useState('1080');
  const [mediaAssetHeight, setMediaAssetHeight] = useState('1350');
  const [mediaAssetDuration, setMediaAssetDuration] = useState('');
  const [mediaAssetPreview, setMediaAssetPreview] = useState<SnapsMediaAssetDraft | null>(null);
  const [mediaAssets, setMediaAssets] = useState<SnapsMediaAssetItem[]>([]);
  const [activeMediaAssetId, setActiveMediaAssetId] = useState('');
  const [mediaAssetAttachResult, setMediaAssetAttachResult] =
    useState<SnapsMediaAssetAttachResult | null>(null);
  const [mediaAssetLoading, setMediaAssetLoading] = useState(false);
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
  const [salesCampaignTitle, setSalesCampaignTitle] = useState('무료 샘플 상담');
  const [salesDestinationUrl, setSalesDestinationUrl] = useState('https://example.com/offer');
  const [salesCta, setSalesCta] = useState('상담 신청');
  const [salesPlatform, setSalesPlatform] = useState<TargetPlatform>('instagram');
  const [salesAmount, setSalesAmount] = useState('49000');
  const [salesCampaigns, setSalesCampaigns] = useState<SnapsSalesCampaign[]>([]);
  const [activeSalesCampaignId, setActiveSalesCampaignId] = useState('');
  const [salesSummary, setSalesSummary] = useState<SnapsSalesSummary | null>(null);
  const [salesLeadName, setSalesLeadName] = useState('B2B 마케팅팀');
  const [salesProposalSegment, setSalesProposalSegment] =
    useState('혼자 SNS를 운영하는 B2B 마케터');
  const [salesPilotDays, setSalesPilotDays] = useState('14');
  const [salesTargetRevenue, setSalesTargetRevenue] = useState('299000');
  const [salesProposal, setSalesProposal] = useState<SnapsSalesProposal | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [competitorName, setCompetitorName] = useState('경쟁사 A');
  const [competitorHandle, setCompetitorHandle] = useState('@rival');
  const [competitorProfileUrl, setCompetitorProfileUrl] = useState('https://instagram.com/rival');
  const [competitorNiche, setCompetitorNiche] = useState('B2B 콘텐츠 자동화');
  const [competitorPlatform, setCompetitorPlatform] = useState<TargetPlatform>('instagram');
  const [competitorFollowers, setCompetitorFollowers] = useState('12000');
  const [competitorFollowersGrowth, setCompetitorFollowersGrowth] = useState('320');
  const [competitorPostsCount, setCompetitorPostsCount] = useState('8');
  const [competitorVideosCount, setCompetitorVideosCount] = useState('4');
  const [competitorEngagement, setCompetitorEngagement] = useState('560');
  const [competitorEngagementRate, setCompetitorEngagementRate] = useState('4.7');
  const [competitorTopPostTitle, setCompetitorTopPostTitle] = useState('3초 안에 문제를 보여준 릴스');
  const [competitorTopPostHook, setCompetitorTopPostHook] = useState('손작업 콘텐츠를 줄이세요');
  const [competitorProfiles, setCompetitorProfiles] = useState<SnapsCompetitorProfile[]>([]);
  const [activeCompetitorId, setActiveCompetitorId] = useState('');
  const [competitorSummary, setCompetitorSummary] = useState<SnapsCompetitorSummary | null>(null);
  const [competitorImportText, setCompetitorImportText] = useState(competitorImportSampleCsv);
  const [competitorImportPreview, setCompetitorImportPreview] =
    useState<SnapsCompetitorImportPreview | null>(null);
  const [competitorLoading, setCompetitorLoading] = useState(false);
  const [listeningTitle, setListeningTitle] = useState('AI 콘텐츠 운영 리스닝');
  const [listeningQuery, setListeningQuery] =
    useState('snaps OR 콘텐츠자동화 OR #콘텐츠자동화');
  const [listeningKeywords, setListeningKeywords] =
    useState('snaps, 콘텐츠자동화, #콘텐츠자동화, 데모, 가격');
  const [listeningExcludeKeywords, setListeningExcludeKeywords] =
    useState('카지노, 무료머니, 광고대행');
  const [listeningImportText, setListeningImportText] = useState(listeningSampleCsv);
  const [listeningCampaign, setListeningCampaign] =
    useState('AI 콘텐츠 운영 14일 챌린지');
  const [listeningTags, setListeningTags] = useState('listening, lead, brand-health');
  const [listeningPreview, setListeningPreview] =
    useState<SnapsSocialListeningPreview | null>(null);
  const [listeningMonitors, setListeningMonitors] =
    useState<SnapsSocialListeningMonitor[]>([]);
  const [activeListeningMonitorId, setActiveListeningMonitorId] = useState('');
  const [listeningRunResult, setListeningRunResult] =
    useState<SnapsSocialListeningRunResult | null>(null);
  const [listeningLoading, setListeningLoading] = useState(false);
  const [trendRadarTitle, setTrendRadarTitle] =
    useState('AI 콘텐츠 운영 트렌드 레이더');
  const [trendRadarIndustry, setTrendRadarIndustry] =
    useState('B2B 콘텐츠 자동화');
  const [trendRadarRegion, setTrendRadarRegion] = useState('KR');
  const [trendRadarWindowDays, setTrendRadarWindowDays] = useState('7');
  const [trendRadarKeywords, setTrendRadarKeywords] =
    useState('콘텐츠자동화, AI 운영, 릴스, 가격문의');
  const [trendRadarImportText, setTrendRadarImportText] = useState(trendRadarSampleCsv);
  const [trendRadarPreview, setTrendRadarPreview] =
    useState<SnapsTrendRadarPreview | null>(null);
  const [trendRadarLoading, setTrendRadarLoading] = useState(false);
  const [postPreviewDevice, setPostPreviewDevice] =
    useState<SnapsPostPreviewDevice>('desktop');
  const [postPreviewLinkUrl, setPostPreviewLinkUrl] =
    useState('https://example.com/report/ai-content-ops');
  const [postPreviewLinkTitle, setPostPreviewLinkTitle] =
    useState('AI 콘텐츠 운영 체크리스트');
  const [postPreviewLinkDescription, setPostPreviewLinkDescription] =
    useState('하나의 원문을 채널별 게시물, 쇼츠, 리포트로 재사용하는 운영 흐름입니다.');
  const [postPreviewLinkImage, setPostPreviewLinkImage] =
    useState('https://example.com/cover.png');
  const [postPreviewAltText, setPostPreviewAltText] = useState('');
  const [postPreviewImageDescription, setPostPreviewImageDescription] =
    useState('콘텐츠 운영 대시보드에서 여러 SNS 채널의 게시 전 상태를 비교하는 화면');
  const [postPreviewResult, setPostPreviewResult] =
    useState<SnapsPostPreviewSummary | null>(null);
  const [postPreviewLoading, setPostPreviewLoading] = useState(false);
  const [adRelationship, setAdRelationship] = useState<SnapsAdRelationship>('none');
  const [adAdvertiser, setAdAdvertiser] = useState('');
  const [adMediaType, setAdMediaType] = useState<SnapsAdMediaType>('text');
  const [adSenderName, setAdSenderName] = useState('');
  const [adNightConsent, setAdNightConsent] = useState(false);
  const [adDisclosureResult, setAdDisclosureResult] =
    useState<SnapsAdDisclosureSummary | null>(null);
  const [adDisclosureLoading, setAdDisclosureLoading] = useState(false);
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
  const [feedbackItems, setFeedbackItems] = useState<SnapsFeedbackItemView[]>([]);
  const [feedbackItemStatus, setFeedbackItemStatus] =
    useState<SnapsFeedbackStatusFilter>('unread');
  const [feedbackItemSearch, setFeedbackItemSearch] = useState('');
  const [replyCapabilities, setReplyCapabilities] = useState<ReplyCapability[] | null>(null);
  const [replyTemplates, setReplyTemplates] = useState<SnapsReplyTemplate[]>([]);
  const [replyTemplateTitle, setReplyTemplateTitle] = useState('자료 링크 안내');
  const [replyTemplateSentiment, setReplyTemplateSentiment] = useState('question');
  const [replyTemplatePlatform, setReplyTemplatePlatform] =
    useState<TargetPlatform | ''>('instagram');
  const [replyTemplateBody, setReplyTemplateBody] = useState(
    '문의 주셔서 감사합니다. 요청하신 자료는 아래 링크에서 바로 확인하실 수 있습니다.'
  );
  const [replyTemplateCta, setReplyTemplateCta] = useState('필요하시면 DM으로 상황에 맞는 예시도 보내드릴게요.');
  const [replyTemplateTags, setReplyTemplateTags] = useState('FAQ, 링크 요청');
  const [inboxNotes, setInboxNotes] = useState<SnapsInboxNote[]>([]);
  const [inboxNotePlatform, setInboxNotePlatform] =
    useState<TargetPlatform | ''>('instagram');
  const [inboxNoteAuthor, setInboxNoteAuthor] = useState('lead-a');
  const [inboxNotePostId, setInboxNotePostId] = useState('');
  const [inboxNoteText, setInboxNoteText] = useState(
    '가격표와 자료 링크를 요청한 리드입니다. 다음 응대에서는 파일럿 샘플 캘린더를 함께 안내합니다.'
  );
  const [inboxNoteTags, setInboxNoteTags] = useState('리드, 가격문의');
  const [feedbackResult, setFeedbackResult] = useState<SnapsFeedbackView | null>(null);
  const [feedbackSummary, setFeedbackSummary] = useState<SnapsFeedbackView | null>(null);
  const [inboxAssignmentSlaMinutes, setInboxAssignmentSlaMinutes] =
    useState('240');
  const [inboxAssignmentPreview, setInboxAssignmentPreview] =
    useState<SnapsInboxAssignmentPreview | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [result, setResult] = useState<SnapsTransformResult | null>(null);
  const [activePlatform, setActivePlatform] = useState<TargetPlatform>('threads');
  const [agentCommand, setAgentCommand] = useState(
    '내일 10시에 인공지능 관련 게시글 작성해서 인스타, 스레드, 링크드인에 올려줘. 관련 내용으로 쇼츠도 웃기게 만들어서 알아서 올려줘.'
  );
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentResult, setAgentResult] =
    useState<SnapsAgentPrepareResult | null>(null);
  const [agentTasks, setAgentTasks] = useState<SnapsAgentTaskListItem[]>([]);
  const [agentTaskSearch, setAgentTaskSearch] = useState('');
  const [agentFavoriteOnly, setAgentFavoriteOnly] = useState(false);
  const [agentTasksLoading, setAgentTasksLoading] = useState(false);

  const connectedByPlatform = useMemo(() => {
    return (integrations as ConnectedIntegration[]).reduce((all, integration) => {
      const key = integration.identifier || integration.providerIdentifier;
      if (key && !all[key] && !integration.disabled) {
        all[key] = integration;
      }
      return all;
    }, {} as Record<string, ConnectedIntegration>);
  }, [integrations]);

  const agentReadinessSummary = useMemo(() => {
    if (!agentResult) {
      return null;
    }

    const variants = agentResult.transform.variants || [];
    const schedulable = variants.filter(
      (variant) => variant.publishMode === 'schedule'
    );
    const connected = schedulable.filter(
      (variant) => connectedByPlatform[variant.platform]?.id
    );
    const disconnected = schedulable.filter(
      (variant) => !connectedByPlatform[variant.platform]?.id
    );
    const manualPlatforms = [
      ...new Set(
        [
          ...variants
            .filter((variant) => variant.publishMode === 'assist')
            .map((variant) => variant.platform),
          ...agentResult.operation.platformReadiness
            .filter((item) => item.status === 'manual')
            .map((item) => item.platform),
        ].map((platform) => targetPlatformLabel(platform))
      ),
    ];
    const attentionItems = agentResult.operation.platformReadiness.filter(
      (item) => item.status !== 'ready'
    );
    const qualityGates = agentResult.operation.qualityGates || [];
    const missingInputs = [
      ...(agentResult.plan.missingInputs || []),
      ...disconnected.map(
        (variant) => `${targetPlatformLabel(variant.platform)} 연동 계정`
      ),
    ];
    const blockerCount = qualityGates.filter(
      (gate) => gate.severity === 'blocker'
    ).length;
    const warningCount = qualityGates.filter(
      (gate) => gate.severity === 'warning'
    ).length;

    return {
      connectedCount: connected.length,
      schedulableCount: schedulable.length,
      disconnectedPlatforms: disconnected.map((variant) =>
        targetPlatformLabel(variant.platform)
      ),
      manualPlatforms,
      attentionCount: attentionItems.length,
      blockerCount,
      warningCount,
      missingInputs: [...new Set(missingInputs)],
      confirmationItems: agentResult.plan.confirmationChecklist || [],
    };
  }, [agentResult, connectedByPlatform]);

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

  const primaryScheduleIntegrationId = useMemo(() => {
    const platform = result?.variants.find(
      (variant) => variant.publishMode === 'schedule'
    )?.platform || selectedPlatforms.find(
      (selectedPlatform) => connectedByPlatform[selectedPlatform]?.id
    );
    return platform ? connectedByPlatform[platform]?.id || '' : '';
  }, [connectedByPlatform, result?.variants, selectedPlatforms]);

  const activeSalesCampaign = useMemo(() => {
    return (
      salesCampaigns.find((campaign) => campaign.id === activeSalesCampaignId) ||
      salesCampaigns[0]
    );
  }, [activeSalesCampaignId, salesCampaigns]);

  const activeSalesHubUrl = useMemo(
    () => salesHubLinkFromCampaign(activeSalesCampaign),
    [activeSalesCampaign]
  );

  const activeCompetitor = useMemo(() => {
    return (
      competitorProfiles.find((profile) => profile.id === activeCompetitorId) ||
      competitorProfiles[0]
    );
  }, [activeCompetitorId, competitorProfiles]);

  const activeApproval = useMemo(() => {
    return (
      approvalRequests.find((approval) => approval.id === activeApprovalId) ||
      approvalRequests[0]
    );
  }, [activeApprovalId, approvalRequests]);

  const activeApprovalPublicUrl =
    approvalPublicLink?.approval.id === activeApproval?.id
      ? approvalPublicLink.publicReviewUrl
      : activeApproval?.publicReviewUrl || '';

  const approvalCommentStats = useMemo(() => {
    const comments = activeApproval?.comments || [];
    return {
      total: comments.length,
      unresolved: comments.filter((comment) => !comment.resolved).length,
    };
  }, [activeApproval]);

  const activeIdea = useMemo(() => {
    return ideas.find((idea) => idea.id === activeIdeaId) || ideas[0];
  }, [activeIdeaId, ideas]);

  const activeBrandKit = useMemo(() => {
    return brandKits.find((kit) => kit.id === activeBrandKitId) || brandKits[0];
  }, [activeBrandKitId, brandKits]);

  const activeMediaAsset = useMemo(() => {
    return mediaAssets.find((asset) => asset.id === activeMediaAssetId) || mediaAssets[0];
  }, [activeMediaAssetId, mediaAssets]);

  const activeHashtagSet = useMemo(() => {
    return (
      hashtagSets.find((set) => set.id === activeHashtagSetId) || hashtagSets[0]
    );
  }, [activeHashtagSetId, hashtagSets]);

  const activeListeningMonitor = useMemo(() => {
    return (
      listeningMonitors.find((monitor) => monitor.id === activeListeningMonitorId) ||
      listeningMonitors[0]
    );
  }, [activeListeningMonitorId, listeningMonitors]);

  useEffect(() => {
    if (activeVariant?.platform) {
      setCoachPlatform(activeVariant.platform);
    }
  }, [activeVariant?.platform]);

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

    if (variant.platform === 'xiaohongshu') {
      return [
        '제목과 첫 문장이 저장 욕구를 만드는지 확인',
        '이미지 또는 커버 문구와 본문 톤이 맞는지 확인',
        '복사 후 샤오홍슈 편집기에서 수동 발행',
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

  const loadSalesData = async () => {
    try {
      const [campaignsResponse, summaryResponse] = await Promise.all([
        snapsFetch('/snaps/sales/campaigns'),
        snapsFetch('/snaps/sales/summary'),
      ]);
      if (campaignsResponse.ok) {
        const campaigns = (await campaignsResponse.json()) as SnapsSalesCampaign[];
        setSalesCampaigns(campaigns);
        setActiveSalesCampaignId((current) => current || campaigns[0]?.id || '');
      }
      if (summaryResponse.ok) {
        setSalesSummary(await summaryResponse.json());
      }
    } catch {
      setSalesCampaigns([]);
      setSalesSummary(null);
    }
  };

  const loadCompetitorData = async () => {
    try {
      const [profilesResponse, summaryResponse] = await Promise.all([
        snapsFetch('/snaps/competitors'),
        snapsFetch('/snaps/competitors/summary'),
      ]);
      if (profilesResponse.ok) {
        const profiles = (await profilesResponse.json()) as SnapsCompetitorProfile[];
        setCompetitorProfiles(profiles);
        setActiveCompetitorId((current) => current || profiles[0]?.id || '');
      }
      if (summaryResponse.ok) {
        setCompetitorSummary(await summaryResponse.json());
      }
    } catch {
      setCompetitorProfiles([]);
      setCompetitorSummary(null);
    }
  };

  const loadApprovalRequests = async () => {
    try {
      const response = await snapsFetch('/snaps/approvals');
      if (!response.ok) {
        return;
      }
      const approvals = (await response.json()) as SnapsApprovalItem[];
      setApprovalRequests(approvals);
      setActiveApprovalId((current) => current || approvals[0]?.id || '');
    } catch {
      setApprovalRequests([]);
    }
  };

  const loadIdeas = async (
    status: SnapsIdeaStatusFilter = ideaStatus,
    search = ideaSearch
  ) => {
    try {
      const params = new URLSearchParams();
      if (status !== 'all') {
        params.set('status', status);
      }
      if (search.trim()) {
        params.set('search', search.trim());
      }
      const queryString = params.toString();
      const response = await snapsFetch(
        queryString ? `/snaps/ideas?${queryString}` : '/snaps/ideas'
      );
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as SnapsIdeaItem[];
      setIdeas(payload);
      setActiveIdeaId((current) => current || payload[0]?.id || '');
    } catch {
      setIdeas([]);
    }
  };

  const loadBrandKits = async () => {
    try {
      const response = await snapsFetch('/snaps/brand-kits');
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as SnapsBrandKitItem[];
      setBrandKits(payload);
      setActiveBrandKitId((current) => current || payload[0]?.id || '');
    } catch {
      setBrandKits([]);
    }
  };

  const loadMediaAssets = async () => {
    try {
      const response = await snapsFetch('/snaps/media-library');
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as SnapsMediaAssetItem[];
      setMediaAssets(payload);
      setActiveMediaAssetId((current) => current || payload[0]?.id || '');
    } catch {
      setMediaAssets([]);
    }
  };

  const loadHashtagSets = async () => {
    try {
      const response = await snapsFetch('/snaps/hashtag-sets');
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as SnapsHashtagSetItem[];
      setHashtagSets(payload);
      setActiveHashtagSetId((current) => current || payload[0]?.id || '');
    } catch {
      setHashtagSets([]);
    }
  };

  const loadListeningMonitors = async () => {
    try {
      const response = await snapsFetch('/snaps/listening/monitors');
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as SnapsSocialListeningMonitor[];
      setListeningMonitors(payload);
      setActiveListeningMonitorId((current) => current || payload[0]?.id || '');
    } catch {
      setListeningMonitors([]);
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
        loadSalesData(),
        loadCompetitorData(),
        loadApprovalRequests(),
        loadIdeas(),
        loadBrandKits(),
        loadMediaAssets(),
        loadHashtagSets(),
        loadListeningMonitors(),
        loadAgentTasks(),
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

  const previewBulkCampaignCsv = async () => {
    if (!bulkCsvText.trim()) {
      toast.show('CSV 내용을 붙여넣으세요.', 'warning');
      return;
    }

    setBulkLoading(true);
    try {
      const response = await snapsFetch('/snaps/bulk/preview', {
        method: 'POST',
        body: JSON.stringify({
          csvText: bulkCsvText,
          defaultTone: tone,
          defaultTopic: sourceTopic,
          defaultPlatforms: selectedPlatforms,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const preview = (await response.json()) as SnapsBulkCampaignPreview;
      setBulkPreview(preview);
      toast.show(`CSV 미리보기 완료: 사용 가능 ${preview.acceptedRows}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : 'CSV 미리보기에 실패했습니다.',
        'warning'
      );
    } finally {
      setBulkLoading(false);
    }
  };

  const importBulkCampaignSources = async () => {
    if (!bulkCsvText.trim()) {
      toast.show('CSV 내용을 붙여넣으세요.', 'warning');
      return;
    }
    if (
      !confirmOperatorAction(
        'CSV 행을 원문 라이브러리에 대량으로 병합할까요?'
      )
    ) {
      return;
    }

    setBulkLoading(true);
    try {
      const response = await snapsFetch('/snaps/bulk/import-sources', {
        method: 'POST',
        body: JSON.stringify({
          csvText: bulkCsvText,
          defaultTone: tone,
          defaultTopic: sourceTopic,
          defaultPlatforms: selectedPlatforms,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const imported = (await response.json()) as SnapsBulkCampaignPreview & {
        imported?: { imported?: number; total?: number };
      };
      setBulkPreview(imported);
      await Promise.all([loadSourceLibrary(), loadActivity()]);
      toast.show(`CSV 원문 가져오기 완료: ${imported.imported?.imported || 0}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : 'CSV 원문 가져오기에 실패했습니다.',
        'warning'
      );
    } finally {
      setBulkLoading(false);
    }
  };

  const createBulkCampaignQueue = async () => {
    if (!bulkCsvText.trim()) {
      toast.show('CSV 내용을 붙여넣으세요.', 'warning');
      return;
    }

    const rows = bulkPreview?.rows || [];
    const platforms = [
      ...new Set(
        (rows.length ? rows : [{ platforms: selectedPlatforms }])
          .flatMap((row) => row.platforms)
          .filter(Boolean)
      ),
    ];
    const integrationsToUse = platforms
      .map((platform) => ({
        platform,
        integrationId: connectedByPlatform[platform]?.id,
      }))
      .filter((item) => item.integrationId);

    if (!integrationsToUse.length) {
      toast.show('CSV 큐를 만들 연결 발행 채널이 없습니다.', 'warning');
      return;
    }

    let publishDateIso: string | undefined;
    if (scheduleType === 'schedule' && publishDate) {
      const parsedPublishDate = new Date(publishDate);
      if (Number.isNaN(parsedPublishDate.getTime())) {
        toast.show('예약 시간을 확인하세요.', 'warning');
        return;
      }
      publishDateIso = parsedPublishDate.toISOString();
    }

    if (
      scheduleType === 'schedule' &&
      !confirmOperatorAction(
        `CSV 행을 연결된 채널 ${integrationsToUse.length}개에 예약 큐로 만들까요?`
      )
    ) {
      return;
    }

    setBulkLoading(true);
    try {
      const response = await snapsFetch('/snaps/bulk/schedule', {
        method: 'POST',
        body: JSON.stringify({
          csvText: bulkCsvText,
          defaultTone: tone,
          defaultTopic: sourceTopic,
          defaultPlatforms: selectedPlatforms,
          scheduleType,
          operatorConfirmed: scheduleType === 'schedule',
          ...(publishDateIso ? { publishDate: publishDateIso } : {}),
          integrations: integrationsToUse,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const queued = await response.json();
      await loadActivity();
      if (showSnapsScheduleResult('CSV 큐', queued)) {
        router.push('/launches?display=list');
      }
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : 'CSV 큐 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setBulkLoading(false);
    }
  };

  const buildFeedIntakePayload = () => ({
    ...(feedUrl.trim() ? { feedUrl: feedUrl.trim() } : {}),
    ...(feedXmlText.trim() ? { feedXml: feedXmlText } : {}),
    defaultTone: tone,
    defaultTopic: sourceTopic,
    defaultPlatforms: selectedPlatforms,
    maxItems: 20,
  });

  const previewFeedIntake = async () => {
    if (!feedUrl.trim() && !feedXmlText.trim()) {
      toast.show('RSS URL 또는 XML을 입력하세요.', 'warning');
      return;
    }

    setFeedLoading(true);
    try {
      const response = await snapsFetch('/snaps/feeds/preview', {
        method: 'POST',
        body: JSON.stringify(buildFeedIntakePayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const preview = (await response.json()) as SnapsFeedPreview;
      setFeedPreview(preview);
      toast.show(`RSS 미리보기 완료: 사용 가능 ${preview.acceptedItems}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : 'RSS 미리보기에 실패했습니다.',
        'warning'
      );
    } finally {
      setFeedLoading(false);
    }
  };

  const importFeedSources = async () => {
    if (!feedUrl.trim() && !feedXmlText.trim()) {
      toast.show('RSS URL 또는 XML을 입력하세요.', 'warning');
      return;
    }
    if (
      !confirmOperatorAction(
        'RSS 피드 항목을 원문 라이브러리에 병합할까요?'
      )
    ) {
      return;
    }

    setFeedLoading(true);
    try {
      const response = await snapsFetch('/snaps/feeds/import-sources', {
        method: 'POST',
        body: JSON.stringify(buildFeedIntakePayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const imported = (await response.json()) as SnapsFeedPreview & {
        imported?: { imported?: number; total?: number };
      };
      setFeedPreview(imported);
      await Promise.all([loadSourceLibrary(), loadActivity()]);
      toast.show(`RSS 원문 가져오기 완료: ${imported.imported?.imported || 0}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : 'RSS 원문 가져오기에 실패했습니다.',
        'warning'
      );
    } finally {
      setFeedLoading(false);
    }
  };

  const createFeedQueue = async () => {
    if (!feedUrl.trim() && !feedXmlText.trim()) {
      toast.show('RSS URL 또는 XML을 입력하세요.', 'warning');
      return;
    }

    const items = feedPreview?.items || [];
    const platforms = [
      ...new Set(
        (items.length ? items : [{ platforms: selectedPlatforms }])
          .flatMap((item) => item.platforms)
          .filter(Boolean)
      ),
    ];
    const integrationsToUse = platforms
      .map((platform) => ({
        platform,
        integrationId: connectedByPlatform[platform]?.id,
      }))
      .filter((item) => item.integrationId);

    if (!integrationsToUse.length) {
      toast.show('RSS 큐를 만들 연결 발행 채널이 없습니다.', 'warning');
      return;
    }

    let publishDateIso: string | undefined;
    if (scheduleType === 'schedule' && publishDate) {
      const parsedPublishDate = new Date(publishDate);
      if (Number.isNaN(parsedPublishDate.getTime())) {
        toast.show('예약 시간을 확인하세요.', 'warning');
        return;
      }
      publishDateIso = parsedPublishDate.toISOString();
    }

    if (
      scheduleType === 'schedule' &&
      !confirmOperatorAction(
        `RSS 항목을 연결된 채널 ${integrationsToUse.length}개에 예약 큐로 만들까요?`
      )
    ) {
      return;
    }

    setFeedLoading(true);
    try {
      const response = await snapsFetch('/snaps/feeds/schedule', {
        method: 'POST',
        body: JSON.stringify({
          ...buildFeedIntakePayload(),
          scheduleType,
          operatorConfirmed: scheduleType === 'schedule',
          ...(publishDateIso ? { publishDate: publishDateIso } : {}),
          integrations: integrationsToUse,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const queued = (await response.json()) as {
        preview?: SnapsFeedPreview;
        items?: unknown[];
      };
      if (queued.preview) {
        setFeedPreview(queued.preview);
      }
      await loadActivity();
      if (showSnapsScheduleResult('RSS 큐', queued)) {
        router.push('/launches?display=list');
      }
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : 'RSS 큐 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setFeedLoading(false);
    }
  };

  const buildCarouselVisualPayload = () => ({
    sourceText: carouselSourceText.trim() || sourceText,
    title: sourceTitle,
    topic: sourceTopic,
    tone,
    template: carouselTemplate,
    aspectRatio: carouselAspectRatio,
    brandColor: carouselBrandColor,
    accentColor: carouselAccentColor,
    cta: carouselCta,
    targetPlatforms: selectedPlatforms,
    slideCount: 6,
  });

  const previewCarouselVisual = async () => {
    if (!carouselSourceText.trim() && !sourceText.trim()) {
      toast.show('캐러셀로 만들 원문을 입력하세요.', 'warning');
      return;
    }

    setCarouselLoading(true);
    try {
      const response = await snapsFetch('/snaps/visuals/carousel/preview', {
        method: 'POST',
        body: JSON.stringify(buildCarouselVisualPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const preview = (await response.json()) as SnapsCarouselVisualPreview;
      setCarouselPreview(preview);
      toast.show(`캐러셀 미리보기 완료: ${preview.slideCount}장`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '캐러셀 미리보기에 실패했습니다.',
        'warning'
      );
    } finally {
      setCarouselLoading(false);
    }
  };

  const copyCarouselExport = async () => {
    if (!carouselSourceText.trim() && !sourceText.trim()) {
      toast.show('캐러셀로 만들 원문을 입력하세요.', 'warning');
      return;
    }

    setCarouselLoading(true);
    try {
      const response = await snapsFetch('/snaps/visuals/carousel/export', {
        method: 'POST',
        body: JSON.stringify(buildCarouselVisualPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const exported = (await response.json()) as {
        preview?: SnapsCarouselVisualPreview;
        exportHtml?: string;
      };
      if (exported.preview) {
        setCarouselPreview(exported.preview);
      }
      await navigator.clipboard.writeText(exported.exportHtml || '');
      toast.show('캐러셀 HTML을 복사했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '캐러셀 HTML 내보내기에 실패했습니다.',
        'warning'
      );
    } finally {
      setCarouselLoading(false);
    }
  };

  const createCarouselQueue = async () => {
    if (!carouselSourceText.trim() && !sourceText.trim()) {
      toast.show('캐러셀로 만들 원문을 입력하세요.', 'warning');
      return;
    }

    const integrationsToUse = selectedPlatforms
      .map((platform) => ({
        platform,
        integrationId: connectedByPlatform[platform]?.id,
      }))
      .filter((item) => item.integrationId);

    if (!integrationsToUse.length) {
      toast.show('캐러셀 큐를 만들 연결 발행 채널이 없습니다.', 'warning');
      return;
    }

    let publishDateIso: string | undefined;
    if (scheduleType === 'schedule' && publishDate) {
      const parsedPublishDate = new Date(publishDate);
      if (Number.isNaN(parsedPublishDate.getTime())) {
        toast.show('예약 시간을 확인하세요.', 'warning');
        return;
      }
      publishDateIso = parsedPublishDate.toISOString();
    }

    if (
      scheduleType === 'schedule' &&
      !confirmOperatorAction(
        `캐러셀을 연결된 채널 ${integrationsToUse.length}개에 예약 큐로 만들까요?`
      )
    ) {
      return;
    }

    setCarouselLoading(true);
    try {
      const response = await snapsFetch('/snaps/visuals/carousel/schedule', {
        method: 'POST',
        body: JSON.stringify({
          ...buildCarouselVisualPayload(),
          scheduleType,
          operatorConfirmed: scheduleType === 'schedule',
          ...(publishDateIso ? { publishDate: publishDateIso } : {}),
          integrations: integrationsToUse,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const queued = (await response.json()) as {
        preview?: SnapsCarouselVisualPreview;
        scheduled?: unknown[];
      };
      if (queued.preview) {
        setCarouselPreview(queued.preview);
      }
      await loadActivity();
      if (showSnapsScheduleResult('캐러셀 큐', queued)) {
        router.push('/launches?display=list');
      }
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '캐러셀 큐 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setCarouselLoading(false);
    }
  };

  const buildVisualPlannerItems = () => {
    const manualItems = visualPlannerText
      .split(/\r?\n/)
      .map((line, index) => {
        const [title, imageUrl, status, publishDate, caption, mediaType] = line
          .split('|')
          .map((part) => part.trim());
        if (!title && !imageUrl && !caption) {
          return undefined;
        }
        return {
          id: `manual-feed-${index + 1}`,
          order: index,
          title: title || `Feed item ${index + 1}`,
          imageUrl,
          thumbnail: imageUrl,
          status: status || 'draft',
          publishDate,
          caption: caption || title,
          mediaType: mediaType || 'image',
          source: 'manual-grid',
        };
      })
      .filter(Boolean);
    const mediaItems = mediaAssets.slice(0, 12).map((asset, index) => ({
      id: `media-${asset.id}`,
      order: manualItems.length + index,
      title: asset.title,
      imageUrl: asset.thumbnail || asset.url,
      thumbnail: asset.thumbnail || asset.url,
      status: 'draft',
      caption: asset.caption || asset.altText || asset.title,
      mediaType: asset.mediaType,
      source: 'media-library',
      alt: asset.altText,
    }));
    return [...manualItems, ...mediaItems];
  };

  const buildVisualPlannerPayload = () => ({
    platform: 'instagram',
    viewMode: visualPlannerViewMode,
    includeDrafts: visualPlannerIncludeDrafts,
    includePublished: true,
    items: buildVisualPlannerItems(),
    variants: result?.variants || [],
    targetPlatforms: selectedPlatforms,
  });

  const previewVisualFeedPlanner = async () => {
    const payload = buildVisualPlannerPayload();
    if (!payload.items.length && !payload.variants.length) {
      toast.show('피드 플래너에 넣을 미디어나 변환 결과가 필요합니다.', 'warning');
      return;
    }

    setVisualPlannerLoading(true);
    try {
      const response = await snapsFetch('/snaps/visual-planner/preview', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const preview = (await response.json()) as SnapsVisualFeedPlannerPreview;
      setVisualPlannerPreview(preview);
      toast.show(`피드 미리보기 완료: ${preview.totalItems}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '피드 미리보기에 실패했습니다.',
        'warning'
      );
    } finally {
      setVisualPlannerLoading(false);
    }
  };

  const createVisualFeedPlannerQueue = async () => {
    const payload = buildVisualPlannerPayload();
    const integrationsToUse = selectedPlatforms
      .map((platform) => ({
        platform,
        integrationId: connectedByPlatform[platform]?.id,
      }))
      .filter((item) => item.integrationId);

    if (!payload.items.length && !payload.variants.length) {
      toast.show('큐로 만들 피드 플래너 항목이 없습니다.', 'warning');
      return;
    }
    if (!integrationsToUse.length) {
      toast.show('피드 플래너 큐를 만들 연결 발행 채널이 없습니다.', 'warning');
      return;
    }

    let publishDateIso: string | undefined;
    if (scheduleType === 'schedule' && publishDate) {
      const parsedPublishDate = new Date(publishDate);
      if (Number.isNaN(parsedPublishDate.getTime())) {
        toast.show('예약 시간을 확인하세요.', 'warning');
        return;
      }
      publishDateIso = parsedPublishDate.toISOString();
    }

    if (
      scheduleType === 'schedule' &&
      !confirmOperatorAction(
        `피드 플래너 항목을 연결된 채널 ${integrationsToUse.length}개에 예약 큐로 만들까요?`
      )
    ) {
      return;
    }

    setVisualPlannerLoading(true);
    try {
      const response = await snapsFetch('/snaps/visual-planner/schedule', {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          scheduleType,
          operatorConfirmed: scheduleType === 'schedule',
          ...(publishDateIso ? { publishDate: publishDateIso } : {}),
          integrations: integrationsToUse,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const queued = (await response.json()) as {
        preview?: SnapsVisualFeedPlannerPreview;
        scheduled?: unknown[];
      };
      if (queued.preview) {
        setVisualPlannerPreview(queued.preview);
      }
      await loadActivity();
      if (showSnapsScheduleResult('피드 플래너 큐', queued)) {
        router.push('/launches?display=list');
      }
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '피드 플래너 큐 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setVisualPlannerLoading(false);
    }
  };

  const buildHashtagSetPayload = () => ({
    title: hashtagSetTitle,
    topic: sourceTopic || sourceTitle || 'snaps campaign',
    description: sourceText.slice(0, 500),
    hashtagText: hashtagSetText,
    reusableText: hashtagSetReusableText,
    placement: hashtagSetPlacement,
    strategy: hashtagSetStrategy,
    tags: ['hashtags', 'campaign'],
    targetPlatforms: selectedPlatforms,
    variants: result?.variants || [],
    sourceText,
  });

  const previewHashtagSet = async () => {
    if (!hashtagSetText.trim() && !sourceText.trim() && !sourceTopic.trim()) {
      toast.show('해시태그나 주제를 입력하세요.', 'warning');
      return;
    }
    setHashtagSetLoading(true);
    try {
      const response = await snapsFetch('/snaps/hashtag-sets/preview', {
        method: 'POST',
        body: JSON.stringify(buildHashtagSetPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const preview = (await response.json()) as SnapsHashtagSetDraft;
      setHashtagSetPreview(preview);
      setHashtagSetTitle(preview.title);
      setHashtagSetText(preview.hashtags.join(' '));
      setHashtagSetReusableText(preview.reusableText);
      setHashtagSetPlacement(preview.placement);
      setHashtagSetStrategy(preview.strategy);
      toast.show(`해시태그 세트 미리보기 완료: ${preview.hashtags.length}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '해시태그 세트 미리보기에 실패했습니다.',
        'warning'
      );
    } finally {
      setHashtagSetLoading(false);
    }
  };

  const buildHashtagTrackerPayload = () => ({
    title: `${sourceTopic || sourceTitle || 'snaps campaign'} hashtag tracker`,
    topic: sourceTopic || sourceTitle || 'snaps campaign',
    sourceText,
    hashtagText: hashtagSetText,
    goal: hashtagTrackerGoal,
    importText: hashtagTrackerMetrics,
    targetPlatforms: selectedPlatforms,
    variants: result?.variants || [],
    maxHashtags: 12,
  });

  const previewHashtagTracker = async () => {
    if (!hashtagSetText.trim() && !hashtagTrackerMetrics.trim() && !sourceText.trim()) {
      toast.show('추적할 해시태그나 지표를 입력하세요.', 'warning');
      return;
    }
    setHashtagSetLoading(true);
    try {
      const response = await snapsFetch('/snaps/hashtags/tracker/preview', {
        method: 'POST',
        body: JSON.stringify(buildHashtagTrackerPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const preview = (await response.json()) as SnapsHashtagTrackerPreview;
      setHashtagTrackerPreview(preview);
      setHashtagSetText(preview.items.slice(0, 8).map((item) => item.hashtag).join(' '));
      toast.show(`해시태그 트래커 분석 완료: ${preview.totalHashtags}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '해시태그 트래커 분석에 실패했습니다.',
        'warning'
      );
    } finally {
      setHashtagSetLoading(false);
    }
  };

  const saveTrackedHashtagSet = async () => {
    if (!hashtagTrackerPreview && !hashtagTrackerMetrics.trim() && !hashtagSetText.trim()) {
      toast.show('저장할 해시태그 분석 결과가 없습니다.', 'warning');
      return;
    }
    setHashtagSetLoading(true);
    try {
      const response = await snapsFetch('/snaps/hashtags/tracker/save-set', {
        method: 'POST',
        body: JSON.stringify({
          ...buildHashtagTrackerPayload(),
          setTitle: hashtagSetTitle,
          placement: hashtagSetPlacement,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const saved = (await response.json()) as {
        preview: SnapsHashtagTrackerPreview;
        set: SnapsHashtagSetItem;
      };
      setHashtagTrackerPreview(saved.preview);
      setActiveHashtagSetId(saved.set.id);
      setHashtagSetPreview(saved.set);
      setHashtagSetText(saved.set.hashtags.join(' '));
      await Promise.all([loadHashtagSets(), loadActivity()]);
      toast.show(`트래커 추천 세트를 저장했습니다: ${saved.set.hashtags.length}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '트래커 추천 세트 저장에 실패했습니다.',
        'warning'
      );
    } finally {
      setHashtagSetLoading(false);
    }
  };

  const saveHashtagSet = async () => {
    if (!hashtagSetTitle.trim() && !hashtagSetText.trim()) {
      toast.show('저장할 해시태그 세트 이름이나 태그를 입력하세요.', 'warning');
      return;
    }
    setHashtagSetLoading(true);
    try {
      const response = await snapsFetch('/snaps/hashtag-sets', {
        method: 'POST',
        body: JSON.stringify(hashtagSetPreview || buildHashtagSetPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const saved = (await response.json()) as SnapsHashtagSetItem;
      setActiveHashtagSetId(saved.id);
      await Promise.all([loadHashtagSets(), loadActivity()]);
      toast.show('해시태그 세트를 저장했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '해시태그 세트 저장에 실패했습니다.',
        'warning'
      );
    } finally {
      setHashtagSetLoading(false);
    }
  };

  const applyHashtagSet = async (
    setId = activeHashtagSet?.id || activeHashtagSetId
  ) => {
    if (!setId) {
      toast.show('적용할 해시태그 세트를 선택하세요.', 'warning');
      return;
    }
    setHashtagSetLoading(true);
    try {
      const response = await snapsFetch(`/snaps/hashtag-sets/${setId}/apply`, {
        method: 'POST',
        body: JSON.stringify({
          sourceText,
          topic: sourceTopic || sourceTitle,
          targetPlatforms: selectedPlatforms,
          placement: hashtagSetPlacement,
          variants: result?.variants || [],
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const applied = (await response.json()) as SnapsHashtagSetApplication;
      setHashtagSetApplication(applied);
      setResult(applied.transform);
      setActivePlatform(applied.transform.variants[0]?.platform || selectedPlatforms[0]);
      setSourceText(applied.transform.variants[0]?.content || sourceText);
      const firstComment = String(
        applied.transform.variants[0]?.settings?.firstComment || ''
      );
      if (firstComment) {
        setFirstCommentText(firstComment);
      }
      await Promise.all([loadHashtagSets(), loadActivity()]);
      toast.show('해시태그 세트를 현재 결과에 적용했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '해시태그 세트 적용에 실패했습니다.',
        'warning'
      );
    } finally {
      setHashtagSetLoading(false);
    }
  };

  const createHashtagSetQueue = async (
    setId = activeHashtagSet?.id || activeHashtagSetId
  ) => {
    if (!setId) {
      toast.show('큐로 만들 해시태그 세트를 선택하세요.', 'warning');
      return;
    }
    const variants = result?.variants || [];
    const platforms = variants.length
      ? [...new Set(variants.map((variant) => variant.platform))]
      : selectedPlatforms;
    const integrationsToUse = platforms
      .map((platform) => ({
        platform,
        integrationId: connectedByPlatform[platform]?.id,
      }))
      .filter((item) => item.integrationId);
    if (!integrationsToUse.length) {
      toast.show('해시태그 세트 큐를 만들 연결 발행 채널이 없습니다.', 'warning');
      return;
    }

    let publishDateIso: string | undefined;
    if (scheduleType === 'schedule' && publishDate) {
      const parsedPublishDate = new Date(publishDate);
      if (Number.isNaN(parsedPublishDate.getTime())) {
        toast.show('예약 시간을 확인하세요.', 'warning');
        return;
      }
      publishDateIso = parsedPublishDate.toISOString();
    }

    if (
      scheduleType === 'schedule' &&
      !confirmOperatorAction(
        `해시태그 세트를 적용한 게시물을 연결된 채널 ${integrationsToUse.length}개에 예약 큐로 만들까요?`
      )
    ) {
      return;
    }

    setHashtagSetLoading(true);
    try {
      const response = await snapsFetch(`/snaps/hashtag-sets/${setId}/schedule`, {
        method: 'POST',
        body: JSON.stringify({
          sourceText,
          topic: sourceTopic || sourceTitle,
          targetPlatforms: selectedPlatforms,
          placement: hashtagSetPlacement,
          variants,
          scheduleType,
          operatorConfirmed: scheduleType === 'schedule',
          ...(publishDateIso ? { publishDate: publishDateIso } : {}),
          integrations: integrationsToUse,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const queued = (await response.json()) as {
        preview?: SnapsHashtagSetApplication;
        scheduled?: unknown[];
      };
      if (queued.preview) {
        setHashtagSetApplication(queued.preview);
        setResult(queued.preview.transform);
      }
      await Promise.all([loadHashtagSets(), loadActivity()]);
      if (showSnapsScheduleResult('해시태그 세트 큐', queued)) {
        router.push('/launches?display=list');
      }
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '해시태그 세트 큐 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setHashtagSetLoading(false);
    }
  };

  const deleteHashtagSet = async (
    setId = activeHashtagSet?.id || activeHashtagSetId
  ) => {
    if (!setId) {
      toast.show('삭제할 해시태그 세트를 선택하세요.', 'warning');
      return;
    }
    if (!confirmDestructive('선택한 해시태그 세트를 삭제할까요?')) {
      return;
    }
    setHashtagSetLoading(true);
    try {
      const response = await snapsFetch(`/snaps/hashtag-sets/${setId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      setActiveHashtagSetId('');
      await Promise.all([loadHashtagSets(), loadActivity()]);
      toast.show('해시태그 세트를 삭제했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '해시태그 세트 삭제에 실패했습니다.',
        'warning'
      );
    } finally {
      setHashtagSetLoading(false);
    }
  };

  const buildFirstCommentPayload = () => ({
    sourceText,
    topic: sourceTopic || sourceTitle || 'snaps campaign',
    globalComment: firstCommentText,
    strategy: firstCommentStrategy,
    targetPlatforms: selectedPlatforms,
    variants: result?.variants || [],
  });

  const previewFirstComments = async () => {
    setFirstCommentLoading(true);
    try {
      const response = await snapsFetch('/snaps/first-comments/preview', {
        method: 'POST',
        body: JSON.stringify(buildFirstCommentPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      setFirstCommentPreview((await response.json()) as SnapsFirstCommentPreview);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '첫 댓글 미리보기에 실패했습니다.',
        'warning'
      );
    } finally {
      setFirstCommentLoading(false);
    }
  };

  const createFirstCommentQueue = async () => {
    const payload = buildFirstCommentPayload();
    const preview = firstCommentPreview || null;
    const queuePlatforms = preview?.supportedPlatforms.length
      ? preview.supportedPlatforms
      : selectedPlatforms;
    const integrationsToUse = queuePlatforms
      .map((platform) => ({
        platform,
        integrationId: connectedByPlatform[platform]?.id,
      }))
      .filter((item) => item.integrationId);

    if (!payload.variants.length && !payload.sourceText) {
      toast.show('첫 댓글로 큐에 넣을 본문 또는 변환 결과가 없습니다.', 'warning');
      return;
    }
    if (!integrationsToUse.length) {
      toast.show('첫 댓글 큐를 만들 연결 발행 채널이 없습니다.', 'warning');
      return;
    }

    let publishDateIso: string | undefined;
    if (scheduleType === 'schedule' && publishDate) {
      const parsedPublishDate = new Date(publishDate);
      if (Number.isNaN(parsedPublishDate.getTime())) {
        toast.show('예약 시간을 확인하세요.', 'warning');
        return;
      }
      publishDateIso = parsedPublishDate.toISOString();
    }

    if (
      scheduleType === 'schedule' &&
      !confirmOperatorAction(
        `본문과 첫 댓글을 연결된 채널 ${integrationsToUse.length}개에 예약 큐로 만들까요?`
      )
    ) {
      return;
    }

    setFirstCommentLoading(true);
    try {
      const response = await snapsFetch('/snaps/first-comments/schedule', {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          scheduleType,
          operatorConfirmed: scheduleType === 'schedule',
          ...(publishDateIso ? { publishDate: publishDateIso } : {}),
          integrations: integrationsToUse,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const queued = (await response.json()) as {
        preview?: SnapsFirstCommentPreview;
        scheduled?: unknown[];
      };
      if (queued.preview) {
        setFirstCommentPreview(queued.preview);
      }
      await loadActivity();
      if (showSnapsScheduleResult('첫 댓글 큐', queued)) {
        router.push('/launches?display=list');
      }
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '첫 댓글 큐 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setFirstCommentLoading(false);
    }
  };

  const buildRecyclePayload = () => {
    let startDateIso: string | undefined;
    if (publishDate) {
      const parsedPublishDate = new Date(publishDate);
      if (!Number.isNaN(parsedPublishDate.getTime())) {
        startDateIso = parsedPublishDate.toISOString();
      }
    }

    return {
      sourceText: recycleSourceText.trim() || sourceText,
      title: sourceTitle,
      topic: sourceTopic,
      tone,
      category: recycleCategory,
      cadence: recycleCadence,
      repeatCount: Number(recycleRepeatCount) || 4,
      topPostUrl: recycleTopPostUrl,
      performanceNote: recyclePerformanceNote,
      targetPlatforms: selectedPlatforms,
      tags: [sourceTopic, recycleCategory].filter(Boolean),
      ...(startDateIso ? { startDate: startDateIso } : {}),
    };
  };

  const previewRecycleQueue = async () => {
    if (!recycleSourceText.trim() && !sourceText.trim()) {
      toast.show('재활용할 원문을 입력하세요.', 'warning');
      return;
    }

    setRecycleLoading(true);
    try {
      const response = await snapsFetch('/snaps/recycle/preview', {
        method: 'POST',
        body: JSON.stringify(buildRecyclePayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const preview = (await response.json()) as SnapsEvergreenRecyclePreview;
      setRecyclePreview(preview);
      toast.show(`재활용 미리보기 완료: ${preview.acceptedItems}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '재활용 미리보기에 실패했습니다.',
        'warning'
      );
    } finally {
      setRecycleLoading(false);
    }
  };

  const importRecycleSources = async () => {
    if (!recycleSourceText.trim() && !sourceText.trim()) {
      toast.show('재활용할 원문을 입력하세요.', 'warning');
      return;
    }
    if (
      !confirmOperatorAction(
        '에버그린 재활용 변형을 원문 라이브러리에 병합할까요?'
      )
    ) {
      return;
    }

    setRecycleLoading(true);
    try {
      const response = await snapsFetch('/snaps/recycle/import-sources', {
        method: 'POST',
        body: JSON.stringify(buildRecyclePayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const imported = (await response.json()) as SnapsEvergreenRecyclePreview & {
        imported?: { imported?: number; total?: number };
      };
      setRecyclePreview(imported);
      await Promise.all([loadSourceLibrary(), loadActivity()]);
      toast.show(`재활용 원문 가져오기 완료: ${imported.imported?.imported || 0}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '재활용 원문 가져오기에 실패했습니다.',
        'warning'
      );
    } finally {
      setRecycleLoading(false);
    }
  };

  const createRecycleQueue = async () => {
    if (!recycleSourceText.trim() && !sourceText.trim()) {
      toast.show('재활용할 원문을 입력하세요.', 'warning');
      return;
    }

    const items = recyclePreview?.items || [];
    const platforms = [
      ...new Set(
        (items.length ? items : [{ platforms: selectedPlatforms }])
          .flatMap((item) => item.platforms)
          .filter(Boolean)
      ),
    ];
    const integrationsToUse = platforms
      .map((platform) => ({
        platform,
        integrationId: connectedByPlatform[platform]?.id,
      }))
      .filter((item) => item.integrationId);

    if (!integrationsToUse.length) {
      toast.show('재활용 큐를 만들 연결 발행 채널이 없습니다.', 'warning');
      return;
    }

    let publishDateIso: string | undefined;
    if (scheduleType === 'schedule' && publishDate) {
      const parsedPublishDate = new Date(publishDate);
      if (Number.isNaN(parsedPublishDate.getTime())) {
        toast.show('예약 시간을 확인하세요.', 'warning');
        return;
      }
      publishDateIso = parsedPublishDate.toISOString();
    }

    if (
      scheduleType === 'schedule' &&
      !confirmOperatorAction(
        `재활용 변형을 연결된 채널 ${integrationsToUse.length}개에 예약 큐로 만들까요?`
      )
    ) {
      return;
    }

    setRecycleLoading(true);
    try {
      const response = await snapsFetch('/snaps/recycle/schedule', {
        method: 'POST',
        body: JSON.stringify({
          ...buildRecyclePayload(),
          scheduleType,
          operatorConfirmed: scheduleType === 'schedule',
          ...(publishDateIso ? { publishDate: publishDateIso, startDate: publishDateIso } : {}),
          integrations: integrationsToUse,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const queued = (await response.json()) as {
        preview?: SnapsEvergreenRecyclePreview;
        items?: unknown[];
      };
      if (queued.preview) {
        setRecyclePreview(queued.preview);
      }
      await loadActivity();
      if (showSnapsScheduleResult('재활용 큐', queued)) {
        router.push('/launches?display=list');
      }
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '재활용 큐 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setRecycleLoading(false);
    }
  };

  const buildRecurringPayload = () => {
    let startDateIso: string | undefined;
    if (publishDate) {
      const parsedPublishDate = new Date(publishDate);
      if (!Number.isNaN(parsedPublishDate.getTime())) {
        startDateIso = parsedPublishDate.toISOString();
      }
    }

    return {
      sourceText: recurringSourceText.trim() || sourceText,
      title: sourceTitle || '반복 게시 캠페인',
      topic: sourceTopic,
      tone,
      cadence: recurringCadence,
      intervalDays: Number(recurringIntervalDays) || 7,
      repeatCount: Number(recurringRepeatCount) || 4,
      localTime: recurringLocalTime,
      variationMode: recurringVariationMode,
      cta: recurringCta,
      targetPlatforms: selectedPlatforms,
      tags: [sourceTopic, recurringCadence, 'recurring'].filter(Boolean),
      ...(startDateIso ? { startDate: startDateIso } : {}),
    };
  };

  const previewRecurringPosts = async () => {
    if (!recurringSourceText.trim() && !sourceText.trim()) {
      toast.show('반복 게시할 원문을 입력하세요.', 'warning');
      return;
    }

    setRecurringLoading(true);
    try {
      const response = await snapsFetch('/snaps/recurring/preview', {
        method: 'POST',
        body: JSON.stringify(buildRecurringPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const preview = (await response.json()) as SnapsRecurringPostPreview;
      setRecurringPreview(preview);
      toast.show(`반복 게시 미리보기 완료: ${preview.acceptedItems}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '반복 게시 미리보기에 실패했습니다.',
        'warning'
      );
    } finally {
      setRecurringLoading(false);
    }
  };

  const importRecurringSources = async () => {
    if (!recurringSourceText.trim() && !sourceText.trim()) {
      toast.show('반복 게시할 원문을 입력하세요.', 'warning');
      return;
    }
    if (
      !confirmOperatorAction(
        '반복 게시 항목을 원문 라이브러리에 병합할까요?'
      )
    ) {
      return;
    }

    setRecurringLoading(true);
    try {
      const response = await snapsFetch('/snaps/recurring/import-sources', {
        method: 'POST',
        body: JSON.stringify(buildRecurringPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const imported = (await response.json()) as SnapsRecurringPostPreview & {
        imported?: { imported?: number; total?: number };
      };
      setRecurringPreview(imported);
      await Promise.all([loadSourceLibrary(), loadActivity()]);
      toast.show(`반복 게시 원문 가져오기 완료: ${imported.imported?.imported || 0}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '반복 게시 원문 가져오기에 실패했습니다.',
        'warning'
      );
    } finally {
      setRecurringLoading(false);
    }
  };

  const createRecurringQueue = async () => {
    if (!recurringSourceText.trim() && !sourceText.trim()) {
      toast.show('반복 게시할 원문을 입력하세요.', 'warning');
      return;
    }

    const items = recurringPreview?.items || [];
    const platforms = [
      ...new Set(
        (items.length ? items : [{ platforms: selectedPlatforms }])
          .flatMap((item) => item.platforms)
          .filter(Boolean)
      ),
    ];
    const integrationsToUse = platforms
      .map((platform) => ({
        platform,
        integrationId: connectedByPlatform[platform]?.id,
      }))
      .filter((item) => item.integrationId);

    if (!integrationsToUse.length) {
      toast.show('반복 게시 큐를 만들 연결 발행 채널이 없습니다.', 'warning');
      return;
    }

    let publishDateIso: string | undefined;
    if (scheduleType === 'schedule' && publishDate) {
      const parsedPublishDate = new Date(publishDate);
      if (Number.isNaN(parsedPublishDate.getTime())) {
        toast.show('예약 시간을 확인하세요.', 'warning');
        return;
      }
      publishDateIso = parsedPublishDate.toISOString();
    }

    if (
      scheduleType === 'schedule' &&
      !confirmOperatorAction(
        `반복 게시 항목을 연결된 채널 ${integrationsToUse.length}개에 예약 큐로 만들까요?`
      )
    ) {
      return;
    }

    setRecurringLoading(true);
    try {
      const response = await snapsFetch('/snaps/recurring/schedule', {
        method: 'POST',
        body: JSON.stringify({
          ...buildRecurringPayload(),
          scheduleType,
          operatorConfirmed: scheduleType === 'schedule',
          ...(publishDateIso ? { publishDate: publishDateIso, startDate: publishDateIso } : {}),
          integrations: integrationsToUse,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const queued = (await response.json()) as {
        preview?: SnapsRecurringPostPreview;
        items?: unknown[];
      };
      if (queued.preview) {
        setRecurringPreview(queued.preview);
      }
      await loadActivity();
      if (showSnapsScheduleResult('반복 게시 큐', queued)) {
        router.push('/launches?display=list');
      }
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '반복 게시 큐 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setRecurringLoading(false);
    }
  };

  const buildRepurposePayload = () => {
    const now = new Date('2026-06-01T09:00:00+09:00').toISOString();
    return {
      sourceText: repurposeSourceText.trim(),
      sourcePlatform: repurposeSourcePlatform,
      workflowMode: repurposeWorkflowMode,
      contentFilter: repurposeContentFilter,
      scheduleSlots: repurposeSlots,
      targetPlatforms: selectedPlatforms,
      timezone: 'Asia/Seoul',
      now,
      activatedAt: now,
      dedupeExisting: true,
      tags: [sourceTopic, 'repurpose'].filter(Boolean),
    };
  };

  const previewRepurposeQueue = async () => {
    if (!repurposeSourceText.trim()) {
      toast.show('재배포할 소스 항목을 입력하세요.', 'warning');
      return;
    }

    setRepurposeLoading(true);
    try {
      const response = await snapsFetch('/snaps/repurpose/preview', {
        method: 'POST',
        body: JSON.stringify(buildRepurposePayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const preview = (await response.json()) as SnapsRepurposeQueuePreview;
      setRepurposePreview(preview);
      toast.show(`재배포 큐 미리보기 완료: ${preview.acceptedItems}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '재배포 큐 미리보기에 실패했습니다.',
        'warning'
      );
    } finally {
      setRepurposeLoading(false);
    }
  };

  const importRepurposeSources = async () => {
    if (!repurposeSourceText.trim()) {
      toast.show('재배포할 소스 항목을 입력하세요.', 'warning');
      return;
    }
    if (
      !confirmOperatorAction(
        '재배포 큐 항목을 원문 라이브러리에 병합할까요?'
      )
    ) {
      return;
    }

    setRepurposeLoading(true);
    try {
      const response = await snapsFetch('/snaps/repurpose/import-sources', {
        method: 'POST',
        body: JSON.stringify(buildRepurposePayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const imported = (await response.json()) as SnapsRepurposeQueuePreview & {
        imported?: { imported?: number; total?: number };
      };
      setRepurposePreview(imported);
      await Promise.all([loadSourceLibrary(), loadActivity()]);
      toast.show(`재배포 원문 가져오기 완료: ${imported.imported?.imported || 0}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '재배포 원문 가져오기에 실패했습니다.',
        'warning'
      );
    } finally {
      setRepurposeLoading(false);
    }
  };

  const createRepurposeQueue = async () => {
    if (!repurposeSourceText.trim()) {
      toast.show('재배포할 소스 항목을 입력하세요.', 'warning');
      return;
    }

    const items = repurposePreview?.items || [];
    const platforms = [
      ...new Set(
        (items.length ? items : [{ targetPlatforms: selectedPlatforms }])
          .flatMap((item) => item.targetPlatforms)
          .filter(Boolean)
      ),
    ];
    const integrationsToUse = platforms
      .map((platform) => ({
        platform,
        integrationId: connectedByPlatform[platform]?.id,
      }))
      .filter((item) => item.integrationId);

    if (!integrationsToUse.length) {
      toast.show('재배포 큐를 만들 연결 발행 채널이 없습니다.', 'warning');
      return;
    }

    let publishDateIso: string | undefined;
    if (scheduleType === 'schedule' && publishDate) {
      const parsedPublishDate = new Date(publishDate);
      if (Number.isNaN(parsedPublishDate.getTime())) {
        toast.show('예약 시간을 확인하세요.', 'warning');
        return;
      }
      publishDateIso = parsedPublishDate.toISOString();
    }

    if (
      scheduleType === 'schedule' &&
      !confirmOperatorAction(
        `재배포 항목을 연결된 채널 ${integrationsToUse.length}개에 예약 큐로 만들까요?`
      )
    ) {
      return;
    }

    setRepurposeLoading(true);
    try {
      const response = await snapsFetch('/snaps/repurpose/schedule', {
        method: 'POST',
        body: JSON.stringify({
          ...buildRepurposePayload(),
          scheduleType,
          operatorConfirmed: scheduleType === 'schedule',
          ...(publishDateIso ? { publishDate: publishDateIso } : {}),
          integrations: integrationsToUse,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const queued = (await response.json()) as {
        preview?: SnapsRepurposeQueuePreview;
        items?: unknown[];
      };
      if (queued.preview) {
        setRepurposePreview(queued.preview);
      }
      await loadActivity();
      if (showSnapsScheduleResult('재배포 큐', queued)) {
        router.push('/launches?display=list');
      }
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '재배포 큐 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setRepurposeLoading(false);
    }
  };

  const buildContentCalendarPayload = () => {
    let startDateIso: string | undefined;
    if (publishDate) {
      const parsedPublishDate = new Date(publishDate);
      if (!Number.isNaN(parsedPublishDate.getTime())) {
        startDateIso = parsedPublishDate.toISOString();
      }
    }

    return {
      sourceText: calendarBrief.trim() || sourceText,
      title: `${calendarCampaign} 콘텐츠 캘린더`,
      campaign: calendarCampaign,
      audience: calendarAudience,
      tone,
      cadence: calendarCadence,
      days: Number(calendarDays) || 14,
      postsPerDay: Number(calendarPostsPerDay) || 1,
      targetPlatforms: selectedPlatforms,
      contentPillars: calendarPillars,
      goals: calendarGoals,
      formats: calendarFormats,
      cta: calendarCta,
      ...(startDateIso ? { startDate: startDateIso } : {}),
    };
  };

  const previewContentCalendar = async () => {
    if (!calendarBrief.trim() && !sourceText.trim() && !calendarCampaign.trim()) {
      toast.show('콘텐츠 캘린더 브리프를 입력하세요.', 'warning');
      return;
    }

    setCalendarLoading(true);
    try {
      const response = await snapsFetch('/snaps/calendar/plan', {
        method: 'POST',
        body: JSON.stringify(buildContentCalendarPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const preview = (await response.json()) as SnapsContentCalendarPreview;
      setCalendarPreview(preview);
      toast.show(`콘텐츠 캘린더 생성 완료: ${preview.acceptedItems}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '콘텐츠 캘린더 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setCalendarLoading(false);
    }
  };

  const importContentCalendarSources = async () => {
    if (!calendarBrief.trim() && !sourceText.trim() && !calendarCampaign.trim()) {
      toast.show('콘텐츠 캘린더 브리프를 입력하세요.', 'warning');
      return;
    }
    if (
      !confirmOperatorAction(
        '콘텐츠 캘린더 항목을 원문 라이브러리에 병합할까요?'
      )
    ) {
      return;
    }

    setCalendarLoading(true);
    try {
      const response = await snapsFetch('/snaps/calendar/import-sources', {
        method: 'POST',
        body: JSON.stringify(buildContentCalendarPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const imported = (await response.json()) as SnapsContentCalendarPreview & {
        imported?: { imported?: number; total?: number };
      };
      setCalendarPreview(imported);
      await Promise.all([loadSourceLibrary(), loadActivity()]);
      toast.show(`캘린더 원문 가져오기 완료: ${imported.imported?.imported || 0}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '캘린더 원문 가져오기에 실패했습니다.',
        'warning'
      );
    } finally {
      setCalendarLoading(false);
    }
  };

  const createContentCalendarQueue = async () => {
    if (!calendarBrief.trim() && !sourceText.trim() && !calendarCampaign.trim()) {
      toast.show('콘텐츠 캘린더 브리프를 입력하세요.', 'warning');
      return;
    }

    const items = calendarPreview?.items || [];
    const platforms = [
      ...new Set((items.length ? items.map((item) => item.platform) : selectedPlatforms).filter(Boolean)),
    ];
    const integrationsToUse = platforms
      .map((platform) => ({
        platform,
        integrationId: connectedByPlatform[platform]?.id,
      }))
      .filter((item) => item.integrationId);

    if (!integrationsToUse.length) {
      toast.show('콘텐츠 캘린더 큐를 만들 연결 발행 채널이 없습니다.', 'warning');
      return;
    }

    if (
      scheduleType === 'schedule' &&
      !confirmOperatorAction(
        `콘텐츠 캘린더를 연결된 채널 ${integrationsToUse.length}개에 예약 큐로 만들까요?`
      )
    ) {
      return;
    }

    setCalendarLoading(true);
    try {
      const response = await snapsFetch('/snaps/calendar/schedule', {
        method: 'POST',
        body: JSON.stringify({
          ...buildContentCalendarPayload(),
          scheduleType,
          operatorConfirmed: scheduleType === 'schedule',
          integrations: integrationsToUse,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const queued = (await response.json()) as {
        preview?: SnapsContentCalendarPreview;
        items?: unknown[];
      };
      if (queued.preview) {
        setCalendarPreview(queued.preview);
      }
      await loadActivity();
      if (showSnapsScheduleResult('콘텐츠 캘린더 큐', queued)) {
        router.push('/launches?display=list');
      }
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '콘텐츠 캘린더 큐 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setCalendarLoading(false);
    }
  };

  const useContentCalendarItemInEditor = (item: SnapsContentCalendarItem) => {
    setSourceTitle(item.title);
    setSourceTopic(`${item.pillar} · ${item.goal}`);
    setSourceText(item.sourceText);
    toast.show('캘린더 항목을 편집기에 불러왔습니다.');
  };

  const buildContentCategoryPayload = () => {
    let startDateIso: string | undefined;
    if (publishDate) {
      const parsedPublishDate = new Date(publishDate);
      if (!Number.isNaN(parsedPublishDate.getTime())) {
        startDateIso = parsedPublishDate.toISOString();
      }
    }

    return {
      sourceText: categorySourceText.trim() || sourceText,
      title: `${categoryCampaign} 카테고리 큐`,
      campaign: categoryCampaign,
      categories: categoryConfig,
      categorySequence,
      targetPlatforms: selectedPlatforms,
      days: Number(categoryDays) || 14,
      postsPerDay: Number(categoryPostsPerDay) || 1,
      cta: categoryCta,
      tone,
      linkUrl: categoryLinkUrl,
      utmCampaign: categoryCampaign,
      ...(startDateIso ? { startDate: startDateIso } : {}),
    };
  };

  const previewContentCategories = async () => {
    if (!categorySourceText.trim() && !sourceText.trim() && !categoryCampaign.trim()) {
      toast.show('카테고리 큐 원문을 입력하세요.', 'warning');
      return;
    }

    setCategoryLoading(true);
    try {
      const response = await snapsFetch('/snaps/categories/plan', {
        method: 'POST',
        body: JSON.stringify(buildContentCategoryPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const preview = (await response.json()) as SnapsContentCategoryPreview;
      setCategoryPreview(preview);
      toast.show(`카테고리 큐 생성 완료: ${preview.acceptedItems}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '카테고리 큐 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setCategoryLoading(false);
    }
  };

  const importContentCategorySources = async () => {
    if (!categorySourceText.trim() && !sourceText.trim() && !categoryCampaign.trim()) {
      toast.show('카테고리 큐 원문을 입력하세요.', 'warning');
      return;
    }
    if (
      !confirmOperatorAction(
        '콘텐츠 카테고리 큐 항목을 원문 라이브러리에 병합할까요?'
      )
    ) {
      return;
    }

    setCategoryLoading(true);
    try {
      const response = await snapsFetch('/snaps/categories/import-sources', {
        method: 'POST',
        body: JSON.stringify(buildContentCategoryPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const imported = (await response.json()) as SnapsContentCategoryPreview & {
        imported?: { imported?: number; total?: number };
      };
      setCategoryPreview(imported);
      await Promise.all([loadSourceLibrary(), loadActivity()]);
      toast.show(`카테고리 원문 가져오기 완료: ${imported.imported?.imported || 0}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '카테고리 원문 가져오기에 실패했습니다.',
        'warning'
      );
    } finally {
      setCategoryLoading(false);
    }
  };

  const createContentCategoryQueue = async () => {
    if (!categorySourceText.trim() && !sourceText.trim() && !categoryCampaign.trim()) {
      toast.show('카테고리 큐 원문을 입력하세요.', 'warning');
      return;
    }

    const items = categoryPreview?.items || [];
    const platforms = [
      ...new Set((items.length ? items.map((item) => item.platform) : selectedPlatforms).filter(Boolean)),
    ];
    const integrationsToUse = platforms
      .map((platform) => ({
        platform,
        integrationId: connectedByPlatform[platform]?.id,
      }))
      .filter((item) => item.integrationId);

    if (!integrationsToUse.length) {
      toast.show('카테고리 큐를 만들 연결 발행 채널이 없습니다.', 'warning');
      return;
    }

    if (
      scheduleType === 'schedule' &&
      !confirmOperatorAction(
        `콘텐츠 카테고리 큐를 연결된 채널 ${integrationsToUse.length}개에 예약으로 만들까요?`
      )
    ) {
      return;
    }

    setCategoryLoading(true);
    try {
      const response = await snapsFetch('/snaps/categories/schedule', {
        method: 'POST',
        body: JSON.stringify({
          ...buildContentCategoryPayload(),
          scheduleType,
          operatorConfirmed: scheduleType === 'schedule',
          integrations: integrationsToUse,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const queued = (await response.json()) as {
        preview?: SnapsContentCategoryPreview;
        items?: unknown[];
      };
      if (queued.preview) {
        setCategoryPreview(queued.preview);
      }
      await loadActivity();
      if (showSnapsScheduleResult('카테고리 큐', queued)) {
        router.push('/launches?display=list');
      }
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '카테고리 큐 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setCategoryLoading(false);
    }
  };

  const useContentCategoryItemInEditor = (item: SnapsContentCategoryQueueItem) => {
    setSourceTitle(item.title);
    setSourceTopic(`${item.categoryName} · ${item.shareMode}`);
    setSourceText(item.sourceText);
    toast.show('카테고리 큐 항목을 편집기에 불러왔습니다.');
  };

  const buildPostConditionPayload = () => {
    let parentPublishedAtIso: string | undefined;
    if (conditionPublishedAt) {
      const parsedDate = new Date(conditionPublishedAt);
      if (!Number.isNaN(parsedDate.getTime())) {
        parentPublishedAtIso = parsedDate.toISOString();
      }
    }

    return {
      parentTitle: conditionParentTitle,
      parentUrl: conditionParentUrl,
      parentPlatform: conditionParentPlatform,
      parentPublishedAt: parentPublishedAtIso,
      followUpTitle: `${conditionParentTitle} 후속`,
      followUpText: conditionFollowUpText,
      conditionType,
      threshold: Number(conditionThreshold) || 0,
      delayMinutes: Number(conditionDelayMinutes) || 0,
      targetPlatforms: selectedPlatforms,
      cta: conditionCta,
      tags: [sourceTopic, conditionType].filter(Boolean),
      metrics: {
        likes: Number(conditionLikes) || 0,
        retweets: Number(conditionRetweets) || 0,
        comments: Number(conditionComments) || 0,
        impressions: Number(conditionImpressions) || 0,
        engagementRate: Number(conditionEngagementRate) || 0,
      },
      baseline: {
        averageImpressions: Number(conditionAverageImpressions) || 0,
        averageEngagementRate: Number(conditionAverageEngagementRate) || 0,
      },
    };
  };

  const previewPostCondition = async () => {
    if (!conditionFollowUpText.trim()) {
      toast.show('조건 충족 시 사용할 후속 문구를 입력하세요.', 'warning');
      return;
    }

    setConditionLoading(true);
    try {
      const response = await snapsFetch('/snaps/conditions/preview', {
        method: 'POST',
        body: JSON.stringify(buildPostConditionPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const preview = (await response.json()) as SnapsPostConditionPreview;
      setConditionPreview(preview);
      toast.show(
        preview.triggerMet ? '조건이 충족되었습니다.' : '조건이 아직 대기 중입니다.'
      );
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '조건부 포스트 평가에 실패했습니다.',
        'warning'
      );
    } finally {
      setConditionLoading(false);
    }
  };

  const importPostConditionSource = async () => {
    if (!conditionFollowUpText.trim()) {
      toast.show('조건 충족 시 사용할 후속 문구를 입력하세요.', 'warning');
      return;
    }
    if (
      !confirmOperatorAction(
        '조건부 후속 포스트를 원문 라이브러리에 병합할까요?'
      )
    ) {
      return;
    }

    setConditionLoading(true);
    try {
      const response = await snapsFetch('/snaps/conditions/import-source', {
        method: 'POST',
        body: JSON.stringify(buildPostConditionPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const imported = (await response.json()) as {
        preview?: SnapsPostConditionPreview;
        imported?: { imported?: number; total?: number };
      };
      if (imported.preview) {
        setConditionPreview(imported.preview);
      }
      await Promise.all([loadSourceLibrary(), loadActivity()]);
      toast.show(`조건부 원문 가져오기 완료: ${imported.imported?.imported || 0}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '조건부 원문 가져오기에 실패했습니다.',
        'warning'
      );
    } finally {
      setConditionLoading(false);
    }
  };

  const createPostConditionQueue = async () => {
    if (!conditionFollowUpText.trim()) {
      toast.show('조건 충족 시 사용할 후속 문구를 입력하세요.', 'warning');
      return;
    }

    const platforms = conditionPreview?.item.platforms?.length
      ? conditionPreview.item.platforms
      : selectedPlatforms;
    const integrationsToUse = platforms
      .map((platform) => ({
        platform,
        integrationId: connectedByPlatform[platform]?.id,
      }))
      .filter((item) => item.integrationId);

    if (!integrationsToUse.length) {
      toast.show('조건부 큐를 만들 연결 발행 채널이 없습니다.', 'warning');
      return;
    }

    if (
      scheduleType === 'schedule' &&
      !confirmOperatorAction(
        `조건이 충족되면 후속 포스트를 연결된 채널 ${integrationsToUse.length}개에 예약 큐로 만들까요?`
      )
    ) {
      return;
    }

    setConditionLoading(true);
    try {
      const response = await snapsFetch('/snaps/conditions/schedule', {
        method: 'POST',
        body: JSON.stringify({
          ...buildPostConditionPayload(),
          scheduleType,
          operatorConfirmed: scheduleType === 'schedule',
          integrations: integrationsToUse,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const queued = (await response.json()) as {
        preview?: SnapsPostConditionPreview;
        warnings?: string[];
        scheduled?: unknown[];
      };
      if (queued.preview) {
        setConditionPreview(queued.preview);
      }
      await loadActivity();
      if (showSnapsScheduleResult('조건부 큐', queued)) {
        router.push('/launches?display=list');
      }
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '조건부 큐 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setConditionLoading(false);
    }
  };

  const usePostConditionInEditor = () => {
    if (!conditionPreview) {
      toast.show('먼저 조건부 포스트를 평가하세요.', 'warning');
      return;
    }
    setSourceTitle(conditionPreview.item.title);
    setSourceTopic(conditionPreview.conditionType);
    setSourceText(conditionPreview.item.sourceText);
    toast.show('조건부 후속 포스트를 편집기에 불러왔습니다.');
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

  const loadReplyTemplates = async () => {
    try {
      const response = await snapsFetch('/snaps/inbox/reply-templates');
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      setReplyTemplates(Array.isArray(payload) ? payload : []);
    } catch {
      setReplyTemplates([]);
    }
  };

  const loadInboxNotes = async () => {
    try {
      const response = await snapsFetch('/snaps/inbox/notes');
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      setInboxNotes(Array.isArray(payload) ? payload : []);
    } catch {
      setInboxNotes([]);
    }
  };

  const loadFeedbackItems = async (
    status = feedbackItemStatus,
    search = feedbackItemSearch
  ) => {
    try {
      const params = new URLSearchParams();
      if (status !== 'all') {
        params.set('status', status);
      }
      if (search.trim()) {
        params.set('search', search.trim());
      }
      const query = params.toString();
      const path = query ? `/snaps/inbox/items?${query}` : '/snaps/inbox/items';
      const response = await snapsFetch(path);
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      setFeedbackItems(Array.isArray(payload) ? payload : []);
    } catch {
      setFeedbackItems([]);
    }
  };

  const loadAgentTasks = async (
    keyword = agentTaskSearch,
    favoriteOnly = agentFavoriteOnly
  ) => {
    setAgentTasksLoading(true);
    try {
      const params = new URLSearchParams({
        page: '1',
        pageSize: '8',
      });
      if (keyword.trim()) {
        params.set('keyword', keyword.trim());
      }
      if (favoriteOnly) {
        params.set('favoriteOnly', 'true');
      }
      const response = await snapsFetch(`/snaps/agent/tasks?${params.toString()}`);
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      setAgentTasks(Array.isArray(payload.list) ? payload.list : []);
    } catch {
      setAgentTasks([]);
    } finally {
      setAgentTasksLoading(false);
    }
  };

  useEffect(() => {
    loadHealth();
    loadActivity();
    loadStyleExamples();
    loadSourceLibrary();
    loadReportHistory();
    loadSalesData();
    loadCompetitorData();
    loadApprovalRequests();
    loadIdeas('inbox', '');
    loadBrandKits();
    loadMediaAssets();
    loadHashtagSets();
    loadListeningMonitors();
    loadAgentTasks('', false);
    loadReplyCapabilities();
    loadReplyTemplates();
    loadInboxNotes();
    loadFeedbackItems('unread', '');
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

  const applyPreparedAgentResult = (
    prepared: SnapsAgentPrepareResult,
    fallbackTitle = 'snaps agent plan'
  ) => {
    setSourceText(prepared.plan.sourceText || prepared.plan.command);
    setSourceTitle(prepared.plan.topic || fallbackTitle);
    setSourceTopic(prepared.plan.topic || '');
    setTone(prepared.plan.tone || tone);
    setSelectedPlatforms(
      prepared.plan.targetPlatforms.length
        ? prepared.plan.targetPlatforms
        : selectedPlatforms
    );
    setScheduleType(prepared.plan.scheduleType || 'draft');
    if (prepared.plan.publishDateLocal) {
      setPublishDate(prepared.plan.publishDateLocal);
    }
    setResult(prepared.transform);
    setActivePlatform(
      prepared.transform.variants[0]?.platform ||
        prepared.plan.targetPlatforms[0] ||
        activePlatform
    );
  };

  const prepareAgentCommand = async (commandOverride?: string) => {
    const commandToPrepare = (commandOverride || agentCommand).trim();
    if (commandToPrepare.length < 5) {
      toast.show('에이전트 오더를 입력하세요.', 'warning');
      return;
    }
    if (commandOverride) {
      setAgentCommand(commandToPrepare);
    }

    setAgentLoading(true);
    try {
      const response = await snapsFetch('/snaps/agent/prepare', {
        method: 'POST',
        body: JSON.stringify({
          command: commandToPrepare,
          useRag,
          now: new Date().toISOString(),
          timezoneOffsetMinutes: new Date().getTimezoneOffset(),
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }

      const prepared = (await response.json()) as SnapsAgentPrepareResult;
      setAgentResult(prepared);
      applyPreparedAgentResult(prepared);
      await loadAgentTasks();
      await loadActivity();
      toast.show('에이전트 작업 준비가 완료되었습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '에이전트 작업 준비에 실패했습니다.',
        'warning'
      );
    } finally {
      setAgentLoading(false);
    }
  };

  const openAgentTask = async (taskId: string) => {
    try {
      const response = await snapsFetch(`/snaps/agent/tasks/${taskId}`);
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const task = (await response.json()) as SnapsAgentTaskDetail;
      setAgentResult({
        ...task.result,
        task,
      });
      applyPreparedAgentResult({ ...task.result, task }, task.title);
      toast.show('에이전트 작업을 불러왔습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '에이전트 작업을 불러오지 못했습니다.',
        'warning'
      );
    }
  };

  const toggleAgentFavorite = async (task: SnapsAgentTaskListItem) => {
    try {
      const response = await snapsFetch(`/snaps/agent/tasks/${task.id}/favorite`, {
        method: task.favorite ? 'DELETE' : 'POST',
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      await loadAgentTasks();
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '즐겨찾기 변경에 실패했습니다.',
        'warning'
      );
    }
  };

  const rateAgentTask = async (taskId: string, rating: number) => {
    try {
      const response = await snapsFetch(`/snaps/agent/tasks/${taskId}/rating`, {
        method: 'POST',
        body: JSON.stringify({ rating }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      await loadAgentTasks();
      toast.show('에이전트 작업 평가를 저장했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '에이전트 작업 평가에 실패했습니다.',
        'warning'
      );
    }
  };

  const deleteAgentTask = async (task: SnapsAgentTaskListItem) => {
    if (!confirmDestructive(`에이전트 작업 "${task.title}"을 삭제할까요?`)) {
      return;
    }
    try {
      const response = await snapsFetch(`/snaps/agent/tasks/${task.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      await Promise.all([loadAgentTasks(), loadActivity()]);
      if (agentResult?.task?.id === task.id) {
        setAgentResult(null);
      }
      toast.show('에이전트 작업을 삭제했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '에이전트 작업 삭제에 실패했습니다.',
        'warning'
      );
    }
  };

  const copyAgentBrief = async () => {
    if (!agentResult) {
      return;
    }

    const lines = [
      `오더: ${agentResult.plan.command}`,
      `대상: ${agentResult.plan.targetPlatforms.map(targetPlatformLabel).join(', ')}`,
      agentResult.plan.scheduleType === 'schedule'
        ? `예약: ${agentResult.plan.publishDateLocal || agentResult.plan.publishDate || '시간 미정'}`
        : '모드: 초안',
      agentResult.plan.includeShortVideo
        ? `쇼츠: ${agentResult.plan.shortVideoTargetPlatforms
            .map(targetPlatformLabel)
            .join(', ')}`
        : '',
      '',
      '작업자 브리핑',
      ...(agentResult.plan.operatorSummary || []),
      '',
      '다음 액션',
      ...agentResult.operation.nextActions.map((action) => `- ${action}`),
      '',
      '품질 게이트',
      ...(agentResult.operation.qualityGates || []).map(
        (gate) => `- [${gate.severity}] ${gate.label}: ${gate.detail}`
      ),
      '',
      '운영 타임라인',
      ...(agentResult.plan.campaignTimeline || []).map(
        (item) => `- ${item.label} (${item.window}): ${item.actions.join(' / ')}`
      ),
      '',
      '경쟁 기능 카피맵',
      ...(agentResult.plan.competitorPlaybook?.parityFeatures || []).map(
        (feature) =>
          `- ${feature.label} (${feature.status}): ${feature.snapsSurface} / ${feature.operatorAction}`
      ),
      '',
      '가상 시나리오',
      agentResult.plan.scenarioRun?.scenario || '',
      ...(agentResult.plan.scenarioRun?.workflow || []).map(
        (step) => `- ${step}`
      ),
      '',
      '판매 계획',
      agentResult.plan.goToMarketPlan?.positioning || '',
      ...(agentResult.plan.goToMarketPlan?.segments || []).map(
        (segment) =>
          `- ${segment.label}: ${segment.firstPitch} (${segment.pricing})`
      ),
      '',
      '채널별 초안',
      ...agentResult.transform.variants.map(
        (variant) => [
          `## ${variant.label}`,
          variant.title || '',
          variant.content,
          variant.hashtags?.length ? variant.hashtags.join(' ') : '',
        ]
          .filter(Boolean)
          .join('\n')
      ),
    ].filter(Boolean);

    await navigator.clipboard.writeText(lines.join('\n'));
    toast.show('에이전트 브리프를 복사했습니다.');
  };

  const sendAgentShortsToMedia = () => {
    if (!agentResult?.plan.includeShortVideo) {
      toast.show('쇼츠가 포함된 에이전트 작업이 아닙니다.', 'warning');
      return;
    }

    const videoTargets = agentResult.plan.shortVideoTargetPlatforms.filter(
      (platform): platform is 'instagram' | 'youtube' | 'tiktok' =>
        platform === 'instagram' || platform === 'youtube' || platform === 'tiktok'
    );
    const videoResult = agentResult.video
      ? {
          ...agentResult.video,
          status: agentResult.video.status || 'script-ready',
        }
      : undefined;

    window.localStorage.setItem(
      snapsShortsHandoffKey,
      JSON.stringify({
        sourceText: agentResult.plan.sourceText,
        durationSeconds: 45,
        scriptPlatform: agentResult.plan.shortVideoPlatform,
        targetPlatforms: videoTargets.length ? videoTargets : ['youtube'],
        scheduleType: agentResult.plan.scheduleType,
        publishDate: agentResult.plan.publishDateLocal || publishDate,
        videoResult,
        createdAt: new Date().toISOString(),
      })
    );
    toast.show('쇼츠 작업대로 보냈습니다.');
    router.push('/media');
  };

  const runAgentRecommendedAction = (action: SnapsAgentRecommendedAction) => {
    if (!action.enabled) {
      toast.show(action.detail || '먼저 막힌 입력을 해결하세요.', 'warning');
      return;
    }

    if (action.actionType === 'review-preview') {
      const firstVariant = result?.variants[0] || agentResult?.transform.variants[0];
      if (firstVariant) {
        setActivePlatform(firstVariant.platform);
      }
      toast.show('채널별 결과 영역에서 문안을 확인하세요.');
      return;
    }

    if (action.actionType === 'save-source') {
      void saveSource();
      return;
    }

    if (action.actionType === 'copy-brief') {
      void copyAgentBrief();
      return;
    }

    if (action.actionType === 'send-shorts') {
      sendAgentShortsToMedia();
      return;
    }

    if (action.actionType === 'create-drafts') {
      void createDrafts();
      return;
    }

    if (action.actionType === 'resolve-inputs') {
      toast.show(
        agentReadinessSummary?.missingInputs.length
          ? `확인 필요: ${agentReadinessSummary.missingInputs.join(', ')}`
          : action.detail,
        'warning'
      );
      return;
    }

    toast.show('게시 후 댓글/성과를 받은 반응함과 보고서에서 확인하세요.');
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
          operatorConfirmed: scheduleType === 'schedule',
          ...(publishDateIso ? { publishDate: publishDateIso } : {}),
          integrations: integrationsToUse,
        }),
      });

      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }

      const queued = await response.json();
      await loadActivity();
      if (showSnapsScheduleResult(scheduleType === 'schedule' ? 'snaps 예약' : 'snaps 초안', queued)) {
        router.push('/launches?display=list');
      }
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

  const runViralCoach = async () => {
    const variant = activeVariant;
    const contentToScore = variant?.content || sourceText;
    if (!contentToScore || contentToScore.trim().length < 10) {
      toast.show('점수화할 초안이나 원문을 입력하세요.', 'warning');
      return;
    }

    setCoachLoading(true);
    try {
      const response = await snapsFetch('/snaps/coach/viral', {
        method: 'POST',
        body: JSON.stringify({
          platform: variant?.platform || coachPlatform,
          title: variant?.title || sourceTopic,
          content: contentToScore,
          sourceText,
          visualDescription: coachVisualDescription,
          targetAudience: coachTargetAudience,
          hashtags: variant?.hashtags || [],
          durationSeconds: 30,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const scorecard = (await response.json()) as SnapsViralCoachScorecard;
      setCoachResult(scorecard);
      setCoachPlatform(scorecard.platform);
      await loadActivity();
      toast.show('AI 바이럴 코치 점수표를 만들었습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : 'AI 바이럴 코치 실행에 실패했습니다.',
        'warning'
      );
    } finally {
      setCoachLoading(false);
    }
  };

  const applyCoachHook = (hook: string) => {
    if (!activeVariant) {
      setSourceText((current) => [hook, current].filter(Boolean).join('\n\n'));
      toast.show('원문 앞에 훅을 붙였습니다.');
      return;
    }

    const currentLines = activeVariant.content
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const body = currentLines.slice(1).join('\n\n') || activeVariant.content;
    updateVariant(activeVariant.platform, {
      content: [hook, body].filter(Boolean).join('\n\n'),
    });
    toast.show('선택한 초안에 훅을 적용했습니다.');
  };

  const buildVariationPayload = () => {
    const variant = activeVariant;
    return {
      sourceText: variant?.content || sourceText,
      title: variant?.title || sourceTitle || sourceTopic || 'snaps 실험 초안',
      topic: sourceTopic || variant?.title || sourceTitle,
      tone,
      audience: variationAudience,
      cta: variationCta,
      targetPlatforms: selectedPlatforms,
      variantCount: Number(variationCount) || 5,
      goal: variationGoal,
      competitorHook: variationCompetitorHook,
      tags: [sourceTopic, variationGoal].filter(Boolean),
    };
  };

  const previewVariationLab = async () => {
    const payload = buildVariationPayload();
    if (!String(payload.sourceText || '').trim()) {
      toast.show('실험할 원문이나 변환 결과를 먼저 준비하세요.', 'warning');
      return;
    }

    setVariationLoading(true);
    try {
      const response = await snapsFetch('/snaps/experiments/variations/preview', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const preview = (await response.json()) as SnapsPostVariationPreview;
      setVariationPreview(preview);
      await loadActivity();
      toast.show(`포스트 실험 후보 ${preview.totalVariants}개를 만들었습니다.`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '포스트 실험 미리보기에 실패했습니다.',
        'warning'
      );
    } finally {
      setVariationLoading(false);
    }
  };

  const importVariationSources = async () => {
    const payload = buildVariationPayload();
    if (!String(payload.sourceText || '').trim()) {
      toast.show('실험할 원문이나 변환 결과를 먼저 준비하세요.', 'warning');
      return;
    }
    if (!confirmOperatorAction('포스트 실험 후보를 원문 라이브러리에 병합할까요?')) {
      return;
    }

    setVariationLoading(true);
    try {
      const response = await snapsFetch('/snaps/experiments/variations/import-sources', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const imported = (await response.json()) as SnapsPostVariationPreview & {
        imported?: { imported?: number; total?: number };
      };
      setVariationPreview(imported);
      await Promise.all([loadSourceLibrary(), loadActivity()]);
      toast.show(`실험 후보 가져오기 완료: ${imported.imported?.imported || 0}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '포스트 실험 후보 가져오기에 실패했습니다.',
        'warning'
      );
    } finally {
      setVariationLoading(false);
    }
  };

  const createVariationQueue = async () => {
    const payload = buildVariationPayload();
    if (!String(payload.sourceText || '').trim()) {
      toast.show('실험할 원문이나 변환 결과를 먼저 준비하세요.', 'warning');
      return;
    }

    const items = variationPreview?.items.filter((item) => item.status !== 'needs-review') || [];
    const platforms = [
      ...new Set(
        (items.length ? items : [{ platform: activeVariant?.platform || selectedPlatforms[0] }])
          .map((item) => item.platform)
          .filter(Boolean)
      ),
    ];
    const integrationsToUse = platforms
      .map((platform) => ({
        platform,
        integrationId: connectedByPlatform[platform]?.id,
      }))
      .filter((item) => item.integrationId);

    if (!integrationsToUse.length) {
      toast.show('실험 후보를 큐로 만들 연결 발행 채널이 없습니다.', 'warning');
      return;
    }

    let publishDateIso: string | undefined;
    if (scheduleType === 'schedule' && publishDate) {
      const parsedPublishDate = new Date(publishDate);
      if (Number.isNaN(parsedPublishDate.getTime())) {
        toast.show('예약 시간을 확인하세요.', 'warning');
        return;
      }
      publishDateIso = parsedPublishDate.toISOString();
    }

    if (
      scheduleType === 'schedule' &&
      !confirmOperatorAction(
        `실험 후보를 연결된 채널 ${integrationsToUse.length}개에 예약 큐로 만들까요?`
      )
    ) {
      return;
    }

    setVariationLoading(true);
    try {
      const response = await snapsFetch('/snaps/experiments/variations/schedule', {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          scheduleType,
          operatorConfirmed: scheduleType === 'schedule',
          ...(publishDateIso ? { publishDate: publishDateIso } : {}),
          integrations: integrationsToUse,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const queued = (await response.json()) as {
        preview?: SnapsPostVariationPreview;
        scheduled?: unknown[];
      };
      if (queued.preview) {
        setVariationPreview(queued.preview);
      }
      await loadActivity();
      if (showSnapsScheduleResult('실험 후보 큐', queued)) {
        router.push('/launches?display=list');
      }
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '포스트 실험 큐 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setVariationLoading(false);
    }
  };

  const applyVariationItem = (item: SnapsPostVariationItem) => {
    const content = [item.hook, item.caption, item.cta].filter(Boolean).join('\n\n');
    if (result?.variants.some((variant) => variant.platform === item.platform)) {
      updateVariant(item.platform, {
        title: item.title,
        content,
        hashtags: item.hashtags,
      });
      setActivePlatform(item.platform);
      toast.show('선택한 실험 후보를 변환 결과에 적용했습니다.');
      return;
    }

    setSourceTitle(item.title);
    setSourceTopic(item.angle);
    setSourceText(content);
    setSelectedPlatforms([item.platform]);
    toast.show('선택한 실험 후보를 원문 편집기에 적용했습니다.');
  };

  const submitApprovalRequest = async () => {
    if (!result?.variants.length) {
      toast.show('먼저 변환 결과를 생성하세요.', 'warning');
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

    setApprovalLoading(true);
    try {
      const response = await snapsFetch('/snaps/approvals', {
        method: 'POST',
        body: JSON.stringify({
          title: approvalTitle || sourceTitle || sourceTopic || 'snaps 승인 요청',
          variants: result.variants,
          requestedBy: 'snaps operator',
          reviewer: approvalReviewer,
          note: approvalNote,
          publishDate: publishDateIso,
          scheduleType,
          source: 'snaps-studio-transform',
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const approval = (await response.json()) as SnapsApprovalItem;
      setActiveApprovalId(approval.id);
      await Promise.all([loadApprovalRequests(), loadActivity()]);
      toast.show('승인 요청을 만들었습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '승인 요청 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setApprovalLoading(false);
    }
  };

  const reviewApprovalRequest = async (
    decision: 'approve' | 'request-changes' | 'reject' | 'reopen'
  ) => {
    const approvalId = activeApproval?.id || activeApprovalId;
    if (!approvalId) {
      toast.show('검토할 승인 요청을 선택하세요.', 'warning');
      return;
    }

    setApprovalLoading(true);
    try {
      const response = await snapsFetch(`/snaps/approvals/${approvalId}/review`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          reviewer: approvalReviewer,
          note: approvalNote,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      await Promise.all([loadApprovalRequests(), loadActivity()]);
      toast.show(
        decision === 'approve'
          ? '승인 완료했습니다.'
          : decision === 'request-changes'
            ? '수정 요청으로 되돌렸습니다.'
            : decision === 'reject'
              ? '승인 요청을 반려했습니다.'
              : '승인 요청을 다시 열었습니다.'
      );
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '승인 검토에 실패했습니다.',
        'warning'
      );
    } finally {
      setApprovalLoading(false);
    }
  };

  const createApprovalPublicLink = async () => {
    const approvalId = activeApproval?.id || activeApprovalId;
    if (!approvalId) {
      toast.show('공개 링크를 만들 승인 요청을 선택하세요.', 'warning');
      return;
    }

    setApprovalLoading(true);
    try {
      const response = await snapsFetch(
        `/snaps/approvals/${approvalId}/public-link`,
        {
          method: 'POST',
          body: JSON.stringify({
            reviewer: approvalReviewer,
            note: approvalNote,
            allowDecision: true,
            expiresInDays: 14,
          }),
        }
      );
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const link = (await response.json()) as SnapsApprovalPublicLink;
      setApprovalPublicLink(link);
      setActiveApprovalId(link.approval.id);
      let copied = false;
      try {
        await navigator.clipboard?.writeText?.(link.publicReviewUrl);
        copied = true;
      } catch {
        // Clipboard permission is browser-dependent; the link is rendered below.
      }
      await Promise.all([loadApprovalRequests(), loadActivity()]);
      toast.show(
        copied ? '공개 승인 링크를 복사했습니다.' : '공개 승인 링크를 생성했습니다.'
      );
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '공개 승인 링크 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setApprovalLoading(false);
    }
  };

  const revokeApprovalPublicLink = async () => {
    const approvalId = activeApproval?.id || activeApprovalId;
    if (!approvalId) {
      toast.show('링크를 폐기할 승인 요청을 선택하세요.', 'warning');
      return;
    }

    setApprovalLoading(true);
    try {
      const response = await snapsFetch(
        `/snaps/approvals/${approvalId}/public-link`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const result = (await response.json()) as { revoked: boolean };
      setApprovalPublicLink(null);
      await Promise.all([loadApprovalRequests(), loadActivity()]);
      toast.show(
        result.revoked
          ? '외부 승인 링크를 폐기했습니다. 기존 링크는 더 이상 열리지 않습니다.'
          : '폐기할 외부 승인 링크가 없습니다.'
      );
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '외부 승인 링크 폐기에 실패했습니다.',
        'warning'
      );
    } finally {
      setApprovalLoading(false);
    }
  };

  const addApprovalComment = async () => {
    const approvalId = activeApproval?.id || activeApprovalId;
    const message = approvalCommentText.trim();
    if (!approvalId) {
      toast.show('코멘트를 남길 승인 요청을 선택하세요.', 'warning');
      return;
    }
    if (!message) {
      toast.show('승인 코멘트를 입력하세요.', 'warning');
      return;
    }

    setApprovalLoading(true);
    try {
      const response = await snapsFetch(`/snaps/approvals/${approvalId}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          actor: approvalCommentActor || approvalReviewer || 'snaps operator',
          message,
          visibility: approvalCommentVisibility,
          ...(approvalCommentSelection
            ? { selection: approvalCommentSelection }
            : {}),
          ...(activeApproval?.variants[0]?.platform
            ? {
                variantPlatform: activeApproval.variants[0].platform,
                variantIndex: 0,
              }
            : {}),
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      await Promise.all([loadApprovalRequests(), loadActivity()]);
      toast.show('승인 코멘트를 추가했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '승인 코멘트 추가에 실패했습니다.',
        'warning'
      );
    } finally {
      setApprovalLoading(false);
    }
  };

  const resolveApprovalComment = async (commentId: string, resolved: boolean) => {
    const approvalId = activeApproval?.id || activeApprovalId;
    if (!approvalId) {
      toast.show('코멘트를 처리할 승인 요청을 선택하세요.', 'warning');
      return;
    }

    setApprovalLoading(true);
    try {
      const response = await snapsFetch(
        `/snaps/approvals/${approvalId}/comments/${commentId}/resolve`,
        {
          method: 'POST',
          body: JSON.stringify({
            resolved,
            actor: approvalCommentActor || approvalReviewer || 'snaps operator',
          }),
        }
      );
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      await Promise.all([loadApprovalRequests(), loadActivity()]);
      toast.show(resolved ? '승인 코멘트를 해결했습니다.' : '승인 코멘트를 다시 열었습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '승인 코멘트 처리에 실패했습니다.',
        'warning'
      );
    } finally {
      setApprovalLoading(false);
    }
  };

  const generateIdeas = async () => {
    setIdeaLoading(true);
    try {
      const response = await snapsFetch('/snaps/ideas/generate', {
        method: 'POST',
        body: JSON.stringify({
          topic: ideaTopic || sourceTopic,
          audience: ideaAudience,
          goal: ideaGoal,
          tone,
          targetPlatforms: selectedPlatforms,
          pillars: [sourceTopic, calendarCampaign, categoryCampaign].filter(Boolean),
          formats: ['text-post', 'carousel', 'short-video', 'thread'],
          cta: salesCta || '댓글로 파일럿이라고 남기면 샘플 캘린더를 보냅니다.',
          count: 6,
          sourceText,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const preview = (await response.json()) as SnapsIdeaPreview;
      setIdeaPreview(preview);
      toast.show(`아이디어 생성 완료: ${preview.totalIdeas}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '아이디어 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setIdeaLoading(false);
    }
  };

  const saveIdea = async (suggestion?: SnapsIdeaSuggestion) => {
    const title = suggestion?.title || ideaTitle;
    const body = suggestion?.body || ideaBody;
    if (!title.trim() && !body.trim()) {
      toast.show('저장할 아이디어를 입력하세요.', 'warning');
      return;
    }

    setIdeaLoading(true);
    try {
      const response = await snapsFetch('/snaps/ideas', {
        method: 'POST',
        body: JSON.stringify({
          title,
          body,
          group: suggestion?.group || ideaGroup,
          tags: suggestion?.tags || ideaTags.split(/[,\n|]+/).map((tag) => tag.trim()),
          targetPlatforms: suggestion?.targetPlatforms || selectedPlatforms,
          priority: suggestion?.priority || 'medium',
          source: suggestion ? 'snaps-idea-board-generator' : 'snaps-studio-manual',
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const saved = (await response.json()) as SnapsIdeaItem;
      setActiveIdeaId(saved.id);
      await Promise.all([loadIdeas(ideaStatus, ideaSearch), loadActivity()]);
      toast.show('아이디어를 저장했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '아이디어 저장에 실패했습니다.',
        'warning'
      );
    } finally {
      setIdeaLoading(false);
    }
  };

  const updateIdeaStatus = async (ideaId: string, status: SnapsIdeaStatus) => {
    setIdeaLoading(true);
    try {
      const response = await snapsFetch(`/snaps/ideas/${ideaId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      await Promise.all([loadIdeas(ideaStatus, ideaSearch), loadActivity()]);
      toast.show(`아이디어를 ${ideaStatusLabels[status]} 상태로 변경했습니다.`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '아이디어 상태 변경에 실패했습니다.',
        'warning'
      );
    } finally {
      setIdeaLoading(false);
    }
  };

  const promoteIdeaToSource = async (ideaId = activeIdea?.id || activeIdeaId) => {
    if (!ideaId) {
      toast.show('원문으로 바꿀 아이디어를 선택하세요.', 'warning');
      return;
    }
    setIdeaLoading(true);
    try {
      const response = await snapsFetch(`/snaps/ideas/${ideaId}/promote-to-source`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const promoted = (await response.json()) as {
        idea: SnapsIdeaItem;
        source: SnapsStoredSource;
      };
      setSourceText(promoted.source.sourceText);
      setSourceTitle(promoted.source.title || promoted.idea.title);
      setSourceTopic(promoted.source.topic || promoted.idea.group);
      await Promise.all([loadIdeas(ideaStatus, ideaSearch), loadSourceLibrary(), loadActivity()]);
      toast.show('아이디어를 원문 라이브러리로 보냈습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '아이디어 원문 승격에 실패했습니다.',
        'warning'
      );
    } finally {
      setIdeaLoading(false);
    }
  };

  const deleteIdea = async (ideaId = activeIdea?.id || activeIdeaId) => {
    if (!ideaId) {
      toast.show('삭제할 아이디어를 선택하세요.', 'warning');
      return;
    }
    if (!confirmDestructive('선택한 아이디어를 삭제할까요?')) {
      return;
    }
    setIdeaLoading(true);
    try {
      const response = await snapsFetch(`/snaps/ideas/${ideaId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      setActiveIdeaId('');
      await Promise.all([loadIdeas(ideaStatus, ideaSearch), loadActivity()]);
      toast.show('아이디어를 삭제했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '아이디어 삭제에 실패했습니다.',
        'warning'
      );
    } finally {
      setIdeaLoading(false);
    }
  };

  const brandKitPayload = () => ({
    name: brandKitName,
    audience: brandKitAudience,
    voice: brandKitVoice,
    tone: brandKitTone,
    values: brandKitValues.split(/[,\n|]+/).map((item) => item.trim()),
    requiredTerms: brandKitRequiredTerms.split(/[,\n|]+/).map((item) => item.trim()),
    bannedTerms: brandKitBannedTerms.split(/[,\n|]+/).map((item) => item.trim()),
    hashtags: brandKitHashtags.split(/[,\n|]+/).map((item) => item.trim()),
    cta: brandKitCta,
    colors: brandKitColors.split(/[,\n|]+/).map((item) => item.trim()),
    targetPlatforms: selectedPlatforms,
    examples: brandKitExamples.split(/\n+/).map((item) => item.trim()),
    websiteText: sourceText,
  });

  const analyzeBrandKit = async () => {
    setBrandKitLoading(true);
    try {
      const response = await snapsFetch('/snaps/brand-kits/analyze', {
        method: 'POST',
        body: JSON.stringify(brandKitPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const preview = (await response.json()) as SnapsBrandKitDraft;
      setBrandKitPreview(preview);
      setBrandKitName(preview.name);
      setBrandKitAudience(preview.audience);
      setBrandKitVoice(preview.voice);
      setBrandKitTone(preview.tone);
      setBrandKitValues(preview.values.join(', '));
      setBrandKitRequiredTerms(preview.requiredTerms.join(', '));
      setBrandKitBannedTerms(preview.bannedTerms.join(', '));
      setBrandKitHashtags(preview.hashtags.join(', '));
      setBrandKitCta(preview.cta);
      setBrandKitColors(preview.colors.join(', '));
      toast.show('브랜드 키트 가이드를 분석했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '브랜드 키트 분석에 실패했습니다.',
        'warning'
      );
    } finally {
      setBrandKitLoading(false);
    }
  };

  const saveBrandKit = async () => {
    if (!brandKitName.trim() && !brandKitVoice.trim() && !brandKitAudience.trim()) {
      toast.show('브랜드 이름, 대상, 보이스 중 하나는 입력하세요.', 'warning');
      return;
    }
    setBrandKitLoading(true);
    try {
      const response = await snapsFetch('/snaps/brand-kits', {
        method: 'POST',
        body: JSON.stringify(brandKitPreview || brandKitPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const saved = (await response.json()) as SnapsBrandKitItem;
      setActiveBrandKitId(saved.id);
      await Promise.all([loadBrandKits(), loadActivity()]);
      toast.show('브랜드 키트를 저장했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '브랜드 키트 저장에 실패했습니다.',
        'warning'
      );
    } finally {
      setBrandKitLoading(false);
    }
  };

  const applyBrandKit = async (brandKitId = activeBrandKit?.id || activeBrandKitId) => {
    if (!brandKitId) {
      toast.show('적용할 브랜드 키트를 선택하세요.', 'warning');
      return;
    }
    setBrandKitLoading(true);
    try {
      const response = await snapsFetch(`/snaps/brand-kits/${brandKitId}/apply`, {
        method: 'POST',
        body: JSON.stringify({
          sourceText,
          topic: sourceTopic,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const applied = (await response.json()) as SnapsBrandKitApplication;
      setBrandKitApplication(applied);
      setTone(applied.transformPatch.tone);
      setSourceTopic(applied.transformPatch.topic);
      setSelectedPlatforms(applied.transformPatch.targetPlatforms);
      setIdeaAudience(applied.brandKit.audience);
      setIdeaGoal(applied.brandKit.cta);
      setIdeaTags(applied.hashtagAppend.join(', '));
      setCoachVisualDescription(
        `${applied.brandKit.name} colors: ${applied.brandKit.colors.join(', ')}`
      );
      await loadActivity();
      toast.show('브랜드 키트를 현재 변환 폼에 적용했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '브랜드 키트 적용에 실패했습니다.',
        'warning'
      );
    } finally {
      setBrandKitLoading(false);
    }
  };

  const deleteBrandKit = async (brandKitId = activeBrandKit?.id || activeBrandKitId) => {
    if (!brandKitId) {
      toast.show('삭제할 브랜드 키트를 선택하세요.', 'warning');
      return;
    }
    if (!confirmDestructive('선택한 브랜드 키트를 삭제할까요?')) {
      return;
    }
    setBrandKitLoading(true);
    try {
      const response = await snapsFetch(`/snaps/brand-kits/${brandKitId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      setActiveBrandKitId('');
      await Promise.all([loadBrandKits(), loadActivity()]);
      toast.show('브랜드 키트를 삭제했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '브랜드 키트 삭제에 실패했습니다.',
        'warning'
      );
    } finally {
      setBrandKitLoading(false);
    }
  };

  const buildCreativeBriefPayload = () => ({
    sourceText: sourceText.trim() || carouselSourceText.trim() || mediaAssetCaption,
    title: sourceTitle || mediaAssetTitle,
    topic: sourceTopic || mediaAssetCampaign,
    campaign: mediaAssetCampaign,
    mediaType: creativeBriefMediaType,
    aspectRatio: creativeBriefAspectRatio,
    visualStyle: creativeBriefVisualStyle,
    brandColor: carouselBrandColor,
    accentColor: carouselAccentColor,
    cta: creativeBriefCta,
    targetPlatforms: selectedPlatforms,
    referenceUrls: [mediaAssetUrl, mediaAssetThumbnail].filter(Boolean),
    variants: result?.variants || [],
  });

  const applyCreativeBriefItemToMediaForm = (item: SnapsCreativeBriefItem) => {
    setMediaAssetTitle(item.title);
    setMediaAssetUrl(item.svgDataUrl);
    setMediaAssetThumbnail(item.svgDataUrl);
    setMediaAssetType(item.mediaType);
    setMediaAssetAltText(item.altText);
    setMediaAssetCaption(item.captionSeed);
    setMediaAssetCampaign(creativeBriefPreview?.campaign || mediaAssetCampaign);
    setMediaAssetTags(
      ['creative-brief', item.mediaType, item.aspectRatio, item.angle].join(', ')
    );
    setMediaAssetWidth(String(item.dimensions.width));
    setMediaAssetHeight(String(item.dimensions.height));
    setMediaAssetDuration('');
  };

  const previewCreativeBrief = async () => {
    const payload = buildCreativeBriefPayload();
    if (!payload.sourceText.trim() && !payload.title.trim()) {
      toast.show('디자인 브리프 원문이나 제목을 입력하세요.', 'warning');
      return;
    }
    setCreativeBriefLoading(true);
    try {
      const response = await snapsFetch('/snaps/creative-briefs/preview', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const preview = (await response.json()) as SnapsCreativeBriefPreview;
      setCreativeBriefPreview(preview);
      const firstItem = preview.items[0];
      if (firstItem) {
        applyCreativeBriefItemToMediaForm(firstItem);
      }
      toast.show(`크리에이티브 브리프 생성 완료: ${preview.items.length}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '크리에이티브 브리프 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setCreativeBriefLoading(false);
    }
  };

  const saveCreativeBriefMedia = async (itemId?: string) => {
    const payload = {
      ...buildCreativeBriefPayload(),
      itemId: itemId || creativeBriefPreview?.items[0]?.id,
    };
    if (!payload.sourceText.trim() && !payload.title.trim()) {
      toast.show('저장할 디자인 브리프를 먼저 입력하세요.', 'warning');
      return;
    }
    setCreativeBriefLoading(true);
    try {
      const response = await snapsFetch('/snaps/creative-briefs/save-media', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const saved = (await response.json()) as SnapsCreativeBriefSaveResult;
      setCreativeBriefPreview(saved.preview);
      setMediaAssetPreview(saved.asset);
      setActiveMediaAssetId(saved.asset.id);
      const selectedItem =
        saved.preview.items.find((item) => item.id === payload.itemId) ||
        saved.preview.items[0];
      if (selectedItem) {
        applyCreativeBriefItemToMediaForm(selectedItem);
      }
      await Promise.all([loadMediaAssets(), loadActivity()]);
      toast.show('브리프 썸네일을 미디어 라이브러리에 저장했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '브리프 미디어 저장에 실패했습니다.',
        'warning'
      );
    } finally {
      setCreativeBriefLoading(false);
    }
  };

  const mediaAssetPayload = () => ({
    title: mediaAssetTitle,
    url: mediaAssetUrl,
    thumbnail: mediaAssetThumbnail,
    mediaType: mediaAssetType,
    altText: mediaAssetAltText,
    caption: mediaAssetCaption,
    campaign: mediaAssetCampaign,
    tags: mediaAssetTags.split(/[,\n|]+/).map((item) => item.trim()),
    targetPlatforms: selectedPlatforms,
    width: Number(mediaAssetWidth) || undefined,
    height: Number(mediaAssetHeight) || undefined,
    durationSeconds: Number(mediaAssetDuration) || undefined,
  });

  const previewMediaAsset = async () => {
    if (!mediaAssetUrl.trim()) {
      toast.show('미디어 URL을 입력하세요.', 'warning');
      return;
    }
    setMediaAssetLoading(true);
    try {
      const response = await snapsFetch('/snaps/media-library/preview', {
        method: 'POST',
        body: JSON.stringify(mediaAssetPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const preview = (await response.json()) as SnapsMediaAssetDraft;
      setMediaAssetPreview(preview);
      setMediaAssetTitle(preview.title);
      setMediaAssetUrl(preview.url);
      setMediaAssetThumbnail(preview.thumbnail || '');
      setMediaAssetType(preview.mediaType);
      setMediaAssetAltText(preview.altText);
      setMediaAssetCaption(preview.caption);
      setMediaAssetCampaign(preview.campaign);
      setMediaAssetTags(preview.tags.join(', '));
      setMediaAssetWidth(preview.width ? String(preview.width) : '');
      setMediaAssetHeight(preview.height ? String(preview.height) : '');
      setMediaAssetDuration(preview.durationSeconds ? String(preview.durationSeconds) : '');
      toast.show('미디어 자산 적합성을 확인했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '미디어 자산 분석에 실패했습니다.',
        'warning'
      );
    } finally {
      setMediaAssetLoading(false);
    }
  };

  const saveMediaAsset = async () => {
    if (!mediaAssetUrl.trim()) {
      toast.show('저장할 미디어 URL을 입력하세요.', 'warning');
      return;
    }
    setMediaAssetLoading(true);
    try {
      const response = await snapsFetch('/snaps/media-library', {
        method: 'POST',
        body: JSON.stringify(mediaAssetPreview || mediaAssetPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const saved = (await response.json()) as SnapsMediaAssetItem;
      setActiveMediaAssetId(saved.id);
      await Promise.all([loadMediaAssets(), loadActivity()]);
      toast.show('미디어 자산을 저장했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '미디어 자산 저장에 실패했습니다.',
        'warning'
      );
    } finally {
      setMediaAssetLoading(false);
    }
  };

  const attachMediaAsset = async (assetId = activeMediaAsset?.id || activeMediaAssetId) => {
    if (!assetId) {
      toast.show('첨부할 미디어 자산을 선택하세요.', 'warning');
      return;
    }
    setMediaAssetLoading(true);
    try {
      const response = await snapsFetch(`/snaps/media-library/${assetId}/attach`, {
        method: 'POST',
        body: JSON.stringify({
          caption: mediaAssetCaption,
          topic: mediaAssetCampaign || sourceTopic,
          targetPlatforms: selectedPlatforms,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const attached = (await response.json()) as SnapsMediaAssetAttachResult;
      setMediaAssetAttachResult(attached);
      setResult(attached.transform);
      setActivePlatform(attached.transform.variants[0]?.platform || selectedPlatforms[0]);
      setSourceText(attached.asset.caption);
      setSourceTitle(attached.asset.title);
      setSourceTopic(attached.asset.campaign || sourceTopic);
      await Promise.all([loadMediaAssets(), loadActivity()]);
      toast.show('미디어 자산을 현재 변환 결과에 첨부했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '미디어 자산 첨부에 실패했습니다.',
        'warning'
      );
    } finally {
      setMediaAssetLoading(false);
    }
  };

  const createMediaAssetQueue = async (
    assetId = activeMediaAsset?.id || activeMediaAssetId
  ) => {
    if (!assetId) {
      toast.show('큐로 보낼 미디어 자산을 선택하세요.', 'warning');
      return;
    }

    const integrationsToUse = selectedPlatforms
      .map((platform) => ({
        platform,
        integrationId: connectedByPlatform[platform]?.id,
      }))
      .filter((item) => item.integrationId);
    if (!integrationsToUse.length) {
      toast.show('연결된 발행 채널이 없습니다.', 'warning');
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
      if (
        !confirmOperatorAction(
          `선택한 미디어 자산으로 연결 채널 ${integrationsToUse.length}개에 예약 게시물을 만들까요?`
        )
      ) {
        return;
      }
    }

    setMediaAssetLoading(true);
    try {
      const response = await snapsFetch(`/snaps/media-library/${assetId}/schedule`, {
        method: 'POST',
        body: JSON.stringify({
          caption: mediaAssetCaption,
          topic: mediaAssetCampaign || sourceTopic,
          targetPlatforms: selectedPlatforms,
          scheduleType,
          operatorConfirmed: scheduleType === 'schedule',
          ...(publishDateIso ? { publishDate: publishDateIso } : {}),
          integrations: integrationsToUse,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const queued = await response.json();
      setMediaAssetAttachResult(queued.preview);
      await Promise.all([loadMediaAssets(), loadActivity()]);
      if (
        showSnapsScheduleResult(
          scheduleType === 'schedule' ? '미디어 자산 예약' : '미디어 자산 초안',
          queued
        )
      ) {
        router.push('/launches?display=list');
      }
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '미디어 자산 큐 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setMediaAssetLoading(false);
    }
  };

  const deleteMediaAsset = async (assetId = activeMediaAsset?.id || activeMediaAssetId) => {
    if (!assetId) {
      toast.show('삭제할 미디어 자산을 선택하세요.', 'warning');
      return;
    }
    if (!confirmDestructive('선택한 미디어 자산을 삭제할까요?')) {
      return;
    }
    setMediaAssetLoading(true);
    try {
      const response = await snapsFetch(`/snaps/media-library/${assetId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      setActiveMediaAssetId('');
      await Promise.all([loadMediaAssets(), loadActivity()]);
      toast.show('미디어 자산을 삭제했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '미디어 자산 삭제에 실패했습니다.',
        'warning'
      );
    } finally {
      setMediaAssetLoading(false);
    }
  };

  const scheduleApprovedRequest = async () => {
    const approvalId = activeApproval?.id || activeApprovalId;
    if (!approvalId) {
      toast.show('큐로 보낼 승인 요청을 선택하세요.', 'warning');
      return;
    }
    if (activeApproval?.status !== 'approved') {
      toast.show('승인된 요청만 큐로 보낼 수 있습니다.', 'warning');
      return;
    }

    const integrationsToUse = activeApproval.variants
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
        `승인된 요청을 연결된 채널 ${integrationsToUse.length}개에 예약 생성할까요?`
      )
    ) {
      return;
    }

    setApprovalLoading(true);
    try {
      const response = await snapsFetch(`/snaps/approvals/${approvalId}/schedule`, {
        method: 'POST',
        body: JSON.stringify({
          scheduleType,
          operatorConfirmed: scheduleType === 'schedule',
          ...(publishDateIso ? { publishDate: publishDateIso } : {}),
          integrations: integrationsToUse,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const queued = await response.json();
      await Promise.all([loadApprovalRequests(), loadActivity()]);
      if (
        showSnapsScheduleResult(
          scheduleType === 'schedule' ? '승인 요청 예약' : '승인 요청 초안',
          queued
        )
      ) {
        router.push('/launches?display=list');
      }
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '승인 요청 큐 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setApprovalLoading(false);
    }
  };

  const deleteApprovalRequest = async () => {
    const approvalId = activeApproval?.id || activeApprovalId;
    if (!approvalId) {
      toast.show('삭제할 승인 요청을 선택하세요.', 'warning');
      return;
    }
    if (!confirmDestructive(`승인 요청 "${activeApproval?.title || approvalId}"을 삭제할까요?`)) {
      return;
    }

    setApprovalLoading(true);
    try {
      const response = await snapsFetch(`/snaps/approvals/${approvalId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      setActiveApprovalId('');
      await Promise.all([loadApprovalRequests(), loadActivity()]);
      toast.show('승인 요청을 삭제했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '승인 요청 삭제에 실패했습니다.',
        'warning'
      );
    } finally {
      setApprovalLoading(false);
    }
  };

  const loadBestScheduleTime = async () => {
    setBestTimeLoading(true);
    try {
      const bestTimePath = primaryScheduleIntegrationId
        ? `/snaps/schedule/best-time?integrationId=${encodeURIComponent(
            primaryScheduleIntegrationId
          )}`
        : '/snaps/schedule/best-time';
      const response = await snapsFetch(bestTimePath);
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }

      const recommendation = (await response.json()) as SnapsBestTimeRecommendation;
      if (!recommendation.recommendedDate) {
        throw new Error('추천 예약 시간을 계산하지 못했습니다.');
      }
      setBestTime(recommendation);
      setScheduleType('schedule');
      setPublishDate(
        recommendation.recommendedDateLocal ||
          recommendation.recommendedDate.slice(0, 16)
      );
      toast.show('추천 예약 시간을 적용했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error
          ? error.message
          : '추천 예약 시간을 불러오지 못했습니다.',
        'warning'
      );
    } finally {
      setBestTimeLoading(false);
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

  const buildResolverPayload = () => ({
    sourceType: resolverType,
    url: resolverUrl,
    text: resolverText,
    query: resolverQuery,
    customInstructions: resolverInstructions,
    defaultTone: tone,
    tags: selectedPlatforms,
  });

  const previewResolvedSource = async () => {
    setResolverLoading(true);
    try {
      const response = await snapsFetch('/snaps/source-resolver/preview', {
        method: 'POST',
        body: JSON.stringify(buildResolverPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const preview = (await response.json()) as SnapsSourceResolverPreview;
      setResolverPreview(preview);
      toast.show('외부 소스를 미리보기로 변환했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '소스 리졸버 미리보기에 실패했습니다.',
        'warning'
      );
    } finally {
      setResolverLoading(false);
    }
  };

  const importResolvedSource = async () => {
    setResolverLoading(true);
    try {
      const response = await snapsFetch('/snaps/source-resolver/import', {
        method: 'POST',
        body: JSON.stringify(buildResolverPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const imported = await response.json();
      const preview = imported.preview as SnapsSourceResolverPreview | undefined;
      if (preview) {
        setResolverPreview(preview);
        setSourceTitle(preview.title || sourceTitle);
        setSourceTopic(preview.topic || sourceTopic);
        setSourceText(preview.sourceText || sourceText);
      }
      await Promise.all([loadSourceLibrary(), loadActivity()]);
      toast.show(`리졸브한 원문 가져오기 완료: ${imported.imported?.imported || 0}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '소스 리졸버 가져오기에 실패했습니다.',
        'warning'
      );
    } finally {
      setResolverLoading(false);
    }
  };

  const useResolvedSourceInEditor = () => {
    if (!resolverPreview) {
      toast.show('먼저 소스 리졸버 미리보기를 실행하세요.', 'warning');
      return;
    }
    setSourceTitle(resolverPreview.title);
    setSourceTopic(resolverPreview.topic || resolverPreview.title);
    setSourceText(resolverPreview.sourceText);
    toast.show('리졸브한 원문을 편집기에 불러왔습니다.');
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

  const saveSalesCampaign = async () => {
    setSalesLoading(true);
    try {
      const response = await snapsFetch('/snaps/sales/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          title: salesCampaignTitle,
          destinationUrl: salesDestinationUrl,
          cta: salesCta,
          platform: salesPlatform,
          sourceId: activeSourceId || undefined,
          postId: reportPostIds
            .split(',')
            .map((item) => item.trim())
            .find(Boolean),
          tags: [sourceTopic, salesPlatform].filter(Boolean),
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }

      const campaign = (await response.json()) as SnapsSalesCampaign;
      setActiveSalesCampaignId(campaign.id);
      await Promise.all([loadSalesData(), loadActivity()]);
      toast.show('판매 링크 캠페인을 저장했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '판매 링크 저장에 실패했습니다.',
        'warning'
      );
    } finally {
      setSalesLoading(false);
    }
  };

  const recordSalesEvent = async (eventType: 'click' | 'lead' | 'purchase') => {
    const campaignId = activeSalesCampaign?.id || activeSalesCampaignId;
    if (!campaignId) {
      toast.show('먼저 판매 링크 캠페인을 만드세요.', 'warning');
      return;
    }

    setSalesLoading(true);
    try {
      const response = await snapsFetch('/snaps/sales/events', {
        method: 'POST',
        body: JSON.stringify({
          campaignId,
          eventType,
          platform: activeSalesCampaign?.platform || salesPlatform,
          postId: reportPostIds
            .split(',')
            .map((item) => item.trim())
            .find(Boolean),
          amount: eventType === 'purchase' ? Number(salesAmount || 0) : 0,
          currency: 'KRW',
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }

      await Promise.all([loadSalesData(), loadActivity()]);
      toast.show(
        eventType === 'purchase'
          ? '구매 이벤트를 기록했습니다.'
          : eventType === 'lead'
          ? '리드 이벤트를 기록했습니다.'
          : '클릭 이벤트를 기록했습니다.'
      );
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '판매 이벤트 기록에 실패했습니다.',
        'warning'
      );
    } finally {
      setSalesLoading(false);
    }
  };

  const generateSalesReport = async () => {
    setSalesLoading(true);
    try {
      const response = await snapsFetch('/snaps/sales/report', {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }

      const report = await response.json();
      setReportResult(report);
      setActiveReportId(report.reportId || '');
      await Promise.all([loadReportHistory(), loadSalesData(), loadActivity()]);
      toast.show('판매/매출 귀속 보고서를 생성했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '판매 보고서 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setSalesLoading(false);
    }
  };

  const generateSalesProposal = async () => {
    setSalesLoading(true);
    try {
      const response = await snapsFetch('/snaps/sales/proposal', {
        method: 'POST',
        body: JSON.stringify({
          leadName: salesLeadName,
          segment: salesProposalSegment,
          problem: sourceTopic
            ? `${sourceTopic} 원문을 반복 콘텐츠와 판매 CTA로 바꾸는 시간이 길다`
            : undefined,
          sourceAsset: activeSalesCampaign?.title || sourceTitle || salesCampaignTitle,
          pilotDays: Number(salesPilotDays || 14),
          targetRevenue: Number(salesTargetRevenue || 0),
          monthlyFee: 990000,
          setupFee: 300000,
          currency: 'KRW',
          packageName: `${salesPilotDays || 14}일 콘텐츠 매출 파일럿`,
          channels: [salesPlatform, 'threads', 'linkedin'],
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }

      const proposal = (await response.json()) as SnapsSalesProposal;
      setSalesProposal(proposal);
      await loadActivity();
      toast.show('파일럿 제안서를 생성했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '파일럿 제안서 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setSalesLoading(false);
    }
  };

  const deleteSalesCampaign = async () => {
    const campaignId = activeSalesCampaign?.id || activeSalesCampaignId;
    if (!campaignId) {
      toast.show('삭제할 판매 링크 캠페인을 선택하세요.', 'warning');
      return;
    }
    if (
      !confirmDestructive(
        `판매 링크 캠페인 "${activeSalesCampaign?.title || campaignId}"을 삭제할까요?`
      )
    ) {
      return;
    }

    setSalesLoading(true);
    try {
      const response = await snapsFetch(`/snaps/sales/campaigns/${campaignId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      setActiveSalesCampaignId('');
      await Promise.all([loadSalesData(), loadActivity()]);
      toast.show('판매 링크 캠페인을 삭제했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '판매 링크 삭제에 실패했습니다.',
        'warning'
      );
    } finally {
      setSalesLoading(false);
    }
  };

  const copyActiveSalesLink = async () => {
    const url = activeSalesCampaign?.trackingUrl;
    if (!url) {
      toast.show('복사할 판매 링크 캠페인을 선택하세요.', 'warning');
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.show('판매 추적 링크를 복사했습니다.');
  };

  const copyActiveSalesBioLink = async () => {
    const url = activeSalesCampaign?.linkInBioUrl;
    if (!url) {
      toast.show('복사할 바이오 페이지 캠페인을 선택하세요.', 'warning');
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.show('바이오 페이지 링크를 복사했습니다.');
  };

  const copyActiveSalesHubLink = async () => {
    if (!activeSalesHubUrl) {
      toast.show('복사할 바이오 허브 캠페인을 선택하세요.', 'warning');
      return;
    }
    await navigator.clipboard.writeText(activeSalesHubUrl);
    toast.show('바이오 허브 링크를 복사했습니다.');
  };

  const saveCompetitorProfile = async () => {
    setCompetitorLoading(true);
    try {
      const response = await snapsFetch('/snaps/competitors', {
        method: 'POST',
        body: JSON.stringify({
          name: competitorName,
          handle: competitorHandle,
          profileUrl: competitorProfileUrl,
          platform: competitorPlatform,
          niche: competitorNiche,
          tags: [competitorNiche, competitorPlatform].filter(Boolean),
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const profile = (await response.json()) as SnapsCompetitorProfile;
      setActiveCompetitorId(profile.id);
      await Promise.all([loadCompetitorData(), loadActivity()]);
      toast.show('경쟁 계정을 저장했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '경쟁 계정 저장에 실패했습니다.',
        'warning'
      );
    } finally {
      setCompetitorLoading(false);
    }
  };

  const recordCompetitorSnapshot = async () => {
    const competitorId = activeCompetitor?.id || activeCompetitorId;
    if (!competitorId) {
      toast.show('먼저 경쟁 계정을 추가하세요.', 'warning');
      return;
    }

    setCompetitorLoading(true);
    try {
      const response = await snapsFetch('/snaps/competitors/snapshots', {
        method: 'POST',
        body: JSON.stringify({
          competitorId,
          followers: Number(competitorFollowers || 0),
          followersGrowth: Number(competitorFollowersGrowth || 0),
          postsCount: Number(competitorPostsCount || 0),
          videosCount: Number(competitorVideosCount || 0),
          photosCount: Math.max(
            0,
            Number(competitorPostsCount || 0) - Number(competitorVideosCount || 0)
          ),
          engagement: Number(competitorEngagement || 0),
          engagementRate: Number(competitorEngagementRate || 0),
          topPosts: [
            {
              title: competitorTopPostTitle,
              format: Number(competitorVideosCount || 0) > 0 ? 'video' : 'photo',
              engagement: Number(competitorEngagement || 0),
              hook: competitorTopPostHook,
            },
          ],
          notes: competitorNiche,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      await Promise.all([loadCompetitorData(), loadActivity()]);
      toast.show('경쟁 계정 스냅샷을 기록했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '경쟁 스냅샷 기록에 실패했습니다.',
        'warning'
      );
    } finally {
      setCompetitorLoading(false);
    }
  };

  const buildCompetitorImportPayload = () => ({
    importText: competitorImportText,
    defaultPlatform: competitorPlatform,
    defaultNiche: competitorNiche,
    maxRows: 500,
  });

  const previewCompetitorImport = async () => {
    if (!competitorImportText.trim()) {
      toast.show('경쟁 데이터 CSV 또는 JSON을 붙여넣으세요.', 'warning');
      return;
    }

    setCompetitorLoading(true);
    try {
      const response = await snapsFetch('/snaps/competitors/import-preview', {
        method: 'POST',
        body: JSON.stringify(buildCompetitorImportPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const preview = (await response.json()) as SnapsCompetitorImportPreview;
      setCompetitorImportPreview(preview);
      toast.show(`경쟁 데이터 미리보기 완료: 사용 가능 ${preview.acceptedRows}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '경쟁 데이터 미리보기에 실패했습니다.',
        'warning'
      );
    } finally {
      setCompetitorLoading(false);
    }
  };

  const importCompetitorData = async () => {
    if (!competitorImportText.trim()) {
      toast.show('경쟁 데이터 CSV 또는 JSON을 붙여넣으세요.', 'warning');
      return;
    }

    setCompetitorLoading(true);
    try {
      const response = await snapsFetch('/snaps/competitors/import', {
        method: 'POST',
        body: JSON.stringify(buildCompetitorImportPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const imported = (await response.json()) as SnapsCompetitorImportPreview;
      setCompetitorImportPreview(imported);
      await Promise.all([loadCompetitorData(), loadActivity()]);
      toast.show(
        `경쟁 데이터 가져오기 완료: 계정 ${imported.imported?.profiles || 0}개, 스냅샷 ${imported.imported?.snapshots || 0}개`
      );
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '경쟁 데이터 가져오기에 실패했습니다.',
        'warning'
      );
    } finally {
      setCompetitorLoading(false);
    }
  };

  const generateCompetitorReport = async () => {
    setCompetitorLoading(true);
    try {
      const response = await snapsFetch('/snaps/competitors/report', {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const report = await response.json();
      setReportResult(report);
      setActiveReportId(report.reportId || '');
      await Promise.all([loadReportHistory(), loadCompetitorData(), loadActivity()]);
      toast.show('경쟁 계정 분석 보고서를 생성했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '경쟁 분석 보고서 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setCompetitorLoading(false);
    }
  };

  const deleteCompetitorProfile = async () => {
    const competitorId = activeCompetitor?.id || activeCompetitorId;
    if (!competitorId) {
      toast.show('삭제할 경쟁 계정을 선택하세요.', 'warning');
      return;
    }
    if (
      !confirmDestructive(
        `경쟁 계정 "${activeCompetitor?.name || competitorId}"을 삭제할까요?`
      )
    ) {
      return;
    }

    setCompetitorLoading(true);
    try {
      const response = await snapsFetch(`/snaps/competitors/${competitorId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      setActiveCompetitorId('');
      await Promise.all([loadCompetitorData(), loadActivity()]);
      toast.show('경쟁 계정을 삭제했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '경쟁 계정 삭제에 실패했습니다.',
        'warning'
      );
    } finally {
      setCompetitorLoading(false);
    }
  };

  const buildListeningPayload = () => ({
    title: listeningTitle,
    query: listeningQuery,
    keywords: listeningKeywords
      .split(/[,\n|]+/)
      .map((item) => item.trim())
      .filter(Boolean),
    excludeKeywords: listeningExcludeKeywords
      .split(/[,\n|]+/)
      .map((item) => item.trim())
      .filter(Boolean),
    importText: listeningImportText,
    campaign: listeningCampaign,
    tags: listeningTags
      .split(/[,\n|]+/)
      .map((item) => item.trim())
      .filter(Boolean),
    targetPlatforms: selectedPlatforms,
  });

  const previewListeningMonitor = async () => {
    if (!listeningImportText.trim() && !listeningKeywords.trim() && !listeningQuery.trim()) {
      toast.show('리스닝 키워드나 mention 데이터를 입력하세요.', 'warning');
      return;
    }

    setListeningLoading(true);
    try {
      const response = await snapsFetch('/snaps/listening/preview', {
        method: 'POST',
        body: JSON.stringify(buildListeningPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const preview = (await response.json()) as SnapsSocialListeningPreview;
      setListeningPreview(preview);
      setListeningTitle(preview.title);
      setListeningQuery(preview.query);
      setListeningKeywords(preview.keywords.join(', '));
      setListeningExcludeKeywords(preview.excludeKeywords.join(', '));
      toast.show(`리스닝 미리보기 완료: high-intent ${preview.highIntentItems}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '리스닝 미리보기에 실패했습니다.',
        'warning'
      );
    } finally {
      setListeningLoading(false);
    }
  };

  const saveListeningMonitor = async () => {
    if (!listeningTitle.trim() && !listeningQuery.trim() && !listeningKeywords.trim()) {
      toast.show('저장할 리스닝 모니터 이름이나 키워드를 입력하세요.', 'warning');
      return;
    }

    setListeningLoading(true);
    try {
      const response = await snapsFetch('/snaps/listening/monitors', {
        method: 'POST',
        body: JSON.stringify(buildListeningPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const saved = (await response.json()) as SnapsSocialListeningMonitor;
      setActiveListeningMonitorId(saved.id);
      await Promise.all([loadListeningMonitors(), loadActivity()]);
      toast.show('소셜 리스닝 모니터를 저장했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '리스닝 모니터 저장에 실패했습니다.',
        'warning'
      );
    } finally {
      setListeningLoading(false);
    }
  };

  const runListeningMonitor = async (
    monitorId = activeListeningMonitor?.id || activeListeningMonitorId
  ) => {
    if (!monitorId) {
      toast.show('실행할 리스닝 모니터를 선택하세요.', 'warning');
      return;
    }

    setListeningLoading(true);
    try {
      const response = await snapsFetch(`/snaps/listening/monitors/${monitorId}/run`, {
        method: 'POST',
        body: JSON.stringify(buildListeningPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const run = (await response.json()) as SnapsSocialListeningRunResult;
      setListeningRunResult(run);
      setListeningPreview(run.preview);
      await Promise.all([loadListeningMonitors(), loadActivity()]);
      toast.show(`리스닝 실행 완료: match ${run.preview.matchedItems}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '리스닝 실행에 실패했습니다.',
        'warning'
      );
    } finally {
      setListeningLoading(false);
    }
  };

  const promoteListeningToInbox = async (
    monitorId = activeListeningMonitor?.id || activeListeningMonitorId
  ) => {
    if (!monitorId) {
      toast.show('받은 반응함으로 보낼 리스닝 모니터를 선택하세요.', 'warning');
      return;
    }

    setListeningLoading(true);
    try {
      const response = await snapsFetch(
        `/snaps/listening/monitors/${monitorId}/promote-to-inbox`,
        {
          method: 'POST',
          body: JSON.stringify(buildListeningPayload()),
        }
      );
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const promoted = (await response.json()) as SnapsSocialListeningRunResult;
      setListeningRunResult(promoted);
      setListeningPreview(promoted.preview);
      setFeedbackResult(promoted.inbox || null);
      setFeedbackItemStatus('unread');
      await Promise.all([
        loadListeningMonitors(),
        loadFeedbackItems('unread', feedbackItemSearch),
        loadActivity(),
      ]);
      toast.show(`받은 반응함 승격 완료: ${promoted.inbox?.imported || 0}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '리스닝 mention 승격에 실패했습니다.',
        'warning'
      );
    } finally {
      setListeningLoading(false);
    }
  };

  const useListeningMonitor = (monitor: SnapsSocialListeningMonitor) => {
    setActiveListeningMonitorId(monitor.id);
    setListeningTitle(monitor.title);
    setListeningQuery(monitor.query);
    setListeningKeywords(monitor.keywords.join(', '));
    setListeningExcludeKeywords(monitor.excludeKeywords.join(', '));
    setListeningCampaign(monitor.campaign || listeningCampaign);
    setListeningTags(monitor.tags.join(', '));
    setSelectedPlatforms(
      monitor.targetPlatforms.length ? monitor.targetPlatforms : selectedPlatforms
    );
  };

  const deleteListeningMonitor = async (
    monitorId = activeListeningMonitor?.id || activeListeningMonitorId
  ) => {
    if (!monitorId) {
      toast.show('삭제할 리스닝 모니터를 선택하세요.', 'warning');
      return;
    }
    if (!confirmDestructive('선택한 리스닝 모니터를 삭제할까요?')) {
      return;
    }

    setListeningLoading(true);
    try {
      const response = await snapsFetch(`/snaps/listening/monitors/${monitorId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      setActiveListeningMonitorId('');
      await Promise.all([loadListeningMonitors(), loadActivity()]);
      toast.show('리스닝 모니터를 삭제했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '리스닝 모니터 삭제에 실패했습니다.',
        'warning'
      );
    } finally {
      setListeningLoading(false);
    }
  };

  const buildTrendRadarPayload = () => ({
    title: trendRadarTitle,
    industry: trendRadarIndustry,
    region: trendRadarRegion,
    windowDays: Number(trendRadarWindowDays) || 7,
    keywords: trendRadarKeywords
      .split(/[,\n|]+/)
      .map((item) => item.trim())
      .filter(Boolean),
    importText: trendRadarImportText,
    sourceText,
    targetPlatforms: selectedPlatforms,
    tone,
    listeningPreview: listeningRunResult?.preview || listeningPreview || undefined,
    competitorSummary: competitorSummary || undefined,
    hashtagTrackerPreview: hashtagTrackerPreview || undefined,
  });

  const previewTrendRadar = async () => {
    if (
      !trendRadarImportText.trim() &&
      !trendRadarKeywords.trim() &&
      !sourceText.trim() &&
      !listeningPreview &&
      !competitorSummary &&
      !hashtagTrackerPreview
    ) {
      toast.show('트렌드 레이더에 넣을 키워드, CSV, 리스닝, 경쟁, 해시태그 신호를 입력하세요.', 'warning');
      return;
    }

    setTrendRadarLoading(true);
    try {
      const response = await snapsFetch('/snaps/trends/radar/preview', {
        method: 'POST',
        body: JSON.stringify(buildTrendRadarPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const preview = (await response.json()) as SnapsTrendRadarPreview;
      setTrendRadarPreview(preview);
      setTrendRadarTitle(preview.title);
      setTrendRadarIndustry(preview.industry);
      setTrendRadarRegion(preview.region);
      setTrendRadarWindowDays(String(preview.windowDays));
      toast.show(`트렌드 레이더 분석 완료: ${preview.totalTrends}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '트렌드 레이더 분석에 실패했습니다.',
        'warning'
      );
    } finally {
      setTrendRadarLoading(false);
    }
  };

  const importTrendRadarSources = async () => {
    if (
      !trendRadarPreview &&
      !trendRadarImportText.trim() &&
      !trendRadarKeywords.trim() &&
      !sourceText.trim()
    ) {
      toast.show('원문으로 가져올 트렌드 레이더 입력을 먼저 준비하세요.', 'warning');
      return;
    }

    setTrendRadarLoading(true);
    try {
      const response = await snapsFetch('/snaps/trends/radar/import-sources', {
        method: 'POST',
        body: JSON.stringify(buildTrendRadarPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const imported = (await response.json()) as SnapsTrendRadarPreview;
      setTrendRadarPreview(imported);
      await Promise.all([loadSourceLibrary(), loadActivity()]);
      toast.show(`트렌드 아이디어 ${imported.imported?.imported || 0}개를 원문으로 가져왔습니다.`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '트렌드 아이디어 가져오기에 실패했습니다.',
        'warning'
      );
    } finally {
      setTrendRadarLoading(false);
    }
  };

  const applyTrendIdeaToEditor = (idea: SnapsTrendRadarContentIdea) => {
    setSourceText(idea.sourceText);
    setSourceTopic(idea.hook);
    setSelectedPlatforms([idea.platform]);
    toast.show('트렌드 아이디어를 편집기에 적용했습니다.');
  };

  /** Shows what the scheduler really created; returns false when nothing was. */
  const showSnapsScheduleResult = (label: string, response: unknown) => {
    const result = describeSnapsScheduleResult(label, response);
    toast.show(result.message, result.tone);
    return result.ok;
  };

  const buildPostPreviewPayload = () => ({
    content: activeVariant?.content || sourceText,
    title: activeVariant?.title || sourceTitle || sourceTopic,
    device: postPreviewDevice,
    targetPlatforms: selectedPlatforms,
    variants: result?.variants || [],
    linkUrl: postPreviewLinkUrl,
    linkTitle: postPreviewLinkTitle,
    linkDescription: postPreviewLinkDescription,
    linkImage: postPreviewLinkImage,
    altText: postPreviewAltText,
    imageDescription: postPreviewImageDescription,
    media: activeVariant?.media || [],
  });

  const previewPostCards = async () => {
    if (!result?.variants?.length && !sourceText.trim()) {
      toast.show('게시 전 미리보기에 사용할 변환 결과나 원문을 먼저 준비하세요.', 'warning');
      return;
    }

    setPostPreviewLoading(true);
    try {
      const response = await snapsFetch('/snaps/previews/post', {
        method: 'POST',
        body: JSON.stringify(buildPostPreviewPayload()),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const preview = (await response.json()) as SnapsPostPreviewSummary;
      setPostPreviewResult(preview);
      toast.show(`게시 전 미리보기 완료: ${preview.totalCards}개`);
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '게시 전 미리보기에 실패했습니다.',
        'warning'
      );
    } finally {
      setPostPreviewLoading(false);
    }
  };

  const applyPostPreviewCard = (card: SnapsPostPreviewCard) => {
    updateVariant(card.platform, {
      title: card.title,
      content: card.variant.content,
      hashtags: card.variant.hashtags,
    });
    setActivePlatform(card.platform);
    if (!postPreviewAltText && card.mediaPreview.altTextSuggestion) {
      setPostPreviewAltText(card.mediaPreview.altTextSuggestion);
    }
    toast.show(`${targetPlatformLabel(card.platform)} 미리보기 컷을 편집기에 반영했습니다.`);
  };

  const checkAdDisclosure = async () => {
    if (!result?.variants?.length && !sourceText.trim()) {
      toast.show('광고 표시를 검사할 변환 결과나 원문을 먼저 준비하세요.', 'warning');
      return;
    }

    const sendAt =
      scheduleType === 'schedule' && publishDate
        ? new Date(publishDate).toISOString()
        : undefined;
    setAdDisclosureLoading(true);
    try {
      const response = await snapsFetch('/snaps/compliance/ad-disclosure', {
        method: 'POST',
        body: JSON.stringify({
          variants: result?.variants || [],
          content: sourceText,
          title: sourceTitle || sourceTopic,
          targetPlatforms: selectedPlatforms,
          relationship: adRelationship,
          advertiser: adAdvertiser,
          mediaType: adMediaType,
          senderName: adSenderName,
          nightConsent: adNightConsent,
          sendAt,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      const checked = (await response.json()) as SnapsAdDisclosureSummary;
      setAdDisclosureResult(checked);
      toast.show(
        `광고 표시 검사: ${adGuardStatusLabel[checked.status]} · 차단 ${checked.blockers} · 검토 ${checked.warnings}`,
        checked.status === 'block' ? 'warning' : undefined
      );
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '광고 표시 검사에 실패했습니다.',
        'warning'
      );
    } finally {
      setAdDisclosureLoading(false);
    }
  };

  const applyAdDisclosureFix = (card: SnapsAdDisclosureCard) => {
    if (!result?.variants?.some((variant) => variant.platform === card.platform)) {
      setSourceText(card.fixedContent);
      toast.show('광고 표시 수정본을 원문에 반영했습니다.');
      return;
    }
    updateVariant(card.platform, {
      title: card.fixedTitle,
      content: card.fixedContent,
    });
    setActivePlatform(card.platform);
    toast.show(`${targetPlatformLabel(card.platform)} 광고 표시 수정본을 편집기에 반영했습니다.`);
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
      setFeedbackItemStatus('unread');
      await Promise.all([loadFeedbackItems('unread', feedbackItemSearch), loadActivity()]);
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

      setFeedbackItemStatus('unread');
      await Promise.all([loadFeedbackItems('unread', feedbackItemSearch), loadActivity()]);
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

  const previewInboxAssignments = async (fromText = false) => {
    setFeedbackLoading(true);
    try {
      const status =
        feedbackItemStatus === 'all' ? undefined : feedbackItemStatus;
      const response = await snapsFetch('/snaps/inbox/assignments/preview', {
        method: 'POST',
        body: JSON.stringify({
          items: fromText ? parseFeedbackItems() : undefined,
          status,
          search: fromText ? undefined : feedbackItemSearch.trim() || undefined,
          defaultSlaMinutes: Number(inboxAssignmentSlaMinutes) || 240,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      setInboxAssignmentPreview(await response.json());
      await loadActivity();
      toast.show('받은 반응 배정안을 생성했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '받은 반응 배정안 생성에 실패했습니다.',
        'warning'
      );
    } finally {
      setFeedbackLoading(false);
    }
  };

  const applyInboxAssignmentCase = (assignment: SnapsInboxAssignmentCase) => {
    if (assignment.postId) {
      setFeedbackReplyPostId(assignment.postId);
      setFeedbackReplyPlatformPostId(assignment.postId);
    }
    setFeedbackPostPlatform(assignment.platform);
    setFeedbackReplyText(
      [
        assignment.replyTemplateTitle
          ? `[${assignment.replyTemplateTitle}]`
          : '',
        assignment.action,
      ]
        .filter(Boolean)
        .join('\n')
    );
    toast.show('배정 케이스를 답글 준비 영역에 반영했습니다.');
  };

  const saveInboxAssignmentNote = async (assignment: SnapsInboxAssignmentCase) => {
    if (!assignment.author && !assignment.postId) {
      toast.show('메모를 저장할 작성자나 게시물 ID가 없습니다.', 'warning');
      return;
    }

    setFeedbackLoading(true);
    try {
      const response = await snapsFetch('/snaps/inbox/notes', {
        method: 'POST',
        body: JSON.stringify({
          platform: assignment.platform,
          author: assignment.author,
          postId: assignment.postId,
          note: [
            `${assignment.assigneeLabel} · ${inboxAssignmentPriorityLabels[assignment.priority]}`,
            assignment.action,
            ...assignment.rationale,
          ].join('\n'),
          tags: assignment.tags,
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      await response.json();
      await Promise.all([loadInboxNotes(), loadActivity()]);
      toast.show('배정 케이스를 고객 메모로 저장했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '배정 메모 저장에 실패했습니다.',
        'warning'
      );
    } finally {
      setFeedbackLoading(false);
    }
  };

  const saveReplyTemplate = async () => {
    if (!replyTemplateBody.trim()) {
      toast.show('저장 답변 본문을 입력하세요.', 'warning');
      return;
    }

    setFeedbackLoading(true);
    try {
      const response = await snapsFetch('/snaps/inbox/reply-templates', {
        method: 'POST',
        body: JSON.stringify({
          title: replyTemplateTitle.trim() || undefined,
          sentiment: replyTemplateSentiment || undefined,
          platform: replyTemplatePlatform || undefined,
          body: replyTemplateBody.trim(),
          cta: replyTemplateCta.trim() || undefined,
          tags: replyTemplateTags
            .split(/[\n,]/)
            .map((tag) => tag.trim())
            .filter(Boolean),
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      await response.json();
      await Promise.all([loadReplyTemplates(), loadActivity()]);
      toast.show('저장 답변 템플릿을 저장했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '저장 답변 템플릿 저장에 실패했습니다.',
        'warning'
      );
    } finally {
      setFeedbackLoading(false);
    }
  };

  const useReplyTemplate = (template: SnapsReplyTemplate) => {
    setFeedbackReplyText([template.body, template.cta].filter(Boolean).join('\n'));
    if (template.platform) {
      setFeedbackPostPlatform(template.platform);
    }
    toast.show('저장 답변을 답글 초안에 불러왔습니다.');
  };

  const deleteReplyTemplate = async (template: SnapsReplyTemplate) => {
    if (!confirmDestructive(`저장 답변 "${template.title}"을 삭제할까요?`)) {
      return;
    }

    setFeedbackLoading(true);
    try {
      const response = await snapsFetch(`/snaps/inbox/reply-templates/${template.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      await Promise.all([loadReplyTemplates(), loadActivity()]);
      toast.show('저장 답변 템플릿을 삭제했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '저장 답변 템플릿 삭제에 실패했습니다.',
        'warning'
      );
    } finally {
      setFeedbackLoading(false);
    }
  };

  const saveInboxNote = async () => {
    if (!inboxNoteText.trim()) {
      toast.show('고객 메모 내용을 입력하세요.', 'warning');
      return;
    }
    if (!inboxNoteAuthor.trim() && !inboxNotePostId.trim()) {
      toast.show('고객명 또는 게시물 ID를 입력하세요.', 'warning');
      return;
    }

    setFeedbackLoading(true);
    try {
      const response = await snapsFetch('/snaps/inbox/notes', {
        method: 'POST',
        body: JSON.stringify({
          platform: inboxNotePlatform || undefined,
          author: inboxNoteAuthor.trim() || undefined,
          postId: inboxNotePostId.trim() || undefined,
          note: inboxNoteText.trim(),
          tags: inboxNoteTags
            .split(/[\n,]/)
            .map((tag) => tag.trim())
            .filter(Boolean),
        }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      await response.json();
      await Promise.all([loadInboxNotes(), loadActivity()]);
      toast.show('고객 메모를 저장했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '고객 메모 저장에 실패했습니다.',
        'warning'
      );
    } finally {
      setFeedbackLoading(false);
    }
  };

  const useInboxNoteForReply = (note: SnapsInboxNote) => {
    if (note.postId) {
      setFeedbackReplyPostId(note.postId);
    }
    if (note.platform) {
      setFeedbackPostPlatform(note.platform);
    }
    toast.show('고객 메모의 대상 정보를 답글 입력에 반영했습니다.');
  };

  const useFeedbackItemForReply = (item: SnapsFeedbackItemView) => {
    if (item.postId) {
      setFeedbackReplyPostId(item.postId);
      setFeedbackReplyPlatformPostId(item.postId);
    }
    setFeedbackPostPlatform(item.platform);
    toast.show('받은 반응의 대상 정보를 답글 입력에 반영했습니다.');
  };

  const updateFeedbackItemStatus = async (
    itemId: string,
    status: SnapsFeedbackStatus
  ) => {
    setFeedbackLoading(true);
    try {
      const response = await snapsFetch(`/snaps/inbox/items/${itemId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      await response.json();
      await Promise.all([loadFeedbackItems(), loadActivity()]);
      toast.show(`받은 반응을 ${feedbackStatusLabels[status]} 상태로 변경했습니다.`);
    } catch (error) {
      toast.show(
        error instanceof Error
          ? error.message
          : '받은 반응 상태 변경에 실패했습니다.',
        'warning'
      );
    } finally {
      setFeedbackLoading(false);
    }
  };

  const deleteInboxNote = async (note: SnapsInboxNote) => {
    if (!confirmDestructive(`고객 메모 "${note.author || note.postId || note.id}"를 삭제할까요?`)) {
      return;
    }

    setFeedbackLoading(true);
    try {
      const response = await snapsFetch(`/snaps/inbox/notes/${note.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(await readSnapsError(response));
      }
      await Promise.all([loadInboxNotes(), loadActivity()]);
      toast.show('고객 메모를 삭제했습니다.');
    } catch (error) {
      toast.show(
        error instanceof Error ? error.message : '고객 메모 삭제에 실패했습니다.',
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
      setFeedbackItems([]);
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

  const isStudioSurface = surface === 'studio';
  const isAgentSurface = surface === 'agent';
  const isAnalyticsSurface = surface === 'analytics';

  const surfaceTitle = isAgentSurface
    ? 'snaps 에이전트 오더'
    : isAnalyticsSurface
    ? 'snaps 분석 리포트'
    : 'snaps 스튜디오 · 콘텐츠 변환';

  const surfaceDescription = isAgentSurface
    ? '오더, 준비도, 작업 히스토리를 한 번에 확인합니다.'
    : isAnalyticsSurface
    ? '게시 후 성과 보고서와 받은 반응을 정리합니다.'
    : '원문을 SNS별 초안 카드로 바꿉니다.';

  const studioFlow = [
    { step: '01', label: '원문', detail: '캠페인과 톤을 고정' },
    { step: '02', label: '채널', detail: 'SNS 문법을 선택' },
    { step: '03', label: '초안', detail: '카드별로 수정/복사' },
  ];

  return (
    <div className="flex-1 flex flex-col gap-[16px] text-newTextColor">
      <div className="flex flex-col gap-[6px]">
        <div className="text-[28px] font-[700]">{surfaceTitle}</div>
        <div className="text-[13px] text-textItemBlur">
          {surfaceDescription}
        </div>
      </div>

      {isStudioSurface && (
        <>
      <div className="grid grid-cols-3 maxMedia:grid-cols-1 gap-[10px]">
        {studioFlow.map((item) => (
          <div
            key={item.step}
            className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[14px]"
          >
            <div className="text-[11px] text-textItemBlur">{item.step}</div>
            <div className="mt-[6px] text-[15px] font-[800]">{item.label}</div>
            <div className="mt-[4px] text-[12px] text-textItemBlur">
              {item.detail}
            </div>
          </div>
        ))}
      </div>

      <section className="grid grid-cols-[minmax(0,1fr)_minmax(300px,0.72fr)] maxMedia:grid-cols-1 gap-[14px]">
        <div className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[18px] flex flex-col gap-[14px]">
          <div className="flex items-center justify-between gap-[10px]">
            <div>
              <div className="text-[16px] font-[700]">빠른 변환</div>
              <div className="text-[12px] text-textItemBlur mt-[3px]">
                입력, 채널 선택, 변환만 먼저 처리합니다.
              </div>
            </div>
            <div
              className={clsx(
                'text-[11px] px-[8px] py-[4px] rounded-[999px]',
                result?.provider === 'ollama'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-newBgLineColor text-textItemBlur'
              )}
            >
              {result ? `${result.provider} · ${result.model}` : '대기'}
            </div>
          </div>

          <div className="grid grid-cols-[1fr_160px] maxMedia:grid-cols-1 gap-[8px]">
            <input
              value={sourceTopic}
              onChange={(event) => setSourceTopic(event.target.value)}
              className="h-[40px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[12px] text-[12px]"
              placeholder="주제 / 캠페인"
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

          <textarea
            value={sourceText}
            onChange={(event) => setSourceText(event.target.value)}
            className="min-h-[210px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[14px] text-[14px] leading-[1.7]"
            placeholder="전환할 원문 콘텐츠를 붙여넣으세요."
          />

          <div className="flex flex-col gap-[8px]">
            <div className="flex items-center justify-between gap-[10px]">
              <div className="text-[13px] font-[700]">전환 채널</div>
              <div className="flex flex-wrap justify-end gap-[6px]">
                <button
                  type="button"
                  onClick={() => setSelectedPlatforms(['threads', 'instagram', 'naver-blog'])}
                  className="h-[28px] rounded-[8px] bg-btnSimple px-[9px] text-[11px] text-textItemBlur hover:text-newTextColor"
                >
                  기본
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPlatforms(['instagram', 'youtube', 'tiktok'])}
                  className="h-[28px] rounded-[8px] bg-btnSimple px-[9px] text-[11px] text-textItemBlur hover:text-newTextColor"
                >
                  숏폼
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPlatforms(['linkedin', 'naver-blog', 'kakao-talk'])}
                  className="h-[28px] rounded-[8px] bg-btnSimple px-[9px] text-[11px] text-textItemBlur hover:text-newTextColor"
                >
                  업무형
                </button>
              </div>
            </div>
            <div className="grid grid-cols-5 maxMedia:grid-cols-2 gap-[8px]">
              {targetPlatforms.map((platform) => {
                const selected = selectedPlatforms.includes(platform.id);
                const guide = platformGuides[platform.id];
                return (
                  <button
                    type="button"
                    key={platform.id}
                    onClick={() => togglePlatform(platform.id)}
                    className={clsx(
                      'min-h-[74px] rounded-[8px] border p-[9px] text-left transition-colors',
                      selected
                        ? 'bg-btnPrimary text-white border-btnPrimary'
                        : 'bg-newBgLineColor border-newBorder text-textItemBlur hover:text-newTextColor'
                    )}
                  >
                    <div className="text-[12px] font-[700]">{platform.label}</div>
                    <div className={clsx('mt-[5px] text-[11px] leading-[1.35]', selected ? 'text-white/80' : 'text-textItemBlur')}>
                      {guide.concept}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <details className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px]">
            <summary className="cursor-pointer text-[12px] font-[700]">
              세부 옵션
            </summary>
            <div className="mt-[10px] grid grid-cols-[1fr_auto] maxMedia:grid-cols-1 gap-[10px]">
              <input
                value={tone}
                onChange={(event) => setTone(event.target.value)}
                className="h-[40px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[12px] text-[12px]"
                placeholder="톤"
              />
              <label className="h-[40px] flex items-center gap-[8px] text-[12px] text-textItemBlur">
                <input
                  type="checkbox"
                  checked={useRag}
                  onChange={(event) => setUseRag(event.target.checked)}
                />
                RAG 스타일 예시
              </label>
            </div>
          </details>

          <div className="grid grid-cols-[1fr_150px] maxMedia:grid-cols-1 gap-[10px]">
            <Button
              loading={loading}
              onClick={transform}
              className="rounded-[8px] !h-[46px]"
            >
              AI 변환
            </Button>
            <Button
              secondary
              loading={drafting}
              onClick={createDrafts}
              className="rounded-[8px] !h-[46px]"
            >
              초안 생성
            </Button>
          </div>
        </div>

        <div className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[18px] flex flex-col gap-[14px] min-h-[520px]">
          <div className="flex items-center justify-between gap-[10px]">
            <div>
              <div className="text-[16px] font-[700]">결과 미리보기</div>
              <div className="text-[12px] text-textItemBlur mt-[3px]">
                채널 감각을 확인하고 바로 복사합니다.
              </div>
            </div>
            <div className="flex gap-[8px]">
              <button
                type="button"
                onClick={copyActive}
                disabled={!activeVariant}
                className="h-[34px] px-[12px] rounded-[8px] bg-btnSimple text-[12px] disabled:opacity-40"
              >
                복사
              </button>
              <button
                type="button"
                onClick={copyActiveMarkdown}
                disabled={!activeVariant}
                className="h-[34px] px-[12px] rounded-[8px] bg-btnSimple text-[12px] disabled:opacity-40"
              >
                MD
              </button>
            </div>
          </div>

          <div className="flex gap-[8px] overflow-x-auto pb-[4px]">
            {(result?.variants || []).map((variant) => (
              <button
                type="button"
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
            <div className="flex-1 rounded-[8px] border border-dashed border-newBorder bg-newBgLineColor flex items-center justify-center text-textItemBlur text-[14px] text-center px-[18px]">
              변환 결과가 여기에 표시됩니다.
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col gap-[12px]">
              <div className="grid grid-cols-3 gap-[8px] text-[11px]">
                <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[9px]">
                  <div className="text-textItemBlur">컨셉</div>
                  <div className="mt-[4px] font-[700]">
                    {platformGuides[activeVariant.platform].concept}
                  </div>
                </div>
                <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[9px]">
                  <div className="text-textItemBlur">작성 포인트</div>
                  <div className="mt-[4px] line-clamp-2">
                    {platformGuides[activeVariant.platform].cue}
                  </div>
                </div>
                <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[9px]">
                  <div className="text-textItemBlur">제약</div>
                  <div className="mt-[4px]">
                    {platformGuides[activeVariant.platform].limit}
                  </div>
                </div>
              </div>

              <input
                value={activeVariant.title || ''}
                onChange={(event) =>
                  updateVariant(activeVariant.platform, {
                    title: event.target.value,
                  })
                }
                className="h-[40px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[12px] text-[13px]"
                placeholder="제목"
              />
              <textarea
                value={activeVariant.content}
                onChange={(event) =>
                  updateVariant(activeVariant.platform, {
                    content: event.target.value,
                  })
                }
                className="flex-1 min-h-[230px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[14px] text-[14px] leading-[1.7]"
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
                className="h-[40px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[12px] text-[12px]"
                placeholder="#태그"
              />
              {!!activeVariant.notes?.length && (
                <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px] leading-[1.5] text-textItemBlur">
                  {activeVariant.notes[0]}
                </div>
              )}
            </div>
          )}

          {!!result?.warnings?.length && (
            <div className="rounded-[8px] border border-amber-500/30 bg-amber-500/10 p-[10px] text-[12px] text-amber-200">
              {result.warnings[0]}
            </div>
          )}
        </div>
      </section>
        </>
      )}

      <details
        open={!isStudioSurface}
        className={clsx(
          isStudioSurface
            ? 'bg-newBgColorInner border border-newBorder rounded-[8px] p-[14px]'
            : 'flex flex-col gap-[16px]'
        )}
      >
        <summary
          className={clsx(
            'cursor-pointer text-[13px] font-[700]',
            !isStudioSurface && 'hidden'
          )}
        >
          고급 편집 및 운영 도구
        </summary>
        <div
          className={clsx(
            'flex flex-col gap-[16px]',
            isStudioSurface ? 'mt-[14px]' : 'mt-0'
          )}
        >

      {isStudioSurface && (
      <div className="grid grid-cols-[1fr_auto] maxMedia:grid-cols-1 gap-[12px] bg-newBgColorInner border border-newBorder rounded-[8px] p-[14px]">
        <div className="grid grid-cols-6 maxMedia:grid-cols-2 gap-[10px] text-[12px]">
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
      )}

      {isAgentSurface && (
      <section className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[14px] flex flex-col gap-[12px]">
        <div className="flex items-center justify-between gap-[10px]">
          <div className="text-[16px] font-[700]">에이전트 오더</div>
          <div className="text-[11px] px-[8px] py-[4px] rounded-[999px] bg-amber-500/15 text-amber-200">
            컨펌 전 게시 차단
          </div>
        </div>
        <div className="flex flex-wrap gap-[6px]">
          {agentCommandTemplates.map((template) => (
            <button
              type="button"
              key={template.label}
              onClick={() => setAgentCommand(template.command)}
              className="h-[30px] rounded-[8px] bg-btnSimple px-[10px] text-[11px] text-textItemBlur hover:text-newTextColor"
            >
              {template.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_132px] maxMedia:grid-cols-1 gap-[8px]">
          <textarea
            value={agentCommand}
            onChange={(event) => setAgentCommand(event.target.value)}
            className="min-h-[84px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[12px] text-[13px] leading-[1.6]"
            placeholder="내일 10시에 인공지능 관련 게시글 작성해서 인스타, 스레드, 링크드인에 올려줘."
          />
          <Button
            loading={agentLoading}
            onClick={() => prepareAgentCommand()}
            className="rounded-[8px] !h-[42px] self-start"
          >
            작업 준비
          </Button>
        </div>
        {agentResult && (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(240px,0.65fr)] maxMedia:grid-cols-1 gap-[10px]">
            <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px]">
              <div className="text-[12px] text-textItemBlur">실행 대상</div>
              <div className="mt-[6px] flex flex-wrap gap-[6px] text-[12px]">
                {agentResult.plan.targetPlatforms.map((platform) => (
                  <span key={platform} className="rounded-[999px] bg-btnSimple px-[8px] py-[5px]">
                    {targetPlatformLabel(platform)}
                  </span>
                ))}
              </div>
              <div className="mt-[10px] text-[12px] leading-[1.5] text-textItemBlur">
                {agentResult.plan.scheduleType === 'schedule'
                  ? `예약 예정: ${agentResult.plan.publishDateLocal || agentResult.plan.publishDate || '시간 미정'}`
                  : '초안으로 준비됨'}
                {agentResult.plan.includeShortVideo
                  ? ` · 쇼츠: ${agentResult.plan.shortVideoTargetPlatforms.join(', ')} / ${
                      agentResult.video?.status || 'script-ready'
                    }`
                  : ''}
              </div>
            </div>
            <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px]">
              <div className="text-[12px] text-textItemBlur">체크포인트</div>
              <div className="mt-[8px] flex flex-col gap-[6px]">
                {(agentResult.plan.executionPlan || []).slice(0, 4).map((step) => (
                  <div key={`${step.label}-${step.detail}`} className="text-[12px] leading-[1.45]">
                    <span className={step.status === 'needs-confirmation' ? 'text-amber-200' : 'text-emerald-300'}>
                      {step.status === 'needs-confirmation' ? '확인' : '준비'}
                    </span>
                    <span className="mx-[6px] text-textItemBlur">/</span>
                    <span>{step.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="col-span-2 maxMedia:col-span-1 rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px] flex flex-col gap-[12px]">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] maxMedia:grid-cols-1 gap-[10px]">
                <div>
                  <div className="text-[12px] font-[700]">작업자 브리핑</div>
                  <div className="mt-[7px] flex flex-col gap-[5px] text-[12px] leading-[1.5] text-textItemBlur">
                    {(agentResult.plan.operatorSummary || [
                      agentResult.operation.headline,
                    ])
                      .slice(0, 4)
                      .map((item) => (
                        <div key={item}>{item}</div>
                      ))}
                  </div>
                </div>
                <div className="flex flex-wrap justify-end content-start gap-[6px]">
                  <Button
                    secondary
                    loading={savingSource}
                    onClick={saveSource}
                    className="rounded-[8px] !h-[34px]"
                  >
                    원문 저장
                  </Button>
                  <Button
                    secondary
                    onClick={copyAgentBrief}
                    className="rounded-[8px] !h-[34px]"
                  >
                    브리프 복사
                  </Button>
                  {agentResult.plan.includeShortVideo && (
                    <Button
                      secondary
                      onClick={sendAgentShortsToMedia}
                      className="rounded-[8px] !h-[34px]"
                    >
                      쇼츠 작업
                    </Button>
                  )}
                  <Button
                    loading={drafting}
                    onClick={createDrafts}
                    className="rounded-[8px] !h-[34px]"
                  >
                    {scheduleType === 'schedule' ? '예약 생성' : '초안 생성'}
                  </Button>
                </div>
              </div>
              {agentReadinessSummary && (
                <div className="grid grid-cols-4 maxMedia:grid-cols-2 gap-[8px]">
                  <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[9px] text-[11px]">
                    <div className="text-textItemBlur">연결 채널</div>
                    <div className="mt-[4px] text-[15px] font-[700]">
                      {agentReadinessSummary.connectedCount}/
                      {agentReadinessSummary.schedulableCount}
                    </div>
                  </div>
                  <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[9px] text-[11px]">
                    <div className="text-textItemBlur">수동 보조</div>
                    <div className="mt-[4px] line-clamp-2">
                      {agentReadinessSummary.manualPlatforms.length
                        ? agentReadinessSummary.manualPlatforms.join(', ')
                        : '없음'}
                    </div>
                  </div>
                  <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[9px] text-[11px]">
                    <div className="text-textItemBlur">확인 필요</div>
                    <div
                      className={clsx(
                        'mt-[4px] line-clamp-2',
                        agentReadinessSummary.missingInputs.length
                          ? 'text-amber-200'
                          : 'text-emerald-300'
                      )}
                    >
                      {agentReadinessSummary.missingInputs.length
                        ? agentReadinessSummary.missingInputs.slice(0, 3).join(', ')
                        : '없음'}
                    </div>
                  </div>
                  <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[9px] text-[11px]">
                    <div className="text-textItemBlur">주의 카드</div>
                    <div className="mt-[4px] text-[15px] font-[700]">
                      {agentReadinessSummary.attentionCount}
                    </div>
                  </div>
                </div>
              )}
              {(agentResult.operation.readiness ||
                !!agentResult.operation.recommendedActions?.length) && (
                <div className="grid grid-cols-[220px_1fr] maxMedia:grid-cols-1 gap-[8px]">
                  {agentResult.operation.readiness && (
                    <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px]">
                      <div className="flex items-center justify-between gap-[8px]">
                        <div className="text-[11px] text-textItemBlur">실행 준비도</div>
                        <div
                          className={clsx(
                            'text-[11px]',
                            agentResult.operation.readiness.level === 'ready'
                              ? 'text-emerald-300'
                              : agentResult.operation.readiness.level === 'needs-input'
                              ? 'text-red-300'
                              : 'text-amber-200'
                          )}
                        >
                          {agentResult.operation.readiness.level === 'ready'
                            ? '준비'
                            : agentResult.operation.readiness.level === 'needs-input'
                            ? '입력 필요'
                            : '검토 필요'}
                        </div>
                      </div>
                      <div className="mt-[7px] text-[28px] font-[800] leading-none">
                        {agentResult.operation.readiness.score}
                      </div>
                      <div className="mt-[7px] text-[11px] leading-[1.45] text-textItemBlur">
                        {agentResult.operation.readiness.summary}
                      </div>
                    </div>
                  )}
                  <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px]">
                    <div className="flex items-center justify-between gap-[8px]">
                      <div className="text-[11px] font-[700]">추천 액션</div>
                      <div className="text-[10px] text-textItemBlur">
                        우선순위 자동 정렬
                      </div>
                    </div>
                    <div className="mt-[8px] grid grid-cols-3 maxMedia:grid-cols-1 gap-[6px]">
                      {(agentResult.operation.recommendedActions || [])
                        .slice()
                        .sort((left, right) => {
                          const rank = { high: 0, medium: 1, low: 2 };
                          return rank[left.priority] - rank[right.priority];
                        })
                        .slice(0, 6)
                        .map((action) => (
                          <button
                            key={action.id}
                            type="button"
                            onClick={() => runAgentRecommendedAction(action)}
                            className={clsx(
                              'min-h-[52px] rounded-[8px] border px-[9px] py-[8px] text-left text-[11px] leading-[1.35]',
                              action.enabled
                                ? action.priority === 'high'
                                  ? 'border-btnPrimary bg-btnPrimary/15 text-newTextColor'
                                  : 'border-newBorder bg-btnSimple text-newTextColor'
                                : 'border-newBorder bg-newBgLineColor text-textItemBlur opacity-60'
                            )}
                          >
                            <div className="font-[700]">{action.label}</div>
                            <div className="mt-[3px] line-clamp-2 text-textItemBlur">
                              {action.detail}
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              )}
              {!!agentResult.operation.qualityGates?.length && (
                <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px]">
                  <div className="flex items-center justify-between gap-[8px]">
                    <div className="text-[11px] font-[700]">품질 게이트</div>
                    <div className="text-[10px] text-textItemBlur">
                      차단 {agentReadinessSummary?.blockerCount || 0} · 경고{' '}
                      {agentReadinessSummary?.warningCount || 0}
                    </div>
                  </div>
                  <div className="mt-[8px] grid grid-cols-3 maxMedia:grid-cols-1 gap-[6px]">
                    {agentResult.operation.qualityGates.slice(0, 6).map((gate) => (
                      <div
                        key={`${gate.id}-${gate.platform || gate.label}`}
                        className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[9px] text-[11px] leading-[1.45]"
                      >
                        <div className="flex items-center justify-between gap-[6px]">
                          <span className="font-[700]">{gate.label}</span>
                          <span
                            className={clsx(
                              gate.severity === 'blocker'
                                ? 'text-red-300'
                                : gate.severity === 'warning'
                                ? 'text-amber-200'
                                : 'text-sky-200'
                            )}
                          >
                            {gate.severity === 'blocker'
                              ? '차단'
                              : gate.severity === 'warning'
                              ? '경고'
                              : '정보'}
                          </span>
                        </div>
                        <div className="mt-[5px] text-textItemBlur">{gate.detail}</div>
                        <div className="mt-[5px] text-textItemBlur">
                          {gate.fixAction}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!!agentReadinessSummary?.confirmationItems.length && (
                <div className="grid grid-cols-5 maxMedia:grid-cols-1 gap-[8px]">
                  {agentReadinessSummary.confirmationItems.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[9px] text-[11px] leading-[1.45]"
                    >
                      <div className="flex items-center justify-between gap-[6px]">
                        <span className="font-[700]">{item.label}</span>
                        <span
                          className={clsx(
                            item.status === 'ready'
                              ? 'text-emerald-300'
                              : item.status === 'manual'
                              ? 'text-sky-200'
                              : 'text-amber-200'
                          )}
                        >
                          {item.status === 'ready'
                            ? '준비'
                            : item.status === 'manual'
                            ? '수동'
                            : '확인'}
                        </span>
                      </div>
                      <div className="mt-[5px] text-textItemBlur">{item.detail}</div>
                    </div>
                  ))}
                </div>
              )}
              {!!agentResult.plan.campaignTimeline?.length && (
                <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px]">
                  <div className="text-[11px] font-[700]">자율 운영 타임라인</div>
                  <div className="mt-[8px] grid grid-cols-5 maxMedia:grid-cols-1 gap-[6px]">
                    {agentResult.plan.campaignTimeline.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[9px] text-[11px] leading-[1.45]"
                      >
                        <div className="flex items-center justify-between gap-[6px]">
                          <span className="font-[700]">{item.label}</span>
                          <span
                            className={clsx(
                              item.status === 'ready'
                                ? 'text-emerald-300'
                                : item.status === 'manual'
                                ? 'text-sky-200'
                                : 'text-amber-200'
                            )}
                          >
                            {item.status === 'ready'
                              ? '준비'
                              : item.status === 'manual'
                              ? '수동'
                              : '컨펌'}
                          </span>
                        </div>
                        <div className="mt-[5px] text-textItemBlur">{item.window}</div>
                        <div className="mt-[6px] flex flex-col gap-[3px] text-textItemBlur">
                          {item.actions.slice(0, 2).map((action) => (
                            <div key={action}>{action}</div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="col-span-2 maxMedia:col-span-1 rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px] flex flex-col gap-[10px]">
              <div className="flex items-center justify-between gap-[10px]">
                <div>
                  <div className="text-[12px] font-[700]">작업 상태</div>
                  <div className="mt-[3px] text-[11px] text-textItemBlur">
                    {agentResult.operation.headline}
                  </div>
                </div>
                <div className="text-[18px] font-[700]">
                  {agentResult.operation.progress}%
                </div>
              </div>
              <div className="h-[7px] rounded-[999px] bg-black/20 overflow-hidden">
                <div
                  className="h-full rounded-[999px] bg-btnPrimary"
                  style={{ width: `${agentResult.operation.progress}%` }}
                />
              </div>
              <div className="grid grid-cols-5 maxMedia:grid-cols-1 gap-[8px]">
                {agentResult.operation.progressSteps.map((step) => (
                  <div
                    key={step.id}
                    className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[9px] text-[11px] leading-[1.4]"
                  >
                    <div className="flex items-center justify-between gap-[6px]">
                      <span className="font-[700]">{step.label}</span>
                      <span
                        className={clsx(
                          step.status === 'done'
                            ? 'text-emerald-300'
                            : step.status === 'active'
                            ? 'text-amber-200'
                            : step.status === 'blocked'
                            ? 'text-red-300'
                            : 'text-textItemBlur'
                        )}
                      >
                        {step.status === 'done'
                          ? '완료'
                          : step.status === 'active'
                          ? '진행'
                          : step.status === 'blocked'
                          ? '막힘'
                          : '대기'}
                      </span>
                    </div>
                    <div className="mt-[5px] text-textItemBlur">{step.detail}</div>
                  </div>
                ))}
              </div>
              {!!agentResult.operation.platformReadiness.length && (
                <div className="grid grid-cols-3 maxMedia:grid-cols-1 gap-[8px]">
                  {agentResult.operation.platformReadiness.map((item) => (
                    <div
                      key={item.platform}
                      className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[9px] text-[11px] leading-[1.45]"
                    >
                      <div className="flex items-center justify-between gap-[6px]">
                        <span className="font-[700]">{item.label}</span>
                        <span
                          className={clsx(
                            item.status === 'ready'
                              ? 'text-emerald-300'
                              : item.status === 'manual'
                              ? 'text-sky-200'
                              : 'text-amber-200'
                          )}
                        >
                          {item.status === 'ready'
                            ? '준비'
                            : item.status === 'manual'
                            ? '수동'
                            : '확인'}
                        </span>
                      </div>
                      <div className="mt-[5px] text-textItemBlur">
                        {item.checks.slice(0, 2).join(' / ')}
                      </div>
                      {!!item.blockers.length && (
                        <div className="mt-[6px] text-amber-200">
                          {item.blockers[0]}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {agentResult.plan.marketingStrategy && (
              <div className="col-span-2 maxMedia:col-span-1 rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px] flex flex-col gap-[12px]">
                <div className="flex items-center justify-between gap-[10px]">
                  <div className="text-[12px] font-[700]">AiToEarn식 운영맵</div>
                  <div className="flex flex-wrap justify-end gap-[5px] text-[10px] text-textItemBlur">
                    {agentResult.plan.marketingStrategy.revenueModels.map((model) => (
                      <span key={model} className="rounded-[999px] bg-btnSimple px-[7px] py-[4px]">
                        {model}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-4 maxMedia:grid-cols-2 gap-[8px]">
                  {agentResult.plan.marketingStrategy.lanes.map((lane) => (
                    <div
                      key={lane.lane}
                      className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px] text-[11px] leading-[1.45] break-words"
                    >
                      <div className="flex items-center justify-between gap-[6px]">
                        <span className="text-[12px] font-[700]">{lane.label}</span>
                        <span
                          className={clsx(
                            'text-[10px]',
                            lane.status === 'needs-confirmation'
                              ? 'text-amber-200'
                              : lane.status === 'manual'
                              ? 'text-sky-200'
                              : 'text-emerald-300'
                          )}
                        >
                          {lane.status === 'needs-confirmation'
                            ? '컨펌'
                            : lane.status === 'manual'
                            ? '수동'
                            : '준비'}
                        </span>
                      </div>
                      <div className="mt-[6px] text-textItemBlur">{lane.goal}</div>
                      {!!lane.kpis.length && (
                        <div className="mt-[8px] flex flex-wrap gap-[5px]">
                          {lane.kpis.slice(0, 3).map((kpi) => (
                            <span key={kpi} className="rounded-[999px] bg-btnSimple px-[6px] py-[3px]">
                              {kpi}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 maxMedia:grid-cols-1 gap-[8px]">
                  <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px]">
                    <div className="text-[11px] font-[700] mb-[7px]">고전환 신호</div>
                    <div className="flex flex-col gap-[6px]">
                      {agentResult.plan.marketingStrategy.engagementSignals
                        .slice(0, 4)
                        .map((signal) => (
                          <div key={signal.id} className="text-[11px] leading-[1.45]">
                            <span
                              className={clsx(
                                signal.priority === 'high'
                                  ? 'text-amber-200'
                                  : 'text-textItemBlur'
                              )}
                            >
                              {signal.label}
                            </span>
                            <span className="mx-[5px] text-textItemBlur">/</span>
                            <span>{signal.action}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                  <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px]">
                    <div className="text-[11px] font-[700] mb-[7px]">배치 아이디어</div>
                    <div className="flex flex-col gap-[6px] text-[11px] leading-[1.45]">
                      {agentResult.plan.marketingStrategy.batchIdeas
                        .slice(0, 4)
                        .map((idea) => (
                          <div key={idea}>{idea}</div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {agentResult.plan.competitorPlaybook && (
              <div className="col-span-2 maxMedia:col-span-1 rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px] flex flex-col gap-[12px]">
                <div className="flex items-center justify-between gap-[10px]">
                  <div>
                    <div className="text-[12px] font-[700]">경쟁 기능 카피맵</div>
                    <div className="mt-[3px] text-[11px] text-textItemBlur">
                      {agentResult.plan.competitorPlaybook.headline}
                    </div>
                  </div>
                  <div className="text-[10px] text-textItemBlur">
                    Blotato · Buffer · Publer · SocialBee
                  </div>
                </div>
                <div className="grid grid-cols-4 maxMedia:grid-cols-1 gap-[8px]">
                  {agentResult.plan.competitorPlaybook.parityFeatures
                    .slice(0, 8)
                    .map((feature) => (
                      <div
                        key={feature.id}
                        className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px] text-[11px] leading-[1.45]"
                      >
                        <div className="flex items-center justify-between gap-[6px]">
                          <span className="font-[700]">{feature.label}</span>
                          <span
                            className={clsx(
                              feature.status === 'implemented'
                                ? 'text-emerald-300'
                                : feature.status === 'operator-assisted'
                                ? 'text-sky-200'
                                : 'text-amber-200'
                            )}
                          >
                            {feature.status === 'implemented'
                              ? '구현'
                              : feature.status === 'operator-assisted'
                              ? '보조'
                              : '로드맵'}
                          </span>
                        </div>
                        <div className="mt-[6px] text-textItemBlur">
                          {feature.copiedFrom.join(', ')}
                        </div>
                        <div className="mt-[6px]">{feature.snapsSurface}</div>
                        <div className="mt-[6px] text-textItemBlur">
                          {feature.operatorAction}
                        </div>
                      </div>
                    ))}
                </div>
                <div className="grid grid-cols-2 maxMedia:grid-cols-1 gap-[8px]">
                  <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px]">
                    <div className="text-[11px] font-[700] mb-[7px]">차별점</div>
                    <div className="flex flex-col gap-[5px] text-[11px] leading-[1.45] text-textItemBlur">
                      {agentResult.plan.competitorPlaybook.moat
                        .slice(0, 4)
                        .map((item) => (
                          <div key={item}>{item}</div>
                        ))}
                    </div>
                  </div>
                  <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px]">
                    <div className="text-[11px] font-[700] mb-[7px]">구현 메모</div>
                    <div className="flex flex-col gap-[5px] text-[11px] leading-[1.45] text-textItemBlur">
                      {agentResult.plan.competitorPlaybook.implementationNotes
                        .slice(0, 3)
                        .map((item) => (
                          <div key={item}>{item}</div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {(agentResult.plan.scenarioRun || agentResult.plan.goToMarketPlan) && (
              <div className="col-span-2 maxMedia:col-span-1 grid grid-cols-[minmax(0,0.82fr)_minmax(260px,1fr)] maxMedia:grid-cols-1 gap-[10px]">
                {agentResult.plan.scenarioRun && (
                  <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px]">
                    <div className="text-[12px] font-[700]">가상 시나리오 리허설</div>
                    <div className="mt-[6px] text-[11px] leading-[1.5] text-textItemBlur">
                      {agentResult.plan.scenarioRun.scenario}
                    </div>
                    <div className="mt-[10px] flex flex-col gap-[6px] text-[11px] leading-[1.45]">
                      {agentResult.plan.scenarioRun.workflow
                        .slice(0, 7)
                        .map((step, index) => (
                          <div
                            key={`${index}-${step}`}
                            className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[8px]"
                          >
                            {step}
                          </div>
                        ))}
                    </div>
                    <div className="mt-[10px] text-[11px] leading-[1.5] text-textItemBlur">
                      {agentResult.plan.scenarioRun.expectedBusinessOutcome}
                    </div>
                  </div>
                )}
                {agentResult.plan.goToMarketPlan && (
                  <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px]">
                    <div className="flex items-start justify-between gap-[10px]">
                      <div>
                        <div className="text-[12px] font-[700]">판매/수익화 계획</div>
                        <div className="mt-[4px] text-[11px] text-textItemBlur">
                          {agentResult.plan.goToMarketPlan.primaryBuyer}
                        </div>
                      </div>
                      <span className="rounded-[999px] bg-btnSimple px-[7px] py-[4px] text-[10px]">
                        GTM
                      </span>
                    </div>
                    <div className="mt-[9px] text-[11px] leading-[1.5]">
                      {agentResult.plan.goToMarketPlan.positioning}
                    </div>
                    <div className="mt-[10px] grid grid-cols-2 maxMedia:grid-cols-1 gap-[8px]">
                      {agentResult.plan.goToMarketPlan.segments
                        .slice(0, 4)
                        .map((segment) => (
                          <div
                            key={segment.id}
                            className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[9px] text-[11px] leading-[1.45]"
                          >
                            <div className="font-[700]">{segment.label}</div>
                            <div className="mt-[5px] text-textItemBlur">
                              {segment.firstPitch}
                            </div>
                            <div className="mt-[6px] text-emerald-300">
                              {segment.pricing}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px] flex flex-col gap-[10px]">
          <div className="flex items-center justify-between gap-[10px]">
            <div className="text-[12px] font-[700]">에이전트 작업 히스토리</div>
            <div className="flex gap-[6px]">
              <button
                type="button"
                onClick={() => {
                  const next = !agentFavoriteOnly;
                  setAgentFavoriteOnly(next);
                  loadAgentTasks(agentTaskSearch, next);
                }}
                className={clsx(
                  'h-[30px] rounded-[8px] px-[9px] text-[11px]',
                  agentFavoriteOnly ? 'bg-btnPrimary text-white' : 'bg-btnSimple'
                )}
              >
                즐겨찾기
              </button>
              <button
                type="button"
                onClick={() => loadAgentTasks()}
                className="h-[30px] rounded-[8px] bg-btnSimple px-[9px] text-[11px]"
              >
                새로고침
              </button>
            </div>
          </div>
          <div className="grid grid-cols-[1fr_86px] maxMedia:grid-cols-1 gap-[8px]">
            <input
              value={agentTaskSearch}
              onChange={(event) => setAgentTaskSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  loadAgentTasks(agentTaskSearch, agentFavoriteOnly);
                }
              }}
              className="h-[36px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="작업 제목, 오더, 주제 검색"
            />
            <Button
              secondary
              loading={agentTasksLoading}
              onClick={() => loadAgentTasks(agentTaskSearch, agentFavoriteOnly)}
              className="rounded-[8px] !h-[36px]"
            >
              검색
            </Button>
          </div>
          <div className="grid grid-cols-4 maxMedia:grid-cols-1 gap-[8px]">
            {agentTasks.map((task) => (
              <div
                key={task.id}
                className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px] text-[11px] leading-[1.45] flex flex-col gap-[8px]"
              >
                <div className="flex items-start justify-between gap-[8px]">
                  <button
                    type="button"
                    onClick={() => openAgentTask(task.id)}
                    className="text-left font-[700] hover:text-textColor line-clamp-2"
                  >
                    {task.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleAgentFavorite(task)}
                    className={task.favorite ? 'text-amber-200' : 'text-textItemBlur'}
                  >
                    {task.favorite ? '★' : '☆'}
                  </button>
                </div>
                <div className="h-[5px] rounded-[999px] bg-black/20 overflow-hidden">
                  <div
                    className="h-full rounded-[999px] bg-btnPrimary"
                    style={{ width: `${Math.max(0, Math.min(100, task.progress || 0))}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-[5px] text-textItemBlur">
                  <span>{task.platformCount}채널</span>
                  {task.shortVideo && <span>쇼츠</span>}
                  {task.publishDateLocal && <span>{task.publishDateLocal.replace('T', ' ')}</span>}
                </div>
                <div className="flex items-center justify-between gap-[6px]">
                  <div className="flex gap-[3px]">
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <button
                        type="button"
                        key={rating}
                        onClick={() => rateAgentTask(task.id, rating)}
                        className={Number(task.rating || 0) >= rating ? 'text-amber-200' : 'text-textItemBlur'}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-[7px]">
                    <button
                      type="button"
                      onClick={() => prepareAgentCommand(task.command)}
                      className="text-textItemBlur hover:text-newTextColor"
                    >
                      재실행
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteAgentTask(task)}
                      className="text-textItemBlur hover:text-red-300"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {!agentTasks.length && (
              <div className="rounded-[8px] border border-dashed border-newBorder bg-newBgColorInner p-[12px] text-[12px] text-textItemBlur">
                저장된 에이전트 작업이 없습니다.
              </div>
            )}
          </div>
        </div>
      </section>
      )}

      {isStudioSurface && (
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
      )}

      {isStudioSurface && (
      <section className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[14px] flex flex-col gap-[12px]">
        <div className="flex flex-wrap items-center justify-between gap-[10px]">
          <div>
            <div className="text-[16px] font-[700]">브랜드 키트</div>
            <div className="mt-[3px] text-[12px] text-textItemBlur">
              Buffer/Hootsuite처럼 보이스, 대상, 금지어, 필수어, CTA를 저장해 변환 폼에 적용합니다.
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-[8px]">
            <Button
              secondary
              loading={brandKitLoading}
              onClick={analyzeBrandKit}
              className="rounded-[8px] !h-[36px] whitespace-nowrap"
            >
              보이스 분석
            </Button>
            <Button
              secondary
              loading={brandKitLoading}
              onClick={saveBrandKit}
              className="rounded-[8px] !h-[36px] whitespace-nowrap"
            >
              키트 저장
            </Button>
            <Button
              secondary
              loading={brandKitLoading}
              onClick={() => applyBrandKit()}
              className="rounded-[8px] !h-[36px] whitespace-nowrap"
            >
              키트 적용
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] maxMedia:grid-cols-1 gap-[8px]">
          <input
            value={brandKitName}
            onChange={(event) => setBrandKitName(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="브랜드 이름"
          />
          <input
            value={brandKitAudience}
            onChange={(event) => setBrandKitAudience(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="핵심 대상"
          />
        </div>
        <div className="grid grid-cols-2 maxMedia:grid-cols-1 gap-[8px]">
          <input
            value={brandKitVoice}
            onChange={(event) => setBrandKitVoice(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="브랜드 보이스"
          />
          <input
            value={brandKitTone}
            onChange={(event) => setBrandKitTone(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="톤 가이드"
          />
        </div>
        <div className="grid grid-cols-3 maxMedia:grid-cols-1 gap-[8px]">
          <input
            value={brandKitValues}
            onChange={(event) => setBrandKitValues(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="가치/원칙"
          />
          <input
            value={brandKitRequiredTerms}
            onChange={(event) => setBrandKitRequiredTerms(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="필수어"
          />
          <input
            value={brandKitBannedTerms}
            onChange={(event) => setBrandKitBannedTerms(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="금지어"
          />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] maxMedia:grid-cols-1 gap-[8px]">
          <input
            value={brandKitHashtags}
            onChange={(event) => setBrandKitHashtags(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="기본 해시태그"
          />
          <input
            value={brandKitCta}
            onChange={(event) => setBrandKitCta(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="기본 CTA"
          />
          <input
            value={brandKitColors}
            onChange={(event) => setBrandKitColors(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="컬러"
          />
        </div>
        <textarea
          value={brandKitExamples}
          onChange={(event) => setBrandKitExamples(event.target.value)}
          className="min-h-[70px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.5]"
          placeholder="브랜드 문장 예시나 기존 게시물을 줄 단위로 붙여넣기"
        />
        {(brandKitPreview || brandKitApplication) && (
          <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[11px] leading-[1.5]">
            <div className="font-[700]">
              {(brandKitPreview || brandKitApplication?.brandKit)?.name}
            </div>
            <div className="mt-[6px] whitespace-pre-wrap text-textItemBlur">
              {brandKitApplication?.promptPrefix || brandKitPreview?.promptGuidance}
            </div>
            {brandKitApplication && (
              <div className="mt-[8px] flex flex-wrap gap-[6px]">
                {brandKitApplication.complianceChecklist.map((item) => (
                  <span key={item} className="rounded-[999px] bg-btnSimple px-[7px] py-[4px]">
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-4 maxMedia:grid-cols-1 gap-[8px]">
          {brandKits.slice(0, 8).map((kit) => (
            <div
              key={kit.id}
              className={clsx(
                'rounded-[8px] border bg-newBgLineColor p-[10px] text-[11px] leading-[1.45]',
                kit.id === activeBrandKit?.id ? 'border-btnPrimary' : 'border-newBorder'
              )}
            >
              <button
                type="button"
                onClick={() => setActiveBrandKitId(kit.id)}
                className="text-left font-[700] hover:text-newTextColor"
              >
                {kit.name}
              </button>
              <div className="mt-[5px] text-textItemBlur line-clamp-2">
                {kit.voice} / {kit.tone}
              </div>
              <div className="mt-[7px] flex flex-wrap gap-[5px] text-textItemBlur">
                {kit.targetPlatforms.slice(0, 3).map((platform) => (
                  <span key={platform}>{targetPlatformLabel(platform)}</span>
                ))}
              </div>
              <div className="mt-[9px] flex flex-wrap gap-[6px]">
                <button
                  type="button"
                  onClick={() => applyBrandKit(kit.id)}
                  className="text-textItemBlur hover:text-newTextColor"
                >
                  적용
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBrandKitPreview(kit);
                    setBrandKitName(kit.name);
                    setBrandKitAudience(kit.audience);
                    setBrandKitVoice(kit.voice);
                    setBrandKitTone(kit.tone);
                    setBrandKitValues(kit.values.join(', '));
                    setBrandKitRequiredTerms(kit.requiredTerms.join(', '));
                    setBrandKitBannedTerms(kit.bannedTerms.join(', '));
                    setBrandKitHashtags(kit.hashtags.join(', '));
                    setBrandKitCta(kit.cta);
                    setBrandKitColors(kit.colors.join(', '));
                    setBrandKitExamples(kit.examples.join('\n'));
                  }}
                  className="text-textItemBlur hover:text-newTextColor"
                >
                  불러오기
                </button>
                <button
                  type="button"
                  onClick={() => deleteBrandKit(kit.id)}
                  className="text-textItemBlur hover:text-red-300"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
          {!brandKits.length && (
            <div className="rounded-[8px] border border-dashed border-newBorder bg-newBgLineColor p-[10px] text-[12px] text-textItemBlur">
              저장된 브랜드 키트가 없습니다.
            </div>
          )}
        </div>
      </section>
      )}

      {isStudioSurface && (
      <section className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[14px] flex flex-col gap-[12px]">
        <div className="flex flex-wrap items-center justify-between gap-[10px]">
          <div>
            <div className="text-[16px] font-[700]">포스트 실험 랩</div>
            <div className="mt-[3px] text-[12px] text-textItemBlur">
              여러 훅, 각도, CTA 후보를 만들고 점수 높은 변형만 원문 저장이나 발행 큐로 넘깁니다.
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-[8px]">
            <Button
              secondary
              loading={variationLoading}
              onClick={previewVariationLab}
              className="rounded-[8px] !h-[36px] whitespace-nowrap"
            >
              실험 생성
            </Button>
            <Button
              secondary
              loading={variationLoading}
              onClick={importVariationSources}
              className="rounded-[8px] !h-[36px] whitespace-nowrap"
            >
              원문 저장
            </Button>
            <Button
              secondary
              loading={variationLoading}
              onClick={createVariationQueue}
              className="rounded-[8px] !h-[36px] whitespace-nowrap"
            >
              큐 생성
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-[150px_90px_minmax(0,1fr)_minmax(0,1fr)] maxMedia:grid-cols-1 gap-[8px]">
          <select
            value={variationGoal}
            onChange={(event) => setVariationGoal(event.target.value as SnapsPostVariationGoal)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
          >
            {[
              ['engagement', '참여'],
              ['saves', '저장'],
              ['comments', '댓글'],
              ['clicks', '클릭'],
              ['leads', '리드'],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            value={variationCount}
            onChange={(event) => setVariationCount(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="후보 수"
          />
          <input
            value={variationAudience}
            onChange={(event) => setVariationAudience(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="대상"
          />
          <input
            value={variationCompetitorHook}
            onChange={(event) => setVariationCompetitorHook(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="경쟁 훅"
          />
        </div>
        <textarea
          value={variationCta}
          onChange={(event) => setVariationCta(event.target.value)}
          className="min-h-[58px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.5]"
          placeholder="실험 CTA"
        />
        {variationPreview && (
          <div className="flex flex-col gap-[10px]">
            <div className="grid grid-cols-4 maxMedia:grid-cols-2 gap-[8px]">
              {[
                ['후보', variationPreview.totalVariants],
                ['목표', variationPreview.goal],
                ['지표', variationPreview.winningMetric],
                ['채널', variationPreview.platforms.length],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
                >
                  <div className="text-[11px] text-textItemBlur">{label}</div>
                  <div className="mt-[4px] text-[15px] font-[700]">{value}</div>
                </div>
              ))}
            </div>
            {!!variationPreview.recommendations.length && (
              <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px] leading-[1.5] text-textItemBlur">
                {variationPreview.recommendations[0]}
              </div>
            )}
            <div className="grid grid-cols-2 maxMedia:grid-cols-1 gap-[8px]">
              {variationPreview.items.slice(0, 6).map((item) => (
                <div
                  key={item.id}
                  className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
                >
                  <div className="flex items-start justify-between gap-[8px]">
                    <div>
                      <div className="text-[12px] font-[700]">
                        #{item.rank} · {item.platformLabel} · {item.angle}
                      </div>
                      <div className="mt-[2px] text-[11px] text-textItemBlur">
                        {item.status} · {item.expectedMetric}
                      </div>
                    </div>
                    <div
                      className={clsx(
                        'rounded-[999px] px-[8px] py-[4px] text-[11px] font-[700]',
                        item.status === 'winner'
                          ? 'bg-emerald-500/15 text-emerald-200'
                          : item.status === 'ready'
                            ? 'bg-amber-500/15 text-amber-100'
                            : 'bg-red-500/15 text-red-100'
                      )}
                    >
                      {item.score}
                    </div>
                  </div>
                  <div className="mt-[8px] text-[13px] font-[700] leading-[1.35]">
                    {item.hook}
                  </div>
                  <div className="mt-[6px] text-[12px] leading-[1.45] text-textItemBlur line-clamp-3">
                    {item.caption}
                  </div>
                  <div className="mt-[8px] flex flex-wrap gap-[5px]">
                    {item.hashtags.slice(0, 5).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-[999px] bg-newBgColorInner px-[7px] py-[3px] text-[11px] text-textItemBlur"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="mt-[8px] flex items-center justify-between gap-[8px]">
                    <div className="text-[11px] text-textItemBlur line-clamp-2">
                      {item.hypothesis}
                    </div>
                    <button
                      type="button"
                      onClick={() => applyVariationItem(item)}
                      className="shrink-0 rounded-[8px] bg-btnSimple px-[9px] py-[7px] text-[11px] text-textItemBlur hover:text-newTextColor"
                    >
                      적용
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {!!variationPreview.warnings.length && (
              <div className="rounded-[8px] border border-amber-500/30 bg-amber-500/10 p-[10px] text-[12px] text-amber-100">
                {variationPreview.warnings[0]}
              </div>
            )}
          </div>
        )}
      </section>
      )}

      {isStudioSurface && (
      <section className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[14px] flex flex-col gap-[12px]">
        <div className="flex flex-wrap items-center justify-between gap-[10px]">
          <div>
            <div className="text-[16px] font-[700]">미디어 라이브러리</div>
            <div className="mt-[3px] text-[12px] text-textItemBlur">
              Later/Publer처럼 이미지, 영상, GIF, 캐러셀 자산을 저장하고 플랫폼별 초안에 첨부합니다.
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-[8px]">
            <Button
              secondary
              loading={mediaAssetLoading}
              onClick={previewMediaAsset}
              className="rounded-[8px] !h-[36px] whitespace-nowrap"
            >
              자산 분석
            </Button>
            <Button
              secondary
              loading={mediaAssetLoading}
              onClick={saveMediaAsset}
              className="rounded-[8px] !h-[36px] whitespace-nowrap"
            >
              자산 저장
            </Button>
            <Button
              secondary
              loading={mediaAssetLoading}
              onClick={() => attachMediaAsset()}
              className="rounded-[8px] !h-[36px] whitespace-nowrap"
            >
              결과에 첨부
            </Button>
            <Button
              secondary
              loading={mediaAssetLoading}
              onClick={() => createMediaAssetQueue()}
              className="rounded-[8px] !h-[36px] whitespace-nowrap"
            >
              자산 큐
            </Button>
          </div>
        </div>
        <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]">
          <div className="flex flex-wrap items-center justify-between gap-[8px]">
            <div>
              <div className="text-[13px] font-[700]">크리에이티브 브리프</div>
              <div className="mt-[2px] text-[11px] text-textItemBlur">
                Publer Canva 흐름처럼 디자인 타입과 비율을 먼저 정하고 미디어 자산으로 저장합니다.
              </div>
            </div>
            <div className="flex flex-wrap gap-[8px]">
              <Button
                secondary
                loading={creativeBriefLoading}
                onClick={previewCreativeBrief}
                className="rounded-[8px] !h-[34px] whitespace-nowrap"
              >
                브리프 생성
              </Button>
              <Button
                secondary
                loading={creativeBriefLoading}
                onClick={() => saveCreativeBriefMedia()}
                className="rounded-[8px] !h-[34px] whitespace-nowrap"
              >
                브리프 저장
              </Button>
            </div>
          </div>
          <div className="mt-[10px] grid grid-cols-[130px_130px_minmax(0,1fr)_minmax(0,1fr)] maxMedia:grid-cols-1 gap-[8px]">
            <select
              value={creativeBriefMediaType}
              onChange={(event) =>
                setCreativeBriefMediaType(event.target.value as SnapsCreativeBriefMediaType)
              }
              className="h-[38px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            >
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="gif">GIF</option>
              <option value="carousel">Carousel</option>
            </select>
            <select
              value={creativeBriefAspectRatio}
              onChange={(event) =>
                setCreativeBriefAspectRatio(event.target.value as SnapsCreativeBriefAspectRatio)
              }
              className="h-[38px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            >
              <option value="square">Square</option>
              <option value="portrait">Portrait</option>
              <option value="story">Story</option>
              <option value="landscape">Landscape</option>
            </select>
            <input
              value={creativeBriefVisualStyle}
              onChange={(event) => setCreativeBriefVisualStyle(event.target.value)}
              className="h-[38px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="비주얼 스타일"
            />
            <input
              value={creativeBriefCta}
              onChange={(event) => setCreativeBriefCta(event.target.value)}
              className="h-[38px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="디자인 CTA"
            />
          </div>
          {creativeBriefPreview && (
            <div className="mt-[10px] flex flex-col gap-[8px]">
              <div className="grid grid-cols-4 maxMedia:grid-cols-2 gap-[6px] text-[11px]">
                {[
                  ['Type', creativeBriefPreview.mediaType],
                  [
                    'Size',
                    `${creativeBriefPreview.dimensions.width}x${creativeBriefPreview.dimensions.height}`,
                  ],
                  ['Items', creativeBriefPreview.items.length],
                  ['채널', creativeBriefPreview.targetPlatforms.length],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[8px]"
                  >
                    <div className="text-textItemBlur">{label}</div>
                    <div className="mt-[3px] font-[700]">{value}</div>
                  </div>
                ))}
              </div>
              {!!creativeBriefPreview.warnings.length && (
                <div className="rounded-[8px] border border-amber-500/30 bg-amber-500/10 p-[8px] text-[11px] text-amber-100">
                  {creativeBriefPreview.warnings[0]}
                </div>
              )}
              <div className="grid grid-cols-3 maxMedia:grid-cols-1 gap-[8px]">
                {creativeBriefPreview.items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[8px] text-[11px] leading-[1.45]"
                  >
                    <div
                      className="overflow-hidden rounded-[8px] border border-newBorder bg-black"
                      style={{ aspectRatio: `${item.dimensions.width} / ${item.dimensions.height}` }}
                    >
                      <img
                        src={item.svgDataUrl}
                        alt={item.altText}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="mt-[7px] flex items-center justify-between gap-[6px]">
                      <div className="font-[700]">{item.angle}</div>
                      <div className="text-textItemBlur">{item.aspectRatio}</div>
                    </div>
                    <div className="mt-[5px] text-textItemBlur line-clamp-2">
                      {item.overlayText}
                    </div>
                    <div className="mt-[8px] flex flex-wrap gap-[6px]">
                      <button
                        type="button"
                        onClick={() => applyCreativeBriefItemToMediaForm(item)}
                        className="text-textItemBlur hover:text-newTextColor"
                      >
                        폼 적용
                      </button>
                      <button
                        type="button"
                        onClick={() => saveCreativeBriefMedia(item.id)}
                        className="text-textItemBlur hover:text-newTextColor"
                      >
                        저장
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_150px] maxMedia:grid-cols-1 gap-[8px]">
          <input
            value={mediaAssetTitle}
            onChange={(event) => setMediaAssetTitle(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="자산 제목"
          />
          <select
            value={mediaAssetType}
            onChange={(event) => setMediaAssetType(event.target.value as SnapsMediaAssetType)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
          >
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="gif">GIF</option>
            <option value="carousel">Carousel</option>
            <option value="document">Document</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] maxMedia:grid-cols-1 gap-[8px]">
          <input
            value={mediaAssetUrl}
            onChange={(event) => setMediaAssetUrl(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="미디어 URL"
          />
          <input
            value={mediaAssetThumbnail}
            onChange={(event) => setMediaAssetThumbnail(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="썸네일 URL"
          />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_90px_90px_90px] maxMedia:grid-cols-1 gap-[8px]">
          <input
            value={mediaAssetCampaign}
            onChange={(event) => setMediaAssetCampaign(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="캠페인"
          />
          <input
            value={mediaAssetTags}
            onChange={(event) => setMediaAssetTags(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="태그"
          />
          <input
            value={mediaAssetWidth}
            onChange={(event) => setMediaAssetWidth(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="가로"
          />
          <input
            value={mediaAssetHeight}
            onChange={(event) => setMediaAssetHeight(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="세로"
          />
          <input
            value={mediaAssetDuration}
            onChange={(event) => setMediaAssetDuration(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="초"
          />
        </div>
        <input
          value={mediaAssetAltText}
          onChange={(event) => setMediaAssetAltText(event.target.value)}
          className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
          placeholder="대체 텍스트"
        />
        <textarea
          value={mediaAssetCaption}
          onChange={(event) => setMediaAssetCaption(event.target.value)}
          className="min-h-[78px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.5]"
          placeholder="미디어와 함께 쓸 기본 캡션"
        />
        {(mediaAssetPreview || mediaAssetAttachResult) && (
          <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[11px] leading-[1.5]">
            <div className="flex flex-wrap items-center justify-between gap-[8px]">
              <div className="font-[700]">
                {mediaAssetAttachResult?.asset.title || mediaAssetPreview?.title}
              </div>
              <div className="text-textItemBlur">
                {(mediaAssetAttachResult?.asset.mediaType || mediaAssetPreview?.mediaType || 'unknown').toUpperCase()}
              </div>
            </div>
            <div className="mt-[7px] grid grid-cols-3 maxMedia:grid-cols-1 gap-[6px]">
              {(mediaAssetAttachResult?.asset.platformFit || mediaAssetPreview?.platformFit || []).slice(0, 6).map((fit) => (
                <div
                  key={`${fit.platform}-${fit.status}`}
                  className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[8px]"
                >
                  <div className="font-[700]">{fit.label}</div>
                  <div className="mt-[3px] text-textItemBlur">{fit.status}</div>
                  <div className="mt-[3px] text-textItemBlur line-clamp-2">
                    {fit.recommendation}
                  </div>
                </div>
              ))}
            </div>
            {mediaAssetAttachResult && (
              <div className="mt-[8px] flex flex-wrap gap-[6px]">
                {mediaAssetAttachResult.checklist.map((item) => (
                  <span key={item} className="rounded-[999px] bg-btnSimple px-[7px] py-[4px]">
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-4 maxMedia:grid-cols-1 gap-[8px]">
          {mediaAssets.slice(0, 8).map((asset) => (
            <div
              key={asset.id}
              className={clsx(
                'rounded-[8px] border bg-newBgLineColor p-[10px] text-[11px] leading-[1.45]',
                asset.id === activeMediaAsset?.id ? 'border-btnPrimary' : 'border-newBorder'
              )}
            >
              <button
                type="button"
                onClick={() => setActiveMediaAssetId(asset.id)}
                className="text-left font-[700] hover:text-newTextColor"
              >
                {asset.title}
              </button>
              <div className="mt-[5px] text-textItemBlur line-clamp-2">
                {asset.mediaType} / {asset.campaign || 'campaign 없음'}
              </div>
              <div className="mt-[7px] flex flex-wrap gap-[5px] text-textItemBlur">
                {asset.targetPlatforms.slice(0, 3).map((platform) => (
                  <span key={platform}>{targetPlatformLabel(platform)}</span>
                ))}
              </div>
              <div className="mt-[9px] flex flex-wrap gap-[6px]">
                <button
                  type="button"
                  onClick={() => attachMediaAsset(asset.id)}
                  className="text-textItemBlur hover:text-newTextColor"
                >
                  첨부
                </button>
                <button
                  type="button"
                  onClick={() => createMediaAssetQueue(asset.id)}
                  className="text-textItemBlur hover:text-newTextColor"
                >
                  큐
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMediaAssetPreview(asset);
                    setActiveMediaAssetId(asset.id);
                    setMediaAssetTitle(asset.title);
                    setMediaAssetUrl(asset.url);
                    setMediaAssetThumbnail(asset.thumbnail || '');
                    setMediaAssetType(asset.mediaType);
                    setMediaAssetAltText(asset.altText);
                    setMediaAssetCaption(asset.caption);
                    setMediaAssetCampaign(asset.campaign);
                    setMediaAssetTags(asset.tags.join(', '));
                    setMediaAssetWidth(asset.width ? String(asset.width) : '');
                    setMediaAssetHeight(asset.height ? String(asset.height) : '');
                    setMediaAssetDuration(asset.durationSeconds ? String(asset.durationSeconds) : '');
                  }}
                  className="text-textItemBlur hover:text-newTextColor"
                >
                  불러오기
                </button>
                <button
                  type="button"
                  onClick={() => deleteMediaAsset(asset.id)}
                  className="text-textItemBlur hover:text-red-300"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
          {!mediaAssets.length && (
            <div className="rounded-[8px] border border-dashed border-newBorder bg-newBgLineColor p-[10px] text-[12px] text-textItemBlur">
              저장된 미디어 자산이 없습니다.
            </div>
          )}
        </div>
      </section>
      )}

      {isStudioSurface && (
      <section className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[14px] flex flex-col gap-[12px]">
        <div className="flex flex-wrap items-center justify-between gap-[10px]">
          <div>
            <div className="text-[16px] font-[700]">아이디어 보드</div>
            <div className="mt-[3px] text-[12px] text-textItemBlur">
              Buffer Create처럼 아이디어를 저장하고 원문 라이브러리로 보내 변환/승인으로 이어갑니다.
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-[8px]">
            <Button
              secondary
              loading={ideaLoading}
              onClick={generateIdeas}
              className="rounded-[8px] !h-[36px] whitespace-nowrap"
            >
              아이디어 생성
            </Button>
            <Button
              secondary
              loading={ideaLoading}
              onClick={() => saveIdea()}
              className="rounded-[8px] !h-[36px] whitespace-nowrap"
            >
              아이디어 저장
            </Button>
            <Button
              secondary
              loading={ideaLoading}
              onClick={() => promoteIdeaToSource()}
              className="rounded-[8px] !h-[36px] whitespace-nowrap"
            >
              원문으로 보내기
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] maxMedia:grid-cols-1 gap-[8px]">
          <input
            value={ideaTopic}
            onChange={(event) => setIdeaTopic(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="아이디어 주제"
          />
          <input
            value={ideaAudience}
            onChange={(event) => setIdeaAudience(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="대상"
          />
          <input
            value={ideaGoal}
            onChange={(event) => setIdeaGoal(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="목표"
          />
        </div>
        <div className="grid grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)_120px] maxMedia:grid-cols-1 gap-[8px]">
          <input
            value={ideaTitle}
            onChange={(event) => setIdeaTitle(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="수동 아이디어 제목"
          />
          <input
            value={ideaTags}
            onChange={(event) => setIdeaTags(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="태그"
          />
          <input
            value={ideaGroup}
            onChange={(event) => setIdeaGroup(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="그룹"
          />
        </div>
        <textarea
          value={ideaBody}
          onChange={(event) => setIdeaBody(event.target.value)}
          className="min-h-[74px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.5]"
          placeholder="아이디어 메모, 링크, 훅, CTA"
        />
        {ideaPreview && (
          <div className="grid grid-cols-3 maxMedia:grid-cols-1 gap-[8px]">
            {ideaPreview.ideas.slice(0, 6).map((idea) => (
              <div
                key={`${idea.title}-${idea.angle}`}
                className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[11px] leading-[1.45]"
              >
                <div className="flex items-start justify-between gap-[8px]">
                  <div className="font-[700]">{idea.title}</div>
                  <span className="rounded-[999px] bg-btnSimple px-[6px] py-[3px]">
                    {idea.priority}
                  </span>
                </div>
                <div className="mt-[7px] whitespace-pre-wrap text-textItemBlur">
                  {idea.body}
                </div>
                <div className="mt-[8px] flex flex-wrap gap-[5px]">
                  {idea.tags.slice(0, 5).map((tag) => (
                    <span key={tag} className="rounded-[999px] bg-btnSimple px-[6px] py-[3px]">
                      {tag}
                    </span>
                  ))}
                </div>
                <Button
                  secondary
                  loading={ideaLoading}
                  onClick={() => saveIdea(idea)}
                  className="mt-[9px] rounded-[8px] !h-[32px] w-full"
                >
                  저장
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-[140px_minmax(0,1fr)_100px] maxMedia:grid-cols-1 gap-[8px]">
          <select
            value={ideaStatus}
            onChange={(event) => {
              const nextStatus = event.target.value as SnapsIdeaStatusFilter;
              setIdeaStatus(nextStatus);
              loadIdeas(nextStatus, ideaSearch);
            }}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
          >
            {ideaStatusOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            value={ideaSearch}
            onChange={(event) => setIdeaSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                loadIdeas(ideaStatus, ideaSearch);
              }
            }}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="아이디어 검색"
          />
          <Button
            secondary
            loading={ideaLoading}
            onClick={() => loadIdeas(ideaStatus, ideaSearch)}
            className="rounded-[8px] !h-[38px]"
          >
            목록
          </Button>
        </div>
        <div className="grid grid-cols-4 maxMedia:grid-cols-1 gap-[8px]">
          {ideas.slice(0, 12).map((idea) => (
            <div
              key={idea.id}
              className={clsx(
                'rounded-[8px] border bg-newBgLineColor p-[10px] text-[11px] leading-[1.45]',
                idea.id === activeIdea?.id ? 'border-btnPrimary' : 'border-newBorder'
              )}
            >
              <button
                type="button"
                onClick={() => setActiveIdeaId(idea.id)}
                className="text-left font-[700] line-clamp-2 hover:text-newTextColor"
              >
                {idea.title}
              </button>
              <div className="mt-[5px] text-textItemBlur">
                {idea.group} · {ideaStatusLabels[idea.status]} · {idea.priority}
              </div>
              <div className="mt-[7px] line-clamp-4 whitespace-pre-wrap">{idea.body}</div>
              <div className="mt-[8px] flex flex-wrap gap-[5px] text-textItemBlur">
                {idea.targetPlatforms.slice(0, 3).map((platform) => (
                  <span key={platform}>{targetPlatformLabel(platform)}</span>
                ))}
              </div>
              <div className="mt-[9px] flex flex-wrap gap-[6px]">
                <button
                  type="button"
                  onClick={() => updateIdeaStatus(idea.id, 'planned')}
                  className="text-textItemBlur hover:text-newTextColor"
                >
                  계획
                </button>
                <button
                  type="button"
                  onClick={() => promoteIdeaToSource(idea.id)}
                  className="text-textItemBlur hover:text-newTextColor"
                >
                  원문
                </button>
                <button
                  type="button"
                  onClick={() => updateIdeaStatus(idea.id, 'archived')}
                  className="text-textItemBlur hover:text-newTextColor"
                >
                  보관
                </button>
                <button
                  type="button"
                  onClick={() => deleteIdea(idea.id)}
                  className="text-textItemBlur hover:text-red-300"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
          {!ideas.length && (
            <div className="rounded-[8px] border border-dashed border-newBorder bg-newBgLineColor p-[12px] text-[12px] text-textItemBlur">
              저장된 아이디어가 없습니다.
            </div>
          )}
        </div>
      </section>
      )}

      {isStudioSurface && (
      <section className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[14px] flex flex-col gap-[12px]">
        <div className="flex flex-wrap items-center justify-between gap-[10px]">
          <div>
            <div className="text-[16px] font-[700]">AI 바이럴 코치</div>
            <div className="mt-[3px] text-[12px] text-textItemBlur">
              훅, 문제/효익, 무음 이해도, 정보 밀도, 공유성, 해시태그를 게시 전에 점수화합니다.
            </div>
          </div>
          <Button
            secondary
            loading={coachLoading}
            onClick={runViralCoach}
            className="rounded-[8px] !h-[36px] whitespace-nowrap"
          >
            코치 점수화
          </Button>
        </div>
        <div className="grid grid-cols-[160px_minmax(0,1fr)_180px] maxMedia:grid-cols-1 gap-[8px]">
          <select
            value={coachPlatform}
            onChange={(event) => setCoachPlatform(event.target.value as TargetPlatform)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
          >
            {targetPlatforms.map((platform) => (
              <option key={platform.id} value={platform.id}>
                {platform.label}
              </option>
            ))}
          </select>
          <input
            value={coachVisualDescription}
            onChange={(event) => setCoachVisualDescription(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="무음 상태에서 보이는 장면/자막"
          />
          <input
            value={coachTargetAudience}
            onChange={(event) => setCoachTargetAudience(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="대상 시청자"
          />
        </div>
        {coachResult && (
          <div className="grid grid-cols-[170px_minmax(0,1fr)] maxMedia:grid-cols-1 gap-[10px]">
            <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px]">
              <div className="text-[11px] text-textItemBlur">점수</div>
              <div className="mt-[5px] text-[32px] font-[800]">
                {coachResult.score}
              </div>
              <div className="mt-[2px] text-[12px] text-textItemBlur">
                {coachResult.grade} · {coachResult.platformLabel}
              </div>
              <div className="mt-[10px] text-[12px] leading-[1.5]">
                {coachResult.summary}
              </div>
            </div>
            <div className="flex flex-col gap-[10px]">
              <div className="grid grid-cols-3 maxMedia:grid-cols-1 gap-[8px]">
                {coachResult.categories.map((category) => (
                  <div
                    key={category.id}
                    className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
                  >
                    <div className="flex items-center justify-between gap-[8px]">
                      <div className="text-[12px] font-[700]">{category.label}</div>
                      <div
                        className={clsx(
                          'text-[11px]',
                          category.status === 'strong'
                            ? 'text-emerald-300'
                            : category.status === 'ok'
                              ? 'text-amber-200'
                              : 'text-red-200'
                        )}
                      >
                        {category.score}
                      </div>
                    </div>
                    <div className="mt-[6px] text-[11px] leading-[1.45] text-textItemBlur line-clamp-3">
                      {category.feedback}
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 maxMedia:grid-cols-1 gap-[8px]">
                <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]">
                  <div className="text-[12px] font-[700]">개선 액션</div>
                  <ul className="mt-[6px] flex flex-col gap-[5px] text-[12px] leading-[1.45] text-textItemBlur">
                    {coachResult.recommendations.slice(0, 4).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]">
                  <div className="text-[12px] font-[700]">해시태그 플랜</div>
                  <div className="mt-[6px] flex flex-wrap gap-[5px]">
                    {coachResult.hashtagPlan.final.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-[999px] bg-newBgColorInner px-[8px] py-[4px] text-[11px] text-textItemBlur"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-[6px]">
                {coachResult.suggestedHooks.slice(0, 5).map((hook) => (
                  <button
                    key={hook}
                    type="button"
                    onClick={() => applyCoachHook(hook)}
                    className="rounded-[8px] bg-btnSimple px-[9px] py-[7px] text-left text-[11px] text-textItemBlur hover:text-newTextColor"
                  >
                    {hook}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
      )}

      {isStudioSurface && (
      <section className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[14px] flex flex-col gap-[12px]">
        <div className="flex flex-wrap items-center justify-between gap-[10px]">
          <div>
            <div className="text-[16px] font-[700]">승인 워크플로우</div>
            <div className="mt-[3px] text-[12px] text-textItemBlur">
              변환 결과를 팀/클라이언트 승인 큐에 넣고 승인된 항목만 발행 큐로 보냅니다.
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-[8px]">
            <Button
              secondary
              loading={approvalLoading}
              onClick={submitApprovalRequest}
              className="rounded-[8px] !h-[36px] whitespace-nowrap"
            >
              승인 요청
            </Button>
            <Button
              secondary
              loading={approvalLoading}
              onClick={scheduleApprovedRequest}
              className="rounded-[8px] !h-[36px] whitespace-nowrap"
            >
              승인 후 큐 생성
            </Button>
            <Button
              secondary
              loading={approvalLoading}
              onClick={createApprovalPublicLink}
              className="rounded-[8px] !h-[36px] whitespace-nowrap"
            >
              외부 링크
            </Button>
            {!!activeApproval?.publicReviewEnabled && (
              <Button
                secondary
                loading={approvalLoading}
                onClick={revokeApprovalPublicLink}
                className="rounded-[8px] !h-[36px] whitespace-nowrap"
              >
                링크 폐기
              </Button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_180px] maxMedia:grid-cols-1 gap-[8px]">
          <input
            value={approvalTitle}
            onChange={(event) => setApprovalTitle(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="승인 요청 제목"
          />
          <input
            value={approvalReviewer}
            onChange={(event) => setApprovalReviewer(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="검토자"
          />
        </div>
        <textarea
          value={approvalNote}
          onChange={(event) => setApprovalNote(event.target.value)}
          className="min-h-[72px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.5]"
          placeholder="검토 메모"
        />
        {!!approvalRequests.length && (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] maxMedia:grid-cols-1 gap-[8px]">
            <select
              value={activeApprovalId}
              onChange={(event) => setActiveApprovalId(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            >
              {approvalRequests.slice(0, 50).map((approval) => (
                <option key={approval.id} value={approval.id}>
                  {approval.title} · {approval.status} · {approval.variants.length}개
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-[6px]">
              <Button
                secondary
                loading={approvalLoading}
                onClick={() => reviewApprovalRequest('approve')}
                className="rounded-[8px] !h-[38px] whitespace-nowrap"
              >
                승인
              </Button>
              <Button
                secondary
                loading={approvalLoading}
                onClick={() => reviewApprovalRequest('request-changes')}
                className="rounded-[8px] !h-[38px] whitespace-nowrap"
              >
                수정 요청
              </Button>
              <Button
                secondary
                loading={approvalLoading}
                onClick={deleteApprovalRequest}
                className="rounded-[8px] !h-[38px] whitespace-nowrap"
              >
                삭제
              </Button>
            </div>
          </div>
        )}
        {activeApproval && (
          <div className="flex flex-col gap-[10px]">
            <div className="grid grid-cols-5 maxMedia:grid-cols-2 gap-[8px]">
              {[
                ['상태', activeApproval.status],
                ['검토자', activeApproval.reviewer || '-'],
                ['채널', activeApproval.variants.length],
                ['이력', activeApproval.history.length],
                [
                  '코멘트',
                  `${approvalCommentStats.unresolved}/${approvalCommentStats.total}`,
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
                >
                  <div className="text-[11px] text-textItemBlur">{label}</div>
                  <div className="mt-[4px] text-[14px] font-[700] break-words">
                    {value}
                  </div>
                </div>
              ))}
            </div>
            {!!activeApprovalPublicUrl && (
              <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]">
                <div className="flex flex-wrap items-center justify-between gap-[8px]">
                  <div className="min-w-0">
                    <div className="text-[11px] font-[700] text-textItemBlur">
                      공개 승인 링크
                    </div>
                    <div className="mt-[4px] break-all text-[12px] leading-[1.5]">
                      {activeApprovalPublicUrl}
                    </div>
                    {activeApproval.publicReviewExpiresAt && (
                      <div className="mt-[4px] text-[11px] text-textItemBlur">
                        만료{' '}
                        {activeApproval.publicReviewExpiresAt
                          .slice(0, 16)
                          .replace('T', ' ')}
                      </div>
                    )}
                  </div>
                  <Button
                    secondary
                    loading={approvalLoading}
                    onClick={() => {
                      void navigator.clipboard.writeText(activeApprovalPublicUrl);
                      toast.show('공개 승인 링크를 복사했습니다.');
                    }}
                    className="rounded-[8px] !h-[34px] whitespace-nowrap"
                  >
                    링크 복사
                  </Button>
                </div>
              </div>
            )}
            <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]">
              <div className="grid grid-cols-[150px_140px_minmax(0,1fr)_110px] maxMedia:grid-cols-1 gap-[8px]">
                <input
                  value={approvalCommentActor}
                  onChange={(event) => setApprovalCommentActor(event.target.value)}
                  className="h-[36px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px]"
                  placeholder="작성자"
                />
                <select
                  value={approvalCommentVisibility}
                  onChange={(event) =>
                    setApprovalCommentVisibility(
                      event.target.value as 'reviewer' | 'internal'
                    )
                  }
                  className="h-[36px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px]"
                >
                  <option value="reviewer">외부 공유</option>
                  <option value="internal">내부</option>
                </select>
                <input
                  value={approvalCommentSelection}
                  onChange={(event) => setApprovalCommentSelection(event.target.value)}
                  className="h-[36px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px]"
                  placeholder="선택 영역"
                />
                <Button
                  secondary
                  loading={approvalLoading}
                  onClick={addApprovalComment}
                  className="rounded-[8px] !h-[36px] whitespace-nowrap"
                >
                  코멘트 추가
                </Button>
              </div>
              <textarea
                value={approvalCommentText}
                onChange={(event) => setApprovalCommentText(event.target.value)}
                className="mt-[8px] min-h-[68px] w-full resize-none bg-newBgColorInner border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.5]"
                placeholder="승인 코멘트"
              />
              <div className="mt-[10px] flex flex-col gap-[8px]">
                {(activeApproval.comments || []).slice(0, 8).map((comment) => (
                  <div
                    key={comment.id}
                    className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-[8px]">
                      <div className="text-[12px] font-[700]">
                        {comment.actor || '검토자'} ·{' '}
                        {comment.visibility === 'internal' ? '내부' : '외부 공유'} ·{' '}
                        {comment.resolved ? '해결됨' : '미해결'}
                      </div>
                      {comment.resolved ? (
                        <Button
                          secondary
                          loading={approvalLoading}
                          onClick={() => resolveApprovalComment(comment.id, false)}
                          className="rounded-[8px] !h-[30px] whitespace-nowrap"
                        >
                          다시 열기
                        </Button>
                      ) : (
                        <Button
                          secondary
                          loading={approvalLoading}
                          onClick={() => resolveApprovalComment(comment.id, true)}
                          className="rounded-[8px] !h-[30px] whitespace-nowrap"
                        >
                          해결
                        </Button>
                      )}
                    </div>
                    <div className="mt-[6px] text-[12px] leading-[1.5] whitespace-pre-wrap break-words">
                      {comment.message}
                    </div>
                    <div className="mt-[6px] text-[11px] text-textItemBlur">
                      {[
                        comment.variantPlatform
                          ? targetPlatformLabel(comment.variantPlatform)
                          : '',
                        comment.variantIndex !== undefined
                          ? `#${comment.variantIndex + 1}`
                          : '',
                        comment.selection,
                        comment.createdAt?.slice(0, 16)?.replace('T', ' '),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                ))}
                {!activeApproval.comments?.length && (
                  <div className="rounded-[8px] border border-dashed border-newBorder bg-newBgColorInner p-[10px] text-[12px] text-textItemBlur">
                    승인 코멘트 없음
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
      )}

      {isStudioSurface && (
      <details className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[14px]">
        <summary className="cursor-pointer text-[13px] font-[700]">
          AI 콘텐츠 캘린더
        </summary>
        <div className="mt-[12px] grid grid-cols-[minmax(0,1fr)_140px_120px_120px_120px] maxMedia:grid-cols-1 gap-[8px]">
          <textarea
            value={calendarBrief}
            onChange={(event) => setCalendarBrief(event.target.value)}
            className="min-h-[112px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.5] font-mono"
            placeholder="캠페인 브리프"
          />
          <select
            value={calendarCadence}
            onChange={(event) =>
              setCalendarCadence(event.target.value as SnapsContentCalendarCadence)
            }
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
          >
            <option value="daily">Daily</option>
            <option value="weekdays">Weekdays</option>
            <option value="three-per-week">3/week</option>
            <option value="weekly-sprint">Sprint</option>
          </select>
          <Button
            secondary
            loading={calendarLoading}
            onClick={previewContentCalendar}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            캘린더 생성
          </Button>
          <Button
            secondary
            loading={calendarLoading}
            onClick={importContentCalendarSources}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            원문 가져오기
          </Button>
          <Button
            secondary
            loading={calendarLoading}
            onClick={createContentCalendarQueue}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            큐 생성
          </Button>
        </div>
        <div className="mt-[8px] grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_80px_80px] maxMedia:grid-cols-1 gap-[8px]">
          <input
            value={calendarCampaign}
            onChange={(event) => setCalendarCampaign(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="캠페인"
          />
          <input
            value={calendarAudience}
            onChange={(event) => setCalendarAudience(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="대상"
          />
          <input
            value={calendarDays}
            onChange={(event) => setCalendarDays(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="일수"
          />
          <input
            value={calendarPostsPerDay}
            onChange={(event) => setCalendarPostsPerDay(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="일당"
          />
        </div>
        <div className="mt-[8px] grid grid-cols-3 maxMedia:grid-cols-1 gap-[8px]">
          <input
            value={calendarPillars}
            onChange={(event) => setCalendarPillars(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="콘텐츠 기둥"
          />
          <input
            value={calendarGoals}
            onChange={(event) => setCalendarGoals(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="목표"
          />
          <input
            value={calendarFormats}
            onChange={(event) => setCalendarFormats(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="형식"
          />
        </div>
        <input
          value={calendarCta}
          onChange={(event) => setCalendarCta(event.target.value)}
          className="mt-[8px] h-[38px] w-full bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
          placeholder="CTA"
        />
        {calendarPreview && (
          <div className="mt-[10px] grid grid-cols-4 maxMedia:grid-cols-2 gap-[8px]">
            {[
              ['항목', calendarPreview.totalItems],
              ['사용', calendarPreview.acceptedItems],
              ['예약 가능', calendarPreview.readyToSchedule],
              ['제외', calendarPreview.invalidItems],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
              >
                <div className="text-[11px] text-textItemBlur">{label}</div>
                <div className="text-[18px] font-[700]">{value}</div>
              </div>
            ))}
          </div>
        )}
        {!!calendarPreview?.warnings?.length && (
          <div className="mt-[8px] text-[12px] text-amber-200">
            {calendarPreview.warnings[0]}
          </div>
        )}
        {!!calendarPreview?.items?.length && (
          <div className="mt-[10px] grid grid-cols-2 maxMedia:grid-cols-1 gap-[8px]">
            {calendarPreview.items.slice(0, 6).map((item) => (
              <div
                key={`${item.itemIndex}-${item.title}`}
                className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px]"
              >
                <div className="flex flex-wrap items-center justify-between gap-[8px]">
                  <span className="font-[700] break-words">{item.title}</span>
                  <span
                    className={clsx(
                      'rounded-[999px] px-[8px] py-[3px] text-[11px]',
                      item.status === 'ready'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : item.status === 'warning'
                          ? 'bg-amber-500/15 text-amber-300'
                          : 'bg-red-500/15 text-red-300'
                    )}
                  >
                    {item.status}
                  </span>
                </div>
                <div className="mt-[5px] text-textItemBlur break-words">
                  {item.platformLabel} · {item.format} · {item.localTime}
                </div>
                <div className="mt-[5px] text-textItemBlur break-words">
                  {item.pillar} · {item.goal}
                </div>
                {!!item.warnings.length && (
                  <div className="mt-[5px] text-amber-200">{item.warnings[0]}</div>
                )}
                <Button
                  secondary
                  onClick={() => useContentCalendarItemInEditor(item)}
                  className="mt-[8px] rounded-[8px] !h-[34px] whitespace-nowrap"
                >
                  편집기로 불러오기
                </Button>
              </div>
            ))}
          </div>
        )}
      </details>
      )}

      {isStudioSurface && (
      <details className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[14px]">
        <summary className="cursor-pointer text-[13px] font-[700]">
          해시태그 세트
        </summary>
        <div className="mt-[12px] grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_130px_130px] maxMedia:grid-cols-1 gap-[8px]">
          <input
            value={hashtagSetTitle}
            onChange={(event) => setHashtagSetTitle(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="세트 이름"
          />
          <input
            value={hashtagSetText}
            onChange={(event) => setHashtagSetText(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="#태그 묶음"
          />
          <select
            value={hashtagSetStrategy}
            onChange={(event) =>
              setHashtagSetStrategy(event.target.value as SnapsHashtagSetStrategy)
            }
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
          >
            <option value="balanced">Balanced</option>
            <option value="reach">Reach</option>
            <option value="community">Community</option>
            <option value="campaign">Campaign</option>
          </select>
          <select
            value={hashtagSetPlacement}
            onChange={(event) =>
              setHashtagSetPlacement(event.target.value as SnapsHashtagSetPlacement)
            }
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
          >
            <option value="caption">Caption</option>
            <option value="first-comment">First comment</option>
          </select>
        </div>
        <div className="mt-[8px] grid grid-cols-[minmax(0,1fr)_110px_110px_110px_110px] maxMedia:grid-cols-1 gap-[8px]">
          <textarea
            value={hashtagSetReusableText}
            onChange={(event) => setHashtagSetReusableText(event.target.value)}
            className="min-h-[78px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.5]"
            placeholder="함께 붙일 짧은 문장"
          />
          <Button
            secondary
            loading={hashtagSetLoading}
            onClick={previewHashtagSet}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            세트 미리보기
          </Button>
          <Button
            secondary
            loading={hashtagSetLoading}
            onClick={saveHashtagSet}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            세트 저장
          </Button>
          <Button
            secondary
            loading={hashtagSetLoading}
            onClick={() => applyHashtagSet()}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            결과에 적용
          </Button>
          <Button
            secondary
            loading={hashtagSetLoading}
            onClick={() => createHashtagSetQueue()}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            세트 큐
          </Button>
        </div>
        {(hashtagSetPreview || hashtagSetApplication) && (
          <div className="mt-[10px] grid grid-cols-4 maxMedia:grid-cols-2 gap-[8px]">
            {[
              ['태그', (hashtagSetApplication?.set || hashtagSetPreview)?.hashtags.length || 0],
              ['채널', (hashtagSetApplication?.set || hashtagSetPreview)?.targetPlatforms.length || 0],
              ['배치', hashtagSetApplication?.placement || hashtagSetPreview?.placement || '-'],
              ['전략', (hashtagSetApplication?.set || hashtagSetPreview)?.strategy || '-'],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
              >
                <div className="text-[11px] text-textItemBlur">{label}</div>
                <div className="text-[18px] font-[700] break-all">{value}</div>
              </div>
            ))}
          </div>
        )}
        {(hashtagSetApplication?.warnings || hashtagSetPreview?.warnings || []).length > 0 && (
          <div className="mt-[8px] text-[12px] text-amber-200">
            {(hashtagSetApplication?.warnings || hashtagSetPreview?.warnings || [])[0]}
          </div>
        )}
        <div className="mt-[12px] border-t border-newBorder pt-[12px]">
          <div className="flex flex-wrap items-center justify-between gap-[8px]">
            <div className="text-[12px] font-[700]">해시태그 트래커</div>
            <div className="flex flex-wrap gap-[8px]">
              <select
                value={hashtagTrackerGoal}
                onChange={(event) =>
                  setHashtagTrackerGoal(event.target.value as SnapsHashtagTrackerGoal)
                }
                className="h-[34px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[9px] text-[12px]"
              >
                <option value="engagement">Engagement</option>
                <option value="reach">Reach</option>
                <option value="saves">Saves</option>
                <option value="clicks">Clicks</option>
                <option value="community">Community</option>
              </select>
              <Button
                secondary
                loading={hashtagSetLoading}
                onClick={previewHashtagTracker}
                className="rounded-[8px] !h-[34px] whitespace-nowrap"
              >
                트래커 분석
              </Button>
              <Button
                secondary
                loading={hashtagSetLoading}
                onClick={saveTrackedHashtagSet}
                className="rounded-[8px] !h-[34px] whitespace-nowrap"
              >
                추천 세트 저장
              </Button>
            </div>
          </div>
          <textarea
            value={hashtagTrackerMetrics}
            onChange={(event) => setHashtagTrackerMetrics(event.target.value)}
            className="mt-[8px] min-h-[82px] w-full resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.5]"
            placeholder="hashtag,platform,posts,impressions,engagements,comments,saves,clicks"
          />
          {hashtagTrackerPreview && (
            <div className="mt-[10px]">
              <div className="grid grid-cols-4 maxMedia:grid-cols-2 gap-[8px]">
                {[
                  ['Best', hashtagTrackerPreview.bestHashtag || '-'],
                  ['Tracked', hashtagTrackerPreview.trackedHashtags],
                  ['Avg ER', `${hashtagTrackerPreview.averageEngagementRate}%`],
                  ['Goal', hashtagTrackerPreview.goal],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
                  >
                    <div className="text-[11px] text-textItemBlur">{label}</div>
                    <div className="text-[16px] font-[700] break-all">{value}</div>
                  </div>
                ))}
              </div>
              {hashtagTrackerPreview.warnings.length > 0 && (
                <div className="mt-[8px] text-[12px] text-amber-200">
                  {hashtagTrackerPreview.warnings[0]}
                </div>
              )}
              <div className="mt-[10px] grid grid-cols-3 maxMedia:grid-cols-1 gap-[8px]">
                {hashtagTrackerPreview.items.slice(0, 6).map((item) => (
                  <div
                    key={item.hashtag}
                    className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-[8px]">
                      <span className="font-[700]">{item.hashtag}</span>
                      <span
                        className={clsx(
                          'rounded-[999px] px-[7px] py-[3px] text-[11px]',
                          item.action === 'keep'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : item.action === 'test'
                              ? 'bg-sky-500/15 text-sky-300'
                              : 'bg-amber-500/15 text-amber-300'
                        )}
                      >
                        {item.action}
                      </span>
                    </div>
                    <div className="mt-[6px] text-textItemBlur">
                      score {item.score} · ER {item.engagementRate}% · {item.trend}
                    </div>
                    <div className="mt-[6px] text-textItemBlur line-clamp-2">
                      {item.reason}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setHashtagSetText(item.suggestedPairings.join(' '))
                      }
                      className="mt-[8px] text-textItemBlur hover:text-newTextColor"
                    >
                      조합 적용
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {(hashtagSetApplication?.set.platformPlans || hashtagSetPreview?.platformPlans || [])
          .length > 0 && (
          <div className="mt-[10px] grid grid-cols-3 maxMedia:grid-cols-1 gap-[8px]">
            {(hashtagSetApplication?.set.platformPlans || hashtagSetPreview?.platformPlans || [])
              .slice(0, 6)
              .map((plan) => (
                <div
                  key={`${plan.platform}-${plan.status}`}
                  className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-[8px]">
                    <span className="font-[700]">{plan.label}</span>
                    <span
                      className={clsx(
                        'rounded-[999px] px-[7px] py-[3px] text-[11px]',
                        plan.status === 'ready'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-amber-500/15 text-amber-300'
                      )}
                    >
                      {plan.status}
                    </span>
                  </div>
                  <div className="mt-[6px] text-textItemBlur break-words">
                    {plan.selectedHashtags.join(' ')}
                  </div>
                  <div className="mt-[5px] text-textItemBlur">
                    {plan.selectedHashtags.length}/{plan.hashtagLimit} tags
                  </div>
                </div>
              ))}
          </div>
        )}
        <div className="mt-[10px] grid grid-cols-4 maxMedia:grid-cols-1 gap-[8px]">
          {hashtagSets.slice(0, 8).map((set) => (
            <div
              key={set.id}
              className={clsx(
                'rounded-[8px] border bg-newBgLineColor p-[10px] text-[11px] leading-[1.45]',
                set.id === activeHashtagSet?.id ? 'border-btnPrimary' : 'border-newBorder'
              )}
            >
              <button
                type="button"
                onClick={() => setActiveHashtagSetId(set.id)}
                className="text-left font-[700] hover:text-newTextColor"
              >
                {set.title}
              </button>
              <div className="mt-[5px] text-textItemBlur line-clamp-2">
                {set.hashtags.slice(0, 6).join(' ')}
              </div>
              <div className="mt-[7px] flex flex-wrap gap-[5px] text-textItemBlur">
                {set.targetPlatforms.slice(0, 3).map((platform) => (
                  <span key={platform}>{targetPlatformLabel(platform)}</span>
                ))}
              </div>
              <div className="mt-[9px] flex flex-wrap gap-[6px]">
                <button
                  type="button"
                  onClick={() => applyHashtagSet(set.id)}
                  className="text-textItemBlur hover:text-newTextColor"
                >
                  적용
                </button>
                <button
                  type="button"
                  onClick={() => createHashtagSetQueue(set.id)}
                  className="text-textItemBlur hover:text-newTextColor"
                >
                  큐
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHashtagSetPreview(set);
                    setActiveHashtagSetId(set.id);
                    setHashtagSetTitle(set.title);
                    setHashtagSetText(set.hashtags.join(' '));
                    setHashtagSetReusableText(set.reusableText);
                    setHashtagSetPlacement(set.placement);
                    setHashtagSetStrategy(set.strategy);
                  }}
                  className="text-textItemBlur hover:text-newTextColor"
                >
                  불러오기
                </button>
                <button
                  type="button"
                  onClick={() => deleteHashtagSet(set.id)}
                  className="text-textItemBlur hover:text-red-300"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
          {!hashtagSets.length && (
            <div className="rounded-[8px] border border-dashed border-newBorder bg-newBgLineColor p-[10px] text-[12px] text-textItemBlur">
              저장된 해시태그 세트가 없습니다.
            </div>
          )}
        </div>
      </details>
      )}

      {isStudioSurface && (
      <details className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[14px]">
        <summary className="cursor-pointer text-[13px] font-[700]">
          첫 댓글 플래너
        </summary>
        <div className="mt-[12px] grid grid-cols-[minmax(0,1fr)_130px_120px_120px] maxMedia:grid-cols-1 gap-[8px]">
          <textarea
            value={firstCommentText}
            onChange={(event) => setFirstCommentText(event.target.value)}
            className="min-h-[104px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.5]"
            placeholder="첫 댓글 텍스트 또는 해시태그 묶음"
          />
          <select
            value={firstCommentStrategy}
            onChange={(event) =>
              setFirstCommentStrategy(event.target.value as SnapsFirstCommentStrategy)
            }
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
          >
            <option value="hashtags">Hashtags</option>
            <option value="question">Question</option>
            <option value="link">Link</option>
            <option value="context">Context</option>
          </select>
          <Button
            secondary
            loading={firstCommentLoading}
            onClick={previewFirstComments}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            댓글 미리보기
          </Button>
          <Button
            secondary
            loading={firstCommentLoading}
            onClick={createFirstCommentQueue}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            첫 댓글 큐
          </Button>
        </div>
        {firstCommentPreview && (
          <div className="mt-[10px] grid grid-cols-4 maxMedia:grid-cols-2 gap-[8px]">
            {[
              ['전체', firstCommentPreview.totalItems],
              ['지원', firstCommentPreview.supportedItems],
              ['미지원', firstCommentPreview.unsupportedItems],
              ['전략', firstCommentPreview.strategy],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
              >
                <div className="text-[11px] text-textItemBlur">{label}</div>
                <div className="text-[18px] font-[700] break-all">{value}</div>
              </div>
            ))}
          </div>
        )}
        {!!firstCommentPreview?.warnings?.length && (
          <div className="mt-[8px] text-[12px] text-amber-200">
            {firstCommentPreview.warnings[0]}
          </div>
        )}
        {!!firstCommentPreview?.items?.length && (
          <div className="mt-[10px] grid grid-cols-[minmax(0,1fr)_minmax(220px,0.65fr)] maxMedia:grid-cols-1 gap-[10px]">
            <div className="flex flex-col gap-[8px]">
              {firstCommentPreview.items.slice(0, 6).map((item) => (
                <div
                  key={`${item.platform}-${item.title}`}
                  className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-[8px]">
                    <div className="min-w-0 font-[700] break-words">
                      {item.label} · {item.title}
                    </div>
                    <span
                      className={clsx(
                        'rounded-[999px] px-[7px] py-[3px] text-[11px]',
                        item.supported
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-amber-500/15 text-amber-300'
                      )}
                    >
                      {item.supported ? '지원' : '확인'}
                    </span>
                  </div>
                  <div className="mt-[6px] rounded-[6px] bg-newBgColor p-[8px] leading-[1.5] whitespace-pre-wrap break-words">
                    {item.firstComment}
                  </div>
                  <div className="mt-[6px] text-textItemBlur break-words">
                    {item.hashtagCount} tags · {item.firstComment.length}/
                    {item.characterLimit}
                  </div>
                  {!!item.warnings.length && (
                    <div className="mt-[5px] text-amber-200">{item.warnings[0]}</div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-[8px]">
              {firstCommentPreview.recommendations.slice(0, 4).map((item) => (
                <div
                  key={item}
                  className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px] leading-[1.5]"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        )}
      </details>
      )}

      {isStudioSurface && (
      <details className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[14px]">
        <summary className="cursor-pointer text-[13px] font-[700]">
          콘텐츠 카테고리 큐
        </summary>
        <div className="mt-[12px] grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_120px_120px] maxMedia:grid-cols-1 gap-[8px]">
          <textarea
            value={categorySourceText}
            onChange={(event) => setCategorySourceText(event.target.value)}
            className="min-h-[112px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.5] font-mono"
            placeholder="카테고리 큐로 나눌 원문"
          />
          <textarea
            value={categoryConfig}
            onChange={(event) => setCategoryConfig(event.target.value)}
            className="min-h-[112px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.5] font-mono"
            placeholder="이름|evergreen|#12b8b8|설명|가중치"
          />
          <Button
            secondary
            loading={categoryLoading}
            onClick={previewContentCategories}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            카테고리 계획
          </Button>
          <Button
            secondary
            loading={categoryLoading}
            onClick={importContentCategorySources}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            원문 가져오기
          </Button>
          <Button
            secondary
            loading={categoryLoading}
            onClick={createContentCategoryQueue}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            카테고리 큐 생성
          </Button>
        </div>
        <div className="mt-[8px] grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_100px_100px] maxMedia:grid-cols-1 gap-[8px]">
          <input
            value={categoryCampaign}
            onChange={(event) => setCategoryCampaign(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="캠페인"
          />
          <input
            value={categorySequence}
            onChange={(event) => setCategorySequence(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="카테고리 순서"
          />
          <input
            value={categoryDays}
            onChange={(event) => setCategoryDays(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="일수"
          />
          <input
            value={categoryPostsPerDay}
            onChange={(event) => setCategoryPostsPerDay(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="일당"
          />
        </div>
        <div className="mt-[8px] grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] maxMedia:grid-cols-1 gap-[8px]">
          <input
            value={categoryCta}
            onChange={(event) => setCategoryCta(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="CTA"
          />
          <input
            value={categoryLinkUrl}
            onChange={(event) => setCategoryLinkUrl(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="링크/UTM 대상 URL"
          />
        </div>
        {categoryPreview && (
          <div className="mt-[10px] grid grid-cols-4 maxMedia:grid-cols-2 gap-[8px]">
            {[
              ['항목', categoryPreview.totalItems],
              ['사용', categoryPreview.acceptedItems],
              ['예약 가능', categoryPreview.readyToSchedule],
              ['제외', categoryPreview.invalidItems],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
              >
                <div className="text-[11px] text-textItemBlur">{label}</div>
                <div className="text-[18px] font-[700]">{value}</div>
              </div>
            ))}
          </div>
        )}
        {!!categoryPreview?.categoryMix?.length && (
          <div className="mt-[10px] flex flex-wrap gap-[8px]">
            {categoryPreview.categoryMix.map((category) => (
              <div
                key={`${category.name}-${category.shareMode}`}
                className="flex items-center gap-[6px] rounded-[8px] border border-newBorder bg-newBgLineColor px-[9px] py-[6px] text-[12px]"
              >
                <span
                  className="h-[10px] w-[10px] rounded-full"
                  style={{ backgroundColor: category.color }}
                />
                <span>{category.name}</span>
                <span className="text-textItemBlur">
                  {category.count} · {category.shareMode}
                </span>
              </div>
            ))}
          </div>
        )}
        {!!categoryPreview?.warnings?.length && (
          <div className="mt-[8px] text-[12px] text-amber-200">
            {categoryPreview.warnings[0]}
          </div>
        )}
        {!!categoryPreview?.items?.length && (
          <div className="mt-[10px] grid grid-cols-2 maxMedia:grid-cols-1 gap-[8px]">
            {categoryPreview.items.slice(0, 6).map((item) => (
              <div
                key={`${item.itemIndex}-${item.title}`}
                className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px]"
              >
                <div className="flex flex-wrap items-center justify-between gap-[8px]">
                  <span className="font-[700] break-words">{item.title}</span>
                  <span
                    className={clsx(
                      'rounded-[999px] px-[8px] py-[3px] text-[11px]',
                      item.status === 'ready'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : item.status === 'warning'
                          ? 'bg-amber-500/15 text-amber-300'
                          : 'bg-red-500/15 text-red-300'
                    )}
                  >
                    {item.status}
                  </span>
                </div>
                <div className="mt-[5px] flex items-center gap-[6px] text-textItemBlur">
                  <span
                    className="h-[9px] w-[9px] rounded-full"
                    style={{ backgroundColor: item.categoryColor }}
                  />
                  <span className="break-words">
                    {item.categoryName} · {item.shareMode} · {item.platformLabel}
                  </span>
                </div>
                <div className="mt-[5px] text-textItemBlur break-words">
                  {item.localTime} · {item.angle}
                </div>
                {!!item.warnings.length && (
                  <div className="mt-[5px] text-amber-200">{item.warnings[0]}</div>
                )}
                <Button
                  secondary
                  onClick={() => useContentCategoryItemInEditor(item)}
                  className="mt-[8px] rounded-[8px] !h-[34px] whitespace-nowrap"
                >
                  편집기로 불러오기
                </Button>
              </div>
            ))}
          </div>
        )}
      </details>
      )}

      {isStudioSurface && (
      <details className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[14px]">
        <summary className="cursor-pointer text-[13px] font-[700]">
          조건부 후속 포스트
        </summary>
        <div className="mt-[12px] grid grid-cols-[minmax(0,1fr)_140px_120px_120px_120px] maxMedia:grid-cols-1 gap-[8px]">
          <textarea
            value={conditionFollowUpText}
            onChange={(event) => setConditionFollowUpText(event.target.value)}
            className="min-h-[112px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.5] font-mono"
            placeholder="조건 충족 시 댓글/스레드로 붙일 후속 문구"
          />
          <select
            value={conditionType}
            onChange={(event) =>
              setConditionType(event.target.value as SnapsPostConditionType)
            }
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
          >
            <option value="above-average">Above average</option>
            <option value="delay">Delay</option>
            <option value="likes">Likes</option>
            <option value="retweets">Retweets</option>
            <option value="comments">Comments</option>
            <option value="impressions">Impressions</option>
            <option value="engagement-rate">Engagement %</option>
          </select>
          <Button
            secondary
            loading={conditionLoading}
            onClick={previewPostCondition}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            조건 평가
          </Button>
          <Button
            secondary
            loading={conditionLoading}
            onClick={importPostConditionSource}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            원문 가져오기
          </Button>
          <Button
            secondary
            loading={conditionLoading}
            onClick={createPostConditionQueue}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            조건 큐 생성
          </Button>
        </div>
        <div className="mt-[8px] grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px] maxMedia:grid-cols-1 gap-[8px]">
          <input
            value={conditionParentTitle}
            onChange={(event) => setConditionParentTitle(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="부모 게시물"
          />
          <input
            value={conditionParentUrl}
            onChange={(event) => setConditionParentUrl(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="부모 게시물 URL"
          />
          <select
            value={conditionParentPlatform}
            onChange={(event) =>
              setConditionParentPlatform(event.target.value as TargetPlatform)
            }
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
          >
            {targetPlatforms.map((platform) => (
              <option key={platform.id} value={platform.id}>
                {platform.label}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-[8px] grid grid-cols-5 maxMedia:grid-cols-2 gap-[8px]">
          {[
            ['좋아요', conditionLikes, setConditionLikes],
            ['리트윗', conditionRetweets, setConditionRetweets],
            ['댓글', conditionComments, setConditionComments],
            ['노출', conditionImpressions, setConditionImpressions],
            ['참여율', conditionEngagementRate, setConditionEngagementRate],
          ].map(([label, value, setter]) => (
            <input
              key={label as string}
              value={value as string}
              onChange={(event) =>
                (setter as (next: string) => void)(event.target.value)
              }
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder={label as string}
            />
          ))}
        </div>
        <div className="mt-[8px] grid grid-cols-[120px_120px_120px_120px_minmax(0,1fr)] maxMedia:grid-cols-1 gap-[8px]">
          <input
            value={conditionThreshold}
            onChange={(event) => setConditionThreshold(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="임계값"
          />
          <input
            value={conditionDelayMinutes}
            onChange={(event) => setConditionDelayMinutes(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="지연분"
          />
          <input
            value={conditionAverageImpressions}
            onChange={(event) => setConditionAverageImpressions(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="평균노출"
          />
          <input
            value={conditionAverageEngagementRate}
            onChange={(event) =>
              setConditionAverageEngagementRate(event.target.value)
            }
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="평균참여"
          />
          <input
            value={conditionCta}
            onChange={(event) => setConditionCta(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="CTA"
          />
        </div>
        <input
          value={conditionPublishedAt}
          onChange={(event) => setConditionPublishedAt(event.target.value)}
          type="datetime-local"
          className="mt-[8px] h-[38px] w-full bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
        />
        {conditionPreview && (
          <div className="mt-[10px] grid grid-cols-4 maxMedia:grid-cols-2 gap-[8px]">
            {[
              ['상태', conditionPreview.status],
              ['충족', conditionPreview.triggerMet ? 'yes' : 'no'],
              ['값', conditionPreview.metricValue],
              ['기준', conditionPreview.threshold],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
              >
                <div className="text-[11px] text-textItemBlur">{label}</div>
                <div className="text-[18px] font-[700] break-all">{value}</div>
              </div>
            ))}
          </div>
        )}
        {conditionPreview && (
          <div className="mt-[10px] rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px] leading-[1.5]">
            <div className="flex flex-wrap items-center justify-between gap-[8px]">
              <div className="font-[700] break-words">
                {conditionPreview.item.title}
              </div>
              <Button
                secondary
                onClick={usePostConditionInEditor}
                className="rounded-[8px] !h-[34px] whitespace-nowrap"
              >
                편집기로 불러오기
              </Button>
            </div>
            <div className="mt-[6px] text-textItemBlur break-words">
              {conditionPreview.conditionSummary}
            </div>
            {!!conditionPreview.warnings.length && (
              <div className="mt-[6px] text-amber-200">
                {conditionPreview.warnings[0]}
              </div>
            )}
          </div>
        )}
      </details>
      )}

      {isStudioSurface && (
      <details className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[14px]">
        <summary className="cursor-pointer text-[13px] font-[700]">
          대량 캠페인 CSV
        </summary>
        <div className="mt-[12px] grid grid-cols-[minmax(0,1fr)_120px_120px_120px] maxMedia:grid-cols-1 gap-[8px]">
          <textarea
            value={bulkCsvText}
            onChange={(event) => setBulkCsvText(event.target.value)}
            className="min-h-[112px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.5] font-mono"
            placeholder="title,topic,caption,platforms,publishDate,mediaUrl,linkUrl,tags"
          />
          <Button
            secondary
            loading={bulkLoading}
            onClick={previewBulkCampaignCsv}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            CSV 미리보기
          </Button>
          <Button
            secondary
            loading={bulkLoading}
            onClick={importBulkCampaignSources}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            원문 가져오기
          </Button>
          <Button
            secondary
            loading={bulkLoading}
            onClick={createBulkCampaignQueue}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            큐 생성
          </Button>
        </div>
        {bulkPreview && (
          <div className="mt-[10px] grid grid-cols-4 maxMedia:grid-cols-2 gap-[8px]">
            {[
              ['행', bulkPreview.totalRows],
              ['사용', bulkPreview.acceptedRows],
              ['예약 가능', bulkPreview.readyToSchedule],
              ['제외', bulkPreview.invalidRows],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
              >
                <div className="text-[11px] text-textItemBlur">{label}</div>
                <div className="text-[18px] font-[700]">{value}</div>
              </div>
            ))}
          </div>
        )}
        {!!bulkPreview?.rows?.length && (
          <div className="mt-[10px] grid gap-[8px]">
            {bulkPreview.rows.slice(0, 3).map((row) => (
              <div
                key={`${row.rowNumber}-${row.title}`}
                className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px]"
              >
                <div className="flex flex-wrap items-center justify-between gap-[8px]">
                  <span className="font-[700]">{row.title}</span>
                  <span
                    className={clsx(
                      'rounded-[999px] px-[8px] py-[3px] text-[11px]',
                      row.status === 'ready'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : row.status === 'warning'
                          ? 'bg-amber-500/15 text-amber-300'
                          : 'bg-red-500/15 text-red-300'
                    )}
                  >
                    {row.status}
                  </span>
                </div>
                <div className="mt-[5px] text-textItemBlur break-all">
                  {row.platforms.map(targetPlatformLabel).join(', ')}
                  {row.publishDate ? ` · ${row.publishDate}` : ''}
                </div>
                {!!row.warnings.length && (
                  <div className="mt-[5px] text-amber-200">{row.warnings[0]}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </details>
      )}

      {isStudioSurface && (
      <details className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[14px]">
        <summary className="cursor-pointer text-[13px] font-[700]">
          RSS 피드 인입
        </summary>
        <div className="mt-[12px] grid grid-cols-[minmax(0,1fr)_minmax(180px,0.55fr)_120px_120px_120px] maxMedia:grid-cols-1 gap-[8px]">
          <textarea
            value={feedXmlText}
            onChange={(event) => setFeedXmlText(event.target.value)}
            className="min-h-[112px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.5] font-mono"
            placeholder="RSS XML 또는 Atom XML"
          />
          <input
            value={feedUrl}
            onChange={(event) => setFeedUrl(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="RSS 피드 URL"
          />
          <Button
            secondary
            loading={feedLoading}
            onClick={previewFeedIntake}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            피드 미리보기
          </Button>
          <Button
            secondary
            loading={feedLoading}
            onClick={importFeedSources}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            원문 가져오기
          </Button>
          <Button
            secondary
            loading={feedLoading}
            onClick={createFeedQueue}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            큐 생성
          </Button>
        </div>
        {feedPreview && (
          <div className="mt-[10px] grid grid-cols-4 maxMedia:grid-cols-2 gap-[8px]">
            {[
              ['항목', feedPreview.totalItems],
              ['사용', feedPreview.acceptedItems],
              ['예약 가능', feedPreview.readyToSchedule],
              ['제외', feedPreview.invalidItems],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
              >
                <div className="text-[11px] text-textItemBlur">{label}</div>
                <div className="text-[18px] font-[700]">{value}</div>
              </div>
            ))}
          </div>
        )}
        {!!feedPreview?.items?.length && (
          <div className="mt-[10px] grid gap-[8px]">
            {feedPreview.items.slice(0, 3).map((item) => (
              <div
                key={`${item.itemIndex}-${item.title}`}
                className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px]"
              >
                <div className="flex flex-wrap items-center justify-between gap-[8px]">
                  <span className="font-[700]">{item.title}</span>
                  <span
                    className={clsx(
                      'rounded-[999px] px-[8px] py-[3px] text-[11px]',
                      item.status === 'ready'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : item.status === 'warning'
                          ? 'bg-amber-500/15 text-amber-300'
                          : 'bg-red-500/15 text-red-300'
                    )}
                  >
                    {item.status}
                  </span>
                </div>
                <div className="mt-[5px] text-textItemBlur break-all">
                  {item.platforms.map(targetPlatformLabel).join(', ')}
                  {item.publishedAt ? ` · ${item.publishedAt}` : ''}
                  {item.linkUrl ? ` · ${item.linkUrl}` : ''}
                </div>
                {!!item.warnings.length && (
                  <div className="mt-[5px] text-amber-200">{item.warnings[0]}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </details>
      )}

      {isStudioSurface && (
      <details className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[14px]">
        <summary className="cursor-pointer text-[13px] font-[700]">
          비주얼 캐러셀
        </summary>
        <div className="mt-[12px] grid grid-cols-[minmax(0,1fr)_120px_120px_120px_120px_120px] maxMedia:grid-cols-1 gap-[8px]">
          <textarea
            value={carouselSourceText}
            onChange={(event) => setCarouselSourceText(event.target.value)}
            className="min-h-[112px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.5] font-mono"
            placeholder="캐러셀 원문"
          />
          <select
            value={carouselTemplate}
            onChange={(event) =>
              setCarouselTemplate(event.target.value as SnapsCarouselTemplate)
            }
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
          >
            <option value="listicle">Listicle</option>
            <option value="quote">Quote</option>
            <option value="problem-solution">Problem</option>
            <option value="report">Report</option>
            <option value="launch">Launch</option>
          </select>
          <select
            value={carouselAspectRatio}
            onChange={(event) =>
              setCarouselAspectRatio(event.target.value as SnapsCarouselAspectRatio)
            }
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
          >
            <option value="square">1:1</option>
            <option value="portrait">4:5</option>
            <option value="story">9:16</option>
            <option value="landscape">16:9</option>
          </select>
          <Button
            secondary
            loading={carouselLoading}
            onClick={previewCarouselVisual}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            캐러셀 미리보기
          </Button>
          <Button
            secondary
            loading={carouselLoading}
            onClick={copyCarouselExport}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            HTML 내보내기
          </Button>
          <Button
            secondary
            loading={carouselLoading}
            onClick={createCarouselQueue}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            큐 생성
          </Button>
        </div>
        <div className="mt-[8px] grid grid-cols-[112px_112px_minmax(0,1fr)] maxMedia:grid-cols-1 gap-[8px]">
          <input
            type="color"
            aria-label="브랜드 색상"
            value={carouselBrandColor}
            onChange={(event) => setCarouselBrandColor(event.target.value)}
            className="h-[38px] w-full bg-newBgLineColor border border-newBorder rounded-[8px] p-[3px]"
          />
          <input
            type="color"
            aria-label="강조 색상"
            value={carouselAccentColor}
            onChange={(event) => setCarouselAccentColor(event.target.value)}
            className="h-[38px] w-full bg-newBgLineColor border border-newBorder rounded-[8px] p-[3px]"
          />
          <input
            value={carouselCta}
            onChange={(event) => setCarouselCta(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="마지막 장 CTA"
          />
        </div>
        {carouselPreview && (
          <div className="mt-[10px] grid grid-cols-4 maxMedia:grid-cols-2 gap-[8px]">
            {[
              ['슬라이드', carouselPreview.slideCount],
              [
                '비율',
                `${carouselPreview.dimensions.width}:${carouselPreview.dimensions.height}`,
              ],
              ['템플릿', carouselPreview.template],
              ['미디어', carouselPreview.media.length],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
              >
                <div className="text-[11px] text-textItemBlur">{label}</div>
                <div className="text-[18px] font-[700] break-all">{value}</div>
              </div>
            ))}
          </div>
        )}
        {!!carouselPreview?.warnings?.length && (
          <div className="mt-[8px] text-[12px] text-amber-200">
            {carouselPreview.warnings[0]}
          </div>
        )}
        {!!carouselPreview?.slides?.length && (
          <div className="mt-[10px] grid grid-cols-3 maxMedia:grid-cols-1 gap-[10px]">
            {carouselPreview.slides.slice(0, 6).map((slide) => (
              <div
                key={slide.slideIndex}
                className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[8px] text-[12px]"
              >
                <div
                  className="overflow-hidden rounded-[6px] bg-newBgColor"
                  style={{
                    aspectRatio: `${carouselPreview.dimensions.width} / ${carouselPreview.dimensions.height}`,
                  }}
                >
                  <img
                    src={slide.svgDataUrl}
                    alt={slide.alt}
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="mt-[8px] flex items-start justify-between gap-[8px]">
                  <div className="min-w-0">
                    <div className="font-[700] break-words">{slide.title}</div>
                    <div className="mt-[4px] text-textItemBlur line-clamp-2 break-words">
                      {slide.body}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-[999px] bg-newBgColor px-[7px] py-[3px] text-[11px] text-textItemBlur">
                    {String(slide.slideIndex).padStart(2, '0')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </details>
      )}

      {isStudioSurface && (
      <details className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[14px]">
        <summary className="cursor-pointer text-[13px] font-[700]">
          비주얼 피드 플래너
        </summary>
        <div className="mt-[12px] grid grid-cols-[minmax(0,1fr)_130px_120px_120px] maxMedia:grid-cols-1 gap-[8px]">
          <textarea
            value={visualPlannerText}
            onChange={(event) => setVisualPlannerText(event.target.value)}
            className="min-h-[112px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.5] font-mono"
            placeholder="title|imageUrl|status|publishDate|caption|mediaType"
          />
          <select
            value={visualPlannerViewMode}
            onChange={(event) =>
              setVisualPlannerViewMode(
                event.target.value as SnapsVisualFeedPlannerViewMode
              )
            }
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
          >
            <option value="square">Square</option>
            <option value="vertical">Vertical</option>
          </select>
          <Button
            secondary
            loading={visualPlannerLoading}
            onClick={previewVisualFeedPlanner}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            피드 미리보기
          </Button>
          <Button
            secondary
            loading={visualPlannerLoading}
            onClick={createVisualFeedPlannerQueue}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            피드 큐
          </Button>
        </div>
        <label className="mt-[8px] flex items-center gap-[8px] text-[12px] text-textItemBlur">
          <input
            type="checkbox"
            checked={visualPlannerIncludeDrafts}
            onChange={(event) => setVisualPlannerIncludeDrafts(event.target.checked)}
            className="h-[14px] w-[14px]"
          />
          Draft 표시
        </label>
        {visualPlannerPreview && (
          <div className="mt-[10px] grid grid-cols-5 maxMedia:grid-cols-2 gap-[8px]">
            {[
              ['점수', visualPlannerPreview.aestheticScore],
              ['전체', visualPlannerPreview.totalItems],
              ['Draft', visualPlannerPreview.draftItems],
              ['예약', visualPlannerPreview.scheduledItems],
              ['행', visualPlannerPreview.rows],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
              >
                <div className="text-[11px] text-textItemBlur">{label}</div>
                <div className="text-[18px] font-[700] break-all">{value}</div>
              </div>
            ))}
          </div>
        )}
        {!!visualPlannerPreview?.warnings?.length && (
          <div className="mt-[8px] text-[12px] text-amber-200">
            {visualPlannerPreview.warnings[0]}
          </div>
        )}
        {!!visualPlannerPreview?.items?.length && (
          <div className="mt-[10px] grid grid-cols-[minmax(0,1.05fr)_minmax(220px,0.7fr)] maxMedia:grid-cols-1 gap-[12px]">
            <div className="grid grid-cols-3 gap-[6px] rounded-[8px] border border-newBorder bg-newBgLineColor p-[8px]">
              {visualPlannerPreview.items.slice(0, 18).map((item) => (
                <div
                  key={item.id}
                  className="relative overflow-hidden rounded-[6px] border border-newBorder bg-newBgColor"
                  style={{
                    aspectRatio:
                      visualPlannerPreview.viewMode === 'vertical' ? '4 / 5' : '1 / 1',
                    opacity: item.opacity,
                  }}
                >
                  <img
                    src={item.thumbnail || item.imageUrl}
                    alt={item.alt || item.title}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute left-[5px] top-[5px] rounded-[999px] bg-[#041313]/80 px-[6px] py-[2px] text-[10px] font-[800] text-[#f8fafc]">
                    {item.row}/{item.column}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-[#041313]/80 p-[5px] text-[10px] font-[700] leading-[1.2]">
                    <div className="line-clamp-1">{item.title}</div>
                    <div className="text-textItemBlur">{item.status}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-[8px]">
              {visualPlannerPreview.recommendations.slice(0, 4).map((item) => (
                <div
                  key={item}
                  className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px] leading-[1.5]"
                >
                  {item}
                </div>
              ))}
              {visualPlannerPreview.items.slice(0, 5).map((item) => (
                <div
                  key={`row-${item.id}`}
                  className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-[8px]">
                    <span className="font-[700] break-words">{item.title}</span>
                    <span className="rounded-[999px] bg-newBgColor px-[7px] py-[3px] text-[11px] text-textItemBlur">
                      {item.mediaType}
                    </span>
                  </div>
                  <div className="mt-[5px] text-textItemBlur break-words">
                    {item.publishDate
                      ? item.publishDate.slice(0, 16).replace('T', ' ')
                      : item.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </details>
      )}

      {isStudioSurface && (
      <details className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[14px]">
        <summary className="cursor-pointer text-[13px] font-[700]">
          에버그린 재활용
        </summary>
        <div className="mt-[12px] grid grid-cols-[minmax(0,1fr)_120px_120px_120px_120px_120px] maxMedia:grid-cols-1 gap-[8px]">
          <textarea
            value={recycleSourceText}
            onChange={(event) => setRecycleSourceText(event.target.value)}
            className="min-h-[112px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.5] font-mono"
            placeholder="성과가 좋았던 원문"
          />
          <input
            value={recycleCategory}
            onChange={(event) => setRecycleCategory(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="카테고리"
          />
          <select
            value={recycleCadence}
            onChange={(event) =>
              setRecycleCadence(event.target.value as SnapsEvergreenCadence)
            }
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
          >
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <Button
            secondary
            loading={recycleLoading}
            onClick={previewRecycleQueue}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            재활용 미리보기
          </Button>
          <Button
            secondary
            loading={recycleLoading}
            onClick={importRecycleSources}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            원문 가져오기
          </Button>
          <Button
            secondary
            loading={recycleLoading}
            onClick={createRecycleQueue}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            큐 생성
          </Button>
        </div>
        <div className="mt-[8px] grid grid-cols-[112px_minmax(0,1fr)_minmax(0,1fr)] maxMedia:grid-cols-1 gap-[8px]">
          <input
            value={recycleRepeatCount}
            onChange={(event) => setRecycleRepeatCount(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="반복 수"
          />
          <input
            value={recycleTopPostUrl}
            onChange={(event) => setRecycleTopPostUrl(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="성과 좋은 원본 URL"
          />
          <input
            value={recyclePerformanceNote}
            onChange={(event) => setRecyclePerformanceNote(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="성과 근거"
          />
        </div>
        {recyclePreview && (
          <div className="mt-[10px] grid grid-cols-4 maxMedia:grid-cols-2 gap-[8px]">
            {[
              ['항목', recyclePreview.totalItems],
              ['사용', recyclePreview.acceptedItems],
              ['예약 가능', recyclePreview.readyToSchedule],
              ['제외', recyclePreview.invalidItems],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
              >
                <div className="text-[11px] text-textItemBlur">{label}</div>
                <div className="text-[18px] font-[700]">{value}</div>
              </div>
            ))}
          </div>
        )}
        {!!recyclePreview?.warnings?.length && (
          <div className="mt-[8px] text-[12px] text-amber-200">
            {recyclePreview.warnings[0]}
          </div>
        )}
        {!!recyclePreview?.items?.length && (
          <div className="mt-[10px] grid grid-cols-2 maxMedia:grid-cols-1 gap-[8px]">
            {recyclePreview.items.slice(0, 4).map((item) => (
              <div
                key={`${item.itemIndex}-${item.title}`}
                className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px]"
              >
                <div className="flex flex-wrap items-center justify-between gap-[8px]">
                  <span className="font-[700] break-words">{item.title}</span>
                  <span
                    className={clsx(
                      'rounded-[999px] px-[8px] py-[3px] text-[11px]',
                      item.status === 'ready'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : item.status === 'warning'
                          ? 'bg-amber-500/15 text-amber-300'
                          : 'bg-red-500/15 text-red-300'
                    )}
                  >
                    {item.status}
                  </span>
                </div>
                <div className="mt-[5px] text-textItemBlur break-words">
                  {item.angle} · {item.cadence}
                  {item.publishDate ? ` · ${item.publishDate}` : ''}
                </div>
                <div className="mt-[5px] text-textItemBlur break-words">
                  {item.platforms.map(targetPlatformLabel).join(', ')}
                </div>
                {!!item.warnings.length && (
                  <div className="mt-[5px] text-amber-200">{item.warnings[0]}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </details>
      )}

      {isStudioSurface && (
      <details className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[14px]">
        <summary className="cursor-pointer text-[13px] font-[700]">
          반복 게시 큐
        </summary>
        <div className="mt-[12px] grid grid-cols-[minmax(0,1fr)_120px_120px_120px_120px_120px] maxMedia:grid-cols-1 gap-[8px]">
          <textarea
            value={recurringSourceText}
            onChange={(event) => setRecurringSourceText(event.target.value)}
            className="min-h-[112px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.5] font-mono"
            placeholder="반복 게시 원문"
          />
          <select
            value={recurringCadence}
            onChange={(event) =>
              setRecurringCadence(event.target.value as SnapsRecurringCadence)
            }
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option>
            <option value="monthly">Monthly</option>
            <option value="custom-days">Custom</option>
          </select>
          <select
            value={recurringVariationMode}
            onChange={(event) =>
              setRecurringVariationMode(event.target.value as SnapsRecurringVariationMode)
            }
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
          >
            <option value="angle-rotation">각도 순환</option>
            <option value="same">동일 메시지</option>
          </select>
          <Button
            secondary
            loading={recurringLoading}
            onClick={previewRecurringPosts}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            반복 미리보기
          </Button>
          <Button
            secondary
            loading={recurringLoading}
            onClick={importRecurringSources}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            원문 가져오기
          </Button>
          <Button
            secondary
            loading={recurringLoading}
            onClick={createRecurringQueue}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            큐 생성
          </Button>
        </div>
        <div className="mt-[8px] grid grid-cols-[112px_112px_112px_minmax(0,1fr)] maxMedia:grid-cols-1 gap-[8px]">
          <input
            value={recurringRepeatCount}
            onChange={(event) => setRecurringRepeatCount(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="반복 수"
          />
          <input
            value={recurringIntervalDays}
            onChange={(event) => setRecurringIntervalDays(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="간격 일수"
          />
          <input
            value={recurringLocalTime}
            onChange={(event) => setRecurringLocalTime(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="10:00"
          />
          <input
            value={recurringCta}
            onChange={(event) => setRecurringCta(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="CTA"
          />
        </div>
        {recurringPreview && (
          <div className="mt-[10px] grid grid-cols-4 maxMedia:grid-cols-2 gap-[8px]">
            {[
              ['항목', recurringPreview.totalItems],
              ['사용', recurringPreview.acceptedItems],
              ['예약 가능', recurringPreview.readyToSchedule],
              ['제외', recurringPreview.invalidItems],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
              >
                <div className="text-[11px] text-textItemBlur">{label}</div>
                <div className="text-[18px] font-[700]">{value}</div>
              </div>
            ))}
          </div>
        )}
        {!!recurringPreview?.warnings?.length && (
          <div className="mt-[8px] text-[12px] text-amber-200">
            {recurringPreview.warnings[0]}
          </div>
        )}
        {!!recurringPreview?.items?.length && (
          <div className="mt-[10px] grid grid-cols-2 maxMedia:grid-cols-1 gap-[8px]">
            {recurringPreview.items.slice(0, 4).map((item) => (
              <div
                key={`${item.itemIndex}-${item.title}`}
                className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px]"
              >
                <div className="flex flex-wrap items-center justify-between gap-[8px]">
                  <span className="font-[700] break-words">{item.title}</span>
                  <span
                    className={clsx(
                      'rounded-[999px] px-[8px] py-[3px] text-[11px]',
                      item.status === 'ready'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : item.status === 'warning'
                          ? 'bg-amber-500/15 text-amber-300'
                          : 'bg-red-500/15 text-red-300'
                    )}
                  >
                    {item.status}
                  </span>
                </div>
                <div className="mt-[5px] text-textItemBlur break-words">
                  {item.variation} · {item.cadence} · {item.publishDate}
                </div>
                <div className="mt-[5px] text-textItemBlur break-words">
                  {item.platforms.map(targetPlatformLabel).join(', ')}
                </div>
                {!!item.warnings.length && (
                  <div className="mt-[5px] text-amber-200">{item.warnings[0]}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </details>
      )}

      {isStudioSurface && (
      <details className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[14px]">
        <summary className="cursor-pointer text-[13px] font-[700]">
          재배포 큐
        </summary>
        <div className="mt-[12px] grid grid-cols-[minmax(0,1fr)_120px_120px_120px_120px_120px] maxMedia:grid-cols-1 gap-[8px]">
          <textarea
            value={repurposeSourceText}
            onChange={(event) => setRepurposeSourceText(event.target.value)}
            className="min-h-[112px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.5] font-mono"
            placeholder="source|detectedAt|url|title|description"
          />
          <select
            value={repurposeWorkflowMode}
            onChange={(event) =>
              setRepurposeWorkflowMode(event.target.value as SnapsRepurposeWorkflowMode)
            }
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
          >
            <option value="schedule">일정 슬롯</option>
            <option value="asap">ASAP</option>
          </select>
          <select
            value={repurposeContentFilter}
            disabled={repurposeWorkflowMode === 'asap'}
            onChange={(event) =>
              setRepurposeContentFilter(event.target.value as SnapsRepurposeContentFilter)
            }
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px] disabled:opacity-50"
          >
            <option value="all-content">전체</option>
            <option value="future-only">새 콘텐츠만</option>
            <option value="existing-only">기존 콘텐츠만</option>
          </select>
          <Button
            secondary
            loading={repurposeLoading}
            onClick={previewRepurposeQueue}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            재배포 미리보기
          </Button>
          <Button
            secondary
            loading={repurposeLoading}
            onClick={importRepurposeSources}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            원문 가져오기
          </Button>
          <Button
            secondary
            loading={repurposeLoading}
            onClick={createRepurposeQueue}
            className="rounded-[8px] !h-[38px] whitespace-nowrap"
          >
            큐 생성
          </Button>
        </div>
        <div className="mt-[8px] grid grid-cols-[120px_minmax(0,1fr)] maxMedia:grid-cols-1 gap-[8px]">
          <input
            value={repurposeSourcePlatform}
            onChange={(event) => setRepurposeSourcePlatform(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="youtube"
          />
          <textarea
            value={repurposeSlots}
            onChange={(event) => setRepurposeSlots(event.target.value)}
            className="min-h-[74px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.5] font-mono"
            placeholder="Label|dayOfWeek|start|end"
          />
        </div>
        {repurposePreview && (
          <div className="mt-[10px] grid grid-cols-4 maxMedia:grid-cols-2 gap-[8px]">
            {[
              ['항목', repurposePreview.totalItems],
              ['사용', repurposePreview.acceptedItems],
              ['대기', repurposePreview.readyToSchedule],
              ['무시', repurposePreview.ignoredItems],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
              >
                <div className="text-[11px] text-textItemBlur">{label}</div>
                <div className="text-[18px] font-[700]">{value}</div>
              </div>
            ))}
          </div>
        )}
        {!!repurposePreview?.warnings?.length && (
          <div className="mt-[8px] text-[12px] text-amber-200">
            {repurposePreview.warnings[0]}
          </div>
        )}
        {!!repurposePreview?.scheduleSlots?.length && (
          <div className="mt-[10px] flex flex-wrap gap-[6px] text-[11px] text-textItemBlur">
            {repurposePreview.scheduleSlots.slice(0, 5).map((slot) => (
              <span
                key={slot.id}
                className="rounded-[999px] border border-newBorder bg-newBgLineColor px-[8px] py-[4px]"
              >
                {slot.label} {slot.startTime}
              </span>
            ))}
          </div>
        )}
        {!!repurposePreview?.items?.length && (
          <div className="mt-[10px] grid grid-cols-2 maxMedia:grid-cols-1 gap-[8px]">
            {repurposePreview.items.slice(0, 4).map((item) => (
              <div
                key={`${item.itemIndex}-${item.title}`}
                className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px]"
              >
                <div className="flex flex-wrap items-center justify-between gap-[8px]">
                  <span className="font-[700] break-words">{item.title}</span>
                  <span
                    className={clsx(
                      'rounded-[999px] px-[8px] py-[3px] text-[11px]',
                      item.status === 'ready'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : item.status === 'queued'
                          ? 'bg-sky-500/15 text-sky-300'
                          : item.status === 'ignored'
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-red-500/15 text-red-300'
                    )}
                  >
                    {item.status}
                  </span>
                </div>
                <div className="mt-[5px] text-textItemBlur break-words">
                  {item.sourcePlatform} · {item.contentScope} · {item.action}
                </div>
                <div className="mt-[5px] text-textItemBlur break-words">
                  {item.assignedSlot
                    ? `${item.assignedSlot.label} · ${item.publishDate}`
                    : item.publishDate || 'manual review'}
                </div>
                <div className="mt-[5px] text-textItemBlur break-words">
                  {item.targetPlatforms.map(targetPlatformLabel).join(', ')}
                </div>
                {!!item.warnings.length && (
                  <div className="mt-[5px] text-amber-200">{item.warnings[0]}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </details>
      )}

      {isStudioSurface && (
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

          <details className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px]">
            <summary className="cursor-pointer text-[12px] font-[700]">
              소스 리졸버
            </summary>
            <div className="mt-[10px] flex flex-col gap-[8px]">
              <div className="grid grid-cols-[126px_minmax(0,1fr)] maxMedia:grid-cols-1 gap-[8px]">
                <select
                  value={resolverType}
                  onChange={(event) =>
                    setResolverType(event.target.value as SnapsSourceResolverType)
                  }
                  className="h-[38px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px]"
                >
                  <option value="auto">Auto</option>
                  <option value="article">Article URL</option>
                  <option value="youtube">YouTube</option>
                  <option value="tiktok">TikTok</option>
                  <option value="x">X/Tweet</option>
                  <option value="pdf">PDF</option>
                  <option value="audio">Audio</option>
                  <option value="text">Text</option>
                  <option value="research">AI Research</option>
                </select>
                <input
                  value={resolverUrl}
                  onChange={(event) => setResolverUrl(event.target.value)}
                  className="h-[38px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px]"
                  placeholder="웹사이트, YouTube, TikTok, PDF, X URL"
                />
              </div>
              <div className="grid grid-cols-2 maxMedia:grid-cols-1 gap-[8px]">
                <input
                  value={resolverQuery}
                  onChange={(event) => setResolverQuery(event.target.value)}
                  className="h-[38px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px]"
                  placeholder="AI research query"
                />
                <input
                  value={resolverInstructions}
                  onChange={(event) => setResolverInstructions(event.target.value)}
                  className="h-[38px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px]"
                  placeholder="추출 후 변환 지시"
                />
              </div>
              <textarea
                value={resolverText}
                onChange={(event) => setResolverText(event.target.value)}
                className="min-h-[72px] resize-none bg-newBgColorInner border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.5]"
                placeholder="Raw text source"
              />
              <div className="grid grid-cols-3 maxMedia:grid-cols-1 gap-[8px]">
                <Button
                  secondary
                  loading={resolverLoading}
                  onClick={previewResolvedSource}
                  className="rounded-[8px] !h-[38px] whitespace-nowrap"
                >
                  리졸브 미리보기
                </Button>
                <Button
                  secondary
                  loading={resolverLoading}
                  onClick={useResolvedSourceInEditor}
                  className="rounded-[8px] !h-[38px] whitespace-nowrap"
                >
                  편집기로 불러오기
                </Button>
                <Button
                  secondary
                  loading={resolverLoading}
                  onClick={importResolvedSource}
                  className="rounded-[8px] !h-[38px] whitespace-nowrap"
                >
                  리졸브 가져오기
                </Button>
              </div>
              {resolverPreview && (
                <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px] text-[12px] leading-[1.5]">
                  <div className="flex flex-wrap items-center justify-between gap-[8px]">
                    <span className="font-[700] break-words">
                      {resolverPreview.title}
                    </span>
                    <span className="text-textItemBlur">
                      {resolverPreview.sourceType} · {resolverPreview.wordCount} words
                    </span>
                  </div>
                  <div className="mt-[6px] text-textItemBlur line-clamp-3">
                    {resolverPreview.sourceText}
                  </div>
                  {!!resolverPreview.warnings.length && (
                    <div className="mt-[6px] text-amber-200">
                      {resolverPreview.warnings[0]}
                    </div>
                  )}
                </div>
              )}
            </div>
          </details>

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
          <div className="grid grid-cols-[1fr_auto] maxMedia:grid-cols-1 gap-[8px] items-start">
            <div className="min-h-[38px] rounded-[8px] border border-newBorder bg-newBgLineColor px-[10px] py-[8px] text-[12px] leading-[1.5] text-textItemBlur">
              {bestTime
                ? `추천 예약 시간: ${
                    bestTime.recommendedDateLocal ||
                    bestTime.recommendedDate.slice(0, 16)
                  }`
                : '연결 채널 게시 시간과 기존 예약을 기준으로 빈 슬롯을 추천합니다.'}
            </div>
            <Button
              secondary
              loading={bestTimeLoading}
              onClick={loadBestScheduleTime}
              className="rounded-[8px] !h-[38px] whitespace-nowrap"
            >
              추천 시간
            </Button>
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
      )}

      {isAnalyticsSurface && (
      <div className="grid grid-cols-2 2xl:grid-cols-3 maxMedia:grid-cols-1 gap-[16px]">
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
          <div className="flex flex-wrap items-center justify-between gap-[10px]">
            <div className="text-[16px] font-[700]">판매 링크/매출 귀속</div>
            <div className="flex flex-wrap justify-end gap-[8px]">
              <Button
                secondary
                loading={salesLoading}
                onClick={saveSalesCampaign}
                className="rounded-[8px] !h-[36px] whitespace-nowrap"
              >
                링크 저장
              </Button>
              <Button
                secondary
                loading={salesLoading}
                onClick={generateSalesProposal}
                className="rounded-[8px] !h-[36px] whitespace-nowrap"
              >
                파일럿 제안서
              </Button>
              <Button
                secondary
                loading={salesLoading}
                onClick={generateSalesReport}
                className="rounded-[8px] !h-[36px] whitespace-nowrap"
              >
                수익 리포트
              </Button>
            </div>
          </div>
          <input
            value={salesCampaignTitle}
            onChange={(event) => setSalesCampaignTitle(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="캠페인 이름"
          />
          <input
            value={salesDestinationUrl}
            onChange={(event) => setSalesDestinationUrl(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="판매/상담 URL"
          />
          <div className="grid grid-cols-[1fr_130px] maxMedia:grid-cols-1 gap-[8px]">
            <input
              value={salesCta}
              onChange={(event) => setSalesCta(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="CTA"
            />
            <select
              value={salesPlatform}
              onChange={(event) => setSalesPlatform(event.target.value as TargetPlatform)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            >
              {targetPlatforms.map((platform) => (
                <option key={platform.id} value={platform.id}>
                  {platform.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_100px_140px] maxMedia:grid-cols-1 gap-[8px]">
            <input
              value={salesLeadName}
              onChange={(event) => setSalesLeadName(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="리드/고객명"
            />
            <input
              value={salesProposalSegment}
              onChange={(event) => setSalesProposalSegment(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="고객 세그먼트"
            />
            <input
              value={salesPilotDays}
              onChange={(event) => setSalesPilotDays(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="일수"
            />
            <input
              value={salesTargetRevenue}
              onChange={(event) => setSalesTargetRevenue(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="목표 매출"
            />
          </div>
          {!!salesCampaigns.length && (
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] maxMedia:grid-cols-1 gap-[8px]">
              <select
                value={activeSalesCampaignId}
                onChange={(event) => setActiveSalesCampaignId(event.target.value)}
                className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              >
                {salesCampaigns.slice(0, 30).map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.title}
                  </option>
                ))}
              </select>
              <Button
                secondary
                onClick={copyActiveSalesLink}
                className="rounded-[8px] !h-[38px]"
              >
                링크 복사
              </Button>
              <Button
                secondary
                onClick={copyActiveSalesBioLink}
                className="rounded-[8px] !h-[38px] whitespace-nowrap"
              >
                바이오 복사
              </Button>
              <Button
                secondary
                onClick={copyActiveSalesHubLink}
                className="rounded-[8px] !h-[38px] whitespace-nowrap"
              >
                허브 복사
              </Button>
              <Button
                secondary
                loading={salesLoading}
                onClick={deleteSalesCampaign}
                className="rounded-[8px] !h-[38px]"
              >
                삭제
              </Button>
            </div>
          )}
          {activeSalesCampaign && (
            <div className="grid grid-cols-3 maxMedia:grid-cols-1 gap-[8px]">
              <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[11px] leading-[1.5] text-textItemBlur break-all">
                <div className="mb-[4px] font-[700]">추적 URL</div>
                {activeSalesCampaign.trackingUrl}
              </div>
              <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[11px] leading-[1.5] text-textItemBlur break-all">
                <div className="mb-[4px] font-[700]">바이오 페이지</div>
                {activeSalesCampaign.linkInBioUrl}
              </div>
              <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[11px] leading-[1.5] text-textItemBlur break-all">
                <div className="mb-[4px] font-[700]">바이오 허브</div>
                {activeSalesHubUrl}
              </div>
            </div>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] maxMedia:grid-cols-1 gap-[8px]">
            <input
              value={salesAmount}
              onChange={(event) => setSalesAmount(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="구매 금액"
            />
            <Button
              secondary
              loading={salesLoading}
              onClick={() => recordSalesEvent('click')}
              className="rounded-[8px] !h-[38px] whitespace-nowrap"
            >
              클릭
            </Button>
            <Button
              secondary
              loading={salesLoading}
              onClick={() => recordSalesEvent('lead')}
              className="rounded-[8px] !h-[38px] whitespace-nowrap"
            >
              리드
            </Button>
            <Button
              secondary
              loading={salesLoading}
              onClick={() => recordSalesEvent('purchase')}
              className="rounded-[8px] !h-[38px] whitespace-nowrap"
            >
              구매
            </Button>
          </div>
          {salesProposal && (
            <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px] text-[12px] leading-[1.55] flex flex-col gap-[10px]">
              <div className="flex flex-wrap items-start justify-between gap-[8px]">
                <div className="min-w-0">
                  <div className="text-[13px] font-[700] break-words">
                    {salesProposal.packageName}
                  </div>
                  <div className="text-textItemBlur break-words">
                    {salesProposal.leadName} · {salesProposal.segment}
                  </div>
                </div>
                <div className="text-right text-[11px] text-textItemBlur">
                  {salesProposal.pilotDays}일 · 목표 {salesProposal.targetRevenue}
                  {salesProposal.currency}
                </div>
              </div>
              <div className="break-words">{salesProposal.offer}</div>
              <div className="grid grid-cols-3 maxMedia:grid-cols-1 gap-[8px]">
                {[
                  ['파일럿', `${salesProposal.pricing.pilotFee}${salesProposal.pricing.currency}`],
                  ['월 운영', `${salesProposal.pricing.monthlyFee}${salesProposal.pricing.currency}`],
                  [
                    '현재 증거',
                    `${salesProposal.evidence.revenue}${salesProposal.currency} / 클릭 ${salesProposal.evidence.clicks}`,
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px] min-w-0"
                  >
                    <div className="text-[11px] text-textItemBlur">{label}</div>
                    <div className="text-[13px] font-[700] break-words">{value}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px] break-words">
                {salesProposal.pitch}
              </div>
              <div className="grid grid-cols-2 maxMedia:grid-cols-1 gap-[8px]">
                <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px]">
                  <div className="mb-[6px] text-[11px] font-[700] text-textItemBlur">
                    성공 기준
                  </div>
                  <ul className="list-disc pl-[16px] flex flex-col gap-[4px]">
                    {salesProposal.successMetrics.slice(0, 4).map((item) => (
                      <li key={item} className="break-words">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px]">
                  <div className="mb-[6px] text-[11px] font-[700] text-textItemBlur">
                    다음 액션
                  </div>
                  <ul className="list-disc pl-[16px] flex flex-col gap-[4px]">
                    {salesProposal.nextSteps.slice(0, 4).map((item) => (
                      <li key={item} className="break-words">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="grid grid-cols-2 maxMedia:grid-cols-1 gap-[8px]">
                {salesProposal.timeline.slice(0, 4).map((item) => (
                  <div
                    key={item.day}
                    className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px] min-w-0"
                  >
                    <div className="text-[11px] font-[700] text-textItemBlur">
                      {item.day}
                    </div>
                    <div className="break-words">{item.work}</div>
                    <div className="mt-[4px] text-[11px] text-textItemBlur break-words">
                      {item.proof}
                    </div>
                  </div>
                ))}
              </div>
              {!!salesProposal.followUpMessages.length && (
                <details>
                  <summary className="cursor-pointer text-[11px] font-[700] text-textItemBlur">
                    후속 메시지
                  </summary>
                  <div className="mt-[8px] grid grid-cols-2 maxMedia:grid-cols-1 gap-[8px]">
                    {salesProposal.followUpMessages.map((message) => (
                      <div
                        key={`${message.channel}-${message.subject}`}
                        className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px] min-w-0"
                      >
                        <div className="text-[11px] text-textItemBlur">
                          {message.channel}
                        </div>
                        <div className="font-[700] break-words">{message.subject}</div>
                        <div className="mt-[4px] text-textItemBlur break-words">
                          {message.body}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {salesProposal.evidence.topCampaign && (
                <div className="text-[11px] text-textItemBlur break-words">
                  상위 캠페인: {salesProposal.evidence.topCampaign.title}
                  {salesProposal.evidence.topCampaign.platform
                    ? ` · ${targetPlatformLabel(salesProposal.evidence.topCampaign.platform)}`
                    : ''}
                </div>
              )}
            </div>
          )}
          {salesSummary && (
            <div className="flex flex-col gap-[10px]">
              <div className="grid grid-cols-3 gap-[8px]">
                {[
                  ['클릭', salesSummary.clicks],
                  ['구매', salesSummary.purchases],
                  ['매출', `${salesSummary.revenue}${salesSummary.currency}`],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
                  >
                    <div className="text-[11px] text-textItemBlur">{label}</div>
                    <div className="text-[18px] font-[700]">{value}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-[8px]">
                <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]">
                  <div className="text-[11px] text-textItemBlur">전환율</div>
                  <div className="text-[14px] font-[700]">
                    {(salesSummary.conversionRate * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]">
                  <div className="text-[11px] text-textItemBlur">클릭당 매출</div>
                  <div className="text-[14px] font-[700]">
                    {salesSummary.earningsPerClick}
                    {salesSummary.currency}
                  </div>
                </div>
              </div>
              {!!salesSummary.actionItems?.length && (
                <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px] leading-[1.5] text-textItemBlur">
                  {salesSummary.actionItems[0]}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[18px] flex flex-col gap-[12px]">
          <div className="flex flex-wrap items-center justify-between gap-[10px]">
            <div className="text-[16px] font-[700]">경쟁 계정 분석</div>
            <div className="flex flex-wrap justify-end gap-[8px]">
              <Button
                secondary
                loading={competitorLoading}
                onClick={saveCompetitorProfile}
                className="rounded-[8px] !h-[36px] whitespace-nowrap"
              >
                계정 저장
              </Button>
              <Button
                secondary
                loading={competitorLoading}
                onClick={generateCompetitorReport}
                className="rounded-[8px] !h-[36px] whitespace-nowrap"
              >
                경쟁 리포트
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_140px] maxMedia:grid-cols-1 gap-[8px]">
            <input
              value={competitorName}
              onChange={(event) => setCompetitorName(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="경쟁 계정명"
            />
            <select
              value={competitorPlatform}
              onChange={(event) => setCompetitorPlatform(event.target.value as TargetPlatform)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            >
              {targetPlatforms.map((platform) => (
                <option key={platform.id} value={platform.id}>
                  {platform.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 maxMedia:grid-cols-1 gap-[8px]">
            <input
              value={competitorHandle}
              onChange={(event) => setCompetitorHandle(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="@handle"
            />
            <input
              value={competitorProfileUrl}
              onChange={(event) => setCompetitorProfileUrl(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="프로필 URL"
            />
          </div>
          <input
            value={competitorNiche}
            onChange={(event) => setCompetitorNiche(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="니치 / 카테고리"
          />
          {!!competitorProfiles.length && (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] maxMedia:grid-cols-1 gap-[8px]">
              <select
                value={activeCompetitorId}
                onChange={(event) => setActiveCompetitorId(event.target.value)}
                className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              >
                {competitorProfiles.slice(0, 30).map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name} · {targetPlatformLabel(profile.platform)}
                  </option>
                ))}
              </select>
              <Button
                secondary
                loading={competitorLoading}
                onClick={deleteCompetitorProfile}
                className="rounded-[8px] !h-[38px] whitespace-nowrap"
              >
                삭제
              </Button>
            </div>
          )}
          <div className="grid grid-cols-3 maxMedia:grid-cols-1 gap-[8px]">
            <input
              value={competitorFollowers}
              onChange={(event) => setCompetitorFollowers(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="팔로워"
            />
            <input
              value={competitorFollowersGrowth}
              onChange={(event) => setCompetitorFollowersGrowth(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="팔로워 증감"
            />
            <input
              value={competitorEngagement}
              onChange={(event) => setCompetitorEngagement(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="참여"
            />
          </div>
          <div className="grid grid-cols-3 maxMedia:grid-cols-1 gap-[8px]">
            <input
              value={competitorPostsCount}
              onChange={(event) => setCompetitorPostsCount(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="게시물 수"
            />
            <input
              value={competitorVideosCount}
              onChange={(event) => setCompetitorVideosCount(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="영상 수"
            />
            <input
              value={competitorEngagementRate}
              onChange={(event) => setCompetitorEngagementRate(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="참여율 %"
            />
          </div>
          <input
            value={competitorTopPostTitle}
            onChange={(event) => setCompetitorTopPostTitle(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="상위 포스트 제목"
          />
          <div className="grid grid-cols-[minmax(0,1fr)_auto] maxMedia:grid-cols-1 gap-[8px]">
            <input
              value={competitorTopPostHook}
              onChange={(event) => setCompetitorTopPostHook(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="상위 포스트 훅"
            />
            <Button
              secondary
              loading={competitorLoading}
              onClick={recordCompetitorSnapshot}
              className="rounded-[8px] !h-[38px] whitespace-nowrap"
            >
              스냅샷 기록
            </Button>
          </div>
          <details className="border-t border-newBorder pt-[10px]">
            <summary className="cursor-pointer text-[13px] font-[700]">
              경쟁 데이터 가져오기
            </summary>
            <div className="mt-[10px] grid grid-cols-[minmax(0,1fr)_120px_120px] maxMedia:grid-cols-1 gap-[8px]">
              <textarea
                value={competitorImportText}
                onChange={(event) => setCompetitorImportText(event.target.value)}
                className="min-h-[112px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.5] font-mono"
                placeholder="name,handle,profileUrl,platform,followers,engagement,topPostTitle"
              />
              <Button
                secondary
                loading={competitorLoading}
                onClick={previewCompetitorImport}
                className="rounded-[8px] !h-[38px] whitespace-nowrap"
              >
                가져오기 미리보기
              </Button>
              <Button
                secondary
                loading={competitorLoading}
                onClick={importCompetitorData}
                className="rounded-[8px] !h-[38px] whitespace-nowrap"
              >
                데이터 가져오기
              </Button>
            </div>
            {competitorImportPreview && (
              <div className="mt-[10px] flex flex-col gap-[8px]">
                <div className="grid grid-cols-3 maxMedia:grid-cols-1 gap-[8px]">
                  {[
                    ['사용 가능', competitorImportPreview.acceptedRows],
                    ['프로필', competitorImportPreview.profileRows],
                    ['스냅샷', competitorImportPreview.snapshotRows],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="border border-newBorder bg-newBgLineColor rounded-[8px] p-[10px]"
                    >
                      <div className="text-[11px] text-textItemBlur">{label}</div>
                      <div className="text-[16px] font-[700]">{value}</div>
                    </div>
                  ))}
                </div>
                {!!competitorImportPreview.rows.length && (
                  <div className="text-[12px] leading-[1.5] text-textItemBlur">
                    {competitorImportPreview.rows.slice(0, 3).map((row) => (
                      <div key={`${row.rowNumber}-${row.name}`}>
                        {row.rowNumber}. {row.name || '이름 없음'} ·{' '}
                        {row.platform ? targetPlatformLabel(row.platform) : '플랫폼 없음'} ·{' '}
                        {row.status}
                        {!!row.warnings.length && ` · ${row.warnings[0]}`}
                      </div>
                    ))}
                  </div>
                )}
                {competitorImportPreview.imported && (
                  <div className="text-[12px] leading-[1.5] text-textItemBlur">
                    계정 {competitorImportPreview.imported.profiles}개와 스냅샷{' '}
                    {competitorImportPreview.imported.snapshots}개를 저장했습니다.
                  </div>
                )}
              </div>
            )}
          </details>
          {competitorSummary && (
            <div className="flex flex-col gap-[10px]">
              <div className="grid grid-cols-3 gap-[8px]">
                {[
                  ['계정', competitorSummary.competitors],
                  ['참여', competitorSummary.totalEngagement],
                  ['영상 비중', `${(competitorSummary.videoShare * 100).toFixed(0)}%`],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
                  >
                    <div className="text-[11px] text-textItemBlur">{label}</div>
                    <div className="text-[18px] font-[700]">{value}</div>
                  </div>
                ))}
              </div>
              {!!competitorSummary.topCompetitors?.length && (
                <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px] leading-[1.5]">
                  <div className="font-[700]">
                    1위 {competitorSummary.topCompetitors[0].competitor.name}
                  </div>
                  <div className="text-textItemBlur">
                    팔로워 {competitorSummary.topCompetitors[0].latest.followers} ·
                    참여 {competitorSummary.topCompetitors[0].latest.engagement} ·
                    점수 {competitorSummary.topCompetitors[0].score}
                  </div>
                </div>
              )}
              {!!competitorSummary.topPosts?.length && (
                <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px] leading-[1.5]">
                  <div className="font-[700]">상위 훅</div>
                  <div className="text-textItemBlur">
                    {competitorSummary.topPosts[0].hook ||
                      competitorSummary.topPosts[0].title}
                  </div>
                </div>
              )}
              {!!competitorSummary.actionItems?.length && (
                <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px] leading-[1.5] text-textItemBlur">
                  {competitorSummary.actionItems[0]}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[18px] flex flex-col gap-[12px]">
          <div className="flex flex-wrap items-center justify-between gap-[10px]">
            <div className="text-[16px] font-[700]">소셜 리스닝</div>
            <div className="flex flex-wrap justify-end gap-[8px]">
              <Button
                secondary
                loading={listeningLoading}
                onClick={previewListeningMonitor}
                className="rounded-[8px] !h-[36px] whitespace-nowrap"
              >
                미리보기
              </Button>
              <Button
                secondary
                loading={listeningLoading}
                onClick={saveListeningMonitor}
                className="rounded-[8px] !h-[36px] whitespace-nowrap"
              >
                저장
              </Button>
              <Button
                secondary
                loading={listeningLoading}
                onClick={() => runListeningMonitor()}
                className="rounded-[8px] !h-[36px] whitespace-nowrap"
              >
                실행
              </Button>
              <Button
                secondary
                loading={listeningLoading}
                onClick={() => promoteListeningToInbox()}
                className="rounded-[8px] !h-[36px] whitespace-nowrap"
              >
                받은 반응함
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] maxMedia:grid-cols-1 gap-[8px]">
            <input
              value={listeningTitle}
              onChange={(event) => setListeningTitle(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="모니터 이름"
            />
            <input
              value={listeningCampaign}
              onChange={(event) => setListeningCampaign(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="캠페인"
            />
          </div>
          <input
            value={listeningQuery}
            onChange={(event) => setListeningQuery(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="검색식"
          />
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px] maxMedia:grid-cols-1 gap-[8px]">
            <input
              value={listeningKeywords}
              onChange={(event) => setListeningKeywords(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="키워드"
            />
            <input
              value={listeningExcludeKeywords}
              onChange={(event) => setListeningExcludeKeywords(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="제외 키워드"
            />
            <input
              value={listeningTags}
              onChange={(event) => setListeningTags(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="태그"
            />
          </div>
          <textarea
            value={listeningImportText}
            onChange={(event) => setListeningImportText(event.target.value)}
            className="min-h-[128px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[12px] text-[12px] leading-[1.6] font-mono"
            placeholder="CSV, JSON, 또는 줄 단위 mention"
          />
          {(listeningPreview || listeningRunResult?.preview) && (
            <div className="grid grid-cols-4 maxMedia:grid-cols-2 gap-[8px]">
              {[
                ['전체', (listeningRunResult?.preview || listeningPreview)?.totalItems || 0],
                ['매치', (listeningRunResult?.preview || listeningPreview)?.matchedItems || 0],
                ['High', (listeningRunResult?.preview || listeningPreview)?.highIntentItems || 0],
                ['Noise', (listeningRunResult?.preview || listeningPreview)?.noiseItems || 0],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
                >
                  <div className="text-[11px] text-textItemBlur">{label}</div>
                  <div className="text-[18px] font-[700]">{value}</div>
                </div>
              ))}
            </div>
          )}
          {!!(listeningRunResult?.preview || listeningPreview)?.warnings?.length && (
            <div className="text-[12px] text-amber-200">
              {(listeningRunResult?.preview || listeningPreview)?.warnings[0]}
            </div>
          )}
          {!!(listeningRunResult?.preview || listeningPreview)?.signals?.length && (
            <div className="grid grid-cols-2 maxMedia:grid-cols-1 gap-[8px]">
              {(listeningRunResult?.preview || listeningPreview)?.signals
                .slice(0, 4)
                .map((signal) => (
                  <div
                    key={signal.id}
                    className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px] leading-[1.45]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-[8px]">
                      <span className="font-[700]">{signal.label}</span>
                      <span
                        className={clsx(
                          'text-[11px]',
                          signal.priority === 'high'
                            ? 'text-amber-200'
                            : 'text-textItemBlur'
                        )}
                      >
                        {signal.count}
                      </span>
                    </div>
                    <div className="mt-[6px] text-textItemBlur">{signal.action}</div>
                  </div>
                ))}
            </div>
          )}
          {!!(listeningRunResult?.preview || listeningPreview)?.clusters?.length && (
            <div className="grid grid-cols-2 maxMedia:grid-cols-1 gap-[8px]">
              {(listeningRunResult?.preview || listeningPreview)?.clusters
                .slice(0, 4)
                .map((cluster) => (
                  <div
                    key={cluster.id}
                    className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px] leading-[1.45]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-[8px]">
                      <span className="font-[700]">{cluster.label}</span>
                      <span
                        className={clsx(
                          'rounded-[999px] px-[7px] py-[3px] text-[11px]',
                          cluster.priority === 'high'
                            ? 'bg-amber-500/15 text-amber-300'
                            : cluster.priority === 'medium'
                              ? 'bg-sky-500/15 text-sky-300'
                              : 'bg-emerald-500/15 text-emerald-300'
                        )}
                      >
                        {cluster.count}
                      </span>
                    </div>
                    <div className="mt-[6px] text-textItemBlur">{cluster.action}</div>
                  </div>
                ))}
            </div>
          )}
          {!!(listeningRunResult?.preview || listeningPreview)?.mentions?.length && (
            <div className="max-h-[210px] overflow-auto flex flex-col gap-[8px]">
              {(listeningRunResult?.preview || listeningPreview)?.mentions
                .slice(0, 6)
                .map((mention) => (
                  <div
                    key={mention.id}
                    className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px] leading-[1.5]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-[8px]">
                      <div className="font-[700]">
                        {mention.author || mention.postId || targetPlatformLabel(mention.platform)}
                      </div>
                      <span
                        className={clsx(
                          'text-[11px]',
                          mention.priority === 'high'
                            ? 'text-amber-200'
                            : 'text-textItemBlur'
                        )}
                      >
                        {mention.intent} · {mention.score}
                      </span>
                    </div>
                    <div className="mt-[4px] text-textItemBlur line-clamp-2">
                      {mention.content}
                    </div>
                  </div>
                ))}
            </div>
          )}
          <div className="grid grid-cols-3 maxMedia:grid-cols-1 gap-[8px]">
            {listeningMonitors.slice(0, 6).map((monitor) => (
              <div
                key={monitor.id}
                className={clsx(
                  'rounded-[8px] border bg-newBgLineColor p-[10px] text-[11px] leading-[1.45]',
                  monitor.id === activeListeningMonitor?.id
                    ? 'border-btnPrimary'
                    : 'border-newBorder'
                )}
              >
                <button
                  type="button"
                  onClick={() => setActiveListeningMonitorId(monitor.id)}
                  className="text-left font-[700] hover:text-newTextColor"
                >
                  {monitor.title}
                </button>
                <div className="mt-[5px] text-textItemBlur line-clamp-2">
                  {monitor.keywords.join(', ')}
                </div>
                <div className="mt-[7px] text-textItemBlur">
                  {monitor.lastRun
                    ? `match ${monitor.lastRun.matchedItems} · high ${monitor.lastRun.highIntentItems}`
                    : monitor.targetPlatforms.map(targetPlatformLabel).slice(0, 2).join(', ')}
                </div>
                <div className="mt-[9px] flex flex-wrap gap-[6px]">
                  <button
                    type="button"
                    onClick={() => useListeningMonitor(monitor)}
                    className="text-textItemBlur hover:text-newTextColor"
                  >
                    불러오기
                  </button>
                  <button
                    type="button"
                    onClick={() => runListeningMonitor(monitor.id)}
                    className="text-textItemBlur hover:text-newTextColor"
                  >
                    실행
                  </button>
                  <button
                    type="button"
                    onClick={() => promoteListeningToInbox(monitor.id)}
                    className="text-textItemBlur hover:text-newTextColor"
                  >
                    승격
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteListeningMonitor(monitor.id)}
                    className="text-textItemBlur hover:text-red-300"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
            {!listeningMonitors.length && (
              <div className="rounded-[8px] border border-dashed border-newBorder bg-newBgLineColor p-[10px] text-[12px] text-textItemBlur">
                저장된 리스닝 모니터가 없습니다.
              </div>
            )}
          </div>
        </section>

        <section className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[18px] flex flex-col gap-[12px]">
          <div className="flex flex-wrap items-center justify-between gap-[10px]">
            <div className="text-[16px] font-[700]">트렌드 레이더</div>
            <div className="flex flex-wrap justify-end gap-[8px]">
              <Button
                secondary
                loading={trendRadarLoading}
                onClick={previewTrendRadar}
                className="rounded-[8px] !h-[36px] whitespace-nowrap"
              >
                레이더 분석
              </Button>
              <Button
                secondary
                loading={trendRadarLoading}
                onClick={importTrendRadarSources}
                className="rounded-[8px] !h-[36px] whitespace-nowrap"
              >
                원문 가져오기
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_90px_90px] maxMedia:grid-cols-1 gap-[8px]">
            <input
              value={trendRadarTitle}
              onChange={(event) => setTrendRadarTitle(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="레이더 이름"
            />
            <input
              value={trendRadarIndustry}
              onChange={(event) => setTrendRadarIndustry(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="산업/카테고리"
            />
            <input
              value={trendRadarRegion}
              onChange={(event) => setTrendRadarRegion(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="지역"
            />
            <input
              value={trendRadarWindowDays}
              onChange={(event) => setTrendRadarWindowDays(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="기간"
            />
          </div>
          <input
            value={trendRadarKeywords}
            onChange={(event) => setTrendRadarKeywords(event.target.value)}
            className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            placeholder="추적 키워드"
          />
          <textarea
            value={trendRadarImportText}
            onChange={(event) => setTrendRadarImportText(event.target.value)}
            className="min-h-[128px] resize-none bg-newBgLineColor border border-newBorder rounded-[8px] p-[12px] text-[12px] leading-[1.6] font-mono"
            placeholder="트렌드 CSV 또는 JSON"
          />
          {trendRadarPreview && (
            <div className="grid grid-cols-4 maxMedia:grid-cols-2 gap-[8px]">
              {[
                ['Signals', trendRadarPreview.totalSignals],
                ['Trends', trendRadarPreview.totalTrends],
                ['Alerts', trendRadarPreview.alerts.length],
                ['Ideas', trendRadarPreview.contentIdeas.length],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
                >
                  <div className="text-[11px] text-textItemBlur">{label}</div>
                  <div className="text-[18px] font-[700]">{value}</div>
                </div>
              ))}
            </div>
          )}
          {!!trendRadarPreview?.warnings?.length && (
            <div className="text-[12px] text-amber-200">
              {trendRadarPreview.warnings[0]}
            </div>
          )}
          {!!trendRadarPreview?.alerts?.length && (
            <div className="grid grid-cols-2 maxMedia:grid-cols-1 gap-[8px]">
              {trendRadarPreview.alerts.slice(0, 4).map((alert) => (
                <div
                  key={alert.id}
                  className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px] leading-[1.45]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-[8px]">
                    <span className="font-[700]">{alert.title}</span>
                    <span
                      className={clsx(
                        'text-[11px]',
                        alert.severity === 'high'
                          ? 'text-amber-200'
                          : 'text-textItemBlur'
                      )}
                    >
                      알림
                    </span>
                  </div>
                  <div className="mt-[6px] text-textItemBlur">{alert.detail}</div>
                  <div className="mt-[6px] text-textItemBlur">{alert.action}</div>
                </div>
              ))}
            </div>
          )}
          {!!trendRadarPreview?.trends?.length && (
            <div className="grid grid-cols-2 maxMedia:grid-cols-1 gap-[8px]">
              {trendRadarPreview.trends.slice(0, 6).map((trend) => (
                <div
                  key={trend.id}
                  className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px] leading-[1.5]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-[8px]">
                    <span className="font-[700]">{trend.topic}</span>
                    <span
                      className={clsx(
                        'rounded-[999px] px-[7px] py-[3px] text-[11px]',
                        trend.stage === 'risk'
                          ? 'bg-red-500/15 text-red-300'
                          : trend.stage === 'accelerating'
                            ? 'bg-amber-500/15 text-amber-300'
                            : trend.stage === 'fatigue'
                              ? 'bg-slate-500/20 text-slate-200'
                              : 'bg-emerald-500/15 text-emerald-300'
                      )}
                    >
                      {trendRadarStageLabels[trend.stage]} · {trend.score}
                    </span>
                  </div>
                  <div className="mt-[6px] text-textItemBlur">
                    velocity {trend.velocity}% · volume {trend.volume} · SOV{' '}
                    {trend.shareOfVoice}%
                  </div>
                  <div className="mt-[6px] text-textItemBlur line-clamp-2">
                    {trend.action}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!!trendRadarPreview?.clusters?.length && (
            <div className="grid grid-cols-3 maxMedia:grid-cols-1 gap-[8px]">
              {trendRadarPreview.clusters.slice(0, 3).map((cluster) => (
                <div
                  key={cluster.id}
                  className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px] leading-[1.45]"
                >
                  <div className="font-[700]">{cluster.label}</div>
                  <div className="mt-[5px] text-textItemBlur">
                    {cluster.count}개 · 평균 {cluster.averageScore}
                  </div>
                  <div className="mt-[5px] text-textItemBlur line-clamp-2">
                    {cluster.action}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!!trendRadarPreview?.contentIdeas?.length && (
            <div className="max-h-[250px] overflow-auto flex flex-col gap-[8px]">
              {trendRadarPreview.contentIdeas.slice(0, 8).map((idea) => (
                <div
                  key={idea.id}
                  className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px] leading-[1.5]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-[8px]">
                    <div className="font-[700]">{idea.hook}</div>
                    <span className="text-[11px] text-textItemBlur">
                      {targetPlatformLabel(idea.platform)} · {idea.format} · {idea.score}
                    </span>
                  </div>
                  <div className="mt-[5px] text-textItemBlur line-clamp-2">
                    {idea.captionBrief}
                  </div>
                  <button
                    type="button"
                    onClick={() => applyTrendIdeaToEditor(idea)}
                    className="mt-[7px] text-textItemBlur hover:text-newTextColor"
                  >
                    아이디어 적용
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[18px] flex flex-col gap-[12px]">
          <div className="flex flex-wrap items-center justify-between gap-[10px]">
            <div className="text-[16px] font-[700]">게시 전 미리보기</div>
            <div className="flex flex-wrap justify-end gap-[8px]">
              <select
                value={postPreviewDevice}
                onChange={(event) =>
                  setPostPreviewDevice(event.target.value as SnapsPostPreviewDevice)
                }
                className="h-[36px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              >
                <option value="desktop">Desktop</option>
                <option value="mobile">Mobile</option>
              </select>
              <Button
                secondary
                loading={postPreviewLoading}
                onClick={previewPostCards}
                className="rounded-[8px] !h-[36px] whitespace-nowrap"
              >
                프리뷰 생성
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] maxMedia:grid-cols-1 gap-[8px]">
            <input
              value={postPreviewLinkUrl}
              onChange={(event) => setPostPreviewLinkUrl(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="링크 URL"
            />
            <input
              value={postPreviewLinkImage}
              onChange={(event) => setPostPreviewLinkImage(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="링크 이미지"
            />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] maxMedia:grid-cols-1 gap-[8px]">
            <input
              value={postPreviewLinkTitle}
              onChange={(event) => setPostPreviewLinkTitle(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="링크 제목"
            />
            <input
              value={postPreviewLinkDescription}
              onChange={(event) => setPostPreviewLinkDescription(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="링크 설명"
            />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] maxMedia:grid-cols-1 gap-[8px]">
            <input
              value={postPreviewAltText}
              onChange={(event) => setPostPreviewAltText(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="alt text"
            />
            <input
              value={postPreviewImageDescription}
              onChange={(event) => setPostPreviewImageDescription(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="이미지 설명"
            />
          </div>
          {postPreviewResult && (
            <div className="grid grid-cols-3 maxMedia:grid-cols-1 gap-[8px]">
              {[
                ['Cards', postPreviewResult.totalCards],
                ['Rewrite', postPreviewResult.needsRewrite],
                ['A11y', postPreviewResult.averageAccessibilityScore],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
                >
                  <div className="text-[11px] text-textItemBlur">{label}</div>
                  <div className="text-[18px] font-[700]">{value}</div>
                </div>
              ))}
            </div>
          )}
          {!!postPreviewResult?.warnings?.length && (
            <div className="text-[12px] text-amber-200">
              {postPreviewResult.warnings[0]}
            </div>
          )}
          {!!postPreviewResult?.cards?.length && (
            <div className="grid grid-cols-2 maxMedia:grid-cols-1 gap-[8px]">
              {postPreviewResult.cards.slice(0, 8).map((card) => (
                <div
                  key={`${card.platform}-${card.title}`}
                  className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px] text-[12px] leading-[1.5]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-[8px]">
                    <span className="font-[700]">{card.label}</span>
                    <span
                      className={clsx(
                        'rounded-[999px] px-[7px] py-[3px] text-[11px]',
                        card.hardLimitExceeded
                          ? 'bg-red-500/15 text-red-300'
                          : card.warnings.length
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-emerald-500/15 text-emerald-300'
                      )}
                    >
                      {card.characterCount}/{card.characterLimit} · {card.accessibilityScore}
                    </span>
                  </div>
                  <div className="mt-[8px] rounded-[8px] border border-newBorder bg-newBgColor p-[10px]">
                    <div className="text-[11px] text-textItemBlur">
                      feed cut {card.feedCutoff} · hidden {card.hiddenCharacters}
                    </div>
                    <div className="mt-[5px] whitespace-pre-wrap break-words text-newTextColor">
                      {card.feedPreview}
                    </div>
                    {card.linkPreview.url && (
                      <div className="mt-[8px] rounded-[6px] border border-newBorder p-[8px]">
                        <div className="line-clamp-1 font-[700]">
                          {card.linkPreview.title || card.linkPreview.url}
                        </div>
                        <div className="mt-[4px] line-clamp-2 text-textItemBlur">
                          {card.linkPreview.description || card.linkPreview.url}
                        </div>
                      </div>
                    )}
                  </div>
                  {!!card.warnings.length && (
                    <div className="mt-[8px] text-amber-200">{card.warnings[0]}</div>
                  )}
                  <div className="mt-[8px] text-textItemBlur line-clamp-2">
                    {card.recommendations[0]}
                  </div>
                  <div className="mt-[8px] flex flex-wrap items-center gap-[8px] text-textItemBlur">
                    <span>#{card.hashtagCount}</span>
                    <span>@{card.mentionCount}</span>
                    <span>links {card.urlCount}</span>
                    <button
                      type="button"
                      onClick={() => applyPostPreviewCard(card)}
                      className="ml-auto hover:text-newTextColor"
                    >
                      프리뷰 적용
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[18px] flex flex-col gap-[12px]">
          <div className="flex flex-wrap items-center justify-between gap-[10px]">
            <div className="text-[16px] font-[700]">광고 표시 가드</div>
            <Button
              secondary
              loading={adDisclosureLoading}
              onClick={checkAdDisclosure}
              className="rounded-[8px] !h-[36px] whitespace-nowrap"
            >
              표시 검사
            </Button>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] maxMedia:grid-cols-1 gap-[8px]">
            <select
              value={adRelationship}
              onChange={(event) => setAdRelationship(event.target.value as SnapsAdRelationship)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            >
              {adRelationshipOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={adMediaType}
              onChange={(event) => setAdMediaType(event.target.value as SnapsAdMediaType)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
            >
              <option value="text">텍스트</option>
              <option value="image">이미지</option>
              <option value="video">영상</option>
              <option value="live">라이브</option>
            </select>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] maxMedia:grid-cols-1 gap-[8px]">
            <input
              value={adAdvertiser}
              onChange={(event) => setAdAdvertiser(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="광고주·브랜드명"
            />
            <input
              value={adSenderName}
              onChange={(event) => setAdSenderName(event.target.value)}
              className="h-[38px] bg-newBgLineColor border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              placeholder="카카오 발신자 이름"
            />
          </div>
          <label className="flex items-center gap-[8px] text-[12px] text-textItemBlur">
            <input
              type="checkbox"
              checked={adNightConsent}
              onChange={(event) => setAdNightConsent(event.target.checked)}
              className="h-[14px] w-[14px]"
            />
            야간(21시~08시) 광고 수신 동의 확보
          </label>
          {adDisclosureResult && (
            <div className="grid grid-cols-3 maxMedia:grid-cols-1 gap-[8px]">
              {[
                ['상태', adGuardStatusLabel[adDisclosureResult.status]],
                ['차단', adDisclosureResult.blockers],
                ['검토', adDisclosureResult.warnings],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px]"
                >
                  <div className="text-[11px] text-textItemBlur">{label}</div>
                  <div className="text-[18px] font-[700]">{value}</div>
                </div>
              ))}
            </div>
          )}
          {!!adDisclosureResult?.cards?.length && (
            <div className="grid grid-cols-2 maxMedia:grid-cols-1 gap-[8px]">
              {adDisclosureResult.cards.slice(0, 8).map((card) => (
                <div
                  key={`${card.platform}-${card.title}`}
                  className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px] text-[12px] leading-[1.5]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-[8px]">
                    <span className="font-[700]">{card.label}</span>
                    <span
                      className={clsx(
                        'rounded-[999px] px-[7px] py-[3px] text-[11px]',
                        card.status === 'block'
                          ? 'bg-red-500/15 text-red-300'
                          : card.status === 'review'
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-emerald-500/15 text-emerald-300'
                      )}
                    >
                      {adGuardStatusLabel[card.status]}
                      {card.disclosureFound ? ` · ${card.disclosureFound}` : ''}
                    </span>
                  </div>
                  <div className="mt-[8px] flex flex-col gap-[4px]">
                    {card.findings.slice(0, 4).map((finding, index) => (
                      <div
                        key={`${finding.rule}-${index}`}
                        className={clsx(
                          finding.severity === 'blocker'
                            ? 'text-red-300'
                            : finding.severity === 'warning'
                              ? 'text-amber-200'
                              : 'text-textItemBlur'
                        )}
                      >
                        {finding.message}
                      </div>
                    ))}
                    {!card.findings.length && (
                      <div className="text-textItemBlur">표시 위치와 문구가 기준에 맞습니다.</div>
                    )}
                  </div>
                  {card.fixApplied && (
                    <div className="mt-[8px] rounded-[8px] border border-newBorder bg-newBgColor p-[10px]">
                      <div className="text-[11px] text-textItemBlur">
                        수정본 · 피드 노출 {card.visibleWindow}자
                      </div>
                      <div className="mt-[5px] whitespace-pre-wrap break-words text-newTextColor line-clamp-4">
                        {card.fixedContent}
                      </div>
                      <button
                        type="button"
                        onClick={() => applyAdDisclosureFix(card)}
                        className="mt-[7px] text-textItemBlur hover:text-newTextColor"
                      >
                        수정본 적용
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {!!adDisclosureResult?.checklist?.length && (
            <div className="flex flex-col gap-[4px] text-[12px] text-textItemBlur">
              {adDisclosureResult.checklist.map((item) => (
                <div key={item}>· {item}</div>
              ))}
              <div className="mt-[4px] text-[11px]">{adDisclosureResult.notice}</div>
            </div>
          )}
        </section>

        <section className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[18px] flex flex-col gap-[12px]">
          <div className="flex flex-wrap items-center justify-between gap-[10px]">
            <div className="text-[16px] font-[700]">받은 반응함</div>
            <div className="flex flex-wrap justify-end gap-[8px]">
              <Button
                secondary
                loading={feedbackLoading}
                onClick={importFeedback}
                className="rounded-[8px] !h-[36px] whitespace-nowrap"
              >
                저장
              </Button>
              <Button
                secondary
                loading={feedbackLoading}
                onClick={() => summarizeFeedback(true)}
                className="rounded-[8px] !h-[36px] whitespace-nowrap"
              >
                요약
              </Button>
              <Button
                secondary
                loading={feedbackLoading}
                onClick={clearFeedbackInbox}
                className="rounded-[8px] !h-[36px] whitespace-nowrap"
              >
                비우기
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_150px_auto] maxMedia:grid-cols-1 gap-[8px]">
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
              className="rounded-[8px] !h-[38px] whitespace-nowrap"
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
          <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px] flex flex-col gap-[8px]">
            <div className="flex flex-wrap items-center justify-between gap-[8px]">
              <div className="text-[13px] font-[700]">받은 반응 상태</div>
              <div className="text-[11px] text-textItemBlur">{feedbackItems.length}개</div>
            </div>
            <div className="grid grid-cols-[150px_minmax(0,1fr)_auto] maxMedia:grid-cols-1 gap-[8px]">
              <select
                value={feedbackItemStatus}
                onChange={(event) => {
                  const nextStatus = event.target.value as SnapsFeedbackStatusFilter;
                  setFeedbackItemStatus(nextStatus);
                  loadFeedbackItems(nextStatus, feedbackItemSearch);
                }}
                className="h-[38px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              >
                {feedbackStatusOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                value={feedbackItemSearch}
                onChange={(event) => setFeedbackItemSearch(event.target.value)}
                className="h-[38px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px]"
                placeholder="작성자, post ID, 내용 검색"
              />
              <Button
                secondary
                loading={feedbackLoading}
                onClick={() => loadFeedbackItems(feedbackItemStatus, feedbackItemSearch)}
                className="rounded-[8px] !h-[38px] whitespace-nowrap"
              >
                목록 불러오기
              </Button>
            </div>
            {feedbackItems.length ? (
              <div className="max-h-[220px] overflow-auto flex flex-col gap-[8px]">
                {feedbackItems.slice(0, 10).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px] text-[12px] leading-[1.5]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-[8px]">
                      <div className="font-[700]">
                        {item.author || item.postId || '받은 반응'}
                      </div>
                      <div className="flex items-center gap-[8px]">
                        <span className="text-[11px] text-textItemBlur">
                          {feedbackStatusLabels[item.status] || item.status}
                        </span>
                        {item.status === 'unread' && (
                          <button
                            type="button"
                            onClick={() => updateFeedbackItemStatus(item.id, 'unresolved')}
                            className="text-[11px] text-textColor"
                          >
                            읽음
                          </button>
                        )}
                        {item.status !== 'resolved' ? (
                          <button
                            type="button"
                            onClick={() => updateFeedbackItemStatus(item.id, 'resolved')}
                            className="text-[11px] text-textColor"
                          >
                            해결
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => updateFeedbackItemStatus(item.id, 'unresolved')}
                            className="text-[11px] text-textColor"
                          >
                            미해결
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => useFeedbackItemForReply(item)}
                          className="text-[11px] text-textColor"
                        >
                          답글 대상
                        </button>
                      </div>
                    </div>
                    <div className="mt-[3px] text-[11px] text-textItemBlur">
                      {[
                        targetPlatformLabel(item.platform),
                        item.sentiment ? feedbackSentimentLabels[item.sentiment] : '',
                        item.postId,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    <div className="mt-[4px] line-clamp-2 text-textItemBlur">
                      {item.content}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px] text-[12px] text-textItemBlur">
                현재 필터에 맞는 받은 반응이 없습니다.
              </div>
            )}
          </div>
          <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px] flex flex-col gap-[10px]">
            <div className="flex flex-wrap items-center justify-between gap-[8px]">
              <div>
                <div className="text-[13px] font-[700]">팀 배정 라우터</div>
                <div className="text-[11px] text-textItemBlur">
                  {inboxAssignmentPreview
                    ? `${inboxAssignmentPreview.total}개 케이스`
                    : 'Hootsuite/Sprout식 케이스 배정'}
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-[8px]">
                <input
                  value={inboxAssignmentSlaMinutes}
                  onChange={(event) => setInboxAssignmentSlaMinutes(event.target.value)}
                  className="h-[34px] w-[100px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px]"
                  placeholder="SLA 분"
                />
                <Button
                  secondary
                  loading={feedbackLoading}
                  onClick={() => previewInboxAssignments(false)}
                  className="rounded-[8px] !h-[34px] whitespace-nowrap"
                >
                  배정 미리보기
                </Button>
                <Button
                  secondary
                  loading={feedbackLoading}
                  onClick={() => previewInboxAssignments(true)}
                  className="rounded-[8px] !h-[34px] whitespace-nowrap"
                >
                  본문으로 배정
                </Button>
              </div>
            </div>
            {inboxAssignmentPreview && (
              <div className="flex flex-col gap-[10px]">
                <div className="grid grid-cols-4 maxMedia:grid-cols-2 gap-[8px]">
                  {Object.entries(inboxAssignmentPriorityLabels).map(([key, label]) => {
                    const priority = key as SnapsInboxAssignmentPriority;
                    return (
                      <div
                        key={priority}
                        className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px]"
                      >
                        <div className="text-[11px] text-textItemBlur">{label}</div>
                        <div className="text-[18px] font-[700]">
                          {inboxAssignmentPreview.lanes[priority] || 0}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {!!inboxAssignmentPreview.teamLoad.length && (
                  <div className="grid grid-cols-5 maxMedia:grid-cols-2 gap-[8px]">
                    {inboxAssignmentPreview.teamLoad.map((load) => (
                      <div
                        key={load.role}
                        className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px]"
                      >
                        <div className="text-[11px] text-textItemBlur">{load.label}</div>
                        <div className="text-[14px] font-[700]">{load.count}</div>
                        <div className="text-[10px] text-textItemBlur">
                          긴급 {load.urgent} · 높음 {load.high}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!!inboxAssignmentPreview.nextActions.length && (
                  <div className="flex flex-col gap-[6px]">
                    {inboxAssignmentPreview.nextActions.slice(0, 4).map((action) => (
                      <div
                        key={action}
                        className="rounded-[8px] bg-btnSimple px-[10px] py-[8px] text-[12px] leading-[1.5]"
                      >
                        {action}
                      </div>
                    ))}
                  </div>
                )}
                <div className="max-h-[260px] overflow-auto flex flex-col gap-[8px]">
                  {inboxAssignmentPreview.cases.slice(0, 8).map((assignment) => (
                    <div
                      key={assignment.id}
                      className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px] text-[12px] leading-[1.5]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-[8px]">
                        <div className="font-[700]">
                          {assignment.author || assignment.postId || assignment.itemId}
                        </div>
                        <div className="flex items-center gap-[8px]">
                          <span className="text-[11px] text-textItemBlur">
                            {inboxAssignmentPriorityLabels[assignment.priority]} ·{' '}
                            {assignment.assigneeLabel}
                          </span>
                          <button
                            type="button"
                            onClick={() => applyInboxAssignmentCase(assignment)}
                            className="text-[11px] text-textColor"
                          >
                            답글 준비
                          </button>
                          <button
                            type="button"
                            onClick={() => saveInboxAssignmentNote(assignment)}
                            className="text-[11px] text-textColor"
                          >
                            케이스 메모
                          </button>
                        </div>
                      </div>
                      <div className="mt-[3px] text-[11px] text-textItemBlur">
                        {[
                          targetPlatformLabel(assignment.platform),
                          feedbackSentimentLabels[assignment.sentiment] || assignment.sentiment,
                          `SLA ${assignment.slaMinutes}분`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                      <div className="mt-[4px] line-clamp-2 text-textItemBlur">
                        {assignment.excerpt}
                      </div>
                      <div className="mt-[6px] text-textItemBlur">
                        {assignment.action}
                      </div>
                    </div>
                  ))}
                </div>
                {!!inboxAssignmentPreview.warnings.length && (
                  <div className="flex flex-col gap-[6px]">
                    {inboxAssignmentPreview.warnings.map((warning) => (
                      <div
                        key={warning}
                        className="rounded-[8px] border border-amber-500/30 bg-amber-500/10 px-[10px] py-[8px] text-[12px] leading-[1.5] text-amber-100"
                      >
                        {warning}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px] flex flex-col gap-[8px]">
            <div className="flex flex-wrap items-center justify-between gap-[8px]">
              <div className="text-[13px] font-[700]">저장 답변 라이브러리</div>
              <div className="text-[11px] text-textItemBlur">{replyTemplates.length}개</div>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_140px_150px] maxMedia:grid-cols-1 gap-[8px]">
              <input
                value={replyTemplateTitle}
                onChange={(event) => setReplyTemplateTitle(event.target.value)}
                className="h-[38px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px]"
                placeholder="템플릿 제목"
              />
              <select
                value={replyTemplateSentiment}
                onChange={(event) => setReplyTemplateSentiment(event.target.value)}
                className="h-[38px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              >
                <option value="">전체 반응</option>
                {Object.entries(feedbackSentimentLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                value={replyTemplatePlatform}
                onChange={(event) =>
                  setReplyTemplatePlatform(event.target.value as TargetPlatform | '')
                }
                className="h-[38px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              >
                <option value="">전체 채널</option>
                {targetPlatforms.map((platform) => (
                  <option key={platform.id} value={platform.id}>
                    {platform.label}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              value={replyTemplateBody}
              onChange={(event) => setReplyTemplateBody(event.target.value)}
              className="min-h-[76px] resize-none bg-newBgColorInner border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.55]"
              placeholder="저장 답변 본문"
            />
            <div className="grid grid-cols-[minmax(0,1fr)_180px_auto] maxMedia:grid-cols-1 gap-[8px]">
              <input
                value={replyTemplateCta}
                onChange={(event) => setReplyTemplateCta(event.target.value)}
                className="h-[38px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px]"
                placeholder="선택 CTA"
              />
              <input
                value={replyTemplateTags}
                onChange={(event) => setReplyTemplateTags(event.target.value)}
                className="h-[38px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px]"
                placeholder="태그"
              />
              <Button
                secondary
                loading={feedbackLoading}
                onClick={saveReplyTemplate}
                className="rounded-[8px] !h-[38px] whitespace-nowrap"
              >
                템플릿 저장
              </Button>
            </div>
            {!!replyTemplates.length && (
              <div className="max-h-[170px] overflow-auto flex flex-col gap-[8px]">
                {replyTemplates.slice(0, 8).map((template) => (
                  <div
                    key={template.id}
                    className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px] text-[12px] leading-[1.5]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-[8px]">
                      <div className="font-[700]">{template.title}</div>
                      <div className="flex items-center gap-[8px]">
                        <button
                          type="button"
                          onClick={() => useReplyTemplate(template)}
                          className="text-[11px] text-textColor"
                        >
                          사용
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteReplyTemplate(template)}
                          className="text-[11px] text-red-300"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                    <div className="mt-[4px] line-clamp-2 text-textItemBlur">
                      {[template.body, template.cta].filter(Boolean).join(' ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[12px] flex flex-col gap-[8px]">
            <div className="flex flex-wrap items-center justify-between gap-[8px]">
              <div className="text-[13px] font-[700]">고객 메모</div>
              <div className="text-[11px] text-textItemBlur">{inboxNotes.length}개</div>
            </div>
            <div className="grid grid-cols-[150px_minmax(0,1fr)_180px] maxMedia:grid-cols-1 gap-[8px]">
              <select
                value={inboxNotePlatform}
                onChange={(event) =>
                  setInboxNotePlatform(event.target.value as TargetPlatform | '')
                }
                className="h-[38px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px]"
              >
                <option value="">전체 채널</option>
                {targetPlatforms.map((platform) => (
                  <option key={platform.id} value={platform.id}>
                    {platform.label}
                  </option>
                ))}
              </select>
              <input
                value={inboxNoteAuthor}
                onChange={(event) => setInboxNoteAuthor(event.target.value)}
                className="h-[38px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px]"
                placeholder="고객명 / 핸들"
              />
              <input
                value={inboxNotePostId}
                onChange={(event) => setInboxNotePostId(event.target.value)}
                className="h-[38px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px]"
                placeholder="관련 게시물 ID"
              />
            </div>
            <textarea
              value={inboxNoteText}
              onChange={(event) => setInboxNoteText(event.target.value)}
              className="min-h-[74px] resize-none bg-newBgColorInner border border-newBorder rounded-[8px] p-[10px] text-[12px] leading-[1.55]"
              placeholder="고객 응대 메모"
            />
            <div className="grid grid-cols-[minmax(0,1fr)_auto] maxMedia:grid-cols-1 gap-[8px]">
              <input
                value={inboxNoteTags}
                onChange={(event) => setInboxNoteTags(event.target.value)}
                className="h-[38px] bg-newBgColorInner border border-newBorder rounded-[8px] px-[10px] text-[12px]"
                placeholder="메모 태그"
              />
              <Button
                secondary
                loading={feedbackLoading}
                onClick={saveInboxNote}
                className="rounded-[8px] !h-[38px] whitespace-nowrap"
              >
                메모 저장
              </Button>
            </div>
            {!!inboxNotes.length && (
              <div className="max-h-[160px] overflow-auto flex flex-col gap-[8px]">
                {inboxNotes.slice(0, 8).map((note) => (
                  <div
                    key={note.id}
                    className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px] text-[12px] leading-[1.5]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-[8px]">
                      <div className="font-[700]">
                        {note.author || note.postId || '메모'}
                      </div>
                      <div className="flex items-center gap-[8px]">
                        <button
                          type="button"
                          onClick={() => useInboxNoteForReply(note)}
                          className="text-[11px] text-textColor"
                        >
                          대상 반영
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteInboxNote(note)}
                          className="text-[11px] text-red-300"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                    <div className="mt-[3px] text-[11px] text-textItemBlur">
                      {[note.platform ? targetPlatformLabel(note.platform) : '', note.postId]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    <div className="mt-[4px] line-clamp-2 text-textItemBlur">
                      {note.note}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
              {!!feedbackView.conversionSignals?.length && (
                <div className="grid grid-cols-2 maxMedia:grid-cols-1 gap-[8px]">
                  {feedbackView.conversionSignals.slice(0, 4).map((signal) => (
                    <div
                      key={signal.id}
                      className="rounded-[8px] border border-newBorder bg-newBgLineColor p-[10px] text-[12px] leading-[1.45]"
                    >
                      <div className="flex items-center justify-between gap-[8px]">
                        <span className="font-[700]">{signal.label}</span>
                        <span
                          className={clsx(
                            'text-[11px]',
                            signal.priority === 'high'
                              ? 'text-amber-200'
                              : 'text-textItemBlur'
                          )}
                        >
                          {signal.count}
                        </span>
                      </div>
                      <div className="mt-[6px] text-textItemBlur">{signal.action}</div>
                    </div>
                  ))}
                </div>
              )}
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
      )}

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
      </details>
    </div>
  );
}
