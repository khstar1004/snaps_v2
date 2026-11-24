import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { sanitizeSnapsHashtags } from '@gitroom/nestjs-libraries/snaps/transform/hashtags';
import { SnapsScheduleVariantsRequestDto } from '@gitroom/nestjs-libraries/snaps/dto/transform-request.dto';
import { SnapsVariant } from '@gitroom/nestjs-libraries/snaps/dto/transform-result.dto';
import {
  SnapsPlatformRule,
  buildDefaultSettings,
  snapsPlatformRules,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';
import {
  snapsClampToWeight,
  snapsWeightedLength,
} from '@gitroom/nestjs-libraries/snaps/text/weighted-length';
import { snapsCafeSubject } from '@gitroom/nestjs-libraries/snaps/text/cafe-subject';

export type SnapsPublishingPayloadBuildInput = {
  variants?: SnapsVariant[];
  integrations?: SnapsScheduleVariantsRequestDto['integrations'];
  publishDate?: string;
  scheduleType?: 'draft' | 'schedule';
  /** Injectable so the past-date check can be tested at a fixed instant. */
  now?: number;
};

/**
 * How far behind the clock a scheduled time may be and still be honoured.
 *
 * A request takes a moment to arrive, and an operator picking a time to the
 * minute can legitimately land a few seconds behind by the time it is read.
 */
const SNAPS_PUBLISH_DATE_GRACE_MS = 60 * 1000;

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

  // Assist platforms (Naver Blog, KakaoTalk, Xiaohongshu) never auto-publish,
  // so they drop out of the filter below. They used to vanish silently: a run
  // that scheduled Threads and Naver Blog reported one post and said nothing
  // about the second, which reads as "both went out".
  const assistVariants = variants.filter(
    (variant) => variant?.publishMode === 'assist'
  );
  if (assistVariants.length) {
    warnings.push(
      `${assistVariants
        .map((variant) => variant.label || variant.platform)
        .join(', ')}은(는) 자동 게시를 지원하지 않는 채널입니다. ` +
        '준비된 내용을 직접 옮겨 게시하세요.'
    );
  }

  // A schedule-mode variant whose platform has no connected channel is dropped
  // by the filter below. That was only ever explained when NOTHING could be
  // scheduled, via the summary at the end: when at least one other platform
  // succeeded, the operator picked four channels, one posted, and the other
  // three vanished from an otherwise successful run.
  const unconnected = variants.filter(
    (variant) =>
      variant?.publishMode === 'schedule' &&
      !integrationMap.has(variant.platform)
  );
  if (unconnected.length) {
    warnings.push(
      `${unconnected
        .map((variant) => variant.label || variant.platform)
        .join(', ')}에 연결된 채널이 없어 아무것도 예약하지 않았습니다.`
    );
  }

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
    // Work the reason out from the variants rather than from whether any
    // warning was pushed. Keying on warnings.length told an operator whose
    // only platform was KakaoTalk that no integration was connected, when the
    // integration was connected and the platform simply never auto-publishes.
    const scheduleCandidates = variants.filter(
      (variant) => variant?.publishMode === 'schedule'
    );
    const matchedButRejected = scheduleCandidates.some((variant) =>
      integrationMap.has(variant.platform)
    );
    // These five were the last English strings left in a warning panel the rest
    // of which is Korean, and they are what the operator reads when a run
    // produced nothing at all - the moment an explanation matters most.
    const reason = !scheduleCandidates.length
      ? assistVariants.length
        ? '요청한 채널이 모두 자동 게시를 지원하지 않아 예약할 수 있는 항목이 없습니다.'
        : '예약할 변형이 전달되지 않았습니다.'
      : matchedButRejected
      ? '채널 설정 검증을 통과한 변형이 없어 아무것도 예약하지 않았습니다.'
      : '예약할 수 있는 연결된 채널이 전달되지 않았습니다.';

    return {
      variants,
      schedulable: [],
      payload: undefined,
      warnings: [...warnings, reason],
    };
  }

  const type = input.scheduleType === 'schedule' ? 'schedule' : 'draft';
  const publishDate = cleanPublishDate(input.publishDate);
  // Nothing in the snaps scheduling path looked at whether the time had
  // already gone by, and the post workflow treats a past publishDate as
  // `sleep(0)` - it publishes immediately. So a year typed wrong sent the
  // post to every connected channel there and then, while the operator had
  // confirmed a scheduled publication. The confirmation was for a different
  // action than the one that happened.
  const now = typeof input.now === 'number' ? input.now : Date.now();
  if (
    type === 'schedule' &&
    publishDate &&
    new Date(publishDate).getTime() < now - SNAPS_PUBLISH_DATE_GRACE_MS
  ) {
    return {
      variants,
      schedulable: schedulable.map(({ variant }) => variant),
      payload: undefined,
      warnings: [
        ...warnings,
        `예약 시간 ${publishDate}은(는) 이미 지났습니다. 지난 시간으로 ` +
          '예약하면 즉시 게시되므로 만들지 않았습니다. 앞으로의 시간을 ' +
          '지정하거나 지금 게시를 선택하세요.',
      ],
    };
  }
  if (type === 'schedule' && !publishDate) {
    return {
      variants,
      schedulable: schedulable.map(({ variant }) => variant),
      payload: undefined,
      warnings: [
        ...warnings,
        '예약(schedule)으로 만들려면 publishDate가 필요합니다.',
      ],
    };
  }

  const date =
    publishDate || new Date(now + 60 * 60 * 1000).toISOString();
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
      posts: schedulable.map(({ variant, integrationId, settings }) => ({
        group: makeId(10),
        integration: {
          id: integrationId,
        },
        settings,
        value: buildPostValues(variant, warnings),
      })),
    },
  };
}

