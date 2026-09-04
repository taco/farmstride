# AI Guidelines

Model selection, pricing, and patterns for FarmStride's AI features.

## Model Tiers

Every AI feature must specify a model tier. Choose the cheapest tier that handles the task reliably.

| Tier      | Default Model | Input $/M | Output $/M | When to use                                                    |
| --------- | ------------- | --------- | ---------- | -------------------------------------------------------------- |
| **Floor** | `gpt-5-mini`  | $0.40     | $1.60      | Structured extraction, summaries, simple JSON from clear input |
| **Mid**   | `gpt-5`       | $1.25     | $10.00     | Complex synthesis, nuanced language generation, coaching tone  |
| **Full**  | `gpt-5.2`     | $1.75     | $14.00     | Ambiguous multi-field parsing, voice transcript interpretation |

### Retired models — do not use

| Model          | Replaced by  | Notes                                                          |
| -------------- | ------------ | -------------------------------------------------------------- |
| `gpt-4o-mini`  | `gpt-5-mini` | Validation scripts may still reference it; update when touched |
| `gpt-4o`       | `gpt-5`      |                                                                |
| `gpt-4.1-mini` | `gpt-5-mini` |                                                                |
| `gpt-4.1`      | `gpt-5`      |                                                                |
| `gpt-4.1-nano` | —            | Too weak for production tasks                                  |
| `gpt-5-nano`   | —            | Evaluate if a nano-tier need arises; don't default to it       |

### Current feature assignments

| Feature               | Tier  | Model        | Env Override             | Prompt                           | Endpoint                      |
| --------------------- | ----- | ------------ | ------------------------ | -------------------------------- | ----------------------------- |
| Voice transcription   | —     | `whisper-1`  | `VOICE_TRANSCRIBE_MODEL` | —                                | `src/rest/parseSession.ts`    |
| Voice parse           | Full  | `gpt-5.2`    | `VOICE_PARSE_MODEL`      | `src/prompts/voiceParse.v2.ts`   | `src/rest/parseSession.ts`    |
| Horse summary         | Floor | `gpt-5-mini` | `SUMMARY_MODEL`          | `src/prompts/horseSummary.v1.ts` | `src/rest/generateSummary.ts` |
| Enrichment extraction | Floor | `gpt-5-mini` | `ENRICHMENT_MODEL`       | TBD                              | TBD                           |

All paths relative to `packages/api/`.

## Patterns

### Prompt registry

All AI prompts live in `packages/api/src/prompts/` as versioned `PromptConfig<T>` objects. Every prompt specifies:

- `model`: default model (must be from active tiers above)
- `modelEnvVar`: env var override for A/B testing or cost adjustment
- `buildSystemPrompt(ctx)`: context-aware prompt builder
- `schema`: JSON schema for structured output

Use `resolveModel(config)` to get the runtime model (checks env var, falls back to default).

### Env var override convention

Every feature gets a `<FEATURE>_MODEL` env var. This allows changing models in production without code deploys. Name them consistently:

- `VOICE_PARSE_MODEL`
- `SUMMARY_MODEL`
- `ENRICHMENT_MODEL`

### Rate limiting

All AI endpoints use the shared `withAiRateLimit()` wrapper with burst + daily buckets. New AI features must be rate limited.

### Tracing

Every OpenAI call goes through `tracedChatCompletion()` (chat) or `withGenAiSpan()` (anything else) from `packages/api/src/utils/tracing.ts`. The span follows the GenAI semantic conventions: model, token usage, response id, finish reasons, plus `herdbook.prompt.name`/`herdbook.prompt.version` so a bad prompt rollout shows up as a step-change in Honeycomb. Prompt and completion text are never recorded.

### Cost estimation

`packages/api/scripts/voiceCost.ts` exports `estimateCost(model, usage)` for logging per-call costs. Use this in development and testing. Keep `MODEL_PRICING` in that file up to date when adding models.

## Cost Rules

1. **Never skip model selection** — every AI call must have an explicit tier choice with rationale
2. **Default to Floor** — use `gpt-5-mini` unless you can articulate why it's insufficient
3. **Validate before upgrading** — if Floor fails, test with real data before moving to Mid/Full
4. **Log token usage** — all AI calls record prompt/completion tokens on their trace span (see Tracing) for cost monitoring
5. **Background extraction is always Floor** — if the user doesn't see the AI working (enrichment, backfill), use the cheapest model that works
