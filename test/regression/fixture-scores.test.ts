import { describe, expect, it } from "vitest";

import { analyzeRepository } from "../../src/core/analyze.js";
import type { AnalysisResult, CategoryId } from "../../src/core/types.js";
import { fixture } from "../helpers/temp-repo.js";

/**
 * Locked scores for the reference repositories in `test/fixtures/`.
 *
 * Scoring changes move CI thresholds under every user at once, so these numbers
 * are a deliberate tripwire rather than a snapshot: a diff here means the score
 * model changed, and the change has to be justified and documented in
 * docs/SCORING.md before the expectations are updated.
 *
 * The fixtures deliberately span the shapes docs/SCORING.md calls out — a
 * healthy project, strong automation with weak instructions, strong docs with
 * no CI, a stub `AGENTS.md`, a non-Node ecosystem, and a repository with almost
 * nothing to go on.
 *
 * Note that only the Instructions and Automation detectors exist so far, so
 * these totals are out of 55 applicable points rather than 100. Adding the
 * Repository Context and Safety detectors will move every number here; that is
 * expected, and updating this table is part of that change.
 */

interface Expectation {
  /** Why this fixture is worth locking. */
  describes: string;
  score: number;
  categories: { id: CategoryId; score: number; maxScore: number }[];
  /** Recommendations in their expected order. */
  recommendations: string[];
}

const EXPECTATIONS: Readonly<Record<string, Expectation>> = {
  "node-healthy": {
    describes: "a healthy Node project where every check applies and passes",
    score: 100,
    categories: [
      { id: "instructions", score: 30, maxScore: 30 },
      { id: "automation", score: 25, maxScore: 25 },
    ],
    recommendations: [],
  },
  "python-uv": {
    describes: "a healthy Python package with minor instruction gaps",
    score: 95,
    categories: [
      { id: "instructions", score: 27, maxScore: 30 },
      { id: "automation", score: 25, maxScore: 25 },
    ],
    recommendations: ["instructions.setup"],
  },
  "php-composer": {
    describes: "strong automation undercut by missing agent instructions",
    score: 49,
    categories: [
      { id: "instructions", score: 3, maxScore: 30 },
      { id: "automation", score: 24, maxScore: 25 },
    ],
    recommendations: [
      "instructions.agents-md",
      "instructions.setup",
      "instructions.tests",
      "instructions.architecture",
      "instructions.quality",
      "automation.dependencies",
    ],
  },
  "sample-repo": {
    describes: "a plain JavaScript project, so the type-check does not apply",
    score: 56,
    categories: [
      { id: "instructions", score: 17, maxScore: 30 },
      // automation.typecheck is not conventional for plain JavaScript.
      { id: "automation", score: 11, maxScore: 20 },
    ],
    recommendations: [
      "instructions.architecture",
      "instructions.quality",
      "automation.dependencies",
      "instructions.setup",
      "automation.lint",
      "instructions.tests",
      "automation.ci",
      "automation.tests",
    ],
  },
  "stub-instructions": {
    describes: "a boilerplate AGENTS.md that must not earn full instruction points",
    score: 30,
    categories: [
      { id: "instructions", score: 7, maxScore: 30 },
      { id: "automation", score: 8, maxScore: 20 },
    ],
    recommendations: [
      "instructions.setup",
      "instructions.tests",
      "instructions.agents-md",
      "automation.ci",
      "instructions.architecture",
      "instructions.quality",
      "automation.dependencies",
      "automation.lint",
      "automation.tests",
    ],
  },
  "nested-agents": {
    describes: "scoped AGENTS.md files with no repository-level instructions",
    score: 6,
    categories: [
      { id: "instructions", score: 2, maxScore: 30 },
      { id: "automation", score: 1, maxScore: 20 },
    ],
    recommendations: [
      "instructions.agents-md",
      "instructions.tests",
      "instructions.setup",
      "automation.tests",
      "instructions.architecture",
      "instructions.quality",
      "automation.ci",
      "automation.lint",
      "automation.dependencies",
    ],
  },
  "minimal-repo": {
    describes: "a bare Go repository with almost no operational guidance",
    score: 6,
    categories: [
      { id: "instructions", score: 1, maxScore: 30 },
      // Go has no conventional separate type-check step.
      { id: "automation", score: 2, maxScore: 20 },
    ],
    recommendations: [
      "instructions.agents-md",
      "instructions.tests",
      "instructions.setup",
      "automation.tests",
      "instructions.architecture",
      "instructions.quality",
      "automation.ci",
      "automation.lint",
      "automation.dependencies",
    ],
  },
  "docs-only": {
    describes: "documentation with no code, so nothing is automatable",
    score: 0,
    categories: [
      // Every automation check is inapplicable, so the category is omitted
      // rather than reported as a zero.
      { id: "instructions", score: 0, maxScore: 25 },
    ],
    recommendations: [
      "instructions.agents-md",
      "instructions.setup",
      "instructions.tests",
      "instructions.architecture",
    ],
  },
};

describe("fixture score regression", () => {
  for (const [name, expected] of Object.entries(EXPECTATIONS)) {
    describe(`${name} — ${expected.describes}`, () => {
      it("scores exactly as documented", async () => {
        const result = await analyzeRepository(fixture(name));

        expect(result.score).toBe(expected.score);
        expect(result.categories).toStrictEqual(expected.categories);
      });

      it("orders recommendations stably", async () => {
        const result = await analyzeRepository(fixture(name));

        expect(result.recommendations.map((entry) => entry.findingId)).toStrictEqual(
          expected.recommendations,
        );
      });

      it("never reports a category above its applicable maximum", async () => {
        const result = await analyzeRepository(fixture(name));

        for (const category of result.categories) {
          expect(category.score).toBeLessThanOrEqual(category.maxScore);
        }
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
      });
    });
  }

  it("returns an identical result for a repeated analysis of the same fixture", async () => {
    const names = Object.keys(EXPECTATIONS);
    const runs = await Promise.all(
      names.map(async (name): Promise<[AnalysisResult, AnalysisResult]> => {
        const [first, second] = await Promise.all([
          analyzeRepository(fixture(name)),
          analyzeRepository(fixture(name)),
        ]);
        return [first, second];
      }),
    );

    for (const [first, second] of runs) {
      expect(second).toStrictEqual(first);
    }
  });
});
