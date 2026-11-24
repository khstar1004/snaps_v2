import { Injectable } from '@nestjs/common';

export type SnapsVideoPublishPlatform =
  | 'instagram'
  | 'youtube'
  | 'tiktok'
  | 'facebook'
  | 'threads';

export type SnapsVideoTextToImageModel =
  | 'none'
  | 'flux-schnell'
  | 'flux-dev'
  | 'flux-1.1-pro'
  | 'flux-1.1-pro-ultra'
  | 'recraft-v3'
  | 'ideogram-v2'
  | 'luma-photon'
  | 'gpt-image-1';

export type SnapsVideoImageToVideoModel =
  | 'none'
  | 'framepack'
  | 'kling-v1.5'
  | 'kling-v1.6'
  | 'luma-dream-machine'
  | 'runway-gen3'
  | 'minimax'
  | 'google-veo2';

export type SnapsVideoDisclosureSeverity = 'required' | 'recommended' | 'info';

export type SnapsVideoPublishGuardRequest = {
  durationSeconds?: unknown;
  platform?: unknown;
  targetPlatforms?: unknown;
  sceneCount?: unknown;
  generatedImageCount?: unknown;
  generatedVideoCount?: unknown;
  customAssetCount?: unknown;
  textToImageModel?: unknown;
  imageToVideoModel?: unknown;
  aiVoice?: unknown;
  aiGeneratedVisuals?: unknown;
  realisticPeople?: unknown;
  realisticPlacesEvents?: unknown;
  sourceLanguage?: unknown;
  captionLanguage?: unknown;
  targetLanguages?: unknown;
  regenerateVisualsPerLanguage?: unknown;
};

export type SnapsVideoCreditBudgetRow = {
  id: string;
  label: string;
  unitCredits: number;
  quantity: number;
  totalCredits: number;
  billable: boolean;
  note: string;
};

export type SnapsVideoDisclosureChecklistItem = {
  platform: SnapsVideoPublishPlatform;
  labelRequired: boolean;
  severity: SnapsVideoDisclosureSeverity;
  reason: string;
  operatorAction: string;
};

export type SnapsVideoLocalizationRow = {
  language: string;
  scriptDirection: 'ltr' | 'rtl';
  supported: boolean;
  voiceoverAction: string;
  captionAction: string;
  reviewAction: string;
  warnings: string[];
};

export type SnapsVideoPublishGuardPreview = {
  source: 'snaps-video-publish-guard';
  durationSeconds: number;
  targetPlatforms: SnapsVideoPublishPlatform[];
  creditBudget: {
    textToImageModel: SnapsVideoTextToImageModel;
    imageToVideoModel: SnapsVideoImageToVideoModel;
    imageCredits: number;
    videoCredits: number;
    voiceCredits: number;
    localizedVariantCredits: number;
    customAssetCredits: number;
    totalCredits: number;
    billableOnlyOnSuccess: true;
    rows: SnapsVideoCreditBudgetRow[];
  };
  disclosureChecklist: SnapsVideoDisclosureChecklistItem[];
  localizationPlan: {
    sourceLanguage: string;
    captionLanguage: string;
    targetLanguages: string[];
    rows: SnapsVideoLocalizationRow[];
    warnings: string[];
    recommendations: string[];
  };
  publishReadinessScore: number;
  warnings: string[];
  recommendations: string[];
};

const textToImageCosts: Record<SnapsVideoTextToImageModel, number> = {
  none: 0,
  'flux-schnell': 1,
  'flux-dev': 10,
  'flux-1.1-pro': 15,
  'flux-1.1-pro-ultra': 20,
  'recraft-v3': 15,
  'ideogram-v2': 30,
  'luma-photon': 10,
  'gpt-image-1': 25,
};

const imageToVideoCosts: Record<SnapsVideoImageToVideoModel, number> = {
  none: 0,
  framepack: 55,
  'kling-v1.5': 210,
  'kling-v1.6': 210,
  'luma-dream-machine': 170,
  'runway-gen3': 85,
  minimax: 170,
  'google-veo2': 835,
};

