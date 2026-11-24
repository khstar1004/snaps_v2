import { Injectable } from '@nestjs/common';
import path from 'path';
import { promises as fs } from 'fs';
import { withJsonFileLock } from '@gitroom/nestjs-libraries/snaps/storage/json-file-lock';
import { writeJsonFileAtomically } from '@gitroom/nestjs-libraries/snaps/storage/atomic-json-write';
import { preserveUnreadableJsonFile } from '@gitroom/nestjs-libraries/snaps/storage/preserve-unreadable-file';
import { warnUnreadableJsonFile } from '@gitroom/nestjs-libraries/snaps/storage/warn-unreadable-file';
import { snapsOrgFileKey } from '@gitroom/nestjs-libraries/snaps/storage/org-file-key';

type SnapsRenderJobOwner = {
  jobId: string;
  createdAt: string;
};

const MAX_TRACKED_JOBS = 500;

/**
 * Remembers which organisation asked for a render job.
 *
 * The status routes have to answer "is this job yours?" and they used to do it
 * by scanning the activity log for an entry carrying the job id. That log is
 * capped at 500 entries, newest first, so the record could age out from under a
 * job that was still rendering - and `/snaps/import` evicts the whole log in one
 * call, because importEntries merges up to 500 imported entries in front of the
 * existing ones. The operator then polled their own job and was told
 * "요청한 영상 작업을 찾을 수 없습니다".
 *
 * Ownership is not activity history, so it is kept separately. The activity log
 * stays the operator-facing record of what happened; this is the answer to one
 * authorisation question.
 *
 * Deliberately absent from /snaps/export and /snaps/import. A job id points at
 * a job on the Pixelle or Shorts-Maker instance of one deployment and lives for
 * minutes; carrying it into a backup would let the organisation it is restored
 * into poll jobs it never created, and every id would be stale by then anyway.
 */
@Injectable()
export class SnapsRenderJobOwnershipService {
  private readonly dataDir =
    process.env.SNAPS_DATA_DIR || path.join(process.cwd(), 'var', 'snaps');

  private filePath(organizationId: string) {
    return path.join(
      this.dataDir,
      `render-job-owners-${snapsOrgFileKey(organizationId)}.json`
    );
  }

  async remember(organizationId: string, jobId: string) {
    const trimmed = String(jobId || '').trim();
    if (!trimmed) {
      return;
    }

    const target = this.filePath(organizationId);
    await withJsonFileLock(target, async () => {
      const current = await this.read(organizationId);
      const next = [
        { jobId: trimmed, createdAt: new Date().toISOString() },
        ...current.filter((entry) => entry.jobId !== trimmed),
      ].slice(0, MAX_TRACKED_JOBS);

      await fs.mkdir(this.dataDir, { recursive: true });
      await preserveUnreadableJsonFile(target, new Date().toISOString());
      await writeJsonFileAtomically(target, JSON.stringify(next, null, 2));
    });
  }

  async owns(organizationId: string, jobId: string) {
    const trimmed = String(jobId || '').trim();
    if (!trimmed) {
      return false;
    }
    const current = await this.read(organizationId);
    return current.some((entry) => entry.jobId === trimmed);
  }

  private async read(organizationId: string): Promise<SnapsRenderJobOwner[]> {
    try {
      const raw = await fs.readFile(this.filePath(organizationId), 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        warnUnreadableJsonFile(
          this.filePath(organizationId),
          new Error('file does not hold a JSON array'),
          '렌더 작업 소유권'
        );
        return [];
      }
      return parsed
        .map((entry) => {
          const record =
            entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
          const jobId = String(record.jobId || '').trim();
          return jobId
            ? { jobId, createdAt: String(record.createdAt || '') }
            : undefined;
        })
        .filter((entry): entry is SnapsRenderJobOwner => !!entry);
    } catch (error) {
      warnUnreadableJsonFile(
        this.filePath(organizationId),
        error,
        '렌더 작업 소유권'
      );
      return [];
    }
  }
}
