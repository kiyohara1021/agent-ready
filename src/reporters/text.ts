import { TOOL_VERSION } from "../core/version.js";
import {
  CATEGORY_ORDER,
  CATEGORY_TITLES,
  type AnalysisResult,
  type Finding,
  type FindingStatus,
} from "../core/types.js";

/**
 * Status symbols. Text must carry the status on its own, so output stays
 * readable without color; this reporter emits no ANSI sequences at all.
 */
const STATUS_SYMBOLS: Readonly<Record<FindingStatus, string>> = {
  pass: "✓",
  warning: "△",
  fail: "✕",
  info: "•",
};

const TITLE_COLUMN = 52;

/** Interpretation bands from docs/SCORING.md. */
export function scoreLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Fair";
  if (score >= 40) return "Needs improvement";
  return "Poor";
}

function formatFinding(finding: Finding): string {
  const symbol = STATUS_SYMBOLS[finding.status];
  const head = `  ${symbol} ${finding.title}`;
  const contribution = finding.applicable
    ? `${finding.id} ${String(finding.score)}/${String(finding.maxScore)}`
    : `${finding.id} n/a`;
  return `${head.padEnd(TITLE_COLUMN)} ${contribution}`;
}

/**
 * Renders the human-readable report.
 *
 * Reporters format an existing {@link AnalysisResult}; they never detect
 * anything themselves.
 */
export function renderTextReport(result: AnalysisResult): string {
  const lines: string[] = [];

  lines.push(`agent-ready ${TOOL_VERSION}`);
  lines.push("");
  lines.push(
    `Agent Readiness: ${String(result.score)} / 100 — ${scoreLabel(result.score)}`,
  );

  for (const categoryId of CATEGORY_ORDER) {
    const findings = result.findings.filter((finding) => finding.category === categoryId);
    if (findings.length === 0) continue;

    const category = result.categories.find((entry) => entry.id === categoryId);
    // A category with only non-applicable findings has no score, but its
    // findings are still worth showing.
    const total = category
      ? `${String(category.score)} / ${String(category.maxScore)}`
      : "n/a";

    lines.push("");
    lines.push(`${CATEGORY_TITLES[categoryId].padEnd(TITLE_COLUMN)} ${total}`);
    for (const finding of findings) {
      lines.push(formatFinding(finding));
    }
  }

  if (result.recommendations.length > 0) {
    lines.push("");
    lines.push("Recommendations");
    lines.push("");
    result.recommendations.forEach((recommendation, index) => {
      lines.push(
        `${String(index + 1)}. [${recommendation.priority}] ${recommendation.message}`,
      );
    });
  }

  return `${lines.join("\n")}\n`;
}