const supportedLanguages = new Set(
  [
    'Arabic',
    'Bulgarian',
    'Chinese',
    'Croatian',
    'Czech',
    'Danish',
    'Dutch',
    'English',
    'Filipino',
    'Finnish',
    'French',
    'German',
    'Greek',
    'Hindi',
    'Indonesian',
    'Italian',
    'Japanese',
    'Korean',
    'Malay',
    'Polish',
    'Portuguese',
    'Romanian',
    'Russian',
    'Slovak',
    'Spanish',
    'Swedish',
    'Tamil',
    'Turkish',
    'Ukrainian',
  ].map((language) => language.toLowerCase())
);

@Injectable()
export class SnapsVideoPublishGuardService {
  preview(body?: SnapsVideoPublishGuardRequest): SnapsVideoPublishGuardPreview {
    const request = body || {};
    const durationSeconds = this.integer(request.durationSeconds, 45, 15, 180);
    const targetPlatforms = this.targetPlatforms(
      request.targetPlatforms,
      request.platform
    );
    const sceneCount = this.integer(request.sceneCount, Math.max(3, Math.ceil(durationSeconds / 12)), 1, 24);
    const generatedImageCount = this.integer(request.generatedImageCount, sceneCount, 0, 80);
    const generatedVideoCount = this.integer(request.generatedVideoCount, 0, 0, 80);
    const customAssetCount = this.integer(request.customAssetCount, 0, 0, 80);
    const textToImageModel = this.textToImageModel(request.textToImageModel);
    const imageToVideoModel = this.imageToVideoModel(request.imageToVideoModel);
    const sourceLanguage = this.language(request.sourceLanguage, 'Korean');
    const captionLanguage = this.language(request.captionLanguage, sourceLanguage);
    const targetLanguages = this.targetLanguages(request.targetLanguages, [
      sourceLanguage,
      'English',
    ]);
    const aiVoice = this.boolean(request.aiVoice, true);
    const aiGeneratedVisuals = this.boolean(request.aiGeneratedVisuals, true);
    const realisticPeople = this.boolean(request.realisticPeople, false);
    const realisticPlacesEvents = this.boolean(
      request.realisticPlacesEvents,
      false
    );
    const regenerateVisualsPerLanguage = this.boolean(
      request.regenerateVisualsPerLanguage,
      false
    );

    const creditBudget = this.creditBudget({
      textToImageModel,
      imageToVideoModel,
      generatedImageCount,
      generatedVideoCount,
      customAssetCount,
      aiVoice,
      targetLanguages,
      sourceLanguage,
      regenerateVisualsPerLanguage,
      sceneCount,
    });
    const disclosureChecklist = this.disclosureChecklist({
      targetPlatforms,
      aiGeneratedVisuals,
      aiVoice,
      realisticPeople,
      realisticPlacesEvents,
    });
    const localizationPlan = this.localizationPlan({
      sourceLanguage,
      captionLanguage,
      targetLanguages,
      regenerateVisualsPerLanguage,
    });
    const warnings = this.warnings({
      creditBudget,
      disclosureChecklist,
      localizationPlan,
      generatedVideoCount,
      imageToVideoModel,
      targetLanguages,
      realisticPeople,
      realisticPlacesEvents,
    });
    const publishReadinessScore = this.publishReadinessScore({
      warnings,
      disclosureChecklist,
      localizationPlan,
      creditBudget,
    });

    return {
      source: 'snaps-video-publish-guard',
      durationSeconds,
      targetPlatforms,
      creditBudget,
      disclosureChecklist,
      localizationPlan,
      publishReadinessScore,
      warnings,
      recommendations: this.recommendations({
        creditBudget,
        disclosureChecklist,
        localizationPlan,
        targetPlatforms,
      }),
    };
  }

