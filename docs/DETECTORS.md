# Detector Specification

## Purpose

Detectors turn repository evidence into structured readiness findings.

Each detector should answer one narrow question.

## Detector contract

Illustrative API:

```ts
interface Detector {
  id: string;
  category: CategoryId;
  analyze(context: RepositoryContext): Promise<Finding>;
}
```

Every detector must document:

- why the check matters
- what evidence it uses
- pass behavior
- warning behavior
- fail behavior
- not-applicable behavior
- false-positive considerations
- tests

## General rules

Detectors must:

- be deterministic
- avoid executing target repository code
- avoid network requests
- avoid printing secrets
- use stable finding ids
- return evidence where useful
- be independently testable

Detectors should not:

- render terminal strings
- mutate global score
- read unrelated files
- perform broad semantic code review
- use an LLM

# Initial detectors

## `instructions.agents-md`

### Why it matters

Coding-agent-specific instructions reduce ambiguity around repository conventions and validation.

### Evidence

Search:

```text
AGENTS.md
**/AGENTS.md
```

### Pass

Root `AGENTS.md` exists and contains useful project-specific guidance.

### Partial scoring signals

- root file exists
- development/setup guidance exists
- test guidance exists
- constraints exist
- scoped nested instructions exist

### Warning

Examples:

- file exists but is nearly empty
- only generic boilerplate
- no test instructions
- nested instructions exist but root context is missing

### Fail

No `AGENTS.md`.

### False-positive considerations

Do not assume length equals quality.

Keyword detection should be conservative.

---

## `instructions.setup`

### Why it matters

An agent must know how dependencies and local development are prepared.

### Evidence

Potential sources:

- README
- AGENTS.md
- CONTRIBUTING.md
- project docs
- package scripts
- Makefile targets

### Pass

Clear setup path is documented.

Examples:

```text
npm ci
composer install
uv sync
cargo build
flutter pub get
```

### Warning

Setup is implied but not clearly documented.

### Fail

No practical setup guidance can be found.

---

## `instructions.tests`

### Why it matters

Agents should validate changes before proposing them.

### Evidence

Documentation referencing tests or known test commands.

### Pass

A clear test command is documented.

### Warning

Tests exist but usage is unclear.

### Fail

No test guidance.

---

## `instructions.quality`

### Why it matters

Linting, formatting, type checking, and static analysis catch changes that tests may miss.

### Evidence

Documentation plus discovered scripts.

### Pass

At least one relevant quality command is documented and discoverable.

### Warning

Command exists but is undocumented.

### Fail

No quality validation can be found where one is expected.

---

## `instructions.architecture`

### Why it matters

A coding agent benefits from knowing module boundaries and system responsibilities before making changes.

### Evidence

- architecture section in README
- `docs/architecture.md`
- `docs/design.md`
- ADR index
- AGENTS.md architecture/module guidance

### Pass

A concise high-level map exists.

### Warning

Architecture is partially documented.

### Fail

No high-level guidance.

---

## `automation.tests`

### Evidence by ecosystem

Node:

```text
package.json scripts.test
```

Composer:

```text
composer.json scripts
```

Python:

```text
pyproject.toml
tox.ini
noxfile.py
Makefile
```

Rust:

```text
Cargo.toml
CI references to cargo test
```

Go:

```text
go.mod
CI or Makefile references to go test
```

Flutter:

```text
pubspec.yaml
CI references to flutter test
```

### Pass

A reliable test entry point is discoverable.

### Warning

Testing ecosystem exists but no clear command is detected.

### Not applicable

Repository clearly contains no executable/testable software.

---

## `automation.lint`

Potential signals:

```text
eslint
biome
pint
php-cs-fixer
ruff
flake8
golangci-lint
clippy
swiftlint
dart analyze
```

Scoring should account for ecosystem conventions.

---

## `automation.typecheck`

Potential signals:

