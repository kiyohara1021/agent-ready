import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../../src/core/repository-context.js";
import { dependencyAutomationDetector } from "../../../../src/detectors/automation/dependencies.js";
import { createTempRepo, fixture, SAMPLE_REPO } from "../../../helpers/temp-repo.js";

async function analyzeFixture(name: string) {
  return dependencyAutomationDetector.analyze(await buildRepositoryContext(fixture(name)));
}

async function analyzeFiles(files: Record<string, string>) {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await dependencyAutomationDetector.analyze(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

const NODE_PROJECT = {
  "package.json": '{ "name": "app" }\n',
  "src/index.js": "export const a = 1;\n",
};

describe("automation.dependencies", () => {
  it("awards full credit to Dependabot covering packages and actions", async () => {
    const finding = await analyzeFixture("node-healthy");

    expect(finding.id).toBe("automation.dependencies");
    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
    expect(finding.evidence).toStrictEqual([
      { kind: "config", path: ".github/dependabot.yml", label: "Dependabot configuration" },
    ]);
  });

  it("withholds a point when CI action versions are not covered", async () => {
    const finding = await analyzeFixture("php-composer");

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(4);
    expect(finding.recommendation?.message).toContain("CI action versions");
  });

  it("credits Renovate with the coverage its defaults provide", async () => {
    const finding = await analyzeFixture("python-uv");

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
    expect(finding.evidence).toStrictEqual([
      { kind: "config", path: "renovate.json", label: "Renovate configuration" },
    ]);
  });

  it("finds Renovate configured inside package.json", async () => {
    const finding = await analyzeFiles({
      "package.json": '{ "name": "app", "renovate": { "extends": ["config:recommended"] } }\n',
      "src/index.js": "export const a = 1;\n",
    });

    expect(finding.status).toBe("pass");
    expect(finding.evidence?.[0]?.path).toBe("package.json");
  });

  it("does not credit updates for an ecosystem the repository does not use", async () => {
    const finding = await analyzeFiles({
      ...NODE_PROJECT,
      ".github/dependabot.yml": [
        "version: 2",
        "updates:",
        '  - package-ecosystem: "cargo"',
        '    directory: "/"',
      ].join("\n"),
    });

    expect(finding.score).toBe(3);
    expect(finding.message).toContain("the package ecosystems this repository uses");
  });

  it("warns when the configuration declares no update targets", async () => {
    const finding = await analyzeFiles({
      ...NODE_PROJECT,
      ".github/dependabot.yml": "version: 2\nupdates: []\n",
    });

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(1);
  });

  it("fails when no dependency automation is configured", async () => {
    const finding = await dependencyAutomationDetector.analyze(
      await buildRepositoryContext(SAMPLE_REPO),
    );

    expect(finding.status).toBe("fail");
    expect(finding.score).toBe(0);
    expect(finding.recommendation?.priority).toBe("low");
  });

  it("is not applicable without dependencies or workflows", async () => {
    const finding = await analyzeFixture("docs-only");

    expect(finding.applicable).toBe(false);
    expect(finding.status).toBe("info");
  });

  it("is not applicable to an empty repository", async () => {
    expect((await analyzeFiles({})).applicable).toBe(false);
  });
});
