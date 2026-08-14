import type { RepositoryContext } from "./repository-context.js";

export type FindingStatus = "pass" | "warning" | "fail" | "info";

export type CategoryId = "instructions" | "automation" | "context" | "safety";

export type RecommendationPriority = "high" | "medium" | "low";

/**
 * Category order is part of the public output contract: it fixes the order of
 * both terminal sections and JSON arrays.
 */
export const CATEGORY_ORDER: readonly CategoryId[] = [
  "instructions",
  "automation",
  "context",
  "safety",
];

export const CATEGORY_TITLES: Readonly<Record<CategoryId, string>> = {
  instructions: "Instructions",
  automation: "Automation",
  context: "Repository Context",
  safety: "Safety",
};

export interface Recommendation {
  priority: RecommendationPriority;
  message: string;
}

export interface Evidence {
  kind: "file" | "script" | "workflow" | "config";
  /** Repository-relative POSIX path, when the evidence is a path. */
  path?: string;
  label: string;
}

export interface Finding {
  /** Stable, API-like identifier, e.g. `instructions.agents-md`. */
  id: string;
  category: CategoryId;
  status: FindingStatus;
  title: string;
  message: string;
  score: number;
  maxScore: number;
  /**
   * `false` when the check does not apply to this repository. Non-applicable
   * findings are excluded from both numerator and denominator when scoring.
   */
  applicable: boolean;
  recommendation?: Recommendation;
  evidence?: Evidence[];
}

/**
 * A detector answers one narrow readiness question.
 *
 * Detectors read only from {@link RepositoryContext}, never render terminal
 * output, never mutate score state, and never execute target repository code.
 */
export interface Detector {
  id: string;
  category: CategoryId;
  analyze(context: RepositoryContext): Promise<Finding>;
}

export interface CategoryScore {
  id: CategoryId;
  score: number;
  maxScore: number;
}

export interface RecommendationEntry {
  findingId: string;
  priority: RecommendationPriority;
  message: string;
}

export interface AnalysisResult {
  /** Absolute, normalized repository root. */
  repositoryPath: string;
  score: number;
  categories: CategoryScore[];
  findings: Finding[];
  recommendations: RecommendationEntry[];
}
