# N40 / PR2065 — reviewed source candidate, full CI and LAB still required

10/10/2026 Europe/Athens. Same owner `codex/n40-full-twin-navigation-audit-20261010`; source branch `fix/n40-twin-navigation-20261010`. No ownership transfer or full No40 closure.

## Independent review evidence

Preparation run `38047290291` successfully applied the exact bounded central-entry correction on top of reviewed main `4fdba151bc8e1e5fe23f21509f39a0921a3dfbc9` and published only this branch. Resulting source commit `6f6fd6a76c77d2ff1e257df5feed3dd4d9491779`; intermediate merged input `bc0607a94d24d3205c85232df161847c2eb6a8bd`. No forced ref change and no main/production write.

Artifact `11667971765` was downloaded and independently inspected. ZIP SHA256 `028e68681578ed6d2e4bd3511cb67ea20fa1a12729c1a2157301e3a6b98b25d5` matches the GitHub artifact digest. The captured Node20 TAP log reports **74 tests, 74 pass, 0 fail, 0 skipped** across eight suites. Work build completed and verified TABLE_SERVICE in the generated entry. Before this correction the expanded local Node22 command reproduced the two owned source-contract failures (73 tests, 71 pass, 2 fail); after it, 74/74 passed locally and in the supported Node20 preparation.

The downloaded PlatformAdminApp and mounted navigation test are byte-for-byte identical to the independently executed local correction. The final source snapshot has no temporary N40 workflow or applier. Compared with reviewed main, the pre-review candidate changes sixteen N40 source/test/checkpoint/tracker files only. The ordinary CI workflow, capacity tests, server authorization, business handlers and other owners' code are unchanged. This review adds only this checkpoint.

## Preserved behavior

Central Cash retains specific-store and explicit all-store refresh. Central Checks retains selectable company/store, explicit Clear/all-store execution and ordinary close. Twin-origin Cash exposes only its selected store; Twin-origin Checks keeps pinned filters, guarded requests and return to the same Twin. Central and scoped Workforce contracts, all six canonical tile destinations, late-response invalidation, removed-selection denial, scoped exports and simulated Stock support-return remain covered by the existing and strengthened regressions. No test was removed, disabled or weakened by this correction.

The prior Stock test-name/line discrepancy was not reproduced by independent historical replay and is not asserted to be an infrastructure defect. The historical capacity timing assertion is untouched and cannot be waived if normal full CI fails. Focused tests use fixture APIs, nested editors, downloads and full-page navigation: they are **not authenticated LAB, backend-role or physical-device acceptance**.

## Required next gate

This connector-origin review commit requests the normal full repository CI on the exact final PR head. Require server tests, Work build, production/Windows safety invariants and isolated PostgreSQL/HTTP E2E to succeed before merge. Do not merge a failed, canceled, pending or unverified head; do not use the preparation workflow as a replacement for CI.

After a verified deployed descendant, only authenticated read-only virtual MYWORKSTATION LAB six-tile navigation and the already-authorized virtual Stock support-entry/exit may be accepted. Actual browser/session access is not available in this continuation; browser connector discovery found no installed browser automation connection. No real-browser or real Stock return PASS is claimed. No sales, payments, inventory, shifts, staff, camera, fiscal, licensing, billing or production data mutations were performed. Visual phases1–14 remain protected. Central numbered/PDF final status synchronization remains pending; no new manual PASS. Overall **No40 OPEN / AWAITING FULL CI AND LAB**.
