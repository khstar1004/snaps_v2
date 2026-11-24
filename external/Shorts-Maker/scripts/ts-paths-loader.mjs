import { stat } from "node:fs/promises";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = pathResolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE_SUFFIXES = ["", ".ts", ".tsx", ".js", ".mjs", ".cjs"];
const INDEX_SUFFIXES = ["/index.ts", "/index.tsx", "/index.js", "/index.mjs", "/index.cjs"];
const PACKAGE_SUBPATH_ALIASES = new Map([
  ["next/server", "next/server.js"],
]);

async function tryResolveAlias(targetPath) {
  for (const suffix of FILE_SUFFIXES) {
    const candidate = `${targetPath}${suffix}`;
    try {
      const entry = await stat(candidate);
      if (!entry.isFile()) continue;
      return pathToFileURL(candidate).href;
    } catch {
      // continue
    }
  }
  for (const suffix of INDEX_SUFFIXES) {
    const candidate = `${targetPath}${suffix}`;
    try {
      const entry = await stat(candidate);
      if (!entry.isFile()) continue;
      return pathToFileURL(candidate).href;
    } catch {
      // continue
    }
  }
  return null;
}

export async function resolve(specifier, context, defaultResolve) {
  const remappedSpecifier = PACKAGE_SUBPATH_ALIASES.get(specifier) || specifier;
  if (specifier.startsWith("@/")) {
    const resolved = await tryResolveAlias(pathResolve(projectRoot, specifier.slice(2)));
    if (resolved) {
      return {
        url: resolved,
        shortCircuit: true,
      };
    }
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const parentPath = dirname(fileURLToPath(context.parentURL));
    const resolved = await tryResolveAlias(pathResolve(parentPath, specifier));
    if (resolved) {
      return {
        url: resolved,
        shortCircuit: true,
      };
    }
  }
  return defaultResolve(remappedSpecifier, context, defaultResolve);
}
