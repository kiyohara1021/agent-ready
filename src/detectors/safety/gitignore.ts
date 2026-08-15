import { detectEcosystems, hasSourceCode } from "../../discovery/ecosystems.js";
import { conventionalGeneratedPaths, discoverGeneratedContent } from "../../discovery/generated.js";
import {
  discoverIgnoreRules,
  ignoreFilesOfKind,
  type IgnoreRules,
} from "../../discovery/ignores.js";
import type { RepositoryContext } from "../../core/repository-context.js";
import type { Detector, Evidence, Finding } from "../../core/types.js";
import { limitEvidence } from "../shared.js";

/**
 * `safety.gitignore` — are local artifacts kept out of the repository?
 *
 * Why it matters: files that are produced locally — build output, logs,
 * coverage reports, local overrides — become noise, merge conflicts, and
 * occasionally leaks when they are committed. An agent proposing a change
 * cannot tell which of them were meant to be tracked.
 *
 * Evidence: `.gitignore` at the repository root and in subdirectories, matched
 * against representative local artifact paths for the detected ecosystems.
 *
 * Partial credit:
 *
 *   .gitignore exists and declares rules                +2
 *   it excludes the ecosystems' local build artifacts   +2
 *   it excludes logs, caches, or local overrides        +1
 *
 * `context.ignore` reads the same file to ask whether irrelevant content is easy
 * to avoid. This detector asks the narrower hygiene question: is what the
 * working tree produces kept out of commits?
 *
 * Warning rather than fail: a repository with no source, no manifest, and no
 * generated directories produces very little locally, so a missing `.gitignore`
 * is a gap rather than a defect.
 */

const ID = "safety.gitignore";
const MAX_SCORE = 5;

/** Paths that stand in for locally produced files in any ecosystem. */
const LOCAL_ARTIFACT_PROBES: readonly string[] = [
  "debug.log",
  "npm-debug.log",
  "coverage/index.html",
  "tmp/scratch",
  ".cache/index",
  "local.settings.json",
  ".DS_Store",
];

function finding(overrides: Omit<Finding, "id" | "category" | "maxScore">): Finding {
  return { id: ID, category: "safety", maxScore: MAX_SCORE, ...overrides };
}

function excludesAny(rules: IgnoreRules, probes: readonly string[], isDirectory = false): boolean {
  return probes.some((probe) => rules.excludes(probe, isDirectory));
}

export const gitignoreSafetyDetector: Detector = {
  id: ID,
  category: "safety",

  async analyze(context: RepositoryContext): Promise<Finding> {
    const [rules, ecosystems, generated, hasSource] = await Promise.all([
      discoverIgnoreRules(context),
      detectEcosystems(context),
      discoverGeneratedContent(context),
      hasSourceCode(context),
    ]);

    const gitFiles = ignoreFilesOfKind(rules, "git").filter((file) => file.patternCount > 0);

    if (gitFiles.length === 0) {
      // Local artifacts are likely wherever there is code to build or run.
      const producesArtifacts = hasSource || ecosystems.length > 0 || generated.length > 0;

      return producesArtifacts
        ? finding({
            status: "fail",
            title: "No .gitignore",
            message:
              "The repository builds or runs code but has no .gitignore, so locally produced files are tracked by default.",
            score: 0,
            applicable: true,
            recommendation: {
              priority: "high",
              message: "Add a .gitignore excluding dependencies, build output, logs, and local overrides.",
            },
          })
        : finding({
            status: "warning",
            title: "No .gitignore",
            message:
              "There is no .gitignore. Little is produced locally in this repository, so the risk is small.",
            score: 1,
            applicable: true,
            recommendation: {
              priority: "low",
              message: "Add a .gitignore excluding editor and operating-system files.",
            },
          });
    }

    const uncovered = ecosystems.filter((ecosystem) => {
      const probes = conventionalGeneratedPaths(ecosystem.id);
      return probes.length > 0 && !excludesAny(rules, probes, true);
    });

    const coversBuildArtifacts = uncovered.length === 0;
    const coversLocalFiles = excludesAny(rules, LOCAL_ARTIFACT_PROBES);

    const score = 2 + (coversBuildArtifacts ? 2 : 0) + (coversLocalFiles ? 1 : 0);

    const evidence: Evidence[] = gitFiles.map((file) => ({
      kind: "config" as const,
      path: file.path,
      label: file.label,
    }));

    const gaps = [
      coversBuildArtifacts
        ? undefined
        : `build artifacts for ${uncovered.map((entry) => entry.label).join(", ")}`,
      coversLocalFiles ? undefined : "logs, caches, and local overrides",
    ].filter((gap) => gap !== undefined);

    if (gaps.length === 0) {
      return finding({
        status: "pass",
        title: "Local artifacts are excluded",
        message: ".gitignore covers the build output and local files this repository produces.",
        score,
        applicable: true,
        evidence: limitEvidence(evidence),
      });
    }

    return finding({
      status: "warning",
      title: ".gitignore omits obvious local artifacts",
      message: `.gitignore exists but does not exclude ${gaps.join(" or ")}.`,
      score,
      applicable: true,
      recommendation: {
        priority: coversBuildArtifacts ? "low" : "medium",
        message: `Extend .gitignore to exclude ${gaps.join("; ")}.`,
      },
      evidence: limitEvidence(evidence),
    });
  },
};
