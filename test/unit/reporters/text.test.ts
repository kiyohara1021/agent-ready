import { describe, expect, it } from "vitest";

import { renderTextReport, scoreLabel } from "../../../src/reporters/text.js";
import type { AnalysisResult } from "../../../src/core/types.js";

const result: AnalysisResult = {
  repositoryPath: "/tmp/example",
  score: 78,
  categories: [
    { id: "instructions", score: 6, maxScore: 10 },
    { id: "safety", score: 2, maxScore: 5 },
  ],
  findings: [
    {
      id: "instructions.agents-md",
      category: "instructions",
      status: "pass",
      title: "AGENTS.md detected",
      message: "",
      score: 6,
      maxScore: 10,
      applicable: true,
    },
    {
      id: "safety.security-policy",
      category: "safety",
      status: "warning",
      title: "SECURITY.md is missing",
      message: "",
      score: 2,
      maxScore: 5,
      applicable: true,
      recommendation: { priority: "low", message: "Add SECURITY.md." },
    },
  ],
  recommendations: [
    { findingId: "safety.security-policy", priority: "low", message: "Add SECURITY.md." },
  ],
};

describe("renderTextReport", () => {
  it("renders score, categories, findings, and recommendations in order", () => {
    const output = renderTextReport(result);
    const lines = output.split("\n");

    expect(lines[0]).toMatch(/^agent-ready \d+\.\d+\.\d+$/);
    expect(output).toContain("Agent Readiness: 78 / 100 — Good");
    expect(output).toContain("Instructions");
    expect(output).toContain("✓ AGENTS.md detected");
    expect(output).toContain("△ SECURITY.md is missing");
    expect(output).toContain("1. [low] Add SECURITY.md.");

    expect(output.indexOf("Instructions")).toBeLessThan(output.indexOf("Safety"));
    expect(output.indexOf("Safety")).toBeLessThan(output.indexOf("Recommendations"));
  });

  it("includes the detector id and score contribution for every finding", () => {
    const output = renderTextReport(result);

    expect(output).toMatch(/instructions\.agents-md 6\/10/);
    expect(output).toMatch(/safety\.security-policy 2\/5/);
  });

  it("emits no ANSI escape sequences", () => {
    expect(renderTextReport(result)).not.toContain("\u001b[");
  });

  it("omits the recommendations section when there is nothing to recommend", () => {
    const output = renderTextReport({ ...result, recommendations: [] });
    expect(output).not.toContain("Recommendations");
  });

  it("ends with exactly one trailing newline", () => {
    const output = renderTextReport(result);
    expect(output.endsWith("\n")).toBe(true);
    expect(output.endsWith("\n\n")).toBe(false);
  });

  it("maps scores to documented interpretation bands", () => {
    expect(scoreLabel(100)).toBe("Excellent");
    expect(scoreLabel(90)).toBe("Excellent");
    expect(scoreLabel(89)).toBe("Good");
    expect(scoreLabel(60)).toBe("Fair");
    expect(scoreLabel(40)).toBe("Needs improvement");
    expect(scoreLabel(0)).toBe("Poor");
  });
});
