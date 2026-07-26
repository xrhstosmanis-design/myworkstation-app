
# MyWorkStation App v0.2

Νέος επαγγελματικός πυρήνας της εφαρμογής.

## Έτοιμες λειτουργίες
- React + Vite frontend
- Node.js + Express API
- PostgreSQL + Prisma
- Login με JWT
- Ρόλοι χρηστών στη βάση
- Πολλαπλές επιχειρήσεις και καταστήματα
- Dashboard
- Προβολή και προσθήκη μόνιμου/έκτακτου προσωπικού
- Δυνατότητα 6ης ημέρας ανά εργαζόμενο
- Seed με το Κυλικείο ΚΑΤ, τις βάρδιες και τους 11 εργαζομένους
- Responsive περιβάλλον
- Render Blueprint

## Τοπική εγκατάσταση
1. Αντέγραψε `.env.example` σε `.env`.
2. Βάλε σωστό PostgreSQL `DATABASE_URL`.
3. Εκτέλεσε:
   - `npm install`
   - `npm run prisma:generate -w server`
   - `npm run prisma:dev -w server`
   - `npm run seed`
   - `npm run dev`

Frontend: http://localhost:5173  
Backend: http://localhost:8080

## Πρώτη σύνδεση
Τα στοιχεία προέρχονται από:
- `INITIAL_ADMIN_EMAIL`
- `INITIAL_ADMIN_PASSWORD`

Οι προεπιλογές ανάπτυξης είναι:
- admin@myworkstationapp.gr
- ChangeMe123!

Αλλάξτε τον κωδικό και το JWT_SECRET πριν από πραγματική χρήση.

## Render
Το `render.yaml` δημιουργεί:
- Node Web Service
- PostgreSQL database
- αυτόματο build του React frontend

Μετά το πρώτο deploy, εκτέλεσε το seed από Render Shell:
`npm run seed`

## Επόμενη έκδοση v0.3
- Επεξεργασία καρτέλας εργαζομένου
- Γραφικό περιβάλλον κανόνων
- Διαθεσιμότητα και άδειες
- Νέα μηχανή δημιουργίας βαρδιών
