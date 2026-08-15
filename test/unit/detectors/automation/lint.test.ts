import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../../src/core/repository-context.js";
import { lintAutomationDetector } from "../../../../src/detectors/automation/lint.js";
import { createTempRepo, fixture, SAMPLE_REPO } from "../../../helpers/temp-repo.js";

async function analyzeFixture(name: string) {
  return lintAutomationDetector.analyze(await buildRepositoryContext(fixture(name)));
}

async function analyzeFiles(files: Record<string, string>) {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await lintAutomationDetector.analyze(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

describe("automation.lint", () => {
  it("awards full credit to a script backed by configuration and run in CI", async () => {
    const finding = await analyzeFixture("node-healthy");

    expect(finding.id).toBe("automation.lint");
    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
    expect(finding.evidence).toContainEqual({
      kind: "script",
      path: "package.json",
      label: "Defined command: npm run lint",
    });
  });

  it("recognizes a Composer project's code style script", async () => {
    const finding = await analyzeFixture("php-composer");

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
    expect(finding.evidence?.map((entry) => entry.label)).toContain("Defined command: composer lint");
  });

  it("recognizes Python tooling configured in pyproject.toml", async () => {
    const finding = await analyzeFixture("python-uv");

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
    expect(finding.evidence).toContainEqual({
      kind: "config",
      path: "pyproject.toml",
      label: "Configured tool: Ruff",
    });
  });

  it("infers the command from configuration alone", async () => {
    const finding = await analyzeFiles({
      "pyproject.toml": "[project]\nname = 'app'\n\n[tool.ruff]\nline-length = 100\n",
      "src/app.py": "value = 1\n",
    });

    // Configuration proves both the command and its settings; CI does not run it.
    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(4);
    expect(finding.recommendation?.message).toContain("CI");
  });

  it("withholds the configuration point when nothing is checked in", async () => {
    const finding = await lintAutomationDetector.analyze(
      await buildRepositoryContext(SAMPLE_REPO),
    );

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(3);
    expect(finding.message).toContain("no linter configuration is checked in");
  });

  it("warns rather than fails when the ecosystem ships a check that is unused", async () => {
    const finding = await analyzeFixture("minimal-repo");

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(1);
    expect(finding.message).toContain("go vet");
    expect(finding.evidence).toContainEqual({
      kind: "file",
      path: "go.mod",
      label: "Ecosystem check available: go vet ./...",
    });
  });

  it("fails when an ecosystem with no built-in check configures nothing", async () => {
    const finding = await analyzeFiles({
      Gemfile: "source 'https://rubygems.org'\n",
      "lib/app.rb": "puts 1\n",
    });

    expect(finding.status).toBe("fail");
    expect(finding.score).toBe(0);
    expect(finding.applicable).toBe(true);
  });

  it("is not applicable to a repository with nothing to lint", async () => {
    const finding = await analyzeFixture("docs-only");

    expect(finding.applicable).toBe(false);
    expect(finding.status).toBe("info");
  });

  it("is not applicable to an empty repository", async () => {
    expect((await analyzeFiles({})).applicable).toBe(false);
  });
});
