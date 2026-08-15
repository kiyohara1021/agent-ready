import { mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { scanRepository } from "../../../src/discovery/filesystem.js";
import { createTempRepo, SAMPLE_REPO } from "../../helpers/temp-repo.js";

describe("scanRepository", () => {
  it("indexes repository files with POSIX-relative paths", async () => {
    const { files } = await scanRepository(SAMPLE_REPO);
    const paths = files.map((file) => file.path);

    expect(paths).toContain("README.md");
    expect(paths).toContain("AGENTS.md");
    expect(paths).toContain("src/index.js");
    expect(paths).toContain(".github/workflows/ci.yml");
  });

  it("skips dependency, build, and VCS directories", async () => {
    // Built in a temp directory: these paths are exactly the ones a repository
    // ignores, so they cannot live in a committed fixture.
    const { root, cleanup } = await createTempRepo();
    try {
      await writeFile(path.join(root, "README.md"), "# temp");
      for (const directory of ["node_modules", "dist", ".git", "vendor", "coverage"]) {
        await mkdir(path.join(root, directory, "nested"), { recursive: true });
        await writeFile(path.join(root, directory, "nested", "file.txt"), "ignored");
      }

      const { files } = await scanRepository(root);
      expect(files.map((file) => file.path)).toStrictEqual(["README.md"]);
    } finally {
      await cleanup();
    }
  });

  it("reports the skipped directories so detectors can see they exist", async () => {
    const { root, cleanup } = await createTempRepo();
    try {
      await writeFile(path.join(root, "README.md"), "# temp");
      for (const directory of ["node_modules", "dist", "packages/api/node_modules"]) {
        await mkdir(path.join(root, directory), { recursive: true });
        await writeFile(path.join(root, directory, "file.txt"), "generated");
      }

      const { files, skippedDirectories } = await scanRepository(root);

      // Present in the working tree, absent from the index.
      expect(skippedDirectories).toStrictEqual([
        "dist",
        "node_modules",
        "packages/api/node_modules",
      ]);
      expect(files.map((file) => file.path)).toStrictEqual(["README.md"]);
    } finally {
      await cleanup();
    }
  });

  it("bounds the reported skipped directories", async () => {
    const { root, cleanup } = await createTempRepo();
    try {
      for (const directory of ["node_modules", "dist", "coverage"]) {
        await mkdir(path.join(root, directory), { recursive: true });
      }

      const { skippedDirectories } = await scanRepository(root, { maxSkippedDirectories: 2 });
      expect(skippedDirectories).toHaveLength(2);
    } finally {
      await cleanup();
    }
  });

  it("returns files sorted by path regardless of traversal order", async () => {
    const { files } = await scanRepository(SAMPLE_REPO);
    const paths = files.map((file) => file.path);

    expect(paths).toStrictEqual([...paths].sort());
  });

  it("reports an empty index for an empty directory", async () => {
    const { root, cleanup } = await createTempRepo();
    try {
      const result = await scanRepository(root);
      expect(result.files).toStrictEqual([]);
      expect(result.truncated).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it("does not follow symlinks", async () => {
    const { root, cleanup } = await createTempRepo();
    try {
      await mkdir(path.join(root, "real"));
      await writeFile(path.join(root, "real", "file.txt"), "hello");
      try {
        await symlink(path.join(root, "real"), path.join(root, "link"), "dir");
      } catch {
        // Windows without developer mode cannot create symlinks; the skip logic
        // is unchanged, so there is nothing to assert here.
        return;
      }

      const { files } = await scanRepository(root);
      expect(files.map((file) => file.path)).toStrictEqual(["real/file.txt"]);
    } finally {
      await cleanup();
    }
  });

  it("marks the index as truncated when the file limit is reached", async () => {
    const result = await scanRepository(SAMPLE_REPO, { maxFiles: 2 });
    expect(result.truncated).toBe(true);
    expect(result.files.length).toBeLessThanOrEqual(2);
  });
});
