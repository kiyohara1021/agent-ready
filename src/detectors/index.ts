import type { Detector } from "../core/types.js";
import { agentsMdDetector } from "./instructions/agents-md.js";
import { architectureInstructionsDetector } from "./instructions/architecture.js";
import { qualityInstructionsDetector } from "./instructions/quality.js";
import { setupInstructionsDetector } from "./instructions/setup.js";
import { testInstructionsDetector } from "./instructions/tests.js";

/**
 * Detector registry.
 *
 * Registration order is part of the deterministic output ordering, so append
 * new detectors rather than reordering existing ones. Adding a detector should
 * not require touching unrelated core logic.
 */
export const defaultDetectors: readonly Detector[] = [
  agentsMdDetector,
  setupInstructionsDetector,
  testInstructionsDetector,
  qualityInstructionsDetector,
  architectureInstructionsDetector,
];

export {
  agentsMdDetector,
  setupInstructionsDetector,
  testInstructionsDetector,
  qualityInstructionsDetector,
  architectureInstructionsDetector,
};
