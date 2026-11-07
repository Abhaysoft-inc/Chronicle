// Sarvam gives each OCR block a 0..1 score. It is NOT a calibrated probability (the docs do not
// say how it is computed), so the UI treats it as a relative hint: low scores mean "look at the
// original closely". On the sample handwriting, headings and print scored ~0.8 and handwriting
// ~0.4 to 0.6, so the cut-offs are deliberately gentle.

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export function confidenceLevel(c: number | null | undefined): ConfidenceLevel | null {
  if (c == null) return null;
  return c < 0.5 ? 'low' : c < 0.7 ? 'medium' : 'high';
}

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  low: 'Low OCR confidence',
  medium: 'Medium OCR confidence',
  high: 'High OCR confidence',
};

/** Lowest score among the cited blocks: the weakest link is what a reviewer should check. */
export function weakestConfidence(blocks: { block_id: string; confidence: number | null }[] | undefined, ids: string[]): number | null {
  if (!blocks) return null;
  const scores = blocks.filter((b) => ids.includes(b.block_id) && b.confidence != null).map((b) => b.confidence as number);
  return scores.length ? Math.min(...scores) : null;
}
