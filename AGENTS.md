# AGENTS.md

## Project goal

`agentworthy` is a deterministic static-analysis CLI that evaluates how well a repository is prepared for coding agents.

Its job is to analyze repository readiness, not to act as a coding agent.

## Source of truth

Before implementing a feature, read the relevant documents:

- `PRODUCT.md`
- `docs/V0_SPEC.md`
- `docs/SCORING.md`
- `docs/ARCHITECTURE.md`
- `docs/CLI.md`
- `docs/DETECTORS.md`
- `docs/OSS_STRATEGY.md`

If implementation and documentation disagree, do not silently invent a new product direction. Update the relevant specification intentionally.

## Product boundaries

Do not:

- call OpenAI, Anthropic, Gemini, or other LLM APIs for core analysis
- generate repository files using an LLM
- package entire repositories into prompts
- build a Repomix/code2prompt/Gitingest clone
- automatically edit analyzed repositories
- execute analyzed repository scripts
- run install commands in analyzed repositories
- upload analyzed source code
- implement mandatory telemetry
- add cloud accounts or authentication
- add agent-specific behavior before the general readiness model is solid

## Technical direction

Use TypeScript.

The CLI must support Node.js 22+.

Prefer:

- small focused modules
- explicit types
- deterministic behavior
- filesystem fixtures in tests
- conservative parsing
- zero network dependency for analysis
- minimal runtime dependencies

Avoid:

- complex frameworks
- unnecessary dependency injection frameworks
- dynamic evaluation of target repository config
- loading target repository JavaScript via `require`/`import`
- premature plugin architecture

## Architecture rules

Keep these layers separated:

```text
discovery
detectors
scoring
reporters
CLI
```

### Detectors

Each detector must:

1. inspect `RepositoryContext`
2. return structured `Finding` data
3. contain no terminal rendering logic
4. contain no global scoring side effects
5. avoid arbitrary code execution
6. be independently testable

### Discovery

Discovery may read known configuration and documentation files.

It should avoid repeatedly scanning the same repository for every detector.

### Scoring

Scoring must consume findings.

Scoring must not access the filesystem.

### Reporters

Reporters format analysis results only.

Reporters must not perform detection.

### CLI

CLI command handlers should remain thin.

Do not place detector or scoring logic directly in CLI handlers.

## Read-only guarantee

`agentworthy check` is read-only.

It must not create, update, or delete files in the analyzed repository.

## Security rules

Treat target repositories as untrusted input.

Never:

- execute repository code
- source shell scripts
- evaluate configuration code
- print secret values
- print private key contents
- blindly follow symlinks outside the repository
- read unbounded huge files unnecessarily

When reporting potential secret-related risks, report only enough metadata to explain the finding.

## Compatibility

Do not assume repositories are Node.js projects.

When adding project detection, consider whether the logic works for:

- Node.js
- PHP/Composer
- Python
- Rust
- Go
- Ruby
- Dart/Flutter
- Swift
- Java/Gradle/Maven
- generic Makefile-based repositories

It is acceptable for v0.x support to be incomplete. It is not acceptable to hard-code Node-only assumptions into the core architecture.

## CLI UX

The primary command is:

```bash
agentworthy check
```

Useful defaults are preferred over additional flags.

Do not add commands or flags unless required by the current specification or clearly necessary for correctness.

v0.1 required options are documented in `docs/CLI.md`.

## Stable identifiers

Finding IDs are API-like identifiers.

Once released, avoid casually renaming them.

Example:

```text
instructions.agents-md
automation.tests
context.readme
safety.secrets
```

JSON output must remain deterministic.

## Tests

Use the project's configured commands.

Before submitting a change, run the full relevant validation suite.

Expected scripts should include equivalents of:

```bash
npm test
npm run lint
npm run typecheck
```

Every detector requires:

- positive case
- negative case
- edge case
- applicability case when relevant

Prefer realistic fixture repositories over extensive mocks.

Do not weaken tests or coverage simply to make a change pass.

## Documentation

Behavior changes must update relevant documentation.

Examples:

- detector behavior → `docs/DETECTORS.md`
- point changes → `docs/SCORING.md`
- CLI changes → `docs/CLI.md`
- architecture changes → `docs/ARCHITECTURE.md`
- scope/product changes → `PRODUCT.md` / `docs/V0_SPEC.md`

## Pull requests

Keep pull requests focused and reviewable.

Prefer one coherent concern per PR.

Good examples:

- bootstrap CLI architecture
- implement core instruction detectors
- add scoring engine
- add terminal/JSON reporters
- add safety detectors
- release/README polish

Avoid unrelated refactors bundled with feature work.

## Dependency policy

Before adding a dependency, ask:

1. Is it necessary?
2. Is the same behavior simple to implement safely?
3. Does it materially increase install size?
4. Does it execute target repository code?
5. Is it maintained?

Avoid heavy dependencies for trivial formatting or filesystem tasks.

## Performance

Do not parse entire codebases when metadata-level evidence is enough.

Prefer:

- known config files
- repository tree/index
- small bounded documentation reads
- ignored/generated directory skipping

## Error handling

User-facing errors should be concise and actionable.

Do not show internal stack traces during normal operation.

Internal/runtime errors are exit code `1`.

Readiness threshold failure is exit code `2`.

## Version scope

Do not implement speculative v1 features during v0.1 work.

Potential future features such as:

- `init`
- GitHub Action wrapper
- agent-specific profiles
- SARIF
- monorepo package scores
- plugins

must not distract from a clean and reliable `check` command.
