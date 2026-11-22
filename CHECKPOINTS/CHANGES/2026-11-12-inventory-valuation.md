# Consolidated inventory valuation

Owner inventory lists support a read-only report across selected stocktakes of one store. Use the last count per product, without zones. Report current store retail and recorded unit cost, missing values, draft/final status and CSV. Hosted verification pending.

CI recovery checks use the PostgreSQL 18 image digest from the last successful main run (43301716866). The newer floating image digest coincided with repeated pg_restore failures. The production Dockerfile retains its existing default.
