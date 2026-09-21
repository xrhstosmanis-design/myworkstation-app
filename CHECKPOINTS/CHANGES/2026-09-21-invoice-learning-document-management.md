# Invoice Learning document management and AFM lookup — 2026-09-21

## Scope

- Add a user-controlled delete action to the learned-invoice history.
- Add official supplier-name lookup by AFM at the top of Invoice Learning.

## Safety

- Deletion requires confirmation and removes only the selected learned document.
- Supplier identity profiles, commercial format-family rules and other learned invoices remain untouched.
- AFM lookup uses the existing company-scoped VAT lookup path and fills legal name + AFM; it does not change invoice lines or economic values.

## Verification

- Client JavaScript syntax check: PASS.
- Server JavaScript syntax check: PASS.
- Client production build: PASS.
- `git diff --check`: PASS.

## Follow-up

- After green CI, merge/deploy and user LAB verification of deleting the duplicate MANTZAVAS 38001 document and resolving a supplier name from AFM.
