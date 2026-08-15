import { describe, expect, it } from "vitest";

import { AnalysisError } from "../../../src/core/errors.js";
import { CATEGORY_WEIGHTS, TOTAL_WEIGHT, scoreFindings } from "../../../src/core/score.js";
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

  it("rounds a half-point exactly, without floating-point drift", () => {
    // 52/55 is 94.5454…; 27/40 is exactly 67.5 and must round up.
    expect(
      scoreFindings([
        finding({ id: "instructions.a", category: "instructions", score: 27, maxScore: 30 }),
        finding({ id: "automation.a", category: "automation", score: 25, maxScore: 25 }),
      ]).score,
    ).toBe(95);

    expect(
      scoreFindings([
        finding({ id: "instructions.a", category: "instructions", score: 27, maxScore: 30 }),
        finding({ id: "safety.a", category: "safety", score: 0, maxScore: 10 }),
      ]).score,
    ).toBe(68);
  });

  it("produces the same summary regardless of the order findings arrive in", () => {
    const findings = [
      finding({ id: "instructions.a", category: "instructions", score: 4, maxScore: 10 }),
      finding({ id: "automation.a", category: "automation", score: 5, maxScore: 5 }),
      finding({ id: "context.a", category: "context", score: 0, maxScore: 5, applicable: false }),
      finding({ id: "safety.a", category: "safety", score: 3, maxScore: 5 }),
    ];

    expect(scoreFindings([...findings].reverse())).toStrictEqual(scoreFindings(findings));
  });

  it("keeps a category at its documented weight when some checks do not apply", () => {
    // The full automation budget is declared; one check simply is not asked.
    const result = scoreFindings([
      finding({ id: "automation.a", category: "automation", score: 5, maxScore: 5 }),
      finding({ id: "automation.b", category: "automation", score: 5, maxScore: 5 }),
      finding({ id: "automation.c", category: "automation", score: 5, maxScore: 5 }),
      finding({ id: "automation.d", category: "automation", score: 5, maxScore: 5 }),
      finding({
        id: "automation.e",
        category: "automation",
        score: 0,
        maxScore: 5,
        applicable: false,
        status: "info",
      }),
    ]);

    expect(result.categories).toStrictEqual([{ id: "automation", score: 20, maxScore: 20 }]);
    expect(result.score).toBe(100);
  });
});

describe("scoring weights", () => {
  it("matches the documented category maxima", () => {
    expect(CATEGORY_WEIGHTS).toStrictEqual({
      instructions: 30,
      automation: 25,
      context: 25,
      safety: 20,
    });
    expect(TOTAL_WEIGHT).toBe(100);
  });

  it("rejects a category that claims more points than docs/SCORING.md allocates", () => {
    const overspent = [
      finding({ id: "safety.a", category: "safety", score: 0, maxScore: 15 }),
      finding({ id: "safety.b", category: "safety", score: 0, maxScore: 10 }),
    ];

    expect(() => scoreFindings(overspent)).toThrow(AnalysisError);
    expect(() => scoreFindings(overspent)).toThrow(/allocates 20/);
  });

  it("counts non-applicable checks against the category budget", () => {
    // The reserved points belong to the detector whether or not it was asked,
    // so hiding an overspend behind `applicable: false` is still rejected.
    expect(() =>
      scoreFindings([
        finding({ id: "safety.a", category: "safety", score: 0, maxScore: 20 }),
        finding({
          id: "safety.b",
          category: "safety",
          score: 0,
          maxScore: 5,
          applicable: false,
        }),
      ]),
    ).toThrow(AnalysisError);
  });

  it("rejects a finding that earned more than it declared", () => {
    expect(() =>
      scoreFindings([
        finding({ id: "instructions.a", category: "instructions", score: 6, maxScore: 5 }),
      ]),
    ).toThrow(/scored 6 of 5/);
  });

  it("rejects negative and non-finite contributions", () => {
    expect(() =>
      scoreFindings([
        finding({ id: "instructions.a", category: "instructions", score: -1, maxScore: 5 }),
      ]),
    ).toThrow(/negative/);

    expect(() =>
      scoreFindings([
        finding({ id: "instructions.a", category: "instructions", score: 0, maxScore: Number.NaN }),
      ]),
    ).toThrow(/non-finite/);
  });
});
