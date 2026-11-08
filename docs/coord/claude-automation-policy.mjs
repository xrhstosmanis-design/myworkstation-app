// Inactive, pure policy evaluator for future Claude automation.
// Does not call GitHub, Claude, Render or any external service.
export const TASKS = Object.freeze([
  "INVOICE-OWNER-FINALIZATION-01",
  "AUTO-REPORT-OBSERVABILITY-01",
  "OCR-CONFIDENCE-01",
  "AI-WALLET-HISTORY-02",
]);

export function validateDispatch(event) {
  if (!event || event.action !== "created" || event.repository?.full_name !== "xrhstosmanis-design/myworkstation-app")
    return { ok: false, reason: "event_or_repository" };
  if (event.issue?.number !== 3714 || event.issue?.pull_request)
    return { ok: false, reason: "wrong_issue" };
  if (event.comment?.user?.login !== "xrhstosmanis-design" ||
      event.comment?.author_association !== "OWNER")
    return { ok: false, reason: "unauthorized_actor" };
  const body = event.comment?.body;
  if (typeof body !== "string") return { ok: false, reason: "invalid_body" };
  const match = /^\/claude-readonly ([A-Z0-9-]+)$/.exec(body);
  if (!match || !TASKS.includes(match[1])) return { ok: false, reason: "invalid_command" };
  return { ok: true, task: match[1] };
}

export function validateMergeCandidate({ draft, merged, state, headSha, checkedSha, checks, baseBranch }) {
  if (draft || merged || state !== "open" || baseBranch !== "main") return { ok: false, reason: "pr_state" };
  if (!/^[a-f0-9]{40}$/.test(headSha ?? "") || headSha !== checkedSha)
    return { ok: false, reason: "stale_head" };
  if (!Array.isArray(checks) || checks.length === 0 || checks.some(c => c !== "success"))
    return { ok: false, reason: "required_checks" };
  return { ok: true };
}
