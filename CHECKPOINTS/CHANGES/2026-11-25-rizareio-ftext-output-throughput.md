# Ριζάρειο — bounded online FText OUTPUT throughput

25/11/2026 · retained FTEXT-RESILIENCE-01 scope · branch fix/rizareio-ftext-output-throughput · baseline 6b3c5937b02ad3bbd806928de324a0e32afb203c. Owner authorized implementation. Operator evidence: 16,303 active C:\FText entries and 26.765 seconds from publish journal to RES on one existing CASH request. Earlier improvement after clearing files is owner observation. Causal effect and current terminal acceptance remain NOT TESTED.

The existing online loop can archive up to three already cloud-verified groups after a work poll with no request or late/error recovery. It checks a 150 ms budget and readiness before starting each group and stops the burst on archive failure. An individual atomic archive can finish beyond that start budget. Retains original validation and durable archive, no deletes, discovery/heartbeat cadence, and fiscal command handling. Synthetic regression runs the actual connector loop and checks that work polls separate archive bursts. No production installation or transaction authorized by this source work.

Acceptance: Windows smoke suite and synthetic large folder replay before a separately authorized selected-PC rollout. Observe active-folder count and publish-to-RES times on existing normal sales and recoveries after rollout.

Local PowerShell 7 Linux: OUTPUT cloud smoke and original-evidence smoke passed. A temporary replay added 16,300 unverified synthetic files to the four input-fixture records. Proof discovery retained input hashes and the instrumented connector drained three groups per idle pass, polling again before the next burst. Scope is synthetic correctness and scheduling, not a measured Windows production throughput or payment time.
