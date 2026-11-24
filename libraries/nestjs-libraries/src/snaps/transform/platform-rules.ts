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
  /** Present only where the platform counts units rather than characters. */
  weightedLimit?: number;
  postMaxLength?: number;
  format: string;
  style: string;
  culture: string;
  contentPlan: string;
  defaultHashtags: string[];
  hashtagLimit?: number;
  /**
   * Maximum attachments a single post accepts. Only set where the platform
   * limit is unambiguous; left undefined means "do not clamp", so a platform
   * whose limit is not verified here keeps today's behaviour rather than being
   * truncated on a guess.
   */
  mediaLimit?: number;
  /**
   * The platform publishes a title separately from the body. Without this the
   * fallback pushed a "Title: ..." line into the content instead, and the
   * YouTube post title ended up as the whole block including the hashtags.
   */
  requiresTitle?: boolean;
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
    // A feed carousel accepts at most 10 items.
    mediaLimit: 10,
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
    requiresTitle: true,
    publishMode: 'schedule',
  },
  tiktok: {
    label: 'TikTok',
    // 2,000, not 2,200. TikTokProvider.maxLength() returns 2000 and TikTok
    // rejects a longer caption at publish, so a variant between the two was
    // composed, clamped to a number that said it fit, scheduled, and then
    // failed - and the operator learned about it from the post, not the
    // editor. Threads looks like the same mismatch and is not: its 1,500 is a
    // reply chain that publishing-payload.builder.ts splits into segments of
    // postMaxLength (500), which is what the provider limits.
    maxLength: 2000,
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
    requiresTitle: true,
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
    requiresTitle: true,
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
    requiresTitle: true,
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
    // X counts 280 *units*, not characters: Hangul weighs two, Latin one. A
    // Korean post clamped to 280 characters counts as 479 and is refused at
    // publish - measured. Only X has this; the other nine platforms count
    // characters. See text/weighted-length.ts.
    weightedLimit: 280,
    format:
      'Single concise post. X counts Korean characters as two, so about 140 of them fit.',
    style: 'Sharp, compressed, one point only.',
    culture:
      'Real-time public feed where clarity, point of view, and concise phrasing matter.',
    contentPlan:
      'Compress to one claim, one contrast, or one useful takeaway. Avoid multi-point summaries.',
    defaultHashtags: [],
    hashtagLimit: 1,
    // A single X post accepts at most 4 attachments.
    mediaLimit: 4,
    publishMode: 'schedule',
  },
};

/**
 * Naming nothing means "use the defaults". Naming only platforms snaps does
 * not support means the request cannot be honoured, and the empty result says
 * so: transforming for ['facebook', 'myspace'] used to return Threads and
 * Instagram variants, channels nobody had asked for, reported as a success.
 * normalizeCardNewsPlatforms and normalizeVideoPlatforms already work this
 * way and let the controller refuse by name.
 */
export function normalizeTargetPlatforms(
  targetPlatforms?: string[]
): SnapsTargetPlatform[] {
  const requested = Array.isArray(targetPlatforms) ? targetPlatforms : [];
  const source = requested.length
    ? requested
    : ['threads', 'instagram', 'youtube', 'tiktok'];
  const normalized = source
    .map((platform) => String(platform || '').toLowerCase().trim())
    .filter((platform): platform is SnapsTargetPlatform =>
      (snapsTargetPlatforms as readonly string[]).includes(platform)
    );

  return [...new Set(normalized)];
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
      // Deliberately empty: prepareSchedulableVariant treats a blank title as
      // "not set" and derives a real one from the variant. Seeding a value here
      // would win over that and title every YouTube post the same.
      title: '',
      // YoutubeSettingsDto.type is the privacy status - the provider sends it
      // as privacyStatus - not the video format. It was set to 'short', which
      // is not one of the accepted values, so every snaps YouTube post carried
      // an invalid privacy status. 'public' is what the product's own YouTube
      // form registers as its default.
      type: 'public',
    };
  }

  if (platform === 'tiktok') {
    // TikTokDto marks duet, stitch, comment, autoAddMusic, the two brand
    // toggles and content_posting_method as required - only privacy_level was
    // supplied, so a snaps TikTok post carried undefined for the rest all the
    // way to the provider. These mirror the defaults the product's own TikTok
    // form registers, rather than values invented here.
    return {
      __type: 'tiktok',
      privacy_level: 'PUBLIC_TO_EVERYONE',
      content_posting_method: 'DIRECT_POST',
      autoAddMusic: 'no',
      comment: true,
      duet: false,
      stitch: false,
      brand_content_toggle: false,
      brand_organic_toggle: false,
    };
  }

  if (platform === 'x') {
    // XDto requires who_can_reply_post; the product's X form defaults it to
    // 'everyone'.
    return {
      __type: 'x',
      who_can_reply_post: 'everyone',
    };
  }

  return {
    __type: platform,
  };
}
