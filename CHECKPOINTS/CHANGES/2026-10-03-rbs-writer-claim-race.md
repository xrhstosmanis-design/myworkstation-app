# RBS Writer claim race root cause

Date: 2026-10-03

Controlled KAT cash checkout reached fiscal pending successfully, while C:\\capture stayed empty and Writer remained ONLINE. Inspection of the Writer /next endpoint found that each poll first converted PREPARED requests older than 60 seconds to REQUIRES_CHECK, then selected only PREPARED rows. A valid request delayed by Render latency or polling could therefore become unclaimable before the Writer saw it. The pre-claim expiry mutation is removed: PREPARED remains claimable until an actual Writer claim. Writer/CAPDriver command bytes, AURORA, VAT departments and payment mappings are unchanged.
