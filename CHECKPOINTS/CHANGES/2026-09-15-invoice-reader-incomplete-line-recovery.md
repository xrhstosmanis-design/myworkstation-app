# Invoice reader incomplete-line recovery — 2026-09-15

Azure or OpenAI results with product description/code but missing quantity, unit price, or net amount are not accepted as invoice drafts. The reader makes one bounded OpenAI retry that explicitly requires real printed economics; if still incomplete, it returns an error and creates no draft. POS payment, stock, accounting, approval and finalization are untouched.
