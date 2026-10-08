# Documentation-only deployment-policy probe - 08/10/2026

Owner: codex/pos-startup-loading-20261008, within already published POS-DB-LOCK-01 deployment-gating claim PR1933 and source PR1934.

This documentation-only commit is the controlled acceptance input for the deployed policy. It changes no application, workflow, configuration, data, permissions or other owner assignment. It must merge only after main full CI succeeds and the pinned hook has changed the actual service to Auto-Deploy Off.

Expected observation: docs CI classifies this change without a full build, the guarded Render workflow classifies deploy_required=false, and Render creates no deployment for this probe's main merge SHA. The ongoing source deployment and exact-health verification must not be cancelled by this documentation run. Observation is NOT TESTED when this file is prepared; the final result, timestamps and revisions belong in CHECKPOINTS/CHANGES/2026-10-08-pos-single-deployment.md, synchronized active/pending/tracker/PDF and the deployment manual after actual acceptance. This file is neither a PASS closure nor a capacity claim.

No POS search, sale, payment, waste, stock, shift action, extra deployment, SQL cancellation or restart is part of the probe. Previous USER PASS and all other owners remain protected.
