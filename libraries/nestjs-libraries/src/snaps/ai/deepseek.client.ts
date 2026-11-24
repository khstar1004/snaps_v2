import { Injectable } from '@nestjs/common';
import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';
import { snapsExtractJson } from '@gitroom/nestjs-libraries/snaps/ai/extract-json';
import {
  snapsFetchWithTimeout,
  snapsTimeoutMs,
} from '@gitroom/nestjs-libraries/snaps/http/fetch-with-timeout';

export type DeepseekMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type DeepseekHealth = {
  ok: boolean;
  baseUrl: string;
  chatModel: string;
  modelAvailable: boolean;
  /**
   * Whether a key is configured at all, as opposed to configured and
   * rejected. The health headline needs to tell those apart and the error
   * string is the wrong place to ask - it is prose, and it is the API's.
   */
  keyConfigured: boolean;
  /** The status the listing call came back with, when it got that far. */
  status?: number;
  models: string[];
  error?: string;
};

@Injectable()
export class DeepseekClient {
  private readonly baseUrl = (
    process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
  ).replace(/\/$/, '');
  private readonly apiKey = process.env.DEEPSEEK_API_KEY || '';
  private readonly chatModel =
    process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-v4-flash';

  get model() {
    return this.chatModel;
  }

  async health(): Promise<DeepseekHealth> {
    if (!this.apiKey) {
      return {
        ok: false,
        baseUrl: this.baseUrl,
        chatModel: this.chatModel,
        modelAvailable: false,
        keyConfigured: false,
        models: [],
        error: 'DEEPSEEK_API_KEY is not configured',
      };
    }

    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.authHeaders(),
      });

      if (!response.ok) {
        return {
          ok: false,
          baseUrl: this.baseUrl,
          chatModel: this.chatModel,
          modelAvailable: false,
          keyConfigured: true,
          status: response.status,
          models: [],
          error: `${response.status} ${await this.readResponseSnippet(response)}`,
        };
      }

      const data = (await response.json()) as {
        data?: Array<{ id?: string }>;
      };
      const models = (data.data || [])
        .map((entry) => entry.id || '')
        .filter(Boolean);
      // /models lists canonical ids only - DeepSeek accepts working aliases
      // that never appear in it. Treating "not listed" as unavailable reported
      // a perfectly functional model as broken: deepseek-v4-flash, the shipped
      // default, answers completions but is absent from the listing. When the
      // listing misses, settle it with the smallest possible completion rather
      // than guessing. That call only happens on the miss path, so a correctly
      // listed model still costs one GET.
      const listed = models.includes(this.chatModel);
      const probe: { ok: boolean; reason?: string; status?: number } = listed
        ? { ok: true, status: response.status }
        : await this.chatModelProbe();
      const modelAvailable = probe.ok;
      // Reporting the listing's 200 here said the chat provider was fine
      // while the completion it actually needs came back 402. The status
      // belongs to whichever call decided the answer.
      const chatStatus = probe.status ?? response.status;
      return {
        ok: modelAvailable,
        baseUrl: this.baseUrl,
        chatModel: this.chatModel,
        modelAvailable,
        keyConfigured: true,
        ...(chatStatus === undefined ? {} : { status: chatStatus }),
        models,
        ...(modelAvailable
          ? {}
          : {
              // The API's own words, not just ours. Measured against the
              // live endpoint, a wrong model comes back as `The supported
              // API model names are deepseek-flash, deepseek-v4-pro, but you
              // passed X` - the exact fix, thrown away by the old message.
              // The reason matters more when it is not about the model at
              // all: an exhausted balance (402) and a rate limit (429) both
              // failed this probe too, and both were reported as a rejected
              // model, which sends the operator to edit DEEPSEEK_CHAT_MODEL
              // when nothing is wrong with it.
              error: DeepseekClient.chatFailureMessage(
                this.chatModel,
                probe.status,
                probe.reason
              ),
            }),
      };
    } catch (error) {
      return {
        ok: false,
        baseUrl: this.baseUrl,
        chatModel: this.chatModel,
        modelAvailable: false,
        keyConfigured: Boolean(this.apiKey),
        models: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Statuses that are about the account or the rate limit, not the model.
   *
   * An exhausted balance and a rate limit both fail the model probe, and both
   * used to be reported as `DeepSeek rejected the configured model`. That
   * sends the operator to edit DEEPSEEK_CHAT_MODEL when nothing is wrong with
   * it. The reason string carried the real status all along - in parentheses,
   * after a sentence that contradicted it.
   */
  private static readonly ACCOUNT_STATUSES = new Set([401, 402, 429]);

  private static notAboutTheModel(status: number) {
    // 5xx is the service failing, which the configured model cannot cause.
    return DeepseekClient.ACCOUNT_STATUSES.has(status) || status >= 500;
  }

  private static chatFailureMessage(
    model: string,
    status: number | undefined,
    reason: string | undefined
  ) {
    const lead =
      status !== undefined && DeepseekClient.notAboutTheModel(status)
        ? `DeepSeek refused the request for ${model}`
        : `DeepSeek rejected the configured model: ${model}`;
    return reason ? `${lead} (${reason})` : lead;
  }

  /**
   * Asks the API whether it will actually accept the configured model, using
   * the smallest completion possible. Used only when /models does not list it,
   * because that listing omits working aliases.
   */
  private async chatModelProbe(): Promise<{
    ok: boolean;
    reason?: string;
    /** Absent when the request never got an answer at all. */
    status?: number;
  }> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.chatModel,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
      });
      if (response.ok) {
        return { ok: true };
      }
      return {
        ok: false,
        status: response.status,
        reason: `${response.status} ${await this.readResponseSnippet(response)}`.trim(),
      };
    } catch (error) {
      // A timeout lands here and reads nothing like a rejected model, which
      // is the point of carrying it out.
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async chatJson<T>(messages: DeepseekMessage[]): Promise<T> {
    if (!this.apiKey) {
      throw new Error('DEEPSEEK_API_KEY is not configured');
    }

    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          ...this.authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.chatModel,
          messages,
          response_format: { type: 'json_object' },
          temperature: Number(process.env.DEEPSEEK_TEMPERATURE || 0.35),
          // The default deepseek-v4-flash model is a reasoning model: it spends
          // tokens on a hidden reasoning_content trace before writing the final
          // JSON content, and that trace is counted against max_tokens. 4096 was
          // regularly consumed entirely by reasoning on multi-scene/storyboard
          // style prompts, leaving an empty final `content` (see
          // scripts/verify-snaps-core-deepseek.ts). 16000 leaves enough headroom
          // for both the reasoning trace and the JSON payload.
          max_tokens: Number(process.env.DEEPSEEK_MAX_TOKENS || 16000),
        }),
      },
      snapsTimeoutMs(process.env.DEEPSEEK_CHAT_TIMEOUT_MS, 120000)
    );

    if (!response.ok) {
      throw new Error(
        `DeepSeek chat failed: ${response.status} ${await this.readResponseSnippet(response)}`
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: { content?: string; reasoning_content?: string };
        finish_reason?: string;
      }>;
    };
    const content = data.choices?.[0]?.message?.content || '';
    if (!content.trim()) {
      if (process.env.SNAPS_DEBUG_TRANSFORM === '1') {
        console.error(
          '[snaps-debug] deepseek empty content, full response:',
          JSON.stringify(data).slice(0, 4000)
        );
      }
      throw new Error(
        `DeepSeek returned an empty response (finish_reason=${data.choices?.[0]?.finish_reason || 'unknown'})`
      );
    }
    if (process.env.SNAPS_DEBUG_TRANSFORM === '1') {
      console.error(
        `[snaps-debug] deepseek finish_reason=${data.choices?.[0]?.finish_reason}, content length=${content.length}`
      );
      console.error('[snaps-debug] deepseek raw content:', content);
    }
    return JSON.parse(snapsExtractJson(content)) as T;
  }

  private authHeaders() {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  private async readResponseSnippet(response: Response) {
    const text = (await response.text()).trim();
    if (!text) {
      return response.statusText || 'empty response';
    }
    if (text.startsWith('<')) {
      return response.statusText || 'HTML error response';
    }
    return snapsClampText(text, 500);
  }

  private fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs = 15000
  ) {
    // Was a third copy of the same twelve lines, and the only one of the three
    // that still reported an elapsed deadline as "the operation was aborted".
    return snapsFetchWithTimeout(url, options, timeoutMs, 'DeepSeek');
  }
}
