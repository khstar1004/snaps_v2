import { promises as fs } from 'fs';

/**
 * Moves a JSON file aside when it can no longer be parsed, so the next write
 * cannot destroy it.
 *
 * The snaps JSON stores read with `catch { return [] }`, which is right for a
 * file that does not exist yet and wrong for one that does: a truncated file -
 * a half-finished write, a disk hiccup, a partial copy - reads as "no entries",
 * and the very next record() then writes `[newEntry, ...[]]` over it. Measured
 * on the activity log: three entries, corrupt the file, write a fourth, and the
 * first three are gone from disk for good.
 *
 * Reads stay forgiving so the workspace shows an empty list rather than an
 * error. Writes call this first, so the bytes are preserved for recovery
 * instead of being overwritten.
 *
 * @returns the path the damaged file was moved to, or undefined when the file
 * is missing or healthy.
 */
export async function preserveUnreadableJsonFile(
  filePath: string,
  timestamp: string
): Promise<string | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    // Missing, or unreadable at the OS level - there is nothing to move, and a
    // permission problem will surface on the write itself.
    return undefined;
  }

  try {
    if (Array.isArray(JSON.parse(raw))) {
      return undefined;
    }
  } catch {
    // Not parseable - fall through and preserve it.
  }

  const quarantined = `${filePath}.corrupt-${timestamp.replace(/[:.]/g, '-')}`;
  try {
    await fs.rename(filePath, quarantined);
    // Every one of the seven call sites discarded this path, so the bytes were
    // saved and nobody was told where. An operator looking at a store that
    // went empty had no way to find the copy that still held their entries.
    console.warn(
      `[snaps storage] ${filePath} could not be parsed, so it was moved to ` +
        `${quarantined} before being rewritten. The entries it held are in ` +
        'that file.'
    );
  } catch {
    // If it cannot be moved, leave it alone rather than pretending it was
    // saved; the caller's write may still fail, which is the honest outcome.
    return undefined;
  }
  return quarantined;
}
