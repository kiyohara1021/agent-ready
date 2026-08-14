# Claude Implementation Prompts

Paste **one PR prompt at a time** into Claude Code / Claude.

Do not ask Claude to implement all phases in a single session.

## How to use

1. Open this repository as the working directory.
2. Ensure these docs exist and are treated as source of truth:
   - `PRODUCT.md`
   - `AGENTS.md`
   - `docs/V0_SPEC.md`
   - `docs/SCORING.md`
   - `docs/ARCHITECTURE.md`
   - `docs/CLI.md`
   - `docs/DETECTORS.md`
   - `docs/OSS_STRATEGY.md`
3. Paste the **Shared preamble** once at the start of a new Claude session (optional if Claude already read `AGENTS.md`).
4. Paste exactly one `PR N` prompt.
5. Review, run tests, commit/merge that PR, then start the next session with the next PR prompt.

## Shared preamble (optional, once per session)

```text
You are implementing agent-ready, a deterministic static-analysis CLI that audits whether a repository is prepared for coding agents.

Read and obey these documents before coding:
- PRODUCT.md
- AGENTS.md
- docs/V0_SPEC.md
- docs/SCORING.md
- docs/ARCHITECTURE.md
- docs/CLI.md
- docs/DETECTORS.md
- docs/OSS_STRATEGY.md

Hard boundaries:
- Do NOT call LLM APIs
- Do NOT generate AGENTS.md / README with an LLM
- Do NOT pack repository contents into prompts
- Do NOT automatically edit analyzed repositories
- Do NOT execute analyzed repository scripts/installs/tests
- Do NOT add agent-specific modes yet
- Do NOT invent features outside the current PR scope

Architecture rules:
- discovery → detectors → findings → scoring → reporters → CLI
- Detectors return Finding data only; no terminal rendering; no scoring side effects
- Scoring must not access the filesystem
- Reporters must not perform detection
- Analysis is read-only and local-first

Keep the PR focused. Update docs only when behavior changes.
```

---

## PR 1 — Bootstrap

```text
Implement PR 1 only: project bootstrap for agent-ready.

Goal:
Create a TypeScript CLI skeleton that can run `agent-ready check` end-to-end with stub/fixture detection only. No real readiness heuristics yet.

Required reading:
- PRODUCT.md
- AGENTS.md
- docs/V0_SPEC.md
- docs/ARCHITECTURE.md
- docs/CLI.md
- docs/OSS_STRATEGY.md (PR 1 section)

Implement:
1. TypeScript ESM package for Node.js 22+
2. package.json with bin entry `agent-ready`
3. Source layout aligned with docs/ARCHITECTURE.md:
   - src/cli/
   - src/core/
   - src/discovery/
   - src/detectors/
   - src/reporters/
4. `agent-ready check [path]` command wiring
5. Repository discovery that builds RepositoryContext
6. Detector interface
7. One fixture/stub detector proving the pipeline works
8. Minimal text reporter that prints a placeholder score/report from stub findings
9. Vitest + ESLint + typecheck scripts
10. GitHub Actions CI for macOS/Linux/Windows and Node 22/24 if practical
11. Basic tests for CLI wiring and context loading

Explicitly out of scope for PR 1:
- real detectors from DETECTORS.md
- weighted scoring engine
- polished terminal UX
- JSON reporter completeness
- --min-score behavior beyond accepting/parsing the flag if convenient
- README marketing polish
- npm publish

Acceptance:
- `npm test`, `npm run lint`, `npm run typecheck` pass
- `node`/local bin can run `agent-ready check` on a fixture repo
- pipeline is discovery → detectors → findings → (stub score) → report
- analyzed repos are never modified
- no LLM dependencies

When done, summarize files created and how to run the stub check.
```

---

## PR 2 — Instruction detectors

```text
Implement PR 2 only: instruction detectors.

Prerequisite: PR 1 bootstrap is already merged/present.

Required reading:
- docs/DETECTORS.md
- docs/SCORING.md
- docs/V0_SPEC.md
- AGENTS.md

Implement detectors for the Instructions family, for example:
- instructions.agents-md
- setup/development instructions
- test instructions
- lint/type-check instructions
- architecture guidance

Requirements:
- Each detector inspects RepositoryContext and returns Finding
- Partial credit via sub-criteria where SCORING.md defines it
- No terminal rendering inside detectors
- Multi-ecosystem docs awareness where relevant (do not assume Node-only)
- Fixture-based tests:
  - positive
  - negative
  - edge
  - applicability when relevant

Out of scope:
- automation/CI detectors
- safety detectors
- final weighted scoring polish
- JSON/text reporter redesign

Acceptance:
- instruction detectors registered and exercised by `agent-ready check`
- tests cover positive/negative/edge cases
- docs updated only if detector IDs/behavior need clarification
```

---

## PR 3 — Automation detectors

```text
Implement PR 3 only: automation / development detectors.

Prerequisite: PR 1–2 present.

Required reading:
- docs/DETECTORS.md
- docs/SCORING.md
- docs/ARCHITECTURE.md
- AGENTS.md

Implement detectors for:
- test command discovery
- lint command discovery
- typecheck/static analysis command discovery
- CI workflow detection (.github/workflows)
- dependency automation (Dependabot/Renovate/equivalent)

Requirements:
- Support multiple ecosystems via manifests/task runners where practical:
  package.json, composer.json, pyproject.toml, Makefile, justfile, Cargo.toml, go.mod, etc.
- Parse workflow files for test/lint/typecheck/build signals conservatively
- Never execute repository scripts
- Never load/execute target repository JS/TS config code
- Fixture tests for positive/negative/edge cases across at least 2 ecosystems

Out of scope:
- scoring engine finalization
- reporter polish
- context/safety detectors

Acceptance:
- automation findings appear in analysis output
- deterministic evidence paths/labels
- tests pass
```

