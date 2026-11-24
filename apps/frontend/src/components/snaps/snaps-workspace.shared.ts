// One copy each of the three declarations every snaps workspace needs. They
// were byte-identical in all three files, which is exactly the state the shorts
// types were in until one of them quietly gained fields the others never did.

export type ConnectedIntegration = {
  id: string;
  name?: string;
  identifier?: string;
  providerIdentifier?: string;
  disabled?: boolean;
};

// The datetime-local input takes a naive local timestamp, so the offset has to
// be subtracted before slicing an ISO string - toISOString() is UTC and would
// otherwise show the operator a time hours away from the one they picked.
export const defaultPublishDate = () => {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};

/**
 * Renders an ISO instant in the operator's own time.
 *
 * The activity log used to show `createdAt.slice(0, 16)`, which is the UTC text
 * inside the string: for the Korean operators this product is built for, every
 * entry was stamped nine hours from when it happened. Slicing an ISO date the
 * same way is off by a whole day either side of midnight. The browser knows the
 * operator's offset, so read the parts out of a Date instead of cutting the
 * string.
 */
export const formatLocalDateTime = (iso?: string) => {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
};

/**
 * The value a datetime-local input needs, for an instant, in the operator's own
 * zone.
 *
 * The agent plan carries both an instant (`publishDate`) and a rendering of it
 * (`publishDateLocal`), and the rendering is made in whatever offset the caller
 * supplied - the browser's for the workspace, the Korean default for the chat
 * tool, which has no browser to ask.
 *
 * Restoring a stored task put that rendering straight into the input, and the
 * input is read back in the *browser's* zone. A task planned through chat as
 * `2026-09-13T10:00` (01:00Z) therefore came back as 10:00Z when it was opened
 * in a UTC browser - nine hours later than the plan meant, with nothing to show
 * it had moved. Converting the instant instead needs no assumption at all.
 */
export const toLocalInputValue = (iso?: string): string => {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};

/** The date half of formatLocalDateTime, for period labels. */
export const formatLocalDate = (iso?: string) => formatLocalDateTime(iso).slice(0, 10);

// Guarded for the server render pass, where `window` does not exist. Returning
// false there is the safe answer: it refuses the action rather than performing
// a destructive one unconfirmed.
export const confirmOperatorAction = (message: string) =>
  typeof window !== 'undefined' && window.confirm(message);

/**
 * Turns an /snaps/import response into what the operator is told.
 *
 * Two things were wrong with the line it replaces. It counted two of the six
 * stores, so restoring a backup holding only reports and activity reported
 * `원문 0개, RAG 0개` - a successful import that reads as a failed one. And
 * every store answers an unrecognised payload with an empty list, so picking
 * the wrong file produced that same line under a `완료` heading, with nothing
 * to say the file was not a snaps backup at all.
 *
 * Lives here rather than inline so it can be tested; the workspace only shows
 * what it returns.
 */
export type SnapsImportStoreResult = { imported?: number; dropped?: number };

export type SnapsWorkspaceImportSummary = {
  tone: 'success' | 'warning';
  message: string;
  /**
   * Entries the storage cap kept out, whichever side of it they were on.
   *
   * This used to be read as "existing entries deleted to make room", and the
   * line below said exactly that. Two of the six stores cap the incoming list
   * before the merge, so the number also carries entries that arrived and were
   * never stored - measured, restoring 1,200 style examples into an **empty**
   * workspace answered `dropped: 700` and the operator was told that 700
   * existing entries had been deleted, from a workspace that had none.
   */
  dropped: number;
};

