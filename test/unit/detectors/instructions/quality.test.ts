import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../../src/core/repository-context.js";
import { qualityInstructionsDetector } from "../../../../src/detectors/instructions/quality.js";
import { createTempRepo, fixture, SAMPLE_REPO } from "../../../helpers/temp-repo.js";

async function analyzeFixture(name: string) {
  return qualityInstructionsDetector.analyze(await buildRepositoryContext(fixture(name)));
}

async function analyzeFiles(files: Record<string, string>) {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await qualityInstructionsDetector.analyze(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

describe("instructions.quality", () => {
  it("awards full credit when documented commands are backed by configuration", async () => {
    const finding = await analyzeFixture("node-healthy");

    expect(finding.id).toBe("instructions.quality");
    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
    expect(finding.evidence?.some((entry) => entry.label.includes("ESLint"))).toBe(true);
  });

  it("recognizes Python lint and type-check guidance", async () => {
    const finding = await analyzeFixture("python-uv");

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
    // Ruff and mypy are configured in pyproject.toml rather than in own files.
    expect(finding.evidence?.some((entry) => entry.path === "pyproject.toml")).toBe(true);
  });

  it("warns when tooling exists but no documentation mentions it", async () => {
    const finding = await qualityInstructionsDetector.analyze(
      await buildRepositoryContext(SAMPLE_REPO),
    );

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(1);
    expect(finding.recommendation?.priority).toBe("medium");
  });

  it("fails when a code project has no quality validation at all", async () => {
    const finding = await analyzeFixture("minimal-repo");

    expect(finding.status).toBe("fail");
    expect(finding.score).toBe(0);
    expect(finding.applicable).toBe(true);
  });

  it("is not applicable to a repository with no code or manifest", async () => {
    const finding = await analyzeFixture("docs-only");

    expect(finding.applicable).toBe(false);
    expect(finding.status).toBe("info");
    expect(finding.score).toBe(0);
    expect(finding.recommendation).toBeUndefined();
  });

  it("is not applicable to an empty repository", async () => {
    const finding = await analyzeFiles({});
    expect(finding.applicable).toBe(false);
  });

  it("does not require a separate type-check command from a combined analyzer", async () => {
    const finding = await analyzeFiles({
      "pubspec.yaml": "name: app\n",
      "analysis_options.yaml": "include: package:lints/recommended.yaml\n",
      "lib/main.dart": "void main() {}\n",
      "README.md": ["# app", "", "## Analysis", "", "```bash", "dart analyze", "```"].join("\n"),
    });

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
  });

  it("gives partial credit to guidance with nothing configured behind it", async () => {
    const finding = await analyzeFiles({
      "main.go": "package main\n",
      "README.md": ["# app", "", "```bash", "golangci-lint run", "```"].join("\n"),
    });

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(3);
    expect(finding.recommendation?.priority).toBe("low");
  });
});
