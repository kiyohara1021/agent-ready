# Architecture

`node-healthy` is a small HTTP service split into three layers, each with a
single responsibility. Requests enter through the HTTP layer, are validated
there, and are handed to the service layer, which owns business rules. Only the
data layer talks to storage, which keeps persistence details out of the rest of
the codebase.

## Project structure

```text
src/
├── http/
├── services/
├── data/
└── index.ts
```

## Modules

- `http/` — routing, request validation, and response shaping. It never queries
  storage directly.
- `services/` — business rules. This is the only layer allowed to coordinate
  more than one data module.
- `data/` — storage access. Each module exposes typed functions and hides the
  query builder from its callers.

## Data flow

A request flows `http → services → data` and the response travels back along
the same path. Nothing skips a layer.
