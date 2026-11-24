import assert from "node:assert/strict";
import test from "node:test";
import {
  addStudioImageCandidateToSlides,
  applyStudioImageCandidateToSlides,
  buildStudioLibraryImageCandidate,
  STUDIO_AUTO_APPLIED_SELECTION_REASON,
} from "./image-candidate-approval";
import type { ImageSelectionCandidate, PreparedSlide } from "@/types/studio-json";

function linkedByGroup(slides: PreparedSlide[], index: number): Set<number> {
  const groupId = slides[index]?.groupId;
  return new Set(slides.map((slide, slideIndex) => (slide.groupId === groupId ? slideIndex : -1)).filter((slideIndex) => slideIndex >= 0));
}

test("addStudioImageCandidateToSlides prepends generated library candidates without replacing approved media", () => {
  const candidate = buildStudioLibraryImageCandidate({
    assetId: "asset-new",
    imageUrl: "https://cdn.example.com/new.png",
    title: "새 후보",
  });
  assert.ok(candidate);

  const slides: PreparedSlide[] = [
    {
      title: "묶음 1",
      text: "첫 줄",
      lines: ["첫 줄"],
      layout: "photo+body",
      groupId: 1,
      imageUrl: "https://cdn.example.com/approved.png",
      resolvedImageUrl: "https://cdn.example.com/approved.png",
      resolvedBy: "crawl",
      imageSelection: {
        intent: "news",
        queryCandidates: ["old"],
        selectedQuery: "old",
        provider: "naver",
        providerCandidates: ["naver"],
        candidateOptions: [
          {
            provider: "naver",
            candidateId: "approved",
            imageUrl: "https://cdn.example.com/approved.png",
          },
        ],
        selectedCandidateId: "approved",
        selectionReason: "automatic provider selection: naver",
      },
    },
    {
      title: "묶음 1",
      text: "둘째 줄",
      lines: ["둘째 줄"],
      layout: "photo+body",
      groupId: 1,
      imageUrl: "https://cdn.example.com/approved.png",
      resolvedImageUrl: "https://cdn.example.com/approved.png",
      resolvedBy: "crawl",
      imageSelection: {
        intent: "news",
        queryCandidates: ["old"],
        selectedCandidateId: "approved",
      },
    },
  ];

  const next = addStudioImageCandidateToSlides({
    slides,
    index: 0,
    getLinkedSlideIndexes: linkedByGroup,
    candidate,
  });

  assert.equal(next[0]?.imageUrl, "https://cdn.example.com/approved.png");
  assert.equal(next[0]?.resolvedBy, "crawl");
  assert.equal(next[0]?.imageSelection?.provider, "naver");
  assert.deepEqual(next[0]?.imageSelection?.providerCandidates, ["naver"]);
  assert.equal(next[0]?.imageSelection?.selectedCandidateId, "approved");
  assert.equal(next[0]?.imageSelection?.selectionReason, "automatic provider selection: naver");
  assert.equal(next[0]?.imageSelection?.candidateOptions?.[0]?.candidateId, "asset-new");
  assert.equal(next[1]?.imageUrl, "https://cdn.example.com/approved.png");
  assert.equal(next[1]?.imageSelection?.candidateOptions?.[0]?.candidateId, "asset-new");
});

test("addStudioImageCandidateToSlides keeps the selected tail candidate visible inside the limit", () => {
  const nextCandidate = buildStudioLibraryImageCandidate({
    assetId: "asset-new",
    imageUrl: "https://cdn.example.com/new.png",
  });
  assert.ok(nextCandidate);

  const next = addStudioImageCandidateToSlides({
    slides: [
      {
        title: "후보 많음",
        text: "본문",
        lines: ["본문"],
        layout: "photo+body",
        groupId: 4,
        imageUrl: "https://cdn.example.com/selected.png",
        resolvedImageUrl: "https://cdn.example.com/selected.png",
        resolvedBy: "direct",
        imageSelection: {
          intent: "library",
          queryCandidates: [],
          provider: "library",
          providerCandidates: ["library"],
          selectedCandidateId: "asset-selected",
          candidateOptions: [
            { provider: "library", candidateId: "asset-old-1", imageUrl: "https://cdn.example.com/old-1.png" },
            { provider: "library", candidateId: "asset-old-2", imageUrl: "https://cdn.example.com/old-2.png" },
            { provider: "library", candidateId: "asset-selected", imageUrl: "https://cdn.example.com/selected.png" },
          ],
        },
      },
    ],
    index: 0,
    getLinkedSlideIndexes: linkedByGroup,
    candidate: nextCandidate,
  });

  assert.deepEqual(
    next[0]?.imageSelection?.candidateOptions?.map((candidate) => candidate.candidateId),
    ["asset-new", "asset-old-1", "asset-selected"]
  );
});

