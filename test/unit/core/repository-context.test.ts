import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../src/core/repository-context.js";
import {
  RepositoryNotFoundError,
  RepositoryUnreadableError,
} from "../../../src/core/errors.js";
import { createTempRepo, SAMPLE_REPO } from "../../helpers/temp-repo.js";

describe("buildRepositoryContext", () => {
  it("builds a context from a fixture repository", async () => {
    const context = await buildRepositoryContext(SAMPLE_REPO);

    expect(context.root).toBe(path.resolve(SAMPLE_REPO));
    expect(context.metadata.name).toBe("sample-repo");
    expect(context.metadata.indexTruncated).toBe(false);
    expect(context.files.has("README.md")).toBe(true);
    expect(context.files.get("README.md")?.size).toBeGreaterThan(0);
  });

  it("reports missing git metadata without failing", async () => {
    const context = await buildRepositoryContext(SAMPLE_REPO);
    expect(context.metadata.hasGitMetadata).toBe(false);
  });

  it("reads indexed text files", async () => {
    const context = await buildRepositoryContext(SAMPLE_REPO);
    const readme = await context.readTextFile("README.md");

    expect(readme).toContain("# sample-repo");
  });

  it("caps text reads at the requested byte limit", async () => {
    const context = await buildRepositoryContext(SAMPLE_REPO);
    const readme = await context.readTextFile("README.md", 8);

    expect(readme).toBe("# sample");
  });

  it("refuses to read paths that are not indexed", async () => {
    const context = await buildRepositoryContext(SAMPLE_REPO);

    expect(await context.readTextFile("../../../etc/hosts")).toBeUndefined();
    expect(await context.readTextFile("missing.md")).toBeUndefined();
  });

  it("handles an empty repository", async () => {
    const { root, cleanup } = await createTempRepo();
    try {
      const context = await buildRepositoryContext(root);
      expect(context.files.all).toStrictEqual([]);
    } finally {
      await cleanup();
    }
  });

  it("throws RepositoryNotFoundError for a missing path", async () => {
    await expect(
      buildRepositoryContext(path.join(SAMPLE_REPO, "does-not-exist")),
    ).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });

  it("throws RepositoryUnreadableError when the path is not a directory", async () => {
    await expect(
      buildRepositoryContext(path.join(SAMPLE_REPO, "README.md")),
    ).rejects.toBeInstanceOf(RepositoryUnreadableError);
  });
});
