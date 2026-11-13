# Independent payment history permission

Implements claim #3857. payments.read can be granted without viewing sales. The scoped transfer history remains read-only. Native PostgreSQL fixture provisions only payments.read and checks denial of the sales terminal list. CI and hosted LAB are pending.
