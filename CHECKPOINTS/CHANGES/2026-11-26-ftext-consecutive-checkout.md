# Ριζάρειο — Διαδοχικές πληρωμές FTEXT

The POS keeps the same checkout payload and transaction ID and waits briefly when checkout explicitly rejects the request before fiscal preparation with FTEXT_REGISTER_NOT_READY. The readiness threshold and fiscal claim checks still apply. Exit on timeout, a changed POS scope, or any other result. Network failures are never replayed by this path.

Local verification covered retry success, identical payload, persistent unavailability, scope changes and network failures. The consecutive receipt scenario on the LAB register is pending.
