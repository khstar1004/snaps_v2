import type { PreparedSlide, SlideInput } from "@/types/studio-json";

export function getSlideNarrationText(slide: Pick<SlideInput, "text" | "lines" | "narrationText">): string {
  return (String(slide.narrationText || "").trim() || String(slide.text || "").trim() || slide.lines.join(" ").trim() || " ").trim() || " ";
}

export function hasCustomNarrationText(slide: Pick<PreparedSlide, "text" | "narrationText">): boolean {
  const narrationText = String(slide.narrationText || "").trim();
  const text = String(slide.text || "").trim();
  return Boolean(narrationText) && narrationText !== text;
}

export function getGroupNarrationText(slides: Array<Pick<PreparedSlide, "text" | "lines" | "narrationText">>): string {
  const customNarration = slides.map((slide) => String(slide.narrationText || "").trim()).find(Boolean);
  if (customNarration) return customNarration;
  return slides.map((slide) => String(slide.text || "").trim()).filter(Boolean).join(" ").trim() || " ";
}
