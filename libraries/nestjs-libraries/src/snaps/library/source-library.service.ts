import { BadRequestException, Injectable } from '@nestjs/common';
import { snapsOrgFileKey } from '@gitroom/nestjs-libraries/snaps/storage/org-file-key';
import { writeJsonFileAtomically } from '@gitroom/nestjs-libraries/snaps/storage/atomic-json-write';
import { withJsonFileLock } from '@gitroom/nestjs-libraries/snaps/storage/json-file-lock';
import { preserveUnreadableJsonFile } from '@gitroom/nestjs-libraries/snaps/storage/preserve-unreadable-file';
import { warnUnreadableJsonFile } from '@gitroom/nestjs-libraries/snaps/storage/warn-unreadable-file';
import { promises as fs } from 'fs';
import path from 'path';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { SNAPS_DEFAULT_TIMEZONE_OFFSET_MINUTES } from '@gitroom/nestjs-libraries/snaps/time/default-timezone';
import { SnapsSourceLibraryInputDto } from '@gitroom/nestjs-libraries/snaps/dto/source-library.dto';
import {
  boundStoredRecord,
  SnapsRecordBounds,
} from '@gitroom/nestjs-libraries/snaps/storage/bounded-record';
import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';
import { ensureSnapsDataDir } from '@gitroom/nestjs-libraries/snaps/storage/data-dir-health';
import { snapsCleanBodyText } from '@gitroom/nestjs-libraries/snaps/text/body-text';

export type SnapsStoredSource = SnapsSourceLibraryInputDto & {
  id: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
};

export type SnapsStoredReport = {
  id: string;
  organizationId: string;
  title: string;
  report: Record<string, unknown>;
  createdAt: string;
};

// A real report payload measures 896 characters at depth 4.
const REPORT_PAYLOAD_BOUNDS: SnapsRecordBounds = {
  maxChars: 200000,
  maxDepth: 12,
  maxKeys: 200,
  maxItems: 500,
  maxText: 20000,
};

@Injectable()
export class SnapsSourceLibraryService {
  private readonly dataDir =
    process.env.SNAPS_DATA_DIR || path.join(process.cwd(), 'var', 'snaps');

  async saveSource(organizationId: string, body?: SnapsSourceLibraryInputDto) {
    // Read-modify-write: without the lock two concurrent calls both read the
    // same list and each wrote its own version over it, losing the other's
    // change. Measured at 20 concurrent writes, 1 survived.
    return withJsonFileLock(this.filePath(organizationId, 'sources'), async () => {
      const sources = await this.readSources(organizationId);
      const now = new Date().toISOString();
      const next = this.normalizeStoredSource(organizationId, {
        ...body,
        id: makeId(14),
        createdAt: now,
        updatedAt: now,
      });
      if (!next) {
        throw new BadRequestException('sourceText는 최소 5자 이상의 문자열이어야 합니다.');
      }
      // At the cap, saving one deletes another - the last record in the file,
      // which is the oldest because record order is newest first. The import
      // path reports what the cap removed; this one returned the new record
      // and said nothing, so an operator at 500 sources lost one every time
      // they saved and was never told. Measured: 500 in, save one, 500 out,
      // and the answer mentioned none of it.
      //
      // The activity log is deliberately left alone: it is a rolling log and
      // every route writes to it, so reporting an eviction there would be
      // noise on almost every request.
      const merged = [next, ...sources];
      const evicted = merged.slice(500);
      await this.writeSources(organizationId, merged.slice(0, 500));
      return evicted.length
        ? {
            ...next,
            evicted: evicted.length,
            warning:
              `저장 원문이 상한 500개에 도달해 가장 오래된 ${evicted.length}개를 ` +
              '지웠습니다. 필요한 원문은 먼저 내보내세요.',
          }
        : next;
    });
  }

  async listSources(organizationId: string) {
    return this.readSources(organizationId);
  }

  async getSource(organizationId: string, sourceId: string) {
    const sources = await this.readSources(organizationId);
    return sources.find((source) => source.id === sourceId);
  }

