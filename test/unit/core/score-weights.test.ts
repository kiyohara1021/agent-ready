import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { analyzeRepository } from "../../../src/core/analyze.js";
import { CATEGORY_WEIGHTS, TOTAL_WEIGHT } from "../../../src/core/score.js";
import { CATEGORY_ORDER, CATEGORY_TITLES, type CategoryId } from "../../../src/core/types.js";
import { defaultDetectors } from "../../../src/detectors/index.js";
import { fixture } from "../../helpers/temp-repo.js";

/**
 * docs/SCORING.md is the source of truth for every point total, so this suite
 * parses it and holds the implementation against it. A weight can still be
 * changed — deliberately, by editing the document and the code together — but
 * it can no longer drift in one of them alone.
 *
 * Categories whose detectors have not landed yet are listed explicitly rather
 * than skipped, so the pull request that adds them has to update this file.
 */

const SCORING_DOC = path.resolve(import.meta.dirname, "../../../docs/SCORING.md");

/** `### Instructions — 30 points` */
const CATEGORY_HEADING = /^### (.+?) — (\d+) points$/;
/** `#### `instructions.agents-md` — 10` */
const CHECK_HEADING = /^#### `([a-z][a-z.-]*)` — (\d+)$/;

/** Categories whose detectors are implemented; the rest arrive in a later PR. */
const IMPLEMENTED_CATEGORIES: readonly CategoryId[] = ["instructions", "automation"];

const TITLE_TO_ID = new Map<string, CategoryId>(
  CATEGORY_ORDER.map((id) => [CATEGORY_TITLES[id], id]),
);

let documentedCategoryTotals: Map<CategoryId, number>;
let documentedCheckPoints: Map<string, number>;

beforeAll(async () => {
  const lines = (await readFile(SCORING_DOC, "utf8")).split("\n");

  documentedCategoryTotals = new Map();
  documentedCheckPoints = new Map();

  for (const line of lines) {
    const category = CATEGORY_HEADING.exec(line);
    if (category) {
      const [, title, points] = category;
      if (title === undefined || points === undefined) continue;
      const id = TITLE_TO_ID.get(title);
      if (id !== undefined) documentedCategoryTotals.set(id, Number(points));
      continue;
    }

    const check = CHECK_HEADING.exec(line);
    if (check) {
      const [, id, points] = check;
      if (id === undefined || points === undefined) continue;
      documentedCheckPoints.set(id, Number(points));
    }
  }
});

describe("documented scoring weights", () => {
  it("parses a weight for every category and check in docs/SCORING.md", () => {
    expect([...documentedCategoryTotals.keys()].sort()).toStrictEqual(
      [...CATEGORY_ORDER].sort(),
    );
    expect(documentedCheckPoints.size).toBe(19);
  });

  it("matches CATEGORY_WEIGHTS to the category totals in docs/SCORING.md", () => {
    expect(Object.fromEntries(documentedCategoryTotals)).toStrictEqual(CATEGORY_WEIGHTS);
  });

  it("adds the documented per-check points up to each category total", () => {
    for (const categoryId of CATEGORY_ORDER) {
      const checkTotal = [...documentedCheckPoints]
        .filter(([id]) => id.startsWith(`${categoryId}.`))
        .reduce((total, [, points]) => total + points, 0);

      expect(checkTotal, `documented checks for "${categoryId}"`).toBe(
        CATEGORY_WEIGHTS[categoryId],
      );
    }
  });

  it("adds the category weights up to a 100 point budget", () => {
    expect(TOTAL_WEIGHT).toBe(100);
  });
});

describe("registered detector budgets", () => {
  it("has detectors for exactly the categories implemented so far", () => {
    const categories = new Set(defaultDetectors.map((detector) => detector.category));

    expect([...categories].sort()).toStrictEqual([...IMPLEMENTED_CATEGORIES].sort());
  });

  it("gives every registered detector the points docs/SCORING.md documents", async () => {
    // Every check applies to this fixture, so each finding reports the full
    // budget its detector reserves.
    const result = await analyzeRepository(fixture("node-healthy"));

    const declared = Object.fromEntries(
      result.findings.map((finding) => [finding.id, finding.maxScore]),
    );
    const documented = Object.fromEntries(
      [...documentedCheckPoints].filter(([id]) =>
        IMPLEMENTED_CATEGORIES.some((categoryId) => id.startsWith(`${categoryId}.`)),
      ),
    );

    expect(declared).toStrictEqual(documented);
  });

  it("reports category totals equal to the documented maxima when everything applies", async () => {
    const result = await analyzeRepository(fixture("node-healthy"));

    expect(result.categories).toStrictEqual(
      IMPLEMENTED_CATEGORIES.map((id) => ({
        id,
        score: CATEGORY_WEIGHTS[id],
        maxScore: CATEGORY_WEIGHTS[id],
      })),
    );
  });
});
