export type StudioImageStylePreset = {
  id: string;
  label: string;
  description: string;
  imageUrl: string;
  prompt: string;
};

export const STUDIO_IMAGE_STYLE_PRESETS: StudioImageStylePreset[] = [
  {
    id: "storytoon-character",
    label: "썰툰 캐릭터컷",
    description: "깔끔한 선과 부드러운 채색",
    imageUrl: "/studio/style-presets/storytoon-character.webp",
    prompt: "Korean storytoon character illustration, clean webtoon line art, soft cel shading, bright approachable colors, clear expressive face, simple readable background.",
  },
  {
    id: "webtoon-reaction",
    label: "웹툰 리액션컷",
    description: "과장된 표정과 강한 임팩트",
    imageUrl: "/studio/style-presets/webtoon-reaction.webp",
    prompt: "High-energy Korean webtoon reaction panel, bold outlines, exaggerated facial expression, dynamic angle, vivid short-form thumbnail colors, comic impact without written effects.",
  },
  {
    id: "semi-realistic-drama",
    label: "반실사 드라마컷",
    description: "실사에 가까운 드라마 장면",
    imageUrl: "/studio/style-presets/semi-realistic-drama.webp",
    prompt: "Semi-realistic cinematic drama still, natural Korean character proportions, soft dramatic lighting, realistic skin and fabric detail, shallow depth of field, polished short drama mood.",
  },
  {
    id: "news-editorial",
    label: "뉴스 이슈 일러스트",
    description: "정보형 쇼츠에 맞는 정돈된 컷",
    imageUrl: "/studio/style-presets/news-editorial.webp",
    prompt: "Clean editorial illustration for news and issue shorts, simplified confident shapes, crisp linework, muted but sharp palette, professional thumbnail-ready composition, not photorealistic.",
  },
  {
    id: "stylized-3d",
    label: "3D 캐릭터컷",
    description: "부드러운 3D 캐릭터 렌더",
    imageUrl: "/studio/style-presets/stylized-3d.webp",
    prompt: "Stylized 3D character render, smooth clay-like surfaces, appealing proportions, soft studio lighting, colorful modern short-form video look, expressive but not childish.",
  },
  {
    id: "emotional-anime",
    label: "감성 애니컷",
    description: "부드러운 빛과 애니 감정선",
    imageUrl: "/studio/style-presets/emotional-anime.webp",
    prompt: "Emotional anime still, soft painterly lighting, gentle gradients, detailed eyes, refined character design, cinematic bright mood, story-shorts atmosphere.",
  },
  {
    id: "chibi-moe",
    label: "치비 모에컷",
    description: "작고 귀여운 SD 캐릭터",
    imageUrl: "/studio/style-presets/chibi-moe.webp",
    prompt: "Chibi moe shorts illustration, super-deformed Korean character proportions, big sparkling eyes, tiny body, soft pastel colors, adorable polished short-form thumbnail look.",
  },
  {
    id: "kawaii-sticker",
    label: "카와이 스티커컷",
    description: "둥글고 귀여운 스티커 느낌",
    imageUrl: "/studio/style-presets/kawaii-sticker.webp",
    prompt: "Kawaii sticker illustration, thick clean outline, rounded shapes, glossy highlights, simple cheerful colors, compact mascot-like reaction pose, polished sticker-sheet feel.",
  },
  {
    id: "flat-vector-explainer",
    label: "플랫 설명 일러스트",
    description: "정보형 쇼츠에 잘 맞는 단순 도형",
    imageUrl: "/studio/style-presets/flat-vector-explainer.webp",
    prompt: "Flat vector editorial explainer illustration, geometric shapes, clean silhouettes, limited bright palette, minimal shading, high readability for informational shorts.",
  },
  {
    id: "paper-cutout-collage",
    label: "페이퍼 컷아웃",
    description: "종이 질감과 레이어 그림자",
    imageUrl: "/studio/style-presets/paper-cutout-collage.webp",
    prompt: "Layered paper cutout collage illustration, tactile paper texture, soft shadows between layers, handcrafted editorial look, warm friendly palette, short-form thumbnail composition.",
  },
  {
    id: "pixel-art-reaction",
    label: "픽셀 리액션컷",
    description: "게임풍 픽셀 썸네일",
    imageUrl: "/studio/style-presets/pixel-art-reaction.webp",
    prompt: "High-resolution pixel art reaction scene, clean 16-bit inspired character shapes, readable facial expression, cozy simple background, modern pixel illustration polish.",
  },
  {
    id: "retro-anime-90s",
    label: "90년대 애니컷",
    description: "레트로 셀 애니 감성",
    imageUrl: "/studio/style-presets/retro-anime-90s.webp",
    prompt: "Retro 1990s anime cel style, hand-painted background feel, clean cel-shaded Korean character, warm nostalgic color grading, subtle film grain, polished shorts thumbnail.",
  },
  {
    id: "black-white-manga",
    label: "흑백 만화컷",
    description: "먹선과 스크린톤 중심",
    imageUrl: "/studio/style-presets/black-white-manga.webp",
    prompt: "Monochrome manga panel style, clean ink linework, screentone shading, expressive eyes, strong dramatic composition, crisp black and white visual hierarchy.",
  },
  {
    id: "soft-watercolor-story",
    label: "수채화 스토리컷",
    description: "부드럽고 잔잔한 이야기 톤",
    imageUrl: "/studio/style-presets/soft-watercolor-story.webp",
    prompt: "Soft watercolor story illustration, translucent washes, gentle linework, warm cozy lighting, calm emotional short-story mood, clean square composition.",
  },
  {
    id: "neon-hyperpop",
    label: "네온 하이퍼팝",
    description: "강한 색감의 SNS 썸네일",
    imageUrl: "/studio/style-presets/neon-hyperpop.webp",
    prompt: "Neon hyperpop digital illustration, vibrant cyan and pink lighting, high contrast, glossy modern thumbnail look, energetic social media mood, clean readable subject.",
  },
  {
    id: "clay-stop-motion",
    label: "클레이 스톱모션",
    description: "손으로 만든 미니어처 질감",
    imageUrl: "/studio/style-presets/clay-stop-motion.webp",
    prompt: "Handmade clay stop-motion character look, soft rounded sculpted forms, tactile clay texture, warm studio lighting, charming miniature set, polished short-form thumbnail.",
  },
];
