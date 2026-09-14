# 2026-09-14 — FAST invoice header: empty Azure result fallback

## Scope

- Διάγνωση στο `main` μετά το PR #825: το υπάρχον FAST fallback ενεργοποιούνταν σε Azure exception, αλλά όχι όταν το Azure ολοκλήρωνε τεχνικά επιτυχώς με ουσιαστικά κενή κεφαλίδα.
- Η αλλαγή περιορίζεται στο `POST /ai-reader/fast-header` και στο αντίστοιχο regression test.

## Αλλαγή

- Το normalized Azure αποτέλεσμα μετατρέπεται πρώτα σε `azureHeader`.
- Αν υπάρχει χρήσιμο βασικό στοιχείο προμηθευτή/παραστατικού/ημερομηνίας/συνόλου, διατηρείται η υπάρχουσα Azure απόκριση.
- Αν η Azure απόκριση είναι ουσιαστικά κενή, η ροή συνεχίζει στον ήδη υπάρχοντα OpenAI FAST fallback.
- Αν δεν υπάρχει διαθέσιμο fallback provider, η ροή αποτυγχάνει με ασφαλές μήνυμα και δεν προχωρά πληρωμή.

## Safety

- Δεν αλλάζει payment, draft, stock, handoff, approval ή finalization.
- Δεν έγινε production action από αυτή την αλλαγή.
- Merge/deploy μόνο μετά από ρητή έγκριση του Χρήστου.

## Validation

- Προστέθηκε regression test: `fast header also falls back when Azure succeeds with an empty header`.
- PR #826: CI #2173 PASS, μαζί με server tests, client build, production/security/licensing invariants και πραγματικά HTTP E2E flows.
- Το PR είναι έτοιμο για review και παραμένει unmerged. Επόμενο βήμα μετά από έγκριση: merge και κατόπιν LAB επανάληψη μόνο της γρήγορης ανάγνωσης των ίδιων δύο φωτογραφιών.
