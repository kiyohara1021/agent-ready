import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../../src/core/repository-context.js";
import { metadataContextDetector } from "../../../../src/detectors/context/metadata.js";
import { createTempRepo, fixture } from "../../../helpers/temp-repo.js";

async function analyzeFixture(name: string) {
  return metadataContextDetector.analyze(await buildRepositoryContext(fixture(name)));
}

async function analyzeFiles(files: Record<string, string>) {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await metadataContextDetector.analyze(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

describe("context.metadata", () => {
  it("passes a manifest that declares every signal", async () => {
    const finding = await analyzeFixture("node-healthy");

    expect(finding.id).toBe("context.metadata");
    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
    expect(finding.recommendation).toBeUndefined();
  });

  it("fails when nothing identifies the project", async () => {
    const finding = await analyzeFiles({ "src/index.js": "export const a = 1;\n" });

    expect(finding.status).toBe("fail");
    expect(finding.score).toBe(0);
  });

  it("names the missing signals without repeating an article", async () => {
    const finding = await analyzeFiles({
      "package.json": '{ "name": "app" }\n',
      "src/index.js": "export const a = 1;\n",
    });

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(1);
    expect(finding.message).toBe(
      "The repository declares no description or license or repository URL or runtime or toolchain constraint.",
    );
  });

  it("does not penalize a non-Node project for a missing npm description", async () => {
    const finding = await analyzeFiles({
      "Cargo.toml": [
        "[package]",
        'name = "app"',
        'description = "A command line tool for archiving feeds."',
        'license = "MIT"',
        'repository = "https://example.invalid/app"',
        'rust-version = "1.80"',
      ].join("\n"),
      "src/main.rs": "fn main() {}\n",
    });

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
  });

  it("warns when the project never says what it is", async () => {
    const finding = await analyzeFiles({
      "package.json": '{ "name": "app", "license": "MIT", "homepage": "https://example.invalid" }\n',
      ".nvmrc": "22\n",
      "src/index.js": "export const a = 1;\n",
    });

    // Four signals, but no description: identity is still unclear.
    expect(finding.score).toBe(4);
    expect(finding.status).toBe("warning");
    expect(finding.recommendation?.priority).toBe("medium");
  });

  it("accepts a README as the source of identity", async () => {
    const finding = await analyzeFiles({
      "README.md": [
        "# feed-tool",
        "",
        "A command line tool that fetches feeds, normalizes their entries, and",
        "writes them into a local archive for later processing.",
      ].join("\n"),
      "LICENSE": "MIT License\n",
    });

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(3);
    // Evidence order follows the discovery order — files first, then the README.
    expect(finding.evidence?.map((entry) => entry.path)).toStrictEqual([
      "LICENSE",
      "README.md",
      "README.md",
    ]);
  });
});
