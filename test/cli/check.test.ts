import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import { createTempRepo, fixture, SAMPLE_REPO } from "../helpers/temp-repo.js";

const execFileAsync = promisify(execFile);

/** The built binary, exactly as npm would install it. `pretest` builds it. */
const CLI = path.resolve(import.meta.dirname, "../../dist/cli/index.js");

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[], cwd = process.cwd()): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, ...args], { cwd });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return {
      code: failure.code ?? 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

describe("agent-ready CLI", () => {
  it("checks a repository and exits 0", async () => {
    const result = await runCli(["check", SAMPLE_REPO]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Agent Readiness:");
    expect(result.stdout).toContain("Instructions");
    expect(result.stdout).toContain("instructions.agents-md");
    expect(result.stderr).toBe("");
  });

  it("defaults to the current working directory", async () => {
    const result = await runCli(["check"], SAMPLE_REPO);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Agent Readiness:");
  });

  it("emits parseable JSON with --format json", async () => {
    const result = await runCli(["check", SAMPLE_REPO, "--format", "json"]);
    const report = JSON.parse(result.stdout) as {
      schemaVersion: number;
      toolVersion: string;
      score: number;
      findings: { id: string }[];
    };

    expect(result.code).toBe(0);
    expect(report.schemaVersion).toBe(1);
    expect(report.toolVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(typeof report.score).toBe("number");
    expect(report.findings.map((finding) => finding.id)).toContain("instructions.agents-md");
  });

  it("exits 2 when the score is below --min-score", async () => {
    const { root, cleanup } = await createTempRepo();
    try {
      // An empty repository satisfies no instruction detector.
      const result = await runCli(["check", root, "--min-score", "50"]);

      expect(result.code).toBe(2);
      expect(result.stdout).toContain("Agent Readiness: 0 / 100");
    } finally {
      await cleanup();
    }
  });

  it("exits 0 when the score meets --min-score", async () => {
    const result = await runCli(["check", fixture("node-healthy"), "--min-score", "90"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Agent Readiness: 100 / 100");
  });

  it("exits 1 for a missing path and keeps the message on stderr", async () => {
    const result = await runCli(["check", path.join(SAMPLE_REPO, "nope")]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("not found");
    expect(result.stderr).not.toContain("at Object.");
  });

  it("exits 1 for an invalid flag value", async () => {
    const result = await runCli(["check", SAMPLE_REPO, "--format", "yaml"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--format");
  });

  it("exits 1 for an unknown command", async () => {
    const result = await runCli(["explain"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Unknown command");
  });

  it("prints help and version", async () => {
    const help = await runCli(["--help"]);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("agent-ready check [path] [options]");

    const version = await runCli(["--version"]);
    expect(version.code).toBe(0);
    expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("does not modify the analyzed repository", async () => {
    const { scanRepository } = await import("../../src/discovery/filesystem.js");
    const before = await scanRepository(SAMPLE_REPO, { skipDirectories: [] });

    await runCli(["check", SAMPLE_REPO]);

    const after = await scanRepository(SAMPLE_REPO, { skipDirectories: [] });
    expect(after.files).toStrictEqual(before.files);
  });
});
