import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Creates an empty temporary directory. Used for cases that cannot be expressed
 * as a committed fixture, such as a repository with no files at all.
 */
export async function createTempRepo(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(path.join(tmpdir(), "agent-ready-test-"));
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

export const SAMPLE_REPO = path.resolve(import.meta.dirname, "../fixtures/sample-repo");