export const summariseSnapsWorkspaceImport = (
  payload: unknown,
  imported: Record<string, SnapsImportStoreResult | undefined> | undefined
): SnapsWorkspaceImportSummary => {
  const stores: Array<[string, SnapsImportStoreResult | undefined]> = [
    ['원문', imported?.sources],
    ['RAG', imported?.styleExamples],
    ['보고서', imported?.reports],
    ['작업', imported?.agentTasks],
    ['반응', imported?.inboxItems],
    ['기록', imported?.activity],
  ];
  const count = (store: SnapsImportStoreResult | undefined, key: 'imported' | 'dropped') =>
    Number(store?.[key]) || 0;
  const total = stores.reduce((sum, [, store]) => sum + count(store, 'imported'), 0);

  if (!total) {
    const looksLikeSnaps =
      !!payload &&
      typeof payload === 'object' &&
      (payload as { product?: unknown }).product === 'snaps';
    return {
      tone: 'warning',
      dropped: 0,
      message: looksLikeSnaps
        ? '가져온 항목이 없습니다. 이 백업은 비어 있습니다.'
        : 'snaps 워크스페이스 백업이 아닌 것 같습니다. 가져온 항목이 없습니다.',
    };
  }

  const dropped = stores.reduce((sum, [, store]) => sum + count(store, 'dropped'), 0);
  return {
    // A restore that could not keep everything is not a plain success,
    // whatever else it brought in.
    tone: dropped ? 'warning' : 'success',
    dropped,
    message:
      `워크스페이스 가져오기 완료: ${stores
        .map(([label, store]) => `${label} ${count(store, 'imported')}개`)
        .join(', ')}` +
      (dropped ? ` — 보관 한도 때문에 항목 ${dropped}개가 보관되지 못했습니다.` : ''),
  };
};

/**
 * What the operator is told after attaching media to channels.
 *
 * Both workspaces read `scheduled.length` and, when it was zero, said
 * `연결된 채널에 게시물이 생성되지 않았습니다` - no posts were created. The
 * snaps layer cannot know that. `PostsService.createPost` builds one entry per
 * channel and returns `[]` the moment one of them comes back empty
 * (posts.service.ts, `if (!posts?.length) return []`), discarding the entries
 * for the channels that had already succeeded. So a run that created two posts
 * and failed on the third answers `scheduled: []`, and the operator is told
 * nothing was created - and retries, which creates the first two again.
 *
 * The response carries `schedulable`, the variants the builder actually built.
 * When that is empty, nothing was ever going to be created and the old
 * sentence is true. When it is not, the only honest thing to say is that the
 * result could not be confirmed, and to check before retrying.
 *
 * `subject` arrives with its particle attached - Korean picks 을/를 by the
 * final consonant of the preceding word, and choosing it here would be one
 * more thing to get wrong.
 */
export type SnapsAttachOutcome = {
  tone: 'success' | 'warning';
  message: string;
  /** Posts the response actually reported, for the caller's own state. */
  created: number;
};

export const describeSnapsAttachResult = (
  result:
    | {
        scheduled?: unknown;
        schedulable?: unknown;
        warnings?: unknown;
      }
    | undefined,
  scheduleType: string,
  subject: string,
  /**
   * How the success reads, when attaching is not the right verb.
   *
   * The two attach paths put a deck or a video onto posts that are being
   * created; the primary scheduling path creates the posts themselves, and
   * "첨부했습니다" is wrong there. Everything else about the three - what
   * counts as success, what an empty result means, which warning to show - is
   * the same, which is why they share this rather than the sentence.
   */
  phrase?: (created: number, scheduleType: string) => string
): SnapsAttachOutcome => {
  const created = Array.isArray(result?.scheduled) ? result.scheduled.length : 0;
  const schedulable = Array.isArray(result?.schedulable)
    ? result.schedulable.length
    : 0;
  const warnings = Array.isArray(result?.warnings)
    ? (result.warnings as unknown[]).filter(
        (warning): warning is string => typeof warning === 'string' && !!warning
      )
    : [];

  if (created > 0) {
    return {
      tone: 'success',
      created,
      message: phrase
        ? phrase(created, scheduleType)
        : scheduleType === 'schedule'
        ? `${subject} 연결된 채널 ${created}개 예약 게시물에 첨부했습니다.`
        : `${subject} 연결된 채널 ${created}개 초안에 첨부했습니다.`,
    };
  }

  if (schedulable > 0) {
    return {
      tone: 'warning',
      created: 0,
      message:
        `연결된 채널 ${schedulable}개에 게시할 준비가 되었는데 결과가 비어 ` +
        '있습니다. 일부가 이미 생성되었을 수 있으니 캘린더를 확인한 뒤 다시 ' +
        '시도하세요.',
    };
  }

  return {
    tone: 'warning',
    created: 0,
    message: warnings[0] || '연결된 채널에 게시물이 생성되지 않았습니다.',
  };
};

