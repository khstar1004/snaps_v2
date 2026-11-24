import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRelativePath = "docs/developer-map.json";
const outputPath = path.join(projectRoot, outputRelativePath);
const environmentOutputRelativePath = "docs/environment-map.json";
const environmentOutputPath = path.join(projectRoot, environmentOutputRelativePath);

const DIRECTORY_SUMMARY = [
  { path: "app", purpose: "App Router pages, route handlers, and route-local helpers/tests" },
  { path: "components", purpose: "Shared UI blocks reused across pages" },
  { path: "lib", purpose: "Domain logic, server helpers, API clients, and orchestration" },
  { path: "scripts", purpose: "Developer tooling, smoke tests, and doc refresh utilities" },
  { path: "docs", purpose: "Living guides, generated maps, and reference data" },
  { path: "types", purpose: "Cross-domain shared TypeScript types" },
  { path: "remotion", purpose: "Remotion composition entrypoints" },
  { path: "public", purpose: "Bundled media assets used by studio/render smoke flows" },
];

const DOMAIN_SUMMARY = [
  {
    id: "auth",
    description: "Login, session cookies, bootstrap admin provisioning, workspace switching, and OAuth bridges.",
    paths: ["app/login", "app/api/auth", "lib/auth"],
    entryFiles: [
      "app/api/auth/login/route.ts",
      "lib/auth/bootstrap.ts",
      "lib/auth/session.ts",
      "app/login/page.tsx",
    ],
    relatedDocs: ["docs/CODEX_GUIDE.md", "docs/OPERATIONS.md"],
  },
  {
    id: "studio",
    description: "Main creation flow: topic/script generation, script-to-json, slide prep, media selection, render, and publish handoff.",
    paths: ["app/shorts-json-studio", "app/api/studio", "lib/studio"],
    entryFiles: [
      "app/shorts-json-studio/page.tsx",
      "app/api/studio/bootstrap/route.ts",
      "app/api/studio/prepare/route.ts",
      "app/api/studio/render-native/route.ts",
      "lib/studio/codex-script.ts",
    ],
    relatedDocs: ["docs/CODEX_GUIDE.md", "docs/OPERATIONS.md"],
  },
  {
    id: "layout-studio",
    description: "Advanced template/layout editor for slot geometry, inspector panels, presets, and workbench interactions.",
    paths: ["app/layout-studio"],
    entryFiles: [
      "app/layout-studio/page.tsx",
      "app/layout-studio/layout-studio-helpers.ts",
      "app/layout-studio/layout-studio-inspector.ts",
      "app/layout-studio/layout-studio-workbench.ts",
    ],
    relatedDocs: ["docs/CODEX_GUIDE.md"],
  },
  {
    id: "publish",
    description: "Category metadata, channel mapping, publish jobs, scheduling, analytics, and YouTube upload flows.",
    paths: ["app/publish", "app/api/publish", "lib/publish"],
    entryFiles: [
      "app/publish/page.tsx",
      "app/api/publish/execute/route.ts",
      "lib/publish/publish-store.ts",
      "lib/publish/scheduler.ts",
      "lib/publish/submit-flow.ts",
    ],
    relatedDocs: ["docs/CODEX_GUIDE.md", "docs/OPERATIONS.md"],
  },
  {
    id: "assets",
    description: "Asset browsing, deletion/download, library snapshots, local audio, and studio resume entrypoints.",
    paths: ["app/assets", "app/api/assets", "lib/assets"],
    entryFiles: [
      "app/assets/page.tsx",
      "app/api/assets/latest/route.ts",
      "components/assets-explorer-panel.tsx",
      "lib/assets/use-assets-browser-state.ts",
    ],
    relatedDocs: ["docs/CODEX_GUIDE.md", "docs/OPERATIONS.md"],
  },
  {
    id: "settings-admin",
    description: "Workspace settings, TTS configuration, category/channel management, history restore, and admin operations.",
    paths: ["app/settings", "app/channel-categories", "app/admin", "app/api/admin"],
    entryFiles: [
      "app/settings/page.tsx",
      "app/settings/history/page.tsx",
      "app/admin/overview/page.tsx",
      "app/admin/users/page.tsx",
      "app/api/admin/users/route.ts",
    ],
    relatedDocs: ["docs/CODEX_GUIDE.md", "docs/OPERATIONS.md"],
  },
  {
    id: "telemetry",
    description: "Client/server workflow telemetry, alignment summaries, hybrid renderer summaries, and rollout monitoring.",
    paths: ["app/api/telemetry", "lib/telemetry"],
    entryFiles: [
      "app/api/telemetry/event/route.ts",
      "lib/telemetry/client.ts",
      "lib/telemetry/schema.ts",
      "lib/telemetry/use-preflight-tracking.ts",
    ],
    relatedDocs: ["docs/OPERATIONS.md"],
  },
];

