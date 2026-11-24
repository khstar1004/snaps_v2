import { toCategoryLabel } from "@/lib/publish/categories";
import type { PublishMetadata } from "@/lib/publish/category-metadata";
import type { PublishCategory } from "@/lib/publish/types";
import type { PreparedSlide, SlideManualImagePrompt, StoryCharacterProfile } from "@/types/studio-json";
import {
  AI_IMAGE_OUTPUT_CONSTRAINTS,
  appendAiImageOutputConstraints,
} from "@/lib/studio/ai-image-output-constraints";

export type StudioManualImagePrompt = SlideManualImagePrompt;
export type StudioManualImageCharacterProfile = StoryCharacterProfile;
export type StudioManualImageMascotMetadata = Pick<
  PublishMetadata,
  | "mascotPrompt"
  | "mascotName"
  | "mascotDescription"
  | "mascotStyle"
  | "mascotTone"
  | "mascotNegativePrompt"
  | "mascotAnchorImageUrl"
  | "mascotAnchorAssetId"
>;

const DEFAULT_NEGATIVE_PROMPT =
  "글자, 자막, 말풍선, 로고, 워터마크, 서명, 추가 팔, 추가 손, 추가 다리, 손가락 개수 오류, 손가락 왜곡, 신체 비틀림, 캐릭터 복제, 배경 과밀, 저해상도";

const CTA_TOKENS = ["구독", "좋아요", "댓글", "알림", "팔로우", "follow", "subscribe", "comment"];
const MULTI_ROLE_TOKENS = [
  "동시에",
  "투잡",
  "병행",
  "겸업",
  "멀티",
  "여러 일",
  "두 가지 일",
  "한 프레임 안",
  "배달",
  "회사 일",
];

const AUTO_CHARACTER_TRAITS = {
  male: {
    displayPrefix: ["차분한", "수줍은", "반듯한", "무심한", "단정한", "선한"],
    hair: ["검은 짧은 머리", "짙은 갈색 가르마 머리", "단정한 투블럭", "내추럴한 앞머리 숏컷", "살짝 웨이브 있는 짧은 머리"],
    outfit: ["네이비 후드티", "회색 맨투맨", "베이지 셔츠", "검은 집업 재킷", "올리브 니트", "크림색 가디건"],
    build: ["슬림한 체형", "평균 체형", "마른 체형"],
    vibe: ["수줍지만 따뜻한 인상", "차분하고 성실한 분위기", "무심하지만 부드러운 표정", "반듯하고 깨끗한 인상", "조용하지만 선한 눈매"],
    accessory: ["", "얇은 금속 안경", "캔버스 백팩", "심플한 손목시계", "노트북 가방"],
  },
  female: {
    displayPrefix: ["차분한", "밝은", "단정한", "수수한", "부드러운", "또렷한"],
    hair: ["긴 생머리", "다크브라운 중단발", "차분한 레이어드 롱헤어", "묶은 포니테일", "자연스러운 웨이브 중단발"],
    outfit: ["베이지 가디건", "아이보리 셔츠", "민트 니트", "검은 집업 재킷", "연청 데님 재킷", "크림색 후드집업"],
    build: ["슬림한 체형", "평균 체형", "가녀린 실루엣"],
    vibe: ["차분한 미소", "담백하고 또렷한 인상", "부드럽고 친근한 분위기", "조용하지만 단단한 눈빛", "수수하고 따뜻한 인상"],
    accessory: ["", "작은 캔버스 백", "얇은 안경", "심플한 귀걸이", "작은 메신저백"],
  },
  unknown: {
    displayPrefix: ["차분한", "선명한", "수수한", "단정한", "부드러운", "반듯한"],
    hair: ["검은 단정한 머리", "짙은 갈색 자연스러운 헤어", "또렷한 실루엣의 숏헤어", "차분한 중단발", "깔끔하게 정돈된 헤어"],
    outfit: ["심플한 후드티", "무채색 셔츠", "베이직 니트", "단정한 재킷", "캐주얼한 가디건"],
    build: ["평균 체형", "슬림한 체형", "자연스러운 실루엣"],
    vibe: ["차분하고 안정적인 인상", "담백하고 친근한 분위기", "또렷하지만 과하지 않은 표정", "부드럽고 깨끗한 인상", "조용한 존재감"],
    accessory: ["", "심플한 백팩", "얇은 안경", "작은 메신저백"],
  },
} as const;

