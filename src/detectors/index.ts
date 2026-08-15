import type { Detector } from "../core/types.js";
import { ciAutomationDetector } from "./automation/ci.js";
import { dependencyAutomationDetector } from "./automation/dependencies.js";
import { lintAutomationDetector } from "./automation/lint.js";
import { testAutomationDetector } from "./automation/tests.js";
import { typecheckAutomationDetector } from "./automation/typecheck.js";
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
  testAutomationDetector,
  lintAutomationDetector,
  typecheckAutomationDetector,
  ciAutomationDetector,
  dependencyAutomationDetector,
];

export {
  agentsMdDetector,
  setupInstructionsDetector,
  testInstructionsDetector,
  qualityInstructionsDetector,
  architectureInstructionsDetector,
  testAutomationDetector,
  lintAutomationDetector,
  typecheckAutomationDetector,
  ciAutomationDetector,
  dependencyAutomationDetector,
};