/**
 * How an execution step is labelled and coloured.
 *
 * The status is three-way - `ready`, `needs-confirmation`, `manual` - and the
 * workspace showed it in two places with two different readings. The operation
 * map had all three; the checkpoint list asked only whether it was
 * `needs-confirmation` and painted everything else green as `준비`. So a step
 * the operator has to carry out by hand - an assist-only channel this product
 * cannot publish to - was presented as ready, which is the one reading that
 * makes them skip it.
 *
 * One function now, because the two copies had already drifted exactly that
 * way.
 */
export type SnapsExecutionStepStatus = 'ready' | 'needs-confirmation' | 'manual';

export const snapsStepBadge = (
  status: unknown
): { label: string; className: string } => {
  if (status === 'manual') {
    return { label: '수동', className: 'text-sky-200' };
  }
  if (status === 'ready') {
    return { label: '준비', className: 'text-emerald-300' };
  }
  // needs-confirmation, and anything a future plan adds: asking is the safe
  // reading, telling the operator it is ready is not.
  return { label: '확인', className: 'text-amber-200' };
};

/**
 * Which connected channels the reply picker may offer.
 *
 * `capabilities` is three-state and the third state is the one that bit:
 * a list means the server answered, `null` means it has not answered yet or
 * the request failed. The picker read `null` as "capabilities unknown, offer
 * everything", so a dropped request quietly widened the list to channels whose
 * provider has no comment API at all - the operator picked one and the reply
 * failed later, far from the cause.
 *
 * Unknown still means "offer everything", because on a first paint that is the
 * only list there is. What changed is that a failed load is no longer
 * indistinguishable from it: `loadFailed` keeps the last good answer in force
 * instead of falling back to the permissive list.
 */
export interface SnapsReplyCapability {
  id: string;
  commentable: boolean;
  disabled?: boolean;
}

export interface SnapsConnectedChannel {
  id: string;
  disabled?: boolean;
}

export const snapsReplyChannels = <T extends SnapsConnectedChannel>(
  channels: T[],
  capabilities: SnapsReplyCapability[] | null | undefined
): T[] => {
  const connected = (channels || []).filter((channel) => !channel.disabled);
  if (!capabilities) {
    return connected;
  }

  const commentable = new Set(
    capabilities
      .filter((capability) => capability.commentable && !capability.disabled)
      .map((capability) => capability.id)
  );
  return connected.filter((channel) => commentable.has(channel.id));
};

/**
 * Whether the Naver Cafe board fields belong on screen.
 *
 * Two expressions over two pieces of state decided this, and they can
 * disagree. Scheduling blocks when the *transform result* holds a schedulable
 * naver-cafe variant and a cafe integration is connected; the fields were
 * rendered when the *platform checkboxes* still included naver-cafe. Transform
 * with the cafe selected, then untick it - a normal thing to do while lining up
 * the next run - and the result still carries the cafe variant, so scheduling
 * stops with "네이버 카페 발행에는 카페 ID와 메뉴 ID가 필요합니다" while the two
 * fields that would satisfy it are no longer drawn anywhere.
 *
 * One function now, asked by both: the fields are there whenever the operator
 * has picked the channel *or* a pending result would be blocked without them.
 */
export interface SnapsNaverCafeContext {
  selectedPlatforms: string[];
  variants?: Array<{ platform?: string; publishMode?: string }>;
  connectedPlatforms?: string[];
}

export const snapsNaverCafePending = ({
  variants,
  connectedPlatforms,
}: SnapsNaverCafeContext): boolean =>
  (variants || []).some(
    (variant) =>
      variant?.platform === 'naver-cafe' && variant?.publishMode === 'schedule'
  ) && (connectedPlatforms || []).includes('naver-cafe');

export const snapsShowNaverCafeFields = (
  context: SnapsNaverCafeContext
): boolean =>
  context.selectedPlatforms.includes('naver-cafe') ||
  snapsNaverCafePending(context);

/**
 * What is wrong with a chosen publish time, if anything.
 *
 * All three workspaces validated it the same way - reject only what `Date`
 * cannot parse - so a time that had already gone by went through. The post
 * workflow treats a past publishDate as `sleep(0)`: it publishes immediately.
 * A year typed wrong therefore sent the post to every connected channel there
 * and then, while the operator had confirmed a *scheduled* publication.
 *
 * The grace window is the same sixty seconds the publishing builder allows, so
 * the page and the server agree on where "already gone by" starts.
 */