function buildPostValues(variant: SnapsVariant, warnings: string[]) {
  // Segmenting was keyed on the literal platform name with the 500-character
  // limit hardcoded as a default, duplicating snapsPlatformRules.threads
  // .postMaxLength. Lowering the rule would have left the splitter cutting at
  // the old size, and a second platform gaining postMaxLength would not have
  // been segmented at all. Drive both from the rule.
  const rule = snapsPlatformRules[variant.platform];

  // Every snaps flow produces a per-platform hashtag set - the transform reads
  // it off the model, card news and shorts derive it from the deck - and every
  // workspace shows it next to the variant. Nothing published it: this builder
  // only ever looked at variant.content. The offline transform fallback writes
  // its tags into the body, which is why the gap survived - that one path
  // posted tags and every other path silently dropped them.
  // The transform and the card news builder clamp the caption to the platform
  // budget before they get here, but a direct /snaps/schedule-variants call
  // with caller-supplied variants does not: measured at 780 characters into
  // X, which takes 280, and over the limit on every other channel too. Same
  // reasoning as the attachment backstop below.
  //
  // And in the platform's own units where those differ from characters: X
  // counts Hangul as two, so this backstop clamping a Korean body to 280
  // characters handed X 479 units and X refused it. This is the last thing
  // between a caller-supplied variant and the platform, so it is the one that
  // must not be wrong.
  const suppliedBody = String(variant.content || '');
  const captionLimit = rule?.weightedLimit ?? rule?.maxLength;
  const measuredBody = rule?.weightedLimit
    ? snapsWeightedLength(suppliedBody)
    : suppliedBody.length;
  const clampedBody =
    captionLimit && measuredBody > captionLimit
      ? rule?.weightedLimit
        ? snapsClampToWeight(suppliedBody, captionLimit)
        : snapsClampText(suppliedBody, captionLimit)
      : suppliedBody;
  if (clampedBody.length < suppliedBody.length) {
    warnings.push(
      `${variant.label || variant.platform}은(는) 본문을 최대 ${captionLimit}자까지만 받아, ` +
        `보낸 ${suppliedBody.length}자 중 ${suppliedBody.length - clampedBody.length}자를 잘랐습니다.`
    );
  }

  const publishBody = appendHashtags(variant, clampedBody, rule, warnings);

  // Segmenting the clamped body, not the supplied one, so the segments add up
  // to no more than the platform budget.
  const postMaxLength = rule?.postMaxLength;
  const contentParts = postMaxLength
    ? splitIntoPostSegments(publishBody, postMaxLength)
    : [publishBody];

  // This is the one place a variant's media becomes a post's image list, for
  // every snaps path including a direct /snaps/schedule-variants call with
  // caller-supplied variants. The card news builder already trims and reports
  // the trim for its own flow; this is the backstop so no other caller can
  // hand a platform more attachments than it accepts. Both read the same
  // rule.mediaLimit, so they cannot disagree.
  const mediaLimit = rule?.mediaLimit;
  const media = variant.media || [];
  const overLimit = !!mediaLimit && media.length > mediaLimit;
  const clamped = overLimit ? media.slice(0, mediaLimit) : media;
  if (overLimit) {
    // The card news flow reports its own trim, so a deck scheduled through it
    // told the operator. Every other path - shorts, plain transforms, a direct
    // /snaps/schedule-variants call - reached this backstop instead and the
    // extra attachments just disappeared from an otherwise successful post.
    warnings.push(
      `${variant.label || variant.platform}은(는) 첨부를 최대 ${mediaLimit}장까지만 받아, ` +
        `보낸 ${media.length}장 중 ${media.length - (mediaLimit as number)}장은 첨부하지 못했습니다.`
    );
  }

  return contentParts.map((content, index) => ({
    id: makeId(10),
    content,
    image: index === 0 ? clamped : [],
    delay: index === 0 ? 0 : 1,
  }));
}

