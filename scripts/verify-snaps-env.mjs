import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

function fail(message) {
  throw new Error(message);
}

function parseDotEnv(content) {
  const values = new Map();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*?)(?:\s+#.*)?$/);
    if (!match) {
      continue;
    }
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }
  return values;
}

function yamlValue(content, key) {
  const pattern = new RegExp(`^\\s*${key}:\\s*['"]?([^'"]+?)['"]?\\s*$`, 'm');
  return content.match(pattern)?.[1]?.trim();
}

function required(value, label) {
  if (!value) {
    fail(`${label} is missing`);
  }
  return value;
}

function declared(values, key, label) {
  if (!values.has(key)) {
    fail(`${label} is missing`);
  }
}

function expectContains(content, needle, label = needle) {
  if (!content.includes(needle)) {
    fail(`${label} is missing`);
  }
}

function parseDatabaseUrl(value, label) {
  const parsed = new URL(value);
  if (parsed.protocol !== 'postgresql:') {
    fail(`${label} must use postgresql://`);
  }
  return {
    host: parsed.hostname,
    port: parsed.port,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
  };
}

function parseHttpUrl(value, label) {
  const parsed = new URL(value);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    fail(`${label} must use http:// or https://`);
  }
  return parsed;
}

function parseRedisUrl(value, label) {
  const parsed = new URL(value);
  if (parsed.protocol !== 'redis:') {
    fail(`${label} must use redis://`);
  }
  return {
    host: parsed.hostname,
    port: parsed.port || '6379',
  };
}

function parseHostPort(value, label) {
  const match = String(value || '').match(/^([^:]+):(\d+)$/);
  if (!match) {
    fail(`${label} must use host:port`);
  }
  return {
    host: match[1],
    port: match[2],
  };
}

const env = parseDotEnv(read('.env.example'));
const composeDev = read('docker-compose.dev.yaml');
const compose = read('docker-compose.yaml');

const envDb = parseDatabaseUrl(
  required(env.get('DATABASE_URL'), '.env.example DATABASE_URL'),
  '.env.example DATABASE_URL'
);
const devUser = required(
  yamlValue(composeDev, 'POSTGRES_USER'),
  'docker-compose.dev.yaml POSTGRES_USER'
);
const devPassword = required(
  yamlValue(composeDev, 'POSTGRES_PASSWORD'),
  'docker-compose.dev.yaml POSTGRES_PASSWORD'
);
const devDatabase = required(
  yamlValue(composeDev, 'POSTGRES_DB'),
  'docker-compose.dev.yaml POSTGRES_DB'
);

if (envDb.host !== 'localhost' || envDb.port !== '5432') {
  fail('.env.example DATABASE_URL must point to localhost:5432 for dev:docker');
}
if (
  envDb.user !== devUser ||
  envDb.password !== devPassword ||
  envDb.database !== devDatabase
) {
  fail('.env.example DATABASE_URL does not match docker-compose.dev.yaml Postgres credentials');
}

const envRedis = parseRedisUrl(
  required(env.get('REDIS_URL'), '.env.example REDIS_URL'),
  '.env.example REDIS_URL'
);
if (envRedis.host !== 'localhost' || envRedis.port !== '6379') {
  fail('.env.example REDIS_URL must point to localhost:6379 for dev:docker');
}
const envTemporal = parseHostPort(
  required(env.get('TEMPORAL_ADDRESS'), '.env.example TEMPORAL_ADDRESS'),
  '.env.example TEMPORAL_ADDRESS'
);
if (envTemporal.host !== 'localhost' || envTemporal.port !== '7233') {
  fail('.env.example TEMPORAL_ADDRESS must point to localhost:7233 for dev:docker');
}

