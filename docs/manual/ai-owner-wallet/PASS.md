## 30/10/2026 — Διακόπτης χρέωσης AI τιμολογίων ανά εταιρεία: LAB PASS

Εγκατεστημένη και ελεγμένη έκδοση c029c4ecd6f59f59c0987eb53d9135fc6dfd7d19. Μόνο ο συνδεδεμένος Platform SuperAdmin αλλάζει αυτή τη ρύθμιση.

1. Ανοίγουμε https://myworkstation-app.onrender.com/platform-admin και «Υπόλοιπα AI πελατών».
2. Επιλέγουμε ρητά την «Εταιρεία». Η κεντρική ρύθμιση ισχύει για όλα τα καταστήματά της.
3. Ελέγχουμε την ετοιμότητα και το υπάρχον υπόλοιπο. Επιλέγουμε «Χρέωση AI τιμολογίων». Για πραγματική αφαίρεση από το υπόλοιπο πρέπει να είναι ενεργή και η γενική «Χρέωση AI στον πελάτη».
4. Πατάμε μία φορά «Αποθήκευση ρυθμίσεων». Περιμένουμε «Οι ρυθμίσεις αποθηκεύτηκαν.» και «Η χρέωση τιμολογίων είναι ενεργή.». Ξαναεπιλέγουμε την ίδια εταιρεία για έλεγχο διατήρησης.
5. Για απενεργοποίηση αποεπιλέγουμε «Χρέωση AI τιμολογίων» και αποθηκεύουμε. Η γενική χρέωση μπορεί να παραμείνει για τον Βοηθό Ιδιοκτήτη. Για συνολική παύση αποεπιλέγουμε και τη γενική χρέωση. Το υπόλοιπο και το ιστορικό διατηρούνται· ήδη δεσμευμένες κλήσεις εκκαθαρίζονται με τον αρχικό τιμοκατάλογό τους.

Η ελεγμένη native LAB ροή ήταν μία αποθήκευση και των δύο ON, επανάνοιγμα, έπειτα μία αποθήκευση και των δύο OFF και επανάνοιγμα. Έκδοση 15→16→17, ακριβώς ένα configuration audit ανά αποθήκευση, μηδενική μεταβολή χρημάτων/κινήσεων/ειδοποιήσεων και των τριών LAB επιχειρησιακών controls. Η άλλη πραγματική εταιρεία παρέμεινε ενεργή χωρίς αποθήκευση. Η νέα δυνατότητα δεν απαιτεί αλλαγή server env ανά εταιρεία.

Οι παγκόσμιοι διακόπτες και οι υπάρχουσες άδειες/έλεγχοι καταστήματος παραμένουν απαραίτητοι. Κενή επιλογή δεν σημαίνει όλες οι εταιρείες. Δεν αλλάζουμε τιμές, μοντέλα, κωδικούς σύνδεσης ή υπόλοιπο από αυτόν τον διακόπτη. Η τοπική ανάγνωση χωρίς AI δεν χρεώνεται. Το υπάρχον ανεξάρτητο PASS πραγματικής μέτρησης Azure/OpenAI παρακάτω διατηρείται χωρίς επανάληψη.

Αν η ενεργοποίηση είναι μη διαθέσιμη, ελέγχουμε την ένδειξη σύνδεσης/τιμοκαταλόγου με τον διαχειριστή. Αν αναφερθεί αλλαγή έκδοσης ή αβέβαιο αποτέλεσμα, ξαναδιαβάζουμε την ίδια εταιρεία πριν από νέα αποθήκευση. Δεν επαναλαμβάνουμε κλήση AI, πίστωση ή παραστατικό για να δοκιμάσουμε τον διακόπτη. Η ακρίβεια OCR, άλλη πραγματική Owner συνεδρία, άλλα μοντέλα/tier και η παράδοση email δεν πιστοποιούνται από αυτό το configuration PASS.

