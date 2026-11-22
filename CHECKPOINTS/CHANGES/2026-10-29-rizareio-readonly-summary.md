# 29 October 2026 — Server and BackOffice diagnostic summary

Evidence only. No runtime code, database, configuration, subscription, deployment or business data changed. Existing performance and inventory assignments remain with their recorded owners.

Production application is on 1 CPU / 2 GiB; production database remains on 0.1 CPU / 256 MiB. Half-hour database memory samples reached approximately 77% of limit. Samples do not establish instantaneous peaks or capacity. No blocked queries or active nonself query over 15 seconds at the observed health check; no server failure/restart event returned in the examined window. HTTP latency metrics unavailable; a few aggregate 5xx counts need separate diagnosis.

Representative installed owner-product catalog SQL search returned 33 rows in two separate observations: execution 598.694 ms and 599.084 ms, excluding HTTP/UI. Empty search returned 500 rows in 204.583 ms. Company-first experimental read-only query returned 33 rows in 400.166 ms. These are live diagnostic samples, not stable benchmarks, exact result-equivalence proof or an installed fix. Native correctness and representative tests plus an ownership claim are required before source changes.

Existing planner statistics were confirmed; null analyze timestamps in activity counters alone do not justify maintenance. No ANALYZE, VACUUM, DDL, index or plan upgrade was performed.

Actual scheduled backup job completed 29 October at 05:01 Europe/Athens, approximately 318 MB. Reviewed success path includes dump, archive table-of-contents inspection, upload and remote byte-size check. Independent download/hash/full restore not verified here. Later authenticated Platform Admin showed backup OK at 08:02.

Normal Super Admin email/password/device step and separate Authenticator verification succeeded. Read-only Rizareio readiness screen at 08:44 showed seven mandatory pending confirmations: Store Mode responsible person, installation details, store-specific backup confirmation, design/database freeze, employee login test, shift open/close test, and Kiosk Manager unaffected confirmation. Three active employees have PIN/card records. An open shift already exists; no new shift was opened or closed. Pending confirmations are not proof of physical failure. Existing generic KAT-labelled readiness text is not independent fiscal readiness evidence.

No financial, stock, fiscal, device, email or accepted-transaction replay performed. Store opening/search UI diagnosis continues; no readiness, performance or functional PASS claimed. This intentionally minimal public technical record excludes production resource IDs, company/store IDs, personal details, credentials, database URLs, raw query plans, shared roadmaps and generated PDFs.

Authenticated Master Catalog search COCA on29Oct returned visible results in1625ms (browser action-to-locator measurement, includes automation overhead; one sample only). Earlier owner-product SQL is a DIFFERENT endpoint, not proof of this UI search cause. Existing store BackOffice opened with current shift data; exact entry latency not captured. No mutations performed.
