## 01/11/2026 — Πίστωση AI επί πιστώσει και εξόφληση: περιορισμένο LAB PASS

Χρήση από πραγματικό Platform Super Admin: https://myworkstation-app.onrender.com/platform-admin → «Υπόλοιπα AI πελατών» → ρητή επιλογή εταιρείας → «Πίστωση AI επί πιστώσει». Το υπόλοιπο και η οφειλή είναι εταιρικά· το επιλεγμένο κατάστημα καθορίζει τους παραλήπτες ενημέρωσης.

1. Επίλεξε κατάστημα, ποσό, μοναδική αναφορά και αιτιολογία. Διάβασε την τρέχουσα λίστα εγκεκριμένων παραληπτών. Η επιλογή δεν στέλνει πρόσκληση ούτε ενεργοποιεί αναφορές.
2. Για ενημέρωση πίστωσης/οφειλής κράτησε τη σχετική επιλογή email και έλεγξε τη λίστα πριν την υποβολή. Κενή ή αλλαγμένη λίστα αποκλείει αποστολή. Το email αναφέρει πίστωση και ανεξόφλητο ποσό· η πραγματική παράδοση/inbox δεν πιστοποιήθηκε στο LAB.
3. Επιβεβαίωσε την πίστωση με υποχρέωση εξόφλησης και υπέβαλε μία φορά. Το ποσό αυξάνει διαθέσιμο και οφειλή ισόποσα. Η πράξη δεν ενεργοποιεί χρέωση ούτε αλλάζει τιμές. Η κατανάλωση μειώνει μόνο το διαθέσιμο, όχι την οφειλή.
4. Όταν πράγματι εισπραχθεί ποσό, επίλεξε την ανεξόφλητη πίστωση, συμπλήρωσε ποσό/μοναδική αναφορά είσπραξης και επιβεβαίωσε. Μερική ή τελική εξόφληση μειώνει μόνο οφειλή. Δεν προσθέτει δεύτερη φορά υπόλοιπο. Μη δηλώνεις πραγματική είσπραξη πριν πραγματοποιηθεί.
5. Άνοιξε «Πιστώσεις επί πιστώσει και εξοφλήσεις» και διάβασε ανεξόφλητη/μερική/εξοφλημένη κατάσταση. Κλείσε και ξανάνοιξε την ίδια εταιρεία για επιβεβαίωση αποθήκευσης. Σε παλιά έκδοση/αλλαγμένους παραλήπτες ανανέωσε και έλεγξε το ήδη υπάρχον ιστορικό πριν νέα υποβολή· μη χρησιμοποιείς νέα αναφορά για τυφλή επανάληψη.

Ελέγχθηκε μόνο στο εικονικό MYWORKSTATION LAB, χωρίς email ή πληρωμένη κλήση AI: μία πίστωση0,02EUR και δύο συνθετικές εξοφλήσεις0,01EUR. Διαθέσιμο3,663091→3,683091EUR μόνο στην πίστωση και σταθερό στις εξοφλήσεις· οφειλή0→0,02→0,01→0· ιστορικό10→13/πιστώσεις5→5,02EUR. Επανένοιγμα: εξοφλημένη0,02/πληρωμένη0,02/οφειλή0. Παλιά δέσμευση0,930033EUR, χρήση0,406876EUR/8κλήσεις, παλιά ειδοποίησηOFF και όλοι οι διακόπτεςOFF/πρόσθετες τιμές0 διατηρήθηκαν. Το νέο0,02EUR παραμένει εικονικό διαθέσιμο LAB. Δεν μεταφέρεται σε πελάτη.

Αρχικά source85d8cec43/fullCI41298260854/guard41299372757· στην τελική πράξη και επανάνοιγμα serverad111f6f/fullCI41307061118/guard41308575722 μετά από παύση χρήστη. Και οι10δικοί μας runtime φάκελοι/αρχεία είναι byte-identical μεταξύ των δύο revisions· ο ακριβής server ελέγχθηκε μετά την τελική υποβολή. Τεκμήριο με ακριβείς χρόνους/πριν-μετά: CHECKPOINTS/CHANGES/2026-11-01-ai-wallet-postpaid.md και CHECKPOINTS/EVIDENCE/ai-wallet-postpaid-20261101/lab-acceptance.json.

