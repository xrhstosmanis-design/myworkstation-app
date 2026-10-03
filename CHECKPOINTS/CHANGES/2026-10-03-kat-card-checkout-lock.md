# KAT CARD checkout lock

Date: 2026-10-03

Production mapping is valid for KAT-POS-02: STORE EFTPOS KAT-EFTPOS-02A and DELIVERY EFTPOS KAT-EFTPOS-02B. The picker handoff was being stopped by the shared checkout re-entry lock before the API request. The selected CARD route now explicitly marks its checkout continuation as allowed through that lock. Empty-cart protection remains and CASH is untouched.
