import type { RepositoryContext } from "../core/repository-context.js";
import { perContext } from "./cache.js";
import { detectEcosystems, type EcosystemId } from "./ecosystems.js";
import { discoverWorkflows, usesAction } from "./workflows.js";

/**
 * Discovery of dependency update automation.
 *
 * Configuration is read as data: Dependabot's update targets are matched
 * line-by-line, and Renovate configuration is only checked for existence and
 * non-emptiness. Neither tool is invoked, and no registry is contacted.
 */

export type DependencyAutomationTool = "Dependabot" | "Renovate";

export interface DependencyAutomation {
  tool: DependencyAutomationTool;
  /** Repository-relative path of the configuration. */
  path: string;
  /** `false` when the file exists but declares no update targets. */
  configured: boolean;
  /** Covers a package ecosystem the repository actually uses. */
  coversPackages: boolean;
  /** Keeps CI workflow/action versions up to date as well. */
  coversWorkflows: boolean;
}

const CONFIG_MAX_BYTES = 32 * 1024;

const DEPENDABOT_FILES: readonly string[] = [".github/dependabot.yml", ".github/dependabot.yaml"];

/** Documented Renovate configuration locations. */
const RENOVATE_FILES: readonly string[] = [
  "renovate.json",
  "renovate.json5",
  ".renovaterc",
  ".renovaterc.json",
  ".renovaterc.json5",
  ".github/renovate.json",
  ".github/renovate.json5",
  ".gitlab/renovate.json",
];

const RENOVATE_ACTION = "renovatebot/github-action";

/** `- package-ecosystem: "npm"`, in any of its YAML spellings. */
const PACKAGE_ECOSYSTEM = /^\s*(?:-\s+)?package-ecosystem:\s*["']?([a-z0-9_.-]+)["']?/;

const WORKFLOW_TARGET = "github-actions";

/**
 * Dependabot package-ecosystem names mapped onto detected ecosystems.
 *
 * Unmapped names (`docker`, `terraform`, `devcontainers`, …) are still update
 * targets; they simply cannot be matched against a detected ecosystem.
 */
const DEPENDABOT_ECOSYSTEMS: Readonly<Record<string, EcosystemId>> = {
  npm: "node",
  pnpm: "node",
  yarn: "node",
  bun: "node",
  composer: "php",
  pip: "python",
  uv: "python",
  poetry: "python",
  cargo: "rust",
  gomod: "go",
  go_modules: "go",
  bundler: "ruby",
  pub: "dart",
  swift: "swift",
  maven: "java",
  gradle: "java",
  nuget: "dotnet",
  mix: "elixir",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses JSON as inert data. Malformed configuration is simply not evidence. */
function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

async function readDependabot(
  context: RepositoryContext,
  detected: readonly EcosystemId[],
): Promise<DependencyAutomation | undefined> {
  const path = DEPENDABOT_FILES.find((candidate) => context.files.has(candidate));
  if (path === undefined) return undefined;

  const raw = await context.readTextFile(path, CONFIG_MAX_BYTES);
  if (raw === undefined) return undefined;

  const targets: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const target = PACKAGE_ECOSYSTEM.exec(line)?.[1];
    if (target !== undefined) targets.push(target.toLowerCase());
  }

  const packageTargets = targets.filter((target) => target !== WORKFLOW_TARGET);
  const coversPackages =
    detected.length === 0
      ? packageTargets.length > 0
      : packageTargets.some((target) => {
          const mapped = DEPENDABOT_ECOSYSTEMS[target];
          return mapped !== undefined && detected.includes(mapped);
        });

  return {
    tool: "Dependabot",
    path,
    configured: targets.length > 0,
    coversPackages,
    coversWorkflows: targets.includes(WORKFLOW_TARGET),
  };
}

/**
 * Renovate coverage is not read from the configuration.
 *
 * Renovate enables every package manager it detects, including GitHub Actions,
 * unless the configuration opts out. Presence of a configuration therefore
 * already implies the coverage that Dependabot has to declare per ecosystem.
 */
function renovateCoverage(path: string): DependencyAutomation {
  return {
    tool: "Renovate",
    path,
    configured: true,
    coversPackages: true,
    coversWorkflows: true,
  };
}

async function readRenovate(
  context: RepositoryContext,
): Promise<DependencyAutomation | undefined> {
  const path = RENOVATE_FILES.find((candidate) => context.files.has(candidate));
  if (path !== undefined) {
    const raw = await context.readTextFile(path, CONFIG_MAX_BYTES);
    // An empty file is not a configuration; anything else is left unparsed
    // because Renovate also accepts JSON5.
    if (raw !== undefined && raw.trim() !== "") return renovateCoverage(path);
  }

  const manifest = await context.readTextFile("package.json", CONFIG_MAX_BYTES);
  if (manifest !== undefined) {
    const parsed = safeParseJson(manifest);
    if (isRecord(parsed) && isRecord(parsed.renovate)) return renovateCoverage("package.json");
  }

  return undefined;
}

/**
 * Dependency update automation configured for the repository.
 *
 * Ordering is Dependabot, then Renovate configuration, then a self-hosted
 * Renovate workflow, so evidence never depends on traversal order.
 */
export const discoverDependencyAutomation = perContext(
  async (context: RepositoryContext): Promise<DependencyAutomation[]> => {
    const [ecosystems, workflows] = await Promise.all([
      detectEcosystems(context),
      discoverWorkflows(context),
    ]);
    const detected = ecosystems.map((ecosystem) => ecosystem.id);

    const [dependabot, renovate] = await Promise.all([
      readDependabot(context, detected),
      readRenovate(context),
    ]);

    const found: DependencyAutomation[] = [];
    if (dependabot) found.push(dependabot);
    if (renovate) found.push(renovate);

    if (renovate === undefined) {
      // Self-hosted Renovate runs from a workflow instead of a configuration file.
      const workflow = workflows.find((candidate) => usesAction([candidate], RENOVATE_ACTION));
      if (workflow !== undefined) found.push(renovateCoverage(workflow.path));
    }

    return found;
  },
);
