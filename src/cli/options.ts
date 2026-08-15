import { parseArgs } from "node:util";

import { InvalidOptionError } from "../core/errors.js";

export type OutputFormat = "text" | "json";

export interface CheckOptions {
  /** Path to analyze, as given on the command line. Defaults to `.`. */
  path: string;
  format: OutputFormat;
  /** Exit with code 2 when the score is below this value. */
  minScore?: number;
  help: boolean;
  version: boolean;
}

const FORMATS: readonly string[] = ["text", "json"];

function parseMinScore(raw: string): number {
  const trimmed = raw.trim();
  const value = Number(trimmed);
  if (!/^\d{1,3}$/.test(trimmed) || value > 100) {
    throw new InvalidOptionError(
      `Invalid --min-score value: ${raw}. Expected an integer between 0 and 100.`,
    );
  }
  return value;
}

/** Parses `check` arguments. Invalid input becomes an {@link InvalidOptionError}. */
export function parseCheckOptions(argv: readonly string[]): CheckOptions {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      options: {
        format: { type: "string" },
        "min-score": { type: "string" },
        help: { type: "boolean", default: false },
        version: { type: "boolean", default: false },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (cause) {
    throw new InvalidOptionError(
      cause instanceof Error ? cause.message : "Invalid arguments.",
      { cause },
    );
  }

  const { values, positionals } = parsed;

  if (positionals.length > 1) {
    throw new InvalidOptionError(
      `Expected at most one path, received ${String(positionals.length)}.`,
    );
  }

  const format = values.format ?? "text";
  if (!FORMATS.includes(format)) {
    throw new InvalidOptionError(
      `Invalid --format value: ${format}. Expected "text" or "json".`,
    );
  }

  return {
    path: positionals[0] ?? ".",
    format: format as OutputFormat,
    ...(values["min-score"] === undefined
      ? {}
      : { minScore: parseMinScore(values["min-score"]) }),
    help: values.help,
    version: values.version,
  };
}
