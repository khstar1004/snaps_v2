import { BadRequestException, Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import path from 'path';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { SnapsAgentPrepareResult } from '@gitroom/nestjs-libraries/snaps/agent/command-planner.service';

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

@Injectable()
export class SnapsAgentTaskService {
  private readonly dataDir =
    process.env.SNAPS_DATA_DIR || path.join(process.cwd(), 'var', 'snaps');

  async createFromPrepared(
    organizationId: string,
    prepared: SnapsAgentPrepareResult
  ) {
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
      throw new BadRequestException('agent task is invalid.');
    }
    await this.writeTasks(organizationId, [task, ...current].slice(0, MAX_AGENT_TASKS));
    return task;
  }

  async list(organizationId: string, query: SnapsAgentTaskListQuery = {}) {
    const page = this.cleanPage(query.page);
    const pageSize = this.cleanPageSize(query.pageSize);
    const keyword = this.cleanText(query.keyword, 120).toLowerCase();
    const favoriteOnly = query.favoriteOnly === true || query.favoriteOnly === 'true';
    const tasks = (await this.readTasks(organizationId)).filter((task) => {
      const matchesKeyword =
        !keyword ||
        [task.title, task.command, task.result.plan.topic || '']
          .join(' ')
          .toLowerCase()
          .includes(keyword);
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
    const tasks = await this.readTasks(organizationId);
    const next = tasks.filter((task) => task.id !== taskId);
    await this.writeTasks(organizationId, next);
    return {
      deleted: next.length !== tasks.length,
      total: next.length,
    };
  }

  async setFavorite(organizationId: string, taskId: string, favorite: boolean) {
    return this.patchTask(organizationId, taskId, (task) => ({
      ...task,
      favorite,
      updatedAt: new Date().toISOString(),
    }));
  }

  async setRating(
    organizationId: string,
    taskId: string,
    rating: unknown,
    comment: unknown
  ) {
    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      throw new BadRequestException('rating must be an integer between 1 and 5.');
    }
    return this.patchTask(organizationId, taskId, (task) => ({
      ...task,
      rating: numericRating,
      ratingComment: this.cleanText(comment, 500) || undefined,
      updatedAt: new Date().toISOString(),
    }));
  }

  async importTasks(organizationId: string, tasks: unknown[] = []) {
    const current = await this.readTasks(organizationId);
    const incoming = tasks
      .map((task) => this.normalizeStoredTask(organizationId, task))
      .filter((task): task is SnapsStoredAgentTask => !!task);
    const merged = this.mergeById([...incoming, ...current]).slice(
      0,
      MAX_AGENT_TASKS
    );
    await this.writeTasks(organizationId, merged);
    return {
      imported: incoming.length,
      total: merged.length,
    };
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
        return [] as SnapsStoredAgentTask[];
      }
      return parsed
        .map((task) => this.normalizeStoredTask(organizationId, task))
        .filter((task): task is SnapsStoredAgentTask => !!task)
        .slice(0, MAX_AGENT_TASKS);
    } catch {
      return [] as SnapsStoredAgentTask[];
    }
  }

  private async writeTasks(organizationId: string, tasks: SnapsStoredAgentTask[]) {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.atomicWrite(
      this.filePath(organizationId),
      JSON.stringify(tasks, null, 2)
    );
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
      result,
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
    const safeOrg = organizationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, `${safeOrg}.agent-tasks.json`);
  }

  private async atomicWrite(filePath: string, content: string) {
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmpPath, content, 'utf8');
    await fs.rename(tmpPath, filePath);
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
