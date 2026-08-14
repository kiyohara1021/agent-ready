import { SCHEMA_VERSION, TOOL_VERSION } from "../core/version.js";
import type { AnalysisResult } from "../core/types.js";

export interface JsonReportOptions {
  /** Path as it should appear in output; the CLI keeps this concise. */
  displayPath: string;
}

/**
 * Renders the machine-readable report.
 *
 * Output contains no ANSI sequences and no decorative text, and key order is
 * fixed so that diffs of CI output stay meaningful.
 */
export function renderJsonReport(result: AnalysisResult, options: JsonReportOptions): string {
  const report = {
    schemaVersion: SCHEMA_VERSION,
    toolVersion: TOOL_VERSION,
    repository: {
      path: options.displayPath,
    },
    score: result.score,
    categories: result.categories.map((category) => ({
      id: category.id,
      score: category.score,
      maxScore: category.maxScore,
    })),
    findings: result.findings.map((finding) => ({
      id: finding.id,
      category: finding.category,
      status: finding.status,
      title: finding.title,
      message: finding.message,
      score: finding.score,
      maxScore: finding.maxScore,
      applicable: finding.applicable,
      ...(finding.evidence && finding.evidence.length > 0
        ? { evidence: finding.evidence }
        : {}),
    })),
    recommendations: result.recommendations.map((recommendation) => ({
      findingId: recommendation.findingId,
      priority: recommendation.priority,
      message: recommendation.message,
    })),
  };

  return `${JSON.stringify(report, null, 2)}\n`;
}
