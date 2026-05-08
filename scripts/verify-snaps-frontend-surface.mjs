import { readFileSync } from 'node:fs';

const workspacePath = 'apps/frontend/src/components/snaps/snaps-workspace.tsx';
const content = readFileSync(workspacePath, 'utf8');

function expectContains(needle, label = needle) {
  if (!content.includes(needle)) {
    throw new Error(`Missing snaps frontend surface: ${label}`);
  }
}

const routeCalls = [
  ["snapsFetch('/snaps/health'", 'health'],
  ["snapsFetch('/snaps/activity'", 'activity log'],
  ["snapsFetch('/snaps/export'", 'workspace export'],
  ["snapsFetch('/snaps/import'", 'workspace import'],
  ["snapsFetch('/snaps/transform'", 'AI transform'],
  ["snapsFetch('/snaps/schedule-variants'", 'draft/schedule handoff'],
  ["snapsFetch('/snaps/source-library'", 'source library list/save'],
  ['/snaps/source-library/${activeSourceId}', 'source delete'],
  ['/snaps/source-library/${activeSourceId}/promote-to-rag', 'source promote to RAG'],
  ["snapsFetch('/snaps/rag/examples'", 'RAG examples list/save'],
  ['/snaps/rag/examples/${exampleId}', 'RAG example delete'],
  ['/snaps/rag/search?query=', 'RAG search'],
  ["snapsFetch('/snaps/rag/rebuild'", 'RAG rebuild'],
  ["snapsFetch('/snaps/report/generate'", 'report generate'],
  ["snapsFetch('/snaps/report/from-platform-analytics'", 'provider analytics report'],
  ["snapsFetch('/snaps/report/history'", 'report history'],
  ['/snaps/report/${activeReportId}/export?format=${format}', 'report export'],
  ['/snaps/report/${activeReportId}', 'report delete'],
  ['/snaps/report/${activeReportId}/promote-to-rag', 'report promote to RAG'],
  ["snapsFetch('/snaps/inbox/reply-capabilities'", 'reply capabilities'],
  ["snapsFetch('/snaps/inbox/import'", 'feedback import'],
  ["snapsFetch('/snaps/inbox/import-post-comments'", 'connected comment import'],
  ["snapsFetch('/snaps/inbox/summary'", 'feedback summary'],
  ["snapsFetch('/snaps/inbox/reply-draft'", 'reply draft'],
  ["snapsFetch('/snaps/inbox/publish-reply'", 'reply publish'],
  ["snapsFetch('/snaps/inbox/items'", 'inbox clear'],
  ["generateVideo ? '/snaps/video/generate-short' : '/snaps/video/script'", 'shorts script/generate toggle'],
  ["snapsFetch('/snaps/video/attach-to-draft'", 'shorts attach to draft'],
];

const actionBindings = [
  'onClick={loadHealth}',
  'onClick={copyWorkspaceExport}',
  'onClick={fillDemoWorkspaceImport}',
  'onClick={importWorkspaceBackup}',
  'onClick={saveSource}',
  'onClick={deleteActiveSource}',
  'onClick={promoteSourceToRag}',
  'onClick={transform}',
  'onClick={createDrafts}',
  'onClick={saveStyleExample}',
  'onClick={rebuildRagEmbeddings}',
  'onClick={searchStyleExamples}',
  'onClick={() => deleteStyleExample(example.id)}',
  'onClick={() => generateShorts(false)}',
  'onClick={() => generateShorts(true)}',
  'onClick={copyActive}',
  'onClick={copyActiveMarkdown}',
  'onClick={copyActiveHtml}',
  'onClick={generateReport}',
  'onClick={generateExistingAnalyticsReport}',
  'onClick={deleteActiveReport}',
  "onClick={() => copyReportExport('markdown')}",
  "onClick={() => copyReportExport('html')}",
  "onClick={() => copyReportExport('print-html')}",
  'onClick={promoteReportToRag}',
  'onClick={attachShortsToDraft}',
  'onClick={importFeedback}',
  'onClick={() => summarizeFeedback(true)}',
  'onClick={clearFeedbackInbox}',
  'onClick={importPostComments}',
  'onClick={() => summarizeFeedback(false)}',
  'onClick={createReplyDraft}',
  'onClick={publishPlatformReply}',
  "onClick={() => setFeedbackReplyText(suggestion.reply || '')}",
  'onClick={loadActivity}',
];

const helperSurfaces = [
  'withSnapsJsonHeaders',
  'readSnapsError',
  'confirmOperatorAction',
  'confirmDestructive',
  'snapsDemoWorkspace',
  'replyCapabilities',
  'replyIntegrationOptions',
  'formatVariantMarkdown',
  'formatVariantHtml',
  'assistChecklist',
];

const platforms = [
  'threads',
  'instagram',
  'youtube',
  'tiktok',
  'naver-blog',
  'naver-cafe',
  'kakao-talk',
  'linkedin',
  'x',
];

const labels = [
  'snaps 스튜디오',
  '워크스페이스 가져오기',
  '데모 채우기',
  '가져오기',
  '내보내기',
  'AI 변환',
  'RAG 스타일',
  'RAG 임베딩 재생성',
  '받은 반응함',
  '작업 기록',
  '네이버 카페',
  'HTML',
  'Markdown',
  'PDF HTML',
  '쇼츠',
  'Pixelle 요청',
];

for (const [needle, label] of routeCalls) {
  expectContains(needle, label);
}
for (const binding of actionBindings) {
  expectContains(binding);
}
for (const surface of helperSurfaces) {
  expectContains(surface);
}
for (const platform of platforms) {
  expectContains(`'${platform}'`, `platform ${platform}`);
}
for (const label of labels) {
  expectContains(label, `label ${label}`);
}

console.log(
  `verify-snaps-frontend-surface-ok routes=${routeCalls.length} actions=${actionBindings.length} helpers=${helperSurfaces.length} platforms=${platforms.length} labels=${labels.length}`
);
