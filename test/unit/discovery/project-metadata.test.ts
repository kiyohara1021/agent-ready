import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../src/core/repository-context.js";
import {
  discoverProjectMetadata,
  hasMetadata,
  type MetadataKind,
  type MetadataSignal,
} from "../../../src/discovery/project-metadata.js";
import { createTempRepo, fixture } from "../../helpers/temp-repo.js";

async function signalsFor(files: Record<string, string>): Promise<MetadataSignal[]> {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await discoverProjectMetadata(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

function kinds(signals: readonly MetadataSignal[]): MetadataKind[] {
  return signals.map((signal) => signal.kind).sort();
}

describe("discoverProjectMetadata", () => {
  it("reads every signal from a complete npm manifest", async () => {
    const signals = await discoverProjectMetadata(
      await buildRepositoryContext(fixture("node-healthy")),
    );

    expect(kinds(signals)).toStrictEqual([
      "description",
      "license",
      "name",
      "repository",
      "runtime",
    ]);
    expect(signals.find((signal) => signal.kind === "license")?.path).toBe("package.json");
  });

  it("does not ask a non-Node project for npm fields", async () => {
    const signals = await signalsFor({
      "pyproject.toml": [
        "[project]",
        'name = "app"',
        'description = "A small tool for processing feeds."',
        'requires-python = ">=3.12"',
        "",
        "[project.urls]",
        'Repository = "https://example.invalid/app"',
      ].join("\n"),
      "LICENSE": "MIT License\n",
      "src/app.py": "x = 1\n",
    });

    expect(kinds(signals)).toStrictEqual([
      "description",
      "license",
      "name",
      "repository",
      "runtime",
    ]);
  });

  it("falls back to the README for name and description", async () => {
    const signals = await signalsFor({
      "README.md": [
        "# feed-tool",
        "",
        "A small command line tool that fetches feeds, normalizes their entries,",
        "and writes them to a local archive directory for later processing.",
      ].join("\n"),
    });

    expect(kinds(signals)).toStrictEqual(["description", "name"]);
    expect(signals.every((signal) => signal.path === "README.md")).toBe(true);
  });

  it("does not count an empty or placeholder field", async () => {
    const signals = await signalsFor({
      "package.json": '{ "name": "app", "description": "", "license": "" }\n',
      "src/index.js": "export const a = 1;\n",
    });

    expect(kinds(signals)).toStrictEqual(["name"]);
  });

  it("treats a one-word description as a name repeated", async () => {
    const signals = await signalsFor({
      "package.json": '{ "name": "app", "description": "app" }\n',
      "src/index.js": "export const a = 1;\n",
    });

    expect(hasMetadata(signals, "description")).toBe(false);
  });

  it("credits a license file when the manifest declares none", async () => {
    const signals = await signalsFor({
      "package.json": '{ "name": "app" }\n',
      "LICENSE.md": "MIT License\n",
      "src/index.js": "export const a = 1;\n",
    });

    expect(signals.find((signal) => signal.kind === "license")?.path).toBe("LICENSE.md");
  });

  it("credits a toolchain pin file as a runtime constraint", async () => {
    const signals = await signalsFor({
      "package.json": '{ "name": "app" }\n',
      ".nvmrc": "22\n",
      "src/index.js": "export const a = 1;\n",
    });

    expect(signals.find((signal) => signal.kind === "runtime")?.path).toBe(".nvmrc");
  });

  it("reads a Go module path as both name and home", async () => {
    const signals = await signalsFor({
      "go.mod": "module github.com/example/app\n\ngo 1.22\n",
      "main.go": "package main\n",
    });

    expect(kinds(signals)).toStrictEqual(["name", "repository", "runtime"]);
  });

  it("reports nothing for an empty repository", async () => {
    expect(await signalsFor({})).toStrictEqual([]);
  });
});
