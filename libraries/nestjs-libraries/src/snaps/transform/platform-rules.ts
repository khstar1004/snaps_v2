export const snapsTargetPlatforms = [
  'threads',
  'instagram',
  'youtube',
  'tiktok',
  'xiaohongshu',
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
  postMaxLength?: number;
  format: string;
  style: string;
  culture: string;
  contentPlan: string;
  defaultHashtags: string[];
  hashtagLimit?: number;
  publishMode: 'schedule' | 'assist';
};

export const snapsPlatformRules: Record<SnapsTargetPlatform, SnapsPlatformRule> = {
  threads: {
    label: 'Threads',
    maxLength: 1500,
    postMaxLength: 500,
    format:
      'Conversational main post plus optional reply-chain segments. Separate each segment with a blank line and keep every segment under 500 characters.',
    style:
      'Casual Korean banmal, direct, light, and talk-like. Avoid corporate endings and heavy hashtagging.',
    culture:
      'Fast public conversation, short opinions, replies, and quote-worthy one-line hooks.',
    contentPlan:
      'Start with a human hook, explain one point per segment, and continue as replies only when the source needs more context.',
    defaultHashtags: [],
    hashtagLimit: 1,
    publishMode: 'schedule',
  },
  instagram: {
    label: 'Instagram',
    maxLength: 2200,
    format:
      'Caption for feed or reel, emotional first line, readable line breaks, save/share CTA, and a small hashtag block at the end.',
    style:
      'Visual, sensory, warm Korean caption voice. Make the first 1-2 lines work even before the more fold.',
    culture:
      'Image-first feed where mood, identity, saves, and comments matter more than dense explanation.',
    contentPlan:
      'Open with a feeling or scene, add 2-4 useful points, close with a gentle save/comment CTA.',
    defaultHashtags: ['#콘텐츠', '#마케팅', '#인사이트'],
    hashtagLimit: 5,
    publishMode: 'schedule',
  },
  youtube: {
    label: 'YouTube Shorts',
    maxLength: 5000,
    format: 'Shorts title, description, and 3-6 tags in the same content block.',
    style:
      'Search-friendly Korean copy with a clear promise, fast hook, and no exaggerated claims.',
    culture:
      'Short-form video discovery where title clarity, retention hook, and searchable description carry the post.',
    contentPlan:
      'Return a compact title, a description that explains the payoff, and a short hashtag/tag set.',
    defaultHashtags: ['#shorts'],
    hashtagLimit: 6,
    publishMode: 'schedule',
  },
  tiktok: {
    label: 'TikTok',
    maxLength: 2200,
    format: 'Short caption with an immediate hook and trend-friendly hashtags.',
    style: 'Fast, casual, Korean mobile-first tone with a strong first 1-2 seconds hook.',
    culture:
      'Video-led feed where the caption supports the hook, search intent, and comment prompts.',
    contentPlan:
      'Keep the caption short unless the source is educational; use one clear prompt that invites comments.',
    defaultHashtags: ['#틱톡', '#추천'],
    hashtagLimit: 5,
    publishMode: 'schedule',
  },
  xiaohongshu: {
    label: 'Xiaohongshu',
    maxLength: 1000,
    format: 'Xiaohongshu note with a concise title, useful body, numbered tips, and discovery hashtags.',
    style:
      'Korean-to-China social commerce voice, visual, specific, community-friendly, no unverifiable claims.',
    culture:
      'Save-worthy note culture with practical tips, personal discovery, and clear visual context.',
    contentPlan:
      'Write like a useful note: title, why it matters, numbered tips, and discovery hashtags.',
    defaultHashtags: ['#샤오홍슈', '#小红书', '#RED'],
    hashtagLimit: 8,
    publishMode: 'assist',
  },
  'naver-blog': {
    label: 'Naver Blog',
    maxLength: 20000,
    format: 'Blog title, intro, table of contents, body sections, tags, and manual publishing checklist.',
    style:
      'Korean search-oriented long-form writing, useful and specific, with a neighbor-friendly intro when natural.',
    culture:
      'Information-sharing blog culture with search intent, neighbor relationships, comments, and practical saved references.',
    contentPlan:
      'Use title, intro, table of contents, structured sections, summary, and tags. Lightly use neighbor-friendly wording without forcing it.',
    defaultHashtags: ['#네이버블로그'],
    hashtagLimit: 10,
    publishMode: 'assist',
  },
  'naver-cafe': {
    label: 'Naver Cafe',
    maxLength: 10000,
    format: 'Cafe post title and body, community-friendly tone, no over-promotion.',
    style:
      'Korean community post, helpful, conversational, suitable for cafe boards and member reactions.',
    culture:
      'Topic-board community where trust, usefulness, and non-salesy participation matter.',
    contentPlan:
      'Open politely, share context, ask for member opinions, and keep promotional wording restrained.',
    defaultHashtags: ['#네이버카페'],
    hashtagLimit: 5,
    publishMode: 'schedule',
  },
  'kakao-talk': {
    label: 'KakaoTalk',
    maxLength: 1000,
    format: 'KakaoTalk share message with title, short body, link-card copy, and manual sharing checklist.',
    style:
      'Korean mobile messenger tone, concise, warm, and useful without sounding like an ad.',
    culture:
      'Private or small-group sharing where the recipient should understand the value immediately.',
    contentPlan:
      'Make it scannable: short title, one-sentence value, link-card line, and optional follow-up prompt.',
    defaultHashtags: [],
    publishMode: 'assist',
  },
  linkedin: {
    label: 'LinkedIn',
    maxLength: 3000,
    format: 'Professional post with a concise hook, insight, and practical takeaway.',
    style: 'Credible B2B voice, clear evidence, no hype.',
    culture:
      'Professional feed where experience, lessons, decision context, and practical takeaways perform well.',
    contentPlan:
      'Start with a work-relevant observation, explain the lesson, and close with an actionable takeaway.',
    defaultHashtags: ['#marketing', '#content'],
    hashtagLimit: 3,
    publishMode: 'schedule',
  },
  x: {
    label: 'X',
    maxLength: 280,
    format: 'Single concise post under 280 characters.',
    style: 'Sharp, compressed, one point only.',
    culture:
      'Real-time public feed where clarity, point of view, and concise phrasing matter.',
    contentPlan:
      'Compress to one claim, one contrast, or one useful takeaway. Avoid multi-point summaries.',
    defaultHashtags: [],
    hashtagLimit: 1,
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
