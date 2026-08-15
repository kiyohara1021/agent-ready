import type { Evidence } from "../core/types.js";

/**
 * Helpers shared by all detector families.
 *
 * Evidence is capped so that a large repository does not produce an unreadable
 * report, and labels always come from the detector or from discovery rather
 * than from repository text.
 */

/** Keeps reports readable; the first entries are the most representative. */
export const MAX_EVIDENCE = 4;

export function limitEvidence(evidence: readonly Evidence[]): Evidence[] {
  return evidence.slice(0, MAX_EVIDENCE);
}
