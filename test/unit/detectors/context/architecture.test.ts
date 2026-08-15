import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../../src/core/repository-context.js";
import { architectureContextDetector } from "../../../../src/detectors/context/architecture.js";
import { architectureInstructionsDetector } from "../../../../src/detectors/instructions/architecture.js";
import { createTempRepo, fixture } from "../../../helpers/temp-repo.js";

async function analyzeFixture(name: string) {
  return architectureContextDetector.analyze(await buildRepositoryContext(fixture(name)));
}

async function analyzeFiles(files: Record<string, string>) {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await architectureContextDetector.analyze(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

const DESIGN_DOCUMENT = [
  "# Architecture",
  "",
  "The service is split into three layers. The transport layer parses requests,",
  "the domain layer owns the rules, and the storage layer is the only code that",
  "talks to the database. Nothing skips a layer, which keeps persistence details",
  "out of the rest of the codebase and makes each layer testable on its own.",
  "",
  "## Project structure",
  "",
  "```text",
  "src/",
  "├── transport/",
  "├── domain/",
  "└── storage/",
  "```",
].join("\n");

describe("context.architecture", () => {
  it("passes documentation that is linked from the README", async () => {
    const finding = await analyzeFixture("node-healthy");

    expect(finding.id).toBe("context.architecture");
    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
    expect(finding.evidence?.map((entry) => entry.label)).toContain("Referenced from the README");
  });

  it("fails when no design documentation exists", async () => {
    const finding = await analyzeFiles({
      "README.md": "# app\n\nA service.\n",
      "src/index.js": "export const a = 1;\n",
    });

    expect(finding.status).toBe("fail");
    expect(finding.score).toBe(0);
    expect(finding.recommendation?.priority).toBe("medium");
  });

  it("warns when a design document exists but nothing points at it", async () => {
    const finding = await analyzeFiles({
      "README.md": "# app\n\nA service that forwards webhooks.\n",
      "docs/design.md": "# Design\n\nThe service is split into two processes.\n",
    });

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(2);
    expect(finding.recommendation?.message).toContain("Link the architecture document");
  });

  it("counts architecture written in the README as reachable by definition", async () => {
    const finding = await analyzeFiles({
      "README.md": `# app\n\nA service.\n\n${DESIGN_DOCUMENT.replace("# Architecture", "## Architecture")}`,
    });

    expect(finding.status).toBe("pass");
    // Document plus reachability plus the directory map; no decision records.
    expect(finding.score).toBe(4);
  });

  it("credits decision records", async () => {
    const finding = await analyzeFiles({
      "README.md": "# app\n\nSee [docs/architecture.md](docs/architecture.md).\n",
      "docs/architecture.md": DESIGN_DOCUMENT,
      "docs/adr/0001-layering.md": "# 1. Layering\n\nStatus: accepted\n",
    });

    expect(finding.score).toBe(5);
    expect(finding.evidence?.map((entry) => entry.label)).toContain("Decision records");
  });

  it("does not accept an empty architecture heading as context", async () => {
    const finding = await analyzeFiles({
      "README.md": "# app\n\nA service that forwards webhooks.\n\n## Architecture\n",
    });

    expect(finding.status).toBe("fail");
    expect(finding.score).toBe(0);
  });

  it("scores the same evidence differently from instructions.architecture", async () => {
    const files = {
      "README.md": "# app\n\nA service that forwards webhooks.\n",
      "docs/design.md": DESIGN_DOCUMENT,
    };

    const { root, cleanup } = await createTempRepo(files);
    try {
      const context = await buildRepositoryContext(root);
      const [contextFinding, instructionsFinding] = await Promise.all([
        architectureContextDetector.analyze(context),
        architectureInstructionsDetector.analyze(context),
      ]);

      // The same document: substantial enough to edit against, but not linked
      // from the entry point, so only the instructions detector passes.
      expect(instructionsFinding.status).toBe("pass");
      expect(contextFinding.status).toBe("warning");
    } finally {
      await cleanup();
    }
  });
});
