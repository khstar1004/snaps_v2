export const snapsTargetPlatforms = [
  'threads',
  'instagram',
  'youtube',
  'tiktok',
  'naver-blog',
  'naver-cafe',
  'kakao-talk',
  'linkedin',
  'x',
] as const;

export type SnapsTargetPlatform = (typeof snapsTargetPlatforms)[number];

export type SnapsPlatformRule = {
  label: string;
  maxLength: number;
  format: string;
  style: string;
  defaultHashtags: string[];
  publishMode: 'schedule' | 'assist';
};

export const snapsPlatformRules: Record<SnapsTargetPlatform, SnapsPlatformRule> = {
  threads: {
    label: 'Threads',
    maxLength: 500,
    format: 'Short conversational post with one clear hook and 1-2 line breaks.',
    style: 'Korean nano-influencer voice, natural, direct, no corporate wording.',
    defaultHashtags: [],
    publishMode: 'schedule',
  },
  instagram: {
    label: 'Instagram',
    maxLength: 2200,
    format: 'Caption for feed or reel, strong first sentence, readable line breaks, hashtags at the end.',
    style: 'Visual, concise, benefit-led, suitable for Korean Instagram users.',
    defaultHashtags: ['#콘텐츠', '#마케팅', '#인사이트'],
    publishMode: 'schedule',
  },
  youtube: {
    label: 'YouTube Shorts',
    maxLength: 5000,
    format: 'Shorts title, description, and 3-6 tags in the same content block.',
    style: 'Search-friendly Korean copy with a clear promise and no exaggerated claims.',
    defaultHashtags: ['#shorts'],
    publishMode: 'schedule',
  },
  tiktok: {
    label: 'TikTok',
    maxLength: 2200,
    format: 'Short caption with an immediate hook and trend-friendly hashtags.',
    style: 'Fast, casual, Korean mobile-first tone.',
    defaultHashtags: ['#틱톡', '#추천'],
    publishMode: 'schedule',
  },
  'naver-blog': {
    label: 'Naver Blog',
    maxLength: 20000,
    format: 'Blog title, intro, table of contents, body sections, tags, and manual publishing checklist.',
    style: 'Korean search-oriented long-form writing, useful and specific, no keyword stuffing.',
    defaultHashtags: ['#네이버블로그'],
    publishMode: 'assist',
  },
  'naver-cafe': {
    label: 'Naver Cafe',
    maxLength: 10000,
    format: 'Cafe post title and body, community-friendly tone, no over-promotion.',
    style: 'Korean community post, helpful, conversational, suitable for cafe boards.',
    defaultHashtags: ['#네이버카페'],
    publishMode: 'schedule',
  },
  'kakao-talk': {
    label: 'KakaoTalk',
    maxLength: 1000,
    format: 'KakaoTalk share message with title, short body, link-card copy, and manual sharing checklist.',
    style: 'Korean mobile messenger tone, concise, warm, and useful without sounding like an ad.',
    defaultHashtags: [],
    publishMode: 'assist',
  },
  linkedin: {
    label: 'LinkedIn',
    maxLength: 3000,
    format: 'Professional post with a concise hook, insight, and practical takeaway.',
    style: 'Credible B2B voice, clear evidence, no hype.',
    defaultHashtags: ['#marketing', '#content'],
    publishMode: 'schedule',
  },
  x: {
    label: 'X',
    maxLength: 280,
    format: 'Single concise post under 280 characters.',
    style: 'Sharp, compressed, one point only.',
    defaultHashtags: [],
    publishMode: 'schedule',
  },
};

export function normalizeTargetPlatforms(
  targetPlatforms?: string[]
): SnapsTargetPlatform[] {
  const normalized = (targetPlatforms || ['threads', 'instagram', 'youtube', 'tiktok'])
    .map((platform) => platform.toLowerCase().trim())
    .filter((platform): platform is SnapsTargetPlatform =>
      (snapsTargetPlatforms as readonly string[]).includes(platform)
    );

  return normalized.length ? [...new Set(normalized)] : ['threads', 'instagram'];
}

export function buildDefaultSettings(platform: SnapsTargetPlatform) {
  if (platform === 'instagram') {
    return {
      __type: 'instagram',
      post_type: 'post',
    };
  }

  if (platform === 'youtube') {
    return {
      __type: 'youtube',
      title: '',
      type: 'short',
    };
  }

  if (platform === 'tiktok') {
    return {
      __type: 'tiktok',
      privacy_level: 'PUBLIC_TO_EVERYONE',
    };
  }

  return {
    __type: platform,
  };
}
