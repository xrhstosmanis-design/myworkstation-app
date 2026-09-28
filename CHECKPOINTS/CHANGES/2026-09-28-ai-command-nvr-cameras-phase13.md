# AI Command Center · ΦΑΣΗ 13 — NVR / Cameras στο Digital Twin

Κατάσταση: **IMPLEMENTED · LOCAL PASS · AWAITING CI / DEPLOY / LIMITED USER VISUAL PASS**

## Βάση και προστατευμένα PASS

- Βάση: `main` στο `917f1ea5ff5fca2ead58c6a976c344205f710446`, μετά το κλείσιμο της Φάσης 12.
- Η Φάση 12 παραμένει LIMITED USER VISUAL PASS με τέσσερις κάρτες και πραγματικούς POS/EFTPOS μετρητές.
- Το υπάρχον Video Audit έχει LAB PASS για D1 IPC → POS 1 → Dahua channel 1 και πραγματικό clip 90″ μέσω του υπάρχοντος connector.
- Οι υπάρχουσες οθόνες Super Admin, Video Connection Manager, POS, πληρωμών, invoice, stock και Workforce δεν ξαναγράφονται.

## Περιορισμένο scope

- Ανάγνωση του υπάρχοντος `GET /api/platform/companies/:companyId/stores/:storeId/video-connection` για κάθε κάρτα Digital Twin.
- Ένδειξη κατάστασης NVR/connector και αριθμού ενεργών καμερών ανά κατάστημα.
- Μετάβαση στην υπάρχουσα οθόνη `Video Events · Σύνδεση καταγραφικού` για λεπτομέρειες και επιτρεπόμενες ενέργειες.

## Όρια ασφαλείας

- Κανένα νέο endpoint, dataset, schema ή migration.
- Κανένα αυτόματο snapshot, live preview, clip request, pairing, test ή command προς connector/NVR.
- Καμία έκθεση endpoint, username, password, token ή RTSP URL στο Digital Twin.
- Καμία αλλαγή POS, πληρωμής, invoice, stock, Workforce, fiscal, λογιστικών ή Video Audit δεδομένων.

## Αποδοχή

1. Στοχευμένα tests, πλήρες server suite και production client build PASS.
2. Πράσινο CI, merge και exact production revision.
3. Παραγωγικό screenshot δείχνει την περιοχή `Κάμερες` ανά κατάστημα, με πραγματική κατάσταση και αριθμό ενεργών καμερών.
4. Μέχρι το screenshot: **AWAITING LIMITED USER VISUAL PASS**. Το CI δεν είναι USER PASS.

## Υλοποίηση και τοπικοί έλεγχοι

- Προστέθηκε έκτη read-only περιοχή `Κάμερες` στις υπάρχουσες κάρτες Digital Twin.
- Εμφανίζει `ONLINE/OFFLINE` και πλήθος ενεργών καμερών, `Δεν έχει ρυθμιστεί` όταν δεν υπάρχει ενεργή σύνδεση ή `ΜΗ ΔΙΑΘΕΣΙΜΟ` όταν αποτύχει μόνο η πηγή video.
- Η αποτυχία της πηγής video δεν κρύβει τους ήδη περασμένους POS/EFTPOS μετρητές.
- Το κουμπί ανοίγει την υπάρχουσα οθόνη Video Connection Manager του ακριβούς company/store.
- Στοχευμένα AI Command Center tests: **14/14 PASS**.
- Πλήρες server suite: **1.631 PASS, 1 SKIP, 0 FAIL**.
- Production client build: **PASS**.
- `git diff --check`: **PASS**.
