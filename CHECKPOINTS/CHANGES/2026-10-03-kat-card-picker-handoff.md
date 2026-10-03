# CARD picker checkout handoff

Date: 2026-10-03

Physical UI test proved the terminal picker itself works but the selected route did not start checkout. The picker now invokes a dedicated checkoutCardRoute(channel), snapshots the active cart, and calls checkout directly with the selected COUNTER or DELIVERY_DELAYED channel. No fiscal request is created before selection; CASH is unchanged.
