import { describe, expect, it } from "vitest";

import { collectRecommendations } from "../../../src/core/recommendations.js";
import type { Finding, RecommendationPriority } from "../../../src/core/types.js";

function withRecommendation(id: string, priority: RecommendationPriority): Finding {
  return {
    id,
    category: "context",
    status: "warning",
    title: id,
    message: "",
    score: 0,
    maxScore: 1,
    applicable: true,
    recommendation: { priority, message: `fix ${id}` },
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
});
