import { weightedLength } from '@gitroom/helpers/utils/count.length';

export const snapsTargetPlatforms = [
  'threads',
  'bluesky',
  'instagram',
  'facebook',
  'pinterest',
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

/**
 * Length as the platform counts it. X weighs CJK/Hangul characters as 2 and
 * URLs as 23, so a 200-character Korean post is 400 against X's 280 limit.
 */
export const snapsContentLength = (platform: SnapsTargetPlatform, text: string) =>
  platform === 'x' ? weightedLength(text) : text.length;

/** Trims content to the platform limit using the platform's own counting. */
export const fitSnapsContent = (
  platform: SnapsTargetPlatform,
  text: string,
  maxLength = snapsPlatformRules[platform].maxLength
) => {
  const sliced = text.slice(0, maxLength);
  if (platform !== 'x' || weightedLength(sliced) <= maxLength) {
    return sliced;
  }
  const chars = Array.from(sliced);
  let low = 0;
  let high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (weightedLength(chars.slice(0, mid).join('')) <= maxLength) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return chars.slice(0, low).join('').trimEnd();
};

export type SnapsPlatformPlaybook = {
  sourceBasis: string[];
  audienceMindset: string;
  nativeGrammar: string[];
  openingMoves: string[];
  bodyMoves: string[];
  ctaMoves: string[];
  avoid: string[];
};

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
  playbook: SnapsPlatformPlaybook;
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
    playbook: {
      sourceBasis: [
        'Meta newsroom: Threads is a text app for public conversation, with 500-character posts, links, photos, and short videos.',
        'Meta text attachments update: long context can exist, but the visible post should still draw people into a conversation.',
      ],
      audienceMindset:
        'The reader is skimming for a quick point of view they can reply to, quote, or add a lived example to.',
      nativeGrammar: [
        'Use Korean banmal or soft casual endings when the brand allows it.',
        'Keep each segment to one claim, one example, or one question.',
        'Use blank lines as reply-chain boundaries, not as a long essay block.',
        'Use at most one tag and only when it names the community or topic.',
      ],
      openingMoves: [
        'Start with a thought-like hook: "이건 이렇게 보면 돼", "생각보다 중요한 건".',
        'Use a contrast hook: "다들 A만 보는데, 실제로는 B가 더 큼".',
        'Ask a reply-friendly question only after a clear opinion is visible.',
      ],
      bodyMoves: [
        'Explain the core idea in plain speech before adding supporting detail.',
        'Split long context into replies with one point per reply.',
        'Use a concrete example instead of abstract marketing wording.',
      ],
      ctaMoves: [
        'Close with a small discussion prompt: "너라면 어디에 더 가깝다고 봐?"',
        'Invite correction or examples when the source is analytical.',
      ],
      avoid: [
        'Do not write a polished press-release caption.',
        'Do not stack hashtags or keyword tags.',
        'Do not cram a blog summary into one 500-character segment.',
      ],
    },
  },
  bluesky: {
    label: 'Bluesky',
    maxLength: 300,
    postMaxLength: 300,
    format:
      'Single concise Bluesky post under 300 graphemes, with optional link or mention text left visible for facet parsing.',
    style:
      'Open, conversational, community-first Korean copy with one clear point and no engagement bait.',
    culture:
      'Decentralized public conversation where short posts, replies, quote posts, links, and image alt text matter.',
    contentPlan:
      'Compress the source into one clear opinion, question, or useful note that can invite a reply without becoming a thread.',
    defaultHashtags: [],
    hashtagLimit: 2,
    publishMode: 'schedule',
    playbook: {
      sourceBasis: [
        'Bluesky app.bsky.feed.post lexicon: text has maxGraphemes 300 and supports facets for links, mentions, and tags.',
        'Bluesky posting guide: posts require text and createdAt, can include language hints, facets, replies, quotes, images, and external cards.',
      ],
      audienceMindset:
        'The reader is scanning an open conversation feed and wants a compact point that feels worth replying to or reposting.',
      nativeGrammar: [
        'Keep the post under 300 visible characters and avoid long URL-heavy copy.',
        'Use one point, one question, or one concrete takeaway.',
        'Leave links and handles readable so the provider can create rich-text facets.',
        'Use at most one or two tags only when they clarify the community or topic.',
      ],
      openingMoves: [
        'Start with the claim rather than a greeting.',
        'Use a soft debate hook: "이건 다르게 보면", "요즘 놓치기 쉬운 건".',
        'Ask a reply-friendly question after a visible point of view.',
      ],
      bodyMoves: [
        'Remove secondary context unless it changes the meaning.',
        'Use one concrete example or noun from the source.',
        'Prefer plain speech over promotional wording.',
      ],
      ctaMoves: [
        'Invite examples or counterpoints instead of generic likes.',
        'Use no CTA when the post already makes a clear point.',
      ],
      avoid: [
        'Do not exceed the 300-grapheme budget.',
        'Do not write a multi-point LinkedIn-style post.',
        'Do not stack hashtags or keyword walls.',
      ],
    },
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
    playbook: {
      sourceBasis: [
        'Later 2026 Instagram hashtag guide and The Verge coverage of Adam Mosseri: five relevant hashtags, not tag stuffing.',
        'Instagram creator guidance summarized by Later: saves, shares, watch time, originality, and relevance matter more than hashtag volume.',
      ],
      audienceMindset:
        'The reader is reacting to a visual first, then deciding whether the caption is worth saving, sharing, or commenting on.',
      nativeGrammar: [
        'Make the first line emotional, visual, or identity-based before the caption expands.',
        'Use short paragraphs and line breaks so the caption feels designed for mobile.',
        'Use hashtags as precise classification signals: niche, topic, branded, format, or location.',
        'Keep the hashtag block to five or fewer tags.',
      ],
      openingMoves: [
        'Open with a scene: "오늘 이 장면에서 제일 먼저 든 생각".',
        'Open with a save-worthy promise: "나중에 다시 보려고 정리해둔 포인트".',
        'Open with identity: "콘텐츠 만드는 사람이라면 한 번은 겪는 문제".',
      ],
      bodyMoves: [
        'Turn source facts into 2-4 compact takeaways.',
        'Use sensory or visual wording when the source can support it.',
        'Make carousel-like copy when the content is educational: one point per line group.',
      ],
      ctaMoves: [
        'Use save, share, comment, or tag CTAs only when they fit the content value.',
        'Ask a low-friction question tied to the first-line hook.',
      ],
      avoid: [
        'Do not make the caption a dense article.',
        'Do not use generic hashtag walls.',
        'Do not force emojis or aesthetic language when the source is practical.',
      ],
    },
  },
  facebook: {
    label: 'Facebook',
    maxLength: 5000,
    format:
      'Facebook Page post with a clear first line, context, optional link cue, and conversational comment prompt.',
    style:
      'Plain, helpful Korean Page voice that works for existing followers without sounding like a hard ad.',
    culture:
      'Follower and community feed where comments, link previews, local context, and page trust matter.',
    contentPlan:
      'Open with the main update, explain why followers should care, add one useful detail, and close with a specific comment or link prompt.',
    defaultHashtags: [],
    hashtagLimit: 3,
    publishMode: 'schedule',
    playbook: {
      sourceBasis: [
        'Existing Postiz Facebook provider publishes through Facebook Page feed, photos, videos, comments, and analytics paths.',
        'Hootsuite, Buffer, and Metricool all expose Facebook as a core community, publishing, inbox, and analytics channel.',
      ],
      audienceMindset:
        'The reader likely follows the page already and wants a useful update, not platform-native slang or a dense press release.',
      nativeGrammar: [
        'Use a strong but clear first sentence before any link or background.',
        'Keep paragraphs short and readable for mobile feed scanning.',
        'Use a link cue when a URL or landing page is attached.',
        'Ask one concrete question only when discussion or support input is useful.',
      ],
      openingMoves: [
        'Lead with the announcement or practical benefit.',
        'Use local/community framing when the source is audience-specific.',
        'Turn product updates into "what changes for you" language.',
      ],
      bodyMoves: [
        'Summarize the source in 2-4 short paragraphs or bullets.',
        'Separate fact, benefit, and next step.',
        'Use accessible wording rather than creator slang.',
      ],
      ctaMoves: [
        'Prompt comments with a specific question.',
        'Use "자세히 보기" or "신청하기" only when a real link exists.',
      ],
      avoid: [
        'Do not write a hashtag-heavy Instagram caption.',
        'Do not overuse emojis or urgency.',
        'Do not hide the commercial nature of an offer.',
      ],
    },
  },
  pinterest: {
    label: 'Pinterest',
    maxLength: 500,
    format:
      'Pinterest Pin package with title, description, destination link cue, board reminder, and image-first wording.',
    style:
      'Searchable, inspirational Korean Pin copy with concrete visual nouns and save-worthy benefit.',
    culture:
      'Visual discovery and planning feed where Pins are saved to boards and need image/video, title, description, and destination context.',
    contentPlan:
      'Return a title-like first line, a concise description, visual/search keywords, and a reminder that board and media are required before scheduling.',
    defaultHashtags: [],
    hashtagLimit: 5,
    publishMode: 'schedule',
    playbook: {
      sourceBasis: [
        'Pinterest developer docs: content takes the form of boards and Pins; Pins are saved on boards.',
        'Pinterest developer docs: organic Pin creation supports image and video Pins with title, description, board_id, link, and media_source fields.',
      ],
      audienceMindset:
        'The reader is collecting ideas for later and needs to know what the visual helps them do or decide.',
      nativeGrammar: [
        'Write a title that can sit below a Pin preview.',
        'Use searchable nouns for the visual, audience, use case, and result.',
        'Mention the destination value when a link exists.',
        'Keep the copy image-first and board-friendly.',
      ],
      openingMoves: [
        'Start with a visual title: "B2B 콘텐츠 캘린더 체크리스트".',
        'Use "저장해둘" only when the content is reference-worthy.',
        'Name the use case before the brand message.',
      ],
      bodyMoves: [
        'Describe what the Pin shows and why it is useful.',
        'Add 2-3 searchable phrases naturally.',
        'Keep the description concise enough to pair with an image.',
      ],
      ctaMoves: [
        'Use "자세히 보기" when there is a destination URL.',
        'Invite saving to a planning or campaign board.',
      ],
      avoid: [
        'Do not create a text-only Pin plan without warning that media and board are required.',
        'Do not write a long blog-style summary.',
        'Do not use generic viral hashtags as discovery strategy.',
      ],
    },
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
    playbook: {
      sourceBasis: [
        'YouTube Help: Shorts are vertical or square videos up to three minutes after the October 15, 2024 rule.',
        'YouTube Help: titles, descriptions, and hashtags help viewers and search understand the video.',
      ],
      audienceMindset:
        'The viewer wants to know instantly what the Short is about and why watching to the end is worth it.',
      nativeGrammar: [
        'Return metadata as title, description, and tags in one publishable block.',
        'Put the search keyword and payoff near the beginning of title and description.',
        'Keep hashtags relevant and let the description explain the actual value.',
        'Avoid ordinary tag stuffing because YouTube says title, thumbnail, and description are more important discovery metadata.',
      ],
      openingMoves: [
        'Title starts with the outcome: "3분 안에 보는 ...", "왜 ...가 중요한가".',
        'Description first line states the video promise before any background.',
        'Use a curiosity gap only when the answer appears in the description.',
      ],
      bodyMoves: [
        'Write a short description that mirrors the video structure: hook, payoff, context.',
        'Mention who the Short is for when the audience segment is clear.',
        'Use search-friendly nouns from the source instead of vague teaser words.',
      ],
      ctaMoves: [
        'Close with a light follow-up prompt such as "관련 사례는 댓글로 남겨주세요."',
        'Use subscribe or link prompts only when the source includes a real next step.',
      ],
      avoid: [
        'Do not overpromise retention or results.',
        'Do not use unrelated hashtags.',
        'Do not bury the searchable topic after a long greeting.',
      ],
    },
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
    playbook: {
      sourceBasis: [
        'TikTok Creative Center: trends, keyword insights, creative patterns, and best practices are research-backed planning inputs.',
        'TikTok Creative Insights: creative elements, visual styles, and best practices should guide made-for-TikTok output.',
      ],
      audienceMindset:
        'The viewer is in fast vertical video mode and reads the caption only if the hook already feels useful, surprising, or relatable.',
      nativeGrammar: [
        'Caption supports the video hook instead of explaining everything.',
        'Use short, punchy Korean with one clear prompt.',
        'Use 3-5 focused tags that match spoken or on-screen keywords.',
        'Favor native, creator-like language over polished brand copy.',
      ],
      openingMoves: [
        'Start with "POV", "요즘", "이거 모르면", or a direct problem when appropriate.',
        'Lead with the surprising result or mistake before the explanation.',
        'Use a question only if it can be answered in the first seconds of the video.',
      ],
      bodyMoves: [
        'Compress the source into one hook plus one context line.',
        'For educational content, add a short searchable explanation after the hook.',
        'Use words that could appear as on-screen text or voiceover.',
      ],
      ctaMoves: [
        'Invite comments with a concrete choice or experience prompt.',
        'Use "저장" only for tutorial, checklist, or reference content.',
      ],
      avoid: [
        'Do not sound like a formal ad script.',
        'Do not use generic viral tags as the main strategy.',
        'Do not write long captions unless the source is search-led education.',
      ],
    },
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
    playbook: {
      sourceBasis: [
        'Newrank Xiaohongshu guide: title, cover, and tags drive click and recommendation matching.',
        '人人都是产品经理 Xiaohongshu operations guide: titles should be concise, keyword-aware, and aligned with the cover.',
      ],
      audienceMindset:
        'The reader wants a trustworthy note that feels personally tested, useful to save, and specific to a real life scene.',
      nativeGrammar: [
        'Use note structure: title, why it matters, numbered tips, tags.',
        'Put identity, scene, pain point, or result in the title.',
        'Use practical "种草" or "避坑" energy without unverifiable claims.',
        'Keep tags focused on audience, scene, category, and long-tail discovery.',
      ],
      openingMoves: [
        'Title format: "3가지로 정리한 ...", "초보자가 놓치기 쉬운 ...", "저장해둘 ...".',
        'First body line explains who should save the note.',
        'Use a personal discovery framing when the source supports it.',
      ],
      bodyMoves: [
        'Use numbered tips with concrete before and after meaning.',
        'Add a short "왜 중요한지" section before the tips.',
        'Translate abstract benefits into daily-use scenes.',
      ],
      ctaMoves: [
        'Close with "저장해두고 필요할 때 다시 보기" for reference content.',
        'Ask for user scenario or experience, not a generic engagement request.',
      ],
      avoid: [
        'Do not write only a Korean Instagram caption and call it Xiaohongshu.',
        'Do not use exaggerated miracle claims.',
        'Do not exceed tag density with unrelated hot topics.',
      ],
    },
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
    playbook: {
      sourceBasis: [
        'Naver Search Help: blog posts may take up to 24 hours after registration or modification to appear in search.',
        'Naver Search Help: restricted, low-quality, or policy-violating posts can be limited in search exposure.',
      ],
      audienceMindset:
        'The reader arrives with search intent and expects a useful, organized explanation that can be trusted and revisited.',
      nativeGrammar: [
        'Use title, intro, table of contents, section headings, summary, and tags.',
        'Place the main search intent naturally in title, intro, and headings.',
        'Use neighbor-friendly Korean only when it does not weaken expertise.',
        'Make the post feel like an information archive, not a short caption.',
      ],
      openingMoves: [
        'Start with the problem or search question the reader probably typed.',
        'Use a neighbor-friendly intro such as "이웃님들께 공유드려요" only for soft topics.',
        'Offer a short preview of what the post will answer.',
      ],
      bodyMoves: [
        'Break the source into searchable sections and concrete examples.',
        'Add a short checklist or comparison when the source contains decisions.',
        'Summarize implications at the end so the post is save-worthy.',
      ],
      ctaMoves: [
        'Close with a practical next step or comment prompt for related questions.',
        'Use tags as search support, not as a hashtag wall.',
      ],
      avoid: [
        'Do not keyword-stuff the title or first paragraph.',
        'Do not make a blog post look like a social caption.',
        'Do not claim immediate Naver search exposure.',
      ],
    },
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
    playbook: {
      sourceBasis: [
        'Naver Cafe app listing: Cafe is organized around topic boards, member sharing, latest posts, popular posts, likes, and local neighbor stories.',
        'Naver Cafe product surfaces emphasize board-level interest sharing and reactions over one-way publishing.',
      ],
      audienceMindset:
        'The reader is a member of a topic community and cares whether the post is useful, relevant to the board, and respectful of the group norm.',
      nativeGrammar: [
        'Use a clear cafe-board title and a conversational body.',
        'Lead with context before any recommendation or promotion.',
        'Ask for members opinions or experiences when the topic is subjective.',
        'Keep hashtagging minimal because cafe discovery is board and search led.',
      ],
      openingMoves: [
        'Open politely: "안녕하세요, 이 내용 같이 보면 좋을 것 같아서 공유합니다."',
        'State why the post belongs in this board.',
        'Use question titles when asking for peer experience.',
      ],
      bodyMoves: [
        'Share context, then bullet the useful points.',
        'Separate facts from personal opinion or request.',
        'For promotional source text, rewrite as helpful information first.',
      ],
      ctaMoves: [
        'Ask "혹시 비슷한 경험 있으신 분 계실까요?" or request board-specific tips.',
        'Invite corrections from experienced members.',
      ],
      avoid: [
        'Do not sound like a banner ad or external sales post.',
        'Do not ignore board context.',
        'Do not use overexcited influencer phrasing.',
      ],
    },
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
    playbook: {
      sourceBasis: [
        'Kakao Business message guide: channel messages can deliver content, events, notices, and post/video attachments.',
        'Kakao channel execution guide: promotional messages require clear ad marking and compliance; basic text messages have tight copy limits.',
      ],
      audienceMindset:
        'The recipient sees this inside a personal messenger and decides quickly whether the message is useful or intrusive.',
      nativeGrammar: [
        'Use title, one-sentence value, short body, and button or link-card copy.',
        'Keep the main text short enough for a chat bubble.',
        'Make benefit and timing clear before the link.',
        'Do not use hashtags unless the user explicitly needs them.',
      ],
      openingMoves: [
        'Start with a clear benefit: "오늘 확인하면 좋은 안내입니다."',
        'Use recipient-friendly wording rather than feed-style hooks.',
        'For events or promotions, make the ad nature explicit in the draft notes.',
      ],
      bodyMoves: [
        'Condense to one key value and one supporting detail.',
        'Use line breaks for scanability.',
        'Write link-card copy as a separate short line.',
      ],
      ctaMoves: [
        'Use a direct button-style CTA: "자세히 보기", "신청하기", "쿠폰 확인".',
        'Add a polite follow-up prompt only when two-way chat is intended.',
      ],
      avoid: [
        'Do not make the message feel like spam.',
        'Do not hide promotional intent.',
        'Do not write long social-caption paragraphs.',
      ],
    },
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
    playbook: {
      sourceBasis: [
        'LinkedIn Help: standard feed posts support up to 3000 characters.',
        'LinkedIn Pages best practices: weekly posting, relevant terms, images, video, documents, mentions, hashtags, and targeting support professional reach.',
      ],
      audienceMindset:
        'The reader is evaluating professional judgment, experience, and whether the takeaway can improve their own work.',
      nativeGrammar: [
        'Use a work-relevant hook in the first 1-2 lines.',
        'Show decision context, lesson, and practical takeaway.',
        'Use evidence language without overclaiming.',
        'Use 2-3 relevant professional hashtags at the end.',
      ],
      openingMoves: [
        'Start with a workplace observation: "팀에서 자주 놓치는 지점은".',
        'Use a lesson-learned hook when the source has experience or failure.',
        'Use numbers only when the source provides them.',
      ],
      bodyMoves: [
        'Explain why the insight matters for decisions, teams, or customers.',
        'Use compact bullets for frameworks and long paragraphs for narrative only when useful.',
        'Include a practical implication rather than a motivational slogan.',
      ],
      ctaMoves: [
        'Close with a professional discussion prompt or one next action.',
        'Invite examples from peers without engagement bait.',
      ],
      avoid: [
        'Do not use hype, hustle cliches, or vague thought leadership.',
        'Do not overuse emojis.',
        'Do not make unsupported performance claims.',
      ],
    },
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
    playbook: {
      sourceBasis: [
        'X developer docs: standard posts contain up to 280 weighted characters; URLs and emojis have special counting rules.',
        'X Business organic best practices: keep copy concise, conversational, avoid all-caps, and generally avoid hashtags in post copy.',
      ],
      audienceMindset:
        'The reader wants a fast, clear point of view that can be understood, reposted, or replied to immediately.',
      nativeGrammar: [
        'One post, one claim.',
        'Use compressed Korean with no intro.',
        'Avoid hashtags unless one tag is essential context.',
        'Keep a quote-ready sentence if the source is opinion-led.',
      ],
      openingMoves: [
        'Lead with the claim, not background.',
        'Use contrast: "문제는 A가 아니라 B다."',
        'Use timely wording only when the source is time-sensitive.',
      ],
      bodyMoves: [
        'Remove all secondary points.',
        'Use one concrete noun or example to anchor the claim.',
        'If the source needs nuance, choose the most shareable takeaway.',
      ],
      ctaMoves: [
        'Usually no CTA; use a short question only when discussion is the goal.',
        'Use a link cue only when a real URL will be attached.',
      ],
      avoid: [
        'Do not write a mini-thread in one post.',
        'Do not use hashtag clutter.',
        'Do not use all caps or corporate promo language.',
      ],
    },
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
  if (platform === 'facebook') {
    return {
      __type: 'facebook',
      url: '',
    };
  }

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

  if (platform === 'pinterest') {
    return {
      __type: 'pinterest',
      title: '',
      link: '',
      dominant_color: '',
      board: '',
    };
  }

  return {
    __type: platform,
  };
}
