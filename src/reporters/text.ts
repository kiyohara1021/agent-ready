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

/**
 * Narrowest label column. Wider content pushes the column out, so a long title
 * never collides with its score contribution.
 */
const MIN_LABEL_COLUMN = 36;

/** A label on the left, its score contribution on the right. */
interface Row {
  label: string;
  value: string;
}

interface Section {
  header: Row;
  findings: Row[];
}

/** Interpretation bands from docs/SCORING.md. */
export function scoreLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Fair";
  if (score >= 40) return "Needs improvement";
  return "Poor";
}

function findingRow(finding: Finding): Row {
  const symbol = STATUS_SYMBOLS[finding.status];
  return {
    label: `  ${symbol} ${finding.title}`,
    // The detector id keeps every line traceable to a documented check.
    value: finding.applicable
      ? `${finding.id} ${String(finding.score)}/${String(finding.maxScore)}`
      : `${finding.id} n/a`,
  };
}

function buildSections(result: AnalysisResult): Section[] {
  const sections: Section[] = [];

  for (const categoryId of CATEGORY_ORDER) {
    const findings = result.findings.filter((finding) => finding.category === categoryId);
    if (findings.length === 0) continue;

    const category = result.categories.find((entry) => entry.id === categoryId);
    // A category with only non-applicable findings has no score, but its
    // findings are still worth showing.
    const value = category
      ? `${String(category.score)} / ${String(category.maxScore)}`
      : "n/a";

    sections.push({
      header: { label: CATEGORY_TITLES[categoryId], value },
      findings: findings.map(findingRow),
    });
  }

  return sections;
}

function renderRow(row: Row, column: number): string {
  return `${row.label.padEnd(column)}${row.value}`;
}

/**
 * Renders the human-readable report.
 *
 * Reporters format an existing {@link AnalysisResult}; they never detect
 * anything themselves.
 */
export function renderTextReport(result: AnalysisResult): string {
  const sections = buildSections(result);
  const labels = sections.flatMap((section) => [
    section.header.label,
    ...section.findings.map((row) => row.label),
  ]);
  const column = Math.max(
    MIN_LABEL_COLUMN,
    ...labels.map((label) => label.length + 2),
  );

  const lines: string[] = [];

  lines.push(`agent-ready ${TOOL_VERSION}`);
  lines.push("");
  lines.push(
    `Agent Readiness: ${String(result.score)} / 100 — ${scoreLabel(result.score)}`,
  );

  for (const section of sections) {
    lines.push("");
    lines.push(renderRow(section.header, column));
    for (const row of section.findings) {
      lines.push(renderRow(row, column));
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

  // Repeated so the headline survives a scrolled-off terminal and reads clearly
  // at the end of a CI log.
  lines.push("");
  lines.push(`Score: ${String(result.score)}/100`);

  return `${lines.join("\n")}\n`;
}
