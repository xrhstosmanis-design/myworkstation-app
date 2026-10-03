# RBS recovery cart state race

Date: 2026-10-03

The already-issued 7UP 330ML €1.20 CASH receipt was restored as DISPATCHED/COMMITTING after refresh but did not reach server continuation. Recovery updated React cart state and immediately called checkout; checkout still observed the old empty cart and returned. Recovery now supplies the reconstructed cart directly to continuation checkout and defers the continuation call. The original fiscal request identifiers are reused and no fiscal command is resent.
