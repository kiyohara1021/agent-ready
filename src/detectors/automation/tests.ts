import { discoverEntryPoints, entryPointsOfKind, findTestFiles } from "../../discovery/entry-points.js";
import { detectEcosystems, hasSourceCode } from "../../discovery/ecosystems.js";
import { discoverWorkflows, workflowSignals } from "../../discovery/workflows.js";
import type { RepositoryContext } from "../../core/repository-context.js";
import type { Detector, Evidence, Finding } from "../../core/types.js";
import { entryPointEvidence, limitEvidence } from "./shared.js";

/**
 * `automation.tests` — can a test command be inferred from the repository?
 *
 * Why it matters: an agent that cannot run the tests cannot check its own work.
 * Unlike `instructions.tests`, this asks only whether a command is discoverable
 * from project metadata, not whether documentation explains it.
 *
 * Evidence: manifest scripts and task-runner targets (`package.json`,
 * `composer.json`, `Makefile`, `justfile`), test runner configuration
 * (`phpunit.xml`, `pytest.ini`, `tox.ini`, `vitest.config.*`, …), ecosystem
 * conventions (`cargo test`, `go test ./...`, `mvn test`), and CI workflows.
 *
 * Partial credit:
 *
 *   a test entry point is discoverable       +3
 *   a test suite exists in the repository    +1
 *   CI runs the tests                        +1
 *   testing ecosystem but no clear command   +1  (instead of the above)
 *
 * False positives: an ecosystem's built-in runner counts only when the
 * repository actually contains tests, and `npm init`'s placeholder test script
 * is not treated as an entry point.
 *
 * Applicability: a repository with no source code and no project manifest
 * contains nothing testable, so the check is excluded from the score.
 */

const ID = "automation.tests";
const MAX_SCORE = 5;

function finding(overrides: Omit<Finding, "id" | "category" | "maxScore">): Finding {
  return { id: ID, category: "automation", maxScore: MAX_SCORE, ...overrides };
}

export const testAutomationDetector: Detector = {
  id: ID,
  category: "automation",

  async analyze(context: RepositoryContext): Promise<Finding> {
    const [entryPoints, testFiles, workflows, ecosystems, sourceCode] = await Promise.all([
      discoverEntryPoints(context),
      findTestFiles(context),
      discoverWorkflows(context),
      detectEcosystems(context),
      hasSourceCode(context),
    ]);

    if (ecosystems.length === 0 && !sourceCode) {
      return finding({
        status: "info",
        title: "Test automation is not applicable",
        message:
          "No source code or project manifest was found, so there is nothing testable to run.",
        score: 0,
        applicable: false,
      });
    }

    const testEntryPoints = entryPointsOfKind(entryPoints, "test");
    const ciTests = workflowSignals(workflows, "test");

    if (testEntryPoints.length > 0) {
      const suite = testFiles.length > 0;
      const inCi = ciTests.length > 0;
      const score = 3 + (suite ? 1 : 0) + (inCi ? 1 : 0);

      const evidence: Evidence[] = testEntryPoints.map((entry) => entryPointEvidence(entry));
      const firstTestFile = testFiles[0];
      if (firstTestFile) {
        evidence.push({ kind: "file", path: firstTestFile.path, label: "Test suite" });
      }

      const gaps = [
        suite ? undefined : "no test files were found",
        inCi ? undefined : "CI does not appear to run them",
      ].filter((gap) => gap !== undefined);

      return finding({
        status: "pass",
        title: "A test command is discoverable",
        message:
          gaps.length === 0
            ? "A test entry point is defined by the project, the repository contains tests, and CI runs them."
            : `A test entry point is defined by the project, but ${gaps.join(" and ")}.`,
        score,
        applicable: true,
        evidence: limitEvidence(evidence),
        ...(gaps.length === 0
          ? {}
          : {
              recommendation: {
                priority: "low",
                message: suite
                  ? "Run the test command in CI so regressions are caught automatically."
                  : "Add tests behind the existing test command.",
              },
            }),
      });
    }

    if (testFiles.length > 0 || ecosystems.length > 0) {
      const evidence: Evidence[] = [];
      const firstTestFile = testFiles[0];
      if (firstTestFile) {
        evidence.push({ kind: "file", path: firstTestFile.path, label: "Test suite" });
      }
      const ecosystem = ecosystems[0];
      if (ecosystem) {
        evidence.push({
          kind: "file",
          path: ecosystem.manifest,
          label: `${ecosystem.label} project without a test entry point`,
        });
      }

      return finding({
        status: "warning",
        title: "No clear test entry point",
        message:
          "The project could run tests, but no script, runner configuration, or CI step defines how.",
        score: 1,
        applicable: true,
        recommendation: {
          priority: "high",
          message: "Define a test script or test runner configuration so the suite has one entry point.",
        },
        evidence: limitEvidence(evidence),
      });
    }

    return finding({
      status: "fail",
      title: "No test automation",
      message: "No test command, test runner configuration, or test suite was found.",
      score: 0,
      applicable: true,
      recommendation: {
        priority: "high",
        message: "Add a test suite and a single command that runs it.",
      },
    });
  },
};
