## 15/10/2026 18:17 Athens — POS-PERMANENT-PRICE-01 / durable save + restore observed; central Events LIVE FAIL

Retained owner codex/pos-permanent-price-20261015, bounded correction branch fix/pos-permanent-price-audit-build-20261015. Exact healthy aafb68079ce5f53ffdd2433c76601d6bfa1c79a1 after PR2503/mainCI38756178019:2679PASS/0FAIL/0SKIP+6backup; guard38756912305/deploydep-db8emoo473hc739gebq0 SUCCESS. Initial layout fail fixed: actual1363x936 body499/499, enabled Save visible. Normal EMPLOYEE LAB POS2/MAIN SKU2270 ΝΕΡΟ1,5LT: one explicit1→1.10 save18:09:17Athens, fullreload/newlocalrow1.10, one separate restoration1.10→1 save18:11:14. Exactly2history/2PERMANENT_PRICE_CHANGE events, correct server-derived product/SKU/operator/reason. Finalcleanup18:17:11 price1/stock-16/cartempty/queue0; all133financialledger/all40shifts/stock9/baseProduct/control hashes unchanged. No sale/payment/fiscal/shift submission or replay.

Newest actual central Admin Events refresh omits both saved events: real LIVE FAIL, despite correct durable audit. Cause confirmed in normal build: server/scripts/patch-audit-action-filter.js rewrites the route SQL allow-list and removes PERMANENT_PRICE_CHANGE during prepare:server. Correct ONLY this existing build allow-list, retain all prior safe action types and WASTE exclusion; add regression executing actual patch twice over actual route in isolated temp tree. No price re-save necessary: after ordinary greenCI/guarded exact release read existing two event IDs in central UI. No manualdeploy/migration/DBrepair, no takeover other scope. Full feature closure AWAITING Events readback. Checkpoint CHECKPOINTS/CHANGES/2026-10-15-pos-permanent-price.md.

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

## Final release before identified LAB add/save — 2026-10-15 18:07:11 Athens

Root startupPR2503 source2679/0/0+6/full exact main38756178019 success; guarded38756912305 SUCCESS, Renderdep-db8emoo473hc739gebq0 LIVE exactaafb68079ce5f53ffdd2433c76601d6bfa1c79a1. Real mapping group remains2/hashd1faa5f569b91644fb7af33c01773971, one deterministic correct link created by ordinary startup, all original mappings retained. No manual DB/deploy action. Intended only LABnormalEMPLOYEE/LABPOS2/MAIN, SKU2270 qty1, permanent1→1.10 then separate1restoration; no checkout/payment/stock/fiscal/shift action. Fresh before values:

