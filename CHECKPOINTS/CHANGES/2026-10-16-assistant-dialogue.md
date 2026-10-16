## 16/10/2026 — VOICE-ASSISTANT-01 / TRANSFER DIALOGUE IMPLEMENTED / AWAITING CI AND LIVE

Same retained owner. Claim PR2564/c62c0da3 merged075b54e0 after applicable CI38887057898 succeeded. Source correction follows the published bounded scope: recognize short owner-direction fragments only within an existing transfer topic; carry latest direction across date and export follow-ups; retain original actor/status filters; refuse inheritance across unrelated reports. Add στις/σε to period-only vocabulary and strict direct transfer vocabulary. Existing source SQL, permissions, provider/model/key, schemas, money arithmetic, source caps and export replay untouched. No production business mutation or transaction replay.

Synthetic regression reproduced all three gaps before correction. New four tests pass, including actual Owner and Platform scoped source execution and negative unrelated-topic/filter-retention cases. Existing targeted43PASS/0FAIL/0SKIP before final both-role test addition; frontend build and TABLE_SERVICE verification PASS. Full local Node20 suite running. Full mandatory PR/main native CI and ordinary exact guarded release still required; new hosted acceptance NOT TESTED. Whole VOICE OPEN, operator-name inflection remains next bounded task, not fixed by this change. Checkpoint `CHECKPOINTS/CHANGES/2026-10-16-assistant-dialogue.md`.

## 16/10/2026 — VOICE-ASSISTANT-01 / DIALOGUE CORRECTION / ASSIGNED

Same owner `codex/assistant-business-queries-20261015`; source branch `fix/assistant-dialogue-20261016`. User approved continuing assistant corrections. Whole VOICE remains OPEN. Other owners and earlier qualified evidence are preserved.

Bounded source scope: transfer-direction fragments in an existing transfer conversation; latest date follow-ups; preserve inherited filters and refuse unrelated-topic inheritance. Add the date preposition στις to the strict unfiltered vocabulary. Reproduce with synthetic dialogue FROM -> TO clarification -> next-day question; no real business records in fixtures or public evidence. Actor inflection remains a separate next task.

Keep provider/model/key, source SQL, schemas, permissions, licensing, selected-store scope, money arithmetic, 500-row cap, exports and existing sales/stock/cash/consumption behavior unchanged. No production transaction or replay. Require focused regressions, full PR/main CI, ordinary guarded exact release and subsequent read-only acceptance. This claim must merge before source edits. No new whole-assistant PASS. Checkpoint `CHECKPOINTS/CHANGES/2026-10-16-assistant-dialogue.md`.

