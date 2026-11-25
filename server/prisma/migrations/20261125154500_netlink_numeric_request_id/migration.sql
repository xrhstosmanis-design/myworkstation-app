-- Additive, bounded numeric provider tracing IDs. Existing encrypted intents and
-- uncertain provider requests must never be rewritten or automatically retried.
CREATE SEQUENCE IF NOT EXISTS "NetlinkPaidProviderRequestSeq" AS INTEGER MINVALUE 1 MAXVALUE 2147483647 START WITH 1790000000 NO CYCLE;
