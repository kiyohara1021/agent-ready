import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../../src/core/repository-context.js";
import { agentsMdDetector } from "../../../../src/detectors/instructions/agents-md.js";
import { createTempRepo, fixture, SAMPLE_REPO } from "../../../helpers/temp-repo.js";

async function analyzeFixture(name: string) {
  return agentsMdDetector.analyze(await buildRepositoryContext(fixture(name)));
}

async function analyzeFiles(files: Record<string, string>) {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await agentsMdDetector.analyze(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

describe("instructions.agents-md", () => {
  it("awards every sub-criterion for complete instructions", async () => {
    const finding = await analyzeFixture("node-healthy");

    expect(finding.id).toBe("instructions.agents-md");
    expect(finding.category).toBe("instructions");
    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(10);
    expect(finding.maxScore).toBe(10);
    expect(finding.applicable).toBe(true);
    expect(finding.evidence?.map((entry) => entry.path)).toStrictEqual([
      "AGENTS.md",
      "packages/api/AGENTS.md",
    ]);
  });

  it("passes a concise file that names real commands, without nested credit", async () => {
    const finding = await agentsMdDetector.analyze(await buildRepositoryContext(SAMPLE_REPO));

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(9);
  });

  it("fails when no AGENTS.md exists anywhere", async () => {
    const finding = await analyzeFixture("minimal-repo");

    expect(finding.status).toBe("fail");
    expect(finding.score).toBe(0);
    expect(finding.recommendation?.priority).toBe("high");
  });

  it("warns when instructions exist only in subdirectories", async () => {
    const finding = await analyzeFixture("nested-agents");

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(1);
    expect(finding.recommendation?.priority).toBe("high");
    expect(finding.evidence?.[0]?.path).toBe("packages/api/AGENTS.md");
  });

  it("gives a stub file existence credit only", async () => {
    const finding = await analyzeFixture("stub-instructions");

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(3);
    expect(finding.title).toBe("AGENTS.md has little content");
  });

  it("does not reward an empty file for its filename", async () => {
    const finding = await analyzeFiles({ "AGENTS.md": "" });

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(3);
  });

  it("credits guidance found in prose sections of a long file", async () => {
    const finding = await analyzeFiles({
      "AGENTS.md": [
        "# AGENTS.md",
        "",
        "## Constraints",
        "",
        "Do not introduce new runtime dependencies without a written rationale in",
        "the pull request description. The dependency budget is deliberate: every",
        "addition has to be reviewed, kept current, and eventually removed, and the",
        "release pipeline is audited on every change.",
        "",
      ].join("\n"),
    });

    // Constraints only: no setup or validation guidance, so it cannot pass.
    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(5);
    expect(finding.recommendation?.message).toContain("development/setup guidance");
    expect(finding.recommendation?.message).toContain("test/validation guidance");
  });

  it("recognizes non-Node instructions", async () => {
    const finding = await analyzeFixture("python-uv");

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(9);
  });

  it("returns the same finding for the same repository state", async () => {
    const context = await buildRepositoryContext(fixture("node-healthy"));

    expect(await agentsMdDetector.analyze(context)).toStrictEqual(
      await agentsMdDetector.analyze(context),
    );
  });
});
