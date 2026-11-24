import {
  isStudioGeneratedImageSource,
  normalizeStudioImageSource,
  type CrawlMode,
  type DialogueMode,
  type DialogueSegment,
  type ImageRequest,
  type ImageProviderId,
  type ImagePolicy,
  type ImageSearchTuning,
  type ImageSelection,
  type PreparedSlide,
  type PublishCategory,
  type RenderRequest,
  type SlideMediaKind,
  type SlideManualImagePrompt,
  type SfxTag,
  type SlideInput,
  type SpeakerVoiceMap,
  type StoryCharacterProfile,
  type StudioPrepareRequest,
} from "@/types/studio-json";
import { normalizeStudioSfxAutoLevel } from "@/lib/studio/sfx-auto-tuning";
import { normalizeStudioAssetSnapshotRequest } from "@/lib/studio/asset-snapshot";
import { normalizeStudioPlaybackRate } from "@/lib/studio/playback-rate";
import { parseStudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";
import type {
  StudioNativeRenderRequest,
  StudioRenderAudioOptions,
  StudioRemotionVisualInput,
  StudioRenderNarrationInput,
  StudioRenderTemplateImageLayout,
  StudioRenderTemplateLayoutApply,
  StudioRenderNarrationSegment,
  StudioRenderSfxCatalogCategory,
  StudioRenderSfxCue,
} from "@/types/studio-renderer";
import type {
  StudioCaptionCue,
  StudioCaptionCueOverrides,
} from "@/types/studio-caption";
import { normalizeStudioCaptionCueOverrides } from "@/types/studio-caption";
import type { StudioTemplatePayload } from "@/types/studio-template";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown): boolean {
  return typeof value === "boolean" ? value : false;
}

function asFiniteNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function asOptionalFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  return asFiniteNumber(value);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter(Boolean);
}

function asStringListFlexible(value: unknown): string[] {
  if (Array.isArray(value)) {
    return asStringArray(value);
  }
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function asSfxTag(value: unknown): SfxTag | undefined {
  const raw = asString(value);
  if (!raw) return undefined;
  return raw.slice(0, 40);
}

function toSlideMediaKind(value: unknown): SlideMediaKind | undefined {
  return value === "video" || value === "image" || value === "animated_image" ? value : undefined;
}

function toDialogueMode(value: unknown): DialogueMode {
  return asString(value).toLowerCase() === "dialogue" ? "dialogue" : "normal";
}

function toOptionalDialogueMode(value: unknown): DialogueMode | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return toDialogueMode(value);
}

function toTtsProvider(_value: unknown): "typecast" {
  return "typecast";
}

function parseDialogueSegments(value: unknown): DialogueSegment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const segments: DialogueSegment[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const text = asString(row.text);
    if (!text) continue;
    const speed = asOptionalFiniteNumber(row.speed);
    const pauseAfterMs = asOptionalFiniteNumber(row.pauseAfterMs);
    segments.push({
      type: asString(row.type).toLowerCase() === "quote" ? "quote" : "narration",
      text,
      speakerId: asString(row.speakerId) || undefined,
      voice: asString(row.voice) || undefined,
      ...(speed !== null ? { speed: Math.max(0.5, Math.min(2, speed)) } : {}),
      ...(pauseAfterMs !== null ? { pauseAfterMs: Math.max(0, Math.min(3000, Math.floor(pauseAfterMs))) } : {}),
    });
    if (segments.length >= 24) break;
  }
  return segments.length > 0 ? segments : undefined;
}

function parseSpeakerVoices(value: unknown): SpeakerVoiceMap | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const parsed: SpeakerVoiceMap = {};
  for (const [rawSpeakerId, rawVoice] of Object.entries(row)) {
    const speakerId = asString(rawSpeakerId);
    const voiceId = asString(rawVoice);
    if (!speakerId || !voiceId) continue;
    parsed[speakerId] = voiceId;
    if (Object.keys(parsed).length >= 16) break;
  }
  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

function toLayout(value: unknown, defaultLayout: "photo+body" = "photo+body"): "photo+body" {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "photo+body" || raw === "photo + body" || raw === "photo_body" || raw === "photo-body") {
    return "photo+body";
  }
  if (raw === "body-only" || raw === "body only" || raw === "body_only" || raw === "body") {
    return "photo+body";
  }
  return defaultLayout;
}

function toImagePolicy(value: unknown): ImagePolicy {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const source = normalizeStudioImageSource(row.source);
  return {
    source,
    allowGenerated: isStudioGeneratedImageSource(source),
    fallback: row.fallback === "error" ? "error" : "body-only",
  };
}

function toCrawlMode(value: unknown): CrawlMode {
  const raw = asString(value).toLowerCase();
  if (raw === "fun" || raw === "stock") return raw;
  return "auto";
}

