import { describe, expect, it } from "vitest";

import { analyzeRepository } from "../../../src/core/analyze.js";
import { defaultDetectors } from "../../../src/detectors/index.js";
import { fixture } from "../../helpers/temp-repo.js";

describe("detector registry", () => {
  it("registers the instruction detectors in specification order", () => {
    expect(defaultDetectors.map((detector) => detector.id)).toStrictEqual([
      "instructions.agents-md",
      "instructions.setup",
      "instructions.tests",
      "instructions.quality",
      "instructions.architecture",
    ]);
  });

  it("uses unique ids and declares the instructions category", () => {
    const ids = defaultDetectors.map((detector) => detector.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const detector of defaultDetectors) {
      expect(detector.category).toBe("instructions");
    }
  });

  it("exercises every registered detector through `check`", async () => {
    const result = await analyzeRepository(fixture("node-healthy"));

    expect(result.findings.map((finding) => finding.id)).toStrictEqual(
      defaultDetectors.map((detector) => detector.id),
    );
    expect(result.categories).toStrictEqual([{ id: "instructions", score: 30, maxScore: 30 }]);
    expect(result.score).toBe(100);
  });

  it("keeps a non-applicable check out of the denominator", async () => {
    const result = await analyzeRepository(fixture("docs-only"));
    const category = result.categories.find((entry) => entry.id === "instructions");

    // instructions.quality does not apply to a repository with no code.
    expect(category?.maxScore).toBe(25);
    expect(result.score).toBe(0);
  });

  it("scores fixtures deterministically", async () => {
    const scores = await Promise.all(
      ["node-healthy", "python-uv", "stub-instructions", "minimal-repo", "docs-only"].map(
        async (name) => (await analyzeRepository(fixture(name))).score,
      ),
    );

    expect(scores).toStrictEqual([100, 90, 23, 3, 0]);
  });
});
