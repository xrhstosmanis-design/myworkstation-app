# Guarded confirmed CARD recovery endpoint

Date: 2026-10-03

Adds an authenticated, store-scoped recovery action only for CARD requests in OPERATOR_CONFIRMED with operatorOutcome YES and saleId NULL. It invokes the same idempotent server-side finalizer as the normal live flow and does not issue or resend any fiscal/EFTPOS command. Intended for already-paid pre-fix requests.
