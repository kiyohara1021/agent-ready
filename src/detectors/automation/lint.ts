import {
  builtinLintChecks,
  discoverEntryPoints,
  entryPointsOfKind,
} from "../../discovery/entry-points.js";
import { detectEcosystems, hasSourceCode } from "../../discovery/ecosystems.js";
import { discoverQualityTooling } from "../../discovery/tooling.js";
import { discoverWorkflows, workflowSignals } from "../../discovery/workflows.js";
import type { RepositoryContext } from "../../core/repository-context.js";
import type { Detector, Evidence, Finding } from "../../core/types.js";
import { entryPointEvidence, limitEvidence } from "./shared.js";

/**
 * `automation.lint` — can a lint or format command be inferred?
 *
 * Why it matters: linting and formatting catch classes of change that tests do
 * not, and an agent should be able to run them without being told how.
 *
 * Evidence: lint scripts and task-runner targets, checked-in linter
 * configuration (ESLint, Ruff, Pint, golangci-lint, RuboCop, …), and lint steps
 * in CI workflows.
 *
 * Partial credit:
 *
 *   a lint entry point is discoverable        +3
 *   backed by checked-in tool configuration   +1
 *   CI runs the lint command                  +1
 *   ecosystem check available but unused      +1  (instead of the above)
 *
 * Ecosystem fairness: Go, Rust, and Dart ship a static check that works without
 * any configuration, so a repository in those ecosystems is warned that the
 * check is unwired rather than failed for having no linter at all.
 *
 * Applicability: a repository with no source code and no project manifest has
 * nothing to lint, so the check is excluded from the score.
 */

const ID = "automation.lint";
const MAX_SCORE = 5;

function finding(overrides: Omit<Finding, "id" | "category" | "maxScore">): Finding {
  return { id: ID, category: "automation", maxScore: MAX_SCORE, ...overrides };
}

export const lintAutomationDetector: Detector = {
  id: ID,
  category: "automation",

  async analyze(context: RepositoryContext): Promise<Finding> {
    const [entryPoints, tooling, workflows, ecosystems, sourceCode] = await Promise.all([
      discoverEntryPoints(context),
      discoverQualityTooling(context),
      discoverWorkflows(context),
      detectEcosystems(context),
      hasSourceCode(context),
    ]);

    if (ecosystems.length === 0 && !sourceCode) {
      return finding({
        status: "info",
        title: "Lint automation is not applicable",
        message: "No source code or project manifest was found, so there is nothing to lint.",
        score: 0,
        applicable: false,
      });
    }

    const lintEntryPoints = entryPointsOfKind(entryPoints, "lint");
    const configured = tooling.filter((tool) => tool.kinds.includes("lint"));
    const ciLint = workflowSignals(workflows, "lint");

    if (lintEntryPoints.length > 0) {
      const backed = configured.length > 0;
      const inCi = ciLint.length > 0;
      const score = 3 + (backed ? 1 : 0) + (inCi ? 1 : 0);

      const evidence: Evidence[] = lintEntryPoints.map((entry) => entryPointEvidence(entry));

      const gaps = [
        backed ? undefined : "no linter configuration is checked in",
        inCi ? undefined : "CI does not appear to run it",
      ].filter((gap) => gap !== undefined);

      return finding({
        status: "pass",
        title: "A lint command is discoverable",
        message:
          gaps.length === 0
            ? "A lint entry point is defined by the project, its configuration is checked in, and CI runs it."
            : `A lint entry point is defined by the project, but ${gaps.join(" and ")}.`,
        score,
        applicable: true,
        evidence: limitEvidence(evidence),
        ...(gaps.length === 0
          ? {}
          : {
              recommendation: {
                priority: "low",
                message: backed
                  ? "Run the lint command in CI so style and correctness rules are enforced."
                  : "Check the linter configuration into the repository so the command behaves the same everywhere.",
              },
            }),
      });
    }

    const builtin = builtinLintChecks(ecosystems);
    const check = builtin[0];
    if (check !== undefined) {
      return finding({
        status: "warning",
        title: "Lint automation is available but not configured",
        message: `The detected ecosystem provides \`${check.command}\`, but no script, configuration, or CI step runs it.`,
        score: 1,
        applicable: true,
        recommendation: {
          priority: "medium",
          message: `Wire \`${check.command}\` into a script or CI step so it runs consistently.`,
        },
        evidence: limitEvidence([
          { kind: "file", path: check.path, label: `Ecosystem check available: ${check.command}` },
        ]),
      });
    }

    return finding({
      status: "fail",
      title: "No lint automation",
      message: "No lint script, linter configuration, or CI lint step was found.",
      score: 0,
      applicable: true,
      recommendation: {
        priority: "medium",
        message: "Configure a linter or formatter for this ecosystem and expose it as one command.",
      },
    });
  },
};
