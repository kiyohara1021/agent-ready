import { describe, expect, it } from "vitest";

import { renderJsonReport } from "../../../src/reporters/json.js";
import { SCHEMA_VERSION, TOOL_VERSION } from "../../../src/core/version.js";
import type { AnalysisResult } from "../../../src/core/types.js";

const result: AnalysisResult = {
  repositoryPath: "/tmp/example",
  score: 42,
  categories: [{ id: "context", score: 1, maxScore: 2 }],
  findings: [
    {
      id: "context.readme",
      category: "context",
      status: "warning",
      title: "README is thin",
      message: "README exists but has little setup information.",
      score: 1,
      maxScore: 2,
      applicable: true,
      recommendation: { priority: "medium", message: "Expand the README." },
      evidence: [{ kind: "file", path: "README.md", label: "README" }],
    },
  ],
  recommendations: [
    { findingId: "context.readme", priority: "medium", message: "Expand the README." },
  ],
};

describe("renderJsonReport", () => {
  it("emits valid JSON with schema and tool versions", () => {
    const parsed: unknown = JSON.parse(renderJsonReport(result, { displayPath: "." }));

    expect(parsed).toMatchObject({
      schemaVersion: SCHEMA_VERSION,
      toolVersion: TOOL_VERSION,
      repository: { path: "." },
      score: 42,
      categories: [{ id: "context", score: 1, maxScore: 2 }],
      recommendations: [
        { findingId: "context.readme", priority: "medium", message: "Expand the README." },
      ],
    });
  });

  it("includes finding fields required by the schema", () => {
    const parsed = JSON.parse(renderJsonReport(result, { displayPath: "." })) as {
      findings: Record<string, unknown>[];
    };

    expect(parsed.findings[0]).toStrictEqual({
      id: "context.readme",
      category: "context",
      status: "warning",
      title: "README is thin",
      message: "README exists but has little setup information.",
      score: 1,
      maxScore: 2,
      applicable: true,
      evidence: [{ kind: "file", path: "README.md", label: "README" }],
    });
  });

  it("is deterministic for identical input", () => {
    expect(renderJsonReport(result, { displayPath: "." })).toBe(
      renderJsonReport(result, { displayPath: "." }),
    );
  });

  it("emits no ANSI sequences", () => {
    expect(renderJsonReport(result, { displayPath: "." })).not.toContain("\u001b[");
  });
});
