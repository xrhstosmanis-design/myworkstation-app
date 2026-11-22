# Invoice stock selection after stocktake

- BackOffice deferred invoice posting accepts explicit stock selection by line. Excluded lines remain in the financial document and are recorded in the posting audit.
- Purchase and pack conversion movements reflect the selected quantities. Cancellation reconciles the posting audit and reverses only recorded movements.
- Isolated PGlite: zero-stock and mixed same-product pack cases passed, including posting and cancellation replay. The harness substituted cancellation input parsing and actor lookup. Full CI and authenticated LAB UI verification remain pending.
