import {
  collectDocumentation,
  repositoryDocumentation,
  type DocumentationFile,
} from "../../discovery/documentation.js";
import { contentLength, findSections, hasHeading } from "../../discovery/markdown.js";
import type { RepositoryContext } from "../../core/repository-context.js";
import type { Detector, Evidence, Finding } from "../../core/types.js";
import { limitEvidence } from "./shared.js";

/**
 * `instructions.architecture` — is there a high-level map of the system?
 *
 * Why it matters: knowing module boundaries and responsibilities before editing
 * keeps a change in the right place.
 *
 * Evidence: dedicated architecture/design documents, architecture sections in
 * README or `AGENTS.md`, directory/module maps, and ADR indexes.
 *
 * Partial credit:
 *
 *   substantial architecture document or section   +3
 *   architecture heading with little behind it     +1  (instead of the above)
 *   directory/module map                           +1
 *   ADR index or multiple design documents         +1
 *
 * False positives: a heading alone never passes. A section must carry real
 * content, which is measured as non-whitespace length rather than assumed from
 * the heading's presence.
 */

const ID = "instructions.architecture";
const MAX_SCORE = 5;

/** A dedicated document needs enough content to be a map rather than a stub. */
const MIN_DOCUMENT_CONTENT = 300;
/** A section inside a larger document is expected to be shorter. */
const MIN_SECTION_CONTENT = 200;
/** Lines needed before a code block counts as a directory map. */
const MIN_TREE_LINES = 3;

const ARCHITECTURE_DOCUMENT =
  /(^|\/)(architecture|design|system-design|system_design|code-map|codemap|module-map|overview)\.(md|mdx|rst)$/;
/** Anchored at the repository root so a vendored project's ADRs do not count. */
const DECISION_DIRECTORY = /^(docs?\/)?(adr|adrs|decisions|rfcs)\//;

const ARCHITECTURE_HEADING =
  /\b(architecture|system design|high-?level design|design overview|how it works|components?|modules?|data flow|layers?|code ?map)\b/;
const STRUCTURE_HEADING =
  /\b((project|repository|directory|folder|code|codebase|package) (structure|layout|map|overview)|structure|layout)\b/;
const DECISION_HEADING = /\b(architecture decision record|adrs?|decision records?|rfcs?)\b/;

const TREE_CHARACTER = /[├└│]/;
const DIRECTORY_LINE = /^[\w.@-]+\/$/;

function isArchitectureDocument(doc: DocumentationFile): boolean {
  return ARCHITECTURE_DOCUMENT.test(doc.path.toLowerCase());
}

/** A code block that draws a directory tree, in either common style. */
function hasDirectoryMap(doc: DocumentationFile): boolean {
  const treeLines = doc.signals.code.filter(
    (line) => TREE_CHARACTER.test(line) || DIRECTORY_LINE.test(line),
  );
  return treeLines.length >= MIN_TREE_LINES;
}

function finding(overrides: Omit<Finding, "id" | "category" | "maxScore">): Finding {
  return { id: ID, category: "instructions", maxScore: MAX_SCORE, ...overrides };
}

export const architectureInstructionsDetector: Detector = {
  id: ID,
  category: "instructions",

  async analyze(context: RepositoryContext): Promise<Finding> {
    const docs = repositoryDocumentation(await collectDocumentation(context));

    const architectureDocs = docs.filter(isArchitectureDocument);
    const substantialDocs = architectureDocs.filter(
      (doc) => contentLength(doc.signals.text) >= MIN_DOCUMENT_CONTENT,
    );

    const substantialSections = docs.flatMap((doc) =>
      findSections(doc.signals, ARCHITECTURE_HEADING)
        .filter((section) => contentLength(section.text) >= MIN_SECTION_CONTENT)
        .map((section) => ({ doc, section })),
    );

    const thinHeading = docs.some((doc) => hasHeading(doc.signals, ARCHITECTURE_HEADING));

    const structureDoc = docs.find(
      (doc) => hasDirectoryMap(doc) || hasHeading(doc.signals, STRUCTURE_HEADING),
    );

    const decisionFile = context.files.all.find((file) => DECISION_DIRECTORY.test(file.path.toLowerCase()));
    const decisionHeading = docs.some((doc) => hasHeading(doc.signals, DECISION_HEADING));
    const hasDecisionRecords =
      decisionFile !== undefined || decisionHeading || architectureDocs.length >= 2;

    const evidence: Evidence[] = [];
    let score = 0;

    const strongDoc = substantialDocs[0];
    const strongSection = substantialSections[0];

    if (strongDoc !== undefined) {
      score += 3;
      evidence.push({ kind: "file", path: strongDoc.path, label: "Architecture document" });
    } else if (strongSection !== undefined) {
      score += 3;
      evidence.push({
        kind: "file",
        path: strongSection.doc.path,
        label: `Architecture section ("${strongSection.section.title}")`,
      });
    } else if (thinHeading || architectureDocs.length > 0) {
      score += 1;
      const thinDoc = architectureDocs[0] ?? docs.find((doc) => hasHeading(doc.signals, ARCHITECTURE_HEADING));
      if (thinDoc) {
        evidence.push({ kind: "file", path: thinDoc.path, label: "Architecture heading" });
      }
    }

    if (structureDoc !== undefined) {
      score += 1;
      evidence.push({ kind: "file", path: structureDoc.path, label: "Directory/module map" });
    }

    if (hasDecisionRecords) {
      score += 1;
      if (decisionFile !== undefined) {
        evidence.push({ kind: "file", path: decisionFile.path, label: "Architecture decision records" });
      }
    }

    if (score >= 3) {
      return finding({
        status: "pass",
        title: "Architecture guidance is documented",
        message: "Documentation gives a high-level map of the system before a reader edits it.",
        score: Math.min(score, MAX_SCORE),
        applicable: true,
        evidence: limitEvidence(evidence),
      });
    }

    if (score > 0) {
      return finding({
        status: "warning",
        title: "Architecture guidance is thin",
        message:
          "Some structural documentation exists, but there is no substantial high-level description of the system.",
        score,
        applicable: true,
        recommendation: {
          priority: "medium",
          message: "Expand the architecture overview to describe the main modules and their responsibilities.",
        },
        evidence: limitEvidence(evidence),
      });
    }

    return finding({
      status: "fail",
      title: "No architecture guidance",
      message: "No architecture overview, design document, or module map was found.",
      score: 0,
      applicable: true,
      recommendation: {
        priority: "medium",
        message: "Add a concise architecture overview describing the main modules and how they fit together.",
      },
    });
  },
};
