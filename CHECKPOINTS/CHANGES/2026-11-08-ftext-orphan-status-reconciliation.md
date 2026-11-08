# FTEXT-STATUS-ORPHAN-01 — current-main reconciliation (2026-11-08)

Status: CLAIM RECONCILIATION ONLY; code NOT IMPLEMENTED; physical register NOT TESTED.
Source: PR #3695, checkpoint CHECKPOINTS/CHANGES/2026-11-06-ftext-orphan-status-recovery.md at head a27622f1b3d6654b2e97637206a00dce7fcc1309.
New base: main 37188822dcb3a60b1d31f9d742cf7d8566abc4f3. PR #3695 has a dirty merge state against newer shared registries/PDFs; do not overwrite those histories.

Owner observation on 2026-11-08: RIZAREIO-POS-01 connector repeatedly reports connected, then "Readiness check pending"; the setup STATUS check returns "No verified STATUS result. The request remains unresolved; reopening only reads its result and never resends it." No receipt was printed for the reported checkout. No claim of completed fiscal posting or payment is made.

Preserve the existing owner's FTEXT-only assignment and all peer scopes. Candidate root cause is an orphaned old STATUS marker with no matching command, temporary file, result or evidence; cause is not yet proven for this incident. Verify exact files and safely classify state before code. Never replay fiscal commands or a previous sale to diagnose.

Target: only STATUS handling in tools/windows-ftext/Ftext.psm1 plus isolated transport tests. Under existing folder mutex, conservatively recover only old, same-scope, valid proven orphan markers with NO matching command/temp/result/evidence, NO pending TXT/PENDING and NO CASH marker. Preserve marker bytes externally and atomically, fail closed on contradiction, age, collision, partial archive or lock. Emit at most one fresh nonfiscal STATUS; readiness only after validated original same-serial result and server acknowledgement. No changes to CASH/CARD/VOID/financial posting, pairing, configured deadlines, or vendor input history.

Next gate: reconcile authoritative tracker and original claim on main, pass required CI, then implement transport changes in a separate scoped PR. Full Windows/native and PR/main CI plus guarded release and actual PC installation/physical acceptance remain OPEN. No merge/deploy is authorized by this note.
