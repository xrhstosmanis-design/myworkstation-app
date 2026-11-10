# OWNER-SHIFT-TIME-FILTER
Owner /root. Implementation branch: feat/owner-shift-time-filter.
Add optional time to From/To in the shift report. On opening, prefill From with the current Europe/Athens time. Blank times and calendar presets retain whole-day bounds. Verify in existing LAB. Source and LAB pending.

Implemented on feat/owner-shift-time-filter. Opening sets today and current Athens time as the lower bound; the upper bound defaults to end of day. Date presets clear both times. Existing shift overlap semantics retained. Nine existing tests and focused local range assertions passed. CI and LAB pending.
