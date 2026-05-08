import { BadRequestException, Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import path from 'path';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { SnapsSourceLibraryInputDto } from '@gitroom/nestjs-libraries/snaps/dto/source-library.dto';

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

@Injectable()
export class SnapsSourceLibraryService {
  private readonly dataDir =
    process.env.SNAPS_DATA_DIR || path.join(process.cwd(), 'var', 'snaps');

  async saveSource(organizationId: string, body?: SnapsSourceLibraryInputDto) {
    const sources = await this.readSources(organizationId);
    const now = new Date().toISOString();
    const next = this.normalizeStoredSource(organizationId, {
      ...body,
      id: makeId(14),
      createdAt: now,
      updatedAt: now,
    });
    if (!next) {
      throw new BadRequestException('sourceText must be a string with at least 5 characters.');
    }
    await this.writeSources(organizationId, [next, ...sources].slice(0, 500));
    return next;
  }

  async listSources(organizationId: string) {
    return this.readSources(organizationId);
  }

  async getSource(organizationId: string, sourceId: string) {
    const sources = await this.readSources(organizationId);
    return sources.find((source) => source.id === sourceId);
  }

  async deleteSource(organizationId: string, sourceId: string) {
    const sources = await this.readSources(organizationId);
    const next = sources.filter((source) => source.id !== sourceId);
    await this.writeSources(organizationId, next);
    return {
      deleted: next.length !== sources.length,
      total: next.length,
    };
  }

  async importSources(organizationId: string, sources: unknown[] = []) {
    const current = await this.readSources(organizationId);
    const now = new Date().toISOString();
    const incoming = sources
      .map((source) => this.normalizeImportedSource(organizationId, source, now))
      .filter((source): source is SnapsStoredSource => !!source);
    const merged = this.mergeByKey(
      [...incoming, ...current],
      (source) => source.id || source.sourceText.trim().toLowerCase()
    ).slice(0, 500);

    await this.writeSources(organizationId, merged);
    return {
      imported: incoming.length,
      total: merged.length,
    };
  }

  async saveReport(
    organizationId: string,
    title: string,
    report: Record<string, unknown>
  ) {
    const reports = await this.readReports(organizationId);
    const next = this.normalizeStoredReport(organizationId, {
      id: makeId(14),
      organizationId,
      title,
      report,
      createdAt: new Date().toISOString(),
    });
    if (!next) {
      throw new BadRequestException('report title is required.');
    }
    await this.writeReports(organizationId, [next, ...reports].slice(0, 200));
    return next;
  }

  async listReports(organizationId: string) {
    return this.readReports(organizationId);
  }

  async deleteReport(organizationId: string, reportId: string) {
    const reports = await this.readReports(organizationId);
    const next = reports.filter((report) => report.id !== reportId);
    await this.writeReports(organizationId, next);
    return {
      deleted: next.length !== reports.length,
      total: next.length,
    };
  }

  async getReport(organizationId: string, reportId: string) {
    const reports = await this.readReports(organizationId);
    return reports.find((report) => report.id === reportId);
  }

  async importReports(organizationId: string, reports: unknown[] = []) {
    const current = await this.readReports(organizationId);
    const incoming = reports
      .map((report) => this.normalizeImportedReport(organizationId, report))
      .filter((report): report is SnapsStoredReport => !!report);
    const merged = this.mergeByKey(
      [...incoming, ...current],
      (report) => report.id || report.title.trim().toLowerCase()
    ).slice(0, 200);

    await this.writeReports(organizationId, merged);
    return {
      imported: incoming.length,
      total: merged.length,
    };
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
        return [] as SnapsStoredSource[];
      }
      return parsed
        .map((source) => this.normalizeStoredSource(organizationId, source))
        .filter((source): source is SnapsStoredSource => !!source);
    } catch {
      return [] as SnapsStoredSource[];
    }
  }

  private async writeSources(organizationId: string, sources: SnapsStoredSource[]) {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.atomicWrite(
      this.filePath(organizationId, 'sources'),
      JSON.stringify(sources, null, 2)
    );
  }

  private async readReports(organizationId: string) {
    try {
      const file = await fs.readFile(this.filePath(organizationId, 'reports'), 'utf8');
      const parsed = JSON.parse(file);
      if (!Array.isArray(parsed)) {
        return [] as SnapsStoredReport[];
      }
      return parsed
        .map((report) => this.normalizeStoredReport(organizationId, report))
        .filter((report): report is SnapsStoredReport => !!report);
    } catch {
      return [] as SnapsStoredReport[];
    }
  }

  private async writeReports(organizationId: string, reports: SnapsStoredReport[]) {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.atomicWrite(
      this.filePath(organizationId, 'reports'),
      JSON.stringify(reports, null, 2)
    );
  }

  private filePath(organizationId: string, name: 'sources' | 'reports') {
    const safeOrg = organizationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, `${safeOrg}.${name}.json`);
  }

  private normalizeImportedSource(
    organizationId: string,
    value: unknown,
    now: string
  ): SnapsStoredSource | undefined {
    const source = this.normalizeStoredSource(organizationId, value);
    if (!source) {
      return undefined;
    }

    return {
      ...source,
      updatedAt: now,
    };
  }

  private normalizeStoredSource(
    organizationId: string,
    value: unknown
  ): SnapsStoredSource | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const source = value as Partial<SnapsStoredSource>;
    const sourceText = this.cleanText(source.sourceText, 50000);
    if (sourceText.length < 5) {
      return undefined;
    }

    return {
      id: this.cleanText(source.id, 160) || makeId(14),
      organizationId,
      sourceText,
      title:
        this.cleanText(source.title, 160) ||
        sourceText.replace(/\s+/g, ' ').slice(0, 80) ||
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
      report: payload,
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

  private reportToMarkdown(stored: SnapsStoredReport) {
    const report: Record<string, unknown> = stored.report || {};
    const lines = [
      `# ${this.cleanText(report.title, 240) || stored.title}`,
      '',
      `Generated: ${this.cleanText(report.generatedAt, 80) || stored.createdAt}`,
      '',
      '## Summary',
      '',
      this.cleanText(report.summary, 2000),
      '',
    ];

    if (Array.isArray(report.warnings) && report.warnings.length) {
      lines.push('## Warnings', '');
      for (const warning of report.warnings) {
        const text = this.cleanText(warning, 800);
        if (text) {
          lines.push(`- ${text}`);
        }
      }
      lines.push('');
    }

    if (Array.isArray(report.insights) && report.insights.length) {
      lines.push('## Insights', '');
      for (const insight of report.insights) {
        const text = this.cleanText(insight, 800);
        if (text) {
          lines.push(`- ${text}`);
        }
      }
      lines.push('');
    }

    if (Array.isArray(report.actionItems) && report.actionItems.length) {
      lines.push('## Action Items', '');
      for (const action of report.actionItems) {
        const text = this.cleanText(action, 800);
        if (text) {
          lines.push(`- ${text}`);
        }
      }
      lines.push('');
    }

    if (Array.isArray(report.trends) && report.trends.length) {
      lines.push('## Trends', '');
      for (const trend of report.trends) {
        const item = trend as Record<string, unknown>;
        const platform = this.cleanText(item.platform, 120) || 'unknown';
        const metricKey = this.cleanText(item.metricKey, 120) || 'metric';
        lines.push(
          `- ${platform} / ${metricKey}: ${this.cleanMetricValue(item.firstValue)} -> ${this.cleanMetricValue(item.lastValue)} (${this.cleanMetricValue(item.delta)})`
        );
      }
      lines.push('');
    }

    if (this.cleanRecord(report.metrics)) {
      lines.push('## Metrics', '');
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

  private markdownToHtml(markdown: string) {
    return markdown
      .split('\n')
      .map((line) => {
        if (line.startsWith('# ')) {
          return `<h1>${this.escapeHtml(line.slice(2))}</h1>`;
        }
        if (line.startsWith('## ')) {
          return `<h2>${this.escapeHtml(line.slice(3))}</h2>`;
        }
        if (line.startsWith('### ')) {
          return `<h3>${this.escapeHtml(line.slice(4))}</h3>`;
        }
        if (line.startsWith('- ')) {
          return `<li>${this.escapeHtml(line.slice(2))}</li>`;
        }
        const escaped = this.escapeHtml(line);
        return escaped ? `<p>${escaped}</p>` : '';
      })
      .filter(Boolean)
      .join('\n');
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
      'li { margin: 7px 0 7px 20px; }',
      '@media print { body { background: #fff; } .page { max-width: none; padding: 0; } .sheet { border: 0; box-shadow: none; border-radius: 0; padding: 0; } }',
      '</style>',
      '</head>',
      '<body>',
      '<main class="page">',
      '<article class="sheet">',
      '<div class="brand">snaps Analytics Report</div>',
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

    return raw.trim().replace(/\s+/g, ' ').slice(0, maxLength);
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

  private async atomicWrite(filePath: string, content: string) {
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmpPath, content, 'utf8');
    await fs.rename(tmpPath, filePath);
  }
}
