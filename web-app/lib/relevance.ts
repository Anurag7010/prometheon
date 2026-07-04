// Shared relevance-score banding for retrieval results.
//
// Cosine-similarity scores from the embedding models in use (MiniLM for free
// tier, text-embedding-3-small for owner) land in the 0.3-0.7 range for
// genuinely relevant chunks — a 0.6 match is a strong hit, not a weak one.
// Bands here are calibrated to that scale; the backend applies matching
// tier-aware thresholds for the answer-level confidence badge.
export type RelevanceTier = 'high' | 'medium' | 'low'

export const RELEVANCE_HIGH_THRESHOLD = 0.55
export const RELEVANCE_MEDIUM_THRESHOLD = 0.4

export function relevanceTier(score: number): RelevanceTier {
  if (score >= RELEVANCE_HIGH_THRESHOLD) return 'high'
  if (score >= RELEVANCE_MEDIUM_THRESHOLD) return 'medium'
  return 'low'
}
