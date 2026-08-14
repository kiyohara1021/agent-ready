import type { Detector } from "../core/types.js";
import { bootstrapPipelineDetector } from "./bootstrap/pipeline.js";

/**
 * Detector registry.
 *
 * Registration order is part of the deterministic output ordering, so append
 * new detectors rather than reordering existing ones. Adding a detector should
 * not require touching unrelated core logic.
 */
export const defaultDetectors: readonly Detector[] = [bootstrapPipelineDetector];

export { bootstrapPipelineDetector };
