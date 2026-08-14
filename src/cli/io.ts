export interface OutputStream {
  write(chunk: string): unknown;
}

export interface CliIo {
  stdout: OutputStream;
  stderr: OutputStream;
  cwd: string;
}

export const EXIT_CODES = {
  success: 0,
  error: 1,
  thresholdNotMet: 2,
} as const;

export const CHECK_HELP = `Usage:
  agent-ready check [path] [options]

Options:
  --format <text|json>   Output format (default: text)
  --min-score <number>   Fail with exit code 2 below this score
  --help                 Show help
  --version              Show version`;

export const ROOT_HELP = `agent-ready — is your repository ready for coding agents?

${CHECK_HELP}

Commands:
  check [path]           Audit repository readiness (default path: .)

Exit codes:
  0  analysis completed and threshold passed
  1  runtime or invocation error
  2  readiness score below --min-score`;
