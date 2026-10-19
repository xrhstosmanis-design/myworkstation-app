## 19Oct23:53 Europe/Athens — same virtual receipt confirmed / next allocation not submitted

Prior observationPR2900/head0c75cc7a3dad88d8203ceed1f64ec745af58db81 passed docs/Windows and merged6c4e61d4fa6f72951a93e7380e03f345a2ddf63c BEFORE confirmation. Fresh23:52:26 snapshot matched every prior after field except capture time. Actual canonical SuperAdmin Payments filter MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ; unique note, supplierCOFFEE UNION, amount0.02, allocation0.01 and displayed advance0.01 verified. Explicit LAB-only note then one confirmation. Actual success message: supplier card updated once.

Observed23:53:31: same transaction/settlement/allocation IDs and full StoreTransaction row byte-identical; settlementCONFIRMED. Bank count32/total-515.45/protected-old-bank hash unchanged; pending-206.69→-206.67, confirmed-308.76→-308.78 exactly0.02. MAIN/control/stock/invoice faces and allocation0.01 unchanged. No real bank/payment, physical cash, stock/fiscal or real-store write.

FLOW STILL IN PROGRESS; no whole PASS/manual claim. Next single action only after this evidence is green/merged and refreshed unchanged: in same LAB choose existing confirmed advance77f43282-4377-4782-97d3-bc7e3ab17c6b, remaining0.01, allocate0.01 to same invoiceΤΔΑ0009683. Expected same transaction/bank count/status/amounts, same cash/stock/control/document faces, same allocation id amount0.01→0.02 and remaining advance0.00, exactly one new allocation Audit with cashDelta0, no new disbursement/drawer event. Never submit a second payment. Real6.17 remains separately pending correction.

