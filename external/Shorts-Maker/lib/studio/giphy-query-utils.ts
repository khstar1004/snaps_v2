import { buildConcreteVisualSearchCandidates, buildShortReactionSearchCandidates, normalizeMemeSearchPhrase } from "@/lib/studio/images/intent";
import { toEnglishHint } from "@/lib/studio/query-translation";
import type { ImageRequest } from "@/types/studio-json";

const GIPHY_REACTION_TOKENS = [
  "reaction",
  "meme",
  "face",
  "smile",
  "laugh",
  "stare",
  "wtf",
  "omg",
  "bruh",
  "facepalm",
  "shocked",
  "surprised",
  "awkward",
  "worried",
  "anxious",
  "scared",
  "terrified",
  "creepy",
  "horror",
  "angry",
  "furious",
  "laughing",
  "funny",
  "happy",
  "sad",
  "crying",
  "frustrated",
  "suspicious",
  "skeptical",
  "side eye",
  "deadpan",
  "serious",
  "stunned",
  "mind blown",
  "thinking",
  "speechless",
  "blank stare",
  "nervous laugh",
  "relieved",
  "smug",
  "confident",
  "money reaction",
];

const GIPHY_SEARCH_NOISE_TOKENS = new Set([
  "gif",
  "gifs",
  "giphy",
  "image",
  "images",
  "photo",
  "photos",
  "picture",
  "pictures",
  "scene",
  "scenes",
  "moment",
  "moments",
  "situation",
  "situations",
  "stock",
  "footage",
  "clip",
  "clips",
]);

const GIPHY_ALLOWED_PLANNER_TOKENS = new Set([
  "reaction",
  "meme",
  "face",
  "smile",
  "laugh",
  "stare",
  "blank",
  "side",
  "eye",
  "mind",
  "blown",
  "wtf",
  "omg",
  "bruh",
  "facepalm",
  "awkward",
  "embarrassed",
  "shocked",
  "surprised",
  "worried",
  "anxious",
  "scared",
  "terrified",
  "creepy",
  "horror",
  "angry",
  "furious",
  "annoyed",
  "laughing",
  "funny",
  "happy",
  "sad",
  "crying",
  "frustrated",
  "upset",
  "suspicious",
  "skeptical",
  "deadpan",
  "serious",
  "stunned",
  "thinking",
  "speechless",
  "relieved",
  "calm",
  "smug",
  "confident",
  "nervous",
  "panicked",
  "tired",
  "done",
  "with",
  "this",
  "buffering",
  "startled",
  "winning",
  "rich",
  "success",
  "fail",
  "mad",
  "rage",
  "excited",
  "celebration",
  "jealous",
  "envy",
  "disappointed",
  "sulking",
  "boss",
]);

const GIPHY_SUFFIX_FREE_REACTION_TOKENS = [
  "smile",
  "laugh",
  "stare",
  "facepalm",
  "meme",
  "reaction",
  "wtf",
  "omg",
  "bruh",
];

const GIPHY_BROLL_TOKENS = [
  "bank",
  "account",
  "book",
  "tax",
  "filing",
  "document",
  "documents",
  "paperwork",
  "legal",
  "consultation",
  "office",
  "desk",
  "reservation",
  "booking",
  "screen",
  "message",
  "table",
  "laptop",
  "computer",
  "photo",
];
const GIPHY_DISALLOWED_GENERIC_REACTION_PHRASES = new Set([
  "reaction",
  "meme",
  "serious reaction",
  "funny reaction",
  "meme reaction",
  "relatable reaction",
  "this reaction",
]);
export const DEFAULT_GIPHY_FALLBACK_REACTION_QUERIES = [
  "side eye reaction",
  "mind blown reaction",
  "nervous laugh",
  "blank stare reaction",
  "facepalm reaction",
  "worried reaction",
] as const;
const GIPHY_MULTIWORD_REACTION_PATTERNS: Array<{ tokens: string[]; normalized: string }> = [
  { tokens: ["side", "eye"], normalized: "side eye reaction" },
  { tokens: ["mind", "blown"], normalized: "mind blown reaction" },
  { tokens: ["blank", "stare"], normalized: "blank stare reaction" },
  { tokens: ["nervous", "laugh"], normalized: "nervous laugh" },
  { tokens: ["done", "with", "this"], normalized: "done with this reaction" },
];
const GIPHY_REACTION_SUFFIX_TOKENS = new Set(["reaction", "meme", "face"]);
export type GiphyReactionFamily =
  | "suspicious"
  | "meltdown"
  | "awkward"
  | "shock"
  | "frustration"
  | "deadpan"
  | "worry"
  | "anger"
  | "joy"
  | "sadness"
  | "money"
  | "fear";

