# PRE-KAT STEP 2A — POS Customer Selection

Ημερομηνία: 11/08/2026

Κατάσταση: **ΟΛΟΚΛΗΡΩΜΕΝΟ / LIVE**

- PR #135: `PRE-KAT POS customer selection and Sale linkage`
- Merge commit: `78fbdb9c3d32859ee7d06b39d9e7c88ac63066f0`
- CI #188: SUCCESS — regression/security tests + production build
- Render: SUCCESS

## Τι κλειδώθηκε

- Minimal ασφαλές customer search endpoint στο Store POS.
- Αναζήτηση με όνομα / ΑΦΜ / τηλέφωνο / email, active-only, company-scoped, έως 30 αποτελέσματα.
- Προαιρετικό `customerId` στο checkout με tenant validation.
- Πραγματικό `Sale.customerId` σε ολοκληρωμένη POS πώληση.
- Customer BackOffice visits/turnover μπορούν πλέον να βασίζονται σε πραγματικές POS πωλήσεις.
- POS UI: πραγματική επιλογή πελάτη ή `Χωρίς πελάτη` — δεν δημιουργείται fake retail customer.
- HOLD / restore αποθηκεύει και επαναφέρει `customerId + customerName`.
- Store Operator δεν αποκτά πρόσβαση στο πλήρες Customer BackOffice.
- Μετά από ολοκλήρωση πώλησης καθαρίζει ο πελάτης της συναλλαγής.

## Επόμενο

PRE-KAT STEP 2B — Customer wholesale pricing στο POS, με deterministic pricing και server-side validation.
