# Weekly alarm: fail-closed profile type correction

25/11/2026 · retained4194owner /root. Full CI45633525866 exact head8d4cc256 completed7380PASS/2FAIL/4SKIP. Both failures exercise the same newly introduced Python weekly suffix selector against None/int profiles: AttributeError instead of the required ValueError. No merge/deploy/install occurred.

Both file and document selectors now reject non-string profiles before suffix parsing. Existing closed-profile tests cover both entry points and preserve no-database/no-fallback behavior. All27Python worker/readiness tests PASS; actual JS wrappers/profile/compatibility10PASS/0FAIL/1native-PG SKIP. Exact code fingerprints refreshed; immutable manifest/plan identities unchanged. New complete CI required, no gate weakened.

User now explicitly requests the operational test at Διαδόχου, replacing main LAB as the requested test location. Resolve exact existing store/company centrally; read-only baseline and preview first, explicit scoped store opt-in only after green CI, code/schema/runtime admission and measured controls. No sales/payment/order/currentStock mutation is part of this test. Existing LAB isolated/native coverage remains evidence only, no hosted LAB PASS claimed. Decreases without availability/promotion evidence remain HELD. Production runtime remains OFF.
