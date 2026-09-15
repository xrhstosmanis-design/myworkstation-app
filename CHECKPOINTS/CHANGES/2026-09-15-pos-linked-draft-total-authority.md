# POS linked-draft total authority

The linked draft displayed the operator-confirmed invoice total 1,380.44 €, while the
AI recheck could retain a stale 1,246.38 € job total. That made six extracted rows look
complete and prevented exact-gap restoration. Reconciliation now reads totalGross from
the same linked DRAFT PurchaseDocument first, falling back to the durable POS handoff.

The existing draft is reread and replaced atomically. No payment is created or changed,
no stock is posted, and no approval or finalization is performed.
