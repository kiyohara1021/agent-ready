import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../src/core/repository-context.js";
import {
  discoverDependencySurfaces,
  lockableSurfaces,
  type DependencySurface,
} from "../../../src/discovery/lockfiles.js";
import { createTempRepo, fixture } from "../../helpers/temp-repo.js";

async function surfacesFor(files: Record<string, string>): Promise<DependencySurface[]> {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await discoverDependencySurfaces(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

describe("discoverDependencySurfaces", () => {
  it("finds the lockfile beside the manifest that proved the ecosystem", async () => {
    const surfaces = await discoverDependencySurfaces(
      await buildRepositoryContext(fixture("node-healthy")),
    );

    expect(surfaces[0]?.ecosystem).toBe("node");
    expect(surfaces[0]?.declaresDependencies).toBe(true);
    expect(surfaces[0]?.lockfiles).toStrictEqual(["package-lock.json"]);
  });

  it("reports a manifest that declares no dependencies as nothing to lock", async () => {
    const surfaces = await surfacesFor({
      "package.json": '{ "name": "app", "scripts": { "test": "node --test" } }\n',
      "src/index.js": "export const a = 1;\n",
    });

    expect(surfaces[0]?.declaresDependencies).toBe(false);
    expect(lockableSurfaces(surfaces)).toStrictEqual([]);
  });

  it("treats a PHP platform requirement as no dependency", async () => {
    const surfaces = await surfacesFor({
      "composer.json": '{ "name": "a/b", "require": { "php": "^8.3", "ext-json": "*" } }\n',
      "src/App.php": "<?php\n",
    });

    expect(surfaces[0]?.ecosystem).toBe("php");
    expect(surfaces[0]?.declaresDependencies).toBe(false);
  });

  it("recognizes dependency declarations across ecosystems", async () => {
    const surfaces = await surfacesFor({
      "pyproject.toml": '[project]\nname = "app"\ndependencies = ["httpx>=0.27"]\n',
      "Cargo.toml": '[package]\nname = "app"\n\n[dependencies]\nserde = "1"\n',
      "go.mod": "module example.com/app\n\ngo 1.22\n\nrequire example.com/dep v1.0.0\n",
    });

    const declaring = surfaces
      .filter((surface) => surface.declaresDependencies)
      .map((surface) => surface.ecosystem);

    expect(declaring.sort()).toStrictEqual(["go", "python", "rust"]);
  });

  it("has no conventional lockfile for ecosystems that do not use one", async () => {
    const surfaces = await surfacesFor({
      "pom.xml": "<project><modelVersion>4.0.0</modelVersion></project>\n",
      "src/Main.java": "class Main {}\n",
    });

    expect(surfaces[0]?.ecosystem).toBe("java");
    expect(surfaces[0]?.conventional).toStrictEqual([]);
    expect(lockableSurfaces(surfaces)).toStrictEqual([]);
  });

  it("reads the lockfile the packageManager field implies", async () => {
    const surfaces = await surfacesFor({
      "package.json":
        '{ "name": "app", "packageManager": "pnpm@9.1.0", "dependencies": { "pino": "^9" } }\n',
      "package-lock.json": "{}\n",
      "src/index.js": "export const a = 1;\n",
    });

    expect(surfaces[0]?.expected).toBe("pnpm-lock.yaml");
    expect(surfaces[0]?.lockfiles).toStrictEqual(["package-lock.json"]);
  });

  it("collects competing lockfiles for one ecosystem", async () => {
    const surfaces = await surfacesFor({
      "package.json": '{ "name": "app", "dependencies": { "pino": "^9" } }\n',
      "package-lock.json": "{}\n",
      "yarn.lock": "# yarn lockfile v1\n",
      "src/index.js": "export const a = 1;\n",
    });

    expect(surfaces[0]?.lockfiles).toStrictEqual(["package-lock.json", "yarn.lock"]);
    expect(surfaces[0]?.expected).toBeUndefined();
  });

  it("treats a fully pinned requirements.txt as its own lockfile", async () => {
    const surfaces = await surfacesFor({
      "requirements.txt": "httpx==0.27.2\n# comment\n-r dev-requirements.txt\nrich==13.9.4\n",
      "app.py": "x = 1\n",
    });

    expect(surfaces[0]?.lockfiles).toStrictEqual(["requirements.txt"]);
  });

  it("does not treat a loosely specified requirements.txt as a lockfile", async () => {
    const surfaces = await surfacesFor({
      "requirements.txt": "httpx>=0.27\nrich\n",
      "app.py": "x = 1\n",
    });

    expect(surfaces[0]?.declaresDependencies).toBe(true);
    expect(surfaces[0]?.lockfiles).toStrictEqual([]);
  });

  it("returns nothing for a repository with no manifests", async () => {
    expect(await surfacesFor({ "README.md": "# temp\n" })).toStrictEqual([]);
  });
});
