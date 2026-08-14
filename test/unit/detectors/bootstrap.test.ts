import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../src/core/repository-context.js";
import { bootstrapPipelineDetector } from "../../../src/detectors/bootstrap/pipeline.js";
import { defaultDetectors } from "../../../src/detectors/index.js";
import { createTempRepo, SAMPLE_REPO } from "../../helpers/temp-repo.js";

describe("bootstrap.stub detector", () => {
  it("is registered in the default detector list", () => {
    expect(defaultDetectors).toContain(bootstrapPipelineDetector);
  });

  it("passes when discovery indexed files", async () => {
    const context = await buildRepositoryContext(SAMPLE_REPO);
    const finding = await bootstrapPipelineDetector.analyze(context);

    expect(finding.id).toBe("bootstrap.stub");
    expect(finding.category).toBe("context");
    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(1);
    expect(finding.maxScore).toBe(1);
    expect(finding.applicable).toBe(true);
    expect(finding.evidence?.[0]?.path).toBe(".github/workflows/ci.yml");
  });

  it("fails with a recommendation when nothing was indexed", async () => {
    const { root, cleanup } = await createTempRepo();
    try {
      const context = await buildRepositoryContext(root);
      const finding = await bootstrapPipelineDetector.analyze(context);

      expect(finding.status).toBe("fail");
      expect(finding.score).toBe(0);
      expect(finding.recommendation?.priority).toBe("high");
    } finally {
      await cleanup();
    }
  });

  it("returns the same finding for the same repository state", async () => {
    const context = await buildRepositoryContext(SAMPLE_REPO);

    expect(await bootstrapPipelineDetector.analyze(context)).toStrictEqual(
      await bootstrapPipelineDetector.analyze(context),
    );
  });
});
