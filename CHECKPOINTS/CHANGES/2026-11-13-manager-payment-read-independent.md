# CENTRAL-BACKOFFICE-ACCESS-01 — Independent payment visibility

The history shipped in #3851, but account provisioning still makes payments.read depend on sales.read. Next bounded slice: permit explicit payments.read alone, verify a provisioned account can view its store payment history, and confirm sales and writes remain denied. Preserve the existing owner and store scope. LAB pending.

Follow-up review: separate the read-only pending supplier settlement queue from approval and cancellation rights. Validate each separately before implementation.