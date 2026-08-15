import type { RepositoryContext } from "../core/repository-context.js";
import { perContext } from "./cache.js";
import { collectDocumentation, type DocumentationFile } from "./documentation.js";
import { contentLength } from "./markdown.js";

/**
 * Discovery of project identity metadata.
 *
 * `context.metadata` asks whether a reader can tell what the project is, who
 * may use it, where it lives, and what it runs on. Every ecosystem answers
 * those questions in its own file, so the evidence is normalized into signals
 * here and the detector never learns Node.js conventions.
 *
 * Only the *presence* of a value is recorded. Manifest text is read to decide
 * whether a field is filled in, and is never carried into a finding.
 */

export type MetadataKind = "name" | "description" | "license" | "repository" | "runtime";

export interface MetadataSignal {
  kind: MetadataKind;
  /** Repository-relative path of the evidence. */
  path: string;
  /** Static label; never repository text. */
  label: string;
}

/** Manifests are configuration; a bounded read is always enough. */
const MANIFEST_MAX_BYTES = 64 * 1024;

/** Below this, a description names the project again rather than describing it. */
const MIN_DESCRIPTION_LENGTH = 20;
/** A README summary has to be a sentence about the project, not a badge row. */
const MIN_README_SUMMARY = 80;

const LICENSE_FILES: readonly string[] = [
  "LICENSE",
  "LICENSE.md",
  "LICENSE.txt",
  "LICENCE",
  "LICENCE.md",
  "LICENCE.txt",
  "COPYING",
  "COPYING.md",
  "UNLICENSE",
];

/**
 * Files that pin a toolchain version. Their presence is the whole signal; the
 * pinned version itself is never needed.
 */
const RUNTIME_PIN_FILES: readonly string[] = [
  ".nvmrc",
  ".node-version",
  ".tool-versions",
  ".python-version",
  ".ruby-version",
  ".java-version",
  ".sdkmanrc",
  "rust-toolchain",
  "rust-toolchain.toml",
  "runtime.txt",
];

