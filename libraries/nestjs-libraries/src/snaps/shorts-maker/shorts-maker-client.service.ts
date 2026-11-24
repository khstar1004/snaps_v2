import { Injectable } from '@nestjs/common';
import {
  snapsFetchWithTimeout,
  snapsTimeoutMs,
} from '@gitroom/nestjs-libraries/snaps/http/fetch-with-timeout';
import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';

/**
 * Thin HTTP client for the vendored Shorts-Maker engine (external/Shorts-Maker),
 * run as its own docker service (`snaps-shorts-maker`) alongside `snaps-pixelle-video`.
 * See docs/snaps-shorts-maker.md.
 *
 * Auth note: the snaps-shorts-maker container runs with AUTH_LOCAL_BYPASS=true and
 * NODE_ENV=development (see docker-compose.yaml). Tracing external/Shorts-Maker's
 * lib/auth/api.ts -> lib/auth/local-bypass.ts shows that when the bypass is active,
 * requireSessionUser()/requireAuthenticatedSessionUser() short-circuit and return a
 * synthetic session user built purely from env vars (LOCAL_AUTH_BYPASS_ROLE, etc.)
 * WITHOUT inspecting the incoming request at all - no session cookie is read,
 * validated, or required. That means this client does not need to perform a login
 * flow or forward any cookie: plain unauthenticated fetch() calls are sufficient as
 * long as the target container has the bypass enabled. This only works because the
 * container's port is never published (internal docker network only) and
 * AUTH_LOCAL_BYPASS is refused outright whenever NODE_ENV === "production" (Shorts-
 * Maker's own local-bypass.ts guard) - see docs/snaps-shorts-maker.md for the full
 * security rationale.
 */

export type SnapsShortsMakerScriptMode = 'normal' | 'dialogue';

export type SnapsShortsMakerTopicToScriptRequest = {
  topic: string;
  mode?: SnapsShortsMakerScriptMode;
  publishCategory?: string;
  templateId?: string;
  codexModel?: string;
};

export type SnapsShortsMakerTopicToScriptResponse = {
  ok: true;
  script: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    model?: string;
  };
};

export type SnapsShortsMakerNotConfiguredResponse = {
  ok: false;
  status: 'not-configured';
  message: string;
};

export type SnapsShortsMakerErrorResponse = {
  ok: false;
  status: 'error';
  error: string;
  errorCode?: string;
  retryable?: boolean;
};

/**
 * Mirrors external/Shorts-Maker/types/studio-renderer.ts `StudioNativeRenderRequest`,
 * kept as a loose/partial shape rather than a real import: Shorts-Maker is a
 * standalone npm project outside this pnpm workspace, and this payload can only be
 * fully assembled by first running Shorts-Maker's own
 * topic-to-script -> script-to-json -> prepare -> render(audio) pipeline. This
 * adapter wraps the render-jobs HTTP contract only; building the payload is left to
 * the caller (out of scope for this task - see docs/snaps-shorts-maker.md).
 */
export type SnapsShortsMakerRenderJobRequest = {
  fullAudio: string;
  narration?: Record<string, unknown>;
  durationMs: number;
  frameDurationsSec: number[];
  audioOptions?: Record<string, unknown>;
  visuals: Record<string, unknown>;
  asset?: {
    title?: string;
    publishCategory?: string;
    studioSnapshot?: Record<string, unknown>;
  };
  meta?: Record<string, unknown>;
};

export type SnapsShortsMakerRenderJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

export type SnapsShortsMakerRenderJobRecord = {
  id: string;
  renderer: 'server_native';
  status: SnapsShortsMakerRenderJobStatus;
  createdAtMs: number;
  updatedAtMs: number;
  startedAtMs?: number;
  completedAtMs?: number;
  uploadedAssetId?: string;
  uploadedAssetUrl?: string;
  studioSnapshotSaved?: boolean;
  usage?: { renderMs: number };
  error?: string;
  errorCode?: string;
  retryable?: boolean;
} & Record<string, unknown>;

export type SnapsShortsMakerRenderJobSuccessResponse = {
  ok: true;
  job: SnapsShortsMakerRenderJobRecord;
};

export type SnapsShortsMakerRenderJobResponse =
  | SnapsShortsMakerRenderJobSuccessResponse
  | SnapsShortsMakerErrorResponse;

