# RBS finalizer shift ledger

Date: 2026-10-03

The first server-finalized physical test proved fiscal issuance and Sale creation, but the sale did not appear in shift transactions because the finalizer did not create Payment or StoreTransaction. The finalizer now resolves the open CashShiftSession for the fiscal request terminal and writes CASH Payment plus SALE_CASH StoreTransaction atomically with the sale before marking the request SALE_COMMITTED.
