import type { RepositoryContext } from "../core/repository-context.js";
import { perContext } from "./cache.js";

/**
 * Evidence-based ecosystem detection.
 *
 * A repository may contain several ecosystems, so detection never stops at the
 * first match. Detection is used to answer applicability questions ("is a
 * lint command even expected here?"), never to assume Node.js conventions.
 */

export type EcosystemId =
  | "node"
  | "php"
  | "python"
  | "rust"
  | "go"
  | "ruby"
  | "dart"
  | "swift"
  | "java"
  | "dotnet"
  | "elixir"
  | "make";

export interface EcosystemEvidence {
  id: EcosystemId;
  label: string;
  /** Repository-relative path of the manifest that proved the ecosystem. */
  manifest: string;
}

interface ManifestRule {
  id: EcosystemId;
  label: string;
  /** Lowercased basename, or a lowercased basename suffix when `suffix`. */
  name: string;
  suffix?: boolean;
}

/**
 * Ordered so that output ordering is a property of this table rather than of
 * filesystem traversal.
 */
const MANIFEST_RULES: readonly ManifestRule[] = [
  { id: "node", label: "Node.js", name: "package.json" },
  { id: "php", label: "PHP / Composer", name: "composer.json" },
  { id: "python", label: "Python", name: "pyproject.toml" },
  { id: "python", label: "Python", name: "setup.py" },
  { id: "python", label: "Python", name: "requirements.txt" },
  { id: "python", label: "Python", name: "pipfile" },
  { id: "rust", label: "Rust", name: "cargo.toml" },
  { id: "go", label: "Go", name: "go.mod" },
  { id: "ruby", label: "Ruby", name: "gemfile" },
  { id: "ruby", label: "Ruby", name: ".gemspec", suffix: true },
  { id: "dart", label: "Dart / Flutter", name: "pubspec.yaml" },
  { id: "swift", label: "Swift", name: "package.swift" },
  { id: "java", label: "Java / Maven", name: "pom.xml" },
  { id: "java", label: "Java / Gradle", name: "build.gradle" },
  { id: "java", label: "Java / Gradle", name: "build.gradle.kts" },
  { id: "dotnet", label: ".NET", name: ".csproj", suffix: true },
  { id: "dotnet", label: ".NET", name: ".sln", suffix: true },
  { id: "elixir", label: "Elixir", name: "mix.exs" },
  { id: "make", label: "Make", name: "makefile" },
  { id: "make", label: "Make", name: "gnumakefile" },
  { id: "make", label: "Just", name: "justfile" },
];

/**
 * Manifests are looked for at the repository root and one directory down, which
 * covers the common `packages/x/package.json` layout without turning detection
 * into a full workspace analysis.
 */
const MAX_MANIFEST_DEPTH = 2;

/** Extensions that indicate the repository contains executable software. */
const SOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte",
  ".py", ".php", ".rb", ".rs", ".go", ".java", ".kt", ".kts", ".scala",
  ".swift", ".dart", ".c", ".cc", ".cpp", ".h", ".hpp", ".cs", ".ex", ".exs",
  ".sh", ".bash", ".ps1", ".lua", ".pl", ".r",
]);

function basename(relativePath: string): string {
  const segments = relativePath.split("/");
  return (segments[segments.length - 1] ?? "").toLowerCase();
}

function matchesRule(name: string, rule: ManifestRule): boolean {
  return rule.suffix === true ? name.endsWith(rule.name) : name === rule.name;
}

/**
 * Ecosystems evidenced by manifest files, deduplicated by ecosystem and ordered
 * by {@link MANIFEST_RULES}.
 */
export const detectEcosystems = perContext((context: RepositoryContext) => {
  const candidates = context.files.filter(
    (file) => file.path.split("/").length <= MAX_MANIFEST_DEPTH,
  );

  const found = new Map<EcosystemId, EcosystemEvidence>();
  for (const rule of MANIFEST_RULES) {
    if (found.has(rule.id)) continue;
    const match = candidates.find((file) => matchesRule(basename(file.path), rule));
    if (match) {
      found.set(rule.id, { id: rule.id, label: rule.label, manifest: match.path });
    }
  }

  return Promise.resolve([...found.values()]);
});

/**
 * `true` when the repository contains source files.
 *
 * Used for applicability: a documentation-only repository is not expected to
 * document a lint or type-check command.
 */
export const hasSourceCode = perContext((context: RepositoryContext) =>
  Promise.resolve(
    context.files.all.some((file) => {
      const name = basename(file.path);
      const dot = name.lastIndexOf(".");
      return dot > 0 && SOURCE_EXTENSIONS.has(name.slice(dot));
    }),
  ),
);
