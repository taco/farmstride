# ADR 004: AI Feature Architecture

**Status:** Accepted
**Date:** 2026-03-12

## Context

FarmStride uses LLMs for two features: voice session parsing (transcribe audio → extract structured data) and horse summary generation. Both call external APIs (OpenAI) with costs per request. Without guardrails, it's easy to accidentally use expensive models, skip rate limiting, or scatter prompt strings across the codebase where they can't be versioned or compared.

We needed a pattern that makes it easy to add new AI features while enforcing cost discipline and operational safety by default.

## Decision

AI features follow three interlocking conventions:

### 1. Prompt registry

Every AI prompt is a `PromptConfig` object — a self-contained unit with model selection, system prompt builder, and response schema. Configs are versioned (`v1`, `v2`) and exported from a central registry indexed by feature and version.

```
PromptConfig {
  model: string              // default model ID
  modelEnvVar: string        // e.g., "VOICE_PARSE_MODEL" — runtime override
  buildSystemPrompt(ctx)     // function that returns the system prompt
  schema: ZodSchema          // structured output validation
}
```

This means prompts are:

- **Versionable.** v1 and v2 can coexist. Switching versions is a one-line change.
- **Testable.** A prompt config can be unit tested (does it build the right prompt for these inputs?).
- **Auditable.** `grep PromptConfig` finds every AI prompt in the system.

### 2. Model tiers with floor-by-default

Models are grouped into three cost tiers (Floor, Mid, Full) documented in the AI guidelines. The rule: **start at Floor tier and only upgrade when you have evidence it's insufficient.** Every feature has a `<FEATURE>_MODEL` env var that overrides the default, allowing per-environment tuning without code changes.

This prevents the common pattern of defaulting to the most capable (expensive) model "just in case." Some features stay at Floor (horse summaries); others need Full tier after testing shows Floor is insufficient (voice parsing required Full for reliable transcript interpretation). The env var override makes this upgrade path a config change, not a code change.

### 3. Mandatory rate limiting

Every AI endpoint wraps its handler in `withAiRateLimit()`, which enforces both burst limits (requests per minute) and daily caps. The rate limiter is shared across AI endpoints — a single rider can't exhaust the budget on one feature and starve another.

Rate limiting is applied at the HTTP handler level (not in the prompt config) because it's an operational concern, not a prompt concern. The handler decides the limits; the prompt config decides the model and prompt.

### Why REST endpoints for AI features

AI features use REST endpoints, not GraphQL mutations. Voice parsing requires multipart file upload (audio blobs), which is awkward over GraphQL. Summary generation could be GraphQL but uses REST for consistency — all AI features share the same rate-limiting middleware pattern, and REST makes streaming responses straightforward if needed later.

The criteria for "when REST": if the operation involves file uploads, streaming, or is a pipeline (transcribe → parse → resolve) rather than a simple CRUD mutation.

## Alternatives considered

**Inline prompts in handlers.** Embed the prompt string, model, and parsing logic directly in the route handler. Simpler for one feature, but by the second feature you're duplicating model resolution, rate limiting, and response validation. The registry pays for itself at two features.

**LangChain / AI framework.** Use a framework that handles prompt templating, model routing, and output parsing. Rejected because the abstraction is heavier than the problem — we have two features, each with a system prompt and a Zod schema. LangChain's chain/agent abstractions add concepts we don't need. If we add retrieval-augmented generation or multi-step agents, a framework becomes more attractive.

**Single model, no tiers.** Pick one model and use it everywhere. Simpler config, but ignores a 10-50x cost difference between tiers. Voice parsing (structured extraction from short text) doesn't need the same model as open-ended reasoning. Tiering is the simplest cost optimization available.

**No rate limiting (rely on API provider limits).** OpenAI has its own rate limits, so why add ours? Because provider limits are per-API-key (shared across all users), not per-rider. One rider hammering the voice endpoint could exhaust the key's quota for everyone. App-level limits give per-rider fairness and cost predictability.

**GraphQL mutations for all AI features.** Use `mutation { parseSession(audio: Upload!) { ... } }` with graphql-upload. Technically possible, but graphql-upload adds middleware complexity, file size validation is less ergonomic, and streaming responses aren't supported. REST is the natural fit for operations that aren't "read or write a resource."

## Consequences

- Adding a new AI feature requires: a `PromptConfig`, an env var for model override, and wrapping the handler in `withAiRateLimit()`. This is ~3 files of boilerplate, but it ensures the feature inherits cost controls and operability.
- Model upgrades are config changes (env var or prompt config), not code changes. This makes A/B testing trivial.
- Rate limits are in-memory (per-process). In a multi-instance deployment, each instance maintains its own counters — effective burst limiting degrades to `limit × instance_count`. If this becomes a problem, rate limiting would need to move to Redis or a shared store.
- The prompt registry doesn't handle multi-step chains (e.g., "summarize, then critique, then refine"). Each config is a single LLM call. Multi-step workflows would compose configs at the handler level.
