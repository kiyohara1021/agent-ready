import { contentLength, parseDocument, type DocumentSignals } from "../../discovery/markdown.js";
import type { RepositoryContext } from "../../core/repository-context.js";
import type { Detector, Evidence, Finding } from "../../core/types.js";
import { limitEvidence } from "../shared.js";

/**
 * `safety.security-policy` — is there a way to report a vulnerability?
 *
 * Why it matters: a security policy tells a reporter where to go instead of
 * opening a public issue, and tells a contributor which versions still receive
 * fixes. Both are context an agent cannot infer from code.
 *
 * Evidence: `SECURITY.md` in any of its conventional locations, read for
 * reporting instructions and version support.
 *
 * Partial credit:
 *
 *   a security policy exists                        +3
 *   it explains how to report a vulnerability       +1
 *   it states supported versions or a response time +1
 *   a policy exists but is nearly empty              1  (instead of the above)
 *
 * Recommendation priority stays low: for a personal project this is a nicety,
 * and docs/SCORING.md asks that priority reflect context rather than weight.
 */

const ID = "safety.security-policy";
const MAX_SCORE = 5;

/** Policies are short documents; a bounded read is always enough. */
const POLICY_MAX_BYTES = 32 * 1024;

/** Below this, the file is a placeholder rather than a policy. */
const MIN_POLICY_CONTENT = 200;

/** Conventional locations, in the order GitHub itself resolves them. */
const POLICY_FILES: readonly string[] = [
  "SECURITY.md",
  ".github/SECURITY.md",
  "docs/SECURITY.md",
  "SECURITY.rst",
  "SECURITY.txt",
  "SECURITY",
];

const REPORTING =
  /\b(report(ing)?|disclos(e|ure)|contact|advisor(y|ies)|vulnerabilit(y|ies)@|security@|mailto:)\b/;
const SUPPORTED_VERSIONS =
  /\b(supported versions?|security (updates?|fixes|support)|end[- ]of[- ]life|response time|within \d+ (business )?(hours?|days?))\b/;

function finding(overrides: Omit<Finding, "id" | "category" | "maxScore">): Finding {
  return { id: ID, category: "safety", maxScore: MAX_SCORE, ...overrides };
}

function mentions(signals: DocumentSignals, pattern: RegExp): boolean {
  return pattern.test(signals.text) || signals.headings.some((heading) => pattern.test(heading));
}

export const securityPolicyDetector: Detector = {
  id: ID,
  category: "safety",

  async analyze(context: RepositoryContext): Promise<Finding> {
    const path = POLICY_FILES.find((candidate) => context.files.has(candidate));

    if (path === undefined) {
      return finding({
        status: "fail",
        title: "No security policy",
        message: "No SECURITY.md was found, so there is no stated way to report a vulnerability.",
        score: 0,
        applicable: true,
        recommendation: {
          priority: "low",
          message: "Add SECURITY.md explaining how to report a vulnerability privately.",
        },
      });
    }

    const evidence: Evidence[] = [{ kind: "file", path, label: "Security policy" }];
    const raw = await context.readTextFile(path, POLICY_MAX_BYTES);
    const signals = parseDocument(raw ?? "");

    if (contentLength(signals.text) < MIN_POLICY_CONTENT) {
      return finding({
        status: "warning",
        title: "Security policy is a stub",
        message: "A security policy file exists, but it is too short to tell a reporter what to do.",
        score: 1,
        applicable: true,
        recommendation: {
          priority: "low",
          message: "Describe how to report a vulnerability and which versions receive fixes.",
        },
        evidence,
      });
    }

    const explainsReporting = mentions(signals, REPORTING);
    const statesSupport = mentions(signals, SUPPORTED_VERSIONS);
    const score = 3 + (explainsReporting ? 1 : 0) + (statesSupport ? 1 : 0);

    const gaps = [
      explainsReporting ? undefined : "how to report a vulnerability",
      statesSupport ? undefined : "which versions receive security fixes",
    ].filter((gap) => gap !== undefined);

    return finding({
      status: "pass",
      title: "A security policy exists",
      message:
        gaps.length === 0
          ? "The security policy explains how to report a vulnerability and which versions are supported."
          : `The security policy does not state ${gaps.join(" or ")}.`,
      score,
      applicable: true,
      evidence: limitEvidence(evidence),
      ...(gaps.length === 0
        ? {}
        : {
            recommendation: {
              priority: "low",
              message: `Extend the security policy to state ${gaps.join(" and ")}.`,
            },
          }),
    });
  },
};
