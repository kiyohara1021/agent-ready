import type { Detector, Finding } from "../../core/types.js";
import type { RepositoryContext } from "../../core/repository-context.js";

/**
 * Placeholder detector that exercises the pipeline end to end.
 *
 * It asserts only that discovery produced a usable file index, which is enough
 * to prove `discovery -> detectors -> findings -> scoring -> reporters` works.
 * It is NOT a readiness heuristic and carries no meaning for users; the real
 * detectors specified in docs/DETECTORS.md replace it in later changes, at
 * which point this detector and its `bootstrap.*` id are removed.
 */
export const bootstrapPipelineDetector: Detector = {
  id: "bootstrap.stub",
  category: "context",

  analyze(context: RepositoryContext): Promise<Finding> {
    const fileCount = context.files.all.length;
    const sample = context.files.all[0];

    if (fileCount === 0) {
      return Promise.resolve({
        id: "bootstrap.stub",
        category: "context",
        status: "fail",
        title: "No analyzable files found",
        message:
          "Repository discovery indexed no files. Placeholder check; real readiness detectors arrive in later changes.",
        score: 0,
        maxScore: 1,
        applicable: true,
        recommendation: {
          priority: "high",
          message: "Add repository content that a coding agent can read.",
        },
      });
    }

    return Promise.resolve({
      id: "bootstrap.stub",
      category: "context",
      status: "pass",
      title: `Repository indexed (${String(fileCount)} files)`,
      message:
        "Repository discovery produced a file index. Placeholder check; real readiness detectors arrive in later changes.",
      score: 1,
      maxScore: 1,
      applicable: true,
      evidence: sample ? [{ kind: "file", path: sample.path, label: "Indexed file" }] : [],
    });
  },
};
