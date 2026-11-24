import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import path from 'path';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import {
  SnapsTargetPlatform,
  snapsTargetPlatforms,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import {
  SnapsSerialized,
  writeSnapsFileAtomic,
} from '@gitroom/nestjs-libraries/snaps/utils/serialized-store';

export type SnapsBrandKitInput = {
  name?: unknown;
  audience?: unknown;
  voice?: unknown;
  tone?: unknown;
  values?: unknown;
  bannedTerms?: unknown;
  requiredTerms?: unknown;
  hashtags?: unknown;
  cta?: unknown;
  colors?: unknown;
  targetPlatforms?: unknown;
  examples?: unknown;
  source?: unknown;
};

export type SnapsBrandKitAnalyzeRequest = SnapsBrandKitInput & {
  brandName?: unknown;
  websiteText?: unknown;
  samplePosts?: unknown;
  goals?: unknown;
};

export type SnapsBrandKitApplyRequest = {
  sourceText?: unknown;
  topic?: unknown;
};

export type SnapsBrandKitDraft = {
  product: 'snaps';
  source: 'snaps-brand-kit';
  name: string;
  audience: string;
  voice: string;
  tone: string;
  values: string[];
  bannedTerms: string[];
  requiredTerms: string[];
  hashtags: string[];
  cta: string;
  colors: string[];
  targetPlatforms: SnapsTargetPlatform[];
  examples: string[];
  promptGuidance: string;
  warnings: string[];
};

export type SnapsBrandKitItem = SnapsBrandKitDraft & {
  id: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
};

export type SnapsBrandKitApplication = {
  product: 'snaps';
  source: 'snaps-brand-kit-application';
  brandKit: SnapsBrandKitItem;
  transformPatch: {
    tone: string;
    topic: string;
    targetPlatforms: SnapsTargetPlatform[];
  };
  promptPrefix: string;
  complianceChecklist: string[];
  hashtagAppend: string[];
  warnings: string[];
};

@Injectable()
export class SnapsBrandKitService {
  private readonly dataDir =
    process.env.SNAPS_DATA_DIR || path.join(process.cwd(), 'var', 'snaps');

  analyze(body?: SnapsBrandKitAnalyzeRequest): SnapsBrandKitDraft {
    const request = body || {};
    const rawText = [
      this.cleanText(request.websiteText, 4000),
      ...this.cleanStringArray(request.samplePosts, 12, 1000),
      ...this.cleanStringArray(request.examples, 12, 1000),
    ]
      .filter(Boolean)
      .join('\n');
    const name =
      this.cleanText(request.name, 120) ||
      this.cleanText(request.brandName, 120) ||
      this.extractBrandName(rawText) ||
      'snaps brand';
    const audience =
      this.cleanText(request.audience, 220) ||
      this.cleanText(request.goals, 220) ||
      '콘텐츠를 빠르게 만들고 검수해야 하는 소규모 팀';
    const voice =
      this.cleanText(request.voice, 180) ||
      (this.hasCasualCue(rawText) ? '친근하고 실무적인 조언자' : '명확하고 신뢰감 있는 전문가');
    const tone =
      this.cleanText(request.tone, 180) ||
      (this.hasProofCue(rawText) ? '근거 중심, 과장 없는 한국어' : '따뜻하지만 간결한 한국어');
    const values = this.cleanStringArray(request.values, 10, 80);
    const requiredTerms = this.cleanStringArray(request.requiredTerms, 20, 80);
    const bannedTerms = this.cleanStringArray(request.bannedTerms, 20, 80);
    const hashtags = this.cleanHashtags(request.hashtags);
    const colors = this.cleanColors(request.colors);
    const targetPlatforms = this.cleanPlatforms(request.targetPlatforms);
    const cta =
      this.cleanText(request.cta, 240) ||
      '댓글로 파일럿이라고 남기면 샘플 캘린더를 보내드립니다.';
    const examples = this.cleanStringArray(request.examples || request.samplePosts, 8, 500);
    const warnings: string[] = [];
    if (!rawText && !this.cleanText(request.voice, 180)) {
      warnings.push('No sample content was supplied, so snaps used a practical default voice.');
    }
    if (!targetPlatforms.length) {
      warnings.push('No brand platforms were supplied, so common snaps platforms were used.');
    }

    const next: Omit<SnapsBrandKitDraft, 'promptGuidance'> = {
      product: 'snaps',
      source: 'snaps-brand-kit',
      name,
      audience,
      voice,
      tone,
      values: values.length ? values : ['명확함', '실행 가능성', '과장 없는 신뢰'],
      bannedTerms: bannedTerms.length ? bannedTerms : ['혁신적', '완벽한', '무조건'],
      requiredTerms: requiredTerms.length ? requiredTerms : ['snaps', '콘텐츠 운영'],
      hashtags: hashtags.length ? hashtags : ['#콘텐츠운영', '#마케팅자동화', '#snaps'],
      cta,
      colors: colors.length ? colors : ['#12b8b8', '#f6c85f', '#ef6f6c'],
      targetPlatforms: targetPlatforms.length
        ? targetPlatforms
        : (['threads', 'instagram', 'linkedin'] as SnapsTargetPlatform[]),
      examples,
      warnings,
    };

    return {
      ...next,
      promptGuidance: this.buildPromptGuidance(next),
    };
  }

  @SnapsSerialized()
  async save(organizationId: string, body?: SnapsBrandKitInput) {
    const current = await this.list(organizationId);
    const draft = this.normalizeDraft(body, true);
    if (!draft) {
      throw new BadRequestException('brand kit name, voice, or audience is required.');
    }
    const now = new Date().toISOString();
    const item: SnapsBrandKitItem = {
      ...draft,
      id: makeId(14),
      organizationId,
      createdAt: now,
      updatedAt: now,
    };
    await this.write(
      organizationId,
      [item, ...current.filter((kit) => kit.name !== item.name)].slice(0, 100)
    );
    return item;
  }

  async list(organizationId: string): Promise<SnapsBrandKitItem[]> {
    try {
      const file = await fs.readFile(this.filePath(organizationId), 'utf8');
      const parsed = JSON.parse(file);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map((item) => this.normalizeItem(organizationId, item))
        .filter((item): item is SnapsBrandKitItem => !!item);
    } catch {
      return [];
    }
  }

  async get(organizationId: string, brandKitId: string) {
    const kit = (await this.list(organizationId)).find(
      (item) => item.id === brandKitId
    );
    if (!kit) {
      throw new NotFoundException('snaps brand kit was not found.');
    }
    return kit;
  }

  async apply(
    organizationId: string,
    brandKitId: string,
    body?: SnapsBrandKitApplyRequest
  ): Promise<SnapsBrandKitApplication> {
    const brandKit = await this.get(organizationId, brandKitId);
    const sourceText = this.cleanText(body?.sourceText, 1000);
    const topic =
      this.cleanText(body?.topic, 120) ||
      this.firstLine(sourceText) ||
      brandKit.values[0] ||
      brandKit.name;
    const warnings: string[] = [];
    if (!brandKit.targetPlatforms.length) {
      warnings.push('Brand kit does not include target platforms.');
    }
    const complianceChecklist = [
      `Voice: ${brandKit.voice}`,
      `Tone: ${brandKit.tone}`,
      `Audience: ${brandKit.audience}`,
      `Required terms: ${brandKit.requiredTerms.join(', ')}`,
      `Avoid: ${brandKit.bannedTerms.join(', ')}`,
      `CTA: ${brandKit.cta}`,
    ];

    return {
      product: 'snaps',
      source: 'snaps-brand-kit-application',
      brandKit,
      transformPatch: {
        tone: `${brandKit.voice} / ${brandKit.tone}`,
        topic,
        targetPlatforms: brandKit.targetPlatforms,
      },
      promptPrefix: this.buildPromptGuidance(brandKit),
      complianceChecklist,
      hashtagAppend: brandKit.hashtags,
      warnings,
    };
  }

  @SnapsSerialized()
  async delete(organizationId: string, brandKitId: string) {
    const current = await this.list(organizationId);
    const next = current.filter((kit) => kit.id !== brandKitId);
    await this.write(organizationId, next);
    return {
      deleted: next.length !== current.length,
      brandKits: next.length,
    };
  }

  @SnapsSerialized()
  async importBrandKits(organizationId: string, brandKits: unknown[] = []) {
    const current = await this.list(organizationId);
    const incoming = brandKits
      .map((item) => this.normalizeItem(organizationId, item))
      .filter((item): item is SnapsBrandKitItem => !!item);
    const merged = this.mergeByKey([...incoming, ...current], (kit) =>
      kit.id || kit.name.toLowerCase()
    ).slice(0, 100);
    await this.write(organizationId, merged);
    return {
      imported: incoming.length,
      total: merged.length,
    };
  }

  private normalizeDraft(
    value: unknown,
    requireSignal = false
  ): SnapsBrandKitDraft | undefined {
    if (requireSignal && !this.hasBrandKitSignal(value)) {
      return undefined;
    }
    const analyzed = this.analyze(
      value && typeof value === 'object'
        ? (value as SnapsBrandKitAnalyzeRequest)
        : undefined
    );
    if (!analyzed.name && !analyzed.voice && !analyzed.audience) {
      return undefined;
    }
    return analyzed;
  }

  private normalizeItem(
    organizationId: string,
    value: unknown
  ): SnapsBrandKitItem | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    const input = value as Partial<SnapsBrandKitItem>;
    const draft = this.normalizeDraft(input, true);
    if (!draft) {
      return undefined;
    }
    const createdAt = this.cleanDate(input.createdAt) || new Date().toISOString();
    return {
      ...draft,
      id: this.cleanText(input.id, 160) || makeId(14),
      organizationId,
      createdAt,
      updatedAt: this.cleanDate(input.updatedAt) || createdAt,
    };
  }

  private buildPromptGuidance(
    kit: Omit<SnapsBrandKitDraft, 'promptGuidance'>
  ) {
    return [
      `Brand: ${kit.name}`,
      `Audience: ${kit.audience}`,
      `Voice: ${kit.voice}`,
      `Tone: ${kit.tone}`,
      `Values: ${kit.values.join(', ')}`,
      `Required terms: ${kit.requiredTerms.join(', ')}`,
      `Banned terms: ${kit.bannedTerms.join(', ')}`,
      `CTA: ${kit.cta}`,
      `Hashtags: ${kit.hashtags.join(' ')}`,
    ].join('\n');
  }

  private extractBrandName(value: string) {
    const match = value.match(/(?:brand|브랜드|서비스|product)\s*[:：-]\s*([^\n]{2,80})/i);
    return this.cleanText(match?.[1], 120);
  }

  private hasCasualCue(value: string) {
    return /친근|위트|유머|casual|friendly|creator/i.test(value);
  }

  private hasProofCue(value: string) {
    return /데이터|근거|증거|proof|metric|case|사례/i.test(value);
  }

  private hasBrandKitSignal(value: unknown) {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const input = value as Record<string, unknown>;
    return [
      'name',
      'brandName',
      'audience',
      'voice',
      'tone',
      'websiteText',
      'samplePosts',
      'examples',
    ].some((key) => {
      const entry = input[key];
      return Array.isArray(entry)
        ? entry.some((item) => this.cleanText(item, 20))
        : !!this.cleanText(entry, 20);
    });
  }

  private async write(organizationId: string, brandKits: SnapsBrandKitItem[]) {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.atomicWrite(
      this.filePath(organizationId),
      JSON.stringify(brandKits, null, 2)
    );
  }

  private filePath(organizationId: string) {
    const safeOrg = organizationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, `${safeOrg}.brand-kits.json`);
  }

  private cleanText(value: unknown, maxLength: number) {
    return typeof value === 'string'
      ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
      : '';
  }

  private firstLine(value: string) {
    return value
      .split(/\n|\r/)
      .map((line) => line.trim())
      .find(Boolean) || '';
  }

  private cleanStringArray(value: unknown, maxItems: number, maxLength: number) {
    const raw = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[,\n|]+/)
        : [];
    return [
      ...new Set(
        raw
          .map((item) => this.cleanText(item, maxLength))
          .filter(Boolean)
      ),
    ].slice(0, maxItems);
  }

  private cleanHashtags(value: unknown) {
    return this.cleanStringArray(value, 20, 60).map((tag) =>
      tag.startsWith('#') ? tag : `#${tag.replace(/^#+/, '')}`
    );
  }

  private cleanColors(value: unknown) {
    return this.cleanStringArray(value, 12, 20).filter((color) =>
      /^#[0-9a-f]{6}$/i.test(color)
    );
  }

  private cleanPlatforms(value: unknown): SnapsTargetPlatform[] {
    const raw = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[,\s|]+/)
        : [];
    return [
      ...new Set(
        raw
          .map((item) => this.cleanText(item, 80))
          .filter((item): item is SnapsTargetPlatform =>
            snapsTargetPlatforms.includes(item as SnapsTargetPlatform)
          )
      ),
    ].slice(0, 10);
  }

  private cleanDate(value: unknown) {
    if (typeof value !== 'string') {
      return '';
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  }

  private mergeByKey<T>(items: T[], keyFor: (item: T) => string) {
    const seen = new Set<string>();
    const merged: T[] = [];
    for (const item of items) {
      const key = keyFor(item).trim().toLowerCase();
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(item);
    }
    return merged;
  }

  private async atomicWrite(filePath: string, contents: string) {
    await writeSnapsFileAtomic(filePath, contents);
  }
}
