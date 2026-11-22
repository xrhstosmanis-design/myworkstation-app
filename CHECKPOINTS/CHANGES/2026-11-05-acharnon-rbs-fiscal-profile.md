# Acharnon RBS fiscal profile

## 05/11/2026 - ACHARNON-RBS-FISCAL-PROFILE-01 / ASSIGNED BEFORE SOURCE / USER FAIL

Owner /root; source branch fix/acharnon-rbs-fiscal-profile-20261105. Independent installation subtask for existing Acharnon 309 / ACHARNON-POS-01. Existing catalogue import, Diadoxou, KAT, general fiscal gates and peer owners remain unchanged.

User evidence: selected-PC activation now displays ACHARNON-POS-01; Writer authentication/folder check and BackOffice WRITER ONLINE were observed. The later 1 x NERO 500ML / SKU13298 / EUR0.50 CASH attempt displays "Kiosk VAT code, register department and VAT rate do not match the confirmed register profile". No successful receipt or measured sale/payment/stock/Audit acceptance is claimed. Source validation rejects before request insertion; independent financial/queue delta remains NOT TESTED.

Technician message, Acharnon register DNA26017643 receipt and explicit owner clarification confirm register departments in printed order: 1 tobacco0,2 press0,3 cards0,4 goods6,5 goods13,6 goods24,7 services24,8 tickets0,9 scratch0,17 environmental fee24,18 plastic contribution24. Existing ACHARNON_CATALOG_V1 import uses those exact department numbers as INTERNAL legacyVatCode; these are not Diadoxou's42/5/13 or KAT42/2/13 codes. No inferred AADE exemption.

Bounded source AFTER this claim is green/main: add exact Acharnon store profile using existing imported internal code/department/rate triplets. Bind it to server-selected store cmw0pwyvo000uokg2jrjm1p0c and equality of authenticated companyId with the same store record's companyId; never read profile identity from checkout body. Store lookup already enforces active tenant ownership. Preserve all KAT10/Diadoxou7 profiles, payment codes, Windows1253, VAT mismatch refusal, one-shot queue, session/shift/licence gates and financial posting. No catalogue/rate/price/schema/migration/credential/production SQL change or new device command in engineering.

Required failing-before and regression tests: all11 exact triplets; wrong/missing owner-store identity, KAT/Diadoxou code/rate confusion, unknown/invalid department; actual checkout command-build statement emits department5/13 and one CASH1 or CARD2 CR while hostile body identity cannot select profile. Existing mismatch, encoding, no replay and other store profiles stay protected. Full exact PR/main CI, normal guarded healthy revision and fresh before/after/control precede a user-controlled new physical attempt. Physical receipt, card, financial uniqueness and full go-live OPEN / NOT TESTED. No already attempted/paid transaction replay for paperwork.

Checkpoint CHECKPOINTS/CHANGES/2026-11-05-acharnon-rbs-fiscal-profile.md. Next: publish this before-source claim, then the bounded profile correction and tests. No runtime edit or fiscal operation in this claim.

