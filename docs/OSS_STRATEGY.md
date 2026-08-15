# OSS and Star Strategy

## Objective

`agentworthy` is not being built only as a private utility.

The repository should be designed for public adoption and discoverability from the beginning.

Initial external goal:

```text
16 GitHub stars
```

This corresponds to the first meaningful Starstruck milestone for the maintainer, but the product must earn stars through genuine usefulness rather than artificial activity.

Secondary goal:

```text
100+ GitHub stars
```

## Positioning

Core message:

> Is your repository ready for coding agents?

One-line explanation:

> A deterministic CLI that audits how well your repository is prepared for Codex, Claude Code, Cursor, and other coding agents.

Avoid positioning it as:

- another repo-to-prompt packer
- a generic code-quality score
- an AI code reviewer
- an AGENTS.md generator
- an LLM wrapper

The differentiator is **repository readiness auditing**.

## Five-second GitHub test

A visitor opening the repository should understand the product in roughly five seconds.

README first screen should show:

1. project name
2. one-line value proposition
3. installation-free command
4. actual output screenshot or code block
5. badges only if useful

Example:

```text
# agentworthy

Is your repository ready for coding agents?

$ npx agentworthy check

Agent Readiness: 78 / 100
```

Do not start with a long architectural explanation.

## README structure

Recommended:

```text
Hero
Demo
Why
Quick start
Example output
What it checks
How scoring works
CI usage
Supported ecosystems
Comparison / positioning
Documentation
Contributing
License
```

English should be the primary README for reach.

Provide Japanese documentation as:

```text
README.ja.md
```

or an equivalent obvious link.

## Demo

A visual demo is strongly recommended.

Preferred:

- short terminal GIF
- or clean screenshot

Show:

```bash
npx agentworthy check
```

and a polished result.

The demo repository should be realistic and not obviously staged only to produce a perfect score.

## npm experience

The ideal first use is:

```bash
npx agentworthy check
```

Requirements:

- correct `bin` configuration
- package excludes development junk
- fast install
- useful package description
- repository/homepage metadata
- keywords
- license
- Node engine declaration

Potential npm keywords:

```text
coding-agent
agents
codex
claude-code
cursor
developer-tools
repository
static-analysis
cli
devex
```

Do not keyword-stuff irrelevant terms.

## GitHub repository metadata

Configure:

- concise description
- relevant topics
- project homepage if a demo/docs site exists
- MIT license unless another license is intentionally chosen

Suggested topics:

```text
coding-agents
codex
claude-code
cursor
developer-tools
static-analysis
cli
typescript
devex
agents-md
```

Use only topics that accurately describe the project.

## Launch quality bar

Before public launch:

- [x] `npx agentworthy check` works — verified from a packed tarball; see the open item below
- [ ] npm package published
- [x] macOS CI
- [x] Linux CI
- [x] Windows CI
- [x] Node.js 22/24 validated
- [x] text output polished
- [x] JSON output implemented
- [x] `--min-score` implemented
- [x] scoring documented
- [x] detectors documented
- [x] 15+ useful detector signals/checks — 19 detectors
- [x] strong fixture-based tests
- [x] lint/typecheck passing
- [x] no known dependency vulnerabilities
- [x] README in English
- [x] Japanese README or docs — `README.ja.md`
- [ ] terminal demo/GIF — placeholder in place; recording instructions in `docs/assets/README.md`
- [x] CONTRIBUTING.md
- [x] SECURITY.md
- [x] CODE_OF_CONDUCT.md
- [x] issue forms/templates
- [x] pull-request template
- [x] changelog/release notes
- [x] clear license — MIT

Remaining before the repository goes public:

1. Record the terminal demo GIF.
2. Publish `0.1.0` to npm, then confirm `npx agentworthy check` from a fresh
   environment. Until it is published, the README's `npx` instruction is
   accurate only for a locally packed tarball.
3. Set the GitHub repository description and topics.
4. Date the `0.1.0` entry in `CHANGELOG.md` when the release is tagged.

## Release strategy

### v0.1.0

Message:

> Audit coding-agent readiness in one command.

Focus only on:

- local CLI
- deterministic scoring
- core detectors
- text output
- JSON output
- CI threshold

### v0.2.x

Based on actual user feedback.

Possible additions:

- more ecosystems
- better monorepo detection
- richer explanations
- GitHub Action wrapper

### v0.3+

Potential:

- agent-specific profiles
- SARIF
- `init`
- score badges
- website

Do not publish a roadmap filled with speculative dates.