/**
 * Puts the variant's hashtags at the end of the body it publishes.
 *
 * Tags the body already carries are left alone, so the offline transform
 * fallback - which writes them inline - does not end up with them twice. When
 * the tags will not fit inside the platform's length budget the body is left
 * exactly as the operator wrote it and the tags are reported instead: cutting
 * someone's words to make room for hashtags is the worse of the two failures.
 */
function appendHashtags(
  variant: SnapsVariant,
  body: string,
  rule: SnapsPlatformRule | undefined,
  warnings: string[]
) {
  // The same budget the body was clamped to, in the same units - appending
  // tags that fit in characters but not in units is how a post that passed
  // every check still came back refused.
  const maxLength = rule?.weightedLimit ?? rule?.maxLength;
  const measure = (text: string) =>
    rule?.weightedLimit ? snapsWeightedLength(text) : text.length;
  // Matching with body.includes() treated a tag as already present whenever it
  // was a prefix of another one: a body carrying #건강관리 swallowed a separate
  // #건강, which then never published. Korean tags overlap like that
  // constantly, so compare whole tags. Trailing punctuation is stripped so
  // "#건강." still counts as the tag it is.
  const bodyTags = new Set(
    (body.match(/#[^\s#]+/g) || []).map((tag) =>
      tag.replace(/[.,!?)\]}]+$/, '')
    )
  );
  // Sanitising here rather than trusting the caller: the transform cleans its
  // own tags, but card news, shorts and a direct /snaps/schedule-variants call
  // hand this whatever they hold. Unsanitised, a bare `환절기` published as
  // plain text, a lone `#` and a raw `123` went out as-is, and the same tag
  // twice published twice.
  const hashtagLimit = rule?.hashtagLimit;
  const sanitized = sanitizeSnapsHashtags(variant.hashtags, hashtagLimit ?? 20);
  const requested = sanitizeSnapsHashtags(variant.hashtags, Number.MAX_SAFE_INTEGER);
  if (hashtagLimit && requested.length > sanitized.length) {
    warnings.push(
      `${variant.label || variant.platform}은(는) 해시태그를 최대 ${hashtagLimit}개까지만 받아, ` +
        `보낸 ${requested.length}개 중 ${requested.length - sanitized.length}개는 게시하지 않았습니다.`
    );
  }
  const tags = sanitized.filter((tag) => !bodyTags.has(tag));
  if (!tags.length) {
    return body;
  }

  const suffix = `\n\n${tags.join(' ')}`;
  if (maxLength && measure(body) + measure(suffix) > maxLength) {
    warnings.push(
      `${variant.label || variant.platform}의 ${maxLength}자 한도 안에 해시태그 ${tags.length}개가 ` +
        '들어가지 않아, 본문을 자르는 대신 태그를 빼고 게시합니다.'
    );
    return body;
  }

  return `${body}${suffix}`;
}

/**
 * Splits a variant's content into publishable segments for platforms that cap
 * a single post below their total content budget. maxLength is required: a
 * default here would be a second copy of the platform rule.
 */
