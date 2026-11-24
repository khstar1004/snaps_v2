/**
 * Checks the contract between the snaps backend and the bundled Shorts-Maker
 * service. `external/` is excluded from jest and from every tsconfig, so none of
 * this is covered anywhere else.
 *
 * The integration rests on something unusual and worth guarding. Every
 * `/api/studio/*` route in Shorts-Maker starts with `requireSessionUser()` and
 * answers 401 without a session, and the snaps client sends no cookie, no
 * Authorization header and no API key. It works because the compose service
 * runs with `AUTH_LOCAL_BYPASS=true` and a non-production `NODE_ENV`, which
 * `lib/auth/local-bypass.ts` accepts. That is deliberate and documented.
 *
 * The safety of it rests on one more thing: the service publishes no host port,
 * so the bypassed admin API is reachable only from inside the docker network.
 * Adding a `ports:` mapping - the obvious thing to do when debugging it - turns
 * the bypass into an unauthenticated admin API on the host. Nothing enforced
 * that, so it is enforced here.
 */
import { readFileSync, existsSync } from 'node:fs';

function read(path) {
  if (!existsSync(path)) {
    throw new Error(`Missing Shorts-Maker contract file: ${path}`);
  }
  return readFileSync(path, 'utf8');
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const SM = 'external/Shorts-Maker';
const client = read(
  'libraries/nestjs-libraries/src/snaps/shorts-maker/shorts-maker-client.service.ts'
);

// 1. Route, verb and query parameter, on both sides.
const topicRoute = read(`${SM}/app/api/studio/topic-to-script/route.ts`);
const renderRoute = read(`${SM}/app/api/studio/render-jobs/route.ts`);

expect(
  /export async function POST\(/.test(topicRoute),
  `${SM} topic-to-script no longer exports a POST handler`
);
expect(
  client.includes('/api/studio/topic-to-script`'),
  'the snaps client no longer calls /api/studio/topic-to-script'
);

for (const verb of ['POST', 'GET']) {
  expect(
    new RegExp(`export async function ${verb}\\(`).test(renderRoute),
    `${SM} render-jobs no longer exports a ${verb} handler`
  );
}
expect(
  client.includes('/api/studio/render-jobs`'),
  'the snaps client no longer submits to /api/studio/render-jobs'
);
expect(
  client.includes('/api/studio/render-jobs?id=${encodeURIComponent(jobId)}`'),
  'the snaps client no longer reads a render job with ?id='
);
expect(
  renderRoute.includes('searchParams.get("id")'),
  `${SM} render-jobs reads a different query parameter than the id= the snaps ` +
    'client sends, so every status poll would answer 400'
);

// 2. The bypass the integration depends on still works the way the compose
//    service is configured for.
const bypass = read(`${SM}/lib/auth/local-bypass.ts`);
expect(
  bypass.includes('AUTH_LOCAL_BYPASS'),
  `${SM} local-bypass no longer reads AUTH_LOCAL_BYPASS; the snaps client sends ` +
    'no credentials, so every studio call would answer 401'
);
expect(
  bypass.includes('NODE_ENV !== "production"'),
  `${SM} local-bypass no longer refuses to run in production`
);

// 3. The compose service: bypass on, not production, and no published port.
const compose = read('docker-compose.yaml').replace(/\r\n/g, '\n');
const lines = compose.split('\n');
const start = lines.findIndex((line) => line.startsWith('  snaps-shorts-maker:'));
expect(start >= 0, 'docker-compose.yaml no longer defines snaps-shorts-maker');
let end = lines.length;
for (let index = start + 1; index < lines.length; index += 1) {
  if (/^ {2}[a-z]/.test(lines[index])) {
    end = index;
    break;
  }
}
const service = lines.slice(start, end);
const setting = (name) =>
  service.find((line) => new RegExp(`^\\s{6}${name}:`).test(line)) || '';

expect(
  /'true'/.test(setting('AUTH_LOCAL_BYPASS')),
  'docker-compose.yaml no longer sets AUTH_LOCAL_BYPASS=true on snaps-shorts-maker; ' +
    'the snaps backend sends no credentials and every studio call would answer 401'
);
const nodeEnv = setting('NODE_ENV');
expect(nodeEnv, 'docker-compose.yaml no longer pins NODE_ENV on snaps-shorts-maker');
expect(
  !/production/.test(nodeEnv),
  'docker-compose.yaml runs snaps-shorts-maker with NODE_ENV=production, which turns ' +
    'the auth bypass off; every snaps call to it would answer 401'
);
expect(
  !service.some((line) => /^ {4}ports:/.test(line)),
  'docker-compose.yaml publishes a host port for snaps-shorts-maker. That service ' +
    'runs with the auth bypass enabled, which is only safe while it is reachable ' +
    'from inside the docker network alone - a port mapping exposes an ' +
    'unauthenticated admin API on the host'
);

// The declared URL is pinned as a literal in verify-snaps-env.mjs, which keeps
// .env.example and docker-compose.yaml agreeing with each other but says
// nothing about whether the host in that URL is a real service or the port is
// one anything listens on. Renaming the compose service, or changing the port
// the container serves, leaves the pinned string intact and breaks the
// integration at run time.
const serviceNames = lines
  .filter((line) => /^ {2}[a-z][a-z0-9-]*:$/.test(line))
  .map((line) => line.trim().replace(':', ''));

function serviceBlock(name) {
  const start = lines.findIndex((line) => line === `  ${name}:`);
  if (start < 0) {
    return [];
  }
  let blockEnd = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^ {2}[a-z]/.test(lines[index])) {
      blockEnd = index;
      break;
    }
  }
  return lines.slice(start, blockEnd);
}

const urlMatch = compose.match(/SHORTS_MAKER_URL: '([^']+)'/);
expect(urlMatch, 'docker-compose.yaml no longer sets SHORTS_MAKER_URL');
const url = new URL(urlMatch[1]);
expect(
  serviceNames.includes(url.hostname),
  `SHORTS_MAKER_URL points at "${url.hostname}", which is not a service in ` +
    `docker-compose.yaml (${serviceNames.join(', ')})`
);
const block = serviceBlock(url.hostname);
expect(
  block.some((line) => line.includes(`container_name: ${url.hostname}`)),
  `the ${url.hostname} service no longer sets container_name to the host ` +
    'SHORTS_MAKER_URL resolves by'
);
const dockerfile = read(`${SM}/Dockerfile`);
expect(
  dockerfile.includes(`EXPOSE ${url.port}`) &&
    dockerfile.includes(`"-p", "${url.port}"`),
  `${SM}/Dockerfile does not serve port ${url.port}, which SHORTS_MAKER_URL ` +
    'points at; the backend would get connection refused'
);

console.log(
  `verify-snaps-shorts-maker-contract-ok routes=2 verbs=3 bypassGuards=3 publishedPorts=0 url=${url.host}`
);
