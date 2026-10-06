# DOC-NUM-01 — Κεντρική αριθμημένη λίστα και κανόνας PASS

**Κατάσταση:** PASS · DOCUMENTATION COMPLETE · 2026-10-06T23:08:45+03:00

**Owner / branch:** Τρέχουσα συνομιλία Codex Work · `codex/numbered-checklist-publish-20261006` (continued from merged claim PR #1796; owner retained)

## Scope
- Publish the reviewed 51-item numbered list as a new Markdown/PDF set in `docs/roadmap/`.
- Include tracker IDs and status snapshot so items after PDF #18 map correctly to the central tracker.
- Clarify separate backup tasks (#03 preflight/dry-run, #18 backup live failure/restore, #42 reliability/continuity).
- Correct the remaining-scope wording for supplier exports, cashier monthly report, order suggestions, cross-store Audit, and TODAY-08.
- Update the shared instructions and stale-list pointers so every page follows the new list and marks an item PASS only after its exact acceptance criteria are met. Partial completion leaves residual work OPEN.
- Keep `OPEN_WORK_TRACKER.md` authoritative for owners, evidence and current status.

## Safety and boundaries
Documentation only. No source-code change, product acceptance, store transaction, payment, stock movement or LAB action. No existing work assignment changes owner.

## Acceptance
New Markdown and PDF agree on all 51 list numbers, tracker IDs and snapshot states; 4-page A4 PDF renders without clipping; cross-page guidance points to the canonical tracker; CI passes and the documentation merge is recorded.

## Completion record
The assignment is active on the publication branch. Checklist, generator, cross-page references and stale-state notices are complete. Markdown/PDF consistency, 51 tracker IDs and four A4 pages were validated locally. PR #1797; initial content commit `20b346859d8b98df43562086d36477cac72a3c04`; CI #4514 SUCCESS. Merge is gated on the final PR head passing CI.
