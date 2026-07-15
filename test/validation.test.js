"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const catalog = require("../src/shared/model-catalog");
const {
    validateGenerateRequest,
    validateSpeechRequest,
    validateTranscriptionRequest
} = require("../src/main/validation");

test("every catalog debate model is accepted and routed only to its catalog provider", () => {
    assert.equal(catalog.MATCH_MODELS.length, 6);
    for (const model of catalog.MATCH_MODELS) {
        const request = validateGenerateRequest({ model: model.id, userPrompt: "Debate this case." });
        assert.equal(request.model, model.id);
        assert.equal(request.provider, model.provider);
    }
    assert.throws(
        () => validateGenerateRequest({ model: "gpt-4o", userPrompt: "No.", provider: "openai" }),
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
        model: "gpt-5.5",
        userPrompt: "test",
        reasoningEffort: "none"
    }).reasoningEffort, "none");
    assert.throws(() => validateGenerateRequest({
        model: "claude-fable-5",
        userPrompt: "test",
        reasoningEffort: "none"
    }), /selected model/);
    assert.throws(() => validateGenerateRequest({
        model: "gpt-5.5",
        userPrompt: "test",
        reasoningEffort: "max"
    }), /selected model/);
    assert.equal(validateGenerateRequest({
        model: "claude-sonnet-5",
        userPrompt: "test",
        reasoningEffort: "xhigh"
    }).reasoningEffort, "xhigh");
});

test("audio defaults and model allowlists come from the shared catalog", () => {
    const speech = validateSpeechRequest({ input: "Read this aloud." });
    assert.equal(speech.model, catalog.AUDIO_MODELS.speech);
    assert.equal(speech.responseFormat, "mp3");
    assert.throws(() => validateSpeechRequest({ model: "gpt-4o-mini-tts", input: "No." }), /not supported/);

    const finalTranscription = validateTranscriptionRequest({ bytes: [1, 2, 3], mimeType: "audio/webm" });
    assert.equal(finalTranscription.model, catalog.AUDIO_MODELS.finalTranscription);
    assert.equal(validateTranscriptionRequest({
        model: catalog.AUDIO_MODELS.finalTranscription,
        bytes: new Uint8Array([1]),
        mimeType: "audio/ogg;codecs=opus"
    }).model, catalog.AUDIO_MODELS.finalTranscription);
    assert.throws(() => validateTranscriptionRequest({
        model: "whisper-1",
        bytes: [1],
        mimeType: "audio/webm"
    }), /not supported/);
});
