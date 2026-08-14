import { AgentReadyError } from "../core/errors.js";
import { TOOL_VERSION } from "../core/version.js";
import { runCheck } from "./check.js";
import { EXIT_CODES, ROOT_HELP, type CliIo } from "./io.js";

/**
 * CLI entry logic, separated from the executable so tests can drive it.
 *
 * Translates domain errors into concise stderr messages; stack traces are never
 * printed during normal operation.
 */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  const [command, ...rest] = argv;

  if (command === undefined || command === "--help" || command === "-h") {
    io.stdout.write(`${ROOT_HELP}\n`);
    return EXIT_CODES.success;
  }

  if (command === "--version" || command === "-v") {
    io.stdout.write(`${TOOL_VERSION}\n`);
    return EXIT_CODES.success;
  }

  try {
    if (command === "check") {
      return await runCheck(rest, io);
    }

    io.stderr.write(`Unknown command: ${command}\n\nRun "agent-ready --help" for usage.\n`);
    return EXIT_CODES.error;
  } catch (error) {
    io.stderr.write(`${formatError(error)}\n`);
    return EXIT_CODES.error;
  }
}

function formatError(error: unknown): string {
  if (error instanceof AgentReadyError) return `Error: ${error.message}`;
  if (error instanceof Error) return `Error: ${error.message}`;
  return "Error: unexpected failure.";
}