type GiphyReactionFamilyRule = {
  family: GiphyReactionFamily;
  phrases: readonly string[];
  tokenSequences?: readonly (readonly string[])[];
  tokenHints: readonly string[];
};

const GIPHY_REACTION_FAMILY_RULES: readonly GiphyReactionFamilyRule[] = [
  {
    family: "suspicious",
    phrases: ["side eye reaction", "suspicious reaction", "skeptical reaction"],
    tokenSequences: [["side", "eye"]],
    tokenHints: ["suspicious", "skeptical"],
  },
  {
    family: "meltdown",
    phrases: ["mind blown reaction", "stunned reaction", "buffering reaction"],
    tokenSequences: [["mind", "blown"]],
    tokenHints: ["stunned", "buffering"],
  },
  {
    family: "awkward",
    phrases: ["awkward reaction", "cringe reaction", "nervous laugh", "embarrassed reaction", "flustered reaction"],
    tokenSequences: [["nervous", "laugh"]],
    tokenHints: ["awkward", "cringe", "embarrassed", "flustered"],
  },
  {
    family: "shock",
    phrases: ["shocked reaction", "surprised reaction", "omg reaction", "startled reaction"],
    tokenHints: ["shocked", "surprised", "surprise", "omg", "startled"],
  },
  {
    family: "frustration",
    phrases: ["facepalm reaction", "done with this reaction", "speechless reaction", "tired reaction", "wtf reaction", "bruh reaction"],
    tokenSequences: [["done", "with", "this"]],
    tokenHints: ["facepalm", "speechless", "tired", "wtf", "bruh"],
  },
  {
    family: "deadpan",
    phrases: ["deadpan reaction", "blank stare reaction", "serious reaction", "serious face reaction"],
    tokenSequences: [["blank", "stare"]],
    tokenHints: ["deadpan", "serious"],
  },
  {
    family: "worry",
    phrases: ["thinking reaction", "anxious reaction", "worried reaction", "nervous reaction", "panicked reaction"],
    tokenHints: ["thinking", "anxious", "worried", "nervous", "panicked", "sweating"],
  },
  {
    family: "anger",
    phrases: ["angry reaction", "mad reaction", "rage reaction", "furious reaction"],
    tokenHints: ["angry", "mad", "rage", "furious"],
  },
  {
    family: "joy",
    phrases: ["happy reaction", "excited reaction", "celebration reaction", "confident reaction", "winning reaction", "smug reaction"],
    tokenHints: ["happy", "excited", "celebration", "confident", "winning", "smug", "boss", "relieved", "calm"],
  },
  {
    family: "sadness",
    phrases: ["crying reaction", "sad reaction", "sobbing reaction", "disappointed reaction"],
    tokenHints: ["crying", "sad", "sobbing", "disappointed", "tearful"],
  },
  {
    family: "money",
    phrases: ["money reaction", "rich reaction", "success reaction"],
    tokenHints: ["money", "rich", "success"],
  },
  {
    family: "fear",
    phrases: ["scared reaction", "horror reaction", "creepy reaction", "terrified reaction"],
    tokenHints: ["scared", "horror", "creepy", "terrified", "fearful"],
  },
] as const;

