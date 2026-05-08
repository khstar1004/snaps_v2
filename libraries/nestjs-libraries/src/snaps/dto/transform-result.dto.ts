import { SnapsTargetPlatform } from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';

export type SnapsSourceProvider = 'ollama' | 'rule-fallback';

export type SnapsVariant = {
  platform: SnapsTargetPlatform;
  label: string;
  content: string;
  title?: string;
  hashtags: string[];
  media?: Array<{
    id: string;
    path: string;
    thumbnail?: string;
    alt?: string;
  }>;
  settings: Record<string, unknown>;
  publishMode: 'schedule' | 'assist';
  notes?: string[];
};

export type SnapsTransformResult = {
  provider: SnapsSourceProvider;
  model: string;
  variants: SnapsVariant[];
  warnings: string[];
  ragExamplesUsed: Array<{
    id: string;
    platform: string;
    content: string;
    score: number;
  }>;
};

export type SnapsDraftResult = SnapsTransformResult & {
  draftPayload: {
    type: 'draft';
    date: string;
    shortLink: boolean;
    tags: unknown[];
    posts: Array<{
      platform: SnapsTargetPlatform;
      content: string;
      media?: SnapsVariant['media'];
      settings: Record<string, unknown>;
      publishMode: 'schedule' | 'assist';
    }>;
  };
};
