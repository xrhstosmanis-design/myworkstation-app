# 2026-09-13 — efood / Pelican Phase A foundation

## Κατάσταση

- **Branch:** `feat/efood-pelican-foundation`
- **Βάση:** σημερινό `main` commit `ce9c3863a90e5878dcbcebcf57ddfc15fa5c2edf`
- **Feature head πριν από το τελικό CI:** `25bb75cba6ee8beaf88e7b1d38181c4deb050833`
- **Συγχρονισμός:** το νεότερο `main` συγχωνεύτηκε μόνο προς το feature branch. Δεν έγινε merge της efood εργασίας στο `main`.
- **Κατάσταση εργασίας:** `ΣΕ ΔΟΚΙΜΗ`
- **Production ενεργοποίηση:** ΟΧΙ
- **Test vendor:** ΑΝΑΜΟΝΗ ΑΠΟ EFOOD

## Υλοποιήθηκε στη Φάση Α

- Προστέθηκε τύπος ασφαλούς διασύνδεσης `EFOOD` ανά εταιρεία/κατάστημα, αποκλειστικά σε `SANDBOX`.
- Client ID, Client Secret, ακριβής τιμή Authorization webhook και εισερχόμενο raw payload αποθηκεύονται κρυπτογραφημένα με AES-256-GCM και δεν επιστρέφονται στο UI.
- Προστέθηκε δημόσια διαδρομή Pelican webhook με opaque key, υποχρεωτικό Authorization, constant-time σύγκριση και fail-closed gate.
- Η δημόσια διαδρομή παραμένει λειτουργικά ανενεργή: `enabled=false`, `externalCallsEnabled=false`, χωρίς `sandboxValidatedAt` και χωρίς endpoint ενεργοποίησης.
- Προστέθηκαν tenant/store-scoped πίνακες για webhook evidence, product mappings και local-only Catalog/Promo/Orders previews.
- Τα ίδια order/status events έχουν idempotency key και immutable payload hash. Ίδιο key με διαφορετικό payload καταγράφεται ως conflict χωρίς λειτουργική μεταβολή.
- Τα mock webhook events μπορούν να ελεγχθούν μόνο από Platform Super Admin και δημιουργούν μόνο encrypted evidence / unmatched mapping candidates.
- Οι αντιστοιχίσεις προϊόντων επιτρέπουν μόνο προϊόν της ίδιας εταιρείας που υπάρχει στο ίδιο κατάστημα.
- Τα Catalog, Promo και Orders recovery requests δημιουργούνται μόνο ως `externalCall:false` previews. Δεν υπάρχει `fetch` ή αποστολή σε efood.
- Τα νέα routes συνδέονται idempotently με το καθιερωμένο server patch pattern στο build, start και dev.

## Ρητά αμετάβλητα

- Δεν δημιουργείται `OnlineOrder` ή πώληση.
- Δεν αλλάζει stock, τιμή ή προσφορά.
- Δεν καταχωρίζεται πληρωμή.
- Δεν καλείται RBS, CapDriver ή EFTPOS.
- Δεν εκδίδεται φορολογικό παραστατικό.
- Δεν χρησιμοποιούνται production credentials ή production endpoint.

## Έλεγχοι

- `node --check` στα νέα/τροποποιημένα server αρχεία: PASS.
- JSX parse της οθόνης ασφαλών διασυνδέσεων: PASS.
- `server/test/efood-pelican-foundation-v1.test.js`: **9/9 PASS**.
- CI #1948: **PASS σε όλα τα gates**, μαζί με checkpoint policy, Prisma preparation, security/licensing, client build, Work/Render contracts, KAT safety invariants, isolated PostgreSQL και πραγματικά HTTP E2E flows.
- Μετά το CI #1948, το `main` προχώρησε στο `ce9c3863a90e5878dcbcebcf57ddfc15fa5c2edf` μέσω PR #766 και συγχρονίστηκε ξανά μόνο προς το feature branch.
- Τελική σύγκριση με το νέο `main`: **14 αναμενόμενα αρχεία και 0 commits πίσω**.
- Η παρούσα ανθρώπινη ενημέρωση εκκινεί το τελικό πλήρες CI πάνω στη νέα βάση.

## Επόμενα υποχρεωτικά βήματα

1. Πράσινο τελικό GitHub CI στο draft PR #758.
2. Μετά από PASS, μόνο Super Admin local mock validation στο `MYWORKSTATION LAB`.
3. Παραλαβή test Vendor ID, portal access, sandbox credentials και webhook Authorization από efood.
4. Νέα ρητή έγκριση πριν από οποιαδήποτε ενεργοποίηση live sandbox webhook ή πραγματικό API call.
5. End-to-end Pelican tests (`READY_FOR_PICKUP`, `CANCELLED`, replay, recovery) πριν από σύνδεση με OnlineOrder/POS/stock/payment/fiscal.
