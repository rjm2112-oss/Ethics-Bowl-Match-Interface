const STORAGE_KEYS = {
    instructions: "debate.instructions",
    setup: "ethics.match.setup",
    locale: "ethics.match.locale"
};

const LOGO_CANDIDATES = Object.freeze([
    "ethics-bowl-logo.png",
    "assets/icon.png"
]);

const MODEL_CATALOG = window.EthicsModelCatalog;
if (!MODEL_CATALOG) throw new Error("The shared model catalog could not be loaded.");
const AI_TURN_PROMPTS = window.EthicsAiTurnPrompts;
if (!AI_TURN_PROMPTS) throw new Error("The shared AI turn prompt helpers could not be loaded.");
const PHASE_TIMER_POLICY = window.EthicsPhaseTimerPolicy;
if (!PHASE_TIMER_POLICY) throw new Error("The shared phase timer policy could not be loaded.");
const SPEECH_TIMING = window.EthicsSpeechTiming;
if (!SPEECH_TIMING) throw new Error("The shared speech timing helpers could not be loaded.");
const SCORECARD_TALLY = window.EthicsScorecardTally;
if (!SCORECARD_TALLY) throw new Error("The shared scorecard tally helpers could not be loaded.");

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
const STUDENT_REASONING_EFFORT = MODEL_CATALOG.REASONING_POLICIES.participant;
const JUDGE_REASONING_EFFORT = MODEL_CATALOG.REASONING_POLICIES.judge;
const AUDIO_MODELS = MODEL_CATALOG.AUDIO_MODELS;

const OFFICIAL_SCORE_SHEET_TEXT = `
Each judge scores each participant out of 60.

Authoritative scoring instructions:
- Use this rubric as authoritative.
- Score each criterion cumulatively from lower bands to higher bands.
- A higher band may be awarded only if the requirements of all lower bands in that criterion have been satisfied.
- If a lower-band requirement is missing, do not award a higher-band score in that criterion even if some higher-band qualities appear.
- Participants may address rubric elements in any order; score the substance, not the order.
- Within a score band, assign the lower number for weaker or more minimal evidence and the higher number for stronger or more consistent evidence.
- Be exact with the numerical score. A perfect score for a criterion is quite rare.

On the case the participant led:

1) Presentation criterion A: answered the moderator's question in a clear and coherent manner (0-5)
0-1: The participant did not present a clear, identifiable position in response to the moderator's question.
2-3: The participant presented a clear, identifiable position and supported it with identifiable reasons.
4-5: The participant satisfied the 2-3 band and the reasons were well articulated and jointly coherent.
Note: Score this criterion for clarity, coherence, systematicity, and structure only. A participant may score highly here even if the argument is not very convincing.

2) Presentation criterion B: discussed the moral and ethical dynamics of the case (0-5)
0-1: The participant did not unequivocally identify the deep moral tension or tensions at the heart of the case.
2-3: The participant identified the deep moral tension or tensions and applied moral concepts, such as duties, values, rights, or responsibilities, to relevant aspects of the case.
4-5: The participant satisfied the 2-3 band in a way that tackled the underlying moral tensions within the case.

3) Presentation criterion C: demonstrated the capacity and awareness of competing viewpoints, including those of the other participant (0-5)
0-1: The participant did not acknowledge strong, conflicting viewpoints that could reasonably support disagreement.
2-3: The participant acknowledged strong, conflicting viewpoints and charitably explained why they pose a serious challenge to the participant's position.
4-5: The participant satisfied the 2-3 band and argued that the participant's position better defuses the moral tension within the case.

4) Response to feedback from the other participant (0-10)
0-2: The participant did not prioritize the other participant's main suggestions, questions, and critiques.
3-5: The participant prioritized the main suggestions, questions, and critiques and charitably explained why they pose a serious challenge to the participant's position.
6-8: The participant satisfied the 3-5 band in a way that made the participant's position clearer.
9-10: The participant satisfied the 6-8 band and refined the participant's position, or clearly explained why such refinement was not required.

5) Responses to judges' questions (0-20)
0-5: The participant answered the judge's question clearly.
6-10: The participant satisfied the 0-5 band and explicitly explained how the question impacts the participant's position.
11-15: The participant satisfied the 6-10 band in a way that made the participant's position clearer.
16-20: The participant satisfied the 11-15 band and refined the participant's position, or clearly explained why such refinement was not required.

On the case the participant did not lead:

6) Commentary on the other participant's led case (0-10)
0-2: The participant developed a manageably small number of suggestions, questions, and critiques.
3-5: The participant satisfied the 0-2 band and constructively critiqued the presentation.
6-8: The participant satisfied the 3-5 band and focused on salient, important moral considerations.
9-10: The participant satisfied the 6-8 band and provided the presenting participant with novel options to modify their position.
Note: Commentary should be limited enough that the presenting participant could reasonably address all major points within the allotted response time.

Across the full match:

7) Respectful dialogue (0-5)
0-1: The participant acknowledged viewpoints different from their own.
2-3: The participant satisfied the 0-1 band in a way that demonstrated genuine reflection.
4-5: The participant satisfied the 2-3 band in a way that improved the participant's original position in light of the other participant's contributions, whether or not the participant agreed in the end.
Note: Do not score mere politeness alone. Look for intellectual virtues such as honesty, genuine reflection, and critical engagement.

Grand total: /60.
`;

const OFFICIAL_SCORE_CRITERION_KEYS = Object.freeze(Object.keys(SCORECARD_TALLY.OFFICIAL_BREAKDOWN_RANGES));

function buildFinalJudgeCriterionSchema(criterionKey) {
    const [minimum, maximum] = SCORECARD_TALLY.OFFICIAL_BREAKDOWN_RANGES[criterionKey];
    const bandLabels = SCORECARD_TALLY.OFFICIAL_THRESHOLD_BANDS[criterionKey].map((band) => band.label);
    return {
        type: "object",
        additionalProperties: false,
        required: ["score", "highestSatisfiedBand", "evidence", "limitation", "hasMaterialLimitation", "unmetNextThreshold"],
        properties: {
            score: {
                type: "integer",
                minimum,
                maximum,
                description: "Whole-number score that must fall inside highestSatisfiedBand."
            },
            highestSatisfiedBand: {
                type: "string",
                enum: bandLabels,
                description: "Highest rubric band fully supported by transcript evidence; use the lowest band as the fallback."
            },
            evidence: {
                type: "string",
                description: "Brief concrete transcript evidence establishing every threshold needed for the declared band."
            },
            limitation: {
                type: "string",
                description: "The most important weakness, omission, ambiguity, or inconsistency in this criterion; if none is material, identify any minor limitation or explicitly state that none was found."
            },
            hasMaterialLimitation: {
                type: "boolean",
                description: "True only when the limitation is substantive enough to constrain the score within the attained band."
            },
            unmetNextThreshold: {
                type: "string",
                description: "Specific unmet requirement in the next band, or state that no higher threshold exists when the top band is fully satisfied."
            }
        }
    };
}

function buildFinalJudgeParticipantSchema() {
    return {
        type: "object",
        additionalProperties: false,
        required: [...OFFICIAL_SCORE_CRITERION_KEYS, "comment"],
        properties: {
            ...Object.fromEntries(OFFICIAL_SCORE_CRITERION_KEYS.map((criterionKey) => [
                criterionKey,
                buildFinalJudgeCriterionSchema(criterionKey)
            ])),
            comment: { type: "string" }
        }
    };
}

const FINAL_JUDGE_SCORECARD_JSON_SCHEMA = {
    name: "final_judge_scorecard",
    strict: true,
    schema: {
        type: "object",
        additionalProperties: false,
        required: ["comment", "participantOne", "participantTwo"],
        properties: {
            comment: { type: "string" },
            participantOne: buildFinalJudgeParticipantSchema(),
            participantTwo: buildFinalJudgeParticipantSchema()
        }
    }
};

const HARDCODED_ETHICS_BOWL_RULES = `
This site hardcodes the official Ethics Bowl online-match rules, adapted from two teams to two single participants.

CASE STRUCTURE:
For each case, the order is:
1. Moderator introduces the case and reads the question.
2. Leading participant confers.
3. Leading participant presents.
4. Responding participant confers.
5. Responding participant comments.
6. Leading participant confers.
7. Leading participant responds.
8. Judges ask questions during that case's judges' period.
9. Judges score the case.

MATCH DECISION:
- Match decisions are based on judge votes, not cumulative score alone.
- The participant with more judge votes wins.
- If both participants receive 1.5 votes, the match is a tie.

ANY AI-CONTROLLED PARTICIPANT STYLE:
- Speak like one thoughtful participant.
- Never claim to be a team.
- Be concise, charitable, serious, and directly responsive.
- You are a single opponent, not a team. You must never speak as "we," "our team," or in any collective team voice.
- Do not refer to the other participant as he or she, only use the other participant's exact name when referring to them.

ANY AI-CONTROLLED PARTICIPANT:
You are scored on respectful Dialogue across the full match (0-5):
The participant acknowledged viewpoints different from their own in a way that demonstrated genuine reflection and improved the participant's original position in light of the other participant's contributions, whether or not the participant agreed in the end.
`;

const TIMINGS = Object.freeze({
    presentationConfer: 180,
    presentationSpeak: 300,
    commentaryConfer: 180,
    commentarySpeak: 180,
    responseConfer: 180,
    responseSpeak: 180,
    judgePeriodTotal: 600,
    judgeAsk: 60,
    judgeAnswer: 140
});

const MAX_JUDGE_QUESTION_CHARS = 500;
const CREDENTIAL_STATUS_TIMEOUT_MS = 4000;
const FINAL_SCORECARD_REQUEST_TIMEOUT_MS = 240000;
const MAX_TTS_CHARS = 2500;
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

const INITIAL_LOCALE = getInitialLocale();
let activeLocale = INITIAL_LOCALE;

function isFrenchLocale() {
    return activeLocale === "fr-ca";
}

function l(en, fr) {
    return isFrenchLocale() ? fr : en;
}

function caseLabel(caseNum) {
    return isFrenchLocale() ? `Cas ${caseNum}` : `Case #${caseNum}`;
}

function judgeLabel(judgeNumber) {
    return isFrenchLocale() ? `Juge ${judgeNumber}` : `Judge ${judgeNumber}`;
}

function moderatorLabel() {
    return l("Moderator", "Modérateur");
}

function coinSideLabel(value) {
    return value === "heads" ? l("heads", "face") : l("tails", "pile");
}

function phaseSubtypeLabel(subtype) {
    if (subtype === "presentation") return l("Presentation", "Présentation");
    if (subtype === "commentary") return l("Commentary", "Commentaire");
    if (subtype === "response") return l("Response", "Réplique");
    return subtype || "";
}

function normalizeParticipantMode(value) {
    return String(value || "").toLowerCase() === "ai" ? "ai" : "human";
}

function localizedHref(path, locale = activeLocale) {
    const url = new URL(path, window.location.href);
    url.searchParams.set("lang", normalizeLocale(locale));
    if (TIMING_TEST_MODE) url.searchParams.set("timingTest", "1");
    return url.toString();
}

function initSiteLogo() {
    const logoEls = Array.from(document.querySelectorAll("[data-logo-slot]"));
    const fallbackEls = Array.from(document.querySelectorAll("[data-logo-fallback]"));
    if (!logoEls.length) return;

    let index = 0;

    const showFallbacks = () => {
        logoEls.forEach((el) => { el.hidden = true; });
        fallbackEls.forEach((el) => { el.hidden = false; });
    };

    const showLogos = (candidate) => {
        logoEls.forEach((el) => {
            el.src = candidate;
            el.hidden = false;
        });
        fallbackEls.forEach((el) => { el.hidden = true; });
    };

    const tryNext = () => {
        if (index >= LOGO_CANDIDATES.length) {
            showFallbacks();
            return;
        }

        const candidate = LOGO_CANDIDATES[index];
        const probe = new Image();
        probe.onload = () => showLogos(candidate);
        probe.onerror = () => {
            index += 1;
            tryNext();
        };
        probe.src = candidate;
    };

    tryNext();
}

function applyStaticTranslations(root = document) {
    root.querySelectorAll("[data-i18n-en][data-i18n-fr]").forEach((el) => {
        el.textContent = isFrenchLocale() ? el.dataset.i18nFr : el.dataset.i18nEn;
    });
    root.querySelectorAll("[data-i18n-placeholder-en][data-i18n-placeholder-fr]").forEach((el) => {
        el.placeholder = isFrenchLocale() ? el.dataset.i18nPlaceholderFr : el.dataset.i18nPlaceholderEn;
    });
    root.querySelectorAll("[data-i18n-title-en][data-i18n-title-fr]").forEach((el) => {
        el.title = isFrenchLocale() ? el.dataset.i18nTitleFr : el.dataset.i18nTitleEn;
    });
}

function localeDirectiveForModels() {
    return isFrenchLocale()
    ? "All user-facing output must be in natural Québec French. Moderator text, judge questions, participant speeches, and scorecard comments must all be in Québec French. Do not switch to English unless directly quoting source text that is itself English."
    : "";
}

const chatEl = document.getElementById("chat");
const emptyStateEl = document.getElementById("emptyState");
const statusLineEl = document.getElementById("statusLine");
const appHeroEl = document.getElementById("appHero");
const appStatusStripEl = document.getElementById("appStatusStrip");
const instructionsBadgeEl = document.getElementById("instructionsBadge");
const instructionsLinkEl = document.getElementById("instructionsLink");
const localeToggleBtnEl = document.getElementById("localeToggleBtn");
const setupScreenEl = document.getElementById("setupScreen");
const matchScreenEl = document.getElementById("matchScreen");

const participantOneTypeSelectEl = document.getElementById("participantOneTypeSelect");
const participantOneModelWrapEl = document.getElementById("participantOneModelWrap");
const participantOneModelSelectEl = document.getElementById("participantOneModelSelect");
const humanNameInputEl = document.getElementById("humanNameInput");
const aiNameInputEl = document.getElementById("aiNameInput");
const coinCallSelectEl = document.getElementById("coinCallSelect");
const judgeModeSelectEl = document.getElementById("judgeModeSelect");
const voiceModeSelectEl = document.getElementById("voiceModeSelect");
const moderatorReadFullCaseSelectEl = document.getElementById("moderatorReadFullCaseSelect");
const modelSelectEl = document.getElementById("modelSelect");

const case1TitleInputEl = document.getElementById("case1TitleInput");
const case1QuestionInputEl = document.getElementById("case1QuestionInput");
const case1TextInputEl = document.getElementById("case1TextInput");

const case2TitleInputEl = document.getElementById("case2TitleInput");
const case2QuestionInputEl = document.getElementById("case2QuestionInput");
const case2TextInputEl = document.getElementById("case2TextInput");

const startMatchBtnEl = document.getElementById("startMatchBtn");
const resetMatchBtnEl = document.getElementById("resetMatchBtn");
const newMatchBtnEl = document.getElementById("newMatchBtn");
const nextActionBtnEl = document.getElementById("nextActionBtn");

const coinChoicePanelEl = document.getElementById("coinChoicePanel");
const coinTossCardEl = document.getElementById("coinTossCard");
const coinTossStatusEl = document.getElementById("coinTossStatus");
const coinTossAnimationEl = document.getElementById("coinTossAnimation");
const coinTossCoinEl = document.getElementById("coinTossCoin");
const leadBtnEl = document.getElementById("leadBtn");
const passBtnEl = document.getElementById("passBtn");

const currentPhaseTitleEl = document.getElementById("currentPhaseTitle");
const currentPhaseMetaEl = document.getElementById("currentPhaseMeta");
const phaseListEl = document.getElementById("phaseList");

const timerDisplayEl = document.getElementById("timerDisplay");
const timerHintEl = document.getElementById("timerHint");
const timerControlButtonsEl = document.getElementById("timerControlButtons");
const pauseTimerBtnEl = document.getElementById("pauseTimerBtn");
const resumeTimerBtnEl = document.getElementById("resumeTimerBtn");
const resetTimerBtnEl = document.getElementById("resetTimerBtn");
const timingTestPanelEl = document.getElementById("timingTestPanel");
const timingTestModeNoteEl = document.getElementById("timingTestModeNote");
const timingTestResultsEl = document.getElementById("timingTestResults");

const composerFormEl = document.getElementById("composerForm");
const messageInputEl = document.getElementById("messageInput");
const submitTurnBtnEl = document.getElementById("submitTurnBtn");
const micBtnEl = document.getElementById("micBtn");
const liveVoiceWrapEl = document.getElementById("liveVoiceWrap");
const liveVoicePreviewEl = document.getElementById("liveVoicePreview");

const judgePanelDefaultEl = document.getElementById("judgePanelDefault");
const aiJudgePanelEl = document.getElementById("aiJudgePanel");
const humanJudgePanelEl = document.getElementById("humanJudgePanel");
const computeHumanResultBtnEl = document.getElementById("computeHumanResultBtn");

const scoreSummaryEl = document.getElementById("scoreSummary");
const scoreCardsEl = document.getElementById("scoreCards");
const matchSetupSummaryEl = document.getElementById("matchSetupSummary");
const matchCase1CardEl = document.getElementById("matchCase1Card");
const matchCase1SummaryEl = document.getElementById("matchCase1Summary");
const matchCase1MetaEl = document.getElementById("matchCase1Meta");
const matchCase1QuestionEl = document.getElementById("matchCase1Question");
const matchCase1TextEl = document.getElementById("matchCase1Text");
const matchCase2CardEl = document.getElementById("matchCase2Card");
const matchCase2SummaryEl = document.getElementById("matchCase2Summary");
const matchCase2MetaEl = document.getElementById("matchCase2Meta");
const matchCase2QuestionEl = document.getElementById("matchCase2Question");
const matchCase2TextEl = document.getElementById("matchCase2Text");

const judgeInputs = [1, 2, 3].map((n) => ({
    number: n,
    name: document.getElementById(`judge${n}Name`),
                                          status: document.getElementById(`judge${n}Status`),
                                          question: document.getElementById(`judge${n}Question`),
                                          humanScore: document.getElementById(`judge${n}HumanScore`),
                                          aiScore: document.getElementById(`judge${n}AiScore`),
                                          comment: document.getElementById(`judge${n}Comment`)
}));

let stopSpeechBtnEl = null;
let composerModeIndicatorEl = null;
let manageApiKeysBtnEl = null;
let apiKeyStatusBadgeEl = null;
let apiKeyDialogEl = null;
let apiKeyDialogEyebrowEl = null;
let apiKeyDialogTitleEl = null;
let apiKeyDialogCopyEl = null;
let apiKeyDialogCloseBtnEl = null;
let initialCredentialDialogShown = false;
const credentialUiByProvider = {};
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

const state = {
    locale: INITIAL_LOCALE,
    transcript: [],
    phases: [],
    currentPhaseIndex: -1,
    busy: false,
    liveScreenActive: false,
    started: false,
    completed: false,
    waitingForCoinChoice: false,
    showCoinTossCeremony: false,
    coinTossAnimating: false,
    coinCall: "",
    coinResult: "",
    coinWinner: "",
    phaseReady: false,
    phaseAwaitingPlaybackForId: "",
    pendingAutoActionPhaseId: "",
    autoGenerationBlockedPhaseId: "",
    matchRunId: 0,
    leadByCase: { 1: "human", 2: "ai" },
    names: { human: "Human", ai: "AI Opponent" },
    participantTypes: { human: "human", ai: "ai" },
    participantModels: { human: DEFAULT_PARTICIPANT_MODEL, ai: DEFAULT_PARTICIPANT_MODEL },
    judgeModel: DEFAULT_JUDGE_MODEL,
    aiFinalJudgeScorecards: {},
    aiFinalJudgeScoringPromises: {},
    aiFinalJudgeScoringErrors: {},
    cases: {
        1: { title: "", question: "", text: "" },
        2: { title: "", question: "", text: "" }
    },
    judgeMode: "ai",
    moderatorReadsFullCase: false,
    judgeQuestionCache: { 1: [], 2: [] },
    aiJudgeQuestionDraftCache: { 1: [], 2: [] },
    lastJudgeQuestionByCase: { 1: "", 2: "" },
    askedJudgeQuestions: {},
    aiJudgeQuestionDraftPromises: {},
    aiJudgeQuestionDraftErrors: {},
    aiJudgeQuestionPreparationPromises: {},
    aiJudgeQuestionPreparationErrors: {},
    aiPreparedTurns: {},
    aiPreparationSnapshots: {},
    aiPreparationPromises: {},
    aiPreparationErrors: {},
    mainComposerHydratedPhaseId: "",
    timer: {
        intervalId: null,
        remaining: 0,
        phaseId: "",
        warnedKeys: new Set(),
        running: false
    },
    mediaRecorder: null,
    mediaStream: null,
    audioChunks: [],
    isRecording: false,
    draftBeforeRecording: "",
    finalTranscriptionRequestId: 0,
    voiceFinalizePending: false,
    pendingVoiceSubmission: null,
    speechQueue: [],
    speechProcessing: false,
    speechToken: 0,
    speechAudioEl: null,
    currentAudioUrl: "",
    currentSpeechController: null,
    currentSpeechControllerKind: "",
    currentSpeechReject: null,
    openAiSpeechLookaheadPromise: null,
    openAiSpeechLookaheadPrepared: null,
    openAiSpeechLookaheadEntry: null,
    wholeSpeechPreparations: new Map(),
    wholeSpeechPendingTranscriptIndexes: new Set(),
    speechPlaybackActive: false,
    lastSpeechEndedAtMs: 0,
        speechProgressMessageIndex: -1,
        speechProgressNormalizedCursor: 0,
        speechProgressReadTo: 0,
        speechProgressSpeakStart: 0,
        speechProgressSpeakEnd: 0,
    speechFollowRaf: null,
    speechFollowWantsSmooth: false,
    speechChunkCounts: new Map(),
    speechStartCallbacks: new Map(),
    speechCompletionCallbacks: new Map(),
    timingTestMeasurements: new Map(),
    timingTestResults: [],
    timingTestAudioContext: null,
    timingPreviewAudioEl: null,
    timingPreviewToken: 0,
    timingPreviewTranscriptIndex: -1,
    timingPreviewResolve: null
};

function sanitizeText(value) {
    return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

function clipText(value, max = 15000) {
    const text = String(value || "");
    return text.length > max ? `${text.slice(0, max)}\n\n[Text clipped for brevity.]` : text;
}

function normalizeSpeechText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
}

function combineDraftAndSpeech(draft, speech) {
    const left = String(draft || "").trim();
    const right = normalizeSpeechText(speech);
    if (!left) return right;
    if (!right) return left;
    return `${left} ${right}`.trim();
}

function ensureApiKeyUi() {
    manageApiKeysBtnEl = document.getElementById("manageApiKeysBtn");
    if (!manageApiKeysBtnEl) {
        const host = localeToggleBtnEl?.parentElement || instructionsLinkEl?.parentElement;
        if (host) {
            manageApiKeysBtnEl = document.createElement("button");
            manageApiKeysBtnEl.type = "button";
            manageApiKeysBtnEl.id = "manageApiKeysBtn";
            manageApiKeysBtnEl.className = "nav-btn";
            if (localeToggleBtnEl?.parentElement === host) host.insertBefore(manageApiKeysBtnEl, localeToggleBtnEl);
            else host.appendChild(manageApiKeysBtnEl);
        }
    }

    apiKeyStatusBadgeEl = document.getElementById("apiKeyStatusBadge");
    if (!apiKeyStatusBadgeEl) {
        const badge = document.createElement("span");
        badge.id = "apiKeyStatusBadge";
        badge.className = "status-chip inactive";
        if (instructionsBadgeEl?.parentElement) instructionsBadgeEl.insertAdjacentElement("afterend", badge);
        else if (statusLineEl?.parentElement) statusLineEl.parentElement.insertBefore(badge, statusLineEl);
        apiKeyStatusBadgeEl = badge;
    }

    apiKeyDialogEl = document.getElementById("apiKeyDialog");
    if (!apiKeyDialogEl) {
        const dialog = document.createElement("dialog");
        dialog.id = "apiKeyDialog";
        dialog.className = "local-api-key-dialog";
        dialog.innerHTML = `
        <div class="local-api-key-dialog-card">
          <div class="local-api-key-dialog-head">
            <div>
              <div id="apiKeyDialogEyebrow" class="eyebrow"></div>
              <h2 id="apiKeyDialogTitle"></h2>
              <p id="apiKeyDialogCopy" class="hero-copy"></p>
            </div>
            <button type="button" id="apiKeyDialogCloseBtn" class="ghost-btn"></button>
          </div>
          <div class="credential-provider-grid">
            ${["openai", "anthropic"].map((provider) => `
              <section class="local-api-key-section credential-provider-card" data-credential-provider="${provider}">
                <div class="credential-provider-head">
                  <div class="phase-title" data-credential-name></div>
                  <div class="status-chip inactive" data-credential-status></div>
                </div>
                <div class="small-note" data-credential-source></div>
                <label class="credential-input-label" for="${provider}CredentialInput" data-credential-input-label></label>
                <input id="${provider}CredentialInput" data-credential-input type="password" autocomplete="new-password" spellcheck="false" />
                <div class="button-cluster">
                  <button type="button" class="primary-btn" data-credential-save></button>
                  <button type="button" class="ghost-btn" data-credential-remove></button>
                </div>
              </section>
            `).join("")}
          </div>
        </div>
        `;
        document.body.appendChild(dialog);
        apiKeyDialogEl = dialog;
    }

    apiKeyDialogEyebrowEl = document.getElementById("apiKeyDialogEyebrow");
    apiKeyDialogTitleEl = document.getElementById("apiKeyDialogTitle");
    apiKeyDialogCopyEl = document.getElementById("apiKeyDialogCopy");
    apiKeyDialogCloseBtnEl = document.getElementById("apiKeyDialogCloseBtn");

    apiKeyDialogEl.querySelectorAll("[data-credential-provider]").forEach((card) => {
        const provider = card.dataset.credentialProvider;
        const refs = {
            card,
            name: card.querySelector("[data-credential-name]"),
            status: card.querySelector("[data-credential-status]"),
            source: card.querySelector("[data-credential-source]"),
            inputLabel: card.querySelector("[data-credential-input-label]"),
            input: card.querySelector("[data-credential-input]"),
            save: card.querySelector("[data-credential-save]"),
            remove: card.querySelector("[data-credential-remove]")
        };
        credentialUiByProvider[provider] = refs;
        if (refs.save && refs.save.dataset.bound !== "1") {
            refs.save.dataset.bound = "1";
            refs.save.addEventListener("click", () => { void saveProviderCredential(provider); });
        }
        if (refs.remove && refs.remove.dataset.bound !== "1") {
            refs.remove.dataset.bound = "1";
            refs.remove.addEventListener("click", () => { void removeProviderCredential(provider); });
        }
        if (refs.input && refs.input.dataset.bound !== "1") {
            refs.input.dataset.bound = "1";
            refs.input.addEventListener("keydown", (event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                void saveProviderCredential(provider);
            });
        }
    });

    if (manageApiKeysBtnEl && manageApiKeysBtnEl.dataset.bound !== "1") {
        manageApiKeysBtnEl.dataset.bound = "1";
        manageApiKeysBtnEl.addEventListener("click", () => openApiKeyDialog());
    }

    if (apiKeyDialogCloseBtnEl && apiKeyDialogCloseBtnEl.dataset.bound !== "1") {
        apiKeyDialogCloseBtnEl.dataset.bound = "1";
        apiKeyDialogCloseBtnEl.addEventListener("click", () => {
            closeApiKeyDialog();
            refreshControls();
        });
    }

    if (apiKeyDialogEl && apiKeyDialogEl.dataset.bound !== "1") {
        apiKeyDialogEl.dataset.bound = "1";
        apiKeyDialogEl.addEventListener("cancel", () => {
            refreshControls();
        });
    }
}

function updateApiKeyUiText() {
    if (manageApiKeysBtnEl) manageApiKeysBtnEl.textContent = l("AI Credentials", "Identifiants IA");
    if (apiKeyDialogEyebrowEl) apiKeyDialogEyebrowEl.textContent = l("Local provider setup", "Configuration locale des fournisseurs");
    if (apiKeyDialogTitleEl) apiKeyDialogTitleEl.textContent = l("AI provider credentials", "Identifiants des fournisseurs IA");
    if (apiKeyDialogCopyEl) {
        apiKeyDialogCopyEl.textContent = l(
            "Keys are stored by the desktop app and are never shown here. Enter a key only when you want to save or replace it.",
            "Les clés sont conservées par l’application de bureau et ne sont jamais affichées ici. Entrez une clé seulement pour l’enregistrer ou la remplacer."
        );
    }
    if (apiKeyDialogCloseBtnEl) apiKeyDialogCloseBtnEl.textContent = l("Close", "Fermer");
}

function providerLabel(provider) {
    return MODEL_CATALOG.getProvider(provider)?.label || titleCase(provider);
}

function hasCredential(provider) {
    return !!credentialState.byProvider[provider]?.configured;
}

function hasDesktopBridge() {
    return typeof window.ethicsApi?.credentials?.status === "function"
        && typeof window.ethicsApi?.ai?.generate === "function"
        && typeof window.ethicsApi?.audio?.transcribe === "function";
}

function desktopLaunchMessage() {
    return l(
        "Open the Ethics Bowl desktop app; this raw HTML page cannot securely access provider credentials.",
        "Ouvrez l’application de bureau de la Coupe éthique; cette page HTML brute ne peut pas accéder aux identifiants de façon sécurisée."
    );
}

function getCredentialsBridge() {
    const bridge = window.ethicsApi?.credentials;
    if (!bridge || typeof bridge.status !== "function" || typeof bridge.save !== "function" || typeof bridge.remove !== "function") {
        throw new Error(l("The desktop credential bridge is unavailable.", "Le pont d’identifiants de l’application de bureau n’est pas disponible."));
    }
    return bridge;
}

async function refreshCredentialStatus({ force = false } = {}) {
    if (credentialState.loadingPromise) return credentialState.loadingPromise;
    if (credentialState.loaded && !force) return credentialState.byProvider;
    let trackedPromise = null;
    trackedPromise = (async () => {
        try {
            const rows = await Promise.race([
                getCredentialsBridge().status(),
                new Promise((_, reject) => window.setTimeout(
                    () => reject(new Error(l("Credential status timed out.", "La vérification des identifiants a expiré."))),
                    CREDENTIAL_STATUS_TIMEOUT_MS
                ))
            ]);
            for (const provider of ["openai", "anthropic"]) {
                const row = Array.isArray(rows) ? rows.find((item) => item?.provider === provider) : null;
                credentialState.byProvider[provider] = {
                    configured: !!row?.configured,
                    source: sanitizeText(row?.source || "")
                };
            }
            credentialState.lastError = "";
            return credentialState.byProvider;
        } catch (error) {
            for (const provider of ["openai", "anthropic"]) {
                credentialState.byProvider[provider] = { configured: false, source: "" };
            }
            credentialState.lastError = safeBridgeErrorMessage(error) || l("Credential status is unavailable.", "L’état des identifiants n’est pas disponible.");
            throw error;
        } finally {
            credentialState.loaded = true;
            updateApiKeyUi();
        }
    })().finally(() => {
        if (credentialState.loadingPromise === trackedPromise) credentialState.loadingPromise = null;
    });
    credentialState.loadingPromise = trackedPromise;
    updateApiKeyUi();
    return trackedPromise;
}

function safeBridgeErrorMessage(error) {
    return sanitizeText(error?.message || "")
        .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted]")
        .slice(0, 500);
}

function credentialSourceLabel(source) {
    if (source === "environment") return l("Local environment", "Environnement local");
    if (source === "stored") return l("Desktop credential storage", "Stockage d’identifiants de l’application");
    return sanitizeText(source);
}

function updateProviderCredentialCards() {
    for (const provider of ["openai", "anthropic"]) {
        const refs = credentialUiByProvider[provider];
        if (!refs) continue;
        const label = providerLabel(provider);
        const record = credentialState.byProvider[provider];
        const pending = credentialState.pendingProvider === provider;
        const environmentBacked = record.source === "environment";
        const bridgeAvailable = hasDesktopBridge();
        if (refs.name) refs.name.textContent = label;
        if (refs.status) {
            refs.status.textContent = !credentialState.loaded
                ? l("Checking", "Vérification")
                : record.configured
                ? l("Configured", "Configuré")
                : l("Not configured", "Non configuré");
            refs.status.className = `status-chip ${record.configured ? "active" : "inactive"}`;
        }
        if (refs.source) {
            refs.source.textContent = !bridgeAvailable
                ? desktopLaunchMessage()
                : record.configured
                ? record.source
                    ? l(`Credential source: ${credentialSourceLabel(record.source)}`, `Source de l’identifiant : ${credentialSourceLabel(record.source)}`)
                    : l("A credential is configured.", "Un identifiant est configuré.")
                : l(`Add a ${label} API key to use ${label} models.`, `Ajoutez une clé API ${label} pour utiliser les modèles ${label}.`);
        }
        if (refs.inputLabel) refs.inputLabel.textContent = record.configured
            ? l(`Replace ${label} API key`, `Remplacer la clé API ${label}`)
            : l(`${label} API key`, `Clé API ${label}`);
        if (refs.input) {
            refs.input.placeholder = l(`Enter ${label} API key`, `Entrez la clé API ${label}`);
            refs.input.disabled = pending || !bridgeAvailable;
        }
        if (refs.save) {
            refs.save.textContent = pending
                ? l("Saving...", "Enregistrement...")
                : record.configured
                ? l("Replace key", "Remplacer la clé")
                : l("Save key", "Enregistrer la clé");
            refs.save.disabled = pending || !bridgeAvailable;
        }
        if (refs.remove) {
            refs.remove.textContent = l("Remove", "Supprimer");
            refs.remove.hidden = environmentBacked;
            refs.remove.disabled = pending || !record.configured || environmentBacked || !bridgeAvailable;
        }
    }
}

function updateApiKeyStatusUi() {
    if (!apiKeyStatusBadgeEl) return;
    if (!hasDesktopBridge()) {
        apiKeyStatusBadgeEl.textContent = l("Desktop app required", "Application de bureau requise");
        apiKeyStatusBadgeEl.className = "status-chip inactive";
        apiKeyStatusBadgeEl.title = desktopLaunchMessage();
        return;
    }
    if (!credentialState.loaded) {
        apiKeyStatusBadgeEl.textContent = l("Checking AI credentials", "Vérification des identifiants IA");
        apiKeyStatusBadgeEl.className = "status-chip subtle";
        return;
    }
    if (credentialState.lastError) {
        apiKeyStatusBadgeEl.textContent = l("Credential check failed", "Échec de la vérification des identifiants");
        apiKeyStatusBadgeEl.className = "status-chip inactive";
        apiKeyStatusBadgeEl.title = credentialState.lastError;
        return;
    }
    const configured = ["openai", "anthropic"].filter(hasCredential);
    if (configured.length === 2) {
        apiKeyStatusBadgeEl.textContent = l("OpenAI & Anthropic configured", "OpenAI et Anthropic configurés");
        apiKeyStatusBadgeEl.className = "status-chip active";
    } else if (configured.length === 1) {
        const ready = providerLabel(configured[0]);
        const missing = providerLabel(configured[0] === "openai" ? "anthropic" : "openai");
        apiKeyStatusBadgeEl.textContent = l(`${ready} configured • ${missing} not configured`, `${ready} configuré • ${missing} non configuré`);
        apiKeyStatusBadgeEl.className = "status-chip subtle";
    } else {
        apiKeyStatusBadgeEl.textContent = l("AI credentials required", "Identifiants IA requis");
        apiKeyStatusBadgeEl.className = "status-chip inactive";
    }
    apiKeyStatusBadgeEl.title = l("Open the credential panel to save, replace, or remove provider keys.", "Ouvrez le panneau d’identifiants pour enregistrer, remplacer ou supprimer les clés des fournisseurs.");
}

function updateApiKeyUi() {
    ensureApiKeyUi();
    updateApiKeyUiText();
    updateProviderCredentialCards();
    updateApiKeyStatusUi();
}

function openApiKeyDialog(focusProvider = "") {
    updateApiKeyUi();
    if (!apiKeyDialogEl) return;

    if (typeof apiKeyDialogEl.showModal === "function") {
        if (!apiKeyDialogEl.open) apiKeyDialogEl.showModal();
    } else {
        apiKeyDialogEl.setAttribute("open", "open");
    }

    void refreshCredentialStatus({ force: true }).then(() => {
        updateApiKeyUi();
        refreshControls();
    }).catch(() => {
        setStatus(l("Could not refresh provider credential status.", "Impossible d’actualiser l’état des identifiants des fournisseurs."), true);
    });

    window.setTimeout(() => {
        const preferred = credentialUiByProvider[focusProvider]?.input;
        (preferred || credentialUiByProvider.openai?.input || credentialUiByProvider.anthropic?.input)?.focus();
    }, 0);
}

function closeApiKeyDialog() {
    if (!apiKeyDialogEl) return;
    if (typeof apiKeyDialogEl.close === "function") {
        if (apiKeyDialogEl.open) apiKeyDialogEl.close();
    } else {
        apiKeyDialogEl.removeAttribute("open");
    }
}

