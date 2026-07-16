"use strict";

const {
    createApiError,
    defaultSleep,
    fetchWithRetries,
    postJsonWithRetries,
    tryParseJson
} = require("./provider-utils");

const RESPONSES_URL = "https://api.openai.com/v1/responses";
const SPEECH_URL = "https://api.openai.com/v1/audio/speech";
const TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";
const RETRY_STATUSES = new Set([429, ...Array.from({ length: 100 }, (_, index) => 500 + index)]);

function extractTextFromOutputItem(item) {
    if (!item || typeof item !== "object") return "";
    let text = "";
    if (typeof item.text === "string") text += item.text;
    if (typeof item.output_text === "string") text += item.output_text;
    if (typeof item.refusal === "string") text += item.refusal;
    if (typeof item.content === "string") text += item.content;
    if (Array.isArray(item.content)) {
        for (const part of item.content) {
            if (typeof part?.text === "string") text += part.text;
            if (typeof part?.refusal === "string") text += part.refusal;
            if (typeof part?.content === "string") text += part.content;
        }
    }
    return text;
}

function extractText(response) {
    if (!response || typeof response !== "object") return "";
    if (typeof response.output_text === "string" && response.output_text.trim()) return response.output_text.trim();
    if (Array.isArray(response.output_text)) {
        const joined = response.output_text.map((item) => typeof item === "string" ? item : (item?.text || "")).join("").trim();
        if (joined) return joined;
    }
    if (typeof response.text === "string" && response.text.trim()) return response.text.trim();
    return (Array.isArray(response.output) ? response.output : []).map(extractTextFromOutputItem).join("").trim();
}

function extractStructuredItem(item) {
    if (!item || typeof item !== "object") return null;
    for (const candidate of [item.parsed, item.json, item.output_json, item.result]) {
        if (candidate && typeof candidate === "object") return candidate;
    }
    if (Array.isArray(item.content)) {
        for (const part of item.content) {
            if (!part || typeof part !== "object") continue;
            for (const candidate of [part.parsed, part.json, part.output_json, part.result]) {
                if (candidate && typeof candidate === "object") return candidate;
            }
            const parsed = tryParseJson(part.text || part.output_text || part.content || part.arguments || "");
            if (parsed && typeof parsed === "object") return parsed;
        }
    }
    const parsed = tryParseJson(item.text || item.output_text || item.content || item.arguments || "");
    return parsed && typeof parsed === "object" ? parsed : null;
}

function extractStructured(response) {
    if (!response || typeof response !== "object") return null;
    for (const candidate of [response.output_parsed, response.parsed]) {
        if (candidate && typeof candidate === "object") return candidate;
    }
    for (const item of Array.isArray(response.output) ? response.output : []) {
        const parsed = extractStructuredItem(item);
        if (parsed) return parsed;
    }
    const parsed = tryParseJson(extractText(response));
    return parsed && typeof parsed === "object" ? parsed : null;
}

function emptyTextError(response) {
    const reason = String(response?.incomplete_details?.reason || response?.status_details?.reason || "").trim();
    const message = String(response?.error?.message || response?.incomplete_details?.message || response?.status_details?.message || "").trim();
    if (reason === "max_output_tokens") {
        return new Error("The model used its output budget before producing visible text. Try a lower reasoning setting or a higher output limit.");
    }
    if (message) return new Error(`The AI provider returned no text: ${message}`);
    if (reason) return new Error(`The AI provider returned no text (${reason}).`);
    return new Error("The AI provider returned no text.");
}

function createOpenAiAdapter({ fetchImpl = globalThis.fetch, sleep = defaultSleep, requestTimeoutMs = 90000 } = {}) {
    if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");

    async function generate(request, apiKey, allowOutputBudgetRecovery = true) {
        const body = {
            model: request.model,
            input: request.userPrompt,
            max_output_tokens: request.maxTokens
        };
        if (request.systemPrompt) body.instructions = request.systemPrompt;
        if (request.jsonSchema) {
            body.text = {
                format: {
                    type: "json_schema",
                    name: request.jsonSchema.name,
                    strict: request.jsonSchema.strict,
                    schema: request.jsonSchema.schema
                }
            };
        }
        if (request.reasoningEffort) body.reasoning = { effort: request.reasoningEffort };

        const response = await postJsonWithRetries({
            fetchImpl,
            url: RESPONSES_URL,
            headers: { Authorization: `Bearer ${apiKey}` },
            body,
            retryStatuses: RETRY_STATUSES,
            sleep,
            requestTimeoutMs: request.requestTimeoutMs || requestTimeoutMs
        });
        if (!response.ok) throw await createApiError(response);

        let data;
        try { data = await response.json(); } catch { throw new Error("The AI provider returned an unreadable response."); }
        const incompleteReason = String(data?.incomplete_details?.reason || data?.status_details?.reason || "").trim();
        if (incompleteReason === "max_output_tokens") {
            if (allowOutputBudgetRecovery) {
                return generate({
                    ...request,
                    maxTokens: Math.min(12000, Math.max(request.maxTokens + 1200, Math.round(request.maxTokens * 1.5)))
                }, apiKey, false);
            }
            throw new Error("The model reached its output-token limit before completing the response.");
        }
        if (request.jsonSchema) {
            const structured = extractStructured(data);
            if (structured) return structured;
            throw new Error("The AI provider returned no structured JSON.");
        }

        const text = extractText(data);
        if (text) return text;
        throw emptyTextError(data);
    }

    async function speech(request, apiKey) {
        const body = {
            model: request.model,
            voice: request.voice,
            input: request.input,
            response_format: request.responseFormat
        };
        if (request.instructions) body.instructions = request.instructions;
        if (request.speed != null) body.speed = request.speed;
        const response = await postJsonWithRetries({
            fetchImpl,
            url: SPEECH_URL,
            headers: { Authorization: `Bearer ${apiKey}` },
            body,
            retryStatuses: RETRY_STATUSES,
            sleep,
            requestTimeoutMs
        });
        if (!response.ok) throw await createApiError(response);
        const buffer = await response.arrayBuffer();
        if (!buffer.byteLength) throw new Error("The AI provider returned empty speech audio.");
        return {
            bytes: new Uint8Array(buffer),
            mimeType: response.headers?.get?.("content-type") || "audio/mpeg"
        };
    }

    async function transcribe(request, apiKey) {
        const response = await fetchWithRetries({
            fetchImpl,
            url: TRANSCRIPTIONS_URL,
            makeOptions: () => {
                const form = new FormData();
                form.append("file", new Blob([request.bytes], { type: request.mimeType }), request.fileName);
                form.append("model", request.model);
                if (request.language) form.append("language", request.language);
                if (request.prompt) form.append("prompt", request.prompt);
                return {
                    method: "POST",
                    headers: { Authorization: `Bearer ${apiKey}` },
                    body: form
                };
            },
            retryStatuses: RETRY_STATUSES,
            sleep,
            requestTimeoutMs
        });
        if (!response.ok) throw await createApiError(response);
        let data;
        try { data = await response.json(); } catch { throw new Error("The AI provider returned an unreadable transcription."); }
        const text = typeof data?.text === "string" ? data.text.trim() : "";
        if (!text) throw new Error("No speech was detected.");
        return { text };
    }

    return Object.freeze({ generate, speech, transcribe });
}

module.exports = {
    RESPONSES_URL,
    SPEECH_URL,
    TRANSCRIPTIONS_URL,
    createOpenAiAdapter,
    extractStructured,
    extractText
};
