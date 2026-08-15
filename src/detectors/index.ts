import type { Detector } from "../core/types.js";
import { ciAutomationDetector } from "./automation/ci.js";
import { dependencyAutomationDetector } from "./automation/dependencies.js";
import { lintAutomationDetector } from "./automation/lint.js";
import { testAutomationDetector } from "./automation/tests.js";
import { typecheckAutomationDetector } from "./automation/typecheck.js";
import { architectureContextDetector } from "./context/architecture.js";
import { generatedContextDetector } from "./context/generated.js";
import { ignoreContextDetector } from "./context/ignore.js";
import { metadataContextDetector } from "./context/metadata.js";
import { readmeContextDetector } from "./context/readme.js";
import { agentsMdDetector } from "./instructions/agents-md.js";
import { architectureInstructionsDetector } from "./instructions/architecture.js";
import { qualityInstructionsDetector } from "./instructions/quality.js";
import { setupInstructionsDetector } from "./instructions/setup.js";
import { testInstructionsDetector } from "./instructions/tests.js";
import { gitignoreSafetyDetector } from "./safety/gitignore.js";
import { lockfileSafetyDetector } from "./safety/lockfile.js";
import { secretsSafetyDetector } from "./safety/secrets.js";
import { securityPolicyDetector } from "./safety/security-policy.js";

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
  readmeContextDetector,
  architectureContextDetector,
  metadataContextDetector,
  ignoreContextDetector,
  generatedContextDetector,
  gitignoreSafetyDetector,
  secretsSafetyDetector,
  securityPolicyDetector,
  lockfileSafetyDetector,
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
  readmeContextDetector,
  architectureContextDetector,
  metadataContextDetector,
  ignoreContextDetector,
  generatedContextDetector,
  gitignoreSafetyDetector,
  secretsSafetyDetector,
  securityPolicyDetector,
  lockfileSafetyDetector,
};