function clampInteger(value: number | null, min: number, max: number): number | undefined {
  if (value === null) return undefined;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function asImageProviderArray(value: unknown): ImageProviderId[] {
  if (!Array.isArray(value)) return [];
  const providers: ImageProviderId[] = [];
  for (const item of value) {
    const raw = asString(item).toLowerCase();
    if (
      raw === "library" ||
      raw === "naver" ||
      raw === "pexels" ||
      raw === "pixabay" ||
      raw === "openverse" ||
      raw === "wikimedia" ||
      raw === "giphy"
    ) {
      if (!providers.includes(raw)) providers.push(raw);
    }
  }
  return providers;
}

function toImageSelection(value: unknown): ImageSelection | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const intent = asString(row.intent);
  const queryCandidates = asStringArray(row.queryCandidates).slice(0, 24);
  const provider = asImageProviderArray([row.provider])[0];
  const providerCandidates = asImageProviderArray(row.providerCandidates).slice(0, 8);
  const candidateOptions: NonNullable<ImageSelection["candidateOptions"]> = [];
  if (Array.isArray(row.candidateOptions)) {
    for (const item of row.candidateOptions) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const candidate = item as Record<string, unknown>;
      const candidateProvider = asImageProviderArray([candidate.provider])[0];
      const candidateId = asString(candidate.candidateId);
      const candidateImageUrl = asString(candidate.imageUrl);
      if (!candidateProvider || !candidateId || !candidateImageUrl) continue;
      const width = asFiniteNumber(candidate.width);
      const height = asFiniteNumber(candidate.height);
      candidateOptions.push({
        provider: candidateProvider,
        candidateId,
        imageUrl: candidateImageUrl,
        mediaUrl: asString(candidate.mediaUrl) || undefined,
        mediaKind: toSlideMediaKind(candidate.mediaKind),
        pageUrl: asString(candidate.pageUrl) || undefined,
        title: asString(candidate.title) || undefined,
        width: width !== null && width > 0 ? width : undefined,
        height: height !== null && height > 0 ? height : undefined,
        query: asString(candidate.query) || undefined,
      });
      if (candidateOptions.length >= 8) break;
    }
  }
  const scoreRow = row.scoreBreakdown && typeof row.scoreBreakdown === "object" && !Array.isArray(row.scoreBreakdown)
    ? (row.scoreBreakdown as Record<string, unknown>)
    : null;
  const scoreValues = scoreRow
    ? {
        semantic: asFiniteNumber(scoreRow.semantic),
        entity: asFiniteNumber(scoreRow.entity),
        freshness: asFiniteNumber(scoreRow.freshness),
        technical: asFiniteNumber(scoreRow.technical),
        policy: asFiniteNumber(scoreRow.policy),
        total: asFiniteNumber(scoreRow.total),
      }
    : null;
  const scoreBreakdown =
    scoreValues && Object.values(scoreValues).every((score) => score !== null)
      ? {
          semantic: Number(scoreValues.semantic),
          entity: Number(scoreValues.entity),
          freshness: Number(scoreValues.freshness),
          technical: Number(scoreValues.technical),
          policy: Number(scoreValues.policy),
          total: Number(scoreValues.total),
        }
      : undefined;
  const selectedQuery = asString(row.selectedQuery) || undefined;
  const selectedCandidateId = asString(row.selectedCandidateId) || undefined;
  const selectionReason = asString(row.selectionReason) || undefined;
  const hasSelectionData = Boolean(
    intent ||
      queryCandidates.length > 0 ||
      provider ||
      providerCandidates.length > 0 ||
      candidateOptions.length > 0 ||
      selectedQuery ||
      selectedCandidateId ||
      selectionReason ||
      scoreBreakdown
  );
  if (!hasSelectionData) return undefined;
  return {
    intent,
    queryCandidates,
    selectedQuery,
    provider,
    providerCandidates: providerCandidates.length > 0 ? providerCandidates : undefined,
    candidateOptions: candidateOptions.length > 0 ? candidateOptions : undefined,
    selectedCandidateId,
    selectionReason,
    scoreBreakdown,
  };
}

function toImageSearchTuning(value: unknown): ImageSearchTuning | undefined {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const parsed: ImageSearchTuning = {};
  if (typeof row.naverNoFilter === "boolean") {
    parsed.naverNoFilter = row.naverNoFilter;
  }
  const maxQueryVariants = clampInteger(asFiniteNumber(row.maxQueryVariantsPerSlide), 1, 40);
  if (typeof maxQueryVariants === "number") {
    parsed.maxQueryVariantsPerSlide = maxQueryVariants;
  }
  const maxCrawlAttempts = clampInteger(asFiniteNumber(row.maxCrawlAttemptsPerSlide), 1, 200);
  if (typeof maxCrawlAttempts === "number") {
    parsed.maxCrawlAttemptsPerSlide = maxCrawlAttempts;
  }
  const perSlideTimeBudgetMs = clampInteger(asFiniteNumber(row.perSlideTimeBudgetMs), 1000, 60000);
  if (typeof perSlideTimeBudgetMs === "number") {
    parsed.perSlideTimeBudgetMs = perSlideTimeBudgetMs;
  }
  const providers = asImageProviderArray(row.providers);
  if (providers.length > 0) {
    parsed.providers = providers;
  }
  const maxCandidatesPerProvider = clampInteger(asFiniteNumber(row.maxCandidatesPerProvider), 1, 50);
  if (typeof maxCandidatesPerProvider === "number") {
    parsed.maxCandidatesPerProvider = maxCandidatesPerProvider;
  }
  const providerTimeBudgetMs = clampInteger(asFiniteNumber(row.providerTimeBudgetMs), 500, 30000);
  if (typeof providerTimeBudgetMs === "number") {
    parsed.providerTimeBudgetMs = providerTimeBudgetMs;
  }
  if (typeof row.giphyLibraryOnly === "boolean") {
    parsed.giphyLibraryOnly = row.giphyLibraryOnly;
  }
  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

function parseManualImagePrompt(value: unknown): SlideManualImagePrompt | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const source = row.source === "codex" ? "codex" : "fallback";
  const mascotName = asString(row.mascotName);
  const basePrompt = asString(row.basePrompt);
  const scenePrompt = asString(row.scenePrompt);
  const finalPrompt = asString(row.finalPrompt);
  if (!mascotName || !basePrompt || !scenePrompt || !finalPrompt) return undefined;
  return {
    source,
    mascotName,
    characterIds: asStringArray(row.characterIds),
    characterNames: asStringArray(row.characterNames),
    characterSummary: asString(row.characterSummary) || undefined,
    basePrompt,
    scenePrompt,
    finalPrompt,
    emotion: asString(row.emotion) || undefined,
    action: asString(row.action) || undefined,
    background: asString(row.background) || undefined,
    props: asString(row.props) || undefined,
    composition: asString(row.composition) || undefined,
    anchorImageUrl: asString(row.anchorImageUrl) || undefined,
    anchorAssetId: asString(row.anchorAssetId) || undefined,
    usesFallbackMascot: row.usesFallbackMascot === true,
    warning: asString(row.warning) || undefined,
    plannerModel: asString(row.plannerModel) || undefined,
  };
}

function parseStoryCharacterProfiles(value: unknown): StoryCharacterProfile[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const profiles = value
    .map((item): StoryCharacterProfile | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const characterId = asString(row.characterId);
      if (!characterId) return null;
      const displayName = asString(row.displayName) || undefined;
      const identityPrompt = asString(row.identityPrompt) || undefined;
      const anchorImageUrl = asString(row.anchorImageUrl) || undefined;
      const anchorAssetId = asString(row.anchorAssetId) || undefined;
      return {
        characterId,
        ...(displayName ? { displayName } : {}),
        ...(identityPrompt ? { identityPrompt } : {}),
        ...(anchorImageUrl ? { anchorImageUrl } : {}),
        ...(anchorAssetId ? { anchorAssetId } : {}),
      };
    })
    .filter((item): item is StoryCharacterProfile => item !== null);
  return profiles.length > 0 ? profiles : undefined;
}