Όρια: πραγματική πίστωση/ενεργοποίηση Ριζαρείου εκκρεμεί έως τον ορισμό ποσού. Η προβολή των2υπαρχόντων εγκεκριμένων παραληπτών ελέγχθηκε μόνο αναγνωστικά. Πραγματικό SMTP/inbox, ανεξάρτητη hosted συνεδρία Owner/mobile και συνολικό wallet/μη μετρημένες AI είσοδοι παραμένουν OPEN. Ασφάλεια ρόλου/εταιρείας/session/γενιάς, διπλοϋποβολής, ανάκλησης, υπερπληρωμής και SMTP UNKNOWN καλύφθηκε ξεχωριστά από πραγματικά isolated PostgreSQL/HTTP CI, όχι ως hosted αποστολή.

## 01/11/2026 — Αναλυτικές κινήσεις AI: περιορισμένο LAB PASS

Ελέγχθηκε με πραγματική συνεδρία Platform Super Admin στην εγκατεστημένη946fa417b858fbece65c9ded6cb8db506bca91b0. Η προβολή κρατά την επιλεγμένη εταιρεία και τα υπάρχοντα δικαιώματα. Η συνεδρία πραγματικού Owner, χειριστή POS ή εξουσιοδοτημένου υπαλλήλου δεν αποτελεί νέο hosted PASS αυτού του ελέγχου.

1. Άνοιξε https://myworkstation-app.onrender.com/platform-admin → «Υπόλοιπα AI πελατών» → επίλεξε ρητά την εταιρεία → «Αναλυτικές κινήσεις AI». Δεν χρειάζεται ενεργοποίηση χρέωσης για να διαβάσεις το ιστορικό.
2. Φίλτραρε «Λειτουργία AI», «Χρήστης / χειριστής», «Κατάστημα κίνησης», «Κατάσταση κίνησης» και «Προέλευση χρήσης». Τα φίλτρα συνδυάζονται· «Καθαρισμός φίλτρων» επαναφέρει τη λίστα. Αφορούν μόνο τις τελευταίες έως100κινήσεις που αναγράφει η οθόνη, όχι όλο το ιστορικό ή φορολογικό τιμολόγιο.
3. Διάβασε χωριστά «Οριστικές χρεώσεις», «Εκκρεμείς δεσμεύσεις» και «Πιστώσεις». Το «Υπό έλεγχο» είναι δέσμευση και δεν προστίθεται στις οριστικές χρεώσεις. Τα σύνολα ανά λειτουργία αφορούν την ίδια φιλτραρισμένη λίστα.
4. Στη νέα κίνηση εμφανίζονται λειτουργία, αρχικός αιτών, πραγματικός ρόλος συνεδρίας, προέλευση/οθόνη, κατάστημα/ώρα Ελλάδας, υπηρεσία/μοντέλο και η ήδη ισχύουσα ανάλυση χρήσης/προσαύξησης/κλήσης/τιμολογίου. Άνοιξε «Στοιχεία κίνησης» για το γνωστό παραστατικό και τα στοιχεία μέτρησης. Ο SuperAdmin σε πρόσβαση υποστήριξης εμφανίζεται ως SuperAdmin, ακόμη και όταν διαχειρίζεται Backoffice εταιρείας.
5. Παλιές κινήσεις χωρίς αρχικό χρήστη ή ειδικό σκοπό γράφουν «Δεν έχει καταγραφεί». Δεν αποδίδονται στον ιδιοκτήτη ή στον τελευταίο ελεγκτή από εκτίμηση. Ο καταχωριστής πίστωσης/χειροκίνητος ελεγκτής αναφέρεται χωριστά, όπου υπάρχει.

Στο νέο συνθετικό E η μία αυτόματη κλήση βοηθού εμφανίστηκε ως «Βοηθός τιμολογίου», πραγματικός αιτών SuperAdmin/υποστήριξη, σωστό αποθηκευμένο παραστατικό και τελική χρέωση0,082863EUR. Φίλτρα λειτουργίας+προέλευσης+καταστήματος+οριστικήςχρέωσης έδειξαν ακριβώς1κίνηση/0,082863EUR/0δέσμευση/0πίστωση. Η υπάρχουσα παλιά δέσμευση0,930033EUR έμεινε χωριστή. Οι δοκιμαστικοί διακόπτες αποκαταστάθηκαν OFF, χωρίς αλλαγή τιμών. Δεν έγινε πληρωμή, έγκριση, αποθήκευση είδους ή κίνηση stock.

