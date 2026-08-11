# PRE-KAT STEP 1A — Role / Tenant Isolation

Ημερομηνία: 11/08/2026

Κατάσταση: **ΟΛΟΚΛΗΡΩΜΕΝΟ / LIVE**

- PR #133: `Pre-KAT role and tenant isolation hardening`
- Merge commit: `02bc7883f8dfb2d6c62ebeed0a6dfa5ede9b2dd8`
- CI #183: SUCCESS (security/regression + production build)
- Render: SUCCESS

## Τι κλειδώθηκε

- `requireStoreModule()` κάνει tenant enforcement όταν υπάρχει authenticated user.
- `SUPER_ADMIN` παραμένει η μόνη controlled cross-tenant εξαίρεση.
- OWNER / ADMIN / MANAGER / EMPLOYEE δεν μπορούν να στοχεύσουν store άλλης εταιρείας.
- STORE_OPERATOR επιτρέπεται μόνο στο ακριβές `companyId + storeId` του token.
- Public Store Mode login/directory παραμένει διαθέσιμο πριν το auth, ώστε να μη σπάσει η είσοδος PIN/κάρτας.
- Νέο executable regression: `server/test/pre-kat-role-tenant-isolation-v1.test.js`.
- Το regression καλύπτει επίσης Store POS scoping, Operator Management scoping και cross-company commerce references.

## Επόμενο

PRE-KAT STEP 1B — structural regression: MyWorkStation colors, κάτω actions, global touch keyboard, anti-freeze/pagination/lazy loading και observer safety.
