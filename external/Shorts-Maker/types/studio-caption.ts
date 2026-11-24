export type StudioCaptionStylePresetId = "neon-pink" | "flame-gold" | "bubble-pink" | "bold-yellow";
export type StudioCaptionAnimationPresetId = "pop" | "slide-up" | "bounce" | "pulse";
export type StudioCaptionExitPresetId = "none" | "fade" | "shrink" | "slide-down";
export type StudioCaptionAutoProfileId = "off" | "hook" | "reaction" | "news";
export type StudioCaptionAutoCueTag = "plain" | "hook" | "shock" | "reaction" | "warm" | "closing";
export type StudioCaptionAutoCueAnalysis = {
  tag: StudioCaptionAutoCueTag;
  emphasis: number;
  highlightWords: string[];
};
export type StudioCaptionCueOverrides = {
  style?: StudioCaptionStylePresetId;
  animation?: StudioCaptionAnimationPresetId;
  exitAnimation?: StudioCaptionExitPresetId;
  autoTag?: StudioCaptionAutoCueTag;
  emphasis?: number;
  highlightWords?: string[];
  scale?: number;
  durationSec?: number;
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  glow?: number;
  align?: "left" | "center";
  y?: number;
  background?: string;
};

export type StudioCaptionCue = {
  text: string;
  overrides: StudioCaptionCueOverrides;
};

export const STUDIO_CAPTION_STYLE_PRESET_OPTIONS: Array<{ value: StudioCaptionStylePresetId; label: string }> = [
  { value: "neon-pink", label: "네온 핑크" },
  { value: "flame-gold", label: "불꽃 골드" },
  { value: "bubble-pink", label: "버블 핑크" },
  { value: "bold-yellow", label: "볼드 옐로우" },
];

export const STUDIO_CAPTION_ANIMATION_PRESET_OPTIONS: Array<{ value: StudioCaptionAnimationPresetId; label: string }> = [
  { value: "pop", label: "팝" },
  { value: "slide-up", label: "슬라이드 업" },
  { value: "bounce", label: "바운스" },
  { value: "pulse", label: "펄스" },
];

export const STUDIO_CAPTION_EXIT_PRESET_OPTIONS: Array<{ value: StudioCaptionExitPresetId; label: string }> = [
  { value: "none", label: "없음" },
  { value: "fade", label: "페이드 아웃" },
  { value: "shrink", label: "축소 퇴장" },
  { value: "slide-down", label: "슬라이드 다운" },
];

export const STUDIO_CAPTION_AUTO_PROFILE_OPTIONS: Array<{ value: StudioCaptionAutoProfileId; label: string }> = [
  { value: "off", label: "수동 전용" },
  { value: "hook", label: "후킹형 자동" },
  { value: "reaction", label: "리액션형 자동" },
  { value: "news", label: "정보형 자동" },
];

export const STUDIO_CAPTION_AUTO_CUE_TAG_OPTIONS: Array<{ value: StudioCaptionAutoCueTag; label: string }> = [
  { value: "plain", label: "일반" },
  { value: "hook", label: "후킹" },
  { value: "shock", label: "충격" },
  { value: "reaction", label: "리액션" },
  { value: "warm", label: "감성" },
  { value: "closing", label: "마무리" },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const CSS_COLOR_KEYWORD_RE = /^(?:transparent|currentcolor|inherit|initial|unset|black|white|red|green|blue|yellow|orange|pink|purple|gray|grey|cyan|magenta)$/i;
const CSS_HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const CSS_FUNCTION_COLOR_RE = /^(?:rgb|rgba|hsl|hsla|color)\((?:[^()]|\([^()]*\))*\)$/i;
const CSS_VARIABLE_COLOR_RE = /^var\(--[a-zA-Z0-9-_]+\)$/;
const CSS_GRADIENT_RE = /^(?:linear|radial|conic)-gradient\((?:[^()]|\([^()]*\))*\)$/i;

function normalizeCaptionColor(value: string | undefined): string | undefined {
  const trimmed = String(value || "").trim();
  if (!trimmed) return undefined;
  if (
    CSS_HEX_COLOR_RE.test(trimmed) ||
    CSS_FUNCTION_COLOR_RE.test(trimmed) ||
    CSS_VARIABLE_COLOR_RE.test(trimmed) ||
    CSS_COLOR_KEYWORD_RE.test(trimmed)
  ) {
    return trimmed;
  }
  return undefined;
}

function normalizeCaptionBackground(value: string | undefined): string | undefined {
  const trimmed = String(value || "").trim();
  if (!trimmed) return undefined;
  if (trimmed === "none" || CSS_GRADIENT_RE.test(trimmed)) {
    return trimmed;
  }
  return normalizeCaptionColor(trimmed);
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const words = value.map((word) => String(word || "").trim()).filter(Boolean);
  return words.length > 0 ? words : undefined;
}

function tokenizeCaptionOverridePart(value: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let parenDepth = 0;

  for (const char of value) {
    if (char === "(") {
      parenDepth += 1;
      current += char;
      continue;
    }
    if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      current += char;
      continue;
    }
    if ((/\s/.test(char) || char === ";" || char === ",") && parenDepth === 0) {
      const token = current.trim();
      if (token) tokens.push(token);
      current = "";
      continue;
    }
    current += char;
  }

  const tail = current.trim();
  if (tail) tokens.push(tail);
  return tokens;
}