Τεκμήρια: CHECKPOINTS/CHANGES/2026-10-30-ai-wallet-invoice-admin-switch.md και CHECKPOINTS/EVIDENCE/ai-owner-wallet-20261022/invoice-admin-switch-lab-20261030.json. Τα παλαιότερα κείμενα rollout παρακάτω είναι ιστορικά· η νέα ρύθμιση ανά εταιρεία είναι η τρέχουσα διαδικασία.

## 30/10/2026 — Επιλεγμένη πραγματική εταιρεία: ενεργή χρέωση τιμολογίων

Η ενεργοποίηση της ρητά επιλεγμένης πραγματικής εταιρείας επιβεβαιώθηκε στην εγκατεστημένη έκδοση7bb1dc6adcfa2687bfcdec805c45571307674d87, μετά το μετρημένο LAB PASS παρακάτω. Στο Platform Super Admin → Υπόλοιπα AI πελατών επιλέγουμε την εταιρεία: ο διακόπτης χρέωσης είναι ενεργός και η ένδειξη αναφέρει «Η χρέωση καλύπτει τον Βοηθό Ιδιοκτήτη και τις αναγνώσεις τιμολογίων με AI.». Οι φυσικές σελίδες Azure και τα πραγματικά tokens OpenAI αφαιρούνται από το υπάρχον υπόλοιπο σύμφωνα με τον τιμοκατάλογο. Οι προσωρινές δεσμεύσεις εκκαθαρίζονται με την πραγματική χρήση. Η τιμολόγηση άλλης εταιρείας δεν ενεργοποιείται από την επιλογή της στην οθόνη.

Το LAB είναι απενεργοποιημένο και εξαιρείται από το invoice rollout. Η αλλαγή διατήρησε ακριβώς υπόλοιπα/κινήσεις/ειδοποιήσεις/audit και δεν επανέλαβε πραγματικό τιμολόγιο. Η χρέωση ενεργοποιήθηκε· η ακρίβεια της ανάγνωσης και η έγκριση παραστατικού παραμένουν χωριστή διαδικασία. Δεν παρακάμπτουμε ΠΡΟΣ ΕΛΕΓΧΟ, έγκριση ή λοιπούς ελέγχους. Λεπτομέρειες: CHECKPOINTS/CHANGES/2026-10-30-ai-wallet-invoice-activated.md. Οι εκκρεμότητες άλλων μοντέλων, πραγματικής Owner συνεδρίας και παράδοσης email δεν κλείνουν από αυτό το configuration PASS.

## 30/10/2026 — Περιορισμένο LAB PASS χρέωσης ανάγνωσης τιμολογίων

Επαληθεύτηκαν πραγματικές χρεώσεις Azure ανά φυσική σελίδα και OpenAI ανά token, με αμετάβλητο τιμοκατάλογο, ακριβή τελικό υπολογισμό και μηδενικές εκκρεμείς δεσμεύσεις. Δοκιμή σε MYWORKSTATION LAB, εγκατεστημένη έκδοση e950d9b16bb20f3f5666d858a1bc59098bf53e9f. Η ενεργοποίηση πραγματικής εταιρείας παραμένει χωριστό επόμενο βήμα.

Ο Platform Super Admin ανοίγει /platform-admin → Υπόλοιπα AI πελατών και επιλέγει ρητά εταιρεία. Η ένδειξη πρέπει να περιλαμβάνει αναγνώσεις τιμολογίων με AI. Ο διακόπτης «Χρέωση AI στον πελάτη» εφαρμόζεται μόνο στην επιλεγμένη εταιρεία και διατηρεί χρήματα/ιστορικό. Η απενεργοποίηση παραμένει διαθέσιμη. Τα email ελέγχονται χωριστά.

