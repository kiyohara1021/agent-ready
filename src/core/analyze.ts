import { defaultDetectors } from "../detectors/index.js";
import { AnalysisError } from "./errors.js";
import { collectRecommendations } from "./recommendations.js";
import { buildRepositoryContext, type RepositoryContext } from "./repository-context.js";
import { scoreFindings } from "./score.js";
import { CATEGORY_ORDER, type AnalysisResult, type Detector, type Finding } from "./types.js";

export interface AnalyzeOptions {
  detectors?: readonly Detector[];
}

/**
 * Runs the readiness pipeline:
 *
 *   discovery -> detectors -> findings -> scoring -> result
 *
 * Reporting happens one layer up; this function renders nothing.
 */
export async function analyzeRepository(
  targetPath: string,
  options: AnalyzeOptions = {},
): Promise<AnalysisResult> {
  const context = await buildRepositoryContext(targetPath);
  return analyzeContext(context, options);
}

/** Same pipeline as {@link analyzeRepository}, for an already-built context. */
export async function analyzeContext(
  context: RepositoryContext,
  options: AnalyzeOptions = {},
): Promise<AnalysisResult> {
  const detectors = options.detectors ?? defaultDetectors;
  const findings = await runDetectors(detectors, context);
  const { score, categories } = scoreFindings(findings);

  return {
    repositoryPath: context.root,
    score,
    categories,
    findings,
    recommendations: collectRecommendations(findings),
  };
}

async function runDetectors(
  detectors: readonly Detector[],
  context: RepositoryContext,
): Promise<Finding[]> {
  const results = await Promise.all(
    detectors.map(async (detector, registrationIndex) => {
      let finding: Finding;
      try {
        finding = await detector.analyze(context);
      } catch (cause) {
        throw new AnalysisError(`Detector "${detector.id}" failed.`, { cause });
      }
      return { finding, registrationIndex };
    }),
  );

  // Ordering is part of the output contract: category, then registration order,
  // then finding id. Detector completion order must never leak into output.
  return results
    .sort((a, b) => {
      const byCategory =
        CATEGORY_ORDER.indexOf(a.finding.category) - CATEGORY_ORDER.indexOf(b.finding.category);
      if (byCategory !== 0) return byCategory;
      if (a.registrationIndex !== b.registrationIndex) {
        return a.registrationIndex - b.registrationIndex;
      }
      return a.finding.id < b.finding.id ? -1 : a.finding.id > b.finding.id ? 1 : 0;
    })
    .map((entry) => entry.finding);
}
