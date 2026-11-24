import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

function normalizePath(path) {
  return path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function extractControllerRoutes(controller) {
  const methodMap = {
    Get: 'GET',
    Post: 'POST',
    Delete: 'DELETE',
    Put: 'PUT',
    Patch: 'PATCH',
  };
  const routes = [];
  const routeRegex = /@(Get|Post|Delete|Put|Patch)\('([^']+)'\)/g;
  let match;
  while ((match = routeRegex.exec(controller))) {
    routes.push({
      method: methodMap[match[1]],
      path: normalizePath(`/snaps${match[2]}`),
    });
  }
  return routes;
}

function keyOf(route) {
  return `${route.method} ${route.path}`;
}

function expectNeedle(runtime, routeKey, needles) {
  const matches = needles.some((needle) => runtime.includes(needle));
  if (!matches) {
    throw new Error(
      `Runtime smoke coverage for ${routeKey} is missing all needles: ${needles.join(' | ')}`
    );
  }

  // `some` is the right rule for coverage - a route called two ways is
  // covered by either call - but it also means a needle that stopped
  // matching anything is invisible, propped up by its sibling. Listing a
  // needle is a claim that the smoke contains it, so say when it does not.
  const stale = needles.filter((needle) => !runtime.includes(needle));
  if (stale.length) {
    throw new Error(
      `Runtime smoke coverage for ${routeKey} lists a needle the smoke no ` +
        `longer contains: ${stale.join(' | ')}`
    );
  }
}

const controller = read('apps/backend/src/api/routes/snaps.controller.ts');
const runtime = read('scripts/verify-snaps-runtime.ps1');

const controllerRoutes = extractControllerRoutes(controller);
if (!controllerRoutes.length) {
  throw new Error('No snaps controller routes were discovered.');
}

// A needle is evidence that the smoke exercises a route, and a bare path is
// evidence for every route whose URL starts with it: `/snaps/transform` is
// inside `/snaps/transform-and-draft`, and GET and POST /snaps/source-library
// had the *same* needle, so two routes shared one piece of evidence. Seven
// routes could therefore lose their coverage without this check noticing.
// The smoke names the method beside the path, so that pair - with the closing
// quote, which is what stops it matching a longer path - is unique per route.
const coverage = new Map([
  ['GET /snaps/health', ['-Method "GET" -Path "/snaps/health"']],
  ['POST /snaps/health', ['-Method "POST" -Path "/api/snaps/health"']],
  ['POST /snaps/transform', ['-Method "POST" -Path "/snaps/transform"']],
  ['POST /snaps/transform-and-draft', ['/api/snaps/transform-and-draft']],
  ['POST /snaps/transform-and-schedule', ['/api/snaps/transform-and-schedule']],
  ['POST /snaps/schedule-variants', ['/snaps/schedule-variants']],
  ['POST /snaps/rag/examples', ['runtime Ollama embedding smoke']],
  ['GET /snaps/rag/examples', ['-Method "GET" -Path "/snaps/rag/examples"']],
  ['DELETE /snaps/rag/examples/:exampleId', ['/snaps/rag/examples/$']],
  ['GET /snaps/rag/search', ['/snaps/rag/search?']],
  ['POST /snaps/rag/rebuild', ['/snaps/rag/rebuild']],
  ['POST /snaps/source-library', ['-Method "POST" -Path "/snaps/source-library"']],
  ['GET /snaps/source-library', ['-Method "GET" -Path "/snaps/source-library"']],
  ['DELETE /snaps/source-library/:sourceId', ['/snaps/source-library/$cleanupSourceId']],
  ['POST /snaps/source-library/:sourceId/promote-to-rag', ['/snaps/source-library/$($source.id)/promote-to-rag']],
  ['POST /snaps/report/generate', ['/snaps/report/generate']],
  ['POST /snaps/report/from-platform-analytics', ['/snaps/report/from-platform-analytics']],
  ['GET /snaps/report/history', ['/snaps/report/history']],
  ['DELETE /snaps/report/:reportId', ['/snaps/report/$cleanupReportId', '/snaps/report/$cleanupAnalyticsReportId']],
  ['GET /snaps/report/:reportId/export', '/export?format='],
  ['POST /snaps/report/:reportId/promote-to-rag', ['/snaps/report/$($report.reportId)/promote-to-rag']],
  ['POST /snaps/inbox/import', ['-Method "POST" -Path "/snaps/inbox/import"']],
  ['POST /snaps/inbox/import-post-comments', ['/snaps/inbox/import-post-comments']],
  ['GET /snaps/inbox/items', ['/snaps/inbox/items?sentiment=question']],
  ['DELETE /snaps/inbox/items', ['-Method "DELETE" -Path "/snaps/inbox/items"']],
  ['DELETE /snaps/inbox/items/:itemId', ['/snaps/inbox/items/$itemId']],
  ['GET /snaps/inbox/reply-capabilities', ['/snaps/inbox/reply-capabilities']],
  ['POST /snaps/inbox/summary', ['/snaps/inbox/summary']],
  ['POST /snaps/inbox/reply-draft', ['/snaps/inbox/reply-draft']],
  ['POST /snaps/inbox/publish-reply', ['/snaps/inbox/publish-reply']],
  ['POST /snaps/video/script', ['/snaps/video/script']],
  ['POST /snaps/video/generate-short', ['/api/snaps/video/generate-short']],
  ['GET /snaps/video/status/:jobId', ['/api/snaps/video/status/runtime-smoke-job']],
  ['POST /snaps/video/attach-to-draft', ['/snaps/video/attach-to-draft']],
  ['GET /snaps/activity', ['/snaps/activity']],
  ['GET /snaps/export', ['/snaps/export']],
  ['POST /snaps/import', ['/snaps/import']],
]);

