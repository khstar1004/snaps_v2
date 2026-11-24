import { rebuildDialogueSegmentsForEditedLines } from "./use-studio-slide-edit-actions";

type JsonObject = Record<string, unknown>;
type JsonArray = unknown[];

export type StudioSceneStructureScene = {
  index: number;
  title: string;
  lines: string[];
};

export type StudioSceneStructureReadModel = {
  scenes: StudioSceneStructureScene[];
};

export type StudioSceneStructureEdit =
  | { type: "update-title"; sceneIndex: number; title: string }
  | { type: "update-line"; sceneIndex: number; lineIndex: number; text: string }
  | { type: "split-line"; sceneIndex: number; lineIndex: number; offset?: number }
  | { type: "merge-line-with-previous"; sceneIndex: number; lineIndex: number }
  | { type: "merge-line-with-next"; sceneIndex: number; lineIndex: number }
  | { type: "add-scene"; afterSceneIndex?: number; scene?: Partial<Omit<StudioSceneStructureScene, "index">> }
  | { type: "delete-scene"; sceneIndex: number }
  | { type: "move-scene"; fromSceneIndex: number; toSceneIndex: number };

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseStudioJson(jsonText: string): JsonObject | null {
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    return isJsonObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function stringifyStudioJson(source: JsonObject, slides: JsonArray): string {
  return JSON.stringify({ ...source, slides }, null, 2);
}

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\r/g, "").trim();
}

function joinLines(lines: string[]): string {
  return lines.map((line) => normalizeText(line)).filter(Boolean).join(" ").trim();
}

function ensureLines(lines: string[], fallback?: unknown): string[] {
  const normalized = lines.map((line) => normalizeText(line)).filter(Boolean);
  if (normalized.length > 0) return normalized;
  const fallbackText = normalizeText(fallback);
  return [fallbackText || "새 장면"];
}

function getSceneLines(slide: JsonObject): string[] {
  if (Array.isArray(slide.lines)) {
    const lines = ensureLines(slide.lines.map((line) => normalizeText(line)), slide.text);
    if (lines.length > 0) return lines;
  }
  return ensureLines([], slide.text || slide.title);
}

function getSlides(source: JsonObject): JsonArray | null {
  return Array.isArray(source.slides) ? source.slides : null;
}

function getSlideObject(slides: JsonArray, sceneIndex: number): JsonObject | null {
  if (!Number.isInteger(sceneIndex) || sceneIndex < 0 || sceneIndex >= slides.length) return null;
  const slide = slides[sceneIndex];
  return isJsonObject(slide) ? slide : null;
}

function rebuildCaptionCues(captionCues: unknown, lines: string[]): unknown {
  if (!Array.isArray(captionCues)) return captionCues;
  return lines.map((text, index) => {
    const existing = captionCues[index];
    return isJsonObject(existing) ? { ...existing, text } : { text };
  });
}

function rebuildCaptionCuesForSplit(
  captionCues: unknown,
  previousLines: string[],
  nextLines: string[],
  lineIndex: number
): unknown {
  if (!Array.isArray(captionCues) || captionCues.length !== previousLines.length) {
    return rebuildCaptionCues(captionCues, nextLines);
  }
  const sourceCue = captionCues[lineIndex];
  const toCue = (text: string) => (isJsonObject(sourceCue) ? { ...sourceCue, text } : { text });
  return [
    ...captionCues.slice(0, lineIndex),
    toCue(nextLines[lineIndex] || ""),
    toCue(nextLines[lineIndex + 1] || ""),
    ...captionCues.slice(lineIndex + 1),
  ];
}

function rebuildCaptionCuesForMerge(
  captionCues: unknown,
  previousLines: string[],
  nextLines: string[],
  leftIndex: number
): unknown {
  if (!Array.isArray(captionCues) || captionCues.length !== previousLines.length) {
    return rebuildCaptionCues(captionCues, nextLines);
  }
  const leftCue = captionCues[leftIndex];
  const rightCue = captionCues[leftIndex + 1];
  const sourceCue = isJsonObject(leftCue) ? leftCue : rightCue;
  const mergedCue = isJsonObject(sourceCue)
    ? { ...sourceCue, text: nextLines[leftIndex] || "" }
    : { text: nextLines[leftIndex] || "" };
  return [
    ...captionCues.slice(0, leftIndex),
    mergedCue,
    ...captionCues.slice(leftIndex + 2),
  ];
}

