const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

// Provider-reported token usage only. Never logs questions, audio, credentials or invented prices.
export function aiCommandUsage(raw, inputChannel = "text", fallbackModel = "") {
  const usage = raw?.usage;
  const tokens = usage && typeof usage === "object" ? {
    inputTokens: count(usage.input_tokens),
    outputTokens: count(usage.output_tokens),
    totalTokens: count(usage.total_tokens)
  } : null;
  return {
    feature: inputChannel === "voice" ? "VOICE_ASSISTANT" : "COMMAND_CENTER",
    provider: "openai",
    model: typeof raw?.model === "string" ? raw.model : fallbackModel,
    tokens
  };
}
