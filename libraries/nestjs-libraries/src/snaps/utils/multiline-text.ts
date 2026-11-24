/**
 * Normalizes user-authored post bodies without destroying their layout.
 * Horizontal whitespace inside a line collapses, line breaks survive, and
 * runs of blank lines shrink to a single paragraph break.
 */
export const cleanSnapsMultilineText = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return '';
  }
  return String(value)
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
};
