import { promises as fs } from 'fs';

// process.pid plus a millisecond is not unique: two writes in the same tick
// produced the same temp path, one renamed it away and the other's rename
// then failed with ENOENT. Measured at five concurrent activity records.
let writeSequence = 0;

/**
 * Writes a JSON file by filling a temporary file and renaming it into place, so
 * a crash mid-write leaves the previous file intact rather than a truncated one.
 *
 * This was five byte-identical private copies, one per snaps store, and all
 * five leaked: when the rename failed the temporary file stayed on disk for
 * good. On Windows a rename onto a target another process holds open fails with
 * EPERM, so a locked file quietly grew the data directory by one orphan per
 * attempt. Clean up before rethrowing.
 */
export async function writeJsonFileAtomically(
  filePath: string,
  content: string
): Promise<void> {
  writeSequence += 1;
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${writeSequence}.tmp`;
  await fs.writeFile(tmpPath, content, 'utf8');
  try {
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    await fs.rm(tmpPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
