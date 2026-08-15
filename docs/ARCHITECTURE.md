# Architecture

## Overview

`agent-ready` is a read-only repository analyzer.

Core flow:

```text
CLI
 ↓
Repository discovery
 ↓
RepositoryContext
 ↓
Detectors
 ↓
Findings
 ↓
Scoring
 ↓
Reporters
 ↓
Terminal / JSON
```

Detection, scoring, and rendering must remain separated.

## Proposed structure

```text
src/
├── cli/
│   ├── index.ts
│   ├── check.ts
│   └── options.ts
│
├── core/
│   ├── analyze.ts
│   ├── repository-context.ts
│   ├── score.ts
│   ├── recommendations.ts
│   └── types.ts
│
├── discovery/
│   ├── filesystem.ts
│   ├── markdown.ts
│   ├── documentation.ts
│   ├── commands.ts
│   ├── ecosystems.ts
│   ├── scripts.ts
│   ├── tooling.ts
│   ├── entry-points.ts
│   ├── workflows.ts
│   ├── dependency-automation.ts
│   ├── architecture.ts
│   ├── ignores.ts
│   ├── generated.ts
│   ├── project-metadata.ts
│   ├── lockfiles.ts
│   ├── secret-paths.ts
│   └── cache.ts
│
├── detectors/
│   ├── instructions/
│   │   ├── agents-md.ts
│   │   ├── setup.ts
│   │   ├── tests.ts
│   │   ├── quality.ts
│   │   └── architecture.ts
│   ├── automation/
│   │   ├── tests.ts
│   │   ├── lint.ts
│   │   ├── typecheck.ts
│   │   ├── ci.ts
│   │   └── dependencies.ts
│   ├── context/
│   │   ├── readme.ts
│   │   ├── architecture.ts
│   │   ├── metadata.ts
│   │   ├── ignore.ts
│   │   └── generated.ts
│   └── safety/
│       ├── gitignore.ts
│       ├── secrets.ts
│       ├── security-policy.ts
│       └── lockfile.ts
│
├── reporters/
│   ├── text.ts
│   └── json.ts
│
└── index.ts
```

Tests:

```text
test/
├── unit/
├── integration/
├── fixtures/
└── cli/
```

## Core types

Illustrative types:

```ts
export type FindingStatus =
  | "pass"
  | "warning"
  | "fail"
  | "info";

export type CategoryId =
  | "instructions"
  | "automation"
  | "context"
  | "safety";

export interface Finding {
  id: string;
  category: CategoryId;
  status: FindingStatus;
  title: string;
  message: string;
  score: number;
  maxScore: number;
  applicable: boolean;
  recommendation?: Recommendation;
  evidence?: Evidence[];
}

export interface Recommendation {
  priority: "high" | "medium" | "low";
  message: string;
}

export interface Evidence {
  kind: "file" | "script" | "workflow" | "config";
  path?: string;
  label: string;
}
```

Do not expose secret values in evidence.

## Detector contract

```ts
export interface Detector {
  id: string;
  category: CategoryId;
  analyze(context: RepositoryContext): Promise<Finding>;
}
```

Rules:

- detector reads only from `RepositoryContext`
- detector does not render terminal output
- detector does not mutate score globally
- detector does not modify the filesystem
- detector should be individually testable
- detector should avoid executing repository code

## RepositoryContext

`RepositoryContext` is the normalized input for detectors.

It may contain:

```ts
export interface RepositoryContext {
  root: string;
  files: RepositoryFileIndex;
  ecosystems: EcosystemInfo[];
  scripts: ScriptIndex;
  workflows: WorkflowInfo[];
  ignoreRules: IgnoreInfo;
  metadata: RepositoryMetadata;
}
```

As implemented, the context holds the file index, the repository metadata, the
directories indexing skipped, and a bounded reader; everything derived from them
is memoized discovery rather than an eager field. Skipped directories are part of
the context because they cannot be recovered from the index: `node_modules` is
present in the working tree and absent from `files`, and `context.generated`
needs to know the difference.

