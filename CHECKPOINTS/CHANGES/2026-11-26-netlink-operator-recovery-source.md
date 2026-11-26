# Netlink: complete reviewed paid cards from the operator POS

26Nov2026; /root; retained claim PR4262 / main3313308. Explicit owner request: the normal operator is the primary user and recovery must be centrally available in the store POS across shifts. No privilege promotion or PIN change.

## Result

- Scoped STORE_OPERATOR employees see reviewed RECOVERY_READY cards from other operators/shifts. Ordinary unreviewed intents stay isolated. A canonical audit must bind the reviewed request, sale/checkout, dispatch timestamp, numeric replacement ID and reviewer.
- Privileged provider review remains mandatory and separate. Completion rechecks the original native payment/fiscal/line manifest, review fingerprint and connection before atomic claim. Recovery flag remains required; global new issuance stays OFF.
- Dispatch and completion audits record the actual completing actor. The winning actor can reopen the same encrypted saved voucher after refresh. Original-operator and privileged access is preserved; a different losing/unrelated employee cannot read another completed PIN. No additional payment, checkout, sale, fiscal receipt or stock movement.
- Same-store operator switches remount the common panel, discarding prior-operator state and delayed results. Existing voucher/thermal print flow is reused at the store computer.

## Validation and limits

68 targeted native PostgreSQL SQL/HTTP, contract and mounted tests PASS, zero failures/skips. Two different ordinary POS employees race for one reviewed card; exactly one provider execute and one winning audit actor. Winner receipt/refresh/replay works without another execute; loser/foreign-store/foreign-company/missing-review denials hold. Native sale/payment/fiscal counts and frozen original intent remain unchanged. Existing rollback/evidence/uncertain no-repeat checks retained. Mounted employee completion exposes no review form or new-checkout action; operator switch rejects stale private state. Node20 frontend build PASS; git diff check PASS. Full CI and central deploy still pending.

No production card issue, recovery dispatch, new sale, payment, refund or fiscal correction was performed. Existing original paid case remains reviewed and pending. Real operator fulfillment/PIN/physical print is NOT TESTED; prior catalogue/report and privileged metadata-review PASS remain narrow. User's one final store POS acceptance follows installation. Do not label all Netlink complete from CI alone.
