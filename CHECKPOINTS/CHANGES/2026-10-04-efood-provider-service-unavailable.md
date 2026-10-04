# efood provider test — service-unavailable report, 2026-10-04

Owner: same continuation `agent/efood-partner-lab-20261004`.
Status: OPEN / BLOCKED · AWAITING EFOOD REPLY · HANDOFF PREPARED. Provider authentication, callback acceptance and Pelican/production certification remain NOT TESTED.

## 04/10/2026 22:17 Athens — email SENT / οδηγίες επόμενης σελίδας

Ο ιδιοκτήτης ζήτησε ρητά «στείλε μειλ» και στη συνέχεια «ενημέρωσε το checkpoint να ξέρει η άλλη σελίδα τι πρέπει να κάνει». Η αποστολή ολοκληρώθηκε και επαληθεύτηκε από Gmail metadata με label SENT:

- Από: Χρήστος Μάνης / xrhstosmanis@gmail.com.
- Προς: qc.integrations@e-food.gr.
- Κοινοποίηση: giannis.spyros@e-food.gr, groceries@e-food.gr — οι ίδιοι ενεργοί συμμετέχοντες του σχετικού νήματος της 24/09, χωρίς νέο παραλήπτη.
- Θέμα: Re: Αίτημα τεχνικής διασύνδεσης efood με MyWorkStation POS / BackOffice.
- Αποστολή: 04/10/2026 22:17:13 Europe/Athens / `2026-10-04T19:17:13.000Z`.
- Gmail message ID: `1a1085951cc721ce`; thread ID: `1a08c1108f87bb71`.
- Απάντηση στο τελευταίο σχετικό provider message της 24/09: `1a0d2b8a89aa167f`.
- Περιεχόμενο: vendor/chain, διάστημα δοκιμής21:53–21:58 Athens, επιλεγμένο προϊόν/status/quantity, user-reported Service is not available, fresh empty Webhook history και EXPIRED χωρίς επιβεβαιωμένη παραλαβή, ασυμφωνία ενεργού webhook/“Δεν έχει ρυθμιστεί” overview. Ζητήθηκαν ενεργοποίηση/διαθεσιμότητα του virtual test, request/correlation ID, αναλυτικό service error και χρόνος/HTTP status/body τυχόν callback.
- Στο νέο διαγνωστικό κείμενο δεν συμπεριλήφθηκαν secrets, Authorization headers, token, webhook-key URL ή ακριβή οικονομικά ποσά. Το Gmail διατήρησε παράθεση του υπάρχοντος νήματος στους ίδιους παραλήπτες· η readback επιβεβαίωσε SENT και απουσία των νέων LAB secret/callback-key markers. Δεν προστέθηκε attachment. Η αποστολή δεν είναι provider response ή callback PASS.

### Ακριβής συνέχεια για την άλλη σελίδα

