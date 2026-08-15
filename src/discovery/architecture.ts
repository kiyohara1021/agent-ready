import type { RepositoryContext } from "../core/repository-context.js";
import type { DocumentationFile } from "./documentation.js";
import { hasHeading } from "./markdown.js";

/**
 * Recognition of architecture and design documentation.
 *
 * Two detectors read these documents for different reasons:
 * `instructions.architecture` asks whether the guidance is good enough to edit
 * against, and `context.architecture` asks whether it is discoverable as
 * repository context. They must agree on *what* the documents are, so
 * classification lives here rather than in either detector.
 */

/** Lines needed before a code block counts as a directory map. */
const MIN_TREE_LINES = 3;

export const ARCHITECTURE_DOCUMENT =
  /(^|\/)(architecture|design|system-design|system_design|code-map|codemap|module-map|overview)\.(md|mdx|rst)$/;

/** Anchored at the repository root so a vendored project's ADRs do not count. */
export const DECISION_DIRECTORY = /^(docs?\/)?(adr|adrs|decisions|rfcs)\//;

export const ARCHITECTURE_HEADING =
  /\b(architecture|system design|high-?level design|design overview|how it works|components?|modules?|data flow|layers?|code ?map)\b/;

export const STRUCTURE_HEADING =
  /\b((project|repository|directory|folder|code|codebase|package) (structure|layout|map|overview)|structure|layout)\b/;

export const DECISION_HEADING = /\b(architecture decision record|adrs?|decision records?|rfcs?)\b/;

const TREE_CHARACTER = /[├└│]/;
const DIRECTORY_LINE = /^[\w.@-]+\/$/;

/** `true` when the document's path names it an architecture or design document. */
export function isArchitectureDocument(doc: DocumentationFile): boolean {
  return ARCHITECTURE_DOCUMENT.test(doc.path.toLowerCase());
}

/** `true` when a code block in the document draws a directory tree. */
export function hasDirectoryMap(doc: DocumentationFile): boolean {
  const treeLines = doc.signals.code.filter(
    (line) => TREE_CHARACTER.test(line) || DIRECTORY_LINE.test(line),
  );
  return treeLines.length >= MIN_TREE_LINES;
}

/** `true` when the document carries a structure heading or a directory tree. */
export function describesStructure(doc: DocumentationFile): boolean {
  return hasDirectoryMap(doc) || hasHeading(doc.signals, STRUCTURE_HEADING);
}

/** The first file inside a decision-record directory, when one exists. */
export function findDecisionRecords(context: RepositoryContext): string | undefined {
  return context.files.all.find((file) => DECISION_DIRECTORY.test(file.path.toLowerCase()))?.path;
}