  private creditBudget(input: {
    textToImageModel: SnapsVideoTextToImageModel;
    imageToVideoModel: SnapsVideoImageToVideoModel;
    generatedImageCount: number;
    generatedVideoCount: number;
    customAssetCount: number;
    aiVoice: boolean;
    targetLanguages: string[];
    sourceLanguage: string;
    regenerateVisualsPerLanguage: boolean;
    sceneCount: number;
  }): SnapsVideoPublishGuardPreview['creditBudget'] {
    const imageCredits =
      textToImageCosts[input.textToImageModel] * input.generatedImageCount;
    const videoCredits =
      imageToVideoCosts[input.imageToVideoModel] * input.generatedVideoCount;
    const customAssetCredits = 0;
    const voiceCredits = 0;
    const extraLanguageCount = input.targetLanguages.filter(
      (language) => language.toLowerCase() !== input.sourceLanguage.toLowerCase()
    ).length;
    const localizedVariantCredits = input.regenerateVisualsPerLanguage
      ? extraLanguageCount *
        input.sceneCount *
        textToImageCosts[input.textToImageModel]
      : 0;
    const rows: SnapsVideoCreditBudgetRow[] = [
      {
        id: 'ai-images',
        label: 'AI text-to-image tracks',
        unitCredits: textToImageCosts[input.textToImageModel],
        quantity: input.generatedImageCount,
        totalCredits: imageCredits,
        billable: input.textToImageModel !== 'none' && input.generatedImageCount > 0,
        note: 'Matches the Blotato AI Video Credits model table for image generation.',
      },
      {
        id: 'ai-video-clips',
        label: 'AI image-to-video clips',
        unitCredits: imageToVideoCosts[input.imageToVideoModel],
        quantity: input.generatedVideoCount,
        totalCredits: videoCredits,
        billable: input.imageToVideoModel !== 'none' && input.generatedVideoCount > 0,
        note: 'Use only for animated clips; slideshow-only videos can stay at zero.',
      },
      {
        id: 'custom-assets',
        label: 'Uploaded custom images/audio',
        unitCredits: 0,
        quantity: input.customAssetCount,
        totalCredits: customAssetCredits,
        billable: false,
        note: 'Uploaded custom assets do not consume AI credits unless animated with an image-to-video model.',
      },
      {
        id: 'ai-voiceover',
        label: 'AI voiceover',
        unitCredits: 0,
        quantity: input.aiVoice ? input.targetLanguages.length : 0,
        totalCredits: voiceCredits,
        billable: false,
        note: 'Blotato documents AI voiceover outside the AI image/video credit budget.',
      },
      {
        id: 'localized-visuals',
        label: 'Localized visual regeneration',
        unitCredits: input.regenerateVisualsPerLanguage
          ? input.sceneCount * textToImageCosts[input.textToImageModel]
          : 0,
        quantity: input.regenerateVisualsPerLanguage ? extraLanguageCount : 0,
        totalCredits: localizedVariantCredits,
        billable: localizedVariantCredits > 0,
        note: 'Keep at zero when only the script, voiceover, and captions change per language.',
      },
    ];

    return {
      textToImageModel: input.textToImageModel,
      imageToVideoModel: input.imageToVideoModel,
      imageCredits,
      videoCredits,
      voiceCredits,
      localizedVariantCredits,
      customAssetCredits,
      totalCredits:
        imageCredits +
        videoCredits +
        voiceCredits +
        localizedVariantCredits +
        customAssetCredits,
      billableOnlyOnSuccess: true,
      rows,
    };
  }

