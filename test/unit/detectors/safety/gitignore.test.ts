import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../../src/core/repository-context.js";
import { gitignoreSafetyDetector } from "../../../../src/detectors/safety/gitignore.js";
import { createTempRepo, fixture, SAMPLE_REPO } from "../../../helpers/temp-repo.js";

async function analyzeFixture(name: string) {
  return gitignoreSafetyDetector.analyze(await buildRepositoryContext(fixture(name)));
}

async function analyzeFiles(files: Record<string, string>) {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await gitignoreSafetyDetector.analyze(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

const NODE_PROJECT = {
  "package.json": '{ "name": "app" }\n',
  "src/index.js": "export const a = 1;\n",
};

describe("safety.gitignore", () => {
  it("passes a .gitignore that covers build output and local files", async () => {
    const finding = await analyzeFixture("node-healthy");

    expect(finding.id).toBe("safety.gitignore");
    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
  });

  it("fails a code repository with no .gitignore", async () => {
    const finding = await analyzeFiles(NODE_PROJECT);

    expect(finding.status).toBe("fail");
    expect(finding.score).toBe(0);
    expect(finding.recommendation?.priority).toBe("high");
  });

  it("warns rather than fails when little is produced locally", async () => {
    const finding = await analyzeFixture("docs-only");

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(1);
    expect(finding.recommendation?.priority).toBe("low");
  });

  it("warns when the ecosystem's build artifacts are not covered", async () => {
    const finding = await analyzeFiles({ ...NODE_PROJECT, ".gitignore": "*.log\n" });

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(3);
    expect(finding.message).toContain("Node.js");
    expect(finding.recommendation?.priority).toBe("medium");
  });

  it("warns when logs and local overrides are not covered", async () => {
    const finding = await gitignoreSafetyDetector.analyze(
      await buildRepositoryContext(SAMPLE_REPO),
    );

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(4);
    expect(finding.message).toContain("logs, caches, and local overrides");
  });

  it("treats an empty .gitignore as no rules at all", async () => {
    const finding = await analyzeFiles({ ...NODE_PROJECT, ".gitignore": "# nothing yet\n" });

    expect(finding.status).toBe("fail");
    expect(finding.score).toBe(0);
  });

  it("accepts rules written in any of gitignore's spellings", async () => {
    const finding = await analyzeFiles({
      ...NODE_PROJECT,
      ".gitignore": "/node_modules\n**/coverage/\n*.log\n",
    });

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
  });
});
