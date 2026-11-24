import { BadRequestException, Injectable } from '@nestjs/common';
import { snapsOrgFileKey } from '@gitroom/nestjs-libraries/snaps/storage/org-file-key';
import { writeJsonFileAtomically } from '@gitroom/nestjs-libraries/snaps/storage/atomic-json-write';
import { withJsonFileLock } from '@gitroom/nestjs-libraries/snaps/storage/json-file-lock';
import { preserveUnreadableJsonFile } from '@gitroom/nestjs-libraries/snaps/storage/preserve-unreadable-file';
import { warnUnreadableJsonFile } from '@gitroom/nestjs-libraries/snaps/storage/warn-unreadable-file';
import { promises as fs } from 'fs';
import path from 'path';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';
import {
  boundStoredRecord,
  SnapsRecordBounds,
} from '@gitroom/nestjs-libraries/snaps/storage/bounded-record';
import { ensureSnapsDataDir } from '@gitroom/nestjs-libraries/snaps/storage/data-dir-health';

/**
 * The one list. It used to be two - a hand-written union here and a
 * hand-written array below that record() and the import normaliser check
 * against - and they drifted: `'card-news'` was added to the union and not to
 * the array. The compiler was satisfied either way, so nothing said anything.
 *
 * Measured against all ten types, the three card-news routes each did their
 * work and then threw on the very last line:
 *
 *   record('card-news')       -> BadRequestException
 *                                '활동 기록에는 type과 title이 필요합니다.'
 *   importEntries(ten types)  -> imported: 9, and the card-news entry gone
 *
 * /card-news/generate renders every slide image before it records, so a
 * working request answered 400 with a message about activity logging. The
 * union is derived from the array now, so the two cannot disagree again.
 */
const snapsActivityTypes = [
  'transform',
  'draft',
  'rag',
  'source',
  'report',
  'video',
  'agent',
  'inbox',
  'card-news',
  'delete',
] as const;

export type SnapsActivityType = (typeof snapsActivityTypes)[number];

export type SnapsActivityLogEntry = {
  id: string;
  organizationId: string;
  type: SnapsActivityType;
  title: string;
  detail?: Record<string, unknown>;
  createdAt: string;
};

// Far above anything real: the largest detail this codebase writes is 381
// characters with seven keys, and the demo workspace's are 37 and 41 at one
// level of nesting.
const ACTIVITY_DETAIL_BOUNDS: SnapsRecordBounds = {
  maxChars: 4000,
  maxDepth: 6,
  maxKeys: 60,
  maxItems: 100,
  maxText: 1000,
};

@Injectable()
export class SnapsActivityLogService {
  private readonly dataDir =
    process.env.SNAPS_DATA_DIR || path.join(process.cwd(), 'var', 'snaps');

  async record(
    organizationId: string,
    entry: Omit<SnapsActivityLogEntry, 'id' | 'organizationId' | 'createdAt'>
  ) {
    // Read-modify-write: without the lock two concurrent records both read the
    // same list and both wrote their own entry over it, losing one of them.
    return withJsonFileLock(this.filePath(organizationId), async () => {
    const current = await this.list(organizationId);
    const next = this.normalizeImportedEntry(organizationId, {
      ...entry,
      id: makeId(14),
      createdAt: new Date().toISOString(),
    });
    if (!next) {
      throw new BadRequestException('활동 기록에는 type과 title이 필요합니다.');
    }
    await this.write(organizationId, [next, ...current].slice(0, 500));
    return next;
    });
  }

  async list(organizationId: string) {
    try {
      const file = await fs.readFile(this.filePath(organizationId), 'utf8');
      const parsed = JSON.parse(file);
      if (!Array.isArray(parsed)) {
        warnUnreadableJsonFile(
          this.filePath(organizationId),
          new Error('file does not hold a JSON array'),
          '활동 기록'
        );
        return [] as SnapsActivityLogEntry[];
      }
      return parsed
        .map((entry) => this.normalizeImportedEntry(organizationId, entry))
        .filter((entry): entry is SnapsActivityLogEntry => !!entry);
    } catch (error) {
      warnUnreadableJsonFile(this.filePath(organizationId), error, '활동 기록');
      return [] as SnapsActivityLogEntry[];
    }
  }