const HOTSPOTS = [
  {
    path: "app/layout-studio/page.tsx",
    reason: "Still the main advanced layout editor entrypoint even after helper/module extraction.",
  },
  {
    path: "lib/studio/image-provider-resolver.ts",
    reason: "Image provider orchestration remains a large decision-heavy module.",
  },
  {
    path: "lib/studio/codex-script-core.ts",
    reason: "Core transport/retry orchestration for Codex-powered studio flows.",
  },
  {
    path: "lib/studio/codex-script-to-json.ts",
    reason: "Prompting, parsing, validation, and repair logic for script-to-json.",
  },
  {
    path: "lib/publish/publish-store.ts",
    reason: "Publish domain entrypoint that still re-exports/orchestrates multiple services.",
  },
];

const PRIMARY_DOCS = [
  { path: "README.md", role: "repo entrypoint" },
  { path: "docs/CODEX_GUIDE.md", role: "codex-first repo map and task routing" },
  { path: "docs/OPERATIONS.md", role: "runtime, env, release, QA, and telemetry guide" },
  { path: outputRelativePath, role: "machine-readable codebase map" },
  { path: environmentOutputRelativePath, role: "machine-readable environment inventory" },
  { path: "docs/README.md", role: "docs taxonomy and navigation" },
];

const LIVING_DOCS = [{ path: "docs/BGM_SETUP.md", role: "fixed BGM asset placement note" }];

const DATA_DOCS = [
  { path: "docs/revenue-ratecard.yaml", role: "pricing and billing reference data" },
];

const HISTORICAL_DOCS = [];

const IGNORED_ENV_NAMES = new Set([
  "APPDATA",
  "COMPUTERNAME",
  "HOME",
  "PATH",
  "USER",
  "USERNAME",
  "USERPROFILE",
]);

const ENVIRONMENT_GROUPS = [
  {
    id: "app-and-public",
    description: "App base URL and public client/runtime flags exposed to the browser build.",
    relatedDocs: ["README.md", "docs/OPERATIONS.md"],
    match: (name) => name === "APP_BASE_URL" || name === "NODE_ENV" || name === "VERCEL" || name.startsWith("NEXT_PUBLIC_"),
  },
  {
    id: "auth",
    description: "Session auth, bootstrap admin, local bypass, and login rate-limit settings.",
    relatedDocs: ["docs/CODEX_GUIDE.md", "docs/OPERATIONS.md"],
    match: (name) => name.startsWith("AUTH_") || name.startsWith("LOCAL_AUTH_"),
  },
  {
    id: "codex",
    description: "Codex OAuth, local bridge, CLI discovery, and model defaults.",
    relatedDocs: ["docs/CODEX_GUIDE.md", "docs/OPERATIONS.md"],
    match: (name) => name.startsWith("CODEX_") || name === "XDG_CONFIG_HOME",
  },
  {
    id: "supabase",
    description: "Supabase URLs, keys, buckets, and media library storage settings.",
    relatedDocs: ["README.md", "docs/OPERATIONS.md"],
    match: (name) => name.startsWith("SUPABASE_"),
  },
  {
    id: "google-youtube",
    description: "Google sign-in and YouTube upload OAuth configuration.",
    relatedDocs: ["docs/OPERATIONS.md"],
    match: (name) => name.startsWith("GOOGLE_") || name.startsWith("AUTH_GOOGLE_"),
  },
  {
    id: "publish-scheduler",
    description: "Publish execution auth and QStash scheduling settings.",
    relatedDocs: ["docs/OPERATIONS.md"],
    match: (name) => name.startsWith("PUBLISH_") || name.startsWith("QSTASH_"),
  },
  {
    id: "studio-tts",
    description: "Typecast TTS, preview voices, voice assets, and synthesis tuning.",
    relatedDocs: ["docs/OPERATIONS.md"],
    match: (name) =>
      name.startsWith("TYPECAST_") ||
      name.startsWith("VOICE_"),
  },
  {
    id: "studio-media",
    description: "Image providers, meme library, search integrations, and media discovery settings.",
    relatedDocs: ["docs/CODEX_GUIDE.md", "docs/OPERATIONS.md"],
    match: (name) =>
      name.startsWith("GIPHY_") ||
      name.startsWith("NAVER_") ||
      name.startsWith("PEXELS_") ||
      name.startsWith("PIXABAY_") ||
      name.startsWith("MEME_"),
  },
  {
    id: "studio-render",
    description: "Studio render, dialogue/audio defaults, memory thresholds, and renderer toggles.",
    relatedDocs: ["docs/CODEX_GUIDE.md", "docs/OPERATIONS.md"],
    match: (name) => name.startsWith("STUDIO_"),
  },
  {
    id: "cache-storage",
    description: "External cache/storage backing services.",
    relatedDocs: ["docs/OPERATIONS.md"],
    match: (name) => name.startsWith("UPSTASH_"),
  },
];

