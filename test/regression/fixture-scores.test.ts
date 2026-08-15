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
 * Every category now has detectors, so a fixture in which every check applies
 * is scored out of the full 100 points. Where a fixture's applicable maxima add
 * up to less than 100 — a Go repository with no conventional type-check step, a
 * project with no dependencies to lock — the non-applicable checks have left
 * both the numerator and the denominator, as docs/SCORING.md describes.
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
      { id: "context", score: 25, maxScore: 25 },
      { id: "safety", score: 20, maxScore: 20 },
    ],
    recommendations: [],
  },
  "python-uv": {
    describes: "a healthy Python package with minor instruction gaps",
    score: 87,
    categories: [
      { id: "instructions", score: 27, maxScore: 30 },
      { id: "automation", score: 25, maxScore: 25 },
      { id: "context", score: 21, maxScore: 25 },
      { id: "safety", score: 14, maxScore: 20 },
    ],
    recommendations: [
      "safety.security-policy",
      "context.metadata",
      "instructions.setup",
      "context.architecture",
      "context.readme",
      "safety.secrets",
    ],
  },
  "php-composer": {
    describes: "strong automation undercut by missing instructions and safety",
    score: 37,
    categories: [
      { id: "instructions", score: 3, maxScore: 30 },
      { id: "automation", score: 24, maxScore: 25 },
      { id: "context", score: 10, maxScore: 25 },
      { id: "safety", score: 0, maxScore: 20 },
    ],
    recommendations: [
      "instructions.agents-md",
      "safety.gitignore",
      "instructions.setup",
      "instructions.tests",
      "instructions.architecture",
      "context.architecture",
      "context.ignore",
      "safety.lockfile",
      "safety.secrets",
      "instructions.quality",
      "context.readme",
      "safety.security-policy",
      "automation.dependencies",
      "context.generated",
      "context.metadata",
    ],
  },
  "sample-repo": {
    describes: "a plain JavaScript project, so the type-check does not apply",
    score: 52,
    categories: [
      { id: "instructions", score: 17, maxScore: 30 },
      { id: "automation", score: 11, maxScore: 20 },
      { id: "context", score: 13, maxScore: 25 },
      { id: "safety", score: 6, maxScore: 15 },
    ],
    recommendations: [
      "instructions.architecture",
      "context.architecture",
      "instructions.quality",
      "context.readme",
      "safety.secrets",
      "automation.dependencies",
      "safety.security-policy",
      "instructions.setup",
      "automation.lint",
      "context.metadata",
      "instructions.tests",
      "automation.ci",
      "automation.tests",
      "context.ignore",
      "safety.gitignore",
    ],
  },
  "stub-instructions": {
    describes: "a boilerplate AGENTS.md that must not earn full instruction points",
    score: 28,
    categories: [
      { id: "instructions", score: 7, maxScore: 30 },
      { id: "automation", score: 8, maxScore: 20 },
      { id: "context", score: 10, maxScore: 25 },
      { id: "safety", score: 0, maxScore: 15 },
    ],
    recommendations: [
      "safety.gitignore",
      "instructions.setup",
      "instructions.tests",
      "instructions.agents-md",
      "automation.ci",
      "context.architecture",
      "context.ignore",
      "safety.secrets",
      "instructions.architecture",
      "instructions.quality",
      "automation.dependencies",
      "safety.security-policy",
      "context.metadata",
      "automation.lint",
      "automation.tests",
      "context.generated",
      "context.readme",
    ],
  },
  "nested-agents": {
    describes: "scoped AGENTS.md files with no repository-level instructions",
    score: 10,
    categories: [
      { id: "instructions", score: 2, maxScore: 30 },
      { id: "automation", score: 1, maxScore: 20 },
      { id: "context", score: 6, maxScore: 25 },
      { id: "safety", score: 0, maxScore: 15 },
    ],
    recommendations: [
      "instructions.agents-md",
      "instructions.tests",
      "safety.gitignore",
      "instructions.setup",
      "automation.tests",
      "instructions.architecture",
      "instructions.quality",
      "automation.ci",
      "automation.lint",
      "context.architecture",
      "context.ignore",
      "safety.secrets",
      "context.metadata",
      "context.readme",
      "automation.dependencies",
      "safety.security-policy",
      "context.generated",
    ],
  },
  "minimal-repo": {
    describes: "a bare Go repository with almost no operational guidance",
    score: 13,
    categories: [
      { id: "instructions", score: 1, maxScore: 30 },
      { id: "automation", score: 2, maxScore: 20 },
      { id: "context", score: 9, maxScore: 25 },
      { id: "safety", score: 0, maxScore: 15 },
    ],
    recommendations: [
      "instructions.agents-md",
      "instructions.tests",
      "safety.gitignore",
      "instructions.setup",
      "automation.tests",
      "instructions.architecture",
      "instructions.quality",
      "automation.ci",
      "context.architecture",
      "context.ignore",
      "safety.secrets",
      "automation.lint",
      "context.readme",
      "context.metadata",
      "automation.dependencies",
      "safety.security-policy",
    ],
  },
  "docs-only": {
    describes: "documentation with no code, so nothing is automatable",
    score: 14,
    categories: [
      { id: "instructions", score: 0, maxScore: 25 },
      { id: "context", score: 8, maxScore: 25 },
      { id: "safety", score: 1, maxScore: 15 },
    ],
    recommendations: [
      "instructions.agents-md",
      "instructions.setup",
      "instructions.tests",
      "instructions.architecture",
      "context.architecture",
      "context.ignore",
      "safety.secrets",
      "context.readme",
      "safety.security-policy",
      "safety.gitignore",
      "context.metadata",
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