```json
{
  "athens": "2026-10-15 18:07:11",
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

## Before first permanent save — 2026-10-15 18:09:01 Athens

Exactaafb independent health200/oktrue verified after one transient post-rollout read-only502, normal LABPOS2/MAIN, qty1/SKU2270/cart1/queue0. Preview1→1.10/reasonΔοκιμή; actual1363x936 geometry body499/499/scrollTop0, columns436+436, enabled Save top709/bottom755 withinsection773: desktop layout PASS only, no save yet. Screenshotpos-permanent-ready-1792076919539.jpg. Fresh before transaction below; stock/financial/control match earlier baselines, history0/events0. Intended exactly one metadata save, no sale/payment.

```json
{
  "athens": "2026-10-15 18:09:01",
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

## First save observed / before reloaded local add — 2026-10-15 18:10:22 Athens

One explicit ordinary metadata POST succeeded on exactaafb: storeprice1→1.10; native read history0→1 andPERMANENT_PRICE_CHANGE0→1, local row1.10, modalclosed. Stock-16/moves9, baseProducthash,133financial ledger rows/fullhash, all40shifts and both controls unchanged. No checkout. Before next localqty1 addition after full POS reload, currentprice1.10/history1/events1 and all controls below. Intended independent restoration1.10→1.00 with reasonΔοκιμή.

```json
{
  "athens": "2026-10-15 18:10:22",
  "otherStoreProducts": {
    "count": 0,
    "hash": "d41d8cd98f00b204e9800998ecf8427e"
  },
  "permanentEvents": {
    "count": 1,
    "last": "2026-10-15T15:09:17.420885+00:00"
  },
  "priceHistory": {
    "count": 1,
    "last": "2026-10-15T15:09:17.421"
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
    "hash": "fba03ec0837067397de4fdbce6f11f70",
    "stock": -16,
    "storePrice": 1.1
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

## Before separate restoration save — 2026-10-15 18:11:03 Athens

Full POS reload and newqty1/SKU2270 actually shows1.10, proving persisted catalog state. Explicit permanent preview1.10→1.00/Δοκιμή. Fresh before restoration storeprice1.10/history1/events1, controls unchanged. One restoration metadata POST next, no sale/payment.

```json
{
  "athens": "2026-10-15 18:11:03",
  "otherStoreProducts": {
    "count": 0,
    "hash": "d41d8cd98f00b204e9800998ecf8427e"
  },
  "permanentEvents": {
    "count": 1,
    "last": "2026-10-15T15:09:17.420885+00:00"
  },
  "priceHistory": {
    "count": 1,
    "last": "2026-10-15T15:09:17.421"
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
    "hash": "fba03ec0837067397de4fdbce6f11f70",
    "stock": -16,
    "storePrice": 1.1
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

## After restoration / before local cleanup — 2026-10-15 18:11:34 Athens

Second identified metadata save returned storeprice1.00/history2/events2; targetstock-16/moves9/baseProduct/fullfinancialLedger/all40shift/control hashes unchanged. Next remove only newlyaddedlocalqty1 row (no checkout) after modal closes. Both audit identities will be read, not replayed.

```json
{
  "athens": "2026-10-15 18:11:34",
  "otherStoreProducts": {
    "count": 0,
    "hash": "d41d8cd98f00b204e9800998ecf8427e"
  },
  "permanentEvents": {
    "count": 2,
    "last": "2026-10-15T15:11:14.806864+00:00"
  },
  "priceHistory": {
    "count": 2,
    "last": "2026-10-15T15:11:14.807"
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
    "hash": "f83b0d7bf78b42d1a793cb281498e2f2",
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


## Final cleanup snapshot
```json
{
  "athens": "2026-10-15 18:17:11",
  "otherStoreProducts": {
    "count": 0,
    "hash": "d41d8cd98f00b204e9800998ecf8427e"
  },
  "permanentEvents": {
    "count": 2,
    "last": "2026-10-15T15:11:14.806864+00:00"
  },
  "priceHistory": {
    "count": 2,
    "last": "2026-10-15T15:11:14.807"
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
    "hash": "f83b0d7bf78b42d1a793cb281498e2f2",
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

## Actual saved Audit identities (read-only; do not replay)
```json
[
  {
    "actorId": "8e6a896f-8735-4ff6-a3dc-1ceb1741b578",
    "actorName": "LAB POS 2",
    "createdAt": "2026-10-15T15:09:17.420885Z",
    "details": {
      "actorName": "LAB POS 2",
      "barcode": null,
      "difference": 0.10000000000000009,
      "financialMovement": false,
      "historyId": "6d8338e0-8d31-469a-afd5-171f52e1cc53",
      "newPrice": 1.1,
      "oldPrice": 1,
      "productId": "4f126988-a1a8-433c-b469-70203415df5b",
      "productName": "ΝΕΡΟ 1,5LT",
      "requestId": "9e389020-6cf3-4ef1-8664-fdcfb6492844",
      "scope": "STORE_PERMANENT",
      "sessionId": "c726d8de-2bbd-4b8a-a0d3-4854287c940b",
      "sku": "2270",
      "stockChanged": false,
      "storeId": "cmtpopbgo000trhb5ng9ytiru",
      "storeName": "ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ",
      "terminalPos": "MAIN"
    },
    "id": "8653612c-b9ed-4549-bb58-e8b5fe192151",
    "reason": "Δοκιμή"
  },
  {
    "actorId": "8e6a896f-8735-4ff6-a3dc-1ceb1741b578",
    "actorName": "LAB POS 2",
    "createdAt": "2026-10-15T15:11:14.806864Z",
    "details": {
      "actorName": "LAB POS 2",
      "barcode": null,
      "difference": -0.10000000000000009,
      "financialMovement": false,
      "historyId": "b1343d17-f289-42b7-be1a-2c4c0881816e",
      "newPrice": 1,
      "oldPrice": 1.1,
      "productId": "4f126988-a1a8-433c-b469-70203415df5b",
      "productName": "ΝΕΡΟ 1,5LT",
      "requestId": "93291ddf-e095-4fc5-b1c4-db89f8c3d939",
      "scope": "STORE_PERMANENT",
      "sessionId": "c726d8de-2bbd-4b8a-a0d3-4854287c940b",
      "sku": "2270",
      "stockChanged": false,
      "storeId": "cmtpopbgo000trhb5ng9ytiru",
      "storeName": "ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ",
      "terminalPos": "MAIN"
    },
    "id": "a972bcd3-f8ff-4c59-8bea-4454af43dd41",
    "reason": "Δοκιμή"
  }
]
```
