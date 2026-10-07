# No16 — task responsible person — AWAITING LAB

Same page owner codex/n16-chat-acceptance-20261007 (merged takeover PR1837); implementation branch codex/n16-task-assignment-20261007. Owner authorizes completion of No16 and fictional LAB tests. Scope: responsible employee assignment/unassignment only; no new Chat message, task, sale, stock, payment, fiscal or AI Reader action needed.

## Pre-change gate and protected evidence

Base main d394478fa8ebc2a8daaf698f8524e5cba0ea02f2. Read AGENTS, complete active list, current tracker/pending/manual, relevant Chat checkpoints11–13Sep/01Oct/07Oct and main history since latest operator LAB17:45:50Z. Latest merged operator result PR1844/CI4625 supersedes older untested important paths; SA controls PR1839/1841 are protected. LAB PASS: existing send/search/explicit per-user reads/files/settings/acknowledgement/task creation, SA pin/important/message/task completion and reopen, operator important/unmark with reads0 preserved. NOT TESTED: assignment (schema/API had no field), Owner live/adversarial role/tenant, logout/multiple devices, actual background Push/sound/terminal. No new LAB FAIL inferred from source inspection or mocked test.

## Bounded implementation

Nullable StoreChatTask assigneeEmployeeId, assignedBy, assignedAt are added via the existing additive startup Chat schema initializer. Owner or Platform Super Admin can select active Employee in the exact store; user/operator credentials are not Employee IDs. Operator/ordinary employee cannot assign. GET messages returns manager-only eligible id/fullName list; all scoped Chat viewers see assigned name. No employee email/phone returned. Existing task/message completion remains separate and retains assignment. No pending-center status/Push sender/worker/auth/fiscal/build configuration change.

PATCH accepts either the legacy completed boolean or assigneeEmployeeId (null removes assignment), never both. It locks the scoped task and eligible employee/store rows, updates assignment and WorkforceAudit in one transaction. Same assignee is an idempotent no-op; invalid/inactive/foreign employee fails without writes. Audit includes previous/current assignee and authenticated actor. Unassignment retains latest assignment-action actor/time. No automatic notification/message is sent.

Route-handler negative test exposed storeFor returning Express response instead of null on rejection: callers could continue after 404. Changed rejected branches to send response then return null, protecting all existing Chat caller early returns. This is source/test finding, not measured production breach or LAB FAIL. No access is expanded.

UI displays responsible person and manager-only select. Clicking or keyboard-operating assignment stops propagation, preserving explicit unread-message opening. Saving disables assignment selectors; failures display error and reload uses authoritative server fields. Inactive/moved prior assignee remains visible with fallback and can be removed/replaced.

## Verification and acceptance boundary

Node20 isolated actual-route-handler tests: owner/SA assignment, reassignment/unassignment/idempotency; operator/employee403; foreign company/operatorstore/task404; inactive/foreign/nonexistent employee400; malformed/mixed input400; audit rollback; complete/reopen keeps assignee; manager-only minimal eligible list.9/9 PASS. Existing foundation/pending-center/Push-routing/Apple policy regression coverage retained (15 existing tests, total24 focused). These use an isolated database double, not live PostgreSQL/LAB acceptance. Full GitHub CI/build/invariants/isolated E2E and exact deployed revision required before LAB.

After green CI/merge/exact health: same existing LAB task chat-task-1791393082635-c4vy05z23ea/messagechat-1791392960195-p5hevl1gnw. Refresh and record eligible employees, task/assignment/message/read/audit counts and all22financial groups/2open shifts/controlstore BEFORE each action. One assignment, change and removal with expected one audit per actual change, same task/status/message/counts/financial/control, visible correct assignee after reload; operator sees name without select, explicit read remains unchanged. Complete/reopen regression only justified by new assignee preservation, no task recreation. Owner/adversarial live checks remain separately scoped; no mock-as-LAB PASS. Publish actual PASS in manual/active/pending/tracker/checklist/PDF after measured acceptance. Overall16 OPEN;17/other owners/#27 fixtures untouched. PR/CI/merge tracked by associated PR.

## Main reconciliation before merge

PR1846/head d04a2ae00e0b8d96b50926a0a458d52ee5b52204 full CI4631/run37663413537 SUCCESS (all3jobs, full build/tests/invariants/isolated HTTP E2E). Main advanced with PR1845 supplier Greek-timezone date fix to f2bbde13d10e3a33b2702fd1a5309e5c788f4a53. Preserved fresh No19 active/pending/tracker/source/PDF changes, merged only No16 additions; source scopes disjoint. New head requires green full CI again. Local Node20 production build PASS,1875serverPASS/0FAIL/4isolated-DBskip; focused24PASS. Generated unrelated build output and npm lock excluded.
