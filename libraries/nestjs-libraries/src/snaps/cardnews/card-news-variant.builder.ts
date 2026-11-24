import {
  buildDefaultSettings,
  SnapsTargetPlatform,
  snapsPlatformRules,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import { SnapsVideoMediaInput } from '@gitroom/nestjs-libraries/snaps/video/video-variant.builder';
import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';
import { snapsClampToWeight } from '@gitroom/nestjs-libraries/snaps/text/weighted-length';
import { snapsCleanBodyText } from '@gitroom/nestjs-libraries/snaps/text/body-text';

export type SnapsCardNewsVariantBuildInput = {
  title: string;
  caption: string;
  hashtags: string[];
  slides: SnapsVideoMediaInput[];
  targetPlatforms?: SnapsTargetPlatform[];
};

export const SNAPS_CARD_NEWS_PLATFORMS = [
  'instagram',
  'threads',
  'x',
  'linkedin',
  'naver-blog',
  'naver-cafe',
  'xiaohongshu',
  'kakao-talk',
] as const;

const cardNewsPlatforms = SNAPS_CARD_NEWS_PLATFORMS;

const DEFAULT_HASHTAG_LIMIT = 20;

export function buildSnapsCardNewsVariants(input: SnapsCardNewsVariantBuildInput) {
  const targetPlatforms = normalizeCardNewsPlatforms(input.targetPlatforms);
  const title = cleanString(input.title, 120) || 'snaps 카드뉴스';
  // The caption is what gets published, so it keeps its line breaks -
  // cleanString flattens, which is right for the title above it and wrong
  // here. Measured: a six-line Korean caption published as one line.
  const caption = snapsCleanBodyText(input.caption, 2000) || title;
  const hashtags = input.hashtags.slice(0, DEFAULT_HASHTAG_LIMIT);
  const media = input.slides;

  // Captions and hashtags were already clamped per platform; attachments were
  // not. A ten-slide deck sent to X - which takes four - was rejected by the
  // provider at publish time rather than trimmed here. Platforms without a
  // verified limit are left alone.
  const warnings: string[] = [];

  // A caller naming ['instagram', 'facebook'] got Instagram variants and no
  // mention of facebook at all: the unsupported half was filtered out in
  // silence and the run reported success. Naming only unsupported platforms
  // is already refused outright; a partial list has to say what it dropped.
  const unsupported = (input.targetPlatforms || []).filter(
    (platform) => !targetPlatforms.includes(platform)
  );
  if (unsupported.length) {
    warnings.push(
      `${unsupported.join(', ')}은(는) 카드뉴스를 지원하지 않아 제외했습니다.`
    );
  }

  // Trims are collected per platform and reported as one line each, rather
  // than one warning per platform per field: fanning a deck out to eight
  // channels would otherwise bury the operator in near-identical lines.
  const captionTrims: string[] = [];
  const hashtagTrims: string[] = [];

  const variants = targetPlatforms.map((platform) => {
      const rule = snapsPlatformRules[platform];
      const platformMedia =
        rule.mediaLimit && media.length > rule.mediaLimit
          ? media.slice(0, rule.mediaLimit)
          : media;
      if (platformMedia.length < media.length) {
        warnings.push(
          `${rule.label}은(는) 첨부 ${rule.mediaLimit}장까지만 지원해, 이 채널용 덱을 ${media.length}장에서 ${platformMedia.length}장으로 줄였습니다.`
        );
      }
      // Clamping keeps the post valid, but it also silently rewrites what the
      // operator wrote: X caps at 280 characters and one hashtag, so a 431
      // character caption went out as a fragment cut mid-sentence and 19 of 20
      // tags disappeared, with nothing anywhere saying so.
      // Grapheme-safe, like every other clamp in this repo. A raw slice was
      // left here when the rest of the file was converted: measured, a caption
      // whose emoji straddles X's 280 characters published a body that is not
      // well formed and ends on a lone high surrogate.
      // And weighted where the platform counts units: X refuses a 280
      // character Korean caption, which is 479 to it. The transform path was
      // converted first and this one is its sibling - a caption is a post body
      // to X exactly as a variant is.
      const platformCaption = rule.weightedLimit
        ? snapsClampToWeight(caption, rule.weightedLimit)
        : snapsClampText(caption, rule.maxLength);
      if (platformCaption.length < caption.length) {
        captionTrims.push(`${rule.label} ${platformCaption.length}`);
      }
      const platformHashtags = hashtags.slice(
        0,
        rule.hashtagLimit ?? DEFAULT_HASHTAG_LIMIT
      );
      if (platformHashtags.length < hashtags.length) {
        hashtagTrims.push(`${rule.label} ${platformHashtags.length}`);
      }
      return {
        platform,
        label: rule.label,
        // Card news fans one caption out to eight platforms whose limits differ
        // sharply (x caps at 280 characters and 1 hashtag, kakao-talk and
        // xiaohongshu at 1000), so clamp per platform the way
        // SnapsContentTransformService already does. Sending the shared caption
        // unclamped produced over-limit posts the provider would reject.
        // The per-platform table lives in docs/snaps-card-news.md.
        content: platformCaption,
        title,
        hashtags: platformHashtags,
        media: platformMedia,
        settings: {
          ...buildDefaultSettings(platform),
          ...(platform === 'instagram' ? { post_type: 'post' } : {}),
        },
        publishMode: rule.publishMode,
      };
  });

  if (captionTrims.length) {
    warnings.push(
      `${caption.length}자 캡션이 일부 채널의 한도를 넘어 잘렸습니다: ` +
        `${captionTrims.join(', ')}자.`
    );
  }
  if (hashtagTrims.length) {
    warnings.push(
      `해시태그 ${hashtags.length}개 중 한도가 더 적은 채널에는 다음만 반영했습니다: ` +
        `${hashtagTrims.join(', ')}.`
    );
  }

  return {
    targetPlatforms,
    media,
    warnings,
    variants,
  };
}

export function normalizeCardNewsPlatforms(platforms?: SnapsTargetPlatform[]) {
  const requested = Array.isArray(platforms) && platforms.length
    ? platforms
    : ([...cardNewsPlatforms] as SnapsTargetPlatform[]);
  const normalized = requested.filter((platform): platform is typeof cardNewsPlatforms[number] =>
    (cardNewsPlatforms as readonly string[]).includes(platform)
  );
  // Falling back to the full platform list when the caller named only
  // unsupported platforms (say youtube, which cannot take an image carousel)
  // fanned one deck out to all eight platforms nobody asked for. Report the
  // empty selection instead and let the controller reject it, which is what
  // normalizeVideoPlatforms already does.
  return [...new Set(normalized)] as SnapsTargetPlatform[];
}

function cleanString(value: unknown, maxLength: number) {
  return typeof value === 'string'
    ? snapsClampText(value.trim().replace(/\s+/g, ' '), maxLength)
    : '';
}