Before existing-advance allocation:
```json
{
  "bank": [
    {
      "confirmed": -308.78,
      "entries": 32,
      "id": "765c28e7-bbaa-4d6c-93a5-ab75cb39d5a0",
      "name": "Ταμείο Τράπεζας",
      "pending": -206.67,
      "protectedHash": "a47fa1ede8dbbc7924a251834b7a7fcd",
      "totalAmount": -515.45
    }
  ],
  "capturedAt": "2026-10-19T20:53:31.202901+00:00",
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
  "invoiceAllocations": [
    {
      "amount": 0.01,
      "companyId": "cmtpopbgk000prhb5qc60zxus",
      "createdAt": "2026-10-19T20:50:16.538588+00:00",
      "id": "7fa44884-706a-4af7-ad43-75873089bf58",
      "purchaseDocumentId": "dbb59d85-ebed-4af9-984b-17055b7cd6e0",
      "settlementId": "77f43282-4377-4782-97d3-bc7e3ab17c6b"
    }
  ],
  "receipts": [
    {
      "allocations": [
        {
          "amount": 0.01,
          "companyId": "cmtpopbgk000prhb5qc60zxus",
          "createdAt": "2026-10-19T20:50:16.538588+00:00",
          "id": "7fa44884-706a-4af7-ad43-75873089bf58",
          "purchaseDocumentId": "dbb59d85-ebed-4af9-984b-17055b7cd6e0",
          "settlementId": "77f43282-4377-4782-97d3-bc7e3ab17c6b"
        }
      ],
      "settlement": {
        "companyId": "cmtpopbgk000prhb5qc60zxus",
        "createdAt": "2026-10-19T20:50:16.538588+00:00",
        "createdBy": "cms1k1bje001xhn3xulr0rooz",
        "createdByName": "Χρήστος Μάνης",
        "id": "77f43282-4377-4782-97d3-bc7e3ab17c6b",
        "note": "ΧΩΡΙΣ ΑΠΟΔΕΙΚΤΙΚΟ — Δηλώνω υπεύθυνα ότι πραγματοποίησα την πληρωμή 0.02 € στον προμηθευτή COFFEE UNION ATTICA Ε Ε με τραπεζική μεταφορά και αναλαμβάνω την ευθύνη της καταχώρισης χωρίς αποδεικτικό. Σημείωση: LAB-SUPPLIER-ADVANCE-01-20261019 / VIRTUAL NO REAL MONEY",
        "paidAt": "2026-10-19T20:48:00+00:00",
        "paymentMethod": "BANK_TRANSFER",
        "reviewNote": "LAB εικονική αποδοχή της ίδιας πληρωμής 0,02 € — καμία πραγματική τραπεζική μεταφορά.",
        "reviewedAt": "2026-10-19T20:53:17.723902+00:00",
        "reviewedBy": "cms1k1bje001xhn3xulr0rooz",
        "status": "CONFIRMED",
        "storeId": "cmtpopbgo000trhb5ng9ytiru",
        "supplierId": "90d12463-5425-471e-ae21-7f1f09eeaff1",
        "transactionId": "pay_7342736072df83017f190a9382073d154bc4874ea91155ea21c2ec78171b7a55"
      },
      "transaction": {
        "actorId": "cms1k1bje001xhn3xulr0rooz",
        "actorName": "Χρήστος Μάνης",
        "amount": 0.02,
        "attachmentChecksum": null,
        "attachmentData": null,
        "attachmentFilename": null,
        "attachmentMimeType": null,
        "companyId": "cmtpopbgk000prhb5qc60zxus",
        "createdAt": "2026-10-19T20:50:16.538588+00:00",
        "description": "ΧΩΡΙΣ ΑΠΟΔΕΙΚΤΙΚΟ — Δηλώνω υπεύθυνα ότι πραγματοποίησα την πληρωμή 0.02 € στον προμηθευτή COFFEE UNION ATTICA Ε Ε με τραπεζική μεταφορά και αναλαμβάνω την ευθύνη της καταχώρισης χωρίς αποδεικτικό. Ετεροχρονισμένη πληρωμή COFFEE UNION ATTICA Ε Ε · 1 τιμολόγιο · Έναντι 0.01 €",
        "expenseCategoryId": null,
        "id": "pay_7342736072df83017f190a9382073d154bc4874ea91155ea21c2ec78171b7a55",
        "invoiceDocumentNumber": null,
        "invoicePaymentKey": null,
        "occurredAt": "2026-10-19T20:48:00+00:00",
        "paymentMethod": "BANK_TRANSFER",
        "reversalReason": null,
        "reversedAt": null,
        "reversedBy": null,
        "reversedByName": null,
        "sessionId": null,
        "sourceType": null,
        "storeId": "cmtpopbgo000trhb5ng9ytiru",
        "subtractFromShift": false,
        "supplierId": "90d12463-5425-471e-ae21-7f1f09eeaff1",
        "supplierName": "COFFEE UNION ATTICA Ε Ε",
        "type": "SUPPLIER_PAYMENT"
      }
    }
  ],
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

# SUPPLIER-ADVANCE-01 — staged acceptance observations

19Oct2026 23:50 Europe/Athens. Same owner fix/supplier-advance-20261019. SourcePR2889/head403b3c03602f2ddd92fff3f0794af197d38d535a/main1cccecd1a1777a6ac9ff5c5bba42fbfde470fe69. Full PR39318646187/job118287731141 and exact main39320123491/job118291991398:3514PASS/0FAIL/0SKIP plus8backup, all applicable jobs success. Ordinary guard39321219511/job118295562197 SUCCESS; Renderdep-dbb80ng473hc73dk7e40 LIVE19Oct23:47:07Athens, independent healthoktrue/exact1cc. All9 owned source/test files equal the reviewed source. Wrapper39321314105 skipped deploy and is not independent release proof.

Merged pre-action baseline PR2890/2892/2896; final baseline39c58e891adcca9415f383a5e0e143c7d1e37687. Fresh23:47:22 snapshot matched original shift, control, stock, invoice and bank before values exactly. Existing SuperAdmin support LAB selected explicitly. Cash UI correctly unavailable, no permission grant/shift close/open or cash route bypass. New external virtual BANK_TRANSFER0.02 was submitted ONCE through actual released form at23:50:16, allocated0.01 to existing invoiceΤΔΑ0009683 and explicit acknowledged advance0.01. No actual bank integration/transfer, stock/fiscal or old transaction replay.

Observed after: one transactionpay_7342736072df83017f190a9382073d154bc4874ea91155ea21c2ec78171b7a55, one settlement77f43282-4377-4782-97d3-bc7e3ab17c6b PENDING_REVIEW, one allocation0.01; external sessionIdNULL/subtractFromShiftFALSE, methodBANK_TRANSFER. Virtual bank entries31→32, total-515.43→-515.45, pending-206.67→-206.69 and confirmed-308.76 unchanged. Protected old-bank hasha47fa1ede8dbbc7924a251834b7a7fcd unchanged. MAIN shift0transactions/cash-card-IRIS0/deductions0/drawer9.40, complete shift hash/other-store controls/invoice face-status/stock99product and95movement hashes unchanged. Actual DOM showed separate0.01 allocation/0.02 delivered/0.01 advance; both explicit acknowledgements required. Successful POST closed the form once. Failed exact implicit-label Playwright selector only read/selected nothing; corrected after inspecting actual native select, no payment retry.

Flow acceptance is still IN PROGRESS, no whole PASS or new manual claim yet. NEXT single state-changing action after this documentation is green/merged and fresh unchanged-state check: explicit human confirmation of ONLY this same virtual0.02 receipt; no confirmation of any real supplier payment, no new bank/payment/cash record. Expected same IDs/counts/amounts/stock/controls; bank pending-206.69→-206.67, confirmed-308.76→-308.78, total-515.45 unchanged, settlementCONFIRMED. Then record actual before a separate allocation of remaining0.01, without new cash. Real Diadoxou6.17 remains untouched under separate before baseline. Both newcash physical acceptance and hardware remain NOT TESTED; cash has native CI only.

After-payment snapshot and before virtual confirmation:

```json
{
  "bank": [
    {
      "confirmed": -308.76,
      "entries": 32,
      "id": "765c28e7-bbaa-4d6c-93a5-ab75cb39d5a0",
      "name": "Ταμείο Τράπεζας",
      "pending": -206.69,
      "protectedHash": "a47fa1ede8dbbc7924a251834b7a7fcd",
      "totalAmount": -515.45
    }
  ],
  "capturedAt": "2026-10-19T20:50:38.227499+00:00",
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
  "invoiceAllocations": [
    {
      "amount": 0.01,
      "companyId": "cmtpopbgk000prhb5qc60zxus",
      "createdAt": "2026-10-19T20:50:16.538588+00:00",
      "id": "7fa44884-706a-4af7-ad43-75873089bf58",
      "purchaseDocumentId": "dbb59d85-ebed-4af9-984b-17055b7cd6e0",
      "settlementId": "77f43282-4377-4782-97d3-bc7e3ab17c6b"
    }
  ],
  "receipts": [
    {
      "allocations": [
        {
          "amount": 0.01,
          "companyId": "cmtpopbgk000prhb5qc60zxus",
          "createdAt": "2026-10-19T20:50:16.538588+00:00",
          "id": "7fa44884-706a-4af7-ad43-75873089bf58",
          "purchaseDocumentId": "dbb59d85-ebed-4af9-984b-17055b7cd6e0",
          "settlementId": "77f43282-4377-4782-97d3-bc7e3ab17c6b"
        }
      ],
      "settlement": {
        "companyId": "cmtpopbgk000prhb5qc60zxus",
        "createdAt": "2026-10-19T20:50:16.538588+00:00",
        "createdBy": "cms1k1bje001xhn3xulr0rooz",
        "createdByName": "Χρήστος Μάνης",
        "id": "77f43282-4377-4782-97d3-bc7e3ab17c6b",
        "note": "ΧΩΡΙΣ ΑΠΟΔΕΙΚΤΙΚΟ — Δηλώνω υπεύθυνα ότι πραγματοποίησα την πληρωμή 0.02 € στον προμηθευτή COFFEE UNION ATTICA Ε Ε με τραπεζική μεταφορά και αναλαμβάνω την ευθύνη της καταχώρισης χωρίς αποδεικτικό. Σημείωση: LAB-SUPPLIER-ADVANCE-01-20261019 / VIRTUAL NO REAL MONEY",
        "paidAt": "2026-10-19T20:48:00+00:00",
        "paymentMethod": "BANK_TRANSFER",
        "reviewNote": null,
        "reviewedAt": null,
        "reviewedBy": null,
        "status": "PENDING_REVIEW",
        "storeId": "cmtpopbgo000trhb5ng9ytiru",
        "supplierId": "90d12463-5425-471e-ae21-7f1f09eeaff1",
        "transactionId": "pay_7342736072df83017f190a9382073d154bc4874ea91155ea21c2ec78171b7a55"
      },
      "transaction": {
        "actorId": "cms1k1bje001xhn3xulr0rooz",
        "actorName": "Χρήστος Μάνης",
        "amount": 0.02,
        "attachmentChecksum": null,
        "attachmentData": null,
        "attachmentFilename": null,
        "attachmentMimeType": null,
        "companyId": "cmtpopbgk000prhb5qc60zxus",
        "createdAt": "2026-10-19T20:50:16.538588+00:00",
        "description": "ΧΩΡΙΣ ΑΠΟΔΕΙΚΤΙΚΟ — Δηλώνω υπεύθυνα ότι πραγματοποίησα την πληρωμή 0.02 € στον προμηθευτή COFFEE UNION ATTICA Ε Ε με τραπεζική μεταφορά και αναλαμβάνω την ευθύνη της καταχώρισης χωρίς αποδεικτικό. Ετεροχρονισμένη πληρωμή COFFEE UNION ATTICA Ε Ε · 1 τιμολόγιο · Έναντι 0.01 €",
        "expenseCategoryId": null,
        "id": "pay_7342736072df83017f190a9382073d154bc4874ea91155ea21c2ec78171b7a55",
        "invoiceDocumentNumber": null,
        "invoicePaymentKey": null,
        "occurredAt": "2026-10-19T20:48:00+00:00",
        "paymentMethod": "BANK_TRANSFER",
        "reversalReason": null,
        "reversedAt": null,
        "reversedBy": null,
        "reversedByName": null,
        "sessionId": null,
        "sourceType": null,
        "storeId": "cmtpopbgo000trhb5ng9ytiru",
        "subtractFromShift": false,
        "supplierId": "90d12463-5425-471e-ae21-7f1f09eeaff1",
        "supplierName": "COFFEE UNION ATTICA Ε Ε",
        "type": "SUPPLIER_PAYMENT"
      }
    }
  ],
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
