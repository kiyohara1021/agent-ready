import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../src/core/repository-context.js";
import {
  committedByConvention,
  conventionalGeneratedPaths,
  discoverGeneratedContent,
  type GeneratedDirectory,
} from "../../../src/discovery/generated.js";
import { createTempRepo } from "../../helpers/temp-repo.js";

/**
 * Generated directories cannot live in a committed fixture — they are exactly
 * what a repository excludes — so every case here builds a temp repository.
 */
async function generatedIn(
  files: Record<string, string>,
  directories: readonly string[] = [],
): Promise<GeneratedDirectory[]> {
  const { root, cleanup } = await createTempRepo(files);
  try {
    for (const directory of directories) {
      await mkdir(path.join(root, ...directory.split("/")), { recursive: true });
      await writeFile(path.join(root, ...directory.split("/"), "artifact.txt"), "generated");
    }
    return await discoverGeneratedContent(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

const NODE_PROJECT = {
  "package.json": '{ "name": "app" }\n',
  "src/index.js": "export const a = 1;\n",
};

describe("discoverGeneratedContent", () => {
  it("sees a directory that indexing skipped", async () => {
    const [directory] = await generatedIn(NODE_PROJECT, ["node_modules/pino"]);

    expect(directory?.path).toBe("node_modules");
    expect(directory?.skipped).toBe(true);
    expect(directory?.indexedFiles).toBe(0);
    expect(directory?.excluded).toBe(false);
  });

  it("reports a skipped directory as excluded when ignore rules cover it", async () => {
    const [directory] = await generatedIn(
      { ...NODE_PROJECT, ".gitignore": "node_modules/\n" },
      ["node_modules/pino"],
    );

    expect(directory?.excluded).toBe(true);
  });

  it("counts generated files that are still visible in the index", async () => {
    const directories = await generatedIn({
      ...NODE_PROJECT,
      "__pycache__/core.cpython-312.pyc": "\n",
      "__pycache__/util.cpython-312.pyc": "\n",
    });

    expect(directories).toHaveLength(1);
    expect(directories[0]?.path).toBe("__pycache__");
    expect(directories[0]?.skipped).toBe(false);
    expect(directories[0]?.indexedFiles).toBe(2);
  });

  it("finds nested generated directories and orders them by path", async () => {
    const directories = await generatedIn(NODE_PROJECT, [
      "packages/api/node_modules",
      "node_modules",
    ]);

    expect(directories.map((entry) => entry.path)).toStrictEqual([
      "node_modules",
      "packages/api/node_modules",
    ]);
  });

  it("reports nothing for a repository with no generated content", async () => {
    expect(await generatedIn(NODE_PROJECT)).toStrictEqual([]);
  });

  it("does not treat source directories as generated output", async () => {
    const directories = await generatedIn({
      ...NODE_PROJECT,
      "bin/cli.js": "#!/usr/bin/env node\n",
      "lib/util.js": "export const b = 2;\n",
      "out/report.txt": "not recognized\n",
    });

    expect(directories).toStrictEqual([]);
  });

  it("knows which ecosystems check a vendored copy in", () => {
    expect(committedByConvention("vendor")).toStrictEqual(["go", "ruby"]);
    expect(committedByConvention("node_modules")).toStrictEqual([]);
  });

  it("maps ecosystems to the output they conventionally generate", () => {
    expect(conventionalGeneratedPaths("node")).toContain("node_modules");
    expect(conventionalGeneratedPaths("rust")).toStrictEqual(["target"]);
    // Go builds into no conventional directory, so it is never asked for one.
    expect(conventionalGeneratedPaths("go")).toStrictEqual([]);
  });
});
