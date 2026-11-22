# Invoice review prices for repeated supplier codes

Retained #28 scope. The hosted two-photo LAB pass #3808 documented a separate issue in `LAB-REOPEN-2P-20261110-B`: the reader returned €1.50 for the second row but the editable grid showed €1.00. Both rows carried the same supplier code and had distinct descriptions. The LAB price was corrected manually before creating the draft.

The structured-line guard chose the first source with that code. It now uses the exact normalized description to disambiguate repeated codes when physical coordinates are unavailable. A different description cannot supply its price. Physical coordinate matches, unique code matches and verified duplicates with the same description retain priority as applicable.

The regression reproduced €1.00/€1.24 instead of €1.50/€1.86 on the previous source. After the fix the focused gross and V2.4.4 contract suites passed 11/11. Central column-learning tests could not load locally because the worktree lacks zod. Full CI and hosted LAB retest are pending. Recheck a fresh two-page LAB fixture without creating another draft, and verify both editable prices and the printed total.
