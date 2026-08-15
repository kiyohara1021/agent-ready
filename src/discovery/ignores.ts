import type { RepositoryContext } from "../core/repository-context.js";
import { perContext } from "./cache.js";

/**
 * Discovery of repository ignore rules.
 *
 * Four detectors ask what the repository excludes: whether generated content is
 * separated, whether local artifacts are ignored, whether secret-bearing paths
 * are excluded, and whether ignore configuration exists at all. All of them need
 * the same question answered — "would this path be excluded?" — so the rules are
 * parsed once and matched here.
 *
 * Ignore files are read as inert text. Nothing is executed, and no path outside
 * the repository index is ever opened.
 */

export type IgnoreFileKind = "git" | "agent" | "tool";

export interface IgnoreFile {
  /** Repository-relative POSIX path. */
  path: string;
  kind: IgnoreFileKind;
  /** Static label from the catalog below; never a line of repository text. */
  label: string;
  /** Number of usable patterns, so an empty file can be told from a real one. */
  patternCount: number;
}

export interface IgnoreRules {
  /** Every discovered ignore file, shallowest first. */
  files: readonly IgnoreFile[];
  /**
   * `true` when the repository's `.gitignore` rules exclude the path.
   *
   * Git exclusion is the question that matters for what ends up committed, so
   * it is deliberately separate from tool- and agent-specific ignore files.
   */
  excludes(path: string, isDirectory?: boolean): boolean;
  /** `true` when any ignore file — git, tool, or agent — excludes the path. */
  excludedByAny(path: string, isDirectory?: boolean): boolean;
}

/** Ignore files are line-based configuration; a bounded read is enough. */
const IGNORE_MAX_BYTES = 32 * 1024;

/** Caps keep a pathological repository from turning matching into real work. */
const MAX_IGNORE_FILES = 32;
const MAX_PATTERNS_PER_FILE = 500;
/**
 * Patterns come from an untrusted repository, and wildcards compile to regular
 * expressions. A length cap bounds the cost of matching a hostile pattern.
 */
const MAX_PATTERN_LENGTH = 200;
/** Path segments allowed for a nested ignore file, e.g. `packages/api/.gitignore`. */
const MAX_IGNORE_DEPTH = 4;

const GIT_IGNORE_FILE = ".gitignore";

/**
 * Ignore files that are recognized but do not decide git exclusion.
 *
 * `agent` files narrow what a coding agent reads; `tool` files narrow what a
 * packaging or lint tool reads. Neither keeps a file out of a commit, so they
 * are evidence for `context.ignore` rather than for the safety detectors.
 */
const OTHER_IGNORE_FILES: Readonly<Record<string, { kind: IgnoreFileKind; label: string }>> = {
  ".agentignore": { kind: "agent", label: "Agent ignore file" },
  ".aiderignore": { kind: "agent", label: "Aider ignore file" },
  ".aiexclude": { kind: "agent", label: "AI exclude file" },
  ".claudeignore": { kind: "agent", label: "Claude ignore file" },
  ".codeiumignore": { kind: "agent", label: "Codeium ignore file" },
  ".continueignore": { kind: "agent", label: "Continue ignore file" },
  ".cursorignore": { kind: "agent", label: "Cursor ignore file" },
  ".dockerignore": { kind: "tool", label: "Docker ignore file" },
  ".eslintignore": { kind: "tool", label: "ESLint ignore file" },
  ".npmignore": { kind: "tool", label: "npm ignore file" },
  ".prettierignore": { kind: "tool", label: "Prettier ignore file" },
};

interface IgnoreRule {
  kind: IgnoreFileKind;
  /** Directory the rule is scoped to; `""` for the repository root. */
  scope: string;
  negated: boolean;
  /** Compiled pattern, matched against the scope-relative path. */
  matcher: RegExp;
}

const REGEXP_SPECIAL = /[.+^${}()|[\]\\]/g;

/**
 * Compiles one gitignore pattern into a regular expression.
 *
 * Supported: comments, negation, anchoring, directory-only rules, `*`, `?`, and
 * `**`. Deliberately unsupported: character classes (matched literally) and the
 * rule that an excluded parent directory cannot be re-included from within. Both
 * are rare, and over-claiming here would produce confident wrong findings.
 */
function compilePattern(raw: string): { matcher: RegExp; negated: boolean } | undefined {
  if (raw.length > MAX_PATTERN_LENGTH) return undefined;

  let pattern = raw;

  // Trailing whitespace is insignificant unless escaped.
  pattern = pattern.replace(/(?<!\\)\s+$/, "");
  if (pattern === "" || pattern.startsWith("#")) return undefined;

  let negated = false;
  if (pattern.startsWith("!")) {
    negated = true;
    pattern = pattern.slice(1);
  } else if (pattern.startsWith("\\#") || pattern.startsWith("\\!")) {
    pattern = pattern.slice(1);
  }

  if (pattern === "" || pattern === "/") return undefined;

  let directoryOnly = false;
  if (pattern.endsWith("/")) {
    directoryOnly = true;
    pattern = pattern.slice(0, -1);
  }

  let anchored = false;
  if (pattern.startsWith("/")) {
    anchored = true;
    pattern = pattern.slice(1);
  } else if (pattern.slice(0, -1).includes("/")) {
    // A slash anywhere but at the end anchors the pattern to the ignore file.
    anchored = true;
  }

  if (pattern === "") return undefined;

  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index] ?? "";

    if (character === "*") {
      const doubled = pattern[index + 1] === "*";
      if (doubled) {
        const followedBySlash = pattern[index + 2] === "/";
        if (followedBySlash) {
          source += "(?:.*/)?";
          index += 2;
        } else {
          source += ".*";
          index += 1;
        }
        continue;
      }
      source += "[^/]*";
      continue;
    }

    if (character === "?") {
      source += "[^/]";
      continue;
    }

    source += character.replace(REGEXP_SPECIAL, "\\$&");
  }

  const prefix = anchored ? "^" : "^(?:.*/)?";
  // Test strings carry a trailing slash for directories, so a directory-only
  // rule simply requires one, and every rule also matches a path inside it.
  const suffix = directoryOnly ? "/" : "(?:/|$)";

  return { matcher: new RegExp(`${prefix}${source}${suffix}`), negated };
}

