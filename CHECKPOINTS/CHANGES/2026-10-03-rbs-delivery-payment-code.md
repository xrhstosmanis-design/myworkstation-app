# KAT delivery payment code — observed routing FAIL, fix awaiting acceptance

Owner same CAP conversation, branch agent/rbs-delivery-payment-code-20261003; standalone CAP route only, independent Gate6 online-order ownership unchanged.

Previous PR1672 CI4202 and main CI passed; Renderdep-db0fpc49v7es73b8fp60 exact04530aad3121f3932eb6fa10a448346fe0d777d3 live13:04:17Z. 16:13:56 Athens: request2ed83b7d-ea82-4dcf-9a5a-eaa519f42c02, KAT-POS-02, ATHINA MARI, 7UP330ML SKU00582 qty1 manual0.01, DELIVERY_DELAYED, CR/2. Owner says sent to store EFTPOS. Request then DECLINED/NO/saleIdNULL; owner image131547 shows non-success toast and preserved cart. No payment reported. Fresh direct no-sale status observed; stock/shift full before-after controls not independently measured for this attempt, NOT TESTED.

Evidence images131730/131823: Kiosk STORE EDPS paymentMethodCode2, Delivery3 TID13248261, secondPOS5. Delivery deferred code and helper EFTPOS ordinal blank; do not infer these from row number. Official RBS CapDriverService-with-examples.zip protocol CR specifies first numeric field is register payment method (not terminal ordinal). No switch to LR or fiscal timing change.

Causal change resolves KAT standalone delayed CARD code3 only. Counter CARD2/CASH6 preserved. Unknown-store delayed mapping rejected with existing409 mapping gate rather than guessing KAT code. No mutation of Kiosk, CAPDriver, EFTPOS settings, database, declined request, prior erroneous0.01 sale or stock. Existing pending/liveness/VAT/auth/tenant/claim-once/YES-only idempotent finalizer protected.

Tests: resolver drives encoded command with exactly one CR for KAT delivery3/counter2/cash6; rejects other-store unconfirmed delayed mapping; actual route wires store/channel/method. Existing CAP tests preserve outcome and no-resend behavior. CI full build/server/invariants/isolated E2E and exact live deploy required. AWAITING physical acceptance; not delivery PASS.

Next acceptance only after exact deploy: fresh originating shift and SKU00582 baseline/control read, one new owner request selects Delivery; confirm physical request arrives at Delivery EFTPOS, pending saleIdNULL with stock/shift unchanged, then after successful payment/receipt one YES, one ISSUED sale/payment/stock/audit on original shift. Do not replay declined request. Record other-terminal control as NOT TESTED if no second active shift exists.
