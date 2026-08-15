import type { DocumentedCommand } from "../../discovery/documentation.js";
import type { Evidence } from "../../core/types.js";

/**
 * Helpers shared by the Instructions detectors.
 *
 * Labels always come from the detector or the command catalog rather than from
 * repository text, so a report never echoes what a document happens to say.
 */

export { MAX_EVIDENCE, limitEvidence } from "../shared.js";

/**
 * Turns documented-command matches into evidence, one entry per document, so a
 * README listing five npm scripts does not crowd out other evidence.
 */
export function documentedCommandEvidence(matches: readonly DocumentedCommand[]): Evidence[] {
  const byDocument = new Map<string, string[]>();

  for (const match of matches) {
    const labels = byDocument.get(match.doc.path);
    if (labels === undefined) byDocument.set(match.doc.path, [match.pattern.label]);
    else if (!labels.includes(match.pattern.label)) labels.push(match.pattern.label);
  }

  return [...byDocument].map(([path, labels]) => ({
    kind: "file" as const,
    path,
    label: `Documents ${labels.join(", ")}`,
  }));
}
