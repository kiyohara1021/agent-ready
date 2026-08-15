import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../src/core/repository-context.js";
import {
  detectOtherCi,
  discoverWorkflows,
  usesAction,
  workflowSignals,
} from "../../../src/discovery/workflows.js";
import { createTempRepo, fixture } from "../../helpers/temp-repo.js";

async function analyze<T>(
  files: Record<string, string>,
  read: (context: Awaited<ReturnType<typeof buildRepositoryContext>>) => Promise<T>,
): Promise<T> {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await read(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

function workflow(body: string): Record<string, string> {
  return { ".github/workflows/ci.yml": body };
}

describe("discoverWorkflows", () => {
  it("reads inline and block-scalar run steps", async () => {
    const workflows = await analyze(
      workflow(
        [
          "name: ci",
          "jobs:",
          "  build:",
          "    steps:",
          "      - uses: actions/checkout@v5",
          "      - run: npm ci",
          "      - name: Checks",
          "        run: |",
          "          npm test",
          "          npm run lint",
          "      - run: npm run build",
        ].join("\n"),
      ),
      discoverWorkflows,
    );

    const parsed = workflows[0];
    expect(parsed?.path).toBe(".github/workflows/ci.yml");
    expect(parsed?.commands).toContain("npm ci");
    expect(parsed?.commands).toContain("npm test");
    expect(parsed?.commands).toContain("npm run lint");
    expect(parsed?.actions).toStrictEqual(["actions/checkout"]);
    expect(parsed?.signals.map((signal) => signal.kind)).toStrictEqual(["test", "lint", "build"]);
  });

  it("ends a block scalar at the next key at or below its indentation", async () => {
    const workflows = await analyze(
      workflow(
        [
          "jobs:",
          "  build:",
          "    steps:",
          "      - run: |",
          "          npm test",
          "      - uses: actions/upload-artifact@v4",
          "      - run: npm run lint",
        ].join("\n"),
      ),
      discoverWorkflows,
    );

    expect(workflows[0]?.commands).toStrictEqual(["npm test", "npm run lint"]);
    expect(workflows[0]?.actions).toStrictEqual(["actions/upload-artifact"]);
  });

  it("does not infer validation from prose in step names", async () => {
    const workflows = await analyze(
      workflow(
        [
          "jobs:",
          "  build:",
          "    steps:",
          "      - name: Run the tests and lint everything",
          "        uses: ./.github/actions/validate",
        ].join("\n"),
      ),
      discoverWorkflows,
    );

    expect(workflows[0]?.signals).toStrictEqual([]);
  });

  it("recognizes validation performed by an action", async () => {
    const workflows = await analyze(
      workflow(
        [
          "jobs:",
          "  lint:",
          "    steps:",
          "      - uses: golangci/golangci-lint-action@v6",
        ].join("\n"),
      ),
      discoverWorkflows,
    );

    expect(workflowSignals(workflows, "lint").map((match) => match.signal.label)).toStrictEqual([
      "golangci-lint action",
    ]);
    expect(usesAction(workflows, "golangci/golangci-lint-action")).toBe(true);
  });

  it("ignores YAML outside the workflow directory", async () => {
    const workflows = await analyze(
      {
        ".github/dependabot.yml": "version: 2\n",
        ".github/workflows/nested/ci.yml": "jobs:\n  a:\n    steps:\n      - run: npm test\n",
        "docker-compose.yml": "services:\n  app:\n    command: npm test\n",
      },
      discoverWorkflows,
    );

    expect(workflows).toStrictEqual([]);
  });

  it("orders workflows and signals deterministically", async () => {
    const workflows = await analyze(
      {
        ".github/workflows/z-release.yaml": "jobs:\n  a:\n    steps:\n      - run: npm run build\n",
        ".github/workflows/a-ci.yml": "jobs:\n  a:\n    steps:\n      - run: npm test\n",
      },
      discoverWorkflows,
    );

    expect(workflows.map((entry) => entry.path)).toStrictEqual([
      ".github/workflows/a-ci.yml",
      ".github/workflows/z-release.yaml",
    ]);
  });

  it("parses a committed fixture workflow", async () => {
    const workflows = await discoverWorkflows(
      await buildRepositoryContext(fixture("php-composer")),
    );

    expect(workflows).toHaveLength(1);
    expect(workflows[0]?.signals.map((signal) => signal.label)).toStrictEqual([
      "composer test",
      "composer lint",
      "composer static analysis",
    ]);
  });
});

describe("detectOtherCi", () => {
  it("recognizes CI systems whose configuration is not parsed", async () => {
    const found = await analyze({ ".gitlab-ci.yml": "test:\n  script: npm test\n" }, detectOtherCi);

    expect(found).toStrictEqual([{ label: "GitLab CI", path: ".gitlab-ci.yml" }]);
  });

  it("reports nothing when no CI configuration exists", async () => {
    expect(await analyze({ "README.md": "# app\n" }, detectOtherCi)).toStrictEqual([]);
  });
});
