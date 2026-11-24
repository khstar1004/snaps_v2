import test from "node:test";
import assert from "node:assert/strict";
import { resolveEffectiveIntent } from "./effective-intent";
import { resolveProviderOrder } from "./provider-order";
import type { ImageProviderId, ImageRequest } from "@/types/studio-json";
import type { VisualIntent } from "@/lib/studio/images/intent";

const request: ImageRequest = {
  query: "funny reaction face",
};

const configuredProviders: ImageProviderId[] = ["giphy", "naver", "pexels", "pixabay", "openverse", "wikimedia"];

test("preferred giphy provider is locked without naver fallback", () => {
  const providers = resolveProviderOrder("news", { ...request, preferredProviders: ["giphy"] }, configuredProviders, "auto", {
    preferGiphy: true,
    allowGiphy: true,
  });
  assert.deepEqual(providers, ["giphy"]);
});

test("preferred naver provider is locked without giphy fallback", () => {
  const providers = resolveProviderOrder("meme", { ...request, preferredProviders: ["naver"] }, configuredProviders, "auto", {
    preferGiphy: true,
    allowGiphy: true,
  });
  assert.deepEqual(providers, ["naver"]);
});

test("giphy can be suppressed even when preferred", () => {
  const providers = resolveProviderOrder("news", { ...request, preferredProviders: ["giphy"] }, configuredProviders, "auto", {
    preferGiphy: false,
    allowGiphy: false,
  });
  assert.deepEqual(providers, ["naver"]);
  assert.equal(providers.includes("giphy"), false);
});

test("news intent without provider hint keeps naver ahead of giphy", () => {
  const providers = resolveProviderOrder("news", request, configuredProviders, "auto");
  assert.deepEqual(providers, ["naver", "giphy"]);
});

test("preferred giphy provider converts professional service intent to meme", () => {
  const intent: VisualIntent = {
    profileId: "professional_service",
    category: "경제",
    searchIntent: "news",
    sceneHint: "세금 서류",
    entityHints: [],
    freshnessDays: 21,
    facePolicy: "avoid",
    generationFallback: "low-score-only",
  };

  const next = resolveEffectiveIntent(intent, { preferredProviders: ["giphy"] }, "auto");
  assert.equal(next.searchIntent, "meme");
});

test("preferred naver provider keeps politics intent as news", () => {
  const intent: VisualIntent = {
    profileId: "politics",
    category: "정치",
    searchIntent: "news",
    sceneHint: "국회 회의장",
    entityHints: [],
    freshnessDays: 7,
    facePolicy: "strict",
    generationFallback: "low-score-only",
  };

  const next = resolveEffectiveIntent(intent, { preferredProviders: ["naver"] }, "fun");
  assert.equal(next.searchIntent, "news");
});

test("crawl mode alone no longer forces meme intent", () => {
  const intent: VisualIntent = {
    profileId: "professional_service",
    category: "경제",
    searchIntent: "news",
    sceneHint: "세금 서류",
    entityHints: [],
    freshnessDays: 21,
    facePolicy: "avoid",
    generationFallback: "low-score-only",
  };

  const next = resolveEffectiveIntent(intent, undefined, "fun");
  assert.equal(next.searchIntent, "news");
});
