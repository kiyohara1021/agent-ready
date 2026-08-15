import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../src/core/repository-context.js";
import { detectEcosystems } from "../../../src/discovery/ecosystems.js";
import {
  builtinLintChecks,
  discoverEntryPoints,
  entryPointsOfKind,
  findTestFiles,
  type EntryPoint,
} from "../../../src/discovery/entry-points.js";
import { createTempRepo, fixture } from "../../helpers/temp-repo.js";

async function entryPoints(files: Record<string, string>): Promise<EntryPoint[]> {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await discoverEntryPoints(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

describe("discoverEntryPoints", () => {
  it("collects manifest scripts with the command a developer would run", async () => {
    const found = await entryPoints({
      "package.json": JSON.stringify({
        scripts: { test: "node --test", lint: "eslint .", typecheck: "tsc --noEmit" },
      }),
      "src/index.js": "export const a = 1;\n",
    });

    expect(found).toStrictEqual([
      { kind: "test", label: "npm test", source: "script", path: "package.json" },
      { kind: "lint", label: "npm run lint", source: "script", path: "package.json" },
      { kind: "typecheck", label: "npm run typecheck", source: "script", path: "package.json" },
    ]);
  });

  it("reads task runner targets", async () => {
    const found = await entryPoints({
      Makefile: "test:\n\tgo test ./...\n\nvet:\n\tgo vet ./...\n",
      "go.mod": "module example.com/app\n",
      "main.go": "package main\n",
    });

    expect(found.map((entry) => `${entry.kind}:${entry.label}`)).toStrictEqual([
      "test:make test",
      "lint:make vet",
      "typecheck:make vet",
    ]);
    expect(found.every((entry) => entry.path === "Makefile")).toBe(true);
  });

  it("treats test runner configuration as an entry point", async () => {
    const found = await entryPoints({
      "composer.json": JSON.stringify({ name: "acme/app" }),
      "phpunit.xml.dist": "<phpunit/>\n",
      "src/App.php": "<?php\n",
    });

    expect(entryPointsOfKind(found, "test")).toStrictEqual([
      { kind: "test", label: "phpunit", source: "config", path: "phpunit.xml.dist" },
    ]);
  });

  it("reads test configuration written into a shared file", async () => {
    const found = await entryPoints({
      "pyproject.toml": "[project]\nname = 'app'\n\n[tool.pytest.ini_options]\ntestpaths = ['tests']\n",
      "src/app.py": "value = 1\n",
    });

    expect(entryPointsOfKind(found, "test")).toStrictEqual([
      { kind: "test", label: "pytest", source: "config", path: "pyproject.toml" },
    ]);
  });

  it("counts an ecosystem's built-in runner only when tests exist", async () => {
    const withTests = await entryPoints({
      "Cargo.toml": "[package]\nname = 'app'\n",
      "src/lib.rs": "pub fn a() {}\n",
      "tests/integration.rs": "#[test]\nfn works() {}\n",
    });
    const withoutTests = await entryPoints({
      "Cargo.toml": "[package]\nname = 'app'\n",
      "src/lib.rs": "pub fn a() {}\n",
    });

    expect(entryPointsOfKind(withTests, "test")).toStrictEqual([
      { kind: "test", label: "cargo test", source: "manifest", path: "Cargo.toml" },
    ]);
    expect(entryPointsOfKind(withoutTests, "test")).toStrictEqual([]);
  });

  it("ignores a placeholder test script", async () => {
    const found = await entryPoints({
      "package.json": JSON.stringify({
        scripts: { test: 'echo "Error: no test specified" && exit 1' },
      }),
      "src/index.js": "export const a = 1;\n",
    });

    expect(entryPointsOfKind(found, "test")).toStrictEqual([]);
  });

  it("derives entry points from checked-in tool configuration and CI", async () => {
    const found = await entryPoints({
      "package.json": JSON.stringify({ name: "app" }),
      "eslint.config.js": "export default [];\n",
      "tsconfig.json": '{ "compilerOptions": { "strict": true } }\n',
      ".github/workflows/ci.yml": "jobs:\n  a:\n    steps:\n      - run: npx tsc --noEmit\n",
      "src/index.ts": "export const a = 1;\n",
    });

    expect(found).toStrictEqual([
      { kind: "lint", label: "ESLint", source: "config", path: "eslint.config.js" },
      { kind: "typecheck", label: "TypeScript", source: "config", path: "tsconfig.json" },
      { kind: "typecheck", label: "tsc", source: "workflow", path: ".github/workflows/ci.yml" },
    ]);
  });

  it("finds nothing in a repository with no project metadata", async () => {
    expect(await entryPoints({ "README.md": "# docs\n" })).toStrictEqual([]);
  });

  it("orders entry points by source, not by traversal", async () => {
    const found = await discoverEntryPoints(await buildRepositoryContext(fixture("php-composer")));

    expect(found.map((entry) => entry.source)).toStrictEqual([
      "script",
      "script",
      "script",
      "config",
      "config",
      "config",
      "workflow",
      "workflow",
      "workflow",
    ]);
  });
});

describe("findTestFiles", () => {
  it("recognizes test directories and per-language test file names", async () => {
    const { root, cleanup } = await createTempRepo({
      "tests/test_core.py": "def test_a(): pass\n",
      "src/util_test.go": "package util\n",
      "src/util.spec.ts": "export {};\n",
      "src/util.ts": "export const a = 1;\n",
    });
    try {
      const files = await findTestFiles(await buildRepositoryContext(root));
      expect(files.map((file) => file.path)).toStrictEqual([
        "src/util.spec.ts",
        "src/util_test.go",
        "tests/test_core.py",
      ]);
    } finally {
      await cleanup();
    }
  });
});

describe("builtinLintChecks", () => {
  it("reports the static check an ecosystem ships with", async () => {
    const { root, cleanup } = await createTempRepo({
      "go.mod": "module example.com/app\n",
      "main.go": "package main\n",
    });
    try {
      const ecosystems = await detectEcosystems(await buildRepositoryContext(root));
      expect(builtinLintChecks(ecosystems)).toStrictEqual([
        { command: "go vet ./...", path: "go.mod" },
      ]);
    } finally {
      await cleanup();
    }
  });

  it("reports nothing for an ecosystem without a zero-configuration check", async () => {
    const { root, cleanup } = await createTempRepo({
      "package.json": "{}\n",
      "src/index.js": "export const a = 1;\n",
    });
    try {
      const ecosystems = await detectEcosystems(await buildRepositoryContext(root));
      expect(builtinLintChecks(ecosystems)).toStrictEqual([]);
    } finally {
      await cleanup();
    }
  });
});