export function normalizeStudioCaptionCueOverrides(value: unknown): StudioCaptionCueOverrides {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const style = row.style;
  const animation = row.animation;
  const exitAnimation = row.exitAnimation;
  const autoTag = row.autoTag;
  const emphasis = Number(row.emphasis);
  const scale = Number(row.scale);
  const durationSec = Number(row.durationSec);
  const strokeWidth = Number(row.strokeWidth);
  const glow = Number(row.glow);
  const y = Number(row.y);
  const align = String(row.align || "").trim();

  return {
    style: style === "neon-pink" || style === "flame-gold" || style === "bubble-pink" || style === "bold-yellow" ? style : undefined,
    animation: animation === "pop" || animation === "slide-up" || animation === "bounce" || animation === "pulse" ? animation : undefined,
    exitAnimation:
      exitAnimation === "none" || exitAnimation === "fade" || exitAnimation === "shrink" || exitAnimation === "slide-down"
        ? exitAnimation
        : undefined,
    autoTag: autoTag === "plain" || autoTag === "hook" || autoTag === "shock" || autoTag === "reaction" || autoTag === "warm" || autoTag === "closing" ? autoTag : undefined,
    emphasis: Number.isFinite(emphasis) ? clamp(emphasis, 0, 1) : undefined,
    highlightWords: normalizeStringArray(row.highlightWords),
    scale: Number.isFinite(scale) ? clamp(scale, 0.6, 1.8) : undefined,
    durationSec: Number.isFinite(durationSec) ? clamp(durationSec, 0.2, 6) : undefined,
    color: normalizeCaptionColor(typeof row.color === "string" ? row.color : undefined),
    strokeColor: normalizeCaptionColor(typeof row.strokeColor === "string" ? row.strokeColor : undefined),
    strokeWidth: Number.isFinite(strokeWidth) ? clamp(strokeWidth, 0, 8) : undefined,
    glow: Number.isFinite(glow) ? clamp(glow, 0, 1) : undefined,
    align: align === "left" || align === "center" ? align : undefined,
    y: Number.isFinite(y) ? clamp(y, 18, 82) : undefined,
    background: normalizeCaptionBackground(typeof row.background === "string" ? row.background : undefined),
  };
}

