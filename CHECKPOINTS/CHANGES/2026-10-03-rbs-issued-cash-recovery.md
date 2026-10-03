# Recover already-issued RBS cash receipt

Date: 2026-10-03

The controlled 7UP 330ML €1.20 CASH receipt physically printed, but the POS remained on the pending overlay and restored the same request after refresh. The fiscal command must not be sent again. When recovery finds a CASH request in DISPATCHED with a complete saved cart, the UI now resumes checkout with the same fiscalRequestId and clientTransactionId. The server's existing continuation path accepts DISPATCHED cash, commits the sale as ISSUED, marks the request SALE_COMMITTED, and the normal POS success path clears the cart. No resend is performed.
