import {
    context,
    SpanKind,
    SpanStatusCode,
    trace,
    type Attributes,
    type Span,
} from '@opentelemetry/api';
import { getRPCMetadata } from '@opentelemetry/core';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import type OpenAI from 'openai';
import type { PromptConfig } from '@/prompts/types';

// GenAI semantic conventions (semconv 1.43, incubating). Inlined because the
// package's `/incubating` entry point needs a newer moduleResolution than
// this project's `node` setting; the strings are the stable public contract.
const ATTR_GEN_AI_OPERATION_NAME = 'gen_ai.operation.name';
const ATTR_GEN_AI_PROVIDER_NAME = 'gen_ai.provider.name';
const ATTR_GEN_AI_REQUEST_MODEL = 'gen_ai.request.model';
const ATTR_GEN_AI_RESPONSE_FINISH_REASONS = 'gen_ai.response.finish_reasons';
const ATTR_GEN_AI_RESPONSE_ID = 'gen_ai.response.id';
const ATTR_GEN_AI_RESPONSE_MODEL = 'gen_ai.response.model';
const ATTR_GEN_AI_USAGE_INPUT_TOKENS = 'gen_ai.usage.input_tokens';
const ATTR_GEN_AI_USAGE_OUTPUT_TOKENS = 'gen_ai.usage.output_tokens';
const GEN_AI_PROVIDER_NAME_VALUE_OPENAI = 'openai';

/**
 * FarmStride attributes for spans. Namespaced under `herdbook.` because bare
 * `session.id` collides with OTel's browser-session convention; the wire
 * names move to `farmstride.` in #159. Opaque IDs only: never names,
 * emails, notes, or prompt/completion text.
 */
export const HERDBOOK_ATTR = {
    RIDER_ID: 'herdbook.rider.id',
    BARN_ID: 'herdbook.barn.id',
    HORSE_ID: 'herdbook.horse.id',
    SESSION_ID: 'herdbook.session.id',
    PROMPT_NAME: 'herdbook.prompt.name',
    PROMPT_VERSION: 'herdbook.prompt.version',
    // Voice parse: input shape and what the AI managed to extract.
    AUDIO_BYTES: 'herdbook.audio.bytes',
    AUDIO_MIME_TYPE: 'herdbook.audio.mime_type',
    TRANSCRIPT_CHARS: 'herdbook.transcript.chars',
    PARSE_HORSE_RESOLVED: 'herdbook.parse.horse_resolved',
    PARSE_RIDER_RESOLVED: 'herdbook.parse.rider_resolved',
    PARSE_FIELDS_EXTRACTED: 'herdbook.parse.fields_extracted',
    // Horse summary: how often the first prompt passes validation.
    SUMMARY_ATTEMPT: 'herdbook.summary.attempt',
    SUMMARY_ATTEMPTS: 'herdbook.summary.attempts',
    SUMMARY_VALID: 'herdbook.summary.valid',
} as const;

/**
 * gen_ai.operation.name values we emit. `transcription` is ours: the
 * convention has no audio value yet.
 */
export type GenAiOperation = 'chat' | 'transcription';

/** The prompt a GenAI span was built from, for spotting bad prompt rollouts. */
export type PromptIdentity = Pick<PromptConfig<never>, 'feature' | 'version'>;

const tracer = trace.getTracer('herdbook-api');

export interface DomainIds {
    riderId?: string | null;
    barnId?: string | null;
    horseId?: string | null;
    sessionId?: string | null;
}

/**
 * Set attributes on the current span and on the request's root HTTP span,
 * so they can be queried without relational (`any.`) prefixes in Honeycomb.
 */
export function setRequestAttributes(attributes: Attributes): void {
    const active = trace.getActiveSpan();
    active?.setAttributes(attributes);
    const rootSpan = getRPCMetadata(context.active())?.span;
    if (rootSpan && rootSpan !== active) {
        rootSpan.setAttributes(attributes);
    }
}

/** Tag the current request with the tenant entities it touched. */
export function setDomainAttributes(ids: DomainIds): void {
    const attributes: Attributes = {};
    if (ids.riderId) attributes[HERDBOOK_ATTR.RIDER_ID] = ids.riderId;
    if (ids.barnId) attributes[HERDBOOK_ATTR.BARN_ID] = ids.barnId;
    if (ids.horseId) attributes[HERDBOOK_ATTR.HORSE_ID] = ids.horseId;
    if (ids.sessionId) attributes[HERDBOOK_ATTR.SESSION_ID] = ids.sessionId;
    if (Object.keys(attributes).length > 0) setRequestAttributes(attributes);
}

export interface GenAiSpanOptions {
    operation: GenAiOperation;
    model: string;
    prompt?: PromptIdentity;
}

/**
 * Run an OpenAI call inside a GenAI-convention CLIENT span named
 * `{operation} {model}`. Records model, prompt name/version, and errors.
 * Prompt and completion text are deliberately never attached.
 */
export async function withGenAiSpan<T>(
    options: GenAiSpanOptions,
    fn: (span: Span) => Promise<T>
): Promise<T> {
    const attributes: Attributes = {
        [ATTR_GEN_AI_OPERATION_NAME]: options.operation,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_REQUEST_MODEL]: options.model,
    };
    if (options.prompt) {
        attributes[HERDBOOK_ATTR.PROMPT_NAME] = options.prompt.feature;
        attributes[HERDBOOK_ATTR.PROMPT_VERSION] = options.prompt.version;
    }

    return tracer.startActiveSpan(
        `${options.operation} ${options.model}`,
        { kind: SpanKind.CLIENT, attributes },
        async (span) => {
            try {
                return await fn(span);
            } catch (error) {
                span.setAttribute(
                    ATTR_ERROR_TYPE,
                    error instanceof Error ? error.name : 'Error'
                );
                span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: error instanceof Error ? error.message : undefined,
                });
                throw error;
            } finally {
                span.end();
            }
        }
    );
}

/**
 * Run a chat completion inside a GenAI span tagged with the prompt it was
 * built from, recording the response's model, id, finish reasons, and
 * token usage. The single place OpenAI chat calls should go through.
 */
export function tracedChatCompletion(
    openai: OpenAI,
    prompt: PromptIdentity,
    params: OpenAI.ChatCompletionCreateParamsNonStreaming,
    attributes: Attributes = {}
): Promise<OpenAI.ChatCompletion> {
    return withGenAiSpan(
        { operation: 'chat', model: params.model, prompt },
        async (span) => {
            span.setAttributes(attributes);
            const completion = await openai.chat.completions.create(params);
            span.setAttributes({
                [ATTR_GEN_AI_RESPONSE_ID]: completion.id,
                [ATTR_GEN_AI_RESPONSE_MODEL]: completion.model,
                [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: completion.choices.map(
                    (choice) => choice.finish_reason
                ),
            });
            if (completion.usage) {
                span.setAttributes({
                    [ATTR_GEN_AI_USAGE_INPUT_TOKENS]:
                        completion.usage.prompt_tokens,
                    [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]:
                        completion.usage.completion_tokens,
                });
            }
            return completion;
        }
    );
}
