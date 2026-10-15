## 15/10/2026 17:24-17:26 Athens — POS-PERMANENT-PRICE-01 / LIVE PREVIEW PASS, DESKTOP LAYOUT FAIL / SAVE NOT TESTED

Retained owner codex/pos-permanent-price-20261015, bounded layout correction branch fix/pos-permanent-price-layout-20261015. SourcePR2499/head dd48fc53 merged7bbcff06 after PR38748191185 and main38749099036:2678PASS/0FAIL/0SKIP+6backup, all required checks. PR merge27d89d6e and main7bbcff06 have identical tree87eb199fe0f5386efc978df5c44a55448e42713d. Guard38749937512/job116473469524 SUCCESS/healthy17:19:13Athens; subsequent independent health oktrue/exact7bbcff06. One earlier read-only probe502 during rollout, no mutation. No manual deploy or migration.

Actual normal EMPLOYEE LAB POS2/MAIN, selected LAB storecmtpopbgo000trhb5ng9ytiru: empty cart/queue0, qty1 SKU2270 ΝΕΡΟ1,5LT added locally at1EUR. Permanent preview correctly reads exact product/SKU/store1→1.10/reasonΔοκιμή; no save clicked. Desktop1366x936 bodyclient694/scroll796 hides save below fold: real layout FAIL. Unsaved proposal discarded and only new local row removed, finalcart0/queue0. Fresh before/after stock-16/moves9/latest12Oct20:42:11.404,133transactions/5647.70 and all40shift/control/baseProduct hashes unchanged; storeprice1/history0/permanentEvents0. Screenshot/evidence in CHECKPOINTS/EVIDENCE/2026-10-15-pos-permanent-price/.

Correction only scopes price editor to two desktop columns, retaining keypad/touch sizes and temporary path. Local mounted3/3 PASS; fullCI/exact guarded release and fresh measured permanent1→1.10→1 save/Events acceptance still AWAITING. Broader No33/TODAY04/physical/mobile/other owners unchanged. Checkpoint CHECKPOINTS/CHANGES/2026-10-15-pos-permanent-price.md.

## LIVE test baseline before any identified LAB product action

Exact release7bbcff06; guard38749937512 SUCCESS17:19:13Athens, mainCI38749099036 PASS2678/0/0+6, same tree87eb199f as PR tested merge. Cloud Chrome, normal EMPLOYEE LAB POS2, storecmtpopbgo000trhb5ng9ytiru/companycmtpopbgk000prhb5qc60zxus; existing MAIN shift, physical hardware NOT TESTED. Intended only local qty1 SKU2270 then permanent1→1.10 and separate restoration1, reasonΔοκιμή, no checkout/payment/stock/fiscal/shift submit. Empty cart/queue0 observed after secure auth; awaiting fresh UI after reload. Preliminary before17:19:23 price1/stock-16, movement9/latest12Oct20:42:11.404,133ledgerrows/5647.70 total unchanged. Fresh baseline below precedes first cart addition; latest control terminal and all shift/ledger hashes recorded.

```json
{
  "athens": "2026-10-15 17:20:52",
  "otherStoreProducts": {
    "count": 0,
    "hash": "d41d8cd98f00b204e9800998ecf8427e"
  },
  "permanentEvents": {
    "count": 0,
    "last": null
  },
  "priceHistory": {
    "count": 0,
    "last": null
  },
  "product": {
    "allowPosPriceChange": true,
    "basePrice": 1,
    "hash": "c3c4b496d2220602ff43e1500d2c79a7",
    "id": "4f126988-a1a8-433c-b469-70203415df5b",
    "name": "ΝΕΡΟ 1,5LT",
    "sku": "2270"
  },
  "shifts": {
    "count": 40,
    "hash": "22e9f6e84ac6e582b42db0f66a700b9e"
  },
  "stockMoves": {
    "count": 9,
    "hash": "95de78e4154be68813576b25f7d5d4eb",
    "last": "2026-10-12T20:42:11.404"
  },
  "storeProduct": {
    "hash": "9080de8d719f4c2608bc6936f3a7aaec",
    "stock": -16,
    "storePrice": 1
  },
  "terminalTotals": [
    {
      "card": 0,
      "cash": 0.7,
      "id": "3d894e2f-c467-4293-9f57-4553c653601d",
      "iris": 0,
      "status": "CLOSED",
      "terminalPos": "LAB-POS-01",
      "total": 0.7,
      "transactions": 1
    },
    {
      "card": 0,
      "cash": 1.4,
      "id": "865e6a48-ccbe-4238-8580-6d70682050a5",
      "iris": 0,
      "status": "CLOSED",
      "terminalPos": "LAB-POS-02",
      "total": 25.4,
      "transactions": 3
    },
    {
      "card": 0,
      "cash": 2.2,
      "id": "c726d8de-2bbd-4b8a-a0d3-4854287c940b",
      "iris": 0,
      "status": "OPEN",
      "terminalPos": "MAIN",
      "total": 2.2,
      "transactions": 3
    }
  ],
  "transactions": {
    "amount": 5647.7,
    "card": 2.4,
    "cash": 65.2,
    "count": 133,
    "hash": "f8b2b83182ffa66ee198af48aff64f91",
    "iris": 0.5
  }
}
```

## Before permanent save1 - 2026-10-15 17:22:16 Athens

