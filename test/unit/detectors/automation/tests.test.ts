import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../../src/core/repository-context.js";
import { testAutomationDetector } from "../../../../src/detectors/automation/tests.js";
import { createTempRepo, fixture, SAMPLE_REPO } from "../../../helpers/temp-repo.js";

async function analyzeFixture(name: string) {
  return testAutomationDetector.analyze(await buildRepositoryContext(fixture(name)));
}

async function analyzeFiles(files: Record<string, string>) {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await testAutomationDetector.analyze(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

describe("automation.tests", () => {
  it("awards full credit to a Node project with a script, a suite, and CI", async () => {
    const finding = await analyzeFixture("node-healthy");

    expect(finding.id).toBe("automation.tests");
    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
    expect(finding.evidence).toContainEqual({
      kind: "script",
      path: "package.json",
      label: "Defined command: npm test",
    });
  });

  it("recognizes a Composer project through its script and runner configuration", async () => {
    const finding = await analyzeFixture("php-composer");

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
    expect(finding.evidence?.map((entry) => entry.label)).toContain("Defined command: composer test");
  });

  it("recognizes a Python project configured in pyproject.toml", async () => {
    const finding = await analyzeFixture("python-uv");

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
    expect(finding.evidence?.some((entry) => entry.path === "pyproject.toml")).toBe(true);
  });

  it("withholds points when the command exists but nothing tests it", async () => {
    const finding = await testAutomationDetector.analyze(
      await buildRepositoryContext(SAMPLE_REPO),
    );

    // Script plus a CI step, but the repository contains no test files.
    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(4);
    expect(finding.recommendation?.message).toContain("Add tests");
  });

  it("infers an ecosystem's built-in runner when tests exist", async () => {
    const finding = await analyzeFiles({
      "Cargo.toml": "[package]\nname = 'app'\n",
      "src/lib.rs": "pub fn add() {}\n",
      "tests/integration.rs": "#[test]\nfn works() {}\n",
    });

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(4);
    expect(finding.evidence).toContainEqual({
      kind: "file",
      path: "Cargo.toml",
      label: "Conventional command: cargo test",
    });
  });

  it("warns when a testable ecosystem has no test entry point", async () => {
    const finding = await analyzeFixture("minimal-repo");

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(1);
    expect(finding.recommendation?.priority).toBe("high");
  });

  it("does not accept a placeholder test script", async () => {
    const finding = await analyzeFiles({
      "package.json": JSON.stringify({
        scripts: { test: 'echo "Error: no test specified" && exit 1' },
      }),
      "src/index.js": "export const a = 1;\n",
    });

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(1);
  });

  it("fails when source files exist with no test automation at all", async () => {
    const finding = await analyzeFiles({ "script.py": "print(1)\n" });

    expect(finding.status).toBe("fail");
    expect(finding.score).toBe(0);
    expect(finding.applicable).toBe(true);
  });

  it("is not applicable to a repository with no testable software", async () => {
    const finding = await analyzeFixture("docs-only");

    expect(finding.applicable).toBe(false);
    expect(finding.status).toBe("info");
    expect(finding.recommendation).toBeUndefined();
  });

  it("is not applicable to an empty repository", async () => {
    expect((await analyzeFiles({})).applicable).toBe(false);
  });
});
