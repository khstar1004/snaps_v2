// The shorts types and the handoff key lived in both the main workspace and the
// shorts workspace. They had already drifted: the shorts copy of
// SnapsVideoResult gained `message` and `progress` when the polling UI was
// built and the main copy never did. The handoff key is worse - it is the
// contract the two components pass work through, so two copies of the string
// mean a silent break the moment one changes.

import {
  snapsStorageVerdict,
  SnapsHealthView,
} from '@gitroom/frontend/components/snaps/snaps-workspace.shared';

export type SnapsStoryboardScene = {
  scene?: number;
  startSecond?: number;
  endSecond?: number;
  visual?: string;
  narration?: string;
  overlayText?: string;
  pixellePrompt?: string;
};

export type SnapsShortsScript = {
  // Which path produced the script: the service degrades to a deterministic one
  // when the model call fails and answers 200 either way.
  provider?: 'ollama' | 'deepseek' | 'rule-fallback';
  title?: string;
  hook?: string;
  narration?: string;
  caption?: string;
  coreSummary?: string;
  storyboard?: SnapsStoryboardScene[];
  uploadMetadata?: {
    title?: string;
    description?: string;
    hashtags?: string[];
  };
};

export type SnapsVideoResult = SnapsShortsScript & {
  script?: SnapsShortsScript;
  status?: string;
  jobId?: string;
  message?: string;
  progress?: {
    current?: number;
    total?: number;
    percentage?: number;
    message?: string;
  };
};

export const snapsShortsHandoffKey = 'snaps.shorts.handoff.v1';

/**
 * Turns a Shorts-Maker topic-to-script answer into what the operator is told.
 *
 * The route answers 200 for all three outcomes - a script, a service that is
 * not configured, and a failure the service reports itself - so `response.ok`
 * decides nothing. Reading only that would have shown a success toast for a
 * missing SHORTS_MAKER_URL.
 *
 * Lives here rather than inline so it can be tested; the panel only shows what
 * it returns and writes `script` into the source box when there is one.
 */
export type SnapsShortsMakerScriptAnswer = {
  ok?: boolean;
  status?: string;
  script?: string;
  message?: string;
  error?: string;
  retryable?: boolean;
  usage?: { inputTokens?: number; outputTokens?: number; model?: string };
};

export type SnapsShortsMakerScriptOutcome = {
  tone: 'success' | 'warning';
  message: string;
  /** The script to put in the source box, empty when there is nothing to use. */
  script: string;
  /** Model and token counts, empty when the service did not report them. */
  usage: string;
};

export const readSnapsShortsMakerScript = (
  answer: SnapsShortsMakerScriptAnswer | undefined
): SnapsShortsMakerScriptOutcome => {
  const empty = { script: '', usage: '' };

  if (!answer?.ok) {
    return {
      ...empty,
      tone: 'warning',
      message:
        answer?.status === 'not-configured'
          ? answer.message ||
            'Shorts-Maker가 설정되지 않았습니다. SHORTS_MAKER_URL을 확인하세요.'
          : `${answer?.error || 'Shorts-Maker 대본 생성에 실패했습니다.'}${
              answer?.retryable ? ' (다시 시도할 수 있습니다)' : ''
            }`,
    };
  }

  // typeof, not String(): the client hands this body over with an
  // unvalidated cast, so `script` is whatever Shorts-Maker sent. String()
  // turned an object into the literal text `[object Object]` and an array
  // into `a,b`, and that went into the operator's source box over what was
  // already there.
  const script =
    typeof answer.script === 'string' ? answer.script.trim() : '';
  if (!script) {
    // ok: true with nothing in it. Writing that into the source box would
    // erase what is there for no gain.
    return {
      ...empty,
      tone: 'warning',
      message: 'Shorts-Maker가 빈 대본을 반환했습니다.',
    };
  }

  return {
    tone: 'success',
    message: 'Shorts-Maker 대본을 원문에 넣었습니다.',
    script,
    usage: [
      answer.usage?.model,
      typeof answer.usage?.inputTokens === 'number'
        ? `입력 ${answer.usage.inputTokens.toLocaleString()}토큰`
        : '',
      typeof answer.usage?.outputTokens === 'number'
        ? `출력 ${answer.usage.outputTokens.toLocaleString()}토큰`
        : '',
    ]
      .filter(Boolean)
      .join(' · '),
  };
};

