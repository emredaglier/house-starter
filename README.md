# House starter

The house backbone as a template: a pnpm monorepo with a public Next.js site, a private Payload
CMS, shared CMS config, a minimal motion package and an empty UI package. It carries no design: no
tokens, fonts, colours, components or copy.

- Decisions: [`docs/adr/`](docs/adr/). Coding standards: [`CODING_STANDARDS.md`](CODING_STANDARDS.md).

## Setup

Node and pnpm are pinned (`.node-version`, `engines`, `packageManager`). With Corepack enabled:

```sh
pnpm install
pnpm check   # lint, typecheck, test, build
```

To see the placeholder page locally:

```sh
cp apps/cms/.env.example apps/cms/.env && cp apps/web/.env.example apps/web/.env
pnpm migrate   # creates apps/cms/data/site.db
pnpm seed      # fills the placeholder Site global
pnpm dev       # web on http://localhost:3000
pnpm --filter @house/cms dev   # the admin on http://localhost:3001/admin
```

## Layout

| Path                  | Role                                                                    |
| --------------------- | ----------------------------------------------------------------------- |
| `apps/web`            | Public Next.js site: Local API reads, no `/admin`, no `/api`            |
| `apps/cms`            | Payload admin, the only writer of the database                          |
| `packages/cms-config` | Payload collections, globals, access, revalidation, seed and migrations |
| `packages/motion`     | Motion shell: capability checks and the motion-fault event              |
| `packages/ui`         | Empty shell: head script and the single place fonts are defined         |
| `infra`               | Docker Compose, Caddy, Litestream, deploy scripts, per-project settings |
| `smoke`               | The release gate: Playwright against the built `web` image              |

`pnpm lint` also runs `scripts/check-effects.mjs`, which rejects SVG filters and
`:active-view-transition-type()` (see the comment at the top of the script).

## Infra and releases

[`infra/`](infra/README.md) carries the deploy backbone (Docker Compose and Caddy, CI-built images, health-gated deploys with automatic rollback, SQLite WAL with Litestream to R2, static files on R2 behind Cloudflare, admin and draft preview on Tailscale only). Every per-project name (domain, CDN host, buckets, server folder) comes from [`infra/project.env`](infra/project.env); the README there lists what the owner fills in. CI builds images and deploys only from a release tag (`v1.2.3`); pull requests and `main` run lint, typecheck and unit tests.

`pnpm smoke` is the release gate (it needs Docker and a Playwright Chromium; see "Smoke gate" in `infra/README.md`). Workers do not run it: the lead runs it once, after the workers finish.

## Starting a project from the template

1. Create the project repo from the template, then fill in `infra/project.env` and follow the
   checklist at the top of `infra/README.md`.
2. Rename the `@house/*` scope in every `package.json`, import and `transpilePackages` list. Also
   rename the `house:motion-fault` event (`packages/motion/src/fault.ts`), the email adapter's
   `defaultFromName` (`packages/cms-config/src/config.ts`) and the `'Project name'` title in
   `apps/web/src/app/layout.tsx`.
3. Replace `packages/cms-config/src/seed/placeholder.ts`, the Site global and the home page with the
   project's content model.
4. Fill `packages/ui` with the project's design (tokens, fonts in `packages/ui/fonts.ts`).
5. Keep `scripts/repo-guard.test.ts`: it fails if another project's design leaks in.

## Not here yet

The full motion package and perf suite, and the agent rules file with the CI checks arrive in later
tickets. ADRs 0002 to 0007, 0009 and 0011 describe the rules that infra meets.
