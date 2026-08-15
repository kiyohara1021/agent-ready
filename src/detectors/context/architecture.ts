import {
  ARCHITECTURE_HEADING,
  DECISION_HEADING,
  describesStructure,
  findDecisionRecords,
  isArchitectureDocument,
} from "../../discovery/architecture.js";
import {
  collectDocumentation,
  repositoryDocumentation,
  type DocumentationFile,
} from "../../discovery/documentation.js";
import { contentLength, findSections, hasHeading } from "../../discovery/markdown.js";
import type { RepositoryContext } from "../../core/repository-context.js";
import type { Detector, Evidence, Finding } from "../../core/types.js";
import { limitEvidence } from "../shared.js";

/**
 * `context.architecture` — is design context discoverable from the repository?
 *
 * Why it matters: an agent that is handed one file needs a path from it to the
 * shape of the system. Documentation that exists but is reachable only by
 * guessing a filename is documentation an agent will not find.
 *
 * Evidence: the same documents `instructions.architecture` reads, asked a
 * different question. That detector judges whether the guidance is good enough
 * to edit against; this one judges whether a reader arriving at the README can
 * reach it at all. The two share discovery (`discovery/architecture.ts`) but not
 * their scoring rationale, so the same file is never counted twice for the same
 * reason.
 *
 * Partial credit:
 *
 *   architecture or design documentation exists           +2
 *   it is reachable from the README                       +1
 *   a directory or module map exists                      +1
 *   decision records or a second design document exist    +1
 *
 * A document the README never references cannot pass, however good it is —
 * that is the whole question this detector asks, and `instructions.architecture`
 * already scores the guidance itself.
 *
 * False positives: a heading with nothing behind it is not documentation, and a
 * link is only credited when the README actually references the document path.
 */

const ID = "context.architecture";
const MAX_SCORE = 5;

/** A section carries architecture context only when something follows it. */
const MIN_SECTION_CONTENT = 200;

function finding(overrides: Omit<Finding, "id" | "category" | "maxScore">): Finding {
  return { id: ID, category: "context", maxScore: MAX_SCORE, ...overrides };
}

/** `true` when the README references the document's path. */
function referencedByReadme(readme: DocumentationFile | undefined, path: string): boolean {
  return readme !== undefined && readme.signals.text.includes(path.toLowerCase());
}

export const architectureContextDetector: Detector = {
  id: ID,
  category: "context",

  async analyze(context: RepositoryContext): Promise<Finding> {
    const docs = repositoryDocumentation(await collectDocumentation(context));
    const readme = docs.find((doc) => doc.role === "readme");

    const architectureDocs = docs.filter((doc) => isArchitectureDocument(doc));
    const readmeSection =
      readme === undefined
        ? undefined
        : findSections(readme.signals, ARCHITECTURE_HEADING).find(
            (section) => contentLength(section.text) >= MIN_SECTION_CONTENT,
          );

    const document = architectureDocs[0];
    const decisionFile = findDecisionRecords(context);
    const structureDoc = docs.find((doc) => describesStructure(doc));

    const evidence: Evidence[] = [];
    let score = 0;

    if (document !== undefined) {
      score += 2;
      evidence.push({ kind: "file", path: document.path, label: "Architecture document" });
    } else if (readmeSection !== undefined && readme !== undefined) {
      score += 2;
      evidence.push({ kind: "file", path: readme.path, label: "Architecture section" });
    }

    // Documentation inside the README is reachable by definition; a separate
    // document has to be referenced from it.
    const reachable =
      score > 0 &&
      (document === undefined || readmeSection !== undefined
        ? true
        : referencedByReadme(readme, document.path));

    if (reachable) {
      score += 1;
      if (readme !== undefined) {
        evidence.push({ kind: "file", path: readme.path, label: "Referenced from the README" });
      }
    }

    if (structureDoc !== undefined) {
      score += 1;
      evidence.push({ kind: "file", path: structureDoc.path, label: "Directory/module map" });
    }

    const hasDecisionRecords =
      decisionFile !== undefined ||
      architectureDocs.length >= 2 ||
      docs.some((doc) => hasHeading(doc.signals, DECISION_HEADING));

    if (hasDecisionRecords) {
      score += 1;
      if (decisionFile !== undefined) {
        evidence.push({ kind: "file", path: decisionFile, label: "Decision records" });
      }
    }

    // Reachability is what separates this check from `instructions.architecture`:
    // documentation nobody links to is documentation an agent will not open.
    if (reachable && score >= 3) {
      return finding({
        status: "pass",
        title: "Architecture context is discoverable",
        message: "Design documentation exists and a reader can reach it from the repository entry point.",
        score: Math.min(score, MAX_SCORE),
        applicable: true,
        evidence: limitEvidence(evidence),
        ...(score >= MAX_SCORE
          ? {}
          : {
              recommendation: {
                priority: "low",
                message: "Add a directory map or decision records so design context is easier to follow.",
              },
            }),
      });
    }

    if (score > 0) {
      return finding({
        status: "warning",
        title: "Architecture context is hard to find",
        message:
          "Some design context exists, but it is not linked from the README or does not describe the repository's structure.",
        score,
        applicable: true,
        recommendation: {
          priority: "medium",
          message: "Link the architecture document from the README and include a directory or module map.",
        },
        evidence: limitEvidence(evidence),
      });
    }

    return finding({
      status: "fail",
      title: "No discoverable architecture context",
      message: "No architecture or design documentation was found in a conventional location.",
      score: 0,
      applicable: true,
      recommendation: {
        priority: "medium",
        message: "Add ARCHITECTURE.md or docs/architecture.md and link it from the README.",
      },
    });
  },
};
