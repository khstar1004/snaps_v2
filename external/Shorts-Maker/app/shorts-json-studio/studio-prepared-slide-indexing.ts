import type { PreparedSlide } from "@/types/studio-json";

export function buildPreparedSlideSourceIndexMap(slides: PreparedSlide[]): number[] {
  const sourceIndexByGroupId = new Map<number, number>();
  const sourceIndexes: number[] = [];
  let nextSourceIndex = 0;

  for (const slide of slides) {
    if (Number.isFinite(slide.groupId)) {
      const groupId = Number(slide.groupId);
      let sourceIndex = sourceIndexByGroupId.get(groupId);
      if (sourceIndex === undefined) {
        sourceIndex = nextSourceIndex;
        sourceIndexByGroupId.set(groupId, sourceIndex);
        nextSourceIndex += 1;
      }
      sourceIndexes.push(sourceIndex);
      continue;
    }

    sourceIndexes.push(nextSourceIndex);
    nextSourceIndex += 1;
  }

  return sourceIndexes;
}

export function getPreparedSlideSourceIndex(slides: PreparedSlide[], preparedIndex: number): number | null {
  if (!Number.isInteger(preparedIndex) || preparedIndex < 0 || preparedIndex >= slides.length) return null;
  return buildPreparedSlideSourceIndexMap(slides)[preparedIndex] ?? null;
}
