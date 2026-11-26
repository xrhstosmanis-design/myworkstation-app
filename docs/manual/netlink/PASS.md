# Netlink — limited user-verified catalogue and report print

25Nov2026, owner /root. User confirmed corrected internal report printed correctly and supplied a populated catalogue screenshot after POS58 driver installation/selection. This is narrow USER PASS; exact runtime at observation not independently verified. Last central source release was #4219/ac3ae31. No sale, payment, PIN or issued-card acceptance is claimed.

Available to the signed-in POS user of the selected licensed store with Netlink enabled. Open Functions POS > NETLINK. Catalogue should show provider groups/products. Open Reports, select detail/summary/weekly and date range, then Print report. Select the installed POS58-series thermal printer. On the observed Windows58mm device, Generic/Text Only previously corrupted Greek text; the user subsequently confirmed correct report output. Other devices/drivers and automatic cutting remain NOT TESTED.

Each view/report uses the selected store; changing store must discard earlier results. Printed output states MyWorkStation internal ledger and is not a Netlink provider statement or identity certificate. Printing an existing report does not sell a card or request a PIN. Card execution stays separately gated and the pending paid-issuance flow is not documented as usable here.

##26Nov2026 — limited live provider non-execution review

Verified on runtime89cc197fcd959d5dd3bcc974ae4a9dc0b021a809 through authenticated SuperAdmin > selected store > Full BackOffice. This is only a metadata-review PASS; actual card fulfillment and physical PIN printing remain OPEN. Employee rights and PINs were not changed. Server authorization remains required for owner/admin/manager and the exact company/store; privileged POS-role acceptance is separate.

Open the selected store, Other commercial functions, then Paid Netlink cards. Identify the existing paid card requiring provider review; confirm the displayed station and original purchase. Only after explicit provider confirmation of non-execution, enter its reference and local date/time, check the confirmation and choose Record Netlink confirmation. The tested outcome is Confirmed non-execution — awaiting fulfillment, while the original payment and fiscal receipt remain unchanged. Recording the confirmation does not issue a PIN. Do not record the same review again or create another basket/payment to repair it. If a date remains empty, complete all native date/time segments before submitting; an incomplete form remains disabled.

Independent scoped before/after and one audit confirm the narrow review. Issuance, provider charge/statement and voucher output are not certified by these steps. The real fulfillment button remains a separate consequential action for the user; the agent did not press it. An uncertain fulfillment must be reconciled with the provider, never retried as a new purchase.


## 26Nov2026 — operator completion installed; actual voucher acceptance pending

Central runtime af7998af6e8f34ae465480a20cef1da17af97ab1 / deploy dep-dc40uhd6e07s73drioa0 LIVE, exact health verified; source4263 full CI45802678789 all five jobs SUCCESS and 68 targeted native/mounted tests PASS. This is an implementation/release result, not a physical-card PASS.

At the actual store computer, refresh POS with the ordinary active operator, then Functions POS > NETLINK. A paid card whose non-execution has already been documented by owner/admin/manager appears even if a different operator collected the money. Choose Complete paid card and confirm. It uses the original payment/fiscal receipt and its existing service fee. After a successful provider result, print the saved voucher on the store thermal printer. Reprint uses the same saved PIN; it does not buy another card. Original operator, actual completing operator and privileged users retain saved-voucher access; other employees cannot retrieve that completed PIN. No staff promotion or PIN change is required.

Unreviewed UNKNOWN still needs documented provider reconciliation by a responsible user. If completion is uncertain, do not pay, issue or retry a new purchase. Actual operator fulfillment/PIN/provider statement/physical voucher output remains NOT TESTED, to be checked once at the store. Original paid case remained reviewed/pending and financially unchanged after deployment. Release receipt: `CHECKPOINTS/CHANGES/2026-11-26-netlink-operator-recovery-live.md`.


## 26Nov2026 — existing paid card USER PASS; fresh sale still pending

26Nov2026 owner reports the existing card came out; supplied POS screenshots show Issued card, saved-card print dialog and Reprint same card under the normal operator. Scoped native read-only check confirms COMPLETED at11:47:39UTC, saved encrypted result, provider transaction present, exactly one recovery dispatch and one completion audit, one original payment and two original sale lines. No PIN/result text is exposed or copied into public source. This is a narrow USER PASS for existing paid-card fulfillment and saved-voucher UI; physical legibility/redemption/provider terminal statement and a fresh normal purchase are not independently verified.

The completed card stays available for same-card reprint without another charge. The new-card button is independently locked by the global issuance flag; it is not blocked by this reprint entry. Owner authorized activation of new paid cards after the successful completion. Configuration activation is being prepared; a fresh normal cash/card+fiscal+fee purchase remains NOT TESTED. Do not buy a card merely to repeat the already-proven recovery. See `../../../CHECKPOINTS/CHANGES/2026-11-26-netlink-new-issuance-activation.md`.


## 26Nov2026 — operator reprint policy superseded; source validation pending release

The owner now forbids employee reprint/repeated PIN access. Earlier instructions allowing original/winning employee reprint are historical and superseded. New source permits one audited initial delivery, including manual initial-print fallback when popup opening fails. After print submission, employee print controls and PIN lines are cleared; repeated server delivery is denied. A genuine print failure after delivery is handled by owner/admin/manager via an audited responsible reprint, without buying again. This cannot revoke or prevent copying an already-seen paper/PIN.71 native/HTTP/mounted tests and Node20 build PASS; deployment/actual updated operator UI pending. See `../../../CHECKPOINTS/CHANGES/2026-11-26-netlink-voucher-no-reprint-source.md`.
