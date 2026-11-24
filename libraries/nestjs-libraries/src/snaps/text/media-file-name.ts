import { makeId } from '@gitroom/nestjs-libraries/services/make.is';

/**
 * UTF-16 units a media library file name may use.
 *
 * Unchanged from the bound the controller applied; what changed is where it is
 * applied.
 */
import { snapsClampText } from './clamp-text';
import { snapsComposeHangul } from './compose-hangul';

const SNAPS_MEDIA_NAME_LIMIT = 120;

/**
 * The longest tail after a dot that is still an extension.
 *
 * `.mp4` and `.webm` qualify; forty characters of query-ish text do not, and
 * preserving it would cost the whole readable part of the name.
 */
const SNAPS_MEDIA_SUFFIX_LIMIT = 12;

/**
 * The name an attached video is filed under in the media library.
 *
 * The bound used to be applied to the whole name, so a long URL lost its
 * extension: measured on a 200-character path, `....mp4` came back as 120
 * characters ending in `x`. That name becomes the stored media path, and the
 * path is checked by ValidUrlExtension further down the attach flow - so a long
 * CDN URL turned into a 400 about the file type, for a file whose type was
 * never in question. Trim the stem and keep the suffix.
 *
 * Lives here rather than on the controller because it is text logic with no
 * request in it, and the controller cannot be imported into the test suite
 * without dragging the whole backend module graph behind it.
 */
export function snapsMediaFileName(url: string): string {
  const fallback = `snaps-short-${makeId(8)}.mp4`;
  try {
    const parsed = new URL(url);
    // Composed first: `가-힣` below is the composed block, and a decomposed
    // name - what a macOS filesystem hands over - filed itself as underscores.
    const cleaned = snapsComposeHangul(
      decodeURIComponent(parsed.pathname.split('/').pop() || fallback)
    ).replace(/[^\w.\-가-힣]/g, '_');

    if (!cleaned) {
      return fallback;
    }
    if (cleaned.length <= SNAPS_MEDIA_NAME_LIMIT) {
      return cleaned;
    }

    const dot = cleaned.lastIndexOf('.');
    // A tail longer than the suffix budget is not an extension. The `dot > 0`
    // half is belt-and-braces and no test can reach it: a name only gets here
    // when it is longer than the name limit, so a leading dot already leaves a
    // tail far past the suffix budget.
    const suffix =
      dot > 0 && cleaned.length - dot <= SNAPS_MEDIA_SUFFIX_LIMIT
        ? cleaned.slice(dot)
        : '';
    const stem = suffix ? cleaned.slice(0, dot) : cleaned;
    return (
      snapsClampText(stem, SNAPS_MEDIA_NAME_LIMIT - suffix.length) +
        suffix ||
      fallback
    );
  } catch {
    return fallback;
  }
}
