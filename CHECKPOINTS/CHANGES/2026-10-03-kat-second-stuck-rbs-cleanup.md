# Clear second pre-finalizer RBS request

Date: 2026-10-03

Request ab2e2a5a-127b-442d-97c9-8d739b1adf8c physically printed before the server-side finalizer existed and remains DISPATCHED with saleId NULL. The existing guarded startup cleanup is retargeted to this exact request so it can be marked DECLINED without any fiscal resend before a clean finalizer test.
