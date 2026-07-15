(function exposeModelCatalog(root, factory) {
    const catalog = factory();
    if (typeof module === "object" && module.exports) module.exports = catalog;
    if (root) root.EthicsModelCatalog = catalog;
})(typeof globalThis === "object" ? globalThis : this, function createModelCatalog() {
    "use strict";

    const PROVIDERS = Object.freeze({
        openai: Object.freeze({ id: "openai", label: "OpenAI" }),
        anthropic: Object.freeze({ id: "anthropic", label: "Anthropic" })
    });

    const MATCH_MODELS = Object.freeze([
        Object.freeze({ id: "gpt-5.6-sol", provider: "openai", label: "GPT-5.6 Sol" }),
        Object.freeze({ id: "gpt-5.6-terra", provider: "openai", label: "GPT-5.6 Terra" }),
        Object.freeze({ id: "gpt-5.6-luna", provider: "openai", label: "GPT-5.6 Luna" }),
        Object.freeze({ id: "claude-fable-5", provider: "anthropic", label: "Claude Fable 5" }),
        Object.freeze({ id: "claude-sonnet-5", provider: "anthropic", label: "Claude Sonnet 5" })
    ]);

    const DEFAULT_PARTICIPANT_MODEL = "gpt-5.6-terra";
    const DEFAULT_JUDGE_MODEL = "gpt-5.6-sol";
    const REASONING_POLICIES = Object.freeze({
        participant: "low",
        judge: "medium"
    });
    const AUDIO_MODELS = Object.freeze({
        speech: "tts-1-hd",
        finalTranscription: "gpt-4o-transcribe"
    });
    const MODEL_BY_ID = new Map(MATCH_MODELS.map((model) => [model.id, model]));

    function getModel(modelId) {
        return MODEL_BY_ID.get(String(modelId || "").trim()) || null;
    }

    function getProvider(providerId) {
        return PROVIDERS[String(providerId || "").trim()] || null;
    }

    function getProviderForModel(modelId) {
        return getModel(modelId)?.provider || "";
    }

    function isSupportedModel(modelId) {
        return !!getModel(modelId);
    }

    return Object.freeze({
        PROVIDERS,
        MATCH_MODELS,
        DEFAULT_PARTICIPANT_MODEL,
        DEFAULT_JUDGE_MODEL,
        REASONING_POLICIES,
        AUDIO_MODELS,
        getModel,
        getProvider,
        getProviderForModel,
        isSupportedModel
    });
});
