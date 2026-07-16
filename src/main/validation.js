"use strict";

const modelCatalog = require("../shared/model-catalog");

const PROVIDERS = Object.freeze(Object.keys(modelCatalog.PROVIDERS));
const REASONING_EFFORTS_BY_MODEL = Object.freeze({
    "gpt-5.6-sol": new Set(["none", "low", "medium", "high", "xhigh", "max"]),
    "gpt-5.6-terra": new Set(["none", "low", "medium", "high", "xhigh", "max"]),
    "gpt-5.6-luna": new Set(["none", "low", "medium", "high", "xhigh", "max"]),
    "claude-fable-5": new Set(["low", "medium", "high", "xhigh", "max"]),
    "claude-sonnet-5": new Set(["low", "medium", "high", "xhigh", "max"])
});
const SPEECH_MODELS = new Set([
    modelCatalog.AUDIO_MODELS.speech,
    modelCatalog.AUDIO_MODELS.moderatorSpeech
]);
const SPEECH_VOICES_BY_MODEL = new Map([
    [modelCatalog.AUDIO_MODELS.speech, new Set(["alloy", "ash", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"])],
    [modelCatalog.AUDIO_MODELS.moderatorSpeech, new Set(["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse", "marin", "cedar"])]
]);
const INSTRUCTION_CAPABLE_SPEECH_MODELS = new Set([modelCatalog.AUDIO_MODELS.moderatorSpeech]);
const TRANSCRIPTION_MODELS = new Set([modelCatalog.AUDIO_MODELS.finalTranscription]);
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const AUDIO_MIME_PATTERN = /^(?:audio\/(?:webm|ogg|mpeg|mp3|mp4|wav|x-wav|m4a|x-m4a))(?:\s*;.*)?$/i;
const DEFAULT_GENERATE_REQUEST_TIMEOUT_MS = 90000;
const MAX_GENERATE_REQUEST_TIMEOUT_MS = 300000;

function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function requireObject(value, label = "Request") {
    if (!isPlainObject(value)) throw new Error(`${label} must be an object.`);
    return value;
}

function boundedString(value, label, { required = false, maxLength = 100000 } = {}) {
    if (value == null && !required) return "";
    if (typeof value !== "string") throw new Error(`${label} must be text.`);
    const cleaned = value.trim();
    if (required && !cleaned) throw new Error(`${label} is required.`);
    if (cleaned.length > maxLength) throw new Error(`${label} is too long.`);
    return cleaned;
}

function boundedInteger(value, label, fallback, minimum, maximum) {
    if (value == null) return fallback;
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
    }
    return value;
}

function validateProvider(provider) {
    const clean = boundedString(provider, "Provider", { required: true, maxLength: 32 }).toLowerCase();
    if (!PROVIDERS.includes(clean)) throw new Error("That AI provider is not supported.");
    return clean;
}

function validateCredentialKey(key) {
    const clean = boundedString(key, "API key", { required: true, maxLength: 4096 });
    if (clean.length < 8 || /[\u0000-\u001F\u007F]/.test(clean)) throw new Error("The API key is not valid.");
    return clean;
}

function validateJsonSchema(value) {
    if (value == null) return null;
    const schemaRequest = requireObject(value, "JSON schema");
    const name = boundedString(schemaRequest.name, "JSON schema name", { required: true, maxLength: 64 });
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)) throw new Error("The JSON schema name is not valid.");
    const schema = requireObject(schemaRequest.schema, "JSON schema definition");
    let serialized;
    try {
        serialized = JSON.stringify(schema);
    } catch {
        throw new Error("The JSON schema is not serializable.");
    }
    if (!serialized || serialized.length > 100000) throw new Error("The JSON schema is too large.");
    return { name, strict: schemaRequest.strict !== false, schema };
}

function validateGenerateRequest(payload) {
    const request = requireObject(payload);
    const model = boundedString(request.model, "Model", { required: true, maxLength: 100 });
    const catalogModel = modelCatalog.getModel(model);
    if (!catalogModel) throw new Error("That debate model is not supported.");

    if (request.provider != null && validateProvider(request.provider) !== catalogModel.provider) {
        throw new Error("The selected model does not belong to that AI provider.");
    }

    let reasoningEffort = null;
    if (request.reasoningEffort != null && request.reasoningEffort !== "") {
        reasoningEffort = boundedString(request.reasoningEffort, "Reasoning effort", { required: true, maxLength: 16 }).toLowerCase();
        if (!REASONING_EFFORTS_BY_MODEL[catalogModel.id]?.has(reasoningEffort)) {
            throw new Error("That reasoning effort is not supported by the selected model.");
        }
    }
    return {
        provider: catalogModel.provider,
        model: catalogModel.id,
        systemPrompt: boundedString(request.systemPrompt, "System prompt", { maxLength: 150000 }),
        userPrompt: boundedString(request.userPrompt, "User prompt", { required: true, maxLength: 500000 }),
        maxTokens: boundedInteger(request.maxTokens, "Output limit", 800, 1, 12000),
        requestTimeoutMs: boundedInteger(
            request.requestTimeoutMs,
            "Request timeout",
            DEFAULT_GENERATE_REQUEST_TIMEOUT_MS,
            1000,
            MAX_GENERATE_REQUEST_TIMEOUT_MS
        ),
        reasoningEffort,
        jsonSchema: validateJsonSchema(request.jsonSchema)
    };
}

