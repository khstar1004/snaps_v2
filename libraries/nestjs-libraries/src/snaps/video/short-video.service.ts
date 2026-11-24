import { Injectable } from '@nestjs/common';
import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';
import {
  snapsFetchWithTimeout,
  snapsTimeoutMs,
} from '@gitroom/nestjs-libraries/snaps/http/fetch-with-timeout';
import { OllamaClient } from '@gitroom/nestjs-libraries/snaps/ai/ollama.client';
import { snapsPlatformRules } from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import { ServiceUnavailableException } from '@nestjs/common';
import { snapsCleanBodyText } from '@gitroom/nestjs-libraries/snaps/text/body-text';
import { snapsSplitSentences } from '@gitroom/nestjs-libraries/snaps/text/split-sentences';
import { snapsComposeHangul } from '@gitroom/nestjs-libraries/snaps/text/compose-hangul';
import { sanitizeSnapsHashtags } from '@gitroom/nestjs-libraries/snaps/transform/hashtags';

export type SnapsShortVideoRequest = {
  sourceText: string;
  durationSeconds?: number;
  platform?: 'instagram' | 'youtube' | 'tiktok';
};

export type SnapsShortVideoScript = {
  /**
   * Which path produced this script, matching the label the transform result
   * and the card news deck already carry. script() answers 200 whether the
   * model wrote the storyboard or it degraded to the deterministic one, and
   * without this the workspace reported both the same way.
   */
  provider: 'ollama' | 'deepseek' | 'rule-fallback';
  title: string;
  coreSummary: string;
  hook: string;
  durationSeconds: number;
  narration: string;
  /** Present only when the script cannot be read in the time asked for. */
  warnings?: string[];
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

/**
 * What a Korean narrator gets through in a second.
 *
 * Five to six syllables is the ordinary range for narration; six is
 * taken here so the warning fires only when the script is genuinely
 * beyond reach rather than merely brisk.
 */
const SNAPS_KOREAN_SYLLABLES_PER_SECOND = 6;

// Module constants so the two slots cannot drift: the video rejects what the
// thumbnail accepts and the other way round, and a list edited on one side only
// would put a still image back in the video slot.
const SNAPS_PIXELLE_VIDEO = /\.(mp4|mov|webm|m4v)(\?|$)/i;
const SNAPS_PIXELLE_IMAGE = /\.(png|jpe?g|webp|gif|avif)(\?|$)/i;

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
              durationSeconds: 'number between 15 and 90',
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
              'Keep narration suitable for the selected duration between 15 and 90 seconds.',
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
      // normalizeScript() is the only other return path and it runs the
      // storyboard through enforceTimeline(). fallbackScript() builds its own
      // even timeline, so today both agree - but that is two implementations
      // holding one invariant by coincidence. Route the fallback through the
      // same guarantee so a change to the fallback's scene arithmetic cannot
      // silently ship a gapped timeline to every offline user.
      const fallback = this.fallbackScript(request);
      return {
        ...fallback,
        storyboard: this.enforceTimeline(fallback.storyboard, fallback.durationSeconds),
      };
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

    const response = await snapsFetchWithTimeout(
      `${pixelleUrl.replace(/\/$/, '')}/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...request,
          sourceText: this.cleanSourceText(request.sourceText),
          durationSeconds: script.durationSeconds,
          platform: request.platform || 'youtube',
          script,
        }),
      },
      snapsTimeoutMs(process.env.PIXELLE_TIMEOUT_MS, 120000),
      'Pixelle video generate'
    );

    if (!response.ok) {
      // A plain Error here reached the operator as Nest's
      // `{"statusCode":500,"message":"Internal server error"}`: the
      // status Pixelle returned and the body it sent were both dropped.
      // The Shorts-Maker client in the same product answers with a typed
      // error response instead of throwing, which is why its failures
      // reach the page and these did not.
      throw new ServiceUnavailableException(
        `Pixelle 영상 생성 요청이 실패했습니다 (HTTP ${response.status}). ` +
          `${await this.readPixelleResponseSnippet(response)}`
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

    const response = await snapsFetchWithTimeout(
      `${pixelleUrl.replace(/\/$/, '')}/status/${encodeURIComponent(jobId)}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
      snapsTimeoutMs(process.env.PIXELLE_STATUS_TIMEOUT_MS, 30000),
      'Pixelle job status'
    );

    if (!response.ok) {
      // Same reason as generate() above.
      throw new ServiceUnavailableException(
        `Pixelle 작업 상태를 읽지 못했습니다 (HTTP ${response.status}). ` +
          `${await this.readPixelleResponseSnippet(response)}`
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
    // An empty array is truthy, so chaining with `||` let an empty root.hashtags
    // short-circuit past uploadMetadata and the deterministic fallback, shipping
    // a script with no hashtags at all. Take the first source that survives
    // cleaning instead.
    const hashtags = this.firstUsableHashtags([
      root.hashtags,
      uploadMetadata.hashtags,
      fallback.hashtags,
    ]);
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
    const timedStoryboard = this.enforceTimeline(storyboard, durationSeconds);
    const narration = this.text(root.narration, fallback.narration, 2000);
    const caption = this.text(root.caption, fallback.caption, 500);

    return {
      // The storyboard is the substance of a shorts script. When the model
      // sent none, everything below is the deterministic script wearing the
      // model's title, so calling that an LLM result would be a lie.
      // The engine that actually answered; was the literal 'ollama'.
      provider: sourceStoryboard.length
        ? this.ollama.provider()
        : 'rule-fallback',
      title,
      coreSummary: this.text(root.coreSummary, fallback.coreSummary, 300),
      hook: this.text(root.hook, fallback.hook, 140),
      durationSeconds,
      narration,
      storyboard: timedStoryboard,
      caption,
      uploadMetadata: {
        title: this.text(uploadMetadata.title, title, 100),
        description: this.text(uploadMetadata.description, caption || narration, 1000),
        hashtags,
      },
      hashtags,
    };
  }

  /**
   * Forces the storyboard to cover [0, durationSeconds] contiguously.
   *
   * The deterministic fallback builds an even, gap-free timeline, but the model
   * path only clamped each bound on its own. Measured against the live DeepSeek
   * API, roughly one run in three treated endSecond as inclusive and returned
   * 0-5 / 6-14 / 15-23, leaving a second of dead air between every scene, and
   * clamping alone also let a scene end at the full duration while later scenes
   * still followed it. Each scene keeps the span the model asked for whenever it
   * still leaves a second for every scene after it; otherwise it gets an even
   * share of what is left.
   */
  private enforceTimeline(
    storyboard: SnapsShortVideoScript['storyboard'],
    durationSeconds: number
  ): SnapsShortVideoScript['storyboard'] {
    const count = storyboard.length;
    if (!count) {
      return storyboard;
    }

    // Every scene needs a whole second below, which only works while there are
    // at least as many seconds as scenes. Today there always are - the duration
    // is clamped to [15, 90] and the storyboard is capped at six - but that is
    // a guarantee held by two constants in other methods, and lowering either
    // would break this one silently: measured with 40 scenes over 30 seconds,
    // every scene came back as 0-1, overlapping, and the timeline never reached
    // the end. An even fractional split keeps the same three properties when
    // the seconds run out.
    if (durationSeconds < count) {
      return storyboard.map((scene, index) => ({
        ...scene,
        scene: index + 1,
        startSecond: (index * durationSeconds) / count,
        endSecond: ((index + 1) * durationSeconds) / count,
      }));
    }

    let cursor = 0;
    return storyboard.map((scene, index) => {
      const scenesAfter = count - index - 1;
      // The Math.min is belt and braces, not load-bearing: the previous
      // scene's end is already capped at durationSeconds - scenesAfter, which
      // is exactly this bound, and across 2,352 placements over the whole
      // reachable envelope and seven adversarial storyboard shapes it never
      // bound once. Kept because it only stays dead while the arithmetic
      // below does; do not write a test expecting it to fire.
      const startSecond = Math.min(cursor, Math.max(0, durationSeconds - scenesAfter - 1));
      // Leave at least one second for every scene that still has to follow.
      const latestEnd = Math.max(startSecond + 1, durationSeconds - scenesAfter);
      const requestedSpan = scene.endSecond - scene.startSecond;
      const evenSpan = Math.max(
        1,
        Math.floor((durationSeconds - startSecond) / (scenesAfter + 1))
      );
      const span = requestedSpan >= 1 ? requestedSpan : evenSpan;
      const endSecond =
        scenesAfter === 0 ? durationSeconds : Math.min(startSecond + span, latestEnd);

      cursor = endSecond;
      return { ...scene, scene: index + 1, startSecond, endSecond };
    });
  }

  private fallbackScript(body: SnapsShortVideoRequest): SnapsShortVideoScript {
    const durationSeconds = this.duration(body.durationSeconds);
    const source = this.cleanSourceText(body.sourceText);
    const coreSummary = snapsClampText(source, 220) || '원문 핵심 메시지를 짧은 쇼츠로 정리합니다.';
    // One beat per scene. The narration used to be a 120-character window into
    // the source, and a source shorter than 120 x sceneCount left every window
    // after the first empty - each falling back to the whole summary, so four
    // scenes narrated the same paragraph. Measured on a six-line note: four
    // identical scenes.
    //
    // The scene count stays a function of the duration. It is the timeline the
    // renderer is handed, and the tests that caught an earlier attempt at this
    // are right to pin it: a short source should not produce a short video.
    // What changes is that the beats are sentences rather than byte windows,
    // so they land on boundaries and do not repeat while there is anything
    // left to say.
    const sceneCount = durationSeconds <= 30 ? 4 : durationSeconds >= 70 ? 6 : 5;
    const sceneLength = Math.floor(durationSeconds / sceneCount);
    const sentences = snapsSplitSentences(source);
    const boundary = (index: number) =>
      Math.floor((index * sentences.length) / sceneCount);
    const beats = Array.from({ length: sceneCount }, (_, index) => {
      const group = sentences
        .slice(boundary(index), boundary(index + 1))
        .join(' ');
      // Fewer sentences than scenes: cycle rather than repeat the whole
      // summary in every one of them.
      return (
        group ||
        sentences[index % (sentences.length || 1)] ||
        coreSummary
      );
    });

    // Each scene gets time in proportion to what it has to say.
    //
    // The split used to be even, and the narration does not divide evenly: on
    // a four-scene 15 second script the beats carried 25, 32, 30 and 16
    // Hangul syllables into 3, 3, 3 and 6 second scenes - 8.3, 10.7 and 10.0
    // syllables a second for the first three, against the 5 to 6 a Korean
    // narrator actually speaks, while the last sat at 2.7 with time to spare.
    // The renderer is handed a timeline nobody can read to.
    //
    // Whole seconds, every scene at least one, and the remainder goes to the
    // scenes with the most to say. enforceTimeline() honours a span of one or
    // more and normalises the ends, so this decides the shape and that keeps
    // it legal.
    const weights = beats.map(
      // Composed first: a decomposed line counted 1 syllable however long it
      // was, so every scene got an equal slice and the pacing warning that
      // depends on this count never fired.
      (beat) => (snapsComposeHangul(String(beat)).match(/[가-힣]/g) || []).length || 1
    );
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    const exact = weights.map(
      (weight) => (weight / weightTotal) * durationSeconds
    );
    const spans = exact.map((seconds) => Math.max(1, Math.floor(seconds)));
    let leftover = durationSeconds - spans.reduce((sum, span) => sum + span, 0);
    // Largest remainder. Giving the spare seconds to the wordiest scenes
    // instead skewed the result: on the 15 second script the first scene kept
    // its floor of 3 against an exact 3.64 and stayed at 8.3 syllables a
    // second while the two it had been given to sat at 6.0 and 6.4. The
    // fraction that was cut is what says where a second is owed.
    const byRemainder = exact
      .map((seconds, index) => ({ remainder: seconds - Math.floor(seconds), index }))
      .sort((left, right) => right.remainder - left.remainder);
    for (let step = 0; leftover > 0; step += 1) {
      spans[byRemainder[step % byRemainder.length].index] += 1;
      leftover -= 1;
    }
    const starts: number[] = [];
    let cursor = 0;
    for (const span of spans) {
      starts.push(cursor);
      cursor += span;
    }

    // The platform picker reached the LLM prompt but not this path, so an
    // offline fallback handed TikTok and Instagram Reels a YouTube "#shorts"
    // tag and a Shorts-branded upload title. Read the per-platform defaults
    // from the shared rules table rather than starting a second one that can
    // drift from it.
    const platform = this.platform(body.platform);
    const rule = snapsPlatformRules[platform];
    const hashtags = sanitizeSnapsHashtags(
      [...rule.defaultHashtags, '#snaps'],
      rule.hashtagLimit ?? 20
    );
    const platformLabel =
      platform === 'instagram' ? 'Reels' : platform === 'tiktok' ? 'TikTok' : 'Shorts';

    // A Korean narrator reads about six syllables a second. When the whole
    // script needs more than the duration allows, no split of those seconds
    // helps - measured, 103 syllables into 15 seconds is 6.9 a second before
    // any scene is considered - and shuffling the timeline only moves which
    // scene is unreadable. Say it instead.
    const spokenSeconds = weightTotal / SNAPS_KOREAN_SYLLABLES_PER_SECOND;
    const pacingWarnings =
      spokenSeconds > durationSeconds
        ? [
            `대본이 ${durationSeconds}초에 비해 깁니다. 한국어 나레이션 속도로 ` +
              `약 ${Math.ceil(spokenSeconds)}초가 필요합니다. 길이를 늘리거나 ` +
              '원문을 줄이세요.',
          ]
        : [];

    return {
      provider: 'rule-fallback',
      ...(pacingWarnings.length ? { warnings: pacingWarnings } : {}),
      title: `snaps ${platformLabel} 초안`,
      coreSummary,
      hook: '이 내용을 짧게 보면 핵심은 하나입니다.',
      durationSeconds,
      narration: snapsClampText(source, 900),
      storyboard: Array.from({ length: sceneCount }, (_, index) => ({
        scene: index + 1,
        startSecond: starts[index],
        endSecond:
          index === sceneCount - 1
            ? durationSeconds
            : starts[index] + spans[index],
        visual:
          index === 0
            ? 'Clean vertical opening shot with bold Korean hook text'
            : 'Vertical social video shot with simple motion and readable Korean text',
        narration: snapsClampText(beats[index] || coreSummary, 160),
        overlayText:
          index === 0
            ? '핵심만 빠르게 정리'
            : `포인트 ${index + 1}`,
        pixellePrompt:
          'Vertical 9:16 Korean social short, clean composition, readable overlay text, smooth camera movement, modern editorial style',
      })),
      caption: snapsClampText(source, 300),
      uploadMetadata: {
        title: `핵심 요약 ${platformLabel}`,
        description: snapsClampText(source, 700),
        hashtags,
      },
      hashtags,
    };
  }

  private duration(value?: unknown): number {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) {
      return 45;
    }
    return Math.min(90, Math.max(15, Math.round(normalized / 5) * 5));
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

  private firstUsableHashtags(candidates: unknown[]) {
    for (const candidate of candidates) {
      const cleaned = sanitizeSnapsHashtags(candidate);
      if (cleaned.length) {
        return cleaned;
      }
    }
    return [] as string[];
  }

  private normalizePixelleResponse(
    payload: unknown,
    script?: SnapsShortVideoScript
  ): SnapsPixelleResponse {
    const record = this.record(payload);
    const message = this.text(record.message || record.detail || record.error, '', 500);
    const jobId = this.findPixelleJobId(record);
    const videoUrl =
      this.findStringByKeys(
        record,
        ['videoUrl', 'video_url', 'downloadUrl', 'download_url', 'url', 'output'],
        (found) => !SNAPS_PIXELLE_IMAGE.test(found)
      ) || this.findMediaString(record, SNAPS_PIXELLE_VIDEO);
    const thumbnail =
      this.findStringByKeys(
        record,
        [
          'thumbnail',
          'thumbnailUrl',
          'thumbnail_url',
          'poster',
          'posterUrl',
          'poster_url',
        ],
        (found) => !SNAPS_PIXELLE_VIDEO.test(found)
      ) || this.findMediaString(record, SNAPS_PIXELLE_IMAGE);
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
          return snapsClampText(candidate.trim(), 500);
        }
      }
    } catch {
      // Pixelle deployments sometimes return plain text or HTML errors.
    }

    if (text.startsWith('<')) {
      return fallback || 'HTML error response';
    }

    return snapsClampText(text, 500);
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
    return snapsClampText(normalized || fallback, maxLength);
  }

  /**
   * The source text, kept in the shape the operator pasted it.
   *
   * This went through text(), which collapses every run of whitespace to a
   * single space - the same thing the card news service was fixed for, in a
   * method of the same name. The line structure is what a pasted note is
   * divided by, and flattening it left the fallback storyboard with one
   * block of text repeated in every scene.
   */
  private cleanSourceText(value: unknown) {
    return snapsCleanBodyText(value, 5000);
  }

  private number(value: unknown, fallback: number) {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : fallback;
  }

  private clampSecond(value: number, min: number, max: number) {
    return Math.min(Math.max(Math.floor(value), min), max);
  }

  /**
   * The first value any of `keys` holds anywhere in the payload, in key order.
   *
   * Key order across the whole tree, not level by level. Level by level meant a
   * generic `url` found at depth 1 beat an exact `download_url` at depth 2:
   * measured on `{id, preview: {url: '...jpg'}, result: {download_url: '...mp4'}}`
   * the video came back as the preview frame.
   *
   * `accept` keeps the search going rather than taking a value the caller can
   * see is wrong. The video and the thumbnail share `url` in most payloads and
   * whichever the object literal happens to list first wins, so each rejects
   * the other's file types; without it, a deck whose assets listed the
   * thumbnail first published a PNG as the short video.
   */
  private findStringByKeys(
    value: unknown,
    keys: string[],
    accept: (found: string) => boolean = () => true
  ): string {
    for (const key of keys) {
      const found = this.findStringByKey(value, key, accept);
      if (found) {
        return found;
      }
    }
    return '';
  }

  private findStringByKey(
    value: unknown,
    key: string,
    accept: (found: string) => boolean,
    depth = 0
  ): string {
    if (depth > 4) {
      return '';
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findStringByKey(item, key, accept, depth + 1);
        if (found) {
          return found;
        }
      }
      return '';
    }

    const record = this.record(value);
    const own = this.text(record[key], '', 500);
    if (own && accept(own)) {
      return own;
    }

    for (const nested of Object.values(record)) {
      const found = this.findStringByKey(nested, key, accept, depth + 1);
      if (found) {
        return found;
      }
    }

    return '';
  }

  /**
   * The id of the job that was submitted, and nothing else's id.
   *
   * `id` used to be the last entry of one key list searched over the whole
   * tree, so `{user: {id: 'u-99'}, task: {id: 'j-3'}}` polled `u-99` - whichever
   * object the payload happened to list first. The named keys are searched
   * first, then the payload's own `id`, and only then a nested `id` under a
   * container that says what it identifies.
   */
  private findPixelleJobId(record: Record<string, unknown>): string {
    const named = this.findStringByKeys(record, [
      'jobId',
      'job_id',
      'taskId',
      'task_id',
    ]);
    if (named) {
      return named;
    }

    const own = this.text(record.id, '', 120);
    if (own) {
      return own;
    }

    for (const [key, value] of Object.entries(record)) {
      if (!/job|task|result|data|output/i.test(key)) {
        continue;
      }
      const nested = this.text(this.record(value).id, '', 120);
      if (nested) {
        return nested;
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