async function saveProviderCredential(provider) {
    const refs = credentialUiByProvider[provider];
    const key = sanitizeText(refs?.input?.value || "");
    if (!key) {
        setStatus(l(`Enter a ${providerLabel(provider)} API key first.`, `Entrez d’abord une clé API ${providerLabel(provider)}.`), true);
        refs?.input?.focus();
        return;
    }
    credentialState.pendingProvider = provider;
    updateApiKeyUi();
    try {
        await getCredentialsBridge().save(provider, key);
        if (refs?.input) refs.input.value = "";
        credentialState.loaded = false;
        credentialState.lastError = "";
        await refreshCredentialStatus({ force: true });
        updateApiKeyUi();
        refreshControls();
        setStatus(l(`${providerLabel(provider)} credential saved.`, `Identifiant ${providerLabel(provider)} enregistré.`));
    } catch (error) {
        const detail = safeBridgeErrorMessage(error);
        setStatus(l(
            `Could not save the ${providerLabel(provider)} credential${detail ? `: ${detail}` : "."}`,
            `Impossible d’enregistrer l’identifiant ${providerLabel(provider)}${detail ? ` : ${detail}` : "."}`
        ), true);
    } finally {
        credentialState.pendingProvider = "";
        updateApiKeyUi();
    }
}

async function removeProviderCredential(provider) {
    credentialState.pendingProvider = provider;
    updateApiKeyUi();
    try {
        await getCredentialsBridge().remove(provider);
        credentialState.loaded = false;
        credentialState.lastError = "";
        await refreshCredentialStatus({ force: true });
        refreshControls();
        setStatus(l(`${providerLabel(provider)} credential removed.`, `Identifiant ${providerLabel(provider)} supprimé.`));
    } catch (error) {
        const detail = safeBridgeErrorMessage(error);
        setStatus(l(
            `Could not remove the ${providerLabel(provider)} credential${detail ? `: ${detail}` : "."}`,
            `Impossible de supprimer l’identifiant ${providerLabel(provider)}${detail ? ` : ${detail}` : "."}`
        ), true);
    } finally {
        credentialState.pendingProvider = "";
        updateApiKeyUi();
    }
}

async function maybeShowInitialApiKeyDialog() {
    if (initialCredentialDialogShown) return;
    initialCredentialDialogShown = true;
    try {
        await refreshCredentialStatus();
    } catch {
        return;
    }
    if (!hasCredential("openai") && !hasCredential("anthropic")) openApiKeyDialog();
}

function normalizeMatchModel(value) {
    const normalized = String(value || "").trim();
    return MODEL_CATALOG.isSupportedModel(normalized)
    ? normalized
    : DEFAULT_PARTICIPANT_MODEL;
}

function getMatchModel(modelId) {
    return MODEL_CATALOG.getModel(normalizeMatchModel(modelId));
}

function getModelProvider(modelId) {
    return MODEL_CATALOG.getProviderForModel(String(modelId || "").trim());
}

function formatModelLabel(modelId, { includeProvider = true } = {}) {
    const model = getMatchModel(modelId);
    if (!model) return String(modelId || "");
    return includeProvider ? `${model.label} (${providerLabel(model.provider)})` : model.label;
}

function populateMatchModelSelect(selectEl, selectedValue = DEFAULT_PARTICIPANT_MODEL) {
    if (!selectEl) return;
    const finalValue = normalizeMatchModel(selectedValue || selectEl.value || DEFAULT_PARTICIPANT_MODEL);
    selectEl.innerHTML = "";
    for (const provider of ["openai", "anthropic"]) {
        const group = document.createElement("optgroup");
        group.label = providerLabel(provider);
        AVAILABLE_MATCH_MODELS.filter((model) => model.provider === provider).forEach((model) => {
            const option = document.createElement("option");
            option.value = model.id;
            option.textContent = model.label;
            group.appendChild(option);
        });
        selectEl.appendChild(group);
    }
    selectEl.value = finalValue;
}

function populateAllMatchModelSelects() {
    populateMatchModelSelect(participantOneModelSelectEl, participantOneModelSelectEl?.value || DEFAULT_PARTICIPANT_MODEL);
    populateMatchModelSelect(modelSelectEl, modelSelectEl?.value || DEFAULT_PARTICIPANT_MODEL);
}

function getStoredText(key) {
    return sanitizeText(localStorage.getItem(key) || "");
}

function setStatus(text, isError = false) {
    statusLineEl.textContent = text || "";
    statusLineEl.classList.toggle("error", !!isError);
}

function setBusy(flag) {
    state.busy = !!flag;
    refreshControls();
    if (!state.busy) maybeAutoTriggerCurrentPhase();
}

function blockAutoGenerationForPhase(phaseId) {
    if (!phaseId) return;
    state.autoGenerationBlockedPhaseId = phaseId;
}

function clearAutoGenerationBlock(phaseId = "") {
    if (!phaseId || state.autoGenerationBlockedPhaseId === phaseId) {
        state.autoGenerationBlockedPhaseId = "";
    }
}

function formatBubbleTime(isoString) {
    try {
        return new Date(isoString).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } catch {
        return "";
    }
}

function formatClock(totalSeconds) {
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "--:--";
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function countWords(value) {
    const text = sanitizeText(value);
    if (!text) return 0;

    const matches = text.match(/[\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*/gu);
    return matches ? matches.length : 0;
}

function formatPreciseDuration(totalSeconds) {
    const centiseconds = Math.max(0, Math.round((Number(totalSeconds) || 0) * 100));
    const minutes = Math.floor(centiseconds / 6000);
    const seconds = Math.floor((centiseconds % 6000) / 100);
    const fraction = centiseconds % 100;
    return `${minutes}:${String(seconds).padStart(2, "0")}.${String(fraction).padStart(2, "0")}`;
}

function getTimingTestFastForwardForMessage() {
    return TIMING_TEST_MODE;
}

function ensureTimingPreviewAudioEl() {
    if (state.timingPreviewAudioEl && document.body.contains(state.timingPreviewAudioEl)) {
        return state.timingPreviewAudioEl;
    }
    const audioEl = document.createElement("audio");
    audioEl.preload = "auto";
    audioEl.hidden = true;
    audioEl.setAttribute("aria-hidden", "true");
    if ("preservesPitch" in audioEl) audioEl.preservesPitch = true;
    if ("webkitPreservesPitch" in audioEl) audioEl.webkitPreservesPitch = true;
    document.body.appendChild(audioEl);
    state.timingPreviewAudioEl = audioEl;
    return audioEl;
}

function stopTimingTestPreview({ rerender = true } = {}) {
    state.timingPreviewToken += 1;
    state.timingPreviewTranscriptIndex = -1;
    const resolveCurrent = state.timingPreviewResolve;
    state.timingPreviewResolve = null;
    const audioEl = state.timingPreviewAudioEl;
    if (audioEl) {
        try {
            audioEl.pause();
            audioEl.currentTime = 0;
        } catch {}
        audioEl.onended = null;
        audioEl.onerror = null;
        audioEl.removeAttribute("src");
        try { audioEl.load(); } catch {}
    }
    if (typeof resolveCurrent === "function") resolveCurrent();
    if (rerender) renderTimingTestResults();
}

function revokeTimingTestAudioChunks(chunks) {
    (chunks || []).forEach((chunk) => {
        if (!chunk?.audioUrl) return;
        try { URL.revokeObjectURL(chunk.audioUrl); } catch {}
        chunk.audioUrl = "";
    });
}

function clearTimingTestAudioCache() {
    stopTimingTestPreview({ rerender: false });
    state.timingTestMeasurements.forEach((measurement) => {
        revokeTimingTestAudioChunks(measurement?.audioChunks);
    });
    state.timingTestResults.forEach((result) => {
        revokeTimingTestAudioChunks(result?.audioChunks);
    });
}

async function playTimingTestResult(result) {
    if (!result?.audioChunks?.length) return;
    if (state.timingPreviewTranscriptIndex === result.transcriptIndex) {
        stopTimingTestPreview();
        return;
    }

    stopTimingTestPreview({ rerender: false });
    const token = state.timingPreviewToken;
    state.timingPreviewTranscriptIndex = result.transcriptIndex;
    renderTimingTestResults();
    const audioEl = ensureTimingPreviewAudioEl();
    const playbackRate = result.playbackPlan.playbackRate;

    try {
        for (const chunk of result.audioChunks) {
            if (token !== state.timingPreviewToken || !chunk?.audioUrl) break;
            await new Promise((resolve, reject) => {
                let settled = false;
                const finish = (error = null) => {
                    if (settled) return;
                    settled = true;
                    if (state.timingPreviewResolve === finish) state.timingPreviewResolve = null;
                    audioEl.onended = null;
                    audioEl.onerror = null;
                    if (error) reject(error);
                    else resolve();
                };
                state.timingPreviewResolve = finish;
                audioEl.src = chunk.audioUrl;
                audioEl.defaultPlaybackRate = playbackRate;
                audioEl.playbackRate = playbackRate;
                if ("preservesPitch" in audioEl) audioEl.preservesPitch = true;
                if ("webkitPreservesPitch" in audioEl) audioEl.webkitPreservesPitch = true;
                audioEl.onended = () => finish();
                audioEl.onerror = () => finish(new Error("Timing preview playback failed."));
                try {
                    const playPromise = audioEl.play();
                    if (playPromise && typeof playPromise.catch === "function") playPromise.catch((error) => finish(error));
                } catch (error) {
                    finish(error);
                }
            });
        }
    } catch (error) {
        if (token === state.timingPreviewToken) {
            setStatus(error?.message || l("Timing preview playback failed.", "La lecture de l’aperçu minuté a échoué."), true);
        }
    } finally {
        if (token === state.timingPreviewToken) stopTimingTestPreview();
    }
}

function renderTimingTestResults() {
    if (!timingTestResultsEl) return;
    if (timingTestModeNoteEl) {
        const resultCount = state.timingTestResults.length;
        const runComplete = TIMING_TEST_RESULT_LIMIT > 0 && resultCount >= TIMING_TEST_RESULT_LIMIT;
        timingTestModeNoteEl.textContent = runComplete
            ? l(
                `${TIMING_TEST_RESULT_LIMIT}-test run complete. All results remain open below for comparison.`,
                `Série de ${TIMING_TEST_RESULT_LIMIT} tests terminée. Tous les résultats restent ouverts ci-dessous pour comparaison.`
            )
            : l(
                `Generated audio is measured exactly and adjusted virtually without playback.${TIMING_TEST_RESULT_LIMIT ? ` Result ${resultCount} of ${TIMING_TEST_RESULT_LIMIT}.` : ""}`,
                `L’audio généré est mesuré avec exactitude et ajusté virtuellement sans lecture.${TIMING_TEST_RESULT_LIMIT ? ` Résultat ${resultCount} sur ${TIMING_TEST_RESULT_LIMIT}.` : ""}`
            );
    }
    timingTestResultsEl.replaceChildren();
    if (!state.timingTestResults.length) {
        const empty = document.createElement("div");
        empty.className = "small-note";
        empty.textContent = l(
            "Timed speech measurements will appear here.",
            "Les mesures des prises de parole minutées apparaîtront ici."
        );
        timingTestResultsEl.appendChild(empty);
        return;
    }

    [...state.timingTestResults].reverse().forEach((result) => {
        const card = document.createElement("article");
        card.className = "timing-sheet timing-test-result";

        const title = document.createElement("div");
        title.className = "timing-test-result-title";
        title.textContent = `${result.phaseTitle} — ${result.label}`;

        const metrics = document.createElement("div");
        metrics.className = "small-note";
        metrics.textContent = l(
            `Natural at 1.000×: ${formatPreciseDuration(result.naturalSummary.audioDurationSeconds)} audio • ${result.naturalSummary.wordsPerMinute.toFixed(1)} WPM`,
            `Naturel à 1.000× : ${formatPreciseDuration(result.naturalSummary.audioDurationSeconds)} d’audio • ${result.naturalSummary.wordsPerMinute.toFixed(1)} mots/min`
        );

        const adjustedMetrics = document.createElement("div");
        adjustedMetrics.className = "small-note";
        adjustedMetrics.textContent = l(
            `Adjusted at ${result.playbackPlan.playbackRate.toFixed(3)}×: ${formatPreciseDuration(result.summary.audioDurationSeconds)} audio • ${result.summary.wordsPerMinute.toFixed(1)} WPM`,
            `Ajusté à ${result.playbackPlan.playbackRate.toFixed(3)}× : ${formatPreciseDuration(result.summary.audioDurationSeconds)} d’audio • ${result.summary.wordsPerMinute.toFixed(1)} mots/min`
        );

        const outcome = document.createElement("div");
        outcome.className = "small-note timing-test-result-outcome";
        if (result.summary.overrunSeconds > 0) {
            outcome.style.color = "#a33a2b";
            outcome.textContent = l(
                `Adjusted clock: ${formatPreciseDuration(result.summary.timerConsumedSeconds)} / ${formatPreciseDuration(result.summary.timerBudgetSeconds)} • ${formatPreciseDuration(result.summary.overrunSeconds)} over time`,
                `Minuterie ajustée : ${formatPreciseDuration(result.summary.timerConsumedSeconds)} / ${formatPreciseDuration(result.summary.timerBudgetSeconds)} • dépassement de ${formatPreciseDuration(result.summary.overrunSeconds)}`
            );
        } else {
            outcome.textContent = l(
                `Adjusted clock: ${formatPreciseDuration(result.summary.timerConsumedSeconds)} / ${formatPreciseDuration(result.summary.timerBudgetSeconds)} • ${formatPreciseDuration(result.summary.remainingSeconds)} left`,
                `Minuterie ajustée : ${formatPreciseDuration(result.summary.timerConsumedSeconds)} / ${formatPreciseDuration(result.summary.timerBudgetSeconds)} • ${formatPreciseDuration(result.summary.remainingSeconds)} restant`
            );
        }

        const technical = document.createElement("div");
        technical.className = "small-note";
        technical.textContent = l(
            `${result.summary.wordCount} words • ${result.chunkCount} audio chunks • calculated without playback`,
            `${result.summary.wordCount} mots • ${result.chunkCount} segments audio • calculé sans lecture`
        );

        const playButton = document.createElement("button");
        playButton.type = "button";
        playButton.className = "secondary-btn timing-test-preview-button";
        const previewActive = state.timingPreviewTranscriptIndex === result.transcriptIndex;
        playButton.textContent = previewActive
            ? l("Stop preview", "Arrêter l’aperçu")
            : l(`Play adjusted speech (${result.playbackPlan.playbackRate.toFixed(3)}×)`, `Lire la prise de parole ajustée (${result.playbackPlan.playbackRate.toFixed(3)}×)`);
        playButton.disabled = !result.audioChunks?.some((chunk) => !!chunk.audioUrl);
        playButton.addEventListener("click", () => { void playTimingTestResult(result); });

        card.append(title, metrics, adjustedMetrics, outcome, technical, playButton);
        timingTestResultsEl.appendChild(card);
    });
}

function refreshTimingTestUi() {
    if (!timingTestPanelEl) return;
    document.body.classList.toggle("timing-test-mode", TIMING_TEST_MODE);
    timingTestPanelEl.hidden = !TIMING_TEST_MODE;
    timingTestPanelEl.style.display = TIMING_TEST_MODE ? "" : "none";
    if (!TIMING_TEST_MODE) return;
    renderTimingTestResults();
}

function timingTestResultLimitReached() {
    return TIMING_TEST_RESULT_LIMIT > 0
        && state.timingTestResults.length >= TIMING_TEST_RESULT_LIMIT;
}

function clampNumber(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
}

function delayMs(ms) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, Math.max(0, ms));
    });
}

function getPhaseWordGuidance(phase) {
    if (!phase) return null;

    if (isFrenchLocale()) {
        if (phase.kind === "speech" && phase.subtype === "presentation") {
            return {
                min: 695,
                max: 705,
                preferredTarget: 700
            };
        }

        if (phase.kind === "speech" && (phase.subtype === "commentary" || phase.subtype === "response")) {
            return {
                min: 405,
                max: 415,
                preferredTarget: 410
            };
        }

        if (phase.kind === "judgeAnswer") {
            return {
                min: 320,
                max: 330,
                preferredTarget: 325
            };
        }

        return null;
    }

    if (phase.kind === "speech" && phase.subtype === "presentation") {
        return {
            min: 695,
            max: 705,
            preferredTarget: 700
        };
    }

    if (phase.kind === "speech" && phase.subtype === "commentary") {
        return {
            min: 405,
            max: 415,
            preferredTarget: 410
        };
    }

    if (phase.kind === "speech" && phase.subtype === "response") {
        return {
            min: 405,
            max: 415,
            preferredTarget: 410
        };
    }

    if (phase.kind === "judgeAnswer") {
        return {
            min: 320,
            max: 330,
            preferredTarget: 325
        };
    }

    return null;
}

function clampWordTarget(wordCount, guidance) {
    if (!guidance) return Math.max(0, Math.round(Number(wordCount) || 0));
    const fallback = guidance.preferredTarget || guidance.max || 0;
    return Math.round(clampNumber(Number(wordCount) || fallback, guidance.min, guidance.max));
}

function shouldUseFixedRevisionWordTarget(phase) {
    return !!phase && phase.kind === "speech" && (
        phase.subtype === "presentation" ||
        phase.subtype === "commentary" ||
        phase.subtype === "response"
    );
}

function getPreferredPhaseWordTarget(phase, guidance = null) {
    const resolvedGuidance = guidance || getPhaseWordGuidance(phase);
    if (!resolvedGuidance) return 0;
    const midpoint = Math.round((resolvedGuidance.min + resolvedGuidance.max) / 2);
    return clampWordTarget(resolvedGuidance.preferredTarget || midpoint, resolvedGuidance);
}

function getAiRevisionWordPlan(phase, baselineWordCount, currentDraftText, options = {}) {
    const guidance = getPhaseWordGuidance(phase);
    if (!guidance) return null;
    const originalDraftWordCount = Math.max(0, Math.round(Number(baselineWordCount) || 0));
    const currentDraftWordCount = countWords(currentDraftText);
    const exactTarget = options.exactTarget === true || (options.exactTarget !== false && shouldUseFixedRevisionWordTarget(phase));
    const targetSeed = exactTarget
        ? getPreferredPhaseWordTarget(phase, guidance)
        : (originalDraftWordCount || currentDraftWordCount || guidance.preferredTarget);
    const targetWordCount = clampWordTarget(targetSeed, guidance);
    return {
        originalDraftWordCount,
        currentDraftWordCount,
        targetWordCount,
        allowedMin: exactTarget ? targetWordCount : guidance.min,
        allowedMax: exactTarget ? targetWordCount : guidance.max,
        hardMin: guidance.min,
        hardMax: guidance.max,
        preferredTarget: guidance.preferredTarget,
        exactTarget
    };
}

function wordCountDistanceFromWindow(wordCount, min, max, target) {
    const n = Math.max(0, Math.round(Number(wordCount) || 0));
    if (n >= min && n <= max) return Math.abs(n - target);
    if (n < min) return 1000 + (min - n);
    return 1000 + (n - max);
}

function pickBetterWordCountDraft(originalDraft, candidateDraft, target, min, max) {
    const left = sanitizeText(originalDraft);
    const right = sanitizeText(candidateDraft);
    if (!right) return left;
    const leftScore = wordCountDistanceFromWindow(countWords(left), min, max, target);
    const rightScore = wordCountDistanceFromWindow(countWords(right), min, max, target);
    return rightScore <= leftScore ? right : left;
}

function numberToWords(value) {
    const n = Math.max(0, Math.floor(Number(value) || 0));
    const small = [
        "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
        "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
        "seventeen", "eighteen", "nineteen"
    ];
    const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
    if (n < 20) return small[n];
    if (n < 100) {
        const tensWord = tens[Math.floor(n / 10)];
        const rest = n % 10;
        return rest ? `${tensWord}-${small[rest]}` : tensWord;
    }
    if (n < 1000) {
        const hundreds = `${small[Math.floor(n / 100)]} hundred`;
        const rest = n % 100;
        return rest ? `${hundreds} ${numberToWords(rest)}` : hundreds;
    }
    return String(n);
}

function formatDurationNatural(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (isFrenchLocale()) {
        if (mins && secs) return `${mins} ${mins === 1 ? "minute" : "minutes"} et ${secs} ${secs === 1 ? "seconde" : "secondes"}`;
        if (mins) return `${mins} ${mins === 1 ? "minute" : "minutes"}`;
        return `${secs} ${secs === 1 ? "seconde" : "secondes"}`;
    }
    if (mins && secs) return `${numberToWords(mins)} ${mins === 1 ? "minute" : "minutes"} and ${numberToWords(secs)} ${secs === 1 ? "second" : "seconds"}`;
    if (mins) return `${numberToWords(mins)} ${mins === 1 ? "minute" : "minutes"}`;
    return `${numberToWords(secs)} ${secs === 1 ? "second" : "seconds"}`;
}

function otherRole(role) {
    return role === "human" ? "ai" : "human";
}

function speakerName(role) {
    return role === "human" ? state.names.human : state.names.ai;
}

function titleCase(value) {
    const text = String(value || "");
    return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function isAiControlledRole(role) {
    return state.participantTypes[role] === "ai";
}

function isHumanControlledRole(role) {
    return !isAiControlledRole(role);
}

function participantControlSummary(role) {
    return isAiControlledRole(role) ? l("AI-controlled", "contrôlé par l’IA") : l("human-controlled", "contrôlé par un humain");
}

function getDefaultParticipantOneName(mode = normalizeParticipantMode(participantOneTypeSelectEl?.value || "human")) {
    return mode === "ai" ? l("AI Participant 1", "Participante IA 1") : l("Human", "Humain");
}

function getDefaultParticipantTwoName(mode = normalizeParticipantMode(participantOneTypeSelectEl?.value || "human")) {
    return mode === "ai" ? l("AI Participant 2", "Participante IA 2") : l("AI Opponent", "Adversaire IA");
}

function isHumanJudgeQuestionPhase(phase) {
    return !!phase && phase.kind === "judgeQuestion" && state.judgeMode === "human";
}

function isHumanMainComposerPhase(phase) {
    return !!phase && (isHumanSubmissionPhase(phase) || isHumanJudgeQuestionPhase(phase));
}

function currentPhaseUsesMainComposer(phase) {
    return state.phaseReady && isHumanMainComposerPhase(phase);
}

function getActiveHumanJudgeEntry(phase = getCurrentPhase()) {
    if (!phase || phase.kind !== "judgeQuestion") return null;
    return judgeInputs.find((judge) => judge.number === phase.judgeNumber) || null;
}

function getActiveHumanJudgeName(phase = getCurrentPhase()) {
    const judge = getActiveHumanJudgeEntry(phase);
    if (!judge) return phase?.judgeNumber ? judgeLabel(phase.judgeNumber) : l("Judge", "Juge");
    return sanitizeText(judge.name.value) || judgeLabel(judge.number);
}

function getParticipantModel(role) {
    return normalizeMatchModel(state.participantModels[role] || DEFAULT_PARTICIPANT_MODEL);
}

function getJudgeModel() {
    return DEFAULT_JUDGE_MODEL;
}

function messageKindForRole(role) {
    if (!isAiControlledRole(role)) return "human";
    return role === "human" ? "ai-alt" : "ai";
}

function appendParticipantMessage(role, text, options = {}) {
    const kind = messageKindForRole(role);
    return appendMessage(kind, speakerName(role), text, { ...options, voiceKey: kind });
}

function ensureComposerModeIndicatorUi() {
    if (composerModeIndicatorEl && document.body.contains(composerModeIndicatorEl)) return composerModeIndicatorEl;
    composerModeIndicatorEl = document.getElementById("composerModeIndicator");
    if (!composerModeIndicatorEl) {
        composerModeIndicatorEl = document.createElement("div");
        composerModeIndicatorEl.id = "composerModeIndicator";
        composerModeIndicatorEl.className = "status-chip active";
        composerModeIndicatorEl.hidden = true;
        composerModeIndicatorEl.style.alignSelf = "flex-start";
        composerModeIndicatorEl.style.marginBottom = "2px";
        if (composerFormEl && messageInputEl && messageInputEl.parentElement === composerFormEl) {
            composerFormEl.insertBefore(composerModeIndicatorEl, messageInputEl);
        } else if (composerFormEl) {
            composerFormEl.insertBefore(composerModeIndicatorEl, composerFormEl.firstChild || null);
        }
    }
    return composerModeIndicatorEl;
}

function updateComposerModeIndicator() {
    const indicator = ensureComposerModeIndicatorUi();
    const phase = getCurrentPhase();
    if (phase && state.phaseReady && isHumanJudgeQuestionPhase(phase)) {
        indicator.hidden = false;
        indicator.textContent = isFrenchLocale()
        ? `${getActiveHumanJudgeName(phase)} est actif. Finissez de taper ou dictez la question dans la boîte principale ci-dessous.`
        : `${getActiveHumanJudgeName(phase)} is active. Finish typing or dictate the question in the main box below.`;
        return;
    }
    indicator.hidden = true;
    indicator.textContent = "";
}

function hydrateMainComposerFromActiveJudgeDraftIfNeeded(force = false) {
    const phase = getCurrentPhase();
    if (!phase || !state.phaseReady || !isHumanJudgeQuestionPhase(phase)) {
        state.mainComposerHydratedPhaseId = "";
        return;
    }
    const judge = getActiveHumanJudgeEntry(phase);
    if (!judge?.question) return;
    if (force || state.mainComposerHydratedPhaseId !== phase.id) {
        if (!state.isRecording && !state.voiceFinalizePending) messageInputEl.value = String(judge.question.value || "");
        state.mainComposerHydratedPhaseId = phase.id;
    }
}

function syncActiveJudgeDraftFromMainComposer({ persist = false } = {}) {
    const phase = getCurrentPhase();
    if (!phase || !state.phaseReady || !isHumanJudgeQuestionPhase(phase)) return;
    const judge = getActiveHumanJudgeEntry(phase);
    if (!judge?.question) return;
    if (judge.question.value !== messageInputEl.value) {
        judge.question.value = messageInputEl.value;
        if (persist) saveSetup();
    }
}

function clearMainComposerJudgeBinding() {
    state.mainComposerHydratedPhaseId = "";
}

function refreshParticipantScoreLabels() {
    const participantOneName = sanitizeText(humanNameInputEl?.value || "") || l("Participant 1", "Participant 1");
    const participantTwoName = sanitizeText(aiNameInputEl?.value || "") || l("Participant 2", "Participant 2");
    document.querySelectorAll(".participant-one-score-label").forEach((el) => { el.textContent = participantOneName; });
    document.querySelectorAll(".participant-two-score-label").forEach((el) => { el.textContent = participantTwoName; });
}

function syncParticipantSetupUi() {
    const participantOneMode = normalizeParticipantMode(participantOneTypeSelectEl?.value || "human");
    if (participantOneModelWrapEl) participantOneModelWrapEl.hidden = participantOneMode !== "ai";
    refreshParticipantScoreLabels();
}

function waitMs(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function appendMessageAndWaitForPlayback(kind, label, text, options = {}) {
    return new Promise((resolve) => {
        appendMessage(kind, label, text, {
            ...options,
            onPlaybackComplete: () => {
                try {
                    if (typeof options.onPlaybackComplete === "function") options.onPlaybackComplete();
                } finally {
                    resolve();
                }
            }
        });
    });
}

function isLiveMatchScreenVisible() {
    return state.liveScreenActive || state.coinTossAnimating || state.waitingForCoinChoice || state.started || state.completed || state.transcript.length > 0;
}

function syncScreenVisibility() {
    const showLiveMatch = isLiveMatchScreenVisible();
    document.body.dataset.screen = showLiveMatch ? "match" : "setup";
    if (appHeroEl) appHeroEl.hidden = showLiveMatch;
    if (appStatusStripEl) appStatusStripEl.hidden = showLiveMatch;
    if (setupScreenEl) setupScreenEl.hidden = showLiveMatch;
    if (matchScreenEl) matchScreenEl.hidden = !showLiveMatch;
}

function buildMatchSummaryItem(label, value, options = {}) {
    const item = document.createElement("div");
    item.className = "match-summary-item";
    if (options.kind) item.classList.add(options.kind);

    const itemLabel = document.createElement("div");
    itemLabel.className = "match-summary-label";
    itemLabel.textContent = label;

    const itemValue = document.createElement("div");
    itemValue.className = "match-summary-value";
    if (value instanceof Node) itemValue.appendChild(value);
    else itemValue.textContent = value;

    item.appendChild(itemLabel);
    item.appendChild(itemValue);
    return item;
}

function getLeadSummaryText() {
    if (state.waitingForCoinChoice) {
        return l("Lead choice pending.", "Choix de mène en attente.");
    }
    if (!state.started) {
        return l("Pending toss.", "Tirage en attente.");
    }
    return isFrenchLocale()
    ? `Nº 1 : ${speakerName(state.leadByCase[1])}\nNº 2 : ${speakerName(state.leadByCase[2])}`
    : `#1: ${speakerName(state.leadByCase[1])}\n#2: ${speakerName(state.leadByCase[2])}`;
}

function getCoinTossSummaryText() {
    if (state.coinTossAnimating) return l("In progress.", "En cours.");
    if (!state.coinResult) return l("Pending.", "En attente.");
    return isFrenchLocale()
    ? `${coinSideLabel(state.coinResult)} • ${speakerName(state.coinWinner)} gagne`
    : `${coinSideLabel(state.coinResult)} • ${speakerName(state.coinWinner)} wins`;
}

function buildParticipantModelSummary(participantOneMode) {
    const summary = document.createElement("div");
    summary.className = "participant-model-summary";
    const participants = [
        {
            name: state.names.human,
            model: participantOneMode === "ai"
                ? formatModelLabel(state.participantModels.human, { includeProvider: false })
                : l("Human", "Humain")
        },
        {
            name: state.names.ai,
            model: formatModelLabel(state.participantModels.ai, { includeProvider: false })
        }
    ];
    participants.forEach(({ name, model }) => {
        const line = document.createElement("div");
        line.className = "participant-model-line";
        line.textContent = `${name} — ${model}`;
        summary.appendChild(line);
    });
    return summary;
}

function renderMatchSetupSummary() {
    if (!matchSetupSummaryEl) return;
    matchSetupSummaryEl.innerHTML = "";
    if (!isLiveMatchScreenVisible()) return;

    const participantOneMode = state.started || state.coinResult || state.waitingForCoinChoice
    ? state.participantTypes.human
    : normalizeParticipantMode(participantOneTypeSelectEl?.value || "human");

    const items = [
        {
            label: l("Participants", "Participantes"),
            value: buildParticipantModelSummary(participantOneMode),
            kind: "participants-summary"
        },
        {
            label: l("Voice", "Voix"),
            value: "OpenAI"
        },
        {
            label: l("Coin toss", "Tirage"),
            value: getCoinTossSummaryText(),
            kind: "coin-summary"
        },
        {
            label: l("Cases", "Cas"),
            value: getLeadSummaryText(),
            kind: "order-summary"
        }
    ];

    items.forEach((item) => {
        matchSetupSummaryEl.appendChild(buildMatchSummaryItem(item.label, item.value, item));
    });
}

function renderMatchCaseCard(caseNum, cardEl, summaryEl, metaEl, questionEl, textEl) {
    if (!summaryEl || !metaEl || !questionEl || !textEl) return;
    const caseData = state.cases[caseNum] || { title: "", question: "", text: "" };
    const currentPhase = getCurrentPhase();
    const isCurrentCase = !!currentPhase?.caseNum && currentPhase.caseNum === caseNum;
    const leaderReady = state.started;

    summaryEl.textContent = caseData.title
    ? `${caseLabel(caseNum)} • ${caseData.title}`
    : caseLabel(caseNum);

    metaEl.textContent = leaderReady
    ? isFrenchLocale()
        ? `Mène : ${speakerName(state.leadByCase[caseNum])}`
        : `Leader: ${speakerName(state.leadByCase[caseNum])}`
    : l("Leader will be confirmed after the toss.", "La meneuse sera confirmée après le tirage.");

    questionEl.textContent = caseData.question
    ? isFrenchLocale()
        ? `Question : ${caseData.question}`
        : `Question: ${caseData.question}`
    : l("No moderator question loaded yet.", "Aucune question du modérateur n’est chargée pour le moment.");

    textEl.textContent = caseData.text || l("No case text loaded yet.", "Aucun texte de cas n’est chargé pour le moment.");

    if (cardEl) {
        cardEl.classList.toggle("current", isCurrentCase);
    }
}

function renderMatchCaseReference() {
    renderMatchCaseCard(1, matchCase1CardEl, matchCase1SummaryEl, matchCase1MetaEl, matchCase1QuestionEl, matchCase1TextEl);
    renderMatchCaseCard(2, matchCase2CardEl, matchCase2SummaryEl, matchCase2MetaEl, matchCase2QuestionEl, matchCase2TextEl);
}

function syncCoinTossFaceLabels() {
    if (!coinTossCoinEl) return;
    const [front, back] = coinTossCoinEl.querySelectorAll(".coin-face");
    if (front) front.dataset.sideLabel = coinSideLabel("heads");
    if (back) back.dataset.sideLabel = coinSideLabel("tails");
}

function syncCoinTossUi() {
    syncCoinTossFaceLabels();
    if (judgePanelDefaultEl) judgePanelDefaultEl.hidden = !!state.showCoinTossCeremony;
    if (coinTossCardEl) coinTossCardEl.hidden = !state.showCoinTossCeremony;
    if (coinTossAnimationEl) {
        coinTossAnimationEl.classList.toggle("is-flipping", state.coinTossAnimating);
        coinTossAnimationEl.classList.toggle("is-settled", !state.coinTossAnimating && !!state.coinResult);
        coinTossAnimationEl.classList.toggle("result-heads", state.coinResult === "heads");
        coinTossAnimationEl.classList.toggle("result-tails", state.coinResult === "tails");
    }

    if (!coinTossStatusEl) return;

    if (state.coinTossAnimating) {
        coinTossStatusEl.textContent = l("The coin is being flipped to determine who controls Case #1.", "La pièce est lancée pour déterminer qui contrôlera le cas 1.");
        return;
    }
    if (state.waitingForCoinChoice) {
        coinTossStatusEl.textContent = l("Participant 1 won the toss. Choose whether to lead or pass on Case #1.", "Le participant 1 a gagné le tirage. Choisissez s’il mène ou passe au cas 1.");
        return;
    }
    if (state.showCoinTossCeremony && state.started) {
        coinTossStatusEl.textContent = l("Match opening confirmed. Moving into the moderator’s first case announcement.", "Ouverture du match confirmée. Passage à la première annonce de cas du modérateur.");
        return;
    }
    if (state.coinResult && state.coinWinner) {
        coinTossStatusEl.textContent = isFrenchLocale()
        ? `${speakerName("human")} a choisi ${coinSideLabel(state.coinCall)}. Le résultat est ${coinSideLabel(state.coinResult)}. ${speakerName(state.coinWinner)} gagne le tirage.`
        : `${speakerName("human")} called ${coinSideLabel(state.coinCall)}. The coin is ${coinSideLabel(state.coinResult)}. ${speakerName(state.coinWinner)} wins the toss.`;
        return;
    }
    coinTossStatusEl.textContent = l("The moderator is preparing the coin toss.", "Le modérateur prépare le tirage.");
}

async function playCoinTossAnimation(coinCall, coinResult, winner) {
    const runId = state.matchRunId;
    state.coinCall = coinCall;
    state.coinResult = coinResult;
    state.coinWinner = winner;
    state.coinTossAnimating = true;
    refreshControls();
    setStatus(l("Running coin toss...", "Tirage en cours..."));
    await waitMs(2400);
    if (runId !== state.matchRunId) return false;
    state.coinTossAnimating = false;
    refreshControls();
    return true;
}

function isHumanSubmissionPhase(phase) {
    return !!phase && (phase.kind === "speech" || phase.kind === "judgeAnswer") && isHumanControlledRole(phase.speaker);
}

function isCurrentPhaseAwaitingPlayback(phase = getCurrentPhase()) {
    return !!phase && state.phaseAwaitingPlaybackForId === phase.id;
}

function setPhaseAwaitingPlayback(phaseId) {
    state.phaseAwaitingPlaybackForId = phaseId || "";
    refreshControls();
}

function clearPhaseAwaitingPlayback(phaseId = "") {
    if (!phaseId || state.phaseAwaitingPlaybackForId === phaseId) {
        state.phaseAwaitingPlaybackForId = "";
        refreshControls();
    }
}

function getVoiceKeyForMessage(kind, options = {}) {
    if (options.voiceKey) return options.voiceKey;
    if (kind === "judge" && Number.isFinite(Number(options.judgeNumber))) return `judge${Number(options.judgeNumber)}`;
    return kind;
}

function shouldCutOffReadAloudOnTimeout(phase) {
    if (!phase) return false;
    if (phase.kind === "speech" && isAiControlledRole(phase.speaker)) return true;
    if (phase.kind === "judgeQuestion" && state.judgeMode === "ai") return true;
    if (phase.kind === "judgeAnswer" && isAiControlledRole(phase.speaker)) return true;
    return false;
}

function cutOffCurrentPhaseReadAloudIfNeeded(phase) {
    if (!shouldCutOffReadAloudOnTimeout(phase)) return;
    if (!isSpeechPlaybackActive()) return;
    stopSpeechPlayback(false, { resolveCallbacks: false });
}

function readCase(caseNum) {
    const titleEl = caseNum === 1 ? case1TitleInputEl : case2TitleInputEl;
    const questionEl = caseNum === 1 ? case1QuestionInputEl : case2QuestionInputEl;
    const textEl = caseNum === 1 ? case1TextInputEl : case2TextInputEl;
    return {
        title: sanitizeText(titleEl.value),
        question: sanitizeText(questionEl.value),
        text: sanitizeText(textEl.value)
    };
}

function updateConfigBadges() {
    const instructions = getStoredText(STORAGE_KEYS.instructions);
    const instructionsActive = !!instructions;
    instructionsBadgeEl.textContent = instructionsActive
    ? l("Instructions active", "Instructions actives")
    : l("Instructions inactive", "Instructions inactives");
    instructionsBadgeEl.className = `status-chip ${instructionsActive ? "active" : "inactive"}`;
    instructionsBadgeEl.title = instructionsActive ? instructions.slice(0, 300) : l("No saved instructions.", "Aucune instruction enregistrée.");
}

function saveSetup() {
    const payload = {
        participantOneType: normalizeParticipantMode(participantOneTypeSelectEl?.value),
        humanName: humanNameInputEl.value,
        aiName: aiNameInputEl.value,
        coinCall: coinCallSelectEl.value,
        judgeMode: judgeModeSelectEl.value,
        moderatorReadFullCase: moderatorReadFullCaseSelectEl.value,
        participantOneModel: normalizeMatchModel(participantOneModelSelectEl?.value),
        participantTwoModel: normalizeMatchModel(modelSelectEl?.value),
        case1Title: case1TitleInputEl.value,
            case1Question: case1QuestionInputEl.value,
                case1Text: case1TextInputEl.value,
                    case2Title: case2TitleInputEl.value,
                        case2Question: case2QuestionInputEl.value,
                            case2Text: case2TextInputEl.value,
                                judges: judgeInputs.map((judge) => ({
                                    name: judge.name.value,
                                    question: judge.question.value,
                                    humanScore: judge.humanScore.value,
                                    aiScore: judge.aiScore.value,
                                    comment: judge.comment.value
                                }))
    };
    localStorage.setItem(STORAGE_KEYS.setup, JSON.stringify(payload));
    refreshParticipantScoreLabels();
}

function loadSetup() {
    if (participantOneTypeSelectEl) participantOneTypeSelectEl.value = "human";
    moderatorReadFullCaseSelectEl.value = "no";
    populateAllMatchModelSelects();
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.setup) || "{}");
        if (parsed && typeof parsed === "object") {
            if (typeof parsed.participantOneType === "string") participantOneTypeSelectEl.value = normalizeParticipantMode(parsed.participantOneType);
            if (typeof parsed.humanName === "string") humanNameInputEl.value = parsed.humanName;
            if (typeof parsed.aiName === "string") aiNameInputEl.value = parsed.aiName;
            if (typeof parsed.coinCall === "string") coinCallSelectEl.value = parsed.coinCall;
            if (typeof parsed.judgeMode === "string") judgeModeSelectEl.value = parsed.judgeMode;
            if (parsed.moderatorReadFullCase === "yes") moderatorReadFullCaseSelectEl.value = "yes";
            participantOneModelSelectEl.value = normalizeMatchModel(parsed.participantOneModel || DEFAULT_PARTICIPANT_MODEL);
            modelSelectEl.value = normalizeMatchModel(parsed.participantTwoModel || DEFAULT_PARTICIPANT_MODEL);
            if (typeof parsed.case1Title === "string") case1TitleInputEl.value = parsed.case1Title;
            if (typeof parsed.case1Question === "string") case1QuestionInputEl.value = parsed.case1Question;
            if (typeof parsed.case1Text === "string") case1TextInputEl.value = parsed.case1Text;
            if (typeof parsed.case2Title === "string") case2TitleInputEl.value = parsed.case2Title;
            if (typeof parsed.case2Question === "string") case2QuestionInputEl.value = parsed.case2Question;
            if (typeof parsed.case2Text === "string") case2TextInputEl.value = parsed.case2Text;
            if (Array.isArray(parsed.judges)) {
                parsed.judges.slice(0, 3).forEach((savedJudge, index) => {
                    const judge = judgeInputs[index];
                    if (!judge || !savedJudge || typeof savedJudge !== "object") return;
                    if (typeof savedJudge.name === "string") judge.name.value = savedJudge.name;
                    if (typeof savedJudge.question === "string") judge.question.value = savedJudge.question;
                    if (typeof savedJudge.humanScore === "string" || typeof savedJudge.humanScore === "number") judge.humanScore.value = String(savedJudge.humanScore ?? "");
                    if (typeof savedJudge.aiScore === "string" || typeof savedJudge.aiScore === "number") judge.aiScore.value = String(savedJudge.aiScore ?? "");
                    if (typeof savedJudge.comment === "string") judge.comment.value = savedJudge.comment;
                });
            }
        }
    } catch {}
    syncParticipantSetupUi();
    refreshParticipantScoreLabels();
}