Για τον μετρημένο έλεγχο χρησιμοποιήθηκε Πλήρες Backoffice του συγκεκριμένου LAB → Εμπορική λειτουργία → Λοιπές εμπορικές λειτουργίες → Ανάγνωση τιμολογίων. Η φόρμα βρίσκεται κάτω από την κυλιόμενη πλοήγηση. Επιλογή ΝΕΟΥ εικονικού παραστατικού → Έναρξη τοπικού OCR αποθηκεύει τοπική ανάγνωση χωρίς AI. Το «Επανέλεγχος με AI (χειροκίνητα)» στο συγκεκριμένο νέο αρχείο καλεί την υπάρχουσα διαδρομή Azure/ενδεχόμενου OpenAI. Μία επιλογή δεν ισοδυναμεί με έναν πάροχο: κάθε πραγματική κλήση μετριέται χωριστά. Υψηλή τοπική βεβαιότητα μπορεί να αποφύγει την πλήρη κλήση OpenAI. Δεν επαναλαμβάνουμε αίτημα με άγνωστο αποτέλεσμα.

Κριτήρια PASS χρέωσης: αντιστοίχιση πραγματικών σελίδων ή tokens/model με immutable tariff στην κίνηση SETTLED, ανεξάρτητος ακέραιος υπολογισμός χρέωσης, ακριβής μεταβολή διαθέσιμου ποσού και μηδενική τελική δέσμευση. Οι δύο νέες δοκιμές έδωσαν Azure13200 + Azure13200 + OpenAI5416 =31816 microEUR. OpenAI gpt-5-2025-08-07:1425 input/0cached/226output. Επαναφορά LAB OFF χωρίς νέα πίστωση. Δεν μεταβλήθηκαν πωλήσεις, πληρωμές, παραγγελίες ή απόθεμα LAB· ο άλλος λογαριασμός διατηρήθηκε.

Όρια: αυτό είναι PASS ΜΟΝΟ μέτρησης/χρέωσης και ON/OFF, όχι ακρίβειας OCR, προμηθευτών, έγκρισης, άλλων μοντέλων/cache/long-context, ειδοποιήσεων ή πραγματικής Owner συνεδρίας. Τα αποτελέσματα των εικονικών παραστατικών χρειάζονται έλεγχο και μένουν χωρίς έγκριση/purchaseDocumentId. Δεν επιλέγουμε καταχώριση, πληρωμή ή ενημέρωση αποθήκης. Σφάλμα ή REVIEW διατηρείται για διερεύνηση, χωρίς τυφλή επανάληψη ή χειροκίνητη αλλοίωση κράτησης.

Αναλυτικά τεκμήρια: CHECKPOINTS/CHANGES/2026-10-30-ai-wallet-invoice-metered-lab.md και CHECKPOINTS/EVIDENCE/ai-owner-wallet-20261022/invoice-metered-lab-20261030.json. Προηγούμενα περιορισμένα PASS και λοιπές εκκρεμότητες παραμένουν ως καταγεγραμμένα.

# Internal AI trial grant — scoped hosted LAB PASS

Verified25October2026 on6fdadef6f1ff04b8c71e516fc7144a417920905c. Evidence: CHECKPOINTS/EVIDENCE/ai-owner-wallet-20261022/hosted-lab-trial-20261025.json. Internal noncash trial administration only.

Only authenticated Platform Super Admin may use it. Open https://myworkstation-app.onrender.com/platform-admin, select “Υπόλοιπα AI πελατών” and explicitly choose the company. The balance belongs to that company and is shared across its stores. Empty selection must never imply a company.

1. Refresh balance, reserved amount and recent entries; record a before baseline and verify company selection.
2. In “Δοκιμαστική πίστωση από το MyWorkStation”, enter approved amount, one stable unique reference and clear reason.
3. Confirm the internal trial checkbox and submit once. Do not use the separate confirmed-receipt form for an internal grant.
4. Check success, exact balance increase, one trial movement and one notice. Reload read-only and verify the same movement and balance.

