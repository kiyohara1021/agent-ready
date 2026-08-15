import {
  discoverDependencySurfaces,
  lockableSurfaces,
  type DependencySurface,
} from "../../discovery/lockfiles.js";
import type { RepositoryContext } from "../../core/repository-context.js";
import type { Detector, Evidence, Finding } from "../../core/types.js";
import { limitEvidence } from "../shared.js";

/**
 * `safety.lockfile` — are dependency versions pinned?
 *
 * Why it matters: without a lockfile, the dependency tree an agent tested
 * against is not the one that CI or a colleague resolves. Failures that follow
 * look like the change and are not.
 *
 * Evidence: the lockfiles conventional for each detected ecosystem, looked for
 * beside the manifest that proved it. Lockfiles are never opened — presence is
 * the whole signal.
 *
 * Partial credit:
 *
 *   a lockfile exists where one is meaningful     +3
 *   every such ecosystem is locked                +1
 *   the lockfile matches the declared manager     +1
 *
 * Applicability: the check applies only where locking is meaningful — the
 * ecosystem has a conventional lockfile *and* the manifest declares
 * dependencies. A crate with no dependencies, or a Java project whose ecosystem
 * has no conventional lockfile, is excluded from the score rather than failed.
 *
 * Mismatch: a `packageManager` field naming pnpm alongside a `package-lock.json`
 * means the committed lock is not the one the project's own tooling produces.
 * Two competing lockfiles for one ecosystem are ambiguous in the same way. Both
 * withhold the third point rather than failing the check, because the
 * dependencies are still pinned.
 */

const ID = "safety.lockfile";
const MAX_SCORE = 5;

function finding(overrides: Omit<Finding, "id" | "category" | "maxScore">): Finding {
  return { id: ID, category: "safety", maxScore: MAX_SCORE, ...overrides };
}

/** Lockfiles that disagree with what the project says it uses. */
function mismatchOf(surface: DependencySurface): string | undefined {
  if (surface.lockfiles.length === 0) return undefined;

  if (surface.expected !== undefined && !surface.lockfiles.includes(surface.expected)) {
    return `${surface.manifest} declares a package manager whose lockfile (${surface.expected}) is not committed`;
  }
  if (surface.lockfiles.length > 1) {
    return `${surface.label} has competing lockfiles (${surface.lockfiles.join(", ")})`;
  }
  return undefined;
}

export const lockfileSafetyDetector: Detector = {
  id: ID,
  category: "safety",

  async analyze(context: RepositoryContext): Promise<Finding> {
    const surfaces = await discoverDependencySurfaces(context);
    const lockable = lockableSurfaces(surfaces);

    if (lockable.length === 0) {
      return finding({
        status: "info",
        title: "No dependency management to lock",
        message:
          "No detected ecosystem both declares dependencies and has a conventional lockfile, so there is nothing to pin.",
        score: 0,
        applicable: false,
      });
    }

    const locked = lockable.filter((surface) => surface.lockfiles.length > 0);
    const unlocked = lockable.filter((surface) => surface.lockfiles.length === 0);
    const mismatches = locked.map((surface) => mismatchOf(surface)).filter((entry) => entry !== undefined);

    const evidence: Evidence[] = locked.flatMap((surface) =>
      surface.lockfiles.map((path) => ({
        kind: "file" as const,
        path,
        label: `${surface.label} lockfile`,
      })),
    );

    if (locked.length === 0) {
      const ecosystems = unlocked.map((surface) => surface.label).join(", ");
      const expected = [...new Set(lockable.flatMap((surface) => surface.conventional[0] ?? []))];

      return finding({
        status: "fail",
        title: "No dependency lockfile",
        message: `${ecosystems} declares dependencies but commits no lockfile, so builds resolve different versions over time.`,
        score: 0,
        applicable: true,
        recommendation: {
          priority: "medium",
          message: `Commit a lockfile (${expected.join(" or ")}) so dependency versions are reproducible.`,
        },
      });
    }

    const score = 3 + (unlocked.length === 0 ? 1 : 0) + (mismatches.length === 0 ? 1 : 0);

    const gaps = [
      unlocked.length === 0 ? undefined : `${unlocked.map((surface) => surface.label).join(", ")} is not locked`,
      ...mismatches,
    ].filter((gap) => gap !== undefined);

    if (gaps.length === 0) {
      return finding({
        status: "pass",
        title: "Dependencies are locked",
        message: "Every ecosystem that declares dependencies commits a lockfile.",
        score,
        applicable: true,
        evidence: limitEvidence(evidence),
      });
    }

    return finding({
      status: "warning",
      title: "Dependency locking is incomplete",
      message: `Dependencies are partly pinned: ${gaps.join("; ")}.`,
      score,
      applicable: true,
      recommendation: {
        priority: unlocked.length === 0 ? "low" : "medium",
        message:
          unlocked.length === 0
            ? "Commit the lockfile the project's own package manager produces, and remove the others."
            : `Commit a lockfile for ${unlocked.map((surface) => surface.label).join(" and ")}.`,
      },
      evidence: limitEvidence(evidence),
    });
  },
};