Actual normal LAB POS2/MAIN qty1/SKU2270 cart1.00EUR/queue0. No checkout. Intended store price1→1.10 reasonΔοκιμή. Independent health nowoktrue/exact7bbcff06; earlier one read-only health probe502 was transient before this successful exact probe, not a price submission. Fresh financial/stock/control snapshots below; ledger133/5647.70, stock-16/moves9, history0/events0. All hashes match before local add.

```json
{
  "athens": "2026-10-15 17:22:16",
  "otherStoreProducts": {
    "count": 0,
    "hash": "d41d8cd98f00b204e9800998ecf8427e"
  },
  "permanentEvents": {
    "count": 0,
    "last": null
  },
  "priceHistory": {
    "count": 0,
    "last": null
  },
  "product": {
    "allowPosPriceChange": true,
    "basePrice": 1,
    "hash": "c3c4b496d2220602ff43e1500d2c79a7",
    "id": "4f126988-a1a8-433c-b469-70203415df5b",
    "name": "ΝΕΡΟ 1,5LT",
    "sku": "2270"
  },
  "shifts": {
    "count": 40,
    "hash": "22e9f6e84ac6e582b42db0f66a700b9e"
  },
  "stockMoves": {
    "count": 9,
    "hash": "95de78e4154be68813576b25f7d5d4eb",
    "last": "2026-10-12T20:42:11.404"
  },
  "storeProduct": {
    "hash": "9080de8d719f4c2608bc6936f3a7aaec",
    "stock": -16,
    "storePrice": 1
  },
  "terminalTotals": [
    {
      "card": 0,
      "cash": 0.7,
      "id": "3d894e2f-c467-4293-9f57-4553c653601d",
      "iris": 0,
      "status": "CLOSED",
      "terminalPos": "LAB-POS-01",
      "total": 0.7,
      "transactions": 1
    },
    {
      "card": 0,
      "cash": 1.4,
      "id": "865e6a48-ccbe-4238-8580-6d70682050a5",
      "iris": 0,
      "status": "CLOSED",
      "terminalPos": "LAB-POS-02",
      "total": 25.4,
      "transactions": 3
    },
    {
      "card": 0,
      "cash": 2.2,
      "id": "c726d8de-2bbd-4b8a-a0d3-4854287c940b",
      "iris": 0,
      "status": "OPEN",
      "terminalPos": "MAIN",
      "total": 2.2,
      "transactions": 3
    }
  ],
  "transactions": {
    "amount": 5647.7,
    "card": 2.4,
    "cash": 65.2,
    "count": 133,
    "hash": "f8b2b83182ffa66ee198af48aff64f91",
    "iris": 0.5
  }
}
```

## 2026-10-15 17:24:41 Athens - LIVE layout FAIL before any permanent save / cleanup baseline

Actual preview newmode is reached and reads correct LAB product/SKU/store1→1.10 with reasonΔοκιμή. At1366x936, bodyclient694/scroll796: save button below visible fold, contradicting required desktop no-scroll/readability. Screenshot pos-permanent-preview-1792074219758.jpg. No permanent POST clicked: fresh price1/history0/events0, all stock/financial/control hashes unchanged. Will close/discard only unsaved proposal and remove only this new localqty1 row, no checkout. Then bounded two-column desktop layout refinement under same existing owner before real save acceptance.

```json
{
  "athens": "2026-10-15 17:24:41",
  "otherStoreProducts": {
    "count": 0,
    "hash": "d41d8cd98f00b204e9800998ecf8427e"
  },
  "permanentEvents": {
    "count": 0,
    "last": null
  },
  "priceHistory": {
    "count": 0,
    "last": null
  },
  "product": {
    "allowPosPriceChange": true,
    "basePrice": 1,
    "hash": "c3c4b496d2220602ff43e1500d2c79a7",
    "id": "4f126988-a1a8-433c-b469-70203415df5b",
    "name": "ΝΕΡΟ 1,5LT",
    "sku": "2270"
  },
  "shifts": {
    "count": 40,
    "hash": "22e9f6e84ac6e582b42db0f66a700b9e"
  },
  "stockMoves": {
    "count": 9,
    "hash": "95de78e4154be68813576b25f7d5d4eb",
    "last": "2026-10-12T20:42:11.404"
  },
  "storeProduct": {
    "hash": "9080de8d719f4c2608bc6936f3a7aaec",
    "stock": -16,
    "storePrice": 1
  },
  "terminalTotals": [
    {
      "card": 0,
      "cash": 0.7,
      "id": "3d894e2f-c467-4293-9f57-4553c653601d",
      "iris": 0,
      "status": "CLOSED",
      "terminalPos": "LAB-POS-01",
      "total": 0.7,
      "transactions": 1
    },
    {
      "card": 0,
      "cash": 1.4,
      "id": "865e6a48-ccbe-4238-8580-6d70682050a5",
      "iris": 0,
      "status": "CLOSED",
      "terminalPos": "LAB-POS-02",
      "total": 25.4,
      "transactions": 3
    },
    {
      "card": 0,
      "cash": 2.2,
      "id": "c726d8de-2bbd-4b8a-a0d3-4854287c940b",
      "iris": 0,
      "status": "OPEN",
      "terminalPos": "MAIN",
      "total": 2.2,
      "transactions": 3
    }
  ],
  "transactions": {
    "amount": 5647.7,
    "card": 2.4,
    "cash": 65.2,
    "count": 133,
    "hash": "f8b2b83182ffa66ee198af48aff64f91",
    "iris": 0.5
  }
}
```

17:25:51 after local cleanup: same price1/history0/events0/stock-16/financial hash f8b2b83182ffa66ee198af48aff64f91; cart0/queue0. No permanent save yet.
