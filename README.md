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

`pnpm lint` also runs `scripts/check-effects.mjs`, which rejects SVG filters and
`:active-view-transition-type()` (see the comment at the top of the script).

## Starting a project from the template

1. Create the project repo from the template.
2. Rename the `@house/*` scope in every `package.json`, import and `transpilePackages` list. Also
   rename the `house:motion-fault` event (`packages/motion/src/fault.ts`), the email adapter's
   `defaultFromName` (`packages/cms-config/src/config.ts`) and the `'Project name'` title in
   `apps/web/src/app/layout.tsx`.
3. Replace `packages/cms-config/src/seed/placeholder.ts`, the Site global and the home page with the
   project's content model.
4. Fill `packages/ui` with the project's design (tokens, fonts in `packages/ui/fonts.ts`).
5. Keep `scripts/repo-guard.test.ts`: it fails if another project's design leaks in.

## Not here yet

Infra (Docker, Caddy, Litestream, CI and deploy), the full motion package and perf suite, and the
agent rules file with the CI checks arrive in later tickets. ADRs 0002 to 0007, 0009 and 0011 describe
the rules that infra must meet.
