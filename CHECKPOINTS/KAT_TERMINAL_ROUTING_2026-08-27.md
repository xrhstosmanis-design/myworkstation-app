# KAT terminal routing — installation blocker

Status: REQUIRED BEFORE KAT LIVE INSTALLATION

## Locked physical topology
- Fiscal register 1: two EFTPOS terminals; immediate/non-delayed flow only.
- Fiscal register 2: used by normal POS sales and Delivery; delayed transaction flow available/required for delivery routing.

## Mandatory online-order rule
Every order originating from the MyWorkStation online ordering site must, at commercial completion, be routed to fiscal register / POS terminal 2 and use the delayed transaction flow. The operator must not be able to accidentally route an online order to fiscal register 1.

## Safety invariants
- Exactly one Sale per OnlineOrder.
- Exactly one fiscal receipt attempt per commercial completion idempotency key.
- Exactly one payment posting.
- Exactly one stock deduction / stock movement set.
- Retry/reload must not duplicate sale, receipt, payment or stock.
- Terminal 1 behavior must remain unchanged.
- Manual terminal-2 normal sales and Delivery must remain distinguishable in audit/reporting.

## Implementation rule
Do not hard-code by UI label alone. Resolve routing through the existing authenticated terminal identity (`terminalPos`) and store-scoped configuration. Online completion must fail closed if the configured delayed terminal cannot be resolved.

## Required tests before merge
1. Terminal 1 + either of its two EFTPOS devices -> immediate flow.
2. Terminal 2 normal manual sale -> configured normal flow.
3. Terminal 2 Delivery manual sale -> delayed flow.
4. Online order -> terminal 2 delayed flow automatically.
5. Online order cannot be completed on terminal 1.
6. Retry same online completion -> no duplicate Sale/payment/stock/fiscal request.
7. EFTPOS success, failure and cancellation.
8. Real RBS receipt/provider test during installation.

No merge/deploy until tests pass and explicit approval is given.
