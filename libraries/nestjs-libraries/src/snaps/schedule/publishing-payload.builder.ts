import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { SnapsScheduleVariantsRequestDto } from '@gitroom/nestjs-libraries/snaps/dto/transform-request.dto';
import { SnapsVariant } from '@gitroom/nestjs-libraries/snaps/dto/transform-result.dto';
import { weightedLength } from '@gitroom/helpers/utils/count.length';
import net from 'node:net';
import { isBlockedIp } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import { snapsPlatformRules } from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';

export type SnapsPublishingPayloadBuildInput = {
  variants?: SnapsVariant[];
  integrations?: SnapsScheduleVariantsRequestDto['integrations'];
  publishDate?: string;
  scheduleType?: 'draft' | 'schedule';
};

type PreparedSchedulableVariant = {
  variant: SnapsVariant;
  integrationId: string;
  settings: Record<string, unknown>;
};

export function buildSnapsPublishingPayload(input: SnapsPublishingPayloadBuildInput = {}) {
  const variants = Array.isArray(input.variants) ? input.variants : [];
  const integrations = Array.isArray(input.integrations) ? input.integrations : [];
  const integrationMap = new Map(
    integrations
      .filter((integration) => integration?.platform && integration?.integrationId)
      .map((integration) => [
        integration.platform,
        integration.integrationId,
      ])
  );
  const warnings: string[] = [];
  const schedulable = variants
    .filter(
      (variant) =>
        variant?.publishMode === 'schedule' &&
        integrationMap.has(variant.platform)
    )
    .map((variant) =>
      prepareSchedulableVariant(variant, integrationMap.get(variant.platform)!, warnings)
    )
    .filter((variant): variant is PreparedSchedulableVariant => !!variant);

  if (!schedulable.length) {
    return {
      variants,
      schedulable: [],
      payload: undefined,
      warnings: [
        ...warnings,
        warnings.length
          ? 'No valid snaps variants remained after provider settings validation.'
          : 'No matching connected snaps integrations were supplied for scheduling.',
      ],
    };
  }

  const type = input.scheduleType === 'schedule' ? 'schedule' : 'draft';
  const publishDate = cleanPublishDate(input.publishDate);
  if (type === 'schedule' && !publishDate) {
    return {
      variants,
      schedulable: schedulable.map(({ variant }) => variant),
      payload: undefined,
      warnings: [
        ...warnings,
        'publishDate is required when scheduleType is schedule.',
      ],
    };
  }
  // The scheduler publishes a past-dated post immediately, so a stale date (an old
  // approval, a recurring queue that starts in the past) would go live at once.
  if (
    type === 'schedule' &&
    new Date(publishDate).getTime() < Date.now() - pastScheduleGraceMs
  ) {
    return {
      variants,
      schedulable: schedulable.map(({ variant }) => variant),
      payload: undefined,
      warnings: [
        ...warnings,
        `publishDate ${publishDate} is in the past; snaps will not publish it immediately. Choose a future time or save it as a draft.`,
      ],
    };
  }

  const date =
    publishDate || new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const postValues = schedulable.map(({ variant }) => buildPostValues(variant, warnings));
  return {
    variants,
    schedulable: schedulable.map(({ variant }) => variant),
    warnings,
    payload: {
      type,
      date,
      shortLink: false,
      order: '',
      tags: [] as Array<{ value: string; label: string }>,
      posts: schedulable.map(({ integrationId, settings }, index) => ({
        group: makeId(10),
        integration: {
          id: integrationId,
        },
        settings,
        value: postValues[index],
      })),
    },
  };
}

const maxThreadParts = 6;
const pastScheduleGraceMs = 5 * 60 * 1000;
const xPostLimit = 280;

