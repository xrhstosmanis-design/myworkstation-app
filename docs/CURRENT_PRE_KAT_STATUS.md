# CURRENT PRE-KAT STATUS

Updated: 2026-08-11 16:24 Europe/Athens

This file is an append-style operational checkpoint complementing `docs/PROJECT_CHECKPOINT.md`.

## Latest completed PRE-KAT step
- PRE-KAT STEP 3B — Promotion store overlap guard.
- PR #143 merged to `main`.
- MyWorkStation CI #201: SUCCESS.
- Merge commit: `4202135354fbee7c485ffcb3f7d72817a25502c2`.

## Real acceptance testing — active
TEST 1: BackOffice launch from Platform Admin.
- First run: FAIL — blank main BackOffice screen; floating launchers remained visible.
- Browser console: `Cannot read properties of undefined (reading 'name')`.
- Root cause: legacy BackOffice rendered `user.company.name`, but Platform/Super Admin support-style session can exist without `user.company`.
- Fix PR: #145.
- MyWorkStation CI #204: SUCCESS.
- Merge commit: `1dd80a602b30fb354f6d4d3c731c5535757abcfe`.
- Real browser re-test after deployment: PASS.

TEST 2: tenant/store isolation from BackOffice.
- Real browser result: PASS for store listing; only `Κυλικείο ΚΑΤ` is visible in this tenant context.

TEST 3: Χειριστές / employee access and role controls.
- Real browser result: PASS.
- Operators section opens correctly from the horizontal BackOffice navigation.
- Employee rows, role selectors, PIN status, card/barcode fields, active-access toggles and save controls render correctly.
- User confirmed the section opens and is usable.

TEST 4: Πωλήσεις & Πληρωμές.
- Real browser load/display result: PASS.
- `Συναλλαγές Βάρδιας` renders correctly with totals for cash/cards/expenses/percentages.
- Existing store transaction is visible: cash sale `1,00 €`, active, with cancellation-with-reason action.
- UI correctly reports that there is currently no open shift.
- `Έλεγχος Ταμείου` section also renders below with status `ΚΛΕΙΣΤΗ`.
- Full new-transaction acceptance is intentionally pending until a real shift is opened from POS / Store Mode and the POS end-to-end flow is executed.

TEST 5: Βάρδιες & Ταμεία — BackOffice shift-opening policy.
- Initial real browser finding: FAIL by product requirement — BackOffice exposed an `Άνοιγμα βάρδιας` form/button while no shift was open.
- User requirement: BackOffice must not open shifts. Shift opening is only from POS / Store Mode at the operational store endpoint.
- Fix branch: `fix/backoffice-no-open-shift`.
- PR #147.
- UI fix: when no shift is open, BackOffice now shows only a read-only message that shift opening is not permitted there and must be done from POS / Store Mode. Existing monitoring/history and close/hand-off behavior for an already-open shift remains available.
- Initial MyWorkStation CI #206: FAILURE because one legacy static test still required the removed BackOffice opening-warning form text (`Διαφορά από την προηγούμενη παράδοση`). Product code behavior matched the new requirement; the test contract was stale.
- Test updated to assert the new BackOffice no-open policy while preserving opening-continuity checks in server/history/report coverage.
- Follow-up MyWorkStation CI #207: SUCCESS (506 tests, 506 passed).
- PR #147 merged to `main`.
- Merge commit: `35d4a0ae4bb8074b64749b33015c2fc89dd24910`.
- Real browser refresh/re-test: PASS.
- Confirmed in live BackOffice: status `ΚΛΕΙΣΤΗ`, no `Άνοιγμα βάρδιας` form/button, and visible read-only instruction that opening is allowed only from POS / Store Mode.
- Recent shift history remains visible, including opening, opening variance, cash, cards, EFTPOS and final variance values.

TEST 6: Προϊόντα & Απόθεμα navigation.
- Initial real browser result: FAIL — the horizontal card scrolled to legacy pairing / Demo catalog instead of the real product and stock workspace.
- Root cause: the card targeted legacy `backoffice-catalog` content.
- Fix branch: `fix/backoffice-products-navigation`.
- PR #148.
- MyWorkStation CI #208: SUCCESS.
- PR #148 merged to `main`.
- Merge commit: `4406a6bc136fab324778ed006e78af3584c18ef7`.
- Real browser re-test after deployment: PASS.
- Confirmed live: `Προϊόντα & Απόθεμα` opens the real `Εμπορική λειτουργία → Προϊόντα, Τιμές, Προσφορές & Απογραφή` workspace.
- Product grid is visible with category filters, VAT, retail price, stock, new item, Excel import and full-management controls.

TEST 7: Συσκευές.
- Real browser result: PASS for navigation and display.
- `Συσκευές` card scrolls to `Συσκευές καταστήματος` correctly.
- Registered device is visible as `MyWorkStation POS - Chrisurface`, Windows / Node v24.14.0, status `ACTIVE`, with pairing and last-contact timestamps.
- User confirmed this is the known intended test device.
- `Απενεργοποίηση` was intentionally not executed during acceptance because it would revoke the active test device and interrupt the remaining test flow.

## Approved BackOffice UI change during real testing
- Six horizontal BackOffice section cards: Χειριστές, Πωλήσεις & Πληρωμές, Βάρδιες & Ταμεία, Προϊόντα & Απόθεμα, Συσκευές, Ιστορικό.
- Implemented in branch `feat/backoffice-horizontal-section-cards`.
- PR #146.
- MyWorkStation CI #205: SUCCESS.
- PR #146 merged to `main`.
- Merge commit: `0b33003482abe3e41c707078730427d797a49c82`.
- Real browser refresh/re-test: PASS.
- User confirmed all six buttons work correctly in the live BackOffice store screen.

## Today's mandatory acceptance scope
Complete real end-to-end testing of all MyWorkStation functions that can run without physical fiscal hardware or external providers. Test BackOffice and POS, including roles/tenant isolation, customers, products/categories/prices, wholesale pricing, promotions/gifts, file import, cart/HOLD, cash/card/mixed software flows, duplicate-sale protection, cancellation/refund/delayed transaction, shifts/EFTPOS internal logic, reports, customers, stock, suppliers, purchase orders, audit/history and UI stability.

Excluded only from physical execution today: fiscal cash register/USB, hardware-dependent Observer, real EFTPOS terminals, and external providers requiring production credentials/hardware. Their internal validation, persistence, audit and UI logic must still be tested where possible.

## Immediate next action
1. TEST 8 — `Ιστορικό` in the live `Κυλικείο ΚΑΤ` BackOffice.
2. After BackOffice acceptance, enter POS / Store Mode, open a real non-fiscal shift there, and execute the pending end-to-end new-sale flow.
3. Continue through customers, prices/wholesale/promotions, HOLD, cash/card/mixed flows, duplicate-sale protection, cancellation/refund/delayed transaction, EFTPOS internal logic, reports, stock, suppliers, purchase orders and audit/history.
4. Save a new checkpoint after each major test milestone or fix.
