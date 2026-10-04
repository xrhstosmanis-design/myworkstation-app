# efood provider window attempt — 2026-10-04

Owner: same continuation `agent/efood-partner-lab-20261004`.
Status: OPEN / PROVIDER SUBMISSION UNCONFIRMED. No provider authentication or callback PASS.
Recorded at 2026-10-04T18:17:07.210Z.

## Authorized action and observed result

- Owner gave action-time approval at 21:03:38 Europe/Athens for a 300-second LAB window and one virtual order from vendor 9344842.
- Only MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ, store cmtpopbgo000trhb5ng9ytiru; chain 3d848f43-4022-4b13-93aa-d1d9629352b3.
- Refreshed stock and shift controls before opening. LAB transitioned from SECRET_ROTATED to ΑΝΟΙΧΤΟ, with countdown 4:48. External calls / Order / Sale / Stock / Payment / Fiscal remained ΟΧΙ.
- Prepared provider READY_FOR_PICKUP / LOGISTICS_DELIVERY, one product SLL45E (17 Delicatessen Μουστάρδα Πικαντική 250g), UNIT quantity1, default product status IN_CART.
- Role-based click found no match and performed no action. After inspecting the actual DOM button, one CSS-scoped click completed on the enabled provider submit button. The form remained open; no success/error toast, request/order ID or HTTP response was observed. A click is not proof of a transmitted request.
- Provider API Παραγγελιών → Webhook, date20/09–04/10, no ID/status filter: Δεν βρέθηκαν ενημερώσεις after the click. No request was replayed.
- Fresh LAB configuration stayed open, then transitioned to EXPIRED. Closing/reopening the LAB configuration confirmed EXPIRED. No CONSUMED/event ID was observed. This confirms UI expiry/locked acceptance; actual rejected-expiry response, authentication and consumption remain NOT TESTED.
- Exact action/request timestamps are not exposed by these controls; the action-time approval is known, but no exact server request time is invented.
- Console errors concerned Perseus telemetry / browser metadata. They are not attributed to the order request; root cause remains unconfirmed.
- Reopened provider settings through the normal UI. Stored webhook remains active. A fresh form is now prepared with the same status/delivery/product/quantity; submit enabled, no second submission or window.
- The footer submit button is outside the HTML form and has no form association attribute. This is a candidate UI cause only: JavaScript click handling was not inspected. A keyboard submit from the quantity field is the proposed bounded next action after fresh access approval.
- Documentation base `6050e3d4d5ef90ec5477f257d8d093934f8a0ea6` contains PR1703 preflight; PRCI4278/mainCI4279 succeeded. No runtime source, schema, credentials or real-store setting changed in this attempt.

## Refreshed before / after controls

| Control | Before | After |
| --- | --- | --- |
| MAIN | 2 transactions; cash2.40 EUR; cards/IRIS combined0; total2.40 EUR; latest01/10 12:51 Athens | Same |
| LAB-POS-02 | 2 transactions; cash0; cards0; IRIS0; total0; expenses120 EUR; latest— | Same |
| LAB EXCEL TEST1 | stock11; SKU LAB-EXCEL-20260909-01; product b1466a68-c47b-47cc-9139-69e6f9f7f978; last displayed sale01/10/2026 12:51:17 Athens | Same |
| LAB EXCEL TEST2 | stock−2; SKU LAB-EXCEL-20260909-02; product caec7ad6-a460-4c71-951f-95a10d943ebf; last displayed sale01/10/2026 12:51:17 Athens | Same |

These are unchanged controls for an unconfirmed submission, not proof of callback business-effect isolation. Stock movement IDs/times, integration-event counts and provider HTTP result remain NOT TESTED. Historical offline/bank queues were not acted on.

## Bounded continuation

Inspect the newly reopened provider form and, if a further attempt is needed, obtain fresh action-time approval for its separate 300-second LAB window. A normal keyboard form submission may be tried if the footer button does not submit; do not modify the provider page, invoke hidden endpoints, extract credentials or synthesize a provider payload. Record every attempt and require an actual provider delivery/response and LAB consumption before any callback PASS.

Do not alter receiver/source based only on the absence of a delivery. Do not repeat the historical mock. Pelican/production certification remains NOT TESTED. The efood claim remains with this owner; TODAY, Archive, general Gate6, installation and TABLE_SERVICE stay with their owners. No manual/PDF PASS closure is warranted.
