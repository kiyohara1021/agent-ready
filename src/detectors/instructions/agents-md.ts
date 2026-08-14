import { matchCommands, type CommandKind } from "../../discovery/commands.js";
import { collectDocumentation } from "../../discovery/documentation.js";
import { contentLength, hasHeading } from "../../discovery/markdown.js";
import type { RepositoryContext } from "../../core/repository-context.js";
import type { Detector, Evidence, Finding } from "../../core/types.js";
import { limitEvidence } from "./shared.js";

/**
 * `instructions.agents-md` — is coding-agent-specific guidance discoverable?
 *
 * Why it matters: agent-specific instructions remove ambiguity about repository
 * conventions and about how a change should be validated.
 *
 * Evidence: root `AGENTS.md` plus any nested `AGENTS.md`.
 *
 * Partial credit follows docs/SCORING.md:
 *
 *   file exists                      +3
 *   development/setup guidance       +2
 *   test/validation guidance         +2
 *   project-specific constraints     +2
 *   scoped (nested) guidance         +1
 *
 * False positives: length is never treated as quality, and content credit is
 * withheld entirely from a stub file, so an empty or boilerplate `AGENTS.md`
 * cannot reach a passing score.
 */

const ID = "instructions.agents-md";
const MAX_SCORE = 10;

/**
 * A file with less non-whitespace content than this, and no concrete command,
 * is a stub — a title and a sentence — and earns existence credit only.
 */
const MIN_MEANINGFUL_CONTENT = 200;

/** Kinds whose presence proves the file carries concrete project instructions. */
const CONCRETE_KINDS: readonly CommandKind[] = ["setup", "dev", "test", "lint", "typecheck"];

/** A passing file exists and carries at least two kinds of real guidance. */
const PASS_THRESHOLD = 7;

const SETUP_HEADING =
  /\b(setup|set up|install|installation|develop(ment|ing)?|environment|getting started|build|bootstrap|workflow|commands?)\b/;
const TEST_HEADING = /\b(test|tests|testing|validation|validate|verify|verification|checks?|quality)\b/;
const CONSTRAINT_HEADING =
  /\b(constraint|constraints|rule|rules|convention|conventions|guideline|guidelines|boundar|policy|policies|standards?|do not|don't|scope|principles)\b/;
const CONSTRAINT_PHRASE =
  /\b(do not|don't|must not|should not|never |avoid |always |prefer |required to|prohibited)/;

function finding(overrides: Omit<Finding, "id" | "category" | "maxScore">): Finding {
  return { id: ID, category: "instructions", maxScore: MAX_SCORE, ...overrides };
}

export const agentsMdDetector: Detector = {
  id: ID,
  category: "instructions",

  async analyze(context: RepositoryContext): Promise<Finding> {
    const docs = await collectDocumentation(context);
    const root = docs.find((doc) => doc.role === "agents-root");
    const nested = docs.filter((doc) => doc.role === "agents-nested");

    const nestedEvidence: Evidence[] = nested.map((doc) => ({
      kind: "file",
      path: doc.path,
      label: "Scoped agent instructions",
    }));

    if (root === undefined) {
      if (nested.length === 0) {
        return finding({
          status: "fail",
          title: "No AGENTS.md",
          message:
            "No AGENTS.md was found. Coding agents have no repository-specific instructions to follow.",
          score: 0,
          applicable: true,
          recommendation: {
            priority: "high",
            message:
              "Add a root AGENTS.md describing setup, how to run tests, and project constraints.",
          },
        });
      }

      return finding({
        status: "warning",
        title: "AGENTS.md exists only in subdirectories",
        message: `Scoped instructions were found in ${String(nested.length)} subdirectory file(s), but the repository root has no AGENTS.md, so agents start without repository-wide context.`,
        score: 1,
        applicable: true,
        recommendation: {
          priority: "high",
          message: "Add a root AGENTS.md that covers repository-wide setup, validation, and constraints.",
        },
        evidence: limitEvidence(nestedEvidence),
      });
    }

    const evidence: Evidence[] = [
      { kind: "file", path: root.path, label: "Repository-level agent instructions" },
    ];

    let score = 3;
    // A short file that names real commands is concise, not boilerplate; a
    // short file that names none has nothing project-specific to offer.
    const meaningful =
      CONCRETE_KINDS.some((kind) => matchCommands(root.commands, kind).length > 0) ||
      contentLength(root.signals.text) >= MIN_MEANINGFUL_CONTENT;
    const missing: string[] = [];

    const hasSetupGuidance =
      meaningful &&
      (matchCommands(root.commands, "setup").length > 0 ||
        matchCommands(root.commands, "dev").length > 0 ||
        hasHeading(root.signals, SETUP_HEADING));
    if (hasSetupGuidance) score += 2;
    else missing.push("development/setup guidance");

    const hasTestGuidance =
      meaningful &&
      (matchCommands(root.commands, "test").length > 0 || hasHeading(root.signals, TEST_HEADING));
    if (hasTestGuidance) score += 2;
    else missing.push("test/validation guidance");

    const hasConstraints =
      meaningful &&
      (hasHeading(root.signals, CONSTRAINT_HEADING) || CONSTRAINT_PHRASE.test(root.signals.text));
    if (hasConstraints) score += 2;
    else missing.push("project-specific constraints");

    if (nested.length > 0) {
      score += 1;
      evidence.push(...nestedEvidence);
    }

    if (score >= PASS_THRESHOLD) {
      return finding({
        status: "pass",
        title: "AGENTS.md provides project-specific guidance",
        message: `${root.path} documents ${[
          hasSetupGuidance ? "setup" : undefined,
          hasTestGuidance ? "validation" : undefined,
          hasConstraints ? "constraints" : undefined,
        ]
          .filter((part) => part !== undefined)
          .join(", ")}.`,
        score,
        applicable: true,
        evidence: limitEvidence(evidence),
      });
    }

    return finding({
      status: "warning",
      title: meaningful ? "AGENTS.md is incomplete" : "AGENTS.md has little content",
      message: meaningful
        ? `${root.path} exists but does not cover ${missing.join(", ")}.`
        : `${root.path} is too short to give a coding agent useful guidance.`,
      score,
      applicable: true,
      recommendation: {
        priority: "medium",
        message: `Expand ${root.path} to cover ${missing.join(", ")}.`,
      },
      evidence: limitEvidence(evidence),
    });
  },
};
