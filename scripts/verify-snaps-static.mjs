import { existsSync, readFileSync, readdirSync } from 'node:fs';

const checks = [];

/**
 * Every time a boundary helper could not find its boundary.
 *
 * methodBody(), routeBody() and declarationBody() each end with `at + fallback`
 * when the boundary they look for is not there - and a fixed count of
 * characters is a window, which reads whatever comes after the anchor. That is
 * the defect all three exist to remove, so falling back reintroduces it
 * silently: four calls did exactly that for two revisions while the log said
 * they were bounded.
 *
 * A fallback is legitimate for the last member of a class, so this is recorded
 * rather than thrown, and the check at the bottom of the file decides.
 */
const boundaryFallbacks = [];

function read(path) {
  return readFileSync(path, 'utf8');
}

// expectContains/expectNotContains are plain substring matches, which can pass
// while the behaviour they are supposed to protect is already gone. Two guards
// written for this file were silently toothless until they were destructively
// tested:
//   - a Dockerfile COPY guard still matched after the line was commented out
//     (`# COPY ...` contains the needle), so expectCustom + an anchored regex
//     is used there instead;
//   - a controller guard keyed on a constant name still matched after the
//     comparison was deleted, because the constant remained in the error
//     message template - it now asserts the comparison expression itself;
//   - a per-line guard using a `(.*)$` regex never fired at all. This checkout
//     runs core.autocrlf=true, so every file on disk is CRLF; splitting on '\n'
//     leaves a trailing '\r', and in a JS regex '\r' is a line terminator, so
//     '.' will not match it and '$' will not match before it. Split lines with
//     /\r?\n/, and prefer .trim() before matching.
// So when adding a guard here, break the invariant on purpose, confirm this
// script fails, and restore. A guard that never fails protects nothing.
//
// Break it by editing the file the way a careless change would, keeping the
// file's own line endings - rewriting a CRLF file with LF-only lines is not the
// regression you meant to test, and can make a dead guard look alive.
/**
 * Matches a string needle or a RegExp.
 *
 * A string-only needle pushes the author toward pinning a line verbatim,
 * and a verbatim line carries the names of locals that mean nothing. Five
 * guards failed this session on renames and signature changes that left
 * what they guard untouched.
 */
function matches(content, needle) {
  return needle instanceof RegExp
    ? needle.test(content)
    : content.includes(needle);
}

function expectContains(path, needle, label = String(needle)) {
  checks.push(() => {
    const content = read(path);
    if (!matches(content, needle)) {
      throw new Error(`${path} is missing ${label}`);
    }
  });
}

function expectNotContains(path, needle, label = String(needle)) {
  checks.push(() => {
    const content = read(path);
    if (matches(content, needle)) {
      throw new Error(`${path} still contains ${label}`);
    }
  });
}

// For invariants a substring match cannot express - comparing two files, or
// requiring a line to be active rather than commented out.
/**
 * One method's body, cut at the next declaration rather than at a character
 * count.
 *
 * A fixed window is the wrong tool and this file has the receipts: a 900
 * character window over `groupMetrics` ran into `chartSeries`, counted its
 * null-prototype map as a third, and stayed green with one of the two
 * reverted. Measured across every method-anchored window here, four of seven
 * were reading past their method - so four guards could have been satisfied by
 * a neighbour's code instead of the one they name.
 *
 * `fallback` is only for a method that is the last thing in its class.
 */
function methodBody(source, at, fallback = 2000) {
  if (at < 0) {
    return '';
  }
  const boundary = /\n  (?:private|public|protected|async|@|get |set )/.exec(
    source.slice(at + 1)
  );
  if (!boundary) {
    boundaryFallbacks.push('methodBody');
  }
  const end = boundary ? at + 1 + boundary.index : at + fallback;
  return source.slice(at, Math.min(end, source.length));
}

/**
 * The code of a file with every string and template literal blanked out.
 *
 * A needle found inside a message is not an assertion. `weightedLimit` survived
 * a mutation that reverted the smoke to counting characters, because the error
 * message still read `${rule.weightedLimit ? ' units' : ' characters'}` - the
 * guard saw the name and passed while the comparison it guards was gone. Same
 * defect class as a guard satisfied by a comment; strip the prose first.
 *
 * It blanks by delimiter, not by parsing, so a regex literal containing a
 * quote or a backtick is blanked along with the strings - `/^```[a-z]*\n?/`
 * comes back as ``` plus rubbish. That cost one guard already. When the file
 * you are checking matches on backticks or quotes, strip only the comments.
 */
function codeOnly(source) {
  return source
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * A route's decorators and its body, from the decorator a guard anchored on.
 *
 * methodBody() cannot be used here: it stops at the next member, and the very
 * next member after `@Post('/x')` is the method the decorator belongs to, so it
 * would hand back forty characters. Anchoring on a decorator means skipping to
 * the end of the signature first, then stopping at the next member.
 *
 * Measured on `@Post('/report/from-platform-analytics')`: the guard there cut a
 * flat 2,600 characters from a route whose own text is 2,032, so 568 characters
 * of the two routes below it were inside the window. Nothing in them satisfied
 * that guard today, which is the only reason it was right - a `withAnalyticsTimeout(`
 * added to either neighbour would have made it pass on a route that had lost one.
 */
function routeBody(source, at, fallback = 2000) {
  if (at < 0) {
    return '';
  }
  const signature = source.indexOf(') {', at);
  const from = signature > at ? signature + 3 : at + 1;
  const boundary = /\n  (?:private|public|protected|async|@|get |set )/.exec(
    source.slice(from)
  );
  if (!boundary) {
    boundaryFallbacks.push('routeBody');
  }
  const end = boundary ? from + boundary.index : at + fallback;
  return source.slice(at, Math.min(end, source.length));
}

/**
 * One top-level declaration, from the `const`/`export const` a guard anchored on.
 *
 * The module-scope counterpart of methodBody(): a guard that anchors on
 * `export const snapsStepBadge` and cuts a flat 700 characters is reading the
 * next export as soon as that one is shorter than 700. Measured today the four
 * declaration-anchored windows here have between 480 and 540 characters of
 * margin, which is nobody's design - it is how long the neighbouring exports
 * happen to be.
 */
function declarationBody(source, at, fallback = 2000) {
  if (at < 0) {
    return '';
  }
  // Bracket-matched, not "up to the next top-level const". That boundary only
  // exists at column 0, so every anchor inside a component body - `  const
  // loadHealth = async () => {` - found none and quietly took the fixed
  // fallback instead, which is the window this helper exists to remove.
  // Measured after the guards were converted: four of six calls were still
  // reading a fixed 2,000 characters and nothing said so.
  // One depth across all three bracket kinds, and the end is the `;` that
  // terminates the statement - not the first bracket to close. `const x = async
  // () => {` closes its empty parameter list immediately, and stopping there
  // returns the signature and none of the body.
  let depth = 0;
  let opened = false;
  for (let index = at; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{' || char === '(' || char === '[') {
      depth += 1;
      opened = true;
    } else if (char === '}' || char === ')' || char === ']') {
      depth -= 1;
      if (opened && depth === 0) {
        const tail = /^\s*;/.exec(source.slice(index + 1));
        if (tail) {
          return source.slice(at, index + 1 + tail[0].length);
        }
      }
    }
  }
  const boundary = /\n(?:export )?(?:const|function|class|type|interface) /.exec(
    source.slice(at + 1)
  );
  if (!boundary) {
    boundaryFallbacks.push('declarationBody');
  }
  const end = boundary ? at + 1 + boundary.index : at + fallback;
  return source.slice(at, Math.min(end, source.length));
}

/**
 * The code of a file with only its comments removed.
 *
 * The companion to codeOnly(), and the right one whenever the needle lives
 * inside a string or a regex: `normalize('NFC')`, `'pointer-events-none'`,
 * `/^```[a-z]*\n?/`. codeOnly() blanks by delimiter rather than by parsing, so
 * it takes those with the prose and the guard fails on code that is correct.
 * That happened three times before this existed, each time fixed with its own
 * copy of these two replaces - which is the shape this file keeps finding in
 * everybody else's code.
 */
function commentsOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/[^\n]*$/gm, '');
}

/**
 * One entry of an object literal, matched by brace rather than by length.
 *
 * methodBody(), routeBody() and declarationBody() all stop at a boundary that
 * only exists at the top level of a file or a class. Inside an object literal
 * there is none, so they fall through to their fixed-size fallback - and a
 * fallback is a window, which reads the neighbour. Two guards written here did
 * exactly that: `snapsPlatformRules.threads` came back carrying instagram's and
 * youtube's fields, so threads appeared to require a title.
 *
 * `at` is the index of the key; the block returned runs to its matching brace.
 */
function objectEntry(source, at) {
  const open = source.indexOf('{', at);
  if (at < 0 || open < 0) {
    return '';
  }
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(at, index + 1);
      }
    }
  }
  return source.slice(at);
}

/**
 * Whether a file tests two things together, in either order.
 *
 * `!hasBody && !hasMedia` and `!hasMedia && !hasBody` are the same check, and a
 * guard that names one of them fails a rewrite that changed nothing - which
 * teaches whoever hits it to route around the guard. Four needles here were
 * written that way; see the note on name-pinned guards for the same mistake in
 * its other form.
 */
function testsBothWays(source, left, right, operator = '&&') {
  const escape = (part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const op = escape(operator);
  return (
    new RegExp(`${escape(left)}\\s*${op}\\s*${escape(right)}`).test(source) ||
    new RegExp(`${escape(right)}\\s*${op}\\s*${escape(left)}`).test(source)
  );
}

function expectCustom(label, assertion) {
  checks.push(() => {
    assertion(read, label);
  });
}

function expectNotExists(path, label = path) {
  checks.push(() => {
    if (existsSync(path)) {
      throw new Error(`${path} still exists: ${label}`);
    }
  });
}

function expectJson(path) {
  checks.push(() => {
    JSON.parse(read(path));
  });
}

function expectLocaleValuesNotContains(root, pattern, label) {
  checks.push(() => {
    const locales = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    for (const locale of locales) {
      const file = `${root}/${locale}/translation.json`;
      let data;
      if (!existsSync(file)) {
        // Not every locale directory ships a translation file.
        continue;
      }
      try {
        data = JSON.parse(read(file));
      } catch (error) {
        // A file that exists but does not parse used to be skipped silently,
        // so a corrupted locale simply dropped out of this check instead of
        // failing it.
        throw new Error(
          `${file} is not valid JSON, so its values cannot be checked: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      const visit = (value, keyPath) => {
        if (typeof value === 'string') {
          if (pattern.test(value)) {
            throw new Error(`${file} value ${keyPath} still contains ${label}`);
          }
          return;
        }
        if (Array.isArray(value)) {
          value.forEach((item, index) => visit(item, `${keyPath}[${index}]`));
          return;
        }
        if (value && typeof value === 'object') {
          for (const [key, nested] of Object.entries(value)) {
            visit(nested, keyPath ? `${keyPath}.${key}` : key);
          }
        }
      };
      visit(data, '');
    }
  });
}

expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Controller(['/snaps', '/api/snaps'])");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Get('/activity')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Get('/export')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Post('/import')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Post('/health')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'koreanSns');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'ruleFallbackEnabled');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Post('/agent/prepare')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Get('/agent/tasks')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Post('/agent/tasks/:taskId/rating')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Post('/agent/tasks/:taskId/favorite')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'Prepared operator-confirmed agent plan');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'marketingStrategy.framework');
expectContains('libraries/nestjs-libraries/src/snaps/agent/command-planner.service.ts', 'Monetize-Publish-Engage-Create');
expectContains('libraries/nestjs-libraries/src/snaps/agent/command-planner.service.ts', "inspiredBy: 'AiToEarn'");
expectContains('libraries/nestjs-libraries/src/snaps/agent/command-planner.service.ts', 'link-request');
expectContains('libraries/nestjs-libraries/src/snaps/agent/command-planner.service.ts', 'platformReadiness');
expectContains('libraries/nestjs-libraries/src/snaps/agent/agent-task.service.ts', 'SnapsAgentTaskService');
expectContains('libraries/nestjs-libraries/src/snaps/agent/agent-task.service.ts', 'requires_confirmation');
expectContains('libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts', 'conversionSignals');
expectContains('libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts', 'purchase-intent');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Post('/transform')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'normalizeTransformRequest');
expectContains(
  'apps/backend/src/api/routes/snaps.controller.ts',
  "BadRequestException('sourceText는 최소 5자 이상이어야 합니다.')",
  'the controller rejects a too-short sourceText, in Korean like the rest of the product'
);
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'Prepared draft payload from transform');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Post('/schedule-variants')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', '...built.warnings');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Delete('/rag/examples/:exampleId')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Post('/rag/rebuild')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Post('/source-library')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Delete('/source-library/:sourceId')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Post('/source-library/:sourceId/promote-to-rag')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'normalizePromoteToRagRequest');
expectContains(
  'apps/backend/src/api/routes/snaps.controller.ts',
  "BadRequestException('platform은 필수입니다.')",
  'the controller rejects a missing platform, in Korean'
);
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Get('/report/history')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Get('/report/:reportId/export')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "throw new NotFoundException('보고서를 찾을 수 없습니다.')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "'print-html'");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Post('/report/:reportId/promote-to-rag')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Delete('/report/:reportId')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Post('/video/attach-to-draft')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'Attached short-form video to scheduled posts');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Post('/inbox/import-post-comments')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'type SnapsStoredPostComment');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'private asStoredPostComments');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Delete('/inbox/items')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Delete('/inbox/items/:itemId')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Post('/inbox/reply-draft')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'postId는 필수입니다.');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Get('/inbox/reply-capabilities')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "@Post('/inbox/publish-reply')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'integrationId는 필수입니다.');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'platformPostId는 필수입니다.');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'Published feedback reply');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'this.asRecord(request.settings)');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'CreatePostDto');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'SnapsMetricInput');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'private asStringArray');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'private asAnalyticsOrganization');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'normalizeAnalyticsReportRequest');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', '연동 분석을 건너뛰었습니다');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'compactError');
expectNotContains('apps/backend/src/api/routes/snaps.controller.ts', 'as any', 'snaps controller any-casts');
expectNotContains('apps/backend/src/api/routes/snaps.controller.ts', ': any', 'snaps controller any parameters');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'MediaService');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'saveToMediaLibrary');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "BadRequestException('videoUrl은 필수입니다.')");
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'normalizeShortVideoRequest');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', "BadRequestException('sourceText는 필수입니다.')");
expectCustom('the video routes normalize their request', (read) => {
  const controller = 'apps/backend/src/api/routes/snaps.controller.ts';
  const callers =
    read(controller).match(/= this\.normalizeShortVideoRequest\(body\)/g) ||
    [];
  if (callers.length < 2) {
    throw new Error(
      `${controller} normalizes the shorts request on ${callers.length} of ` +
        'its two video routes'
    );
  }
});
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'private asArray');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'private asRecord');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'private cleanScheduleType');
expectContains('apps/backend/src/main.ts', "'/api/snaps'");
expectContains('apps/backend/src/api/api.module.ts', 'SnapsModule');

expectContains('libraries/nestjs-libraries/src/database/prisma/schema.prisma', 'model SnapsStyleExample');
expectContains('libraries/nestjs-libraries/src/database/prisma/schema.prisma', 'model SnapsMetricSnapshot');
expectContains('libraries/nestjs-libraries/src/database/prisma/schema.prisma', 'model SnapsReport');
expectContains('libraries/nestjs-libraries/src/database/prisma/schema.prisma', 'snapsStyleExamples');
expectContains('libraries/nestjs-libraries/src/database/prisma/schema.prisma', 'snapsMetricSnapshots');
expectContains('libraries/nestjs-libraries/src/database/prisma/schema.prisma', 'snapsReports');
expectContains('scripts/snaps-postgres-migration.sql', 'CREATE TABLE IF NOT EXISTS "SnapsStyleExample"');
expectContains('scripts/snaps-postgres-migration.sql', 'CREATE TABLE IF NOT EXISTS "SnapsMetricSnapshot"');
expectContains('scripts/snaps-postgres-migration.sql', 'CREATE TABLE IF NOT EXISTS "SnapsReport"');
expectContains('scripts/snaps-postgres-migration.sql', 'snaps_touch_updated_at');
expectContains('scripts/snaps-postgres-migration.sql', 'SnapsReport_createdAt_idx');

expectContains('libraries/nestjs-libraries/src/snaps/analytics/report-generator.service.ts', 'actionItems');
expectContains('libraries/nestjs-libraries/src/snaps/analytics/report-generator.service.ts', 'trendSummary');
expectContains('libraries/nestjs-libraries/src/snaps/analytics/report-generator.service.ts', 'Array.isArray(request.metrics)');
expectContains('libraries/nestjs-libraries/src/snaps/analytics/report-generator.service.ts', 'normalizeSummary');
expectContains('libraries/nestjs-libraries/src/snaps/analytics/report-generator.service.ts', 'normalizeRequest');
expectContains('libraries/nestjs-libraries/src/snaps/analytics/report-generator.service.ts', 'body && typeof body === \'object\' && !Array.isArray(body)');
expectContains('libraries/nestjs-libraries/src/snaps/analytics/report-generator.service.ts', 'fallbackSummary');
expectContains('libraries/nestjs-libraries/src/snaps/analytics/report-generator.service.ts', 'metric is Partial<SnapsMetricInput>');
expectContains('libraries/nestjs-libraries/src/snaps/analytics/analytics-metric.mapper.ts', 'snapsAnalyticsToMetricInputs');
expectContains('libraries/nestjs-libraries/src/snaps/analytics/analytics-metric.mapper.ts', 'normalizeMetricKey');
expectContains('libraries/nestjs-libraries/src/snaps/analytics/analytics-metric.mapper.ts', 'type SnapsAnalyticsPoint');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'snapsAnalyticsToMetricInputs');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.module.ts', 'SnapsSourceLibraryService');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.module.ts', 'SnapsActivityLogService');
expectContains('libraries/nestjs-libraries/src/snaps/activity/activity-log.service.ts', 'importEntries');
expectContains('libraries/nestjs-libraries/src/snaps/activity/activity-log.service.ts', 'snapsActivityTypes');
expectContains('libraries/nestjs-libraries/src/snaps/activity/activity-log.service.ts', 'type과 title이 필요합니다');
expectContains('libraries/nestjs-libraries/src/snaps/activity/activity-log.service.ts', 'cleanRecord');
expectContains('libraries/nestjs-libraries/src/snaps/activity/activity-log.service.ts', 'cleanText');
expectContains('libraries/nestjs-libraries/src/snaps/ai/ollama.client.ts', '/api/chat');
expectContains('libraries/nestjs-libraries/src/snaps/ai/ollama.client.ts', '/api/embed');
expectContains('libraries/nestjs-libraries/src/snaps/ai/ollama.client.ts', 'OLLAMA_DISABLE_THINKING');
expectContains('libraries/nestjs-libraries/src/snaps/ai/ollama.client.ts', 'think: false');
expectContains('libraries/nestjs-libraries/src/snaps/ai/ollama.client.ts', 'chatModelAvailable');
expectContains('libraries/nestjs-libraries/src/snaps/ai/ollama.client.ts', 'embedModelAvailable');
expectContains('libraries/nestjs-libraries/src/snaps/ai/ollama.client.ts', 'Missing Ollama models');
expectContains('libraries/nestjs-libraries/src/snaps/ai/prompt.builder.ts', 'buildSnapsTransformSystemPrompt');
expectContains('libraries/nestjs-libraries/src/snaps/ai/prompt.builder.ts', 'buildSnapsTransformUserPrompt');
expectContains('libraries/nestjs-libraries/src/snaps/ai/structured-output.schema.ts', 'snapsTransformOutputShape');
expectContains('libraries/nestjs-libraries/src/snaps/ai/structured-output.schema.ts', 'content?: unknown');
expectContains('libraries/nestjs-libraries/src/snaps/transform/content-transform.service.ts', 'buildSnapsTransformUserPrompt');
expectContains('libraries/nestjs-libraries/src/snaps/transform/content-transform.service.ts', 'Array.isArray(payload?.variants)');
expectContains('libraries/nestjs-libraries/src/snaps/transform/content-transform.service.ts', 'cleanTitle');
expectContains('libraries/nestjs-libraries/src/snaps/transform/content-transform.service.ts', 'cleanNotes');
// Hashtag capping moved from a hardcoded slice(0, 20) to a per-platform limit,
// and the cleaning itself has since moved again into the shared
// snaps/transform/hashtags.ts so the publishing builder sanitises identically.
// Check the invariant - a caller-supplied limit is honoured, and a string input
// is accepted - wherever the implementation now lives.
expectContains(
  'libraries/nestjs-libraries/src/snaps/transform/hashtags.ts',
  'slice(0, Math.max(0, limit))'
);
expectContains(
  'libraries/nestjs-libraries/src/snaps/transform/hashtags.ts',
  "typeof hashtags === 'string'"
);
expectContains(
  'libraries/nestjs-libraries/src/snaps/transform/content-transform.service.ts',
  'sanitizeSnapsHashtags(hashtags, limit)'
);
// The operator-facing warnings are Korean; this is the omitted-platform one.
expectContains(
  'libraries/nestjs-libraries/src/snaps/transform/content-transform.service.ts',
  '변형을 제공하지 않아',
  'the transform warns, in Korean, about a platform the model skipped'
);
expectContains('libraries/nestjs-libraries/src/snaps/transform/content-transform.service.ts', 'ruleFallbackVariant(platform, body)');
expectContains('libraries/nestjs-libraries/src/snaps/transform/content-transform.service.ts', 'this.cleanNotes(found?.notes)');
expectContains('libraries/nestjs-libraries/src/snaps/transform/platform-rules.ts', "'naver-blog'");
// --- card news -------------------------------------------------------------
// These guard invariants that were established by measuring real renders; each
// one silently degrades output if it regresses. See docs/snaps-card-news.md.

// librsvg resolves fonts through fontconfig, which registers the bundled OTFs
// as plain "Pretendard". An invented alias falls back to DejaVu Sans: Latin
// text changes typeface and font-weight 700/800 stop differing.
expectContains(
  'libraries/nestjs-libraries/src/snaps/cardnews/card-news-renderer.service.ts',
  "const FONT_FAMILY = 'Pretendard';"
);
// Fonts must stay out of the SVG: @font-face is ignored by librsvg and cost
// ~6.3MB of base64 per slide for byte-identical output.
expectNotContains(
  'libraries/nestjs-libraries/src/snaps/cardnews/card-news-renderer.service.ts',
  'data:font/otf;base64',
  'card news font embedding (ineffective, 6.3MB per slide)'
);
// Line clamps keep text above the footer; the 4th wrapText argument is maxLines,
// not a font weight.
expectContains(
  'libraries/nestjs-libraries/src/snaps/cardnews/card-news-renderer.service.ts',
  'MAX_HEADING_LINES'
);
expectContains(
  'libraries/nestjs-libraries/src/snaps/cardnews/card-news-renderer.service.ts',
  'MAX_BODY_LINES'
);
// Korean renders as tofu without fontconfig fonts, so the renderer probes once
// and warns instead of shipping broken slides silently.
expectContains(
  'libraries/nestjs-libraries/src/snaps/cardnews/card-news-renderer.service.ts',
  'hasUsableKoreanFont'
);
// One caption fans out to eight platforms whose limits differ sharply; x caps
// at 280 characters and 1 hashtag. Keyed on the clamp happening, not on how it
// is spelled: this pinned `caption.slice(0, rule.maxLength)` and so had to be
// edited to let that raw slice become the grapheme-safe one it should always
// have been.
expectContains(
  'libraries/nestjs-libraries/src/snaps/cardnews/card-news-variant.builder.ts',
  'snapsClampText(caption, rule.maxLength)'
);
expectContains(
  'libraries/nestjs-libraries/src/snaps/cardnews/card-news-variant.builder.ts',
  'rule.hashtagLimit ?? DEFAULT_HASHTAG_LIMIT'
);
// Fallback slides must keep source sentences in reading order; round-robin
// chunking produced 1,5 / 2,6 / 3,7 / 4,8.
expectContains(
  'libraries/nestjs-libraries/src/snaps/cardnews/card-news.service.ts',
  /sentences\.slice\([A-Za-z0-9_$]+, [A-Za-z0-9_$]+ \+ [A-Za-z0-9_$]+\)/
);
// The model does not reliably return the requested number of slides. Padding
// the tail from the fallback deck repeated its closing slide, so slideCount is
// an upper bound on the model path too, not a quota.
expectContains(
  'libraries/nestjs-libraries/src/snaps/cardnews/card-news.service.ts',
  'Math.min(usable, request.slideCount)',
  'model deck length is capped, never padded'
);
// Naming only unsupported platforms (video to x, card news to youtube) used to
// either schedule nothing behind a 200 or fan one deck out to all eight
// platforms. Both endpoints must reject the request instead.
expectContains(
  'libraries/nestjs-libraries/src/snaps/cardnews/card-news-variant.builder.ts',
  'return [...new Set(normalized)] as SnapsTargetPlatform[];',
  'card news does not fan out to unrequested platforms'
);
// The attach endpoints return the created posts and the payload builder's
// warnings. The card news and shorts workspaces discarded the response and
// showed an unconditional success toast, so a run that scheduled nothing - an
// assist-only platform, settings a provider rejected - still read as success.
// The branch the two attach workspaces delegate to. It reads both counts -
// what was created and what was ready to be created - because zero created
// with channels ready is not "nothing was created": PostsService.createPost
// throws away the channels that already succeeded when a later one comes back
// empty, and telling the operator nothing happened is what makes them retry
// and post twice.
expectCustom('the shared attach reader keeps both counts', (read) => {
  const shared = 'apps/frontend/src/components/snaps/snaps-workspace.shared.ts';
  const source = read(shared);
  for (const [pattern, what] of [
    [/result\?\.scheduled/, 'a read of the created posts'],
    [/result\?\.schedulable/, 'a read of what the builder was ready to create'],
    [/schedulable > 0|readyCount > 0/, 'a branch for ready-but-empty'],
  ]) {
    if (!pattern.test(source)) {
      throw new Error(
        `${shared} describeSnapsAttachResult is missing ${what}, so an empty ` +
          'result would be reported as nothing created even when channels were ready'
      );
    }
  }
  // and it may not make the claim it cannot support in that branch.
  // Only the branch itself. A fixed-size window ran past the closing brace
  // into the fall-through return, which says exactly the sentence this looks
  // for, and the guard failed on correct code.
  const branchStart = source.search(/schedulable > 0|readyCount > 0/);
  const branchEnd = source.indexOf('\n  }', branchStart);
  const readyBranch = source.slice(
    branchStart,
    branchEnd < 0 ? source.length : branchEnd
  );
  if (/게시물이 생성되지 않았습니다/.test(readyBranch)) {
    throw new Error(
      `${shared} still tells the operator that nothing was created when the ` +
        'builder had channels ready, which is the claim that causes the duplicate'
    );
  }
});

expectCustom('the attach workspaces read the schedule result', () => {
  const workspaces = [
    'apps/frontend/src/components/snaps/snaps-card-news-workspace.tsx',
    'apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx',
    // The main workspace has the same defect on /snaps/schedule-variants, the
    // primary scheduling path.
    'apps/frontend/src/components/snaps/snaps-workspace.tsx',
  ];
  for (const path of workspaces) {
    const source = read(path)
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');

    if (/await response\.json\(\);\s*\n\s*(setStatus|toast\.show)/.test(source)) {
      throw new Error(
        `${path} throws the attach response away and reports success regardless of what was created`
      );
    }
    // Key on the invariant rather than a variable name: the main workspace
    // calls it scheduleResult because `result` already means the transform.
    //
    // Two of the three delegate the reading and the branch to
    // describeSnapsAttachResult in the shared module, because an empty
    // `scheduled` does not mean nothing was created - PostsService.createPost
    // discards the channels that already succeeded when a later one comes back
    // empty. Either shape satisfies this; what may not happen is a workspace
    // that does neither.
    // All three delegate now, and the inline alternative is what kept the
    // defect alive in the third: the two attach paths were converted and the
    // primary scheduling path went on claiming "게시물이 생성되지 않았습니다"
    // for another three findings, because the guard accepted either shape.
    // There is no longer an either.
    const required = [
      [/describeSnapsAttachResult\(/, 'a call to the shared attach reader'],
      [/set\w*Warnings\(/, 'capture of the returned warnings'],
      [
        // Any receiver: pinning the local's name would fail a rename that
        // changes nothing, which is the weakness these guards keep having.
        /\w+\.tone === 'warning'/,
        'a branch on what the shared reader decided',
      ],
    ];
    for (const [pattern, what] of required) {
      if (!pattern.test(source)) {
        throw new Error(
          `${path} no longer checks the attach result (missing ${what}), so an empty ` +
            'schedule run reads as success'
        );
      }
    }
    if (!/\w*Warnings\.slice\(0, 5\)\.map/.test(source)) {
      throw new Error(`${path} computes warnings but never renders them`);
    }
  }
});
// A snaps platform marked publishMode 'schedule' becomes an integration
// identifier the manager has to resolve. Flipping one of the assist platforms
// to 'schedule' without a provider behind it would build variants, match them
// to a connected integration and only fail at publish time.
expectCustom('every schedule-mode snaps platform has a registered provider', () => {
  const rules = read('libraries/nestjs-libraries/src/snaps/transform/platform-rules.ts');
  const manager = read('libraries/nestjs-libraries/src/integrations/integration.manager.ts');

  const table = /export const snapsPlatformRules[\s\S]*?\n\};/.exec(rules);
  if (!table) {
    throw new Error('platform-rules.ts no longer exports snapsPlatformRules');
  }
  const schedulable = [...table[0].matchAll(/^ {2}'?([\w-]+)'?: \{([\s\S]*?)^ {2}\},/gm)]
    .filter(([, , body]) => /publishMode: 'schedule'/.test(body))
    .map(([, platform]) => platform);
  if (!schedulable.length) {
    throw new Error('no snaps platform is marked publishMode schedule; the parser is broken');
  }

  const listBlock = /export const socialIntegrationList[\s\S]*?\n\];/.exec(manager);
  if (!listBlock) {
    throw new Error('integration.manager.ts no longer exports socialIntegrationList');
  }
  const importPaths = new Map(
    [...manager.matchAll(/import \{ (\w+) \} from '([^']+)'/g)].map((m) => [m[1], m[2]])
  );
  const identifiers = new Set();
  for (const [, cls] of listBlock[0].matchAll(/new (\w+)\(\)/g)) {
    const raw = importPaths.get(cls);
    if (!raw) continue;
    const rel = `${raw.replace(
      '@gitroom/nestjs-libraries/',
      'libraries/nestjs-libraries/src/'
    )}.ts`;
    let source;
    try {
      source = read(rel);
    } catch {
      continue;
    }
    const identifier = /identifier\s*=\s*'([^']+)'/.exec(source);
    if (identifier) identifiers.add(identifier[1]);
  }

  const missing = schedulable.filter((platform) => !identifiers.has(platform));
  if (missing.length) {
    throw new Error(
      `snaps schedules to ${missing.join(', ')} but no provider in socialIntegrationList ` +
        'claims that identifier'
    );
  }
});
// CreatePostDto validates settings through a __type discriminator, so a field
// the provider DTO requires and buildDefaultSettings omits reaches the provider
// as undefined. TikTok needed seven such fields and X one.
// Presence of the required fields is guarded below, but not the values. The
// YouTube privacy status was set to 'short' - the video format, not one of the
// @IsIn(['public','private','unlisted']) values the provider forwards as
// privacyStatus - so every snaps YouTube post carried an invalid one.
// DeepSeek's /models lists canonical ids only. Requiring membership reported
// the shipped default deepseek-v4-flash as broken even though it answers
// completions - and the shorts workspace badge reads chatModelAvailable.
expectCustom(
  'an unlisted DeepSeek model is settled by a completion, not assumed broken',
  (read) => {
    const client =
      'libraries/nestjs-libraries/src/snaps/ai/deepseek.client.ts';
    // The branch, not its exact spelling. This was pinned to
    // `listed ? { ok: true } : await this.chatModelProbe()` and broke the
    // moment the listed branch gained a field - while the thing it guards,
    // that an unlisted model is probed rather than assumed broken, had not
    // changed at all.
    if (
      !/listed[\s\S]{0,160}?:\s*await this\.chatModelProbe\(\)/.test(
        read(client)
      )
    ) {
      throw new Error(
        client +
          ' no longer settles an unlisted model with a completion, so the ' +
          'shipped default reads as broken'
      );
    }
  }
);
// The probe used to answer with a bare boolean, so every way it could fail read
// as one thing. Measured against the live endpoint, a wrong model returns `The
// supported API model names are deepseek-flash, deepseek-v4-pro, but you passed
// X` - the fix itself, discarded. Worse, an exhausted balance and a rate limit
// failed the same probe and were also reported as a rejected model, sending the
// operator to edit DEEPSEEK_CHAT_MODEL when nothing was wrong with it.
expectContains(
  'libraries/nestjs-libraries/src/snaps/ai/deepseek.client.ts',
  'reason: `${response.status} ${await this.readResponseSnippet(response)}`',
  'a failed DeepSeek model probe carries why it failed, not just that it did'
);
expectCustom('the DeepSeek model probe stays on the miss path', () => {
  const client = read('libraries/nestjs-libraries/src/snaps/ai/deepseek.client.ts');
  const code = client
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n');
  if (!/const listed = models\.includes\(this\.chatModel\)/.test(code)) {
    throw new Error(
      'deepseek.client.ts no longer checks the model listing first, so every health ' +
        'poll would spend a completion'
    );
  }
  if (!/max_tokens: 1/.test(code)) {
    throw new Error(
      'the DeepSeek model probe no longer uses the smallest possible completion'
    );
  }
});

// A refusal is read from a fixed window of characters behind the keyword, which
// is the window shape this project has been bitten by three times. Here it read
// a refusal of something else: `인스타에 올리고 쇼츠는 빼줘` took 빼줘 as
// Instagram's, dropped the one channel the operator named and published to the
// default four. The denial belongs to whatever topic it follows, so the channel
// names have to be visible from asksFor() - and from one list, since a second
// copy is the one nobody updates.
expectCustom('a refusal is attributed to the topic it follows', () => {
  const planner = codeOnly(
    read('libraries/nestjs-libraries/src/snaps/agent/command-planner.service.ts')
  );
  if (!/other\.index < denial\.index/.test(planner)) {
    throw new Error(
      'command-planner.service.ts takes any denial inside the window again, ' +
        "whichever topic it belongs to"
    );
  }
  if (!/SNAPS_CHANNEL_WORDS\.flatMap/.test(planner)) {
    throw new Error(
      'the topic list no longer includes the channel names, so a refusal behind ' +
        'a channel is read as a refusal of the format'
    );
  }
  // One list: detectTargetPlatforms() must read the same table asksFor() does,
  // not a second copy of the same words.
  if (!/for \(const \[platform, patterns\] of SNAPS_CHANNEL_WORDS\)/.test(planner)) {
    throw new Error(
      'detectTargetPlatforms() stopped reading SNAPS_CHANNEL_WORDS; two copies ' +
        'of the channel names drift and asksFor() reads the stale one'
    );
  }
});

// The planner lets the operator's own words outrank the model, and did so in
// one direction only: `카드뉴스는 만들지 마` was honoured while `카드뉴스
// 만들어줘` lost to a model answering false, so the operator who typed the
// words got nothing and no reason why. Both format flags, both directions.
expectCustom('a command that asks for a format outranks the model too', () => {
  const planner = codeOnly(
    read('libraries/nestjs-libraries/src/snaps/agent/command-planner.service.ts')
  );
  for (const [words, flag] of [
    ['SNAPS_SHORT_VIDEO_WORDS', 'includeShortVideo'],
    ['SNAPS_CARD_NEWS_WORDS', 'includeCardNews'],
  ]) {
    const decision = new RegExp(
      `const ${flag} = [\\s\\S]{0,400}?payload\\.${flag}`
    ).exec(planner);
    if (!decision) {
      throw new Error(`command-planner.service.ts no longer decides ${flag} from the payload`);
    }
    for (const test of ['refuses', 'asksFor']) {
      if (!decision[0].includes(`this.${test}(command, ${words})`)) {
        throw new Error(
          `${flag} is decided without this.${test}(command, ${words}); the ` +
            'command decides in both directions, the model only when it is silent'
        );
      }
    }
  }
});

// normalizeSummary() refuses a hallucinated `total` and holds byPlatform and
// bySentiment to it - its own comment records a model answering 99 over four
// items. The conversion signals were left out of both rules: the count took
// Math.max(model, real) with no ceiling, and the examples read as customer
// quotes while the model could write anything into them. Every field the model
// may touch is bounded by something the service counted or stored.
expectCustom('the model cannot invent a conversion signal or its evidence', () => {
  const inbox = codeOnly(
    read('libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts')
  );
  // A ceiling on the count, whatever the local is called.
  if (!/\w+ = Math\.min\(/.test(inbox)) {
    throw new Error(
      'feedback-inbox.service.ts lets a conversion signal count past the number ' +
        'of responses that were summarized'
    );
  }
  if (!/\w*[Qq]uoteFromItems\(\w+, \w+\)/.test(inbox)) {
    throw new Error(
      'feedback-inbox.service.ts takes the model\u2019s conversion-signal examples ' +
        'without checking they are in the responses; they read as quotes'
    );
  }
  // The check is on the responses, not on the model's own answer - comparing
  // the model's text to itself would pass everything.
  if (!/items\.some\(\(item\) =>/.test(inbox)) {
    throw new Error(
      'feedback-inbox.service.ts no longer looks for the quote in the stored items'
    );
  }
});

// A Pixelle deployment answers in whatever shape it likes, so the service hunts
// the payload for the asset and the job. Three things keep that honest, and
// each was measured wrong before it was added: search by key across the whole
// tree (an exact `download_url` at depth 2 beats a generic `url` at depth 1),
// each media slot refuses the other's file types (both answer to `url`, and
// whichever the payload listed first won - a PNG was published as the video),
// and a bare `id` is only the job's when nothing else claims to be.
expectCustom('the Pixelle response resolver cannot pick the wrong asset', () => {
  const service = codeOnly(
    read('libraries/nestjs-libraries/src/snaps/video/short-video.service.ts')
  );
  for (const [pattern, what] of [
    [
      /findStringByKey\(value, key, accept\)/,
      'searching one key across the whole payload before trying the next',
    ],
    [
      /!SNAPS_PIXELLE_IMAGE\.test\(found\)/,
      'the video slot refusing a still image',
    ],
    [
      /!SNAPS_PIXELLE_VIDEO\.test\(found\)/,
      'the thumbnail slot refusing a video',
    ],
    [/findPixelleJobId\(record\)/, 'the job id coming from its own resolver'],
  ]) {
    if (!pattern.test(service)) {
      throw new Error(
        `short-video.service.ts stopped ${what}; the workspace then shows an ` +
          'asset that is not the one Pixelle produced'
      );
    }
  }

  // The two lists are each other's complement. A type added to one and not the
  // other reopens the slot it was added to guard.
  const video = /const SNAPS_PIXELLE_VIDEO = \/[^\n]+/.exec(service);
  const image = /const SNAPS_PIXELLE_IMAGE = \/[^\n]+/.exec(service);
  if (!video || !image) {
    throw new Error('short-video.service.ts no longer declares both media patterns');
  }
  for (const extension of ['mp4', 'mov', 'webm']) {
    if (!video[0].includes(extension) || image[0].includes(extension)) {
      throw new Error(
        `${extension} must be a video type and only a video type; overlapping ` +
          'lists mean both slots accept the same file'
      );
    }
  }
  for (const extension of ['png', 'webp']) {
    if (!image[0].includes(extension) || video[0].includes(extension)) {
      throw new Error(
        `${extension} must be an image type and only an image type; overlapping ` +
          'lists mean both slots accept the same file'
      );
    }
  }
});

// snaps builds the publish payload itself, so whatever a provider's settings
// DTO requires has to come from snaps - nothing else fills it in, and a missing
// one is not noticed until the platform refuses the post. buildDefaultSettings
// already carries TikTok's eight and Instagram's post_type because each was
// found the hard way; this is the same check, run every time rather than when
// somebody thinks of it. A provider that gains a required setting, or a channel
// that starts publishing automatically, fails here instead of at publish.
expectCustom('every automatic channel is given the settings its provider requires', () => {
  const rules = read(
    'libraries/nestjs-libraries/src/snaps/transform/platform-rules.ts'
  );
  const builder =
    read('libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts') +
    rules;
  const dtoDir = 'libraries/nestjs-libraries/src/dtos/posts/providers-settings';
  const dtos = readdirSync(dtoDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => read(`${dtoDir}/${entry.name}`));

  let checked = 0;
  for (const [, platform] of rules.matchAll(/^  '?([\w-]+)'?: \{$/gm)) {
    const at = rules.indexOf(`${platform.includes('-') ? `'${platform}'` : platform}: {`);
    if (!/publishMode: 'schedule'/.test(objectEntry(rules, at))) {
      continue;
    }
    const providerFile = `libraries/nestjs-libraries/src/integrations/social/${platform}.provider.ts`;
    if (!existsSync(providerFile)) {
      continue;
    }
    const named = /dto\s*=\s*(\w+)/.exec(read(providerFile));
    if (!named) {
      continue;
    }
    const dto = dtos.find((text) => text.includes(`class ${named[1]}`));
    if (!dto) {
      continue;
    }
    checked += 1;
    const klass = dto.slice(dto.indexOf(`class ${named[1]}`));
    const missing = [];
    for (const property of klass.matchAll(/((?:@\w+\([^)]*\)\s*)+)(\w+)(\??):/g)) {
      const [, decorators, field, optional] = property;
      if (optional || decorators.includes('@IsOptional')) {
        continue;
      }
      if (!builder.includes(field)) {
        missing.push(field);
      }
    }
    if (missing.length) {
      throw new Error(
        `${platform} publishes automatically and ${named[1]} requires ` +
          `${missing.join(', ')}, which snaps never sets; the post is scheduled ` +
          'and the platform refuses it'
      );
    }
  }

  if (checked < 3) {
    throw new Error(
      `only ${checked} channel(s) were matched to a settings DTO; the names ` +
        'stopped lining up and this guard checked almost nothing'
    );
  }
});

// A platform that requires a title and publishes automatically has to be given
// one, or the provider refuses the post at publish. Today youtube and
// naver-cafe both derive a title and floor it to a non-empty string; the other
// two platforms that require a title are assist-only, so no payload is built
// for them and there is nothing to fill in. That agreement is the invariant -
// a channel that gains `requiresTitle` and `publishMode: 'schedule'` without a
// branch here would compose, schedule, and fail at the provider.
expectCustom('a channel that needs a title is given one before publishing', () => {
  const rules = read(
    'libraries/nestjs-libraries/src/snaps/transform/platform-rules.ts'
  );
  const builder = read(
    'libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts'
  );

  let needing = 0;
  for (const [, platform] of rules.matchAll(/^  '?([\w-]+)'?: \{$/gm)) {
    const at = rules.indexOf(`${platform.includes('-') ? `'${platform}'` : platform}: {`);
    const body = objectEntry(rules, at);
    if (!/requiresTitle:\s*true/.test(body)) {
      continue;
    }
    if (!/publishMode:\s*'schedule'/.test(body)) {
      // Assist channels are handed to the operator, who writes the title.
      continue;
    }
    needing += 1;
    const branch = builder.indexOf(`__type: '${platform}'`);
    if (branch < 0) {
      throw new Error(
        `${platform} requires a title and is scheduled automatically, and the ` +
          'publishing payload builder has no branch for it'
      );
    }
    // The floor specifically, not any mention of the field. `settings.subject ||
    // variant.title` is where the value comes *from*, and matching that let the
    // fallback be deleted while this guard still passed - the branch then hands
    // the provider whatever the variant happened to carry, including ''.
    // What has to be there is a default string literal: `... ? x : 'snaps ...'`.
    const around = builder.slice(Math.max(0, branch - 900), branch + 300);
    if (!/(?:title|subject)[\s\S]{0,120}?\?[\s\S]{0,60}?:\s*'[^']{2,}'/.test(around)) {
      throw new Error(
        `${platform} is given a title with no fallback; an empty one reaches the ` +
          'provider and the post is refused at publish'
      );
    }
  }

  if (needing < 2) {
    throw new Error(
      `only ${needing} scheduled channel(s) were found to require a title; the ` +
        'rule shape changed and this guard checked almost nothing'
    );
  }
});

// snaps clamps a variant to its own maxLength and tells the operator it fits.
// The provider knows what the platform actually takes - TikTokProvider.maxLength()
// returns 2000 while the rule said 2200, so a caption between the two was
// composed, clamped to a number that said it fit, scheduled, and rejected at
// publish. Compared per platform against the providers rather than written down
// twice, because the number that moves is the platform's.
expectCustom('no platform rule promises more than the provider takes', () => {
  const rules = read(
    'libraries/nestjs-libraries/src/snaps/transform/platform-rules.ts'
  );
  const dir = 'libraries/nestjs-libraries/src/integrations/social';
  const providerLimits = new Map();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.provider.ts')) {
      continue;
    }
    const declared = /maxLength\(\)\s*\{\s*return\s*(\d+)/.exec(read(`${dir}/${entry.name}`));
    if (declared) {
      providerLimits.set(entry.name.replace('.provider.ts', ''), Number(declared[1]));
    }
  }
  if (providerLimits.size < 4) {
    throw new Error(
      `only ${providerLimits.size} providers declared a maxLength(); the pattern ` +
        'is broken and this guard would pass without comparing anything'
    );
  }

  let compared = 0;
  for (const [, platform] of rules.matchAll(/^  '?([\w-]+)'?: \{$/gm)) {
    const at = rules.indexOf(`${platform.includes('-') ? `'${platform}'` : platform}: {`);
    const body = objectEntry(rules, at);
    const max = /maxLength:\s*(\d+)/.exec(body);
    if (!max) {
      continue;
    }
    // What one published post may carry. Threads' 1,500 is a reply chain that
    // publishing-payload.builder.ts splits at postMaxLength, so that is the
    // number the platform sees.
    const perPost = /postMaxLength:\s*(\d+)/.exec(body);
    const promised = Number((perPost || max)[1]);
    const provider = providerLimits.get(platform);
    if (provider === undefined) {
      continue;
    }
    compared += 1;
    if (promised > provider) {
      throw new Error(
        `snaps lets ${platform} carry ${promised} characters and the provider ` +
          `takes ${provider}; the post is composed, scheduled, and rejected at publish`
      );
    }
  }
  if (compared < 4) {
    throw new Error(
      `only ${compared} platform(s) were compared against a provider; the names ` +
        'stopped lining up and this guard checked almost nothing'
    );
  }
});

// A button that posts while its own request is still running creates two of
// whatever it creates - two scheduled posts, two render jobs. The workspaces do
// pass a loading flag, and the shared Button styled it with
// `pointer-events-none`, which stops the mouse and nothing else: a focused
// button still fires on Enter, so every one of them could be submitted again
// from the keyboard. The attribute is what actually closes that path.
expectCustom('a button that is loading cannot be pressed again', () => {
  // commentsOnly: the class string is the needle.
  const button = commentsOnly(
    read('libraries/react-shared-libraries/src/form/button.tsx')
  );
  // The attribute has to depend on `loading`; how the expression is written
  // is not the property. `disabled={loading || props.disabled}` and
  // `disabled={Boolean(props.disabled) || Boolean(loading)}` both mean the same
  // and both failed the spelling this used to require.
  if (!/disabled=\{[^}]*\bloading\b[^}]*\}/.test(button)) {
    throw new Error(
      'button.tsx no longer disables a loading button; pointer-events-none leaves ' +
        'the keyboard path open and the handler runs twice'
    );
  }
  if (!/pointer-events-none/.test(button)) {
    throw new Error('button.tsx no longer blocks pointer events while loading');
  }

  // And the workspaces have to keep handing it the flag, or there is nothing to
  // disable. Counted rather than named: a new button is the likely place for
  // this to be forgotten, and a count that only ever grows says so.
  const dir = 'apps/frontend/src/components/snaps';
  let flagged = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.tsx')) {
      continue;
    }
    flagged += (read(`${dir}/${entry.name}`).match(/loading=\{/g) || []).length;
  }
  if (flagged < 32) {
    throw new Error(
      `only ${flagged} snaps buttons report that they are working; a mutating ` +
        'button without the flag can be pressed while its request is in flight'
    );
  }
});

// `가-힣` is the composed syllable block, and Hangul also has a decomposed form
// that a macOS filesystem hands over - which sanitizeSnapsHashtags documented
// long before anything acted on it. Every reader of that range was blind to it,
// and the failures were not cosmetic: a file named `______________.mp4`, two
// different metric labels normalising to the same key so the report summed
// them, a 17-syllable narration counted as 1, and a paste that would not split
// into sentences. A file that matches on the composed block has to compose its
// input first.
expectCustom('every reader of the composed Hangul block composes its input', () => {
  const roots = [
    'libraries/nestjs-libraries/src/snaps',
    'apps/backend/src/api/routes',
  ];
  const offenders = [];
  let readers = 0;

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) {
        continue;
      }
      // The helper itself only names the range while explaining it.
      if (entry.name === 'compose-hangul.ts') {
        continue;
      }
      const source = read(full);
      // The block has more than one spelling. The card news renderer writes it
      // as `code >= 0xac00 && code <= 0xd7a3` and this guard walked straight
      // past it, while its width table charged a decomposed syllable three
      // times - measured 2.57x on a heading, which wrapped and ellipsised text
      // that fit. A guard that knows one spelling of the thing it guards is a
      // guard with a hole in it.
      const code = codeOnly(source);
      const namesTheBlock =
        /가-힣/.test(code) ||
        /0xac00|0xd7a3|\\u{ac00}|\\u{d7a3}/i.test(code) ||
        /0x1100|0x11ff/i.test(code);
      if (!namesTheBlock) {
        continue;
      }
      readers += 1;
      if (!/snapsComposeHangul\(/.test(source)) {
        offenders.push(full);
      }
    }
  };
  for (const root of roots) {
    walk(root);
  }

  if (readers < 5) {
    throw new Error(
      `only ${readers} file(s) were found matching on the composed block; the ` +
        'pattern is broken and this guard would pass without checking anything'
    );
  }
  if (offenders.length) {
    throw new Error(
      `${offenders.join(', ')} matches on 가-힣 without composing first; ` +
        'decomposed Korean reaches it as something that block cannot see'
    );
  }
});

// sanitizeSnapsHashtags was moved out of the transform service because "only
// the transform path got it". Card news and short video kept a private
// cleanHashtags that had learned none of what the shared one had: it split on
// whitespace and commas alone, so `#환절기#건강관리#면역력` - the run-together
// form a model emits most often - was published as one tag nobody searches,
// `#환절기·건강` and `#환절기/건강` came out welded, decomposed Korean was a
// second spelling of the same word, and `#Health`/`#health` were two tags out
// of a budget as small as one on Threads. No flow cleans its own hashtags.
expectCustom('every flow cleans hashtags through the one helper', () => {
  // The name is allowed - the transform service keeps a one-line wrapper - but
  // the implementation is not. `tag.replace(/^#+/` is what every private copy
  // opened with, and it belongs in exactly one file.
  for (const path of [
    'libraries/nestjs-libraries/src/snaps/cardnews/card-news.service.ts',
    'libraries/nestjs-libraries/src/snaps/video/short-video.service.ts',
    'libraries/nestjs-libraries/src/snaps/transform/content-transform.service.ts',
  ]) {
    const service = codeOnly(read(path));
    if (!/sanitizeSnapsHashtags\(/.test(service)) {
      throw new Error(`${path} no longer cleans hashtags through the shared helper`);
    }
    if (/replace\(\/\^#\+\//.test(service)) {
      throw new Error(
        `${path} strips its own hashtags again; the private copies are the ones ` +
          'that never learned about run-together tags or decomposed Korean'
      );
    }
  }

  // Comments only: two of the three needles below are string arguments, and
  // codeOnly() blanks those along with the prose - `normalize('NFC')` comes
  // back as `normalize('')`. When the literal is the meaning, keep it.
  const helper = commentsOnly(read('libraries/nestjs-libraries/src/snaps/transform/hashtags.ts'));
  // NFC and case folding are checked by the hashtag sanitiser guard further
  // down; duplicating them here would give two guards one property to drift on.
  // The run-together split is this guard's own, because it is what the two
  // private copies were missing.
  for (const [pattern, what] of [
    [/\(\?=#\)/, 'splitting the run-together `#a#b#c` form'],
  ]) {
    if (!pattern.test(helper)) {
      throw new Error(
        `hashtags.ts stopped ${what}; that is published output, and a merged or ` +
          'duplicated tag is worse than a dropped one'
      );
    }
  }
});

// Three copies of "fetch with a deadline" existed: the shared helper, and one
// inside each AI client. The two private copies reported an elapsed deadline as
// "the operation was aborted", read their budget with a raw Number() - so a
// misspelt env became NaN and setTimeout treats NaN as 1ms, aborting every AI
// request at once - and the Ollama one retried localhost against 127.0.0.1 on
// any failure, so a server that accepted the connection and went quiet was
// waited out twice. One helper, and every timeout budget parsed by snapsTimeoutMs.
expectCustom('the AI clients share one deadline, parsed safely', () => {
  for (const path of [
    'libraries/nestjs-libraries/src/snaps/ai/ollama.client.ts',
    'libraries/nestjs-libraries/src/snaps/ai/deepseek.client.ts',
  ]) {
    const client = codeOnly(read(path));
    if (!/snapsFetchWithTimeout\(/.test(client)) {
      throw new Error(`${path} no longer fetches through the shared deadline helper`);
    }
    if (/new AbortController\(\)/.test(client)) {
      throw new Error(
        `${path} builds its own AbortController again; that copy is the one that ` +
          'reports a deadline as an abort'
      );
    }
    for (const raw of client.match(/Number\(process\.env\.\w*TIMEOUT\w*/g) || []) {
      throw new Error(
        `${path} parses a timeout with ${raw}...); a non-numeric value is NaN, ` +
          'and setTimeout treats NaN as 1ms'
      );
    }
  }

  const ollama = codeOnly(
    read('libraries/nestjs-libraries/src/snaps/ai/ollama.client.ts')
  );
  // Whatever the caught value is named.
  if (!/snapsWasTimeout\(\w+\)/.test(ollama)) {
    throw new Error(
      'ollama.client.ts retries the localhost fallback after a deadline again; an ' +
        'unresponsive server then costs two full budgets'
    );
  }

  const helper = codeOnly(
    read('libraries/nestjs-libraries/src/snaps/http/fetch-with-timeout.ts')
  );
  if (!/snapsTimedOut: true/.test(helper)) {
    throw new Error(
      'fetch-with-timeout.ts stopped marking its timeout error, so a caller cannot ' +
        'tell a deadline from a refused connection'
    );
  }
});

// Both chat clients used to carry a byte-identical private extractJson, so a
// fix to either left the other wrong - and the Ollama one is the one that
// matters most, since only DeepSeek is asked for response_format json_object.
// One function, imported, and neither client parses the model's text itself.
expectCustom('both chat clients share one JSON extractor', () => {
  for (const path of [
    'libraries/nestjs-libraries/src/snaps/ai/deepseek.client.ts',
    'libraries/nestjs-libraries/src/snaps/ai/ollama.client.ts',
  ]) {
    const client = codeOnly(read(path));
    if (!/snapsExtractJson\(content\)/.test(client)) {
      throw new Error(`${path} no longer parses model output through the shared extractor`);
    }
    if (/extractJson\(content: string\)/.test(client)) {
      throw new Error(
        `${path} declares its own extractJson again; the twin is how one client ` +
          'keeps a bug the other had fixed'
      );
    }
  }

  // Comments only: this file's regexes are full of backticks and quotes, and
  // codeOnly() would blank them along with the prose.
  const extractor = commentsOnly(read('libraries/nestjs-libraries/src/snaps/ai/extract-json.ts'));
  // The four shapes the previous implementation failed, as code rather than as
  // prose: a bounded language tag, the closing fence found by search rather
  // than anchored at the end, and arrays cut at their own bracket.
  for (const [pattern, what] of [
    [/\[a-zA-Z0-9_-\]\*/, 'a fence tagged with anything but json'],
    [/indexOf\('```'\)/, 'a sentence after the closing fence'],
    [/lastIndexOf\(']'\)/, 'a top-level array'],
  ]) {
    if (!pattern.test(extractor)) {
      throw new Error(
        `extract-json.ts stopped handling ${what}; JSON.parse then throws and the ` +
          "caller answers from the deterministic path as though the model had failed"
      );
    }
  }
});

// The report converts metric values and counts the ones it could not read, and
// puts that count first in the action items because every figure below it was
// computed without them. A producer that converts first hands over a 0 that is
// indistinguishable from a real zero, and the warning goes quiet while the
// report states the figure as fact. Only the report converts.
expectCustom('no metric producer converts a value before the report sees it', () => {
  const mapper = codeOnly(
    read('libraries/nestjs-libraries/src/snaps/analytics/analytics-metric.mapper.ts')
  );
  if (/Number\(/.test(mapper)) {
    throw new Error(
      'analytics-metric.mapper.ts calls Number() on a provider value again; the ' +
        "report's unreadable count cannot see past it"
    );
  }
  if (!/:\s*number\s*\|\s*string/.test(mapper)) {
    throw new Error(
      'analytics-metric.mapper.ts no longer hands over the value as written'
    );
  }

  const report = codeOnly(
    read('libraries/nestjs-libraries/src/snaps/analytics/report-generator.service.ts')
  );
  if (!/metricValue:\s*number\s*\|\s*string/.test(report)) {
    throw new Error(
      'SnapsMetricInput.metricValue narrowed back to number; a producer then has ' +
        'to convert, which is the thing that hid the unreadable values'
    );
  }
  if (!/countUnreadableValues\(/.test(report)) {
    throw new Error('report-generator.service.ts stopped counting unreadable values');
  }
});

// Every workspace handoff goes through localStorage, so nothing typechecks the
// two ends against each other. That already cost one feature: the card news
// workspace read `snapsCardNewsHandoffKey` from the day it was written and
// nothing wrote it, so an operator who asked the agent for a deck watched the
// button do nothing. The reverse is the RAG bug from the same week - a reader
// consuming a field the producer never set, which renders as a wrong label
// rather than as nothing. Both ends, both directions, for every key.
expectCustom('each workspace handoff is written with the fields its reader uses', () => {
  const dir = 'apps/frontend/src/components/snaps';
  const sources = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => ({ path: `${dir}/${entry.name}`, text: read(`${dir}/${entry.name}`) }));

  // The object literal handed to JSON.stringify, by brace depth - a nested
  // `deck: {...}` must not be mistaken for a top-level field.
  const topLevelKeys = (text, from) => {
    const open = text.indexOf('{', from);
    if (open < 0) {
      return [];
    }
    const keys = [];
    let depth = 0;
    let index = open;
    for (; index < text.length; index += 1) {
      const char = text[index];
      if (char === '{' || char === '[' || char === '(') {
        depth += 1;
      } else if (char === '}' || char === ']' || char === ')') {
        depth -= 1;
        if (depth === 0) {
          break;
        }
      } else if (depth === 1) {
        const rest = text.slice(index);
        const field = /^([A-Za-z_$][\w$]*)\s*[:,]/.exec(rest);
        if (field && /[{,\s]/.test(text[index - 1] || '')) {
          keys.push(field[1]);
        }
      }
    }
    return keys;
  };

  const keyNames = new Set();
  for (const source of sources) {
    for (const match of source.text.matchAll(/export const (snaps\w*HandoffKey) =/g)) {
      keyNames.add(match[1]);
    }
  }
  if (keyNames.size < 2) {
    throw new Error(
      `expected the shorts and card news handoff keys, found ${keyNames.size}`
    );
  }

  for (const keyName of keyNames) {
    const written = new Set();
    const read_ = new Set();
    let writers = 0;
    let readers = 0;

    for (const source of sources) {
      const writer = new RegExp(`setItem\\(\\s*${keyName}\\s*,`).exec(source.text);
      if (writer) {
        writers += 1;
        const stringify = source.text.indexOf('JSON.stringify(', writer.index);
        for (const field of topLevelKeys(source.text, stringify)) {
          written.add(field);
        }
      }
      const reader = new RegExp(`getItem\\(\\s*${keyName}\\s*\\)`).exec(source.text);
      if (reader) {
        readers += 1;
        // To the end of the effect that parsed it.
        const body = source.text.slice(reader.index, reader.index + 4000);
        // Whatever the parsed value is called - naming it `handoff` here would
        // make a rename look like a handoff nobody reads, which is the one
        // thing this guard is supposed to shout about.
        const parsed = /const (\w+) = JSON\.parse\(/.exec(body);
        if (!parsed) {
          throw new Error(
            `${keyName} is read without parsing it into a local; this guard ` +
              'cannot tell which fields the reader uses'
          );
        }
        for (const use of body.matchAll(new RegExp(`\\b${parsed[1]}\\.(\\w+)`, 'g'))) {
          read_.add(use[1]);
        }
      }
    }

    if (!writers || !readers) {
      throw new Error(
        `${keyName} has ${writers} writer(s) and ${readers} reader(s); a handoff ` +
          'with only one end is a button that does nothing'
      );
    }
    const missing = [...read_].filter((field) => !written.has(field));
    if (missing.length) {
      throw new Error(
        `${keyName}: the reader uses ${missing.join(', ')} but nothing writes ` +
          `${missing.length > 1 ? 'them' : 'it'}; the workspace opens with that ` +
          'field silently absent'
      );
    }
  }
});

// Which metric produced a RAG hit's score is the store's answer to give. Two
// consumers used to re-derive it from `hit.embedding`, which is half the
// condition - a cosine also needs the query to have embedded, and the vectors
// to be the same length - so every hit came back labelled 'embedding' while it
// was scored by token overlap.
expectCustom('nobody re-derives which metric scored a RAG hit', () => {
  const store = codeOnly(
    read('libraries/nestjs-libraries/src/snaps/rag/vector-store.service.ts')
  );
  if (!/matchedBy:\s*comparable\s*\?/.test(store)) {
    throw new Error(
      'vector-store.service.ts no longer reports matchedBy from the branch it ' +
        'actually took; the label stops tracking the score'
    );
  }
  for (const path of [
    'apps/backend/src/api/routes/snaps.controller.ts',
    'libraries/nestjs-libraries/src/snaps/ai/prompt.builder.ts',
  ]) {
    const consumer = codeOnly(read(path));
    if (!/matchedBy:\s*\w+\.matchedBy/.test(consumer)) {
      throw new Error(`${path} stopped taking matchedBy from the search hit`);
    }
    if (/\w+\.embedding\s*\?\s*\(?'embedding'/.test(consumer)) {
      throw new Error(
        `${path} derives the match basis from a stored embedding again; that is ` +
          'true for hits the query could not be compared against'
      );
    }
  }
});

// The live card news smoke is the only end-to-end check that a real deck
// survives script -> render -> variant build. It must keep asserting the
// per-platform clamps, or it degrades into "the API answered".
expectCustom('the live card news smoke still checks the per-platform clamps', () => {
  // Blank the messages first: `${rule.weightedLimit ? ' units' : ' chars'}`
  // in an error string kept this guard green through a mutation that reverted
  // the comparison itself to counting characters.
  const smoke = codeOnly(read('scripts/verify-snaps-cardnews-deepseek.ts'));
  // The property, not `rule.property`: naming the local means a rename that
  // changes nothing fails the guard, and whoever hits that works around the
  // guard rather than keeping the assertion. `weightedLimit` is in the list
  // because X counts units and the smoke has to compare against those - a
  // revert to comparing characters would otherwise pass here unnoticed.
  for (const [pattern, what] of [
    [/\w+\.maxLength/, 'the caption length clamp'],
    [/\w+\.hashtagLimit/, 'the hashtag limit'],
    [/\w+\.mediaLimit/, 'the attachment limit'],
    [/\w+\.weightedLimit/, "the platforms that count units rather than characters"],
    [/snapsPlatformRules\.x\.mediaLimit/, 'the X attachment trim'],
    // Naming the limit is not measuring against it - the smoke has to call the
    // weighted counter at both the caption and the published-post assertion.
    [
      /snapsWeightedLength\([\s\S]*snapsWeightedLength\(/,
      'the weighted counter at both the caption and the published post',
    ],
  ]) {
    if (!pattern.test(smoke)) {
      throw new Error(
        `verify-snaps-cardnews-deepseek.ts no longer asserts ${what}; the live run ` +
          'would pass without exercising it'
      );
    }
  }
});

// All three workspaces count result.scheduled to decide whether a run
// succeeded and render result.warnings. A return path that omits either makes
// a successful schedule read as a failure in the UI.
expectCustom('every scheduleVariantsForOrg return carries scheduled and warnings', () => {
  const source = read('apps/backend/src/api/routes/snaps.controller.ts');
  const start = source.indexOf('private async scheduleVariantsForOrg(');
  if (start < 0) {
    throw new Error('snaps.controller.ts no longer defines scheduleVariantsForOrg');
  }
  // The method ends at the next method declaration at the same indent.
  const rest = source.slice(start);
  const endMatch = /\n {2}@(Get|Post|Delete|Put|Patch)\(/.exec(rest);
  const body = endMatch ? rest.slice(0, endMatch.index) : rest;

  const returns = [...body.matchAll(/return \{/g)];
  if (returns.length < 2) {
    throw new Error(
      `scheduleVariantsForOrg has ${returns.length} object return(s); the scanner ` +
        'expected the early-exit and success paths'
    );
  }
  for (const key of ['scheduled', 'warnings']) {
    const count = (body.match(new RegExp(`\\b${key}:`, 'g')) || []).length;
    if (count < returns.length) {
      throw new Error(
        `scheduleVariantsForOrg returns an object ${returns.length} time(s) but sets ` +
          `${key} only ${count} time(s); a caller counting result.scheduled would read ` +
          'a successful schedule as a failure'
      );
    }
  }
});

// CreatePostDto requires at least one PostContent (@ArrayMinSize(1)) and
// ValidContent rejects a blank body unless the post carries images. An empty
// variant used to build a payload the API refuses - threads lost its only
// segment, other platforms shipped a blank content string.
expectCustom('an empty variant is refused before a payload is built', (read) => {
  const file =
    'libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts';
  if (!testsBothWays(read(file), '!hasBody', '!hasMedia')) {
    throw new Error(
      `${file} no longer refuses a variant with neither body nor media; threads ` +
        'loses its only segment and other platforms ship a blank content string'
    );
  }
});
expectContains(
  'libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts',
  'hasMedia',
  'unpublishable variants are skipped before the payload is built'
);
expectCustom('the empty-variant skip matches what ValidContent allows', () => {
  const builder = read(
    'libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts'
  );
  const code = builder
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  // ValidContent permits an empty body when images exist, so the skip must
  // consider media too - dropping on content alone would refuse image-only
  // posts the API accepts.
  if (!/const hasMedia = Array\.isArray\(variant\.media\)/.test(code)) {
    throw new Error(
      'the empty-variant skip no longer looks at media, so an image-only post ' +
        'would be refused even though ValidContent allows it'
    );
  }
});

// A variant's media path becomes MediaDto.path, which ValidUrlExtension checks
// deep inside post creation. attachVideoToDraft took the caller's videoUrl
// straight through, so a .mov, .webm or extension-less CDN URL failed far from
// the request that supplied it. The check reuses the validator class rather
// than restating its extension list.
expectContains(
  'apps/backend/src/api/routes/snaps.controller.ts',
  'new ValidUrlExtension().validate(effectiveMediaPath',
  'video URL extension validated on the attach request'
);
expectNotContains(
  'apps/backend/src/api/routes/snaps.controller.ts',
  "'.mp4',",
  'a duplicated copy of the accepted media extension list'
);

// The enum guard below only inspects buildDefaultSettings. The card news and
// video builders spread it and then override fields, which is how instagram
// ended up with post_type 'reel' - not one of @IsIn(['post', 'story']).
expectCustom('settings overrides satisfy the provider DTO enums', () => {
  const dtoDir = 'libraries/nestjs-libraries/src/dtos/posts/providers-settings';
  const dtoFor = {
    instagram: 'instagram.dto.ts',
    youtube: 'youtube.settings.dto.ts',
    tiktok: 'tiktok.dto.ts',
    x: 'x.dto.ts',
  };

  const acceptedValues = (platform, field) => {
    const file = dtoFor[platform];
    if (!file) return null;
    const dto = read(`${dtoDir}/${file}`);
    const cls = dto.slice(dto.lastIndexOf('export class '));
    for (const match of cls.matchAll(/^\s*(\w+)\??\s*[:!]/gm)) {
      if (match[1] !== field) continue;
      const before = cls.slice(Math.max(0, match.index - 320), match.index);
      const decorators = before.slice(before.lastIndexOf(';') + 1);
      const isIn = /@IsIn\(\s*\[([\s\S]*?)\]/.exec(decorators);
      if (!isIn) return null;
      return [...isIn[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
    }
    return null;
  };

  for (const file of [
    'libraries/nestjs-libraries/src/snaps/video/video-variant.builder.ts',
    'libraries/nestjs-libraries/src/snaps/cardnews/card-news-variant.builder.ts',
  ]) {
    const source = read(file)
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    // ...(platform === 'x' ? { field: 'value' } : {})
    for (const match of source.matchAll(
      /platform === '([\w-]+)' \? \{ (\w+): '([^']*)' \}/g
    )) {
      const [, platform, field, value] = match;
      const accepted = acceptedValues(platform, field);
      if (!accepted) continue;
      if (!accepted.includes(value)) {
        throw new Error(
          `${file} overrides ${platform}.${field} to '${value}', which is not one of ` +
            `[${accepted.join(', ')}] in ${dtoFor[platform]}`
        );
      }
    }
  }
});

expectCustom('buildDefaultSettings values satisfy the provider DTO enums', () => {
  const rules = read('libraries/nestjs-libraries/src/snaps/transform/platform-rules.ts');
  const dtoDir = 'libraries/nestjs-libraries/src/dtos/posts/providers-settings';

  // Fields whose blank value is a deliberate sentinel rather than a violation.
  const sentinels = new Set(['youtube.title']);

  for (const [platform, dtoFile] of [
    ['youtube', 'youtube.settings.dto.ts'],
    ['tiktok', 'tiktok.dto.ts'],
    ['instagram', 'instagram.dto.ts'],
    ['x', 'x.dto.ts'],
  ]) {
    const branchMatch = new RegExp(
      `platform === '${platform}'\\) \\{[\\s\\S]*?return \\{([\\s\\S]*?)\\};`
    ).exec(rules);
    if (!branchMatch) continue;
    const supplied = new Map(
      [...branchMatch[1].matchAll(/^\s*([\w_]+): '([^']*)'/gm)].map((m) => [m[1], m[2]])
    );

    const dto = read(`${dtoDir}/${dtoFile}`);
    const cls = dto.slice(dto.lastIndexOf('export class '));
    for (const match of cls.matchAll(/^\s*(\w+)\??\s*[:!]/gm)) {
      const field = match[1];
      if (!supplied.has(field)) continue;
      if (sentinels.has(`${platform}.${field}`)) continue;
      const before = cls.slice(Math.max(0, match.index - 320), match.index);
      const decorators = before.slice(before.lastIndexOf(';') + 1);
      const isIn = /@IsIn\(\s*\[([\s\S]*?)\]/.exec(decorators);
      if (!isIn) continue;
      const accepted = [...isIn[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
      const value = supplied.get(field);
      if (!accepted.includes(value)) {
        throw new Error(
          `buildDefaultSettings('${platform}').${field} is '${value}', which is not one of ` +
            `[${accepted.join(', ')}] in ${dtoFile}`
        );
      }
    }
  }
});

expectCustom('buildDefaultSettings covers the required provider fields', () => {
  const rules = read('libraries/nestjs-libraries/src/snaps/transform/platform-rules.ts');
  const dtoDir = 'libraries/nestjs-libraries/src/dtos/posts/providers-settings';

  // platform -> settings DTO file, for the platforms snaps schedules to that
  // have a settings DTO at all.
  const pairs = [
    ['tiktok', `${dtoDir}/tiktok.dto.ts`],
    ['x', `${dtoDir}/x.dto.ts`],
    ['instagram', `${dtoDir}/instagram.dto.ts`],
  ];

  for (const [platform, dtoPath] of pairs) {
    const branch = new RegExp(
      `platform === '${platform}'\\) \\{[\\s\\S]*?return \\{([\\s\\S]*?)\\};`
    ).exec(rules);
    if (!branch) {
      throw new Error(
        `platform-rules.ts no longer has a buildDefaultSettings branch for ${platform}`
      );
    }
    const supplied = [...branch[1].matchAll(/^\s*([\w_]+)\s*:/gm)].map((m) => m[1]);

    // Required = a decorated property in the DTO's own class with no
    // @IsOptional. Nested helper classes are skipped by only reading the last
    // exported class in the file.
    const dto = read(dtoPath);
    const lastClass = dto.slice(dto.lastIndexOf('export class '));
    const required = [];
    for (const match of lastClass.matchAll(/^\s*(\w+)(\??)\s*[:!]/gm)) {
      const [, name, optionalMark] = match;
      // Read the decorators as the text between the previous property and this
      // one. Matching a decorator chain directly does not survive nested
      // parentheses - @ValidateIf((p) => p.title) truncates at the inner ')'
      // and the guard then treats a conditionally-validated field as required.
      const before = lastClass.slice(Math.max(0, match.index - 240), match.index);
      const decorators = before.slice(before.lastIndexOf(';') + 1);
      if (!/@[\w.]+\(/.test(decorators)) continue;
      if (optionalMark === '?' || /@IsOptional|@ValidateIf/.test(decorators)) continue;
      required.push(name);
    }

    const missing = required.filter((field) => !supplied.includes(field));
    if (missing.length) {
      throw new Error(
        `buildDefaultSettings('${platform}') omits required ${dtoPath} field(s): ` +
          `${missing.join(', ')} - they reach the provider as undefined`
      );
    }
  }
});
// buildDefaultSettings('youtube') seeds an empty title and only the video path
// filled it in, so anything scheduled to YouTube from the transform flow
// reached the provider with title: ''. The fill lives in the one builder every
// snaps scheduling path goes through.
expectContains(
  'libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts',
  "if (variant.platform === 'youtube') {",
  'YouTube title fill in the shared publishing payload builder'
);
expectCustom('the YouTube title fill cannot resolve to an empty string', () => {
  const source = read(
    'libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts'
  );
  const start = source.indexOf("if (variant.platform === 'youtube') {");
  const end = source.indexOf("if (variant.platform !== 'naver-cafe') {", start);
  if (start < 0 || end < 0) {
    throw new Error(
      'publishing-payload.builder.ts no longer has a YouTube branch before the Naver Cafe one'
    );
  }
  const branch = source.slice(start, end);
  for (const required of ['settings.title', 'variant.title', 'variant.content', "'snaps 쇼츠'"]) {
    if (!branch.includes(required)) {
      throw new Error(
        `the YouTube title fill no longer falls back through ${required}, so an empty ` +
          'title can still reach the provider'
      );
    }
  }
  // YoutubeSettingsDto declares @MinLength(2) as well as @MaxLength(100). Only
  // the upper bound was applied, so a one-character title passed straight
  // through and failed provider validation.
  if (!/derived\.length >= 2/.test(branch)) {
    throw new Error(
      'the YouTube title fill no longer enforces the DTO minimum length, so a ' +
        'one-character title reaches the provider'
    );
  }
  if (!/\b100\b/.test(branch)) {
    throw new Error(
      'the YouTube title fill no longer enforces the DTO maximum length of 100'
    );
  }
  // A plain slice meets the bound but can cut an emoji in half, so the bound
  // has to be applied by the grapheme-safe clamp.
  if (/\.slice\(0,/.test(branch)) {
    throw new Error(
      'the YouTube title fill clamps with a plain slice again, which can send ' +
        'a lone surrogate to the provider'
    );
  }
});
// The shorts platform picker reached the LLM prompt but not the deterministic
// fallback, so an offline run tagged TikTok and Reels with YouTube's "#shorts".
// The fallback must read the shared per-platform rules, not a second table.
expectContains(
  'libraries/nestjs-libraries/src/snaps/video/short-video.service.ts',
  'snapsPlatformRules[platform]',
  'shorts fallback reads the shared platform rules'
);
expectNotContains(
  'libraries/nestjs-libraries/src/snaps/video/short-video.service.ts',
  "this.cleanHashtags(['#shorts', '#snaps'])",
  'the hardcoded YouTube hashtags in the shorts fallback'
);
// The workspace offers three card news templates and the deck has always
// carried a templateId, but the renderer never read it, so all three produced
// byte-identical PNGs and the picker was decoration.
expectContains(
  'libraries/nestjs-libraries/src/snaps/cardnews/card-news-renderer.service.ts',
  'this.templateStyle(deck.templateId)',
  'card news renderer reads the deck template'
);
// docs/snaps-card-news.md documents each template's gradient, accent and
// heading sizes. Those numbers were prose until now, so they could drift from
// the renderer without anything noticing.
expectCustom('the card news doc table matches the renderer styles', () => {
  const renderer = read(
    'libraries/nestjs-libraries/src/snaps/cardnews/card-news-renderer.service.ts'
  );
  const doc = read('docs/snaps-card-news.md');
  const styles = /const CARD_NEWS_TEMPLATE_STYLES[\s\S]*?\n\};/.exec(renderer);
  if (!styles) {
    throw new Error('card-news-renderer.service.ts no longer defines CARD_NEWS_TEMPLATE_STYLES');
  }

  for (const [, name, body] of styles[0].matchAll(/ {2}(\w+): \{([\s\S]*?)\n {2}\},/g)) {
    const row = new RegExp(`^\\| \`${name}\` \\|(.*)$`, 'm').exec(doc);
    if (!row) {
      throw new Error(`docs/snaps-card-news.md has no table row for the ${name} template`);
    }
    const facts = [
      /gradient: '([\w-]+)'/.exec(body)?.[1],
      /accent: '([\w-]+)'/.exec(body)?.[1],
      /coverHeadingSize: (\d+)/.exec(body)?.[1],
      /bodyHeadingSize: (\d+)/.exec(body)?.[1],
    ];
    for (const fact of facts) {
      if (!fact) {
        throw new Error(`the ${name} template style is missing a documented field`);
      }
      if (!row[1].includes(fact)) {
        throw new Error(
          `docs/snaps-card-news.md row for ${name} does not mention "${fact}" - ` +
            'the template table has drifted from the renderer'
        );
      }
    }
  }
});
expectCustom('the card news template list matches the workspace picker', () => {
  const renderer = read(
    'libraries/nestjs-libraries/src/snaps/cardnews/card-news-renderer.service.ts'
  );
  const service = read('libraries/nestjs-libraries/src/snaps/cardnews/card-news.service.ts');
  const workspace = read('apps/frontend/src/components/snaps/snaps-card-news-workspace.tsx');

  const block = (source, start) => {
    const from = source.indexOf(start);
    if (from < 0) throw new Error(`missing ${start.trim()}`);
    const end = source.indexOf('};', from);
    return source.slice(from, end < 0 ? undefined : end);
  };

  const styled = [
    ...block(renderer, 'const CARD_NEWS_TEMPLATE_STYLES').matchAll(/^ {2}(\w[\w-]*):/gm),
  ].map((m) => m[1]);
  const accepted = [
    ...(/const templateIds: SnapsCardNewsTemplateId\[\] = \[([^\]]*)\]/.exec(service)?.[1] || '')
      .matchAll(/'([\w-]+)'/g),
  ].map((m) => m[1]);
  const offered = [
    ...block(workspace, 'const cardNewsTemplates').matchAll(/id: '([\w-]+)'/g),
  ].map((m) => m[1]);

  for (const [label, list] of [
    ['renderer styles', styled],
    ['service allow-list', accepted],
    ['workspace picker', offered],
  ]) {
    if (!list.length) {
      throw new Error(`card news template ${label} parsed as empty`);
    }
  }
  const sorted = (list) => [...list].sort().join(',');
  if (sorted(styled) !== sorted(accepted) || sorted(styled) !== sorted(offered)) {
    throw new Error(
      `card news templates disagree: renderer [${styled.join(', ')}], ` +
        `service [${accepted.join(', ')}], workspace [${offered.join(', ')}] - ` +
        'a template the picker offers but the renderer does not style renders as editorial'
    );
  }
});
// /inbox/publish-reply calls provider.comment(), which posts to the connected
// channel immediately and cannot be undone. The draft and schedule routes have
// always demanded an explicit operator confirmation while this one relied on
// the workspace asking first - not a boundary a direct API call respects.
expectCustom('every externally-publishing snaps route demands confirmation', () => {
  const path = 'apps/backend/src/api/routes/snaps.controller.ts';
  const lines = read(path).split(/\r?\n/);

  // Slice the controller into route bodies so a gate on one route cannot stand
  // in for a missing gate on another.
  const routeStarts = [];
  lines.forEach((line, index) => {
    const match = /^\s*@(Get|Post|Delete|Put|Patch)\('([^']*)'\)/.exec(line);
    if (match) routeStarts.push({ index, verb: match[1], route: match[2] });
  });
  if (!routeStarts.length) {
    throw new Error(`${path} exposes no routes; the route scanner is broken`);
  }

  // Calls that reach a third-party platform rather than our own database.
  const externalEffects = ['provider.comment(', 'provider.post('];
  const ungated = [];
  routeStarts.forEach((start, position) => {
    const end = routeStarts[position + 1]?.index ?? lines.length;
    const body = lines.slice(start.index, end).join('\n');
    const publishes = externalEffects.some((call) => body.includes(call));
    if (publishes && !body.includes('assertExternalPublishConfirmed(')) {
      ungated.push(`${start.verb} ${start.route}`);
    }
  });

  if (ungated.length) {
    throw new Error(
      `${path} publishes to a connected channel without assertExternalPublishConfirmed: ` +
        ungated.join(', ')
    );
  }
});
// The workspace asks the operator, but the answer has to reach the API or the
// confirmation is decoration.
expectContains(
  'apps/frontend/src/components/snaps/snaps-workspace.tsx',
  'operatorConfirmed: true',
  'the workspace sends the reply confirmation it collected'
);
// An empty array is truthy, so `someList || defaults` never reaches the
// defaults when the model returns []. Measured against the live DeepSeek API,
// it does return [] for some platforms on every run. This swept the whole snaps
// tree rather than the two sites that were found, so a new service cannot
// reintroduce the pattern.
expectCustom('no snaps service falls back off an array with ||', () => {
  const files = [
    'libraries/nestjs-libraries/src/snaps/cardnews/card-news.service.ts',
    'libraries/nestjs-libraries/src/snaps/video/short-video.service.ts',
    'libraries/nestjs-libraries/src/snaps/transform/content-transform.service.ts',
    'libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts',
  ];
  // `x || []` is fine - it narrows a maybe-undefined value to an array. The bug
  // is `x || <something with content>`, where an empty x wins over the default.
  // Inspect the text after `||` directly: a negative lookahead does not work
  // here, because the engine backtracks the preceding \s* to zero and slips
  // past it.
  const findRisky = (line) => {
    const match = /[Hh]ashtags\s*\|\|(.*)$/.exec(line);
    if (!match) {
      return false;
    }
    return !match[1].trim().startsWith('[]');
  };
  for (const file of files) {
    // Split on either line ending. This checkout runs core.autocrlf=true, so
    // every file on disk is CRLF; splitting on '\n' alone leaves a trailing
    // '\r' on each line, and in a JS regex '\r' is a line terminator - '.' will
    // not match it and '$' will not match before it. A '(.*)$' predicate then
    // silently never fires, which is exactly how this guard was dead when first
    // written.
    const lines = read(file)
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('//'));
    const hit = lines.find(findRisky);
    if (hit) {
      throw new Error(
        `${file} falls back off a possibly-empty hashtag array with || : ${hit.trim()} ` +
          '- an empty array is truthy, so the default never applies'
      );
    }
  }
});
// An empty array is truthy, so `found?.hashtags || rule.defaultHashtags` shipped
// a hashtag-less variant instead of the platform floor - and the live DeepSeek
// API returns [] for some platforms on every run. Clean the model's list first
// and fall back on the cleaned length.
expectCustom('transform falls back to the platform default hashtags', () => {
  const path = 'libraries/nestjs-libraries/src/snaps/transform/content-transform.service.ts';
  // Strip comments first: the fix carries an explanation that quotes the very
  // expression this guard forbids, and matching that would fail on a clean tree.
  const source = read(path)
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  if (/found\?\.hashtags \|\| rule\.defaultHashtags/.test(source)) {
    throw new Error(
      `${path} is back to \`found?.hashtags || rule.defaultHashtags\`; an empty array ` +
        'from the model is truthy, so the platform defaults never apply'
    );
  }
  if (!/modelHashtags\.length\s*\n?\s*\?\s*modelHashtags/.test(source)) {
    throw new Error(
      `${path} no longer falls back to the platform defaults on an empty cleaned hashtag list`
    );
  }
});
// The snaps services persist to JSON under SNAPS_DATA_DIR; the Snaps* Prisma
// models exist as the documented PostgreSQL migration target, and
// scripts/snaps-postgres-migration.sql is the hand-written equivalent for teams
// not using Prisma db push/migrate. Nothing else keeps the two in step, so a
// field added to the schema would silently break the documented migration path.
expectCustom('the snaps migration SQL matches the Prisma models', () => {
  const schema = read('libraries/nestjs-libraries/src/database/prisma/schema.prisma');
  const sql = read('scripts/snaps-postgres-migration.sql');
  const relationTypes = ['Organization', 'Integration', 'Post'];

  for (const model of ['SnapsStyleExample', 'SnapsMetricSnapshot', 'SnapsReport']) {
    const block = new RegExp(`^model\\s+${model}\\s*\\{([\\s\\S]*?)^\\}`, 'm').exec(schema);
    if (!block) {
      throw new Error(`schema.prisma no longer declares model ${model}`);
    }
    const fields = block[1]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('@@') && !line.startsWith('//'))
      .map((line) => line.split(/\s+/))
      .filter((parts) => parts.length >= 2)
      // Relation fields are not columns.
      .filter((parts) => !relationTypes.includes(parts[1].replace(/[?[\]]/g, '')))
      .map((parts) => parts[0]);

    const table = new RegExp(
      `CREATE TABLE[^;]*?"${model}"\\s*\\(([\\s\\S]*?)\\n\\);`,
      'i'
    ).exec(sql);
    if (!table) {
      throw new Error(
        `scripts/snaps-postgres-migration.sql has no CREATE TABLE for ${model}`
      );
    }
    const columns = [...table[1].matchAll(/^\s*"(\w+)"\s+[A-Z]/gm)].map((m) => m[1]);

    const missing = fields.filter((field) => !columns.includes(field));
    const extra = columns.filter((column) => !fields.includes(column));
    if (missing.length || extra.length) {
      throw new Error(
        `${model} has drifted between schema.prisma and scripts/snaps-postgres-migration.sql: ` +
          `missing in SQL [${missing.join(', ') || 'none'}], not in the model [${
            extra.join(', ') || 'none'
          }]`
      );
    }
  }
});
// The deterministic fallback storyboard covers [0, durationSeconds] with no
// gaps, but the model path only clamped each bound on its own. Against the live
// DeepSeek API about one run in three read endSecond as inclusive and returned
// 0-5 / 6-14 / 15-23, leaving dead air at every boundary.
expectContains(
  'libraries/nestjs-libraries/src/snaps/video/short-video.service.ts',
  'this.enforceTimeline(storyboard, durationSeconds)',
  'shorts storyboard timeline is normalized, not just clamped'
);
expectCustom('the normalized shorts storyboard is the one returned', () => {
  const source = read(
    'libraries/nestjs-libraries/src/snaps/video/short-video.service.ts'
  );
  if (!/storyboard: timedStoryboard,/.test(source)) {
    throw new Error(
      'libraries/nestjs-libraries/src/snaps/video/short-video.service.ts computes a normalized ' +
        'timeline but no longer returns it - the raw model storyboard would ship instead'
    );
  }
});
// script() has a second return path: the catch branch, which every offline
// deployment and every LLM outage takes. It used to return fallbackScript()
// directly, so the timeline contract held only because the fallback's own
// arithmetic happened to agree with enforceTimeline(). Route it through the
// same guarantee instead of trusting two implementations to stay in step.
expectCustom('the shorts fallback path is timeline-normalized too', () => {
  const source = read(
    'libraries/nestjs-libraries/src/snaps/video/short-video.service.ts'
  );
  if (!/storyboard: this\.enforceTimeline\(fallback\.storyboard, fallback\.durationSeconds\)/.test(source)) {
    throw new Error(
      'libraries/nestjs-libraries/src/snaps/video/short-video.service.ts returns the shorts ' +
        'fallback without running it through enforceTimeline() - a change to the fallback ' +
        'scene arithmetic would ship a gapped timeline to every offline user'
    );
  }
});
// fetch() has no default timeout, so a Pixelle or Shorts Maker instance that
// accepts the connection and then goes quiet holds the backend request open
// with nothing to distinguish it from a slow render. Both clients must go
// through the shared helper, which aborts on a deadline and names it.
expectCustom('the video service HTTP clients cannot fall back to a bare fetch', () => {
  for (const file of [
    'libraries/nestjs-libraries/src/snaps/video/short-video.service.ts',
    'libraries/nestjs-libraries/src/snaps/shorts-maker/shorts-maker-client.service.ts',
  ]) {
    const source = read(file);
    const bare = source
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
      .filter((line) => /(?<!WithTimeout)\bfetch\(/.test(line));
    if (bare.length) {
      throw new Error(
        `${file} calls fetch() directly (${bare.length} site(s)) instead of ` +
          'snapsFetchWithTimeout() - a hung video service would hang the request'
      );
    }
  }
});
// setTimeout treats NaN as 1ms, so reading a timeout env with a bare Number()
// makes a misspelt value abort every request instead of using the default.
expectCustom('the shared timeout parser rejects what it cannot use', (read) => {
  const file = 'libraries/nestjs-libraries/src/snaps/http/fetch-with-timeout.ts';
  if (!testsBothWays(read(file), 'Number.isFinite(parsed)', 'parsed > 0')) {
    throw new Error(
      `${file} no longer rejects a non-positive or unparseable timeout; NaN ` +
        'reaches setTimeout, which treats it as 1ms'
    );
  }
});
expectContains(
  'libraries/nestjs-libraries/src/snaps/http/fetch-with-timeout.ts',
  'snapsTimeoutMs',
  'the timeout env parser rejects NaN and non-positive values'
);
// buildSnapsPublishingPayload emits one warning per skipped variant plus a
// closing summary, so scheduling across every connected platform produces more
// warnings than the workspaces list. Truncating is fine; truncating silently
// means the operator reads five lines and assumes that was the whole story.
expectCustom('the snaps workspaces admit when they truncate the warning list', () => {
  for (const file of [
    'apps/frontend/src/components/snaps/snaps-card-news-workspace.tsx',
    'apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx',
    'apps/frontend/src/components/snaps/snaps-workspace.tsx',
  ]) {
    const source = read(file);
    const capped = /scheduleWarnings\.slice\(0, (\d+)\)/.exec(source);
    if (!capped) {
      continue;
    }
    const limit = capped[1];
    const admits = new RegExp(
      `scheduleWarnings\\.length > ${limit}[\\s\\S]{0,400}scheduleWarnings\\.length - ${limit}`
    ).test(source);
    if (!admits) {
      throw new Error(
        `${file} shows only the first ${limit} schedule warnings and never says how ` +
          'many it dropped - the operator cannot tell a short list from a truncated one'
      );
    }
  }
});
// buildPostValues() is the one place a variant's media becomes a post's image
// list for every non-card-news path. It clamps to rule.mediaLimit, and that trim
// has to travel back as a warning: the card news flow reports its own trim, so
// only the other paths were dropping attachments from an otherwise successful
// schedule without telling anyone.
expectCustom('the attachment clamp reports the attachments it drops', () => {
  const file = 'libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts';
  const source = read(file);
  if (!/function buildPostValues\([^)]*warnings: string\[\]/.test(source)) {
    throw new Error(
      `${file} clamps variant media in buildPostValues() but no longer receives the ` +
        'warnings array, so a trimmed attachment cannot be reported to the operator'
    );
  }
  const clampBlock = /const clamped = overLimit[\s\S]{0,900}?\n  \}/.exec(source);
  if (!clampBlock || !/warnings\.push\(/.test(clampBlock[0])) {
    throw new Error(
      `${file} trims variant media past rule.mediaLimit without pushing a warning - ` +
        'the extra attachments would vanish from a post the operator was told succeeded'
    );
  }
});
// buildSnapsCardNewsVariants clamps three things per platform: attachments,
// the caption, and the hashtags. Only the attachment trim was reported, so X -
// which caps at 280 characters and one hashtag - published a caption cut
// mid-sentence and one of twenty tags from a run the operator was told worked.
// Every clamp in this builder has to travel back as a warning.
expectCustom('the card news builder reports every trim it makes', () => {
  const file = 'libraries/nestjs-libraries/src/snaps/cardnews/card-news-variant.builder.ts';
  const source = read(file);
  for (const [what, marker] of [
    ['caption', 'captionTrims'],
    ['hashtag', 'hashtagTrims'],
  ]) {
    const recorded = new RegExp(`${marker}\\.push\\(`).test(source);
    const reported = new RegExp(`${marker}\\.length[\\s\\S]{0,400}warnings\\.push\\(`).test(
      source
    );
    if (!recorded || !reported) {
      throw new Error(
        `${file} clamps the ${what} per platform but does not report it ` +
          `(recorded=${recorded}, reported=${reported}) - the operator would see a ` +
          'successful schedule and a rewritten post'
      );
    }
  }
});
// Every snaps flow builds a per-platform hashtag set and every workspace shows
// it beside the variant, but buildPostValues() published variant.content alone -
// so card news and shorts posts went out with none of their tags, and only the
// offline transform fallback, which writes tags inline, published any at all.
// The tags have to be attached here, at the one choke point every path crosses.
expectCustom('the publishing builder puts the variant hashtags in the post', () => {
  const file = 'libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts';
  const source = read(file);
  if (!/function appendHashtags\(/.test(source)) {
    throw new Error(
      `${file} no longer attaches variant.hashtags to the published body - every ` +
        'workspace would keep showing tags that never reach the channel'
    );
  }
  if (!/const publishBody = appendHashtags\(/.test(source)) {
    throw new Error(
      `${file} defines appendHashtags() but does not publish its result, so the ` +
        'hashtags are still dropped'
    );
  }
  // The body must win when the tags do not fit: trimming what the operator wrote
  // to make room for hashtags is the worse of the two failures.
  const helper = /function appendHashtags\([\s\S]*?\n\}/.exec(source);
  // Measured in whatever the platform counts. X counts units, not characters,
  // so `body.length + suffix.length` was the wrong sum there: tags that fit in
  // characters and not in units pushed a post past the real limit and X
  // refused it. Either spelling satisfies this; what may not happen is
  // appending without checking.
  const checksTheBudget =
    !!helper &&
    (/body\.length \+ suffix\.length > maxLength/.test(helper[0]) ||
      /measure\(body\) \+ measure\(suffix\) > maxLength/.test(helper[0]));
  if (!checksTheBudget) {
    throw new Error(
      `${file} appends hashtags without checking them against the platform length ` +
        'limit, so a full-length post would be pushed over it'
    );
  }
  if (!/warnings\.push\(/.test(helper[0])) {
    throw new Error(
      `${file} drops hashtags that do not fit without reporting them`
    );
  }
});
// appendHashtags() skips tags the body already carries. Deciding that with
// body.includes() dropped any tag that was a prefix of another one - a body
// carrying #건강관리 swallowed a separate #건강, which then never published.
// Korean hashtags overlap that way constantly, so the comparison has to be
// against whole tags.
expectCustom('the hashtag dedup compares whole tags, not substrings', () => {
  const file = 'libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts';
  const source = read(file);
  const helper = /function appendHashtags\([\s\S]*?\n\}/.exec(source);
  if (!helper) {
    throw new Error(`${file} has no appendHashtags() to check`);
  }
  if (/!body\.includes\(tag\)/.test(helper[0])) {
    throw new Error(
      `${file} decides whether a hashtag is already in the body with a substring ` +
        'match, so a tag that is a prefix of another one is silently dropped'
    );
  }
  if (!/bodyTags\.has\(tag\)/.test(helper[0])) {
    throw new Error(
      `${file} no longer compares hashtags against the set of whole tags in the body`
    );
  }
});
// The hashtag sanitiser was a private method on SnapsContentTransformService, so
// only the transform path got it. Card news, shorts and a direct
// /snaps/schedule-variants call reach the publishing builder with whatever they
// hold, and unsanitised that published a bare word as plain text, a lone '#' and
// a raw number. Both sides must use the one shared implementation.
expectCustom('hashtag sanitising is shared, not reimplemented per path', () => {
  const shared = 'libraries/nestjs-libraries/src/snaps/transform/hashtags.ts';
  if (!/export function sanitizeSnapsHashtags\(/.test(read(shared))) {
    throw new Error(`${shared} no longer exports the shared hashtag sanitiser`);
  }
  for (const file of [
    'libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts',
    'libraries/nestjs-libraries/src/snaps/transform/content-transform.service.ts',
  ]) {
    const source = read(file);
    if (!/sanitizeSnapsHashtags\(/.test(source)) {
      throw new Error(
        `${file} does not use sanitizeSnapsHashtags(), so its hashtags can be ` +
          'cleaned differently from every other snaps path'
      );
    }
    // A second local copy of the cleaning rules is how the two drifted apart the
    // first time.
    if (/replace\(\/\^#\+\/, ''\)/.test(source)) {
      throw new Error(
        `${file} reimplements the hashtag cleaning rules locally instead of ` +
          'calling the shared sanitiser'
      );
    }
  }
});
// The activity log is the audit trail. It recorded every platform the operator
// asked for, but the publishing builder skips variants - assist-only channels,
// platforms with no connected integration, an incomplete Naver Cafe variant - so
// a run that reached one channel was written into the history as having reached
// four. It has to record what the builder actually scheduled.
expectCustom('the schedule activity log records what was scheduled', () => {
  const file = 'apps/backend/src/api/routes/snaps.controller.ts';
  const source = read(file);
  if (!/private scheduledPlatformDetail\(/.test(source)) {
    throw new Error(
      `${file} no longer derives the logged platforms from what was scheduled`
    );
  }
  // Scoped to the two records that describe scheduling. "Generated platform
  // variants" and "Prepared draft payload from transform" legitimately list the
  // platforms they produced variants for - nothing was published there.
  for (const title of [
    'Created scheduled variants from transform',
    'Created drafts from edited variants',
  ]) {
    const record = new RegExp(
      `title: '${title}',[\\s\\S]{0,400}?\\n      \\},`
    ).exec(source);
    if (!record) {
      throw new Error(`${file} no longer records an activity entry titled "${title}"`);
    }
    if (!/scheduledPlatformDetail\(/.test(record[0])) {
      throw new Error(
        `${file} logs "${title}" from the requested platforms again, so the ` +
          'activity history claims channels the builder skipped'
      );
    }
  }
});
// A schedule-mode variant whose platform has no connected channel is filtered
// out before any per-variant check, so it was only explained by the summary that
// fires when nothing at all could be scheduled.
expectContains(
  'libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts',
  /publishMode === 'schedule' &&[\s\S]{0,40}?!\w+\.has\(variant\.platform\)/,
  'the builder reports platforms dropped for having no connected channel'
);
// provider.comment() resolves to the posts it actually created, so an empty
// array means the request succeeded and nothing reached the channel. The
// workspace warns about that case; the activity history titled the record
// 'Published feedback reply' either way, which is the audit trail recording a
// reply that was never posted.
expectCustom('the reply activity record reflects what the channel accepted', () => {
  const file = 'apps/backend/src/api/routes/snaps.controller.ts';
  const source = read(file);
  const record = /title: published\s*\n\s*\? 'Published feedback reply'/.test(source);
  if (!record) {
    throw new Error(
      `${file} titles the feedback reply activity record 'Published feedback reply' ` +
        'unconditionally, so a reply the channel never posted is logged as published'
    );
  }
  if (!/const published = Array\.isArray\(result\) \? result\.length/.test(source)) {
    throw new Error(
      `${file} no longer counts the posts provider.comment() actually created`
    );
  }
});
// RAG embeddings always go through the local Ollama embed model - DeepSeek has
// no embeddings endpoint - and rebuildEmbeddings() keeps every example usable
// through token matching when that call fails. A run where nothing embedded
// still returns 200 with rebuilt: 0, and the workspace reported it with a plain
// "완료" toast: on a DeepSeek deployment that is the normal outcome, so the
// operator got a success signal every time while the index was fully degraded.
expectCustom('the RAG rebuild toast reports a degraded rebuild as one', () => {
  const file = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
  const source = read(file);
  const handler = /const rebuildRagEmbeddings = async \(\) => \{[\s\S]*?\n  \};/.exec(
    source
  );
  if (!handler) {
    throw new Error(`${file} no longer defines rebuildRagEmbeddings`);
  }
  if (!testsBothWays(handler[0], 'rebuiltTotal', '!rebuiltCount')) {
    throw new Error(
      `${file} does not single out a rebuild that embedded nothing, so a fully ` +
        'degraded RAG index is reported to the operator as a success'
    );
  }
  const warns = (handler[0].match(/'warning'/g) || []).length;
  if (warns < 3) {
    throw new Error(
      `${file} raises ${warns} warning toast(s) in rebuildRagEmbeddings; a partial ` +
        'and a total embedding failure both have to be flagged, not just the request error'
    );
  }
});
// normalizeVariants() pushes one warning per platform the model skipped, so a
// transform over ten channels where it answered for one produces nine. The
// workspace rendered result.warnings[0] alone: the operator was told about one
// platform and never learned the other eight variants are deterministic
// template output rather than generated copy.
expectCustom('the transform warning panel shows more than the first warning', () => {
  const file = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
  const source = read(file);
  // Matched on the opening test alone. The previous version anchored on the
  // closing brace at a fixed indent and went green-to-red the moment the JSX
  // was re-indented, which says nothing about whether the operator sees every
  // warning - the thing this guard exists to protect.
  const marker = '{!!result?.warnings?.length && (';
  // The panel carries a JSX comment naming the old bug verbatim, so a raw
  // substring search for it matches the explanation and not the code.
  const stripJsxComments = (text) => {
    let out = text;
    let open = out.indexOf('{/*');
    while (open >= 0) {
      const close = out.indexOf('*/}', open);
      if (close < 0) {
        break;
      }
      out = out.slice(0, open) + out.slice(close + 3);
      open = out.indexOf('{/*');
    }
    return out;
  };
  const panels = [];
  let at = source.indexOf(marker);
  while (at >= 0) {
    panels.push(stripJsxComments(source.slice(at, at + 1400)));
    at = source.indexOf(marker, at + marker.length);
  }
  if (panels.length < 2) {
    throw new Error(
      `${file} no longer renders the transform warning panel in both workspaces ` +
        `(found ${panels.length})`
    );
  }
  panels.forEach((panel, index) => {
    if (panel.includes('warnings[0]')) {
      throw new Error(
        `${file} transform warning panel ${index + 1} renders only the first ` +
          'warning, hiding every other platform that fell back to template output'
      );
    }
    if (!panel.includes('.map(')) {
      throw new Error(
        `${file} transform warning panel ${index + 1} does not iterate the warnings`
      );
    }
    if (panel.includes('.slice(') && !panel.includes('warnings.length -')) {
      throw new Error(
        `${file} transform warning panel ${index + 1} truncates the list without ` +
          'saying how many warnings it dropped'
      );
    }
  });
});
// The card news service answers 200 whether the model produced the deck or it
// degraded to the deterministic template one. The deck carried nothing to tell
// them apart, so the workspace reported both as "생성했습니다" and the live smoke
// had to guess by matching '포인트 N' headings. The label has to exist on the
// deck and be acted on in the workspace.
expectContains(
  'libraries/nestjs-libraries/src/snaps/cardnews/card-news.service.ts',
  "provider: 'rule-fallback',",
  'the deterministic card news deck is labelled as a fallback'
);
expectContains(
  'libraries/nestjs-libraries/src/snaps/cardnews/card-news.service.ts',
  'provider: this.ollama.provider(),',
  'a card news deck built from the model response is labelled with the engine'
);
expectCustom('the card news workspace tells the operator about a fallback deck', () => {
  const file = 'apps/frontend/src/components/snaps/snaps-card-news-workspace.tsx';
  const source = read(file);
  if (!/data\.provider === 'rule-fallback'/.test(source)) {
    throw new Error(
      `${file} does not check the deck provider, so a deterministic template deck ` +
        'is reported to the operator as a generated one'
    );
  }
});
// script() answers 200 whether the model wrote the storyboard or it degraded to
// the deterministic script, so the result has to say which - the same label the
// transform result and the card news deck carry - and the workspace has to act
// on it instead of reporting both as '대본을 생성했습니다'.
expectContains(
  'libraries/nestjs-libraries/src/snaps/video/short-video.service.ts',
  'provider: sourceStoryboard.length',
  'the shorts script is labelled by whether the model supplied a storyboard'
);
expectContains(
  'libraries/nestjs-libraries/src/snaps/video/short-video.service.ts',
  "provider: 'rule-fallback',",
  'the deterministic shorts script is labelled as a fallback'
);
expectCustom('the shorts workspace tells the operator about a fallback script', () => {
  const file = 'apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx';
  const source = read(file);
  if (!/scriptProvider === 'rule-fallback'/.test(source)) {
    throw new Error(
      `${file} does not check the script provider, so a deterministic template ` +
        'script is reported to the operator as a generated one'
    );
  }
  // /video/script returns the script itself; /video/generate-short wraps it.
  if (!/\(data\?\.script \?\? data\)\?\.provider/.test(source)) {
    throw new Error(
      `${file} reads the provider from only one of the two shorts responses`
    );
  }
});
// Completing the provider label across every snaps generator. The analytics
// report and the feedback summary both answer 200 whether the model wrote the
// text or the service degraded to its deterministic output, and the live smoke
// had to guess by comparing the summary to the insights joined together.
expectContains(
  'libraries/nestjs-libraries/src/snaps/analytics/report-generator.service.ts',
  'provider: aiSummary ? this.ollama.provider()',
  'the report is labelled by whether the model summary was used'
);
expectContains(
  'libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts',
  "return { ...fallback, provider: 'rule-fallback' as const };",
  'a feedback summary that fell back is labelled as a fallback'
);
// The live smoke should read the label rather than infer it, but the old proxy
// stays as a cross check so a label that drifts from the output still fails.
expectCustom('the report live smoke checks the label and the text', () => {
  const file = 'scripts/verify-snaps-core-deepseek.ts';
  const source = read(file);
  if (!/provider === EXPECTED_PROVIDER/.test(source)) {
    throw new Error(
      `${file} no longer asserts the analytics report provider label`
    );
  }
  if (!/report\.summary\.trim\(\) !== report\.insights\.join\(' '\)\.trim\(\)/.test(source)) {
    throw new Error(
      `${file} dropped the cross check that the labelled summary is not the ` +
        'deterministic one, so a label that lies would pass'
    );
  }
});
// Every snaps generator now reports which path built its result, and the
// workspaces have to act on that: a deterministic report or feedback summary
// announced with the same success toast as a generated one is the whole reason
// the label was added. announceResult() is the single place that decision lives.
expectCustom('the workspace announces a fallback result as a fallback', () => {
  const file = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
  const source = read(file);
  if (!/const announceResult = \(/.test(source)) {
    throw new Error(
      `${file} no longer has announceResult(), so each call site decides on its ` +
        'own whether to tell the operator a result is deterministic'
    );
  }
  if (!/provider === 'rule-fallback'/.test(source)) {
    throw new Error(`${file} never checks a result provider label`);
  }
  // The declaration reads `const announceResult = (`, so it does not match
  // this pattern - every hit is a real call site.
  //
  // The two report paths go through summariseSnapsReportOutcome instead, which
  // answers the same question and one more: the skipped-channel branch used to
  // replace the engine notice rather than join it, so the report that deserved
  // the most doubt was the one that never mentioned the fallback. Either
  // mechanism counts; what may not happen is a result announced with neither.
  //
  // Four generators label their results: the agent plan and the feedback
  // summary through announceResult, the two report routes through the shared
  // reader. The threshold was three while there were three, and when a fourth
  // arrived it stopped biting - a mutation that deleted one of the report
  // announcements walked straight through it. It is the count of announcers
  // that matters, so it tracks them.
  const calls =
    (source.match(/announceResult\(/g) || []).length +
    (source.match(/summariseSnapsReportOutcome\(/g) || []).length;
  if (calls < 4) {
    throw new Error(
      `${file} routes only ${calls} result(s) through announceResult() or ` +
        'summariseSnapsReportOutcome(); the agent plan, the feedback summary ' +
        'and both report routes each have to go through one of them'
    );
  }
  // and the shared reader has to make the same judgement the local one does.
  const shared = read(
    'apps/frontend/src/components/snaps/snaps-workspace.shared.ts'
  );
  if (
    /summariseSnapsReportOutcome/.test(source) &&
    !/provider === 'rule-fallback'/.test(shared)
  ) {
    throw new Error(
      'snaps-workspace.shared.ts summariseSnapsReportOutcome never checks for ' +
        "the 'rule-fallback' provider, so a deterministic report is announced " +
        'as a generated one'
    );
  }
});
// The agent plan picks the target channels, the schedule and whether card news
// and shorts run. When the model call fails the planner falls back to keyword
// matching, which decides all of that by rules - so the plan has to say which,
// and the workspace has to tell the operator before they confirm.
expectContains(
  'libraries/nestjs-libraries/src/snaps/agent/command-planner.service.ts',
  "provider: 'rule-fallback',",
  'a keyword-matched agent plan is labelled as a fallback'
);
expectContains(
  'libraries/nestjs-libraries/src/snaps/agent/command-planner.service.ts',
  'provider: this.ollama.provider(),',
  'a model-produced agent plan is labelled with the engine'
);
expectContains(
  'apps/frontend/src/components/snaps/snaps-workspace.tsx',
  'prepared?.plan?.provider',
  'the workspace tells the operator when the agent plan came from keyword matching'
);
// The snaps JSON stores read with `catch { return [] }`, which is right for a
// file that does not exist yet and wrong for one that does: a truncated file
// reads as "no entries" and the next write puts `[newEntry, ...[]]` over it.
// Measured on the activity log - three entries, corrupt the file, write a
// fourth, and the earlier bytes were gone from disk for good. Every store that
// rewrites a whole file has to move a damaged one aside first.
expectContains(
  'libraries/nestjs-libraries/src/snaps/storage/preserve-unreadable-file.ts',
  'export async function preserveUnreadableJsonFile(',
  'the shared store-preservation helper exists'
);
expectCustom('the whole-file JSON stores preserve a damaged file', () => {
  // Every snaps store that rewrites a whole JSON file, not just the two the
  // loss was first measured on.
  for (const file of [
    'libraries/nestjs-libraries/src/snaps/activity/activity-log.service.ts',
    'libraries/nestjs-libraries/src/snaps/rag/vector-store.service.ts',
    'libraries/nestjs-libraries/src/snaps/agent/agent-task.service.ts',
    'libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts',
    'libraries/nestjs-libraries/src/snaps/library/source-library.service.ts',
  ]) {
    const source = read(file);
    // One preservation call per whole-file write in that store.
    const writes = (source.match(/await this\.atomicWrite\(/g) || []).length;
    const preserved = (source.match(/preserveUnreadableJsonFile\(/g) || []).length;
    if (preserved < writes) {
      throw new Error(
        `${file} has ${writes} whole-file write(s) but preserves a damaged file ` +
          `on only ${preserved} of them`
      );
    }
    if (!/preserveUnreadableJsonFile\(/.test(source)) {
      throw new Error(
        `${file} rewrites its whole store without moving an unparseable file ` +
          'aside, so a truncated file would be overwritten and its remaining ' +
          'entries lost'
      );
    }
  }
});
// atomicWrite fills a temp file and renames it into place, which is right. But
// the rename can fail - on Windows a target another process holds open gives
// EPERM - and all five byte-identical copies left the temp file on disk for
// good, one orphan per failed attempt. One shared implementation that cleans up.
expectContains(
  'libraries/nestjs-libraries/src/snaps/storage/atomic-json-write.ts',
  'await fs.rm(tmpPath, { force: true })',
  'the shared atomic write removes its temp file when the rename fails'
);
expectCustom('the snaps stores share one atomic write', () => {
  for (const file of [
    'libraries/nestjs-libraries/src/snaps/activity/activity-log.service.ts',
    'libraries/nestjs-libraries/src/snaps/rag/vector-store.service.ts',
    'libraries/nestjs-libraries/src/snaps/agent/agent-task.service.ts',
    'libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts',
    'libraries/nestjs-libraries/src/snaps/library/source-library.service.ts',
  ]) {
    const source = read(file);
    if (!/writeJsonFileAtomically\(/.test(source)) {
      throw new Error(`${file} no longer uses the shared atomic write`);
    }
    // A local copy is how the five drifted into leaking in the first place.
    if (/await fs\.rename\(tmpPath, filePath\)/.test(source)) {
      throw new Error(
        `${file} reimplements the temp-file rename locally instead of calling ` +
          'the shared writer, so it can leak temp files again'
      );
    }
  }
});
// Every snaps store reads its whole file, changes it in memory and writes it
// back. Two concurrent requests for one organisation both read N entries and
// both wrote N+1: measured at 20 concurrent writes, 1 survived, and on Windows
// the colliding renames also failed outright. The mutating methods have to hold
// a per-file lock across the read-modify-write - and the write must NOT take it
// again, which deadlocked every store until it was removed.
expectCustom('the snaps stores serialise their read-modify-write', () => {
  for (const file of [
    'libraries/nestjs-libraries/src/snaps/activity/activity-log.service.ts',
    'libraries/nestjs-libraries/src/snaps/rag/vector-store.service.ts',
    'libraries/nestjs-libraries/src/snaps/agent/agent-task.service.ts',
    'libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts',
    'libraries/nestjs-libraries/src/snaps/library/source-library.service.ts',
  ]) {
    const source = read(file);
    if (!/withJsonFileLock\(this\.filePath\(/.test(source)) {
      throw new Error(
        `${file} does not hold a per-file lock across its read-modify-write, so ` +
          'concurrent requests for one organisation lose each others changes'
      );
    }
    const writer = /private async atomicWrite\([\s\S]{0,300}?\n  \}/.exec(source);
    if (writer && /withJsonFileLock\(/.test(writer[0])) {
      throw new Error(
        `${file} takes the file lock again inside atomicWrite, which waits on a ` +
          'lock the same call already holds - every write would hang'
      );
    }
  }
});
// Docs rot silently: the publishing path gained hashtag attachment, per-field
// trim reporting and a deck provider label, and the two documents that describe
// that path kept describing the version before them. Tie each claim to the code
// that has to be true for it, so a behaviour change without a doc change fails.
expectCustom('the snaps docs describe the current publishing behaviour', () => {
  const builder = read(
    'libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts'
  );
  if (/function appendHashtags\(/.test(builder)) {
    const audit = read('docs/snaps-completion-audit.md');
    if (!/attaches the variant hashtags/.test(audit)) {
      throw new Error(
        'docs/snaps-completion-audit.md does not mention that the publishing ' +
          'builder attaches the variant hashtags, which it now does'
      );
    }
  }

  const cardNews = read(
    'libraries/nestjs-libraries/src/snaps/cardnews/card-news.service.ts'
  );
  if (/provider: 'rule-fallback',/.test(cardNews)) {
    const doc = read('docs/snaps-card-news.md');
    if (!/`provider`/.test(doc) || !/rule-fallback/.test(doc)) {
      throw new Error(
        'docs/snaps-card-news.md does not document the deck provider label, so a ' +
          'reader cannot tell a generated deck from the deterministic one'
      );
    }
  }

  // The Shorts-Maker health probe and both video clients changed behaviour:
  // a non-JSON body keeps its HTTP status instead of reading as unreachable, and
  // every call now has a deadline. The docs described the version before both.
  const controller = read('apps/backend/src/api/routes/snaps.controller.ts');
  if (/it is reachable but not healthy/.test(controller)) {
    const doc = read('docs/snaps-shorts-maker.md');
    if (!/서버 오류/.test(doc)) {
      throw new Error(
        'docs/snaps-shorts-maker.md still lists three health states; a 5xx is now ' +
          'reported as reachable-but-unhealthy rather than an auth-bypass problem'
      );
    }
  }
  for (const [file, envName, doc] of [
    [
      'libraries/nestjs-libraries/src/snaps/shorts-maker/shorts-maker-client.service.ts',
      'SHORTS_MAKER_TIMEOUT_MS',
      'docs/snaps-shorts-maker.md',
    ],
    [
      'libraries/nestjs-libraries/src/snaps/video/short-video.service.ts',
      'PIXELLE_TIMEOUT_MS',
      'docs/snaps-pixelle-video.md',
    ],
  ]) {
    if (read(file).includes(envName) && !read(doc).includes(envName)) {
      throw new Error(
        `${doc} does not document ${envName}, so an operator cannot see that the ` +
          'call has a deadline or how to change it'
      );
    }
  }

  const variantBuilder = read(
    'libraries/nestjs-libraries/src/snaps/cardnews/card-news-variant.builder.ts'
  );
  if (/captionTrims\.push\(/.test(variantBuilder)) {
    const doc = read('docs/snaps-card-news.md');
    if (!/세 클램프는 모두 경고로 보고한다/.test(doc)) {
      throw new Error(
        'docs/snaps-card-news.md still describes the caption and hashtag clamps ' +
          'without saying they are reported to the operator'
      );
    }
  }
});
// snaps is a Korean-first product and every string the workspace renders is
// Korean - except, for a long time, the messages that explain why something did
// not work. Builder warnings go straight into the warning panel and API errors
// go straight into a toast via readSnapsError(), so an operator whose post was
// skipped read "X has no content and no media" next to Korean UI. Keep new ones
// from arriving in English.
expectCustom('operator-facing snaps messages are written in Korean', () => {
  const files = [
    'apps/backend/src/api/routes/snaps.controller.ts',
    'libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts',
    'libraries/nestjs-libraries/src/snaps/cardnews/card-news-variant.builder.ts',
    'libraries/nestjs-libraries/src/snaps/transform/content-transform.service.ts',
    'libraries/nestjs-libraries/src/snaps/agent/command-planner.service.ts',
    'libraries/nestjs-libraries/src/snaps/agent/agent-task.service.ts',
    'libraries/nestjs-libraries/src/snaps/activity/activity-log.service.ts',
    'libraries/nestjs-libraries/src/snaps/library/source-library.service.ts',
    'libraries/nestjs-libraries/src/snaps/rag/rag.service.ts',
    'libraries/nestjs-libraries/src/snaps/rag/vector-store.service.ts',
  ];
  const hangul = /[가-힣]/;
  const message =
    /(warnings\.push\(|new (?:BadRequestException|NotFoundException)\()\s*(`|')([\s\S]{5,200}?)\2/g;

  const offenders = [];
  for (const file of files) {
    const source = read(file);
    let match;
    while ((match = message.exec(source)) !== null) {
      const text = match[3];
      if (!hangul.test(text)) {
        offenders.push(`${file}: ${text.replace(/\s+/g, ' ').slice(0, 60)}`);
      }
    }
  }
  if (offenders.length) {
    throw new Error(
      `${offenders.length} operator-facing message(s) are still English; the ` +
        'workspace renders them verbatim next to Korean UI: ' +
        offenders.slice(0, 3).join(' | ')
    );
  }
});
// The store file name used to be a plain
// organizationId.replace(/[^a-zA-Z0-9_-]/g, '_'), which is not injective:
// "org.1" and "org_1" both become "org_1", so two organisations read and wrote
// one file. UUID ids hide it today; an imported id or a slug would make it a
// silent cross-tenant leak. Every store has to go through the shared key.
expectContains(
  'libraries/nestjs-libraries/src/snaps/storage/org-file-key.ts',
  'export function snapsOrgFileKey(',
  'the shared organisation file key exists'
);
expectCustom('every snaps store derives its file name from the shared key', () => {
  for (const file of [
    'libraries/nestjs-libraries/src/snaps/activity/activity-log.service.ts',
    'libraries/nestjs-libraries/src/snaps/agent/agent-task.service.ts',
    'libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts',
    'libraries/nestjs-libraries/src/snaps/library/source-library.service.ts',
    'libraries/nestjs-libraries/src/snaps/rag/vector-store.service.ts',
  ]) {
    const source = read(file);
    if (!/snapsOrgFileKey\(organizationId\)/.test(source)) {
      throw new Error(
        `${file} builds its store file name without snapsOrgFileKey(), so two ` +
          'organisation ids that escape to the same string would share one file'
      );
    }
    if (/organizationId\.replace\(\/\[\^a-zA-Z0-9_-\]\/g/.test(source)) {
      throw new Error(
        `${file} still escapes the organisation id locally; that replace is not ` +
          'injective and is exactly how the two ids collided'
      );
    }
  }
});
// Both render-status routes took no organisation and proxied a job id straight
// to their backend, and nothing recorded which organisation had requested a job
// - ownership was not merely unchecked, it was unknowable. Any authenticated
// user could read any job's status, including its finished video URL.
expectCustom('render job status is checked against the requesting organisation', () => {
  const file = 'apps/backend/src/api/routes/snaps.controller.ts';
  const source = read(file);
  for (const [label, pattern] of [
    ['Pixelle', /@Get\('\/video\/status\/:jobId'\)[\s\S]{0,600}?\n  \}/],
    [
      'Shorts-Maker',
      /@Get\('\/shorts-maker\/render-jobs\/:jobId'\)[\s\S]{0,600}?\n  \}/,
    ],
  ]) {
    const route = pattern.exec(source);
    if (!route) {
      throw new Error(`${file} no longer defines the ${label} job status route`);
    }
    if (!/@GetOrgFromRequest\(\)/.test(route[0])) {
      throw new Error(
        `${file} serves the ${label} job status without the requesting ` +
          'organisation, so any authenticated user can poll any job id'
      );
    }
    if (!/assertRenderJobBelongsToOrg\(/.test(route[0])) {
      throw new Error(
        `${file} does not check that the ${label} job belongs to the organisation ` +
          'before proxying the status through'
      );
    }
  }
  // The check can only work if the id was written down when the job was made.
  const recorded = (source.match(/\{ jobId: (?:generatedJobId|renderJobId) \}/g) || [])
    .length;
  if (recorded < 2) {
    throw new Error(
      `${file} records a render job id on only ${recorded} of the two create ` +
        'routes, so ownership is unknowable for the other and every poll is refused'
    );
  }
});
// docker-compose.yaml lists the app environment explicitly - there is no
// env_file - so a variable documented in .env.example but absent there simply
// cannot be set in the supported deployment. The video call deadlines and the
// DeepSeek chat deadline were all documented and all unreachable in the
// container, which makes the documentation wrong rather than merely incomplete.
expectCustom('every documented timeout can be set in the container', () => {
  const env = read('.env.example');
  const compose = read('docker-compose.yaml');
  const documented = [
    ...new Set(
      [...env.matchAll(/^\s*#?\s*([A-Z0-9_]*TIMEOUT_MS)\s*=/gm)].map((m) => m[1])
    ),
  ];
  if (!documented.length) {
    throw new Error('.env.example no longer documents any timeout variable');
  }
  const missing = documented.filter(
    (name) => !new RegExp('^\\s*' + name + '\\s*:', 'm').test(compose)
  );
  if (missing.length) {
    throw new Error(
      `${missing.length} timeout variable(s) are documented in .env.example but ` +
        'absent from docker-compose.yaml, so they cannot be tuned in the ' +
        `container: ${missing.join(', ')}`
    );
  }
});
// SnapsController takes seventeen injected services and the snaps services
// inject each other. Nothing offline checks that any of it can be resolved:
// every spec and verify script builds these by hand, so a dependency added to a
// constructor without being registered anywhere compiles, passes the whole
// suite, and then fails at boot with a Nest dependency error. Each one has to
// come from snaps.module, from the @Global() DatabaseModule, or from ApiModule.
expectCustom('every injected snaps dependency is registered in a module', () => {
  const registries = [
    'libraries/nestjs-libraries/src/snaps/snaps.module.ts',
    'libraries/nestjs-libraries/src/database/prisma/database.module.ts',
    'apps/backend/src/api/api.module.ts',
  ].map((file) => read(file));

  const injectors = [];
  const controller = read('apps/backend/src/api/routes/snaps.controller.ts');
  const constructorBlock = /constructor\(([\s\S]*?)\n  \) \{/.exec(controller);
  if (!constructorBlock) {
    throw new Error('could not find the SnapsController constructor');
  }
  injectors.push(['SnapsController', constructorBlock[1]]);

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
        const source = read(full);
        if (!source.includes('@Injectable')) continue;
        const block = /constructor\(([\s\S]*?)\)\s*\{/.exec(source);
        if (block) injectors.push([entry.name, block[1]]);
      }
    }
  };
  walk('libraries/nestjs-libraries/src/snaps');

  const unregistered = [];
  let scanned = 0;
  for (const [owner, block] of injectors) {
    for (const match of block.matchAll(
      /(?:private|public|protected)\s+(?:readonly\s+)?\w+:\s*([A-Za-z][A-Za-z0-9_]*)/g
    )) {
      const name = match[1];
      scanned += 1;
      if (!registries.some((source) => new RegExp(`\\b${name}\\b`).test(source))) {
        unregistered.push(`${name} (injected into ${owner})`);
      }
    }
  }
  if (scanned < 20) {
    throw new Error(`only ${scanned} injected dependencies found; the scan is broken`);
  }
  if (unregistered.length) {
    throw new Error(
      `${unregistered.length} injected dependency(ies) are not registered in ` +
        'snaps.module, the global DatabaseModule, or ApiModule, so the backend ' +
        `would fail to boot: ${[...new Set(unregistered)].join(', ')}`
    );
  }
});
// normalizeTargetPlatforms fell back to a default pair whenever nothing in the
// caller's list was supported, so a transform for ['facebook', 'myspace']
// returned Threads and Instagram variants - channels nobody had named -
// reported as a success. Naming nothing still means "use the defaults"; naming
// only unsupported platforms has to surface as an empty selection the
// controller can refuse by name, the way card news and video already do.
expectCustom('an unsupported transform platform list is refused, not redirected', () => {
  const rules = read('libraries/nestjs-libraries/src/snaps/transform/platform-rules.ts');
  const normaliser = /export function normalizeTargetPlatforms\([\s\S]*?\n\}/.exec(rules);
  if (!normaliser) {
    throw new Error('normalizeTargetPlatforms is gone');
  }
  if (/\?\s*\[\.\.\.new Set\(normalized\)\]\s*:/.test(normaliser[0])) {
    throw new Error(
      'normalizeTargetPlatforms falls back to a default platform list again, so a ' +
        'request naming only unsupported platforms is answered with channels ' +
        'nobody asked for'
    );
  }
  const controller = read('apps/backend/src/api/routes/snaps.controller.ts');
  const transformNormaliser =
    /private normalizeTransformRequest[\s\S]*?(?=\n  (?:private|public|protected|@|async )|$)/.exec(
      controller
    );
  if (!transformNormaliser || !/assertSupportedPlatforms\(/.test(transformNormaliser[0])) {
    throw new Error(
      'normalizeTransformRequest does not refuse an all-unsupported platform list, ' +
        'so the request is accepted and quietly transformed for nothing'
    );
  }
});
// Naming only unsupported platforms is refused outright; a partly supported list
// was the quiet case. Asking for ['instagram', 'facebook'] returned Instagram
// variants and no mention of facebook, so an operator who picked two channels
// got one and was told the run succeeded. All three fan-out paths have to name
// what they dropped - and the transform has to do it outside the try, or the
// deterministic fallback loses the warning exactly when the run is degraded.
expectCustom('every fan-out path names the platforms it dropped', () => {
  for (const [label, file] of [
    ['card news', 'libraries/nestjs-libraries/src/snaps/cardnews/card-news-variant.builder.ts'],
    ['shorts video', 'libraries/nestjs-libraries/src/snaps/video/video-variant.builder.ts'],
    ['transform', 'libraries/nestjs-libraries/src/snaps/transform/content-transform.service.ts'],
  ]) {
    const source = read(file);
    if (!/const unsupported = \(/.test(source) || !/제외했습니다/.test(source)) {
      throw new Error(
        `${file} filters unsupported ${label} platforms out of the request without ` +
          'reporting them, so a partly supported list quietly becomes a shorter one'
      );
    }
  }
  const transform = read(
    'libraries/nestjs-libraries/src/snaps/transform/content-transform.service.ts'
  );
  const beforeTry = transform.slice(0, transform.indexOf('    try {'));
  if (!/const unsupported = \(/.test(beforeTry)) {
    throw new Error(
      'the transform computes its dropped-platform warning inside the try, so the ' +
        'deterministic fallback returns without it'
    );
  }
});
// toCafeContent() exists to sanitise, and striptags only does half the job: it
// drops tags outside the allowlist but keeps the attributes of the ones it
// keeps, so `<a href="javascript:alert(1)">` and `<p onclick="alert(1)">` went
// through to the cafe untouched. This is the last point snaps controls before
// the post leaves. Checked with plain substring matches - a regex describing
// another regex is how this guard broke the first time it was written.
expectCustom('the Naver Cafe sanitiser strips attributes, not just tags', () => {
  const file = 'libraries/nestjs-libraries/src/integrations/social/naver-cafe.provider.ts';
  const source = read(file);
  const start = source.indexOf('private toCafeContent(');
  if (start < 0) {
    throw new Error(`${file} no longer defines toCafeContent`);
  }
  const sanitiser = source.slice(start, source.indexOf('\n  }', start));
  if (!sanitiser.includes('son[a-zA-Z]+')) {
    throw new Error(
      `${file} keeps event-handler attributes on the tags striptags allows, so an ` +
        'onclick or onmouseover reaches the cafe post'
    );
  }
  if (!sanitiser.includes('javascript|vbscript|data')) {
    throw new Error(
      `${file} does not defuse javascript:, vbscript: or data: URLs on the links ` +
        'it forwards'
    );
  }
});
// The three snaps workspaces each carried a byte-identical copy of the JSON
// header helper and the error reader. The same duplication on the server side
// drifted three separate times, so these live in one module now - a local copy
// reintroduced in one workspace is how the next divergence starts.
expectCustom('the snaps workspaces share one fetch helper module', () => {
  const shared = 'apps/frontend/src/components/snaps/snaps-fetch.helpers.ts';
  const source = read(shared);
  for (const name of ['withSnapsJsonHeaders', 'extractSnapsErrorMessage', 'readSnapsError']) {
    if (!source.includes('export const ' + name)) {
      throw new Error(`${shared} no longer exports ${name}`);
    }
  }
  for (const workspace of [
    'apps/frontend/src/components/snaps/snaps-workspace.tsx',
    'apps/frontend/src/components/snaps/snaps-card-news-workspace.tsx',
    'apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx',
  ]) {
    const text = read(workspace);
    if (!text.includes('snaps-fetch.helpers')) {
      throw new Error(`${workspace} does not import the shared snaps fetch helpers`);
    }
    for (const name of ['withSnapsJsonHeaders', 'extractSnapsErrorMessage', 'readSnapsError']) {
      if (text.includes('const ' + name + ' =')) {
        throw new Error(
          `${workspace} defines its own ${name} again instead of importing the shared one`
        );
      }
    }
  }
});
// The shorts types and the localStorage handoff key lived in both workspaces and
// had already drifted - the shorts copy of SnapsVideoResult gained progress
// fields the main copy never did. The key is the contract the two components
// pass work through, so two copies of that string mean a silent break the moment
// one changes.
expectCustom('the shorts types and handoff key have a single definition', () => {
  const shared = 'apps/frontend/src/components/snaps/snaps-shorts.shared.ts';
  const source = read(shared);
  for (const name of ['SnapsStoryboardScene', 'SnapsShortsScript', 'SnapsVideoResult']) {
    if (!source.includes('export type ' + name)) {
      throw new Error(`${shared} no longer exports ${name}`);
    }
  }
  if (!source.includes('export const snapsShortsHandoffKey')) {
    throw new Error(`${shared} no longer exports the shorts handoff key`);
  }
  for (const workspace of [
    'apps/frontend/src/components/snaps/snaps-workspace.tsx',
    'apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx',
  ]) {
    const text = read(workspace);
    if (!text.includes('snaps-shorts.shared')) {
      throw new Error(`${workspace} does not import the shared shorts definitions`);
    }
    for (const name of ['SnapsStoryboardScene', 'SnapsShortsScript', 'SnapsVideoResult']) {
      if (text.includes('type ' + name + ' =')) {
        throw new Error(
          `${workspace} declares its own ${name} again; the two copies drifted last time`
        );
      }
    }
    if (text.includes('const snapsShortsHandoffKey =')) {
      throw new Error(
        `${workspace} redeclares the handoff key instead of importing the shared one`
      );
    }
  }
});
// With no local .env the readiness report answered a hardcoded backend port. It
// matched .env.example at the time, but nothing tied them together: change the
// shipped example and every readiness run on a fresh checkout would keep probing
// the old port and report the backend blocked - a wrong answer that looks like a
// real finding. The fallback reads the example now.
expectCustom('readiness falls back to the shipped example, not a fixed port', (read) => {
  const file = 'scripts/verify-snaps-readiness.ps1';
  const source = read(file);
  // Checked as two separate call sites. A single pattern accepting either shape
  // matched the backend loop for both names, so deleting the frontend fallback
  // left this half of the guard green - which is how it was first written.
  const backendReadsExample =
    source.includes('"NEXT_PUBLIC_BACKEND_URL", "BACKEND_INTERNAL_URL"') &&
    source.includes('Get-DotEnvValue -Path ".env.example" -Name $name');
  if (!backendReadsExample) {
    throw new Error(
      `${file} no longer derives the backend URL fallback from .env.example; a ` +
        'fresh checkout would probe whatever port was hardcoded when this was written'
    );
  }
  if (!source.includes('Get-DotEnvValue -Path ".env.example" -Name "FRONTEND_URL"')) {
    throw new Error(
      `${file} no longer derives the frontend URL fallback from .env.example`
    );
  }

  // And the example has to actually carry them, or the fallback silently drops
  // through to the hardcoded value it was added to replace.
  const example = read('.env.example');
  for (const name of ['NEXT_PUBLIC_BACKEND_URL', 'FRONTEND_URL']) {
    if (!example.includes(`${name}=`)) {
      throw new Error(
        `.env.example no longer defines ${name}, which the readiness fallback reads`
      );
    }
  }
});
// post.workflow.v1.0.3 and v1.0.4 are registered so the worker knows the
// workflow types, but nothing dispatches them yet - the switch needs a live
// Temporal run to validate. An activity a ported workflow calls but the worker
// does not register fails at dispatch, which with an undispatched version means
// the failure waits until whoever flips those strings runs it in production.
// Checked here instead: measured across all four versions today, every name
// they proxy is registered.
expectCustom('every registered post workflow proxies a real activity', (read) => {
  const activityFile = 'apps/orchestrator/src/activities/post.activity.ts';
  const activitySource = read(activityFile);
  const registered = new Set(
    [...activitySource.matchAll(/@ActivityMethod\(\)\s*\r?\n\s*async (\w+)\s*\(/g)].map(
      (match) => match[1]
    )
  );
  if (registered.size < 5) {
    throw new Error(
      `${activityFile} exposes only ${registered.size} activity methods; the ` +
        'pattern this guard reads them with has probably stopped matching'
    );
  }

  for (const version of ['1.0.1', '1.0.2', '1.0.3', '1.0.4']) {
    const file = `apps/orchestrator/src/workflows/post-workflows/post.workflow.v${version}.ts`;
    const source = read(file);
    const used = new Set();
    for (const match of source.matchAll(/const \{([^}]*)\}\s*=\s*proxyActivities/g)) {
      for (const name of match[1].split(',')) {
        const clean = name.trim().split(':')[0].trim();
        if (clean) {
          used.add(clean);
        }
      }
    }
    if (!used.size) {
      throw new Error(`${file} no longer destructures any proxied activity`);
    }
    const missing = [...used].filter((name) => !registered.has(name));
    if (missing.length) {
      throw new Error(
        `${file} proxies ${missing.join(', ')}, which the worker does not ` +
          'register; dispatching this workflow version would fail at run time'
      );
    }
  }
});
// The sibling of the list-loader fix, found by checking the other two
// workspaces for the same shape. The shorts workspace loaded health the same
// silent way - `if (!response.ok) return;` and `catch { setHealth(null) }` -
// and its badges fall through to their emerald branch when health is absent, so
// a health fetch that failed painted a green "LLM 확인중" and left it there. The
// main workspace stored the reason and never rendered it, which reads as
// "확인중" forever. Both now separate "not loaded yet" from "could not load".
expectCustom('a failed health fetch is not shown as healthy or pending', (read) => {
  const shorts = 'apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx';
  const shortsSource = read(shorts);
  const at = shortsSource.indexOf('const loadHealth');
  if (at < 0) {
    throw new Error(`${shorts} no longer loads health`);
  }
  const loader = declarationBody(shortsSource, at);
  if (/if \(!response\.ok\) \{\s*return;/.test(loader)) {
    throw new Error(
      `${shorts} loadHealth returns silently on a failed response again; the ` +
        'badges then render their healthy branch'
    );
  }
  if (/catch \{\s*setHealth\(null\)/.test(loader)) {
    throw new Error(
      `${shorts} loadHealth clears health on failure again, which sends every ` +
        'badge back to its emerald branch'
    );
  }
  if (!loader.includes('setHealthError')) {
    throw new Error(`${shorts} loadHealth does not record why the fetch failed`);
  }
  // The badges moved into a pure helper, so the wording lives there now.
  // What matters is unchanged: the operator is told the check failed
  // instead of watching 확인중 forever.
  const shortsShared =
    'apps/frontend/src/components/snaps/snaps-shorts.shared.ts';
  if (!read(shortsShared).includes('상태 확인 실패')) {
    throw new Error(
      `${shortsShared} does not tell the operator the health check failed; ` +
        'the badge reads 확인중 indefinitely'
    );
  }
  // And the wording is not orphaned: the workspace renders those badges.
  if (!shortsSource.includes('snapsShortsBadges(health, healthError)')) {
    throw new Error(
      `${shorts} no longer renders the badges from the helper, so what the ` +
        'helper decides may never reach the screen'
    );
  }

  // The main workspace already stored the reason - the gap there was that
  // nothing rendered it. The headline itself now lives in the shared
  // module, where the four states it decides between can be tested.
  const main = 'apps/frontend/src/components/snaps/snaps-workspace.shared.ts';
  const mainSource = read(main);
  if (!mainSource.includes('상태 확인 실패')) {
    throw new Error(
      `${main} health card no longer separates a failed fetch from one that has ` +
        'not answered yet'
    );
  }
  const card = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
  const cardSource = read(card);
  if (!cardSource.includes('{health.ollama.error}')) {
    throw new Error(
      `${card} stores the health reason without rendering it, so the operator ` +
        'is told nothing about why the check failed'
    );
  }
});
// Six list loaders answered a failure the same two wrong ways: `if
// (!response.ok) return;` walked away from a 500 or an expired session without
// a word, and the catch replaced the list on screen with an empty one. A
// refresh that failed therefore wiped the operator's source library from the
// page and left it reading as an empty workspace - the state that would make
// someone re-enter work they still have. loadHealth in the same file always did
// it properly, which is what makes the other six a slip rather than a decision.
expectCustom('a failed list load is not shown as an empty list', (read) => {
  const file = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
  const source = read(file);

  // The bug shape: a fetch whose failure branch is a bare `return`.
  const silent = source.split('if (!response.ok) {');
  silent.slice(1).forEach((chunk) => {
    const next = chunk.slice(0, 60).trim();
    if (next.startsWith('return;')) {
      throw new Error(
        `${file} still has a loader that returns silently on a failed response; ` +
          'the operator sees an empty list instead of an error'
      );
    }
  });

  // Clearing the list in the catch is the other half - it removes data that is
  // still on the server from the page.
  for (const cleared of [
    'setSourceLibrary([])',
    'setStyleExamples([])',
    'setReportHistory([])',
    'setActivity([])',
  ]) {
    if (source.includes(`catch {\r\n      ${cleared}`) || source.includes(`catch {\n      ${cleared}`)) {
      throw new Error(
        `${file} empties the list in a catch again (${cleared}); a failed refresh ` +
          'erases what is still stored'
      );
    }
  }

  if (!source.includes('const loadList = async')) {
    throw new Error(`${file} lost the shared loadList helper the loaders go through`);
  }
  const at = source.indexOf('const loadList = async');
  const helper = declarationBody(source, at);
  if (!helper.includes('setLoadErrors')) {
    throw new Error(`${file} loadList no longer records why a list failed to load`);
  }

  // Recording it is not enough: it has to be drawn where the list is.
  if (!source.includes('const listLoadError')) {
    throw new Error(`${file} lost the renderer that shows a load failure at the list`);
  }
  for (const key of [
    'agentTasks',
    'sourceLibrary',
    'styleExamples',
    'reportHistory',
    'activity',
  ]) {
    if (!source.includes(`listLoadError('${key}')`)) {
      throw new Error(
        `${file} does not draw the load failure for ${key}; that panel would still ` +
          'read as empty'
      );
    }
  }
});
// ts-jest builds a LanguageService over the whole monorepo unless told to
// transpile each file on its own. Measured: a spec importing nothing started at
// 4,246 MB of heap and the suite needed --max-old-space-size=8192; with
// isolatedModules the same suite peaks at 344 MB and runs in 8s instead of 39s.
// The heap ceiling was lowered to match, so a future regression shows up as a
// failure instead of hiding under an 8 GB allowance.
expectCustom('the jest transform does not build a whole-program type checker', (read) => {
  const config = read('jest.config.ts');
  if (!config.includes('isolatedModules: true')) {
    throw new Error(
      'jest.config.ts no longer sets isolatedModules, so ts-jest builds a ' +
        'LanguageService over the monorepo and the suite needs gigabytes again'
    );
  }
  if (!config.includes('diagnostics: false')) {
    throw new Error(
      'jest.config.ts turned diagnostics back on while isolatedModules is set; ' +
        'that combination cannot type-check and would report confusing errors'
    );
  }
  const pkg = read('package.json');
  if (pkg.includes('max-old-space-size=8192')) {
    throw new Error(
      'package.json raises the jest heap ceiling back to 8 GB; the measured peak ' +
        'is 367 MB, so that ceiling only hides the next regression'
    );
  }
  // The type coverage isolatedModules gives up has to keep coming from
  // somewhere, or specs stop being typechecked at all.
  if (!pkg.includes('verify:snaps:spec-types')) {
    throw new Error(
      'package.json no longer exposes verify:snaps:spec-types, which is what ' +
        'typechecks the specs now that the jest transform does not'
    );
  }
});
// Timestamps the operator reads were rendered by slicing the ISO string, which
// shows the UTC text inside it: the activity log stamped every entry nine hours
// from when it happened for the Korean operators this product is built for, and
// slicing an ISO date the same way is off by a whole day either side of
// midnight. The browser knows the operator's offset.
expectCustom('operator-facing timestamps are rendered in local time', (read) => {
  const workspace = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
  const source = read(workspace);
  const code = source
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    })
    .join('\n');

  if (/createdAt\??\.slice\(/.test(code) || /periodStart\.slice\(/.test(code)) {
    throw new Error(
      `${workspace} slices an ISO timestamp for display again; that renders UTC ` +
        'and the operator reads it as local time'
    );
  }
  for (const helper of ['formatLocalDateTime', 'formatLocalDate']) {
    if (!code.includes(helper)) {
      throw new Error(`${workspace} no longer renders timestamps through ${helper}`);
    }
  }
  const shared = 'apps/frontend/src/components/snaps/snaps-workspace.shared.ts';
  const sharedSource = read(shared);
  if (!sharedSource.includes('date.getHours()')) {
    throw new Error(
      `${shared} formatLocalDateTime no longer reads the parts off a Date, so it ` +
        'is back to showing UTC'
    );
  }
});
// Twice now the backend computed something the operator needed and the
// workspace never read it: health.error was stored and never rendered, and the
// analytics report's "이 채널은 제외했습니다" warnings were returned and dropped,
// so a report built from half the channels looked complete. Both were invisible
// because nothing connects "the backend produces this" to "the UI shows it".
//
// This checks that link for the fields that carry a signal. A field may be
// deliberately unused - the Shorts-Maker routes have no UI yet - but then it has
// to be listed here, so the decision is visible instead of assumed.
expectCustom('every signal field the backend produces is read by the workspace', (read) => {
  const backendFiles = [
    'apps/backend/src/api/routes/snaps.controller.ts',
    'libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts',
    'libraries/nestjs-libraries/src/snaps/transform/content-transform.service.ts',
    'libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts',
    'libraries/nestjs-libraries/src/snaps/library/source-library.service.ts',
    'libraries/nestjs-libraries/src/snaps/activity/activity-log.service.ts',
    'libraries/nestjs-libraries/src/snaps/agent/agent-task.service.ts',
    'libraries/nestjs-libraries/src/snaps/rag/vector-store.service.ts',
    'libraries/nestjs-libraries/src/snaps/analytics/report-generator.service.ts',
    'libraries/nestjs-libraries/src/snaps/shorts-maker/shorts-maker-client.service.ts',
  ];
  const frontendFiles = [
    'apps/frontend/src/components/snaps/snaps-workspace.tsx',
    'apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx',
    'apps/frontend/src/components/snaps/snaps-card-news-workspace.tsx',
  ];

  const backend = backendFiles.map((file) => read(file)).join('\n');
  const frontend = frontendFiles.map((file) => read(file)).join('\n');

  // Fields that tell the operator something went differently than asked.
  const signals = [
    'warnings',
    'dropped',
    'skipped',
    'degraded',
    'truncated',
    // Not a warning, but the same failure: the report carried a growth rate
    // from the day trends existed and nothing declared or read it, so every
    // insight said "+600" with no sense of whether that is a lot.
    'deltaRate',
    // The window the numbers cover. Accepted from the request and echoed
    // back for as long as reports existed, filled by nobody and shown
    // nowhere, so every report presented its figures unanchored.
    'periodStart',
  ];

  // Produced, but with no UI to read them: the Shorts-Maker routes are wired on
  // the backend and have no workspace surface yet (docs/snaps-shorts-maker.md).
  const deliberatelyUnused = new Set(['errorCode', 'retryable']);

  const unread = [];
  for (const field of signals) {
    if (deliberatelyUnused.has(field)) {
      continue;
    }
    const produced = new RegExp('^\\s*' + field + '\\s*[:,]', 'm').test(backend);
    if (!produced) {
      continue;
    }
    const consumed = new RegExp('[.?\\[]\\s*[\'"]?' + field + '\\b').test(frontend);
    if (!consumed) {
      unread.push(field);
    }
  }

  if (unread.length) {
    throw new Error(
      `the backend produces ${unread.join(', ')} and no snaps workspace reads ` +
        'it; the operator is not told what the run did differently'
    );
  }
});
// /snaps/report/from-platform-analytics pushes a warning for every channel or
// post whose analytics call failed, and those are left out of the report
// entirely. The response carried the warnings and the workspace never read
// them, so a report built from half the channels - or from none of them - was
// presented exactly like a complete one, and decisions get made from it.
// The route side - that it records what it skipped - is already pinned by an
// expectContains on the warning text further down, and that guard aborts the run
// before this one would see it. Checking it here too would be a branch no
// destructive test could ever reach, so only the half that was unprotected is
// checked: the workspace reading those warnings.
expectCustom('a report that skipped channels says so', (read) => {
  const workspace = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
  const source = read(workspace);
  const handlerAt = source.indexOf("'/snaps/report/from-platform-analytics'");
  if (handlerAt < 0) {
    throw new Error(`${workspace} no longer calls the platform analytics report route`);
  }
  const handler = source.slice(handlerAt, handlerAt + 2000);
  if (!handler.includes('report?.warnings')) {
    throw new Error(
      `${workspace} does not read the warnings the report route returns, so a ` +
        'partial report looks the same as a complete one'
    );
  }
  // The sentence moved into the shared reader, which is also where the engine
  // notice lives - the two used to be in different branches of an `if`, so the
  // report that deserved the most doubt was the one that mentioned neither.
  // Either the handler says it or the reader it hands off to does.
  const shared = read(
    'apps/frontend/src/components/snaps/snaps-workspace.shared.ts'
  );
  const saysSo =
    handler.includes('제외') ||
    (handler.includes('summariseSnapsReportOutcome(') &&
      shared.includes('일부 채널이 제외된 보고서입니다'));
  if (!saysSo) {
    throw new Error(
      `${workspace} does not tell the operator which channels were left out of the ` +
        'report; a partial report looks the same as a complete one'
    );
  }
});
// Render job ownership was inferred from the activity log, which keeps 500
// entries newest-first. A job still rendering could have its record pushed out,
// and /snaps/import evicts the whole log in one call because importEntries
// merges up to 500 imported entries in front. The operator then polled their own
// job and was told it did not exist. Ownership is not activity history.
expectCustom('render job ownership is not read out of the activity log alone', (read) => {
  const controller = 'apps/backend/src/api/routes/snaps.controller.ts';
  const source = read(controller);
  const at = source.indexOf('private async assertRenderJobBelongsToOrg(');
  if (at < 0) {
    throw new Error(`${controller} no longer checks render job ownership`);
  }
  const body = methodBody(source, at, 1600);
  if (!body.includes('renderJobOwners.owns(')) {
    throw new Error(
      `${controller} checks ownership against the activity log only; a job whose ` +
        'entry aged out becomes unpollable by the org that created it'
    );
  }
  // Recording it on both create routes is the other half.
  const recorded = (source.match(/renderJobOwners\.remember\(/g) || []).length;
  if (recorded < 2) {
    throw new Error(
      `${controller} records render job ownership at ${recorded} of its 2 job ` +
        'creation routes'
    );
  }
  const store =
    'libraries/nestjs-libraries/src/snaps/video/render-job-ownership.service.ts';
  const storeSource = read(store);
  if (!storeSource.includes('snapsOrgFileKey(organizationId)')) {
    throw new Error(
      `${store} no longer keys its file by organisation, so one org could read ` +
        "another org's job ids"
    );
  }
});
// The planner turns a model-supplied local publish time into an absolute
// instant, and the offset decides which instant. The workspace sends the
// operator's browser offset; the fallback for callers that omit it read
// `new Date().getTimezoneOffset()`, the offset of whatever host the backend runs
// on. Only the Pixelle service sets TZ in docker-compose.yaml, so on the snaps
// backend that was UTC and a plan reading 14:00 was scheduled nine hours later.
expectCustom('the planner does not schedule in the host timezone', (read) => {
  const file = 'libraries/nestjs-libraries/src/snaps/agent/command-planner.service.ts';
  const source = read(file);
  // The constant moved to its own module when the report export needed it
  // too: it is a product default with two consumers, not a planner detail.
  const home = 'libraries/nestjs-libraries/src/snaps/time/default-timezone.ts';
  if (!read(home).includes('SNAPS_DEFAULT_TIMEZONE_OFFSET_MINUTES = -540')) {
    throw new Error(`${home} no longer states the default publish timezone as KST (-540)`);
  }
  if (!source.includes('SNAPS_DEFAULT_TIMEZONE_OFFSET_MINUTES')) {
    throw new Error(`${file} no longer uses the stated default publish timezone`);
  }
  // Comment lines stripped first: the doc comment on cleanTimezoneOffset names
  // the call it replaced, so matching the raw file made this guard fail on a
  // clean tree - it was reading the explanation, not the code.
  const code = source
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    })
    .join('\n');
  if (code.includes('new Date().getTimezoneOffset()')) {
    throw new Error(
      `${file} reads the host timezone again; where the backend happens to run ` +
        'would decide what time a plan is scheduled for'
    );
  }
});
// /snaps/report/generate hands the request body to the generator, which keeps
// the platform exactly as sent and used it as a key on a plain object literal.
// `all['__proto__']` reads Object.prototype there, which is truthy, so the
// `|| {}` never fired and the next line wrote onto the prototype: one request
// left every plain object in the backend process carrying the metric value for
// the life of the process. The inner map had a quieter version of it - a metric
// key of `constructor` survives the lowercasing metric keys go through, so
// `(Object || 0) + value` concatenated instead of adding.
expectCustom('the report generator groups into null-prototype maps', (read) => {
  const file =
    'libraries/nestjs-libraries/src/snaps/analytics/report-generator.service.ts';
  const source = read(file);
  const at = source.indexOf('private groupMetrics(');
  if (at < 0) {
    throw new Error(`${file} no longer has groupMetrics`);
  }
  // Bounded by the next method rather than by a character count. A fixed 900
  // character window ran past the end of groupMetrics into chartSeries, which
  // builds a null-prototype map of its own, so this counted three and stayed
  // green with one of the two reverted.
  const nextMethod = source.indexOf('\n  private ', at + 1);
  const body = source.slice(at, nextMethod > at ? nextMethod : at + 900);
  const nullMaps = (body.match(/Object\.create\(null\)/g) || []).length;
  if (nullMaps < 2) {
    throw new Error(
      `${file} groupMetrics builds ${nullMaps} of its 2 maps with a null prototype; ` +
        "a caller-supplied platform of '__proto__' then writes onto Object.prototype, " +
        "and a metric key of 'constructor' concatenates instead of adding"
    );
  }
  // The inbox counter is keyed the same way, by a platform that arrived through
  // /snaps/inbox/import.
  const inbox = 'libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts';
  const inboxSource = read(inbox);
  const countAt = inboxSource.indexOf('private countBy<');
  if (countAt < 0) {
    throw new Error(`${inbox} no longer has countBy`);
  }
  if (!methodBody(inboxSource, countAt, 900).includes('Object.create(null)')) {
    throw new Error(
      `${inbox} countBy accumulates into a plain object again; a platform named ` +
        "'__proto__' loses its count silently"
    );
  }
  // The third site: this one normalises the model's own JSON answer, so its
  // keys are whatever the model wrote.
  const recordAt = inboxSource.indexOf('private normalizeNumberRecord(');
  if (recordAt < 0) {
    throw new Error(`${inbox} no longer has normalizeNumberRecord`);
  }
  const recordEnd = inboxSource.indexOf('\n  private ', recordAt + 1);
  const recordBody = inboxSource.slice(
    recordAt,
    recordEnd > recordAt ? recordEnd : recordAt + 900
  );
  if (!recordBody.includes('Object.create(null)')) {
    throw new Error(
      `${inbox} normalizeNumberRecord accumulates into a plain object again; a ` +
        "model answer keyed 'constructor' makes Math.max return NaN and the count " +
        'shows as null'
    );
  }
});
// A promise that never settles does not hold the Node event loop open, so an
// await that hangs did not fail these smokes - it ended them, with every check
// after that point skipped and an exit code of 0. Measured twice: removing the
// analytics timeout made the controller smoke stop at that check and still
// report success, and a hang planted in the services smoke exited 0 having
// printed nothing at all. Each async verifier fails by default now, clears the
// code only when main() reaches its end, and says on the way out that it
// stopped early rather than leaving an empty failing run to explain itself.
const FAIL_BY_DEFAULT_SMOKES = [
  'scripts/verify-snaps-controller.ts',
  'scripts/verify-snaps-services.ts',
  'scripts/verify-snaps-cardnews-deepseek.ts',
  'scripts/verify-snaps-core-deepseek.ts',
  'scripts/verify-snaps-naver-cafe.ts',
  'scripts/verify-snaps-pixelle.ts',
];
for (const smoke of FAIL_BY_DEFAULT_SMOKES) {
  const name = smoke.slice(smoke.lastIndexOf('/') + 1);
  expectCustom(`${name} cannot pass by ending early`, (read) => {
    const source = read(smoke);
    // Before the main() call specifically. The same assignment also appears
    // inside the exit handler below it, so a plain substring search stayed
    // satisfied with the failing default deleted - which is how this check was
    // dead when it was first written.
    const entry = source.indexOf('main().catch(');
    if (entry < 0) {
      throw new Error(`${smoke} no longer has a main() entry point`);
    }
    if (!source.slice(0, entry).includes('process.exitCode = 1;')) {
      throw new Error(
        `${smoke} no longer starts in a failing state, so a check that hangs ` +
          'ends the run quietly and reports a pass'
      );
    }
    if (!source.includes('completed = true;')) {
      throw new Error(`${smoke} no longer records that main() reached its end`);
    }
    if (!source.includes("process.on('exit'")) {
      throw new Error(`${smoke} no longer checks on exit whether it finished`);
    }
    // Without this the exit handler blames a hang for every ordinary failure
    // too, because a thrown assertion also leaves main() short of its end.
    if (!source.includes('failed = true;')) {
      throw new Error(
        `${smoke} no longer separates a real failure from a run that stopped ` +
          'without settling'
      );
    }
  });
}

// A timer that loses a Promise.race stays pending for its full duration and
// holds the Node event loop open that whole time - measured at 3003ms for a
// 3000ms timer that lost to an already-resolved promise. The orchestrator
// health probe raced a 10s timer and never cleared it, so every probe Temporal
// answered normally left ten seconds of held loop behind it and delayed
// shutdown by that much; a store deadlock test did the same, which is what made
// jest report an open handle after a passing run. Both clear the timer now.
expectCustom('every timeout race clears the timer it lost with', (read) => {
  const offenders = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === '.next'
      ) {
        continue;
      }
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) {
        continue;
      }
      const source = read(full);
      let at = source.indexOf('setTimeout(');
      while (at >= 0) {
        // Only timers that exist to end a race. A plain delay has nothing to
        // clear, and a timer whose whole job is to fire is not a leak.
        const head = source.slice(at, at + 200);
        if (head.includes('reject(')) {
          const scope = source.slice(Math.max(0, at - 800), at + 900);
          if (!scope.includes('clearTimeout')) {
            offenders.add(full);
          }
        }
        at = source.indexOf('setTimeout(', at + 1);
      }
    }
  };
  ['apps', 'libraries', 'scripts'].forEach(walk);
  if (offenders.size) {
    throw new Error(
      `${[...offenders].join(', ')} races a rejecting timer without clearing ` +
        'it, so a call that wins the race still holds the event loop open until ' +
        'the timer would have fired'
    );
  }
});

// The analytics loops turn a failing channel into a warning and carry on. A
// provider that accepts the connection and then goes quiet is not a failure
// though - it is a wait, and nothing ended it, so one stalled channel held
// /snaps/report/from-platform-analytics open indefinitely.
expectCustom('one stalled channel cannot hold the analytics report open', (read) => {
  const controller = 'apps/backend/src/api/routes/snaps.controller.ts';
  const source = read(controller);
  const at = source.indexOf("@Post('/report/from-platform-analytics')");
  if (at < 0) {
    throw new Error(`${controller} no longer exposes the platform analytics report`);
  }
  // This route only. A flat window reached into the two routes below it.
  const body = routeBody(source, at);
  const bounded = (body.match(/withAnalyticsTimeout\(/g) || []).length;
  if (bounded < 2) {
    throw new Error(
      `${controller} bounds ${bounded} of its 2 analytics calls; an unresponsive ` +
        'provider then holds the report open with no way out'
    );
  }
});
// /snaps/health runs on every workspace load and fans out to three probes,
// which are already concurrent. Inside the Pixelle one, two requests to the same
// host were awaited in turn, so an unresponsive Pixelle paid both timeouts:
// measured against a socket that accepts and never answers, 6,022ms in sequence
// against 3,524ms together. OllamaClient.health() carries the same fix and the
// same reasoning.
expectCustom('the health probes do not pay their timeouts in sequence', (read) => {
  const controller = 'apps/backend/src/api/routes/snaps.controller.ts';
  const source = read(controller);
  const at = source.indexOf('private async pixelleRuntimeHealth');
  if (at < 0) {
    throw new Error(`${controller} no longer probes the Pixelle runtime`);
  }
  const body = methodBody(source, at);
  if (!body.includes('Promise.all')) {
    throw new Error(
      `${controller} awaits the two Pixelle probes in turn again; an unresponsive ` +
        'Pixelle then adds both timeouts to every workspace load'
    );
  }
  const health = source.indexOf("@Get('/health')");
  if (!routeBody(source, health).includes('Promise.all')) {
    throw new Error(
      `${controller} runs the three top-level health probes in sequence`
    );
  }
  const client = 'libraries/nestjs-libraries/src/snaps/ai/ollama.client.ts';
  if (!read(client).includes('Promise.all')) {
    throw new Error(
      `${client} health no longer runs its embed and chat probes together`
    );
  }
});
// The vector store returns the whole stored record, embedding included, and
// both RAG routes handed it straight to the browser. Measured on five examples
// with a 768-dimension embedding: 78,376 bytes of response where 1,206 carry
// everything the workspace uses, and the store keeps up to 200 examples which
// the workspace lists on every load.
//
// The score that travels with a search hit is also two different things - a
// cosine similarity for an example the query embedding could be compared
// against, a token-overlap fraction for one it could not - and overlap reaches
// exactly 1.00 whenever every query word appears, so a bare number puts a
// keyword match above a closer semantic one in the operator's reading.
expectCustom('the rag routes ship no vectors and name the match basis', (read) => {
  const controller = 'apps/backend/src/api/routes/snaps.controller.ts';
  const source = read(controller);

  if (!source.includes('private withoutEmbedding')) {
    throw new Error(
      `${controller} no longer strips the stored vector before a style example ` +
        'leaves the API'
    );
  }
  for (const [route, label] of [
    ["@Get('/rag/examples')", 'the examples list'],
    ["@Get('/rag/search')", 'the search'],
  ]) {
    const at = source.indexOf(route);
    if (at < 0) {
      throw new Error(`${controller} no longer exposes ${label} route`);
    }
    const nextRoute = source.slice(at + 1).search(/@(?:Get|Post|Put|Patch|Delete)\(/);
    const handler = source.slice(
      at,
      nextRoute < 0 ? source.length : at + 1 + nextRoute
    );
    if (!handler.includes('withoutEmbedding')) {
      throw new Error(
        `${controller} ${label} route returns the stored embedding again; that is ` +
          'about sixty times the payload the workspace uses'
      );
    }
  }

  const searchAt = source.indexOf("@Get('/rag/search')");
  const afterSearch = source.slice(searchAt + 1).search(/@(?:Get|Post|Put|Patch|Delete)\(/);
  const searchHandler = source.slice(
    searchAt,
    afterSearch < 0 ? source.length : searchAt + 1 + afterSearch
  );
  if (!searchHandler.includes('matchedBy')) {
    throw new Error(
      `${controller} search route no longer says which basis produced the score`
    );
  }

  const workspace = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
  const ui = read(workspace);
  if (!ui.includes("matchedBy === 'keyword'") || !ui.includes('키워드 일치')) {
    throw new Error(
      `${workspace} shows the raw score again without saying which basis it came ` +
        'from; 1.00 from keyword overlap reads as better than 0.87 from an embedding'
    );
  }
});
// The style examples a RAG search returns are handed to the model as the tone
// to copy, so their order decides what the transform imitates. Cosine scores and
// token-overlap scores used to be sorted into one list: both land in 0..1 and
// the token score is exactly 1.0 whenever every query word appears, so a
// promotional post with no embedding outranked the semantically near-identical
// embedded example (measured 1.0000 against 0.9994). A store in that mixed state
// is ordinary, because the embedding is stored as undefined whenever the embed
// call fails.
expectCustom('the rag search does not rank two metrics in one list', (read) => {
  const file = 'libraries/nestjs-libraries/src/snaps/rag/vector-store.service.ts';
  const source = read(file);
  const at = source.indexOf('async search(');
  if (at < 0) {
    throw new Error(`${file} no longer exposes search()`);
  }
  const body = methodBody(source, at, 2600);
  if (!body.includes('comparable')) {
    throw new Error(
      `${file} search() no longer separates examples it can compare to the query ` +
        'embedding from the ones it can only score by token overlap; a keyword ' +
        'match then outranks every semantic one'
    );
  }
  if (!/a\.comparable !== b\.comparable/.test(body)) {
    throw new Error(
      `${file} search() sorts on score alone again, so the two metrics share one ranking`
    );
  }

  // Truncating to the shorter vector invents a score for embeddings that came
  // from different models: measured 0.9333 for a 2-component vector against a
  // 6-component query with unrelated content.
  const cosineAt = source.indexOf('private cosine(');
  if (cosineAt < 0) {
    throw new Error(`${file} no longer has a cosine helper`);
  }
  const cosine = methodBody(source, cosineAt);
  if (cosine.includes('Math.min(a.length, b.length)')) {
    throw new Error(
      `${file} cosine() truncates to the shorter vector again; vectors of ` +
        'different lengths come from different models and are not comparable'
    );
  }
  if (!cosine.includes('a.length !== b.length')) {
    throw new Error(
      `${file} cosine() no longer refuses vectors of different lengths`
    );
  }
});
// The lock keyed its queue by store file path and never removed a key, so a
// backend serving many organisations grew that map for the life of the process
// - one entry per organisation per store, released only by a restart. The
// delete has to be conditional: an unconditional one drops the key while a
// later operation is still queued behind it, and the next caller then runs
// concurrently with it, which is the race the lock exists to prevent.
expectCustom('the json file lock releases its queue keys', (read) => {
  const file = 'libraries/nestjs-libraries/src/snaps/storage/json-file-lock.ts';
  const source = read(file);
  if (!source.includes('chains.delete(filePath)')) {
    throw new Error(
      `${file} never removes a queue key; the map grows for the life of the process`
    );
  }
  const at = source.indexOf('chains.delete(filePath)');
  const before = source.slice(Math.max(0, at - 200), at);
  if (!before.includes('chains.get(filePath) === tail')) {
    throw new Error(
      `${file} deletes the queue key unconditionally; a writer arriving while a ` +
        'later operation is still queued would run concurrently with it'
    );
  }
});
// Two things the live DeepSeek run showed. First: the transform badge rendered
// result.provider raw, and result.provider is a path label - 'ollama' means the
// model answered, not that Ollama did - so against DeepSeek the operator read
// "ollama · deepseek-v4-flash" next to a health card reading "DeepSeek".
expectCustom('the transform badge names the engine, not the code path', (read) => {
  const file = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
  const source = read(file);
  if (source.includes('${result.provider} · ${result.model}')) {
    throw new Error(
      `${file} renders result.provider raw again; against DeepSeek that badge ` +
        'reads "ollama · deepseek-v4-flash"'
    );
  }
  if (!source.includes('const engineLabel')) {
    throw new Error(`${file} lost the engineLabel helper the badges read through`);
  }
  const at = source.indexOf('const engineLabel');
  const helper = declarationBody(source, at);
  if (!helper.includes("health?.ollama?.provider === 'deepseek'")) {
    throw new Error(
      `${file} engineLabel no longer derives the name from the health payload, ` +
        'so it can disagree with the health card again'
    );
  }
});

// Second: section 6 of the live script transformed against an empty style store
// and asserted only that the model answered - which every other section already
// does, since useRag only skips retrieval when it is explicitly false. It read
// as RAG coverage and reported ragExamplesUsed: 0. A fixed org id then made it
// pass on every run after the first, because the seeded examples stayed on disk.
expectCustom('the live RAG section proves retrieval reached the prompt', (read) => {
  const file = 'scripts/verify-snaps-core-deepseek.ts';
  const source = read(file);
  const at = source.indexOf('=== 6) transform with RAG enabled');
  if (at < 0) {
    throw new Error(`${file} no longer has the RAG-enabled section`);
  }
  const section = source.slice(at);
  if (!section.includes('rag.addExample(')) {
    throw new Error(
      `${file} section 6 does not seed the style store, so retrieval has nothing ` +
        'to find and the section only repeats section 1'
    );
  }
  // Inside an assert specifically. The same expression is also the withLlmRetry
  // predicate, so matching it anywhere in the section went on passing with the
  // assertion deleted - which is how this half of the guard was dead when it
  // was first written.
  const asserted = section
    .split('assert(')
    .slice(1)
    .some((block) => block.slice(0, 200).includes('ragExamplesUsed.length > 0'));
  if (!asserted) {
    throw new Error(
      `${file} section 6 does not assert that a style example reached the prompt`
    );
  }
  if (!/const ragOrg = `[^`]*\$\{/.test(section)) {
    throw new Error(
      `${file} section 6 uses a fixed org id; the seeded examples persist, so the ` +
        'assertion passes on later runs even with the seeding removed'
    );
  }
});
// The warning panel is what the operator reads when a run produced nothing at
// all, and five of its messages were still English while the other fifteen in
// the same file were Korean. Two nearby ternaries also had arms that were the
// same string, so the branch decided nothing while looking like it handled
// singular and plural - Korean does not mark plural here, which is how they
// ended up identical.
expectCustom('the scheduling warnings are Korean and carry no dead branch', (read) => {
  const file = 'libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts';
  const source = read(file);
  const hangul = /[가-힣]/;
  source.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
      return;
    }
    // A string literal that fills the line, optionally as one arm of a ternary
    // chain - which is where three of the five English messages lived, so a
    // pattern anchored on a bare quote missed them and this half of the guard
    // was dead when it was first written.
    const match = trimmed.match(/^[?:]?\s*'([A-Za-z][^']{25,})',?$/);
    if (match && !hangul.test(match[1])) {
      throw new Error(
        `${file}:${index + 1} shows the operator an English warning: ${match[1].slice(0, 60)}`
      );
    }
  });
  const ternary = /\?\s*'([^'\n]+)'\s*:\s*'([^'\n]+)'/g;
  let found;
  while ((found = ternary.exec(source))) {
    if (found[1] === found[2]) {
      throw new Error(
        `${file} has a ternary whose arms are both '${found[1].slice(0, 40)}'; the ` +
          'branch decides nothing and reads as if it handled a case'
      );
    }
  }
});
// Each store caps what it keeps, and the cap deletes the entries that were
// already there to make room for the ones being restored. Measured: a
// 400-entry backup imported over 300 existing sources left 100 of them, and
// the response was { imported: 400, total: 500 } - a number that reads as a
// clean restore. The count of what was deleted has to travel with every import
// and reach the operator, or the workspace loses data silently.
expectCustom('every workspace import reports what its cap deleted', (read) => {
  const methods = [
    ['libraries/nestjs-libraries/src/snaps/library/source-library.service.ts', 'importSources'],
    ['libraries/nestjs-libraries/src/snaps/library/source-library.service.ts', 'importReports'],
    ['libraries/nestjs-libraries/src/snaps/activity/activity-log.service.ts', 'importEntries'],
    ['libraries/nestjs-libraries/src/snaps/agent/agent-task.service.ts', 'importTasks'],
    ['libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts', 'importStoredItems'],
    // The seventh. It was missed when the other six were fixed, and it is the
    // one /snaps/inbox/import and /snaps/inbox/import-post-comments use.
    ['libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts', 'importItems'],
    ['libraries/nestjs-libraries/src/snaps/rag/vector-store.service.ts', 'importExamples'],
  ];
  for (const [file, method] of methods) {
    const source = read(file);
    const at = source.indexOf('async ' + method + '(');
    if (at < 0) {
      throw new Error(`${file} no longer has ${method}`);
    }
    const body = source.slice(at, at + 2000);
    if (!body.includes('dropped:')) {
      throw new Error(
        `${file} ${method} does not report what its cap deleted; a restore can ` +
          'remove entries the workspace already had and answer with a healthy total'
      );
    }
  }
  // Reporting it from the service is only half of it - the operator reads the
  // toast, not the JSON. The sentence is built in the shared summariser now;
  // the workspace only shows what that returns.
  const summariser = 'apps/frontend/src/components/snaps/snaps-workspace.shared.ts';
  const text = read(summariser);
  if (!text.includes("'dropped'") || !text.includes('보관되지 못했습니다')) {
    throw new Error(
      `${summariser} does not tell the operator that the cap kept entries out; ` +
        'the toast reports only what the backup contributed'
    );
  }
  // and it may not name a cause it cannot know. The sentence used to say
  // existing entries had been deleted, which two of the six stores made false:
  // they cap the incoming list before the merge, so `dropped` also counts
  // entries that arrived and were never stored. Measured, restoring 1,200
  // style examples into an empty workspace said 700 existing entries had been
  // deleted, of a workspace that had none.
  if (/기존 항목[^`]*삭제되었습니다/.test(text)) {
    throw new Error(
      `${summariser} tells the operator that existing entries were deleted, ` +
        'which is false for the entries the incoming cap kept out - and those ' +
        'are counted in the same number'
    );
  }
  const workspace = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
  if (!read(workspace).includes('summariseSnapsWorkspaceImport(payload, imported)')) {
    throw new Error(
      `${workspace} no longer shows what the summariser returns, so the ` +
        'sentence above may never reach the operator'
    );
  }
});
// The same bypass, one field wider. Selecting the deck on
// `body?.deck?.slides?.length` treated the string 'nope' as four slides,
// because a string has a length: it reached renderDeck and came back as a 500
// TypeError. The shape has to be checked before anything is rendered.
expectCustom('a caller-supplied card news deck is shape-checked', (read) => {
  const controller = 'apps/backend/src/api/routes/snaps.controller.ts';
  const source = read(controller);
  const at = source.indexOf("@Post('/card-news/generate')");
  if (at < 0) {
    throw new Error(`${controller} no longer exposes /card-news/generate`);
  }
  const body = routeBody(source, at);
  const renderAt = body.indexOf('renderDeck(');
  if (renderAt < 0) {
    throw new Error(`${controller} /card-news/generate no longer renders a deck`);
  }
  const beforeRender = body.slice(0, renderAt);
  if (body.includes('body?.deck?.slides?.length')) {
    throw new Error(
      `${controller} selects the deck on slides?.length again; a string has a ` +
        'length, so a malformed request reaches the renderer as a 500'
    );
  }
  // The negated form specifically: without it a non-array deck.slides is not
  // rejected but silently ignored, and the route generates a fresh deck from
  // body.request instead - answering 200 with slides the caller never asked
  // for. The plain `Array.isArray(...)` test appears twice more below, so
  // matching that would have gone on passing with this rejection deleted.
  if (!beforeRender.includes('!Array.isArray(suppliedSlides)')) {
    throw new Error(
      `${controller} does not reject a non-array deck.slides; it would quietly ` +
        'render a generated deck instead of the one that was posted'
    );
  }
  if (!beforeRender.includes('typeof slide !== ')) {
    throw new Error(
      `${controller} does not reject a non-object slide; null threw a TypeError ` +
        'and a string rendered a blank slide straight into the media library'
    );
  }
});
// The two vendored services each have a document explaining how they are wired,
// and each gained a contract verifier that enforces part of what those documents
// describe. A reader learning the Shorts-Maker auth bypass from its document
// could not tell whether "이 컨테이너는 ports:에 노출하지 않는다" was a rule or a
// note, and the Pixelle document said nothing about the checks at all - or about
// the fact that its own service publishes an unauthenticated port.
expectCustom('the vendored service docs name the checks that enforce them', (read) => {
  const shortsDoc = read('docs/snaps-shorts-maker.md');
  if (!shortsDoc.includes('verify:snaps:shorts-maker-contract')) {
    throw new Error(
      'docs/snaps-shorts-maker.md does not say that the auth bypass assumptions ' +
        'are enforced, so a reader cannot tell a rule from a remark'
    );
  }
  const pixelleDoc = read('docs/snaps-pixelle-video.md');
  for (const [needle, label] of [
    ['verify:snaps:pixelle-contract', 'the contract verifier'],
    ['prefix=api_config.api_prefix', 'the router prefix hazard'],
    ['ports: - "8000:8000"', 'the published port'],
    ['127.0.0.1:8000:8000', 'the host-only alternative'],
  ]) {
    if (!pixelleDoc.includes(needle)) {
      throw new Error(`docs/snaps-pixelle-video.md no longer documents ${label}`);
    }
  }
});
// docs/snaps-card-news.md is the place someone reads to learn what the model has
// to produce and what the route accepts. Four behaviours were added to the code
// in this area - the own-property templateId resolution, the deck shape check,
// the repeated-sentence removal and the numeric-eyebrow rule - and a reader
// following the document would not have known about any of them.
expectCustom('the card news doc covers the rules the code enforces', (read) => {
  const doc = read('docs/snaps-card-news.md');
  const required = [
    ['__proto__', 'the templateId prototype-key hazard'],
    ['deck.slides', 'the supplied-deck shape check'],
    ['SNAPS_CARD_NEWS_MAX_SLIDES', 'the slide cap'],
    // Narrow on purpose: '말머리' and '반복' each appear several times in the
    // surrounding prose, so a needle that broad would stay satisfied with the
    // rule itself deleted.
    ['숫자면 슬라이드 위치를 따른다', 'the eyebrow numbering rule'],
    ['앞 슬라이드에 나온 문장은 지운다', 'the repeated-sentence rule'],
  ];
  for (const [needle, label] of required) {
    if (!doc.includes(needle)) {
      throw new Error(
        `docs/snaps-card-news.md no longer documents ${label}; the code enforces ` +
          'it and the document is what a caller reads'
      );
    }
  }
});
// A deck posted to /card-news/generate is rendered as supplied - the service's
// allowlist is skipped entirely - so the renderer's own lookup is the only
// thing normalising templateId, and the controller has to report the template
// that was actually drawn rather than the one that was asked for.
expectCustom('a caller-supplied card news templateId is resolved, not trusted', (read) => {
  const renderer = 'libraries/nestjs-libraries/src/snaps/cardnews/card-news-renderer.service.ts';
  const source = read(renderer);
  if (!source.includes('hasOwnProperty.call(CARD_NEWS_TEMPLATE_STYLES')) {
    throw new Error(
      `${renderer} looks up the template style without an own-property check; ` +
        "'__proto__' and 'constructor' answer truthy and skip the editorial fallback"
    );
  }
  const controller = 'apps/backend/src/api/routes/snaps.controller.ts';
  const route = read(controller);
  const at = route.indexOf("@Post('/card-news/generate')");
  if (at < 0) {
    throw new Error(`${controller} no longer exposes /card-news/generate`);
  }
  const body = routeBody(route, at);
  if (!body.includes('resolveSnapsCardNewsTemplateId(')) {
    throw new Error(
      `${controller} returns the caller's templateId unresolved, so the deck and ` +
        'the activity entry can name a template the renderer never drew'
    );
  }
});
// ConnectedIntegration, defaultPublishDate and confirmOperatorAction were
// byte-identical in all three workspaces - the same state the shorts types were
// in right before one of them silently gained fields the others never did.
// defaultPublishDate is the one that would hurt: it subtracts the timezone
// offset so the datetime-local input shows local time, and a copy that lost
// that line would schedule posts hours off without erroring.
expectCustom('the shared workspace helpers have a single definition', () => {
  const shared = 'apps/frontend/src/components/snaps/snaps-workspace.shared.ts';
  const source = read(shared);
  for (const name of [
    'export type ConnectedIntegration',
    'export const defaultPublishDate',
    'export const confirmOperatorAction',
  ]) {
    if (!source.includes(name)) {
      throw new Error(`${shared} no longer has ${name}`);
    }
  }
  if (!source.includes('getTimezoneOffset()')) {
    throw new Error(
      `${shared} dropped the timezone offset; the publish date would be UTC, not local`
    );
  }
  for (const workspace of [
    'apps/frontend/src/components/snaps/snaps-workspace.tsx',
    'apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx',
    'apps/frontend/src/components/snaps/snaps-card-news-workspace.tsx',
  ]) {
    const text = read(workspace);
    if (!text.includes('snaps-workspace.shared')) {
      throw new Error(`${workspace} does not import the shared workspace helpers`);
    }
    for (const name of [
      'type ConnectedIntegration =',
      'const defaultPublishDate =',
      'const confirmOperatorAction =',
    ]) {
      if (text.includes(name)) {
        throw new Error(`${workspace} declares its own ${name} again`);
      }
    }
    // A second name for the same function reads as a stricter confirmation that
    // does something extra. It does not.
    if (text.includes('confirmDestructive')) {
      throw new Error(`${workspace} reintroduced the confirmDestructive alias`);
    }
  }
});
// The inbox summary prompt hands the model the deterministic fallback so it has
// a shape to copy - and, measured against the live DeepSeek API, it copied the
// answer too, echoing the single fallback reply and adding nothing. The rules
// that fixed it must name the sentiment enum and forbid echoing.
expectCustom('the inbox summary prompt asks for more than the fallback', () => {
  const source = read(
    'libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts'
  );
  const start = source.indexOf('            rules: [');
  const end = source.indexOf('            ],', start);
  if (start < 0 || end < 0) {
    throw new Error(
      'libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts no longer ships a rules array in the summary prompt'
    );
  }
  const rules = source
    .slice(start, end)
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  for (const required of ['snapsFeedbackSentiments.join', 'do not copy the fallback']) {
    if (!rules.includes(required)) {
      throw new Error(
        `the snaps inbox summary prompt no longer contains "${required}"; ` +
          'the model falls back to echoing the deterministic summary'
      );
    }
  }
});
// normalizeOllamaPlan keeps whatever boolean the model returns, so
// detectCardNews() only runs when includeCardNews is absent entirely. Without a
// prompt rule the model inferred the field from its name and got 캐러셀 wrong -
// measured against the live DeepSeek API, 캐러셀 returned false. The rule must
// live inside the rules array the prompt actually ships.
expectCustom('the planner prompt tells the model when to set includeCardNews', () => {
  const source = read(
    'libraries/nestjs-libraries/src/snaps/agent/command-planner.service.ts'
  );
  const start = source.indexOf('            rules: [');
  const end = source.indexOf('            ],', start);
  if (start < 0 || end < 0) {
    throw new Error(
      'libraries/nestjs-libraries/src/snaps/agent/command-planner.service.ts no longer declares a rules array'
    );
  }
  const rules = source
    .slice(start, end)
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  if (!rules.includes('includeCardNews')) {
    throw new Error(
      'the snaps planner prompt no longer instructs the model on includeCardNews; ' +
        '캐러셀/carousel commands silently stop producing a deck'
    );
  }
});
// health.ok folds the local embedding model in with the chat provider, so the
// two surfaces that report chat readiness must key on chatModelAvailable.
// Keying them on ok painted a working DeepSeek setup as broken whenever the
// local embedding model was absent.
expectCustom('chat readiness badges do not key on health.ok', () => {
  const surfaces = [
    'apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx',
    'apps/frontend/src/components/snaps/snaps-workspace.tsx',
  ];
  // Counting `chatModelAvailable === false` is too blunt - the workspace file
  // also uses it for a pre-existing "누락" marker - so tie each branch to the
  // class or label it actually produces.
  const branches = [
    {
      path: 'apps/frontend/src/components/snaps/snaps-shorts.shared.ts',
      pattern: /chatModelAvailable === false \? 'bad'/,
      what: 'the shorts LLM badge severity',
    },
    {
      path: 'apps/frontend/src/components/snaps/snaps-workspace.shared.ts',
      pattern: /chatModelAvailable === false\)[\s\S]{0,80}?tone: 'bad'/,
      what: 'the health card severity',
    },
    {
      path: 'apps/frontend/src/components/snaps/snaps-workspace.shared.ts',
      pattern: /chatModelAvailable === false\)[\s\S]{0,80}?'채팅 모델 없음'/,
      what: 'the health card label',
    },
  ];
  for (const branch of branches) {
    if (!branch.pattern.test(read(branch.path))) {
      throw new Error(
        `${branch.path} no longer derives ${branch.what} from chatModelAvailable ` +
          '(health.ok also folds in the local embedding model)'
      );
    }
  }
  // The headline moved into the shared module when it grew a fourth state.
  const headlineFile =
    'apps/frontend/src/components/snaps/snaps-workspace.shared.ts';
  const card = read(headlineFile);
  if (!card.includes('임베딩 없음 · RAG 제한')) {
    throw new Error(
      `${headlineFile} no longer reports the embeddings-missing state separately from a broken chat provider`
    );
  }
  const shorts = read(surfaces[0]);
  if (/health\?\.ollama\?\.ok === false\s*\n\s*\?\s*'bg-red/.test(shorts)) {
    throw new Error(`${surfaces[0]} paints the LLM badge red from health.ok again`);
  }
});
// The provider is switchable at runtime, so neither surface may hardcode the
// engine name next to a model that came from the other provider.
expectCustom('health card names the active AI provider', (read) => {
  const file = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
  const source = read(file);
  const at = source.indexOf("provider === 'deepseek'");
  if (at < 0) {
    throw new Error(`${file} no longer reads the provider off the health payload`);
  }
  const window = source.slice(at, at + 200);
  for (const label of ["'DeepSeek'", "'Ollama'"]) {
    if (!window.includes(label)) {
      throw new Error(
        `${file} health card does not name ${label}; it would show one engine's ` +
          "name next to a model that came from the other provider"
      );
    }
  }
});
// The Ollama tags probe and the DeepSeek probe hit unrelated hosts. Sequential
// awaits made a DeepSeek-only host pay the full local timeout (retried once on
// the IPv4 fallback) before the DeepSeek probe started.
expectContains(
  'libraries/nestjs-libraries/src/snaps/ai/ollama.client.ts',
  'const [embed, chat] = await Promise.all([',
  'deepseek health probes run concurrently'
);
// Now that an all-unsupported selection is a hard 400, a frontend list that
// drifts ahead of the backend allow-list turns into a failed request rather
// than a quiet difference in behaviour, so keep the two lists identical.
expectCustom('frontend and backend platform allow-lists agree', () => {
  const pairs = [
    {
      kind: 'card news',
      backend: {
        path: 'libraries/nestjs-libraries/src/snaps/cardnews/card-news-variant.builder.ts',
        start: 'export const SNAPS_CARD_NEWS_PLATFORMS = [',
      },
      frontend: {
        path: 'apps/frontend/src/components/snaps/snaps-card-news-workspace.tsx',
        start: 'const cardNewsTargetPlatforms = [',
      },
    },
    {
      kind: 'short-form video',
      backend: {
        path: 'libraries/nestjs-libraries/src/snaps/video/video-variant.builder.ts',
        start: 'export const SNAPS_VIDEO_PLATFORMS = [',
      },
      frontend: {
        path: 'apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx',
        start: 'const videoTargetPlatforms = [',
      },
    },
  ];

  const block = (source, start, where) => {
    const from = source.indexOf(start);
    if (from < 0) {
      throw new Error(`${where} no longer declares ${start.trim()}`);
    }
    // Stop at the first `]`, not at `];` - the backend lists close with
    // `] as const;` and one of them sits on a single line, so anchoring on `];`
    // ran past the declaration and swallowed a later array.
    const end = source.indexOf(']', from + start.length);
    if (end < 0) {
      throw new Error(`${where} declaration of ${start.trim()} is unterminated`);
    }
    return source.slice(from + start.length, end);
  };

  for (const pair of pairs) {
    const backend = [
      ...block(read(pair.backend.path), pair.backend.start, pair.backend.path).matchAll(
        /'([a-z-]+)'/g
      ),
    ].map((match) => match[1]);
    const frontend = [
      ...block(read(pair.frontend.path), pair.frontend.start, pair.frontend.path).matchAll(
        /id:\s*'([a-z-]+)'/g
      ),
    ].map((match) => match[1]);

    if (!backend.length || !frontend.length) {
      throw new Error(`${pair.kind} platform allow-list parsed as empty on one side`);
    }
    if (backend.join(',') !== frontend.join(',')) {
      throw new Error(
        `${pair.kind} platform allow-lists disagree: backend [${backend.join(', ')}] ` +
          `vs frontend [${frontend.join(', ')}]`
      );
    }
  }
});
// Three surfaces refuse a platform list snaps cannot serve: the two attach
// routes and the transform normaliser. The threshold was two while there were
// two, and when the transform one arrived it stopped tracking - one of the
// three could then be deleted and this stayed green. A threshold that does not
// follow the count goes slack the moment the count grows.
// Every switch that gates a live, irreversible or paid run has to be in
// .env.example.
//
// Three exist - Pixelle renders, Naver Cafe posts, DeepSeek calls - and the
// file listed two. The missing one was SNAPS_DEEPSEEK_CONFIRM, the only one
// that spends money: an operator reading the file could learn how to gate a
// render and a post, and not how to gate a paid model call. Found by listing
// what the scripts read and subtracting what the file declares, so this does
// the same rather than naming them.
// Every setting the snaps runtime reads has to reach the container.
//
// A variable the code reads and docker-compose never sets falls back to a
// default inside the image, silently - the operator sets it in .env, the
// container never sees it, and the product behaves as though they had not.
// Measured when this was written: 27 snaps settings, all of them set, one
// (SNAPS_DEBUG_TRANSFORM) deliberately commented out. Nothing was wrong; the
// point is to keep it that way as settings are added.
// The snaps Prisma models are a migration target, not a second store.
//
// Every snaps service persists to JSON under SNAPS_DATA_DIR; the three models
// exist so a team that wants Postgres has somewhere to migrate to. The audit
// says so and `verify:snaps:db` keeps the models and the hand-written SQL in
// step - but nothing said what happens if someone starts querying one. That is
// the dangerous direction: the JSON file stays the real store, the table fills
// with a second copy, and the two drift with no error anywhere.
//
// So both directions are pinned. The three documented models must stay
// unqueried, and any new snaps model must be wired or the audit must be
// updated to say why not.
// Nowhere may compare a platform's text against `maxLength` while the rule
// declares a weighted limit.
//
// X counts units, not characters: Hangul weighs two, so a 280 character Korean
// post is 479 to X and is refused at publish. Three places measured text
// against a platform rule - the transform, the card news caption builder and
// the agent readiness row - and converting them one at a time is exactly how
// two of three get done. This looks for the shape instead: a file that reads
// `rule.maxLength` must also handle `weightedLimit`.
// Preflight has to typecheck the suite and the verifiers too.
//
// It typechecks seven projects and did not typecheck tsconfig.snaps-spec.json,
// which owns snaps.core.spec.ts and scripts/verify-snaps-*.ts. Two type errors
// in the controller smoke survived several rounds because of it: the files
// that guard everything else were the ones nothing guarded. Found by running
// `verify:snaps:spec-types` by hand, which is exactly what a preflight is for.
// Every offline verifier has to be reachable from preflight.
//
// A verifier nobody runs is a guard that has quietly stopped guarding, and
// there is no way to notice from inside it. Measured: 30 verify:snaps scripts,
// and the Pixelle and Shorts-Maker contract checks were run by nothing - while
// their three siblings (runtime, DB, platform) were all in preflight. The two
// live DeepSeek smokes stay out on purpose; they cost money and are gated by
// SNAPS_DEEPSEEK_CONFIRM.
// No check may be satisfied by a comment.
//
// Three guards in this file have passed on prose rather than on code: one
// matched its own explanatory comment in the preflight script, one counted a
// `see SNAPS_COMPLAINT_PATTERN` mention while the code had gone back to its own
// regex, and one read past a closing brace into a comment-bearing return. Each
// time the guard looked green while the thing it guards was gone.
//
// This checks the whole expectContains surface at once: every needle that
// exists in its target must still exist with the target's comments stripped.
// Measured when written: 911 needles, none of them prose-only.
// Nothing destructive may run without asking the operator first.
//
// `confirmOperatorAction` exists for this and twelve call sites use it; what
// nothing checked was the other half - whether an action that deletes, or one
// that cannot be taken back, might skip it. Measured across the three
// workspaces: nine calls that delete or publish, seven of them gated, and the
// two that were not are additive imports rather than deletions. That is the
// state this keeps.
expectCustom('every destructive action asks the operator first', (read) => {
  const files = [
    'apps/frontend/src/components/snaps/snaps-workspace.tsx',
    'apps/frontend/src/components/snaps/snaps-card-news-workspace.tsx',
    'apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx',
  ];
  // Routes that add records rather than remove them. An import merges into a
  // capped store and reports what the cap kept out; it is not a delete, and
  // asking before every one would train the operator to click through.
  const additive = new Set([
    '/snaps/inbox/import',
    '/snaps/inbox/import-post-comments',
  ]);

  let checked = 0;
  const ungated = [];
  for (const file of files) {
    const source = read(file);
    const lines = source.split(/\r?\n/);
    const pattern =
      /snapsFetch\(\s*[`'"]([^`'"]+)[`'"]\s*,\s*\{[\s\S]{0,200}?method:\s*'(DELETE|POST)'/g;
    let match;
    while ((match = pattern.exec(source))) {
      const route = match[1];
      const verb = match[2];
      const irreversible =
        verb === 'DELETE' ||
        route.includes('publish-reply') ||
        /\/snaps\/import$/.test(route);
      if (!irreversible || additive.has(route)) {
        continue;
      }
      checked += 1;
      const lineNo = source.slice(0, match.index).split(/\r?\n/).length;
      // Back to the start of the enclosing handler, not a fixed number of
      // lines - a window that runs into the previous function reads its
      // confirmation and calls this one gated.
      let start = lineNo - 1;
      while (
        start > 0 &&
        !/^\s*(const|async function|function)\s+\w+\s*=?\s*(async)?\s*\(/.test(
          lines[start]
        )
      ) {
        start -= 1;
      }
      const handler = lines.slice(start, lineNo).join('\n');
      if (!handler.includes('confirmOperatorAction(')) {
        ungated.push(`${file.split('/').pop()}:${lineNo} ${route}`);
      }
    }
  }

  if (checked < 5) {
    throw new Error(
      `only ${checked} destructive calls were found across the workspaces; ` +
        'the pattern is broken and this guard would pass without checking ' +
        'anything'
    );
  }
  if (ungated.length) {
    throw new Error(
      'these delete or publish without asking the operator first:\n  ' +
        ungated.join('\n  ')
    );
  }
});

expectCustom('no check is satisfied by a comment', (read) => {
  const verifier = read('scripts/verify-snaps-static.mjs');
  const calls = [
    ...verifier.matchAll(
      /expectContains\(\s*'([^']+)'\s*,\s*'([^']*)'/g
    ),
  ];
  if (calls.length < 200) {
    throw new Error(
      `only ${calls.length} expectContains calls were found; the pattern is ` +
        'broken and this guard would pass without checking anything'
    );
  }

  const stripped = new Map();
  const withoutComments = (path) => {
    if (stripped.has(path)) {
      return stripped.get(path);
    }
    let text;
    try {
      text = read(path);
    } catch {
      stripped.set(path, null);
      return null;
    }
    let bare = text;
    if (path.endsWith('.ps1') || path.endsWith('.yaml') || path.endsWith('.yml')) {
      bare = text.replace(/^[^\S\n]*#.*$/gm, '');
    } else if (!path.endsWith('.md') && !path.endsWith('.json')) {
      bare = text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^[^\S\n]*\/\/.*$/gm, '');
    }
    stripped.set(path, { text, bare });
    return stripped.get(path);
  };

  const prose = [];
  let checked = 0;
  for (const [, path, needle] of calls) {
    if (!needle || needle.includes('${')) {
      continue;
    }
    const target = withoutComments(path);
    if (!target || !target.text.includes(needle)) {
      continue;
    }
    checked += 1;
    if (!target.bare.includes(needle)) {
      prose.push(`${path}: ${needle}`);
    }
  }
  if (checked < 200) {
    throw new Error(
      `only ${checked} needles resolved to a readable target; this guard is ` +
        'not seeing the surface it claims to check'
    );
  }
  if (prose.length) {
    throw new Error(
      'these checks are satisfied only by a comment in the file they ' +
        `guard, so the code they describe could be gone:\n  ${prose.join('\n  ')}`
    );
  }
});

expectCustom('every offline verifier is reachable from preflight', (read) => {
  const scripts = JSON.parse(read('package.json')).scripts || {};
  const preflight =
    read('scripts/verify-snaps-preflight.ps1') +
    read('scripts/verify-snaps-final.ps1');

  // Paid, and gated behind a confirmation switch: running these from preflight
  // would spend money on every check.
  const deliberatelyManual = new Set([
    'verify:snaps:cardnews-deepseek',
    'verify:snaps:core-deepseek',
  ]);

  const missing = [];
  let checked = 0;
  for (const [name, command] of Object.entries(scripts)) {
    if (!name.startsWith('verify:snaps') || deliberatelyManual.has(name)) {
      continue;
    }
    const file = /scripts[/\\]([A-Za-z0-9._-]+)/.exec(command);
    if (!file) {
      // An inline command - typechecks and the like. Match on the project or
      // config it names instead.
      const project = /-p\s+([A-Za-z0-9._-]+\.json)/.exec(command);
      if (project && !preflight.includes(project[1])) {
        missing.push(`${name} (${project[1]})`);
      }
      checked += 1;
      continue;
    }
    checked += 1;
    if (!preflight.includes(file[1])) {
      missing.push(`${name} (${file[1]})`);
    }
  }

  if (checked < 20) {
    throw new Error(
      `only ${checked} verifiers were examined; the pattern is broken and this ` +
        'guard would pass without checking anything'
    );
  }
  if (missing.length) {
    throw new Error(
      `nothing routinely runs ${missing.join(', ')} - a verifier nobody runs ` +
        'is a guard that has quietly stopped guarding'
    );
  }
});

expectCustom('preflight typechecks the spec and the verifiers', (read) => {
  const preflight = read('scripts/verify-snaps-preflight.ps1');
  // The argument, not a mention: this guard's own explanatory comment above
  // the step names the file, so `includes` was satisfied by prose - measured,
  // deleting the whole step left it green.
  if (!/"tsconfig\.snaps-spec\.json",/.test(preflight)) {
    throw new Error(
      'scripts/verify-snaps-preflight.ps1 never typechecks ' +
        'tsconfig.snaps-spec.json, so a type error in the jest suite or in a ' +
        'verifier script passes preflight unseen'
    );
  }
  // and the project has to still cover both, or the step checks nothing.
  const project = read('tsconfig.snaps-spec.json');
  for (const covered of ['snaps.core.spec.ts', 'scripts/verify-snaps-']) {
    if (!project.includes(covered)) {
      throw new Error(
        `tsconfig.snaps-spec.json no longer covers ${covered}, so preflight ` +
          'typechecks a project that does not include what it is named for'
      );
    }
  }
});

expectCustom('every platform text budget respects the weighted limit', (read) => {
  // Walked, not listed. The first version of this guard named three files and
  // there were four: publishing-payload.builder.ts reads `rule?.maxLength`
  // with the optional chain, so it matched neither the list nor the pattern -
  // and it is the last thing between a caller-supplied variant and the
  // platform. A named list of sites is the thing this guard exists to replace,
  // and it was one itself.
  const measured = [];
  const collect = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist') {
          collect(full);
        }
      } else if (entry.name.endsWith('.ts') && !entry.name.includes('.spec.')) {
        measured.push(full);
      }
    }
  };
  collect('libraries/nestjs-libraries/src/snaps');
  if (measured.length < 20) {
    throw new Error(
      `only ${measured.length} snaps sources were scanned; the walk is broken ` +
        'and this guard would pass without checking anything'
    );
  }
  let sites = 0;
  for (const file of measured) {
    if (file.endsWith('platform-rules.ts')) {
      continue;
    }
    const source = read(file);
    const uses = (source.match(/rules?\??\.\w*[Mm]axLength/g) || []).length;
    if (!uses) {
      continue;
    }
    sites += uses;
    if (!/rule\??\.weightedLimit/.test(source)) {
      throw new Error(
        `${file} measures text against a platform maxLength and never looks ` +
          'at weightedLimit, so an X post is counted in characters - 280 of ' +
          'them are 479 units to X and it refuses the post at publish'
      );
    }
  }
  if (sites < 4) {
    throw new Error(
      `only ${sites} platform text budget(s) were found; the pattern is broken ` +
        'and this guard would pass without checking anything'
    );
  }
  // and exactly one platform declares one, so the other nine keep counting
  // characters rather than being halved for no reason.
  const rules = read(
    'libraries/nestjs-libraries/src/snaps/transform/platform-rules.ts'
  );
  const declared = (rules.match(/^\s*weightedLimit: \d+,/gm) || []).length;
  if (declared !== 1) {
    throw new Error(
      `${declared} platform rules declare a weighted limit; only X counts ` +
        'units, and giving another platform one would halve every Korean post ' +
        'it publishes'
    );
  }
});

expectCustom('the snaps Prisma models stay a migration target', (read) => {
  const schema = read(
    'libraries/nestjs-libraries/src/database/prisma/schema.prisma'
  );
  const models = [...schema.matchAll(/^model\s+(Snaps\w+)\s*\{/gm)].map(
    (match) => match[1]
  );
  if (models.length < 3) {
    throw new Error(
      `only ${models.length} snaps model(s) were found in the schema; the ` +
        'pattern is broken and this guard would pass without checking anything'
    );
  }

  const searched = [
    'libraries/nestjs-libraries/src/snaps',
    'libraries/nestjs-libraries/src/database/prisma',
    'apps/backend/src/api/routes/snaps.controller.ts',
  ];
  const sources = [];
  const collect = (entry) => {
    if (entry.endsWith('.ts')) {
      sources.push(entry);
      return;
    }
    for (const child of readdirSync(entry, { withFileTypes: true })) {
      const full = `${entry}/${child.name}`;
      if (child.isDirectory()) {
        if (child.name !== 'node_modules' && child.name !== 'dist') {
          collect(full);
        }
      } else if (child.name.endsWith('.ts') && !child.name.includes('.spec.')) {
        sources.push(full);
      }
    }
  };
  searched.forEach(collect);

  const audit = read('docs/snaps-completion-audit.md');
  for (const model of models) {
    const camel = model[0].toLowerCase() + model.slice(1);
    const call = new RegExp(
      `\\b${camel}\\.(findMany|findFirst|findUnique|create|createMany|update|` +
        `updateMany|upsert|delete|deleteMany|count|aggregate|groupBy)\\b`
    );
    const queried = sources.some((file) => call.test(read(file)));
    const documented = audit.includes(model);
    if (queried) {
      throw new Error(
        `${model} is queried through the Prisma client, but every snaps ` +
          'service persists to JSON under SNAPS_DATA_DIR - the table would ' +
          'hold a second copy of the same records and the two would drift ' +
          'with nothing to report it. Move the whole store or neither.'
      );
    }
    if (!documented) {
      throw new Error(
        `${model} is in the schema, is queried by nothing, and the completion ` +
          'audit does not mention it - so it is a table that gets created and ' +
          'never filled, with no record of why'
      );
    }
  }
});

expectCustom('the container receives every setting the runtime reads', (read, _label, walk) => {
  void walk;
  const readdir = readdirSync;
  const sources = [];
  const collect = (dir) => {
    for (const entry of readdir(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist') {
          collect(full);
        }
      } else if (entry.name.endsWith('.ts') && !entry.name.includes('.spec.')) {
        sources.push(full);
      }
    }
  };
  collect('libraries/nestjs-libraries/src/snaps');
  sources.push('apps/backend/src/api/routes/snaps.controller.ts');
  if (sources.length < 20) {
    throw new Error(
      `only ${sources.length} snaps sources were scanned for settings; the ` +
        'walk is broken and this guard would pass without checking anything'
    );
  }

  const wanted = new Set();
  for (const file of sources) {
    for (const [, name] of read(file).matchAll(
      /process\.env\.(SNAPS_[A-Z0-9_]*|PIXELLE_[A-Z0-9_]*|SHORTS_MAKER_[A-Z0-9_]*|OLLAMA_[A-Z0-9_]*|DEEPSEEK_[A-Z0-9_]*|AI_PROVIDER)/g
    )) {
      wanted.add(name);
    }
  }
  if (wanted.size < 15) {
    throw new Error(
      `only ${wanted.size} snaps settings were found in the runtime; the ` +
        'pattern is broken and this guard would pass without checking anything'
    );
  }

  const compose = read('docker-compose.yaml');
  const start = compose.indexOf('  snaps:');
  const end = compose.indexOf('  snaps-pixelle-video:');
  if (start < 0 || end < start) {
    throw new Error(
      'docker-compose.yaml no longer has a snaps service before ' +
        'snaps-pixelle-video, so this guard cannot find the app environment'
    );
  }
  const block = compose.slice(start, end);
  // A commented key counts: it is a decision written down, not an omission.
  const missing = [...wanted].filter(
    (name) => !new RegExp(`^      #?\\s*${name}:`, 'm').test(block)
  );
  if (missing.length) {
    throw new Error(
      `docker-compose.yaml never sets ${missing.join(', ')} for the snaps ` +
        'service, so the container falls back to a default and an operator ' +
        'who sets it sees nothing happen'
    );
  }
});

expectCustom('every confirmation switch is in .env.example', (read) => {
  // Every script, not four named ones: a new live smoke with a new switch is
  // exactly the case a named list misses, and the list is what a new script
  // author never thinks to edit.
  const scripts = readdirSync('scripts', { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|mjs)$/.test(entry.name))
    .map((entry) => `scripts/${entry.name}`);
  const switches = new Set();
  for (const script of scripts) {
    for (const [, name] of read(script).matchAll(
      /process\.env\.(SNAPS_[A-Z0-9_]*CONFIRM)/g
    )) {
      switches.add(name);
    }
  }
  if (switches.size < 3) {
    throw new Error(
      `only ${switches.size} confirmation switch(es) were found across the live ` +
        'smokes; the pattern is broken and this guard would pass without ' +
        'checking anything'
    );
  }
  const example = read('.env.example');
  // The other direction, which is the one that went wrong. A switch documented
  // here and read by nothing is worse than an undocumented one: the operator
  // sets it, sees no error, and believes the thing is gated.
  // SNAPS_INBOX_CLEAR_CONFIRM sat here for that reason - the inbox clear it
  // named runs in the services smoke against a temp data dir and a fixed
  // `smoke-org`, so there was nothing for it to gate and nothing read it.
  const gatesNothing = [
    ...example.matchAll(/^#?\s*(SNAPS_[A-Z0-9_]*CONFIRM)=/gm),
  ]
    .map(([, name]) => name)
    .filter((name) => !switches.has(name));
  if (gatesNothing.length) {
    throw new Error(
      `.env.example documents ${gatesNothing.join(', ')} as a confirmation ` +
        'switch, and no script reads it; an operator who sets it is told ' +
        'nothing and gets no gate'
    );
  }
  const undocumented = [...switches].filter(
    (name) => !example.includes(name)
  );
  if (undocumented.length) {
    throw new Error(
      `.env.example does not mention ${undocumented.join(', ')}, so an ` +
        'operator cannot learn what gates that live run - and one of these ' +
        'spends money per call'
    );
  }
});

expectCustom('every platform selection is asserted against what snaps serves', () => {
  const file = 'apps/backend/src/api/routes/snaps.controller.ts';
  const source = read(file);
  const calls = (source.match(/this\.assertSupportedPlatforms\(/g) || []).length;
  if (calls < 3) {
    throw new Error(
      `${file} calls assertSupportedPlatforms ${calls} time(s); ` +
        '/video/attach-to-draft, /card-news/attach-to-draft and the transform ' +
        'normaliser must each guard it - asking only for platforms snaps does ' +
        'not support used to answer with channels nobody had named'
    );
  }
});
// A caller-supplied deck bypasses the service's own slide cap, and each slide
// costs a PNG render plus a media-library upload, so the controller enforces it.
expectContains(
  'apps/backend/src/api/routes/snaps.controller.ts',
  'suppliedSlides.length > SNAPS_CARD_NEWS_MAX_SLIDES',
  'card news slide cap on caller-supplied decks'
);
// The agent must be able to actually build a deck, not just suggest one.
expectContains(
  'libraries/nestjs-libraries/src/snaps/agent/command-planner.service.ts',
  'includeCardNews'
);
expectContains(
  'libraries/nestjs-libraries/src/snaps/agent/command-planner.service.ts',
  'detectCardNews'
);


expectContains('libraries/nestjs-libraries/src/snaps/transform/platform-rules.ts', "'kakao-talk'");
expectContains('libraries/nestjs-libraries/src/snaps/transform/platform-rules.ts', "'xiaohongshu'");
expectContains('libraries/nestjs-libraries/src/snaps/library/source-library.service.ts', 'importSources');
expectContains('libraries/nestjs-libraries/src/snaps/library/source-library.service.ts', 'importReports');
expectContains('libraries/nestjs-libraries/src/snaps/library/source-library.service.ts', "'print-html'");
expectContains('libraries/nestjs-libraries/src/snaps/library/source-library.service.ts', 'reportToPrintHtml');
// The export headings follow the language of the report body, which is
// Korean. They were English while everything under them was Korean.
expectContains('libraries/nestjs-libraries/src/snaps/library/source-library.service.ts', '## 수집 경고');
expectContains('libraries/nestjs-libraries/src/snaps/library/source-library.service.ts', 'atomicWrite');
expectContains('libraries/nestjs-libraries/src/snaps/library/source-library.service.ts', 'normalizeStoredSource');
expectContains('libraries/nestjs-libraries/src/snaps/library/source-library.service.ts', 'normalizeStoredReport');
expectContains('libraries/nestjs-libraries/src/snaps/library/source-library.service.ts', 'sourceText는 최소 5자 이상의 문자열');
expectContains('libraries/nestjs-libraries/src/snaps/library/source-library.service.ts', 'cleanTags');
expectContains('libraries/nestjs-libraries/src/snaps/library/source-library.service.ts', 'cleanMetricValue');
expectContains('libraries/nestjs-libraries/src/snaps/library/source-library.service.ts', 'cleanRecord');
expectNotContains('libraries/nestjs-libraries/src/snaps/library/source-library.service.ts', 'const report: any', 'untyped report markdown export');
expectContains('libraries/nestjs-libraries/src/snaps/rag/vector-store.service.ts', 'importExamples');
expectContains('libraries/nestjs-libraries/src/snaps/rag/vector-store.service.ts', 'replaceExamples');
expectContains('libraries/nestjs-libraries/src/snaps/rag/vector-store.service.ts', 'atomicWrite');
expectContains('libraries/nestjs-libraries/src/snaps/rag/vector-store.service.ts', '!Array.isArray(parsed)');
expectContains('libraries/nestjs-libraries/src/snaps/rag/vector-store.service.ts', 'MAX_STYLE_EXAMPLES = 500');
expectContains('libraries/nestjs-libraries/src/snaps/rag/vector-store.service.ts', 'normalizeTopK');
// Keyed on a non-finite value being filtered out of an embedding, not on the
// name of the callback parameter: this pinned `Number.isFinite(value)` and
// failed when the filter moved into cleanEmbedding() with `item`.
expectContains(
  'libraries/nestjs-libraries/src/snaps/rag/vector-store.service.ts',
  'Number.isFinite(item)',
  'a non-finite value is kept out of a stored embedding'
);
expectContains('libraries/nestjs-libraries/src/snaps/rag/vector-store.service.ts', "BadRequestException('유효한 platform과 content가 필요합니다.')");
expectContains('libraries/nestjs-libraries/src/snaps/rag/rag.service.ts', 'normalizeEmbedding');
expectContains('libraries/nestjs-libraries/src/snaps/rag/rag.service.ts', 'normalizeExample');
expectContains('libraries/nestjs-libraries/src/snaps/rag/rag.service.ts', "BadRequestException('content는 최소 5자 이상이어야 합니다.')");
expectContains('libraries/nestjs-libraries/src/snaps/ai/ollama.client.ts', 'normalizeEmbeddings');
expectContains('libraries/nestjs-libraries/src/snaps/rag/rag.service.ts', 'rebuildEmbeddings');
expectContains('libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts', 'buildSnapsPublishingPayload');
expectContains('libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts', '예약할 수 있는 연결된 채널이 전달되지 않았습니다.');
expectContains('libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts', "input.scheduleType === 'schedule' ? 'schedule' : 'draft'");
expectContains('libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts', '예약(schedule)으로 만들려면 publishDate가 필요합니다.');
expectContains('libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts', 'cleanPublishDate');
expectContains('libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts', 'prepareSchedulableVariant');
expectContains('libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts', '예약에는 clubId와 menuId 설정이 필요합니다');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'buildSnapsPublishingPayload');
expectContains('libraries/nestjs-libraries/src/snaps/video/video-variant.builder.ts', 'buildSnapsVideoVariants');
expectContains('libraries/nestjs-libraries/src/snaps/video/video-variant.builder.ts', 'normalizeVideoPlatforms');
// This used to require post_type: 'reel', which InstagramDto rejects - the
// guard locked in the same misunderstanding the code and the smoke test had.
// The product publishes Reels as a feed post; 'post' is the accepted value.
expectContains(
  'libraries/nestjs-libraries/src/snaps/video/video-variant.builder.ts',
  "post_type: 'post'",
  'instagram video variants use an accepted post_type'
);
expectContains('libraries/nestjs-libraries/src/snaps/video/video-variant.builder.ts', 'function cleanString');
expectContains('apps/backend/src/api/routes/snaps.controller.ts', 'buildSnapsVideoVariants');
expectContains('libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts', 'importStoredItems');
expectContains('libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts', 'deleteItem');
expectContains('libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts', 'clearItems');
expectContains('libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts', 'Array.isArray(body?.items)');
expectContains('libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts', 'normalizeItem');
expectContains('libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts', 'normalizeStoredItem');
expectContains('libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts', 'normalizeSummary');
expectContains('libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts', 'MAX_FEEDBACK_ITEMS = 1000');
expectContains('libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts', 'cleanOptionalText');
expectContains('libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts', 'normalizeReplySuggestions');
expectContains('libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts', 'normalizeSentiment');
expectContains('libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts', 'praise: 0');
expectContains('libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts', 'complaint: 0');
expectContains('libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts', 'atomicWrite');
expectContains('libraries/nestjs-libraries/src/snaps/dto/feedback-inbox.dto.ts', 'snapsFeedbackSentimentInputs');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', "praise: '칭찬'");
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', "complaint: '불만'");
expectContains('libraries/nestjs-libraries/src/snaps/activity/activity-log.service.ts', 'atomicWrite');
expectContains('libraries/nestjs-libraries/src/snaps/activity/activity-log.service.ts', 'normalizeImportedEntry');
expectContains('libraries/nestjs-libraries/src/integrations/social/naver-cafe.provider.ts', "identifier = 'naver-cafe'");
expectContains('libraries/nestjs-libraries/src/integrations/social/naver-cafe.provider.ts', 'codeVerifier: state');
expectContains('libraries/nestjs-libraries/src/integrations/social/naver-cafe.provider.ts', 'override handleErrors');
expectContains('libraries/nestjs-libraries/src/integrations/social/naver-cafe.provider.ts', 'Naver Cafe post did not return article information');
expectContains('libraries/nestjs-libraries/src/integrations/social/naver-cafe.provider.ts', 'Integration');
expectContains('libraries/nestjs-libraries/src/integrations/social/naver-cafe.provider.ts', 'readNaverJson');
expectContains('libraries/nestjs-libraries/src/integrations/social/naver-cafe.provider.ts', 'naverFailure');
expectNotContains('libraries/nestjs-libraries/src/integrations/social/naver-cafe.provider.ts', '_integration: any', 'untyped Naver Cafe integration parameter');
expectContains('apps/frontend/src/components/new-launch/providers/naver-cafe/naver-cafe.provider.tsx', 'Category (optional)');

expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'snaps 스튜디오');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'type SnapsHealth');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'type SnapsReportResult');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'warnings?: string[]');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '수집 경고');
// The shorts types moved into the module both workspaces import - the two
// copies had already drifted, the shorts one carrying progress fields the main
// one never gained. The workspace still has to use the type, which its own
// typecheck enforces; here we check the shared definition exists.
expectContains(
  'apps/frontend/src/components/snaps/snaps-shorts.shared.ts',
  'export type SnapsVideoResult',
  'the shared shorts result type'
);
expectContains(
  'apps/frontend/src/components/snaps/snaps-workspace.tsx',
  'SnapsVideoResult',
  'the main workspace still uses the shorts result type'
);
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'type SnapsFeedbackView');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '보고서 metrics JSON은 배열이어야 합니다.');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '피드백 JSON은 배열이거나 items 배열을 포함해야 합니다.');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'const snapsFetch');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'useFetch()');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'withSnapsJsonHeaders(init)');
// The JSON header helper moved out of the workspace into the shared module all
// three of them import; the workspace still has to route its requests through
// it, which the assertion above checks.
expectContains(
  'apps/frontend/src/components/snaps/snaps-fetch.helpers.ts',
  "'Content-Type', 'application/json'",
  'the shared snaps fetch helper sets a JSON content type'
);
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'readSnapsError(response)');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'confirmOperatorAction');
// The health headline moved into the shared module when it grew a fourth
// state; the strings moved with it.
expectContains('apps/frontend/src/components/snaps/snaps-workspace.shared.ts', '모델 준비됨');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '임베딩 모델');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'embedModelAvailable');
expectNotContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'throw new Error(await response.text())', 'raw snaps response error throws');
expectNotContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', "fetch('/snaps", 'raw snaps fetch calls');
expectNotContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'fetch("/snaps', 'raw snaps fetch calls');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'sourceTopic');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '주제 / 캠페인');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '/snaps/health');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '/snaps/export');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '/snaps/import');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'copyWorkspaceExport');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'importWorkspaceBackup');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'snaps 워크스페이스 백업을 가져와 현재 조직의 원문, RAG, 보고서, 받은 반응함, 작업 기록에 병합할까요?');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'fillDemoWorkspaceImport');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'snapsDemoWorkspace');
expectContains('apps/frontend/src/components/snaps/snaps-demo-workspace.ts', 'docs/snaps-demo-workspace.json');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '네이버 카페');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '규칙 대체');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '/snaps/activity');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '작업 기록');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '수동 게시 체크리스트');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '/snaps/schedule-variants');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'scheduleType');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'publishDate');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '예약 생성');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '연결된 채널 ${integrationsToUse.length}개에 snaps 예약 게시물을 만들까요?');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'deleteStyleExample');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'confirmOperatorAction');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '저장 원문 "${selectedSource?.title || activeSourceId}"을 삭제할까요?');
expectCustom('style example delete confirm', (read) => {
  const file = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
  const source = read(file);
  const at = source.indexOf('RAG 스타일 예시 "');
  if (at < 0) {
    throw new Error(`${file} no longer asks before deleting: style example delete confirm`);
  }
  const window = source.slice(at, at + 220);
  for (const part of ['exampleId', '를 삭제할까요?']) {
    if (!window.includes(part)) {
      throw new Error(
        `${file} style example delete confirm lost ${part}; the operator would be asked 
          about the wrong item, or not asked at all`
      );
    }
  }
});
expectCustom('report delete confirm', (read) => {
  const file = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
  const source = read(file);
  const at = source.indexOf('보고서 "');
  if (at < 0) {
    throw new Error(`${file} no longer asks before deleting: report delete confirm`);
  }
  const window = source.slice(at, at + 220);
  for (const part of ['activeReportId', '를 삭제할까요?']) {
    if (!window.includes(part)) {
      throw new Error(
        `${file} report delete confirm lost ${part}; the operator would be asked 
          about the wrong item, or not asked at all`
      );
    }
  }
});
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '저장된 snaps 받은 반응함 피드백을 모두 비울까요?');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '/snaps/rag/rebuild');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'RAG 임베딩 재생성');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '/snaps/source-library');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'deleteActiveSource');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'promoteSourceToRag');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'RAG 승격');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'deleteActiveReport');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'promoteReportToRag');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'RAG 저장');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '/export?format=');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', "copyReportExport('print-html')");
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'PDF HTML');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'reportChartEntries');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '지표 대시보드');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '다음 실행 항목');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '/snaps/inbox/import-post-comments');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '/snaps/inbox/reply-draft');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '/snaps/inbox/reply-capabilities');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '/snaps/inbox/publish-reply');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '댓글 가져오기');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'clearFeedbackInbox');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '저장된 받은 반응함 피드백');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '답글 저장');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '플랫폼 게시');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '답글을 실제 게시할까요?');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'replyIntegrationOptions');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'feedbackSentimentLabels');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'feedbackSentimentEntries');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'conversionSignals');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'AiToEarn식 운영맵');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '고전환 신호');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '에이전트 작업 히스토리');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'platformReadiness');
expectContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', '협업');
expectNotContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'any[]', 'untyped snaps workspace arrays');
expectNotContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', ': any', 'untyped snaps workspace callback parameters');
expectNotContains('apps/frontend/src/components/snaps/snaps-workspace.tsx', 'as any', 'snaps workspace any-casts');
// The transport, error-handling and typing rules above were only enforced on
// snaps-workspace.tsx. The shorts and card news workspaces followed them by
// convention alone - both are clean today, with no raw fetch, no raw text
// throw and no any-casts - so hold them to the same guards before that drifts.
// Negative guards also survive a half-revert that the matching presence guards
// do not: `snapsFetch(` appears many times in each file, so removing one call
// leaves the presence guard matching, while a single raw fetch trips these.
for (const workspace of [
  'apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx',
  'apps/frontend/src/components/snaps/snaps-card-news-workspace.tsx',
]) {
  expectNotContains(
    workspace,
    'throw new Error(await response.text())',
    `raw snaps response error throws in ${workspace}`
  );
  expectNotContains(workspace, "fetch('/snaps", `raw snaps fetch calls in ${workspace}`);
  expectNotContains(workspace, 'fetch("/snaps', `raw snaps fetch calls in ${workspace}`);
  expectNotContains(workspace, ': any', `untyped callback parameters in ${workspace}`);
  expectNotContains(workspace, 'as any', `any-casts in ${workspace}`);
  expectContains(workspace, 'snapsFetch(', `shared snaps transport in ${workspace}`);
  expectContains(workspace, 'readSnapsError(', `shared snaps error reader in ${workspace}`);
}
expectContains('apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx', '/snaps/video/attach-to-draft');
expectContains('apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx', '예약 게시물에 첨부');
expectContains('apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx', 'saveVideoToMediaLibrary');
expectContains('apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx', '로컬 Pixelle 엔진에 쇼츠 생성 작업을 요청할까요?');
expectContains('apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx', '연결된 쇼츠 채널 ${connectedTargetPlatforms.length}개에 예약 게시물을 만들까요?');
expectContains('apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx', '핵심 요약');
expectContains('apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx', '업로드 메타데이터');
expectContains('apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx', 'pixellePrompt');
expectContains('apps/frontend/src/components/launches/launches.component.tsx', 'SnapsLaunchButton');
expectContains('apps/frontend/src/components/layout/top.menu.tsx', '/snaps');
expectContains('apps/frontend/src/components/layout/local.font.ts', 'font-snaps-sans');
expectContains('apps/frontend/src/app/global.scss', '.font-snaps-sans');
expectNotContains('apps/frontend/src/components/new-layout/layout.component.tsx', 'next/font/google');
expectNotContains('apps/frontend/src/app/(app)/layout.tsx', 'next/font/google');
expectNotContains('apps/frontend/src/app/(provider)/layout.tsx', 'next/font/google');
expectNotContains('apps/frontend/src/app/(extension)/layout.tsx', 'next/font/google');
expectNotContains('apps/frontend/src/components/new-layout/layout.component.tsx', 'Plus_Jakarta_Sans');
expectNotContains('apps/frontend/src/app/(app)/layout.tsx', 'Plus_Jakarta_Sans');
expectNotContains('apps/frontend/src/app/(provider)/layout.tsx', 'Plus_Jakarta_Sans');
expectNotContains('apps/frontend/src/app/(extension)/layout.tsx', 'Plus_Jakarta_Sans');

expectContains('docker-compose.yaml', 'image: snaps-app:local');
expectContains('docker-compose.yaml', 'OLLAMA_BASE_URL');
expectContains('docker-compose.yaml', 'OLLAMA_DISABLE_THINKING');
expectContains('.env.example', 'DATABASE_URL="postgresql://snaps-user:snaps-password@localhost:5432/snaps-db-local"');
expectContains('.env.example', 'REDIS_URL="redis://localhost:6379"');
expectContains('.env.example', 'TEMPORAL_ADDRESS="localhost:7233"');
expectContains('.env.example', '# SNAPS_PIXELLE_CONFIRM="generate"');
expectContains('.env.example', '# NAVER_CAFE_ACCESS_TOKEN=""');
expectContains('.env.example', '# SNAPS_NAVER_CAFE_CONFIRM="post"');
expectContains('scripts/verify-snaps-preflight.ps1', 'postgresql://snaps-user:snaps-password@localhost:5432/snaps-db-local');
expectContains('scripts/verify-snaps-env.mjs', 'SNAPS_PIXELLE_CONFIRM');
expectContains('scripts/verify-snaps-env.mjs', 'NAVER_CAFE_ACCESS_TOKEN');
expectContains('scripts/verify-snaps-env.mjs', 'NAVER_CLIENT_ID');
expectContains('scripts/verify-snaps-env.mjs', "PIXELLE_VIDEO_URL: 'http://snaps-pixelle-video:8000'");
expectContains('scripts/verify-snaps-env.mjs', "SHORTS_MAKER_URL: 'http://snaps-shorts-maker:4100'");
expectContains('scripts/verify-snaps-env.mjs', '.env.example REDIS_URL');
expectContains('scripts/verify-snaps-env.mjs', '.env.example TEMPORAL_ADDRESS');
expectContains('scripts/verify-snaps-env.mjs', 'docker-compose.yaml REDIS_URL');
expectContains('scripts/verify-snaps-env.mjs', 'docker-compose.yaml TEMPORAL_ADDRESS');
expectContains('scripts/verify-snaps-env.mjs', 'verify-snaps-env-ok');
expectContains('scripts/verify-snaps-env.mjs', 'docker-compose.dev.yaml Postgres credentials');
expectContains('scripts/verify-snaps-env.mjs', 'Ollama model names differ');
expectContains('scripts/verify-snaps-env.mjs', 'OLLAMA_DISABLE_THINKING=true');
expectContains('scripts/verify-snaps-env.mjs', 'localhost:4200');
expectContains('scripts/verify-snaps-env.mjs', 'localhost:3000');
expectContains('scripts/verify-snaps-env.mjs', 'localhost:4007');
expectContains('scripts/verify-snaps-env.mjs', '4007:5000');
expectContains('scripts/verify-snaps-audit.mjs', 'verify-snaps-audit-ok');
expectContains('scripts/verify-snaps-audit.mjs', 'requiredOpenGates');
expectContains('scripts/verify-snaps-audit.mjs', 'openGateBullets.length');
expectContains('scripts/verify-snaps-audit.mjs', 'runtime test coverage beyond the current focused snaps Jest and service smoke coverage');
expectContains('scripts/verify-snaps-audit.mjs', 'server-mediated embedding request');
expectContains('scripts/verify-snaps-audit.mjs', 'The goal is not fully achieved');
// These two used to be pinned as literals in a hand-written list inside the
// audit verifier. The list went stale - three verification commands existed
// that it never required, so the completion audit never mentioned the live
// DeepSeek runs - and it is derived from package.json now. What matters is
// that the derivation still covers every command and still checks both
// documents.
expectCustom('the audit verifier derives its command list', (read) => {
  const file = 'scripts/verify-snaps-audit.mjs';
  const source = read(file);
  if (!source.includes('Object.keys(packageJson.scripts')) {
    throw new Error(
      `${file} hand-lists the verification commands again; the last such list ` +
        'left three of them undocumented'
    );
  }
  for (const target of ['readme, scriptName', 'audit, scriptName']) {
    if (!source.includes(target)) {
      throw new Error(
        `${file} no longer checks every verification command against ${target.split(',')[0]}`
      );
    }
  }
});
expectContains('scripts/verify-snaps-api-contract.mjs', 'verify-snaps-api-contract-ok');
expectContains('scripts/verify-snaps-api-contract.mjs', 'extractControllerRoutes');
expectContains('scripts/verify-snaps-api-contract.mjs', 'extractReadmeRoutes');
expectContains('scripts/verify-snaps-api-contract.mjs', 'extractFrontendPaths');
expectContains('scripts/verify-snaps-api-contract.mjs', "@Controller(['/snaps', '/api/snaps'])");
expectContains('scripts/verify-snaps-db-contract.mjs', 'verify-snaps-db-contract-ok');
expectContains('scripts/verify-snaps-db-contract.mjs', 'modelBlock');
expectContains('scripts/verify-snaps-db-contract.mjs', 'tableBlock');
expectContains('scripts/verify-snaps-db-contract.mjs', 'snaps_touch_updated_at');
expectContains('scripts/verify-snaps-db-contract.mjs', 'foreignKeys');
expectContains('scripts/verify-snaps-platform-contract.mjs', 'verify-snaps-platform-contract-ok');
expectContains('scripts/verify-snaps-platform-contract.mjs', 'frontend targetPlatforms vs backend snapsTargetPlatforms');
expectContains('scripts/verify-snaps-platform-contract.mjs', 'assist-only platform set');
expectContains('scripts/verify-snaps-platform-contract.mjs', 'video platform');
expectContains('scripts/verify-snaps-provider-contract.mjs', 'verify-snaps-provider-contract-ok');
expectContains('scripts/verify-snaps-provider-contract.mjs', 'provider=naver-cafe');
expectContains('scripts/verify-snaps-provider-contract.mjs', 'Naver Cafe provider identifier');
expectContains('scripts/verify-snaps-provider-contract.mjs', 'Naver Cafe frontend provider identifier');
expectContains('scripts/verify-snaps-provider-contract.mjs', 'Naver Cafe SVG icon path');
expectContains('scripts/verify-snaps-provider-contract.mjs', 'Naver Cafe schedule __type');
expectContains('scripts/verify-snaps-provider-contract.mjs', 'SNAPS_NAVER_CAFE_CONFIRM');
expectContains('scripts/verify-snaps-demo-workspace.mjs', 'verify-snaps-demo-ok');
expectContains('scripts/verify-snaps-demo-workspace.mjs', 'docs/snaps-demo-workspace.json');
expectContains('scripts/verify-snaps-demo-workspace.mjs', 'workspace-demo');
expectContains('scripts/verify-snaps-naver-cafe.ts', 'verify-snaps-naver-cafe-dry-run-ok');
expectContains('scripts/verify-snaps-naver-cafe.ts', 'verify-snaps-naver-cafe-ok');
expectContains('scripts/verify-snaps-naver-cafe.ts', 'SNAPS_NAVER_CAFE_CONFIRM');
expectContains('scripts/verify-snaps-naver-cafe.ts', 'NAVER_CAFE_ACCESS_TOKEN');
expectContains('scripts/verify-snaps-naver-cafe.ts', 'NaverCafeProvider');
expectContains('scripts/verify-snaps-pixelle.ts', 'verify-snaps-pixelle-dry-run-ok');
expectContains('scripts/verify-snaps-pixelle.ts', 'verify-snaps-pixelle-ok');
expectContains('scripts/verify-snaps-pixelle.ts', 'SNAPS_PIXELLE_CONFIRM');
expectContains('scripts/verify-snaps-pixelle.ts', 'PIXELLE_VIDEO_URL');
expectContains('scripts/verify-snaps-pixelle.ts', 'SnapsShortVideoService');
expectContains('docker-compose.dev.yaml', 'POSTGRES_USER: snaps-user');
expectContains('docker-compose.dev.yaml', 'POSTGRES_PASSWORD: snaps-password');
expectContains('docker-compose.dev.yaml', 'POSTGRES_DB: snaps-db-local');
expectNotContains('docker-compose.yaml', 'ghcr.io/gitroomhq/postiz-app:latest', 'upstream Postiz image');
expectContains('.gitignore', '/var/snaps/');

expectNotContains('apps/frontend/src/app/colors.scss', '#612BD3', 'old purple primary');
expectNotContains('apps/frontend/src/app/colors.scss', '#FC69FF', 'old pink accent');

expectContains('scripts/verify-snaps-runtime.ps1', '/snaps/health');
expectContains('scripts/verify-snaps-runtime.ps1', 'SNAPS_RUNTIME_CONFIRM=smoke');
expectContains('scripts/verify-snaps-runtime.ps1', 'Authenticated runtime smoke requires SNAPS_RUNTIME_CONFIRM=smoke');
expectContains('scripts/verify-snaps-runtime.ps1', 'RequireOllama');
expectContains('scripts/verify-snaps-runtime.ps1', 'SNAPS_OLLAMA_RAG_CONFIRM=embed');
expectContains('scripts/verify-snaps-runtime.ps1', 'Ollama RAG embedding smoke requires SNAPS_OLLAMA_RAG_CONFIRM=embed');
expectContains('scripts/verify-snaps-runtime.ps1', 'ConnectedIntegrationId');
expectContains('scripts/verify-snaps-runtime.ps1', 'RuntimeSmokeId');
expectContains('scripts/verify-snaps-runtime.ps1', 'snaps runtime smoke id');
expectContains('scripts/verify-snaps-runtime.ps1', 'Convert-ToQueryValue');
expectContains('scripts/verify-snaps-runtime.ps1', '[System.Uri]::EscapeDataString');
expectContains('scripts/verify-snaps-runtime.ps1', 'Invoke-ConnectedChannelSmoke');
expectContains('scripts/verify-snaps-runtime.ps1', 'connected-channel draft ok');
expectContains('scripts/verify-snaps-runtime.ps1', 'connected-channel schedule ok');
expectContains('scripts/verify-snaps-runtime.ps1', 'IncludeConnectedSchedule');
expectContains('scripts/verify-snaps-runtime.ps1', 'SNAPS_CONNECTED_DRAFT_CONFIRM=draft');
expectContains('scripts/verify-snaps-runtime.ps1', 'Connected draft smoke requires SNAPS_CONNECTED_DRAFT_CONFIRM=draft');
expectContains('scripts/verify-snaps-runtime.ps1', 'SNAPS_CONNECTED_SCHEDULE_CONFIRM=schedule');
expectContains('scripts/verify-snaps-runtime.ps1', 'Connected schedule smoke requires SNAPS_CONNECTED_SCHEDULE_CONFIRM=schedule');
expectContains('scripts/verify-snaps-runtime.ps1', 'IncludePixelleJob');
expectContains('scripts/verify-snaps-runtime.ps1', 'Invoke-PixelleJobSmoke');
expectContains('scripts/verify-snaps-runtime.ps1', 'Pixelle job smoke requires SNAPS_PIXELLE_CONFIRM=generate');
expectContains('scripts/verify-snaps-runtime.ps1', 'pixelle job ok');
expectContains('scripts/verify-snaps-runtime.ps1', 'pixelle status ok');
expectContains('scripts/verify-snaps-runtime.ps1', 'IncludeInboxClear');
expectContains('scripts/verify-snaps-runtime.ps1', 'SNAPS_INBOX_CLEAR_CONFIRM=clear');
expectContains('scripts/verify-snaps-runtime.ps1', 'inbox clear ok');
expectContains('scripts/verify-snaps-runtime.ps1', 'Assert-SnapsOllamaReady');
expectContains('scripts/verify-snaps-runtime.ps1', 'missingModels');
expectContains('scripts/verify-snaps-runtime.ps1', 'chatModelAvailable');
expectContains('scripts/verify-snaps-runtime.ps1', 'embedModelAvailable');
expectContains('scripts/verify-snaps-runtime.ps1', 'runtime Ollama embedding smoke');
expectContains('scripts/verify-snaps-runtime.ps1', 'ollama embedding smoke ok');
expectContains('scripts/verify-snaps-runtime.ps1', 'RAG search did not return the server-mediated Ollama embedding smoke example');
expectContains('scripts/verify-snaps-runtime.ps1', 'Invoke-CleanupDelete');
expectContains('scripts/verify-snaps-runtime.ps1', 'Test-SnapsFrontendRoute');
expectContains('scripts/verify-snaps-runtime.ps1', 'FrontendUrl');
expectContains('scripts/verify-snaps-runtime.ps1', 'snaps frontend smoke');
expectContains('scripts/verify-snaps-runtime.ps1', 'frontendUrl=$routeBaseUrl');
expectContains('scripts/verify-snaps-runtime.ps1', 'frontend route ok: /snaps');
expectContains('scripts/verify-snaps-runtime.ps1', 'snaps 스튜디오 markup');
expectContains('scripts/verify-snaps-runtime.ps1', 'status=$status location=$location');
expectContains('scripts/verify-snaps-runtime.ps1', '-Auth is a valid logged-in cookie');
expectContains('scripts/verify-snaps-runtime.ps1', 'snippet=$snippet');
expectContains('scripts/verify-snaps-runtime.ps1', '$mutatingSmokeCompleted');
expectContains('scripts/verify-snaps-runtime.ps1', '/api/snaps/health');
expectContains('scripts/verify-snaps-runtime.ps1', '/snaps/transform');
expectContains('scripts/verify-snaps-runtime.ps1', '/api/snaps/transform');
expectContains('scripts/verify-snaps-runtime.ps1', 'transform missing sourceText validation ok');
expectContains('scripts/verify-snaps-runtime.ps1', '/api/snaps/transform-and-draft');
expectContains('scripts/verify-snaps-runtime.ps1', '/api/snaps/transform-and-schedule');
expectContains('scripts/verify-snaps-runtime.ps1', 'transform api alias ok');
expectContains('scripts/verify-snaps-runtime.ps1', 'transform draft alias ok');
expectContains('scripts/verify-snaps-runtime.ps1', 'transform schedule alias warning ok');
expectContains('scripts/verify-snaps-runtime.ps1', '/snaps/video/script');
expectContains('scripts/verify-snaps-runtime.ps1', '/api/snaps/video/script');
expectContains('scripts/verify-snaps-runtime.ps1', 'shorts script missing sourceText validation ok');
expectContains('scripts/verify-snaps-runtime.ps1', '/api/snaps/video/generate-short');
expectContains('scripts/verify-snaps-runtime.ps1', '/api/snaps/video/status/runtime-smoke-job');
expectContains('scripts/verify-snaps-runtime.ps1', '/snaps/video/attach-to-draft');
expectContains('scripts/verify-snaps-runtime.ps1', '/api/snaps/video/attach-to-draft');
expectContains('scripts/verify-snaps-runtime.ps1', 'shorts script api alias ok');
expectContains('scripts/verify-snaps-runtime.ps1', 'generate-short api alias fallback ok');
expectContains('scripts/verify-snaps-runtime.ps1', 'video status api alias fallback ok');
expectContains('scripts/verify-snaps-runtime.ps1', 'video attach validation ok');
expectContains('scripts/verify-snaps-runtime.ps1', 'schedule warning ok');
expectContains('scripts/verify-snaps-runtime.ps1', 'video draft warning ok');
expectContains('scripts/verify-snaps-runtime.ps1', '/snaps/report/from-platform-analytics');
expectContains('scripts/verify-snaps-runtime.ps1', 'platform analytics empty-source report ok');
expectContains('scripts/verify-snaps-runtime.ps1', 'platform analytics partial-failure report ok');
expectContains('scripts/verify-snaps-runtime.ps1', '/snaps/inbox/import-post-comments');
expectContains('scripts/verify-snaps-runtime.ps1', 'post comment empty import ok');
expectContains('scripts/verify-snaps-runtime.ps1', '/snaps/inbox/reply-capabilities');
expectContains('scripts/verify-snaps-runtime.ps1', '/snaps/inbox/publish-reply');
expectContains('scripts/verify-snaps-runtime.ps1', 'reply draft missing body validation ok');
expectContains('scripts/verify-snaps-runtime.ps1', 'publish reply missing body validation ok');
expectContains('scripts/verify-snaps-runtime.ps1', 'publish reply missing platform post validation ok');
expectContains('scripts/verify-snaps-runtime.ps1', 'publish reply missing integration validation ok');
expectContains('scripts/verify-snaps-runtime.ps1', 'DELETE');
expectContains('scripts/verify-snaps-runtime.ps1', 'feedback smoke items cleanup ok');
expectContains('scripts/verify-snaps-runtime.ps1', 'SNAPS_MUTATING_CONFIRM=mutate');
expectContains('scripts/verify-snaps-runtime.ps1', 'Mutating runtime smoke requires SNAPS_MUTATING_CONFIRM=mutate');
expectContains('scripts/verify-snaps-runtime.ps1', 'source list ok');
expectContains('scripts/verify-snaps-runtime.ps1', '/snaps/rag/examples');
expectContains('scripts/verify-snaps-runtime.ps1', 'rag examples list ok');
expectContains('scripts/verify-snaps-runtime.ps1', 'report history ok');
expectContains('scripts/verify-snaps-runtime.ps1', 'feedback list filter ok');
expectContains('scripts/verify-snaps-runtime.ps1', 'workspace import ok');
expectContains('scripts/verify-snaps-runtime.ps1', 'activity log ok');
expectContains('scripts/verify-snaps-runtime.ps1', 'runtime smoke cleanup ok');
expectContains('scripts/verify-snaps-runtime.ps1', '/promote-to-rag');
expectContains('scripts/verify-snaps-runtime.ps1', 'source promote missing platform validation ok');
expectContains('scripts/verify-snaps-runtime.ps1', 'report promote missing platform validation ok');
expectContains('scripts/verify-snaps-runtime.ps1', '/snaps/rag/rebuild');
expectContains('scripts/verify-snaps-runtime.ps1', '/snaps/export');
expectContains('scripts/verify-snaps-runtime.ps1', 'commentable');
expectContains('scripts/verify-snaps-runtime.ps1', 'actionItems');
expectContains('scripts/verify-snaps-runtime.ps1', 'print-html');
expectContains('scripts/verify-snaps-runtime.ps1', 'bySentiment');
expectContains('libraries/nestjs-libraries/src/snaps/dto/feedback-inbox.dto.ts', 'SnapsFeedbackPublishReplyDto');
expectContains('scripts/verify-snaps-ollama.ps1', 'think = $false');
expectContains('scripts/verify-snaps-ollama.ps1', 'transform shape ok');
expectContains('scripts/verify-snaps-ollama.ps1', 'verify-snaps-ollama-ok');
expectContains('scripts/verify-snaps-services.ts', 'verify-snaps-services-ok');
expectContains('scripts/verify-snaps-services.ts', 'verifyOllamaClientParsing');
expectContains('scripts/verify-snaps-services.ts', 'verifyAnalyticsMetricMapper');
expectContains('scripts/verify-snaps-services.ts', 'PartialOllama');
expectContains('scripts/verify-snaps-services.ts', 'MalformedVariantOllama');
expectContains('scripts/verify-snaps-services.ts', 'MalformedShortsOllama');
expectContains('scripts/verify-snaps-services.ts', 'MalformedEmbeddingOllama');
expectContains('scripts/verify-snaps-services.ts', 'string notes should be ignored');
expectContains('scripts/verify-snaps-services.ts', 'partial Ollama transform should fill omitted variants');
expectContains('scripts/verify-snaps-services.ts', 'partial Ollama transform did not normalize returned variant content and hashtags');
expectContains('scripts/verify-snaps-services.ts', 'malformed Ollama variants should fallback per platform');
expectContains(
  'scripts/verify-snaps-services.ts',
  'analytics metric mapper should hand over the provider value unchanged'
);
expectContains('scripts/verify-snaps-services.ts', 'Malformed metric report');
expectContains('scripts/verify-snaps-services.ts', 'MalformedReportOllama');
expectContains('scripts/verify-snaps-services.ts', 'report generator should ignore malformed AI summary payloads');
expectContains('scripts/verify-snaps-services.ts', 'Non-array metric report');
expectContains('scripts/verify-snaps-services.ts', 'report generator should treat null request bodies as empty reports');
expectContains('scripts/verify-snaps-services.ts', 'Ollama fenced JSON parsing failed');
expectContains('scripts/verify-snaps-services.ts', 'Ollama prefixed JSON extraction failed');
expectContains('scripts/verify-snaps-services.ts', 'Ollama chat body did not disable thinking');
expectContains('scripts/verify-snaps-services.ts', 'SnapsContentTransformService');
expectContains('scripts/verify-snaps-services.ts', 'SnapsFeedbackInboxService');
expectContains('scripts/verify-snaps-services.ts', 'Naver Blog assist fallback should include long-form blog structure');
expectContains('scripts/verify-snaps-services.ts', 'KakaoTalk assist variant missing');
expectContains('scripts/verify-snaps-services.ts', 'Xiaohongshu assist variant missing');
expectContains('scripts/verify-snaps-services.ts', 'feedback import should ignore malformed items without crashing');
expectContains('scripts/verify-snaps-services.ts', 'feedback summary should ignore malformed inline items');
expectContains('scripts/verify-snaps-services.ts', 'legacy-positive-feedback');
expectContains('scripts/verify-snaps-services.ts', 'feedback praise classification missing');
expectContains('scripts/verify-snaps-services.ts', 'feedback complaint classification missing');
expectContains('scripts/verify-snaps-services.ts', 'SnapsShortVideoService');
expectContains('scripts/verify-snaps-services.ts', 'SnapsActivityLogService');
expectContains('scripts/verify-snaps-services.ts', 'buildSnapsPublishingPayload');
expectContains('scripts/verify-snaps-services.ts', 'buildSnapsVideoVariants');
expectContains('scripts/verify-snaps-services.ts', 'schedule payload should require publishDate for real schedules');
expectContains('scripts/verify-snaps-services.ts', 'schedule payload should coerce invalid scheduleType values to draft');
expectContains('scripts/verify-snaps-services.ts', 'Naver Cafe schedule payload settings were not preserved');
expectContains('scripts/verify-snaps-services.ts', 'Naver Cafe schedule payload did not derive a subject');
expectContains('scripts/verify-snaps-services.ts', 'Naver Cafe schedule payload should warn when cafe settings are missing');
expectContains('scripts/verify-snaps-services.ts', 'Mixed schedule payload should keep valid posts and warn');
expectContains('scripts/verify-snaps-services.ts', 'verifyPixelleVideoClient');
expectContains('scripts/verify-snaps-services.ts', 'malformed shorts LLM script should be normalized');
expectContains('scripts/verify-snaps-services.ts', 'Pixelle generate nested status was not normalized');
expectContains('scripts/verify-snaps-services.ts', 'Pixelle status nested video URL was not normalized');
expectContains('scripts/verify-snaps-services.ts', 'pixelle.example.test/root/generate');
expectContains('scripts/verify-snaps-services.ts', 'pixelle.example.test/root/status/pixelle-smoke-job');
expectContains('scripts/verify-snaps-services.ts', 'Pixelle HTML failures should be compacted');
expectContains('scripts/verify-snaps-services.ts', 'shorts status fallback should be not-configured');
expectContains('scripts/verify-snaps-services.ts', 'NaverCafeProvider');
expectContains('scripts/verify-snaps-services.ts', 'Naver Cafe auth URL did not include');
expectContains('scripts/verify-snaps-services.ts', 'Naver Cafe authentication response was not normalized');
expectContains('scripts/verify-snaps-services.ts', 'Naver Cafe refresh response did not preserve fallback refresh token');
expectContains('scripts/verify-snaps-services.ts', 'Naver Cafe token HTML failure was not normalized');
expectContains('scripts/verify-snaps-services.ts', 'Naver Cafe refresh HTML failure was not normalized');
expectContains('scripts/verify-snaps-services.ts', 'rebuildEmbeddings');
expectContains('scripts/verify-snaps-services.ts', 'importSources');
expectContains('scripts/verify-snaps-services.ts', 'importReports');
expectContains('scripts/verify-snaps-services.ts', 'source library should reject object sourceText');
expectContains('scripts/verify-snaps-services.ts', 'avoid object strings in report export');
expectContains('scripts/verify-snaps-services.ts', 'verifyJsonStoreRecovery');
expectContains('scripts/verify-snaps-services.ts', 'non-array snaps JSON stores should be treated as empty');
expectContains('scripts/verify-snaps-services.ts', 'RAG addExample should keep only finite embedding values');
expectContains('scripts/verify-snaps-services.ts', 'clamp malformed topK');
expectContains('scripts/verify-snaps-services.ts', 'RAG store should cap imported style examples at 500');
expectContains('scripts/verify-snaps-services.ts', 'deleteExample');
expectContains('scripts/verify-snaps-services.ts', 'clearItems');
expectContains('scripts/verify-snaps-services.ts', 'feedback inbox should reject object content');
expectContains('scripts/verify-snaps-services.ts', 'feedback inbox should cap imported items at 1000');
expectContains('scripts/verify-snaps-services.ts', 'importEntries');
expectContains('scripts/verify-snaps-services.ts', 'activity import should reject object titles');
expectContains('scripts/verify-snaps-services.ts', 'removeSmokeDir');
expectContains('scripts/verify-snaps-preflight.ps1', 'verify-snaps-preflight-ok');
expectContains('scripts/verify-snaps-preflight.ps1', 'snaps env verifier');
expectContains('scripts/verify-snaps-preflight.ps1', 'snaps completion audit verifier');
expectContains('scripts/verify-snaps-preflight.ps1', 'snaps API contract verifier');
expectContains('scripts/verify-snaps-preflight.ps1', 'snaps frontend surface verifier');
expectContains('scripts/verify-snaps-preflight.ps1', 'snaps product shell verifier');
expectContains('scripts/verify-snaps-preflight.ps1', 'snaps runtime smoke contract verifier');
expectContains('scripts/verify-snaps-preflight.ps1', 'snaps DB contract verifier');
expectContains('scripts/verify-snaps-preflight.ps1', 'snaps platform contract verifier');
expectContains('scripts/verify-snaps-preflight.ps1', 'snaps provider contract verifier');
expectContains('scripts/verify-snaps-preflight.ps1', 'snaps demo workspace verifier');
expectContains('scripts/verify-snaps-preflight.ps1', 'snaps Naver Cafe live verifier dry-run');
expectContains('scripts/verify-snaps-preflight.ps1', 'snaps Pixelle live verifier dry-run');
expectContains('scripts/verify-snaps-preflight.ps1', 'snaps controller smoke');
expectContains('scripts/verify-snaps-preflight.ps1', '--transpile-only');
expectContains('scripts/verify-snaps-preflight.ps1', 'Prisma schema validate');
expectContains('scripts/verify-snaps-preflight.ps1', 'Docker compose config');
expectContains('scripts/verify-snaps-preflight.ps1', 'Docker compose dev config');
expectContains('scripts/verify-snaps-preflight.ps1', 'snaps libraries typecheck');
expectContains('scripts/verify-snaps-preflight.ps1', 'Backend full typecheck');
expectContains('scripts/verify-snaps-preflight.ps1', 'Frontend full typecheck');
expectContains('scripts/verify-snaps-preflight.ps1', 'Backend snaps typecheck filter');
expectContains('scripts/verify-snaps-preflight.ps1', 'Frontend snaps typecheck filter');
expectContains('scripts/verify-snaps-preflight.ps1', 'Jest test smoke');
expectContains('scripts/verify-snaps-preflight.ps1', 'scripts/verify-snaps-final.ps1');
expectContains('scripts/verify-snaps-preflight.ps1', 'scripts/verify-snaps-final-guards.ps1');
expectContains('scripts/verify-snaps-preflight.ps1', 'scripts/verify-snaps-readiness.ps1');
expectContains('scripts/verify-snaps-preflight.ps1', 'snaps readiness JSON contract');
expectContains('scripts/verify-snaps-preflight.ps1', 'readiness JSON ok');
expectContains('scripts/verify-snaps-preflight.ps1', 'snaps final option guard verifier');
expectContains('scripts/verify-snaps-preflight.ps1', 'snaps readiness report');
expectContains('scripts/verify-snaps-preflight.ps1', 'snaps final prerequisite smoke');
expectContains('scripts/verify-snaps-preflight.ps1', '-CheckPrerequisitesOnly');
expectContains('scripts/verify-snaps-controller.ts', 'verify-snaps-controller-ok');
expectContains('scripts/verify-snaps-controller.ts', 'invalid scheduleType should coerce to draft');
expectContains('scripts/verify-snaps-controller.ts', 'reply capabilities should mark commentable integrations');
expectContains('scripts/verify-snaps-controller.ts', 'post comment import should skip other organizations');
expectContains('scripts/verify-snaps-frontend-surface.mjs', 'verify-snaps-frontend-surface-ok');
expectContains('scripts/verify-snaps-frontend-surface.mjs', "snapsFetch('/snaps/transform'");
expectContains('scripts/verify-snaps-frontend-surface.mjs', 'onClick={transform}');
expectContains('scripts/verify-snaps-frontend-surface.mjs', 'platforms=${platforms.length}');
expectContains('scripts/verify-snaps-product-shell.mjs', 'verify-snaps-product-shell-ok');
expectContains('scripts/verify-snaps-product-shell.mjs', 'SnapsLaunchButton');
expectContains('scripts/verify-snaps-product-shell.mjs', 'next/font/google');
expectContains('scripts/verify-snaps-product-shell.mjs', 'Naver Cafe icon branch');
expectContains('scripts/verify-snaps-final-guards.ps1', 'verify-snaps-final-guards-ok');
expectContains('scripts/verify-snaps-final-guards.ps1', 'Invoke-ExpectedFinalFailure');
expectContains('scripts/verify-snaps-final-guards.ps1', 'SNAPS_RUNTIME_CONFIRM is required');
expectContains('scripts/verify-snaps-final-guards.ps1', "SNAPS_RUNTIME_CONFIRM must be set to 'smoke'");
expectContains('scripts/verify-snaps-final-guards.ps1', 'SNAPS_OLLAMA_RAG_CONFIRM is required');
expectContains('scripts/verify-snaps-final-guards.ps1', "SNAPS_OLLAMA_RAG_CONFIRM must be set to 'embed'");
expectContains('scripts/verify-snaps-final-guards.ps1', 'SNAPS_CONNECTED_DRAFT_CONFIRM is required');
expectContains('scripts/verify-snaps-final-guards.ps1', "SNAPS_CONNECTED_DRAFT_CONFIRM must be set to 'draft'");
expectContains('scripts/verify-snaps-final-guards.ps1', '-IncludeConnectedSchedule requires -ConnectedIntegrationId');
expectContains('scripts/verify-snaps-final-guards.ps1', 'SNAPS_CONNECTED_SCHEDULE_CONFIRM is required');
expectContains('scripts/verify-snaps-final-guards.ps1', "SNAPS_CONNECTED_SCHEDULE_CONFIRM must be set to 'schedule'");
expectContains('scripts/verify-snaps-final-guards.ps1', 'NAVER_CAFE_ACCESS_TOKEN is required');
expectContains('scripts/verify-snaps-final-guards.ps1', "SNAPS_NAVER_CAFE_CONFIRM must be set to 'post'");
expectContains('scripts/verify-snaps-final-guards.ps1', 'PIXELLE_VIDEO_URL is required');
expectContains('scripts/verify-snaps-final-guards.ps1', "SNAPS_PIXELLE_CONFIRM must be set to 'generate'");
expectContains('scripts/verify-snaps-final-guards.ps1', 'SNAPS_DB_PUSH_CONFIRM is required');
expectContains('scripts/verify-snaps-final-guards.ps1', "SNAPS_DB_PUSH_CONFIRM must be set to 'push'");
expectContains('scripts/verify-snaps-final-guards.ps1', 'SNAPS_MUTATING_CONFIRM is required');
expectContains('scripts/verify-snaps-final-guards.ps1', "SNAPS_MUTATING_CONFIRM must be set to 'mutate'");
expectContains('scripts/verify-snaps-readiness.ps1', 'verify-snaps-readiness-ok');
expectContains('scripts/verify-snaps-readiness.ps1', 'RequireRuntime');
expectContains('scripts/verify-snaps-readiness.ps1', 'RequireNoWarnings');
expectContains('scripts/verify-snaps-readiness.ps1', 'ConvertTo-Json -Depth 8');
expectContains('scripts/verify-snaps-readiness.ps1', 'product = "snaps"');
expectContains('scripts/verify-snaps-readiness.ps1', 'warning checks');
expectContains('scripts/verify-snaps-readiness.ps1', 'Get-SnapsDatabaseUrl');
expectContains('scripts/verify-snaps-readiness.ps1', 'Get-SnapsRedisUrl');
expectContains('scripts/verify-snaps-readiness.ps1', 'Get-SnapsTemporalAddress');
expectContains('scripts/verify-snaps-readiness.ps1', 'Test-TcpEndpoint');
expectContains('scripts/verify-snaps-readiness.ps1', 'database-url');
expectContains('scripts/verify-snaps-readiness.ps1', 'database-tcp');
expectContains('scripts/verify-snaps-readiness.ps1', 'redis-url');
expectContains('scripts/verify-snaps-readiness.ps1', 'redis-tcp');
expectContains('scripts/verify-snaps-readiness.ps1', 'temporal-address');
expectContains('scripts/verify-snaps-readiness.ps1', 'temporal-tcp');
expectContains('scripts/verify-snaps-readiness.ps1', 'backend-snaps-health');
expectContains('scripts/verify-snaps-readiness.ps1', 'frontend-snaps-route');
expectContains('scripts/verify-snaps-readiness.ps1', 'ollama-models');
expectContains('scripts/verify-snaps-readiness.ps1', 'verify-snaps-readiness-summary');
expectContains('scripts/verify-snaps-runtime-contract.mjs', 'verify-snaps-runtime-contract-ok');
expectContains('scripts/verify-snaps-runtime-contract.mjs', 'explicitExemptions');
expectContains('scripts/verify-snaps-runtime-contract.mjs', 'POST /snaps/inbox/reply-draft');
expectContains('scripts/verify-snaps-runtime-contract.mjs', 'DELETE /snaps/inbox/items');
expectContains('scripts/verify-snaps-runtime-contract.mjs', 'Runtime smoke contract is missing routes');
expectContains('scripts/verify-snaps-final.ps1', 'verify-snaps-final requires -Auth');
expectContains('scripts/verify-snaps-final.ps1', 'FrontendUrl');
expectContains('scripts/verify-snaps-final.ps1', 'snaps install-ready preflight');
expectContains('scripts/verify-snaps-final.ps1', 'Invoke-PnpmStep');
expectContains('scripts/verify-snaps-final.ps1', 'repository-local Corepack pnpm.cjs');
expectContains('scripts/verify-snaps-final.ps1', 'Invoke-Prisma');
expectContains('scripts/verify-snaps-final.ps1', 'node_modules\\.bin\\prisma.cmd');
expectContains('scripts/verify-snaps-final.ps1', 'Assert-FinalOptionPrerequisites');
expectContains('scripts/verify-snaps-final.ps1', 'Assert-EnvValue');
expectContains('scripts/verify-snaps-final.ps1', 'Assert-EnvValue "SNAPS_RUNTIME_CONFIRM" "smoke"');
expectContains('scripts/verify-snaps-final.ps1', 'Assert-EnvValue "SNAPS_OLLAMA_RAG_CONFIRM" "embed"');
expectContains('scripts/verify-snaps-final.ps1', 'SNAPS_DB_PUSH_CONFIRM');
expectContains('scripts/verify-snaps-final.ps1', 'Assert-EnvValue "SNAPS_DB_PUSH_CONFIRM" "push"');
expectContains('scripts/verify-snaps-final.ps1', 'Assert-EnvValue "SNAPS_MUTATING_CONFIRM" "mutate"');
expectContains('scripts/verify-snaps-final.ps1', 'Assert-EnvValue "SNAPS_CONNECTED_DRAFT_CONFIRM" "draft"');
expectContains('scripts/verify-snaps-final.ps1', 'Assert-EnvValue "SNAPS_CONNECTED_SCHEDULE_CONFIRM" "schedule"');
expectContains('scripts/verify-snaps-final.ps1', 'CheckPrerequisitesOnly');
expectContains('scripts/verify-snaps-final.ps1', 'Prisma CLI path ok');
expectContains('scripts/verify-snaps-final.ps1', 'verify-snaps-final-prerequisites-ok');
expectContains('scripts/verify-snaps-final.ps1', 'Prisma client generate');
expectContains('scripts/verify-snaps-final.ps1', 'Prisma db push skipped');
expectContains('scripts/verify-snaps-final.ps1', 'Production build');
expectContains('scripts/verify-snaps-final.ps1', 'snaps Docker dev image cache report');
expectContains('scripts/verify-snaps-final.ps1', 'scripts/verify-snaps-dev-images.mjs');
expectContains('scripts/verify-snaps-final.ps1', 'snaps runtime readiness gate');
expectContains('scripts/verify-snaps-final.ps1', 'scripts/verify-snaps-readiness.ps1');
expectContains('scripts/verify-snaps-final.ps1', '-RequireRuntime');
expectContains('scripts/verify-snaps-final.ps1', '-RequireNoWarnings');
expectContains('scripts/verify-snaps-final.ps1', 'snaps authenticated runtime smoke');
expectContains('scripts/verify-snaps-final.ps1', '-RequireOllama');
expectContains('scripts/verify-snaps-final.ps1', '-ConnectedIntegrationId');
expectContains('scripts/verify-snaps-final.ps1', '-RuntimeSmokeId');
expectContains('scripts/verify-snaps-final.ps1', '-IncludeConnectedSchedule');
expectContains('scripts/verify-snaps-final.ps1', 'IncludeNaverCafeLive');
expectContains('scripts/verify-snaps-final.ps1', 'NAVER_CAFE_ACCESS_TOKEN');
expectContains('scripts/verify-snaps-final.ps1', 'SNAPS_NAVER_CAFE_CONFIRM');
expectContains('scripts/verify-snaps-final.ps1', 'snaps Naver Cafe live provider smoke');
expectContains('scripts/verify-snaps-final.ps1', 'SNAPS_NAVER_CAFE_SMOKE_ID');
expectContains('scripts/verify-snaps-final.ps1', 'scripts/verify-snaps-naver-cafe.ts');
expectContains('scripts/verify-snaps-final.ps1', 'IncludePixelleDirect');
expectContains('scripts/verify-snaps-final.ps1', 'PIXELLE_VIDEO_URL');
expectContains('scripts/verify-snaps-final.ps1', 'SNAPS_PIXELLE_CONFIRM');
expectContains('scripts/verify-snaps-final.ps1', 'snaps Pixelle direct live smoke');
expectContains('scripts/verify-snaps-final.ps1', 'SNAPS_PIXELLE_SMOKE_ID');
expectContains('scripts/verify-snaps-final.ps1', 'scripts/verify-snaps-pixelle.ts');
expectContains('scripts/verify-snaps-final.ps1', '-IncludePixelleJob');
expectContains('scripts/verify-snaps-final-guards.ps1', 'Pixelle server job requires generate confirmation');
expectContains('scripts/verify-snaps-final.ps1', '-IncludeInboxClear');
expectContains('scripts/verify-snaps-final.ps1', 'SNAPS_INBOX_CLEAR_CONFIRM');
expectContains('scripts/verify-snaps-final-guards.ps1', 'inbox clear requires exact confirmation');
expectContains('scripts/verify-snaps-final.ps1', 'verify-snaps-final-ok');
expectContains('scripts/run-pnpm.mjs', 'repository-local Corepack pnpm.cjs');
expectContains('scripts/run-pnpm.mjs', 'function hasPathPnpm');
expectContains('scripts/run-pnpm.mjs', 'where.exe');
expectContains('scripts/run-pnpm.mjs', "entry === 'pnpm.cjs'");
expectContains('scripts/run-pnpm.mjs', "endsWith('/bin/pnpm.cjs')");
expectContains('package.json', '"build": "node scripts/run-pnpm.mjs');
expectContains('package.json', '"dev": "node scripts/run-dev.mjs');
expectContains('scripts/run-dev.mjs', 'scripts/run-pnpm.mjs');
expectContains('package.json', '"prisma-generate": "node scripts/run-prisma.mjs');
expectContains('package.json', '"postinstall": "npm run prisma-generate"');
expectContains('package.json', '"build:backend": "node scripts/clean-path.mjs');
expectContains('package.json', '"dev:backend": "node scripts/clean-path.mjs');
expectContains('package.json', '"start:prod:backend": "node scripts/run-pnpm.mjs');
expectContains('package.json', '"commands:build:development": "node scripts/run-pnpm.mjs');
expectContains('package.json', '"docker-build": "docker compose build snaps"');
expectContains('package.json', '"docker-create": "docker compose create snaps"');
expectNotContains('package.json', 'rm -rf');
expectNotContains('package.json', 'pnpx');
expectNotContains('package.json', '|| true');
expectContains('package.json', '"pm2-run": "node scripts/run-optional.mjs pm2 delete all');
expectContains('scripts/clean-path.mjs', 'Refusing to remove path outside repository');
expectContains('scripts/clean-path.mjs', 'rmSync(resolved, { recursive: true, force: true })');
expectContains('scripts/run-optional.mjs', 'process.exit(0)');
expectContains('scripts/run-optional.mjs', 'shell: process.platform === \'win32\'');
expectContains('scripts/run-prisma.mjs', 'node_modules');
expectContains('scripts/run-prisma.mjs', 'prisma.cmd');
expectContains('scripts/run-prisma.mjs', "['scripts/run-pnpm.mjs', 'dlx', 'prisma@6.5.0'");
expectContains('libraries/nestjs-libraries/src/snaps/video/short-video.service.ts', 'coreSummary');
expectContains('libraries/nestjs-libraries/src/snaps/video/short-video.service.ts', 'uploadMetadata');
expectContains('libraries/nestjs-libraries/src/snaps/video/short-video.service.ts', 'pixellePrompt');
expectContains('libraries/nestjs-libraries/src/snaps/video/short-video.service.ts', 'normalizePixelleResponse');
expectContains('libraries/nestjs-libraries/src/snaps/video/short-video.service.ts', 'normalizeRequest');
expectContains('libraries/nestjs-libraries/src/snaps/video/short-video.service.ts', 'private platform');
expectContains('libraries/nestjs-libraries/src/snaps/video/short-video.service.ts', 'findStringByKeys');
expectContains('libraries/nestjs-libraries/src/snaps/video/short-video.service.ts', 'cleanSourceText');
expectContains('libraries/nestjs-libraries/src/snaps/video/short-video.service.ts', 'readPixelleResponseSnippet');
expectNotContains('libraries/nestjs-libraries/src/snaps/video/short-video.service.ts', 'Pixelle request failed: ${response.status} ${await response.text()}', 'raw Pixelle generate error body');
expectNotContains('libraries/nestjs-libraries/src/snaps/video/short-video.service.ts', 'Pixelle status failed: ${response.status} ${await response.text()}', 'raw Pixelle status error body');
expectContains('docs/snaps-runtime-validation.md', 'Browser smoke');
expectContains('docs/snaps-runtime-validation.md', 'frontend route smoke');
expectContains('docs/snaps-runtime-validation.md', 'verify:snaps:preflight');
expectContains('docs/snaps-runtime-validation.md', 'if (-not (Test-Path .env)) { Copy-Item .env.example .env }');
expectContains('docs/snaps-runtime-validation.md', 'reads `FRONTEND_URL` and `NEXT_PUBLIC_BACKEND_URL` from `.env`');
expectContains('docs/snaps-runtime-validation.md', 'SNAPS_RUNTIME_CONFIRM=smoke');
expectContains('docs/snaps-runtime-validation.md', 'SNAPS_OLLAMA_RAG_CONFIRM=embed');
expectContains('docs/snaps-runtime-validation.md', 'SNAPS_DB_PUSH_CONFIRM=push');
expectContains('docs/snaps-runtime-validation.md', 'SNAPS_MUTATING_CONFIRM=mutate');
expectContains('docs/snaps-runtime-validation.md', 'SNAPS_CONNECTED_DRAFT_CONFIRM=draft');
expectContains('docs/snaps-runtime-validation.md', 'SNAPS_CONNECTED_SCHEDULE_CONFIRM=schedule');
expectContains('docs/snaps-runtime-validation.md', 'snaps-demo-workspace.json');
expectContains('docs/snaps-runtime-validation.md', 'snaps-postgres-migration.sql');
expectNotContains('docs/snaps-runtime-validation.md', 'Postiz media library에 영상 URL 저장');
expectNotContains('docs/snaps-runtime-validation.md', 'Postiz post IDs');
expectNotContains('docs/snaps-runtime-validation.md', 'Postiz post ID');
expectNotContains('docs/snaps-runtime-validation.md', 'Postiz-comment import');
expectNotContains('docs/snaps-runtime-validation.md', 'Postiz draft');
expectNotContains('libraries/react-shared-libraries/src/helpers/testomonials.tsx', 'Postiz', 'testimonial legacy product name');
expectLocaleValuesNotContains('libraries/react-shared-libraries/src/translation/locales', /Postiz|postiz|Gitroom|gitroomhq/, 'legacy product name');
expectContains('docs/snaps-completion-audit.md', 'Prompt-To-Artifact Checklist');
expectContains('docs/snaps-completion-audit.md', 'Named File And Command Checklist');
expectContains('docs/snaps-completion-audit.md', 'Phase Checklist');
expectContains('docs/snaps-completion-audit.md', 'Implemented with structural deviation');
expectContains('docs/snaps-completion-audit.md', 'Open Runtime Gates');
expectContains('README.md', '/snaps/rag/rebuild');
expectContains('README.md', '/snaps/inbox/reply-capabilities');
expectContains('README.md', '/snaps/inbox/publish-reply');
expectContains('README.md', 'snaps-postgres-migration.sql');
expectContains('README.md', 'verify:snaps:services');
expectContains('README.md', 'SNAPS_RUNTIME_CONFIRM=smoke');
expectContains('README.md', 'SNAPS_OLLAMA_RAG_CONFIRM=embed');
expectContains('README.md', 'SNAPS_MUTATING_CONFIRM=mutate');
expectContains('README.md', 'SNAPS_CONNECTED_DRAFT_CONFIRM=draft');
expectContains('README.md', 'SNAPS_CONNECTED_SCHEDULE_CONFIRM=schedule');
expectContains('README.md', 'source import/report export normalization');
expectContains('README.md', 'activity import normalization');
expectContains('README.md', 'malformed shorts LLM script normalization');
expectContains('README.md', 'nested job/status/video URL fields');
expectContains('README.md', 'twelve core behaviors');
expectContains('README.md', 'pure publishing payload builder');
expectNotContains('README.md', 'pure Postiz payload builder');
expectNotContains('README.md', 'real Postiz draft');
expectContains('README.md', 'verify:snaps:env');
expectContains('README.md', 'verify:snaps:audit');
expectContains('README.md', 'verify:snaps:api');
expectContains('README.md', 'verify:snaps:frontend-surface');
expectContains('README.md', 'verify:snaps:product-shell');
expectContains('README.md', 'verify:snaps:runtime-contract');
expectContains('README.md', 'verify:snaps:db');
expectContains('README.md', 'verify:snaps:platforms');
expectContains('README.md', 'verify:snaps:providers');
expectContains('README.md', 'verify:snaps:demo');
expectContains('README.md', 'verify:snaps:naver-cafe');
expectContains('README.md', 'verify:snaps:pixelle');
expectContains('README.md', 'verify:snaps:controller');
expectContains('README.md', 'verify:snaps:preflight');
expectContains('README.md', 'verify:snaps:final-guards');
expectContains('README.md', 'verify:snaps:readiness');
expectContains('README.md', 'verify:snaps:readiness:json');
expectContains('README.md', 'verify:snaps:readiness:strict');
expectContains('README.md', 'verify:snaps:dev-images');
expectContains('README.md', 'verify:snaps:handoff');
expectContains('README.md', 'verify:snaps:runtime');
expectContains('README.md', 'verify:snaps:final');
expectContains('apps/extension/manifest.json', '"name": "snaps"');
expectContains('apps/extension/manifest.dev.json', '"name": "snaps"');
expectContains('apps/extension/package.json', '"name": "snaps-extension"');
expectContains('apps/extension/src/background.ts', 'snaps\\.local');
expectContains('apps/extension/package.json', 'node ../../scripts/package-extension.mjs .');
expectContains('apps/extension/package.json', 'node ../../scripts/clean-path.mjs dist extension.zip');
expectContains('scripts/package-extension.mjs', 'copyFileSync(manifestPath');
expectContains('scripts/package-extension.mjs', 'header(0x06054b50, 22)');
expectContains('apps/backend/package.json', '"name": "snaps-backend"');
expectContains('apps/frontend/package.json', '"name": "snaps-frontend"');
expectContains('apps/orchestrator/package.json', '"name": "snaps-orchestrator"');
expectContains('apps/commands/package.json', '"name": "snaps-command"');
expectContains('apps/commands/package.json', './apps/commands/src/main');
expectContains('apps/commands/package.json', './dist/apps/commands/src/main.js');
expectContains('apps/commands/src/tasks/agent.run.ts', 'SNAPS_AGENT_ORG_ID is required');
expectContains('apps/commands/src/tasks/agent.run.ts', 'this._agentGraphService.start(orgId, request)');
expectContains('apps/sdk/package.json', '"name": "@snaps/node"');
expectContains('apps/sdk/package.json', 'snaps public API client');
expectContains('apps/sdk/package.json', 'snaps Contributors');
expectContains('apps/sdk/README.md', '# snaps NodeJS SDK');
expectContains('apps/sdk/README.md', "import Snaps from '@snaps/node'");
expectContains('apps/sdk/src/index.ts', 'export default class Snaps');
expectContains('apps/sdk/src/index.ts', "process.env.SNAPS_API_URL ?? 'http://localhost:5000'");
expectNotContains('apps/extension/manifest.json', 'Postiz', 'extension manifest legacy product name');
expectNotContains('apps/extension/manifest.dev.json', 'Postiz', 'extension dev manifest legacy product name');
expectNotContains('apps/extension/package.json', 'Postiz', 'extension package legacy product name');
expectNotContains('apps/extension/package.json', 'postiz-extension', 'extension package legacy name');
expectNotContains('apps/extension/package.json', 'rm -rf', 'extension Unix-only cleanup');
expectNotContains('apps/extension/package.json', 'cp manifest.json', 'extension Unix-only copy');
expectNotContains('apps/extension/package.json', 'zip -r', 'extension Unix-only packaging');
expectNotContains('apps/extension/src/background.ts', 'postiz.com', 'extension legacy allowed origin');
expectNotContains('apps/backend/package.json', 'postiz-backend', 'backend package legacy name');
expectNotContains('apps/frontend/package.json', 'postiz-frontend', 'frontend package legacy name');
expectNotContains('apps/orchestrator/package.json', 'postiz-orchestrator', 'orchestrator package legacy name');
expectNotContains('apps/commands/package.json', 'postiz-command', 'commands package legacy name');
expectNotContains('apps/commands/package.json', 'apps/command/src/main', 'commands package singular app path');
expectNotContains('apps/commands/package.json', 'dist/apps/command/src/main.js', 'commands package singular dist path');
expectNotContains('apps/commands/src/tasks/agent.run.ts', 'createGraph', 'stale AgentGraphService API');
expectNotContains('apps/sdk/package.json', '@postiz/node', 'SDK legacy package name');
expectNotContains('apps/sdk/package.json', 'The ultimate social media scheduling tool', 'SDK legacy description');
expectNotContains('apps/sdk/package.json', 'Nevo David', 'SDK legacy author');
expectNotContains('apps/sdk/README.md', 'Postiz', 'SDK README legacy product name');
expectNotContains('apps/sdk/README.md', 'postiz.com', 'SDK README legacy domain');
expectNotContains('apps/sdk/src/index.ts', 'api.postiz.com', 'SDK legacy API domain');
expectNotContains('apps/sdk/src/index.ts', 'class Postiz', 'SDK legacy class name');
expectNotExists('apps/frontend/public/postiz.svg', 'legacy public logo asset');
expectNotExists('apps/frontend/public/postiz-text.svg', 'legacy public logo text asset');
expectNotExists('apps/frontend/public/postiz-fav.png', 'legacy public favicon asset');
expectContains('CONTRIBUTING.md', 'docs/snaps-completion-audit.md');
expectContains('CONTRIBUTING.md', 'git clone https://github.com/YOUR_USERNAME/snaps.git');
expectContains('SECURITY.md', 'snaps is committed');
expectContains('SECURITY.md', 'snaps-specific backend routes');
expectContains('CODE_OF_CONDUCT.md', "repository's private contact channel");
expectContains('var/docker/docker-create.sh', 'docker create --name snaps');
expectContains('var/docker/docker-build.sh', 'localhost/snaps-devcontainer');
expectContains('CLAUDE.md', 'This project is snaps');
expectContains('CLAUDE.md', 'snaps 스튜디오 for Ollama content transformation');
expectContains('sonar-project.properties', 'sonar.projectName=snaps');
expectContains('sonar-project.properties', 'Korean-first AI social content operations platform');
expectContains('apps/orchestrator/src/workflows/digest.email.workflow.ts', '`[snaps] Your latest notifications`');
expectNotContains('CONTRIBUTING.md', 'docs.postiz.com', 'contributing legacy docs URL');
expectNotContains('CONTRIBUTING.md', 'discord.postiz.com', 'contributing legacy Discord URL');
expectNotContains('CONTRIBUTING.md', 'YOUR_USERNAME/postiz.git', 'contributing legacy clone URL');
expectNotContains('CONTRIBUTING.md', 'make Postiz better', 'contributing legacy product name');
expectNotContains('SECURITY.md', 'Postiz app', 'security legacy product name');
expectNotContains('SECURITY.md', 'github.com/gitroomhq/postiz-app', 'security legacy upstream advisory URL');
expectNotContains('SECURITY.md', '@postiz', 'security legacy npm org');
expectNotContains('CODE_OF_CONDUCT.md', 'gitroom.com', 'code of conduct legacy contact domain');
expectNotContains('var/docker/docker-create.sh', 'postiz', 'legacy Docker helper name');
expectNotContains('var/docker/docker-build.sh', 'postiz', 'legacy Docker helper image');
expectNotContains('CLAUDE.md', 'This project is Postiz', 'Claude guide legacy product intro');
expectNotContains('sonar-project.properties', 'sonar.projectName=Postiz App', 'Sonar legacy product name');
expectNotContains('apps/orchestrator/src/workflows/digest.email.workflow.ts', '[Postiz]', 'digest email legacy product name');
expectContains('package.json', 'Korean-first AI social content operations platform');
expectContains('package.json', 'verify:snaps:runtime');
expectContains('package.json', 'verify:snaps:ollama');
expectContains('package.json', 'verify:snaps:env');
expectContains('package.json', 'verify:snaps:audit');
expectContains('package.json', 'verify:snaps:api');
expectContains('package.json', 'verify:snaps:frontend-surface');
expectContains('package.json', 'verify:snaps:product-shell');
expectContains('package.json', 'verify:snaps:runtime-contract');
expectContains('package.json', 'verify:snaps:db');
expectContains('package.json', 'verify:snaps:platforms');
expectContains('package.json', 'verify:snaps:providers');
expectContains('package.json', 'verify:snaps:demo');
expectContains('package.json', 'verify:snaps:naver-cafe');
expectContains('package.json', 'verify:snaps:pixelle');
expectContains('package.json', 'verify:snaps:controller');
expectContains('package.json', 'verify:snaps:services');
expectContains('package.json', 'verify:snaps:preflight');
expectContains('package.json', 'verify:snaps:final-guards');
expectContains('package.json', 'verify:snaps:readiness');
expectContains('package.json', 'verify:snaps:readiness:json');
expectContains('package.json', 'verify:snaps:readiness:strict');
expectContains('package.json', 'verify:snaps:dev-images');
expectContains('package.json', 'verify:snaps:handoff');
expectContains('scripts/verify-snaps-dev-images.mjs', 'docker-compose.dev.yaml');
expectContains('scripts/verify-snaps-dev-images.mjs', '--strict');
expectContains('scripts/verify-snaps-preflight.ps1', 'snaps Docker dev image cache report');
expectContains('scripts/verify-snaps-preflight.ps1', 'Orchestrator full typecheck');
expectContains('scripts/verify-snaps-preflight.ps1', 'Commands full typecheck');
expectContains('scripts/verify-snaps-preflight.ps1', 'Extension full typecheck');
expectContains('scripts/verify-snaps-preflight.ps1', 'SDK full typecheck');
expectContains('docs/snaps-completion-audit.md', 'Frontend surface verification');
expectContains('docs/snaps-completion-audit.md', 'Product shell verification');
expectContains('package.json', 'verify:snaps:final');
expectContains('scripts/snaps-runtime-handoff.ps1', 'verify-snaps-runtime-handoff-ok');
expectContains('scripts/snaps-runtime-handoff.ps1', 'npm run verify:snaps:readiness:strict');
expectContains('scripts/snaps-runtime-handoff.ps1', 'npm run verify:snaps:demo');
expectContains('scripts/snaps-runtime-handoff.ps1', 'if (-not (Test-Path .env)) { Copy-Item .env.example .env }');
expectContains('scripts/snaps-runtime-handoff.ps1', '-BaseUrl $BaseUrl');
expectContains('scripts/snaps-runtime-handoff.ps1', 'SNAPS_RUNTIME_CONFIRM=smoke');
expectContains('scripts/snaps-runtime-handoff.ps1', 'SNAPS_OLLAMA_RAG_CONFIRM=embed');
expectContains('scripts/snaps-runtime-handoff.ps1', 'SNAPS_DB_PUSH_CONFIRM=push');
expectContains('scripts/snaps-runtime-handoff.ps1', 'SNAPS_MUTATING_CONFIRM=mutate');
expectContains('scripts/snaps-runtime-handoff.ps1', 'SNAPS_CONNECTED_DRAFT_CONFIRM=draft');
expectContains('scripts/snaps-runtime-handoff.ps1', 'SNAPS_CONNECTED_SCHEDULE_CONFIRM=schedule');
expectContains('scripts/snaps-runtime-handoff.ps1', 'SNAPS_INBOX_CLEAR_CONFIRM=clear');
expectContains('scripts/snaps-runtime-handoff.ps1', 'Docker dev image readiness');
expectContains('scripts/snaps-runtime-handoff.ps1', 'docker image list is unavailable');
expectContains('scripts/snaps-runtime-handoff.ps1', 'npm run prisma-generate');
expectContains('scripts/snaps-runtime-handoff.ps1', 'npm run dev:docker may pull these images');
expectContains('package.json', '"node": ">=22.12.0 <23.0.0"');
expectContains('package.json', '"node": "22.12.0"', 'Volta Node matches package engines floor');
expectContains('.nvmrc', '22.12.0');
expectContains('.node-version', '22.12.0');
expectNotContains('jest.config.ts', '@nx/jest');
expectContains('jest.config.ts', 'passWithNoTests');
expectContains('jest.config.ts', 'testMatch');
expectContains('jest.config.ts', 'ts-jest');
expectContains('jest.config.ts', 'moduleNameMapper');
expectContains('package.json', '"outputDirectory": "./tmp/reports"');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', 'Naver Blog, KakaoTalk, and Xiaohongshu');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', 'partial Ollama variants');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', 'MalformedVariantOllama');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', 'invalid Naver Cafe settings');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', 'malformed feedback');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', 'LegacyFeedbackSummaryOllama');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', 'legacySummary.bySentiment.praise');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', 'RAG style examples');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', 'style-cap-');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', 'MalformedEmbeddingOllama');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', 'finite-embedding-import');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', 'normalizes source library imports');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', 'clean-report');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', '## 수집 경고');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', 'normalizes imported activity entries');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', 'activity-clean');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', 'deterministic analytics report');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', 'MalformedReportOllama');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', 'script-ready Pixelle fallback');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', 'MalformedShortsOllama');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', 'malformed shorts LLM script fields');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', 'Naver Cafe OAuth');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', 'client_secret=naver-secret');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', 'fenced JSON');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', 'thinking-only failures');
expectContains('libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts', 'Return final JSON only');

// The Shorts-Maker container is only reachable inside the docker network, so
// GET /snaps/health is the only way an operator can tell whether it is up and
// whether the AUTH_LOCAL_BYPASS assumption still holds. Backend must report it
// and the shorts workspace must surface it.
expectContains(
  'apps/backend/src/api/routes/snaps.controller.ts',
  'this.shortsMakerHealth()',
  'shortsMaker health probe wired into GET /snaps/health'
);
expectContains(
  'apps/backend/src/api/routes/snaps.controller.ts',
  "payload.errorCode === 'STUDIO_RENDER_JOB_ID_REQUIRED'",
  'shortsMaker auth-passed probe assertion'
);
expectContains(
  'apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx',
  'health?.shortsMaker?.ok',
  'Shorts-Maker health badge in the shorts workspace'
);

// --- vendored engines and post workflow -------------------------------------

// Remotion bundles its composition from SOURCE at render time
// (render-remotion-server.ts: bundle({ entryPoint: cwd + "/remotion/index.ts" })),
// so the runtime image needs these directories even though .next is built.
// Dropping them to slim the image silently breaks every video render.
// Matched as a live instruction, not a substring: commenting the line out is
// the most likely way someone would "disable" it while slimming the image.
expectCustom('Shorts-Maker runtime source copies', () => {
  const dockerfile = read('external/Shorts-Maker/Dockerfile');
  for (const dir of ['remotion', 'types', 'lib', 'app']) {
    const live = new RegExp(`^\s*COPY --from=builder /app/${dir} \./${dir}\s*$`, 'm');
    if (!live.test(dockerfile)) {
      throw new Error(
        `external/Shorts-Maker/Dockerfile is missing an active runtime copy of ${dir}/ ` +
          '(the render-time Remotion bundle reads it from disk)'
      );
    }
  }
});
// Korean captions come from fonts-noto-cjk; without it Remotion renders tofu.
// Checked on an installed line rather than anywhere in the file: the same name
// appears in a comment further down, so a plain search stayed satisfied with
// the package itself removed.
expectCustom('Shorts-Maker installs a CJK font, not just a note about one', (read) => {
  const file = 'external/Shorts-Maker/Dockerfile';
  const installed = read(file)
    .split(String.fromCharCode(10))
    .filter((line) => !line.trim().startsWith('#'))
    .some((line) => line.includes('fonts-noto-cjk'));
  if (!installed) {
    throw new Error(
      `${file} no longer installs fonts-noto-cjk, so Remotion draws Korean ` +
        'captions as tofu boxes'
    );
  }
});

// The card news renderer names a font family and lets fontconfig resolve it,
// so what the image installs is what gets drawn. Reading the bundled
// Pretendard cmap directly: Latin, Hangul, kana and the ellipsis are covered,
// Han ideographs and emoji are not. The image installed no other font, so a
// Xiaohongshu deck - Chinese is one of the ten channels snaps renders for -
// and any caption carrying an emoji came out as tofu boxes. The width work
// that went before this was measured on a host with system fonts, which is
// exactly why it did not show up there.
expectCustom('the image carries fonts for everything snaps renders', (read) => {
  const file = 'Dockerfile.dev';
  const installed = read(file)
    .split(String.fromCharCode(10))
    .filter((line) => !line.trim().startsWith('#'));
  for (const [pkg, what] of [
    ['fonts-noto-cjk', 'Han ideographs'],
    ['fonts-noto-color-emoji', 'emoji'],
  ]) {
    if (!installed.some((line) => line.includes(pkg))) {
      throw new Error(
        `${file} no longer installs ${pkg}, so ${what} render as tofu boxes - ` +
          'Pretendard, the only other font in the image, does not cover them'
      );
    }
  }
});

// Two separate call sites name the post workflow version, and a half-migration
// (only one flipped) silently splits normal publishing from the recovery sweep.
// See docs/snaps-post-workflow-upgrade.md.
// verify-snaps-preflight.ps1 requires a fixed set of check names in the
// readiness JSON. The TCP probes were only emitted when their URL parsed, so
// the documented "Postgres is not running yet" gate surfaced as a missing
// check and preflight aborted before its remaining offline steps instead of
// reporting a blocked environment.
// Every live-effect smoke here refuses to run without an explicit
// SNAPS_*_CONFIRM variable. README documents the runnable commands, and
// nothing checked that the documented invocation still matches what the script
// demands - adding SNAPS_DEEPSEEK_CONFIRM left README telling people to run a
// command that now fails.
// Card news clamped captions and hashtags per platform but handed every
// channel the whole slide deck, so X - which takes four attachments - rejected
// a ten-slide post at publish time.
expectContains(
  'libraries/nestjs-libraries/src/snaps/cardnews/card-news-variant.builder.ts',
  'media: platformMedia,',
  'card news attachments are clamped per platform'
);
// The card news builder only covers its own flow. buildPostValues is where any
// variant's media becomes a post's image list, including a direct
// /snaps/schedule-variants call, so the limit has to hold there too.
expectContains(
  'libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts',
  'image: index === 0 ? clamped : [],',
  'attachment limit backstop in the publishing payload builder'
);
// Which platforms publish a title separately was a hardcoded name test that
// omitted youtube, and the fallback pushed a "Title: ...\n\nDescription:\n"
// block into the body instead. The publishing builder then derived the YouTube
// post title from that body, hashtags included.
expectCustom('title-bearing platforms come from the rule, not a name test', () => {
  const service = read(
    'libraries/nestjs-libraries/src/snaps/transform/content-transform.service.ts'
  );
  const code = service
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n');

  if (!/rule\.requiresTitle/.test(code)) {
    throw new Error(
      'content-transform.service.ts no longer decides titles from rule.requiresTitle'
    );
  }
  if (/platform\.includes\('naver'\)/.test(code)) {
    throw new Error(
      'content-transform.service.ts is back to picking title platforms by name, ' +
        'which is how youtube was missed'
    );
  }
  if (/return 'Title:/.test(code)) {
    throw new Error(
      'the youtube fallback embeds a "Title:" line in the body again; the publishing ' +
        'builder derives settings.title from that body'
    );
  }
});
expectCustom('every requiresTitle platform is a real platform', () => {
  const rules = read('libraries/nestjs-libraries/src/snaps/transform/platform-rules.ts');
  const table = /export const snapsPlatformRules[\s\S]*?\n\};/.exec(rules);
  if (!table) {
    throw new Error('platform-rules.ts no longer exports snapsPlatformRules');
  }
  const flagged = [...table[0].matchAll(/^ {2}'?([\w-]+)'?: \{([\s\S]*?)^ {2}\},/gm)]
    .filter(([, , body]) => /requiresTitle: true/.test(body))
    .map(([, platform]) => platform);
  if (!flagged.length) {
    throw new Error('no platform declares requiresTitle; the title path is unreachable');
  }
});

// The video variant builder hardcoded its hashtags, tagging Instagram Reels
// and TikTok with YouTube's "#shorts". Both video paths must read the shared
// defaults, the same way the shorts script fallback does.
expectNotContains(
  'libraries/nestjs-libraries/src/snaps/video/video-variant.builder.ts',
  "platform === 'youtube' ? ['#shorts']",
  'the hardcoded per-platform hashtags in the video variant builder'
);
expectContains(
  'libraries/nestjs-libraries/src/snaps/video/video-variant.builder.ts',
  'rule.defaultHashtags',
  'video variants take their hashtags from the shared platform rules'
);

// Segmenting was keyed on the literal platform name with 500 hardcoded as the
// splitter's default, a second copy of snapsPlatformRules.threads
// .postMaxLength. Both the trigger and the size must come from the rule.
expectCustom('post segmentation is driven by the platform rule', () => {
  const builder = read(
    'libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts'
  );
  const code = builder
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n');

  // The rule lookup used to be inline; it is now hoisted into `rule` and shared
  // with the media clamp and the hashtag budget. What matters is that the
  // segment size still comes from snapsPlatformRules and not from a literal.
  const readsRule =
    /snapsPlatformRules\[variant\.platform\]\?\.postMaxLength/.test(code) ||
    (/const rule = snapsPlatformRules\[variant\.platform\]/.test(code) &&
      /const postMaxLength = rule\?\.postMaxLength/.test(code));
  if (!readsRule) {
    throw new Error(
      'publishing-payload.builder.ts no longer reads postMaxLength from the platform rule'
    );
  }
  if (/variant\.platform === 'threads'/.test(code)) {
    throw new Error(
      'publishing-payload.builder.ts segments by a hardcoded platform name again; ' +
        'a second platform gaining postMaxLength would not be segmented'
    );
  }
  if (/function splitIntoPostSegments\([^)]*maxLength\s*=/.test(code)) {
    throw new Error(
      'splitIntoPostSegments has a default maxLength again, which is a second copy ' +
        'of the platform rule'
    );
  }
});

expectCustom('the payload attachment clamp reads the shared rules', () => {
  const builder = read(
    'libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts'
  );
  // Same as the segmentation guard: the rule lookup is hoisted into `rule` and
  // shared, so accept either form as long as the limit still comes from
  // snapsPlatformRules rather than a literal.
  const readsRule =
    /snapsPlatformRules\[variant\.platform\]\?\.mediaLimit/.test(builder) ||
    (/const rule = snapsPlatformRules\[variant\.platform\]/.test(builder) &&
      /const mediaLimit = rule\?\.mediaLimit/.test(builder));
  if (!readsRule) {
    throw new Error(
      'publishing-payload.builder.ts clamps attachments from something other than ' +
        'snapsPlatformRules.mediaLimit, so it can disagree with the card news builder'
    );
  }
});
expectCustom('the card news media trim reaches the operator', () => {
  const builder = read(
    'libraries/nestjs-libraries/src/snaps/cardnews/card-news-variant.builder.ts'
  );
  // Any warning collector, however it is named: `warnings`, `captionTrims`,
  // `mediaWarnings`. What matters is that the trim is written down.
  if (!/\w*[Ww]arnings\.push\(|\w*[Tt]rims\.push\(/.test(builder)) {
    throw new Error(
      'card-news-variant.builder.ts trims attachments without recording a warning'
    );
  }
  const controller = read('apps/backend/src/api/routes/snaps.controller.ts');
  if (!controller.includes('...cardNewsVariants.warnings')) {
    throw new Error(
      'the card news attach route drops cardNewsVariants.warnings, so a trimmed ' +
        'channel is never reported'
    );
  }
});

// snaps uses Shorts-Maker as a render engine only and publishes through its
// own providers, so the compose service deliberately omits the QStash
// credentials that lib/publish/scheduler.ts requires. That only holds while
// the adapter stays on the studio routes - a publish call would fail with
// "QSTASH_TOKEN is required" in this deployment.
expectCustom('the Shorts-Maker adapter stays on the studio routes', () => {
  const adapter = read(
    'libraries/nestjs-libraries/src/snaps/shorts-maker/shorts-maker-client.service.ts'
  );
  // The routes sit inside template literals as `${baseUrl}/api/studio/...`,
  // so do not require a quote immediately before the path.
  const routes = [...adapter.matchAll(/(\/api\/[a-z0-9/-]+)/g)].map((m) => m[1]);
  if (!routes.length) {
    throw new Error('the Shorts-Maker adapter no longer names any /api route');
  }
  const offStudio = routes.filter((route) => !route.startsWith('/api/studio/'));
  if (offStudio.length) {
    throw new Error(
      `the Shorts-Maker adapter calls ${[...new Set(offStudio)].join(', ')}; ` +
        'docker-compose.yaml only configures the studio path, and the publish routes ' +
        'need QSTASH_TOKEN/QSTASH_URL/PUBLISH_EXECUTE_SECRET that it deliberately omits'
    );
  }
});

// An operator sets up snaps by copying .env.example. A SNAPS_*/DEEPSEEK_*
// variable the code refuses to run without, but that .env.example never
// mentions, turns that setup into an unexplained failure.
expectCustom('.env.example documents every snaps variable the code requires', () => {
  const documented = new Set(
    [...read('.env.example').matchAll(/^#?\s*([A-Z][A-Z0-9_]+)\s*=/gm)].map((m) => m[1])
  );

  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) files.push(full);
    }
  };
  walk('libraries/nestjs-libraries/src/snaps');

  const missing = [];
  for (const file of files) {
    const lines = read(file).split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const match of line.matchAll(/process\.env\.((?:SNAPS|DEEPSEEK|OLLAMA|PIXELLE|SHORTS)_[A-Z0-9_]+)/g)) {
        const name = match[1];
        if (documented.has(name)) return;
        // Required when its absence throws nearby.
        const window = lines.slice(Math.max(0, index - 2), index + 4).join('\n');
        if (new RegExp(`throw[\\s\\S]{0,200}${name}`).test(window)) {
          missing.push(`${name} (${file})`);
        }
      }
    });
  }

  if (missing.length) {
    throw new Error(
      `.env.example never documents ${[...new Set(missing)].join(', ')} - the code ` +
        'refuses to run without it, so copying .env.example is not enough'
    );
  }

  // docker-compose.yaml lists the app environment explicitly - there is no
  // env_file - so a variable the code reads but that is absent there cannot be
  // set in the supported deployment at all. The video call deadlines, the
  // DeepSeek chat deadline, and the DeepSeek temperature and length budget were
  // all documented in .env.example and all unreachable in the container, the
  // last two for the provider actually in use. A commented-out entry counts: it
  // shows the operator the name and a value to uncomment.
  const compose = read('docker-compose.yaml');
  const unreachable = new Set();
  for (const file of files) {
    for (const match of read(file).matchAll(
      /process\.env\.((?:SNAPS|DEEPSEEK|OLLAMA|PIXELLE|SHORTS)_[A-Z0-9_]+)/g
    )) {
      const name = match[1];
      if (!new RegExp('^\\s*#?\\s*' + name + '\\s*:', 'm').test(compose)) {
        unreachable.add(name);
      }
    }
  }
  if (unreachable.size) {
    throw new Error(
      `${unreachable.size} variable(s) the snaps code reads are absent from ` +
        'docker-compose.yaml, so they cannot be set in the container: ' +
        [...unreachable].sort().join(', ')
    );
  }
});

// A PowerShell parameter that a script throws about is a hard requirement, not
// a convenience. README told operators to verify a connected channel but never
// mentioned -ConnectedNaverCafeClubId/-ConnectedNaverCafeMenuId, so choosing
// naver-cafe - the provider snaps added - failed with an unexplained error.
expectCustom('README documents every script flag that is a hard requirement', () => {
  const readme = read('README.md');
  const required = new Map();

  for (const file of readdirSync('scripts')) {
    if (!file.endsWith('.ps1')) continue;
    // The negative-test harness names flags in order to omit them.
    if (file === 'verify-snaps-final-guards.ps1') continue;
    const source = read(`scripts/${file}`);
    const params = /^param\(([\s\S]*?)^\)/m.exec(source);
    if (!params) continue;
    const declared = [...params[1].matchAll(/\$(\w+)/g)].map((m) => m[1]);

    // A throw that names the parameter means the script cannot run without it.
    for (const line of source.split(/\r?\n/)) {
      if (!/\bthrow\b/.test(line)) continue;
      for (const name of declared) {
        if (line.includes(`-${name}`) && !required.has(name)) {
          required.set(name, file);
        }
      }
    }
  }

  if (!required.size) {
    throw new Error('no required PowerShell flag was found; the scanner is broken');
  }

  const missing = [...required].filter(([name]) => !readme.includes(`-${name}`));
  if (missing.length) {
    throw new Error(
      `README.md never documents ${missing
        .map(([name, file]) => `-${name} (scripts/${file} throws without it)`)
        .join(', ')}`
    );
  }
});

expectCustom('README documents every confirmation gate the scripts enforce', () => {
  const readme = read('README.md');
  const required = new Set();
  const owners = new Map();

  for (const file of readdirSync('scripts')) {
    if (!/\.(ts|mjs|ps1)$/.test(file)) continue;
    // Skip the negative-test harness: it names the variables in order to clear
    // and mis-set them, not because it enforces them.
    if (file === 'verify-snaps-final-guards.ps1') continue;
    const source = read(`scripts/${file}`);
    for (const match of source.matchAll(/(SNAPS_[A-Z0-9_]*CONFIRM)/g)) {
      required.add(match[1]);
      if (!owners.has(match[1])) owners.set(match[1], file);
    }
  }

  if (!required.size) {
    throw new Error('no SNAPS_*_CONFIRM gate was found in scripts/; the scanner is broken');
  }

  const missing = [...required].filter((name) => !readme.includes(name));
  if (missing.length) {
    throw new Error(
      `README.md never mentions ${missing
        .map((name) => `${name} (enforced by scripts/${owners.get(name)})`)
        .join(', ')} - the documented commands would fail`
    );
  }
});

expectCustom('readiness emits every check preflight requires', () => {
  const preflight = read('scripts/verify-snaps-preflight.ps1');
  const readiness = read('scripts/verify-snaps-readiness.ps1');

  const block = /foreach \(\$requiredCheck in @\(([\s\S]*?)\)\)/.exec(preflight);
  if (!block) {
    throw new Error(
      'verify-snaps-preflight.ps1 no longer declares a required readiness check list'
    );
  }
  const required = [...block[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
  if (!required.length) {
    throw new Error('the preflight required-check list parsed as empty');
  }

  for (const name of required) {
    // Emitted unconditionally, or backfilled when its probe could not run.
    const emitted = new RegExp(`Add-ReadinessCheck \\$checks "${name}"`).test(readiness);
    const backfilled = new RegExp(
      `Add-MissingReadinessCheck \\$checks "${name}"`
    ).test(readiness);
    if (!emitted && !backfilled) {
      throw new Error(
        `verify-snaps-preflight.ps1 requires the readiness check "${name}" but ` +
          'verify-snaps-readiness.ps1 never emits it'
      );
    }
    // A check that is only produced inside a conditional branch has to have a
    // backfill, or preflight fails whenever that branch is not taken.
    const conditionalOnly =
      emitted && !backfilled && /-tcp$/.test(name);
    if (conditionalOnly) {
      throw new Error(
        `the readiness check "${name}" is only emitted when its probe runs; ` +
          'add an Add-MissingReadinessCheck fallback so the JSON contract holds'
      );
    }
  }
});

expectCustom('post workflow dispatch sites agree', () => {
  const sites = [
    'apps/orchestrator/src/activities/post.activity.ts',
    'libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts',
  ];
  const versions = sites.map((site) => {
    const match = read(site).match(/'(postWorkflowV\d+)'/);
    if (!match) {
      throw new Error(`${site} no longer names a post workflow version`);
    }
    return match[1];
  });
  if (versions[0] !== versions[1]) {
    throw new Error(
      `post workflow dispatch sites disagree: ${sites[0]} uses ${versions[0]} but ${sites[1]} uses ${versions[1]}`
    );
  }

  // Agreeing with each other is not enough. docs/snaps-post-workflow-upgrade.md
  // states which version actually runs and gives activation steps that assume
  // it, so flipping both sites would leave the doc asserting the opposite.
  const doc = read('docs/snaps-post-workflow-upgrade.md');
  // The doc writes it as `'postWorkflowV102'`를 - inside backticks.
  const documented = /'(postWorkflowV\d+)'`?를 /.exec(doc);
  if (!documented) {
    throw new Error(
      'docs/snaps-post-workflow-upgrade.md no longer names the version the dispatch sites use'
    );
  }
  if (documented[1] !== versions[0]) {
    throw new Error(
      `the post workflow dispatch sites run ${versions[0]} but ` +
        `docs/snaps-post-workflow-upgrade.md still describes ${documented[1]} as the live version`
    );
  }

  // The doc's activation procedure names exactly these two sites. A third
  // dispatch site would make those steps incomplete without anything saying so
  // - this project already shipped a doc that claimed one site when there were
  // two.
  const searchRoots = ['apps', 'libraries'];
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.next') {
        continue;
      }
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.ts') && !full.includes('/post-workflows/')) {
        // Strip comments: workflows/index.ts explains the two call sites and
        // quotes the workflow name while dispatching nothing.
        const code = read(full)
          .split(/\r?\n/)
          .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
          .join('\n');
        if (/'postWorkflowV\d+'/.test(code)) {
          found.push(full);
        }
      }
    }
  };
  searchRoots.forEach(walk);
  const unexpected = found.filter(
    (file) => !sites.some((site) => file.endsWith(site.split('/').pop()))
  );
  if (unexpected.length) {
    throw new Error(
      `post workflow is dispatched from ${unexpected.join(', ')} as well, but ` +
        'docs/snaps-post-workflow-upgrade.md only documents two sites to switch'
    );
  }
});

// The snaps JSON stores read with `catch { return [] }` on purpose: a file
// that does not exist yet is the normal first-run state, and the workspace
// should show an empty list rather than an error. The cost of that forgiveness
// is that a damaged file looks exactly like an empty one - and if nobody
// writes afterwards, nothing ever mentions it. Seven stores had it; each now
// warns with the path and the reason, missing files excepted. A new store that
// copies the old shape would be silent again, so no bare one is allowed.
expectCustom('no snaps store reads empty without saying why', (read) => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) {
        continue;
      }
      // Split on the newline character itself; trim() takes the carriage
      // return with it, and a regex literal here is one escaping layer too
      // many for this file's own tooling.
      const lines = read(full).split(String.fromCharCode(10));
      lines.forEach((line, index) => {
        // A catch that binds nothing can keep nothing.
        if (line.trim() !== '} catch {') {
          return;
        }
        const next = (lines[index + 1] || '').trim();
        if (next.startsWith('return [];') || next.startsWith('return [] as')) {
          offenders.push(`${full}:${index + 1}`);
        }
      });
    }
  };
  walk('libraries/nestjs-libraries/src/snaps');
  if (offenders.length) {
    throw new Error(
      `${offenders.join(', ')} answers an unreadable store with an empty list ` +
        'and keeps nothing about why; call warnUnreadableJsonFile so the ' +
        'operator can find the quarantined copy'
    );
  }
});

// Clamping was `text.slice(0, limit)` everywhere, which counts UTF-16 code
// units and cuts between them. An emoji is two of those, so a limit landing
// between them leaves a lone high surrogate - measured through the public
// builder, an Instagram caption whose emoji straddled 2200 published a body
// that was not well formed and ended on U+D83D. The fixed-stride split for an
// over-long token was worse: at the matching offset it broke both segments,
// the first ending on a high surrogate and the second starting on a low one.
// The title a platform publishes separately from the body was
// `content.slice(0, 48)`. The model returns title, description and tags in one
// block, so the slice ran past the first line and put newlines in a field that
// is single-line everywhere; it counted UTF-16 units, so a cut inside an emoji
// left a dangling high surrogate at one boundary position in seven; and it
// threw away the headline the model had already written on line one.
// Thirteen places clamped text with `.slice(0, N)`, which counts UTF-16 units
// and cuts between them: the YouTube title, the Naver Cafe subject, the shorts
// caption, the card news title and caption, the model-supplied title, a stored
// style example, a source library title, a RAG prompt excerpt and a feedback
// example. Each could end on a dangling high surrogate - not encodable as
// UTF-8, so it reaches the platform as a replacement character - or cut a ZWJ
// sequence into different people. This checks the class rather than the list:
// no snaps source may take a fixed-length slice of a text expression.
// loadReplyCapabilities had the !ok branch fixed to report a failed load - the
// comment there says why - but its catch still ran `setReplyCapabilities(null)`
// and reported nothing. null is not "no channel takes replies": the picker
// reads it as "capabilities unknown" and offers every connected channel, so a
// dropped request widened the reply list to channels whose provider has no
// comment API, and the failure surfaced later at the reply itself.
expectCustom('a failed reply-capabilities load is reported, not reset', (read) => {
  const file = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
  const source = read(file);
  const opens = source.indexOf('const loadReplyCapabilities');
  if (opens < 0) {
    throw new Error(`${file} no longer loads reply capabilities`);
  }
  const closes = source.indexOf('\n  };', opens);
  const body = source.slice(opens, closes < 0 ? source.length : closes);

  const caught = body.slice(body.indexOf('} catch'));
  if (!caught || caught === body) {
    throw new Error(`${file} loadReplyCapabilities no longer catches at all`);
  }
  if (!caught.includes('replyCapabilities:')) {
    throw new Error(
      `${file} loadReplyCapabilities drops a failed load without recording it, ` +
        'so the operator sees a reply list that is wrong rather than an error'
    );
  }
  if (/setReplyCapabilities\(\s*null/.test(caught)) {
    throw new Error(
      `${file} loadReplyCapabilities resets the capabilities to null on ` +
        'failure again, which the picker reads as "offer every channel"'
    );
  }
});

// Six services reported `provider: 'ollama'` whichever engine answered, so on
// AI_PROVIDER=deepseek the workspace badge read "ollama - deepseek-v4-flash"
// beside a health card saying DeepSeek. Measured on the live DeepSeek smoke.
// The client already knew; it just was not asked.
expectCustom('services report the engine that answered, not a literal', (read) => {
  const files = [
    'libraries/nestjs-libraries/src/snaps/transform/content-transform.service.ts',
    'libraries/nestjs-libraries/src/snaps/agent/command-planner.service.ts',
    'libraries/nestjs-libraries/src/snaps/cardnews/card-news.service.ts',
    'libraries/nestjs-libraries/src/snaps/video/short-video.service.ts',
    'libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts',
    'libraries/nestjs-libraries/src/snaps/analytics/report-generator.service.ts',
  ];
  for (const file of files) {
    const source = read(file);
    // A result field set to the literal - the union member in a type
    // declaration is `provider: 'ollama' | ...` and is not this.
    if (/provider:\s*'ollama'\s*(?:as const)?\s*[,\n]/.test(source)) {
      throw new Error(
        `${file} labels its result 'ollama' whichever engine answered, so a ` +
          'DeepSeek run is reported as Ollama'
      );
    }
    if (!source.includes('.provider()')) {
      throw new Error(
        `${file} no longer asks the client which engine answered`
      );
    }
  }

  // The badge colour means "a model answered". Spelling that as === 'ollama'
  // was the same thing only while 'ollama' was the only model value.
  const workspace = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
  if (read(workspace).includes("provider === 'ollama'")) {
    throw new Error(
      `${workspace} tests the provider against 'ollama' again, which paints a ` +
        'DeepSeek result as if the deterministic fallback produced it'
    );
  }
});

// Measured by running the planner against real Korean commands, live against
// DeepSeek and then offline: both made the same mistakes, so these are the
// rules' and not the model's. A named channel was added even when the command
// named it to rule it out, and a time-only command could resolve behind the
// clock.
expectCustom('the planner reads exclusions and never schedules into the past', (read) => {
  const file =
    'libraries/nestjs-libraries/src/snaps/agent/command-planner.service.ts';
  const source = read(file);

  const opens = source.indexOf('private detectTargetPlatforms');
  if (opens < 0) {
    throw new Error(`${file} no longer detects target platforms`);
  }
  const detect = source.slice(opens, source.indexOf('\n  }', opens));
  // The exclusion vocabulary lives in asksFor(); testing the pattern directly
  // is what let `인스타그램 말고` add Instagram.
  if (!/this\.asksFor\(/.test(detect)) {
    throw new Error(
      `${file} matches a channel name without asking whether the command ` +
        'named it in order to exclude it'
    );
  }

  // 밤 12시 is the midnight that ends the named day.
  if (!/marker === '밤'\)\s*\{\s*target\.day \+= 1;/.test(source)) {
    throw new Error(
      `${file} no longer moves 밤 12시 to the day it ends, so it resolves to ` +
        'that morning and lands behind the clock'
    );
  }
  // A time with no day named, already gone, means the next one.
  if (!/resolved\.getTime\(\) <= now\.getTime\(\)/.test(source)) {
    throw new Error(
      `${file} no longer rolls a time-only command forward when the time has ` +
        'already passed, so the plan schedules into the past'
    );
  }

  // Saying it is not needed is not an imperative, and the -지는 말- form has a
  // particle the -지 마 patterns skip over.
  const refuseOpens = source.indexOf('private refusesToPublish');
  const refuse = source.slice(
    refuseOpens,
    source.indexOf('\n  }', refuseOpens)
  );
  for (const [needle, why] of [
    ['필요', 'that publishing is not needed'],
    ['(는|은)?', 'the topic particle in 발행하지는 말아줘'],
  ]) {
    if (!refuse.includes(needle)) {
      throw new Error(
        `${file} refusesToPublish no longer hears ${why}`
      );
    }
  }
});

// Ten labelled Korean comments through the deterministic classifier put four in
// the wrong bucket. A paid-collaboration enquiry and a customer complaint both
// landed in spam, because bare 광고 was a spam signal sitting ahead of the
// collaboration list that has 광고 문의 in it. A question carrying a link landed
// in spam because any URL counted. And a compliment using 문제없이 landed in
// complaints, because 문제 matches inside the word that negates it.
expectCustom('the feedback classifier does not bury enquiries and complaints', (read) => {
  const file =
    'libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts';
  const source = read(file);
  const opens = source.indexOf('private classify(content: string)');
  if (opens < 0) {
    throw new Error(`${file} no longer classifies feedback`);
  }
  const body = source.slice(opens, source.indexOf('\n  }', opens));

  // Bare 광고 matches 광고 문의 and 광고가 불편해요 alike, so it cannot be a
  // spam signal on its own. Allow it only as part of a longer phrase.
  for (const bare of ["광고|", "|광고)", "(광고|"]) {
    if (body.includes(bare)) {
      throw new Error(
        `${file} treats bare 광고 as a signal again, which files both an ad ` +
          'enquiry and a complaint about ads in the wrong bucket'
      );
    }
  }

  // 문제 has to be guarded against 문제없-, which says the opposite. The
  // pattern is a module constant now - classify() and detectConversionSignals()
  // read the same one, because as two copies they drifted and a complaint came
  // back with no complaint-risk signal - so the guard is checked where it
  // lives rather than inside one method's body.
  if (!/문제\(\?!/.test(source)) {
    throw new Error(
      `${file} matches 문제 without excluding 문제없-, so a compliment is ` +
        'filed as a complaint'
    );
  }
  // And the two judgements must not go back to having their own copies.
  // Calls, not mentions. Counting the bare name passed on a comment that
  // merely said `see SNAPS_COMPLAINT_PATTERN` while the detector had gone back
  // to its own regex - the third time in this file that a guard was satisfied
  // by prose rather than by code.
  for (const [pattern, what] of [
    [/SNAPS_COMPLAINT_PATTERN\.test\(/g, 'the complaint pattern'],
    [/SNAPS_COLLABORATION_PATTERN\.test\(/g, 'the approach pattern'],
  ]) {
    const uses = (source.match(pattern) || []).length;
    // classify() and detectConversionSignals(), one call each.
    if (uses < 2) {
      throw new Error(
        `${file} reads ${what} in ${uses} place(s); classify() and ` +
          'detectConversionSignals() both have to use it, or they drift - ' +
          'measured, five comments classified as complaints carried no ' +
          'complaint-risk signal'
      );
    }
  }

  // A link is a spam signal only alongside promotional wording.
  if (!testsBothWays(body, 'link', 'promo')) {
    throw new Error(
      `${file} treats any link as spam again, so a question that cites a URL ` +
        'never reaches the operator'
    );
  }

  // Collaboration is decided before spam so an enquiry cannot be swallowed.
  const collaboration = body.indexOf("'collaboration'");
  const spam = body.indexOf("'spam'");
  if (collaboration < 0 || spam < 0 || collaboration > spam) {
    throw new Error(
      `${file} decides spam before collaboration again, so an enquiry worded ` +
        'like an ad is filed as junk'
    );
  }
});

// The sentence split existed twice in card-news.service.ts and the two copies
// had already drifted - one listed \n in its lookbehind, the other did not -
// and neither worked on the text operators paste. The \n was dead either way:
// the pattern still demanded \s+ after it, so a single newline only split when
// a second whitespace character followed. Worse, cleanSourceText ran the source
// through text() first, which collapses every run of whitespace to one space,
// so the structure the deck is split on was gone before the split ran: a pasted
// bulleted note produced one body slide holding everything.
expectCustom('card news splits pasted source on its own lines', (read) => {
  const splitter = 'libraries/nestjs-libraries/src/snaps/text/split-sentences.ts';
  const shared = read(splitter);
  // A newline ends a unit on its own, not only when followed by more space.
  if (!/\\s\*\\n\+/.test(shared)) {
    throw new Error(
      `${splitter} no longer treats a newline as a break on its own, so a ` +
        'pasted list is one sentence again'
    );
  }
  // A full stop with no space after it still ends a sentence, but only when a
  // Hangul syllable or a capital follows - a digit there is a decimal.
  if (!/\(\?=\[가-힣A-Z\]\)/.test(shared)) {
    throw new Error(
      `${splitter} no longer splits 문장입니다.둘째, or no longer protects a ` +
        'decimal like 50.5 from being split'
    );
  }

  const file = 'libraries/nestjs-libraries/src/snaps/cardnews/card-news.service.ts';
  const source = read(file);
  const assignments = source.match(/const sentences =[^;]*/g) || [];
  if (assignments.length < 2) {
    throw new Error(
      `${file} no longer has both sentence splits; the guard below cannot ` +
        'check what it was written for'
    );
  }
  for (const assignment of assignments) {
    if (!assignment.includes('snapsSplitSentences(')) {
      throw new Error(
        `${file} splits sentences itself again instead of using the shared ` +
          `function, which is how the two copies drifted apart: ${assignment.trim()}`
      );
    }
  }

  const opens = source.indexOf('private cleanSourceText');
  const body = source.slice(opens, source.indexOf('\n  }', opens));
  // text() flattens newlines. The source has to keep them.
  if (/return this\.text\(value/.test(body.split('\n').slice(-4).join('\n'))) {
    throw new Error(
      `${file} flattens the source text again, so the deck cannot be split ` +
        'on the lines the operator pasted'
    );
  }
  if (!/\[\^\\S\\n\]/.test(body)) {
    throw new Error(
      `${file} cleanSourceText no longer collapses spaces while keeping ` +
        'newlines'
    );
  }

  // Fields rendered on one line must still be flattened.
  for (const field of ['heading: this.headline(', 'title: this.headline(']) {
    if (!source.includes(field)) {
      throw new Error(
        `${file} builds a single-line field straight from the source, which ` +
          'now carries newlines: ' + field
      );
    }
  }
});

// Hashtags were split on whitespace and commas only, so every other separator
// was stripped by the character filter instead and the tags either side of it
// were welded into one word. `#환절기#건강관리#면역력` - the run-together shape a
// model emits most often - published as the single tag `#환절기건강관리면역력`,
// which nobody searches. A merged tag is worse than a dropped one: it ships.
expectCustom('hashtags that run together are split, not welded', (read) => {
  const file = 'libraries/nestjs-libraries/src/snaps/transform/hashtags.ts';
  const source = read(file);
  const declaration = (source.match(/const SEPARATORS = [^;]+;/) || [])[0];
  if (!declaration) {
    throw new Error(`${file} no longer declares where one tag ends`);
  }
  // `#` cannot appear inside a tag, so one that is not the first character
  // always starts a new tag. Without this the run-together form merges.
  if (!declaration.includes('(?=#)')) {
    throw new Error(
      `${file} no longer starts a new tag at an inner #, so ` +
        '#환절기#건강관리 publishes as one word'
    );
  }
  // The separators a Korean list is actually written with.
  for (const separator of ['、', '·']) {
    if (!declaration.includes(separator)) {
      throw new Error(
        `${file} no longer treats ${separator} as a separator, so the tags ` +
          'either side of it are welded together'
      );
    }
  }
  if (!/\.split\(SEPARATORS\)/.test(source)) {
    throw new Error(
      `${file} splits tags with its own pattern again instead of the one ` +
        'declared above it'
    );
  }
});

// The subject a command named came back wrong in four of seven ways of saying
// it: the Korean topic particle was captured as part of it (`는 환절기 면역력
// 관리야`), the rest of the instruction was captured with it, and - worst - the
// capture was anchored to the end of the string and could not cross a comma, so
// `주제: 가을 과일, 톤은 친근하게` dropped the subject entirely and said nothing.
expectCustom('the planner reads a named subject without its grammar', (read) => {
  const file =
    'libraries/nestjs-libraries/src/snaps/agent/command-planner.service.ts';
  const source = read(file);
  const opens = source.indexOf('private detectTopic');
  if (opens < 0) {
    throw new Error(`${file} no longer reads a named subject`);
  }
  const body = source.slice(opens, source.indexOf('\n  }', opens));

  // A Korean particle marks the subject as surely as a colon does.
  if (!/은\|는\|이\|가\|을\|를/.test(body)) {
    throw new Error(
      `${file} accepts only a colon after 주제/내용/소재 again, so the topic ` +
        'particle is captured as part of the subject'
    );
  }
  // Anchoring the capture to the end of the string is what made a later comma
  // drop the subject in silence.
  if (/\[\^\\n,\]\+\)\$/.test(body)) {
    throw new Error(
      `${file} anchors the subject capture to the end of the command again, ` +
        'so a comma anywhere later drops the subject without a word'
    );
  }
  if (!body.includes('this.trimTopic(')) {
    throw new Error(
      `${file} no longer trims the instruction off the subject`
    );
  }

  // 으로 marks what to make it about and 에 marks where to send it, so the word
  // carrying them is treated differently. Collapsing the two was the bug.
  const trimOpens = source.indexOf('private trimTopic');
  const trim = source.slice(trimOpens, source.indexOf('\n  }', trimOpens));
  for (const [needle, why] of [
    // The particles themselves, not the names given to them: renaming a
    // constant is harmless, emptying it is not.
    ['(으로|로)', '으로, which keeps the word it attaches to'],
    ['(에다|에게|에)', '에, which drops the word it attaches to'],
    ['SNAPS_CARD_NEWS_WORDS', 'a format name, which is never the subject'],
  ]) {
    if (!trim.includes(needle)) {
      throw new Error(
        `${file} trimTopic no longer distinguishes ${why}`
      );
    }
  }

  // The format vocabularies were written out twice each before this; a third
  // copy in trimTopic is how such lists drift apart.
  const shortCopies = (source.match(/shorts\?\|숏폼/g) || []).length;
  if (shortCopies > 1) {
    throw new Error(
      `${file} spells the short-video vocabulary ${shortCopies} times again ` +
        'instead of once'
    );
  }
});

// Two expressions over two pieces of state decided whether the Naver Cafe board
// fields were needed and whether they were drawn, and they can disagree.
// Scheduling blocked on the transform result; the fields were rendered from the
// platform checkboxes. Transform with the cafe selected, untick it, and the
// operator is told they need a Cafe ID and a Menu ID with nowhere to type
// either - a dead end with no way forward on the page.
expectCustom('the Naver Cafe fields are drawn whenever scheduling can demand them', (read) => {
  const file = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
  const source = read(file);

  // Both sides have to ask the same function.
  for (const [needle, why] of [
    ['snapsNaverCafePending(', 'the scheduling guard'],
    ['snapsShowNaverCafeFields(', 'the field rendering'],
  ]) {
    if (!source.includes(needle)) {
      throw new Error(
        `${file} decides ${why} on its own again, so the fields and the ` +
          'block they satisfy can disagree'
      );
    }
  }
  // The old rendering condition is what made them disagree.
  if (/\{selectedPlatforms\.includes\('naver-cafe'\) &&/.test(source)) {
    throw new Error(
      `${file} draws the Naver Cafe fields from the platform checkboxes ` +
        'again, which is not what scheduling blocks on'
    );
  }

  const shared =
    'apps/frontend/src/components/snaps/snaps-workspace.shared.ts';
  const sharedSource = read(shared);
  const opens = sharedSource.indexOf('export const snapsNaverCafePending');
  if (opens < 0) {
    throw new Error(`${shared} no longer answers whether the cafe is pending`);
  }
  const declaration = declarationBody(sharedSource, opens);
  const arrow = declaration.indexOf('=>');
  const body = declaration.slice(
    arrow,
    declaration.indexOf(';', arrow < 0 ? 0 : arrow)
  );
  // A cafe variant only blocks scheduling when it is schedulable AND the
  // channel is connected; dropping either makes the fields appear for a
  // channel that will never be scheduled, or hides them when it will.
  for (const [needle, why] of [
    ["publishMode === 'schedule'", 'an assist-only cafe variant is never scheduled'],
    ['connectedPlatforms', 'a cafe variant with no cafe channel is never scheduled'],
  ]) {
    if (!body.includes(needle)) {
      throw new Error(`${shared} no longer checks that ${why}`);
    }
  }
});

// Nothing in the snaps scheduling path asked whether the chosen time had
// already gone by. The post workflow treats a past publishDate as `sleep(0)` -
// it publishes immediately - so a year typed wrong sent the post to every
// connected channel there and then, while the operator had confirmed a
// *scheduled* publication. The three workspaces each rejected only what Date
// cannot parse, which a past date parses perfectly well.
// A date the model supplied is a guess, and a guess in the past went straight
// into the plan. The publishing builder refuses a past time, so the operator met
// an error about a moment they never chose, at the schedule step, having typed
// no time at all. What the operator's own words resolved to is left alone.
expectCustom('a model publish time behind the clock is dropped', (read) => {
  const file =
    'libraries/nestjs-libraries/src/snaps/agent/command-planner.service.ts';
  const source = read(file);
  // The comparison itself. Pinned as text because it is one expression and
  // there is no way to write it that means something else.
  if (
    !source.includes(
      'new Date(modelPublishDate).getTime() >= now.getTime()'
    )
  ) {
    throw new Error(
      `${file} no longer drops a model publish time behind the clock, so a ` +
        'plan proposes a moment the operator never chose and the publishing ' +
        'builder refuses it later'
    );
  }
  if (!source.includes('operatorPublishDate ||')) {
    throw new Error(
      `${file} no longer prefers what the operator said over the model guess`
    );
  }
});

expectCustom('a publish time that has gone by is refused, not published now', (read) => {
  const builder =
    'libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts';
  const source = read(builder);
  if (!/SNAPS_PUBLISH_DATE_GRACE_MS/.test(source)) {
    throw new Error(
      `${builder} no longer knows where "already gone by" starts`
    );
  }
  // The comparison itself, not the name of the constant.
  if (!/getTime\(\) < now - SNAPS_PUBLISH_DATE_GRACE_MS/.test(source)) {
    throw new Error(
      `${builder} no longer refuses a publish time behind the clock, so a ` +
        'scheduled post publishes immediately instead'
    );
  }
  // The workflow only sleeps for a future date, which is what makes this
  // matter. If that ever changes this guard should be revisited, not deleted.
  //
  // Read the version the dispatch site actually names rather than a fixed
  // file. This was pinned to v1.0.4, which the registry comment states is
  // registered but never dispatched - so a change to the live v1.0.2 would
  // have left the guard passing against a dormant file. All four versions
  // happen to share the logic today, which is exactly why nothing failed.
  const dispatch = read(
    'libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts'
  );
  const dispatched = /'postWorkflowV(\d+)'/.exec(dispatch);
  if (!dispatched) {
    throw new Error(
      'posts.service.ts no longer names a post workflow version, so the live ' +
        'workflow cannot be identified'
    );
  }
  // postWorkflowV102 -> post.workflow.v1.0.2.ts
  const workflow =
    'apps/orchestrator/src/workflows/post-workflows/post.workflow.v' +
    dispatched[1].split('').join('.') +
    '.ts';
  if (!read(workflow).includes('isBefore(dayjs())')) {
    throw new Error(
      `${workflow} no longer treats a past publishDate as publish-now; the ` +
        'reason the builder refuses one may have changed'
    );
  }

  const shared =
    'apps/frontend/src/components/snaps/snaps-workspace.shared.ts';
  // Followed by =, not merely starting with the name: a rename to
  // snapsPublishDateProblemRenamed satisfied a plain includes().
  if (!/export const snapsPublishDateProblem\s*=/.test(read(shared))) {
    throw new Error(`${shared} no longer answers what is wrong with a time`);
  }
  // All three workspaces ask it, rather than each testing for NaN alone.
  for (const file of [
    'apps/frontend/src/components/snaps/snaps-workspace.tsx',
    'apps/frontend/src/components/snaps/snaps-card-news-workspace.tsx',
    'apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx',
  ]) {
    const workspace = read(file);
    if (!workspace.includes('snapsPublishDateProblem(publishDate)')) {
      throw new Error(
        `${file} validates the publish time on its own again, so a time that ` +
          'has gone by reaches the server'
      );
    }
    if (/if \(Number\.isNaN\(parsedPublishDate\.getTime\(\)\)\) \{/.test(workspace)) {
      throw new Error(
        `${file} gates on Date parsing alone again, which a past date passes`
      );
    }
  }
});

// A guard that can never fire is worse than no guard: it reads as protection
// while the thing it names goes unchecked. This file is full of needles matched
// against repo sources, and the repo is CRLF - so a needle carrying a newline
// only matches when nothing in the needle sits immediately before that newline.
// `indexOf('\n  }')` is fine; `'const x =\n  y'` never matches, because the
// file has `=\r\n  y` and the needle has no `\r`. That exact mistake was made
// here once and the guard it broke sat green until it was destructively tested.
// A sweep of the other eleven newline needles and eleven newline regexes found
// them all safe - the regexes absorb the `\r` with `\s*` or `[\s\S]` - so this
// is here to keep it that way rather than to fix anything.
expectCustom('no needle in this file is unmatchable on a CRLF source', (read) => {
  const self = 'scripts/verify-snaps-static.mjs';
  const source = read(self);
  const CALL = /(?:includes|indexOf|startsWith|endsWith)\(\s*'((?:[^'\\]|\\.)*)'/g;

  const dead = [];
  let match;
  while ((match = CALL.exec(source)) !== null) {
    // An escaped backslash is not the start of an escape sequence. Taking the
    // raw text at face value made the first version of this guard flag its own
    // needle, which is literally the two characters it is looking for.
    const needle = match[1].replace(/\\\\/g, '\u0000');
    const at = needle.indexOf('\\n');
    // A newline at the very start of the needle matches the \n half of a CRLF.
    // Anywhere else the \r sits between it and the text before it in the
    // needle, so nothing matches, ever.
    if (at > 0) {
      const line = source.slice(0, match.index).split(/\r?\n/).length;
      dead.push(`${line}: ${match[1].slice(0, 60)}`);
    }
  }

  if (dead.length) {
    throw new Error(
      'these needles carry a newline with text before it, so they never match ' +
        'a CRLF source and the guards using them cannot fire:\n  ' +
        dead.join('\n  ')
    );
  }
});

// The Shorts-Maker client handed its response body on with an unvalidated
// cast, so whatever that service returned arrived typed as a valid answer. The
// reader then did String(answer.script || ''), which turns an object into the
// literal text [object Object] and an array into a,b - and that went into the
// operator source box, over what was already there.
// The card news response was taken at its word and put into state, and the
// render guarded only that a deck existed. Four of five shapes a 200 can carry
// throw in the slide list, and an exception during render unmounts the tree -
// the operator loses the panel instead of being told what went wrong.
// The agent panel maps over five lists the import normaliser never required:
// operation.progressSteps, operation.nextActions, operation.platformReadiness,
// and the two inside plan.marketingStrategy. A task whose operation carried
// only progress imported and stored happily, and opening it from the history
// threw during render - which unmounts the tree, so the panel simply vanished.
expectCustom('a stored agent task is filled in before the panel renders it', (read) => {
  const file = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
  const source = read(file);
  const opens = source.indexOf('const openAgentTask');
  if (opens < 0) {
    throw new Error(file + ' no longer opens a stored agent task');
  }
  const body = source.slice(opens, source.indexOf('\n  };', opens));
  if (!body.includes('readSnapsAgentResult(')) {
    throw new Error(
      file +
        ' puts a stored task straight into state again, so one missing list ' +
        'takes the agent panel down when it renders'
    );
  }
  const shared = 'apps/frontend/src/components/snaps/snaps-workspace.shared.ts';
  const reader = read(shared);
  if (!/export const readSnapsAgentResult/.test(reader)) {
    throw new Error(shared + ' no longer fills the lists the panel reads');
  }
  for (const field of ['progressSteps', 'nextActions', 'revenueModels']) {
    if (!reader.includes(field + ': asList(')) {
      throw new Error(
        shared + ' no longer guarantees ' + field + ' is an array, and the ' +
          'panel maps over it'
      );
    }
  }
  // Filling the outer list was not enough: the panel reads item.checks,
  // item.blockers and lane.kpis on the entries inside these lists, and an
  // imported task with the entries present but those fields absent threw.
  for (const nested of [
    'platformReadiness: asListOfEntries(',
    'executionPlan: asListOfEntries(',
    'lanes: asListOfEntries(',
  ]) {
    if (!reader.includes(nested)) {
      throw new Error(
        shared + ' no longer fills the lists on the entries of ' + nested
      );
    }
  }
});

// The growth insight puts a percentage beside the absolute change, taken
// against the starting value. Zero was already omitted; a negative base was
// not, and it flips the sign - a metric that went from -100 to 50 was reported
// as +150(-150%) 증가했습니다, a sentence that says it grew beside a number that
// says it shrank. Metric values arrive from imported JSON too.
// publishDateLocal renders in whichever offset the caller supplied, so it reads
// correctly whatever was assumed and hides the assumption. The workspace sends
// the browser offset; the chat tool has no browser and gets the Korean default.
// Measured on one command: the chat path resolved 01:00Z where a UTC browser
// resolved 10:00Z, nine hours apart, and both rendered 10:00.
// A plan carries an instant and a rendering of it, and the rendering is made in
// whatever offset the caller supplied. Restoring a stored task put that
// rendering into the scheduling input, which is read back in the browser zone:
// a task planned through chat as 10:00 KST came back as 10:00 UTC when opened
// in a UTC browser, nine hours later than the plan meant.
// The card news workspace has read snaps.cardnews.handoff.v1 since it was
// written, and docs/snaps-card-news.md describes the button that fills it - but
// no button existed, so an operator who asked the agent for card news saw the
// deck in the plan with no way to carry it across, unlike shorts. The page type
// did not even declare the field the server sends.
// The workspace export writes six stores and the import summary counts six,
// but the demo sample shipped five: importing it reported 0 agent tasks, so the
// one flow an operator is handed to try the feature could not exercise the
// store that holds their agent history.
// The audit document says what is verified now, and its test line said '12
// tests passed' while the suite ran 389 - a number left behind as the suite
// grew, with a list of twelve areas beside it. Counting the tests for real here
// would mean running jest from a static check; the floor below is enough to
// catch a claim that has stopped tracking, without failing on every new test.
// The health card read its reason from health.error, which the route never
// sends - it lives on health.ollama - and the page type declared the field it
// was reading, so the wrong level compiled. The comment beside that read said it
// existed so a failed check would not look like a model that is not ready, which
// is exactly what kept happening.
// Nothing checked that the directory the six JSON stores live in can be written.
// Measured with a file sitting where the directory should be: health echoed the
// path, every read returned [] with no warning (Windows answers ENOENT, the same
// code that means "not written yet"), and the first save threw a raw EEXIST. The
// operator saw an empty workspace and had every reason to read it as data loss.
// Five stores each created the data directory themselves, and a failure there
// threw a plain Error - which Nest turns into a 500 whose body says only
// "Internal server error". A misconfigured store therefore told the operator
// nothing: not the path, not the reason, not that a directory was the problem.
// Nest replaces the message of anything that is not an HttpException with
// "Internal server error", so a plain Error on a request path tells the
// operator nothing. A sweep found thirteen in the snaps tree; all but the
// two here are caught by a fallback, or belong to the publish worker where
// the message is recorded on the post instead.
// The media library file name was bounded as a whole, so a long URL lost
// its extension: a 200-character path ending in `.mp4` came back as 120
// characters ending in `x`. That name becomes the stored media path, and
// the path is checked by ValidUrlExtension further down the attach flow,
// so a long CDN URL turned into a 400 about the file type - for a file
// whose type was never in question.
// The live verifiers fail by default and clear it only when main() reaches its
// end, so a hang cannot be reported as a pass. Both dry-run paths set the
// `completed` flag and returned without clearing the code, so they printed their
// own -dry-run-ok line and still exited 1 - and verify:snaps:preflight, which
// runs both as steps, had been failing as a whole gate.
// The health headline said 'Ollama 응답 없음' for a DeepSeek deployment with no
// key and for one whose key had been rotated - wrong engine and wrong cause,
// pointing the operator at a local server while the fix was DEEPSEEK_API_KEY.
// It reads structural facts now, not the API's prose.
// Style examples are optional, so failing to read them must not cost the whole
// transform. The lookup sat outside the try, so an unreadable example store
// threw a plain Error out of transform() - a 500 saying only "Internal server
// error" - while a total model outage degraded politely to rule output.
// Every snaps store reads with `catch { return [] }`, on purpose - a file that
// does not exist yet is the normal first run. The cost is that a damaged file
// looks exactly like an empty one, and the only trace was a server log line
// nobody watches. The store's own doc named the case: nobody writes, so the
// file is never quarantined, and it is never mentioned at all.
// The words came from a ranking and the colour from a separate reading of the
// same payload, so they disagreed: an unwritable store and a damaged store file
// - first and second in that ranking, because an empty library reads as data
// loss - were painted the same green as '모델 준비됨'.
// An embed call that fails is swallowed on purpose - a style example is still
// worth keeping without a vector - so a brief Ollama outage silently produced a
// library where keyword matches beat every semantic one. The vector store says
// so in its own comment; nothing said it to the operator. And the list route
// stripped the vector while the three save routes returned it, so the same
// record had two shapes and kilobytes of JSON no caller reads.
// The orchestrator bootstrap read its Temporal timeout with
// `Number(process.env.X || 5000)` while the health probe used the shared
// parser. Measured across eight inputs, five of them - `abc`, `10s`, `0`,
// `-1`, whitespace - produced a timer that fires immediately, so a typo in the
// env var made the worker give up on Temporal at once with a message reading
// `timed out after NaNms`. The local const shadowed the helper's own name,
// which is why importing only withTemporalTimeout still compiled.
expectCustom('the orchestrator parses its Temporal timeout once', (read) => {
  const main = 'apps/orchestrator/src/main.ts';
  const source = read(main);
  if (!source.includes('temporalTimeoutMs(')) {
    throw new Error(
      main +
        ' derives its Temporal timeout without the shared parser, so an ' +
        'unparseable env var becomes a timer that fires immediately'
    );
  }
  if (/Number\(\s*process\.env\.TEMPORAL/.test(source)) {
    throw new Error(
      main + ' parses a Temporal env var with a bare Number() again'
    );
  }
  // A local binding of the helper's own name is what hid this: the import and
  // the shadow can coexist without a compile error.
  if (/const temporalTimeoutMs\s*=/.test(source)) {
    throw new Error(
      main + ' shadows the shared parser with a local of the same name'
    );
  }

  const helper = 'apps/orchestrator/src/temporal-timeout.ts';
  const helperSource = read(helper);
  if (!testsBothWays(helperSource, 'Number.isFinite(parsed)', 'parsed > 0')) {
    throw new Error(
      helper + ' no longer rejects a non-positive or unparseable timeout'
    );
  }
});

// An over-long paste was cut to 50,000 characters and the run reported success
// with no warnings at all - measured at 80,000 characters in, thirty thousand
// of the operator's own article gone in silence. Every other place snaps drops
// something says so.
// The same paste was cut to three different lengths depending on which button
// was pressed - 50,000 for a transform, 6,000 for a deck, 5,000 for a short -
// and the deck and shorts routes said nothing at all. The card news workspace
// takes its source by handoff from the transform workspace, so an article that
// transformed whole became a deck built from its first 6,000 characters.
// Reporting what was cut only matters if it reaches the screen. Both
// workspaces read `warnings` from the schedule response alone, so the deck and
// shorts steps - the two that clamp hardest, at 6,000 and 5,000 characters -
// told the operator nothing. The box already existed; it was fed by one step.
expectCustom('a clamped source reaches the workspace that clamped it', (read) => {
  const surfaces = [
    [
      'apps/frontend/src/components/snaps/snaps-card-news-workspace.tsx',
      'the card news deck step',
    ],
    [
      'apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx',
      'the shorts script step',
    ],
  ];
  for (const [path, what] of surfaces) {
    const source = read(path);
    // Renamed from scheduleWarnings, because a name that says one step is how
    // the other step's warnings went nowhere.
    if (source.includes('scheduleWarnings')) {
      throw new Error(
        `${path} names its warning box after one step again, which is how ` +
          `${what} lost its own warnings`
      );
    }
    const writers = source.match(/set\w*Warnings\(/g) || [];
    if (writers.length < 2) {
      throw new Error(
        `${path} feeds its warning box from ${writers.length} step(s), so ` +
          `${what} has nowhere to report what it cut`
      );
    }
    if (!/\w*Warnings\.slice\(0, 5\)/.test(source)) {
      throw new Error(`${path} no longer renders the warning box`);
    }
  }
});

// One cleaner flattened everything. That is right for a title, a topic, a
// platform name or an id, and wrong for anything the operator wrote as a body:
// measured, a seven-line reply draft and a seven-line RAG style example both
// came back as one line, and publish-reply sends that to a real channel. The
// style example is the sharpest - it exists to teach a writing style, and in
// Korean SNS the line breaks are a large part of it.
// Fixing the controller's cleaner left every service flattening the same field
// a layer down, and the controller smoke stubs the RAG service so it looked
// fixed. One cleaner, imported by everyone who stores a body.
// The fallback storyboard narrated 120-character windows of the source, so a
// source shorter than 120 x sceneCount left every window after the first empty
// and each fell back to the whole summary - four scenes with the same words.
// Card news was moved onto the sentence splitter for the same symptom; the
// shorts fallback was not.
expectCustom('the fallback storyboard narrates sentences, not byte windows', (read) => {
  const service = 'libraries/nestjs-libraries/src/snaps/video/short-video.service.ts';
  const source = read(service);
  if (!source.includes('snapsSplitSentences(source)')) {
    throw new Error(
      service +
        ' builds its fallback beats from something other than sentences, so a ' +
        'short source repeats one block in every scene'
    );
  }
  if (/narration: source\.slice\(/.test(source)) {
    throw new Error(
      service + ' narrates byte windows of the source again'
    );
  }
  // Proportional boundaries, not a fixed group size: six sentences over four
  // scenes at ceil(6/4)=2 fills three and leaves the fourth repeating one.
  if (!/Math\.floor\(\(index \* sentences\.length\) \/ sceneCount\)/.test(source)) {
    throw new Error(
      service +
        ' spreads sentences over scenes with a fixed group size again, which ' +
        'leaves the last scenes empty and repeating'
    );
  }
  // The scene count is the timeline the renderer is handed and must stay a
  // function of the duration.
  if (!/durationSeconds <= 30 \? 4 : durationSeconds >= 70 \? 6 : 5/.test(source)) {
    throw new Error(
      service + ' no longer derives the scene count from the duration'
    );
  }
});

// A Naver Cafe article body is HTML, so a newline in it is whitespace, and
// everything snaps sends is plain text. Measured through the provider: a
// six-line reply went out as one run-on paragraph. This is the one platform
// snaps publishes to with its own provider, and the last place in the chain
// where the writer's line breaks have to become markup.
// The inbox reads the same Korean twice: once to file a comment in a bucket and
// once to raise a conversion signal. classify() was fixed so 문제없- stops
// reading as 문제, and the signal list twenty lines below it was not - a
// satisfied comment came back flagged complaint-risk. Two lists reading the
// same words have to stay in step.
// The global ValidationPipe answers before the handler does, so a decorator
// without a message hands a Korean operator an English sentence and the
// controller's own Korean one is never reached. Measured: `sourceText must be
// longer than or equal to 5 characters` for the commonest mistake there is.
// Every RAG search falls through to keyword matching whenever the embedder is
// down, and addExample stores no vector when it is. The rule only matched a
// Korean word against its bare form, so a query and a stored example wearing
// different particles scored 0 - and at 0 an unrelated example ranked first.
// A proxy in front of an optional service answers with an error page, and that
// page became the operator's message verbatim. Two of the three HTTP clients
// compressed one to the status; the third did not - measured, a 502 reached
// the operator as `<html><body>Bad Gateway</body></html>`.
// /snaps/import fans out to six stores and returns their counts as one
// summary, so the counts have to mean the same thing. Two of them capped the
// incoming list before the merge and derived `dropped` from the merge alone,
// which made everything the cap cut invisible: measured, 60,000 style examples
// imported as `imported: 500, dropped: 0`. Any store that caps its incoming
// list has to carry that cut into `dropped`.
// The activity type list was written out twice - a union and the array
// record() checks against - and `'card-news'` reached only the union. The
// compiler accepts either list on its own, so the three card-news routes
// did all of their work and then threw on the last line. The union is
// derived from the array now; writing a second one by hand puts the same
// hole back.
// Every route handler has to be called by at least one smoke.
//
// Three card-news routes answered 400 to a request that had succeeded -
// the controller recorded an activity kind the log's own list did not
// carry - and 416 tests plus 1193 static checks said nothing, because the
// failing line only runs when the route runs. Measured at the time: 23 of
// the 50 handlers were called by no smoke at all. A handler added without
// a caller puts that blind spot straight back.
// A union of string literals and a runtime array of the same strings, both
// written out by hand, in one file.
//
// `'card-news'` reached `SnapsActivityType` and not the array record() checks
// against. The compiler is satisfied by either list on its own, so the three
// card-news routes did all of their work and threw on the last line. That one
// is derived from its array now; this is the general case, for the next pair.
//
// Swept across the snaps tree when it was written: 17 literal unions, 9
// literal arrays, 2 same-file pairs, both in agreement.
expectCustom('no file spells the same literal list out twice', (read) => {
  const walk = (dir) => {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist') {
          out.push(...walk(full));
        }
      } else if (
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
        !entry.name.includes('.spec.')
      ) {
        out.push(full);
      }
    }
    return out;
  };
  const files = [
    'libraries/nestjs-libraries/src/snaps',
    'apps/backend/src/api/routes/snaps.controller.ts',
    'apps/frontend/src/components/snaps',
  ].flatMap((entry) => (entry.endsWith('.ts') ? [entry] : walk(entry)));
  if (files.length < 20) {
    throw new Error(
      `only ${files.length} snaps sources were scanned; the walk is broken ` +
        'and this guard would pass without checking anything'
    );
  }

  const literals = (text) =>
    new Set((text.match(/'[^']+'/g) || []).map((raw) => raw.slice(1, -1)));

  let pairs = 0;
  for (const file of files) {
    const source = read(file);
    const unions = [];
    const unionPattern =
      /(?:export\s+)?type\s+(\w+)\s*=\s*((?:\s*\|?\s*'[^']+')+)\s*;/g;
    let match;
    while ((match = unionPattern.exec(source))) {
      const members = literals(match[2]);
      if (members.size >= 3) {
        unions.push([match[1], members]);
      }
    }
    if (!unions.length) {
      continue;
    }
    const arrays = [];
    const arrayPattern =
      /(?:const|let)\s+(\w+)(?:\s*:[^=\n]+)?\s*=\s*\[([^\]]*?)\]/g;
    while ((match = arrayPattern.exec(source))) {
      if (/[{}()]/.test(match[2])) {
        continue;
      }
      const members = literals(match[2]);
      if (members.size >= 3) {
        arrays.push([match[1], members]);
      }
    }
    for (const [unionName, unionMembers] of unions) {
      for (const [arrayName, arrayMembers] of arrays) {
        const shared = [...unionMembers].filter((member) =>
          arrayMembers.has(member)
        );
        if (shared.length < 3) {
          continue;
        }
        pairs += 1;
        const onlyUnion = [...unionMembers].filter(
          (member) => !arrayMembers.has(member)
        );
        const onlyArray = [...arrayMembers].filter(
          (member) => !unionMembers.has(member)
        );
        if (onlyUnion.length || onlyArray.length) {
          throw new Error(
            `${file} writes the same list twice and the two copies disagree: ` +
              `type ${unionName} and array ${arrayName}` +
              (onlyUnion.length
                ? `; in the type only: ${onlyUnion.join(', ')}`
                : '') +
              (onlyArray.length
                ? `; in the array only: ${onlyArray.join(', ')}`
                : '') +
              '. Derive one from the other - `(typeof theArray)[number]` - so ' +
              'they cannot drift again'
          );
        }
      }
    }
  }
  if (pairs < 1) {
    throw new Error(
      'no union/array pair was found anywhere, so the patterns are broken ' +
        'and this guard would pass without checking anything'
    );
  }
});

expectCustom('every controller route is driven by a smoke', (read) => {
  const controller = read('apps/backend/src/api/routes/snaps.controller.ts');
  const handlerPattern =
    /@(Get|Post|Delete|Put|Patch)\('([^']*)'\)[\s\S]{0,400}?\n\s*(?:async\s+)?([A-Za-z0-9_]+)\s*\(/g;
  const handlers = [];
  let match;
  while ((match = handlerPattern.exec(controller))) {
    handlers.push([`${match[1].toUpperCase()} ${match[2]}`, match[3]]);
  }
  if (handlers.length < 40) {
    throw new Error(
      `only ${handlers.length} route handlers were found in the snaps ` +
        'controller; the pattern is broken and this guard would pass ' +
        'without checking anything'
    );
  }
  const smokes = [
    'scripts/verify-snaps-controller.ts',
    'scripts/verify-snaps-services.ts',
    'scripts/verify-snaps-cardnews-deepseek.ts',
    'scripts/verify-snaps-core-deepseek.ts',
  ].map((file) => read(file));
  const uncalled = handlers.filter(
    ([, handler]) =>
      !smokes.some((smoke) =>
        new RegExp(`[A-Za-z0-9_]+\\.${handler}\\(`).test(smoke)
      )
  );
  if (uncalled.length) {
    throw new Error(
      'no smoke calls these route handlers, so a route that does its work ' +
        'and then throws on its last line would go unnoticed:\n  ' +
        uncalled.map(([route, handler]) => `${route} -> ${handler}()`).join('\n  ')
    );
  }
});

expectCustom('the activity type list is written once', (read) => {
  const source = read(
    'libraries/nestjs-libraries/src/snaps/activity/activity-log.service.ts'
  );
  if (
    !/export type SnapsActivityType = \(typeof snapsActivityTypes\)\[number\]/.test(source)
  ) {
    throw new Error(
      'SnapsActivityType is no longer derived from snapsActivityTypes, so ' +
        'the union and the list record() checks against can disagree again'
    );
  }
  if (/export type SnapsActivityType =\s*\n\s*\|/.test(source)) {
    throw new Error(
      'SnapsActivityType is spelled out as a hand-written union again'
    );
  }
  // and the controller may not write a kind the list has never heard of.
  const listed = (source.match(/const snapsActivityTypes = \[([\s\S]*?)\] as const;/) || [
    '',
    '',
  ])[1];
  const known = new Set(
    Array.from(listed.matchAll(/'([a-z][a-z-]*)'/g)).map((m) => m[1])
  );
  if (known.size < 8) {
    throw new Error(
      `only ${known.size} activity types were read out of the list; this ` +
        'guard would pass without checking anything'
    );
  }
  const controller = read('apps/backend/src/api/routes/snaps.controller.ts');
  for (const [, kind] of controller.matchAll(
    /activity\.record\([\s\S]{0,200}?type: '([a-z][a-z-]*)'/g
  )) {
    if (!known.has(kind)) {
      throw new Error(
        `the controller records activity of kind '${kind}', which ` +
          'snapsActivityTypes does not list - record() throws on it and a ' +
          'restore drops it'
      );
    }
  }
});

expectCustom('an import cap is carried into the dropped count', (read) => {
  const stores = [
    'libraries/nestjs-libraries/src/snaps/library/source-library.service.ts',
    'libraries/nestjs-libraries/src/snaps/rag/vector-store.service.ts',
    'libraries/nestjs-libraries/src/snaps/activity/activity-log.service.ts',
    'libraries/nestjs-libraries/src/snaps/agent/agent-task.service.ts',
    'libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts',
  ];
  for (const store of stores) {
    const source = read(store);
    // The cut happens where the arrived list is sliced before the merge.
    const caps = /const incoming = arrived\.slice\(/.test(source);
    const carries = /arrived\.length - incoming\.length/.test(source);
    if (caps !== carries) {
      throw new Error(
        store +
          (caps
            ? ' caps its incoming list before the merge but never adds that cut to `dropped`, so the response says nothing was lost'
            : ' adds an incoming cut to `dropped` without capping the incoming list, which cannot be right')
      );
    }
    // Where nothing is cut, `incoming` is the whole normalised list and
    // reporting it is reporting what the caller sent. Only a store that caps
    // has to name the uncapped list.
    if (caps && /imported: incoming\.length/.test(source)) {
      throw new Error(
        store +
          ' reports `imported` as what survived the cap rather than what the caller sent, which is not what the other stores report'
      );
    }
  }
});

expectCustom('an HTML error page never becomes the message', (read) => {
  const clients = [
    'libraries/nestjs-libraries/src/snaps/shorts-maker/shorts-maker-client.service.ts',
    'libraries/nestjs-libraries/src/snaps/video/short-video.service.ts',
    'libraries/nestjs-libraries/src/snaps/ai/deepseek.client.ts',
  ];
  for (const client of clients) {
    const source = read(client);
    if (!source.includes("startsWith('<')")) {
      throw new Error(
        client +
          ' hands an HTML error body to the operator as the message, which the ' +
          'other clients compress to the status'
      );
    }
    if (!source.includes('HTML error response')) {
      throw new Error(
        client + ' no longer says the body was markup when it has nothing else'
      );
    }
  }
});

expectCustom('a zero-score RAG hit is not offered as a match', (read) => {
  const store =
    'libraries/nestjs-libraries/src/snaps/rag/vector-store.service.ts';
  const storeSource = read(store);
  if (!storeSource.includes('sharesStem')) {
    throw new Error(
      store +
        ' matches a Korean token only against its bare form again, so a query ' +
        'wearing a different particle scores zero'
    );
  }
  // Two characters is the unit for a Hangul syllable and far too weak for a
  // Latin letter: `humidity` and `humble` share `hu`.
  if (!storeSource.includes('HANGUL_START')) {
    throw new Error(
      store + ' applies the Hangul syllable threshold to Latin tokens too'
    );
  }

  // And a zero score is no evidence of a match. The transform path has always
  // dropped those; the search route answered with a full page of them.
  const controller = 'apps/backend/src/api/routes/snaps.controller.ts';
  if (!read(controller).includes('.filter((hit) => hit.score > 0)')) {
    throw new Error(
      controller +
        ' offers zero-score RAG hits as matches, which the transform path ' +
        'refuses to use'
    );
  }
  const workspace = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
  if (!read(workspace).includes('조건에 맞는 유사 스타일 예시가 없습니다')) {
    throw new Error(
      workspace + ' says it found similar examples whether or not it did'
    );
  }
});

expectCustom('a rejected snaps request is rejected in Korean', (read) => {
  const dtos = [
    'libraries/nestjs-libraries/src/snaps/dto/transform-request.dto.ts',
    'libraries/nestjs-libraries/src/snaps/dto/feedback-inbox.dto.ts',
    'libraries/nestjs-libraries/src/snaps/dto/source-library.dto.ts',
  ];
  for (const dto of dtos) {
    const source = read(dto);
    // Every decorator that can fail carries one. IsOptional never speaks.
    const speakable = (
      source.match(/@(?:IsString|IsArray|IsBoolean|IsDateString|IsIn|MinLength|MaxLength)\(/g) || []
    ).length;
    const withMessage = (source.match(/message: '/g) || []).length;
    if (withMessage < speakable) {
      throw new Error(
        `${dto} leaves ${speakable - withMessage} of its ${speakable} ` +
          'validation decorators answering in English, which is what the ' +
          'operator sees before the controller is reached'
      );
    }
  }
});

expectCustom('the inbox reads a negated complaint the same way twice', (read) => {
  const service =
    'libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts';
  const source = read(service);
  // Two guarded copies, or one guarded pattern that both readers share. The
  // second is what it is now: as copies they drifted anyway - the complaint
  // list grew in classify() and not in detectConversionSignals(), and five
  // comments classified as complaints came back with no complaint-risk signal.
  const guarded = source.match(/문제\(\?!/g) || [];
  const sharedReaders = (source.match(/SNAPS_COMPLAINT_PATTERN/g) || []).length;
  const readsTheSameWayTwice = guarded.length >= 2 || (guarded.length === 1 && sharedReaders >= 3);
  if (!readsTheSameWayTwice) {
    throw new Error(
      service +
        ` guards 문제 against its own negation in ${guarded.length} place(s) ` +
        `and shares the pattern across ${sharedReaders} reference(s); the ` +
        'sentiment and the signal have to read it the same way, or a ' +
        'satisfied comment is flagged again'
    );
  }
});

expectCustom('a Naver Cafe body turns line breaks into markup', (read) => {
  const provider =
    'libraries/nestjs-libraries/src/integrations/social/naver-cafe.provider.ts';
  const source = read(provider);
  if (!source.includes("'<br />'")) {
    throw new Error(
      provider +
        ' posts plain text with raw newlines again, which a cafe article ' +
        'renders as one paragraph'
    );
  }
  if (!source.includes("'</p><p>'")) {
    throw new Error(provider + ' no longer treats a blank line as a paragraph');
  }
  // Only for plain text: a message that already carries its own line structure
  // would get a stray break between every pair of tags.
  if (!source.includes('/<[a-z]/i.test(sanitised)')) {
    throw new Error(
      provider +
        ' inserts breaks into a message that already has its own, so an HTML ' +
        'body gains a stray <br /> between every pair of tags'
    );
  }
  // And the sanitising still runs first, on what arrived rather than on the
  // markup this function just wrote.
  const wrapAt = source.indexOf("'<br />'");
  const sanitiseAt = source.indexOf('javascript');
  if (sanitiseAt < 0 || wrapAt < 0 || sanitiseAt > wrapAt) {
    throw new Error(
      provider + ' sanitises after wrapping rather than before'
    );
  }
});

expectCustom('every stored body uses the shared cleaner', (read) => {
  const helper = 'libraries/nestjs-libraries/src/snaps/text/body-text.ts';
  const helperSource = read(helper);
  // The character class it uses is the whole point: whitespace that is not
  // a newline.
  if (!helperSource.includes('[^')) {
    throw new Error(helper + ' no longer spells out what it may collapse');
  }
  if (!/snapsClampText\(/.test(helperSource)) {
    throw new Error(helper + ' clamps a body without grapheme safety');
  }

  const stores = [
    // The published half: both variant builders cleaned the caption with the
    // helper they use for the title and the media urls beside it.
    ['libraries/nestjs-libraries/src/snaps/cardnews/card-news-variant.builder.ts', 1],
    ['libraries/nestjs-libraries/src/snaps/video/video-variant.builder.ts', 1],
    // The degraded paths publish the operator's own text, so they publish it
    // in the shape it was written: the transform rule fallback and the
    // shorts source both flattened it.
    ['libraries/nestjs-libraries/src/snaps/transform/content-transform.service.ts', 1],
    ['libraries/nestjs-libraries/src/snaps/video/short-video.service.ts', 1],
    ['libraries/nestjs-libraries/src/snaps/rag/rag.service.ts', 1],
    ['libraries/nestjs-libraries/src/snaps/library/source-library.service.ts', 1],
    // Two normalizers: the incoming comment and the stored one. Fixing one
    // leaves an imported backup flattened while a fresh comment keeps its
    // lines.
    ['libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts', 2],
    ['apps/backend/src/api/routes/snaps.controller.ts', 1],
  ];
  for (const [path, expected] of stores) {
    const source = read(path);
    const uses = source.match(/snapsCleanBodyText\(/g) || [];
    if (uses.length < expected) {
      throw new Error(
        `${path} cleans ${uses.length} of its ${expected} stored bodies with ` +
          'the shared cleaner, so the rest flatten a body into one line'
      );
    }
  }
});

expectCustom('operator body text keeps its line breaks', (read) => {
  const controller = 'apps/backend/src/api/routes/snaps.controller.ts';
  const source = read(controller);
  if (!/private cleanBodyText\(/.test(source)) {
    throw new Error(
      controller + ' no longer separates body text from single-line fields'
    );
  }
  // The body cleaner must not be the flattening one wearing a new name.
  const body =
    /private cleanBodyText[\s\S]*?(?=\n  (?:private|public|protected|@|async )|$)/.exec(
      source
    );
  if (!body || /replace\(\/\\s\+\/g, ' '\)/.test(body[0])) {
    throw new Error(
      controller + ' flattens body text again, so a reply publishes as one line'
    );
  }
  if (!/snapsCleanBodyText\(/.test(body[0])) {
    throw new Error(
      controller +
        ' cleans body text itself again instead of through the shared ' +
        'helper, which is how the services kept flattening it a layer down'
    );
  }
  // Every body goes through it. A field left on the flattening helper is the
  // defect, one call site at a time.
  const bodies = source.match(/this\.cleanBodyText\(/g) || [];
  if (bodies.length < 5) {
    throw new Error(
      controller +
        ` cleans ${bodies.length} of its five body fields as body text ` +
        '(two replies, two captions, one style example)'
    );
  }
  // And single-line fields keep the flattening cleaner, or ids and titles
  // start carrying newlines.
  if (!/private cleanOptionalString[\s\S]{0,200}?replace\(/.test(source)) {
    throw new Error(
      controller + ' no longer flattens the fields that are single-line by nature'
    );
  }
});

expectCustom('every source clamp says what it left out', (read) => {
  const controller = 'apps/backend/src/api/routes/snaps.controller.ts';
  const source = read(controller);
  for (const limit of [
    'SNAPS_TRANSFORM_SOURCE_LIMIT',
    'SNAPS_CARD_NEWS_SOURCE_LIMIT',
    'SNAPS_SHORT_VIDEO_SOURCE_LIMIT',
  ]) {
    if (!source.includes(limit)) {
      throw new Error(`${controller} no longer names ${limit}`);
    }
  }
  // One helper, so the three cannot drift in how they report - and it is
  // grapheme-safe, so a cut cannot put a lone surrogate into the prompt.
  if (!/private clampSourceText[\s\S]{0,400}?snapsClampText\(/.test(source)) {
    throw new Error(
      controller +
        ' no longer clamps source text through one grapheme-safe helper'
    );
  }
  if (!source.includes('자만 사용했습니다. ')) {
    throw new Error(
      controller + ' no longer says how much of the source it used'
    );
  }
  // Both normalizers hand the warning back, so the compiler walks every route
  // to it rather than leaving it to a guard to notice a forgotten one.
  for (const normalizer of [
    'normalizeCardNewsRequest',
    'normalizeShortVideoRequest',
  ]) {
    const body = new RegExp(
      `private ${normalizer}[\\s\\S]*?(?=\\n  (?:private|public|protected|@|async )|$)`
    ).exec(source);
    if (!body || !/return \{[\s\S]{0,20}?warnings,/.test(body[0])) {
      throw new Error(
        `${controller} ${normalizer} no longer returns what it cut, so a route ` +
          'can drop it without failing to compile'
      );
    }
  }
});

expectCustom('a truncated transform source is reported', (read) => {
  const controller = 'apps/backend/src/api/routes/snaps.controller.ts';
  const source = read(controller);
  if (!source.includes('SNAPS_TRANSFORM_SOURCE_LIMIT')) {
    throw new Error(
      controller + ' no longer names the source limit it cuts at'
    );
  }
  // Grapheme-safe, so the cut cannot put a lone surrogate into the prompt.
  if (!/sourceText = snapsClampText\(/.test(source)) {
    throw new Error(
      controller + ' cuts the transform source with a plain slice again'
    );
  }
  if (!source.includes('rawSourceLength > sourceText.length')) {
    throw new Error(
      controller + ' no longer notices that it cut the source'
    );
  }
  // Returning a pair is what makes the compiler walk every transform route to
  // the warning. An optional field would let a route ignore it in silence.
  if (
    !/private normalizeTransformRequest[\s\S]{0,600}?warnings: string\[\];/.test(
      source
    )
  ) {
    throw new Error(
      controller +
        ' no longer hands the truncation warning back from the normalizer, so ' +
        'a route can drop it without failing to compile'
    );
  }
  // All three routes share the normalizer.
  const destructured = source.match(
    /const \{ request, warnings \} = this\.normalizeTransformRequest\(/g
  ) || [];
  if (destructured.length < 3) {
    throw new Error(
      controller +
        ` reads the truncation warning on ${destructured.length} of its three ` +
        'transform routes'
    );
  }
});

expectCustom('a style example saved without a vector says so', (read) => {
  const controller = 'apps/backend/src/api/routes/snaps.controller.ts';
  const source = read(controller);
  if (!source.includes('embedded: !!saved.embedding?.length')) {
    throw new Error(
      controller +
        ' no longer reports whether a saved style example carries a vector, so ' +
        'an embedder outage is invisible until someone runs a rebuild'
    );
  }
  // Three save routes, one shape. Repeating the expression is how three copies
  // of the atomic writer drifted apart.
  const savers = source.match(/return this\.savedStyleExample\(saved\);/g) || [];
  if (savers.length < 3) {
    throw new Error(
      controller +
        ` returns the saved style example through the shared shape on ` +
        `${savers.length} of its three save routes`
    );
  }
  if (!/private savedStyleExample[\s\S]{0,200}?this\.withoutEmbedding\(saved\)/.test(source)) {
    throw new Error(
      controller +
        ' returns the embedding vector from a save route again, which the list ' +
        'route strips'
    );
  }

  const workspace = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
  const workspaceSource = read(workspace);
  if (!workspaceSource.includes("saved?.embedded === false")) {
    throw new Error(
      workspace + ' no longer tells the operator the example has no vector'
    );
  }
  // All three savers announce through the same reader.
  const callers =
    workspaceSource.match(/announceStyleExampleSaved\(/g) || [];
  if (callers.length < 3) {
    throw new Error(
      workspace +
        ` announces a saved style example through the shared reader at ` +
        `${callers.length} of its three save sites`
    );
  }
});

expectCustom('the health card paints the severity it announces', (read) => {
  const shared =
    'apps/frontend/src/components/snaps/snaps-workspace.shared.ts';
  const sharedSource = read(shared);
  if (!/export const snapsHealthVerdict\s*=/.test(sharedSource)) {
    throw new Error(
      shared + ' no longer answers how bad the headline is, only what it says'
    );
  }
  // The headline is the verdict, not a second walk through the same checks.
  if (
    !/export const snapsHealthHeadline[\s\S]{0,200}?snapsHealthVerdict\(/.test(
      sharedSource
    )
  ) {
    throw new Error(
      shared +
        ' derives the headline separately from the verdict again, so the two ' +
        'can disagree'
    );
  }
  // Severity is decided once, in the shared module.
  const card = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
  const cardSource = read(card);
  if (!cardSource.includes('SNAPS_HEALTH_TONE_CLASS[healthVerdict.tone]')) {
    throw new Error(
      card + ' picks the health colour from something other than the verdict'
    );
  }
  if (/chatModelAvailable === false[\s\S]{0,12}\? 'text-red/.test(cardSource)) {
    throw new Error(
      card + ' decides health severity itself again, beside the ranking'
    );
  }
  // And the damaged file is named, not merely announced.
  if (!cardSource.includes('health?.storage?.unreadable?.map(')) {
    throw new Error(
      card +
        ' announces a damaged store file without naming it, so the operator ' +
        'knows something is wrong and not what'
    );
  }
});

expectCustom('a damaged store file reaches the health card', (read) => {
  const registry =
    'libraries/nestjs-libraries/src/snaps/storage/warn-unreadable-file.ts';
  const registrySource = read(registry);
  if (!registrySource.includes('export function snapsUnreadableStores')) {
    throw new Error(
      registry +
        ' no longer exposes what failed to read, so a damaged store is a log ' +
        'line and nothing else'
    );
  }
  // A state, not a history: a card that keeps accusing a repaired file is
  // worse than the log line it replaced.
  if (!registrySource.includes('export async function refreshSnapsUnreadableStores')) {
    throw new Error(
      registry +
        ' no longer re-checks the files it recorded, so a repaired store keeps ' +
        'reading as broken until the process restarts'
    );
  }
  // Parsing alone would clear a file that still reads as empty everywhere else.
  if (!registrySource.includes('Array.isArray(parsed)')) {
    throw new Error(
      registry +
        ' calls a file readable on a bare parse, which is not what the stores ' +
        'mean by readable'
    );
  }

  const health =
    'libraries/nestjs-libraries/src/snaps/storage/data-dir-health.ts';
  const healthSource = read(health);
  if (!healthSource.includes('await refreshSnapsUnreadableStores()')) {
    throw new Error(health + ' no longer reports damaged store files');
  }
  // Both branches: a writable directory is exactly the case that hid this.
  const carriers = healthSource.match(/\.\.\.damaged/g) || [];
  if (carriers.length < 2) {
    throw new Error(
      health +
        ` carries the damaged-store list on ${carriers.length} of its two ` +
        'branches, and the writable branch is the one that hid it'
    );
  }

  const shared =
    'apps/frontend/src/components/snaps/snaps-workspace.shared.ts';
  const sharedSource = read(shared);
  // The store verdict was split out so the shorts workspace could ask the
  // same question; the ranking it feeds is unchanged.
  if (!sharedSource.includes("storage?.unreadable?.length")) {
    throw new Error(
      shared + ' no longer leads with a store file that cannot be read'
    );
  }
  if (!/export const snapsStorageVerdict\s*=/.test(sharedSource)) {
    throw new Error(
      shared +
        ' no longer answers what is wrong with the store on its own, so ' +
        'the shorts workspace has to spell the same fault a second way'
    );
  }
});

expectCustom('an unreadable style library does not kill the transform', (read) => {
  const service =
    'libraries/nestjs-libraries/src/snaps/transform/content-transform.service.ts';
  const source = read(service);
  if (!/catch \(\w+\) \{[\s\S]{0,400}?ragWarnings\.push\(/.test(source)) {
    throw new Error(
      service +
        ' no longer survives a style-example lookup that fails, so an ' +
        'unreadable store costs the whole request'
    );
  }
  // Both return paths carry it. Putting it on the model path alone would lose
  // the warning exactly when the run is already degraded.
  const carriers = source.match(/\.\.\.ragWarnings,/g) || [];
  if (carriers.length < 2) {
    throw new Error(
      service +
        ` carries the style-example warning on ${carriers.length} of its two ` +
        'return paths, so a degraded run drops it'
    );
  }
  // And it has to be a warning, not a silent empty list.
  if (!source.includes('스타일 예시')) {
    throw new Error(
      service +
        ' drops the style library without saying so, and a result that quietly ' +
        'ignores the saved style looks correct'
    );
  }
});

expectCustom('the health headline names the engine that failed', (read) => {
  const shared =
    'apps/frontend/src/components/snaps/snaps-workspace.shared.ts';
  const source = read(shared);
  // The provider decides the wording; a hardcoded engine name is the defect.
  if (!/const deepseek = ollama\.provider === 'deepseek';/.test(source)) {
    throw new Error(
      shared + ' no longer asks which engine answers chat before naming one'
    );
  }
  if (!source.includes("deepseek ? 'DeepSeek 응답 없음' : 'Ollama 응답 없음'")) {
    throw new Error(
      shared +
        ' names one engine unconditionally when the chat provider cannot be ' +
        'reached'
    );
  }
  // No key and a rejected key are different problems with different fixes.
  if (!source.includes('ollama.chatKeyConfigured === false')) {
    throw new Error(
      shared + ' no longer tells a missing chat key from a rejected one'
    );
  }
  // A table of statuses, not a chain pinned to one of them. An exhausted
  // balance and a rate limit both fail the model probe; reading either as a
  // model problem sends the operator to edit DEEPSEEK_CHAT_MODEL when the
  // model is fine.
  for (const status of ['401:', '402:', '429:']) {
    if (!source.includes(status)) {
      throw new Error(
        shared +
          ` no longer says what a DeepSeek ${status.slice(0, 3)} means, so it ` +
          'reads as a missing chat model'
      );
    }
  }
  if (!source.includes('ollama.chatStatus >= 500')) {
    throw new Error(
      shared +
        ' no longer treats a 5xx as the service failing, so a DeepSeek ' +
        'outage reads as a missing chat model'
    );
  }

  // Those two facts have to be produced, not just consumed. Reading them off
  // the error string would pin the headline to the API's prose.
  const client = 'libraries/nestjs-libraries/src/snaps/ai/deepseek.client.ts';
  const clientSource = read(client);
  for (const field of ['keyConfigured: false', 'keyConfigured: true']) {
    if (!clientSource.includes(field)) {
      throw new Error(client + ' no longer reports whether a key is configured');
    }
  }
  if (!clientSource.includes('status: response.status')) {
    throw new Error(
      client + ' no longer reports the status the API answered with'
    );
  }
  // The listing answers 200 while the completion the model actually needs
  // answers 402. Reporting the listing's status said the provider was fine.
  if (!clientSource.includes('probe.status ?? response.status')) {
    throw new Error(
      client +
        ' reports the listing status again instead of the status of the call ' +
        'that decided the answer'
    );
  }
  // And the message must not lead with a cause the status contradicts.
  if (!/status >= 500/.test(clientSource)) {
    throw new Error(
      client + ' calls a 5xx a rejected model again'
    );
  }
  if (!clientSource.includes('ACCOUNT_STATUSES')) {
    throw new Error(
      client +
        ' no longer separates account and rate-limit statuses from model ' +
        'rejections in the operator-facing message'
    );
  }
  const bridge = 'libraries/nestjs-libraries/src/snaps/ai/ollama.client.ts';
  const bridgeSource = read(bridge);
  if (!bridgeSource.includes('chatKeyConfigured: chat.keyConfigured')) {
    throw new Error(bridge + ' drops the chat key fact before the route sees it');
  }
  // Absent under Ollama rather than false: Ollama needs no key, and `false`
  // there would read as a key that is missing.
  if (!bridgeSource.includes('chat.status === undefined ? {} :')) {
    throw new Error(
      bridge + ' reports a chat status even when the provider never answered'
    );
  }
});

expectCustom('a finished live verifier exits zero', (read) => {
  const scripts = [
    'scripts/verify-snaps-cardnews-deepseek.ts',
    'scripts/verify-snaps-controller.ts',
    'scripts/verify-snaps-core-deepseek.ts',
    'scripts/verify-snaps-naver-cafe.ts',
    'scripts/verify-snaps-pixelle.ts',
    'scripts/verify-snaps-services.ts',
  ];
  for (const script of scripts) {
    const source = read(script);
    if (!source.includes('did not finish')) {
      throw new Error(
        script +
          ' dropped the did-not-finish sentinel, so a check that hangs is ' +
          'reported as a pass'
      );
    }
    // The flag is the invariant; every exit path must read it rather than
    // relying on each success path to remember to reset the code.
    const handler = source.slice(source.indexOf("process.on('exit'"));
    if (!/if \(completed\) \{[^}]*process\.exitCode = 0;/.test(handler)) {
      throw new Error(
        script +
          ' leaves the fail-by-default exit code set on a run that finished, ' +
          'so a passing run reports as a failure'
      );
    }
  }
});

expectCustom('a trimmed media file name keeps its extension', (read) => {
  const helper =
    'libraries/nestjs-libraries/src/snaps/text/media-file-name.ts';
  const source = read(helper);
  // The stem is what gets cut, not the whole name.
  if (!source.includes('SNAPS_MEDIA_NAME_LIMIT - suffix.length')) {
    throw new Error(
      helper +
        ' bounds the whole file name again, which drops the extension a ' +
        'long URL carries'
    );
  }
  if (!source.includes('SNAPS_MEDIA_SUFFIX_LIMIT')) {
    throw new Error(
      helper +
        ' treats any tail after a dot as an extension, which can cost the ' +
        'whole readable part of the name'
    );
  }

  const controller = 'apps/backend/src/api/routes/snaps.controller.ts';
  const controllerSource = read(controller);
  if (!controllerSource.includes('snapsMediaFileName(url)')) {
    throw new Error(
      controller + ' derives the media file name itself again'
    );
  }
});

expectCustom('a Pixelle failure reaches the operator', (read) => {
  const file =
    'libraries/nestjs-libraries/src/snaps/video/short-video.service.ts';
  const source = read(file);
  const plain = (source.match(/throw new Error\(/g) || []).length;
  if (plain) {
    throw new Error(
      file +
        ' throws ' + plain + ' plain Error(s) on the Pixelle request path; ' +
        'Nest turns those into a bare 500 and the upstream status is lost'
    );
  }
  if (!source.includes('HTTP ${response.status}')) {
    throw new Error(
      file + ' no longer tells the operator what status Pixelle answered with'
    );
  }
});

expectCustom('a store that cannot be created says so to the operator', (read) => {
  const helper =
    'libraries/nestjs-libraries/src/snaps/storage/data-dir-health.ts';
  const source = read(helper);
  if (!source.includes('ServiceUnavailableException')) {
    throw new Error(
      helper +
        ' throws a plain error again; Nest replaces its message with ' +
        '"Internal server error" and the operator learns nothing'
    );
  }
  if (!source.includes('SNAPS_DATA_DIR')) {
    throw new Error(
      helper + ' no longer tells the operator which setting to look at'
    );
  }

  const stores = [
    'libraries/nestjs-libraries/src/snaps/activity/activity-log.service.ts',
    'libraries/nestjs-libraries/src/snaps/agent/agent-task.service.ts',
    'libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts',
    'libraries/nestjs-libraries/src/snaps/library/source-library.service.ts',
    'libraries/nestjs-libraries/src/snaps/rag/vector-store.service.ts',
  ];
  for (const store of stores) {
    const storeSource = read(store);
    if (storeSource.includes('fs.mkdir(this.dataDir')) {
      throw new Error(
        store +
          ' creates the store directory itself again, so its failure reaches ' +
          'the operator as a bare 500'
      );
    }
    if (!storeSource.includes('ensureSnapsDataDir(this.dataDir)')) {
      throw new Error(store + ' no longer goes through the shared store guard');
    }
  }
});

expectCustom('health probes the store instead of echoing its path', (read) => {
  const probe =
    'libraries/nestjs-libraries/src/snaps/storage/data-dir-health.ts';
  const source = read(probe);
  for (const [needle, why] of [
    ['fs.writeFile(probe', 'actually writing to the directory'],
    ['fs.rm(probe', 'removing what it wrote'],
    ['writable: false', 'reporting the failure rather than throwing'],
  ]) {
    if (!source.includes(needle)) {
      throw new Error(probe + ' no longer proves the store is usable by ' + why);
    }
  }

  const controller = 'apps/backend/src/api/routes/snaps.controller.ts';
  const controllerSource = read(controller);
  if (!controllerSource.includes('snapsDataDirHealth()')) {
    throw new Error(
      controller + ' echoes the configured store path again without probing it'
    );
  }
  if (!controllerSource.includes('ollama.ok && storage.writable')) {
    throw new Error(
      controller +
        ' reports health ok with an unwritable store, where nothing can be saved'
    );
  }

  const shared = 'apps/frontend/src/components/snaps/snaps-workspace.shared.ts';
  if (!read(shared).includes('저장 폴더 쓰기 불가')) {
    throw new Error(
      shared + ' no longer leads the health card with an unwritable store'
    );
  }
});

expectCustom('the health card reads the reason from where it is sent', (read) => {
  const controller = 'apps/backend/src/api/routes/snaps.controller.ts';
  const opens = read(controller).indexOf('async health()');
  const payload = read(controller).slice(opens, opens + 900);
  if (/^\s*error[,:]/m.test(payload)) {
    throw new Error(
      controller + ' now sends a top-level error; the card reads ollama.error'
    );
  }
  const workspace = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
  const source = read(workspace);
  const code = source
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    })
    .join('\n');
  if (code.includes('health?.error') || code.includes('{health.error}')) {
    throw new Error(
      workspace + ' reads health.error again, which the route never sends'
    );
  }
  if (!code.includes('health?.ollama?.error')) {
    throw new Error(
      workspace + ' no longer shows why a health check failed'
    );
  }
  const shared = 'apps/frontend/src/components/snaps/snaps-workspace.shared.ts';
  const headline = read(shared);
  if (!/export const snapsHealthHeadline/.test(headline)) {
    throw new Error(shared + ' no longer decides the health headline');
  }
  if (!headline.includes("models?.length")) {
    throw new Error(
      shared +
        ' no longer separates an engine that could not be asked from a model ' +
        'that is not installed'
    );
  }
});

expectCustom('the audit test count has not been left behind', (read) => {
  const audit = 'docs/snaps-completion-audit.md';
  const claim = read(audit).match(/(\d+) tests passed/);
  if (!claim) {
    throw new Error(audit + ' no longer states how many tests pass');
  }
  const claimed = Number(claim[1]);
  const spec =
    'libraries/nestjs-libraries/src/snaps/snaps.core.spec.ts';
  // Plain `it(` declarations only: it.each blocks run more than one test
  // each, so this is a floor and never an over-count.
  const declared = (read(spec).match(/^\s*it\(/gm) || []).length;
  if (claimed < declared) {
    throw new Error(
      audit + ' claims ' + claimed + ' tests pass, but ' + spec + ' declares ' +
        declared + ' with it( alone - the claim has stopped tracking the suite'
    );
  }
});

expectCustom('the demo workspace sample carries every store the export writes', (read) => {
  const sample = 'docs/snaps-demo-workspace.json';
  const demo = JSON.parse(read(sample));
  const controller = 'apps/backend/src/api/routes/snaps.controller.ts';
  const source = read(controller);
  const opens = source.indexOf('exportedAt: new Date().toISOString()');
  if (opens < 0) {
    throw new Error(controller + ' no longer exports a workspace');
  }
  const payload = source.slice(opens, source.indexOf('};', opens));
  const exported = (payload.match(/^      (\w+),$/gm) || []).map((line) =>
    line.trim().replace(',', '')
  );
  if (exported.length < 6) {
    throw new Error(
      controller + ' exports only ' + exported.length + ' stores; this guard ' +
        'can no longer tell whether the sample covers them'
    );
  }
  for (const store of exported) {
    if (!Array.isArray(demo[store]) || !demo[store].length) {
      throw new Error(
        sample + ' has nothing under ' + store + ', so importing the demo ' +
          'leaves that store at zero and the flow cannot be tried'
      );
    }
  }

  const [task] = demo.agentTasks;
  const result = task && task.result;
  if (
    !result ||
    !result.plan ||
    !result.transform ||
    !result.operation ||
    !Array.isArray(result.plan.targetPlatforms) ||
    !Array.isArray(result.transform.variants)
  ) {
    throw new Error(
      sample +
        ' has an agent task the import normaliser would drop, which leaves ' +
        'the store at zero with the array still full'
    );
  }
});

expectCustom('the agent can hand a card news deck to its workspace', (read) => {
  const workspace = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
  const source = read(workspace);
  for (const [needle, why] of [
    ['sendAgentCardNewsToMedia = ', 'the handoff sender'],
    ['snapsCardNewsHandoffKey,', 'the key the workspace reads'],
    ['cardNews?:', 'the field the server sends'],
  ]) {
    if (!source.includes(needle)) {
      throw new Error(workspace + ' no longer has ' + why);
    }
  }
  const shared = 'apps/frontend/src/components/snaps/snaps-workspace.shared.ts';
  if (!/export const snapsCardNewsHandoffKey\s*=/.test(read(shared))) {
    throw new Error(
      shared + ' no longer owns the handoff key, so the two sides can drift'
    );
  }
  // Both handoffs carry the instant, not the plan rendering of it.
  const senders = (source.match(/toLocalInputValue\(agentResult\.plan\.publishDate\)/g) || []).length;
  if (senders < 2) {
    throw new Error(
      workspace +
        ' has ' + senders + ' handoff(s) converting the publish instant; both ' +
        'the shorts and the card news sender must, or the time moves'
    );
  }
});

expectCustom('a restored publish time is converted, not copied', (read) => {
  const file = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
  const source = read(file);
  const opens = source.indexOf('const applyPreparedAgentResult');
  if (opens < 0) {
    throw new Error(file + ' no longer applies a prepared plan');
  }
  const body = declarationBody(source, opens);
  if (!body.includes('toLocalInputValue(prepared.plan.publishDate)')) {
    throw new Error(
      file +
        ' puts the plan own rendering of the time into the scheduling input ' +
        'again, so reopening a task in another zone moves when it publishes'
    );
  }
  const shared = 'apps/frontend/src/components/snaps/snaps-workspace.shared.ts';
  const helper = read(shared);
  if (!/export const toLocalInputValue/.test(helper)) {
    throw new Error(shared + ' no longer converts an instant for the input');
  }
  const convertsAt = helper.indexOf('export const toLocalInputValue');
  const converts = helper.slice(
    convertsAt,
    helper.indexOf('\n};', convertsAt)
  );
  if (!converts.includes('getTimezoneOffset()')) {
    throw new Error(
      shared + ' toLocalInputValue no longer uses the browser own offset'
    );
  }
});

expectCustom('a plan says which clock it was built against', (read) => {
  const planner =
    'libraries/nestjs-libraries/src/snaps/agent/command-planner.service.ts';
  const source = read(planner);
  const uses = (source.match(/publishTimezoneOffsetMinutes: timezoneOffsetMinutes/g) || []).length;
  // Both places that attach publishDateLocal have to attach the offset with it.
  const locals = (source.match(/publishDateLocal: this.toLocalInputValue/g) || []).length;
  if (uses < locals) {
    throw new Error(
      planner +
        ' renders a local publish time in ' + locals + ' places but says which ' +
        'offset it used in only ' + uses + ', so the assumption is invisible'
    );
  }
  const tool =
    'libraries/nestjs-libraries/src/chat/tools/snaps.agent.prepare.tool.ts';
  if (!read(tool).includes('publishTimezoneOffsetMinutes')) {
    throw new Error(
      tool +
        ' no longer tells the model which clock the plan was built against, ' +
        'and it has no browser context to take one from'
    );
  }
});

expectCustom('a growth rate is only shown against a positive base', (read) => {
  const file =
    'libraries/nestjs-libraries/src/snaps/analytics/report-generator.service.ts';
  const source = read(file);
  if (!source.includes('trend.firstValue <= 0')) {
    throw new Error(
      file +
        ' shows a growth percentage against a base that is not positive again, ' +
        'which prints a negative rate beside the word 증가'
    );
  }
});

expectCustom('a card news deck is checked before it reaches the page', (read) => {
  const file = 'apps/frontend/src/components/snaps/snaps-card-news-workspace.tsx';
  const source = read(file);
  if (!source.includes('readSnapsCardNewsDeck(payload)')) {
    throw new Error(
      file +
        ' puts the response straight into state again, so a 200 carrying no ' +
        'slides takes the panel down when the list renders'
    );
  }
  const shared = 'apps/frontend/src/components/snaps/snaps-workspace.shared.ts';
  const reader = read(shared);
  if (!/export const readSnapsCardNewsDeck/.test(reader)) {
    throw new Error(shared + ' no longer decides whether a deck is renderable');
  }
  if (!reader.includes('Array.isArray(slides)')) {
    throw new Error(
      shared +
        ' no longer requires slides to be an array, which is the shape the ' +
        'render calls .map() on'
    );
  }
});

expectCustom('a Shorts-Maker script has to be text', (read) => {
  const client =
    'libraries/nestjs-libraries/src/snaps/shorts-maker/shorts-maker-client.service.ts';
  if (!read(client).includes("typeof payload.script !== 'string'")) {
    throw new Error(
      client +
        ' casts the Shorts-Maker body to a valid answer without checking that ' +
        'it carries a script, so any shape that service returns is passed on'
    );
  }
  const reader = 'apps/frontend/src/components/snaps/snaps-shorts.shared.ts';
  const source = read(reader);
  if (!source.includes("typeof answer.script === 'string'")) {
    throw new Error(
      reader +
        ' reads the script with String(), which renders an object as the ' +
        'literal text [object Object] in the operator source box'
    );
  }
});

expectCustom('no snaps source clamps text with a fixed-length slice', (read) => {
  // Names whose value is text. An array slice at a fixed length is fine and is
  // what the rest of these files legitimately do.
  const BOUND = '0,\\s*(?:\\d+|[A-Z_][A-Z0-9_]*)\\)';
  // A list of names, and therefore not exhaustive: `trimmed` was missing
  // and an operator-facing error excerpt went on being cut with a plain
  // slice after the sweep that was supposed to have found everything.
  // Deciding structurally instead - "flag unless the receiver is provably
  // an array" - was measured and is worse: it flagged 22 of the 44 slices
  // in scope, half of them plain arrays (`deduped`, `[...spread]`,
  // `messages`), and a guard that cries wolf half the time gets ignored.
  // So: add names here when one is found missing, and do not read a green
  // run as proof that no text is sliced anywhere.
  const TEXTY = new RegExp(
    '(content|text|title|caption|summary|subject|body|source|sourceText|' +
      'message|heading|label|excerpt|candidate|normalized|value|trimmed|' +
      'snippet|detail|answer|reply|output|prompt|narration|description)' +
      '\\s*\\.slice\\(' + BOUND
  );
  // A slice applied to the result of a string operation. The operation and the
  // slice are not always adjacent - `(x.trim() || '').slice(0, 80)` has a
  // fallback between them - so this asks whether the line does string work at
  // all and then takes a slice of a parenthesised expression.
  const STRING_WORK = /\.(?:trim|replace|toLowerCase|toUpperCase|normalize)\(/;
  const PAREN_SLICE = new RegExp('\\)\\s*\\.slice\\(' + BOUND);
  const CHAINED = {
    test: (line) => STRING_WORK.test(line) && PAREN_SLICE.test(line),
  };

  const roots = [
    'libraries/nestjs-libraries/src/snaps',
    // snaps-owned, but it lives beside the upstream providers - which is
    // exactly why walking only src/snaps left its published post title
    // being cut with a plain slice long after the rest was fixed.
    'libraries/nestjs-libraries/src/integrations/social/naver-cafe.provider.ts',
    'apps/frontend/src/components/snaps',
    'apps/backend/src/api/routes/snaps.controller.ts',
  ];
  const walk = (dir) => {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist') {
          out.push(...walk(full));
        }
      } else if (
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
        !entry.name.endsWith('.spec.ts')
      ) {
        out.push(full);
      }
    }
    return out;
  };

  const files = roots.flatMap((entry) =>
    entry.endsWith('.ts') ? [entry] : walk(entry)
  );
  // The snaps-owned provider that lives beside the upstream ones. Dropping it
  // from the walk is how its published post title went on being cut with a
  // plain slice after the rest of the tree was fixed.
  // Each of these publishes text and lives outside the snaps tree, which is
  // how the first one went on being cut with a plain slice for so long.
  for (const required of [
    'naver-cafe.provider.ts',
    'snaps-workspace.tsx',
    'snaps.controller.ts',
  ]) {
    if (!files.some((file) => file.endsWith(required))) {
      throw new Error(
        `${required} is no longer scanned, so a plain slice on the text it ` +
          'publishes would go unnoticed again'
      );
    }
  }
  if (files.length < 20) {
    throw new Error(
      `only ${files.length} snaps sources were scanned; the walk is broken and ` +
        'this guard would pass without checking anything'
    );
  }

  const offenders = [];
  for (const file of files) {
    read(file).split(/\r?\n/).forEach((line, index) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
        return;
      }
      // An ISO timestamp cut to its date is a fixed slice of text on purpose.
      if (/slice\(0, 10\)/.test(line)) {
        return;
      }
      if (TEXTY.test(line) || CHAINED.test(line)) {
        offenders.push(`${file}:${index + 1}: ${trimmed}`);
      }
    });
  }

  if (offenders.length) {
    throw new Error(
      'text is clamped with a fixed-length slice, which can cut an emoji in ' +
        'half and publish a lone surrogate; use snapsClampText instead:\n  ' +
        offenders.join('\n  ')
    );
  }
});

expectCustom('derived titles are flattened and cut on character boundaries', (read) => {
  const file =
    'libraries/nestjs-libraries/src/snaps/transform/content-transform.service.ts';
  const source = read(file);
  // Index rather than match: a regex for a method body has to guess where the
  // body ends, and guessing wrong here would silently pass.
  const opens = source.indexOf('private makeTitle(');
  if (opens < 0) {
    throw new Error(`${file} no longer defines makeTitle`);
  }
  const closes = source.indexOf('\n  }', opens);
  const body = source.slice(opens, closes < 0 ? source.length : closes);

  if (!body.includes('snapsClampText(')) {
    throw new Error(
      `${file} derives a title with a plain slice again, which can cut an ` +
        'emoji in half and send a lone surrogate to the platform'
    );
  }
  // Flattening is what keeps a newline out of a field every platform
  // publishes on one line. Check the collapse happens, not how it is spelled.
  if (!body.includes('\\s+') || !body.includes(', \' \')')) {
    throw new Error(
      `${file} no longer collapses whitespace before deriving a title, so a ` +
        'multi-line model block puts newlines in the title'
    );
  }
  if (!body.includes('split(')) {
    throw new Error(
      `${file} no longer reads the first line, so the headline the model ` +
        'wrote is replaced by that line plus the start of the body'
    );
  }
});

expectCustom('published text is clamped on character boundaries', (read) => {
  const builder = 'libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts';
  const source = read(builder);
  if (!source.includes('snapsClampText(suppliedBody, captionLimit)')) {
    throw new Error(
      `${builder} clamps the caption with a plain slice again, which can cut ` +
        'an emoji in half and publish a lone surrogate'
    );
  }
  // The stride is the part that broke two segments at once, so its absence is
  // what this checks - the walk replaced it.
  if (source.includes('index += maxLength')) {
    throw new Error(
      `${builder} splits an over-long token on a fixed stride again, which ` +
        'cuts between the halves of an emoji at the segment seam'
    );
  }
  const cardNews = 'libraries/nestjs-libraries/src/snaps/cardnews/card-news-variant.builder.ts';
  if (!read(cardNews).includes('snapsClampText(')) {
    throw new Error(
      `${cardNews} no longer clamps card news captions on character boundaries`
    );
  }
});

// 밤 12시 is midnight in Korean, not noon. The marker sat in the "add twelve
// hours" list with the noon exception applied only to 오전, so `오늘 밤 12시에
// 올려줘` scheduled 12:00 - twelve hours early, on the right day, with nothing
// to show for it. 자정 and 정오 were not read at all, so a stated time was
// replaced by the 10:00 default in silence.
expectCustom('the planner settles 12 before it adds 12', (read) => {
  const file = 'libraries/nestjs-libraries/src/snaps/agent/command-planner.service.ts';
  const source = read(file);
  const midnight = source.indexOf("marker === '오전' || marker === '밤' || marker === '새벽'");
  if (midnight < 0) {
    throw new Error(
      `${file} no longer treats 밤 12시 and 새벽 12시 as midnight, so a post ` +
        'asked for tonight goes out at lunchtime'
    );
  }
  const addsTwelve = source.indexOf('hour += 12;');
  if (addsTwelve < 0 || addsTwelve < midnight) {
    throw new Error(
      `${file} adds twelve hours before settling the 12 o'clock case, which is ` +
        'the order that made 밤 12시 noon'
    );
  }
  if (!source.includes("wordTime[1] === '정오'")) {
    throw new Error(
      `${file} no longer reads 자정 and 정오, so a stated time is silently ` +
        'replaced by the default hour'
    );
  }
});

// Only 오늘/내일/모레 and a four-digit date were read. A year-less date, a
// weekday and 글피 all fell through to today while the hour was still taken
// from the command, so the plan looked deliberate and landed on a different
// day: `12월 25일 오전 9시에 올려줘` scheduled nine o'clock that morning.
expectCustom('the planner reads dates said without a year', (read) => {
  const file = 'libraries/nestjs-libraries/src/snaps/agent/command-planner.service.ts';
  const source = read(file);
  const wanted = [
    ['const monthDay = explicitDate', 'a date written without its year'],
    ['요일/)', 'a weekday'],
    ['/글피/.test(normalized)', '글피'],
    ['target.year += 1;', 'a date already gone this year'],
  ];
  for (const [needle, what] of wanted) {
    if (!source.includes(needle)) {
      throw new Error(
        `${file} no longer reads ${what}, so that part of the command is ` +
          'dropped and the plan silently uses today'
      );
    }
  }
  // Next week's weekday is not simply the next one to come round - said on a
  // Tuesday, 다음 주 금요일 is ten days out, not three.
  if (!source.includes('toThisMonday + 7 + ((wanted + 6) % 7)')) {
    throw new Error(
      `${file} resolves 다음 주 X요일 to the next matching day rather than the ` +
        'one in the following week'
    );
  }
});

// An unrecognised channel name does not fail - the planner falls through to
// the default set - so naming one channel published to four others. 엑스 is
// the Korean name of X and was not read at all; 쓰레드 is written as often as
// 스레드; 레드노트 was covered only in its Latin spelling; 숏츠 is 쇼츠.
expectCustom('the planner reads the Korean names of its channels', (read) => {
  const file = 'libraries/nestjs-libraries/src/snaps/agent/command-planner.service.ts';
  const source = read(file);
  const wanted = [
    ['/엑스(?!레이)/', 'X by its Korean name'],
    ['/쓰레드/', 'the 쓰레드 spelling of Threads'],
    ['/레드노트/', 'RedNote by its Korean name'],
    ['숏츠', 'the 숏츠 spelling of 쇼츠'],
  ];
  for (const [needle, what] of wanted) {
    if (!source.includes(needle)) {
      throw new Error(
        `${file} no longer reads ${what}, so a command naming it falls through ` +
          'to the default channels and publishes where it was not asked to'
      );
    }
  }
});

// The card news wrapper breaks lines against estimateCharWidth(), so the
// layout rests on that estimate never coming in under what the font draws.
// Han, kana and emoji were all missing from the full-width test and fell to
// the 0.55 Latin default: measured at 52px, a Chinese line drew 1.81x its
// estimate and ran past the slide edge, and emoji were the same. Xiaohongshu
// is one of the channels this renders for.
expectCustom('the card news width estimate covers CJK and emoji', (read) => {
  const file = 'libraries/nestjs-libraries/src/snaps/cardnews/card-news-renderer.service.ts';
  const source = read(file);
  const wanted = [
    ['0x4e00 && code <= 0x9fff', 'Han ideographs'],
    ['0x3040 && code <= 0x30ff', 'hiragana and katakana'],
    // The range, not the variable name: `const isEmoji` is a prefix of
    // `const isEmojiX`, so checking the name left this satisfied by a
    // rename that disabled the bucket.
    ['code >= 0x1f000', 'emoji'],
  ];
  for (const [needle, what] of wanted) {
    if (!source.includes(needle)) {
      throw new Error(
        `${file} no longer gives ${what} a width of their own, so they are ` +
          'estimated at the Latin default and the line runs past the slide edge'
      );
    }
  }
  // Line breaking walks graphemes so an emoji is never split across two lines,
  // while measuring stays per code point because this stack draws a ZWJ
  // sequence as its separate parts.
  if (!source.includes('snapsGraphemes(word)')) {
    throw new Error(
      `${file} breaks long words by code point again, which can split an emoji ` +
        'across two lines'
    );
  }
});

// Text that did not fit a slide just stopped. The reader saw a sentence end
// mid-word with nothing to say it had been cut - measured on an emoji-heavy
// 200 character body, which needs seven lines where six fit and lost twenty
// characters in silence.
expectCustom('a slide marks the text it had no room to finish', (read) => {
  const file = 'libraries/nestjs-libraries/src/snaps/cardnews/card-news-renderer.service.ts';
  const source = read(file);
  // The assignment, not just the template: the same template also appears in
  // the loop that makes room for it, so checking for it alone stayed
  // satisfied with the mark itself deleted.
  if (!source.includes('kept[lastIndex] = `${last}${ELLIPSIS}`;')) {
    throw new Error(
      `${file} truncates a slide without marking it, so a cut sentence reads ` +
        'as a finished one'
    );
  }
  // The mark goes inside the line width. A line packed to the margin has to
  // give a character back rather than have the ellipsis added past the edge.
  if (!source.includes('clusters.pop();')) {
    throw new Error(
      `${file} adds the ellipsis without making room for it, so a full line ` +
        'runs past the margin'
    );
  }
});

// The card news renderer names a font family and lets fontconfig resolve it, so
// what the image carries is what gets drawn. This reads the shipped font's own
// cmap instead of rendering and guessing: an ink threshold cannot tell a
// missing glyph from a present one. Measured here, a guaranteed-tofu string
// came out at 2508 dark pixels against 3077 for Hangul and 2242 for Latin, and
// two different unsupported code points landed 8% apart - there is no
// separation to threshold on.
expectCustom('the house font still covers what snaps writes in', () => {
  const dir = 'libraries/nestjs-libraries/src/snaps/cardnews/assets/fonts';
  const files = readdirSync(dir).filter((name) => name.endsWith('.otf'));
  if (!files.length) {
    throw new Error(`${dir} ships no font files, so card news renders as tofu`);
  }

  const coveredRanges = (path) => {
    const data = readFileSync(path);
    const tableCount = data.readUInt16BE(4);
    let cmapAt = -1;
    for (let i = 0; i < tableCount; i += 1) {
      const at = 12 + i * 16;
      if (data.toString('latin1', at, at + 4) === 'cmap') {
        cmapAt = data.readUInt32BE(at + 8);
        break;
      }
    }
    if (cmapAt < 0) {
      throw new Error(`${path} has no cmap table`);
    }

    const ranges = [];
    const subtableCount = data.readUInt16BE(cmapAt + 2);
    for (let i = 0; i < subtableCount; i += 1) {
      const at = cmapAt + data.readUInt32BE(cmapAt + 4 + i * 8 + 4);
      const format = data.readUInt16BE(at);
      if (format === 4) {
        const segX2 = data.readUInt16BE(at + 6);
        const segments = segX2 / 2;
        for (let s = 0; s < segments; s += 1) {
          const end = data.readUInt16BE(at + 14 + s * 2);
          const start = data.readUInt16BE(at + 16 + segX2 + s * 2);
          if (start !== 0xffff) {
            ranges.push([start, end]);
          }
        }
      } else if (format === 12) {
        const groups = data.readUInt32BE(at + 12);
        for (let g = 0; g < groups; g += 1) {
          ranges.push([
            data.readUInt32BE(at + 16 + g * 12),
            data.readUInt32BE(at + 20 + g * 12),
          ]);
        }
      }
    }
    return ranges;
  };

  const covers = (ranges, code) =>
    ranges.some((range) => code >= range[0] && code <= range[1]);

  // What the product writes in, plus the one character the renderer adds itself.
  const required = [
    [0x0041, 'Latin'],
    [0xac00, 'Hangul'],
    [0x2026, 'the ellipsis it appends to a line it had to cut'],
  ];

  for (const name of files) {
    const ranges = coveredRanges(`${dir}/${name}`);
    for (const entry of required) {
      if (!covers(ranges, entry[0])) {
        throw new Error(
          `${name} no longer covers ${entry[1]}, so every card news slide ` +
            'draws it as a tofu box'
        );
      }
    }
    // Recorded rather than required: this font carries no Han and no emoji,
    // which is the whole reason Dockerfile.dev installs fonts-noto-cjk and
    // fonts-noto-color-emoji at about 70MB. If a font drop ever covers them,
    // that cost can go - and this check says so rather than leaving it paid.
    if (covers(ranges, 0x4e00) && covers(ranges, 0x1f600)) {
      throw new Error(
        `${name} now covers Han and emoji, so the Noto packages in ` +
          'Dockerfile.dev are paying about 70MB for nothing - drop them, and ' +
          'this check with them'
      );
    }
  }
});

// Two kinds of duplicate got past the Set in the hashtag sanitiser, and both
// are one tag as far as a platform is concerned - the very thing it exists to
// stop. Korean written as decomposed jamo is a second spelling of the same
// word (three code points composed, eight decomposed, and text that has been
// through a macOS filesystem arrives decomposed), and Instagram, X and Threads
// all group tags case-insensitively while the budget is as small as one on
// Threads.
expectCustom('the hashtag sanitiser folds both kinds of duplicate', (read) => {
  const file = 'libraries/nestjs-libraries/src/snaps/transform/hashtags.ts';
  const source = read(file);
  if (!source.includes("tag.normalize('NFC')")) {
    throw new Error(
      `${file} no longer composes its tags, so decomposed Korean publishes the ` +
        'same hashtag twice'
    );
  }
  // The shape, not the name. `const key = ...` failed a rename to
  // `normalizedKey` that changed nothing, which is how a guard teaches people
  // to route around it rather than keep the property.
  if (!/const \w+ = tag\.toLowerCase\(\)/.test(source)) {
    throw new Error(
      `${file} no longer folds case when deduplicating, so one tag spelled two ` +
        'ways spends the budget twice'
    );
  }
  // The tag keeps the spelling it arrived with; the folded key is only for
  // comparing. Pushing the key would flatten a readable tag to lower case.
  if (!source.includes('kept.push(`#${tag}`);')) {
    throw new Error(
      `${file} publishes the folded key rather than the spelling it was given`
    );
  }
});

// Keyword matching was exact, which works for English and barely works for
// Korean: a noun carries its particle inside the same whitespace token, so
// 환절기 and 환절기에는 are two strings for one word. Measured, `환절기
// 건강관리 팁` scored 0.00 against `환절기에는 건강관리가 무엇보다
// 중요합니다` - the same score as a sentence about lunch. This is the path
// every search takes whenever embeddings are unavailable, and addExample()
// stores none whenever the embed call fails.
expectCustom('keyword search reaches past a Korean particle', (read) => {
  const file = 'libraries/nestjs-libraries/src/snaps/rag/vector-store.service.ts';
  const source = read(file);
  if (!source.includes('content.startsWith(token) || token.startsWith(content)')) {
    throw new Error(
      `${file} matches keywords exactly again, so a Korean example scores the ` +
        'same as an unrelated one whenever embeddings are unavailable'
    );
  }
});

// Agent task search matched the whole keyword as one contiguous run, which a
// Korean sentence almost never allows - the particle sits between the words.
// Measured, `환절기 건강관리` found nothing in text reading `환절기에는
// 건강관리가 무엇보다 중요합니다`, and word order mattered too.
expectContains(
  'libraries/nestjs-libraries/src/snaps/agent/agent-task.service.ts',
  'keywords.every((word) => haystack.includes(word))',
  'every word of a Korean search has to be found, not the whole phrase at once'
);
// The normalizer read two lists off an imported record without checking they
// were lists. A task whose plan named its platforms differently threw a
// TypeError out of importTasks and took the valid records with it; every other
// normalizer here answers bad input by dropping the record.
expectContains(
  'libraries/nestjs-libraries/src/snaps/agent/agent-task.service.ts',
  '!Array.isArray(result.plan.targetPlatforms)',
  'an imported task missing its platform list is skipped, not thrown on'
);

// A workspace export is what an operator restores from, so a record has to
// come back the way it went out. Round-tripping one through all six stores
// found exactly one field that did not: importing a source stamped updatedAt
// with the moment the import ran, making a restored backup look freshly
// edited when none of the text had changed. Nothing used the stamp - the merge
// takes the incoming copy by position - and reports and agent tasks both kept
// theirs.
expectCustom('importing a source keeps the timestamps it arrived with', (read) => {
  const file = 'libraries/nestjs-libraries/src/snaps/library/source-library.service.ts';
  const source = read(file);
  if (source.includes('normalizeImportedSource')) {
    throw new Error(
      `${file} wraps its import normalizer again; the wrapper existed only to ` +
        'overwrite updatedAt'
    );
  }
  const at = source.indexOf('async importSources(');
  if (at < 0) {
    throw new Error(`${file} no longer exposes importSources`);
  }
  if (methodBody(source, at).includes('updatedAt')) {
    throw new Error(
      `${file} sets updatedAt while importing, so restoring a backup reports ` +
        'every source as edited today'
    );
  }
});

// Every store answers an unrecognised payload with an empty list, so picking
// the wrong file imported nothing and the workspace still said 완료. The line
// also counted two of the six stores, so a backup holding only reports and
// activity read as `원문 0개, RAG 0개` - a successful import that looks like a
// failed one. The workspace shows what the shared summariser returns.
expectContains(
  'apps/frontend/src/components/snaps/snaps-workspace.tsx',
  'summariseSnapsWorkspaceImport(payload, imported)',
  'the workspace reports an import through the summariser, not inline'
);
expectCustom('the import summary covers every store and the empty case', (read) => {
  const file = 'apps/frontend/src/components/snaps/snaps-workspace.shared.ts';
  const source = read(file);
  for (const label of ['원문', 'RAG', '보고서', '작업', '반응', '기록']) {
    if (!source.includes(`['${label}',`)) {
      throw new Error(
        `${file} no longer counts ${label} in the import summary, so restoring ` +
          'that store reports nothing happened'
      );
    }
  }
  if (!source.includes('snaps 워크스페이스 백업이 아닌 것 같습니다')) {
    throw new Error(
      `${file} no longer separates an empty import from the wrong file, so a ` +
        'mistaken pick reports 완료'
    );
  }
});

// pnpm answers a filter that matches nothing by printing "No projects matched
// the filters" and exiting 0. Every build script here runs through
// scripts/run-pnpm.mjs, so `pnpm build` would report success having built
// nothing the moment a package is renamed or dropped from
// pnpm-workspace.yaml. Measured in this repo: `pnpm --filter @gitroom/backend
// build` printed that line and exited 0, while the package is called
// snaps-backend - a whole session of "build PASS" that compiled nothing.
expectCustom('a pnpm filter that matches nothing is an error', (read) => {
  const file = 'scripts/run-pnpm.mjs';
  const source = read(file);
  if (!source.includes('assertFiltersMatch(args, repoRoot)')) {
    throw new Error(
      `${file} no longer checks its filters, so a renamed package turns every ` +
        'build into a no-op that exits 0'
    );
  }
  // The check has to run before pnpm does, or the no-op has already happened.
  const at = source.indexOf('assertFiltersMatch(args, repoRoot)');
  const firstRun = source.indexOf('result = run(');
  if (firstRun >= 0 && at > firstRun) {
    throw new Error(`${file} checks its filters after running pnpm`);
  }
  // Tied to this branch, not to the string: process.exit(1) also appears in
  // the "pnpm is not on PATH" path, so searching for it alone stayed satisfied
  // with the failure here deleted.
  const reported = source.indexOf('pnpm filter matched no package');
  const exits = source.indexOf('process.exit(1)', reported);
  const afterBranch = source.indexOf('function matchesGlob', reported);
  if (reported < 0 || exits < 0 || (afterBranch >= 0 && exits > afterBranch)) {
    throw new Error(`${file} reports an unmatched filter without failing on it`);
  }
});

// Every test in this repo lives in one spec file. With passWithNoTests on, a
// rename or a change to testMatch turns `pnpm test` into a green run of zero
// tests: jest prints "No tests found" and exits 0. Measured both ways - with
// the flag off, a pattern matching nothing exits 1 and the real suite still
// reports its 263 tests. The flag came in from upstream, where a workspace
// package legitimately has none.
expectCustom('a test run that collects nothing is a failure', (read) => {
  const config = read('jest.config.ts');
  if (!/passWithNoTests:\s*false/.test(config)) {
    throw new Error(
      'jest.config.ts no longer fails a run that collected no tests, so a spec ' +
        'that stops being matched reports success with nothing executed'
    );
  }
});

// The storyboard repair gives every scene a whole second, which only works
// while there are at least as many seconds as scenes. Today there always are -
// duration() clamps to [15, 90] and normalizeScript caps the storyboard at six
// - but that is a guarantee held by constants in two other methods. Measured
// with 40 scenes over 30 seconds before this branch existed: every scene came
// back as 0-1, overlapping, and the timeline never reached the end.
expectContains(
  'libraries/nestjs-libraries/src/snaps/video/short-video.service.ts',
  'if (durationSeconds < count) {',
  'the shorts timeline still covers the clip when the seconds run out'
);

// Every other field on an activity entry is length-capped; detail was stored
// exactly as given, and /snaps/import hands it whatever is in an operator's
// backup. Measured: 20 entries carrying 200KB each wrote 3.9MB into one JSON
// file that every list() call reads, and a detail nested 2,000 levels deep was
// stored at 2,000 - deep enough that walking it without a limit throws
// RangeError. The bound sits far above anything real: the largest detail this
// codebase writes is 381 characters with seven keys.
expectCustom('the shared record bound still bounds', (read) => {
  // The limits moved out of the activity log when reports and agent tasks
  // turned out to have the same hole; this follows them rather than the file
  // they used to live in.
  const file = 'libraries/nestjs-libraries/src/snaps/storage/bounded-record.ts';
  const source = read(file);
  for (const [needle, what] of [
    ['depth >= bounds.maxDepth', 'a nesting limit'],
    ['serialized.length > bounds.maxChars', 'a size limit'],
    ['seen.has(node)', 'a cycle check'],
    ['node.slice(0, bounds.maxItems)', 'an array limit'],
  ]) {
    if (!source.includes(needle)) {
      throw new Error(
        `${file} has no ${what}, so an imported backup can park an unbounded ` +
          'blob in a store the workspace reads on every action'
      );
    }
  }
});

// Three stores keep a free-form object exactly as it arrives while every field
// around them is length-capped, and /snaps/import fills all three from an
// operator's backup. Measured: one report carrying 500 long action items wrote
// a 100MB JSON file, and the same shape at 5,000 items threw `Invalid string
// length` out of the import, taking the valid records with it.
expectCustom('every free-form stored blob goes through the bound', (read) => {
  const sites = [
    [
      'libraries/nestjs-libraries/src/snaps/activity/activity-log.service.ts',
      "boundStoredRecord(value, ACTIVITY_DETAIL_BOUNDS",
      "an activity entry's detail",
    ],
    [
      'libraries/nestjs-libraries/src/snaps/rag/vector-store.service.ts',
      'boundStoredRecord(example.metrics',
      "a style example's metrics",
    ],
    [
      'libraries/nestjs-libraries/src/snaps/library/source-library.service.ts',
      'boundStoredRecord(payload, REPORT_PAYLOAD_BOUNDS',
      "a report's payload",
    ],
    [
      'libraries/nestjs-libraries/src/snaps/agent/agent-task.service.ts',
      'boundStoredRecord(',
      "an agent task's result",
    ],
  ];
  for (const [file, needle, what] of sites) {
    if (!read(file).includes(needle)) {
      throw new Error(
        `${file} stores ${what} without a bound, so one imported record can ` +
          'take the whole store with it'
      );
    }
  }
});

// This product exists to produce platform-specific variants, so two channels
// receiving byte-identical copy is the one outcome the deterministic fallback
// must not have. Measured across all ten: nine distinct bodies, with X and
// KakaoTalk the same. KakaoTalk had no lead-in while every other Korean
// channel here opens with one, and its own rule asks for a messenger tone
// where the recipient sees the value immediately. X stays bare on purpose -
// its rule is "sharp, compressed, one point only".
expectContains(
  'libraries/nestjs-libraries/src/snaps/transform/content-transform.service.ts',
  "if (platform === 'kakao-talk') {",
  'the KakaoTalk fallback opens the way its own rule asks'
);

// The caption work converted two sites by name and missed three more, which is
// what a named list of sites gets you. This looks for the shape instead: a
// text clamp at a platform limit that still cuts on UTF-16 code units, which
// splits an emoji and publishes a lone surrogate. Array slices are fine - it
// is only text that has halves.
expectCustom('no published text is clamped by a raw slice', (read) => {
  // This guard used to name four files and four argument names, having been
  // written with a comment saying that a named list of sites is what causes
  // misses. It missed seven clamps: `bounds.maxText` in
  // storage/bounded-record.ts, and `maxLength` in six files it did not list.
  // Measured on the first of them, a detail string bounded at the limit came
  // back as `환절기 팁 \ud83d` - a lone high surrogate that survived the JSON
  // round trip into the store and out to the operator.
  //
  // So: the whole tree, and the argument is matched by shape.
  const walk = (dir) => {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist') {
          out.push(...walk(full));
        }
      } else if (
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
        !entry.name.includes('.spec.')
      ) {
        out.push(full);
      }
    }
    return out;
  };
  const files = [
    'libraries/nestjs-libraries/src/snaps',
    'libraries/nestjs-libraries/src/integrations/social/naver-cafe.provider.ts',
    'apps/backend/src/api/routes/snaps.controller.ts',
    'apps/frontend/src/components/snaps',
  ].flatMap((entry) => (entry.endsWith('.ts') ? [entry] : walk(entry)));
  if (files.length < 20) {
    throw new Error(
      `only ${files.length} snaps sources were scanned; the walk is broken ` +
        'and this guard would pass without checking anything'
    );
  }
  // The one file allowed to cut text on code units is the clamp itself - that
  // is what it exists to do carefully.
  const exempt = new Set([
    'libraries/nestjs-libraries/src/snaps/text/clamp-text.ts',
  ]);
  // Limits that bound a list rather than a string. Each one is an array or a
  // line count at its site; text has halves, an array does not.
  const listLimits = new Set([
    'maxItems',
    'maxKeys',
    'maxLines',
    'mediaLimit',
    'rule.mediaLimit',
    'bounds.maxItems',
    'bounds.maxKeys',
    'topK',
    'request.slideCount',
    'MAX_AGENT_TASKS',
    'MAX_FEEDBACK_ITEMS',
    'MAX_STYLE_EXAMPLES',
    'MAX_TRACKED_JOBS',
    'DEFAULT_HASHTAG_LIMIT',
    // Both bound a hashtag array, not the text of any one tag.
    'Math.max(0, limit',
    'rule.hashtagLimit ?? 20',
  ]);
  // Cutting at a position that was searched for - the index of a '.', the end
  // of a match - is always on a character boundary, because the thing searched
  // for is one. These are positions, not budgets.
  const positions = new Set([
    'dot',
    'cut',
    'end',
    'reasonStarts',
    'open',
    'at',
    // extract-json.ts: the index of a closing '```' and of the ']' that
    // ends a top-level array. Both are searched for, both are ASCII.
    'closing',
    'lastArray + 1',
  ]);
  const offenders = [];
  let checked = 0;
  for (const file of files) {
    if (exempt.has(file)) {
      continue;
    }
    const lines = read(file).split(String.fromCharCode(10));
    lines.forEach((line, index) => {
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
        return;
      }
      // The clamp shape: something.slice(0, <a bound>). The bound is taken as
      // an expression, not an identifier: `stem.slice(0, LIMIT - suffix.length)`
      // is a text clamp too, and an identifier-only pattern could not see it.
      const match = /\.slice\(0, ([^)]+)\)/.exec(line);
      if (!match) {
        return;
      }
      const argument = match[1].trim();
      // A bare number is left alone. Every text clamp this found was bounded
      // by a named budget; the numeric ones are array counts and deliberate
      // fixed cuts, and sweeping them all in one go would mean classifying
      // forty sites at once with no measurement behind any of them. Named
      // bounds are default-deny, numbers are not yet - said plainly rather
      // than left to look like coverage.
      if (!/[A-Za-z]/.test(argument)) {
        return;
      }
      checked += 1;
      if (listLimits.has(argument) || positions.has(argument)) {
        return;
      }
      // Default-deny, on purpose. Matching the names that read as a text
      // budget was tried and a mutation walked straight through it: renaming
      // the limit to `captionBudget` was enough, which is the same named-list
      // weakness this guard was written to replace. Anything bounding a list
      // goes in `listLimits` above, where adding it is a deliberate act that
      // says so; everything else is text until someone says otherwise.
      offenders.push(`${file}:${index + 1}: .slice(0, ${argument})`);
    });
  }
  if (checked < 5) {
    throw new Error(
      `only ${checked} identifier-bounded slices were seen; the pattern is ` +
        'broken and this guard would pass without checking anything'
    );
  }
  if (offenders.length) {
    throw new Error(
      `${offenders.join(', ')} clamps published text with a raw slice; that ` +
        'cuts between the halves of an emoji and publishes a lone surrogate'
    );
  }
});

// Named three blob fields and missed a fourth, which is what a named list
// gets you. This looks for the shape: a stored record type with a free-form
// object field, where nothing in the file bounds it. Measured on the one that
// was missed - a style example's metrics - a 200KB string and a 2,000-level
// nesting both went in whole.
expectCustom('no stored free-form field escapes the bound', (read) => {
  const stores = [
    'libraries/nestjs-libraries/src/snaps/activity/activity-log.service.ts',
    'libraries/nestjs-libraries/src/snaps/agent/agent-task.service.ts',
    'libraries/nestjs-libraries/src/snaps/library/source-library.service.ts',
    'libraries/nestjs-libraries/src/snaps/rag/vector-store.service.ts',
    'libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts',
  ];
  const offenders = [];
  for (const file of stores) {
    const source = read(file);
    // Does the stored type carry a free-form object at all?
    const hasFreeForm =
      source.includes('Record<string, unknown>;') ||
      source.includes('SnapsAgentPrepareResult;');
    if (!hasFreeForm) {
      continue;
    }
    if (!source.includes('boundStoredRecord(')) {
      offenders.push(file);
    }
  }
  if (offenders.length) {
    throw new Error(
      `${offenders.join(', ')} keeps a free-form field on a stored record with ` +
        'no bound, so one imported record can take the whole store with it'
    );
  }
});

// nomic-embed-text, the model this ships with, returns 768 values and the
// largest common alternative 4,096. Nothing capped the length, so an imported
// backup carrying a 2,000,000-value array was stored whole - 28.8MB across
// four records - and every search ran a cosine over all of it.
expectContains(
  'libraries/nestjs-libraries/src/snaps/rag/vector-store.service.ts',
  'value.length > MAX_EMBEDDING_VALUES',
  'an embedding no model could have produced is refused'
);

// The inbox summary took `Math.max(model, real)` for every count, so a model
// that made numbers up won over facts the service had already computed from
// the stored items. Measured with four items, a model answering `{ total: 99,
// bySentiment: { question: 50, praise: 50 } }` produced a summary reading 99
// responses with a distribution summing to 102.
expectCustom('the inbox summary counts what is stored', (read) => {
  const file = 'libraries/nestjs-libraries/src/snaps/inbox/feedback-inbox.service.ts';
  const source = read(file);
  const at = source.indexOf('private normalizeSummary(');
  if (at < 0) {
    throw new Error(`${file} no longer normalises the summary`);
  }
  const body = methodBody(source, at, 1800);
  if (!body.includes('total: fallback.total,')) {
    throw new Error(
      `${file} lets the model set the response count, which it cannot know ` +
        'better than the store it was given'
    );
  }
  if (!body.includes('countsMatchingTotal(')) {
    throw new Error(
      `${file} keeps a breakdown without checking it adds up to the number of ` +
        'items there actually are'
    );
  }
  if (!source.includes('return sum === total ? candidate : fallback;')) {
    throw new Error(
      `${file} no longer falls back when a breakdown does not add up`
    );
  }
});

// The planner asks a model to interpret the same command it has already
// parsed, and took the model's answer for the channels, the card news flag and
// the publish time. Measured on `엑스에만 내일 오후 3시로 예약해줘. 카드뉴스는
// 만들지 마.`: a model naming instagram and linkedin got them planned, one
// answering includeCardNews got card news, and one answering a 2030 date moved
// the schedule there. The detectors also read the refusal as a request, so
// card news was produced even when the model said nothing.
expectCustom('an explicit command outranks the model that reads it', (read) => {
  const file = 'libraries/nestjs-libraries/src/snaps/agent/command-planner.service.ts';
  const source = read(file);
  // The two flag entries are regexes rather than `const x = this.refuses(`:
  // that spelling pinned the refusal to being the *first* branch, and
  // `refuses()` is defined as "the word is there and it is not a request", so
  // the two checks are mutually exclusive and the order between them cannot
  // change the answer. Swapping them failed this guard while behaving
  // identically, which teaches whoever hits it to work around the guard.
  for (const [needle, what] of [
    ['const namedPlatforms = this.namedTargetPlatforms(command);', 'the channels the command names'],
    [/const includeCardNews = [\s\S]{0,240}?this\.refuses\(/, 'a refusal of card news'],
    [/const includeShortVideo = [\s\S]{0,240}?this\.refuses\(/, 'a refusal of a short video'],
    // The operator's time is read first and wins; the model's is only
    // consulted when the command stated none. Was spelled
    // 'fallback.publishDate || this.cleanText(payload.publishDate, 120)'.
    ['operatorPublishDate ||', 'the time the command states'],
    ['const namedVideoPlatforms = this.namedShortVideoPlatforms(command);', 'the video channel the command names'],
  ]) {
    const present =
      typeof needle === 'string' ? source.includes(needle) : needle.test(source);
    if (!present) {
      throw new Error(
        `${file} lets the model overrule ${what}, which it was answering about ` +
          'and so cannot know better'
      );
    }
  }
  // The negation itself: without it a refusal reads as a request.
  if (!source.includes('private asksFor(')) {
    throw new Error(
      `${file} matches a keyword without reading the refusal after it, so ` +
        '`카드뉴스는 만들지 마` asks for card news'
    );
  }
});

// scheduleType merged with an OR, so the model could only ever escalate a
// draft into a schedule. Measured: `초안으로만 만들어줘. 올리지는 마.` with a
// model answering `scheduleType: 'schedule'` produced a scheduled plan with an
// invented publish time - the difference between a post that goes out and one
// that does not.
expectCustom('a command that refuses to publish stays a draft', (read) => {
  const file = 'libraries/nestjs-libraries/src/snaps/agent/command-planner.service.ts';
  const source = read(file);
  if (!source.includes('const scheduleType = this.refusesToPublish(command)')) {
    throw new Error(
      `${file} decides scheduleType without asking whether the command refused ` +
        'to publish, so the model can turn a draft into a schedule'
    );
  }
  // Spelled-out verb stems, not a bare `지 마`: that fires on 페이지 마감 and
  // 이미지 마스크.
  if (!source.includes('올리지')) {
    throw new Error(
      `${file} no longer names the refusal verbs, so either it misses a refusal ` +
        'or it fires on an ordinary word ending the same way'
    );
  }
});

// Shorts-Maker had routes, a client and a contract check on the backend and no
// operator surface at all. Only topic-to-script is fully contracted - the
// render side needs a payload Shorts-Maker's own pipeline assembles - so that
// is what the shorts workspace offers, writing its answer into the source box
// the rest of the page works from.
expectCustom('the shorts workspace can reach Shorts-Maker', (read) => {
  const file = 'apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx';
  const source = read(file);
  if (!source.includes("snapsFetch('/snaps/shorts-maker/topic-to-script'")) {
    throw new Error(
      `${file} no longer calls Shorts-Maker, leaving that integration with no ` +
        'operator surface'
    );
  }
  // The route answers 200 for all three outcomes, so reading response.ok is
  // not enough - the body decides.
  const at = source.indexOf("snapsFetch('/snaps/shorts-maker/topic-to-script'");
  const handler = source.slice(at, at + 2200);
  if (!handler.includes('readSnapsShortsMakerScript(')) {
    throw new Error(
      `${file} reads the Shorts-Maker answer inline again; the three outcomes ` +
        'are decided in snaps-shorts.shared.ts so they can be tested'
    );
  }
  // The three outcomes themselves live with the reader.
  const reader = 'apps/frontend/src/components/snaps/snaps-shorts.shared.ts';
  const readerSource = read(reader);
  for (const [needle, what] of [
    ["'not-configured'", 'an unconfigured service'],
    ['!answer?.ok', 'a failure the service reports with a 200'],
    ['if (!script)', 'a success carrying no script'],
  ]) {
    if (!readerSource.includes(needle)) {
      throw new Error(
        `${reader} does not separate ${what} from a working answer, so a failed ` +
          'call reads as a successful one'
      );
    }
  }

  // The answer lands in the source box, so anything already typed there is
  // replaced. The check sits before the request, not in the response handler.
  const start = source.indexOf('const generateShortsMakerScript');
  if (start < 0) {
    throw new Error(`${file} no longer defines the Shorts-Maker script handler`);
  }
  if (!source.slice(start, at).includes('confirmOperatorAction(')) {
    throw new Error(
      `${file} replaces the text the operator already typed without asking, ` +
        'which every other overwriting action on this page does'
    );
  }
});

// The status poll mapped every status it did not recognise to `running`, which
// is right for Pixelle's own vocabulary - it answers `processing` among others
// - and wrong for a state this product returns itself. With PIXELLE_VIDEO_URL
// unset the status route answers `not-configured`, and that read as progress:
// 120 polls, ten minutes of a moving progress bar for a job that could never
// advance, ending with a toast saying the work was still under way.
expectCustom('a shorts status poll stops when nothing is coming', (read) => {
  const reader = 'apps/frontend/src/components/snaps/snaps-shorts.shared.ts';
  const source = read(reader);
  if (!source.includes("status === 'not-configured'")) {
    throw new Error(
      `${reader} treats every unrecognised status as progress again, so an ` +
        'unconfigured engine polls for ten minutes and reports itself as busy'
    );
  }
  const workspace = 'apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx';
  const poll = read(workspace);
  if (!poll.includes('readSnapsShortsPoll(statusResult.status')) {
    throw new Error(
      `${workspace} decides the poll phase inline again; the states live in ` +
        'snaps-shorts.shared.ts so they can be tested'
    );
  }
  if (!poll.includes("poll.phase === 'stopped'")) {
    throw new Error(
      `${workspace} never acts on the stopped phase, so the loop keeps asking`
    );
  }
});

// An execution step's status is three-way, and the workspace read it in three
// places with two different readings. The operation map had all three; the
// checkpoint list asked only whether it was `needs-confirmation` and painted
// everything else green as 준비 - so a `manual` step, one the operator has to
// carry out by hand, was presented as ready.
expectCustom('an execution step is labelled through one reading', (read) => {
  const workspace = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
  const source = read(workspace);
  if (source.includes("step.status === 'needs-confirmation' ?")) {
    throw new Error(
      `${workspace} reads a step status as a yes-or-no again, so a manual step ` +
        'reads as ready'
    );
  }
  if (!source.includes('snapsStepBadge(')) {
    throw new Error(`${workspace} no longer labels steps through the shared badge`);
  }
  const shared = 'apps/frontend/src/components/snaps/snaps-workspace.shared.ts';
  const badge = read(shared);
  for (const [needle, what] of [
    ["status === 'manual'", 'a step the operator has to do by hand'],
    ["status === 'ready'", 'a step that needs nothing'],
  ]) {
    if (!badge.includes(needle)) {
      throw new Error(`${shared} no longer distinguishes ${what}`);
    }
  }
  // The default has to be the cautious one.
  const at = badge.indexOf('export const snapsStepBadge');
  if (!declarationBody(badge, at).includes("label: '확인'")) {
    throw new Error(
      `${shared} no longer falls back to 확인, so a status it does not know ` +
        'would tell the operator the step is ready'
    );
  }
});

// Capping a list of findings is fine; dropping the rest without saying so is
// not - the operator reads the visible lines and assumes that was all of it.
// Two warning panels already said what they cut and a third did not, and the
// conversion signals showed four of a possible seven in silence.
expectCustom('a truncated list of findings says what it cut', (read) => {
  const file = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
  const lines = read(file).split(String.fromCharCode(10));
  const offenders = [];
  lines.forEach((line, index) => {
    const at = line.indexOf('.slice(0, ');
    if (at < 0 || !line.includes(').map(')) {
      return;
    }
    const subject = line.slice(0, at);
    // Only lists of things the operator is meant to act on. A browsing list of
    // recent sources or activity is understood to be recent, not complete.
    if (!/warnings|Signals/.test(subject)) {
      return;
    }
    const window = lines.slice(Math.max(0, index - 12), index + 14).join(' ');
    // Tied to the list's own length, not just to the phrase: leaving the text
    // in place while the condition becomes `false` would satisfy a search for
    // the words, and the operator would be told nothing.
    const list = subject.slice(subject.lastIndexOf('{') + 1).trim();
    // A comparison on the same list, not merely its name somewhere nearby:
    // the notice prints the count too, so accepting an interpolation left
    // the guard satisfied with the condition turned off.
    const escaped = list.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&');
    const counted = new RegExp(escaped + '\\??\\.length(?:\\s*\\|\\|\\s*0\\))?\\s*>').test(window);
    if (!counted) {
      offenders.push(`${index + 1}: ${list.slice(-40)}`);
    }
  });
  if (offenders.length) {
    throw new Error(
      `${file} truncates a list of findings without saying how many it hid ` +
        `(${offenders.join(', ')})`
    );
  }
});

expectJson('libraries/react-shared-libraries/src/translation/locales/en/translation.json');
expectJson('libraries/react-shared-libraries/src/translation/locales/ko/translation.json');
expectJson('docs/snaps-demo-workspace.json');

for (const check of checks) {
  check();
}

// Last, on purpose: every guard above has called whatever helpers it uses, so
// this sees the complete list. A helper that fell back read a fixed window, and
// the guard that called it was matching against its anchor's neighbour.
if (boundaryFallbacks.length) {
  throw new Error(
    `${boundaryFallbacks.length} boundary helper call(s) found no boundary and ` +
      `read a fixed window instead (${boundaryFallbacks.join(', ')}); the guard ` +
      'that called it is matching against whatever follows its anchor'
  );
}

console.log(`verify-snaps-static-ok (${checks.length} checks)`);