Hosted LAB granted5EUR once: customer chargingOFF/emailOFF, business controls unchanged, ledger/notice/audit independently matched. Trial funding does not activate customer charging. No customer payment or provider call occurred.

If a result is uncertain, reconcile that same reference and balance first; do not invent another reference or repeat a credit to repair missing evidence. A usage reservation may exceed the trial balance. Paid funding, actual customer usage, pricing, detailed Owner reports, invoice charging and email delivery are outside this PASS.

## Separate private pilot acceptance

25October2026 the same internal trial workflow was verified once in the independently selected private pilot company, after the hosted LAB PASS merged. Private before/after/reload evidence retains the exact approved values and stable entry identity; public SHA256 cbd8f372173b3460b6bcd146d6f1f323f29fa10bb13a637fc2dd4e01be9e060e. Customer charging and email stayedOFF; the synthetic LAB wallet remained unchanged. The live store was trading, so business-counter changes are not an isolated acceptance test. No broader usage billing or pricing PASS is implied.

## Real usage and agreement toggle — scoped LAB PASS

Verified25October2026 on30fe4c1088b83a67a8d59760b4387de3374c3046. Evidence CHECKPOINTS/EVIDENCE/ai-owner-wallet-20261022/metered-lab-20261025.json. Native Super Admin used the existing scoped support preview of the Owner assistant in MYWORKSTATION LAB; this is not a claim of an actual OWNER-session dashboard acceptance.

1. In Platform Admin, open “Υπόλοιπα AI πελατών”, explicitly select the company and confirm model, valid price schedule, available balance and conservative maximum hold. Readiness reports configured metadata; a real provider request is still necessary to verify metering.
2. With fresh recorded before values, enable “Χρέωση AI στον πελάτη” and save once. The verified enable changed configuration/audit/version only; it did not credit or debit money.
3. For a scoped authorized test, open the chosen store's full Backoffice, “Εμπορική λειτουργία”, “Λοιπές εμπορικές λειτουργίες”, “Βοηθός Ιδιοκτήτη”. Confirm the selected store. Submit one identified question with “Ρώτα” and wait for the result; do not resubmit an uncertain response. One question can cause multiple provider calls under the existing tool/recovery flow.
4. Reconcile each resulting ledger entry against provider-reported usage and its immutable tariff, the exact balance debit, zero remaining hold and unaffected company/business controls. The accepted question produced one completed response, one settled charge0.004152EUR and balance4.995848EUR from5EUR.
5. Return through “Επιστροφή στο Super Admin”. Select the same wallet, disable customer charging and save once. Verified OFF preserved the spent balance and settled history. Customer agreements can keep this flagON orOFF; existing pending calls remain governed by their original holds.

The tested price schedule uses the official GPT-5-mini standard token rates, approved50percent markup and dated ECB23October2026 EUR conversion. It is a fixed, versioned schedule, not live FX. Do not alter model/context limits or invent Azure rates to fit a balance. Existing readiness/insufficient-funds/review errors require checking the exact reference/hold rather than blind refunds or retries.

This PASS covers real metering/settlement and configurationON/OFF in scoped support preview. Actual Owner-session detailed UI, invoice/Azure charging, threshold notices and SMTP delivery remain outside it. No business/fiscal operation or customer receipt was performed.

## Pilot activation — scoped LIVE PASS

25October2026 native Super Admin enabled the existing pilot Owner AI entitlement and then customer prepaid charging, with separately fresh private before/after controls. The live release was eba062f7d32e6bb51e112d25ae254067d698ef9a, with wallet code unchanged from the paid LAB acceptance release. Private evidence digest caaad6b68abf4b0a8287734e3cceb835f2c753dc81ec61a9c0920d286b853da9. This verifies administration/configuration, not an actual OWNER-session dashboard or new customer provider call.

