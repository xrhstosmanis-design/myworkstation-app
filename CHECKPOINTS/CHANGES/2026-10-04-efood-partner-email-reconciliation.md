# efood / Pelican — email reconciliation and LAB continuation

Date: 2026-10-04
Owner: current efood continuation, `agent/efood-partner-lab-20261004`
Status: ASSIGNED / BLOCKED AT WEBHOOK CREDENTIAL SETUP; provider Trigger Test Order NOT TESTED.

## Assignment

ΑΝΑΛΗΨΗ ΑΠΟ εξειδικευμένη σελίδα efood/Pelican Phase A / feat/efood-lab-safe-webhook-window — ASSIGNED agent/efood-partner-lab-20261004.

The owner explicitly requested completion of the efood pending work and approved browser Gmail review. TODAY-02–09, general Gate 6, TABLE_SERVICE, fiscal, installation and other claimed scopes are outside this assignment. No source, runtime configuration or test event was changed in this read-only reconciliation.

## Evidence

Read the 16-message “Αίτημα τεχνικής διασύνδεσης efood με MyWorkStation POS / BackOffice” conversation and the earlier 3-message “Υλοποίηση Διασύνδεσης API - Il kiosk 24” conversation. Searched all folders (including sent/archive/spam/trash) for efood, Pelican, Delivery Hero, API, webhook, callback and the test vendor. Relevant technical threads contain documentation links and no technical file attachments. Catalog spreadsheets for real shops are outside this LAB test.

Provider reply 24/09 12:21 Athens confirms:
- Dedicated test shop “Test shop MyWorkStation POS”, vendor 9344842, chain 3d848f43-4022-4b13-93aa-d1d9629352b3.
- Existing API credentials are active. No additional external partner config ID is expected.
- Use Shops Integrations → View Production → Settings → API → Order Webhook Settings; save callback settings, activate and use Trigger Test Order.
- The test shop is not listed on the customer platform. Testing is virtual; Pelican itself cannot be exercised for this shop.
- The OAuth Bearer-token example answers API authentication, not the separate receiver Authorization secret. Do not reuse an OAuth token as the webhook secret.

Live read-only UI on 04/10:
- efood Partner is accessible and selects the exact dedicated test shop. Order webhook is disabled; URL/secret setup is absent and Trigger Test Order is disabled.
- Platform Admin exact MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ (cmtpopbgo000trhb5ng9ytiru): stored API credentials indicated, vendor/chain match. One-shot receiver LOCKED. Authorization secret “Δεν έχει δημιουργηθεί”; 5-minute opening disabled.
- External calls / Order / Sale / Stock / Payment / Fiscal are shown ΟΧΙ.
- No sandbox was created, credential rotated, provider webhook saved/activated, window opened or test order triggered. No email was sent.

## Protected evidence and limits

PR1514 merge55f2a53c939cee230bab67b23645fd60555430bc and CI3827/3829/3830 retain their historical implementation evidence. Current main path history shows no later receiver implementation after that change. Prior owner email23/09 reports local mock validation and encrypted credential storage; this is historical reported evidence, not a new independently observed LAB test.

Real provider callback, payload compatibility, one-shot consumption, duplicate/expiry behavior and production certification remain NOT TESTED. Exact current runtime revision and fresh before/after POS-shift/stock baseline must be recorded before a state-changing test. No financial/stock delta is inferred from this read-only review. No new PASS/manual/PDF closure is claimed.

## Single next action

User completes new webhook Authorization credential creation/entry in the exact LAB and dedicated efood test-shop settings. Browser policy requires user handoff for new authentication-credential entry; never request the secret in chat. Leave provider activation and LAB test execution for the supervised continuation, after required exact deploy and fresh baseline evidence. Complete the repository pre-change gate before any source/configuration behavior change. Use only one virtual provider test event; preserve automatic re-lock and zero business writes. Keep the assignment with this continuation until an explicitly named merged transfer.
