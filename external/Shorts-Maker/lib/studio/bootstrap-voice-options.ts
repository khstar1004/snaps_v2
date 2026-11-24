type BootstrapVoiceOptionLike = {
  id: string;
  provider?: string;
  source?: string;
};

export function filterStudioBootstrapVoiceOptions<T extends BootstrapVoiceOptionLike>(
  voiceOptions: T[],
  _defaultVoiceId: string,
  _defaultTypecastVoiceId: string
): T[] {
  return voiceOptions.filter((voice) => voice.provider === "typecast");
}
