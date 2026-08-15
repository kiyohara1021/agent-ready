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

## What counts as "documented"

Several detectors distinguish a command that documentation tells a reader to
run from words that merely appear in prose.

A command is documented when it appears in a fenced code block or an inline code
span in one of the discovered documents:

```text
AGENTS.md (root and nested)
README / CONTRIBUTING / DEVELOPMENT / INSTALL / SETUP
docs/, doc/, .github/ documentation files
```

"Install the dependencies with npm install" is prose and is not a documented
command. A `npm install` code block is.

Nested `AGENTS.md` files are evidence that scoped instructions exist, which is
what `instructions.agents-md` scores them for. They are not repository-wide
guidance, so `instructions.setup`, `instructions.tests`,
`instructions.quality`, and `instructions.architecture` ignore them. Otherwise a
vendored, example, or fixture project inside the repository could answer
questions about the repository itself.

Command recognition is ecosystem-neutral and matches normalized command
segments, so `uv run pytest`, `./vendor/bin/phpstan analyse`, and
`npm ci && npm test` all resolve correctly, while `color: black;` in a CSS
example does not resolve to the Black formatter.

## What counts as "discoverable"

The Automation detectors ask a different question from the Instructions
detectors: not whether documentation explains a command, but whether one can be
inferred from the repository's own metadata. An entry point is discoverable when
it comes from any of:

```text
script      a manifest script or task-runner target
            (package.json, composer.json, Makefile, justfile)
config      test runner or analyzer configuration
            (phpunit.xml, pytest.ini, tox.ini, vitest.config.*, eslint.config.*,
             phpstan.neon, mypy.ini, [tool.*] sections in pyproject.toml, …)
manifest    a command the ecosystem provides without configuration
            (cargo test, go test ./..., mvn test, ./gradlew test, …)
workflow    a command a CI workflow runs
```

A `manifest` entry point is weaker than the others, because the command exists
whether or not the project intends it. Conventional test commands therefore
count only when the repository actually contains tests, and conventional lint
commands (`go vet`, `cargo clippy`, `dart analyze`) never earn full credit on
their own — see `automation.lint`.

Scaffolding placeholders are not entry points. `npm init`'s default
`"test": "echo \"Error: no test specified\" && exit 1"` is a script whose only
job is to fail, and it is ignored.

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

A file that names no concrete command and holds less than roughly 200 characters
of non-whitespace content is treated as a stub: it earns existence credit only.
A short file that does name real commands is concise, not boilerplate, and is
scored normally.

A file passes only when it exists and carries at least two kinds of real
guidance.

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

### Partial scoring signals

- documented install/dependency command
- documented runtime/toolchain requirement, including pinned version files such
  as `.nvmrc`, `.tool-versions`, or `.python-version`
- documented command to run the project locally

### Warning

Setup is implied but not clearly documented.

A dependency manifest or a `setup`/`bootstrap` script is enough to imply setup.

### Fail

No practical setup guidance can be found.

---

## `instructions.tests`

### Why it matters

Agents should validate changes before proposing them.

### Evidence

Documentation referencing tests or known test commands.

### Partial scoring signals

- documented test command
- dedicated testing section in the document that documents the command
- guidance on when or how to run the tests, such as running them before
  submitting a change, coverage, or filtering to a single test

### Pass

A clear test command is documented.

### Warning

Tests exist but usage is unclear.

A test suite in the repository or a discovered test script is enough to show
tests exist.

### Fail

No test guidance and no test suite.

---

## `instructions.quality`

### Why it matters

Linting, formatting, type checking, and static analysis catch changes that tests may miss.

### Evidence

Documentation plus discovered scripts and tool configuration.

### Partial scoring signals

- documented lint/format/type-check command
- a matching script or tool configuration in the repository
- a dedicated quality/validation section around the command

### Pass

At least one relevant quality command is documented and discoverable.

### Warning

Command exists but is undocumented.

### Fail

No quality validation can be found where one is expected.

### Not applicable

The repository contains no source files and no project manifest. A
documentation-only repository is not expected to document lint or type-check
validation, so the check is excluded from the score rather than failed.

### False-positive considerations

Commands that cover both linting and type analysis in their ecosystem — such as
`dart analyze` or `go vet` — count for both. Ecosystems without a separate
type-check step must not be penalized for lacking one.

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

### Partial scoring signals

- a substantial architecture/design document, or an architecture section with
  real content behind the heading
- a directory/module map, drawn as a tree or introduced by a structure heading
- an ADR index, or more than one design document

### Pass

A concise high-level map exists.

### Warning

Architecture is partially documented.

A heading with nothing behind it, or a stub document, is a warning rather than a
pass.

### Fail

No high-level guidance.

### Note on overlap

`context.architecture` measures the same documentation as repository context
rather than as agent guidance. The two detectors read the same files; keep their
scoring rationale distinct rather than double-counting the same conclusion.

---

## `automation.tests`

### Why it matters

An agent that cannot run the tests cannot check its own work. This detector asks
only whether a command is discoverable, not whether documentation explains it;
`instructions.tests` scores the documentation.

### Evidence by ecosystem

Node:

```text
package.json scripts.test
vitest.config.*, jest.config.*, playwright.config.*, cypress.config.*
```

Composer:

```text
composer.json scripts
phpunit.xml, phpunit.xml.dist, Pest.php
```

Python:

```text
pyproject.toml [tool.pytest.ini_options], [tool.tox]
pytest.ini
tox.ini
noxfile.py
setup.cfg [tool:pytest]
Makefile
```

Rust:

```text
Cargo.toml            (cargo test, when tests exist)
CI references to cargo test
```