1. Διάβασε πρώτα το τρέχον central board, αυτό το checkpoint και το νήμα Gmail `1a08c1108f87bb71`. Μην επαναλάβεις credential setup, τις δύο ήδη καταγεγραμμένες προσπάθειες ή το ιστορικό mock. Η παρούσα σελίδα κρατά το claim μέχρι η νέα σελίδα να καταγράψει ρητά την ανάληψη της ίδιας, περιορισμένης εκκρεμότητας efood· η οδηγία του ιδιοκτήτη επιτρέπει αυτή τη συνέχεια, όχι επέκταση σε άλλες εργασίες.
2. **Πρώτη ενέργεια: έλεγξε εάν υπάρχει απάντηση από efood μετά τις22:17:13 της04/10.** Αν δεν υπάρχει, κράτησε BLOCKED / AWAITING EFOOD REPLY και ενημέρωσε τον ιδιοκτήτη. Μην στείλεις δεύτερο email ή ανοίξεις νέο LAB παράθυρο για να καλύψεις την απουσία διάγνωσης. Δεν έχει ζητηθεί αυτόματη παρακολούθηση.
3. Από την απάντηση ξεχώρισε τεκμηριωμένα εάν η αποτυχία έγινε στο virtual test service πριν την αποστολή, στη διαμόρφωση του test vendor, στην παράδοση ή στην απόκριση του receiver. Απαίτησε ακριβές request/correlation ID, ώρα και HTTP status/body όπου υπάρχουν. Η γενική φράση Service is not available και τα telemetry errors δεν είναι root cause.
4. Αν efood διορθώσει/ενεργοποιήσει το virtual test, επιβεβαίωσε τη συγκεκριμένη αλλαγή και ετοίμασε μόνο μία νέα δοκιμή για vendor9344842 / το ακριβές MYWORKSTATION LAB store. Αν η απόκριση αποδεικνύει δικό μας receiver/payload σφάλμα, κάνε την ελάχιστη αντίστοιχη διόρθωση μετά το repository pre-change gate και τους σχετικούς ελέγχους· καμία αλλαγή πηγαίου κώδικα μόνο βάσει υπόθεσης.
5. Πριν από νέα state-changing δοκιμή: τρέχον board/claim, ακριβές LIVE revision, fresh before controls για MAIN, LAB-POS-02 και TEST1/TEST2 με IDs, receiver locked/config σωστό, provider form έτοιμη. Ζήτησε φρέσκια action-time έγκριση για το ξεχωριστό300s LAB-only window. Νέα credentials, εάν πράγματι χρειάζονται, εισάγονται/αποθηκεύονται από τον χρήστη· δεν αλλάζουν επειδή το service έβγαλε γενικό σφάλμα.
6. Εκτέλεσε μόνο ένα εικονικό event ενώ το LAB είναι ΑΝΟΙΧΤΟ. Κατέγραψε provider request/HTTP αποτέλεσμα και πραγματικό receiver event/CONSUMED, έπειτα fresh after controls και IDs. Ο receiver πρέπει να κλειδώσει. Ελλείποντα event/movement IDs ή server response = NOT TESTED, όχι PASS. Επαναχρησιμοποίησε τα αποθηκευμένα settings, χωρίς επανεκτύπωση/επαναποστολή πραγματικών παραγγελιών.
7. Μόνο μετά από αποδεδειγμένο valid callback και ελέγχους απομόνωσης μπορεί να κλείσει το αντίστοιχο callback LAB gate με checkpoint/active/PENDING/manual/central PDF στο ίδιο τελικό PASS PR, όπως απαιτεί το AGENTS.md. Το πραγματικό Pelican flow και production certification παραμένουν διαφορετικά και NOT TESTED όσο το test shop δεν τα υποστηρίζει. TODAY, Archive, γενικό Gate6, installation και TABLE_SERVICE δεν ανήκουν σε αυτή τη συνέχεια.

Το receiver παραμένει EXPIRED/locked από την τελευταία παρατήρηση. Η παρούσα ενημέρωση αλλάζει μόνο τεκμηρίωση. Δεν έγινε νέα δοκιμή ή business write. Αν ο ιδιοκτήτης αλλάξει σελίδα, δώσε ως σημείο εκκίνησης το παρόν αρχείο και όχι επανάληψη του setup.

## Scope and authorization

MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ only, store `cmtpopbgo000trhb5ng9ytiru`, dedicated provider test vendor `9344842`, chain `3d848f43-4022-4b13-93aa-d1d9629352b3`. Operator PlatformSuperAdmin Χρήστος Μάνης, desktop1363×936; no physical POS transaction. Prior first-window result is preserved in `2026-10-04-efood-window-attempt.md` (PR1705).

Owner's «συνεχισε» at21:51:47 Europe/Athens approved the specifically prepared second300-second LAB-only window and one Enter submission. Fresh before controls were read before opening. No third window, additional secret, receiver/source edit, real-store change or historical mock was executed.

## Attempt and evidence

