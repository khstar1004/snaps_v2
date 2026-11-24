import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import dayjs from 'dayjs';
import { NaverCafeDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/naver-cafe.dto';
import striptags from 'striptags';
import { Integration } from '@prisma/client';
import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';

type NaverTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: string | number;
  error?: string;
  error_description?: string;
};

type NaverProfileResponse = {
  response?: {
    id?: string;
    nickname?: string;
    name?: string;
    profile_image?: string;
    email?: string;
  };
  message?: string;
};

type NaverCafePostResponse = {
  error?: string;
  error_description?: string;
  message?: {
    error?: string;
    result?: {
      articleId?: string | number;
      id?: string | number;
      articleUrl?: string;
      cafeUrl?: string;
      msg?: string;
    };
  };
  result?: {
    articleId?: string | number;
    id?: string | number;
    articleUrl?: string;
    cafeUrl?: string;
    msg?: string;
  };
};

/** UTF-16 units a cafe post title may use. Unchanged from the previous slice. */
const SNAPS_CAFE_SUBJECT_MAX_LENGTH = 80;

export class NaverCafeProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 1;
  identifier = 'naver-cafe';
  name = 'Naver Cafe';
  isBetweenSteps = false;
  scopes = ['profile', 'cafe'];
  editor = 'html' as const;
  dto = NaverCafeDto;

  maxLength() {
    return 10000;
  }

  override handleErrors(body: string, status: number) {
    const message = this.naverErrorMessage(body);
    if (status === 401 || /invalid_token|expired/i.test(message)) {
      return {
        type: 'refresh-token' as const,
        value: message || 'Naver access token needs refresh.',
      };
    }

    if (message) {
      return {
        type: 'bad-body' as const,
        value: message,
      };
    }

    return undefined;
  }

  async generateAuthUrl() {
    const state = makeId(16);
    const redirectUri = `${process.env.FRONTEND_URL}/integrations/social/naver-cafe`;
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.NAVER_CLIENT_ID || '',
      redirect_uri: redirectUri,
      state,
      scope: this.scopes.join(','),
    });

    return {
      url: `https://nid.naver.com/oauth2.0/authorize?${params.toString()}`,
      codeVerifier: state,
      state,
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    const token = await this.requestToken({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    if (token.error || !token.access_token) {
      throw new Error(token.error_description || token.error || 'Naver refresh failed');
    }
    const profile = await this.profile(token.access_token!);

    return this.authDetails(token, profile, refreshToken);
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }): Promise<AuthTokenDetails | string> {
    const token = await this.requestToken({
      grant_type: 'authorization_code',
      code: params.code,
      state: params.codeVerifier,
    });

    if (token.error || !token.access_token) {
      return token.error_description || token.error || 'Naver authentication failed';
    }

    const profile = await this.profile(token.access_token);
    if (!profile.response?.id) {
      return profile.message || 'Could not read Naver profile';
    }

    return this.authDetails(token, profile);
  }

  async post(
    _id: string,
    accessToken: string,
    postDetails: PostDetails<NaverCafeDto>[],
    _integration: Integration
  ): Promise<PostResponse[]> {
    const results: PostResponse[] = [];

    for (const post of postDetails) {
      const settings = post.settings;
      // A supplied subject used to be forwarded raw while a derived one was
      // stripped, so a variant title carrying markup became the cafe post title
      // as-is. Both go through the same cleaner now.
      const subject = this.makeSubject(settings.subject || post.message);
      const content = this.toCafeContent(post.message);
      const apiUrl = `https://openapi.naver.com/v1/cafe/${encodeURIComponent(
        settings.clubId
      )}/menu/${encodeURIComponent(settings.menuId)}/articles`;

      const params = new URLSearchParams({
        subject,
        content,
      });
      if (settings.category) {
        params.set('category', settings.category);
      }

      const response = await this.fetch(
        apiUrl,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          },
          body: params,
        },
        this.identifier
      );

      const data = (await response.json()) as NaverCafePostResponse;
      if (data.error || data.message?.error) {
        throw new Error(
          data.error_description || data.error || data.message.error || 'Naver Cafe post failed'
        );
      }
      const result = data?.message?.result || data?.result || {};
      const platformPostId = String(result.articleId || result.id || '');
      if (!platformPostId && !result.articleUrl && !result.cafeUrl) {
        throw new Error('Naver Cafe post did not return article information.');
      }

      results.push({
        id: post.id,
        postId: platformPostId,
        releaseURL: result.articleUrl || result.cafeUrl || '',
        status: result.msg || 'completed',
      });
    }

    return results;
  }

  private async requestToken(
    params: Record<string, string>
  ): Promise<NaverTokenResponse> {
    const body = new URLSearchParams({
      client_id: process.env.NAVER_CLIENT_ID || '',
      client_secret: process.env.NAVER_CLIENT_SECRET || '',
      ...params,
    });

    const response = await fetch('https://nid.naver.com/oauth2.0/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body,
    });

    return this.readNaverJson<NaverTokenResponse>(response, 'Naver token request failed');
  }

  private async profile(accessToken: string): Promise<NaverProfileResponse> {
    const response = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return this.readNaverJson<NaverProfileResponse>(response, 'Naver profile request failed');
  }

  private authDetails(
    token: NaverTokenResponse,
    profile: NaverProfileResponse,
    fallbackRefreshToken = ''
  ): AuthTokenDetails {
    const user = profile.response!;
    return {
      id: user.id!,
      name: user.nickname || user.name || user.email || 'Naver Cafe',
      accessToken: token.access_token || '',
      refreshToken: token.refresh_token || fallbackRefreshToken,
      expiresIn:
        Number(token.expires_in || 0) ||
        dayjs().add(1, 'hour').unix() - dayjs().unix(),
      picture: user.profile_image || '',
      username: user.email || user.nickname || user.id!,
    };
  }

  /**
   * The title the cafe post is published under.
   *
   * The clamp was a plain `.slice(0, 80)`, which counts UTF-16 units and
   * cuts between them: measured across twenty-two boundary positions it
   * left three dangling high surrogates and tore two ZWJ sequences. This
   * string is sent to Naver's API, so a broken pair arrives there as a
   * replacement character in the title of the post.
   *
   * The same fault was fixed across the snaps tree earlier, but the guard
   * written for it only walked libraries/nestjs-libraries/src/snaps and
   * this provider lives beside the upstream ones - so it was missed. The
   * guard covers snaps-owned providers now too.
   */
  private makeSubject(message: string) {
    return (
      snapsClampText(
        striptags(message).replace(/\s+/g, ' ').trim(),
        SNAPS_CAFE_SUBJECT_MAX_LENGTH
      ) || 'snaps 게시글'
    );
  }

  private toCafeContent(message: string) {
    const allowed = striptags(message, ['p', 'br', 'strong', 'b', 'em', 'u', 'a'])
      .replace(/<strong>/g, '<b>')
      .replace(/<\/strong>/g, '</b>');

    // striptags removes tags outside the allowlist but keeps the attributes of
    // the ones it keeps, so `<a href="javascript:alert(1)">` and
    // `<p onclick="alert(1)">` went through to the cafe untouched. Sanitising is
    // the whole reason this function exists, and it is the last point snaps
    // controls before the post leaves.
    const sanitised = allowed
      .replace(/\son[a-zA-Z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/g, '')
      .replace(
        /((?:href|src)\s*=\s*["']?)\s*(?:javascript|vbscript|data)\s*:/gi,
        '$1#'
      );

    // A cafe body is HTML, so a newline in it is whitespace. Everything snaps
    // sends is plain text - the publish payload carries the variant's content,
    // which the model writes with line breaks - and it arrived as one run-on
    // paragraph. Measured before this: a six-line reply posted as a single
    // block.
    //
    // Only when nothing survived the allowlist. A message that still carries a
    // tag is HTML, and its newlines are the formatting between tags rather
    // than the writer's: adding breaks there would put a stray `<br>` between
    // every pair. Keying this on `<p>` and `<br>` alone was wrong - it called
    // an inline-only `<b>굵게</b>` plain text and wrapped it, which the
    // sanitiser tests caught.
    if (/<[a-z]/i.test(sanitised)) {
      return sanitised;
    }

    const text = sanitised.replace(/\r\n?/g, '\n').trim();
    if (!text) {
      return text;
    }
    return `<p>${text
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/\n/g, '<br />')}</p>`;
  }

  private naverErrorMessage(body: string) {
    try {
      const parsed = JSON.parse(body) as {
        error?: string;
        error_description?: string;
        message?: string | { error?: string; message?: string };
      };
      if (typeof parsed.message === 'string') {
        return parsed.error_description || parsed.error || parsed.message;
      }
      return (
        parsed.error_description ||
        parsed.error ||
        parsed.message?.message ||
        parsed.message?.error ||
        ''
      );
    } catch {
      return body.includes('error') ? snapsClampText(body, 500) : '';
    }
  }

  private async readNaverJson<T extends { error?: string; error_description?: string; message?: string }>(
    response: Response,
    fallback: string
  ): Promise<T> {
    const text = (await response.text()).trim();
    const failure = `${response.status} ${response.statusText || fallback}`.trim();

    if (!text) {
      return (response.ok ? {} : this.naverFailure(failure)) as T;
    }

    try {
      const parsed = JSON.parse(text) as T;
      if (!response.ok && !parsed.error && !parsed.error_description && !parsed.message) {
        return {
          ...parsed,
          ...this.naverFailure(failure),
        };
      }
      return parsed;
    } catch {
      return this.naverFailure(
      text.startsWith('<') ? failure : snapsClampText(text, 500)
    ) as T;
    }
  }

  private naverFailure(message: string) {
    return {
      error: message,
      error_description: message,
      message,
    };
  }
}