Discovery should do the expensive/common filesystem work once where possible.

This prevents each detector from independently rescanning the repository.

Derived discovery — documentation, scripts, ecosystems, tooling — is memoized
per `RepositoryContext` (`discovery/cache.ts`), so several detectors asking the
same question do the work once. The cache lives exactly as long as the analysis
and is never shared between repositories.

## File indexing

Do not eagerly load all source contents.

Prefer:

- filenames
- paths
- selected known config files
- small documentation files
- parsed metadata

Known large/generated directories should be skipped early.

Examples:

```text
.git
node_modules
vendor
.venv
dist
build
.next
.nuxt
.dart_tool
coverage
target
DerivedData
```

Exact behavior should respect ecosystem conventions and ignore files.

## Ignore rules

`discovery/ignores.ts` parses `.gitignore` — root and nested — alongside
agent-specific files (`.agentignore`, `.cursorignore`, `.aiderignore`, …) and
tool ignore files, and answers one question for the detectors that need it:
would these rules exclude this path?

Patterns are compiled to regular expressions supporting comments, negation,
anchoring, directory-only rules, `*`, `?`, and `**`. Character classes are
matched literally and git's "an excluded parent cannot be re-included" rule is
not implemented; over-claiming there would produce confident wrong findings.
Pattern length and count are capped, because the patterns come from an untrusted
repository.

Git exclusion is deliberately separate from the rest: only `.gitignore` decides
what is committed, so the safety detectors ask `excludes`, while `context.ignore`
asks `excludedByAny`.

## Secret-bearing paths

`discovery/secret-paths.ts` recognizes environment files, private keys, and
credential files **by filename only**. It never opens a candidate file, so no
secret value can reach a finding, a report, or a log — there is nothing to leak
because nothing is read. Templates (`.env.example` and siblings) and test-fixture
locations are marked so that detectors can tell documentation and test material
from exposure. Entropy scanning is out of scope for v0.1.

## Ecosystem detection

Detection should be evidence-based.

Examples:

```text
package.json       → node
composer.json      → php/composer
pyproject.toml     → python
Cargo.toml         → rust
go.mod             → go
Gemfile            → ruby
pubspec.yaml       → dart/flutter
Package.swift      → swift
pom.xml            → java/maven
build.gradle*      → gradle
```

A repository may have multiple ecosystems.

Do not stop after the first match.

## Script discovery

Normalize project validation commands where possible.

Examples:

Node:

```text
package.json scripts.test
package.json scripts.lint
package.json scripts.typecheck
```

Composer:

```text
composer.json scripts.test
composer.json scripts.analyse
```

Python:

```text
pyproject tool sections
tox.ini
noxfile.py
Makefile
```

Generic:

```text
Makefile
justfile
Taskfile
CI workflows
```

Script discovery reports evidence; it does not execute commands.

## Entry point discovery

`discovery/entry-points.ts` answers the Automation detectors' question — "can a
validation command be inferred?" — by combining four sources into one ordered
list:

```text
script      manifest scripts and task-runner targets
config      test runner and analyzer configuration
manifest    commands an ecosystem provides without configuration
workflow    commands a CI workflow runs
```

Ordering is by source and then by table order, never by traversal order.
Conventional (`manifest`) test commands count only when the repository contains
tests, which keeps `cargo test` from being credited to a crate with no tests.

Configuration is parsed as inert data. Target repository JavaScript and
TypeScript configuration is matched by filename only; it is never imported,
required, or evaluated.

## Workflow analysis

v0.1 primarily supports GitHub Actions:

```text
.github/workflows/*.yml
.github/workflows/*.yaml
```

Extract useful high-level signals:

- workflow exists
- test command likely runs
- lint/static-analysis likely runs
- build likely runs
- dependency/security automation exists

