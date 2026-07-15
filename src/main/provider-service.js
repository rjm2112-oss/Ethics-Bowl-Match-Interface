"use strict";

const { createAnthropicAdapter } = require("./providers/anthropic");
const { createOpenAiAdapter } = require("./providers/openai");
const {
    validateGenerateRequest,
    validateSpeechRequest,
    validateTranscriptionRequest
} = require("./validation");

function createProviderService({ credentialStore, fetchImpl = globalThis.fetch, sleep } = {}) {
    if (!credentialStore || typeof credentialStore.get !== "function") throw new Error("A credential store is required.");
    const openai = createOpenAiAdapter({ fetchImpl, sleep });
    const anthropic = createAnthropicAdapter({ fetchImpl, sleep });

    async function requireKey(provider) {
        const key = await credentialStore.get(provider);
        if (!key) throw new Error("No API key is configured for the selected model's provider.");
        return key;
    }

    async function generate(payload) {
        const request = validateGenerateRequest(payload);
        const key = await requireKey(request.provider);
        if (request.provider === "openai") return openai.generate(request, key);
        if (request.provider === "anthropic") return anthropic.generate(request, key);
        throw new Error("That AI provider is not supported.");
    }

    async function speech(payload) {
        const request = validateSpeechRequest(payload);
        return openai.speech(request, await requireKey("openai"));
    }

    async function transcribe(payload) {
        const request = validateTranscriptionRequest(payload);
        return openai.transcribe(request, await requireKey("openai"));
    }

    return Object.freeze({ generate, speech, transcribe });
}

module.exports = { createProviderService };
