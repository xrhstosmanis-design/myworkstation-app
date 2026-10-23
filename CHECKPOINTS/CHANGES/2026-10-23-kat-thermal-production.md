## 23/10/2026 — KAT-THERMAL-PRODUCTION-01 — ASSIGNED

Owner-approved bounded transfer FROM agent/table-service-layout-takeover-20260927 TO codex/kat-thermal-production-20261023. Owner explicitly approved in the printer conversation. Scope: existing POS preparation send, configurable thermal printer transport for both KAT POS, prepared coffee filtering, durable duplicate-send protection. KAT device evidence: LAN 192.168.1.87:9100, ESC/POS, CP1253 page17, cutter. No fiscal/payment/stock or broader TABLE_SERVICE takeover. Existing table/round/modifier/allergen/Android PASS protected. Hardware/network/Greek/cutter and end-to-end delivery NOT TESTED. Claim must be green and merged before source changes. Checkpoint CHECKPOINTS/CHANGES/2026-10-23-kat-thermal-production.md.


Read-only baseline: StorePreparationModal.sendProduction selects cart rows with preparation, POSTs /preparation, marks productionSent then uses window.print. It does not exclude productionSent or send directly to LAN. Server validates enabled products and inserts one StorePreparationBatch per POST without client request id. No source changes or LAB/real-store submissions yet.

Required acceptance: mixed coffee/water/tobacco selects only configured coffee; repeated/concurrent/response-lost request creates one batch/job; foreign stores denied; offline printer leaves visible unresolved state without automatic uncertain replay; Greek/options/allergens/cut verified on physical KAT from both POS. Physical successful printing must be distinguished from queue acceptance.
