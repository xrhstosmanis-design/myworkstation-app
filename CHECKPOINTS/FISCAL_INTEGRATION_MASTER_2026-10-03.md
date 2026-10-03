# MyWorkStation — Fiscal / cash-register integration master note

Date: 2026-10-03
Purpose: shared reference for every page/agent working on fiscal integration. Do not rediscover or change the selected KAT path without new evidence.

## Selected KAT path — RBS AURORA + existing CAP Driver v1

- Target fiscal device: RBS AURORA (DNQ), serial evidence 24001047.
- Existing Kiosk Manager installation uses the first/older RBS CAP Driver path. Keep Kiosk Manager, RBS, CAPDriver, EFTPOS and Windows settings unchanged unless a separate approved migration is opened.
- CAP Driver service uses work folder C:\\capture and code page 1253. The observed service communicates with the register over the existing configured connection.
- MyWorkStation uses a local authenticated Writer on the store PC. Cloud checkout creates a single-use fiscal request; Writer polls/claims it and writes exactly one Kiosk-compatible rbs.<request-id>.txt command into C:\\capture. No automatic resend after uncertain outcome.
- Pairing is one-time/short-lived; Test-Connection is non-claiming and must not create a fiscal command. BackOffice must show a recent real Writer heartbeat before fiscal checkout.
- Cash code confirmed from Kiosk evidence: 6. Card code: 2. Card remains pending for operator Yes/No in this first-driver flow. Cash initial acceptance requires physical receipt verification.
- VAT rate alone never chooses the register department. Product-level VAT department is authoritative. Confirmed KAT example: Kiosk VAT code 42 → register department 2 → 13% general goods. Product VAT rate must match the selected VAT department or checkout fails closed.
- Current physical acceptance is NOT PASS. On 03/10 a controlled 7UP 330ML €1.20 cash attempt failed before Writer claim; no receipt and no rbs command. Production logs identified Prisma regclass deserialization; PR #1645 was merged as 88def88682fc436416b7951ca03ef276f8fa1e25. Exact Render deployment and physical retest are still required.

## Other fiscal solutions discussed / retained as alternatives

### RBS newer CAP Driver with OUTPUT folder
- Separate path from the selected v1 integration. It writes success/failure responses to an OUTPUT folder.
- Existing captured responses include OK and EFTPOS Payment Failed. Owner reports this path is too slow, so it is not selected for the first KAT rollout.
- Do not mix its response semantics/configuration with CAP Driver v1.

### Certified electronic-invoicing provider
- Architectural alternative for businesses/scenarios where provider-based fiscal/e-invoicing issuance is selected. It can reduce dependence on a local cash-register command-file bridge, but provider credentials/API, legal document flows, retail/B2B scope, offline behavior and payment/POS integration must be verified for the chosen provider before implementation.
- Do not assume that the current KAT RBS setup is already provider-enabled.

### AADE timologio / myDATAapp / direct myDATA
- Keep separate from the cash-register fiscal receipt path. myDATA transmission/receipt data is not by itself proof that a physical retail receipt was issued by the RBS register.
- MyWorkStation already has separate myDATA/invoice workflows; do not reuse those as a substitute for CAP Driver receipt confirmation.

### Different cash register / fiscal hardware
- A future hardware choice should prioritize a documented vendor API/SDK, deterministic acknowledgement, supported EFTPOS integration, clear VAT-department mapping, idempotent transaction identity, support for multiple POS terminals and reliable local/offline behavior.
- Migration to another device is a separate project; do not alter the KAT AURORA while the current controlled integration is under acceptance.

## Safety / acceptance rule

One fiscal transaction identity → at most one delivery. Never retry/reprint automatically after timeout, internal error, network loss or uncertain state. Before any physical retest: exact green revision must be LIVE, Writer ONLINE, C:\\capture free of pending rbs commands, previous attempt reconciled, product VAT department verified. PASS requires a physical receipt plus matching MyWorkStation transaction/shift/stock state.

## Related checkpoints

- CHECKPOINTS/CHANGES/2026-10-02-rbs-capdriver-v1-operator-confirm.md
- CHECKPOINTS/CHANGES/2026-10-03-rbs-capdriver-regclass-runtime.md
- CHECKPOINTS/ACTIVE.md
- CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md
