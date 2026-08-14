import { readdir, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Directories that are skipped during indexing. These hold dependencies, build
 * output, or VCS internals, and parsing them tells us nothing about readiness
 * while costing a great deal of I/O.
 */
export const SKIPPED_DIRECTORIES: readonly string[] = [
  ".git",
  "node_modules",
  "vendor",
  ".venv",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".dart_tool",
  "coverage",
  "target",
  "DerivedData",
];

/** Upper bounds keep `check` interactive on unexpectedly large repositories. */
export const DEFAULT_MAX_FILES = 20_000;
export const DEFAULT_MAX_DEPTH = 12;

export interface RepositoryFile {
  /** Repository-relative path, always POSIX-separated. */
  path: string;
  /** Size in bytes, as reported by the directory entry's stat. */
  size: number;
}

export interface ScanResult {
  files: RepositoryFile[];
  /** `true` when indexing stopped early because a limit was reached. */
  truncated: boolean;
}

export interface ScanOptions {
  maxFiles?: number;
  maxDepth?: number;
  skipDirectories?: readonly string[];
}

/**
 * Indexes repository file paths.
 *
 * Behavior that detectors can rely on:
 *
 * - the result is sorted by path, so traversal order never affects output
 * - symlinks are not followed at all, which avoids cycles and keeps analysis
 *   inside the repository
 * - file contents are not read here
 */
export async function scanRepository(
  root: string,
  options: ScanOptions = {},
): Promise<ScanResult> {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const skipped = new Set(options.skipDirectories ?? SKIPPED_DIRECTORIES);

  const files: RepositoryFile[] = [];
  let truncated = false;

  const walk = async (absoluteDir: string, relativeDir: string, depth: number): Promise<void> => {
    if (truncated) return;
    if (depth > maxDepth) {
      truncated = true;
      return;
    }

    let entries;
    try {
      entries = await readdir(absoluteDir, { withFileTypes: true });
    } catch {
      // An unreadable subdirectory is a partial-visibility problem, not a
      // reason to abort the whole analysis.
      return;
    }

    // Sort before recursing so traversal is deterministic across platforms.
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const entry of entries) {
      if (truncated) return;
      // Never follow symlinks: they can escape the repository or form cycles.
      if (entry.isSymbolicLink()) continue;

      const relativePath = relativeDir === "" ? entry.name : `${relativeDir}/${entry.name}`;

      if (entry.isDirectory()) {
        if (skipped.has(entry.name)) continue;
        await walk(path.join(absoluteDir, entry.name), relativePath, depth + 1);
        continue;
      }

      if (!entry.isFile()) continue;

      if (files.length >= maxFiles) {
        truncated = true;
        return;
      }

      let size = 0;
      try {
        size = (await stat(path.join(absoluteDir, entry.name))).size;
      } catch {
        continue;
      }

      files.push({ path: relativePath, size });
    }
  };

  await walk(root, "", 0);

  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return { files, truncated };
}
