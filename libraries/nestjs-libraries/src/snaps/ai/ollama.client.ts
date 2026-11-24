import { Injectable } from '@nestjs/common';
import { DeepseekClient } from '@gitroom/nestjs-libraries/snaps/ai/deepseek.client';
import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';
import { snapsExtractJson } from '@gitroom/nestjs-libraries/snaps/ai/extract-json';
import {
  snapsFetchWithTimeout,
  snapsTimeoutMs,
  snapsWasTimeout,
} from '@gitroom/nestjs-libraries/snaps/http/fetch-with-timeout';

export type OllamaMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type SnapsAiProvider = 'ollama' | 'deepseek';

export type OllamaHealth = {
  ok: boolean;
  provider: SnapsAiProvider;
  baseUrl: string;
  chatBaseUrl: string;
  chatModel: string;
  embedModel: string;
  chatModelAvailable: boolean;
  embedModelAvailable: boolean;
  missingModels: string[];
  /**
   * DeepSeek only. Absent under Ollama, which needs no key - so `false`
   * means a key is genuinely missing, not that the question is moot.
   */
  chatKeyConfigured?: boolean;
  /** The status the chat provider answered with, when it answered. */
  chatStatus?: number;
  models: string[];
  error?: string;
};

/**
 * Chat generation is provider-switched via AI_PROVIDER (falls back to the
 * legacy SNAPS_LLM_PROVIDER var). DeepSeek has no embeddings endpoint, so
 * embed() always calls the local Ollama embedding model regardless of the
 * active chat provider.
 */
@Injectable()
export class OllamaClient {
  private readonly baseUrl =
    process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  private readonly chatModel = process.env.OLLAMA_CHAT_MODEL || 'qwen3.5:9b';
  private readonly embedModel =
    process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text:latest';
  private readonly deepseek = new DeepseekClient();

  get model() {
    return this.provider() === 'deepseek' ? this.deepseek.model : this.chatModel;
  }

  // Public because every service that reports which engine produced a
  // result needs the same answer. They each hardcoded 'ollama', so a
  // DeepSeek run was labelled Ollama in the workspace beside a health
  // card that said DeepSeek.
  provider(): SnapsAiProvider {
    const raw = (
      process.env.AI_PROVIDER ||
      process.env.SNAPS_LLM_PROVIDER ||
      'ollama'
    ).toLowerCase();
    return raw === 'deepseek' ? 'deepseek' : 'ollama';
  }

  async health(): Promise<OllamaHealth> {
    if (this.provider() === 'deepseek') {
      // The two probes hit unrelated hosts, so run them together. Awaiting the
      // Ollama tags probe first cost the DeepSeek probe the full local timeout
      // before it even started - and fetchWithTimeout retries once on the IPv4
      // fallback, so a DeepSeek-only host with no Ollama paid ~30s per health
      // call.
      const [embed, chat] = await Promise.all([
        this.embedHealth(),
        this.deepseek.health(),
      ]);
      return {
        ok: chat.ok && embed.embedModelAvailable,
        provider: 'deepseek',
        baseUrl: this.baseUrl,
        chatBaseUrl: chat.baseUrl,
        chatModel: chat.chatModel,
        embedModel: this.embedModel,
        chatModelAvailable: chat.modelAvailable,
        chatKeyConfigured: chat.keyConfigured,
        ...(chat.status === undefined ? {} : { chatStatus: chat.status }),
        embedModelAvailable: embed.embedModelAvailable,
        missingModels: embed.embedModelAvailable ? [] : [this.embedModel],
        models: chat.models,
        ...(chat.error || embed.error
          ? { error: [chat.error, embed.error].filter(Boolean).join('; ') }
          : {}),
      };
    }

    const embed = await this.embedHealth();
    const missingModels = Array.from(
      new Set([
        ...(embed.chatModelAvailable ? [] : [this.chatModel]),
        ...(embed.embedModelAvailable ? [] : [this.embedModel]),
      ])
    );
    return {
      ok: missingModels.length === 0 && !embed.error,
      provider: 'ollama',
      baseUrl: this.baseUrl,
      chatBaseUrl: this.baseUrl,
      chatModel: this.chatModel,
      embedModel: this.embedModel,
      chatModelAvailable: embed.chatModelAvailable,
      embedModelAvailable: embed.embedModelAvailable,
      missingModels,
      models: embed.models,
      ...(embed.error
        ? { error: embed.error }
        : missingModels.length
        ? { error: `Missing Ollama models: ${missingModels.join(', ')}` }
        : {}),
    };
  }

