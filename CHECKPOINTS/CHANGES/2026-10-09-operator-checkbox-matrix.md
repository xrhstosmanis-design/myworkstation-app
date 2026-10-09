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
