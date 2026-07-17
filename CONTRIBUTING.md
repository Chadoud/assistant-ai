# Contributing to EXO

## What to run before a PR

1. Relevant steps from [docs/QUALITY_GATES.md](docs/QUALITY_GATES.md) (at minimum the “PR / pre-merge” table for the code you touched).
2. If you change **i18n** string keys: `cd frontend && npm run check-locale-keys`.
3. If you add or rename **guided tour** steps: all locales in `frontend/src/i18n/tourStepBundles.ts` / `tourDe.ts` / `tourIt.ts` must keep the same step keys — `npm test -- --run` includes `tourStepParity.test.ts`.

Husky **pre-push** runs path-aware `npm run verify:local` (quick). Full details: [docs/runbooks/pre-push-verification.md](docs/runbooks/pre-push-verification.md).

**Before a desktop release tag (`v*`):** bump + commit, then `npm run release:desktop` (writes a local stamp; includes unsigned Mac packaging smoke). Tag push is blocked without that stamp. See the runbook — do not rely on `npm run quality` alone.

## Classification / sort pipeline

If you change `backend/analyze_policy.py`, `classifier_scoring`, or other **folder decision** behavior, keep [docs/CLASSIFICATION_POLICY.md](docs/CLASSIFICATION_POLICY.md) aligned in the same change when the written policy is affected.

## Documentation index

See [docs/README.md](docs/README.md) for architecture, audit, security, and testing.