export const SNAPS_PUBLISH_DATE_GRACE_MS = 60 * 1000;

export const snapsPublishDateProblem = (
  value: string,
  now: number = Date.now()
): string => {
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) {
    return '예약 시간을 입력하세요.';
  }
  if (parsed < now - SNAPS_PUBLISH_DATE_GRACE_MS) {
    return '예약 시간이 이미 지났습니다. 지난 시간으로 예약하면 즉시 게시되므로, 앞으로의 시간을 지정하거나 지금 게시를 선택하세요.';
  }
  return '';
};

/**
 * Whether a body that came back 200 is a deck the page can render.
 *
 * The response was taken at its word - `(await response.json()) as
 * SnapsCardNewsDeck` - and put straight into state. The render then guarded
 * only that the deck existed: `{deck ? ... deck.slides.map(...)}`. Four of five
 * shapes that a 200 can carry throw there - `{}`, `slides: null`, `slides` as
 * an object, and an error body that arrived with a 200 - and an exception
 * during render unmounts the tree, so the operator loses the panel rather than
 * seeing what went wrong.
 *
 * The same file already asked `deck?.slides?.length` in four other places; the
 * render was the one that did not. Deciding it once, at the boundary, means
 * state only ever holds something renderable.
 */
export interface SnapsRenderableDeck {
  slides: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export const readSnapsCardNewsDeck = (
  payload: unknown
): SnapsRenderableDeck | undefined => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }
  const slides = (payload as { slides?: unknown }).slides;
  if (!Array.isArray(slides) || !slides.length) {
    return undefined;
  }
  // A slide that is not an object cannot be read for its order or heading.
  if (slides.some((slide) => !slide || typeof slide !== 'object')) {
    return undefined;
  }
  return payload as SnapsRenderableDeck;
};

/**
 * Fills in the lists the agent panel reads without asking.
 *
 * The panel is rendered from `agentResult`, which is set from two places: a
 * fresh `/agent/prepare` answer, which the planner always builds whole, and a
 * stored task opened from the history, which is whatever was written to disk -
 * including anything that arrived through `POST /snaps/agent/tasks/import`.
 *
 * The import normaliser requires `plan`, `transform`, `operation`, and that
 * `plan.targetPlatforms` and `transform.variants` are arrays. Those are the two
 * lists the *import* reads. The panel reads more: `operation.progressSteps`,
 * `operation.nextActions`, `operation.platformReadiness`,
 * `plan.marketingStrategy.lanes` and `plan.marketingStrategy.revenueModels`.
 *
 * Measured end to end: a task whose `operation` carried only `progress` was
 * imported and stored happily, and three of the four expressions the panel
 * builds from it threw. An exception during render unmounts the tree, so
 * opening that task from the history blanks the panel instead of showing what
 * was stored.
 *
 * Filling rather than rejecting, because a partial stored task is still worth
 * looking at - the operator asked to see it.
 */
const asList = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

/**
 * Fills lists that live on the entries of a list.
 *
 * Making `platformReadiness` an array was not enough - the panel reads
 * `item.checks` and `item.blockers` on each entry, and `lane.kpis` on each
 * marketing lane. Measured on the same imported task: with the entries
 * present but those fields absent, all three threw.
 */
const asListOfEntries = (value: unknown, fields: string[]): unknown[] =>
  asList(value).map((entry) => {
    if (!entry || typeof entry !== 'object') {
      return entry;
    }
    const record = entry as Record<string, unknown>;
    const filled: Record<string, unknown> = { ...record };
    for (const field of fields) {
      filled[field] = asList(record[field]);
    }
    return filled;
  });

