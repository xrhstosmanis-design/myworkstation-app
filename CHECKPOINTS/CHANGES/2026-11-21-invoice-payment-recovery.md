# INVOICE-PAYMENT-RECOVERY-01 — before-source claim, 21 November 2026

Owner /root of the invoice-payment recovery conversation. User explicitly requests owner and delegated responsible-person access, photo/assistant reading after failed QR/myDATA lookup, same payment/draft, reviewed posting. Claim only the independently scoped recovery bridge. Retain No5 general capability/installer owner, No04 assistant/line parser owner, No02 provider/original reader owner and existing cash/shift owner. Do not change their shared files until a precise coordinated boundary is recorded.

Observed source on 9f03779dc7a61830c6fcb1be796039a2afb7e66b:
- StoreSupplierInvoiceFast already bundles up to five photos, supports camera/mobile QR and starts the assistant. Its ordinary PAID branch creates a payment; do not instruct a user with an existing expense to take that branch.
- OtherExpenseReviewCenter exposes existing-expense reassociation only on Platform Admin. supplier-advance.js internally permits OWNER, but both corresponding HTTP routes requireSuperAdminSettlementReview. Delegated approvals.read is read-only and is NOT authority to reassociate.
- Durable PLAIN_CAPTURE intentionally resolves close obligation without creating an AI job/draft. commerce-pos-v244.js rejects its conversion at the old generic handoff boundaries with PENDING_INVOICE_SOURCE_KIND. Do not remove those guards globally or claim that capture means warehouse receipt.
- Existing supplier advance allocation requires a confirmed settlement and a CREDIT draft of the same supplier/store. Preserve this evidence/approval boundary.

Bounded implementation sequence:
1. New store-scoped recovery action and UI using canonical company/store plus original transaction. Owner or explicit fresh delegated action grant; reads and writes recheck grant, store lifecycle and modules. No implicit grant to approvals.read, no role spoof or global data. Coordinate any shared No5 registry/provenance edits with its retained owner; independent helper/UI/test files may be developed only after this claim merges.
2. Explicit opt-in promotion of an existing PLAIN_CAPTURE to one assistant job and one editable draft using saved checksum-verified originals. Keep proof immutable and recognize both source identities durably; lock transaction/store and enforce replay identity. Existing rejection stays on generic paths; no free-standing new upload/payment. Do not auto-trigger paid AI on a mere attachment.
3. Existing OTHER_EXPENSE reassociation, confirmed supplier advance and draft allocation remain separate states. Preserve actual original payment amount/time/session, review/audit and pending proof. Display unresolved prerequisites; never reinterpret an unconfirmed advance as invoice paid.
4. Attach all physical pages to same draft; reuse existing assistant/row review; no parser/provider changes or hidden cost/wallet bypass. Finalization requires existing approval/stock and active-inventory policy; diagnostics do not post stock.

Required automated proof: exact owner/same-store success; unauthorized staff/read-only/foreign company/store/module/lifecycle denial; fresh revoke before commit; concurrent/replayed request exactly once; failure rollback; original payment/cash/shift/stock unchanged; same original bytes; same job/draft after retry; deliberately deleted draft not resurrected; generic PLAIN_CAPTURE guard preserved. UI stale store/payment/cancel response fencing and retry with same idempotency identity.

Current evidence: existing narrow plain-capture LAB PASS and ordinary signed-ledger close USER PASS are protected and must not be replayed. New combined recovery and delegated action NOT IMPLEMENTED / NOT TESTED. No runtime changes, production records, AI spending or stock action in this claim. One grouped final existing-LAB session after exact CI/release. No new user role switching requested now.

Next action after green merged claim: implement isolated recovery eligibility/transition contract and tests, then integrate only coordinated runtime boundaries; do not change No5/No04/No02 owners in parallel.

## Isolated read-only recovery contract after claim4115

Claim4115 merged170182adb0742313ad465cf2feca5c4820a9389e after3applicable CI44876650247 successes (2docs-runtime skips). New owned files only: server/src/lib/invoice-payment-recovery.js and server/test/invoice-payment-recovery.test.js. No existing route, shared permissions/provenance, assistant/parser/provider or financial runtime changed.

The canonical-snapshot projection distinguishes ASSOCIATE_SUPPLIER, CONFIRM_ADVANCE, UPLOAD_ORIGINAL, REQUEST_ASSISTANT, OPEN_EXISTING_JOB and OPEN_EXISTING_DRAFT. Every result explicitly forbids creation of a payment or stock posting. It rejects reversed/foreign or incompletely linked inputs, stale draft identity and deliberately missing remembered drafts. Original page payloads are rehashed with bounded size/page counts; calendar date, number and amount must match. Inputs must be canonical server snapshots after real authorization; this helper is NOT authentication, MIME/image decoding, a job creator, transaction lock, HTTP route or a native DB acceptance test.

Node20 targeted14PASS/0FAIL/0SKIP. Tests cover two-page original integrity, invalid finances/calendars, foreign scope and missing linkage, pending advance prerequisites, retry with existing job/draft and no resurrection. They use synthetic snapshot/byte fixtures, not real invoice OCR or new LAB actions. No payment/AI/draft/stock writes occurred.

Integration remains BLOCKED ON COORDINATED SHARED BOUNDARIES: No5 retains shared capability mapping/service and COMPANY source-provenance. Requested exact action is a new store-scoped supplier recovery grant (no auto grant from approvals.read), checked before access and again in the transaction; no general authority takeover. No04 retains assistant/line runtime; explicit capture promotion must lock and preserve the original capture proof, create/reuse one job/draft and pass through the normal wallet/assistant path. Existing generic PLAIN_CAPTURE guards remain unchanged. Do not label this preparatory contract as an installed feature or full user flow.
