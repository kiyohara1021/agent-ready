# agentworthy

**Is your repository ready for coding agents?**

```bash
npx agentworthy check
```

```text
Agent Readiness: 86 / 100 — Good

Instructions        26 / 30
Automation          20 / 25
Repository Context  24 / 25
Safety              16 / 20

1. [medium] Exclude environment files, private keys and credentials in .gitignore.
2. [low] Enable Dependabot or Renovate so dependency updates arrive as reviewable changes.
3. [low] Document a command to run the project locally.
```

A deterministic CLI that audits how well your repository is prepared for Codex,
Claude Code, Cursor, and other coding agents. Local, read-only, no LLM, no
account, no telemetry.

[日本語 README](README.ja.md)

## Demo

<!--
  Demo GIF placeholder. Record `npx agentworthy check` in a realistic repository
  and save it to docs/assets/demo.gif, then replace this comment with:
  ![agentworthy check](docs/assets/demo.gif)
  Recording instructions: docs/assets/README.md
-->

_Terminal GIF not recorded yet — the [example output](#example-output) below is
real, unedited output from this repository._

## Why

Coding agents fail for boring reasons far more often than hard ones: no
documented test command, no architecture map, no scoped instructions, generated
files sitting next to source.

A human joining your project works around those gaps by asking someone. An agent
cannot. It guesses — and a wrong guess becomes a wrong pull request.

`agentworthy` answers one question:

> Can a coding agent understand, validate, and safely modify this repository
> with minimal guesswork?

It does not write code, generate `AGENTS.md`, or pack your repository into a
prompt. It tells you which gaps to close, and each point is traceable to a
documented check.

## Quick start

```bash
npx agentworthy check
```

Or audit a specific path:

```bash
npx agentworthy check ../my-project
```

Requires Node.js 22 or newer. Install it if you prefer:

```bash
npm install -g agentworthy
```

Options:

```text
--format <text|json>   Output format (default: text)
--min-score <number>   Fail with exit code 2 below this score
--help                 Show help
--version              Show version
```

Exit codes: `0` passed, `1` runtime or invocation error, `2` score below
`--min-score`.

## Example output

Real output from running the tool against its own repository:

```text
agentworthy 0.1.0

Agent Readiness: 86 / 100 — Good

Instructions                                          26 / 30
  ✓ AGENTS.md provides project-specific guidance      instructions.agents-md 8/10
  ✓ Setup instructions are documented                 instructions.setup 4/5
  ✓ Test instructions are documented                  instructions.tests 5/5
  ✓ Quality instructions are documented               instructions.quality 5/5
  ✓ Architecture guidance is documented               instructions.architecture 4/5

Automation                                            20 / 25
  ✓ A test command is discoverable                    automation.tests 5/5
  ✓ A lint command is discoverable                    automation.lint 5/5
  ✓ A type-check command is discoverable              automation.typecheck 5/5
  ✓ CI validates changes                              automation.ci 5/5
  ✕ No dependency automation                          automation.dependencies 0/5

Repository Context                                    24 / 25
  ✓ README orients a reader                           context.readme 5/5
  ✓ Architecture context is discoverable              context.architecture 4/5
  ✓ Project identity is clear                         context.metadata 5/5
  ✓ Ignore rules keep irrelevant content out of view  context.ignore 5/5
  ✓ Generated content is separated                    context.generated 5/5

Safety                                                16 / 20
  ✓ Local artifacts are excluded                      safety.gitignore 5/5
  △ Some secret-bearing paths are not excluded        safety.secrets 1/5
  ✓ A security policy exists                          safety.security-policy 5/5
  ✓ Dependencies are locked                           safety.lockfile 5/5

Recommendations

1. [medium] Exclude environment files, private keys and credentials in .gitignore.
2. [low] Enable Dependabot or Renovate so dependency updates arrive as reviewable changes.
3. [low] Document a command to run the project locally.
4. [low] Add a directory map or decision records so design context is easier to follow.

Score: 86/100
```

Every finding line carries its detector id and score contribution, so you can
look up exactly why a point was awarded or withheld.

## What it checks

19 detectors across four categories.

| Category | Points | Checks |
|---|---|---|
| **Instructions** | 30 | `AGENTS.md` and whether it is actually specific; setup, test, quality, and architecture instructions |
| **Automation** | 25 | discoverable test, lint, and type-check commands; CI; dependency update automation |
| **Repository Context** | 25 | README, architecture documentation, project metadata, ignore rules, generated/vendor separation |
| **Safety** | 20 | `.gitignore`, secret and local-file exclusion, security policy, dependency lockfile |

A check that does not apply to your repository is reported as `n/a` and leaves
both the score and the maximum, rather than quietly penalizing you. Full
detector reference: [docs/DETECTORS.md](docs/DETECTORS.md).

## How scoring works

The score is a documented heuristic, not a measurement:

```text
90–100  Excellent      60–74   Fair          0–39  Poor
75–89   Good           40–59   Needs improvement
```

Three properties make it useful:

- **Deterministic** — the same repository state always produces the same score.
- **Traceable** — every point maps to a rule in [docs/SCORING.md](docs/SCORING.md).
- **Hard to game** — an empty file earns nothing. Detectors look for a real
  signal inside the file, and a documented command means one that appears in a
  code block, not a word mentioned in prose.

A high score does not guarantee that an agent will write correct code. It means
the agent has fewer reasons to guess.

## CI usage

Fail the build when readiness regresses:

```yaml
- run: npx agentworthy check --min-score 80
```

Exit code `2` means the threshold was not met; the explanation goes to stderr,
so JSON on stdout stays parseable. Treat the threshold as a ratchet — raise it
as the repository improves.

Machine-readable output for dashboards and custom gates:

```bash
npx agentworthy check --format json | jq '.score'
```

The JSON report is versioned (`schemaVersion: 1`) and includes categories,
findings, and recommendations. Evidence carries file paths and labels only —
never file contents, so secret values are never emitted. Schema:
[docs/CLI.md](docs/CLI.md).

## Supported ecosystems

Detection is evidence-based, and a repository may contain several ecosystems at
once:

Node.js · PHP / Composer · Python · Rust · Go · Ruby · Dart / Flutter · Swift ·
Java (Maven / Gradle) · .NET · Elixir · Make

Nothing in the analyzer assumes `package.json` exists. Repositories in
unrecognized ecosystems still get every ecosystem-neutral check.

## How it compares

`agentworthy` is complementary to repository-packing tools, not a replacement
for them. They prepare content *for* an agent; `agentworthy` audits the
repository the agent will work *in*.

| Tool | Main purpose |
|---|---|
| [Repomix](https://github.com/yamadashy/repomix) | Pack repository content for AI |
| [Gitingest](https://github.com/cyclotruc/gitingest) | Convert a repository into an LLM-friendly digest |
| [code2prompt](https://github.com/mufeedvh/code2prompt) | Turn a codebase into prompt-ready text |
| **agentworthy** | Audit whether the repository is prepared for coding agents |

```text
Repomix / Gitingest / code2prompt   repository → context bundle
agentworthy                         repository → readiness audit
```

Using both is reasonable: fix what the audit finds, then pack a repository that
is worth packing.

## Trust

- **Local.** Analysis happens on your machine; no source code is uploaded.
- **No LLM.** Core analysis requires no API key, model, or network call.
- **Read-only.** `check` never modifies the analyzed repository, runs its
  scripts, installs its dependencies, or executes its code.
- **No telemetry.** Nothing is collected, and there is no account to create.
- **Secret-safe.** Findings report the type and location of a risk, never the
  value.

## Documentation

- [PRODUCT.md](PRODUCT.md) — vision, goals, and explicit non-goals
- [docs/CLI.md](docs/CLI.md) — CLI and JSON schema specification
- [docs/DETECTORS.md](docs/DETECTORS.md) — what every detector checks and why
- [docs/SCORING.md](docs/SCORING.md) — the full scoring model
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — internal architecture
- [AGENTS.md](AGENTS.md) — instructions for contributors and coding agents
- [CHANGELOG.md](CHANGELOG.md) — release notes

## Contributing

Detector heuristics are the heart of this project, and they are deliberately
small enough to contribute one without learning the whole codebase. Real
repositories where the score comes out wrong are just as valuable as code.

See [CONTRIBUTING.md](CONTRIBUTING.md) to get started, and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community expectations. Security
issues go through [SECURITY.md](SECURITY.md) rather than a public issue.

```bash
npm install
npm run build
npm run lint && npm run typecheck && npm test
```

## License

[MIT](LICENSE)
