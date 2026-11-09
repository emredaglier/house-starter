# 5. CI-built images, health-gated deploy with automatic rollback

Date: 2026-11-09 · Status: accepted

## Context
Building in place on the live server causes 404s during deploys and leaves the site broken
whenever a build fails.

## Decision
- **CI** (GitHub Actions):
  - Lint, typecheck and Vitest.
  - Build the `web` and `cms` images.
  - Run a Playwright smoke test of every route against the built image. It fails on any console
    error or 404.
  - Push the images to GHCR.
  - Join the tailnet and run `infra/deploy.sh`.
- **Deploy script:**
  - Pull the images and run migrations (ADR-0003).
  - Swap the containers.
  - Smoke-check the home page, one content page, one static chunk and one media file.
  - If a check fails, roll back to the previous tag automatically and send an alert.
- The frame-time perf suite runs locally only, because CI runners have no GPU.
- No permanent staging environment.

## Consequences
Every release is an immutable image that can be rolled back with one command. The pipeline files
arrive with the infra ticket.