function parseCaptionCueOverrides(value: unknown): StudioCaptionCueOverrides {
  return normalizeStudioCaptionCueOverrides(value);
}

function parseCaptionCues(value: unknown): StudioCaptionCue[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cues = value
    .map((item): StudioCaptionCue | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const text = asString(row.text);
      if (!text) return null;
      return {
        text,
        overrides: parseCaptionCueOverrides(row.overrides),
      };
    })
    .filter((item): item is StudioCaptionCue => Boolean(item))
    .slice(0, 24);
  return cues.length > 0 ? cues : undefined;
}

function mapCompatCaptionStyle(style: string): StudioCaptionCueOverrides {
  switch (style) {
    case "big-emoji":
      return { style: "bubble-pink", animation: "pop", autoTag: "hook", scale: 1.28, emphasis: 1 };
    case "bounce-pop":
      return { style: "neon-pink", animation: "bounce", autoTag: "reaction", scale: 1.14, emphasis: 0.9 };
    case "highlight-blue":
      return { animation: "slide-up", autoTag: "hook", color: "#dbeafe", strokeColor: "#2563eb", glow: 0.42, emphasis: 0.82 };
    case "pop-corner":
      return { style: "bubble-pink", animation: "pop", align: "left", y: 24, scale: 0.94, autoTag: "reaction" };
    case "warning-yellow":
      return { style: "bold-yellow", animation: "pulse", autoTag: "shock", emphasis: 0.9, scale: 1.08 };
    case "cta-bounce":
      return { style: "flame-gold", animation: "bounce", autoTag: "closing", emphasis: 0.84, scale: 1.12 };
    default:
      return {};
  }
}

function toCompatSlides(row: Record<string, unknown>, fallbackTitle: string): unknown[] {
  const scenes = Array.isArray(row.scenes) ? row.scenes : [];
  return scenes.map((item, index) => {
    const scene = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const captions = Array.isArray(scene.captions) ? scene.captions : [];
    const cueTexts = captions
      .map((caption) => (caption && typeof caption === "object" ? asString((caption as Record<string, unknown>).text) : ""))
      .filter(Boolean);
    const captionCues = captions
      .map((caption): StudioCaptionCue | null => {
        if (!caption || typeof caption !== "object") return null;
        const captionRow = caption as Record<string, unknown>;
        const text = asString(captionRow.text);
        if (!text) return null;
        return {
          text,
          overrides: mapCompatCaptionStyle(asString(captionRow.style)),
        };
      })
      .filter((cue): cue is StudioCaptionCue => Boolean(cue));
    const clip = asString(scene.clip);
    const mediaKind = clip ? toSlideMediaKind(/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(clip) ? "video" : "image") : undefined;
    return {
      text: cueTexts.join(" ").trim(),
      lines: cueTexts,
      captionCues,
      mediaUrl: clip || undefined,
      imageUrl: mediaKind === "image" ? clip || undefined : undefined,
      mediaKind,
      groupId: index,
      stepIndex: 0,
    };
  });
}