export const readSnapsAgentResult = <T>(result: T): T => {
  if (!result || typeof result !== 'object') {
    return result;
  }
  const source = result as Record<string, unknown>;
  const plan = (source.plan || {}) as Record<string, unknown>;
  const operation = (source.operation || {}) as Record<string, unknown>;
  const transform = (source.transform || {}) as Record<string, unknown>;
  const marketing = plan.marketingStrategy as
    | Record<string, unknown>
    | undefined;

  return {
    ...source,
    plan: {
      ...plan,
      targetPlatforms: asList(plan.targetPlatforms),
      shortVideoTargetPlatforms: asList(plan.shortVideoTargetPlatforms),
      operatorSummary: asList(plan.operatorSummary),
      missingInputs: asList(plan.missingInputs),
      confirmationChecklist: asList(plan.confirmationChecklist),
      executionPlan: asListOfEntries(plan.executionPlan, [
        'checks',
        'blockers',
      ]),
      // Left undefined when it is absent: the panel already asks whether this
      // section exists before rendering it, and inventing an empty one would
      // draw an empty box.
      ...(marketing
        ? {
            marketingStrategy: {
              ...marketing,
              lanes: asListOfEntries(marketing.lanes, ['kpis']),
              revenueModels: asList(marketing.revenueModels),
            },
          }
        : {}),
    },
    operation: {
      ...operation,
      progressSteps: asList(operation.progressSteps),
      nextActions: asList(operation.nextActions),
      platformReadiness: asListOfEntries(operation.platformReadiness, [
        'checks',
        'blockers',
      ]),
    },
    transform: {
      ...transform,
      variants: asList(transform.variants),
    },
  } as unknown as T;
};

/**
 * Where the agent panel leaves a card news deck for the card news
 * workspace to pick up.
 *
 * The workspace has read this key since it was written, and
 * docs/snaps-card-news.md describes the button that fills it - but no
 * button existed. The receiving half and the documentation both specified
 * the payload; only the sending half was missing, so an operator who asked
 * the agent for card news could see the deck in the plan and had no way to
 * carry it into the workspace, unlike shorts.
 */
export const snapsCardNewsHandoffKey = 'snaps.cardnews.handoff.v1';

/**
 * The one line the health card leads with.
 *
 * Four states were collapsed into two. An unreachable Ollama reports every
 * model as missing - because the probe could not ask - so the card said
 * `채팅 모델 없음` and the model row said `누락`, which sends the operator to
 * reinstall models that are already installed. And the reason was read from
 * `health.error`, a field the route never sends: it lives on `health.ollama`.
 * The comment beside that read said it existed so a failed check would not look
 * like a model that is not ready, which is exactly what kept happening.
 */
export interface SnapsHealthView {
  // The JSON store the six libraries live in. A directory that cannot be
  // written is invisible everywhere else: reads answer with an empty list
  // because the error code is the same one that means "not written yet".
  storage?: {
    dataDir?: string;
    writable?: boolean;
    error?: string;
    // A writable directory says nothing about a damaged file inside it.
    // Those read as an empty library, which looks like data loss rather
    // than a fault, and until now the only trace was a server log line.
    unreadable?: Array<{ label?: string; path?: string; reason?: string }>;
  };
  ollama?: {
    ok?: boolean;
    // Which engine answers chat. The headline named Ollama unconditionally,
    // which is wrong the moment AI_PROVIDER is deepseek.
    provider?: string;
    chatModelAvailable?: boolean;
    embedModelAvailable?: boolean;
    // Structural, so the headline does not have to read the API's prose:
    // no key at all is a different problem from a key that was rejected.
    chatKeyConfigured?: boolean;
    chatStatus?: number;
    error?: string;
    models?: string[];
  };
}

/**
 * What a DeepSeek status means to the operator, when it means something other
 * than the model.
 *
 * A table rather than a chain of ifs: each entry is one status and one fix.
 * Anything not listed falls through to the model and reachability checks,
 * which is the right default - an unknown status is not evidence about the
 * account.
 */
export const SNAPS_DEEPSEEK_STATUS_HEADLINES: Record<number, string> = {
  401: 'DeepSeek 키 거부됨',
  402: 'DeepSeek 잔액 소진',
  429: 'DeepSeek 요청 한도 초과',
};

/**
 * How bad the headline is, for whatever paints it.
 *
 * The card derived its colour separately, from `chatModelAvailable` and
 * `ollama.ok`, so the two could disagree - and they did. Measured: the two
 * conditions this function ranks first, an unwritable store and a damaged
 * store file, both rendered in the same green as '모델 준비됨'. Returning the
 * verdict together is what keeps them from drifting apart again.
 */
export type SnapsHealthTone = 'ok' | 'warn' | 'bad';

export type SnapsHealthVerdict = {
  headline: string;
  tone: SnapsHealthTone;
};

/**
 * What is wrong with the store, if anything.
 *
 * Split out because the shorts workspace needs the same answer and was
 * showing none of it - three green badges over a store that could not be
 * written. Two surfaces spelling the same fault two ways is how the
 * health card's words and colour came apart in the first place.
 */
