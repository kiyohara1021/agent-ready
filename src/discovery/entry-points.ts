import type { RepositoryContext } from "../core/repository-context.js";
import { perContext } from "./cache.js";
import { detectEcosystems, type EcosystemEvidence, type EcosystemId } from "./ecosystems.js";
import { discoverScripts, type DiscoveredScript } from "./scripts.js";
import { discoverQualityTooling } from "./tooling.js";
import { discoverWorkflows } from "./workflows.js";

/**
 * Discovery of runnable validation entry points.
 *
 * The Automation detectors answer a different question from the Instructions
 * detectors: not "does documentation explain the command?" but "can a command
 * be inferred from the repository's own metadata?". The evidence for that is
 * manifests, task runners, tool configuration, ecosystem convention, and CI —
 * all read as data. Nothing here executes, resolves, or interprets a command.
 */

export type EntryPointKind = "test" | "lint" | "typecheck";

export type EntryPointSource = "script" | "config" | "manifest" | "workflow";

export interface EntryPoint {
  kind: EntryPointKind;
  /**
   * What proves the entry point: a command for `script`/`manifest`/`workflow`
   * sources, a tool name for `config`. Always a project-defined or catalog
   * value, never a line copied out of a repository file.
   */
  label: string;
  source: EntryPointSource;
  /** Repository-relative path of the evidence. */
  path: string;
}

const ENTRY_KINDS: readonly EntryPointKind[] = ["test", "lint", "typecheck"];

const CONFIG_MAX_BYTES = 32 * 1024;

/** Configuration lives at the root or one directory down in practice. */
const MAX_CONFIG_DEPTH = 2;

/** Enough test files to prove a suite exists; the rest add nothing. */
const MAX_TEST_FILES = 8;

/** Paths that indicate an executable test suite exists. */
const TEST_PATH = /(^|\/)(tests?|specs?|__tests__)\//;
const TEST_FILE = /(^|\/)(test_[^/]+\.py|[^/]+[._](test|spec)\.[a-z]+|[^/]+_test\.[a-z]+)$/;

interface ConfigRule {
  command: string;
  /** Lowercased basename, or a lowercased basename prefix when `prefix`. */
  name: string;
  prefix?: boolean;
}

/**
 * Test runner configuration. A checked-in runner config is a project statement
 * that this is how the tests run, even when no script wraps it.
 */
const TEST_CONFIG_RULES: readonly ConfigRule[] = [
  { command: "vitest run", name: "vitest.config.", prefix: true },
  { command: "jest", name: "jest.config.", prefix: true },
  { command: "playwright test", name: "playwright.config.", prefix: true },
  { command: "cypress run", name: "cypress.config.", prefix: true },
  { command: "phpunit", name: "phpunit.xml", prefix: true },
  { command: "pest", name: "pest.php" },
  { command: "pytest", name: "pytest.ini" },
  { command: "tox", name: "tox.ini" },
  { command: "nox", name: "noxfile.py" },
  { command: "rspec", name: ".rspec" },
  { command: "dart test", name: "dart_test.yaml" },
];

/** Python commonly configures its test runner inside a shared file. */
const SECTION_RULES: readonly { file: string; section: string; command: string }[] = [
  { file: "pyproject.toml", section: "[tool.pytest", command: "pytest" },
  { file: "pyproject.toml", section: "[tool.tox", command: "tox" },
  { file: "setup.cfg", section: "[tool:pytest]", command: "pytest" },
  { file: "tox.ini", section: "[tool:pytest]", command: "pytest" },
];

/**
 * Test commands an ecosystem provides without any project configuration.
 *
 * Keyed by manifest basename so that the evidence path is the manifest that
 * proved it. These only count when the repository actually contains tests: an
 * ecosystem's built-in runner is not a test entry point if there is nothing for
 * it to run.
 */
const CONVENTIONAL_TESTS: readonly { manifest: string; suffix?: boolean; command: string }[] = [
  { manifest: "cargo.toml", command: "cargo test" },
  { manifest: "go.mod", command: "go test ./..." },
  { manifest: "package.swift", command: "swift test" },
  { manifest: "mix.exs", command: "mix test" },
  { manifest: "pubspec.yaml", command: "dart test" },
  { manifest: "pom.xml", command: "mvn test" },
  { manifest: "build.gradle", command: "./gradlew test" },
  { manifest: "build.gradle.kts", command: "./gradlew test" },
  { manifest: ".csproj", suffix: true, command: "dotnet test" },
  { manifest: ".sln", suffix: true, command: "dotnet test" },
];

export interface BuiltinCheck {
  command: string;
  /** Repository-relative path of the manifest that proved the ecosystem. */
  path: string;
}

/**
 * Static checks an ecosystem ships with, available without configuration.
 *
 * A repository that configures nothing still has these, which is why the lint
 * detector treats them as "available but not wired up" — a warning — rather
 * than as a missing capability.
 */