function validateSpeechRequest(payload) {
    const request = requireObject(payload);
    const model = boundedString(request.model || modelCatalog.AUDIO_MODELS.speech, "Speech model", { required: true, maxLength: 64 });
    if (!SPEECH_MODELS.has(model)) throw new Error("That speech model is not supported.");
    const responseFormat = boundedString(request.responseFormat || "mp3", "Audio format", { required: true, maxLength: 16 }).toLowerCase();
    if (responseFormat !== "mp3") throw new Error("Only MP3 speech output is supported.");
    const voice = boundedString(request.voice || "alloy", "Voice", { required: true, maxLength: 32 }).toLowerCase();
    if (!/^[a-z][a-z0-9_-]*$/.test(voice)) throw new Error("The speech voice is not valid.");
    if (!SPEECH_VOICES_BY_MODEL.get(model)?.has(voice)) throw new Error("That voice is not supported by the selected speech model.");
    const instructions = boundedString(request.instructions, "Speech instructions", { maxLength: 1000 });
    if (instructions && !INSTRUCTION_CAPABLE_SPEECH_MODELS.has(model)) {
        throw new Error("That speech model does not support voice instructions.");
    }
    let speed;
    if (request.speed != null) {
        speed = Number(request.speed);
        if (!Number.isFinite(speed) || speed < 0.25 || speed > 4) throw new Error("Speech speed must be from 0.25 to 4.");
    }
    return {
        model,
        input: boundedString(request.input, "Speech text", { required: true, maxLength: 4096 }),
        voice,
        responseFormat,
        ...(instructions ? { instructions } : {}),
        ...(speed == null ? {} : { speed })
    };
}

function normalizeAudioBytes(value) {
    if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    }
    if (Array.isArray(value)) {
        if (value.length > MAX_AUDIO_BYTES) throw new Error("The audio recording is too large.");
        for (const byte of value) {
            if (!Number.isInteger(byte) || byte < 0 || byte > 255) throw new Error("The audio recording is not valid.");
        }
        return Uint8Array.from(value);
    }
    throw new Error("Audio bytes are required.");
}

function defaultAudioFileName(mimeType) {
    if (/ogg/i.test(mimeType)) return "recording.ogg";
    if (/mpeg|mp3/i.test(mimeType)) return "recording.mp3";
    if (/mp4|m4a/i.test(mimeType)) return "recording.m4a";
    if (/wav/i.test(mimeType)) return "recording.wav";
    return "recording.webm";
}

function validateTranscriptionRequest(payload) {
    const request = requireObject(payload);
    const model = boundedString(request.model || modelCatalog.AUDIO_MODELS.finalTranscription, "Transcription model", { required: true, maxLength: 64 });
    if (!TRANSCRIPTION_MODELS.has(model)) throw new Error("That transcription model is not supported.");
    const bytes = normalizeAudioBytes(request.bytes);
    if (!bytes.byteLength) throw new Error("The audio recording is empty.");
    if (bytes.byteLength > MAX_AUDIO_BYTES) throw new Error("The audio recording is too large.");
    const mimeType = boundedString(request.mimeType || "audio/webm", "Audio type", { required: true, maxLength: 100 }).toLowerCase();
    if (!AUDIO_MIME_PATTERN.test(mimeType)) throw new Error("That audio type is not supported.");
    const requestedName = boundedString(request.fileName || defaultAudioFileName(mimeType), "Audio file name", { required: true, maxLength: 120 });
    const fileName = requestedName.split(/[\\/]/).pop().replace(/[^A-Za-z0-9._-]/g, "_");
    const language = request.language == null || request.language === ""
        ? ""
        : boundedString(request.language, "Transcription language", { required: true, maxLength: 20 }).toLowerCase();
    if (language && !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(language)) throw new Error("The transcription language is not valid.");
    const prompt = boundedString(request.prompt, "Transcription prompt", { maxLength: 5000 });
    return { model, bytes, mimeType, fileName, language, prompt };
}

module.exports = {
    DEFAULT_GENERATE_REQUEST_TIMEOUT_MS,
    MAX_AUDIO_BYTES,
    MAX_GENERATE_REQUEST_TIMEOUT_MS,
    PROVIDERS,
    SPEECH_MODELS,
    TRANSCRIPTION_MODELS,
    validateCredentialKey,
    validateGenerateRequest,
    validateProvider,
    validateSpeechRequest,
    validateTranscriptionRequest
};