function toPosix(targetPath) {
  return targetPath.split(path.sep).join("/");
}

async function pathExists(relativePath) {
  try {
    await readdir(path.join(projectRoot, relativePath));
    return true;
  } catch {
    try {
      await readFile(path.join(projectRoot, relativePath), "utf8");
      return true;
    } catch {
      return false;
    }
  }
}

async function walkFiles(relativeDir) {
  const absoluteDir = path.join(projectRoot, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullRelativePath = toPosix(path.join(relativeDir, entry.name));
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullRelativePath)));
      continue;
    }
    if (entry.isFile()) {
      files.push(fullRelativePath);
    }
  }
  return files;
}

function toAppPageRoute(relativePath) {
  const normalized = toPosix(relativePath).replace(/^app\//, "");
  const routePath = normalized.replace(/\/page\.tsx$/, "").replace(/^page\.tsx$/, "");
  return routePath ? `/${routePath}` : "/";
}

function toApiRoute(relativePath) {
  const normalized = toPosix(relativePath).replace(/^app\/api\//, "");
  const routePath = normalized.replace(/\/route\.ts$/, "");
  return `/api/${routePath}`;
}

function getRouteGroup(route) {
  const segments = route.split("/").filter(Boolean);
  return segments[0] || "root";
}

function groupRoutes(routes, routeKey) {
  const grouped = new Map();
  for (const route of routes) {
    const key = route[routeKey];
    const bucket = grouped.get(key) || [];
    bucket.push(route);
    grouped.set(key, bucket);
  }
  return Array.from(grouped.entries())
    .map(([group, items]) => ({
      group,
      count: items.length,
      routes: items.sort((a, b) => a.route.localeCompare(b.route, "en")),
    }))
    .sort((a, b) => a.group.localeCompare(b.group, "en"));
}

function collectMatches(content, pattern) {
  const results = [];
  const regex = new RegExp(pattern.source, pattern.flags);
  let match = regex.exec(content);
  while (match) {
    const value = match[1] || match[2] || match[3] || "";
    if (value) results.push(value);
    match = regex.exec(content);
  }
  return results;
}

function getEnvironmentGroup(name) {
  for (const group of ENVIRONMENT_GROUPS) {
    if (group.match(name)) return group;
  }
  return {
    id: "misc",
    description: "Unclassified environment variables still referenced by the codebase.",
    relatedDocs: [],
  };
}

async function collectEnvironmentReferences(sourceFiles) {
  const patterns = [
    /process\.env\.([A-Z][A-Z0-9_]+)/g,
    /process\.env\[['"]([A-Z][A-Z0-9_]+)['"]\]/g,
    /readTrimmedEnv\("([A-Z][A-Z0-9_]+)"\)/g,
  ];
  const referenceMap = new Map();

  for (const file of sourceFiles) {
    if (!/\.(ts|tsx|js|mjs)$/i.test(file)) continue;
    const absolutePath = path.join(projectRoot, file);
    const content = await readFile(absolutePath, "utf8");
    const names = new Set(patterns.flatMap((pattern) => collectMatches(content, pattern)));
    for (const name of names) {
      if (IGNORED_ENV_NAMES.has(name)) continue;
      const entry = referenceMap.get(name) || {
        name,
        public: name.startsWith("NEXT_PUBLIC_"),
        usedInTests: false,
        files: [],
      };
      entry.files.push(file);
      if (/\.test\.(ts|tsx)$/i.test(file)) entry.usedInTests = true;
      referenceMap.set(name, entry);
    }
  }

  return Array.from(referenceMap.values())
    .map((entry) => ({
      ...entry,
      files: Array.from(new Set(entry.files)).sort((a, b) => a.localeCompare(b, "en")),
      category: getEnvironmentGroup(entry.name).id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}

async function validateCuratedPaths() {
  const pathsToCheck = new Set();
  for (const item of DIRECTORY_SUMMARY) pathsToCheck.add(item.path);
  for (const item of HOTSPOTS) pathsToCheck.add(item.path);
  for (const domain of DOMAIN_SUMMARY) {
    for (const item of [...domain.paths, ...domain.entryFiles, ...domain.relatedDocs]) {
      pathsToCheck.add(item);
    }
  }
  for (const doc of [...PRIMARY_DOCS, ...LIVING_DOCS, ...DATA_DOCS]) {
    if (doc.path !== outputRelativePath && doc.path !== environmentOutputRelativePath) pathsToCheck.add(doc.path);
  }
  for (const doc of HISTORICAL_DOCS) pathsToCheck.add(doc);

  for (const relativePath of pathsToCheck) {
    if (!(await pathExists(relativePath))) {
      throw new Error(`Curated doc path is stale: ${relativePath}`);
    }
  }
}

async function main() {
  await validateCuratedPaths();

  const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
  const appFiles = await walkFiles("app");
  const docsFiles = (await walkFiles("docs")).filter((file) => /\.(md|yaml|yml|json)$/i.test(file));
  const sourceFiles = [
    ...(await walkFiles("app")),
    ...(await walkFiles("lib")),
    ...(await walkFiles("scripts")),
  ];

  const pageRoutes = appFiles
    .filter((file) => file.endsWith("/page.tsx") || file === "app/page.tsx")
    .filter((file) => !file.startsWith("app/api/"))
    .map((file) => {
      const route = toAppPageRoute(file);
      return {
        route,
        file,
        group: getRouteGroup(route),
      };
    })
    .sort((a, b) => a.route.localeCompare(b.route, "en"));

  const apiRoutes = appFiles
    .filter((file) => file.startsWith("app/api/") && file.endsWith("/route.ts"))
    .map((file) => {
      const route = toApiRoute(file);
      return {
        route,
        file,
        group: getRouteGroup(route.replace(/^\/api/, "")),
      };
    })
    .sort((a, b) => a.route.localeCompare(b.route, "en"));

  const testFiles = sourceFiles
    .filter((file) => /\.test\.(ts|tsx)$/i.test(file))
    .sort((a, b) => a.localeCompare(b, "en"));
  const environmentVariables = await collectEnvironmentReferences(sourceFiles);
  const environmentGroups = ENVIRONMENT_GROUPS.map((group) => ({
    id: group.id,
    description: group.description,
    relatedDocs: group.relatedDocs,
    variables: environmentVariables.filter((item) => item.category === group.id),
  })).filter((group) => group.variables.length > 0);
  const uncategorizedVariables = environmentVariables.filter((item) => item.category === "misc");

  const developerMap = {
    schemaVersion: 1,
    generatedBy: {
      command: "npm run docs:refresh",
      script: "scripts/generate-developer-docs.mjs",
    },
    project: {
      name: packageJson.name,
      version: packageJson.version,
      private: Boolean(packageJson.private),
      packageType: packageJson.type || "commonjs",
      framework: "Next.js App Router",
      uiRuntime: "React 19",
      language: "TypeScript",
    },
    summary: {
      topLevelDirectories: DIRECTORY_SUMMARY.length,
      pageRouteCount: pageRoutes.length,
      apiRouteCount: apiRoutes.length,
      docFileCount: docsFiles.length,
      testFileCount: testFiles.length,
    },
    commands: Object.entries(packageJson.scripts || {}).map(([name, command]) => ({
      name,
      command,
    })),
    directories: DIRECTORY_SUMMARY,
    routes: {
      pages: pageRoutes,
      pageGroups: groupRoutes(pageRoutes, "group"),
      api: apiRoutes,
      apiGroups: groupRoutes(apiRoutes, "group"),
    },
    domains: DOMAIN_SUMMARY,
    hotspots: HOTSPOTS,
    tests: {
      runner: "npm run test",
      entryScript: "scripts/run-node-tests.mjs",
      files: testFiles,
    },
    docs: {
      primary: PRIMARY_DOCS,
      living: LIVING_DOCS,
      dataFiles: DATA_DOCS,
      historical: HISTORICAL_DOCS.map((file) => ({ path: file, role: "historical checkpoint/reference" })),
    },
  };

  await writeFile(outputPath, `${JSON.stringify(developerMap, null, 2)}\n`, "utf8");
  await writeFile(
    environmentOutputPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedBy: {
          command: "npm run docs:refresh",
          script: "scripts/generate-developer-docs.mjs",
        },
        summary: {
          variableCount: environmentVariables.length,
          publicVariableCount: environmentVariables.filter((item) => item.public).length,
          serverOnlyVariableCount: environmentVariables.filter((item) => !item.public).length,
          groupCount: environmentGroups.length + (uncategorizedVariables.length > 0 ? 1 : 0),
        },
        groups: [
          ...environmentGroups,
          ...(uncategorizedVariables.length > 0
            ? [
                {
                  id: "misc",
                  description: "Unclassified environment variables still referenced by the codebase.",
                  relatedDocs: [],
                  variables: uncategorizedVariables,
                },
              ]
            : []),
        ],
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  console.log(`[docs:refresh] Wrote ${outputRelativePath}`);
  console.log(`[docs:refresh] Wrote ${environmentOutputRelativePath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
