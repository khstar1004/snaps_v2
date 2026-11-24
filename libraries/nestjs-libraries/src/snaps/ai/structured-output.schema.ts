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
      title:
        'title for the post; required when the platform rule has requiresTitle, because that platform publishes the title separately from the body',
      content:
        'final publish-ready content; for reply-chain platforms, separate each publishable segment with a blank line',
      hashtags: ['small platform-appropriate hashtag set without spaces'],
      notes: ['optional operator notes'],
    },
  ],
};