@Injectable()
export class ShortsMakerClientService {
  async topicToScript(
    request: SnapsShortsMakerTopicToScriptRequest
  ): Promise<
    | SnapsShortsMakerTopicToScriptResponse
    | SnapsShortsMakerNotConfiguredResponse
    | SnapsShortsMakerErrorResponse
  > {
    const baseUrl = this.baseUrl();
    if (!baseUrl) {
      return this.notConfigured();
    }

    try {
      const response = await snapsFetchWithTimeout(
        `${baseUrl}/api/studio/topic-to-script`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        },
        snapsTimeoutMs(process.env.SHORTS_MAKER_TIMEOUT_MS, 120000),
        'Shorts Maker topic-to-script'
      );

      const payload = await this.readJsonPayload(response);
      if (!response.ok || payload.ok === false) {
        return this.toErrorResponse(response, payload);
      }

      // The cast was unvalidated, so any shape this service returned was
      // handed on as a valid answer - including one whose `script` is an
      // object, which reached the operator's source box as the literal
      // text `[object Object]`. A body with no text in it is a failure of
      // the call, not a script.
      if (typeof payload.script !== 'string') {
        return this.toErrorResponse(response, {
          ...payload,
          error:
            'Shorts-Maker가 대본을 문자열로 반환하지 않았습니다.',
        });
      }

      return payload as unknown as SnapsShortsMakerTopicToScriptResponse;
    } catch (error) {
      return this.toCaughtErrorResponse(error);
    }
  }

  async createRenderJob(
    request: SnapsShortsMakerRenderJobRequest
  ): Promise<SnapsShortsMakerRenderJobResponse | SnapsShortsMakerNotConfiguredResponse> {
    const baseUrl = this.baseUrl();
    if (!baseUrl) {
      return this.notConfigured();
    }

    try {
      const response = await snapsFetchWithTimeout(
        `${baseUrl}/api/studio/render-jobs`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        },
        snapsTimeoutMs(process.env.SHORTS_MAKER_TIMEOUT_MS, 120000),
        'Shorts Maker render job submit'
      );

      const payload = await this.readJsonPayload(response);
      if (!response.ok || payload.ok === false) {
        return this.toErrorResponse(response, payload);
      }

      return payload as unknown as SnapsShortsMakerRenderJobSuccessResponse;
    } catch (error) {
      return this.toCaughtErrorResponse(error);
    }
  }

  async getRenderJobStatus(
    jobId: string
  ): Promise<SnapsShortsMakerRenderJobResponse | SnapsShortsMakerNotConfiguredResponse> {
    const baseUrl = this.baseUrl();
    if (!baseUrl) {
      return this.notConfigured();
    }

    try {
      const response = await snapsFetchWithTimeout(
        `${baseUrl}/api/studio/render-jobs?id=${encodeURIComponent(jobId)}`,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
        },
        snapsTimeoutMs(process.env.SHORTS_MAKER_STATUS_TIMEOUT_MS, 30000),
        'Shorts Maker render job status'
      );

      const payload = await this.readJsonPayload(response);
      if (!response.ok || payload.ok === false) {
        return this.toErrorResponse(response, payload);
      }

      return payload as unknown as SnapsShortsMakerRenderJobSuccessResponse;
    } catch (error) {
      return this.toCaughtErrorResponse(error);
    }
  }

  private baseUrl(): string {
    const url = process.env.SHORTS_MAKER_URL;
    return url ? url.replace(/\/$/, '') : '';
  }

  private notConfigured(): SnapsShortsMakerNotConfiguredResponse {
    return {
      ok: false,
      status: 'not-configured',
      message: 'SHORTS_MAKER_URL is not configured.',
    };
  }

  private async readJsonPayload(response: Response): Promise<Record<string, unknown>> {
    const text = (await response.text()).trim();
    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      // A proxy error page is markup, not a message. Pixelle and DeepSeek
      // both compress one to the status; measured here, a 502 reached the
      // operator as `<html><body>Bad Gateway</body></html>`.
      if (text.startsWith('<')) {
        return {
          error: `${response.status} ${
            response.statusText || 'HTML error response'
          }`.trim(),
        };
      }
      return { error: snapsClampText(text, 500) };
    }
  }

  private toErrorResponse(
    response: Response,
    payload: Record<string, unknown>
  ): SnapsShortsMakerErrorResponse {
    return {
      ok: false,
      status: 'error',
      error:
        (typeof payload.error === 'string' && payload.error) ||
        `${response.status} ${response.statusText}`,
      errorCode: typeof payload.errorCode === 'string' ? payload.errorCode : undefined,
      retryable:
        typeof payload.retryable === 'boolean' ? payload.retryable : undefined,
    };
  }

  private toCaughtErrorResponse(error: unknown): SnapsShortsMakerErrorResponse {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: 'error',
      error: snapsClampText(message.replace(/\s+/g, ' '), 500),
    };
  }
}
