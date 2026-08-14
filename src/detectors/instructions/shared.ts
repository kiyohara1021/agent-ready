import type { DocumentedCommand } from "../../discovery/documentation.js";
import type { Evidence } from "../../core/types.js";

/**
 * Helpers shared by the Instructions detectors.
 *
 * Evidence is capped so that a documentation-heavy repository does not produce
 * an unreadable report, and labels always come from the detector or the command
 * catalog rather than from repository text.
 */

/** Keeps reports readable; the first entries are the most representative. */
export const MAX_EVIDENCE = 4;

export function limitEvidence(evidence: readonly Evidence[]): Evidence[] {
  return evidence.slice(0, MAX_EVIDENCE);
}

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
