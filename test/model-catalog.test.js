"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const catalog = require("../src/shared/model-catalog");

test("match catalog groups current models by company and orders strongest to lightest", () => {
    assert.deepEqual(
        catalog.MATCH_MODELS.map(({ id, provider }) => ({ id, provider })),
        [
            { id: "gpt-6-astra", provider: "openai" },
            { id: "gpt-6.1-sol", provider: "openai" },
            { id: "gpt-6-luna", provider: "openai" },
            { id: "claude-fable-5-1", provider: "anthropic" },
            { id: "claude-opus-5-5", provider: "anthropic" },
            { id: "claude-sonnet-5-5", provider: "anthropic" },
            { id: "claude-haiku-5-5", provider: "anthropic" }
        ]
    );
});

test("Sol is the participant default and Astra is the judge default", () => {
    assert.equal(catalog.DEFAULT_PARTICIPANT_MODEL, "gpt-6.1-sol");
    assert.equal(catalog.DEFAULT_JUDGE_MODEL, "gpt-6-astra");
    assert.deepEqual(catalog.REASONING_POLICIES, { participant: "high", judge: "high" });
});

test("audio defaults use supported OpenAI models", () => {
    assert.deepEqual(catalog.AUDIO_MODELS, {
        speech: "gpt-4o-mini-tts",
        moderatorSpeech: "gpt-4o-mini-tts",
        finalTranscription: "gpt-transcribe"
    });
});

test("provider lookup rejects models outside the debate catalog", () => {
    assert.equal(catalog.getProviderForModel("claude-sonnet-5-5"), "anthropic");
    assert.equal(catalog.getProviderForModel("retired-debate-model"), "");
    assert.equal(catalog.isSupportedModel("retired-debate-model"), false);
});

test("company groups start with the same flagship used in judge presets and retain unique routing IDs", () => {
    for (const provider of ["openai", "anthropic"]) {
        const models = catalog.MATCH_MODELS.filter(model => model.provider === provider);
        assert.equal(models[0].id, catalog.FLAGSHIP_JUDGE_MODELS[provider]);
        for (const model of models) assert.equal(catalog.getProviderForModel(model.id), provider);
    }
    assert.equal(new Set(catalog.MATCH_MODELS.map(model => model.id)).size, 7);
    assert.equal(catalog.DEFAULT_PARTICIPANT_MODEL, "gpt-6.1-sol");
});


test("high output budgets allow reasoning plus visible output without repeated padding",()=>{
    for(const visible of [600,800,2800,3000,4000,6000]){
        const total=catalog.getTextOutputBudget(visible,"high");
        assert.equal(total,visible+25000);
        assert.equal(catalog.getTextOutputBudget(total,"high"),total);
        assert.equal(catalog.getTextOutputBudget(visible,"low"),visible);
    }
    assert.equal(catalog.getTextOutputBudget(32768,"high"),32768);
    for(const invalid of [0,-1,32769,NaN,1.5])assert.throws(()=>catalog.getTextOutputBudget(invalid),/Output limit/);
});


test("Astra and Fable contestants use medium while every judge stays high",()=>{
    for(const model of catalog.MATCH_MODELS){
        const expected=["gpt-6-astra","claude-fable-5-1"].includes(model.id)?"medium":"high";
        assert.equal(catalog.getReasoningEffort(model.id,"participant"),expected);
        assert.equal(catalog.getReasoningEffort(model.id,"judge"),"high");
        assert.equal(catalog.getTextOutputBudget(2800,expected),27800);
    }
    assert.throws(()=>catalog.getReasoningEffort("unknown","participant"),/not supported/);
    assert.throws(()=>catalog.getReasoningEffort("gpt-6-astra","unknown"),/Reasoning role/);
});
