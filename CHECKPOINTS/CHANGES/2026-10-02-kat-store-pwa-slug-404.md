# KAT Store Mode legacy slug route 404 — 2026-10-02

## User-visible result

On the KAT store PC, the Super Admin generated the one-time activation link for the already existing terminal `KAT-POS-02` (Ταμείο 2 — Delivery / Online). Opening the link navigated to `/store/kat-store` and returned `Not Found`. The screen title confirmed the generated target was KAT POS Delivery. Do not recreate the terminal or retry the activation until the route fix is deployed and verified.

## Root cause

`server/src/routes/platform-admin.js` constructs the activation path from the terminal's actual `storeId`, which is `kat-store`. `server/src/index.js` validates the path via `validPwaStoreId` before serving the Store Mode app. The validator in `server/src/store-pwa.js` only accepted 12–64 lowercase alphanumeric IDs, so this existing hyphenated store ID was rejected before the activation flow could execute.

## Change in PR #1633

- Preserve support for existing opaque IDs.
- Accept safe lowercase slug-shaped store IDs, including `kat-store`.
- Continue rejecting path traversal and malformed/case-variant IDs.
- Add focused tests for legacy slug route/manifest URLs and rejection cases.
- No data, terminal, PC1, RBS, CAP Driver, or fiscal/EFTPOS mapping changes.

## Verification and next steps

- Initial CI #4109 reached the required checkpoint-policy gate and stopped because this active list and a new checkpoint were missing; no application tests ran in that attempt.
- The policy-required list and checkpoint are now being added; rerun the full CI.
- After green CI, merge/deploy through the authorized gate; verify the exact live revision and that `/store/kat-store` serves the app and manifest.
- Only then issue a fresh one-time activation link for the existing KAT-POS-02 if needed. The previously opened link may have been consumed; do not expose its activation token.
- Keep fiscal printing and sales out of scope until the POS loads and the separate connector/test readiness is confirmed.
