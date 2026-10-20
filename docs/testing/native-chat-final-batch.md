# Android Chat — ενιαία προετοιμασία και τελική αποδοχή

Owner: feat/android-chat-native-20261017. Οδηγία19/10/2026 21:02 Europe/Athens:
ολοκλήρωση προετοιμασίας Android πρώτα, μία συγκεντρωτική φυσική δοκιμή μετά· **iOS τελευταίο**.
Δεν επαναλαμβάνονται αποδεκτά μηνύματα/φωτογραφίες μόνο για τεκμηρίωση.
Αυτό είναι σχέδιο ελέγχου και setup, όχι manual πραγματικού PASS.

## Κατάσταση και εξαρτήσεις

- Περιορισμένα USER PASS: πολλαπλές φωτογραφίες συλλογής20:02 και δύο λήψεις κάμερας μαζί20:47.
  Ακριβές εγκατεστημένο hash/συσκευή/OS και ανεξάρτητη Admin παραλαβή δεν μετρήθηκαν σε αυτά τα βήματα.
- Έτοιμες απαντήσεις: sourcePR2868, συνδυασμένη προετοιμασίαPR2871· τελική φυσική αποδοχή αναβάλλεται για την ενιαία παρτίδα.
- Σταθερή υπογραφή: προετοιμασία build μετά το claimPR2870. Κανένα πραγματικό
  owner key/secret δεν δημιουργήθηκε ή διαβάστηκε. Η ρύθμιση secrets και η πραγματική
  παραγωγή υπογεγραμμένου candidate δεν έχουν επιβεβαιωθεί.
- Φωνητικά: voice-only source μετά green claimPR2876, **SOURCE CI/RELEASE VERIFIED — FINAL DEVICE ACCEPTANCE OPEN**.
  Ο παλιός image/PDF parser διατηρείται· προστέθηκε χωριστό GENERAL WAV endpoint και audio-only receiver,
  χωρίς takeover των υπαρχόντων PWA/N16 scopes. Contract: native-chat-voice-contract.md.
- AI: ακριβής φυσική φράση «τι πωλήσεις είχα σήμερα» στον υπάρχοντα owner
  codex/assistant-business-queries-20261015, χωρίς δεύτερη ανάληψη parser.
- Εξαρτήσεις/όρια: issue2869. Δεν υπάρχει συνολικό Android PASS.
- Δημόσιο APK/manifest/QR: παραμένουν0.1.3 ώσπου να υπάρχει συγκεντρωτικός verified candidate
  και συνηθισμένο guarded deployment. Μην εκλαμβάνετε το QR ως0.1.7.

## Μόνιμη υπογραφή της υπάρχουσας Preview εφαρμογής

Η νέα διαδικασία είναι manual-only και δέχεται μόνο main. Η εφαρμογή παραμένει
`gr.myworkstation.chat.preview`, debug/preview, **όχι production/Play release**.
Χρειάζεται υπάρχον μόνιμο owner-controlled keystore ή δημιουργία/ασφαλές αντίγραφο
από εξουσιοδοτημένο διαχειριστή. Μην το βάζετε σε repository, chat, APK ή δημόσιο artifact.
Δεν αντικαθιστούμε υπάρχον έγκυρο κλειδί χωρίς έλεγχο ιδιοκτησίας/backup.

Στις προστατευμένες GitHub Actions ρυθμίσεις του ίδιου repository ο διαχειριστής ορίζει:

| Τύπος | Όνομα | Περιεχόμενο |
| --- | --- | --- |
| Secret | MW_CHAT_KEYSTORE_B64 | Base64 του ιδιωτικού keystore |
| Secret | MW_CHAT_STORE_PASSWORD | Κωδικός keystore |
| Secret | MW_CHAT_KEY_ALIAS | Alias του συγκεκριμένου κλειδιού |
| Secret | MW_CHAT_KEY_PASSWORD | Κωδικός ιδιωτικού κλειδιού |
| Variable | MW_CHAT_CERT_SHA256 | Ελεγμένο δημόσιο SHA256 πιστοποιητικού,64 hex |

