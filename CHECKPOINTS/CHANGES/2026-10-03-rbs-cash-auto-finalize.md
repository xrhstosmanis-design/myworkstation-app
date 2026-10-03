# RBS CASH automatic finalization after dispatch

Date: 2026-10-03

A clean physical test proved POS -> Writer -> CAPDriver -> RBS receipt issuance. The request then remained DISPATCHED with saleId NULL because the live POS WAITING state did not poll for the Writer's status transition. The POS now polls only the active CASH pending request while WAITING. When it sees DISPATCHED, it continues the same fiscal request and commits the sale, then the existing success path clears the cart. No fiscal resend occurs.
