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


## Mandatory pre-change checkpoint gate

This gate applies to every module, page, conversation and agent working in this repository. It is required before any source-code, configuration, schema, migration or behavior change.

1. Read this `AGENTS.md`, the complete active list in `CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md`, and every checkpoint relevant to the affected flow.
2. Inspect the current `main` history since the latest verified LAB result. Do not rely on chat memory or a single recent checkpoint.
3. Write down the current evidence as `LAB PASS`, `LAB FAIL`, or `NOT TESTED`. CI PASS is never equivalent to LAB PASS.
4. Reconcile contradictions before editing. The newest real LAB observation supersedes an older unverified plan; an older confirmed invariant remains protected until a newer LAB result explicitly disproves it.
5. List the already-working behaviors that the change must preserve and ensure regression coverage exists for them. A fix must not silently reverse an earlier verified fix.
6. Make one bounded causal change at a time. Do not combine speculative fixes for unrelated symptoms.
7. Update the active list and create or update the relevant checkpoint before opening a pull request. Record what was tested, what remains untested, the exact safety boundaries and the required LAB acceptance criteria.
8. Require green CI, merge, and verification of the exact deployed revision before requesting LAB testing.
9. Never describe a change as fixed until the required LAB acceptance test passes. If it has only passed CI, label it `AWAITING LAB`.
10. If the active list, checkpoints, deployed revision or LAB evidence cannot be read, stop and obtain them before changing the repository.

For payment, invoice, stock, fiscal, accounting and finalization flows, also preserve idempotency: no duplicate payment, no resurrection of a deliberately deleted draft, no stock posting and no finalization during diagnostic testing unless the checkpoint explicitly authorizes it.