export function parseStudioCaptionCueLine(line: string): StudioCaptionCue {
  const rawLine = String(line || "").trim();
  if (!rawLine) {
    return { text: "", overrides: {} };
  }

  const [textPart, overridePart] = rawLine.split("||", 2);
  const text = String(textPart || "").trim() || rawLine;
  if (!overridePart) {
    return { text, overrides: {} };
  }

  const overrides: StudioCaptionCueOverrides = {};
  const tokens = tokenizeCaptionOverridePart(overridePart);

  for (const token of tokens) {
    const dividerIndex = token.includes("=") ? token.indexOf("=") : token.indexOf(":");
    if (dividerIndex <= 0) continue;
    const key = token.slice(0, dividerIndex).trim().toLowerCase();
    const value = token.slice(dividerIndex + 1).trim();
    if (!value) continue;

    if (key === "style" || key === "preset") {
      if (value === "neon-pink" || value === "flame-gold" || value === "bubble-pink" || value === "bold-yellow") {
        overrides.style = value;
      }
      continue;
    }

    if (key === "anim" || key === "animation") {
      if (value === "pop" || value === "slide-up" || value === "bounce" || value === "pulse") {
        overrides.animation = value;
      }
      continue;
    }

    if (key === "exit" || key === "exitanim" || key === "exitanimation") {
      if (value === "none" || value === "fade" || value === "shrink" || value === "slide-down") {
        overrides.exitAnimation = value;
      }
      continue;
    }

    if (key === "tag" || key === "autotag") {
      if (value === "plain" || value === "hook" || value === "shock" || value === "reaction" || value === "warm" || value === "closing") {
        overrides.autoTag = value;
      }
      continue;
    }

    if (key === "em" || key === "emphasis") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) overrides.emphasis = clamp(parsed, 0, 1);
      continue;
    }

    if (key === "hl" || key === "highlight" || key === "highlightwords") {
      const words = value
        .split("|")
        .map((word) => word.trim())
        .filter(Boolean);
      if (words.length > 0) overrides.highlightWords = words;
      continue;
    }

    if (key === "scale") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) overrides.scale = clamp(parsed, 0.6, 1.8);
      continue;
    }

    if (key === "dur" || key === "duration" || key === "durationsec") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) overrides.durationSec = clamp(parsed, 0.2, 6);
      continue;
    }

    if (key === "color") {
      overrides.color = normalizeCaptionColor(value);
      continue;
    }

    if (key === "stroke" || key === "strokecolor") {
      overrides.strokeColor = normalizeCaptionColor(value);
      continue;
    }

    if (key === "strokewidth" || key === "stroke-width") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) overrides.strokeWidth = clamp(parsed, 0, 8);
      continue;
    }

    if (key === "glow") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) overrides.glow = clamp(parsed, 0, 1);
      continue;
    }

    if (key === "align") {
      if (value === "left" || value === "center") overrides.align = value;
      continue;
    }

    if (key === "y") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) overrides.y = clamp(parsed, 18, 82);
      continue;
    }

    if (key === "bg" || key === "background") {
      overrides.background = normalizeCaptionBackground(value);
    }
  }

  return { text, overrides: normalizeStudioCaptionCueOverrides(overrides) };
}

export function analyzeStudioCaptionAutoCue({
  text,
  cueIndex,
  cueCount,
}: {
  text: string;
  cueIndex: number;
  cueCount: number;
}): StudioCaptionAutoCueAnalysis {
  const normalizedText = String(text || "").trim();
  if (!normalizedText) {
    return { tag: "plain", emphasis: 0, highlightWords: [] };
  }

  const hasStrongPunctuation = /[!?！？]/.test(normalizedText);
  const hasShockWord = /(헉|실화|레전드|미쳤|충격|반전|대박|치-됐|됐다|됐어요|말도안|소름)/.test(normalizedText);
  const hasReactionWord = /(반응|댓글|논란|표정|웃음|터졌|난리|당황)/.test(normalizedText);
  const hasWarmWord = /(좋아|사랑|하트|귀여|핑크|설렘|행복|로맨틱)/.test(normalizedText);
  const hasClosingWord = /(결론|정리|마무리|요약|결국|마지막|포인트)/.test(normalizedText);
  const isShortHook = normalizedText.length <= 12;
  const isFirstCue = cueIndex === 0;
  const isLastCue = cueIndex === cueCount - 1;
  const words = normalizedText
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const longestWord = words.reduce((best, word) => (word.length > best.length ? word : best), "");
  const lastWord = words[words.length - 1] || normalizedText;
  const firstWord = words[0] || normalizedText;
  const shockWordMatch = normalizedText.match(/(헉|실화|레전드|미쳤|충격|반전|대박|소름|치-됐어요|치-됐|됐어요|됐다)/);
  const warmWordMatch = normalizedText.match(/(좋아|사랑|하트|귀여|핑크|설렘|행복|로맨틱)/);
  const reactionWordMatch = normalizedText.match(/(반응|댓글|논란|표정|웃음|터졌|난리|당황)/);
  const closingWordMatch = normalizedText.match(/(결론|정리|마무리|요약|결국|마지막|포인트)/);

  if (hasShockWord || (hasStrongPunctuation && isShortHook)) {
    return {
      tag: "shock",
      emphasis: 1,
      highlightWords: [shockWordMatch?.[0] || longestWord || normalizedText].filter(Boolean),
    };
  }
  if (hasWarmWord) {
    return {
      tag: "warm",
      emphasis: 0.72,
      highlightWords: [warmWordMatch?.[0] || longestWord || normalizedText].filter(Boolean),
    };
  }
  if (hasReactionWord) {
    return {
      tag: "reaction",
      emphasis: 0.78,
      highlightWords: [reactionWordMatch?.[0] || longestWord || normalizedText].filter(Boolean),
    };
  }
  if (hasClosingWord || isLastCue) {
    return {
      tag: "closing",
      emphasis: 0.58,
      highlightWords: [closingWordMatch?.[0] || lastWord].filter(Boolean),
    };
  }
  if (isFirstCue || isShortHook) {
    return {
      tag: "hook",
      emphasis: 0.84,
      highlightWords: [firstWord || normalizedText].filter(Boolean),
    };
  }
  return {
    tag: "plain",
    emphasis: 0.4,
    highlightWords: [longestWord || normalizedText].filter(Boolean),
  };
}

