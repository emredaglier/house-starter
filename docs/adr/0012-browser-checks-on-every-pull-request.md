# 12. Browser checks on every pull request

Date: 2026-11-09 · Status: accepted

## Context
ADR-0005 ran the smoke gate only on a release tag, so a pull request that broke an accessibility
rule, leaked a secret into the client bundle or left a page blank without WebGL stayed green until
launch day. Agents write most of the code, and cannot run a browser themselves, so the checks have
to run where they can: in CI, on every pull request. darkroom's Satus (MIT) is the model: its
end-to-end job (route sweep with axe, a secrets-in-the-bundle test, asset-weight budgets, a
WebGL fallback for every effect) is a required check on every pull request.

## Decision
- **A `browser` job runs on every pull request and on `main`.** It builds the `web` image of the
  commit (never pushed) and runs the smoke gate against it, the same `ci.sh smoke` a release tag
  runs in `build`. It has no secrets and no registry or deploy permission, and nothing waits for
  it: a tag still smoke-tests inside `build`, before publishing.
- **The Satus-derived checks are specs of that one gate**, not a second suite: the route sweep
  (pages found from `apps/web/src/app`), axe accessibility on every route and the 404 page, a scan
  of everything the container serves for server secrets, and the WebGL DOM-fallback check on the
  example effect. The asset-weight budget is a command (`pnpm check:assets`) in `check`, because it
  needs no browser.
- **Each check is proven against a broken fixture.** The pure logic (secrets scan, asset budget,
  route discovery) has unit tests with broken inputs; the browser checks run against deliberately
  broken pages in `smoke/checks.selftest.spec.ts`.
- **Still small.** The gate checks structure and behaviour only: no look, motion or interaction
  specs (CODING_STANDARDS.md). Nothing in it depends on a GPU, a clock or the order of requests.

## Consequences
A pull request takes the length of a docker build and a browser run (not yet measured) instead of
a unit-test run. A flaky browser check blocks merging, so a check that flakes is fixed or removed,
not retried. Projects add their effect pages to `EFFECT_PAGES` and their dynamic pages to
`DYNAMIC_ROUTE_SAMPLES`. A secret that only exists at build time (inlined by `NEXT_PUBLIC_`) is
caught by the repo guard `scripts/public-env.test.ts`, because the gate's image is built without
secrets.
