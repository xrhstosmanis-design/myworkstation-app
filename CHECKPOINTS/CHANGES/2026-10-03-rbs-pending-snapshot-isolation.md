# RBS pending snapshot expression isolation

Date: 2026-10-03

Production on d650c3bf confirmed the remaining ReferenceError at the RbsCapDriverV1Request INSERT line. The pending checkout snapshot is now built and JSON-serialized before entering the Prisma tagged SQL expression, and pendingId/pending are separate declarations. This isolates itemSummary from the SQL declarator evaluation path. Writer/CAPDriver/AURORA/VAT/payment mappings unchanged. Physical retest remains blocked until green CI and exact deploy.
