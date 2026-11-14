# Delegated bank-transfer history implementation

Claim #3850 is merged. The delegated Payments screen preserves the confirmation after the form closes and shows up to 50 recent bank transfers for the selected store. The read endpoint rechecks payments.read and returns a limited projection with recorded status and linked document references. Existing posting and review rules are retained.

The mounted delegated history and receipt checks passed locally. Native PostgreSQL CI and deployed LAB acceptance remain pending. Verify an existing test transfer, scoped access, and access denial without repeating a payment.
