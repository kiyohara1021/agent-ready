# AGENTS.md

## Environment

The project is managed with `uv` and targets Python 3.12.

```bash
uv sync
```

## Validation

```bash
uv run pytest
uv run ruff check .
uv run mypy src
```

## Constraints

Do not add runtime dependencies without updating `pyproject.toml`.

Never write to `~/.cache` from library code; tests must stay hermetic.
