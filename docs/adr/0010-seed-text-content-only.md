# 10. Seed text content only; never wipe production without confirmation

Date: 2026-11-09 · Status: accepted

## Context
A project replacing an older site may start clean instead of migrating content, and a seed has to
be safe to run more than once.

## Decision
- `pnpm seed` fills text globals from files in the repo. It is idempotent: a global that already
  holds the seed text is left alone, one edited in the admin is refused unless `--force`, and
  `--force` reaches the script (`payload run` drops flags that come before a `--`).
- Never wipe a production database or R2 objects without confirming with the owner right before.
- Slug changes produce 301s from a `previousSlugs` field, when a project has slugs.

## Consequences
Seeding is repeatable and never silently overwrites an editor's work. The starter seeds one
placeholder Site global from `packages/cms-config/src/seed/placeholder.ts`.