type AutoCharacterRole = keyof typeof AUTO_CHARACTER_TRAITS;

type ResolvedCharacterContext = {
  characterId: string;
  displayName: string;
  identityPrompt: string;
  anchorImageUrl?: string;
  anchorAssetId?: string;
  isFallback: boolean;
};

function normalizePromptText(value: unknown, maxLength: number | null = 220): string {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  if (maxLength === null) return normalized;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trim()}…`;
}

export function toPromptSafeAnchorUrl(value: unknown): string {
  const normalized = normalizePromptText(value, 400);
  if (!normalized) return "";
  try {
    const isRelative = normalized.startsWith("/");
    const parsed = new URL(normalized, "http://local.invalid");
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return isRelative ? parsed.pathname : parsed.toString();
  } catch {
    return "";
  }
}

function normalizeCharacterId(value: unknown, maxLength = 40): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, maxLength);
}

function hashStableText(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickStableTrait(seed: string, label: string, options: readonly string[]): string {
  if (options.length <= 0) return "";
  return options[hashStableText(`${seed}:${label}`) % options.length] || "";
}

function dedupeTextParts(values: Array<string | undefined>): string[] {
  const deduped: string[] = [];
  for (const value of values) {
    const normalized = normalizePromptText(value);
    if (!normalized) continue;
    if (deduped.includes(normalized)) continue;
    deduped.push(normalized);
  }
  return deduped;
}

function hasCustomMascotProfile(metadata?: StudioManualImageMascotMetadata | null): boolean {
  if (!metadata) return false;
  return Boolean(
    metadata.mascotPrompt ||
      metadata.mascotName ||
      metadata.mascotDescription ||
      metadata.mascotStyle ||
      metadata.mascotTone ||
      metadata.mascotNegativePrompt ||
      metadata.mascotAnchorImageUrl ||
      metadata.mascotAnchorAssetId
  );
}

function resolveMascotName(metadata: StudioManualImageMascotMetadata | null | undefined, category: PublishCategory): string {
  return normalizePromptText(metadata?.mascotName, 60) || `${toCategoryLabel(category)} 채널 마스코트`;
}

function resolveMascotDescription(metadata: StudioManualImageMascotMetadata | null | undefined, category: PublishCategory): string {
  return (
    normalizePromptText(metadata?.mascotDescription, 220) ||
    `${toCategoryLabel(category)} 채널을 대표하는 친근한 싱글 마스코트 캐릭터, 또렷한 얼굴 실루엣과 기억하기 쉬운 핵심 의상/소품`
  );
}

function resolveMascotStyle(metadata: StudioManualImageMascotMetadata | null | undefined): string {
  return (
    normalizePromptText(metadata?.mascotStyle, 160) ||
    "깔끔한 디지털 일러스트, 선명한 형태, 광고 컷처럼 정돈된 라이팅, 캐릭터 일관성 우선"
  );
}

function resolveMascotTone(metadata: StudioManualImageMascotMetadata | null | undefined): string {
  return (
    normalizePromptText(metadata?.mascotTone, 140) ||
    "밝은 라이트 톤, 블루/시안 포인트 컬러, 높은 대비 대신 깨끗한 채도"
  );
}

function resolveNegativePrompt(metadata: StudioManualImageMascotMetadata | null | undefined): string {
  return normalizePromptText(metadata?.mascotNegativePrompt, 180) || DEFAULT_NEGATIVE_PROMPT;
}

function resolveImageStylePrompt(input: {
  metadata?: StudioManualImageMascotMetadata | null;
  imageStylePrompt?: string;
}): string {
  return normalizePromptText(input.imageStylePrompt, 1400) || normalizePromptText(input.metadata?.mascotPrompt, 1400);
}

function resolveExplicitImageStylePrompt(imageStylePrompt?: string): string {
  return normalizePromptText(imageStylePrompt, 1400);
}

function resolveAutoCharacterRole(characterId: string): AutoCharacterRole {
  const normalized = characterId.trim().toLowerCase();
  if (normalized.startsWith("male_")) return "male";
  if (normalized.startsWith("female_")) return "female";
  return "unknown";
}

function toDefaultCharacterDisplayName(characterId: string): string {
  const matched = characterId.match(/^(male|female|unknown)_(\d+)$/u);
  if (!matched) return characterId;
  if (matched[1] === "male") return `남자 ${matched[2]}`;
  if (matched[1] === "female") return `여자 ${matched[2]}`;
  return `캐릭터 ${matched[2]}`;
}

function toDefaultCharacterIdentityPrompt(characterId: string): string {
  const normalized = characterId.trim().toLowerCase();
  if (normalized.startsWith("male_")) {
    return "반복 등장하는 한국 남성 캐릭터, 자연스러운 현실형 얼굴 비율, 깔끔한 헤어 실루엣, 일관된 평상복";
  }
  if (normalized.startsWith("female_")) {
    return "반복 등장하는 한국 여성 캐릭터, 자연스러운 현실형 얼굴 비율, 정돈된 헤어 실루엣, 일관된 평상복";
  }
  return "반복 등장하는 핵심 인물, 자연스러운 현실형 얼굴 비율, 기억하기 쉬운 헤어/의상 실루엣, 일관된 외형";
}

function buildAutoGeneratedCharacterIdentity(
  characterId: string,
  projectSeed?: string
): Pick<ResolvedCharacterContext, "displayName" | "identityPrompt"> {
  const role = resolveAutoCharacterRole(characterId);
  const traits = AUTO_CHARACTER_TRAITS[role];
  const seed = `${projectSeed || "default-project"}:${characterId.toLowerCase()}`;
  const numberSuffix = characterId.match(/_(\d+)$/u)?.[1] || "";
  const prefix = pickStableTrait(seed, "display-prefix", traits.displayPrefix);
  const displayNameBase = role === "male" ? "남자" : role === "female" ? "여자" : "인물";
  const subject = role === "male" ? "20대 한국 남성" : role === "female" ? "20대 한국 여성" : "20대 핵심 인물";
  const displayName = `${prefix || toDefaultCharacterDisplayName(characterId)} ${displayNameBase}${numberSuffix ? ` ${numberSuffix}` : ""}`.trim();
  const identityPrompt = dedupeTextParts([
    subject,
    pickStableTrait(seed, "hair", traits.hair),
    pickStableTrait(seed, "outfit", traits.outfit),
    pickStableTrait(seed, "build", traits.build),
    pickStableTrait(seed, "vibe", traits.vibe),
    pickStableTrait(seed, "accessory", traits.accessory),
  ]).join(", ");

  return {
    displayName: normalizePromptText(displayName, 80) || toDefaultCharacterDisplayName(characterId),
    identityPrompt: normalizePromptText(identityPrompt, null) || toDefaultCharacterIdentityPrompt(characterId),
  };
}

function normalizeCharacterProfiles(
  profiles?: StudioManualImageCharacterProfile[] | null
): StudioManualImageCharacterProfile[] {
  if (!Array.isArray(profiles)) return [];
  const deduped = new Map<string, StudioManualImageCharacterProfile>();
  for (const profile of profiles) {
    const characterId = normalizeCharacterId(profile?.characterId);
    if (!characterId || deduped.has(characterId)) continue;
    deduped.set(characterId, {
      characterId,
      displayName: normalizePromptText(profile?.displayName, 80) || undefined,
      identityPrompt: normalizePromptText(profile?.identityPrompt, null) || undefined,
      anchorImageUrl: normalizePromptText(profile?.anchorImageUrl, 400) || undefined,
      anchorAssetId: normalizePromptText(profile?.anchorAssetId, 120) || undefined,
    });
  }
  return Array.from(deduped.values());
}

export function resolveManualImagePromptCharacterIds(
  slide: Pick<PreparedSlide, "characterIds" | "dialogueSegments">
): string[] {
  const explicit = Array.isArray(slide.characterIds)
    ? slide.characterIds.map((value) => normalizeCharacterId(value)).filter(Boolean)
    : [];
  if (explicit.length > 0) {
    return Array.from(new Set(explicit));
  }

  const inferred: string[] = [];
  for (const segment of slide.dialogueSegments || []) {
    if (!segment || segment.type !== "quote") continue;
    const speakerId = normalizeCharacterId(segment.speakerId);
    if (!speakerId || inferred.includes(speakerId)) continue;
    inferred.push(speakerId);
  }
  return inferred;
}

function resolveCharacterContexts(input: {
  slide: PreparedSlide;
  publishCategory: PublishCategory;
  characterProfiles?: StudioManualImageCharacterProfile[] | null;
  projectSeed?: string;
  characterIds: string[];
}): ResolvedCharacterContext[] {
  const normalizedProfiles = normalizeCharacterProfiles(input.characterProfiles);
  const profilesById = new Map(normalizedProfiles.map((profile) => [profile.characterId, profile]));
  return input.characterIds.map((characterId) => {
    const matched = profilesById.get(characterId);
    const autoGenerated = buildAutoGeneratedCharacterIdentity(characterId, input.projectSeed);
    return {
      characterId,
      displayName: matched?.displayName || autoGenerated.displayName,
      identityPrompt: matched?.identityPrompt || autoGenerated.identityPrompt,
      anchorImageUrl: matched?.anchorImageUrl,
      anchorAssetId: matched?.anchorAssetId,
      isFallback: !matched || !matched.identityPrompt,
    };
  });
}

function buildCharacterDrivenBasePrompt(input: {
  publishCategory: PublishCategory;
  metadata?: StudioManualImageMascotMetadata | null;
  availableCharacters: ResolvedCharacterContext[];
  selectedCharacters: ResolvedCharacterContext[];
  imageStylePrompt?: string;
}): string {
  const explicitStylePrompt = resolveExplicitImageStylePrompt(input.imageStylePrompt);
  const styleReferencePrompt = explicitStylePrompt || resolveImageStylePrompt(input);
  const characterLines = input.availableCharacters.map((character) => {
    const promptSafeAnchorUrl = toPromptSafeAnchorUrl(character.anchorImageUrl);
    return (
      `[${character.characterId}] ${character.displayName}: ${character.identityPrompt}.` +
      (promptSafeAnchorUrl ? ` 기준 이미지 URL=${promptSafeAnchorUrl}.` : "") +
      (character.anchorAssetId ? ` 기준 자산 id=${character.anchorAssetId}.` : "")
    );
  });
  const displayNames = input.selectedCharacters.map((character) => character.displayName).join(", ");
  const hasSceneSelection = input.selectedCharacters.length > 0;

  return [
    styleReferencePrompt
      ? explicitStylePrompt
        ? `프로젝트 공통 스타일 기준: ${styleReferencePrompt}.`
        : `기존 채널 기준 프롬프트 참고: ${styleReferencePrompt}. 이 문장에서는 그림체/톤만 참고하고, 특정 단일 마스코트 정체성은 따르지 않는다.`
      : "",
    explicitStylePrompt
      ? ""
      : "프로젝트 일관성 규칙: same art style across the project. 각 characterId는 프로젝트 전체에서 같은 얼굴 비율, 같은 헤어 실루엣, 같은 핵심 의상/색상, 같은 액세서리를 유지한다.",
    "작업 캐릭터 설정:",
    ...characterLines,
    hasSceneSelection
      ? input.selectedCharacters.length > 1
        ? `이번 장면 주연 후보: ${displayNames}. 선택된 캐릭터를 모두 주연으로 사용하고 각자 서로 다른 외형을 유지한다.`
        : `이번 장면 주연 후보: ${displayNames}.`
      : "이번 장면 주연 후보는 per-slide scene prompt에서 결정한다.",
    `금지 요소: ${resolveNegativePrompt(input.metadata)}.`,
    AI_IMAGE_OUTPUT_CONSTRAINTS,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildStyleOnlyBasePrompt(input: {
  publishCategory: PublishCategory;
  metadata?: StudioManualImageMascotMetadata | null;
  imageStylePrompt?: string;
}): string {
  const explicitStylePrompt = resolveExplicitImageStylePrompt(input.imageStylePrompt);
  const styleReferencePrompt = explicitStylePrompt || resolveImageStylePrompt(input);
  return [
    styleReferencePrompt
      ? explicitStylePrompt
        ? `프로젝트 공통 스타일 기준: ${styleReferencePrompt}.`
        : `프로젝트 공통 스타일 기준: ${styleReferencePrompt}. 이 문장에서는 그림체와 톤만 사용하고, 특정 채널 마스코트 정체성은 사용하지 않는다.`
      : "",
    explicitStylePrompt
      ? ""
      : "프로젝트 연출 규칙: same art style across the project.",
    `금지 요소: ${resolveNegativePrompt(input.metadata)}.`,
    AI_IMAGE_OUTPUT_CONSTRAINTS,
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildStudioManualMascotBasePrompt(input: {
  publishCategory: PublishCategory;
  metadata?: StudioManualImageMascotMetadata | null;
  imageStylePrompt?: string;
}): string {
  const { metadata, publishCategory } = input;
  const explicitStylePrompt = resolveExplicitImageStylePrompt(input.imageStylePrompt);
  const savedMascotPrompt = normalizePromptText(metadata?.mascotPrompt, 1400);
  if (!explicitStylePrompt && savedMascotPrompt) {
    return savedMascotPrompt;
  }
  const mascotName = resolveMascotName(metadata, publishCategory);
  return [
    `마스코트 이름/정체성: ${mascotName}, ${resolveMascotDescription(metadata, publishCategory)}.`,
    explicitStylePrompt ? `스타일 기준: ${explicitStylePrompt}.` : `스타일: ${resolveMascotStyle(metadata)}.`,
    `색감/톤: ${resolveMascotTone(metadata)}.`,
    "유지해야 하는 특징: same mascot identity, 같은 얼굴 비율, 같은 실루엣, 같은 핵심 의상/색상, 같은 액세서리.",
    "신체/포즈 고정 조건: single mascot only, exactly two arms, exactly two hands, exactly two legs, 자연스러운 손/팔 관절, 안정된 단일 포즈, extra limbs forbidden.",
    `금지 요소: ${resolveNegativePrompt(metadata)}.`,
    AI_IMAGE_OUTPUT_CONSTRAINTS,
  ].join(" ");
}

function extractSlideSummary(slide: PreparedSlide): string {
  const linePreview = Array.isArray(slide.lines)
    ? slide.lines
        .map((line) => normalizePromptText(line, 64))
        .filter(Boolean)
        .slice(0, 2)
    : [];
  const summaryParts = dedupeTextParts([
    slide.title,
    linePreview.join(", "),
    slide.imageRequest?.scene,
    slide.imageRequest?.query,
    slide.text,
  ]);
  return summaryParts.slice(0, 3).join(" / ");
}

function inferEmotionAndAction(slide: PreparedSlide): string {
  const corpus = `${slide.title || ""} ${slide.text || ""} ${(slide.lines || []).join(" ")}`.toLowerCase();
  if (/(충격|경악|놀라|반전|shock|surprise)/u.test(corpus)) {
    return "놀라거나 반응하는 표정, 시선을 끄는 제스처";
  }
  if (/(분노|격분|반발|논란|anger|furious|fight)/u.test(corpus)) {
    return "단호한 표정, 손짓하며 강하게 설명하는 동작";
  }
  if (/(희망|기대|호재|승리|성공|happy|smile|win)/u.test(corpus)) {
    return "밝고 자신감 있는 표정, 긍정적인 포즈";
  }
  if (/(위기|불안|걱정|손실|하락|sad|worry|crisis)/u.test(corpus)) {
    return "걱정스럽거나 진지한 표정, 상황을 살피는 동작";
  }
  if (CTA_TOKENS.some((token) => corpus.includes(token.toLowerCase()))) {
    return "친근하게 손짓하며 시청자에게 행동을 유도하는 포즈";
  }
  return "현재 상황을 또렷하게 설명하는 표정과 자연스러운 제스처";
}

function inferBackgroundAndProps(slide: PreparedSlide, category: PublishCategory): string {
  const explicit = dedupeTextParts([slide.imageRequest?.scene, slide.imageRequest?.query]).join(", ");
  if (explicit) {
    return `${explicit}을 보여주는 간결한 배경, 핵심 소품 1~2개`;
  }
  const corpus = `${slide.title || ""} ${slide.text || ""}`.toLowerCase();
  if (/(뉴스|브리핑|속보|기자|발표|briefing|news)/u.test(corpus)) {
    return "뉴스 브리핑 느낌의 배경, 마이크·노트·간단한 패널 소품";
  }
  if (/(돈|경제|주가|코인|환율|세금|계산|money|stock|finance|tax)/u.test(corpus)) {
    return "데스크 또는 스튜디오 배경, 문서·그래프·계산기 같은 소품";
  }
  if (/(법|재판|판결|변호|수사|계약|law|legal|court)/u.test(corpus)) {
    return "서류와 책상이 보이는 배경, 문서·파일·배지 같은 소품";
  }
  if (CTA_TOKENS.some((token) => corpus.includes(token.toLowerCase()))) {
    return "밝고 깔끔한 배경, 여백이 있는 장면, 소품은 최소화";
  }
  return `${toCategoryLabel(category)} 채널 분위기에 맞는 간결한 배경, 상황을 설명하는 핵심 소품 1~2개`;
}

function inferComposition(slideIndex: number, totalSlides: number, slide: PreparedSlide): string {
  const corpus = `${slide.title || ""} ${slide.text || ""}`.toLowerCase();
  if (slideIndex === 0 || /(도입|오프닝|인트로|시작|opening|intro)/u.test(corpus)) {
    return "정면 클로즈업 또는 타이트한 미디엄샷, 시선 집중, square 1:1";
  }
  if (slideIndex === totalSlides - 1 || CTA_TOKENS.some((token) => corpus.includes(token.toLowerCase()))) {
    return "정면 미디엄샷, 손짓이 보이는 구도, 정리감 있는 여백, square 1:1";
  }
  return "캐릭터 중심 미디엄샷, 상황이 한눈에 보이는 정사각형 1:1 구도";
}

function inferPoseGuardrail(slide: PreparedSlide, characterCount: number): string {
  const corpus = `${slide.title || ""} ${slide.text || ""} ${(slide.lines || []).join(" ")} ${slide.imageRequest?.scene || ""}`.toLowerCase();
  if (characterCount > 1) {
    return "연출 조건: 지정된 캐릭터를 모두 주연으로 등장시킨다. 각 캐릭터는 자연스러운 손/팔 관절과 정상적인 팔다리 개수를 유지하고, 서로 겹치거나 복제된 신체가 생기지 않게 한다.";
  }
  if (MULTI_ROLE_TOKENS.some((token) => corpus.includes(token.toLowerCase()))) {
    return "연출 조건: 장면의 주연은 한 가지 핵심 동작만 수행한다. 다른 역할/정보는 책상, 서류, 가방, 헬멧 같은 배경 소품으로만 암시하고 동시에 두 행동을 하게 만들지 않는다.";
  }
  return "연출 조건: 각 인물은 하나의 자연스러운 핵심 포즈만 취한다. 추가 팔다리나 동시에 여러 동작을 하는 자세는 금지.";
}

function scenePromptMentionsSelectedCharacters(scenePrompt: string, selectedCharacters: ResolvedCharacterContext[]): boolean {
  const normalizedScenePrompt = scenePrompt.trim().toLowerCase();
  if (!normalizedScenePrompt) return false;
  return selectedCharacters.every((character) => {
    const characterId = character.characterId.trim().toLowerCase();
    const displayName = character.displayName.trim().toLowerCase();
    return (characterId && normalizedScenePrompt.includes(characterId)) || (displayName && normalizedScenePrompt.includes(displayName));
  });
}

export function buildStudioManualImagePrompt(input: {
  slide: PreparedSlide;
  slideIndex: number;
  totalSlides: number;
  publishCategory: PublishCategory;
  metadata?: StudioManualImageMascotMetadata | null;
  characterProfiles?: StudioManualImageCharacterProfile[] | null;
  availableCharacterIds?: string[];
  sceneCharacterIds?: string[];
  imageStylePrompt?: string;
  preferStyleOnlyBasePrompt?: boolean;
  projectSeed?: string;
  scenePromptOverride?: string;
  source?: StudioManualImagePrompt["source"];
  emotion?: string;
  action?: string;
  background?: string;
  props?: string;
  composition?: string;
  warning?: string;
  plannerModel?: string;
}): StudioManualImagePrompt {
  const { metadata, publishCategory, slide, slideIndex, totalSlides } = input;
  const resolvedSceneCharacterIds = (() => {
    const explicitCharacterIds = resolveManualImagePromptCharacterIds(slide);
    if (explicitCharacterIds.length > 0) return explicitCharacterIds;
    const plannerSelectedCharacterIds = Array.from(
      new Set((Array.isArray(input.sceneCharacterIds) ? input.sceneCharacterIds : []).map((value) => normalizeCharacterId(value)).filter(Boolean))
    );
    if (plannerSelectedCharacterIds.length > 0) return plannerSelectedCharacterIds;
    const normalizedProfiles = normalizeCharacterProfiles(input.characterProfiles);
    if (normalizedProfiles.length === 1) return [normalizedProfiles[0]!.characterId];
    return [];
  })();
  const availableCharacterIds = Array.from(
    new Set(
      (Array.isArray(input.availableCharacterIds) ? input.availableCharacterIds : [])
        .map((characterId) => normalizeCharacterId(characterId))
        .filter(Boolean)
    )
  );
  const selectedCharacters = resolveCharacterContexts({
    slide,
    publishCategory,
    characterProfiles: input.characterProfiles,
    projectSeed: input.projectSeed,
    characterIds: resolvedSceneCharacterIds,
  });
  const availableCharacters = resolveCharacterContexts({
    slide,
    publishCategory,
    characterProfiles: input.characterProfiles,
    projectSeed: input.projectSeed,
    characterIds:
      availableCharacterIds.length > 0
        ? availableCharacterIds
        : resolvedSceneCharacterIds,
  });
  const characterIds = selectedCharacters.map((character) => character.characterId);
  const characterNames = selectedCharacters.map((character) => character.displayName);
  const characterSummary = characterNames.join(" / ");
  const hasCharacterDrivenPrompt = availableCharacters.length > 0;
  const preferStyleOnlyBasePrompt = input.preferStyleOnlyBasePrompt === true;
  const mascotName = characterSummary || (preferStyleOnlyBasePrompt ? `${toCategoryLabel(publishCategory)} 작업 스타일` : resolveMascotName(metadata, publishCategory));
  const usesFallbackMascot =
    hasCharacterDrivenPrompt
      ? availableCharacters.some((character) => character.isFallback) || !hasCustomMascotProfile(metadata)
      : preferStyleOnlyBasePrompt
        ? false
        : !hasCustomMascotProfile(metadata);
  const basePrompt = hasCharacterDrivenPrompt
    ? buildCharacterDrivenBasePrompt({
        publishCategory,
        metadata,
        availableCharacters,
        selectedCharacters,
        imageStylePrompt: input.imageStylePrompt,
      })
    : preferStyleOnlyBasePrompt
      ? buildStyleOnlyBasePrompt({
          publishCategory,
          metadata,
          imageStylePrompt: input.imageStylePrompt,
        })
    : buildStudioManualMascotBasePrompt({
        publishCategory,
        metadata,
        imageStylePrompt: input.imageStylePrompt,
      });
  const legacyFallbackScenePrompt = [
    `현재 슬라이드 핵심 상황: ${extractSlideSummary(slide) || `슬라이드 ${slideIndex + 1} 장면`}.`,
    `감정/행동: ${inferEmotionAndAction(slide)}.`,
    `배경/소품: ${inferBackgroundAndProps(slide, publishCategory)}.`,
    `구도: ${inferComposition(slideIndex, totalSlides, slide)}.`,
    inferPoseGuardrail(slide, 1),
    "조건: same mascot identity, single mascot focus, no text, no watermark.",
  ].join(" ");
  const styleOnlyFallbackScenePrompt = [
    `현재 슬라이드 핵심 상황: ${extractSlideSummary(slide) || `슬라이드 ${slideIndex + 1} 장면`}.`,
    `감정/행동: ${inferEmotionAndAction(slide)}.`,
    `배경/소품: ${inferBackgroundAndProps(slide, publishCategory)}.`,
    `구도: ${inferComposition(slideIndex, totalSlides, slide)}.`,
    inferPoseGuardrail(slide, 1),
    "조건: same art style across the project, no text, no watermark, do not introduce a channel mascot identity.",
  ].join(" ");
  const characterDrivenScenePrompt = [
    `현재 슬라이드 핵심 상황: ${extractSlideSummary(slide) || `슬라이드 ${slideIndex + 1} 장면`}.`,
    `등장 캐릭터: ${characterSummary}.`,
    `감정/행동: ${inferEmotionAndAction(slide)}.`,
    `배경/소품: ${inferBackgroundAndProps(slide, publishCategory)}.`,
    `구도: ${inferComposition(slideIndex, totalSlides, slide)}.`,
    inferPoseGuardrail(slide, selectedCharacters.length),
    `조건: same art style, keep ${characterSummary} visually consistent across the project, no text, no watermark.`,
  ].join(" ");
  const hasSceneCharacters = selectedCharacters.length > 0;
  const fallbackScenePrompt = hasSceneCharacters
    ? characterDrivenScenePrompt
    : preferStyleOnlyBasePrompt || hasCharacterDrivenPrompt
      ? styleOnlyFallbackScenePrompt
      : legacyFallbackScenePrompt;
  const normalizedScenePromptOverride = normalizePromptText(input.scenePromptOverride, 800);
  const scenePrompt =
    normalizedScenePromptOverride
      ? [
          hasSceneCharacters && !scenePromptMentionsSelectedCharacters(normalizedScenePromptOverride, selectedCharacters)
            ? `등장 캐릭터: ${characterSummary}.`
            : "",
          normalizedScenePromptOverride,
          inferPoseGuardrail(slide, Math.max(1, selectedCharacters.length)),
        ]
          .filter(Boolean)
          .join(" ")
      : fallbackScenePrompt;
  const primaryAnchorCharacter = hasSceneCharacters
    ? selectedCharacters.find((character) => character.anchorImageUrl || character.anchorAssetId)
    : availableCharacters.find((character) => character.anchorImageUrl || character.anchorAssetId);
  const anchorImageUrl =
    primaryAnchorCharacter?.anchorImageUrl ||
    (!hasSceneCharacters ? normalizePromptText(metadata?.mascotAnchorImageUrl, 400) : "") ||
    undefined;
  const anchorAssetId =
    primaryAnchorCharacter?.anchorAssetId ||
    (!hasSceneCharacters ? normalizePromptText(metadata?.mascotAnchorAssetId, 120) : "") ||
    undefined;

  return {
    source: input.source || "fallback",
    mascotName,
    characterIds: characterIds.length > 0 ? characterIds : undefined,
    characterNames: characterNames.length > 0 ? characterNames : undefined,
    characterSummary: characterSummary || undefined,
    basePrompt,
    scenePrompt,
    finalPrompt: appendAiImageOutputConstraints(
      `[Base character/style prompt]\n${basePrompt}\n\n[Per-slide scene prompt]\n${scenePrompt}`
    ),
    emotion: normalizePromptText(input.emotion, 160) || undefined,
    action: normalizePromptText(input.action, 180) || undefined,
    background: normalizePromptText(input.background, 180) || undefined,
    props: normalizePromptText(input.props, 180) || undefined,
    composition: normalizePromptText(input.composition, 180) || undefined,
    anchorImageUrl,
    anchorAssetId,
    usesFallbackMascot,
    warning: normalizePromptText(input.warning, 400) || undefined,
    plannerModel: normalizePromptText(input.plannerModel, 80) || undefined,
  };
}
