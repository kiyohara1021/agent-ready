/**
 * Domain errors. The CLI turns these into concise messages on stderr; internal
 * stack traces are never part of normal output.
 */
export abstract class AgentReadyError extends Error {
  abstract readonly code: string;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class RepositoryNotFoundError extends AgentReadyError {
  readonly code = "REPOSITORY_NOT_FOUND";

  constructor(readonly path: string) {
    super(`Repository path not found: ${path}`);
  }
}

export class RepositoryUnreadableError extends AgentReadyError {
  readonly code = "REPOSITORY_UNREADABLE";

  constructor(
    readonly path: string,
    options?: { cause?: unknown },
  ) {
    super(`Repository path is not a readable directory: ${path}`, options);
  }
}

export class InvalidOptionError extends AgentReadyError {
  readonly code = "INVALID_OPTION";
}

export class AnalysisError extends AgentReadyError {
  readonly code = "ANALYSIS_FAILED";
}
