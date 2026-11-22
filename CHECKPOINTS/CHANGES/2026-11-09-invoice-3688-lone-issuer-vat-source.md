# #3688 — FAST issuer versus recipient VAT source candidate

2026-11-09 Europe/Athens · /root · claim #3755 merged at `de34db2fbc41372a152218108dd5034e6832ff72`.

FAST retains CustomerTaxId from an Azure response internally. If the raw candidate or the resolved catalog VAT equals the nine-digit recipient VAT, it clears the outgoing supplier identity and sends a review signal. The form suppresses automatic selection and the new-supplier suggestion, preserves explicit manual selection, and keeps the other header fields. Existing provider routing and request counts are unchanged. Other Azure callers do not receive the extra role field.

Local tests cover equality after formatting, missing or different evidence, catalog normalization, and the existing durable handoff checks. Full CI and hosted LAB are pending. A misread unrelated VAT, paths without role evidence, real-photo acceptance and physical POS remain open.

CI 42570869643 stopped before application tests because the runner lacked PostgreSQL 16 tools. Synchronized the source with the main runner fix. CI 42586132102 then exposed isolated FAST route harnesses missing the real VAT helper, plus two assertions tied to the old response shape. Updated the harnesses and assertions, retaining existing conditions and adding route regressions for Azure direct and OpenAI fallback. No runtime source changed in the follow-up.
