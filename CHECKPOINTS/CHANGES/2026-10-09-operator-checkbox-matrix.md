# Modern operator checkbox inventory — 09/10/2026

Source main b37cb72e; every checkbox from the two owner screenshots, plus current profile flags. Runtime/API accepted evidence is separate from static wiring. Removal hides inert profile settings only; persisted legacy values are not deleted or changed. Historical Gate8 and module rights remain protected.

| Group | Key | Original label | Read-only finding / action |
|---|---|---|---|
| POS_PERMISSIONS | stockPos | στήλη Stock (PoS) | CONNECTED / NEEDS RUNTIME ACCEPTANCE |
| POS_PERMISSIONS | stockBackoffice | στήλη Stock (Backoffice) | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| POS_PERMISSIONS | confirmDeleteSale | Επιβεβαίωση διαγραφής λίστας πώλησης (PoS) | CONNECTED / NEEDS RUNTIME ACCEPTANCE |
| POS_PERMISSIONS | mixedPaymentChange | Πάντα μικτή πληρωμή και ρέστα (PoS) | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| POS_PERMISSIONS | leftKeys | Εμφάνιση αριστερής στήλης πλήκτρων (PoS) | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| POS_PERMISSIONS | editPosButtons | Ρύθμιση πλήκτρων, κατηγοριών και υποκατηγοριών (PoS) | CONNECTED / NEEDS RUNTIME ACCEPTANCE |
| POS_PERMISSIONS | deleteSaleReason | διαγραφή λίστας πώλησης (PoS) με αιτιολογία | CONNECTED / NEEDS RUNTIME ACCEPTANCE |
| POS_PERMISSIONS | addBarcode | Προσθήκη barcode είδους (PoS & BackOffice) | CONNECTED / NEEDS RUNTIME ACCEPTANCE |
| POS_PERMISSIONS | editDescription | Διόρθωση περιγραφής είδους (PoS) | CONNECTED / NEEDS RUNTIME ACCEPTANCE |
| POS_PERMISSIONS | fileItems | Αρχείο ειδών (BackOffice) | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| POS_PERMISSIONS | onlineBarcode | Online αναζήτηση barcode (PoS) | CONNECTED / NEEDS RUNTIME ACCEPTANCE |
| POS_PERMISSIONS | itemCard | Καρτέλα είδους (PoS & BackOffice) | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| POS_PERMISSIONS | stocktakeColumn | Εμφάνιση στήλης Stock (Απογραφή) | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| POS_PERMISSIONS | stocktakePos | Απογραφή ειδών (PoS) | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| POS_PERMISSIONS | stocktakeBackoffice | Απογραφή ειδών (BackOffice) | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| POS_PERMISSIONS | transactionDiscount | Έκπτωση συναλλαγής (PoS) | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| POS_PERMISSIONS | changeRetail | Αλλαγή τιμής λιανικής (PoS & BackOffice) | CONNECTED / NEEDS RUNTIME ACCEPTANCE |
| POS_PERMISSIONS | itemDiscount | Έκπτωση είδους (PoS) | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| POS_PERMISSIONS | returnItems | Επιστροφή ειδών (PoS) | CONNECTED / NEEDS RUNTIME ACCEPTANCE |
| POS_PERMISSIONS | customersPos | Πελάτες (PoS) | CONNECTED / NEEDS RUNTIME ACCEPTANCE |
| POS_PERMISSIONS | customersBackoffice | Πελάτες (BackOffice) | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| POS_PERMISSIONS | returnWithCode | με κωδικό για επιστροφή ειδών (PoS) | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| POS_PERMISSIONS | centralCashPos | Εμφάνιση κεντρικού Ταμείου (PoS) | CONNECTED / NEEDS RUNTIME ACCEPTANCE |
| POS_PERMISSIONS | centralCashBackoffice | Εμφάνιση κεντρικού Ταμείου (BackOffice) | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| POS_PERMISSIONS | supplierBalances | Υπόλοιπα προμηθευτών (BackOffice) | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| POS_PERMISSIONS | redeemPoints | Εξαργύρωση πόντων πελάτη (PoS) | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| POS_PERMISSIONS | customerCardOnly | Αναζήτηση πελάτη μόνο με αριθμό κάρτας (PoS) | CONNECTED / NEEDS RUNTIME ACCEPTANCE |
| POS_PERMISSIONS | thirdPartyPayment | πληρωμή προς Τρίτους | CONNECTED / NEEDS RUNTIME ACCEPTANCE |
| POS_PERMISSIONS | hidePrinter | Απόκρυψη εκτυπωτή (PoS) | CONNECTED / NEEDS RUNTIME ACCEPTANCE |
| POS_PERMISSIONS | supplierReturn | έκδοση Δ-Α επιστροφής σε προμηθευτή (PoS) | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| POS_PERMISSIONS | supplierPayment | πληρωμή Προμηθευτή | CONNECTED / NEEDS RUNTIME ACCEPTANCE |
| POS_PERMISSIONS | sameShiftPayments | Οι πληρωμές να αφαιρούνται από την ίδια βάρδια | CONNECTED / NEEDS RUNTIME ACCEPTANCE |
| POS_PERMISSIONS | transferAmount | Μεταφορά ποσού | CONNECTED / NEEDS RUNTIME ACCEPTANCE |
| POS_PERMISSIONS | shiftTransactionsBackoffice | Συναλλαγές βάρδιας (backoffice) | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| POS_PERMISSIONS | warehouseColumn | Εμφάνιση στήλης Αποθήκη (Παραγγελίες-BackOffice) | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| POS_PERMISSIONS | shiftTransactionsPos | Συναλλαγές βάρδιας (PoS) | CONNECTED / NEEDS RUNTIME ACCEPTANCE |
| POS_PERMISSIONS | allShiftTransactionsPos | Όλες οι συναλλαγές Βάρδιας (PoS) | CONNECTED / NEEDS RUNTIME ACCEPTANCE |
| POS_PERMISSIONS | cash | Μετρητά | CONNECTED / NEEDS RUNTIME ACCEPTANCE |
| POS_PERMISSIONS | initialCash | με αρχικό Ταμείο | CONNECTED / NEEDS RUNTIME ACCEPTANCE |
| POS_PERMISSIONS | closeShift | Κλείσιμο βάρδιας (PoS) | CONNECTED / NEEDS RUNTIME ACCEPTANCE |
| POS_PERMISSIONS | cards | Κάρτες | CONNECTED / NEEDS RUNTIME ACCEPTANCE |
| MENU_PERMISSIONS | management | Διαχείριση | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| MENU_PERMISSIONS | purchases | Αγορές | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| MENU_PERMISSIONS | priceCatalog | Τιμοκατάλογος | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| MENU_PERMISSIONS | cashDesk | Ταμείο | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| MENU_PERMISSIONS | categoriesCompanies | Κατηγορίες & εταιρείες | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| MENU_PERMISSIONS | orders | Παραγγελίες | CONNECTED / NEEDS RUNTIME ACCEPTANCE |
| MENU_PERMISSIONS | priceCheck | Έλεγχος τιμών πώλησης | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| MENU_PERMISSIONS | vatDepartments | Τμήματα ΦΠΑ | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| MENU_PERMISSIONS | orderProposal | Πρόταση Παραγγελίας | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| MENU_PERMISSIONS | leafletOffers | Προσφορές φυλλαδίου / δώρα | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| MENU_PERMISSIONS | wholesaleCatalog | Τιμοκατάλογος χονδρικής | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| MENU_PERMISSIONS | notes | Σημειώσεις (backoffice) | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| MENU_PERMISSIONS | replenishment | Αναπλήρωση (άνευ παραγγελίας) | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| MENU_PERMISSIONS | purchaseOnly | Καταχώρηση μόνο στις αγορές | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| MENU_PERMISSIONS | orderToInvoice | Μετατροπή παραγγελίας σε τιμολόγιο | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| MENU_PERMISSIONS | suppliers | Προμηθευτές | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| MENU_PERMISSIONS | sales | Πωλήσεις | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| MENU_PERMISSIONS | reports | Αναφορές | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| MENU_PERMISSIONS | documents | Παραστατικά | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| MENU_PERMISSIONS | stocktakes | Απογραφές | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| MENU_PERMISSIONS | inventory | Αποθήκη | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| MENU_PERMISSIONS | statistics | Στατιστικά | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| MENU_PERMISSIONS | priceChanges | Αλλαγές τιμών | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| MENU_PERMISSIONS | payments | Πληρωμές | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| MENU_PERMISSIONS | operators | Χειριστές | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| MENU_PERMISSIONS | systemParams | Παράμετροι συστήματος | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| TAB_PERMISSIONS | shiftSales | Πωλήσεις βάρδιας | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| TAB_PERMISSIONS | companyImage | Εικόνα επιχείρησης | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| TAB_PERMISSIONS | salesAnalysis | Ανάλυση πωλήσεων | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| TAB_PERMISSIONS | purchaseAnalysis | Ανάλυση αγορών | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| TAB_PERMISSIONS | payments | Πληρωμές | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| TAB_PERMISSIONS | shifts | Βάρδιες | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| TAB_PERMISSIONS | events | Συμβάντα | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| PROFILE | posAccess | Πρόσβαση στις Πωλήσεις (PoS) | CONNECTED / NEEDS RUNTIME ACCEPTANCE |
| PROFILE | active | ενεργός | CONNECTED / EXISTING SESSION REVOCATION |
| PROFILE | backofficeAccess | Πρόσβαση στο BackOffice | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| PROFILE | powerUser | Power User | REMOVE INERT CONTROL / STORED VALUES RETAINED |
| OTHER | customerDisplay.doubleScreen | Χρήση διπλής οθόνης | REMOVE INERT OPERATOR DISPLAY CONTROL / STORED VALUES RETAINED |

