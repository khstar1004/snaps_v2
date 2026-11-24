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

export type SnapsCompetitorProfileInput = {
  name?: unknown;
  handle?: unknown;
  profileUrl?: unknown;
  platform?: unknown;
  niche?: unknown;
  tags?: unknown;
  favorite?: unknown;
};

export type SnapsCompetitorSnapshotInput = {
  competitorId?: unknown;
  collectedAt?: unknown;
  followers?: unknown;
  followersGrowth?: unknown;
  postsCount?: unknown;
  videosCount?: unknown;
  photosCount?: unknown;
  linksCount?: unknown;
  statusesCount?: unknown;
  engagement?: unknown;
  engagementRate?: unknown;
  reach?: unknown;
  topPosts?: unknown;
  notes?: unknown;
};

export type SnapsCompetitorImportRequest = {
  importText?: unknown;
  defaultPlatform?: unknown;
  defaultNiche?: unknown;
  maxRows?: unknown;
};

export type SnapsCompetitorImportRowStatus = 'ready' | 'warning' | 'invalid';

export type SnapsCompetitorTopPost = {
  title: string;
  url?: string;
  format?: 'video' | 'photo' | 'link' | 'status' | 'carousel' | 'unknown';
  publishedAt?: string;
  engagement: number;
  hook?: string;
  notes?: string;
};

export type SnapsCompetitorImportRow = {
  rowNumber: number;
  name: string;
  handle?: string;
  profileUrl?: string;
  platform?: SnapsTargetPlatform;
  niche?: string;
  tags: string[];
  collectedAt: string;
  followers: number;
  followersGrowth: number;
  postsCount: number;
  videosCount: number;
  photosCount: number;
  linksCount: number;
  statusesCount: number;
  engagement: number;
  engagementRate: number;
  reach: number;
  topPosts: SnapsCompetitorTopPost[];
  notes?: string;
  warnings: string[];
  status: SnapsCompetitorImportRowStatus;
};

