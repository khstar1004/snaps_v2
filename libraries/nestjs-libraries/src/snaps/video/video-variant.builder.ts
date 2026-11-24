import {
  buildDefaultSettings,
  SnapsTargetPlatform,
  snapsPlatformRules,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import { snapsCleanBodyText } from '@gitroom/nestjs-libraries/snaps/text/body-text';
import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';

export type SnapsVideoMediaInput = {
  id: string;
  path: string;
  thumbnail?: string;
  alt?: string;
};

export type SnapsVideoVariantBuildInput = {
  videoUrl: string;
  mediaId: string;
  mediaPath?: string;
  thumbnail?: string;
  title?: string;
  caption?: string;
  targetPlatforms?: SnapsTargetPlatform[];
};

/** Matches the card news builder's cap for platforms with no hashtagLimit. */
const DEFAULT_HASHTAG_LIMIT = 20;

export const SNAPS_VIDEO_PLATFORMS = ['instagram', 'youtube', 'tiktok'] as const;
const videoPlatforms = SNAPS_VIDEO_PLATFORMS;

export function buildSnapsVideoVariants(input: SnapsVideoVariantBuildInput) {
  const targetPlatforms = normalizeVideoPlatforms(input.targetPlatforms);

  // A caller naming ['instagram', 'facebook'] got Instagram variants and no
  // mention of facebook at all: the unsupported half was filtered out in
  // silence and the run reported success. Naming only unsupported platforms
  // is already refused outright; a partial list has to say what it dropped.
  const unsupported = (input.targetPlatforms || []).filter(
    (platform) => !targetPlatforms.includes(platform)
  );
  const warnings = unsupported.length
    ? [`${unsupported.join(', ')}은(는) 쇼츠 영상을 지원하지 않아 제외했습니다.`]
    : [];
  const videoUrl = cleanString(input.videoUrl, 2000);
  const mediaPath = cleanString(input.mediaPath, 2000) || videoUrl;
  const thumbnail = cleanString(input.thumbnail, 2000);
  const title = cleanString(input.title, 120) || 'snaps short-form video';
  // The caption is what gets published, so it keeps its line breaks -
  // cleanString flattens, which is right for the title and the urls above
  // it and wrong here.
  const caption = snapsCleanBodyText(input.caption, 1000) || title;
  const media: SnapsVideoMediaInput[] = [
    {
      id: cleanString(input.mediaId, 120) || 'snaps-video',
      path: mediaPath,
      ...(thumbnail ? { thumbnail } : {}),
      alt: title,
    },
  ];

  return {
    targetPlatforms,
    media,
    warnings,
    variants: targetPlatforms.map((platform) => {
      const rule = snapsPlatformRules[platform];
      // The hashtags were hardcoded here, so attaching a video to Instagram
      // Reels or TikTok tagged it "#shorts" - YouTube's convention, wrong on
      // both. short-video.service.ts already reads the shared table for its
      // fallback script; this is the same fix one file over.
      const hashtags = [...new Set([...rule.defaultHashtags, '#snaps'])].slice(
        0,
        rule.hashtagLimit ?? DEFAULT_HASHTAG_LIMIT
      );

      return {
        platform,
        label: rule.label,
        content: caption,
        title,
        hashtags,
        media,
        settings: {
          ...buildDefaultSettings(platform),
          // InstagramDto.post_type is @IsIn(['post', 'story']); 'reel' is not
          // an accepted value. The product's own form offers exactly two
          // options and labels 'post' as "게시물 / 릴스" - a video published as a
          // feed post already becomes a Reel. The provider's only branch is
          // isStory = post_type === 'story', so 'reel' bought nothing and
          // failed validation.
          ...(platform === 'instagram' ? { post_type: 'post' } : {}),
          ...(platform === 'youtube' ? { title } : {}),
        },
        publishMode: 'schedule' as const,
      };
    }),
  };
}

export function normalizeVideoPlatforms(platforms?: SnapsTargetPlatform[]) {
  const requested = Array.isArray(platforms) && platforms.length
    ? platforms
    : ([...videoPlatforms] as SnapsTargetPlatform[]);
  const normalized = requested.filter((platform): platform is typeof videoPlatforms[number] =>
    (videoPlatforms as readonly string[]).includes(platform)
  );
  return [...new Set(normalized)] as SnapsTargetPlatform[];
}

function cleanString(value: unknown, maxLength: number) {
  return typeof value === 'string'
    ? snapsClampText(value.trim().replace(/\s+/g, ' '), maxLength)
    : '';
}
