import { ServiceUnavailableException } from '@nestjs/common';
import {
  refreshSnapsUnreadableStores,
  SnapsUnreadableStore,
} from '@gitroom/nestjs-libraries/snaps/storage/warn-unreadable-file';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Where the six snaps JSON stores live.
 *
 * The same expression appears in each store service; this is the one the health
 * probe uses, and it has to agree with them or the probe checks a directory
 * nothing writes to.
 */
export function snapsDataDir(): string {
  return process.env.SNAPS_DATA_DIR || path.join(process.cwd(), 'var', 'snaps');
}

export interface SnapsDataDirHealth {
  dataDir: string;
  writable: boolean;
  error?: string;
  /**
   * Stores that failed to read. A writable directory says nothing about a
   * damaged file inside it, and that file shows on screen as a confident
   * empty list - which reads as data loss rather than as a fault.
   */
  unreadable?: SnapsUnreadableStore[];
}

/**
 * Whether the store directory can actually be written.
 *
 * Nothing checked this, and a directory that cannot be used is invisible at
 * every layer. Measured with a plain file sitting where the directory should
 * be:
 *
 * - health reported the configured path and nothing else, so it looked fine;
 * - every read returned `[]` with **no warning at all** - Windows answers
 *   ENOENT for a path under a file, and ENOENT is exactly the code that means
 *   "this store has not been written yet", which is a legitimate empty state;
 * - the first save threw a raw EEXIST out of `mkdir`.
 *
 * So an operator with a misconfigured `SNAPS_DATA_DIR` saw an empty workspace,
 * concluded their library was gone, and learned the truth only by trying to
 * save. A probe here turns that into a line on the health card they already
 * watch.
 */
export async function snapsDataDirHealth(): Promise<SnapsDataDirHealth> {
  const dataDir = snapsDataDir();
  const probe = path.join(dataDir, `.snaps-write-probe-${process.pid}`);
  // Reported on both branches: a directory that cannot be written and a
  // file that cannot be read are separate faults, and the second one
  // survives the first being fixed.
  const unreadable = await refreshSnapsUnreadableStores();
  const damaged = unreadable.length ? { unreadable } : {};
  try {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(probe, 'ok', 'utf8');
    await fs.rm(probe, { force: true });
    return { dataDir, writable: true, ...damaged };
  } catch (error) {
    return {
      dataDir,
      writable: false,
      error: error instanceof Error ? error.message : String(error),
      ...damaged,
    };
  }
}

/**
 * Creates the store directory, or fails with something the operator can act on.
 *
 * Five services each called `fs.mkdir(this.dataDir, { recursive: true })` - the
 * same copy-paste the atomic writer had before it was unified - and a failure
 * there left the route throwing a plain `Error`. Nest turns anything that is
 * not an HttpException into a 500 whose body says only "Internal server
 * error", so the operator was told nothing at all: not the path, not the
 * reason, not that a directory was the problem.
 *
 * Measured with a file sitting where the directory should be: the route threw
 * `EEXIST: file already exists, mkdir '...'`, and the client received
 * `{"statusCode":500,"message":"Internal server error"}`.
 */
export async function ensureSnapsDataDir(dataDir: string): Promise<void> {
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ServiceUnavailableException(
      `snaps 저장 폴더를 사용할 수 없습니다: ${dataDir} (${reason}). ` +
        'SNAPS_DATA_DIR 설정과 폴더 권한을 확인하세요.'
    );
  }
}
