**01/10/2026 14:28–14:29 Greece — LIMITED LIVE PASS: store address and two report recipients.** PR #1583, exact runtime `ea530316b5682c808ffc1638590719c5445c36bc`; PR/main CI and Render `dep-dav45fe0tbcc73dhfmcg` LIVE11:26:25Z verified. Super Admin saved authorized Diadochou address and two emails once; UI success, reopened form and independent DB readback confirm persistence at11:28:15.898Z. SMTP delivery, report dispatch and other stores NOT TESTED; no email or financial/stock/fiscal action. Completed configuration subtask removed from pending; physical installation remains pending. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-store-report-recipients.md`, manual `docs/manual/pilot-installation/README.md`, PDF `output/pdf/MyWorkStation_Diadochou_Installation_Status_2026-10-01.pdf`.

# Store installation: address and multiple report recipients

COMPLETED CONFIGURATION; actual email delivery NOT TESTED. Owner request 01/10/2026 14:11–14:12 Europe/Athens. Correct Diadochou store cmulmjjoc000qqlbf2bn2ifj0, company cmulmjjoa000oqlbfyi0h53ju.

Before: read-only production store address/responsibleEmail null; five operators and terminal already created. Existing platform form/API allow one recipient only and omit address. No owner directly in this company's User records, although linked owner access exists. Do not rely on automatic owner recipient selection to satisfy two explicit recipients.

Change: existing Store fields only, no migration. Address shown/edited by Super Admin. Up to ten validated comma-separated recipient addresses normalized and deduplicated; reports show separate recipients and SMTP receives individual addresses. Single email and empty values remain compatible; omitted fields preserve existing data. Reject malformed addresses and CRLF. Tenant-bound store lookup retained, manual report dispatch guard unchanged.

Evidence: three local parser tests PASS; PR/main full required CI PASS; exact deployment verified. Actual configured data independently read back and form reopened. Delivery NOT TESTED. No report/email, financial action, stock action, credentials or fiscal mutation performed. Existing product/barcode and operator work is not repeated.

Acceptance: exact deployed revision; save authorized address and two emails at named store; read back exact fields and separate report recipient list without sending a report. Actual email delivery remains NOT TESTED.
