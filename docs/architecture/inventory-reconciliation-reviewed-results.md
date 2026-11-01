# Reviewed stocktake reconciliation

Status: proposed next implementation slice, not installed and not evidence of LAB acceptance. The read-only comparator in PR3495 remains independently gated by its own exact CI, release and acceptance.

## Preserved sources

Keep Stocktake, StocktakeLine, InventoryCountEvent, StockMovement and invoice records unchanged. A reviewed reporting correction is not a stock receipt, payment, employee charge or edit of an original count. The existing canonical stock and invoice writers remain the only writers of their respective ledgers.

## Store and lifecycle scope

Use append-only WorkforceAuditLog records with a new inventory reconciliation entity type, scoped by company, store, current lifecycle generation and the two exact finalized stocktake IDs. This reuses an already lifecycle-covered table without adding a relation, migration or bootstrap. The review source and all referenced product IDs must belong to the same selected store and company. Reset history must never be reinterpreted as current review authority. Malformed or over-limit history must refuse the complete reviewed result rather than silently skip a record.

Existing native Owner or platform administrator admission is the initial writer boundary. Personal inventory read/count grants must not acquire cost visibility, equivalence confirmation or correction authority. Extending delegated grants requires a separate explicit executable-right integration; no role label or review-catalogue entry grants authority.

## Append-only actions

LINK confirms that identified product IDs represent the same physical unit, with a selected canonical product ID, reason and evidence reference. Do not infer a link from names or barcodes, and do not merge product cards or move their stocks. REVOKE references an existing review action; it never deletes that action. Resolve active equivalences transitively with explicit canonical-product consistency. A conflicting canonical choice remains unresolved until an authorized review fixes it.

CORRECTION records a signed count correction for an exact product and stocktake pair, reason and evidence reference. It adjusts the reported result only. A physical sale, return, transfer or stock movement already present in the source ledger must not also be automatically included as a report correction. Refuse corrections to an uncomputable starting result; missing counts or invalid chronology require source resolution first. A review reversal is a new REVOKE record.

## Transaction and replay contract

Accept an actor-bound UUID request ID, exact source fingerprint, current review head and lifecycle generation. Lock the selected Store row, revalidate current native actor/session/company/store/module authority and lifecycle, then read the complete source and review state in the same transaction. Recheck both fingerprint and head before inserting one audit row. Bind the durable receipt to the actor and normalized request payload. Identical retries return the original receipt; changed-payload retries refuse. Detect an already active identical evidence/product/delta correction even when presented with a new request ID. No automatic POST retry after an uncertain response: use the exact receipt/status read before allowing another action.

## Calculation and cost

Retain the immutable per-code calculation and every contributing movement. For an authorized physical-product group, initial difference is the sum of its member differences; reviewed correction is the sum of its active signed count corrections; final difference is their sum. Show all three columns and derive every total from final grouped results. Unrelated groups retain separate shortage and surplus values; display their net separately.

Use the canonical physical product's recorded newer-stocktake unit cost consistently for that reviewed group, disclose the method and retain member cost snapshots in the detail. If the canonical cost is missing, zero or inconsistent, keep monetary value unknown and require review; do not manufacture zero-valued loss. Nonphysical stock corrections remain distinct from physical receipts and from reviewed count corrections.

Umbrellas: confirmed equivalence of -244 and +233 yields one group with initial/final difference -11. Without a confirmed link, preserve two separate rows and do not label the net as a confirmed physical loss. Glasses: initial -263 with an explicit evidenced +240 count correction yields final -23; intervening sales remain their own movement rows and are never included twice.

## Acceptance before deployment

Require native PostgreSQL and actual HTTP tests for tenant/store/role/module/generation denial, revoked access, stale source/head, concurrent writers, actor-bound identical/conflicting replay, durable receipt reads, action revocation, transitive/conflicting identities, unknown cost and exact initial/correction/final totals. Hash original count/stock/invoice/financial/control sources before and after each isolated review write. Mounted UI must reject old-store replies, prevent double submission, preserve an uncertain operation identity and export only the exact current reviewed fingerprint. Grouped LAB umbrella/glasses acceptance requires fresh before/after/control evidence after exact guarded release; CI alone is not LAB PASS.

Full invoice pack/gift/value-credit validation, system-event investigation, independently proven physical receipt times and warehouse identity remain separate source work. This proposal does not mark those complete or expand the retained invoice/lifecycle owners' scopes.