function parseRules(
  raw: string,
  scope: string,
  kind: IgnoreFileKind,
): { rules: IgnoreRule[]; patternCount: number } {
  const rules: IgnoreRule[] = [];
  let patternCount = 0;

  for (const line of raw.split(/\r?\n/)) {
    if (patternCount >= MAX_PATTERNS_PER_FILE) break;

    const compiled = compilePattern(line);
    if (compiled === undefined) continue;

    patternCount += 1;
    rules.push({ kind, scope, negated: compiled.negated, matcher: compiled.matcher });
  }

  return { rules, patternCount };
}

function directoryOf(relativePath: string): string {
  const index = relativePath.lastIndexOf("/");
  return index === -1 ? "" : relativePath.slice(0, index);
}

function basename(relativePath: string): string {
  const segments = relativePath.split("/");
  return (segments[segments.length - 1] ?? "").toLowerCase();
}

function classify(relativePath: string): { kind: IgnoreFileKind; label: string } | undefined {
  const name = basename(relativePath);
  if (name === GIT_IGNORE_FILE) return { kind: "git", label: "Git ignore rules" };
  return OTHER_IGNORE_FILES[name];
}

/**
 * Selects ignore files, shallowest first.
 *
 * Depth order matters: a nested `.gitignore` overrides the root one, and the
 * last matching rule wins.
 */
function selectIgnoreFiles(context: RepositoryContext): { path: string; kind: IgnoreFileKind; label: string }[] {
  const selected = context.files.all
    .filter((file) => file.path.split("/").length <= MAX_IGNORE_DEPTH)
    .flatMap((file) => {
      const classification = classify(file.path);
      return classification === undefined ? [] : [{ path: file.path, ...classification }];
    });

  // The index is sorted by path; a stable sort by depth keeps that order within
  // each level, so selection never depends on filesystem traversal.
  selected.sort((a, b) => a.path.split("/").length - b.path.split("/").length);

  return selected.slice(0, MAX_IGNORE_FILES);
}

function matches(rules: readonly IgnoreRule[], candidate: string, kinds: ReadonlySet<IgnoreFileKind>): boolean {
  let excluded = false;

  // Last match wins, which is how negation re-includes a path.
  for (const rule of rules) {
    if (!kinds.has(rule.kind)) continue;

    let relative = candidate;
    if (rule.scope !== "") {
      if (!candidate.startsWith(`${rule.scope}/`)) continue;
      relative = candidate.slice(rule.scope.length + 1);
    }

    if (rule.matcher.test(relative)) excluded = !rule.negated;
  }

  return excluded;
}

const GIT_ONLY: ReadonlySet<IgnoreFileKind> = new Set<IgnoreFileKind>(["git"]);
const ANY_KIND: ReadonlySet<IgnoreFileKind> = new Set<IgnoreFileKind>(["git", "agent", "tool"]);

/**
 * Parses the repository's ignore configuration.
 *
 * Matching normalizes a candidate path the way the rules expect: repository
 * relative, POSIX separated, with a trailing slash when it names a directory.
 */
export const discoverIgnoreRules = perContext(
  async (context: RepositoryContext): Promise<IgnoreRules> => {
    const selected = selectIgnoreFiles(context);

    const parsed = await Promise.all(
      selected.map(async ({ path, kind, label }) => {
        const raw = await context.readTextFile(path, IGNORE_MAX_BYTES);
        if (raw === undefined) return undefined;

        const { rules, patternCount } = parseRules(raw, directoryOf(path), kind);
        return { file: { path, kind, label, patternCount }, rules };
      }),
    );

    const found = parsed.filter((entry) => entry !== undefined);
    const files = found.map((entry) => entry.file);
    const rules = found.flatMap((entry) => entry.rules);

    const test = (
      candidate: string,
      isDirectory: boolean,
      kinds: ReadonlySet<IgnoreFileKind>,
    ): boolean => {
      const trimmed = candidate.replace(/^\.\//, "").replace(/^\/+/, "");
      // A trailing slash names a directory, whether or not the caller says so.
      const directory = isDirectory || trimmed.endsWith("/");
      const normalized = trimmed.replace(/\/+$/, "");
      if (normalized === "") return false;
      return matches(rules, directory ? `${normalized}/` : normalized, kinds);
    };

    return {
      files,
      excludes: (candidate, isDirectory = false) => test(candidate, isDirectory, GIT_ONLY),
      excludedByAny: (candidate, isDirectory = false) => test(candidate, isDirectory, ANY_KIND),
    };
  },
);

/** `true` when the repository has a `.gitignore` with at least one rule. */
export function hasGitIgnore(rules: IgnoreRules): boolean {
  return rules.files.some((file) => file.kind === "git" && file.patternCount > 0);
}

/** The root `.gitignore`, when one exists. */
export function rootGitIgnore(rules: IgnoreRules): IgnoreFile | undefined {
  return rules.files.find((file) => file.path === GIT_IGNORE_FILE);
}

/** Ignore files of a kind, in discovery order. */
export function ignoreFilesOfKind(rules: IgnoreRules, kind: IgnoreFileKind): IgnoreFile[] {
  return rules.files.filter((file) => file.kind === kind);
}
