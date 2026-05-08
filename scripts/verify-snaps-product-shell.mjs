import { existsSync, readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

function expectContains(path, needle, label = needle) {
  const content = read(path);
  if (!content.includes(needle)) {
    throw new Error(`${path} is missing snaps product shell evidence: ${label}`);
  }
}

function expectNotContains(path, needle, label = needle) {
  const content = read(path);
  if (content.includes(needle)) {
    throw new Error(`${path} contains disallowed snaps product shell evidence: ${label}`);
  }
}

function expectNotExists(path, label = path) {
  if (existsSync(path)) {
    throw new Error(`${path} contains disallowed snaps product shell file: ${label}`);
  }
}

const requiredFiles = [
  'apps/frontend/src/app/(app)/(site)/snaps/page.tsx',
  'apps/frontend/src/app/(app)/(preview)/p/[id]/page.tsx',
  'apps/frontend/src/components/snaps/snaps-workspace.tsx',
  'apps/frontend/src/components/snaps/snaps-launch-button.tsx',
  'apps/extension/manifest.json',
  'apps/extension/manifest.dev.json',
  'apps/extension/package.json',
  'apps/extension/src/background.ts',
  'scripts/package-extension.mjs',
  'apps/backend/package.json',
  'apps/frontend/package.json',
  'apps/orchestrator/package.json',
  'apps/commands/package.json',
  'apps/commands/src/tasks/agent.run.ts',
  'apps/sdk/package.json',
  'apps/sdk/README.md',
  'apps/sdk/src/index.ts',
  'package.json',
  'apps/frontend/src/components/layout/top.menu.tsx',
  'apps/frontend/src/components/launches/launches.component.tsx',
  'apps/frontend/src/components/layout/local.font.ts',
  'apps/frontend/src/app/global.scss',
  'apps/frontend/src/app/global-error.tsx',
  'apps/frontend/src/app/(app)/layout.tsx',
  'apps/frontend/src/app/(extension)/layout.tsx',
  'apps/frontend/src/app/(provider)/layout.tsx',
  'libraries/react-shared-libraries/src/translation/i18n.config.ts',
  'apps/frontend/src/app/(app)/privacy/page.tsx',
  'apps/frontend/src/app/(app)/terms/page.tsx',
  'apps/frontend/src/components/ui/logo-text.component.tsx',
  'apps/frontend/src/components/new-layout/logo.tsx',
  'apps/frontend/src/components/webhooks/webhooks.tsx',
  'libraries/nestjs-libraries/src/crypto/nowpayments.ts',
  'libraries/nestjs-libraries/src/sentry/initialize.sentry.ts',
  'libraries/nestjs-libraries/src/database/prisma/agencies/agencies.service.ts',
  'libraries/nestjs-libraries/src/newsletter/providers/listmonk.provider.ts',
  'libraries/nestjs-libraries/src/chat/load.tools.service.ts',
  'libraries/nestjs-libraries/src/chat/mastra.service.ts',
  'libraries/nestjs-libraries/src/chat/mastra.store.ts',
  'libraries/nestjs-libraries/src/chat/start.mcp.ts',
  'libraries/nestjs-libraries/src/integrations/social/mastodon.custom.provider.ts',
  'libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts',
  'libraries/nestjs-libraries/src/services/stripe.service.ts',
  'apps/backend/src/api/routes/snaps.controller.ts',
  'apps/backend/src/api/routes/auth.controller.ts',
  'apps/backend/src/api/routes/copilot.controller.ts',
  'apps/frontend/src/components/agents/agent.chat.tsx',
  'apps/frontend/public/icons/platforms/naver-cafe.svg',
];

const routeChecks = [
  ['apps/frontend/src/app/(app)/(site)/snaps/page.tsx', 'SnapsWorkspace', 'Studio route renders workspace'],
  ['apps/frontend/src/app/(app)/(site)/snaps/page.tsx', "title: 'snaps 스튜디오'", 'Studio metadata'],
  ['apps/frontend/src/app/(app)/(site)/snaps/page.tsx', 'export default function snapsPage', 'Studio page export'],
];

const navigationChecks = [
  ['apps/frontend/src/components/layout/top.menu.tsx', "name: 'snaps'", 'main menu label'],
  ['apps/frontend/src/components/layout/top.menu.tsx', "path: '/snaps'", 'main menu route'],
  ['apps/frontend/src/components/launches/launches.component.tsx', 'SnapsLaunchButton', 'calendar launch import'],
  ['apps/frontend/src/components/launches/launches.component.tsx', '<SnapsLaunchButton />', 'calendar launch placement'],
  ['apps/frontend/src/components/snaps/snaps-launch-button.tsx', 'href="/snaps"', 'launch button route'],
  ['apps/frontend/src/components/snaps/snaps-launch-button.tsx', 'snaps 변환', 'launch button label'],
];

const brandChecks = [
  ['apps/frontend/src/components/layout/local.font.ts', "className: 'font-snaps-sans'", 'local font class export'],
  ['apps/frontend/src/app/global.scss', '.font-snaps-sans', 'local font CSS class'],
  ['apps/frontend/src/app/global.scss', "font-family: Inter, 'Segoe UI'", 'system font stack'],
  ['apps/frontend/src/app/(app)/layout.tsx', 'snapsLocalFont.className', 'app layout local font'],
  ['apps/frontend/src/app/(app)/layout.tsx', 'data-domain="snaps.local"', 'analytics domain'],
  ['apps/frontend/src/app/(app)/layout.tsx', 'domain="snaps.local"', 'plausible domain'],
  ['apps/frontend/src/app/(app)/layout.tsx', 'NEXT_PUBLIC_SNAPS_OAUTH_DISPLAY_NAME', 'app shell snaps OAuth display env'],
  ['apps/frontend/src/app/(extension)/layout.tsx', 'NEXT_PUBLIC_SNAPS_OAUTH_DISPLAY_NAME', 'extension shell snaps OAuth display env'],
  ['apps/frontend/src/app/(provider)/layout.tsx', 'NEXT_PUBLIC_SNAPS_OAUTH_DISPLAY_NAME', 'provider shell snaps OAuth display env'],
  ['apps/extension/manifest.json', '"name": "snaps"', 'extension manifest name'],
  ['apps/extension/manifest.json', 'snaps browser extension for social content operations', 'extension manifest description'],
  ['apps/extension/manifest.json', 'https://*.snaps.local/*', 'extension manifest snaps host'],
  ['apps/extension/manifest.dev.json', '"name": "snaps"', 'extension dev manifest name'],
  ['apps/extension/package.json', '"name": "snaps-extension"', 'extension package name'],
  ['apps/extension/src/background.ts', 'snaps\\.local', 'extension allowed snaps origin'],
  ['apps/extension/package.json', 'node ../../scripts/package-extension.mjs .', 'extension Windows-safe packaging script'],
  ['scripts/package-extension.mjs', 'copyFileSync(manifestPath', 'extension manifest packaging'],
  ['scripts/package-extension.mjs', 'header(0x06054b50, 22)', 'extension zip writer'],
  ['apps/backend/package.json', '"name": "snaps-backend"', 'backend package name'],
  ['apps/frontend/package.json', '"name": "snaps-frontend"', 'frontend package name'],
  ['apps/orchestrator/package.json', '"name": "snaps-orchestrator"', 'orchestrator package name'],
  ['apps/commands/package.json', '"name": "snaps-command"', 'commands package name'],
  ['apps/commands/package.json', './apps/commands/src/main', 'commands dev entrypoint'],
  ['apps/commands/package.json', './dist/apps/commands/src/main.js', 'commands start entrypoint'],
  ['apps/commands/src/tasks/agent.run.ts', 'SNAPS_AGENT_ORG_ID is required', 'commands agent org guard'],
  ['apps/commands/src/tasks/agent.run.ts', 'this._agentGraphService.start(orgId, request)', 'commands agent current API'],
  ['apps/sdk/package.json', '"name": "@snaps/node"', 'SDK package name'],
  ['apps/sdk/package.json', 'snaps public API client', 'SDK package description'],
  ['apps/sdk/package.json', 'snaps Contributors', 'SDK package author'],
  ['apps/sdk/README.md', '# snaps NodeJS SDK', 'SDK README title'],
  ['apps/sdk/README.md', "import Snaps from '@snaps/node'", 'SDK README usage'],
  ['apps/sdk/src/index.ts', 'export default class Snaps', 'SDK client class'],
  ['apps/sdk/src/index.ts', "process.env.SNAPS_API_URL ?? 'http://localhost:5000'", 'SDK local default API URL'],
  ['package.json', 'Korean-first AI social content operations platform', 'root package description'],
  ['apps/frontend/src/components/ui/logo-text.component.tsx', '>snaps</span>', 'logo text'],
  ['apps/frontend/src/components/new-layout/logo.tsx', 'fill="#0EA5A8"', 'snaps logo teal'],
  ['apps/frontend/src/components/new-layout/logo.tsx', 'fill="#F6A623"', 'snaps logo amber'],
  ['apps/frontend/src/app/(app)/auth/layout.tsx', '/brand/snaps-operations-bg.png', 'generated brand background'],
  ['apps/frontend/src/app/(app)/auth/layout.tsx', '한국 팀을 위한 AI 콘텐츠 운영 워크스페이스', 'Korean auth hero copy'],
  ['libraries/react-shared-libraries/src/translation/i18n.config.ts', "fallbackLng = 'ko'", 'Korean default language'],
  ['apps/frontend/src/app/(extension)/layout.tsx', 'language="ko"', 'extension shell Korean language'],
  ['apps/frontend/src/app/(provider)/layout.tsx', 'language="ko"', 'provider shell Korean language'],
  ['apps/frontend/src/app/global-error.tsx', "lang: 'ko'", 'Sentry error dialog Korean locale'],
  ['apps/frontend/src/app/global-error.tsx', '문제가 발생했습니다.', 'Sentry error dialog Korean copy'],
  ['apps/frontend/src/app/(app)/(preview)/p/[id]/page.tsx', "title: 'snaps Preview'", 'preview metadata'],
  ['apps/frontend/src/app/(app)/(preview)/p/[id]/page.tsx', "src={'/logo-text.svg'}", 'preview snaps logo asset'],
  ['apps/frontend/src/app/(app)/(preview)/p/[id]/page.tsx', 'alt="snaps"', 'preview snaps logo alt'],
  ['apps/frontend/src/components/webhooks/webhooks.tsx', "picture: '/logo-text.svg'", 'webhook test payload logo'],
  ['libraries/nestjs-libraries/src/crypto/nowpayments.ts', 'Lifetime deal account for snaps', 'payment description'],
  ['libraries/nestjs-libraries/src/sentry/initialize.sentry.ts', '`snaps ${capitalize(appName)}`', 'Sentry app name'],
  ['libraries/nestjs-libraries/src/database/prisma/agencies/agencies.service.ts', 'SNAPS_AGENCY_REVIEW_EMAIL', 'agency review recipient env'],
  ['libraries/nestjs-libraries/src/database/prisma/agencies/agencies.service.ts', 'snaps agency directory', 'agency approval copy'],
  ['libraries/nestjs-libraries/src/newsletter/providers/listmonk.provider.ts', 'Welcome to snaps', 'newsletter welcome subject'],
  ['libraries/nestjs-libraries/src/chat/load.tools.service.ts', "id: 'snaps'", 'Mastra agent id'],
  ['libraries/nestjs-libraries/src/chat/load.tools.service.ts', "name: 'snaps'", 'Mastra agent display name'],
  ['libraries/nestjs-libraries/src/chat/mastra.service.ts', 'snaps: await this._loadToolsService.agent()', 'Mastra agent registry key'],
  ['libraries/nestjs-libraries/src/chat/mastra.store.ts', "id: 'snaps-store'", 'Mastra store id'],
  ['libraries/nestjs-libraries/src/chat/start.mcp.ts', "name: 'snaps MCP'", 'MCP server name'],
  ['libraries/nestjs-libraries/src/chat/start.mcp.ts', "mastra.getAgent('snaps')", 'MCP agent lookup'],
  ['libraries/nestjs-libraries/src/chat/start.mcp.ts', 'agents: { snaps: agent }', 'MCP agent export key'],
  ['libraries/nestjs-libraries/src/integrations/social/mastodon.custom.provider.ts', "form.append('client_name', 'snaps')", 'Mastodon custom app name'],
  ['libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts', "'@snaps.local'", 'organization fallback email domain'],
  ['libraries/nestjs-libraries/src/services/stripe.service.ts', '@snaps.local', 'Stripe fallback email domain'],
  ['apps/backend/src/api/routes/snaps.controller.ts', 'Imported connected post comments', 'post comment import activity label'],
  ['apps/backend/src/api/routes/auth.controller.ts', "'snaps://auth/callback'", 'mobile OAuth callback scheme'],
  ['apps/backend/src/api/routes/copilot.controller.ts', "mastra.getAgent('snaps')", 'Copilot memory agent lookup'],
  ['apps/frontend/src/components/agents/agent.chat.tsx', 'agent="snaps"', 'Copilot frontend agent id'],
  ['apps/frontend/src/components/snaps/snaps-workspace.tsx', '연결된 게시물 ID', 'connected post import placeholder'],
  ['apps/frontend/src/components/snaps/snaps-workspace.tsx', '미디어 라이브러리에 영상 URL 저장', 'media library copy'],
];

const policyChecks = [
  ['apps/frontend/src/app/(app)/privacy/page.tsx', "title: 'snaps 개인정보 처리방침'", 'privacy metadata'],
  ['apps/frontend/src/app/(app)/privacy/page.tsx', '로컬 Ollama', 'privacy AI processing'],
  ['apps/frontend/src/app/(app)/privacy/page.tsx', '분석 기록', 'privacy analytics records'],
  ['apps/frontend/src/app/(app)/terms/page.tsx', "title: 'snaps 이용약관'", 'terms metadata'],
  ['apps/frontend/src/app/(app)/terms/page.tsx', 'AI가 만든 초안', 'terms AI review responsibility'],
  ['apps/frontend/src/app/(app)/terms/page.tsx', '복사/내보내기 보조 방식', 'terms assist-only channels'],
  ['apps/frontend/src/app/(app)/terms/page.tsx', '게시 워크플로', 'terms publishing workflow'],
];

const koreanChannelChecks = [
  ['apps/frontend/public/icons/platforms/naver-cafe.svg', '#03C75A', 'Naver green icon'],
  ['apps/frontend/src/components/launches/launches.component.tsx', "integration.identifier === 'naver-cafe'", 'Naver Cafe icon branch'],
  ['apps/frontend/src/components/launches/launches.component.tsx', '/icons/platforms/naver-cafe.svg', 'Naver Cafe icon path'],
];

for (const file of requiredFiles) {
  read(file);
}
for (const [path, needle, label] of [
  ...routeChecks,
  ...navigationChecks,
  ...brandChecks,
  ...policyChecks,
  ...koreanChannelChecks,
]) {
  expectContains(path, needle, label);
}

for (const path of [
  'apps/frontend/src/app/(app)/layout.tsx',
  'apps/frontend/src/app/(provider)/layout.tsx',
  'apps/frontend/src/app/(extension)/layout.tsx',
]) {
  expectNotContains(path, 'next/font/google', 'remote Google font import');
  expectNotContains(path, 'fonts.googleapis.com', 'remote Google font URL');
}

for (const path of [
  'apps/frontend/src/app/(app)/privacy/page.tsx',
  'apps/frontend/src/app/(app)/terms/page.tsx',
]) {
  expectNotContains(path, 'Replace them', 'visible placeholder instruction');
  expectNotContains(path, 'Replace it', 'visible placeholder instruction');
  expectNotContains(path, 'before public launch', 'visible prelaunch caveat');
  expectNotContains(path, 'counsel-approved', 'visible legal placeholder');
}

expectNotContains(
  'apps/frontend/src/app/(app)/(preview)/p/[id]/page.tsx',
  '/postiz.svg',
  'legacy preview logo asset'
);
expectNotExists('apps/frontend/public/postiz.svg', 'legacy public logo asset');
expectNotExists('apps/frontend/public/postiz-text.svg', 'legacy public logo text asset');
expectNotExists('apps/frontend/public/postiz-fav.png', 'legacy public favicon asset');

for (const path of [
  'apps/frontend/src/components/webhooks/webhooks.tsx',
  'apps/frontend/src/components/snaps/snaps-workspace.tsx',
  'apps/extension/manifest.json',
  'apps/extension/manifest.dev.json',
  'apps/extension/package.json',
  'apps/extension/src/background.ts',
  'scripts/package-extension.mjs',
  'apps/backend/package.json',
  'apps/frontend/package.json',
  'apps/orchestrator/package.json',
  'apps/commands/package.json',
  'apps/commands/src/tasks/agent.run.ts',
  'apps/sdk/package.json',
  'apps/sdk/README.md',
  'apps/sdk/src/index.ts',
  'libraries/nestjs-libraries/src/crypto/nowpayments.ts',
  'libraries/nestjs-libraries/src/sentry/initialize.sentry.ts',
  'libraries/nestjs-libraries/src/database/prisma/agencies/agencies.service.ts',
  'libraries/nestjs-libraries/src/newsletter/providers/listmonk.provider.ts',
  'libraries/nestjs-libraries/src/chat/load.tools.service.ts',
  'libraries/nestjs-libraries/src/chat/mastra.service.ts',
  'libraries/nestjs-libraries/src/chat/mastra.store.ts',
  'libraries/nestjs-libraries/src/chat/start.mcp.ts',
  'libraries/nestjs-libraries/src/integrations/social/mastodon.custom.provider.ts',
  'libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts',
  'libraries/nestjs-libraries/src/services/stripe.service.ts',
  'apps/backend/src/api/routes/snaps.controller.ts',
  'apps/backend/src/api/routes/auth.controller.ts',
  'apps/backend/src/api/routes/copilot.controller.ts',
  'apps/frontend/src/components/agents/agent.chat.tsx',
]) {
  expectNotContains(path, 'Postiz', 'visible legacy product name');
  expectNotContains(path, 'postiz.com', 'legacy product URL');
  expectNotContains(path, 'nevo@postiz.com', 'legacy review inbox');
}

console.log(
  `verify-snaps-product-shell-ok files=${requiredFiles.length} route=${routeChecks.length} navigation=${navigationChecks.length} brand=${brandChecks.length} policy=${policyChecks.length} korean=${koreanChannelChecks.length}`
);