const LABELS: Readonly<Record<MetadataKind, string>> = {
  name: "Project name",
  description: "Project description",
  license: "License",
  repository: "Repository URL",
  runtime: "Runtime/toolchain constraint",
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

function filled(value: unknown, minimum = 1): boolean {
  return typeof value === "string" && contentLength(value) >= minimum;
}

/** `true` when the object has at least one non-empty string value. */
function anyFilled(value: unknown): boolean {
  if (typeof value === "string") return filled(value);
  if (!isRecord(value)) return false;
  return Object.values(value).some((entry) => filled(entry) || anyFilled(entry));
}

/**
 * Reads a `key = value` entry from a TOML section.
 *
 * This is a line scan, not a TOML implementation: nested tables, multi-line
 * strings, and inline tables are out of scope, and an unparsed value is treated
 * as absent rather than guessed at.
 */
function tomlValue(raw: string, section: string, key: string): string | undefined {
  let current = "";

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("[")) {
      current = trimmed.replace(/\s+#.*$/, "");
      continue;
    }
    if (current !== section) continue;

    const match = new RegExp(`^${key}\\s*=\\s*(.+)$`).exec(trimmed);
    const value = match?.[1];
    if (value === undefined) continue;

    return value.trim().replace(/^["']|["']$/g, "");
  }

  return undefined;
}

/** `true` when a TOML section exists and holds at least one entry. */
function tomlSectionHasEntries(raw: string, section: string): boolean {
  let inSection = false;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed === "") continue;

    if (trimmed.startsWith("[")) {
      inSection = trimmed.replace(/\s+#.*$/, "") === section;
      continue;
    }
    if (inSection && trimmed.includes("=")) return true;
  }

  return false;
}

/** Reads a top-level `key: value` entry from simple YAML. */
function yamlValue(raw: string, key: string): string | undefined {
  const match = new RegExp(`^${key}:[ \\t]*(.*)$`, "m").exec(raw);
  const value = match?.[1];
  if (value === undefined) return undefined;
  return value.trim().replace(/^["']|["']$/g, "");
}

type SignalReader = (raw: string) => MetadataKind[];

/** Manifest readers, ordered so that evidence never depends on traversal. */
const MANIFEST_READERS: readonly { path: string; read: SignalReader }[] = [
  {
    path: "package.json",
    read: (raw) => {
      const parsed = safeParseJson(raw);
      if (!isRecord(parsed)) return [];

      const kinds: MetadataKind[] = [];
      if (filled(parsed.name)) kinds.push("name");
      if (filled(parsed.description, MIN_DESCRIPTION_LENGTH)) kinds.push("description");
      if (filled(parsed.license) || anyFilled(parsed.licenses)) kinds.push("license");
      if (anyFilled(parsed.repository) || filled(parsed.homepage)) kinds.push("repository");
      if (anyFilled(parsed.engines)) kinds.push("runtime");
      return kinds;
    },
  },
  {
    path: "composer.json",
    read: (raw) => {
      const parsed = safeParseJson(raw);
      if (!isRecord(parsed)) return [];

      const kinds: MetadataKind[] = [];
      if (filled(parsed.name)) kinds.push("name");
      if (filled(parsed.description, MIN_DESCRIPTION_LENGTH)) kinds.push("description");
      if (filled(parsed.license) || Array.isArray(parsed.license)) kinds.push("license");
      if (filled(parsed.homepage) || anyFilled(parsed.support)) kinds.push("repository");
      if (isRecord(parsed.require) && filled(parsed.require.php)) kinds.push("runtime");
      return kinds;
    },
  },
  {
    path: "pyproject.toml",
    read: (raw) => {
      const kinds: MetadataKind[] = [];
      if (filled(tomlValue(raw, "[project]", "name"))) kinds.push("name");
      if (filled(tomlValue(raw, "[project]", "description"), MIN_DESCRIPTION_LENGTH)) {
        kinds.push("description");
      }
      if (
        filled(tomlValue(raw, "[project]", "license")) ||
        filled(tomlValue(raw, "[project]", "license-files"))
      ) {
        kinds.push("license");
      }
      if (tomlSectionHasEntries(raw, "[project.urls]")) kinds.push("repository");
      if (filled(tomlValue(raw, "[project]", "requires-python"))) kinds.push("runtime");
      return kinds;
    },
  },
  {
    path: "Cargo.toml",
    read: (raw) => {
      const kinds: MetadataKind[] = [];
      if (filled(tomlValue(raw, "[package]", "name"))) kinds.push("name");
      if (filled(tomlValue(raw, "[package]", "description"), MIN_DESCRIPTION_LENGTH)) {
        kinds.push("description");
      }
      if (filled(tomlValue(raw, "[package]", "license"))) kinds.push("license");
      if (
        filled(tomlValue(raw, "[package]", "repository")) ||
        filled(tomlValue(raw, "[package]", "homepage"))
      ) {
        kinds.push("repository");
      }
      if (filled(tomlValue(raw, "[package]", "rust-version"))) kinds.push("runtime");
      return kinds;
    },
  },
  {
    path: "pubspec.yaml",
    read: (raw) => {
      const kinds: MetadataKind[] = [];
      if (filled(yamlValue(raw, "name"))) kinds.push("name");
      if (filled(yamlValue(raw, "description"), MIN_DESCRIPTION_LENGTH)) kinds.push("description");
      if (filled(yamlValue(raw, "repository")) || filled(yamlValue(raw, "homepage"))) {
        kinds.push("repository");
      }
      if (/^environment:/m.test(raw)) kinds.push("runtime");
      return kinds;
    },
  },
  {
    path: "go.mod",
    read: (raw) => {
      const kinds: MetadataKind[] = [];
      const module = /^module\s+(\S+)/m.exec(raw)?.[1];
      if (module !== undefined) {
        kinds.push("name");
        // A module path that starts with a host is where the code actually lives.
        if (/^[^/]+\.[^/]+\//.test(module)) kinds.push("repository");
      }
      if (/^go\s+\d+(\.\d+)*/m.test(raw)) kinds.push("runtime");
      return kinds;
    },
  },
];

function readmeSignals(readme: DocumentationFile | undefined): MetadataKind[] {
  if (readme === undefined) return [];

  const kinds: MetadataKind[] = [];
  if (readme.signals.headings.length > 0) kinds.push("name");

  // The summary is what a reader meets first: the preamble, or the body of the
  // title section when the document opens with its heading.
  const summary = readme.signals.sections
    .slice(0, 2)
    .reduce((total, section) => total + contentLength(section.text), 0);
  if (summary >= MIN_README_SUMMARY) kinds.push("description");

  return kinds;
}

/**
 * Project identity signals, one per kind.
 *
 * Manifests are consulted first, then license and toolchain files, then the
 * README. A Node project without an npm description can still describe itself
 * in its README, and a non-Node project is never asked for npm fields at all.
 */
export const discoverProjectMetadata = perContext(
  async (context: RepositoryContext): Promise<MetadataSignal[]> => {
    const manifests = await Promise.all(
      MANIFEST_READERS.map(async ({ path, read }) => {
        if (!context.files.has(path)) return undefined;
        const raw = await context.readTextFile(path, MANIFEST_MAX_BYTES);
        if (raw === undefined) return undefined;
        return { path, kinds: read(raw) };
      }),
    );

    const docs = await collectDocumentation(context);
    const readme = docs.find((doc) => doc.role === "readme");

    const candidates: { kind: MetadataKind; path: string }[] = [];

    for (const manifest of manifests) {
      if (manifest === undefined) continue;
      for (const kind of manifest.kinds) candidates.push({ kind, path: manifest.path });
    }

    const licenseFile = LICENSE_FILES.find((name) => context.files.has(name));
    if (licenseFile !== undefined) candidates.push({ kind: "license", path: licenseFile });

    const pinFile = RUNTIME_PIN_FILES.find((name) => context.files.has(name));
    if (pinFile !== undefined) candidates.push({ kind: "runtime", path: pinFile });

    if (readme !== undefined) {
      for (const kind of readmeSignals(readme)) candidates.push({ kind, path: readme.path });
    }

    const seen = new Set<MetadataKind>();
    return candidates.flatMap(({ kind, path }) => {
      if (seen.has(kind)) return [];
      seen.add(kind);
      return [{ kind, path, label: LABELS[kind] }];
    });
  },
);

/** `true` when a signal of `kind` was discovered. */
export function hasMetadata(signals: readonly MetadataSignal[], kind: MetadataKind): boolean {
  return signals.some((signal) => signal.kind === kind);
}