function sameRoute(left: JsonObject, right: JsonObject): boolean {
  const key = (segment: JsonObject) =>
    JSON.stringify({
      type: normalizeText(segment.type || "narration"),
      speakerId: normalizeText(segment.speakerId),
      voice: normalizeText(segment.voice),
      speed: Number.isFinite(Number(segment.speed)) ? Number(segment.speed) : "default",
      pauseAfterMs: Number.isFinite(Number(segment.pauseAfterMs)) ? Number(segment.pauseAfterMs) : 0,
      volume: Number.isFinite(Number(segment.volume)) ? Number(segment.volume) : "default",
    });
  return key(left) === key(right);
}

function getDialogueSegments(slide: JsonObject): JsonObject[] {
  return Array.isArray(slide.dialogueSegments)
    ? slide.dialogueSegments.filter(isJsonObject).filter((segment) => normalizeText(segment.text))
    : [];
}

function rebuildSegmentsForLines(slide: JsonObject, lines: string[]): unknown {
  const rebuilt = rebuildDialogueSegmentsForEditedLines(slide.dialogueSegments as never, lines) as unknown;
  return rebuilt;
}

function rebuildSegmentsForSplit(slide: JsonObject, previousLines: string[], nextLines: string[], lineIndex: number): unknown {
  const segments = getDialogueSegments(slide);
  if (segments.length === previousLines.length && segments[lineIndex]) {
    return [
      ...segments.slice(0, lineIndex),
      { ...segments[lineIndex], text: nextLines[lineIndex] },
      { ...segments[lineIndex], text: nextLines[lineIndex + 1] },
      ...segments.slice(lineIndex + 1),
    ];
  }
  if (segments.length === 1 && previousLines.length === 1) {
    return [
      { ...segments[0], text: nextLines[0] },
      { ...segments[0], text: nextLines[1] },
    ];
  }
  return rebuildSegmentsForLines(slide, nextLines);
}

function rebuildSegmentsForMerge(
  slide: JsonObject,
  previousLines: string[],
  nextLines: string[],
  leftIndex: number,
  mergedText: string
): unknown {
  const segments = getDialogueSegments(slide);
  const leftSegment = segments[leftIndex];
  const rightSegment = segments[leftIndex + 1];
  if (segments.length === previousLines.length && leftSegment && rightSegment) {
    if (sameRoute(leftSegment, rightSegment)) {
      return [
        ...segments.slice(0, leftIndex),
        { ...leftSegment, text: mergedText },
        ...segments.slice(leftIndex + 2),
      ];
    }
    return [
      ...segments.slice(0, leftIndex),
      { ...leftSegment, text: previousLines[leftIndex] },
      { ...rightSegment, text: previousLines[leftIndex + 1] },
      ...segments.slice(leftIndex + 2),
    ];
  }
  return rebuildSegmentsForLines(slide, nextLines);
}

function remapIndexedRows(value: unknown, key: string, resolveIndex: (index: number) => number): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (!isJsonObject(item)) return item;
    const parsedIndex = Number(item[key]);
    if (!Number.isInteger(parsedIndex) || parsedIndex < 0) return item;
    return { ...item, [key]: resolveIndex(parsedIndex) };
  });
}

function remapSlideLineMetadata(slide: JsonObject, resolveIndex: (index: number) => number): JsonObject {
  const next: JsonObject = {
    ...slide,
    sfxPlan: remapIndexedRows(slide.sfxPlan, "lineIndex", resolveIndex),
    imageBeats: remapIndexedRows(slide.imageBeats, "startLineIndex", resolveIndex),
  };
  const imageVariantStartLineIndex = Number(slide.imageVariantStartLineIndex);
  if (Number.isInteger(imageVariantStartLineIndex) && imageVariantStartLineIndex >= 0) {
    next.imageVariantStartLineIndex = resolveIndex(imageVariantStartLineIndex);
  }
  return next;
}

function updateSlideTextFields(slide: JsonObject, lines: string[], dialogueSegments?: unknown): JsonObject {
  const nextLines = ensureLines(lines, slide.text || slide.title);
  const text = joinLines(nextLines);
  const next: JsonObject = {
    ...slide,
    text,
    lines: nextLines,
    captionCues: rebuildCaptionCues(slide.captionCues, nextLines),
  };
  if (dialogueSegments !== undefined) next.dialogueSegments = dialogueSegments;
  return next;
}

