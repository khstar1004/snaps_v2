import { Injectable } from '@nestjs/common';
import { OllamaClient } from '@gitroom/nestjs-libraries/snaps/ai/ollama.client';
import {
  buildSnapsTransformSystemPrompt,
  buildSnapsTransformUserPrompt,
} from '@gitroom/nestjs-libraries/snaps/ai/prompt.builder';
import { SnapsOllamaTransformPayload } from '@gitroom/nestjs-libraries/snaps/ai/structured-output.schema';
import {
  SnapsTransformRequestDto,
} from '@gitroom/nestjs-libraries/snaps/dto/transform-request.dto';
import {
  SnapsTransformResult,
  SnapsVariant,
} from '@gitroom/nestjs-libraries/snaps/dto/transform-result.dto';
import {
  buildDefaultSettings,
  normalizeTargetPlatforms,
  SnapsTargetPlatform,
  snapsPlatformRules,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import { SnapsRagService } from '@gitroom/nestjs-libraries/snaps/rag/rag.service';

@Injectable()
export class SnapsContentTransformService {
  constructor(
    private readonly ollama: OllamaClient,
    private readonly rag: SnapsRagService
  ) {}

  async transform(
    organizationId: string,
    body: SnapsTransformRequestDto
  ): Promise<SnapsTransformResult> {
    const targetPlatforms = normalizeTargetPlatforms(body.targetPlatforms);
    const ragHits =
      body.useRag === false
        ? []
        : await this.loadRagExamples(organizationId, body.sourceText, targetPlatforms);

    try {
      const payload = await this.ollama.chatJson<SnapsOllamaTransformPayload>([
        {
          role: 'system',
          content: buildSnapsTransformSystemPrompt(),
        },
        {
          role: 'user',
          content: buildSnapsTransformUserPrompt({
            body,
            targetPlatforms,
            ragHits,
          }),
        },
      ]);

      const { variants, warnings } = this.normalizeVariants(
        targetPlatforms,
        payload,
        body
      );
      if (!variants.length) {
        throw new Error('Ollama returned no usable variants');
      }

      return {
        provider: 'ollama',
        model: this.ollama.model,
        variants,
        warnings,
        ragExamplesUsed: ragHits.map((hit) => ({
          id: hit.id,
          platform: hit.platform,
          content: hit.content,
          score: hit.score,
        })),
      };
    } catch (error) {
      const fallbackAllowed = process.env.SNAPS_ALLOW_RULE_FALLBACK !== 'false';
      if (!fallbackAllowed) {
        throw error;
      }

      return {
        provider: 'rule-fallback',
        model: 'local-rule-fallback',
        variants: targetPlatforms.map((platform) =>
          this.ruleFallbackVariant(platform, body)
        ),
        warnings: [
          `Ollama transform failed, rule fallback was used: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ],
        ragExamplesUsed: ragHits.map((hit) => ({
          id: hit.id,
          platform: hit.platform,
          content: hit.content,
          score: hit.score,
        })),
      };
    }
  }

  buildDraftPayload(result: SnapsTransformResult) {
    return {
      ...result,
      draftPayload: {
        type: 'draft' as const,
        date: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        shortLink: false,
        tags: [] as string[],
        posts: result.variants.map((variant) => ({
          platform: variant.platform,
          content: variant.content,
          settings: variant.settings,
          publishMode: variant.publishMode,
          media: variant.media,
        })),
      },
    };
  }

  private async loadRagExamples(
    organizationId: string,
    sourceText: string,
    targetPlatforms: SnapsTargetPlatform[]
  ) {
    const perPlatform = await Promise.all(
      targetPlatforms.map((platform) =>
        this.rag.search(
          organizationId,
          sourceText,
          platform,
          Math.max(1, Math.ceil(Number(process.env.SNAPS_RAG_TOP_K || 5) / targetPlatforms.length))
        )
      )
    );
    return perPlatform.flat().filter((hit) => hit.score > 0);
  }

  private normalizeVariants(
    targetPlatforms: SnapsTargetPlatform[],
    payload: SnapsOllamaTransformPayload,
    body: SnapsTransformRequestDto
  ): { variants: SnapsVariant[]; warnings: string[] } {
    const variants = Array.isArray(payload?.variants) ? payload.variants : [];
    const warnings: string[] = [];
    const normalized = targetPlatforms.map((platform) => {
      const found = variants.find(
        (variant) => String(variant?.platform || '').toLowerCase() === platform
      );
      const content = typeof found?.content === 'string' ? found.content.trim() : '';
      const rule = snapsPlatformRules[platform];

      if (!content) {
        warnings.push(
          `Ollama omitted ${platform}; deterministic snaps fallback filled this variant.`
        );
        return this.ruleFallbackVariant(platform, body);
      }

      return {
        platform,
        label: rule.label,
        title: this.cleanTitle(found?.title),
        content: content.slice(0, rule.maxLength),
        hashtags: this.cleanHashtags(
          found?.hashtags || rule.defaultHashtags,
          rule.hashtagLimit
        ),
        settings: buildDefaultSettings(platform),
        publishMode: rule.publishMode,
        notes: this.cleanNotes(found?.notes),
      };
    }).filter((variant) => variant.content.length > 0);

    return {
      variants: normalized,
      warnings,
    };
  }

  private ruleFallbackVariant(
    platform: SnapsTargetPlatform,
    body: SnapsTransformRequestDto
  ): SnapsVariant {
    const rule = snapsPlatformRules[platform];
    const normalized = body.sourceText.trim().replace(/\s+/g, ' ');
    const hashtags = this.cleanHashtags(rule.defaultHashtags, rule.hashtagLimit);
    const prefix = this.fallbackPrefix(platform);
    const suffix = hashtags.length ? `\n\n${hashtags.join(' ')}` : '';
    const content = `${prefix}${normalized}${suffix}`.slice(0, rule.maxLength);

    return {
      platform,
      label: rule.label,
      title:
        platform.includes('naver') || platform === 'xiaohongshu'
          ? this.makeTitle(normalized)
          : undefined,
      content,
      hashtags,
      settings: buildDefaultSettings(platform),
      publishMode: rule.publishMode,
      notes: ['Ollama unavailable: generated with deterministic snaps fallback rules.'],
    };
  }

  private fallbackPrefix(platform: SnapsTargetPlatform) {
    if (platform === 'threads') {
      return '이건 이렇게 보면 돼.\n\n';
    }
    if (platform === 'instagram') {
      return '오늘 저장해둘 인사이트.\n\n';
    }
    if (platform === 'youtube') {
      return 'Title: 핵심 요약 Shorts\n\nDescription:\n';
    }
    if (platform === 'tiktok') {
      return '요즘 이 이슈가 중요한 이유는?\n\n';
    }
    if (platform === 'xiaohongshu') {
      return '제목: 저장해둘 중국 SNS 노트\n\n핵심 포인트\n1. ';
    }
    if (platform === 'naver-blog') {
      return '제목: 핵심 이슈 정리\n\n이웃님들께 공유드려요. 오늘은 꼭 알아두면 좋은 내용을 정리했습니다.\n\n목차\n1. 왜 중요한가\n2. 핵심 내용\n3. 실무 시사점\n\n본문\n';
    }
    if (platform === 'naver-cafe') {
      return '안녕하세요. 같이 보면 좋을 내용을 정리해봤습니다.\n\n';
    }
    if (platform === 'linkedin') {
      return 'A practical takeaway:\n\n';
    }
    return '';
  }

  private makeTitle(content: string) {
    return content.slice(0, 48).replace(/[.!?。！？]$/, '');
  }

  private cleanHashtags(hashtags?: unknown, limit = 20) {
    const rawValues = Array.isArray(hashtags)
      ? hashtags
      : typeof hashtags === 'string'
      ? [hashtags]
      : [];

    const values = rawValues.flatMap((value) =>
      String(value || '')
        .split(/[\s,]+/)
        .map((tag) => tag.trim())
        .filter(Boolean)
    );

    return [...new Set(
      values
        .map((tag) => String(tag).trim())
        .filter(Boolean)
        .map((tag) => tag.replace(/^#+/, ''))
        .map((tag) => tag.replace(/[^\p{L}\p{N}_-]/gu, ''))
        .filter(Boolean)
        .map((tag) => `#${tag}`)
    )].slice(0, Math.max(0, limit));
  }

  private cleanTitle(title: unknown) {
    const normalized = typeof title === 'string' ? title.trim() : '';
    return normalized ? normalized.slice(0, 120) : undefined;
  }

  private cleanNotes(notes: unknown) {
    return Array.isArray(notes)
      ? notes
          .map((note) => String(note || '').trim())
          .filter(Boolean)
          .slice(0, 8)
      : [];
  }
}