test("addStudioImageCandidateToSlides stores candidates for missing-image slides without selecting them", () => {
  const candidate = buildStudioLibraryImageCandidate({
    assetId: "asset-missing",
    imageUrl: "https://cdn.example.com/missing-candidate.png",
  });
  assert.ok(candidate);

  const next = addStudioImageCandidateToSlides({
    slides: [
      {
        title: "이미지 없음",
        text: "본문",
        lines: ["본문"],
        layout: "photo+body",
        groupId: 2,
      },
    ],
    index: 0,
    getLinkedSlideIndexes: linkedByGroup,
    candidate,
  });

  assert.equal(next[0]?.imageUrl, undefined);
  assert.equal(next[0]?.resolvedImageUrl, undefined);
  assert.equal(next[0]?.resolvedBy, undefined);
  assert.equal(next[0]?.imageSelection?.provider, undefined);
  assert.equal(next[0]?.imageSelection?.selectedCandidateId, undefined);
  assert.equal(next[0]?.imageSelection?.candidateOptions?.[0]?.candidateId, "asset-missing");
});

test("applyStudioImageCandidateToSlides applies only after explicit approval and maps provenance", () => {
  const libraryCandidate: ImageSelectionCandidate = {
    provider: "library",
    candidateId: "asset-approved",
    imageUrl: "https://cdn.example.com/approved-library.png",
    title: "라이브러리 후보",
  };
  const crawlCandidate: ImageSelectionCandidate = {
    provider: "giphy",
    candidateId: "giphy-approved",
    imageUrl: "https://media.giphy.com/media/example/giphy.gif",
    mediaUrl: "https://media.giphy.com/media/example/giphy.gif",
    mediaKind: "animated_image",
    title: "GIPHY 후보",
  };

  const baseSlides: PreparedSlide[] = [
    {
      title: "묶음 1",
      text: "첫 줄",
      lines: ["첫 줄"],
      layout: "photo+body",
      groupId: 3,
    },
    {
      title: "묶음 1",
      text: "둘째 줄",
      lines: ["둘째 줄"],
      layout: "photo+body",
      groupId: 3,
    },
  ];

  const libraryApproved = applyStudioImageCandidateToSlides({
    slides: baseSlides,
    index: 0,
    getLinkedSlideIndexes: linkedByGroup,
    candidate: libraryCandidate,
  });
  assert.equal(libraryApproved[0]?.imageUrl, "https://cdn.example.com/approved-library.png");
  assert.equal(libraryApproved[1]?.imageUrl, "https://cdn.example.com/approved-library.png");
  assert.equal(libraryApproved[0]?.resolvedBy, "direct");
  assert.equal(libraryApproved[0]?.imageSelection?.selectedCandidateId, "asset-approved");

  const crawlApproved = applyStudioImageCandidateToSlides({
    slides: baseSlides,
    index: 0,
    getLinkedSlideIndexes: linkedByGroup,
    candidate: crawlCandidate,
  });
  assert.equal(crawlApproved[0]?.resolvedBy, "crawl");
  assert.equal(crawlApproved[0]?.mediaKind, "animated_image");
  assert.equal(crawlApproved[0]?.imageSelection?.selectedCandidateId, "giphy-approved");
});

test("applyStudioImageCandidateToSlides uses an explicit selectionReason override for the whole linked group", () => {
  const candidate: ImageSelectionCandidate = {
    provider: "library",
    candidateId: "asset-auto",
    imageUrl: "https://cdn.example.com/auto.png",
    title: "자동 후보",
  };
  const slides: PreparedSlide[] = [
    {
      title: "묶음 1",
      text: "첫 줄",
      lines: ["첫 줄"],
      layout: "photo+body",
      groupId: 5,
    },
    {
      title: "묶음 1",
      text: "둘째 줄",
      lines: ["둘째 줄"],
      layout: "photo+body",
      groupId: 5,
    },
  ];
  const overrideReason = `${STUDIO_AUTO_APPLIED_SELECTION_REASON}: library / 자동 후보`;

  const next = applyStudioImageCandidateToSlides({
    slides,
    index: 0,
    getLinkedSlideIndexes: linkedByGroup,
    candidate,
    selectionReason: overrideReason,
  });

  assert.equal(next[0]?.imageSelection?.selectionReason, overrideReason);
  assert.equal(next[1]?.imageSelection?.selectionReason, overrideReason);
});

test("applyStudioImageCandidateToSlides falls back to the manual selection reason when no override is given", () => {
  const candidate: ImageSelectionCandidate = {
    provider: "library",
    candidateId: "asset-manual",
    imageUrl: "https://cdn.example.com/manual.png",
    title: "수동 후보",
  };
  const slides: PreparedSlide[] = [
    {
      title: "묶음 2",
      text: "본문",
      lines: ["본문"],
      layout: "photo+body",
      groupId: 6,
    },
  ];

  const next = applyStudioImageCandidateToSlides({
    slides,
    index: 0,
    getLinkedSlideIndexes: linkedByGroup,
    candidate,
  });

  assert.equal(next[0]?.imageSelection?.selectionReason, "manual provider candidate selection: library / 수동 후보");
});