function splitTextAtOffset(text: string, offset?: number): [string, string] | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  if (Number.isInteger(offset) && Number(offset) > 0 && Number(offset) < normalized.length) {
    const left = normalized.slice(0, Number(offset)).trim();
    const right = normalized.slice(Number(offset)).trim();
    if (left && right) return [left, right];
  }
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const pivot = Math.ceil(words.length / 2);
    const left = words.slice(0, pivot).join(" ").trim();
    const right = words.slice(pivot).join(" ").trim();
    if (left && right) return [left, right];
  }
  if (normalized.length < 2) return null;
  const pivot = Math.ceil(normalized.length / 2);
  const left = normalized.slice(0, pivot).trim();
  const right = normalized.slice(pivot).trim();
  return left && right ? [left, right] : null;
}

function mapSlide(
  jsonText: string,
  source: JsonObject,
  sceneIndex: number,
  resolve: (slide: JsonObject, slides: JsonArray) => JsonObject | null
): string {
  const slides = getSlides(source);
  if (!slides) return jsonText;
  const slide = getSlideObject(slides, sceneIndex);
  if (!slide) return jsonText;
  const nextSlide = resolve(slide, slides);
  if (!nextSlide) return jsonText;
  const nextSlides = slides.map((item, index) => (index === sceneIndex ? nextSlide : item));
  return stringifyStudioJson(source, nextSlides);
}

export function parseStudioSceneStructure(jsonText: string): StudioSceneStructureReadModel {
  const source = parseStudioJson(jsonText);
  const slides = source ? getSlides(source) : null;
  if (!slides) return { scenes: [] };
  return {
    scenes: slides.map((slide, index) => {
      const row = isJsonObject(slide) ? slide : {};
      return {
        index,
        title: normalizeText(row.title),
        lines: getSceneLines(row),
      };
    }),
  };
}

export function updateStudioSceneTitle(jsonText: string, sceneIndex: number, title: string): string {
  const source = parseStudioJson(jsonText);
  if (!source) return jsonText;
  return mapSlide(jsonText, source, sceneIndex, (slide) => ({ ...slide, title: normalizeText(title) }));
}

export function updateStudioSceneLine(jsonText: string, sceneIndex: number, lineIndex: number, text: string): string {
  const source = parseStudioJson(jsonText);
  if (!source) return jsonText;
  return mapSlide(jsonText, source, sceneIndex, (slide) => {
    const previousLines = getSceneLines(slide);
    if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= previousLines.length) return null;
    const nextLines = ensureLines(previousLines.map((line, index) => (index === lineIndex ? text : line)), slide.text);
    return updateSlideTextFields(slide, nextLines, rebuildSegmentsForLines(slide, nextLines));
  });
}

export function splitStudioSceneLine(jsonText: string, sceneIndex: number, lineIndex: number, offset?: number): string {
  const source = parseStudioJson(jsonText);
  if (!source) return jsonText;
  return mapSlide(jsonText, source, sceneIndex, (slide) => {
    const previousLines = getSceneLines(slide);
    if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= previousLines.length) return null;
    const split = splitTextAtOffset(previousLines[lineIndex] || "", offset);
    if (!split) return null;
    const nextLines = [
      ...previousLines.slice(0, lineIndex),
      split[0],
      split[1],
      ...previousLines.slice(lineIndex + 1),
    ];
    const updated = updateSlideTextFields(
      slide,
      nextLines,
      rebuildSegmentsForSplit(slide, previousLines, nextLines, lineIndex)
    );
    return remapSlideLineMetadata(
      {
        ...updated,
        captionCues: rebuildCaptionCuesForSplit(slide.captionCues, previousLines, nextLines, lineIndex),
      },
      (index) => (index > lineIndex ? index + 1 : index)
    );
  });
}

export function mergeStudioSceneLineWithPrevious(jsonText: string, sceneIndex: number, lineIndex: number): string {
  if (!Number.isInteger(lineIndex) || lineIndex <= 0) return jsonText;
  return mergeStudioSceneLinePair(jsonText, sceneIndex, lineIndex - 1);
}

export function mergeStudioSceneLineWithNext(jsonText: string, sceneIndex: number, lineIndex: number): string {
  return mergeStudioSceneLinePair(jsonText, sceneIndex, lineIndex);
}

