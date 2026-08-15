import type { RepositoryContext } from "../core/repository-context.js";
import { perContext } from "./cache.js";
import type { EcosystemId } from "./ecosystems.js";
import { discoverIgnoreRules } from "./ignores.js";

/**
 * Discovery of generated, vendored, and build-output content.
 *
 * `context.generated` asks whether irrelevant content is likely to pollute what
 * an agent reads. Answering that needs two views of the repository: directories
 * indexing skipped (present in the working tree, invisible to the index) and
 * directories the index can still see. Both are matched against a catalog of
 * well-known names rather than guessed from file contents.
 */

export interface GeneratedDirectory {
  /** Repository-relative POSIX path. */
  path: string;
  /** Catalog name that matched, e.g. `node_modules`. */
  name: string;
  /** Static label from the catalog; never repository text. */
  label: string;
  /** `true` when indexing skipped it, so no file under it is indexed. */
  skipped: boolean;
  /** Indexed files under the directory; always `0` when `skipped`. */
  indexedFiles: number;
  /** `true` when the repository's `.gitignore` excludes it. */
  excluded: boolean;
}

interface CatalogEntry {
  label: string;
  /** Ecosystems that treat a checked-in copy as a supported convention. */
  committedBy?: readonly EcosystemId[];
}

/**
 * Directory names that hold dependencies, build output, or tool caches.
 *
 * Conservative on purpose: `bin`, `obj`, `lib`, and `out` are source or script
 * directories in enough ecosystems that treating them as generated would
 * produce confident wrong findings.
 */
const GENERATED_DIRECTORIES: Readonly<Record<string, CatalogEntry>> = {
  ".build": { label: "Swift build output" },
  ".cache": { label: "Tool cache" },
  ".dart_tool": { label: "Dart tool output" },
  ".gradle": { label: "Gradle cache" },
  ".mypy_cache": { label: "mypy cache" },
  ".next": { label: "Next.js build output" },
  ".nuxt": { label: "Nuxt build output" },
  ".parcel-cache": { label: "Parcel cache" },
  ".pytest_cache": { label: "pytest cache" },
  ".ruff_cache": { label: "Ruff cache" },
  ".svelte-kit": { label: "SvelteKit build output" },
  ".terraform": { label: "Terraform modules" },
  ".tox": { label: "tox environments" },
  ".turbo": { label: "Turborepo cache" },
  ".venv": { label: "Python virtual environment" },
  "DerivedData": { label: "Xcode derived data" },
  "Pods": { label: "CocoaPods dependencies" },
  "__pycache__": { label: "Python bytecode cache" },
  "_build": { label: "Build output" },
  "bower_components": { label: "Bower dependencies" },
  "build": { label: "Build output" },
  "coverage": { label: "Coverage output" },
  "dist": { label: "Build output" },
  "htmlcov": { label: "Coverage output" },
  "node_modules": { label: "Node.js dependencies" },
  "target": { label: "Build output" },
  "venv": { label: "Python virtual environment" },
  // Go's `go mod vendor` and Ruby's bundler both produce a checked-in copy that
  // the ecosystem expects to see, so their presence is not a finding there.
  "vendor": { label: "Vendored dependencies", committedBy: ["go", "ruby"] },
};

/** Enough directories to describe the problem; the rest add nothing. */
const MAX_GENERATED_DIRECTORIES = 12;

/**
 * Generated content present in the repository, ordered by path.
 *
 * A directory appearing here is not a finding on its own — the detector decides
 * that from whether the repository excludes it.
 */
export const discoverGeneratedContent = perContext(
  async (context: RepositoryContext): Promise<GeneratedDirectory[]> => {
    const ignores = await discoverIgnoreRules(context);

    const found = new Map<string, { name: string; skipped: boolean; indexedFiles: number }>();

    for (const path of context.skippedDirectories) {
      const name = path.slice(path.lastIndexOf("/") + 1);
      if (!(name in GENERATED_DIRECTORIES)) continue;
      found.set(path, { name, skipped: true, indexedFiles: 0 });
    }

    for (const file of context.files.all) {
      const segments = file.path.split("/");
      // The last segment is the file itself; only directories can be generated.
      for (const [index, segment] of segments.slice(0, -1).entries()) {
        if (!(segment in GENERATED_DIRECTORIES)) continue;

        const path = segments.slice(0, index + 1).join("/");
        const existing = found.get(path);
        if (existing === undefined) {
          found.set(path, { name: segment, skipped: false, indexedFiles: 1 });
        } else if (!existing.skipped) {
          existing.indexedFiles += 1;
        }
      }
    }

    return [...found]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .slice(0, MAX_GENERATED_DIRECTORIES)
      .map(([path, entry]) => ({
        path,
        name: entry.name,
        label: GENERATED_DIRECTORIES[entry.name]?.label ?? "Generated content",
        skipped: entry.skipped,
        indexedFiles: entry.indexedFiles,
        excluded: ignores.excludes(path, true),
      }));
  },
);

/**
 * Directories each ecosystem generates, used to ask whether ignore rules
 * declare them even when the directory does not exist yet.
 *
 * An ecosystem with no entry — Go and Make — produces no conventional directory,
 * so a repository in one is never asked to exclude a directory it never creates.
 */
const ECOSYSTEM_ARTIFACTS: Readonly<Partial<Record<EcosystemId, readonly string[]>>> = {
  node: ["node_modules", "dist", "build"],
  php: ["vendor"],
  python: [".venv", "venv", "__pycache__", ".tox"],
  rust: ["target"],
  ruby: ["vendor/bundle", ".bundle"],
  dart: [".dart_tool", "build"],
  swift: [".build", "DerivedData"],
  java: ["build", "target", ".gradle"],
  dotnet: ["bin", "obj"],
  elixir: ["_build", "deps"],
};

/** Generated directories an ecosystem conventionally produces. */
export function conventionalGeneratedPaths(ecosystem: EcosystemId): readonly string[] {
  return ECOSYSTEM_ARTIFACTS[ecosystem] ?? [];
}

/** Ecosystems that treat a checked-in copy of `name` as a supported convention. */
export function committedByConvention(name: string): readonly EcosystemId[] {
  return GENERATED_DIRECTORIES[name]?.committedBy ?? [];
}
