import { BadRequestException, Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import path from 'path';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';

export type SnapsActivityType =
  | 'transform'
  | 'draft'
  | 'rag'
  | 'source'
  | 'report'
  | 'video'
  | 'agent'
  | 'inbox'
  | 'delete';

export type SnapsActivityLogEntry = {
  id: string;
  organizationId: string;
  type: SnapsActivityType;
  title: string;
  detail?: Record<string, unknown>;
  createdAt: string;
};

const snapsActivityTypes: SnapsActivityType[] = [
  'transform',
  'draft',
  'rag',
  'source',
  'report',
  'video',
  'agent',
  'inbox',
  'delete',
];

@Injectable()
export class SnapsActivityLogService {
  private readonly dataDir =
    process.env.SNAPS_DATA_DIR || path.join(process.cwd(), 'var', 'snaps');

  async record(
    organizationId: string,
    entry: Omit<SnapsActivityLogEntry, 'id' | 'organizationId' | 'createdAt'>
  ) {
    const current = await this.list(organizationId);
    const next = this.normalizeImportedEntry(organizationId, {
      ...entry,
      id: makeId(14),
      createdAt: new Date().toISOString(),
    });
    if (!next) {
      throw new BadRequestException('snaps activity type and title are required.');
    }
    await this.write(organizationId, [next, ...current].slice(0, 500));
    return next;
  }

  async list(organizationId: string) {
    try {
      const file = await fs.readFile(this.filePath(organizationId), 'utf8');
      const parsed = JSON.parse(file);
      if (!Array.isArray(parsed)) {
        return [] as SnapsActivityLogEntry[];
      }
      return parsed
        .map((entry) => this.normalizeImportedEntry(organizationId, entry))
        .filter((entry): entry is SnapsActivityLogEntry => !!entry);
    } catch {
      return [] as SnapsActivityLogEntry[];
    }
  }

  async importEntries(organizationId: string, entries: unknown[] = []) {
    const current = await this.list(organizationId);
    const incoming = entries
      .map((entry) => this.normalizeImportedEntry(organizationId, entry))
      .filter((entry): entry is SnapsActivityLogEntry => !!entry);
    const merged = this.mergeById([...incoming, ...current]).slice(0, 500);
    await this.write(organizationId, merged);
    return {
      imported: incoming.length,
      total: merged.length,
    };
  }

  private async write(organizationId: string, entries: SnapsActivityLogEntry[]) {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.atomicWrite(
      this.filePath(organizationId),
      JSON.stringify(entries, null, 2)
    );
  }

  private filePath(organizationId: string) {
    const safeOrg = organizationId.replace(/[^a-zA-Z0-9_-]/g, '_');
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
    if (!title || !snapsActivityTypes.includes(type as SnapsActivityType)) {
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

  private async atomicWrite(filePath: string, content: string) {
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmpPath, content, 'utf8');
    await fs.rename(tmpPath, filePath);
  }

  private cleanRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
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

    return raw.trim().replace(/\s+/g, ' ').slice(0, maxLength);
  }
}
