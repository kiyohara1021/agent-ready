import {
  collectDocumentation,
  findDocumentedCommands,
  repositoryDocumentation,
} from "../../discovery/documentation.js";
import { detectEcosystems } from "../../discovery/ecosystems.js";
import { hasHeading } from "../../discovery/markdown.js";
import { discoverScripts, scriptsOfKind } from "../../discovery/scripts.js";
import type { RepositoryContext } from "../../core/repository-context.js";
import type { Detector, Evidence, Finding } from "../../core/types.js";
import { documentedCommandEvidence, limitEvidence } from "./shared.js";

/**
 * `instructions.setup` — can a reader prepare the project?
 *
 * Why it matters: an agent that cannot install dependencies or start the
 * project cannot validate its own changes.
 *
 * Evidence: documented commands in `AGENTS.md`, README, CONTRIBUTING, and
 * documentation directories, plus repository-level signals (manifests, setup
 * scripts, toolchain version files) that show setup is at least implied.
 *
 * Partial credit:
 *
 *   documented install/dependency command   +3
 *   documented runtime/toolchain version    +1
 *   documented local run/dev command        +1
 *   setup implied but not documented        +1  (instead of the above)
 *
 * Recognition is ecosystem-neutral: `uv sync`, `composer install`, and
 * `flutter pub get` count exactly as much as `npm ci`.
 */

const ID = "instructions.setup";
const MAX_SCORE = 5;

/** Files that pin a toolchain version, i.e. state a runtime requirement. */
const TOOLCHAIN_FILES: readonly string[] = [
  ".nvmrc",
  ".node-version",
  ".tool-versions",
  ".python-version",
  ".ruby-version",
  ".java-version",
  ".sdkmanrc",
  "rust-toolchain",
  "rust-toolchain.toml",
  "mise.toml",
  ".mise.toml",
  "flake.nix",
  ".devcontainer/devcontainer.json",
];

const REQUIREMENT_HEADING =
  /\b(requirements?|prerequisites?|dependencies|runtime|toolchain|environment|versions?|before you (start|begin))\b/;
const REQUIREMENT_TEXT =
  /\b(node(\.js)? ?(>=|v)? ?\d|python ?3(\.\d+)?|php ?[78]|ruby ?[23]|go ?1\.\d|rust ?1\.\d|\.nvmrc|\.tool-versions|jdk ?\d|java ?\d+|requires? [a-z.]+ ?(>=|v)? ?\d)/;

function finding(overrides: Omit<Finding, "id" | "category" | "maxScore">): Finding {
  return { id: ID, category: "instructions", maxScore: MAX_SCORE, ...overrides };
}

export const setupInstructionsDetector: Detector = {
  id: ID,
  category: "instructions",

  async analyze(context: RepositoryContext): Promise<Finding> {
    const [allDocs, scripts, ecosystems] = await Promise.all([
      collectDocumentation(context),
      discoverScripts(context),
      detectEcosystems(context),
    ]);
    const docs = repositoryDocumentation(allDocs);

    const install = findDocumentedCommands(docs, "setup");
    const run = findDocumentedCommands(docs, "dev");

    const toolchainFile = TOOLCHAIN_FILES.find((file) => context.files.has(file));
    const documentsRequirement =
      toolchainFile !== undefined ||
      docs.some(
        (doc) => hasHeading(doc.signals, REQUIREMENT_HEADING) || REQUIREMENT_TEXT.test(doc.signals.text),
      );

    if (install.length > 0) {
      let score = 3;
      const evidence: Evidence[] = documentedCommandEvidence(install);

      if (documentsRequirement) {
        score += 1;
        if (toolchainFile !== undefined) {
          evidence.push({ kind: "config", path: toolchainFile, label: "Pinned toolchain version" });
        }
      }
      if (run.length > 0) {
        score += 1;
        evidence.push(...documentedCommandEvidence(run));
      }

      const gaps = [
        documentsRequirement ? undefined : "a runtime/toolchain requirement",
        run.length > 0 ? undefined : "a command to run the project locally",
      ].filter((gap) => gap !== undefined);

      return finding({
        status: "pass",
        title: "Setup instructions are documented",
        message:
          gaps.length === 0
            ? "Documentation explains how to install dependencies, which runtime is required, and how to run the project."
            : `Documentation explains how to install dependencies, but does not state ${gaps.join(" or ")}.`,
        score,
        applicable: true,
        evidence: limitEvidence(evidence),
        ...(gaps.length === 0
          ? {}
          : {
              recommendation: {
                priority: "low",
                message: `Document ${gaps.join(" and ")}.`,
              },
            }),
      });
    }

    const setupScript = scriptsOfKind(scripts, "setup")[0];
    const implied = setupScript !== undefined || ecosystems.length > 0;

    if (implied) {
      const evidence: Evidence[] = setupScript
        ? [
            {
              kind: "script",
              path: setupScript.source,
              label: `Undocumented setup entry point (${setupScript.command})`,
            },
          ]
        : ecosystems.map((ecosystem) => ({
            kind: "config" as const,
            path: ecosystem.manifest,
            label: `${ecosystem.label} project detected`,
          }));

      return finding({
        status: "warning",
        title: "Setup is implied but not documented",
        message:
          "The repository has dependency manifests or setup scripts, but no documentation states how to prepare the project.",
        score: 1,
        applicable: true,
        recommendation: {
          priority: "high",
          message: "Document the exact commands that install dependencies and prepare a local environment.",
        },
        evidence: limitEvidence(evidence),
      });
    }

    return finding({
      status: "fail",
      title: "No setup instructions",
      message: "No documentation or project metadata explains how to prepare this repository for development.",
      score: 0,
      applicable: true,
      recommendation: {
        priority: "high",
        message: "Add setup instructions covering dependency installation and required runtime versions.",
      },
    });
  },
};
