import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../../src/core/repository-context.js";
import { lockfileSafetyDetector } from "../../../../src/detectors/safety/lockfile.js";
import { createTempRepo, fixture } from "../../../helpers/temp-repo.js";

async function analyzeFixture(name: string) {
  return lockfileSafetyDetector.analyze(await buildRepositoryContext(fixture(name)));
}

async function analyzeFiles(files: Record<string, string>) {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await lockfileSafetyDetector.analyze(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

const NODE_MANIFEST = '{ "name": "app", "dependencies": { "pino": "^9.5.0" } }\n';

describe("safety.lockfile", () => {
  it("passes a locked project", async () => {
    const finding = await analyzeFixture("node-healthy");

    expect(finding.id).toBe("safety.lockfile");
    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
    expect(finding.evidence).toStrictEqual([
      { kind: "file", path: "package-lock.json", label: "Node.js lockfile" },
    ]);
  });

  it("fails a project that declares dependencies without a lockfile", async () => {
    const finding = await analyzeFixture("php-composer");

    expect(finding.status).toBe("fail");
    expect(finding.score).toBe(0);
    expect(finding.applicable).toBe(true);
    expect(finding.recommendation?.message).toContain("composer.lock");
  });

  it("is not applicable when the manifest declares no dependencies", async () => {
    const finding = await analyzeFiles({
      "package.json": '{ "name": "app", "scripts": { "test": "node --test" } }\n',
      "src/index.js": "export const a = 1;\n",
    });

    expect(finding.applicable).toBe(false);
    expect(finding.status).toBe("info");
    expect(finding.score).toBe(0);
  });

  it("is not applicable to an ecosystem with no conventional lockfile", async () => {
    const finding = await analyzeFiles({
      "pom.xml": "<project><dependencies><dependency/></dependencies></project>\n",
      "src/Main.java": "class Main {}\n",
    });

    expect(finding.applicable).toBe(false);
  });

  it("is not applicable to a repository with no dependency management", async () => {
    const finding = await analyzeFixture("docs-only");

    expect(finding.applicable).toBe(false);
  });

  it("withholds a point when the committed lockfile is not the declared one", async () => {
    const finding = await analyzeFiles({
      "package.json":
        '{ "name": "app", "packageManager": "pnpm@9.1.0", "dependencies": { "pino": "^9" } }\n',
      "package-lock.json": "{}\n",
      "src/index.js": "export const a = 1;\n",
    });

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(4);
    expect(finding.message).toContain("pnpm-lock.yaml");
  });

  it("withholds a point when two lockfiles compete", async () => {
    const finding = await analyzeFiles({
      "package.json": NODE_MANIFEST,
      "package-lock.json": "{}\n",
      "yarn.lock": "# yarn lockfile v1\n",
      "src/index.js": "export const a = 1;\n",
    });

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(4);
    expect(finding.message).toContain("competing lockfiles");
    expect(finding.recommendation?.priority).toBe("low");
  });

  it("withholds a point when one of several ecosystems is unlocked", async () => {
    const finding = await analyzeFiles({
      "package.json": NODE_MANIFEST,
      "package-lock.json": "{}\n",
      "composer.json": '{ "name": "a/b", "require": { "monolog/monolog": "^3" } }\n',
      "src/index.js": "export const a = 1;\n",
    });

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(4);
    expect(finding.message).toContain("PHP / Composer is not locked");
    expect(finding.recommendation?.priority).toBe("medium");
  });

  it("accepts go.sum as the Go ecosystem's lockfile", async () => {
    const finding = await analyzeFiles({
      "go.mod": "module example.com/app\n\ngo 1.22\n\nrequire example.com/dep v1.0.0\n",
      "go.sum": "example.com/dep v1.0.0 h1:abc=\n",
      "main.go": "package main\n",
    });

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
  });

  it("does not ask a dependency-free Go module for a lockfile", async () => {
    const finding = await analyzeFixture("minimal-repo");

    expect(finding.applicable).toBe(false);
  });
});
