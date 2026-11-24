import { BadRequestException, Injectable } from '@nestjs/common';
import { SnapsSourceLibraryInputDto } from '@gitroom/nestjs-libraries/snaps/dto/source-library.dto';
import { SnapsVariant } from '@gitroom/nestjs-libraries/snaps/dto/transform-result.dto';
import {
  SnapsTargetPlatform,
  snapsPlatformRules,
  snapsTargetPlatforms,
  fitSnapsContent,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import { cleanSnapsMultilineText } from '@gitroom/nestjs-libraries/snaps/utils/multiline-text';

export type SnapsBulkCampaignRequest = {
  csvText?: unknown;
  defaultTone?: unknown;
  defaultTopic?: unknown;
  defaultPlatforms?: unknown;
  maxRows?: unknown;
};

export type SnapsBulkCampaignRowStatus = 'ready' | 'warning' | 'invalid';

export type SnapsBulkCampaignRow = {
  rowNumber: number;
  title: string;
  sourceText: string;
  topic?: string;
  tone?: string;
  platforms: SnapsTargetPlatform[];
  scheduleType: 'draft' | 'schedule';
  publishDate?: string;
  mediaUrl?: string;
  linkUrl?: string;
  tags: string[];
  warnings: string[];
  status: SnapsBulkCampaignRowStatus;
};

export type SnapsBulkCampaignPreview = {
  product: 'snaps';
  source: 'snaps-bulk-csv';
  columns: string[];
  sampleCsv: string;
  totalRows: number;
  acceptedRows: number;
  invalidRows: number;
  readyToSchedule: number;
  rows: SnapsBulkCampaignRow[];
};

@Injectable()
export class SnapsBulkCampaignService {
  readonly sampleCsv = [
    'title,topic,caption,platforms,publishDate,mediaUrl,linkUrl,tags',
    'AI 리포트 티저,B2B 콘텐츠 자동화,"이번 주 리포트에서 가장 많이 저장된 자동화 체크리스트를 요약합니다.","instagram|threads|linkedin",2026-06-02T10:00:00+09:00,https://example.com/visual.png,https://example.com/report,"AI|자동화|리포트"',
    '고객 질문 답변,세일즈 FAQ,"가격을 묻는 댓글에 바로 답할 수 있는 3문장 템플릿입니다.","threads|naver-blog",,,https://example.com/pricing,"FAQ|세일즈"',
  ].join('\n');

  preview(body?: SnapsBulkCampaignRequest): SnapsBulkCampaignPreview {
    const request = body || {};
    const csvText = this.cleanCsvText(request.csvText, 250000);
    if (!csvText) {
      throw new BadRequestException('csvText is required for bulk campaign import.');
    }

    const parsed = this.parseCsv(csvText);
    const headers = parsed[0]?.map((header) => header.replace(/^\uFEFF/, '').trim()) || [];
    if (!headers.length || parsed.length < 2) {
      throw new BadRequestException('CSV must include a header row and at least one content row.');
    }

    const headerIndex = new Map<string, number>();
    headers.forEach((header, index) => {
      const normalized = this.normalizeHeader(header);
      if (normalized && !headerIndex.has(normalized)) {
        headerIndex.set(normalized, index);
      }
    });

    const maxRows = this.clampNumber(request.maxRows, 500, 1, 500);
    const defaultTone = this.cleanText(request.defaultTone, 240);
    const defaultTopic = this.cleanText(request.defaultTopic, 240);
    const defaultPlatforms = this.cleanPlatforms(request.defaultPlatforms);
    const rows = parsed
      .slice(1, maxRows + 1)
      .map((rawRow, index) =>
        this.normalizeRow(rawRow, index + 2, headerIndex, {
          defaultTone,
          defaultTopic,
          defaultPlatforms,
        })
      )
      .filter((row): row is SnapsBulkCampaignRow => !!row);

    return {
      product: 'snaps',
      source: 'snaps-bulk-csv',
      columns: headers,
      sampleCsv: this.sampleCsv,
      totalRows: rows.length,
      acceptedRows: rows.filter((row) => row.status !== 'invalid').length,
      invalidRows: rows.filter((row) => row.status === 'invalid').length,
      readyToSchedule: rows.filter((row) => row.status === 'ready').length,
      rows,
    };
  }

  toSourceInputs(rows: SnapsBulkCampaignRow[]): SnapsSourceLibraryInputDto[] {
    return rows
      .filter((row) => row.status !== 'invalid')
      .map((row) => ({
        title: row.title,
        sourceText: this.decorateSourceText(row),
        topic: row.topic,
        tone: row.tone,
        sourcePlatform: 'bulk-csv',
        tags: ['bulk-csv', row.scheduleType, ...row.platforms, ...row.tags],
      }));
  }

  toVariants(row: SnapsBulkCampaignRow): SnapsVariant[] {
    if (row.status === 'invalid') {
      return [];
    }

    return row.platforms.map((platform) => {
      const rule = snapsPlatformRules[platform];
      const content = fitSnapsContent(platform, this.decorateVariantContent(row, rule.maxLength));
      return {
        platform,
        label: rule.label,
        title: row.title,
        content,
        hashtags: this.toHashtags(row.tags, rule.hashtagLimit),
        settings: {
          source: 'snaps-bulk-csv',
          mediaUrl: row.mediaUrl,
          linkUrl: row.linkUrl,
          subject: row.title,
        },
        publishMode: rule.publishMode,
        notes: [
          row.topic ? `topic: ${row.topic}` : '',
          row.publishDate ? `publishDate: ${row.publishDate}` : '',
          row.mediaUrl ? `media: ${row.mediaUrl}` : '',
          row.linkUrl ? `link: ${row.linkUrl}` : '',
        ].filter(Boolean),
      };
    });
  }

  private normalizeRow(
    rawRow: string[],
    rowNumber: number,
    headerIndex: Map<string, number>,
    defaults: {
      defaultTone?: string;
      defaultTopic?: string;
      defaultPlatforms: SnapsTargetPlatform[];
    }
  ): SnapsBulkCampaignRow | undefined {
    if (!rawRow.some((cell) => String(cell || '').trim())) {
      return undefined;
    }

    const pick = (aliases: string[], maxLength = 5000, multiline = false) => {
      for (const alias of aliases) {
        const index = headerIndex.get(alias);
        if (typeof index === 'number') {
          return multiline
            ? cleanSnapsMultilineText(rawRow[index], maxLength)
            : this.cleanText(rawRow[index], maxLength);
        }
      }
      return '';
    };

    const caption = pick(
      ['sourcetext', 'content', 'caption', 'post', 'text', 'body', 'copy'],
      50000,
      true
    );
    const title =
      pick(['title', 'headline', 'name'], 180) ||
      caption.replace(/\s+/g, ' ').slice(0, 80) ||
      `Bulk row ${rowNumber}`;
    const topic =
      pick(['topic', 'campaign', 'category', 'pillar', 'theme'], 240) ||
      defaults.defaultTopic ||
      undefined;
    const tone = pick(['tone', 'voice', 'style'], 240) || defaults.defaultTone || undefined;
    const rowPlatforms = this.cleanPlatforms(
      pick(['platforms', 'platform', 'channels', 'accounts'], 500)
    );
    const platforms = rowPlatforms.length ? rowPlatforms : defaults.defaultPlatforms;
    const publishDate = this.cleanText(
      pick(['publishdate', 'scheduledat', 'postingtime', 'date', 'datetime'], 120),
      120
    );
    const scheduleType = this.cleanScheduleType(
      pick(['scheduletype', 'status', 'mode', 'type'], 80),
      publishDate
    );
    const mediaUrl = pick(['mediaurl', 'media', 'image', 'imageurl', 'videourl', 'asseturl'], 2000);
    const linkUrl = pick(['linkurl', 'link', 'url', 'destinationurl'], 2000);
    const tags = this.cleanTags(pick(['tags', 'hashtags', 'labels'], 1000));
    const warnings: string[] = [];

    if (caption.length < 5) {
      warnings.push('caption/sourceText must be at least 5 characters.');
    }
    if (!platforms.length) {
      warnings.push('No supported snaps platforms were found for this row.');
    }
    if (scheduleType === 'schedule') {
      if (!publishDate) {
        warnings.push('publishDate is required for scheduled bulk rows.');
      } else {
        const parsedDate = new Date(publishDate);
        if (Number.isNaN(parsedDate.getTime())) {
          warnings.push('publishDate is not a valid date.');
        } else if (parsedDate.getTime() < Date.now()) {
          warnings.push('publishDate is in the past; import is allowed but scheduling should be reviewed.');
        }
      }
    }

    const status: SnapsBulkCampaignRowStatus =
      caption.length < 5 || !platforms.length
        ? 'invalid'
        : warnings.length
          ? 'warning'
          : 'ready';

    return {
      rowNumber,
      title,
      sourceText: caption,
      topic,
      tone,
      platforms,
      scheduleType,
      publishDate: publishDate || undefined,
      mediaUrl: mediaUrl || undefined,
      linkUrl: linkUrl || undefined,
      tags,
      warnings,
      status,
    };
  }

  private parseCsv(text: string) {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];
      if (quoted) {
        if (char === '"' && next === '"') {
          field += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') {
        quoted = true;
        continue;
      }
      if (char === ',') {
        row.push(field);
        field = '';
        continue;
      }
      if (char === '\n') {
        row.push(field.replace(/\r$/, ''));
        rows.push(row);
        row = [];
        field = '';
        continue;
      }
      field += char;
    }

    row.push(field.replace(/\r$/, ''));
    rows.push(row);
    return rows.filter((items) => items.some((item) => String(item || '').trim()));
  }

  private decorateSourceText(row: SnapsBulkCampaignRow) {
    return [
      row.sourceText,
      row.linkUrl ? `Link: ${row.linkUrl}` : '',
      row.mediaUrl ? `Media: ${row.mediaUrl}` : '',
    ].filter(Boolean).join('\n\n');
  }

  private decorateVariantContent(row: SnapsBulkCampaignRow, maxLength: number) {
    const parts = [
      row.sourceText,
      row.linkUrl ? row.linkUrl : '',
    ].filter(Boolean);
    return parts.join('\n\n').slice(0, maxLength);
  }

  private toHashtags(tags: string[], limit = 5) {
    return tags
      .map((tag) => tag.replace(/^#+/, '').replace(/\s+/g, ''))
      .filter(Boolean)
      .map((tag) => `#${tag}`)
      .slice(0, Math.max(0, limit));
  }

  private cleanTags(value: unknown) {
    const raw = this.cleanText(value, 1000);
    return [
      ...new Set(
        raw
          .split(/[|,;#\s]+/g)
          .map((tag) => tag.trim().replace(/^#+/, ''))
          .filter((tag) => tag.length > 1)
      ),
    ].slice(0, 20);
  }

  private cleanPlatforms(value: unknown): SnapsTargetPlatform[] {
    const raw =
      Array.isArray(value)
        ? value.map((item) => this.cleanText(item, 80)).join('|')
        : this.cleanText(value, 1000);
    const parts = raw
      .split(/[|,;]+/g)
      .map((item) => this.normalizePlatform(item))
      .filter((platform): platform is SnapsTargetPlatform => !!platform);
    return [...new Set(parts)].slice(0, 10);
  }

  private normalizePlatform(value: unknown): SnapsTargetPlatform | undefined {
    const normalized = this.cleanText(value, 80)
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[\s_]+/g, '-');
    const aliases: Record<string, SnapsTargetPlatform> = {
      ig: 'instagram',
      insta: 'instagram',
      instagram: 'instagram',
      thread: 'threads',
      threads: 'threads',
      bluesky: 'bluesky',
      bsky: 'bluesky',
      facebook: 'facebook',
      fb: 'facebook',
      pinterest: 'pinterest',
      pin: 'pinterest',
      youtube: 'youtube',
      'youtube-shorts': 'youtube',
      shorts: 'youtube',
      tiktok: 'tiktok',
      'tik-tok': 'tiktok',
      xhs: 'xiaohongshu',
      xiaohongshu: 'xiaohongshu',
      'naver-blog': 'naver-blog',
      blog: 'naver-blog',
      'naver-cafe': 'naver-cafe',
      cafe: 'naver-cafe',
      kakao: 'kakao-talk',
      'kakao-talk': 'kakao-talk',
      linkedin: 'linkedin',
      'linked-in': 'linkedin',
      x: 'x',
      twitter: 'x',
    };
    const platform = aliases[normalized] || normalized;
    return snapsTargetPlatforms.includes(platform as SnapsTargetPlatform)
      ? (platform as SnapsTargetPlatform)
      : undefined;
  }

  private cleanScheduleType(value: unknown, publishDate?: string): 'draft' | 'schedule' {
    const normalized = this.cleanText(value, 80).toLowerCase();
    if (['schedule', 'scheduled', '예약', 'queue', 'queued'].includes(normalized)) {
      return 'schedule';
    }
    if (['draft', '초안', 'reminder', 'manual'].includes(normalized)) {
      return 'draft';
    }
    return publishDate ? 'schedule' : 'draft';
  }

  private normalizeHeader(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
  }

  private cleanCsvText(value: unknown, maxLength: number) {
    return typeof value === 'string' ? value.replace(/^\uFEFF/, '').trim().slice(0, maxLength) : '';
  }

  private cleanText(value: unknown, maxLength = 1000) {
    let raw = '';
    if (typeof value === 'string') {
      raw = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      raw = String(value);
    }
    return raw.trim().replace(/\s+/g, ' ').slice(0, maxLength);
  }

  private clampNumber(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.floor(parsed)));
  }
}
