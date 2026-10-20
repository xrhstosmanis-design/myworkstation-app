# Isolated wholesale lab evidence — 19 October 2026

Source e3432c2b3f6c8a890bbe52b61a0270ee06bc9899, public lab https://myworkstation-wholesale-lab.onrender.com/lab . Synthetic data only; no fiscal validity.

- `live-ui-before-after.json`: actual hosted Chrome DOM before/after, Owner quote/order/virtual combined document/payment and exact payment replay. Boot0c680151-20df-4d1f-8b52-0f19fe49cebf;20:08–20:10UTC.
- `live-api-acceptance.json`: independent hosted HTTPS software API verification20:17–20:20UTC, same revision/boot; seller/customer orders and explicit same-key replay, restrictions, final/control balances and API PDF read. Saved `LIVE-API-*-before.json` were written before each business request. No browser credentials/tokens/cookies retained. API results are NOT hosted UI acceptance.
- `live-TEST-invoice-delivery.pdf`: existing hosted virtual document read via authenticated API, not browser download; pdftotext/render inspected. No new document was issued to obtain it.
- `ci-main-browser.json` / `ci-pr-browser.json`: actual Chromium plus isolated PostgreSQL checks in CI, not hosted LIVE acceptance. Main CI39314881160/artifact12217204110 and PR CI39313589730/artifact12217137942.
- `automated-browser-preview.png`: screenshot from exact-main CI39314881160, not a hosted LIVE screenshot.

Hosted seller/customer UI and browser PDF download remain NOT TESTED after native browser credential protection reset/refusal. No alternate-browser/session workaround. Retained owner codex/wholesale-suite-20261017; next action is only that UI tail after supported browser recovery. Do not repeat Owner invoice/payment merely to reproduce evidence. Detailed action log CHECKPOINTS/CHANGES/2026-10-19-wholesale-isolated-lab.md.
