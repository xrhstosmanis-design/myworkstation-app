# MyWorkStation — Deploy στο Render

## Αυτόματη δημιουργία

Το `render.yaml` δημιουργεί:

- Web Service `myworkstation-app`,
- PostgreSQL `myworkstation-db`,
- `DATABASE_URL`,
- ασφαλές `JWT_SECRET`,
- αρχικό Platform Super Admin,
- τον πιλοτικό πελάτη Κυλικείο ΚΑΤ,
- την ιδιοκτήτρια πελάτη Νίκη Ραζάτου.

## Platform Super Admin

Διαδρομή:

```text
https://myworkstation-app.onrender.com/platform-admin
```

Email:

```text
admin@myworkstationapp.gr
```

Ο κωδικός βρίσκεται στο Render Web Service → Environment → `INITIAL_ADMIN_PASSWORD`.

## Ιδιοκτήτρια ΚΑΤ

Ο λογαριασμός δημιουργείται ως `OWNER` με:

```text
Νίκη Ραζάτου
nikirazatou@hotmail.gr
```

Για λόγους ασφαλείας δεν δημιουργείται γνωστός κωδικός μέσα στον κώδικα. Μετά το deployment:

1. Άνοιξε το Platform Admin.
2. Βρες το `Κυλικείο ΚΑΤ`.
3. Πάτησε `Νέος κωδικός`.
4. Όρισε προσωρινό κωδικό τουλάχιστον 8 χαρακτήρων.
5. Δώσε τον κωδικό ιδιωτικά στην ιδιοκτήτρια.

## Έλεγχος deployment

1. Περίμενε επιτυχημένο deployment στο Render.
2. Έλεγξε:

```text
https://myworkstation-app.onrender.com/api/health
```

3. Η έκδοση πρέπει να εμφανίζει:

```text
0.11.1+customer-owners
```

4. Κάνε αποσύνδεση από παλιές συνεδρίες πριν δοκιμάσεις το Platform Admin.

## Σημαντικό

Ο Platform Super Admin διαχειρίζεται όλους τους πελάτες. Κάθε πελάτης έχει ξεχωριστό λογαριασμό `OWNER` και βλέπει μόνο τη δική του εταιρεία και τα καταστήματά της.