Αν μια κίνηση λείπει, έλεγξε εταιρεία, κατάστημα και φίλτρα, μετά ανανέωσε την ίδια προβολή. Μην ανοίγεις ξανά τον βοηθό για να δημιουργήσεις απόδειξη: το άνοιγμα ξεκινά νέο αίτημα. Για «Υπό έλεγχο» κράτησε την αρχική αναφορά και ζήτησε συμφωνία του αρχικού usage, χωρίς τυφλό retry/refund. Η αλλαγή φίλτρων δεν χρεώνεται. Αρχική pre-draft ai-recheck ανάγνωση εικόνας παραμένει χωριστή μη μετρημένη εκκρεμότητα· δεν τεκμηριώνεται κάλυψη κάθε AI εισόδου. Ακρίβεια OCR, άλλα hosted roles/συσκευές/ροές και email δεν πιστοποιούνται από αυτό το PASS.

Τεκμήρια: CHECKPOINTS/CHANGES/2026-10-31-ai-wallet-activity-details.md και CHECKPOINTS/EVIDENCE/ai-owner-wallet-20261022/activity-e-acceptance-20261031.json. Προηγούμενα ανεξάρτητα PASS διατηρούνται. Η ευρύτερη εργασία wallet παραμένει OPEN.

## 31/10/2026 — Τρεις συνδυαστικές τιμές ανά εταιρεία: περιορισμένο LAB PASS

Διαθέσιμο στον Platform Super Admin από https://myworkstation-app.onrender.com/platform-admin → «Υπόλοιπα AI πελατών» → επιλογή της σωστής εταιρείας → «Τιμές AI για αυτή την εταιρεία». Οι τιμές ισχύουν για όλα τα καταστήματα της επιλεγμένης εταιρείας.

1. Συμπλήρωσε «Πρόσθετη προσαύξηση (%)», «Σταθερό ποσό ανά κλήση AI (€)» και «Σταθερό ποσό ανά τιμολόγιο στον βοηθό (€)». Δέχονται ελληνικό κόμμα. Το0 μηδενίζει την αντίστοιχη πρόσθετη χρέωση. Το ποσοστό είναι ΕΠΙΠΛΕΟΝ της σημερινής τιμής χρήσης που ήδη περιλαμβάνει τη συμφωνημένη προσαύξηση50%.
2. Έλεγξε το εμφανιζόμενο υποθετικό παράδειγμα, επιβεβαίωσε τις πρόσθετες χρεώσεις και πάτησε μία φορά «Αποθήκευση τιμών AI». Η αποθήκευση αφορά επόμενες κλήσεις, αφήνει τις υπάρχουσες δεσμεύσεις με την αρχική τιμή και δεν ενεργοποιεί τη χρέωση ή πιστώνει χρήματα.
3. Για πραγματική ενεργοποίηση χρειάζονται οι συμφωνημένες τιμές του συγκεκριμένου πελάτη και διαθέσιμο υπόλοιπο από επιβεβαιωμένη είσπραξη, ρητά εγκεκριμένη δοκιμαστική παροχή ή εγκεκριμένη πίστωση επί πιστώσει σύμφωνα με τη νεότερη ενότητα01/11/2026. Χρησιμοποίησε τη σωστή ξεχωριστή φόρμα και μοναδική πραγματική αναφορά. Δεν αντιγράφουμε υπόλοιπα άλλου πελάτη ή LAB.
4. Ενεργοποίησε ρητά «Χρέωση AI στον πελάτη» και, για τον βοηθό τιμολογίων, «Χρέωση AI τιμολογίων», μετά «Αποθήκευση ρυθμίσεων». Τα email έχουν χωριστή ρύθμιση/παραλήπτη και χωριστό έλεγχο παράδοσης.
5. Στις «Αναλυτικές κινήσεις AI» οι νέες τιμολογημένες κλήσεις δείχνουν χωριστά χρήση, πρόσθετη προσαύξηση, ποσό κλήσης και ποσό τιμολογίου. Το ποσό τιμολογίου εφαρμόζεται μόνο στην πρώτη κλήση του βοηθού στο αποθηκευμένο, εξουσιοδοτημένο πρόχειρο. Όλες οι σελίδες και επόμενες ερωτήσεις του ίδιου παραστατικού κρατούν την ίδια ταυτότητα και δεν το επαναχρεώνουν.

Πραγματική δοκιμή στο LAB MAIN / LAB POS2, νέο PRICE-LAB-20261031-D, qty1,12EUR,VAT0, μία αρχική κλήση και μία διαφορετική ερώτηση στο ίδιο ανοιχτό βοηθό, χωρίς εφαρμογή/έγκριση. Πρόσθετες δοκιμαστικές τιμές25% +0,001EUR/κλήση +0,01EUR/τιμολόγιο:

