# Startup regclass cleanup

Date: 2026-10-03

After 10352776 became LIVE, Render startup logs showed regclass deserialization in three maintenance paths: Online transaction actor repair, KAT-009 duplicate repair, and online ordering actor protection. Their to_regclass probes are now explicitly cast to TEXT. Fiscal Writer/CAPDriver/AURORA/VAT/payment mappings are unchanged. Physical RBS retest remains blocked until green CI, exact deploy, and clean production logs.
