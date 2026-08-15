# CLI Specification

## Design goal

The CLI must be understandable without reading documentation.

The primary experience is:

```bash
npx agentworthy check
```

Avoid command proliferation.

## Command

### `check`

```bash
agentworthy check [path]
```

Examples:

```bash
agentworthy check
agentworthy check .
agentworthy check ../api
agentworthy check --format json
agentworthy check --min-score 80
```

## Default text output

Example:

```text
agentworthy 0.1.0

Agent Readiness: 78 / 100 — Good

Instructions                                      24 / 30
  ✓ AGENTS.md provides project-specific guidance  instructions.agents-md 8/10
  ✓ Setup instructions are documented             instructions.setup 5/5
  ✓ Test instructions are documented              instructions.tests 5/5
  ✓ Quality instructions are documented           instructions.quality 5/5
  △ Architecture guidance is thin                 instructions.architecture 1/5

Automation                                        21 / 25
  ✓ A test command is discoverable                automation.tests 5/5
  ✓ A lint command is discoverable                automation.lint 5/5
  ✓ A type-check command is discoverable          automation.typecheck 5/5
  ✓ CI validates changes                          automation.ci 5/5
  △ Dependency automation declares no updates     automation.dependencies 1/5

Repository Context                                18 / 25
  ✓ README explains the project                   context.readme 5/5
  △ Architecture documentation is limited         context.architecture 2/5
  ✓ Project metadata is complete                  context.metadata 5/5
  △ Ignore rules are partial                      context.ignore 3/5
  △ Generated output is only partly separated     context.generated 3/5

Safety                                            15 / 20
  ✓ .gitignore excludes local artifacts           safety.gitignore 5/5
  ✓ Secret-bearing files are excluded             safety.secrets 5/5
  ✕ No security policy                            safety.security-policy 0/5
  ✓ A dependency lockfile is committed            safety.lockfile 5/5

Recommendations

1. [high] Add a concise architecture overview.
2. [medium] Add dependency update automation.
3. [low] Add SECURITY.md.

Score: 78/100
```

Each finding line carries its detector id and score contribution, so every point
is traceable to a documented check in `SCORING.md`. A check that does not apply
to the repository reports `n/a` instead of a score, and is excluded from the
category total.

The label column widens to fit the longest title in the report, so
contributions stay aligned instead of wrapping unpredictably.

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
agentworthy check --format text
agentworthy check --format json
```

Default:

```text
text
```

Invalid values must fail with exit code `1`.

### `--min-score`

```bash
agentworthy check --min-score 80
```

Accepted range:

```text
0–100
```

If actual score is lower:

- output full report
- write a one-line explanation to stderr
- exit with code `2`

The explanation is about the invocation rather than the repository, so it stays
off stdout and leaves JSON output parseable:

```text
Agent readiness 78 is below the required minimum of 90.
```

Values outside `0–100`, and non-integer values, fail with exit code `1`.

### `--help`

Standard help.

Example:

```text
Usage:
  agentworthy check [path] [options]

Options:
  --format <text|json>   Output format
  --min-score <number>   Fail with exit code 2 below this score
  --help                 Show help
  --version              Show version
```

### `--version`

Print only version or conventional CLI version output.

Accepted both at the root and on `check`, matching the help text:

```bash
agentworthy --version
agentworthy check --version
```

## JSON mode

JSON mode must:

- emit valid JSON to stdout
- emit no ANSI sequences
- emit no decorative text
- keep errors on stderr
- include schema version
- include tool version

Top-level keys, in emitted order:

```text
schemaVersion   integer, currently 1
toolVersion     package version string
repository      { path }
score           0–100 integer
categories      [{ id, score, maxScore }]
findings        [{ id, category, status, title, message, score, maxScore,
                   applicable, evidence? }]
recommendations [{ findingId, priority, message }]
```

`evidence` is present only when a detector recorded any, and carries file paths
and labels rather than file contents, so secret values are never emitted.

Arrays follow the same order as the text report: categories and findings in
documented category order, recommendations in the order defined by
`SCORING.md`.

Example:

```bash
agentworthy check --format json | jq '.score'
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
- the reason an invocation exited `2`

Repository findings belong in the report, not stderr.

## Exit codes

```text
0 success
1 runtime or invocation error
2 readiness threshold not met
```

Examples:

```bash
agentworthy check
echo $?
# 0
```

```bash
agentworthy check --min-score 90
echo $?
# 2 when score is 78
```

## Path handling

The displayed path should be concise and not leak unnecessary machine-specific details in normal output.

JSON may include a normalized path, but avoid surprising exposure of home-directory data if a relative representation is sufficient.

## Non-Git directory

`agentworthy` should still analyze a directory without `.git`.

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
agentworthy explain <finding-id>
agentworthy init
agentworthy check --agent codex
agentworthy check --agent claude
agentworthy check --agent cursor
```

Do not implement these in the initial release unless the product specification is changed.

## GitHub Actions future UX

The CLI should already be usable in Actions:

```yaml
- run: npx agentworthy check --min-score 80
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