  async deleteSource(organizationId: string, sourceId: string) {
    // Read-modify-write: without the lock two concurrent calls both read the
    // same list and each wrote its own version over it, losing the other's
    // change. Measured at 20 concurrent writes, 1 survived.
    return withJsonFileLock(this.filePath(organizationId, 'sources'), async () => {
      const sources = await this.readSources(organizationId);
      const next = sources.filter((source) => source.id !== sourceId);
      await this.writeSources(organizationId, next);
      return {
        deleted: next.length !== sources.length,
        total: next.length,
      };
    });
  }

  async importSources(organizationId: string, sources: unknown[] = []) {
    // Read-modify-write: without the lock two concurrent calls both read the
    // same list and each wrote its own version over it, losing the other's
    // change. Measured at 20 concurrent writes, 1 survived.
    return withJsonFileLock(this.filePath(organizationId, 'sources'), async () => {
      const current = await this.readSources(organizationId);
      const incoming = sources
        .map((source) => this.normalizeStoredSource(organizationId, source))
        .filter((source): source is SnapsStoredSource => !!source);
      const deduped = this.mergeByKey(
        [...incoming, ...current],
        (source) => source.id || source.sourceText.trim().toLowerCase()
      );
      const merged = deduped.slice(0, 500);

      await this.writeSources(organizationId, merged);
      return {
        imported: incoming.length,
        total: merged.length,
        // The cap keeps incoming entries first, so everything past it is an
        // entry the workspace already had. Measured: restoring a 400-entry
        // backup into a workspace holding 300 sources left 400 backup and 100
        // existing entries on disk - 200 were deleted - and the response said
        // total: 500, a healthy looking number for a store that had just lost
        // data. Report what the cap removed so the operator is told.
        dropped: deduped.length - merged.length,
      };
    });
  }

  async saveReport(
    organizationId: string,
    title: string,
    report: Record<string, unknown>
  ) {
    // Read-modify-write: without the lock two concurrent calls both read the
    // same list and each wrote its own version over it, losing the other's
    // change. Measured at 20 concurrent writes, 1 survived.
    return withJsonFileLock(this.filePath(organizationId, 'reports'), async () => {
      const reports = await this.readReports(organizationId);
      const next = this.normalizeStoredReport(organizationId, {
        id: makeId(14),
        organizationId,
        title,
        report,
        createdAt: new Date().toISOString(),
      });
      if (!next) {
        throw new BadRequestException('보고서 제목은 필수입니다.');
      }
      await this.writeReports(organizationId, [next, ...reports].slice(0, 200));
      return next;
    });
  }

  async listReports(organizationId: string) {
    return this.readReports(organizationId);
  }

  async deleteReport(organizationId: string, reportId: string) {
    // Read-modify-write: without the lock two concurrent calls both read the
    // same list and each wrote its own version over it, losing the other's
    // change. Measured at 20 concurrent writes, 1 survived.
    return withJsonFileLock(this.filePath(organizationId, 'reports'), async () => {
      const reports = await this.readReports(organizationId);
      const next = reports.filter((report) => report.id !== reportId);
      await this.writeReports(organizationId, next);
      return {
        deleted: next.length !== reports.length,
        total: next.length,
      };
    });
  }

  async getReport(organizationId: string, reportId: string) {
    const reports = await this.readReports(organizationId);
    return reports.find((report) => report.id === reportId);
  }

  async importReports(organizationId: string, reports: unknown[] = []) {
    // Read-modify-write: without the lock two concurrent calls both read the
    // same list and each wrote its own version over it, losing the other's
    // change. Measured at 20 concurrent writes, 1 survived.
    return withJsonFileLock(this.filePath(organizationId, 'reports'), async () => {
      const current = await this.readReports(organizationId);
      const incoming = reports
        .map((report) => this.normalizeImportedReport(organizationId, report))
        .filter((report): report is SnapsStoredReport => !!report);
      const deduped = this.mergeByKey(
        [...incoming, ...current],
        (report) => report.id || report.title.trim().toLowerCase()
      );
      const merged = deduped.slice(0, 200);

      await this.writeReports(organizationId, merged);
      return {
        imported: incoming.length,
        total: merged.length,
        // Same silent deletion as importSources above.
        dropped: deduped.length - merged.length,
      };
    });
  }

