export {
  scanRepository,
  DEFAULT_MAX_DEPTH,
  DEFAULT_MAX_FILES,
  SKIPPED_DIRECTORIES,
} from "./filesystem.js";
export type {
  RepositoryFile,
  ScanOptions,
  ScanResult,
} from "./filesystem.js";

export { perContext } from "./cache.js";

export {
  COMMAND_PATTERNS,
  QUALITY_KINDS,
  matchCommands,
  matchedKinds,
  toCommandSegments,
} from "./commands.js";
export type { CommandKind, CommandPattern } from "./commands.js";

export { collectDocumentation, findDocumentedCommands } from "./documentation.js";
export type { DocumentationFile, DocumentationRole, DocumentedCommand } from "./documentation.js";

export { detectEcosystems, hasSourceCode } from "./ecosystems.js";
export type { EcosystemEvidence, EcosystemId } from "./ecosystems.js";

export { contentLength, findSections, hasHeading, normalizeHeading, parseDocument } from "./markdown.js";
export type { DocumentSection, DocumentSignals } from "./markdown.js";

export { discoverScripts, scriptsOfKind } from "./scripts.js";
export type { DiscoveredScript, ScriptKind } from "./scripts.js";

export { discoverQualityTooling } from "./tooling.js";
export type { QualityTool } from "./tooling.js";
