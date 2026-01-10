export const OPENROUTER_PRICING_USD_PER_TOKEN: Record<
  string,
  { readonly input: number; readonly output: number }
> = {
  // Source: https://openrouter.ai/api/v1/models (pricing.prompt / pricing.completion)
  "google/gemini-3-flash-preview": { input: 0.0000005, output: 0.000003 },
  "x-ai/grok-4.1-fast": { input: 0.0000002, output: 0.0000005 },
}

export const calculateOpenRouterCostUsd = (
  model: string,
  inputTokens: number,
  outputTokens: number
): number => {
  const pricing = OPENROUTER_PRICING_USD_PER_TOKEN[model]
  if (!pricing) return 0
  return inputTokens * pricing.input + outputTokens * pricing.output
}
