export type ByteRange = { start: number; end: number };

export function parseByteRange(header: string | null | undefined, size: number): ByteRange | "unsatisfiable" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, startText, endText] = match;
  if (!startText && !endText) return null;
  if (size <= 0) return "unsatisfiable";

  let start: number;
  let end: number;
  if (!startText) {
    start = Math.max(0, size - Number(endText));
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : size - 1;
  }
  if (end > size - 1) end = size - 1;
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}
