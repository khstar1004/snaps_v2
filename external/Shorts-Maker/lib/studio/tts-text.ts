export const STUDIO_TTS_TEXT_NORMALIZATION_VERSION = "strip-parenthesized-hanja-v1";

const PARENTHESIZED_HANJA_PATTERN =
  /\(\s*\p{Script=Han}+(?:\s+\p{Script=Han}+)*\s*\)|（\s*\p{Script=Han}+(?:\s+\p{Script=Han}+)*\s*）/gu;

export type StudioTtsTextNormalization = {
  sourceText: string;
  text: string;
  sourceIndexByTextIndex: number[];
};

type StudioTtsAlignmentWord = {
  word: string;
  startSec: number;
  endSec: number;
  charStart?: number;
  charEnd?: number;
};

export function prepareStudioTtsText(value: string): StudioTtsTextNormalization {
  const sourceText = String(value || "");
  let text = "";
  const sourceIndexByTextIndex: number[] = [];
  let cursor = 0;

  for (const match of sourceText.matchAll(PARENTHESIZED_HANJA_PATTERN)) {
    const matchStart = match.index;
    for (let index = cursor; index < matchStart; index += 1) {
      text += sourceText[index];
      sourceIndexByTextIndex.push(index);
    }
    cursor = matchStart + match[0].length;
  }

  for (let index = cursor; index < sourceText.length; index += 1) {
    text += sourceText[index];
    sourceIndexByTextIndex.push(index);
  }

  const trimmedStart = text.length - text.trimStart().length;
  const trimmedEnd = text.trimEnd().length;
  return {
    sourceText,
    text: text.slice(trimmedStart, trimmedEnd),
    sourceIndexByTextIndex: sourceIndexByTextIndex.slice(trimmedStart, trimmedEnd),
  };
}

export function remapStudioTtsAlignmentToSource(
  normalization: StudioTtsTextNormalization,
  input: {
    words: StudioTtsAlignmentWord[];
    characterStartTimesSec: number[];
    characterEndTimesSec: number[];
  }
): {
  words: StudioTtsAlignmentWord[];
  characterStartTimesSec: number[];
  characterEndTimesSec: number[];
} {
  const characterStartTimesSec = Array.from({ length: normalization.sourceText.length }, () => Number.NaN);
  const characterEndTimesSec = Array.from({ length: normalization.sourceText.length }, () => Number.NaN);

  for (let index = 0; index < normalization.sourceIndexByTextIndex.length; index += 1) {
    const sourceIndex = normalization.sourceIndexByTextIndex[index];
    characterStartTimesSec[sourceIndex] = Number(input.characterStartTimesSec[index]);
    characterEndTimesSec[sourceIndex] = Number(input.characterEndTimesSec[index]);
  }

  const words = input.words.map((word) => {
    if (
      typeof word.charStart !== "number" ||
      typeof word.charEnd !== "number" ||
      word.charStart < 0 ||
      word.charEnd <= word.charStart ||
      word.charEnd > normalization.sourceIndexByTextIndex.length
    ) {
      return word;
    }
    return {
      ...word,
      charStart: normalization.sourceIndexByTextIndex[word.charStart],
      charEnd: normalization.sourceIndexByTextIndex[word.charEnd - 1] + 1,
    };
  });

  return {
    words,
    characterStartTimesSec,
    characterEndTimesSec,
  };
}