Go:

```text
go.mod                (go test ./..., when tests exist)
CI or Makefile references to go test
```

Flutter, Swift, Elixir, Java, .NET:

```text
pubspec.yaml, Package.swift, mix.exs, pom.xml, build.gradle*, *.csproj
CI references to the ecosystem test command
```

### Partial scoring signals

- a test entry point is discoverable
- a test suite exists in the repository
- CI runs the tests

### Pass

A reliable test entry point is discoverable.

### Warning

Testing ecosystem exists but no clear command is detected.

A repository that contains tests, or a manifest for an ecosystem that could run
them, is warned rather than failed.

### Fail

No entry point, no test suite, and no testable ecosystem manifest.

### Not applicable

Repository clearly contains no executable/testable software.

### False-positive considerations

An ecosystem's built-in runner counts only when the repository actually contains
tests, and scaffolding placeholder scripts are ignored.

---

## `automation.lint`

### Why it matters

Linting and formatting reject changes that tests accept, and an agent should be
able to run them without being told how.

### Evidence

Lint scripts and task-runner targets, checked-in linter configuration, and lint
steps in CI. Recognized tooling includes:

```text
eslint
biome
prettier
pint
php-cs-fixer
phpcs
ruff
flake8
black
golangci-lint
clippy
rustfmt
rubocop
swiftlint
detekt
dart analyze
```

### Partial scoring signals

- a lint entry point is discoverable
- it is backed by checked-in tool configuration
- CI runs it

### Pass

A lint or format command can be inferred.

### Warning

The ecosystem ships a static check that works without configuration —
`go vet ./...`, `cargo clippy`, `dart analyze` — but nothing in the repository
runs it. The capability exists; it is simply not wired up.

### Fail

No lint script, linter configuration, or CI lint step, in an ecosystem with no
built-in check.

### Not applicable

The repository contains no source files and no project manifest.

---

## `automation.typecheck`

### Why it matters

Static analysis rejects whole classes of broken change before a test suite runs.

### Evidence

Type-check scripts, checked-in analyzer configuration, and CI steps:

```text
tsc
vue-tsc
svelte-check
phpstan
larastan
psalm
mypy
pyright
dart analyze
go vet
```

### Partial scoring signals

- a type-check entry point is discoverable
- it is backed by checked-in analyzer configuration
- CI runs it

### Pass

A type-check or static-analysis command can be inferred.

### Fail

The ecosystem conventionally has a separate type-check step, but none is
configured.

### Not applicable

The ecosystem has no conventional type-check step beyond compiling. A separate
step is expected only for PHP, Python, and TypeScript — a repository is treated
as TypeScript when it has a `tsconfig.json` or `.ts`/`.tsx` sources. Go, Rust,
Ruby, Swift, Java, .NET, Elixir, and plain JavaScript repositories are excluded
from the score rather than failed.

Commands that cover both linting and type analysis in their ecosystem — such as
`dart analyze` or `go vet` — count for both, so an ecosystem that has one makes
the check applicable again.

---

## `automation.ci`

### Why it matters

CI is the shared definition of "this change is acceptable", and an agent's work
is judged by it.

### Initial support

GitHub Actions:

```text
.github/workflows/*.yml
.github/workflows/*.yaml
```

### Partial scoring signals

- a workflow exists
- a test step runs
- a lint, type-check, or build step runs

A build shares the third point with static analysis rather than earning one of
its own, so a library with nothing to build can still reach full marks.

### Pass

CI exists and evidence suggests meaningful validation.

### Warning

Workflow files exist but validation is unclear, or CI is configured through a
system whose files are recognized but not parsed:

```text
.gitlab-ci.yml
.circleci/config.yml
azure-pipelines.yml
Jenkinsfile
.travis.yml
bitbucket-pipelines.yml
.drone.yml
.woodpecker.yml
```

Presence earns partial credit; no claim is made about what those files run.

### Fail

No CI detected.

### Not applicable

The repository contains no source files and no project manifest, so there is
nothing for CI to validate.

### Heuristics

`run:` steps are collected — both inline and block-scalar form — and classified
with the same command catalog the rest of discovery uses. Known command
references include:

```text
test
lint
typecheck
analyse
check
build
```

A short list of actions that perform validation themselves, such as
`golangci/golangci-lint-action`, is also recognized.

There is no YAML object model, no expression evaluation, and no shell
interpreter. Step names are prose and are never treated as evidence: a step
called "Run the tests" that delegates to an opaque script reads as uncertain,
which is a warning, not a failure.

---

## `automation.dependencies`

### Why it matters

Dependency drift becomes security work and broken builds, and it is not
something a coding agent can discover on its own.

### Evidence

```text
.github/dependabot.yml
.github/dependabot.yaml
renovate.json
renovate.json5
.renovaterc
.renovaterc.json
.renovaterc.json5
.github/renovate.json
.github/renovate.json5
.gitlab/renovate.json
package.json          "renovate" key
.github/workflows/*   renovatebot/github-action
```

### Partial scoring signals

- dependency update automation is configured
- it covers a package ecosystem the repository actually uses
- it covers CI workflow/action versions

Dependabot declares each update target explicitly, so coverage is read from its
`package-ecosystem` entries and matched against the detected ecosystems.
Renovate enables every manager it detects, including GitHub Actions, so a
Renovate configuration is credited with both coverage points without parsing it
further.

### Pass

Dependency update automation is configured.

### Warning

A configuration file exists but declares no update targets, so nothing is
actually kept up to date.

### Fail

No dependency automation.

### Not applicable

No dependency manifest and no CI workflow, so there is nothing to keep up to
date.

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
