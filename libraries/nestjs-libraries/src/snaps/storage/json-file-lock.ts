const chains = new Map<string, Promise<unknown>>();

/**
 * Serialises read-modify-write operations against one JSON store file.
 *
 * The snaps stores all read the whole file, change it in memory and write it
 * back. Two concurrent requests for the same organisation therefore both read N
 * entries and both write N+1, and one of the two entries is gone: measured at
 * two concurrent activity records, only one survived.
 *
 * This is an in-process lock. It covers the case that actually happens - one
 * backend serving concurrent HTTP requests - and does nothing for two separate
 * processes writing the same file, which would need an on-disk lock.
 */
export function withJsonFileLock<T>(
  filePath: string,
  operation: () => Promise<T>
): Promise<T> {
  const previous = chains.get(filePath) ?? Promise.resolve();
  // Run whether the previous operation resolved or rejected: one failed write
  // must not wedge the queue for every later one.
  const run = previous.then(operation, operation);
  // The map used to keep every path it had ever seen. Each store file gets its
  // own key - one per organisation per store - so a backend serving many
  // organisations grew this map for the life of the process and never gave a
  // byte back. Drop the entry once the chain has drained.
  const tail: Promise<void> = run.catch(() => undefined).then(() => {
    // Only when nothing queued behind this one. If a later call already chained
    // onto `tail`, that newer chain is the live one and deleting it here would
    // let the next caller run concurrently with it - which is the exact race
    // this lock exists to prevent.
    if (chains.get(filePath) === tail) {
      chains.delete(filePath);
    }
  });
  chains.set(filePath, tail);
  return run;
}

/**
 * How many files currently have a queue. Zero once everything has drained -
 * asserting that is the only way to tell the cleanup above still happens, since
 * a leak here is invisible until a long-running process runs out of memory.
 */
export function snapsJsonFileLockDepth(): number {
  return chains.size;
}
