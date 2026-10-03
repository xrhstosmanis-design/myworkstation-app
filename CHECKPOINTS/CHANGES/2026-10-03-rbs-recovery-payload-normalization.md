# RBS recovery payload normalization

Date: 2026-10-03

The already-issued cash recovery now reaches continuation but remains blocked by product/payment validation. The recovery payload is normalized to the checkout API contract: paymentMethod comes from the persisted fiscal request and items contain only productId, quantity, barcode, unitPriceOverride and overrideReason. Existing fiscalRequestId/clientTransactionId are reused. No fiscal command is resent.
