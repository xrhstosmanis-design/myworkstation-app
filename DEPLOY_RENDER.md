# Εγκατάσταση στο Render

Η v0.4 δεν χρειάζεται τοπικό PostgreSQL ή χειροκίνητες εντολές.

1. Ανέβασε όλα τα αρχεία στο GitHub repository `myworkstation-app`.
2. Στο Render πάτησε **New + → Blueprint**.
3. Σύνδεσε το repository.
4. Το Render θα βρει το `render.yaml`.
5. Πάτησε **Apply**.

Θα δημιουργηθούν αυτόματα:
- Web Service
- PostgreSQL database
- DATABASE_URL
- JWT_SECRET
- αρχικός λογαριασμός διαχειριστή
- πίνακες και αρχικά δεδομένα

Σύνδεση:
- Email: `admin@myworkstationapp.gr`
- Κωδικός: Render → Web Service → Environment → `INITIAL_ADMIN_PASSWORD`

Για domain:
Render → Settings → Custom Domains → πρόσθεσε `myworkstationapp.gr`.