function toSlide(
  value: unknown,
  fallbackTitle: string,
  options?: { forbidLegacySlideFields?: boolean; slideIndex?: number }
): SlideInput | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (options?.forbidLegacySlideFields) {
    const slideLabel = Number.isFinite(options.slideIndex) ? `slides[${options.slideIndex}]` : "slides[]";
    if ("title" in row) {
      throw new Error(`${slideLabel}.title은 금지 필드입니다. 최상위 title만 사용해 주세요.`);
    }
    if ("layout" in row) {
      throw new Error(`${slideLabel}.layout은 금지 필드입니다. 레이아웃은 서버 기본값(photo+body)으로 처리됩니다.`);
    }
  }
  const text = asString(row.text);
  const narrationText = asString(row.narrationText) || undefined;
  const ttsVoiceId = asString(row.ttsVoiceId) || undefined;
  const dialogueSegments = parseDialogueSegments(row.dialogueSegments);
  const characterIds = asStringArray(row.characterIds);
  const lines = asStringArray(row.lines);
  const captionCues = parseCaptionCues(row.captionCues);
  const safeText = text || lines.join(" ").trim();
  if (!safeText) return null;

  const imageRequestRow =
    row.imageRequest && typeof row.imageRequest === "object"
      ? (row.imageRequest as Record<string, unknown>)
      : null;
  const imageRequestQuery = imageRequestRow ? asString(imageRequestRow.query) : "";
  const queryCandidates = imageRequestRow ? asStringArray(imageRequestRow.queryCandidates) : [];
  const normalizedCandidates = imageRequestQuery
    ? [imageRequestQuery, ...queryCandidates.filter((candidate) => candidate !== imageRequestQuery)]
    : queryCandidates;
  const people = imageRequestRow ? asStringArray(imageRequestRow.people) : [];
  const preferredProviders = imageRequestRow ? asImageProviderArray(imageRequestRow.preferredProviders) : [];
  const scene = imageRequestRow ? asString(imageRequestRow.scene) : "";
  const orientation =
    imageRequestRow?.orientation === "portrait" ||
    imageRequestRow?.orientation === "landscape" ||
    imageRequestRow?.orientation === "any"
      ? imageRequestRow.orientation
      : "any";
  const resolvedQuery = imageRequestQuery || normalizedCandidates[0] || "";
  const hasImageRequestHint = Boolean(resolvedQuery || normalizedCandidates.length > 0 || people.length > 0 || scene);
  const imageRequestPlannerSource: ImageRequest["plannerSource"] | undefined =
    imageRequestRow?.plannerSource === "fallback" ||
    imageRequestRow?.plannerSource === "codex" ||
    imageRequestRow?.plannerSource === "heuristic" ||
    imageRequestRow?.plannerSource === "manual"
      ? imageRequestRow.plannerSource
      : undefined;
  const imageRequest: SlideInput["imageRequest"] = hasImageRequestHint
    ? {
        query: resolvedQuery,
        queryCandidates: normalizedCandidates,
        preferredProviders,
        people,
        scene: scene || undefined,
        orientation,
        mustAvoid: asStringListFlexible(imageRequestRow?.mustAvoid),
        plannerSource: imageRequestPlannerSource,
      }
    : undefined;
  const imageUrl = asString(row.imageUrl) || undefined;
  const resolvedImageUrl = asString(row.resolvedImageUrl) || undefined;
  const resolvedBy: SlideInput["resolvedBy"] =
    row.resolvedBy === "direct" || row.resolvedBy === "crawl" || row.resolvedBy === "fallback"
      ? row.resolvedBy
      : undefined;
  const imageSelection = toImageSelection(row.imageSelection);
  const mediaUrl = asString(row.mediaUrl) || undefined;
  const mediaKind = toSlideMediaKind(row.mediaKind);
  const manualImagePrompt = parseManualImagePrompt(row.manualImagePrompt);
  const rawImageBeats = Array.isArray(row.imageBeats) ? row.imageBeats : [];
  const imageBeats = rawImageBeats
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const beatRow = item as Record<string, unknown>;
      const beatId = asString(beatRow.beatId) || `beat-${index + 1}`;
      const startLineIndexRaw = asFiniteNumber(beatRow.startLineIndex);
      if (startLineIndexRaw === null || startLineIndexRaw < 0) return null;
      const beatImageRequestRow =
        beatRow.imageRequest && typeof beatRow.imageRequest === "object"
          ? (beatRow.imageRequest as Record<string, unknown>)
          : null;
      const beatImageRequestQuery = beatImageRequestRow ? asString(beatImageRequestRow.query) : "";
      const beatQueryCandidates = beatImageRequestRow ? asStringArray(beatImageRequestRow.queryCandidates) : [];
      const beatNormalizedCandidates = beatImageRequestQuery
        ? [beatImageRequestQuery, ...beatQueryCandidates.filter((candidate) => candidate !== beatImageRequestQuery)]
        : beatQueryCandidates;
      const beatPeople = beatImageRequestRow ? asStringArray(beatImageRequestRow.people) : [];
      const beatPreferredProviders = beatImageRequestRow ? asImageProviderArray(beatImageRequestRow.preferredProviders) : [];
      const beatScene = beatImageRequestRow ? asString(beatImageRequestRow.scene) : "";
      const beatOrientation: "portrait" | "landscape" | "any" =
        beatImageRequestRow?.orientation === "portrait" ||
        beatImageRequestRow?.orientation === "landscape" ||
        beatImageRequestRow?.orientation === "any"
          ? beatImageRequestRow.orientation
          : "any";
      const beatResolvedQuery = beatImageRequestQuery || beatNormalizedCandidates[0] || "";
      const hasBeatImageRequestHint = Boolean(
        beatResolvedQuery || beatNormalizedCandidates.length > 0 || beatPeople.length > 0 || beatScene
      );
      const beatPlannerSource: ImageRequest["plannerSource"] | undefined =
        beatImageRequestRow?.plannerSource === "fallback" ||
        beatImageRequestRow?.plannerSource === "codex" ||
        beatImageRequestRow?.plannerSource === "heuristic" ||
        beatImageRequestRow?.plannerSource === "manual"
          ? beatImageRequestRow.plannerSource
          : undefined;
      const beatResolvedBy: SlideInput["resolvedBy"] =
        beatRow.resolvedBy === "direct" || beatRow.resolvedBy === "crawl" || beatRow.resolvedBy === "fallback"
          ? beatRow.resolvedBy
          : undefined;
      return {
        beatId,
        startLineIndex: Math.max(0, Math.floor(startLineIndexRaw)),
        clearVisual: beatRow.clearVisual === true ? true : undefined,
        imageUrl: asString(beatRow.imageUrl) || undefined,
        resolvedImageUrl: asString(beatRow.resolvedImageUrl) || undefined,
        resolvedBy: beatResolvedBy,
        imageSelection: toImageSelection(beatRow.imageSelection),
        mediaUrl: asString(beatRow.mediaUrl) || undefined,
        mediaKind: toSlideMediaKind(beatRow.mediaKind),
        imageRequest: hasBeatImageRequestHint
          ? {
              query: beatResolvedQuery,
              queryCandidates: beatNormalizedCandidates,
              preferredProviders: beatPreferredProviders,
              people: beatPeople,
              scene: beatScene || undefined,
              orientation: beatOrientation,
              mustAvoid: asStringListFlexible(beatImageRequestRow?.mustAvoid),
              plannerSource: beatPlannerSource,
            }
          : undefined,
        reason: asString(beatRow.reason) || undefined,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => a.startLineIndex - b.startLineIndex)
    .slice(0, 2);
  const rawSfxPlan = Array.isArray(row.sfxPlan) ? row.sfxPlan : [];
  const sfxPlan = rawSfxPlan
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const sfx = item as Record<string, unknown>;
      const lineIndexRaw = Number(sfx.lineIndex);
      const tag = asSfxTag(sfx.tag);
      if (!Number.isFinite(lineIndexRaw) || !tag) return null;
      const gainDbRaw = asFiniteNumber(sfx.gainDb);
      const offsetMsRaw = asFiniteNumber(sfx.offsetMs);
      const source: "auto" | "manual" | undefined =
        sfx.source === "auto" || sfx.source === "manual" ? sfx.source : undefined;
      const normalized = {
        lineIndex: Math.max(0, Math.floor(lineIndexRaw)),
        tag,
        gainDb: gainDbRaw !== null ? Math.max(-24, Math.min(12, gainDbRaw)) : undefined,
        offsetMs: offsetMsRaw !== null ? Math.max(-1200, Math.min(1200, Math.floor(offsetMsRaw))) : undefined,
      };
      return {
        ...normalized,
        ...(typeof sfx.enabled === "boolean" ? { enabled: sfx.enabled } : {}),
        ...(source ? { source } : {}),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 8);
  const sfxCueRow = row.sfxCue && typeof row.sfxCue === "object" ? (row.sfxCue as Record<string, unknown>) : null;
  const sfxCueTag = asSfxTag(sfxCueRow?.tag);
  const sfxCueGainRaw = asFiniteNumber(sfxCueRow?.gainDb);
  const sfxCueOffsetRaw = asFiniteNumber(sfxCueRow?.offsetMs);
  const sfxCueSource: "auto" | "manual" | undefined =
    sfxCueRow?.source === "auto" || sfxCueRow?.source === "manual" ? sfxCueRow.source : undefined;
  const sfxCue =
    sfxCueTag && sfxCueRow
      ? {
          enabled: sfxCueRow.enabled !== false,
          tag: sfxCueTag,
          gainDb: sfxCueGainRaw !== null ? Math.max(-24, Math.min(12, sfxCueGainRaw)) : undefined,
          offsetMs: sfxCueOffsetRaw !== null ? Math.max(-1200, Math.min(1200, Math.floor(sfxCueOffsetRaw))) : undefined,
          source: sfxCueSource,
        }
      : undefined;
  return {
    title: asString(row.title) || fallbackTitle,
    text: safeText,
    narrationText,
    ttsVoiceId,
    dialogueSegments,
    characterIds,
    lines: lines.length > 0 ? lines : [safeText],
    captionCues,
    layout: toLayout(row.layout),
    imageUrl,
    resolvedImageUrl,
    resolvedBy,
    imageSelection,
    mediaUrl,
    mediaKind,
    imageRequest,
    manualImagePrompt,
    imageBeats,
    imageVariantId: asString(row.imageVariantId) || undefined,
    imageVariantStartLineIndex: Number.isFinite(row.imageVariantStartLineIndex) ? Number(row.imageVariantStartLineIndex) : undefined,
    groupId: Number.isFinite(row.groupId) ? Number(row.groupId) : undefined,
    stepIndex: Number.isFinite(row.stepIndex) ? Number(row.stepIndex) : undefined,
    sfxPlan,
    sfxCue,
  };
}