const BUILTIN_LINT_CHECKS: Readonly<Partial<Record<EcosystemId, string>>> = {
  go: "go vet ./...",
  rust: "cargo clippy",
  dart: "dart analyze",
};

function basename(relativePath: string): string {
  const segments = relativePath.split("/");
  return (segments[segments.length - 1] ?? "").toLowerCase();
}

/** Test files and directories, capped; used to prove a suite exists. */
export const findTestFiles = perContext((context: RepositoryContext) =>
  Promise.resolve(
    context.files
      .filter((file) => TEST_PATH.test(file.path) || TEST_FILE.test(file.path))
      .slice(0, MAX_TEST_FILES),
  ),
);

function scriptEntryPoints(scripts: readonly DiscoveredScript[]): EntryPoint[] {
  return scripts.flatMap((script) =>
    ENTRY_KINDS.filter((kind) => script.kinds.includes(kind)).map((kind) => ({
      kind,
      label: script.command,
      source: "script" as const,
      path: script.source,
    })),
  );
}

function testConfigEntryPoints(context: RepositoryContext): EntryPoint[] {
  const candidates = context.files.filter(
    (file) => file.path.split("/").length <= MAX_CONFIG_DEPTH,
  );

  return TEST_CONFIG_RULES.flatMap((rule) => {
    const match = candidates.find((file) => {
      const name = basename(file.path);
      return rule.prefix === true ? name.startsWith(rule.name) : name === rule.name;
    });
    if (match === undefined) return [];
    return [{ kind: "test" as const, label: rule.command, source: "config" as const, path: match.path }];
  });
}

async function sectionEntryPoints(context: RepositoryContext): Promise<EntryPoint[]> {
  const entries: EntryPoint[] = [];

  for (const rule of SECTION_RULES) {
    const raw = await context.readTextFile(rule.file, CONFIG_MAX_BYTES);
    if (raw === undefined || !raw.toLowerCase().includes(rule.section)) continue;
    entries.push({ kind: "test", label: rule.command, source: "config", path: rule.file });
  }

  return entries;
}

function conventionalTestEntryPoints(ecosystems: readonly EcosystemEvidence[]): EntryPoint[] {
  return CONVENTIONAL_TESTS.flatMap((rule) => {
    const match = ecosystems.find((ecosystem) => {
      const name = basename(ecosystem.manifest);
      return rule.suffix === true ? name.endsWith(rule.manifest) : name === rule.manifest;
    });
    if (match === undefined) return [];
    return [
      { kind: "test" as const, label: rule.command, source: "manifest" as const, path: match.manifest },
    ];
  });
}

/**
 * Validation entry points the repository itself defines or implies.
 *
 * Ordering is by source — scripts, configuration, ecosystem convention, then
 * CI — and deterministic within each source, so evidence never depends on
 * filesystem traversal order.
 */
export const discoverEntryPoints = perContext(
  async (context: RepositoryContext): Promise<EntryPoint[]> => {
    const [scripts, tooling, workflows, ecosystems, sections, testFiles] = await Promise.all([
      discoverScripts(context),
      discoverQualityTooling(context),
      discoverWorkflows(context),
      detectEcosystems(context),
      sectionEntryPoints(context),
      findTestFiles(context),
    ]);

    const toolingEntries: EntryPoint[] = tooling.flatMap((tool) =>
      ENTRY_KINDS.filter((kind) => tool.kinds.includes(kind)).map((kind) => ({
        kind,
        label: tool.label,
        source: "config" as const,
        path: tool.path,
      })),
    );

    const workflowEntries: EntryPoint[] = workflows.flatMap((workflow) =>
      workflow.signals.flatMap((signal) => {
        // A build step proves CI compiles the project; it is not a check a
        // contributor runs, so it is not an entry point.
        if (signal.kind === "build") return [];
        return [
          {
            kind: signal.kind,
            label: signal.label,
            source: "workflow" as const,
            path: workflow.path,
          },
        ];
      }),
    );

    const candidates = [
      ...scriptEntryPoints(scripts),
      ...testConfigEntryPoints(context),
      ...sections,
      ...toolingEntries,
      // An ecosystem's built-in runner only counts when there are tests to run.
      ...(testFiles.length > 0 ? conventionalTestEntryPoints(ecosystems) : []),
      ...workflowEntries,
    ];

    const seen = new Set<string>();
    return candidates.filter((entry) => {
      const key = `${entry.kind}|${entry.source}|${entry.path}|${entry.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },
);

export function entryPointsOfKind(
  entryPoints: readonly EntryPoint[],
  kind: EntryPointKind,
): EntryPoint[] {
  return entryPoints.filter((entry) => entry.kind === kind);
}

/** Static checks the detected ecosystems provide without configuration. */
export function builtinLintChecks(
  ecosystems: readonly EcosystemEvidence[],
): BuiltinCheck[] {
  return ecosystems.flatMap((ecosystem) => {
    const command = BUILTIN_LINT_CHECKS[ecosystem.id];
    return command === undefined ? [] : [{ command, path: ecosystem.manifest }];
  });
}