export type SnapsCompetitorProfile = {
  id: string;
  organizationId: string;
  name: string;
  handle?: string;
  profileUrl?: string;
  platform: SnapsTargetPlatform;
  niche?: string;
  tags: string[];
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SnapsCompetitorSnapshot = {
  id: string;
  organizationId: string;
  competitorId: string;
  collectedAt: string;
  followers: number;
  followersGrowth: number;
  postsCount: number;
  videosCount: number;
  photosCount: number;
  linksCount: number;
  statusesCount: number;
  engagement: number;
  engagementRate: number;
  reach: number;
  topPosts: SnapsCompetitorTopPost[];
  notes?: string;
};

export type SnapsCompetitorInsight = {
  competitor: SnapsCompetitorProfile;
  latest: SnapsCompetitorSnapshot;
  previous?: SnapsCompetitorSnapshot;
  followerDelta: number;
  engagementDelta: number;
  postsDelta: number;
  videoShare: number;
  score: number;
};

export type SnapsCompetitorSummary = {
  competitors: number;
  snapshots: number;
  totalFollowers: number;
  totalEngagement: number;
  averageEngagementRate: number;
  videoShare: number;
  topCompetitors: SnapsCompetitorInsight[];
  topPosts: Array<SnapsCompetitorTopPost & { competitorName: string; platform: SnapsTargetPlatform }>;
  contentMix: {
    posts: number;
    videos: number;
    photos: number;
    links: number;
    statuses: number;
  };
  actionItems: string[];
};

export type SnapsCompetitorImportPreview = {
  product: 'snaps';
  source: 'snaps-competitor-import';
  format: 'csv' | 'json';
  columns: string[];
  sampleCsv: string;
  totalRows: number;
  acceptedRows: number;
  invalidRows: number;
  profileRows: number;
  snapshotRows: number;
  rows: SnapsCompetitorImportRow[];
};

@Injectable()
export class SnapsCompetitorAnalyticsService {
  private readonly dataDir =
    process.env.SNAPS_DATA_DIR || path.join(process.cwd(), 'var', 'snaps');

  readonly sampleImportCsv = [
    'name,handle,profileUrl,platform,niche,tags,followers,followersGrowth,postsCount,videosCount,photosCount,engagement,engagementRate,topPostTitle,topPostUrl,topPostFormat,topPostEngagement,topPostHook,collectedAt',
    'Rival Studio,@rivalstudio,https://instagram.com/rivalstudio,instagram,B2B 콘텐츠 자동화,"AI|릴스",18000,420,12,7,5,960,5.3,"3초 안에 자동화 문제를 보여준 릴스",https://example.com/rival-reel,video,960,"수작업 콘텐츠를 줄이세요",2026-05-31T09:00:00+09:00',
  ].join('\n');

  @SnapsSerialized()
  async saveProfile(
    organizationId: string,
    body?: SnapsCompetitorProfileInput
  ) {
    const profiles = await this.listProfiles(organizationId);
    const now = new Date().toISOString();
    const next = this.normalizeProfile(organizationId, {
      ...body,
      id: makeId(14),
      createdAt: now,
      updatedAt: now,
    });
    if (!next) {
      throw new BadRequestException('competitor name and platform are required.');
    }

    await this.writeProfiles(organizationId, [next, ...profiles].slice(0, 200));
    return next;
  }

  async listProfiles(organizationId: string) {
    try {
      const file = await fs.readFile(
        this.filePath(organizationId, 'competitor-profiles'),
        'utf8'
      );
      const parsed = JSON.parse(file);
      if (!Array.isArray(parsed)) {
        return [] as SnapsCompetitorProfile[];
      }
      return parsed
        .map((profile) => this.normalizeProfile(organizationId, profile))
        .filter((profile): profile is SnapsCompetitorProfile => !!profile);
    } catch {
      return [] as SnapsCompetitorProfile[];
    }
  }

  @SnapsSerialized()
  async deleteProfile(organizationId: string, competitorId: string) {
    const profiles = await this.listProfiles(organizationId);
    const snapshots = await this.listSnapshots(organizationId);
    const nextProfiles = profiles.filter((profile) => profile.id !== competitorId);
    const nextSnapshots = snapshots.filter(
      (snapshot) => snapshot.competitorId !== competitorId
    );
    await Promise.all([
      this.writeProfiles(organizationId, nextProfiles),
      this.writeSnapshots(organizationId, nextSnapshots),
    ]);
    return {
      deleted: nextProfiles.length !== profiles.length,
      profiles: nextProfiles.length,
      snapshots: nextSnapshots.length,
    };
  }

  @SnapsSerialized()
  async recordSnapshot(
    organizationId: string,
    body?: SnapsCompetitorSnapshotInput
  ) {
    const profiles = await this.listProfiles(organizationId);
    const snapshots = await this.listSnapshots(organizationId);
    const next = this.normalizeSnapshot(organizationId, {
      ...body,
      id: makeId(14),
      collectedAt: this.cleanDate(body?.collectedAt) || new Date().toISOString(),
    });
    if (!next) {
      throw new BadRequestException('competitorId is required for competitor analytics.');
    }
    if (!profiles.some((profile) => profile.id === next.competitorId)) {
      throw new NotFoundException('snaps competitor profile was not found.');
    }

    await this.writeSnapshots(organizationId, [next, ...snapshots].slice(0, 2000));
    return next;
  }

  async listSnapshots(organizationId: string) {
    try {
      const file = await fs.readFile(
        this.filePath(organizationId, 'competitor-snapshots'),
        'utf8'
      );
      const parsed = JSON.parse(file);
      if (!Array.isArray(parsed)) {
        return [] as SnapsCompetitorSnapshot[];
      }
      return parsed
        .map((snapshot) => this.normalizeSnapshot(organizationId, snapshot))
        .filter((snapshot): snapshot is SnapsCompetitorSnapshot => !!snapshot);
    } catch {
      return [] as SnapsCompetitorSnapshot[];
    }
  }

  async summary(organizationId: string): Promise<SnapsCompetitorSummary> {
    const [profiles, snapshots] = await Promise.all([
      this.listProfiles(organizationId),
      this.listSnapshots(organizationId),
    ]);
    const byCompetitor = new Map<string, SnapsCompetitorSnapshot[]>();
    for (const snapshot of snapshots) {
      byCompetitor.set(snapshot.competitorId, [
        ...(byCompetitor.get(snapshot.competitorId) || []),
        snapshot,
      ]);
    }

    const insights = profiles
      .map((profile) => this.insightFor(profile, byCompetitor.get(profile.id) || []))
      .filter((insight): insight is SnapsCompetitorInsight => !!insight)
      .sort((a, b) => b.score - a.score);
    const latestSnapshots = insights.map((insight) => insight.latest);
    const contentMix = latestSnapshots.reduce(
      (total, snapshot) => ({
        posts: total.posts + snapshot.postsCount,
        videos: total.videos + snapshot.videosCount,
        photos: total.photos + snapshot.photosCount,
        links: total.links + snapshot.linksCount,
        statuses: total.statuses + snapshot.statusesCount,
      }),
      { posts: 0, videos: 0, photos: 0, links: 0, statuses: 0 }
    );
    const totalEngagement = this.roundNumber(
      latestSnapshots.reduce((total, snapshot) => total + snapshot.engagement, 0)
    );
    const totalFollowers = this.roundNumber(
      latestSnapshots.reduce((total, snapshot) => total + snapshot.followers, 0)
    );
    const topPosts = insights
      .flatMap((insight) =>
        insight.latest.topPosts.map((post) => ({
          ...post,
          competitorName: insight.competitor.name,
          platform: insight.competitor.platform,
        }))
      )
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 10);

    return {
      competitors: profiles.length,
      snapshots: snapshots.length,
      totalFollowers,
      totalEngagement,
      averageEngagementRate: latestSnapshots.length
        ? this.roundRate(
            latestSnapshots.reduce(
              (total, snapshot) => total + snapshot.engagementRate,
              0
            ) / latestSnapshots.length
          )
        : 0,
      videoShare: contentMix.posts
        ? this.roundRate(contentMix.videos / contentMix.posts)
        : 0,
      topCompetitors: insights.slice(0, 8),
      topPosts,
      contentMix,
      actionItems: this.actionItems(profiles.length, insights, contentMix, topPosts),
    };
  }

  async report(organizationId: string) {
    const summary = await this.summary(organizationId);
    const leader = summary.topCompetitors[0];
    return {
      title: 'snaps 경쟁 계정 분석 리포트',
      summary:
        `경쟁 계정 ${summary.competitors}개, 스냅샷 ${summary.snapshots}개를 기준으로 ` +
        `팔로워 ${summary.totalFollowers}, 참여 ${summary.totalEngagement}, 평균 참여율 ${(summary.averageEngagementRate * 100).toFixed(1)}%를 비교했습니다.`,
      insights: [
        leader
          ? `${leader.competitor.name}가 경쟁 점수 ${leader.score}로 가장 강합니다. 팔로워 변화 ${leader.followerDelta}, 참여 변화 ${leader.engagementDelta}입니다.`
          : '아직 경쟁 계정 스냅샷이 없습니다.',
        `경쟁군의 영상 비중은 ${(summary.videoShare * 100).toFixed(1)}%입니다.`,
        summary.topPosts[0]
          ? `최고 반응 콘텐츠는 ${summary.topPosts[0].competitorName}의 "${summary.topPosts[0].title}"입니다.`
          : '상위 포스트를 입력하면 훅/형식 분석이 가능합니다.',
      ],
      actionItems: summary.actionItems,
      trends: summary.topCompetitors.map((item) => ({
        platform: item.competitor.platform,
        metricKey: `${item.competitor.name}_engagement`,
        firstValue: item.previous?.engagement || 0,
        lastValue: item.latest.engagement,
        delta: item.engagementDelta,
      })),
      charts: [
        {
          platform: 'competitors',
          metricKey: 'engagement',
          points: summary.topCompetitors.map((item) => ({
            date: item.competitor.name,
            value: item.latest.engagement,
          })),
        },
        {
          platform: 'competitors',
          metricKey: 'followers',
          points: summary.topCompetitors.map((item) => ({
            date: item.competitor.name,
            value: item.latest.followers,
          })),
        },
      ],
      metrics: {
        competitors: {
          competitors: summary.competitors,
          snapshots: summary.snapshots,
          followers: summary.totalFollowers,
          engagement: summary.totalEngagement,
          averageEngagementRate: summary.averageEngagementRate,
          videoShare: summary.videoShare,
          posts: summary.contentMix.posts,
          videos: summary.contentMix.videos,
          photos: summary.contentMix.photos,
          links: summary.contentMix.links,
          statuses: summary.contentMix.statuses,
        },
      },
      generatedAt: new Date().toISOString(),
      source: 'snaps-competitor-analysis',
    };
  }

  @SnapsSerialized()
  async importProfiles(organizationId: string, profiles: unknown[] = []) {
    const current = await this.listProfiles(organizationId);
    const incoming = profiles
      .map((profile) => this.normalizeProfile(organizationId, profile))
      .filter((profile): profile is SnapsCompetitorProfile => !!profile);
    const merged = this.mergeById([...incoming, ...current]).slice(0, 200);
    await this.writeProfiles(organizationId, merged);
    return {
      imported: incoming.length,
      total: merged.length,
    };
  }

  previewImport(
    body?: SnapsCompetitorImportRequest
  ): SnapsCompetitorImportPreview {
    const request = body || {};
    const importText = this.cleanImportText(request.importText, 500000);
    if (!importText) {
      throw new BadRequestException('importText is required for competitor import.');
    }

    const parsed = this.parseImportText(importText);
    const maxRows = this.clampNumber(request.maxRows, 500, 1, 1000);
    const defaults = {
      defaultPlatform: this.cleanPlatform(request.defaultPlatform),
      defaultNiche: this.cleanText(request.defaultNiche, 200),
    };
    const rows = parsed.records
      .slice(0, maxRows)
      .map((record, index) =>
        this.normalizeImportRow(record, parsed.firstRowNumber + index, defaults)
      )
      .filter((row): row is SnapsCompetitorImportRow => !!row);

    return {
      product: 'snaps',
      source: 'snaps-competitor-import',
      format: parsed.format,
      columns: parsed.columns,
      sampleCsv: this.sampleImportCsv,
      totalRows: rows.length,
      acceptedRows: rows.filter((row) => row.status !== 'invalid').length,
      invalidRows: rows.filter((row) => row.status === 'invalid').length,
      profileRows: rows.filter((row) => row.status !== 'invalid').length,
      snapshotRows: rows.filter((row) => this.hasSnapshotMetrics(row)).length,
      rows,
    };
  }

  @SnapsSerialized()
  async importPublicSnapshots(
    organizationId: string,
    body?: SnapsCompetitorImportRequest
  ) {
    const preview = this.previewImport(body);
    const [currentProfiles, currentSnapshots] = await Promise.all([
      this.listProfiles(organizationId),
      this.listSnapshots(organizationId),
    ]);
    const profileIndex = new Map(
      currentProfiles.map((profile) => [this.profileImportKey(profile), profile])
    );
    const profiles = [...currentProfiles];
    const importedProfileIds = new Set<string>();
    const importedSnapshots: SnapsCompetitorSnapshot[] = [];
    let createdProfiles = 0;
    let updatedProfiles = 0;

    for (const row of preview.rows.filter((item) => item.status !== 'invalid')) {
      if (!row.platform) {
        continue;
      }
      const key = this.profileImportKey(row);
      const existing = profileIndex.get(key);
      const now = new Date().toISOString();
      const profile = this.normalizeProfile(organizationId, {
        ...(existing || {}),
        name: row.name,
        handle: row.handle || existing?.handle,
        profileUrl: row.profileUrl || existing?.profileUrl,
        platform: row.platform,
        niche: row.niche || existing?.niche,
        tags: [...(existing?.tags || []), ...row.tags],
        favorite: existing?.favorite || false,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      });
      if (!profile) {
        continue;
      }

      profileIndex.set(key, profile);
      importedProfileIds.add(profile.id);
      if (existing) {
        updatedProfiles += 1;
        const index = profiles.findIndex((item) => item.id === existing.id);
        if (index >= 0) {
          profiles[index] = profile;
        }
      } else {
        createdProfiles += 1;
        profiles.unshift(profile);
      }

      if (this.hasSnapshotMetrics(row)) {
        const snapshot = this.normalizeSnapshot(organizationId, {
          competitorId: profile.id,
          collectedAt: row.collectedAt,
          followers: row.followers,
          followersGrowth: row.followersGrowth,
          postsCount: row.postsCount,
          videosCount: row.videosCount,
          photosCount: row.photosCount,
          linksCount: row.linksCount,
          statusesCount: row.statusesCount,
          engagement: row.engagement,
          engagementRate: row.engagementRate,
          reach: row.reach,
          topPosts: row.topPosts,
          notes: row.notes,
        });
        if (snapshot) {
          importedSnapshots.push(snapshot);
        }
      }
    }

    const nextProfiles = this.mergeById(profiles).slice(0, 200);
    const nextSnapshots = this.mergeById([
      ...importedSnapshots,
      ...currentSnapshots,
    ]).slice(0, 2000);
    await Promise.all([
      this.writeProfiles(organizationId, nextProfiles),
      this.writeSnapshots(organizationId, nextSnapshots),
    ]);

    return {
      ...preview,
      imported: {
        profiles: importedProfileIds.size,
        createdProfiles,
        updatedProfiles,
        snapshots: importedSnapshots.length,
        totalProfiles: nextProfiles.length,
        totalSnapshots: nextSnapshots.length,
      },
    };
  }

  @SnapsSerialized()
  async importSnapshots(organizationId: string, snapshots: unknown[] = []) {
    const current = await this.listSnapshots(organizationId);
    const incoming = snapshots
      .map((snapshot) => this.normalizeSnapshot(organizationId, snapshot))
      .filter((snapshot): snapshot is SnapsCompetitorSnapshot => !!snapshot);
    const merged = this.mergeById([...incoming, ...current]).slice(0, 2000);
    await this.writeSnapshots(organizationId, merged);
    return {
      imported: incoming.length,
      total: merged.length,
    };
  }

  private insightFor(
    competitor: SnapsCompetitorProfile,
    snapshots: SnapsCompetitorSnapshot[]
  ): SnapsCompetitorInsight | undefined {
    const sorted = [...snapshots].sort(
      (a, b) =>
        new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime()
    );
    const latest = sorted[0];
    if (!latest) {
      return undefined;
    }
    const previous = sorted[1];
    const followerDelta =
      latest.followersGrowth ||
      (previous ? latest.followers - previous.followers : 0);
    const engagementDelta = previous
      ? latest.engagement - previous.engagement
      : latest.engagement;
    const postsDelta = previous
      ? latest.postsCount - previous.postsCount
      : latest.postsCount;
    const videoShare = latest.postsCount
      ? this.roundRate(latest.videosCount / latest.postsCount)
      : 0;
    const score = this.roundNumber(
      latest.engagement +
        followerDelta * 2 +
        latest.reach * 0.05 +
        latest.engagementRate * 1000 +
        videoShare * 100
    );
    return {
      competitor,
      latest,
      previous,
      followerDelta: this.roundNumber(followerDelta),
      engagementDelta: this.roundNumber(engagementDelta),
      postsDelta: this.roundNumber(postsDelta),
      videoShare,
      score,
    };
  }

  private normalizeProfile(
    organizationId: string,
    value: unknown
  ): SnapsCompetitorProfile | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const input = value as Partial<SnapsCompetitorProfile>;
    const name = this.cleanText(input.name, 160);
    const platform = this.cleanPlatform(input.platform);
    if (!name || !platform) {
      return undefined;
    }
    const createdAt = this.cleanDate(input.createdAt) || new Date().toISOString();
    const updatedAt = this.cleanDate(input.updatedAt) || createdAt;
    return {
      id: this.cleanText(input.id, 160) || makeId(14),
      organizationId,
      name,
      handle: this.cleanOptionalText(input.handle, 160),
      profileUrl: this.cleanOptionalUrl(input.profileUrl),
      platform,
      niche: this.cleanOptionalText(input.niche, 200),
      tags: this.cleanTags(input.tags),
      favorite: input.favorite === true,
      createdAt,
      updatedAt,
    };
  }

  private normalizeSnapshot(
    organizationId: string,
    value: unknown
  ): SnapsCompetitorSnapshot | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const input = value as Partial<SnapsCompetitorSnapshot>;
    const competitorId = this.cleanText(input.competitorId, 160);
    if (!competitorId) {
      return undefined;
    }
    return {
      id: this.cleanText(input.id, 160) || makeId(14),
      organizationId,
      competitorId,
      collectedAt: this.cleanDate(input.collectedAt) || new Date().toISOString(),
      followers: this.cleanNumber(input.followers),
      followersGrowth: this.cleanSignedNumber(input.followersGrowth),
      postsCount: this.cleanNumber(input.postsCount),
      videosCount: this.cleanNumber(input.videosCount),
      photosCount: this.cleanNumber(input.photosCount),
      linksCount: this.cleanNumber(input.linksCount),
      statusesCount: this.cleanNumber(input.statusesCount),
      engagement: this.cleanNumber(input.engagement),
      engagementRate: this.cleanRate(input.engagementRate),
      reach: this.cleanNumber(input.reach),
      topPosts: this.cleanTopPosts(input.topPosts),
      notes: this.cleanOptionalText(input.notes, 1000),
    };
  }

  private actionItems(
    competitors: number,
    insights: SnapsCompetitorInsight[],
    contentMix: SnapsCompetitorSummary['contentMix'],
    topPosts: SnapsCompetitorSummary['topPosts']
  ) {
    if (!competitors) {
      return ['상위 경쟁 계정 3개를 추가하고 팔로워/참여/게시물 믹스 스냅샷을 입력하세요.'];
    }
    if (!insights.length) {
      return ['경쟁 계정별 최신 스냅샷을 기록해 팔로워 성장과 콘텐츠 형식 차이를 비교하세요.'];
    }
    const leader = insights[0];
    const items = [
      `${leader.competitor.name}의 상위 훅을 이번 주 원문 변환 프롬프트에 반영하세요.`,
    ];
    if (contentMix.posts && contentMix.videos / contentMix.posts >= 0.45) {
      items.push('경쟁군 영상 비중이 높으므로 같은 원문을 쇼츠/릴스/틱톡 대본으로 먼저 전개하세요.');
    } else {
      items.push('경쟁군이 아직 영상 중심이 아니므로 카드형/스레드형 정보 콘텐츠로 선점하세요.');
    }
    if (topPosts[0]?.hook) {
      items.push(`최고 반응 훅 "${topPosts[0].hook}"를 RAG 예시와 CTA 실험에 연결하세요.`);
    }
    return items;
  }

  private cleanTopPosts(value: unknown): SnapsCompetitorTopPost[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item): SnapsCompetitorTopPost | undefined => {
        if (!item || typeof item !== 'object') {
          return undefined;
        }
        const post = item as Partial<SnapsCompetitorTopPost>;
        const title = this.cleanText(post.title, 220);
        if (!title) {
          return undefined;
        }
        return {
          title,
          url: this.cleanOptionalUrl(post.url),
          format: this.cleanPostFormat(post.format),
          publishedAt: this.cleanDate(post.publishedAt) || undefined,
          engagement: this.cleanNumber(post.engagement),
          hook: this.cleanOptionalText(post.hook, 240),
          notes: this.cleanOptionalText(post.notes, 500),
        };
      })
      .filter((post): post is SnapsCompetitorTopPost => !!post)
      .slice(0, 20);
  }

  private normalizeImportRow(
    raw: Record<string, unknown>,
    rowNumber: number,
    defaults: {
      defaultPlatform?: SnapsTargetPlatform;
      defaultNiche?: string;
    }
  ): SnapsCompetitorImportRow | undefined {
    if (!Object.values(raw).some((value) => this.cleanText(value, 500))) {
      return undefined;
    }

    const account = this.asRecord(
      this.pickField(raw, ['account', 'profile', 'competitor'])
    );
    const pick = (aliases: string[], maxLength = 1000) =>
      this.cleanText(
        this.pickField(raw, aliases) ?? this.pickField(account, aliases),
        maxLength
      );
    const pickNumber = (aliases: string[]) =>
      this.cleanSignedNumber(
        this.pickField(raw, aliases) ?? this.pickField(account, aliases)
      );

    const handle = this.cleanHandle(
      pick(['handle', 'username', 'user', 'screenName'], 160)
    );
    const name =
      pick(['name', 'accountName', 'competitorName', 'displayName', 'profileName'], 160) ||
      handle?.replace(/^@/, '') ||
      '';
    const platform =
      this.cleanPlatform(
        this.pickField(raw, ['platform', 'provider', 'network', 'channel']) ??
          this.pickField(account, ['platform', 'provider', 'network', 'channel'])
      ) || defaults.defaultPlatform;
    const profileUrl = this.cleanOptionalUrl(
      pick(['profileUrl', 'profileLink', 'accountUrl', 'accountLink'], 2000)
    );
    const niche =
      pick(['niche', 'category', 'topic', 'industry', 'segment'], 200) ||
      defaults.defaultNiche ||
      undefined;
    const collectedAt =
      this.cleanDate(pick(['collectedAt', 'capturedAt', 'date', 'from', 'to'], 120)) ||
      new Date().toISOString();
    const postsCount = this.cleanNumber(
      pickNumber(['postsCount', 'posts', 'postCount', 'posts_count'])
    );
    const videosCount = this.cleanNumber(
      pickNumber(['videosCount', 'videos', 'videoCount', 'videos_count'])
    );
    const photosCount = this.cleanNumber(
      pickNumber(['photosCount', 'photos', 'photoCount', 'photos_count'])
    );
    const topPosts = this.importTopPosts(raw);
    const tags = this.cleanTags([
      pick(['tags', 'labels', 'hashtags'], 1000),
      niche || '',
      platform || '',
    ]);
    const warnings: string[] = [];

    if (!name) {
      warnings.push('competitor name is required.');
    }
    if (!platform) {
      warnings.push('supported platform is required.');
    }

    const row: SnapsCompetitorImportRow = {
      rowNumber,
      name,
      handle,
      profileUrl,
      platform,
      niche,
      tags,
      collectedAt,
      followers: this.cleanNumber(pickNumber(['followers', 'followerCount'])),
      followersGrowth: pickNumber([
        'followersGrowth',
        'followers_growth',
        'growth',
        'followerDelta',
      ]),
      postsCount,
      videosCount,
      photosCount,
      linksCount: this.cleanNumber(
        pickNumber(['linksCount', 'links', 'linkCount', 'links_count'])
      ),
      statusesCount: this.cleanNumber(
        pickNumber(['statusesCount', 'statuses', 'statusCount', 'statuses_count'])
      ),
      engagement: this.cleanNumber(pickNumber(['engagement', 'interactions'])),
      engagementRate: this.cleanRate(
        this.pickField(raw, ['engagementRate', 'engagement_rate', 'rate']) ??
          this.pickField(account, ['engagementRate', 'engagement_rate', 'rate'])
      ),
      reach: this.cleanNumber(pickNumber(['reach', 'impressions', 'views'])),
      topPosts,
      notes: pick(['notes', 'memo', 'summary'], 1000) || undefined,
      warnings,
      status: 'ready',
    };

    if (!this.hasSnapshotMetrics(row)) {
      warnings.push('No snapshot metrics were found; only the profile will be imported.');
    }
    row.status = !row.name || !row.platform ? 'invalid' : warnings.length ? 'warning' : 'ready';
    return row;
  }

  private cleanPostFormat(value: unknown): SnapsCompetitorTopPost['format'] {
    const format = this.cleanText(value, 40);
    return ['video', 'photo', 'link', 'status', 'carousel', 'unknown'].includes(format)
      ? (format as SnapsCompetitorTopPost['format'])
      : 'unknown';
  }

  private async writeProfiles(
    organizationId: string,
    profiles: SnapsCompetitorProfile[]
  ) {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.atomicWrite(
      this.filePath(organizationId, 'competitor-profiles'),
      JSON.stringify(profiles, null, 2)
    );
  }

  private async writeSnapshots(
    organizationId: string,
    snapshots: SnapsCompetitorSnapshot[]
  ) {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.atomicWrite(
      this.filePath(organizationId, 'competitor-snapshots'),
      JSON.stringify(snapshots, null, 2)
    );
  }

  private filePath(
    organizationId: string,
    name: 'competitor-profiles' | 'competitor-snapshots'
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

  private profileImportKey(
    profile: Pick<SnapsCompetitorProfile, 'name' | 'handle' | 'profileUrl' | 'platform'> | SnapsCompetitorImportRow
  ) {
    const platform = profile.platform || 'unknown';
    const identity =
      this.cleanText(profile.handle, 160).toLowerCase() ||
      this.cleanText(profile.profileUrl, 2000).toLowerCase() ||
      this.cleanText(profile.name, 160).toLowerCase();
    return `${platform}:${identity}`;
  }

  private hasSnapshotMetrics(row: SnapsCompetitorImportRow) {
    return (
      row.followers > 0 ||
      row.followersGrowth !== 0 ||
      row.postsCount > 0 ||
      row.videosCount > 0 ||
      row.photosCount > 0 ||
      row.linksCount > 0 ||
      row.statusesCount > 0 ||
      row.engagement > 0 ||
      row.engagementRate > 0 ||
      row.reach > 0 ||
      row.topPosts.length > 0
    );
  }

  private parseImportText(text: string): {
    format: 'csv' | 'json';
    columns: string[];
    firstRowNumber: number;
    records: Record<string, unknown>[];
  } {
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        throw new BadRequestException('Competitor import JSON is invalid.');
      }
      const records = this.jsonImportRecords(parsed);
      if (!records.length) {
        throw new BadRequestException('Competitor import JSON did not include rows.');
      }
      return {
        format: 'json',
        columns: this.columnsForRecords(records),
        firstRowNumber: 1,
        records,
      };
    }

    const parsed = this.parseCsv(trimmed);
    const headers = parsed[0]?.map((header) => header.replace(/^\uFEFF/, '').trim()) || [];
    if (!headers.length || parsed.length < 2) {
      throw new BadRequestException('CSV must include a header row and at least one competitor row.');
    }
    return {
      format: 'csv',
      columns: headers,
      firstRowNumber: 2,
      records: parsed.slice(1).map((row) => this.recordFromCsv(headers, row)),
    };
  }

  private jsonImportRecords(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.asRecord(item))
        .filter((item): item is Record<string, unknown> => !!item);
    }
    const record = this.asRecord(value);
    if (!record) {
      return [];
    }

    const candidateKeys = ['insights', 'competitors', 'rows', 'items', 'data', 'results'];
    for (const key of candidateKeys) {
      const items = this.pickField(record, [key]);
      if (Array.isArray(items)) {
        const records = items
          .map((item) => this.asRecord(item))
          .filter((item): item is Record<string, unknown> => !!item);
        if (records.length) {
          return records;
        }
      }
    }

    return [record];
  }

  private columnsForRecords(records: Record<string, unknown>[]) {
    return [
      ...new Set(
        records.flatMap((record) =>
          Object.keys(record).map((key) => this.cleanText(key, 80)).filter(Boolean)
        )
      ),
    ].slice(0, 80);
  }

  private recordFromCsv(headers: string[], row: string[]) {
    return headers.reduce<Record<string, unknown>>((record, header, index) => {
      record[header] = row[index] || '';
      return record;
    }, {});
  }

  private parseCsv(text: string) {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];
      if (quoted) {
        if (char === '"' && next === '"') {
          field += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') {
        quoted = true;
        continue;
      }
      if (char === ',') {
        row.push(field);
        field = '';
        continue;
      }
      if (char === '\n') {
        row.push(field.replace(/\r$/, ''));
        rows.push(row);
        row = [];
        field = '';
        continue;
      }
      field += char;
    }

    row.push(field.replace(/\r$/, ''));
    rows.push(row);
    return rows.filter((items) => items.some((item) => String(item || '').trim()));
  }

  private importTopPosts(raw: Record<string, unknown>) {
    const explicit = this.pickField(raw, ['topPosts', 'top_posts', 'posts']);
    if (Array.isArray(explicit)) {
      return this.cleanTopPosts(explicit);
    }

    const title = this.cleanText(
      this.pickField(raw, [
        'topPostTitle',
        'top_post_title',
        'bestPostTitle',
        'postTitle',
      ]),
      220
    );
    if (!title) {
      return [];
    }

    return this.cleanTopPosts([
      {
        title,
        url: this.pickField(raw, ['topPostUrl', 'top_post_url', 'postUrl', 'url']),
        format: this.pickField(raw, ['topPostFormat', 'format', 'postFormat']),
        publishedAt: this.pickField(raw, ['topPostPublishedAt', 'publishedAt']),
        engagement: this.pickField(raw, [
          'topPostEngagement',
          'postEngagement',
          'topPostInteractions',
        ]),
        hook: this.pickField(raw, ['topPostHook', 'hook', 'openingHook']),
        notes: this.pickField(raw, ['topPostNotes', 'postNotes']),
      },
    ]);
  }

  private pickField(record: Record<string, unknown> | undefined, aliases: string[]) {
    if (!record) {
      return undefined;
    }
    const index = new Map(
      Object.entries(record).map(([key, value]) => [this.normalizeHeader(key), value])
    );
    for (const alias of aliases) {
      const value = index.get(this.normalizeHeader(alias));
      if (typeof value !== 'undefined') {
        return value;
      }
    }
    return undefined;
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private normalizeHeader(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
  }

  private cleanPlatform(value: unknown): SnapsTargetPlatform | undefined {
    const normalized = this.cleanText(value, 80)
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[\s_]+/g, '-');
    const aliases: Record<string, SnapsTargetPlatform> = {
      ig: 'instagram',
      insta: 'instagram',
      instagram: 'instagram',
      thread: 'threads',
      threads: 'threads',
      bluesky: 'bluesky',
      bsky: 'bluesky',
      facebook: 'facebook',
      fb: 'facebook',
      pinterest: 'pinterest',
      pin: 'pinterest',
      youtube: 'youtube',
      'youtube-shorts': 'youtube',
      shorts: 'youtube',
      tiktok: 'tiktok',
      'tik-tok': 'tiktok',
      xhs: 'xiaohongshu',
      xiaohongshu: 'xiaohongshu',
      'naver-blog': 'naver-blog',
      blog: 'naver-blog',
      'naver-cafe': 'naver-cafe',
      cafe: 'naver-cafe',
      kakao: 'kakao-talk',
      'kakao-talk': 'kakao-talk',
      linkedin: 'linkedin',
      'linked-in': 'linkedin',
      twitter: 'x',
      x: 'x',
    };
    const platform = aliases[normalized] || normalized;
    return snapsTargetPlatforms.includes(platform as SnapsTargetPlatform)
      ? (platform as SnapsTargetPlatform)
      : undefined;
  }

  private cleanOptionalUrl(value: unknown) {
    const text = this.cleanText(value, 2000);
    if (!text) {
      return undefined;
    }
    try {
      const parsed = new URL(text);
      return ['http:', 'https:'].includes(parsed.protocol)
        ? parsed.toString()
        : undefined;
    } catch {
      return undefined;
    }
  }

  private cleanDate(value: unknown) {
    const text = this.cleanText(value, 80);
    if (!text) {
      return '';
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  }

  private cleanNumber(value: unknown) {
    const number = this.parseNumber(value);
    return Number.isFinite(number) ? this.roundNumber(Math.max(0, number)) : 0;
  }

  private cleanSignedNumber(value: unknown) {
    const number = this.parseNumber(value);
    return Number.isFinite(number) ? this.roundNumber(number) : 0;
  }

  private cleanRate(value: unknown) {
    const number = this.parseNumber(value);
    if (!Number.isFinite(number) || number <= 0) {
      return 0;
    }
    return this.roundRate(number > 1 ? number / 100 : number);
  }

  private parseNumber(value: unknown) {
    if (typeof value === 'number') {
      return value;
    }
    const raw = this.cleanText(value, 80).toLowerCase().replace(/,/g, '');
    if (!raw) {
      return 0;
    }
    const multiplier = raw.endsWith('k') ? 1000 : raw.endsWith('m') ? 1000000 : 1;
    const number = Number(raw.replace(/[km%]/g, ''));
    return number * multiplier;
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
    const raw = Array.isArray(value)
      ? value.map((tag) => this.cleanText(tag, 80)).join('|')
      : this.cleanText(value, 1000);
    return [
      ...new Set(
        raw
          .split(/[|,;#]+/g)
          .map((tag) => tag.trim())
          .filter(Boolean)
      ),
    ].slice(0, 30);
  }

  private cleanHandle(value: unknown) {
    const handle = this.cleanText(value, 160).replace(/\s+/g, '');
    if (!handle) {
      return undefined;
    }
    return handle.startsWith('@') ? handle : `@${handle}`;
  }

  private cleanImportText(value: unknown, maxLength: number) {
    return typeof value === 'string' ? value.replace(/^\uFEFF/, '').trim().slice(0, maxLength) : '';
  }

  private clampNumber(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.floor(parsed)));
  }

  private roundNumber(value: number) {
    return Math.round(value * 100) / 100;
  }

  private roundRate(value: number) {
    return Math.round(value * 10000) / 10000;
  }

  private async atomicWrite(filePath: string, content: string) {
    await writeSnapsFileAtomic(filePath, content);
  }
}
