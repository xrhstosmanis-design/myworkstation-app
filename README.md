# MyWorkStation App v0.6 — Smart Shift Engine 2.0

## Εγκατάσταση online με ένα πάτημα

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/xrhstosmanis-design/myworkstation-app)

Το Render διαβάζει αυτόματα το `render.yaml` και δημιουργεί:

- το MyWorkStation Web Service,
- τη βάση PostgreSQL,
- το `DATABASE_URL`,
- ασφαλές `JWT_SECRET`,
- αρχικό λογαριασμό ιδιοκτήτη,
- τους πίνακες και τα αρχικά δοκιμαστικά δεδομένα.

Περιοχή εγκατάστασης: **Frankfurt**, για καλύτερη απόκριση από την Ελλάδα.

Μετά το deployment:

1. Άνοιξε το Web Service στο Render.
2. Έλεγξε ότι το `/api/health` απαντά επιτυχώς.
3. Από **Environment** δες μόνο το `INITIAL_ADMIN_PASSWORD`.
4. Σύνδεση με email `admin@myworkstationapp.gr`.
5. Πρόσθεσε το `myworkstation.gr` από **Settings → Custom Domains**.

## Νέα λειτουργικότητα

- Όριο μέγιστων ημερών και εβδομαδιαίων ωρών.
- Προαιρετική 6η ημέρα.
- Αποφυγή πρωινής, delivery ή υπεύθυνου μετά από νυχτερινή βάρδια.
- Όχι διπλή βάρδια την ίδια ημέρα.
- Όχι πάνω από 6 συνεχόμενες ημέρες.
- Σεβασμός σε άδειες, ασθένειες και μη διαθεσιμότητα.
- Εβδομαδιαίοι στόχοι βαρδιών.
- Δίκαιη κατανομή ωρών και Σαββατοκύριακων.
- Προτεραιότητα μόνιμου προσωπικού.
- Έκτακτοι μόνο όταν χρειάζονται.
- Εξηγήσεις ανά ανάθεση.
- Προτάσεις για ακάλυπτες θέσεις.
- Δείκτης ποιότητας προγράμματος 0–100%.
- Εβδομαδιαία αναφορά ημερών, ωρών και τύπων βάρδιας.

## Αναβάθμιση

Κάθε αλλαγή στο branch `main` ενεργοποιεί αυτόματο deployment στο Render.

Δεν απαιτείται τοπική εγκατάσταση PostgreSQL, Node.js ή Prisma στους υπολογιστές των χρηστών.
