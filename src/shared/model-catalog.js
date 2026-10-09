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

    // Verified against official provider catalogs on 2026-10-08; see docs/model-catalog.md.
    // Company groups, then strongest-to-lightest reasoning tiers within each.
    // Ordering follows official capability positioning, not price or model name.
    const MATCH_MODELS = Object.freeze([
        Object.freeze({ id: "gpt-6-astra", provider: "openai", label: "GPT-6 Astra" }),
        Object.freeze({ id: "gpt-6.1-sol", provider: "openai", label: "GPT-6.1 Sol" }),
        Object.freeze({ id: "gpt-6-luna", provider: "openai", label: "GPT-6 Luna" }),
        Object.freeze({ id: "claude-fable-5-1", provider: "anthropic", label: "Claude Fable 5.1" }),
        Object.freeze({ id: "claude-opus-5-5", provider: "anthropic", label: "Claude Opus 5.5" }),
        Object.freeze({ id: "claude-sonnet-5-5", provider: "anthropic", label: "Claude Sonnet 5.5" }),
        Object.freeze({ id: "claude-haiku-5-5", provider: "anthropic", label: "Claude Haiku 5.5" })
    ]);

    const DEFAULT_PARTICIPANT_MODEL = "gpt-6.1-sol";
    const DEFAULT_JUDGE_MODEL = "gpt-6-astra";
    const FLAGSHIP_JUDGE_MODELS = Object.freeze({openai:"gpt-6-astra",anthropic:"claude-fable-5-1"});
    const DEFAULT_JUDGE_PANEL = "all-gpt";
    const judgePanel = (id, models, labelEn, labelFr) => Object.freeze({id,models:Object.freeze(models),labelEn,labelFr});
    const JUDGE_PANELS = Object.freeze([
        judgePanel("all-gpt",["gpt-6-astra","gpt-6-astra","gpt-6-astra"],"3 × GPT-6 Astra","3 × GPT-6 Astra"),
        judgePanel("all-anthropic",["claude-fable-5-1","claude-fable-5-1","claude-fable-5-1"],"3 × Claude Fable 5.1","3 × Claude Fable 5.1"),
        judgePanel("gpt-majority",["gpt-6-astra","gpt-6-astra","claude-fable-5-1"],"2 × GPT-6 Astra + 1 × Claude Fable 5.1","2 × GPT-6 Astra + 1 × Claude Fable 5.1"),
        judgePanel("anthropic-majority",["claude-fable-5-1","claude-fable-5-1","gpt-6-astra"],"2 × Claude Fable 5.1 + 1 × GPT-6 Astra","2 × Claude Fable 5.1 + 1 × GPT-6 Astra")
    ]);
    const REASONING_POLICIES = Object.freeze({
        participant: "medium",
        judge: "high"
    });

    function getReasoningEffort(modelId, role) {
        if (!getModel(modelId)) throw new Error("The selected debate model is not supported.");
        if (role !== "participant" && role !== "judge") throw new Error("Reasoning role must be participant or judge.");
        return REASONING_POLICIES[role];
    }

    // Total output includes hidden reasoning. These app bounds are not provider ceilings.
    const MAX_TEXT_OUTPUT_TOKENS = 32768;
    const HIGH_REASONING_ALLOWANCE_TOKENS = 25000;

    function getTextOutputBudget(requestedTokens = 800, reasoningEffort = "high") {
        if (!Number.isInteger(requestedTokens) || requestedTokens < 1 || requestedTokens > MAX_TEXT_OUTPUT_TOKENS) {
            throw new Error(`Output limit must be an integer from 1 to ${MAX_TEXT_OUTPUT_TOKENS}.`);
        }
        // Values at or above the allowance are already total budgets; never pad twice.
        return ["high", "medium"].includes(reasoningEffort) && requestedTokens < HIGH_REASONING_ALLOWANCE_TOKENS
            ? Math.min(MAX_TEXT_OUTPUT_TOKENS, requestedTokens + HIGH_REASONING_ALLOWANCE_TOKENS)
            : requestedTokens;
    }

    const AUDIO_MODELS = Object.freeze({
        speech: "gpt-4o-mini-tts",
        moderatorSpeech: "gpt-4o-mini-tts",
        finalTranscription: "gpt-transcribe"
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

    function normalizeJudgePanel(value) {
        return JUDGE_PANELS.some(panel=>panel.id===value) ? value : DEFAULT_JUDGE_PANEL;
    }

    function getJudgePanel(value) {
        return JUDGE_PANELS.find(panel=>panel.id===normalizeJudgePanel(value));
    }

    function getJudgeModelForPanel(value, judgeNumber) {
        if (!Number.isInteger(judgeNumber) || judgeNumber < 1 || judgeNumber > 3) throw new Error("Judge number must be 1, 2 or 3.");
        return getJudgePanel(value).models[judgeNumber-1];
    }

    return Object.freeze({
        PROVIDERS,
        MATCH_MODELS,
        DEFAULT_PARTICIPANT_MODEL,
        DEFAULT_JUDGE_MODEL,
        FLAGSHIP_JUDGE_MODELS,
        DEFAULT_JUDGE_PANEL,
        JUDGE_PANELS,
        REASONING_POLICIES,
        getReasoningEffort,
        MAX_TEXT_OUTPUT_TOKENS,
        HIGH_REASONING_ALLOWANCE_TOKENS,
        getTextOutputBudget,
        AUDIO_MODELS,
        getModel,
        getProvider,
        getProviderForModel,
        isSupportedModel,
        normalizeJudgePanel,
        getJudgePanel,
        getJudgeModelForPanel
    });
});