export function parsePrepareRequest(body: unknown): StudioPrepareRequest {
  const row = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const fallbackTitle = asString(row.title);
  const slidesRaw = Array.isArray(row.slides) ? row.slides : Array.isArray(row.scenes) ? toCompatSlides(row, fallbackTitle) : [];
  const slides = slidesRaw
    .map((item, index) => toSlide(item, fallbackTitle, { forbidLegacySlideFields: true, slideIndex: index }))
    .filter((item): item is SlideInput => Boolean(item));
  if (slides.length === 0) {
    throw new Error("slides must include at least one valid slide");
  }

  const publishCategoryRaw = asString(row.publishCategory);
  const publishCategory: PublishCategory | undefined = publishCategoryRaw || undefined;
  const projectProfileSnapshot = parseStudioProjectProfileSnapshot(row.projectProfileSnapshot, { expectedCategory: publishCategory });
  if (
    typeof row.projectProfileSnapshot !== "undefined" &&
    row.projectProfileSnapshot !== null &&
    (!publishCategory || !projectProfileSnapshot)
  ) {
    throw new Error("projectProfileSnapshot is invalid or does not match publishCategory");
  }

  return {
    publishCategory,
    projectProfileSnapshot,
    codexModel: asString(row.codexModel) || undefined,
    fixedCharacterProfileId: asString(row.fixedCharacterProfileId) || undefined,
    characterProfiles: parseStoryCharacterProfiles(row.characterProfiles),
    imageStylePrompt: asString(row.imageStylePrompt) || undefined,
    videoMode: row.videoMode === "segments" ? "segments" : "singleAudio",
    mode: toOptionalDialogueMode(row.mode),
    ttsProvider: toTtsProvider(row.ttsProvider),
    ttsSourceText: asString(row.ttsSourceText) || undefined,
    ttsVoiceId: asString(row.ttsVoiceId) || undefined,
    narrationVoice: asString(row.narrationVoice) || undefined,
    quoteVoice: asString(row.quoteVoice) || undefined,
    speakerVoices: parseSpeakerVoices(row.speakerVoices),
    imagePolicy: toImagePolicy(row.imagePolicy),
    crawlMode: toCrawlMode(row.crawlMode),
    imageSearchTuning: toImageSearchTuning(row.imageSearchTuning),
    imagePlannerHint: asString(row.imagePlannerHint) || undefined,
    sfxCategories: asStringArray(row.sfxCategories),
    sfxAutoLevel: normalizeStudioSfxAutoLevel(row.sfxAutoLevel),
    debugImageSearch: asBoolean(row.debugImageSearch),
    slides,
  };
}

export function parseRenderRequest(body: unknown): RenderRequest {
  const row = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const fallbackTitle = asString(row.title);
  const slidesRaw = Array.isArray(row.slides) ? row.slides : Array.isArray(row.scenes) ? toCompatSlides(row, fallbackTitle) : [];
  const slides = slidesRaw
    .map((item) => toSlide(item, fallbackTitle))
    .filter((item): item is SlideInput => Boolean(item))
    .map(
      (slide): PreparedSlide => ({
        ...slide,
        resolvedImageUrl: slide.resolvedImageUrl || slide.imageUrl,
        resolvedBy: slide.resolvedBy || (slide.imageUrl ? "direct" : undefined),
        imageSelection: slide.imageSelection,
      })
    );

  if (slides.length === 0) {
    throw new Error("slides must include at least one valid slide");
  }

  return {
    publishCategory: asString(row.publishCategory) || undefined,
    videoMode: row.videoMode === "segments" ? "segments" : "singleAudio",
    mode: toOptionalDialogueMode(row.mode),
    ttsProvider: toTtsProvider(row.ttsProvider),
    ttsSourceText: asString(row.ttsSourceText) || undefined,
    ttsVoiceId: asString(row.ttsVoiceId) || undefined,
    typecastEmotionType: asString(row.typecastEmotionType) || undefined,
    typecastSpeed:
      asFiniteNumber(row.typecastSpeed) !== null
        ? Math.max(0.5, Math.min(2, Number(asFiniteNumber(row.typecastSpeed))))
        : undefined,
    narrationVoice: asString(row.narrationVoice) || undefined,
    quoteVoice: asString(row.quoteVoice) || undefined,
    speakerVoices: parseSpeakerVoices(row.speakerVoices),
    slides,
  };
}

