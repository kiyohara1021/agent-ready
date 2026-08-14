# agent-ready

> Is your repository ready for coding agents?

`agent-ready` is a deterministic static-analysis CLI that audits how well a repository is
prepared for coding agents such as Codex, Claude Code, and Cursor.

Analysis is local, read-only, and requires no LLM API, account, or telemetry.

## Status

Early development. The CLI skeleton and analysis pipeline exist; the readiness
detectors described in [docs/DETECTORS.md](docs/DETECTORS.md) and the weighted scoring model in
[docs/SCORING.md](docs/SCORING.md) are not implemented yet, so scores are not yet meaningful.

## Usage

```bash
agent-ready check [path]
```

Options:

```text
--format <text|json>   Output format (default: text)
--min-score <number>   Fail with exit code 2 below this score
--help                 Show help
--version              Show version
```

Exit codes:

```text
0  analysis completed and threshold passed
1  runtime or invocation error
2  readiness score below --min-score
```

## Development

Requires Node.js 22+.

```bash
npm install
npm run build
npm run lint
npm run typecheck
npm test
```

Run the built CLI against a repository:

```bash
node dist/cli/index.js check .
```

## Documentation

- [PRODUCT.md](PRODUCT.md) — product vision and boundaries
- [AGENTS.md](AGENTS.md) — contributor and coding-agent instructions
- [docs/V0_SPEC.md](docs/V0_SPEC.md) — v0.1 specification
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — internal architecture
- [docs/CLI.md](docs/CLI.md) — CLI specification
- [docs/DETECTORS.md](docs/DETECTORS.md) — detector specification
- [docs/SCORING.md](docs/SCORING.md) — scoring model

## License

MIT
