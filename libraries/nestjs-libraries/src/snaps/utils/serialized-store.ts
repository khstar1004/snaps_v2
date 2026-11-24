import { AsyncLocalStorage } from 'async_hooks';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';

/**
 * snaps keeps per-organization JSON stores that are updated with
 * read-modify-write. Without serialization, two concurrent requests read the
 * same snapshot and the later write silently drops the earlier change.
 * Serialization is per process; a multi-instance deployment needs the
 * database-backed stores instead.
 */
const heldKeys = new AsyncLocalStorage<ReadonlySet<string>>();
const queueTails = new Map<string, Promise<void>>();

export const runSnapsSerialized = async <T>(
  key: string,
  task: () => Promise<T>
): Promise<T> => {
  const held = heldKeys.getStore();
  if (held?.has(key)) {
    // Re-entrant call from a method that already holds this key.
    return task();
  }

  const previous = queueTails.get(key) || Promise.resolve();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  queueTails.set(key, tail);

  await previous;
  try {
    return await heldKeys.run(new Set([...(held || []), key]), task);
  } finally {
    release();
    if (queueTails.get(key) === tail) {
      queueTails.delete(key);
    }
  }
};

/**
 * Serializes a store-mutating method per service class and organization
 * (the first argument). Methods of the same class may call each other.
 */
export function SnapsSerialized(): MethodDecorator {
  return (target, propertyKey, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (...args: unknown[]) => Promise<unknown>;
    const scope = `${target.constructor.name}:`;
    descriptor.value = function (this: unknown, ...args: unknown[]) {
      const organizationId = typeof args[0] === 'string' ? args[0] : '*';
      return runSnapsSerialized(`${scope}${organizationId}`, () =>
        original.apply(this, args)
      );
    };
    return descriptor;
  };
}

const retryableRenameCodes = new Set(['EPERM', 'EBUSY', 'EACCES']);

/**
 * Writes through a unique temp file and renames it into place. Windows can
 * refuse the rename while a reader has the target open, so it retries briefly.
 */
export const writeSnapsFileAtomic = async (filePath: string, content: string) => {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(tmpPath, content, 'utf8');
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(tmpPath, filePath);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code || '';
      if (!retryableRenameCodes.has(code) || attempt >= 5) {
        await fs.rm(tmpPath, { force: true }).catch(() => undefined);
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
};
