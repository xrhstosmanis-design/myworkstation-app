# VOICE-ASSISTANT-01 — Ενιαίος φωνητικός βοηθός MyWorkStation

Ημερομηνία: 10/10/2026, Europe/Athens.
Owner/branch: `codex/unified-voice-assistant-20261010`.
Κατάσταση: ASSIGNED / REQUIREMENTS RECORDED / implementation and LAB NOT TESTED.

## Εντολή και συμφωνημένη συμπεριφορά

Ο ιδιοκτήτης ζήτησε φωνητική αναζήτηση, χρήση μικροφώνου κάμερας, αναφορές πωλήσεων συγκεκριμένου είδους/ημερομηνίας και στη συνέχεια «Ναι θέλω για όλα φωνητικό βοηθό». Πρόκειται για νέα ανεξάρτητη επέκταση σε POS, Backoffice και κεντρική διαχείριση. Δεν μεταβιβάζεται η εργασία N40 Full Digital Twin ή άλλη υφιστάμενη ανάθεση.

Ο χρήστης πατά το μικρόφωνο, μιλά ελληνικά, βλέπει/διορθώνει το αναγνωρισμένο αίτημα και το υποβάλλει. Η ενεργή εταιρεία/κατάστημα/χρήστης καθορίζει το πλαίσιο. Αναφορά άλλου καταστήματος απαιτεί ρητή επιλογή και server-side επαλήθευση πρόσβασης. Αμφίσημο προϊόν/προμηθευτής/εργαζόμενος ή ελλιπής ημερομηνία οδηγεί σε επιλογή/διευκρίνιση, ποτέ σε σιωπηρή εικασία. Τα «σήμερα/χθες/αυτή την εβδομάδα» επιλύονται με Europe/Athens και εμφανίζονται ως συγκεκριμένη περίοδος.

## Περιοχές και παραδείγματα

| Περιοχή | Παράδειγμα | Απαιτούμενη πραγματική πηγή |
| --- | --- | --- |
| Προϊόντα/POS | «Βρες Coca-Cola Zero» | Υφιστάμενος εξουσιοδοτημένος κατάλογος του καταστήματος· επιλογή από χειριστή |
| Πωλήσεις | «Πωλήσεις Coca-Cola από 1 έως 10 Οκτωβρίου στο ΚΑΤ» | Υφιστάμενη αναφορά πωλήσεων, ακριβές productId και φίλτρα ημερομηνιών/καταστήματος |
| Απόθεμα | «Πόσα νερά έχουμε;» | Υφιστάμενη προβολή stock, μονάδα και χρόνος ενημέρωσης |
| Τιμολόγια | «Δείξε τιμολόγια του προμηθευτή για τον Σεπτέμβριο» | Υφιστάμενα παραστατικά και αρμόδια δικαιώματα |
| Προμηθευτές/οφειλές | «Τι οφείλουμε στον προμηθευτή;» | Υφιστάμενη αναφορά υπολοίπων και ίδια λογιστική βάση |
| Πληρωμές/έξοδα | «Δείξε τα έξοδα της προηγούμενης εβδομάδας» | Υφιστάμενες καταχωρημένες κινήσεις, ίδια περίοδος και scope |
| Ταμεία/βάρδιες | «Δείξε τις διαφορές χθες» | Υφιστάμενοι έλεγχοι και αναφορές βάρδιας |
| Προσωπικό/πρόγραμμα | «Ποιοι δουλεύουν αύριο το πρωί;» | Υφιστάμενο Workforce και δικαιώματα προσωπικού |
| Εκκρεμότητες/Chat | «Άνοιξε τις εκκρεμότητες του καταστήματος» | Υφιστάμενο πληρωμένο module και σωστή επιλογή καταστήματος |
| Ρυθμίσεις/λοιπά modules | «Άνοιξε τις ρυθμίσεις της ταμειακής» | Επιτρεπόμενη πλοήγηση στη φυσιολογική οθόνη, υπάρχον module |

Αποτελέσματα σε αναγνώσιμη οθόνη με αναγνωρισμένα φίλτρα, πηγή/χρόνο και προαιρετική ανάγνωση απάντησης. Αν δεν υπάρχει υποστηριζόμενη ή διαθέσιμη πηγή, εμφανίζεται ο συγκεκριμένος περιορισμός, όχι κατασκευασμένος αριθμός.

