# API package

Scoped instructions for the `api` package.

The HTTP layer must stay free of database access; use the repository modules in
`src/data/` instead.

```bash
npm test --workspace packages/api
```