export function resolveStudioCaptionCueAnalysis({
  text,
  cueIndex,
  cueCount,
  overrides,
}: {
  text: string;
  cueIndex: number;
  cueCount: number;
  overrides?: StudioCaptionCueOverrides | null;
}): StudioCaptionAutoCueAnalysis {
  const analyzed = analyzeStudioCaptionAutoCue({ text, cueIndex, cueCount });
  return {
    tag: overrides?.autoTag || analyzed.tag,
    emphasis: typeof overrides?.emphasis === "number" ? clamp(overrides.emphasis, 0, 1) : analyzed.emphasis,
    highlightWords:
      Array.isArray(overrides?.highlightWords) && overrides.highlightWords.length > 0
        ? overrides.highlightWords.map((word) => String(word || "").trim()).filter(Boolean)
        : analyzed.highlightWords,
  };
}

export function applyStudioCaptionAutoMetadata(cues: StudioCaptionCue[]): StudioCaptionCue[] {
  const safeCues = Array.isArray(cues) ? cues : [];
  return safeCues.map((cue, cueIndex) => {
    const analysis = analyzeStudioCaptionAutoCue({
      text: cue.text,
      cueIndex,
      cueCount: safeCues.length,
    });
    return {
      text: cue.text,
      overrides: {
        ...normalizeStudioCaptionCueOverrides(cue.overrides),
        autoTag: analysis.tag,
        emphasis: analysis.emphasis,
        highlightWords: analysis.highlightWords,
      },
    };
  });
}

export function formatStudioCaptionCueLine(cue: StudioCaptionCue): string {
  const text = String(cue.text || "").trim();
  const overrides = normalizeStudioCaptionCueOverrides(cue.overrides);
  const tokens: string[] = [];
  if (overrides.style) tokens.push(`style=${overrides.style}`);
  if (overrides.animation) tokens.push(`anim=${overrides.animation}`);
  if (overrides.exitAnimation) tokens.push(`exit=${overrides.exitAnimation}`);
  if (overrides.autoTag) tokens.push(`tag=${overrides.autoTag}`);
  if (typeof overrides.emphasis === "number") tokens.push(`em=${overrides.emphasis}`);
  if (Array.isArray(overrides.highlightWords) && overrides.highlightWords.length > 0) {
    tokens.push(`hl=${overrides.highlightWords.join("|")}`);
  }
  if (typeof overrides.scale === "number") tokens.push(`scale=${overrides.scale}`);
  if (typeof overrides.durationSec === "number") tokens.push(`dur=${overrides.durationSec}`);
  if (overrides.color) tokens.push(`color=${overrides.color}`);
  if (overrides.strokeColor) tokens.push(`stroke=${overrides.strokeColor}`);
  if (typeof overrides.strokeWidth === "number") tokens.push(`strokeWidth=${overrides.strokeWidth}`);
  if (typeof overrides.glow === "number") tokens.push(`glow=${overrides.glow}`);
  if (overrides.align) tokens.push(`align=${overrides.align}`);
  if (typeof overrides.y === "number") tokens.push(`y=${overrides.y}`);
  if (overrides.background) tokens.push(`bg=${overrides.background}`);
  if (!tokens.length) return text;
  return `${text} || ${tokens.join(" ")}`.trim();
}

export function formatStudioCaptionCueLines(cues: StudioCaptionCue[]): string[] {
  return (Array.isArray(cues) ? cues : [])
    .map((cue) => formatStudioCaptionCueLine(cue))
    .map((line) => line.trim())
    .filter(Boolean);
}

