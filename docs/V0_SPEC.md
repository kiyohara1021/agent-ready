# v0.1 Specification

## Status

Target release: `0.1.0`

This document defines the minimum shippable version of `agent-ready`.

Anything not explicitly required here should be deferred unless it is necessary for correctness, portability, security, or maintainability.

## Primary command

```bash
agent-ready check
```

The same command must work through:

```bash
npx agent-ready check
```

## Supported invocation

```bash
agent-ready check
agent-ready check .
agent-ready check ../my-project
agent-ready check /absolute/path/to/project
```

The path defaults to the current working directory.

## Runtime

Required:

- Node.js 22+
- ESM-compatible package
- TypeScript source
- distributable CLI package

Supported operating systems:

- macOS
- Linux
- Windows

CI must validate all three operating-system families where practical.

## Repository support

The analyzer must not require a Node.js project.

The repository may contain one or more ecosystems, including:

- JavaScript / TypeScript
- PHP
- Python
- Rust
- Go
- Java / Kotlin
- Ruby
- Swift
- Dart / Flutter
- generic repositories with Makefiles or shell scripts

v0.1 does not need exhaustive ecosystem coverage. It must, however, avoid architecture that assumes Node.js metadata is always present.

## Core output

Default output is human-readable terminal text.

Required summary:

```text
Agent Readiness: 78 / 100
```

Required sections:

- Instructions
- Development
- Repository Context
- Safety

Each finding must include:

- status
- short title
- detector id
- optional recommendation
- score contribution

Supported statuses:

- `pass`
- `warning`
- `fail`
- `info`

Recommended symbols:

```text
✓ pass
△ warning
✕ fail
• info
```

Do not rely on color alone.

## JSON output

Required:

```bash
agent-ready check --format json
```

Initial schema:

```json
{
  "schemaVersion": 1,
  "toolVersion": "0.1.0",
  "repository": {
    "path": "."
  },
  "score": 78,
  "categories": [
    {
      "id": "instructions",
      "score": 24,
      "maxScore": 30
    }
  ],
  "findings": [
    {
      "id": "instructions.agents-md",
      "category": "instructions",
      "status": "pass",
      "title": "AGENTS.md detected",
      "message": "Repository-level coding-agent instructions are present.",
      "score": 8,
      "maxScore": 10
    }
  ],
  "recommendations": [
    {
      "findingId": "context.architecture",
      "priority": "high",
      "message": "Add a concise architecture overview."
    }
  ]
}
```

The exact schema may evolve before `1.0.0`, but changes must be intentional and documented.

## Threshold mode

Required:

```bash
agent-ready check --min-score 80
```

Behavior:

- complete the full analysis
- print or emit the result normally
- return threshold failure exit code if the score is below the minimum

## Exit codes

```text
0 = analysis completed and threshold passed or no threshold was provided
1 = runtime/internal error
2 = readiness score below --min-score
```

Detector warnings or failed readiness checks do not by themselves cause exit code 1.

## Required detectors

v0.1 should ship with at least the following detector families.

### Instructions

- repository-level `AGENTS.md`
- useful content in `AGENTS.md`
- setup/development instructions
- test instructions
- lint/type-check instructions
- architecture guidance

### Development

- recognizable project/package metadata
- package manager or build system
- test command
- lint command
- type-check/static-analysis command
- CI workflow

### Repository context

- README
- architecture documentation
- repository metadata
- ignore rules
- generated/vendor separation

### Safety

- `.gitignore`
- obvious secret/local-file exclusions
- `SECURITY.md`
- dependency lockfile where ecosystem conventions make it meaningful

The exact scoring weights are defined in `SCORING.md`.

## Performance

Target for a typical small-to-medium repository:

- cold execution should feel interactive
- avoid reading full contents of every source file
- prefer metadata and known configuration files
- do not recursively parse dependency directories
- do not traverse ignored/generated/vendor directories unnecessarily

The analyzer should focus on repository structure and operational guidance, not full semantic code analysis.

## Filesystem behavior

By default the analyzer is read-only.

It must not:

- modify files
- create files in the analyzed repository
- run install commands
- run tests
- run arbitrary repository scripts
- execute project code

It may inspect configuration files and script definitions.

## Security behavior

The analyzer must never print:

- secret values
- full environment files
- private key contents
- token values

If suspicious or sensitive configuration is detected, report only the type and location needed to explain the finding.

## Symlinks

Avoid traversing symlink cycles.

Do not follow repository-external symlinks by default.

## Error handling

Examples:

### Path does not exist

Exit `1`.

### Path is unreadable

Exit `1`.

### No Git metadata

Do not fail automatically.

Report informational context and continue where possible.

### Unknown ecosystem

Continue with ecosystem-neutral checks.

## CLI flags for v0.1

Required:

```text
--format text|json
--min-score <0-100>
--version
--help
```

Optional only if implementation remains simple:

```text
--no-color
```

Do not add a large flag surface in v0.1.

## Testing requirements

Required test levels:

- unit tests for detector logic
- scoring tests
- reporter tests
- CLI integration tests
- filesystem fixture tests

Every detector should include:

- positive case
- negative case
- edge case

Important behavior must be tested with repository fixtures rather than excessive mocking.

## Definition of done

`0.1.0` is ready when:

- `npx agent-ready check` works
- text output is readable
- JSON output is stable enough for CI
- threshold mode works
- scoring is deterministic
- required detectors are implemented
- no LLM/API dependency exists
- tests pass on supported CI runtime
- package can be installed and executed cleanly
- README includes real output
- documentation matches implementation