export const snapsStorageVerdict = (
  storage: SnapsHealthView['storage']
): SnapsHealthVerdict | undefined => {
  if (storage && storage.writable === false) {
    return { headline: '저장 폴더 쓰기 불가', tone: 'bad' };
  }
  // Ranked immediately after it, and for the same reason: a library that
  // reads as empty is the first symptom either way.
  if (storage?.unreadable?.length) {
    return { headline: '저장 파일 읽기 실패', tone: 'bad' };
  }
  return undefined;
};

export const snapsHealthVerdict = (
  health: SnapsHealthView | undefined,
  healthError: string
): SnapsHealthVerdict => {
  if (healthError) {
    // Not knowing is not the same as knowing it is broken.
    return { headline: '상태 확인 실패', tone: 'warn' };
  }
  if (!health) {
    return { headline: '확인중', tone: 'warn' };
  }
  // Nothing else matters if the workspace cannot save: an empty library on
  // screen would be the first symptom, and it reads as data loss.
  const storage = snapsStorageVerdict(health.storage);
  if (storage) {
    return storage;
  }
  const ollama = health.ollama || {};
  const deepseek = ollama.provider === 'deepseek';
  // Measured on the two most likely operator failures - a fresh install with
  // no key, and a rotated key - the headline read 'Ollama 응답 없음'. Wrong
  // engine and wrong cause: it sends the operator to a local server that has
  // nothing to do with the failure, when the fix is DEEPSEEK_API_KEY.
  if (deepseek && ollama.chatKeyConfigured === false) {
    return { headline: 'DeepSeek 키 미설정', tone: 'bad' };
  }
  // Status codes rather than phrases, so rewording upstream cannot break it.
  // Measured: an exhausted balance, a rate limit and a genuinely wrong model
  // all came back as '채팅 모델 없음', which sends the operator to edit
  // DEEPSEEK_CHAT_MODEL in two of the three cases where the model is fine.
  if (deepseek && ollama.chatStatus !== undefined) {
    const byStatus = SNAPS_DEEPSEEK_STATUS_HEADLINES[ollama.chatStatus];
    if (byStatus) {
      return { headline: byStatus, tone: 'bad' };
    }
    // A range rather than three more table rows: every 5xx is the service
    // failing, and none of them can be caused by the configured model.
    if (ollama.chatStatus >= 500) {
      return { headline: 'DeepSeek 응답 없음', tone: 'bad' };
    }
  }
  // Could not ask, as opposed to asked and the model was not there.
  if (ollama.error && !ollama.models?.length) {
    return {
      headline: deepseek ? 'DeepSeek 응답 없음' : 'Ollama 응답 없음',
      tone: 'bad',
    };
  }
  if (ollama.chatModelAvailable === false) {
    return { headline: '채팅 모델 없음', tone: 'bad' };
  }
  if (ollama.embedModelAvailable === false) {
    // Degraded, not broken: chat still answers, RAG does not.
    return { headline: '임베딩 없음 · RAG 제한', tone: 'warn' };
  }
  return ollama.ok
    ? { headline: '모델 준비됨', tone: 'ok' }
    : { headline: '모델 확인 필요', tone: 'warn' };
};

export const snapsHealthHeadline = (
  health: SnapsHealthView | undefined,
  healthError: string
): string => snapsHealthVerdict(health, healthError).headline;

/**
 * The shape the copy formatters below need from a variant.
 *
 * Structural rather than imported: the workspace's own SnapsVariant carries a
 * dozen fields these three do not read, and a copy of it here would be one more
 * thing to keep in step.
 */
export type SnapsCopyableVariant = {
  title?: string;
  content: string;
  hashtags?: string[];
};

/**
 * What the operator pastes into Naver Blog, KakaoTalk or Xiaohongshu.
 *
 * snaps cannot publish to those three, so copying is the product there, and
 * these three functions were the only part of that path with no test at all.
 * They also sit at the end of the chain that keeps the writer's line breaks -
 * the stores, the builders and the publish payload all preserve them now, and
 * this is where they turn into markup.
 */
