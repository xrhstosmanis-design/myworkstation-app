# Master Catalog cleanup regression cases

- Full clear on a catalog larger than 25,000 master products completes with a set-based delete.
- Product.masterProductId references are preserved as tenant products and become NULL through the existing ON DELETE SET NULL foreign key.
- MasterProductBarcode rows are removed through the existing ON DELETE CASCADE foreign key.
- Store stock, sales, and tenant Product rows are not deleted.
- Maintenance audit records the number of deleted master products and detached tenant references.
- Selected delete remains limited to at most 1,000 master product IDs per request.
