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
│   ├── ecosystems.ts
│   ├── scripts.ts
│   └── ignores.ts
│
├── detectors/
│   ├── instructions/
│   │   ├── agents-md.ts
│   │   ├── setup.ts
│   │   ├── tests.ts
│   │   └── architecture.ts
│   ├── automation/
│   │   ├── tests.ts
│   │   ├── lint.ts
│   │   ├── typecheck.ts
│   │   ├── ci.ts
│   │   └── dependencies.ts
│   ├── context/
│   │   ├── readme.ts
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

Discovery should do the expensive/common filesystem work once where possible.

This prevents each detector from independently rescanning the repository.

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
  testCommandDetector,
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