const composeDb = parseDatabaseUrl(
  required(yamlValue(compose, 'DATABASE_URL'), 'docker-compose.yaml DATABASE_URL'),
  'docker-compose.yaml DATABASE_URL'
);
if (composeDb.host !== 'snaps-postgres' || composeDb.port !== '5432') {
  fail('docker-compose.yaml DATABASE_URL must use snaps-postgres:5432 inside Docker');
}
if (
  composeDb.user !== devUser ||
  composeDb.password !== devPassword ||
  composeDb.database !== devDatabase
) {
  fail('docker-compose.yaml DATABASE_URL does not match snaps Postgres service credentials');
}
const composeRedis = parseRedisUrl(
  required(yamlValue(compose, 'REDIS_URL'), 'docker-compose.yaml REDIS_URL'),
  'docker-compose.yaml REDIS_URL'
);
if (composeRedis.host !== 'snaps-redis' || composeRedis.port !== '6379') {
  fail('docker-compose.yaml REDIS_URL must use snaps-redis:6379 inside Docker');
}
const composeTemporal = parseHostPort(
  required(yamlValue(compose, 'TEMPORAL_ADDRESS'), 'docker-compose.yaml TEMPORAL_ADDRESS'),
  'docker-compose.yaml TEMPORAL_ADDRESS'
);
if (composeTemporal.host !== 'temporal' || composeTemporal.port !== '7233') {
  fail('docker-compose.yaml TEMPORAL_ADDRESS must use temporal:7233 inside Docker');
}
if (!composeDev.includes('- 6379:6379')) {
  fail('docker-compose.dev.yaml must publish Redis on localhost:6379');
}
if (!composeDev.includes('- "7233:7233"')) {
  fail('docker-compose.dev.yaml must publish Temporal on localhost:7233');
}

const envChatModel = required(env.get('OLLAMA_CHAT_MODEL'), '.env.example OLLAMA_CHAT_MODEL');
const envEmbedModel = required(env.get('OLLAMA_EMBED_MODEL'), '.env.example OLLAMA_EMBED_MODEL');
const composeChatModel = required(
  yamlValue(compose, 'OLLAMA_CHAT_MODEL'),
  'docker-compose.yaml OLLAMA_CHAT_MODEL'
);
const composeEmbedModel = required(
  yamlValue(compose, 'OLLAMA_EMBED_MODEL'),
  'docker-compose.yaml OLLAMA_EMBED_MODEL'
);

if (envChatModel !== composeChatModel || envEmbedModel !== composeEmbedModel) {
  fail('Ollama model names differ between .env.example and docker-compose.yaml');
}
if (env.get('OLLAMA_DISABLE_THINKING') !== 'true') {
  fail('.env.example must keep OLLAMA_DISABLE_THINKING=true for Qwen JSON output');
}
if (yamlValue(compose, 'OLLAMA_DISABLE_THINKING') !== 'true') {
  fail('docker-compose.yaml must keep OLLAMA_DISABLE_THINKING=true for Qwen JSON output');
}
if (env.get('SNAPS_DATA_DIR') !== './var/snaps') {
  fail('.env.example SNAPS_DATA_DIR should keep local JSON data under ./var/snaps');
}
if (yamlValue(compose, 'SNAPS_DATA_DIR') !== '/config/snaps') {
  fail('docker-compose.yaml SNAPS_DATA_DIR should persist snaps data under /config/snaps');
}
if (env.get('SNAPS_GENERIC_OAUTH') !== 'false') {
  fail('.env.example SNAPS_GENERIC_OAUTH should default to false');
}
if (env.get('NEXT_PUBLIC_SNAPS_OAUTH_DISPLAY_NAME') !== 'snaps') {
  fail('.env.example NEXT_PUBLIC_SNAPS_OAUTH_DISPLAY_NAME should default to snaps');
}
declared(env, 'NEXT_PUBLIC_SNAPS_OAUTH_LOGO_URL', '.env.example NEXT_PUBLIC_SNAPS_OAUTH_LOGO_URL');
declared(env, 'POSTIZ_GENERIC_OAUTH', '.env.example POSTIZ_GENERIC_OAUTH legacy alias');
declared(env, 'NEXT_PUBLIC_POSTIZ_OAUTH_DISPLAY_NAME', '.env.example NEXT_PUBLIC_POSTIZ_OAUTH_DISPLAY_NAME legacy alias');
declared(env, 'NEXT_PUBLIC_POSTIZ_OAUTH_LOGO_URL', '.env.example NEXT_PUBLIC_POSTIZ_OAUTH_LOGO_URL legacy alias');