export function buildAutoCaptionCueOverrides({
  text,
  cueIndex,
  cueCount,
  profile,
  intensity,
  analysis,
}: {
  text: string;
  cueIndex: number;
  cueCount: number;
  profile: StudioCaptionAutoProfileId;
  intensity: number;
  analysis?: StudioCaptionAutoCueAnalysis;
}): StudioCaptionCueOverrides {
  const normalizedText = String(text || "").trim();
  if (!normalizedText || profile === "off") {
    return {};
  }

  const safeIntensity = clamp(intensity, 0, 1);
  const autoCue =
    analysis ||
    analyzeStudioCaptionAutoCue({
      text: normalizedText,
      cueIndex,
      cueCount,
    });
  const autoIntensity = clamp(safeIntensity * (0.72 + autoCue.emphasis * 0.45), 0, 1);

  if (profile === "news") {
    return {
      style: autoCue.tag === "shock" ? "flame-gold" : cueIndex === 0 ? "bold-yellow" : "neon-pink",
      animation: autoCue.tag === "shock" ? "bounce" : cueIndex === 0 ? "slide-up" : "pop",
      exitAnimation: autoCue.tag === "closing" ? "fade" : "none",
      scale: 1 + autoIntensity * (cueIndex === 0 ? 0.12 : 0.06),
      glow: 0.28 + autoIntensity * 0.18,
      align: "center",
    };
  }

  if (profile === "reaction") {
    return {
      style:
        autoCue.tag === "warm"
          ? "bubble-pink"
          : autoCue.tag === "shock"
            ? "flame-gold"
            : autoCue.tag === "closing"
              ? "bold-yellow"
              : "neon-pink",
      animation: autoCue.tag === "shock" || autoCue.tag === "hook" ? "bounce" : "pulse",
      exitAnimation: autoCue.tag === "closing" ? "fade" : "shrink",
      scale: 1 + autoIntensity * (autoCue.tag === "hook" || autoCue.tag === "shock" ? 0.22 : 0.12),
      glow: 0.52 + autoIntensity * 0.28,
      strokeWidth: autoCue.tag === "shock" ? 2 : 1,
    };
  }

  return {
    style:
      autoCue.tag === "warm"
        ? "bubble-pink"
        : autoCue.tag === "shock"
          ? "flame-gold"
          : autoCue.tag === "hook"
            ? "bold-yellow"
            : "neon-pink",
    animation:
      autoCue.tag === "shock"
        ? "bounce"
        : autoCue.tag === "reaction"
          ? "pulse"
          : autoCue.tag === "hook"
            ? "pop"
            : "slide-up",
    exitAnimation: autoCue.tag === "closing" ? "fade" : "shrink",
    scale: 1 + autoIntensity * (autoCue.tag === "hook" ? 0.18 : autoCue.tag === "shock" ? 0.16 : 0.08),
    glow: 0.46 + autoIntensity * 0.28,
    y: autoCue.tag === "hook" ? 46 : undefined,
    align: "center",
  };
}

export function getStudioCaptionStylePreset(style: StudioCaptionStylePresetId) {
  if (style === "flame-gold") {
    return {
      color: "#fff8d1",
      glowColor: "255,208,74",
      shadowColor: "#7c2d12",
      strokeWidth: 2,
      strokeColor: "#92400e",
      padding: "0.06em 0.18em",
      borderRadius: "0.22em",
      background: "linear-gradient(180deg, rgba(255,115,0,0.18), rgba(255,196,0,0.22))",
    } as const;
  }
  if (style === "bubble-pink") {
    return {
      color: "#fff5fb",
      glowColor: "255,105,180",
      shadowColor: "#ec4899",
      strokeWidth: 2,
      strokeColor: "#ec4899",
      padding: "0.08em 0.2em",
      borderRadius: "0.3em",
      background: "rgba(255,255,255,0.08)",
    } as const;
  }
  if (style === "bold-yellow") {
    return {
      color: "#facc15",
      glowColor: "250,204,21",
      shadowColor: "#111827",
      strokeWidth: 1,
      strokeColor: "#111827",
      padding: "0.02em 0.08em",
      borderRadius: "0.16em",
      background: "transparent",
    } as const;
  }
  return {
    color: "#fff7fb",
    glowColor: "255,105,180",
    shadowColor: "rgba(0,0,0,0.58)",
    strokeWidth: 1,
    strokeColor: "#ffffff",
    padding: "0.04em 0.12em",
    borderRadius: "0.2em",
    background: "transparent",
  } as const;
}
