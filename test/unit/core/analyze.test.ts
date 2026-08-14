import { describe, expect, it } from "vitest";

import { analyzeRepository } from "../../../src/core/analyze.js";
import { AnalysisError } from "../../../src/core/errors.js";
import type { Detector } from "../../../src/core/types.js";
import { createTempRepo, SAMPLE_REPO } from "../../helpers/temp-repo.js";

function stubDetector(id: string, category: Detector["category"], delayMs = 0): Detector {
  return {
    id,
    category,
    analyze: () =>
      new Promise((resolve) => {
        setTimeout(
          () =>
            resolve({
              id,
              category,
              status: "pass",
              title: id,
              message: "",
              score: 1,
              maxScore: 1,
              applicable: true,
            }),
          delayMs,
        );
      }),
  };
}

describe("analyzeRepository", () => {
  it("runs the default pipeline against a fixture repository", async () => {
    const result = await analyzeRepository(SAMPLE_REPO);

    expect(result.findings.map((finding) => finding.id)).toStrictEqual([
      "instructions.agents-md",
      "instructions.setup",
      "instructions.tests",
      "instructions.quality",
      "instructions.architecture",
    ]);
    expect(result.categories).toStrictEqual([{ id: "instructions", score: 17, maxScore: 30 }]);
    expect(result.score).toBe(57);
  });

  it("orders findings by category then registration, not completion order", async () => {
    const result = await analyzeRepository(SAMPLE_REPO, {
      detectors: [
        stubDetector("safety.slow", "safety", 20),
        stubDetector("instructions.fast", "instructions"),
        stubDetector("instructions.second", "instructions"),
      ],
    });

    expect(result.findings.map((finding) => finding.id)).toStrictEqual([
      "instructions.fast",
      "instructions.second",
      "safety.slow",
    ]);
  });

  it("collects recommendations from findings, highest priority first", async () => {
    const { root, cleanup } = await createTempRepo();
    try {
      const result = await analyzeRepository(root);

      expect(result.score).toBe(0);
      expect(result.recommendations.map((entry) => entry.findingId)).toStrictEqual([
        "instructions.agents-md",
        "instructions.setup",
        "instructions.tests",
        "instructions.architecture",
      ]);
      expect(result.recommendations.map((entry) => entry.priority)).toStrictEqual([
        "high",
        "high",
        "high",
        "medium",
      ]);
    } finally {
      await cleanup();
    }
  });

  it("wraps detector failures in AnalysisError", async () => {
    const failing: Detector = {
      id: "context.boom",
      category: "context",
      analyze: () => Promise.reject(new Error("boom")),
    };

    await expect(analyzeRepository(SAMPLE_REPO, { detectors: [failing] })).rejects.toBeInstanceOf(
      AnalysisError,
    );
  });

  it("does not modify the analyzed repository", async () => {
    const before = await snapshot(SAMPLE_REPO);
    await analyzeRepository(SAMPLE_REPO);
    expect(await snapshot(SAMPLE_REPO)).toStrictEqual(before);
  });
});

async function snapshot(root: string): Promise<string[]> {
  const { scanRepository } = await import("../../../src/discovery/filesystem.js");
  const { files } = await scanRepository(root, { skipDirectories: [] });
  return files.map((file) => `${file.path}:${String(file.size)}`);
}
