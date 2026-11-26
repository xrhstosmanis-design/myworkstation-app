# Ριζάρειο — Fiscal work window under valid readiness proof

Read-only production sample: 35 committed cash requests. Each of the six waits exceeding five seconds ended within two seconds of a STATUS report. Longest queue wait 16.30 seconds. This identifies STATUS overlap as a priority, alongside separate post-dispatch latency.

Increase the idle refresh cap from 10 to 15 seconds and keep the existing adaptive deadline, measured refresh reserve, and 20-second server proof expiry. The work poll still runs before starting another STATUS. A STATUS already in flight still excludes fiscal work. Local Windows CI and real-terminal timing are separate; no live transaction executed.
