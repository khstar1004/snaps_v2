import { BadRequestException, Injectable } from '@nestjs/common';
import { snapsOrgFileKey } from '@gitroom/nestjs-libraries/snaps/storage/org-file-key';
import { writeJsonFileAtomically } from '@gitroom/nestjs-libraries/snaps/storage/atomic-json-write';
import { withJsonFileLock } from '@gitroom/nestjs-libraries/snaps/storage/json-file-lock';
import { preserveUnreadableJsonFile } from '@gitroom/nestjs-libraries/snaps/storage/preserve-unreadable-file';
import { warnUnreadableJsonFile } from '@gitroom/nestjs-libraries/snaps/storage/warn-unreadable-file';
import { promises as fs } from 'fs';
import path from 'path';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { SnapsAgentPrepareResult } from '@gitroom/nestjs-libraries/snaps/agent/command-planner.service';
import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';
import {
  boundStoredRecord,
  SnapsRecordBounds,
} from '@gitroom/nestjs-libraries/snaps/storage/bounded-record';
import { ensureSnapsDataDir } from '@gitroom/nestjs-libraries/snaps/storage/data-dir-health';

export type SnapsStoredAgentTaskStatus =
  | 'requires_confirmation'
  | 'completed'
  | 'error'
  | 'aborted';

