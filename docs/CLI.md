# CLI Specification

## Design goal

The CLI must be understandable without reading documentation.

The primary experience is:

```bash
npx agent-ready check
```

Avoid command proliferation.

## Command

### `check`

```bash
agent-ready check [path]
```

Examples:

```bash
agent-ready check
agent-ready check .
agent-ready check ../api
agent-ready check --format json
agent-ready check --min-score 80
```

## Default text output

Example:

```text
agent-ready 0.1.0

Agent Readiness: 78 / 100 — Good

Instructions                     24 / 30
✓ AGENTS.md detected
✓ Test instructions detected
△ Architecture guidance is missing

Automation                       21 / 25
✓ Test command detected
✓ Lint command detected
✓ CI workflow detected
△ Dependency update automation not detected

Repository Context               18 / 25
✓ README detected
△ Architecture documentation is limited

Safety                           15 / 20
✓ .gitignore detected
△ SECURITY.md is missing

Recommendations

1. [high] Add a concise architecture overview.
2. [medium] Add dependency update automation.
3. [low] Add SECURITY.md.

Score: 78/100
```

Exact visual formatting may evolve, but the information hierarchy should remain:

1. overall score
2. categories
3. findings
4. recommendations

## Output rules

- no spinner in non-interactive output
- no progress animation required
- do not depend on Unicode color only
- support terminals without color
- avoid excessive ASCII decoration
- keep output screenshot-friendly
- recommendation text should fit typical terminal widths reasonably

## Flags

### `--format`

```bash
agent-ready check --format text
agent-ready check --format json
```

Default:

```text
text
```

Invalid values must fail with exit code `1`.

### `--min-score`

```bash
agent-ready check --min-score 80
```

Accepted range:

```text
0–100
```

If actual score is lower:

- output full report
- exit with code `2`

### `--help`

Standard help.

Example:

```text
Usage:
  agent-ready check [path] [options]

Options:
  --format <text|json>   Output format
  --min-score <number>   Fail with exit code 2 below this score
  --help                 Show help
  --version              Show version
```

### `--version`

Print only version or conventional CLI version output.

## JSON mode

JSON mode must:

- emit valid JSON to stdout
- emit no ANSI sequences
- emit no decorative text
- keep errors on stderr
- include schema version
- include tool version

Example:

```bash
agent-ready check --format json | jq '.score'
```

must work.

## Stdout and stderr

### stdout

Successful analysis result.

### stderr

- invalid arguments
- unreadable path
- runtime errors
- warnings that are about the tool itself rather than repository readiness

Repository findings belong in the report, not stderr.

## Exit codes

```text
0 success
1 runtime or invocation error
2 readiness threshold not met
```

Examples:

```bash
agent-ready check
echo $?
# 0
```

```bash
agent-ready check --min-score 90
echo $?
# 2 when score is 78
```

## Path handling

The displayed path should be concise and not leak unnecessary machine-specific details in normal output.

JSON may include a normalized path, but avoid surprising exposure of home-directory data if a relative representation is sufficient.

## Non-Git directory

`agent-ready` should still analyze a directory without `.git`.

Example finding:

```text
• Git repository metadata not detected.
```

This should not be an internal error.

## Empty repository

Return a valid low readiness score rather than crashing.

## Color

Color is optional.

If used:

- pass can be visually distinct
- warning can be visually distinct
- fail can be visually distinct
- symbols and text must still communicate status without color

Honor common non-color environments if straightforward.

## Future commands

Possible but not part of v0.1:

```bash
agent-ready explain <finding-id>
agent-ready init
agent-ready check --agent codex
agent-ready check --agent claude
agent-ready check --agent cursor
```

Do not implement these in the initial release unless the product specification is changed.

## GitHub Actions future UX

The CLI should already be usable in Actions:

```yaml
- run: npx agent-ready check --min-score 80
```

This is why threshold mode and deterministic output are v0.1 requirements.

## UX anti-patterns

Avoid:

- dozens of flags
- interactive prompts during `check`
- mandatory login
- mandatory network calls
- auto-fixing without explicit command
- unexplained scores
- generic messages such as "Improve your repository"
- dumping raw config files
