# Remove itemSummary from RBS pending snapshot

Date: 2026-10-03

Production on 9131adbb still raised ReferenceError at checkoutSnapshot construction. The RBS pending snapshot now omits itemSummary entirely. resolvedItems and baseSummary remain persisted, and resume logic already recomputes itemSummary with quoteSummary(items) when the snapshot field is absent. This removes the failing lexical reference without changing Writer/CAPDriver/AURORA/VAT/payment mappings.