function buildPostValues(variant: SnapsVariant, warnings: string[]) {
  const content = withVariantHashtags(variant);
  let contentParts = [content];
  if (variant.platform === 'threads') {
    contentParts = splitThreadContent(content, 500, (text) => text.length, warnings, 'Threads');
  } else if (variant.platform === 'x' && weightedLength(content) > xPostLimit) {
    contentParts = splitThreadContent(content, xPostLimit, weightedLength, warnings, 'X');
    warnings.push(
      `X content is ${weightedLength(content)}/${xPostLimit} by X weighted counting (Korean counts as 2), so it was split into a ${contentParts.length}-post thread.`
    );
  }
  const firstComment = cleanFirstComment(variant.settings?.firstComment);

  const values = contentParts.map((content, index) => ({
    id: makeId(10),
    content,
    image: index === 0 ? variant.media || [] : [],
    delay: index === 0 ? 0 : 1,
  }));

  if (firstComment && supportsFirstCommentChain(variant.platform)) {
    values.push({
      id: makeId(10),
      content: firstComment,
      image: [],
      delay: 1,
    });
  }

  return values;
}

/**
 * Studio edits hashtags in a separate field, so append the ones the caption and
 * first comment do not already carry. First-comment placement keeps them out
 * of the caption, and the platform hashtag limit caps the total.
 */
