import { Injectable } from '@nestjs/common';
import { OllamaClient } from '@gitroom/nestjs-libraries/snaps/ai/ollama.client';

export type SnapsShortVideoRequest = {
  sourceText: string;
  durationSeconds?: 30 | 45 | 60;
  platform?: 'instagram' | 'youtube' | 'tiktok';
};

export type SnapsShortVideoScript = {
  title: string;
  coreSummary: string;
  hook: string;
  durationSeconds: 30 | 45 | 60;
  narration: string;
  storyboard: Array<{
    scene: number;
    startSecond: number;
    endSecond: number;
    visual: string;
    narration: string;
    overlayText: string;
    pixellePrompt: string;
  }>;
  caption: string;
  uploadMetadata: {
    title: string;
    description: string;
    hashtags: string[];
  };
  hashtags: string[];
};

type SnapsPixelleResponse = Record<string, unknown> & {
  status: string;
  message?: string;
  jobId?: string;
  id?: string;
  videoUrl?: string;
  thumbnail?: string;
  script?: SnapsShortVideoScript;
};

@Injectable()
export class SnapsShortVideoService {
  constructor(private readonly ollama: OllamaClient) {}

  async script(body?: SnapsShortVideoRequest) {
    const request = this.normalizeRequest(body);
    try {
      const script = await this.ollama.chatJson<unknown>([
        {
          role: 'system',
          content:
            'You are snaps Pixelle shorts planner. Return strict JSON only. Create Korean short-form video scripts with production-ready scene prompts.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Create a short-form video plan for Pixelle and social upload.',
            outputShape: {
              title: 'string',
              coreSummary: 'string',
              hook: 'string',
              durationSeconds: '30 | 45 | 60',
              narration: 'string',
              storyboard: [
                {
                  scene: 'number',
                  startSecond: 'number',
                  endSecond: 'number',
                  visual: 'string',
                  narration: 'string',
                  overlayText: 'string',
                  pixellePrompt: 'string',
                },
              ],
              caption: 'string',
              uploadMetadata: {
                title: 'string',
                description: 'string',
                hashtags: ['string'],
              },
              hashtags: ['string'],
            },
            rules: [
              'Write in Korean unless platform conventions require an English tag.',
              'Split the storyboard into 4 to 6 scenes with readable timings.',
              'Keep narration suitable for the selected duration.',
              'Pixelle prompts should describe visible shots, motion, composition, and text overlays.',
              'Do not invent facts not present in sourceText.',
            ],
            ...request,
            durationSeconds: request.durationSeconds || 45,
            platform: request.platform || 'youtube',
          }),
        },
      ]);
      return this.normalizeScript(script, request);
    } catch {
      return this.fallbackScript(request);
    }
  }

  async generate(body?: SnapsShortVideoRequest) {
    const request = this.normalizeRequest(body);
    const script = await this.script(request);
    const pixelleUrl = process.env.PIXELLE_VIDEO_URL;
    if (!pixelleUrl) {
      return {
        status: 'script-ready',
        message: 'PIXELLE_VIDEO_URL is not configured. Script is ready for Pixelle submission.',
        script,
      };
    }

    const response = await fetch(`${pixelleUrl.replace(/\/$/, '')}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...request,
        sourceText: this.cleanSourceText(request.sourceText),
        durationSeconds: script.durationSeconds,
        platform: request.platform || 'youtube',
        script,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Pixelle request failed: ${response.status} ${await this.readPixelleResponseSnippet(response)}`
      );
    }

    return this.normalizePixelleResponse(
      await this.readPixelleResponsePayload(response),
      script
    );
  }

  async status(jobId: string) {
    const pixelleUrl = process.env.PIXELLE_VIDEO_URL;
    if (!pixelleUrl) {
      return {
        status: 'not-configured',
        message: 'PIXELLE_VIDEO_URL is not configured.',
      };
    }

    const response = await fetch(
      `${pixelleUrl.replace(/\/$/, '')}/status/${encodeURIComponent(jobId)}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      }
    );

    if (!response.ok) {
      throw new Error(
        `Pixelle status failed: ${response.status} ${await this.readPixelleResponseSnippet(response)}`
      );
    }

    return this.normalizePixelleResponse(
      await this.readPixelleResponsePayload(response)
    );
  }

  private normalizeScript(
    script: unknown,
    body: SnapsShortVideoRequest
  ): SnapsShortVideoScript {
    const fallback = this.fallbackScript(body);
    const root = this.record(script);
    const uploadMetadata = this.record(root.uploadMetadata);
    const durationSeconds = this.duration(body.durationSeconds ?? root.durationSeconds);
    const hashtags = this.cleanHashtags(root.hashtags || uploadMetadata.hashtags || fallback.hashtags);
    const sourceStoryboard = Array.isArray(root.storyboard)
      ? root.storyboard.slice(0, 6)
      : [];
    const storyboard = sourceStoryboard.length
      ? sourceStoryboard.map((sceneValue, index) => {
          const scene = this.record(sceneValue);
          const fallbackScene =
            fallback.storyboard[Math.min(index, fallback.storyboard.length - 1)] ||
            fallback.storyboard[0];
          const sceneCount = sourceStoryboard.length || fallback.storyboard.length;
          const defaultStart = Math.floor((durationSeconds / sceneCount) * index);
          const defaultEnd =
            index === sceneCount - 1
              ? durationSeconds
              : Math.floor((durationSeconds / sceneCount) * (index + 1));
          const startSecond = this.clampSecond(
            this.number(scene.startSecond, defaultStart),
            0,
            durationSeconds - 1
          );
          const endSecond = this.clampSecond(
            this.number(scene.endSecond, defaultEnd),
            startSecond + 1,
            durationSeconds
          );
          const visual = this.text(scene.visual, fallbackScene.visual, 220);

          return {
            scene: Math.max(1, Math.floor(this.number(scene.scene, index + 1))),
            startSecond,
            endSecond,
            visual,
            narration: this.text(
              scene.narration,
              this.text(root.narration, fallback.narration, 500),
              500
            ),
            overlayText: this.text(
              scene.overlayText,
              this.text(root.hook, fallback.hook, 80),
              80
            ),
            pixellePrompt: this.text(
              scene.pixellePrompt,
              visual || fallbackScene.pixellePrompt,
              500
            ),
          };
        })
      : fallback.storyboard;

    const title = this.text(root.title || uploadMetadata.title, fallback.title, 80);
    const narration = this.text(root.narration, fallback.narration, 2000);
    const caption = this.text(root.caption, fallback.caption, 500);

    return {
      title,
      coreSummary: this.text(root.coreSummary, fallback.coreSummary, 300),
      hook: this.text(root.hook, fallback.hook, 140),
      durationSeconds,
      narration,
      storyboard,
      caption,
      uploadMetadata: {
        title: this.text(uploadMetadata.title, title, 100),
        description: this.text(uploadMetadata.description, caption || narration, 1000),
        hashtags,
      },
      hashtags,
    };
  }

  private fallbackScript(body: SnapsShortVideoRequest): SnapsShortVideoScript {
    const durationSeconds = this.duration(body.durationSeconds);
    const source = this.cleanSourceText(body.sourceText);
    const coreSummary = source.slice(0, 220) || '원문 핵심 메시지를 짧은 쇼츠로 정리합니다.';
    const sceneLength = Math.floor(durationSeconds / 4);
    const hashtags = this.cleanHashtags(['#shorts', '#snaps']);

    return {
      title: 'snaps 쇼츠 초안',
      coreSummary,
      hook: '이 내용을 짧게 보면 핵심은 하나입니다.',
      durationSeconds,
      narration: source.slice(0, 900),
      storyboard: [0, 1, 2, 3].map((index) => ({
        scene: index + 1,
        startSecond: index * sceneLength,
        endSecond: index === 3 ? durationSeconds : (index + 1) * sceneLength,
        visual:
          index === 0
            ? 'Clean vertical opening shot with bold Korean hook text'
            : 'Vertical social video shot with simple motion and readable Korean text',
        narration: source.slice(index * 120, index * 120 + 160) || coreSummary,
        overlayText:
          index === 0
            ? '핵심만 빠르게 정리'
            : `포인트 ${index + 1}`,
        pixellePrompt:
          'Vertical 9:16 Korean social short, clean composition, readable overlay text, smooth camera movement, modern editorial style',
      })),
      caption: source.slice(0, 300),
      uploadMetadata: {
        title: '핵심 요약 Shorts',
        description: source.slice(0, 700),
        hashtags,
      },
      hashtags,
    };
  }

  private duration(value?: unknown): 30 | 45 | 60 {
    const normalized = Number(value);
    return normalized === 30 || normalized === 60 ? normalized : 45;
  }

  private platform(value?: unknown): 'instagram' | 'youtube' | 'tiktok' {
    return value === 'instagram' || value === 'tiktok' ? value : 'youtube';
  }

  private normalizeRequest(
    body?: Partial<SnapsShortVideoRequest> | null
  ): SnapsShortVideoRequest {
    const durationSeconds =
      typeof body?.durationSeconds === 'undefined'
        ? undefined
        : this.duration(body.durationSeconds);
    return {
      sourceText: this.cleanSourceText(body?.sourceText),
      ...(durationSeconds ? { durationSeconds } : {}),
      platform: this.platform(body?.platform),
    };
  }

  private cleanHashtags(hashtags?: unknown) {
    const rawValues = Array.isArray(hashtags)
      ? hashtags
      : typeof hashtags === 'string'
      ? [hashtags]
      : [];
    const values = rawValues.flatMap((tag) =>
      this.text(tag, '', 80)
        .split(/[\s,]+/)
        .map((part) => part.trim())
        .filter(Boolean)
    );

    return [...new Set(
      values
        .map((tag) => tag.replace(/^#+/, ''))
        .map((tag) => tag.replace(/[^\p{L}\p{N}_-]/gu, ''))
        .filter(Boolean)
        .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
    )].slice(0, 20);
  }

  private normalizePixelleResponse(
    payload: unknown,
    script?: SnapsShortVideoScript
  ): SnapsPixelleResponse {
    const record = this.record(payload);
    const message = this.text(record.message || record.detail || record.error, '', 500);
    const jobId = this.findStringByKeys(record, [
      'jobId',
      'job_id',
      'taskId',
      'task_id',
      'id',
    ]);
    const videoUrl = this.findStringByKeys(record, [
      'videoUrl',
      'video_url',
      'downloadUrl',
      'download_url',
      'url',
      'output',
    ]) || this.findMediaString(record, /\.(mp4|mov|webm|m4v)(\?|$)/i);
    const thumbnail = this.findStringByKeys(record, [
      'thumbnail',
      'thumbnailUrl',
      'thumbnail_url',
      'poster',
      'posterUrl',
      'poster_url',
    ]) || this.findMediaString(record, /\.(png|jpg|jpeg|webp)(\?|$)/i);
    const status =
      this.findStringByKeys(record, ['status', 'state']) ||
      this.text(record.status, script ? 'submitted' : 'unknown', 80);

    return {
      ...record,
      status,
      ...(message ? { message } : {}),
      ...(jobId ? { jobId, id: this.text(record.id, jobId, 120) } : {}),
      ...(videoUrl ? { videoUrl } : {}),
      ...(thumbnail ? { thumbnail } : {}),
      ...(script ? { script } : {}),
    };
  }

  private async readPixelleResponsePayload(response: Response) {
    const text = (await response.text()).trim();
    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      return {
        message: this.compactPixelleText(text, response.statusText),
      };
    }
  }

  private async readPixelleResponseSnippet(response: Response) {
    const text = (await response.text()).trim();
    return this.compactPixelleText(text, response.statusText);
  }

  private compactPixelleText(text: string, fallback = '') {
    if (!text) {
      return fallback || 'empty response';
    }

    try {
      const parsed = JSON.parse(text) as {
        message?: unknown;
        error?: unknown;
        detail?: unknown;
      };
      for (const candidate of [parsed.message, parsed.error, parsed.detail]) {
        if (typeof candidate === 'string' && candidate.trim()) {
          return candidate.trim().slice(0, 500);
        }
      }
    } catch {
      // Pixelle deployments sometimes return plain text or HTML errors.
    }

    if (text.startsWith('<')) {
      return fallback || 'HTML error response';
    }

    return text.slice(0, 500);
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private text(value: unknown, fallback = '', maxLength = 1000) {
    let raw = '';
    if (typeof value === 'string') {
      raw = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      raw = String(value);
    } else if (Array.isArray(value)) {
      raw = value
        .map((entry) => this.text(entry, '', maxLength))
        .filter(Boolean)
        .join(' ');
    }

    const normalized = raw.trim().replace(/\s+/g, ' ');
    return (normalized || fallback).slice(0, maxLength);
  }

  private cleanSourceText(value: unknown) {
    return this.text(value, '', 5000);
  }

  private number(value: unknown, fallback: number) {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : fallback;
  }

  private clampSecond(value: number, min: number, max: number) {
    return Math.min(Math.max(Math.floor(value), min), max);
  }

  private findStringByKeys(value: unknown, keys: string[], depth = 0): string {
    if (depth > 4) {
      return '';
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findStringByKeys(item, keys, depth + 1);
        if (found) {
          return found;
        }
      }
      return '';
    }

    const record = this.record(value);
    for (const key of keys) {
      const found = this.text(record[key], '', 500);
      if (found) {
        return found;
      }
    }

    for (const nested of Object.values(record)) {
      const found = this.findStringByKeys(nested, keys, depth + 1);
      if (found) {
        return found;
      }
    }

    return '';
  }

  private findMediaString(value: unknown, pattern: RegExp, depth = 0): string {
    if (depth > 4) {
      return '';
    }

    if (typeof value === 'string') {
      const normalized = this.text(value, '', 1000);
      return pattern.test(normalized) ? normalized : '';
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findMediaString(item, pattern, depth + 1);
        if (found) {
          return found;
        }
      }
      return '';
    }

    for (const nested of Object.values(this.record(value))) {
      const found = this.findMediaString(nested, pattern, depth + 1);
      if (found) {
        return found;
      }
    }

    return '';
  }
}
