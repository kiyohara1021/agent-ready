import { createRequire } from "node:module";

/** JSON schema version of the machine-readable report. */
export const SCHEMA_VERSION = 1;

interface PackageManifest {
  version?: unknown;
}

function readToolVersion(): string {
  // `../../package.json` resolves to the package root from both `src/core` and
  // the built `dist/core`.
  const manifest = createRequire(import.meta.url)("../../package.json") as PackageManifest;
  return typeof manifest.version === "string" ? manifest.version : "0.0.0";
}

export const TOOL_VERSION = readToolVersion();
