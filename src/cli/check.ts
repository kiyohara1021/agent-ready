import path from "node:path";

import { analyzeRepository } from "../core/analyze.js";
import { TOOL_VERSION } from "../core/version.js";
import { renderJsonReport } from "../reporters/json.js";
import { renderTextReport } from "../reporters/text.js";
import { parseCheckOptions } from "./options.js";
import { CHECK_HELP, EXIT_CODES, type CliIo } from "./io.js";

/**
 * `check` command handler.
 *
 * Deliberately thin: it parses options, resolves the path, delegates to the
 * analysis pipeline, picks a reporter, and maps the score to an exit code.
 */
export async function runCheck(argv: readonly string[], io: CliIo): Promise<number> {
  const options = parseCheckOptions(argv);

  if (options.help) {
    io.stdout.write(`${CHECK_HELP}\n`);
    return EXIT_CODES.success;
  }

  if (options.version) {
    io.stdout.write(`${TOOL_VERSION}\n`);
    return EXIT_CODES.success;
  }

  const target = path.resolve(io.cwd, options.path);
  const result = await analyzeRepository(target);

  if (options.format === "json") {
    io.stdout.write(renderJsonReport(result, { displayPath: displayPath(io.cwd, result.repositoryPath) }));
  } else {
    io.stdout.write(renderTextReport(result));
  }

  if (options.minScore !== undefined && result.score < options.minScore) {
    // The report is the deliverable and stays on stdout; this line explains the
    // non-zero exit to whoever reads a CI log, so it belongs on stderr.
    io.stderr.write(
      `Agent readiness ${String(result.score)} is below the required minimum of ${String(options.minScore)}.\n`,
    );
    return EXIT_CODES.thresholdNotMet;
  }

  return EXIT_CODES.success;
}

/**
 * Prefers a relative path so output does not expose home-directory details
 * unnecessarily, falling back to the absolute path when the target sits outside
 * the working directory.
 */
export function displayPath(cwd: string, repositoryPath: string): string {
  const relative = path.relative(cwd, repositoryPath);
  if (relative === "") return ".";
  if (relative.startsWith("..") || path.isAbsolute(relative)) return repositoryPath;
  return relative.split(path.sep).join("/");
}