  async exportReport(
    organizationId: string,
    reportId: string,
    format: 'markdown' | 'html' | 'print-html' = 'markdown'
  ) {
    const stored = await this.getReport(organizationId, reportId);
    if (!stored) {
      return undefined;
    }

    const markdown = this.reportToMarkdown(stored);
    return {
      id: stored.id,
      title: stored.title,
      format,
      content:
        format === 'print-html'
          ? this.reportToPrintHtml(stored, markdown)
          : format === 'html'
          ? this.markdownToHtml(markdown)
          : markdown,
    };
  }

  private async readSources(organizationId: string) {
    try {
      const file = await fs.readFile(this.filePath(organizationId, 'sources'), 'utf8');
      const parsed = JSON.parse(file);
      if (!Array.isArray(parsed)) {
        warnUnreadableJsonFile(
          this.filePath(organizationId, 'sources'),
          new Error('file does not hold a JSON array'),
          '원문 라이브러리'
        );
        return [] as SnapsStoredSource[];
      }
      return parsed
        .map((source) => this.normalizeStoredSource(organizationId, source))
        .filter((source): source is SnapsStoredSource => !!source);
    } catch (error) {
      warnUnreadableJsonFile(
        this.filePath(organizationId, 'sources'),
        error,
        '원문 라이브러리'
      );
      return [] as SnapsStoredSource[];
    }
  }

  private async writeSources(organizationId: string, sources: SnapsStoredSource[]) {
    await ensureSnapsDataDir(this.dataDir);
    // The matching read answers [] for a file it cannot parse, so without this
    // a truncated file would be overwritten here and whatever it still held
    // would be gone. Move it aside first; see snaps/storage.
    const target = this.filePath(organizationId, 'sources');
    await preserveUnreadableJsonFile(target, new Date().toISOString());
    await this.atomicWrite(target, JSON.stringify(sources, null, 2));
  }

  private async readReports(organizationId: string) {
    try {
      const file = await fs.readFile(this.filePath(organizationId, 'reports'), 'utf8');
      const parsed = JSON.parse(file);
      if (!Array.isArray(parsed)) {
        warnUnreadableJsonFile(
          this.filePath(organizationId, 'reports'),
          new Error('file does not hold a JSON array'),
          '보고서 라이브러리'
        );
        return [] as SnapsStoredReport[];
      }
      return parsed
        .map((report) => this.normalizeStoredReport(organizationId, report))
        .filter((report): report is SnapsStoredReport => !!report);
    } catch (error) {
      warnUnreadableJsonFile(
        this.filePath(organizationId, 'reports'),
        error,
        '보고서 라이브러리'
      );
      return [] as SnapsStoredReport[];
    }
  }

  private async writeReports(organizationId: string, reports: SnapsStoredReport[]) {
    await ensureSnapsDataDir(this.dataDir);
    // The matching read answers [] for a file it cannot parse, so without this
    // a truncated file would be overwritten here and whatever it still held
    // would be gone. Move it aside first; see snaps/storage.
    const target = this.filePath(organizationId, 'reports');
    await preserveUnreadableJsonFile(target, new Date().toISOString());
    await this.atomicWrite(target, JSON.stringify(reports, null, 2));
  }

  private filePath(organizationId: string, name: 'sources' | 'reports') {
    // Not a plain replace: two different ids can escape to the same string
    // and share one file. See snaps/storage/org-file-key.ts.
    const safeOrg = snapsOrgFileKey(organizationId);
    return path.join(this.dataDir, `${safeOrg}.${name}.json`);
  }

