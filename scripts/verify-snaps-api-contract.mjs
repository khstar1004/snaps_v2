import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

function normalizePath(path) {
  const [withoutQuery] = path.split('?');
  const normalized = withoutQuery.replace(/\/+/g, '/').replace(/\/$/, '');
  return normalized || '/';
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function routeToRegex(path) {
  const pattern = normalizePath(path)
    .split('/')
    .map((part) => {
      if (!part) {
        return '';
      }
      return part.startsWith(':') ? '[^/?#]+' : escapeRegExp(part);
    })
    .join('/');
  return new RegExp(`^${pattern}$`);
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

function extractReadmeRoutes(readme) {
  const routes = [];
  const routeRegex = /^- `([A-Z]+) (\/snaps[^`]+)`$/gm;
  let match;
  while ((match = routeRegex.exec(readme))) {
    routes.push({
      method: match[1],
      path: normalizePath(match[2]),
    });
  }
  return routes;
}

function extractFrontendPaths(frontend) {
  const paths = new Set();
  const literalRegex = /[`'"]((?:\/snaps\/|\/snaps$)[^`'"]*)[`'"]/g;
  let match;
  while ((match = literalRegex.exec(frontend))) {
    const path = normalizePath(match[1].replace(/\$\{[^}]+\}/g, ':dynamic'));
    paths.add(path);
  }
  return [...paths];
}

function keyOf(route) {
  return `${route.method} ${route.path}`;
}

const controller = read('apps/backend/src/api/routes/snaps.controller.ts');
const readme = read('README.md');
const frontend = read('apps/frontend/src/components/snaps/snaps-workspace.tsx');

if (!controller.includes("@Controller(['/snaps', '/api/snaps'])")) {
  throw new Error('snaps controller must keep both /snaps and /api/snaps aliases');
}

const controllerRoutes = extractControllerRoutes(controller);
const readmeRoutes = extractReadmeRoutes(readme);
const frontendPaths = extractFrontendPaths(frontend);

if (!controllerRoutes.length) {
  throw new Error('No snaps controller routes were discovered');
}

const controllerKeys = new Set(controllerRoutes.map(keyOf));
const readmeKeys = new Set(readmeRoutes.map(keyOf));

const undocumented = [...controllerKeys].filter((key) => !readmeKeys.has(key));
if (undocumented.length) {
  throw new Error(`README snaps API list is missing: ${undocumented.join(', ')}`);
}

const staleDocs = [...readmeKeys].filter((key) => !controllerKeys.has(key));
if (staleDocs.length) {
  throw new Error(`README snaps API list has no controller route: ${staleDocs.join(', ')}`);
}

const controllerPathMatchers = controllerRoutes.map((route) => ({
  path: route.path,
  regex: routeToRegex(route.path),
}));
const unhandledFrontendPaths = frontendPaths.filter(
  (path) => !controllerPathMatchers.some((route) => route.regex.test(path))
);
if (unhandledFrontendPaths.length) {
  throw new Error(
    `snaps workspace calls routes not exposed by SnapsController: ${unhandledFrontendPaths.join(', ')}`
  );
}

console.log(
  `verify-snaps-api-contract-ok controller=${controllerRoutes.length} readme=${readmeRoutes.length} frontend=${frontendPaths.length}`
);
