export type StudioSfxAudioExtension = ".mp3" | ".wav" | ".ogg" | ".m4a";

const DEFAULT_SFX_ASSET_FETCH_CONCURRENCY = 4;

const SFX_ASSET_UNAVAILABLE_PREFIX = "[SFX_ASSET_UNAVAILABLE]";

function normalizeSfxPath(path: string): string {
  return String(path || "").trim();
}

export function resolveRequiredStudioSfxExtension(path: string): StudioSfxAudioExtension {
  const normalizedPath = normalizeSfxPath(path);
  if (!normalizedPath) {
    throw new Error(`${SFX_ASSET_UNAVAILABLE_PREFIX} 효과음 경로가 비어 있습니다.`);
  }
  const clean = normalizedPath.toLowerCase().split("?")[0].split("#")[0];
  const dotIndex = clean.lastIndexOf(".");
  const extension = dotIndex >= 0 ? clean.slice(dotIndex) : "";
  if (extension === ".mp3" || extension === ".wav" || extension === ".ogg" || extension === ".m4a") {
    return extension;
  }
  throw new Error(`${SFX_ASSET_UNAVAILABLE_PREFIX} 지원하지 않는 효과음 파일 형식입니다. (${normalizedPath})`);
}

export async function loadRequiredStudioSfxAsset<TBytes extends { readonly byteLength: number }>(
  path: string,
  loader: (path: string) => Promise<TBytes>
): Promise<{ path: string; extension: StudioSfxAudioExtension; bytes: TBytes }> {
  const normalizedPath = normalizeSfxPath(path);
  const extension = resolveRequiredStudioSfxExtension(normalizedPath);
  try {
    const bytes = await loader(normalizedPath);
    if (bytes.byteLength <= 0) {
      throw new Error("빈 파일입니다.");
    }
    return { path: normalizedPath, extension, bytes };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith(SFX_ASSET_UNAVAILABLE_PREFIX)) throw error;
    throw new Error(
      `${SFX_ASSET_UNAVAILABLE_PREFIX} 효과음 파일을 불러올 수 없습니다. (${normalizedPath}; ${message})`
    );
  }
}

export async function loadRequiredStudioSfxAssets<
  TCue extends { readonly path: string },
  TBytes extends { readonly byteLength: number },
>(
  cues: readonly TCue[],
  loader: (path: string) => Promise<TBytes>,
  concurrency = DEFAULT_SFX_ASSET_FETCH_CONCURRENCY
): Promise<Array<TCue & { extension: StudioSfxAudioExtension; bytes: TBytes }>> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<TCue & { extension: StudioSfxAudioExtension; bytes: TBytes }>(cues.length);
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= cues.length) return;
      const cue = cues[currentIndex];
      const asset = await loadRequiredStudioSfxAsset(cue.path, loader);
      results[currentIndex] = {
        ...cue,
        extension: asset.extension,
        bytes: asset.bytes,
      };
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, cues.length) }, () => worker()));
  return results;
}
