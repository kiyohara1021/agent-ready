import {
  discoverProjectMetadata,
  hasMetadata,
  type MetadataKind,
} from "../../discovery/project-metadata.js";
import type { RepositoryContext } from "../../core/repository-context.js";
import type { Detector, Evidence, Finding } from "../../core/types.js";
import { limitEvidence } from "../shared.js";

/**
 * `context.metadata` — is the project's identity clear?
 *
 * Why it matters: name, purpose, licence, home, and runtime are the facts an
 * agent needs before it can judge whether a change is appropriate — whether the
 * code may be redistributed, which language version it must keep working on,
 * and where the canonical copy lives.
 *
 * Evidence: ecosystem manifests, licence files, toolchain pin files, and the
 * README. Each signal is worth one point:
 *
 *   project name                       +1
 *   description of what it is          +1
 *   licence                            +1
 *   repository or homepage URL         +1
 *   runtime/toolchain constraint       +1
 *
 * Compatibility: every signal has a source in each supported ecosystem, and the
 * README can supply name and description on its own, so a missing npm
 * `description` never penalizes a non-Node project.
 *
 * False positives: a field that exists but is empty is not evidence, and a
 * description short enough to be the project name again does not count as one.
 */

const ID = "context.metadata";
const MAX_SCORE = 5;

/** Scored kinds, in the order missing ones are reported. */
const KINDS: readonly { kind: MetadataKind; label: string }[] = [
  { kind: "name", label: "project name" },
  { kind: "description", label: "description" },
  { kind: "license", label: "license" },
  { kind: "repository", label: "repository URL" },
  { kind: "runtime", label: "runtime or toolchain constraint" },
];

function finding(overrides: Omit<Finding, "id" | "category" | "maxScore">): Finding {
  return { id: ID, category: "context", maxScore: MAX_SCORE, ...overrides };
}

export const metadataContextDetector: Detector = {
  id: ID,
  category: "context",

  async analyze(context: RepositoryContext): Promise<Finding> {
    const signals = await discoverProjectMetadata(context);

    const missing = KINDS.filter((entry) => !hasMetadata(signals, entry.kind)).map(
      (entry) => entry.label,
    );
    const score = KINDS.length - missing.length;

    const evidence: Evidence[] = signals.map((signal) => ({
      kind: "file",
      path: signal.path,
      label: signal.label,
    }));

    if (score === 0) {
      return finding({
        status: "fail",
        title: "No project metadata",
        message:
          "Nothing in the repository states what the project is, who may use it, or what it runs on.",
        score: 0,
        applicable: true,
        recommendation: {
          priority: "medium",
          message: "Describe the project in a manifest or README and add a license.",
        },
      });
    }

    const describesItself = hasMetadata(signals, "description");

    if (score >= 3 && describesItself) {
      return finding({
        status: "pass",
        title: "Project identity is clear",
        message:
          missing.length === 0
            ? "The project states its name, purpose, license, home, and supported runtime."
            : `The project describes itself, but declares no ${missing.join(" or ")}.`,
        score,
        applicable: true,
        evidence: limitEvidence(evidence),
        ...(missing.length === 0
          ? {}
          : {
              recommendation: {
                priority: "low",
                message: `Declare the missing metadata in the project manifest: ${missing.join(", ")}.`,
              },
            }),
      });
    }

    return finding({
      status: "warning",
      title: "Project metadata is incomplete",
      message: `The repository declares no ${missing.join(" or ")}.`,
      score,
      applicable: true,
      recommendation: {
        priority: describesItself ? "low" : "medium",
        message: `Declare the missing metadata so the project's identity is unambiguous: ${missing.join(", ")}.`,
      },
      evidence: limitEvidence(evidence),
    });
  },
};
