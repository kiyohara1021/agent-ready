import type { RepositoryContext } from "../core/repository-context.js";
import { perContext } from "./cache.js";
import { matchCommands, toCommandSegments } from "./commands.js";

/**
 * Conservative CI workflow analysis.
 *
 * v0.1 parses GitHub Actions workflows. Parsing is deliberately shallow: the
 * `run:` steps are collected as text and classified with the same command
 * catalog the rest of discovery uses. There is no YAML object model, no
 * expression evaluation, and no shell interpreter — a workflow is untrusted
 * input that must never be executed or interpreted, only read.
 *
 * The cost of that shallowness is uncertainty, which detectors report as a
 * warning rather than as a confident failure.
 */

export type WorkflowSignalKind = "test" | "lint" | "typecheck" | "build";

export interface WorkflowSignal {
  kind: WorkflowSignalKind;
  /** Stable catalog label, never a line copied out of the workflow. */
  label: string;
}

export interface WorkflowFile {
  /** Repository-relative POSIX path. */
  path: string;
  /** Normalized command segments from the workflow's `run:` steps. */
  commands: readonly string[];
  /** Lowercased `uses:` references with the version reference stripped. */
  actions: readonly string[];
  /** Validation the workflow appears to perform, in {@link SIGNAL_ORDER}. */
  signals: readonly WorkflowSignal[];
}

const WORKFLOW_DIRECTORY = ".github/workflows/";
const WORKFLOW_EXTENSIONS: readonly string[] = [".yml", ".yaml"];
/** `.github/workflows/ci.yml` — workflows are never nested deeper. */
const WORKFLOW_DEPTH = 3;
/** Caps keep analysis bounded on repositories with many workflows. */
const MAX_WORKFLOWS = 20;
const WORKFLOW_MAX_BYTES = 64 * 1024;

/** Command kinds that the shared catalog already recognizes. */
const CATALOG_KINDS = ["test", "lint", "typecheck"] as const;

export const SIGNAL_ORDER: readonly WorkflowSignalKind[] = ["test", "lint", "typecheck", "build"];

/**
 * Build commands, which the shared catalog does not model: a build is not a
 * validation command a contributor is told to run, but it is meaningful
 * evidence that CI compiles the project.
 */
const BUILD_COMMANDS: readonly { label: string; pattern: RegExp }[] = [
  { label: "npm run build", pattern: /^npm run build\b/ },
  { label: "package manager build script", pattern: /^(pnpm|yarn|bun) (run )?build\b/ },
  { label: "composer build", pattern: /^composer (run-script )?build\b/ },
  { label: "python build", pattern: /^(python3? -m build|hatch build|poetry build|uv build)\b/ },
  { label: "cargo build", pattern: /^cargo build\b/ },
  { label: "go build", pattern: /^go build\b/ },
  { label: "gradle build", pattern: /^(\.\/)?gradlew? (build|assemble)\b/ },
  { label: "maven package", pattern: /^(mvn|(\.\/)?mvnw)\b.*\b(package|verify)\b/ },
  { label: "dotnet build", pattern: /^dotnet build\b/ },
  { label: "swift build", pattern: /^swift build\b/ },
  { label: "flutter build", pattern: /^(flutter|dart) build\b/ },
  { label: "docker build", pattern: /^docker (build|buildx build)\b/ },
  { label: "make build", pattern: /^make (build|all|compile|dist)\b/ },
  { label: "tsc build", pattern: /^tsc\b.*(-b|--build)\b/ },
];

/**
 * Actions that perform validation themselves rather than through `run:`.
 *
 * Kept deliberately short: inferring intent from an action name is guesswork,
 * and a missed signal only costs partial credit, while a wrong one is a false
 * pass.
 */
const ACTION_SIGNALS: readonly { kind: WorkflowSignalKind; label: string; action: string }[] = [
  { kind: "lint", label: "golangci-lint action", action: "golangci/golangci-lint-action" },
  { kind: "lint", label: "super-linter action", action: "github/super-linter" },
];

/**
 * CI systems other than GitHub Actions.
 *
 * Their configuration is not parsed, so presence is the only claim made about
 * them. Recognizing the file at all keeps `automation.ci` from reporting "no
 * CI" for a repository that plainly has some.
 */
const OTHER_CI_FILES: readonly { label: string; path: string }[] = [
  { label: "GitLab CI", path: ".gitlab-ci.yml" },
  { label: "CircleCI", path: ".circleci/config.yml" },
  { label: "Azure Pipelines", path: "azure-pipelines.yml" },
  { label: "Jenkins", path: "Jenkinsfile" },
  { label: "Travis CI", path: ".travis.yml" },
  { label: "Bitbucket Pipelines", path: "bitbucket-pipelines.yml" },
  { label: "Drone CI", path: ".drone.yml" },
  { label: "Woodpecker CI", path: ".woodpecker.yml" },
];

export interface CiConfiguration {
  label: string;
  path: string;
}

