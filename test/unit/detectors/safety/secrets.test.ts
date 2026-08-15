import { describe, expect, it } from "vitest";

import { analyzeRepository } from "../../../../src/core/analyze.js";
import { buildRepositoryContext } from "../../../../src/core/repository-context.js";
import { secretsSafetyDetector } from "../../../../src/detectors/safety/secrets.js";
import { renderJsonReport } from "../../../../src/reporters/json.js";
import { renderTextReport } from "../../../../src/reporters/text.js";
import { createTempRepo, fixture, SAMPLE_REPO } from "../../../helpers/temp-repo.js";

/**
 * The values below are the point of several of these tests: nothing the
 * detector produces may contain them, because the detector never reads a
 * candidate file at all.
 */
const SECRET_VALUE = "not-a-real-token-2f8a1c";
const ENV_FILE = `# local only\nDATABASE_URL=postgres://user:${SECRET_VALUE}@localhost/app\nAPI_TOKEN=${SECRET_VALUE}\n`;
const PRIVATE_KEY = `-----BEGIN OPENSSH PRIVATE KEY-----\n${SECRET_VALUE}\n-----END OPENSSH PRIVATE KEY-----\n`;

async function analyzeFixture(name: string) {
  return secretsSafetyDetector.analyze(await buildRepositoryContext(fixture(name)));
}

async function analyzeFiles(files: Record<string, string>) {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await secretsSafetyDetector.analyze(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

const NODE_PROJECT = {
  "package.json": '{ "name": "app" }\n',
  "src/index.js": "export const a = 1;\n",
};

const SAFE_IGNORE = ".env\n.env.*\n!.env.example\n*.pem\n*.key\n";

describe("safety.secrets", () => {
  it("passes exclusions backed by a committed template", async () => {
    const finding = await analyzeFixture("node-healthy");

    expect(finding.id).toBe("safety.secrets");
    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
    expect(finding.evidence?.map((entry) => entry.path)).toContain(".env.example");
  });

  it("treats an ignored .env as correct local configuration", async () => {
    const finding = await analyzeFiles({
      ...NODE_PROJECT,
      ".gitignore": SAFE_IGNORE,
      ".env": ENV_FILE,
      ".env.example": "DATABASE_URL=\nAPI_TOKEN=\n",
    });

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
  });

  it("fails when an environment file is not excluded", async () => {
    const finding = await analyzeFiles({ ...NODE_PROJECT, ".env": ENV_FILE });

    expect(finding.status).toBe("fail");
    expect(finding.score).toBe(0);
    expect(finding.recommendation?.priority).toBe("high");
    expect(finding.evidence).toStrictEqual([
      { kind: "file", path: ".env", label: "Environment file is not excluded" },
    ]);
  });

  it("reports only path and type metadata for an exposed secret", async () => {
    const finding = await analyzeFiles({
      ...NODE_PROJECT,
      ".env": ENV_FILE,
      "deploy/id_rsa": PRIVATE_KEY,
    });

    const serialized = JSON.stringify(finding);

    expect(serialized).toContain(".env");
    expect(serialized).toContain("deploy/id_rsa");
    // Nothing from inside either file may appear anywhere in the finding.
    expect(serialized).not.toContain(SECRET_VALUE);
    expect(serialized).not.toContain("API_TOKEN");
    expect(serialized).not.toContain("DATABASE_URL");
    expect(serialized).not.toContain("PRIVATE KEY");
  });

  it("keeps secret material out of both rendered reports", async () => {
    const { root, cleanup } = await createTempRepo({
      ...NODE_PROJECT,
      ".env": ENV_FILE,
      "deploy/id_rsa": PRIVATE_KEY,
      "certs/server.pem": PRIVATE_KEY,
    });
    try {
      const result = await analyzeRepository(root);
      const rendered = `${renderTextReport(result)}\n${renderJsonReport(result, {
        displayPath: ".",
      })}`;

      expect(rendered).toContain("safety.secrets");
      expect(rendered).not.toContain(SECRET_VALUE);
      expect(rendered).not.toContain("API_TOKEN");
      expect(rendered).not.toContain("BEGIN OPENSSH");
    } finally {
      await cleanup();
    }
  });

  it("warns rather than fails for key material in a test fixture", async () => {
    const finding = await analyzeFiles({
      ...NODE_PROJECT,
      ".gitignore": SAFE_IGNORE.replace("*.pem\n", ""),
      "tests/fixtures/signing.pem": PRIVATE_KEY,
    });

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(1);
    expect(finding.recommendation?.priority).toBe("medium");
  });

  it("warns when only environment files are excluded", async () => {
    const finding = await secretsSafetyDetector.analyze(
      await buildRepositoryContext(SAMPLE_REPO),
    );

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(2);
    expect(finding.message).toContain("private keys");
  });

  it("fails when no secret-bearing path is excluded at all", async () => {
    const finding = await analyzeFiles({ ...NODE_PROJECT, ".gitignore": "node_modules/\n" });

    expect(finding.status).toBe("fail");
    expect(finding.score).toBe(0);
    // Nothing is exposed yet, so this is a gap rather than an incident.
    expect(finding.recommendation?.priority).toBe("medium");
  });

  it("recommends a template when exclusions are complete without one", async () => {
    const finding = await analyzeFiles({ ...NODE_PROJECT, ".gitignore": SAFE_IGNORE });

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(4);
    expect(finding.recommendation?.message).toContain(".env.example");
  });
});
