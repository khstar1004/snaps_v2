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
}

const controller = read('apps/backend/src/api/routes/snaps.controller.ts');
const runtime = read('scripts/verify-snaps-runtime.ps1');

const controllerRoutes = extractControllerRoutes(controller);
if (!controllerRoutes.length) {
  throw new Error('No snaps controller routes were discovered.');
}

const coverage = new Map([
  ['GET /snaps/health', ['/snaps/health']],
  ['POST /snaps/health', ['/api/snaps/health']],
  ['POST /snaps/transform', ['/snaps/transform']],
  ['POST /snaps/transform-and-draft', ['/api/snaps/transform-and-draft']],
  ['POST /snaps/transform-and-schedule', ['/api/snaps/transform-and-schedule']],
  ['POST /snaps/schedule-variants', ['/snaps/schedule-variants']],
  ['POST /snaps/rag/examples', ['runtime Ollama embedding smoke']],
  ['GET /snaps/rag/examples', ['/snaps/rag/examples', 'rag examples list ok']],
  ['DELETE /snaps/rag/examples/:exampleId', ['/snaps/rag/examples/$']],
  ['GET /snaps/rag/search', ['/snaps/rag/search?']],
  ['POST /snaps/rag/rebuild', ['/snaps/rag/rebuild']],
  ['POST /snaps/source-library', ['/snaps/source-library']],
  ['GET /snaps/source-library', ['/snaps/source-library']],
  ['DELETE /snaps/source-library/:sourceId', ['/snaps/source-library/$cleanupSourceId']],
  ['POST /snaps/source-library/:sourceId/promote-to-rag', ['/snaps/source-library/$($source.id)/promote-to-rag']],
  ['POST /snaps/report/generate', ['/snaps/report/generate']],
  ['POST /snaps/report/from-platform-analytics', ['/snaps/report/from-platform-analytics']],
  ['GET /snaps/report/history', ['/snaps/report/history']],
  ['DELETE /snaps/report/:reportId', ['/snaps/report/$cleanupReportId', '/snaps/report/$cleanupAnalyticsReportId']],
  ['GET /snaps/report/:reportId/export', '/export?format='],
  ['POST /snaps/report/:reportId/promote-to-rag', ['/snaps/report/$($report.reportId)/promote-to-rag']],
  ['POST /snaps/inbox/import', ['/snaps/inbox/import']],
  ['POST /snaps/inbox/import-post-comments', ['/snaps/inbox/import-post-comments']],
  ['GET /snaps/inbox/items', ['/snaps/inbox/items?sentiment=question']],
  ['DELETE /snaps/inbox/items', ['/snaps/inbox/items', 'inbox clear ok']],
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

const explicitExemptions = new Map();

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