/**
 * The parts of a variant, in the shape all three formats need them.
 *
 * Only the HTML one used to normalise anything, and only line endings, which
 * left the other two carrying whatever arrived. Measured on the same variant
 * through all three:
 *
 *   CRLF content   plain/markdown kept `첫 줄\r\n\r\n둘째 줄`
 *   two-line title markdown produced `# 환절기 건강관리\n두 번째 줄` - the
 *                  second line is no longer part of the heading, it is body
 *   trailing \n\n  html produced `<p>본문입니다.</p><p></p>` - a blank
 *                  paragraph in the pasted document
 *
 * A heading is one line in every one of these formats, so the title is
 * flattened; the content keeps the writer's line breaks, which is the point of
 * the whole chain feeding it, but not the carriage returns and not a run of
 * blank lines longer than a paragraph break.
 */
const normalizeSnapsCopyable = (variant: SnapsCopyableVariant) => {
  const title = String(variant.title ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const content = String(variant.content ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\n]+$/gm, '')
    .trim();
  const hashtags = (variant.hashtags || [])
    .map((tag) => String(tag ?? '').trim())
    .filter(Boolean);
  return { title, content, hashtags: hashtags.join(' ') };
};

export const formatSnapsVariantPlainText = (
  variant: SnapsCopyableVariant
): string => {
  const { title, content, hashtags } = normalizeSnapsCopyable(variant);
  return [title, content, hashtags].filter(Boolean).join('\n\n');
};

export const formatSnapsVariantMarkdown = (
  variant: SnapsCopyableVariant
): string => {
  const { title, content, hashtags } = normalizeSnapsCopyable(variant);
  return [title ? `# ${title}` : '', content, hashtags]
    .filter(Boolean)
    .join('\n\n');
};

/**
 * The agent brief the operator copies out.
 *
 * This was built inline in the workspace, which is how it escaped every test
 * the other three copy formats got, and it had three faults. Measured on one
 * plan:
 *
 *   "오더: ...\n대상: ...\n모드: 초안\n작업자 브리핑\n요약 첫 줄..."
 *
 * - **Every section break was gone.** The builder put `''` between sections
 *   and then ran `.filter(Boolean)` over the whole array, which removed them:
 *   `모드: 초안` ran straight into `작업자 브리핑` and that into the summary.
 *   The blank lines were written down and then deleted by the next line.
 * - A command with a newline in it broke the `오더:` line, so its second line
 *   read as a field of its own.
 * - Variant bodies carried their CRLF and trailing blank lines through
 *   untouched - the same thing the three copy formats had until
 *   normalizeSnapsCopyable.
 *
 * Sections are joined with a real blank line between them; empty ones are
 * dropped as whole sections rather than as stray lines.
 */
export type SnapsAgentBriefPlan = {
  command?: string;
  targetPlatforms?: string[];
  scheduleType?: string;
  publishDateLocal?: string;
  publishDate?: string;
  includeShortVideo?: boolean;
  shortVideoTargetPlatforms?: string[];
  operatorSummary?: string[];
};

export type SnapsAgentBriefInput = {
  plan?: SnapsAgentBriefPlan;
  operation?: { nextActions?: string[] };
  transform?: {
    variants?: Array<SnapsCopyableVariant & { label?: string }>;
  };
};

export const formatSnapsAgentBrief = (
  result: SnapsAgentBriefInput | undefined,
  platformLabel: (platform: string) => string = (platform) => platform
): string => {
  const plan = result?.plan || {};
  const oneLine = (value: unknown) =>
    String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();

  const header = [
    `오더: ${oneLine(plan.command)}`,
    `대상: ${(plan.targetPlatforms || []).map(platformLabel).join(', ')}`,
    plan.scheduleType === 'schedule'
      ? `예약: ${oneLine(plan.publishDateLocal || plan.publishDate) || '시간 미정'}`
      : '모드: 초안',
    plan.includeShortVideo
      ? `쇼츠: ${(plan.shortVideoTargetPlatforms || [])
          .map(platformLabel)
          .join(', ')}`
      : '',
  ].filter(Boolean);

  const summary = (plan.operatorSummary || [])
    .map((line) => oneLine(line))
    .filter(Boolean);
  const actions = (result?.operation?.nextActions || [])
    .map((action) => oneLine(action))
    .filter(Boolean)
    .map((action) => `- ${action}`);
  const variants = (result?.transform?.variants || []).map((variant) => {
    const { title, content, hashtags } = normalizeSnapsCopyable(variant);
    return [`## ${oneLine(variant.label) || '채널'}`, title, content, hashtags]
      .filter(Boolean)
      .join('\n');
  });

  // Each section is a block; the blank line between them is the join, not an
  // entry that a later filter can remove.
  return [
    header.join('\n'),
    summary.length ? ['작업자 브리핑', ...summary].join('\n') : '',
    actions.length ? ['다음 액션', ...actions].join('\n') : '',
    variants.length ? ['채널별 초안', ...variants].join('\n\n') : '',
  ]
    .filter(Boolean)
    .join('\n\n');
};

