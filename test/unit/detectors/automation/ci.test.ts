import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../../src/core/repository-context.js";
import { ciAutomationDetector } from "../../../../src/detectors/automation/ci.js";
import { createTempRepo, fixture, SAMPLE_REPO } from "../../../helpers/temp-repo.js";

async function analyzeFixture(name: string) {
  return ciAutomationDetector.analyze(await buildRepositoryContext(fixture(name)));
}

async function analyzeFiles(files: Record<string, string>) {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await ciAutomationDetector.analyze(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

const SOURCE = { "package.json": '{ "name": "app" }\n', "src/index.js": "export const a = 1;\n" };

describe("automation.ci", () => {
  it("awards full credit when CI runs tests and static checks", async () => {
    const finding = await analyzeFixture("node-healthy");

    expect(finding.id).toBe("automation.ci");
    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
    expect(finding.evidence).toContainEqual({
      kind: "workflow",
      path: ".github/workflows/ci.yml",
      label: "CI runs npm test",
    });
  });

  it("recognizes a Composer workflow", async () => {
    const finding = await analyzeFixture("php-composer");

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
  });

  it("withholds the static-check point when CI only runs tests", async () => {
    const finding = await ciAutomationDetector.analyze(await buildRepositoryContext(SAMPLE_REPO));

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(4);
    expect(finding.recommendation?.message).toContain("lint");
  });

  it("credits a build as a static check", async () => {
    const finding = await analyzeFiles({
      ...SOURCE,
      ".github/workflows/release.yml": "jobs:\n  a:\n    steps:\n      - run: npm run build\n",
    });

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(3);
    expect(finding.message).toContain("the tests");
  });

  it("warns when a workflow exists but runs nothing recognizable", async () => {
    const finding = await analyzeFiles({
      ...SOURCE,
      ".github/workflows/ci.yml": [
        "jobs:",
        "  greet:",
        "    steps:",
        "      - uses: actions/checkout@v5",
        "      - run: ./ci/validate.sh",
      ].join("\n"),
    });

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(2);
    expect(finding.evidence).toStrictEqual([
      { kind: "workflow", path: ".github/workflows/ci.yml", label: "CI workflow" },
    ]);
  });

  it("credits an unparsed CI system with presence only", async () => {
    const finding = await analyzeFiles({
      ...SOURCE,
      ".gitlab-ci.yml": "test:\n  script: npm test\n",
    });

    expect(finding.status).toBe("warning");
    expect(finding.title).toContain("GitLab CI");
    expect(finding.score).toBe(2);
  });

  it("fails when no CI configuration exists", async () => {
    const finding = await analyzeFixture("stub-instructions");

    expect(finding.status).toBe("fail");
    expect(finding.score).toBe(0);
    expect(finding.recommendation?.priority).toBe("medium");
  });

  it("is not applicable to a repository with nothing to validate", async () => {
    const finding = await analyzeFixture("docs-only");

    expect(finding.applicable).toBe(false);
    expect(finding.status).toBe("info");
  });

  it("is not applicable to an empty repository", async () => {
    expect((await analyzeFiles({})).applicable).toBe(false);
  });
});