## 2026-10-09T20:56Z — OPERATOR-CHECKBOX-01 bounded LIVE PASS / wider acceptance OPEN

Owner codex/operator-checkbox-audit-20261009 retained; printed33/tracker35 remains ASSIGNED / PARTIAL LIVE PASS / OPEN. SourcePR1994 finalhead5331ab0999aeb621b2531928f3a6c97ccc33c7d0 fullCI37987782922 SUCCESS, 2003tests/2003PASS/0FAIL/0SKIP; merge62fe51eab0a89478cf54ff821260194d5d49aa24. MainCI37988859210 and guardedRender37989197359 SUCCESS; independent /api/health HTTP200 ok=true exact62fe51ea observed20:50Z.

Read-only LIVE acceptance at20:52–20:54Z: canonical Platform Admin -> MYWORKSTATION LAB -> selected ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ -> Operators -> LAB POS2 ordinary EMPLOYEE profile. New form25 detail checkboxes (23POS +posAccess +active),1 access orders checkbox,0 other checkboxes; original79 inventory minus53 inert controls =26 retained. Active-only view filter2 -> all3 -> active2 restored. No profile save or grant/revoke performed. Existing secured PIN login yields LAB POS2 ordinary own-store POS, empty cart/total0; after exact release STOCK header now visible for existing stockPos=true, payments and disabled card/IRIS remain visible for existing grants. This proves these UI observations only, not successful payment, return, barcode mutation, label printing, shift action or all-flag authorization.

Evidence CHECKPOINTS/EVIDENCE/operator-checkbox-live-20261009.json and operator-checkbox-details-20261009.jpg; matrix CHECKPOINTS/CHANGES/2026-10-09-operator-checkbox-matrix.md; manual docs/manual/workforce/PASS.md. Removed legacy permission fields remain persisted and are preserved by isolated save test. No transaction replay, credential change, production financial/stock/shift/fiscal write or SQL mutation. Historical Gate8 and all other PASS/owners remain unchanged, including invoice orders, assistant minimize and AI credit.

Single next action: obtain action-time confirmation for temporary grant/revoke/restore of the26 retained checkboxes on existing LAB POS2 only, then fresh baseline, per-control UI/runtime granted/denied checks and exact original-profile restoration. No Manager promotion, credentials or financial transactions included. Real fiscal/financial/shift actions require separate handoff if needed; wider roles/store/company/module coverage remains OPEN. General prior approval does not replace browser action-time confirmation for materially expanded sensitive access.
