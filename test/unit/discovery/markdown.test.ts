import { describe, expect, it } from "vitest";

import { contentLength, findSections, hasHeading, parseDocument } from "../../../src/discovery/markdown.js";

describe("parseDocument", () => {
  it("extracts headings, sections, and fenced commands", () => {
    const signals = parseDocument(
      ["# Title", "", "Intro text.", "", "## Setup", "", "```bash", "npm ci", "```", ""].join("\n"),
    );

    expect(signals.headings).toStrictEqual(["title", "setup"]);
    expect(signals.code).toStrictEqual(["npm ci"]);
    expect(signals.sections.map((section) => section.level)).toStrictEqual([0, 1, 2]);
    expect(signals.sections[1]?.text).toContain("intro text.");
  });

  it("captures inline code spans outside fences", () => {
    const signals = parseDocument("Run `pytest -k slow` and then `ruff check .`.");
    expect(signals.code).toStrictEqual(["pytest -k slow", "ruff check ."]);
  });

  it("strips shell prompts, link syntax, and emphasis", () => {
    const signals = parseDocument(
      ["## **[Testing](docs/test.md)**", "", "```", "$ npm test", "```"].join("\n"),
    );

    expect(signals.headings).toStrictEqual(["testing"]);
    expect(signals.code).toStrictEqual(["npm test"]);
  });

  it("treats `=` underlines as headings and leaves `-` rules alone", () => {
    const signals = parseDocument(["Architecture", "============", "", "Body.", "", "---", ""].join("\n"));

    expect(signals.headings).toStrictEqual(["architecture"]);
    expect(signals.sections[1]?.text).toContain("body.");
  });

  it("does not mistake front matter for a heading", () => {
    const signals = parseDocument(["---", "title: Guide", "---", "", "# Guide"].join("\n"));
    expect(signals.headings).toStrictEqual(["guide"]);
  });

  it("keeps an unclosed fence from losing the rest of the document", () => {
    const signals = parseDocument(["# Title", "```bash", "npm test"].join("\n"));

    expect(signals.headings).toStrictEqual(["title"]);
    expect(signals.code).toStrictEqual(["npm test"]);
  });

  it("returns a single empty section for empty input", () => {
    const signals = parseDocument("");

    expect(signals.headings).toStrictEqual([]);
    expect(signals.code).toStrictEqual([]);
    expect(signals.sections).toHaveLength(1);
  });

  it("is deterministic", () => {
    const raw = "# A\n\n```\nnpm ci\n```\n";
    expect(parseDocument(raw)).toStrictEqual(parseDocument(raw));
  });
});

describe("markdown helpers", () => {
  it("matches headings case-insensitively through normalization", () => {
    const signals = parseDocument("## Running The Tests\n\nBody.\n");
    expect(hasHeading(signals, /\btests\b/)).toBe(true);
  });

  it("finds sections by heading and exposes their body", () => {
    const signals = parseDocument("# A\n\nalpha\n\n## Architecture\n\nbeta gamma\n");
    const sections = findSections(signals, /architecture/);

    expect(sections).toHaveLength(1);
    expect(sections[0]?.text).toContain("beta gamma");
    expect(sections[0]?.text).not.toContain("alpha");
  });

  it("measures content ignoring whitespace", () => {
    expect(contentLength("  a b\n c ")).toBe(3);
  });
});
