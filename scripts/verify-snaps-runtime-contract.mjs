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
  ['POST /snaps/agent/prepare', ['/snaps/agent/prepare']],
  ['GET /snaps/agent/tasks', ['/snaps/agent/tasks?keyword=']],
  ['GET /snaps/agent/tasks/:taskId', ['/snaps/agent/tasks/$taskId']],
  ['POST /snaps/agent/tasks/:taskId/favorite', ['/snaps/agent/tasks/$taskId/favorite']],
  ['DELETE /snaps/agent/tasks/:taskId/favorite', ['/snaps/agent/tasks/$taskId/favorite']],
  ['POST /snaps/agent/tasks/:taskId/rating', ['/snaps/agent/tasks/$taskId/rating']],
  ['DELETE /snaps/agent/tasks/:taskId', ['/snaps/agent/tasks/$taskId']],
  ['POST /snaps/transform', ['/snaps/transform']],
  ['POST /snaps/transform-and-draft', ['/api/snaps/transform-and-draft']],
  ['POST /snaps/transform-and-schedule', ['/api/snaps/transform-and-schedule']],
  ['POST /snaps/schedule-variants', ['/snaps/schedule-variants']],
  ['GET /snaps/schedule/best-time', ['/snaps/schedule/best-time']],
  ['POST /snaps/ideas/generate', ['/snaps/ideas/generate']],
  ['POST /snaps/ideas', ['/snaps/ideas']],
  ['GET /snaps/ideas', ['/snaps/ideas?status=']],
  ['POST /snaps/ideas/:ideaId/status', ['/snaps/ideas/$ideaId/status']],
  ['POST /snaps/ideas/:ideaId/promote-to-source', ['/snaps/ideas/$ideaId/promote-to-source']],
  ['DELETE /snaps/ideas/:ideaId', ['/snaps/ideas/$ideaId']],
  ['POST /snaps/brand-kits/analyze', ['/snaps/brand-kits/analyze']],
  ['POST /snaps/brand-kits', ['/snaps/brand-kits']],
  ['GET /snaps/brand-kits', ['/snaps/brand-kits']],
  ['POST /snaps/brand-kits/:brandKitId/apply', ['/snaps/brand-kits/$brandKitId/apply']],
  ['DELETE /snaps/brand-kits/:brandKitId', ['/snaps/brand-kits/$brandKitId']],
  ['POST /snaps/media-library/preview', ['/snaps/media-library/preview']],
  ['POST /snaps/media-library', ['/snaps/media-library']],
  ['GET /snaps/media-library', ['/snaps/media-library']],
  ['POST /snaps/media-library/:assetId/attach', ['/snaps/media-library/$mediaAssetId/attach']],
  ['POST /snaps/media-library/:assetId/schedule', ['/snaps/media-library/$mediaAssetId/schedule']],
  ['DELETE /snaps/media-library/:assetId', ['/snaps/media-library/$mediaAssetId']],
  ['POST /snaps/creative-briefs/preview', ['/snaps/creative-briefs/preview']],
  ['POST /snaps/creative-briefs/save-media', ['/snaps/creative-briefs/save-media']],
  ['POST /snaps/coach/viral', ['/snaps/coach/viral']],
  ['POST /snaps/experiments/variations/preview', ['/snaps/experiments/variations/preview']],
  ['POST /snaps/experiments/variations/import-sources', ['/snaps/experiments/variations/import-sources']],
  ['POST /snaps/experiments/variations/schedule', ['/snaps/experiments/variations/schedule']],
  ['POST /snaps/approvals', ['/snaps/approvals']],
  ['GET /snaps/approvals', ['/snaps/approvals']],
  ['POST /snaps/approvals/:approvalId/review', ['/snaps/approvals/$approvalId/review']],
  ['POST /snaps/approvals/:approvalId/schedule', ['/snaps/approvals/$approvalId/schedule']],
  ['POST /snaps/approvals/:approvalId/public-link', ['/snaps/approvals/$approvalId/public-link']],
  ['DELETE /snaps/approvals/:approvalId/public-link', ['approval public review revoke ok']],
  ['POST /snaps/approvals/:approvalId/comments', ['/snaps/approvals/$approvalId/comments']],
  ['POST /snaps/approvals/:approvalId/comments/:commentId/resolve', ['/snaps/approvals/$approvalId/comments/$approvalCommentId/resolve']],
  ['DELETE /snaps/approvals/:approvalId', ['/snaps/approvals/$approvalId']],
  ['POST /snaps/bulk/preview', ['/snaps/bulk/preview']],
  ['POST /snaps/bulk/import-sources', ['/snaps/bulk/import-sources']],
  ['POST /snaps/bulk/schedule', ['/snaps/bulk/schedule']],
  ['POST /snaps/feeds/preview', ['/snaps/feeds/preview']],
  ['POST /snaps/feeds/import-sources', ['/snaps/feeds/import-sources']],
  ['POST /snaps/feeds/schedule', ['/snaps/feeds/schedule']],
  ['POST /snaps/visuals/carousel/preview', ['/snaps/visuals/carousel/preview']],
  ['POST /snaps/visuals/carousel/export', ['/snaps/visuals/carousel/export']],
  ['POST /snaps/visuals/carousel/schedule', ['/snaps/visuals/carousel/schedule']],
  ['POST /snaps/visual-planner/preview', ['/snaps/visual-planner/preview']],
  ['POST /snaps/visual-planner/schedule', ['/snaps/visual-planner/schedule']],
  ['POST /snaps/first-comments/preview', ['/snaps/first-comments/preview']],
  ['POST /snaps/first-comments/schedule', ['/snaps/first-comments/schedule']],
  ['POST /snaps/hashtag-sets/preview', ['/snaps/hashtag-sets/preview']],
  ['POST /snaps/hashtag-sets', ['/snaps/hashtag-sets']],
  ['GET /snaps/hashtag-sets', ['/snaps/hashtag-sets']],
  ['POST /snaps/hashtag-sets/:setId/apply', ['/snaps/hashtag-sets/$hashtagSetId/apply']],
  ['POST /snaps/hashtag-sets/:setId/schedule', ['/snaps/hashtag-sets/$hashtagSetId/schedule']],
  ['DELETE /snaps/hashtag-sets/:setId', ['/snaps/hashtag-sets/$hashtagSetId']],
  ['POST /snaps/hashtags/tracker/preview', ['/snaps/hashtags/tracker/preview']],
  ['POST /snaps/hashtags/tracker/save-set', ['/snaps/hashtags/tracker/save-set']],
  ['POST /snaps/listening/preview', ['/snaps/listening/preview']],
  ['POST /snaps/listening/monitors', ['/snaps/listening/monitors']],
  ['GET /snaps/listening/monitors', ['/snaps/listening/monitors']],
  ['POST /snaps/listening/monitors/:monitorId/run', ['/snaps/listening/monitors/$listeningMonitorId/run']],
  ['POST /snaps/listening/monitors/:monitorId/promote-to-inbox', ['/snaps/listening/monitors/$listeningMonitorId/promote-to-inbox']],
  ['DELETE /snaps/listening/monitors/:monitorId', ['/snaps/listening/monitors/$listeningMonitorId']],
  ['POST /snaps/trends/radar/preview', ['/snaps/trends/radar/preview']],
  ['POST /snaps/trends/radar/import-sources', ['/snaps/trends/radar/import-sources']],
  ['POST /snaps/previews/post', ['/snaps/previews/post']],
  ['POST /snaps/compliance/ad-disclosure', ['/snaps/compliance/ad-disclosure', 'ad disclosure guard ok']],
  ['POST /snaps/recycle/preview', ['/snaps/recycle/preview']],
  ['POST /snaps/recycle/import-sources', ['/snaps/recycle/import-sources']],
  ['POST /snaps/recycle/schedule', ['/snaps/recycle/schedule']],
  ['POST /snaps/recurring/preview', ['/snaps/recurring/preview']],
  ['POST /snaps/recurring/import-sources', ['/snaps/recurring/import-sources']],
  ['POST /snaps/recurring/schedule', ['/snaps/recurring/schedule']],
  ['POST /snaps/repurpose/preview', ['/snaps/repurpose/preview']],
  ['POST /snaps/repurpose/import-sources', ['/snaps/repurpose/import-sources']],
  ['POST /snaps/repurpose/schedule', ['/snaps/repurpose/schedule']],
  ['POST /snaps/rag/examples', ['runtime Ollama embedding smoke']],
  ['GET /snaps/rag/examples', ['/snaps/rag/examples', 'rag examples list ok']],
  ['DELETE /snaps/rag/examples/:exampleId', ['/snaps/rag/examples/$']],
  ['GET /snaps/rag/search', ['/snaps/rag/search?']],
  ['POST /snaps/rag/rebuild', ['/snaps/rag/rebuild']],
  ['POST /snaps/source-library', ['/snaps/source-library']],
  ['POST /snaps/source-resolver/preview', ['/snaps/source-resolver/preview']],
  ['POST /snaps/source-resolver/import', ['/snaps/source-resolver/import']],
  ['POST /snaps/calendar/plan', ['/snaps/calendar/plan']],
  ['POST /snaps/calendar/import-sources', ['/snaps/calendar/import-sources']],
  ['POST /snaps/calendar/schedule', ['/snaps/calendar/schedule']],
  ['POST /snaps/categories/plan', ['/snaps/categories/plan']],
  ['POST /snaps/categories/import-sources', ['/snaps/categories/import-sources']],
  ['POST /snaps/categories/schedule', ['/snaps/categories/schedule']],
  ['POST /snaps/conditions/preview', ['/snaps/conditions/preview']],
  ['POST /snaps/conditions/import-source', ['/snaps/conditions/import-source']],
  ['POST /snaps/conditions/schedule', ['/snaps/conditions/schedule']],
  ['GET /snaps/source-library', ['/snaps/source-library']],
  ['DELETE /snaps/source-library/:sourceId', ['/snaps/source-library/$cleanupSourceId']],
  ['POST /snaps/source-library/:sourceId/promote-to-rag', ['/snaps/source-library/$($source.id)/promote-to-rag']],
  ['POST /snaps/report/generate', ['/snaps/report/generate']],
  ['POST /snaps/report/from-platform-analytics', ['/snaps/report/from-platform-analytics']],
  ['GET /snaps/report/history', ['/snaps/report/history']],
  ['DELETE /snaps/report/:reportId', ['/snaps/report/$cleanupReportId', '/snaps/report/$cleanupAnalyticsReportId']],
  ['GET /snaps/report/:reportId/export', '/export?format='],
  ['POST /snaps/report/:reportId/promote-to-rag', ['/snaps/report/$($report.reportId)/promote-to-rag']],
  ['POST /snaps/sales/campaigns', ['/snaps/sales/campaigns']],
  ['GET /snaps/sales/campaigns', ['/snaps/sales/campaigns']],
  ['DELETE /snaps/sales/campaigns/:campaignId', ['/snaps/sales/campaigns/$salesCampaignId']],
  ['POST /snaps/sales/events', ['/snaps/sales/events']],
  ['GET /snaps/sales/summary', ['/snaps/sales/summary']],
  ['POST /snaps/sales/report', ['/snaps/sales/report']],
  ['POST /snaps/sales/proposal', ['/snaps/sales/proposal']],
  ['POST /snaps/competitors', ['/snaps/competitors']],
  ['GET /snaps/competitors', ['/snaps/competitors']],
  ['DELETE /snaps/competitors/:competitorId', ['/snaps/competitors/$competitorId']],
  ['POST /snaps/competitors/snapshots', ['/snaps/competitors/snapshots']],
  ['POST /snaps/competitors/import-preview', ['/snaps/competitors/import-preview']],
  ['POST /snaps/competitors/import', ['/snaps/competitors/import']],
  ['GET /snaps/competitors/summary', ['/snaps/competitors/summary']],
  ['POST /snaps/competitors/report', ['/snaps/competitors/report']],
  ['POST /snaps/inbox/import', ['/snaps/inbox/import']],
  ['POST /snaps/inbox/import-post-comments', ['/snaps/inbox/import-post-comments']],
  ['GET /snaps/inbox/items', ['/snaps/inbox/items?sentiment=question']],
  ['POST /snaps/inbox/assignments/preview', ['/snaps/inbox/assignments/preview']],
  ['POST /snaps/inbox/items/:itemId/status', ['/snaps/inbox/items/$triageItemId/status']],
  ['DELETE /snaps/inbox/items', ['/snaps/inbox/items', 'inbox clear ok']],
  ['DELETE /snaps/inbox/items/:itemId', ['/snaps/inbox/items/$itemId']],
  ['GET /snaps/inbox/reply-capabilities', ['/snaps/inbox/reply-capabilities']],
  ['GET /snaps/inbox/reply-templates', ['/snaps/inbox/reply-templates?platform=instagram']],
  ['POST /snaps/inbox/reply-templates', ['/snaps/inbox/reply-templates']],
  ['DELETE /snaps/inbox/reply-templates/:templateId', ['/snaps/inbox/reply-templates/$replyTemplateId']],
  ['GET /snaps/inbox/notes', ['/snaps/inbox/notes?platform=instagram']],
  ['POST /snaps/inbox/notes', ['/snaps/inbox/notes']],
  ['DELETE /snaps/inbox/notes/:noteId', ['/snaps/inbox/notes/$inboxNoteId']],
  ['POST /snaps/inbox/summary', ['/snaps/inbox/summary']],
  ['POST /snaps/inbox/reply-draft', ['/snaps/inbox/reply-draft']],
  ['POST /snaps/inbox/publish-reply', ['/snaps/inbox/publish-reply']],
  ['POST /snaps/video/script', ['/snaps/video/script']],
  ['POST /snaps/video/generate-short', ['/api/snaps/video/generate-short']],
  ['POST /snaps/video/voiceover-captions/preview', ['/snaps/video/voiceover-captions/preview']],
  ['POST /snaps/video/publish-guard/preview', ['/snaps/video/publish-guard/preview']],
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
