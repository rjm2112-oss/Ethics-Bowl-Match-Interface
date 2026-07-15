"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const catalog = require("../src/shared/model-catalog");

test("match catalog exposes only the approved debate models", () => {
    assert.deepEqual(
        catalog.MATCH_MODELS.map(({ id, provider }) => ({ id, provider })),
        [
            { id: "gpt-5.6-sol", provider: "openai" },
            { id: "gpt-5.6-terra", provider: "openai" },
            { id: "gpt-5.6-luna", provider: "openai" },
            { id: "claude-fable-5", provider: "anthropic" },
            { id: "claude-sonnet-5", provider: "anthropic" }
        ]
    );
});

test("Terra is the participant default and Sol is the judge default", () => {
    assert.equal(catalog.DEFAULT_PARTICIPANT_MODEL, "gpt-5.6-terra");
    assert.equal(catalog.DEFAULT_JUDGE_MODEL, "gpt-5.6-sol");
    assert.deepEqual(catalog.REASONING_POLICIES, { participant: "low", judge: "medium" });
});

test("audio defaults use supported OpenAI models", () => {
    assert.deepEqual(catalog.AUDIO_MODELS, {
        speech: "tts-1-hd",
        finalTranscription: "gpt-4o-transcribe"
    });
});

test("provider lookup rejects models outside the debate catalog", () => {
    assert.equal(catalog.getProviderForModel("claude-sonnet-5"), "anthropic");
    assert.equal(catalog.getProviderForModel("retired-debate-model"), "");
    assert.equal(catalog.isSupportedModel("retired-debate-model"), false);
});
