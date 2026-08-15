import { detectEcosystems } from "../../discovery/ecosystems.js";
import { conventionalGeneratedPaths } from "../../discovery/generated.js";
import {
  discoverIgnoreRules,
  ignoreFilesOfKind,
  type IgnoreRules,
} from "../../discovery/ignores.js";
import type { RepositoryContext } from "../../core/repository-context.js";
import type { Detector, Evidence, Finding } from "../../core/types.js";
import { limitEvidence } from "../shared.js";

/**
 * `context.ignore` — is irrelevant repository content easy to avoid?
 *
 * Why it matters: ignore rules are the repository's own statement about which
 * files are not worth reading. Without them, an agent walking the tree cannot
 * tell a dependency copy or an editor scratch file from source.
 *
 * Evidence: `.gitignore` (root and nested), plus agent-specific ignore files
 * such as `.agentignore`, `.cursorignore`, and `.aiderignore`, and tool ignore
 * files such as `.dockerignore`.
 *
 * Partial credit:
 *
 *   ignore rules exist                                    +2
 *   they exclude the detected ecosystems' generated output +2
 *   they exclude editor/OS noise, or an agent ignore file
 *     narrows what an agent reads                          +1
 *
 * Not applicable: nothing. Every repository benefits from stating what is not
 * worth reading, and a repository with nothing to ignore can still say so.
 *
 * False positives: coverage is decided by matching the rules against
 * representative paths rather than by searching for literal strings, so an
 * anchored, a trailing-slash, and a wildcard spelling of the same rule all
 * count.
 */

const ID = "context.ignore";
const MAX_SCORE = 5;

/** Paths that stand in for editor and operating-system noise. */
const NOISE_PROBES: readonly string[] = [
  ".DS_Store",
  "Thumbs.db",
  ".idea/workspace.xml",
  ".vscode/settings.json",
  "notes.swp",
  "src/main.js~",
];

function finding(overrides: Omit<Finding, "id" | "category" | "maxScore">): Finding {
  return { id: ID, category: "context", maxScore: MAX_SCORE, ...overrides };
}

/**
 * `true` when any ignore file excludes at least one representative path.
 *
 * Every kind counts here: the question is whether irrelevant content is easy to
 * avoid, and an agent or tool ignore file answers it just as well as
 * `.gitignore`. The safety detectors ask the narrower git-exclusion question.
 */
function excludesAny(rules: IgnoreRules, probes: readonly string[], isDirectory = false): boolean {
  return probes.some((probe) => rules.excludedByAny(probe, isDirectory));
}

export const ignoreContextDetector: Detector = {
  id: ID,
  category: "context",

  async analyze(context: RepositoryContext): Promise<Finding> {
    const [rules, ecosystems] = await Promise.all([
      discoverIgnoreRules(context),
      detectEcosystems(context),
    ]);

    const gitFiles = ignoreFilesOfKind(rules, "git").filter((file) => file.patternCount > 0);
    const agentFiles = ignoreFilesOfKind(rules, "agent");
    const toolFiles = ignoreFilesOfKind(rules, "tool");

    if (gitFiles.length === 0 && agentFiles.length === 0) {
      return finding({
        status: "fail",
        title: "No ignore rules",
        message:
          "No ignore configuration was found, so nothing marks dependency, build, or editor files as unworthy of reading.",
        score: 0,
        applicable: true,
        recommendation: {
          priority: "medium",
          message: "Add a .gitignore covering dependency directories, build output, and editor files.",
        },
      });
    }

    const evidence: Evidence[] = [...gitFiles, ...agentFiles, ...toolFiles].map((file) => ({
      kind: "config" as const,
      path: file.path,
      label: file.label,
    }));

    // An ecosystem with no conventional generated directory is covered already.
    const uncovered = ecosystems.filter((ecosystem) => {
      const probes = conventionalGeneratedPaths(ecosystem.id);
      return probes.length > 0 && !excludesAny(rules, probes, true);
    });

    const coversGenerated = uncovered.length === 0;
    const coversNoise = excludesAny(rules, NOISE_PROBES);
    const narrowsAgentContext = agentFiles.length > 0;

    const score =
      (gitFiles.length > 0 ? 2 : 1) +
      (coversGenerated ? 2 : 0) +
      (coversNoise || narrowsAgentContext ? 1 : 0);

    const gaps = [
      gitFiles.length > 0 ? undefined : "committed content, because there is no .gitignore",
      coversGenerated ? undefined : `generated output for ${uncovered.map((entry) => entry.label).join(", ")}`,
      coversNoise || narrowsAgentContext ? undefined : "editor and operating-system files",
    ].filter((gap) => gap !== undefined);

    if (gaps.length === 0) {
      return finding({
        status: "pass",
        title: "Ignore rules keep irrelevant content out of view",
        message: "Ignore configuration excludes generated output and local editor files.",
        score: Math.min(score, MAX_SCORE),
        applicable: true,
        evidence: limitEvidence(evidence),
      });
    }

    return finding({
      status: "warning",
      title: "Ignore rules are incomplete",
      message: `Ignore configuration exists but does not exclude ${gaps.join(" or ")}.`,
      score,
      applicable: true,
      recommendation: {
        priority: coversGenerated && gitFiles.length > 0 ? "low" : "medium",
        message:
          gitFiles.length > 0
            ? `Extend the ignore rules to exclude ${gaps.join("; ")}.`
            : "Add a .gitignore alongside the agent ignore rules, covering generated output and editor files.",
      },
      evidence: limitEvidence(evidence),
    });
  },
};
