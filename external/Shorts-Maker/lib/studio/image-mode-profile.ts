export function withoutAutomaticImageProfileFields<T extends object>(
  metadata: T | null | undefined
): T | null {
  if (!metadata) return null;
  const {
    mascotPrompt: _mascotPrompt,
    mascotName: _mascotName,
    mascotDescription: _mascotDescription,
    mascotStyle: _mascotStyle,
    mascotTone: _mascotTone,
    mascotAnchorImageUrl: _mascotAnchorImageUrl,
    mascotAnchorAssetId: _mascotAnchorAssetId,
    ...fixedCharacterMetadata
  } = metadata as T & {
    mascotPrompt?: unknown;
    mascotName?: unknown;
    mascotDescription?: unknown;
    mascotStyle?: unknown;
    mascotTone?: unknown;
    mascotAnchorImageUrl?: unknown;
    mascotAnchorAssetId?: unknown;
  };
  return fixedCharacterMetadata as T;
}
