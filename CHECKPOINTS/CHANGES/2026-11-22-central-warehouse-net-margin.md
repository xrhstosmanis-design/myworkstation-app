# Central warehouse net margin

Status: before source, LAB pending. Owner: /root. Source branch: fix/central-warehouse-net-margin.

Apply centrally across stores through the shared inventory archive and item card. Derive comparable acquisition cost from net document line value per inventory unit, preserving package corrections and store isolation. Use the resulting cost for list margin, margin filters and displayed stock valuation. Calculate item-card margin and markup on VAT-exclusive retail. Keep the stored item cost and approved invoice data intact.

Reference case: KM3621, invoice 600_91-2389. Net value €17.30 for 12 pieces gives €1.441667 per piece. Retail €2.70 at 13% VAT gives 39.66% margin and 65.74% markup. Verify the reference case, package conversion and fallback cases before LAB acceptance.
