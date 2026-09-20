# Invoice Learning — bounded OpenAI fallback μετά από Azure partial

## Πραγματική κατάσταση πριν την αλλαγή

- **Azure σύνδεση: LAB PASS.** Το Azure επιστρέφει πραγματικές γραμμές και `NO_SAFE_RESULT`, όχι πλέον `ACCESS_403`.
- **Πλήρης ανάγνωση: LAB FAIL.** Η συμπληρωματική ροή κατέληξε σε απλό `AI σφάλμα 502`.
- **Ασφάλεια: LAB PASS.** Δεν δημιουργήθηκε μερικό draft και δεν έγινε stock, approval/finalization, fiscal, accounting ή myDATA μεταβολή.

## Αιτία και περιορισμένη αλλαγή

Το Invoice Learning μπορούσε να κάνει δύο διαδοχικές κλήσεις εικόνας στο `gpt-5` χωρίς χρονικό όριο. Το Render μπορούσε έτσι να κλείσει την HTTP αίτηση με απλό gateway 502 πριν ο server επιστρέψει ασφαλές JSON.

- Το fallback χρησιμοποιεί `OPENAI_INVOICE_FAST_MODEL`, έπειτα `OPENAI_INVOICE_MODEL`, και ως ασφαλές default `gpt-5-mini`.
- Κάθε κλήση έχει bounded timeout 30s (ρυθμιζόμενο, με όρια 5–45s) και `reasoning: minimal`.
- Timeout επιστρέφει σαφές JSON 504 και δεν εκθέτει ούτε αποθηκεύει το μερικό Azure αποτέλεσμα.
- Διατηρούνται η μία μόνο ασφαλής επανάληψη, το strict schema, το hybrid merge και ο τελικός οικονομικός έλεγχος.

## Προστατευμένα invariants

- Καμία αλλαγή σε Azure credentials/networking ή Azure parsing.
- Κανένα κενό/μερικό draft.
- Καμία αλλαγή σε POS, BackOffice, πληρωμές, stock, fiscal, accounting ή myDATA.

## Έλεγχοι

- `15/15` στοχευμένοι έλεγχοι PASS.
- `1361/1361` πλήρες server suite PASS.
- Frontend production-safe build PASS.

## Κατάσταση και LAB αποδοχή

**AWAITING CI / DEPLOY / LAB — δεν χαρακτηρίζεται fixed.**

PASS μόνο αν το ίδιο πρωτότυπο ολοκληρώσει την ανάγνωση με όλες τις πραγματικές γραμμές και συμφωνήσει ακριβώς σε `47,48 €` καθαρή αξία, `6,43 €` ΦΠΑ και `53,91 €` τελικό σύνολο. Σε αδυναμία ανάγνωσης πρέπει να εμφανιστεί συγκεκριμένο ασφαλές μήνυμα και να μη δημιουργηθεί μερικό draft.
