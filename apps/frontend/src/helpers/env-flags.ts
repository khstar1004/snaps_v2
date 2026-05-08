const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export const isEnabledEnv = (value?: string) => {
  return TRUE_VALUES.has((value || '').trim().toLowerCase());
};

export const isGenericOauthEnabled = () => {
  return (
    isEnabledEnv(process.env.SNAPS_GENERIC_OAUTH) ||
    isEnabledEnv(process.env.POSTIZ_GENERIC_OAUTH)
  );
};