// Routes that the lightweight PowerShell runtime smoke deliberately does not
// exercise. Every entry needs a reason (enforced below), and the staleCoverage
// guard above removes entries once a route disappears from the controller.
const explicitExemptions = new Map([
  // Card news renders PNG decks and uploads them to the media library, so a
  // smoke run would create real org media on every invocation. Covered instead
  // by `npm run verify:snaps:cardnews-deepseek` against a live DeepSeek key.
  ['POST /snaps/card-news/script', 'route exercised by verify:snaps:controller; pipeline by verify:snaps:cardnews-deepseek (see docs/snaps-card-news.md)'],
  ['POST /snaps/card-news/generate', 'renders and uploads real org media, so the smoke would create it on every run; route validation exercised by verify:snaps:controller and the pipeline by verify:snaps:cardnews-deepseek (see docs/snaps-card-news.md)'],
  ['POST /snaps/card-news/attach-to-draft', 'writes real drafts, so the smoke would create them on every run; route exercised by verify:snaps:controller and the variant builder by verify:snaps:cardnews-deepseek (see docs/snaps-card-news.md)'],
  // Shorts-Maker routes proxy to the optional snaps-shorts-maker docker
  // service; the runtime smoke must stay green without that service running.
  ['POST /snaps/shorts-maker/topic-to-script', 'requires the optional snaps-shorts-maker service (see docs/snaps-shorts-maker.md)'],
  ['POST /snaps/shorts-maker/render-jobs', 'requires the optional snaps-shorts-maker service (see docs/snaps-shorts-maker.md)'],
  ['GET /snaps/shorts-maker/render-jobs/:jobId', 'requires the optional snaps-shorts-maker service (see docs/snaps-shorts-maker.md)'],
  // Agent task routes drive long-running planner work and mutate saved task
  // state, which the liveness-oriented runtime smoke intentionally avoids.
  ['POST /snaps/agent/prepare', 'long-running planner work, not suitable for the liveness smoke'],
  ['GET /snaps/agent/tasks', 'route exercised by verify:snaps:controller against a real task store'],
  ['GET /snaps/agent/tasks/:taskId', 'route exercised by verify:snaps:controller against a real task store'],
  ['POST /snaps/agent/tasks/:taskId/favorite', 'mutates saved agent task state; route exercised by verify:snaps:controller'],
  ['DELETE /snaps/agent/tasks/:taskId/favorite', 'mutates saved agent task state; route exercised by verify:snaps:controller'],
  ['POST /snaps/agent/tasks/:taskId/rating', 'mutates saved agent task state; route exercised by verify:snaps:controller'],
  ['DELETE /snaps/agent/tasks/:taskId', 'destructive cleanup of saved agent task state; route exercised by verify:snaps:controller'],
]);

