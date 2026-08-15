import { discoverIgnoreRules, type IgnoreRules } from "../../discovery/ignores.js";
import {
  discoverSecretPaths,
  exposedSecretPaths,
  SECRET_PROBES,
  type SecretPath,
} from "../../discovery/secret-paths.js";
import type { RepositoryContext } from "../../core/repository-context.js";
import type { Detector, Evidence, Finding } from "../../core/types.js";
import { limitEvidence } from "../shared.js";

/**
 * `safety.secrets` — is secret-bearing configuration excluded or templated?
 *
 * Why it matters: an agent that finds a committed `.env` will read it, quote it,
 * and paste it into a diff. The cheap protection is a repository that never
 * tracks those files and documents the required settings with a template.
 *
 * Evidence: ignore rules matched against representative secret-bearing paths,
 * and the names of secret-bearing files present in the working tree.
 *
 * Partial credit:
 *
 *   ignore rules exclude environment files              +2
 *   ignore rules exclude private keys and credentials   +2
 *   a committed template documents the settings         +1
 *
 * An exposed file overrides the tiers: a secret-bearing path that is neither
 * ignored nor a template fails the check outright.
 *
 * ## Security
 *
 * This detector never opens a candidate file. Classification is by filename,
 * `excluded` comes from the ignore rules, and a finding carries only the path
 * and the category of file — enough to explain the risk and act on it. No secret
 * value, environment file body, or key material can appear in the report,
 * because none is ever read. Entropy scanning is deliberately out of scope
 * (docs/DETECTORS.md, `safety.secrets`).
 *
 * False positives: keys and credentials under a test, fixture, or example
 * directory are usually deliberate test material, so they are reported as a
 * warning rather than a failure. `.env.example` and its siblings are templates
 * and are never treated as exposure.
 */

const ID = "safety.secrets";
const MAX_SCORE = 5;

function finding(overrides: Omit<Finding, "id" | "category" | "maxScore">): Finding {
  return { id: ID, category: "safety", maxScore: MAX_SCORE, ...overrides };
}

function excludesAny(rules: IgnoreRules, probes: readonly string[]): boolean {
  return probes.some((probe) => rules.excludes(probe));
}

/** Evidence carries the path and the kind of file. Never its contents. */
function describe(entry: SecretPath): Evidence {
  return { kind: "file", path: entry.path, label: `${entry.label} is not excluded` };
}

export const secretsSafetyDetector: Detector = {
  id: ID,
  category: "safety",

  async analyze(context: RepositoryContext): Promise<Finding> {
    const [rules, secretPaths] = await Promise.all([
      discoverIgnoreRules(context),
      discoverSecretPaths(context),
    ]);

    const exposed = exposedSecretPaths(secretPaths);
    const templates = secretPaths.filter((entry) => entry.template);

    if (exposed.length > 0) {
      // Test material is usually deliberate; anything else is a real exposure.
      const serious = exposed.filter((entry) => !entry.fixture);
      const kinds = [...new Set(exposed.map((entry) => entry.label.toLowerCase()))].join(" and ");
      const paths = exposed.map((entry) => entry.path).join(", ");

      return serious.length > 0
        ? finding({
            status: "fail",
            title: "Secret-bearing files are not excluded",
            message: `The working tree contains ${kinds} files that no ignore rule excludes: ${paths}.`,
            score: 0,
            applicable: true,
            recommendation: {
              priority: "high",
              message: `Exclude ${paths} in .gitignore, rotate anything already committed, and commit a template instead.`,
            },
            evidence: limitEvidence(exposed.map(describe)),
          })
        : finding({
            status: "warning",
            title: "Key material sits outside the ignore rules",
            message: `Test or example locations hold ${kinds} files that no ignore rule excludes: ${paths}.`,
            score: 1,
            applicable: true,
            recommendation: {
              priority: "medium",
              message: `Confirm ${paths} holds only test material, and exclude the pattern otherwise.`,
            },
            evidence: limitEvidence(exposed.map(describe)),
          });
    }

    const coversEnvironment = excludesAny(rules, SECRET_PROBES.environment);
    const coversKeys =
      excludesAny(rules, SECRET_PROBES["private-key"]) || excludesAny(rules, SECRET_PROBES.credential);
    const template = templates[0];

    const score =
      (coversEnvironment ? 2 : 0) + (coversKeys ? 2 : 0) + (template === undefined ? 0 : 1);

    const evidence: Evidence[] = [];
    const gitIgnore = rules.files.find((file) => file.kind === "git");
    if (gitIgnore !== undefined && (coversEnvironment || coversKeys)) {
      evidence.push({ kind: "config", path: gitIgnore.path, label: "Excludes secret-bearing paths" });
    }
    if (template !== undefined) {
      evidence.push({ kind: "file", path: template.path, label: "Configuration template" });
    }

    const gaps = [
      coversEnvironment ? undefined : "environment files",
      coversKeys ? undefined : "private keys and credentials",
    ].filter((gap) => gap !== undefined);

    if (score === 0) {
      return finding({
        status: "fail",
        title: "No secret-bearing paths are excluded",
        message:
          "Nothing in the ignore rules excludes environment files, private keys, or credential files, so committing one is a single mistake away.",
        score: 0,
        applicable: true,
        // Nothing secret-bearing is present yet, so this is a gap to close
        // rather than an exposure to react to; `high` is reserved for the
        // branch above, where such a file actually exists.
        recommendation: {
          priority: "medium",
          message: "Exclude .env files, private keys, and credential files in .gitignore.",
        },
      });
    }

    if (gaps.length === 0) {
      return finding({
        status: "pass",
        title: "Secret-bearing paths are excluded",
        message:
          template === undefined
            ? "Ignore rules exclude environment files, private keys, and credential files."
            : "Ignore rules exclude secret-bearing paths, and a committed template documents the required settings.",
        score,
        applicable: true,
        evidence: limitEvidence(evidence),
        ...(template === undefined
          ? {
              recommendation: {
                priority: "low",
                message: "Commit a .env.example template so required settings are documented without values.",
              },
            }
          : {}),
      });
    }

    return finding({
      status: "warning",
      title: "Some secret-bearing paths are not excluded",
      message: `Ignore rules do not exclude ${gaps.join(" or ")}.`,
      score,
      applicable: true,
      recommendation: {
        priority: "medium",
        message: `Exclude ${gaps.join(", ")} in .gitignore.`,
      },
      evidence: limitEvidence(evidence),
    });
  },
};
