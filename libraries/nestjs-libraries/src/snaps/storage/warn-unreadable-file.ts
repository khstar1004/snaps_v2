import { promises as fs } from 'fs';

/**
 * Says once, in the log, that a snaps JSON store could not be read.
 *
 * The stores read with `catch { return [] }` on purpose: a file that does not
 * exist yet is the normal first-run state, and the workspace should show an
 * empty list rather than an error. The cost of that forgiveness is that a
 * damaged file looks exactly like an empty one. An operator seeing an empty
 * library re-creates the content, and the next write quarantines the old file
 * under `.corrupt-<timestamp>` - correct, but nothing ever pointed at it.
 *
 * Worse is the case where nobody writes. The list reads empty, the operator
 * closes the workspace, and the damaged file is never mentioned at all.
 *
 * A missing file stays silent, because that is not a fault. Anything else -
 * unparseable contents, a permission error, a directory where a file belongs -
 * is reported with the path, so the quarantined copy can be found.
 */
export type SnapsUnreadableStore = {
  /** The Korean name of the library, as the log line uses it. */
  label: string;
  path: string;
  reason: string;
};

/**
 * What could not be read this process, keyed the same way the log is.
 *
 * The doc above names the case this closes: nobody writes, so the file is
 * never quarantined, the list reads empty, and the only trace is a line in
 * the server log that no one is watching. The health route reads this so
 * the workspace can say it, instead of showing a confident zero.
 */
const warned = new Map<string, SnapsUnreadableStore>();

export function warnUnreadableJsonFile(
  filePath: string,
  error: unknown,
  label: string
): boolean {
  const code = (error as { code?: string } | undefined)?.code;
  if (code === 'ENOENT') {
    return false;
  }

  // Once per file per process. These reads happen on every list call, and a
  // workspace that polls would otherwise bury the rest of the log.
  const key = `${label}:${filePath}`;
  const reason = error instanceof Error ? error.message : String(error);
  if (warned.has(key)) {
    return false;
  }
  warned.set(key, { label, path: filePath, reason });
  console.warn(
    `[snaps storage] ${label} could not be read from ${filePath}, so it is ` +
      `showing as empty. The next write moves this file aside as ` +
      `${filePath}.corrupt-<timestamp> instead of overwriting it. Reason: ${reason}`
  );
  return true;
}

/**
 * Every store that failed to read since this process started.
 *
 * Only populated once something tried, which is honest: a file nobody has
 * opened has not been shown as empty either. The stores are read on every
 * list call, so a workspace that has drawn the library has already asked.
 */
export function snapsUnreadableStores(): SnapsUnreadableStore[] {
  return [...warned.values()];
}

/**
 * Drops entries whose file reads cleanly now, and returns what is left.
 *
 * Without this the memory is a history, not a state: an operator who
 * repaired the file would keep being told it was broken until the process
 * restarted - worse in a health card than in a log, because the card is
 * still on screen.
 *
 * Readable means what every snaps store means by it: the file parses and
 * holds a JSON array. Parsing alone would clear a file that still reads as
 * empty everywhere else.
 */
export async function refreshSnapsUnreadableStores(): Promise<
  SnapsUnreadableStore[]
> {
  for (const [key, entry] of [...warned.entries()]) {
    try {
      const parsed = JSON.parse(await fs.readFile(entry.path, 'utf8'));
      if (Array.isArray(parsed)) {
        warned.delete(key);
      }
    } catch {
      // Still unreadable, or gone. A file that was quarantined and not
      // replaced is ENOENT here - which the read path treats as the
      // normal first-run state, so it stops being a fault.
      if (!(await fileExists(entry.path))) {
        warned.delete(key);
      }
    }
  }
  return snapsUnreadableStores();
}

async function fileExists(target: string) {
  try {
    await fs.stat(target);
    return true;
  } catch {
    return false;
  }
}

/** Test seam: the once-per-file memory is process-wide by design. */
export function resetSnapsUnreadableWarnings() {
  warned.clear();
}
