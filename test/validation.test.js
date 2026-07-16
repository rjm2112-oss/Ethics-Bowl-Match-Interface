"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const catalog = require("../src/shared/model-catalog");
const {
    DEFAULT_GENERATE_REQUEST_TIMEOUT_MS,
    MAX_GENERATE_REQUEST_TIMEOUT_MS,
    validateGenerateRequest,
    validateSpeechRequest,
    validateTranscriptionRequest
} = require("../src/main/validation");

test("every catalog debate model is accepted and routed only to its catalog provider", () => {
    assert.equal(catalog.MATCH_MODELS.length, 5);
    for (const model of catalog.MATCH_MODELS) {
        const request = validateGenerateRequest({ model: model.id, userPrompt: "Debate this case." });
        assert.equal(request.model, model.id);
        assert.equal(request.provider, model.provider);
    }
    assert.throws(
        () => validateGenerateRequest({ model: "retired-debate-model", userPrompt: "No.", provider: "openai" }),
        /not supported/
    );
    assert.throws(
        () => validateGenerateRequest({ model: "claude-sonnet-5", userPrompt: "No.", provider: "openai" }),
        /does not belong/
    );
});

test("reasoning effort is validated per selected model", () => {
    assert.equal(validateGenerateRequest({
        model: "gpt-5.6-sol",
        userPrompt: "test",
        reasoningEffort: "max"
    }).reasoningEffort, "max");
    assert.equal(validateGenerateRequest({
        model: "gpt-5.6-terra",
        userPrompt: "test",
        reasoningEffort: "none"
    }).reasoningEffort, "none");
    assert.throws(() => validateGenerateRequest({
        model: "claude-fable-5",
        userPrompt: "test",
        reasoningEffort: "none"
    }), /selected model/);
    assert.equal(validateGenerateRequest({
        model: "claude-sonnet-5",
        userPrompt: "test",
        reasoningEffort: "xhigh"
    }).reasoningEffort, "xhigh");
});

test("generation timeout defaults safely and permits a longer final-score window", () => {
    assert.equal(validateGenerateRequest({
        model: "gpt-5.6-sol",
        userPrompt: "test"
    }).requestTimeoutMs, DEFAULT_GENERATE_REQUEST_TIMEOUT_MS);
    assert.equal(validateGenerateRequest({
        model: "gpt-5.6-sol",
        userPrompt: "test",
        requestTimeoutMs: 240000
    }).requestTimeoutMs, 240000);
    assert.throws(() => validateGenerateRequest({
        model: "gpt-5.6-sol",
        userPrompt: "test",
        requestTimeoutMs: MAX_GENERATE_REQUEST_TIMEOUT_MS + 1
    }), /Request timeout/);
});

test("audio defaults and model allowlists come from the shared catalog", () => {
    const speech = validateSpeechRequest({ input: "Read this aloud." });
    assert.equal(speech.model, catalog.AUDIO_MODELS.speech);
    assert.equal(speech.responseFormat, "mp3");
    assert.throws(() => validateSpeechRequest({ model: "retired-speech-model", input: "No." }), /not supported/);
    assert.equal(validateSpeechRequest({ input: "No.", format: "wav" }).responseFormat, "mp3");
    assert.throws(() => validateSpeechRequest({ input: "No.", responseFormat: "wav" }), /Only MP3/);
    assert.equal(validateSpeechRequest({
        model: catalog.AUDIO_MODELS.speech,
        voice: "coral",
        input: "Judge question."
    }).voice, "coral");
    assert.throws(() => validateSpeechRequest({
        model: catalog.AUDIO_MODELS.speech,
        voice: "verse",
        input: "Judge question."
    }), /voice is not supported/);
    assert.equal(validateSpeechRequest({
        model: catalog.AUDIO_MODELS.moderatorSpeech,
        input: "Welcome.",
        instructions: "Use a measured cadence."
    }).instructions, "Use a measured cadence.");
    assert.throws(() => validateSpeechRequest({
        model: catalog.AUDIO_MODELS.speech,
        input: "No.",
        instructions: "Use a measured cadence."
    }), /does not support voice instructions/);

    const finalTranscription = validateTranscriptionRequest({ bytes: [1, 2, 3], mimeType: "audio/webm" });
    assert.equal(finalTranscription.model, catalog.AUDIO_MODELS.finalTranscription);
    assert.equal(validateTranscriptionRequest({
        model: catalog.AUDIO_MODELS.finalTranscription,
        bytes: new Uint8Array([1]),
        mimeType: "audio/ogg;codecs=opus"
    }).model, catalog.AUDIO_MODELS.finalTranscription);
    assert.throws(() => validateTranscriptionRequest({
        model: "retired-transcription-model",
        bytes: [1],
        mimeType: "audio/webm"
    }), /not supported/);
    assert.throws(() => validateTranscriptionRequest({
        audioBytes: [1],
        mimeType: "audio/webm"
    }), /Audio bytes are required/);
});