  /**
   * Imports keep the timestamps they arrive with.
   *
   * An import used to stamp `updatedAt` with the moment it ran, so restoring
   * a backup made every source look freshly edited when none of the text had
   * changed. Nothing was gained by it: the merge takes the incoming copy by
   * position, not by timestamp. Measured by round-tripping a workspace
   * through export and import, this was the only field in six stores that
   * came back different - reports and agent tasks both kept theirs.
   */
  private normalizeStoredSource(
    organizationId: string,
    value: unknown
  ): SnapsStoredSource | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const source = value as Partial<SnapsStoredSource>;
    // Kept as the operator pasted it: this text is handed on to the card
    // news and RAG paths, so flattening it here lost the paragraphs
    // everywhere downstream as well.
    const sourceText = snapsCleanBodyText(source.sourceText, 50000);
    if (sourceText.length < 5) {
      return undefined;
    }

    return {
      id: this.cleanText(source.id, 160) || makeId(14),
      organizationId,
      sourceText,
      title:
        this.cleanText(source.title, 160) ||
        snapsClampText(sourceText.replace(/\s+/g, ' '), 80) ||
        'Imported source',
      sourcePlatform:
        this.cleanOptionalText(source.sourcePlatform, 120),
      topic: this.cleanOptionalText(source.topic, 240),
      tone: this.cleanOptionalText(source.tone, 240),
      tags: this.cleanTags(source.tags),
      createdAt:
        typeof source.createdAt === 'string' && source.createdAt.trim()
          ? source.createdAt
          : new Date().toISOString(),
      updatedAt:
        typeof source.updatedAt === 'string' && source.updatedAt.trim()
          ? source.updatedAt
          : typeof source.createdAt === 'string' && source.createdAt.trim()
          ? source.createdAt
          : new Date().toISOString(),
    };
  }

  private normalizeImportedReport(
    organizationId: string,
    value: unknown
  ): SnapsStoredReport | undefined {
    return this.normalizeStoredReport(organizationId, value);
  }

  private normalizeStoredReport(
    organizationId: string,
    value: unknown
  ): SnapsStoredReport | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const report = value as Partial<SnapsStoredReport>;
    const payload = this.cleanRecord(report.report) || this.cleanRecord(value);
    if (!payload) {
      return undefined;
    }
    const title = this.cleanText(report.title || payload.title, 240);
    if (!title) {
      return undefined;
    }

    return {
      id: this.cleanText(report.id, 160) || makeId(14),
      organizationId,
      title,
      // Measured at 896 characters and four levels for a real report; the
      // bound is orders of magnitude above that and exists because one
      // imported record carrying 500 long action items wrote a 100MB file.
      report: boundStoredRecord(payload, REPORT_PAYLOAD_BOUNDS, '보고서 내용') || {},
      createdAt:
        typeof report.createdAt === 'string' && report.createdAt.trim()
          ? report.createdAt
          : new Date().toISOString(),
    };
  }

  private mergeByKey<T>(items: T[], keyOf: (item: T) => string) {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = keyOf(item);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * The window the report covers, as a label, or nothing when it has none.
   */
  private reportPeriodLabel(report: Record<string, unknown>) {
    const start = this.cleanText(report.periodStart, 80);
    const end = this.cleanText(report.periodEnd, 80);
    if (!start) {
      return '';
    }
    const startDay = start.slice(0, 10);
    const endDay = end.slice(0, 10);
    return endDay && endDay !== startDay ? `${startDay} ~ ${endDay}` : startDay;
  }

  /**
   * A timestamp an operator can read.
   *
   * The export printed the stored ISO string, which is UTC: for the Korean
   * operators this product is built for, every exported report was stamped nine
   * hours from when it was generated. There is no browser offset here, so the
   * product default is used - the same constant the agent planner falls back to.
   */
  private exportTimestamp(iso: string) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }
    const shifted = new Date(
      date.getTime() - SNAPS_DEFAULT_TIMEZONE_OFFSET_MINUTES * 60000
    );
    const pad = (value: number) => String(value).padStart(2, '0');
    return (
      `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-` +
      `${pad(shifted.getUTCDate())} ${pad(shifted.getUTCHours())}:` +
      `${pad(shifted.getUTCMinutes())} (KST)`
    );
  }

  /**
   * The growth rate beside an absolute change, on the same terms the insights
   * use: nothing when there is no baseline, because deltaRate is 0 there and
   * reporting it would say a metric that grew from nothing grew 0%.
   */
  private exportRate(trend: Record<string, unknown>) {
    const first = Number(trend.firstValue);
    const rate = Number(trend.deltaRate);
    if (!first || !Number.isFinite(rate) || !rate) {
      return '';
    }
    const percent = rate * 100;
    const rounded =
      Math.abs(percent) >= 10 ? Math.round(percent) : Number(percent.toFixed(1));
    return `, ${rounded > 0 ? '+' : ''}${rounded}%`;
  }

  private reportToMarkdown(stored: SnapsStoredReport) {
    const report: Record<string, unknown> = stored.report || {};
    // The exported document is the artefact an operator forwards to someone
    // else, and it lagged both the workspace and the insights: the section
    // headings were English in a product whose content is Korean, the timestamp
    // was raw UTC, the period the numbers cover was missing entirely, and the
    // trend lines carried the absolute change without the rate that had been
    // computed alongside it.
    const period = this.reportPeriodLabel(report);
    const lines = [
      `# ${this.cleanText(report.title, 240) || stored.title}`,
      '',
      `생성 시각: ${this.exportTimestamp(
        this.cleanText(report.generatedAt, 80) || stored.createdAt
      )}`,
      ...(period ? [`대상 기간: ${period}`] : []),
      '',
      '## 요약',
      '',
      this.cleanText(report.summary, 2000),
      '',
    ];

    if (Array.isArray(report.warnings) && report.warnings.length) {
      lines.push('## 수집 경고', '');
      for (const warning of report.warnings) {
        const text = this.cleanText(warning, 800);
        if (text) {
          lines.push(`- ${text}`);
        }
      }
      lines.push('');
    }

    if (Array.isArray(report.insights) && report.insights.length) {
      lines.push('## 인사이트', '');
      for (const insight of report.insights) {
        const text = this.cleanText(insight, 800);
        if (text) {
          lines.push(`- ${text}`);
        }
      }
      lines.push('');
    }

    if (Array.isArray(report.actionItems) && report.actionItems.length) {
      lines.push('## 실행 항목', '');
      for (const action of report.actionItems) {
        const text = this.cleanText(action, 800);
        if (text) {
          lines.push(`- ${text}`);
        }
      }
      lines.push('');
    }

    if (Array.isArray(report.trends) && report.trends.length) {
      lines.push('## 추세', '');
      for (const trend of report.trends) {
        const item = trend as Record<string, unknown>;
        const platform = this.cleanText(item.platform, 120) || 'unknown';
        const metricKey = this.cleanText(item.metricKey, 120) || 'metric';
        lines.push(
          `- ${platform} / ${metricKey}: ${this.cleanMetricValue(item.firstValue)} -> ` +
            `${this.cleanMetricValue(item.lastValue)} (${this.cleanMetricValue(item.delta)}` +
            `${this.exportRate(item)})`
        );
      }
      lines.push('');
    }

    if (this.cleanRecord(report.metrics)) {
      lines.push('## 지표', '');
      for (const [platform, metrics] of Object.entries(
        report.metrics as Record<string, unknown>
      )) {
        const platformName = this.cleanText(platform, 120);
        const metricRecord = this.cleanRecord(metrics);
        if (!platformName || !metricRecord) {
          continue;
        }
        lines.push(`### ${platformName}`, '');
        for (const [key, value] of Object.entries(metricRecord)) {
          const metricName = this.cleanText(key, 120);
          const metricValue = this.cleanMetricValue(value);
          if (metricName && metricValue) {
            lines.push(`- ${metricName}: ${metricValue}`);
          }
        }
        lines.push('');
      }
    }

    return lines.join('\n').trim() + '\n';
  }

  /**
   * The report as HTML, for the operator to paste somewhere.
   *
   * Bullets used to be emitted as bare `<li>` with no list around them.
   * Measured on a report with two insights and two action items: four `<li>`
   * elements and no `<ul>` anywhere. A browser renders that anyway, which is
   * why it went unnoticed - and the print stylesheet had grown
   * `li { margin: 7px 0 7px 20px; }` to fake the indent, so the symptom had
   * been worked around rather than fixed. Pasted into a document, an email or
   * a page editor, bare list items are not a list: they lose their markers,
   * their nesting and, for a screen reader, the fact that they are a list at
   * all.
   *
   * Consecutive bullets become one list; a non-bullet line closes it.
   */
  private markdownToHtml(markdown: string) {
    const out: string[] = [];
    let inList = false;
    const closeList = () => {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
    };

    for (const line of markdown.split('\n')) {
      if (line.startsWith('- ')) {
        if (!inList) {
          out.push('<ul>');
          inList = true;
        }
        out.push(`<li>${this.escapeHtml(line.slice(2))}</li>`);
        continue;
      }

      closeList();
      if (line.startsWith('# ')) {
        out.push(`<h1>${this.escapeHtml(line.slice(2))}</h1>`);
        continue;
      }
      if (line.startsWith('## ')) {
        out.push(`<h2>${this.escapeHtml(line.slice(3))}</h2>`);
        continue;
      }
      if (line.startsWith('### ')) {
        out.push(`<h3>${this.escapeHtml(line.slice(4))}</h3>`);
        continue;
      }
      const escaped = this.escapeHtml(line);
      if (escaped) {
        out.push(`<p>${escaped}</p>`);
      }
    }
    closeList();

    return out.join('\n');
  }

  private reportToPrintHtml(stored: SnapsStoredReport, markdown: string) {
    const title = this.escapeHtml(stored.title);
    const body = this.markdownToHtml(markdown);
    return [
      '<!doctype html>',
      '<html lang="ko">',
      '<head>',
      '<meta charset="utf-8" />',
      '<meta name="viewport" content="width=device-width, initial-scale=1" />',
      `<title>${title}</title>`,
      '<style>',
      ':root { color-scheme: light; }',
      'body { margin: 0; background: #f4f7fb; color: #172033; font-family: Arial, "Noto Sans KR", sans-serif; line-height: 1.65; }',
      '.page { max-width: 920px; margin: 0 auto; padding: 40px 28px 56px; }',
      '.sheet { background: #fff; border: 1px solid #d8e0ec; border-radius: 8px; padding: 44px; box-shadow: 0 18px 50px rgba(16, 29, 52, 0.08); }',
      '.brand { color: #0f766e; font-size: 12px; font-weight: 700; letter-spacing: 0; text-transform: uppercase; margin-bottom: 16px; }',
      'h1 { font-size: 30px; line-height: 1.25; margin: 0 0 22px; }',
      'h2 { font-size: 20px; margin: 34px 0 12px; border-top: 1px solid #e4e9f2; padding-top: 22px; }',
      'h3 { font-size: 16px; margin: 18px 0 8px; }',
      'p { margin: 8px 0; }',
      // The list has its own indent now that the bullets sit inside a
      // `<ul>`; the 20px that used to be on each `li` was standing in for
      // the list that was not there, and keeping both would indent twice.
      'ul { margin: 8px 0; padding-left: 22px; }',
      'li { margin: 7px 0; }',
      '@media print { body { background: #fff; } .page { max-width: none; padding: 0; } .sheet { border: 0; box-shadow: none; border-radius: 0; padding: 0; } }',
      '</style>',
      '</head>',
      '<body>',
      '<main class="page">',
      '<article class="sheet">',
      // The product name stays as it is; the descriptor beside it follows the
      // rest of the document, which is Korean.
      '<div class="brand">snaps 분석 보고서</div>',
      body,
      '</article>',
      '</main>',
      '</body>',
      '</html>',
    ].join('\n');
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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

    return snapsClampText(raw.trim().replace(/\s+/g, ' '), maxLength);
  }

  private cleanOptionalText(value: unknown, maxLength = 1000) {
    const text = this.cleanText(value, maxLength);
    return text || undefined;
  }

  private cleanMetricValue(value: unknown) {
    const text = this.cleanText(value, 160);
    return text || '0';
  }

  private cleanTags(value: unknown) {
    return Array.isArray(value)
      ? [
          ...new Set(
            value
              .map((tag) => this.cleanText(tag, 80))
              .filter(Boolean)
          ),
        ].slice(0, 30)
      : [];
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
}
