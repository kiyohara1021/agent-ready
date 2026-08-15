import { detectEcosystems } from "../../discovery/ecosystems.js";
import {
  committedByConvention,
  conventionalGeneratedPaths,
  discoverGeneratedContent,
  type GeneratedDirectory,
} from "../../discovery/generated.js";
import { discoverIgnoreRules } from "../../discovery/ignores.js";
import type { RepositoryContext } from "../../core/repository-context.js";
import type { Detector, Evidence, Finding } from "../../core/types.js";
import { limitEvidence } from "../shared.js";

/**
 * `context.generated` — is generated and vendored content kept out of the way?
 *
 * Why it matters: a dependency copy or a build directory dwarfs the source it
 * was produced from. An agent reading a repository where they are not separated
 * spends its attention on files no one edits.
 *
 * Evidence: directories that indexing skipped, generated directories still
 * visible in the index, and the repository's ignore rules.
 *
 * Partial credit:
 *
 *   every generated directory present is excluded          +3
 *   ignore rules declare the ecosystem's generated output  +1
 *   no generated content is visible in the index           +1
 *
 * A directory existing is never a failure on its own — the question is whether
 * the repository separates it. `vendor/` is exempt in Go and Ruby, where a
 * checked-in copy is a supported workflow rather than an accident.
 *
 * False positives: only well-known directory names are recognized, and names
 * that are source directories in some ecosystems (`bin`, `lib`, `out`) are
 * deliberately absent from the catalog.
 */

const ID = "context.generated";
const MAX_SCORE = 5;

function finding(overrides: Omit<Finding, "id" | "category" | "maxScore">): Finding {
  return { id: ID, category: "context", maxScore: MAX_SCORE, ...overrides };
}

function describe(directory: GeneratedDirectory): Evidence {
  return { kind: "file", path: directory.path, label: directory.label };
}

export const generatedContextDetector: Detector = {
  id: ID,
  category: "context",

  async analyze(context: RepositoryContext): Promise<Finding> {
    const [directories, ecosystems, rules] = await Promise.all([
      discoverGeneratedContent(context),
      detectEcosystems(context),
      discoverIgnoreRules(context),
    ]);

    const detected = new Set(ecosystems.map((ecosystem) => ecosystem.id));
    // A vendored copy that the ecosystem expects to see is not stray output.
    const relevant = directories.filter(
      (directory) =>
        !committedByConvention(directory.name).some((ecosystem) => detected.has(ecosystem)),
    );

    const exposed = relevant.filter((directory) => !directory.excluded);
    const visible = exposed.filter((directory) => directory.indexedFiles > 0);

    const declares = ecosystems.every((ecosystem) => {
      const probes = conventionalGeneratedPaths(ecosystem.id);
      return probes.length === 0 || probes.some((probe) => rules.excludes(probe, true));
    });

    const score =
      (exposed.length === 0 ? 3 : 0) + (declares ? 1 : 0) + (visible.length === 0 ? 1 : 0);

    const evidence: Evidence[] = (exposed.length > 0 ? exposed : relevant).map(describe);

    if (exposed.length === 0) {
      // Nothing is exposed, so the first and third points are both earned; only
      // the declaration point can still be missing.
      return finding({
        status: "pass",
        title:
          relevant.length === 0
            ? "No generated content to separate"
            : "Generated content is separated",
        message:
          relevant.length === 0
            ? "No dependency, build, or cache directories were found in the working tree."
            : "Every generated or vendored directory present is excluded from the repository.",
        score,
        applicable: true,
        evidence: limitEvidence(evidence),
        ...(declares
          ? {}
          : {
              recommendation: {
                priority: "low",
                message:
                  "Declare the ecosystem's build and dependency directories in .gitignore, so they stay separated once they appear.",
              },
            }),
      });
    }

    const paths = exposed.map((directory) => directory.path).join(", ");

    if (score === 0) {
      return finding({
        status: "fail",
        title: "Generated content is not separated",
        message: `Generated or vendored directories are neither excluded nor declared: ${paths}.`,
        score: 0,
        applicable: true,
        recommendation: {
          priority: "medium",
          message: "Exclude dependency, build, and cache directories in .gitignore.",
        },
        evidence: limitEvidence(evidence),
      });
    }

    return finding({
      status: "warning",
      title: "Some generated content is not separated",
      message: `Generated or vendored directories are present but not excluded: ${paths}.`,
      score,
      applicable: true,
      recommendation: {
        priority: "medium",
        message: `Exclude ${paths} so generated content stays out of what an agent reads.`,
      },
      evidence: limitEvidence(evidence),
    });
  },
};
