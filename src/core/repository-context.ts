import { open, stat } from "node:fs/promises";
import path from "node:path";

import { scanRepository, type RepositoryFile, type ScanOptions } from "../discovery/filesystem.js";
import { RepositoryNotFoundError, RepositoryUnreadableError } from "./errors.js";

/** Bounded read size for documentation and configuration files. */
export const DEFAULT_MAX_TEXT_BYTES = 128 * 1024;

export interface RepositoryFileIndex {
  /** All indexed files, sorted by path. */
  readonly all: readonly RepositoryFile[];
  has(relativePath: string): boolean;
  get(relativePath: string): RepositoryFile | undefined;
  filter(predicate: (file: RepositoryFile) => boolean): RepositoryFile[];
}

export interface RepositoryMetadata {
  /** Directory name of the repository root. */
  name: string;
  /** `.git` present. Its absence is informational, never an error. */
  hasGitMetadata: boolean;
  /** `true` when indexing stopped early because a scan limit was reached. */
  indexTruncated: boolean;
}

/**
 * Normalized, pre-computed input for detectors.
 *
 * Discovery does the shared filesystem work once so that detectors do not each
 * rescan the repository. Detectors must read only from this object.
 */
export interface RepositoryContext {
  /** Absolute, normalized repository root. */
  root: string;
  files: RepositoryFileIndex;
  metadata: RepositoryMetadata;
  /**
   * Reads an indexed text file, capped at `maxBytes`. Paths that are not in the
   * index resolve to `undefined`, which keeps reads inside the repository.
   * Results are cached for the lifetime of the context.
   */
  readTextFile(relativePath: string, maxBytes?: number): Promise<string | undefined>;
}

export interface BuildRepositoryContextOptions {
  scan?: ScanOptions;
}

function createFileIndex(files: readonly RepositoryFile[]): RepositoryFileIndex {
  const byPath = new Map(files.map((file) => [file.path, file]));
  return {
    all: files,
    has: (relativePath) => byPath.has(relativePath),
    get: (relativePath) => byPath.get(relativePath),
    filter: (predicate) => files.filter((file) => predicate(file)),
  };
}

async function hasGitMetadata(root: string): Promise<boolean> {
  try {
    // `.git` is a directory in normal clones and a file in worktrees/submodules.
    await stat(path.join(root, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function readBounded(absolutePath: string, maxBytes: number): Promise<string | undefined> {
  let handle;
  try {
    handle = await open(absolutePath, "r");
  } catch {
    return undefined;
  }

  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    const text = buffer.subarray(0, bytesRead).toString("utf8");
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  } catch {
    return undefined;
  } finally {
    await handle.close();
  }
}

/**
 * Resolves a repository root and builds its {@link RepositoryContext}.
 *
 * This is read-only: nothing in the analyzed repository is created, modified,
 * or executed.
 */
export async function buildRepositoryContext(
  targetPath: string,
  options: BuildRepositoryContextOptions = {},
): Promise<RepositoryContext> {
  const root = path.resolve(targetPath);

  let stats;
  try {
    stats = await stat(root);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      throw new RepositoryNotFoundError(root);
    }
    throw new RepositoryUnreadableError(root, { cause });
  }

  if (!stats.isDirectory()) {
    throw new RepositoryUnreadableError(root);
  }

  const scan = await scanRepository(root, options.scan ?? {});
  const files = createFileIndex(scan.files);
  const cache = new Map<string, string | undefined>();

  return {
    root,
    files,
    metadata: {
      name: path.basename(root),
      hasGitMetadata: await hasGitMetadata(root),
      indexTruncated: scan.truncated,
    },
    async readTextFile(relativePath, maxBytes = DEFAULT_MAX_TEXT_BYTES) {
      if (!files.has(relativePath)) return undefined;

      const key = `${String(maxBytes)}:${relativePath}`;
      if (cache.has(key)) return cache.get(key);

      const text = await readBounded(path.join(root, ...relativePath.split("/")), maxBytes);
      cache.set(key, text);
      return text;
    },
  };
}
