import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../../src/core/repository-context.js";
import { ignoreContextDetector } from "../../../../src/detectors/context/ignore.js";
import { createTempRepo, fixture, SAMPLE_REPO } from "../../../helpers/temp-repo.js";

async function analyzeFixture(name: string) {
  return ignoreContextDetector.analyze(await buildRepositoryContext(fixture(name)));
}

async function analyzeFiles(files: Record<string, string>) {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await ignoreContextDetector.analyze(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

const NODE_PROJECT = {
  "package.json": '{ "name": "app" }\n',
  "src/index.js": "export const a = 1;\n",
};

describe("context.ignore", () => {
  it("passes rules that cover generated output and editor noise", async () => {
    const finding = await analyzeFixture("node-healthy");

    expect(finding.id).toBe("context.ignore");
    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
    expect(finding.evidence?.[0]?.path).toBe(".gitignore");
  });

  it("fails when there is no ignore configuration at all", async () => {
    const finding = await analyzeFiles(NODE_PROJECT);

    expect(finding.status).toBe("fail");
    expect(finding.score).toBe(0);
    expect(finding.recommendation?.priority).toBe("medium");
  });

  it("warns when the ecosystem's generated output is not excluded", async () => {
    const finding = await analyzeFiles({ ...NODE_PROJECT, ".gitignore": ".DS_Store\n" });

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(3);
    expect(finding.message).toContain("Node.js");
  });

  it("warns when editor and operating-system files are not excluded", async () => {
    const finding = await ignoreContextDetector.analyze(
      await buildRepositoryContext(SAMPLE_REPO),
    );

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(4);
    expect(finding.message).toContain("editor and operating-system files");
  });

  it("accepts an agent ignore file in place of editor rules", async () => {
    const finding = await analyzeFiles({
      ...NODE_PROJECT,
      ".gitignore": "node_modules/\n",
      ".cursorignore": "docs/generated/\n",
    });

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
    expect(finding.evidence?.map((entry) => entry.path)).toStrictEqual([
      ".gitignore",
      ".cursorignore",
    ]);
  });

  it("does not require generated rules from an ecosystem that generates nothing", async () => {
    const finding = await analyzeFiles({
      "go.mod": "module example.com/app\n\ngo 1.22\n",
      "main.go": "package main\n",
      ".gitignore": ".DS_Store\n",
    });

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
  });

  it("credits an agent ignore file when there is no .gitignore", async () => {
    const finding = await analyzeFiles({
      ...NODE_PROJECT,
      ".agentignore": "node_modules/\n",
    });

    // Present but weaker: agent rules narrow reading, not committing.
    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(4);
  });
});
