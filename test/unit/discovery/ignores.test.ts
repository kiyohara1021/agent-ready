import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../src/core/repository-context.js";
import {
  discoverIgnoreRules,
  hasGitIgnore,
  ignoreFilesOfKind,
  rootGitIgnore,
  type IgnoreRules,
} from "../../../src/discovery/ignores.js";
import { createTempRepo } from "../../helpers/temp-repo.js";

async function rulesFor(files: Record<string, string>): Promise<IgnoreRules> {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await discoverIgnoreRules(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

const README = { "README.md": "# temp\n" };

describe("discoverIgnoreRules", () => {
  it("matches a plain name at any depth", async () => {
    const rules = await rulesFor({ ...README, ".gitignore": "node_modules\n" });

    expect(rules.excludes("node_modules", true)).toBe(true);
    expect(rules.excludes("node_modules/pino/index.js")).toBe(true);
    expect(rules.excludes("packages/api/node_modules/pino/index.js")).toBe(true);
    expect(rules.excludes("src/index.js")).toBe(false);
  });

  it("honours anchoring and directory-only rules", async () => {
    const rules = await rulesFor({ ...README, ".gitignore": "/dist\nbuild/\n" });

    expect(rules.excludes("dist/app.js")).toBe(true);
    // Anchored to the root, so a nested `dist` is a different path.
    expect(rules.excludes("packages/api/dist/app.js")).toBe(false);
    expect(rules.excludes("build/app.js")).toBe(true);
    // `build/` names a directory; a file called `build` is not excluded.
    expect(rules.excludes("build")).toBe(false);
    expect(rules.excludes("build", true)).toBe(true);
  });

  it("expands wildcards without crossing path segments", async () => {
    const rules = await rulesFor({ ...README, ".gitignore": "*.pem\ndocs/**/draft.md\n" });

    expect(rules.excludes("server.pem")).toBe(true);
    expect(rules.excludes("certs/server.pem")).toBe(true);
    expect(rules.excludes("server.pem.txt")).toBe(false);
    expect(rules.excludes("docs/guides/internal/draft.md")).toBe(true);
    expect(rules.excludes("docs/draft.md")).toBe(true);
  });

  it("lets a later negation re-include a path", async () => {
    const rules = await rulesFor({
      ...README,
      ".gitignore": ".env\n.env.*\n!.env.example\n",
    });

    expect(rules.excludes(".env")).toBe(true);
    expect(rules.excludes(".env.local")).toBe(true);
    expect(rules.excludes(".env.example")).toBe(false);
  });

  it("ignores comments, blank lines, and a bare slash", async () => {
    const rules = await rulesFor({
      ...README,
      ".gitignore": "# comment\n\n/\n   \nsecrets/\n",
    });

    expect(rootGitIgnore(rules)?.patternCount).toBe(1);
    expect(rules.excludes("secrets/token")).toBe(true);
  });

  it("scopes a nested .gitignore to its own directory", async () => {
    const rules = await rulesFor({
      ...README,
      "packages/api/.gitignore": "generated/\n",
    });

    expect(rules.excludes("packages/api/generated/client.ts")).toBe(true);
    expect(rules.excludes("generated/client.ts")).toBe(false);
  });

  it("keeps agent and tool ignore files out of the git exclusion answer", async () => {
    const rules = await rulesFor({
      ...README,
      ".cursorignore": "fixtures/\n",
      ".dockerignore": "docs/\n",
    });

    expect(rules.excludes("fixtures/big.json")).toBe(false);
    expect(rules.excludedByAny("fixtures/big.json")).toBe(true);
    expect(rules.excludedByAny("docs/guide.md")).toBe(true);
    expect(ignoreFilesOfKind(rules, "agent").map((file) => file.path)).toStrictEqual([
      ".cursorignore",
    ]);
    expect(ignoreFilesOfKind(rules, "tool").map((file) => file.path)).toStrictEqual([
      ".dockerignore",
    ]);
  });

  it("reports no rules for a repository without ignore files", async () => {
    const rules = await rulesFor(README);

    expect(rules.files).toStrictEqual([]);
    expect(hasGitIgnore(rules)).toBe(false);
    expect(rules.excludes("node_modules/pino/index.js")).toBe(false);
  });

  it("treats an empty .gitignore as no rules at all", async () => {
    const rules = await rulesFor({ ...README, ".gitignore": "\n# nothing yet\n" });

    expect(hasGitIgnore(rules)).toBe(false);
    expect(rootGitIgnore(rules)?.patternCount).toBe(0);
  });

  it("normalizes the candidate path before matching", async () => {
    const rules = await rulesFor({ ...README, ".gitignore": "dist/\n" });

    expect(rules.excludes("./dist/app.js")).toBe(true);
    expect(rules.excludes("/dist/app.js")).toBe(true);
    expect(rules.excludes("dist/")).toBe(true);
    expect(rules.excludes("")).toBe(false);
  });

  it("refuses to compile a pathologically long pattern", async () => {
    const rules = await rulesFor({
      ...README,
      ".gitignore": `${"*".repeat(400)}/a\ndist/\n`,
    });

    expect(rootGitIgnore(rules)?.patternCount).toBe(1);
    expect(rules.excludes("dist/app.js")).toBe(true);
  });
});
