export function createRemoteTrialGate(env, now = Date.now()) {
  const terminalId = String(env.REMOTE_AGENT_TRIAL_TERMINAL_ID || '').trim();
  const until = Date.parse(env.REMOTE_AGENT_TRIAL_UNTIL || '');
  const configured = env.REMOTE_AGENT_ENABLED === 'true' && terminalId.length > 0 && terminalId.length <= 100 && Number.isFinite(until) && until > now && until <= now + 30 * 60_000;
  return {
    enabled: (time = Date.now()) => configured && time < until,
    acceptsTerminal: (id, time = Date.now()) => configured && time < until && id === terminalId
  };
}
