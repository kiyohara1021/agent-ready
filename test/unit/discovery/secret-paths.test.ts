import { symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../src/core/repository-context.js";
import {
  discoverSecretPaths,
  exposedSecretPaths,
  isTemplatePath,
  type SecretPath,
} from "../../../src/discovery/secret-paths.js";
import { createTempRepo } from "../../helpers/temp-repo.js";

/**
 * These tests double as the security contract for the module: classification is
 * by filename, and the file contents below must never appear in a result.
 */

const SECRET_VALUE = "not-a-real-token-2f8a1c";

async function secretsIn(files: Record<string, string>): Promise<SecretPath[]> {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await discoverSecretPaths(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

describe("discoverSecretPaths", () => {
  it("classifies environment, key, and credential files", async () => {
    const paths = await secretsIn({
      ".env": `API_TOKEN=${SECRET_VALUE}\n`,
      "certs/server.pem": "-----BEGIN PRIVATE KEY-----\n",
      "config/service-account.json": `{ "private_key": "${SECRET_VALUE}" }`,
      "src/index.js": "export const a = 1;\n",
    });

    expect(paths.map((entry) => [entry.path, entry.kind])).toStrictEqual([
      [".env", "environment"],
      ["certs/server.pem", "private-key"],
      ["config/service-account.json", "credential"],
    ]);
  });

  it("never carries file contents into a result", async () => {
    const paths = await secretsIn({
      ".env": `API_TOKEN=${SECRET_VALUE}\n`,
      "id_rsa": `-----BEGIN OPENSSH PRIVATE KEY-----\n${SECRET_VALUE}\n`,
    });

    expect(paths.length).toBe(2);
    expect(JSON.stringify(paths)).not.toContain(SECRET_VALUE);
    expect(JSON.stringify(paths)).not.toContain("API_TOKEN");
    expect(JSON.stringify(paths)).not.toContain("PRIVATE KEY");
  });

  it("marks an ignored environment file as excluded rather than exposed", async () => {
    const paths = await secretsIn({
      ".gitignore": ".env\n",
      ".env": `API_TOKEN=${SECRET_VALUE}\n`,
      "README.md": "# temp\n",
    });

    expect(paths[0]?.excluded).toBe(true);
    expect(exposedSecretPaths(paths)).toStrictEqual([]);
  });

  it("treats a committed template as documentation, not exposure", async () => {
    const paths = await secretsIn({
      ".env.example": "API_TOKEN=\n",
      "config/credentials.json.example": "{}\n",
      "README.md": "# temp\n",
    });

    expect(paths.every((entry) => entry.template)).toBe(true);
    expect(exposedSecretPaths(paths)).toStrictEqual([]);
  });

  it("flags test material as a fixture location", async () => {
    const paths = await secretsIn({
      "tests/fixtures/signing.key": "test key\n",
      "README.md": "# temp\n",
    });

    expect(paths[0]?.fixture).toBe(true);
    expect(exposedSecretPaths(paths)).toHaveLength(1);
  });

  it("does not classify source files that merely mention configuration", async () => {
    const paths = await secretsIn({
      "src/.env.d.ts": "declare const env: string;\n",
      "src/credentials.ts": "export const credentials = {};\n",
      "docs/credentials.md": "# Credentials\n",
      "certs/server.pub": "ssh-ed25519 AAAA\n",
    });

    expect(paths).toStrictEqual([]);
  });

  it("does not follow a symlink that points outside the repository", async () => {
    const outside = await createTempRepo({ "real.env": `API_TOKEN=${SECRET_VALUE}\n` });
    const { root, cleanup } = await createTempRepo({ "README.md": "# temp\n" });
    try {
      await writeFile(path.join(root, "keep.txt"), "kept\n");
      try {
        await symlink(path.join(outside.root, "real.env"), path.join(root, ".env"));
      } catch {
        // Windows without developer mode cannot create symlinks; indexing skips
        // symlinks unconditionally, so there is nothing left to assert here.
        return;
      }

      const paths = await discoverSecretPaths(await buildRepositoryContext(root));

      // The link is never indexed, so it is never classified and never read.
      expect(paths).toStrictEqual([]);
    } finally {
      await cleanup();
      await outside.cleanup();
    }
  });

  it("recognizes template suffixes", () => {
    expect(isTemplatePath(".env.example")).toBe(true);
    expect(isTemplatePath("config/app.key.sample")).toBe(true);
    expect(isTemplatePath(".env")).toBe(false);
  });
});
