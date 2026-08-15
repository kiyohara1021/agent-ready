# Contributing to agent-ready

Thanks for taking the time to look at this project.

`agent-ready` audits how well a repository is prepared for coding agents. The
most valuable contributions are usually **detectors and heuristics**: real
evidence about what makes a repository easy or hard for an agent to work in.

## Before you start

Two documents define what belongs in the project:

- [PRODUCT.md](PRODUCT.md) — vision, goals, and explicit non-goals
- [AGENTS.md](AGENTS.md) — working instructions for contributors and coding agents

The short version of the boundary: `agent-ready` is deterministic, local-first,
and read-only. It does not call an LLM, does not package repositories into
prompts, and does not modify the repository it analyzes.

For anything larger than a bug fix, open an issue first so we can agree on the
approach before you write code.

## Development setup

Node.js 22 or newer.

```bash
npm install
npm run build
npm test
```

The full check that CI runs:

```bash
npm run lint && npm run typecheck && npm test
```

Run the built CLI against any repository:

```bash
node dist/cli/index.js check /path/to/repo
```

`npm test` builds first, so the CLI integration tests exercise `dist/`.

## Repository map

```text
src/cli/          argument parsing, output, exit codes
src/core/         analysis pipeline, scoring, recommendations
src/discovery/    filesystem and metadata reading, shared by detectors
src/detectors/    one file per detector, grouped by category
test/             unit, reporter, and CLI tests over repository fixtures
docs/             specifications — the source of truth
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how a run flows through
those layers.

## Adding a detector

Detectors are deliberately small so that adding one does not require learning
the whole codebase. Read
[docs/DETECTORS.md](docs/DETECTORS.md) first, then include all six of these:

1. **Rationale** — why this signal predicts that an agent will do better work.
2. **Implementation** — a detector in `src/detectors/<category>/`, reading
   evidence through `src/discovery/` rather than touching the filesystem
   directly.
3. **A positive fixture** — a repository that should pass.
4. **A negative fixture** — a repository that should fail or warn.
5. **An edge case** — the ambiguous repository that would produce a false
   positive if the heuristic were naive.
6. **A scoring discussion** — if points move, say why, and update
   [docs/SCORING.md](docs/SCORING.md) in the same change.

Design rules that reviews will hold you to:

- **Deterministic.** Same repository state, same result. No clock, no network,
  no randomness, no machine-specific paths in output.
- **Ecosystem-neutral.** Do not assume `package.json` exists. If a check only
  makes sense for one ecosystem, mark it not applicable elsewhere instead of
  penalizing the repository.
- **Resistant to gaming.** An empty file should not earn points. Verify a useful
  signal inside the file where it is practical to do so.
- **Actionable.** A warning without a recommended next step is not finished.
- **Safe.** Never print secret values, file contents, or environment data.
  Report the type and location that explain the finding, nothing more.

## Good first contributions

- add ecosystem detection for a language the tool does not recognize yet
- add fixture coverage for an existing detector
- improve a heuristic that produces a false positive or false negative
- add documentation examples
- Windows path or line-ending edge cases

If you hit a repository where the score is obviously wrong, an issue that
describes the repository shape is a genuinely useful contribution on its own.

## Pull requests

- Keep a pull request to one reviewable change.
- `npm run lint`, `npm run typecheck`, and `npm test` must pass. CI runs them on
  macOS, Linux, and Windows against Node 22 and 24.
- Update the documentation in `docs/` in the same change when behavior moves.
  If implementation and specification disagree, the specification is the bug
  report — do not silently change product direction.
- Add an entry to [CHANGELOG.md](CHANGELOG.md) under `Unreleased` for anything a
  user would notice.
- Commit messages follow the existing style: `feat:`, `fix:`, `docs:`, `test:`,
  `ci:`, `refactor:`.

## Reporting bugs

Include the command you ran, what you expected, what happened, your OS and Node
version, and — most usefully — the shape of the repository that triggered it. A
minimal fixture directory beats a long description.

## Code of conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