Avoid implementing a complete shell parser.

Use conservative heuristics and report uncertainty as warnings.

`discovery/workflows.ts` reads `run:` steps — inline and block-scalar form — and
`uses:` references, then classifies the commands with the shared catalog. There
is no YAML object model, no expression evaluation, and no shell interpreter.
Step names are prose and are never evidence.

Configuration for other CI systems (GitLab CI, CircleCI, Jenkins, and similar)
is recognized by filename so that `automation.ci` does not report "no CI" for a
repository that plainly has some. Those files are not parsed, so presence is the
only claim made about them.

## AGENTS.md analysis

Search:

- root `AGENTS.md`
- nested `AGENTS.md`

v0.1 scoring may prioritize root-level instructions.

Nested files can contribute evidence that scoped instructions exist.

Content analysis should be lightweight and deterministic.

Useful signals:

- setup/development headings or commands
- test/validation guidance
- explicit constraints
- architecture/module guidance

Do not use LLM semantic classification.

## Scoring layer

Scoring receives findings only.

It must not:

- read files
- invoke detectors
- infer ecosystems
- render text

Responsibilities:

- determine applicable denominator
- aggregate category score
- calculate overall score
- preserve finding order deterministically
- reject findings that exceed the documented category budget
- derive and order recommendations

`core/score.ts` holds the category weights from `docs/SCORING.md` and rejects
findings whose declared points exceed them. The guard catches detector drift
rather than repository problems, so it raises `AnalysisError`.

`core/recommendations.ts` derives the recommendation list from applicable
findings that left points unearned, ordered by priority, then recoverable
points, then category and finding id. The comparator is a total order, so
neither list depends on detector completion order.

Scoring is also free of ambient inputs: no clock, no randomness, no environment
lookups. The same findings always produce the same score.

## Reporter layer

### Text reporter

Responsibilities:

- concise readable output
- no color dependency
- optional terminal coloring
- recommendations sorted by priority
- stable enough for screenshots/docs

### JSON reporter

Responsibilities:

- machine-readable schema
- stable identifiers
- no ANSI output
- include schema/tool version

## CLI layer

The CLI should be thin.

Responsibilities:

- parse arguments
- resolve path
- call analysis
- select reporter
- apply threshold exit code
- translate known errors into useful messages

Business logic should not live in command handlers.

## Error model

Prefer typed/domain errors:

```ts
RepositoryNotFoundError
RepositoryUnreadableError
InvalidOptionError
AnalysisError
```

Do not expose stack traces in normal CLI output unless debug support is intentionally added later.

## Determinism

Findings must have stable ordering.

Suggested order:

1. category order
2. detector registration order
3. finding id

Filesystem traversal order must not affect output.

## Extensibility

Community contributions should be able to add a detector without changing unrelated core logic.

Preferred detector registration:

```ts
export const detectors: Detector[] = [
  agentsMdDetector,
  setupInstructionsDetector,
  testInstructionsDetector,
  // ...
  testAutomationDetector,
  // ...
];
```

Future plugin systems are out of scope for v0.1.

## Security

The analyzer must be safe to run on untrusted repositories.

Therefore:

- do not execute repository scripts
- do not evaluate JavaScript config files through `require`
- avoid dynamic imports from the target repository
- parse text/config data directly
- do not follow external symlinks
- never echo secret values
- cap or avoid reading unexpectedly large files

## Performance

Optimize for metadata-level analysis rather than code parsing.

Potential strategies:

- index once
- bounded file reads
- skip dependency/build directories
- parallelize independent safe reads when useful
- avoid AST parsing unless a detector genuinely needs it

## Future architecture

Potential later additions:

- GitHub Action wrapper
- SARIF output
- agent-specific profiles
- workspace/monorepo sub-scores
- detector configuration file
- `init` scaffolding
- editor integrations

Do not prematurely design a plugin marketplace or cloud backend.
