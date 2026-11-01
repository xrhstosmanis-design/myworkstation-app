# Company authority: compatibility packet before implementation

Status: PROPOSAL / NOT INSTALLED / NOT A GRANT. Retained CENTRAL-BACKOFFICE-ACCESS-01 owner. This packet supports the requested complete function coverage; it does not add an executable permission or modify production schema, actors, profiles or workers.

The current personal access model stores explicit per-store capabilities in BackofficeStaffGrant. Parameters, master data, bank settings and security configuration can affect the entire company. An assigned store, a role label, all store rights or a catalogue entry must never imply company authority. Actual personal identities remain EMPLOYEE; native authorization must not impersonate OWNER or SUPER_ADMIN.

## Proposed explicit contract

Keep the existing store grant structure. Add a separate, Owner-selected companyCapabilities array for the account's own company, containing only individually integrated and tested company operation keys. Omission by an older client preserves existing policy; a new account starts with none. Unknown, wildcard, unimplemented, foreign-company and platform-operation keys are refused. Company selection follows the account's existing company binding; this is not cross-company membership.

Proposed persistence is a companyCapabilities JSONB NOT NULL DEFAULT '[]' field on the company/security-owned BackofficeStaffAccount. This is a design proposal, not an instruction to run ALTER TABLE or startup migration. Do not encode company rights in a hidden store grant, audit event, role label or ordinary user preferences.

Account revision fencing, live Owner authority, target account/company checks, session-version increment, session revocation and immutable before/after security audit remain in the native account transaction. No account gains rights through deployment or default role presets. A delegated permission administrator additionally needs an explicit delegation boundary and cannot promote its own authority or create Owner/platform identities.

## Current recovery evidence and required coordination

Read-only review at the shared UI foundation:

| Reviewed source | SHA-256 of source file | Current staff account columns |
|---|---|---|
| ops/backup/lifecycle/manifest.json | ebcf6739449cca8049dae3e74e8ab8842e51b92447a7e31b42f303c7dae3f9db | 8 |
| ops/backup/lifecycle/monthly-inventory-capture-manifest.proposed.json | 363d168d3cdaad93eb350da616a764f73ac3556b92d37d09bd47ecd453fece03 | 8 |

Both reviewed knownColumns lists currently contain userId, companyId, username, pinHash, active, revision, createdAt and updatedAt. Adding the proposed field changes the approved schema shape. Preserve the independently owned monthly FULL-profile transition, signed worker capability and reset/restore semantics. These source hashes are historical review evidence, not permission to install them or a substitute for a fresh actual runtime preflight.

Before schema activation, prepare and review the exact app/worker/profile pair, explicit new column ownership, backup/restore treatment, before/after schema and guard hashes, nonfinal-operation drain and a concrete rollback plan. Do not silently rewrite an installed manifest or allow an unknown column. Changing only the application must not strand the existing recovery worker. Optional feature flags alone do not establish schema compatibility.

## Native enforcement and acceptance

Every integrated company endpoint must resolve the live personal account and current session, exact company capability and company/module licence. Revalidate in the canonical writer transaction before replay lookup or mutation, retaining native actor/audit/idempotency and business/fiscal/finalization rules. An HTTP method or URL prefix is never an allowlist. Company rights do not authorize platform administration or bypass selected-store/object guards in store functions.

Isolated acceptance must cover empty defaults, unchanged legacy accounts, unknown/wildcard refusal, read without write, explicit company authority versus store-only grants, foreign company/object/body/header attacks, revocation between read and write, stale policy revision, native rollback/replay and unchanged controls. Test old/new app-worker schema compatibility and fail-closed mismatches separately. Hosted financial/stock testing still requires fresh before/after and control evidence.

Single next integration action in the visual scope is the actual InventoryV2Center / InventoryFastCount adapter, preserving blind-count redaction, per-action controls and ambiguous-write verification. CashControlPanel and CommerceLauncher follow. Company schema activation remains a separate reviewed compatibility step, not a shortcut for those store-scoped integrations. The entire all-functions request stays OPEN until applicable operations have native enforcement, common UI and recorded acceptance.


## Native inventory adapter review before the next source batch

Current InventoryV2Center owns the ordinary Owner layout and embeds InventoryFastCount. Its initial list, zones, audit/export, access-grant, free-conversion, deletion, product-add, count-clear and bulk-zero calls are not admitted by the existing personal inventory.read/count/create/finalize keys. Do not mount it with a transparent unrestricted API or implement a broad inventory URL-prefix bridge.

The personal detail endpoint currently returns only id/name/status/finalizedAt/storeId and redacted lines. It exposes expectedQuantity only with a fresh inventory.finalize grant and never supplies unitCost or salePrice. FastCount currently renders missing costs as zero and derives differences from missing expected quantity; that presentation would be false for a blind counter. The next adapter must suppress those columns, selected-item fields and footer totals when the corresponding data is absent, without synthesizing zero or fetching the unredacted Owner detail. Barcode arrays require explicit display/search normalization; they are not a single owner barcode field.

Reuse the native components through explicit delegated inputs and callbacks, keeping Owner defaults intact. Guard each create/count/finalize control and deny unintegrated zone/grant/free/delete/clear/bulk/export/product events. Preserve the personal orchestration's exact selected-store/object checks, late-result fence, request identity, countVersion and clientEventId, failed-write verification and navigation locks. An ambiguous count must retain the identical operation for verification before any further count; an ambiguous finalization uses read verification. Counter/read-only sessions must never acquire finalize authority because the shared component renders.

Required mounted comparison: real Owner and personal components, read-only versus count/finalize separately, blind fields absent rather than zero, multiple barcode lookup, stale response/store switch, live revocation, repeated/ambiguous count and unchanged Owner controls. Then full exact PR/main CI and guarded release; no stock or finalization PASS follows from isolated UI tests. No adapter source is included in this compatibility packet.
