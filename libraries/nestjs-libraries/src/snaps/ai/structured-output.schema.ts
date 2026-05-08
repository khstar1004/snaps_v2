export type SnapsOllamaTransformPayload = {
  variants?: Array<{
    platform?: unknown;
    content?: unknown;
    title?: unknown;
    hashtags?: unknown;
    notes?: unknown;
  }>;
};

export const snapsTransformOutputShape = {
  variants: [
    {
      platform: 'one of requested platforms',
      title: 'optional title when useful',
      content: 'final publish-ready content',
      hashtags: ['hashtags without spaces'],
      notes: ['optional operator notes'],
    },
  ],
};