/**
 * Decides what a status poll means for the progress UI.
 *
 * The loop mapped every status it did not recognise to `running`, which is
 * right for Pixelle's own vocabulary - it answers `processing` among others -
 * and wrong for a state this product returns itself. `PIXELLE_VIDEO_URL` unset
 * makes the status route answer `{status: 'not-configured'}`, and that was
 * read as progress: 120 polls, ten minutes of a moving progress bar for a job
 * that could never advance, ending with "작업이 계속 진행 중입니다" - which was
 * not true.
 *
 * `stopped` is the new outcome: nothing is coming, say why and stop asking.
 */
export type SnapsShortsPollPhase = 'completed' | 'failed' | 'stopped' | 'running';

export const readSnapsShortsPoll = (
  status: unknown,
  hasVideoUrl: boolean
): { phase: SnapsShortsPollPhase; status: 'queued' | 'running' | 'completed' | 'failed' } => {
  if (status === 'completed' || hasVideoUrl) {
    return { phase: 'completed', status: 'completed' };
  }
  if (status === 'failed') {
    return { phase: 'failed', status: 'failed' };
  }
  // States this product returns for itself, not Pixelle's progress vocabulary.
  if (status === 'not-configured' || status === 'not-found') {
    return { phase: 'stopped', status: 'failed' };
  }
  return {
    phase: 'running',
    status: status === 'queued' ? 'queued' : 'running',
  };
};


/**
 * Whether a Shorts-Maker render job can be submitted, and why not.
 *
 * `/snaps/shorts-maker/render-jobs` rejects an incomplete payload by name -
 * `fullAudio는 필수입니다.` and four more - which is right for the route and
 * useless as the first thing an operator sees, because the request has already
 * been made by then. This asks the same questions before the request, in the
 * same words, so the panel and the route cannot tell the operator two
 * different stories.
 *
 * The words are the route's, not new ones. A test reads them back out of
 * snaps.controller.ts; drift there fails it rather than reaching an operator.
 */
export type SnapsRenderJobInput = {
  fullAudio?: unknown;
  visuals?: unknown;
  frameDurationsSec?: unknown;
  durationMs?: unknown;
};

export type SnapsRenderJobReadiness = {
  ready: boolean;
  /** Every problem, not the first: fixing one at a time is four round trips. */
  problems: string[];
};

export const describeSnapsRenderJobRequest = (
  input: SnapsRenderJobInput | undefined
): SnapsRenderJobReadiness => {
  const request = input || {};
  const problems: string[] = [];

  const fullAudio =
    typeof request.fullAudio === 'string' ? request.fullAudio.trim() : '';
  if (!fullAudio) {
    problems.push('fullAudio는 필수입니다.');
  }

  if (!request.visuals || typeof request.visuals !== 'object') {
    problems.push('visuals는 필수입니다.');
  }

  const frames = request.frameDurationsSec;
  if (!Array.isArray(frames) || !frames.length) {
    problems.push('frameDurationsSec는 필수입니다.');
  } else if (
    frames.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
  ) {
    // Strict about the type as well as the value, like the route: a numeric
    // string is a different contract, and NaN is the worst of them because
    // JSON.stringify turns it into null - the renderer would receive a payload
    // that is not the one the operator built.
    problems.push('frameDurationsSec의 각 항목은 0보다 큰 숫자여야 합니다.');
  }

  const duration = request.durationMs;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
    problems.push('durationMs는 0보다 큰 숫자여야 합니다.');
  }

  return { ready: problems.length === 0, problems };
};

/**
 * What a Shorts-Maker render job poll means for the panel.
 *
 * Shorts-Maker answers `queued | processing | completed | failed`, which is a
 * different vocabulary from Pixelle's - `readSnapsShortsPoll` above maps an
 * unrecognised status to `running`, which is right there and wrong here:
 * Shorts-Maker names its terminal states, so anything else really is still
 * working. `not-configured` and `not-found` come from the snaps routes rather
 * than from Shorts-Maker, and both mean nothing is coming.
 */
export const readSnapsRenderJobPoll = (
  status: unknown,
  hasAssetUrl: boolean
): { phase: SnapsShortsPollPhase; status: string } => {
  if (status === 'completed' || hasAssetUrl) {
    return { phase: 'completed', status: 'completed' };
  }
  if (status === 'failed') {
    return { phase: 'failed', status: 'failed' };
  }
  if (status === 'not-configured' || status === 'not-found') {
    return { phase: 'stopped', status: 'failed' };
  }
  return {
    phase: 'running',
    status: status === 'queued' ? 'queued' : 'processing',
  };
};

