import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveCodexHomeDirForMarkers } from "@/lib/auth/codex-local";
import type { CodexModelOption } from "@/lib/studio/codex-contract";

export type LocalCodexModelOption = CodexModelOption;

type ModelsCacheRow = {
  slug?: unknown;
  display_name?: unknown;
  description?: unknown;
  visibility?: unknown;
};

async function readTextIfExists(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function parseConfiguredModel(configText: string): string {
  const match = configText.match(/^\s*model\s*=\s*["']([^"']+)["']/m);
  return match?.[1]?.trim() || "";
}

function parseCachedModels(cacheText: string): LocalCodexModelOption[] {
  if (!cacheText.trim()) return [];
  try {
    const parsed = JSON.parse(cacheText) as { models?: ModelsCacheRow[] };
    const rows = Array.isArray(parsed.models) ? parsed.models : [];
    const seen = new Set<string>();
    const items: LocalCodexModelOption[] = [];
    for (const row of rows) {
      const id = typeof row.slug === "string" ? row.slug.trim() : "";
      if (!id || seen.has(id)) continue;
      const visibility = typeof row.visibility === "string" ? row.visibility.trim() : "";
      if (visibility && visibility !== "list") continue;
      const label = typeof row.display_name === "string" && row.display_name.trim() ? row.display_name.trim() : id;
      const description = typeof row.description === "string" && row.description.trim() ? row.description.trim() : undefined;
      seen.add(id);
      items.push({ id, label, description });
    }
    return items;
  } catch {
    return [];
  }
}

export async function getLocalCodexModelCatalog(): Promise<{
  models: LocalCodexModelOption[];
  defaultModel: string;
}> {
  const codexDir = await resolveCodexHomeDirForMarkers(["config.toml", "models_cache.json", "auth.json"]);
  const [configText, cacheText] = await Promise.all([
    readTextIfExists(join(codexDir, "config.toml")),
    readTextIfExists(join(codexDir, "models_cache.json")),
  ]);
  const defaultModel = parseConfiguredModel(configText);
  const models = parseCachedModels(cacheText);
  if (defaultModel && !models.some((item) => item.id === defaultModel)) {
    return {
      defaultModel,
      models: [{ id: defaultModel, label: defaultModel }, ...models],
    };
  }
  return { models, defaultModel };
}