function hasEnglishLetters(value: string): boolean {
  return /[a-z]/i.test(value);
}

function containsHangul(value: string): boolean {
  return /[가-힣]/u.test(value);
}

function dedupeValues(values: string[]): string[] {
  const deduped: string[] = [];
  for (const value of values) {
    const compact = value.trim();
    if (!compact) continue;
    if (!deduped.includes(compact)) deduped.push(compact);
  }
  return deduped;
}

function toEnglishOnly(values: string[]): string[] {
  return dedupeValues(
    values.filter((value) => {
      const compact = value.trim();
      return Boolean(compact) && hasEnglishLetters(compact) && !containsHangul(compact);
    })
  );
}

function hasOrderedTokens(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length <= 0 || haystack.length < needle.length) return false;
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    if (needle.every((token, index) => haystack[start + index] === token)) {
      return true;
    }
  }
  return false;
}

function canonicalizeGiphyReactionPhrase(value: string): string {
  let compact = value
    .toLowerCase()
    .replace(/\bmid blown\b/g, "mind blown")
    .replace(/\bmindblow?n\b/g, "mind blown")
    .replace(/\bsideeye\b/g, "side eye")
    .replace(/\bblankstare\b/g, "blank stare")
    .replace(/\bnervouslaugh\b/g, "nervous laugh")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact) return "";
  const tokens = compact
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !GIPHY_SEARCH_NOISE_TOKENS.has(token));
  if (tokens.length <= 0) return "";
  const allowedTokens = tokens.filter((token) => GIPHY_ALLOWED_PLANNER_TOKENS.has(token));
  const workingTokens = allowedTokens.length >= 2 ? allowedTokens : tokens;
  const workingCompact = workingTokens.join(" ");
  let normalizedFromPattern = "";
  for (const pattern of GIPHY_MULTIWORD_REACTION_PATTERNS) {
    if (hasOrderedTokens(workingTokens, pattern.tokens)) {
      normalizedFromPattern = pattern.normalized;
      break;
    }
  }
  if (normalizedFromPattern) {
    compact = normalizedFromPattern;
  } else {
    const meaningfulTokens = workingTokens.filter((token) => !GIPHY_REACTION_SUFFIX_TOKENS.has(token));
    const descriptor = meaningfulTokens[meaningfulTokens.length - 1] || meaningfulTokens[0] || "";
    if (descriptor && (workingTokens.includes("reaction") || workingTokens.includes("face"))) {
      compact = `${descriptor} reaction`;
    } else if (descriptor && workingTokens.includes("meme")) {
      compact = `${descriptor} meme`;
    } else {
      compact = workingCompact;
    }
  }
  const hasReactionCue = GIPHY_REACTION_TOKENS.some((token) => compact.includes(token));
  const hasSuffixFreeCue = GIPHY_SUFFIX_FREE_REACTION_TOKENS.some((token) => compact.includes(token));
  if (hasReactionCue && !hasSuffixFreeCue && !compact.includes("reaction")) {
    compact = `${compact} reaction`;
  }
  return compact.replace(/\s+/g, " ").trim();
}

export function isGiphySearchableQuery(value: string): boolean {
  const compact = canonicalizeGiphyReactionPhrase(normalizeMemeSearchPhrase(String(value || "").trim()));
  if (!compact || containsHangul(compact) || !hasEnglishLetters(compact)) return false;
  const hasBrollCue = GIPHY_BROLL_TOKENS.some((token) => compact.includes(token));
  if (hasBrollCue) return false;
  const hasReactionCue = GIPHY_REACTION_TOKENS.some((token) => compact.includes(token));
  if (hasReactionCue) return true;
  return compact.split(/\s+/).filter(Boolean).length <= 2;
}

