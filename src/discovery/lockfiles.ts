import type { RepositoryContext } from "../core/repository-context.js";
import { perContext } from "./cache.js";
import { detectEcosystems, type EcosystemEvidence, type EcosystemId } from "./ecosystems.js";

/**
 * Discovery of dependency locking.
 *
 * `safety.lockfile` asks a narrower question than "is there a lockfile?": a lock
 * only means something when the project actually depends on third-party code,
 * and only some ecosystems have a conventional lockfile at all. Both facts are
 * established here so the detector never has to assume an ecosystem.
 *
 * Manifests are read as inert text to see whether dependencies are declared.
 * Lockfiles themselves are never opened — their presence is the whole signal.
 */

export interface DependencySurface {
  ecosystem: EcosystemId;
  label: string;
  /** Repository-relative path of the manifest that proved the ecosystem. */
  manifest: string;
  /** `true` when the manifest declares third-party dependencies. */
  declaresDependencies: boolean;
  /** Conventional lockfile names for this ecosystem, in preference order. */
  conventional: readonly string[];
  /** Conventional lockfiles that exist, as repository-relative paths. */
  lockfiles: readonly string[];
  /**
   * Lockfile implied by the project's own configuration — currently the npm
   * `packageManager` field. Undefined when the project declares no preference.
   */
  expected?: string;
}

/** Manifests are configuration; a bounded read is always enough. */
const MANIFEST_MAX_BYTES = 64 * 1024;

/**
 * Conventional lockfiles per ecosystem.
 *
 * An ecosystem missing from this table has no conventional lockfile — Java,
 * .NET, and Make all leave locking to an opt-in feature — so a repository in
 * one is never asked for a lockfile it would not normally have.
 */
const CONVENTIONAL_LOCKFILES: Readonly<Partial<Record<EcosystemId, readonly string[]>>> = {
  node: [
    "package-lock.json",
    "npm-shrinkwrap.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lock",
    "bun.lockb",
  ],
  php: ["composer.lock"],
  python: ["uv.lock", "poetry.lock", "pdm.lock", "Pipfile.lock", "requirements.lock"],
  rust: ["Cargo.lock"],
  go: ["go.sum"],
  ruby: ["Gemfile.lock"],
  dart: ["pubspec.lock"],
  swift: ["Package.resolved"],
  elixir: ["mix.lock"],
};

