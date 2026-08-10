# MyWorkStation checkpoint — Management Parameters

Date: 2026-08-11

## Live baseline
- PR: #132 — Full management parameters from Kiosk screenshots
- Merge commit: `0c31f5f801b7340f4ab3791e974bebb97fe10ed7`
- CI: #182 — tests + production build SUCCESS
- Render deployment: `5841112019` — SUCCESS

## Implemented entry point
- Bottom-right gear in MyWorkStation BackOffice opens `Παράμετροι`.
- Visible only to SUPER_ADMIN / OWNER / ADMIN / MANAGER.
- Store operators are rejected by backend.
- No new MutationObserver was introduced by the parameters module.

## Implemented tabs
Primary tabs:
1. Αρχείο επιχείρησης
2. Τράπεζες
3. e-Delivery

Secondary tabs:
1. PoS
2. BackOffice
3. Βάρδιες
4. Πελάτες
5. eMail
6. Λοιπά
7. Αγορές & παραγγελίες

## Data model
- `ManagementParameters`: one company-scoped JSONB settings record.
- `ManagementParameterAudit`: audit record per saved section.
- Basic business fields read/write the real `Company` record where a canonical field already exists.
- No Kiosk screenshot values are seeded as fake data.

## Secret handling
The following values are NOT stored in the JSON settings object:
- Wolt password
- efood password
- AADE password
- manager PIN

They are stored separately encrypted with AES-256-GCM using `PARAMETERS_ENCRYPTION_KEY` when present, otherwise a SHA-256 derived key from the server `JWT_SECRET`.
GET never returns secret values; it returns only `...Configured` booleans.

## Integration truthfulness
The settings UI can store configuration fields, but the integration state remains explicitly:
- AADE: `NOT_CONNECTED`
- e-Delivery: `NOT_CONNECTED`
- EFT/POS: `NOT_CONNECTED`

Do not claim that filling credentials activates a provider/connector. A real connector/provider implementation is required before external calls or fiscal behaviour are enabled.

## Important runtime distinction
This PR implements the real settings storage/editing UI and security layer. The individual flags are not automatically assumed to alter every legacy POS/BackOffice behaviour unless the corresponding runtime feature is explicitly wired to consume that setting. Future work should connect settings to runtime behaviour feature-by-feature, with regression coverage.

## UI
- MyWorkStation navy/teal palette.
- Full-screen parameters dialog.
- Bottom actions: Κλείσιμο / Καταχώρηση.
- Global touch keyboard continues to apply to text/number fields through the existing global installer.
