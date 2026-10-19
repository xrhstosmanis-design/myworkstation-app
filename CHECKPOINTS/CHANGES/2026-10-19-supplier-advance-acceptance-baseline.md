# SUPPLIER-ADVANCE-01 — PRE-ACTION baseline

Recorded 2026-10-19T20:22:58.561Z UTC; all user-facing action times Europe/Athens24h. Owner fix/supplier-advance-20261019; source PR2889 remains AWAITING full native CI/exact release/measured acceptance. This baseline does not authorize a second700EUR payment, invoice approval or stock/fiscal replay.

Intended real correction after verified release and fresh unchanged hash check: existing Diadoxou OTHER_EXPENSE6.17 is associated with existing active supplier ΜΑΝΤΖΙΛΑΣ ΧΡΗΣΤΟΣ ΚΑΙ ΣΙΑ ΕΕ /7b9b8117-bbc8-4235-accd-e716fd7f977c. User requested correction19Oct23:05. Retain original transaction id, amount, shift, time, actor, description/evidence and cash deduction; create only supplier association, one PENDING_REVIEW settlement and audit; retire old pending expense review. Do not confirm171.04 or6.17 automatically. Existing522.79 and171.04 payments must retain exact hashes and total of all three remains700.00. This is an intentional real record reassociation, not a test payment or global cash/stock financial PASS during active trading.

Before values:

```json
{
  "amount": 6.17,
  "existingReclassificationAudit": 0,
  "existingSettlements": 0,
  "expenseReview": {
    "companyId": "cmulmjjoa000oqlbfyi0h53ju",
    "createdAt": "2026-10-19T17:23:48.936292+00:00",
    "id": "ab374dca-3e82-42e5-8243-32f39bbe37b1",
    "reviewNote": null,
    "reviewedAt": null,
    "reviewedBy": null,
    "status": "PENDING_REVIEW",
    "storeId": "cmulmjjoc000qqlbf2bn2ifj0",
    "transactionId": "pay_90df5323171a14ebfa07a09df33faa7cee27baf51f841652e8cd6813dc7be907"
  },
  "immutableHash": "bae93aba8e9871730c19ef4251558f7e",
  "occurredAt": "2026-10-19T17:23:48.931861+00:00",
  "originalHash": "717922fd9e6a34de3a559fd9b625018d",
  "protectedPaymentHash": "ca2b7895c68f16fc64c66f5ba1e4962a",
  "sessionId": "248ffdac-2931-4049-8479-2ab37e452da7",
  "storeId": "cmulmjjoc000qqlbf2bn2ifj0",
  "supplierId": null,
  "threePaymentTotal": 700,
  "transactionId": "pay_90df5323171a14ebfa07a09df33faa7cee27baf51f841652e8cd6813dc7be907",
  "type": "OTHER_EXPENSE"
}
```

Immediately before the action re-read these targeted values; any changed original hash/amount/store/links/review status is a HOLD and needs a fresh baseline. After action compare immutableHash and protectedPaymentHash, total700 and transaction count3, original identity/time/shift, one supplier settlement pending and one original-preserving audit/cashDelta0. Do not infer global financial/stock invariance from ongoing-store aggregate differences.

Separate virtual LAB new-payment/advance/allocation acceptance requires its own fresh store/terminal/operator/shift, positive payment method, exact invoice reference and control/stock/ledger before snapshot published before action. No LAB write is performed or claimed by this baseline. All other owners preserved. Single next action: merge this documentation green, complete full source CI/guarded exact healthy release, then fresh baseline comparison and bounded measured acceptance.
