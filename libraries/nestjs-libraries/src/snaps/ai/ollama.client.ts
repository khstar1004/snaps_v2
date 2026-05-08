import { Injectable } from '@nestjs/common';

export type OllamaMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type OllamaHealth = {
  ok: boolean;
  baseUrl: string;
  chatModel: string;
  embedModel: string;
  chatModelAvailable: boolean;
  embedModelAvailable: boolean;
  missingModels: string[];
  models: string[];
  error?: string;
};

@Injectable()
export class OllamaClient {
  private readonly baseUrl =
    process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  private readonly chatModel = process.env.OLLAMA_CHAT_MODEL || 'qwen3.5:9b';
  private readonly embedModel =
    process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text:latest';

  get model() {
    return this.chatModel;
  }

  async health(): Promise<OllamaHealth> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });

      if (!response.ok) {
        return {
          ok: false,
          baseUrl: this.baseUrl,
          chatModel: this.chatModel,
          embedModel: this.embedModel,
          chatModelAvailable: false,
          embedModelAvailable: false,
          missingModels: this.requiredModels(),
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
      const chatModelAvailable = models.includes(this.chatModel);
      const embedModelAvailable = models.includes(this.embedModel);
      const missingModels = this.requiredModels().filter(
        (model) => !models.includes(model)
      );
      return {
        ok: missingModels.length === 0,
        baseUrl: this.baseUrl,
        chatModel: this.chatModel,
        embedModel: this.embedModel,
        chatModelAvailable,
        embedModelAvailable,
        missingModels,
        models,
        ...(missingModels.length
          ? { error: `Missing Ollama models: ${missingModels.join(', ')}` }
          : {}),
      };
    } catch (error) {
      return {
        ok: false,
        baseUrl: this.baseUrl,
        chatModel: this.chatModel,
        embedModel: this.embedModel,
        chatModelAvailable: false,
        embedModelAvailable: false,
        missingModels: this.requiredModels(),
        models: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async chatJson<T>(messages: OllamaMessage[]): Promise<T> {
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
      Number(process.env.OLLAMA_CHAT_TIMEOUT_MS || 120000)
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
    return JSON.parse(this.extractJson(content)) as T;
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
      Number(process.env.OLLAMA_EMBED_TIMEOUT_MS || 60000)
    );

    if (!response.ok) {
      throw new Error(
        `Ollama embed failed: ${response.status} ${await this.readResponseSnippet(response)}`
      );
    }

    const data = (await response.json()) as { embeddings?: unknown };
    return this.normalizeEmbeddings(data.embeddings);
  }

  private extractJson(content: string) {
    const trimmed = content.trim();
    if (trimmed.startsWith('```')) {
      return trimmed
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/i, '')
        .trim();
    }

    const firstObject = trimmed.indexOf('{');
    const lastObject = trimmed.lastIndexOf('}');
    if (firstObject > -1 && lastObject > firstObject) {
      return trimmed.slice(firstObject, lastObject + 1);
    }

    return trimmed;
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

  private requiredModels() {
    return Array.from(new Set([this.chatModel, this.embedModel]));
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
    return text.slice(0, 500);
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs = 15000
  ) {
    try {
      return await this.fetchOnceWithTimeout(url, options, timeoutMs);
    } catch (error) {
      const fallbackUrl = this.localhostIpv4FallbackUrl(url);
      if (!fallbackUrl) {
        throw error;
      }
      return this.fetchOnceWithTimeout(fallbackUrl, options, timeoutMs);
    }
  }

  private async fetchOnceWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
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
