## 19/10/2026 - COORD PHASE5 PRODUCT UNIT UI SOURCE PREPARED / AWAITING FULL CI AND LAB

Claim#2821 head7297ea78619f8bda0985c7a74ef83ba2875237a0 / CI39226616765 SUCCESS / mergedfab4330e2b0bda43279a89675de76759e81ec12a BEFORE edits. Actual SalesAssistantEvidence now displays a unit column for matched products; PIECE/KG/LITER/PACKAGE Greek labels use own-property lookup, null/missing are unrecorded, unknown/blank raw units retained and React escaped. Canonical server/CSV, quantity/money formatting, context/coverage messages and suppression unchanged. No VOICE parser/chat/calendar/native/provider/auth changes.

Actual compiled JSX+React SSR/mounted tests through canonical productSalesEvidence cover all known units, null/missing/unknown/blank/prototype-key/HTML values, signed amounts, valid PARTIAL and INVALID source transition removal, and legacy UNKNOWN warnings. Focused15PASS/0FAIL/0SKIP Node20; independent review clear. Includes cash#2823 by ancestry for one final integration only after both full CI heads green. Not a hosted failure or LAB PASS. No production state/settings/email/financial action or replay. Final consolidated checkpoint CHECKPOINTS/CHANGES/2026-10-19-central-overlap-unit-ui.md.


## 19/10/2026 - Legacy settings fixture compatibility after initial full CI

Initial#2823 CI39227240704 had3341PASS/1FAIL/0SKIP, and stacked#2824 CI39227307705 had3343PASS/1FAIL/0SKIP. The sole failure was the old supposedly complete settings fixture closing all MAIN rows at next07. Native PostgreSQL overlap proof passed unskipped in both initial runs. Narrow amendment#2827/head e73ae316dc9947fa14791bc40b41b9516427bc11 / docsCI39228303516 SUCCESS / mergedb25f1f2b3f0f478eb6fbc244170bf5ed872c32f2 BEFORE editing settings.test.js. Only synthetic close times changed to15/23/next07; all assertions and policy98bc634 unchanged. All automatic-report suites35PASS/0FAIL/2nativeenvironmentSKIP. Full exact PR/main native CI reruns still required; no failed source deployed. Independent VOICE history/native multi-photo claims preserved.

