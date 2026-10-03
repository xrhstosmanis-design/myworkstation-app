# RBS finalizer BackOffice parity

Date: 2026-10-03

Server-side RBS finalization must preserve normal POS accounting semantics. The immutable checkout snapshot now stores actor/operator identity. Finalization attributes the Sale and StoreTransaction to that operator, uses the exact terminal's open shift, reserves stock via reserveSharedStock (which updates StoreProduct and writes idempotent StockMovement), and writes POS_SALE_COMPLETED to StoreOperatorAudit. All happen in the same transaction before SALE_COMMITTED.
