import { existsSync, readFileSync, statSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

function fail(message) {
  throw new Error(message);
}

function expectContains(content, needle, label = needle) {
  if (!content.includes(needle)) {
    fail(`Missing ${label}`);
  }
}

function expectFile(path) {
  if (!existsSync(path)) {
    fail(`Missing file ${path}`);
  }
  const stat = statSync(path);
  if (!stat.isFile() || stat.size <= 0) {
    fail(`${path} must be a non-empty file`);
  }
}

const provider = read('libraries/nestjs-libraries/src/integrations/social/naver-cafe.provider.ts');
const dto = read('libraries/nestjs-libraries/src/dtos/posts/providers-settings/naver-cafe.dto.ts');
const allProviders = read('libraries/nestjs-libraries/src/dtos/posts/providers-settings/all.providers.settings.ts');
const manager = read('libraries/nestjs-libraries/src/integrations/integration.manager.ts');
const frontendProvider = read('apps/frontend/src/components/new-launch/providers/naver-cafe/naver-cafe.provider.tsx');
const showAllProviders = read('apps/frontend/src/components/new-launch/providers/show.all.providers.tsx');
const highOrderProvider = read('apps/frontend/src/components/new-launch/providers/high.order.provider.tsx');
const scheduleBuilder = read('libraries/nestjs-libraries/src/snaps/schedule/publishing-payload.builder.ts');
const serviceSmoke = read('scripts/verify-snaps-services.ts');
const liveSmoke = read('scripts/verify-snaps-naver-cafe.ts');

expectFile('apps/frontend/public/icons/platforms/naver-cafe.svg');

expectContains(provider, "identifier = 'naver-cafe'", 'Naver Cafe provider identifier');
expectContains(provider, "name = 'Naver Cafe'", 'Naver Cafe provider display name');
expectContains(provider, "editor = 'html' as const", 'Naver Cafe HTML editor');
expectContains(provider, 'dto = NaverCafeDto', 'Naver Cafe provider DTO');
expectContains(provider, "scopes = ['profile', 'cafe']", 'Naver Cafe OAuth scope');
expectContains(provider, '/integrations/social/naver-cafe', 'Naver Cafe redirect route');
expectContains(provider, 'https://nid.naver.com/oauth2.0/authorize', 'Naver auth URL');
expectContains(provider, 'https://openapi.naver.com/v1/cafe/', 'Naver Cafe article API');
expectContains(provider, 'encodeURIComponent(', 'Naver Cafe URL encoding');
expectContains(provider, 'settings.clubId', 'encoded clubId');
expectContains(provider, 'settings.menuId', 'encoded menuId');
expectContains(provider, 'override handleErrors', 'Naver Cafe refresh-token error handling');
expectContains(provider, 'Naver Cafe post did not return article information', 'empty post response guard');
expectContains(liveSmoke, 'SNAPS_NAVER_CAFE_CONFIRM', 'Naver Cafe live smoke confirmation gate');
expectContains(liveSmoke, 'NAVER_CAFE_ACCESS_TOKEN', 'Naver Cafe live smoke access token');
expectContains(liveSmoke, 'verify-snaps-naver-cafe-dry-run-ok', 'Naver Cafe live smoke dry-run');
expectContains(liveSmoke, 'verify-snaps-naver-cafe-ok', 'Naver Cafe live smoke success marker');

for (const field of ['clubId', 'menuId', 'subject']) {
  expectContains(dto, `${field}: string`, `NaverCafeDto ${field}`);
}
expectContains(dto, 'category?: string', 'NaverCafeDto optional category');
expectContains(dto, '@MinLength(2)', 'NaverCafeDto subject length guard');

expectContains(allProviders, "ProviderExtension<'naver-cafe', NaverCafeDto>", 'Naver Cafe provider extension');
expectContains(allProviders, "{ value: NaverCafeDto, name: 'naver-cafe' }", 'Naver Cafe discriminator');
expectContains(manager, "import { NaverCafeProvider }", 'Naver Cafe manager import');
expectContains(manager, 'new NaverCafeProvider()', 'Naver Cafe manager registration');

expectContains(showAllProviders, 'NaverCafeProvider', 'Naver Cafe frontend provider import');
expectContains(showAllProviders, "identifier: 'naver-cafe'", 'Naver Cafe frontend provider identifier');
expectContains(frontendProvider, 'NaverCafeDto', 'Naver Cafe frontend DTO binding');
expectContains(frontendProvider, 'Cafe ID', 'Naver Cafe club field label');
expectContains(frontendProvider, 'Menu ID', 'Naver Cafe menu field label');
expectContains(frontendProvider, 'Category (optional)', 'Naver Cafe category field label');
expectContains(frontendProvider, 'maximumCharacters: 10000', 'Naver Cafe frontend max length');
expectContains(highOrderProvider, "identifier ===\n                        'naver-cafe'", 'Naver Cafe SVG icon branch');
expectContains(highOrderProvider, '/icons/platforms/naver-cafe.svg', 'Naver Cafe SVG icon path');

expectContains(scheduleBuilder, "platform !== 'naver-cafe'", 'Naver Cafe special scheduling branch');
expectContains(scheduleBuilder, 'Naver Cafe scheduling requires clubId and menuId settings', 'Naver Cafe missing settings warning');
expectContains(scheduleBuilder, "__type: 'naver-cafe'", 'Naver Cafe schedule __type');
expectContains(scheduleBuilder, "subject: subject.length >= 2 ? subject : 'snaps 게시글'", 'Naver Cafe subject fallback');

for (const smoke of [
  'verifyNaverCafeProvider',
  'Naver Cafe auth URL did not include',
  'Naver Cafe refresh response did not preserve fallback refresh token',
  'Naver Cafe schedule payload settings were not preserved',
  'Naver Cafe schedule payload did not derive a subject',
  'Naver Cafe schedule payload should warn when cafe settings are missing',
]) {
  expectContains(serviceSmoke, smoke, `service smoke ${smoke}`);
}

console.log('verify-snaps-provider-contract-ok provider=naver-cafe surfaces=backend,dto,manager,frontend,schedule,smoke,live');
