/**
 * Checks the contract between the snaps backend and the bundled Pixelle-Video
 * service, which nothing else covers.
 *
 * `external/` is excluded from jest and from every tsconfig, so the ~24 modified
 * Python files under Pixelle-Video have no automated check at all: a break there
 * surfaces only when the Pixelle service runs, which is an open runtime gate.
 *
 * The specific hazard is the router prefix. In `api/app.py` nine routers are
 * mounted with `prefix=api_config.api_prefix` and two - health and snaps - are
 * mounted bare, which is what puts `/generate`, `/status/{job_id}`,
 * `/snaps/runtime` and `/health` at the paths the TypeScript client builds.
 * Adding a prefix to the snaps router for consistency with its nine siblings is
 * a natural edit that would move all three routes and answer 404 to every snaps
 * video request.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

function read(path) {
  if (!existsSync(path)) {
    throw new Error(`Missing Pixelle contract file: ${path}`);
  }
  return readFileSync(path, 'utf8');
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const PIXELLE = 'external/Pixelle-Video';
const app = read(`${PIXELLE}/api/app.py`);
const snapsRouter = read(`${PIXELLE}/api/routers/snaps.py`);
const healthRouter = read(`${PIXELLE}/api/routers/health.py`);
const shortVideo = read(
  'libraries/nestjs-libraries/src/snaps/video/short-video.service.ts'
);
const controller = read('apps/backend/src/api/routes/snaps.controller.ts');

// 1. The two routers the snaps integration depends on are mounted bare.
for (const router of ['snaps_router', 'health_router']) {
  const line = app
    .split(/\r?\n/)
    .find((candidate) => candidate.includes(`include_router(${router}`));
  expect(line, `${PIXELLE}/api/app.py no longer mounts ${router}`);
  expect(
    !line.includes('prefix'),
    `${PIXELLE}/api/app.py mounts ${router} with a prefix; every snaps video ` +
      'route would move and the backend would get 404s it can only see at run time'
  );
}

// 2. The Python side declares each path the backend builds, and the backend
//    still builds it. Both halves, so neither can drift alone.
const routes = [
  {
    python: '@router.post("/generate")',
    source: snapsRouter,
    client: "'')}/generate`",
    clientSource: shortVideo,
    label: 'POST /generate',
  },
  {
    python: '@router.get("/status/{job_id}")',
    source: snapsRouter,
    client: "'')}/status/${encodeURIComponent(jobId)}`",
    clientSource: shortVideo,
    label: 'GET /status/{job_id}',
  },
  {
    python: '@router.get("/snaps/runtime")',
    source: snapsRouter,
    client: '${baseUrl}/snaps/runtime`',
    clientSource: controller,
    label: 'GET /snaps/runtime',
  },
  {
    python: '@router.get("/health"',
    source: healthRouter,
    client: '${baseUrl}/health`',
    clientSource: controller,
    label: 'GET /health',
  },
];

for (const route of routes) {
  expect(
    route.source.includes(route.python),
    `${PIXELLE} no longer serves ${route.label}, which the snaps backend calls`
  );
  expect(
    route.clientSource.includes(route.client),
    `the snaps backend no longer calls ${route.label}; the Pixelle route is ` +
      'still there, so one side has moved without the other'
  );
}

// 3. The URL the backend is pointed at has to resolve to this service.
//    verify-snaps-env.mjs pins the literal string in .env.example and
//    docker-compose.yaml against each other, which stays green when the compose
//    service is renamed or the container is told to serve a different port -
//    both of which break the integration with a connection error at run time.
const compose = read('docker-compose.yaml').replace(/\r\n/g, '\n');
const composeLines = compose.split('\n');
const serviceNames = composeLines
  .filter((line) => /^ {2}[a-z][a-z0-9-]*:$/.test(line))
  .map((line) => line.trim().replace(':', ''));

const urlMatch = compose.match(/PIXELLE_VIDEO_URL: '([^']+)'/);
expect(urlMatch, 'docker-compose.yaml no longer sets PIXELLE_VIDEO_URL');
const url = new URL(urlMatch[1]);
expect(
  serviceNames.includes(url.hostname),
  `PIXELLE_VIDEO_URL points at "${url.hostname}", which is not a service in ` +
    `docker-compose.yaml (${serviceNames.join(', ')})`
);

const start = composeLines.findIndex((line) => line === `  ${url.hostname}:`);
let end = composeLines.length;
for (let index = start + 1; index < composeLines.length; index += 1) {
  if (/^ {2}[a-z]/.test(composeLines[index])) {
    end = index;
    break;
  }
}
const service = composeLines.slice(start, end);
expect(
  service.some((line) => line.includes(`container_name: ${url.hostname}`)),
  `the ${url.hostname} service no longer sets container_name to the host ` +
    'PIXELLE_VIDEO_URL resolves by'
);
const command = service.find((line) => /^ {4}command:/.test(line)) || '';
expect(
  command.includes(`--port ${url.port}`),
  `the ${url.hostname} service is not started with --port ${url.port}, which ` +
    'PIXELLE_VIDEO_URL points at; the backend would get connection refused'
);

// 4. Syntax. Nothing else compiles this Python, so a broken file would ship.
//    Skipped rather than failed when no interpreter is available - the same
//    stance verify-snaps-dev-images takes when Docker cannot be queried.
function pythonFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    if (['.venv', '__pycache__', 'node_modules', '.git', 'output'].includes(entry)) {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...pythonFiles(full));
    } else if (entry.endsWith('.py')) {
      found.push(full);
    }
  }
  return found;
}

let compiled = 'skipped';
for (const interpreter of ['python', 'python3']) {
  try {
    const files = pythonFiles(PIXELLE);
    execFileSync(interpreter, ['-m', 'py_compile', ...files], { stdio: 'pipe' });
    compiled = String(files.length);
    break;
  } catch (error) {
    const message = String(error.stderr || error.message || '');
    // A missing interpreter is not a contract failure; a compile error is.
    if (message.includes('SyntaxError') || message.includes('Error compiling')) {
      throw new Error(
        `${PIXELLE} has a Python file that does not compile: ` +
          message.split(/\r?\n/).filter(Boolean).slice(-3).join(' | ')
      );
    }
  }
}

console.log(
  `verify-snaps-pixelle-contract-ok routes=${routes.length} bareRouters=2 url=${url.host} pythonCompiled=${compiled}`
);