## Contribution strategy

OSS growth improves when contributions are easy.

Design detectors so contributors can add one without learning the whole codebase.

Good first issues can include:

- add ecosystem detection
- add fixture coverage
- improve detector heuristic
- add documentation examples
- add Windows edge-case coverage

Label intentionally:

```text
good first issue
help wanted
detector
ecosystem
documentation
```

Do not manufacture fake issues purely for appearance.

## Detector contribution model

A new detector contribution should usually require:

1. documented rationale
2. implementation
3. positive fixture
4. negative fixture
5. edge case
6. scoring discussion if points change

This provides a natural and reviewable contribution unit.

## Comparison section

README should directly explain the difference from adjacent tools.

Example:

| Tool | Main purpose |
|---|---|
| Repomix | Pack repository content for AI |
| Gitingest | Convert a repository into an LLM-friendly digest |
| code2prompt | Turn a codebase into prompt-ready text |
| agentworthy | Audit whether the repository is prepared for coding agents |

Do not attack competitors.

Position the project as complementary.

## Distribution channels

After a credible v0.1 exists, share selectively.

Potential channels:

- GitHub
- Hacker News / Show HN
- Reddit developer communities where self-promotion is allowed
- Dev.to
- Zenn
- Qiita
- X / Bluesky / Mastodon
- relevant Discord/Slack communities where project sharing is welcome

Each launch post should focus on the problem solved, not on asking for stars.

## Launch post angle

Strong:

> Coding agents often fail for boring reasons: no test command, no architecture map, no scoped instructions. I built a deterministic CLI that audits those gaps locally.

Weak:

> Please star my new GitHub project.

## Dogfooding

Run `agentworthy` against its own repository.

The repository should ideally maintain a high readiness score, but never distort scoring just to reach 100.

Add CI:

```bash
npx agentworthy check --min-score 85
```

after the package and self-analysis flow are stable.

Status: CI runs a `dogfood` job that audits this repository with its own build.
The threshold is currently `80` against a self-score of `86`, leaving room for
detector heuristics to tighten without a false CI failure. The threshold is a
ratchet — raise it as the repository genuinely improves. The two remaining
self-findings, dependency automation and secret-path exclusion, are real gaps
rather than scoring artifacts, and closing them is what should move the number.
Switch the command to `npx agentworthy` once the package is published.

## Public score examples

Include a few examples from representative open-source-style fixtures.

Do not publish misleading comparisons claiming that famous projects are "bad" based on a heuristic score.

## Trust

The product handles source repositories, so trust matters.

State clearly:

- local analysis
- no LLM required
- no source upload
- no mandatory telemetry
- read-only `check`

These are product features, not footnotes.

## Quality over launch speed

A broken `npx` experience can permanently hurt first impressions.

Do not launch publicly until:

```bash
npx agentworthy check
```

works cleanly from a fresh environment.

## GitHub Achievement considerations

Achievement hunting must not shape the repository into spam.

Do not:

- create meaningless PRs
- create fake contributors
- ask for stars in exchange for anything
- artificially inflate activity

It is fine to structure legitimate development into focused PRs because that is good OSS engineering practice independently of achievements.

## Development PR sequence

Recommended initial sequence:

### PR 1 — Bootstrap

- TypeScript project
- CLI entry point
- repository context
- detector interface
- tests
- lint/typecheck
- CI

### PR 2 — Instruction detectors

- AGENTS.md
- setup
- tests
- quality commands
- architecture guidance

### PR 3 — Automation detectors

- test command
- lint
- typecheck/static analysis
- CI
- dependency automation

### PR 4 — Scoring

- category weights
- applicability
- overall score
- regression fixtures

### PR 5 — Reporters

- terminal output
- JSON schema
- threshold exit code

### PR 6 — Context and safety

- README
- metadata
- ignore/generated content
- secret-risk configuration
- SECURITY.md
- lockfiles

### PR 7 — OSS release polish

- README
- demo
- npm metadata
- contributor docs
- templates
- release automation

Each PR must be independently useful and reviewable.

## Metrics to watch

Useful:

- stars
- npm downloads
- unique contributors
- external issues
- external PRs
- projects using CI threshold
- repeat releases based on user feedback

Avoid optimizing only for vanity metrics.

## Long-term moat

The moat is not the CLI wrapper.

The durable value is:

- high-quality detector heuristics
- transparent scoring
- multi-ecosystem knowledge
- community-contributed readiness checks
- trusted local-first behavior
- stable machine-readable output
- real-world examples of what makes coding agents effective
