import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import path from 'path';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import {
  SnapsTargetPlatform,
  snapsTargetPlatforms,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import {
  SnapsSerialized,
  writeSnapsFileAtomic,
} from '@gitroom/nestjs-libraries/snaps/utils/serialized-store';
import { createHash } from 'crypto';

export type SnapsSalesEventType = 'click' | 'lead' | 'purchase';

export type SnapsSalesCampaignInput = {
  title?: unknown;
  destinationUrl?: unknown;
  cta?: unknown;
  platform?: unknown;
  sourceId?: unknown;
  postId?: unknown;
  slug?: unknown;
  tags?: unknown;
};

export type SnapsSalesEventInput = {
  campaignId?: unknown;
  eventType?: unknown;
  platform?: unknown;
  postId?: unknown;
  amount?: unknown;
  currency?: unknown;
  occurredAt?: unknown;
  metadata?: unknown;
};

export type SnapsSalesProposalRequest = {
  leadName?: unknown;
  segment?: unknown;
  problem?: unknown;
  sourceAsset?: unknown;
  pilotDays?: unknown;
  targetRevenue?: unknown;
  monthlyFee?: unknown;
  setupFee?: unknown;
  currency?: unknown;
  packageName?: unknown;
  channels?: unknown;
};

export type SnapsSalesCampaign = {
  id: string;
  organizationId: string;
  title: string;
  destinationUrl: string;
  trackingUrl: string;
  linkInBioUrl: string;
  cta: string;
  platform?: SnapsTargetPlatform;
  sourceId?: string;
  postId?: string;
  slug: string;
  tags: string[];
  /** Clicks rolled up out of the event log once it exceeded the per-click retention window. */
  archivedClicks?: number;
  createdAt: string;
  updatedAt: string;
};

export type SnapsSalesEvent = {
  id: string;
  organizationId: string;
  campaignId: string;
  eventType: SnapsSalesEventType;
  platform?: SnapsTargetPlatform;
  postId?: string;
  amount: number;
  currency: string;
  occurredAt: string;
  metadata?: Record<string, unknown>;
};

export type SnapsSalesCampaignSummary = {
  campaign: SnapsSalesCampaign;
  clicks: number;
  leads: number;
  purchases: number;
  revenue: number;
  currency: string;
  conversionRate: number;
  earningsPerClick: number;
};

export type SnapsSalesSummary = {
  campaigns: number;
  clicks: number;
  leads: number;
  purchases: number;
  revenue: number;
  currency: string;
  conversionRate: number;
  earningsPerClick: number;
  campaignSummaries: SnapsSalesCampaignSummary[];
  actionItems: string[];
};

export type SnapsSalesProposal = {
  source: 'snaps-sales-proposal';
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
      platform?: SnapsTargetPlatform;
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

export type SnapsPublicSalesLink = {
  source: 'snaps-public-sales-link';
  organizationId: string;
  campaignId: string;
  title: string;
  cta: string;
  platform?: SnapsTargetPlatform;
  slug: string;
  tags: string[];
  destinationHost: string;
  linkInBioUrl: string;
  clickPath: string;
  createdAt: string;
  updatedAt: string;
};

export type SnapsPublicSalesClick = SnapsPublicSalesLink & {
  redirectUrl: string;
  /** Missing when the hit was a link-preview bot or a repeat click that was not counted. */
  eventId?: string;
  counted: boolean;
  skippedReason?: 'bot' | 'duplicate';
};

export type SnapsPublicSalesHub = {
  source: 'snaps-public-sales-hub';
  organizationId: string;
  title: string;
  description: string;
  linkInBioUrl: string;
  links: SnapsPublicSalesLink[];
  tags: string[];
  updatedAt?: string;
};

export type SnapsPublicSalesEntry = SnapsPublicSalesLink | SnapsPublicSalesHub;

const eventTypes: SnapsSalesEventType[] = ['click', 'lead', 'purchase'];
const salesCampaignsFileSuffix = '.sales-campaigns.json';

type SnapsPublicVisitor = {
  bot: boolean;
  visitorHash?: string;
  metadata: Record<string, unknown>;
};

const REPEAT_CLICK_WINDOW_MS = 30 * 1000;

// Preview fetchers and crawlers. In-app browsers (KAKAOTALK, DaumApps, FBAN, Instagram, Line)
// are real visitors and must not match; "Cubot" is a phone brand.
const previewBotPattern =
  /((?<!cu)bot\b|bot\/|crawler|spider|slurp|facebookexternalhit|kakaotalk-scrap|kakaostory-og-reader|daumoa|\byeti\b|embedly|quora link preview|whatsapp|skypeuripreview|vkshare|headlesschrome|lighthouse|curl\/|wget\/|python-requests|python-urllib|axios\/|go-http-client|okhttp|node-fetch|undici)/i;

export const isSnapsPreviewBot = (userAgent: string) => previewBotPattern.test(userAgent);

const snapsVisitorSalt = () =>
  process.env.SNAPS_VISITOR_HASH_SALT || process.env.JWT_SECRET || 'snaps-visitor';

const MAX_CLICK_EVENTS = 2000;
const MAX_CONVERSION_EVENTS = 5000;

@Injectable()
export class SnapsLinkAttributionService {
  private readonly dataDir =
    process.env.SNAPS_DATA_DIR || path.join(process.cwd(), 'var', 'snaps');

  @SnapsSerialized()
  async saveCampaign(
    organizationId: string,
    body?: SnapsSalesCampaignInput
  ) {
    const campaigns = await this.listCampaigns(organizationId);
    const now = new Date().toISOString();
    const next = this.normalizeCampaign(organizationId, {
      ...body,
      archivedClicks: undefined,
      id: makeId(14),
      createdAt: now,
      updatedAt: now,
    });
    if (!next) {
      throw new BadRequestException('destinationUrl is required for a sales link campaign.');
    }

    const existingSlugs = new Set(campaigns.map((campaign) => campaign.slug));
    const slug = this.uniqueSlug(next.slug, existingSlugs);
    const unique = this.withSlug(next, slug);
    await this.writeCampaigns(organizationId, [unique, ...campaigns].slice(0, 300));
    return unique;
  }

  async listCampaigns(organizationId: string) {
    try {
      const file = await fs.readFile(this.filePath(organizationId, 'sales-campaigns'), 'utf8');
      const parsed = JSON.parse(file);
      if (!Array.isArray(parsed)) {
        return [] as SnapsSalesCampaign[];
      }
      return parsed
        .map((campaign) => this.normalizeCampaign(organizationId, campaign))
        .filter((campaign): campaign is SnapsSalesCampaign => !!campaign);
    } catch {
      return [] as SnapsSalesCampaign[];
    }
  }

  @SnapsSerialized()
  async deleteCampaign(organizationId: string, campaignId: string) {
    const campaigns = await this.listCampaigns(organizationId);
    const events = await this.listEvents(organizationId);
    const nextCampaigns = campaigns.filter((campaign) => campaign.id !== campaignId);
    const nextEvents = events.filter((event) => event.campaignId !== campaignId);
    await Promise.all([
      this.writeCampaigns(organizationId, nextCampaigns),
      this.writeEvents(organizationId, nextEvents),
    ]);
    return {
      deleted: nextCampaigns.length !== campaigns.length,
      campaigns: nextCampaigns.length,
      events: nextEvents.length,
    };
  }

  @SnapsSerialized()
  async recordEvent(organizationId: string, body?: SnapsSalesEventInput) {
    const campaigns = await this.listCampaigns(organizationId);
    const events = await this.listEvents(organizationId);
    const next = this.normalizeEvent(organizationId, {
      ...body,
      id: makeId(14),
      occurredAt: this.cleanOptionalText(body?.occurredAt, 80) || new Date().toISOString(),
    });
    if (!next) {
      throw new BadRequestException('campaignId and a valid eventType are required.');
    }
    if (!campaigns.some((campaign) => campaign.id === next.campaignId)) {
      throw new NotFoundException('snaps sales campaign was not found.');
    }

    await this.storeEvents(organizationId, campaigns, [next, ...events]);
    return next;
  }

  async listEvents(organizationId: string) {
    try {
      const file = await fs.readFile(this.filePath(organizationId, 'sales-events'), 'utf8');
      const parsed = JSON.parse(file);
      if (!Array.isArray(parsed)) {
        return [] as SnapsSalesEvent[];
      }
      return parsed
        .map((event) => this.normalizeEvent(organizationId, event))
        .filter((event): event is SnapsSalesEvent => !!event);
    } catch {
      return [] as SnapsSalesEvent[];
    }
  }

  async summary(organizationId: string): Promise<SnapsSalesSummary> {
    const [campaigns, events] = await Promise.all([
      this.listCampaigns(organizationId),
      this.listEvents(organizationId),
    ]);
    const currency = this.primaryCurrency(events);
    const campaignSummaries = campaigns
      .map((campaign) => this.summarizeCampaign(campaign, events, currency))
      .sort((a, b) => b.revenue - a.revenue || b.clicks - a.clicks);
    const clicks =
      events.filter((event) => event.eventType === 'click').length +
      campaigns.reduce((total, campaign) => total + (campaign.archivedClicks || 0), 0);
    const leads = events.filter((event) => event.eventType === 'lead').length;
    const purchases = events.filter((event) => event.eventType === 'purchase').length;
    const revenue = this.roundMoney(
      events
        .filter((event) => event.eventType === 'purchase')
        .reduce((total, event) => total + event.amount, 0)
    );

    return {
      campaigns: campaigns.length,
      clicks,
      leads,
      purchases,
      revenue,
      currency,
      conversionRate: clicks ? this.roundRate(purchases / clicks) : 0,
      earningsPerClick: clicks ? this.roundMoney(revenue / clicks) : 0,
      campaignSummaries,
      actionItems: this.salesActionItems(campaigns.length, clicks, purchases, revenue),
    };
  }

  async report(organizationId: string) {
    const summary = await this.summary(organizationId);
    const top = summary.campaignSummaries[0];
    return {
      title: 'snaps 링크/매출 귀속 리포트',
      summary:
        `캠페인 ${summary.campaigns}개에서 클릭 ${summary.clicks}회, 리드 ${summary.leads}건, ` +
        `구매 ${summary.purchases}건, 매출 ${summary.revenue}${summary.currency}를 기록했습니다.`,
      insights: [
        top
          ? `${top.campaign.title} 캠페인이 ${top.revenue}${top.currency} 매출과 클릭 ${top.clicks}회를 만들었습니다.`
          : '아직 링크 캠페인 데이터가 없습니다.',
        `전체 구매 전환율은 ${(summary.conversionRate * 100).toFixed(1)}%, 클릭당 매출은 ${summary.earningsPerClick}${summary.currency}입니다.`,
      ],
      actionItems: summary.actionItems,
      trends: [] as string[],
      charts: [
        {
          platform: 'sales',
          metricKey: 'revenue',
          points: summary.campaignSummaries.slice(0, 8).map((item) => ({
            date: item.campaign.slug,
            value: item.revenue,
          })),
        },
      ],
      metrics: {
        sales: {
          campaigns: summary.campaigns,
          clicks: summary.clicks,
          leads: summary.leads,
          purchases: summary.purchases,
          revenue: summary.revenue,
          conversionRate: summary.conversionRate,
          earningsPerClick: summary.earningsPerClick,
        },
      },
      generatedAt: new Date().toISOString(),
      source: 'snaps-sales-attribution',
    };
  }

  async proposal(
    organizationId: string,
    body?: SnapsSalesProposalRequest
  ): Promise<SnapsSalesProposal> {
    const summary = await this.summary(organizationId);
    const top = summary.campaignSummaries[0];
    const currency =
      this.cleanText(body?.currency, 12).toUpperCase() ||
      summary.currency ||
      'KRW';
    const leadName = this.cleanText(body?.leadName, 120) || '첫 파일럿 리드';
    const segment =
      this.cleanText(body?.segment, 160) ||
      '혼자 SNS와 콘텐츠 매출을 운영하는 B2B 팀';
    const problem =
      this.cleanText(body?.problem, 220) ||
      '하나의 원문을 플랫폼별 게시물, 쇼츠, 카드뉴스, 댓글 CTA로 반복 제작하는 시간이 길다';
    const sourceAsset =
      this.cleanText(body?.sourceAsset, 180) ||
      top?.campaign.title ||
      '주간 리포트/제품 업데이트 원문';
    const pilotDays = this.cleanInteger(body?.pilotDays, 7, 30, 14);
    const monthlyFee = this.cleanMoneyInput(body?.monthlyFee, 990000);
    const setupFee = this.cleanMoneyInput(body?.setupFee, 300000);
    const targetRevenue = this.cleanMoneyInput(
      body?.targetRevenue,
      Math.max(summary.revenue * 2, 299000)
    );
    const packageName =
      this.cleanText(body?.packageName, 120) ||
      `${pilotDays}일 콘텐츠 매출 파일럿`;
    const channels = this.cleanChannels(body?.channels, top?.campaign.platform);
    const channelText = channels.join(', ');
    const proofMetric = summary.revenue
      ? `${summary.revenue}${summary.currency} 매출`
      : summary.purchases
      ? `${summary.purchases}건 구매 신호`
      : summary.leads
      ? `${summary.leads}건 리드 신호`
      : `${summary.clicks}회 클릭 신호`;
    const targetClicks = Math.max(20, summary.clicks * 2, Math.ceil(targetRevenue / 20000));
    const targetLeads = Math.max(3, summary.leads * 2, Math.ceil(targetClicks * 0.15));
    const targetPurchases = Math.max(1, summary.purchases * 2, Math.ceil(targetLeads * 0.25));
    const pilotFee = this.roundMoney(setupFee + (monthlyFee * pilotDays) / 30);

    return {
      source: 'snaps-sales-proposal',
      generatedAt: new Date().toISOString(),
      leadName,
      segment,
      packageName,
      offer:
        `${leadName}에게 ${pilotDays}일 동안 ${sourceAsset} 1개를 ${channelText}용 콘텐츠, ` +
        '승인 큐, 추적 링크, 댓글 응답 소재로 바꾸고 매출 신호까지 리포트합니다.',
      positioning:
        `${segment}이 ${problem}는 문제를 줄이도록 snaps가 원문 재사용, 일정화, ` +
        '승인, 반응 수집, 매출 귀속을 한 흐름으로 묶어 운영합니다.',
      pilotDays,
      targetRevenue,
      currency,
      evidence: {
        campaigns: summary.campaigns,
        clicks: summary.clicks,
        leads: summary.leads,
        purchases: summary.purchases,
        revenue: summary.revenue,
        conversionRate: summary.conversionRate,
        earningsPerClick: summary.earningsPerClick,
        topCampaign: top
          ? {
              title: top.campaign.title,
              platform: top.campaign.platform,
              revenue: top.revenue,
              clicks: top.clicks,
              trackingUrl: top.campaign.trackingUrl,
            }
          : undefined,
      },
      scope: [
        `원문/기존 자료 1-3개를 Source Library와 RAG 스타일 예시로 정리`,
        `${channelText}에 맞춘 게시물, 쇼츠 대본, 카드뉴스/캐러셀 소재를 준비`,
        `${pilotDays}일 콘텐츠 캘린더와 카테고리 큐를 만들어 승인 흐름까지 연결`,
        '프로필/본문 CTA에 추적 링크를 붙이고 클릭, 리드, 구매 이벤트를 기록',
        '반응함에서 가격/상담/자료 요청 댓글을 골라 후속 답변 초안을 작성',
      ],
      demoAgenda: [
        '현재 콘텐츠 제작 병목과 판매 CTA를 10분 안에 확인',
        `${sourceAsset}을 플랫폼별 초안, 일정, 승인 요청으로 변환`,
        '추적 링크와 리포트 화면에서 파일럿 KPI가 어떻게 증명되는지 시연',
        '댓글/문의 신호를 세일즈 후속 메시지로 바꾸는 운영 흐름 확인',
      ],
      successMetrics: [
        `파일럿 기간 클릭 ${targetClicks}회 또는 리드 ${targetLeads}건 확보`,
        `구매/상담 전환 ${targetPurchases}건 이상 또는 매출 ${targetRevenue}${currency} 목표`,
        '주간 콘텐츠 준비 시간을 40% 이상 줄이고 승인 왕복을 2회 이하로 제한',
        `기존 snaps 데이터 기준 ${proofMetric}를 기준선으로 삼아 개선 폭을 비교`,
      ],
      timeline: [
        {
          day: 'D0',
          work: '킥오프, 원문/브랜드 톤/판매 URL 수집',
          proof: 'Source Library, 스타일 예시, 추적 링크 생성',
        },
        {
          day: 'D1-D3',
          work: '플랫폼별 초안, 쇼츠 대본, 캐러셀, 승인 요청 준비',
          proof: '콘텐츠 캘린더, 카테고리 큐, 승인 상태',
        },
        {
          day: `D4-D${Math.max(7, pilotDays - 2)}`,
          work: '게시물 운영, 클릭/리드/구매 이벤트 기록, 댓글 신호 분류',
          proof: '판매 요약, 반응함 전환 신호, 후속 답변 초안',
        },
        {
          day: `D${pilotDays}`,
          work: '성과 리포트와 다음 달 운영 제안',
          proof: '매출 귀속 리포트, 상위 훅, 다음 액션 목록',
        },
      ],
      pricing: {
        setupFee,
        monthlyFee,
        pilotFee,
        currency,
        note:
          `파일럿 ${pilotDays}일은 세팅비와 월 운영비의 일할 금액을 합산했습니다. ` +
          `목표 매출은 ${targetRevenue}${currency}입니다.`,
      },
      pitch:
        `${leadName}님, ${sourceAsset} 하나로 ${channelText} 콘텐츠와 추적 가능한 상담 CTA까지 ` +
        `${pilotDays}일 안에 만들어 보겠습니다. 이미 snaps에는 ${proofMetric} 기준선이 있어 ` +
        '파일럿 종료 시 제작 시간, 승인 횟수, 클릭/리드/매출을 같은 리포트로 비교할 수 있습니다.',
      followUpMessages: [
        {
          channel: 'email',
          subject: `[snaps] ${packageName} 제안드립니다`,
          body:
            `${leadName}님, ${problem} 문제를 ${pilotDays}일 파일럿으로 검증해보는 제안입니다. ` +
            `${sourceAsset}을 ${channelText} 콘텐츠와 추적 링크로 바꾸고, 마지막 날 매출/리드 리포트까지 드리겠습니다.`,
        },
        {
          channel: 'dm',
          subject: `${pilotDays}일 파일럿 확인`,
          body:
            `${sourceAsset} 하나만 주시면 ${channelText}용 초안, 승인 큐, 상담 CTA, 성과 리포트까지 한 번에 준비하겠습니다. ` +
            `목표는 리드 ${targetLeads}건 또는 ${targetRevenue}${currency} 신호입니다.`,
        },
      ],
      riskReversals: [
        '승인 전에는 어떤 게시물도 외부 채널에 발행하지 않습니다.',
        '파일럿 데이터는 workspace export로 바로 회수할 수 있게 남깁니다.',
        'D7까지 클릭/리드 신호가 없으면 CTA와 훅 3개를 추가 비용 없이 재작성합니다.',
      ],
      nextSteps: [
        '파일럿 대상 원문과 판매/상담 URL을 확정',
        '추적 링크를 프로필/본문 CTA에 배치',
        '킥오프 30분과 최종 리포트 30분 일정을 예약',
        '성공 기준을 클릭, 리드, 구매, 준비 시간 중 2개로 고정',
      ],
    };
  }

  async publicLink(
    slug: string,
    organizationId?: string
  ): Promise<SnapsPublicSalesLink> {
    const found = await this.findCampaignBySlug(slug, organizationId);
    if (!found) {
      throw new NotFoundException('snaps sales link was not found.');
    }
    return this.toPublicLink(found.campaign);
  }

  async publicHub(organizationId: string): Promise<SnapsPublicSalesHub> {
    const org = this.cleanText(organizationId, 200);
    if (!org) {
      throw new NotFoundException('snaps sales link hub was not found.');
    }
    const links = (await this.listCampaigns(org))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, 20)
      .map((campaign) => this.toPublicLink(campaign));
    if (!links.length) {
      throw new NotFoundException('snaps sales link hub was not found.');
    }
    const tags = [
      ...new Set(links.flatMap((link) => link.tags)),
    ].slice(0, 12);
    return {
      source: 'snaps-public-sales-hub',
      organizationId: org,
      title: `${links[0].title} 링크 허브`,
      description:
        'snaps에서 운영 중인 판매/상담 링크를 한 바이오 페이지에 모았습니다.',
      linkInBioUrl: this.hubLinkInBioUrl(org),
      links,
      tags,
      updatedAt: links[0].updatedAt,
    };
  }

  async publicEntry(value: string): Promise<SnapsPublicSalesEntry> {
    const entry = this.cleanText(value, 200);
    if (entry && (await this.salesCampaignOrganizationIds()).includes(entry)) {
      return this.publicHub(entry);
    }
    try {
      return await this.publicLink(value);
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        throw error;
      }
    }
    return this.publicHub(value);
  }

  async recordPublicClick(
    slug: string,
    organizationId?: string,
    metadata?: unknown
  ): Promise<SnapsPublicSalesClick> {
    const found = await this.findCampaignBySlug(slug, organizationId);
    if (!found) {
      throw new NotFoundException('snaps sales link was not found.');
    }
    const visitor = this.publicVisitor(metadata);
    const result = visitor.bot
      ? { counted: false as const, skippedReason: 'bot' as const }
      : await this.recordVisitorClick(found.organizationId, found.campaign, visitor);
    return {
      ...this.toPublicLink(found.campaign),
      redirectUrl: found.campaign.trackingUrl,
      ...result,
    };
  }

  /** Counts one click per visitor per campaign inside the repeat window. */
  @SnapsSerialized()
  private async recordVisitorClick(
    organizationId: string,
    campaign: SnapsSalesCampaign,
    visitor: SnapsPublicVisitor
  ): Promise<Pick<SnapsPublicSalesClick, 'eventId' | 'counted' | 'skippedReason'>> {
    if (visitor.visitorHash) {
      const since = Date.now() - REPEAT_CLICK_WINDOW_MS;
      const repeat = (await this.listEvents(organizationId)).find(
        (event) =>
          event.eventType === 'click' &&
          event.campaignId === campaign.id &&
          event.metadata?.visitorHash === visitor.visitorHash &&
          new Date(event.occurredAt).getTime() >= since
      );
      if (repeat) {
        return { eventId: repeat.id, counted: false, skippedReason: 'duplicate' };
      }
    }
    const event = await this.recordEvent(organizationId, {
      campaignId: campaign.id,
      eventType: 'click',
      platform: campaign.platform,
      metadata: visitor.metadata,
    });
    return { eventId: event.id, counted: true };
  }

  /**
   * Link previews (KakaoTalk, Slack, Facebook, X, Discord...) fetch the tracking URL
   * when it is shared, so they would count as clicks. The raw IP is personal data
   * under PIPA, so only a salted hash is kept to recognize repeat visits.
   */
  private publicVisitor(metadata: unknown): SnapsPublicVisitor {
    const input =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>)
        : {};
    const userAgent = this.cleanText(input.userAgent, 300);
    const ip = this.cleanText(input.ip, 80);
    const referer = this.cleanOptionalText(input.referer, 500);
    const visitorHash =
      ip || userAgent
        ? createHash('sha256')
            .update(`${snapsVisitorSalt()}|${ip}|${userAgent}`)
            .digest('hex')
            .slice(0, 24)
        : undefined;
    return {
      bot: !!userAgent && isSnapsPreviewBot(userAgent),
      visitorHash,
      metadata: {
        ...(visitorHash ? { visitorHash } : {}),
        ...(userAgent ? { userAgent } : {}),
        ...(referer ? { referer } : {}),
      },
    };
  }

  @SnapsSerialized()
  async importCampaigns(organizationId: string, campaigns: unknown[] = []) {
    const current = await this.listCampaigns(organizationId);
    const incoming = campaigns
      .map((campaign) => this.normalizeCampaign(organizationId, campaign))
      .filter((campaign): campaign is SnapsSalesCampaign => !!campaign);
    const merged = this.mergeById([...incoming, ...current]).slice(0, 300);
    await this.writeCampaigns(organizationId, merged);
    return {
      imported: incoming.length,
      total: merged.length,
    };
  }

  @SnapsSerialized()
  async importEvents(organizationId: string, events: unknown[] = []) {
    const current = await this.listEvents(organizationId);
    const incoming = events
      .map((event) => this.normalizeEvent(organizationId, event))
      .filter((event): event is SnapsSalesEvent => !!event);
    const campaigns = await this.listCampaigns(organizationId);
    const merged = await this.storeEvents(
      organizationId,
      campaigns,
      this.mergeById([...incoming, ...current])
    );
    return {
      imported: incoming.length,
      total: merged.length,
    };
  }

  /**
   * Leads and purchases are what the revenue report is built from, so a burst of
   * (public, unauthenticated) clicks must never evict them. Clicks keep a recent
   * window; older ones are rolled up into per-campaign counters instead of dropped.
   */
  private async storeEvents(
    organizationId: string,
    campaigns: SnapsSalesCampaign[],
    events: SnapsSalesEvent[]
  ) {
    const conversions = events.filter((event) => event.eventType !== 'click');
    const clicks = events.filter((event) => event.eventType === 'click');
    const keptConversions = conversions.slice(0, MAX_CONVERSION_EVENTS);
    const keptClicks = clicks.slice(0, MAX_CLICK_EVENTS);
    const rolledUp = new Map<string, number>();
    for (const click of clicks.slice(MAX_CLICK_EVENTS)) {
      rolledUp.set(click.campaignId, (rolledUp.get(click.campaignId) || 0) + 1);
    }
    if (rolledUp.size) {
      await this.writeCampaigns(
        organizationId,
        campaigns.map((campaign) =>
          rolledUp.has(campaign.id)
            ? {
                ...campaign,
                archivedClicks: (campaign.archivedClicks || 0) + rolledUp.get(campaign.id)!,
              }
            : campaign
        )
      );
    }
    const kept = new Set([...keptConversions, ...keptClicks]);
    const stored = events.filter((event) => kept.has(event));
    await this.writeEvents(organizationId, stored);
    return stored;
  }

  private summarizeCampaign(
    campaign: SnapsSalesCampaign,
    events: SnapsSalesEvent[],
    fallbackCurrency: string
  ): SnapsSalesCampaignSummary {
    const campaignEvents = events.filter((event) => event.campaignId === campaign.id);
    const clicks =
      campaignEvents.filter((event) => event.eventType === 'click').length +
      (campaign.archivedClicks || 0);
    const leads = campaignEvents.filter((event) => event.eventType === 'lead').length;
    const purchases = campaignEvents.filter((event) => event.eventType === 'purchase').length;
    const revenue = this.roundMoney(
      campaignEvents
        .filter((event) => event.eventType === 'purchase')
        .reduce((total, event) => total + event.amount, 0)
    );
    const currency = this.primaryCurrency(campaignEvents) || fallbackCurrency;
    return {
      campaign,
      clicks,
      leads,
      purchases,
      revenue,
      currency,
      conversionRate: clicks ? this.roundRate(purchases / clicks) : 0,
      earningsPerClick: clicks ? this.roundMoney(revenue / clicks) : 0,
    };
  }

  private withSlug(campaign: SnapsSalesCampaign, slug: string) {
    return {
      ...campaign,
      slug,
      trackingUrl: this.trackingUrl(
        campaign.destinationUrl,
        slug,
        campaign.platform
      ),
      linkInBioUrl: this.linkInBioUrl(slug, campaign.organizationId),
    };
  }

  private normalizeCampaign(
    organizationId: string,
    value: unknown
  ): SnapsSalesCampaign | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const input = value as Partial<SnapsSalesCampaign>;
    const destinationUrl = this.cleanUrl(input.destinationUrl);
    if (!destinationUrl) {
      return undefined;
    }

    const title =
      this.cleanText(input.title, 160) ||
      this.titleFromUrl(destinationUrl) ||
      'snaps sales link';
    const platform = this.cleanPlatform(input.platform);
    const slug = this.slugify(input.slug || title);
    const createdAt = this.cleanDate(input.createdAt) || new Date().toISOString();
    const updatedAt = this.cleanDate(input.updatedAt) || createdAt;

    return {
      id: this.cleanText(input.id, 160) || makeId(14),
      organizationId,
      title,
      destinationUrl,
      trackingUrl: this.trackingUrl(destinationUrl, slug, platform),
      linkInBioUrl: this.linkInBioUrl(slug, organizationId),
      cta: this.cleanText(input.cta, 120) || '자세히 보기',
      platform,
      sourceId: this.cleanOptionalText(input.sourceId, 160),
      postId: this.cleanOptionalText(input.postId, 160),
      slug,
      tags: this.cleanTags(input.tags),
      archivedClicks: this.cleanArchivedClicks(input.archivedClicks),
      createdAt,
      updatedAt,
    };
  }

  private cleanArchivedClicks(value: unknown) {
    const count = Math.floor(Number(value));
    return Number.isFinite(count) && count > 0 ? count : undefined;
  }

  private normalizeEvent(
    organizationId: string,
    value: unknown
  ): SnapsSalesEvent | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const input = value as Partial<SnapsSalesEvent>;
    const campaignId = this.cleanText(input.campaignId, 160);
    const eventType = this.cleanText(input.eventType, 40) as SnapsSalesEventType;
    if (!campaignId || !eventTypes.includes(eventType)) {
      return undefined;
    }

    return {
      id: this.cleanText(input.id, 160) || makeId(14),
      organizationId,
      campaignId,
      eventType,
      platform: this.cleanPlatform(input.platform),
      postId: this.cleanOptionalText(input.postId, 160),
      amount:
        eventType === 'purchase'
          ? this.cleanAmount(input.amount)
          : 0,
      currency: this.cleanText(input.currency, 12).toUpperCase() || 'KRW',
      occurredAt: this.cleanDate(input.occurredAt) || new Date().toISOString(),
      metadata: this.cleanEventMetadata(input.metadata),
    };
  }

  private salesActionItems(
    campaigns: number,
    clicks: number,
    purchases: number,
    revenue: number
  ) {
    if (!campaigns) {
      return ['첫 링크 캠페인을 만들고 모든 SNS CTA에 같은 추적 URL을 붙이세요.'];
    }
    if (!clicks) {
      return ['게시물 본문과 프로필 링크에 추적 URL을 배치해 클릭 데이터를 먼저 확보하세요.'];
    }
    if (!purchases) {
      return ['구매 전환이 없으므로 리드 이벤트를 먼저 기록하고 CTA/랜딩 문구를 테스트하세요.'];
    }
    return [
      `매출 ${revenue} 기준 상위 캠페인의 훅과 CTA를 RAG 예시로 승격하세요.`,
      '클릭당 매출이 낮은 플랫폼은 같은 원문을 다른 각도로 재변환해 A/B 테스트하세요.',
    ];
  }

  private primaryCurrency(events: SnapsSalesEvent[]) {
    const purchase = events.find((event) => event.eventType === 'purchase' && event.currency);
    return purchase?.currency || 'KRW';
  }

  private async findCampaignBySlug(
    value: unknown,
    organizationId?: unknown
  ): Promise<{ organizationId: string; campaign: SnapsSalesCampaign } | undefined> {
    const slug = this.cleanText(value, 180);
    if (!slug) {
      return undefined;
    }
    const normalizedSlug = this.slugify(slug);
    const org = this.cleanOptionalText(organizationId, 200);
    const organizationIds = org ? [org] : await this.salesCampaignOrganizationIds();
    const matches: Array<{
      organizationId: string;
      campaign: SnapsSalesCampaign;
    }> = [];

    for (const currentOrg of organizationIds) {
      const campaigns = await this.listCampaigns(currentOrg);
      for (const campaign of campaigns) {
        if (
          campaign.slug === slug ||
          campaign.slug === normalizedSlug ||
          campaign.id === slug
        ) {
          matches.push({
            organizationId: currentOrg,
            campaign,
          });
        }
      }
    }

    if (org) {
      return matches.sort(
        (a, b) =>
          Date.parse(b.campaign.updatedAt) - Date.parse(a.campaign.updatedAt)
      )[0];
    }
    // Slug-only (legacy) links are shared across tenants: the campaign that claimed the
    // slug first keeps it, so another organization creating the same slug later cannot
    // redirect links that are already out in the wild.
    return matches.sort(
      (a, b) =>
        Date.parse(a.campaign.createdAt) - Date.parse(b.campaign.createdAt) ||
        a.organizationId.localeCompare(b.organizationId)
    )[0];
  }

  private async salesCampaignOrganizationIds() {
    try {
      const files = await fs.readdir(this.dataDir);
      return files
        .filter((file) => file.endsWith(salesCampaignsFileSuffix))
        .map((file) => file.slice(0, -salesCampaignsFileSuffix.length))
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  private toPublicLink(campaign: SnapsSalesCampaign): SnapsPublicSalesLink {
    return {
      source: 'snaps-public-sales-link',
      organizationId: campaign.organizationId,
      campaignId: campaign.id,
      title: campaign.title,
      cta: campaign.cta,
      platform: campaign.platform,
      slug: campaign.slug,
      tags: campaign.tags,
      destinationHost: this.destinationHost(campaign.destinationUrl),
      linkInBioUrl: campaign.linkInBioUrl,
      clickPath: `/public/snaps/link/${encodeURIComponent(
        campaign.organizationId
      )}/${encodeURIComponent(campaign.slug)}/go`,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    };
  }

  private trackingUrl(destinationUrl: string, slug: string, platform?: string) {
    try {
      const parsed = new URL(destinationUrl);
      parsed.searchParams.set('utm_source', platform || 'snaps');
      parsed.searchParams.set('utm_medium', 'social');
      parsed.searchParams.set('utm_campaign', slug);
      return parsed.toString();
    } catch {
      return destinationUrl;
    }
  }

  private linkInBioUrl(slug: string, organizationId?: string) {
    const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:4200').replace(/\/$/, '');
    const path = organizationId
      ? `${encodeURIComponent(organizationId)}/${encodeURIComponent(slug)}`
      : encodeURIComponent(slug);
    return `${baseUrl}/snaps/link/${path}`;
  }

  private hubLinkInBioUrl(organizationId: string) {
    const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:4200').replace(/\/$/, '');
    return `${baseUrl}/snaps/link/${encodeURIComponent(organizationId)}`;
  }

  private destinationHost(value: string) {
    try {
      return new URL(value).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  private async writeCampaigns(
    organizationId: string,
    campaigns: SnapsSalesCampaign[]
  ) {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.atomicWrite(
      this.filePath(organizationId, 'sales-campaigns'),
      JSON.stringify(campaigns, null, 2)
    );
  }

  private async writeEvents(organizationId: string, events: SnapsSalesEvent[]) {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.atomicWrite(
      this.filePath(organizationId, 'sales-events'),
      JSON.stringify(events, null, 2)
    );
  }

  private filePath(
    organizationId: string,
    name: 'sales-campaigns' | 'sales-events'
  ) {
    const safeOrg = organizationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, `${safeOrg}.${name}.json`);
  }

  private mergeById<T extends { id: string }>(items: T[]) {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    });
  }

  private uniqueSlug(slug: string, existing: Set<string>) {
    if (!existing.has(slug)) {
      return slug;
    }
    let index = 2;
    let candidate = `${slug}-${index}`;
    while (existing.has(candidate)) {
      index += 1;
      candidate = `${slug}-${index}`;
    }
    return candidate;
  }

  private slugify(value: unknown) {
    const text = this.cleanText(value, 120)
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, '-')
      .replace(/^-+|-+$/g, '');
    // Organization ids are UUIDs and share the /snaps/link/:value namespace with slugs.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(text)) {
      return `link-${text}`;
    }
    return text || makeId(8).toLowerCase();
  }

  private titleFromUrl(value: string) {
    try {
      const parsed = new URL(value);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  private cleanUrl(value: unknown) {
    const text = this.cleanText(value, 2000);
    if (!text) {
      return '';
    }
    try {
      const parsed = new URL(text);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return '';
      }
      return parsed.toString();
    } catch {
      return '';
    }
  }

  private cleanPlatform(value: unknown): SnapsTargetPlatform | undefined {
    const platform = this.cleanText(value, 80);
    return snapsTargetPlatforms.includes(platform as SnapsTargetPlatform)
      ? (platform as SnapsTargetPlatform)
      : undefined;
  }

  private cleanAmount(value: unknown) {
    const amount = Number(value || 0);
    return Number.isFinite(amount) && amount > 0 ? this.roundMoney(amount) : 0;
  }

  private cleanMoneyInput(value: unknown, fallback: number) {
    const amount = this.cleanAmount(value);
    return amount || fallback;
  }

  private cleanInteger(
    value: unknown,
    min: number,
    max: number,
    fallback: number
  ) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(amount)));
  }

  private cleanChannels(value: unknown, fallbackPlatform?: SnapsTargetPlatform) {
    const fallback = fallbackPlatform
      ? [fallbackPlatform, 'threads', 'linkedin']
      : ['instagram', 'threads', 'linkedin'];
    const raw = Array.isArray(value)
      ? value
      : typeof value === 'string'
      ? value.split(/[,\n|]+/)
      : fallback;
    const channels = [
      ...new Set(
        raw
          .map((item) => this.cleanText(item, 40))
          .filter(Boolean)
      ),
    ].slice(0, 5);
    return channels.length ? channels : fallback;
  }

  private cleanDate(value: unknown) {
    const text = this.cleanText(value, 80);
    if (!text) {
      return '';
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  }

  /** Drops raw IP addresses, including ones stored before visitors were hashed. */
  private cleanEventMetadata(value: unknown) {
    const record = this.cleanRecord(value);
    if (!record) {
      return undefined;
    }
    const { ip: _ip, ipAddress: _ipAddress, ...rest } = record;
    return Object.keys(rest).length ? rest : undefined;
  }

  private cleanRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
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

  private cleanOptionalText(value: unknown, maxLength = 1000) {
    const text = this.cleanText(value, maxLength);
    return text || undefined;
  }

  private cleanTags(value: unknown) {
    return Array.isArray(value)
      ? [
          ...new Set(
            value
              .map((tag) => this.cleanText(tag, 80))
              .filter(Boolean)
          ),
        ].slice(0, 30)
      : [];
  }

  private roundMoney(value: number) {
    return Math.round(value * 100) / 100;
  }

  private roundRate(value: number) {
    return Math.round(value * 10000) / 10000;
  }

  private async atomicWrite(filePath: string, content: string) {
    await writeSnapsFileAtomic(filePath, content);
  }
}
