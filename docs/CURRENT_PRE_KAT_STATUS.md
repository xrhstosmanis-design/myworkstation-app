# CURRENT PRE-KAT STATUS

Updated: 2026-08-11 15:14 Europe/Athens

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
- Fix branch: `fix/pre-kat-backoffice-support-company-name`.
- Fix PR: #145.
- Fix commit: `f049eb0a48f1b242a3ddc5c36662894e6245f525`.
- MyWorkStation CI #204: SUCCESS.
- Fix merged to `main`.
- Merge commit: `1dd80a602b30fb354f6d4d3c731c5535757abcfe`.
- Fix behavior: company label now uses `user.company?.name || supportContext?.companyName || "MyWorkStation"`; normal tenant behavior remains unchanged.
- Real browser re-test after deployment: PASS. BackOffice loads normally with sidebar, dashboard cards, header and floating launchers; no blank-screen crash.

## Today's mandatory acceptance scope
Complete real end-to-end testing of all MyWorkStation functions that can run without physical fiscal hardware or external providers. Test BackOffice and POS, including roles/tenant isolation, customers, products/categories/prices, wholesale pricing, promotions/gifts, file import, cart/HOLD, cash/card/mixed software flows, duplicate-sale protection, cancellation/refund/delayed transaction, shifts/EFTPOS internal logic, reports, customers, stock, suppliers, purchase orders, audit/history and UI stability.

Excluded only from physical execution today: fiscal cash register/USB, hardware-dependent Observer, real EFTPOS terminals, and external providers requiring production credentials/hardware. Their internal validation, persistence, audit and UI logic must still be tested where possible.

## Immediate next action
1. TEST 2 — verify real Super Admin/support access context and tenant/store isolation from BackOffice.
2. Continue BackOffice permissions/modules and commerce screens.
3. Then execute POS end-to-end flows.
4. Save a new checkpoint after each major test milestone or fix.
