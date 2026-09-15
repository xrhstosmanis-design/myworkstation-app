# Mandatory repository-wide checkpoint gate — 2026-09-15

## Reason

Repeated changes were made from partial conversation context while the active list contained unresolved and sometimes contradictory historical checkpoints. CI results were treated too close to runtime validation, causing regressions in behavior that had previously passed LAB.

## Rule

Before any repository behavior change, every agent must read:

- `AGENTS.md`
- the complete active checkpoint list
- every relevant linked checkpoint
- current `main` history since the last verified LAB result

The agent must classify evidence as `LAB PASS`, `LAB FAIL`, or `NOT TESTED`, reconcile contradictions, identify protected working behavior and define the single bounded change before editing.

## Completion discipline

- Update the active list and relevant checkpoint before PR.
- Require green CI and exact deployed-revision verification.
- Report `AWAITING LAB` until the actual acceptance test passes.
- Stop rather than edit when required history or evidence is unavailable.

## Safety invariants

During diagnostics, never duplicate or alter an existing invoice payment, resurrect a deliberately deleted draft, post stock, finalize an invoice, or change fiscal/accounting state unless an explicit checkpoint authorizes that exact action.

## Scope

This rule applies repository-wide to all pages, modules, conversations and agents.