/** `run:` and `uses:`, with the optional YAML sequence dash before the key. */
const RUN_KEY = /^(\s*(?:-\s+)?)run:(?:[ \t]+(.*))?$/;
const USES_KEY = /^\s*(?:-\s+)?uses:[ \t]+(.*)$/;
/** Block scalar headers: `|`, `>-`, `|+2`, and friends. */
const BLOCK_SCALAR = /^[|>][+-]?\d*$/;

function unquote(value: string): string {
  const trimmed = value.trim();
  const first = trimmed.charAt(0);
  if ((first === '"' || first === "'") && trimmed.length > 1 && trimmed.endsWith(first)) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/**
 * Collects `run:` bodies and `uses:` references from workflow text.
 *
 * Both inline (`run: npm test`) and block (`run: |`) forms are handled; a block
 * body is every following line indented past the `run:` key. Anything else in
 * the document — matrices, conditions, expressions — is ignored on purpose.
 */
function extractSteps(raw: string): { commands: string[]; actions: string[] } {
  const lines = raw.split(/\r?\n/);
  const runLines: string[] = [];
  const actions: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    const uses = USES_KEY.exec(line);
    const usesValue = uses?.[1];
    if (usesValue !== undefined) {
      const action = unquote(usesValue).split("@")[0]?.trim().toLowerCase();
      if (action !== undefined && action !== "") actions.push(action);
      continue;
    }

    const run = RUN_KEY.exec(line);
    if (run === null) continue;

    const keyColumn = (run[1] ?? "").length;
    const inline = unquote(run[2] ?? "");

    if (inline !== "" && !BLOCK_SCALAR.test(inline)) {
      runLines.push(inline);
      continue;
    }

    // Block scalar: consume the indented body, then let the outer loop see the
    // line that ended it, which may itself be another `run:` or `uses:` key.
    for (index += 1; index < lines.length; index += 1) {
      const body = lines[index] ?? "";
      if (body.trim() === "") continue;
      if (indentOf(body) <= keyColumn) {
        index -= 1;
        break;
      }
      runLines.push(body.trim());
    }
  }

  return {
    commands: toCommandSegments(runLines.map((line) => line.toLowerCase())),
    actions,
  };
}

function classify(commands: readonly string[], actions: readonly string[]): WorkflowSignal[] {
  const signals: WorkflowSignal[] = [];

  for (const kind of CATALOG_KINDS) {
    for (const pattern of matchCommands(commands, kind)) {
      signals.push({ kind, label: pattern.label });
    }
  }

  for (const build of BUILD_COMMANDS) {
    if (commands.some((segment) => build.pattern.test(segment))) {
      signals.push({ kind: "build", label: build.label });
    }
  }

  for (const action of ACTION_SIGNALS) {
    if (actions.includes(action.action)) {
      signals.push({ kind: action.kind, label: action.label });
    }
  }

  return signals;
}

function isWorkflowPath(relativePath: string): boolean {
  return (
    relativePath.startsWith(WORKFLOW_DIRECTORY) &&
    relativePath.split("/").length === WORKFLOW_DEPTH &&
    WORKFLOW_EXTENSIONS.some((extension) => relativePath.toLowerCase().endsWith(extension))
  );
}

/**
 * GitHub Actions workflows and the validation they appear to run.
 *
 * Ordering follows the file index, which is sorted by path, so evidence never
 * depends on traversal order.
 */
export const discoverWorkflows = perContext(
  async (context: RepositoryContext): Promise<WorkflowFile[]> => {
    const paths = context.files
      .filter((file) => isWorkflowPath(file.path))
      .slice(0, MAX_WORKFLOWS)
      .map((file) => file.path);

    const workflows = await Promise.all(
      paths.map(async (path): Promise<WorkflowFile | undefined> => {
        const raw = await context.readTextFile(path, WORKFLOW_MAX_BYTES);
        if (raw === undefined) return undefined;

        const { commands, actions } = extractSteps(raw);
        return { path, commands, actions, signals: classify(commands, actions) };
      }),
    );

    return workflows.filter((workflow): workflow is WorkflowFile => workflow !== undefined);
  },
);

/** Configuration of CI systems whose contents are not parsed. */
export const detectOtherCi = perContext((context: RepositoryContext) =>
  Promise.resolve(
    OTHER_CI_FILES.filter((candidate) => context.files.has(candidate.path)).map(
      (candidate): CiConfiguration => ({ label: candidate.label, path: candidate.path }),
    ),
  ),
);

export interface WorkflowSignalMatch {
  workflow: WorkflowFile;
  signal: WorkflowSignal;
}

/** Workflow signals of `kind`, in workflow order then signal order. */
export function workflowSignals(
  workflows: readonly WorkflowFile[],
  kind: WorkflowSignalKind,
): WorkflowSignalMatch[] {
  return workflows.flatMap((workflow) =>
    workflow.signals
      .filter((signal) => signal.kind === kind)
      .map((signal) => ({ workflow, signal })),
  );
}

/** `true` when any workflow uses `action`, e.g. `renovatebot/github-action`. */
export function usesAction(workflows: readonly WorkflowFile[], action: string): boolean {
  return workflows.some((workflow) => workflow.actions.includes(action));
}