function splitIntoPostSegments(content: string, maxLength: number) {
  const normalized = String(content || '').trim();
  if (!normalized || normalized.length <= maxLength) {
    return normalized ? [normalized] : [];
  }

  const parts: string[] = [];
  let current = '';
  for (const block of normalized.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean)) {
    if (block.length > maxLength) {
      if (current) {
        parts.push(current);
        current = '';
      }
      parts.push(...splitLongText(block, maxLength));
      continue;
    }

    const next = current ? `${current}\n\n${block}` : block;
    if (next.length <= maxLength) {
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

  // The empty-parts path clamps too, and it is the one branch the caption
  // work left on a raw slice.
  return parts.length ? parts.slice(0, 6) : [snapsClampText(normalized, maxLength)];
}

function splitLongText(content: string, maxLength: number) {
  const chunks: string[] = [];
  let current = '';
  for (const token of content.split(/(\s+)/)) {
    if (!token) {
      continue;
    }

    if (token.trim().length > maxLength) {
      if (current.trim()) {
        chunks.push(current.trim());
        current = '';
      }
      // Walked rather than indexed: a fixed stride cuts between the halves
      // of an emoji, which leaves a lone high surrogate ending one chunk and
      // a lone low surrogate starting the next.
      let rest = token.trim();
      while (rest) {
        const chunk = snapsClampText(rest, maxLength);
        if (!chunk) {
          break;
        }
        chunks.push(chunk);
        rest = rest.slice(chunk.length);
      }
      continue;
    }

    if ((current + token).length <= maxLength) {
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

function prepareSchedulableVariant(
  variant: SnapsVariant,
  integrationId: string,
  warnings: string[]
): PreparedSchedulableVariant | undefined {
  // CreatePostDto needs at least one PostContent (@ArrayMinSize(1)), and
  // ValidContent rejects an empty body unless the post carries images. An
  // empty variant therefore produced a payload the API refuses - threads lost
  // its only segment, everything else shipped a blank content string. Skip it
  // the way an incomplete Naver Cafe variant is skipped, so the operator is
  // told rather than handed a validation error from inside post creation.
  const hasBody = String(variant.content || '').trim().length > 0;
  const hasMedia = Array.isArray(variant.media) && variant.media.length > 0;
  if (!hasBody && !hasMedia) {
    warnings.push(
      `${variant.label || variant.platform}에 본문과 미디어가 모두 없어 게시할 수 없습니다. 이 변형은 건너뛰었습니다.`
    );
    return undefined;
  }

  if (variant.platform === 'youtube') {
    // Seeded from the defaults for the same reason as the generic branch
    // below: without them a caller-supplied variant carries no __type and no
    // privacy status.
    // buildDefaultSettings('youtube') seeds an empty title, and only the video
    // path filled it in - buildSnapsVideoVariants sets settings.title
    // explicitly. Anything scheduled to YouTube from the transform path
    // therefore carried title: '' all the way to the provider. Derive it here,
    // at the one choke point every snaps scheduling path goes through, and
    // leave an explicitly supplied title alone.
    const settings: Record<string, unknown> = {
      ...buildDefaultSettings(variant.platform),
      ...(variant.settings || {}),
    };
    // YoutubeSettingsDto declares @MinLength(2) @MaxLength(100). Only the upper
    // bound was applied here, so a one-character title passed straight through
    // and failed validation - the Naver Cafe branch below has always guarded
    // its own minimum.
    const derived =
      snapsClampText(
        String(settings.title || variant.title || '')
          .replace(/\s+/g, ' ')
          .trim(),
        100
      ) ||
      snapsClampText(variant.content.replace(/\s+/g, ' ').trim(), 100) ||
      '';
    const title = derived.length >= 2 ? derived : 'snaps 쇼츠';

    return {
      variant,
      integrationId,
      settings: { ...settings, __type: 'youtube', title },
    };
  }

  if (variant.platform !== 'naver-cafe') {
    return {
      variant,
      integrationId,
      // A variant that arrives without settings used to publish with `{}` -
      // no __type for the discriminator to match and none of the fields the
      // provider DTO requires, so post creation failed with a validation
      // error far from the request. Every snaps-internal path supplies them;
      // a direct /snaps/schedule-variants call does not. Same backstop
      // reasoning as the attachment and caption clamps.
      settings: {
        ...buildDefaultSettings(variant.platform),
        ...(variant.settings || {}),
      },
    };
  }

  const settings: Record<string, unknown> = {
    ...buildDefaultSettings(variant.platform),
    ...(variant.settings || {}),
  };
  const clubId = String(settings.clubId || '').trim();
  const menuId = String(settings.menuId || '').trim();
  if (!clubId || !menuId) {
    // Named the same way every other skip warning names its channel. This one
    // spelled the platform out in prose instead, so nothing tying the warning to
    // the variant could find it - a panel filtering by channel, or a check that
    // every dropped variant is accounted for, both missed it.
    warnings.push(
      `${variant.label || variant.platform} 예약에는 clubId와 menuId 설정이 필요합니다. 해당 변형은 건너뛰었습니다.`
    );
    return undefined;
  }

  const subject =
    snapsCafeSubject(
      settings.subject || variant.title,
      variant.content
    );

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
