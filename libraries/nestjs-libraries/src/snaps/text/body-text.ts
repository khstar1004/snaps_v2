import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';

/**
 * Cleans text a person wrote as a body, keeping the line breaks.
 *
 * Every snaps cleaner was `trim().replace(/\s+/g, ' ')`. `\s` includes the
 * newline, so that flattens a body into one line. For a title, a topic, a
 * platform name or an id that is right - a line break there is not content.
 * For a body it destroys what the writer meant.
 *
 * Measured against the real services, a six-line paste came back as one line in
 * all three places that store one:
 *
 *   ragExample   in=6 out=1
 *   sourceText   in=6 out=1
 *   inboxComment in=6 out=1
 *
 * The RAG style example is the sharpest: it exists to teach the model a writing
 * style, and in Korean SNS the line breaks are a large part of that style. The
 * inbox one is somebody else's writing - a customer comment stored without its
 * structure. And the source library's text is handed on to the card news and
 * RAG paths, so its paragraphs were lost everywhere downstream too.
 *
 * This lives here rather than in each service because that is how it happened:
 * the controller had its own cleaner, and so did every service, and fixing the
 * controller's left the services flattening the same field a layer down.
 *
 * Runs of spaces and tabs *inside* a line still collapse, and a run of blank
 * lines is capped at one, so a paste out of a word processor does not arrive as
 * a column of empty rows.
 *
 * Two invisible characters used to survive it, because JavaScript's `\s` does
 * not include them. Measured on the shapes a paste carries - a non-breaking
 * space, a byte order mark and the U+2028/U+2029 separators are all handled,
 * and these two were not:
 *
 * - U+200B zero-width space, which many web editors insert as a line-break
 *   hint. It reaches the published post, spends the length budget the operator
 *   cannot see, and splits a word for the platform's search.
 * - U+00AD soft hyphen, which is what a word processor leaves behind.
 *
 * U+200C and U+200D are deliberately kept: the zero-width joiner is what holds
 * an emoji family together, and stripping it turns one picture into three
 * people.
 */
export function snapsCleanBodyText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value
    .replace(/\r\n?/g, '\n')
    // Zero-width and meaningless. Not U+200C/U+200D, which join characters.
    .replace(/[\u200b\u00ad\u2060]/g, '')
    .split('\n')
    // `[^\S\n]` is "whitespace that is not a newline" - the point of the whole
    // helper, so it is spelled out rather than reached for by `\s`.
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Grapheme-safe, the same as every other clamp in snaps.
  return snapsClampText(normalized, maxLength);
}
