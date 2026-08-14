import { describe, expect, it } from "vitest";

import { scoreFindings } from "../../../src/core/score.js";
import type { CategoryId, Finding } from "../../../src/core/types.js";

function finding(overrides: Partial<Finding> & { id: string; category: CategoryId }): Finding {
  return {
    status: "pass",
    title: overrides.id,
    message: "",
    score: 0,
    maxScore: 0,
    applicable: true,
    ...overrides,
  };
}

describe("scoreFindings", () => {
  it("aggregates category totals and the overall score", () => {
    const result = scoreFindings([
      finding({ id: "instructions.a", category: "instructions", score: 8, maxScore: 10 }),
      finding({ id: "safety.a", category: "safety", score: 2, maxScore: 10 }),
    ]);

    expect(result.categories).toStrictEqual([
      { id: "instructions", score: 8, maxScore: 10 },
      { id: "safety", score: 2, maxScore: 10 },
    ]);
    expect(result.score).toBe(50);
  });

  it("orders categories deterministically regardless of finding order", () => {
    const result = scoreFindings([
      finding({ id: "safety.a", category: "safety", score: 1, maxScore: 1 }),
      finding({ id: "instructions.a", category: "instructions", score: 1, maxScore: 1 }),
      finding({ id: "automation.a", category: "automation", score: 1, maxScore: 1 }),
    ]);

    expect(result.categories.map((category) => category.id)).toStrictEqual([
      "instructions",
      "automation",
      "safety",
    ]);
  });

  it("excludes non-applicable findings from numerator and denominator", () => {
    const result = scoreFindings([
      finding({ id: "automation.a", category: "automation", score: 5, maxScore: 5 }),
      finding({
        id: "automation.b",
        category: "automation",
        score: 0,
        maxScore: 5,
        applicable: false,
        status: "info",
      }),
    ]);

    expect(result.categories).toStrictEqual([{ id: "automation", score: 5, maxScore: 5 }]);
    expect(result.score).toBe(100);
  });

  it("omits categories that have no applicable findings", () => {
    const result = scoreFindings([
      finding({ id: "safety.a", category: "safety", maxScore: 5, applicable: false }),
    ]);

    expect(result.categories).toStrictEqual([]);
    expect(result.score).toBe(0);
  });

  it("returns 0 for no findings rather than dividing by zero", () => {
    expect(scoreFindings([])).toStrictEqual({ score: 0, categories: [] });
  });

  it("rounds to the nearest integer", () => {
    const result = scoreFindings([
      finding({ id: "context.a", category: "context", score: 1, maxScore: 3 }),
    ]);

    expect(result.score).toBe(33);
  });
});
