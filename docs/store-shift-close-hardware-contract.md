# Store shift close hardware contract

The MyWorkStation store close flow uses the existing CashShiftSession as the single source of truth.

Required sequence:

1. The authenticated operator selects End Shift.
2. The store UI requests the local MyWorkStation bridge to open the physical cash drawer for the current store and active CashShiftSession.
3. The local bridge returns an acknowledgement or a failure result.
4. After acknowledgement, the operator counts the actual physical drawer cash and enters the real counted amount in StoreShiftClosePanel.
5. The server closes the existing CashShiftSession and calculates variance from the authoritative StoreTransaction ledger.

Safety requirements:

- The read-only RBS observer must never be used for outbound hardware commands.
- The hardware action is non-fiscal and must not issue, alter, or cancel a fiscal receipt.
- The request must be scoped to company, store, authenticated operator, and active shift session.
- Repeated requests for the same close attempt must be idempotent.
- Every request and acknowledgement must be auditable with operator, store, session, timestamp, device, result, and error details.
- Failure to open the drawer must be visible to the operator and must not silently mark the shift as closed.
- Cash totals continue to come only from CashShiftSession and StoreTransaction; no second cash ledger is permitted.
