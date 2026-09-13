# Checkpoint — Automatic shift handover offset

- PR: #813
- Scope: same store, same POS, consecutive closed/open shifts only.
- Behavior: when the next opening explains the previous cash variance within tolerance, mark the shift as automatically offset and include evidence in the final result.
- Tests: local 284/284 passed.
