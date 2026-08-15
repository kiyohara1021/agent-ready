import {
  CATEGORY_ORDER,
  type CategoryId,
  type Finding,
  type RecommendationEntry,
  type RecommendationPriority,
} from "./types.js";

const PRIORITY_RANK: Readonly<Record<RecommendationPriority, number>> = {
  high: 0,
  medium: 1,
  low: 2,
};

interface Candidate {
  entry: RecommendationEntry;
  category: CategoryId;
  /** Points the repository would stand to gain by acting on this. */
  lostPoints: number;
}

/**
 * Derives the recommendation list from weak and missing findings.
 *
 * A finding earns a place only when acting on it could actually improve the
 * report:
 *
 * - it carries a recommendation from its detector
 * - it applies to this repository — a check that was never asked must not
 *   produce advice, for the same reason it does not reduce the score
 * - it left points on the table
 *
 * Ordering is a total order, so the list depends only on the set of findings
 * and never on the order they were produced in:
 *
 * 1. priority, which detectors set from context rather than from point weight
 * 2. points recoverable, so the larger win comes first within a priority
 * 3. category order, then finding id, to settle genuine ties
 *
 * Like {@link scoreFindings}, this reads findings and nothing else.
 */
export function collectRecommendations(findings: readonly Finding[]): RecommendationEntry[] {
  const candidates: Candidate[] = [];

  for (const finding of findings) {
    const { recommendation } = finding;
    if (recommendation === undefined) continue;
    if (!finding.applicable) continue;

    const lostPoints = finding.maxScore - finding.score;
    if (lostPoints <= 0) continue;

    candidates.push({
      entry: {
        findingId: finding.id,
        priority: recommendation.priority,
        message: recommendation.message,
      },
      category: finding.category,
      lostPoints,
    });
  }

  return candidates
    .sort((a, b) => {
      const byPriority = PRIORITY_RANK[a.entry.priority] - PRIORITY_RANK[b.entry.priority];
      if (byPriority !== 0) return byPriority;

      const byImpact = b.lostPoints - a.lostPoints;
      if (byImpact !== 0) return byImpact;

      const byCategory =
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
      if (byCategory !== 0) return byCategory;

      return a.entry.findingId < b.entry.findingId
        ? -1
        : a.entry.findingId > b.entry.findingId
          ? 1
          : 0;
    })
    .map((candidate) => candidate.entry);
}
