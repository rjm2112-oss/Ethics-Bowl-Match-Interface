"use strict";

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
                    schema: request.jsonSchema.schema
                };
            }
            if (request.reasoningEffort) body.output_config.effort = request.reasoningEffort;
        }

        const response = await postJsonWithRetries({
            fetchImpl,
            url: MESSAGES_URL,
            headers: {
                "x-api-key": apiKey,
                "anthropic-version": ANTHROPIC_VERSION
            },
            body,
            retryStatuses: RETRY_STATUSES,
            sleep,
            requestTimeoutMs
        });
        if (!response.ok) throw await createApiError(response);

        let data;
        try { data = await response.json(); } catch { throw new Error("The AI provider returned an unreadable response."); }
        const stopReason = detectIncompleteResponse(data);
        if (stopReason === "max_tokens") {
            if (allowOutputBudgetRecovery) {
                return generate({
                    ...request,
                    maxTokens: Math.min(12000, Math.max(request.maxTokens + 1200, Math.round(request.maxTokens * 1.5))),
                    reasoningEffort: "low"
                }, apiKey, false);
            }
            throw new Error("The model reached its output-token limit before completing the response.");
        }
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
    extractText
};
