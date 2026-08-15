import { discoverDependencyAutomation } from "../../discovery/dependency-automation.js";
import { detectEcosystems } from "../../discovery/ecosystems.js";
import { discoverWorkflows } from "../../discovery/workflows.js";
import type { RepositoryContext } from "../../core/repository-context.js";
import type { Detector, Evidence, Finding } from "../../core/types.js";
import { limitEvidence } from "./shared.js";

/**
 * `automation.dependencies` — is dependency maintenance automated?
 *
 * Why it matters: dependency drift turns into security work and broken builds,
 * and neither is something a coding agent can reasonably discover on its own.
 *
 * Evidence: `.github/dependabot.yml`, Renovate configuration in any of its
 * documented locations (including the `renovate` key in `package.json`), and a
 * self-hosted Renovate workflow.
 *
 * Partial credit:
 *
 *   dependency update automation is configured   +3
 *   it covers a package ecosystem used here      +1
 *   it covers CI workflow/action versions        +1
 *   configuration exists but declares no updates +1  (instead of the above)
 *
 * Dependabot declares each update target explicitly, so coverage is read from
 * its `package-ecosystem` entries. Renovate enables every manager it detects,
 * including GitHub Actions, so a Renovate configuration is credited with both
 * coverage points without parsing it further.
 *
 * Applicability: a repository with no dependency manifests and no workflows has
 * nothing to keep up to date, so the check is excluded from the score.
 */

const ID = "automation.dependencies";
const MAX_SCORE = 5;

function finding(overrides: Omit<Finding, "id" | "category" | "maxScore">): Finding {
  return { id: ID, category: "automation", maxScore: MAX_SCORE, ...overrides };
}

export const dependencyAutomationDetector: Detector = {
  id: ID,
  category: "automation",

  async analyze(context: RepositoryContext): Promise<Finding> {
    const [automation, ecosystems, workflows] = await Promise.all([
      discoverDependencyAutomation(context),
      detectEcosystems(context),
      discoverWorkflows(context),
    ]);

    if (ecosystems.length === 0 && workflows.length === 0) {
      return finding({
        status: "info",
        title: "Dependency automation is not applicable",
        message:
          "No dependency manifest and no CI workflow were found, so there is nothing to keep up to date.",
        score: 0,
        applicable: false,
      });
    }

    const configured = automation.filter((entry) => entry.configured);
    const evidence: Evidence[] = automation.map((entry) => ({
      kind: "config",
      path: entry.path,
      label: `${entry.tool} configuration`,
    }));

    if (configured.length > 0) {
      const coversPackages = configured.some((entry) => entry.coversPackages);
      const coversWorkflows = configured.some((entry) => entry.coversWorkflows);
      const score = 3 + (coversPackages ? 1 : 0) + (coversWorkflows ? 1 : 0);

      const gaps = [
        coversPackages ? undefined : "the package ecosystems this repository uses",
        coversWorkflows ? undefined : "CI action versions",
      ].filter((gap) => gap !== undefined);

      const tools = [...new Set(configured.map((entry) => entry.tool))].join(" and ");

      return finding({
        status: "pass",
        title: "Dependency updates are automated",
        message:
          gaps.length === 0
            ? `Dependency updates are automated by ${tools}, covering both package dependencies and CI action versions.`
            : `Dependency updates are automated by ${tools}, but the configuration does not cover ${gaps.join(" or ")}.`,
        score,
        applicable: true,
        evidence: limitEvidence(evidence),
        ...(gaps.length === 0
          ? {}
          : {
              recommendation: {
                priority: "low",
                message: `Extend the dependency automation to cover ${gaps.join(" and ")}.`,
              },
            }),
      });
    }

    if (automation.length > 0) {
      return finding({
        status: "warning",
        title: "Dependency automation is configured but declares no updates",
        message:
          "A dependency automation file exists, but it defines no update targets, so nothing is kept up to date.",
        score: 1,
        applicable: true,
        recommendation: {
          priority: "low",
          message: "Declare an update target for each package ecosystem in the repository.",
        },
        evidence: limitEvidence(evidence),
      });
    }

    return finding({
      status: "fail",
      title: "No dependency automation",
      message: "No Dependabot or Renovate configuration was found.",
      score: 0,
      applicable: true,
      recommendation: {
        priority: "low",
        message: "Enable Dependabot or Renovate so dependency updates arrive as reviewable changes.",
      },
    });
  },
};