export function normalizeGiphySearchQuery(value: string): string {
  return canonicalizeGiphyReactionPhrase(normalizeMemeSearchPhrase(String(value || "").trim()));
}

export function inferGiphyReactionFamily(value: string): GiphyReactionFamily | undefined {
  const compact = normalizeGiphySearchQuery(value);
  if (!compact) return undefined;
  const tokens = compact.split(/\s+/).filter(Boolean);
  for (const rule of GIPHY_REACTION_FAMILY_RULES) {
    if (rule.phrases.some((phrase) => compact.includes(phrase))) return rule.family;
    if (rule.tokenSequences?.some((tokenSequence) => hasOrderedTokens(tokens, tokenSequence))) return rule.family;
    if (rule.tokenHints.some((token) => tokens.includes(token))) return rule.family;
  }
  return undefined;
}

export function sanitizeTrustedGiphyPlannerQuery(value: string): string {
  const compact = normalizeGiphySearchQuery(value);
  if (!compact || containsHangul(compact) || !hasEnglishLetters(compact)) return "";
  if (GIPHY_DISALLOWED_GENERIC_REACTION_PHRASES.has(compact)) return "";
  const tokens = compact.split(/\s+/).filter(Boolean);
  if (tokens.length <= 0 || tokens.length > 4) return "";
  if (tokens.length === 1) return "";
  if (GIPHY_BROLL_TOKENS.some((token) => compact.includes(token))) return "";
  if (!GIPHY_REACTION_TOKENS.some((token) => compact.includes(token))) return "";
  if (tokens.some((token) => !GIPHY_ALLOWED_PLANNER_TOKENS.has(token))) return "";
  return compact;
}

export function dedupeGiphyQueriesByFamily(
  values: string[],
  options?: { limit?: number; sanitize?: boolean }
): string[] {
  const deduped: string[] = [];
  const seenQueries = new Set<string>();
  const seenFamilies = new Set<string>();
  for (const value of values) {
    const compact = options?.sanitize === false ? normalizeGiphySearchQuery(value) : sanitizeTrustedGiphyPlannerQuery(value);
    if (!compact || seenQueries.has(compact)) continue;
    const family = inferGiphyReactionFamily(compact);
    if (family && seenFamilies.has(family)) continue;
    seenQueries.add(compact);
    if (family) seenFamilies.add(family);
    deduped.push(compact);
    if (options?.limit && deduped.length >= options.limit) break;
  }
  return deduped;
}

export function buildGiphyFallbackQueriesFromRequest(request: ImageRequest): string[] {
  const values = [request.query, ...(request.queryCandidates || []), request.scene || ""]
    .map((value) => normalizeGiphySearchQuery(String(value || "").trim()))
    .filter(Boolean);
  const reactionCandidates = buildShortReactionSearchCandidates(values);
  const translatedReactions = reactionCandidates.map((value) => toEnglishHint(value)).filter(Boolean);
  const prioritized = dedupeGiphyQueriesByFamily(
    toEnglishOnly([
      ...reactionCandidates,
      ...translatedReactions,
    ])
      .map((value) => normalizeGiphySearchQuery(value))
      .filter(isGiphySearchableQuery),
    { limit: 6, sanitize: true }
  );
  if (prioritized.length > 0) return prioritized.slice(0, 6);
  const moodFallbacks = buildConcreteVisualSearchCandidates(values)
    .map((value) => toEnglishHint(value))
    .filter((value) => isGiphySearchableQuery(`${value} reaction`))
    .map((value) => normalizeGiphySearchQuery(`${value} reaction`));
  if (moodFallbacks.length > 0) {
    return dedupeGiphyQueriesByFamily(toEnglishOnly(moodFallbacks), { limit: 6, sanitize: true }).slice(0, 6);
  }
  return dedupeGiphyQueriesByFamily([...DEFAULT_GIPHY_FALLBACK_REACTION_QUERIES], { limit: 6, sanitize: true });
}
