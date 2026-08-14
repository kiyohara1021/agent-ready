# AGENTS.md

## Project

`node-healthy` is a fixture repository that models a well-prepared Node.js
project. It exists so detector tests have a realistic positive case.

## Development setup

```bash
npm ci
```

The repository targets Node.js 22, pinned in `.nvmrc`.

## Validation

Run the full suite before proposing a change:

```bash
npm test
npm run lint
npm run typecheck
```

## Constraints

Do not commit build output under `dist/`.

Never edit files under `src/generated/` by hand; they are produced by the code
generator and any manual change is overwritten on the next build.

Prefer small modules with explicit exports.
