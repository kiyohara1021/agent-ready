import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../../src/core/repository-context.js";
import { architectureInstructionsDetector } from "../../../../src/detectors/instructions/architecture.js";
import { createTempRepo, fixture } from "../../../helpers/temp-repo.js";

async function analyzeFixture(name: string) {
  return architectureInstructionsDetector.analyze(await buildRepositoryContext(fixture(name)));
}

async function analyzeFiles(files: Record<string, string>) {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await architectureInstructionsDetector.analyze(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

const ARCHITECTURE_BODY = [
  "The service is split into three layers. The HTTP layer validates requests and",
  "shapes responses. The service layer owns business rules and is the only layer",
  "allowed to coordinate several data modules. The data layer is the only code",
  "that touches storage, which keeps query details out of everything else.",
].join("\n");

describe("instructions.architecture", () => {
  it("awards full credit for a document, a module map, and decision records", async () => {
    const finding = await analyzeFixture("node-healthy");

    expect(finding.id).toBe("instructions.architecture");
    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
    expect(finding.evidence?.map((entry) => entry.path)).toStrictEqual([
      "docs/architecture.md",
      "docs/architecture.md",
      "docs/adr/0001-record-decisions.md",
    ]);
  });

  it("passes a substantial architecture section inside a README", async () => {
    const finding = await analyzeFixture("python-uv");

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(4);
    expect(finding.evidence?.[0]?.label).toContain("Architecture section");
  });

  it("fails when no structural documentation exists", async () => {
    const finding = await analyzeFixture("minimal-repo");

    expect(finding.status).toBe("fail");
    expect(finding.score).toBe(0);
    expect(finding.recommendation?.priority).toBe("medium");
  });

  it("does not pass a heading with nothing behind it", async () => {
    const finding = await analyzeFixture("stub-instructions");

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(1);
  });

  it("does not pass a stub architecture document", async () => {
    const finding = await analyzeFiles({ "docs/architecture.md": "# Architecture\n\nTBD.\n" });

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(1);
    expect(finding.evidence?.[0]?.path).toBe("docs/architecture.md");
  });

  it("credits a directory map drawn as a tree", async () => {
    const finding = await analyzeFiles({
      "README.md": [
        "# app",
        "",
        "## Architecture",
        "",
        ARCHITECTURE_BODY,
        "",
        "```text",
        "src/",
        "├── http/",
        "├── services/",
        "└── data/",
        "```",
      ].join("\n"),
    });

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(4);
  });

  it("credits an ADR index", async () => {
    const finding = await analyzeFiles({
      "ARCHITECTURE.md": `# Architecture\n\n${ARCHITECTURE_BODY}\n`,
      "docs/adr/0001-choose-storage.md": "# 1. Choose storage\n\nAccepted.\n",
    });

    expect(finding.score).toBe(4);
    expect(finding.evidence?.map((entry) => entry.label)).toContain("Architecture decision records");
  });

  it("finds guidance in AGENTS.md as well as in dedicated documents", async () => {
    const finding = await analyzeFiles({
      "AGENTS.md": `# AGENTS.md\n\n## Modules\n\n${ARCHITECTURE_BODY}\n`,
    });

    expect(finding.status).toBe("pass");
    expect(finding.evidence?.[0]?.path).toBe("AGENTS.md");
  });
});