function parseRenderSfxCue(value: unknown): StudioRenderSfxCue | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const tag = asSfxTag(row.tag);
  if (!tag) return null;
  const frameIndexRaw = asFiniteNumber(row.frameIndex);
  const startMsRaw = asFiniteNumber(row.startMs);
  const gainDbRaw = asFiniteNumber(row.gainDb);
  const offsetMsRaw = asFiniteNumber(row.offsetMs);
  return {
    cueId: asString(row.cueId) || undefined,
    frameIndex: frameIndexRaw !== null ? Math.max(0, Math.floor(frameIndexRaw)) : undefined,
    startMs: startMsRaw !== null ? Math.max(0, Math.floor(startMsRaw)) : undefined,
    enabled: row.enabled === false ? false : true,
    tag,
    gainDb: gainDbRaw !== null ? Math.max(-24, Math.min(12, gainDbRaw)) : undefined,
    offsetMs: offsetMsRaw !== null ? Math.max(-1200, Math.min(1200, Math.floor(offsetMsRaw))) : undefined,
  };
}

function parseRenderSfxCatalog(value: unknown): StudioRenderSfxCatalogCategory[] {
  if (!Array.isArray(value)) return [];
  const categories: StudioRenderSfxCatalogCategory[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const id = asString(row.id);
    if (!id) continue;
    const filesRaw = Array.isArray(row.files) ? row.files : [];
    const files: StudioRenderSfxCatalogCategory["files"] = [];
    for (const file of filesRaw) {
      if (!file || typeof file !== "object") continue;
      const fileRow = file as Record<string, unknown>;
      const path = asString(fileRow.path);
      if (!path) continue;
      const fileId = asString(fileRow.id);
      const gainRaw = asFiniteNumber(fileRow.defaultGainDb);
      files.push({
        id: fileId || undefined,
        path,
        defaultGainDb: gainRaw !== null ? Math.max(-24, Math.min(12, gainRaw)) : undefined,
      });
      if (files.length >= 80) {
        break;
      }
    }
    if (files.length <= 0) continue;
    categories.push({
      id: id.slice(0, 80),
      files,
    });
    if (categories.length >= 40) {
      break;
    }
  }
  return categories;
}

function parseStudioRenderAudioOptions(value: unknown): StudioRenderAudioOptions | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const sfxCuesRaw = Array.isArray(row.sfxCues) ? row.sfxCues : [];
  const sfxCues = sfxCuesRaw.map((cue) => parseRenderSfxCue(cue)).filter((cue): cue is StudioRenderSfxCue => Boolean(cue)).slice(0, 40);
  const sfxCatalog = parseRenderSfxCatalog(row.sfxCatalog);
  const parsed: StudioRenderAudioOptions = {
    playbackRate:
      asFiniteNumber(row.playbackRate) !== null
        ? normalizeStudioPlaybackRate(row.playbackRate)
        : undefined,
    bgmEnabled: typeof row.bgmEnabled === "boolean" ? row.bgmEnabled : undefined,
    bgmPath: asString(row.bgmPath) || undefined,
    mixPresetId: asString(row.mixPresetId) || undefined,
    bgmVolume: asFiniteNumber(row.bgmVolume) ?? undefined,
    sfxEnabled: typeof row.sfxEnabled === "boolean" ? row.sfxEnabled : undefined,
    sfxMasterGainDb: asFiniteNumber(row.sfxMasterGainDb) ?? undefined,
    sfxCues,
    sfxCatalog,
  };
  return parsed;
}

function asUnitInterval(value: unknown, fallback: number): number {
  const num = asFiniteNumber(value);
  if (num === null) return fallback;
  return Math.max(0, Math.min(1, num));
}

function parseRenderLayoutRect(value: unknown, fallback: StudioRenderTemplateImageLayout["titleSlot"]) {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const x = asUnitInterval(row.x, fallback.x);
  const y = asUnitInterval(row.y, fallback.y);
  const wRaw = asFiniteNumber(row.w);
  const hRaw = asFiniteNumber(row.h);
  const w = Math.max(0.05, Math.min(1, wRaw ?? fallback.w));
  const h = Math.max(0.04, Math.min(1, hRaw ?? fallback.h));
  return {
    x,
    y,
    w: Math.min(1 - x, w),
    h: Math.min(1 - y, h),
  };
}

