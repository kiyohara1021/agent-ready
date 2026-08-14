import { CATEGORY_ORDER, type CategoryScore, type Finding } from "./types.js";

export interface ScoreSummary {
  score: number;
  categories: CategoryScore[];
}

/**
 * Aggregates findings into category totals and an overall 0-100 score.
 *
 *   sum(earned applicable points) / sum(max applicable points) * 100
 *
 * Non-applicable findings are excluded from both sides so that checks which do
 * not fit an ecosystem never drag the score down. Categories without applicable
 * findings are omitted entirely.
 *
 * This layer never touches the filesystem and never invokes detectors: it sees
 * findings and nothing else.
 *
 * Note: category weighting is intentionally not implemented yet; the weighted
 * model in docs/SCORING.md arrives with the real detectors.
 */
export function scoreFindings(findings: readonly Finding[]): ScoreSummary {
  const categories: CategoryScore[] = [];
  let earned = 0;
  let max = 0;

  for (const categoryId of CATEGORY_ORDER) {
    const applicable = findings.filter(
      (finding) => finding.category === categoryId && finding.applicable,
    );
    if (applicable.length === 0) continue;

    const categoryScore = applicable.reduce((total, finding) => total + finding.score, 0);
    const categoryMax = applicable.reduce((total, finding) => total + finding.maxScore, 0);

    categories.push({ id: categoryId, score: categoryScore, maxScore: categoryMax });
    earned += categoryScore;
    max += categoryMax;
  }

  // No applicable checks means there is no evidence of readiness to report.
  const score = max === 0 ? 0 : Math.round((earned / max) * 100);

  return { score, categories };
}
