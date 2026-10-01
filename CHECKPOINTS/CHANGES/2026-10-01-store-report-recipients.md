# Store installation: address and multiple report recipients

ASSIGNED codex/store-report-recipients-20261001. Owner request 01/10/2026 14:11–14:12 Europe/Athens. Correct Diadochou store cmulmjjoc000qqlbf2bn2ifj0, company cmulmjjoa000oqlbfyi0h53ju.

Before: read-only production store address/responsibleEmail null; five operators and terminal already created. Existing platform form/API allow one recipient only and omit address. No owner directly in this company's User records, although linked owner access exists. Do not rely on automatic owner recipient selection to satisfy two explicit recipients.

Change: existing Store fields only, no migration. Address shown/edited by Super Admin. Up to ten validated comma-separated recipient addresses normalized and deduplicated; reports show separate recipients and SMTP receives individual addresses. Single email and empty values remain compatible; omitted fields preserve existing data. Reject malformed addresses and CRLF. Tenant-bound store lookup retained, manual report dispatch guard unchanged.

Evidence: CI/local validation pending. Actual configured data and delivery NOT TESTED. No report/email, financial action, stock action, credentials or fiscal mutation performed. Existing product/barcode and operator work is not repeated.

Acceptance: exact deployed revision; save authorized address and two emails at named store; read back exact fields and separate report recipient list without sending a report. Actual email delivery remains NOT TESTED.