  private disclosureChecklist(input: {
    targetPlatforms: SnapsVideoPublishPlatform[];
    aiGeneratedVisuals: boolean;
    aiVoice: boolean;
    realisticPeople: boolean;
    realisticPlacesEvents: boolean;
  }): SnapsVideoDisclosureChecklistItem[] {
    const realisticSynthetic =
      (input.aiGeneratedVisuals || input.aiVoice) &&
      (input.realisticPeople || input.realisticPlacesEvents);
    const genericSynthetic = input.aiGeneratedVisuals || input.aiVoice;

    return input.targetPlatforms.map((platform) => {
      if (platform === 'youtube') {
        return realisticSynthetic
          ? {
              platform,
              labelRequired: true,
              severity: 'required',
              reason:
                'YouTube requires altered or synthetic disclosure when realistic people, places, or events are meaningfully AI-generated or altered.',
              operatorAction:
                'In YouTube Studio, answer Yes under Altered content before upload.',
            }
          : {
              platform,
              labelRequired: false,
              severity: genericSynthetic ? 'recommended' : 'info',
              reason:
                'YouTube disclosure is focused on realistic altered or synthetic content; captions and minor production assistance alone usually do not trigger the setting.',
              operatorAction:
                'Keep the title/description honest and recheck the upload form if the final render looks realistic.',
            };
      }

      if (platform === 'tiktok') {
        return realisticSynthetic
          ? {
              platform,
              labelRequired: true,
              severity: 'required',
              reason:
                'TikTok requires creators to label AI-generated content that contains realistic images, audio, or video.',
              operatorAction:
                'Open More options before posting and turn on the AI-generated content setting.',
            }
          : {
              platform,
              labelRequired: false,
              severity: genericSynthetic ? 'recommended' : 'info',
              reason:
                'TikTok encourages labels for completely generated or significantly AI-edited content even when it is not realistic.',
              operatorAction:
                'Use the creator AI-generated label or add clear caption context when the render is AI-made.',
            };
      }

      if (platform === 'instagram' || platform === 'facebook' || platform === 'threads') {
        return realisticSynthetic
          ? {
              platform,
              labelRequired: true,
              severity: 'required',
              reason:
                'Meta applies AI info labels from signals or self-disclosure for generated or manipulated media across Facebook, Instagram, and Threads.',
              operatorAction:
                'Use the platform AI info or generated-by-AI disclosure controls and avoid implying real events or endorsements.',
            }
          : {
              platform,
              labelRequired: false,
              severity: genericSynthetic ? 'recommended' : 'info',
              reason:
                'Meta may label AI-generated or AI-edited media from industry signals or self-disclosure.',
              operatorAction:
                'Preserve content credentials where available and add caption context for AI-made visuals.',
            };
      }

      return {
        platform,
        labelRequired: false,
        severity: 'info',
        reason: 'No platform-specific AI disclosure rule is configured.',
        operatorAction: 'Review the destination platform upload form manually.',
      };
    });
  }

  private localizationPlan(input: {
    sourceLanguage: string;
    captionLanguage: string;
    targetLanguages: string[];
    regenerateVisualsPerLanguage: boolean;
  }): SnapsVideoPublishGuardPreview['localizationPlan'] {
    const rows: SnapsVideoLocalizationRow[] = input.targetLanguages.map((language) => {
      const normalized = language.toLowerCase();
      const supported = supportedLanguages.has(normalized);
      const warnings: string[] = [];
      if (!supported) {
        warnings.push('language is not in the documented Blotato faceless video language list');
      }
      if (
        ['korean', 'japanese', 'chinese'].includes(normalized) &&
        input.captionLanguage.toLowerCase() !== normalized
      ) {
        warnings.push('caption language should match the local voiceover script for CJK readability');
      }
      return {
        language,
        scriptDirection: normalized === 'arabic' ? 'rtl' : 'ltr',
        supported,
        voiceoverAction: `Generate voiceover from a ${language} script.`,
        captionAction: ['korean', 'japanese', 'chinese'].includes(normalized)
          ? 'Use a CJK-safe caption font and review line breaks manually.'
          : 'Use localized captions and keep the first cue inside the first second.',
        reviewAction: input.regenerateVisualsPerLanguage
          ? 'Review per-scene image prompts in this language before regenerating visuals.'
          : 'Reuse the approved visual track and review localized narration/captions only.',
        warnings,
      };
    });
    const warnings = rows.flatMap((row) => row.warnings);

    return {
      sourceLanguage: input.sourceLanguage,
      captionLanguage: input.captionLanguage,
      targetLanguages: input.targetLanguages,
      rows,
      warnings,
      recommendations: [
        'Write the script directly in the target language before generating voiceover.',
        'Use advanced per-scene prompts when the model keeps translating prompts back to English.',
        'Run one native-language review pass for captions, voice pacing, and on-screen text.',
      ],
    };
  }

