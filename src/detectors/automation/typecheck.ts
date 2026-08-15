import { discoverEntryPoints, entryPointsOfKind } from "../../discovery/entry-points.js";
import { detectEcosystems, usesTypeScript, type EcosystemId } from "../../discovery/ecosystems.js";
import { discoverQualityTooling } from "../../discovery/tooling.js";
import { discoverWorkflows, workflowSignals } from "../../discovery/workflows.js";
import type { RepositoryContext } from "../../core/repository-context.js";
import type { Detector, Evidence, Finding } from "../../core/types.js";
import { entryPointEvidence, limitEvidence } from "./shared.js";

/**
 * `automation.typecheck` — can a type-check or static-analysis command be
 * inferred?
 *
 * Why it matters: static analysis rejects whole classes of broken change before
 * a test suite ever runs.
 *
 * Evidence: type-check scripts, checked-in analyzer configuration (TypeScript,
 * PHPStan, Psalm, mypy, Pyright, the Dart analyzer, …), and CI steps.
 *
 * Partial credit:
 *
 *   a type-check entry point is discoverable  +3
 *   backed by checked-in configuration        +1
 *   CI runs the type check                    +1
 *
 * Applicability: a separate type-check command is only expected where the
 * ecosystem conventionally has one — TypeScript, PHP, and Python. A Go, Rust,
 * Ruby, or plain JavaScript repository is not penalized for lacking a step its
 * ecosystem does not have, and a combined analyzer such as `dart analyze` or
 * `go vet` counts for both linting and type analysis when it is discoverable.
 */

const ID = "automation.typecheck";
const MAX_SCORE = 5;

/** Ecosystems with a conventional, separate static type-check step. */
const TYPECHECK_ECOSYSTEMS: readonly EcosystemId[] = ["php", "python"];

function finding(overrides: Omit<Finding, "id" | "category" | "maxScore">): Finding {
  return { id: ID, category: "automation", maxScore: MAX_SCORE, ...overrides };
}

export const typecheckAutomationDetector: Detector = {
  id: ID,
  category: "automation",

  async analyze(context: RepositoryContext): Promise<Finding> {
    const [entryPoints, tooling, workflows, ecosystems, typescript] = await Promise.all([
      discoverEntryPoints(context),
      discoverQualityTooling(context),
      discoverWorkflows(context),
      detectEcosystems(context),
      usesTypeScript(context),
    ]);

    const typecheckEntryPoints = entryPointsOfKind(entryPoints, "typecheck");

    if (typecheckEntryPoints.length > 0) {
      const backed = tooling.some((tool) => tool.kinds.includes("typecheck"));
      const inCi = workflowSignals(workflows, "typecheck").length > 0;
      const score = 3 + (backed ? 1 : 0) + (inCi ? 1 : 0);

      const evidence: Evidence[] = typecheckEntryPoints.map((entry) => entryPointEvidence(entry));

      const gaps = [
        backed ? undefined : "no analyzer configuration is checked in",
        inCi ? undefined : "CI does not appear to run it",
      ].filter((gap) => gap !== undefined);

      return finding({
        status: "pass",
        title: "A type-check command is discoverable",
        message:
          gaps.length === 0
            ? "A static analysis entry point is defined by the project, its configuration is checked in, and CI runs it."
            : `A static analysis entry point is defined by the project, but ${gaps.join(" and ")}.`,
        score,
        applicable: true,
        evidence: limitEvidence(evidence),
        ...(gaps.length === 0
          ? {}
          : {
              recommendation: {
                priority: "low",
                message: backed
                  ? "Run the type check in CI so type regressions are caught automatically."
                  : "Check the analyzer configuration into the repository so the command behaves the same everywhere.",
              },
            }),
      });
    }

    const expected =
      ecosystems.some((ecosystem) => TYPECHECK_ECOSYSTEMS.includes(ecosystem.id)) ||
      (ecosystems.some((ecosystem) => ecosystem.id === "node") && typescript);

    if (!expected) {
      return finding({
        status: "info",
        title: "A separate type-check step is not conventional here",
        message:
          "The detected ecosystems have no conventional type-check command beyond compiling, so the check is excluded from the score.",
        score: 0,
        applicable: false,
      });
    }

    return finding({
      status: "fail",
      title: "No type-check automation",
      message:
        "The ecosystem supports static type analysis, but no type-check command or analyzer configuration was found.",
      score: 0,
      applicable: true,
      recommendation: {
        priority: "medium",
        message: "Add a static analyzer for this ecosystem and expose it as one command.",
      },
    });
  },
};