function parseStudioRenderTemplateImageLayout(value: unknown): StudioRenderTemplateImageLayout | undefined {
  if (!value || typeof value !== "object") return undefined;
  const baseRow = value as Record<string, unknown>;
  const fallback: StudioRenderTemplateImageLayout = {
    headerTitleSlot: { x: 0.09, y: 0.018, w: 0.62, h: 0.04 },
    headerAccentSlot: { x: 0.62, y: 0.018, w: 0.28, h: 0.04 },
    titleSlot: { x: 0.09, y: 0.1, w: 0.82, h: 0.07 },
    bodySlot: { x: 0.09, y: 0.25, w: 0.82, h: 0.18 },
    imageSlot: { x: 0.09, y: 0.47, w: 0.82, h: 0.38 },
    infoSlot: { x: 0.09, y: 0.152, w: 0.82, h: 0.03 },
    headerTitleColor: "#ffffff",
    headerAccentColor: "rgba(255,255,255,0.9)",
    titleColor: "#ffffff",
    bodyColor: "#ffffff",
    infoColor: "rgba(255,255,255,0.92)",
    titleAlign: "center",
    bodyAlign: "center",
    headerSize: 17,
    titleSize: 46,
    bodySize: 26,
    infoSize: 15,
  };
  const row =
    Number((baseRow.headerTitleSlot as Record<string, unknown> | undefined)?.x) === 0.09 &&
    Number((baseRow.headerTitleSlot as Record<string, unknown> | undefined)?.y) === 0.018 &&
    Number((baseRow.headerTitleSlot as Record<string, unknown> | undefined)?.w) === 0.42 &&
    Number((baseRow.headerTitleSlot as Record<string, unknown> | undefined)?.h) === 0.04 &&
    Number((baseRow.infoSlot as Record<string, unknown> | undefined)?.x) === 0.09 &&
    Number((baseRow.infoSlot as Record<string, unknown> | undefined)?.y) === 0.175 &&
    Number((baseRow.infoSlot as Record<string, unknown> | undefined)?.w) === 0.82 &&
    Number((baseRow.infoSlot as Record<string, unknown> | undefined)?.h) === 0.035
      ? {
          ...baseRow,
          headerTitleSlot: fallback.headerTitleSlot,
          headerAccentSlot: fallback.headerAccentSlot,
          titleSlot: fallback.titleSlot,
          bodySlot: fallback.bodySlot,
          imageSlot: fallback.imageSlot,
          infoSlot: fallback.infoSlot,
        }
      : baseRow;
  const titleAlign = row.titleAlign === "left" || row.titleAlign === "right" ? row.titleAlign : "center";
  const bodyAlign = row.bodyAlign === "left" || row.bodyAlign === "right" ? row.bodyAlign : "center";
  const headerTitleWeight = asFiniteNumber(row.headerTitleWeight);
  const headerAccentWeight = asFiniteNumber(row.headerAccentWeight);
  const titleWeight = asFiniteNumber(row.titleWeight);
  const bodyWeight = asFiniteNumber(row.bodyWeight);
  const infoWeight = asFiniteNumber(row.infoWeight);
  return {
    headerTitleSlot: parseRenderLayoutRect(row.headerTitleSlot, fallback.headerTitleSlot),
    headerAccentSlot: parseRenderLayoutRect(row.headerAccentSlot, fallback.headerAccentSlot),
    titleSlot: parseRenderLayoutRect(row.titleSlot, fallback.titleSlot),
    bodySlot: parseRenderLayoutRect(row.bodySlot, fallback.bodySlot),
    imageSlot: parseRenderLayoutRect(row.imageSlot, fallback.imageSlot),
    infoSlot: parseRenderLayoutRect(row.infoSlot, fallback.infoSlot),
    headerTitleColor: asString(row.headerTitleColor) || fallback.headerTitleColor,
    headerAccentColor: asString(row.headerAccentColor) || fallback.headerAccentColor,
    titleColor: asString(row.titleColor) || fallback.titleColor,
    bodyColor: asString(row.bodyColor) || fallback.bodyColor,
    infoColor: asString(row.infoColor) || fallback.infoColor,
    titleAlign,
    bodyAlign,
    headerSize: Math.max(10, Math.min(32, asFiniteNumber(row.headerSize) ?? fallback.headerSize)),
    titleSize: Math.max(10, Math.min(52, asFiniteNumber(row.titleSize) ?? fallback.titleSize)),
    bodySize: Math.max(9, Math.min(36, asFiniteNumber(row.bodySize) ?? fallback.bodySize)),
    infoSize: Math.max(8, Math.min(24, asFiniteNumber(row.infoSize) ?? fallback.infoSize)),
    headerTitleWeight: typeof headerTitleWeight === "number" ? Math.max(100, Math.min(900, headerTitleWeight)) : undefined,
    headerAccentWeight: typeof headerAccentWeight === "number" ? Math.max(100, Math.min(900, headerAccentWeight)) : undefined,
    titleWeight: typeof titleWeight === "number" ? Math.max(100, Math.min(900, titleWeight)) : undefined,
    bodyWeight: typeof bodyWeight === "number" ? Math.max(100, Math.min(900, bodyWeight)) : undefined,
    infoWeight: typeof infoWeight === "number" ? Math.max(100, Math.min(900, infoWeight)) : undefined,
  };
}

function parseStudioRenderTemplateLayoutApply(value: unknown): StudioRenderTemplateLayoutApply | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  return {
    title: typeof row.title === "boolean" ? row.title : true,
    body: typeof row.body === "boolean" ? row.body : true,
    image: typeof row.image === "boolean" ? row.image : true,
    info: typeof row.info === "boolean" ? row.info : true,
  };
}

function parseStudioRemotionVisualInput(value: unknown): StudioRemotionVisualInput | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const slidesRaw = Array.isArray(row.slides) ? row.slides : [];
  const slides = slidesRaw
    .map((item, index) => toSlide(item, `슬라이드 ${index + 1}`))
    .filter((item): item is PreparedSlide => Boolean(item));
  if (slides.length <= 0) return undefined;
  const brandingRow = row.branding && typeof row.branding === "object" ? (row.branding as Record<string, unknown>) : null;
  if (!brandingRow) {
    throw new Error("visuals.branding is required");
  }
  const templateId = row.templateId === "black" ? "black" : "default";
  const headerColor = asString(brandingRow.headerColor);
  const footerColor = asString(brandingRow.footerColor);
  const fontFamily = asString(brandingRow.fontFamily);
  if (!headerColor || !footerColor || !fontFamily) {
    throw new Error("visuals.branding is incomplete");
  }
  const templateImageEnabled = typeof row.templateImageEnabled === "boolean" ? row.templateImageEnabled : undefined;
  const templateImageLayout = parseStudioRenderTemplateImageLayout(row.templateImageLayout);
  const templateLayoutApply = parseStudioRenderTemplateLayoutApply(row.templateLayoutApply);
  if (typeof templateImageEnabled !== "boolean") {
    throw new Error("visuals.templateImageEnabled is required");
  }
  if (!templateImageLayout) {
    throw new Error("visuals.templateImageLayout is required");
  }
  if (!templateLayoutApply) {
    throw new Error("visuals.templateLayoutApply is required");
  }
  const branding = {
    headerTitle: asString(brandingRow.headerTitle),
    headerAccentText: asString(brandingRow.headerAccentText),
    headerColor,
    footerColor,
    infoLineText: asString(brandingRow.infoLineText) || "",
    fontFamily,
    imageRounded: typeof brandingRow.imageRounded === "boolean" ? brandingRow.imageRounded : true,
  };
  return {
    slides,
    branding,
    templateId,
    templateData: row.templateData && typeof row.templateData === "object" ? (row.templateData as StudioTemplatePayload) : undefined,
    templateImageEnabled,
    templateImageUrl: asString(row.templateImageUrl) || undefined,
    templateImageLayout,
    templateLayoutApply,
  };
}

