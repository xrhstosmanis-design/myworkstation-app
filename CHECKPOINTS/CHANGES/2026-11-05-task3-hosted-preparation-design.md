# 05/11/2026 — Task 3 hosted preparation: evidence and design proposal

Status: OPEN / DOCUMENTATION DRAFT / HOSTED CONSOLIDATION NOT EXECUTED.
Parent: INVOICE-CREDIT-CONSOLIDATION-01 and INVOICE-CREDIT-THIRD-HEADER-01; source PR #3659. Retained owner /root; no ownership transfer or duplicate runtime implementation. Documentation branch: docs/task3-lab-readiness-20261105.

This is a preparatory evidence/design document, NOT a published-before-source claim, runtime fix, independent approval, fixture-creation receipt or functional PASS. The authoritative tracker, active list and pending roadmap have not been changed by this draft. Before any new source implementation or state-changing LAB setup, the retained owner must publish the exact bounded claim in the existing shared registries, preserve all history, regenerate the required tracker PDF and complete the applicable normal documentation CI/main integration. Existing accepted manuals/PDFs remain unchanged.

## Fresh source observations

GitHub main was read at b7c75d4ec908919acaa21d967ae81f29b4d6aadf. The existing guarded deployment workflow 41988328490 for that exact revision reports SUCCESS; this is not a new hosted health or acceptance measurement. The earlier source/deployment history in PR #3659 is retained rather than replayed.

The following inspected files are pinned to that source revision:

- client/src/components/commerce/CommerceLauncher.jsx, blob b6bea3c69bd545f033f9d6781f6132771285a7b5: normal scoped operations launcher and legacy commerce mode.
- client/src/components/commerce/CommerceHub.jsx, blob 91fe1df7173f4d8b25140cacbad5583c72d77111: the documents state mounts InvoiceInboxPanel. A second existing route is PendingCenterPanel.onOpenSource for an INVOICE row: it selects that row's store and sets the documents tab. This callback itself neither writes records nor invokes a provider. A PAYMENT row has a different navigation branch and is not a substitute.
- server/src/routes/commerce-v1.js, blob 63b92c9449a33464f16bf4b644bd1eed098bee3a: POST /documents/inbox accepts an attachment and creates DocumentAttachment and DocumentInbox. It does NOT create MyDataInboundDocument, the linked common-draft family, a payment or an applied-credit proof. Therefore uploading a synthetic PDF alone does not satisfy the required fixture.
- server/src/lib/invoice-common-draft.js, blob a3c2a0cca7741441f0155c855646151941cdc26b: inspectAppliedCreditForMerge validates the original signed StoreTransaction, DRAFT credit document and SUPPLIER_CREDIT_CASH_APPLIED audit; OFFSET additionally validates the original positive payment. The additional-series capability requires an established canonical family, matching identities and a verified proof version. Creating a row that merely looks paid, or supplying a client-side success flag, is not an acceptable fixture.

The already inspected commerce-mydata-inbox receiving flow is an external SANDBOX/PRODUCTION RequestDocs operation, not a local synthetic import. The existing Invoice Learning Lab, customer-demo preparation and No40 user fixture have different purposes and are not invoice-family preparation tools. A repository code search returned incomplete_results=true with no matches; it must NOT be cited as an exhaustive proof that no other preparation route exists.

## Browser diagnostics in this continuation

Both bounded runs used the previously user-confirmed profile and reported the correct MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ scope. No credentials, tokens, cookies or browser storage were inspected or exported.

1. Run 7b6d0b33-541d-46e5-9800-45c76d132da7 attempted keyboard/accessibility navigation but ultimately reported element click activation. It reached the Commerce Hub; an attempted invoice-tab activation resulted in the Pending Center. This is failed automation navigation, not proof of an application event-mapping defect or unavailable invoice feature. No screenshot artifact was returned.
2. After inspecting the alternative INVOICE-source callback in CommerceHub, run f4d2bee3-c5af-4b96-9ac3-8fc85952c43d attempted that specific route. It reported a persistent screen-recorder utility overlay obstructing the commerce controls; Escape did not dismiss it. It did not reach the invoice-source action. No screenshot artifact was returned. The overlay is an observation from this run, not an established explanation for every earlier failure.

