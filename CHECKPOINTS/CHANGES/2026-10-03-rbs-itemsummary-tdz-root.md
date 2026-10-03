# RBS itemSummary TDZ root fix

Date: 2026-10-03

Production test after 5b3b293c still logged ReferenceError: Cannot access 'itemSummary' before initialization at store-pos.js before Writer claim. Root cause is the checkout chained const declaration. Initialization is split into explicit ordered statements so itemSummary exists before summary consumes it. No Writer, CAPDriver, AURORA, VAT department or payment mapping changes. Physical retest remains blocked until green CI and exact production deploy.