  private warnings(input: {
    creditBudget: SnapsVideoPublishGuardPreview['creditBudget'];
    disclosureChecklist: SnapsVideoDisclosureChecklistItem[];
    localizationPlan: SnapsVideoPublishGuardPreview['localizationPlan'];
    generatedVideoCount: number;
    imageToVideoModel: SnapsVideoImageToVideoModel;
    targetLanguages: string[];
    realisticPeople: boolean;
    realisticPlacesEvents: boolean;
  }) {
    const warnings: string[] = [];
    if (input.creditBudget.totalCredits > 300) {
      warnings.push('AI video credit estimate is high; consider a slideshow pass before image-to-video generation.');
    }
    if (
      input.generatedVideoCount > 0 &&
      ['kling-v1.5', 'kling-v1.6', 'luma-dream-machine', 'minimax', 'google-veo2'].includes(input.imageToVideoModel)
    ) {
      warnings.push('Selected image-to-video model is expensive; confirm the hook before rendering every scene.');
    }
    if (input.disclosureChecklist.some((item) => item.labelRequired)) {
      warnings.push('One or more platforms require an AI-generated or altered/synthetic content disclosure before publishing.');
    }
    if (input.localizationPlan.warnings.length) {
      warnings.push(input.localizationPlan.warnings[0]);
    }
    if (input.targetLanguages.length > 4) {
      warnings.push('More than four language variants should be batched so review does not become the bottleneck.');
    }
    if (input.realisticPeople || input.realisticPlacesEvents) {
      warnings.push('Realistic people, places, or events need a final human policy review before upload.');
    }
    return [...new Set(warnings)];
  }

  private recommendations(input: {
    creditBudget: SnapsVideoPublishGuardPreview['creditBudget'];
    disclosureChecklist: SnapsVideoDisclosureChecklistItem[];
    localizationPlan: SnapsVideoPublishGuardPreview['localizationPlan'];
    targetPlatforms: SnapsVideoPublishPlatform[];
  }) {
    const recommendations = [
      'Check the credit estimate before pressing Generate so failed experiments do not burn the monthly budget.',
      'Do the AI disclosure review after the final render, not only at script time.',
      'This checklist is an operational aid, not legal advice.',
    ];
    if (input.creditBudget.totalCredits <= 10) {
      recommendations.push('Current settings are suitable for a cheap validation render.');
    }
    if (input.disclosureChecklist.some((item) => item.labelRequired)) {
      recommendations.push('Add the required AI disclosure in every platform upload flow before scheduling.');
    }
    if (input.localizationPlan.targetLanguages.length > 1) {
      recommendations.push('Publish one language first, then clone the approved visual track for the remaining variants.');
    }
    if (input.targetPlatforms.includes('youtube')) {
      recommendations.push('Keep YouTube Shorts metadata aligned with the altered content setting.');
    }
    return recommendations;
  }

  private publishReadinessScore(input: {
    warnings: string[];
    disclosureChecklist: SnapsVideoDisclosureChecklistItem[];
    localizationPlan: SnapsVideoPublishGuardPreview['localizationPlan'];
    creditBudget: SnapsVideoPublishGuardPreview['creditBudget'];
  }) {
    const requiredDisclosures = input.disclosureChecklist.filter(
      (item) => item.labelRequired
    ).length;
    const unsupportedLanguages = input.localizationPlan.rows.filter(
      (row) => !row.supported
    ).length;
    const creditPenalty = input.creditBudget.totalCredits > 300 ? 10 : 0;
    return Math.max(
      0,
      Math.min(
        100,
        100 -
          input.warnings.length * 5 -
          requiredDisclosures * 8 -
          unsupportedLanguages * 10 -
          creditPenalty
      )
    );
  }

