# KAT CARD null payments validation

Date: 2026-10-03

The tested CARD picker request reached checkout but failed Zod before creating an RBS request. The single-method CARD payload included payments:null, while checkoutSchema permits payments only as an optional array. Single CARD checkout now omits payments entirely. Mixed payment and CASH are unchanged.
