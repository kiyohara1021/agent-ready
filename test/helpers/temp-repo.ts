import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export interface TempRepo {
  root: string;
  cleanup: () => Promise<void>;
}

/**
 * Creates a temporary repository from a path -> contents map.
 *
 * Used for cases that are clearer inline than as a committed fixture: an empty
 * repository, or a one-off ecosystem variant that only a single test needs.
 * Anything reused across tests belongs in `test/fixtures/`.
 */
export async function createTempRepo(files: Record<string, string> = {}): Promise<TempRepo> {
  const root = await mkdtemp(path.join(tmpdir(), "agentworthy-test-"));

  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(root, ...relativePath.split("/"));
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents, "utf8");
  }

  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

const FIXTURE_ROOT = path.resolve(import.meta.dirname, "../fixtures");

/** Absolute path of a committed fixture repository. */
export function fixture(name: string): string {
  return path.join(FIXTURE_ROOT, name);
}

export const SAMPLE_REPO = fixture("sample-repo");
