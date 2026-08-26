# KAT local release checkpoint

Status: local only — **do not push, merge or deploy PR #231 without explicit approval**.

Last verified: 2026-08-25

- Production client build: PASS (1,895 modules)
- Server test suite: PASS (656/656)
- KAT readiness invariants: PASS
- Worktree after verification: clean

## Completed checkpoints

| Commit | Result |
|---|---|
| `0a01c72` | POS cancellation rows have the correct Audit label |
| `0f8e7b0` | POS cancellation is permanently covered in central Audit regression |
| `f966afc` | KAT void fixes synchronized locally |
| `a482dc5` | Modifier-only milk stock profile persists correctly |
| `684d9fd` | Online milk modifiers consume stock correctly |
| `e2fce30` | Seller / Admin / Super Admin boundaries locked by tests |
| `263487c` | Multi-POS database test bypass removed |
| `27381bd` | Offline cash queue is durable and idempotent; unsafe payments remain blocked |
| `8d257dd` | Backup integrity can be verified without restoring or mutating data |
| `f6ceb56` | Safe Windows Store Mode installer added |
| `84c5978` | Safe Store Mode recovery package added |
| `5cbd85f` | Final automated twelve-sale volume regression added |
| `9fdc5ce` | Installation package SHA-256 integrity verification added |
| `7b55ae9` | Pre-deploy healthy Render revision preserved as rollback checkpoint |
| `34a5bb3` | Guided HOME PC / KAT PC real-test checklist added |

## Remove from the implementation list

- POS VOID labels in Shift Transactions and BackOffice Audit.
- POS cancellation central Audit regression.
- Milk/add-on and online modifier stock implementation.
- Seller/Admin/Super Admin permission contract.
- Multi-POS terminal/shift isolation contract.
- Durable offline cash queue and reconnect idempotency.
- Backup dry-run verification.
- Store Mode installer, recovery package and package integrity verification.
- Automated final 12-sale regression.
- Render health/revision and rollback-checkpoint implementation.
- Final local production build verification.

## Keep on the real-test list

- Visual check of the existing `-4.80 EUR` cancellation in Shift Transactions and BackOffice Audit; no new cancellation is needed for this label check.
- Freddo Cappuccino fresh-milk consumption: 70 ml.
- Online KAT-004: Online -> POS -> payment -> exactly one sale -> exactly one stock movement.
- Seller/Admin/Super Admin visual access check.
- Two real POS terminals with shared stock and separate shifts/cash.
- Offline disconnect, cash queue and reconnect exactly once; card/IRIS/mixed/returns blocked offline.
- Backup download followed by Super Admin dry-run verification.
- Store Mode installer and recovery on HOME/KAT Windows PC.
- Real 10-20 sale pilot and final shift close.
- Scanner and printer hardware checks.
- RBS real receipt with the approved technical/provider procedure.
- EFTPOS success, failure and cancellation using the real terminal/provider.
- Netlink remains on hold until its separate provider test is approved.
- Push/deploy/health check only after explicit approval.
