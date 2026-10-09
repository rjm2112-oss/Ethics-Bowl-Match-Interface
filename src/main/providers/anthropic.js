"use strict";

const { MAX_TEXT_OUTPUT_TOKENS } = require("../../shared/model-catalog");

const {
    createApiError,
    defaultSleep,
    postJsonWithRetries,
    tryParseJson
} = require("./provider-utils");

const MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const RETRY_STATUSES = new Set([429, ...Array.from({ length: 100 }, (_, index) => 500 + index)]);

function extractText(response) {
    if (!Array.isArray(response?.content)) return "";
    return response.content
        .filter((part) => part?.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("")
        .trim();
}

function detectIncompleteResponse(response) {
    const stopReason = String(response?.stop_reason || "").trim().toLowerCase();
    const contentRefusal = Array.isArray(response?.content) && response.content.some((part) => part?.type === "refusal");
    if (stopReason === "refusal" || contentRefusal) throw new Error("The AI provider refused this request.");
    return stopReason;
}

// Claude supports numeric enums, but rejects integer minimum/maximum.
// A finite enum preserves exactly the same official scoring domain.
function encodeBoundedIntegers(schema) {
    if (Array.isArray(schema)) return schema.map(encodeBoundedIntegers);
    if (!schema || typeof schema !== "object") return schema;
    const result = Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, encodeBoundedIntegers(value)]));
    if (result.type === "integer" && Number.isInteger(result.minimum) && Number.isInteger(result.maximum)
        && result.maximum >= result.minimum && result.maximum - result.minimum <= 1000) {
        const values = Array.from({length: result.maximum - result.minimum + 1}, (_, index) => result.minimum + index);
        result.enum = Array.isArray(result.enum) ? values.filter(value => result.enum.includes(value)) : values;
        delete result.minimum;
        delete result.maximum;
    }
    return result;
}

function createAnthropicAdapter({ fetchImpl = globalThis.fetch, sleep = defaultSleep, requestTimeoutMs = 90000 } = {}) {
    if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");

    async function generate(request, apiKey, allowOutputBudgetRecovery = true) {
        const body = {
            model: request.model,
            messages: [{ role: "user", content: request.userPrompt }],
            max_tokens: request.maxTokens
        };
        if (request.systemPrompt) body.system = request.systemPrompt;
        if (request.jsonSchema || request.reasoningEffort) {
            body.output_config = {};
            if (request.jsonSchema) {
                body.output_config.format = {
                    type: "json_schema",
                    schema: encodeBoundedIntegers(request.jsonSchema.schema)
                };
            }
            if (request.reasoningEffort) {
                body.output_config.effort = request.reasoningEffort;
                body.thinking = { type: "adaptive", display: "omitted" };
            }
        }

        const response = await postJsonWithRetries({
            fetchImpl,
            url: MESSAGES_URL,
            headers: {
                "x-api-key": apiKey,
                "anthropic-version": ANTHROPIC_VERSION
            },
            body,
            recordContext:request.recordContext,
            retryStatuses: RETRY_STATUSES,
            sleep,
            requestTimeoutMs: request.requestTimeoutMs || requestTimeoutMs
        });
        if (!response.ok) throw await createApiError(response);

        let data;
        try { data = await response.json(); } catch { throw new Error("The AI provider returned an unreadable response."); }
        const stopReason = detectIncompleteResponse(data);
        if (stopReason === "max_tokens") {
            if (allowOutputBudgetRecovery && request.maxTokens < MAX_TEXT_OUTPUT_TOKENS) {
                return generate({
                    ...request,
                    maxTokens: Math.min(MAX_TEXT_OUTPUT_TOKENS, Math.max(request.maxTokens + 1200, Math.round(request.maxTokens * 1.5)))
                }, apiKey, false);
            }
            throw new Error("The model exhausted its total output-token budget (reasoning plus answer) before completing the response. Partial text was not accepted; reasoning effort was preserved.");
        }
        if (stopReason === "model_context_window_exceeded") throw new Error("The model reached its context-window limit before completing the response. Partial text was not accepted. Use a model with a larger context window or explicitly shorten the case/instructions; the app does not clip the prompt.");
        if (stopReason !== "end_turn") throw new Error(`The AI provider did not complete its turn (${stopReason || "missing stop reason"}). Partial text was not accepted.`);
        const text = extractText(data);
        if (!text) throw new Error("The AI provider returned no text.");
        if (request.jsonSchema) {
            const structured = tryParseJson(text);
            if (!structured || typeof structured !== "object") throw new Error("The AI provider returned no structured JSON.");
            return structured;
        }
        return text;
    }

    return Object.freeze({ generate });
}

module.exports = {
    ANTHROPIC_VERSION,
    MESSAGES_URL,
    createAnthropicAdapter,
    detectIncompleteResponse,
    extractText,
    encodeBoundedIntegers
};
