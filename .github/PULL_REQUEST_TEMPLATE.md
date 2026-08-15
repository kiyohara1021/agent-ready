# Summary

<!-- What changes, and why. Link the issue it resolves. -->

## Type of change

- [ ] Bug fix
- [ ] New or changed detector
- [ ] Scoring change
- [ ] Documentation
- [ ] Internal / tooling

## Verification

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`

## Checklist

- [ ] Documentation in `docs/` matches the behavior after this change
- [ ] `CHANGELOG.md` updated under `Unreleased`, if a user would notice
- [ ] No LLM call, network call, or write to the analyzed repository was added
- [ ] Output is deterministic and contains no secret values or machine-specific paths

## For detector or scoring changes

<!-- Delete this section if it does not apply. -->

- [ ] Rationale: why this signal predicts better agent outcomes
- [ ] Positive fixture
- [ ] Negative fixture
- [ ] Edge case that would otherwise be a false positive
- [ ] `docs/DETECTORS.md` updated
- [ ] `docs/SCORING.md` updated if points moved

<!--
If this changes the score of an existing fixture, say which fixture and by how
much, so the scoring diff is reviewable on its own.
-->
