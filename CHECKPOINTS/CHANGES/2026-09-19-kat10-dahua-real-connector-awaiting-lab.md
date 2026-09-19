# KAT-10 — Πραγματικός Dahua connector — AWAITING LAB

Ημερομηνία: 19/09/2026

## Κατάσταση

**LAB NOT TESTED / AWAITING LAB.** Η υλοποίηση και τα αυτοματοποιημένα tests έχουν ολοκληρωθεί, αλλά δεν υπάρχει ακόμη πραγματική επιβεβαίωση με το Dahua `DHI-NVR2104-4KS3` και την κάμερα `DH-IPC-T1E20-A` στο τοπικό δίκτυο του POS. Το checkpoint δεν χαρακτηρίζει το KAT-10 ολοκληρωμένο.

## Υλοποίηση

- Πραγματικός Dahua/ONVIF client με WS-Security digest, device information, profiles, system time, snapshot URI και LAN WS-Discovery.
- Outbound-only device API για registration, heartbeat, command polling και ελεγχόμενο upload ζητημένου media με checksum και όριο μεγέθους.
- Windows connector για το POS με Dahua CGI/ONVIF health, snapshot και clip retrieval, αυτόματη επανασύνδεση και εκκίνηση ως scheduled task.
- Device token και Dahua read-only credentials προστατεύονται τοπικά με Windows DPAPI LocalMachine και δεν γράφονται στα logs ή στον κώδικα.
- Πραγματική κατάσταση online/offline και τελευταία επικοινωνία στην υπάρχουσα οθόνη «Video Events · Σύνδεση καταγραφικού».
- Ασφαλές snapshot/live preview μέσω authenticated proxy. Δεν αποστέλλεται RTSP απευθείας στον browser.
- Αυτόματος έλεγχος ώρας από το NVR API και καταγραφή απόκλισης για συγχρονισμό με `Europe/Athens`.
- Πραγματικό Audit clip στο ήδη υπάρχον χρονικό παράθυρο `30″ πριν / 60″ μετά`, με browser-compatible MP4 μετατροπή μέσω ffmpeg.
- Το συνεχόμενο video παραμένει στο NVR και media μεταφέρονται μόνο μετά από συγκεκριμένο αίτημα.

## Όρια ασφαλείας

- Χωρίς port forwarding ή εισερχόμενη σύνδεση από το cloud προς το κατάστημα.
- Λογαριασμός Dahua μόνο για ανάγνωση/playback· χωρίς δικαιώματα ρύθμισης ή διαχείρισης.
- Καμία αλλαγή στις υπάρχουσες ροές POS, πληρωμών, invoice OCR, stock, drafts, fiscal, accounting ή myDATA.
- Δεν επαναδημιουργήθηκαν οι υπάρχοντες πίνακες, mappings, events, clip windows, permissions ή retention.
- Δεν ενεργοποιήθηκε καταγραφή ήχου και δεν ανεβαίνει συνεχές video στο cloud.

## Αυτοματοποιημένη επαλήθευση

- Υπάρχοντα video tests: `43/43` PASS.
- Νέα Dahua/connector tests: `11/11` PASS.
- Σύνολο video tests: `54/54` PASS.
- Πλήρες server suite: `1331/1331` PASS.
- Client build: PASS.
- Server build: PASS.
- `git diff --check`: PASS.

Το automated/CI PASS δεν ισοδυναμεί με LAB PASS.

## Υποχρεωτικό LAB acceptance

1. Τοποθέτηση SATA data και ειδικού Dahua 4-pin-to-SATA power στον δοκιμαστικό δίσκο, με το NVR εκτός ρεύματος κατά τη σύνδεση.
2. NVR, κάμερα και POS στο ίδιο router/switch, με ξεχωριστά σωστά τροφοδοτικά 12V.
3. Δημιουργία Dahua χρήστη μόνο ανάγνωσης/playback και ενεργοποίηση ONVIF όπου απαιτείται.
4. Pairing του Windows connector με το σωστό store και terminal, χωρίς άνοιγμα θυρών στο router.
5. Επιβεβαίωση πραγματικού `online`, model/serial, heartbeat και αυτόματης επανασύνδεσης μετά από προσωρινή διακοπή.
6. Επιβεβαίωση NVR/POS/backend ώρας και ζώνης `Europe/Athens`, με αποδεκτή απόκλιση.
7. Επιβεβαίωση ασφαλούς snapshot και live preview χωρίς έκθεση credentials ή RTSP URL.
8. Δημιουργία ελεγχόμενου Video Audit event και επιβεβαίωση πραγματικού clip `30″ πριν / 60″ μετά` από το σωστό κανάλι/ταμείο.
9. Επιβεβαίωση ότι το συνεχόμενο video παραμένει μόνο στο NVR και ότι δεν επηρεάστηκε καμία λειτουργία POS/πληρωμών/invoice/stock/drafts.

Μόνο μετά την επιτυχία όλων των παραπάνω ενημερώνεται το KAT-10 σε `ΟΚ / LAB PASS`.