// An exemption that says "covered by verify:snaps:x" is a claim, and nothing
// checked it. Measured when this was written: two card-news exemptions cited a
// verifier that never called their controller methods, so the routes with the
// most side effects - PNG renders, media uploads, draft writes - had their
// validation covered by nothing at all while the exemption read as coverage.
const exemptionCoverage = new Map([
  ['verify:snaps:controller', 'scripts/verify-snaps-controller.ts'],
  ['verify:snaps:cardnews-deepseek', 'scripts/verify-snaps-cardnews-deepseek.ts'],
  ['verify:snaps:services', 'scripts/verify-snaps-services.ts'],
]);
// The route extractor above keeps the verb and the path; the handler name is
// what a verifier actually calls, so read it here.
const handlerNames = new Map();
const handlerRegex =
  /@(Get|Post|Delete|Put|Patch)\('([^']*)'\)[\s\S]{0,400}?\n\s*(?:async\s+)?([A-Za-z0-9_]+)\s*\(/g;
let handlerMatch;
while ((handlerMatch = handlerRegex.exec(controller))) {
  handlerNames.set(
    `${handlerMatch[1].toUpperCase()} ${normalizePath(`/snaps${handlerMatch[2]}`)}`,
    handlerMatch[3]
  );
}
for (const [routeKey, reason] of explicitExemptions.entries()) {
  const handler = handlerNames.get(routeKey);
  if (!handler) {
    throw new Error(
      `Runtime smoke exemption for ${routeKey} does not match a controller handler`
    );
  }
  // A reason may cite several verifiers for different aspects - one for the
  // route, another for the pipeline behind it - so requiring every named
  // verifier to call the handler is too strict. What makes the exemption mean
  // anything is that at least one of them does.
  const cited = [...exemptionCoverage.entries()].filter(([verifier]) =>
    reason.includes(verifier)
  );
  if (
    cited.length &&
    !cited.some(([, file]) =>
      new RegExp(`[A-Za-z0-9_]+\\.${handler}\\(`).test(read(file))
    )
  ) {
    throw new Error(
      `Runtime smoke exemption for ${routeKey} says ` +
        `${cited.map(([verifier]) => verifier).join(' / ')} covers it, but ` +
        `none of ${cited.map(([, file]) => file).join(', ')} calls ${handler}()`
    );
  }
}

const routeKeys = controllerRoutes.map(keyOf);
const routeKeySet = new Set(routeKeys);
const staleCoverage = [...coverage.keys(), ...explicitExemptions.keys()].filter(
  (routeKey) => !routeKeySet.has(routeKey)
);
if (staleCoverage.length) {
  throw new Error(`Runtime smoke contract references non-controller routes: ${staleCoverage.join(', ')}`);
}

const missing = routeKeys.filter(
  (routeKey) => !coverage.has(routeKey) && !explicitExemptions.has(routeKey)
);
if (missing.length) {
  throw new Error(`Runtime smoke contract is missing routes: ${missing.join(', ')}`);
}

// A needle that sits inside another route's needle is satisfied by that other
// route's call, so the route it stands for can lose its coverage silently.
// Seven did: `/snaps/transform` is inside `/snaps/transform-and-draft`, and GET
// and POST /snaps/source-library shared one needle between them.
const needleOwners = new Map();
for (const [routeKey, needles] of coverage.entries()) {
  for (const needle of Array.isArray(needles) ? needles : [needles]) {
    needleOwners.set(needle, [...(needleOwners.get(needle) || []), routeKey]);
  }
}
for (const [needle, owners] of needleOwners.entries()) {
  if (owners.length > 1) {
    throw new Error(
      `Runtime smoke coverage needle ${needle} stands for ${owners.join(' and ')}` +
        ' - one call cannot be evidence for two routes'
    );
  }
  const [routeKey] = owners;
  for (const [otherNeedle, otherOwners] of needleOwners.entries()) {
    if (otherNeedle === needle || otherOwners.includes(routeKey)) {
      continue;
    }
    if (otherNeedle.includes(needle)) {
      throw new Error(
        `Runtime smoke coverage for ${routeKey} uses the needle ${needle}, ` +
          `which is inside the needle for ${otherOwners.join(' and ')} - that ` +
          "route's call would satisfy this one and hide a dropped call"
      );
    }
  }
}

for (const [routeKey, needles] of coverage.entries()) {
  expectNeedle(runtime, routeKey, Array.isArray(needles) ? needles : [needles]);
}

for (const [routeKey, reason] of explicitExemptions.entries()) {
  if (!reason) {
    throw new Error(`Runtime smoke exemption for ${routeKey} must include a reason.`);
  }
}

console.log(
  `verify-snaps-runtime-contract-ok routes=${routeKeys.length} covered=${coverage.size} exempt=${explicitExemptions.size}`
);