function mergeStudioSceneLinePair(jsonText: string, sceneIndex: number, leftIndex: number): string {
  const source = parseStudioJson(jsonText);
  if (!source) return jsonText;
  return mapSlide(jsonText, source, sceneIndex, (slide) => {
    const previousLines = getSceneLines(slide);
    if (!Number.isInteger(leftIndex) || leftIndex < 0 || leftIndex >= previousLines.length - 1) return null;
    const mergedText = joinLines([previousLines[leftIndex] || "", previousLines[leftIndex + 1] || ""]);
    if (!mergedText) return null;
    const nextLines = [
      ...previousLines.slice(0, leftIndex),
      mergedText,
      ...previousLines.slice(leftIndex + 2),
    ];
    const updated = updateSlideTextFields(
      slide,
      nextLines,
      rebuildSegmentsForMerge(slide, previousLines, nextLines, leftIndex, mergedText)
    );
    return remapSlideLineMetadata(
      {
        ...updated,
        captionCues: rebuildCaptionCuesForMerge(slide.captionCues, previousLines, nextLines, leftIndex),
      },
      (index) => (index > leftIndex + 1 ? index - 1 : index === leftIndex + 1 ? leftIndex : index)
    );
  });
}

export function addStudioScene(
  jsonText: string,
  afterSceneIndex?: number,
  scene?: Partial<Omit<StudioSceneStructureScene, "index">>
): string {
  const source = parseStudioJson(jsonText);
  if (!source) return jsonText;
  const slides = getSlides(source);
  if (!slides) return jsonText;
  const title = normalizeText(scene?.title) || "새 장면";
  const lines = ensureLines(Array.isArray(scene?.lines) ? scene.lines : [], title);
  const newSlide: JsonObject = {
    title,
    text: joinLines(lines),
    lines,
    layout: "photo+body",
    dialogueSegments: lines.map((line) => ({ type: "narration", text: line })),
  };
  const insertAt = Number.isInteger(afterSceneIndex)
    ? Math.max(0, Math.min(slides.length, Number(afterSceneIndex) + 1))
    : slides.length;
  return stringifyStudioJson(source, [...slides.slice(0, insertAt), newSlide, ...slides.slice(insertAt)]);
}

export function deleteStudioScene(jsonText: string, sceneIndex: number): string {
  const source = parseStudioJson(jsonText);
  if (!source) return jsonText;
  const slides = getSlides(source);
  if (!slides || slides.length <= 1 || !Number.isInteger(sceneIndex) || sceneIndex < 0 || sceneIndex >= slides.length) {
    return jsonText;
  }
  return stringifyStudioJson(source, slides.filter((_, index) => index !== sceneIndex));
}

export function moveStudioScene(jsonText: string, fromSceneIndex: number, toSceneIndex: number): string {
  const source = parseStudioJson(jsonText);
  if (!source) return jsonText;
  const slides = getSlides(source);
  if (
    !slides ||
    !Number.isInteger(fromSceneIndex) ||
    !Number.isInteger(toSceneIndex) ||
    fromSceneIndex < 0 ||
    fromSceneIndex >= slides.length ||
    toSceneIndex < 0 ||
    toSceneIndex >= slides.length ||
    fromSceneIndex === toSceneIndex
  ) {
    return jsonText;
  }
  const nextSlides = [...slides];
  const [moved] = nextSlides.splice(fromSceneIndex, 1);
  nextSlides.splice(toSceneIndex, 0, moved);
  return stringifyStudioJson(source, nextSlides);
}

export function applyStudioSceneStructureEdit(jsonText: string, edit: StudioSceneStructureEdit): string {
  switch (edit.type) {
    case "update-title":
      return updateStudioSceneTitle(jsonText, edit.sceneIndex, edit.title);
    case "update-line":
      return updateStudioSceneLine(jsonText, edit.sceneIndex, edit.lineIndex, edit.text);
    case "split-line":
      return splitStudioSceneLine(jsonText, edit.sceneIndex, edit.lineIndex, edit.offset);
    case "merge-line-with-previous":
      return mergeStudioSceneLineWithPrevious(jsonText, edit.sceneIndex, edit.lineIndex);
    case "merge-line-with-next":
      return mergeStudioSceneLineWithNext(jsonText, edit.sceneIndex, edit.lineIndex);
    case "add-scene":
      return addStudioScene(jsonText, edit.afterSceneIndex, edit.scene);
    case "delete-scene":
      return deleteStudioScene(jsonText, edit.sceneIndex);
    case "move-scene":
      return moveStudioScene(jsonText, edit.fromSceneIndex, edit.toSceneIndex);
    default:
      return jsonText;
  }
}
