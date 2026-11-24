import type { PreparedSlide } from "@/types/studio-json";

type AlignmentWord = {
  startSec: number;
  endSec: number;
  charStart?: number;
  charEnd?: number;
};

function weightOfSlide(slide: PreparedSlide): number {
  const source = slide.text || slide.lines.join(" ");
  const core = source.replace(/[^\p{L}\p{N}]/gu, "");
  return Math.max(1, core.length);
}

export function buildFrameDurationsSec(slides: PreparedSlide[], totalDurationSec: number): number[] {
  if (slides.length === 0) return [];
  const safeDuration = Number.isFinite(totalDurationSec) && totalDurationSec > 0 ? totalDurationSec : 1;
  const weights = slides.map(weightOfSlide);
  const sum = weights.reduce((acc, cur) => acc + cur, 0);
  if (!Number.isFinite(sum) || sum <= 0) {
    return Array.from({ length: slides.length }, () => safeDuration / slides.length);
  }

  const durations = weights.map((weight) => (safeDuration * weight) / sum);
  const drift = safeDuration - durations.reduce((acc, cur) => acc + cur, 0);
  durations[durations.length - 1] += drift;
  return durations.map((value) => Math.max(0.001, value));
}

function frameText(slide: PreparedSlide): string {
  return (slide.text || slide.lines.join(" ")).trim();
}

function buildDeterministicFrameRanges(slides: PreparedSlide[]): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (let i = 0; i < slides.length; i += 1) {
    const text = frameText(slides[i]);
    const start = cursor;
    const end = start + text.length;
    ranges.push({ start, end });
    cursor = end + 1;
  }
  return ranges;
}

function buildWeightedCumulativeEnds(slides: PreparedSlide[], totalDurationSec: number): number[] {
  const durations = buildFrameDurationsSec(slides, totalDurationSec);
  const ends: number[] = [];
  let cursor = 0;
  for (const duration of durations) {
    cursor += duration;
    ends.push(cursor);
  }
  return ends;
}

function pickCharAlignedStart(params: {
  range: { start: number; end: number };
  characterStartTimesSec: number[];
  minStartSec: number;
}): number | null {
  const { range, characterStartTimesSec, minStartSec } = params;
  if (!Array.isArray(characterStartTimesSec) || characterStartTimesSec.length === 0) return null;
  const maxIndex = characterStartTimesSec.length - 1;
  const startIndex = Math.min(Math.max(0, range.start), maxIndex);
  const endIndex = Math.min(Math.max(startIndex, range.end - 1), maxIndex);

  for (let i = startIndex; i <= endIndex; i += 1) {
    const value = characterStartTimesSec[i];
    if (Number.isFinite(value) && value >= minStartSec) {
      return value;
    }
  }

  const lookBehindStart = Math.max(0, startIndex - 1);
  for (let i = startIndex - 1; i >= lookBehindStart; i -= 1) {
    const value = characterStartTimesSec[i];
    if (Number.isFinite(value) && value >= minStartSec) {
      return value;
    }
  }

  const lookAheadLimit = Math.min(maxIndex, endIndex + 2);
  for (let i = endIndex + 1; i <= lookAheadLimit; i += 1) {
    const value = characterStartTimesSec[i];
    if (Number.isFinite(value) && value >= minStartSec) {
      return value;
    }
  }
  return null;
}

function pickWordAlignedStart(params: {
  range: { start: number; end: number };
  words: AlignmentWord[];
  minStartSec: number;
}): number | null {
  const { range, words, minStartSec } = params;
  if (!Array.isArray(words) || words.length === 0) return null;

  for (const word of words) {
    if (!Number.isFinite(word.startSec)) continue;
    if (typeof word.charStart !== "number" || typeof word.charEnd !== "number") continue;
    if (word.charEnd <= range.start || word.charStart >= range.end) continue;
    if (word.startSec >= minStartSec) return word.startSec;
  }

  for (const word of words) {
    if (!Number.isFinite(word.startSec)) continue;
    if (typeof word.charStart !== "number" || typeof word.charEnd !== "number") continue;
    if (word.charEnd <= range.start || word.charStart >= range.end) continue;
    if (word.startSec >= 0) {
      return Math.max(minStartSec, word.startSec);
    }
  }
  return null;
}

export function buildFrameDurationsFromAlignment(params: {
  slides: PreparedSlide[];
  totalDurationSec: number;
  sourceText: string;
  words: AlignmentWord[];
  characterStartTimesSec?: number[];
  characterEndTimesSec?: number[];
}): number[] {
  const { slides, totalDurationSec, words, characterStartTimesSec } = params;
  if (slides.length === 0) return [];
  if (!Array.isArray(words) || words.length === 0) {
    return buildFrameDurationsSec(slides, totalDurationSec);
  }

  const minFrameSec = 0.001;
  const safeTotal = Number.isFinite(totalDurationSec) && totalDurationSec > 0 ? totalDurationSec : 1;
  const weightedEnds = buildWeightedCumulativeEnds(slides, safeTotal);
  const weightedStarts: number[] = Array.from({ length: slides.length }, (_, index) => (index === 0 ? 0 : weightedEnds[index - 1] || 0));
  const ranges = buildDeterministicFrameRanges(slides);

  const starts: number[] = Array.from({ length: slides.length }, () => 0);
  starts[0] = 0;

  for (let i = 1; i < ranges.length; i += 1) {
    const range = ranges[i];
    const prevStart = starts[i - 1];
    const minStartSec = prevStart + minFrameSec;
    const weightedStart = Math.max(minStartSec, weightedStarts[i] || minStartSec);
    const charAlignedStart = pickCharAlignedStart({
      range,
      characterStartTimesSec: characterStartTimesSec || [],
      minStartSec,
    });
    const wordAlignedStart = pickWordAlignedStart({
      range,
      words,
      minStartSec,
    });
    const targetStart = Number.isFinite(charAlignedStart)
      ? Number(charAlignedStart)
      : Number.isFinite(wordAlignedStart)
        ? Number(wordAlignedStart)
        : weightedStart;
    const maxStartSec = Math.max(minStartSec, safeTotal - minFrameSec * (slides.length - i));
    starts[i] = Math.min(maxStartSec, Math.max(minStartSec, targetStart));
  }

  const durations: number[] = [];
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i];
    const end = i === starts.length - 1 ? safeTotal : starts[i + 1];
    const duration = Math.max(minFrameSec, end - start);
    durations.push(duration);
  }

  const sum = durations.reduce((acc, cur) => acc + cur, 0);
  if (sum <= 0) return buildFrameDurationsSec(slides, safeTotal);
  const drift = safeTotal - sum;
  durations[durations.length - 1] = Math.max(minFrameSec, durations[durations.length - 1] + drift);
  return durations;
}
