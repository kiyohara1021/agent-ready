# python-uv

A fixture repository that models a well-prepared Python project. It exists so
detectors are exercised against an ecosystem that is not Node.js.

## Requirements

- Python 3.12
- [uv](https://docs.astral.sh/uv/)

## Setup

```bash
uv sync
```

## Tests

Run the suite before submitting a change:

```bash
uv run pytest
```

## Static analysis

```bash
uv run ruff check .
uv run mypy src
```

## Architecture

The package is split into three modules with distinct responsibilities. The
`cli` module parses arguments and prints results; it holds no domain logic. The
`core` module owns the calculations and is pure, which keeps it easy to test in
isolation. The `store` module is the only place that touches the filesystem, so
persistence concerns never leak into the rest of the package.

```text
src/
├── cli.py
├── core.py
└── store.py
```