---

## PR 4 — Scoring engine

```text
Implement PR 4 only: scoring engine.

Prerequisite: PR 1–3 present with real findings.

Required reading:
- docs/SCORING.md
- docs/V0_SPEC.md
- docs/ARCHITECTURE.md

Implement:
1. Category weights matching SCORING.md
2. Aggregation of finding contributions into category + overall score (0–100)
3. Applicability handling (non-applicable checks should not unfairly punish)
4. Recommendation derivation from weak/missing findings
5. Deterministic ordering
6. Regression fixtures that lock expected scores for known repositories

Rules:
- score.ts consumes findings only
- scoring must NOT access the filesystem
- no randomness, no network, no timestamps in score math
- do not invent new point totals that conflict with SCORING.md; if a conflict is found, stop and align docs intentionally

Out of scope:
- final terminal visual polish
- JSON schema finalization beyond what scoring needs
- new detectors

Acceptance:
- same fixture → same score
- category totals match documented maxima
- recommendation ordering is stable
- regression tests fail if weights drift unexpectedly
```

---

## PR 5 — Reporters (text + JSON + threshold)

```text
Implement PR 5 only: reporters and CLI output contracts.

Prerequisite: PR 1–4 present.

Required reading:
- docs/CLI.md
- docs/V0_SPEC.md
- PRODUCT.md example output

Implement:
1. Text reporter with hierarchy:
   - tool version
   - overall score
   - category sections
   - findings with status symbols
   - recommendations
2. JSON reporter with schemaVersion/toolVersion/score/categories/findings/recommendations
3. `--format text|json`
4. `--min-score <0-100>`
5. Exit codes:
   - 0 success / threshold passed
   - 1 runtime error
   - 2 threshold failure
6. Invalid flags → exit 1
7. CLI tests for format and exit codes

Rules:
- reporters format only; no detection
- never print secret values
- do not rely on color alone
- keep output screenshot-friendly

Out of scope:
- new detectors
- README marketing pages
- agent-specific flags

Acceptance:
- `agent-ready check --format json` emits valid JSON on stdout
- `--min-score` returns 2 when below threshold after printing the report
- text output matches the information hierarchy in docs/CLI.md
```

---

## PR 6 — Context and safety detectors

```text
Implement PR 6 only: repository context + safety detectors.

Prerequisite: PR 1–5 present.

Required reading:
- docs/DETECTORS.md
- docs/SCORING.md
- AGENTS.md security rules

Implement detectors for:
- README quality/orientation
- architecture documentation
- repository metadata
- ignore rules
- generated/vendor separation
- .gitignore hygiene
- secret-pattern exclusions (report metadata only)
- SECURITY.md
- dependency lockfile where meaningful

Security requirements:
- NEVER print secret values, .env contents, or private keys
- report only enough path/type metadata to explain risk
- do not follow external symlinks / symlink cycles unsafely
- treat target repos as untrusted input

Tests:
- positive/negative/edge fixtures
- include cases with .env.example (usually safe) vs ignored .env
- lockfile match/mismatch cases where applicable

Out of scope:
- OSS marketing polish
- npm publish
- explain/init commands

Acceptance:
- context + safety findings contribute to score
- secret-related output contains no secret material
- tests pass
```

---

## PR 7 — OSS release polish

```text
Implement PR 7 only: OSS release polish for public v0.1.

Prerequisite: PR 1–6 present and `agent-ready check` is functionally complete.

Required reading:
- docs/OSS_STRATEGY.md
- PRODUCT.md
- docs/V0_SPEC.md launch/acceptance expectations

Implement:
1. README.md (English) optimized for 5-second understanding:
   - title
   - one-line value proposition
   - `npx agent-ready check`
   - example score output
   - demo GIF or screenshot placeholder if asset not yet recorded
2. README.ja.md
3. CONTRIBUTING.md
4. SECURITY.md
5. MIT license if missing
6. CODE_OF_CONDUCT.md if listed in launch bar
7. GitHub issue/PR templates
8. npm package metadata: description, keywords, engines, files/bin
9. Changelog / release notes stub for 0.1.0
10. Dogfood CI step idea: `agent-ready check --min-score ...` once self-analysis is stable
11. Positioning section vs Repomix/code2prompt/Gitingest (complementary, not hostile)

Do NOT:
- ask for stars
- invent fake roadmap dates
- add LLM features
- expand CLI command surface
- distort scoring to make this repo score 100

Acceptance:
- fresh-reader can understand product in seconds from README
- package is npx-ready
- launch checklist in OSS_STRATEGY.md is mostly complete or explicitly noted
- project still matches PRODUCT.md boundaries
```

---

## After each PR

Ask Claude to return:

1. What changed
2. How to run it
3. What is intentionally still missing
4. Any doc conflicts discovered

Then review manually before starting the next PR prompt.

## Suggested Claude session titles

- `agent-ready PR1 bootstrap`
- `agent-ready PR2 instructions`
- `agent-ready PR3 automation`
- `agent-ready PR4 scoring`
- `agent-ready PR5 reporters`
- `agent-ready PR6 safety-context`
- `agent-ready PR7 release-polish`