| Time | Evidence |
| --- | --- |
| 18:53:34.344Z / 21:53:34 Athens | UI open-window click completed; fresh LAB showed ΑΝΟΙΧΤΟ · 4:46. External calls / Order / Sale / Stock / Payment / Fiscal: ΟΧΙ. This is action observation time, not a server request timestamp. |
| 18:54:06.300Z / 21:54:06 Athens | One Enter pressed in quantity field for SLL45E, quantity1. Prepared READY_FOR_PICKUP / LOGISTICS_DELIVERY, product17 Delicatessen Μουστάρδα Πικαντική250g, default productstatus IN_CART. Form remained open; no success/error/request ID or HTTP result observed. |
| 18:55:43.748Z / 21:55:43 Athens | Fresh LAB configuration still ΑΝΟΙΧΤΟ · 2:51, no CONSUMED. One manual cloud-browser handoff offered for the blocked ordinary submission. |
| Owner report21:57:58 Athens | Owner said the manual click displayed «service is not avable», recorded as user-reported “Service is not available”. Exact manual-click time, request time, HTTP code, response body and order/request ID are not exposed. The error itself was not independently captured. |
| After owner report | Test-order dialog no longer present; only outer provider Settings remained. This does not prove a successful submission. LAB fresh copy near expiry still OPEN · 0:02. |
| 19:02:16Z / 22:02 Athens onward | Closing/reopening LAB configuration confirmed EXPIRED, no CONSUMED. External calls / Order / Sale / Stock / Payment / Fiscal remained ΟΧΙ. |
| 19:02–19:05Z | Closed provider Settings and reloaded existing history once. API Παραγγελιών→Webhook selected, date20.09.2026–04.10.2026, empty ID/no status filter: Δεν βρέθηκαν ενημερώσεις. No delivery row, request ID or request/response detail available. |

The provider overview also displays direct and indirect order integrations as “Δεν έχει ρυθμιστεί”, while the webhook configuration previously showed active/saved. Record this discrepancy for provider clarification; neither overview nor the generic error proves its cause. The dedicated vendor's virtual Trigger Test Order path remains the provider-confirmed test scope; actual Pelican is unavailable for this test shop.

Console errors inspected concerned failed Perseus telemetry delivery. A focused “Service” console query returned no entries. These are not attributed to the order request. No supported browser network-response inspector or provider delivery row exposed an HTTP result; no hidden endpoint, token or page-handler inspection was used.

The submit footer being outside the HTML form is only a candidate UI observation from the first attempt. Enter also leaving the form open does not establish JavaScript behavior or the cause of the owner's later service error.

## Fresh before / after controls

Before: refreshed second-attempt baseline21:52–21:53 Athens. After: refreshed19:02–19:05Z / 22:02–22:05 Athens.

| Control | Before | After |
| --- | --- | --- |
| MAIN | 2 transactions; cash2.40 EUR; cards/IRIS combined0; total2.40 EUR; latest01/10 12:51 Athens | Same |
| LAB-POS-02 | 2 transactions; cash0; cards0; IRIS0; total0; expenses120 EUR; latest— | Same |
| LAB EXCEL TEST1 | stock11; SKU LAB-EXCEL-20260909-01; product b1466a68-c47b-47cc-9139-69e6f9f7f978; last displayed sale01/10/2026 12:51:17 Athens | Same |
| LAB EXCEL TEST2 | stock−2; SKU LAB-EXCEL-20260909-02; product caec7ad6-a460-4c71-951f-95a10d943ebf; last displayed sale01/10/2026 12:51:17 Athens | Same |

These are unchanged UI controls following an unsuccessful/unconfirmed provider submission, not proof that a valid callback reached the receiver with isolated business effects. Stock movement IDs/times, integration-event count/ID, raw Authorization match, provider request/response and rejected-expiry behavior remain NOT TESTED. Historical offline/payment/owner queues were not acted on.

Fresh safe provider-history screenshot: `efood-service-history-1791140702303.jpg`, captured04/10/2026 around19:05Z. It shows the empty Webhook history, not the disappeared error. Screenshot saved separately; no secret/callback-key values are included here.

## Bounded next action

Obtain provider-side request ID, exact test-request timestamp, HTTP status/body or internal test-service error for vendor9344842, and reconcile the configured webhook with the “not configured” order-integration overview. There is currently no evidence to decide whether failure happened before delivery, in provider delivery, or at the LAB receiver. A generic error is insufficient to change authentication, payload mapping or source code.

The subsequent support email was sent on04/10 at22:17:13 Athens; see the handoff record above. Do not repeatedly submit or reopen windows to replace the missing diagnosis; any subsequent LAB opening requires fresh action-time approval after a concrete, prepared next test. Keep receiver expired/locked. Do not repeat historical mock or protected general Gate6 tests. No callback PASS or manual/PDF closure is warranted.

Documentation base `4f31ebfd936c07d9c92b98284751d595f7c26b66` includes concurrent TODAY/#27 work; only this checkpoint plus the efood entries in active list and PENDING_WORK are changed. All other ownership, TODAY, Archive, installation, generic Gates and TABLE_SERVICE are preserved. CI for these records is documentation validation, not LAB PASS.