## Επιβεβαίωση ενεργειών

Αλλαγή τιμής, δημιουργία/μεταβολή εγγραφής, αποστολή μηνύματος, πληρωμή, διαγραφή, καταχώριση/οριστικοποίηση ή άλλη πράξη απαιτεί φυσιολογικό preview και ρητή επιβεβαίωση στην υπάρχουσα φόρμα. Η υπαγόρευση και η απάντηση AI δεν αποτελούν εξουσιοδότηση, επιβεβαίωση ή αυτόματη εκτέλεση. Δεν παρακάμπτονται fiscal/RBS/myDATA, licensing, permissions, idempotency ή audit.

## Έλεγχος υπάρχουσας βάσης

- Διαβάστηκαν current-main AGENTS, tracker, numbered checklist, pending/active lists, super-admin manual, phase3 ask/ask-button checkpoints, current AiCommandCenter και σχετικό ιστορικό από το περιορισμένο USER visual PASS 28/09.
- Main source inspected at `689fe33b197c33009b3f4a1155e78cffd573973e`; production health observed through real browser: ok=true, version0.22.0+kat-test-pos, revision`55819e98851a89eb55f59c42ae1ee37b1517ee4f`. Server health does not attest cached client SHA.
- Existing ask route: Super Admin-only snapshot Q&A; no tools/database-write/execute permissions. It is not an existing all-module assistant and not evidence of arbitrary dated product-sales lookup.
- Phase1–14 visual acceptance, N40 five navigation round trips/Stock evidence and AI-CREDITS-01 remain protected with their current owners.
- Voice recognition, Greek microphone accuracy, product/date reports, other roles/devices and all-module assistant: NOT TESTED. No LAB or business action executed for this claim.

## Bounded implementation sequence

1. Common opt-in Greek speech input: capability/permission/error detection, press-to-talk, visible recording/stop, editable final text, no auto-submit/restart, stop on close/context change/logout. Unsupported browser keeps typing available. Explain that browser recognition may use an external speech service before microphone activation. No new provider key or recurring paid service.
2. Integrate voice input with the current authorized text-question path without enlarging its snapshot claims. Add independent production-component/controller tests and preserve existing ask/twin/credit regressions.
3. Read-only product-sales request from voice or text: resolve exact current-store product and Athens date range, display filters for confirmation, invoke canonical report, display quantities/value/movements with same return/void/tax conventions. Match against the normal report with existing LAB records; no synthetic sales solely for voice acceptance.
4. Add an explicit capability registry for remaining read-only domains above. Server-derived role/store/module checks, current context and late-result invalidation are mandatory per tool. Publish actual domain acceptance separately; unavailable domains stay visibly unavailable.
5. Optional answer speech and preview-only navigation/actions through existing forms. Destructive/fiscal/financial writes are not enabled by the transcript alone.

## Required acceptance

Common input: supported/unsupported API, denied/no microphone, silence/network/error, stop/cancel/retry, duplicate final events, unmount/context switch, delayed result discard, keyboard editing, narrow/mobile layout and no unsolicited listening. A transcript must never trigger an economic or data mutation or duplicate AI call.

Sales: exact product/date/store selection, ambiguous/no-match/no-data/invalid ranges, inclusive Athens dates and DST boundaries, normal report reconciliation, returns/void handling, denied tenant/role/module and stale response rejection. No database migrations or production fixtures.

Full rollout: every listed domain needs actual selected-store LAB read-only proof, source/revision/filter evidence and ordinary report comparison where numeric. Independent role/module/tenant negatives and microphone quality on actual POS/camera/Android are distinct from mocked CI.

All source changes require green full CI, merge, exact healthy deployment and real LAB/USER observation before PASS. CI is never LAB PASS. No manual PASS or numbered task closure yet.

## Next action / ownership

Publish the claim on main after documentation CI, preserving every current shared-document prefix. Then implement the common voice input as the first bounded change. This owner retains only VOICE-ASSISTANT-01; N40 and existing business-module owners are untouched. If interrupted, retain assignment and publish exact remaining scope instead of declaring completion.
