# Checkpoint — KAT RBS CAP Driver v1 regclass runtime failure

Date: 2026-10-03
Status: FIX IN PR #1645 · AWAITING CI / MERGE / EXACT DEPLOY / PHYSICAL RETEST

## Physical evidence

- Writer authentication and Test-Connection passed against production; C:\\capture existed and the non-claiming test created no fiscal command.
- Writer became ONLINE with a real heartbeat.
- Baseline KAT-POS-02: one existing cash sale, €3.20 total.
- Controlled product: 7UP 330ML, SKU 00582, €1.20. Management readback confirmed VAT department «ΦΠΑ 13% - Γενικά είδη», Kiosk VAT code 42, cash-register department 2, rate 13%.
- Cash was pressed once. POS displayed «Παρουσιάστηκε εσωτερικό σφάλμα», cart remained open and no receipt printed.
- After the attempt C:\\capture still contained only CapDriverSVC_log. writer.log contained only WRITER_START; there was no REQUEST_CLAIMED, REQUEST_WRITTEN or REQUEST_UNCERTAIN. No second cash click was performed.

## Production diagnosis

Render logs around the controlled attempt repeatedly reported Prisma raw-query failure: PostgreSQL regclass could not be deserialized and should be cast to a supported type such as String. store-pos.js uses to_regclass table-existence probes in the checkout/runtime path. PR #1645 casts those probe results to TEXT before Prisma receives them.

This fix does not change CAPDriver, AURORA, Writer scripts, VAT profile 42→2→13%, payment codes, or fiscal command format.

## CI state

Initial PR #1645 CI run 37100955025: Windows CAPDriver parse/smoke SUCCESS; build-and-test stopped at checkpoint policy because ACTIVE and a new CHECKPOINTS/CHANGES file were missing. This checkpoint and ACTIVE update satisfy that documentation gate. Fresh CI is required; no merge/deploy or physical retest before green CI.

## Next

Fresh CI → merge only if green → exact Render production revision → verify regclass error no longer appears → confirm Writer ONLINE and clean C:\\capture → one separately identified controlled cash test. Never retry an uncertain fiscal attempt.
