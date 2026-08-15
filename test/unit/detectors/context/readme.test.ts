import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../../src/core/repository-context.js";
import { readmeContextDetector } from "../../../../src/detectors/context/readme.js";
import { createTempRepo, fixture } from "../../../helpers/temp-repo.js";

async function analyzeFixture(name: string) {
  return readmeContextDetector.analyze(await buildRepositoryContext(fixture(name)));
}

async function analyzeFiles(files: Record<string, string>) {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await readmeContextDetector.analyze(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

const DESCRIPTION = [
  "# app",
  "",
  "A small service that receives webhooks, validates their signatures, and",
  "forwards the payload to an internal queue for later processing. It is",
  "deployed as a single container and keeps no state of its own.",
  "",
].join("\n");

describe("context.readme", () => {
  it("passes a README that describes the project and orients a reader", async () => {
    const finding = await analyzeFixture("node-healthy");

    expect(finding.id).toBe("context.readme");
    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
    expect(finding.evidence?.[0]).toStrictEqual({
      kind: "file",
      path: "README.md",
      label: "README",
    });
  });

  it("fails when there is no README", async () => {
    const finding = await analyzeFiles({ "src/index.js": "export const a = 1;\n" });

    expect(finding.status).toBe("fail");
    expect(finding.score).toBe(0);
    expect(finding.recommendation?.priority).toBe("high");
  });

  it("warns that a title-only README is minimal", async () => {
    const finding = await analyzeFiles({ "README.md": "# app\n" });

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(1);
    expect(finding.title).toContain("minimal");
  });

  it("credits the description but warns when nothing orients a reader", async () => {
    const finding = await analyzeFiles({ "README.md": DESCRIPTION });

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(2);
    expect(finding.message).toContain("no setup, usage, or development section");
  });

  it("awards a point per orientation section", async () => {
    const finding = await analyzeFiles({
      "README.md": `${DESCRIPTION}\n## Setup\n\n\`\`\`bash\nnpm ci\n\`\`\`\n\n## Usage\n\nSend a POST request to \`/hooks\` with a signed payload.\n`,
    });

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(4);
    expect(finding.recommendation?.message).toContain("development");
  });

  it("does not credit a heading with nothing behind it", async () => {
    const finding = await analyzeFiles({
      "README.md": `${DESCRIPTION}\n## Setup\n\n## Usage\n\n## Development\n`,
    });

    expect(finding.score).toBe(2);
    expect(finding.status).toBe("warning");
  });

  it("reads a README in a non-Markdown format", async () => {
    const finding = await analyzeFiles({
      "README.rst": [
        "app",
        "===",
        "",
        "A small service that receives webhooks, validates their signatures, and",
        "forwards the payload to an internal queue for later processing. It is",
        "deployed as a single container and keeps no state of its own.",
        "",
        "Setup",
        "=====",
        "",
        "Run ``pip install -e .`` to prepare a development environment.",
      ].join("\n"),
    });

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(3);
    expect(finding.evidence?.[0]?.path).toBe("README.rst");
  });
});
