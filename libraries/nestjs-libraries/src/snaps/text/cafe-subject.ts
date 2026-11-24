import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';

/**
 * UTF-16 units a Naver Cafe post title may use.
 *
 * The same 80 the three places that derived this title were already using; the
 * number is not the thing that was wrong.
 */
export const SNAPS_CAFE_SUBJECT_LIMIT = 80;

/**
 * The title a Naver Cafe post is published under.
 *
 * This decision existed three times: in the workspace, where the subject is put
 * into the variant's settings; in the publishing payload builder, which fills
 * it in when the workspace did not; and in the provider, which cleans whatever
 * arrives before sending it. The first two are the same decision and they had
 * already drifted - the builder clamped the supplied title to 80 and the
 * workspace passed it through whole - and the workspace still cut with a plain
 * `.slice(0, 80)`, which counts UTF-16 units and can cut an emoji in half.
 *
 * The provider's clamp cannot repair that: a broken pair sitting inside the
 * first 80 units is not at the cut, so it passes straight through to Naver and
 * renders in the post title as a replacement character.
 */
export function snapsCafeSubject(
  supplied: unknown,
  content: unknown
): string {
  const flatten = (value: unknown) =>
    String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();

  return (
    snapsClampText(flatten(supplied), SNAPS_CAFE_SUBJECT_LIMIT) ||
    snapsClampText(flatten(content), SNAPS_CAFE_SUBJECT_LIMIT) ||
    'snaps 게시글'
  );
}
