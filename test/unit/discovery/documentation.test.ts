import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../src/core/repository-context.js";
import {
  collectDocumentation,
  findDocumentedCommands,
  repositoryDocumentation,
} from "../../../src/discovery/documentation.js";
import { createTempRepo, fixture } from "../../helpers/temp-repo.js";

async function docsFor(files: Record<string, string>) {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await collectDocumentation(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

describe("collectDocumentation", () => {
  it("selects root documents, documentation directories, and nested AGENTS.md", async () => {
    const docs = await docsFor({
      "AGENTS.md": "# a",
      "README.md": "# b",
      "CONTRIBUTING.md": "# c",
      "docs/guide.md": "# d",
      ".github/CONTRIBUTING.md": "# e",
      "packages/api/AGENTS.md": "# f",
      "src/index.js": "// not documentation",
      "docs/logo.png": "",
    });

    expect(docs.map((doc) => [doc.path, doc.role])).toStrictEqual([
      ["AGENTS.md", "agents-root"],
      ["CONTRIBUTING.md", "guide"],
      ["README.md", "readme"],
      ["packages/api/AGENTS.md", "agents-nested"],
      [".github/CONTRIBUTING.md", "guide"],
      ["docs/guide.md", "guide"],
    ]);
  });

  it("ignores documentation buried outside documentation directories", async () => {
    const docs = await docsFor({ "src/internal/notes.md": "# notes" });
    expect(docs).toStrictEqual([]);
  });

  it("parses commands out of the documents it selects", async () => {
    const docs = await docsFor({ "README.md": "# a\n\n```bash\nnpm ci\n```\n" });

    expect(findDocumentedCommands(docs, "setup").map((match) => match.pattern.label)).toStrictEqual([
      "npm install",
    ]);
  });

  it("is memoized per repository context", async () => {
    const context = await buildRepositoryContext(fixture("node-healthy"));

    expect(await collectDocumentation(context)).toBe(await collectDocumentation(context));
  });
});

describe("repositoryDocumentation", () => {
  it("drops nested AGENTS.md so a vendored project cannot answer for the repository", async () => {
    const docs = await docsFor({
      "README.md": "# a",
      "packages/api/AGENTS.md": "# b\n\n```bash\nnpm ci\n```\n",
    });

    expect(docs.map((doc) => doc.path)).toContain("packages/api/AGENTS.md");
    expect(repositoryDocumentation(docs).map((doc) => doc.path)).toStrictEqual(["README.md"]);
  });
});