No further blind navigation or unsupported JavaScript dispatch was started. The actual InvoiceInboxPanel has still not been verified through this executor. A later navigation diagnostic should first close the recorder utility using its own normal visible close control, verify the unobstructed page, and use the existing Pending Center INVOICE source route. Do not start recording, change permissions, manipulate DOM/React state or activate a PAYMENT/STOCK row. If a deterministic direct invoice entry requires new source, claim and test that separately; do not assume a production bug from these tool reports.

## Bounded preparation contract for review

The unresolved prerequisite is a supported, scoped way to prepare entirely NEW synthetic incoming-credit/draft data without calling myDATA/OCR providers or fabricating financial history. The following is a proposed contract, not implemented functionality:

1. Retain ordinary authenticated actor, role, company/store, module, licence and lifecycle checks. Resolve an explicitly allowlisted LAB scope server-side and verify its active identities; names alone are insufficient. Empty, stale, foreign or ambiguous scope must fail closed. No arbitrary tenant input, new user, credential extraction or permission change.
2. Expose a genuinely read-only readiness/preview operation. It must not perform schema creation, lazy writes, financial processing or network calls. Show the intended fixture identifiers, scope, allowed new rows and required later normal application actions before any write.
3. Prepare only uniquely tagged, fresh synthetic attachments, incoming records and unpaid NEW/DRAFT records. Require an explicit preparation confirmation, stable operation key, validated request hash and transactional locking. An identical retry returns the same setup; changed-payload/key conflicts fail. Never overwrite or repurpose old commercial or LAB records.
4. Do NOT forge paid state, signed transactions, the applied-credit audit, canonical aliases or reconciliation success. Any new synthetic positive payment and OFFSET/CASH_RETURN application required by the acceptance fixture must be performed through the existing ordinary application writers with their real authorisation, confirmations and audit. The preparation helper is not a new money/credit writer.
5. Keep synthetic source provenance distinguishable from external AADE sources and exclude it from receiving cursors/provider fetches. Use new self-contained synthetic files; no remote original URLs, real supplier originals, OCR, AI charge, company VAT edit, integration edit, fiscal operation, stock posting or historical payment replay. Preserve H/G, reserved I and all peer assignments.
6. Keep fixture setup separate from acceptance. Record and inspect the deliberate setup changes first. Only afterwards take a fresh BEFORE baseline immediately before each normal reconciliation action, including an untouched control. The old readiness snapshot is not that baseline.
7. Preserve the original acceptance criteria: exact company/store/supplier/VAT/type/day/cents/numeric suffix; series-only unpaid extra; original/MARK/header/reason confirmations and explicit canonical-table selection, including an empty extra. Retain the original canonical identity, rows, files, signed credit proof and positive OFFSET payment. Validate one new flat alias, allowed extra status/timestamp changes, no new financial/stock effects, idempotent same-member retry, stale-proof rejection and other denied variants. OFFSET and CASH_RETURN evidence must be recorded separately when both are tested.

## Gates and next bounded work

First verify unobstructed deterministic access to the existing invoice view, without business writes. Complete the source-route inventory and the retained-owner shared-registry claim before implementing any genuinely missing fixture preparation. Do not deploy an ad-hoc SQL seed or execute the isolated invoiceDbFixture helper against the shared hosted database.

For any new runtime candidate require complete-checkout tests of normal and denied scopes, read-only preview, conflict/idempotency/concurrency, lifecycle changes, no outbound calls, no fabricated credit proof and protected-history preservation; then independent review, the exact required native PR/main CI and the ordinary guarded release. A subsequent hosted action needs fresh live revision, actor/store/terminal/shift, actual response and before/after/control evidence. No manual/PASS closure from source, CI, generated data or snapshot equality alone.

Mutations in this continuation: this documentation branch/file only. No application source, production configuration, deployment, real or synthetic business records, payment/credit application, consolidation, stock or fiscal action was submitted. No new functional PASS is claimed.
