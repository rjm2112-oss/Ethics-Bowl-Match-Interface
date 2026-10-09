(() => {
    "use strict";
function normalizeLocale(value) {
    const v = String(value || "").trim().toLowerCase().replace(/_/g, "-");
    return v.startsWith("fr") ? "fr-ca" : "en";
}
function getInitialLocale() {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("lang");
    if (fromUrl) return normalizeLocale(fromUrl);
    return normalizeLocale(
        localStorage.getItem(STORAGE_KEYS.locale) ||
        document.documentElement.lang ||
        navigator.language
    );
}
const STORAGE_KEYS = {
    instructions: "debate.instructions",
    setup: "ethics.match.setup.v1",
    locale: "ethics.match.locale"
};
const LOGO_CANDIDATES = Object.freeze([
    "ethics-bowl-logo.png",
    "assets/icon.png"
]);
const MODEL_CATALOG = window.EthicsModelCatalog;
const AI_TURN_PROMPTS = window.EthicsAiTurnPrompts;
const ETHICS_BOWL_RUBRIC = window.EthicsBowlRubric;
const PHASE_TIMER_POLICY = window.EthicsPhaseTimerPolicy;
const SPEECH_TIMING = window.EthicsSpeechTiming;
const COMPOSER_STATUS = window.EthicsComposerStatus;
const SPEECH_DELIVERY = window.EthicsSpeechDelivery;
const SCORECARD_TALLY = window.EthicsScorecardTally;
const TIMING_TEST_MODE = new URLSearchParams(window.location.search).get("timingTest") === "1";
const TIMING_TEST_AUTO_START = TIMING_TEST_MODE
    && new URLSearchParams(window.location.search).get("autoStart") === "1";
const TIMING_TEST_RESULT_LIMIT = TIMING_TEST_MODE
    ? Math.max(0, Math.min(50, Number.parseInt(
        new URLSearchParams(window.location.search).get("timingLimit") || "0",
        10
    ) || 0))
    : 0;
const AVAILABLE_MATCH_MODELS = MODEL_CATALOG.MATCH_MODELS;
const DEFAULT_PARTICIPANT_MODEL = MODEL_CATALOG.DEFAULT_PARTICIPANT_MODEL;
const DEFAULT_JUDGE_MODEL = MODEL_CATALOG.DEFAULT_JUDGE_MODEL;
const JUDGE_REASONING_EFFORT = MODEL_CATALOG.REASONING_POLICIES.judge;
const AUDIO_MODELS = MODEL_CATALOG.AUDIO_MODELS;
const FINAL_JUDGE_SCORECARD_JSON_SCHEMA = window.EthicsFinalScoring.schema;
const TIMINGS = window.EthicsMatchPhases.TIMINGS;
const CREDENTIAL_STATUS_TIMEOUT_MS = 4000;
const FINAL_SCORECARD_REQUEST_TIMEOUT_MS = 240000;
const MAX_TTS_CHARS = 4096;
const SPEECH_CHUNK_MAX = 800;
const TIMING_TEST_TTS_CONCURRENCY = 4;
const WHOLE_SPEECH_TTS_CONCURRENCY = 2;
const WHOLE_SPEECH_MIN_PLAYBACK_RATE = 0.924;
const WHOLE_SPEECH_MAX_PLAYBACK_RATE = 1.09;
const PARTICIPANT_SPEECH_HANDOFF_GAP_MS = 650;
const TIMED_SPEECH_TIMER_LEAD_MS = 350;
const MODERATOR_SPEECH_INSTRUCTIONS = "Speak as a calm, professional debate moderator. Use a natural, measured cadence with brief pauses at sentence boundaries. Keep pauses subtle and consistent: do not rush sentences together and do not add dramatic or prolonged pauses. Preserve the supplied wording exactly.";
const AUTO_SPEAK_MESSAGE_KINDS = new Set(["moderator", "ai", "ai-alt", "judge"]);
const AUTO_SPEAK_VOICES = Object.freeze({
    moderator: "sage",
    ai: "shimmer",
    "ai-alt": "alloy",
    judge1: "alloy",
    judge2: "ash",
    judge3: "coral",
    judge: "alloy"
});
const STOP_SPEECH_ERROR = "__speech_stopped__";
const INITIAL_LOCALE = getInitialLocale();
const credentialState = {
    loaded: false,
    loadingPromise: null,
    pendingProvider: "",
    lastError: "",
    byProvider: {
        openai: { configured: false, source: "" },
        anthropic: { configured: false, source: "" }
    }
};
const caseArchiveOriginsKey = "ethics.match.archiveOrigins";
if (!MODEL_CATALOG) throw new Error("The shared model catalog could not be loaded.");
if (!AI_TURN_PROMPTS) throw new Error("The shared AI turn prompt helpers could not be loaded.");
if (!ETHICS_BOWL_RUBRIC) throw new Error("The official scoring criteria could not be loaded.");
if (!PHASE_TIMER_POLICY) throw new Error("The shared phase timer policy could not be loaded.");
if (!SPEECH_TIMING) throw new Error("The shared speech timing helpers could not be loaded.");
if (!COMPOSER_STATUS) throw new Error("The shared composer status helpers could not be loaded.");
if (!SPEECH_DELIVERY) throw new Error("The speech delivery helper could not be loaded.");
if (!SCORECARD_TALLY) throw new Error("The shared scorecard tally helpers could not be loaded.");
credentialState.initialDialogShown = false;
const state = window.EthicsMatchSession.create({locale:INITIAL_LOCALE,modelCatalog:MODEL_CATALOG});
state.caseArchiveOrigins = {};
const ui = {};
ui.chatEl = document.getElementById("chat");
ui.emptyStateEl = document.getElementById("emptyState");
ui.statusLineEl = document.getElementById("statusLine");
ui.appHeroEl = document.getElementById("appHero");
ui.appStatusStripEl = document.getElementById("appStatusStrip");
ui.instructionsBadgeEl = document.getElementById("instructionsBadge");
ui.instructionsLinkEl = document.getElementById("instructionsLink");
ui.localeToggleBtnEl = document.getElementById("localeToggleBtn");
ui.setupScreenEl = document.getElementById("setupScreen");
ui.matchScreenEl = document.getElementById("matchScreen");
ui.participantTwoTypeSelectEl = document.getElementById("participantTwoTypeSelect");
ui.participantTwoModelWrapEl = document.getElementById("participantTwoModelWrap");
ui.participantOneTypeSelectEl = document.getElementById("participantOneTypeSelect");
ui.participantOneModelWrapEl = document.getElementById("participantOneModelWrap");
ui.participantOneModelSelectEl = document.getElementById("participantOneModelSelect");
ui.humanNameInputEl = document.getElementById("humanNameInput");
ui.aiNameInputEl = document.getElementById("aiNameInput");
ui.coinCallPanelEl = document.getElementById("coinCallPanel");
ui.coinHeadsBtnEl = document.getElementById("coinHeadsBtn");
ui.coinTailsBtnEl = document.getElementById("coinTailsBtn");
ui.followSpeechBtnEl = document.getElementById("followSpeechBtn");
ui.judgeModeSelectEl = document.getElementById("judgeModeSelect");
ui.judgePanelPresetSelectEl = document.getElementById("judgePanelPresetSelect");
ui.moderatorReadFullCaseSelectEl = document.getElementById("moderatorReadFullCaseSelect");
ui.modelSelectEl = document.getElementById("modelSelect");
ui.case1TitleInputEl = document.getElementById("case1TitleInput");
ui.case1QuestionInputEl = document.getElementById("case1QuestionInput");
ui.case1TextInputEl = document.getElementById("case1TextInput");
ui.case2TitleInputEl = document.getElementById("case2TitleInput");
ui.case2QuestionInputEl = document.getElementById("case2QuestionInput");
ui.case2TextInputEl = document.getElementById("case2TextInput");
ui.startMatchBtnEl = document.getElementById("startMatchBtn");
ui.resetMatchBtnEl = document.getElementById("resetMatchBtn");
ui.newMatchBtnEl = document.getElementById("newMatchBtn");
ui.nextActionBtnEl = document.getElementById("nextActionBtn");
ui.coinChoicePanelEl = document.getElementById("coinChoicePanel");
ui.coinTossCardEl = document.getElementById("coinTossCard");
ui.coinTossStatusEl = document.getElementById("coinTossStatus");
ui.coinTossAnimationEl = document.getElementById("coinTossAnimation");
ui.coinTossCoinEl = document.getElementById("coinTossCoin");
ui.leadBtnEl = document.getElementById("leadBtn");
ui.passBtnEl = document.getElementById("passBtn");
ui.currentPhaseTitleEl = document.getElementById("currentPhaseTitle");
ui.currentPhaseMetaEl = document.getElementById("currentPhaseMeta");
ui.phaseListEl = document.getElementById("phaseList");
ui.timerDisplayEl = document.getElementById("timerDisplay");
ui.timerHintEl = document.getElementById("timerHint");
ui.timerControlButtonsEl = document.getElementById("timerControlButtons");
ui.pauseTimerBtnEl = document.getElementById("pauseTimerBtn");
ui.resumeTimerBtnEl = document.getElementById("resumeTimerBtn");
ui.resetTimerBtnEl = document.getElementById("resetTimerBtn");
ui.timingTestPanelEl = document.getElementById("timingTestPanel");
ui.timingTestModeNoteEl = document.getElementById("timingTestModeNote");
ui.timingTestResultsEl = document.getElementById("timingTestResults");
ui.composerFormEl = document.getElementById("composerForm");
ui.messageInputEl = document.getElementById("messageInput");
ui.submitTurnBtnEl = document.getElementById("submitTurnBtn");
ui.micBtnEl = document.getElementById("micBtn");
ui.liveVoiceWrapEl = document.getElementById("liveVoiceWrap");
ui.liveVoicePreviewEl = document.getElementById("liveVoicePreview");
ui.judgePanelDefaultEl = document.getElementById("judgePanelDefault");
ui.aiJudgePanelEl = document.getElementById("aiJudgePanel");
ui.humanJudgePanelEl = document.getElementById("humanJudgePanel");
ui.computeHumanResultBtnEl = document.getElementById("computeHumanResultBtn");
ui.scoreSummaryEl = document.getElementById("scoreSummary");
ui.scoreCardsEl = document.getElementById("scoreCards");
ui.matchSetupSummaryEl = document.getElementById("matchSetupSummary");
ui.matchCase1CardEl = document.getElementById("matchCase1Card");
ui.matchCase1SummaryEl = document.getElementById("matchCase1Summary");
ui.matchCase1MetaEl = document.getElementById("matchCase1Meta");
ui.matchCase1QuestionEl = document.getElementById("matchCase1Question");
ui.matchCase1TextEl = document.getElementById("matchCase1Text");
ui.matchCase2CardEl = document.getElementById("matchCase2Card");
ui.matchCase2SummaryEl = document.getElementById("matchCase2Summary");
ui.matchCase2MetaEl = document.getElementById("matchCase2Meta");
ui.matchCase2QuestionEl = document.getElementById("matchCase2Question");
ui.matchCase2TextEl = document.getElementById("matchCase2Text");
ui.judgeInputs = [1, 2, 3].map((n) => ({
    number: n,
    name: document.getElementById(`judge${n}Name`),
                                          status: document.getElementById(`judge${n}Status`),
                                          question: document.getElementById(`judge${n}Question`),
                                          humanScore: document.getElementById(`judge${n}HumanScore`),
                                          aiScore: document.getElementById(`judge${n}AiScore`),
                                          humanBreakdown: Object.fromEntries(Object.keys(SCORECARD_TALLY.OFFICIAL_BREAKDOWN_RANGES).map(key => [key, document.getElementById(`judge${n}Human-${key}`)])),
                                          aiBreakdown: Object.fromEntries(Object.keys(SCORECARD_TALLY.OFFICIAL_BREAKDOWN_RANGES).map(key => [key, document.getElementById(`judge${n}Ai-${key}`)])),
                                          humanDidWell: document.getElementById(`judge${n}HumanDidWell`),
                                          humanNeedsImprovement: document.getElementById(`judge${n}HumanNeedsImprovement`),
                                          aiDidWell: document.getElementById(`judge${n}AiDidWell`),
                                          aiNeedsImprovement: document.getElementById(`judge${n}AiNeedsImprovement`)
}));
ui.stopSpeechBtnEl = null;
ui.callTimeBtnEl = null;
ui.composerModeIndicatorEl = null;
ui.manageApiKeysBtnEl = null;
ui.apiKeyStatusBadgeEl = null;
ui.apiKeyDialogEl = null;
ui.apiKeyDialogEyebrowEl = null;
ui.apiKeyDialogTitleEl = null;
ui.apiKeyDialogCopyEl = null;
ui.apiKeyDialogCloseBtnEl = null;
ui.credentialUiByProvider = {};
const context = {state,ui,settings:{STORAGE_KEYS,LOGO_CANDIDATES,MODEL_CATALOG,AI_TURN_PROMPTS,ETHICS_BOWL_RUBRIC,PHASE_TIMER_POLICY,SPEECH_TIMING,COMPOSER_STATUS,SPEECH_DELIVERY,SCORECARD_TALLY,TIMING_TEST_MODE,TIMING_TEST_AUTO_START,TIMING_TEST_RESULT_LIMIT,AVAILABLE_MATCH_MODELS,DEFAULT_PARTICIPANT_MODEL,DEFAULT_JUDGE_MODEL,JUDGE_REASONING_EFFORT,AUDIO_MODELS,FINAL_JUDGE_SCORECARD_JSON_SCHEMA,TIMINGS,CREDENTIAL_STATUS_TIMEOUT_MS,FINAL_SCORECARD_REQUEST_TIMEOUT_MS,MAX_TTS_CHARS,SPEECH_CHUNK_MAX,TIMING_TEST_TTS_CONCURRENCY,WHOLE_SPEECH_TTS_CONCURRENCY,WHOLE_SPEECH_MIN_PLAYBACK_RATE,WHOLE_SPEECH_MAX_PLAYBACK_RATE,PARTICIPANT_SPEECH_HANDOFF_GAP_MS,TIMED_SPEECH_TIMER_LEAD_MS,MODERATOR_SPEECH_INSTRUCTIONS,AUTO_SPEAK_MESSAGE_KINDS,AUTO_SPEAK_VOICES,STOP_SPEECH_ERROR,INITIAL_LOCALE,credentialState,caseArchiveOriginsKey},services:{normalizeLocale,getInitialLocale},platform:{window: typeof window === "undefined" ? undefined : window,document: typeof document === "undefined" ? undefined : document,navigator: typeof navigator === "undefined" ? undefined : navigator,localStorage: typeof localStorage === "undefined" ? undefined : localStorage,Image: typeof Image === "undefined" ? undefined : Image,Option: typeof Option === "undefined" ? undefined : Option,URL: typeof URL === "undefined" ? undefined : URL,Blob: typeof Blob === "undefined" ? undefined : Blob,FileReader: typeof FileReader === "undefined" ? undefined : FileReader,MediaRecorder: typeof MediaRecorder === "undefined" ? undefined : MediaRecorder,AbortController: typeof AbortController === "undefined" ? undefined : AbortController,performance: typeof performance === "undefined" ? undefined : performance,console: typeof console === "undefined" ? undefined : console}};
for(const name of ["locale","credentials","setup","transcript","speech","speech-view","speech-callbacks","timing","model-client","context","prompts","turns","questions","scoring","score-format","scorecards","composer","pending-submission","voice","match","phase-access","coin-choice","timer"])Object.assign(context.services,window.EthicsRenderer[name].create(context));
for(const name of ["locale","credentials","setup","transcript","speech","speech-view","speech-callbacks","timing","model-client","context","prompts","turns","questions","scoring","score-format","scorecards","composer","pending-submission","voice","match","phase-access","coin-choice","timer"]) {
    const dependencies=window.EthicsRenderer[name].dependencies;
    for(const required of dependencies.services)if(typeof context.services[required]!=="function")throw Error(name+" requires service "+required);
}
context.ui.startMatchBtnEl.addEventListener("click", () => { void context.services.startMatch(); });
context.ui.resetMatchBtnEl.addEventListener("click", context.services.fullReset);
context.ui.newMatchBtnEl?.addEventListener("click", context.services.fullReset);
context.ui.nextActionBtnEl.addEventListener("click", () => { void context.services.handleNextAction(); });
context.ui.leadBtnEl.addEventListener("click", () => context.services.handleHumanCoinChoice("lead"));
context.ui.passBtnEl.addEventListener("click", () => context.services.handleHumanCoinChoice("pass"));
context.ui.coinHeadsBtnEl.addEventListener("click", () => context.services.handleHumanCoinCall("heads"));
context.ui.coinTailsBtnEl.addEventListener("click", () => context.services.handleHumanCoinCall("tails"));
context.ui.followSpeechBtnEl.addEventListener("click", context.services.resumeSpeechFollow);
window.addEventListener("resize", context.services.resumeSpeechFollow);
context.ui.chatEl.addEventListener("wheel", context.services.pauseSpeechFollow, { passive: true });
context.ui.chatEl.addEventListener("touchmove", context.services.pauseSpeechFollow, { passive: true });
context.ui.chatEl.addEventListener("keydown", event => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) context.services.pauseSpeechFollow();
});
context.ui.pauseTimerBtnEl.addEventListener("click", context.services.pauseTimer);
context.ui.resumeTimerBtnEl.addEventListener("click", context.services.resumeTimer);
context.ui.resetTimerBtnEl.addEventListener("click", context.services.resetPhaseTimer);
context.ui.composerFormEl.addEventListener("submit", (event) => {
    event.preventDefault();
    context.services.submitComposerAction();
});
context.ui.micBtnEl.addEventListener("click", () => { void context.services.toggleRecording(); });
context.ui.computeHumanResultBtnEl.addEventListener("click", () => {
    if (context.services.usesAiFinalScoring()) return;
    try {
        const cards = context.services.collectHumanJudgeScorecards();
        const tally = context.services.computeVoteTally(cards);
        context.services.renderScorecards(cards, tally, "human");
        context.services.setStatus(context.services.l("Rendered result from human judges.", "Résultat généré à partir des juges humains."));
    } catch (error) {
        context.services.setStatus(error?.message || context.services.l("Could not compute the human-judge result.", "Impossible de calculer le résultat des juges humains."), true);
    }
});
document.querySelectorAll(".ask-judge-btn").forEach((button) => {
    button.addEventListener("click", () => {
        context.services.askHumanJudgeQuestion(Number(button.dataset.judge));
    });
});
context.ui.messageInputEl.addEventListener("pointerdown", () => {
    if (state.isRecording) {
        if (context.services.stopRecordingAndFinalize(context.services.l("Stopping recording so you can edit the draft.", "Arrêt de l’enregistrement pour vous permettre de modifier le brouillon."))) return;
    }
    if (state.voiceFinalizePending) context.services.setStatus(context.services.l("Finalizing the recording so you can edit the draft.", "Finalisation de l’enregistrement pour vous permettre de modifier le brouillon."));
});
context.ui.messageInputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && context.services.currentPhaseUsesMainComposer(context.services.getCurrentPhase())) {
        event.preventDefault();
        context.services.submitComposerAction();
    }
});
context.ui.messageInputEl.addEventListener("input", () => {
    context.services.syncActiveJudgeDraftFromMainComposer({ persist: true });
});
[
    context.ui.participantOneTypeSelectEl, context.ui.participantTwoTypeSelectEl, context.ui.participantOneModelSelectEl, context.ui.humanNameInputEl, context.ui.aiNameInputEl,
context.ui.judgeModeSelectEl, context.ui.judgePanelPresetSelectEl, context.ui.moderatorReadFullCaseSelectEl, context.ui.modelSelectEl, context.ui.case1TitleInputEl, context.ui.case1QuestionInputEl, context.ui.case1TextInputEl,
context.ui.case2TitleInputEl, context.ui.case2QuestionInputEl, context.ui.case2TextInputEl,
...context.ui.judgeInputs.flatMap((judge) => [judge.name, judge.question, ...Object.values(judge.humanBreakdown), ...Object.values(judge.aiBreakdown), judge.humanDidWell, judge.humanNeedsImprovement, judge.aiDidWell, judge.aiNeedsImprovement])
].forEach((el) => {
    el.addEventListener("input", context.services.saveSetup);
    el.addEventListener("change", context.services.saveSetup);
});
[context.ui.participantOneTypeSelectEl, context.ui.participantTwoTypeSelectEl].forEach(el => el.addEventListener("change", () => {
    context.services.syncParticipantSetupUi();
    context.services.refreshControls();
}));
context.ui.humanNameInputEl.addEventListener("input", context.services.refreshParticipantScoreLabels);
context.ui.aiNameInputEl.addEventListener("input", context.services.refreshParticipantScoreLabels);
context.ui.judgeModeSelectEl.addEventListener("change", context.services.refreshControls);
context.ui.judgePanelPresetSelectEl.addEventListener("change", context.services.refreshControls);
context.ui.judgeInputs.forEach((judge) => {
    [...Object.values(judge.humanBreakdown), ...Object.values(judge.aiBreakdown)].forEach(input => input.addEventListener("input", context.services.refreshHumanScoreTotals));
    judge.question.addEventListener("input", () => {
        const phase = context.services.getCurrentPhase();
        if (phase && state.phaseReady && context.services.isHumanJudgeQuestionPhase(phase) && phase.judgeNumber === judge.number && !state.isRecording && !state.voiceFinalizePending) {
            context.ui.messageInputEl.value = judge.question.value;
        }
    });
});
window.addEventListener("storage", () => {
    state.locale = normalizeLocale(
        new URLSearchParams(window.location.search).get("lang") ||
        localStorage.getItem(STORAGE_KEYS.locale) ||
        document.documentElement.lang ||
        navigator.language
    );
    context.state.locale = state.locale;
    context.services.applyLocaleToUi();
    context.services.loadSetup();
    context.services.refreshControls();
});
window.addEventListener("focus", () => {
    state.locale = normalizeLocale(
        new URLSearchParams(window.location.search).get("lang") ||
        localStorage.getItem(STORAGE_KEYS.locale) ||
        document.documentElement.lang ||
        navigator.language
    );
    context.state.locale = state.locale;
    context.services.applyLocaleToUi();
    window.ethicsArchiveController?.setLocale(context.state.locale);
    window.ethicsQuestionController?.setLocale();
    context.services.syncParticipantSetupUi();
    context.services.refreshParticipantScoreLabels();
    context.services.refreshControls();
    void context.services.refreshCredentialStatus({ force: true }).then(() => {
        context.services.refreshControls();
    }).catch((error) => {
        const detail = context.services.safeBridgeErrorMessage(error);
        context.services.setStatus(context.services.l(
            `Could not refresh provider credentials${detail ? `: ${detail}` : "."}`,
            `Impossible d’actualiser les identifiants des fournisseurs${detail ? ` : ${detail}` : "."}`
        ), true);
    });
});
window.addEventListener("pagehide", () => {
    context.services.stopSpeechPlayback(false, { resolveCallbacks: false, deliveryReason:"closed" });
    context.services.releaseMicrophoneStream();
});
window.addEventListener("beforeunload", () => {
    context.services.cancelHumanCoinCall();
    context.services.stopSpeechPlayback(false, { resolveCallbacks: false, deliveryReason:"closed" });
    context.services.releaseMicrophoneStream();
});
context.services.loadSetup();
context.services.initSiteLogo();
context.services.ensureSpeechUi();
context.services.fullReset();
context.services.applyLocaleToUi();
context.services.updateConfigBadges();
context.services.updateApiKeyUi();
context.services.refreshTimingTestUi();
context.services.refreshControls();
void context.services.initializeCredentialState();
try { context.state.caseArchiveOrigins = JSON.parse(localStorage.getItem(caseArchiveOriginsKey) || "{}"); } catch {}
if (!context.state.caseArchiveOrigins || typeof context.state.caseArchiveOrigins !== "object" || Array.isArray(context.state.caseArchiveOrigins)) context.state.caseArchiveOrigins = {};
[1, 2].forEach(slot => {
    ["Title", "Text"].forEach(field => document.getElementById(`case${slot}${field}Input`).addEventListener("input", () => {
        if (!context.state.caseArchiveOrigins?.[slot]) return;
        context.state.caseArchiveOrigins[slot].edited = true;
        localStorage.setItem(caseArchiveOriginsKey, JSON.stringify(context.state.caseArchiveOrigins));
        context.services.renderArchiveOrigins();
    }));
});
context.services.renderArchiveOrigins();
window.addEventListener("focus", context.services.renderArchiveOrigins);
window.ethicsArchiveController = window.EthicsCaseArchive?.mount({
    data: window.EthicsCaseArchiveData,
    locale: context.state.locale,
    onApply: (slot, selected) => {
        if (state.started) return;
        document.getElementById(`case${slot}TitleInput`).value = selected.title;
        document.getElementById(`case${slot}TextInput`).value = selected.text;
        document.getElementById(`case${slot}QuestionInput`).value = "";
        window.ethicsQuestionController?.setPacket(slot, selected);
        context.state.caseArchiveOrigins[slot] = { source: selected.source, locale: selected.locale, event: selected.event, edited: false };
        localStorage.setItem(caseArchiveOriginsKey, JSON.stringify(context.state.caseArchiveOrigins));
        context.services.renderArchiveOrigins();
        context.services.saveSetup();
        document.getElementById(`case${slot}QuestionInput`).focus();
    }
});
window.ethicsQuestionController = window.EthicsCaseArchive?.mountQuestionPickers({ locale: () => context.state.locale, onChange: context.services.saveSetup });
})();