function withVariantHashtags(variant: SnapsVariant) {
  const content = String(variant.content || '');
  if (variant.settings?.hashtagPlacement === 'first-comment') {
    return content;
  }
  const limit = snapsPlatformRules[variant.platform]?.hashtagLimit || 0;
  const present = new Set(
    `${content}\n${String(variant.settings?.firstComment || '')}`
      .match(/#[^\s#]+/g)
      ?.map((tag) => tag.toLowerCase()) || []
  );
  const missing: string[] = [];
  for (const raw of Array.isArray(variant.hashtags) ? variant.hashtags : []) {
    const tag = String(raw || '').replace(/\s+/g, '').replace(/^#*/, '#');
    if (tag.length < 2 || present.has(tag.toLowerCase())) {
      continue;
    }
    present.add(tag.toLowerCase());
    missing.push(tag);
  }
  const room = Math.max(0, limit - (content.match(/#[^\s#]+/g)?.length || 0));
  const appended = missing.slice(0, room);
  return appended.length ? `${content.trimEnd()}\n\n${appended.join(' ')}` : content;
}

function supportsFirstCommentChain(platform: SnapsVariant['platform']) {
  return ['instagram', 'linkedin', 'tiktok', 'youtube'].includes(platform);
}

function cleanFirstComment(value: unknown) {
  return String(value || '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 2200);
}

function splitThreadContent(
  content: string,
  maxLength: number,
  measure: (text: string) => number,
  warnings: string[],
  label: string
) {
  const normalized = String(content || '').trim();
  if (!normalized || measure(normalized) <= maxLength) {
    return normalized ? [normalized] : [];
  }

  const parts: string[] = [];
  let current = '';
  for (const block of normalized.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean)) {
    if (measure(block) > maxLength) {
      if (current) {
        parts.push(current);
        current = '';
      }
      parts.push(...splitLongText(block, maxLength, measure));
      continue;
    }

    const next = current ? `${current}\n\n${block}` : block;
    if (measure(next) <= maxLength) {
      current = next;
      continue;
    }

    if (current) {
      parts.push(current);
    }
    current = block;
  }

  if (current) {
    parts.push(current);
  }

  if (parts.length > maxThreadParts) {
    warnings.push(
      `${label} content needed ${parts.length} posts; only the first ${maxThreadParts} were kept. Shorten the post to publish the rest.`
    );
  }
  return parts.length
    ? parts.slice(0, maxThreadParts)
    : splitLongText(normalized, maxLength, measure).slice(0, 1);
}

function splitLongText(
  content: string,
  maxLength: number,
  measure: (text: string) => number
) {
  const chunks: string[] = [];
  let current = '';
  for (const token of content.split(/(\s+)/)) {
    if (!token) {
      continue;
    }

    if (measure(token.trim()) > maxLength) {
      if (current.trim()) {
        chunks.push(current.trim());
        current = '';
      }
      let piece = '';
      for (const char of Array.from(token.trim())) {
        if (piece && measure(piece + char) > maxLength) {
          chunks.push(piece);
          piece = '';
        }
        piece += char;
      }
      if (piece) {
        chunks.push(piece);
      }
      continue;
    }

    if (measure(current + token) <= maxLength) {
      current += token;
      continue;
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }
    current = token;
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

function cleanPublishDate(value?: string) {
  if (!value || Number.isNaN(new Date(value).getTime())) {
    return '';
  }
  return value;
}

/**
 * Providers download media with readOrFetch: a non-http path is read from disk under
 * UPLOAD_DIRECTORY and an http path is fetched by the backend. snaps hands its own
 * variants to PostsService without the MediaDto validation, so check them here:
 * no path traversal or filesystem paths, and no private/internal hosts except the
 * app's own upload origin and Pixelle.
 */
export function unsafeSnapsMediaReason(path: unknown): string | undefined {
  const value = String(path || '').trim();
  if (!value) {
    return 'media path is empty';
  }
  if (!/^https?:\/\//i.test(value)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) || /^[\\/]{2}/.test(value)) {
      return 'only http(s) media URLs or uploaded file paths are allowed';
    }
    if (value.split(/[\\/]/).some((segment) => segment === '..')) {
      return 'media path cannot leave the upload directory';
    }
    return undefined;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return 'media URL is not valid';
  }
  if (trustedMediaOrigins().includes(parsed.origin)) {
    return undefined;
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || !host.includes('.') && !net.isIP(host)) {
    return 'media URL points at an internal host';
  }
  if (net.isIP(host) && isBlockedIp(host)) {
    return 'media URL points at a private or reserved address';
  }
  return undefined;
}

function trustedMediaOrigins() {
  return [
    process.env.FRONTEND_URL,
    process.env.PIXELLE_VIDEO_URL,
    process.env.PIXELLE_VIDEO_HOST_URL,
  ]
    .map((value) => {
      try {
        return value ? new URL(value).origin : '';
      } catch {
        return '';
      }
    })
    .filter(Boolean);
}

function prepareSchedulableVariant(
  variant: SnapsVariant,
  integrationId: string,
  warnings: string[]
): PreparedSchedulableVariant | undefined {
  for (const media of Array.isArray(variant.media) ? variant.media : []) {
    const reason =
      unsafeSnapsMediaReason(media?.path) ||
      (media?.thumbnail ? unsafeSnapsMediaReason(media.thumbnail) : undefined);
    if (reason) {
      warnings.push(`${variant.label || variant.platform}: ${reason}, so this variant was skipped.`);
      return undefined;
    }
  }
  if (variant.platform === 'pinterest') {
    const settings = variant.settings || {};
    const board = String(settings.board || settings.board_id || '').trim();
    if (!board) {
      warnings.push(
        'Pinterest scheduling requires a board setting. The Pinterest variant was skipped.'
      );
      return undefined;
    }

    return {
      variant,
      integrationId,
      settings: {
        ...settings,
        __type: 'pinterest',
        board,
        title:
          String(settings.title || variant.title || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 100) || 'snaps Pin',
      },
    };
  }

  if (variant.platform !== 'naver-cafe') {
    return {
      variant,
      integrationId,
      settings: variant.settings || {},
    };
  }

  const settings = variant.settings || {};
  const clubId = String(settings.clubId || '').trim();
  const menuId = String(settings.menuId || '').trim();
  if (!clubId || !menuId) {
    warnings.push(
      'Naver Cafe scheduling requires clubId and menuId settings. The Naver Cafe variant was skipped.'
    );
    return undefined;
  }

  const subject =
    String(settings.subject || variant.title || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) ||
    variant.content.replace(/\s+/g, ' ').trim().slice(0, 80) ||
    'snaps 게시글';

  return {
    variant,
    integrationId,
    settings: {
      ...settings,
      __type: 'naver-cafe',
      clubId,
      menuId,
      subject: subject.length >= 2 ? subject : 'snaps 게시글',
    },
  };
}
