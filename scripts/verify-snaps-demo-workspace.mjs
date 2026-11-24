import { readFileSync } from 'node:fs';

const demo = JSON.parse(readFileSync('docs/snaps-demo-workspace.json', 'utf8'));

const validPlatforms = new Set([
  'threads',
  'instagram',
  'youtube',
  'tiktok',
  'xiaohongshu',
  'naver-blog',
  'naver-cafe',
  'kakao-talk',
  'linkedin',
  'x',
]);
const validSentiments = new Set([
  'question',
  'praise',
  'complaint',
  'spam',
  'collaboration',
  'other',
]);
const validActivityTypes = new Set([
  'transform',
  'draft',
  'rag',
  'source',
  'report',
  'video',
  'media',
  'inbox',
  'delete',
]);
const validFeedbackStatuses = new Set(['unread', 'unresolved', 'resolved']);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertArray(name) {
  assert(Array.isArray(demo[name]), `demo workspace ${name} must be an array`);
  assert(demo[name].length > 0, `demo workspace ${name} must not be empty`);
}

assert(demo.product === 'snaps', 'demo workspace product must be snaps');
assert(demo.kind === 'workspace-demo', 'demo workspace kind must be workspace-demo');
assert(typeof demo.exportedAt === 'string', 'demo workspace exportedAt is required');

for (const name of [
  'sources',
  'styleExamples',
  'reports',
  'mediaAssets',
  'inboxItems',
  'replyTemplates',
  'inboxNotes',
  'activity',
]) {
  assertArray(name);
}

for (const source of demo.sources) {
  assert(typeof source.id === 'string' && source.id, 'source id is required');
  assert(
    typeof source.sourceText === 'string' && source.sourceText.trim().length >= 5,
    `source ${source.id} needs usable sourceText`
  );
}

for (const example of demo.styleExamples) {
  assert(typeof example.id === 'string' && example.id, 'style example id is required');
  assert(
    validPlatforms.has(example.platform),
    `style example ${example.id} has invalid platform ${example.platform}`
  );
  assert(
    typeof example.content === 'string' && example.content.trim().length >= 5,
    `style example ${example.id} needs content`
  );
}

for (const report of demo.reports) {
  assert(typeof report.id === 'string' && report.id, 'report id is required');
  assert(typeof report.title === 'string' && report.title, `report ${report.id} needs title`);
  assert(
    report.report && typeof report.report === 'object' && !Array.isArray(report.report),
    `report ${report.id} needs an object report payload`
  );
  assert(
    Array.isArray(report.report.insights) && Array.isArray(report.report.actionItems),
    `report ${report.id} needs insights and actionItems arrays`
  );
}

for (const asset of demo.mediaAssets) {
  assert(typeof asset.id === 'string' && asset.id, 'media asset id is required');
  assert(
    typeof asset.url === 'string' && /^https?:\/\//.test(asset.url),
    `media asset ${asset.id} needs an http url`
  );
  assert(
    typeof asset.altText === 'string' && asset.altText.trim().length >= 5,
    `media asset ${asset.id} needs alt text`
  );
  assert(
    Array.isArray(asset.targetPlatforms) &&
      asset.targetPlatforms.every((platform) => validPlatforms.has(platform)),
    `media asset ${asset.id} has invalid target platforms`
  );
}

for (const item of demo.inboxItems) {
  assert(typeof item.id === 'string' && item.id, 'inbox item id is required');
  assert(validPlatforms.has(item.platform), `inbox item ${item.id} has invalid platform`);
  assert(validSentiments.has(item.sentiment), `inbox item ${item.id} has invalid sentiment`);
  assert(
    !item.status || validFeedbackStatuses.has(item.status),
    `inbox item ${item.id} has invalid status`
  );
  assert(
    typeof item.content === 'string' && item.content.trim().length >= 5,
    `inbox item ${item.id} needs content`
  );
}

for (const template of demo.replyTemplates) {
  assert(typeof template.id === 'string' && template.id, 'reply template id is required');
  assert(
    !template.platform || validPlatforms.has(template.platform),
    `reply template ${template.id} has invalid platform`
  );
  assert(
    !template.sentiment || validSentiments.has(template.sentiment),
    `reply template ${template.id} has invalid sentiment`
  );
  assert(
    typeof template.title === 'string' && template.title,
    `reply template ${template.id} needs title`
  );
  assert(
    typeof template.body === 'string' && template.body.trim().length >= 5,
    `reply template ${template.id} needs body`
  );
  assert(Array.isArray(template.tags), `reply template ${template.id} needs tags`);
}

for (const note of demo.inboxNotes) {
  assert(typeof note.id === 'string' && note.id, 'inbox note id is required');
  assert(
    !note.platform || validPlatforms.has(note.platform),
    `inbox note ${note.id} has invalid platform`
  );
  assert(
    typeof note.note === 'string' && note.note.trim().length >= 5,
    `inbox note ${note.id} needs note text`
  );
  assert(
    typeof note.author === 'string' || typeof note.postId === 'string',
    `inbox note ${note.id} needs author or postId`
  );
  assert(Array.isArray(note.tags), `inbox note ${note.id} needs tags`);
}

for (const entry of demo.activity) {
  assert(typeof entry.id === 'string' && entry.id, 'activity id is required');
  assert(validActivityTypes.has(entry.type), `activity ${entry.id} has invalid type`);
  assert(typeof entry.title === 'string' && entry.title, `activity ${entry.id} needs title`);
}

console.log(
  `verify-snaps-demo-ok sources=${demo.sources.length} styleExamples=${demo.styleExamples.length} reports=${demo.reports.length} mediaAssets=${demo.mediaAssets.length} inbox=${demo.inboxItems.length} replyTemplates=${demo.replyTemplates.length} inboxNotes=${demo.inboxNotes.length} activity=${demo.activity.length}`
);
