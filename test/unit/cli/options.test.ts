import { describe, expect, it } from "vitest";

import { parseCheckOptions } from "../../../src/cli/options.js";
import { InvalidOptionError } from "../../../src/core/errors.js";
import { displayPath } from "../../../src/cli/check.js";

describe("parseCheckOptions", () => {
  it("defaults to the current directory and text format", () => {
    expect(parseCheckOptions([])).toStrictEqual({ path: ".", format: "text", help: false });
  });

  it("accepts a positional path", () => {
    expect(parseCheckOptions(["../api"]).path).toBe("../api");
  });

  it("accepts both output formats", () => {
    expect(parseCheckOptions(["--format", "json"]).format).toBe("json");
    expect(parseCheckOptions(["--format", "text"]).format).toBe("text");
  });

  it("rejects an unknown format", () => {
    expect(() => parseCheckOptions(["--format", "yaml"])).toThrow(InvalidOptionError);
  });

  it("parses --min-score within 0-100", () => {
    expect(parseCheckOptions(["--min-score", "80"]).minScore).toBe(80);
    expect(parseCheckOptions(["--min-score", "0"]).minScore).toBe(0);
    expect(parseCheckOptions(["--min-score", "100"]).minScore).toBe(100);
  });

  it("rejects out-of-range or non-numeric --min-score values", () => {
    for (const value of ["101", "-1", "abc", "80.5", ""]) {
      expect(() => parseCheckOptions(["--min-score", value])).toThrow(InvalidOptionError);
    }
  });

  it("rejects unknown flags", () => {
    expect(() => parseCheckOptions(["--verbose"])).toThrow(InvalidOptionError);
  });

  it("rejects more than one path", () => {
    expect(() => parseCheckOptions(["a", "b"])).toThrow(InvalidOptionError);
  });
});

describe("displayPath", () => {
  it("uses '.' for the working directory itself", () => {
    expect(displayPath("/work/repo", "/work/repo")).toBe(".");
  });

  it("uses a relative path for nested targets", () => {
    expect(displayPath("/work", "/work/repo")).toBe("repo");
  });

  it("falls back to the absolute path outside the working directory", () => {
    expect(displayPath("/work/repo", "/elsewhere/api")).toBe("/elsewhere/api");
  });
});