  private targetPlatforms(value: unknown, fallback: unknown): SnapsVideoPublishPlatform[] {
    const candidates = Array.isArray(value)
      ? value
      : typeof value === 'string'
      ? value.split(/[, ]+/)
      : fallback
      ? [fallback]
      : ['instagram', 'youtube', 'tiktok'];
    const platforms = candidates
      .map((item) => this.platform(item))
      .filter((item): item is SnapsVideoPublishPlatform => !!item);
    return platforms.length ? [...new Set(platforms)] : ['instagram', 'youtube', 'tiktok'];
  }

  private platform(value: unknown): SnapsVideoPublishPlatform | undefined {
    const normalized = this.cleanText(value, 40).toLowerCase();
    if (normalized === 'reels') {
      return 'instagram';
    }
    if (
      normalized === 'instagram' ||
      normalized === 'youtube' ||
      normalized === 'tiktok' ||
      normalized === 'facebook' ||
      normalized === 'threads'
    ) {
      return normalized;
    }
    return undefined;
  }

  private textToImageModel(value: unknown): SnapsVideoTextToImageModel {
    const normalized = this.cleanText(value, 60).toLowerCase().replace(/_/g, '-');
    const aliases: Record<string, SnapsVideoTextToImageModel> = {
      flux: 'flux-schnell',
      'flux-schnell': 'flux-schnell',
      'flux-dev': 'flux-dev',
      'flux-pro': 'flux-1.1-pro',
      'flux-1.1-pro': 'flux-1.1-pro',
      'flux-1.1-pro-ultra': 'flux-1.1-pro-ultra',
      'recraft-v3': 'recraft-v3',
      ideogram: 'ideogram-v2',
      'ideogram-v2': 'ideogram-v2',
      'luma-photon': 'luma-photon',
      'gpt-image-1': 'gpt-image-1',
      none: 'none',
    };
    return aliases[normalized] || 'flux-schnell';
  }

  private imageToVideoModel(value: unknown): SnapsVideoImageToVideoModel {
    const normalized = this.cleanText(value, 60).toLowerCase().replace(/_/g, '-');
    const aliases: Record<string, SnapsVideoImageToVideoModel> = {
      none: 'none',
      framepack: 'framepack',
      kling: 'kling-v1.5',
      'kling-v1.5': 'kling-v1.5',
      'kling-v1.6': 'kling-v1.6',
      luma: 'luma-dream-machine',
      'luma-dream-machine': 'luma-dream-machine',
      runway: 'runway-gen3',
      'runway-gen3': 'runway-gen3',
      minimax: 'minimax',
      veo2: 'google-veo2',
      'google-veo2': 'google-veo2',
    };
    return aliases[normalized] || 'none';
  }

  private targetLanguages(value: unknown, fallback: string[]) {
    const candidates = Array.isArray(value)
      ? value
      : typeof value === 'string'
      ? value.split(/[,/|]+/)
      : fallback;
    const languages = candidates
      .map((item) => this.language(item, ''))
      .filter(Boolean)
      .slice(0, 8);
    return languages.length ? [...new Set(languages)] : fallback;
  }

  private language(value: unknown, fallback: string) {
    const clean = this.cleanText(value, 40);
    if (!clean) {
      return fallback;
    }
    const map: Record<string, string> = {
      kr: 'Korean',
      ko: 'Korean',
      korean: 'Korean',
      한국어: 'Korean',
      en: 'English',
      english: 'English',
      영어: 'English',
      jp: 'Japanese',
      ja: 'Japanese',
      japanese: 'Japanese',
      일본어: 'Japanese',
      zh: 'Chinese',
      chinese: 'Chinese',
      중국어: 'Chinese',
      es: 'Spanish',
      spanish: 'Spanish',
      스페인어: 'Spanish',
    };
    const normalized = clean.toLowerCase();
    return map[normalized] || clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  private integer(value: unknown, fallback: number, min: number, max: number) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  private boolean(value: unknown, fallback: boolean) {
    return typeof value === 'boolean' ? value : fallback;
  }

  private cleanText(value: unknown, max = 1000) {
    return typeof value === 'string'
      ? value.replace(/\s+/g, ' ').trim().slice(0, max)
      : '';
  }
}
