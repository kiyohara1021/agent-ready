# Scoring Model

## Purpose

The Agent Readiness Score is a transparent heuristic for repository preparedness.

It is not a guarantee that coding agents will produce correct code.

The score should reward repository characteristics that reduce ambiguity, improve validation, and make safe modification easier.

## Principles

The scoring system must be:

- deterministic
- documented
- explainable
- reasonably ecosystem-neutral
- resistant to trivial score gaming
- based on observable repository evidence

A file existing is not always enough. Where practical, detectors should verify useful signals inside the file.

## Score range

Overall score:

```text
0–100
```

Suggested interpretation:

```text
90–100  Excellent
75–89   Good
60–74   Fair
40–59   Needs improvement
0–39    Poor
```

Do not present these labels as scientific measurements.

## Categories

### Instructions — 30 points

#### `instructions.agents-md` — 10

Goal: coding-agent-specific guidance is discoverable.

Suggested scoring:

```text
AGENTS.md exists                              +3
contains development/setup guidance          +2
contains test/validation guidance             +2
contains project-specific constraints         +2
contains useful scoped/nested guidance        +1
```

Do not grant full points to an empty or boilerplate-only file.

#### `instructions.setup` — 5

Repository explains how a developer or agent can prepare the project.

Signals may include:

- installation command
- runtime requirement
- dependency setup
- local environment setup

#### `instructions.tests` — 5

A developer can determine how to run the relevant tests.

#### `instructions.quality` — 5

Lint, format, type-check, static-analysis, or equivalent validation guidance is documented.

#### `instructions.architecture` — 5

A useful high-level system or repository map exists.

Examples:

- `docs/architecture.md`
- architecture section in README
- ADR index
- concise module ownership explanation

### Automation — 25 points

#### `automation.tests` — 5

A runnable test command can be inferred from known project metadata or build files.

#### `automation.lint` — 5

A lint/format/static-quality command can be inferred.

#### `automation.typecheck` — 5

A type-check or static-analysis command can be inferred where the ecosystem reasonably supports one.

The detector must avoid unfairly penalizing ecosystems where a separate type-check command is not conventional.

#### `automation.ci` — 5

CI is present and appears to validate code.

Presence alone may earn partial credit.

Higher confidence requires evidence of test/build/lint execution.

#### `automation.dependencies` — 5

Dependency update or dependency risk automation is configured.

Examples:

- Dependabot
- Renovate
- ecosystem-equivalent automation

### Repository Context — 25 points

#### `context.readme` — 5

README exists and has useful project description/setup information.

#### `context.architecture` — 5

Architecture or design context is discoverable.

This overlaps conceptually with instructions but measures repository context rather than agent-specific guidance.

Avoid double-counting identical evidence where possible.

#### `context.metadata` — 5

Project identity and important metadata are clear.

Signals may include:

- package description
- license
- repository URL
- supported runtime
- meaningful project name

#### `context.ignore` — 5

Ignore configuration makes irrelevant repository content easier to avoid.

Signals:

- `.gitignore`
- ecosystem ignores
- AI-specific ignore files where relevant

#### `context.generated` — 5

Generated/vendor/build content is clearly separated or excluded.

Examples:

- `node_modules`
- `vendor`
- `.venv`
- `dist`
- `.next`
- `.nuxt`
- `.dart_tool`
- build output
- generated clients

### Safety — 20 points

#### `safety.gitignore` — 5

Basic local/sensitive artifacts are excluded.

#### `safety.secrets` — 5

Common secret-bearing files are excluded or appropriately templated.

Positive examples:

- `.env` ignored
- `.env.example` committed
- private keys excluded

The detector must never print actual secrets.

#### `safety.security-policy` — 5

`SECURITY.md` or equivalent responsible disclosure/security policy exists.

#### `safety.lockfile` — 5

A dependency lockfile exists when conventional for the detected ecosystem.

For repositories without applicable dependency management, mark as neutral rather than automatically failing.

## Finding statuses

### Pass

Evidence strongly satisfies the detector.

### Warning

Partial or ambiguous readiness.

Examples:

- README exists but setup instructions are unclear
- CI exists but no test step is detected

### Fail

Important expected evidence is absent.

### Info

Useful observation that should not directly reduce score.

## Recommendation priority

Suggested mapping:

```text
high
medium
low
```

High-priority examples:

- no test command
- no setup instructions
- committed secret-risk configuration
- no usable project entry documentation

Medium:

- no architecture overview
- incomplete AGENTS.md

Low:

- no SECURITY.md for a small personal sample project
- optional metadata improvements

Priority should consider context and not merely point weight.

## Avoiding score gaming

The scorer should not blindly reward filenames.

Examples:

Bad:

```text
AGENTS.md exists → full 10 points
```

Better:

```text
AGENTS.md exists                           3
contains actual project instructions       2
contains test guidance                     2
contains constraints                       2
scoped guidance                            1
```

Similarly, a CI file that contains no meaningful validation should not receive full CI points.

## Multi-project repositories

Monorepos require care.

v0.1 may score repository-level readiness primarily while detecting obvious workspace structure.

Future versions may introduce:

- root score
- package/workspace sub-scores
- scoped `AGENTS.md` evaluation

Do not pretend monorepo support is more precise than implemented.

## Missing-applicability behavior

A detector may be:

- applicable
- not applicable
- unknown applicability

A not-applicable check should not unfairly reduce the score.

If category maximums need normalization because of non-applicable checks, normalization must be deterministic and documented.

## Score calculation

Preferred model:

```text
sum(earned applicable points)
-------------------------------- × 100
sum(max applicable points)
```

Round to nearest integer.

If all standard checks are applicable, the denominator is 100.

## Stability

Scoring changes can materially affect CI.

Therefore:

- detector weight changes require documentation
- JSON schema version and tool version must be emitted
- significant score-model changes should be noted in release notes
- avoid changing weights casually in patch releases

## Validation fixtures

Maintain reference fixtures with expected score ranges.

Examples:

- minimal empty repository
- typical healthy Node project
- healthy Laravel project
- Python package
- repository with strong docs but no CI
- repository with CI but poor instructions
- monorepo fixture

Exact scores may change before 1.0, but regression intent should be explicit.