| Κλήση | Τιμή χρήσης | Πρόσθετο25% | Κλήση | Τιμολόγιο | Σύνολο |
| --- | --- | --- | --- | --- | --- |
| Πρώτη |0,079446EUR|0,019862EUR|0,001EUR|0,01EUR|0,110308EUR|
| Διαφορετική ερώτηση στο ίδιο παραστατικό |0,076611EUR|0,019153EUR|0,001EUR|0EUR|0,096764EUR|

Τα πρωτότυπα usage/provider responses, οι αρχικές δεσμευμένες τιμές και οι ακριβείς ακέραιοι υπολογισμοί συμφώνησαν με τις δύο αφαιρέσεις. Η σταθερή χρέωση τιμολογίου εμφανίστηκε μία φορά. Μετά τη δοκιμή επαληθεύτηκε native επαναφορά όλων των διακοπτών OFF και τριών πρόσθετων τιμών0, χωρίς μεταβολή παλιού REVIEW/παλιών κινήσεων/άλλων εταιρειών, προϊόντων, stock, πωλήσεων, πληρωμών ή βάρδιας. Παρέμεινε μόνο ένα νέο μη εγκεκριμένο CREDIT πρόχειρο με το πρωτότυπό του.

Όρια: το πάγιο τιμολογίου αφορά FIRST_ASSISTANT_DOCUMENT. Η αρχική ai-recheck ανάγνωση εικόνας πριν από το αποθηκευμένο πρόχειρο παραμένει μη μετρημένη/OPEN, χωρίς νέο ισχυρισμό χρέωσης όλων των εισόδων. Η τοπική ανάγνωση δεν είναι πληρωμένη AI κλήση. Η δοκιμή δεν αποτελεί OCR accuracy PASS: ο τυπωμένος SYN-D1 διαβάστηκε SYN-01 και δεν εγκρίθηκε. Δεν εκτελέστηκε πραγματική ενεργοποίηση/πίστωση πελάτη ούτε αποδοχή email/Owner.

Αν η αποθήκευση απορριφθεί λόγω παλιάς έκδοσης, ανανέωσε την εταιρεία και έλεγξε ξανά τα ποσά πριν μία νέα υποβολή. Αν αλλάξεις εταιρεία, οι καθυστερημένες απαντήσεις της προηγούμενης απορρίπτονται. Μήνυμα «Υπό έλεγχο» κρατά τη δέσμευση ώσπου να υπάρξει αυθεντικό τεκμήριο· δεν σημαίνει αυτόματο refund ή επιτρεπόμενο retry. Ελλιπές υπόλοιπο μπορεί να εμποδίσει κλήση ακόμη και αν είναι θετικό, επειδή απαιτείται η μέγιστη ασφαλής δέσμευση.

Αποδοχή στην ακριβή εγκατεστημένη accf3ddd839c1255139dfd181b5ccb4f770555ff μετά πλήρη native/main CI και κανονικό guarded deployment. Το checkpoint περιέχει ακριβείς χρόνους, πριν/μετά, όρια, προστατευμένα IDs και ανεξάρτητες αποδείξεις. Η ευρύτερη εργασία wallet παραμένει OPEN στον ίδιο owner.


## 31/10/2026 — Βοηθός τιμολογίου Sol: περιορισμένο LAB PASS χρέωσης

Ελέγχθηκε στην εγκατεστημένη έκδοση42ae4a3db371943fb0109aa815fac8a1b6bd9f33, μετά από πλήρες CI και την κανονική ασφαλή εγκατάσταση. Η ελεγμένη συνεδρία ήταν υπάρχων Platform SuperAdmin στο MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ. Τα υπάρχοντα δικαιώματα, οι άδειες και η απομόνωση εταιρείας/καταστήματος εξακολουθούν να ισχύουν. Η πραγματική συνεδρία Owner ελέγχεται χωριστά.

