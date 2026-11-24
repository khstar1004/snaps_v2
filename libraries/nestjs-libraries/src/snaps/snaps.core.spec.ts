// The provider settings DTOs are decorator-driven; class-validator reads that
// metadata through reflect-metadata, which nothing else in this suite pulls in.
import 'reflect-metadata';
import path from 'path';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InstagramDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/instagram.dto';
import { YoutubeSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/youtube.settings.dto';
import { TikTokDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/tiktok.dto';
import { LinkedinDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/linkedin.dto';
import { XDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/x.dto';
import { NaverCafeDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/naver-cafe.dto';
import { join } from 'path';
import os from 'os';
import { promises as fsp, readFileSync } from 'fs';
import {
  snapsJsonFileLockDepth,
  withJsonFileLock,
} from '@gitroom/nestjs-libraries/snaps/storage/json-file-lock';
import { SnapsRenderJobOwnershipService } from '@gitroom/nestjs-libraries/snaps/video/render-job-ownership.service';
import {
  buildSnapsTransformSystemPrompt,
  buildSnapsTransformUserPrompt,
} from '@gitroom/nestjs-libraries/snaps/ai/prompt.builder';
import { snapsOrgFileKey } from '@gitroom/nestjs-libraries/snaps/storage/org-file-key';
import sharp from 'sharp';
import { promises as fs } from 'fs';
import { SnapsContentTransformService } from '@gitroom/nestjs-libraries/snaps/transform/content-transform.service';
import { buildSnapsPublishingPayload } from '@gitroom/nestjs-libraries/snaps/schedule/publishing-payload.builder';
import { SnapsFeedbackInboxService } from '@gitroom/nestjs-libraries/snaps/inbox/feedback-inbox.service';
import { SnapsVectorStoreService } from '@gitroom/nestjs-libraries/snaps/rag/vector-store.service';
import { snapsAnalyticsToMetricInputs } from '@gitroom/nestjs-libraries/snaps/analytics/analytics-metric.mapper';
import { snapsExtractJson } from '@gitroom/nestjs-libraries/snaps/ai/extract-json';
import { SnapsRagService } from '@gitroom/nestjs-libraries/snaps/rag/rag.service';
import { SnapsReportGeneratorService } from '@gitroom/nestjs-libraries/snaps/analytics/report-generator.service';
import { SnapsShortVideoService } from '@gitroom/nestjs-libraries/snaps/video/short-video.service';
import { SnapsSourceLibraryService } from '@gitroom/nestjs-libraries/snaps/library/source-library.service';
import { SnapsActivityLogService } from '@gitroom/nestjs-libraries/snaps/activity/activity-log.service';
import { SnapsCommandPlannerService } from '@gitroom/nestjs-libraries/snaps/agent/command-planner.service';
import { SnapsAgentTaskService } from '@gitroom/nestjs-libraries/snaps/agent/agent-task.service';
import { NaverCafeProvider } from '@gitroom/nestjs-libraries/integrations/social/naver-cafe.provider';
import { OllamaClient } from '@gitroom/nestjs-libraries/snaps/ai/ollama.client';
import { DeepseekClient } from '@gitroom/nestjs-libraries/snaps/ai/deepseek.client';
import { ShortsMakerClientService } from '@gitroom/nestjs-libraries/snaps/shorts-maker/shorts-maker-client.service';
import {
  SNAPS_CARD_NEWS_TEMPLATE_IDS,
  SnapsCardNewsRendererService,
} from '@gitroom/nestjs-libraries/snaps/cardnews/card-news-renderer.service';
import { SnapsCardNewsService } from '@gitroom/nestjs-libraries/snaps/cardnews/card-news.service';
import { createServer, Server } from 'http';
import { snapsTimeoutMs } from '@gitroom/nestjs-libraries/snaps/http/fetch-with-timeout';
import {
  buildSnapsCardNewsVariants,
  normalizeCardNewsPlatforms,
} from '@gitroom/nestjs-libraries/snaps/cardnews/card-news-variant.builder';
import {
  buildSnapsVideoVariants,
  normalizeVideoPlatforms,
} from '@gitroom/nestjs-libraries/snaps/video/video-variant.builder';
import {
  buildDefaultSettings,
  snapsPlatformRules,
  normalizeTargetPlatforms,
  snapsTargetPlatforms,
  SnapsTargetPlatform,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import { withTemporalTimeout, temporalTimeoutMs } from '../../../../apps/orchestrator/src/temporal-timeout';
import {
  resetSnapsUnreadableWarnings,
  warnUnreadableJsonFile,
} from '@gitroom/nestjs-libraries/snaps/storage/warn-unreadable-file';
import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';
import { snapsCleanBodyText } from '@gitroom/nestjs-libraries/snaps/text/body-text';
import {
  snapsClampToWeight,
  snapsWeightedLength,
} from '@gitroom/nestjs-libraries/snaps/text/weighted-length';
import { sanitizeSnapsHashtags } from '@gitroom/nestjs-libraries/snaps/transform/hashtags';
import { snapsCafeSubject } from '@gitroom/nestjs-libraries/snaps/text/cafe-subject';
import { summariseSnapsWorkspaceImport } from '@gitroom/frontend/components/snaps/snaps-workspace.shared';
import {
  readSnapsShortsMakerScript,
  readSnapsShortsPoll,
} from '@gitroom/frontend/components/snaps/snaps-shorts.shared';
import { snapsStepBadge } from '@gitroom/frontend/components/snaps/snaps-workspace.shared';
import { snapsSplitSentences } from '@gitroom/nestjs-libraries/snaps/text/split-sentences';
import { snapsReplyChannels } from '@gitroom/frontend/components/snaps/snaps-workspace.shared';
import { readSnapsCardNewsDeck } from '@gitroom/frontend/components/snaps/snaps-workspace.shared';
import { readSnapsAgentResult } from '@gitroom/frontend/components/snaps/snaps-workspace.shared';
import { toLocalInputValue } from '@gitroom/frontend/components/snaps/snaps-workspace.shared';
import {
  snapsHealthHeadline,
  snapsHealthVerdict,
  formatSnapsVariantPlainText,
  formatSnapsVariantMarkdown,
  formatSnapsVariantHtml,
  formatLocalDate,
  formatLocalDateTime,
  defaultPublishDate,
} from '@gitroom/frontend/components/snaps/snaps-workspace.shared';
import { snapsShortsBadges } from '@gitroom/frontend/components/snaps/snaps-shorts.shared';
import { ensureSnapsDataDir, snapsDataDirHealth } from '@gitroom/nestjs-libraries/snaps/storage/data-dir-health';
import { snapsMediaFileName } from '@gitroom/nestjs-libraries/snaps/text/media-file-name';
import { snapsPublishDateProblem } from '@gitroom/frontend/components/snaps/snaps-workspace.shared';
import { ValidationPipe } from '@nestjs/common';
import { SnapsTransformRequestDto } from '@gitroom/nestjs-libraries/snaps/dto/transform-request.dto';
import { describeSnapsAttachResult } from '@gitroom/frontend/components/snaps/snaps-workspace.shared';
import {
  confirmOperatorAction,
  describeSnapsSaveOutcome,
  formatSnapsAgentBrief,
  summariseSnapsReportOutcome,
} from '@gitroom/frontend/components/snaps/snaps-workspace.shared';
import {
  describeSnapsRenderJobRequest,
  readSnapsRenderJobPoll,
} from '@gitroom/frontend/components/snaps/snaps-shorts.shared';
import {
  snapsNaverCafePending,
  snapsShowNaverCafeFields,
} from '@gitroom/frontend/components/snaps/snaps-workspace.shared';

class OfflineOllama {
  get model() {
    return 'jest-offline-ollama';
  }

  // Stands in for OllamaClient, which the services now ask which engine
  // answered instead of reporting the literal 'ollama'. A double without this
  // made that call throw inside the try, and every result came back labelled
  // as the deterministic fallback - 26 tests failed that way at once.
  provider(): 'ollama' | 'deepseek' {
    return 'ollama';
  }

  async chatJson<T>(): Promise<T> {
    throw new Error('offline test path');
  }
}

class PartialOllama extends OfflineOllama {
  get model() {
    return 'jest-partial-ollama';
  }

  async chatJson<T>(): Promise<T> {
    return {
      variants: [
        {
          platform: 'instagram',
          title: 'AI normalized title',
          content: 'AI normalized Instagram content',
          hashtags: 'snaps #snaps 마케팅',
          notes: 'notes should be ignored because it is not an array',
        },
      ],
    } as T;
  }
}

class MalformedVariantOllama extends OfflineOllama {
  get model() {
    return 'jest-malformed-variant-ollama';
  }

  async chatJson<T>(): Promise<T> {
    return {
      variants: [
        {
          platform: 'instagram',
          title: {
            invalid: true,
          },
          content: {
            invalid: true,
          },
          hashtags: ['좋은 태그', '#중복', '중복', 'bad!tag'],
          notes: [' 정상 노트 ', null],
        },
        {
          platform: 'threads',
          content: '정상 Threads 결과',
          hashtags: ['threads update', '#threads'],
        },
      ],
    } as T;
  }
}

class LegacyFeedbackSummaryOllama extends OfflineOllama {
  async chatJson<T>(): Promise<T> {
    return {
      total: '2',
      byPlatform: {
        threads: '2',
      },
      bySentiment: {
        positive: '1',
        negative: '1',
      },
      highlights: ['legacy sentiment aliases normalized'],
      replySuggestions: [
        {
          target: 'negative',
          reply: '불편하셨던 부분을 확인하고 보완하겠습니다.',
        },
      ],
    } as T;
  }
}

class UndercountingFeedbackSummaryOllama extends OfflineOllama {
  async chatJson<T>(): Promise<T> {
    return {
      total: 0,
      byPlatform: {
        threads: 0,
        instagram: 0,
      },
      bySentiment: {
        question: 0,
        collaboration: 0,
      },
      highlights: ['llm undercount should not erase deterministic counts'],
      replySuggestions: [],
    } as T;
  }
}

class MalformedReportOllama extends OfflineOllama {
  async chatJson<T>(): Promise<T> {
    return {
      summary: {
        invalid: true,
      },
    } as T;
  }
}

class MalformedShortsOllama extends OfflineOllama {
  async chatJson<T>(): Promise<T> {
    return {
      title: {
        invalid: true,
      },
      coreSummary: ['요약', '문장'],
      hook: {
        invalid: true,
      },
      durationSeconds: '60',
      narration: ['첫 문장', '둘째 문장'],
      storyboard: [
        null,
        {
          scene: '2',
          startSecond: 'bad',
          endSecond: 999,
          visual: {
            invalid: true,
          },
          narration: ['장면', '나레이션'],
          overlayText: ['오버레이'],
          pixellePrompt: {
            invalid: true,
          },
        },
        {
          scene: 3,
          visual: '정상 영상 장면',
        },
        'bad scene',
      ],
      uploadMetadata: {
        title: {
          invalid: true,
        },
        description: ['업로드', '설명'],
        hashtags: 'shorts #snaps 나쁜!태그',
      },
    } as T;
  }
}

class EmbeddingOllama extends OfflineOllama {
  async embed(input: string | string[]): Promise<number[][]> {
    const values = Array.isArray(input) ? input : [input];
    return values.map((value) => [
      value.includes('인스타그램') || value.includes('instagram') ? 1 : 0,
      value.includes('고객') ? 1 : 0,
      value.length / 1000,
    ]);
  }
}

class MalformedEmbeddingOllama extends OfflineOllama {
  async embed(): Promise<number[][]> {
    return [[1, Number.NaN, Number.POSITIVE_INFINITY, 'bad' as unknown as number, 0.5]];
  }
}

const emptyRag = {
  search: jest.fn().mockResolvedValue([]),
};

describe('snaps core behavior', () => {
  const originalDataDir = process.env.SNAPS_DATA_DIR;
  const originalFallback = process.env.SNAPS_ALLOW_RULE_FALLBACK;
  const originalPixelleUrl = process.env.PIXELLE_VIDEO_URL;

  afterEach(async () => {
    process.env.SNAPS_ALLOW_RULE_FALLBACK = originalFallback;
    if (originalPixelleUrl === undefined) {
      delete process.env.PIXELLE_VIDEO_URL;
    } else {
      process.env.PIXELLE_VIDEO_URL = originalPixelleUrl;
    }
    if (originalDataDir === undefined) {
      delete process.env.SNAPS_DATA_DIR;
    } else {
      process.env.SNAPS_DATA_DIR = originalDataDir;
    }
    jest.clearAllMocks();
  });

  it('keeps Naver Blog, KakaoTalk, and Xiaohongshu as assist-only rule fallback variants', async () => {
    process.env.SNAPS_ALLOW_RULE_FALLBACK = 'true';
    const transformer = new SnapsContentTransformService(
      new OfflineOllama() as any,
      emptyRag as any
    );

    const result = await transformer.transform('jest-org', {
      sourceText: '이번 주 신제품 업데이트와 고객 반응을 플랫폼별 게시물로 정리합니다.',
      targetPlatforms: ['naver-blog', 'kakao-talk', 'xiaohongshu'],
      useRag: false,
    });

    const naverBlog = result.variants.find(
      (variant) => variant.platform === 'naver-blog'
    );
    const kakaoTalk = result.variants.find(
      (variant) => variant.platform === 'kakao-talk'
    );
    const xiaohongshu = result.variants.find(
      (variant) => variant.platform === 'xiaohongshu'
    );

    expect(result.provider).toBe('rule-fallback');
    expect(naverBlog?.publishMode).toBe('assist');
    expect(naverBlog?.content).toContain('목차');
    expect(naverBlog?.content).toContain('본문');
    expect(kakaoTalk?.publishMode).toBe('assist');
    expect(xiaohongshu?.publishMode).toBe('assist');
    expect(xiaohongshu?.content).toContain('중국 SNS 노트');
  });

  // Measured side by side before the fix. A total model outage came back as
  // rule output with a warning naming the cause; an unreadable style-example
  // file threw a plain Error straight out of transform(), which Nest turns
  // into a 500 whose body says only "Internal server error" - no variants, no
  // warning, no reason. The optional half was the fatal one.
  it('does not lose the whole transform when the style examples cannot be read', async () => {
    const unreadableRag = {
      search: async () => {
        throw new Error('EACCES: permission denied, open /var/snaps/rag.json');
      },
    };
    const workingModel = {
      provider: () => 'deepseek',
      model: 'deepseek-v4-flash',
      chatJson: async () => ({
        variants: [
          {
            platform: 'instagram',
            content: '변환된 본문입니다.',
            hashtags: ['#환절기'],
          },
        ],
      }),
    };

    const transformer = new SnapsContentTransformService(
      workingModel as never,
      unreadableRag as never
    );
    const result = await transformer.transform('jest-org', {
      sourceText: '가을 환절기 감기 예방',
      targetPlatforms: ['instagram'],
    } as never);

    // The model did the work, so this is not a fallback.
    expect(result.provider).toBe('deepseek');
    expect(result.variants).toHaveLength(1);
    // And the operator is told the saved style was not applied, with the
    // reason - a result that quietly ignores the style library looks correct.
    expect(
      result.warnings.some((warning) => warning.includes('스타일 예시'))
    ).toBe(true);
    expect(
      result.warnings.some((warning) => warning.includes('EACCES'))
    ).toBe(true);

    // The fallback return is a second, separate warning list. Putting the
    // warning on the model path alone would lose it exactly when the run is
    // already degraded - which is the mistake platformWarnings was written to
    // avoid, one line above.
    const deadModel = {
      provider: () => 'deepseek',
      model: 'deepseek-v4-flash',
      chatJson: async () => {
        throw new Error('DeepSeek chat failed: 402 Insufficient Balance');
      },
    };
    const degraded = await new SnapsContentTransformService(
      deadModel as never,
      unreadableRag as never
    ).transform('jest-org', {
      sourceText: '가을 환절기 감기 예방',
      targetPlatforms: ['instagram'],
    } as never);

    expect(degraded.provider).toBe('rule-fallback');
    expect(
      degraded.warnings.some((warning) => warning.includes('스타일 예시'))
    ).toBe(true);
    expect(
      degraded.warnings.some((warning) => warning.includes('기본 규칙'))
    ).toBe(true);
  });

  // The workspace backup is the one flow where a quiet mistake is data loss:
  // the operator exports, wipes, and imports expecting to get the same
  // workspace back. Every collection it carries has its own importer, its own
  // normalizer and its own cap, and `npx jest --listTests` showed no test
  // touching the round trip at all - the controller smoke covers the routes
  // with stubs, which cannot tell whether a real record survives the trip.
  //
  // Measured here rather than asserted from reading: counts, the embedding
  // vector, and every field of one record from each collection.
  // Every snaps cleaner was `trim().replace(/\s+/g, ' ')`, and `\s` includes
  // the newline. Measured against the real services, a six-line paste came back
  // as one line in all three places that store a body:
  //
  //   ragExample   in=6 out=1
  //   sourceText   in=6 out=1
  //   inboxComment in=6 out=1
  //
  // The style example is the sharpest - it exists to teach the model a writing
  // style, and in Korean SNS the line breaks are a large part of it. The inbox
  // one is somebody else's writing. And the saved source is handed on to the
  // card news and RAG paths, so its paragraphs were lost downstream as well.
  //
  // Written against the real services on purpose: the controller smoke stubs
  // the RAG service, which is why fixing the controller alone looked like it
  // had worked while the service flattened the same field a layer down.
  // The stored bodies were one half; the published one is the other. Both
  // variant builders cleaned the caption with the flattening helper they use
  // for the title and the media urls beside it, so a six-line Korean caption -
  // the shape Instagram captions actually take - published as one line.
  // The fallback storyboard narrated 120-character windows of the source. A
  // source shorter than 120 x sceneCount left every window after the first
  // empty, and each fell back to the whole summary - measured on a six-line
  // note, four scenes with identical narration, which is what a viewer would
  // have watched. The windows were also a plain UTF-16 slice, so they could cut
  // an emoji in half at 120 and again at 280.
  it('gives the fallback storyboard a different beat in every scene', async () => {
    const dead = {
      provider: () => 'deepseek',
      model: 'scene-stub',
      embed: async () => [[0.1]],
      chatJson: async () => {
        throw new Error('the fallback is the point of this test');
      },
    };
    const service = new SnapsShortVideoService(dead as never);
    const newline = String.fromCharCode(10);
    const lines = [
      '가을 환절기에는 일교차가 큽니다',
      '실내 습도를 50% 이상으로 유지하세요',
      '외출 후에는 손을 씻으세요',
      '하루 7시간 이상 자세요',
      '비타민C를 챙기세요',
      '오늘부터 실천해 보세요',
    ];
    const prose = lines.join(newline);

    for (const durationSeconds of [30, 75]) {
      const script = await service.script({
        sourceText: prose,
        platform: 'youtube',
        durationSeconds,
      } as never);
      expect(script.provider).toBe('rule-fallback');
      const beats = script.storyboard.map((scene) => scene.narration);
      // Distinct strings is not the question - a scene narrating two
      // sentences and another narrating the second of them are different
      // strings and one repeated sentence. Count how often each line of
      // the source is spoken.
      for (const line of lines) {
        const spoken = beats.filter((beat) => beat.includes(line)).length;
        expect(`${durationSeconds}s ${line}: ${spoken}`).toBe(
          `${durationSeconds}s ${line}: 1`
        );
      }
      // And the scene count still follows the duration - it is the timeline the
      // renderer is handed, so a short source must not shorten the video.
      expect(`${durationSeconds}s scenes=${beats.length}`).toBe(
        `${durationSeconds}s scenes=${durationSeconds <= 30 ? 4 : 6}`
      );
    }

    // One sentence cannot fill four scenes, and inventing text would be worse
    // than repeating it. What must not happen is the earlier behaviour where
    // several sentences were available and still went unused.
    const single = await service.script({
      sourceText: '환절기 감기 예방 방법을 짧게 정리합니다.',
      platform: 'youtube',
      durationSeconds: 30,
    } as never);
    expect(single.storyboard).toHaveLength(4);
  });

  // snaps cannot publish to Naver Blog, KakaoTalk or Xiaohongshu, so for those
  // three the copy button is the product - and the three formatters behind it
  // had no test at all. They are also the end of the chain that keeps the
  // writer's line breaks: the stores, the builders and the publish payload all
  // preserve them now, and this is where they become markup.
  // The activity log used to show `createdAt.slice(0, 16)` - the UTC text
  // inside the ISO string - so for the Korean operators this product is built
  // for, every entry read nine hours from when it happened, and a date slice
  // was off by a whole day either side of midnight. The helpers that replaced
  // it had no test: measured in Asia/Seoul, `2026-09-12T23:30:00Z` renders as
  // `2026-09-13 08:30`, which a raw slice would have called `2026-09-12 23:30`.
  //
  // Written against the ambient zone rather than a fixed one, because that is
  // what the browser gives them. The parts come from Date, which tracks the
  // same zone, so the assertions hold wherever the suite runs.
  // A Naver Cafe article body is HTML - the provider's own live smoke posts
  // `<p><b>...</b></p>` - and in HTML a newline is whitespace. Everything snaps
  // sends is plain text: the publish payload carries the variant's content,
  // which the model writes with line breaks. Measured through the provider, a
  // six-line reply went out as one run-on paragraph. The copy button already
  // converted breaks to markup for the three platforms snaps cannot publish to;
  // the one it can publish to with its own provider did not.
  // A rise is reported as an insight carrying its size - `+750(+300%)` - and a
  // fall was an action item carrying none: `impressions 하락 원인을 점검하세요`
  // reads the same for a 5% dip and a 75% collapse, and the fall is the one
  // worth acting on. Same formatters as the rise, so a sign change cannot make
  // the number and the sentence disagree.
  // `numeric()` answers 0 for anything that is not a finite number, so
  // `metricValue: "3,456,789"` - the shape a dashboard displays and an operator
  // pastes into the manual metric JSON this product supports - became 0 and the
  // report stated `참여 행동은 총 0건입니다` as a fact. A confident wrong number
  // is worse than a gap.
  //
  // Stripping the separator would be a guess about the locale: in several a
  // comma is the decimal point. Saying the value could not be read is not.
  // The global ValidationPipe runs before the handler, so for the commonest
  // mistakes the operator never reaches the Korean messages the controller
  // writes. Measured with the real pipe and the options main.ts installs:
  //
  //   too short        -> "sourceText must be longer than or equal to 5 characters"
  //   unknown platform -> "each value in targetPlatforms must be one of ..."
  //
  // while `'sourceText는 최소 5자 이상이어야 합니다.'` sat in the controller,
  // unreachable for that input. In a Korean-first product the commonest error
  // was the one in English.
  it('rejects a snaps request in the language the product is written in', async () => {
    const pipe = new ValidationPipe({ transform: true });
    const answer = async (value: unknown) => {
      try {
        await pipe.transform(value, {
          type: 'body',
          metatype: SnapsTransformRequestDto,
        });
        return { accepted: true, messages: [] as string[] };
      } catch (error: unknown) {
        const body = (error as { getResponse(): { message?: string[] } }).getResponse();
        return { accepted: false, messages: body.message || [] };
      }
    };

    const short = await answer({ sourceText: '짧음' });
    expect(short.accepted).toBe(false);
    expect(short.messages.join(' ')).toContain('최소 5자');
    // Not merely Korean somewhere - no English default may survive beside it.
    expect(short.messages.join(' ')).not.toContain('must be');

    const unknown = await answer({
      sourceText: '환절기 감기 예방 원문입니다.',
      targetPlatforms: ['facebook'],
    });
    expect(unknown.accepted).toBe(false);
    expect(unknown.messages.join(' ')).toContain('지원하지 않는 값');
    // The list comes from the constraint rather than a second hand-written
    // copy, so it cannot drift from the platforms snaps actually supports.
    expect(unknown.messages.join(' ')).toContain('instagram');
    expect(unknown.messages.join(' ')).not.toContain('must be');

    // And nothing about what is accepted changed: an over-long source still
    // reaches the handler, where the truncation warning is written.
    expect((await answer({ sourceText: '가'.repeat(80000) })).accepted).toBe(
      true
    );
    expect(
      (await answer({ sourceText: '환절기 감기 예방 원문입니다.' })).accepted
    ).toBe(true);
  });

  // Whenever the embedder is down - and addExample stores no vector when it
  // is - every RAG search falls through to keyword matching. The rule counted
  // a token when one side started with the other, which is where a Korean
  // particle attaches, and that only fires when one side is the bare noun. A
  // stored example is running prose, so both sides usually carry a particle
  // and neither is a prefix of the other. Measured against a store holding
  // `환절기에는 일교차가...`:
  //
  //   "환절기에는 어떻게 해야 하나요" -> 0.250   (particle happened to match)
  //   "환절기가 다가옵니다"           -> 0.000   (different particle)
  //
  // and at zero an unrelated English example ranked first.
  // A proxy in front of Shorts-Maker answers with an error page, and that page
  // became the operator's message verbatim: measured, a 502 came back as
  // `<html><body>Bad Gateway</body></html>`. The Pixelle client and the
  // DeepSeek client both compress an HTML body to the status; this one, the
  // third of the three, did not.
  // Six stores answer /snaps/import, and their counts have to mean the same
  // thing or the summary the operator reads is nonsense. Two of them capped
  // the incoming list before the merge and then derived `dropped` from the
  // merge alone, so everything the cap cut was invisible. Measured at 60,000
  // records each:
  //
  //   styleExamples  imported: 500    dropped: 0       <- 59,500 gone, unsaid
  //   inboxItems     imported: 1000   dropped: 0       <- 59,000 gone, unsaid
  //   sources        imported: 59990  dropped: 59490
  //
  // An operator restoring a backup saw `dropped: 0` and believed the restore
  // was complete. The invariant that ties the three numbers together is
  // `imported - dropped === total` for an import into an empty workspace.
  // Two hand-written lists of the same ten activity types - a union and the
  // array record() checks against - and `'card-news'` reached only the union.
  // The compiler is happy either way, so the three card-news routes each did
  // all of their work and then threw on the last line:
  //
  //   record('card-news')      -> BadRequestException
  //   importEntries(ten)       -> imported: 9, the card-news entry gone
  //
  // /card-news/generate renders every slide image before it records, so a
  // request that had succeeded answered 400 with a message about activity
  // logging. This walks the type list the controller actually writes rather
  // than naming the types, so a type added to one list and not the other
  // fails here.
  it('accepts every activity type the controller writes', async () => {
    const controller = await fsp.readFile(
      path.join(
        __dirname,
        '../../../../apps/backend/src/api/routes/snaps.controller.ts'
      ),
      'utf8'
    );
    const written = Array.from(
      new Set(
        Array.from(controller.matchAll(/type: '([a-z][a-z-]*)',/g)).map(
          (match) => match[1]
        )
      )
    );
    // Guard the guard: the controller writes ten distinct kinds of entry and
    // a regex that matched nothing would make this test pass silently.
    expect(`found ${written.length >= 8} activity types`).toBe(
      'found true activity types'
    );

    const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'snaps-acttype-'));
    const previous = process.env.SNAPS_DATA_DIR;
    process.env.SNAPS_DATA_DIR = base;
    try {
      const activity = new SnapsActivityLogService();
      // Every `type:` literal in the controller that reaches activity.record
      // has to be accepted. The controller also writes `type:` for other
      // things - a variant's platform, for one - so only the ones the log
      // knows about are required, and the list below is what record() must
      // never refuse.
      const logged = [
        'transform',
        'draft',
        'rag',
        'source',
        'report',
        'video',
        'agent',
        'inbox',
        'card-news',
        'delete',
      ];
      const missing = logged.filter((type) => !written.includes(type));
      expect(`types the controller no longer writes: ${missing.join(',')}`).toBe(
        'types the controller no longer writes: '
      );

      for (const type of logged) {
        const recorded = await activity.record('acttype-org', {
          type: type as never,
          title: `${type} 기록`,
        });
        expect(`${type} recorded as ${recorded.type}`).toBe(
          `${type} recorded as ${type}`
        );
      }

      // And the backup path, which drops what it does not recognise without
      // saying so.
      const result = await activity.importEntries(
        'acttype-restore',
        logged.map((type, index) => ({
          id: `restore-${index}`,
          type,
          title: `${type} 기록`,
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
        }))
      );
      expect(`restored ${result.imported} of ${logged.length}`).toBe(
        `restored ${logged.length} of ${logged.length}`
      );
      const restored = await activity.list('acttype-restore');
      expect(
        `missing after restore: ${logged
          .filter((type) => !restored.some((entry) => entry.type === type))
          .join(',')}`
      ).toBe('missing after restore: ');

      // The other half of the same check: widening the list until it accepts
      // anything would satisfy everything above, and a typo would then be
      // stored as its own kind and shown to the operator as one.
      await expect(
        activity.record('acttype-org', {
          type: 'cardnews' as never,
          title: '오타난 종류',
        })
      ).rejects.toThrow('활동 기록에는 type과 title이 필요합니다.');
      const typo = await activity.importEntries('acttype-restore', [
        { id: 'typo-1', type: 'cardnews', title: '오타난 종류' },
      ]);
      expect(`typo imported ${typo.imported}`).toBe('typo imported 0');
    } finally {
      if (previous === undefined) {
        delete process.env.SNAPS_DATA_DIR;
      } else {
        process.env.SNAPS_DATA_DIR = previous;
      }
      await fsp.rm(base, { recursive: true, force: true });
    }
  });

  it('says how much of an oversized import it threw away', async () => {
    const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'snaps-impcap-'));
    const previous = process.env.SNAPS_DATA_DIR;
    process.env.SNAPS_DATA_DIR = base;
    const N = 1200;
    try {
      const library = new SnapsSourceLibraryService();
      const stores: Array<[string, () => Promise<unknown>]> = [
        [
          'sources',
          () =>
            library.importSources(
              'cap-org',
              Array.from({ length: N }, (_, i) => ({
                id: `s${i}`,
                sourceText: `가져오기 상한 검증용 원문 ${i} 입니다.`,
              }))
            ),
        ],
        [
          'reports',
          () =>
            library.importReports(
              'cap-org',
              Array.from({ length: N }, (_, i) => ({
                id: `r${i}`,
                title: `보고서 ${i}`,
                payload: { index: i },
              }))
            ),
        ],
        [
          'styleExamples',
          () =>
            new SnapsVectorStoreService().importExamples(
              'cap-org',
              Array.from({ length: N }, (_, i) => ({
                id: `e${i}`,
                platform: 'instagram',
                content: `스타일 예시 ${i}`,
              }))
            ),
        ],
        [
          'activity',
          () =>
            new SnapsActivityLogService().importEntries(
              'cap-org',
              Array.from({ length: N }, (_, i) => ({
                id: `a${i}`,
                type: 'source',
                title: `활동 ${i}`,
              }))
            ),
        ],
        [
          'inboxItems',
          () =>
            new SnapsFeedbackInboxService(
              undefined as never
            ).importStoredItems(
              'cap-org',
              Array.from({ length: N }, (_, i) => ({
                id: `f${i}`,
                platform: 'instagram',
                content: `댓글 ${i}`,
              }))
            ),
        ],
      ];

      for (const [label, call] of stores) {
        const answer = (await call()) as {
          imported: number;
          total: number;
          dropped: number;
        };
        // Every store here caps below N, so something must be reported gone.
        expect(`${label} kept ${answer.total < N}`).toBe(`${label} kept true`);
        expect(`${label} dropped ${answer.dropped > 0}`).toBe(
          `${label} dropped true`
        );
        // The three numbers have to add up, into an empty workspace.
        expect(
          `${label} ${answer.imported} - ${answer.dropped} = ${answer.total}`
        ).toBe(`${label} ${answer.imported} - ${answer.dropped} = ${
          answer.imported - answer.dropped
        }`);
        // and `imported` counts what was sent, not what survived.
        expect(`${label} imported ${answer.imported}`).toBe(
          `${label} imported ${N}`
        );
      }
    } finally {
      if (previous === undefined) {
        delete process.env.SNAPS_DATA_DIR;
      } else {
        process.env.SNAPS_DATA_DIR = previous;
      }
      await fsp.rm(base, { recursive: true, force: true });
    }
  });

  it('reports a Shorts-Maker failure without pasting an error page into it', async () => {
    const realFetch = global.fetch;
    const previousUrl = process.env.SHORTS_MAKER_URL;
    process.env.SHORTS_MAKER_URL = 'http://localhost:4100';
    const client = new ShortsMakerClientService();
    const answerWith = async (responder: unknown) => {
      global.fetch = responder as never;
      return (await client.topicToScript({
        topic: '환절기 감기 예방',
      } as never)) as { ok?: boolean; error?: string };
    };

    try {
      const html = await answerWith(async () => ({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: async () => '<html><body>Bad Gateway</body></html>',
      }));
      expect(html.ok).toBe(false);
      expect(html.error).toBe('502 Bad Gateway');
      expect(String(html.error).includes('<')).toBe(false);

      // A service that names its own problem is still quoted - the compression
      // is for markup, not for every failure.
      const named = await answerWith(async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => '{"error":"renderer crashed"}',
      }));
      expect(named.error).toBe('renderer crashed');

      // Plain text is not markup either.
      const plain = await answerWith(async () => ({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: async () => 'renderer is restarting',
      }));
      expect(plain.error).toBe('renderer is restarting');
    } finally {
      global.fetch = realFetch;
      if (previousUrl === undefined) {
        delete process.env.SHORTS_MAKER_URL;
      } else {
        process.env.SHORTS_MAKER_URL = previousUrl;
      }
    }
  });

  it('finds a Korean example whatever particle the query wears', async () => {
    const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'snaps-ragkw-'));
    const previous = process.env.SNAPS_DATA_DIR;
    process.env.SNAPS_DATA_DIR = base;
    try {
      const down = {
        embed: async () => {
          throw new Error('the keyword fallback is the point');
        },
      };
      const rag = new SnapsRagService(
        down as never,
        new SnapsVectorStoreService()
      );
      for (const content of [
        '환절기에는 일교차가 커지면서 면역력이 떨어지기 쉽습니다.',
        '신제품 무선 이어폰이 출시되었습니다.',
        'Autumn brings wide temperature swings, so keep indoor humidity high.',
      ]) {
        await rag.addExample('kw-org', {
          platform: 'instagram',
          content,
        } as never);
      }
      const top = async (query: string) =>
        (await rag.search('kw-org', query, 'instagram', 3))[0];

      for (const query of [
        '환절기',
        '환절기에는 어떻게 해야 하나요',
        '환절기가 다가옵니다',
        '환절기 건강관리 팁',
      ]) {
        const hit = await top(query);
        expect(`${query} -> ${String(hit?.content || '').slice(0, 3)}`).toBe(
          `${query} -> 환절기`
        );
        expect(`${query} scored ${(hit?.score || 0) > 0}`).toBe(
          `${query} scored true`
        );
      }

      // Latin keeps the stricter rule: two characters is the right unit for a
      // Hangul syllable and far too weak for a letter. Measured on adversarial
      // pairs, `humidity` and `humble` shared `hu` and would have counted.
      const store = new SnapsVectorStoreService();
      const shares = (a: string, b: string) =>
        (
          store as unknown as { sharesStem(x: string, y: string): boolean }
        ).sharesStem(a, b);
      expect(`환절기가/환절기에는 ${shares('환절기가', '환절기에는')}`).toBe(
        '환절기가/환절기에는 true'
      );
      expect(`humidity/humble ${shares('humidity', 'humble')}`).toBe(
        'humidity/humble false'
      );
      // and a real English prefix still counts.
      expect(`autumn/autumnal ${shares('autumn', 'autumnal')}`).toBe(
        'autumn/autumnal true'
      );
      expect(`신제품/신뢰도 ${shares('신제품', '신뢰도')}`).toBe(
        '신제품/신뢰도 false'
      );
    } finally {
      if (previous === undefined) {
        delete process.env.SNAPS_DATA_DIR;
      } else {
        process.env.SNAPS_DATA_DIR = previous;
      }
      await fsp.rm(base, { recursive: true, force: true });
    }
  });

  it('says a metric value could not be read rather than calling it zero', async () => {
    const dead = {
      provider: () => 'deepseek',
      model: 'unreadable-stub',
      embed: async () => [[0.1]],
      chatJson: async () => {
        throw new Error('the deterministic path is the point');
      },
    };
    const service = new SnapsReportGeneratorService(dead as never);
    const report = async (metrics: unknown[]) =>
      ((
        await service.generate({ title: 'unreadable', metrics } as never)
      ).actionItems || []) as string[];

    const pasted = await report([
      { platform: 'instagram', metricKey: 'impressions', metricValue: '3,456,789', date: '2026-09-01' },
      { platform: 'instagram', metricKey: 'likes', metricValue: '12,345', date: '2026-09-01' },
    ]);
    // First, because every number below it was computed without those values.
    expect(pasted[0]).toContain('2개');
    expect(pasted[0]).toContain('읽지 못해');

    const percent = await report([
      { platform: 'instagram', metricKey: 'impressions', metricValue: '1200', date: '2026-09-01' },
      { platform: 'instagram', metricKey: 'rate', metricValue: '12%', date: '2026-09-01' },
    ]);
    expect(percent[0]).toContain('1개');

    // A value left out is not a value that could not be read, and neither is
    // an empty one - saying otherwise would put the warning on every report
    // with a sparse row.
    for (const sparse of [
      [{ platform: 'instagram', metricKey: 'impressions', date: '2026-09-01' }],
      [{ platform: 'instagram', metricKey: 'impressions', metricValue: '', date: '2026-09-01' }],
      [{ platform: 'instagram', metricKey: 'impressions', metricValue: 3000, date: '2026-09-01' }],
    ]) {
      const items = await report(sparse);
      expect(items.some((item) => item.includes('읽지 못해'))).toBe(false);
    }
  });

  it('says how far a metric fell, not only that it fell', async () => {
    const dead = {
      provider: () => 'deepseek',
      model: 'decline-stub',
      embed: async () => [[0.1]],
      chatJson: async () => {
        throw new Error('the deterministic path is the point');
      },
    };
    const service = new SnapsReportGeneratorService(dead as never);
    const row = (metricValue: number, date: string) => ({
      platform: 'instagram',
      metricKey: 'impressions',
      metricValue,
      date,
    });
    const fallFor = async (first: number, last: number) => {
      const report = await service.generate({
        title: 'decline',
        metrics: [row(first, '2026-09-01'), row(last, '2026-09-02')],
      } as never);
      return ((report.actionItems || []) as string[]).find((item) =>
        item.includes('하락')
      );
    };

    expect(await fallFor(1000, 250)).toContain('-750(-75%)');
    expect(await fallFor(1000, 950)).toContain('-50(-5%)');

    const dropped = await service.generate({
      title: 'decline',
      metrics: [row(1000, '2026-09-01'), row(250, '2026-09-02')],
    } as never);
    expect(
      ((dropped.insights || []) as string[]).some((item) =>
        item.includes('증가')
      )
    ).toBe(false);

    // No honest rate to report from zero or from a negative start - the same
    // omission the rise path documents, so the two stay consistent.
    const fromZero = await fallFor(0, -10);
    expect(fromZero).toContain('-10');
    expect(fromZero).not.toContain('%');
    const fromNegative = await fallFor(-100, -300);
    expect(fromNegative).toContain('-200');
    expect(fromNegative).not.toContain('%');

    // And a rise is still a finding rather than a to-do.
    const rising = await service.generate({
      title: 'rise',
      metrics: [row(250, '2026-09-01'), row(1000, '2026-09-02')],
    } as never);
    expect(
      ((rising.insights || []) as string[]).some((item) =>
        item.includes('+750(+300%)')
      )
    ).toBe(true);
    expect(
      ((rising.actionItems || []) as string[]).some((item) =>
        item.includes('하락')
      )
    ).toBe(false);
  });

  it('posts a Naver Cafe body with the line breaks the writer used', () => {
    const provider = new NaverCafeProvider();
    const toCafeContent = (
      provider as never as { toCafeContent(message: string): string }
    ).toCafeContent.bind(provider);
    const newline = String.fromCharCode(10);

    const plain = toCafeContent(
      [
        '안녕하세요!',
        '',
        '문의 주신 제품은 재입고됩니다.',
        '- 색상: 베이지',
        '',
        '감사합니다.',
      ].join(newline)
    );
    // A blank line is a paragraph; a single break is a <br />.
    expect(plain).toBe(
      '<p>안녕하세요!</p><p>문의 주신 제품은 재입고됩니다.<br />' +
        '- 색상: 베이지</p><p>감사합니다.</p>'
    );
    expect(plain.includes(newline)).toBe(false);

    // A message that already carries its own line structure is HTML, and its
    // newlines are the formatting between tags rather than the writer's -
    // adding breaks there would put a stray <br /> between every pair.
    const markup = `<p><b>환절기</b></p>${newline}<p>습도 50%</p>`;
    expect(toCafeContent(markup)).toBe(markup);

    expect(toCafeContent('한 줄입니다.')).toBe('<p>한 줄입니다.</p>');
    // Nothing in, nothing out - not an empty paragraph.
    expect(toCafeContent('   ')).toBe('');

    // The sanitising this function exists for still runs, and it runs before
    // the wrapping rather than on markup this function just wrote.
    expect(toCafeContent('<p onclick="x()">본문</p>')).toBe('<p>본문</p>');
    // Inline-only markup is markup too - the author chose the structure.
    expect(toCafeContent('<b>굵게</b>')).toBe('<b>굵게</b>');
    expect(
      toCafeContent('<a href="javascript:alert(1)">링크</a>')
    ).toBe('<a href="#alert(1)">링크</a>');
  });

  it('renders instants in the operator time zone, not the UTC text', () => {
    const pad = (value: number) => String(value).padStart(2, '0');
    const iso = '2026-09-12T23:30:00Z';
    const local = new Date(iso);
    const expected =
      `${local.getFullYear()}-${pad(local.getMonth() + 1)}-` +
      `${pad(local.getDate())} ${pad(local.getHours())}:` +
      `${pad(local.getMinutes())}`;

    expect(formatLocalDateTime(iso)).toBe(expected);
    expect(formatLocalDate(iso)).toBe(expected.slice(0, 10));

    // The regression itself: away from UTC the rendering must differ from the
    // text inside the string. In UTC there is nothing to tell apart, so the
    // check states that rather than passing silently.
    const offsetMinutes = local.getTimezoneOffset();
    if (offsetMinutes !== 0) {
      expect(formatLocalDateTime(iso)).not.toBe(
        iso.slice(0, 16).replace('T', ' ')
      );
    } else {
      expect(formatLocalDateTime(iso)).toBe('2026-09-12 23:30');
    }

    // Nothing in, nothing out - an empty cell rather than 'Invalid Date'.
    for (const bad of ['', 'not a date', undefined]) {
      expect(formatLocalDateTime(bad as never)).toBe('');
      expect(formatLocalDate(bad as never)).toBe('');
    }

    // The scheduler's default is an hour out, in the shape a datetime-local
    // input takes, and it has to survive the round trip back to an instant.
    const suggested = defaultPublishDate();
    expect(suggested).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    const parsed = new Date(suggested);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
    const aheadMinutes = Math.round((parsed.getTime() - Date.now()) / 60000);
    expect(`${aheadMinutes >= 58 && aheadMinutes <= 62}`).toBe('true');
    expect(formatLocalDateTime(parsed.toISOString())).toBe(
      suggested.replace('T', ' ')
    );
  });

  it('copies a variant without losing its line breaks or its angle brackets', () => {
    const newline = String.fromCharCode(10);
    const variant = {
      title: '환절기 <건강> 관리',
      content: [
        '안녕하세요!',
        '',
        '습도는 50% 이상 & 손 씻기',
        '- 비타민C 챙기기',
      ].join(newline),
      hashtags: ['#환절기건강', '#감기예방'],
    };

    const plain = formatSnapsVariantPlainText(variant);
    // Plain text is what it says: no escaping, every break kept.
    expect(plain.includes('습도는 50% 이상 & 손 씻기')).toBe(true);
    expect(plain.split(newline).length).toBeGreaterThan(4);
    expect(plain.endsWith('#환절기건강 #감기예방')).toBe(true);

    const markdown = formatSnapsVariantMarkdown(variant);
    expect(markdown.startsWith('# 환절기 <건강> 관리')).toBe(true);
    expect(markdown.includes('- 비타민C 챙기기')).toBe(true);

    const html = formatSnapsVariantHtml(variant);
    // Escaped, or a title containing a tag becomes markup in the operator's
    // blog post.
    expect(html.includes('<h1>환절기 &lt;건강&gt; 관리</h1>')).toBe(true);
    expect(html.includes('&amp;')).toBe(true);
    expect(html.includes('& 손')).toBe(false);
    // A blank line is a paragraph break; a single break is a <br />.
    expect(html.includes('</p><p>')).toBe(true);
    expect(html.includes('<br />')).toBe(true);
    // And no raw newline of the source survives inside a paragraph, which is
    // what a pasted blog post would render as one run-on line.
    expect(html.includes('안녕하세요!' + newline)).toBe(false);

    // CRLF reaches this from a caller-supplied variant, and `\n{2,}` does not
    // match `\r\n\r\n` - it left a stray carriage return in the markup and
    // turned a paragraph break into two line breaks.
    const crlf = formatSnapsVariantHtml({
      content: ['첫 문단입니다.', '', '둘째 문단입니다.'].join('\r\n'),
    });
    expect(crlf.includes('</p><p>')).toBe(true);
    expect(crlf.includes('\r')).toBe(false);

    // Nothing to say stays nothing: no empty heading, no empty tag paragraph.
    const bare = formatSnapsVariantHtml({ content: '한 줄입니다.' });
    expect(bare).toBe('<p>한 줄입니다.</p>');
    expect(formatSnapsVariantPlainText({ content: '한 줄입니다.' })).toBe(
      '한 줄입니다.'
    );
  });

  it('keeps the line breaks in a caption it publishes', () => {
    const newline = String.fromCharCode(10);
    const caption = [
      '환절기 감기 예방 4가지',
      '',
      '1. 습도 50% 이상',
      '2. 손 씻기',
      '',
      '저장해두세요!',
    ].join(newline);

    const deck = buildSnapsCardNewsVariants({
      title: '환절기 카드뉴스',
      caption,
      hashtags: ['#환절기'],
      slides: [{ id: 'media-1', path: '/uploads/1.png' }],
      targetPlatforms: ['instagram', 'x'],
    } as never);
    for (const variant of deck.variants) {
      expect(`${variant.platform}: ${variant.content.split(newline).length > 1}`).toBe(
        `${variant.platform}: true`
      );
    }

    const video = buildSnapsVideoVariants({
      title: `환절기${newline}쇼츠`,
      caption,
      videoUrl: 'https://cdn.example.com/y.mp4',
      mediaPath: '/uploads/y.mp4',
      targetPlatforms: ['instagram'],
    } as never);
    expect(video.variants[0].content.split(newline).length).toBeGreaterThan(1);
    // The title beside it is single-line by nature and stays that way.
    expect(video.variants[0].title?.includes(newline)).toBe(false);
  });

  it('keeps the line breaks in every body it stores', async () => {
    const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'snaps-body-'));
    const previous = process.env.SNAPS_DATA_DIR;
    process.env.SNAPS_DATA_DIR = base;
    const newline = String.fromCharCode(10);
    const written = [
      '  안녕하세요!  ',
      '',
      '',
      '',
      '문의   주신 제품은 다음 주에 재입고됩니다.',
      '- 색상: 베이지, 네이비',
      '',
      '감사합니다.',
      '',
    ].join(newline);

    try {
      const engine = {
        embed: async () => [[0.1, 0.2, 0.3]],
        provider: () => 'ollama',
        model: 'body-stub',
        chatJson: async () => {
          throw new Error('the body test does not need a model');
        },
      };
      const stored: Array<[string, string]> = [];

      const example = await new SnapsRagService(
        engine as never,
        new SnapsVectorStoreService()
      ).addExample('body-org', {
        platform: 'instagram',
        content: written,
      } as never);
      stored.push(['ragExample', String(example.content)]);

      const library = new SnapsSourceLibraryService();
      const source = await library.saveSource('body-org', {
        title: '환절기 원문',
        sourceText: written,
      } as never);
      stored.push(['sourceText', String(source.sourceText)]);

      const inbox = new SnapsFeedbackInboxService(engine as never);
      await inbox.importItems('body-org', {
        items: [
          {
            platform: 'instagram',
            author: '독자',
            content: written,
            sentiment: 'question',
          },
        ],
      } as never);
      const items = await inbox.listItems('body-org');
      stored.push(['inboxComment', String(items[0]?.content)]);

      for (const [what, text] of stored) {
        expect(`${what}: ${text.split(newline).length > 1}`).toBe(
          `${what}: true`
        );
        // Runs of blank lines collapse to one and runs of spaces inside a line
        // to one, so a paste out of a word processor is not a column of rows.
        expect(`${what}: ${text.includes(newline.repeat(3))}`).toBe(
          `${what}: false`
        );
        expect(`${what}: ${text.includes('문의   주신')}`).toBe(
          `${what}: false`
        );
        // Trimmed at both ends, blank lines included.
        expect(`${what}: ${text.startsWith('안녕하세요!')}`).toBe(
          `${what}: true`
        );
        expect(`${what}: ${text.endsWith('감사합니다.')}`).toBe(
          `${what}: true`
        );
      }

      // The fields that are single-line by nature keep the flattening cleaner:
      // a newline in a title or a platform name is not content.
      const titled = await library.saveSource('body-org', {
        title: `환절기${newline}제목`,
        sourceText: written,
      } as never);
      expect(String(titled.title).includes(newline)).toBe(false);
    } finally {
      if (previous === undefined) {
        delete process.env.SNAPS_DATA_DIR;
      } else {
        process.env.SNAPS_DATA_DIR = previous;
      }
      await fsp.rm(base, { recursive: true, force: true });
    }
  });

  it('returns the same workspace after an export and an import', async () => {
    const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'snaps-roundtrip-'));
    const previous = process.env.SNAPS_DATA_DIR;
    process.env.SNAPS_DATA_DIR = base;

    try {
      const engine = {
        embed: async (text: string) => [[text.length / 100, 0.5, 0.25]],
        provider: () => 'ollama',
        model: 'roundtrip-stub',
        chatJson: async () => {
          throw new Error('the round trip does not need a model');
        },
      };
      const library = new SnapsSourceLibraryService();
      const rag = new SnapsRagService(
        engine as never,
        new SnapsVectorStoreService()
      );
      const tasks = new SnapsAgentTaskService();
      const inbox = new SnapsFeedbackInboxService(engine as never);
      const activity = new SnapsActivityLogService();

      const from = 'roundtrip-source-org';
      const into = 'roundtrip-restored-org';

      await library.saveSource(from, {
        title: '환절기 원문',
        sourceText: '가을 환절기 감기 예방 원문입니다.',
        topic: '건강',
        tone: '친근',
      } as never);
      await rag.addExample(from, {
        platform: 'instagram',
        content: '환절기 스타일 예시 본문',
        tone: '친근',
      } as never);
      await library.saveReport(from, '9월 성과 보고서', {
        summary: '요약',
        insights: ['a', 'b'],
      } as never);
      await inbox.importItems(from, {
        items: [
          {
            platform: 'instagram',
            author: '독자',
            content: '이거 어디서 사나요?',
            sentiment: 'question',
          },
        ],
      } as never);
      await activity.record(from, {
        type: 'rag',
        title: 'Saved RAG style example',
        detail: { platform: 'instagram' },
      } as never);

      // The same six collections /snaps/export carries, read the same way.
      const readAll = async (organizationId: string) => ({
        sources: await library.listSources(organizationId),
        styleExamples: await rag.listExamples(organizationId),
        reports: await library.listReports(organizationId),
        agentTasks: await tasks.exportTasks(organizationId),
        inboxItems: await inbox.listItems(organizationId),
        activity: await activity.list(organizationId),
      });

      const exported = await readAll(from);
      // A round trip over empty collections would pass every assertion below
      // while proving nothing.
      expect(exported.sources).toHaveLength(1);
      expect(exported.styleExamples).toHaveLength(1);
      expect(exported.reports).toHaveLength(1);
      expect(exported.inboxItems).toHaveLength(1);
      expect(exported.activity.length).toBeGreaterThan(0);
      // The export keeps the vector on purpose - the list route strips it for
      // the UI, but a backup that drops it silently downgrades every restored
      // example to keyword-only matching.
      expect(
        (exported.styleExamples[0] as { embedding?: number[] }).embedding
      ).toHaveLength(3);

      await library.importSources(into, exported.sources);
      await rag.importExamples(into, exported.styleExamples);
      await library.importReports(into, exported.reports);
      await tasks.importTasks(into, exported.agentTasks);
      await inbox.importStoredItems(into, exported.inboxItems);
      await activity.importEntries(into, exported.activity);

      const restored = await readAll(into);
      for (const key of Object.keys(exported) as Array<keyof typeof exported>) {
        expect(`${key}=${restored[key].length}`).toBe(
          `${key}=${exported[key].length}`
        );
      }
      expect(
        (restored.styleExamples[0] as { embedding?: number[] }).embedding
      ).toEqual(
        (exported.styleExamples[0] as { embedding?: number[] }).embedding
      );

      // Field by field. The only difference a restore may introduce is the
      // owning organization, because that is what a restore is.
      const differences = (before: unknown, after: unknown) => {
        const a = (before || {}) as Record<string, unknown>;
        const b = (after || {}) as Record<string, unknown>;
        return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
          (field) => JSON.stringify(a[field]) !== JSON.stringify(b[field])
        );
      };
      for (const key of [
        'sources',
        'styleExamples',
        'reports',
        'inboxItems',
        'activity',
      ] as const) {
        expect(`${key}: ${differences(exported[key][0], restored[key][0])}`).toBe(
          `${key}: organizationId`
        );
      }
    } finally {
      if (previous === undefined) {
        delete process.env.SNAPS_DATA_DIR;
      } else {
        process.env.SNAPS_DATA_DIR = previous;
      }
      await fsp.rm(base, { recursive: true, force: true });
    }
  });

  it('normalizes partial Ollama variants and fills omitted requested platforms', async () => {
    const transformer = new SnapsContentTransformService(
      new PartialOllama() as any,
      emptyRag as any
    );

    const result = await transformer.transform('jest-org', {
      sourceText: 'LLM이 일부 플랫폼만 반환해도 나머지는 보정되어야 합니다.',
      targetPlatforms: ['instagram', 'threads'],
      useRag: false,
    });

    const instagram = result.variants.find(
      (variant) => variant.platform === 'instagram'
    );
    const threads = result.variants.find(
      (variant) => variant.platform === 'threads'
    );

    expect(result.provider).toBe('ollama');
    expect(result.variants).toHaveLength(2);
    expect(instagram?.content).toBe('AI normalized Instagram content');
    expect(instagram?.hashtags).toEqual(['#snaps', '#마케팅']);
    expect(instagram?.notes).toEqual([]);
    expect(threads?.content).toContain('LLM이 일부 플랫폼만 반환해도');
    expect(result.warnings).toContainEqual(
      expect.stringContaining('threads 변형을 제공하지 않아')
    );

    const malformedResult = await new SnapsContentTransformService(
      new MalformedVariantOllama() as any,
      emptyRag as any
    ).transform('jest-org', {
      sourceText: '비정상 variant가 와도 나머지 플랫폼은 유지되어야 합니다.',
      targetPlatforms: ['instagram', 'threads'],
      useRag: false,
    });
    const malformedInstagram = malformedResult.variants.find(
      (variant) => variant.platform === 'instagram'
    );
    const malformedThreads = malformedResult.variants.find(
      (variant) => variant.platform === 'threads'
    );
    expect(malformedResult.provider).toBe('ollama');
    expect(malformedInstagram?.content).toContain('비정상 variant');
    expect(malformedThreads?.content).toBe('정상 Threads 결과');
    expect(malformedThreads?.hashtags).toEqual(['#threads']);
  });

  it('preserves valid schedule payloads while warning about invalid Naver Cafe settings', () => {
    const result = buildSnapsPublishingPayload({
      variants: [
        {
          platform: 'instagram',
          label: 'Instagram',
          content: 'Instagram body',
          hashtags: [],
          settings: { __type: 'instagram', post_type: 'post' },
          publishMode: 'schedule',
        },
        {
          platform: 'naver-cafe',
          label: 'Naver Cafe',
          content: 'Cafe body',
          hashtags: [],
          settings: { __type: 'naver-cafe' },
          publishMode: 'schedule',
        },
      ],
      integrations: [
        { platform: 'instagram', integrationId: 'instagram-id' },
        { platform: 'naver-cafe', integrationId: 'naver-cafe-id' },
      ],
      // Pinned `now` rather than moved forward: this fixture was written
      // with a date that has since gone by, and the builder refuses a
      // publish time behind the clock because the workflow would publish
      // it immediately. A later date would rot the same way.
      publishDate: '2026-05-05T10:00:00.000Z',
      scheduleType: 'schedule',
      now: Date.parse('2026-05-05T09:00:00.000Z'),
    });

    expect(result.payload?.posts).toHaveLength(1);
    expect(result.payload?.posts[0].integration.id).toBe('instagram-id');
    expect(result.warnings).toContain(
      'Naver Cafe 예약에는 clubId와 menuId 설정이 필요합니다. 해당 변형은 건너뛰었습니다.'
    );

    const invalidScheduleType = buildSnapsPublishingPayload({
      variants: [
        {
          platform: 'instagram',
          label: 'Instagram',
          content: 'Instagram body',
          hashtags: [],
          settings: { __type: 'instagram', post_type: 'post' },
          publishMode: 'schedule',
        },
      ],
      integrations: [{ platform: 'instagram', integrationId: 'instagram-id' }],
      scheduleType: 'publish-now' as any,
    });

    expect(invalidScheduleType.payload?.type).toBe('draft');
  });

  it('splits long Threads variants into reply-chain draft values', () => {
    const longThreadsContent = [
      '1/3 이건 짧게 보면 돼. 첫 문장은 바로 대화가 열리게 만들고, 핵심 주장 하나만 던진다.',
      '2/3 그다음 댓글에서는 왜 그런지 설명한다. 정보는 한 번에 몰아넣기보다 댓글마다 한 포인트씩 나누는 편이 읽기 쉽다.'.repeat(12),
      '3/3 마지막 댓글은 질문으로 닫는다. 너라면 이 상황에서 어떤 기준으로 판단할 것 같아?',
    ].join('\n\n');

    const result = buildSnapsPublishingPayload({
      variants: [
        {
          platform: 'threads',
          label: 'Threads',
          content: longThreadsContent,
          hashtags: [],
          settings: { __type: 'threads' },
          publishMode: 'schedule',
        },
      ],
      integrations: [{ platform: 'threads', integrationId: 'threads-id' }],
      scheduleType: 'draft',
    });

    const values = result.payload?.posts[0].value || [];
    expect(values.length).toBeGreaterThan(1);
    expect(values.every((value) => value.content.length <= 500)).toBe(true);
    expect(values[0].delay).toBe(0);
    expect(values.slice(1).every((value) => value.delay === 1)).toBe(true);
  });

  // The publishing builder warns when it clamps a caption to the platform
  // limit, and that warning is what tells the operator why a post stops
  // mid-sentence. The transform cut the model's answer to the same limit first,
  // so the builder had nothing left to clamp and stayed quiet: the operator saw
  // a truncated post and no reason for it anywhere in the run.
  it('says so when it cuts the model answer to the platform limit', async () => {
    const limit = snapsPlatformRules.x.maxLength;
    const long = '가'.repeat(limit + 400);

    class LongAnswerOllama extends OfflineOllama {
      async chatJson<T>(): Promise<T> {
        return {
          variants: [
            { platform: 'x', title: '제목', content: long, hashtags: ['#태그'] },
          ],
        } as unknown as T;
      }
    }

    const result = await new SnapsContentTransformService(
      new LongAnswerOllama() as any,
      emptyRag as any
    ).transform('trunc-org', {
      sourceText: '원문입니다. 길이 제한을 넘는 답변을 받았을 때의 동작을 확인합니다.',
      targetPlatforms: ['x'],
    } as never);

    const variant = result.variants[0];
    // X counts units, not characters: Hangul weighs two. This used to clamp to
    // 280 characters, which X counts as 560 and refuses at publish - measured
    // at 479 units for ordinary Korean prose with its spaces and punctuation.
    // So an all-Hangul answer now stops at 140 characters, and what has to
    // hold is the weighted length, not the character count.
    expect(
      `weighted: ${snapsWeightedLength(variant.content)} <= ${
        snapsPlatformRules.x.weightedLimit
      }`
    ).toBe(
      `weighted: ${snapsPlatformRules.x.weightedLimit} <= ${
        snapsPlatformRules.x.weightedLimit
      }`
    );
    expect(`characters: ${variant.content.length}`).toBe('characters: 140');

    const joined = result.warnings.join(' | ');
    expect(`warned about the cut: ${joined.includes('잘랐습니다')}`).toBe(
      'warned about the cut: true'
    );
    // The numbers have to be the real ones, not a generic sentence.
    expect(
      `named the dropped count: ${joined.includes(
        String(long.length - variant.content.length)
      )}`
    ).toBe('named the dropped count: true');
    // and it has to say why 140, or the operator reads it as an arbitrary cut.
    expect(`explains the counting: ${joined.includes('한글은 두 자로')}`).toBe(
      'explains the counting: true'
    );
  }, 30000);

  // The nine platforms that count characters must keep counting characters:
  // giving them a weighted budget would halve every Korean post for no reason.
  it('counts units only where the platform does', () => {
    const weighted = Object.entries(snapsPlatformRules).filter(
      ([, rule]) => !!(rule as { weightedLimit?: number }).weightedLimit
    );
    expect(weighted.map(([platform]) => platform)).toEqual(['x']);

    const korean = '가'.repeat(200);
    expect(snapsWeightedLength(korean)).toBe(400);
    // ASCII weighs one.
    expect(snapsWeightedLength('a'.repeat(200))).toBe(200);
    // An emoji is one code point of weight two, not two halves.
    expect(snapsWeightedLength('🙂')).toBe(2);
    // A clamp to a weighted budget lands on a character boundary.
    const cut = snapsClampToWeight('환절기 팁 🙂 나머지', 7);
    expect(`ends on a lone surrogate: ${/[\uD800-\uDBFF]$/.test(cut)}`).toBe(
      'ends on a lone surrogate: false'
    );
    expect(snapsWeightedLength(cut) <= 7).toBe(true);
    // A family emoji is one grapheme made of several code points joined by
    // zero-width joiners. Counting code points and slicing there keeps a
    // boundary that is valid UTF-16 and still splits the cluster, so half a
    // family renders as two people and a child. The budget below lands inside
    // it, and what must come back is the text without it.
    const family = '가족 ' + [
      String.fromCodePoint(0x1f468),
      String.fromCodePoint(0x200d),
      String.fromCodePoint(0x1f469),
      String.fromCodePoint(0x200d),
      String.fromCodePoint(0x1f467),
    ].join('');
    const midCluster = snapsClampToWeight(family, 8);
    expect(`kept a half family: ${midCluster.includes(String.fromCodePoint(0x1f468))}`).toBe(
      'kept a half family: false'
    );
    expect(midCluster).toBe('가족 ');

    // Nothing to cut, nothing cut.
    expect(snapsClampToWeight('짧다', 280)).toBe('짧다');
    expect(snapsClampToWeight('무엇이든', 0)).toBe('');
  });

  // The planner turns a model-supplied local publish time into an absolute
  // instant, and the offset it uses decides which instant that is. The
  // workspace sends the operator's browser offset; the fallback for callers
  // that omit it used to be `new Date().getTimezoneOffset()`, the offset of
  // whatever host the backend runs on. Only the Pixelle service sets TZ in
  // docker-compose.yaml, so on the snaps backend that fallback was UTC and a
  // plan reading 14:00 was scheduled nine hours away from the 14:00 the
  // operator saw. Deployment location is not a scheduling decision.
  it('interprets a local publish time in KST when no offset is supplied', async () => {
    class PlanningOllama extends OfflineOllama {
      async chatJson<T>(): Promise<T> {
        return {
          command: '환절기 게시물 예약',
          intent: 'prepare-and-confirm',
          sourceText: '환절기 건강 관리 팁을 정리한 게시물입니다.',
          targetPlatforms: ['instagram'],
          scheduleType: 'schedule',
          publishDate: '2026-05-10T14:00',
        } as unknown as T;
      }
    }

    const planner = new SnapsCommandPlannerService(
      new PlanningOllama() as any,
      new SnapsContentTransformService(new OfflineOllama() as any, emptyRag as any),
      new SnapsShortVideoService(new OfflineOllama() as any),
      new SnapsCardNewsService(new OfflineOllama() as any)
    );

    // Pretend the backend is on a UTC host, which is what a normal Linux
    // container is and what docker-compose.yaml gives the snaps service. Without
    // this the test is decided by wherever it happens to run: on a KST developer
    // machine the old host-timezone fallback returned -540 too, so reverting the
    // fix changed nothing and the test passed for the wrong reason.
    const hostOffset = jest
      .spyOn(Date.prototype, 'getTimezoneOffset')
      .mockReturnValue(0);

    try {
      const prepared = await planner.prepare('tz-org', {
        command: '환절기 게시물을 예약해줘',
        sourceText: '환절기 건강 관리 팁을 정리한 게시물입니다.',
        // The clock is pinned because the subject here is the timezone,
        // not the date: a model date behind the clock is dropped now, and
        // this fixture's date has since gone by. Moving it forward would
        // put the same bomb back.
        now: '2026-05-09T00:00:00.000Z',
        // timezoneOffsetMinutes deliberately omitted.
      } as never);

      // 14:00 KST is 05:00 UTC. Reading the host offset instead returns 14:00Z,
      // nine hours after the time the operator read in the plan.
      expect(`publishDate: ${prepared.plan.publishDate}`).toBe(
        'publishDate: 2026-05-10T05:00:00.000Z'
      );

      // An explicitly supplied offset still wins over the default.
      const utcPlan = await planner.prepare('tz-org', {
        now: '2026-05-09T00:00:00.000Z',
        command: '환절기 게시물을 예약해줘',
        sourceText: '환절기 건강 관리 팁을 정리한 게시물입니다.',
        timezoneOffsetMinutes: 0,
      } as never);
      expect(`utc publishDate: ${utcPlan.plan.publishDate}`).toBe(
        'utc publishDate: 2026-05-10T14:00:00.000Z'
      );
    } finally {
      hostOffset.mockRestore();
    }
  }, 30000);

  it('prepares natural language agent orders as drafts with confirmation required', async () => {
    delete process.env.PIXELLE_VIDEO_URL;
    process.env.SNAPS_ALLOW_RULE_FALLBACK = 'true';
    const transformer = new SnapsContentTransformService(
      new OfflineOllama() as any,
      emptyRag as any
    );
    const shorts = new SnapsShortVideoService(new OfflineOllama() as any);
    const planner = new SnapsCommandPlannerService(
      new OfflineOllama() as any,
      transformer,
      shorts,
      new SnapsCardNewsService(new OfflineOllama() as any)
    );

    const prepared = await planner.prepare('jest-org', {
      command:
        '내일 10시에 인공지능 관련 게시글 작성해서 인스타, 스레드, 링크드인에 올려줘. 관련 내용으로 쇼츠도 웃기게 만들어서 알아서 올려줘.',
      useRag: false,
      now: '2026-05-12T00:00:00',
      timezoneOffsetMinutes: -540,
    });

    expect(prepared.plan.scheduleType).toBe('schedule');
    expect(prepared.plan.needsConfirmation).toBe(true);
    expect(prepared.plan.publishDateLocal).toContain('2026-05-13T10:00');
    expect(prepared.plan.targetPlatforms).toEqual(
      expect.arrayContaining(['instagram', 'threads', 'linkedin', 'youtube'])
    );
    expect(prepared.plan.shortVideoTargetPlatforms).toEqual(
      expect.arrayContaining(['instagram', 'youtube'])
    );
    expect(prepared.transform.variants.map((variant) => variant.platform)).toEqual(
      expect.arrayContaining(['instagram', 'threads', 'linkedin', 'youtube'])
    );
    expect(prepared.plan.marketingStrategy).toMatchObject({
      framework: 'Monetize-Publish-Engage-Create',
      inspiredBy: 'AiToEarn',
      revenueModels: expect.arrayContaining(['CPE', 'CPM']),
    });
    expect(prepared.plan.marketingStrategy.lanes.map((lane) => lane.lane)).toEqual([
      'monetize',
      'publish',
      'engage',
      'create',
    ]);
    expect(prepared.plan.marketingStrategy.engagementSignals).toContainEqual(
      expect.objectContaining({
        id: 'link-request',
        priority: 'high',
      })
    );
    expect(prepared.plan.operatorSummary.join(' ')).toContain('예약 실행 전 확인');
    expect(prepared.plan.missingInputs).toEqual(
      expect.arrayContaining(['연동 계정 선택', '쇼츠 영상 생성 승인 또는 영상 URL'])
    );
    expect(prepared.plan.confirmationChecklist).toContainEqual(
      expect.objectContaining({
        id: 'final-confirmation',
        status: 'attention',
      })
    );
    expect(prepared.plan.marketingStrategy.batchIdeas.join(' ')).toContain('쇼츠');
    expect(prepared.operation).toMatchObject({
      status: 'requires_confirmation',
      requiresConfirmation: true,
    });
    expect(prepared.operation.progress).toBeGreaterThanOrEqual(80);
    expect(prepared.operation.progressSteps.map((step) => step.id)).toContain(
      'confirmation'
    );
    expect(prepared.operation.platformReadiness).toContainEqual(
      expect.objectContaining({
        platform: 'instagram',
        status: 'ready',
      })
    );
    expect((prepared.video as any).status).toBe('script-ready');
    expect(prepared.warnings.join(' ')).toContain('운영자 확인');
  });

  it('stores searchable and rateable agent task history', async () => {
    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-agent-task-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    process.env.SNAPS_ALLOW_RULE_FALLBACK = 'true';
    const transformer = new SnapsContentTransformService(
      new OfflineOllama() as any,
      emptyRag as any
    );
    const shorts = new SnapsShortVideoService(new OfflineOllama() as any);
    const planner = new SnapsCommandPlannerService(
      new OfflineOllama() as any,
      transformer,
      shorts,
      new SnapsCardNewsService(new OfflineOllama() as any)
    );
    const tasks = new SnapsAgentTaskService();

    try {
      const prepared = await planner.prepare('jest-org', {
        command: '내일 10시에 AI 마케팅 게시글을 링크드인에 올려줘.',
        useRag: false,
        now: '2026-05-12T00:00:00',
        timezoneOffsetMinutes: -540,
      });
      const stored = await tasks.createFromPrepared('jest-org', prepared);
      const listed = await tasks.list('jest-org', {
        keyword: 'AI 마케팅',
        pageSize: 4,
      });
      const favorited = await tasks.setFavorite('jest-org', stored.id, true);
      const rated = await tasks.setRating('jest-org', stored.id, 5, '좋은 운영맵');
      const exported = await tasks.exportTasks('jest-org');

      expect(stored.status).toBe('requires_confirmation');
      expect(stored.messages.map((message) => message.type)).toEqual([
        'user',
        'assistant',
        'result',
      ]);
      expect(stored.messages[2].content).toContain('확인 필요');
      expect(listed.total).toBe(1);
      expect(listed.list[0]).toMatchObject({
        id: stored.id,
        progress: prepared.operation.progress,
      });
      expect(favorited?.favorite).toBe(true);
      expect(rated?.rating).toBe(5);
      expect(exported).toHaveLength(1);
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  it('ignores malformed feedback import and summary items without crashing', async () => {
    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    const inbox = new SnapsFeedbackInboxService(new OfflineOllama() as any);

    try {
      const imported = await inbox.importItems('jest-org', {
        items: [
          null,
          { platform: 'unknown-platform', content: 'ignored feedback' },
          { platform: 'threads', content: '' },
          { platform: 'threads', content: { invalid: true } },
        ] as any,
      });
      const importedStored = await inbox.importStoredItems('jest-org', [
        {
          id: { invalid: true },
          platform: 'threads',
          content: { invalid: true },
        },
        {
          id: 'clean-feedback',
          platform: 'instagram',
          content: '정상 피드백만 저장되어야 합니다.',
          author: { invalid: true },
        },
      ]);
      const summary = await inbox.summarize('jest-org', {
        items: [
          { platform: 'threads', content: '이 기능은 어떻게 쓰나요?' },
          { platform: 'bad-platform', content: 'ignored' },
          { platform: 'instagram', content: '' },
        ] as any,
      });

      expect(imported.imported).toBe(0);
      expect(imported.total).toBe(0);
      expect(importedStored.imported).toBe(1);
      await expect(inbox.listItems('jest-org')).resolves.toEqual([
        expect.objectContaining({
          id: 'clean-feedback',
          author: undefined,
        }),
      ]);
      expect(summary.total).toBe(1);
      expect(summary.bySentiment.question).toBe(1);
      expect(summary.conversionSignals).toContainEqual(
        expect.objectContaining({
          id: 'how-to-use',
          count: 1,
        })
      );

      const legacyInbox = new SnapsFeedbackInboxService(
        new LegacyFeedbackSummaryOllama() as any
      );
      await legacyInbox.importItems('jest-org', {
        items: [
          { platform: 'threads', content: '좋아요' },
          { platform: 'threads', content: '불편합니다' },
        ],
      });
      const legacySummary = await legacyInbox.summarize('jest-org');
      expect(legacySummary.bySentiment.praise).toBe(1);
      expect(legacySummary.bySentiment.complaint).toBe(1);
      expect(legacySummary.replySuggestions[0].target).toBe('complaint');

      const undercountInbox = new SnapsFeedbackInboxService(
        new UndercountingFeedbackSummaryOllama() as any
      );
      await undercountInbox.importItems('jest-org-undercount', {
        items: [
          { platform: 'threads', content: '이 기능은 어떻게 쓰나요?' },
          { platform: 'instagram', content: '협업 문의 드립니다.' },
        ],
      });
      const undercountSummary = await undercountInbox.summarize(
        'jest-org-undercount'
      );
      expect(undercountSummary.total).toBe(2);
      expect(undercountSummary.byPlatform.threads).toBe(1);
      expect(undercountSummary.byPlatform.instagram).toBe(1);
      expect(undercountSummary.bySentiment.question).toBe(1);
      expect(undercountSummary.bySentiment.collaboration).toBe(1);
      expect(undercountSummary.conversionSignals).toContainEqual(
        expect.objectContaining({
          id: 'collaboration',
          count: 1,
        })
      );
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  it('saves, searches, imports, rebuilds, and deletes RAG style examples', async () => {
    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-rag-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    const vectorStore = new SnapsVectorStoreService();
    const rag = new SnapsRagService(new EmbeddingOllama() as any, vectorStore);

    try {
      const example = await rag.addExample('jest-org', {
        platform: 'instagram',
        content: '고객 반응을 짧은 인스타그램 문장과 해시태그로 정리한 예시입니다.',
        topic: 'customer reaction',
      });
      const hits = await rag.search(
        'jest-org',
        '고객 반응 인스타그램 예시',
        'instagram',
        3
      );
      const imported = await rag.importExamples('jest-org', [
        {
          id: 'threads-imported-example',
          platform: 'threads',
          content: '짧은 대화체 스레드 스타일 예시입니다.',
        },
        {
          platform: 'unknown-platform',
          content: 'ignored',
        },
      ]);
      const rebuilt = await rag.rebuildEmbeddings('jest-org');
      const malformedEmbeddingExample = await new SnapsRagService(
        new MalformedEmbeddingOllama() as any,
        vectorStore
      ).addExample('jest-org', {
        platform: 'threads',
        content: '비정상 임베딩 값은 유한한 숫자만 남겨야 합니다.',
      });
      await expect(
        rag.addExample('jest-org', {
          platform: 'unknown-platform',
          content: '잘못된 플랫폼은 RAG 예시로 저장되면 안 됩니다.',
        } as any)
      ).rejects.toThrow('platform은 필수입니다');
      await expect(
        rag.addExample('jest-org', {
          platform: 'threads',
          content: { invalid: true },
        } as any)
      ).rejects.toThrow('content는 최소 5자 이상');
      const importedMalformed = await vectorStore.importExamples('jest-org', [
        {
          platform: 'instagram',
          content: {
            invalid: true,
          },
        },
        {
          id: 'finite-embedding-import',
          platform: 'instagram',
          content: '유한한 임베딩 값만 복구하는 예시입니다.',
          authorType: {
            invalid: true,
          },
          embedding: [1, Number.NaN, 0.25],
        },
      ]);
      const fallbackTopKHits = await vectorStore.search('jest-org', {
        query: '임베딩 예시',
        topK: Number.NaN,
      });
      const cappedImport = await vectorStore.importExamples(
        'jest-cap-org',
        Array.from({ length: 505 }, (_, index) => ({
          id: `style-cap-${index}`,
          platform: 'threads',
          content: `상한 검증용 RAG 스타일 예시 ${index} 입니다.`,
        }))
      );
      const finiteImported = (await vectorStore.listExamples('jest-org')).find(
        (item) => item.id === 'finite-embedding-import'
      );
      const cappedList = await vectorStore.listExamples('jest-cap-org');
      const deleted = await rag.deleteExample('jest-org', example.id);

      expect(hits[0].id).toBe(example.id);
      expect(imported.imported).toBe(1);
      expect(rebuilt.total).toBeGreaterThanOrEqual(2);
      expect(rebuilt.rebuilt).toBeGreaterThanOrEqual(2);
      expect(malformedEmbeddingExample.embedding).toEqual([1, 0.5]);
      expect(importedMalformed.imported).toBe(1);
      expect(finiteImported?.embedding).toEqual([1, 0.25]);
      expect(finiteImported?.authorType).toBeUndefined();
      expect(fallbackTopKHits.length).toBeGreaterThan(0);
      // 505 sent, 500 stored. `imported` used to be 500 as well, which
      // made the five the cap threw away invisible - see the import
      // accounting test below.
      expect(
        `imported ${cappedImport.imported} dropped ${cappedImport.dropped}`
      ).toBe('imported 505 dropped 5');
      expect(cappedList).toHaveLength(500);
      expect(deleted.deleted).toBe(true);
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  // /snaps/report/generate passes the request body straight to the generator,
  // and the generator keeps the platform exactly as sent - `String(metric.platform
  // || 'unknown')`, no allowlist - before using it as an object key.
  // `all['__proto__']` on a plain object literal is Object.prototype, which is
  // truthy, so the `|| {}` never fired and the next line wrote onto the
  // prototype. Measured before the fix: one request carrying platform
  // "__proto__" left every plain object in the backend process carrying the
  // metric value, for the life of the process.
  //
  // Asserted by comparing Object.prototype's own property names rather than by
  // reading one expected key. The first version of this test read the key it had
  // sent and passed even with the fix reverted, because metricKey is lowercased
  // on the way in and the property actually landed under a different name.
  it('cannot be made to write onto Object.prototype by a metric platform', async () => {
    const before = Object.getOwnPropertyNames(Object.prototype);
    let added: string[] = [];

    try {
      await new SnapsReportGeneratorService(new OfflineOllama() as any).generate({
        title: '프로토타입 오염 테스트',
        metrics: [
          {
            platform: '__proto__',
            metricKey: 'snapsPrototypeProbe',
            metricValue: 9999,
            collectedAt: '2026-01-01T00:00:00.000Z',
          },
          {
            platform: 'instagram',
            metricKey: 'impressions',
            metricValue: 100,
            collectedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      } as never);

      added = Object.getOwnPropertyNames(Object.prototype).filter(
        (name) => !before.includes(name)
      );
      expect(`added to Object.prototype: ${JSON.stringify(added)}`).toBe(
        'added to Object.prototype: []'
      );
    } finally {
      // Never leave a polluted prototype behind for the rest of the suite, even
      // if the assertion above failed.
      for (const name of added) {
        delete (Object.prototype as unknown as Record<string, unknown>)[name];
      }
    }
  }, 30000);

  // The quieter half of the same bug, in the per-platform map. `constructor`
  // survives the lowercasing that metric keys go through and is a prototype
  // member, so `(Object || 0) + value` concatenated instead of adding: measured
  // "function Object() { [native code] }23" for two metrics of 2 and 3. A metric
  // key of `__proto__` was worse - assigning a number to it is ignored, so the
  // value vanished entirely.
  it('adds metric values under keys that name prototype members', async () => {
    const report = await new SnapsReportGeneratorService(
      new OfflineOllama() as any
    ).generate({
      title: '프로토타입 키 테스트',
      metrics: [
        {
          platform: 'instagram',
          metricKey: 'constructor',
          metricValue: 2,
          collectedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          platform: 'instagram',
          metricKey: 'constructor',
          metricValue: 3,
          collectedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    } as never);

    const serialized = JSON.stringify(report);
    expect(`concatenated onto the constructor: ${serialized.includes('native code')}`).toBe(
      'concatenated onto the constructor: false'
    );
    expect(`summed to 5: ${serialized.includes('5')}`).toBe('summed to 5: true');
  }, 30000);

  // The vector store was fixed so a keyword match can never outrank a
  // comparable embedding match, and the prompt then handed the model the raw
  // score anyway - a number that is cosine for some examples and token overlap
  // for others, with token overlap reaching exactly 1.0 whenever every query
  // word appears. A model weighting by it would reproduce the inversion the
  // store now prevents.
  it('does not hand the model a score whose scale changes between examples', () => {
    const prompt = buildSnapsTransformUserPrompt({
      body: {
        sourceText: '환절기 건강 관리 팁을 정리한 원문입니다.',
        targetPlatforms: ['instagram'],
      },
      targetPlatforms: ['instagram'],
      // `matchedBy` as search() returns it - the branch the store took, not
      // whether a vector happens to be stored. The second hit carries one too
      // in the case that matters: the query failed to embed, so it was scored
      // by tokens despite having an embedding of its own.
      ragHits: [
        {
          platform: 'instagram',
          content: '환절기에는 실내 습도를 50% 이상으로 유지하세요.',
          score: 0.87,
          embedding: [0.1, 0.2, 0.3],
          matchedBy: 'embedding',
        },
        {
          platform: 'instagram',
          content: '가을 신상 후드티 할인 안내. 환절기 건강 챙기세요.',
          score: 1,
          embedding: [0.4, 0.5, 0.6],
          matchedBy: 'keyword',
        },
      ],
    } as never);

    const parsed = JSON.parse(prompt) as {
      styleExamples: Array<Record<string, unknown>>;
    };
    expect(`examples: ${parsed.styleExamples.length}`).toBe('examples: 2');
    expect(
      `score fields: ${parsed.styleExamples.filter((e) => 'score' in e).length}`
    ).toBe('score fields: 0');
    // The basis is told instead, and it distinguishes the two.
    expect(parsed.styleExamples.map((e) => e.matchedBy).join(',')).toBe(
      'embedding,keyword'
    );
    // The raw vector never travels to the model.
    expect(`embedding leaked: ${prompt.includes('0.2')}`).toBe('embedding leaked: false');

    const system = buildSnapsTransformSystemPrompt();
    expect(`system explains the basis: ${system.includes('matchedBy')}`).toBe(
      'system explains the basis: true'
    );
  });

  // Re-embedding ran one example at a time: measured over 100 examples with a
  // 20ms stub, 3,020ms. A real embed round trip is 30-150ms and the store holds
  // up to 200 examples, so the operator pressing "RAG 재임베딩" waited between six
  // and thirty seconds. Running them with bounded concurrency took the same 100
  // examples to 761ms. The risk that buys is ordering - results now arrive out
  // of order and are written by index - and a failed embed must still leave the
  // example usable through token matching.
  it('rebuilds embeddings concurrently without reordering or losing examples', async () => {
    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-rebuild-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    const store = new SnapsVectorStoreService();
    const org = 'rebuild-org';

    let inFlight = 0;
    let peakInFlight = 0;
    class CountingEmbed extends OfflineOllama {
      async embed(text: string): Promise<number[][]> {
        inFlight += 1;
        peakInFlight = Math.max(peakInFlight, inFlight);
        // Later examples answer faster, so a version that kept arrival order
        // rather than index order would visibly scramble the list.
        const index = Number(text.match(/\d+/)?.[0] ?? 0);
        await new Promise((resolve) => setTimeout(resolve, 20 - (index % 10) * 2));
        inFlight -= 1;
        if (text.includes('예시 7.')) {
          throw new Error('embed failed for this one');
        }
        return [[index / 100, 0.2, 0.3]];
      }
    }

    try {
      for (let i = 0; i < 20; i += 1) {
        await store.addExample(org, {
          platform: 'instagram',
          content: `환절기 예시 ${i}.`,
        } as never);
      }
      const before = (await store.listExamples(org)).map((example) => example.content);

      const rag = new SnapsRagService(new CountingEmbed() as any, store);
      const result = await rag.rebuildEmbeddings(org);

      expect(`total=${result.total} rebuilt=${result.rebuilt} fallback=${result.fallback}`).toBe(
        'total=20 rebuilt=19 fallback=1'
      );

      const after = await store.listExamples(org);
      // Order is the property the concurrency puts at risk.
      expect(after.map((example) => example.content).join('|')).toBe(before.join('|'));

      // The one that failed keeps its place and stays usable through tokens.
      const failed = after.find((example) => example.content.includes('예시 7.'));
      expect(`failed embedding: ${failed?.embedding === undefined}`).toBe(
        'failed embedding: true'
      );
      expect(`others embedded: ${after.filter((e) => e.embedding?.length).length}`).toBe(
        'others embedded: 19'
      );

      // Bounded, not all at once - a local Ollama is not a service that scales
      // with load.
      expect(`peak in flight <= 4: ${peakInFlight <= 4 && peakInFlight > 1}`).toBe(
        'peak in flight <= 4: true'
      );
    } finally {
      await fsp.rm(dataDir, { recursive: true, force: true });
    }
  }, 60000);

  // The style examples a search returns are handed straight to the model as the
  // tone to copy, so their order decides what the transform imitates. Two
  // different metrics used to share one ranking: cosine for examples with an
  // embedding, token overlap for the rest. Both land in 0..1, and the token
  // score hits exactly 1.0 whenever every query word appears in the text.
  // Measured before this fix: a promotional post with no embedding scored
  // 1.0000 and outranked the semantically near-identical embedded example at
  // 0.9994. A store in that mixed state is ordinary - addExample() stores no
  // embedding when the embed call fails - so one brief Ollama outage was enough.
  // `matchedBy` was derived by two consumers as `hit.embedding ? ... : ...`,
  // which is half the condition. A cosine needs the query to have embedded too,
  // and rag.service.search() sets the query embedding to undefined whenever the
  // embed call throws - the ordinary Ollama-is-down path. Every stored example
  // then came back labelled 'embedding' while its score was token overlap, and
  // the workspace printed "유사도 1.00" over a keyword match.
  it('labels a hit by the metric that produced its score, not by what is stored', async () => {
    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-rag-basis-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    const store = new SnapsVectorStoreService();
    const org = 'basis-org';

    try {
      await store.addExample(org, {
        platform: 'instagram',
        content: '환절기 면역력 관리는 실내 습도와 수면이 핵심입니다.',
        embedding: [0.88, 0.42, 0.12, 0.04],
      } as never);

      const comparable = (await store.search(org, {
        query: '환절기 관리',
        embedding: [0.9, 0.4, 0.1, 0.05],
        topK: 5,
      } as never)) as Array<{ matchedBy: string }>;
      expect(comparable[0].matchedBy).toBe('embedding');

      // The example is embedded; the query is not. Nothing was compared.
      const queryEmbedFailed = (await store.search(org, {
        query: '환절기 관리',
        topK: 5,
      } as never)) as Array<{ matchedBy: string; embedding?: number[] }>;
      expect(`stored embedding present: ${Boolean(queryEmbedFailed[0].embedding)}`).toBe(
        'stored embedding present: true'
      );
      expect(queryEmbedFailed[0].matchedBy).toBe('keyword');

      // Both sides embedded, different models: cosine refuses unequal lengths,
      // so this is token overlap too.
      const dimensionMismatch = (await store.search(org, {
        query: '환절기 관리',
        embedding: [0.9, 0.4],
        topK: 5,
      } as never)) as Array<{ matchedBy: string }>;
      expect(dimensionMismatch[0].matchedBy).toBe('keyword');
    } finally {
      delete process.env.SNAPS_DATA_DIR;
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  // The report counts the values it could not read and puts that first in the
  // action items, because every figure below it was computed without them. The
  // integration path defeated it: the mapper ran `Number(value ?? 0)` - its own
  // copy of the report's `numeric()` - before the report saw anything, so a
  // provider that formats its numbers arrived as a finite 0. The count stayed
  // at 0 and the report stated the figure as fact.
  it('hands the report the provider value it was given, not a zero', async () => {
    const mapped = snapsAnalyticsToMetricInputs('instagram-1', [
      {
        label: 'Likes',
        data: [
          // What a dashboard displays, and what several providers return.
          { total: '1,200', date: '2026-01-05T00:00:00.000Z' },
          { total: '48%', date: '2026-01-06T00:00:00.000Z' },
          { total: '73', date: '2026-01-07T00:00:00.000Z' },
        ],
      },
    ] as never);

    expect(mapped.map((metric) => metric.metricValue)).toEqual([
      '1,200',
      '48%',
      '73',
    ]);

    const offline = {
      provider: () => 'deepseek',
      model: 'metric-stub',
      embed: async () => [[0.1]],
      chatJson: async () => {
        throw new Error('the deterministic path is the point');
      },
    };
    const report = await new SnapsReportGeneratorService(
      offline as never
    ).generate({
      title: '연동 분석',
      metrics: mapped,
    } as never);

    const unreadable = report.actionItems.filter((item: string) =>
      item.includes('숫자로 읽지 못해')
    );
    expect(`unreadable action items: ${unreadable.length}`).toBe(
      'unreadable action items: 1'
    );
    expect(unreadable[0].includes('지표 값 2개')).toBe(true);
    // First, so it is read before the numbers it qualifies.
    expect(report.actionItems[0]).toBe(unreadable[0]);
    // The one value that could be read is still counted.
    expect(report.metrics['instagram-1'].likes).toBe(73);
  });

  // When JSON.parse throws here the caller reads it as "the model failed" and
  // answers from the deterministic path, so a perfectly good response becomes a
  // rule-based one silently. Measured over the shapes chat models return, the
  // previous extractor failed four: a fence followed by a closing sentence, a
  // fence tagged anything but `json`, a top-level array, and an array followed
  // by a sentence.
  it('finds the JSON inside whatever the model wrote around it', () => {
    const shapes: Array<[string, string, unknown]> = [
      ['plain object', '{"summary":"좋았습니다"}', { summary: '좋았습니다' }],
      ['fenced json', '```json\n{"summary":"좋았습니다"}\n```', { summary: '좋았습니다' }],
      ['fenced bare', '```\n{"summary":"좋았습니다"}\n```', { summary: '좋았습니다' }],
      ['fenced on one line', '```json{"summary":"좋았습니다"}```', { summary: '좋았습니다' }],
      [
        'object with prose after',
        '{"summary":"좋았습니다"}\n\n도움이 되셨길 바랍니다.',
        { summary: '좋았습니다' },
      ],
      [
        'prose before object',
        '아래가 결과입니다:\n{"summary":"좋았습니다"}',
        { summary: '좋았습니다' },
      ],
      [
        'fenced with prose after the fence',
        '```json\n{"summary":"좋았습니다"}\n```\n\n추가로 궁금한 점이 있으면 알려주세요.',
        { summary: '좋았습니다' },
      ],
      [
        'fenced with a language tag',
        '```JSON\n{"summary":"좋았습니다"}\n```',
        { summary: '좋았습니다' },
      ],
      [
        'fenced as javascript',
        '```javascript\n{"summary":"좋았습니다"}\n```',
        { summary: '좋았습니다' },
      ],
      ['unclosed fence', '```json\n{"summary":"좋았습니다"}', { summary: '좋았습니다' }],
      // The sentence after the fence carries braces of its own - an example,
      // which is exactly what a model appends. Without cutting at the closing
      // fence, the brace scan runs on to the last '}' in the prose. These two
      // are the shapes that tell the fence handling apart from the brace scan;
      // for everything else the scan rescues the result on its own.
      [
        'fenced, then prose containing braces',
        '```json\n{"summary":"좋았습니다"}\n```\n\n예시가 더 필요하면 {"b":2} 처럼 알려주세요.',
        { summary: '좋았습니다' },
      ],
      [
        'fenced array, then prose containing brackets',
        '```json\n[{"a":1}]\n```\n\n형식은 [1, 2] 처럼 쓰셔도 됩니다.',
        [{ a: 1 }],
      ],
      // The tag and the closing fence are load-bearing together: leave the tag
      // in place and the fence is never found, so the brace scan runs into the
      // example in the sentence below it. Recognising only `json` after the
      // backticks passed every other shape here, which is why this one is in
      // the list.
      [
        'fenced with an unfamiliar tag, then prose containing braces',
        '```JSON5\n{"summary":"좋았습니다"}\n```\n\n예: {"b":2} 형태도 가능합니다.',
        { summary: '좋았습니다' },
      ],
      // An array of strings has no braces, so the brace scan cannot rescue a
      // tag left behind - this is the shape that tells the tag pattern apart
      // from everything else. Measured: with only `json` optional after the
      // backticks, every other shape here still parsed.
      ['fenced array with a short tag', '```js\n["a","b"]\n```', ['a', 'b']],
      ['top-level array', '[{"a":1},{"b":2}]', [{ a: 1 }, { b: 2 }]],
      ['fenced top-level array', '```json\n[{"a":1},{"b":2}]\n```', [{ a: 1 }, { b: 2 }]],
      ['array with prose after', '[{"a":1},{"b":2}]\n\n이상입니다.', [{ a: 1 }, { b: 2 }]],
      [
        'a brace inside a string',
        '{"summary":"a } b","n":{"x":1}}',
        { summary: 'a } b', n: { x: 1 } },
      ],
    ];

    const failures: string[] = [];
    for (const [name, written, expected] of shapes) {
      try {
        expect(JSON.parse(snapsExtractJson(written))).toEqual(expected);
      } catch (error) {
        failures.push(`${name}: ${(error as Error).message.split('\n')[0]}`);
      }
    }
    expect(failures).toEqual([]);
    expect(`shapes covered: ${shapes.length}`).toBe('shapes covered: 18');
  });

  it('never ranks a keyword match above a comparable embedding match', async () => {
    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-rag-rank-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    const store = new SnapsVectorStoreService();
    const org = 'rank-org';

    try {
      await store.addExample(org, {
        platform: 'instagram',
        content: '환절기 면역력 관리는 실내 습도와 수면이 핵심입니다.',
        embedding: [0.88, 0.42, 0.12, 0.04],
      } as never);
      // Embedding failed for this one, and it happens to contain both query words.
      await store.addExample(org, {
        platform: 'instagram',
        content: '가을 신상 후드티 할인 안내. 환절기 건강 챙기세요.',
      } as never);

      const hits = (await store.search(org, {
        query: '환절기 건강',
        embedding: [0.9, 0.4, 0.1, 0.05],
        topK: 5,
      } as never)) as Array<{ content: string; embedding?: number[] }>;

      expect(hits).toHaveLength(2);
      expect(`first hit embedded: ${Boolean(hits[0].embedding)}`).toBe(
        'first hit embedded: true'
      );
      // The keyword match is still returned - it is real content - just below
      // everything the query could actually be compared against.
      expect(hits[1].content.startsWith('가을 신상')).toBe(true);

      // A vector from a different embed model is not comparable, so it must not
      // produce a score at all. Before the fix the first two components of a
      // 6-component query were scored against a 2-component stored vector and
      // came back as 0.9333.
      const otherModel = new SnapsVectorStoreService();
      const otherOrg = 'dim-org';
      await otherModel.addExample(otherOrg, {
        platform: 'instagram',
        content: '차원이 상이한 임베딩 예시입니다.',
        embedding: [0.9, 0.4],
      } as never);
      const mismatch = (await otherModel.search(otherOrg, {
        query: '완전히 무관한 주제',
        embedding: [0.1, 0.1, 0.99, 0.99, 0.99, 0.99],
        topK: 3,
      } as never)) as Array<{ score: number }>;

      // Falls back to the token score. The query deliberately shares no token
      // with the content, so the honest answer is 0 - the first draft of this
      // test used a query that shared one word and got 0.333, which proved the
      // fallback ran but not that the cosine was refused.
      expect(`mismatched dimensions score: ${mismatch[0].score}`).toBe(
        'mismatched dimensions score: 0'
      );
    } finally {
      await fsp.rm(dataDir, { recursive: true, force: true });
    }
  }, 30000);

  // The lock keyed its queue by file path and never removed a key, so a backend
  // serving many organisations grew the map for the life of the process - one
  // entry per organisation per store, forever. The cleanup has to run without
  // weakening the exclusion the lock exists for, which is what the second half
  // of this test checks.
  it('drains its queue map and still serialises concurrent writers', async () => {
    expect(snapsJsonFileLockDepth()).toBe(0);

    // Distinct paths: this is the shape that leaked.
    await Promise.all(
      Array.from({ length: 50 }, (_, index) =>
        withJsonFileLock(`/virtual/org-${index}/sources.json`, async () => index)
      )
    );
    expect(`after 50 distinct paths: ${snapsJsonFileLockDepth()}`).toBe(
      'after 50 distinct paths: 0'
    );

    // A rejected operation must not leave its key behind either - the queue
    // deliberately keeps running after a failure.
    await expect(
      withJsonFileLock('/virtual/failing/sources.json', async () => {
        throw new Error('write failed');
      })
    ).rejects.toThrow('write failed');
    expect(`after a rejection: ${snapsJsonFileLockDepth()}`).toBe('after a rejection: 0');

    // Exclusion still holds: without it both writers read the same value and
    // one increment is lost, which is the bug the lock was added for.
    let shared = 0;
    let maxConcurrent = 0;
    let active = 0;
    const write = () =>
      withJsonFileLock('/virtual/shared/sources.json', async () => {
        active += 1;
        maxConcurrent = Math.max(maxConcurrent, active);
        const read = shared;
        await new Promise((resolve) => setTimeout(resolve, 5));
        shared = read + 1;
        active -= 1;
      });
    await Promise.all(Array.from({ length: 20 }, write));
    expect(`shared=${shared} maxConcurrent=${maxConcurrent}`).toBe(
      'shared=20 maxConcurrent=1'
    );
    expect(`after the contended run: ${snapsJsonFileLockDepth()}`).toBe(
      'after the contended run: 0'
    );

    // The case that separates a guarded delete from an unguarded one. Queueing
    // everything in the same tick does not: the chain is already built, so
    // deleting the key changes nothing. This writer arrives after the first
    // operation settled while a later one is still running, so an unguarded
    // delete has already dropped the key and lets it run alongside.
    let late = 0;
    let lateMax = 0;
    const slow = (ms: number) =>
      withJsonFileLock('/virtual/late/sources.json', async () => {
        late += 1;
        lateMax = Math.max(lateMax, late);
        await new Promise((resolve) => setTimeout(resolve, ms));
        late -= 1;
      });
    const first = slow(10);
    const second = slow(80);
    await first;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const third = slow(10);
    await Promise.all([second, third]);
    expect(`late writers max concurrent: ${lateMax}`).toBe('late writers max concurrent: 1');
    expect(`after the late writer: ${snapsJsonFileLockDepth()}`).toBe(
      'after the late writer: 0'
    );
  }, 30000);

  // Found by looking at a rendered deck rather than at the code: a slide showed
  // "02" at the top and "3 / 6" at the bottom. The footer prints the slide's
  // position and the eyebrow falls back to that same position, so the two are
  // meant to agree - but the model numbers slides by its own scheme, and its
  // number was rendered as written.
  it('keeps a numeric slide label in step with the footer position', async () => {
    class NumberingOllama extends OfflineOllama {
      async chatJson<T>(): Promise<T> {
        return {
          title: '환절기 감기 예방',
          caption: '환절기 건강 관리 카드뉴스입니다.',
          hashtags: ['#환절기'],
          slides: [
            // The model treats the cover as unnumbered and starts counting on
            // the next slide, which is where the two systems diverge.
            { eyebrow: '환절기 건강', heading: '표지', body: '일교차가 커집니다.' },
            { eyebrow: '01', heading: '습도', body: '실내 습도를 50% 이상 유지하세요.' },
            { eyebrow: '02', heading: '손 씻기', body: '외출 후 손을 씻으세요.' },
            { eyebrow: '마무리', heading: '정리', body: '오늘부터 실천해 보세요.' },
          ],
        } as unknown as T;
      }
    }

    const deck = await new SnapsCardNewsService(new NumberingOllama() as any).script({
      sourceText: '환절기에는 실내 습도를 50% 이상 유지하고 손을 자주 씻는 것이 좋습니다.',
      slideCount: 4,
    } as never);

    const labels = deck.slides.map((slide) => `${slide.order}:${slide.eyebrow}`);
    // Numeric labels follow the position; the model's text labels are kept.
    expect(labels.join(' | ')).toBe('1:환절기 건강 | 2:02 | 3:03 | 4:마무리');
  }, 30000);

  // Found by running the live DeepSeek smoke and reading the deck it produced:
  // two of six body slides ended with the identical sentence
  // "감기 예방에 가장 효과적인 방법 중 하나입니다." and a third with a one-word
  // variant. The prompt now forbids it, but a prompt rule is a request, so the
  // repeat is also removed deterministically.
  it('removes a sentence a later card news slide repeats verbatim', async () => {
    const repeated = '감기 예방에 가장 효과적인 방법 중 하나입니다.';
    class RepeatingOllama extends OfflineOllama {
      async chatJson<T>(): Promise<T> {
        return {
          title: '환절기 감기 예방',
          caption: '환절기 건강 관리 카드뉴스입니다.',
          hashtags: ['#환절기', '#감기예방'],
          slides: [
            { eyebrow: '01', heading: '표지', body: '일교차가 커지는 환절기입니다.' },
            { eyebrow: '02', heading: '습도', body: `실내 습도를 50% 이상 유지하세요. ${repeated}` },
            { eyebrow: '03', heading: '수면', body: `하루 7시간 이상 자세요. ${repeated}` },
            // The whole body is the repeat: blanking this slide would be worse
            // than leaving it, so it stays as it is.
            { eyebrow: '04', heading: '마무리', body: repeated },
          ],
        } as unknown as T;
      }
    }

    const deck = await new SnapsCardNewsService(new RepeatingOllama() as any).script({
      sourceText: '환절기에는 실내 습도를 50% 이상 유지하고 하루 7시간 이상 자는 것이 좋습니다.',
      slideCount: 4,
    } as never);

    const bodies = deck.slides.map((slide) => slide.body);
    expect(bodies[1]).toBe(`실내 습도를 50% 이상 유지하세요. ${repeated}`);
    expect(bodies[2]).toBe('하루 7시간 이상 자세요.');
    expect(bodies[3]).toBe(repeated);
    // Nothing was blanked, and the sentence now appears on two slides rather
    // than three - the one that owns it and the one that has nothing else.
    expect(`blank slides: ${bodies.filter((body) => !body.trim()).length}`).toBe('blank slides: 0');
    expect(`repeats: ${bodies.filter((body) => body.includes(repeated)).length}`).toBe('repeats: 2');
  });

  // periodStart and periodEnd were accepted from the request and echoed back,
  // and nothing ever filled them: /report/from-platform-analytics does not pass
  // a period and the workspace does not send one, so every report presented its
  // numbers with no window attached. The metrics carry collectedAt, which the
  // trend chart already uses for its x-axis, so the period is derivable.
  it('states the period a report covers, derived from the metrics', async () => {
    const reports = new SnapsReportGeneratorService(new OfflineOllama() as any);
    const metric = (day: string, value: number) => ({
      platform: 'instagram',
      metricKey: 'impressions',
      metricValue: value,
      collectedAt: `2026-03-${day}T00:00:00.000Z`,
    });

    // Deliberately out of order: the period is the range, not the first and last
    // entries as written.
    const derived = await reports.generate({
      title: '기간 도출 보고서',
      metrics: [metric('11', 1500), metric('03', 1200), metric('27', 1800)],
    } as never);
    expect(`${derived.periodStart} ~ ${derived.periodEnd}`).toBe(
      '2026-03-03T00:00:00.000Z ~ 2026-03-27T00:00:00.000Z'
    );

    // An explicitly supplied period still wins over the derived one.
    const explicit = await reports.generate({
      title: '기간 지정 보고서',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      metrics: [metric('03', 1200), metric('27', 1800)],
    } as never);
    expect(`${explicit.periodStart} ~ ${explicit.periodEnd}`).toBe(
      '2026-01-01 ~ 2026-01-31'
    );

    // No metrics, no honest period to claim.
    const empty = await reports.generate({ title: '빈 보고서', metrics: [] } as never);
    expect(`${empty.periodStart} ~ ${empty.periodEnd}`).toBe('undefined ~ undefined');
  }, 30000);

  // The exported report is the artefact an operator forwards to someone else,
  // and it lagged both the workspace and the insights: English section headings
  // in a document whose content is Korean, a raw UTC timestamp, no mention of
  // the period the numbers cover, and trend lines carrying the absolute change
  // without the rate computed alongside it. Found by generating the export and
  // reading it rather than by reading the code.
  it('exports a report an operator can read', async () => {
    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-export-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    const library = new SnapsSourceLibraryService();
    const org = 'export-org';

    try {
      const report = await new SnapsReportGeneratorService(
        new OfflineOllama() as any
      ).generate({
        title: '환절기 캠페인 성과 보고서',
        metrics: [
          { platform: 'instagram', metricKey: 'impressions', metricValue: 1200, collectedAt: '2026-03-01T00:00:00.000Z' },
          { platform: 'instagram', metricKey: 'impressions', metricValue: 1800, collectedAt: '2026-03-08T00:00:00.000Z' },
        ],
      } as never);
      const stored = await library.saveReport(org, report.title, report as never);
      const exported = await library.exportReport(org, stored.id, 'markdown');
      const content = String(exported?.content || '');

      // Headings follow the language of the content.
      for (const heading of ['## 요약', '## 인사이트', '## 실행 항목', '## 추세', '## 지표']) {
        expect(`${heading}: ${content.includes(heading)}`).toBe(`${heading}: true`);
      }
      expect(`english headings left: ${/## (Summary|Insights|Action Items|Trends|Metrics)/.test(content)}`).toBe(
        'english headings left: false'
      );

      // The window the numbers cover, and the rate beside the absolute change.
      expect(`period: ${content.includes('대상 기간: 2026-03-01 ~ 2026-03-08')}`).toBe(
        'period: true'
      );
      expect(`trend rate: ${content.includes('1200 -> 1800 (600, +50%)')}`).toBe(
        'trend rate: true'
      );

      // A readable, offset-corrected timestamp rather than the stored ISO text.
      const stamp = content.match(/생성 시각: ([^\n]+)/)?.[1] || '';
      expect(`timestamp shape: ${/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} \(KST\)$/.test(stamp)}`).toBe(
        'timestamp shape: true'
      );
      const generatedAt = new Date(String(report.generatedAt));
      const expected = new Date(generatedAt.getTime() + 9 * 3600_000);
      expect(`hour: ${stamp.slice(11, 13)}`).toBe(
        `hour: ${String(expected.getUTCHours()).padStart(2, '0')}`
      );
    } finally {
      await fsp.rm(dataDir, { recursive: true, force: true });
    }
  }, 30000);

  // trendSummary computed deltaRate and nothing read it - not the insights, not
  // the workspace, not the export - so every insight reported an absolute change
  // with no sense of scale: "+600 증가" without the 1,200 it started from. The
  // zero-baseline case is the one to get right: deltaRate is defined as 0 there,
  // so reporting it would say a metric that grew from nothing grew 0%.
  it('reports a growth rate only when there is a baseline to measure against', async () => {
    const reports = new SnapsReportGeneratorService(new OfflineOllama() as any);
    const at = (day: number) => `2026-01-0${day}T00:00:00.000Z`;

    const withBaseline = await reports.generate({
      title: '기준값이 있는 보고서',
      metrics: [
        { platform: 'instagram', metricKey: 'impressions', metricValue: 1200, collectedAt: at(1) },
        { platform: 'instagram', metricKey: 'impressions', metricValue: 1800, collectedAt: at(2) },
      ],
    } as never);

    const grown = withBaseline.insights.find((line: string) => line.includes('증가'));
    expect(`insight: ${grown}`).toBe(
      'insight: instagram의 impressions 지표가 기간 내 +600(+50%) 증가했습니다.'
    );
    const trend = withBaseline.trends.find(
      (item: { metricKey: string }) => item.metricKey === 'impressions'
    );
    expect(`rate on the trend: ${trend?.deltaRate}`).toBe('rate on the trend: 0.5');

    // Grew from nothing: an absolute change is all that can honestly be said.
    const fromZero = await reports.generate({
      title: '기준값이 없는 보고서',
      metrics: [
        { platform: 'instagram', metricKey: 'impressions', metricValue: 0, collectedAt: at(1) },
        { platform: 'instagram', metricKey: 'impressions', metricValue: 1800, collectedAt: at(2) },
      ],
    } as never);

    const fromZeroInsight = fromZero.insights.find((line: string) => line.includes('증가'));
    expect(`zero-baseline insight: ${fromZeroInsight}`).toBe(
      'zero-baseline insight: instagram의 impressions 지표가 기간 내 +1800 증가했습니다.'
    );
    expect(`no percentage claimed: ${!fromZeroInsight?.includes('%')}`).toBe(
      'no percentage claimed: true'
    );
  }, 30000);

  // TypeScript guarantees every rule has the required fields; it says nothing
  // about the values agreeing with each other. These are the ways a rule can be
  // self-contradictory, and adding a channel is when that happens - the numbers
  // are copied from a neighbour and one of them is not adjusted.
  it('keeps every platform rule internally consistent', () => {
    const problems: string[] = [];
    for (const platform of snapsTargetPlatforms) {
      const rule = snapsPlatformRules[platform];
      const note = (message: string) => problems.push(`${platform}: ${message}`);

      if (!(rule.maxLength > 0)) {
        note(`maxLength is ${rule.maxLength}, so every caption clamps to nothing`);
      }
      // The segmenter splits at postMaxLength; above maxLength it could never
      // fire, because the caption is already clamped to the smaller number.
      if (rule.postMaxLength !== undefined && rule.postMaxLength > rule.maxLength) {
        note(`postMaxLength ${rule.postMaxLength} exceeds maxLength ${rule.maxLength}`);
      }
      // Defaults that cannot all be used are defaults that are partly fiction.
      if (
        rule.hashtagLimit !== undefined &&
        rule.defaultHashtags.length > rule.hashtagLimit
      ) {
        note(
          `${rule.defaultHashtags.length} default hashtags against a limit of ${rule.hashtagLimit}`
        );
      }
      if (rule.mediaLimit !== undefined && !(rule.mediaLimit > 0)) {
        note(`mediaLimit is ${rule.mediaLimit}, which would drop every attachment`);
      }
      const duplicates = rule.defaultHashtags.filter(
        (tag, index) => rule.defaultHashtags.indexOf(tag) !== index
      );
      if (duplicates.length) {
        note(`duplicate default hashtags ${JSON.stringify(duplicates)}`);
      }
      if (!rule.label.trim()) {
        note('no label, so every warning about this channel names it by its id');
      }
    }

    expect(`rule problems: ${JSON.stringify(problems)}`).toBe('rule problems: []');
  });

  // /snaps/export and /snaps/import are the backup and restore path, and every
  // store on it normalises entries on the way back in. The render job ownership
  // store is not on it on purpose - see render-job-ownership.service.ts - so
  // "every store" here means every store the backup carries. A field added to a store
  // but not taught to its import normaliser is dropped silently: the restore
  // reports the same counts and the data is gone. This asserts the property
  // rather than a field list, so a new field is covered the day it is added.
  it('loses no field when a workspace is exported and imported', async () => {
    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-roundtrip-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    const library = new SnapsSourceLibraryService();
    const vectors = new SnapsVectorStoreService();
    const activity = new SnapsActivityLogService();
    const tasks = new SnapsAgentTaskService();
    const inbox = new SnapsFeedbackInboxService(new OfflineOllama() as any);
    const src = 'roundtrip-src';
    const dst = 'roundtrip-dst';

    try {
      await library.saveSource(src, {
        sourceText: '환절기 건강 관리 팁을 정리한 원문입니다.',
        title: '환절기 원문',
      } as never);
      await library.saveReport(src, '환절기 성과 보고서', {
        summary: '요약',
        insights: ['인사이트'],
      } as never);
      await vectors.addExample(src, {
        platform: 'instagram',
        content: '환절기에는 실내 습도를 50% 이상으로 유지하세요.',
        embedding: [0.1, 0.2, 0.3],
      } as never);
      await activity.record(src, {
        type: 'source',
        title: '원문 저장',
        detail: { note: '상세 정보' },
      } as never);
      const task = await tasks.createFromPrepared(src, {
        plan: {
          provider: 'ollama',
          command: '환절기 게시물 예약',
          intent: 'prepare-and-confirm',
          sourceText: '환절기 건강 관리 팁입니다.',
          tone: '친근하게',
          targetPlatforms: ['instagram'],
          scheduleType: 'draft',
          includeShortVideo: false,
          shortVideoPlatform: 'youtube',
          shortVideoTargetPlatforms: [],
          includeCardNews: false,
          needsConfirmation: true,
          confirmationPolicy: '운영자 확인 필요',
          assumptions: ['가정 1'],
          operatorSummary: ['요약 1'],
          missingInputs: [],
          confirmationChecklist: ['점검 1'],
          marketingStrategy: { framework: 'AIDA', revenueModels: ['광고'] },
          executionPlan: [{ step: 1, title: '준비' }],
        },
        transform: {
          provider: 'ollama',
          model: 'jest',
          variants: [],
          warnings: [],
          ragExamplesUsed: [],
        },
        operation: { note: '운영 메모' },
        warnings: ['경고 1'],
      } as never);
      // Flags that live outside the plan, and the most likely to be forgotten.
      await tasks.setFavorite(src, task.id, true);
      await tasks.setRating(src, task.id, 4, '평점 메모');
      await inbox.importItems(src, {
        items: [
          {
            platform: 'instagram',
            content: '가격이 궁금합니다.',
            author: '고객A',
            postId: 'post-1',
            sourceUrl: 'https://example.test/p/1',
          },
        ],
      } as never);

      const exported = {
        sources: await library.listSources(src),
        reports: await library.listReports(src),
        styleExamples: await vectors.listExamples(src),
        activity: await activity.list(src),
        agentTasks: await tasks.exportTasks(src),
        inboxItems: await inbox.listItems(src),
      };

      await library.importSources(dst, exported.sources as never);
      await library.importReports(dst, exported.reports as never);
      await vectors.importExamples(dst, exported.styleExamples as never);
      await activity.importEntries(dst, exported.activity as never);
      await tasks.importTasks(dst, exported.agentTasks as never);
      await inbox.importStoredItems(dst, exported.inboxItems as never);

      const restored = {
        sources: await library.listSources(dst),
        reports: await library.listReports(dst),
        styleExamples: await vectors.listExamples(dst),
        activity: await activity.list(dst),
        agentTasks: await tasks.exportTasks(dst),
        inboxItems: await inbox.listItems(dst),
      };

      const report: string[] = [];
      for (const key of Object.keys(exported) as Array<keyof typeof exported>) {
        const before = (exported[key] as Array<Record<string, unknown>>)[0] || {};
        const after = (restored[key] as Array<Record<string, unknown>>)[0] || {};
        const lost = Object.keys(before).filter(
          (field) => before[field] !== undefined && after[field] === undefined
        );
        // organizationId is re-scoped to the destination on purpose; ids and
        // timestamps are regenerated by design.
        const rewritten = ['organizationId', 'id', 'createdAt', 'updatedAt'];
        const changed = Object.keys(before).filter(
          (field) =>
            !rewritten.includes(field) &&
            after[field] !== undefined &&
            JSON.stringify(before[field]) !== JSON.stringify(after[field])
        );
        report.push(
          `${String(key)}: ${(exported[key] as unknown[]).length}->${
            (restored[key] as unknown[]).length
          } lost=${JSON.stringify(lost)} changed=${JSON.stringify(changed)}`
        );
      }

      expect(report.join(' | ')).toBe(
        [
          'sources: 1->1 lost=[] changed=[]',
          'reports: 1->1 lost=[] changed=[]',
          'styleExamples: 1->1 lost=[] changed=[]',
          'activity: 1->1 lost=[] changed=[]',
          'agentTasks: 1->1 lost=[] changed=[]',
          'inboxItems: 1->1 lost=[] changed=[]',
        ].join(' | ')
      );

      // The two flags that are not part of the plan object, checked by value
      // rather than only by presence.
      const restoredTask = restored.agentTasks[0] as {
        favorite?: boolean;
        rating?: number;
        ratingComment?: string;
      };
      expect(
        `favorite=${restoredTask.favorite} rating=${restoredTask.rating} comment=${restoredTask.ratingComment}`
      ).toBe('favorite=true rating=4 comment=평점 메모');
    } finally {
      await fsp.rm(dataDir, { recursive: true, force: true });
    }
  }, 60000);

  // Render job ownership used to be inferred from the activity log, which keeps
  // 500 entries newest-first. A job still rendering could have its record pushed
  // out, and /snaps/import evicts the whole log in one call because it merges up
  // to 500 imported entries in front of the existing ones. The operator then
  // polled their own job and was told it did not exist.
  it('still knows a render job is ours after the activity log has rolled over', async () => {
    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-job-owner-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    const owners = new SnapsRenderJobOwnershipService();
    const activity = new SnapsActivityLogService();
    const org = 'owner-org';

    try {
      await owners.remember(org, 'render-job-1');
      await activity.record(org, {
        type: 'video',
        title: 'Queued Shorts-Maker render job',
        detail: { jobId: 'render-job-1' },
      } as never);

      expect(`owned before: ${await owners.owns(org, 'render-job-1')}`).toBe(
        'owned before: true'
      );

      // One import is enough to push the entry out: importEntries merges the
      // incoming entries in front and the merged list is cut to 500.
      const flood = Array.from({ length: 500 }, (_, index) => ({
        type: 'source',
        title: `가져온 활동 ${index}`,
        createdAt: new Date(Date.now() + index * 1000).toISOString(),
      }));
      await activity.importEntries(org, flood as never);

      const entries = await activity.list(org);
      const jobStillInLog = entries.some(
        (entry: { detail?: { jobId?: unknown } }) => entry.detail?.jobId === 'render-job-1'
      );
      expect(`job id still in the activity log: ${jobStillInLog}`).toBe(
        'job id still in the activity log: false'
      );

      // The store is what keeps the answer correct.
      expect(`owned after: ${await owners.owns(org, 'render-job-1')}`).toBe(
        'owned after: true'
      );
      // And it still says no to a job that was never ours.
      expect(`owns a stranger job: ${await owners.owns(org, 'someone-elses')}`).toBe(
        'owns a stranger job: false'
      );
      expect(`another org owns it: ${await owners.owns('other-org', 'render-job-1')}`).toBe(
        'another org owns it: false'
      );
    } finally {
      await fsp.rm(dataDir, { recursive: true, force: true });
    }
  }, 30000);

  // The same cap-deletes-what-was-already-there shape as the workspace import
  // paths, on the route feedback normally arrives through. It was the one
  // import method left reporting only what it added: /snaps/inbox/import and
  // /snaps/inbox/import-post-comments both go through here.
  it('reports the inbox items an import cap deleted', async () => {
    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-inbox-cap-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    const inbox = new SnapsFeedbackInboxService(new OfflineOllama() as any);
    const org = 'inbox-cap-org';
    // `content` is the field the normaliser requires, and it regenerates `id`,
    // so survivors are counted by their text rather than by an id we chose.
    const make = (tag: string, count: number) =>
      Array.from({ length: count }, (_, index) => ({
        platform: 'instagram',
        author: `${tag}-author-${index}`,
        content: `${tag} 문의 ${index}`,
      }));

    try {
      const seeded = await inbox.importItems(org, { items: make('existing', 300) } as never);
      expect(`seeded ${seeded.total}, dropped ${seeded.dropped}`).toBe(
        'seeded 300, dropped 0'
      );

      // 300 existing + 900 incoming is 1200 against a cap of 1000, so 200 of the
      // stored items have to go.
      const restored = await inbox.importItems(org, { items: make('incoming', 900) } as never);
      const stored = await inbox.listItems(org);
      const survivingExisting = stored.filter((item: { content: string }) =>
        String(item.content).startsWith('existing ')
      ).length;

      expect(
        `dropped ${restored.dropped}, existing left ${survivingExisting}, total ${stored.length}`
      ).toBe('dropped 200, existing left 100, total 1000');

      // An import that fits deletes nothing and must say so.
      const fits = await inbox.importItems('inbox-cap-small', {
        items: make('few', 5),
      } as never);
      expect(`fits dropped ${fits.dropped}`).toBe('fits dropped 0');
    } finally {
      await fsp.rm(dataDir, { recursive: true, force: true });
    }
  }, 30000);

  // Restoring a backup into a workspace that already holds entries is the
  // ordinary case, and the store cap deletes to make room. Measured before the
  // dropped count existed: 300 existing sources plus a 400-entry backup left
  // 400 backup and 100 existing on disk - 200 gone - and the response was
  // { imported: 400, total: 500 }, which reads as a clean restore. Every import
  // path has the same cap, so the count has to be on every one of them.
  it('reports the entries an import cap deleted', async () => {
    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-import-cap-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    const library = new SnapsSourceLibraryService();
    const org = 'cap-org';
    const make = (tag: string, count: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: `${tag}-${index}`,
        sourceText: `${tag} 원문 ${index}`,
        title: `${tag} ${index}`,
      }));

    try {
      const seeded = await library.importSources(org, make('existing', 300));
      expect(`seed dropped ${seeded.dropped}`).toBe('seed dropped 0');

      const restored = await library.importSources(org, make('backup', 400));
      const stored = await library.listSources(org);
      const survivingExisting = stored.filter((source) =>
        String(source.id).startsWith('existing-')
      ).length;

      // The count has to equal what actually left the store, not a guess.
      expect(
        `dropped ${restored.dropped}, existing left ${survivingExisting}, total ${restored.total}`
      ).toBe('dropped 200, existing left 100, total 500');

      // An import that fits deletes nothing and must say so.
      const small = new SnapsSourceLibraryService();
      const smallOrg = 'cap-org-small';
      const fits = await small.importSources(smallOrg, make('few', 5));
      expect(`fits dropped ${fits.dropped}`).toBe('fits dropped 0');
    } finally {
      await fsp.rm(dataDir, { recursive: true, force: true });
    }
  });

  it('normalizes source library imports and report exports without object strings', async () => {
    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-source-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    const library = new SnapsSourceLibraryService();

    try {
      const invalidSaved = library.saveSource('jest-org', {
        sourceText: { invalid: true },
      } as any);
      await expect(invalidSaved).rejects.toThrow('sourceText는 최소 5자 이상의 문자열');

      const importedSources = await library.importSources('jest-org', [
        {
          id: { invalid: true },
          sourceText: { invalid: true },
        },
        {
          id: 'clean-source',
          title: { invalid: true },
          sourceText: '정상 원문만 source library에 남아야 합니다.',
          tags: ['tag', { invalid: true }, 'tag', 7],
        },
      ]);
      const sources = await library.listSources('jest-org');
      const source = sources.find((item) => item.id === 'clean-source');

      const importedReports = await library.importReports('jest-org', [
        {
          title: { invalid: true },
          report: {
            title: { invalid: true },
          },
        },
        {
          id: 'clean-report',
          title: 'Clean report',
          report: {
            title: 'Clean report',
            summary: { invalid: true },
            warnings: ['수집 실패 경고', { invalid: true }],
            insights: ['정상 인사이트', { invalid: true }],
            actionItems: [{ invalid: true }, '정상 액션'],
            trends: [
              {
                platform: { invalid: true },
                metricKey: 'likes',
                firstValue: 1,
                lastValue: 3,
                delta: { invalid: true },
              },
            ],
            metrics: {
              instagram: {
                likes: 3,
                broken: { invalid: true },
              },
            },
          },
        },
      ]);
      const exportedMarkdown = await library.exportReport(
        'jest-org',
        'clean-report',
        'markdown'
      );
      const exportedHtml = await library.exportReport(
        'jest-org',
        'clean-report',
        'html'
      );

      expect(importedSources.imported).toBe(1);
      expect(source?.title).toContain('정상 원문만');
      expect(source?.tags).toEqual(['tag', '7']);
      expect(importedReports.imported).toBe(1);
      expect(exportedMarkdown?.content).toContain('## 수집 경고');
      expect(exportedMarkdown?.content).toContain('수집 실패 경고');
      expect(exportedMarkdown?.content).toContain('정상 인사이트');
      expect(exportedMarkdown?.content).toContain('정상 액션');
      expect(exportedMarkdown?.content).toContain('- likes: 3');
      expect(exportedMarkdown?.content).not.toContain('[object Object]');
      expect(exportedHtml?.content).not.toContain('<script>');
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  it('normalizes imported activity entries without object-string titles', async () => {
    const dataDir = path.join(
      process.cwd(),
      'tmp',
      `snaps-activity-jest-${process.pid}-${Date.now()}`
    );
    process.env.SNAPS_DATA_DIR = dataDir;
    const activity = new SnapsActivityLogService();

    try {
      await expect(
        activity.record('jest-org', {
          type: 'source',
          title: { invalid: true },
        } as any)
      ).rejects.toThrow('type과 title이 필요합니다');

      const imported = await activity.importEntries('jest-org', [
        {
          type: 'bad',
          title: 'ignored bad type',
        },
        {
          id: { invalid: true },
          type: 'source',
          title: { invalid: true },
        },
        {
          id: 'activity-clean',
          type: 'source',
          title: ['정상', '활동'],
          detail: [{ invalid: true }],
        },
      ]);
      const entries = await activity.list('jest-org');

      expect(imported.imported).toBe(1);
      expect(entries[0]).toMatchObject({
        id: 'activity-clean',
        title: '정상 활동',
      });
      expect(entries[0].detail).toBeUndefined();
      expect(JSON.stringify(entries)).not.toContain('[object Object]');
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  it('generates deterministic analytics report insights and action items', async () => {
    const reports = new SnapsReportGeneratorService(new OfflineOllama() as any);

    const report = await reports.generate({
      title: 'Jest analytics report',
      metrics: [
        {
          platform: 'instagram',
          metricKey: 'impressions',
          metricValue: 1000,
          collectedAt: '2026-05-01T00:00:00.000Z',
        },
        {
          platform: 'instagram',
          metricKey: 'likes',
          metricValue: 50,
          collectedAt: '2026-05-02T00:00:00.000Z',
        },
        {
          platform: 'instagram',
          metricKey: 'comments',
          metricValue: 1,
          collectedAt: '2026-05-02T00:00:00.000Z',
        },
      ],
    });

    expect(report.title).toBe('Jest analytics report');
    expect(report.metrics.instagram.impressions).toBe(1000);
    expect(report.insights.join(' ')).toContain('추정 참여율');
    expect(report.actionItems).toContainEqual(
      expect.stringContaining('질문형 CTA')
    );
    expect(report.charts.length).toBeGreaterThan(0);

    const malformedAiReport = await new SnapsReportGeneratorService(
      new MalformedReportOllama() as any
    ).generate({
      title: 'Malformed AI report',
      metrics: [
        {
          platform: 'threads',
          metricKey: 'likes',
          metricValue: 5,
          collectedAt: '2026-05-05T00:00:00.000Z',
        },
      ],
    });
    expect(typeof malformedAiReport.summary).toBe('string');
    expect(malformedAiReport.summary).toContain('threads');
  });

  // Pixelle deployments answer in whatever shape they like, so the service
  // hunts the payload for the asset and the job id. Measured on four plausible
  // shapes, three resolved wrongly: the search ran level by level, so a generic
  // `url` at depth 1 beat an exact `download_url` at depth 2, the video and the
  // thumbnail both answered to `url` and whichever the payload listed first
  // won, and a bare `id` anywhere - `user.id` - became the job to poll.
  it('picks the video, the thumbnail and the job out of any Pixelle shape', async () => {
    const shapes = [
      {
        name: 'flat and explicit',
        payload: {
          job_id: 'j-1',
          video_url: 'https://pixelle.test/out.mp4',
          thumbnail: 'https://pixelle.test/t.png',
        },
        videoUrl: 'https://pixelle.test/out.mp4',
        thumbnail: 'https://pixelle.test/t.png',
        jobId: 'j-1',
      },
      {
        name: 'nested assets with the thumbnail listed first',
        payload: {
          task_id: 'j-2',
          assets: {
            thumbnail: { url: 'https://pixelle.test/t.png' },
            video: { url: 'https://pixelle.test/out.mp4' },
          },
        },
        videoUrl: 'https://pixelle.test/out.mp4',
        thumbnail: 'https://pixelle.test/t.png',
        jobId: 'j-2',
      },
      {
        name: 'a user object listed before the task',
        payload: {
          user: { id: 'u-99' },
          task: { id: 'j-3' },
          output: 'https://pixelle.test/out.mp4',
        },
        videoUrl: 'https://pixelle.test/out.mp4',
        thumbnail: undefined,
        jobId: 'j-3',
      },
      {
        name: 'a preview frame above the download url',
        payload: {
          id: 'j-4',
          preview: { url: 'https://pixelle.test/frame.jpg' },
          result: { download_url: 'https://pixelle.test/out.mp4' },
        },
        videoUrl: 'https://pixelle.test/out.mp4',
        thumbnail: 'https://pixelle.test/frame.jpg',
        jobId: 'j-4',
      },
      {
        // A signed url carries no extension, so rejecting image types cannot
        // help here - only searching `download_url` everywhere before `url`
        // anywhere gets this right. This is the shape that makes the key order
        // load-bearing rather than a tidier way to write the same thing.
        name: 'a generic url with no extension above the download url',
        payload: {
          job_id: 'j-5',
          preview: { url: 'https://pixelle.test/preview?token=abc' },
          result: { download_url: 'https://pixelle.test/out.mp4' },
        },
        videoUrl: 'https://pixelle.test/out.mp4',
        thumbnail: undefined,
        jobId: 'j-5',
      },
      {
        // An animated preview: some pipelines render the poster as a short mp4.
        // An <img> cannot show it, so no thumbnail is the honest answer.
        name: 'a poster that is itself a video',
        payload: {
          job_id: 'j-6',
          video_url: 'https://pixelle.test/out.mp4',
          outputs: { poster: 'https://pixelle.test/preview.mp4' },
        },
        videoUrl: 'https://pixelle.test/out.mp4',
        thumbnail: undefined,
        jobId: 'j-6',
      },
    ];

    const originalFetch = globalThis.fetch;
    process.env.PIXELLE_VIDEO_URL = 'https://pixelle.example.test';
    const shorts = new SnapsShortVideoService(new OfflineOllama() as any);

    try {
      const resolved: Array<Record<string, unknown>> = [];
      for (const shape of shapes) {
        globalThis.fetch = (async () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => JSON.stringify(shape.payload),
          json: async () => shape.payload,
        })) as never;
        const answered = (await shorts.status('poll-me')) as Record<string, unknown>;
        resolved.push({
          name: shape.name,
          videoUrl: answered.videoUrl,
          thumbnail: answered.thumbnail,
          jobId: answered.jobId,
        });
      }

      expect(resolved).toEqual(
        shapes.map((shape) => ({
          name: shape.name,
          videoUrl: shape.videoUrl,
          thumbnail: shape.thumbnail,
          jobId: shape.jobId,
        }))
      );
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.PIXELLE_VIDEO_URL;
    }
  });

  // normalizeSummary() already refuses a hallucinated `total` - its own comment
  // records a model answering 99 over four items - and constrains byPlatform
  // and bySentiment to that total. The conversion signals were left out of
  // both rules: the count took Math.max(model, real) with no ceiling, and the
  // examples are quotes, which the deterministic side takes verbatim from the
  // stored items while the model could put anything there.
  it('keeps conversion signals inside the facts the inbox already has', async () => {
    const inflating = {
      provider: () => 'deepseek',
      model: 'inflating-stub',
      embed: async () => [[0.1]],
      chatJson: async () => ({
        total: 99,
        conversionSignals: [
          {
            id: 'purchase-intent',
            count: 40,
            examples: [
              // Never written by anyone; the model made it up.
              '이 제품 3개 주문했어요 정말 만족합니다',
              // A real one, quoted from the item below.
              '가격 알려주시면 바로 구매할게요',
              // Also real, but re-wrapped the way a model reflows text it
              // copied. Same words, so it is still a quote.
              '배송은  얼마나\n걸리나요?',
            ],
          },
        ],
        highlights: ['구매 의도가 강합니다.'],
      }),
    };

    const inbox = new SnapsFeedbackInboxService(inflating as never);
    const summary = await inbox.summarize('signal-org', {
      items: [
        {
          platform: 'instagram',
          content: '가격 알려주시면 바로 구매할게요',
          author: 'a',
        },
        { platform: 'instagram', content: '배송은 얼마나 걸리나요?', author: 'b' },
      ],
    } as never);

    const purchase = summary.conversionSignals.find(
      (signal) => signal.id === 'purchase-intent'
    );
    expect(summary.total).toBe(2);
    // Raising a count is the model's to do - it reads the text where the
    // keyword rules only match phrases, which is why bySentiment is allowed to
    // move too. What it cannot do is claim more occurrences than there were
    // responses. The deterministic count here is 1, the model said 40, and the
    // ceiling is the number of responses.
    expect(`purchase-intent count: ${purchase?.count}`).toBe('purchase-intent count: 2');
    expect(`within the total: ${(purchase?.count ?? 0) <= summary.total}`).toBe(
      'within the total: true'
    );
    // Quotes come from the responses or not at all.
    expect(purchase?.examples).toEqual([
      '가격 알려주시면 바로 구매할게요',
      // Kept, and handed over collapsed rather than with the model's wrapping.
      '배송은 얼마나 걸리나요?',
    ]);
  });

  // The client retries against 127.0.0.1 when the host is localhost, because
  // Node resolves localhost to ::1 while Ollama listens on IPv4. That retry
  // runs on *any* failure, a timeout included - so an Ollama that accepts the
  // connection and never answers is waited for twice, and the caller's timeout
  // means half what it says. Same defect the health probes were fixed for.
  // The retry exists for a real failure mode and must survive the fix above:
  // Node resolves localhost to ::1, Ollama listens on IPv4, and the connection
  // is refused immediately. That is not a deadline, so it still gets retried.
  it('still retries localhost against 127.0.0.1 when the connection is refused', async () => {
    const originalFetch = globalThis.fetch;
    const originalUrl = process.env.OLLAMA_BASE_URL;
    process.env.OLLAMA_BASE_URL = 'http://localhost:65533';

    const attempts: string[] = [];
    globalThis.fetch = (async (url: string) => {
      attempts.push(String(url));
      if (String(url).includes('localhost')) {
        throw Object.assign(new Error('connect ECONNREFUSED ::1:65533'), {
          code: 'ECONNREFUSED',
        });
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ embeddings: [[0.1, 0.2]] }),
        text: async () => '{"embeddings":[[0.1,0.2]]}',
      };
    }) as never;

    try {
      const embedded = await new OllamaClient().embed('환절기 건강');
      expect(attempts.map((url) => new URL(url).hostname)).toEqual([
        'localhost',
        '127.0.0.1',
      ]);
      expect(embedded).toEqual([[0.1, 0.2]]);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalUrl === undefined) {
        delete process.env.OLLAMA_BASE_URL;
      } else {
        process.env.OLLAMA_BASE_URL = originalUrl;
      }
    }
  }, 20000);

  // Number('abc') is NaN and setTimeout treats NaN as 1ms, so a misspelt
  // timeout aborted every AI request almost at once - the trap snapsTimeoutMs
  // was written for, which the AI clients were not using.
  it('ignores a timeout env that is not a number', async () => {
    const originalFetch = globalThis.fetch;
    const originalUrl = process.env.OLLAMA_BASE_URL;
    const originalTimeout = process.env.OLLAMA_EMBED_TIMEOUT_MS;
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:65533';
    process.env.OLLAMA_EMBED_TIMEOUT_MS = '30초';

    globalThis.fetch = ((_url: string, init: RequestInit) =>
      new Promise((resolve) => {
        // Answers after longer than NaN-as-1ms would have allowed.
        setTimeout(
          () =>
            resolve({
              ok: true,
              status: 200,
              statusText: 'OK',
              json: async () => ({ embeddings: [[0.3]] }),
              text: async () => '{"embeddings":[[0.3]]}',
            } as never),
          60
        );
        init.signal?.addEventListener('abort', () => resolve(undefined as never));
      })) as never;

    try {
      await expect(new OllamaClient().embed('환절기')).resolves.toEqual([[0.3]]);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalUrl === undefined) {
        delete process.env.OLLAMA_BASE_URL;
      } else {
        process.env.OLLAMA_BASE_URL = originalUrl;
      }
      if (originalTimeout === undefined) {
        delete process.env.OLLAMA_EMBED_TIMEOUT_MS;
      } else {
        process.env.OLLAMA_EMBED_TIMEOUT_MS = originalTimeout;
      }
    }
  }, 20000);

  it('waits out an unresponsive Ollama once, not twice', async () => {
    const originalFetch = globalThis.fetch;
    const originalUrl = process.env.OLLAMA_BASE_URL;
    const originalTimeout = process.env.OLLAMA_EMBED_TIMEOUT_MS;
    process.env.OLLAMA_BASE_URL = 'http://localhost:65533';
    process.env.OLLAMA_EMBED_TIMEOUT_MS = '150';

    const attempts: string[] = [];
    globalThis.fetch = ((url: string, init: RequestInit) => {
      attempts.push(String(url));
      // Accepts and never answers, until the caller's own signal aborts.
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))
        );
      });
    }) as never;

    try {
      const client = new OllamaClient();
      const started = Date.now();
      await expect(client.embed('환절기 건강')).rejects.toBeTruthy();
      const elapsed = Date.now() - started;

      expect(`attempts: ${attempts.length}`).toBe('attempts: 1');
      // One budget plus slack, not two.
      expect(`within one timeout: ${elapsed < 400}`).toBe('within one timeout: true');
    } finally {
      globalThis.fetch = originalFetch;
      if (originalUrl === undefined) {
        delete process.env.OLLAMA_BASE_URL;
      } else {
        process.env.OLLAMA_BASE_URL = originalUrl;
      }
      if (originalTimeout === undefined) {
        delete process.env.OLLAMA_EMBED_TIMEOUT_MS;
      } else {
        process.env.OLLAMA_EMBED_TIMEOUT_MS = originalTimeout;
      }
    }
  }, 20000);

  // sanitizeSnapsHashtags was moved to the choke point every flow crosses
  // because "only the transform path got it". Card news and shorts kept a
  // private copy that had learned none of it, so they published a merged tag
  // nobody searches, the same Korean tag twice, and the same word in two cases
  // out of a budget as small as one on Threads.
  it.each([
    ['card news', 'cardnews'],
    ['short video', 'shorts'],
  ])('cleans %s hashtags the way every other flow does', async (_label, which) => {
    const offline = new OfflineOllama() as never;
    const model = {
      provider: () => 'deepseek',
      model: 'hashtag-stub',
      embed: async () => [[0.1]],
      chatJson: async () => ({
        title: '환절기 건강',
        caption: '환절기 건강 관리',
        hashtags: [
          // The run-together form a model emits most often.
          '#환절기#건강관리#면역력',
          '#가을·환절기',
          // Decomposed, the way text that has been through macOS arrives.
          '#면역력'.normalize('NFD'),
          '#Health',
          '#health',
        ],
        slides: Array.from({ length: 4 }, (_unused, index) => ({
          order: index + 1,
          heading: `제목 ${index + 1}`,
          body: `본문 ${index + 1}`,
        })),
        scenes: Array.from({ length: 4 }, (_unused, index) => ({
          scene: index + 1,
          narration: `나레이션 ${index + 1}`,
        })),
      }),
    } as never;

    const hashtags =
      which === 'cardnews'
        ? (
            await new SnapsCardNewsService(model).script({
              sourceText: '환절기 건강 관리 원문입니다. 습도와 수면이 중요합니다.',
              slideCount: 4,
            } as never)
          ).hashtags
        : (
            await new SnapsShortVideoService(model).generate({
              sourceText: '환절기 건강 관리 원문입니다. 습도와 수면이 중요합니다.',
              durationSeconds: 30,
              platform: 'youtube',
            } as never)
          ).script.hashtags;

    void offline;
    const merged = hashtags.filter((tag: string) => tag.includes('건강관리면역력'));
    expect(`merged tags: ${merged.length}`).toBe('merged tags: 0');
    // Decomposed and composed are the same tag; so are two cases of one word.
    const composed = hashtags.map((tag: string) => tag.normalize('NFC').toLowerCase());
    expect(`duplicates: ${composed.length - new Set(composed).size}`).toBe(
      'duplicates: 0'
    );
    // The separators are separators, not characters to delete.
    expect(hashtags).toEqual(expect.arrayContaining(['#환절기']));
  }, 30000);

  // Every unit here becomes a card news slide or a shorts scene, so a torn one
  // is a slide reading `Dr.`. The digit half of this rule was already there -
  // `1.` and `2026. 9. 12.` survive - and the Latin half was not: a Korean
  // sentence ends on a Hangul syllable, so a stop with a letter in front of it
  // is an abbreviation, not an ending.
  it.each([
    ['환절기에는 면역력이 떨어집니다. 습도를 유지하세요.', 2],
    ['첫 문장입니다.둘째 문장입니다.', 2],
    ['1. 습도 50% 이상 유지\n2. 손 씻기', 2],
    ['2026. 9. 12. 에 재입고됩니다.', 1],
    ['평균 4.5점을 받았습니다. 감사합니다.', 2],
    // The Latin half.
    ['Dr. Kim이 추천한 방법입니다. 참고하세요.', 2],
    ['vs. 경쟁 제품과 비교했습니다.', 1],
    ['오전 9시 a.m. 시작합니다.', 1],
    // The cost, stated rather than hidden: an English sentence inside Korean
    // copy stays with what follows unless a newline divides them.
    ['This is great. 다음 주에 만나요.', 1],
    ['This is great.\n다음 주에 만나요.', 2],
  ])('splits %s into the right number of units', (source, units) => {
    expect(`${source} -> ${snapsSplitSentences(source as string).length}`).toBe(
      `${source} -> ${units}`
    );
  });

  it('never tears a marker off the item it belongs to', () => {
    const torn = [
      'Dr. Kim이 추천한 방법입니다.',
      'vs. 경쟁 제품과 비교했습니다.',
      '1. 습도 50% 이상 유지',
      '2026. 9. 12. 에 재입고됩니다.',
    ]
      .flatMap((source) => snapsSplitSentences(source))
      .filter((unit) => /^[0-9A-Za-z]{1,4}\.$/.test(unit));
    expect(torn).toEqual([]);
  });

  // X rewrites every link to t.co and charges 23 units for it whatever it says,
  // so counting a link's characters is wrong in both directions - and a caption
  // with a link is the ordinary case here.
  const 한문장 = '환절기 건강 관리 팁을 정리했습니다. 자세히 보기 ';

  it.each([
    ['a short link costs more than it looks', 'https://s.io/a'],
    [
      'a utm-tagged link costs no more than a short one',
      'https://example.com/blog/2026/09/guide?utm_source=x&utm_medium=social&utm_campaign=autumn',
    ],
  ])('%s', (_label, url) => {
    const withLink = `${한문장}${url}`;
    const withoutLink = snapsWeightedLength(한문장);
    // Whatever the link says, it adds the same 23.
    expect(`${snapsWeightedLength(withLink) - withoutLink}`).toBe('23');
  });

  it('never cuts a post in the middle of its link', () => {
    const url = 'https://example.com/blog/2026/09/guide?utm_source=x';
    const post = `${한문장}${url}`;
    // A budget that fits the sentence but not the link.
    const budget = snapsWeightedLength(한문장) + 10;
    const clamped = snapsClampToWeight(post, budget);
    expect(`contains a partial link: ${clamped.includes('https://') && !clamped.includes(url)}`).toBe(
      'contains a partial link: false'
    );
    expect(snapsWeightedLength(clamped) <= budget).toBe(true);
  });

  it('keeps a linked Korean post inside what X will accept', () => {
    const url = 'https://example.com/a?utm_source=x&utm_medium=social';
    // Counting this link's 51 characters instead of its 23 units used to
    // push the post over budget and cut the prose short for nothing.
    const post = `${'환절기 건강 관리 팁입니다. '.repeat(4)}${url}`;
    expect(snapsWeightedLength(post) <= 280).toBe(true);
    const clamped = snapsClampToWeight(post, 280);
    expect(`untouched: ${clamped === post}`).toBe('untouched: true');

    // And when the prose alone is already over budget the tail goes, link
    // included - a clamp cuts the end, and the link sits at the end. Stated
    // here because it is a real consequence, not an oversight.
    const tooLong = `${'환절기 건강 관리 팁입니다. '.repeat(12)}${url}`;
    const cut = snapsClampToWeight(tooLong, 280);
    expect(snapsWeightedLength(cut) <= 280).toBe(true);
    expect(`link kept when the prose alone overflows: ${cut.includes(url)}`).toBe(
      'link kept when the prose alone overflows: false'
    );
  });

  // Cut at every position, not at a chosen one. The shapes are what a Korean
  // caption carries: a flag is two code points, a family is joined by ZWJ, a
  // keycap is a digit plus a variation selector plus an enclosing mark, and
  // text that has been through macOS arrives with its Hangul decomposed.
  it('never cuts inside a character, at any budget', () => {
    const samples = [
      '환절기 🇰🇷 건강',
      '가족 👨\u200d👩\u200d👧\u200d👦 이야기',
      '좋아요 👍🏽 감사합니다',
      '1\ufe0f\u20e3 습도 유지',
      'cafe\u0301 에서 만나요',
      // Decomposed: a piece of this is a different syllable, not a shorter one.
      '\u1112\u1161\u11ab글 입니다',
    ];
    const segmenter = new (Intl as unknown as {
      Segmenter: new (
        locale: string,
        options: { granularity: string }
      ) => { segment: (input: string) => Iterable<{ segment: string }> };
    }).Segmenter('ko', { granularity: 'grapheme' });
    const clusters = (value: string) =>
      [...segmenter.segment(value)].map((part) => part.segment);

    const broken: string[] = [];
    for (const text of samples) {
      const whole = clusters(text);
      for (let limit = 1; limit < text.length; limit += 1) {
        const cut = snapsClampText(text, limit);
        if (cut.length > limit) {
          broken.push(`${text} @${limit}: over budget`);
          continue;
        }
        if (
          /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(cut)
        ) {
          broken.push(`${text} @${limit}: lone surrogate`);
          continue;
        }
        const kept = clusters(cut);
        const torn = kept.findIndex((part, index) => part !== whole[index]);
        if (torn >= 0) {
          broken.push(`${text} @${limit}: cluster ${torn} became ${JSON.stringify(kept[torn])}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  // What a paste carries. A non-breaking space, a byte order mark and the
  // U+2028/U+2029 separators are whitespace to JavaScript and were already
  // handled; U+200B and U+00AD are not, and used to reach the published post -
  // invisible, spending a length budget the operator cannot see, and splitting
  // a word for the platform's search.
  it.each([
    ['non-breaking space', '환절기\u00a0건강', '환절기 건강'],
    ['zero-width space', '환절기\u200b건강', '환절기건강'],
    ['soft hyphen', '환절기\u00ad건강', '환절기건강'],
    ['word joiner', '환절기\u2060건강', '환절기건강'],
    ['byte order mark', '\ufeff환절기 건강', '환절기 건강'],
    ['line separator', '환절기\u2028건강', '환절기 건강'],
    ['paragraph separator', '환절기\u2029건강', '환절기 건강'],
  ])('clears %s out of a body', (_label, input, expected) => {
    expect(snapsCleanBodyText(input as string, 500)).toBe(expected);
  });

  // The joiner is not noise: it is what holds an emoji family together, and
  // stripping it turns one picture into three people.
  it('keeps the joiners that hold a character together', () => {
    const family = '가족 👨\u200d👩\u200d👧 이야기';
    expect(snapsCleanBodyText(family, 500)).toBe(family);
    const zwnj = '\u200c';
    expect(snapsCleanBodyText(`ab${zwnj}cd`, 500)).toBe(`ab${zwnj}cd`);
  });

  // The line breaks this helper exists to keep still survive the new strip.
  it('still keeps the line breaks a writer put in', () => {
    expect(snapsCleanBodyText('환절기 건강\n\n습도 유지\n손 씻기', 500)).toBe(
      '환절기 건강\n\n습도 유지\n손 씻기'
    );
  });

  // `가-힣` is the composed syllable block, and text out of a macOS filesystem
  // arrives decomposed - which sanitizeSnapsHashtags already documents. Every
  // 가-힣 reader in this codebase fails on that form, and the failures are not
  // cosmetic.
  describe('Korean reaches every 가-힣 reader in one spelling', () => {
    const composed = '환절기영상';
    const decomposed = composed.normalize('NFD');

    it('files a decomposed name under its name, not underscores', () => {
      expect(decomposed).not.toBe(composed);
      expect(snapsMediaFileName(`https://cdn.test/${decomposed}.mp4`)).toBe(
        `${composed}.mp4`
      );
    });

    it('keeps two decomposed metric labels apart', () => {
      const rows = snapsAnalyticsToMetricInputs('instagram-1', [
        {
          label: '좋아요'.normalize('NFD'),
          data: [{ total: '10', date: '2026-05-04T00:00:00.000Z' }],
        },
        {
          label: '댓글'.normalize('NFD'),
          data: [{ total: '4', date: '2026-05-04T00:00:00.000Z' }],
        },
      ] as never);
      // Both used to strip to nothing and fall back to the literal `metric`,
      // so the report added them together.
      expect(rows.map((row) => row.metricKey)).toEqual(['좋아요', '댓글']);
    });

    it('lays a decomposed slide out exactly like a composed one', () => {
      const renderer = new SnapsCardNewsRendererService();
      const measure = (
        renderer as unknown as {
          measureText: (text: string, fontSize: number) => number;
        }
      ).measureText.bind(renderer);
      const wrap = (
        renderer as unknown as {
          wrapText: (
            text: unknown,
            maxWidth: number,
            fontSize: number,
            maxLines?: number
          ) => string[];
        }
      ).wrapText.bind(renderer);

      const heading = '환절기 건강 관리';
      // The width table charges a jamo like a syllable, so a decomposed
      // syllable used to cost three times as much - measured 2.57x, which
      // wrapped and ellipsised a heading that fit.
      expect(measure(heading.normalize('NFD'), 62)).toBe(measure(heading, 62));
      expect(wrap(heading.normalize('NFD'), 600, 62, 3)).toEqual(
        wrap(heading, 600, 62, 3)
      );
    });

    it('splits a decomposed paste into the same units as a composed one', () => {
      const source = '첫 문장입니다.둘째 문장입니다.';
      expect(snapsSplitSentences(source.normalize('NFD'))).toEqual(
        snapsSplitSentences(source)
      );
      expect(snapsSplitSentences(source.normalize('NFD'))).toHaveLength(2);
    });

    it('keeps two decomposed labels apart in the report as well', async () => {
      const offline = {
        provider: () => 'deepseek',
        model: 'key-stub',
        embed: async () => [[0.1]],
        chatJson: async () => {
          throw new Error('the deterministic path is the point');
        },
      };
      const report = await new SnapsReportGeneratorService(
        offline as never
      ).generate({
        title: '분해형 라벨',
        metrics: [
          {
            platform: 'instagram',
            metricKey: '좋아요'.normalize('NFD'),
            metricValue: 10,
            collectedAt: '2026-05-04T00:00:00.000Z',
          },
          {
            platform: 'instagram',
            metricKey: '댓글'.normalize('NFD'),
            metricValue: 4,
            collectedAt: '2026-05-04T00:00:00.000Z',
          },
        ],
      } as never);
      // Both used to normalize to an empty key and be summed as one metric.
      expect(Object.keys(report.metrics.instagram).sort()).toEqual(
        ['댓글', '좋아요'].sort()
      );
    });

    it('reads the topic out of a decomposed command', () => {
      const planner = new SnapsCommandPlannerService(
        new OfflineOllama() as never,
        null as never,
        null as never,
        null as never
      );
      const detect = (
        planner as unknown as { detectTopic: (input: string) => string }
      ).detectTopic.bind(planner);
      const command = '환절기 건강 관련 게시물 만들어줘';
      expect(detect(command.normalize('NFD'))).toBe(detect(command));
    });

    it('shares a scene out by what the narration actually says', async () => {
      const shorts = new SnapsShortVideoService(new OfflineOllama() as never);
      const counter = (
        shorts as unknown as {
          koreanSyllables?: (value: string) => number;
        }
      ).koreanSyllables;
      // The count is inside the timeline maths, so this asserts the outcome:
      // a decomposed script must produce the same storyboard as a composed one.
      const source = '환절기에는 면역력이 떨어지기 쉽습니다. 실내 습도를 유지하세요.';
      const fromComposed = await shorts.generate({
        sourceText: source,
        durationSeconds: 30,
        platform: 'youtube',
      } as never);
      const fromDecomposed = await shorts.generate({
        sourceText: source.normalize('NFD'),
        durationSeconds: 30,
        platform: 'youtube',
      } as never);
      void counter;
      expect(
        fromDecomposed.script.storyboard.map((scene: { endSecond: number }) => scene.endSecond)
      ).toEqual(
        fromComposed.script.storyboard.map((scene: { endSecond: number }) => scene.endSecond)
      );
    }, 30000);
  });

  // Said on Tuesday 12 May 2026 at 14:00 KST. Every one of these becomes a
  // scheduled post, so a mis-parse publishes at a moment nobody chose.
  // A command usually describes the work and then sets the limit, so the
  // publish word in the first half meets the refusal in the second. Measured
  // on that shape, four of five went out anyway - the plan published what the
  // operator had just said not to send.
  // The same vocabulary gap as the publish refusal, one layer over: 금지,
  // 보류 and 중단 were not denial words, so `카드뉴스 금지` read as a request -
  // and since a request decides the flag outright, the operator who wrote 금지
  // got card news.
  // Korean marks the formal register explicitly, and the default here is a
  // casual nano-influencer style - the opposite. Five ways of asking for it
  // all fell through to that default, so the plan specified the opposite of
  // what the operator wrote.
  describe('the register the operator asked for is the one planned', () => {
    const toneOf = (command: string) => {
      const planner = new SnapsCommandPlannerService(
        new OfflineOllama() as never,
        null as never,
        null as never,
        null as never
      );
      return (
        planner as unknown as { detectTone: (input: string) => string }
      ).detectTone.call(planner, command);
    };

    const formal = toneOf('정중하게 써줘');
    const casual = toneOf('그냥 써줘');
    const funny = toneOf('재밌게 써줘');

    it('keeps the three registers apart', () => {
      expect(new Set([formal, casual, funny]).size).toBe(3);
      expect(formal).toContain('존댓말');
    });

    it.each([
      ['정중하게 써줘', 'formal'],
      ['격식 있게 써줘', 'formal'],
      ['공손하게 부탁해', 'formal'],
      ['존댓말로 써줘', 'formal'],
      ['높임말로 작성해줘', 'formal'],
      // Asking for the opposite must not trip the same words.
      ['격식 없이 써줘', 'casual'],
      ['정중한 건 빼고 편하게 써줘', 'casual'],
      ['친근하게 써줘', 'casual'],
      ['딱딱하지 않게 써줘', 'casual'],
      ['재밌게 써줘', 'funny'],
    ])('reads %s as %s', (command, wanted) => {
      const expected =
        wanted === 'formal' ? formal : wanted === 'funny' ? funny : casual;
      expect(`${command} -> ${toneOf(command as string)}`).toBe(
        `${command} -> ${expected}`
      );
    });
  });

  describe('a format refusal is read however it is written', () => {
    const reads = (command: string, format: 'cardNews' | 'shortVideo') => {
      const planner = new SnapsCommandPlannerService(
        new OfflineOllama() as never,
        null as never,
        null as never,
        null as never
      );
      const inner = planner as unknown as {
        detectCardNews: (input: string) => boolean;
        detectShortVideo: (input: string) => boolean;
      };
      const detect =
        format === 'cardNews' ? inner.detectCardNews : inner.detectShortVideo;
      return detect.call(planner, command);
    };

    it.each([
      ['카드뉴스 만들어줘', 'cardNews', true],
      ['카드뉴스 만들지 마', 'cardNews', false],
      ['카드뉴스는 하지 마', 'cardNews', false],
      ['카드뉴스 빼고 올려줘', 'cardNews', false],
      // The words that were missing.
      ['카드뉴스 금지', 'cardNews', false],
      ['카드뉴스는 보류', 'cardNews', false],
      ['쇼츠 금지야', 'shortVideo', false],
      ['쇼츠는 중단', 'shortVideo', false],
      // And the reason the rule is anchored to the format rather than searched
      // for nearby: these are the same three words used as content.
      ['카드뉴스로 서비스 중단 안내 만들어줘', 'cardNews', true],
      ['쇼츠로 주차 금지 안내 만들어줘', 'shortVideo', true],
      ['카드뉴스로 발송 보류 공지 써줘', 'cardNews', true],
    ])('reads %s', (command, format, wanted) => {
      expect(
        `${command} -> ${reads(command as string, format as 'cardNews' | 'shortVideo')}`
      ).toBe(`${command} -> ${wanted}`);
    });
  });

  describe('a refusal to publish is read however it is written', () => {
    const decides = (command: string) => {
      const planner = new SnapsCommandPlannerService(
        new OfflineOllama() as never,
        null as never,
        null as never,
        null as never
      );
      const inner = planner as unknown as {
        refusesToPublish: (input: string) => boolean;
        looksLikePublishIntent: (input: string) => boolean;
      };
      const refuses = inner.refusesToPublish.call(planner, command);
      const intends = inner.looksLikePublishIntent.call(planner, command);
      return !refuses && intends ? 'schedule' : 'draft';
    };

    it.each([
      // Still publishes when nothing says otherwise.
      ['내일 오후 3시에 인스타에 올려줘', 'schedule'],
      ['이 글 게시해줘', 'schedule'],
      ['예약해줘', 'schedule'],
      // The forms that were already read.
      ['초안으로만 만들어줘', 'draft'],
      ['올리지는 마', 'draft'],
      ['게시하지 말고 초안으로 둬', 'draft'],
      ['예약은 필요 없어', 'draft'],
      // The forms that were not, each with a publish word in front of it.
      ['내일 올려야 하는데 오늘은 포스팅 금지야', 'draft'],
      ['예약 글 준비해줘. 업로드는 하지 마.', 'draft'],
      ['게시할 내용 정리해줘. 게시는 하지 말고.', 'draft'],
      ['발행용 원고 써줘. 발행은 보류.', 'draft'],
      ['인스타에 올려줘. 아니 올리면 안 돼.', 'draft'],
      // The draft-only form as the sole refusal, with a publish word in
      // front of it - otherwise nothing distinguishes that rule from the
      // command simply not asking to publish.
      ['내일 인스타에 올려줘. 아니다, 초안으로만.', 'draft'],
    ])('reads %s as %s', (command, wanted) => {
      expect(`${command} -> ${decides(command as string)}`).toBe(
        `${command} -> ${wanted}`
      );
    });
  });

  describe('what the operator said about time is what gets scheduled', () => {
    const now = new Date('2026-05-12T05:00:00.000Z');
    const KST = -540;
    const parse = (command: string) => {
      const planner = new SnapsCommandPlannerService(
        new OfflineOllama() as never,
        null as never,
        null as never,
        null as never
      );
      const detect = (
        planner as unknown as {
          detectPublishDate: (
            input: string,
            at: Date,
            offset: number
          ) => string | undefined;
        }
      ).detectPublishDate.bind(planner);
      const iso = detect(command, now, KST);
      return iso
        ? new Date(new Date(iso).getTime() + 9 * 3600 * 1000)
            .toISOString()
            .replace('.000Z', '')
        : '(none)';
    };

    it.each([
      ['내일 오후 3시에 올려줘', '2026-05-13T15:00:00'],
      ['내일 오후 3시 30분에 올려줘', '2026-05-13T15:30:00'],
      ['오늘 밤 12시에 올려줘', '2026-05-13T00:00:00'],
      ['12월 25일 오전 9시에 올려줘', '2026-12-25T09:00:00'],
      ['다음 주 월요일 오전 10시에 올려줘', '2026-05-18T10:00:00'],
      ['내일 자정에 올려줘', '2026-05-13T00:00:00'],
      ['내일 정오에 올려줘', '2026-05-13T12:00:00'],
      ['내일 저녁 7시에 올려줘', '2026-05-13T19:00:00'],
      // 반 is half past. It was dropped, so this planned 03:00.
      ['내일 3시 반에 올려줘', '2026-05-13T03:30:00'],
      ['내일 오후 3시 반에 올려줘', '2026-05-13T15:30:00'],
      // `시간` is a duration. The `시` inside it used to be read as a clock
      // hour, so this was planned for 01:00 the next day - eleven hours from
      // what was asked and on the wrong date. There is no relative-offset
      // parsing here, so reading no time at all is the honest answer and the
      // planner's default stands.
      ['1시간 뒤에 올려줘', '(none)'],
      ['2시간 동안 준비해서 올려줘', '(none)'],
      ['30분 후에 올려줘', '(none)'],
    ])('reads %s as %s', (command, wanted) => {
      expect(`${command} -> ${parse(command as string)}`).toBe(
        `${command} -> ${wanted}`
      );
    });
  });

  it('returns script-ready Pixelle fallback when no Pixelle URL is configured', async () => {
    delete process.env.PIXELLE_VIDEO_URL;
    const shorts = new SnapsShortVideoService(new OfflineOllama() as any);

    const result = await shorts.generate({
      sourceText: '신제품 업데이트 핵심을 쇼츠로 요약합니다.',
      durationSeconds: 30,
      platform: 'youtube',
    });
    const status = await shorts.status('missing-pixelle-job');

    expect(result.status).toBe('script-ready');
    expect(result.script.durationSeconds).toBe(30);
    expect(result.script.storyboard).toHaveLength(4);
    expect(result.script.storyboard[0].pixellePrompt).toContain('Vertical');
    expect(status.status).toBe('not-configured');
  });

  it('keeps custom shorts duration instead of forcing 30/45/60 buckets', async () => {
    delete process.env.PIXELLE_VIDEO_URL;
    const shorts = new SnapsShortVideoService(new OfflineOllama() as any);

    const result = await shorts.generate({
      sourceText: '긴 제품 설명을 75초 쇼츠로 구성합니다.',
      durationSeconds: 75,
      platform: 'instagram',
    });

    expect(result.script.durationSeconds).toBe(75);
    expect(result.script.storyboard).toHaveLength(6);
    expect(result.script.storyboard[result.script.storyboard.length - 1].endSecond).toBe(75);
  });

  // script() has two return paths: normalizeScript(), which runs the storyboard
  // through enforceTimeline(), and the catch branch. Every offline deployment
  // and every LLM outage takes the catch branch, so the timeline contract has
  // to hold there too - and nothing asserted it.
  it('gives the offline fallback a gap-free timeline for every duration and platform', async () => {
    const shorts = new SnapsShortVideoService(new OfflineOllama() as any);

    for (const durationSeconds of [30, 45, 60] as const) {
      for (const platform of ['youtube', 'tiktok', 'instagram'] as const) {
        const script = await shorts.script({
          sourceText: '무선 이어폰 신제품을 출시했습니다.',
          durationSeconds,
          platform,
        });
        const where = `${platform}/${durationSeconds}s`;

        expect(script.storyboard.length).toBeGreaterThanOrEqual(3);
        expect(`${where} start ${script.storyboard[0].startSecond}`).toBe(`${where} start 0`);
        const last = script.storyboard[script.storyboard.length - 1];
        expect(`${where} end ${last.endSecond}`).toBe(`${where} end ${durationSeconds}`);
        script.storyboard.forEach((scene, index) => {
          expect(`${where} scene#${scene.scene}`).toBe(`${where} scene#${index + 1}`);
          expect(scene.endSecond).toBeGreaterThan(scene.startSecond);
          if (index > 0) {
            expect(`${where} gap@${index}: ${scene.startSecond}`).toBe(
              `${where} gap@${index}: ${script.storyboard[index - 1].endSecond}`
            );
          }
        });
      }
    }
  });

  it('normalizes malformed shorts LLM script fields without leaking object strings', async () => {
    const shorts = new SnapsShortVideoService(new MalformedShortsOllama() as any);

    const script = await shorts.script({
      sourceText: '잘못된 쇼츠 대본 응답도 UI에서 안전하게 보여야 합니다.',
      platform: 'tiktok',
    });
    const serialized = JSON.stringify(script);

    expect(script.durationSeconds).toBe(60);
    expect(script.coreSummary).toContain('요약 문장');
    // The request asks for tiktok, so the fallback title names TikTok rather
    // than defaulting to YouTube's Shorts branding.
    expect(script.title).toBe('snaps TikTok 초안');
    expect(script.storyboard).toHaveLength(4);
    // endSecond: 999 is still clamped, but no longer all the way to the full 60
    // seconds: scenes 3 and 4 follow it, so it may not consume their time. The
    // storyboard has to stay a coherent timeline, not just individually sane
    // numbers.
    expect(script.storyboard[1].endSecond).toBe(58);
    expect(script.storyboard[0].startSecond).toBe(0);
    expect(script.storyboard[3].endSecond).toBe(60);
    script.storyboard.forEach((scene, index) => {
      expect(scene.endSecond).toBeGreaterThan(scene.startSecond);
      if (index > 0) {
        expect(scene.startSecond).toBe(script.storyboard[index - 1].endSecond);
      }
    });
    expect(script.uploadMetadata.description).toContain('업로드 설명');
    expect(script.uploadMetadata.hashtags).toEqual([
      '#shorts',
      '#snaps',
      '#나쁜태그',
    ]);
    expect(serialized).not.toContain('[object Object]');
  });

  it('normalizes Naver Cafe OAuth, refresh, post payload, and token errors', async () => {
    const provider = new NaverCafeProvider();
    const originalFetch = globalThis.fetch;
    const originalEnv = {
      FRONTEND_URL: process.env.FRONTEND_URL,
      NAVER_CLIENT_ID: process.env.NAVER_CLIENT_ID,
      NAVER_CLIENT_SECRET: process.env.NAVER_CLIENT_SECRET,
    };
    const seen = {
      tokenBodies: [] as string[],
      postUrl: '',
      postBody: '',
    };

    try {
      process.env.FRONTEND_URL = 'https://snaps.example.test';
      process.env.NAVER_CLIENT_ID = 'naver-client';
      process.env.NAVER_CLIENT_SECRET = 'naver-secret';
      globalThis.fetch = (async (url: string | URL, options?: RequestInit) => {
        const requestUrl = String(url);
        if (requestUrl.includes('/oauth2.0/token')) {
          seen.tokenBodies.push(String(options?.body || ''));
          return new Response(
            JSON.stringify({
              access_token: 'naver-access',
              expires_in: 3600,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (requestUrl.includes('/v1/nid/me')) {
          return new Response(
            JSON.stringify({
              response: {
                id: 'naver-user',
                nickname: 'snaps User',
                email: 'snaps@example.test',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (requestUrl.includes('/v1/cafe/')) {
          seen.postUrl = requestUrl;
          seen.postBody = String(options?.body || '');
          return new Response(
            JSON.stringify({
              message: {
                result: {
                  articleId: 123,
                  articleUrl: 'https://cafe.naver.com/snaps/123',
                  msg: 'ok',
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response(JSON.stringify({ error: 'unexpected path' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof fetch;

      const authUrl = await provider.generateAuthUrl();
      const authenticated = await provider.authenticate({
        code: 'auth-code',
        codeVerifier: authUrl.state,
      });
      const refreshed = await provider.refreshToken('refresh-fallback');
      const posted = await provider.post(
        'internal-id',
        'naver-access',
        [
          {
            id: 'post-1',
            message: '<p><strong>snaps</strong> Naver Cafe smoke</p>',
            settings: {
              clubId: 'snap cafe',
              menuId: 'board 1',
              subject: 'Smoke subject',
              category: 'notice',
            },
            media: [],
          },
        ],
        {} as any
      );
      const refreshError = provider.handleErrors(
        JSON.stringify({ error: 'invalid_token', message: 'expired' }),
        401
      );

      globalThis.fetch = (async () =>
        new Response('<html><body>Naver auth gateway failed</body></html>', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/html' },
        })) as typeof fetch;
      const failedAuth = await provider.authenticate({
        code: 'auth-code',
        codeVerifier: authUrl.state,
      });
      let failedRefresh = '';
      try {
        await provider.refreshToken('refresh-fallback');
      } catch (error) {
        failedRefresh = error instanceof Error ? error.message : String(error);
      }

      expect(authUrl.url).toContain('client_id=naver-client');
      expect(authUrl.url).toContain('scope=profile%2Ccafe');
      expect(authUrl.codeVerifier).toBe(authUrl.state);
      expect(authenticated).toMatchObject({
        id: 'naver-user',
        accessToken: 'naver-access',
        username: 'snaps@example.test',
      });
      expect(refreshed).toMatchObject({
        refreshToken: 'refresh-fallback',
      });
      expect(seen.tokenBodies.join('\n')).toContain('client_secret=naver-secret');
      expect(seen.postUrl).toContain('/snap%20cafe/menu/board%201/articles');
      expect(seen.postBody).toContain('subject=Smoke+subject');
      expect(seen.postBody).toContain('category=notice');
      expect(posted[0]).toMatchObject({
        postId: '123',
        releaseURL: 'https://cafe.naver.com/snaps/123',
        status: 'ok',
      });
      expect(refreshError?.type).toBe('refresh-token');
      expect(failedAuth).toContain('503 Service Unavailable');
      expect(String(failedAuth)).not.toContain('<html>');
      expect(failedRefresh).toContain('503 Service Unavailable');
      expect(failedRefresh).not.toContain('<html>');
    } finally {
      globalThis.fetch = originalFetch;
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      });
    }
  });

  it('routes chatJson and health to DeepSeek when AI_PROVIDER=deepseek, and keeps embed on Ollama', async () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = {
      AI_PROVIDER: process.env.AI_PROVIDER,
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
      DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL,
      DEEPSEEK_CHAT_MODEL: process.env.DEEPSEEK_CHAT_MODEL,
      OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
      OLLAMA_CHAT_MODEL: process.env.OLLAMA_CHAT_MODEL,
      OLLAMA_EMBED_MODEL: process.env.OLLAMA_EMBED_MODEL,
    };
    const requestUrls: string[] = [];

    try {
      process.env.AI_PROVIDER = 'deepseek';
      process.env.DEEPSEEK_API_KEY = 'jest-deepseek-key';
      process.env.DEEPSEEK_BASE_URL = 'https://deepseek.example.test';
      process.env.DEEPSEEK_CHAT_MODEL = 'deepseek-jest';
      process.env.OLLAMA_BASE_URL = 'https://ollama.example.test';
      process.env.OLLAMA_CHAT_MODEL = 'qwen-jest';
      process.env.OLLAMA_EMBED_MODEL = 'nomic-jest';

      globalThis.fetch = (async (url: string | URL, options?: RequestInit) => {
        const requestUrl = String(url);
        requestUrls.push(requestUrl);

        if (requestUrl.endsWith('/models')) {
          return new Response(
            JSON.stringify({ data: [{ id: 'deepseek-jest' }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (requestUrl.endsWith('/chat/completions')) {
          expect(String(options?.headers && (options.headers as Record<string, string>).Authorization)).toBe(
            'Bearer jest-deepseek-key'
          );
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: '{"ok":true,"provider":"deepseek"}' } }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (requestUrl.endsWith('/api/tags')) {
          return new Response(
            JSON.stringify({ models: [{ name: 'nomic-jest' }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response(JSON.stringify({ error: 'unexpected path' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof fetch;

      const client = new OllamaClient();
      const result = await client.chatJson<{ ok: boolean; provider: string }>([
        { role: 'user', content: 'ping' },
      ]);
      expect(result).toEqual({ ok: true, provider: 'deepseek' });

      const health = await client.health();
      expect(health).toMatchObject({
        ok: true,
        provider: 'deepseek',
        chatModel: 'deepseek-jest',
        chatModelAvailable: true,
        embedModel: 'nomic-jest',
        embedModelAvailable: true,
      });
      expect(requestUrls.some((url) => url.includes('deepseek.example.test'))).toBe(true);
      expect(requestUrls.some((url) => url.includes('ollama.example.test'))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      });
    }
  });

  it('parses Ollama health, fenced JSON, prefixed JSON, embeds, and thinking-only failures', async () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = {
      OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
      OLLAMA_CHAT_MODEL: process.env.OLLAMA_CHAT_MODEL,
      OLLAMA_EMBED_MODEL: process.env.OLLAMA_EMBED_MODEL,
      OLLAMA_DISABLE_THINKING: process.env.OLLAMA_DISABLE_THINKING,
      OLLAMA_NUM_PREDICT: process.env.OLLAMA_NUM_PREDICT,
    };
    const chatBodies: string[] = [];
    let chatCount = 0;

    try {
      process.env.OLLAMA_BASE_URL = 'https://ollama.example.test';
      process.env.OLLAMA_CHAT_MODEL = 'qwen-jest';
      process.env.OLLAMA_EMBED_MODEL = 'nomic-jest';
      process.env.OLLAMA_DISABLE_THINKING = 'true';
      process.env.OLLAMA_NUM_PREDICT = '8192';
      globalThis.fetch = (async (url: string | URL, options?: RequestInit) => {
        const requestUrl = String(url);
        if (requestUrl.endsWith('/api/tags')) {
          return new Response(
            JSON.stringify({
              models: [{ name: 'qwen-jest' }, { model: 'nomic-jest' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (requestUrl.endsWith('/api/chat')) {
          chatBodies.push(String(options?.body || ''));
          chatCount += 1;
          if (chatCount === 1) {
            return new Response(
              JSON.stringify({
                message: { content: '```json\n{"ok":true,"mode":"fenced"}\n```' },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          if (chatCount === 2) {
            return new Response(
              JSON.stringify({
                message: { content: 'final answer:\n{"ok":true,"mode":"prefixed"}' },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return new Response(
            JSON.stringify({
              message: { content: '', thinking: 'hidden thinking only' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (requestUrl.endsWith('/api/embed')) {
          return new Response(
            JSON.stringify({ embeddings: [[0.1, 'bad', 0.2], [], 'bad-row'] }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        return new Response(JSON.stringify({ error: 'unexpected path' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof fetch;

      const client = new OllamaClient();
      const health = await client.health();
      const fenced = await client.chatJson<{ ok: boolean; mode: string }>([
        { role: 'user', content: 'return fenced json' },
      ]);
      const prefixed = await client.chatJson<{ ok: boolean; mode: string }>([
        { role: 'user', content: 'return prefixed json' },
      ]);
      const embeddings = await client.embed('embed this');

      await expect(
        client.chatJson([{ role: 'user', content: 'thinking only' }])
      ).rejects.toThrow('thinking output without final JSON content');

      globalThis.fetch = (async (url: string | URL) => {
        if (String(url).endsWith('/api/tags')) {
          return new Response(
            JSON.stringify({ models: [{ name: 'qwen-jest' }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response(JSON.stringify({ error: 'unexpected path' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof fetch;
      const missingEmbedHealth = await new OllamaClient().health();

      const firstChatBody = JSON.parse(chatBodies[0]);
      expect(health).toMatchObject({
        ok: true,
        chatModel: 'qwen-jest',
        embedModel: 'nomic-jest',
        chatModelAvailable: true,
        embedModelAvailable: true,
        missingModels: [],
      });
      expect(health.models).toEqual(['qwen-jest', 'nomic-jest']);
      expect(missingEmbedHealth).toMatchObject({
        ok: false,
        chatModelAvailable: true,
        embedModelAvailable: false,
        missingModels: ['nomic-jest'],
      });
      expect(fenced).toEqual({ ok: true, mode: 'fenced' });
      expect(prefixed).toEqual({ ok: true, mode: 'prefixed' });
      expect(embeddings).toEqual([[0.1, 0.2]]);
      expect(firstChatBody.think).toBe(false);
      expect(firstChatBody.options.num_predict).toBe(8192);
      expect(firstChatBody.messages[0].content).toContain('Return final JSON only');
    } finally {
      globalThis.fetch = originalFetch;
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      });
    }
  });

  it('retries localhost Ollama health over IPv4 when localhost resolves to IPv6 only', async () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = {
      OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
      OLLAMA_CHAT_MODEL: process.env.OLLAMA_CHAT_MODEL,
      OLLAMA_EMBED_MODEL: process.env.OLLAMA_EMBED_MODEL,
    };
    const requestUrls: string[] = [];

    try {
      process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
      process.env.OLLAMA_CHAT_MODEL = 'qwen-jest';
      process.env.OLLAMA_EMBED_MODEL = 'nomic-jest';
      globalThis.fetch = (async (url: string | URL) => {
        const requestUrl = String(url);
        requestUrls.push(requestUrl);

        if (requestUrl.startsWith('http://localhost:11434')) {
          throw new TypeError('fetch failed');
        }

        if (requestUrl === 'http://127.0.0.1:11434/api/tags') {
          return new Response(
            JSON.stringify({
              models: [{ name: 'qwen-jest' }, { name: 'nomic-jest' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response(JSON.stringify({ error: 'unexpected path' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof fetch;

      const health = await new OllamaClient().health();

      expect(health.ok).toBe(true);
      expect(health.models).toEqual(['qwen-jest', 'nomic-jest']);
      expect(requestUrls).toEqual([
        'http://localhost:11434/api/tags',
        'http://127.0.0.1:11434/api/tags',
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      });
    }
  });

  describe('SnapsReportGeneratorService summary key handling', () => {
    class ExecutiveSummaryOllama extends OfflineOllama {
      async chatJson<T>(): Promise<T> {
        // DeepSeek answered with this key in a live run; the service used to
        // read only `summary` and silently drop it.
        return { executiveSummary: 'DeepSeek 요약 문장입니다.' } as T;
      }
    }

    const metrics = [
      {
        platform: 'instagram',
        metricKey: 'impressions',
        metricValue: 1200,
        collectedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        platform: 'instagram',
        metricKey: 'impressions',
        metricValue: 1800,
        collectedAt: '2026-09-08T00:00:00.000Z',
      },
    ];

    it('accepts an executiveSummary key instead of discarding the LLM summary', async () => {
      const report = await new SnapsReportGeneratorService(
        new ExecutiveSummaryOllama() as any
      ).generate({ title: 'jest report', metrics } as any);

      expect(report.summary).toBe('DeepSeek 요약 문장입니다.');
      expect(report.summary).not.toBe(report.insights.join(' '));
    });

    it('still falls back to deterministic insights when the LLM returns nothing usable', async () => {
      const report = await new SnapsReportGeneratorService(
        new OfflineOllama() as any
      ).generate({ title: 'jest report', metrics } as any);

      expect(report.summary).toBe(report.insights.join(' '));
      expect(report.insights.length).toBeGreaterThan(0);
    });
  });

  describe('SnapsCommandPlannerService card news routing', () => {
    const buildPlanner = () => {
      const transformer = new SnapsContentTransformService(
        new OfflineOllama() as any,
        emptyRag as any
      );
      return new SnapsCommandPlannerService(
        new OfflineOllama() as any,
        transformer,
        new SnapsShortVideoService(new OfflineOllama() as any),
        new SnapsCardNewsService(new OfflineOllama() as any)
      );
    };

    it('prepares an actual card news deck when the command asks for one', async () => {
      process.env.SNAPS_ALLOW_RULE_FALLBACK = 'true';
      const prepared = await buildPlanner().prepare('jest-org', {
        command:
          '환절기 건강 관리 내용을 인스타그램 카드뉴스로 만들어줘. 일교차가 커지면 면역력이 떨어집니다. 실내 습도를 유지하세요.',
      });

      expect(prepared.plan.includeCardNews).toBe(true);
      expect(prepared.cardNews).toBeDefined();
      expect(prepared.cardNews!.slides.length).toBeGreaterThan(0);
      expect(
        prepared.warnings.some((warning) => warning.includes('카드뉴스는 대본까지만 준비됩니다'))
      ).toBe(true);
    });

    it('does not prepare a deck for commands that never mention card news', async () => {
      process.env.SNAPS_ALLOW_RULE_FALLBACK = 'true';
      const prepared = await buildPlanner().prepare('jest-org', {
        command: '신제품 소식을 인스타그램과 스레드에 올릴 게시글로 정리해줘.',
      });

      expect(prepared.plan.includeCardNews).toBe(false);
      expect(prepared.cardNews).toBeUndefined();
    });

    it('surfaces card news in the operator preview so the deck is not a hidden output', async () => {
      process.env.SNAPS_ALLOW_RULE_FALLBACK = 'true';
      const prepared = await buildPlanner().prepare('jest-org', {
        command:
          '환절기 건강 관리 내용을 카드뉴스로 만들어줘. 일교차가 커지면 면역력이 떨어집니다. 실내 습도를 유지하세요.',
      });

      const step = prepared.operation.progressSteps.find(
        (item) => item.id === 'generating_card_news'
      );
      expect(step).toBeDefined();
      expect(step!.status).toBe('done');
      expect(step!.detail).toContain('대본');
      expect(
        prepared.operation.nextActions.some((action) => action.includes('카드뉴스'))
      ).toBe(true);
    });

    it('marks the card news step as waiting when no deck was requested', async () => {
      process.env.SNAPS_ALLOW_RULE_FALLBACK = 'true';
      const prepared = await buildPlanner().prepare('jest-org', {
        command: '신제품 소식을 인스타그램에 올릴 게시글로 정리해줘.',
      });

      const step = prepared.operation.progressSteps.find(
        (item) => item.id === 'generating_card_news'
      );
      expect(step?.status).toBe('waiting');
      expect(
        prepared.operation.nextActions.some((action) => action.includes('카드뉴스'))
      ).toBe(false);
    });
  });

  describe('buildSnapsCardNewsVariants', () => {
    it('clamps the shared caption and hashtags to each platform rule', () => {
      const caption = '가을 환절기 건강 관리 방법입니다. '.repeat(30);
      const result = buildSnapsCardNewsVariants({
        title: '카드뉴스',
        caption,
        hashtags: Array.from({ length: 12 }, (_, index) => `#태그${index + 1}`),
        slides: [{ id: 'm1', path: 'p1', alt: 'a' }],
      });

      expect(result.variants.length).toBeGreaterThan(0);
      for (const variant of result.variants) {
        const rule = snapsPlatformRules[variant.platform];
        // X counts units, not characters, so it is the weighted length that
        // has to fit - see the transform path, which was converted first.
        if (rule.weightedLimit) {
          expect(snapsWeightedLength(variant.content)).toBeLessThanOrEqual(
            rule.weightedLimit
          );
        } else {
          expect(variant.content.length).toBeLessThanOrEqual(rule.maxLength);
        }
        expect(variant.hashtags.length).toBeLessThanOrEqual(rule.hashtagLimit ?? 20);
      }

      // x is the tightest platform in the card-news set (280 units, 1 hashtag)
      // and previously received the full shared caption. A Korean caption fits
      // 164 characters of it, not 280 - the rest are the spaces and Latin
      // punctuation that weigh one.
      const x = result.variants.find((variant) => variant.platform === 'x');
      expect(snapsWeightedLength(x?.content || '')).toBeLessThanOrEqual(280);
      expect(`characters: ${x?.content.length}`).toBe('characters: 164');
      expect(x?.hashtags).toEqual(['#태그1']);
    });
  });

  describe('SnapsCardNewsService fallback deck', () => {
    const failingOllama = {
      get model() {
        return 'offline-card-news';
      },
      async chatJson<T>(): Promise<T> {
        throw new Error('force deterministic fallback');
      },
      async embed() {
        return [[0]];
      },
    };

    it('keeps source sentences in reading order across body slides', async () => {
      const service = new SnapsCardNewsService(failingOllama as any);
      const deck = await service.script({
        sourceText:
          '첫째 문장입니다. 둘째 문장입니다. 셋째 문장입니다. 넷째 문장입니다. 다섯째 문장입니다. 여섯째 문장입니다. 일곱째 문장입니다. 여덟째 문장입니다.',
        slideCount: 6,
      });

      // Body slides sit between the cover and the closing slide.
      const bodyBodies = deck.slides.slice(1, -1).map((slide) => slide.body);
      const ordinals = [
        '첫째',
        '둘째',
        '셋째',
        '넷째',
        '다섯째',
        '여섯째',
        '일곱째',
        '여덟째',
      ];
      const seen = bodyBodies
        .join(' ')
        .match(/(첫째|둘째|셋째|넷째|다섯째|여섯째|일곱째|여덟째)/g);

      // Round-robin chunking used to yield 1,5 / 2,6 / 3,7 / 4,8 here.
      expect(seen).toEqual(ordinals);
      expect(bodyBodies[0]).toContain('첫째');
      expect(bodyBodies[0]).toContain('둘째');
    });

    it('returns a shorter deck instead of repeating text when the source is thin', async () => {
      const service = new SnapsCardNewsService(failingOllama as any);
      const deck = await service.script({ sourceText: '하나. 둘.', slideCount: 6 });

      expect(deck.slides.length).toBeLessThan(6);
      const bodies = deck.slides.map((slide) => slide.body);
      expect(new Set(bodies).size).toBe(bodies.length);
      expect(deck.slides.map((slide) => slide.order)).toEqual(
        deck.slides.map((_, index) => index + 1)
      );
    });
  });

  // Same defect as the transform service: [] is truthy, so a `||` chain never
  // reached the later sources. Verified across every snaps service that falls
  // back to a default hashtag list.
  describe('card news and shorts hashtag defaults', () => {
    const ollamaReturning = (payload: unknown) => ({
      get model() {
        return 'stub';
      },
      provider() {
        return 'ollama' as const;
      },
      async chatJson() {
        return payload;
      },
      async embed() {
        return [[0]];
      },
    });

    const deckHashtags = async (hashtags: unknown) => {
      const service = new SnapsCardNewsService(
        ollamaReturning({
          title: '제목',
          slides: [
            { order: 1, eyebrow: '01', heading: '표지', body: '본문.' },
            { order: 2, eyebrow: '02', heading: '마무리', body: '마무리.' },
          ],
          caption: '캡션',
          hashtags,
        }) as any
      );
      const deck = await service.script({ sourceText: '원문입니다.', slideCount: 4 });
      return deck.hashtags;
    };

    it('keeps the card news default hashtags when the model returns none', async () => {
      expect(await deckHashtags([])).toEqual(['#카드뉴스', '#snaps']);
      expect(await deckHashtags(['###', ' '])).toEqual(['#카드뉴스', '#snaps']);
      expect(await deckHashtags(['#환절기'])).toEqual(['#환절기']);
    });

    const scriptHashtags = async (
      rootHashtags: unknown,
      metadataHashtags: unknown
    ) => {
      const service = new SnapsShortVideoService(
        ollamaReturning({
          title: '제목',
          coreSummary: '요약',
          hook: '훅',
          durationSeconds: 45,
          narration: '내레이션',
          storyboard: [
            { scene: 1, startSecond: 0, endSecond: 45, visual: 'v', narration: 'n', overlayText: 'o', pixellePrompt: 'p' },
          ],
          caption: '캡션',
          uploadMetadata: { title: 't', description: 'd', hashtags: metadataHashtags },
          hashtags: rootHashtags,
        }) as any
      );
      const script = await service.script({ sourceText: '원문', durationSeconds: 45 });
      return script.hashtags;
    };

    it('falls through an empty root list to uploadMetadata, then to the defaults', async () => {
      // Used to stop at the empty root array and ship nothing.
      expect(await scriptHashtags([], ['#쇼츠'])).toEqual(['#쇼츠']);
      expect(await scriptHashtags([], [])).toEqual(['#shorts', '#snaps']);
      expect(await scriptHashtags(['#직접'], ['#쇼츠'])).toEqual(['#직접']);
    });
  });

  describe('transform hashtag defaults', () => {
    const transformerReturning = (variants: unknown[]) => {
      const ollama = {
        get model() {
          return 'stub-transform';
        },
        provider() {
          return 'ollama' as const;
        },
        async chatJson() {
          return { variants };
        },
        async embed() {
          return [[0]];
        },
      };
      const rag = {
        async search() {
          return [];
        },
      };
      return new SnapsContentTransformService(ollama as any, rag as any);
    };

    const hashtagsFor = async (hashtags: unknown) => {
      const service = transformerReturning([
        { platform: 'instagram', content: '환절기 건강 관리 팁입니다.', hashtags },
      ]);
      const result = await service.transform('jest-org', {
        sourceText: '환절기 건강 관리가 중요합니다.',
        targetPlatforms: ['instagram'],
        useRag: false,
      } as any);
      return result.variants[0].hashtags;
    };

    // [] is truthy, so `found?.hashtags || rule.defaultHashtags` shipped an
    // empty list rather than the platform defaults. The live DeepSeek API
    // returns [] for some platforms on every run.
    it('falls back to the platform defaults when the model returns no hashtags', async () => {
      expect(await hashtagsFor([])).toEqual(['#콘텐츠', '#마케팅', '#인사이트']);
      expect(await hashtagsFor(undefined)).toEqual(['#콘텐츠', '#마케팅', '#인사이트']);
    });

    it('falls back when the model returns hashtags the sanitiser strips to nothing', async () => {
      expect(await hashtagsFor(['###', '   ', '!!!'])).toEqual([
        '#콘텐츠',
        '#마케팅',
        '#인사이트',
      ]);
    });

    it('keeps the model hashtags when it supplies usable ones', async () => {
      expect(await hashtagsFor(['#환절기', '#건강'])).toEqual(['#환절기', '#건강']);
    });
  });

  // normalizeDeck() has an early return for a response whose slides are all
  // unusable. It kept the model's title and caption there but dropped its
  // hashtags, so a model that got everything except the slides right still
  // shipped the fallback's generic tags. The live card news smoke retries past
  // fallback decks, so nothing covered this branch.
  describe('card news keeps what the model got right when its slides are unusable', () => {
    const deckFrom = async (payload: unknown) => {
      const service = new SnapsCardNewsService({
        get model() {
          return 'jest-cardnews';
        },
        provider() {
          return 'ollama' as const;
        },
        async chatJson() {
          return payload;
        },
      } as never);
      return service.script({
        sourceText: '가을 환절기 감기 예방. 습도 유지가 중요합니다. 손을 자주 씻으세요.',
        slideCount: 6,
        templateId: 'bold',
        brandColor: '#2563EB',
      } as never);
    };

    it('keeps the model hashtags when every slide is unusable', async () => {
      const empty = await deckFrom({
        title: '모델 제목',
        slides: [],
        caption: '모델 캡션',
        hashtags: ['#모델', '#가을'],
      });
      expect(empty.hashtags).toEqual(['#모델', '#가을']);
      expect(empty.title).toBe('모델 제목');
      expect(empty.caption).toBe('모델 캡션');

      // Blank slide objects take the same branch as a missing slides array.
      const blank = await deckFrom({
        title: '모델 제목',
        slides: [{}, {}],
        caption: '모델 캡션',
        hashtags: ['#모델'],
      });
      expect(blank.hashtags).toEqual(['#모델']);
    });

    // The reason the branch used the fallback tags in the first place: [] is
    // truthy. Preserving the model's tags must not resurrect that bug.
    it('still falls back to the default hashtags when the model supplies none', async () => {
      const deck = await deckFrom({
        title: '모델 제목',
        slides: [],
        caption: '모델 캡션',
        hashtags: [],
      });
      expect(deck.hashtags.length).toBeGreaterThan(0);
      expect(deck.hashtags).not.toEqual([]);
    });

    it('keeps the requested template and brand colour on that branch', async () => {
      const deck = await deckFrom({ title: '모델 제목', slides: [], caption: '모델 캡션' });
      expect(deck.templateId).toBe('bold');
      expect(deck.brandColor).toBe('#2563EB');
    });
  });

  // fetch() has no default timeout. The Pixelle and Shorts Maker calls used a
  // bare fetch, so a video service that accepted the connection and then went
  // quiet held the backend request open with nothing to distinguish it from a
  // slow render. These tests point the clients at a server that accepts and
  // never answers, so they hang unless the deadline actually fires.
  describe('video service HTTP calls give up instead of hanging', () => {
    let server: Server;
    let origin = '';
    const env = { ...process.env };

    beforeAll(async () => {
      // Accept the socket and never write a response.
      server = createServer(() => undefined);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    afterEach(() => {
      process.env = { ...env };
    });

    it('times out a Shorts Maker render job instead of waiting forever', async () => {
      process.env.SHORTS_MAKER_URL = origin;
      process.env.SHORTS_MAKER_TIMEOUT_MS = '300';

      const started = Date.now();
      const result = await new ShortsMakerClientService().createRenderJob({
        fullAudio: 'jest://audio',
        durationMs: 1000,
        frameDurationsSec: [1],
        visuals: {},
      } as never);
      const elapsed = Date.now() - started;

      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).toContain('timed out');
      expect(elapsed).toBeLessThan(5000);
    });

    it('times out a Pixelle generate call instead of waiting forever', async () => {
      process.env.PIXELLE_VIDEO_URL = origin;
      process.env.PIXELLE_TIMEOUT_MS = '300';
      const shorts = new SnapsShortVideoService(new OfflineOllama() as never);

      const started = Date.now();
      await expect(
        shorts.generate({ sourceText: '타임아웃 확인용 원문입니다.', platform: 'youtube' } as never)
      ).rejects.toThrow(/timed out/);
      expect(Date.now() - started).toBeLessThan(5000);
    });

    // Number(undefined) is NaN and setTimeout treats NaN as 1ms, so an unset or
    // misspelt env would abort every request almost immediately.
    it('ignores a non-numeric timeout env instead of aborting instantly', () => {
      expect(snapsTimeoutMs(undefined, 120000)).toBe(120000);
      expect(snapsTimeoutMs('', 120000)).toBe(120000);
      expect(snapsTimeoutMs('abc', 120000)).toBe(120000);
      expect(snapsTimeoutMs('0', 120000)).toBe(120000);
      expect(snapsTimeoutMs('-5', 120000)).toBe(120000);
      expect(snapsTimeoutMs('300', 120000)).toBe(300);
    });
  });

  // The per-platform attachment clamp in buildPostValues() is the backstop every
  // non-card-news path hits: shorts, plain transforms, and a direct
  // /snaps/schedule-variants call. It used to trim silently, so an operator who
  // attached ten images to an X post got a successful schedule and four images,
  // with nothing anywhere saying the other six were dropped.
  describe('the attachment clamp says what it dropped', () => {
    const buildWith = (platform: string, count: number) =>
      buildSnapsPublishingPayload({
        variants: [
          {
            platform,
            label: platform,
            content: '본문입니다.',
            hashtags: [],
            media: Array.from({ length: count }, (_, index) => ({
              id: `m${index}`,
              path: `https://cdn.example.com/i${index}.png`,
            })),
            publishMode: 'schedule',
          },
        ],
        integrations: [{ platform, integrationId: `int-${platform}` }],
        publishDate: new Date().toISOString(),
        scheduleType: 'schedule',
      } as never);

    it('warns with the platform, the limit and the number dropped', () => {
      const limit = snapsPlatformRules.x.mediaLimit as number;
      const built = buildWith('x', limit + 6);
      const attached = (built.payload.posts[0].value[0] as { image: unknown[] }).image;

      expect(attached).toHaveLength(limit);
      const warning = built.warnings.find((entry) => entry.includes('첨부'));
      expect(warning).toBeDefined();
      expect(warning).toContain('x');
      expect(warning).toContain(String(limit));
      // The count dropped, not just "some were dropped".
      expect(warning).toContain('6');
    });

    it('stays quiet when nothing is dropped', () => {
      const limit = snapsPlatformRules.x.mediaLimit as number;
      const exact = buildWith('x', limit);
      expect(
        exact.warnings.filter((entry) => entry.includes('첨부'))
      ).toHaveLength(0);

      // threads carries no mediaLimit, so no clamp and no warning.
      expect(snapsPlatformRules.threads.mediaLimit).toBeUndefined();
      const unlimited = buildWith('threads', 10);
      expect(
        (unlimited.payload.posts[0].value[0] as { image: unknown[] }).image
      ).toHaveLength(10);
      expect(
        unlimited.warnings.filter((entry) => entry.includes('첨부'))
      ).toHaveLength(0);
    });
  });

  // The card news builder reported its attachment trim but not the two trims
  // that rewrite what the operator actually wrote. X caps at 280 characters and
  // one hashtag, so a 431-character caption went out as a fragment cut
  // mid-sentence and 19 of 20 tags vanished, from a run reported as successful.
  describe('card news reports the caption and hashtag it trims', () => {
    const buildWith = (captionLength: number, tagCount: number) =>
      buildSnapsCardNewsVariants({
        title: '환절기 건강관리',
        caption: '가'.repeat(captionLength),
        hashtags: Array.from({ length: tagCount }, (_, index) => `#태그${index + 1}`),
        slides: [{ id: 's0', path: 'local://s0.png', alt: '슬라이드' }],
      } as never);

    it('names the channel and the length the caption was cut to', () => {
      // X counts units. An all-Hangul caption therefore stops at half the
      // declared 280 - and the warning has to name the length it actually cut
      // to, not the declared one, or the operator checks the post against a
      // number that was never used.
      const xUnits = snapsPlatformRules.x.weightedLimit as number;
      const built = buildWith(xUnits + 151, 1);
      const xVariant = built.variants.find((variant) => variant.platform === 'x');

      expect(snapsWeightedLength(xVariant?.content || '')).toBeLessThanOrEqual(
        xUnits
      );
      expect(xVariant?.content).toHaveLength(xUnits / 2);

      const warning = built.warnings.find((entry) => entry.includes('캡션'));
      expect(warning).toBeDefined();
      expect(warning).toContain(String(xUnits + 151));
      expect(warning).toContain(snapsPlatformRules.x.label);
      expect(warning).toContain(String(xVariant?.content.length));
    });

    it('names every channel that got fewer hashtags than were supplied', () => {
      const built = buildWith(50, 20);
      const warning = built.warnings.find((entry) => entry.includes('해시태그'));
      expect(warning).toBeDefined();
      expect(warning).toContain('20');

      for (const variant of built.variants) {
        const limit = snapsPlatformRules[variant.platform].hashtagLimit ?? 20;
        if (limit < 20) {
          expect(`${variant.platform}: ${warning?.includes(
            snapsPlatformRules[variant.platform].label
          )}`).toBe(`${variant.platform}: true`);
        }
      }
    });

    // Warning on every run would train the operator to ignore the panel.
    it('stays silent when everything fits', () => {
      const built = buildWith(9, 1);
      expect(built.warnings).toHaveLength(0);
    });
  });

  // Every snaps flow builds a per-platform hashtag set and every workspace shows
  // it beside the variant, but this builder only ever published variant.content.
  // Card news and shorts posts therefore went out with none of their tags, and
  // the transform's model path did too - only the offline fallback, which writes
  // its tags inline, happened to publish any.
  describe('hashtags reach the published post', () => {
    const publish = (variant: Record<string, unknown>) => {
      const built = buildSnapsPublishingPayload({
        variants: [{ media: [], publishMode: 'schedule', ...variant }],
        integrations: [
          { platform: variant.platform, integrationId: `int-${variant.platform}` },
        ],
        publishDate: new Date().toISOString(),
        scheduleType: 'schedule',
      } as never);
      const segments = (built.payload.posts[0]?.value || []) as Array<{ content: string }>;
      return { built, text: segments.map((segment) => segment.content).join('\n') };
    };

    it('publishes the tags the workspace showed', () => {
      const hashtags = ['#환절기', '#건강관리', '#면역력'];
      const { text } = publish({
        platform: 'instagram',
        label: 'Instagram',
        content: '환절기 건강관리 캡션입니다.',
        hashtags,
      });
      for (const tag of hashtags) {
        expect(`${tag}: ${text.includes(tag)}`).toBe(`${tag}: true`);
      }
    });

    // The transform cleans its own tags; card news, shorts and a direct
    // /snaps/schedule-variants call hand this builder whatever they hold. Without
    // sanitising here a bare `환절기` published as plain text, a lone `#` and a
    // raw `123` went out as-is, and the same tag twice published twice.
    it('sanitises whatever the caller offers as hashtags', () => {
      const tagsOf = (text: string) =>
        text.split(/\s+/).filter((token) => token.startsWith('#'));

      expect(
        tagsOf(
          publish({
            platform: 'instagram',
            label: 'Instagram',
            content: '본문입니다.',
            hashtags: ['환절기', '건강'],
          }).text
        )
      ).toEqual(['#환절기', '#건강']);

      expect(
        tagsOf(
          publish({
            platform: 'instagram',
            label: 'Instagram',
            content: '본문입니다.',
            hashtags: ['#건강', '#건강'],
          }).text
        )
      ).toEqual(['#건강']);

      // Junk must not reach the post at all - not even as a stray '#'.
      const junk = publish({
        platform: 'instagram',
        label: 'Instagram',
        content: '본문입니다.',
        hashtags: ['', '   ', '#'],
      });
      expect(junk.text).toBe('본문입니다.');
    });

    it('clamps to the platform hashtag limit and says how many it dropped', () => {
      const limit = snapsPlatformRules.x.hashtagLimit as number;
      const supplied = ['#a', '#b', '#c'];
      const { built, text } = publish({
        platform: 'x',
        label: 'X',
        content: '본문입니다.',
        hashtags: supplied,
      });

      expect(text.split(/\s+/).filter((token) => token.startsWith('#'))).toHaveLength(
        limit
      );
      const warning = built.warnings.find((entry) => entry.includes('해시태그'));
      expect(warning).toBeDefined();
      expect(warning).toContain(String(supplied.length - limit));
    });

    // Skipping tags with body.includes() dropped any tag that was a prefix of
    // another: a body carrying #건강관리 swallowed a separate #건강 and it never
    // published. Korean tags overlap like that constantly.
    it('publishes a tag that is only a prefix of another one', () => {
      const publishedTags = (text: string) =>
        text.split(/\s+/).filter((token) => token.startsWith('#'));

      const forward = publish({
        platform: 'instagram',
        label: 'Instagram',
        content: '오늘의 팁입니다.\n\n#건강관리',
        hashtags: ['#건강', '#건강관리'],
      });
      expect(publishedTags(forward.text).sort()).toEqual(['#건강', '#건강관리']);

      const reverse = publish({
        platform: 'instagram',
        label: 'Instagram',
        content: '오늘의 팁입니다.\n\n#건강',
        hashtags: ['#건강', '#건강관리'],
      });
      expect(publishedTags(reverse.text).sort()).toEqual(['#건강', '#건강관리']);
    });

    it('treats a tag followed by punctuation as already present', () => {
      const { text } = publish({
        platform: 'instagram',
        label: 'Instagram',
        content: '팁입니다 #건강.',
        hashtags: ['#건강'],
      });
      expect(text.split(/\s+/).filter((token) => token.startsWith('#'))).toHaveLength(1);
    });

    it('does not repeat tags the body already carries', () => {
      const { text } = publish({
        platform: 'instagram',
        label: 'Instagram',
        content: '본문입니다.\n\n#환절기 #건강',
        hashtags: ['#환절기', '#건강'],
      });
      expect(text.match(/#환절기/g)).toHaveLength(1);
      expect(text.match(/#건강(?!관리)/g)).toHaveLength(1);
    });

    // Cutting the operator's words to make room for hashtags is the worse of the
    // two failures, so the body wins and the dropped tags are reported.
    it('keeps the body intact and reports the tags when they do not fit', () => {
      // A body that exactly fills X's budget. X counts units, so that is 140
      // Hangul characters, not 280 - a 280 character body is 560 units and
      // this builder now clamps it, which is a different behaviour from the
      // one under test here.
      const limit = snapsPlatformRules.x.weightedLimit as number;
      const body = '가'.repeat(limit / 2);
      expect(snapsWeightedLength(body)).toBe(limit);

      const { built, text } = publish({
        platform: 'x',
        label: 'X',
        content: body,
        hashtags: ['#환절기'],
      });

      expect(text).toBe(body);
      expect(snapsWeightedLength(text)).toBe(limit);
      const warning = built.warnings.find((entry) => entry.includes('해시태그'));
      expect(warning).toBeDefined();
      expect(warning).toContain('X');
      expect(warning).toContain(String(limit));
    });

    // The backstop itself: a caller-supplied variant that goes straight to
    // /snaps/schedule-variants never passed through the transform or the card
    // news builder, so this is the only thing between it and the platform. It
    // clamped to 280 characters, which X counts as 560 and refuses.
    it('clamps a caller-supplied X body to what X counts', () => {
      const limit = snapsPlatformRules.x.weightedLimit as number;
      const { text } = publish({
        platform: 'x',
        label: 'X',
        content: '가'.repeat(400),
        hashtags: [],
      });
      expect(snapsWeightedLength(text)).toBeLessThanOrEqual(limit);
      expect(`characters: ${text.length}`).toBe(`characters: ${limit / 2}`);
    });

    it('never pushes a post past its platform length limit', () => {
      for (const platform of snapsTargetPlatforms) {
        const rule = snapsPlatformRules[platform];
        const { text } = publish({
          platform,
          label: rule.label,
          content: '가'.repeat(Math.max(0, rule.maxLength - 10)),
          hashtags: ['#환절기', '#건강관리', '#면역력'],
          // Naver Cafe is skipped outright without these, which would leave the
          // loop asserting nothing for that platform.
          ...(platform === 'naver-cafe'
            ? { settings: { clubId: 'club', menuId: 'menu', subject: '제목' } }
            : {}),
        });
        expect(`${platform}: ${text.length <= rule.maxLength}`).toBe(`${platform}: true`);
      }
    });

    it('leaves a variant with no hashtags exactly as it was', () => {
      const { built, text } = publish({
        platform: 'instagram',
        label: 'Instagram',
        content: '태그 없는 본문입니다.',
        hashtags: [],
      });
      expect(text).toBe('태그 없는 본문입니다.');
      expect(built.warnings.filter((entry) => entry.includes('해시태그'))).toHaveLength(0);
    });
  });

  // A schedule-mode variant whose platform has no connected channel is filtered
  // out before any per-variant check runs, so it was only ever explained by the
  // summary that fires when NOTHING could be scheduled. With one platform
  // succeeding, the operator picked four channels, one posted, and the rest
  // vanished from a run reported as successful.
  describe('the builder explains every platform it drops', () => {
    const build = (
      variants: Array<Record<string, unknown>>,
      integrations: Array<{ platform: string; integrationId: string }>
    ) =>
      buildSnapsPublishingPayload({
        variants: variants.map((variant) => ({
          content: '본문입니다.',
          hashtags: [],
          media: [],
          publishMode: 'schedule',
          ...variant,
        })),
        integrations,
        publishDate: new Date().toISOString(),
        scheduleType: 'schedule',
      } as never);

    it('names an unconnected platform even when another one succeeds', () => {
      const built = build(
        [
          { platform: 'instagram', label: 'Instagram' },
          { platform: 'linkedin', label: 'LinkedIn' },
        ],
        [{ platform: 'instagram', integrationId: 'int-ig' }]
      );

      expect(built.schedulable.map((variant) => variant.platform)).toEqual(['instagram']);
      const warning = built.warnings.find((entry) => entry.includes('연결된 채널이 없어'));
      expect(warning).toBeDefined();
      expect(warning).toContain('LinkedIn');
      expect(warning).not.toContain('Instagram');
    });

    it('says nothing when every requested platform is connected', () => {
      const built = build(
        [
          { platform: 'instagram', label: 'Instagram' },
          { platform: 'linkedin', label: 'LinkedIn' },
        ],
        [
          { platform: 'instagram', integrationId: 'int-ig' },
          { platform: 'linkedin', integrationId: 'int-li' },
        ]
      );

      expect(built.schedulable).toHaveLength(2);
      expect(built.warnings).toHaveLength(0);
    });

    // Assist platforms have their own warning; they must not be reported twice.
    it('does not count an assist platform as unconnected', () => {
      const built = build(
        [
          { platform: 'instagram', label: 'Instagram' },
          { platform: 'kakao-talk', label: 'KakaoTalk', publishMode: 'assist' },
        ],
        [{ platform: 'instagram', integrationId: 'int-ig' }]
      );

      expect(
        built.warnings.filter((entry) => entry.includes('KakaoTalk'))
      ).toHaveLength(1);
    });
  });

  // The card news service answers 200 whether the model produced the deck or it
  // degraded to the deterministic template one, and the deck carried nothing to
  // tell them apart: the workspace reported both as "생성했습니다" and the live
  // smoke had to guess by matching '포인트 N' headings.
  describe('the card news deck says which path built it', () => {
    const deckFrom = (answer: () => unknown) =>
      new SnapsCardNewsService({
        get model() {
          return 'jest-cardnews';
        },
        provider() {
          return 'ollama' as const;
        },
        async chatJson() {
          return answer();
        },
      } as never).script({
        sourceText: '첫 문장입니다. 둘째 문장입니다. 셋째 문장입니다.',
        slideCount: 5,
        templateId: 'bold',
        brandColor: '#2563EB',
      } as never);

    it('labels a deck built from the model response', async () => {
      const deck = await deckFrom(() => ({
        title: '제목',
        caption: '캡션',
        hashtags: ['#태그'],
        slides: [
          { heading: '가', body: '나' },
          { heading: '다', body: '라' },
          { heading: '마', body: '바' },
          { heading: '사', body: '아' },
        ],
      }));
      expect(deck.provider).toBe('ollama');
    });

    it('labels the deterministic deck when the model call fails', async () => {
      const deck = await deckFrom(() => {
        throw new Error('model down');
      });
      expect(deck.provider).toBe('rule-fallback');
      // The label has to agree with what was actually produced.
      expect(deck.slides.some((slide) => /^포인트 \d+$/.test(slide.heading))).toBe(true);
    });

    // Unusable slides take the early return, which spreads the fallback deck -
    // its slides are template output, so it carries the fallback label too.
    it('labels a deck whose slides were all unusable', async () => {
      const deck = await deckFrom(() => ({
        title: '제목',
        caption: '캡션',
        hashtags: ['#태그'],
        slides: [],
      }));
      expect(deck.provider).toBe('rule-fallback');
    });
  });

  // Same gap the card news deck had: script() answers 200 whether the model
  // wrote the storyboard or it degraded to the deterministic script, and the
  // result carried nothing to tell them apart.
  describe('the shorts script says which path built it', () => {
    const scene = {
      scene: 1,
      startSecond: 0,
      endSecond: 10,
      visual: '시각',
      narration: '나레이션',
      overlayText: '자막',
      pixellePrompt: 'prompt',
    };
    const scriptFrom = (answer: () => unknown) =>
      new SnapsShortVideoService({
        get model() {
          return 'jest-shorts';
        },
        provider() {
          return 'ollama' as const;
        },
        async chatJson() {
          return answer();
        },
      } as never).script({
        sourceText: '원문입니다.',
        durationSeconds: 30,
        platform: 'youtube',
      } as never);

    it('labels a script built from the model storyboard', async () => {
      const script = await scriptFrom(() => ({
        title: '모델 제목',
        caption: '캡션',
        hashtags: ['#a'],
        storyboard: [
          scene,
          { ...scene, scene: 2, startSecond: 10, endSecond: 20 },
          { ...scene, scene: 3, startSecond: 20, endSecond: 30 },
        ],
      }));
      expect(script.provider).toBe('ollama');
      expect(script.title).toBe('모델 제목');
    });

    // The storyboard is the substance of a shorts script. With none, everything
    // returned is the deterministic script wearing the model's title.
    it('labels a response that carried no storyboard as a fallback', async () => {
      const script = await scriptFrom(() => ({
        title: '모델 제목',
        caption: '캡션',
        hashtags: ['#a'],
      }));
      expect(script.provider).toBe('rule-fallback');
    });

    it('labels the deterministic script when the model call fails', async () => {
      const script = await scriptFrom(() => {
        throw new Error('model down');
      });
      expect(script.provider).toBe('rule-fallback');
      expect(script.title).toContain('snaps');
    });
  });

  // Completing the label the transform, card news deck and shorts script carry.
  // Both of these answer 200 whether the model wrote the text or the service
  // degraded to its deterministic output, and the live smoke had to guess by
  // comparing the summary to the insights joined together.
  describe('the report and inbox summary say which path built them', () => {
    const metrics = [
      {
        platform: 'instagram',
        metricKey: 'impressions',
        metricValue: 1200,
        collectedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        platform: 'instagram',
        metricKey: 'impressions',
        metricValue: 1800,
        collectedAt: '2026-09-08T00:00:00.000Z',
      },
    ];
    const items = [
      { platform: 'instagram', content: '배터리는 얼마나 가나요?' },
      { platform: 'threads', content: '배송이 늦어 불편했어요.' },
    ];
    const client = (answer: () => unknown) =>
      ({
        get model() {
          return 'jest-labels';
        },
        provider() {
          return 'ollama' as const;
        },
        async chatJson() {
          return answer();
        },
      } as never);
    const answering = () => ({
      summary: '모델이 쓴 요약입니다.',
      highlights: ['첫 번째', '두 번째'],
      replySuggestions: [{ target: 'question', reply: '답변 초안' }],
    });
    const throwing = () => {
      throw new Error('model down');
    };

    it('labels a report whose summary came from the model', async () => {
      const report = await new SnapsReportGeneratorService(client(answering)).generate({
        title: '보고서',
        metrics,
      } as never);
      expect((report as { provider?: string }).provider).toBe('ollama');
      // The label has to agree with the text: the deterministic summary is
      // exactly the insights joined by a space.
      expect(report.summary.trim()).not.toBe(report.insights.join(' ').trim());
    });

    it('labels a report that fell back to the deterministic summary', async () => {
      const report = await new SnapsReportGeneratorService(client(throwing)).generate({
        title: '보고서',
        metrics,
      } as never);
      expect((report as { provider?: string }).provider).toBe('rule-fallback');
      expect(report.summary.trim()).toBe(report.insights.join(' ').trim());
    });

    it('labels the feedback summary on both paths', async () => {
      const answered = await new SnapsFeedbackInboxService(client(answering)).summarize(
        'jest-org',
        { items } as never
      );
      expect((answered as { provider?: string }).provider).toBe('ollama');

      const fellBack = await new SnapsFeedbackInboxService(client(throwing)).summarize(
        'jest-org',
        { items } as never
      );
      expect((fellBack as { provider?: string }).provider).toBe('rule-fallback');
      // The fallback still has to be a usable summary, not an empty shell.
      expect(fellBack.total).toBe(items.length);
    });
  });

  // The plan is what picks the target channels, the schedule and whether card
  // news and shorts are produced. When the model call fails the planner falls
  // back to keyword matching, which decides all of that by rules - and the
  // result was indistinguishable from an understood command.
  describe('the agent plan says which path decided it', () => {
    const planFrom = async (answer: () => unknown) => {
      const client = {
        get model() {
          return 'jest-planner';
        },
        provider() {
          return 'ollama' as const;
        },
        async chatJson() {
          return answer();
        },
        async embed() {
          return [[0]];
        },
      } as never;
      const rag = { async search() { return []; } } as never;
      const planner = new SnapsCommandPlannerService(
        client,
        new SnapsContentTransformService(client, rag),
        new SnapsShortVideoService(client),
        new SnapsCardNewsService(client)
      );
      const prepared = await planner.prepare('jest-org', {
        command: '인스타그램과 스레드에 올릴 글로 정리하고 카드뉴스도 만들어줘.',
        useRag: false,
      } as never);
      return prepared.plan;
    };

    it('labels a plan the model produced', async () => {
      const plan = await planFrom(() => ({
        targetPlatforms: ['instagram', 'threads'],
        includeCardNews: true,
        sourceText: '원문입니다.',
        tone: '친근하게',
        variants: [],
      }));
      expect(plan.provider).toBe('ollama');
    });

    it('labels a plan that keyword matching produced', async () => {
      const plan = await planFrom(() => {
        throw new Error('model down');
      });
      expect(plan.provider).toBe('rule-fallback');
      // The fallback still has to produce a usable plan, not an empty one.
      expect(plan.targetPlatforms.length).toBeGreaterThan(0);
      expect(plan.needsConfirmation).toBe(true);
    });
  });

  // The JSON stores read with `catch { return [] }`, which is right for a file
  // that does not exist yet and wrong for one that does. A truncated file reads
  // as "no entries" and the very next record() writes `[newEntry, ...[]]` over
  // it: measured at three entries, corrupt, write a fourth, and the earlier
  // bytes were gone from disk for good.
  describe('a damaged snaps store is preserved instead of overwritten', () => {
    const dataDir = path.join(
      os.tmpdir(),
      `snaps-store-spec-${process.pid}`
    );
    const originalDataDir = process.env.SNAPS_DATA_DIR;

    beforeEach(async () => {
      await fsp.rm(dataDir, { recursive: true, force: true });
      await fsp.mkdir(dataDir, { recursive: true });
      process.env.SNAPS_DATA_DIR = dataDir;
    });

    afterAll(async () => {
      if (originalDataDir === undefined) {
        delete process.env.SNAPS_DATA_DIR;
      } else {
        process.env.SNAPS_DATA_DIR = originalDataDir;
      }
      await fsp.rm(dataDir, { recursive: true, force: true });
    });

    const filesIn = async (match: string) =>
      (await fsp.readdir(dataDir)).filter((name) => name.includes(match));

    it('keeps the readable bytes of a corrupt activity log', async () => {
      const service = new SnapsActivityLogService();
      const org = 'corrupt-org';
      for (const title of ['entry 1', 'entry 2', 'entry 3']) {
        await service.record(org, { type: 'transform', title, detail: {} } as never);
      }

      const [name] = await filesIn(`${org}.activity-log.json`);
      const file = path.join(dataDir, name);
      const healthy = await fsp.readFile(file, 'utf8');
      await fsp.writeFile(file, healthy.slice(0, Math.floor(healthy.length / 2)), 'utf8');

      // A file it cannot parse still reads as empty - the workspace shows an
      // empty list rather than an error.
      expect(await service.list(org)).toHaveLength(0);

      await service.record(org, { type: 'transform', title: 'entry 4', detail: {} } as never);

      const quarantined = await filesIn('.corrupt-');
      expect(quarantined).toHaveLength(1);
      const preserved = await fsp.readFile(path.join(dataDir, quarantined[0]), 'utf8');
      // Whatever survived the truncation is still on disk.
      expect(preserved.length).toBeGreaterThan(0);
      expect(preserved).toContain('entry 3');
      expect(await service.list(org)).toHaveLength(1);
    });

    // Quarantining on every write would litter the data directory and rename
    // files out from under a healthy deployment.
    it('leaves a healthy store alone', async () => {
      const service = new SnapsActivityLogService();
      const org = 'healthy-org';
      for (const title of ['first', 'second', 'third']) {
        await service.record(org, { type: 'transform', title, detail: {} } as never);
      }

      expect(await filesIn('.corrupt-')).toHaveLength(0);
      expect(await service.list(org)).toHaveLength(3);
    });

    // The store file name was organizationId.replace(/[^a-zA-Z0-9_-]/g, '_'),
    // which is not injective: "org.1" and "org_1" both become "org_1", so two
    // organisations read and wrote one file. Organisation ids are UUIDs today so
    // nothing is replaced and it cannot happen - but that is a property of the
    // Prisma schema, a long way from the store, and an imported id or a slug
    // would turn it into a silent cross-tenant leak.
    it('keeps two organisations apart when their ids escape to the same string', async () => {
      const service = new SnapsActivityLogService();

      for (const [left, right] of [
        ['org_1', 'org.1'],
        ['org_1', 'org:1'],
        ['a/b', 'a.b'],
      ]) {
        await service.record(left, {
          type: 'transform',
          title: `left ${left}`,
          detail: {},
        } as never);
        await service.record(right, {
          type: 'transform',
          title: `right ${right}`,
          detail: {},
        } as never);

        const leftTitles = (await service.list(left)).map((entry) => entry.title);
        const rightTitles = (await service.list(right)).map((entry) => entry.title);
        expect(`${left}|${right}: ${leftTitles.some((t) => t.startsWith('right'))}`).toBe(
          `${left}|${right}: false`
        );
        expect(`${left}|${right}: ${rightTitles.some((t) => t.startsWith('left'))}`).toBe(
          `${left}|${right}: false`
        );
      }
    });

    // An id that needs no escaping has to keep the name it already has, or an
    // existing deployment stops finding its own files.
    it('leaves a UUID organisation id file name untouched', async () => {
      const uuid = 'a3f1c2d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d';
      expect(snapsOrgFileKey(uuid)).toBe(uuid);

      const service = new SnapsActivityLogService();
      await service.record(uuid, {
        type: 'transform',
        title: '기존 배포',
        detail: {},
      } as never);
      const files = (await fsp.readdir(dataDir)).filter((name) => name.startsWith(uuid));
      expect(files).toEqual([`${uuid}.activity-log.json`]);
    });

    // Every store reads the whole file, changes it in memory and writes it back.
    // Two concurrent requests for one organisation therefore both read N entries
    // and both wrote N+1: measured at 20 concurrent writes, 1 survived. On
    // Windows the colliding renames also failed outright with EPERM.
    it('keeps every entry when writes arrive concurrently', async () => {
      const service = new SnapsActivityLogService();
      const org = 'concurrent-org';
      const count = 20;

      await Promise.all(
        Array.from({ length: count }, (_, index) =>
          service.record(org, {
            type: 'transform',
            title: `entry ${index}`,
            detail: {},
          } as never)
        )
      );

      const kept = await service.list(org);
      expect(kept).toHaveLength(count);
      expect(new Set(kept.map((entry) => entry.title)).size).toBe(count);
      // A failed rename used to leave its temp file behind for good.
      expect((await fsp.readdir(dataDir)).filter((n) => n.endsWith('.tmp'))).toEqual([]);
    });

    it('keeps every RAG example when writes arrive concurrently', async () => {
      const store = new SnapsVectorStoreService();
      const org = 'concurrent-rag';
      const count = 20;

      await Promise.all(
        Array.from({ length: count }, (_, index) =>
          store.addExample(org, {
            platform: 'instagram',
            content: `예시 ${index} 입니다.`,
          } as never)
        )
      );

      expect(await store.listExamples(org)).toHaveLength(count);
    });

    // The public methods hold the per-file lock across the whole read-modify-
    // write. Taking it again inside the write would wait on a lock the same call
    // already owns, which hung every store until it was removed.
    it('does not deadlock when a locked method writes', async () => {
      const library = new SnapsSourceLibraryService();
      const org = 'deadlock-org';

      // The losing timer is cleared, not abandoned. A pending timer holds the
      // Node event loop open for its whole duration - measured at 3003ms for a
      // 3000ms one - so leaving this one behind made jest report an open handle
      // after a passing run.
      let deadlockTimer: NodeJS.Timeout | undefined;
      const saved = await Promise.race([
        library.saveSource(org, {
          title: '원문',
          sourceText: '교착 상태 확인용 본문입니다. 충분히 깁니다.',
        } as never),
        new Promise((_, reject) => {
          deadlockTimer = setTimeout(
            () => reject(new Error('deadlocked')),
            10000
          );
        }),
      ]).finally(() => {
        if (deadlockTimer) {
          clearTimeout(deadlockTimer);
        }
      });

      expect(saved).toBeTruthy();
      expect(await library.listSources(org)).toHaveLength(1);
    });

    // atomicWrite fills a temp file and renames it into place, which is right -
    // a crash mid-write leaves the previous file intact. But the rename can fail
    // (on Windows, a target another process holds open gives EPERM) and all five
    // copies of this left the temp file on disk for good, one orphan per attempt.
    it('does not leave a temp file behind when the rename fails', async () => {
      const service = new SnapsActivityLogService();
      const org = 'rename-fail-org';
      await service.record(org, { type: 'transform', title: 'first', detail: {} } as never);

      const realRename = fsp.rename;
      let failed = false;
      (fsp as unknown as { rename: unknown }).rename = async () => {
        throw new Error('EPERM: rename blocked');
      };
      try {
        await service.record(org, { type: 'transform', title: 'blocked', detail: {} } as never);
      } catch {
        failed = true;
      } finally {
        (fsp as unknown as { rename: unknown }).rename = realRename;
      }

      // The failure has to surface rather than be swallowed into a silent no-op.
      expect(failed).toBe(true);
      expect((await fsp.readdir(dataDir)).filter((name) => name.endsWith('.tmp'))).toEqual(
        []
      );

      // And the store still works, with the earlier entry intact.
      await service.record(org, { type: 'transform', title: 'after', detail: {} } as never);
      const titles = (await service.list(org)).map((entry) => entry.title);
      expect(titles).toContain('first');
      expect(titles).toContain('after');
      expect(titles).not.toContain('blocked');
    });

    // The report export turns operator-written text into HTML. Every branch of
    // markdownToHtml() escapes today, but a new branch that forgets would put
    // whatever a report title or insight contains straight into the document,
    // and the export is a file people open and share.
    it('never lets report content become markup in the HTML exports', async () => {
      const library = new SnapsSourceLibraryService();
      const saved = await library.saveReport('xss-org', '<script>alert(1)</script>', {
        summary: '"><img src=x onerror=alert(1)>',
        insights: ['<h1 onclick="evil()">클릭</h1>', "'; alert(1); //"],
        actionItems: ['<iframe src="javascript:alert(1)"></iframe>'],
        metrics: [],
        charts: [],
        trends: [],
      } as never);

      // Tags the print template itself emits. Anything else in the output came
      // from the payload above.
      const templateTags = new Set([
        'html', 'head', 'meta', 'title', 'style', 'body', 'main', 'header',
        'section', 'article', 'div', 'span', 'h1', 'h2', 'h3', 'p', 'ul', 'ol',
        'li', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
      ]);
      for (const format of ['html', 'print-html'] as const) {
        const exported = await library.exportReport('xss-org', saved.id, format);
        const body =
          typeof exported === 'string'
            ? exported
            : String((exported as { content?: string })?.content ?? '');
        const injected = [
          ...new Set(
            [...body.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)]
              .map((match) => match[1].toLowerCase())
              .filter((tag) => !templateTags.has(tag))
          ),
        ];
        expect(`${format}: ${JSON.stringify(injected)}`).toBe(`${format}: []`);
        // The payload has to survive as visible text, not vanish.
        expect(body).toContain('&lt;script&gt;');
      }
    });

    // Favourite and rating are the least covered mutations in the agent task
    // store - they are also the only ones that deliberately leave no activity
    // entry, being bookmark state rather than an audit event. That makes a
    // regression here invisible from the history, so pin the behaviour instead.
    it('persists an agent task favourite and rating across service instances', async () => {
      const service = new SnapsAgentTaskService();
      const org = 'agent-flag-org';
      const task = await service.createFromPrepared(org, {
        plan: {
          provider: 'ollama',
          command: '테스트 명령',
          intent: 'prepare-and-confirm',
          sourceText: '원문입니다.',
          tone: '친근하게',
          targetPlatforms: ['instagram'],
          scheduleType: 'draft',
          includeShortVideo: false,
          shortVideoPlatform: 'youtube',
          shortVideoTargetPlatforms: [],
          includeCardNews: false,
          needsConfirmation: true,
          confirmationPolicy: '운영자 확인 필요',
          assumptions: [],
          operatorSummary: [],
          missingInputs: [],
          confirmationChecklist: [],
          marketingStrategy: {},
          executionPlan: [],
        },
        transform: {
          provider: 'ollama',
          model: 'jest',
          variants: [],
          warnings: [],
          ragExamplesUsed: [],
        },
        operation: {},
        warnings: [],
      } as never);

      expect(task.favorite).toBe(false);
      expect(task.rating).toBeUndefined();

      await service.setFavorite(org, task.id, true);
      await service.setRating(org, task.id, 4, '유용했습니다');

      // A second instance reads from disk, so this proves the write landed
      // rather than living in memory.
      const reloaded = await new SnapsAgentTaskService().get(org, task.id);
      expect(reloaded?.favorite).toBe(true);
      expect(reloaded?.rating).toBe(4);

      await service.setFavorite(org, task.id, false);
      expect((await service.get(org, task.id))?.favorite).toBe(false);
    });

    it('refuses a rating outside 1-5 or one that is not a whole number', async () => {
      const service = new SnapsAgentTaskService();
      const org = 'agent-rating-org';
      const task = await service.createFromPrepared(org, {
        plan: {
          provider: 'ollama',
          command: '테스트 명령',
          intent: 'prepare-and-confirm',
          sourceText: '원문입니다.',
          tone: '친근하게',
          targetPlatforms: ['instagram'],
          scheduleType: 'draft',
          includeShortVideo: false,
          shortVideoPlatform: 'youtube',
          shortVideoTargetPlatforms: [],
          includeCardNews: false,
          needsConfirmation: true,
          confirmationPolicy: '운영자 확인 필요',
          assumptions: [],
          operatorSummary: [],
          missingInputs: [],
          confirmationChecklist: [],
          marketingStrategy: {},
          executionPlan: [],
        },
        transform: {
          provider: 'ollama',
          model: 'jest',
          variants: [],
          warnings: [],
          ragExamplesUsed: [],
        },
        operation: {},
        warnings: [],
      } as never);

      for (const rating of [0, 6, 2.5, 'x']) {
        let refused = false;
        try {
          await service.setRating(org, task.id, rating as never, undefined);
        } catch {
          refused = true;
        }
        expect(`rating ${JSON.stringify(rating)}: refused ${refused}`).toBe(
          `rating ${JSON.stringify(rating)}: refused true`
        );
      }
      // A refused rating must not have partially written either.
      expect((await service.get(org, task.id))?.rating).toBeUndefined();
    });

    // The source library holds what the operator wrote themselves, not derived
    // output, so losing it is the worst version of this bug.
    it('keeps the operator source text out of a corrupt library file', async () => {
      const library = new SnapsSourceLibraryService();
      const org = 'library-org';
      await library.saveSource(org, {
        title: '원문 1',
        sourceText: '사용자가 직접 쓴 본문입니다. 충분히 깁니다.',
      } as never);

      const [name] = await filesIn(org);
      const file = path.join(dataDir, name);
      const healthy = await fsp.readFile(file, 'utf8');
      await fsp.writeFile(file, healthy.slice(0, Math.floor(healthy.length / 2)), 'utf8');

      await library.saveSource(org, {
        title: '원문 2',
        sourceText: '두 번째 본문입니다. 충분히 깁니다.',
      } as never);

      const quarantined = await filesIn('.corrupt-');
      expect(quarantined).toHaveLength(1);
      const preserved = await fsp.readFile(path.join(dataDir, quarantined[0]), 'utf8');
      expect(preserved).toContain('사용자가 직접 쓴');
    });

    it('preserves a corrupt RAG example store too', async () => {
      const store = new SnapsVectorStoreService();
      const org = 'rag-org';
      await store.addExample(org, {
        platform: 'instagram',
        content: '예시 본문입니다.',
      } as never);

      const [name] = await filesIn(org);
      const file = path.join(dataDir, name);
      await fsp.writeFile(file, (await fsp.readFile(file, 'utf8')).slice(0, 20), 'utf8');

      await store.addExample(org, {
        platform: 'threads',
        content: '두 번째 예시입니다.',
      } as never);

      expect(await filesIn('.corrupt-')).toHaveLength(1);
    });
  });

  // normalizeTargetPlatforms fell back to a default pair whenever nothing in the
  // caller's list was supported, so transforming for ['facebook', 'myspace']
  // returned Threads and Instagram variants - channels nobody had named -
  // reported as a success. The card news and video normalisers already return an
  // empty selection and let the controller refuse by name.
  describe('a transform for unsupported platforms is refused, not redirected', () => {
    it('uses the defaults only when the caller named nothing', () => {
      expect(normalizeTargetPlatforms(undefined)).toEqual([
        'threads',
        'instagram',
        'youtube',
        'tiktok',
      ]);
      expect(normalizeTargetPlatforms([])).toEqual([
        'threads',
        'instagram',
        'youtube',
        'tiktok',
      ]);
    });

    it('keeps the supported platforms the caller named', () => {
      expect(normalizeTargetPlatforms(['instagram', 'threads'])).toEqual([
        'instagram',
        'threads',
      ]);
      expect(normalizeTargetPlatforms(['INSTAGRAM', ' threads '])).toEqual([
        'instagram',
        'threads',
      ]);
      expect(normalizeTargetPlatforms(['instagram', 'instagram'])).toEqual(['instagram']);
    });

    it('reports an empty selection instead of inventing platforms', () => {
      expect(normalizeTargetPlatforms(['facebook', 'myspace'])).toEqual([]);
      // A list that is only partly supported keeps what it can.
      expect(normalizeTargetPlatforms(['instagram', 'facebook'])).toEqual(['instagram']);
    });
  });

  // Naming only unsupported platforms is refused outright. A partly supported
  // list was the quiet case: asking for ['instagram', 'facebook'] returned
  // Instagram variants and no mention of facebook at all, so an operator who
  // picked two channels got one and was told the run succeeded.
  describe('a platform the request named but snaps dropped is reported', () => {
    const dropWarnings = (warnings: string[]) =>
      warnings.filter((entry) => entry.includes('제외했습니다'));

    it('names the dropped platform on the transform model path', async () => {
      const service = new SnapsContentTransformService(
        {
          get model() {
            return 'jest-drop';
          },
          provider() {
            return 'ollama' as const;
          },
          async chatJson() {
            return {
              variants: [
                { platform: 'instagram', content: '본문입니다.', hashtags: ['#a'] },
              ],
            };
          },
          async embed() {
            return [[0]];
          },
        } as never,
        { async search() { return []; } } as never
      );

      const dropped = await service.transform('jest-org', {
        sourceText: '원문입니다. 충분히 깁니다.',
        targetPlatforms: ['instagram', 'facebook'],
        useRag: false,
      } as never);
      expect(dropped.provider).toBe('ollama');
      expect(dropWarnings(dropped.warnings).join(' ')).toContain('facebook');

      const clean = await service.transform('jest-org', {
        sourceText: '원문입니다. 충분히 깁니다.',
        targetPlatforms: ['instagram'],
        useRag: false,
      } as never);
      expect(dropWarnings(clean.warnings)).toEqual([]);
    });

    // The warning has to survive the degraded run too - putting it on the model
    // path alone would lose it exactly when things are already going wrong.
    it('names the dropped platform on the transform fallback path', async () => {
      const service = new SnapsContentTransformService(
        {
          get model() {
            return 'jest-drop';
          },
          async chatJson(): Promise<never> {
            throw new Error('model down');
          },
          async embed() {
            return [[0]];
          },
        } as never,
        { async search() { return []; } } as never
      );

      const result = await service.transform('jest-org', {
        sourceText: '원문입니다. 충분히 깁니다.',
        targetPlatforms: ['instagram', 'facebook'],
        useRag: false,
      } as never);
      expect(result.provider).toBe('rule-fallback');
      expect(dropWarnings(result.warnings).join(' ')).toContain('facebook');
    });

    it('names the dropped platform for card news and shorts', () => {
      const deck = buildSnapsCardNewsVariants({
        title: '제목',
        caption: '캡션',
        hashtags: [],
        slides: [{ id: 's', path: 'local://s.png', alt: '슬라이드' }],
        targetPlatforms: ['instagram', 'youtube'],
      } as never);
      expect(dropWarnings(deck.warnings).join(' ')).toContain('youtube');
      expect(deck.targetPlatforms).not.toContain('youtube');

      const video = buildSnapsVideoVariants({
        title: '제목',
        caption: '캡션',
        videoUrl: 'https://cdn.example.com/v.mp4',
        targetPlatforms: ['instagram', 'threads'],
      } as never) as unknown as { warnings: string[]; targetPlatforms: string[] };
      expect(dropWarnings(video.warnings).join(' ')).toContain('threads');
      expect(video.targetPlatforms).not.toContain('threads');
    });

    it('stays quiet when every requested platform is supported', () => {
      const deck = buildSnapsCardNewsVariants({
        title: '제목',
        caption: '캡션',
        hashtags: [],
        slides: [{ id: 's', path: 'local://s.png', alt: '슬라이드' }],
        targetPlatforms: ['instagram', 'threads'],
      } as never);
      expect(dropWarnings(deck.warnings)).toEqual([]);

      const video = buildSnapsVideoVariants({
        title: '제목',
        caption: '캡션',
        videoUrl: 'https://cdn.example.com/v.mp4',
        targetPlatforms: ['instagram', 'tiktok'],
      } as never) as unknown as { warnings: string[] };
      expect(dropWarnings(video.warnings)).toEqual([]);
    });
  });

  // toCafeContent exists to sanitise, and striptags only does half the job: it
  // drops tags outside the allowlist but keeps the attributes of the ones it
  // keeps, so `<a href="javascript:alert(1)">` and `<p onclick="alert(1)">` went
  // through to the cafe untouched. This is the last point snaps controls before
  // the post leaves.
  describe('Naver Cafe content is sanitised, not just tag-filtered', () => {
    const sanitise = (message: string) =>
      (
        new NaverCafeProvider() as unknown as {
          toCafeContent(input: string): string;
        }
      ).toCafeContent(message);

    it('strips event handlers from the tags it allows', () => {
      expect(sanitise('<p onclick="alert(1)">문단</p>')).toBe('<p>문단</p>');
      expect(sanitise('<b onmouseover=alert(1)>굵게</b>')).toBe('<b>굵게</b>');
      expect(sanitise("<a href='#' onfocus='evil()'>링크</a>")).not.toContain('onfocus');
    });

    it('defuses script URL schemes on links', () => {
      for (const scheme of ['javascript', 'vbscript', 'data']) {
        const output = sanitise(`<a href="${scheme}:evil()">클릭</a>`);
        expect(`${scheme}: ${output.includes(`${scheme}:`)}`).toBe(`${scheme}: false`);
      }
    });

    // Sanitising must not eat the formatting operators actually use.
    it('keeps ordinary links and formatting', () => {
      expect(sanitise('<a href="https://example.com">정상 링크</a>')).toBe(
        '<a href="https://example.com">정상 링크</a>'
      );
      expect(sanitise('<p>문단</p><br><b>굵게</b>')).toBe('<p>문단</p><br><b>굵게</b>');
      expect(sanitise('<strong>강조</strong>')).toBe('<b>강조</b>');
      expect(sanitise('순수 텍스트 & 앰퍼샌드')).toBe(
        '<p>순수 텍스트 & 앰퍼샌드</p>'
      );
    });

    // A supplied subject was forwarded to the cafe raw while a derived one was
    // stripped, so a variant title carrying markup became the post title as-is.
    it('cleans a supplied subject the same way it cleans a derived one', () => {
      const provider = new NaverCafeProvider() as unknown as {
        makeSubject(message: string): string;
      };

      expect(provider.makeSubject('<b onclick="alert(1)">제목</b><script>x</script>')).toBe(
        '제목x'
      );
      expect(provider.makeSubject('가을 환절기 건강관리')).toBe('가을 환절기 건강관리');
      expect(provider.makeSubject('  제목   여러   공백  ')).toBe('제목 여러 공백');
      expect(provider.makeSubject('')).toBe('snaps 게시글');
      expect(provider.makeSubject('가'.repeat(120))).toHaveLength(80);
    });

    // The provider, not the caller, is the place that guarantees it: post()
    // must not use settings.subject without cleaning it.
    it('routes the settings subject through the cleaner', () => {
      const source = readFileSync(
        join(
          process.cwd(),
          'libraries/nestjs-libraries/src/integrations/social/naver-cafe.provider.ts'
        ),
        'utf8'
      );
      expect(source).toContain('this.makeSubject(settings.subject || post.message)');
      expect(source).not.toContain('settings.subject || this.makeSubject(');
    });

    it('still drops tags outside the allowlist', () => {
      expect(sanitise('<img src=x onerror=alert(1)>')).toBe('');
      expect(sanitise('<script>alert(1)</script>본문')).not.toContain('<script');
    });
  });

  // The individual skip paths each have their own test. This asserts the
  // property behind all of them: a schedulable variant either becomes a post or
  // is named in a warning. Enumerated cases only cover the drops we already know
  // about; this fails for any new one.
  describe('every schedulable variant becomes a post or is named in a warning', () => {
    const variantFor = (platform: string, overrides: Record<string, unknown> = {}) => ({
      platform,
      label:
        snapsPlatformRules[platform as SnapsTargetPlatform]?.label ?? platform,
      content: '예약 대상 본문입니다.',
      hashtags: ['#태그'],
      media: [],
      publishMode: 'schedule',
      ...overrides,
    });

    const check = (
      label: string,
      variants: Array<Record<string, unknown>>,
      integrations: Array<{ platform: string; integrationId: string }>
    ) => {
      const built = buildSnapsPublishingPayload({
        variants,
        integrations,
        publishDate: new Date(Date.now() + 3600_000).toISOString(),
        scheduleType: 'schedule',
      } as never);

      const prepared = (built.schedulable || []).map((variant) => variant.platform);
      const posts = built.payload?.posts?.length ?? 0;
      expect(`${label}: posts ${posts}`).toBe(`${label}: posts ${prepared.length}`);

      const requested = variants
        .filter((variant) => variant.publishMode === 'schedule')
        .map((variant) => String(variant.platform));
      const dropped = requested.filter(
        (platform) => !(prepared as string[]).includes(platform)
      );
      const allWarnings = built.warnings.join(' | ');
      for (const platform of dropped) {
        const rule = snapsPlatformRules[platform as SnapsTargetPlatform];
        const named =
          allWarnings.includes(platform) || (!!rule && allWarnings.includes(rule.label));
        expect(`${label}/${platform}: explained ${named}`).toBe(
          `${label}/${platform}: explained true`
        );
      }
      return { dropped, warnings: built.warnings };
    };

    it('accounts for every variant across the known drop paths', () => {
      const all = snapsTargetPlatforms.map((platform) => variantFor(platform));
      const connected = snapsTargetPlatforms.map((platform) => ({
        platform,
        integrationId: `int-${platform}`,
      }));

      // Every platform connected: assist-only ones and Naver Cafe without its
      // settings are the drops, and both have to be named.
      const everything = check('all platforms', all, connected);
      expect(everything.dropped.length).toBeGreaterThan(0);

      // Nothing connected at all.
      check('no integrations', all, []);

      // One connected, the rest not.
      check('one integration', all, [
        { platform: 'instagram', integrationId: 'int-instagram' },
      ]);

      // Content that cannot form a post.
      check(
        'empty content',
        [variantFor('instagram', { content: '   ', media: [] }), variantFor('threads')],
        connected
      );

      // Naver Cafe with its settings supplied is not a drop at all.
      const complete = check(
        'naver cafe configured',
        [
          variantFor('naver-cafe', {
            settings: { clubId: 'club', menuId: 'menu', subject: '제목' },
          }),
        ],
        connected
      );
      expect(complete.dropped).toEqual([]);
    });
  });

  // The individual clamps each have a test. This asserts the property they add
  // up to: whatever a caller supplies, the post that comes out respects the
  // platform's caption budget, hashtag limit, attachment limit and per-post
  // segment size. Over-limit input on every platform at once, rather than one
  // known case at a time.
  describe('a built post never exceeds its platform limits', () => {
    const build = (platform: SnapsTargetPlatform, overrides: Record<string, unknown>) =>
      buildSnapsPublishingPayload({
        variants: [
          {
            platform,
            label: snapsPlatformRules[platform].label,
            content: '본문입니다.',
            hashtags: [],
            media: [],
            publishMode: 'schedule',
            settings:
              platform === 'naver-cafe'
                ? { clubId: 'club', menuId: 'menu', subject: '제목' }
                : undefined,
            ...overrides,
          },
        ],
        integrations: [{ platform, integrationId: `int-${platform}` }],
        publishDate: new Date(Date.now() + 3600_000).toISOString(),
        scheduleType: 'schedule',
      } as never);

    it('holds for oversized content, hashtags and attachments on every platform', () => {
      for (const platform of snapsTargetPlatforms) {
        const rule = snapsPlatformRules[platform];
        if (rule.publishMode !== 'schedule') {
          continue;
        }

        const built = build(platform, {
          content: '가'.repeat(rule.maxLength + 500),
          hashtags: Array.from({ length: 30 }, (_, index) => `#태그${index}`),
          media: Array.from({ length: 15 }, (_, index) => ({
            id: `m${index}`,
            path: `https://cdn.example.com/i${index}.png`,
          })),
        });

        const segments = (built.payload?.posts?.[0]?.value || []) as Array<{
          content: string;
          image: unknown[];
        }>;
        expect(`${platform}: has a post`).toBe(
          `${platform}: ${segments.length ? 'has a post' : 'no post built'}`
        );

        // Summed, not joined: a chain post is several segments and the
        // separators between them are not content. Joining made a reply
        // chain that exactly fills the budget look 2 characters over.
        const contentLength = segments.reduce(
          (total, segment) => total + segment.content.length,
          0
        );
        expect(`${platform} caption ${contentLength <= rule.maxLength}`).toBe(
          `${platform} caption true`
        );
        const whole = segments.map((segment) => segment.content).join('\n');

        const tags = whole.split(/\s+/).filter((token) => token.startsWith('#'));
        expect(
          `${platform} hashtags ${tags.length <= (rule.hashtagLimit ?? 20)}`
        ).toBe(`${platform} hashtags true`);

        const attachments = segments[0]?.image ?? [];
        expect(
          `${platform} media ${!rule.mediaLimit || attachments.length <= rule.mediaLimit}`
        ).toBe(`${platform} media true`);

        if (rule.postMaxLength) {
          const oversized = segments.filter(
            (segment) => segment.content.length > (rule.postMaxLength as number)
          );
          expect(`${platform} segments over ${rule.postMaxLength}: ${oversized.length}`).toBe(
            `${platform} segments over ${rule.postMaxLength}: 0`
          );
        }
      }
    });
  });

  // buildDefaultSettings() has to satisfy the provider settings DTO that post
  // creation validates against - TikTok needed seven fields beyond privacy_level
  // and X needed who_can_reply_post before this lined up. Static guards check the
  // fields we already know about; this runs the real class-validator, so a DTO
  // that gains a required field fails here instead of at publish time.
  //
  // The settings DTOs are imported individually rather than through
  // CreatePostDto: that pulls in the whole provider registry, including an
  // ESM-only wallet dependency Jest will not parse.
  describe('the built provider settings satisfy their real DTO', () => {
    const dtoFor: Partial<Record<SnapsTargetPlatform, new () => object>> = {
      instagram: InstagramDto,
      youtube: YoutubeSettingsDto,
      tiktok: TikTokDto,
      linkedin: LinkedinDto,
      x: XDto,
      'naver-cafe': NaverCafeDto,
    };

    // Silently skipping an unmapped platform would let a new one - or an
    // existing one that gains a settings DTO - go unchecked. Every schedulable
    // platform is either validated against its DTO or listed here as one the
    // provider registry declares settings-free (threads maps to `None`).
    const settingsFreePlatforms = new Set<SnapsTargetPlatform>(['threads']);

    it('leaves no schedulable platform unchecked', () => {
      const unaccounted = snapsTargetPlatforms.filter(
        (platform) =>
          snapsPlatformRules[platform].publishMode === 'schedule' &&
          !dtoFor[platform] &&
          !settingsFreePlatforms.has(platform)
      );
      expect(`unmapped: ${JSON.stringify(unaccounted)}`).toBe('unmapped: []');
    });

    it('builds only the discriminator for a settings-free platform', () => {
      for (const platform of settingsFreePlatforms) {
        const rule = snapsPlatformRules[platform];
        const built = buildSnapsPublishingPayload({
          variants: [
            {
              platform,
              label: rule.label,
              content: '설정 없는 채널 본문입니다.',
              hashtags: [],
              media: [],
              publishMode: 'schedule',
            },
          ],
          integrations: [{ platform, integrationId: `int-${platform}` }],
          publishDate: new Date(Date.now() + 3600_000).toISOString(),
          scheduleType: 'schedule',
        } as never);

        const settings = built.payload?.posts?.[0]?.settings as Record<string, unknown>;
        expect(`${platform}: ${JSON.stringify(settings)}`).toBe(
          `${platform}: ${JSON.stringify({ __type: platform })}`
        );
      }
    });

    it('validates the settings the builder produces for every mapped platform', async () => {
      const checked: string[] = [];
      for (const platform of snapsTargetPlatforms) {
        const Dto = dtoFor[platform];
        const rule = snapsPlatformRules[platform];
        if (!Dto || rule.publishMode !== 'schedule') {
          continue;
        }

        const built = buildSnapsPublishingPayload({
          variants: [
            {
              platform,
              label: rule.label,
              content: '설정 검증용 본문입니다.',
              hashtags: ['#태그'],
              media: [],
              publishMode: 'schedule',
              title: '제목',
              settings:
                platform === 'naver-cafe'
                  ? { clubId: 'club', menuId: 'menu', subject: '제목' }
                  : undefined,
            },
          ],
          integrations: [{ platform, integrationId: `int-${platform}` }],
          publishDate: new Date(Date.now() + 3600_000).toISOString(),
          scheduleType: 'schedule',
        } as never);

        const settings = built.payload?.posts?.[0]?.settings as Record<string, unknown>;
        expect(`${platform}: settings built`).toBe(
          `${platform}: ${settings ? 'settings built' : 'no settings'}`
        );

        const errors = await validate(plainToInstance(Dto, settings));
        const failures = errors.map(
          (error) =>
            `${error.property}: ${Object.values(error.constraints || {})[0] ?? 'invalid'}`
        );
        expect(`${platform}: ${JSON.stringify(failures)}`).toBe(`${platform}: []`);
        checked.push(platform);
      }

      // A silently empty loop would make this test prove nothing.
      expect(checked.length).toBeGreaterThanOrEqual(5);
    });
  });

  // The platform picker reached the LLM prompt but not the deterministic
  // fallback, so an offline run handed TikTok and Reels a YouTube "#shorts"
  // tag and a Shorts-branded upload title whichever platform was chosen.
  // The fallback decided which platforms get a title with a hardcoded name
  // test that omitted youtube, and pushed a "Title: ...\n\nDescription:\n"
  // block into the body instead. The publishing builder then derived the
  // YouTube post title from that body, so the title became
  // "Title: 핵심 요약 Shorts Description: ... #shorts".
  describe('platforms that publish a title separately get a real one', () => {
    const offlineTransform = () =>
      new SnapsContentTransformService(
        {
          get model() {
            return 'offline';
          },
          provider() {
            return 'ollama' as const;
          },
          async chatJson() {
            throw new Error('force deterministic fallback');
          },
          async embed() {
            return [[0]];
          },
        } as never,
        { async search() { return []; } } as never
      );

    const transform = (platforms: string[]) =>
      offlineTransform().transform('spec-org', {
        sourceText: '환절기에는 습도를 유지하세요. 손을 자주 씻으세요.',
        targetPlatforms: platforms,
        useRag: false,
      } as never);

    it('gives every requiresTitle platform a title', async () => {
      const withTitle = snapsTargetPlatforms.filter(
        (platform) => snapsPlatformRules[platform].requiresTitle
      );
      expect(withTitle.length).toBeGreaterThan(0);

      const result = await transform([...withTitle]);
      for (const variant of result.variants) {
        expect(`${variant.platform}:${variant.title || ''}`).not.toMatch(/:$/);
      }
    });

    // makeTitle used to be `content.slice(0, 48)`. The model returns title,
    // description and tags in one block, so that slice ran past the first line
    // and put newlines in a field every platform publishes on one line.
    // The rule fallback deck built its title and caption with a plain slice
    // while the slides beside it already clamped on grapheme boundaries. The
    // caption is published, and the variant builder's own clamp is above 300,
    // so a pair broken here reached the post.
    it('clamps the fallback card news title and caption on character boundaries', async () => {
      const service = new SnapsCardNewsService({
        provider: () => 'ollama' as const,
        chatJson: async () => {
          throw new Error('offline');
        },
      } as never);

      const broken: string[] = [];
      for (const [label, limit] of [
        ['title', 60],
        ['caption', 300],
      ] as Array<[string, number]>) {
        for (let pad = limit - 4; pad <= limit + 2; pad += 1) {
          const deck = await service.script({
            sourceText:
              '가'.repeat(pad) + '🧊 환절기 건강 관리 요령을 정리했습니다.',
            slideCount: 3,
          } as never);
          const value = String(
            (deck as unknown as Record<string, unknown>)[label] || ''
          );
          const last = value.charCodeAt(value.length - 1);
          if (last >= 0xd800 && last <= 0xdbff) {
            broken.push(`${label} pad=${pad}`);
          }
        }
      }

      expect(broken).toEqual([]);
    });

    // The reply picker reads three states from one value: a list means the
    // server answered, null means it has not. null is the permissive state -
    // offer every connected channel - so a load that failed silently and reset
    // the value to null widened the picker to channels whose provider has no
    // comment API, and the reply failed later, far from the cause.
    it('offers only commentable channels once the server has answered', () => {
      const channels = [
        { id: 'x-1', disabled: false },
        { id: 'youtube-1', disabled: false },
        { id: 'off-1', disabled: true },
        // Enabled in the channel list but disabled in the answer the server
        // gave: the capability's own flag has to decide, or a channel the
        // server has since turned off stays in the picker.
        { id: 'stale-1', disabled: false },
      ];
      const capabilities = [
        { id: 'x-1', commentable: true, disabled: false },
        { id: 'youtube-1', commentable: false, disabled: false },
        { id: 'off-1', commentable: true, disabled: true },
        { id: 'stale-1', commentable: true, disabled: true },
      ];

      expect(snapsReplyChannels(channels, capabilities).map((c) => c.id)).toEqual(
        ['x-1']
      );

      // Unknown is still permissive - on a first paint it is the only list
      // there is - but it must be reachable only when nothing is known, which
      // is why the failed-load path keeps the last good answer instead of
      // resetting to null.
      expect(snapsReplyChannels(channels, null).map((c) => c.id)).toEqual([
        'x-1',
        'youtube-1',
        'stale-1',
      ]);

      // An empty answer is not the unknown state: the server said no channel
      // takes replies.
      expect(snapsReplyChannels(channels, [])).toEqual([]);
    });

    // Every service reported the literal 'ollama' whichever engine answered,
    // so a DeepSeek run showed "ollama - deepseek-v4-flash" in the workspace
    // beside a health card that said DeepSeek. Measured on the live DeepSeek
    // smoke: the transform said ollama while calling api.deepseek.com.
    it('reports the engine that actually answered', async () => {
      const deepseekLike = {
        get model() {
          return 'deepseek-v4-flash';
        },
        provider() {
          return 'deepseek' as const;
        },
        async chatJson() {
          return {
            variants: [
              {
                platform: 'instagram',
                content: '환절기 건강 관리 요령을 정리했습니다. 실내 습도부터 챙기세요.',
                hashtags: ['#환절기'],
              },
            ],
          };
        },
        async embed() {
          return [[0.1]];
        },
      };

      const transform = new SnapsContentTransformService(
        deepseekLike as never,
        { search: async () => [] } as never
      );
      const result = await transform.transform('provider-org', {
        sourceText: '환절기에는 일교차가 커지면서 면역력이 떨어지기 쉽습니다.',
        targetPlatforms: ['instagram'],
        useRag: false,
      } as never);

      expect(result.provider).toBe('deepseek');

      const cardNews = new SnapsCardNewsService({
        ...deepseekLike,
        async chatJson() {
          return {
            title: '환절기 건강',
            caption: '캡션입니다.',
            hashtags: ['#환절기'],
            slides: [
              { heading: '가', body: '나' },
              { heading: '다', body: '라' },
              { heading: '마', body: '바' },
            ],
          };
        },
      } as never);
      const deck = await cardNews.script({
        sourceText: '환절기 건강 관리. 습도가 중요합니다. 손을 씻으세요.',
        slideCount: 3,
      } as never);

      expect(deck.provider).toBe('deepseek');
    });

    // Found by running the planner against a batch of real Korean commands
    // with DeepSeek, then against the deterministic path: both made the same
    // four mistakes, so the rules were wrong, not the model.
    describe('what a Korean command actually asked for', () => {
      const planner = () =>
        new SnapsCommandPlannerService(
          {} as never,
          {} as never,
          {} as never,
          {} as never
        );
      const platforms = (command: string) =>
        (
          planner() as unknown as {
            detectTargetPlatforms(input: string): string[];
          }
        ).detectTargetPlatforms(command);
      const refuses = (command: string) =>
        (
          planner() as unknown as {
            refusesToPublish(input: string): boolean;
          }
        ).refusesToPublish(command);
      // 2026-09-11 14:00 KST.
      const NOW = new Date('2026-09-11T05:00:00.000Z');
      const at = (command: string) =>
        (
          planner() as unknown as {
            detectPublishDate(
              c: string,
              n: Date,
              offset: number
            ): string | undefined;
          }
        ).detectPublishDate(command, NOW, -540);

      it('drops a channel the command named in order to exclude it', () => {
        expect(platforms('인스타그램 말고 스레드에만 올려줘')).toEqual([
          'threads',
        ]);
        expect(platforms('유튜브 빼고 틱톡이랑 인스타에 올려줘').sort()).toEqual(
          ['instagram', 'tiktok']
        );
      });

      it('reads 카페 as a channel only where a destination follows it', () => {
        expect(platforms('네이버 블로그랑 카페에만 올릴 거야').sort()).toEqual([
          'naver-blog',
          'naver-cafe',
        ]);
        // A common noun in the middle of a topic, not a channel.
        expect(platforms('카페 관련 내용으로 인스타에 올려줘')).toEqual([
          'instagram',
        ]);
      });

      it('hears the ways of saying that nothing should be published', () => {
        for (const command of [
          '예약은 필요 없어',
          '게시는 안 해도 돼',
          '발행하지는 말아줘',
          '초안으로만 저장해줘',
        ]) {
          expect(`${command}:${refuses(command)}`).toBe(`${command}:true`);
        }
        for (const command of [
          '지금 바로 올려줘',
          '내일 오전 9시에 예약해줘',
          '유튜브에 업로드해줘',
        ]) {
          expect(`${command}:${refuses(command)}`).toBe(`${command}:false`);
        }
      });

      it('never resolves a time-only command into the past', () => {
        // 밤 12시 is the midnight that ends the named day. Read as 00:00 of
        // that day it landed fourteen hours behind the clock.
        expect(at('오늘 밤 12시에 올려줘')).toBe('2026-09-11T15:00:00.000Z');
        expect(at('내일 밤 12시에 올려줘')).toBe('2026-09-12T15:00:00.000Z');
        // A time of day with no day named, already gone: the next one.
        expect(at('오전 9시에 올려줘')).toBe('2026-09-12T00:00:00.000Z');
        // Still ahead today, so today.
        expect(at('오후 6시에 올려줘')).toBe('2026-09-11T09:00:00.000Z');
        // A named day is left alone even when it is behind us - that is what
        // was asked for.
        expect(at('오늘 새벽 12시에 올려줘')).toBe('2026-09-10T15:00:00.000Z');
      });
    });

    // Ten labelled Korean comments through the deterministic classifier put
    // four in the wrong bucket, and each one cost the operator something: a
    // paid-collaboration enquiry and a customer complaint both landed in spam,
    // a question with a link landed in spam, and a compliment that used the
    // word 문제없이 landed in complaints.
    // classify() carries `문제(?!\s*없)` with a comment saying why, and the
    // conversion-signal list twenty lines below it did not. Measured:
    // `문제없이 잘 쓰고 있어요. 감사합니다` came back as complaint-risk, so a
    // satisfied customer was flagged for attention in the inbox and counted in
    // the summary's signals. The same negation, the same two spellings.
    it('does not flag a satisfied comment as a complaint risk', () => {
      const inbox = new SnapsFeedbackInboxService({} as never);
      const signals = (content: string) =>
        (
          inbox as unknown as {
            detectConversionSignals(input: string): string[];
          }
        ).detectConversionSignals(content);

      for (const content of [
        '문제없이 잘 쓰고 있어요. 감사합니다',
        '문제 없이 배송 왔어요 최고',
      ]) {
        expect(`${content} -> ${signals(content).join(',')}`).toBe(
          `${content} -> `
        );
      }

      // A real complaint still raises it, or the guard has eaten the signal.
      expect(signals('제품에 문제가 있습니다')).toContain('complaint-risk');
      expect(signals('가입 절차가 복잡해서 불편했어요')).toContain(
        'complaint-risk'
      );

      // The two lists have to agree: a comment the classifier calls praise
      // must not carry a complaint signal beside it.
      const classify = (content: string) =>
        (inbox as unknown as { classify(input: string): string }).classify(
          content
        );
      for (const content of [
        '문제없이 잘 쓰고 있어요. 감사합니다',
        '문제 없이 배송 왔어요 최고',
      ]) {
        expect(`${classify(content)} + ${signals(content).length}`).toBe(
          'praise + 0'
        );
      }
    });

    it('files a Korean comment in the bucket it belongs to', () => {
      const inbox = new SnapsFeedbackInboxService({} as never);
      const classify = (content: string) =>
        (inbox as unknown as { classify(input: string): string }).classify(
          content
        );

      const cases: Array<[string, string]> = [
        // 문제 appears inside 문제없이, which says the opposite.
        ['문제없이 잘 쓰고 있어요. 감사합니다', 'praise'],
        ['문제 없이 배송 왔어요 최고', 'praise'],
        // Bare 광고 used to be a spam signal, ahead of the collaboration list
        // that has 광고 문의 in it - so the enquiry could never be reached.
        ['광고 문의 드립니다. 제휴 가능할까요?', 'collaboration'],
        // 광고 문의 and nothing else: with 제휴 alongside it the case passes
        // even when the 광고 문의 pattern is gone.
        ['광고 문의 남깁니다', 'collaboration'],
        ['협업 문의드려요', 'collaboration'],
        // and the same bare 광고 buried a complaint.
        ['광고가 너무 많아서 불편해요', 'complaint'],
        // A link on its own is not spam.
        ['이 제품 링크 https://example.com 이거 맞나요?', 'question'],
        // A link alongside promotional wording is.
        ['무료 코인 받아가세요 https://scam.example', 'spam'],
        ['바카라 무료 가입 지금', 'spam'],
        ['배송이 너무 늦어서 실망했어요', 'complaint'],
        ['정말 유용한 정보 감사합니다', 'praise'],
        ['가격이 어떻게 되나요?', 'question'],
        // Promotional words appear in ordinary comments too, so they are a
        // spam signal only next to a link.
        ['무료 배송은 언제 시작하나요?', 'question'],
        ['가입 절차가 복잡해서 불편했어요', 'complaint'],
        ['그냥 지나가다 봤어요', 'other'],
      ];

      for (const [content, expected] of cases) {
        expect(`${content} -> ${classify(content)}`).toBe(
          `${content} -> ${expected}`
        );
      }
    });

    // Two copies of the sentence split lived in card-news.service.ts and had
    // already drifted - one listed \n in its lookbehind, the other did not -
    // and neither worked on the text operators paste.
    it('splits Korean source text the way it was written', () => {
      // The \n in the old lookbehind was dead: the pattern still demanded
      // \s+ after it, so a single newline only split when a second whitespace
      // character followed.
      expect(
        snapsSplitSentences('환절기 건강 관리 요령\n실내 습도를 유지하세요')
      ).toEqual(['환절기 건강 관리 요령', '실내 습도를 유지하세요']);

      // A bulleted note is one of the commonest things to paste, and it used
      // to arrive as a single unit.
      expect(
        snapsSplitSentences('- 습도 50%\n- 손 씻기\n- 7시간 수면')
      ).toHaveLength(3);

      // Korean is often written without the space after the full stop.
      expect(snapsSplitSentences('첫 문장입니다.둘째 문장입니다.')).toEqual([
        '첫 문장입니다.',
        '둘째 문장입니다.',
      ]);

      // A digit after the stop is a decimal, not a sentence boundary.
      expect(
        snapsSplitSentences('습도를 50.5% 이상으로 유지하세요. 손을 씻으세요.')
      ).toEqual(['습도를 50.5% 이상으로 유지하세요.', '손을 씻으세요.']);

      // A digit *before* the stop is the same kind of thing, and that half was
      // missing. Measured: a numbered note came back with every marker torn off
      // its item, so a deck built from one had slides reading just '1.' and
      // '2.', and a Korean date came back as four units.
      expect(
        snapsSplitSentences('1. 습도 50% 이상 유지\n2. 손 씻기\n3. 7시간 수면')
      ).toEqual(['1. 습도 50% 이상 유지', '2. 손 씻기', '3. 7시간 수면']);
      expect(snapsSplitSentences('2026. 9. 12. 에 재입고됩니다.')).toEqual([
        '2026. 9. 12. 에 재입고됩니다.',
      ]);
      expect(snapsSplitSentences('오늘은 2. 단계를 설명합니다.')).toEqual([
        '오늘은 2. 단계를 설명합니다.',
      ]);
      expect(snapsSplitSentences('1.습도 유지\n2.손 씻기')).toEqual([
        '1.습도 유지',
        '2.손 씻기',
      ]);
      // Two lookbehinds side by side are evaluated at the same position, so
      // `(?<![0-9])(?<=[.!?])` asks whether the stop itself is a digit and never
      // fires. The first attempt at this was exactly that no-op, and the
      // consumers looked correct anyway because their grouping happened to
      // rejoin the pieces. A sentence that ends in a word still divides:
      expect(
        snapsSplitSentences('작년 매출은 120억. 올해는 더 큽니다.')
      ).toHaveLength(2);
      expect(snapsSplitSentences('첫 줄입니다\r\n둘째 줄입니다')).toHaveLength(2);
      expect(snapsSplitSentences('한 문장입니다.\n')).toHaveLength(1);
      expect(snapsSplitSentences('')).toEqual([]);
    });

    // cleanSourceText ran the source through text(), which collapses every run
    // of whitespace to one space. The deck is split on that structure, so a
    // pasted list produced one body slide holding everything, whatever
    // slideCount asked for.
    it('builds one slide per pasted bullet, and keeps the title on one line', async () => {
      const service = new SnapsCardNewsService({
        get model() {
          return 'jest-split';
        },
        provider() {
          return 'ollama' as const;
        },
        async chatJson() {
          throw new Error('offline');
        },
      } as never);

      const deck = await service.script({
        sourceText: [
          '환절기 건강 관리 요령',
          '- 실내 습도 50% 이상 유지',
          '- 외출 후 손 꼼꼼히 씻기',
          '- 하루 7시간 이상 수면',
          '- 비타민C가 풍부한 제철 과일',
        ].join('\n'),
        slideCount: 6,
      } as never);

      expect(deck.provider).toBe('rule-fallback');
      expect(deck.slides).toHaveLength(6);

      const bodies = deck.slides.map((slide) => String(slide.body));
      expect(new Set(bodies).size).toBe(bodies.length);
      // The bullet character itself does not belong in a rendered card.
      expect(bodies.some((body) => body.startsWith('- '))).toBe(false);
      expect(bodies).toContain('외출 후 손 꼼꼼히 씻기');

      // Single-line fields have to stay single-line now that the source keeps
      // its newlines.
      expect(deck.title).not.toMatch(/[\r\n]/);
      for (const slide of deck.slides) {
        expect(String(slide.heading)).not.toMatch(/[\r\n]/);
      }
    });

    // Hashtags were split on whitespace and commas only, so every other
    // separator was stripped by the character filter instead and the tags
    // either side of it were welded together. A merged tag is worse than a
    // dropped one: it gets published and nobody searches it.
    it('keeps run-together hashtags apart', () => {
      // The shape a model emits most often.
      expect(sanitizeSnapsHashtags('#환절기#건강관리#면역력')).toEqual([
        '#환절기',
        '#건강관리',
        '#면역력',
      ]);
      expect(sanitizeSnapsHashtags(['#환절기#건강관리'])).toEqual([
        '#환절기',
        '#건강관리',
      ]);
      expect(sanitizeSnapsHashtags('#환절기·건강')).toEqual([
        '#환절기',
        '#건강',
      ]);
      expect(sanitizeSnapsHashtags('#환절기/건강')).toEqual([
        '#환절기',
        '#건강',
      ]);
      expect(sanitizeSnapsHashtags('#환절기、#건강')).toEqual([
        '#환절기',
        '#건강',
      ]);

      // Splitting must not break what already worked.
      expect(sanitizeSnapsHashtags('#환절기 #건강관리')).toEqual([
        '#환절기',
        '#건강관리',
      ]);
      expect(sanitizeSnapsHashtags(['환절기'])).toEqual(['#환절기']);
      expect(sanitizeSnapsHashtags(['#Health', '#health'])).toEqual([
        '#Health',
      ]);
      // Duplicates that only become visible after the split.
      expect(sanitizeSnapsHashtags(['#건강#건강'])).toEqual(['#건강']);
      expect(sanitizeSnapsHashtags(['###'])).toEqual([]);
      expect(sanitizeSnapsHashtags('#a #b #c', 2)).toEqual(['#a', '#b']);
    });

    // The subject the operator named came back wrong in four of seven ways of
    // saying it. It feeds the prompt and the deterministic source text, so a
    // subject carrying a dangling particle or half the instruction shapes
    // everything written afterwards.
    it('reads the subject a Korean command named, without its grammar', () => {
      const planner = new SnapsCommandPlannerService(
        {} as never,
        {} as never,
        {} as never,
        {} as never
      );
      const topic = (command: string) =>
        (planner as unknown as { detectTopic(input: string): string }).detectTopic(
          command
        );

      const cases: Array<[string, string]> = [
        // Only ':' was allowed after the keyword, so the topic particle was
        // captured as part of the subject: `는 환절기 면역력 관리야`.
        ['소재는 환절기 면역력 관리야', '환절기 면역력 관리'],
        ['내용은 신제품 출시 소식이야', '신제품 출시 소식'],
        // The capture was anchored to the end of the string and could not
        // cross a comma, so a comma later in the command dropped the subject
        // entirely and said nothing.
        ['주제: 가을 과일, 톤은 친근하게', '가을 과일'],
        // 으로 marks what to make it about, so the word before it stays.
        ['주제를 환절기 건강으로 해줘', '환절기 건강'],
        // 에 marks where to send it, so the word before it goes.
        ['주제: 가을 과일 추천을 인스타에 올려줘', '가을 과일 추천'],
        // Except when the word names a format rather than a subject.
        ['주제: 겨울 코트 추천을 카드뉴스로 만들어줘', '겨울 코트 추천'],
        ['주제: 신제품 소개를 쇼츠로 뽑아줘', '신제품 소개'],
        // Unchanged behaviour.
        ['주제: 가을 제철 과일 추천', '가을 제철 과일 추천'],
        ['이번 주제 환절기 건강', '환절기 건강'],
        ['환절기 건강 관련 내용으로 인스타에 올려줘', '환절기 건강 관련'],
        ['그냥 올려줘', ''],
      ];

      for (const [command, expected] of cases) {
        expect(`${command} -> ${topic(command)}`).toBe(
          `${command} -> ${expected}`
        );
      }
    });

    // Scheduling blocked on the transform result while the two fields that
    // would satisfy it were drawn from the platform checkboxes. Transform with
    // the cafe selected, then untick it, and the operator is told they need a
    // Cafe ID and a Menu ID with nowhere on screen to type either.
    it('shows the Naver Cafe fields whenever scheduling could ask for them', () => {
      const cafeVariant = [
        { platform: 'naver-cafe', publishMode: 'schedule' },
        { platform: 'threads', publishMode: 'schedule' },
      ];

      // The state that used to be a dead end: the channel is no longer ticked,
      // but the result still carries its variant and the channel is connected.
      const unticked = {
        selectedPlatforms: ['threads'],
        variants: cafeVariant,
        connectedPlatforms: ['naver-cafe', 'threads'],
      };
      expect(snapsNaverCafePending(unticked)).toBe(true);
      expect(snapsShowNaverCafeFields(unticked)).toBe(true);

      // Ticked but nothing transformed yet: the fields are there so the
      // operator can fill them in before scheduling, and nothing is blocked.
      const ticked = {
        selectedPlatforms: ['naver-cafe'],
        variants: [],
        connectedPlatforms: ['naver-cafe'],
      };
      expect(snapsShowNaverCafeFields(ticked)).toBe(true);
      expect(snapsNaverCafePending(ticked)).toBe(false);

      // A cafe variant with no cafe channel connected is never scheduled, so
      // it must not block and must not demand the fields on its own.
      const notConnected = {
        selectedPlatforms: ['threads'],
        variants: cafeVariant,
        connectedPlatforms: ['threads'],
      };
      expect(snapsNaverCafePending(notConnected)).toBe(false);
      expect(snapsShowNaverCafeFields(notConnected)).toBe(false);

      // An assist-only cafe variant is not scheduled either.
      expect(
        snapsNaverCafePending({
          selectedPlatforms: ['threads'],
          variants: [{ platform: 'naver-cafe', publishMode: 'assist' }],
          connectedPlatforms: ['naver-cafe'],
        })
      ).toBe(false);

      // Nothing at all.
      expect(
        snapsShowNaverCafeFields({ selectedPlatforms: [] })
      ).toBe(false);
    });

    // Nothing in the snaps scheduling path checked whether the chosen time had
    // already gone by, and the post workflow treats a past publishDate as
    // `sleep(0)` - it publishes immediately. So a year typed wrong sent the
    // post to every connected channel there and then, while the operator had
    // confirmed a *scheduled* publication.
    describe('a publish time that has already gone by', () => {
      const NOW = Date.parse('2026-09-11T05:00:00.000Z');
      const variant = {
        platform: 'threads',
        label: 'Threads',
        content: '환절기 건강 관리 요령입니다.',
        hashtags: ['#환절기'],
        settings: { __type: 'threads' },
        publishMode: snapsPlatformRules.threads.publishMode,
      };
      const build = (
        publishDate: string,
        scheduleType: 'draft' | 'schedule' = 'schedule'
      ) =>
        buildSnapsPublishingPayload({
          variants: [variant],
          integrations: [{ platform: 'threads', integrationId: 'th-1' }],
          publishDate,
          scheduleType,
          now: NOW,
        } as never);

      it('is refused rather than published immediately', () => {
        // The shape this was found from: a year typed wrong.
        const typo = build('2025-09-20T06:00:00.000Z');
        expect(typo.payload).toBeUndefined();
        expect(typo.warnings.join(' ')).toContain('이미 지났습니다');

        const yesterday = build('2026-09-10T06:00:00.000Z');
        expect(yesterday.payload).toBeUndefined();
      });

      it('still accepts a time a few seconds behind the clock', () => {
        // A request takes a moment to arrive; the operator did nothing wrong.
        const justBehind = build(new Date(NOW - 30_000).toISOString());
        expect(justBehind.payload).toBeDefined();
        expect(justBehind.warnings.join(' ')).not.toContain('이미 지났습니다');

        const twoMinutes = build(new Date(NOW - 120_000).toISOString());
        expect(twoMinutes.payload).toBeUndefined();
      });

      it('leaves a future time and a draft alone', () => {
        expect(build('2026-09-20T06:00:00.000Z').payload).toBeDefined();
        // A draft is never published, so its date is not a claim about when.
        expect(build('2025-09-20T06:00:00.000Z', 'draft').payload).toBeDefined();
      });

      it('tells the page the same thing the builder does', () => {
        expect(snapsPublishDateProblem('', NOW)).toBe('예약 시간을 입력하세요.');
        expect(snapsPublishDateProblem('2025-09-20T06:00:00.000Z', NOW)).toContain(
          '이미 지났습니다'
        );
        expect(
          snapsPublishDateProblem(new Date(NOW - 30_000).toISOString(), NOW)
        ).toBe('');
        expect(
          snapsPublishDateProblem('2026-09-20T06:00:00.000Z', NOW)
        ).toBe('');
      });
    });

    // A date the operator's own words resolved to always wins - that part was
    // already settled. A date the *model* supplied is a guess, and a guess in
    // the past went straight into the plan. The publishing builder refuses a
    // past time, so the operator met an error about a moment they never chose,
    // at the schedule step, having typed no time at all.
    it('drops a model publish time that is already behind the clock', async () => {
      const NOW = '2026-09-11T05:00:00.000Z';
      const plannerWith = (publishDate: string) => {
        const llm = {
          get model() {
            return 'jest-model-date';
          },
          provider() {
            return 'ollama' as const;
          },
          async chatJson() {
            return {
              command: '게시물 예약',
              intent: 'prepare-and-confirm',
              sourceText: '환절기 건강 관리 팁을 정리한 게시물입니다.',
              targetPlatforms: ['instagram'],
              scheduleType: 'schedule',
              publishDate,
            };
          },
          async embed() {
            return [[0.1]];
          },
        } as never;
        return new SnapsCommandPlannerService(
          llm,
          new SnapsContentTransformService(llm, emptyRag as never),
          new SnapsShortVideoService(llm),
          new SnapsCardNewsService(llm)
        );
      };
      const planFor = async (publishDate: string, command: string) =>
        (
          await plannerWith(publishDate).prepare('model-date-org', {
            command,
            sourceText: '환절기 건강 관리 팁을 정리한 게시물입니다.',
            now: NOW,
            timezoneOffsetMinutes: -540,
          } as never)
        ).plan;

      const past = await planFor('2026-05-10T14:00', '인스타그램에 올려줘');
      expect(past.publishDate).toBeDefined();
      expect(
        new Date(String(past.publishDate)).getTime()
      ).toBeGreaterThanOrEqual(Date.parse(NOW));

      // A model date ahead of the clock is still honoured.
      const future = await planFor('2027-01-01T09:00', '인스타그램에 올려줘');
      expect(future.publishDate).toBe('2027-01-01T00:00:00.000Z');

      // What the operator said outranks the model either way. The model date
      // here is a perfectly good future one, so this fails if the operator is
      // no longer read first - a past model date would be dropped anyway and
      // would prove nothing.
      const operatorSaid = await planFor(
        '2027-01-01T09:00',
        '내일 오전 9시에 인스타그램에 올려줘'
      );
      expect(operatorSaid.publishDate).toBe('2026-09-12T00:00:00.000Z');
    }, 30000);

    // The Naver Cafe post title was clamped with a plain `.slice(0, 80)`.
    // Across twenty-two boundary positions that left three dangling high
    // surrogates and tore two ZWJ sequences, and this string is sent to
    // Naver's API - so a broken pair arrives there as a replacement character
    // in the title of the published post. The same fault was fixed across the
    // snaps tree earlier; the guard written for it walked only src/snaps, and
    // this provider lives beside the upstream ones.
    it('never cuts a Naver Cafe post title inside a character', () => {
      const provider = new NaverCafeProvider();
      const subject = (message: string) =>
        (
          provider as unknown as { makeSubject(input: string): string }
        ).makeSubject(message);

      const broken: string[] = [];
      for (let pad = 74; pad <= 84; pad += 1) {
        for (const emoji of ['🧊', '👨‍👩‍👧‍👦']) {
          const title = subject(
            '가'.repeat(pad) + emoji + ' 뒤에 더 있는 본문입니다'
          );
          const last = title.charCodeAt(title.length - 1);
          if (last >= 0xd800 && last <= 0xdbff) {
            broken.push(`pad=${pad} dangling surrogate`);
          }
          if (/‍$/.test(title)) {
            broken.push(`pad=${pad} trailing zero-width joiner`);
          }
        }
      }

      expect(broken).toEqual([]);

      // Unchanged behaviour: markup stripped, whitespace collapsed, the bound
      // still 80, and an empty message still named.
      expect(subject('<p>환절기  건강</p>')).toBe('환절기 건강');
      expect(subject('가'.repeat(120)).length).toBe(80);
      expect(subject('   ')).toBe('snaps 게시글');
    });

    // The Naver Cafe post title was derived in three places: the workspace,
    // the publishing builder, and the provider. The first two are the same
    // decision and had already drifted - the builder clamped a supplied title
    // to 80 and the workspace passed it through whole - and the workspace still
    // cut with a plain `.slice(0, 80)`. The provider's clamp cannot repair
    // that: a broken pair inside the first 80 units is not at the cut, so it
    // reaches Naver and renders in the title as a replacement character.
    it('derives one Naver Cafe title, on character boundaries', () => {
      const broken: string[] = [];
      for (let pad = 74; pad <= 84; pad += 1) {
        for (const emoji of ['🧊', '👨‍👩‍👧‍👦']) {
          const long = '가'.repeat(pad) + emoji + ' 뒤에 더 있는 본문입니다';
          for (const subject of [
            snapsCafeSubject(undefined, long),
            snapsCafeSubject(long, '본문'),
          ]) {
            const last = subject.charCodeAt(subject.length - 1);
            if (last >= 0xd800 && last <= 0xdbff) {
              broken.push(`pad=${pad} dangling surrogate`);
            }
            if (/‍$/.test(subject)) {
              broken.push(`pad=${pad} trailing zero-width joiner`);
            }
          }
        }
      }
      expect(broken).toEqual([]);

      // A supplied title wins, flattened and clamped - the workspace used to
      // pass it through whole while the builder clamped it.
      expect(snapsCafeSubject('환절기  건강\n관리', '본문입니다')).toBe(
        '환절기 건강 관리'
      );
      expect(snapsCafeSubject('가'.repeat(120), '본문').length).toBe(80);
      // Falls through to the body, then to a name.
      expect(snapsCafeSubject('', '환절기 건강 관리')).toBe('환절기 건강 관리');
      expect(snapsCafeSubject('', '')).toBe('snaps 게시글');
    });

    // The client returns the Shorts-Maker body with `payload as unknown as
    // SnapsShortsMakerTopicToScriptResponse` - an unvalidated cast - so
    // whatever that service sends arrives typed as a valid answer. The reader
    // then did `String(answer.script || '')`, which turns an object into the
    // literal text `[object Object]` and an array into `a,b`. That string went
    // straight into the operator's source box, replacing what was there.
    it('refuses a Shorts-Maker script that is not text', () => {
      const script = (answer: unknown) =>
        readSnapsShortsMakerScript(answer as never);

      expect(script({ ok: true, script: '환절기 건강 쇼츠 대본입니다.' }).script).toBe(
        '환절기 건강 쇼츠 대본입니다.'
      );

      for (const [label, value] of [
        ['object', { text: '대본' }],
        ['array', ['a', 'b']],
        ['number', 12345],
        ['boolean', true],
      ] as Array<[string, unknown]>) {
        const outcome = script({ ok: true, script: value });
        expect(`${label}: ${outcome.script}`).toBe(`${label}: `);
        expect(`${label}: ${outcome.tone}`).toBe(`${label}: warning`);
      }

      // Unchanged: the three outcomes that were already handled.
      expect(script({ ok: true }).tone).toBe('warning');
      expect(script({ ok: true, script: '   ' }).tone).toBe('warning');
      expect(
        script({ ok: false, status: 'not-configured', message: '설정 필요' })
          .message
      ).toBe('설정 필요');
    });

    // The card news response was taken at its word and put into state, and the
    // render guarded only that a deck existed: `{deck ? ... deck.slides.map()}`.
    // Four of five shapes a 200 can carry throw there, and an exception during
    // render unmounts the tree - the operator loses the panel instead of being
    // told what went wrong. The same file already asked `deck?.slides?.length`
    // in four other places.
    it('only accepts a card news deck the page can render', () => {
      const usable = (payload: unknown) => !!readSnapsCardNewsDeck(payload);

      expect(usable({ title: '제목', slides: [{ order: 1, heading: '가' }] })).toBe(
        true
      );

      for (const [label, payload] of [
        ['empty object', {}],
        ['slides null', { title: '제목', slides: null }],
        ['slides as an object', { title: '제목', slides: { 0: { order: 1 } } }],
        ['error body with a 200', { statusCode: 500, message: 'Internal' }],
        ['no slides at all', { title: '제목', slides: [] }],
        ['a slide that is not an object', { slides: ['가', '나'] }],
        ['null', null],
        ['an array', [{ order: 1 }]],
        ['a string', 'oops'],
      ] as Array<[string, unknown]>) {
        expect(`${label}: ${usable(payload)}`).toBe(`${label}: false`);
      }
    });

    // The agent panel is rendered from a result set either by /agent/prepare,
    // which the planner builds whole, or by opening a stored task - whatever
    // was written to disk, including records that arrived through the import
    // route. The import normaliser requires the two lists the *import* reads;
    // the panel reads five more. Measured end to end: a task whose `operation`
    // carried only `progress` imported and stored happily, and three of the
    // four expressions the panel builds from it threw. An exception during
    // render unmounts the tree, so opening that task blanks the panel.
    it('fills the lists the agent panel reads before rendering a stored task', () => {
      const partial = {
        plan: {
          command: '인스타그램에 올려줘',
          targetPlatforms: ['instagram'],
          marketingStrategy: { revenueModels: ['광고'] },
        },
        transform: {},
        operation: { progress: 50 },
      };

      const restored = readSnapsAgentResult(partial) as unknown as {
        plan: {
          targetPlatforms: unknown[];
          operatorSummary: unknown[];
          marketingStrategy?: { lanes: unknown[]; revenueModels: unknown[] };
        };
        operation: {
          progressSteps: unknown[];
          nextActions: unknown[];
          platformReadiness: unknown[];
          progress: number;
        };
        transform: { variants: unknown[] };
      };

      // Every list the panel maps over is an array now.
      for (const list of [
        restored.operation.progressSteps,
        restored.operation.nextActions,
        restored.operation.platformReadiness,
        restored.plan.operatorSummary,
        restored.transform.variants,
        restored.plan.marketingStrategy?.lanes,
      ]) {
        expect(Array.isArray(list)).toBe(true);
      }

      // What was there is kept, not replaced.
      expect(restored.plan.targetPlatforms).toEqual(['instagram']);
      expect(restored.plan.marketingStrategy?.revenueModels).toEqual(['광고']);
      expect(restored.operation.progress).toBe(50);

      // An absent marketing strategy stays absent - the panel asks whether the
      // section exists before drawing it, and an empty one would be an empty
      // box.
      const noStrategy = readSnapsAgentResult({
        plan: { targetPlatforms: [] },
        transform: {},
        operation: {},
      }) as unknown as { plan: { marketingStrategy?: unknown } };
      expect(noStrategy.plan.marketingStrategy).toBeUndefined();

      // One level deeper: the panel reads lists on the entries too, and
      // filling only the outer lists still threw on item.checks,
      // item.blockers and lane.kpis.
      const entries = readSnapsAgentResult({
        plan: {
          targetPlatforms: [],
          executionPlan: [{ label: '단계' }],
          marketingStrategy: { lanes: [{ lane: 'a', label: '레인' }] },
        },
        transform: {},
        operation: {
          platformReadiness: [{ platform: 'instagram', label: '인스타' }],
        },
      }) as unknown as {
        plan: {
          executionPlan: Array<{ checks: unknown[]; blockers: unknown[] }>;
          marketingStrategy?: { lanes: Array<{ kpis: unknown[] }> };
        };
        operation: {
          platformReadiness: Array<{ checks: unknown[]; blockers: unknown[] }>;
        };
      };
      expect(Array.isArray(entries.operation.platformReadiness[0].checks)).toBe(true);
      expect(Array.isArray(entries.operation.platformReadiness[0].blockers)).toBe(true);
      expect(Array.isArray(entries.plan.executionPlan[0].checks)).toBe(true);
      expect(Array.isArray(entries.plan.marketingStrategy?.lanes[0].kpis)).toBe(true);
      // Filling must not replace the entry: the panel keys and labels each one
      // from fields the fill knows nothing about.
      expect(
        (entries.operation.platformReadiness[0] as unknown as {
          platform?: string;
          label?: string;
        }).platform
      ).toBe('instagram');
      expect(
        (entries.plan.marketingStrategy?.lanes[0] as unknown as {
          lane?: string;
        }).lane
      ).toBe('a');

      // Nothing to fill in.
      expect(readSnapsAgentResult(undefined)).toBeUndefined();
      expect(readSnapsAgentResult('oops')).toBe('oops');
    });

    // The growth insight carries a percentage beside the absolute change, and
    // the percentage is the change over the starting value. A starting value of
    // zero was already omitted; a negative one was not, and it flips the sign:
    // a metric that went from -100 to 50 was reported as
    // `+150(-150%) 증가했습니다` - the sentence says it grew and the number
    // beside it says it shrank by half again. Metric values arrive from
    // imported JSON as well as from the platforms.
    it('omits a growth rate that has no honest base', async () => {
      const generator = new SnapsReportGeneratorService({
        get model() {
          return 'jest-report-rate';
        },
        provider() {
          return 'ollama' as const;
        },
        async chatJson() {
          throw new Error('offline');
        },
      } as never);

      const point = (metricValue: number, day: string) => ({
        platform: 'instagram',
        metricKey: 'impressions',
        metricValue,
        collectedAt: `2026-09-${day}T00:00:00.000Z`,
      });
      const growthLine = async (from: number, to: number) => {
        const report = await generator.generate({
          organizationId: 'rate-org',
          platform: 'instagram',
          metrics: [point(from, '01'), point(to, '08')],
        } as never);
        return (
          report.insights.find((line) => line.includes('증가했습니다')) || ''
        );
      };

      // A positive base still carries its rate.
      expect(await growthLine(1200, 1800)).toContain('+600(+50%)');

      // Neither of these has a base a percentage can be taken against.
      const fromNegative = await growthLine(-100, 50);
      expect(fromNegative).toContain('+150');
      expect(fromNegative).not.toContain('%');

      const fromZero = await growthLine(0, 900);
      expect(fromZero).toContain('+900');
      expect(fromZero).not.toContain('%');

      const bothNegative = await growthLine(-50, -10);
      expect(bothNegative).toContain('+40');
      expect(bothNegative).not.toContain('%');
    }, 20000);

    // publishDateLocal is rendered in whichever offset the caller supplied,
    // so it reads correctly whatever was assumed and hides the assumption. The
    // workspace sends the browser offset; the chat tool has no browser and gets
    // the Korean default. Measured on one command: the chat path resolved
    // 01:00Z where a UTC browser resolved 10:00Z - nine hours apart - and both
    // rendered the same 10:00.
    it('says which clock a plan was built against', async () => {
      const planner = new SnapsCommandPlannerService(
        new OfflineOllama() as never,
        new SnapsContentTransformService(
          new OfflineOllama() as never,
          emptyRag as never
        ),
        new SnapsShortVideoService(new OfflineOllama() as never),
        new SnapsCardNewsService(new OfflineOllama() as never)
      );
      const planFor = async (extra: Record<string, unknown>) =>
        (
          await planner.prepare('tz-disclosure-org', {
            command: '내일 오전 10시에 인스타그램에 올려줘',
            sourceText: '환절기 건강 관리 팁을 정리한 게시물입니다.',
            now: '2026-09-12T05:00:00.000Z',
            ...extra,
          } as never)
        ).plan;

      const noOffset = await planFor({});
      const utc = await planFor({ timezoneOffsetMinutes: 0 });

      // Both render the time the operator asked for.
      expect(noOffset.publishDateLocal).toContain('10:00');
      expect(utc.publishDateLocal).toContain('10:00');
      // They are not the same instant, and the plan now says why.
      expect(noOffset.publishDate).not.toBe(utc.publishDate);
      expect(noOffset.publishTimezoneOffsetMinutes).toBe(-540);
      expect(utc.publishTimezoneOffsetMinutes).toBe(0);

      // Two places build a plan - the one that uses the model's answer and
      // the deterministic one - and an offline double only ever reaches the
      // second. Both have to say which clock they used.
      const modelPlanner = new SnapsCommandPlannerService(
        {
          get model() {
            return 'jest-tz';
          },
          provider() {
            return 'ollama' as const;
          },
          async chatJson() {
            return {
              command: '내일 오전 10시에 인스타그램에 올려줘',
              intent: 'prepare-and-confirm',
              sourceText: '환절기 건강 관리 팁을 정리한 게시물입니다.',
              targetPlatforms: ['instagram'],
              scheduleType: 'schedule',
            };
          },
          async embed() {
            return [[0.1]];
          },
        } as never,
        new SnapsContentTransformService(
          new OfflineOllama() as never,
          emptyRag as never
        ),
        new SnapsShortVideoService(new OfflineOllama() as never),
        new SnapsCardNewsService(new OfflineOllama() as never)
      );
      const fromModel = (
        await modelPlanner.prepare('tz-disclosure-org', {
          command: '내일 오전 10시에 인스타그램에 올려줘',
          sourceText: '환절기 건강 관리 팁을 정리한 게시물입니다.',
          now: '2026-09-12T05:00:00.000Z',
          timezoneOffsetMinutes: 0,
        } as never)
      ).plan;
      expect(fromModel.provider).toBe('ollama');
      expect(fromModel.publishTimezoneOffsetMinutes).toBe(0);
    }, 30000);

    // A plan carries both an instant and a rendering of it, and the rendering
    // is made in whatever offset the caller supplied - the browser's for the
    // workspace, the Korean default for the chat tool, which has no browser.
    // Restoring a stored task put that rendering straight into the scheduling
    // input, and the input is read back in the browser's zone. A task planned
    // through chat as 2026-09-13T10:00 (01:00Z) came back as 10:00Z when
    // opened in a UTC browser - nine hours later than the plan meant, silently.
    it('restores a stored publish time as the instant it was, not the text', () => {
      const hostOffset = jest
        .spyOn(Date.prototype, 'getTimezoneOffset')
        .mockReturnValue(0);

      try {
        // 01:00Z is what the chat plan meant; 10:00 is only how it read in KST.
        expect(toLocalInputValue('2026-09-13T01:00:00.000Z')).toBe(
          '2026-09-13T01:00'
        );
      } finally {
        hostOffset.mockRestore();
      }

      // The same instant in a KST browser.
      const kst = jest
        .spyOn(Date.prototype, 'getTimezoneOffset')
        .mockReturnValue(-540);
      try {
        expect(toLocalInputValue('2026-09-13T01:00:00.000Z')).toBe(
          '2026-09-13T10:00'
        );
      } finally {
        kst.mockRestore();
      }

      // Nothing to convert.
      expect(toLocalInputValue(undefined)).toBe('');
      expect(toLocalInputValue('not a date')).toBe('');
    });

    // The card news workspace has read a handoff key since it was written and
    // the docs described the button that fills it, but no button existed - and
    // the page type did not even declare the `cardNews` field the server sends.
    // This pins the contract the new sender depends on: what the agent puts in
    // the plan is what the workspace reads back out.
    it('gives the card news workspace every field it restores', async () => {
      const planner = new SnapsCommandPlannerService(
        new OfflineOllama() as never,
        new SnapsContentTransformService(
          new OfflineOllama() as never,
          emptyRag as never
        ),
        new SnapsShortVideoService(new OfflineOllama() as never),
        new SnapsCardNewsService(new OfflineOllama() as never)
      );

      const prepared = (await planner.prepare('handoff-org', {
        command: '환절기 건강 주제로 카드뉴스 만들어서 인스타그램에 올려줘',
        sourceText:
          '환절기에는 일교차가 커집니다. 습도를 유지하세요. 손을 씻으세요. 잠을 충분히 자세요.',
        timezoneOffsetMinutes: -540,
        now: '2026-09-12T05:00:00.000Z',
      } as never)) as unknown as {
        plan: { includeCardNews?: boolean; sourceText?: string; tone?: string };
        cardNews?: {
          slides?: unknown[];
          templateId?: string;
          brandColor?: string;
        };
      };

      expect(prepared.plan.includeCardNews).toBe(true);
      expect(prepared.cardNews).toBeDefined();

      // Exactly the fields snaps-card-news-workspace reads out of the handoff.
      expect((prepared.cardNews?.slides || []).length).toBeGreaterThan(0);
      expect(typeof prepared.cardNews?.templateId).toBe('string');
      expect(typeof prepared.cardNews?.brandColor).toBe('string');
      expect(typeof prepared.plan.sourceText).toBe('string');
      expect(typeof prepared.plan.tone).toBe('string');
    }, 30000);

    // The health card led with `채팅 모델 없음` whenever the chat model was
    // unavailable - and an unreachable Ollama reports every model as missing,
    // because the probe could not ask. Measured against the client: with the
    // service down the report carries both model names in missingModels and
    // ECONNREFUSED in error. The card sent the operator to reinstall models
    // that were already installed, and the reason that would have told them
    // otherwise was read from `health.error`, a field the route never sends.
    it('separates a model that is missing from an engine that did not answer', () => {
      const line = (health: unknown, healthError = '') =>
        snapsHealthHeadline(health as never, healthError);

      // Could not ask: no models came back and the probe said why.
      expect(
        line({
          ollama: {
            ok: false,
            chatModelAvailable: false,
            embedModelAvailable: false,
            error: 'ECONNREFUSED',
            models: [],
          },
        })
      ).toBe('Ollama 응답 없음');

      // Asked, and the chat model was not there.
      expect(
        line({
          ollama: {
            ok: false,
            chatModelAvailable: false,
            embedModelAvailable: true,
            error: 'Missing Ollama models: qwen3.5:9b',
            models: ['nomic-embed-text:latest'],
          },
        })
      ).toBe('채팅 모델 없음');

      // Asked, and only the embedding model was not there.
      expect(
        line({
          ollama: {
            ok: false,
            chatModelAvailable: true,
            embedModelAvailable: false,
            error: 'Missing Ollama models: nomic-embed-text:latest',
            models: ['qwen3.5:9b'],
          },
        })
      ).toBe('임베딩 없음 · RAG 제한');

      expect(
        line({
          ollama: {
            ok: true,
            chatModelAvailable: true,
            embedModelAvailable: true,
            models: ['qwen3.5:9b', 'nomic-embed-text:latest'],
          },
        })
      ).toBe('모델 준비됨');

      // The request for the health itself failed, which outranks everything.
      expect(line({ ollama: { ok: true } }, '500 서버 오류')).toBe(
        '상태 확인 실패'
      );
      expect(line(undefined)).toBe('확인중');
    });

    // Nothing checked that the directory the six JSON stores live in can be
    // written, and a directory that cannot be used is invisible at every layer.
    // Measured with a plain file sitting where the directory should be: health
    // reported the configured path and nothing else; every read returned []
    // with no warning at all, because Windows answers ENOENT for a path under a
    // file and ENOENT is the code that means "not written yet"; and the first
    // save threw a raw EEXIST out of mkdir. The operator saw an empty
    // workspace and had every reason to read it as data loss.
    it('says when the snaps store cannot be written', async () => {
      const base = path.join(
        process.cwd(),
        'tmp',
        `snaps-store-health-${process.pid}`
      );
      const previous = process.env.SNAPS_DATA_DIR;

      try {
        process.env.SNAPS_DATA_DIR = path.join(base, 'writable');
        // Watch the write itself: a probe that only calls mkdir answers
        // 'writable' for a directory it never wrote to, and neither of the
        // cases below can tell the difference.
        const wrote = jest.spyOn(fsp, 'writeFile');
        const healthy = await snapsDataDirHealth();
        expect(
          wrote.mock.calls.some(([target]) =>
            String(target).includes('.snaps-write-probe')
          )
        ).toBe(true);
        wrote.mockRestore();
        expect(healthy.writable).toBe(true);
        expect(healthy.error).toBeUndefined();
        expect(healthy.dataDir).toContain('writable');
        // The probe leaves nothing behind.
        expect(
          (await fsp.readdir(healthy.dataDir)).filter((entry) =>
            entry.startsWith('.snaps-write-probe')
          )
        ).toEqual([]);

        // A file where the directory should be: the shape that was silent.
        const blocked = path.join(base, 'blocked');
        await fsp.mkdir(base, { recursive: true });
        await fsp.writeFile(blocked, 'not a directory', 'utf8');
        process.env.SNAPS_DATA_DIR = blocked;
        const broken = await snapsDataDirHealth();
        expect(broken.writable).toBe(false);
        expect(typeof broken.error).toBe('string');
        expect(broken.dataDir).toBe(blocked);
      } finally {
        if (previous === undefined) {
          delete process.env.SNAPS_DATA_DIR;
        } else {
          process.env.SNAPS_DATA_DIR = previous;
        }
        await fsp.rm(base, { recursive: true, force: true });
      }
    });

    // warn-unreadable-file.ts named this case itself: "Worse is the case where
    // nobody writes. The list reads empty, the operator closes the workspace,
    // and the damaged file is never mentioned at all." The directory is
    // writable, so the store health said everything was fine while a damaged
    // file showed on screen as a confident empty library.
    it('reports a store file that cannot be read, and stops once it can', async () => {
      const base = await fsp.mkdtemp(
        path.join(os.tmpdir(), 'snaps-unreadable-')
      );
      const previous = process.env.SNAPS_DATA_DIR;
      const warn = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      resetSnapsUnreadableWarnings();

      try {
        process.env.SNAPS_DATA_DIR = base;
        const file = path.join(base, 'feedback.json');
        await fsp.writeFile(file, '{ this is not json', 'utf8');

        // What every snaps store does with a damaged file: warn, return [].
        try {
          JSON.parse(await fsp.readFile(file, 'utf8'));
        } catch (error) {
          warnUnreadableJsonFile(file, error, '피드백');
        }

        const damaged = await snapsDataDirHealth();
        // The directory is fine. That was the whole problem.
        expect(damaged.writable).toBe(true);
        expect(damaged.unreadable).toHaveLength(1);
        expect(damaged.unreadable?.[0].path).toBe(file);
        expect(damaged.unreadable?.[0].label).toBe('피드백');
        // With the reason, so the operator knows what to look for.
        expect(damaged.unreadable?.[0].reason).toBeTruthy();
        expect(
          snapsHealthHeadline(
            {
              storage: damaged,
              ollama: {
                ok: true,
                chatModelAvailable: true,
                embedModelAvailable: true,
              },
            } as never,
            ''
          )
        ).toBe('저장 파일 읽기 실패');

        // Repaired. The memory has to be a state, not a history - a card that
        // keeps accusing a file the operator already fixed is worse than the
        // log line it replaced.
        await fsp.writeFile(file, '[]', 'utf8');
        const repaired = await snapsDataDirHealth();
        expect(repaired.unreadable).toBeUndefined();
        expect(
          snapsHealthHeadline(
            {
              storage: repaired,
              ollama: {
                ok: true,
                chatModelAvailable: true,
                embedModelAvailable: true,
              },
            } as never,
            ''
          )
        ).toBe('모델 준비됨');

        // Valid JSON that is not an array still reads as empty everywhere
        // else, so parsing alone must not clear it.
        await fsp.writeFile(file, '{"items":[]}', 'utf8');
        warnUnreadableJsonFile(
          file,
          new Error('file does not hold a JSON array'),
          '피드백'
        );
        expect((await snapsDataDirHealth()).unreadable).toHaveLength(1);

        // A file that was quarantined and never replaced is the first-run
        // state again, which is not a fault.
        await fsp.rm(file, { force: true });
        expect((await snapsDataDirHealth()).unreadable).toBeUndefined();
      } finally {
        warn.mockRestore();
        resetSnapsUnreadableWarnings();
        if (previous === undefined) {
          delete process.env.SNAPS_DATA_DIR;
        } else {
          process.env.SNAPS_DATA_DIR = previous;
        }
        await fsp.rm(base, { recursive: true, force: true });
      }
    });

    // The health card leads with the store, because an unwritable store shows
    // up first as an empty library rather than as an error.
    it('leads the health card with a store that cannot be written', () => {
      const ready = {
        storage: { dataDir: '/var/snaps', writable: true },
        ollama: { ok: true, chatModelAvailable: true, embedModelAvailable: true },
      };
      expect(snapsHealthHeadline(ready as never, '')).toBe('모델 준비됨');

      const broken = {
        storage: { dataDir: '/var/snaps', writable: false, error: 'EACCES' },
        ollama: { ok: true, chatModelAvailable: true, embedModelAvailable: true },
      };
      expect(snapsHealthHeadline(broken as never, '')).toBe('저장 폴더 쓰기 불가');

      // A failed request still outranks it: nothing is known yet.
      expect(snapsHealthHeadline(broken as never, '500')).toBe('상태 확인 실패');
    });

    // The shorts status row was three blocks of inline ternaries, each
    // deciding its own severity. Measured with the logic read straight out of
    // the markup:
    //
    //   not loaded yet    GREEN LLM 확인중        AMBER Pixelle 미설정
    //   request failed    AMBER LLM 상태 확인 실패  AMBER Pixelle 미설정
    //   store unwritable  GREEN DeepSeek ...      GREEN Pixelle 준비됨
    //
    // An unknown state painted green while its own text said 확인중; Pixelle
    // and Shorts-Maker asserted 미설정 before anything had been asked; and a
    // store that could not be written left every badge green, though shorts
    // work is saved there.
    it('does not paint an unknown shorts status as healthy', () => {
      const healthy = {
        ollama: {
          ok: true,
          provider: 'deepseek',
          chatModel: 'deepseek-v4-flash',
          chatModelAvailable: true,
        },
        pixelle: { ok: true, configured: true },
        shortsMaker: { ok: true, configured: true },
        storage: { writable: true, dataDir: '/var/snaps' },
      };
      const row = (health: unknown, healthError = '') =>
        snapsShortsBadges(health as never, healthError);

      // Nothing asked yet: every badge says so, and none of them claims a fact.
      const unloaded = row(null);
      expect(unloaded.map((badge) => badge.tone)).toEqual([
        'warn',
        'warn',
        'warn',
        'warn',
      ]);
      expect(unloaded.every((badge) => badge.label.includes('확인중'))).toBe(
        true
      );
      // 미설정 is a claim about configuration, and nothing had been asked.
      expect(unloaded.some((badge) => badge.label.includes('미설정'))).toBe(
        false
      );

      const failed = row(null, '500');
      expect(
        failed.every((badge) => badge.label.includes('상태 확인 실패'))
      ).toBe(true);

      expect(row(healthy).map((badge) => badge.tone)).toEqual([
        'ok',
        'ok',
        'ok',
        'ok',
      ]);

      // A store the workspace cannot write to is shorts' problem too.
      const unwritable = row({
        ...healthy,
        storage: { writable: false, error: 'EACCES', dataDir: '/var/snaps' },
      });
      const storageBadge = unwritable.find((badge) => badge.id === 'storage');
      expect(storageBadge?.tone).toBe('bad');
      expect(storageBadge?.label).toBe('저장 폴더 쓰기 불가');
      expect(storageBadge?.title).toContain('EACCES');

      const damaged = row({
        ...healthy,
        storage: {
          writable: true,
          unreadable: [{ label: '피드백', path: '/p', reason: 'bad json' }],
        },
      }).find((badge) => badge.id === 'storage');
      expect(damaged?.tone).toBe('bad');
      expect(damaged?.label).toBe('저장 파일 읽기 실패');
      // Both surfaces spell the fault the same way, because both ask the same
      // function.
      expect(damaged?.label).toBe(
        snapsHealthHeadline(
          {
            storage: {
              writable: true,
              unreadable: [{ label: '피드백', path: '/p', reason: 'bad json' }],
            },
          } as never,
          ''
        )
      );

      // Still keyed on the chat model, not health.ok: a working DeepSeek with
      // no local Ollama must not paint this red.
      expect(
        row({
          ...healthy,
          ollama: { ...healthy.ollama, ok: false, chatModelAvailable: true },
        })[0].tone
      ).toBe('ok');
      expect(
        row({
          ...healthy,
          ollama: { ...healthy.ollama, ok: false, chatModelAvailable: false },
        })[0].tone
      ).toBe('bad');
    });

    // The card derived its colour from chatModelAvailable and ollama.ok while
    // the words came from the ranking, so the two could disagree - and did.
    // Measured before the fix: an unwritable store and a damaged store file,
    // the two conditions the ranking puts first because an empty library reads
    // as data loss, both painted the same green as '모델 준비됨'.
    it('paints the headline with the severity the headline was chosen for', () => {
      const modelOk = {
        ok: true,
        provider: 'deepseek',
        chatModelAvailable: true,
        embedModelAvailable: true,
        models: ['deepseek-flash'],
      };
      const verdict = (health: unknown, healthError = '') =>
        snapsHealthVerdict(health as never, healthError);

      expect(
        verdict({
          storage: { writable: false, error: 'EACCES', dataDir: '/var/snaps' },
          ollama: modelOk,
        })
      ).toEqual({ headline: '저장 폴더 쓰기 불가', tone: 'bad' });

      expect(
        verdict({
          storage: {
            writable: true,
            unreadable: [{ label: '피드백', path: '/p', reason: 'bad json' }],
          },
          ollama: modelOk,
        })
      ).toEqual({ headline: '저장 파일 읽기 실패', tone: 'bad' });

      // Degraded is not broken: chat still answers, RAG does not.
      expect(
        verdict({
          storage: { writable: true },
          ollama: { ...modelOk, ok: false, embedModelAvailable: false },
        }).tone
      ).toBe('warn');

      // Not knowing is not the same as knowing it is broken.
      expect(verdict(undefined, '500').tone).toBe('warn');
      expect(verdict(undefined).tone).toBe('warn');

      expect(
        verdict({ storage: { writable: true }, ollama: modelOk })
      ).toEqual({ headline: '모델 준비됨', tone: 'ok' });

      // And the headline helper is the verdict, not a second reading of the
      // same payload - which is the only thing that keeps them together.
      for (const health of [
        { storage: { writable: false }, ollama: modelOk },
        { storage: { writable: true }, ollama: modelOk },
        {
          storage: { writable: true },
          ollama: { ...modelOk, ok: false, chatModelAvailable: false },
        },
      ]) {
        expect(snapsHealthHeadline(health as never, '')).toBe(
          verdict(health).headline
        );
      }
    });

    // Measured against a real DeepSeek 401 and a real no-key start: both came
    // back as 'Ollama 응답 없음'. Wrong engine and wrong cause - it points the
    // operator at a local server that has nothing to do with the failure,
    // while the fix is DEEPSEEK_API_KEY. The two most likely operator
    // failures were the two the headline got wrong.
    it('names the engine that failed and why, not Ollama by default', () => {
      const base = { storage: { dataDir: '/var/snaps', writable: true } };
      const headline = (ollama: Record<string, unknown>) =>
        snapsHealthHeadline({ ...base, ollama } as never, '');

      // No key at all.
      expect(
        headline({
          ok: false,
          provider: 'deepseek',
          chatModelAvailable: false,
          chatKeyConfigured: false,
          embedModelAvailable: true,
          models: [],
          error: 'DEEPSEEK_API_KEY is not configured',
        })
      ).toBe('DeepSeek 키 미설정');

      // A key that the API rejected. Verbatim from a live run against
      // api.deepseek.com with a wrong key.
      expect(
        headline({
          ok: false,
          provider: 'deepseek',
          chatModelAvailable: false,
          chatKeyConfigured: true,
          chatStatus: 401,
          embedModelAvailable: true,
          models: [],
          error:
            '401 {"error":{"message":"Authentication Fails, Your api key: ****0000 is invalid"}}',
        })
      ).toBe('DeepSeek 키 거부됨');

      // Key fine, endpoint unreachable: still DeepSeek, not Ollama.
      expect(
        headline({
          ok: false,
          provider: 'deepseek',
          chatModelAvailable: false,
          chatKeyConfigured: true,
          embedModelAvailable: true,
          models: [],
          error: 'fetch failed',
        })
      ).toBe('DeepSeek 응답 없음');

      // Ollama keeps its own wording - it needs no key, so chatKeyConfigured
      // is absent rather than false and must not be read as missing.
      expect(
        headline({
          ok: false,
          provider: 'ollama',
          chatModelAvailable: false,
          embedModelAvailable: false,
          models: [],
          error: 'fetch failed',
        })
      ).toBe('Ollama 응답 없음');

      // A model that is genuinely absent is still a model problem, on either
      // engine.
      expect(
        headline({
          ok: false,
          provider: 'deepseek',
          chatModelAvailable: false,
          chatKeyConfigured: true,
          chatStatus: 200,
          embedModelAvailable: true,
          models: ['deepseek-flash', 'deepseek-v4-pro'],
        })
      ).toBe('채팅 모델 없음');
    });

    // The shipped default model is not in DeepSeek's /models listing, so every
    // health call probes it with a real completion - and that probe is what
    // fails when the balance runs out or the rate limit trips. Measured before
    // the fix: an exhausted balance, a rate limit, a rejected key, and a 503
    // all came back as '채팅 모델 없음', with chatStatus carrying the listing's
    // 200 rather than the status of the call that actually failed. Four of the
    // five sent the operator to edit DEEPSEEK_CHAT_MODEL, which was fine.
    it('tells an account problem from a model problem', async () => {
      const realFetch = global.fetch;
      const realEnv = { ...process.env };
      const headlineFor = async (status: number, body: string) => {
        process.env.AI_PROVIDER = 'deepseek';
        process.env.DEEPSEEK_API_KEY = 'sk-test';
        process.env.DEEPSEEK_CHAT_MODEL = 'deepseek-v4-flash';
        global.fetch = (async (url: unknown) => {
          const target = String(url);
          if (target.includes('/models')) {
            // The listing omits the configured model, which is what the real
            // API does for the shipped default - so the probe runs.
            return {
              ok: true,
              status: 200,
              json: async () => ({ data: [{ id: 'deepseek-flash' }] }),
            };
          }
          if (target.includes('/chat/completions')) {
            return { ok: false, status, text: async () => body };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ models: [{ name: 'nomic-embed-text:latest' }] }),
          };
        }) as never;
        const health = await new OllamaClient().health();
        return {
          headline: snapsHealthHeadline(
            { ollama: health, storage: { writable: true } } as never,
            ''
          ),
          error: String(health.error || ''),
          chatStatus: (health as never as Record<string, unknown>).chatStatus,
        };
      };

      try {
        const balance = await headlineFor(402, '{"error":{"message":"Insufficient Balance"}}');
        expect(balance.headline).toBe('DeepSeek 잔액 소진');
        // The status of the call that decided the answer, not the listing's.
        expect(balance.chatStatus).toBe(402);
        // And the message must not lead with a claim the status contradicts.
        expect(balance.error).not.toContain('rejected the configured model');
        expect(balance.error).toContain('402');

        const limited = await headlineFor(429, '{"error":{"message":"Rate limit reached"}}');
        expect(limited.headline).toBe('DeepSeek 요청 한도 초과');

        const rejectedKey = await headlineFor(401, '{"error":{"message":"Authentication Fails"}}');
        expect(rejectedKey.headline).toBe('DeepSeek 키 거부됨');

        // 5xx is the service, not the model - a range rather than three rows.
        const down = await headlineFor(503, '{"error":{"message":"Service Unavailable"}}');
        expect(down.headline).toBe('DeepSeek 응답 없음');
        expect(down.error).not.toContain('rejected the configured model');

        // A model that really is wrong still reads as a model problem, and
        // keeps the API's own list of what it would have accepted.
        const wrongModel = await headlineFor(
          400,
          '{"error":{"message":"The supported API model names are deepseek-flash, but you passed deepseek-v9"}}'
        );
        expect(wrongModel.headline).toBe('채팅 모델 없음');
        expect(wrongModel.error).toContain('rejected the configured model');
        expect(wrongModel.error).toContain('deepseek-flash');
      } finally {
        global.fetch = realFetch;
        process.env = realEnv;
      }
    });

    // Five services each called `fs.mkdir(this.dataDir, { recursive: true })`,
    // and a failure there left the route throwing a plain Error. Nest turns
    // anything that is not an HttpException into a 500 whose body says only
    // "Internal server error", so a misconfigured store told the operator
    // nothing: not the path, not the reason, not that a directory was the
    // problem. Measured before the fix: the route threw
    // `EEXIST: file already exists, mkdir '...'` and the client received
    // `{"statusCode":500,"message":"Internal server error"}`.
    it('names the store directory when it cannot be created', async () => {
      const base = path.join(
        process.cwd(),
        'tmp',
        `snaps-ensure-dir-${process.pid}`
      );
      try {
        await fsp.mkdir(base, { recursive: true });

        // The happy path stays quiet and creates the directory.
        const good = path.join(base, 'nested', 'deeper');
        await expect(ensureSnapsDataDir(good)).resolves.toBeUndefined();
        expect((await fsp.stat(good)).isDirectory()).toBe(true);

        // A file where the directory should be.
        const blocked = path.join(base, 'blocked');
        await fsp.writeFile(blocked, 'not a directory', 'utf8');

        let thrown: (Error & { getStatus?: () => number }) | undefined;
        try {
          await ensureSnapsDataDir(blocked);
        } catch (error) {
          thrown = error as Error & { getStatus?: () => number };
        }

        expect(thrown).toBeDefined();
        // An HttpException, or Nest replaces the message with "Internal
        // server error" and the operator learns nothing.
        expect(typeof thrown?.getStatus).toBe('function');
        expect(thrown?.getStatus?.()).toBe(503);
        // The path, so they know which directory, and the reason. Asserted by
        // position, not presence: the OS error inside the parentheses already
        // quotes the path on this platform, so toContain alone passed with the
        // directory dropped from our own half of the sentence.
        const message = String(thrown?.message);
        const reasonStarts = message.indexOf('(');
        expect(reasonStarts).toBeGreaterThan(0);
        expect(message.slice(0, reasonStarts)).toContain(blocked);
        expect(message).toContain('SNAPS_DATA_DIR');
      } finally {
        await fsp.rm(base, { recursive: true, force: true });
      }
    });

    // A Pixelle failure threw a plain Error, and Nest replaces the message of
    // anything that is not an HttpException with "Internal server error" - so
    // the status Pixelle returned and the body it sent were both dropped before
    // the operator saw anything. The Shorts-Maker client in the same product
    // answers with a typed error response instead of throwing, which is why its
    // failures reach the page and these did not.
    it('passes a Pixelle failure to the operator with its status', async () => {
      const llm = {
        get model() {
          return 'jest-pixelle';
        },
        provider() {
          return 'ollama' as const;
        },
        async chatJson() {
          return {
            title: '제목',
            hook: '훅',
            caption: '캡션',
            hashtags: ['#환절기'],
            storyboard: [{ scene: 1, narration: '나레이션', visual: '비주얼' }],
          };
        },
      } as never;

      const previousUrl = process.env.PIXELLE_VIDEO_URL;
      const originalFetch = globalThis.fetch;
      process.env.PIXELLE_VIDEO_URL = 'http://pixelle.invalid';

      try {
        (globalThis as unknown as { fetch: unknown }).fetch = async () =>
          new Response('upstream boom', { status: 502 });

        let thrown: (Error & { getStatus?: () => number }) | undefined;
        try {
          await new SnapsShortVideoService(llm).generate({
            sourceText: '환절기 건강 관리 요령입니다.',
            durationSeconds: 30,
          } as never);
        } catch (error) {
          thrown = error as Error & { getStatus?: () => number };
        }

        expect(thrown).toBeDefined();
        // An HttpException, or the message never leaves the server.
        expect(typeof thrown?.getStatus).toBe('function');
        // What Pixelle actually answered, so the operator can tell a dead
        // service from a rejected request.
        expect(thrown?.message).toContain('502');
        expect(thrown?.message).toContain('upstream boom');
      } finally {
        (globalThis as unknown as { fetch: unknown }).fetch = originalFetch;
        if (previousUrl === undefined) {
          delete process.env.PIXELLE_VIDEO_URL;
        } else {
          process.env.PIXELLE_VIDEO_URL = previousUrl;
        }
      }
    }, 20000);

    // The 120-character bound was applied to the whole file name, so a long URL
    // lost its extension: a 200-character path ending in `.mp4` came back as
    // 120 characters ending in `x`. That name becomes the stored media path,
    // and the path is checked by ValidUrlExtension further down the attach
    // flow - so a long CDN URL turned into a 400 about the file type, for a
    // file whose type was never in question.
    it('keeps the extension when a media file name is trimmed', () => {
      const name = snapsMediaFileName;

      const long = name(
        'https://cdn.example.com/' + 'x'.repeat(200) + '.mp4'
      );
      expect(long.length).toBeLessThanOrEqual(120);
      expect(long.endsWith('.mp4')).toBe(true);

      // Unchanged for names that already fit.
      expect(name('https://cdn.example.com/videos/short.mp4')).toBe('short.mp4');
      expect(
        name('https://cdn.example.com/videos/%ED%99%98%EC%A0%88%EA%B8%B0.mp4')
      ).toBe('환절기.mp4');
      // A query string is not part of the name.
      expect(name('https://cdn.example.com/v/short.mp4?token=abc')).toBe(
        'short.mp4'
      );

      // Nothing that looks like an extension: still bounded, nothing invented.
      const noExtension = name('https://cdn.example.com/' + 'y'.repeat(200));
      expect(noExtension.length).toBe(120);
      expect(noExtension.includes('.')).toBe(false);

      // A long tail after a dot is not an extension, so it is not preserved at
      // the cost of the whole name.
      const longTail = name(
        'https://cdn.example.com/' + 'z'.repeat(200) + '.' + 'q'.repeat(40)
      );
      // Length alone does not distinguish the two behaviours - preserving
      // the tail also lands on 120. What distinguishes them is whether any
      // of the tail is still there.
      expect(longTail).toBe('z'.repeat(120));

      // A name short enough to keep whole never reaches the suffix logic.
      expect(name('https://cdn.example.com/.hidden')).toBe('.hidden');

      // Only the last path segment is used, so traversal cannot escape.
      expect(name('https://cdn.example.com/a/../..%2fetc/passwd')).toBe('passwd');
    });

    it('derives a single-line title from the headline the model wrote', () => {
      const service = new SnapsContentTransformService(
        {} as never,
        {} as never
      );
      const derive = (value: string) =>
        (service as unknown as { makeTitle(input: string): string }).makeTitle(
          value
        );

      const title = derive(
        [
          '환절기 면역력 지키는 3가지',
          '',
          '일교차가 커지면 몸이 먼저 지칩니다. 실내 습도 50% 이상, 손 씻기.',
          '',
          '#환절기 #건강관리',
        ].join('\n')
      );

      expect(title).toBe('환절기 면역력 지키는 3가지');
      expect(title).not.toMatch(/[\r\n]/);

      // A first line too short to be a headline - a stray bullet or number -
      // falls back to the whole block, which is the path that used to carry
      // the newlines through.
      const fallback = derive(
        ['1.', '실내 습도 50% 이상을 유지하고 손을 꼼꼼히 씻으세요.'].join('\n')
      );

      expect(fallback).not.toMatch(/[\r\n]/);
    });

    // The same slice counted UTF-16 units, so a cut inside an emoji left a
    // dangling high surrogate - which is not encodable as UTF-8 and reaches
    // the platform as a replacement character - or tore a ZWJ family sequence
    // into separate people.
    it('never cuts a derived title inside a character', () => {
      const service = new SnapsContentTransformService(
        {} as never,
        {} as never
      );
      const derive = (value: string) =>
        (service as unknown as { makeTitle(input: string): string }).makeTitle(
          value
        );

      const broken: string[] = [];
      for (let pad = 40; pad <= 60; pad += 1) {
        for (const emoji of ['🧊', '👨‍👩‍👧‍👦']) {
          const title = derive(
            '가'.repeat(pad) + emoji + ' 뒤에 더 긴 문장이 이어집니다 여기까지'
          );
          const last = title.charCodeAt(title.length - 1);
          if (last >= 0xd800 && last <= 0xdbff) {
            broken.push(`pad=${pad} dangling surrogate`);
          }
          if (/\u200d$/.test(title)) {
            broken.push(`pad=${pad} trailing zero-width joiner`);
          }
        }
      }

      expect(broken).toEqual([]);
    });

    it('ends a clamped title at a word boundary', () => {
      const service = new SnapsContentTransformService(
        {} as never,
        {} as never
      );
      const title = (
        service as unknown as { makeTitle(input: string): string }
      ).makeTitle(
        '환절기에는 일교차가 커지면서 면역력이 떨어지기 쉽습니다. 실내 습도를 오십 퍼센트 이상으로 유지하세요.'
      );

      expect(title.length).toBeLessThanOrEqual(48);
      // The source continues past the clamp, so the title has to be a prefix
      // that stops where a word does rather than mid-word.
      expect(title.endsWith('퍼센트')).toBe(true);
    });

    it('leaves platforms that do not publish a title alone', async () => {
      const result = await transform(['threads', 'x']);
      for (const variant of result.variants) {
        expect(variant.title).toBeUndefined();
      }
    });

    it('does not leak Title:/Description: scaffolding into the body', async () => {
      const result = await transform(['youtube']);
      expect(result.variants[0].content).not.toContain('Title:');
      expect(result.variants[0].content).not.toContain('Description:');
    });

    it('publishes the YouTube title without the body or hashtags', async () => {
      const result = await transform(['youtube']);
      const payload = buildSnapsPublishingPayload({
        variants: result.variants as never,
        integrations: [{ platform: 'youtube', integrationId: 'y1' }] as never,
        scheduleType: 'draft',
      });
      const title = (payload.payload as { posts?: Array<{ settings?: { title?: string } }> })
        ?.posts?.[0]?.settings?.title;

      expect(title).toBeTruthy();
      expect(title).not.toContain('Title:');
      expect(title).not.toContain('#');
    });
  });

  // The video variant builder hardcoded its hashtags, so attaching a video to
  // Instagram Reels or TikTok tagged it "#shorts" - YouTube's convention. The
  // shorts script fallback was fixed to read the shared table; this file was
  // the sibling that still had the old behaviour.
  describe('video variants use the per-platform hashtags', () => {
    const variants = () =>
      buildSnapsVideoVariants({
        videoUrl: 'https://example.test/v.mp4',
        mediaId: 'm1',
        title: '제목',
        caption: '캡션',
      });

    const tagsFor = (platform: string) =>
      variants().variants.find((variant) => variant.platform === platform)?.hashtags ?? [];

    it('does not tag TikTok or Reels with the YouTube shorts tag', () => {
      expect(tagsFor('tiktok')).not.toContain('#shorts');
      expect(tagsFor('instagram')).not.toContain('#shorts');
      expect(tagsFor('youtube')).toContain('#shorts');
    });

    it('takes the defaults from the shared platform rules', () => {
      for (const platform of ['instagram', 'youtube', 'tiktok'] as const) {
        for (const tag of snapsPlatformRules[platform].defaultHashtags) {
          expect(tagsFor(platform)).toContain(tag);
        }
      }
    });

    it('respects each platform hashtag limit', () => {
      for (const platform of ['instagram', 'youtube', 'tiktok'] as const) {
        const limit = snapsPlatformRules[platform].hashtagLimit ?? 20;
        expect(tagsFor(platform).length).toBeLessThanOrEqual(limit);
      }
    });
  });

  // Segmenting was keyed on the literal platform name with the 500-character
  // limit hardcoded, duplicating snapsPlatformRules.threads.postMaxLength.
  describe('post segmentation follows the platform rule', () => {
    const segmentsFor = (platform: string, content: string) => {
      const result = buildSnapsPublishingPayload({
        variants: [
          {
            platform,
            label: platform,
            content,
            hashtags: [],
            settings: buildDefaultSettings(platform as SnapsTargetPlatform),
            publishMode: 'schedule',
            media: [],
          },
        ] as never,
        integrations: [{ platform, integrationId: `${platform}-1` }] as never,
        scheduleType: 'draft',
      });
      const posts = (result.payload as {
        posts?: Array<{ value?: Array<{ content?: string }> }>;
      })?.posts;
      return posts?.[0]?.value ?? [];
    };

    it('splits threads content at the rule limit, not a hardcoded number', () => {
      const limit = snapsPlatformRules.threads.postMaxLength!;
      const long = Array.from({ length: 6 }, (_, i) => `단락 ${i + 1} ` + '가'.repeat(200)).join(
        '\n\n'
      );
      const segments = segmentsFor('threads', long);

      expect(segments.length).toBeGreaterThan(1);
      for (const segment of segments) {
        expect((segment.content || '').length).toBeLessThanOrEqual(limit);
      }
    });

    it('does not segment a platform without postMaxLength', () => {
      // linkedin has no postMaxLength, so its 3000-character budget is one post.
      const long = '가'.repeat(2000);
      expect(segmentsFor('linkedin', long)).toHaveLength(1);
    });

    it('leaves short threads content as a single post', () => {
      expect(segmentsFor('threads', '짧은 글입니다.')).toHaveLength(1);
    });
  });

  // CreatePostDto needs at least one PostContent (@ArrayMinSize(1)) and
  // ValidContent rejects a blank body unless the post carries images. An empty
  // variant used to build a payload the API refuses.
  describe('a variant that cannot form a valid post is skipped', () => {
    const build = (platform: string, content: string, media: unknown[] = []) =>
      buildSnapsPublishingPayload({
        variants: [
          {
            platform,
            label: platform,
            content,
            hashtags: [],
            settings: buildDefaultSettings(platform as SnapsTargetPlatform),
            publishMode: 'schedule',
            media,
          },
        ] as never,
        integrations: [{ platform, integrationId: `${platform}-1` }] as never,
        scheduleType: 'draft',
      });

    it('skips an empty variant instead of emitting an invalid payload', () => {
      for (const [platform, content] of [
        ['threads', ''],
        ['threads', '   '],
        ['x', ''],
        ['x', '   '],
      ] as const) {
        const result = build(platform, content);
        expect(result.payload).toBeUndefined();
        expect(result.warnings.join(' ')).toContain('본문과 미디어가 모두 없어');
      }
    });

    it('keeps an image-only post, which ValidContent allows', () => {
      const result = build('x', '', [{ id: 'm1', path: 'https://cdn.test/a.png' }]);
      const posts = (result.payload as { posts?: unknown[] })?.posts;
      expect(posts).toHaveLength(1);
      expect(result.warnings.join(' ')).not.toContain('본문과 미디어가 모두 없어');
    });

    it('never emits a post with an empty value array', () => {
      const result = build('threads', '본문입니다.');
      const posts = (result.payload as { posts?: Array<{ value?: unknown[] }> })?.posts;
      expect(posts?.[0]?.value?.length).toBeGreaterThanOrEqual(1);
    });
  });

  // buildPostValues is the single point where a variant's media becomes a
  // post's image list, so it has to hold the attachment limit for callers that
  // never go through the card news builder - a direct /snaps/schedule-variants
  // request with its own variants, for instance.
  describe('the publishing payload clamps attachments for any caller', () => {
    const payloadFor = (platform: string, mediaCount: number) =>
      buildSnapsPublishingPayload({
        variants: [
          {
            platform,
            label: platform,
            content: '본문입니다.',
            hashtags: [],
            settings: buildDefaultSettings(platform as SnapsTargetPlatform),
            publishMode: 'schedule',
            media: Array.from({ length: mediaCount }, (_, index) => ({
              id: `m-${index + 1}`,
              path: `local://m-${index + 1}.png`,
            })),
          },
        ] as never,
        integrations: [{ platform, integrationId: `${platform}-1` }] as never,
        scheduleType: 'draft',
      });

    const imagesOf = (result: ReturnType<typeof buildSnapsPublishingPayload>) => {
      const posts = (result.payload as {
        posts?: Array<{ value?: Array<{ image?: unknown[] }> }>;
      })?.posts;
      return posts?.[0]?.value?.[0]?.image ?? [];
    };

    it('trims caller-supplied attachments to the X limit', () => {
      expect(imagesOf(payloadFor('x', 10))).toHaveLength(4);
    });

    it('leaves a platform without a verified limit alone', () => {
      expect(imagesOf(payloadFor('threads', 10))).toHaveLength(10);
    });

    it('does not touch a payload that already fits', () => {
      expect(imagesOf(payloadFor('x', 3))).toHaveLength(3);
      expect(imagesOf(payloadFor('instagram', 10))).toHaveLength(10);
    });
  });

  // Captions and hashtags were clamped per platform from the start; the
  // attachment count was not, so a ten-slide deck was handed to X - which
  // takes four - and the provider rejected the post at publish time.
  describe('card news attachments respect the platform limit', () => {
    const deckOf = (slideCount: number) =>
      buildSnapsCardNewsVariants({
        title: '환절기 건강',
        caption: '캡션입니다.',
        hashtags: ['#환절기'],
        slides: Array.from({ length: slideCount }, (_, index) => ({
          id: `slide-${index + 1}`,
          path: `local://slide-${index + 1}.png`,
          alt: '슬라이드',
        })),
        targetPlatforms: ['x', 'instagram', 'threads'] as never,
      });

    const mediaFor = (result: ReturnType<typeof buildSnapsCardNewsVariants>, platform: string) =>
      result.variants.find((variant) => variant.platform === platform)?.media ?? [];

    it('trims a ten-slide deck to four for X', () => {
      const result = deckOf(10);
      expect(mediaFor(result, 'x')).toHaveLength(4);
      expect(mediaFor(result, 'instagram')).toHaveLength(10);
    });

    it('leaves platforms without a verified limit untouched', () => {
      const result = deckOf(10);
      // threads has no mediaLimit, so it keeps the whole deck.
      expect(mediaFor(result, 'threads')).toHaveLength(10);
    });

    it('does not trim when the deck already fits', () => {
      const result = deckOf(4);
      expect(mediaFor(result, 'x')).toHaveLength(4);
      expect(result.warnings).toHaveLength(0);
    });

    it('reports the trim so the operator is told', () => {
      const result = deckOf(10);
      expect(result.warnings.join(' ')).toContain('X');
      expect(result.warnings.join(' ')).toContain('4');
      expect(result.warnings.join(' ')).toContain('10');
    });

    it('keeps the shared media list at full length', () => {
      // The deck itself is not trimmed - only each platform's copy is.
      expect(deckOf(10).media).toHaveLength(10);
    });
  });

  // Assist platforms never auto-publish, so they drop out of the schedulable
  // filter. They used to drop out silently, and the empty-result message keyed
  // on whether any warning had been pushed rather than on why nothing was
  // schedulable.
  describe('assist platforms are reported, not silently dropped', () => {
    const variant = (platform: string, publishMode: 'schedule' | 'assist') => ({
      platform,
      label: platform,
      content: `${platform} 본문입니다.`,
      hashtags: [],
      settings: buildDefaultSettings(platform as SnapsTargetPlatform),
      publishMode,
    });

    const build = (variants: unknown[], integrations: unknown[]) =>
      buildSnapsPublishingPayload({
        variants: variants as never,
        integrations: integrations as never,
        scheduleType: 'draft',
      });

    it('names the assist variant that was not scheduled alongside a real post', () => {
      const result = build(
        [variant('threads', 'schedule'), variant('naver-blog', 'assist')],
        [
          { platform: 'threads', integrationId: 'th-1' },
          { platform: 'naver-blog', integrationId: 'nb-1' },
        ]
      );

      expect((result.payload as { posts?: unknown[] })?.posts).toHaveLength(1);
      expect(result.warnings.join(' ')).toContain('naver-blog');
      expect(result.warnings.join(' ')).toContain('자동 게시를 지원하지 않는 채널');
    });

    it('explains an assist-only run instead of blaming missing integrations', () => {
      const result = build(
        [variant('kakao-talk', 'assist')],
        [{ platform: 'kakao-talk', integrationId: 'kt-1' }]
      );

      expect(result.payload).toBeUndefined();
      const joined = result.warnings.join(' ');
      expect(joined).toContain('자동 게시를 지원하지 않아');
      // The integration was connected, so the old message was simply untrue.
      expect(joined).not.toContain('예약할 수 있는 연결된 채널이 전달되지 않았습니다.');
    });

    it('still reports a genuinely missing integration', () => {
      const result = build([variant('threads', 'schedule')], []);

      expect(result.payload).toBeUndefined();
      expect(result.warnings.join(' ')).toContain(
        '예약할 수 있는 연결된 채널이 전달되지 않았습니다.'
      );
    });

    it('says nothing about assist platforms when none were requested', () => {
      const result = build(
        [variant('threads', 'schedule')],
        [{ platform: 'threads', integrationId: 'th-1' }]
      );

      expect(result.warnings.join(' ')).not.toContain('assist');
    });
  });

  // A provider settings DTO field that snaps never supplies reaches the
  // provider as undefined. TikTok required seven such fields and X one, which
  // only surfaced by checking the DTOs rather than the happy path.
  describe('default settings satisfy the provider DTOs', () => {
    const requiredFields: Record<string, string[]> = {
      // Fields without @IsOptional in the matching provider settings DTO.
      tiktok: [
        'privacy_level',
        'duet',
        'stitch',
        'comment',
        'autoAddMusic',
        'brand_content_toggle',
        'brand_organic_toggle',
        'content_posting_method',
      ],
      x: ['who_can_reply_post'],
      instagram: ['post_type'],
      youtube: ['title', 'type'],
    };

    it('supplies every required field for each platform it schedules to', () => {
      for (const [platform, fields] of Object.entries(requiredFields)) {
        const settings = buildDefaultSettings(platform as SnapsTargetPlatform) as Record<
          string,
          unknown
        >;
        for (const field of fields) {
          expect(`${platform}.${field}=${settings[field]}`).not.toContain('=undefined');
        }
      }
    });

    // YoutubeSettingsDto.type is the privacy status the provider forwards as
    // privacyStatus, not the video format. It was set to 'short', which is not
    // an accepted value, so every snaps YouTube post carried an invalid one.
    // InstagramDto.post_type is @IsIn(['post', 'story']) - there is no 'reel'
    // value. The video builder set one anyway, and both the smoke test and a
    // static guard required it, so nothing contradicted the mistake.
    it('gives Instagram video variants an accepted post_type', () => {
      const variants = buildSnapsVideoVariants({
        videoUrl: 'https://example.test/v.mp4',
        mediaId: 'm1',
        title: '제목',
        caption: '캡션',
      }).variants;
      const instagram = variants.find((variant) => variant.platform === 'instagram');
      const postType = (instagram?.settings as Record<string, unknown>)?.post_type;

      expect(['post', 'story']).toContain(postType);
      expect(postType).not.toBe('reel');
    });

    it('sets a YouTube privacy status the provider accepts', () => {
      const youtube = buildDefaultSettings('youtube' as SnapsTargetPlatform) as Record<
        string,
        unknown
      >;
      expect(['public', 'private', 'unlisted']).toContain(youtube.type);
      expect(youtube.type).not.toBe('short');
    });

    // The blank title is a sentinel: prepareSchedulableVariant reads a falsy
    // settings.title as "not set" and derives a real one from the variant.
    // Seeding a value would win over that and title every post the same.
    it('keeps the YouTube title seed empty so the real title wins', () => {
      const youtube = buildDefaultSettings('youtube' as SnapsTargetPlatform) as Record<
        string,
        unknown
      >;
      expect(youtube.title).toBe('');

      const payload = buildSnapsPublishingPayload({
        variants: [
          {
            platform: 'youtube',
            label: 'YouTube',
            content: '본문입니다.',
            hashtags: [],
            title: '진짜 제목',
            settings: youtube,
            publishMode: 'schedule',
            media: [],
          },
        ] as never,
        integrations: [{ platform: 'youtube', integrationId: 'y1' }] as never,
        scheduleType: 'draft',
      });
      const posts = (payload.payload as { posts?: Array<{ settings?: { title?: string } }> })
        ?.posts;
      expect(posts?.[0]?.settings?.title).toBe('진짜 제목');
    });

    it('uses the enum values the provider DTOs accept', () => {
      const tiktok = buildDefaultSettings('tiktok' as SnapsTargetPlatform) as Record<
        string,
        unknown
      >;
      expect([
        'PUBLIC_TO_EVERYONE',
        'MUTUAL_FOLLOW_FRIENDS',
        'FOLLOWER_OF_CREATOR',
        'SELF_ONLY',
      ]).toContain(tiktok.privacy_level);
      expect(['DIRECT_POST', 'UPLOAD']).toContain(tiktok.content_posting_method);
      expect(['yes', 'no']).toContain(tiktok.autoAddMusic);
      for (const flag of ['duet', 'stitch', 'comment', 'brand_content_toggle', 'brand_organic_toggle']) {
        expect(typeof tiktok[flag]).toBe('boolean');
      }

      const x = buildDefaultSettings('x' as SnapsTargetPlatform) as Record<string, unknown>;
      expect(['everyone', 'following', 'mentionedUsers', 'subscribers', 'verified']).toContain(
        x.who_can_reply_post
      );
    });

    it('keeps the discriminator every settings union member needs', () => {
      for (const platform of snapsTargetPlatforms) {
        const settings = buildDefaultSettings(platform) as Record<string, unknown>;
        expect(settings.__type).toBe(platform);
      }
    });
  });

  // buildDefaultSettings('youtube') seeds title: '', and only the video path
  // filled it. A YouTube variant coming from the transform flow reached the
  // provider with an empty title.
  describe('YouTube scheduling always carries a title', () => {
    const youtubePayload = (variant: Record<string, unknown>) =>
      buildSnapsPublishingPayload({
        variants: [
          {
            platform: 'youtube',
            label: 'YouTube',
            content: '환절기 건강 관리 핵심만 정리했습니다. 습도를 유지하세요.',
            hashtags: ['#shorts'],
            settings: { __type: 'youtube', title: '', type: 'short' },
            publishMode: 'schedule',
            ...variant,
          },
        ] as never,
        integrations: [{ platform: 'youtube', integrationId: 'yt-1' }],
        scheduleType: 'draft',
      });

    const titleOf = (result: ReturnType<typeof buildSnapsPublishingPayload>) => {
      const posts = (result.payload as { posts?: Array<{ settings?: { title?: string } }> })
        ?.posts;
      return posts?.[0]?.settings?.title;
    };

    it('derives a title from the variant when the settings title is empty', () => {
      expect(titleOf(youtubePayload({ title: '환절기 건강 쇼츠' }))).toBe('환절기 건강 쇼츠');
    });

    it('falls back to the content when neither title is set', () => {
      const title = titleOf(youtubePayload({}));
      expect(title).toBeTruthy();
      expect(title).toContain('환절기');
      expect((title || '').length).toBeLessThanOrEqual(100);
    });

    it('keeps an explicitly supplied settings title', () => {
      const title = titleOf(
        youtubePayload({
          title: '변형 제목',
          settings: { __type: 'youtube', title: '직접 지정한 제목', type: 'short' },
        })
      );
      expect(title).toBe('직접 지정한 제목');
    });

    // A variant with no body and no media is now skipped outright - it could
    // never form a valid post. The 'snaps 쇼츠' fallback covers the case that is
    // still publishable: media present, but no usable title anywhere.
    it('never leaves the YouTube title empty', () => {
      const title = titleOf(
        youtubePayload({
          content: '   ',
          title: '   ',
          media: [{ id: 'm1', path: 'https://cdn.test/a.mp4' }],
        })
      );
      expect(title).toBe('snaps 쇼츠');
    });

    it('skips a YouTube variant with neither body nor media', () => {
      const result = youtubePayload({ content: '   ', title: '   ' });
      expect(result.payload).toBeUndefined();
      expect(result.warnings.join(' ')).toContain('본문과 미디어가 모두 없어');
    });

    // YoutubeSettingsDto declares @MinLength(2) @MaxLength(100). Only the
    // upper bound was enforced, so a one-character title reached the provider
    // and failed validation.
    it('satisfies both YouTube title bounds', () => {
      expect(titleOf(youtubePayload({ title: 'A', content: '본문입니다.' }))).toBe('snaps 쇼츠');
      expect(titleOf(youtubePayload({ title: 'A', content: 'B' }))).toBe('snaps 쇼츠');

      const long = titleOf(youtubePayload({ title: '가'.repeat(150), content: '본문' })) || '';
      expect(long.length).toBe(100);

      for (const candidate of [
        youtubePayload({ title: '환절기 건강', content: '본문' }),
        youtubePayload({ title: '', content: '환절기 건강 관리 본문입니다.' }),
        youtubePayload({
          content: '   ',
          title: '   ',
          media: [{ id: 'm1', path: 'https://cdn.test/a.mp4' }],
        }),
      ]) {
        const value = titleOf(candidate) || '';
        expect(value.length).toBeGreaterThanOrEqual(2);
        expect(value.length).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('shorts fallback honours the chosen platform', () => {
    const offlineShorts = () =>
      new SnapsShortVideoService({
        get model() {
          return 'offline';
        },
        provider() {
          return 'ollama' as const;
        },
        async chatJson() {
          throw new Error('force deterministic fallback');
        },
        async embed() {
          return [[0]];
        },
      } as any);

    const scriptFor = (platform: string) =>
      offlineShorts().script({
        sourceText: '환절기 건강 관리가 중요합니다. 습도를 유지하세요.',
        durationSeconds: 45,
        platform,
      } as any);

    it('uses the per-platform default hashtags, not YouTube shorts tags', async () => {
      const youtube = await scriptFor('youtube');
      const tiktok = await scriptFor('tiktok');
      const instagram = await scriptFor('instagram');

      expect(youtube.hashtags).toContain('#shorts');
      expect(tiktok.hashtags).not.toContain('#shorts');
      expect(instagram.hashtags).not.toContain('#shorts');
      expect(new Set([
        youtube.hashtags.join(','),
        tiktok.hashtags.join(','),
        instagram.hashtags.join(','),
      ]).size).toBe(3);
    });

    it('names the chosen platform in the title and upload metadata', async () => {
      expect((await scriptFor('youtube')).title).toContain('Shorts');
      expect((await scriptFor('tiktok')).title).toContain('TikTok');
      expect((await scriptFor('instagram')).title).toContain('Reels');
      expect((await scriptFor('instagram')).uploadMetadata.title).toContain('Reels');
    });

    it('respects each platform hashtag limit', async () => {
      for (const platform of ['youtube', 'tiktok', 'instagram']) {
        const script = await scriptFor(platform);
        const limit = snapsPlatformRules[platform as SnapsTargetPlatform].hashtagLimit ?? 20;
        expect(script.hashtags.length).toBeLessThanOrEqual(limit);
      }
    });
  });

  describe('shorts storyboard timeline', () => {
    const scriptFrom = (storyboard: unknown[], durationSeconds = 45) => ({
      get model() {
        return 'stub-shorts';
      },
      provider() {
        return 'ollama' as const;
      },
      async chatJson() {
        return {
          title: '환절기 건강',
          coreSummary: '요약',
          hook: '훅',
          durationSeconds,
          narration: '내레이션',
          storyboard,
          caption: '캡션',
          uploadMetadata: { title: 't', description: 'd', hashtags: [] },
          hashtags: [],
        };
      },
      async embed() {
        return [[0]];
      },
    });

    const assertCovers = (
      storyboard: Array<{ startSecond: number; endSecond: number; scene: number }>,
      durationSeconds: number
    ) => {
      expect(storyboard[0].startSecond).toBe(0);
      expect(storyboard[storyboard.length - 1].endSecond).toBe(durationSeconds);
      storyboard.forEach((scene, index) => {
        expect(scene.scene).toBe(index + 1);
        expect(scene.endSecond).toBeGreaterThan(scene.startSecond);
        if (index > 0) {
          expect(scene.startSecond).toBe(storyboard[index - 1].endSecond);
        }
      });
    };

    // This is the exact timeline the live DeepSeek API returned: endSecond read
    // as inclusive, so every scene boundary left a second of dead air.
    it('closes the gaps left by an inclusive-endSecond response', async () => {
      const service = new SnapsShortVideoService(
        scriptFrom(
          [
            [0, 5],
            [6, 14],
            [15, 23],
            [24, 32],
            [33, 41],
            [42, 45],
          ].map(([startSecond, endSecond], index) => ({
            scene: index + 1,
            startSecond,
            endSecond,
            visual: `장면 ${index + 1}`,
            narration: '내레이션',
            overlayText: '자막',
            pixellePrompt: '프롬프트',
          }))
        ) as any
      );

      const script = await service.script({ sourceText: '원문', durationSeconds: 45 });
      assertCovers(script.storyboard, 45);
    });

    it('does not let an over-long scene swallow the scenes after it', async () => {
      const service = new SnapsShortVideoService(
        scriptFrom(
          [
            { scene: 1, startSecond: 0, endSecond: 45, visual: 'a', narration: 'n', overlayText: 'o', pixellePrompt: 'p' },
            { scene: 2, startSecond: 0, endSecond: 45, visual: 'b', narration: 'n', overlayText: 'o', pixellePrompt: 'p' },
            { scene: 3, startSecond: 0, endSecond: 45, visual: 'c', narration: 'n', overlayText: 'o', pixellePrompt: 'p' },
          ],
          45
        ) as any
      );

      const script = await service.script({ sourceText: '원문', durationSeconds: 45 });
      assertCovers(script.storyboard, 45);
      expect(script.storyboard).toHaveLength(3);
    });

    it('renumbers scenes the model returned out of order', async () => {
      const service = new SnapsShortVideoService(
        scriptFrom(
          [
            { scene: 3, startSecond: 0, endSecond: 10, visual: 'a', narration: 'n', overlayText: 'o', pixellePrompt: 'p' },
            { scene: 3, startSecond: 10, endSecond: 20, visual: 'b', narration: 'n', overlayText: 'o', pixellePrompt: 'p' },
            { scene: 7, startSecond: 20, endSecond: 45, visual: 'c', narration: 'n', overlayText: 'o', pixellePrompt: 'p' },
          ],
          45
        ) as any
      );

      const script = await service.script({ sourceText: '원문', durationSeconds: 45 });
      expect(script.storyboard.map((scene) => scene.scene)).toEqual([1, 2, 3]);
      assertCovers(script.storyboard, 45);
    });
  });

  // DeepSeek's /models lists canonical ids only and omits working aliases, so
  // requiring membership reported the shipped default (deepseek-v4-flash) as
  // broken even though it answers completions.
  describe('DeepseekClient health accepts an unlisted but working model', () => {
    const clientWith = (listed: string[], completionOk: boolean) => {
      const client = new DeepseekClient() as unknown as Record<string, unknown> & {
        health: () => Promise<{ ok: boolean; modelAvailable: boolean; error?: string }>;
      };
      (client as Record<string, unknown>).apiKey = 'test-key';
      (client as Record<string, unknown>).chatModel = 'deepseek-v4-flash';
      (client as Record<string, unknown>).fetchWithTimeout = async (url: string) => {
        if (url.endsWith('/models')) {
          return {
            ok: true,
            async json() {
              return { data: listed.map((id) => ({ id })) };
            },
          };
        }
        return {
          ok: completionOk,
          status: completionOk ? 200 : 400,
          async text() {
            return completionOk
              ? ''
              : JSON.stringify({
                  error: {
                    message:
                      'The supported API model names are deepseek-flash, deepseek-v4-pro, but you passed deepseek-v4-flash.',
                  },
                });
          },
        };
      };
      return client;
    };

    it('reports ok when the model answers even though it is not listed', async () => {
      const health = await clientWith(['deepseek-flash'], true).health();
      expect(health.modelAvailable).toBe(true);
      expect(health.ok).toBe(true);
      expect(health.error).toBeUndefined();
    });

    it('reports not-ok when the model is neither listed nor accepted', async () => {
      const health = await clientWith(['deepseek-flash'], false).health();
      expect(health.modelAvailable).toBe(false);
      expect(health.ok).toBe(false);
      expect(health.error).toContain('rejected the configured model');
    });

    // The probe answered with a bare boolean, so a wrong model, an exhausted
    // balance and a rate limit all reported the same thing. Measured against
    // the live endpoint, a wrong model comes back with the list of names that
    // would work - the fix itself, and it used to be thrown away.
    it('carries the reason the probe failed, not just that it did', async () => {
      const health = await clientWith(['deepseek-flash'], false).health();
      expect(health.error).toContain('400');
      expect(health.error).toContain('deepseek-v4-pro');
    });

    // The failure that is not about the model at all. An operator told only
    // that the model was rejected goes and edits DEEPSEEK_CHAT_MODEL.
    it('says when the probe timed out rather than blaming the model', async () => {
      const client = clientWith(['deepseek-flash'], false);
      (client as Record<string, unknown>).fetchWithTimeout = async (url: string) => {
        if (url.endsWith('/models')) {
          return {
            ok: true,
            async json() {
              return { data: [{ id: 'deepseek-flash' }] };
            },
          };
        }
        throw new Error('The operation was aborted due to timeout');
      };
      const health = await client.health();
      expect(health.modelAvailable).toBe(false);
      expect(health.error).toContain('aborted due to timeout');
    });

    it('does not probe a completion when the model is listed', async () => {
      let completionCalls = 0;
      const client = clientWith(['deepseek-v4-flash'], true);
      const original = (client as Record<string, unknown>).fetchWithTimeout as (u: string) => unknown;
      (client as Record<string, unknown>).fetchWithTimeout = async (url: string) => {
        if (!url.endsWith('/models')) completionCalls += 1;
        return original(url);
      };
      const health = await client.health();
      expect(health.ok).toBe(true);
      expect(completionCalls).toBe(0);
    });
  });

  describe('OllamaClient health probe scheduling', () => {
    const previousProvider = process.env.AI_PROVIDER;

    afterEach(() => {
      if (previousProvider === undefined) {
        delete process.env.AI_PROVIDER;
      } else {
        process.env.AI_PROVIDER = previousProvider;
      }
    });

    // The Ollama tags probe and the DeepSeek probe hit unrelated hosts. Running
    // them in sequence made a DeepSeek-only host wait out the full local Ollama
    // timeout - which retries once on the IPv4 fallback - before the DeepSeek
    // probe started. Assert the overlap by call order rather than wall clock so
    // the test cannot flake.
    it('probes the embedding host and DeepSeek concurrently', async () => {
      process.env.AI_PROVIDER = 'deepseek';
      const order: string[] = [];
      const settle = () => new Promise((resolve) => setImmediate(resolve));

      const client = new OllamaClient() as any;
      client.embedHealth = async () => {
        order.push('embed:start');
        await settle();
        order.push('embed:end');
        return {
          chatModelAvailable: false,
          embedModelAvailable: true,
          models: ['nomic-embed-text:latest'],
        };
      };
      client.deepseek = {
        model: 'deepseek-chat',
        async health() {
          order.push('chat:start');
          await settle();
          order.push('chat:end');
          return {
            ok: true,
            baseUrl: 'https://api.deepseek.com',
            chatModel: 'deepseek-chat',
            modelAvailable: true,
            models: ['deepseek-chat'],
          };
        },
      };

      const health = await client.health();

      expect(health.provider).toBe('deepseek');
      expect(health.ok).toBe(true);
      expect(order.indexOf('chat:start')).toBeLessThan(order.indexOf('embed:end'));
    });

    it('still resolves the ollama branch without touching DeepSeek', async () => {
      process.env.AI_PROVIDER = 'ollama';
      const client = new OllamaClient() as any;
      client.embedHealth = async () => ({
        chatModelAvailable: true,
        embedModelAvailable: true,
        models: ['qwen3.5:9b', 'nomic-embed-text:latest'],
      });
      client.deepseek = {
        model: 'deepseek-chat',
        async health() {
          throw new Error('DeepSeek must not be probed when provider is ollama');
        },
      };

      const health = await client.health();
      expect(health.provider).toBe('ollama');
      expect(health.ok).toBe(true);
      expect(health.missingModels).toEqual([]);
    });
  });

  describe('video and card news platform normalization', () => {
    it('defaults to every supported platform when the caller names none', () => {
      expect(normalizeVideoPlatforms(undefined).sort()).toEqual(
        ['instagram', 'tiktok', 'youtube'].sort()
      );
      expect(normalizeCardNewsPlatforms(undefined).length).toBeGreaterThan(1);
    });

    it('keeps only the supported platforms out of a mixed request', () => {
      expect(normalizeVideoPlatforms(['x', 'tiktok'] as any)).toEqual(['tiktok']);
      expect(normalizeCardNewsPlatforms(['youtube', 'threads'] as any)).toEqual(['threads']);
    });

    // Short-form video cannot go to x/linkedin, and a card news carousel cannot
    // go to youtube. When the caller explicitly names only unsupported
    // platforms, both builders must report an empty selection so the caller is
    // told - silently scheduling nothing, or silently fanning out to platforms
    // that were never requested, both hide the mistake.
    it('reports an empty selection when every named platform is unsupported', () => {
      expect(normalizeVideoPlatforms(['x', 'linkedin'] as any)).toEqual([]);
      expect(normalizeCardNewsPlatforms(['youtube', 'tiktok'] as any)).toEqual([]);
    });
  });

  describe('SnapsCardNewsService model deck', () => {
    const ollamaReturning = (deck: unknown) => ({
      get model() {
        return 'stub-card-news';
      },
      provider() {
        return 'ollama' as const;
      },
      async chatJson<T>(): Promise<T> {
        return deck as T;
      },
      async embed() {
        return [[0]];
      },
    });

    it('does not pad a short model response with repeated closing slides', async () => {
      // The model is told to return exactly slideCount slides but does not
      // always comply. Padding the tail out of the fallback deck re-used the
      // last fallback slide for every missing index, so a 3-of-6 response
      // shipped three identical closing slides.
      const service = new SnapsCardNewsService(
        ollamaReturning({
          title: '환절기 건강',
          slides: [
            { order: 1, eyebrow: '01', heading: '표지', body: '표지 문장.' },
            { order: 2, eyebrow: '02', heading: '포인트', body: '본문 문장.' },
            { order: 3, eyebrow: '03', heading: '마무리', body: '마무리 문장.' },
          ],
          caption: '캡션',
          hashtags: ['#환절기'],
        }) as any
      );

      const deck = await service.script({
        sourceText: '환절기에는 실내 습도를 적정하게 유지하는 것이 중요합니다.',
        slideCount: 6,
      });

      const bodies = deck.slides.map((slide) => slide.body);
      expect(new Set(bodies).size).toBe(bodies.length);
      expect(deck.slides.length).toBe(3);
      expect(deck.slides.map((slide) => slide.order)).toEqual([1, 2, 3]);
    });

    it('still clamps a long model response down to the requested slide count', async () => {
      const service = new SnapsCardNewsService(
        ollamaReturning({
          title: '길이 초과',
          slides: Array.from({ length: 9 }, (_, index) => ({
            order: index + 1,
            eyebrow: String(index + 1).padStart(2, '0'),
            heading: `제목 ${index + 1}`,
            body: `본문 ${index + 1}.`,
          })),
          caption: '캡션',
          hashtags: [],
        }) as any
      );

      const deck = await service.script({ sourceText: '원문입니다.', slideCount: 5 });
      expect(deck.slides.length).toBe(5);
      expect(deck.slides.map((slide) => slide.order)).toEqual([1, 2, 3, 4, 5]);
    });

    it('falls back to the deterministic deck when the model returns no slides', async () => {
      const service = new SnapsCardNewsService(
        ollamaReturning({ title: '빈 덱', slides: [], caption: '캡션', hashtags: [] }) as any
      );

      const deck = await service.script({
        sourceText: '첫 문장입니다. 둘째 문장입니다. 셋째 문장입니다.',
        slideCount: 5,
      });

      expect(deck.slides.length).toBeGreaterThan(0);
      const bodies = deck.slides.map((slide) => slide.body);
      expect(new Set(bodies).size).toBe(bodies.length);
    });
  });

  // The renderer wraps text against estimateCharWidth(), not real font metrics,
  // so the whole layout rests on that estimate never coming in UNDER what the
  // font actually draws - an underestimate puts more characters on a line than
  // fit and the text runs past the slide edge. The constants have been retuned
  // before (an earlier flat 1.0/0.55 split overestimated Hangul), which is
  // exactly the kind of change that can overshoot in the other direction.
  describe('card news width estimates never underestimate the rendered text', () => {
    const FONT_STACK = "'Noto Sans KR','Malgun Gothic',sans-serif";
    const PAD = 20;

    const renderedWidth = async (text: string, fontSize: number, fontWeight: number) => {
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="160">` +
        `<rect width="2400" height="160" fill="#ffffff"/>` +
        `<text x="${PAD}" y="120" font-family="${FONT_STACK}" font-size="${fontSize}" ` +
        `font-weight="${fontWeight}" fill="#000000">${text}</text></svg>`;
      const { data, info } = await sharp(Buffer.from(svg))
        .raw()
        .toBuffer({ resolveWithObject: true });
      let maxX = -1;
      for (let y = 0; y < info.height; y += 1) {
        for (let x = info.width - 1; x > maxX; x -= 1) {
          const index = (y * info.width + x) * info.channels;
          if (data[index] < 160) {
            maxX = x;
            break;
          }
        }
      }
      return maxX < 0 ? 0 : maxX - PAD;
    };

    // Han, kana and emoji were all missing from the full-width test and fell
    // through to the 0.55 Latin default. Measured at 52px, a Chinese line drew
    // 1.81x what it was estimated at and ran well past the slide edge; emoji
    // were the same. Xiaohongshu is one of the channels this renders for, and
    // an emoji in a Korean heading is ordinary.
    const SMILEY = String.fromCodePoint(0x1f60a);
    const THUMB = String.fromCodePoint(0x1f44d);
    const SKIN = String.fromCodePoint(0x1f3fd);
    const FAMILY =
      String.fromCodePoint(0x1f468) +
      String.fromCharCode(0x200d) +
      String.fromCodePoint(0x1f469) +
      String.fromCharCode(0x200d) +
      String.fromCodePoint(0x1f467);
    const samples: Array<[string, number, number]> = [
      ['환절기 건강관리의 핵심은 실내습도유지입니다', 52, 700],
      ['가을철 환절기에는 일교차가 커지면서 면역력이 떨어집니다.', 38, 400],
      ['#환절기건강관리  #면역력높이는법  #실내습도', 28, 400],
      ['snaps Card News Renderer Quality Check 2026', 38, 400],
      ['카드뉴스 automation 혼합 Text 123 테스트', 38, 400],
      ['换季感冒预防指南要点总结', 52, 700],
      ['季節の変わり目の健康管理', 52, 700],
      [`환절기${SMILEY}건강관리${THUMB}`, 52, 700],
      [SMILEY.repeat(6), 52, 700],
      // This stack does not compose a ZWJ sequence - the family measured 2.83em
      // here, exactly what the three emoji draw separately - so the estimate
      // has to charge for each of them.
      [`가족${FAMILY}이야기`, 52, 700],
      [`좋아요${THUMB}${SKIN}눌러요`, 38, 400],
    ];

    it('draws every sample no wider than the estimate the wrapper trusts', async () => {
      // A machine with no Korean font renders tofu boxes at a different width,
      // which would fail this for the environment rather than for the code.
      const hangulRendersHere = (await renderedWidth('한글', 40, 400)) > 20;
      if (!hangulRendersHere) {
        console.warn('skipping width check: no Korean font available here');
        return;
      }

      const renderer = new SnapsCardNewsRendererService() as unknown as {
        measureText(text: string, fontSize: number): number;
      };
      for (const [text, fontSize, fontWeight] of samples) {
        const estimated = renderer.measureText(text, fontSize);
        const actual = await renderedWidth(text, fontSize, fontWeight);
        // Anti-aliasing can bleed a pixel or two past the glyph box, so allow a
        // little slack - but nothing close to a whole character.
        expect(`${text.slice(0, 16)}: ${actual <= estimated * 1.02}`).toBe(
          `${text.slice(0, 16)}: true`
        );
      }
    });
  });

  describe('SnapsCardNewsRendererService', () => {
    // Slides are drawn by building an SVG document out of the deck text and
    // rasterising it. A heading containing '</text><script>' would close the
    // element and open another one; at best sharp refuses to parse the document
    // and the whole render fails, at worst the markup lands in the file. Every
    // text field has to go through escape().
    it('keeps hostile deck text out of the generated SVG markup', async () => {
      const renderer = new SnapsCardNewsRendererService();
      const captured: string[] = [];
      const service = renderer as unknown as Record<string, unknown>;
      const builder = Object.keys(Object.getPrototypeOf(renderer)).find((name) =>
        name.toLowerCase().includes('svg')
      );
      if (builder) {
        const original = service[builder] as (...args: unknown[]) => string;
        service[builder] = (...args: unknown[]) => {
          const svg = original.apply(renderer, args);
          captured.push(svg);
          return svg;
        };
      }

      const hostile = '</text><script>alert(1)</script><text>';
      const rendered = await renderer.renderDeck({
        provider: 'ollama',
        title: hostile,
        templateId: 'editorial',
        brandColor: '#2563EB',
        caption: '"><foreignObject><body onload=alert(1)/></foreignObject>',
        hashtags: ['#<script>', '#정상'],
        slides: [
          { order: 1, eyebrow: '01', heading: hostile, body: '본문 & 앰퍼샌드 < 꺾쇠 > 끝' },
          { order: 2, eyebrow: '02', heading: '정상 제목', body: hostile },
        ],
      } as never);

      // sharp refuses malformed SVG, so valid PNGs already prove the document
      // survived; the tag check then proves nothing was injected into it.
      expect(rendered).toHaveLength(2);
      for (const slide of rendered) {
        expect(slide.buffer.subarray(1, 4).toString('ascii')).toBe('PNG');
      }

      if (captured.length) {
        const svgTags = new Set([
          'svg', 'rect', 'text', 'tspan', 'defs', 'lineargradient', 'stop', 'g',
          'circle', 'path', 'style', 'image',
        ]);
        const injected = [
          ...new Set(
            [...captured.join('\n').matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)]
              .map((match) => match[1].toLowerCase())
              .filter((tag) => !svgTags.has(tag))
          ),
        ];
        expect(JSON.stringify(injected)).toBe('[]');
      }
    });

    const buildDeck = (slides: Array<{ eyebrow: string; heading: string; body: string }>) => ({
      title: '카드뉴스 제목',
      templateId: 'editorial' as const,
      brandColor: '#2563EB',
      caption: '캡션',
      hashtags: ['#환절기', '#감기예방', '#면역력', '#가을건강', '#건강습관', '#카드뉴스', '#정보', '#팁'],
      slides: slides.map((slide, index) => ({ order: index + 1, ...slide })),
    });

    // The workspace offers three templates and the deck has always carried a
    // templateId, but the renderer never read it, so all three produced
    // byte-identical PNGs.
    it('renders a visibly different slide for each template', async () => {
      const renderer = new SnapsCardNewsRendererService();
      const slides = [
        { eyebrow: '01', heading: '환절기, 면역력이 먼저입니다', body: '일교차가 커지면 몸이 먼저 지칩니다.' },
        { eyebrow: '02', heading: '습도 40~60%', body: '가습기나 젖은 수건으로 유지하세요.' },
      ];

      const byTemplate = new Map<string, string>();
      for (const templateId of ['editorial', 'bold', 'minimal']) {
        const rendered = await renderer.renderDeck({
          ...(buildDeck(slides) as any),
          templateId,
        });
        byTemplate.set(
          templateId,
          rendered.map((slide: { buffer: Buffer }) => slide.buffer.toString('base64')).join('|')
        );
      }

      expect(new Set(byTemplate.values()).size).toBe(3);
    });

  // Slides are rasterised together now rather than one at a time - measured on a
    // ten-slide deck, 266ms against 87ms, sharp having handed the work to its own
    // thread pool either way. What that buys has to be paid for in ordering: the
    // renders finish out of order, and the deck is a sequence.
    it('renders slides together without reordering the deck', async () => {
      const renderer = new SnapsCardNewsRendererService();
      const slideCount = 6;
      const rendered = await renderer.renderDeck({
        provider: 'ollama',
        title: '환절기 감기 예방',
        templateId: 'editorial',
        brandColor: '#2563EB',
        caption: '환절기 건강 관리 카드뉴스입니다.',
        hashtags: ['#환절기'],
        slides: Array.from({ length: slideCount }, (_, index) => ({
          order: index + 1,
          eyebrow: String(index + 1).padStart(2, '0'),
          heading: `슬라이드 ${index + 1}`,
          body: `${index + 1}번째 본문입니다.`,
        })),
      } as never);

      expect(`rendered: ${rendered.length}`).toBe(`rendered: ${slideCount}`);
      // Both the order the array comes back in and the order stamped on each
      // slide, since the filename is what the media library stores.
      expect(rendered.map((slide) => slide.order).join(',')).toBe('1,2,3,4,5,6');
      expect(rendered.map((slide) => slide.filename).join(',')).toBe(
        [
          'card-news-01.png',
          'card-news-02.png',
          'card-news-03.png',
          'card-news-04.png',
          'card-news-05.png',
          'card-news-06.png',
        ].join(',')
      );
      // Every slide is a real PNG, not an empty buffer from a lost render.
      for (const slide of rendered) {
        expect(`${slide.filename} is a png: ${slide.buffer.slice(1, 4).toString() === 'PNG'}`).toBe(
          `${slide.filename} is a png: true`
        );
      }
    }, 60000);

    it('falls back to the editorial template for an unknown templateId', async () => {
      const renderer = new SnapsCardNewsRendererService();
      const slides = [{ eyebrow: '01', heading: '제목', body: '본문.' }];
      const render = async (templateId: unknown) => {
        const out = await renderer.renderDeck({
          ...(buildDeck(slides) as any),
          templateId,
        });
        return out.map((slide: { buffer: Buffer }) => slide.buffer.toString('base64')).join('|');
      };

      const editorial = await render('editorial');
      expect(await render('does-not-exist')).toBe(editorial);
      expect(await render(undefined)).toBe(editorial);
      expect(await render(42)).toBe(editorial);

      // The cases this test used to miss. Each of these is an inherited
      // Object.prototype member, so the lookup `STYLES[key] || STYLES.editorial`
      // answered a truthy value - Object.prototype itself, or a function - and
      // the fallback never ran. Measured before the fix: the slide still
      // rendered and the request still returned 200, but the SVG was 773 bytes
      // instead of 1097 and carried font-size="undefined". A deck posted
      // straight to /card-news/generate reaches the renderer without going
      // through the service's allowlist, so this is reachable from a request.
      for (const inherited of [
        '__proto__',
        'constructor',
        'toString',
        'valueOf',
        'hasOwnProperty',
      ]) {
        expect(`${inherited}: ${(await render(inherited)) === editorial}`).toBe(
          `${inherited}: true`
        );
      }
    });

    // Three lists name the templates: the renderer's style map, the service's
    // allowlist, and the picker in the workspace. Only the renderer's can
    // actually draw one, so a template added there and missed in the service is
    // a style the operator can never reach - the request would come back as
    // editorial with no warning. Checked by behaviour rather than by reading
    // the service's private list.
    it('accepts every template the renderer can draw', async () => {
      const service = new SnapsCardNewsService(new OfflineOllama() as any);
      expect(SNAPS_CARD_NEWS_TEMPLATE_IDS.length).toBeGreaterThan(1);
      for (const templateId of SNAPS_CARD_NEWS_TEMPLATE_IDS) {
        const deck = await service.script({
          sourceText: '환절기에는 실내 습도를 40~60%로 유지하고 손을 자주 씻는 것이 좋습니다.',
          slideCount: 3,
          templateId,
        } as never);
        expect(`${templateId} -> ${deck.templateId}`).toBe(`${templateId} -> ${templateId}`);
      }
    });

    // Line clamping used to be the fixed constants 6/6, computed for
    // editorial's 62px heading and 40px body. Templates with larger type need
    // fewer lines, so the clamp is derived from the font sizes now.
    it('keeps overflowing text above the footer band in every template', async () => {
      for (const templateId of ['editorial', 'bold', 'minimal']) {
        const renderer = new SnapsCardNewsRendererService();
        const svgs: string[] = [];
        const original = (renderer as any).buildSlideSvg.bind(renderer);
        // buildSlideSvg answers with the markup and what it had to cut, so
        // the spy records the markup and hands the whole answer back.
        (renderer as any).buildSlideSvg = (...args: unknown[]) => {
          const built = original(...args);
          svgs.push(built.svg);
          return built;
        };

        await renderer.renderDeck({
          ...(buildDeck([
            { eyebrow: '01', heading: '가나다라마바사 '.repeat(30), body: '본문 내용 '.repeat(120) },
            { eyebrow: '02', heading: '아주 긴 제목입니다 '.repeat(20), body: '본문 '.repeat(200) },
            { eyebrow: '03', heading: '마무리 '.repeat(25), body: '정리 '.repeat(150) },
          ]) as any),
          templateId,
        });

        for (const svg of svgs) {
          // The hashtag block deliberately sits in the fixed band at y=1180,
          // so measure the heading and body text only.
          const withoutHashtags = svg.replace(/<text font-size="28"[\s\S]*?<\/text>/g, '');
          const ys = [...withoutHashtags.matchAll(/<tspan[^>]*y="([\d.]+)"/g)].map((m) =>
            Number(m[1])
          );
          expect(ys.length).toBeGreaterThan(0);
          // 1150 is the top of the hashtag/footer band.
          expect(Math.max(...ys)).toBeLessThanOrEqual(1150);
        }
      }
    });

    // The hashtag colour was white unconditionally, which only worked while
    // every closing slide had the dark brand gradient behind it. minimal keeps
    // a light background throughout.
    it('does not draw white hashtags on a light closing slide', async () => {
      const renderer = new SnapsCardNewsRendererService();
      const captured = new Map<string, string[]>();
      const original = (renderer as any).buildSlideSvg.bind(renderer);

      for (const templateId of ['editorial', 'bold', 'minimal']) {
        const svgs: string[] = [];
        // buildSlideSvg answers with the markup and what it had to cut, so
        // the spy records the markup and hands the whole answer back.
        (renderer as any).buildSlideSvg = (...args: unknown[]) => {
          const built = original(...args);
          svgs.push(built.svg);
          return built;
        };
        await renderer.renderDeck({
          ...(buildDeck([
            { eyebrow: '01', heading: '표지', body: '표지 본문.' },
            { eyebrow: '02', heading: '마무리', body: '마무리 본문.' },
          ]) as any),
          templateId,
          hashtags: ['#환절기', '#건강'],
        });
        captured.set(templateId, svgs);
      }

      for (const [templateId, svgs] of captured) {
        const closing = svgs[svgs.length - 1];
        const block = /<text font-size="28" fill="([^"]+)"/.exec(closing);
        expect(block).not.toBeNull();
        // Key on the full-slide background rect, not on any #FFFFFF in the
        // file: the heading on a dark slide is white too.
        const backgroundRect = /<rect width="1080" height="1350" fill="([^"]+)"/.exec(closing);
        expect(backgroundRect).not.toBeNull();
        const darkBackground = backgroundRect![1].includes('url(#bg)');
        if (!darkBackground) {
          expect(`${templateId}:${block![1]}`).not.toContain('255,255,255');
        }
      }
    });

    it('clamps overflowing heading and body text inside the slide canvas', async () => {
      const renderer = new SnapsCardNewsRendererService();
      const svgs: string[] = [];
      const original = (renderer as any).buildSlideSvg.bind(renderer);
      (renderer as any).buildSlideSvg = (...args: unknown[]) => {
        const built = original(...args);
        svgs.push(built.svg);
        return built;
      };

      await renderer.renderDeck(
        buildDeck([
          {
            eyebrow: '01',
            heading: '가나다라마바사 '.repeat(30),
            body: '본문 내용 '.repeat(120),
          },
          { eyebrow: '02', heading: '짧은 제목', body: '짧은 본문' },
        ]) as any
      );

      for (const svg of svgs) {
        const ys = [...svg.matchAll(/<tspan[^>]*y="([\d.]+)"/g)].map((match) => Number(match[1]));
        expect(ys.length).toBeGreaterThan(0);
        // Nothing may be laid out past the bottom of the 1350px slide.
        expect(Math.max(...ys)).toBeLessThanOrEqual(1350);
      }
    });

    it('renders a caller-supplied deck with missing or non-string fields instead of throwing', async () => {
      // POST /snaps/card-news/generate renders whatever deck the caller sends,
      // so these used to surface as opaque 500s from inside the renderer.
      const renderer = new SnapsCardNewsRendererService();
      const malformed = {
        title: 't',
        templateId: 'editorial',
        brandColor: '#2563EB',
        caption: 'c',
        // hashtags intentionally absent
        slides: [
          { order: 1, heading: 'h', body: 'b' }, // eyebrow missing
          { order: 2, eyebrow: '02', body: 'b' }, // heading missing
          { order: 3, eyebrow: '03', heading: { nested: true }, body: null }, // wrong types
        ],
      };

      const rendered = await renderer.renderDeck(malformed as any);

      expect(rendered).toHaveLength(3);
      for (const slide of rendered) {
        expect(slide.buffer.subarray(1, 4).toString('ascii')).toBe('PNG');
      }
    });

    it('keeps caps-heavy Latin text inside the right margin', async () => {
      const renderer = new SnapsCardNewsRendererService();
      const rendered = await renderer.renderDeck(
        buildDeck([
          { eyebrow: '00', heading: '표지', body: '표지' },
          {
            eyebrow: '01',
            heading: 'SNAPS MARKETING REPORT 2026',
            body: 'WWW MMM WWW MMM WWW MMM 1234567890 ABCDEFGHIJKLMNOP QRSTUVWXYZ',
          },
          { eyebrow: '02', heading: '마무리', body: '마무리' },
        ]) as any
      );

      // Body slides paint on white, so any dark pixel past WIDTH - MARGIN means
      // the estimated line width was too optimistic and text ran off the edge.
      const bodySlide = rendered[1];
      const { data, info } = await sharp(bodySlide.buffer)
        .raw()
        .toBuffer({ resolveWithObject: true });

      let rightmost = -1;
      for (let y = 21; y < info.height; y += 1) {
        const row = y * info.width;
        for (let x = info.width - 1; x > rightmost; x -= 1) {
          const index = (row + x) * info.channels;
          if (data[index] < 200 || data[index + 1] < 200 || data[index + 2] < 200) {
            rightmost = x;
            break;
          }
        }
      }

      expect(rightmost).toBeGreaterThan(0);
      expect(rightmost).toBeLessThanOrEqual(1080 - 88);
    });

    it('renders slide text containing SVG metacharacters without corrupting the PNG', async () => {
      const renderer = new SnapsCardNewsRendererService();
      const rendered = await renderer.renderDeck(
        buildDeck([
          {
            eyebrow: '01 & <b>',
            heading: 'A & B < C > D "quoted"',
            body: `It's <i>italic</i> & <script>alert(1)</script>`,
          },
          { eyebrow: '02', heading: '정상 슬라이드', body: '정상 본문' },
        ]) as any
      );

      expect(rendered).toHaveLength(2);
      for (const slide of rendered) {
        expect(slide.mimetype).toBe('image/png');
        // PNG magic bytes: \x89 P N G
        expect(slide.buffer.subarray(1, 4).toString('ascii')).toBe('PNG');
      }
    });
  });

  describe('ShortsMakerClientService', () => {
    const originalFetch = globalThis.fetch;
    const originalUrl = process.env.SHORTS_MAKER_URL;

    afterEach(() => {
      globalThis.fetch = originalFetch;
      if (originalUrl === undefined) {
        delete process.env.SHORTS_MAKER_URL;
      } else {
        process.env.SHORTS_MAKER_URL = originalUrl;
      }
    });

    it('reports not-configured instead of calling out when SHORTS_MAKER_URL is unset', async () => {
      delete process.env.SHORTS_MAKER_URL;
      let called = false;
      globalThis.fetch = (async () => {
        called = true;
        return new Response('{}', { status: 200 });
      }) as typeof fetch;

      const client = new ShortsMakerClientService();
      const result = await client.topicToScript({ topic: '가을 환절기 건강' });

      expect(called).toBe(false);
      expect(result).toMatchObject({ ok: false, status: 'not-configured' });
    });

    it('posts topic-to-script to the configured base URL and returns the script payload', async () => {
      process.env.SHORTS_MAKER_URL = 'http://snaps-shorts-maker:4100/';
      const requests: Array<{ url: string; body: unknown }> = [];
      globalThis.fetch = (async (url: string | URL, options?: RequestInit) => {
        requests.push({
          url: String(url),
          body: JSON.parse(String(options?.body || '{}')),
        });
        return new Response(
          JSON.stringify({ ok: true, script: '대본 본문', usage: { model: 'deepseek-chat' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as typeof fetch;

      const client = new ShortsMakerClientService();
      const result = await client.topicToScript({ topic: '가을 환절기 건강', mode: 'dialogue' });

      // The trailing slash on SHORTS_MAKER_URL must not produce a double slash.
      expect(requests[0]?.url).toBe('http://snaps-shorts-maker:4100/api/studio/topic-to-script');
      expect(requests[0]?.body).toMatchObject({ topic: '가을 환절기 건강', mode: 'dialogue' });
      expect(result).toMatchObject({ ok: true, script: '대본 본문' });
    });

    it('maps a JSON error body from Shorts-Maker into a structured error response', async () => {
      process.env.SHORTS_MAKER_URL = 'http://snaps-shorts-maker:4100';
      globalThis.fetch = (async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error: 'topic을 입력해 주세요.',
            errorCode: 'TOPIC_TO_SCRIPT_INPUT_INVALID',
            retryable: false,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )) as typeof fetch;

      const client = new ShortsMakerClientService();
      const result = await client.topicToScript({ topic: '' });

      expect(result).toEqual({
        ok: false,
        status: 'error',
        error: 'topic을 입력해 주세요.',
        errorCode: 'TOPIC_TO_SCRIPT_INPUT_INVALID',
        retryable: false,
      });
    });

    it('degrades to the status line when Shorts-Maker returns a non-JSON error page', async () => {
      process.env.SHORTS_MAKER_URL = 'http://snaps-shorts-maker:4100';
      globalThis.fetch = (async () =>
        new Response('<html><body>502 Bad Gateway</body></html>', {
          status: 502,
          statusText: 'Bad Gateway',
        })) as typeof fetch;

      const client = new ShortsMakerClientService();
      const result = await client.createRenderJob({
        fullAudio: '',
        durationMs: 0,
        frameDurationsSec: [],
        visuals: {},
      });

      expect(result).toMatchObject({ ok: false, status: 'error' });
      expect(String((result as { error: string }).error)).toContain('502 Bad Gateway');
    });

    it('requests render job status with an encoded id query parameter', async () => {
      process.env.SHORTS_MAKER_URL = 'http://snaps-shorts-maker:4100';
      const urls: string[] = [];
      globalThis.fetch = (async (url: string | URL) => {
        urls.push(String(url));
        return new Response(JSON.stringify({ ok: true, job: { id: 'job 1', status: 'queued' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof fetch;

      const client = new ShortsMakerClientService();
      const result = await client.getRenderJobStatus('job 1');

      expect(urls[0]).toBe('http://snaps-shorts-maker:4100/api/studio/render-jobs?id=job%201');
      expect(result).toMatchObject({ ok: true, job: { id: 'job 1' } });
    });

    it('surfaces a network failure as an error response instead of throwing', async () => {
      process.env.SHORTS_MAKER_URL = 'http://snaps-shorts-maker:4100';
      globalThis.fetch = (async () => {
        throw new Error('connect ECONNREFUSED 172.18.0.5:4100');
      }) as typeof fetch;

      const client = new ShortsMakerClientService();
      const result = await client.getRenderJobStatus('job-1');

      expect(result).toMatchObject({ ok: false, status: 'error' });
      expect(String((result as { error: string }).error)).toContain('ECONNREFUSED');
    });
  });
  // A timer that loses a Promise.race stays pending for its full duration and
  // holds the Node event loop open that whole time - measured at 3003ms for a
  // 3000ms timer that lost to an already-resolved promise. The orchestrator
  // health probe raced a 10s timer per request and never cleared it.
  describe('withTemporalTimeout', () => {
    it('leaves no timer behind when the call wins the race', async () => {
      jest.useFakeTimers();
      try {
        const value = await withTemporalTimeout(
          Promise.resolve('fast'),
          'timeout',
          10000
        );
        expect(value).toBe('fast');
        // The invariant itself: nothing is still scheduled. Before the fix this
        // was 1, and that one timer was worth ten seconds of held event loop.
        expect(`timers still pending: ${jest.getTimerCount()}`).toBe(
          'timers still pending: 0'
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('rejects with the given message when the call loses', async () => {
      const slow = new Promise(() => undefined);
      await expect(withTemporalTimeout(slow, 'temporal timeout', 20)).rejects.toThrow(
        'temporal timeout'
      );
    });

    it('falls back when the configured timeout is missing or unparseable', () => {
      expect(
        [
          temporalTimeoutMs(undefined, 10000),
          temporalTimeoutMs('250', 10000),
          temporalTimeoutMs('nonsense', 10000),
          temporalTimeoutMs('0', 10000),
          // The bootstrap computed this with `Number(raw || fallback)`, which
          // makes each of these a timer that fires immediately - and a
          // message reading 'timed out after NaNms'.
          temporalTimeoutMs('-1', 10000),
          temporalTimeoutMs('  ', 10000),
          temporalTimeoutMs('10s', 10000),
          temporalTimeoutMs('', 10000),
        ].join(',')
      ).toBe('10000,250,10000,10000,10000,10000,10000,10000');
    });
  });
  // The stores read with `catch { return [] }` on purpose - a file that does
  // not exist yet is the normal first-run state. The cost is that a damaged
  // file looks exactly like an empty one, and all seven call sites discarded
  // the quarantine path the write side hands back, so the copy holding the
  // operator's entries was never pointed at.
  describe('a store that cannot be read says so', () => {
    const withStore = async (
      run: (dataDir: string, warnings: string[]) => Promise<void>
    ) => {
      const dataDir = path.join(
        process.cwd(),
        'tmp',
        `snaps-unreadable-jest-${process.pid}-${Date.now()}`
      );
      process.env.SNAPS_DATA_DIR = dataDir;
      resetSnapsUnreadableWarnings();
      const warnings: string[] = [];
      const spy = jest
        .spyOn(console, 'warn')
        .mockImplementation((...args: unknown[]) => {
          warnings.push(args.map((a) => String(a)).join(' '));
        });
      try {
        await run(dataDir, warnings);
      } finally {
        spy.mockRestore();
        resetSnapsUnreadableWarnings();
        await fsp.rm(dataDir, { recursive: true, force: true });
      }
    };

    it('stays silent for a store that does not exist yet', async () => {
      await withStore(async (_dataDir, warnings) => {
        const library = new SnapsSourceLibraryService();
        expect(await library.listSources('fresh-org')).toEqual([]);
        expect(
          `warned on first run: ${warnings.some((w) => w.includes('[snaps storage]'))}`
        ).toBe('warned on first run: false');
      });
    });

    it('names the file and the reason when it is damaged', async () => {
      await withStore(async (dataDir, warnings) => {
        const library = new SnapsSourceLibraryService();
        // Create the store, then truncate it the way a half-finished write or
        // a partial copy would.
        await library.saveSource('broken-org', {
          title: '원문',
          sourceText: '손상 확인용 본문입니다. 충분히 길게 씁니다.',
        } as never);
        const files = (await fsp.readdir(dataDir)).filter((f) =>
          f.includes('sources')
        );
        expect(files.length).toBe(1);
        const target = path.join(dataDir, files[0]);
        await fsp.writeFile(target, '[{"id":"half', 'utf8');

        expect(await library.listSources('broken-org')).toEqual([]);
        const storageWarnings = warnings.filter((w) =>
          w.includes('[snaps storage]')
        );
        expect(`warned: ${storageWarnings.length}`).toBe('warned: 1');
        expect(storageWarnings[0]).toContain(files[0]);
        expect(storageWarnings[0]).toContain('원문 라이브러리');

        // Once per file. These reads run on every list call, and a workspace
        // that polls would bury the rest of the log.
        await library.listSources('broken-org');
        await library.listSources('broken-org');
        expect(
          `warned after three reads: ${warnings.filter((w) => w.includes('[snaps storage]')).length}`
        ).toBe('warned after three reads: 1');
      });
    });

    it('says where the damaged bytes went when the next write moves them', async () => {
      await withStore(async (dataDir, warnings) => {
        const library = new SnapsSourceLibraryService();
        await library.saveSource('moved-org', {
          title: '원문',
          sourceText: '격리 확인용 본문입니다. 충분히 길게 씁니다.',
        } as never);
        const name = (await fsp.readdir(dataDir)).filter((f) =>
          f.includes('sources')
        )[0];
        await fsp.writeFile(path.join(dataDir, name), '[{"id":"half', 'utf8');

        await library.saveSource('moved-org', {
          title: '두 번째',
          sourceText: '격리 이후에 저장하는 본문입니다. 충분히 깁니다.',
        } as never);

        const moved = warnings.find((w) => w.includes('was moved to'));
        expect(`reported the quarantine: ${!!moved}`).toBe(
          'reported the quarantine: true'
        );
        const quarantined = (await fsp.readdir(dataDir)).filter((f) =>
          f.includes('.corrupt-')
        );
        expect(`quarantined files: ${quarantined.length}`).toBe(
          'quarantined files: 1'
        );
        expect(moved).toContain(quarantined[0]);
      });
    });
  });
  // Every clamp in snaps was `text.slice(0, limit)`, which counts UTF-16 code
  // units and cuts between them. An emoji is two of those, so a limit landing
  // between them leaves a lone high surrogate - measured on a Korean caption,
  // one cut position out of 25 produced a string ending in U+D83D, which cannot
  // be encoded as UTF-8 and reaches the platform as a replacement character.
  describe('clamping never cuts a character in half', () => {
    const smiley = String.fromCodePoint(0x1f60a);

    // The ES2024 well-formedness method is not in this project's lib target, so
    // the check is spelled out: a high surrogate must be followed by a low one,
    // and a low one must be preceded by a high one.
    const isWellFormed = (text: string) => {
      for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        if (code >= 0xd800 && code <= 0xdbff) {
          const next = text.charCodeAt(index + 1);
          if (!(next >= 0xdc00 && next <= 0xdfff)) {
            return false;
          }
          index += 1;
        } else if (code >= 0xdc00 && code <= 0xdfff) {
          return false;
        }
      }
      return true;
    };

    it('is well formed and within budget at every cut position', () => {
      const body = `환절기 감기 조심하세요 오늘부터${smiley} 실천하세요`;
      const invalid: number[] = [];
      const over: number[] = [];
      for (let limit = 1; limit <= body.length; limit += 1) {
        const cut = snapsClampText(body, limit);
        if (!isWellFormed(cut)) {
          invalid.push(limit);
        }
        if (cut.length > limit) {
          over.push(limit);
        }
      }
      // The plain slice fails at exactly one of these positions.
      expect(`invalid cuts: ${invalid.join(',')}`).toBe('invalid cuts: ');
      expect(`over budget: ${over.join(',')}`).toBe('over budget: ');
    });

    it('keeps a ZWJ sequence whole rather than tearing it into other people', () => {
      const family =
        String.fromCodePoint(0x1f468) +
        String.fromCharCode(0x200d) +
        String.fromCodePoint(0x1f469) +
        String.fromCharCode(0x200d) +
        String.fromCodePoint(0x1f467);
      const text = `가족${family}입니다`;
      // The sequence is 8 UTF-16 units; a budget that cannot hold all of it
      // drops it rather than keeping a fragment.
      expect(snapsClampText(text, 6)).toBe('가족');
      expect(snapsClampText(text, 10)).toBe(`가족${family}`);
    });

    // Measured through the public builder with the plain slice restored:
    // Instagram takes 2200, and a caption whose emoji straddles that position
    // published a body that was not well formed and ended on U+D83D.
    it('clamps a published caption without leaving a broken character', () => {
      const build = (platform: string, content: string, settings: unknown) => {
        const result = buildSnapsPublishingPayload({
          variants: [
            {
              platform,
              label: platform,
              content,
              hashtags: [],
              settings,
              publishMode: 'schedule',
            } as never,
          ],
          integrations: [
            { platform, integrationId: `${platform}-id` } as never,
          ],
          publishDate: '2026-05-12T00:00:00.000Z',
          scheduleType: 'schedule',
          // Same reason as above: pinned, not moved forward.
          now: Date.parse('2026-05-11T00:00:00.000Z'),
        });
        const post = (result.payload?.posts || [])[0] as
          | { value?: Array<{ content?: string }> }
          | undefined;
        return (post?.value || []).map((entry) => String(entry.content || ''));
      };

      const parts = build(
        'instagram',
        `${'가'.repeat(2199)}${smiley}뒤에 더 있습니다`,
        { __type: 'instagram', post_type: 'post' }
      );
      // Reading the wrong key made an earlier version of this test pass on an
      // empty string, so the body has to be there before anything else.
      expect(`published bodies: ${parts.length}`).toBe('published bodies: 1');
      const body = parts[0];
      expect(`body length: ${body.length}`).toBe('body length: 2199');
      expect(`well formed: ${isWellFormed(body)}`).toBe(
        'well formed: true'
      );
      expect(`ends on half an emoji: ${body.endsWith(smiley[0])}`).toBe(
        'ends on half an emoji: false'
      );

      // Threads segments at 500. With the emoji straddling that position the
      // fixed-stride split broke both segments: a lone high surrogate ending
      // the first and a lone low surrogate starting the second.
      const token = `${'나'.repeat(499)}${smiley}${'다'.repeat(400)}`;
      const segments = build('threads', token, { __type: 'threads' });
      expect(`segments: ${segments.length}`).toBe('segments: 2');
      const broken = segments.filter((part) => !isWellFormed(part));
      expect(`broken segments: ${broken.length}`).toBe('broken segments: 0');
      // Nothing is lost at the seam either.
      expect(segments.join('')).toBe(token);
    });
  });
  // 밤 12시 is midnight in Korean, not noon. The marker was in the "add twelve
  // hours" list with the noon exception applied only to 오전, so `오늘 밤
  // 12시에 올려줘` scheduled 12:00 - twelve hours early, on the same day, with
  // nothing to show anything had gone wrong. 자정 and 정오 were not read at
  // all, so the operator's time was replaced by the 10:00 default in silence.
  describe('the planner reads Korean clock phrases the way they are meant', () => {
    // 10:00 KST on a Tuesday.
    const now = new Date('2026-05-12T01:00:00.000Z');
    const planner = new SnapsCommandPlannerService(
      new OfflineOllama() as never,
      null as never,
      null as never,
      null as never
    );
    const kstOf = (phrase: string) => {
      const iso = (
        planner as unknown as {
          detectPublishDate: (
            command: string,
            at: Date,
            offset: number
          ) => string | undefined;
        }
      ).detectPublishDate(phrase, now, -540);
      return iso
        ? new Date(new Date(iso).getTime() + 9 * 3600000)
            .toISOString()
            .slice(0, 16)
            .replace('T', ' ')
        : '(none)';
    };

    it.each([
      // 밤 12시 is the midnight that ENDS the named day. The earlier fix here
      // settled the hour - it used to be read as noon - but left the date on
      // the named day, so the instant was 00:00 that morning and every such
      // command scheduled behind the clock. 새벽 and 오전 12시 do start the
      // named day and are unchanged.
      ['오늘 밤 12시에 올려줘', '2026-05-13 00:00'],
      ['오늘 새벽 12시에 올려줘', '2026-05-12 00:00'],
      ['오늘 오전 12시에 올려줘', '2026-05-12 00:00'],
      ['오늘 오후 12시에 올려줘', '2026-05-12 12:00'],
      ['오늘 밤 11시에 올려줘', '2026-05-12 23:00'],
      ['오늘 새벽 2시에 올려줘', '2026-05-12 02:00'],
      ['오늘 저녁 7시에 올려줘', '2026-05-12 19:00'],
      ['오늘 아침 8시에 올려줘', '2026-05-12 08:00'],
      ['내일 자정에 올려줘', '2026-05-13 00:00'],
      ['오늘 정오에 올려줘', '2026-05-12 12:00'],
      ['2026년 5월 31일 오후 3시에 올려줘', '2026-05-31 15:00'],
      ['내일 오후 3시에 올려줘', '2026-05-13 15:00'],
    ])('%s', (phrase, expected) => {
      expect(`${phrase} -> ${kstOf(phrase)}`).toBe(`${phrase} -> ${expected}`);
    });
  });
  // Only 오늘/내일/모레 and a four-digit date were read. Everything else fell
  // through to today while the hour was still taken from the command, so the
  // plan looked deliberate and was a different day: `12월 25일 오전 9시에
  // 올려줘` scheduled nine o'clock this morning.
  describe('the planner reads Korean date phrases', () => {
    const names = ['일', '월', '화', '수', '목', '금', '토'];
    const planner = new SnapsCommandPlannerService(
      new OfflineOllama() as never,
      null as never,
      null as never,
      null as never
    );
    const detect = (phrase: string, at: Date) =>
      (
        planner as unknown as {
          detectPublishDate: (
            command: string,
            now: Date,
            offset: number
          ) => string | undefined;
        }
      ).detectPublishDate(phrase, at, -540);
    const kstOf = (phrase: string, at: Date) => {
      const iso = detect(phrase, at);
      return iso
        ? new Date(new Date(iso).getTime() + 9 * 3600000)
            .toISOString()
            .slice(0, 16)
            .replace('T', ' ')
        : '(none)';
    };
    // 10:00 KST on Tuesday 12 May 2026.
    const tuesday = new Date('2026-05-12T01:00:00.000Z');

    it.each([
      ['5월 31일 오후 3시에 올려줘', '2026-05-31 15:00'],
      ['12월 25일 오전 9시에 올려줘', '2026-12-25 09:00'],
      // Already gone this year, so the next one.
      ['1월 2일 오전 9시에 올려줘', '2027-01-02 09:00'],
      ['2026년 5월 31일 오후 3시에 올려줘', '2026-05-31 15:00'],
      ['글피 오후 3시에 올려줘', '2026-05-15 15:00'],
      ['이번 주 금요일 오후 3시에 올려줘', '2026-05-15 15:00'],
      ['다음 주 월요일 오전 10시에 올려줘', '2026-05-18 10:00'],
      ['다음 주 금요일 오전 10시에 올려줘', '2026-05-22 10:00'],
      ['금요일 오후 3시에 올려줘', '2026-05-15 15:00'],
      ['화요일 오후 3시에 올려줘', '2026-05-12 15:00'],
      ['일요일 오후 3시에 올려줘', '2026-05-17 15:00'],
      ['내일 오후 3시에 올려줘', '2026-05-13 15:00'],
      ['모레 오후 3시에 올려줘', '2026-05-14 15:00'],
    ])('%s', (phrase, expected) => {
      expect(`${phrase} -> ${kstOf(phrase, tuesday)}`).toBe(
        `${phrase} -> ${expected}`
      );
    });

    // Weeks start on Monday, so 다음 주 금요일 said on a Tuesday is ten days
    // out, not three - and the answer must not move depending on which day of
    // the week it is asked on.
    it('puts next week on the same days no matter which day it is asked on', () => {
      const answers = new Set<string>();
      const bare = new Map<string, string>();
      for (let day = 11; day <= 17; day += 1) {
        const at = new Date(`2026-05-${day}T01:00:00.000Z`);
        answers.add(
          [
            kstOf('다음 주 월요일 오전 10시에 올려줘', at),
            kstOf('다음 주 금요일 오전 10시에 올려줘', at),
            kstOf('이번 주 금요일 오전 10시에 올려줘', at),
          ].join(' | ')
        );
        const asked = new Date(`2026-05-${day}T12:00:00.000Z`).getUTCDay();
        bare.set(names[asked], kstOf('금요일 오전 10시에 올려줘', at));
      }
      expect([...answers]).toEqual([
        '2026-05-18 10:00 | 2026-05-22 10:00 | 2026-05-15 10:00',
      ]);
      // The bare weekday is the next one to come round, today included, so it
      // does move - to the following Friday once this one has passed.
      expect(bare.get('월')).toBe('2026-05-15 10:00');
      expect(bare.get('금')).toBe('2026-05-15 10:00');
      expect(bare.get('토')).toBe('2026-05-22 10:00');
      expect(bare.get('일')).toBe('2026-05-22 10:00');
    });
  });
  // An unrecognised channel name does not fail - it falls through to the
  // default set, so naming one channel published to four others. 엑스 is the
  // Korean name of X and was not read at all; 쓰레드 is written as often as
  // 스레드; 레드노트 was covered only in its Latin spelling.
  describe('the planner reads Korean platform names', () => {
    const planner = new SnapsCommandPlannerService(
      new OfflineOllama() as never,
      null as never,
      null as never,
      null as never
    );
    const detect = (command: string) =>
      (
        planner as unknown as {
          detectTargetPlatforms: (input: string) => string[];
        }
      )
        .detectTargetPlatforms(command)
        .join(', ');

    it.each([
      ['엑스에 올려줘', 'x'],
      ['트윗해줘', 'x'],
      ['트위터에 올려줘', 'x'],
      ['X에 올려줘', 'x'],
      ['쓰레드에 올려줘', 'threads'],
      ['스레드에 올려줘', 'threads'],
      ['레드노트에 올려줘', 'xiaohongshu'],
      ['샤오홍슈에 올려줘', 'xiaohongshu'],
      ['인스타에 올려줘', 'instagram'],
      ['링크드인에 올려줘', 'linkedin'],
      ['네이버 카페에 올려줘', 'naver-cafe'],
      ['카톡 채널에 공유해줘', 'kakao-talk'],
      ['틱톡에 올려줘', 'tiktok'],
    ])('%s', (command, expected) => {
      expect(`${command} -> ${detect(command)}`).toBe(
        `${command} -> ${expected}`
      );
    });

    // A different word that happens to start the same way. Reading it as the
    // platform would send an unrelated post to X.
    it('does not read 엑스레이 as the platform', () => {
      expect(`엑스레이 -> ${detect('엑스레이 사진 올려줘')}`).toBe(
        '엑스레이 -> threads, instagram, youtube, tiktok'
      );
    });

    it('reads 숏츠 as a short video, the way 쇼츠 and 숏폼 already were', () => {
      const asShort = (command: string) =>
        (
          planner as unknown as { detectShortVideo: (input: string) => boolean }
        ).detectShortVideo(command);
      expect(`숏츠: ${asShort('숏츠 만들어줘')}`).toBe('숏츠: true');
      expect(`쇼츠: ${asShort('쇼츠 만들어줘')}`).toBe('쇼츠: true');
      // And it picks a channel rather than leaving the target list empty.
      const targets = (
        planner as unknown as {
          detectShortVideoTargets: (
            command: string,
            platforms: string[]
          ) => string[];
        }
      ).detectShortVideoTargets('숏츠 만들어줘', []);
      expect(`숏츠 targets: ${targets.join(',')}`).toBe('숏츠 targets: youtube');
    });
  });
  // Text that does not fit the slide used to just stop. The reader saw a
  // sentence end mid-word with nothing to say it had been cut - measured on an
  // emoji-heavy 200 character body, which needs seven lines where six fit and
  // lost twenty characters in silence.
  describe('a slide says when it had no room to finish', () => {
    const SMILEY = String.fromCodePoint(0x1f60a);
    const LINE_WIDTH = 1080 - 90 * 2;
    const FONT = 38;
    const renderer = new SnapsCardNewsRendererService() as unknown as {
      wrapText: (
        text: string,
        maxWidth: number,
        fontSize: number,
        maxLines?: number
      ) => string[];
      measureText: (text: string, fontSize: number) => number;
    };
    const wellFormed = (text: string) => {
      for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        if (code >= 0xd800 && code <= 0xdbff) {
          const next = text.charCodeAt(index + 1);
          if (!(next >= 0xdc00 && next <= 0xdfff)) {
            return false;
          }
          index += 1;
        } else if (code >= 0xdc00 && code <= 0xdfff) {
          return false;
        }
      }
      return true;
    };

    it('leaves text that fits exactly as it is', () => {
      const lines = renderer.wrapText(
        '환절기에는 손을 자주 씻어 주세요.',
        LINE_WIDTH,
        FONT,
        6
      );
      expect(`lines: ${lines.length}`).toBe('lines: 1');
      expect(`ends with an ellipsis: ${lines[0].endsWith('…')}`).toBe(
        'ends with an ellipsis: false'
      );
    });

    it('marks the cut and still fits the line, at every line budget', () => {
      const body = `${`좋아요${SMILEY} `.repeat(40)}`.slice(0, 200);
      const problems: string[] = [];
      for (const maxLines of [1, 2, 3, 4, 5, 6]) {
        const lines = renderer.wrapText(body, LINE_WIDTH, FONT, maxLines);
        const last = lines[lines.length - 1] || '';
        if (!last.endsWith('…')) {
          problems.push(`maxLines=${maxLines} did not mark the cut`);
        }
        // The ellipsis goes inside the line width, not past it.
        for (const line of lines) {
          if (renderer.measureText(line, FONT) > LINE_WIDTH) {
            problems.push(`maxLines=${maxLines} line runs past the margin`);
          }
          if (!wellFormed(line)) {
            problems.push(`maxLines=${maxLines} line splits a character`);
          }
        }
      }
      expect(`problems: ${problems.join(', ')}`).toBe('problems: ');
    });

    // A line packed to the margin has no room left for the mark, so the mark
    // has to take a character back rather than be added past the edge. The
    // emoji sample above never exercises this: its lines break early and end
    // with slack the ellipsis fits into.
    it('gives back a character when the line is already full', () => {
      // Ten Hangul syllables fill this width exactly.
      const width = 10 * FONT * 0.92;
      const lines = renderer.wrapText('가'.repeat(45), width, FONT, 3);
      const over = lines.filter(
        (line) => renderer.measureText(line, FONT) > width
      );
      expect(`lines past the margin: ${over.length}`).toBe(
        'lines past the margin: 0'
      );
      const last = lines[lines.length - 1];
      expect(`last line: ${last}`).toBe(`last line: ${'가'.repeat(9)}…`);
    });
  });
  // Two kinds of duplicate got past the original Set, and both are one tag as
  // far as a platform is concerned - which is the very thing this function was
  // written to stop.
  describe('hashtags that are the same tag are published once', () => {
    it('treats decomposed Korean as the word it spells', () => {
      const decomposed = '환절기'.normalize('NFD');
      // Three code points composed, eight decomposed. Text that has been
      // through a macOS filesystem arrives decomposed, and the two forms read
      // identically in a published caption.
      expect(`decomposed length: ${decomposed.length}`).toBe(
        'decomposed length: 8'
      );
      expect(sanitizeSnapsHashtags([`#${decomposed}`, '#환절기'])).toEqual([
        '#환절기',
      ]);
      // What goes out is composed, whichever form came in.
      const [only] = sanitizeSnapsHashtags([`#${decomposed}`]);
      expect(`composed on the way out: ${only === '#환절기'}`).toBe(
        'composed on the way out: true'
      );
    });

    it('treats a difference of case as the same tag', () => {
      // Instagram, X and Threads all group tags case-insensitively, and the
      // budget is as small as one on Threads.
      expect(sanitizeSnapsHashtags(['#Health', '#health', '#HEALTH'])).toEqual([
        '#Health',
      ]);
    });

    it('keeps the first spelling rather than flattening the case', () => {
      // The platform shows what was written, so a readable tag stays readable.
      expect(sanitizeSnapsHashtags(['#SnapsAI', '#snapsai'])).toEqual([
        '#SnapsAI',
      ]);
    });

    it('still does everything it did before', () => {
      expect(sanitizeSnapsHashtags('#환절기 #건강 #환절기')).toEqual([
        '#환절기',
        '#건강',
      ]);
      expect(
        sanitizeSnapsHashtags([`#환절기${String.fromCodePoint(0x1f60a)}`])
      ).toEqual(['#환절기']);
      expect(sanitizeSnapsHashtags(['#', '##', '   ', null, undefined])).toEqual(
        []
      );
      expect(sanitizeSnapsHashtags(['#a', '#b', '#c'], 2)).toEqual(['#a', '#b']);
    });
  });
  // Keyword matching was exact, which works for English and barely works for
  // Korean: a noun carries its particle inside the same whitespace token, so
  // 환절기 and 환절기에는 are two different strings for one word. This is the
  // path every search takes when embeddings are unavailable, and addExample()
  // stores no embedding whenever the embed call fails.
  describe('keyword search reads Korean with its particles attached', () => {
    const store = new SnapsVectorStoreService() as unknown as {
      tokenize: (value: string) => string[];
      tokenScore: (query: string[], content: string[]) => number;
    };
    const score = (query: string, content: string) =>
      store.tokenScore(store.tokenize(query), store.tokenize(content));

    it.each([
      // Measured at 0.00 before, the same as the unrelated sentence below.
      ['환절기 건강관리 팁', '환절기에는 건강관리가 무엇보다 중요합니다.', 1],
      ['환절기 건강관리 팁', '가을 환절기 건강관리 팁을 정리했습니다.', 1],
      ['신제품 무선이어폰 출시', '신제품 무선이어폰을 출시했습니다.', 1],
      ['marketing tips', 'Practical marketing tips for small teams.', 1],
    ])('%s finds its example', (query, content, expected) => {
      expect(`${query}: ${score(query, content)}`).toBe(`${query}: ${expected}`);
    });

    it('still scores an unrelated example at nothing', () => {
      // The looser match must not turn everything into a hit; these are what
      // 0.00 is supposed to mean.
      expect(
        `김치찌개: ${score('환절기 건강관리 팁', '오늘 점심 메뉴는 김치찌개입니다.')}`
      ).toBe('김치찌개: 0');
      expect(
        `등산: ${score('환절기 건강관리 팁', '주말에 등산 다녀왔습니다. 날씨가 좋았어요.')}`
      ).toBe('등산: 0');
      expect(
        `office: ${score('marketing tips', 'Our office moved to a new building.')}`
      ).toBe('office: 0');
    });

    // The query is operator text - a topic line, a source sentence - so the
    // particle is just as likely to be on that side.
    it('matches whichever side carries the particle', () => {
      const queryHasIt = score('환절기에는 건강관리가 중요하다', '환절기 건강관리 팁 정리');
      const contentHasIt = score('환절기 건강관리 팁 정리', '환절기에는 건강관리가 중요하다');
      expect(`query side: ${queryHasIt.toFixed(2)}`).toBe('query side: 0.67');
      expect(`content side: ${contentHasIt.toFixed(2)}`).toBe('content side: 0.67');
    });

    it('scores partial coverage in between', () => {
      // 홍보 is nowhere in the example, so two of the three query words land.
      const partial = score('카페 신메뉴 홍보', '저희 카페의 신메뉴를 소개합니다.');
      expect(`partial: ${partial.toFixed(2)}`).toBe('partial: 0.67');
    });
  });
  // The whole keyword had to appear contiguously, which a Korean sentence
  // almost never lets happen - the particle sits between the words. And the
  // normalizer read two lists off an imported record without checking they
  // were lists, so one malformed task threw out of importTasks and took the
  // valid ones with it.
  describe('agent task search and import survive real Korean records', () => {
    const validTask = (id: string) => ({
      id,
      title: '환절기에는 건강관리가 무엇보다 중요합니다',
      command: '인스타그램 카드뉴스로 정리해줘',
      createdAt: '2026-05-12T00:00:00.000Z',
      result: {
        plan: {
          command: '인스타그램 카드뉴스로 정리해줘',
          topic: '가을 건강',
          targetPlatforms: ['instagram'],
        },
        transform: { variants: [] },
        operation: { progress: 100 },
      },
    });

    const withStore = async (run: (tasks: SnapsAgentTaskService) => Promise<void>) => {
      const dataDir = path.join(
        process.cwd(),
        'tmp',
        `snaps-agent-kw-${process.pid}-${Date.now()}`
      );
      process.env.SNAPS_DATA_DIR = dataDir;
      try {
        await run(new SnapsAgentTaskService());
      } finally {
        await fsp.rm(dataDir, { recursive: true, force: true });
      }
    };

    it('finds a task by two words in any order', async () => {
      await withStore(async (tasks) => {
        await tasks.importTasks('kw-org', [validTask('k1')]);
        const hits = async (keyword: string) =>
          (await tasks.list('kw-org', { keyword })).list.length;

        // Each of these was 0 before: the keyword had to be one contiguous
        // run of characters, and 환절기 is followed by 에는 in the text.
        expect(`환절기 건강관리: ${await hits('환절기 건강관리')}`).toBe(
          '환절기 건강관리: 1'
        );
        expect(`건강관리 환절기: ${await hits('건강관리 환절기')}`).toBe(
          '건강관리 환절기: 1'
        );
        expect(`카드뉴스 인스타그램: ${await hits('카드뉴스 인스타그램')}`).toBe(
          '카드뉴스 인스타그램: 1'
        );
        // One word still works, and every word still has to be there.
        expect(`환절기: ${await hits('환절기')}`).toBe('환절기: 1');
        expect(`없는단어: ${await hits('없는단어')}`).toBe('없는단어: 0');
        expect(`환절기 없는단어: ${await hits('환절기 없는단어')}`).toBe(
          '환절기 없는단어: 0'
        );
      });
    });

    it('skips a malformed task instead of failing the whole import', async () => {
      await withStore(async (tasks) => {
        const broken = validTask('k2') as unknown as {
          result: { plan: Record<string, unknown> };
        };
        // An older export, or a hand-edited backup: the plan names its
        // platforms differently. This threw a TypeError out of importTasks.
        delete broken.result.plan.targetPlatforms;
        broken.result.plan.platforms = ['instagram'];

        const result = await tasks.importTasks('kw-org', [
          validTask('k1'),
          broken,
        ]);
        expect(`imported: ${result.imported}`).toBe('imported: 1');
        expect(`stored: ${(await tasks.list('kw-org', {})).list.length}`).toBe(
          'stored: 1'
        );
      });
    });
  });
  // An import path is handed whatever is in a backup file: an older export, a
  // hand-edited JSON, a record from a different tool. The agent task
  // normalizer read a nested list without checking it was one, and a single
  // record whose plan named its platforms differently threw out of
  // importTasks and took the valid records with it. This walks a real stored
  // record field by field and breaks each one in turn - the shape that found
  // that bug, kept so it cannot come back anywhere else.
  describe('no import path throws on a record with one broken field', () => {
    const fieldPaths = (value: unknown, prefix = ''): string[] => {
      if (!value || typeof value !== 'object') {
        return [];
      }
      const out: string[] = [];
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        const here = prefix ? `${prefix}.${key}` : key;
        out.push(here, ...fieldPaths(child, here));
      }
      return out;
    };

    const breakAt = (
      target: unknown,
      dotted: string,
      apply: (parent: Record<string, unknown>, key: string) => void
    ) => {
      const parts = dotted.split('.');
      let node = target as Record<string, unknown>;
      for (let index = 0; index < parts.length - 1; index += 1) {
        node = node[parts[index]] as Record<string, unknown>;
        if (!node || typeof node !== 'object') {
          return;
        }
      }
      apply(node, parts[parts.length - 1]);
    };

    const breakages: Array<
      [string, (parent: Record<string, unknown>, key: string) => void]
    > = [
      ['deleted', (parent, key) => delete parent[key]],
      ['null', (parent, key) => {
        parent[key] = null;
      }],
      ['string', (parent, key) => {
        parent[key] = 'x';
      }],
      ['number', (parent, key) => {
        parent[key] = 1;
      }],
      ['array', (parent, key) => {
        parent[key] = [];
      }],
      ['object', (parent, key) => {
        parent[key] = {};
      }],
    ];

    const sweep = async (
      valid: unknown,
      run: (records: unknown[]) => Promise<unknown>
    ) => {
      const thrown: string[] = [];
      for (const field of fieldPaths(valid)) {
        for (const [label, apply] of breakages) {
          const copy = JSON.parse(JSON.stringify(valid));
          breakAt(copy, field, apply);
          try {
            await run([copy]);
          } catch (error) {
            thrown.push(
              `${field} as ${label}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }
      }
      return thrown;
    };

    it('survives every single-field breakage of a stored record', async () => {
      const dataDir = path.join(
        process.cwd(),
        'tmp',
        `snaps-import-fuzz-${process.pid}-${Date.now()}`
      );
      process.env.SNAPS_DATA_DIR = dataDir;
      const org = 'fuzz-org';
      try {
        const library = new SnapsSourceLibraryService();
        const activity = new SnapsActivityLogService();
        const vectors = new SnapsVectorStoreService();
        const tasks = new SnapsAgentTaskService();

        const source = await library.saveSource(org, {
          title: '환절기 건강관리',
          sourceText: '환절기에는 일교차가 커지면서 면역력이 떨어지기 쉽습니다.',
          topic: '가을 건강',
          tags: ['건강', '환절기'],
        } as never);
        const report = await library.saveReport(org, '주간 성과 보고서', {
          summary: '노출이 늘었습니다.',
          metrics: [{ label: 'impressions', value: 1200, percentageChange: 12 }],
          actionItems: ['질문형 CTA를 넣어보세요.'],
        });
        const entry = await activity.record(org, {
          type: 'source',
          title: '원문 저장',
          detail: { phase: 'fuzz' },
        } as never);
        const example = await vectors.addExample(org, {
          platform: 'instagram',
          content: '환절기 건강관리 팁을 정리했습니다.',
          embedding: [0.1, 0.2, 0.3],
        } as never);
        const storedTask = {
          id: 'fuzz-task',
          title: '환절기 카드뉴스',
          command: '인스타그램 카드뉴스로 정리해줘',
          createdAt: '2026-05-12T00:00:00.000Z',
          result: {
            plan: {
              command: '인스타그램 카드뉴스로 정리해줘',
              topic: '가을 건강',
              targetPlatforms: ['instagram'],
            },
            transform: { variants: [] },
            operation: { progress: 100 },
          },
        };

        const thrown = [
          ...(await sweep(source, (r) => library.importSources(org, r))),
          ...(await sweep(report, (r) => library.importReports(org, r))),
          ...(await sweep(entry, (r) => activity.importEntries(org, r))),
          ...(await sweep(example, (r) => vectors.importExamples(org, r))),
          ...(await sweep(storedTask, (r) => tasks.importTasks(org, r))),
        ];

        expect(`imports that threw: ${thrown.slice(0, 3).join(' | ')}`).toBe(
          'imports that threw: '
        );
      } finally {
        await fsp.rm(dataDir, { recursive: true, force: true });
      }
    }, 120000);
  });
  // A workspace export is what an operator restores from. Anything the import
  // side does not put back is lost without a word, so the property worth
  // holding is that a record comes back the way it went out. Measured this
  // way, one field in six stores came back different: importing a source
  // stamped updatedAt with the moment the import ran, while reports and agent
  // tasks both kept theirs.
  describe('a workspace survives export and import unchanged', () => {
    const differences = (before: unknown, after: unknown, prefix = ''): string[] => {
      // The org id is the one field that has to change.
      if (prefix.endsWith('organizationId') || before === after) {
        return [];
      }
      if (
        before === null ||
        after === null ||
        typeof before !== 'object' ||
        typeof after !== 'object'
      ) {
        return [
          `${prefix || '(root)'}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`,
        ];
      }
      const keys = new Set([
        ...Object.keys(before as Record<string, unknown>),
        ...Object.keys(after as Record<string, unknown>),
      ]);
      return [...keys].flatMap((key) =>
        differences(
          (before as Record<string, unknown>)[key],
          (after as Record<string, unknown>)[key],
          prefix ? `${prefix}.${key}` : key
        )
      );
    };

    it('puts every field back in every store', async () => {
      const dataDir = path.join(
        process.cwd(),
        'tmp',
        `snaps-roundtrip-${process.pid}-${Date.now()}`
      );
      process.env.SNAPS_DATA_DIR = dataDir;
      const from = 'roundtrip-a';
      const to = 'roundtrip-b';
      try {
        const library = new SnapsSourceLibraryService();
        const activity = new SnapsActivityLogService();
        const vectors = new SnapsVectorStoreService();
        const tasks = new SnapsAgentTaskService();

        await library.saveSource(from, {
          title: '환절기 건강관리',
          sourceText: '환절기에는 일교차가 커지면서 면역력이 떨어지기 쉽습니다.',
          topic: '가을 건강',
          tags: ['건강', '환절기'],
        } as never);
        await library.saveReport(from, '주간 성과 보고서', {
          summary: '노출이 늘었습니다.',
          metrics: [{ label: 'impressions', value: 1200, percentageChange: 12 }],
          actionItems: ['질문형 CTA를 넣어보세요.'],
        });
        await activity.record(from, {
          type: 'source',
          title: '원문 저장',
          detail: { phase: 'roundtrip' },
        } as never);
        await vectors.addExample(from, {
          platform: 'instagram',
          content: '환절기 건강관리 팁을 정리했습니다.',
          embedding: [0.1, 0.2, 0.3],
        } as never);
        await tasks.importTasks(from, [
          {
            id: 'rt-task',
            title: '환절기 카드뉴스',
            command: '인스타그램 카드뉴스로 정리해줘',
            createdAt: '2026-05-12T00:00:00.000Z',
            updatedAt: '2026-05-12T01:00:00.000Z',
            favorite: true,
            rating: 4,
            result: {
              plan: {
                command: '인스타그램 카드뉴스로 정리해줘',
                topic: '가을 건강',
                targetPlatforms: ['instagram'],
              },
              transform: { variants: [] },
              operation: { progress: 100 },
            },
          },
        ]);

        const exported = {
          sources: await library.listSources(from),
          styleExamples: await vectors.listExamples(from),
          reports: await library.listReports(from),
          agentTasks: await tasks.exportTasks(from),
          activity: await activity.list(from),
        };

        await library.importSources(to, exported.sources as unknown[]);
        await vectors.importExamples(to, exported.styleExamples as unknown[]);
        await library.importReports(to, exported.reports as unknown[]);
        await tasks.importTasks(to, exported.agentTasks as unknown[]);
        await activity.importEntries(to, exported.activity as unknown[]);

        const reimported = {
          sources: await library.listSources(to),
          styleExamples: await vectors.listExamples(to),
          reports: await library.listReports(to),
          agentTasks: await tasks.exportTasks(to),
          activity: await activity.list(to),
        };

        const lost: string[] = [];
        for (const key of Object.keys(exported) as Array<keyof typeof exported>) {
          const before = exported[key] as unknown[];
          const after = reimported[key] as unknown[];
          // An empty store would make this pass without testing anything.
          if (before.length !== 1) {
            lost.push(`${key}: exported ${before.length} records, expected 1`);
            continue;
          }
          if (after.length !== before.length) {
            lost.push(`${key}: ${before.length} records became ${after.length}`);
            continue;
          }
          lost.push(...differences(before[0], after[0]).map((d) => `${key}.${d}`));
        }

        expect(`lost in the round trip: ${lost.join(' | ')}`).toBe(
          'lost in the round trip: '
        );
      } finally {
        await fsp.rm(dataDir, { recursive: true, force: true });
      }
    }, 60000);
  });
  // The line the workspace shows after an import counted two of the six
  // stores, and every store answers an unrecognised payload with an empty
  // list. So a backup holding only reports read as `원문 0개, RAG 0개` - a
  // successful import that looks failed - and picking the wrong file produced
  // the same line under a `완료` heading.
  // Both workspaces read `scheduled.length` and called zero "no posts were
  // created". PostsService.createPost builds one entry per channel and returns
  // `[]` the moment one comes back empty, throwing away the entries for the
  // channels that had already succeeded - so a run that created two posts and
  // failed on the third answers `scheduled: []`, the operator is told nothing
  // happened, and retrying creates the first two again.
  // /snaps/shorts-maker/render-jobs has no panel yet, and the first half of
  // building one is deciding what it may submit. The route rejects an
  // incomplete payload by name, which is right for the route and useless as
  // the first thing an operator sees: the request has already been made. The
  // panel asks the same questions first - in the route's own words, checked
  // against the route's own source here, because two copies of a sentence is
  // how they come to disagree.
  // The report the operator copies out and pastes into a document. Bullets
  // used to be bare `<li>` with no list around them - measured, four `<li>`
  // and no `<ul>` anywhere - which a browser renders anyway, so it went
  // unnoticed; the print stylesheet had even grown a manual indent to fake it.
  // Pasted into a document or an email, bare list items are not a list.
  // snaps cannot publish to Naver Blog, KakaoTalk or Xiaohongshu, so copying
  // is the product there. Only the HTML formatter normalised anything, and
  // only line endings; the other two carried whatever arrived. Measured on one
  // variant through all three:
  //
  //   CRLF content    plain and markdown kept the carriage returns
  //   two-line title  markdown gave `# 환절기 건강관리\n두 번째 줄` - the second
  //                   line is no longer the heading, it is body text
  //   trailing \n\n    html gave `<p>본문입니다.</p><p></p>` - a blank
  //                   paragraph in whatever the operator pasted into
  // The fourth copy path, and the only one built inline in the component -
  // which is how it escaped the tests the other three got. Measured on one
  // plan, it came out as a wall of text:
  //
  //   "오더: ...\n대상: ...\n모드: 초안\n작업자 브리핑\n요약 첫 줄\n..."
  //
  // Every section break was written down as `''` and then removed by the
  // `.filter(Boolean)` on the next line.
  // Two report routes answered the same question differently. `/report/
  // generate` always said which engine wrote the text; `/report/
  // from-platform-analytics` said it only when no channel had been skipped,
  // because the skipped-channel branch replaced the engine notice instead of
  // joining it. The one case that deserves the most doubt - two of five
  // channels *and* the deterministic fallback - was the one case the operator
  // was not told about the fallback.
  describe('what the operator is told after a report', () => {
    const copy = {
      success: '분석 보고서를 생성했습니다.',
      fallback: 'AI 가 응답하지 않아 규칙 기반 요약으로 보고서를 만들었습니다.',
    };

    it('says the model wrote it and nothing was skipped', () => {
      const outcome = summariseSnapsReportOutcome('deepseek', [], copy);
      expect(outcome.tone).toBe('success');
      expect(outcome.message).toBe('분석 보고서를 생성했습니다.');
    });

    it('says the fallback wrote it', () => {
      const outcome = summariseSnapsReportOutcome('rule-fallback', [], copy);
      expect(outcome.tone).toBe('warning');
      expect(outcome.message).toBe(copy.fallback);
    });

    it('says which channels were skipped', () => {
      const outcome = summariseSnapsReportOutcome(
        'deepseek',
        ['instagram 제외', 'threads 제외'],
        copy
      );
      expect(outcome.tone).toBe('warning');
      expect(outcome.message).toBe(
        '분석 보고서를 생성했습니다. 일부 채널이 제외된 보고서입니다: instagram 제외 / threads 제외'
      );
    });

    // The case the old branch lost.
    it('says both when both are true', () => {
      const outcome = summariseSnapsReportOutcome(
        'rule-fallback',
        ['instagram 제외', 'threads 제외', 'x 제외'],
        copy
      );
      expect(outcome.tone).toBe('warning');
      expect(`mentions the fallback: ${outcome.message.includes(copy.fallback)}`).toBe(
        'mentions the fallback: true'
      );
      expect(`mentions the channels: ${outcome.message.includes('일부 채널이 제외된')}`).toBe(
        'mentions the channels: true'
      );
    });

    it('counts the channels it did not name', () => {
      const outcome = summariseSnapsReportOutcome(
        'deepseek',
        ['a', 'b', 'c', 'd', 'e'],
        copy
      );
      expect(outcome.message).toContain('a / b / c 외 2건');
    });

    it('ignores empty warnings rather than counting them', () => {
      const outcome = summariseSnapsReportOutcome(
        'deepseek',
        ['a', '  ', '', null],
        copy
      );
      expect(outcome.message).toBe(
        '분석 보고서를 생성했습니다. 일부 채널이 제외된 보고서입니다: a'
      );
    });

    it('does not fall over on a response it cannot read', () => {
      const outcome = summariseSnapsReportOutcome(undefined, undefined, copy);
      expect(outcome.tone).toBe('success');
      expect(outcome.message).toBe(copy.success);
    });
  });

  // The readiness row is what tells the operator a channel is good to go. It
  // compared characters against 280 for X, which counts units - so a 200
  // character Korean post, 400 to X and certain to be refused at publish,
  // was reported as ready with "200/280자".
  // Measured on 24 comments written the way Korean audiences actually write
  // them: 7 were classified as something an operator would not call them, and
  // every one of the seven failed in the direction that costs a reply -
  // complaints and approvals filed as `other`, and one complaint filed as
  // praise.
  // Two methods in one file make the same two judgements: classify() decides
  // the sentiment, detectConversionSignals() decides what the operator should
  // do about it. They were separate hand-written copies and they drifted -
  // measured right after the complaint list grew in one of them:
  //
  //   품질이 기대 이하네요       sentiment=complaint      signals=-
  //   배송이 느립니다            sentiment=complaint      signals=-
  //   광고문의 드립니다          sentiment=collaboration  signals=-
  //
  // The last one is older than that: one copy wrote `광고 문의` with a literal
  // space and the other `광고\s*문의`. A complaint with no complaint-risk
  // signal produces no follow-up prompt, which is what the signal is for.
  // The writer's line breaks are carried by four layers - the stores, the
  // builders, the clamp and this payload builder - and each one says so in its
  // own comments, but nothing checked the whole way through. A paragraph break
  // lost anywhere between the box the operator types in and the post that goes
  // out changes what the reader sees, silently.
  //
  // Measured across all ten platforms: 7 breaks and 3 blank runs, the same for
  // every one. Flattening the body in the payload builder drops that to 2 and
  // 1, which is what this would catch.
  // Eight places clamp text to a platform budget, and every one of them was
  // converted to cut on a grapheme boundary. This is the end of that chain: a
  // body whose emoji sits exactly on the cut, through the payload builder, for
  // every platform.
  //
  // The emoji has to be placed rather than sprinkled. A first version repeated
  // one phrase containing emoji and never put one on a boundary, so replacing
  // the grapheme-safe clamp with a raw slice changed nothing and all ten came
  // back clean - a green result that measured nothing. With the emoji placed,
  // the same mutation produces exactly one lone surrogate on nine of the ten.
  // The clamp has two paths: Intl.Segmenter where it exists, and a
  // surrogate-pair check where it does not. Node here has Segmenter, so the
  // second path never runs - deleting it entirely changed nothing anywhere in
  // the suite. It exists for the runtimes that lack Segmenter, which is
  // exactly where nobody would find out it was broken.
  //
  // The module caches the segmenter on first use, so the module has to be
  // loaded fresh with Intl.Segmenter removed.
  // Twelve call sites gate a destructive or irreversible action on this -
  // deleting a source, clearing the whole inbox, publishing a reply to a live
  // channel - and the static checks confirm the call sites exist. Nothing
  // checked what the function answers. Both of its branches matter: on the
  // server render pass there is no `window`, and the safe answer there is to
  // refuse rather than to proceed unconfirmed.
  // The renderer is handed a timeline and narration for each scene, and the
  // two have to be compatible: a Korean narrator gets through five or six
  // syllables a second. The split used to be even regardless of how much each
  // scene had to say. Measured on the deterministic script at 15 seconds -
  // beats of 25, 32, 30 and 16 syllables into 3, 3, 3 and 6 second scenes:
  //
  //   8.3/s   10.7/s   10.0/s   2.7/s
  //
  // The first three cannot be spoken and the last has time going spare.
  // A slide whose text does not fit gets an ellipsis, which only helps
  // somebody who opens the image. The variant builder reports the captions it
  // trims and the transform reports its clamp; the renderer was the one layer
  // that cut in silence. Measured on a 192 character supplied body: all six
  // lines full, the rest gone, and nothing in the response about it.
  // Saving at the cap deletes another record. The import path has reported
  // what the cap removed since the day it was measured; the deliberate save
  // did not. Measured: 500 sources in, save one more, 500 sources out, and the
  // answer named the new record and nothing else - an operator at the cap lost
  // one saved source every time they saved and was never told.
  // The services report what the cap deleted; the workspaces threw that away
  // and showed a fixed success toast. A fix that stops at the service is not a
  // fix - the operator still loses a saved source on every save at the cap and
  // still reads "저장했습니다".
  // The primary scheduling path was left behind when the two attach paths were
  // converted: it still claimed "연결된 채널에 게시물이 생성되지 않았습니다" on an
  // empty result, which PostsService.createPost makes unsupportable, and it
  // showed only the first of the builder's warnings. It reads the same way as
  // the other two now, but keeps its own words - it creates the posts rather
  // than attaching something to them.
  describe('what the primary scheduling path says', () => {
    const phrase = (count: number, kind: string) =>
      kind === 'schedule'
        ? `연결된 채널 ${count}개에 snaps 예약 게시물을 만들었습니다.`
        : `연결된 채널 ${count}개에 snaps 초안을 만들었습니다.`;

    it('says it made them, not that it attached something', () => {
      const outcome = describeSnapsAttachResult(
        { scheduled: [{ postId: 'a' }, { postId: 'b' }], schedulable: [1, 2] },
        'schedule',
        'snaps',
        phrase
      );
      expect(outcome.tone).toBe('success');
      expect(outcome.message).toBe(
        '연결된 채널 2개에 snaps 예약 게시물을 만들었습니다.'
      );
      expect(`says attached: ${outcome.message.includes('첨부')}`).toBe(
        'says attached: false'
      );
    });

    it('does not claim nothing was created when channels were ready', () => {
      const outcome = describeSnapsAttachResult(
        { scheduled: [], schedulable: [1, 2, 3], warnings: [] },
        'draft',
        'snaps',
        phrase
      );
      expect(outcome.tone).toBe('warning');
      expect(
        `claims none created: ${outcome.message.includes('게시물이 생성되지 않았습니다')}`
      ).toBe('claims none created: false');
      expect(outcome.message).toContain('3개');
    });

    it('still gives the builders reason when nothing was schedulable', () => {
      const outcome = describeSnapsAttachResult(
        {
          scheduled: [],
          schedulable: [],
          warnings: ['threads 채널은 연결되어 있지 않습니다.'],
        },
        'draft',
        'snaps',
        phrase
      );
      expect(outcome.message).toBe('threads 채널은 연결되어 있지 않습니다.');
    });

    // The two attach paths pass no phrase and keep the attaching wording.
    it('leaves the attach wording alone when no phrase is given', () => {
      const outcome = describeSnapsAttachResult(
        { scheduled: [{ postId: 'a' }], schedulable: [1] },
        'draft',
        '카드뉴스를'
      );
      expect(outcome.message).toBe('카드뉴스를 연결된 채널 1개 초안에 첨부했습니다.');
    });
  });

  describe('what the operator is told after saving', () => {
    it('says only what happened when nothing was lost', () => {
      const outcome = describeSnapsSaveOutcome(
        { id: 'src-1', title: '원문' },
        '원문을 snaps 라이브러리에 저장했습니다.'
      );
      expect(outcome.tone).toBe('success');
      expect(outcome.message).toBe('원문을 snaps 라이브러리에 저장했습니다.');
    });

    it('passes the cap notice through and warns', () => {
      const outcome = describeSnapsSaveOutcome(
        {
          id: 'src-1',
          evicted: 1,
          warning:
            '저장 원문이 상한 500개에 도달해 가장 오래된 1개를 지웠습니다.',
        },
        '원문을 snaps 라이브러리에 저장했습니다.'
      );
      expect(outcome.tone).toBe('warning');
      expect(outcome.message).toContain('저장했습니다');
      expect(outcome.message).toContain('가장 오래된 1개를 지웠습니다');
    });

    // A style example can be stored without an embedding *and* push the store
    // past its cap. Reporting only the first hides that something was deleted.
    it('carries both notices when both are true', () => {
      const outcome = describeSnapsSaveOutcome(
        {
          id: 'ex-1',
          embedded: false,
          warning: 'RAG 스타일 예시가 상한 500개에 도달해 가장 오래된 1개를 지웠습니다.',
        },
        'RAG 스타일 예시를 저장했습니다.',
        ['임베딩 없이 저장되어 키워드로만 검색됩니다.']
      );
      expect(outcome.tone).toBe('warning');
      expect(outcome.message).toContain('임베딩 없이 저장되어');
      expect(outcome.message).toContain('가장 오래된 1개를 지웠습니다');
    });

    it('ignores a blank or missing notice', () => {
      for (const saved of [undefined, {}, { warning: '   ' }, { warning: 5 }]) {
        const outcome = describeSnapsSaveOutcome(saved, '저장했습니다.');
        expect(`${JSON.stringify(saved)} -> ${outcome.tone}`).toBe(
          `${JSON.stringify(saved)} -> success`
        );
        expect(outcome.message).toBe('저장했습니다.');
      }
    });
  });

  describe('saving at the cap says what it deleted', () => {
    const withStore = async (run: () => Promise<void>) => {
      const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'snaps-evict-'));
      const previous = process.env.SNAPS_DATA_DIR;
      process.env.SNAPS_DATA_DIR = base;
      try {
        await run();
      } finally {
        if (previous === undefined) {
          delete process.env.SNAPS_DATA_DIR;
        } else {
          process.env.SNAPS_DATA_DIR = previous;
        }
        await fsp.rm(base, { recursive: true, force: true });
      }
    };

    it('says nothing while there is room', async () => {
      await withStore(async () => {
        const library = new SnapsSourceLibraryService();
        const saved = (await library.saveSource('room-org', {
          title: '원문',
          sourceText: '저장할 원문 본문입니다.',
        } as never)) as { evicted?: number; warning?: string };
        expect(`evicted: ${saved.evicted ?? 0}`).toBe('evicted: 0');
        expect(`warning: ${saved.warning ?? ''}`).toBe('warning: ');
      });
    }, 60000);

    it('names what the source cap deleted', async () => {
      await withStore(async () => {
        const library = new SnapsSourceLibraryService();
        await library.importSources(
          'full-org',
          Array.from({ length: 500 }, (_, index) => ({
            id: `src-${index}`,
            title: `원문 ${index}`,
            sourceText: `저장된 원문 본문 ${index} 입니다.`,
          }))
        );
        const saved = (await library.saveSource('full-org', {
          title: '한 건 더',
          sourceText: '새로 저장하는 원문입니다.',
        } as never)) as { evicted?: number; warning?: string };

        expect(`evicted: ${saved.evicted}`).toBe('evicted: 1');
        expect(saved.warning).toContain('상한 500개');
        expect(saved.warning).toContain('가장 오래된 1개');
        // and the store really is still at the cap, so the number is the truth
        // rather than a guess.
        const list = await library.listSources('full-org');
        expect(`stored: ${list.length}`).toBe('stored: 500');
      });
    }, 120000);

    it('names what the style example cap deleted', async () => {
      await withStore(async () => {
        const store = new SnapsVectorStoreService();
        await store.importExamples(
          'full-org',
          Array.from({ length: 500 }, (_, index) => ({
            id: `ex-${index}`,
            platform: 'instagram',
            content: `스타일 예시 ${index} 입니다.`,
          }))
        );
        const saved = (await store.addExample('full-org', {
          platform: 'instagram',
          content: '새로 추가하는 스타일 예시입니다.',
        } as never)) as { evicted?: number; warning?: string };

        expect(`evicted: ${saved.evicted}`).toBe('evicted: 1');
        expect(saved.warning).toContain('가장 오래된 1개');
        const list = await store.listExamples('full-org');
        expect(`stored: ${list.length}`).toBe('stored: 500');
      });
    }, 120000);
  });

  describe('the renderer says which slide it had to cut', () => {
    const renderer = () =>
      new SnapsCardNewsRendererService() as unknown as {
        renderDeck(deck: unknown): Promise<
          Array<{ order: number; trimmed?: Array<'heading' | 'body'> }>
        >;
      };

    const deckWith = (heading: string, body: string) => ({
      title: '환절기 건강관리',
      templateId: 'editorial',
      slides: [
        { order: 1, heading: '환절기 건강관리', body: '표지입니다.' },
        { order: 2, heading, body },
      ],
      caption: '환절기 건강관리',
      hashtags: ['#환절기'],
      provider: 'rule-fallback',
    });

    it('says nothing when every slide fits', async () => {
      const rendered = await renderer().renderDeck(
        deckWith('환절기 건강관리', '실내 습도를 오십 퍼센트로 유지하세요.') as never
      );
      for (const slide of rendered) {
        expect(`slide ${slide.order} trimmed: ${(slide.trimmed || []).join(',')}`).toBe(
          `slide ${slide.order} trimmed: `
        );
      }
    }, 30000);

    it('names the slide and the part that was cut', async () => {
      const long = '환절기에는 일교차가 커지면서 면역력이 떨어지기 쉽습니다. '.repeat(8);
      const rendered = await renderer().renderDeck(
        deckWith('환절기 건강관리', long) as never
      );
      const cut = rendered.find((slide) => (slide.trimmed || []).length);
      expect(`something was reported: ${!!cut}`).toBe('something was reported: true');
      expect(`slide: ${cut?.order}`).toBe('slide: 2');
      expect(cut?.trimmed).toEqual(['body']);
    }, 30000);

    it('reports a heading that is too long as well as a body', async () => {
      const longHeading = '환절기 건강관리를 위한 아주 긴 제목 '.repeat(6);
      const rendered = await renderer().renderDeck(
        deckWith(longHeading, '짧은 본문입니다.') as never
      );
      const cut = rendered.find((slide) => (slide.trimmed || []).includes('heading'));
      expect(`heading reported: ${!!cut}`).toBe('heading reported: true');
    }, 30000);
  });

  describe('the time each scene gets follows what it has to say', () => {
    const offline = {
      get model() {
        return 'offline';
      },
      provider: () => 'ollama',
      chatJson: async () => {
        throw new Error('offline: the deterministic script is the subject');
      },
    };

    const source =
      '환절기에는 일교차가 커지면서 면역력이 떨어지기 쉽습니다. ' +
      '실내 습도를 오십 퍼센트 이상으로 유지하고, 외출 후에는 손을 꼼꼼히 씻으세요. ' +
      '하루 일곱 시간 이상 충분히 자고 비타민이 풍부한 제철 과일을 챙겨 드세요. ' +
      '작은 습관이 환절기 감기를 막아 줍니다.';

    const scriptFor = async (durationSeconds: number) =>
      (await new SnapsShortVideoService(offline as never).script({
        sourceText: source,
        durationSeconds,
        platform: 'youtube',
      } as never)) as {
        durationSeconds: number;
        warnings?: string[];
        storyboard: Array<{
          startSecond: number;
          endSecond: number;
          narration: string;
        }>;
      };

    const syllables = (text: string) => (text.match(/[가-힣]/g) || []).length;

    it('gives the wordiest scene the most time', async () => {
      const script = await scriptFor(30);
      const scenes = script.storyboard.map((scene) => ({
        span: scene.endSecond - scene.startSecond,
        weight: syllables(scene.narration),
      }));
      const wordiest = scenes.reduce((best, scene) =>
        scene.weight > best.weight ? scene : best
      );
      const briefest = scenes.reduce((least, scene) =>
        scene.weight < least.weight ? scene : least
      );
      expect(`wordiest gets more time: ${wordiest.span > briefest.span}`).toBe(
        'wordiest gets more time: true'
      );
    });

    it('reads at about the same pace in every scene', async () => {
      const script = await scriptFor(30);
      const rates = script.storyboard.map(
        (scene) =>
          syllables(scene.narration) / (scene.endSecond - scene.startSecond)
      );
      const fastest = Math.max(...rates);
      const slowest = Math.min(...rates);
      // An even split produced 3.6, 4.6, 4.3 and 1.8 - a spread of 2.8. What
      // matters is that no scene is starved while another races.
      //
      // The bound is 0.5 because that is where the two ways of handing out the
      // leftover seconds part company. At 30 seconds the exact shares are
      // 7.28, 9.32, 8.74 and 4.66: by largest remainder they round to 7, 9, 9
      // and 5 - rates 3.57, 3.56, 3.33, 3.20, a spread of 0.37. Giving the
      // spare seconds to the wordiest scenes instead gives 7, 10, 9 and 4 -
      // 3.57, 3.20, 3.33, 4.00, a spread of 0.80. A looser bound passes for
      // both and measures nothing.
      expect(`spread under half a syllable: ${fastest - slowest < 0.5}`).toBe(
        'spread under half a syllable: true'
      );
      expect(`nobody races: ${fastest <= 6}`).toBe('nobody races: true');
    });

    it('still covers the whole duration, one scene after another', async () => {
      for (const duration of [15, 30, 45, 60]) {
        const script = await scriptFor(duration);
        const scenes = script.storyboard;
        expect(`${duration}s starts at zero: ${scenes[0].startSecond}`).toBe(
          `${duration}s starts at zero: 0`
        );
        expect(
          `${duration}s ends at the end: ${scenes[scenes.length - 1].endSecond}`
        ).toBe(`${duration}s ends at the end: ${duration}`);
        for (const [index, scene] of scenes.entries()) {
          expect(`${duration}s scene ${index + 1} has time: ${scene.endSecond > scene.startSecond}`).toBe(
            `${duration}s scene ${index + 1} has time: true`
          );
          if (index > 0) {
            expect(
              `${duration}s scene ${index + 1} follows: ${scene.startSecond === scenes[index - 1].endSecond}`
            ).toBe(`${duration}s scene ${index + 1} follows: true`);
          }
        }
      }
    });

    // When the script cannot be read in the time asked for, no split of those
    // seconds helps. Saying so is the only honest answer.
    it('says when the script is too long for the duration', async () => {
      const tight = await scriptFor(15);
      const joined = (tight.warnings || []).join(' ');
      expect(`warned: ${joined.includes('대본이 15초에 비해 깁니다')}`).toBe(
        'warned: true'
      );
      // and names what it would take, rather than only that something is wrong.
      expect(`named the need: ${/약 \d+초가 필요합니다/.test(joined)}`).toBe(
        'named the need: true'
      );

      const roomy = await scriptFor(60);
      expect(`quiet when it fits: ${(roomy.warnings || []).length}`).toBe(
        'quiet when it fits: 0'
      );
    });
  });

  describe('the operator confirmation gate', () => {
    const withWindow = <T>(replacement: unknown, run: () => T): T => {
      const host = globalThis as unknown as { window?: unknown };
      const had = 'window' in host;
      const original = host.window;
      if (replacement === undefined) {
        delete host.window;
      } else {
        host.window = replacement;
      }
      try {
        return run();
      } finally {
        if (had) {
          host.window = original;
        } else {
          delete host.window;
        }
      }
    };

    it('refuses when there is no window to ask', () => {
      const answer = withWindow(undefined, () =>
        confirmOperatorAction('원문을 삭제할까요?')
      );
      expect(`answered: ${answer}`).toBe('answered: false');
    });

    it('refuses when the operator says no', () => {
      const answer = withWindow({ confirm: () => false }, () =>
        confirmOperatorAction('원문을 삭제할까요?')
      );
      expect(`answered: ${answer}`).toBe('answered: false');
    });

    it('proceeds only when the operator says yes', () => {
      const asked: string[] = [];
      const answer = withWindow(
        {
          confirm: (message: string) => {
            asked.push(message);
            return true;
          },
        },
        () => confirmOperatorAction('원문을 삭제할까요?')
      );
      expect(`answered: ${answer}`).toBe('answered: true');
      expect(asked).toEqual(['원문을 삭제할까요?']);
    });

    // Guard the guard: if `window` were still the real one, the first case
    // would pass for the wrong reason.
    it('is really removing the window it tests without', () => {
      const seen = withWindow(undefined, () =>
        typeof (globalThis as unknown as { window?: unknown }).window
      );
      expect(seen).toBe('undefined');
    });
  });

  describe('the clamp without Intl.Segmenter', () => {
    const withoutSegmenter = <T>(run: (clamp: (v: string, n: number) => string) => T): T => {
      const intl = Intl as unknown as { Segmenter?: unknown };
      const original = intl.Segmenter;
      delete intl.Segmenter;
      try {
        let result!: T;
        jest.isolateModules(() => {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const fresh = require('@gitroom/nestjs-libraries/snaps/text/clamp-text');
          result = run(fresh.snapsClampText);
        });
        return result;
      } finally {
        intl.Segmenter = original;
      }
    };

    it('still refuses to cut a surrogate pair in half', () => {
      const leaf = String.fromCodePoint(0x1f33f);
      const text = `${'가'.repeat(9)}${leaf}${'가'.repeat(9)}`;
      // 10 units in: the first half of the leaf.
      const cut = withoutSegmenter((clamp) => clamp(text, 10));
      const last = cut.charCodeAt(cut.length - 1);
      expect(`ends on a high surrogate: ${last >= 0xd800 && last <= 0xdbff}`).toBe(
        'ends on a high surrogate: false'
      );
      expect(cut).toBe('가'.repeat(9));
    });

    it('keeps a whole pair that fits', () => {
      const leaf = String.fromCodePoint(0x1f33f);
      const text = `${'가'.repeat(9)}${leaf}${'가'.repeat(9)}`;
      const cut = withoutSegmenter((clamp) => clamp(text, 11));
      expect(cut).toBe(`${'가'.repeat(9)}${leaf}`);
    });

    it('is the path being taken, not the segmenter one', () => {
      // Guard the guard: if Intl.Segmenter were still reachable the two cases
      // above would pass without the fallback ever running.
      const reached = withoutSegmenter(() => {
        const intl = Intl as unknown as { Segmenter?: unknown };
        return intl.Segmenter === undefined;
      });
      expect(`segmenter hidden: ${reached}`).toBe('segmenter hidden: true');
    });
  });

  describe('an emoji on the cut survives to the published post', () => {
    const loneSurrogates = (text: string) => {
      let count = 0;
      for (let index = 0; index < text.length; index += 1) {
        const unit = text.charCodeAt(index);
        if (unit >= 0xd800 && unit <= 0xdbff) {
          const next = text.charCodeAt(index + 1);
          if (next >= 0xdc00 && next <= 0xdfff) {
            index += 1;
          } else {
            count += 1;
          }
        } else if (unit >= 0xdc00 && unit <= 0xdfff) {
          count += 1;
        }
      }
      return count;
    };

    const bodyForCut = (platform: string) => {
      const rule = snapsPlatformRules[platform as never] as {
        maxLength: number;
        weightedLimit?: number;
      };
      const leaf = String.fromCodePoint(0x1f33f);
      if (rule.weightedLimit) {
        // Hangul weighs two, so the budget is reached at half the characters.
        let filler = '';
        while (snapsWeightedLength(filler) < rule.weightedLimit - 1) {
          filler += '가';
        }
        return `${filler}${leaf}${'가'.repeat(40)}`;
      }
      return `${'가'.repeat(rule.maxLength - 1)}${leaf}${'가'.repeat(40)}`;
    };

    it('never publishes half of a character', () => {
      for (const platform of snapsTargetPlatforms) {
        const settings: Record<string, unknown> = { __type: platform };
        if (platform === 'naver-cafe') {
          settings.clubId = 'club';
          settings.menuId = 'menu';
          settings.subject = '환절기';
        }
        if (platform === 'instagram') {
          settings.post_type = 'post';
        }

        const built = buildSnapsPublishingPayload({
          variants: [
            {
              platform,
              label: platform,
              title: '환절기 건강관리',
              content: bodyForCut(platform),
              hashtags: ['#환절기'],
              settings,
              publishMode: 'schedule',
            },
          ],
          integrations: [{ platform, integrationId: `${platform}-id` }],
          publishDate: '2026-05-05T10:00:00.000Z',
          scheduleType: 'schedule',
          now: Date.parse('2026-05-05T09:00:00.000Z'),
        } as never);

        const posts =
          (built.payload as {
            posts?: Array<{ value?: Array<{ content?: string }> }>;
          })?.posts || [];
        const text = posts
          .flatMap((post) => post.value || [])
          .map((segment) => String(segment.content || ''))
          .join('\n');

        expect(`${platform} published: ${text.length > 0}`).toBe(
          `${platform} published: true`
        );
        expect(`${platform} lone surrogates: ${loneSurrogates(text)}`).toBe(
          `${platform} lone surrogates: 0`
        );
      }
    });
  });

  describe('the writers line breaks reach the published post', () => {
    const body = [
      '환절기 건강관리 세 가지',
      '',
      '첫째, 실내 습도를 오십 퍼센트로 유지하세요.',
      '둘째, 외출 후에는 손을 씻습니다.',
      '',
      '셋째, 하루 일곱 시간은 주무세요.',
    ].join('\n');

    const publish = (platform: string) => {
      const settings: Record<string, unknown> = { __type: platform };
      if (platform === 'naver-cafe') {
        settings.clubId = 'club';
        settings.menuId = 'menu';
        settings.subject = '환절기 건강관리';
      }
      if (platform === 'instagram') {
        settings.post_type = 'post';
      }
      const built = buildSnapsPublishingPayload({
        variants: [
          {
            platform,
            label: platform,
            title: '환절기 건강관리',
            content: body,
            hashtags: ['#환절기'],
            settings,
            publishMode: 'schedule',
          },
        ],
        integrations: [{ platform, integrationId: `${platform}-id` }],
        publishDate: '2026-05-05T10:00:00.000Z',
        scheduleType: 'schedule',
        now: Date.parse('2026-05-05T09:00:00.000Z'),
      } as never);
      const posts =
        (built.payload as { posts?: Array<{ value?: Array<{ content?: string }> }> })
          ?.posts || [];
      return {
        schedulable: built.schedulable.length,
        text: posts
          .flatMap((post) => post.value || [])
          .map((segment) => String(segment.content || ''))
          .join('\n'),
      };
    };

    it('keeps every paragraph break on every platform', () => {
      for (const platform of snapsTargetPlatforms) {
        const { schedulable, text } = publish(platform);
        expect(`${platform} schedulable: ${schedulable}`).toBe(
          `${platform} schedulable: 1`
        );
        // Three blank runs: the two the writer typed, and the one before the
        // hashtags. A flattened body has one - only the hashtag separator.
        const blankRuns = (text.match(/\n[^\S\n]*\n/g) || []).length;
        expect(`${platform} blank runs: ${blankRuns}`).toBe(
          `${platform} blank runs: 3`
        );
        // and the single breaks between the second and third lines survive.
        expect(`${platform} has the line break: ${text.includes('유지하세요.\n둘째')}`).toBe(
          `${platform} has the line break: true`
        );
      }
    });

    it('does not leave a run of blank lines longer than a paragraph', () => {
      const { text } = publish('threads');
      expect(`three in a row: ${/\n[^\S\n]*\n[^\S\n]*\n/.test(text)}`).toBe(
        'three in a row: false'
      );
    });
  });

  describe('the sentiment and the signal agree', () => {
    const inner = () =>
      new SnapsFeedbackInboxService(undefined as never) as unknown as {
        classify(text: string): string;
        detectConversionSignals(text: string): string[];
      };

    const comments = [
      '품질이 기대 이하네요',
      '배송이 느립니다',
      '조금 아쉽네요',
      '불만이 좀 있어요',
      '좋긴 한데 배송이 너무 느려요',
      '실망했어요',
      '최악입니다',
      '문제가 있어요',
    ];

    it('flags complaint-risk on every comment it calls a complaint', () => {
      const service = inner();
      for (const comment of comments) {
        const sentiment = service.classify(comment);
        const signals = service.detectConversionSignals(comment);
        expect(`${comment}: ${sentiment}`).toBe(`${comment}: complaint`);
        expect(`${comment}: ${signals.includes('complaint-risk')}`).toBe(
          `${comment}: true`
        );
      }
    });

    it('does not flag complaint-risk on what it calls praise', () => {
      const service = inner();
      for (const comment of ['문제없이 잘 쓰고 있어요', '정말 만족합니다']) {
        expect(`${comment}: ${service.classify(comment)}`).toBe(
          `${comment}: praise`
        );
        expect(
          `${comment}: ${service
            .detectConversionSignals(comment)
            .includes('complaint-risk')}`
        ).toBe(`${comment}: false`);
      }
    });

    it('agrees about an approach whether or not it is spaced', () => {
      const service = inner();
      for (const comment of ['광고문의 드립니다', '광고 문의 드립니다', '협업 제안']) {
        expect(`${comment}: ${service.classify(comment)}`).toBe(
          `${comment}: collaboration`
        );
        expect(
          `${comment}: ${service
            .detectConversionSignals(comment)
            .includes('collaboration')}`
        ).toBe(`${comment}: true`);
      }
    });
  });

  describe('what the feedback classifier does with real comments', () => {
    const classify = (content: string) =>
      (
        new SnapsFeedbackInboxService(undefined as never) as unknown as {
          classify(text: string): string;
        }
      ).classify(content);

    // The one that is wrong in the worst direction: the operator reads praise
    // and moves on, and the complaint inside it is never answered.
    it('answers a mixed comment as a complaint, not as praise', () => {
      expect(classify('좋긴 한데 배송이 너무 느려요')).toBe('complaint');
      expect(classify('디자인은 좋은데 기대 이하였어요')).toBe('complaint');
    });

    it('recognises the complaints that carry no complaint word', () => {
      for (const comment of [
        '품질이 기대 이하네요',
        '배송이 느립니다',
        '조금 아쉽네요',
        '불만이 좀 있어요',
      ]) {
        expect(`${comment} -> ${classify(comment)}`).toBe(
          `${comment} -> complaint`
        );
      }
    });

    it('recognises the approvals that use 잘 and 만족', () => {
      for (const comment of ['잘 봤습니다', '잘 쓰고 있어요', '구매했는데 만족합니다']) {
        expect(`${comment} -> ${classify(comment)}`).toBe(`${comment} -> praise`);
      }
    });

    // `잘` on its own is not approval, and treating it as such would file a
    // complaint as praise - the direction this describe block exists to stop.
    it('does not read a bare 잘 as approval', () => {
      expect(classify('잘 안 돼요')).not.toBe('praise');
      expect(classify('잘못 배송됐어요')).not.toBe('praise');
    });

    // A pitch with no link is still a pitch. One pitch word is not: plenty of
    // ordinary comments mention 무료 or 이벤트.
    it('files an unlinked pitch as spam and a single pitch word as not', () => {
      expect(classify('가입하면 수익 보장! 클릭하세요')).toBe('spam');
      expect(classify('무료 배송이라 좋아요')).toBe('praise');
      expect(classify('이벤트 참여했어요')).not.toBe('spam');
    });

    // The rules that were already right have to stay right.
    it('keeps the classifications that were already correct', () => {
      const cases: Array<[string, string]> = [
        ['정말 도움이 됐어요. 감사합니다!', 'praise'],
        ['이거 어디서 살 수 있나요?', 'question'],
        ['배송이 너무 늦어서 실망했어요', 'complaint'],
        ['협업 문의드립니다. 메일 확인 부탁드려요', 'collaboration'],
        ['광고 문의 드립니다', 'collaboration'],
        ['무료 코인 받아가세요 http://spam.example', 'spam'],
        ['전혀 문제없었어요, 잘 쓰고 있습니다', 'praise'],
        ['음...', 'other'],
      ];
      for (const [comment, expected] of cases) {
        expect(`${comment} -> ${classify(comment)}`).toBe(
          `${comment} -> ${expected}`
        );
      }
    });
  });

  describe('what the agent readiness row measures', () => {
    const planner = () =>
      new SnapsCommandPlannerService(
        { provider: () => 'ollama' } as never,
        {} as never,
        {} as never,
        {} as never
      );

    const readinessFor = (platform: string, content: string) =>
      (
        planner() as unknown as {
          buildPlatformReadiness(
            variants: Array<Record<string, unknown>>
          ): Array<{ platform: string; checks: string[]; blockers: string[] }>;
        }
      ).buildPlatformReadiness([
        { platform, title: '', content, hashtags: [] },
      ])[0];

    it('blocks a Korean X post that X would refuse', () => {
      const korean = '가'.repeat(200);
      expect(snapsWeightedLength(korean)).toBe(400);
      const row = readinessFor('x', korean);
      expect(`blocked: ${row.blockers.length > 0}`).toBe('blocked: true');
      expect(row.blockers.join(' ')).toContain('깁니다');
      // and the row says what it counted, so 140 does not read as arbitrary.
      expect(row.checks.join(' ')).toContain('한글 2자');
      expect(row.checks.join(' ')).toContain('400/280');
    });

    it('passes the same length in English, which X counts as one each', () => {
      const latin = 'a'.repeat(200);
      const row = readinessFor('x', latin);
      expect(`blocked: ${row.blockers.length > 0}`).toBe('blocked: false');
      expect(row.checks.join(' ')).toContain('200/280');
    });

    // The nine platforms that count characters keep counting characters.
    it('counts characters where the platform does', () => {
      const row = readinessFor('threads', '가'.repeat(200));
      expect(`blocked: ${row.blockers.length > 0}`).toBe('blocked: false');
      expect(row.checks.join(' ')).toContain('200/');
      expect(`mentions weighting: ${row.checks.join(' ').includes('한글 2자')}`).toBe(
        'mentions weighting: false'
      );
    });

    // The symptom of weighting the wrong platform: a post well inside the
    // character limit reported as too long. The length has to be chosen so
    // that it fits in characters and does not fit in units - 800 Hangul
    // characters are 800 of Threads' 1,500 and 1,600 if weighted. At 200, and
    // at 300, nothing crosses either limit and the mutation that weights every
    // platform survives; measured both times before this number was picked.
    it('does not block a Threads post that fits its character limit', () => {
      const long = '가'.repeat(800);
      expect(snapsWeightedLength(long)).toBe(1600);
      expect(long.length).toBeLessThanOrEqual(
        snapsPlatformRules.threads.maxLength
      );
      expect(snapsWeightedLength(long)).toBeGreaterThan(
        snapsPlatformRules.threads.maxLength
      );
      const row = readinessFor('threads', long);
      expect(`blocked: ${row.blockers.join(' ')}`).toBe('blocked: ');
    });
  });

  describe('the agent brief the operator copies', () => {
    const plan = {
      plan: {
        command: '환절기 건강관리 콘텐츠를\n두 줄짜리 오더로 준비해줘',
        targetPlatforms: ['instagram', 'threads'],
        scheduleType: 'draft',
        includeShortVideo: false,
        shortVideoTargetPlatforms: [],
        operatorSummary: ['요약 첫 줄', '요약 둘째 줄'],
      },
      operation: { nextActions: ['초안 확인', '예약 시간 지정'] },
      transform: {
        variants: [
          {
            label: 'instagram',
            title: '제목',
            content: '본문 첫 줄\r\n\r\n본문 둘째 줄\n\n',
            hashtags: ['#환절기'],
          },
        ],
      },
    };

    it('keeps a blank line between the sections', () => {
      const brief = formatSnapsAgentBrief(plan as never);
      for (const heading of ['작업자 브리핑', '다음 액션', '채널별 초안']) {
        expect(`${heading} starts a block: ${brief.includes('\n\n' + heading)}`).toBe(
          `${heading} starts a block: true`
        );
      }
    });

    it('keeps a multi-line order on the 오더 line', () => {
      const brief = formatSnapsAgentBrief(plan as never);
      expect(brief.split('\n')[0]).toBe(
        '오더: 환절기 건강관리 콘텐츠를 두 줄짜리 오더로 준비해줘'
      );
      expect(brief.split('\n')[1]).toBe('대상: instagram, threads');
    });

    it('normalises the variant bodies like the other copy formats', () => {
      const brief = formatSnapsAgentBrief(plan as never);
      expect(`carriage returns: ${brief.includes('\r')}`).toBe(
        'carriage returns: false'
      );
      expect(`three blank lines: ${/\n{3,}/.test(brief)}`).toBe(
        'three blank lines: false'
      );
      expect(brief.endsWith('#환절기')).toBe(true);
    });

    it('labels the platforms the way the caller does', () => {
      const brief = formatSnapsAgentBrief(
        plan as never,
        (platform) => platform.toUpperCase()
      );
      expect(brief.split('\n')[1]).toBe('대상: INSTAGRAM, THREADS');
    });

    it('drops a section that has nothing in it, not just its lines', () => {
      const brief = formatSnapsAgentBrief({
        plan: {
          command: '오더',
          targetPlatforms: ['instagram'],
          scheduleType: 'draft',
        },
        operation: { nextActions: [] },
        transform: { variants: [] },
      } as never);
      expect(brief).toBe('오더: 오더\n대상: instagram\n모드: 초안');
      for (const heading of ['작업자 브리핑', '다음 액션', '채널별 초안']) {
        expect(`${heading} present: ${brief.includes(heading)}`).toBe(
          `${heading} present: false`
        );
      }
    });

    it('says the schedule when there is one', () => {
      const brief = formatSnapsAgentBrief({
        plan: {
          command: '오더',
          targetPlatforms: ['instagram'],
          scheduleType: 'schedule',
          publishDateLocal: '2026-09-13 14:00',
          includeShortVideo: true,
          shortVideoTargetPlatforms: ['youtube'],
        },
      } as never);
      expect(brief.split('\n')[2]).toBe('예약: 2026-09-13 14:00');
      expect(brief.split('\n')[3]).toBe('쇼츠: youtube');
    });

    it('does not fall over on a result it cannot read', () => {
      expect(formatSnapsAgentBrief(undefined)).toBe('오더: \n대상: \n모드: 초안');
    });
  });

  describe('what the three copy formats hand the operator', () => {
    const formats = (variant: Record<string, unknown>) => ({
      plain: formatSnapsVariantPlainText(variant as never),
      markdown: formatSnapsVariantMarkdown(variant as never),
      html: formatSnapsVariantHtml(variant as never),
    });

    it('keeps a title on one line in every format', () => {
      const out = formats({
        title: '환절기 건강관리\n두 번째 줄',
        content: '본문입니다.',
        hashtags: ['#환절기'],
      });
      expect(out.plain.split('\n')[0]).toBe('환절기 건강관리 두 번째 줄');
      expect(out.markdown.split('\n')[0]).toBe('# 환절기 건강관리 두 번째 줄');
      expect(out.html).toContain('<h1>환절기 건강관리 두 번째 줄</h1>');
      // The whole title is the heading block - none of it has fallen through
      // into the body, which is what a raw newline in the title did.
      expect(out.markdown.split('\n\n')[0]).toBe('# 환절기 건강관리 두 번째 줄');
    });

    it('normalises line endings in every format, not just html', () => {
      const out = formats({
        title: '제목',
        content: '첫 줄\r\n\r\n둘째 줄',
        hashtags: [],
      });
      for (const [name, text] of Object.entries(out)) {
        expect(`${name} carries a carriage return: ${text.includes('\r')}`).toBe(
          `${name} carries a carriage return: false`
        );
      }
      // The paragraph break itself survives - the writer's line breaks are the
      // point of the chain that feeds this.
      expect(out.plain).toBe('제목\n\n첫 줄\n\n둘째 줄');

      // A carriage return that is not part of a CRLF pair. Stripping trailing
      // whitespace per line removes the CR in `\r\n` as a side effect, so
      // without this case a mutation that deletes the line-ending
      // normalisation survives - measured, it did.
      const lone = formats({ content: '첫 줄\r둘째 줄' });
      expect(lone.plain).toBe('첫 줄\n둘째 줄');
      expect(`html keeps a CR: ${lone.html.includes('\r')}`).toBe(
        'html keeps a CR: false'
      );
    });

    it('does not paste an empty paragraph', () => {
      const out = formats({
        title: '제목',
        content: '본문입니다.\n\n',
        hashtags: ['#태그'],
      });
      expect(`empty paragraph: ${out.html.includes('<p></p>')}`).toBe(
        'empty paragraph: false'
      );
      expect(out.html).toBe(
        '<h1>제목</h1>\n<p>본문입니다.</p>\n<p>#태그</p>'
      );
      expect(out.plain).toBe('제목\n\n본문입니다.\n\n#태그');
    });

    it('keeps the writers own line breaks inside the body', () => {
      const out = formats({
        content: '첫 줄\n둘째 줄\n\n셋째 문단',
      });
      expect(out.plain).toBe('첫 줄\n둘째 줄\n\n셋째 문단');
      expect(out.html).toBe('<p>첫 줄<br />둘째 줄</p><p>셋째 문단</p>');
    });

    it('still escapes markup in every part', () => {
      const out = formats({
        title: '제목 <b>굵게</b>',
        content: '<script>alert(1)</script>',
        hashtags: ['#<img src=x>'],
      });
      expect(`script: ${out.html.includes('<script>')}`).toBe('script: false');
      expect(`img: ${out.html.includes('<img')}`).toBe('img: false');
      expect(`bold: ${out.html.includes('<b>')}`).toBe('bold: false');
      expect(`escaped: ${out.html.includes('&lt;script&gt;')}`).toBe(
        'escaped: true'
      );
    });

    it('drops empty hashtags rather than pasting a stray space', () => {
      const out = formats({
        content: '본문',
        hashtags: ['#환절기', '  ', '', '#감기예방'],
      });
      expect(out.plain).toBe('본문\n\n#환절기 #감기예방');
    });
  });

  describe('the html a report export hands over', () => {
    const buildReport = async (dir: string) => {
      const library = new SnapsSourceLibraryService();
      const stored = await library.saveReport('rep-org', '환절기 캠페인 성과', {
        summary: '도달이 지난달보다 22% 늘었습니다.',
        insights: ['저장률이 높은 슬라이드는 3번', '댓글은 오후 8시에 몰린다'],
        actionItems: ['3번 슬라이드 형식을 반복'],
        generatedAt: new Date(0).toISOString(),
      } as never);
      void dir;
      return { library, id: stored.id };
    };

    const withStore = async (run: (dir: string) => Promise<void>) => {
      const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'snaps-rephtml-'));
      const previous = process.env.SNAPS_DATA_DIR;
      process.env.SNAPS_DATA_DIR = base;
      try {
        await run(base);
      } finally {
        if (previous === undefined) {
          delete process.env.SNAPS_DATA_DIR;
        } else {
          process.env.SNAPS_DATA_DIR = previous;
        }
        await fsp.rm(base, { recursive: true, force: true });
      }
    };

    it('puts every bullet inside a list', async () => {
      await withStore(async (dir) => {
        const { library, id } = await buildReport(dir);
        const html = String(
          (await library.exportReport('rep-org', id, 'html'))?.content || ''
        );
        const items = (html.match(/<li>/g) || []).length;
        const lists = (html.match(/<ul>/g) || []).length;
        const closes = (html.match(/<\/ul>/g) || []).length;
        expect(`items ${items > 0} lists ${lists} closes ${closes}`).toBe(
          `items true lists 2 closes 2`
        );
        // No item may sit outside a list. Strip the lists and nothing should
        // be left.
        const outside = html.replace(/<ul>[\s\S]*?<\/ul>/g, '');
        expect(`orphan items: ${(outside.match(/<li>/g) || []).length}`).toBe(
          'orphan items: 0'
        );
        // Two separate sections, two separate lists - not one list swallowing
        // the heading between them.
        expect(`heading between lists: ${/<\/ul>\n<h2>/.test(html)}`).toBe(
          'heading between lists: true'
        );
      });
    });

    it('still escapes what the model wrote', async () => {
      await withStore(async (dir) => {
        void dir;
        const library = new SnapsSourceLibraryService();
        const stored = await library.saveReport('rep-org', '보고서 <b>제목</b>', {
          summary: '요약 <script>alert(1)</script> 입니다.',
          insights: ['인사이트 <img src=x onerror=1> 입니다'],
          actionItems: [],
          generatedAt: new Date(0).toISOString(),
        } as never);
        const html = String(
          (await library.exportReport('rep-org', stored.id, 'html'))?.content || ''
        );
        expect(`script tag: ${html.includes('<script>')}`).toBe(
          'script tag: false'
        );
        expect(`img tag: ${html.includes('<img')}`).toBe('img tag: false');
        expect(`escaped: ${html.includes('&lt;script&gt;')}`).toBe(
          'escaped: true'
        );
      });
    });

    // The print stylesheet indented each `li` by hand because there was no
    // list to do it. With a real list that would indent twice.
    it('does not indent the list twice in the print sheet', async () => {
      await withStore(async (dir) => {
        const { library, id } = await buildReport(dir);
        const printed = String(
          (await library.exportReport('rep-org', id, 'print-html'))?.content || ''
        );
        expect(`has a list: ${printed.includes('<ul>')}`).toBe('has a list: true');
        expect(`li carries its own indent: ${/li \{[^}]*20px/.test(printed)}`).toBe(
          'li carries its own indent: false'
        );
        expect(`ul carries the indent: ${/ul \{[^}]*padding-left/.test(printed)}`).toBe(
          'ul carries the indent: true'
        );
      });
    });
  });

  describe('what a Shorts-Maker render job panel may submit', () => {
    const complete = {
      fullAudio: 'https://cdn.example.com/audio.mp3',
      visuals: { frames: ['https://cdn.example.com/frame-1.png'] },
      frameDurationsSec: [3, 3, 4],
      durationMs: 30000,
    };

    it('accepts a complete request', () => {
      const readiness = describeSnapsRenderJobRequest(complete);
      expect(`ready ${readiness.ready} problems ${readiness.problems.length}`).toBe(
        'ready true problems 0'
      );
    });

    it('names every missing field at once, not the first', () => {
      const readiness = describeSnapsRenderJobRequest({});
      expect(readiness.ready).toBe(false);
      expect(readiness.problems).toEqual([
        'fullAudio는 필수입니다.',
        'visuals는 필수입니다.',
        'frameDurationsSec는 필수입니다.',
        'durationMs는 0보다 큰 숫자여야 합니다.',
      ]);
    });

    // NaN is the one that matters: JSON.stringify turns it into null, so the
    // renderer would receive a payload that is not the one the operator built.
    it('refuses frame durations that are not positive numbers', () => {
      for (const frames of [[3, Number.NaN], [3, -1], [3, 0], [3, '4'], [3, null]]) {
        const readiness = describeSnapsRenderJobRequest({
          ...complete,
          frameDurationsSec: frames as never,
        });
        expect(`${JSON.stringify(frames)} -> ${readiness.ready}`).toBe(
          `${JSON.stringify(frames)} -> false`
        );
        expect(readiness.problems).toContain(
          'frameDurationsSec의 각 항목은 0보다 큰 숫자여야 합니다.'
        );
      }
    });

    it('refuses a duration that is not a positive number', () => {
      for (const durationMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '30000']) {
        const readiness = describeSnapsRenderJobRequest({
          ...complete,
          durationMs: durationMs as never,
        });
        expect(`${String(durationMs)} -> ${readiness.ready}`).toBe(
          `${String(durationMs)} -> false`
        );
      }
    });

    // The words are the route's. If the route changes them, this fails here
    // rather than showing an operator two different sentences for one problem.
    it('uses the routes own wording', async () => {
      const controller = await fsp.readFile(
        path.join(
          __dirname,
          '../../../../apps/backend/src/api/routes/snaps.controller.ts'
        ),
        'utf8'
      );
      const everyProblem = [
        ...describeSnapsRenderJobRequest({}).problems,
        'frameDurationsSec의 각 항목은 0보다 큰 숫자여야 합니다.',
      ];
      expect(`checked ${everyProblem.length >= 5}`).toBe('checked true');
      const missing = everyProblem.filter(
        (problem) => !controller.includes(problem)
      );
      expect(`not in the controller: ${missing.join(' | ')}`).toBe(
        'not in the controller: '
      );
    });

    // Shorts-Maker names its terminal states, so anything else is still
    // working - unlike Pixelle, whose vocabulary the poll reader above maps an
    // unknown status onto `running` for the opposite reason.
    it('reads a render job poll', () => {
      const cases: Array<[unknown, boolean, string]> = [
        ['queued', false, 'running/queued'],
        ['processing', false, 'running/processing'],
        ['completed', false, 'completed/completed'],
        ['failed', false, 'failed/failed'],
        ['not-configured', false, 'stopped/failed'],
        ['not-found', false, 'stopped/failed'],
        ['something-new', false, 'running/processing'],
        [undefined, true, 'completed/completed'],
      ];
      for (const [status, hasAsset, expected] of cases) {
        const poll = readSnapsRenderJobPoll(status, hasAsset);
        expect(`${String(status)} -> ${poll.phase}/${poll.status}`).toBe(
          `${String(status)} -> ${expected}`
        );
      }
    });
  });

  describe('what the workspace says after attaching to channels', () => {
    it('counts the channels it actually reached', () => {
      const outcome = describeSnapsAttachResult(
        { scheduled: [{ postId: 'a' }, { postId: 'b' }], schedulable: [1, 2] },
        'draft',
        '카드뉴스를'
      );
      expect(outcome.tone).toBe('success');
      expect(outcome.created).toBe(2);
      expect(outcome.message).toBe(
        '카드뉴스를 연결된 채널 2개 초안에 첨부했습니다.'
      );
    });

    it('says 예약 게시물 for a schedule and 초안 for a draft', () => {
      const scheduled = describeSnapsAttachResult(
        { scheduled: [{ postId: 'a' }], schedulable: [1] },
        'schedule',
        '쇼츠 영상을'
      );
      expect(scheduled.message).toBe(
        '쇼츠 영상을 연결된 채널 1개 예약 게시물에 첨부했습니다.'
      );
    });

    // Nothing was schedulable, so nothing was ever going to be created and the
    // builder's own warning is the reason.
    it('gives the builders reason when nothing was schedulable', () => {
      const outcome = describeSnapsAttachResult(
        {
          scheduled: [],
          schedulable: [],
          warnings: ['threads 채널은 연결되어 있지 않습니다.'],
        },
        'draft',
        '카드뉴스를'
      );
      expect(outcome.tone).toBe('warning');
      expect(outcome.message).toBe('threads 채널은 연결되어 있지 않습니다.');
    });

    // The case the wording could not support: three channels were ready and
    // the response came back empty. Saying nothing was created is a claim this
    // layer cannot make, and it is the claim that causes the duplicate.
    it('does not claim nothing was created when channels were ready', () => {
      const outcome = describeSnapsAttachResult(
        { scheduled: [], schedulable: [1, 2, 3], warnings: [] },
        'draft',
        '카드뉴스를'
      );
      expect(outcome.tone).toBe('warning');
      expect(outcome.created).toBe(0);
      expect(`claims none created: ${outcome.message.includes('게시물이 생성되지 않았습니다')}`).toBe(
        'claims none created: false'
      );
      expect(`names the count: ${outcome.message.includes('3개')}`).toBe(
        'names the count: true'
      );
      expect(`tells them to check: ${outcome.message.includes('확인')}`).toBe(
        'tells them to check: true'
      );
    });

    it('does not fall over on a response it cannot read', () => {
      const outcome = describeSnapsAttachResult(undefined, 'draft', '카드뉴스를');
      expect(outcome.tone).toBe('warning');
      expect(outcome.created).toBe(0);
      expect(outcome.message).toBe('연결된 채널에 게시물이 생성되지 않았습니다.');
    });
  });

  describe('what the workspace says after an import', () => {
    it('counts every store, not just the first two', () => {
      const summary = summariseSnapsWorkspaceImport(
        { product: 'snaps' },
        {
          sources: { imported: 0 },
          styleExamples: { imported: 0 },
          reports: { imported: 3 },
          agentTasks: { imported: 1 },
          inboxItems: { imported: 0 },
          activity: { imported: 12 },
        }
      );
      expect(summary.tone).toBe('success');
      expect(summary.message).toBe(
        '워크스페이스 가져오기 완료: 원문 0개, RAG 0개, 보고서 3개, 작업 1개, 반응 0개, 기록 12개'
      );
    });

    it('still reports what the cap kept out', () => {
      const summary = summariseSnapsWorkspaceImport(
        { product: 'snaps' },
        { sources: { imported: 400, dropped: 200 } }
      );
      expect(summary.tone).toBe('warning');
      expect(summary.message).toContain('항목 200개가 보관되지 못했습니다');
    });

    // The same number, from the other side of the cap. Two of the six stores
    // cut the incoming list before the merge, so `dropped` also counts entries
    // that arrived and were never stored. Measured end to end: restoring 1,200
    // style examples into an empty workspace answered
    // `{imported: 1200, total: 500, dropped: 700}` and the line said
    // `기존 항목 700개가 삭제되었습니다` - of a workspace that had nothing in
    // it to delete. The wording has to hold for both sides.
    it('does not claim existing entries were deleted from an empty workspace', () => {
      const summary = summariseSnapsWorkspaceImport(
        { product: 'snaps' },
        { styleExamples: { imported: 1200, dropped: 700 } }
      );
      expect(summary.tone).toBe('warning');
      expect(summary.message).toContain('항목 700개가 보관되지 못했습니다');
      expect(`says deleted: ${summary.message.includes('삭제')}`).toBe(
        'says deleted: false'
      );
      expect(`says existing: ${summary.message.includes('기존')}`).toBe(
        'says existing: false'
      );
    });

    // A file that is not a snaps backup: every store reports nothing, and the
    // old line called that 완료.
    it('warns when nothing arrived and the file is not a snaps backup', () => {
      const summary = summariseSnapsWorkspaceImport(
        { name: 'some-package', version: '1.0.0' },
        { sources: { imported: 0 }, activity: { imported: 0 } }
      );
      expect(summary.tone).toBe('warning');
      expect(summary.message).toBe(
        'snaps 워크스페이스 백업이 아닌 것 같습니다. 가져온 항목이 없습니다.'
      );
    });

    it('says an empty snaps backup is empty rather than wrong', () => {
      const summary = summariseSnapsWorkspaceImport(
        { product: 'snaps', sources: [] },
        { sources: { imported: 0 } }
      );
      expect(summary.tone).toBe('warning');
      expect(summary.message).toBe('가져온 항목이 없습니다. 이 백업은 비어 있습니다.');
    });

    it('does not fall over on a response it cannot read', () => {
      const summary = summariseSnapsWorkspaceImport(undefined, undefined);
      expect(summary.tone).toBe('warning');
      expect(summary.message).toContain('가져온 항목이 없습니다');
    });
  });
  // The storyboard has to cover the whole clip with no gaps, no overlaps and no
  // empty scene, whatever the model returned - measured against the live
  // DeepSeek API, roughly one run in three treats endSecond as inclusive. The
  // repair worked for everything the service can produce, but only because the
  // duration is clamped to [15, 90] and the storyboard capped at six: with more
  // scenes than seconds every scene came back as 0-1, overlapping, never
  // reaching the end. That was a guarantee held by two constants in other
  // methods, and nothing recorded the dependency.
  describe('the shorts timeline covers the clip whichever scenes arrive', () => {
    const shorts = new SnapsShortVideoService(new OfflineOllama() as never) as unknown as {
      enforceTimeline: (
        storyboard: Array<Record<string, unknown>>,
        durationSeconds: number
      ) => Array<{ scene: number; startSecond: number; endSecond: number }>;
    };

    const faults = (
      timeline: Array<{ scene: number; startSecond: number; endSecond: number }>,
      duration: number
    ) => {
      const problems: string[] = [];
      if (!timeline.length) {
        return ['empty'];
      }
      if (timeline[0].startSecond !== 0) {
        problems.push(`starts at ${timeline[0].startSecond}`);
      }
      if (Math.abs(timeline[timeline.length - 1].endSecond - duration) > 1e-9) {
        problems.push(`ends at ${timeline[timeline.length - 1].endSecond}`);
      }
      timeline.forEach((scene, index) => {
        if (scene.endSecond <= scene.startSecond) {
          problems.push(`scene ${index + 1} has no span`);
        }
        if (
          index &&
          Math.abs(timeline[index - 1].endSecond - scene.startSecond) > 1e-9
        ) {
          problems.push(`gap or overlap before scene ${index + 1}`);
        }
        if (scene.scene !== index + 1) {
          problems.push(`scene numbered ${scene.scene} at position ${index + 1}`);
        }
      });
      return problems;
    };

    const build = (spans: Array<[number, number]>) =>
      spans.map(([startSecond, endSecond], index) => ({
        scene: index + 1,
        startSecond,
        endSecond,
        visual: '화면',
        narration: '나레이션',
      }));

    it.each([
      ['already even', [[0, 10], [10, 20], [20, 30]], 30],
      // The shape the live API actually returns about a third of the time.
      ['inclusive ends', [[0, 5], [6, 14], [15, 23]], 24],
      ['overlapping', [[0, 12], [5, 20], [18, 30]], 30],
      ['out of order', [[20, 30], [0, 10], [10, 20]], 30],
      ['negative start', [[-5, 10], [10, 20], [20, 30]], 30],
      ['zero length', [[0, 0], [0, 0], [0, 0]], 30],
      ['reversed bounds', [[10, 0], [20, 10], [30, 20]], 30],
      ['past the duration', [[0, 100], [100, 200], [200, 300]], 30],
      ['first scene fills the clip', [[0, 30], [30, 30], [30, 30]], 30],
      ['one scene', [[3, 7]], 30],
    ])('%s', (_label, spans, duration) => {
      const timeline = shorts.enforceTimeline(
        build(spans as Array<[number, number]>) as never,
        duration as number
      );
      expect(`faults: ${faults(timeline, duration as number).join(', ')}`).toBe(
        'faults: '
      );
    });

    it('holds across every duration and scene count the service can produce', () => {
      const broken: string[] = [];
      let checked = 0;
      // duration() clamps to [15, 90] in steps of five; normalizeScript caps
      // the storyboard at six scenes.
      for (let duration = 15; duration <= 90; duration += 5) {
        for (let count = 1; count <= 6; count += 1) {
          checked += 1;
          const spans = Array.from(
            { length: count },
            (_, index) =>
              [
                Math.floor((index * duration) / count) + index,
                Math.floor(((index + 1) * duration) / count) + index,
              ] as [number, number]
          );
          const problems = faults(
            shorts.enforceTimeline(build(spans) as never, duration),
            duration
          );
          if (problems.length) {
            broken.push(`${duration}s x ${count}: ${problems[0]}`);
          }
        }
      }
      expect(`checked ${checked}, broken: ${broken.slice(0, 3).join(' | ')}`).toBe(
        'checked 96, broken: '
      );
    });

    // Outside that envelope the even split takes over. Nothing reaches this
    // today; it is here so that lowering the duration floor or raising the
    // scene cap cannot quietly produce a broken clip.
    it.each([
      [40, 30],
      [6, 3],
      [10, 5],
      [2, 1],
    ])('stays contiguous with %i scenes in %i seconds', (count, duration) => {
      const spans = Array.from(
        { length: count },
        (_, index) => [index, index + 1] as [number, number]
      );
      const timeline = shorts.enforceTimeline(build(spans) as never, duration);
      expect(`faults: ${faults(timeline, duration).join(', ')}`).toBe('faults: ');
    });
  });
  // Every other field on an activity entry is length-capped; detail was stored
  // exactly as given. /snaps/import hands it whatever is in an operator's
  // backup file and 500 entries are kept per organisation, so a hand-edited or
  // corrupted file could park an arbitrary blob in a store that every list()
  // call reads and the workspace renders. Measured before the bound: 20
  // entries carrying 200KB each wrote 3.9MB into one JSON file.
  describe('an activity detail cannot grow without limit', () => {
    const withLog = async (run: (log: SnapsActivityLogService, dir: string) => Promise<void>) => {
      const dataDir = path.join(
        process.cwd(),
        'tmp',
        `snaps-activity-bound-${process.pid}-${Date.now()}`
      );
      process.env.SNAPS_DATA_DIR = dataDir;
      try {
        await run(new SnapsActivityLogService(), dataDir);
      } finally {
        await fsp.rm(dataDir, { recursive: true, force: true });
      }
    };

    it('keeps an ordinary detail exactly as it was written', async () => {
      await withLog(async (log) => {
        // The largest detail this codebase writes is 381 characters with seven
        // keys; the limits sit far above that, so nothing real is touched.
        const detail = {
          phase: 'ok',
          count: 3,
          platforms: ['instagram', 'threads'],
          nested: { warnings: ['하나', '둘'] },
        };
        await log.record('bound-org', {
          type: 'source',
          title: '정상 기록',
          detail,
        } as never);
        const [entry] = await log.list('bound-org');
        expect(JSON.stringify((entry as { detail?: unknown }).detail)).toBe(
          JSON.stringify(detail)
        );
      });
    });

    it('holds a huge import down to a size the store can carry', async () => {
      await withLog(async (log, dir) => {
        const blob = 'x'.repeat(200 * 1024);
        await log.importEntries(
          'bound-org',
          Array.from({ length: 20 }, (_, index) => ({
            id: `big-${index}`,
            type: 'source',
            title: `대용량 ${index}`,
            createdAt: '2026-05-12T00:00:00.000Z',
            detail: { blob },
          }))
        );
        const file = (await fsp.readdir(dir)).find((name) =>
          name.includes('activity')
        );
        const bytes = file ? (await fsp.stat(path.join(dir, file))).size : 0;
        // 3.9MB before; the whole file has to stay far below one megabyte.
        expect(`under 1MB: ${bytes < 1024 * 1024}`).toBe('under 1MB: true');
      });
    });

    it('stops following a detail that nests forever', async () => {
      await withLog(async (log) => {
        const deep = (depth: number): unknown =>
          depth ? { nested: deep(depth - 1) } : 'leaf';
        await log.importEntries('bound-org', [
          {
            id: 'deep',
            type: 'source',
            title: '깊은 기록',
            createdAt: '2026-05-12T00:00:00.000Z',
            detail: deep(2000),
          },
        ]);
        const [entry] = await log.list('bound-org');
        let depth = 0;
        let node = (entry as { detail?: unknown }).detail as Record<string, unknown> | undefined;
        while (node && typeof node === 'object' && 'nested' in node) {
          depth += 1;
          node = node.nested as Record<string, unknown> | undefined;
        }
        expect(`stored depth: ${depth}`).toBe('stored depth: 6');
      });
    });

    it('cuts a cycle instead of following it', async () => {
      await withLog(async (log) => {
        // A caller can build one of these; JSON.stringify would throw on it.
        const looping: Record<string, unknown> = { name: 'loop' };
        looping.self = looping;
        await log.record('bound-org', {
          type: 'source',
          title: '순환 기록',
          detail: looping,
        } as never);
        const [entry] = await log.list('bound-org');
        expect(JSON.stringify((entry as { detail?: unknown }).detail)).toBe(
          JSON.stringify({ name: 'loop', self: '[순환 참조]' })
        );
      });
    });
  });
  // Three stores keep a free-form object exactly as it arrives - the activity
  // log's detail, a report's payload and an agent task's result - while every
  // field around them is length-capped. /snaps/import fills all three from an
  // operator's backup. Measured before the bound: one report carrying 500 long
  // action items wrote a 100MB file, and the same shape at 5,000 items threw
  // `Invalid string length` out of the import, taking the valid records with
  // it.
  describe('a stored blob cannot take the whole store with it', () => {
    const BIG = 'x'.repeat(200 * 1024);
    const many = (count: number) => Array.from({ length: count }, () => BIG);

    const withStores = async (
      run: (
        library: SnapsSourceLibraryService,
        tasks: SnapsAgentTaskService,
        dir: string
      ) => Promise<void>
    ) => {
      const dataDir = path.join(
        process.cwd(),
        'tmp',
        `snaps-blob-bounds-${process.pid}-${Date.now()}`
      );
      process.env.SNAPS_DATA_DIR = dataDir;
      try {
        await run(
          new SnapsSourceLibraryService(),
          new SnapsAgentTaskService(),
          dataDir
        );
      } finally {
        await fsp.rm(dataDir, { recursive: true, force: true });
      }
    };

    it('keeps a real report payload exactly as it was', async () => {
      await withStores(async (library) => {
        // A real one measures 896 characters at four levels; the bound sits
        // orders of magnitude above that.
        const report = {
          summary: '노출이 늘었습니다.',
          metrics: [{ label: 'impressions', value: 1200, percentageChange: 12 }],
          actionItems: ['질문형 CTA를 넣어보세요.'],
          trends: [{ platform: 'instagram', metricKey: 'impressions', delta: 600 }],
        };
        await library.importReports('blob-org', [
          {
            id: 'real',
            title: '정상 보고서',
            createdAt: '2026-05-12T00:00:00.000Z',
            report,
          },
        ]);
        const [stored] = await library.listReports('blob-org');
        expect(JSON.stringify((stored as { report?: unknown }).report)).toBe(
          JSON.stringify(report)
        );
      });
    });

    it('holds a 100MB report down to something the store can carry', async () => {
      await withStores(async (library, _tasks, dir) => {
        await library.importReports('blob-org', [
          {
            id: 'huge',
            title: '대용량 보고서',
            createdAt: '2026-05-12T00:00:00.000Z',
            report: { summary: BIG, actionItems: many(500), metrics: [] },
          },
        ]);
        const file = (await fsp.readdir(dir)).find((name) =>
          name.includes('reports')
        );
        const bytes = file ? (await fsp.stat(path.join(dir, file))).size : 0;
        expect(`under 1MB: ${bytes < 1024 * 1024}`).toBe('under 1MB: true');
      });
    });

    it('does not throw the whole import away on a record past the string limit', async () => {
      await withStores(async (library, tasks) => {
        // JSON.stringify runs past V8's maximum string length on these.
        const report = await library.importReports('blob-org', [
          {
            id: 'past-limit',
            title: '한계 초과 보고서',
            createdAt: '2026-05-12T00:00:00.000Z',
            report: { summary: BIG, actionItems: many(5000), metrics: [] },
          },
        ]);
        expect(`report imported: ${report.imported}`).toBe('report imported: 1');

        const task = await tasks.importTasks('blob-org', [
          {
            id: 'past-limit',
            title: '한계 초과 작업',
            command: '명령',
            createdAt: '2026-05-12T00:00:00.000Z',
            result: {
              plan: { command: '명령', targetPlatforms: ['instagram'] },
              transform: {
                variants: many(5000).map((content) => ({
                  platform: 'instagram',
                  content,
                })),
              },
              operation: { progress: 100 },
            },
          },
        ]);
        expect(`task imported: ${task.imported}`).toBe('task imported: 1');
      });
    });
  });
  // The product exists to produce platform-specific variants, so two channels
  // receiving byte-identical copy is the one outcome the deterministic
  // fallback must not have. Measured across all ten: nine distinct bodies,
  // with X and KakaoTalk the same - KakaoTalk had no lead-in while every other
  // Korean channel here opens with one, and its own rule asks for a messenger
  // tone that shows the value immediately.
  describe('the deterministic fallback still writes for each channel', () => {
    const allPlatforms = [
      'instagram',
      'threads',
      'x',
      'linkedin',
      'youtube',
      'tiktok',
      'naver-blog',
      'naver-cafe',
      'kakao-talk',
      'xiaohongshu',
    ];

    const fallbackVariants = async () => {
      const previous = process.env.SNAPS_ALLOW_RULE_FALLBACK;
      process.env.SNAPS_ALLOW_RULE_FALLBACK = 'true';
      try {
        const transformer = new SnapsContentTransformService(
          {
            provider: () => 'ollama' as const,
            chatJson: async () => {
              throw new Error('offline');
            },
            embed: async () => [[0.1]],
          } as never,
          { search: async () => [] } as never
        );
        const result = (await transformer.transform('fallback-org', {
          sourceText:
            '환절기에는 일교차가 커지면서 면역력이 떨어지기 쉽습니다. 실내 습도를 오십 퍼센트 이상으로 유지하고 외출 후에는 손을 꼼꼼히 씻어 주세요.',
          targetPlatforms: allPlatforms,
          tone: '한국 나노 인플루언서 스타일',
          useRag: false,
        } as never)) as { provider?: string; variants?: Array<{ platform: string; content: string }> };
        return result;
      } finally {
        if (previous === undefined) {
          delete process.env.SNAPS_ALLOW_RULE_FALLBACK;
        } else {
          process.env.SNAPS_ALLOW_RULE_FALLBACK = previous;
        }
      }
    };

    it('gives every channel its own body', async () => {
      const result = await fallbackVariants();
      expect(`provider: ${result.provider}`).toBe('provider: rule-fallback');
      const variants = result.variants || [];
      expect(`variants: ${variants.length}`).toBe(
        `variants: ${allPlatforms.length}`
      );

      const byBody = new Map<string, string[]>();
      for (const variant of variants) {
        const body = (variant.content || '').trim();
        byBody.set(body, [...(byBody.get(body) || []), variant.platform]);
      }
      const shared = [...byBody.values()]
        .filter((platforms) => platforms.length > 1)
        .map((platforms) => platforms.join('+'));
      expect(`channels sharing a body: ${shared.join(', ')}`).toBe(
        'channels sharing a body: '
      );
    });

    it('opens the KakaoTalk share the way its own rule asks', async () => {
      const result = await fallbackVariants();
      const kakao = (result.variants || []).find(
        (variant) => variant.platform === 'kakao-talk'
      );
      expect(`starts with a greeting: ${!!kakao?.content.startsWith('공유해요')}`).toBe(
        'starts with a greeting: true'
      );
      // Its rule caps the share message at 1000 characters.
      expect(`within 1000: ${(kakao?.content.length || 0) <= 1000}`).toBe(
        'within 1000: true'
      );
    });
  });
  // The caption work converted the payload builder and one helper, and left
  // three published clamps on a raw slice: the transform's per-platform clamp
  // on the model's answer, the same clamp in the deterministic fallback, and
  // the card news per-platform caption. Measured on the last of those, a
  // caption whose emoji straddles X's 280 characters published a body that is
  // not well formed and ends on a lone high surrogate.
  describe('every published clamp cuts on a character boundary', () => {
    const smiley = String.fromCodePoint(0x1f60a);
    const isWellFormed = (text: string) => {
      for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        if (code >= 0xd800 && code <= 0xdbff) {
          const next = text.charCodeAt(index + 1);
          if (!(next >= 0xdc00 && next <= 0xdfff)) {
            return false;
          }
          index += 1;
        } else if (code >= 0xdc00 && code <= 0xdfff) {
          return false;
        }
      }
      return true;
    };

    it('holds for the card news caption across the X limit', () => {
      const broken: number[] = [];
      for (let pad = 270; pad <= 285; pad += 1) {
        const built = buildSnapsCardNewsVariants({
          title: '환절기',
          caption: `${'가'.repeat(pad)}${smiley}뒤에 더 있습니다`,
          hashtags: ['#환절기'],
          slides: [{ filename: 'card-news-01.png', order: 1, path: '/tmp/a.png' }] as never,
          targetPlatforms: ['x'] as never,
        }) as { variants: Array<{ content: string }> };
        for (const variant of built.variants) {
          if (!isWellFormed(variant.content) || variant.content.length > 280) {
            broken.push(pad);
          }
        }
      }
      expect(`broken at: ${broken.join(', ')}`).toBe('broken at: ');
    });

    it('holds for the transform fallback across the same limit', async () => {
      const previous = process.env.SNAPS_ALLOW_RULE_FALLBACK;
      process.env.SNAPS_ALLOW_RULE_FALLBACK = 'true';
      try {
        const transformer = new SnapsContentTransformService(
          {
            provider: () => 'ollama' as const,
            chatJson: async () => {
              throw new Error('offline');
            },
            embed: async () => [[0.1]],
          } as never,
          { search: async () => [] } as never
        );
        const broken: number[] = [];
        for (let pad = 270; pad <= 285; pad += 1) {
          const result = (await transformer.transform('clamp-org', {
            sourceText: `${'가'.repeat(pad)}${smiley}뒤에 더 있습니다`,
            targetPlatforms: ['x'],
            tone: '한국 나노 인플루언서 스타일',
            useRag: false,
          } as never)) as { variants?: Array<{ content: string }> };
          for (const variant of result.variants || []) {
            if (!isWellFormed(variant.content) || variant.content.length > 280) {
              broken.push(pad);
            }
          }
        }
        expect(`broken at: ${broken.join(', ')}`).toBe('broken at: ');
      } finally {
        if (previous === undefined) {
          delete process.env.SNAPS_ALLOW_RULE_FALLBACK;
        } else {
          process.env.SNAPS_ALLOW_RULE_FALLBACK = previous;
        }
      }
    }, 30000);
  });
  // The blob bound named three stores and missed this one: a style example's
  // metrics was kept exactly as given, and its embedding had no length at all.
  // Measured before: a 200KB metrics string and a 2,000,000-value embedding
  // both went in whole, four records taking 28.8MB, and every search then ran
  // a cosine over all of it.
  describe('a style example cannot carry an unbounded payload', () => {
    const base = {
      platform: 'instagram',
      content: '환절기 건강관리 스타일 예시입니다.',
      createdAt: '2026-05-12T00:00:00.000Z',
    };

    const withStore = async (
      run: (store: SnapsVectorStoreService, dir: string) => Promise<void>
    ) => {
      const dataDir = path.join(
        process.cwd(),
        'tmp',
        `snaps-example-bounds-${process.pid}-${Date.now()}`
      );
      process.env.SNAPS_DATA_DIR = dataDir;
      try {
        await run(new SnapsVectorStoreService(), dataDir);
      } finally {
        await fsp.rm(dataDir, { recursive: true, force: true });
      }
    };

    it('keeps a real metrics object and a real embedding untouched', async () => {
      await withStore(async (store) => {
        // The demo workspace's largest is {likes, comments, shares};
        // nomic-embed-text, the model this ships with, returns 768 values.
        const metrics = { likes: 342, comments: 18, shares: 41 };
        const embedding = Array.from({ length: 768 }, (_, index) => index / 768);
        await store.importExamples('bounds-org', [
          { ...base, id: 'real', metrics, embedding },
        ]);
        const [stored] = (await store.listExamples('bounds-org')) as Array<{
          metrics?: unknown;
          embedding?: number[];
        }>;
        expect(JSON.stringify(stored.metrics)).toBe(JSON.stringify(metrics));
        expect(`embedding kept: ${stored.embedding?.length}`).toBe(
          'embedding kept: 768'
        );
      });
    });

    it('holds a huge import down to something the store can carry', async () => {
      await withStore(async (store, dir) => {
        const blob = 'x'.repeat(200 * 1024);
        const deep = (depth: number): unknown =>
          depth ? { nested: deep(depth - 1) } : 'leaf';
        await store.importExamples('bounds-org', [
          { ...base, id: 'blob', metrics: { blob } },
          { ...base, id: 'deep', metrics: deep(2000) },
          {
            ...base,
            id: 'vector',
            embedding: new Array(2000000).fill(0.5),
          },
        ]);
        const listed = (await store.listExamples('bounds-org')) as Array<{
          id: string;
          metrics?: unknown;
          embedding?: number[];
        }>;
        const byId = (id: string) => listed.find((entry) => entry.id === id);

        let depth = 0;
        let node = byId('deep')?.metrics as Record<string, unknown> | undefined;
        while (node && typeof node === 'object' && 'nested' in node) {
          depth += 1;
          node = node.nested as Record<string, unknown> | undefined;
        }
        expect(`nesting kept: ${depth}`).toBe('nesting kept: 6');

        // Dropped rather than truncated: a shortened vector is not the vector
        // the text embeds to, and cosine() refuses unequal lengths anyway.
        expect(`absurd embedding kept: ${byId('vector')?.embedding?.length ?? 0}`).toBe(
          'absurd embedding kept: 0'
        );

        const file = (await fsp.readdir(dir)).find((name) =>
          name.includes('style-examples')
        );
        const bytes = file ? (await fsp.stat(path.join(dir, file))).size : 0;
        expect(`under 1MB: ${bytes < 1024 * 1024}`).toBe('under 1MB: true');
      });
    });
  });
  // The summary took `Math.max(model, real)` for every count, so a model that
  // hallucinated numbers won over facts the service had already computed from
  // the stored items. Measured with four items in the store, a model answering
  // `{ total: 99, bySentiment: { question: 50, praise: 50 } }` produced a
  // summary reading 99 responses with a distribution summing to 102.
  describe('the inbox summary counts what is actually there', () => {
    const items = [
      { id: 'f1', platform: 'instagram', author: 'A', content: '이 제품 어디서 사나요? 가격도 궁금해요.', createdAt: '2026-05-12T00:00:00.000Z' },
      { id: 'f2', platform: 'instagram', author: 'B', content: '배송이 너무 늦어요. 실망입니다.', createdAt: '2026-05-12T00:01:00.000Z' },
      { id: 'f3', platform: 'threads', author: 'C', content: '정말 좋아요! 잘 쓰고 있습니다.', createdAt: '2026-05-12T00:02:00.000Z' },
      { id: 'f4', platform: 'threads', author: 'D', content: '협업 문의드립니다.', createdAt: '2026-05-12T00:03:00.000Z' },
    ];

    const summarise = async (answer: unknown) => {
      const dataDir = path.join(
        process.cwd(),
        'tmp',
        `snaps-inbox-counts-${process.pid}-${Date.now()}`
      );
      process.env.SNAPS_DATA_DIR = dataDir;
      const previous = process.env.SNAPS_ALLOW_RULE_FALLBACK;
      process.env.SNAPS_ALLOW_RULE_FALLBACK = 'true';
      try {
        const inbox = new SnapsFeedbackInboxService({
          provider: () => 'ollama' as const,
          chatJson: async () => answer,
          embed: async () => [[0.1]],
        } as never);
        await inbox.importStoredItems('counts-org', items);
        return (await inbox.summarize('counts-org', {} as never)) as {
          total: number;
          bySentiment: Record<string, number>;
          byPlatform: Record<string, number>;
        };
      } finally {
        if (previous === undefined) {
          delete process.env.SNAPS_ALLOW_RULE_FALLBACK;
        } else {
          process.env.SNAPS_ALLOW_RULE_FALLBACK = previous;
        }
        await fsp.rm(dataDir, { recursive: true, force: true });
      }
    };

    const sum = (counts: Record<string, number>) =>
      Object.values(counts).reduce((running, value) => running + value, 0);

    it('refuses a count the model made up', async () => {
      const summary = await summarise({
        total: 99,
        bySentiment: { question: 50, praise: 50 },
        byPlatform: { instagram: 500, threads: 500 },
      });
      expect(`total: ${summary.total}`).toBe('total: 4');
      expect(`sentiment sum: ${sum(summary.bySentiment)}`).toBe('sentiment sum: 4');
      expect(`platform sum: ${sum(summary.byPlatform)}`).toBe('platform sum: 4');
    });

    // The model reads the text and the rule fallback only matches keywords, so
    // its classification is the one worth having - while it still describes
    // the same four items. Merging with Math.max made this impossible: the
    // model could only add to the rule counts, so a correct redistribution came
    // out as a sum of five and was discarded.
    it('takes a redistribution that still adds up', async () => {
      const summary = await summarise({
        total: 4,
        bySentiment: { question: 2, complaint: 1, praise: 1 },
      });
      expect(`total: ${summary.total}`).toBe('total: 4');
      expect(`question: ${summary.bySentiment.question}`).toBe('question: 2');
      expect(`sentiment sum: ${sum(summary.bySentiment)}`).toBe('sentiment sum: 4');
    });

    it('falls back to its own counting when the model says nothing', async () => {
      const summary = await summarise({});
      expect(`total: ${summary.total}`).toBe('total: 4');
      expect(`sentiment sum: ${sum(summary.bySentiment)}`).toBe('sentiment sum: 4');
    });
  });
  // The planner asks a model to interpret the same command it has already
  // parsed, and took the model's answer for the channels, the card news flag
  // and the publish time. Measured on `엑스에만 내일 오후 3시로 예약해줘.
  // 카드뉴스는 만들지 마.`: a model answering with instagram and linkedin got
  // them planned, one answering includeCardNews got card news, and one
  // answering a 2030 date moved the schedule there. The detector also read the
  // refusal as a request, so card news was produced even when the model said
  // nothing at all.
  describe('what the operator wrote down beats what the model answers', () => {
    const explicit = '엑스에만 내일 오후 3시로 예약해줘. 카드뉴스는 만들지 마.';

    const planFor = async (command: string, answer: unknown) => {
      const previous = process.env.SNAPS_ALLOW_RULE_FALLBACK;
      process.env.SNAPS_ALLOW_RULE_FALLBACK = 'true';
      try {
        const llm = {
          provider: () => 'ollama' as const,
          chatJson: async () => answer,
          embed: async () => [[0.1]],
        } as never;
        const transformer = new SnapsContentTransformService(llm, {
          search: async () => [],
        } as never);
        const planner = new SnapsCommandPlannerService(
          llm,
          transformer,
          new SnapsShortVideoService(llm),
          new SnapsCardNewsService(llm)
        );
        const prepared = (await planner.prepare('planner-org', {
          command,
          useRag: false,
          now: '2026-05-12T00:00:00.000Z',
          timezoneOffsetMinutes: -540,
        } as never)) as {
          plan: {
            targetPlatforms: string[];
            includeCardNews: boolean;
            publishDate?: string;
          };
        };
        return prepared.plan;
      } finally {
        if (previous === undefined) {
          delete process.env.SNAPS_ALLOW_RULE_FALLBACK;
        } else {
          process.env.SNAPS_ALLOW_RULE_FALLBACK = previous;
        }
      }
    };

    it.each([
      ['agreeing', { targetPlatforms: ['x'], includeCardNews: false }],
      ['naming other channels', { targetPlatforms: ['instagram', 'linkedin'] }],
      ['asking for card news', { targetPlatforms: ['x'], includeCardNews: true }],
      ['answering nothing', {}],
      ['moving the time', { publishDate: '2030-01-01T00:00:00.000Z' }],
    ])('keeps the command with a model %s', async (_label, answer) => {
      const plan = await planFor(explicit, answer);
      expect(`platforms: ${plan.targetPlatforms.join(',')}`).toBe(
        'platforms: x'
      );
      expect(`card news: ${plan.includeCardNews}`).toBe('card news: false');
      expect(`publish: ${String(plan.publishDate).slice(0, 16)}`).toBe(
        'publish: 2026-05-13T06:00'
      );
    }, 30000);

    // A refusal outranks the model and a named channel outranks the model, both
    // measured and fixed. A request was not: `카드뉴스 만들어줘` with a model
    // answering `includeCardNews: false` produced no card news, and the
    // operator who typed the words got nothing back and no reason why. The
    // command decides in both directions; the model decides only when the
    // command is silent.
    it.each([
      ['카드뉴스 만들어줘', 'includeCardNews'],
      ['카드뉴스로 정리해줘', 'includeCardNews'],
      ['유튜브 쇼츠로 만들어줘', 'includeShortVideo'],
      ['릴스도 같이 만들어줘', 'includeShortVideo'],
    ])('keeps %s when the model answers no', async (command, field) => {
      const plan = (await planFor(command, {
        includeCardNews: false,
        includeShortVideo: false,
      })) as unknown as Record<string, unknown>;
      expect(`${command} -> ${field}: ${plan[field]}`).toBe(
        `${command} -> ${field}: true`
      );
    }, 30000);

    // Every channel snaps supports, named the way an operator writes it. The
    // list is checked against snapsTargetPlatforms rather than written out
    // twice: a channel added to the product and not to the detector falls
    // through to the default set, which publishes to channels nobody asked
    // for - the defect already measured for 엑스 and for 네이버 카페.
    const namedBy: Record<string, string> = {
      instagram: '인스타그램에만 올려줘',
      threads: '스레드에만 올려줘',
      youtube: '유튜브에만 올려줘',
      tiktok: '틱톡에만 올려줘',
      xiaohongshu: '샤오홍슈에만 올려줘',
      'naver-blog': '네이버 블로그에만 올려줘',
      'naver-cafe': '네이버 카페에만 올려줘',
      'kakao-talk': '카카오톡에만 올려줘',
      linkedin: '링크드인에만 올려줘',
      x: '엑스에만 올려줘',
    };

    // A refusal is read from a fixed window of characters behind the keyword,
    // so a refusal of something *else* written close enough landed inside it.
    // Measured: `인스타에 올리고 쇼츠는 빼줘` read 빼줘 as Instagram's, dropped
    // the one channel the operator named, and fell through to the default set
    // - publishing to four channels nobody asked for. Same shape as the window
    // bugs already fixed elsewhere in this project.
    it.each([
      // [command, channels, card news, short video]
      ['인스타에 올리고 쇼츠는 빼줘', 'instagram', false, false],
      ['쇼츠로 만들고 카드뉴스는 빼줘', '', false, true],
      ['카드뉴스로 만들고 쇼츠는 없이', '', true, false],
      ['인스타에 올려줘. 카드뉴스는 만들지 마.', 'instagram', false, false],
      // The topic standing in between is a channel, not a format: without the
      // channel names in the list there is nothing between 쇼츠 and 빼줘, and
      // the video the operator asked for is refused on Instagram's behalf.
      ['쇼츠로 만들고 인스타는 빼줘', '', false, true],
      // Still refused when the denial really is this keyword's.
      ['인스타 말고 스레드에만 올려줘', 'threads', false, false],
      ['카드뉴스 말고 쇼츠로 만들어줘', '', false, true],
    ])('reads whose refusal it is in %s', (command, channels, cardNews, shortVideo) => {
      const planner = new SnapsCommandPlannerService(
        new OfflineOllama() as never,
        null as never,
        null as never,
        null as never
      );
      const inner = planner as unknown as {
        namedTargetPlatforms: (input: string) => string[];
        detectCardNews: (input: string) => boolean;
        detectShortVideo: (input: string) => boolean;
      };
      expect({
        channels: inner.namedTargetPlatforms.call(planner, command as string).join(','),
        cardNews: inner.detectCardNews.call(planner, command as string),
        shortVideo: inner.detectShortVideo.call(planner, command as string),
      }).toEqual({ channels, cardNews, shortVideo });
    });

    it('reads every supported channel out of the command', () => {
      const planner = new SnapsCommandPlannerService(
        new OfflineOllama() as never,
        null as never,
        null as never,
        null as never
      );
      const detect = (
        planner as unknown as {
          detectTargetPlatforms: (input: string) => string[];
        }
      ).detectTargetPlatforms.bind(planner);

      expect(Object.keys(namedBy).sort()).toEqual([...snapsTargetPlatforms].sort());

      const wrong: string[] = [];
      for (const [platform, command] of Object.entries(namedBy)) {
        const detected = detect(command);
        if (detected.join(',') !== platform) {
          wrong.push(`${platform}: ${detected.join(',') || '(none)'}`);
        }
      }
      expect(wrong).toEqual([]);
    });

    // The model is still the interpreter when the command leaves it open -
    // that is what it is for.
    it('lets the model decide when the command names nothing', async () => {
      const plan = await planFor('이 글을 적당히 올려줘', {
        targetPlatforms: ['linkedin'],
        includeCardNews: true,
      });
      expect(`platforms: ${plan.targetPlatforms.join(',')}`).toBe(
        'platforms: linkedin'
      );
      expect(`card news: ${plan.includeCardNews}`).toBe('card news: true');
    }, 30000);

    it.each([
      ['카드뉴스 만들어줘', true],
      ['카드뉴스로 정리해줘', true],
      ['카드뉴스랑 쇼츠 둘 다 만들어줘', true],
      ['카드뉴스는 만들지 마', false],
      ['카드뉴스 만들지 말고 텍스트만', false],
      ['카드뉴스 빼고 올려줘', false],
      ['카드뉴스 없이 진행해줘', false],
      ['카드뉴스 말고 쇼츠로 만들어줘', false],
      ['카드뉴스는 제외하고 인스타에만', false],
      ['카드뉴스 필요 없어요', false],
    ])('reads %s as a refusal or a request', async (command, wanted) => {
      const planner = new SnapsCommandPlannerService(
        new OfflineOllama() as never,
        null as never,
        null as never,
        null as never
      );
      const asks = (
        planner as unknown as { detectCardNews: (input: string) => boolean }
      ).detectCardNews(command as string);
      expect(`${command}: ${asks}`).toBe(`${command}: ${wanted}`);
    });
  });
  // scheduleType merged with an OR, so the model could only ever escalate a
  // draft into a schedule. Measured: `초안으로만 만들어줘. 올리지는 마.` with a
  // model answering `scheduleType: 'schedule'` produced a scheduled plan with
  // an invented publish time - the difference between a post that goes out and
  // one that does not.
  describe('a refusal to publish outranks the model', () => {
    const planFor = async (command: string, answer: unknown) => {
      const previous = process.env.SNAPS_ALLOW_RULE_FALLBACK;
      process.env.SNAPS_ALLOW_RULE_FALLBACK = 'true';
      try {
        const llm = {
          provider: () => 'ollama' as const,
          chatJson: async () => answer,
          embed: async () => [[0.1]],
        } as never;
        const planner = new SnapsCommandPlannerService(
          llm,
          new SnapsContentTransformService(llm, { search: async () => [] } as never),
          new SnapsShortVideoService(llm),
          new SnapsCardNewsService(llm)
        );
        const prepared = (await planner.prepare('schedule-org', {
          command,
          useRag: false,
          now: '2026-05-12T00:00:00.000Z',
          timezoneOffsetMinutes: -540,
        } as never)) as {
          plan: { scheduleType: string; publishDate?: string };
        };
        return prepared.plan;
      } finally {
        if (previous === undefined) {
          delete process.env.SNAPS_ALLOW_RULE_FALLBACK;
        } else {
          process.env.SNAPS_ALLOW_RULE_FALLBACK = previous;
        }
      }
    };

    it.each([
      ['saying nothing', {}],
      ['saying schedule', { scheduleType: 'schedule' }],
      [
        'saying schedule with a time',
        { scheduleType: 'schedule', publishDate: '2026-06-01T00:00:00.000Z' },
      ],
    ])('stays a draft with a model %s', async (_label, answer) => {
      const plan = await planFor('초안으로만 만들어줘. 올리지는 마.', answer);
      expect(`scheduleType: ${plan.scheduleType}`).toBe('scheduleType: draft');
      // No publish time is invented for something that is not being published.
      expect(`publishDate: ${plan.publishDate ?? 'none'}`).toBe(
        'publishDate: none'
      );
    }, 30000);

    it('still schedules when the command asks for it', async () => {
      const plan = await planFor('내일 오후 3시에 올려줘', {});
      expect(`scheduleType: ${plan.scheduleType}`).toBe('scheduleType: schedule');
      expect(`publishDate: ${String(plan.publishDate).slice(0, 16)}`).toBe(
        'publishDate: 2026-05-13T06:00'
      );
    }, 30000);

    // The model is still the interpreter when the command leaves it open.
    it('lets the model escalate an open command', async () => {
      const plan = await planFor('이 글 정리해줘', { scheduleType: 'schedule' });
      expect(`scheduleType: ${plan.scheduleType}`).toBe('scheduleType: schedule');
    }, 30000);

    it.each([
      ['초안으로만 만들어줘. 올리지는 마.', true],
      ['초안만 만들어줘', true],
      ['올리지 마', true],
      ['게시하지 말고 초안으로', true],
      ['발행하지 마세요', true],
      ['예약하지 말고 저장만', true],
      ['내일 오후 3시에 올려줘', false],
      ['인스타에 게시해줘', false],
      ['내일 예약해줘', false],
      ['이 글 정리해줘', false],
      // The verb stems are spelled out so a bare `지 마` cannot fire on these.
      ['카드뉴스 페이지 마감 정리해서 올려줘', false],
      ['이미지 마스크 설명을 게시해줘', false],
    ])('reads %s correctly', (command, refuses) => {
      const planner = new SnapsCommandPlannerService(
        new OfflineOllama() as never,
        null as never,
        null as never,
        null as never
      );
      const answer = (
        planner as unknown as { refusesToPublish: (input: string) => boolean }
      ).refusesToPublish(command as string);
      expect(`${command}: ${answer}`).toBe(`${command}: ${refuses}`);
    });
  });
  // The last field in the planner the model could overrule: the channel a
  // short video is built for. Measured, `유튜브 쇼츠로 만들어줘` came back
  // planned for tiktok because the model said so, which is a video built to
  // the wrong specification.
  describe('the video channel the command names is the one it gets', () => {
    const planFor = async (command: string, answer: unknown) => {
      const previous = process.env.SNAPS_ALLOW_RULE_FALLBACK;
      process.env.SNAPS_ALLOW_RULE_FALLBACK = 'true';
      try {
        const llm = {
          provider: () => 'ollama' as const,
          chatJson: async () => answer,
          embed: async () => [[0.1]],
        } as never;
        const planner = new SnapsCommandPlannerService(
          llm,
          new SnapsContentTransformService(llm, { search: async () => [] } as never),
          new SnapsShortVideoService(llm),
          new SnapsCardNewsService(llm)
        );
        const prepared = (await planner.prepare('video-org', {
          command,
          useRag: false,
          now: '2026-05-12T00:00:00.000Z',
          timezoneOffsetMinutes: -540,
        } as never)) as {
          plan: {
            shortVideoPlatform: string;
            shortVideoTargetPlatforms: string[];
          };
        };
        return prepared.plan;
      } finally {
        if (previous === undefined) {
          delete process.env.SNAPS_ALLOW_RULE_FALLBACK;
        } else {
          process.env.SNAPS_ALLOW_RULE_FALLBACK = previous;
        }
      }
    };

    it('keeps YouTube when the command says YouTube', async () => {
      const plan = await planFor('유튜브 쇼츠로 만들어줘', {
        shortVideoPlatform: 'tiktok',
        shortVideoTargetPlatforms: ['tiktok'],
      });
      expect(`platform: ${plan.shortVideoPlatform}`).toBe('platform: youtube');
      expect(`targets: ${plan.shortVideoTargetPlatforms.join(',')}`).toBe(
        'targets: youtube'
      );
    }, 30000);

    it('keeps TikTok when the command says TikTok', async () => {
      const plan = await planFor('틱톡에 올릴 숏폼 만들어줘', {
        shortVideoPlatform: 'youtube',
      });
      expect(`platform: ${plan.shortVideoPlatform}`).toBe('platform: tiktok');
    }, 30000);

    // 숏폼 is a format, not a channel, so naming it leaves the choice open and
    // the model makes it - which is the behaviour worth keeping.
    it('lets the model choose when only the format is named', async () => {
      // youtube, not tiktok: 숏폼 must not itself count as naming TikTok, or
      // this passes whether the rule works or not.
      const plan = await planFor('숏폼 만들어줘', {
        shortVideoPlatform: 'youtube',
      });
      expect(`platform: ${plan.shortVideoPlatform}`).toBe('platform: youtube');
    }, 30000);
  });
  // The provider's own test covers OAuth, refresh and a token error. What a
  // proxy or gateway actually returns on a bad day is not JSON at all, and
  // that path had no offline cover: a live smoke needs Naver credentials.
  describe('the Naver Cafe reader survives what a gateway returns', () => {
    const provider = new NaverCafeProvider() as unknown as {
      readNaverJson: <T>(response: unknown, failure: string) => Promise<T>;
    };
    const responseOf = (status: number, body: string, contentType = 'application/json') => ({
      ok: status >= 200 && status < 300,
      status,
      statusText: 'Bad Gateway',
      headers: { get: () => contentType },
      async text() {
        return body;
      },
    });

    it('reads a normal answer as itself', async () => {
      const out = await provider.readNaverJson<Record<string, unknown>>(
        responseOf(200, '{"message":{"status":"200","result":{"articleId":123}}}'),
        'Naver call failed'
      );
      expect(JSON.stringify(out)).toBe(
        '{"message":{"status":"200","result":{"articleId":123}}}'
      );
    });

    it('turns an HTML error page into the status, not the markup', async () => {
      const out = await provider.readNaverJson<{ error?: string }>(
        responseOf(500, '<html><body>Gateway Timeout</body></html>', 'text/html'),
        'Naver call failed'
      );
      expect(`error: ${out.error}`).toBe('error: 500 Bad Gateway');
    });

    it('keeps an empty success empty and an empty failure explained', async () => {
      const ok = await provider.readNaverJson<Record<string, unknown>>(
        responseOf(200, ''),
        'Naver call failed'
      );
      expect(JSON.stringify(ok)).toBe('{}');
      const failed = await provider.readNaverJson<{ error?: string }>(
        responseOf(500, ''),
        'Naver call failed'
      );
      expect(`error: ${failed.error}`).toBe('error: 500 Bad Gateway');
    });

    it('keeps a Naver error message instead of replacing it', async () => {
      const out = await provider.readNaverJson<{
        error?: string;
        error_description?: string;
      }>(
        responseOf(
          401,
          '{"error":"invalid_token","error_description":"토큰이 만료되었습니다"}'
        ),
        'Naver call failed'
      );
      expect(`${out.error}: ${out.error_description}`).toBe(
        'invalid_token: 토큰이 만료되었습니다'
      );
    });

    it('does not carry a whole error page into the message', async () => {
      const out = await provider.readNaverJson<{ error?: string }>(
        responseOf(500, 'x'.repeat(200000), 'text/plain'),
        'Naver call failed'
      );
      // 200KB in, a message an operator can read out.
      expect(`length: ${(out.error || '').length}`).toBe('length: 500');
    });

    it('does not throw on a body that stops mid-JSON', async () => {
      const out = await provider.readNaverJson<{ error?: string }>(
        responseOf(200, '{"message":{"status":'),
        'Naver call failed'
      );
      expect(`starts with the body: ${(out.error || '').startsWith('{"message"')}`).toBe(
        'starts with the body: true'
      );
    });
  });
  // The report prompt tells the model "Do not invent metrics", which is an
  // instruction, not a guarantee. What actually holds is structural: the only
  // thing read back from the answer is the summary sentence, and every number
  // is computed from the rows the caller supplied. Worth pinning, because the
  // same relation in the inbox summary was a Math.max that let a made-up
  // count win.
  describe('a report reports the numbers it was given', () => {
    const metrics = [
      { platform: 'instagram', metricKey: 'impressions', metricValue: 1200, collectedAt: '2026-05-05T00:00:00.000Z' },
      { platform: 'instagram', metricKey: 'impressions', metricValue: 1800, collectedAt: '2026-05-12T00:00:00.000Z' },
      { platform: 'instagram', metricKey: 'likes', metricValue: 64, collectedAt: '2026-05-12T00:00:00.000Z' },
    ];

    const reportWith = async (answer: unknown) => {
      const previous = process.env.SNAPS_ALLOW_RULE_FALLBACK;
      process.env.SNAPS_ALLOW_RULE_FALLBACK = 'true';
      try {
        const generator = new SnapsReportGeneratorService({
          provider: () => 'ollama' as const,
          chatJson: async () => answer,
          embed: async () => [[0.1]],
        } as never);
        return (await generator.generate({
          title: '주간 보고서',
          periodStart: '2026-05-05',
          periodEnd: '2026-05-12',
          metrics,
        } as never)) as {
          trends: Array<{ platform: string; metricKey: string; delta: number; deltaRate: number }>;
          metrics: Record<string, Record<string, number>>;
          summary?: string;
        };
      } finally {
        if (previous === undefined) {
          delete process.env.SNAPS_ALLOW_RULE_FALLBACK;
        } else {
          process.env.SNAPS_ALLOW_RULE_FALLBACK = previous;
        }
      }
    };

    it('ignores trends and metrics the model made up', async () => {
      const report = await reportWith({
        summary: '요약입니다.',
        trends: [
          {
            platform: 'tiktok',
            metricKey: 'views',
            firstValue: 1,
            lastValue: 999999,
            delta: 999998,
            deltaRate: 99,
          },
        ],
        metrics: { tiktok: { views: 500000 } },
      });
      expect(`platforms: ${Object.keys(report.metrics).join(',')}`).toBe(
        'platforms: instagram'
      );
      expect(`trends: ${report.trends.map((t) => `${t.platform}/${t.metricKey}`).join(',')}`).toBe(
        'trends: instagram/impressions'
      );
      expect(`delta: ${report.trends[0].delta} rate: ${report.trends[0].deltaRate}`).toBe(
        'delta: 600 rate: 0.5'
      );
    });

    it('computes the same numbers when the model says nothing', async () => {
      const report = await reportWith({});
      expect(`delta: ${report.trends[0].delta} rate: ${report.trends[0].deltaRate}`).toBe(
        'delta: 600 rate: 0.5'
      );
    });

    it('does not carry a runaway summary into the report', async () => {
      const report = await reportWith({ summary: 'x'.repeat(200000) });
      expect(`summary length: ${(report.summary || '').length}`).toBe(
        'summary length: 2000'
      );
    });
  });
  // The Shorts-Maker route answers 200 for all three outcomes - a script, a
  // service that is not configured, and a failure the service reports itself -
  // so `response.ok` decides nothing. Reading only that would show a success
  // toast for a missing SHORTS_MAKER_URL.
  describe('what the shorts workspace does with a Shorts-Maker answer', () => {
    it('takes the script and the usage line when there is one', () => {
      const outcome = readSnapsShortsMakerScript({
        ok: true,
        script: '  환절기 건강관리 쇼츠 대본입니다.  ',
        usage: { model: 'codex-mini', inputTokens: 1200, outputTokens: 340 },
      });
      expect(outcome.tone).toBe('success');
      expect(outcome.script).toBe('환절기 건강관리 쇼츠 대본입니다.');
      expect(outcome.usage).toBe('codex-mini · 입력 1,200토큰 · 출력 340토큰');
    });

    it('says what to fix when the service is not configured', () => {
      const outcome = readSnapsShortsMakerScript({
        ok: false,
        status: 'not-configured',
        message: 'SHORTS_MAKER_URL is not configured.',
      });
      expect(outcome.tone).toBe('warning');
      expect(outcome.message).toBe('SHORTS_MAKER_URL is not configured.');
      // Nothing is written into the source box on a failure.
      expect(`script: ${outcome.script}`).toBe('script: ');
    });

    it('falls back to a Korean instruction when the service says nothing useful', () => {
      const outcome = readSnapsShortsMakerScript({
        ok: false,
        status: 'not-configured',
      });
      expect(outcome.message).toContain('SHORTS_MAKER_URL');
    });

    it('carries the error and whether it is worth retrying', () => {
      const outcome = readSnapsShortsMakerScript({
        ok: false,
        status: 'error',
        error: 'codex timeout',
        retryable: true,
      });
      expect(outcome.tone).toBe('warning');
      expect(outcome.message).toBe('codex timeout (다시 시도할 수 있습니다)');
    });

    it('does not erase the source box for an empty success', () => {
      const outcome = readSnapsShortsMakerScript({ ok: true, script: '   ' });
      expect(outcome.tone).toBe('warning');
      expect(`script: ${outcome.script}`).toBe('script: ');
      expect(outcome.message).toContain('빈 대본');
    });

    it('does not fall over on an answer it cannot read', () => {
      const outcome = readSnapsShortsMakerScript(undefined);
      expect(outcome.tone).toBe('warning');
      expect(`script: ${outcome.script}`).toBe('script: ');
    });
  });
  // The status poll mapped every status it did not recognise to `running`,
  // which is right for Pixelle's own vocabulary - it answers `processing`
  // among others - and wrong for a state this product returns itself. With
  // PIXELLE_VIDEO_URL unset the status route answers `not-configured`, and
  // that read as progress: 120 polls, ten minutes of a moving progress bar for
  // a job that could never advance, ending with a toast saying the work was
  // still under way.
  describe('a shorts status poll knows when nothing is coming', () => {
    it.each([
      ['completed', false, 'completed'],
      ['failed', false, 'failed'],
      ['queued', false, 'running'],
      ['running', false, 'running'],
      // Pixelle's own words for progress, which must keep the loop going.
      ['processing', false, 'running'],
      ['rendering', false, 'running'],
      [undefined, false, 'running'],
    ])('reads %s as %s', (status, hasUrl, phase) => {
      expect(readSnapsShortsPoll(status, hasUrl as boolean).phase).toBe(phase);
    });

    it('stops on a state this product returns for itself', () => {
      // PIXELLE_VIDEO_URL unset, or a job the service cannot find.
      expect(readSnapsShortsPoll('not-configured', false).phase).toBe('stopped');
      expect(readSnapsShortsPoll('not-found', false).phase).toBe('stopped');
      // The badge has to show something terminal, not a spinner.
      expect(readSnapsShortsPoll('not-configured', false).status).toBe('failed');
    });

    it('treats a video url as done whatever the status says', () => {
      // Pixelle has answered with a file; the label it used does not matter.
      expect(readSnapsShortsPoll('processing', true).phase).toBe('completed');
      expect(readSnapsShortsPoll('not-configured', true).phase).toBe('completed');
    });

    it('keeps queued distinct from running for the badge', () => {
      expect(readSnapsShortsPoll('queued', false).status).toBe('queued');
      expect(readSnapsShortsPoll('processing', false).status).toBe('running');
    });
  });
  // An execution step's status is three-way, and the workspace showed it in
  // three places with two different readings. The operation map had all three;
  // the checkpoint list asked only whether it was `needs-confirmation` and
  // painted everything else green as `준비`. So a `manual` step - an
  // assist-only channel this product cannot publish to, which the operator has
  // to carry out by hand - was presented as ready, the one reading that makes
  // them skip it.
  describe('an execution step is labelled by what it needs', () => {
    it.each([
      ['ready', '준비', 'text-emerald-300'],
      ['needs-confirmation', '확인', 'text-amber-200'],
      ['manual', '수동', 'text-sky-200'],
    ])('shows %s as %s', (status, label, className) => {
      const badge = snapsStepBadge(status);
      expect(`${badge.label} ${badge.className}`).toBe(`${label} ${className}`);
    });

    it('asks rather than reassures for a status it does not know', () => {
      // A plan gaining a fourth status must not read as ready by default.
      for (const unknown of [undefined, null, '', 'blocked', 42]) {
        const badge = snapsStepBadge(unknown);
        expect(`${String(unknown)}: ${badge.label}`).toBe(
          `${String(unknown)}: 확인`
        );
      }
    });
  });
});
