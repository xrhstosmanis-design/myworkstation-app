# Email delivery history

Owner /root · feat/email-delivery-history · claim PR #3831.

The existing Super Admin dispatch screen shows the latest 50 automatic cash report and invoice stock exclusion records for the selected store. The invoice worker records SMTP message IDs and bounded failure codes. Historical rows remain readable before those optional columns exist. SMTP acceptance is distinct from mailbox delivery.

Local verification: 22 existing delivery lifecycle tests and mock checks for invoice outcomes, history scope, ordering, limit and missing tables. Full CI and LAB verification pending. No live email sent.

The first PR revision passed CI run 43288743666. Added native PostgreSQL and HTTP coverage with synthetic cash and invoice records, store isolation, legacy columns, and role enforcement. This does not exercise a deployed LAB or deliver mail.
