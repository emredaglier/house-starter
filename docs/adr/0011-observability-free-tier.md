# 11. Observability on free tiers

Date: 2026-11-09 · Status: accepted

## Context
Motion and asset failures happen silently, and a health check that only fetches `/` misses most of
them.

## Decision
- **Sentry** free plan, browser side only, with no session replay and no cookies. Disclosed in the
  privacy notice.
- **Cloudflare Web Analytics**, cookie-less, loaded as an explicit script tag in code rather than
  auto-injected.
- **UptimeRobot**, checking `/`, one content page and one static chunk.
- Deploy smoke checks and rollback alerts (ADR-0005).
- Motion pieces report silent failures through one shared event (`reportMotionFault` in
  `packages/motion`), which the Sentry integration listens for.

## Consequences
Adds one third party, Sentry, which a project's privacy notice must name. The integrations arrive
with the infra ticket and per project.
