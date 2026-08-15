import { collectDocumentation, type DocumentationFile } from "../../discovery/documentation.js";
import { contentLength, findSections } from "../../discovery/markdown.js";
import type { RepositoryContext } from "../../core/repository-context.js";
import type { Detector, Evidence, Finding } from "../../core/types.js";
import { limitEvidence } from "../shared.js";

/**
 * `context.readme` — does the repository orient a reader on arrival?
 *
 * Why it matters: the README is the first file an agent reads and often the
 * only one it is given. A README that says what the project is, how to prepare
 * it, and how to use it removes a round of guessing before any change is made.
 *
 * Evidence: the root README, parsed for its length and its section structure.
 *
 * Partial credit:
 *
 *   README exists and describes the project      +2
 *   setup or installation section                +1
 *   usage or example section                     +1
 *   development, testing, or contributing        +1
 *   README exists but is minimal                  1  (instead of the above)
 *
 * False positives: a heading with nothing behind it earns nothing, so a table
 * of contents cannot be mistaken for content. Length alone never passes either —
 * a long README with no orientation sections stays a warning.
 */

const ID = "context.readme";
const MAX_SCORE = 5;

/**
 * Below roughly a paragraph, a README is a title and a line rather than an
 * introduction to the project.
 */
const MIN_README_CONTENT = 150;
/**
 * A section needs something behind its heading to count. The bar is low on
 * purpose: a setup section is often one command, and a command is the point.
 */
const MIN_SECTION_CONTENT = 10;

const SETUP_HEADING =
  /\b(setup|set up|install(ation|ing)?|getting started|quick ?start|requirements|prerequisites)\b/;
const USAGE_HEADING = /\b(usage|using|examples?|how to use|api|commands?|cli|options)\b/;
const DEVELOPMENT_HEADING =
  /\b(development|developing|contributing|contribution|tests?|testing|scripts)\b/;

function finding(overrides: Omit<Finding, "id" | "category" | "maxScore">): Finding {
  return { id: ID, category: "context", maxScore: MAX_SCORE, ...overrides };
}

/** `true` when a heading matches and carries real content beneath it. */
function hasSection(readme: DocumentationFile, pattern: RegExp): boolean {
  return findSections(readme.signals, pattern).some(
    (section) => contentLength(section.text) >= MIN_SECTION_CONTENT,
  );
}

export const readmeContextDetector: Detector = {
  id: ID,
  category: "context",

  async analyze(context: RepositoryContext): Promise<Finding> {
    const docs = await collectDocumentation(context);
    const readme = docs.find((doc) => doc.role === "readme");

    if (readme === undefined) {
      return finding({
        status: "fail",
        title: "No README",
        message: "No README was found, so nothing introduces the repository to a new reader.",
        score: 0,
        applicable: true,
        recommendation: {
          priority: "high",
          message: "Add a README describing what the project is, how to set it up, and how to use it.",
        },
      });
    }

    const evidence: Evidence[] = [{ kind: "file", path: readme.path, label: "README" }];

    if (contentLength(readme.signals.text) < MIN_README_CONTENT) {
      return finding({
        status: "warning",
        title: "README is minimal",
        message:
          "A README exists, but it is too short to explain what the project is or how to work with it.",
        score: 1,
        applicable: true,
        recommendation: {
          priority: "medium",
          message: "Expand the README with a project description, setup steps, and usage examples.",
        },
        evidence,
      });
    }

    const sections: { label: string; present: boolean }[] = [
      { label: "Setup section", present: hasSection(readme, SETUP_HEADING) },
      { label: "Usage section", present: hasSection(readme, USAGE_HEADING) },
      { label: "Development section", present: hasSection(readme, DEVELOPMENT_HEADING) },
    ];

    const found = sections.filter((section) => section.present);
    const score = 2 + found.length;

    for (const section of found) {
      evidence.push({ kind: "file", path: readme.path, label: section.label });
    }

    const missing = sections
      .filter((section) => !section.present)
      .map((section) => section.label.replace(" section", "").toLowerCase());

    if (found.length === 0) {
      return finding({
        status: "warning",
        title: "README does not orient a reader",
        message:
          "The README describes the project but has no setup, usage, or development section, so a reader has nowhere to go next.",
        score,
        applicable: true,
        recommendation: {
          priority: "medium",
          message: "Add setup, usage, and development sections to the README.",
        },
        evidence: limitEvidence(evidence),
      });
    }

    return finding({
      status: "pass",
      title: "README orients a reader",
      message:
        missing.length === 0
          ? "The README describes the project and covers setup, usage, and development."
          : `The README describes the project, but has no ${missing.join(" or ")} section.`,
      score,
      applicable: true,
      evidence: limitEvidence(evidence),
      ...(missing.length === 0
        ? {}
        : {
            recommendation: {
              priority: "low",
              message: `Add a ${missing.join(" and ")} section to the README.`,
            },
          }),
    });
  },
};