export type SnapsStoredAgentTask = {
  id: string;
  organizationId: string;
  title: string;
  command: string;
  status: SnapsStoredAgentTaskStatus;
  progress: number;
  platformCount: number;
  shortVideo: boolean;
  favorite: boolean;
  rating?: number;
  ratingComment?: string;
  result: SnapsAgentPrepareResult;
  messages: Array<{
    type: 'user' | 'assistant' | 'system' | 'result';
    content: string;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

type SnapsAgentTaskListQuery = {
  page?: unknown;
  pageSize?: unknown;
  keyword?: unknown;
  favoriteOnly?: unknown;
};

const MAX_AGENT_TASKS = 200;

// A real prepared result measures 6,715 characters at depth 6.
const AGENT_RESULT_BOUNDS: SnapsRecordBounds = {
  maxChars: 400000,
  maxDepth: 12,
  maxKeys: 200,
  maxItems: 500,
  maxText: 20000,
};

@Injectable()
export class SnapsAgentTaskService {
  private readonly dataDir =
    process.env.SNAPS_DATA_DIR || path.join(process.cwd(), 'var', 'snaps');

  async createFromPrepared(
    organizationId: string,
    prepared: SnapsAgentPrepareResult
  ) {
    // Read-modify-write: without the lock two concurrent calls both read the
    // same list and each wrote its own version over it, losing the other's
    // change. Measured at 20 concurrent writes, 1 survived.
    return withJsonFileLock(this.filePath(organizationId), async () => {
      const current = await this.readTasks(organizationId);
      const now = new Date().toISOString();
      const task = this.normalizeStoredTask(organizationId, {
        id: makeId(14),
        organizationId,
        title: this.taskTitle(prepared),
        command: prepared.plan.command,
        status: 'requires_confirmation',
        progress: prepared.operation.progress,
        platformCount: prepared.plan.targetPlatforms.length,
        shortVideo: prepared.plan.includeShortVideo,
        favorite: false,
        result: prepared,
        messages: this.buildMessages(prepared, now),
        createdAt: now,
        updatedAt: now,
      });
      if (!task) {
        throw new BadRequestException('에이전트 작업 형식이 올바르지 않습니다.');
      }
      await this.writeTasks(organizationId, [task, ...current].slice(0, MAX_AGENT_TASKS));
      return task;
    });
  }

  async list(organizationId: string, query: SnapsAgentTaskListQuery = {}) {
    const page = this.cleanPage(query.page);
    const pageSize = this.cleanPageSize(query.pageSize);
    // Split, not one substring. The whole keyword had to appear contiguously,
    // which a Korean sentence almost never lets happen: searching `환절기
    // 건강관리` over `환절기에는 건강관리가 무엇보다 중요합니다` found nothing,
    // because the particle sits between the two words. Word order mattered too
    // - `카드뉴스 인스타그램` missed text holding both. Every word has to
    // appear somewhere now, each still as a substring so a particle on the end
    // does not hide it.
    const keywords = this.cleanText(query.keyword, 120)
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const favoriteOnly = query.favoriteOnly === true || query.favoriteOnly === 'true';
    const tasks = (await this.readTasks(organizationId)).filter((task) => {
      const haystack = [task.title, task.command, task.result.plan.topic || '']
        .join(' ')
        .toLowerCase();
      const matchesKeyword = keywords.every((word) => haystack.includes(word));
      return matchesKeyword && (!favoriteOnly || task.favorite);
    });
    const start = (page - 1) * pageSize;
    const list = tasks.slice(start, start + pageSize).map((task) => this.toListItem(task));

    return {
      page,
      pageSize,
      total: tasks.length,
      totalPages: Math.max(1, Math.ceil(tasks.length / pageSize)),
      list,
    };
  }

  async get(organizationId: string, taskId: string) {
    const tasks = await this.readTasks(organizationId);
    return tasks.find((task) => task.id === taskId);
  }

  async delete(organizationId: string, taskId: string) {
    // Read-modify-write: without the lock two concurrent calls both read the
    // same list and each wrote its own version over it, losing the other's
    // change. Measured at 20 concurrent writes, 1 survived.
    return withJsonFileLock(this.filePath(organizationId), async () => {
      const tasks = await this.readTasks(organizationId);
      const next = tasks.filter((task) => task.id !== taskId);
      await this.writeTasks(organizationId, next);
      return {
        deleted: next.length !== tasks.length,
        total: next.length,
      };
    });
  }

  async setFavorite(organizationId: string, taskId: string, favorite: boolean) {
    // Read-modify-write: without the lock two concurrent calls both read the
    // same list and each wrote its own version over it, losing the other's
    // change. Measured at 20 concurrent writes, 1 survived.
    return withJsonFileLock(this.filePath(organizationId), async () => {
      return this.patchTask(organizationId, taskId, (task) => ({
        ...task,
        favorite,
        updatedAt: new Date().toISOString(),
      }));
    });
  }

  async setRating(
    organizationId: string,
    taskId: string,
    rating: unknown,
    comment: unknown
  ) {
    // Read-modify-write: without the lock two concurrent calls both read the
    // same list and each wrote its own version over it, losing the other's
    // change. Measured at 20 concurrent writes, 1 survived.
    return withJsonFileLock(this.filePath(organizationId), async () => {
      const numericRating = Number(rating);
      if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
        throw new BadRequestException('평점은 1에서 5 사이의 정수여야 합니다.');
      }
      return this.patchTask(organizationId, taskId, (task) => ({
        ...task,
        rating: numericRating,
        ratingComment: this.cleanText(comment, 500) || undefined,
        updatedAt: new Date().toISOString(),
      }));
    });
  }

  async importTasks(organizationId: string, tasks: unknown[] = []) {
    // Read-modify-write: without the lock two concurrent calls both read the
    // same list and each wrote its own version over it, losing the other's
    // change. Measured at 20 concurrent writes, 1 survived.
    return withJsonFileLock(this.filePath(organizationId), async () => {
      const current = await this.readTasks(organizationId);
      const incoming = tasks
        .map((task) => this.normalizeStoredTask(organizationId, task))
        .filter((task): task is SnapsStoredAgentTask => !!task);
      const deduped = this.mergeById([...incoming, ...current]);
      const merged = deduped.slice(0, MAX_AGENT_TASKS);
      await this.writeTasks(organizationId, merged);
      return {
        imported: incoming.length,
        total: merged.length,
        // Tasks the cap deleted, which are the ones already stored - see
        // importSources in source-library.service.ts for the measurement.
        dropped: deduped.length - merged.length,
      };
    });
  }

  async exportTasks(organizationId: string) {
    return this.readTasks(organizationId);
  }

  private async patchTask(
    organizationId: string,
    taskId: string,
    patch: (task: SnapsStoredAgentTask) => SnapsStoredAgentTask
  ) {
    const tasks = await this.readTasks(organizationId);
    const index = tasks.findIndex((task) => task.id === taskId);
    if (index < 0) {
      return undefined;
    }
    const nextTask = patch(tasks[index]);
    const next = [...tasks];
    next[index] = nextTask;
    await this.writeTasks(organizationId, next);
    return nextTask;
  }

  private toListItem(task: SnapsStoredAgentTask) {
    return {
      id: task.id,
      title: task.title,
      command: task.command,
      status: task.status,
      progress: task.progress,
      platformCount: task.platformCount,
      shortVideo: task.shortVideo,
      favorite: task.favorite,
      rating: task.rating,
      ratingComment: task.ratingComment,
      topic: task.result.plan.topic,
      platforms: task.result.plan.targetPlatforms,
      publishDateLocal: task.result.plan.publishDateLocal,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  private buildMessages(prepared: SnapsAgentPrepareResult, now: string) {
    return [
      {
        type: 'user' as const,
        content: prepared.plan.command,
        createdAt: now,
      },
      {
        type: 'assistant' as const,
        content: [
          prepared.operation.headline,
          ...(prepared.plan.operatorSummary || []).slice(0, 2),
        ].join('\n'),
        createdAt: now,
      },
      {
        type: 'result' as const,
        content: [
          `${prepared.plan.targetPlatforms.join(', ')} 초안 ${prepared.transform.variants.length}개와 운영맵을 준비했습니다.`,
          ...(prepared.plan.missingInputs?.length
            ? [`확인 필요: ${prepared.plan.missingInputs.join(', ')}`]
            : []),
        ].join('\n'),
        createdAt: now,
      },
    ];
  }

  private taskTitle(prepared: SnapsAgentPrepareResult) {
    return (
      prepared.plan.topic ||
      prepared.transform.variants[0]?.title ||
      prepared.plan.command
    )
      .replace(/\s+/g, ' ')
      .slice(0, 100);
  }

  private async readTasks(organizationId: string) {
    try {
      const file = await fs.readFile(this.filePath(organizationId), 'utf8');
      const parsed = JSON.parse(file);
      if (!Array.isArray(parsed)) {
        warnUnreadableJsonFile(
          this.filePath(organizationId),
          new Error('file does not hold a JSON array'),
          '에이전트 작업'
        );
        return [] as SnapsStoredAgentTask[];
      }
      return parsed
        .map((task) => this.normalizeStoredTask(organizationId, task))
        .filter((task): task is SnapsStoredAgentTask => !!task)
        .slice(0, MAX_AGENT_TASKS);
    } catch (error) {
      warnUnreadableJsonFile(this.filePath(organizationId), error, '에이전트 작업');
      return [] as SnapsStoredAgentTask[];
    }
  }

  private async writeTasks(organizationId: string, tasks: SnapsStoredAgentTask[]) {
    await ensureSnapsDataDir(this.dataDir);
    // The matching read answers [] for a file it cannot parse, so without this
    // a truncated file would be overwritten here and whatever it still held
    // would be gone. Move it aside first; see snaps/storage.
    const target = this.filePath(organizationId);
    await preserveUnreadableJsonFile(target, new Date().toISOString());
    await this.atomicWrite(target, JSON.stringify(tasks, null, 2));
  }

  private normalizeStoredTask(
    organizationId: string,
    value: unknown
  ): SnapsStoredAgentTask | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    const task = value as Partial<SnapsStoredAgentTask>;
    if (!task.result || typeof task.result !== 'object') {
      return undefined;
    }
    const result = task.result as SnapsAgentPrepareResult;
    const command = this.cleanText(task.command || result.plan?.command, 4000);
    if (!command || !result.plan || !result.transform || !result.operation) {
      return undefined;
    }
    // The two lists are read without asking further down - platformCount takes
    // targetPlatforms.length, the title falls back to variants[0], and the
    // message builder joins both - so a record missing either threw a
    // TypeError out of importTasks instead of being skipped. Measured: an
    // imported task whose plan carried `platforms` rather than
    // `targetPlatforms` crashed the whole import, taking the valid records
    // with it. Everything else in this file answers bad input by dropping the
    // record and letting the caller count it.
    if (
      !Array.isArray(result.plan.targetPlatforms) ||
      !Array.isArray(result.transform.variants)
    ) {
      return undefined;
    }
    const now = new Date().toISOString();
    const status = this.cleanStatus(task.status);
    return {
      id: this.cleanText(task.id, 160) || makeId(14),
      organizationId,
      title: this.cleanText(task.title, 160) || this.taskTitle(result),
      command,
      status,
      progress: this.cleanProgress(task.progress ?? result.operation.progress),
      platformCount: this.cleanNumber(
        task.platformCount,
        result.plan.targetPlatforms.length
      ),
      shortVideo: task.shortVideo === true || result.plan.includeShortVideo,
      favorite: task.favorite === true,
      rating: this.cleanRating(task.rating),
      ratingComment: this.cleanText(task.ratingComment, 500) || undefined,
      // Measured at 6,715 characters and six levels for a real prepared
      // result with two variants; ten platforms plus a card news deck stays
      // far inside this. One imported record with 5,000 long variants threw
      // Invalid string length out of the whole import before this bound.
      result: (boundStoredRecord(
        result,
        AGENT_RESULT_BOUNDS,
        '작업 결과'
      ) || {}) as SnapsAgentPrepareResult,
      messages: this.cleanMessages(task.messages, result, now),
      createdAt: this.cleanText(task.createdAt, 80) || now,
      updatedAt: this.cleanText(task.updatedAt, 80) || task.createdAt || now,
    };
  }

  private cleanMessages(
    value: unknown,
    prepared: SnapsAgentPrepareResult,
    now: string
  ) {
    if (!Array.isArray(value)) {
      return this.buildMessages(prepared, now);
    }
    const messages = value
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return undefined;
        }
        const message = item as SnapsStoredAgentTask['messages'][number];
        const type =
          message.type === 'user' ||
          message.type === 'assistant' ||
          message.type === 'system' ||
          message.type === 'result'
            ? message.type
            : undefined;
        const content = this.cleanText(message.content, 4000);
        if (!type || !content) {
          return undefined;
        }
        return {
          type,
          content,
          createdAt: this.cleanText(message.createdAt, 80) || now,
        };
      })
      .filter(
        (
          item
        ): item is SnapsStoredAgentTask['messages'][number] => !!item
      );
    return messages.length ? messages.slice(0, 80) : this.buildMessages(prepared, now);
  }

  private cleanStatus(value: unknown): SnapsStoredAgentTaskStatus {
    return value === 'completed' ||
      value === 'error' ||
      value === 'aborted' ||
      value === 'requires_confirmation'
      ? value
      : 'requires_confirmation';
  }

  private cleanPage(value: unknown) {
    const number = Number(value || 1);
    return Number.isInteger(number) && number > 0 ? number : 1;
  }

  private cleanPageSize(value: unknown) {
    const number = Number(value || 8);
    return Number.isInteger(number) && number > 0
      ? Math.min(number, 50)
      : 8;
  }

  private cleanProgress(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number)
      ? Math.max(0, Math.min(100, Math.round(number)))
      : 0;
  }

  private cleanNumber(value: unknown, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  private cleanRating(value: unknown) {
    const rating = Number(value);
    return Number.isInteger(rating) && rating >= 1 && rating <= 5
      ? rating
      : undefined;
  }

  private mergeById(tasks: SnapsStoredAgentTask[]) {
    const seen = new Set<string>();
    return tasks.filter((task) => {
      if (seen.has(task.id)) {
        return false;
      }
      seen.add(task.id);
      return true;
    });
  }

  private filePath(organizationId: string) {
    // Not a plain replace: two different ids can escape to the same string
    // and share one file. See snaps/storage/org-file-key.ts.
    const safeOrg = snapsOrgFileKey(organizationId);
    return path.join(this.dataDir, `${safeOrg}.agent-tasks.json`);
  }

  // Five stores carried a byte-identical copy of this, and every copy left
  // the temporary file behind when the rename failed. Shared now; see
  // snaps/storage/atomic-json-write.ts.
  // No lock here: the mutating methods above already hold the per-file lock
  // for the whole read-modify-write, and taking it again from inside would
  // wait on a lock this same call already owns - a deadlock.
  private async atomicWrite(filePath: string, content: string) {
    await writeJsonFileAtomically(filePath, content);
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
