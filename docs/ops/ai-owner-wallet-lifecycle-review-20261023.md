# AI wallet activation — bounded lifecycle catalogue review

Status: REVIEW REQUIRED / NOT ACTIVATED. Retained wallet owner feat/ai-owner-wallet-20261022; existing central lifecycle integration owner and six automatic-dispatch table scope remain untouched. This document is a review packet, not an executable manifest, DDL command or authority to delete financial records.

## Observed prerequisite

Read-only production checks23Oct14:06UTC found AiOwnerWallet and AiOwnerWalletEntry absent;14:19UTC found StoreLifecycleFence and StoreLifecycleExecution absent. Native Platform Admin shows wallet runtime DISABLED. Current reviewed manifest contains none of the four wallet tables. store-lifecycle-executor.js validateDatabase rejects relations outside knownTables and rejects every unreviewed storeId-bearing table. AiOwnerWalletEntry includes nullable storeId. Turning the runtime on and opening the wallet would lazily create all four dedicated tables; that must be coordinated with the reviewed catalogue before the trial. No such production activation or DDL has been performed. These source observations are not a measured lifecycle/LAB PASS. Refresh all catalogues and active-job controls before any later change.

## Exact owned schema surface

The review packet CHECKPOINTS/EVIDENCE/ai-owner-wallet-20261022/trial-lifecycle-review.json contains exact source DDL and SHA256 for AiOwnerWallet, AiOwnerWalletEntry, AiOwnerWalletNotice and AiOwnerWalletAudit. Source3100/06034c95 is already green merged. Its focused grant/native/HTTP/UI tests passed, but they do not prove compatibility with the complete production lifecycle catalogue. Existing physical indexes, FK/check/unique constraints and integer limits must match an isolated native oracle before adoption.

## Protected financial semantics

The balance is company-wide. A selected-store reset must retain company credits, available/reserved funds, notification cycles and audit history; it must never refund, duplicate, erase or move a credit to another company. CREDIT entries have no storeId. USAGE entries attribute provider calls to a selected store. This attribution must receive explicit ownership/archive/reset/KEEP and retention review; never infer deletion selectors from reference strings, actorId, tariff/usage/detail JSON or a column name alone. Unknown/REVIEW holds remain durable and do not become zero-cost settlements. Disabling charging keeps balances/history and settles preexisting holds under their original rates.

## Required joint integration evidence

1. Publish a bounded before-source claim for these four tables, preserving the assigned lifecycle/automatic-report scope and every existing canonical node, ownership selector, policy and accepted behavior. Review all hazardous JSON/actor/reference columns explicitly.
2. Verify isolated native PostgreSQL schema/constraints/indexes and complete-catalogue consistency, actual company isolation, safe store-reset KEEP behavior and exact archive/copy/restore results without reissuing business transactions. Review both shared canonical/proposed manifest pairs as required by existing tests. No deletion/RESET performed as part of trial funding.
3. Before production provisioning/promotion, refresh the actual entire catalogue and confirm no lifecycle job/lease/pending reopen; use the reviewed operator/maintenance route rather than sandbox SQL or changing guard rules. All charging/company/email gates stay OFF through setup.
4. Promote only the reviewed bounded metadata; verify ordinary guarded app and backup rollouts, exact image/hash and fresh worker capability pulse. Core install-only enrollment, if needed, must never invoke controller.start or RESET as a shortcut.
5. After measured isolated LAB grant acceptance, record one separately identified owner-authorized real-company trial grant with fresh before/after/control evidence and a stable private reference. Preserve its internal TRIAL_GRANT meaning; never use receiptConfirmed. Real invoice/Owner charging additionally requires verified provider tariffs; no invented Azure rate or silent model replacement.

No ownership transfer, payment receipt, actual trial grant, provider call, email, production schema/configuration/guard change, RESET or restore is authorized by this document alone. User authorization for the selected-company trial already exists; it is not a request to ask again. The remaining prerequisite is technical integration and measured acceptance, not another generic approval.
