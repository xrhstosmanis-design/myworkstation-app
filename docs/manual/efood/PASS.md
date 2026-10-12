# efood - Περιορισμένο LIVE PASS δοκιμαστικού callback

Ημερομηνία: 12/10/2026 22:56 ώρα Ελλάδας.
Το PASS αφορά αποκλειστικά τη σωστή αναγνώριση του Authorization Bearer, την παραλαβή ενός εικονικού event από το efood Partner και το αυτόματο κλείδωμα του LAB receiver. Η πραγματική λειτουργία Pelican και η παραγωγική πιστοποίηση παραμένουν OPEN.

## Ποιος και πού

Μόνο Platform Super Admin, αποκλειστικά MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ.
Είσοδος: https://myworkstation-app.onrender.com/platform-admin
Εταιρείες πελατών -> MYWORKSTATION LAB -> Καταστήματα -> myDATA / ΑΦΜ του ΕΡΓΑΣΤΗΡΙΟΥ ΔΟΚΙΜΩΝ -> Ασφαλείς διασυνδέσεις -> efood / Pelican.
Στο efood Partner: Ενσωματώσεις καταστημάτων -> Προβολή Παραγωγή -> Ρυθμίσεις -> API -> Ρυθμίσεις Webhook Παραγγελιών, μόνο το Test shop MyWorkStation POS / vendor9344842.

## Επαληθευμένη ροή

1. Επιβεβαιώστε συγκεκριμένη εγκεκριμένη δοκιμή, το σωστό LAB/SANDBOX, ενεργή διορθωμένη έκδοση και καταγράψτε φρέσκα στοιχεία ταμείων/αποθήκης πριν από νέα ενέργεια.
2. Χρησιμοποιήστε τα ήδη αποθηκευμένα callback και μυστικό. Δεν χρειάζεται περιστροφή κλειδιού για το συγκεκριμένο σφάλμα.
3. Ετοιμάστε μία εικονική παραγγελία READY_FOR_PICKUP, LOGISTICS_DELIVERY, 1xSLL45E, UNIT, IN_CART.
4. Με την απαιτούμενη έγκριση ανοίξτε το one-shot LAB webhook για5λεπτά. Επιβεβαιώστε ΑΝΟΙΧΤΟ πριν από μία υποβολή.
5. Στείλτε μία φορά από το Trigger Test Order. Μετά ανοίξτε το ιστορικό Webhook και την Απάντηση JSON.
6. Η επαληθευμένη δοκιμή εμφάνισε SUCCESS, accepted=true, dryRun=true, eventId και processingStatus=LAB_WEBHOOK_VALIDATED_ONLY. Το νέο άνοιγμα του πίνακα MyWorkStation εμφάνισε CONSUMED και αυτόματο κλείδωμα.
7. Καταγράψτε την ίδια παραγγελία/event και ελέγξτε ξανά τα αρχικά στοιχεία. Μην επαναλάβετε ολοκληρωμένη παραγγελία ή πληρωμή για τεκμηρίωση.

## Ασφάλεια και όρια

Το header παραμένει υποχρεωτικό. Το σύστημα αναγνωρίζει ένα σωστά σχηματισμένο Bearer token και συγκρίνει το hash του με constant-time έλεγχο. Η προηγούμενη μορφή raw token διατηρείται. Αυτό δεν καταργεί τον έλεγχο του μυστικού ή τα LAB/SANDBOX/one-shot/expiry/tenant/demo όρια.
Το πραγματικό callback επέστρεψε externalCall, orderCreated, saleCreated, stockChanged, paymentPosted και fiscalExecution=false. Τα δύο ελεγχόμενα αποθέματα και οι ορατές τιμές ταμείου παρέμειναν ίδια. Αυτό δεν είναι ανεξάρτητη καταμέτρηση όλων των εγγραφών DB, οικονομικό/φορολογικό PASS ή πιστοποίηση παραγωγής.
Η σωστή απαιτούμενη ταυτότητα μέσα στο actual client.store_id και η αντιστοίχιση προϊόντων/τιμών/πληρωμών παραμένουν χωριστές εκκρεμότητες. Το test shop δεν παρέχει πλήρη πραγματική ροή Pelican. Δεν ενεργοποιούνται πραγματικά καταστήματα με βάση αυτό το PASS.
Το live retry, ταυτόχρονη υποβολή, λήξη και αρνητικοί έλεγχοι έχουν μόνο local/CI κάλυψη στην παρούσα καταγραφή.

## Κριτήρια και επίλυση προβλημάτων

Το περιορισμένο PASS απαιτεί actual provider SUCCESS/accepted και event identity, fresh CONSUMED/locked και ακριβή συμφωνία των καταγεγραμμένων ορατών ελέγχων. Δεν αρκεί πράσινο CI ή δημιουργία test order.
EFOOD_TEST_SECRET_INVALID πριν από την έκδοση6d4c426: υπήρχε ασυμβατότητα Bearer. Μετά τη διόρθωση η ίδια ρύθμιση έγινε δεκτή. Αν παρουσιαστεί ξανά, κρατήστε το συγκεκριμένο request/response χωρίς εκτύπωση Authorization, ελέγξτε την έκδοση και τον συνδυασμό ρύθμισης, και μην αλλάξετε κλειδιά ή υποβάλετε συνεχόμενες δοκιμές χωρίς διάγνωση.
EXPIRED ή MANUAL: δεν υπάρχει ανοικτό παράθυρο. CONSUMED: η μία επιτρεπτή δοκιμή παραλήφθηκε και ο receiver κλείδωσε. Καμία νέα υποβολή χωρίς ξεχωριστό συμφωνημένο σκοπό.

## Τεκμήριο

SourcePR2386, deployed6d4c426df7b16742d9c2481c6f74fef0071cc99c.
Provider webhook6acd3b53b8395c593d96e2ba, orderc79b178a-34e6-4d11-9eb5-2a7246209c60, response22:56:03Europe/Athens.
MyWorkStation event8aecdfb3-c3c2-4531-9ce1-391bc3baee7c.
Checkpoint: CHECKPOINTS/CHANGES/2026-10-12-efood-bearer-authorization.md.
