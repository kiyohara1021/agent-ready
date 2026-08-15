# agentworthy

> Is your repository ready for coding agents?

## Product vision

`agentworthy` is a deterministic static-analysis CLI that evaluates how well a software repository is prepared for coding agents such as Codex, Claude Code, Cursor, and GitHub Copilot.

The product does not try to replace coding agents, generate code, or package an entire repository into an LLM prompt. Its role is to answer a simpler and more actionable question:

> Can a coding agent understand, validate, and safely modify this repository with minimal guesswork?

The result is an **Agent Readiness Score** plus concrete findings and recommendations.

## Problem

Coding agents are increasingly capable of implementing features and fixing bugs, but their effectiveness depends heavily on repository quality and discoverability.

Common problems include:

- no clear setup instructions
- no documented test command
- no documented lint or type-check command
- missing or incomplete `AGENTS.md`
- architecture that is hard to infer from filenames alone
- generated files mixed with source code
- secrets or local-only files not clearly excluded
- CI that exists but is hard for an agent to map to local commands
- missing contribution and security guidance
- inconsistent project metadata
- repositories whose most important operational knowledge exists only in a developer's head

Humans can often compensate for this through experience. Coding agents cannot reliably do so without additional context.

## Solution

`agentworthy` analyzes a repository locally and reports:

- an overall score from 0 to 100
- category scores
- pass / warning / fail findings
- human-readable explanations
- actionable recommendations
- machine-readable JSON output for CI and integrations

Example:

```bash
npx agentworthy check
```

```text
agentworthy 0.1.0

Agent Readiness: 78 / 100

Instructions
✓ AGENTS.md detected
✓ Test instructions detected
△ Architecture guidance is missing

Development
✓ Package manager detected
✓ Test command detected
✓ Lint command detected
✓ CI workflow detected

Safety
✓ .gitignore detected
△ SECURITY.md is missing

Recommendations

1. Add architecture documentation
   Agents need a high-level map before changing unfamiliar code.

2. Add SECURITY.md
   Document how security-sensitive changes and reports should be handled.
```

## Positioning

`agentworthy` is intentionally different from repository-to-prompt tools.

Tools such as Repomix, Gitingest, and code2prompt primarily help **package repository content for AI consumption**.

`agentworthy` evaluates **whether the repository itself is prepared for coding agents**.

The distinction is:

```text
Repomix / Gitingest / code2prompt
repository → context bundle

agentworthy
repository → readiness audit
```

## Target users

Primary:

- developers using coding agents daily
- OSS maintainers
- engineering teams introducing coding agents
- maintainers of multi-language repositories
- teams that want objective repository hygiene checks in CI

Secondary:

- consultants reviewing inherited repositories
- platform engineering teams
- developer-experience teams
- maintainers creating reusable repository templates

## Product principles

### Deterministic

The same repository state should produce the same result.

No LLM call is required for the core analysis.

### Local-first

Source code should not need to leave the user's machine.

### Explainable

Every score must be traceable to documented checks.

### Actionable

A warning without a recommended next step has limited value.

### Fast

The tool should be practical in both local development and CI.

### Ecosystem-neutral

Do not assume every repository is Node.js.

### Agent-neutral

The initial product evaluates general coding-agent readiness rather than promoting one vendor.

## Goals

- one-command audit
- zero API keys
- deterministic scoring
- useful terminal output
- stable JSON schema
- CI-friendly threshold mode
- multi-ecosystem project detection
- extensible detector architecture
- transparent scoring rules
- actionable recommendations
- strong OSS contributor experience

## Non-goals

The following are explicitly out of scope for v0.x unless this document is intentionally revised.

`agentworthy` must not:

- call OpenAI, Anthropic, Google, or other LLM APIs for core analysis
- act as an autonomous coding agent
- package the full repository into a prompt
- become a Repomix or code2prompt clone
- automatically modify the analyzed repository
- automatically generate `AGENTS.md` with an LLM
- grade code style or business logic quality
- claim that a high score guarantees correct AI-generated code
- reward meaningless files created only to increase the score
- require a cloud account
- require telemetry

## Success criteria

### Product

A developer should be able to run:

```bash
npx agentworthy check
```

and understand within roughly 10 seconds:

1. how ready the repository is
2. what the most important gaps are
3. what to improve next

### OSS

Initial milestones:

- usable v0.1.0
- package published to npm
- public GitHub repository
- English-first README
- Japanese README or translation
- demo screenshot or GIF
- 16 GitHub stars
- external issues or pull requests from real users

Longer-term:

- 100+ stars
- GitHub Action integration
- community-contributed detectors
- adoption in real CI pipelines

## Product boundaries

When deciding whether to add a feature, ask:

> Does this help determine or improve repository readiness for coding agents?

If the answer is no, it likely belongs in another tool.

When a proposed feature overlaps heavily with a repository-packing, coding-agent, code-generation, or generic linter product, prefer integration or documentation over reimplementation.