/**
 * The status row above the shorts workspace, as data rather than JSX.
 *
 * Measured before this existed, with the badge logic read straight out of the
 * markup:
 *
 *   not loaded yet    GREEN LLM 확인중        AMBER Pixelle 미설정
 *   request failed    AMBER LLM 상태 확인 실패  AMBER Pixelle 미설정
 *   store unwritable  GREEN DeepSeek ...      GREEN Pixelle 준비됨
 *
 * Three faults. The LLM badge painted an unknown state green while its own
 * text said 확인중. Pixelle and Shorts-Maker claimed 미설정 - a fact about
 * configuration - before anything had been asked. And a store that could not
 * be written left all three green, though shorts work is saved there.
 */
/**
 * The health payload the shorts workspace reads, as structure rather than as
 * a copy of the route's type. Only the fields the badges ask about.
 */
export type SnapsShortsHealthView = {
  ollama?: {
    ok?: boolean;
    provider?: string;
    chatModel?: string;
    chatModelAvailable?: boolean;
    error?: string;
  };
  pixelle?: { configured?: boolean; ok?: boolean; message?: string };
  shortsMaker?: {
    configured?: boolean;
    ok?: boolean;
    reachable?: boolean;
    message?: string;
    error?: string;
    url?: string;
  };
  storage?: SnapsHealthView['storage'];
};

export type SnapsShortsBadgeTone = 'ok' | 'warn' | 'bad';

export type SnapsShortsBadge = {
  id: 'llm' | 'pixelle' | 'shorts-maker' | 'storage';
  label: string;
  tone: SnapsShortsBadgeTone;
  title: string;
};

/** Nothing has been asked yet, or the asking failed. Neither is a verdict. */
const unknownBadge = (
  id: SnapsShortsBadge['id'],
  name: string,
  healthError: string
): SnapsShortsBadge => ({
  id,
  label: `${name} ${healthError ? '상태 확인 실패' : '확인중'}`,
  tone: 'warn',
  title: healthError,
});

export const snapsShortsBadges = (
  health: SnapsShortsHealthView | undefined | null,
  healthError: string
): SnapsShortsBadge[] => {
  if (!health) {
    return [
      unknownBadge('llm', 'LLM', healthError),
      unknownBadge('pixelle', 'Pixelle', healthError),
      unknownBadge('shorts-maker', 'Shorts-Maker', healthError),
      unknownBadge('storage', '저장소', healthError),
    ];
  }

  const ollama = health.ollama || {};
  const pixelle = health.pixelle || {};
  const maker = health.shortsMaker || {};
  const storage = snapsStorageVerdict(health.storage);

  return [
    {
      id: 'llm',
      // Keyed on the chat model, not on health.ok: ok also folds in the local
      // embedding model, so a working DeepSeek chat provider with no local
      // Ollama painted this badge red even though script generation was fine.
      label: `${ollama.provider === 'deepseek' ? 'DeepSeek' : 'LLM'} ${
        ollama.chatModel || '확인중'
      }`,
      tone: ollama.chatModelAvailable === false ? 'bad' : 'ok',
      title: ollama.error || '',
    },
    {
      id: 'pixelle',
      label: `Pixelle ${
        pixelle.ok ? '준비됨' : pixelle.configured ? '점검 필요' : '미설정'
      }`,
      tone: pixelle.ok ? 'ok' : pixelle.configured ? 'bad' : 'warn',
      title: pixelle.message || '',
    },
    {
      id: 'shorts-maker',
      label: `Shorts-Maker ${
        maker.ok
          ? '준비됨'
          : !maker.configured
          ? '미설정'
          : maker.reachable
          ? '인증 확인 필요'
          : '연결 실패'
      }`,
      tone: maker.ok ? 'ok' : maker.configured ? 'bad' : 'warn',
      title: maker.message || maker.error || maker.url || '',
    },
    {
      id: 'storage',
      label: storage ? storage.headline : '저장소 정상',
      tone: storage ? storage.tone : 'ok',
      title: storage
        ? health.storage?.error ||
          health.storage?.unreadable
            ?.map((entry) => `${entry.label} ${entry.path}: ${entry.reason}`)
            .join('; ') ||
          ''
        : health.storage?.dataDir || '',
    },
  ];
};
