import type { Finding, RecommendationEntry, RecommendationPriority } from "./types.js";

const PRIORITY_RANK: Readonly<Record<RecommendationPriority, number>> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Collects recommendations attached to findings, ordered by priority.
 *
 * Findings arrive in deterministic order, and the sort is stable, so equal
 * priorities keep their finding order.
 */
export function collectRecommendations(findings: readonly Finding[]): RecommendationEntry[] {
  return findings
    .flatMap((finding) =>
      finding.recommendation
        ? [
            {
              findingId: finding.id,
              priority: finding.recommendation.priority,
              message: finding.recommendation.message,
            },
          ]
        : [],
    )
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}
