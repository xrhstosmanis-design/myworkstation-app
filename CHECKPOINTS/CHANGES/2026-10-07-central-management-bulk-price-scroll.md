# 07/10/2026 — Central Management full LIVE audit

## Assignment and safety

The owner assigned this page to inspect every Central Management section, tab, sub-tab, functional action and resulting screen, one by one, in normal and maximized modes. A PASS requires actual interaction and reaching the final functional control. The final matrix must distinguish PASS, FAIL and BLOCKED. User authorized the branch/commit/push/PR and merge after green CI. No real charges or sales, price Apply, stock/fiscal changes, or irreversible data actions.

Branch: `codex/central-management-live-audit-20261007`.

The previous page handoff was unavailable; no old owner release or evidence is invented. Preserve all other owners and existing PASS evidence.

## Reconciliation before work

Latest `main` at assignment: `4e1f96ea78ca3a92b4ad7a900b09766f4502d7fd` (merge PR #1813). Open PRs #1735 and #1702 were checked; both touch shared Central Management CSS, so any later UI fix must be isolated from those changes and rechecked after merge. Existing central tracker/checkpoints were read before claiming TODAY-04.

## LIVE access status

The browser's native credential protection blocks observation/typing in the sign-in form. The latest secure request returned `locator_invalid`; the earlier submission led to an invalid session. The user cannot type into the surfaced browser. Do not ask for passwords or one-time codes in chat.

A public health-endpoint read was also blocked by this browser/client, so the current production revision is NOT VERIFIED. Last previously reported production revision was `546395bebd8e8afd29e3b10ec9a1d8252bd31fbe`; do not treat it as current.

## Historical live evidence — not current acceptance

At 07/10/2026 00:25 Athens, LIVE on revision `6caa27b7e0667b453ef99db13360e3c0c6e561c1`:

| Καρτέλα | Normal | Maximize | Scroll | Κουμπιά/Actions | LIVE | PASS/FAIL/BLOCKED | PR/Revision |
|---|---|---|---|---|---|---|---|
| Προϊόντα → Μαζική αλλαγή τιμών | Άνοιξε· πραγματικό scroll έφτασε στο Preview | Άνοιξε· η φόρμα κοβόταν κάτω από το βήμα 2 | Normal: έφτασε Preview. Maximize: wheel δεν κινούσε τη φόρμα | Έλεγχος required-field· Preview χωρίς επιλογή εμφάνισε validation. Δεν έγινε επιλογή ή Apply | Historical live observation | FAIL τότε στο maximize· σήμερα θέλει επανέλεγχο | PR n/a · `6caa27b7e0667b453ef99db13360e3c0c6e561c1` |

No product/store was selected, no price applied, and no sale/payment/stock/fiscal mutation occurred. Static source inspection at that earlier revision suggested the maximized Products wrapper chain was not height-bounded; recheck current source and LIVE root cause after claim merge/access. Do not implement a broad overflow override.

## Current matrix state

- Bulk Price row above is historical evidence only, not a current production PASS/FAIL.
- All other Central Management tabs/sub-tabs/actions/screens: NOT YET ENUMERATED in the current audit and NOT TESTED in this page.
- No current production revision, post-deploy recheck, or overall PASS is claimed.
- Prior protected PASS records in the shared tracker remain unchanged.

## Next sequence

1. Complete this claim PR with green CI and merge before source edits.
2. Restore a valid secure sign-in path and verify exact current production revision.
3. Inventory every Central Management navigation entry and child screen.
4. Execute normal/maximized interaction and scroll-to-last-control checks, updating the matrix with precise evidence.
5. For each FAIL, isolate its root cause, make a scoped fix, run green CI, merge, wait for deploy, verify exact production revision and repeat LIVE regression before PASS.

