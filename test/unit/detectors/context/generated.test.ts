import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../../src/core/repository-context.js";
import { generatedContextDetector } from "../../../../src/detectors/context/generated.js";
import type { Finding } from "../../../../src/core/types.js";
import { createTempRepo, fixture } from "../../../helpers/temp-repo.js";

/**
 * Generated directories are exactly what a repository excludes, so they cannot
 * live in a committed fixture: every case builds a temp repository instead.
 */
async function analyzeFiles(
  files: Record<string, string>,
  directories: readonly string[] = [],
): Promise<Finding> {
  const { root, cleanup } = await createTempRepo(files);
  try {
    for (const directory of directories) {
      await mkdir(path.join(root, ...directory.split("/")), { recursive: true });
      await writeFile(path.join(root, ...directory.split("/"), "artifact.txt"), "generated");
    }
    return await generatedContextDetector.analyze(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

const NODE_PROJECT = {
  "package.json": '{ "name": "app" }\n',
  "src/index.js": "export const a = 1;\n",
};

describe("context.generated", () => {
  it("passes a repository that declares and excludes its generated output", async () => {
    const finding = await generatedContextDetector.analyze(
      await buildRepositoryContext(fixture("node-healthy")),
    );

    expect(finding.id).toBe("context.generated");
    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
  });

  it("passes when an installed dependency directory is excluded", async () => {
    const finding = await analyzeFiles(
      { ...NODE_PROJECT, ".gitignore": "node_modules/\n" },
      ["node_modules/pino"],
    );

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
  });

  it("warns when present generated directories are neither excluded nor declared", async () => {
    const finding = await analyzeFiles(NODE_PROJECT, ["node_modules/pino", "dist"]);

    expect(finding.status).toBe("warning");
    // Nothing generated is readable in the index, which is the only point left.
    expect(finding.score).toBe(1);
    expect(finding.message).toContain("dist");
    expect(finding.evidence?.map((entry) => entry.path)).toStrictEqual(["dist", "node_modules"]);
  });

  it("warns when only some generated content is excluded", async () => {
    const finding = await analyzeFiles(
      { ...NODE_PROJECT, ".gitignore": "node_modules/\n" },
      ["node_modules/pino", "coverage"],
    );

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(2);
    expect(finding.message).toContain("coverage");
    expect(finding.message).not.toContain("node_modules");
  });

  it("fails when generated files are visible in the index", async () => {
    const finding = await analyzeFiles({
      ...NODE_PROJECT,
      "__pycache__/core.cpython-312.pyc": "\n",
    });

    // Nothing is excluded, nothing is declared, and the cache is readable.
    expect(finding.status).toBe("fail");
    expect(finding.score).toBe(0);
    expect(finding.message).toContain("__pycache__");
  });

  it("does not treat a vendored copy as stray output in Go", async () => {
    const finding = await analyzeFiles(
      {
        "go.mod": "module example.com/app\n\ngo 1.22\n\nrequire example.com/dep v1.0.0\n",
        "main.go": "package main\n",
      },
      ["vendor/example.com/dep"],
    );

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
  });

  it("still expects a PHP project to exclude its vendor directory", async () => {
    const finding = await analyzeFiles(
      {
        "composer.json": '{ "name": "a/b", "require": { "monolog/monolog": "^3" } }\n',
        "src/App.php": "<?php\n",
      },
      ["vendor/monolog"],
    );

    expect(finding.status).toBe("warning");
    expect(finding.message).toContain("vendor");
  });

  it("passes a repository with no generated content at all", async () => {
    const finding = await analyzeFiles({ "README.md": "# docs\n" });

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
    expect(finding.title).toBe("No generated content to separate");
  });
});
