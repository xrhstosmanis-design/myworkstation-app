# MyWorkStation agent guide

## Repository scope

This is the single source repository for the MyWorkStation POS, BackOffice, Platform/Super Admin and the connected Work pages. Do not create or reconnect a second project, repository or production service for these tasks.

Work from a branch based on `main`. Preserve tenant isolation, licensing, authentication, fiscal gates, POS/BackOffice behavior and existing Render deployment safeguards.

## Runtime and setup

- Use Node.js 20.
- Install dependencies from the repository root with `npm install`.
- The repository is an npm workspace with `client` and `server` packages.
- Do not run production database migrations, `prisma db push`, seeds or destructive scripts from a Work sandbox unless the task explicitly requires an isolated test database.

## Build commands

- `npm run build` — Work-safe frontend build. It prepares and builds only the client bundle into `client/dist`; it must not require Prisma, database access or production credentials.
- `npm run build:server` — prepares server sources and generates the Prisma client. Use only where server dependencies are available.
- `npm run build:production` — full Render build, combining client and server preparation.
- `npm test -w server` — server test suite.

The default `build` command must remain frontend-only. Render must continue using `build:production`.

## Change safety

- Do not replace the existing POS or BackOffice application with a standalone page.
- Do not change fiscal execution, Netlink/RBS gates, store licensing, authentication or production data as part of a page/build fix.
- Keep Work-page fixes additive and compatible with the existing routes and APIs.
- Before merging, require the GitHub CI build, server tests, production invariants and isolated E2E flows to pass.
