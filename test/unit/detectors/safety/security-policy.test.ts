import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../../src/core/repository-context.js";
import { securityPolicyDetector } from "../../../../src/detectors/safety/security-policy.js";
import { createTempRepo, fixture } from "../../../helpers/temp-repo.js";

async function analyzeFiles(files: Record<string, string>) {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await securityPolicyDetector.analyze(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

const REPORTING = [
  "# Security policy",
  "",
  "## Reporting a vulnerability",
  "",
  "Please do not open a public issue. Report security problems privately by",
  "email to security@example.invalid, and we will acknowledge the report within",
  "two business days and keep you informed while a fix is prepared.",
].join("\n");

const SUPPORTED = [
  "",
  "## Supported versions",
  "",
  "The latest minor release receives security fixes. Older releases are",
  "end-of-life once a newer minor release ships.",
].join("\n");

describe("safety.security-policy", () => {
  it("passes a policy that covers reporting and supported versions", async () => {
    const finding = await securityPolicyDetector.analyze(
      await buildRepositoryContext(fixture("node-healthy")),
    );

    expect(finding.id).toBe("safety.security-policy");
    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
    expect(finding.evidence).toStrictEqual([
      { kind: "file", path: "SECURITY.md", label: "Security policy" },
    ]);
  });

  it("fails when no policy exists, at low priority", async () => {
    const finding = await analyzeFiles({ "README.md": "# app\n" });

    expect(finding.status).toBe("fail");
    expect(finding.score).toBe(0);
    // A missing policy is a small project's smallest problem.
    expect(finding.recommendation?.priority).toBe("low");
  });

  it("warns that a stub policy is not a policy", async () => {
    const finding = await analyzeFiles({ "SECURITY.md": "# Security\n\nTBD.\n" });

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(1);
  });

  it("withholds a point when supported versions are not stated", async () => {
    const finding = await analyzeFiles({ "SECURITY.md": REPORTING });

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(4);
    expect(finding.recommendation?.message).toContain("versions");
  });

  it("finds a policy in the .github directory", async () => {
    const finding = await analyzeFiles({ ".github/SECURITY.md": REPORTING + SUPPORTED });

    expect(finding.score).toBe(5);
    expect(finding.evidence?.[0]?.path).toBe(".github/SECURITY.md");
  });

  it("prefers the root policy when several exist", async () => {
    const finding = await analyzeFiles({
      "SECURITY.md": REPORTING + SUPPORTED,
      "docs/SECURITY.md": REPORTING,
    });

    expect(finding.evidence?.[0]?.path).toBe("SECURITY.md");
  });
});
