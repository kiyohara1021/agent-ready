import { AnalysisError } from "./errors.js";
import { CATEGORY_ORDER, type CategoryId, type CategoryScore, type Finding } from "./types.js";

export interface ScoreSummary {
  score: number;
  categories: CategoryScore[];
}

/**
 * Documented category maxima from docs/SCORING.md.
 *
 * These totals *are* the category weights. A category influences the overall
 * score in proportion to its share of the point budget, so weighting needs no
 * separate multiplier: the per-check point values declared by detectors as
 * `maxScore` add up to the category weight, and the weights add up to
 * {@link TOTAL_WEIGHT}.
 *
 * Changing a weight is a breaking scoring change. docs/SCORING.md must be
 * updated in the same change; `test/unit/core/score-weights.test.ts` locks the
 * table and the detector registry together so drift cannot pass unnoticed.
 */
export const CATEGORY_WEIGHTS: Readonly<Record<CategoryId, number>> = {
  instructions: 30,
  automation: 25,
  context: 25,
  safety: 20,
};

/** Point budget of a repository in which every check applies. */
export const TOTAL_WEIGHT: number = CATEGORY_ORDER.reduce(
  (total, categoryId) => total + CATEGORY_WEIGHTS[categoryId],
  0,
);

/**
 * Aggregates findings into category totals and an overall 0-100 score.
 *
 *   sum(earned applicable points) / sum(max applicable points) × 100
 *
 * This is the model documented in docs/SCORING.md. Non-applicable findings are
 * excluded from both the numerator and the denominator, so a check that does
 * not fit an ecosystem neither punishes nor rewards the repository — it simply
 * is not asked. A category whose checks all turn out to be non-applicable is
 * omitted from the breakdown rather than reported as a zero.
 *
 * Applicability therefore shrinks the denominator instead of redistributing
 * points between categories. A repository is judged on the checks that apply to
 * it, and each surviving check keeps the absolute weight docs/SCORING.md gives
 * it. No renormalization back up to a fixed category share happens anywhere:
 * that would be a second, undocumented scoring model.
 *
 * This layer never touches the filesystem, never invokes detectors, and derives
 * nothing from the clock or from randomness: the same findings always produce
 * the same summary.
 *
 * @throws AnalysisError when the findings violate the documented point budget.
 */
export function scoreFindings(findings: readonly Finding[]): ScoreSummary {
  assertWithinBudget(findings);

  const categories: CategoryScore[] = [];
  let earned = 0;
  let max = 0;

  // Iterating the fixed category order rather than the findings keeps the
  // breakdown independent of the order findings arrive in.
  for (const categoryId of CATEGORY_ORDER) {
    let categoryScore = 0;
    let categoryMax = 0;
    let applicableCount = 0;

    for (const finding of findings) {
      if (finding.category !== categoryId || !finding.applicable) continue;
      categoryScore += finding.score;
      categoryMax += finding.maxScore;
      applicableCount += 1;
    }

    if (applicableCount === 0) continue;

    categories.push({ id: categoryId, score: categoryScore, maxScore: categoryMax });
    earned += categoryScore;
    max += categoryMax;
  }

  // No applicable checks means there is no evidence of readiness to report.
  // Scaling before dividing keeps integer point totals exact, so the rounding
  // boundary does not depend on floating-point representation.
  const score = max === 0 ? 0 : Math.round((earned * 100) / max);

  return { score, categories };
}

/**
 * Rejects findings that cannot be scored against the documented model.
 *
 * A detector claiming more points than docs/SCORING.md allocates to its
 * category, or earning more than it declared, is a bug in this tool rather than
 * a property of the analyzed repository. Failing loudly keeps a silently wrong
 * score — the one output CI depends on — from ever being printed.
 */
function assertWithinBudget(findings: readonly Finding[]): void {
  const declared = new Map<CategoryId, number>();

  for (const finding of findings) {
    if (!Number.isFinite(finding.score) || !Number.isFinite(finding.maxScore)) {
      throw new AnalysisError(`Finding "${finding.id}" reported a non-finite score.`);
    }
    if (finding.score < 0 || finding.maxScore < 0) {
      throw new AnalysisError(`Finding "${finding.id}" reported a negative score.`);
    }
    if (finding.score > finding.maxScore) {
      throw new AnalysisError(
        `Finding "${finding.id}" scored ${String(finding.score)} of ${String(finding.maxScore)} possible points.`,
      );
    }

    // Non-applicable checks still occupy their share of the budget: the
    // detector reserves the points whether or not this repository is asked.
    declared.set(finding.category, (declared.get(finding.category) ?? 0) + finding.maxScore);
  }

  for (const categoryId of CATEGORY_ORDER) {
    const budget = declared.get(categoryId) ?? 0;
    const weight = CATEGORY_WEIGHTS[categoryId];
    if (budget > weight) {
      throw new AnalysisError(
        `Category "${categoryId}" declares ${String(budget)} points but docs/SCORING.md allocates ${String(weight)}.`,
      );
    }
  }
}
