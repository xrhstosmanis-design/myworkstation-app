# N39 transfer LIVE acceptance — owner codex/n39-inventory-acceptance-20261010

Claim and read-only diagnostic PASS merged in PR2037, main93efd896. User explicitly authorizes all required task39 actions through final PASS. No unrelated scope changes.

## Before action N39-LAB-20261010-TRANSFER-01

Browser tabs22/24, SuperAdmin Χρήστος Μάνης, BackOffice virtual LAB, no physical POS terminal involved. Source cmtpopbgo000trhb5ng9ytiru ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ; destination cmuk8gxui000ppabfykdxwb1y ΕΡΓΑΣΤΗΡΙΟ ΑΠΟΜΟΝΩΣΗΣ ΕΤΙΚΕΤΑΣ. Company MYWORKSTATION LAB. Product b1466a68-c47b-47cc-9139-69e6f9f7f978 / LAB-EXCEL-20260909-01.

Fresh source archive stock9; fresh ledger current9/recorded9/diff0/movements11/possibleduplicates0; latest movement10Oct2026 09:04:26 Athens WASTE out1, expired01 reason. Destination exact SKU search with status Όλα τα είδη returns0 rows, no StoreProduct shown, stock0 and no existing latest movement observable. Only test stock moves; no payment method. Planned qty1 source9->8 destination0->1, paired OUT/IN exactlyonce with matching reason N39-LAB-20261010-TRANSFER-01. Expected financialdelta0.

Fresh financial source center: MAIN open10Oct08:13 LAB POS2, transactions5, cash3.50/card0/IRIS0/total3.50/expenses0, latest09:51 Athens. Control LAB-POS-02 open26Sep01:33 LAB POS2 transactions2 cash0/card0/IRIS0/total0/expenses120/latest—. External MAIN sales since old checkpoint are baseline, not caused by our action. Destination has no closed shift today in existing BackOffice; destination POS financial effects not yet measured. Full39 OPEN. This checkpoint authorizes exactly one new qty1 stock transfer and its read-only before/after checks, no repeat of earlier waste/count actions.

## After

LAB FAIL UI pre-submit: operations entry scoped source-only list leaves transfer destination with only placeholder; actual source/destination transfer NOT TESTED. No stock mutation submitted. Root cause and bounded fix recorded in active/tracker/pending. Source scope must remain fixed. AWAITING LAB after source fix; all before values must be refreshed before submit after deployment.

## Source correction published

PR2039 head5b63591f8fc7a2da000723a0a7f30c487910672f, full CI38035051014/5095 SUCCESS:2025PASS/0FAIL/0SKIP, frontend and real HTTP E2E green. Mergedfbfe12dc4fb9bfce8ec6c11b3cbb67a3a07425d9. Main CI38035242201/5096 pending; guarded deployment follows its success. Local Node20 focused7/7, protected inventory27/27, final npm run build PASS and TABLE_SERVICE bundle verified. This is AWAITING LAB, not functional PASS. No source/tenant/role/movement changes outside transfer dialog destination fetching. Shared docs preserve concurrent N44 claim61ddb473.

Destination BackOffice fresh Κέντρο βαρδιών shows no open shift. No shift opened to test the transfer. Refresh source/destination stock and both source financial/control values after deployment and record a fresh before checkpoint before submitting TRANSFER-01.

## Refreshed before TRANSFER-01 on verified LIVE fbfe12dc

Main CI38035242201 SUCCESS and guarded Render38035420093 SUCCESS. Independent health oktrue revisionfbfe12dc4fb9bfce8ec6c11b3cbb67a3a07425d9. Both browser tabs reloaded the deployed client. Fresh financial MAIN5tx/cash3.50/card0/IRIS0/total3.50/expense0/latest09:51; controlLAB-POS-02 2tx/cash0/card0/IRIS0/total0/expense120/latest—. Destination no open shift, no closed shifts10Oct. Source exact SKU stock9, ledger9/9/diff0/11moves/duplicate0, latest09:04:26 expired01; destination exact SKU ALL status0rows/stocktotal0, no existing StoreProduct or latest movement observable. Same operator/source/destination/qty1/reason TRANSFER-01 specified above. Execute one new transfer only; check paired ledger entries and finances afterward. Old failed modal was closed without submitting. This is the operative fresh before record.


## TRANSFER-01 LIVE FAIL — no postings

On deployedfbfe12dc, operations-entry modal now presents the authorized isolation LAB destination while source stays fixed. Selectedqty1 and exactreason N39-LAB-20261010-TRANSFER-01; submitted once. UI returned internalerror. Closed without retry. Fresh source archive9 and ledger9/9/diff0/11moves/duplicates0/latest09:04:26 unchanged. Fresh destination ALL exactsearch0rows/stock0 unchanged. Fresh MAIN5tx/cash3.50/card0/IRIS0/total3.50/expense0/latest09:51, control2tx/cash0/card0/IRIS0/total0/expense120/latest—, destinationnoopen shift unchanged. No compensation or repeated stock action. Screenshot CHECKPOINTS/EVIDENCE/n39-transfer-failed-ledger-20261010.jpg inspected and synchronized; proves unchanged sourceledger.

Isolated actual-route reproduction with generated Prisma: productDelegateundefined, storeDelegateobject. Valid authorizedstores reach prisma.product.findFirst and throw TypeError Cannot read properties of undefined (reading findFirst), transactionsStarted0. Product is SQL-managed by commercial-bootstrap.js and absent from Prisma schema. Bounded causal correction uses parameterized Product SELECT by productId/companyId/active; transaction/stock/replay rules unchanged. Local8testsPASS with nativePGtestSKIP because no isolated database locally; full CI must exercise actualroute nativePostgreSQL fixture (newdestination upsert, paired audit/control, sequential replay, distinct concurrent operations, insufficient stock, foreign/inactive store/product, denied operator). No CI-only LAB PASS. New separately identified TRANSFER-02 only after green CI/merge/exactdeploy and new recorded baseline. Full39 OPEN; other acceptance scopes remain with this owner.
