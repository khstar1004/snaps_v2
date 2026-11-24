import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import path from 'path';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { SnapsVariant } from '@gitroom/nestjs-libraries/snaps/dto/transform-result.dto';
import {
  SnapsTargetPlatform,
  snapsTargetPlatforms,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import { cleanSnapsMultilineText } from '@gitroom/nestjs-libraries/snaps/utils/multiline-text';
import {
  SnapsSerialized,
  writeSnapsFileAtomic,
} from '@gitroom/nestjs-libraries/snaps/utils/serialized-store';
import { randomBytes } from 'crypto';

export type SnapsApprovalStatus =
  | 'pending'
  | 'approved'
  | 'changes-requested'
  | 'rejected'
  | 'scheduled';

export type SnapsApprovalDecision =
  | 'approve'
  | 'request-changes'
  | 'reject'
  | 'reopen';

export type SnapsApprovalRequestInput = {
  title?: unknown;
  variants?: unknown;
  requestedBy?: unknown;
  reviewer?: unknown;
  note?: unknown;
  dueAt?: unknown;
  publishDate?: unknown;
  scheduleType?: unknown;
  source?: unknown;
};

export type SnapsApprovalReviewInput = {
  decision?: unknown;
  reviewer?: unknown;
  note?: unknown;
};

export type SnapsApprovalPublicLinkInput = {
  expiresInDays?: unknown;
  allowDecision?: unknown;
  reviewer?: unknown;
  note?: unknown;
  rotate?: unknown;
};

export type SnapsApprovalCommentInput = {
  actor?: unknown;
  message?: unknown;
  visibility?: unknown;
  variantPlatform?: unknown;
  variantIndex?: unknown;
  selection?: unknown;
};

export type SnapsApprovalComment = {
  id: string;
  actor?: string;
  message: string;
  visibility: 'internal' | 'reviewer';
  variantPlatform?: SnapsTargetPlatform;
  variantIndex?: number;
  selection?: string;
  resolved: boolean;
  createdAt: string;
  resolvedAt?: string;
};

export type SnapsApprovalHistoryEntry = {
  id: string;
  action:
    | 'submitted'
    | SnapsApprovalDecision
    | 'scheduled'
    | 'commented'
    | 'comment-resolved'
    | 'comment-reopened'
    | 'public-review-shared'
    | 'public-review-revoked';
  status: SnapsApprovalStatus;
  actor?: string;
  note?: string;
  createdAt: string;
};

export type SnapsApprovalItem = {
  id: string;
  organizationId: string;
  title: string;
  status: SnapsApprovalStatus;
  requestedBy?: string;
  reviewer?: string;
  note?: string;
  dueAt?: string;
  publishDate?: string;
  scheduleType: 'draft' | 'schedule';
  source: string;
  variants: SnapsVariant[];
  history: SnapsApprovalHistoryEntry[];
  comments: SnapsApprovalComment[];
  publicReviewEnabled?: boolean;
  publicReviewToken?: string;
  publicReviewPath?: string;
  publicReviewUrl?: string;
  publicReviewAllowDecision?: boolean;
  publicReviewExpiresAt?: string;
  publicReviewCreatedAt?: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  scheduledAt?: string;
};

export type SnapsApprovalPublicReview = {
  product: 'snaps';
  source: 'snaps-public-approval-review';
  organizationId: string;
  approvalId: string;
  token: string;
  title: string;
  status: SnapsApprovalStatus;
  reviewer?: string;
  note?: string;
  dueAt?: string;
  expiresAt?: string;
  allowDecision: boolean;
  canComment: boolean;
  canDecide: boolean;
  publicReviewUrl: string;
  variants: SnapsVariant[];
  comments: SnapsApprovalComment[];
  warnings: string[];
};

export type SnapsApprovalPublicLink = {
  product: 'snaps';
  source: 'snaps-approval-public-link';
  approval: SnapsApprovalItem;
  token: string;
  publicReviewPath: string;
  publicReviewUrl: string;
  publicApiPath: string;
  expiresAt?: string;
  allowDecision: boolean;
};

const MAX_COMMENTS_PER_VISIBILITY = 100;
const MAX_HISTORY_ENTRIES = 50;

@Injectable()
export class SnapsApprovalWorkflowService {
  private readonly dataDir =
    process.env.SNAPS_DATA_DIR || path.join(process.cwd(), 'var', 'snaps');

  @SnapsSerialized()
  async submit(
    organizationId: string,
    body?: SnapsApprovalRequestInput
  ): Promise<SnapsApprovalItem> {
    const current = await this.list(organizationId);
    const now = new Date().toISOString();
    const request = body || {};
    const variants = this.cleanVariants(request.variants);
    if (!variants.length) {
      throw new BadRequestException('approval variants are required.');
    }

    const title =
      this.cleanText(request.title, 180) ||
      variants[0]?.title ||
      variants[0]?.content.replace(/\s+/g, ' ').slice(0, 80) ||
      'snaps approval request';
    const item = this.normalizeItem(organizationId, {
      id: makeId(14),
      title,
      status: 'pending',
      requestedBy: request.requestedBy,
      reviewer: request.reviewer,
      note: request.note,
      dueAt: request.dueAt,
      publishDate: request.publishDate,
      scheduleType: request.scheduleType,
      source: request.source || 'snaps-approval-workflow',
      variants,
      history: [
        {
          id: makeId(14),
          action: 'submitted',
          status: 'pending',
          actor: request.requestedBy,
          note: request.note,
          createdAt: now,
        },
      ],
      comments: [],
      createdAt: now,
      updatedAt: now,
    });
    if (!item) {
      throw new BadRequestException('approval request could not be normalized.');
    }

    await this.write(organizationId, [item, ...current].slice(0, 500));
    return item;
  }

  async list(organizationId: string, status?: unknown) {
    const filter = this.cleanStatus(status);
    try {
      const file = await fs.readFile(this.filePath(organizationId), 'utf8');
      const parsed = JSON.parse(file);
      if (!Array.isArray(parsed)) {
        return [] as SnapsApprovalItem[];
      }
      const items = parsed
        .map((item) => this.normalizeItem(organizationId, item))
        .filter((item): item is SnapsApprovalItem => !!item);
      return filter ? items.filter((item) => item.status === filter) : items;
    } catch {
      return [] as SnapsApprovalItem[];
    }
  }

  async get(organizationId: string, approvalId: string) {
    const item = (await this.list(organizationId)).find(
      (approval) => approval.id === approvalId
    );
    if (!item) {
      throw new NotFoundException('snaps approval request was not found.');
    }
    return item;
  }

  @SnapsSerialized()
  async createPublicReviewLink(
    organizationId: string,
    approvalId: string,
    body?: SnapsApprovalPublicLinkInput
  ): Promise<SnapsApprovalPublicLink> {
    const items = await this.list(organizationId);
    const index = items.findIndex((item) => item.id === approvalId);
    if (index < 0) {
      throw new NotFoundException('snaps approval request was not found.');
    }

    const now = new Date().toISOString();
    // Reuse a live link so a re-share does not break the URL a client already has,
    // but never revive an expired or revoked token.
    const current = items[index];
    const reuseToken =
      !!current.publicReviewToken &&
      current.publicReviewEnabled === true &&
      !this.isExpired(current.publicReviewExpiresAt) &&
      body?.rotate !== true;
    const token = reuseToken ? current.publicReviewToken! : this.makePublicReviewToken();
    const days = this.cleanInteger(body?.expiresInDays, 1, 90) || 7;
    const expiresAt = new Date(
      Date.now() + days * 24 * 60 * 60 * 1000
    ).toISOString();
    const allowDecision = body?.allowDecision === false ? false : true;
    const publicReviewPath = this.publicReviewPath(organizationId, token);
    const publicReviewUrl = this.publicReviewUrl(organizationId, token);
    const actor =
      this.cleanOptionalText(body?.reviewer, 160) || items[index].reviewer;
    const note = this.cleanOptionalText(body?.note, 1000);

    const next: SnapsApprovalItem = {
      ...items[index],
      publicReviewEnabled: true,
      publicReviewToken: token,
      publicReviewPath,
      publicReviewUrl,
      publicReviewAllowDecision: allowDecision,
      publicReviewExpiresAt: expiresAt,
      publicReviewCreatedAt: items[index].publicReviewCreatedAt || now,
      reviewer: actor || items[index].reviewer,
      updatedAt: now,
      history: this.retainHistory([
        {
          id: makeId(14),
          action: 'public-review-shared' as const,
          status: items[index].status,
          actor,
          note: note || `Public review link expires ${expiresAt.slice(0, 10)}`,
          createdAt: now,
        },
        ...items[index].history,
      ]),
    };
    items[index] = next;
    await this.write(organizationId, items);

    return {
      product: 'snaps',
      source: 'snaps-approval-public-link',
      approval: next,
      token,
      publicReviewPath,
      publicReviewUrl,
      publicApiPath: `/public/snaps/review/${encodeURIComponent(
        organizationId
      )}/${encodeURIComponent(token)}`,
      expiresAt,
      allowDecision,
    };
  }

  @SnapsSerialized()
  async revokePublicReviewLink(organizationId: string, approvalId: string) {
    const items = await this.list(organizationId);
    const index = items.findIndex((item) => item.id === approvalId);
    if (index < 0) {
      throw new NotFoundException('snaps approval request was not found.');
    }
    const current = items[index];
    const wasEnabled = current.publicReviewEnabled === true && !!current.publicReviewToken;
    const now = new Date().toISOString();
    const next: SnapsApprovalItem = {
      ...current,
      publicReviewEnabled: false,
      publicReviewToken: undefined,
      publicReviewPath: undefined,
      publicReviewUrl: undefined,
      publicReviewExpiresAt: undefined,
      updatedAt: now,
      history: wasEnabled
        ? this.retainHistory([
            {
              id: makeId(14),
              action: 'public-review-revoked' as const,
              status: current.status,
              note: 'Public review link revoked',
              createdAt: now,
            },
            ...current.history,
          ])
        : current.history,
    };
    items[index] = next;
    await this.write(organizationId, items);
    return {
      product: 'snaps' as const,
      source: 'snaps-approval-public-link-revoked' as const,
      revoked: wasEnabled,
      approval: next,
    };
  }

  async publicReview(
    organizationId: string,
    token: string
  ): Promise<SnapsApprovalPublicReview> {
    const approval = await this.findByPublicToken(organizationId, token);
    return this.toPublicReview(approval, token);
  }

  @SnapsSerialized()
  async addPublicReviewComment(
    organizationId: string,
    token: string,
    body?: SnapsApprovalCommentInput
  ) {
    const approval = await this.findByPublicToken(organizationId, token);
    const publicComments = approval.comments.filter(
      (comment) => comment.visibility === 'reviewer'
    ).length;
    if (publicComments >= MAX_COMMENTS_PER_VISIBILITY) {
      throw new BadRequestException(
        'This review link reached its comment limit. Ask the team to rotate the link.'
      );
    }
    const result = await this.addComment(organizationId, approval.id, {
      ...body,
      visibility: 'reviewer',
    });
    return {
      product: 'snaps' as const,
      source: 'snaps-public-approval-comment' as const,
      comment: result.comment,
      review: await this.publicReview(organizationId, token),
    };
  }

  @SnapsSerialized()
  async publicReviewDecision(
    organizationId: string,
    token: string,
    body?: SnapsApprovalReviewInput
  ) {
    const approval = await this.findByPublicToken(organizationId, token);
    if (!approval.publicReviewAllowDecision) {
      throw new BadRequestException('public approval decisions are disabled.');
    }
    if (approval.status === 'scheduled') {
      throw new BadRequestException('scheduled approval requests cannot be changed.');
    }
    const decision = this.cleanDecision(body?.decision);
    if (!decision || decision === 'reopen') {
      throw new BadRequestException('public approval decision is required.');
    }
    const reviewed = await this.review(organizationId, approval.id, {
      decision,
      reviewer: body?.reviewer,
      note: body?.note,
    });
    return {
      product: 'snaps' as const,
      source: 'snaps-public-approval-decision' as const,
      approval: reviewed,
      review: await this.publicReview(organizationId, token),
    };
  }

  @SnapsSerialized()
  async addComment(
    organizationId: string,
    approvalId: string,
    body?: SnapsApprovalCommentInput
  ) {
    const message = cleanSnapsMultilineText(body?.message, 1200);
    if (!message) {
      throw new BadRequestException('approval comment message is required.');
    }

    const items = await this.list(organizationId);
    const index = items.findIndex((item) => item.id === approvalId);
    if (index < 0) {
      throw new NotFoundException('snaps approval request was not found.');
    }

    const now = new Date().toISOString();
    const comment: SnapsApprovalComment = {
      id: makeId(14),
      actor: this.cleanOptionalText(body?.actor, 160),
      message,
      visibility: body?.visibility === 'internal' ? 'internal' : 'reviewer',
      variantPlatform: this.cleanPlatform(body?.variantPlatform),
      variantIndex: this.cleanInteger(body?.variantIndex, 0, 49),
      selection: this.cleanOptionalText(body?.selection, 500),
      resolved: false,
      createdAt: now,
    };

    const next: SnapsApprovalItem = {
      ...items[index],
      updatedAt: now,
      comments: this.retainComments([comment, ...items[index].comments]),
      history: this.retainHistory([
        {
          id: makeId(14),
          action: 'commented' as const,
          status: items[index].status,
          actor: comment.actor,
          note: message,
          createdAt: now,
        },
        ...items[index].history,
      ]),
    };
    items[index] = next;
    await this.write(organizationId, items);
    return {
      comment,
      approval: next,
    };
  }

  @SnapsSerialized()
  async resolveComment(
    organizationId: string,
    approvalId: string,
    commentId: string,
    body?: { resolved?: unknown; actor?: unknown; note?: unknown }
  ) {
    const items = await this.list(organizationId);
    const index = items.findIndex((item) => item.id === approvalId);
    if (index < 0) {
      throw new NotFoundException('snaps approval request was not found.');
    }

    const current = items[index];
    const commentIndex = current.comments.findIndex(
      (comment) => comment.id === commentId
    );
    if (commentIndex < 0) {
      throw new NotFoundException('snaps approval comment was not found.');
    }

    const now = new Date().toISOString();
    const resolved = body?.resolved === false ? false : true;
    const comments = [...current.comments];
    comments[commentIndex] = {
      ...comments[commentIndex],
      resolved,
      resolvedAt: resolved ? now : undefined,
    };

    const next: SnapsApprovalItem = {
      ...current,
      updatedAt: now,
      comments,
      history: this.retainHistory([
        {
          id: makeId(14),
          action: resolved
            ? ('comment-resolved' as const)
            : ('comment-reopened' as const),
          status: current.status,
          actor: this.cleanOptionalText(body?.actor, 160),
          note:
            this.cleanOptionalText(body?.note, 1000) ||
            comments[commentIndex].message,
          createdAt: now,
        },
        ...current.history,
      ]),
    };
    items[index] = next;
    await this.write(organizationId, items);
    return {
      comment: comments[commentIndex],
      approval: next,
    };
  }

  @SnapsSerialized()
  async review(
    organizationId: string,
    approvalId: string,
    body?: SnapsApprovalReviewInput
  ) {
    const decision = this.cleanDecision(body?.decision);
    if (!decision) {
      throw new BadRequestException('approval decision is required.');
    }

    const items = await this.list(organizationId);
    const index = items.findIndex((item) => item.id === approvalId);
    if (index < 0) {
      throw new NotFoundException('snaps approval request was not found.');
    }

    const now = new Date().toISOString();
    const status = this.statusForDecision(decision);
    const next: SnapsApprovalItem = {
      ...items[index],
      status,
      reviewer: this.cleanText(body?.reviewer, 160) || items[index].reviewer,
      note: this.cleanText(body?.note, 1000) || items[index].note,
      updatedAt: now,
      approvedAt: status === 'approved' ? now : items[index].approvedAt,
      history: this.retainHistory([
        {
          id: makeId(14),
          action: decision,
          status,
          actor: this.cleanText(body?.reviewer, 160) || undefined,
          note: this.cleanText(body?.note, 1000) || undefined,
          createdAt: now,
        },
        ...items[index].history,
      ]),
    };
    items[index] = next;
    await this.write(organizationId, items);
    return next;
  }

  @SnapsSerialized()
  async markScheduled(
    organizationId: string,
    approvalId: string,
    body?: { actor?: unknown; note?: unknown }
  ) {
    const items = await this.list(organizationId);
    const index = items.findIndex((item) => item.id === approvalId);
    if (index < 0) {
      throw new NotFoundException('snaps approval request was not found.');
    }

    const now = new Date().toISOString();
    const next: SnapsApprovalItem = {
      ...items[index],
      status: 'scheduled',
      updatedAt: now,
      scheduledAt: now,
      history: this.retainHistory([
        {
          id: makeId(14),
          action: 'scheduled' as const,
          status: 'scheduled' as const,
          actor: this.cleanText(body?.actor, 160) || undefined,
          note: this.cleanText(body?.note, 1000) || undefined,
          createdAt: now,
        },
        ...items[index].history,
      ]),
    };
    items[index] = next;
    await this.write(organizationId, items);
    return next;
  }

  @SnapsSerialized()
  async delete(organizationId: string, approvalId: string) {
    const items = await this.list(organizationId);
    const next = items.filter((item) => item.id !== approvalId);
    await this.write(organizationId, next);
    return {
      deleted: next.length !== items.length,
      approvals: next.length,
    };
  }

  /**
   * Workspace backups leave the app as files, so they must not carry live public
   * review tokens (anyone holding the file could approve or reject).
   */
  async exportApprovals(organizationId: string) {
    return (await this.list(organizationId)).map((item) => this.withoutPublicLink(item));
  }

  @SnapsSerialized()
  async importApprovals(organizationId: string, approvals: unknown[] = []) {
    const current = await this.list(organizationId);
    const currentById = new Map(current.map((item) => [item.id, item]));
    // Tokens in an imported file are never trusted: restoring an old backup must not
    // revive a revoked link. Items that already exist keep their current link state.
    const incoming = approvals
      .map((item) => this.normalizeItem(organizationId, item))
      .filter((item): item is SnapsApprovalItem => !!item)
      .map((item) => {
        const existing = currentById.get(item.id);
        return existing
          ? { ...this.withoutPublicLink(item), ...this.publicLinkFields(existing) }
          : this.withoutPublicLink(item);
      });
    const merged = this.mergeById([...incoming, ...current]).slice(0, 500);
    await this.write(organizationId, merged);
    return {
      imported: incoming.length,
      total: merged.length,
    };
  }

  private withoutPublicLink(item: SnapsApprovalItem): SnapsApprovalItem {
    return {
      ...item,
      publicReviewEnabled: false,
      publicReviewToken: undefined,
      publicReviewPath: undefined,
      publicReviewUrl: undefined,
      publicReviewExpiresAt: undefined,
    };
  }

  private publicLinkFields(item: SnapsApprovalItem) {
    return {
      publicReviewEnabled: item.publicReviewEnabled,
      publicReviewToken: item.publicReviewToken,
      publicReviewPath: item.publicReviewPath,
      publicReviewUrl: item.publicReviewUrl,
      publicReviewAllowDecision: item.publicReviewAllowDecision,
      publicReviewExpiresAt: item.publicReviewExpiresAt,
      publicReviewCreatedAt: item.publicReviewCreatedAt,
    };
  }

  /** Reviewer comments come in through public links, so they never evict internal notes. */
  private retainComments(comments: SnapsApprovalComment[]) {
    let internal = 0;
    let reviewer = 0;
    return comments.filter((comment) =>
      comment.visibility === 'internal'
        ? ++internal <= MAX_COMMENTS_PER_VISIBILITY
        : ++reviewer <= MAX_COMMENTS_PER_VISIBILITY
    );
  }

  /** Drops the oldest comment entries first so decisions stay in the audit trail. */
  private retainHistory(history: SnapsApprovalHistoryEntry[]) {
    if (history.length <= MAX_HISTORY_ENTRIES) {
      return history;
    }
    const decisions = history.filter((entry) => entry.action !== 'commented');
    const keepDecisions = new Set(decisions.slice(0, MAX_HISTORY_ENTRIES));
    let room = MAX_HISTORY_ENTRIES - keepDecisions.size;
    return history.filter((entry) => {
      if (entry.action !== 'commented') {
        return keepDecisions.has(entry);
      }
      if (room > 0) {
        room -= 1;
        return true;
      }
      return false;
    });
  }

  private makePublicReviewToken() {
    // Public links grant comment and decision rights, so use a CSPRNG (makeId uses Math.random).
    return randomBytes(24).toString('base64url');
  }

  private async findByPublicToken(organizationId: string, token: string) {
    const cleanToken = this.cleanText(token, 180);
    if (!cleanToken) {
      throw new NotFoundException('snaps public approval review was not found.');
    }
    const item = (await this.list(organizationId)).find(
      (approval) =>
        approval.publicReviewEnabled &&
        approval.publicReviewToken === cleanToken
    );
    if (!item || this.isExpired(item.publicReviewExpiresAt)) {
      throw new NotFoundException('snaps public approval review was not found.');
    }
    return item;
  }

  private toPublicReview(
    approval: SnapsApprovalItem,
    token: string
  ): SnapsApprovalPublicReview {
    const allowDecision = approval.publicReviewAllowDecision === true;
    const scheduled = approval.status === 'scheduled';
    return {
      product: 'snaps',
      source: 'snaps-public-approval-review',
      organizationId: approval.organizationId,
      approvalId: approval.id,
      token,
      title: approval.title,
      status: approval.status,
      reviewer: approval.reviewer,
      note: approval.note,
      dueAt: approval.dueAt,
      expiresAt: approval.publicReviewExpiresAt,
      allowDecision,
      canComment: true,
      canDecide: allowDecision && !scheduled,
      publicReviewUrl:
        approval.publicReviewUrl || this.publicReviewUrl(approval.organizationId, token),
      variants: approval.variants,
      comments: approval.comments.filter(
        (comment) => comment.visibility === 'reviewer'
      ),
      warnings: [
        ...(scheduled ? ['This request is already scheduled.'] : []),
        ...(this.isExpired(approval.publicReviewExpiresAt)
          ? ['This public review link has expired.']
          : []),
      ],
    };
  }

  private normalizeItem(
    organizationId: string,
    value: unknown
  ): SnapsApprovalItem | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const input = value as Partial<SnapsApprovalItem>;
    const variants = this.cleanVariants(input.variants);
    if (!variants.length) {
      return undefined;
    }
    const title =
      this.cleanText(input.title, 180) ||
      variants[0]?.title ||
      variants[0]?.content.replace(/\s+/g, ' ').slice(0, 80);
    if (!title) {
      return undefined;
    }
    const createdAt = this.cleanDate(input.createdAt) || new Date().toISOString();
    const updatedAt = this.cleanDate(input.updatedAt) || createdAt;
    const status = this.cleanStatus(input.status) || 'pending';
    const publicReviewToken = this.cleanOptionalText(
      input.publicReviewToken,
      180
    );
    return {
      id: this.cleanText(input.id, 160) || makeId(14),
      organizationId,
      title,
      status,
      requestedBy: this.cleanOptionalText(input.requestedBy, 160),
      reviewer: this.cleanOptionalText(input.reviewer, 160),
      note: this.cleanOptionalText(input.note, 1000),
      dueAt: this.cleanDate(input.dueAt) || undefined,
      publishDate: this.cleanDate(input.publishDate) || undefined,
      scheduleType: input.scheduleType === 'schedule' ? 'schedule' : 'draft',
      source: this.cleanText(input.source, 120) || 'snaps-approval-workflow',
      variants,
      history: this.cleanHistory(input.history, status),
      comments: this.cleanComments(input.comments),
      publicReviewEnabled: publicReviewToken
        ? input.publicReviewEnabled !== false
        : undefined,
      publicReviewToken,
      publicReviewPath: publicReviewToken
        ? this.publicReviewPath(organizationId, publicReviewToken)
        : undefined,
      publicReviewUrl: publicReviewToken
        ? this.publicReviewUrl(organizationId, publicReviewToken)
        : undefined,
      publicReviewAllowDecision:
        publicReviewToken && input.publicReviewAllowDecision !== false
          ? true
          : undefined,
      publicReviewExpiresAt:
        this.cleanDate(input.publicReviewExpiresAt) || undefined,
      publicReviewCreatedAt:
        this.cleanDate(input.publicReviewCreatedAt) || undefined,
      createdAt,
      updatedAt,
      approvedAt: this.cleanDate(input.approvedAt) || undefined,
      scheduledAt: this.cleanDate(input.scheduledAt) || undefined,
    };
  }

  private cleanHistory(
    value: unknown,
    fallbackStatus: SnapsApprovalStatus
  ): SnapsApprovalHistoryEntry[] {
    if (!Array.isArray(value)) {
      return [];
    }
    const entries = value
      .map((entry): SnapsApprovalHistoryEntry | undefined => {
        if (!entry || typeof entry !== 'object') {
          return undefined;
        }
        const input = entry as Partial<SnapsApprovalHistoryEntry>;
        const action = this.cleanHistoryAction(input.action);
        const createdAt = this.cleanDate(input.createdAt) || new Date().toISOString();
        if (!action) {
          return undefined;
        }
        return {
          id: this.cleanText(input.id, 160) || makeId(14),
          action,
          status: this.cleanStatus(input.status) || fallbackStatus,
          actor: this.cleanOptionalText(input.actor, 160),
          note: this.cleanOptionalText(input.note, 1000),
          createdAt,
        };
      })
      .filter((entry): entry is SnapsApprovalHistoryEntry => !!entry);
    return this.retainHistory(entries);
  }

  private cleanVariants(value: unknown): SnapsVariant[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item): SnapsVariant | undefined => {
        if (!item || typeof item !== 'object') {
          return undefined;
        }
        const input = item as Partial<SnapsVariant>;
        const platform = this.cleanPlatform(input.platform);
        const content = cleanSnapsMultilineText(input.content, 100000);
        if (!platform || content.length < 2) {
          return undefined;
        }
        return {
          platform,
          label: this.cleanText(input.label, 80) || platform,
          title: this.cleanOptionalText(input.title, 180),
          content,
          hashtags: this.cleanStringArray(input.hashtags, 30, 80),
          media: this.cleanMedia(input.media),
          settings: this.cleanRecord(input.settings),
          publishMode: input.publishMode === 'assist' ? 'assist' : 'schedule',
          notes: this.cleanStringArray(input.notes, 20, 500),
        };
      })
      .filter((variant): variant is SnapsVariant => !!variant)
      .slice(0, 50);
  }

  private cleanMedia(value: unknown): SnapsVariant['media'] {
    if (!Array.isArray(value)) {
      return undefined;
    }
    const media = value
      .map((item): NonNullable<SnapsVariant['media']>[number] | undefined => {
        if (!item || typeof item !== 'object') {
          return undefined;
        }
        const input = item as Record<string, unknown>;
        const id = this.cleanText(input.id, 160);
        const pathValue = this.cleanText(input.path, 2000);
        if (!id || !pathValue) {
          return undefined;
        }
        return {
          id,
          path: pathValue,
          thumbnail: this.cleanOptionalText(input.thumbnail, 2000),
          alt: this.cleanOptionalText(input.alt, 500),
        };
      })
      .filter(
        (item): item is NonNullable<SnapsVariant['media']>[number] => !!item
      )
      .slice(0, 20);
    return media.length ? media : undefined;
  }

  private cleanComments(value: unknown): SnapsApprovalComment[] {
    if (!Array.isArray(value)) {
      return [];
    }
    const comments = value
      .map((item): SnapsApprovalComment | undefined => {
        if (!item || typeof item !== 'object') {
          return undefined;
        }
        const input = item as Partial<SnapsApprovalComment>;
        const message = cleanSnapsMultilineText(input.message, 1200);
        if (!message) {
          return undefined;
        }
        const resolved = input.resolved === true;
        const resolvedAt = this.cleanDate(input.resolvedAt);
        return {
          id: this.cleanText(input.id, 160) || makeId(14),
          actor: this.cleanOptionalText(input.actor, 160),
          message,
          visibility: input.visibility === 'internal' ? 'internal' : 'reviewer',
          variantPlatform: this.cleanPlatform(input.variantPlatform),
          variantIndex: this.cleanInteger(input.variantIndex, 0, 49),
          selection: this.cleanOptionalText(input.selection, 500),
          resolved,
          createdAt: this.cleanDate(input.createdAt) || new Date().toISOString(),
          resolvedAt: resolved && resolvedAt ? resolvedAt : undefined,
        };
      })
      .filter((comment): comment is SnapsApprovalComment => !!comment);
    return this.retainComments(comments);
  }

  private statusForDecision(decision: SnapsApprovalDecision): SnapsApprovalStatus {
    if (decision === 'approve') {
      return 'approved';
    }
    if (decision === 'request-changes') {
      return 'changes-requested';
    }
    if (decision === 'reject') {
      return 'rejected';
    }
    return 'pending';
  }

  private cleanDecision(value: unknown): SnapsApprovalDecision | undefined {
    const decision = this.cleanText(value, 80).toLowerCase();
    return ['approve', 'request-changes', 'reject', 'reopen'].includes(decision)
      ? (decision as SnapsApprovalDecision)
      : undefined;
  }

  private cleanHistoryAction(
    value: unknown
  ): SnapsApprovalHistoryEntry['action'] | undefined {
    const action = this.cleanText(value, 80).toLowerCase();
    return [
      'submitted',
      'approve',
      'request-changes',
      'reject',
      'reopen',
      'scheduled',
      'commented',
      'comment-resolved',
      'comment-reopened',
      'public-review-shared',
      'public-review-revoked',
    ].includes(action)
      ? (action as SnapsApprovalHistoryEntry['action'])
      : undefined;
  }

  private cleanStatus(value: unknown): SnapsApprovalStatus | undefined {
    const status = this.cleanText(value, 80).toLowerCase();
    return [
      'pending',
      'approved',
      'changes-requested',
      'rejected',
      'scheduled',
    ].includes(status)
      ? (status as SnapsApprovalStatus)
      : undefined;
  }

  private publicReviewPath(organizationId: string, token: string) {
    return `/snaps/review/${encodeURIComponent(organizationId)}/${encodeURIComponent(
      token
    )}`;
  }

  private publicReviewUrl(organizationId: string, token: string) {
    const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:4200').replace(
      /\/$/,
      ''
    );
    return `${baseUrl}${this.publicReviewPath(organizationId, token)}`;
  }

  private isExpired(value?: string) {
    if (!value) {
      return false;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? false : parsed.getTime() < Date.now();
  }

  private async write(organizationId: string, approvals: SnapsApprovalItem[]) {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.atomicWrite(
      this.filePath(organizationId),
      JSON.stringify(approvals, null, 2)
    );
  }

  private filePath(organizationId: string) {
    const safeOrg = organizationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, `${safeOrg}.approval-workflow.json`);
  }

  private mergeById<T extends { id: string }>(items: T[]) {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    });
  }

  private cleanPlatform(value: unknown): SnapsTargetPlatform | undefined {
    const platform = this.cleanText(value, 80);
    return snapsTargetPlatforms.includes(platform as SnapsTargetPlatform)
      ? (platform as SnapsTargetPlatform)
      : undefined;
  }

  private cleanRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private cleanStringArray(value: unknown, maxItems: number, maxLength: number) {
    return Array.isArray(value)
      ? [
          ...new Set(
            value
              .map((item) => this.cleanText(item, maxLength))
              .filter(Boolean)
          ),
        ].slice(0, maxItems)
      : [];
  }

  private cleanInteger(value: unknown, min: number, max: number) {
    const numeric =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : Number.NaN;
    if (!Number.isFinite(numeric)) {
      return undefined;
    }
    const integer = Math.trunc(numeric);
    if (integer < min || integer > max) {
      return undefined;
    }
    return integer;
  }

  private cleanDate(value: unknown) {
    const text = this.cleanText(value, 80);
    if (!text) {
      return '';
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  }

  private cleanOptionalText(value: unknown, maxLength = 1000) {
    const text = this.cleanText(value, maxLength);
    return text || undefined;
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

  private async atomicWrite(filePath: string, content: string) {
    await writeSnapsFileAtomic(filePath, content);
  }
}