Open “Συνδρομές & Modules”, choose the correct company, inspect existing prices/terms, select only “AI Βοηθός Ιδιοκτήτη” and save once while preserving its agreed plan/prices/dates. The accepted pilot had zero additional module monthly/setup fee. Native bulk save stamps metadata timestamps and materialized two missing inactive, zero-cost catalogue defaults; no connector or wholesale feature was enabled. Existing effective entitlements and commercial values were reconciled independently. This is a scoped pilot license save, not a blanket acceptance of every license-editor configuration.

Next open “Υπόλοιπα AI πελατών”, explicitly choose the same company, confirm valid model tariff and available hold coverage, check “Χρέωση AI στον πελάτη” and save once. Refresh/read-only reopen to verify the checked state, exact preserved balance/reserved/history and expected single configuration audit/version change. The accepted target remained funded from its original internal trial; no extra credit or payment was made. Email stayedOFF.

For a different customer agreement, uncheck and save the same flag with fresh before/after evidence. The measured LAB OFF flow retained funds/history and settled usage. Invoice billing, actual Owner-session detail display, low/empty thresholds and delivered email remain outside the current hosted PASS.

## Email configuration ON/OFF — scoped LAB PASS25October2026

Authenticated existing SuperAdmin may open canonical Platform Admin, “Υπόλοιπα AI πελατών”, and explicitly select the company. In “Σύνδεση τιμολογίων και email”, confirm emailactive on server and SMTP settings present. This indicates configuration, not delivery. Never enter credentials in the wallet form.

For the tested LAB flow, leave customer chargingOFF, select the existing LAB OWNER in “Ιδιοκτήτης για ειδοποιήσεις”, check “Ειδοποιήσεις email στον ιδιοκτήτη” and save once. Confirm success, reload/readback and exact preserved balance/history/notices with only version/audit+1. To restore the original opt-out, uncheck email, choose the empty owner option and save once using freshly recorded before values. LAB version5→6→7 and balance4.995848EUR/zeroreserve persisted; foreign/business/module controls unchanged. No funding/provider/SMTP event was created and old disabled notices were not revived.

The native shared-owner listing is available through existing OwnerCompanyAccess; production role/password/company and original-recipient checks remain mandatory. The test above covers direct LAB owner configuration, not hosted shared-owner opt-in or delivered mail. If an owner is unavailable, inspect current role/password/company membership rather than creating a user or changing permissions. Pending or uncertain old messages must not be retargeted or blindly resent. Invoice charging remainsOFF pending its separate prices/acceptance.

## Existing shared-owner email opt-in — scoped LIVE PASS25October2026

Existing authenticated SuperAdmin opens https://myworkstation-app.onrender.com/platform-admin, “Υπόλοιπα AI πελατών”, explicitly selects the intended company and confirms server emailactive/SMTP settings present. Select the correct existing OWNER under “Ιδιοκτήτης για ειδοποιήσεις”; authorized OwnerCompanyAccess membership is now recognized alongside direct company membership. Select “Ειδοποιήσεις email στον ιδιοκτήτη” and save once while preserving the agreed customer-charging flag. Read-only reopen the same company and confirm both saved flags and recipient.

The tested pilot changed emailOFF/recipientNULL/version2 to emailON/the same authorized shared owner/version3, adding one configuration audit only. Funds/reservations/history/notices, foreign wallet and business/module controls were unchanged. Reopen preserved that exact state. This verifies selection, save and persistence, not actual OWNER login or delivered email. Global SMTP was already configured; no new credentials or permissions were created.

Only subsequent legitimate credit/low/empty events can create new email notices. Previously disabled events stay disabled and are never repointed or replayed. Actual SMTP acceptance/inbox delivery and hosted threshold behavior remainNOT TESTED. Do not create a fictitious payment, extra trial credit or repeat a settled provider request to generate an email. If an intended recipient loses access/role or its address changes, review the current configuration; fresh delivery checks revoke old mismatched notices. Invoices remain outside prepaid charging until their separate actual provider tariffs and holds are verified.
