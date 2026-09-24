# MyWorkStation agent guide

## Κοινός κανόνας για όλες τις σελίδες: MYWORKSTATION LAB

Το `MYWORKSTATION LAB` / «ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ» είναι **εικονικό δοκιμαστικό κατάστημα**. Προϊόντα, υπάλληλοι, ταμεία, ποσότητες, πληρωμές και βάρδιες χρησιμοποιούνται για ελεγχόμενες δοκιμές και διασταύρωση αποτελεσμάτων. Κάθε σελίδα που αναλαμβάνει Gate ελέγχει εκεί τις σχετικές ροές, καταγράφει PASS/FAIL με πραγματικά παρατηρημένα αποτελέσματα και διορθώνει αποτυχίες πριν χρησιμοποιηθούν σε πραγματικό κατάστημα.

Τα μελλοντικά πραγματικά καταστήματα δημιουργούνται **ως νέα, ξεχωριστά καταστήματα από την αρχή**: δικός τους κατάλογος/είδη, αρχικό απόθεμα, υπάλληλοι, δικαιώματα, τερματικά και βάρδιες. Δεν μεταφέρουμε δεδομένα, ιστορικές κινήσεις, αρνητικές ποσότητες ή εικονικά υπόλοιπα από το LAB. Ιστορικό σφάλμα ή διαφορά σε παλιές εικονικές κινήσεις του LAB παραμένει τεκμήριο για Audit, όχι προϋπόθεση συμφωνίας ταμείου ή απογραφής νέου καταστήματος. Το επιβεβαιωμένο LAB PASS καταγράφεται στα κοινά κεντρικά PASS/manual και ο διορθωμένος κοινός κώδικας διατίθεται σε κάθε νέο κατάστημα. Το PASS μιας δοκιμής λειτουργίας στο LAB και η προετοιμασία/αποδοχή ενός νέου πραγματικού καταστήματος καταγράφονται χωριστά.

## Repository scope

This is the single source repository for the MyWorkStation POS, BackOffice, Platform/Super Admin and the connected Work pages. Do not create or reconnect a second project, repository or production service for these tasks.

Work from a branch based on `main`. Preserve tenant isolation, licensing, authentication, fiscal gates, POS/BackOffice behavior and existing Render deployment safeguards.

## Canonical Platform Admin link

For every page, agent, checkpoint, message template and user-facing instruction, the Platform/Super Admin entry link is **https://myworkstation-app.onrender.com/platform-admin**. Never send the root URL, an internal `?supportPage=stores` URL or a `/store/<id>` URL as the Platform Admin login link. Store Mode links are separate and must be explicitly identified as such. This link rule does not grant access or change any application route.

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

## Mandatory PASS → manual gate

This gate applies to every module, page, conversation and agent. It is mandatory immediately after a real `LAB PASS`, `LIVE PASS` or `USER PASS`.

1. Update the relevant checkpoint with the real observation, date, tested scope and exact production revision when applicable.
2. Update `CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md`, closing superseded `AWAITING LAB`, `RETEST` or `OPEN` items for the same flow. Historical entries may remain for traceability, but the newest top entry must state the authoritative status.
3. Create or update `docs/manual/<module>/PASS.md` in the same pull request. A PASS is not fully recorded until the manual contains the tested usage instructions.
4. The manual entry must include: who may use the feature, where it is opened, the verified step-by-step flow, security/tenant boundaries, PASS criteria, known limits and practical troubleshooting.
5. Never add CI-only, local-only, simulated or untested behavior to `docs/manual/`. CI PASS alone remains `AWAITING LAB`.
6. If a newer real test fails, update or remove the contradicted manual claim in the same change. The newest real observation is authoritative.
7. Before starting new work, read the relevant `docs/manual/<module>/PASS.md`. Do not rebuild or retest a flow already recorded there unless a newer FAIL, regression or explicitly expanded requirement exists.
8. Do not merge a checkpoint-only PASS closure that omits the corresponding manual update. This rule is repository-wide and is not optional for parallel Work pages.
9. Read `docs/roadmap/PENDING_WORK.md` before selecting new work. It is the authoritative list of unfinished work and the required implementation order.
10. When an item in `docs/roadmap/PENDING_WORK.md` receives a real PASS, remove that item from the pending roadmap in the same pull request. Do not leave a checked item, duplicate historical task, or contradictory `AWAITING LAB` entry that could cause another page to repeat the work.
11. The same PASS-closing pull request must update the checkpoint, active list, relevant `docs/manual/<module>/PASS.md`, pending roadmap and its central PDF. A PASS is not administratively complete until all five agree.
12. Invoice/OCR and efood/Pelican work remain owned by their dedicated pages. Other pages must not restart or duplicate those flows from the general roadmap.
13. Before editing, claim an unowned Gate or independent subtask in `docs/roadmap/PENDING_WORK.md` as `ASSIGNED - <page/branch>`. Work already marked `ASSIGNED` is locked to that page until it is explicitly released.
14. Parallel pages may own different Gates or independent subtasks. They must never edit the same assigned scope concurrently.
15. After a real PASS, delete the completed subtask from the active pending roadmap in the same pull request; do not leave a checked duplicate. When every subtask is removed, move the whole Gate to PASS/completed status.

## POS invoice acceptance invariant

A POS invoice change is accepted only when one genuinely new invoice submission
from the POS creates the correct single BackOffice draft automatically. A POS or
BackOffice refresh, status polling, reopening the draft, a second upload, or a
startup reread may be used only for diagnosis and must never be reported as the
acceptance result. The accepted draft must preserve the one settlement, one AI
job and one purchase draft identities. The owner's standing LAB rule permits
at most **two identified uncertain or incorrect product lines per invoice**
(including a 20-product invoice), provided they are present in the single
automatically created draft, visibly marked **ΠΡΟΣ ΕΛΕΓΧΟ** with a reason,
and corrected by the operator before approval. Zero recognized products,
missing/duplicated physical rows, three or more uncertain lines, or any
unresolved product cannot be called LAB PASS. A header-total mismatch may
remain visible in the unapproved draft for correction; it must never silently
mark an uncertain line as confirmed. Do not replace this review rule with a
blanket exact-total gate in another page, module, branch or conversation.
Every printed row, discount, tax group and invoice total must reconcile before
approval. No approval,
finalization, stock, fiscal, accounting or myDATA mutation is part of the LAB
acceptance test.
