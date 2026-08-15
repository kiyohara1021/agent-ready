export { analyzeContext, analyzeRepository } from "./core/analyze.js";
export { buildRepositoryContext } from "./core/repository-context.js";
export { collectRecommendations } from "./core/recommendations.js";
export { scoreFindings } from "./core/score.js";
export { SCHEMA_VERSION, TOOL_VERSION } from "./core/version.js";
export * from "./core/errors.js";
export {
  defaultDetectors,
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
} from "./detectors/index.js";
export { renderJsonReport } from "./reporters/json.js";
export { renderTextReport } from "./reporters/text.js";
export { scanRepository } from "./discovery/filesystem.js";

export type {
  AnalysisResult,
  CategoryId,
  CategoryScore,
  Detector,
  Evidence,
  Finding,
  FindingStatus,
  Recommendation,
  RecommendationEntry,
  RecommendationPriority,
} from "./core/types.js";
export type {
  RepositoryContext,
  RepositoryFileIndex,
  RepositoryMetadata,
} from "./core/repository-context.js";
export type { RepositoryFile } from "./discovery/filesystem.js";