```text
tsc
vue-tsc
phpstan
larastan
mypy
pyright
cargo check
dart analyze
```

Do not require a separate type-check command in ecosystems where it is not meaningful.

---

## `automation.ci`

### Initial support

GitHub Actions:

```text
.github/workflows/*.yml
.github/workflows/*.yaml
```

### Pass

CI exists and evidence suggests meaningful validation.

### Warning

Workflow files exist but validation is unclear.

### Fail

No CI detected.

### Heuristics

Look for known command references such as:

```text
test
lint
typecheck
analyse
check
build
```

Do not attempt a full shell interpreter.

---

## `automation.dependencies`

Detect:

```text
.github/dependabot.yml
.github/dependabot.yaml
renovate.json
renovate.json5
```

Additional ecosystem tooling may be added later.

---

## `context.readme`

### Pass

README exists and has meaningful project description.

Additional credit may come from:

- setup section
- usage section
- development section

### Warning

README exists but is minimal.

### Fail

No README.

---

## `context.architecture`

This detector measures discoverable architecture documentation as repository context.

Potential filenames:

```text
ARCHITECTURE.md
docs/ARCHITECTURE.md
docs/architecture.md
docs/design.md
docs/system-design.md
docs/adr/
```

Do not rely only on exact filenames; README headings may also qualify.

---

## `context.metadata`

Potential evidence:

- meaningful package description
- repository URL
- license
- runtime/engine constraints
- project name

A missing npm description should not penalize a non-Node project.

---

## `context.ignore`

Evidence:

```text
.gitignore
.agentignore
.cursorignore
.aiderignore
```

v0.1 should prioritize `.gitignore`.

AI-specific ignore files may be informational initially.

---

## `context.generated`

Detect whether common generated/dependency directories are excluded or clearly separated.

Examples:

```text
node_modules
vendor
.venv
dist
build
coverage
.next
.nuxt
.dart_tool
target
DerivedData
```

A directory existing is not automatically a failure.

The concern is whether irrelevant generated content is likely to pollute repository context.

---

## `safety.gitignore`

### Pass

`.gitignore` exists and contains sensible exclusions for detected ecosystems.

### Warning

File exists but omits obvious local artifacts.

### Fail

No `.gitignore` for a repository where local/generated files are likely.

---

## `safety.secrets`

### Goal

Detect unsafe repository configuration without becoming a secret-scanning product.

### Signals

Check ignore rules for common secret-bearing paths:

```text
.env
.env.*
*.pem
*.key
credentials
service-account*.json
```

Safe template exceptions:

```text
.env.example
.env.sample
```

### Critical rule

Never display secret contents.

Do not implement broad entropy-based secret scanning in v0.1.

---

## `safety.security-policy`

Evidence:

```text
SECURITY.md
.github/SECURITY.md
docs/SECURITY.md
```

### Warning versus fail

For a personal sample project, this may be a low-priority warning rather than a severe failure.

The score weight remains documented, but recommendation priority may vary.

---

## `safety.lockfile`

Detect ecosystem-appropriate lockfiles.

Examples:

```text
package-lock.json
pnpm-lock.yaml
yarn.lock
bun.lock
bun.lockb
composer.lock
uv.lock
poetry.lock
Pipfile.lock
Cargo.lock
Gemfile.lock
pubspec.lock
Package.resolved
```

### Applicability

Do not penalize a repository with no applicable dependency management.

## Detector test template

For every detector:

```text
positive
negative
edge
not-applicable when relevant
```

Prefer fixture repositories.

Example:

```text
test/fixtures/node-healthy/
test/fixtures/node-no-tests/
test/fixtures/php-healthy/
test/fixtures/python-minimal/
```

## Adding a detector

A contributor should:

1. choose a stable id
2. document the rationale here
3. implement the detector
4. add unit/fixture tests
5. update scoring if points change
6. update release notes if behavior materially affects scores

New detectors should not silently change the 100-point model without an explicit scoring decision.