function getMessageBodyEl(index) {
    return chatEl.querySelector(`.msg-row[data-message-index="${index}"] .bubble-body`);
}

function registerSpeechCompletionCallback(transcriptIndex, callback) {
    if (!Number.isInteger(transcriptIndex) || transcriptIndex < 0 || typeof callback !== "function") return;
    const existing = state.speechCompletionCallbacks.get(transcriptIndex) || [];
    existing.push(callback);
    state.speechCompletionCallbacks.set(transcriptIndex, existing);
}

function registerSpeechStartCallback(transcriptIndex, callback) {
    if (!Number.isInteger(transcriptIndex) || transcriptIndex < 0 || typeof callback !== "function") return;
    const existing = state.speechStartCallbacks.get(transcriptIndex) || [];
    existing.push(callback);
    state.speechStartCallbacks.set(transcriptIndex, existing);
}

function invokeSpeechStartCallbacks(transcriptIndex) {
    if (!Number.isInteger(transcriptIndex) || transcriptIndex < 0) return;
    const callbacks = state.speechStartCallbacks.get(transcriptIndex) || [];
    state.speechStartCallbacks.delete(transcriptIndex);
    callbacks.forEach((callback) => {
        try { callback(); } catch (error) { console.error("Speech start callback failed:", error); }
    });
}

function invokeSpeechCompletionCallbacks(transcriptIndex) {
    if (!Number.isInteger(transcriptIndex) || transcriptIndex < 0) return;
    const callbacks = state.speechCompletionCallbacks.get(transcriptIndex) || [];
    state.speechCompletionCallbacks.delete(transcriptIndex);
    callbacks.forEach((callback) => {
        try {
            window.setTimeout(() => {
                try { callback(); } catch (error) { console.error("Speech completion callback failed:", error); }
            }, 0);
        } catch (error) {
            console.error("Could not schedule speech completion callback:", error);
        }
    });
}

function trackSpeechChunksForMessage(transcriptIndex, count) {
    if (!Number.isInteger(transcriptIndex) || transcriptIndex < 0 || !Number.isFinite(count) || count <= 0) return;
    state.speechChunkCounts.set(transcriptIndex, (state.speechChunkCounts.get(transcriptIndex) || 0) + count);
}

function markSpeechChunkComplete(transcriptIndex) {
    if (!Number.isInteger(transcriptIndex) || transcriptIndex < 0) return;
    const nextRemaining = (state.speechChunkCounts.get(transcriptIndex) || 0) - 1;
    if (nextRemaining > 0) {
        state.speechChunkCounts.set(transcriptIndex, nextRemaining);
        return;
    }
    state.speechChunkCounts.delete(transcriptIndex);
    invokeSpeechCompletionCallbacks(transcriptIndex);
}

function finalizeSpeechPlaybackForMessage(transcriptIndex) {
    if (!Number.isInteger(transcriptIndex) || transcriptIndex < 0) return;
    state.speechChunkCounts.delete(transcriptIndex);
    invokeSpeechCompletionCallbacks(transcriptIndex);
}

function finalizeAllSpeechPlaybackCallbacks() {
    const ids = new Set([...state.speechChunkCounts.keys(), ...state.speechStartCallbacks.keys(), ...state.speechCompletionCallbacks.keys()]);
    state.speechChunkCounts.clear();
    ids.forEach((id) => invokeSpeechStartCallbacks(id));
    ids.forEach((id) => invokeSpeechCompletionCallbacks(id));
}

function getMostRecentReadableTranscriptIndex() {
    for (let i = state.transcript.length - 1; i >= 0; i -= 1) {
        if (AUTO_SPEAK_MESSAGE_KINDS.has(state.transcript[i]?.kind)) return i;
    }
    return -1;
}

function restoreMessageBodyPlainText(index) {
    const body = getMessageBodyEl(index);
    if (!body) return;
    body.textContent = state.transcript[index]?.text || "";
}

function buildNormalizedTextIndexMap(rawText) {
    const raw = String(rawText || "");
    let normalized = "";
    const normToRaw = [];
    let pendingSpace = false;
    for (let i = 0; i < raw.length; i += 1) {
        const ch = raw[i];
        if (/\s/.test(ch)) {
            if (normalized.length) pendingSpace = true;
            continue;
        }
        if (pendingSpace && normalized.length) {
            normalized += " ";
            normToRaw.push(i);
            pendingSpace = false;
        }
        normalized += ch;
        normToRaw.push(i);
    }
    return { normalized, normToRaw };
}

function findSpeechRangeInRawText(rawText, chunkText, startNormIndex = 0) {
    const raw = String(rawText || "");
    const chunk = normalizeSpeechText(chunkText);
    if (!chunk || !raw) return null;
    const mapped = buildNormalizedTextIndexMap(raw);
    const normalizedRaw = mapped.normalized;
    let startNorm = normalizedRaw.indexOf(chunk, Math.max(0, startNormIndex));
    if (startNorm < 0 && startNormIndex > 0) startNorm = normalizedRaw.indexOf(chunk);
    if (startNorm < 0) return null;
    const endNorm = startNorm + chunk.length;
    const rawStart = mapped.normToRaw[startNorm] ?? 0;
    const rawEnd = endNorm < mapped.normToRaw.length ? mapped.normToRaw[endNorm] : raw.length;
    return { rawStart, rawEnd: Math.max(rawStart, rawEnd), startNorm, endNorm };
}

function renderSpeechProgressOnBody(body, index) {
    const rawText = String(state.transcript[index]?.text || "");
    if (index !== state.speechProgressMessageIndex || state.speechProgressSpeakEnd <= state.speechProgressSpeakStart) {
        body.textContent = rawText;
        return;
    }
    const readTo = Math.max(0, Math.min(rawText.length, state.speechProgressReadTo));
    const speakStart = Math.max(readTo, Math.min(rawText.length, state.speechProgressSpeakStart));
    const speakEnd = Math.max(speakStart, Math.min(rawText.length, state.speechProgressSpeakEnd));
    const beforeText = rawText.slice(0, speakStart);
    const currentText = rawText.slice(speakStart, speakEnd);
    const afterText = rawText.slice(speakEnd);
    body.textContent = "";
    if (beforeText) {
        const before = document.createElement("span");
        before.className = "speech-read";
        before.textContent = beforeText;
        body.appendChild(before);
    }
    if (currentText) {
        const current = document.createElement("span");
        current.className = "speech-speaking";
        current.textContent = currentText;
        body.appendChild(current);
    }
    if (afterText) body.appendChild(document.createTextNode(afterText));
}

function isSpeechFollowActive() {
    if (state.speechProgressMessageIndex < 0) return false;
    return state.speechPlaybackActive || state.speechProcessing || !!state.speechQueue.length || !!state.openAiSpeechLookaheadPromise || !!state.openAiSpeechLookaheadPrepared;
}

function clearSpeechFollowRaf() {
    if (state.speechFollowRaf) {
        cancelAnimationFrame(state.speechFollowRaf);
        state.speechFollowRaf = null;
    }
    state.speechFollowWantsSmooth = false;
}

function scrollSpeechProgressIntoView(smooth = true) {
    const messageIndex = state.speechProgressMessageIndex;
    if (messageIndex < 0) return;
    const body = getMessageBodyEl(messageIndex);
    if (!body) return;
    const anchor = body.querySelector(".speech-speaking") || body;
    const chatRect = chatEl.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const upperBand = chatRect.top + Math.max(20, chatEl.clientHeight * 0.22);
    const lowerBand = chatRect.bottom - Math.max(20, chatEl.clientHeight * 0.22);
    if (anchorRect.top >= upperBand && anchorRect.bottom <= lowerBand) return;
    const nextTop = chatEl.scrollTop + (anchorRect.top - chatRect.top) - (chatEl.clientHeight * 0.35);
    if (typeof chatEl.scrollTo === "function") {
        chatEl.scrollTo({ top: Math.max(0, nextTop), behavior: smooth ? "smooth" : "auto" });
    } else {
        chatEl.scrollTop = Math.max(0, nextTop);
    }
}

function queueSpeechFollowScroll(smooth = true) {
    state.speechFollowWantsSmooth = state.speechFollowWantsSmooth || smooth;
    if (state.speechFollowRaf) return;
    state.speechFollowRaf = window.requestAnimationFrame(() => {
        const useSmooth = state.speechFollowWantsSmooth;
        state.speechFollowWantsSmooth = false;
        state.speechFollowRaf = null;
        scrollSpeechProgressIntoView(useSmooth);
    });
}

function syncSpeechProgressToUi(scrollSmooth = false) {
    const messageIndex = state.speechProgressMessageIndex;
    if (messageIndex < 0) return;
    const body = getMessageBodyEl(messageIndex);
    if (!body) return;
    renderSpeechProgressOnBody(body, messageIndex);
    if (isSpeechFollowActive()) queueSpeechFollowScroll(scrollSmooth);
}

function resetSpeechProgressState({ clearUi = true } = {}) {
    const previousIndex = state.speechProgressMessageIndex;
    state.speechProgressMessageIndex = -1;
    state.speechProgressNormalizedCursor = 0;
    state.speechProgressReadTo = 0;
    state.speechProgressSpeakStart = 0;
    state.speechProgressSpeakEnd = 0;
    clearSpeechFollowRaf();
    if (clearUi && previousIndex >= 0) restoreMessageBodyPlainText(previousIndex);
}

function finishSpeechProgressPlayback() {
    resetSpeechProgressState({ clearUi: true });
}

function beginSpeechProgressForQueueEntry(entry) {
    const entryText = normalizeSpeechText(entry?.text || "");
    if (!entryText) return;
    const messageIndex = Number.isInteger(entry?.transcriptIndex) ? entry.transcriptIndex : getMostRecentReadableTranscriptIndex();
    if (messageIndex < 0 || !state.transcript[messageIndex]) return;
    if (state.speechProgressMessageIndex !== messageIndex) {
        const previousIndex = state.speechProgressMessageIndex;
        state.speechProgressMessageIndex = messageIndex;
        state.speechProgressNormalizedCursor = 0;
        state.speechProgressReadTo = 0;
        state.speechProgressSpeakStart = 0;
        state.speechProgressSpeakEnd = 0;
        if (previousIndex >= 0 && previousIndex !== messageIndex) restoreMessageBodyPlainText(previousIndex);
    }
    const rawText = String(state.transcript[messageIndex]?.text || "");
    const range = findSpeechRangeInRawText(rawText, entryText, state.speechProgressNormalizedCursor);
    if (range) {
        state.speechProgressReadTo = range.rawStart;
        state.speechProgressSpeakStart = range.rawStart;
        state.speechProgressSpeakEnd = range.rawEnd;
        state.speechProgressNormalizedCursor = range.endNorm;
    } else {
        const fallbackStart = Math.max(0, Math.min(rawText.length, state.speechProgressSpeakEnd));
        const fallbackEnd = Math.max(fallbackStart, Math.min(rawText.length, fallbackStart + entryText.length));
        state.speechProgressReadTo = fallbackStart;
        state.speechProgressSpeakStart = fallbackStart;
        state.speechProgressSpeakEnd = fallbackEnd;
    }
    syncSpeechProgressToUi(true);
}

function createMessageElement(message, index) {
    const row = document.createElement("div");
    row.className = `msg-row ${message.kind}`;
    row.dataset.messageIndex = String(index);
    const bubble = document.createElement("article");
    bubble.className = `bubble ${message.kind}`;
    const label = document.createElement("div");
    label.className = "bubble-label";
    label.textContent = message.label;
    const body = document.createElement("div");
    body.className = "bubble-body";
    if (index === state.speechProgressMessageIndex) renderSpeechProgressOnBody(body, index);
    else body.textContent = message.text;
    const time = document.createElement("div");
    time.className = "bubble-time";
    time.textContent = formatBubbleTime(message.time);
    bubble.appendChild(label);
    bubble.appendChild(body);
    bubble.appendChild(time);
    row.appendChild(bubble);
    return row;
}

function renderTranscript() {
    chatEl.innerHTML = "";
    const visibleMessages = state.transcript
        .map((message, index) => ({ message, index }))
        .filter(({ message }) => !message.hiddenUntilPhaseReady);
    if (!visibleMessages.length) {
        emptyStateEl.hidden = false;
        chatEl.appendChild(emptyStateEl);
        return;
    }
    emptyStateEl.hidden = true;
    visibleMessages.forEach(({ message, index }) => chatEl.appendChild(createMessageElement(message, index)));
    syncSpeechProgressToUi(false);
    if (isSpeechFollowActive()) queueSpeechFollowScroll(false);
    else chatEl.scrollTop = chatEl.scrollHeight;
}

function revealTranscriptMessagesForPhase(phaseId) {
    let changed = false;
    state.transcript.forEach((message) => {
        if (!message.hiddenUntilPhaseReady || message.phaseId !== phaseId) return;
        message.hiddenUntilPhaseReady = false;
        changed = true;
    });
    if (changed) renderTranscript();
}

function ensureSpeechAudioEl() {
    if (state.speechAudioEl && document.body.contains(state.speechAudioEl)) return state.speechAudioEl;
    const audioEl = document.createElement("audio");
    audioEl.preload = "auto";
    audioEl.defaultPlaybackRate = 1;
    audioEl.playbackRate = 1;
    if ("preservesPitch" in audioEl) audioEl.preservesPitch = true;
    if ("webkitPreservesPitch" in audioEl) audioEl.webkitPreservesPitch = true;
    audioEl.hidden = true;
    audioEl.setAttribute("aria-hidden", "true");
    document.body.appendChild(audioEl);
    state.speechAudioEl = audioEl;
    return audioEl;
}

function isSpeechPlaybackActive() {
    const audioEl = state.speechAudioEl;
    const audioPlaying = !!(audioEl && audioEl.src && typeof audioEl.paused === "boolean" && !audioEl.paused);
    return state.speechProcessing || state.speechPlaybackActive || !!state.speechQueue.length || !!state.wholeSpeechPendingTranscriptIndexes.size || !!state.currentSpeechController || !!state.openAiSpeechLookaheadPromise || !!state.openAiSpeechLookaheadPrepared || audioPlaying;
}

function refreshSpeechUi() {
    if (!stopSpeechBtnEl) return;
    stopSpeechBtnEl.disabled = !isSpeechPlaybackActive();
    stopSpeechBtnEl.textContent = l("Stop Reading", "Arrêter la lecture");
}

function ensureSpeechUi() {
    ensureSpeechAudioEl();
    ensureComposerModeIndicatorUi();
    if (!stopSpeechBtnEl) {
        stopSpeechBtnEl = document.getElementById("stopSpeechBtn");
        if (!stopSpeechBtnEl) {
            stopSpeechBtnEl = document.createElement("button");
            stopSpeechBtnEl.type = "button";
            stopSpeechBtnEl.id = "stopSpeechBtn";
            stopSpeechBtnEl.className = "secondary-btn";
            stopSpeechBtnEl.textContent = l("Stop Reading", "Arrêter la lecture");
            const host = composerFormEl?.querySelector(".composer-row") || nextActionBtnEl?.parentElement || composerFormEl;
            if (host) host.appendChild(stopSpeechBtnEl);
        }
        stopSpeechBtnEl.addEventListener("click", () => { stopSpeechPlayback(true); });
    }
    refreshSpeechUi();
}

function rejectCurrentSpeechPlayback() {
    if (typeof state.currentSpeechReject === "function") {
        const reject = state.currentSpeechReject;
        state.currentSpeechReject = null;
        try { reject(new Error(STOP_SPEECH_ERROR)); } catch {}
    }
}

function resetSpeechAudioEl() {
    const audioEl = ensureSpeechAudioEl();
    try {
        audioEl.pause();
        audioEl.currentTime = 0;
        audioEl.defaultPlaybackRate = 1;
        audioEl.playbackRate = 1;
    } catch {}
    audioEl.onplaying = null;
    audioEl.onended = null;
    audioEl.onerror = null;
    if (state.currentAudioUrl) {
        try { URL.revokeObjectURL(state.currentAudioUrl); } catch {}
        state.currentAudioUrl = "";
    }
    audioEl.removeAttribute("src");
    try { audioEl.load(); } catch {}
}

function revokeQueuedPreparedSpeechAudio(entries = state.speechQueue) {
    (entries || []).forEach((entry) => {
        if (!entry?.preparedAudio?.audioUrl) return;
        try { URL.revokeObjectURL(entry.preparedAudio.audioUrl); } catch {}
        entry.preparedAudio = null;
    });
}

function clearOpenAiSpeechLookahead() {
    if (state.currentSpeechController && state.currentSpeechControllerKind === "lookahead") {
        try { state.currentSpeechController.abort(); } catch {}
    }
    const preparedUrl = state.openAiSpeechLookaheadPrepared?.audioUrl || "";
    if (preparedUrl) {
        try { URL.revokeObjectURL(preparedUrl); } catch {}
    }
    state.openAiSpeechLookaheadPromise = null;
    state.openAiSpeechLookaheadPrepared = null;
    state.openAiSpeechLookaheadEntry = null;
    if (state.currentSpeechControllerKind === "lookahead") state.currentSpeechControllerKind = "";
    refreshSpeechUi();
}

function stopSpeechPlayback(showMessage = false, { resolveCallbacks = true } = {}) {
    state.speechToken += 1;
    revokeQueuedPreparedSpeechAudio();
    state.speechQueue = [];
    state.wholeSpeechPendingTranscriptIndexes.clear();
    clearAllWholeSpeechPreparations();
    state.speechProcessing = false;
    clearOpenAiSpeechLookahead();
    state.speechPlaybackActive = false;
    state.lastSpeechEndedAtMs = 0;
    clearTimingTestAudioCache();
    state.timingTestMeasurements.clear();
    rejectCurrentSpeechPlayback();
    if (state.currentSpeechController) {
        try { state.currentSpeechController.abort(); } catch {}
        state.currentSpeechController = null;
    }
    state.currentSpeechControllerKind = "";
    resetSpeechAudioEl();
    resetSpeechProgressState({ clearUi: true });
    if (resolveCallbacks) finalizeAllSpeechPlaybackCallbacks();
    else {
        state.speechChunkCounts.clear();
        state.speechStartCallbacks.clear();
        state.speechCompletionCallbacks.clear();
    }
    refreshSpeechUi();
    if (showMessage) setStatus(l("Read-aloud stopped.", "Lecture arrêtée."));
}

function splitTextByWords(text, maxLen = SPEECH_CHUNK_MAX) {
    const normalized = normalizeSpeechText(text);
    if (!normalized) return [];
    const words = normalized.split(" ");
    const chunks = [];
    let current = "";
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length > maxLen && current) {
            chunks.push(current);
            current = word;
        } else {
            current = candidate;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}

