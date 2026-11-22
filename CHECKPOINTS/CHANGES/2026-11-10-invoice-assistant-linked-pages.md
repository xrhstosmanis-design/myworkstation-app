# Invoice Assistant — linked BackOffice pages

Hosted LAB on #3780 created one synthetic draft from two JPEGs and returned the same draft for correction. The Assistant showed only the first original. BackOffice links the other OCR jobs to the same draft as MERGED_PAGE without writing a POS handoff list.

The loader now reads those scoped linked jobs when the POS handoff list is absent, retaining explicit source precedence. The focused regression passed. Hosted verification after deployment remains pending.
