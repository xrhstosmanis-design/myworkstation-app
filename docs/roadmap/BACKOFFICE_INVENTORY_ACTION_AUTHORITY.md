## Current engineering delivery — 01/11/2026

Installed exacte1fcbe04 after full5136server+8backup/0FAIL/0SKIP exact PR/main CI and guarded41343627981, independently healthy19:56:32UTC. inventory.clear, inventory.bulk-zero and inventory.delete are explicit executable Owner-selected store rights, each with inventory.read dependency; no new profile default or automatic grant. Strict native draft/object/version/actor/replay guards and durable audit protect the operations. Catalogue21; the original proposal and candidate history below are historical for these three actions only. All other proposed rows remain unadmitted. No schema/company/worker authority added. Hosted acceptance NOT TESTED; this is not a functional PASS. Same full-scope owner retained.

Single next action: native audit/investigation read/export field classification, including expected/cost/actor visibility, before executable grants. Existing blind counter/finalizer fields and every accepted Owner invariant remain protected. Full release evidence: CHECKPOINTS/EVIDENCE/common-backoffice-permissions-20261101/inventory-actions-release.json.

## Source continuation 01/11/2026 — first three actions integrated, release/acceptance pending

The review below is preserved as the before-source proposal. The current source candidate implements inventory.clear, inventory.bulk-zero and inventory.delete, with inventory.read dependencies and unchanged legacy defaults. Exact actor/payload replay and transaction-time authority are mandatory, not an inferred role grant. Source21 executable keys; installed revision remains prior18 until exact CI/deploy verification. Other rows below remain proposals, not admitted rights. Hosted acceptance NOT TESTED. Remaining next batch requires native audit/investigation field visibility and exact read/export review before executable grants; no blind expected/cost visibility by default.

# Remaining native inventory actions: review before executable grants

Status: PROPOSAL / NOT AN ALLOWLIST / NO NEW RIGHT INSTALLED. Same retained CENTRAL-BACKOFFICE-ACCESS-01 owner. Existing18 grantable capabilities and defaults remain unchanged. This packet follows the shared InventoryV2Center/InventoryFastCount source integration; it does not certify hosted acceptance.

The existing per-store grant JSON can hold individually reviewed store capabilities without changing the current account schema. That fact is not permission to accept arbitrary strings, wildcard families, company operations or role impersonation. Only integrated exact operations may enter staffCapabilities, the Owner editor and native transaction guards together. Existing accounts receive no additional right through deployment or profile defaults.

## Verified native operation map

Paths below are relative to /api/inventory-v2. Routers are mounted in server/src/index.js separately: inventory-v2.js, inventory-v2-products.js, inventory-v2-import.js and inventory-v2-audit.js. A scan of only the first router misses the audit/import operations.

| Native operation | Current personal authority | Required future boundary |
|---|---|---|
| POST /stocktakes/:stocktakeId/count | inventory.count, with inventory.read | Keep stable event/version and existing ambiguity verification |
| DELETE /stocktakes/:stocktakeId/count/:lineId | Not admitted | Independent clear-count right; same parent/line/store, draft lock, version/event, immutable CLEAR audit and no stock posting |
| POST /stocktakes/:stocktakeId/count/bulk-zero | Not admitted | Independent selected bulk-count right; explicit exact line/version set and batch identity, native atomic validation and immutable audit |
| DELETE /stocktakes/:stocktakeId | Not admitted | Independent delete right; native nonfinal status/locking and explicit confirmation; never grant via create/count |
| POST /stocktakes/:stocktakeId/free | Not admitted | Independent conversion right; preserve counts and explicit change in final-posting scope; native draft guard |
| GET /stocktakes/:stocktakeId/audit and audit.csv | Not admitted | Separate read/export authority and exact object scope; classify expected, cost, prices and actor data rather than returning every Owner field |
| GET /stocktakes/:stocktakeId/investigation | Not admitted | Separate investigation read and explicit financial/evidence fields; no inferred company access |
| POST /stocktakes/:stocktakeId/import-counts | Not admitted | Explicit import authority, bounded validated rows and native transaction/replay/version controls; preserve finalization lock |
| GET/POST /zones | Not admitted | Separate zone read/manage rights and explicit selected-store object binding; no company-default list |
| POST /stocktakes/:stocktakeId/lines, attach-barcode and product-search | Not admitted | Review exact product/catalogue authority and company-versus-store effects before enabling; no implicit product creation or barcode edit from count |
| POST /stocktakes/:stocktakeId/access-grants | Not admitted | Security delegation review, bounded scope/expiry/uses, no self-elevation; issuer/grant revocation must fence issued counter access. Do not enable just by exposing the form |
| POST /stocktakes and /stocktakes/:stocktakeId/finalize | Existing inventory.create/finalize | Preserve existing create event and reason/confirmation semantics; no automatic conversion, posting or new actor |

The personal detail endpoint remains the redacted /api/backoffice-staff/inventory/stores/:storeId/stocktakes/:stocktakeId contract. An expected-quantity read right separate from finalization, and explicit cost/value visibility, require deliberate field-level design. Preserve the old finalizer visibility invariant until a reviewed compatibility decision; never render omitted values as zero. Browser/OS capabilities are not an application authorization boundary; any application export/print controls must still derive their data from authorized scoped reads.

## First bounded implementation and proof

Single next source batch: integrate independent clear-count, selected bulk-zero and draft-delete operations in the canonical server transactions, exact request classifier and Owner permission editor, then connect only those implemented controls in the shared native view. Keep actual EMPLOYEE identity and repeat live session/account/store/module/grant checks inside the writer transaction before replay or mutation. Native draft/object locks, version checks, audit, lifecycle, rollback and idempotency remain unchanged. Do not broaden a route prefix or alias an old read/create/count capability to a new destructive action.

Required isolated proof: each right alone versus read-only; unknown keys and unchanged legacy defaults; direct path/body/header/foreign line/stocktake/store/company attacks; revoke between read/write; concurrent count/finalize/clear/delete; identical replay/conflicting event and native rollback; unchanged Owner behavior and controls. Full exact PR/main CI and guarded healthy release precede measured hosted LAB acceptance. No accepted count, finalization, grant or stock posting is repeated merely to create evidence. QR/delegation, audit/value visibility and imports follow their own native review; unintegrated controls remain absent.
