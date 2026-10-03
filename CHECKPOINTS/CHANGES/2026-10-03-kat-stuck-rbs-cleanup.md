# Exact KAT stuck RBS cleanup

Date: 2026-10-03

Production DB read-only verification found the old blocking request c9c6aa5a-5dc3-4fc7-8b29-0728081952ca as KAT-POS-02 / CASH / €1.20 / DISPATCHED / saleId NULL. The user confirmed its physical receipt had already printed and requested cancellation to unblock the POS. A one-time startup cleanup changes only that exact guarded row to DECLINED. No fiscal command is created or resent.