  private async embedHealth(): Promise<{
    chatModelAvailable: boolean;
    embedModelAvailable: boolean;
    models: string[];
    error?: string;
  }> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });

      if (!response.ok) {
        return {
          chatModelAvailable: false,
          embedModelAvailable: false,
          models: [],
          error: `${response.status} ${await this.readResponseSnippet(response)}`,
        };
      }

      const data = (await response.json()) as {
        models?: Array<{ name?: string; model?: string }>;
      };
      const models = (data.models || [])
        .map((model) => model.name || model.model || '')
        .filter(Boolean);
      return {
        chatModelAvailable: models.includes(this.chatModel),
        embedModelAvailable: models.includes(this.embedModel),
        models,
      };
    } catch (error) {
      return {
        chatModelAvailable: false,
        embedModelAvailable: false,
        models: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async chatJson<T>(messages: OllamaMessage[]): Promise<T> {
    if (this.provider() === 'deepseek') {
      return this.deepseek.chatJson<T>(messages);
    }

    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.chatModel,
          messages: this.withNoThinkingInstruction(messages),
          stream: false,
          format: 'json',
          ...(this.disableThinking() ? { think: false } : {}),
          options: {
            temperature: Number(process.env.OLLAMA_TEMPERATURE || 0.35),
            num_predict: Number(process.env.OLLAMA_NUM_PREDICT || 4096),
          },
        }),
      },
      snapsTimeoutMs(process.env.OLLAMA_CHAT_TIMEOUT_MS, 120000)
    );

    if (!response.ok) {
      throw new Error(
        `Ollama chat failed: ${response.status} ${await this.readResponseSnippet(response)}`
      );
    }

    const data = (await response.json()) as {
      message?: { content?: string; thinking?: string };
    };
    const content = data.message?.content || '';
    if (!content.trim() && data.message?.thinking) {
      throw new Error(
        'Ollama returned thinking output without final JSON content. Set OLLAMA_DISABLE_THINKING=true or use a non-thinking model.'
      );
    }
    return JSON.parse(snapsExtractJson(content)) as T;
  }

  async embed(input: string | string[]): Promise<number[][]> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/api/embed`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.embedModel,
          input,
        }),
      },
      snapsTimeoutMs(process.env.OLLAMA_EMBED_TIMEOUT_MS, 60000)
    );

    if (!response.ok) {
      throw new Error(
        `Ollama embed failed: ${response.status} ${await this.readResponseSnippet(response)}`
      );
    }

    const data = (await response.json()) as { embeddings?: unknown };
    return this.normalizeEmbeddings(data.embeddings);
  }

  private withNoThinkingInstruction(messages: OllamaMessage[]) {
    if (!this.disableThinking()) {
      return messages;
    }

    return [
      {
        role: 'system' as const,
        content:
          'Return final JSON only. Do not include hidden reasoning, chain-of-thought, markdown fences, or <think> blocks.',
      },
      ...messages,
    ];
  }

  private disableThinking() {
    return process.env.OLLAMA_DISABLE_THINKING !== 'false';
  }

  private normalizeEmbeddings(value: unknown): number[][] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((embedding) =>
        Array.isArray(embedding)
          ? embedding.filter(
              (entry): entry is number =>
                typeof entry === 'number' && Number.isFinite(entry)
            )
          : []
      )
      .filter((embedding) => embedding.length > 0);
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

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs = 15000
  ) {
    try {
      return await this.fetchOnceWithTimeout(url, options, timeoutMs);
    } catch (error) {
      // Not after a deadline. The retry is here because Node resolves localhost
      // to ::1 while Ollama listens on IPv4, which fails to connect at once -
      // a server that accepted the connection and went quiet is not that, and
      // trying again meant waiting out the same silence twice. Measured with a
      // 150ms budget against a socket that never answers: two attempts.
      if (snapsWasTimeout(error)) {
        throw error;
      }
      const fallbackUrl = this.localhostIpv4FallbackUrl(url);
      if (!fallbackUrl) {
        throw error;
      }
      return this.fetchOnceWithTimeout(fallbackUrl, options, timeoutMs);
    }
  }

  private fetchOnceWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number
  ) {
    // The shared helper rather than a third copy of it: it is the one that
    // names the deadline in the error instead of reporting "the operation was
    // aborted", and now the one that marks it so this class can tell a timeout
    // from a connection that was refused.
    return snapsFetchWithTimeout(url, options, timeoutMs, 'Ollama');
  }

  private localhostIpv4FallbackUrl(url: string) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== 'localhost') {
        return '';
      }
      parsed.hostname = '127.0.0.1';
      return parsed.toString();
    } catch {
      return '';
    }
  }
}
