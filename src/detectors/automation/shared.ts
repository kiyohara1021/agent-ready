import type { EntryPoint, EntryPointSource } from "../../discovery/entry-points.js";
import type { WorkflowSignalMatch } from "../../discovery/workflows.js";
import type { Evidence } from "../../core/types.js";

export { MAX_EVIDENCE, limitEvidence } from "../shared.js";

/**
 * Helpers shared by the Automation detectors.
 *
 * Evidence labels are built from fixed prefixes plus discovery labels, so the
 * same repository always produces the same evidence text and no repository line
 * is ever echoed back.
 */

const SOURCE_PREFIX: Readonly<Record<EntryPointSource, string>> = {
  script: "Defined command",
  config: "Configured tool",
  manifest: "Conventional command",
  workflow: "CI step",
};

const SOURCE_EVIDENCE_KIND: Readonly<Record<EntryPointSource, Evidence["kind"]>> = {
  script: "script",
  config: "config",
  manifest: "file",
  workflow: "workflow",
};

export function entryPointEvidence(entry: EntryPoint): Evidence {
  return {
    kind: SOURCE_EVIDENCE_KIND[entry.source],
    path: entry.path,
    label: `${SOURCE_PREFIX[entry.source]}: ${entry.label}`,
  };
}

export function workflowEvidence(match: WorkflowSignalMatch): Evidence {
  return {
    kind: "workflow",
    path: match.workflow.path,
    label: `CI runs ${match.signal.label}`,
  };
}
