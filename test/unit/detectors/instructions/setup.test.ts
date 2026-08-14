import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../../src/core/repository-context.js";
import { setupInstructionsDetector } from "../../../../src/detectors/instructions/setup.js";
import { createTempRepo, fixture } from "../../../helpers/temp-repo.js";

async function analyzeFixture(name: string) {
  return setupInstructionsDetector.analyze(await buildRepositoryContext(fixture(name)));
}

async function analyzeFiles(files: Record<string, string>) {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await setupInstructionsDetector.analyze(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

describe("instructions.setup", () => {
  it("awards full credit for install, runtime, and run instructions", async () => {
    const finding = await analyzeFixture("node-healthy");

    expect(finding.id).toBe("instructions.setup");
    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
    expect(finding.recommendation).toBeUndefined();
  });

  it("passes a non-Node project and reports the missing sub-criterion", async () => {
    const finding = await analyzeFixture("python-uv");

    expect(finding.status).toBe("pass");
    // `uv sync` plus a pinned Python version, but no documented run command.
    expect(finding.score).toBe(4);
    expect(finding.recommendation?.priority).toBe("low");
    expect(finding.message).toContain("run the project locally");
  });

  it("warns when a manifest implies setup that nothing documents", async () => {
    const finding = await analyzeFixture("minimal-repo");

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(1);
    expect(finding.recommendation?.priority).toBe("high");
    expect(finding.evidence?.[0]?.path).toBe("go.mod");
  });

  it("fails when nothing explains or implies setup", async () => {
    const finding = await analyzeFixture("docs-only");

    expect(finding.status).toBe("fail");
    expect(finding.score).toBe(0);
    expect(finding.recommendation?.priority).toBe("high");
  });

  it("recognizes Composer setup instructions", async () => {
    const finding = await analyzeFiles({
      "composer.json": JSON.stringify({ name: "acme/app" }),
      "README.md": [
        "# app",
        "",
        "## Requirements",
        "",
        "PHP 8.3",
        "",
        "## Install",
        "",
        "```bash",
        "composer install",
        "```",
        "",
        "```bash",
        "php artisan serve",
        "```",
      ].join("\n"),
    });

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
  });

  it("reads commands written with a shell prompt", async () => {
    const finding = await analyzeFiles({
      "README.md": ["# app", "", "```", "$ cargo build", "```"].join("\n"),
      "Cargo.toml": "[package]\nname = \"app\"\n",
    });

    expect(finding.status).toBe("pass");
    expect(finding.score).toBeGreaterThanOrEqual(3);
  });

  it("does not accept an install command that only appears in prose", async () => {
    const finding = await analyzeFiles({
      "package.json": "{}",
      "README.md": "# app\n\nInstall the dependencies with npm install, then start hacking.\n",
    });

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(1);
  });

  it("does not accept a nested project's instructions as the repository's own", async () => {
    const finding = await analyzeFiles({
      "package.json": "{}",
      "README.md": "# app\n",
      // A vendored or fixture project inside the repository.
      "examples/demo/AGENTS.md": "# demo\n\n```bash\nnpm ci\n```\n",
    });

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(1);
  });

  it("finds setup instructions in a documentation directory", async () => {
    const finding = await analyzeFiles({
      "docs/getting-started.md": ["# Getting started", "", "```bash", "uv sync", "```"].join("\n"),
    });

    expect(finding.status).toBe("pass");
    expect(finding.evidence?.[0]?.path).toBe("docs/getting-started.md");
  });
});
