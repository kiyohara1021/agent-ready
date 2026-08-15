import { describe, expect, it } from "vitest";

import { analyzeRepository } from "../../../src/core/analyze.js";
import { defaultDetectors } from "../../../src/detectors/index.js";
import { fixture } from "../../helpers/temp-repo.js";

describe("detector registry", () => {
  it("registers the detectors in specification order", () => {
    expect(defaultDetectors.map((detector) => detector.id)).toStrictEqual([
      "instructions.agents-md",
      "instructions.setup",
      "instructions.tests",
      "instructions.quality",
      "instructions.architecture",
      "automation.tests",
      "automation.lint",
      "automation.typecheck",
      "automation.ci",
      "automation.dependencies",
    ]);
  });

  it("uses unique ids that match the detector category", () => {
    const ids = defaultDetectors.map((detector) => detector.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const detector of defaultDetectors) {
      expect(detector.id.startsWith(`${detector.category}.`)).toBe(true);
    }
  });

  it("exercises every registered detector through `check`", async () => {
    const result = await analyzeRepository(fixture("node-healthy"));

    expect(result.findings.map((finding) => finding.id)).toStrictEqual(
      defaultDetectors.map((detector) => detector.id),
    );
    expect(result.categories).toStrictEqual([
      { id: "instructions", score: 30, maxScore: 30 },
      { id: "automation", score: 25, maxScore: 25 },
    ]);
    expect(result.score).toBe(100);
  });

  it("keeps non-applicable checks out of the denominator", async () => {
    const result = await analyzeRepository(fixture("docs-only"));

    // A documentation-only repository has nothing to lint, test, or automate.
    expect(result.categories).toStrictEqual([{ id: "instructions", score: 0, maxScore: 25 }]);
    expect(result.score).toBe(0);
  });

  it("scores fixtures deterministically", async () => {
    const names = [
      "node-healthy",
      "python-uv",
      "php-composer",
      "sample-repo",
      "stub-instructions",
      "minimal-repo",
      "docs-only",
    ];
    const scores = await Promise.all(
      names.map(async (name) => (await analyzeRepository(fixture(name))).score),
    );

    expect(scores).toStrictEqual([100, 95, 49, 56, 30, 6, 0]);
  });

  it("produces the same result on repeated analysis of the same repository", async () => {
    const [first, second] = await Promise.all([
      analyzeRepository(fixture("php-composer")),
      analyzeRepository(fixture("php-composer")),
    ]);

    expect(second).toStrictEqual(first);
  });
});
