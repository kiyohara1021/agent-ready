import { describe, expect, it } from "vitest";

import { collectRecommendations } from "../../../src/core/recommendations.js";
import type { CategoryId, Finding, RecommendationPriority } from "../../../src/core/types.js";

function withRecommendation(
  id: string,
  priority: RecommendationPriority,
  overrides: Partial<Finding> = {},
): Finding {
  return {
    id,
    category: id.split(".")[0] as CategoryId,
    status: "warning",
    title: id,
    message: "",
    score: 0,
    maxScore: 1,
    applicable: true,
    recommendation: { priority, message: `fix ${id}` },
    ...overrides,
  };
}

describe("collectRecommendations", () => {
  it("sorts by priority and keeps finding order within a priority", () => {
    const result = collectRecommendations([
      withRecommendation("context.a", "low"),
      withRecommendation("context.b", "high"),
      withRecommendation("context.c", "medium"),
      withRecommendation("context.d", "high"),
    ]);

    expect(result.map((entry) => entry.findingId)).toStrictEqual([
      "context.b",
      "context.d",
      "context.c",
      "context.a",
    ]);
  });

  it("ignores findings without a recommendation", () => {
    const passing: Finding = {
      id: "context.pass",
      category: "context",
      status: "pass",
      title: "ok",
      message: "",
      score: 1,
      maxScore: 1,
      applicable: true,
    };

    expect(collectRecommendations([passing])).toStrictEqual([]);
  });

  it("ignores checks that do not apply to the repository", () => {
    // A check that was never asked must not produce advice, for the same reason
    // it does not reduce the score.
    const result = collectRecommendations([
      withRecommendation("automation.typecheck", "high", { applicable: false, status: "info" }),
      withRecommendation("context.readme", "low"),
    ]);

    expect(result.map((entry) => entry.findingId)).toStrictEqual(["context.readme"]);
  });

  it("ignores findings that already earned every point", () => {
    const result = collectRecommendations([
      withRecommendation("context.readme", "high", { score: 5, maxScore: 5, status: "pass" }),
      withRecommendation("context.ignore", "low", { score: 4, maxScore: 5, status: "pass" }),
    ]);

    expect(result.map((entry) => entry.findingId)).toStrictEqual(["context.ignore"]);
  });

  it("puts the larger recoverable gap first within a priority", () => {
    const result = collectRecommendations([
      withRecommendation("instructions.setup", "high", { score: 1, maxScore: 5 }),
      withRecommendation("instructions.agents-md", "high", { score: 0, maxScore: 10 }),
      withRecommendation("instructions.tests", "high", { score: 4, maxScore: 5 }),
    ]);

    expect(result.map((entry) => entry.findingId)).toStrictEqual([
      "instructions.agents-md",
      "instructions.setup",
      "instructions.tests",
    ]);
  });

  it("settles equal priority and equal impact by category order, then id", () => {
    const result = collectRecommendations([
      withRecommendation("safety.secrets", "medium", { score: 0, maxScore: 5 }),
      withRecommendation("instructions.quality", "medium", { score: 0, maxScore: 5 }),
      withRecommendation("instructions.architecture", "medium", { score: 0, maxScore: 5 }),
      withRecommendation("automation.ci", "medium", { score: 0, maxScore: 5 }),
    ]);

    expect(result.map((entry) => entry.findingId)).toStrictEqual([
      "instructions.architecture",
      "instructions.quality",
      "automation.ci",
      "safety.secrets",
    ]);
  });

  it("produces the same list regardless of the order findings arrive in", () => {
    const findings = [
      withRecommendation("instructions.agents-md", "high", { score: 0, maxScore: 10 }),
      withRecommendation("automation.ci", "medium", { score: 2, maxScore: 5 }),
      withRecommendation("instructions.setup", "high", { score: 1, maxScore: 5 }),
      withRecommendation("safety.lockfile", "low", { score: 0, maxScore: 5 }),
      withRecommendation("context.readme", "medium", { score: 2, maxScore: 5 }),
    ];

    expect(collectRecommendations([...findings].reverse())).toStrictEqual(
      collectRecommendations(findings),
    );
  });
});
