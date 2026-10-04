# efood / Pelican provider preflight — 2026-10-04

Owner: same efood continuation, `agent/efood-partner-lab-20261004`.
Documentation branch: `agent/efood-provider-preflight-20261004`; this is not an assignment transfer.
Status: OPEN / AWAITING ACTION-TIME CONSENT FOR ONE-SHOT LAB WINDOW. Provider callback NOT TESTED.
Recorded at 2026-10-04T17:44:54.407Z. Baseline observations were collected in this continuation after the owner's credential entry; refresh the same controls immediately before an approved action.

## Completed preparation

- The owner manually generated the new LAB Authorization secret and manually entered/submitted it in the dedicated efood test-shop webhook form.
- The agent entered the existing Callback URL. A mistaken URL in the secret field was detected without printing the credential; the owner replaced it.
- Read-only provider UI subsequently shows Save disabled, Trigger Test Order enabled, and the disabled-webhook alert absent. The secret field matches the LAB secret format; the value, hash and callback key are not recorded here.
- This verifies preparation, not successful authentication, delivery or payload compatibility. No new provider/LAB PASS is claimed.
- Exact scope: MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ, store `cmtpopbgo000trhb5ng9ytiru`; dedicated provider vendor `9344842`, chain `3d848f43-4022-4b13-93aa-d1d9629352b3`.
- The receiver remains `SECRET_ROTATED` / not accepting. The 5-minute opening control is enabled. External calls / Order / Sale / Stock / Payment / Fiscal show ΟΧΙ.
- No receiver window was opened, no virtual order was triggered, no mock was rerun, and no email was sent.

## Revision evidence and protected behavior

- Existing claim merged in PR1697, commit `4bd6553a95b62d6055aa5af89c27bd63b11fafb5`; PRCI4267, mainCI4268 and guarded Render1963 succeeded.
- Runtime source revision `2186f329a1160c98f33e53d775e11797ed51654a`: mainCI4274 succeeded. Render1966 run37220180262, deploy job111488774978, exact production revision step succeeded at 2026-10-04T17:27:28Z. The workflow checks health.ok and exact health.revision against its resolved SHA; this is deployment-job evidence, not a new direct browser health read.
- Current documentation base `b8f685ce53851a5944dc834788313debfdc444ba` includes the other page's TODAY record; its scope is preserved.
- Receiver history has only Phase A13/09 and safe-window28/09 changes. Current receiver/configuration/foundation/UI were inspected read-only. No runtime source or schema changed here.
- Preserve exact LAB/SANDBOX scoping, header-only hash comparison, encrypted dry-run evidence, captureMappings=false, one-shot row lock, automatic consumption/expiry lock, retry idempotency, and disabled business/fiscal/outbound execution.
- Historical23/09 local mock is reported email evidence, not a new independently observed test. It is not repeated.

## Before values — controls, no test action yet

Remote Chrome desktop1363×936; operator Platform Super Admin Χρήστος Μάνης. This is an external virtual callback test, not a physical POS transaction; quantity, tender and fiscal action are not applicable. No provider product is mapped or posted by this receiver. Both LAB terminals are unaffected controls.

| Control | Before |
| --- | --- |
| MAIN | OPEN; operator LAB POS2; opened27/09 20:24 Athens; transactions2; cash2.40 EUR; card0; IRIS0; total2.40 EUR; expenses0; latest01/10 12:51 Athens |
| LAB-POS-02 | OPEN; operator LAB POS2; opened26/09 01:33 Athens; transactions2; cash0; card0; IRIS0; total0; expenses120 EUR; latest displayed — |
| LAB EXCEL TEST1 | SKU LAB-EXCEL-20260909-01; product b1466a68-c47b-47cc-9139-69e6f9f7f978; stock11; latest displayed sale01/10/2026 12:51:17 Athens |
| LAB EXCEL TEST2 | SKU LAB-EXCEL-20260909-02; product caec7ad6-a460-4c71-951f-95a10d943ebf; stock−2; latest displayed sale01/10/2026 12:51:17 Athens |
| Closed shifts04/10 | 0; this is not the count of currently open historical shifts |
| Offline audit | pending2, failed0, synced2, replay0; historical records remain untouched |
| Owner confirmation queue | total−193 EUR; IDs ac83c6d3-7956-4f0b-b5cc-a2b9941d4b61,90c0f31b-6828-41c9-a76e-a29ed6721d5c,ebcc0036-5fa4-47d8-aae0-ec348353c0a3 untouched |

Stock movement IDs/times and integration-event counts are not exposed by these controls and remain NOT TESTED; displayed sale timestamps are not mislabeled as movement timestamps. Before/after financial/stock effects have not yet been tested.

## Exact next action and acceptance

1. Obtain action-time consent to open only the LAB one-shot receiver for300seconds and send one virtual provider Trigger Test Order from vendor9344842. Browser policy requires fresh confirmation because this temporarily grants inbound authenticated access; the owner's earlier broad approval does not replace it.
2. Refresh/record the controls above immediately before opening. Send one identified virtual event, not a real customer order. Record provider request/order ID, HTTP result/response and exact times.
3. Refresh receiver status after delivery; expect CONSUMED and automatic lock. Refresh the same controls and require no change. Do not infer a missing financial/stock measurement or retry result.
4. If a callback fails, retain the original request/response and diagnose one bounded cause; do not rotate credentials or repeat the order to manufacture evidence.
5. Authentication, real callback payload compatibility, one-shot consumption, retry/expiry and physical Pelican/production certification remain NOT TESTED until observed. The provider says this test shop cannot exercise actual Pelican/customer-platform flow.
6. Publish the actual bounded result with the required manual/roadmap/PDF updates if a real scoped PASS is obtained. Keep this owner; no other page may take this efood scope without merged handoff.

## Limits

No code, runtime configuration other than the owner's recorded credential setup, schema migration or source behavior changed. No stock/order/sale/payment/fiscal/myDATA writes or real-store action were performed by this continuation. TODAY, Archive, general Gate6, TABLE_SERVICE and installation scopes stay with their existing owners. Snapshot capture of the source tab failed; a full-page image was rejected by automatic approval review because it could expose the live secret. The safer clipped status image also timed out. No screenshot or credential was persisted for this preflight. Existing safe setup image contains an empty secret field, not an authentication proof.
