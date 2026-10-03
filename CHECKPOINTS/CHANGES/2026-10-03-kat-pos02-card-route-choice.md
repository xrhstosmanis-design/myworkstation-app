# KAT Ταμειακή 2 CARD route choice

Date: 2026-10-03

For the currently tested fiscal register 2, pressing CARD now requires a choice before fiscal checkout: POS ΚΑΤΑΣΤΗΜΑΤΟΣ (immediate STORE path) or POS DELIVERY (DELIVERY_DELAYED path). The choice is carried in operationChannel and therefore feeds the existing STORE/DELIVERY routing. CASH is untouched.
