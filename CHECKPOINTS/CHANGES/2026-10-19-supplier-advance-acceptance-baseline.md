## 19Oct23:33 Europe/Athens — LAB method revision BEFORE ANY WRITE

Actual existing Backoffice UI says cash-shift payments are unavailable for this support actor/current LAB context. Do not bypass the permission/stale-shift guard, grant same-shift permission, close/reopen a shift or use a lower-level cash route. The earlier proposed CASH_SHIFT action below is HOLD/NOT TESTED and was NOT submitted.

Use instead one new BANK_TRANSFER0.02 in the existing virtual LAB ledger, invoice allocation0.01 and declared advance0.01, note LAB-SUPPLIER-ADVANCE-01-20261019 / VIRTUAL NO REAL MONEY. There is no connection to an actual bank or money transfer. Expected shift remains0transactions/cash-card-IRIS0/deducted payments0/drawer9.40; external payment has sessionIdNULL/subtractFromShiftFALSE. One new StoreTransaction0.02/settlementPENDING_REVIEW/allocation0.01/virtualBankLedgerEntry-0.02 PENDING_REVIEW; virtual total-515.43→-515.45, pending-206.67→-206.69, confirmed-308.76 unchanged. Document faces/status/stock/control hashes unchanged. Later explicit virtual human confirmation moves this same0.02 from pending to confirmed without cash or new bank/payment record, then allocating remaining0.01 makes total invoice allocations0.02 without another disbursement. Fresh after/before publication is required between actions. This is external virtual-flow acceptance only; cash-disbursement source has native CI proof, not a physical/CASH_SHIFT LAB PASS. Actual6.17 reassociation remains separately bounded as recorded below.

Bank before:
```json
[
  {
    "confirmed": -308.76,
    "entries": 31,
    "hash": "a47fa1ede8dbbc7924a251834b7a7fcd",
    "id": "765c28e7-bbaa-4d6c-93a5-ab75cb39d5a0",
    "name": "Ταμείο Τράπεζας",
    "pending": -206.67,
    "totalAmount": -515.43
  }
]
```

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

## Separate virtual LAB baseline — 19Oct23:26 Europe/Athens

Standing repository virtual-LAB authorization only. Store ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ/cmtpopbgo000trhb5ng9ytiru, companycmtpopbgk000prhb5qc60zxus, existing MAIN shift a3494bb3-61cf-447c-9707-27311f35708c opened by LAB POS2; browser actor current authorized SuperAdmin Χρήστος Μάνης, cloud desktop not physical POS hardware. Existing supplier COFFEE UNION ATTICA Ε Ε/90d12463-5425-471e-ae21-7f1f09eeaff1, invoiceΤΔΑ0009683/dbb59d85-ebed-4af9-984b-17055b7cd6e0 is only allocation target; no upload/reapproval/replay of old payment. Unique new note LAB-SUPPLIER-ADVANCE-01-20261019 / VIRTUAL NO REAL MONEY.

After exact source CI/main/ordinary guarded healthy release and fresh identical baseline, perform one new virtual CASH_SHIFT payment0.02 allocating0.01 to the invoice and explicitly declaring0.01 advance, with no-document responsibility. Expected shift count0→1, cash/card/IRIS sales0unchanged, deducted payments0→0.02, drawer9.40→9.38, one pending settlement0.02/one allocation0.01, invoice face/status/stock hashes and both other-store controls unchanged. This is simulated LAB money, never a real bank charge/fiscal/stock operation. Record actual after values and publish before any subsequent confirmation/allocation. Future planned virtual confirmation makes this same receipt CONFIRMED, without second cash; then allocate only the remaining0.01 with no new payment. Each subsequent action requires refreshed before values recorded first. Any unexpected delta is HOLD; do not replay to repair evidence.

```json
{
  "capturedAt": "2026-10-19T20:26:14.928412+00:00",
  "controls": [
    {
      "hash": "d41d8cd98f00b204e9800998ecf8427e",
      "id": "cmuk8gxui000ppabfykdxwb1y",
      "name": "ΕΡΓΑΣΤΗΡΙΟ ΑΠΟΜΟΝΩΣΗΣ ΕΤΙΚΕΤΑΣ",
      "signedamount": 0,
      "transactions": 0
    },
    {
      "hash": "d41d8cd98f00b204e9800998ecf8427e",
      "id": "cmv2qanca000psigeizep8o9m",
      "name": "N40 CONTROL 20261010",
      "signedamount": 0,
      "transactions": 0
    }
  ],
  "invoice": {
    "aiConfidence": null,
    "companyId": "cmtpopbgk000prhb5qc60zxus",
    "createdAt": "2026-09-25T13:27:22.208",
    "createdByUserId": null,
    "documentDate": "2026-08-13T00:00:00",
    "documentNumber": "ΤΔΑ0009683",
    "documentType": "INVOICE",
    "id": "dbb59d85-ebed-4af9-984b-17055b7cd6e0",
    "imageRef": null,
    "paymentTransactionId": null,
    "purchaseOrderId": "03483d5d-c394-4ddc-a5bf-9aaec78af6b5",
    "settlementMode": "CREDIT",
    "sourceType": "POS_OCR_DRAFT",
    "status": "DRAFT",
    "storeId": "cmtpopbgo000trhb5ng9ytiru",
    "supplierId": "90d12463-5425-471e-ae21-7f1f09eeaff1",
    "totalGross": 958.76,
    "totalNet": 832.29,
    "totalVat": 126.47,
    "updatedAt": "2026-09-25T13:27:22.208"
  },
  "invoiceAllocations": null,
  "shift": {
    "actualOperational": null,
    "cardSales": 0,
    "cardVariance": 0,
    "cashSales": 0,
    "closedAt": null,
    "closedBy": null,
    "closedByName": null,
    "closingCoins": null,
    "closingCustody": null,
    "closingDrawer": null,
    "closingNote": null,
    "closingSafe": null,
    "companyId": "cmtpopbgk000prhb5qc60zxus",
    "duplicateReviewJson": [],
    "eftposTotal": 0,
    "expectedOpeningOperational": 9.4,
    "expectedOperational": null,
    "expenses": 0,
    "id": "a3494bb3-61cf-447c-9707-27311f35708c",
    "nextOpeningTotal": null,
    "openedAt": "2026-10-16T19:48:24.748905+00:00",
    "openedBy": "8e6a896f-8735-4ff6-a3dc-1ceb1741b578",
    "openedByName": "LAB POS 2",
    "openingCoins": 0,
    "openingCustody": 0,
    "openingDrawer": 9.4,
    "openingNote": null,
    "openingOperational": 9.4,
    "openingSafe": 0,
    "openingVariance": 0,
    "shiftLabel": "Βάρδια",
    "status": "OPEN",
    "storeId": "cmtpopbgo000trhb5ng9ytiru",
    "terminalPos": "MAIN",
    "updatedAt": "2026-10-16T19:48:24.748905+00:00",
    "variance": null
  },
  "shiftTransactions": {
    "cardSales": 0,
    "cashSales": 0,
    "count": 0,
    "deductedPayments": 0,
    "hash": "d41d8cd98f00b204e9800998ecf8427e",
    "irisSales": 0
  },
  "stockMovements": {
    "count": 95,
    "hash": "f69aa9d0bec0bf377f1b9645262e5aba",
    "latest": "2026-10-12T20:42:11.404"
  },
  "stockProducts": {
    "count": 99,
    "hash": "f96d09fe90906df3b26776483c8d5d61"
  }
}
```
