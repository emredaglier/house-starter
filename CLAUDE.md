## Project

A house starter: the backbone of every project, without a design. Decisions are in `docs/adr/`.
When you start a project from it, rename the `@house/*` workspace scope, replace the placeholder
text, and fill `packages/ui` with the project's own design.

## Memory-heavy commands

Subagents and workers (e.g. under `/implement-spec`) must not start Next.js processes: no `next dev`, `next build`, `pnpm dev`, `pnpm build`, and no Playwright/browser runs. Parallel Next processes have crashed the dev machine. Workers verify with lint, typecheck and unit tests only. Only the lead session runs `next build`/`next dev`, once, after the workers have finished.

## Standards

Writing or changing tests or smoke specs: read `CODING_STANDARDS.md` first.

## Agent skills

### Issue tracker

Issues are local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `**Status:**` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