Το Base64 δεν είναι κρυπτογράφηση· αποθηκεύεται μόνο ως προστατευμένο secret.
Δεν ζητάμε τους κωδικούς στη συνομιλία. Ο τρέχων connector δεν μπορεί να διαχειριστεί
Actions secrets, συνεπώς η διαθεσιμότητά τους παραμένει άγνωστη.

Μετά από επιτυχές full CI του ακριβούς main (πραγματικό build-and-test SUCCESS, όχι docs-only SKIPPED· αν χρειάζεται εκτελείται πρώτα manual full CI) εκτελείται χειροκίνητα
`Android Chat stable signed preview`. Πριν πρόσβαση στο key εκτελούνται compile,
unit/lint και emulator regression στην ίδια revision. Μερική/ελλιπής ρύθμιση
αποτυγχάνει, χωρίς fallback σε τυχαίο κλειδί. Το keystore διαγράφεται από runner temp
και ανεβαίνουν μόνο APK + μη απόρρητο source/hash/bytes/certificate receipt.
Καμία αυτόματη δημόσια δημοσίευση, deploy, αποστολή μηνύματος ή ενεργοποίηση push.
Η πρώτη μετάβαση από παλιό άλλο signer μπορεί να απαιτεί αφαίρεση **μόνο MW Chat Preview**·
ποτέ POS ή ChatGPT. Μελλοντικές ενημερώσεις χρειάζονται ίδιο package/signer και αυξανόμενο versionCode.
Ένα build δεν αποδεικνύει φυσικό update χωρίς απεγκατάσταση.

Πηγές σχεδιασμού:
- https://developer.android.com/studio/publish/app-signing
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets

## Μία τελική παρτίδα, μόνο όταν όλα είναι έτοιμα

Πριν ξεκινήσει: pinned APK hash/cert/version, ακριβής server revision, μοντέλο/OS,
LAB και εξουσιοδοτημένος Admin/περιορισμένος χρήστης. Προηγούμενα PASS κρατούνται·
νέες αποστολές μόνο για νέο λειτουργικό σκέλος, χωρίς οικονομικές/stock/fiscal πράξεις.

| Βήμα | Έλεγχος | Αποδοχή |
| --- | --- | --- |
| 1 | Διανομή/QR και εγκατάσταση του τελικού candidate | Ίδιο hash/package/version με receipt |
| 2 | Αναβάθμιση από προηγούμενο stable-signed preview | Νεότερο versionCode, ίδιο πιστοποιητικό, χωρίς απεγκατάσταση |
| 3 | Έτοιμη απάντηση με υπάρχον πρόχειρο | Προσθήκη/αντικατάσταση/ακύρωση, καμία αποστολή πριν Send |
| 4 | Φωνητικό, μόνο μετά υλοποίηση server/receiver | Μία ρητή αποστολή, σωστός παραλήπτης/αναπαραγωγή, σαφής άρνηση μικροφώνου |
| 5 | Νέες αρνητικές περιπτώσεις δικτύου/συνεδρίας | Καμία αυτόματη επανάληψη, ξένο κατάστημα ή περιεχόμενο μετά logout/background |
| 6 | AI φράση μετά διόρθωση από υπάρχοντα owner | Σωστή πηγή/επιλεγμένο κατάστημα, χωριστή συμφωνία αριθμών |
| 7 | Ιδιωτικότητα και όρια σε επιλεγμένα phone/tablet | Μετρημένο αποτέλεσμα ανά συσκευή, χωρίς υπόσχεση μηδενικών OS/SDK ιχνών |

Δεν ξεκινά η παραπάνω παρτίδα όσο λείπουν voice/signing/διανομή ή άλλες εξαρτήσεις.
Αν αποτύχει ένα βήμα, σταματά μόνο το επηρεαζόμενο σκέλος· δεν επαναλαμβάνονται
τυφλά επιτυχημένα μηνύματα. Αποτέλεσμα/όρια καταγράφονται αμέσως μαζί σε checkpoint,
active/manual/pending/tracker/PDF σύμφωνα με AGENTS. Μετά την Android αποδοχή ακολουθεί iOS.
