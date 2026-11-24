import type { ImageScoreBreakdown } from "@/types/studio-json";
import type { VisualIntent } from "@/lib/studio/images/intent";

export type ImagePolicyScoreWeights = Omit<ImageScoreBreakdown, "total">;
export type ImagePolicyVariant = "v1" | "v2";

export type ImageMustAvoidProfile = {
  label: "strict" | "balanced" | "relaxed" | "cta-relaxed";
  mustAvoid: string[];
  minScore: number;
};

export type ImagePolicyProfile = {
  id: VisualIntent["profileId"];
  variant: ImagePolicyVariant;
  searchIntent: "news" | "meme";
  earlyAcceptScore: number;
  maxVariantCount: number;
  scoreWeights: ImagePolicyScoreWeights;
  mustAvoidProfiles: ImageMustAvoidProfile[];
};

const DEFAULT_MUST_AVOID = ["캡처", "일러스트", "합성", "로고", "워터마크", "썸네일"];
const BALANCED_MUST_AVOID = ["캡처", "로고", "워터마크"];

const PROFILE_REGISTRY_V1: Record<VisualIntent["profileId"], Omit<ImagePolicyProfile, "mustAvoidProfiles" | "variant">> = {
  politics: {
    id: "politics",
    searchIntent: "news",
    earlyAcceptScore: 62,
    maxVariantCount: 8,
    scoreWeights: {
      semantic: 35,
      entity: 30,
      freshness: 15,
      technical: 10,
      policy: 10,
    },
  },
  story: {
    id: "story",
    searchIntent: "meme",
    earlyAcceptScore: 40,
    maxVariantCount: 12,
    scoreWeights: {
      semantic: 45,
      entity: 10,
      freshness: 5,
      technical: 20,
      policy: 20,
    },
  },
  knowledge: {
    id: "knowledge",
    searchIntent: "news",
    earlyAcceptScore: 56,
    maxVariantCount: 10,
    scoreWeights: {
      semantic: 38,
      entity: 24,
      freshness: 12,
      technical: 14,
      policy: 12,
    },
  },
  product: {
    id: "product",
    searchIntent: "news",
    earlyAcceptScore: 54,
    maxVariantCount: 10,
    scoreWeights: {
      semantic: 36,
      entity: 22,
      freshness: 10,
      technical: 20,
      policy: 12,
    },
  },
  professional_service: {
    id: "professional_service",
    searchIntent: "news",
    earlyAcceptScore: 52,
    maxVariantCount: 12,
    scoreWeights: {
      semantic: 34,
      entity: 14,
      freshness: 6,
      technical: 18,
      policy: 28,
    },
  },
  generic: {
    id: "generic",
    searchIntent: "meme",
    earlyAcceptScore: 45,
    maxVariantCount: 10,
    scoreWeights: {
      semantic: 42,
      entity: 12,
      freshness: 8,
      technical: 20,
      policy: 18,
    },
  },
};

const PROFILE_REGISTRY_V2: Record<VisualIntent["profileId"], Omit<ImagePolicyProfile, "mustAvoidProfiles" | "variant">> = {
  politics: {
    id: "politics",
    searchIntent: "news",
    earlyAcceptScore: 64,
    maxVariantCount: 10,
    scoreWeights: {
      semantic: 33,
      entity: 34,
      freshness: 15,
      technical: 8,
      policy: 10,
    },
  },
  story: {
    id: "story",
    searchIntent: "meme",
    earlyAcceptScore: 42,
    maxVariantCount: 14,
    scoreWeights: {
      semantic: 42,
      entity: 12,
      freshness: 6,
      technical: 22,
      policy: 18,
    },
  },
  knowledge: {
    id: "knowledge",
    searchIntent: "news",
    earlyAcceptScore: 58,
    maxVariantCount: 12,
    scoreWeights: {
      semantic: 36,
      entity: 26,
      freshness: 12,
      technical: 14,
      policy: 12,
    },
  },
  product: {
    id: "product",
    searchIntent: "news",
    earlyAcceptScore: 56,
    maxVariantCount: 12,
    scoreWeights: {
      semantic: 34,
      entity: 24,
      freshness: 10,
      technical: 20,
      policy: 12,
    },
  },
  professional_service: {
    id: "professional_service",
    searchIntent: "news",
    earlyAcceptScore: 54,
    maxVariantCount: 14,
    scoreWeights: {
      semantic: 32,
      entity: 14,
      freshness: 6,
      technical: 18,
      policy: 30,
    },
  },
  generic: {
    id: "generic",
    searchIntent: "meme",
    earlyAcceptScore: 47,
    maxVariantCount: 12,
    scoreWeights: {
      semantic: 40,
      entity: 14,
      freshness: 8,
      technical: 20,
      policy: 18,
    },
  },
};

export function resolveImagePolicyVariant(rawValue?: string): ImagePolicyVariant {
  const raw = String(rawValue || process.env.STUDIO_IMAGE_POLICY_VARIANT || "").trim().toLowerCase();
  return raw === "v2" ? "v2" : "v1";
}

function buildMustAvoidProfiles(profileId: VisualIntent["profileId"], noFilter: boolean): ImageMustAvoidProfile[] {
  if (noFilter) {
    return [{ label: "relaxed", mustAvoid: [], minScore: 0 }];
  }

  if (profileId === "story" || profileId === "generic") {
    return [{ label: "relaxed", mustAvoid: [], minScore: 12 }];
  }

  if (profileId === "professional_service") {
    return [
      {
        label: "strict",
        mustAvoid: [...DEFAULT_MUST_AVOID, "광고", "배너", "상담", "문의", "전화번호"],
        minScore: 42,
      },
      {
        label: "balanced",
        mustAvoid: [...BALANCED_MUST_AVOID, "광고", "배너", "상담", "문의"],
        minScore: 34,
      },
      { label: "relaxed", mustAvoid: BALANCED_MUST_AVOID, minScore: 26 },
    ];
  }

  return [
    { label: "strict", mustAvoid: DEFAULT_MUST_AVOID, minScore: 35 },
    { label: "balanced", mustAvoid: BALANCED_MUST_AVOID, minScore: 30 },
    { label: "relaxed", mustAvoid: [], minScore: 24 },
  ];
}

export function resolveImagePolicyProfile(input: {
  intent: VisualIntent;
  noFilter: boolean;
  isCtaSlide: boolean;
}): ImagePolicyProfile {
  const variant = resolveImagePolicyVariant();
  const registry = variant === "v2" ? PROFILE_REGISTRY_V2 : PROFILE_REGISTRY_V1;
  const base = registry[input.intent.profileId] || registry.generic;
  const mustAvoidProfiles = buildMustAvoidProfiles(base.id, input.noFilter);
  if (input.isCtaSlide && !input.noFilter) {
    mustAvoidProfiles.push({
      label: "cta-relaxed",
      mustAvoid: [],
      minScore: Math.max(12, mustAvoidProfiles[mustAvoidProfiles.length - 1]?.minScore || 12),
    });
  }
  return {
    ...base,
    variant,
    searchIntent: input.intent.searchIntent,
    mustAvoidProfiles,
  };
}