  async importEntries(organizationId: string, entries: unknown[] = []) {
    // Same read-modify-write race as record().
    return withJsonFileLock(this.filePath(organizationId), async () => {
    const current = await this.list(organizationId);
    const incoming = entries
      .map((entry) => this.normalizeImportedEntry(organizationId, entry))
      .filter((entry): entry is SnapsActivityLogEntry => !!entry);
    const deduped = this.mergeById([...incoming, ...current]);
    const merged = deduped.slice(0, 500);
    await this.write(organizationId, merged);
    return {
      imported: incoming.length,
      total: merged.length,
      // Entries the cap deleted, which are the ones already stored - see
      // importSources in source-library.service.ts for the measurement.
      dropped: deduped.length - merged.length,
    };
    });
  }

  private async write(organizationId: string, entries: SnapsActivityLogEntry[]) {
    await ensureSnapsDataDir(this.dataDir);
    // The read above answers [] for a file it cannot parse, so without this a
    // truncated file would be overwritten by the next write and the entries
    // it still held would be gone for good. Move it aside first.
    const target = this.filePath(organizationId);
    await preserveUnreadableJsonFile(target, new Date().toISOString());
    await this.atomicWrite(target, JSON.stringify(entries, null, 2));
  }

  private filePath(organizationId: string) {
    // Not a plain replace: two different ids can escape to the same string
    // and share one file. See snaps/storage/org-file-key.ts.
    const safeOrg = snapsOrgFileKey(organizationId);
    return path.join(this.dataDir, `${safeOrg}.activity-log.json`);
  }

  private normalizeImportedEntry(
    organizationId: string,
    value: unknown
  ): SnapsActivityLogEntry | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const entry = value as Partial<SnapsActivityLogEntry>;
    const type = this.cleanText(entry.type, 80);
    const title = this.cleanText(entry.title, 240);
    if (
      !title ||
      !(snapsActivityTypes as readonly string[]).includes(type)
    ) {
      return undefined;
    }

    return {
      id: this.cleanText(entry.id, 160) || makeId(14),
      organizationId,
      type: type as SnapsActivityType,
      title,
      detail: this.cleanRecord(entry.detail),
      createdAt:
        typeof entry.createdAt === 'string' && entry.createdAt.trim()
          ? entry.createdAt
          : new Date().toISOString(),
    };
  }

  private mergeById(entries: SnapsActivityLogEntry[]) {
    const seen = new Set<string>();
    return entries.filter((entry) => {
      if (seen.has(entry.id)) {
        return false;
      }
      seen.add(entry.id);
      return true;
    });
  }

  // Five stores carried a byte-identical copy of this, and every copy left
  // the temporary file behind when the rename failed. Shared now; see
  // snaps/storage/atomic-json-write.ts.
  private async atomicWrite(filePath: string, content: string) {
    await writeJsonFileAtomically(filePath, content);
  }

  /**
   * An activity detail is small by nature - the largest this codebase writes is
   * 381 characters with seven keys, and the demo workspace's are 37 and 41 at
   * one level. See snaps/storage/bounded-record.ts for what this protects
   * against.
   */
  private cleanRecord(value: unknown): Record<string, unknown> | undefined {
    return boundStoredRecord(value, ACTIVITY_DETAIL_BOUNDS, '기록 상세');
  }

  private cleanText(value: unknown, maxLength = 1000) {
    let raw = '';
    if (typeof value === 'string') {
      raw = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      raw = String(value);
    } else if (Array.isArray(value)) {
      raw = value
        .map((item) => this.cleanText(item, maxLength))
        .filter(Boolean)
        .join(' ');
    }

    return snapsClampText(raw.trim().replace(/\s+/g, ' '), maxLength);
  }
}
