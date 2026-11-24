export const AI_IMAGE_OUTPUT_CONSTRAINTS =
  "Output requirements: square 1:1 composition, no text, no captions, no speech bubbles, no logos, no watermark.";

export function appendAiImageOutputConstraints(prompt: string): string {
  const normalized = String(prompt || "").trim();
  if (!normalized) return AI_IMAGE_OUTPUT_CONSTRAINTS;
  if (normalized.includes(AI_IMAGE_OUTPUT_CONSTRAINTS)) return normalized;
  return `${normalized}\n\n${AI_IMAGE_OUTPUT_CONSTRAINTS}`;
}
