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
- Δεν γίνεται production action από αυτή την αλλαγή.
- Merge μόνο μετά από CI PASS και έπειτα LAB επανάληψη της γρήγορης ανάγνωσης.

## Validation

- Προστέθηκε regression test: `fast header also falls back when Azure succeeds with an empty header`.
- PR #826 παραμένει draft μέχρι CI PASS.