function chunkTextForSpeech(text, maxLen = SPEECH_CHUNK_MAX) {
    const normalized = normalizeSpeechText(text);
    if (!normalized) return [];
    const segments = normalized
    .split(/(?<=[,;:.!?…]["')\]]?)\s+|\n{2,}/)
    .map((item) => normalizeSpeechText(item))
    .filter(Boolean);
    if (segments.length <= 1) return splitTextByWords(normalized, maxLen);
    const chunks = [];
    let current = "";
    for (const segment of segments) {
        if (segment.length > maxLen) {
            if (current) { chunks.push(current); current = ""; }
            chunks.push(...splitTextByWords(segment, maxLen));
            continue;
        }
        const candidate = current ? `${current} ${segment}` : segment;
        if (candidate.length > maxLen && current) {
            chunks.push(current);
            current = segment;
        } else {
            current = candidate;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}

function buildSpeechQueueEntries(kind, text, transcriptIndex = -1, voiceKey = "", options = {}) {
    const normalized = normalizeSpeechText(text);
    if (!normalized) return [];
    const speechStartLeadMs = Math.max(0, Math.min(3000, Number(options.speechStartLeadMs) || 0));
    const minimumHandoffGapMs = Math.max(0, Math.min(3000, Number(options.minimumHandoffGapMs) || 0));
    const speechTextChunks = chunkTextForSpeech(normalized, SPEECH_CHUNK_MAX)
    .map((textChunk) => textChunk.slice(0, MAX_TTS_CHARS))
    .filter(Boolean);
    return speechTextChunks.map((textChunk, chunkIndex) => ({
        kind,
        voiceKey: voiceKey || kind,
        text: textChunk,
        transcriptIndex,
        chunkIndex,
        chunkCount: speechTextChunks.length,
        speechStartLeadMs: chunkIndex === 0 ? speechStartLeadMs : 0,
        minimumHandoffGapMs: chunkIndex === 0 ? minimumHandoffGapMs : 0
    }));
}

function ensureSentenceEnding(text, ending = ".") {
    const normalized = normalizeSpeechText(text);
    if (!normalized || /[.!?…]["')\]]*$/u.test(normalized)) return normalized;
    return `${normalized}${String(ending || ".").charAt(0) || "."}`;
}

function getAudioBridge() {
    const bridge = window.ethicsApi?.audio;
    if (!bridge || typeof bridge.speech !== "function" || typeof bridge.transcribe !== "function") {
        throw new Error(l("The desktop audio bridge is unavailable.", "Le pont audio de l’application de bureau n’est pas disponible."));
    }
    return bridge;
}

function toUint8Array(bytes) {
    if (bytes instanceof Uint8Array) return bytes;
    if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
    if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return new Uint8Array(Array.isArray(bytes) ? bytes : []);
}

async function blobToByteArray(blob) {
    return new Uint8Array(await blob.arrayBuffer());
}

async function decodeSpeechAudioDuration(audioBytes, audioUrl) {
    const bytes = toUint8Array(audioBytes);
    if (!bytes.byteLength) throw new Error("Cannot measure empty speech audio.");
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    let decodeError = null;

    if (AudioContextClass) {
        try {
            if (!state.timingTestAudioContext || state.timingTestAudioContext.state === "closed") {
                state.timingTestAudioContext = new AudioContextClass();
            }
            const copiedBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
            const decoded = await state.timingTestAudioContext.decodeAudioData(copiedBuffer);
            if (Number.isFinite(decoded?.duration) && decoded.duration > 0) {
                return { durationSeconds: decoded.duration, method: "decoded-pcm" };
            }
            throw new Error("Decoded speech audio had no measurable duration.");
        } catch (error) {
            decodeError = error;
        }
    }

    if (!audioUrl) throw decodeError || new Error("Speech audio duration could not be decoded.");
    return new Promise((resolve, reject) => {
        const probe = new Audio();
        let settled = false;
        const timeoutId = window.setTimeout(() => finish(null, new Error("Speech audio metadata timing timed out.")), 10000);
        const cleanup = () => {
            window.clearTimeout(timeoutId);
            probe.onloadedmetadata = null;
            probe.ondurationchange = null;
            probe.onerror = null;
            probe.removeAttribute("src");
            try { probe.load(); } catch {}
        };
        const finish = (durationSeconds, error = null) => {
            if (settled) return;
            if (!error && (!Number.isFinite(durationSeconds) || durationSeconds <= 0)) return;
            settled = true;
            cleanup();
            if (error) reject(error);
            else resolve({ durationSeconds, method: "media-metadata" });
        };
        const readDuration = () => finish(probe.duration);
        probe.preload = "metadata";
        probe.onloadedmetadata = readDuration;
        probe.ondurationchange = readDuration;
        probe.onerror = () => finish(null, decodeError || new Error("Speech audio duration could not be measured."));
        probe.src = audioUrl;
        try { probe.load(); } catch (error) { finish(null, decodeError || error); }
    });
}

function getWholeSpeechDescriptorForPhase(phase) {
    if (!phase || !SPEECH_TIMING.isTimedSpokenPhase(phase)) return null;
    if ((phase.kind === "speech" || phase.kind === "judgeAnswer") && isAiControlledRole(phase.speaker)) {
        const kind = messageKindForRole(phase.speaker);
        return { kind, voiceKey: kind };
    }
    return null;
}

function wholeSpeechPreparationMatches(record, phase, text, descriptor) {
    return !!record
        && record.phaseId === phase?.id
        && record.matchRunId === state.matchRunId
        && record.text === normalizeSpeechText(text)
        && record.kind === descriptor?.kind
        && record.voiceKey === descriptor?.voiceKey;
}

function releaseWholeSpeechPreparation(record) {
    if (!record || record.consumed || record.released) return;
    record.released = true;
    (record.preparedChunks || []).forEach((item) => revokePreparedSpeechAudio(item?.prepared));
    record.preparedChunks = [];
}

function clearWholeSpeechPreparation(phaseId) {
    const record = state.wholeSpeechPreparations.get(phaseId);
    if (!record) return;
    state.wholeSpeechPreparations.delete(phaseId);
    releaseWholeSpeechPreparation(record);
}

function clearAllWholeSpeechPreparations() {
    const records = [...state.wholeSpeechPreparations.values()];
    state.wholeSpeechPreparations.clear();
    records.forEach(releaseWholeSpeechPreparation);
}

function prepareWholeSpeechAudioForPhase(phase, text, descriptor = getWholeSpeechDescriptorForPhase(phase)) {
    const normalized = normalizeSpeechText(text);
    if (TIMING_TEST_MODE || !phase?.id || !phase.duration || !normalized || !descriptor) return Promise.resolve(null);
    const existing = state.wholeSpeechPreparations.get(phase.id);
    if (wholeSpeechPreparationMatches(existing, phase, normalized, descriptor)) return existing.promise;
    if (existing) clearWholeSpeechPreparation(phase.id);

    const matchRunId = state.matchRunId;
    const speechToken = state.speechToken;
    const entries = buildSpeechQueueEntries(descriptor.kind, normalized, -1, descriptor.voiceKey, {
        speechStartLeadMs: TIMED_SPEECH_TIMER_LEAD_MS
    });
    if (!entries.length) return Promise.resolve(null);

    const record = {
        phaseId: phase.id,
        matchRunId,
        text: normalized,
        kind: descriptor.kind,
        voiceKey: descriptor.voiceKey,
        entries,
        preparedChunks: [],
        totalAudioDurationSeconds: 0,
        plan: null,
        consumed: false,
        released: false,
        promise: null
    };
    state.wholeSpeechPreparations.set(phase.id, record);

    record.promise = (async () => {
        let results = [];
        try {
            results = await SPEECH_TIMING.mapWithConcurrency(
                entries,
                WHOLE_SPEECH_TTS_CONCURRENCY,
                async (entry) => {
                    let prepared = null;
                    try {
                        prepared = await fetchOpenAiSpeechAudio(entry, speechToken, {
                            controllerKind: "whole-speech-preload",
                            trackController: false
                        });
                        if (!prepared) return { entry, cancelled: true };
                        const decodedTiming = await decodeSpeechAudioDuration(prepared.audioBytes, prepared.audioUrl);
                        return { entry, prepared, decodedTiming };
                    } catch (error) {
                        return { entry, prepared, error };
                    }
                }
            );

            const isCurrent = state.wholeSpeechPreparations.get(phase.id) === record
                && matchRunId === state.matchRunId
                && speechToken === state.speechToken;
            const failed = results.find((result) => result.error);
            if (!isCurrent || results.some((result) => result.cancelled)) {
                results.forEach((result) => revokePreparedSpeechAudio(result.prepared));
                return null;
            }
            if (failed) {
                results.forEach((result) => revokePreparedSpeechAudio(result.prepared));
                throw failed.error;
            }

            record.preparedChunks = results;
            record.totalAudioDurationSeconds = results.reduce(
                (total, result) => total + Math.max(0, Number(result.decodedTiming?.durationSeconds) || 0),
                0
            );
            record.plan = SPEECH_TIMING.planWholeSpeechPlayback({
                audioDurationSeconds: record.totalAudioDurationSeconds,
                timerLeadMs: TIMED_SPEECH_TIMER_LEAD_MS,
                timerBudgetSeconds: phase.duration,
                minimumPlaybackRate: WHOLE_SPEECH_MIN_PLAYBACK_RATE,
                maximumPlaybackRate: WHOLE_SPEECH_MAX_PLAYBACK_RATE
            });
            console.info(`[speech-rate-plan] ${JSON.stringify({
                phaseId: phase.id,
                naturalAudioSeconds: Number(record.totalAudioDurationSeconds.toFixed(2)),
                playbackRate: Number(record.plan.playbackRate.toFixed(4)),
                projectedClockSeconds: Number(record.plan.projectedTimerConsumedSeconds.toFixed(2))
            })}`);
            return record;
        } catch (error) {
            results.forEach((result) => revokePreparedSpeechAudio(result.prepared));
            if (state.wholeSpeechPreparations.get(phase.id) === record) {
                state.wholeSpeechPreparations.delete(phase.id);
            }
            throw error;
        }
    })();
    return record.promise;
}

function primeWholeSpeechAudioForPhase(phase, text) {
    const descriptor = getWholeSpeechDescriptorForPhase(phase);
    if (!descriptor) return;
    void prepareWholeSpeechAudioForPhase(phase, text, descriptor).catch((error) => {
        console.warn(`Whole-speech audio preparation failed for ${phase.id}; playback will retry.`, error);
    });
}

function recordTimingTestSpeechChunk(prepared, decodedTiming) {
    if (!TIMING_TEST_MODE || !prepared?.entry || !decodedTiming) return null;
    const entry = prepared.entry;
    const transcriptIndex = Number(entry.transcriptIndex);
    if (!Number.isInteger(transcriptIndex) || transcriptIndex < 0) return null;
    const chunkCount = Math.max(1, Math.round(Number(entry.chunkCount) || 1));
    let measurement = state.timingTestMeasurements.get(transcriptIndex);
    if (!measurement) {
        measurement = {
            transcriptIndex,
            chunkCount,
            measuredChunks: 0,
            audioDurationSeconds: 0,
            timerLeadMs: 0,
            decodeMethods: new Set(),
            audioChunks: new Array(chunkCount),
            fastForwarded: getTimingTestFastForwardForMessage(transcriptIndex)
        };
        state.timingTestMeasurements.set(transcriptIndex, measurement);
    }

    measurement.measuredChunks += 1;
    measurement.audioDurationSeconds += decodedTiming.durationSeconds;
    measurement.timerLeadMs += Math.max(0, Number(entry.speechStartLeadMs) || 0);
    measurement.decodeMethods.add(decodedTiming.method);
    const chunkIndex = Math.max(0, Math.min(chunkCount - 1, Math.round(Number(entry.chunkIndex) || 0)));
    measurement.audioChunks[chunkIndex] = {
        audioUrl: prepared.audioUrl,
        mimeType: prepared.mimeType,
        text: entry.text
    };
    prepared.retainedForTimingPreview = true;
    if (measurement.measuredChunks < measurement.chunkCount) return null;

    state.timingTestMeasurements.delete(transcriptIndex);
    const message = state.transcript[transcriptIndex] || {};
    const phase = getPhaseById(message.phaseId);
    if (!SPEECH_TIMING.shouldReportTimedMessage(message, phase)) {
        revokeTimingTestAudioChunks(measurement.audioChunks);
        return null;
    }

    const wordCount = countWords(message.text);
    const naturalSummary = SPEECH_TIMING.summarizeTimedSpeech({
        audioDurationSeconds: measurement.audioDurationSeconds,
        timerLeadMs: measurement.timerLeadMs,
        timerBudgetSeconds: phase.duration,
        wordCount
    });
    const playbackPlan = SPEECH_TIMING.planWholeSpeechPlayback({
        audioDurationSeconds: measurement.audioDurationSeconds,
        timerLeadMs: measurement.timerLeadMs,
        timerBudgetSeconds: phase.duration,
        minimumPlaybackRate: WHOLE_SPEECH_MIN_PLAYBACK_RATE,
        maximumPlaybackRate: WHOLE_SPEECH_MAX_PLAYBACK_RATE
    });
    const adjustedSummary = SPEECH_TIMING.summarizeTimedSpeech({
        audioDurationSeconds: playbackPlan.projectedPlaybackSeconds,
        timerLeadMs: measurement.timerLeadMs,
        timerBudgetSeconds: phase.duration,
        wordCount
    });

    const result = {
        transcriptIndex,
        phaseId: phase.id,
        phaseTitle: phase.title,
        label: message.label || l("Speaker", "Oratrice"),
        chunkCount: measurement.chunkCount,
        decodeMethods: [...measurement.decodeMethods],
        audioChunks: measurement.audioChunks,
        fastForwarded: measurement.fastForwarded,
        naturalSummary,
        playbackPlan,
        summary: adjustedSummary
    };
    state.timingTestResults.push(result);
    console.info(`[timing-test-result] ${JSON.stringify({
        phaseId: result.phaseId,
        phaseTitle: result.phaseTitle,
        label: result.label,
        words: result.summary.wordCount,
        naturalAudioSeconds: Number(result.naturalSummary.audioDurationSeconds.toFixed(2)),
        playbackRate: Number(result.playbackPlan.playbackRate.toFixed(4)),
        adjustedAudioSeconds: Number(result.summary.audioDurationSeconds.toFixed(2)),
        clockSeconds: Number(result.summary.timerConsumedSeconds.toFixed(2)),
        budgetSeconds: result.summary.timerBudgetSeconds,
        remainingSeconds: Number(result.summary.remainingSeconds.toFixed(2)),
        overrunSeconds: Number(result.summary.overrunSeconds.toFixed(2)),
        adjustedWordsPerMinute: Number(result.summary.wordsPerMinute.toFixed(1)),
        chunks: result.chunkCount,
        fastForwarded: result.fastForwarded
    })}`);
    renderTimingTestResults();
    return result;
}

function freezeTimerForFastForwardedSpeech(entry) {
    if (!TIMING_TEST_MODE) return;
    const message = state.transcript[entry?.transcriptIndex] || {};
    const phase = getPhaseById(message.phaseId);
    if (!SPEECH_TIMING.isTimedSpokenPhase(phase)) return;
    stopTimer();
    state.timer.phaseId = phase.id;
    state.timer.remaining = phase.duration;
    timerDisplayEl.textContent = formatClock(phase.duration);
    timerHintEl.textContent = l(
        "Fast-forwarding generated audio; exact virtual clock use will be reported.",
        "Avance rapide de l’audio généré; l’utilisation exacte de la minuterie virtuelle sera indiquée."
    );
}

function showFastForwardedTimingOnTimer(result) {
    if (!result?.fastForwarded || state.timer.phaseId !== result.phaseId) return;
    state.timer.remaining = Math.max(0, Math.ceil(result.summary.signedRemainingSeconds));
    timerDisplayEl.textContent = formatClock(state.timer.remaining);
    timerHintEl.textContent = result.summary.overrunSeconds > 0
        ? l(
            `Virtual ${result.playbackPlan.playbackRate.toFixed(3)}× result: ${formatPreciseDuration(result.summary.overrunSeconds)} over time.`,
            `Résultat virtuel à ${result.playbackPlan.playbackRate.toFixed(3)}× : dépassement de ${formatPreciseDuration(result.summary.overrunSeconds)}.`
        )
        : l(
            `Virtual ${result.playbackPlan.playbackRate.toFixed(3)}× result: ${formatPreciseDuration(result.summary.remainingSeconds)} left.`,
            `Résultat virtuel à ${result.playbackPlan.playbackRate.toFixed(3)}× : ${formatPreciseDuration(result.summary.remainingSeconds)} restant.`
        );
}

function createLocalAbortError() {
    const error = new Error(STOP_SPEECH_ERROR);
    error.name = "AbortError";
    return error;
}

async function fetchOpenAiSpeechAudio(entry, token, { controllerKind = "direct", trackController = true } = {}) {
    if (token !== state.speechToken) return null;
    if (entry?.preparedAudio?.audioUrl) {
        const preparedAudio = entry.preparedAudio;
        entry.preparedAudio = null;
        return { ...preparedAudio, entry };
    }
    if (!hasCredential("openai")) throw new Error(l("An OpenAI credential is required for OpenAI read-aloud.", "Un identifiant OpenAI est requis pour la lecture OpenAI."));
    const controller = new AbortController();
    if (trackController) {
        state.currentSpeechController = controller;
        state.currentSpeechControllerKind = controllerKind;
        refreshSpeechUi();
    }
    try {
        const isModerator = entry.kind === "moderator";
        const result = await getAudioBridge().speech({
            model: isModerator ? AUDIO_MODELS.moderatorSpeech : AUDIO_MODELS.speech,
            voice: AUTO_SPEAK_VOICES[entry.voiceKey] || AUTO_SPEAK_VOICES[entry.kind] || "alloy",
            input: entry.text.slice(0, MAX_TTS_CHARS),
            responseFormat: "mp3",
            ...(isModerator ? { instructions: MODERATOR_SPEECH_INSTRUCTIONS } : {})
        });
        if (controller.signal.aborted) throw createLocalAbortError();
        if (token !== state.speechToken) return null;
        const audioBytes = toUint8Array(result?.bytes);
        const blob = new Blob([audioBytes], { type: sanitizeText(result?.mimeType) || "audio/mpeg" });
        if (!blob.size) throw new Error("Empty speech audio response.");
        return {
            entry,
            audioUrl: URL.createObjectURL(blob),
            audioBytes,
            mimeType: blob.type
        };
    } finally {
        if (trackController && state.currentSpeechController === controller) {
            state.currentSpeechController = null;
            state.currentSpeechControllerKind = "";
        }
        if (trackController) refreshSpeechUi();
    }
}

async function playPreparedOpenAiSpeechChunk(prepared, token) {
    const audioEl = ensureSpeechAudioEl();
    if (!prepared?.audioUrl || token !== state.speechToken) return;
    if (state.currentAudioUrl && state.currentAudioUrl !== prepared.audioUrl) {
        try { URL.revokeObjectURL(state.currentAudioUrl); } catch {}
        state.currentAudioUrl = "";
    }
    state.currentAudioUrl = prepared.audioUrl;
    audioEl.src = prepared.audioUrl;
    const requestedPlaybackRate = Number(prepared.entry?.playbackRate);
    const playbackRate = Number.isFinite(requestedPlaybackRate) && requestedPlaybackRate > 0
        ? Math.min(WHOLE_SPEECH_MAX_PLAYBACK_RATE, Math.max(WHOLE_SPEECH_MIN_PLAYBACK_RATE, requestedPlaybackRate))
        : 1;
    audioEl.defaultPlaybackRate = playbackRate;
    audioEl.playbackRate = playbackRate;
    if ("preservesPitch" in audioEl) audioEl.preservesPitch = true;
    if ("webkitPreservesPitch" in audioEl) audioEl.webkitPreservesPitch = true;
    state.speechPlaybackActive = true;
    refreshSpeechUi();
    queueSpeechFollowScroll(true);
    try {
        await new Promise((resolve, reject) => {
            let settled = false;
            let playbackStarted = false;
            const notifyPlaybackStarted = () => {
                if (playbackStarted || token !== state.speechToken) return;
                playbackStarted = true;
                invokeSpeechStartCallbacks(prepared.entry?.transcriptIndex);
            };
            const rejectRef = (error) => {
                if (settled) return;
                settled = true;
                if (state.currentSpeechReject === rejectRef) state.currentSpeechReject = null;
                reject(error);
            };
            const resolveRef = () => {
                if (settled) return;
                notifyPlaybackStarted();
                settled = true;
                if (state.currentSpeechReject === rejectRef) state.currentSpeechReject = null;
                resolve();
            };
            state.currentSpeechReject = rejectRef;
            audioEl.onplaying = notifyPlaybackStarted;
            audioEl.onended = resolveRef;
            audioEl.onerror = () => rejectRef(new Error("AI voice playback failed."));
            try {
                const playPromise = audioEl.play();
                if (playPromise && typeof playPromise.then === "function") {
                    playPromise.then(notifyPlaybackStarted).catch(() => rejectRef(new Error("Voice autoplay was blocked.")));
                }
            } catch {
                rejectRef(new Error("Voice autoplay was blocked."));
            }
        });
    } finally {
        state.speechPlaybackActive = false;
        refreshSpeechUi();
    }
}

function kickOpenAiSpeechLookahead(token) {
    if (token !== state.speechToken) return;
    if (state.openAiSpeechLookaheadPromise || state.openAiSpeechLookaheadPrepared) return;
    const nextEntry = state.speechQueue.shift();
    if (!nextEntry) return;
    state.openAiSpeechLookaheadEntry = nextEntry;
    let trackedPromise = null;
    trackedPromise = fetchOpenAiSpeechAudio(nextEntry, token, { controllerKind: "lookahead" })
    .then((prepared) => {
        if (!prepared) return null;
        if (token !== state.speechToken || state.openAiSpeechLookaheadPromise !== trackedPromise) {
            if (prepared.audioUrl) {
                try { URL.revokeObjectURL(prepared.audioUrl); } catch {}
            }
            return null;
        }
        state.openAiSpeechLookaheadPrepared = prepared;
        refreshSpeechUi();
        return prepared;
    })
    .catch((error) => {
        if (!error?.speechEntry) error.speechEntry = nextEntry;
        throw error;
    });
    trackedPromise.catch(() => {});
    state.openAiSpeechLookaheadPromise = trackedPromise;
    refreshSpeechUi();
}

async function getNextOpenAiSpeechPrepared(token) {
    if (token !== state.speechToken) return null;
    if (state.openAiSpeechLookaheadPrepared) {
        const prepared = state.openAiSpeechLookaheadPrepared;
        state.openAiSpeechLookaheadPrepared = null;
        state.openAiSpeechLookaheadPromise = null;
        state.openAiSpeechLookaheadEntry = null;
        refreshSpeechUi();
        return prepared;
    }
    if (state.openAiSpeechLookaheadPromise) {
        const promise = state.openAiSpeechLookaheadPromise;
        try {
            const prepared = await promise;
            if (state.openAiSpeechLookaheadPromise === promise) {
                state.openAiSpeechLookaheadPrepared = null;
                state.openAiSpeechLookaheadPromise = null;
                state.openAiSpeechLookaheadEntry = null;
            }
            refreshSpeechUi();
            return prepared;
        } catch (error) {
            if (state.openAiSpeechLookaheadPromise === promise) {
                const failedEntry = state.openAiSpeechLookaheadEntry;
                state.openAiSpeechLookaheadPrepared = null;
                state.openAiSpeechLookaheadPromise = null;
                state.openAiSpeechLookaheadEntry = null;
                if (!error?.speechEntry && failedEntry) error.speechEntry = failedEntry;
            }
            refreshSpeechUi();
            throw error;
        }
    }
    const directEntry = state.speechQueue.shift();
    if (!directEntry) return null;
    try {
        return await fetchOpenAiSpeechAudio(directEntry, token, { controllerKind: "direct" });
    } catch (error) {
        if (!error?.speechEntry) error.speechEntry = directEntry;
        throw error;
    }
}

function handleOpenAiSpeechFailure(error, token) {
    if (token !== state.speechToken) return;
    console.error("OpenAI read-aloud failed:", error);
    const detail = safeBridgeErrorMessage(error);
    stopSpeechPlayback(false);
    setStatus(
        detail || l("OpenAI read-aloud failed.", "La lecture OpenAI a échoué."),
        true
    );
}

function revokePreparedSpeechAudio(prepared) {
    if (!prepared?.audioUrl) return;
    try { URL.revokeObjectURL(prepared.audioUrl); } catch {}
}

function takeNextTimingTestSpeechMessage() {
    if (!TIMING_TEST_MODE || !state.speechQueue.length) return [];
    const transcriptIndex = state.speechQueue[0]?.transcriptIndex;
    const entries = [];
    while (state.speechQueue[0]?.transcriptIndex === transcriptIndex) {
        entries.push(state.speechQueue.shift());
    }
    return entries;
}

async function processConcurrentTimingTestSpeech(entries, token) {
    const results = await SPEECH_TIMING.mapWithConcurrency(
        entries,
        TIMING_TEST_TTS_CONCURRENCY,
        async (entry) => {
            let prepared = null;
            try {
                prepared = await fetchOpenAiSpeechAudio(entry, token, {
                    controllerKind: "timing-test",
                    trackController: false
                });
                if (!prepared) return { entry, cancelled: true };
                const decodedTiming = await decodeSpeechAudioDuration(prepared.audioBytes, prepared.audioUrl);
                return { entry, prepared, decodedTiming };
            } catch (error) {
                return { entry, prepared, error };
            }
        }
    );

    if (token !== state.speechToken || results.some((result) => result.cancelled)) {
        results.forEach((result) => revokePreparedSpeechAudio(result.prepared));
        return false;
    }

    const failed = results.find((result) => result.error);
    if (failed) {
        results.forEach((result) => revokePreparedSpeechAudio(result.prepared));
        if (!failed.error?.speechEntry) failed.error.speechEntry = failed.entry;
        throw failed.error;
    }

    results.forEach(({ prepared, decodedTiming }) => {
        const timingTestResult = recordTimingTestSpeechChunk(prepared, decodedTiming);
        invokeSpeechStartCallbacks(prepared.entry?.transcriptIndex);
        freezeTimerForFastForwardedSpeech(prepared.entry);
        showFastForwardedTimingOnTimer(timingTestResult);
        markSpeechChunkComplete(prepared.entry.transcriptIndex);
        if (!prepared.retainedForTimingPreview) revokePreparedSpeechAudio(prepared);
    });
    refreshSpeechUi();
    await waitMs(0);
    return token === state.speechToken;
}

async function processSpeechQueue(token = state.speechToken) {
    if (state.speechProcessing) return;
    state.speechProcessing = true;
    refreshSpeechUi();
    try {
        while (token === state.speechToken) {
            if (TIMING_TEST_MODE) {
                const timingEntries = takeNextTimingTestSpeechMessage();
                if (!timingEntries.length) break;
                try {
                    if (!await processConcurrentTimingTestSpeech(timingEntries, token)) break;
                } catch (error) {
                    if (token !== state.speechToken || error?.name === "AbortError" || error?.message === STOP_SPEECH_ERROR) break;
                    handleOpenAiSpeechFailure(error, token);
                    break;
                }
                continue;
            }
            let prepared = null;
            try {
                prepared = await getNextOpenAiSpeechPrepared(token);
            } catch (error) {
                if (token !== state.speechToken || error?.name === "AbortError" || error?.message === STOP_SPEECH_ERROR) break;
                handleOpenAiSpeechFailure(error, token);
                break;
            }
            if (!prepared) break;
            kickOpenAiSpeechLookahead(token);
            const minimumHandoffGapMs = Math.max(0, Math.min(3000, Number(prepared.entry?.minimumHandoffGapMs) || 0));
            const elapsedSincePriorSpeechMs = state.lastSpeechEndedAtMs
                ? Math.max(0, Date.now() - state.lastSpeechEndedAtMs)
                : minimumHandoffGapMs;
            const remainingHandoffGapMs = Math.max(0, minimumHandoffGapMs - elapsedSincePriorSpeechMs);
            if (remainingHandoffGapMs) {
                await waitMs(remainingHandoffGapMs);
                if (token !== state.speechToken) {
                    if (prepared.audioUrl) {
                        try { URL.revokeObjectURL(prepared.audioUrl); } catch {}
                    }
                    break;
                }
            }
            invokeSpeechStartCallbacks(prepared.entry?.transcriptIndex);
            const speechStartLeadMs = Math.max(0, Math.min(3000, Number(prepared.entry?.speechStartLeadMs) || 0));
            if (speechStartLeadMs) {
                await waitMs(speechStartLeadMs);
                if (token !== state.speechToken) {
                    if (prepared.audioUrl) {
                        try { URL.revokeObjectURL(prepared.audioUrl); } catch {}
                    }
                    break;
                }
            }
            beginSpeechProgressForQueueEntry(prepared.entry);
            try {
                await playPreparedOpenAiSpeechChunk(prepared, token);
                state.lastSpeechEndedAtMs = Date.now();
                markSpeechChunkComplete(prepared.entry.transcriptIndex);
            } catch (error) {
                if (token !== state.speechToken || error?.name === "AbortError" || error?.message === STOP_SPEECH_ERROR) break;
                handleOpenAiSpeechFailure(error, token);
                break;
            } finally {
                resetSpeechAudioEl();
                refreshSpeechUi();
            }
        }
    } finally {
        state.speechProcessing = false;
        if (token === state.speechToken && !state.speechQueue.length && !state.openAiSpeechLookaheadPromise && !state.openAiSpeechLookaheadPrepared && !state.currentSpeechController && !state.speechPlaybackActive) {
            finishSpeechProgressPlayback();
        }
        refreshSpeechUi();
    }
}

function enqueuePreparedWholeSpeech(kind, text, transcriptIndex, voiceKey, options, phase) {
    const descriptor = { kind, voiceKey: voiceKey || kind };
    const enqueueToken = state.speechToken;
    const enqueueRunId = state.matchRunId;
    state.wholeSpeechPendingTranscriptIndexes.add(transcriptIndex);
    ensureSpeechUi();
    refreshSpeechUi();

    void prepareWholeSpeechAudioForPhase(phase, text, descriptor)
    .then((record) => {
        if (!record) return;
        const message = state.transcript[transcriptIndex];
        const isCurrent = enqueueToken === state.speechToken
            && enqueueRunId === state.matchRunId
            && normalizeSpeechText(message?.text) === normalizeSpeechText(text)
            && message?.phaseId === phase.id;
        if (!isCurrent) {
            clearWholeSpeechPreparation(phase.id);
            return;
        }

        const entries = buildSpeechQueueEntries(kind, text, transcriptIndex, voiceKey, options);
        const chunksMatch = entries.length === record.preparedChunks.length
            && entries.every((entry, index) => entry.text === record.preparedChunks[index]?.entry?.text);
        if (!chunksMatch) {
            clearWholeSpeechPreparation(phase.id);
            throw new Error("Prepared whole-speech audio no longer matches the queued speech text.");
        }

        const timerLeadMs = entries.reduce(
            (total, entry) => total + Math.max(0, Number(entry.speechStartLeadMs) || 0),
            0
        );
        const plan = SPEECH_TIMING.planWholeSpeechPlayback({
            audioDurationSeconds: record.totalAudioDurationSeconds,
            timerLeadMs,
            timerBudgetSeconds: phase.duration,
            minimumPlaybackRate: WHOLE_SPEECH_MIN_PLAYBACK_RATE,
            maximumPlaybackRate: WHOLE_SPEECH_MAX_PLAYBACK_RATE
        });

        if (state.wholeSpeechPreparations.get(phase.id) === record) {
            state.wholeSpeechPreparations.delete(phase.id);
        }
        record.consumed = true;
        entries.forEach((entry, index) => {
            const prepared = record.preparedChunks[index].prepared;
            entry.playbackRate = plan.playbackRate;
            entry.preparedAudio = {
                audioUrl: prepared.audioUrl,
                audioBytes: prepared.audioBytes,
                mimeType: prepared.mimeType
            };
        });
        record.preparedChunks = [];

        trackSpeechChunksForMessage(transcriptIndex, entries.length);
        state.speechQueue.push(...entries);
        refreshSpeechUi();
        void processSpeechQueue(enqueueToken);
    })
    .catch((error) => {
        if (enqueueToken !== state.speechToken || enqueueRunId !== state.matchRunId) return;
        handleOpenAiSpeechFailure(error, enqueueToken);
    })
    .finally(() => {
        state.wholeSpeechPendingTranscriptIndexes.delete(transcriptIndex);
        refreshSpeechUi();
    });
}

function enqueueTranscriptSpeech(kind, text, transcriptIndex = -1, voiceKey = "", options = {}) {
    if (!AUTO_SPEAK_MESSAGE_KINDS.has(kind)) return;
    const normalized = normalizeSpeechText(text);
    if (!normalized) return;
    const phase = getPhaseById(options.phaseId);
    const descriptor = getWholeSpeechDescriptorForPhase(phase);
    const usePreparedWholeSpeech = !TIMING_TEST_MODE
        && !!descriptor
        && descriptor.kind === kind
        && descriptor.voiceKey === (voiceKey || kind);
    if (usePreparedWholeSpeech) {
        enqueuePreparedWholeSpeech(kind, normalized, transcriptIndex, voiceKey, options, phase);
        return;
    }

    const chunks = buildSpeechQueueEntries(kind, normalized, transcriptIndex, voiceKey, options);
    if (!chunks.length) {
        finalizeSpeechPlaybackForMessage(transcriptIndex);
        return;
    }
    trackSpeechChunksForMessage(transcriptIndex, chunks.length);
    ensureSpeechUi();
    state.speechQueue.push(...chunks);
    if (state.speechPlaybackActive && !state.openAiSpeechLookaheadPromise && !state.openAiSpeechLookaheadPrepared) {
        kickOpenAiSpeechLookahead(state.speechToken);
    }
    refreshSpeechUi();
    void processSpeechQueue(state.speechToken);
}

function shouldAutoSpeakMessage(kind, text, options = {}) {
    if (options.silent || !AUTO_SPEAK_MESSAGE_KINDS.has(kind) || !normalizeSpeechText(text)) return false;
    if (!TIMING_TEST_MODE) return true;
    const phase = getPhaseById(options.phaseId);
    return SPEECH_TIMING.shouldReportTimedMessage({ kind }, phase);
}

function appendMessage(kind, label, text, options = {}) {
    const voiceKey = getVoiceKeyForMessage(kind, options);
    state.transcript.push({
        kind,
        label,
        text: String(text || ""),
                          time: new Date().toISOString(),
                          caseNum: options.caseNum || 0,
                              phaseId: options.phaseId || "",
                              voiceKey,
                              substantive: options.substantive !== false,
                              hiddenUntilPhaseReady: options.hiddenUntilPhaseReady === true
    });
    const transcriptIndex = state.transcript.length - 1;
    const onPlaybackStart = typeof options.onPlaybackStart === "function" ? options.onPlaybackStart : null;
    const onPlaybackComplete = typeof options.onPlaybackComplete === "function" ? options.onPlaybackComplete : null;
    const willAutoSpeak = shouldAutoSpeakMessage(kind, text, options);
    if (onPlaybackStart) {
        if (willAutoSpeak) registerSpeechStartCallback(transcriptIndex, onPlaybackStart);
        else {
            window.setTimeout(() => {
                try { onPlaybackStart(); } catch (error) { console.error("Immediate playback-start callback failed:", error); }
            }, 0);
        }
    }
    if (onPlaybackComplete) {
        if (willAutoSpeak) registerSpeechCompletionCallback(transcriptIndex, onPlaybackComplete);
        else {
            window.setTimeout(() => {
                try { onPlaybackComplete(); } catch (error) { console.error("Immediate playback callback failed:", error); }
            }, 0);
        }
    }
    renderTranscript();
    if (willAutoSpeak) enqueueTranscriptSpeech(kind, text, transcriptIndex, voiceKey, options);
    return transcriptIndex;
}

function buildPhases() {
    const phases = [];
    const conferTitle = (subtype) => {
        if (!isFrenchLocale()) return `${phaseSubtypeLabel(subtype)} Confer`;
        if (subtype === "presentation") return "Caucus de présentation";
        if (subtype === "commentary") return "Caucus de commentaire";
        return "Caucus de réplique";
    };
    [1, 2].forEach((caseNum) => {
        const leader = state.leadByCase[caseNum];
        const responder = otherRole(leader);
        phases.push({
            id: `case${caseNum}-moderator`,
            kind: "moderatorCase",
            caseNum,
            title: isFrenchLocale() ? `Phase du modérateur — ${caseLabel(caseNum)}` : `Moderator's Phase #${caseNum}`,
                    duration: null
        });
        phases.push({
            id: `case${caseNum}-presentation-confer`,
            kind: "confer",
            caseNum,
            title: `${caseLabel(caseNum)}: ${conferTitle("presentation")}`,
                    subtype: "presentation",
                    speaker: leader,
                    duration: TIMINGS.presentationConfer
        });
        phases.push({
            id: `case${caseNum}-presentation`,
            kind: "speech",
            caseNum,
            title: `${caseLabel(caseNum)}: ${phaseSubtypeLabel("presentation")}`,
                    subtype: "presentation",
                    speaker: leader,
                    duration: TIMINGS.presentationSpeak
        });
        phases.push({
            id: `case${caseNum}-commentary-confer`,
            kind: "confer",
            caseNum,
            title: `${caseLabel(caseNum)}: ${conferTitle("commentary")}`,
                    subtype: "commentary",
                    speaker: responder,
                    duration: TIMINGS.commentaryConfer
        });
        phases.push({
            id: `case${caseNum}-commentary`,
            kind: "speech",
            caseNum,
            title: `${caseLabel(caseNum)}: ${phaseSubtypeLabel("commentary")}`,
                    subtype: "commentary",
                    speaker: responder,
                    duration: TIMINGS.commentarySpeak
        });
        phases.push({
            id: `case${caseNum}-response-confer`,
            kind: "confer",
            caseNum,
            title: `${caseLabel(caseNum)}: ${conferTitle("response")}`,
                    subtype: "response",
                    speaker: leader,
                    duration: TIMINGS.responseConfer
        });
        phases.push({
            id: `case${caseNum}-response`,
            kind: "speech",
            caseNum,
            title: `${caseLabel(caseNum)}: ${phaseSubtypeLabel("response")}`,
                    subtype: "response",
                    speaker: leader,
                    duration: TIMINGS.responseSpeak
        });
        for (let judgeNumber = 1; judgeNumber <= 3; judgeNumber += 1) {
            phases.push({
                id: `case${caseNum}-judge${judgeNumber}-question`,
                kind: "judgeQuestion",
                caseNum,
                title: isFrenchLocale() ? `${caseLabel(caseNum)} : question du ${judgeLabel(judgeNumber)}` : `Case #${caseNum}: Judge ${judgeNumber} Question`,
                        judgeNumber,
                        answerer: leader,
                        duration: TIMINGS.judgeAsk
            });
            phases.push({
                id: `case${caseNum}-judge${judgeNumber}-answer`,
                kind: "judgeAnswer",
                caseNum,
                title: isFrenchLocale() ? `${caseLabel(caseNum)} : réponse au ${judgeLabel(judgeNumber)}` : `Case #${caseNum}: Judge ${judgeNumber} Answer`,
                        judgeNumber,
                        speaker: leader,
                        duration: TIMINGS.judgeAnswer
            });
        }
        phases.push({
            id: `case${caseNum}-scoring`,
            kind: "scoring",
            caseNum,
            title: isFrenchLocale() ? `${caseLabel(caseNum)} : pointage des juges` : `Case #${caseNum}: Judges Scoring`,
                    duration: null
        });
    });
    phases.push({ id: "closing", kind: "closing", title: l("Closing Phase", "Clôture"), duration: null });
    return phases;
}

function getCurrentPhase() {
    return state.phases[state.currentPhaseIndex] || null;
}

function getLinkedAiPreparationTarget(phase) {
    if (!phase) return null;
    const nextPhase = state.phases[state.currentPhaseIndex + 1] || null;
    if (!nextPhase) return null;
    if (
        phase.kind === "confer" &&
        isAiControlledRole(phase.speaker) &&
        nextPhase.kind === "speech" &&
        isAiControlledRole(nextPhase.speaker) &&
        nextPhase.caseNum === phase.caseNum &&
        nextPhase.subtype === phase.subtype
    ) return nextPhase;
    return null;
}

function getPreparedAiTurnText(phaseId) {
    return sanitizeText(state.aiPreparedTurns[phaseId]?.text || "");
}

function getAiPreparationSnapshot(phaseId) {
    const snapshot = state.aiPreparationSnapshots[phaseId];
    if (!snapshot) return { text: "", completedPasses: 0, baselineRevisionWordCount: 0 };
    return {
        text: sanitizeText(snapshot.text),
        completedPasses: Math.max(0, Math.floor(Number(snapshot.completedPasses) || 0)),
        baselineRevisionWordCount: Math.max(0, Math.floor(Number(snapshot.baselineRevisionWordCount) || 0))
    };
}

function cacheAiPreparationSnapshot(phaseId, text, completedPasses, baselineRevisionWordCount = 0) {
    const clean = sanitizeText(text);
    if (!phaseId || !clean) return;
    state.aiPreparationSnapshots[phaseId] = {
        text: clean,
        completedPasses: Math.max(0, Math.floor(Number(completedPasses) || 0)),
        baselineRevisionWordCount: Math.max(0, Math.floor(Number(baselineRevisionWordCount) || 0)),
        updatedAt: new Date().toISOString()
    };
}

function clearAiPreparationSnapshot(phaseId) {
    if (!phaseId) return;
    delete state.aiPreparationSnapshots[phaseId];
}

function getAiTurnMaxOutputTokens(phase) {
    if (!phase) return 2200;
    if (phase.kind === "judgeAnswer") return 3000;
    if (phase.subtype === "presentation") return 4000;
    if (phase.subtype === "commentary" || phase.subtype === "response") return 2800;
    return 2200;
}

/* --------------------- AI prep / judge prep / scoring helpers --------------------- */
/* unchanged logic, only locale-aware visible strings and labels updated below */

async function maybePrepareAiTurnForPhase(phase, options = {}) {
    const phaseId = phase?.id || "";
    const revisionPasses = Math.max(0, Math.floor(Number(options?.revisionPasses) || 0));
    const totalPasses = 1 + revisionPasses;
    if (!phaseId || !isAiControlledRole(phase.speaker)) return "";
    const cached = getPreparedAiTurnText(phaseId);
    if (cached) return cached;
    if (state.aiPreparationPromises[phaseId]) return state.aiPreparationPromises[phaseId];
    const runId = state.matchRunId;
    let trackedPromise = null;
    trackedPromise = (async () => {
        try {
            const maxTokens = getAiTurnMaxOutputTokens(phase);
            const boundJudgeQuestion = phase.kind === "judgeAnswer" ? getJudgeQuestionForAnswerPhase(phase) : "";
            if (phase.kind === "judgeAnswer" && !boundJudgeQuestion) {
                throw new Error(isFrenchLocale()
                ? `La question du ${judgeLabel(phase.judgeNumber)} manque, donc ${speakerName(phase.speaker)} ne peut pas encore y répondre.`
                : `Judge ${phase.judgeNumber}'s question is missing, so ${speakerName(phase.speaker)} cannot answer it yet.`);
            }
            let { text, completedPasses, baselineRevisionWordCount } = getAiPreparationSnapshot(phaseId);
            completedPasses = Math.min(totalPasses, completedPasses);

            if (completedPasses < 1 || !text) {
                text = sanitizeText(await callAI({
                    model: getParticipantModel(phase.speaker),
                                                         systemPrompt: buildAiDebaterSystemPrompt(phase.speaker),
                                                         userPrompt: buildAiTurnPrompt(phase),
                                                         maxTokens
                }));
                if (!text) throw new Error(l("The model returned no text.", "Le modèle n’a renvoyé aucun texte."));
                if (phase.kind === "judgeAnswer") {
                    const currentBoundJudgeQuestion = getJudgeQuestionForAnswerPhase(phase);
                    if (sanitizeText(boundJudgeQuestion) !== sanitizeText(currentBoundJudgeQuestion)) {
                        throw new Error(l("The judge question changed while the AI answer was being prepared.", "La question du juge a changé pendant la préparation de la réponse IA."));
                    }
                    text = sanitizeText(await enforceDirectJudgeAnswer(phase, text));
                    if (!text) throw new Error(l("The model returned no text.", "Le modèle n’a renvoyé aucun texte."));
                }
                text = sanitizeText(await enforcePhaseWordCount(phase, text, { mode: "initial" }));
                baselineRevisionWordCount = countWords(text);
                completedPasses = 1;
                cacheAiPreparationSnapshot(phaseId, text, completedPasses, baselineRevisionWordCount);
            }

            baselineRevisionWordCount = Math.max(0, baselineRevisionWordCount || countWords(text));

            if (completedPasses >= totalPasses && text) {
                if (runId !== state.matchRunId) return "";
                state.aiPreparedTurns[phaseId] = { text, preparedAt: new Date().toISOString(), passCount: totalPasses };
                clearAiPreparationSnapshot(phaseId);
                delete state.aiPreparationErrors[phaseId];
                primeWholeSpeechAudioForPhase(phase, text);
                maybeCompletePreparedAiConferral();
                return text;
            }

            for (let revisionNumber = Math.max(1, completedPasses); revisionNumber <= revisionPasses; revisionNumber += 1) {
                const revisedText = sanitizeText(await callAI({
                    model: getParticipantModel(phase.speaker),
                                                                  systemPrompt: buildAiDebaterSystemPrompt(phase.speaker),
                                                                  userPrompt: buildAiTurnRevisionPrompt(phase, text, revisionNumber, revisionPasses, baselineRevisionWordCount),
                                                                  maxTokens
                }));
                if (!revisedText) throw new Error(l("The model returned no text.", "Le modèle n’a renvoyé aucun texte."));
                text = revisedText;
                if (phase.kind === "judgeAnswer") {
                    text = sanitizeText(await enforceDirectJudgeAnswer(phase, text));
                    if (!text) throw new Error(l("The model returned no text.", "Le modèle n’a renvoyé aucun texte."));
                }
                text = sanitizeText(await enforcePhaseWordCount(phase, text, { mode: "revision", baselineWordCount: baselineRevisionWordCount }));
                completedPasses = revisionNumber + 1;
                cacheAiPreparationSnapshot(phaseId, text, completedPasses, baselineRevisionWordCount);
            }
            if (runId !== state.matchRunId) return "";
            state.aiPreparedTurns[phaseId] = { text, preparedAt: new Date().toISOString(), passCount: totalPasses };
            clearAiPreparationSnapshot(phaseId);
            delete state.aiPreparationErrors[phaseId];
            primeWholeSpeechAudioForPhase(phase, text);
            maybeCompletePreparedAiConferral();
            return text;
        } catch (error) {
            if (runId === state.matchRunId) state.aiPreparationErrors[phaseId] = error?.message || l("Failed to prepare AI turn.", "La préparation du tour IA a échoué.");
            throw error;
        } finally {
            if (state.aiPreparationPromises[phaseId] === trackedPromise) delete state.aiPreparationPromises[phaseId];
        }
    })();
    state.aiPreparationPromises[phaseId] = trackedPromise;
    return trackedPromise;
}

function primeAiPreparationForPhase(phase) {
    const targetPhase = getLinkedAiPreparationTarget(phase);
    if (!targetPhase) return;
    void maybePrepareAiTurnForPhase(targetPhase, { revisionPasses: 1 }).catch((error) => {
        console.error("AI preparation failed:", error);
    });
}

function getAiJudgeQuestionPreparationTarget(phase) {
    if (!phase || state.judgeMode !== "ai") return null;
    const nextPhase = state.phases[state.currentPhaseIndex + 1] || null;
    if (!nextPhase) return null;
    if (nextPhase.kind === "judgeQuestion") return nextPhase;
    return null;
}

function getAiJudgeQuestionPreparationKey(caseNum, judgeNumber) {
    return `case${Number(caseNum) || 0}-judge${Number(judgeNumber) || 0}`;
}

async function maybePrepareAiJudgeQuestion(caseNum, judgeNumber) {
    if (state.judgeMode !== "ai") return "";
    const cached = getCachedAiJudgeQuestion(caseNum, judgeNumber);
    if (cached) return cached;
    const prepKey = getAiJudgeQuestionPreparationKey(caseNum, judgeNumber);
    if (state.aiJudgeQuestionPreparationPromises[prepKey]) return state.aiJudgeQuestionPreparationPromises[prepKey];
    const runId = state.matchRunId;
    let trackedPromise = null;
    trackedPromise = (async () => {
        try {
            const question = await ensureAiJudgeQuestion(caseNum, judgeNumber, runId);
            if (runId !== state.matchRunId) return "";
            delete state.aiJudgeQuestionPreparationErrors[prepKey];
            return question;
        } catch (error) {
            if (runId === state.matchRunId) {
                state.aiJudgeQuestionPreparationErrors[prepKey] = error?.message || l("Failed to prepare AI judge question.", "La préparation de la question du juge IA a échoué.");
            }
            throw error;
        } finally {
            if (state.aiJudgeQuestionPreparationPromises[prepKey] === trackedPromise) delete state.aiJudgeQuestionPreparationPromises[prepKey];
        }
    })();
    state.aiJudgeQuestionPreparationPromises[prepKey] = trackedPromise;
    return trackedPromise;
}

function primeAiJudgeQuestionPreparationForPhase(phase) {
    if (!phase || state.judgeMode !== "ai") return;
    const targetPhase = getAiJudgeQuestionPreparationTarget(phase);
    if (!targetPhase) return;
    void maybeDraftAiJudgeQuestion(targetPhase.caseNum, targetPhase.judgeNumber).catch((error) => {
        console.error("AI judge-question draft preparation failed:", error);
    });
}

function primeNextFinalJudgeQuestionAndAnswerAfterTurn(phase) {
    if (!phase || state.judgeMode !== "ai") return null;
    const questionTarget = getAiJudgeQuestionPreparationTarget(phase);
    if (!questionTarget) return null;
    const runId = state.matchRunId;

    // The completed turn is already in the transcript when this runs. Finalize
    // the next question against that text, lock it, and only then prepare its
    // answer and exact whole-answer playback rate.
    void maybePrepareAiJudgeQuestion(questionTarget.caseNum, questionTarget.judgeNumber)
    .then((question) => {
        const finalQuestion = sanitizeText(question);
        if (!finalQuestion || runId !== state.matchRunId || state.completed) return;
        storeJudgeQuestionForPhase(questionTarget, finalQuestion);
        primeAiJudgeAnswerForFinalQuestion(questionTarget);
    })
    .catch((error) => {
        console.error("Early final judge-question and answer preparation failed:", error);
    });
    return questionTarget;
}

function primeCurrentAiJudgeQuestionRevision(phase) {
    if (!phase || state.judgeMode !== "ai" || phase.kind !== "judgeQuestion") return;
    const phaseId = phase.id;
    const runId = state.matchRunId;
    void maybePrepareAiJudgeQuestion(phase.caseNum, phase.judgeNumber)
    .then((question) => {
        const current = getCurrentPhase();
        const finalQuestion = sanitizeText(question);
        if (!finalQuestion || runId !== state.matchRunId || !current || current.id !== phaseId || state.completed) return;
        storeJudgeQuestionForPhase(phase, finalQuestion);
        primeAiJudgeAnswerForFinalQuestion(phase);
    })
    .catch((error) => {
        console.error("AI judge-question revision failed:", error);
    });
}

function renderPhaseList() {
    phaseListEl.innerHTML = "";
    if (!state.phases.length) {
        const item = document.createElement("li");
        item.className = "phase-item";
        item.textContent = l("No phases yet.", "Aucune phase pour le moment.");
        phaseListEl.appendChild(item);
        return;
    }
    state.phases.forEach((phase, index) => {
        const item = document.createElement("li");
        item.className = "phase-item";
        if (index < state.currentPhaseIndex) item.classList.add("done");
        if (index === state.currentPhaseIndex) item.classList.add("current");

        const title = document.createElement("div");
        title.className = "phase-title";
        title.textContent = phase.title;

        const meta = document.createElement("div");
        meta.className = "phase-meta";
        const parts = [];
        if (phase.caseNum) parts.push(caseLabel(phase.caseNum));
        if (phase.kind === "speech") parts.push(`${phaseSubtypeLabel(phase.subtype)} • ${speakerName(phase.speaker)}`);
        if (phase.kind === "confer") parts.push(`${l("Confer", "Caucus")} • ${speakerName(phase.speaker)}`);
        if (phase.kind === "judgeQuestion") parts.push(isFrenchLocale() ? `${judgeLabel(phase.judgeNumber)} pose` : `${judgeLabel(phase.judgeNumber)} asks`);
        if (phase.kind === "judgeAnswer") parts.push(isFrenchLocale() ? `Réponse au ${judgeLabel(phase.judgeNumber)} • ${speakerName(phase.speaker)}` : `${judgeLabel(phase.judgeNumber)} answer • ${speakerName(phase.speaker)}`);
        if (phase.duration) parts.push(formatClock(phase.duration));
        meta.textContent = parts.join(" • ");
        item.appendChild(title);
        item.appendChild(meta);
        phaseListEl.appendChild(item);
    });
    queueMicrotask(() => {
        const currentItem = phaseListEl.querySelector(".phase-item.current");
        if (currentItem && typeof currentItem.scrollIntoView === "function") {
            currentItem.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
        }
    });
}

function updatePhaseHeader() {
    const phase = getCurrentPhase();
    if (state.coinTossAnimating) {
        currentPhaseTitleEl.textContent = l("Coin Toss", "Tirage");
        currentPhaseMetaEl.textContent = l("Determining who controls Case #1.", "Détermination du contrôle du cas 1.");
        return;
    }
    if (state.waitingForCoinChoice) {
        currentPhaseTitleEl.textContent = l("Coin Toss Choice", "Choix après le tirage");
        currentPhaseMetaEl.textContent = l("Participant 1 must choose whether to lead or pass on Case #1.", "Le participant 1 doit choisir s’il mène ou passe au cas 1.");
        return;
    }
    if (!state.started && !state.completed) {
        currentPhaseTitleEl.textContent = l("Setup", "Configuration");
        currentPhaseMetaEl.textContent = l("Enter two cases and start the match.", "Saisissez deux cas et démarrez le match.");
        return;
    }
    if (state.completed) {
        currentPhaseTitleEl.textContent = l("Match Complete", "Match terminé");
        currentPhaseMetaEl.textContent = l("The closing phase has ended.", "La phase de clôture est terminée.");
        return;
    }
    if (!phase) {
        currentPhaseTitleEl.textContent = l("Waiting", "En attente");
        currentPhaseMetaEl.textContent = l("No active phase.", "Aucune phase active.");
        return;
    }
    currentPhaseTitleEl.textContent = phase.title;
    const details = [];
    if (phase.caseNum) details.push(`${caseLabel(phase.caseNum)}: ${state.cases[phase.caseNum].title}`);
    if (phase.kind === "speech") details.push(`${l("Speaker", "Oratrice")} : ${speakerName(phase.speaker)}`);
    if (phase.kind === "confer") details.push(`${l("Conferring side", "Côté en caucus")} : ${speakerName(phase.speaker)}`);
    if (phase.kind === "judgeQuestion") details.push(isFrenchLocale() ? `${judgeLabel(phase.judgeNumber)} questionne ${speakerName(phase.answerer)}` : `${judgeLabel(phase.judgeNumber)} questioning ${speakerName(phase.answerer)}`);
    if (phase.kind === "judgeAnswer") details.push(`${l("Answerer", "Répondante")} : ${speakerName(phase.speaker)}`);
    if (phase.duration) details.push(`${l("Time", "Temps")} : ${formatClock(phase.duration)}`);
    if (!state.phaseReady) details.push(l("Waiting for moderator", "En attente du modérateur"));
    currentPhaseMetaEl.textContent = details.join(" • ");
}

function stopTimer() {
    if (state.timer.intervalId) {
        clearInterval(state.timer.intervalId);
        state.timer.intervalId = null;
    }
    state.timer.running = false;
}

function prepareTimerForPhaseAnnouncement(phase) {
    stopTimer();
    state.timer.warnedKeys = new Set();
    state.timer.phaseId = phase?.id || "";
    state.timer.remaining = phase?.duration || 0;
    timerHintEl.classList.remove("error");
    if (!phase) {
        timerDisplayEl.textContent = "--:--";
        timerHintEl.textContent = l("No active timed phase.", "Aucune phase minutée active.");
        return;
    }
    if (phase.duration) {
        timerDisplayEl.textContent = formatClock(phase.duration);
        timerHintEl.textContent = l("Timer will start when the moderator finishes speaking.", "La minuterie commencera quand le modérateur aura fini de parler.");
        return;
    }
    timerDisplayEl.textContent = "--:--";
    if (phase.kind === "moderatorCase" || phase.kind === "scoring") {
        timerHintEl.textContent = l("Advancing automatically when the moderator finishes speaking.", "Passage automatique quand le modérateur a fini de parler.");
        return;
    }
    if (phase.kind === "closing") {
        timerHintEl.textContent = state.judgeMode === "ai"
        ? l("Generating the final decision after the moderator finishes speaking.", "Génération de la décision finale après la fin du modérateur.")
        : l("Enter the final human-judge scores after the moderator finishes speaking.", "Entrez les notes finales des juges humains après la fin du modérateur.");
        return;
    }
    timerHintEl.textContent = l("Waiting for the moderator to finish speaking.", "En attente de la fin du modérateur.");
}

function phaseTimerStartsWithAutoSpeech(phase) {
    return PHASE_TIMER_POLICY.startsWithAutoSpeech(phase, {
        speakerIsAiControlled: isAiControlledRole(phase?.speaker),
        judgeMode: state.judgeMode
    });
}

function phasePreloadsAutoSpeechDuringModerator(phase) {
    return PHASE_TIMER_POLICY.preloadsDuringModerator(phase, {
        speakerIsAiControlled: isAiControlledRole(phase?.speaker)
    });
}

function phaseUsesNaturalModeratorHandoff(phase) {
    return PHASE_TIMER_POLICY.usesNaturalModeratorHandoff(phase, {
        speakerIsAiControlled: isAiControlledRole(phase?.speaker)
    });
}

function prepareTimerForAutoSpeech(phase) {
    prepareTimerForPhaseAnnouncement(phase);
    if (!phase?.duration) return;
    timerHintEl.textContent = l(
        "Preparing speech audio. The timer will start when speaking begins.",
        "Préparation de l’audio. La minuterie démarrera au début de la prise de parole."
    );
}

function warningThresholdsForPhase(phase) {
    if (!phase) return [];
    if (phase.kind === "speech" && phase.subtype === "presentation") return [120, 60, 30];
    if (phase.kind === "speech" && (phase.subtype === "commentary" || phase.subtype === "response")) return [60, 30];
    if (phase.kind === "confer") return [60, 30];
    if (phase.kind === "judgeQuestion") return [15];
    if (phase.kind === "judgeAnswer") return [30];
    return [];
}

function timerWarningLabel(phase, remaining) {
    if (!phase) return "";
    if (phase.kind === "speech" || phase.kind === "confer") {
        return isFrenchLocale()
        ? `${phase.title} : ${formatClock(remaining)} restantes.`
        : `${phase.title}: ${formatClock(remaining)} remaining.`;
    }
    if (phase.kind === "judgeQuestion") {
        return isFrenchLocale()
        ? `${judgeLabel(phase.judgeNumber)} : ${formatClock(remaining)} restantes pour la question.`
        : `${judgeLabel(phase.judgeNumber)}: ${formatClock(remaining)} remaining for the question.`;
    }
    if (phase.kind === "judgeAnswer") {
        return isFrenchLocale()
        ? `${speakerName(phase.speaker)} : ${formatClock(remaining)} restantes pour répondre au ${judgeLabel(phase.judgeNumber)}.`
        : `${speakerName(phase.speaker)}: ${formatClock(remaining)} remaining to answer ${judgeLabel(phase.judgeNumber)}.`;
    }
    return isFrenchLocale()
    ? `${phase.title} : ${formatClock(remaining)} restantes.`
    : `${phase.title}: ${formatClock(remaining)} remaining.`;
}

function schedulePhaseAdvance(phaseId, delayMs = 120) {
    window.setTimeout(() => {
        const current = getCurrentPhase();
        if (!current || current.id !== phaseId || state.completed) return;
        advancePhase();
    }, delayMs);
}

function scheduleNextActionForPhase(phaseId, delayMs = 120) {
    if (!phaseId || state.pendingAutoActionPhaseId === phaseId) return;
    state.pendingAutoActionPhaseId = phaseId;
    window.setTimeout(() => {
        if (state.pendingAutoActionPhaseId !== phaseId) return;
        state.pendingAutoActionPhaseId = "";
        const current = getCurrentPhase();
        if (!current || current.id !== phaseId || state.completed) return;
        if (state.busy || state.isRecording || state.voiceFinalizePending) return;
        if (!state.phaseReady) return;
        void handleNextAction();
    }, delayMs);
}

function maybeCompletePreparedAiConferral(phase = getCurrentPhase()) {
    const currentPhase = phase || getCurrentPhase();
    if (!currentPhase || !state.phaseReady || state.completed) return false;
    if (state.busy || state.isRecording || state.voiceFinalizePending) return false;
    if (isCurrentPhaseAwaitingPlayback(currentPhase)) return false;
    if (state.autoGenerationBlockedPhaseId === currentPhase.id) return false;
    if (currentPhase.kind !== "confer" || !isAiControlledRole(currentPhase.speaker)) return false;
    const targetPhase = getLinkedAiPreparationTarget(currentPhase);
    if (!targetPhase || !getPreparedAiTurnText(targetPhase.id)) return false;
    if (state.pendingAutoActionPhaseId === currentPhase.id) state.pendingAutoActionPhaseId = "";
    void handleAiConferPhase(currentPhase);
    return true;
}

function maybeAutoTriggerCurrentPhase() {
    const phase = getCurrentPhase();
    if (!phase || !state.phaseReady || state.completed) return;
    if (state.busy || state.isRecording || state.voiceFinalizePending) return;
    if (isCurrentPhaseAwaitingPlayback(phase)) return;
    if (state.autoGenerationBlockedPhaseId === phase.id) return;
    if (maybeCompletePreparedAiConferral(phase)) return;
    if (phase.kind === "closing" && state.judgeMode === "ai") {
        scheduleNextActionForPhase(phase.id);
        return;
    }
    if (shouldAutoGenerate(phase)) scheduleNextActionForPhase(phase.id);
}

function advanceAfterTimedPhaseExpiration(expiredPhase) {
    const current = getCurrentPhase();
    if (!current || current.id !== expiredPhase?.id || state.completed) return;
    const askedQuestion = sanitizeText(state.askedJudgeQuestions[expiredPhase.id] || "");
    if (expiredPhase.kind === "judgeQuestion" && !askedQuestion) {
        const skipToIndex = state.currentPhaseIndex + 2;
        if (skipToIndex < state.phases.length) {
            state.currentPhaseIndex = skipToIndex;
            enterCurrentPhase();
            return;
        }
    }
    advancePhase();
}

function appendHumanTurnMessage(phase, text) {
    const cleanText = sanitizeText(text);
    if (!phase || !cleanText) return false;
    appendParticipantMessage("human", cleanText, { caseNum: phase.caseNum || 0, phaseId: phase.id });
    primeNextFinalJudgeQuestionAndAnswerAfterTurn(phase);
    primeAiFinalScoringAfterFinalTurn(phase);
    messageInputEl.value = "";
    return true;
}

function appendHumanJudgeQuestionMessage(phase, text) {
    const cleanText = sanitizeText(text);
    const judge = getActiveHumanJudgeEntry(phase);
    if (!phase || !judge || !cleanText) return false;
    const name = sanitizeText(judge.name.value) || judgeLabel(judge.number);
    judge.question.value = cleanText;
    storeJudgeQuestionForPhase(phase, cleanText);
    primeAiJudgeAnswerForFinalQuestion(phase);
    appendMessage("judge", name, cleanText, {
        caseNum: phase.caseNum,
            phaseId: phase.id,
            judgeNumber: judge.number,
            silent: true
    });
    judge.question.value = "";
    messageInputEl.value = "";
    clearMainComposerJudgeBinding();
    saveSetup();
    return true;
}

function commitMainComposerSubmission(phase, text) {
    if (!phase) return false;
    if (isHumanJudgeQuestionPhase(phase)) return appendHumanJudgeQuestionMessage(phase, text);
    return appendHumanTurnMessage(phase, text);
}

function getComposerDraftTextForPhase(phase) {
    if (!phase) return "";
    if (isHumanJudgeQuestionPhase(phase)) {
        const judge = getActiveHumanJudgeEntry(phase);
        return sanitizeText(messageInputEl.value || judge?.question?.value || "");
    }
    return sanitizeText(messageInputEl.value);
}

function getEmptyComposerErrorMessage(phase) {
    if (isHumanJudgeQuestionPhase(phase)) {
        return isFrenchLocale()
        ? `Entrez la question de ${getActiveHumanJudgeName(phase)} avant de la soumettre.`
        : `Enter ${getActiveHumanJudgeName(phase)}'s question before submitting.`;
    }
    return l("Type a response before submitting.", "Tapez une réponse avant de soumettre.");
}

function getStopRecordingAndSubmitStatusText(phase) {
    if (isHumanJudgeQuestionPhase(phase)) {
        return isFrenchLocale()
        ? `Arrêt de l’enregistrement et envoi de la question de ${getActiveHumanJudgeName(phase)}...`
        : `Stopping recording and asking ${getActiveHumanJudgeName(phase)}'s question...`;
    }
    return l("Stopping recording and submitting...", "Arrêt de l’enregistrement et envoi...");
}

function concludeTimedOutHumanPhase(expiredPhase) {
    if (!expiredPhase || state.completed) return;
    primeAiFinalScoringAfterFinalTurn(expiredPhase);
    appendMessage("moderator", moderatorLabel(), l("Time.", "Temps."), {
        caseNum: expiredPhase.caseNum || 0,
            phaseId: expiredPhase.id || "",
            onPlaybackComplete: () => {
                const current = getCurrentPhase();
                if (!current || current.id !== expiredPhase.id || state.completed) return;
                advanceAfterTimedPhaseExpiration(expiredPhase);
            }
    });
}

function clearPendingVoiceSubmission() {
    state.pendingVoiceSubmission = null;
}

function setPendingVoiceSubmission(reason, phaseId) {
    state.pendingVoiceSubmission = reason && phaseId ? { reason, phaseId } : null;
}

function getPendingVoiceSubmissionReason() {
    return state.pendingVoiceSubmission?.reason || "";
}

function resolvePendingVoiceSubmission() {
    const pending = state.pendingVoiceSubmission;
    if (!pending) return false;
    const current = getCurrentPhase();
    clearPendingVoiceSubmission();
    if (!current || current.id !== pending.phaseId || state.completed) return false;
    const currentText = getComposerDraftTextForPhase(current);
    const didCommit = commitMainComposerSubmission(current, currentText);

    if (pending.reason === "timeout") {
        if (isHumanJudgeQuestionPhase(current)) {
            if (!didCommit) {
                messageInputEl.value = "";
                clearMainComposerJudgeBinding();
            }
            setStatus(
                didCommit
                ? l("Time is up. Submitted the judge question.", "Le temps est écoulé. La question du juge a été soumise.")
                : l("Time is up for the judge question.", "Le temps est écoulé pour la question du juge.")
            );
        } else {
            setStatus(didCommit ? l("Time is up. Submitted the current turn.", "Le temps est écoulé. Le tour a été soumis.") : l("Time is up for the current phase.", "Le temps est écoulé pour la phase actuelle."));
        }
        concludeTimedOutHumanPhase(current);
        return true;
    }

    if (!didCommit) {
        setStatus(getEmptyComposerErrorMessage(current), true);
        return false;
    }

    if (isHumanJudgeQuestionPhase(current)) setStatus(l("Judge question submitted.", "Question du juge soumise."));
    else setStatus(`${speakerName("human")} ${l("submitted the current turn.", "a soumis le tour actuel.")}`);
    advancePhase();
    return true;
}

function handleTimedPhaseExpiration(expiredPhase) {
    if (!expiredPhase) return;
    stopTimer();
    state.phaseReady = false;
    clearPhaseAwaitingPlayback(expiredPhase.id);
    const wasHumanComposerPhase = isHumanMainComposerPhase(expiredPhase);
    timerHintEl.textContent = l("Time is up. Advancing when the moderator finishes speaking.", "Le temps est écoulé. Passage après la fin du modérateur.");
    refreshControls();
    if (wasHumanComposerPhase) {
        setPendingVoiceSubmission("timeout", expiredPhase.id);
        if (state.isRecording) {
            setStatus(l("Time is up. Finalizing the recorded text and submitting it.", "Le temps est écoulé. Finalisation du texte enregistré et soumission."));
            if (!stopRecordingAndFinalize(l("Time is up. Finalizing the recorded text and submitting it.", "Le temps est écoulé. Finalisation du texte enregistré et soumission."))) {
                resolvePendingVoiceSubmission();
            }
            return;
        }
        if (state.voiceFinalizePending) {
            setStatus(l("Time is up. Finalizing the recorded text and submitting it.", "Le temps est écoulé. Finalisation du texte enregistré et soumission."));
            return;
        }
        resolvePendingVoiceSubmission();
        return;
    }
    cutOffCurrentPhaseReadAloudIfNeeded(expiredPhase);
    appendMessage("moderator", moderatorLabel(), l("Time.", "Temps."), {
        caseNum: expiredPhase.caseNum || 0,
            phaseId: expiredPhase.id || "",
            onPlaybackComplete: () => {
                const current = getCurrentPhase();
                if (!current || current.id !== expiredPhase.id || state.completed) return;
                advanceAfterTimedPhaseExpiration(expiredPhase);
            }
    });
    setStatus(l("Time is up for the current phase.", "Le temps est écoulé pour la phase actuelle."));
}

function setTimerForPhase(phase) {
    stopTimer();
    state.timer.warnedKeys = new Set();
    state.timer.phaseId = phase?.id || "";
    state.timer.remaining = phase?.duration || 0;
    timerDisplayEl.textContent = phase?.duration ? formatClock(phase.duration) : "--:--";
    timerHintEl.textContent = phase?.duration ? l("Timer auto-started for this phase.", "La minuterie a démarré automatiquement pour cette phase.") : l("No active timed phase.", "Aucune phase minutée active.");
    timerHintEl.classList.remove("error");
    if (!phase?.duration) return;
    state.timer.running = true;
    state.timer.intervalId = window.setInterval(() => {
        if (!state.timer.running) return;
        const currentPhase = getCurrentPhase();
        if (maybeCompletePreparedAiConferral(currentPhase)) return;
        state.timer.remaining -= 1;
        if (state.timer.remaining < 0) state.timer.remaining = 0;
        timerDisplayEl.textContent = formatClock(state.timer.remaining);
        const thresholds = warningThresholdsForPhase(currentPhase);
        thresholds.forEach((threshold) => {
            const key = `${currentPhase?.id || ""}:${threshold}`;
            if (state.timer.remaining === threshold && !state.timer.warnedKeys.has(key)) {
                state.timer.warnedKeys.add(key);
                setStatus(timerWarningLabel(currentPhase, threshold));
            }
        });
        if (state.timer.remaining <= 0) {
            const key = `${currentPhase?.id || ""}:timeup`;
            if (!state.timer.warnedKeys.has(key)) {
                state.timer.warnedKeys.add(key);
                handleTimedPhaseExpiration(currentPhase);
            }
        }
    }, 1000);
}

function startTimerWithAutoSpeech(phaseId, remainingReadyChecks = 3) {
    const phase = getCurrentPhase();
    if (!phase || phase.id !== phaseId || state.completed) return;
    if (!state.phaseReady) {
        if (remainingReadyChecks > 0) {
            window.setTimeout(() => startTimerWithAutoSpeech(phaseId, remainingReadyChecks - 1), 0);
        }
        return;
    }
    if (!phaseTimerStartsWithAutoSpeech(phase) || state.timer.intervalId) return;
    setTimerForPhase(phase);
    timerHintEl.textContent = l(
        "Timer started. Speech begins now.",
        "La minuterie a démarré. La prise de parole commence maintenant."
    );
    refreshControls();
}

function pauseTimer() {
    if (!state.timer.intervalId || !state.timer.running) return;
    state.timer.running = false;
    timerHintEl.textContent = l("Timer paused.", "Minuterie en pause.");
    refreshControls();
}

function resumeTimer() {
    if (!state.timer.intervalId || state.timer.remaining <= 0) return;
    state.timer.running = true;
    timerHintEl.textContent = l("Timer resumed.", "Minuterie reprise.");
    refreshControls();
}

function resetPhaseTimer() {
    const phase = getCurrentPhase();
    if (!phase?.duration) {
        setStatus(l("There is no active timed phase to reset.", "Il n’y a aucune phase minutée active à réinitialiser."), true);
        return;
    }
    if (!state.phaseReady) {
        prepareTimerForPhaseAnnouncement(phase);
        setStatus(isFrenchLocale() ? `Minuterie réinitialisée pour ${phase.title}. Elle commencera quand le modérateur aura fini de parler.` : `Timer reset for ${phase.title}. It will start when the moderator finishes speaking.`);
        refreshControls();
        return;
    }
    if (phaseTimerStartsWithAutoSpeech(phase) && !state.timer.intervalId) {
        prepareTimerForAutoSpeech(phase);
        setStatus(isFrenchLocale() ? `Minuterie réinitialisée pour ${phase.title}. Elle démarrera au début de la prise de parole.` : `Timer reset for ${phase.title}. It will start when speech begins.`);
        refreshControls();
        return;
    }
    setTimerForPhase(phase);
    setStatus(isFrenchLocale() ? `Minuterie réinitialisée pour ${phase.title}.` : `Timer reset for ${phase.title}.`);
    refreshControls();
}

function clearScoreboard() {
    scoreSummaryEl.textContent = l("No scores yet.", "Aucun pointage pour le moment.");
    scoreCardsEl.innerHTML = "";
}

function updateMatchSummaryPlaceholder() {
    if (!state.started) {
        clearScoreboard();
        renderMatchSetupSummary();
        return;
    }
    scoreSummaryEl.textContent = isFrenchLocale()
    ? `${caseLabel(1)} mené par : ${speakerName(state.leadByCase[1])}. ${caseLabel(2)} mené par : ${speakerName(state.leadByCase[2])}. Mode des juges : ${state.judgeMode === "ai" ? "juges IA" : "juges humains"}.`
    : `Case #1 leader: ${speakerName(state.leadByCase[1])}. Case #2 leader: ${speakerName(state.leadByCase[2])}. Judge mode: ${state.judgeMode === "ai" ? "AI judges" : "Human judges"}.`;
    renderMatchSetupSummary();
}

function renderScorecards(cards, tally, sourceMode = "ai") {
    scoreCardsEl.innerHTML = "";
    cards.forEach((card, index) => {
        const judgeTally = tally.judges[index];
        const article = document.createElement("article");
        article.className = "score-card";
        const head = document.createElement("div");
        head.className = "score-card-head";
        const name = document.createElement("div");
        name.className = "phase-title";
        name.textContent = card.name || l("Judge", "Juge");
        const pill = document.createElement("span");
        pill.className = "score-pill";
        if (judgeTally.result === "human") pill.textContent = isFrenchLocale() ? `Vote pour ${speakerName("human")}` : `${speakerName("human")} vote`;
        else if (judgeTally.result === "ai") pill.textContent = isFrenchLocale() ? `Vote pour ${speakerName("ai")}` : `${speakerName("ai")} vote`;
        else pill.textContent = l("Tie vote", "Vote nul");
        head.appendChild(name);
        head.appendChild(pill);
        const scores = document.createElement("div");
        scores.className = "score-note";
        scores.textContent = isFrenchLocale()
        ? `Pointage du juge — ${speakerName("human")} : ${judgeTally.humanScore}/60 • ${speakerName("ai")} : ${judgeTally.aiScore}/60`
        : `Judge tally — ${speakerName("human")}: ${judgeTally.humanScore}/60 • ${speakerName("ai")}: ${judgeTally.aiScore}/60`;
        article.appendChild(head);
        article.appendChild(scores);

        if (card.comment) {
            const judgeNote = document.createElement("div");
            judgeNote.className = "score-note judge-score-comment";
            judgeNote.textContent = isFrenchLocale()
            ? `Commentaire du juge : ${card.comment}`
            : `Judge comment: ${card.comment}`;
            article.appendChild(judgeNote);
        }

        if (card.humanBreakdown) {
            const humanBreakdownNote = document.createElement("div");
            humanBreakdownNote.className = "score-note";
            humanBreakdownNote.textContent = isFrenchLocale()
            ? `${speakerName("human")} — détail : ${formatOfficialParticipantBreakdown(card.humanBreakdown)}`
            : `${speakerName("human")} breakdown: ${formatOfficialParticipantBreakdown(card.humanBreakdown)}`;
            article.appendChild(humanBreakdownNote);
            appendThresholdAuditDetails(article, speakerName("human"), card.humanBreakdown);
        }
        if (card.aiBreakdown) {
            const aiBreakdownNote = document.createElement("div");
            aiBreakdownNote.className = "score-note";
            aiBreakdownNote.textContent = isFrenchLocale()
            ? `${speakerName("ai")} — détail : ${formatOfficialParticipantBreakdown(card.aiBreakdown)}`
            : `${speakerName("ai")} breakdown: ${formatOfficialParticipantBreakdown(card.aiBreakdown)}`;
            article.appendChild(aiBreakdownNote);
            appendThresholdAuditDetails(article, speakerName("ai"), card.aiBreakdown);
        }
        if (sourceMode === "ai") {
            if (card.humanComment) {
                const humanNote = document.createElement("div");
                humanNote.className = "score-note";
                humanNote.textContent = `${speakerName("human")}: ${card.humanComment}`;
                article.appendChild(humanNote);
            }
            if (card.aiComment) {
                const aiNote = document.createElement("div");
                aiNote.className = "score-note";
                aiNote.textContent = `${speakerName("ai")}: ${card.aiComment}`;
                article.appendChild(aiNote);
            }
        }
        scoreCardsEl.appendChild(article);
    });

    const resultText = tally.result === "tie"
    ? l("Match result: tie.", "Résultat du match : égalité.")
    : isFrenchLocale()
    ? `Gagnante : ${speakerName(tally.result)}.`
    : `Winner: ${speakerName(tally.result)}.`;

    scoreSummaryEl.textContent = isFrenchLocale()
    ? `${speakerName("human")} : ${tally.humanVotes} votes • ${speakerName("ai")} : ${tally.aiVotes} votes • ${resultText}`
    : `${speakerName("human")}: ${tally.humanVotes} votes • ${speakerName("ai")}: ${tally.aiVotes} votes • ${resultText}`;
}

function computeVoteTally(cards) {
    return SCORECARD_TALLY.computeVoteTally(cards);
}

function getAiBridge() {
    const bridge = window.ethicsApi?.ai;
    if (!bridge || typeof bridge.generate !== "function") {
        throw new Error(l("The desktop AI bridge is unavailable.", "Le pont IA de l’application de bureau n’est pas disponible."));
    }
    return bridge;
}

async function requireProviderCredential(provider, purpose = "") {
    await refreshCredentialStatus();
    if (hasCredential(provider)) return;
    openApiKeyDialog(provider);
    const providerName = providerLabel(provider);
    throw new Error(purpose
        ? l(`A ${providerName} API key is required for ${purpose}.`, `Une clé API ${providerName} est requise pour ${purpose}.`)
        : l(`A ${providerName} API key is required.`, `Une clé API ${providerName} est requise.`));
}

async function callAI({
    model = DEFAULT_JUDGE_MODEL,
    systemPrompt,
    userPrompt,
    maxTokens = 800,
    requestTimeoutMs = null,
    reasoningEffort = STUDENT_REASONING_EFFORT,
    jsonSchema = null
}) {
    const resolvedModel = String(model || DEFAULT_JUDGE_MODEL).trim();
    const provider = getModelProvider(resolvedModel);
    if (!provider) throw new Error(l("The selected debate model is not supported.", "Le modèle de débat sélectionné n’est pas pris en charge."));
    await requireProviderCredential(provider, formatModelLabel(resolvedModel, { includeProvider: false }));
    const result = await getAiBridge().generate({
        model: resolvedModel,
        systemPrompt: [HARDCODED_ETHICS_BOWL_RULES, localeDirectiveForModels(), systemPrompt].filter(Boolean).join("\n\n"),
        userPrompt: String(userPrompt || ""),
        maxTokens,
        requestTimeoutMs,
        reasoningEffort,
        jsonSchema
    });
    if (result && typeof result === "object") return result;
    const text = String(result || "").trim();
    if (!text) throw new Error(l("The model returned no text.", "Le modèle n’a renvoyé aucun texte."));
    return text;
}

function stripJsonFence(raw) {
    let text = String(raw || "").trim();
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    return text;
}

function extractJsonObject(raw) {
    const text = stripJsonFence(raw);
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first < 0 || last < 0 || last <= first) throw new Error(l("No JSON object found.", "Aucun objet JSON trouvé."));
    return JSON.parse(text.slice(first, last + 1));
}

function transcriptAsPlainText(caseNum = null) {
    return state.transcript
    .filter((message) => (caseNum == null ? true : message.caseNum === caseNum))
    .filter((message) => message?.substantive !== false)
    .map((message) => `[${message.label}] ${message.text}`)
    .join("\n\n");
}

function getPhaseById(phaseId) {
    return phaseId ? (state.phases.find((phase) => phase.id === phaseId) || null) : null;
}

function isSubstantiveTranscriptMessage(message) {
    return !!message && message.substantive !== false && ["human", "ai", "ai-alt", "judge"].includes(message.kind);
}

function getTranscriptSectionLabel(message) {
    const phase = getPhaseById(message.phaseId);
    if (phase?.kind === "speech") return phaseSubtypeLabel(phase.subtype);
    if (phase?.kind === "judgeQuestion") return isFrenchLocale() ? `Question du ${judgeLabel(phase.judgeNumber)}` : `${judgeLabel(phase.judgeNumber)} Question`;
    if (phase?.kind === "judgeAnswer") return isFrenchLocale() ? `Réponse au ${judgeLabel(phase.judgeNumber)}` : `${judgeLabel(phase.judgeNumber)} Answer`;
    if (message.kind === "judge") return l("Judge Question", "Question du juge");
    return l("Turn", "Tour");
}

function substantiveTranscriptAsPlainText(caseNum = null) {
    return state.transcript
    .filter((message) => (caseNum == null ? true : message.caseNum === caseNum))
    .filter(isSubstantiveTranscriptMessage)
    .map((message) => {
        const header = [];
        if (message.caseNum) header.push(caseLabel(message.caseNum));
        header.push(getTranscriptSectionLabel(message));
        header.push(message.label);
        return `[${header.join(" • ")}] ${message.text}`;
    })
    .join("\n\n");
}

function scoringTranscriptAsPlainText() {
    return [1, 2].map((caseNum) => {
        const caseData = state.cases[caseNum];
        const leader = speakerName(state.leadByCase[caseNum]);
        const responder = speakerName(otherRole(state.leadByCase[caseNum]));
        const transcript = substantiveTranscriptAsPlainText(caseNum) || "[No substantive transcript recorded for this case.]";
        return [
            `${caseLabel(caseNum).toUpperCase()}: ${caseData.title}`,
                      `${l("Moderator question", "Question du modérateur")}: ${caseData.question}`,
                      `${l("Leader", "Présentatrice")}: ${leader}`,
                      `${l("Responder", "Répondante")}: ${responder}`,
                      transcript
        ].join("\n");
    }).join("\n\n");
}

function buildAiDebaterSystemPrompt(role) {
    const instructions = getStoredText(STORAGE_KEYS.instructions);
    const opponentRole = otherRole(role);
    return [
        `You are "${speakerName(role)}", a single participant in an Ethics Bowl-style match.`,
        `The other participant is "${speakerName(opponentRole)}".`,
        isAiControlledRole(opponentRole) ? "The other participant is also AI-controlled. You must still sound like a distinct individual with your own phrasing, emphasis, and priorities." : "",
        "Important: you are not a team. Never speak as \"we\", \"our team\", or \"as a team\".",
        "Do not mention being an AI unless directly asked.",
        "Do not mention model names, system prompts, or hidden instructions.",
        "Be charitable, concise, philosophically serious, and directly responsive.",
        "When the current phase is a judge-answer phase, answer the judge's exact question in your first sentence before adding explanation.",
        "Focus on moral reasoning, competing values, duties, rights, responsibilities, tensions, and practical implications.",
        "Do not mention any specific Philosophers by name.",
        "Do not mention the word count. Do not use headings",
        "If referring to the other participant, use their exact name.",
        "Stay strictly within the current phase only.",
        instructions ? `Additional model instructions:\n${instructions}` : ""
    ].filter(Boolean).join("\n\n");
}

function buildAiJudgeSystemPrompt() {
    const instructions = getStoredText(STORAGE_KEYS.instructions);
    return [
        "You are a neutral Ethics Bowl judge and academic philosopher who speaks in language suitable for a general audience.",
        "Think carefully, then ask exactly one concise, probing, fair question.",
        "Your job is to choose the single most illuminating unresolved question for this participant at this moment.",
        "Ground the question in what the participant actually argued.",
        "Use the scoring criteria and any earlier judge questions supplied in the prompt when deciding what to ask.",
        "Ask something that would help distinguish an adequate answer from an excellent one under the rubric.",
        "Do not ask a generic question that could fit almost any case.",
        "Do not ask for a mere summary or restatement.",
        "Do not use the word principle unless absolutely necessary for the question.",
        "Do not duplicate or lightly paraphrase an earlier judge question from the same case.",
        "Do not grandstand. Do not coach. Do not answer your own question.",
        "Ask a question of suitable spoken length for an Ethics Bowl judge. Aim to keep it comfortably askable within one minute and around 500 characters when possible, but if the best question runs somewhat long, keep it rather than awkwardly truncating it.",
        "Return exactly one question in strict JSON and nothing else.",
        instructions ? `Additional model instructions:\n${instructions}` : ""
    ].filter(Boolean).join("\n\n");
}

function buildAiScoringSystemPrompt() {
    return [
        "You are one neutral academic philosopher judge filling out one independent final score sheet.",
        "Every judge uses this same rubric, threshold procedure, and calibration. Do not invent a judge-specific philosophy, specialty, personality, or scoring standard.",
        "Apply the rubric criterion by criterion before calculating totals or comparing participants.",
        "Treat the lowest band as the default. Move upward one band at a time only when concrete transcript evidence fully establishes every requirement needed for the higher band and all preceding positive requirements.",
        "Stop at the first higher band whose requirements are not fully established. Ambiguous, implied, partial, or absent evidence does not satisfy a threshold.",
        "A score must fall within the highest band actually established. Do not give credit for qualities from a higher band when an earlier threshold is missing.",
        "Reaching a band earns its minimum score by default. Award points above that minimum only for separately demonstrated strength within the band; do not confuse satisfying a threshold with earning the top of its range.",
        "Within the highest bands, 4/5, 9/10, and 16/20 represent complete threshold satisfaction. A 5/5 or 10/10 requires exceptional completeness and consistency with no material weakness. For judges' questions, 17-18 is strong top-band work, 19 is rare and exceptional across every answer, and 20 requires an essentially flawless full questioning period.",
        "For respectful dialogue, 5/5 requires repeated, concrete improvements to the participant's position across the match; one acknowledgment or revision ordinarily earns no more than 4/5.",
        "Do not treat competent completion, fluent prose, confidence, length, or general sophistication as top-band performance. Top bands require affirmative evidence for every stated clause.",
        "For each criterion, report concrete evidence, the strongest limitation found, whether that limitation is material, and the specific unmet requirement for the next band. For a fully satisfied top band, explicitly state that no higher threshold exists.",
        "If hasMaterialLimitation is true in a top band, the highest defensible score is 4/5, 9/10, or 18/20 respectively. Mark it false only when close review finds no substantive weakness in that criterion.",
        "After totaling, re-audit any score of 55/60 or higher. Retain every point above a band's minimum only when its own concrete evidence establishes exceptional within-band quality; general praise such as strong, polished, thoughtful, or sophisticated is not enough.",
        "As a mathematical calibration check, 50/60 already means the participant reached the minimum of the highest band in all seven criteria. Scores of 55 or more therefore require exceptional performance across most criteria, and 58-60 must be reserved for a nearly flawless match. A card that identifies several substantive weaknesses is incompatible with such a total.",
        "Do not aim for a customary total, balance the participants' totals, or inflate both scores because the match was generally strong.",
        "Use the exact hardcoded score-sheet categories and numeric ranges supplied by the app.",
        "Treat the transcript provided by the app as the source of truth for what was said.",
        "Work independently. Do not simulate a panel and do not return multiple judges in one answer.",
        "Return only valid JSON.",
        "Use whole-number scores only.",
        "Score Participant 1 and Participant 2 separately and fairly.",
        "Give one overall comment explaining your own tally and vote, independently of the other judges.",
        "Do not reward or penalize either participant for being human-controlled or AI-controlled."
    ].filter(Boolean).join("\n\n");
}

function getJudgeQuestionPhaseId(caseNum, judgeNumber) {
    return `case${caseNum}-judge${judgeNumber}-question`;
}

function getJudgeAnswerPhaseId(caseNum, judgeNumber) {
    return `case${caseNum}-judge${judgeNumber}-answer`;
}

function buildJudgeQuestionScoringCriteriaContext() {
    return [
        "Relevant scoring criteria for the participant's led case:",
        "- Presentation criterion A (0-5): The participant presented a clear, identifiable position and supported it with identifiable reasons and the reasons were well articulated and jointly coherent.",
        "- Presentation criterion B (0-5): The participant identified the deep moral tension or tensions and applied moral concepts, such as duties, values, rights, or responsibilities, to relevant aspects of the case in a way that tackled the underlying moral tensions within the case.",
        "- Presentation criterion C (0-5): The participant acknowledged strong, conflicting viewpoints and charitably explained why they pose a serious challenge to the participant's position and argued that the participant's position better defuses the moral tension within the case",
        "- Response to Commentary (0-10): The participant prioritized the main suggestions, questions, and critiques and charitably explained why they pose a serious challenge to the participant's position, in a way that made the participant's position clearer, and refined the participant's position, or clearly explained why such refinement was not required.",
        "A strong judge question should help reveal whether the participant can answer clearly, explain how the question impacts their position, make the position clearer, and refine the position when needed."
    ].join("\n");
}

function getPriorJudgeQuestionsForCase(caseNum, judgeNumber = Infinity) {
    const out = [];
    const upper = Number.isFinite(Number(judgeNumber)) ? Math.max(1, Math.floor(Number(judgeNumber))) : 99;
    for (let n = 1; n < upper; n += 1) {
        const question = sanitizeText(
            state.askedJudgeQuestions[getJudgeQuestionPhaseId(caseNum, n)] ||
            getCachedAiJudgeQuestion(caseNum, n) || ""
        );
        if (question) out.push({ judgeNumber: n, question });
    }
    return out;
}

function getJudgeAnswerTargetForQuestionPhase(phase) {
    if (!phase || phase.kind !== "judgeQuestion") return null;
    const nextPhase = state.phases[state.currentPhaseIndex + 1] || null;
    if (nextPhase && nextPhase.kind === "judgeAnswer" && nextPhase.caseNum === phase.caseNum && nextPhase.judgeNumber === phase.judgeNumber) {
        return nextPhase;
    }
    return state.phases.find((item) => item.kind === "judgeAnswer" && item.caseNum === phase.caseNum && item.judgeNumber === phase.judgeNumber) || null;
}

function primeAiJudgeAnswerForFinalQuestion(phase) {
    const answerTarget = getJudgeAnswerTargetForQuestionPhase(phase);
    if (!answerTarget || !isAiControlledRole(answerTarget.speaker)) return null;

    const finalQuestion = sanitizeText(
        state.askedJudgeQuestions[phase.id] ||
        state.askedJudgeQuestions[answerTarget.id] || ""
    );
    if (!finalQuestion) return null;

    // Start answer generation and exact whole-answer audio measurement only
    // after the final question has been locked and stored.
    void maybePrepareAiTurnForPhase(answerTarget)
    .then((text) => {
        const cleanText = sanitizeText(text);
        if (!cleanText) return null;
        return prepareWholeSpeechAudioForPhase(answerTarget, cleanText);
    })
    .catch((error) => {
        console.error("AI judge-answer preparation from the final question failed:", error);
    });
    return answerTarget;
}

function getJudgeQuestionForAnswerPhase(phase) {
    if (!phase || phase.kind !== "judgeAnswer") return "";
    return sanitizeText(
        state.askedJudgeQuestions[phase.id] ||
        state.askedJudgeQuestions[getJudgeQuestionPhaseId(phase.caseNum, phase.judgeNumber)] ||
        state.lastJudgeQuestionByCase[phase.caseNum] || ""
    );
}

function storeJudgeQuestionForPhase(phase, question) {
    const clean = sanitizeText(question);
    if (!phase || phase.kind !== "judgeQuestion" || !clean) return;
    const answerPhaseId = getJudgeAnswerPhaseId(phase.caseNum, phase.judgeNumber);
    const previousQuestion = sanitizeText(
        state.askedJudgeQuestions[answerPhaseId] ||
        state.askedJudgeQuestions[phase.id] || ""
    );
    const questionChanged = previousQuestion !== clean;
    state.lastJudgeQuestionByCase[phase.caseNum] = clean;
    state.askedJudgeQuestions[phase.id] = clean;
    state.askedJudgeQuestions[answerPhaseId] = clean;
    if (questionChanged) {
        delete state.aiPreparedTurns[answerPhaseId];
        clearAiPreparationSnapshot(answerPhaseId);
        delete state.aiPreparationErrors[answerPhaseId];
        clearWholeSpeechPreparation(answerPhaseId);
    }
    const prepKey = getAiJudgeQuestionPreparationKey(phase.caseNum, phase.judgeNumber);
    delete state.aiJudgeQuestionPreparationPromises[prepKey];
    delete state.aiJudgeQuestionPreparationErrors[prepKey];
}

function getCachedAiJudgeQuestion(caseNum, judgeNumber) {
    return sanitizeText(state.judgeQuestionCache?.[caseNum]?.[judgeNumber - 1] || "");
}

function cacheAiJudgeQuestion(caseNum, judgeNumber, question) {
    const clean = sanitizeText(question);
    if (!state.judgeQuestionCache[caseNum]) state.judgeQuestionCache[caseNum] = [];
    state.judgeQuestionCache[caseNum][judgeNumber - 1] = clean;
    return clean;
}

function getCachedAiJudgeQuestionDraft(caseNum, judgeNumber) {
    return sanitizeText(state.aiJudgeQuestionDraftCache?.[caseNum]?.[judgeNumber - 1] || "");
}

function cacheAiJudgeQuestionDraft(caseNum, judgeNumber, question) {
    const clean = sanitizeText(question);
    if (!state.aiJudgeQuestionDraftCache[caseNum]) state.aiJudgeQuestionDraftCache[caseNum] = [];
    state.aiJudgeQuestionDraftCache[caseNum][judgeNumber - 1] = clean;
    return clean;
}

function getPriorAiJudgeQuestions(caseNum, judgeNumber) {
    return getPriorJudgeQuestionsForCase(caseNum, judgeNumber).map((item) => item.question);
}

function decodeLooseQuestionEscapes(value) {
    return String(value || "")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
        try { return String.fromCharCode(parseInt(hex, 16)); } catch { return _; }
    })
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\");
}

function unwrapQuestionFieldShell(value) {
    let clean = stripJsonFence(String(value || "").trim());
    clean = decodeLooseQuestionEscapes(clean).trim();
    clean = clean.replace(/^\s*\{\s*"question"\s*:\s*/i, "");
        clean = clean.replace(/^\s*"question"\s*:\s*/i, "");
        clean = clean.replace(/^\s*question\s*:\s*/i, "");
        clean = clean.replace(/\s*\}\s*$/, "").trim();
        clean = clean.replace(/^['"`]+/, "").trim();
        clean = clean.replace(/['"`]+$/, "").trim();
        return clean;
}

function normalizeQuestionForComparison(question) {
    return sanitizeText(unwrapQuestionFieldShell(question))
    .toLowerCase()
    .replace(/[“”"'.?!,:;()[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function questionLooksStockOrGeneric(question) {
    const normalized = normalizeQuestionForComparison(question);
    const banned = new Set([
        "what principle most strongly supports your position",
        "what principle most strongly supports your view",
        "what principle matters most in your view",
        "how would your view apply under slightly harder facts",
        "how would your position apply under slightly harder facts",
        "what is the strongest objection to your view",
        "what is the strongest objection to your position"
    ]);
    return banned.has(normalized);
}

function normalizeQuestionForDelivery(question) {
    let clean = sanitizeText(unwrapQuestionFieldShell(question)).replace(/\s+/g, " ").trim();
    if (!clean) return "";
    if (!/[?]$/.test(clean)) {
        clean = clean.replace(/[.!,;:]+$/g, "").trim();
        clean = `${clean}?`;
    }
    return clean;
}

function validateAiJudgeQuestion(question, priorQuestions = []) {
    const clean = normalizeQuestionForDelivery(question);
    if (!clean) return { ok: false, reason: l("The question was blank.", "La question était vide."), question: "" };
    if (/^\s*\{/.test(clean) || /^"?question"?\s*:/i.test(clean)) return { ok: false, reason: l("The question still looked like JSON rather than plain text.", "La question ressemblait encore à du JSON plutôt qu’à du texte."), question: clean };
    if (clean.length < 24) return { ok: false, reason: l("The question was too short.", "La question était trop courte."), question: clean };
    if (questionLooksStockOrGeneric(clean)) return { ok: false, reason: l("The question was too generic or stock.", "La question était trop générique."), question: clean };
    const normalized = normalizeQuestionForComparison(clean);
    if (!normalized) return { ok: false, reason: l("The question had no usable content.", "La question n’avait aucun contenu exploitable."), question: clean };
    const normalizedPrior = priorQuestions.map((item) => normalizeQuestionForComparison(item)).filter(Boolean);
    if (normalizedPrior.includes(normalized)) return { ok: false, reason: l("The question duplicated an earlier judge question.", "La question répétait une question déjà posée."), question: clean };
    return { ok: true, reason: "", question: clean };
    }

    function extractAiJudgeQuestionCandidate(raw) {
        const text = stripJsonFence(raw);
        const direct = normalizeQuestionForDelivery(text);
        if (direct && !/^\s*\{/.test(text)) return direct;
            try {
                const parsed = extractJsonObject(text);
                if (typeof parsed?.question === "string") return normalizeQuestionForDelivery(parsed.question);
            } catch {}
            const match = text.match(/"question"\s*:\s*"([\s\S]*?)"\s*(?:,|\})/i) ||
            text.match(/\bquestion\b\s*:\s*"([\s\S]*?)"\s*(?:,|\}|$)/i) ||
            text.match(/\bquestion\b\s*:\s*([^\n]+)$/i);
            if (match?.[1]) return normalizeQuestionForDelivery(match[1]);
            return normalizeQuestionForDelivery(unwrapQuestionFieldShell(text));
}

function getJudgeRoleGuidance(judgeNumber) {
    if (judgeNumber === 1) return "Ask for clarification of one central moral claim, distinction, or inferential step in the participant's own position.";
    if (judgeNumber === 2) return "Ask a pressure-test question using a limiting principle, boundary case, neglected stakeholder, institutional implication, or difficult practical variant.";
    return "Ask about the most important unresolved tension left after the earlier questions, preferably connecting the participant's commitments across their presentation, response, and prior answers.";
}

function buildAiJudgeQuestionScoringPromptContext(caseNum, judgeNumber, priorQuestions, transcript) {
    const leader = speakerName(state.leadByCase[caseNum]);
    const caseData = state.cases[caseNum];
    const priorQuestionsBlock = priorQuestions.length ? priorQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n") : "[No prior judge questions on this case yet.]";
    return [
        `The participant being questioned on Case #${caseNum} is ${leader}.`,
        `Case title: ${caseData.title}`,
        `Moderator question: ${caseData.question}`,
        `Case text:\n${clipText(caseData.text, 7000)}`,
        `Substantive transcript so far:\n${transcript || "[No substantive transcript yet.]"}`,
        `Earlier judge questions already asked on this case:\n${priorQuestionsBlock}`,
        `Current judge role: Judge ${judgeNumber}.`,
        getJudgeRoleGuidance(judgeNumber),
        `Scoring criteria context:\n${buildJudgeQuestionScoringCriteriaContext()}`,
        "Choose the single next question that would most improve the panel's understanding of whether the participant's position is coherent, defensible, properly limited, and responsive under the rubric."
    ].join("\n\n");
}

function buildAiJudgeQuestionLengthGuidance() {
    return `Ask a question of suitable spoken length. Aim to keep it comfortably askable within one minute and around ${MAX_JUDGE_QUESTION_CHARS} characters when possible, but if the best question runs longer, keep it rather than awkwardly truncating it.`;
}

function buildAiJudgeQuestionDraftPrompt(caseNum, judgeNumber, priorQuestions, transcript) {
    return [
        buildAiJudgeQuestionScoringPromptContext(caseNum, judgeNumber, priorQuestions, transcript),
        "This is the initial drafting pass for the judge's question.",
        "Draft exactly one candidate question now.",
        "Question requirements:",
        "- Anchor it in the participant's actual reasoning from the transcript currently available.",
        "- Focus on one unresolved issue, not several.",
        "- Prefer a hidden assumption, limiting principle, unresolved tension, neglected stakeholder, institutional implication, practical implication, or unclear commitment.",
        "- The question should be useful for distinguishing between an adequate and an excellent answer under the scoring rubric.",
        "- Do not ask for a mere summary or restatement.",
        "- Do not duplicate or lightly paraphrase an earlier judge question from this case.",
        "- Avoid canned stems and generic stock prompts.",
        `- ${buildAiJudgeQuestionLengthGuidance()}`,
        "- This draft may be revised later, but it should already be a usable question.",
        "Return strict JSON exactly in this shape:",
        `{"question":"..."}`
    ].join("\n\n");
}

function buildAiJudgeQuestionRevisionPrompt(caseNum, judgeNumber, priorQuestions, transcript, draftQuestion) {
    return [
        buildAiJudgeQuestionScoringPromptContext(caseNum, judgeNumber, priorQuestions, transcript),
        "You already drafted this question:",
        draftQuestion,
        "This is the revision pass.",
        "Revise that drafted question into the best final judge question for this moment.",
        "Revision requirements:",
        "- Keep it to exactly one question.",
        "- Preserve the core issue if it is already strong, but sharpen wording, specificity, fairness, or scope if the updated transcript suggests a better final version.",
        "- Ground it in the participant's actual reasoning from the current transcript.",
        "- Focus on one unresolved issue, not several.",
        "- Do not ask for a mere summary or restatement.",
        "- Do not duplicate or lightly paraphrase an earlier judge question from this case.",
        "- Make it sound natural aloud.",
        `- ${buildAiJudgeQuestionLengthGuidance()}`,
        "Return strict JSON exactly in this shape:",
        `{"question":"..."}`
    ].join("\n\n");
}

async function generateInitialAiJudgeQuestionDraft({ caseNum, judgeNumber, priorQuestions, transcript, expectedRunId = state.matchRunId }) {
    const prompt = buildAiJudgeQuestionDraftPrompt(caseNum, judgeNumber, priorQuestions, transcript);
    let attempt = 0;
    while (expectedRunId === state.matchRunId) {
        attempt += 1;
        try {
            const raw = await callAI({
                model: getJudgeModel(),
                                         systemPrompt: buildAiJudgeSystemPrompt(),
                                         userPrompt: prompt,
                                         maxTokens: 600,
                                         reasoningEffort: JUDGE_REASONING_EFFORT
            });
            const extracted = extractAiJudgeQuestionCandidate(raw);
            const validation = validateAiJudgeQuestion(extracted, priorQuestions);
            if (validation.ok) return validation.question;
            throw new Error(validation.reason || (isFrenchLocale() ? `La question brouillon du ${judgeLabel(judgeNumber)} n’a pas pu être validée.` : `Judge ${judgeNumber}'s drafted question could not be validated.`));
        } catch (error) {
            if (expectedRunId !== state.matchRunId) return "";
            console.warn(`Judge ${judgeNumber} draft attempt ${attempt} failed; retrying.`, error);
            await delayMs(Math.min(750 * attempt, 4000));
        }
    }
    return "";
}

async function reviseDraftedAiJudgeQuestion({ caseNum, judgeNumber, priorQuestions, transcript, draftQuestion, expectedRunId = state.matchRunId }) {
    const fallbackValidation = validateAiJudgeQuestion(draftQuestion, priorQuestions);
    if (!fallbackValidation.ok) {
        throw new Error(fallbackValidation.reason || (isFrenchLocale() ? `La question brouillon du ${judgeLabel(judgeNumber)} n’a pas pu être validée.` : `Judge ${judgeNumber}'s drafted question could not be validated.`));
    }
    const fallbackQuestion = fallbackValidation.question;
    const prompt = buildAiJudgeQuestionRevisionPrompt(caseNum, judgeNumber, priorQuestions, transcript, fallbackQuestion);
    let attempt = 0;
    while (expectedRunId === state.matchRunId) {
        attempt += 1;
        try {
            const raw = await callAI({
                model: getJudgeModel(),
                                         systemPrompt: buildAiJudgeSystemPrompt(),
                                         userPrompt: prompt,
                                         maxTokens: 600,
                                         reasoningEffort: JUDGE_REASONING_EFFORT
            });
            const extracted = extractAiJudgeQuestionCandidate(raw);
            const validation = validateAiJudgeQuestion(extracted, priorQuestions);
            if (validation.ok) return validation.question;
            throw new Error(validation.reason || (isFrenchLocale() ? `La question révisée du ${judgeLabel(judgeNumber)} n’a pas pu être validée.` : `Judge ${judgeNumber}'s revised question could not be validated.`));
        } catch (error) {
            if (expectedRunId !== state.matchRunId) return fallbackQuestion;
            console.warn(`Judge ${judgeNumber} revision attempt ${attempt} failed.`, error);
            if (attempt >= 2) return fallbackQuestion;
            await delayMs(Math.min(750 * attempt, 4000));
        }
    }
    return fallbackQuestion;
}

async function maybeDraftAiJudgeQuestion(caseNum, judgeNumber, expectedRunId = state.matchRunId) {
    if (state.judgeMode !== "ai") return "";
    const cachedFinal = getCachedAiJudgeQuestion(caseNum, judgeNumber);
    if (cachedFinal) return cachedFinal;
    const cachedDraft = getCachedAiJudgeQuestionDraft(caseNum, judgeNumber);
    if (cachedDraft) return cachedDraft;
    const prepKey = getAiJudgeQuestionPreparationKey(caseNum, judgeNumber);
    if (state.aiJudgeQuestionDraftPromises[prepKey]) return state.aiJudgeQuestionDraftPromises[prepKey];
    const runId = expectedRunId;
    let trackedPromise = null;
    trackedPromise = (async () => {
        try {
            const priorQuestions = getPriorAiJudgeQuestions(caseNum, judgeNumber);
            const transcript = substantiveTranscriptAsPlainText(caseNum);
            const draft = await generateInitialAiJudgeQuestionDraft({
                caseNum, judgeNumber, priorQuestions, transcript, expectedRunId: runId
            });
            if (runId !== state.matchRunId) return "";
            const clean = cacheAiJudgeQuestionDraft(caseNum, judgeNumber, draft);
            delete state.aiJudgeQuestionDraftErrors[prepKey];
            return clean;
        } catch (error) {
            if (runId === state.matchRunId) state.aiJudgeQuestionDraftErrors[prepKey] = error?.message || l("Failed to draft AI judge question.", "La rédaction de la question du juge IA a échoué.");
            throw error;
        } finally {
            if (state.aiJudgeQuestionDraftPromises[prepKey] === trackedPromise) delete state.aiJudgeQuestionDraftPromises[prepKey];
        }
    })();
    state.aiJudgeQuestionDraftPromises[prepKey] = trackedPromise;
    return trackedPromise;
}

async function ensureAiJudgeQuestion(caseNum, judgeNumber, expectedRunId = state.matchRunId) {
    const cached = getCachedAiJudgeQuestion(caseNum, judgeNumber);
    if (cached) return cached;
    const cacheIfCurrent = (question) => {
        const clean = sanitizeText(question);
        if (!clean) return "";
        if (expectedRunId !== state.matchRunId) return "";
        return cacheAiJudgeQuestion(caseNum, judgeNumber, clean);
    };
    const priorQuestions = getPriorAiJudgeQuestions(caseNum, judgeNumber);
    const transcript = substantiveTranscriptAsPlainText(caseNum);
    let draft = getCachedAiJudgeQuestionDraft(caseNum, judgeNumber);
    if (!draft) draft = await maybeDraftAiJudgeQuestion(caseNum, judgeNumber, expectedRunId);
    if (expectedRunId !== state.matchRunId) return "";
    const cleanDraft = sanitizeText(draft);
    if (!cleanDraft) throw new Error(isFrenchLocale() ? `La question brouillon du ${judgeLabel(judgeNumber)} manquait.` : `Judge ${judgeNumber}'s draft question was missing.`);
    const question = await reviseDraftedAiJudgeQuestion({
        caseNum, judgeNumber, priorQuestions, transcript, draftQuestion: cleanDraft, expectedRunId
    });
    if (expectedRunId !== state.matchRunId) return "";
    return cacheIfCurrent(question || cleanDraft);
}

function buildAiTurnPrompt(phase) {
    const caseData = state.cases[phase.caseNum];
    const isJudgeAnswer = phase.kind === "judgeAnswer";
    const judgeQuestion = isJudgeAnswer ? getJudgeQuestionForAnswerPhase(phase) : "";
    return AI_TURN_PROMPTS.buildAiTurnPrompt({
        phase,
        caseData,
        transcript: transcriptAsPlainText(phase.caseNum),
        judgeQuestion,
        wordGuidance: getPhaseWordGuidance(phase)
    });
}

function buildAiTurnRevisionPrompt(phase, draftText, revisionNumber, totalRevisions, baselineWordCount = 0) {
    const draft = sanitizeText(draftText);
    const wordPlan = getAiRevisionWordPlan(phase, baselineWordCount, draft);
    const wordCountSection = wordPlan ? wordPlan.exactTarget ? [
        `Original first-draft word count: ${wordPlan.originalDraftWordCount || wordPlan.currentDraftWordCount} words.`,
        `Current draft word count: ${wordPlan.currentDraftWordCount} words.`,
        `Final target for this phase: exactly ${wordPlan.targetWordCount} words.`,
        "For this revision pass, focus on improving substance, clarity, and responsiveness.",
        "A separate final pass will adjust the exact word budget after this revision."
    ].join("\n") : [
        `Original first-draft word count: ${wordPlan.originalDraftWordCount || wordPlan.currentDraftWordCount} words.`,
        `Current draft word count: ${wordPlan.currentDraftWordCount} words.`,
        wordPlan.originalDraftWordCount && wordPlan.originalDraftWordCount !== wordPlan.targetWordCount
        ? `Because this phase must stay within ${wordPlan.hardMin}-${wordPlan.hardMax} words, revise toward ${wordPlan.targetWordCount} words.`
        : `Target about ${wordPlan.targetWordCount} words.`,
        `Allowed revision window for this pass: ${wordPlan.allowedMin}-${wordPlan.allowedMax} words.`,
        `Hard cap: ${wordPlan.hardMax} words.`,
        "You must hit the word target exactly."
    ].join("\n") : "";

    return [
        `You are revising a draft for ${phase.title}.`,
        buildAiTurnPrompt(phase),
        wordCountSection,
        `Current draft:\n${clipText(draft, 15000)}`,
        `Revision pass ${revisionNumber} of ${totalRevisions}.`,
        "Improve or rewrite the draft so it is clearer, more philosophically rigorous, more directly responsive.",
        "Keep the speaker as a single participant rather than a team.",
        "Do not mention that this text is revised.",
        "Do not mention the word count.",
        "Output plain text only."
    ].filter(Boolean).join("\n\n");
}

function buildAiExactWordBudgetPrompt(phase, draftText, currentWordCount, targetWordCount, attemptNumber = 1) {
    const draft = sanitizeText(draftText);
    const delta = Math.round(targetWordCount - currentWordCount);
    const absDelta = Math.abs(delta);
    const editingGoal = phase?.kind === "speech" && phase.subtype === "presentation"
        ? "Keep this as a concise Ethics Bowl presentation that directly answers the moderator's question."
        : phase?.kind === "speech" && phase.subtype === "commentary"
        ? "Keep this as a concise commentary on the other participant's presentation."
        : phase?.kind === "speech" && phase.subtype === "response"
        ? "Keep this as a concise response to the commentary that addresses the main challenge fairly."
        : phase?.kind === "judgeAnswer"
        ? "Keep this as a direct answer to the judge's exact question."
        : "Keep the draft tightly focused on the current phase.";
    const adjustmentInstruction = delta > 0
        ? `The draft is ${absDelta} words short. Add exactly ${absDelta} words.`
        : `The draft is ${absDelta} words over. Remove exactly ${absDelta} words.`;
    const editScopeInstruction = absDelta <= 8
        ? "Use the smallest possible edits so the argument and structure stay essentially unchanged."
        : absDelta <= 30
        ? "Prefer targeted cuts or additions inside existing sentences and transitions rather than rewriting the whole draft."
        : "You may rewrite sentences or short sections as needed, but preserve the substantive position and overall structure.";
    const retryInstruction = attemptNumber > 1
        ? "The previous adjustment missed the exact target. Recount carefully and fix only the remaining difference."
        : "";

    return [
        `You are doing the final word-budget adjustment for ${phase.title}.`,
        editingGoal,
        `Current draft word count using the app's counter: ${currentWordCount} words.`,
        `Required final word count using the app's counter: exactly ${targetWordCount} words.`,
        adjustmentInstruction,
        editScopeInstruction,
        retryInstruction,
        "Preserve the draft's substantive position, voice, and paragraph structure where possible.",
        "Do not add headings or meta commentary.",
        "Do not mention the word count.",
        `Current draft:\n${clipText(draft, 15000)}`,
        "Return the full revised draft only."
    ].filter(Boolean).join("\n\n");
}

async function enforcePhaseWordCount(phase, draftText, options = {}) {
    const draft = sanitizeText(draftText);
    const guidance = getPhaseWordGuidance(phase);
    if (!draft || !guidance) return draft;
    const mode = options.mode === "revision" ? "revision" : "initial";
    const baselineWordCount = Math.max(0, Math.round(Number(options.baselineWordCount) || 0));
    const exactTarget = mode === "revision" && shouldUseFixedRevisionWordTarget(phase);
    const plan = getAiRevisionWordPlan(phase, baselineWordCount, draft, { exactTarget });
    const allowedMin = mode === "revision" ? plan.allowedMin : guidance.min;
    const allowedMax = mode === "revision" ? plan.allowedMax : guidance.max;
    const targetWordCount = mode === "revision" ? plan.targetWordCount : guidance.preferredTarget;
    let bestDraft = draft;
    let currentWordCount = countWords(bestDraft);
    if (currentWordCount >= allowedMin && currentWordCount <= allowedMax) return bestDraft;

    const maxAttempts = exactTarget ? 4 : 1;
    for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber += 1) {
        const prompt = exactTarget
            ? buildAiExactWordBudgetPrompt(phase, bestDraft, currentWordCount, targetWordCount, attemptNumber)
            : [
                `You are fixing the word count for ${phase.title}.`,
                AI_TURN_PROMPTS.getPhaseInstruction(phase),
                mode === "revision"
                ? [
                    `Original first-draft word count: ${plan.originalDraftWordCount || plan.targetWordCount} words.`,
                    `Current draft word count: ${currentWordCount} words.`,
                    `Target about ${targetWordCount} words.`,
                    `Required final revision window: ${allowedMin}-${allowedMax} words.`,
                    `Hard phase range: ${guidance.min}-${guidance.max} words.`
                ].join("\n")
                : [
                    `Current draft word count: ${currentWordCount} words.`,
                    `Target about ${targetWordCount} words.`,
                    `Required final range: ${guidance.min}-${guidance.max} words.`
                ].join("\n"),
                "Do not mention the word count.",
                "You must hit the word target exactly.",
                `Current draft:\n${clipText(bestDraft, 15000)}`,
                "Output plain text only."
            ].join("\n\n");
        const repaired = sanitizeText(await callAI({
            model: getParticipantModel(phase.speaker),
                                                   systemPrompt: buildAiDebaterSystemPrompt(phase.speaker),
                                                   userPrompt: prompt,
                                                   maxTokens: getAiTurnMaxOutputTokens(phase)
        }));
        bestDraft = pickBetterWordCountDraft(bestDraft, repaired, targetWordCount, allowedMin, allowedMax);
        currentWordCount = countWords(bestDraft);
        if (currentWordCount >= allowedMin && currentWordCount <= allowedMax) return bestDraft;
    }

    return bestDraft;
}

async function enforceDirectJudgeAnswer(phase, draftText) {
    const draft = sanitizeText(draftText);
    if (!draft) return "";
    const judgeQuestion = getJudgeQuestionForAnswerPhase(phase);
    if (!judgeQuestion) {
        throw new Error(isFrenchLocale()
        ? `La question du ${judgeLabel(phase.judgeNumber)} manque, donc ${speakerName(phase.speaker)} ne peut pas encore y répondre.`
        : `Judge ${phase.judgeNumber}'s question is missing, so ${speakerName(phase.speaker)} cannot answer it yet.`);
    }
    const prompt = [
        `Current phase: ${phase.title}`,
        `Exact judge question:\n${judgeQuestion}`,
        buildAiTurnPrompt(phase),
        `Draft answer:\n${draft}`,
        "Revise the draft so it answers the judge's exact question as posed.",
        "Requirements:",
        "- The first sentence must directly answer the question.",
        "- If the question is yes/no, begin with 'Yes' or 'No.'",
        "- Do not dodge, reframe, or broaden the question before answering.",
        "- Preserve the draft's substantive position where possible.",
        "- Keep the tone thoughtful, concise, and charitable.",
        "- Output plain text only."
    ].join("\n\n");
    const revised = sanitizeText(await callAI({
        model: getParticipantModel(phase.speaker),
                                                  systemPrompt: buildAiDebaterSystemPrompt(phase.speaker),
                                                  userPrompt: prompt,
                                                  maxTokens: getAiTurnMaxOutputTokens(phase)
    }));
    return revised || draft;
}

async function handleAiConferPhase(phase) {
    const phaseId = phase?.id || "";
    const targetPhase = getLinkedAiPreparationTarget(phase);
    const speaker = speakerName(phase?.speaker);
    if (!phaseId || !targetPhase) {
        advancePhase();
        return true;
    }
    const hasPrepared = !!getPreparedAiTurnText(targetPhase.id);
    const hasPendingPreparation = !!state.aiPreparationPromises[targetPhase.id];
    setBusy(true);
    setStatus(
        hasPrepared
        ? isFrenchLocale() ? `${speaker} a terminé son caucus.` : `${speaker} has finished conferring.`
        : hasPendingPreparation
        ? isFrenchLocale() ? `${speaker} termine une version révisée du ${phaseSubtypeLabel(targetPhase.subtype).toLowerCase()} pendant le caucus...` : `${speaker} is finishing a revised ${targetPhase.subtype || "speech"} during conferral...`
        : isFrenchLocale() ? `${speaker} est en caucus et prépare une version révisée du ${phaseSubtypeLabel(targetPhase.subtype).toLowerCase()}...` : `${speaker} is conferring and preparing a revised ${targetPhase.subtype || "speech"}...`
    );
    try {
        const text = sanitizeText(await maybePrepareAiTurnForPhase(targetPhase, { revisionPasses: 1 }));
        if (!text) throw new Error(l("The model returned no text.", "Le modèle n’a renvoyé aucun texte."));
        let current = getCurrentPhase();
        if (!current || current.id !== phaseId || !state.phaseReady || state.completed) {
            setStatus(isFrenchLocale() ? `Le caucus de ${speaker} s’est terminé après le changement de phase.` : `${speaker}'s conferral finished after the phase had already moved on.`);
            return false;
        }

        setStatus(isFrenchLocale()
            ? `Calcul de la durée audio et du débit global de ${speaker} pendant le caucus...`
            : `Measuring ${speaker}'s audio and calculating one whole-speech rate during conferral...`);
        const preparedSpeech = await prepareWholeSpeechAudioForPhase(targetPhase, text);
        current = getCurrentPhase();
        if (!current || current.id !== phaseId || !state.phaseReady || state.completed) {
            setStatus(isFrenchLocale() ? `Le calcul audio de ${speaker} s’est terminé après la fin du caucus.` : `${speaker}'s audio calculation finished after conferral had already ended.`);
            return false;
        }
        if (!TIMING_TEST_MODE && !preparedSpeech) {
            throw new Error(l("The prepared speech audio could not be measured.", "L’audio préparé de la prise de parole n’a pas pu être mesuré."));
        }

        setPhaseAwaitingPlayback(phaseId);
        appendParticipantMessage(phase.speaker, l("I yield my time", "Je cède mon temps"), {
            caseNum: phase.caseNum,
                phaseId,
                substantive: false,
                onPlaybackComplete: () => {
                    const activePhase = getCurrentPhase();
                    if (!activePhase || activePhase.id !== phaseId || state.completed) return;
                    if (state.phaseAwaitingPlaybackForId !== phaseId) return;
                    clearPhaseAwaitingPlayback(phaseId);
                    advancePhase();
                }
        });
        setStatus(isFrenchLocale() ? `${speaker} a terminé son caucus.` : `${speaker} has finished conferring.`);
        return true;
    } catch (error) {
        console.error(error);
        blockAutoGenerationForPhase(phaseId);
        clearPhaseAwaitingPlayback(phaseId);
        setStatus(error?.message || l("Failed during AI conferral.", "Échec pendant le caucus IA."), true);
        return false;
    } finally {
        setBusy(false);
    }
}

async function generateAiTurnForPhase(phase, options = {}) {
    const phaseId = phase?.id || "";
    if (!phaseId) return false;
    const duringModerator = options.duringModerator === true;
    const speaker = speakerName(phase.speaker);
    const hasPrepared = !!getPreparedAiTurnText(phaseId);
    const hasPendingPreparation = !!state.aiPreparationPromises[phaseId];
    if (duringModerator) setPhaseAwaitingPlayback(phaseId);
    if (!duringModerator) {
        setBusy(true);
        setStatus(
            hasPrepared
            ? isFrenchLocale() ? `${speaker} est prêt.` : `${speaker}'s ${phase.subtype || "answer"} is ready.`
            : hasPendingPreparation
            ? isFrenchLocale() ? `Finalisation du texte préparé de ${speaker}...` : `Finishing ${speaker}'s prepared ${phase.subtype || "answer"}...`
            : isFrenchLocale() ? `Génération du texte de ${speaker}...` : `Generating ${speaker}'s ${phase.subtype || "answer"}...`
        );
    }
    try {
        const text = sanitizeText(await maybePrepareAiTurnForPhase(phase));
        if (!text) throw new Error(l("The model returned no text.", "Le modèle n’a renvoyé aucun texte."));
        const current = getCurrentPhase();
        if (!current || current.id !== phaseId || state.completed) {
            setStatus(isFrenchLocale() ? `Le tour de ${speaker} est arrivé après le changement de phase.` : `${speaker}'s turn finished after the phase had already moved on.`);
            return false;
        }
        delete state.aiPreparedTurns[phaseId];
        delete state.aiPreparationErrors[phaseId];
        setPhaseAwaitingPlayback(phaseId);
        appendParticipantMessage(phase.speaker, text, {
            caseNum: phase.caseNum,
                phaseId,
                hiddenUntilPhaseReady: duringModerator && !state.phaseReady,
                onPlaybackStart: () => {
                    startTimerWithAutoSpeech(phaseId);
                    primeAiFinalScoringAfterFinalTurn(phase);
                },
                minimumHandoffGapMs: phaseUsesNaturalModeratorHandoff(phase) ? PARTICIPANT_SPEECH_HANDOFF_GAP_MS : 0,
                speechStartLeadMs: TIMED_SPEECH_TIMER_LEAD_MS,
                onPlaybackComplete: () => {
                    const activePhase = getCurrentPhase();
                    if (!activePhase || activePhase.id !== phaseId || state.completed) return;
                    if (state.phaseAwaitingPlaybackForId !== phaseId) return;
                    clearPhaseAwaitingPlayback(phaseId);
                    advancePhase();
                }
        });
        primeNextFinalJudgeQuestionAndAnswerAfterTurn(phase);
        if (!duringModerator) setStatus(isFrenchLocale() ? `${speaker} a terminé.` : `${speaker} has finished.`);
        return true;
    } catch (error) {
        console.error(error);
        blockAutoGenerationForPhase(phaseId);
        clearPhaseAwaitingPlayback(phaseId);
        setStatus(error?.message || l("Failed to generate the AI turn.", "La génération du tour IA a échoué."), true);
        return false;
    } finally {
        if (!duringModerator) setBusy(false);
    }
}

function primeAiSpeechPlaybackDuringModerator(phase) {
    if (!phasePreloadsAutoSpeechDuringModerator(phase) || state.completed) return;
    if (isCurrentPhaseAwaitingPlayback(phase)) return;
    void generateAiTurnForPhase(phase, { duringModerator: true });
}

async function askAiJudgeQuestion(phase) {
    const phaseId = phase?.id || "";
    const prepKey = getAiJudgeQuestionPreparationKey(phase?.caseNum, phase?.judgeNumber);
    const hasPrepared = !!getCachedAiJudgeQuestion(phase?.caseNum, phase?.judgeNumber);
    const hasDraft = !!getCachedAiJudgeQuestionDraft(phase?.caseNum, phase?.judgeNumber);
    const hasPendingPreparation = !!state.aiJudgeQuestionPreparationPromises[prepKey];
    setBusy(true);
    setStatus(
        hasPrepared
        ? isFrenchLocale() ? `La question du ${judgeLabel(phase.judgeNumber)} est prête.` : `${judgeLabel(phase.judgeNumber)}'s question is ready.`
        : hasPendingPreparation
        ? isFrenchLocale() ? `Finalisation de la question révisée du ${judgeLabel(phase.judgeNumber)}...` : `Finishing ${judgeLabel(phase.judgeNumber)}'s revised question...`
        : hasDraft
        ? isFrenchLocale() ? `Révision de la question brouillon du ${judgeLabel(phase.judgeNumber)}...` : `Revising ${judgeLabel(phase.judgeNumber)}'s drafted question...`
        : isFrenchLocale() ? `Génération de la question du ${judgeLabel(phase.judgeNumber)}...` : `Generating ${judgeLabel(phase.judgeNumber)}'s question...`
    );
    try {
        const question = await maybePrepareAiJudgeQuestion(phase.caseNum, phase.judgeNumber);
        const current = getCurrentPhase();
        if (!current || current.id !== phaseId || state.completed) {
            setStatus(isFrenchLocale() ? `La question du ${judgeLabel(phase.judgeNumber)} est arrivée après le changement de phase.` : `${judgeLabel(phase.judgeNumber)}'s question arrived after the phase had already moved on.`);
            return false;
        }
        const finalQuestion = sanitizeText(question);
        if (!finalQuestion) throw new Error(isFrenchLocale() ? `La question du juge IA ${phase.judgeNumber} manquait.` : `AI judge question ${phase.judgeNumber} was missing.`);
        storeJudgeQuestionForPhase(phase, finalQuestion);
        const preparedAnswerTarget = primeAiJudgeAnswerForFinalQuestion(phase);
        setPhaseAwaitingPlayback(phaseId);
        appendMessage("judge", judgeLabel(phase.judgeNumber), finalQuestion, {
            caseNum: phase.caseNum,
                phaseId,
                judgeNumber: phase.judgeNumber,
                onPlaybackStart: () => {
                    startTimerWithAutoSpeech(phaseId);
                },
                speechStartLeadMs: TIMED_SPEECH_TIMER_LEAD_MS,
                onPlaybackComplete: () => {
                    const activePhase = getCurrentPhase();
                    if (!activePhase || activePhase.id !== phaseId || state.completed) return;
                    if (state.phaseAwaitingPlaybackForId !== phaseId) return;
                    // Do not spend leftover question time waiting for answer
                    // preparation. Continue it under the next announcement.
                    clearPhaseAwaitingPlayback(phaseId);
                    advancePhase();
                }
        });
        setStatus(preparedAnswerTarget
            ? isFrenchLocale()
                ? `${judgeLabel(phase.judgeNumber)} pose sa question pendant la préparation de la réponse de ${speakerName(preparedAnswerTarget.speaker)}.`
                : `${judgeLabel(phase.judgeNumber)} is asking while ${speakerName(preparedAnswerTarget.speaker)}'s answer is prepared in parallel.`
            : isFrenchLocale()
            ? `${judgeLabel(phase.judgeNumber)} a posé sa question.`
            : `${judgeLabel(phase.judgeNumber)} has asked a question.`);
        return true;
    } catch (error) {
        console.error(error);
        blockAutoGenerationForPhase(phaseId);
        clearPhaseAwaitingPlayback(phaseId);
        setStatus(error?.message || l("Failed to generate the judge question.", "La génération de la question du juge a échoué."), true);
        return false;
    } finally {
        setBusy(false);
    }
}

function normalizeIntegerScore(value) {
    return SCORECARD_TALLY.normalizeWholeNumberInRange(value, 0, 60);
}

function normalizeOfficialParticipantBreakdown(raw) {
    if (!raw || typeof raw !== "object") return null;
    const breakdown = { comment: sanitizeText(raw.comment), thresholdAudit: {} };
    for (const criterionKey of OFFICIAL_SCORE_CRITERION_KEYS) {
        const audit = SCORECARD_TALLY.normalizeThresholdAudit(raw[criterionKey], criterionKey);
        if (!audit) return null;
        breakdown[criterionKey] = audit.score;
        breakdown.thresholdAudit[criterionKey] = audit;
    }
    return breakdown;
}

function totalOfficialParticipantBreakdown(breakdown) {
    return SCORECARD_TALLY.totalOfficialParticipantBreakdown(breakdown);
}

function officialScoreCriterionLabel(criterionKey) {
    const labels = {
        presentationQuestion: l("Presentation: clarity and coherence", "Présentation : clarté et cohérence"),
        presentationEthics: l("Presentation: moral dynamics", "Présentation : dynamique morale"),
        presentationViewpoints: l("Presentation: competing viewpoints", "Présentation : points de vue opposés"),
        responseToFeedback: l("Response to feedback", "Réponse aux commentaires"),
        judgesQuestions: l("Responses to judges' questions", "Réponses aux questions des juges"),
        commentary: l("Commentary", "Commentaire"),
        respectfulDialogue: l("Respectful dialogue", "Dialogue respectueux")
    };
    return labels[criterionKey] || criterionKey;
}

function formatOfficialCriterionScore(breakdown, criterionKey) {
    const score = breakdown?.[criterionKey];
    const maximum = SCORECARD_TALLY.OFFICIAL_BREAKDOWN_RANGES[criterionKey]?.[1] ?? 0;
    return `${score}/${maximum}`;
}

function formatOfficialParticipantBreakdown(breakdown) {
    if (!breakdown) return "";
    const presentationTotal = breakdown.presentationQuestion + breakdown.presentationEthics + breakdown.presentationViewpoints;
    if (isFrenchLocale()) {
        return [
            `Présentation ${presentationTotal}/15`,
            `(${formatOfficialCriterionScore(breakdown, "presentationQuestion")} clarté/cohérence, ${formatOfficialCriterionScore(breakdown, "presentationEthics")} éthique, ${formatOfficialCriterionScore(breakdown, "presentationViewpoints")} points de vue)`,
            `Réponse aux commentaires ${formatOfficialCriterionScore(breakdown, "responseToFeedback")}`,
            `Réponses aux juges ${formatOfficialCriterionScore(breakdown, "judgesQuestions")}`,
            `Commentaire ${formatOfficialCriterionScore(breakdown, "commentary")}`,
            `Dialogue respectueux ${formatOfficialCriterionScore(breakdown, "respectfulDialogue")}`
        ].join(" • ");
    }
    return [
        `Presentation ${presentationTotal}/15`,
        `(${formatOfficialCriterionScore(breakdown, "presentationQuestion")} clear/coherent, ${formatOfficialCriterionScore(breakdown, "presentationEthics")} ethics, ${formatOfficialCriterionScore(breakdown, "presentationViewpoints")} viewpoints)`,
        `Response to feedback ${formatOfficialCriterionScore(breakdown, "responseToFeedback")}`,
        `Judges' questions ${formatOfficialCriterionScore(breakdown, "judgesQuestions")}`,
        `Commentary ${formatOfficialCriterionScore(breakdown, "commentary")}`,
        `Respectful dialogue ${formatOfficialCriterionScore(breakdown, "respectfulDialogue")}`
    ].join(" • ");
}

function appendThresholdAuditDetails(article, participantName, breakdown) {
    if (!article || !breakdown?.thresholdAudit) return;
    const details = document.createElement("details");
    details.className = "score-note threshold-audit";
    const summary = document.createElement("summary");
    summary.textContent = isFrenchLocale()
        ? `Vérification des paliers — ${participantName}`
        : `${participantName} threshold audit`;
    details.appendChild(summary);
    OFFICIAL_SCORE_CRITERION_KEYS.forEach((criterionKey) => {
        const audit = breakdown.thresholdAudit[criterionKey];
        if (!audit) return;
        const line = document.createElement("div");
        line.className = "score-note threshold-audit-line";
        line.textContent = isFrenchLocale()
            ? `${officialScoreCriterionLabel(criterionKey)} — ${formatOfficialCriterionScore(breakdown, criterionKey)}. Preuve : ${audit.evidence} Limite : ${audit.limitation} Palier suivant : ${audit.unmetNextThreshold}`
            : `${officialScoreCriterionLabel(criterionKey)} — ${formatOfficialCriterionScore(breakdown, criterionKey)}. Evidence: ${audit.evidence} Limitation: ${audit.limitation} Next threshold: ${audit.unmetNextThreshold}`;
        details.appendChild(line);
    });
    article.appendChild(details);
}

function buildAiSingleJudgeScoringPrompt(scoringTranscript) {
    const participantOneLedCase = state.leadByCase[1] === "human" ? 1 : 2;
    const participantTwoLedCase = state.leadByCase[1] === "ai" ? 1 : 2;
    return [
        `This is a completed Ethics Bowl-style match between Participant 1, "${speakerName("human")}", and Participant 2, "${speakerName("ai")}".`,
        "Complete exactly one independent final score sheet. Do not simulate the other judges or return a panel answer.",
        `Participant 1 is ${participantControlSummary("human")}. Participant 2 is ${participantControlSummary("ai")}.`,
        "Score the arguments only. Do not reward or penalize a side for being human-controlled or AI-controlled.",
        OFFICIAL_SCORE_SHEET_TEXT.trim(),
        "Important scoring instructions:",
        `- For ${speakerName("human")} (Participant 1), the presentation /15, response to feedback /10, and judges' questions /20 must be based only on Case #${participantOneLedCase}.`,
        `- For ${speakerName("ai")} (Participant 2), the presentation /15, response to feedback /10, and judges' questions /20 must be based only on Case #${participantTwoLedCase}.`,
        `- ${speakerName("human")}'s commentary /10 must be based on the case not led by ${speakerName("human")}.`,
        `- ${speakerName("ai")}'s commentary /10 must be based on the case not led by ${speakerName("ai")}.`,
        "- For responses to judges' questions /20, examine every recorded judge answer on that participant's led case. Do not let one strong answer stand in for the full questioning period.",
        "- Respectful dialogue /5 is across the full match.",
        "- Evaluate each criterion independently from the lowest band upward. Do not decide a total first and reverse-engineer subscores.",
        "- For each criterion, highestSatisfiedBand must name the highest fully established rubric band, and score must be inside that exact band.",
        "- Evidence must identify concrete content from the transcript that establishes the declared band; generic praise is insufficient.",
        "- Limitation must identify the strongest concrete reason to withhold points, and hasMaterialLimitation must honestly distinguish a substantive weakness from a merely minor one.",
        "- Start at the minimum score in the attained band. Add each further point only for exceptional strength supported by the evidence; reaching the band alone never earns its maximum.",
        "- If hasMaterialLimitation is true in a top band, do not exceed 4/5, 9/10, or 18/20 for that criterion.",
        "- UnmetNextThreshold must identify the next band's missing requirement. For an earned top band, state that no higher threshold exists and that every top-band requirement was established.",
        "- Refinement requires an actual clarification, modification, qualification, or reasoned explanation that modification was unnecessary; merely adding detail is not automatically refinement.",
        "- A perfect score requires complete and consistently strong evidence, not merely the absence of an obvious mistake.",
        "- Use whole numbers only.",
        "- The top-level comment must briefly explain this judge's own tally and vote.",
        "- All participant turns and judge questions/answers below are exact stored transcript entries from the app, reproduced in full.",
        "Return only a scorecard matching the supplied strict JSON schema. Do not include markdown fences or additional fields.",
        "Keep each evidence statement, limitation, unmet-threshold statement, and comment brief, concrete, and textually grounded.",
        `Substantive transcript of the full match:\n${scoringTranscript}`
    ].join("\n\n");
}

function normalizeAiFinalJudgeScorecardResponse(rawJudge, judgeNumber) {
    const source = rawJudge && typeof rawJudge === "object" && !Array.isArray(rawJudge) ? rawJudge : null;
    const participantOneBreakdown = normalizeOfficialParticipantBreakdown(source?.participantOne);
    const participantTwoBreakdown = normalizeOfficialParticipantBreakdown(source?.participantTwo);
    if (!participantOneBreakdown || !participantTwoBreakdown) throw new Error(l(
        "AI judge returned a missing or invalid score-sheet threshold audit.",
        "Le juge IA a renvoyé une vérification des paliers manquante ou invalide."
    ));
    const comment = sanitizeText(source?.comment) || [participantOneBreakdown.comment, participantTwoBreakdown.comment].filter(Boolean).join(" ");
    if (!comment) throw new Error(l("AI judge did not return its overall tally comment.", "Le juge IA n’a pas renvoyé son commentaire global sur le pointage."));
    return {
        judgeNumber,
        name: judgeLabel(judgeNumber),
        humanScore: totalOfficialParticipantBreakdown(participantOneBreakdown),
        aiScore: totalOfficialParticipantBreakdown(participantTwoBreakdown),
        comment,
        humanComment: participantOneBreakdown.comment,
        aiComment: participantTwoBreakdown.comment,
        humanBreakdown: participantOneBreakdown,
        aiBreakdown: participantTwoBreakdown
    };
}

async function maybePrepareAiFinalJudgeScorecard(judgeNumber, expectedRunId = state.matchRunId) {
    const cached = state.aiFinalJudgeScorecards[judgeNumber];
    if (cached) return cached;
    if (state.aiFinalJudgeScoringPromises[judgeNumber]) return state.aiFinalJudgeScoringPromises[judgeNumber];
    let trackedPromise = null;
    trackedPromise = (async () => {
        try {
            const scoringTranscript = scoringTranscriptAsPlainText();
            if (!sanitizeText(scoringTranscript)) throw new Error(l("No substantive transcript is available for final AI judging.", "Aucune transcription substantielle n’est disponible pour le jugement final IA."));
            const prompt = buildAiSingleJudgeScoringPrompt(scoringTranscript);
            const parsed = await callAI({
                model: getJudgeModel(),
                systemPrompt: buildAiScoringSystemPrompt(),
                userPrompt: prompt,
                maxTokens: 6000,
                requestTimeoutMs: FINAL_SCORECARD_REQUEST_TIMEOUT_MS,
                reasoningEffort: JUDGE_REASONING_EFFORT,
                jsonSchema: FINAL_JUDGE_SCORECARD_JSON_SCHEMA
            });
            const card = normalizeAiFinalJudgeScorecardResponse(parsed, judgeNumber);
            if (expectedRunId !== state.matchRunId) return null;
            state.aiFinalJudgeScorecards[judgeNumber] = card;
            delete state.aiFinalJudgeScoringErrors[judgeNumber];
            return card;
        } catch (error) {
            if (expectedRunId === state.matchRunId) {
                state.aiFinalJudgeScoringErrors[judgeNumber] = error?.message || (isFrenchLocale()
                    ? `La génération de la fiche finale du ${judgeLabel(judgeNumber)} a échoué.`
                    : `Failed to generate Judge ${judgeNumber}'s final scorecard.`);
            }
            throw error;
        } finally {
            if (state.aiFinalJudgeScoringPromises[judgeNumber] === trackedPromise) delete state.aiFinalJudgeScoringPromises[judgeNumber];
        }
    })();
    state.aiFinalJudgeScoringPromises[judgeNumber] = trackedPromise;
    return trackedPromise;
}

async function maybePrepareAllAiFinalScorecards(expectedRunId = state.matchRunId) {
    const cards = await Promise.all([1, 2, 3].map((judgeNumber) => maybePrepareAiFinalJudgeScorecard(judgeNumber, expectedRunId)));
    if (expectedRunId !== state.matchRunId) return [];
    if (cards.length !== 3 || cards.some((card) => !card || card.humanScore == null || card.aiScore == null)) {
        throw new Error(l("AI judges returned incomplete scores.", "Les juges IA ont renvoyé des notes incomplètes."));
    }
    return cards;
}

function getFinalSubstantivePhase() {
    for (let index = state.phases.length - 1; index >= 0; index -= 1) {
        const phase = state.phases[index];
        if (["speech", "judgeQuestion", "judgeAnswer"].includes(phase?.kind)) return phase;
    }
    return null;
}

function primeAiFinalScoringAfterFinalTurn(phase) {
    if (!phase || state.judgeMode !== "ai" || state.completed) return;
    const finalSubstantivePhase = getFinalSubstantivePhase();
    if (!finalSubstantivePhase || finalSubstantivePhase.id !== phase.id) return;
    void maybePrepareAllAiFinalScorecards(state.matchRunId).catch((error) => {
        console.error("Early AI final score preparation failed:", error);
    });
}

function primeAiFinalScoringPreparationForPhase(phase) {
    if (!phase || state.judgeMode !== "ai") return;
    if (phase.kind === "scoring" && phase.caseNum === 2) {
        void maybePrepareAllAiFinalScorecards(state.matchRunId).catch((error) => {
            console.error("AI final score preparation failed:", error);
        });
    }
}

async function generateAiFinalScores() {
    const readyCount = [1, 2, 3].filter((judgeNumber) => !!state.aiFinalJudgeScorecards[judgeNumber]).length;
    const pendingCount = [1, 2, 3].filter((judgeNumber) => !!state.aiFinalJudgeScoringPromises[judgeNumber]).length;
    setBusy(true);
    setStatus(
        readyCount === 3
        ? l("Final AI judge scorecards are ready.", "Les fiches finales des juges IA sont prêtes.")
        : readyCount > 0 || pendingCount > 0
        ? l("Finishing final AI judge scorecards...", "Finalisation des fiches finales des juges IA...")
        : l("Generating final AI judge scorecards...", "Génération des fiches finales des juges IA...")
    );
    try {
        return await maybePrepareAllAiFinalScorecards(state.matchRunId);
    } finally {
        setBusy(false);
    }
}

function collectHumanJudgeScorecards() {
    return judgeInputs.map((judge) => {
        const humanScore = normalizeIntegerScore(judge.humanScore.value);
        const aiScore = normalizeIntegerScore(judge.aiScore.value);
        if (humanScore == null || aiScore == null) throw new Error(l("Every human judge score must be a whole number between 0 and 60.", "Chaque note de juge humain doit être un nombre entier entre 0 et 60."));
        return {
            judgeNumber: judge.number,
            name: sanitizeText(judge.name.value) || judgeLabel(judge.number),
            humanScore,
            aiScore,
            comment: sanitizeText(judge.comment.value)
        };
    });
}

function announceFinalResult(cards, sourceMode) {
    if (state.completed) return;
    const tally = computeVoteTally(cards);
    renderScorecards(cards, tally, sourceMode);
    let resultLine = isFrenchLocale() ? "le match se termine par une égalité." : "the match is a tie.";
    if (tally.result === "human") resultLine = isFrenchLocale() ? `la gagnante est ${speakerName("human")}.` : `the winning participant is ${speakerName("human")}.`;
    if (tally.result === "ai") resultLine = isFrenchLocale() ? `la gagnante est ${speakerName("ai")}.` : `the winning participant is ${speakerName("ai")}.`;
    appendMessage("moderator", moderatorLabel(), isFrenchLocale()
    ? `Merci aux deux participantes pour cette excellente ronde. Les juges ont terminé. ${resultLine} On applaudit les deux participantes.`
    : `Thank you to both participants for a great round. The judges have finished. ${resultLine} Let us have a round of applause for both participants.`,
    { caseNum: 0, phaseId: "closing" });
    setStatus(l("Match complete.", "Match terminé."));
    state.completed = true;
    state.phaseReady = false;
    clearPhaseAwaitingPlayback();
    stopTimer();
    updatePhaseHeader();
    refreshControls();
}

function collectSetupCredentialRequirements() {
    const requirements = new Map();
    const add = (provider, enReason, frReason) => {
        if (!provider) return;
        if (!requirements.has(provider)) requirements.set(provider, []);
        requirements.get(provider).push(l(enReason, frReason));
    };
    const participantTwoModel = normalizeMatchModel(modelSelectEl?.value);
    add(
        getModelProvider(participantTwoModel),
        `Participant 2 (${formatModelLabel(participantTwoModel, { includeProvider: false })})`,
        `participant 2 (${formatModelLabel(participantTwoModel, { includeProvider: false })})`
    );
    if (normalizeParticipantMode(participantOneTypeSelectEl?.value) === "ai") {
        const participantOneModel = normalizeMatchModel(participantOneModelSelectEl?.value);
        add(
            getModelProvider(participantOneModel),
            `Participant 1 (${formatModelLabel(participantOneModel, { includeProvider: false })})`,
            `participant 1 (${formatModelLabel(participantOneModel, { includeProvider: false })})`
        );
    }
    if (judgeModeSelectEl?.value === "ai") {
        add("openai", "AI judges", "les juges IA");
    }
    add("openai", "OpenAI read-aloud", "la lecture OpenAI");
    return requirements;
}

async function validateBeforeStart() {
    await refreshCredentialStatus({ force: true });
    const requirements = collectSetupCredentialRequirements();
    const missing = [...requirements.entries()].filter(([provider]) => !hasCredential(provider));
    if (missing.length) {
        openApiKeyDialog(missing[0][0]);
        const details = missing.map(([provider, reasons]) => `${providerLabel(provider)}: ${reasons.join(", ")}`).join("; ");
        throw new Error(l(
            `Configure the required provider credentials before starting (${details}).`,
            `Configurez les identifiants requis des fournisseurs avant de commencer (${details}).`
        ));
    }
    const case1 = readCase(1);
    const case2 = readCase(2);
    if (!case1.title || !case1.question || !case1.text) throw new Error(l("Case #1 needs a title, a moderator question, and case text.", "Le cas 1 a besoin d’un titre, d’une question du modérateur et du texte du cas."));
    if (!case2.title || !case2.question || !case2.text) throw new Error(l("Case #2 needs a title, a moderator question, and case text.", "Le cas 2 a besoin d’un titre, d’une question du modérateur et du texte du cas."));
    return { case1, case2 };
}

function scrollLiveVoicePreviewToBottom() {
    if (!liveVoicePreviewEl || liveVoiceWrapEl.hidden) return;
    window.requestAnimationFrame(() => {
        liveVoicePreviewEl.scrollTop = liveVoicePreviewEl.scrollHeight;
    });
}

function showLiveVoicePreview(text) {
    liveVoiceWrapEl.hidden = false;
    liveVoicePreviewEl.textContent = text || l("Listening...", "Écoute...");
    scrollLiveVoicePreviewToBottom();
}

function hideLiveVoicePreview() {
    liveVoiceWrapEl.hidden = true;
    liveVoicePreviewEl.textContent = "";
    liveVoicePreviewEl.scrollTop = 0;
}

function resetLiveSpeechState() {
    state.draftBeforeRecording = "";
    hideLiveVoicePreview();
}

function resetVoiceCaptureState() {
    state.voiceFinalizePending = false;
}

function getVoiceComposerPhaseContext() {
    return getPhaseById(state.pendingVoiceSubmission?.phaseId || "") || getCurrentPhase();
}

function getVoiceResultStatus({ pendingSubmitReason = "" } = {}) {
    const phase = getVoiceComposerPhaseContext();
    const isJudgeQuestion = isHumanJudgeQuestionPhase(phase);
    const reviewPhrase = isJudgeQuestion
    ? l("Review it and press Ask when ready.", "Relisez et cliquez sur Poser la question quand vous êtes prête.")
    : l("Review it and press Send when ready.", "Relisez et cliquez sur Soumettre quand vous êtes prête.");
    if (pendingSubmitReason === "timeout") {
        return isJudgeQuestion
        ? l("Time is up. Finalizing the transcript and asking the question.", "Le temps est écoulé. Finalisation de la transcription et envoi de la question.")
        : l("Time is up. Finalizing the transcript and submitting it.", "Le temps est écoulé. Finalisation de la transcription et soumission.");
    }
    if (pendingSubmitReason === "manual") {
        return isJudgeQuestion
        ? l("Finalizing the transcript and asking the question now.", "Finalisation de la transcription et envoi de la question.")
        : l("Finalizing the transcript and submitting now.", "Finalisation de la transcription et soumission.");
    }
    return isFrenchLocale() ? `Texte vocal inséré. ${reviewPhrase}` : `Voice text inserted. ${reviewPhrase}`;
}

function applyVoiceInputResult(voiceText, statusText, options = {}) {
    const combined = combineDraftAndSpeech(state.draftBeforeRecording, voiceText);
    const { isError = false } = options;
    messageInputEl.value = combined;
    syncActiveJudgeDraftFromMainComposer({ persist: true });
    setStatus(statusText, isError);
}

function hasUsableMediaStream(stream) {
    if (!stream || typeof stream.getAudioTracks !== "function") return false;
    const tracks = stream.getAudioTracks();
    if (!tracks.length) return false;
    return tracks.some((track) => track.readyState === "live");
}

function releaseMicrophoneStream() {
    if (!state.mediaStream) return;
    for (const track of state.mediaStream.getTracks()) {
        try { track.stop(); } catch {}
    }
    state.mediaStream = null;
}

async function ensureMicrophoneStream() {
    if (hasUsableMediaStream(state.mediaStream)) return state.mediaStream;
    releaseMicrophoneStream();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.mediaStream = stream;
    return stream;
}

function cleanupRecorderDevices() {
    state.mediaRecorder = null;
    state.audioChunks = [];
    refreshControls();
}

function stopRecordingAndFinalize(statusText = l("Stopping recording...", "Arrêt de l’enregistrement...")) {
    if (!state.isRecording || !state.mediaRecorder) return false;
    state.voiceFinalizePending = true;
    state.isRecording = false;
    refreshControls();
    try {
        if (state.mediaRecorder.state !== "inactive") state.mediaRecorder.stop();
    } catch {}
    setStatus(statusText);
    return true;
}

async function transcribeAudio(blob) {
    const requestId = ++state.finalTranscriptionRequestId;
    let finalText = "";
    let statusText = "";
    let isError = false;
    let restoreDraft = false;
    try {
        if (!blob || !blob.size) {
            restoreDraft = true;
            statusText = getPendingVoiceSubmissionReason() === "timeout" ? l("Time is up. No audio was captured.", "Le temps est écoulé. Aucun audio n’a été capté.") : l("No audio was captured.", "Aucun audio n’a été capté.");
            isError = true;
            return;
        }
        if (!hasCredential("openai")) {
            openApiKeyDialog("openai");
            restoreDraft = true;
            statusText = l("An OpenAI API key is required for speech-to-text.", "Une clé API OpenAI est requise pour la transcription vocale.");
            isError = true;
            return;
        }
        setBusy(true);
        setStatus(l("Finalizing transcript...", "Finalisation de la transcription..."));
        const mime = blob.type || "audio/webm";
        const extension = mime.includes("ogg") ? "ogg" : "webm";
        const bytes = await blobToByteArray(blob);
        if (requestId !== state.finalTranscriptionRequestId) return;
        const data = await getAudioBridge().transcribe({
            bytes,
            mimeType: mime,
            fileName: `recording.${extension}`,
            model: AUDIO_MODELS.finalTranscription,
            language: isFrenchLocale() ? "fr" : "en"
        });
        if (requestId !== state.finalTranscriptionRequestId) return;
        finalText = normalizeSpeechText(data?.text || "");
        if (!finalText) throw new Error(l("No speech was detected.", "Aucune parole n’a été détectée."));
        statusText = getVoiceResultStatus({ pendingSubmitReason: getPendingVoiceSubmissionReason() });
    } catch (error) {
        console.error("Transcription failed:", error);
        restoreDraft = true;
        statusText = safeBridgeErrorMessage(error) || l("Transcription failed.", "La transcription a échoué.");
        isError = true;
    } finally {
        if (finalText) {
            applyVoiceInputResult(finalText, statusText, { isError });
        } else if (restoreDraft) {
            messageInputEl.value = state.draftBeforeRecording;
            syncActiveJudgeDraftFromMainComposer({ persist: true });
            setStatus(statusText, isError);
        } else if (statusText) {
            setStatus(statusText, isError);
        }
        const shouldResolvePendingSubmission = !!state.pendingVoiceSubmission;
        resetLiveSpeechState();
        resetVoiceCaptureState();
        setBusy(false);
        refreshControls();
        if (shouldResolvePendingSubmission) resolvePendingVoiceSubmission();
        else messageInputEl.focus();
    }
}

async function toggleRecording() {
    const phase = getCurrentPhase();
    const composerActive = currentPhaseUsesMainComposer(phase);
    if (!composerActive && !state.isRecording) {
        setStatus(l("Voice input is only available during active human-controlled turns and active human judge question phases.", "La saisie vocale n’est disponible que pendant les tours humains actifs et les phases actives de question des juges humains."), true);
        return;
    }
    if ((state.busy || state.voiceFinalizePending) && !state.isRecording) return;

    if (state.isRecording && state.mediaRecorder) {
        stopRecordingAndFinalize(l("Stopping recording...", "Arrêt de l’enregistrement..."));
        return;
    }
    if (!navigator.mediaDevices || typeof MediaRecorder === "undefined") {
        setStatus(l("Audio recording is not supported in this browser.", "L’enregistrement audio n’est pas pris en charge dans ce navigateur."), true);
        return;
    }
    if (!hasCredential("openai")) {
        openApiKeyDialog("openai");
        setStatus(l("An OpenAI API key is required for speech-to-text.", "Une clé API OpenAI est requise pour la transcription vocale."), true);
        return;
    }
    try {
        stopSpeechPlayback(false);
        resetVoiceCaptureState();
        const stream = await ensureMicrophoneStream();
        const preferredMimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find((type) => {
            try { return MediaRecorder.isTypeSupported(type); } catch { return false; }
        });
        const recorder = preferredMimeType ? new MediaRecorder(stream, { mimeType: preferredMimeType }) : new MediaRecorder(stream);
        state.mediaRecorder = recorder;
        state.audioChunks = [];
        state.draftBeforeRecording = String(messageInputEl.value || "").trim();
        state.voiceFinalizePending = false;
        state.isRecording = true;
        showLiveVoicePreview(l("Recording audio...", "Enregistrement audio..."));
        refreshControls();

        recorder.ondataavailable = (event) => {
            if (event.data && event.data.size) state.audioChunks.push(event.data);
        };

            recorder.onerror = () => {
                state.isRecording = false;
                cleanupRecorderDevices();
                resetLiveSpeechState();
                resetVoiceCaptureState();
                clearPendingVoiceSubmission();
                releaseMicrophoneStream();
                setStatus(l("Recording failed.", "L’enregistrement a échoué."), true);
            };

            recorder.onstop = async () => {
                const blob = new Blob(state.audioChunks, { type: recorder.mimeType || "audio/webm" });
                cleanupRecorderDevices();
                await transcribeAudio(blob);
            };

            recorder.start(250);
            setStatus(l("Recording... OpenAI will transcribe once when you stop or submit.", "Enregistrement... OpenAI transcrira une seule fois à l’arrêt ou à la soumission."));
    } catch (error) {
        console.error("Microphone error:", error);
        state.isRecording = false;
        cleanupRecorderDevices();
        resetLiveSpeechState();
        resetVoiceCaptureState();
        clearPendingVoiceSubmission();
        releaseMicrophoneStream();
        setStatus(l("Microphone access failed or was denied.", "L’accès au microphone a échoué ou a été refusé."), true);
    }
}

function resetStateForNewMatch() {
    state.matchRunId += 1;
    state.finalTranscriptionRequestId += 1;
    stopSpeechPlayback(false, { resolveCallbacks: false });
    releaseMicrophoneStream();
    state.isRecording = false;
    state.voiceFinalizePending = false;
    clearPendingVoiceSubmission();

    state.transcript = [];
    state.phases = [];
    state.currentPhaseIndex = -1;
    state.busy = false;
    state.liveScreenActive = false;
    state.started = false;
    state.completed = false;
    state.waitingForCoinChoice = false;
    state.showCoinTossCeremony = false;
    state.coinTossAnimating = false;
    state.coinCall = "";
    state.coinResult = "";
    state.coinWinner = "";
    state.phaseReady = false;
    state.phaseAwaitingPlaybackForId = "";
    state.pendingAutoActionPhaseId = "";
    state.autoGenerationBlockedPhaseId = "";
    state.aiFinalJudgeScorecards = {};
    state.aiFinalJudgeScoringPromises = {};
    state.aiFinalJudgeScoringErrors = {};
    state.judgeQuestionCache = { 1: [], 2: [] };
    state.aiJudgeQuestionDraftCache = { 1: [], 2: [] };
    state.lastJudgeQuestionByCase = { 1: "", 2: "" };
    state.askedJudgeQuestions = {};
    state.aiJudgeQuestionDraftPromises = {};
    state.aiJudgeQuestionDraftErrors = {};
    state.aiJudgeQuestionPreparationPromises = {};
    state.aiJudgeQuestionPreparationErrors = {};
    state.aiPreparedTurns = {};
    state.aiPreparationSnapshots = {};
    state.aiPreparationPromises = {};
    state.aiPreparationErrors = {};
    state.mainComposerHydratedPhaseId = "";
    state.speechChunkCounts = new Map();
    state.speechStartCallbacks = new Map();
    state.speechCompletionCallbacks = new Map();
    state.wholeSpeechPreparations = new Map();
    state.wholeSpeechPendingTranscriptIndexes = new Set();
    state.timingTestMeasurements = new Map();
    state.timingTestResults = [];
    state.timingPreviewTranscriptIndex = -1;
    state.timingPreviewResolve = null;
    state.participantTypes = {
        human: normalizeParticipantMode(participantOneTypeSelectEl?.value || "human"),
        ai: "ai"
    };
    state.participantModels = {
        human: normalizeMatchModel(participantOneModelSelectEl?.value || DEFAULT_PARTICIPANT_MODEL),
        ai: normalizeMatchModel(modelSelectEl?.value || DEFAULT_PARTICIPANT_MODEL)
    };
    state.moderatorReadsFullCase = moderatorReadFullCaseSelectEl?.value === "yes";
    state.judgeModel = DEFAULT_JUDGE_MODEL;
    resetLiveSpeechState();
    resetVoiceCaptureState();
    stopTimer();
    renderTranscript();
    renderPhaseList();
    clearScoreboard();
    refreshTimingTestUi();
}

function fullReset() {
    resetStateForNewMatch();
    syncParticipantSetupUi();
    currentPhaseTitleEl.textContent = l("Setup", "Configuration");
    currentPhaseMetaEl.textContent = l("Enter two cases and start the match.", "Saisissez deux cas et démarrez le match.");
    timerDisplayEl.textContent = "--:--";
    timerHintEl.textContent = l("No active timed phase yet.", "Aucune phase minutée en cours.");
    coinChoicePanelEl.hidden = true;
    messageInputEl.value = "";
    hideLiveVoicePreview();
    setStatus(
        credentialState.loaded
        ? l("Ready.", "Prêt.")
        : l("Checking AI provider credentials...", "Vérification des identifiants des fournisseurs IA...")
    );
    refreshControls();
}

function applyCaseOneChoice(decidingRole, choice) {
    const normalizedChoice = choice === "pass" ? "pass" : "lead";
    const case1Leader = normalizedChoice === "lead" ? decidingRole : otherRole(decidingRole);
    state.leadByCase[1] = case1Leader;
    state.leadByCase[2] = otherRole(case1Leader);
    appendMessage("moderator", moderatorLabel(),
                  isFrenchLocale()
                  ? `${speakerName(decidingRole)} choisit de ${normalizedChoice === "lead" ? "mener" : "passer"} au cas 1. ${speakerName(state.leadByCase[1])} mènera le cas 1 et ${speakerName(state.leadByCase[2])} mènera le cas 2.`
                  : `${speakerName(decidingRole)} chooses to ${normalizedChoice} on Case #1. ${speakerName(state.leadByCase[1])} will lead Case #1, and ${speakerName(state.leadByCase[2])} will lead Case #2.`
    );
}

async function startMatch() {
    try {
        const { case1, case2 } = await validateBeforeStart();
        resetStateForNewMatch();
        const participantOneMode = normalizeParticipantMode(participantOneTypeSelectEl.value);
        state.participantTypes.human = participantOneMode;
        state.participantTypes.ai = "ai";
        state.participantModels.human = normalizeMatchModel(participantOneModelSelectEl.value);
        state.participantModels.ai = normalizeMatchModel(modelSelectEl.value);
        state.names.human = sanitizeText(humanNameInputEl.value) || getDefaultParticipantOneName(participantOneMode);
        state.names.ai = sanitizeText(aiNameInputEl.value) || getDefaultParticipantTwoName(participantOneMode);
        state.cases[1] = case1;
        state.cases[2] = case2;
        state.judgeMode = judgeModeSelectEl.value;
        state.liveScreenActive = true;
        renderMatchCaseReference();
        updateMatchSummaryPlaceholder();
        updatePhaseHeader();
        refreshControls();

        appendMessage("moderator", moderatorLabel(), l(
            `Welcome to this Ethics Bowl-style match between ${state.names.human} and ${state.names.ai}. This site uses the official two-case structure, adapted for two single participants.`,
            `Bienvenue à ce match de la Coupe éthique Canada entre ${state.names.human} et ${state.names.ai}. Ce site utilise la structure officielle à deux cas, adaptée à deux participantes individuelles.`
        ));

        appendMessage("moderator", moderatorLabel(), l(
            "The coin-toss winner chooses whether to lead or pass on Case #1, the other participant leads Case #2, there is a judges' period after each case, and both participants are questioned once during their led case.",
            "La gagnante du tirage choisit si elle mène ou passe au cas 1, l’autre participante mène le cas 2, il y a une période des juges après chaque cas, et chaque participante reçoit une question pendant le cas qu’elle mène."
        ));

        const coinCall = coinCallSelectEl.value;
        const coinResult = Math.random() < 0.5 ? "heads" : "tails";
        const winner = coinCall === coinResult ? "human" : "ai";

        await appendMessageAndWaitForPlayback(
            "moderator",
            moderatorLabel(),
            l(
                `I will now flip a coin. ${speakerName("human")}, what is your call?`,
                `Je vais maintenant lancer une pièce. ${speakerName("human")}, quel est votre choix?`
            ),
            {
                onPlaybackStart: () => {
                    state.showCoinTossCeremony = true;
                    refreshControls();
                }
            }
        );
        await appendMessageAndWaitForPlayback(
            messageKindForRole("human"),
            speakerName("human"),
            titleCase(coinSideLabel(coinCall)),
            { voiceKey: messageKindForRole("human") }
        );
        const animationCompleted = await playCoinTossAnimation(coinCall, coinResult, winner);
        if (!animationCompleted) return;

        appendMessage("moderator", moderatorLabel(), isFrenchLocale()
            ? `${speakerName("human")} a choisi ${coinSideLabel(coinCall)}. Le résultat est ${coinSideLabel(coinResult)}. ${speakerName(winner)} gagne le tirage.`
            : `${speakerName("human")} called ${coinSideLabel(coinCall)}. The coin is ${coinSideLabel(coinResult)}. ${speakerName(winner)} wins the toss.`
        );

        if (winner === "human" && isHumanControlledRole("human")) {
            state.waitingForCoinChoice = true;
            coinChoicePanelEl.hidden = false;
            setStatus(l("Participant 1 won the coin toss. Choose whether Participant 1 will lead or pass on Case #1.", "Le participant 1 a gagné le tirage. Choisissez s’il mènera ou passera au cas 1."));
            refreshControls();
            return;
        }

        const autoChoice = Math.random() < 0.5 ? "lead" : "pass";
        applyCaseOneChoice(winner, autoChoice);
        beginStructuredMatch();
    } catch (error) {
        setStatus(error?.message || l("Could not start the match.", "Impossible de démarrer le match."), true);
    }
}

function handleHumanCoinChoice(choice) {
    if (!state.waitingForCoinChoice) return;
    state.waitingForCoinChoice = false;
    coinChoicePanelEl.hidden = true;
    applyCaseOneChoice("human", choice);
    beginStructuredMatch();
}

function beginStructuredMatch() {
    state.started = true;
    state.phases = buildPhases();
    state.currentPhaseIndex = -1;
    state.phaseReady = false;
    state.phaseAwaitingPlaybackForId = "";
    state.pendingAutoActionPhaseId = "";
    state.autoGenerationBlockedPhaseId = "";
    state.mainComposerHydratedPhaseId = "";
    updateMatchSummaryPlaceholder();
    renderPhaseList();
    updatePhaseHeader();
    refreshControls();
    advancePhase();
}

function phaseAnnouncementText(phase) {
    if (!phase) return "";
    if (phase.kind === "moderatorCase") {
        const caseData = state.cases[phase.caseNum];
        const leader = speakerName(state.leadByCase[phase.caseNum]);
        const responder = speakerName(otherRole(state.leadByCase[phase.caseNum]));
        const moderatorQuestion = ensureSentenceEnding(caseData.question, "?");
        if (state.moderatorReadsFullCase) {
            const fullCaseText = ensureSentenceEnding(caseData.text);
            return isFrenchLocale()
            ? `Nous sommes maintenant prêtes à commencer le ${caseLabel(phase.caseNum)}. Le cas s’intitule « ${caseData.title} ». Je vais maintenant lire le cas au complet. ${fullCaseText} La question est : ${moderatorQuestion} ${leader} mènera ce cas et ${responder} répondra.`
            : `We are ready to begin Case #${phase.caseNum}. The case is "${caseData.title}". I will now read the full case. ${fullCaseText} The question is: ${moderatorQuestion} ${leader} will lead this case, and ${responder} will respond.`;
        }
        return isFrenchLocale()
        ? `Nous sommes maintenant prêtes à commencer le ${caseLabel(phase.caseNum)}. Le cas s’intitule « ${caseData.title} ». La question est : ${moderatorQuestion} ${leader} mènera ce cas et ${responder} répondra.`
        : `We are ready to begin Case #${phase.caseNum}. The case is "${caseData.title}". The question is: ${moderatorQuestion} ${leader} will lead this case, and ${responder} will respond.`;
    }
    if (phase.kind === "confer") {
        const subtype = phase.subtype === "presentation" ? l("presentation", "présentation") : phase.subtype === "commentary" ? l("commentary", "commentaire") : l("response", "réplique");
        return isFrenchLocale()
        ? `${speakerName(phase.speaker)}, vous avez maintenant jusqu’à ${formatDurationNatural(phase.duration)} pour vous concerter avant votre ${subtype}. L’autre participante doit rester silencieuse.`
        : `${speakerName(phase.speaker)}, you now have up to ${formatDurationNatural(phase.duration)} to confer before your ${phase.subtype}. The other participant must remain silent.`;
    }
    if (phase.kind === "speech") {
        if (phase.subtype === "presentation") return isFrenchLocale()
            ? `${speakerName(phase.speaker)}, vous avez maintenant jusqu’à ${formatDurationNatural(phase.duration)} pour faire votre présentation.`
            : `${speakerName(phase.speaker)}, you now have up to ${formatDurationNatural(phase.duration)} to make your presentation.`;
        if (phase.subtype === "commentary") return isFrenchLocale()
            ? `${speakerName(phase.speaker)}, vous avez maintenant jusqu’à ${formatDurationNatural(phase.duration)} pour commenter la présentation.`
            : `${speakerName(phase.speaker)}, you now have up to ${formatDurationNatural(phase.duration)} to comment on the presentation.`;
        return isFrenchLocale()
        ? `${speakerName(phase.speaker)}, vous avez maintenant jusqu’à ${formatDurationNatural(phase.duration)} pour répliquer.`
        : `${speakerName(phase.speaker)}, you now have up to ${formatDurationNatural(phase.duration)} to respond.`;
    }
    if (phase.kind === "judgeQuestion") {
        return isFrenchLocale()
        ? `${judgeLabel(phase.judgeNumber)} peut maintenant poser une question concise à ${speakerName(phase.answerer)}. Le temps pour la question est limité à ${formatDurationNatural(phase.duration)}.`
        : `${judgeLabel(phase.judgeNumber)} may now ask a concise question to ${speakerName(phase.answerer)}. Question time is capped at ${formatDurationNatural(phase.duration)}.`;
    }
    if (phase.kind === "judgeAnswer") {
        return isFrenchLocale()
        ? `${speakerName(phase.speaker)}, vous avez maintenant jusqu’à ${formatDurationNatural(phase.duration)} pour répondre au ${judgeLabel(phase.judgeNumber)}.`
        : `${speakerName(phase.speaker)}, you now have up to ${formatDurationNatural(phase.duration)} to answer ${judgeLabel(phase.judgeNumber)}.`;
    }
    if (phase.kind === "scoring") {
        return isFrenchLocale()
        ? `Juges, veuillez maintenant attribuer le pointage du ${caseLabel(phase.caseNum)}.`
        : `Judges, please score Case #${phase.caseNum} now.`;
    }
    if (phase.kind === "closing") {
        return isFrenchLocale()
        ? "Phase de clôture. Les juges vont finaliser leurs fiches de pointage et le modérateur annoncera la gagnante ou l’égalité."
        : "Closing phase. The judges will finalize their score sheets, and the moderator will announce the winner or whether the match is a tie.";
    }
    return "";
}

function shouldAutoGenerate(phase) {
    if (!phase || !state.phaseReady || state.busy || state.isRecording || state.voiceFinalizePending) return false;
    if (isCurrentPhaseAwaitingPlayback(phase)) return false;
    if (phase.kind === "confer" && isAiControlledRole(phase.speaker)) return true;
    if (phase.kind === "speech" && isAiControlledRole(phase.speaker)) return true;
    if (phase.kind === "judgeQuestion" && state.judgeMode === "ai") return true;
    if (phase.kind === "judgeAnswer" && isAiControlledRole(phase.speaker)) return true;
    return false;
}

function activatePhaseAfterModerator(phaseId) {
    const phase = getCurrentPhase();
    if (!phase || phase.id !== phaseId || state.completed) return;
    state.phaseReady = true;
    revealTranscriptMessagesForPhase(phaseId);
    if (phase.duration) {
        if (phaseTimerStartsWithAutoSpeech(phase)) prepareTimerForAutoSpeech(phase);
        else setTimerForPhase(phase);
    } else {
        timerDisplayEl.textContent = "--:--";
        if (phase.kind === "closing") {
            timerHintEl.textContent = state.judgeMode === "ai"
            ? l("Generating the final decision automatically.", "Génération automatique de la décision finale.")
            : l("Enter the final human-judge scores when ready.", "Entrez les notes finales des juges humains quand vous êtes prête.");
        } else {
            timerHintEl.textContent = l("No active timed phase.", "Aucune phase minutée active.");
        }
    }
    updatePhaseHeader();
    refreshControls();
    primeAiPreparationForPhase(phase);
    if (phase.kind === "moderatorCase" || phase.kind === "scoring") {
        schedulePhaseAdvance(phaseId);
        return;
    }
    maybeAutoTriggerCurrentPhase();
}

function enterCurrentPhase() {
    const phase = getCurrentPhase();
    if (!phase) return;
    state.phaseReady = false;
    clearPhaseAwaitingPlayback();
    state.pendingAutoActionPhaseId = "";
    clearAutoGenerationBlock();
    state.mainComposerHydratedPhaseId = "";
    updatePhaseHeader();
    renderPhaseList();
    prepareTimerForPhaseAnnouncement(phase);
    refreshControls();
    primeAiJudgeQuestionPreparationForPhase(phase);
    primeCurrentAiJudgeQuestionRevision(phase);
    primeAiFinalScoringPreparationForPhase(phase);
    appendMessage("moderator", moderatorLabel(), phaseAnnouncementText(phase), {
        caseNum: phase.caseNum || 0,
            phaseId: phase.id,
            onPlaybackStart: () => {
                primeAiSpeechPlaybackDuringModerator(phase);
            },
            onPlaybackComplete: () => {
                if (phase.kind === "moderatorCase" && state.currentPhaseIndex === 0) {
                    state.showCoinTossCeremony = false;
                    refreshControls();
                }
                activatePhaseAfterModerator(phase.id);
            }
    });
}

function advancePhase() {
    if (state.completed || timingTestResultLimitReached()) return;
    if (state.currentPhaseIndex + 1 >= state.phases.length) return;
    clearPhaseAwaitingPlayback();
    state.pendingAutoActionPhaseId = "";
    state.mainComposerHydratedPhaseId = "";
    state.currentPhaseIndex += 1;
    enterCurrentPhase();
}

function currentPhaseRequiresHumanSubmission(phase) {
    return state.phaseReady && isHumanSubmissionPhase(phase);
}

function refreshJudgeStatuses() {
    judgeInputs.forEach((judge) => {
        judge.status.textContent = l("Idle", "En attente");
        judge.status.className = "status-chip subtle";
    });
    const phase = getCurrentPhase();
    if (!phase || state.judgeMode !== "human") return;
    if (phase.kind === "judgeQuestion") {
        const active = judgeInputs.find((judge) => judge.number === phase.judgeNumber);
        if (active) {
            active.status.textContent = state.phaseReady
            ? l("Active • Ask in main box", "Actif • Posez dans la boîte principale")
            : isFrenchLocale() ? `En attente • ${caseLabel(phase.caseNum)}` : `Queued • ${caseLabel(phase.caseNum)}`;
            active.status.className = "status-chip active";
        }
    }
}

function updateComposerPlaceholder() {
    const phase = getCurrentPhase();
    if (!phase) {
        messageInputEl.placeholder = l("When it is your turn, type here.", "Quand ce sera votre tour, écrivez ici.");
        return;
    }
    if (!state.phaseReady) {
        if (isHumanSubmissionPhase(phase)) {
            messageInputEl.placeholder = l("Wait for the moderator to finish speaking before entering your turn.", "Attendez que le modérateur ait fini de parler avant d’entrer votre tour.");
            return;
        }
        if (isHumanJudgeQuestionPhase(phase)) {
            messageInputEl.placeholder = l("Wait for the moderator to finish speaking. The active judge's draft will appear here.", "Attendez que le modérateur ait fini de parler. Le brouillon du juge actif apparaîtra ici.");
            return;
        }
        messageInputEl.placeholder = l("Text and voice inputs become active during human-controlled turns and human judge question phases.", "Les saisies texte et vocales deviennent actives pendant les tours humains et les phases de question des juges humains.");
        return;
    }
    if (phase.kind === "speech" && isHumanControlledRole(phase.speaker)) {
        if (phase.subtype === "presentation") {
            messageInputEl.placeholder = isFrenchLocale()
            ? `Tapez ici la présentation de ${speakerName("human")} pour le ${caseLabel(phase.caseNum)}, ou utilisez la saisie vocale.`
            : `Type ${speakerName("human")}'s ${caseLabel(phase.caseNum)} presentation here, or use voice input.`;
            return;
        }
        if (phase.subtype === "commentary") {
            messageInputEl.placeholder = isFrenchLocale()
            ? `Tapez ici le commentaire de ${speakerName("human")} pour le ${caseLabel(phase.caseNum)}, ou utilisez la saisie vocale.`
            : `Type ${speakerName("human")}'s ${caseLabel(phase.caseNum)} commentary here, or use voice input.`;
            return;
        }
        messageInputEl.placeholder = isFrenchLocale()
        ? `Tapez ici la réplique de ${speakerName("human")} pour le ${caseLabel(phase.caseNum)}, ou utilisez la saisie vocale.`
        : `Type ${speakerName("human")}'s ${caseLabel(phase.caseNum)} response here, or use voice input.`;
        return;
    }
    if (phase.kind === "judgeAnswer" && isHumanControlledRole(phase.speaker)) {
        messageInputEl.placeholder = isFrenchLocale()
        ? `Tapez ici la réponse de ${speakerName("human")} au ${judgeLabel(phase.judgeNumber)}, ou utilisez la saisie vocale.`
        : `Type ${speakerName("human")}'s answer to ${judgeLabel(phase.judgeNumber)} here, or use voice input.`;
        return;
    }
    if (isHumanJudgeQuestionPhase(phase)) {
        messageInputEl.placeholder = isFrenchLocale()
        ? `${getActiveHumanJudgeName(phase)} doit taper ou dicter la question ici.`
        : `${getActiveHumanJudgeName(phase)} should type or dictate the question here.`;
        return;
    }
    messageInputEl.placeholder = l("Text and voice inputs become active during human-controlled turns and human judge question phases.", "Les saisies texte et vocales deviennent actives pendant les tours humains et les phases de question des juges humains.");
}

function getAllAiMatchActivityStatus(phase = getCurrentPhase()) {
    if (state.coinTossAnimating) return l("Automated coin toss in progress...", "Tirage automatisé en cours...");
    if (!phase) return l("Starting the automated match...", "Démarrage du match automatisé...");
    if (!state.phaseReady) {
        return isFrenchLocale()
            ? `Transition automatisée vers ${phase.title}...`
            : `Automated transition to ${phase.title}...`;
    }
    if (isCurrentPhaseAwaitingPlayback(phase)) {
        return isFrenchLocale()
            ? `${phase.title} : traitement de la prise de parole minutée...`
            : `${phase.title}: processing the timed speech...`;
    }
    if (phase.kind === "confer") {
        return isFrenchLocale()
            ? `${speakerName(phase.speaker)} prépare son ${phaseSubtypeLabel(phase.subtype).toLowerCase()}...`
            : `${speakerName(phase.speaker)} is preparing the ${phase.subtype || "speech"}...`;
    }
    if (phase.kind === "speech") {
        return isFrenchLocale()
            ? `${speakerName(phase.speaker)} effectue automatiquement son ${phaseSubtypeLabel(phase.subtype).toLowerCase()}...`
            : `${speakerName(phase.speaker)} is running the ${phase.subtype || "speech"} automatically...`;
    }
    if (phase.kind === "judgeQuestion") {
        return isFrenchLocale()
            ? `${judgeLabel(phase.judgeNumber)} prépare une question...`
            : `${judgeLabel(phase.judgeNumber)} is preparing a question...`;
    }
    if (phase.kind === "judgeAnswer") {
        return isFrenchLocale()
            ? `${speakerName(phase.speaker)} prépare une réponse au ${judgeLabel(phase.judgeNumber)}...`
            : `${speakerName(phase.speaker)} is preparing an answer to ${judgeLabel(phase.judgeNumber)}...`;
    }
    if (phase.kind === "scoring") return l("AI judges are scoring the case...", "Les juges IA évaluent le cas...");
    if (phase.kind === "closing") return l("AI judges are finalizing the decision...", "Les juges IA finalisent la décision...");
    return isFrenchLocale()
        ? `Exécution automatisée de ${phase.title}...`
        : `Running ${phase.title} automatically...`;
}

function replaceGenericReadyStatusForAllAiMatch() {
    const isAllAiMatch = state.started
        && !state.completed
        && isAiControlledRole("human")
        && isAiControlledRole("ai")
        && state.judgeMode === "ai";
    if (!isAllAiMatch) return;
    if (sanitizeText(statusLineEl.textContent) !== l("Ready.", "Prêt.")) return;
    setStatus(getAllAiMatchActivityStatus());
}

function refreshControls() {
    ensureSpeechUi();
    updateApiKeyUi();
    syncParticipantSetupUi();
    refreshParticipantScoreLabels();
    syncScreenVisibility();
    renderMatchSetupSummary();
    renderMatchCaseReference();
    syncCoinTossUi();
    const phase = getCurrentPhase();
    const composerActive = currentPhaseUsesMainComposer(phase);
    const humanTurn = currentPhaseRequiresHumanSubmission(phase);
    const judgeQuestionComposerActive = phase && state.phaseReady && isHumanJudgeQuestionPhase(phase);
    const waitingForPlayback = isCurrentPhaseAwaitingPlayback(phase);
    const locked = state.busy || state.isRecording || state.voiceFinalizePending || waitingForPlayback || state.coinTossAnimating;
    const submitLocked = state.completed || state.busy || state.voiceFinalizePending || waitingForPlayback || state.coinTossAnimating;

    [
        participantOneTypeSelectEl, participantOneModelSelectEl, humanNameInputEl, aiNameInputEl, coinCallSelectEl,
        judgeModeSelectEl, voiceModeSelectEl, moderatorReadFullCaseSelectEl, modelSelectEl, case1TitleInputEl, case1QuestionInputEl, case1TextInputEl,
        case2TitleInputEl, case2QuestionInputEl, case2TextInputEl
    ].forEach((el) => {
        if (!el) return;
        el.disabled = state.started || state.waitingForCoinChoice || locked;
    });

    startMatchBtnEl.disabled = !hasDesktopBridge() || !!credentialState.pendingProvider || state.started || state.waitingForCoinChoice || locked;
    resetMatchBtnEl.disabled = locked;
    if (newMatchBtnEl) newMatchBtnEl.disabled = locked;

    coinChoicePanelEl.hidden = !state.waitingForCoinChoice;
    leadBtnEl.disabled = !state.waitingForCoinChoice || locked;
    passBtnEl.disabled = !state.waitingForCoinChoice || locked;

    hydrateMainComposerFromActiveJudgeDraftIfNeeded();

    messageInputEl.disabled = !composerActive || state.completed || state.busy;
    messageInputEl.readOnly = state.isRecording || state.voiceFinalizePending || state.busy || !composerActive || state.completed;
    submitTurnBtnEl.disabled = !composerActive || submitLocked;

    if (judgeQuestionComposerActive) {
        submitTurnBtnEl.textContent = state.isRecording
        ? isFrenchLocale() ? `Arrêter et poser la question du ${judgeLabel(phase.judgeNumber)}` : `Stop & Ask ${judgeLabel(phase.judgeNumber)} Question`
        : isFrenchLocale() ? `Poser la question du ${judgeLabel(phase.judgeNumber)}` : `Ask ${judgeLabel(phase.judgeNumber)} Question`;
    } else {
        submitTurnBtnEl.textContent = state.isRecording && humanTurn
        ? l("Stop & Submit Turn", "Arrêter et soumettre")
        : l("Submit Turn", "Soumettre le tour");
    }

    micBtnEl.disabled = ((!composerActive || state.completed) && !state.isRecording) || ((state.busy || state.voiceFinalizePending) && !state.isRecording);
    micBtnEl.textContent = state.isRecording ? l("■ Stop Recording", "■ Arrêter l’enregistrement") : l("● Record Voice", "● Enregistrer la voix");
    micBtnEl.classList.toggle("recording", state.isRecording);

    const hasTimedPhase = !!phase?.duration;
    const timerExists = !!state.timer.intervalId;
    const aiVsAiMatch = isAiControlledRole("human") && isAiControlledRole("ai");
    if (timerControlButtonsEl) {
        timerControlButtonsEl.hidden = aiVsAiMatch;
        timerControlButtonsEl.style.display = aiVsAiMatch ? "none" : "";
    }
    pauseTimerBtnEl.disabled = aiVsAiMatch || !hasTimedPhase || !state.phaseReady || !timerExists || !state.timer.running;
    resumeTimerBtnEl.disabled = aiVsAiMatch || !hasTimedPhase || !state.phaseReady || !timerExists || state.timer.running || state.timer.remaining <= 0;
    resetTimerBtnEl.disabled = aiVsAiMatch || !hasTimedPhase || !state.phaseReady;

    if (state.coinTossAnimating) {
        nextActionBtnEl.textContent = l("Coin Toss Running", "Tirage en cours");
        nextActionBtnEl.disabled = true;
    } else if (state.waitingForCoinChoice) {
        nextActionBtnEl.textContent = l("Waiting for Coin Toss Choice", "En attente du choix après le tirage");
        nextActionBtnEl.disabled = true;
    } else if (!state.started) {
        nextActionBtnEl.textContent = l("Advance / Generate", "Avancer / Générer");
        nextActionBtnEl.disabled = true;
    } else if (state.completed) {
        nextActionBtnEl.textContent = l("Match Complete", "Match terminé");
        nextActionBtnEl.disabled = true;
    } else if (!phase) {
        nextActionBtnEl.textContent = l("Advance", "Avancer");
        nextActionBtnEl.disabled = false;
    } else if (!state.phaseReady) {
        nextActionBtnEl.textContent = l("Moderator Speaking...", "Le modérateur parle...");
        nextActionBtnEl.disabled = true;
    } else if (locked) {
        nextActionBtnEl.textContent = waitingForPlayback ? l("Waiting for Read-Aloud", "En attente de la lecture") : l("Waiting", "En attente");
        nextActionBtnEl.disabled = true;
    } else if (phase.kind === "moderatorCase") {
        nextActionBtnEl.textContent = l("Advance", "Avancer");
        nextActionBtnEl.disabled = false;
    } else if (phase.kind === "confer" && isAiControlledRole(phase.speaker)) {
        nextActionBtnEl.textContent = l("Run AI Confer", "Lancer le caucus IA");
        nextActionBtnEl.disabled = false;
    } else if (phase.kind === "confer") {
        nextActionBtnEl.textContent = l("Advance", "Avancer");
        nextActionBtnEl.disabled = false;
    } else if (phase.kind === "speech" && isAiControlledRole(phase.speaker)) {
        nextActionBtnEl.textContent = getPreparedAiTurnText(phase.id)
        ? l("Read Prepared AI Turn", "Lire le tour IA préparé")
        : l("Generate AI Turn", "Générer le tour IA");
        nextActionBtnEl.disabled = false;
    } else if (phase.kind === "speech" && isHumanControlledRole(phase.speaker)) {
        nextActionBtnEl.textContent = l("Waiting for Human Turn", "En attente du tour humain");
        nextActionBtnEl.disabled = true;
    } else if (phase.kind === "judgeQuestion" && state.judgeMode === "ai") {
        nextActionBtnEl.textContent = isFrenchLocale() ? `Poser la question du ${judgeLabel(phase.judgeNumber)}` : `Ask ${judgeLabel(phase.judgeNumber)} Question`;
        nextActionBtnEl.disabled = false;
    } else if (phase.kind === "judgeQuestion" && state.judgeMode === "human") {
        nextActionBtnEl.textContent = isFrenchLocale() ? `En attente du ${judgeLabel(phase.judgeNumber)}` : `Waiting for ${judgeLabel(phase.judgeNumber)}`;
        nextActionBtnEl.disabled = true;
    } else if (phase.kind === "judgeAnswer" && isAiControlledRole(phase.speaker)) {
        nextActionBtnEl.textContent = getPreparedAiTurnText(phase.id)
        ? l("Read Prepared AI Answer", "Lire la réponse IA préparée")
        : l("Generate AI Answer", "Générer la réponse IA");
        nextActionBtnEl.disabled = false;
    } else if (phase.kind === "judgeAnswer" && isHumanControlledRole(phase.speaker)) {
        nextActionBtnEl.textContent = l("Waiting for Human Answer", "En attente de la réponse humaine");
        nextActionBtnEl.disabled = true;
    } else if (phase.kind === "scoring") {
        nextActionBtnEl.textContent = phase.caseNum === 1 ? l("Proceed to Case #2", "Passer au cas 2") : l("Proceed to Closing", "Passer à la clôture");
        nextActionBtnEl.disabled = false;
    } else if (phase.kind === "closing") {
        nextActionBtnEl.textContent = state.judgeMode === "ai"
        ? l("Generate Final Decision", "Générer la décision finale")
        : l("Compute Human-Judge Result", "Calculer le résultat des juges humains");
        nextActionBtnEl.disabled = false;
    }

    aiJudgePanelEl.hidden = judgeModeSelectEl.value !== "ai";
    humanJudgePanelEl.hidden = judgeModeSelectEl.value !== "human";

    document.querySelectorAll(".ask-judge-btn").forEach((button) => {
        const judgeNumber = Number(button.dataset.judge);
        const active = !state.busy && !state.voiceFinalizePending && state.started && !state.completed && state.phaseReady && phase?.kind === "judgeQuestion" && state.judgeMode === "human" && phase.judgeNumber === judgeNumber;
        button.disabled = !active;
        button.textContent = isFrenchLocale() ? `Poser la question du ${judgeLabel(judgeNumber)}` : `Ask ${judgeLabel(judgeNumber)} Question`;
    });

    computeHumanResultBtnEl.disabled = judgeModeSelectEl.value !== "human" || state.busy || state.isRecording || state.voiceFinalizePending || state.coinTossAnimating;

    updateComposerPlaceholder();
    refreshJudgeStatuses();
    updateComposerModeIndicator();
    refreshSpeechUi();
    replaceGenericReadyStatusForAllAiMatch();
}

async function handleNextAction() {
    if (state.busy || state.isRecording || state.voiceFinalizePending || state.completed) return;
    const phase = getCurrentPhase();
    if (!phase || !state.phaseReady) return;
    if (state.pendingAutoActionPhaseId === phase.id) state.pendingAutoActionPhaseId = "";
    if (phase.kind === "confer" && isAiControlledRole(phase.speaker)) { await handleAiConferPhase(phase); return; }
    if (phase.kind === "moderatorCase" || phase.kind === "confer" || phase.kind === "scoring") { advancePhase(); return; }
    if (phase.kind === "speech" && isAiControlledRole(phase.speaker)) { await generateAiTurnForPhase(phase); return; }
    if (phase.kind === "judgeQuestion" && state.judgeMode === "ai") { await askAiJudgeQuestion(phase); return; }
    if (phase.kind === "judgeAnswer" && isAiControlledRole(phase.speaker)) { await generateAiTurnForPhase(phase); return; }
    if (phase.kind === "closing") {
        if (state.judgeMode === "ai") {
            try {
                const cards = await generateAiFinalScores();
                announceFinalResult(cards, "ai");
            } catch (error) {
                console.error(error);
                blockAutoGenerationForPhase(phase.id);
                setStatus(error?.message || l("Failed to compute final AI-judge result.", "Le calcul du résultat final des juges IA a échoué."), true);
            }
            return;
        }
        try {
            const cards = collectHumanJudgeScorecards();
            announceFinalResult(cards, "human");
        } catch (error) {
            setStatus(error?.message || l("Could not compute the human-judge result.", "Impossible de calculer le résultat des juges humains."), true);
        }
    }
}

function submitComposerAction() {
    if (state.busy || state.voiceFinalizePending || state.completed) return;
    const phase = getCurrentPhase();
    if (!currentPhaseUsesMainComposer(phase)) return;
    if (state.isRecording) {
        setPendingVoiceSubmission("manual", phase.id);
        if (!stopRecordingAndFinalize(getStopRecordingAndSubmitStatusText(phase))) resolvePendingVoiceSubmission();
        return;
    }
    const text = getComposerDraftTextForPhase(phase);
    if (!text) {
        setStatus(getEmptyComposerErrorMessage(phase), true);
        return;
    }
    const didCommit = commitMainComposerSubmission(phase, text);
    if (!didCommit) {
        setStatus(getEmptyComposerErrorMessage(phase), true);
        return;
    }
    if (isHumanJudgeQuestionPhase(phase)) setStatus(l("Judge question submitted.", "Question du juge soumise."));
    else setStatus(`${speakerName("human")} ${l("submitted the current turn.", "a soumis le tour actuel.")}`);
    advancePhase();
}

function askHumanJudgeQuestion(judgeNumber) {
    if (state.busy || state.voiceFinalizePending || state.completed) return;
    const phase = getCurrentPhase();
    if (!phase || !state.phaseReady || phase.kind !== "judgeQuestion" || state.judgeMode !== "human" || phase.judgeNumber !== judgeNumber) {
        setStatus(isFrenchLocale() ? `Ce n’est pas le tour de question du ${judgeLabel(judgeNumber)} en ce moment.` : `It is not ${judgeLabel(judgeNumber)}'s question turn right now.`, true);
        return;
    }
    if (state.isRecording) {
        setPendingVoiceSubmission("manual", phase.id);
        if (!stopRecordingAndFinalize(getStopRecordingAndSubmitStatusText(phase))) resolvePendingVoiceSubmission();
        return;
    }
    const judge = judgeInputs.find((item) => item.number === judgeNumber);
    if (!judge) return;
    const text = sanitizeText(messageInputEl.value || judge.question.value);
    if (!text) {
        setStatus(isFrenchLocale() ? `Entrez la question de ${getActiveHumanJudgeName(phase)} avant de la poser.` : `Enter ${getActiveHumanJudgeName(phase)}'s question before asking it.`, true);
        return;
    }
    const didCommit = appendHumanJudgeQuestionMessage(phase, text);
    if (!didCommit) {
        setStatus(isFrenchLocale() ? `Entrez la question de ${getActiveHumanJudgeName(phase)} avant de la poser.` : `Enter ${getActiveHumanJudgeName(phase)}'s question before asking it.`, true);
        return;
    }
    setStatus(isFrenchLocale() ? `${getActiveHumanJudgeName(phase)} a posé une question.` : `${getActiveHumanJudgeName(phase)} asked a question.`);
    advancePhase();
}

function applyLocaleToUi() {
    activeLocale = normalizeLocale(state.locale || INITIAL_LOCALE);
    localStorage.setItem(STORAGE_KEYS.locale, activeLocale);
    document.documentElement.lang = isFrenchLocale() ? "fr-CA" : "en";
    document.title = l("Ethics Bowl Match Interface", "Interface de match de la Coupe éthique Canada");
    applyStaticTranslations();
    if (instructionsLinkEl) instructionsLinkEl.href = localizedHref("instructions.html", activeLocale);
    if (localeToggleBtnEl) {
        const nextLocale = isFrenchLocale() ? "en" : "fr-ca";
        localeToggleBtnEl.textContent = isFrenchLocale() ? "English" : "Français";
        localeToggleBtnEl.href = localizedHref("debater.html", nextLocale);
    }
    if (judgeInputs[0]?.name && !sanitizeText(judgeInputs[0].name.value)) judgeInputs[0].name.value = judgeLabel(1);
    if (judgeInputs[1]?.name && !sanitizeText(judgeInputs[1].name.value)) judgeInputs[1].name.value = judgeLabel(2);
    if (judgeInputs[2]?.name && !sanitizeText(judgeInputs[2].name.value)) judgeInputs[2].name.value = judgeLabel(3);
    refreshParticipantScoreLabels();
    renderPhaseList();
    updatePhaseHeader();
    refreshControls();
    updateConfigBadges();
    updateApiKeyUi();
    refreshTimingTestUi();
}

startMatchBtnEl.addEventListener("click", () => { void startMatch(); });
resetMatchBtnEl.addEventListener("click", fullReset);
newMatchBtnEl?.addEventListener("click", fullReset);
nextActionBtnEl.addEventListener("click", () => { void handleNextAction(); });
leadBtnEl.addEventListener("click", () => handleHumanCoinChoice("lead"));
passBtnEl.addEventListener("click", () => handleHumanCoinChoice("pass"));
pauseTimerBtnEl.addEventListener("click", pauseTimer);
resumeTimerBtnEl.addEventListener("click", resumeTimer);
resetTimerBtnEl.addEventListener("click", resetPhaseTimer);
composerFormEl.addEventListener("submit", (event) => {
    event.preventDefault();
    submitComposerAction();
});

micBtnEl.addEventListener("click", () => { void toggleRecording(); });

computeHumanResultBtnEl.addEventListener("click", () => {
    if (state.judgeMode !== "human") return;
    try {
        const cards = collectHumanJudgeScorecards();
        const tally = computeVoteTally(cards);
        renderScorecards(cards, tally, "human");
        setStatus(l("Rendered result from human judges.", "Résultat généré à partir des juges humains."));
    } catch (error) {
        setStatus(error?.message || l("Could not compute the human-judge result.", "Impossible de calculer le résultat des juges humains."), true);
    }
});

document.querySelectorAll(".ask-judge-btn").forEach((button) => {
    button.addEventListener("click", () => {
        askHumanJudgeQuestion(Number(button.dataset.judge));
    });
});

messageInputEl.addEventListener("pointerdown", () => {
    if (state.isRecording) {
        if (stopRecordingAndFinalize(l("Stopping recording so you can edit the draft.", "Arrêt de l’enregistrement pour vous permettre de modifier le brouillon."))) return;
    }
    if (state.voiceFinalizePending) setStatus(l("Finalizing the recording so you can edit the draft.", "Finalisation de l’enregistrement pour vous permettre de modifier le brouillon."));
});

messageInputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && currentPhaseUsesMainComposer(getCurrentPhase())) {
        event.preventDefault();
        submitComposerAction();
    }
});

messageInputEl.addEventListener("input", () => {
    syncActiveJudgeDraftFromMainComposer({ persist: true });
});

[
    participantOneTypeSelectEl, participantOneModelSelectEl, humanNameInputEl, aiNameInputEl, coinCallSelectEl,
judgeModeSelectEl, voiceModeSelectEl, moderatorReadFullCaseSelectEl, modelSelectEl, case1TitleInputEl, case1QuestionInputEl, case1TextInputEl,
case2TitleInputEl, case2QuestionInputEl, case2TextInputEl,
...judgeInputs.flatMap((judge) => [judge.name, judge.question, judge.humanScore, judge.aiScore, judge.comment])
].forEach((el) => {
    el.addEventListener("input", saveSetup);
    el.addEventListener("change", saveSetup);
});

participantOneTypeSelectEl.addEventListener("change", () => {
    syncParticipantSetupUi();
    refreshControls();
});

humanNameInputEl.addEventListener("input", refreshParticipantScoreLabels);
aiNameInputEl.addEventListener("input", refreshParticipantScoreLabels);

judgeModeSelectEl.addEventListener("change", refreshControls);

judgeInputs.forEach((judge) => {
    judge.question.addEventListener("input", () => {
        const phase = getCurrentPhase();
        if (phase && state.phaseReady && isHumanJudgeQuestionPhase(phase) && phase.judgeNumber === judge.number && !state.isRecording && !state.voiceFinalizePending) {
            messageInputEl.value = judge.question.value;
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
    activeLocale = state.locale;
    applyLocaleToUi();
    loadSetup();
    refreshControls();
});

window.addEventListener("focus", () => {
    state.locale = normalizeLocale(
        new URLSearchParams(window.location.search).get("lang") ||
        localStorage.getItem(STORAGE_KEYS.locale) ||
        document.documentElement.lang ||
        navigator.language
    );
    activeLocale = state.locale;
    applyLocaleToUi();
    syncParticipantSetupUi();
    refreshParticipantScoreLabels();
    refreshControls();
    void refreshCredentialStatus({ force: true }).then(() => {
        refreshControls();
    }).catch((error) => {
        const detail = safeBridgeErrorMessage(error);
        setStatus(l(
            `Could not refresh provider credentials${detail ? `: ${detail}` : "."}`,
            `Impossible d’actualiser les identifiants des fournisseurs${detail ? ` : ${detail}` : "."}`
        ), true);
    });
});

window.addEventListener("pagehide", () => {
    stopSpeechPlayback(false, { resolveCallbacks: false });
    releaseMicrophoneStream();
});

window.addEventListener("beforeunload", () => {
    stopSpeechPlayback(false, { resolveCallbacks: false });
    releaseMicrophoneStream();
});

async function initializeCredentialState() {
    if (!hasDesktopBridge()) {
        credentialState.loaded = true;
        credentialState.lastError = desktopLaunchMessage();
        updateApiKeyUi();
        setStatus(desktopLaunchMessage(), true);
        refreshControls();
        return;
    }
    try {
        await refreshCredentialStatus({ force: true });
        const credentialLoadingStatus = l(
            "Checking AI provider credentials...",
            "Vérification des identifiants des fournisseurs IA..."
        );
        if (
            !state.liveScreenActive
            && !state.started
            && !state.completed
            && sanitizeText(statusLineEl.textContent) === credentialLoadingStatus
        ) {
            setStatus(l("Ready.", "Prêt."));
        }
        refreshControls();
        await maybeShowInitialApiKeyDialog();
        if (
            TIMING_TEST_AUTO_START
            && !state.liveScreenActive
            && !state.started
            && !state.completed
        ) {
            await startMatch();
        }
    } catch (error) {
        const detail = safeBridgeErrorMessage(error);
        setStatus(l(
            `Could not load provider credentials${detail ? `: ${detail}` : "."}`,
            `Impossible de charger les identifiants des fournisseurs${detail ? ` : ${detail}` : "."}`
        ), true);
        refreshControls();
    }
}

loadSetup();
initSiteLogo();
ensureSpeechUi();
fullReset();
applyLocaleToUi();
updateConfigBadges();
updateApiKeyUi();
refreshTimingTestUi();
refreshControls();
void initializeCredentialState();
