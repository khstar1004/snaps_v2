import {
  AnalyticsData,
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import dayjs from 'dayjs';
import { Integration } from '@prisma/client';

export class SnapsSandboxProvider
  extends SocialAbstract
  implements SocialProvider
{
  identifier = 'snapssandbox';
  name = 'snaps Sandbox';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'normal' as const;
  toolTip = 'Local snaps verification channel for draft, schedule, analytics, and reply smoke tests.';

  maxLength() {
    return 5000;
  }

  async generateAuthUrl() {
    const state = makeId(12);
    return {
      url: `snaps-sandbox://${state}`,
      codeVerifier: state,
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }): Promise<AuthTokenDetails> {
    const id = params.code || params.codeVerifier || `sandbox-${makeId(8)}`;
    return this.authDetails(id);
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    return this.authDetails(refreshToken || `sandbox-${makeId(8)}`);
  }

  async post(
    id: string,
    _accessToken: string,
    postDetails: PostDetails[],
    _integration: Integration
  ): Promise<PostResponse[]> {
    return postDetails.map((post, index) => {
      const postId = this.platformId('post', id, post.id || String(index));
      return {
        id: post.id,
        postId,
        releaseURL: this.releaseUrl('posts', postId),
        status: 'completed',
      };
    });
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    _accessToken: string,
    postDetails: PostDetails[],
    _integration: Integration
  ): Promise<PostResponse[]> {
    return postDetails.map((post, index) => {
      const commentId = this.platformId(
        'comment',
        id,
        post.id || String(index),
        lastCommentId || postId
      );
      return {
        id: post.id,
        postId: commentId,
        releaseURL: this.releaseUrl('comments', commentId),
        status: 'completed',
      };
    });
  }

  async analytics(
    id: string,
    _accessToken: string,
    date: number
  ): Promise<AnalyticsData[]> {
    return this.metrics(this.metricSeed(id, String(date || 'integration')));
  }

  async postAnalytics(
    integrationId: string,
    _accessToken: string,
    postId: string,
    fromDate: number
  ): Promise<AnalyticsData[]> {
    return this.metrics(
      this.metricSeed(integrationId, postId, String(fromDate || 'post')),
      2
    );
  }

  private authDetails(id: string): AuthTokenDetails {
    return {
      id,
      name: 'snaps Sandbox',
      accessToken: `snaps-sandbox-token-${id}`,
      refreshToken: `snaps-sandbox-refresh-${id}`,
      expiresIn: dayjs().add(10, 'years').unix() - dayjs().unix(),
      picture: '',
      username: id,
    };
  }

  private metrics(seed: number, days = 3): AnalyticsData[] {
    const today = dayjs().startOf('day');
    const rows = Array.from({ length: days }).map((_, index) => ({
      date: today.subtract(days - index - 1, 'day').format('YYYY-MM-DD'),
      total: String(seed + index * 17),
    }));

    return [
      {
        label: 'Impressions',
        percentageChange: 12,
        data: rows,
      },
      {
        label: 'Engagements',
        percentageChange: 8,
        data: rows.map((row, index) => ({
          ...row,
          total: String(Math.max(1, Math.round(Number(row.total) * 0.16) + index)),
        })),
      },
      {
        label: 'Clicks',
        percentageChange: 5,
        data: rows.map((row, index) => ({
          ...row,
          total: String(Math.max(1, Math.round(Number(row.total) * 0.05) + index)),
        })),
      },
    ];
  }

  private metricSeed(...values: string[]) {
    const total = values
      .join(':')
      .split('')
      .reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return 100 + (total % 200);
  }

  private platformId(type: string, ...values: string[]) {
    return `snaps-${type}-${this.metricSeed(...values)}`;
  }

  private releaseUrl(type: 'posts' | 'comments', id: string) {
    return `https://snaps.local/sandbox/${type}/${encodeURIComponent(id)}`;
  }
}