export function parseStudioNativeRenderRequest(body: unknown): StudioNativeRenderRequest {
  const row = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const narrationRow = row.narration && typeof row.narration === "object" ? (row.narration as Record<string, unknown>) : null;
  const fallbackFullAudio = asString(row.fullAudio);
  const parseNarrationSegment = (value: unknown, index: number): StudioRenderNarrationSegment | null => {
    if (!value || typeof value !== "object") return null;
    const segmentRow = value as Record<string, unknown>;
    const audioBase64 = asString(segmentRow.audioBase64);
    if (!audioBase64) return null;
    const groupIdRaw = asFiniteNumber(segmentRow.groupId);
    const durationMsRaw = asFiniteNumber(segmentRow.durationMs);
    const pauseAfterMsRaw = asOptionalFiniteNumber(segmentRow.pauseAfterMs);
    const trimStartMsRaw = asFiniteNumber(segmentRow.trimStartMs);
    const trimEndMsRaw = asFiniteNumber(segmentRow.trimEndMs);
    return {
      segmentId: asString(segmentRow.segmentId) || `segment-${index + 1}`,
      groupId: groupIdRaw !== null ? Math.max(0, Math.floor(groupIdRaw)) : index,
      audioBase64,
      durationMs: durationMsRaw !== null ? Math.max(1, Math.floor(durationMsRaw)) : 1,
      pauseAfterMs:
        pauseAfterMsRaw !== null ? Math.max(0, Math.min(3000, Math.floor(pauseAfterMsRaw))) : undefined,
      mimeType:
        asString(segmentRow.mimeType) === "audio/wav"
          ? "audio/wav"
          : asString(segmentRow.mimeType) === "audio/mpeg"
            ? "audio/mpeg"
            : undefined,
      format:
        asString(segmentRow.format) === "wav"
          ? "wav"
          : asString(segmentRow.format) === "mp3"
            ? "mp3"
            : undefined,
      trimStartMs: trimStartMsRaw !== null ? Math.max(0, Math.floor(trimStartMsRaw)) : undefined,
      trimEndMs: trimEndMsRaw !== null ? Math.max(1, Math.floor(trimEndMsRaw)) : undefined,
    };
  };

  let narration: StudioRenderNarrationInput | null = null;
  const narrationMode = asString(narrationRow?.mode);
  if (narrationMode === "segments") {
    const segmentsRaw = Array.isArray(narrationRow?.segments) ? narrationRow?.segments : [];
    const segments = segmentsRaw
      .map((segment, index) => parseNarrationSegment(segment, index))
      .filter((segment): segment is StudioRenderNarrationSegment => Boolean(segment))
      .slice(0, 200);
    if (segments.length <= 0) {
      throw new Error("narration.segments is required");
    }
    const crossfadeRaw = Array.isArray(narrationRow?.crossfadeMsByBoundary) ? narrationRow?.crossfadeMsByBoundary : [];
    const crossfadeMsByBoundary = crossfadeRaw
      .map((value) => asFiniteNumber(value))
      .filter((value): value is number => value !== null && value >= 0)
      .map((value) => Math.max(0, Math.min(1000, Math.floor(value))))
      .slice(0, Math.max(0, segments.length - 1));
    narration = {
      mode: "segments",
      segments,
      crossfadeMsByBoundary,
    };
  } else if (narrationMode === "segmentsRef") {
    const narrationRef = asString(narrationRow?.narrationRef);
    if (!narrationRef) {
      throw new Error("narration.narrationRef is required");
    }
    narration = {
      mode: "segmentsRef",
      narrationRef,
    };
  } else {
    const fullAudio = asString(narrationRow?.fullAudio) || fallbackFullAudio;
    if (!fullAudio) {
      throw new Error("narration.fullAudio is required");
    }
    narration = {
      mode: "singleAudio",
      fullAudio,
      fullAudioMimeType:
        asString(narrationRow?.fullAudioMimeType) === "audio/wav"
          ? "audio/wav"
          : asString(narrationRow?.fullAudioMimeType) === "audio/mpeg"
            ? "audio/mpeg"
            : undefined,
      fullAudioFormat:
        asString(narrationRow?.fullAudioFormat) === "wav"
          ? "wav"
          : asString(narrationRow?.fullAudioFormat) === "mp3"
            ? "mp3"
            : undefined,
    };
  }
  const fullAudio = fallbackFullAudio || (narration.mode === "singleAudio" ? narration.fullAudio : "");

  const visuals = parseStudioRemotionVisualInput(row.visuals);
  if (!visuals) {
    throw new Error("visuals is required");
  }
  const durationMsRaw = asFiniteNumber(row.durationMs);
  if (durationMsRaw === null || durationMsRaw <= 0) {
    throw new Error("durationMs must be a positive number");
  }
  const frameDurationsSecRaw = Array.isArray(row.frameDurationsSec) ? row.frameDurationsSec : [];
  const frameDurationsSec = frameDurationsSecRaw
    .map((value) => asFiniteNumber(value))
    .filter((value): value is number => value !== null && value > 0)
    .slice(0, visuals.slides.length);
  const expectedFrameCount = visuals.slides.length;
  if (frameDurationsSec.length !== expectedFrameCount) {
    throw new Error("frameDurationsSec length must match render frame count");
  }
  const metaRow = row.meta && typeof row.meta === "object" ? (row.meta as Record<string, unknown>) : null;
  const assetRow = row.asset && typeof row.asset === "object" ? (row.asset as Record<string, unknown>) : null;
  const metaEstimatedRaw = asFiniteNumber(metaRow?.estimatedMb);
  const metaFallbackRaw = asFiniteNumber(metaRow?.fallbackAttempt);
  const selectedRendererRaw = metaRow?.selectedRenderer;
  const selectedRenderer =
    selectedRendererRaw === "server_native" || selectedRendererRaw === "client_wasm"
      ? selectedRendererRaw
      : undefined;
  return {
    fullAudio,
    narration,
    durationMs: Math.max(1, Math.floor(durationMsRaw)),
    frameDurationsSec,
    audioOptions: parseStudioRenderAudioOptions(row.audioOptions),
    visuals,
    asset: assetRow
      ? {
          title: asString(assetRow.title) || undefined,
          publishCategory: asString(assetRow.publishCategory) || undefined,
          studioSnapshot: normalizeStudioAssetSnapshotRequest(assetRow.studioSnapshot) || undefined,
        }
      : undefined,
    meta: metaRow
      ? {
          requestId: asString(metaRow.requestId) || undefined,
          selectedRenderer,
          heavyJob: typeof metaRow.heavyJob === "boolean" ? metaRow.heavyJob : undefined,
          estimatedMb: metaEstimatedRaw !== null ? Math.max(0, metaEstimatedRaw) : undefined,
          fallbackAttempt: metaFallbackRaw !== null ? Math.max(0, Math.floor(metaFallbackRaw)) : undefined,
        }
      : undefined,
  };
}
