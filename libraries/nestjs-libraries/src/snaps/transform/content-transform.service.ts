import { Injectable } from '@nestjs/common';
import { sanitizeSnapsHashtags } from '@gitroom/nestjs-libraries/snaps/transform/hashtags';
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
import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';
import { snapsClampToWeight } from '@gitroom/nestjs-libraries/snaps/text/weighted-length';
import { snapsCleanBodyText } from '@gitroom/nestjs-libraries/snaps/text/body-text';

/**
 * UTF-16 units a model-supplied title may use. Unchanged from the 120 the
 * previous slice allowed.
 */
const SNAPS_SUPPLIED_TITLE_MAX_LENGTH = 120;

/**
 * UTF-16 units a derived title may use. Kept at the 48 the previous slice
 * used, so no title that fits today gets shorter.
 */
const SNAPS_TITLE_MAX_LENGTH = 48;

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

    // A caller naming ['instagram', 'facebook'] got Instagram variants and no
    // mention of facebook: the unsupported half was filtered out in silence.
    // Computed here, before the try, so the deterministic fallback carries it
    // too - putting it on the model path alone would lose it exactly when the
    // run is already degraded.
    const unsupported = (body.targetPlatforms || []).filter(
      (platform) => !targetPlatforms.includes(platform)
    );
    const platformWarnings = unsupported.length
      ? [`${unsupported.join(', ')}은(는) snaps가 지원하지 않는 채널이라 제외했습니다.`]
      : [];
    // Style examples are an enhancement, not a requirement, and this sat
    // outside the try below - so an example store that could not be read threw
    // straight out of transform() as a plain Error, which Nest turns into a
    // 500 whose body says only "Internal server error". Measured side by side:
    // a total model outage came back as rule output with a warning naming the
    // cause, while an unreadable example file cost the whole request. The
    // asymmetry was backwards - the optional half was the fatal one.
    let ragHits: Awaited<ReturnType<typeof this.loadRagExamples>> = [];
    const ragWarnings: string[] = [];
    if (body.useRag !== false) {
      try {
        ragHits = await this.loadRagExamples(
          organizationId,
          body.sourceText,
          targetPlatforms
        );
      } catch (error) {
        ragWarnings.push(
          `저장된 스타일 예시를 읽지 못해 예시 없이 변환했습니다: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

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
        // The engine that actually answered. Was the literal 'ollama',
        // so every DeepSeek run reported Ollama.
        provider: this.ollama.provider(),
        model: this.ollama.model,
        variants,
        warnings: [...platformWarnings, ...ragWarnings, ...warnings],
        ragExamplesUsed: ragHits.map((hit) => ({
          id: hit.id,
          platform: hit.platform,
          content: hit.content,
          score: hit.score,
        })),
      };
    } catch (error) {
      if (process.env.SNAPS_DEBUG_TRANSFORM === '1') {
        console.error('[snaps-debug] content transform failed:', error);
      }
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
          ...platformWarnings,
          ...ragWarnings,
          `모델 변환에 실패해 기본 규칙으로 대체했습니다: ${
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
          `모델이 ${platform} 변형을 제공하지 않아 기본 규칙으로 채웠습니다.`
        );
        return this.ruleFallbackVariant(platform, body);
      }

      // `found?.hashtags || rule.defaultHashtags` never reached the defaults
      // when the model returned an empty array, because [] is truthy - and
      // measured against the live DeepSeek API it does return [] for some
      // platforms on every run. Cleaning first also covers an array that holds
      // only junk the sanitiser strips. The deterministic fallback variant has
      // always applied defaultHashtags; this makes the model path agree.
      const modelHashtags = this.cleanHashtags(found?.hashtags, rule.hashtagLimit);
      const hashtags = modelHashtags.length
        ? modelHashtags
        : this.cleanHashtags(rule.defaultHashtags, rule.hashtagLimit);

      // The publishing builder warns when it clamps a caption, but by then this
      // has already cut the model's answer down to the platform limit, so the
      // builder has nothing left to clamp and says nothing. The operator saw a
      // sentence stop mid-word with no explanation of why.
      // X counts units, not characters - Hangul weighs two - so clamping a
      // Korean post to 280 characters produced 479 units and X refused it at
      // publish. Where a rule declares a weighted limit, that is the one that
      // decides; everywhere else a character is a character.
      const clampedContent = rule.weightedLimit
        ? snapsClampToWeight(content, rule.weightedLimit)
        : snapsClampText(content, rule.maxLength);
      if (clampedContent.length < content.length) {
        warnings.push(
          rule.weightedLimit
            ? `${rule.label}은(는) 본문을 ${rule.weightedLimit}자 분량까지만 받고 ` +
              `한글은 두 자로 셉니다. 모델이 쓴 ${content.length}자 중 ` +
              `${content.length - clampedContent.length}자를 잘랐습니다.`
            : `${rule.label}은(는) 본문을 최대 ${rule.maxLength}자까지만 받아, ` +
              `모델이 쓴 ${content.length}자 중 ${content.length - clampedContent.length}자를 잘랐습니다.`
        );
      }

      return {
        platform,
        label: rule.label,
        // The model is asked for a title but does not always send one. On a
        // platform that publishes the title separately, leaving it undefined
        // pushes the publishing builder into deriving one from the body.
        title:
          this.cleanTitle(found?.title) ||
          (rule.requiresTitle ? this.makeTitle(content) : undefined),
        content: clampedContent,
        hashtags,
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
    const normalized = snapsCleanBodyText(body.sourceText, rule.maxLength);
    const hashtags = this.cleanHashtags(rule.defaultHashtags, rule.hashtagLimit);
    const prefix = this.fallbackPrefix(platform);
    const suffix = hashtags.length ? `\n\n${hashtags.join(' ')}` : '';
    // The deterministic fallback answers to the same limit as the model path.
    const content = rule.weightedLimit
      ? snapsClampToWeight(`${prefix}${normalized}${suffix}`, rule.weightedLimit)
      : snapsClampText(`${prefix}${normalized}${suffix}`, rule.maxLength);

    return {
      platform,
      label: rule.label,
      // Was a hardcoded platform-name test that happened to omit youtube, so
      // the YouTube fallback carried no title and the publishing builder
      // derived one from the content - which began with the literal words
      // "Title:" and "Description:".
      title: rule.requiresTitle ? this.makeTitle(normalized) : undefined,
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
      // The title travels in the variant's title field now, so it must not be
      // repeated as a "Title:" line inside the description body.
      return '';
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
    if (platform === 'kakao-talk') {
      // Its own rule asks for a Korean messenger tone, concise and warm,
      // where the recipient sees the value immediately. Without a lead-in
      // the fallback handed KakaoTalk the bare source - byte-identical to
      // the X variant, on a channel whose convention is a short greeting,
      // while every other Korean channel here opens with one.
      return '공유해요. 바로 도움 되는 내용만 정리했습니다.\n\n';
    }
    // X is deliberately bare: its rule is "sharp, compressed, one point
    // only", and so is YouTube's above, whose title travels in its own field.
    return '';
  }

  /**
   * Derives the title a platform publishes separately from the body.
   *
   * Was `content.slice(0, 48)`, which had three measured faults. The model is
   * asked for a title, a description and tags in one block, so the slice ran
   * past the end of the first line and carried its newlines into a field that
   * is single-line on every platform that has one. It counted UTF-16 units, so
   * a cut landing inside an emoji left a dangling high surrogate - measured at
   * one boundary position in seven - or tore a ZWJ family sequence into
   * different people. And it discarded the headline the model had already
   * written on line one, in favour of that line plus the start of the body.
   */
  private makeTitle(content: string) {
    const text = String(content ?? '');
    const flatten = (value: string) => value.trim().replace(/\s+/g, ' ');
    const [firstLine = ''] = text.split(/\r?\n/);
    const headline = flatten(firstLine);
    const flat = flatten(text);

    // A first line that already fits the budget is the title the model wrote.
    // Below four characters it is a label or a stray bullet, not a headline.
    const source =
      headline.length >= 4 && headline.length <= SNAPS_TITLE_MAX_LENGTH
        ? headline
        : flat;

    const clamped = snapsClampText(source, SNAPS_TITLE_MAX_LENGTH);
    // Only when the clamp actually cut: back up to the last word boundary so
    // the title does not end mid-word, but never give up more than a quarter
    // of the budget to do it.
    const trimmedToWord = clamped.replace(/\s+\S*$/, '');
    const cut =
      clamped.length < source.length &&
      trimmedToWord.length >= SNAPS_TITLE_MAX_LENGTH * 0.75
        ? trimmedToWord
        : clamped;

    return cut.replace(/[.!?。！？]$/, '').trim();
  }

  // Moved to snaps/transform/hashtags.ts so the publishing builder - the choke
  // point every flow crosses, including a direct /snaps/schedule-variants call -
  // sanitises the same way instead of publishing a bare word or a lone '#'.
  private cleanHashtags(hashtags?: unknown, limit = 20) {
    return sanitizeSnapsHashtags(hashtags, limit);
  }

  /**
   * The title the model supplied - the path taken whenever it sends one, so
   * the common case, not the fallback.
   *
   * `trim()` only strips the ends, so a model that answered with a title and a
   * subtitle on two lines put a newline into a field every platform publishes
   * on one line. And `slice(0, 120)` counted UTF-16 units: across thirteen
   * boundary positions it left four dangling high surrogates and tore two ZWJ
   * sequences. Same faults as makeTitle had, on the path that runs more often.
   */
  private cleanTitle(title: unknown) {
    const normalized =
      typeof title === 'string' ? title.replace(/\s+/g, ' ').trim() : '';
    return normalized
      ? snapsClampText(normalized, SNAPS_SUPPLIED_TITLE_MAX_LENGTH)
      : undefined;
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