/**
 * What the operator is told after a report is generated.
 *
 * Two report routes, two different answers to the same question. `/report/
 * generate` always said which engine wrote the text - the model, or the
 * deterministic fallback whose numbers are right and whose sentences are a
 * template. `/report/from-platform-analytics` said that **only when no channel
 * had been skipped**:
 *
 *     if (skipped.length) { toast(...skipped...) } else { announceResult(...) }
 *
 * So the one case where the report deserves the most doubt - built from two of
 * five channels *and* written by the fallback - was the one case where the
 * operator was not told about the fallback. The warning disappeared exactly
 * when it mattered.
 *
 * Both facts, one message, and a warning tone if either is true.
 */
export type SnapsReportOutcome = {
  tone: 'success' | 'warning';
  message: string;
};

export const summariseSnapsReportOutcome = (
  provider: unknown,
  skipped: unknown,
  copy: { success: string; fallback: string }
): SnapsReportOutcome => {
  const warnings = (Array.isArray(skipped) ? skipped : [])
    .map((warning) => String(warning ?? '').trim())
    .filter(Boolean);
  const fromFallback = provider === 'rule-fallback';

  const parts = [fromFallback ? copy.fallback : copy.success];
  if (warnings.length) {
    // Three, then a count. The whole list in a toast is unreadable, and
    // dropping the rest without saying so is how a report built from two of
    // five channels came to look complete.
    parts.push(
      `일부 채널이 제외된 보고서입니다: ${warnings.slice(0, 3).join(' / ')}` +
        (warnings.length > 3 ? ` 외 ${warnings.length - 3}건` : '')
    );
  }

  return {
    tone: fromFallback || warnings.length ? 'warning' : 'success',
    message: parts.join(' '),
  };
};

/**
 * What the operator is told after saving one record.
 *
 * The stores are capped, and at the cap saving one deletes another. The
 * services say so now - `{ evicted, warning }` beside the saved record - and
 * both workspaces threw that away and showed a fixed success toast. A fix that
 * stops at the service is not a fix: the operator still loses a saved source
 * every time they save and still hears "저장했습니다".
 *
 * `extra` carries the notices a particular save has of its own - the style
 * example one reports when it was stored without an embedding.
 */
export type SnapsSaveOutcome = {
  tone: 'success' | 'warning';
  message: string;
};

export const describeSnapsSaveOutcome = (
  saved: unknown,
  successMessage: string,
  extra: string[] = []
): SnapsSaveOutcome => {
  const record = (saved || {}) as { warning?: unknown };
  const capWarning =
    typeof record.warning === 'string' && record.warning.trim()
      ? record.warning.trim()
      : '';
  const notices = [...extra.filter(Boolean), capWarning].filter(Boolean);
  return {
    tone: notices.length ? 'warning' : 'success',
    message: [successMessage, ...notices].join(' '),
  };
};

const escapeSnapsHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export const formatSnapsVariantHtml = (
  variant: SnapsCopyableVariant
): string => {
  const normalized = normalizeSnapsCopyable(variant);
  const title = normalized.title
    ? `<h1>${escapeSnapsHtml(normalized.title)}</h1>`
    : '';
  // The line endings are already normalised by normalizeSnapsCopyable, which
  // is where a caller-supplied CRLF used to survive `\n{2,}` and leave a stray
  // carriage return inside the markup.
  const body = normalized.content
    ? `<p>${escapeSnapsHtml(normalized.content)
        .replace(/\n{2,}/g, '</p><p>')
        .replace(/\n/g, '<br />')}</p>`
    : '';
  const tags = normalized.hashtags
    ? `<p>${escapeSnapsHtml(normalized.hashtags)}</p>`
    : '';
  return [title, body, tags].filter(Boolean).join('\n');
};