1. Στο https://myworkstation-app.onrender.com/platform-admin ανοίγουμε «Υπόλοιπα AI πελατών» και επιλέγουμε ρητά την εταιρεία. Ελέγχουμε ετοιμότητα, διαθέσιμο υπόλοιπο και παλιές δεσμεύσεις. Για χρέωση τιμολογίων απαιτούνται και «Χρέωση AI στον πελάτη» και «Χρέωση AI τιμολογίων», με μία αποθήκευση. Η ρύθμιση αφορά όλα τα καταστήματα της ίδιας εταιρείας.
2. Από το συγκεκριμένο κατάστημα ανοίγουμε «Πλήρες Backoffice» → «Εμπορική λειτουργία» → «Λοιπές εμπορικές λειτουργίες» → «▤ Παραγγελίες & Αγορές ›». Στα κριτήρια επιλέγουμε ρητά το σωστό κατάστημα. Το ελεγμένο C ήταν νέο, συνθετικό, ανεξάρτητο παραστατικό με τις αρχικές φωτογραφίες και ένα μη εγκεκριμένο πρόχειρο CREDIT. Δεν επαναλαμβάνουμε παλιό ήδη υποβλημένο παραστατικό για τεκμηρίωση.
3. Ανοίγουμε το συγκεκριμένο πρόχειρο και «✦ Βοηθός τιμολογίου». **Το άνοιγμα ξεκινά αυτόματα τον πρώτο έλεγχο φωτογραφιών.** Περιμένουμε να ολοκληρωθεί. Νέο πάτημα «Έλεγχος φωτογραφιών» είναι νέο αίτημα· δεν το χρησιμοποιούμε για να αντιμετωπίσουμε αβέβαιο αποτέλεσμα.
4. Ελέγχουμε την απάντηση και τις προτάσεις απέναντι στο πρωτότυπο. Στο μετρημένο C ο βοηθός επέστρεψε τη μία φυσική γραμμή SYN-C1/ποσότητα1/τιμή14EUR/ΦΠΑ0 και συμφωνία συνόλων14EUR. Η αντιστοίχιση προϊόντος παρέμεινε εκκρεμής· ο έλεγχος ταυτότητας προϊόντος και η έγκριση είναι ξεχωριστή ενέργεια χειριστή.
5. Στο υπόλοιπο AI εμφανίστηκε μία «Χρήση0,080973€». Ανεξάρτητος έλεγχος επιβεβαίωσε μία SETTLED κίνηση,9397input/9394cache-write/672output tokens, ακριβή υπολογισμό με τον αρχικό τιμοκατάλογο και πλήρη αποδέσμευση της συγκεκριμένης νέας κλήσης. Τα14EUR είναι η αξία του εικονικού παραστατικού· τα0,080973EUR είναι η κατανάλωση AI. Άλλες ήδη ανοικτές δεσμεύσεις μπορούν να παραμένουν στο συνολικό «Δεσμευμένο».
6. Στο LAB επαναφέραμε και τους δύο διακόπτες OFF μετά τη δοκιμή. Η αποθήκευση διατήρησε το τελικό υπόλοιπο και το ιστορικό. Σε πραγματική εταιρεία ακολουθούμε τη συμφωνημένη ρύθμιση χρέωσης.

Αν εμφανιστεί «η κατανάλωση χρειάζεται έλεγχο» ή «Υπό έλεγχο», κρατάμε την ίδια αναφορά και ζητάμε έλεγχο της αρχικής κλήσης. Μπορεί να έχει ήδη γίνει κλήση στον πάροχο. Δεν επαναλαμβάνουμε τυφλά το αίτημα και δεν θεωρούμε μία παλιά δέσμευση νέα τελική χρέωση. Οι ιστορικές κινήσεις χρειάζονται την αρχική δεσμευμένη απόδειξη για συμφωνία.

Όρια του PASS: μία πραγματική νέα κλήση gpt-5.6-sol, κανονικό context και ομοιόμορφη διάρκεια cache30m. Οι δοκιμές12h/μικτών πολιτικών/long-context πέρασαν αυτόματα, χωρίς νέο hosted PASS. Η αρχική ανάγνωση εικόνας σε αυτή τη διαφορετική φόρμα δεν δημιούργησε κίνηση πορτοφολιού και παραμένει χωριστή εκκρεμότητα μέτρησης. Η ακρίβεια OCR σε πραγματικούς προμηθευτές, η δημιουργία/αντιστοίχιση είδους, η έγκριση/απόθεμα/φορολογική καταχώριση, οι τιμές ανά πελάτη και η παράδοση email δεν πιστοποιούνται από αυτόν τον έλεγχο.

Τεκμήρια: CHECKPOINTS/CHANGES/2026-10-31-ai-wallet-sol-review.md και CHECKPOINTS/EVIDENCE/ai-owner-wallet-20261022/sol-uniform-cache-lab-20261031.json. Τα προηγούμενα ανεξάρτητα PASS παρακάτω διατηρούνται.

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
