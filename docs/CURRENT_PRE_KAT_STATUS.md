# CURRENT PRE-KAT STATUS

Updated: 2026-08-11 15:32 Europe/Athens

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
- Real browser result so far: PASS for store listing; only `Κυλικείο ΚΑΤ` is visible in this tenant context.

## Approved BackOffice UI change during real testing
- User approved six horizontal BackOffice section cards at the top of the store page: Χειριστές, Πωλήσεις & Πληρωμές, Βάρδιες & Ταμεία, Προϊόντα & Απόθεμα, Συσκευές, Ιστορικό.
- Implemented in branch `feat/backoffice-horizontal-section-cards`.
- PR #146.
- MyWorkStation CI #205: SUCCESS.
- PR #146 merged to `main`.
- Merge commit: `0b33003482abe3e41c707078730427d797a49c82`.
- Real browser refresh/re-test of the approved layout is the immediate next action.

## Today's mandatory acceptance scope
Complete real end-to-end testing of all MyWorkStation functions that can run without physical fiscal hardware or external providers. Test BackOffice and POS, including roles/tenant isolation, customers, products/categories/prices, wholesale pricing, promotions/gifts, file import, cart/HOLD, cash/card/mixed software flows, duplicate-sale protection, cancellation/refund/delayed transaction, shifts/EFTPOS internal logic, reports, customers, stock, suppliers, purchase orders, audit/history and UI stability.

Excluded only from physical execution today: fiscal cash register/USB, hardware-dependent Observer, real EFTPOS terminals, and external providers requiring production credentials/hardware. Their internal validation, persistence, audit and UI logic must still be tested where possible.

## Immediate next action
1. Wait for deployment of merge commit `0b33003482abe3e41c707078730427d797a49c82` and refresh the same BackOffice store screen.
2. Verify the six horizontal cards visually and functionally.
3. Continue real BackOffice acceptance flows.
4. Then execute POS end-to-end flows.
5. Save a new checkpoint after each major test milestone or fix.
