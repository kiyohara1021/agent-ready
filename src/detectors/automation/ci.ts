import { detectEcosystems, hasSourceCode } from "../../discovery/ecosystems.js";
import {
  detectOtherCi,
  discoverWorkflows,
  workflowSignals,
  type WorkflowSignalKind,
} from "../../discovery/workflows.js";
import type { RepositoryContext } from "../../core/repository-context.js";
import type { Detector, Evidence, Finding } from "../../core/types.js";
import { limitEvidence, workflowEvidence } from "./shared.js";

/**
 * `automation.ci` — does continuous integration validate changes?
 *
 * Why it matters: CI is the shared definition of "this change is acceptable",
 * and an agent's work is judged by it.
 *
 * Evidence: `.github/workflows/*.yml`, read conservatively. `run:` steps are
 * classified with the shared command catalog; there is no shell interpreter and
 * no expression evaluation, so a workflow whose validation happens inside an
 * opaque script reads as uncertain rather than absent.
 *
 * Partial credit:
 *
 *   a CI workflow exists                            +2
 *   a test step runs                                +2
 *   a lint, type-check, or build step runs          +1
 *
 * A build is credited alongside static analysis rather than on its own: a
 * library with nothing to build must be able to reach full marks.
 *
 * Other CI systems: configuration for GitLab CI, CircleCI, Jenkins, and similar
 * is recognized but not parsed, so it earns presence credit and a warning
 * rather than a confident pass.
 *
 * Applicability: a repository with no source code and no project manifest has
 * nothing for CI to validate, so the check is excluded from the score.
 */

const ID = "automation.ci";
const MAX_SCORE = 5;
const PRESENCE_SCORE = 2;

/** Signals that share the third point: any of them shows CI checks the code. */
const QUALITY_SIGNALS: readonly WorkflowSignalKind[] = ["lint", "typecheck", "build"];

function finding(overrides: Omit<Finding, "id" | "category" | "maxScore">): Finding {
  return { id: ID, category: "automation", maxScore: MAX_SCORE, ...overrides };
}

export const ciAutomationDetector: Detector = {
  id: ID,
  category: "automation",

  async analyze(context: RepositoryContext): Promise<Finding> {
    const [workflows, otherCi, ecosystems, sourceCode] = await Promise.all([
      discoverWorkflows(context),
      detectOtherCi(context),
      detectEcosystems(context),
      hasSourceCode(context),
    ]);

    if (ecosystems.length === 0 && !sourceCode) {
      return finding({
        status: "info",
        title: "CI is not applicable",
        message:
          "No source code or project manifest was found, so there is nothing for CI to validate.",
        score: 0,
        applicable: false,
      });
    }

    if (workflows.length > 0) {
      const tests = workflowSignals(workflows, "test");
      const quality = QUALITY_SIGNALS.flatMap((kind) => workflowSignals(workflows, kind));

      const score = PRESENCE_SCORE + (tests.length > 0 ? 2 : 0) + (quality.length > 0 ? 1 : 0);

      if (score === PRESENCE_SCORE) {
        const workflow = workflows[0];
        return finding({
          status: "warning",
          title: "CI exists but its validation is unclear",
          message:
            "Workflow files were found, but no recognizable test, lint, or build command runs in them.",
          score,
          applicable: true,
          recommendation: {
            priority: "medium",
            message: "Run the test and lint commands directly in CI so validation is visible.",
          },
          ...(workflow
            ? { evidence: [{ kind: "workflow", path: workflow.path, label: "CI workflow" }] }
            : {}),
        });
      }

      const gaps = [
        tests.length > 0 ? undefined : "the tests",
        quality.length > 0 ? undefined : "lint, static analysis, or a build",
      ].filter((gap) => gap !== undefined);

      const evidence: Evidence[] = [
        ...tests.slice(0, 2).map((match) => workflowEvidence(match)),
        ...quality.slice(0, 2).map((match) => workflowEvidence(match)),
      ];

      return finding({
        status: "pass",
        title: "CI validates changes",
        message:
          gaps.length === 0
            ? "CI runs the tests and at least one static check or build."
            : `CI runs validation, but no step appears to run ${gaps.join(" or ")}.`,
        score,
        applicable: true,
        evidence: limitEvidence(evidence),
        ...(gaps.length === 0
          ? {}
          : {
              recommendation: {
                priority: "low",
                message: `Extend the CI workflow to also run ${gaps.join(" and ")}.`,
              },
            }),
      });
    }

    const other = otherCi[0];
    if (other !== undefined) {
      return finding({
        status: "warning",
        title: `CI is configured with ${other.label}`,
        message:
          "A CI configuration was found, but only GitHub Actions workflows are analyzed, so the validation it performs is unknown.",
        score: PRESENCE_SCORE,
        applicable: true,
        recommendation: {
          priority: "low",
          message: "Document which checks CI runs so contributors can reproduce them locally.",
        },
        evidence: limitEvidence(
          otherCi.map((config) => ({
            kind: "config" as const,
            path: config.path,
            label: `${config.label} configuration`,
          })),
        ),
      });
    }

    return finding({
      status: "fail",
      title: "No CI detected",
      message: "No CI workflow or configuration was found, so nothing validates a change automatically.",
      score: 0,
      applicable: true,
      recommendation: {
        priority: "medium",
        message: "Add a CI workflow that runs the test and lint commands on every change.",
      },
    });
  },
};
