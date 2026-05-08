import {
  buildDefaultSettings,
  SnapsTargetPlatform,
  snapsPlatformRules,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';

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

const videoPlatforms = ['instagram', 'youtube', 'tiktok'] as const;

export function buildSnapsVideoVariants(input: SnapsVideoVariantBuildInput) {
  const targetPlatforms = normalizeVideoPlatforms(input.targetPlatforms);
  const videoUrl = cleanString(input.videoUrl, 2000);
  const mediaPath = cleanString(input.mediaPath, 2000) || videoUrl;
  const thumbnail = cleanString(input.thumbnail, 2000);
  const title = cleanString(input.title, 120) || 'snaps short-form video';
  const caption = cleanString(input.caption, 1000) || title;
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
    variants: targetPlatforms.map((platform) => ({
      platform,
      label: snapsPlatformRules[platform].label,
      content: caption,
      title,
      hashtags: platform === 'youtube' ? ['#shorts'] : ['#shorts', '#snaps'],
      media,
      settings: {
        ...buildDefaultSettings(platform),
        ...(platform === 'instagram' ? { post_type: 'reel' } : {}),
        ...(platform === 'youtube' ? { title } : {}),
      },
      publishMode: 'schedule' as const,
    })),
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
    ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength)
    : '';
}
