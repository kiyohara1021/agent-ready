import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../../src/core/repository-context.js";
import { typecheckAutomationDetector } from "../../../../src/detectors/automation/typecheck.js";
import { createTempRepo, fixture, SAMPLE_REPO } from "../../../helpers/temp-repo.js";

async function analyzeFixture(name: string) {
  return typecheckAutomationDetector.analyze(await buildRepositoryContext(fixture(name)));
}

async function analyzeFiles(files: Record<string, string>) {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await typecheckAutomationDetector.analyze(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

describe("automation.typecheck", () => {
  it("awards full credit to a TypeScript project checked in CI", async () => {
    const finding = await analyzeFixture("node-healthy");

    expect(finding.id).toBe("automation.typecheck");
    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
    expect(finding.evidence).toContainEqual({
      kind: "config",
      path: "tsconfig.json",
      label: "Configured tool: TypeScript",
    });
  });

  it("recognizes PHP static analysis", async () => {
    const finding = await analyzeFixture("php-composer");

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
    expect(finding.evidence?.map((entry) => entry.path)).toContain("phpstan.neon");
  });

  it("recognizes mypy configured in pyproject.toml", async () => {
    const finding = await analyzeFixture("python-uv");

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
  });

  it("counts a combined analyzer for both linting and type analysis", async () => {
    const finding = await analyzeFiles({
      "pubspec.yaml": "name: app\n",
      "analysis_options.yaml": "include: package:lints/recommended.yaml\n",
      "lib/main.dart": "void main() {}\n",
    });

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(4);
  });

  it("fails a Python project that analyzes nothing", async () => {
    const finding = await analyzeFiles({
      "pyproject.toml": "[project]\nname = 'app'\n\n[tool.ruff]\nline-length = 100\n",
      "src/app.py": "value = 1\n",
    });

    expect(finding.status).toBe("fail");
    expect(finding.score).toBe(0);
    expect(finding.applicable).toBe(true);
    expect(finding.recommendation?.priority).toBe("medium");
  });

  it("is not applicable to a plain JavaScript project", async () => {
    const finding = await typecheckAutomationDetector.analyze(
      await buildRepositoryContext(SAMPLE_REPO),
    );

    expect(finding.applicable).toBe(false);
    expect(finding.status).toBe("info");
    expect(finding.recommendation).toBeUndefined();
  });

  it("is not applicable to an ecosystem whose compiler is the type checker", async () => {
    const finding = await analyzeFixture("minimal-repo");

    expect(finding.applicable).toBe(false);
  });

  it("still applies when such an ecosystem defines a static analysis command", async () => {
    const finding = await analyzeFiles({
      "go.mod": "module example.com/app\n",
      "main.go": "package main\n",
      Makefile: "vet:\n\tgo vet ./...\n",
    });

    expect(finding.applicable).toBe(true);
    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(3);
  });

  it("is not applicable to an empty repository", async () => {
    expect((await analyzeFiles({})).applicable).toBe(false);
  });
});