declared(env, 'NAVER_CLIENT_ID', '.env.example NAVER_CLIENT_ID');
declared(env, 'NAVER_CLIENT_SECRET', '.env.example NAVER_CLIENT_SECRET');
for (const needle of [
  '# PIXELLE_VIDEO_URL=',
  '# SNAPS_PIXELLE_CONFIRM=',
  '# SNAPS_PIXELLE_SMOKE_ID=',
  '# SNAPS_INBOX_CLEAR_CONFIRM=',
  '# NAVER_CAFE_ACCESS_TOKEN=',
  '# NAVER_CAFE_CLUB_ID=',
  '# NAVER_CAFE_MENU_ID=',
  '# SNAPS_NAVER_CAFE_CONFIRM=',
  '# SNAPS_NAVER_CAFE_SMOKE_ID=',
  '#SNAPS_AGENCY_REVIEW_EMAIL=',
]) {
  expectContains(read('.env.example'), needle, `.env.example ${needle}`);
}
for (const needle of [
  "PIXELLE_VIDEO_URL: ''",
  "NAVER_CLIENT_ID: ''",
  "NAVER_CLIENT_SECRET: ''",
]) {
  expectContains(compose, needle, `docker-compose.yaml ${needle}`);
}

const localFrontendUrl = parseHttpUrl(
  required(env.get('FRONTEND_URL'), '.env.example FRONTEND_URL'),
  '.env.example FRONTEND_URL'
);
const localPublicBackendUrl = parseHttpUrl(
  required(env.get('NEXT_PUBLIC_BACKEND_URL'), '.env.example NEXT_PUBLIC_BACKEND_URL'),
  '.env.example NEXT_PUBLIC_BACKEND_URL'
);
const localInternalBackendUrl = parseHttpUrl(
  required(env.get('BACKEND_INTERNAL_URL'), '.env.example BACKEND_INTERNAL_URL'),
  '.env.example BACKEND_INTERNAL_URL'
);
if (localFrontendUrl.host !== 'localhost:4200') {
  fail('.env.example FRONTEND_URL must point to the local Next.js dev port localhost:4200');
}
if (
  localPublicBackendUrl.host !== 'localhost:3000' ||
  localInternalBackendUrl.host !== 'localhost:3000'
) {
  fail('.env.example backend URLs must point to the local backend dev port localhost:3000');
}

const composeMainUrl = parseHttpUrl(
  required(yamlValue(compose, 'MAIN_URL'), 'docker-compose.yaml MAIN_URL'),
  'docker-compose.yaml MAIN_URL'
);
const composeFrontendUrl = parseHttpUrl(
  required(yamlValue(compose, 'FRONTEND_URL'), 'docker-compose.yaml FRONTEND_URL'),
  'docker-compose.yaml FRONTEND_URL'
);
const composePublicBackendUrl = parseHttpUrl(
  required(yamlValue(compose, 'NEXT_PUBLIC_BACKEND_URL'), 'docker-compose.yaml NEXT_PUBLIC_BACKEND_URL'),
  'docker-compose.yaml NEXT_PUBLIC_BACKEND_URL'
);
const composeInternalBackendUrl = parseHttpUrl(
  required(yamlValue(compose, 'BACKEND_INTERNAL_URL'), 'docker-compose.yaml BACKEND_INTERNAL_URL'),
  'docker-compose.yaml BACKEND_INTERNAL_URL'
);
if (
  composeMainUrl.host !== 'localhost:4007' ||
  composeFrontendUrl.host !== 'localhost:4007' ||
  composePublicBackendUrl.href !== 'http://localhost:4007/api'
) {
  fail('docker-compose.yaml public app URLs must target the published all-in-one port localhost:4007');
}
if (composeInternalBackendUrl.href !== 'http://localhost:3000/') {
  fail('docker-compose.yaml BACKEND_INTERNAL_URL must stay on the internal backend port localhost:3000');
}
if (!compose.includes('- "4007:5000"')) {
  fail('docker-compose.yaml must publish the all-in-one snaps app as 4007:5000');
}

console.log(
  `verify-snaps-env-ok db=${envDb.user}@${envDb.host}:${envDb.port}/${envDb.database} models=${envChatModel},${envEmbedModel} local=${localFrontendUrl.host}/${localPublicBackendUrl.host} docker=${composeFrontendUrl.host}`
);