/** npm `packageManager` values mapped onto the lockfile they produce. */
const PACKAGE_MANAGER_LOCKFILES: Readonly<Record<string, string>> = {
  npm: "package-lock.json",
  pnpm: "pnpm-lock.yaml",
  yarn: "yarn.lock",
  bun: "bun.lock",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses JSON as inert data. A malformed manifest is simply not evidence. */
function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function hasEntries(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length > 0;
}

/**
 * `true` when a TOML/YAML style section is followed by at least one entry.
 *
 * Line-level, like the rest of discovery: enough to tell "declares dependencies"
 * from "declares none", and never an attempt to resolve them.
 */
function sectionHasEntries(raw: string, header: RegExp, entry: RegExp): boolean {
  let inSection = false;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    if (header.test(trimmed)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    // A new section header of any kind ends the one being read.
    if (/^\[/.test(trimmed)) {
      inSection = false;
      continue;
    }
    if (entry.test(trimmed)) return true;
  }

  return false;
}

/**
 * Whether a manifest declares third-party dependencies.
 *
 * A project with no dependencies has nothing to lock, so demanding a lockfile
 * from it would be a false positive — this is the "where meaningful" half of
 * the check.
 */
function declaresDependencies(manifest: string, raw: string): boolean {
  const name = manifest.slice(manifest.lastIndexOf("/") + 1).toLowerCase();

  switch (name) {
    case "package.json": {
      const parsed = safeParseJson(raw);
      if (!isRecord(parsed)) return false;
      return (
        hasEntries(parsed.dependencies) ||
        hasEntries(parsed.devDependencies) ||
        hasEntries(parsed.optionalDependencies)
      );
    }
    case "composer.json": {
      const parsed = safeParseJson(raw);
      if (!isRecord(parsed)) return false;
      // `require.php` is a platform constraint rather than a package.
      const required = isRecord(parsed.require)
        ? Object.keys(parsed.require).filter((key) => !key.startsWith("php") && !key.startsWith("ext-"))
        : [];
      return required.length > 0 || hasEntries(parsed["require-dev"]);
    }
    case "pyproject.toml":
      return (
        /^\s*dependencies\s*=\s*\[\s*["']/m.test(raw) ||
        /^\s*dependencies\s*=\s*\[\s*$/m.test(raw) ||
        sectionHasEntries(raw, /^\[(tool\.poetry\.)?dependencies\]/, /^[\w.-]+\s*=/) ||
        /^\[dependency-groups\]/m.test(raw)
      );
    case "requirements.txt":
      return raw.split(/\r?\n/).some((line) => /^[A-Za-z0-9]/.test(line.trim()));
    case "pipfile":
      return sectionHasEntries(raw, /^\[packages\]/, /^[\w.-]+\s*=/);
    case "setup.py":
      return /install_requires\s*=\s*\[\s*["']/.test(raw);
    case "cargo.toml":
      return sectionHasEntries(raw, /^\[(\S+\.)?(dev-|build-)?dependencies\]/, /^[\w.-]+\s*=/);
    case "go.mod":
      return /^require\s/m.test(raw);
    case "gemfile":
      return /^\s*gem\s+["']/m.test(raw);
    case "pubspec.yaml":
      return /^dependencies:\s*$/m.test(raw) && /^\s{2,}\S+:/m.test(raw);
    case "package.swift":
      return /\.package\(/.test(raw);
    case "mix.exs":
      return /\{\s*:\w+\s*,/.test(raw);
    default:
      return false;
  }
}

/**
 * `true` when a `requirements.txt` pins every dependency exactly.
 *
 * A fully pinned requirements file is what it locks the project to, so asking
 * such a project for `uv.lock` as well would be a false positive.
 */
function pinsEveryRequirement(raw: string): boolean {
  const requirements = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#") && !line.startsWith("-"));

  return (
    requirements.length > 0 &&
    requirements.every((line) => line.includes("==") || line.includes(" @ "))
  );
}

/** The lockfile the npm `packageManager` field commits the project to. */
function expectedNodeLockfile(raw: string): string | undefined {
  const parsed = safeParseJson(raw);
  if (!isRecord(parsed)) return undefined;

  const declared = parsed.packageManager;
  if (typeof declared !== "string") return undefined;

  const manager = /^([a-z]+)/.exec(declared.trim().toLowerCase())?.[1];
  return manager === undefined ? undefined : PACKAGE_MANAGER_LOCKFILES[manager];
}

function surfaceFor(
  context: RepositoryContext,
  ecosystem: EcosystemEvidence,
  raw: string | undefined,
  expected: string | undefined,
): DependencySurface {
  const conventional = CONVENTIONAL_LOCKFILES[ecosystem.id] ?? [];
  const directory = ecosystem.manifest.includes("/")
    ? `${ecosystem.manifest.slice(0, ecosystem.manifest.lastIndexOf("/"))}/`
    : "";

  const lockfiles = conventional
    .map((name) => `${directory}${name}`)
    .filter((path) => context.files.has(path));

  const manifestName = ecosystem.manifest.slice(ecosystem.manifest.lastIndexOf("/") + 1);
  if (
    manifestName.toLowerCase() === "requirements.txt" &&
    raw !== undefined &&
    pinsEveryRequirement(raw)
  ) {
    lockfiles.push(ecosystem.manifest);
  }

  return {
    ecosystem: ecosystem.id,
    label: ecosystem.label,
    manifest: ecosystem.manifest,
    declaresDependencies: raw === undefined ? false : declaresDependencies(ecosystem.manifest, raw),
    conventional,
    lockfiles,
    ...(expected === undefined ? {} : { expected: `${directory}${expected}` }),
  };
}

/**
 * Dependency management per detected ecosystem, in ecosystem detection order.
 *
 * Lockfiles are looked for beside the manifest that proved the ecosystem, so a
 * `packages/api/package.json` is judged against `packages/api/package-lock.json`
 * rather than against the repository root.
 */
export const discoverDependencySurfaces = perContext(
  async (context: RepositoryContext): Promise<DependencySurface[]> => {
    const ecosystems = await detectEcosystems(context);

    return Promise.all(
      ecosystems.map(async (ecosystem) => {
        const raw = await context.readTextFile(ecosystem.manifest, MANIFEST_MAX_BYTES);
        const expected =
          ecosystem.id === "node" && raw !== undefined ? expectedNodeLockfile(raw) : undefined;
        return surfaceFor(context, ecosystem, raw, expected);
      }),
    );
  },
);

/**
 * Surfaces where a lockfile is meaningful: the ecosystem has a conventional one
 * and the project actually declares dependencies.
 */
export function lockableSurfaces(surfaces: readonly DependencySurface[]): DependencySurface[] {
  return surfaces.filter(
    (surface) => surface.conventional.length > 0 && surface.declaresDependencies,
  );
}
