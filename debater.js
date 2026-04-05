const STORAGE_KEYS = {
    instructions: "debate.instructions",
    setup: "ethics.match.setup",
    locale: "ethics.match.locale",
    apiKeys: "ethics.match.apiKeys",
    activeApiKeyId: "ethics.match.activeApiKeyId"
};

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";
const OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech";

const AVAILABLE_MATCH_MODELS = Object.freeze([
    { value: "gpt-5.4", label: "gpt-5" },
    { value: "gpt-4.1", label: "gpt-4" },
    { value: "gpt-5.4-mini", label: "gpt-5-mini" },
    { value: "gpt-5.4-nano", label: "gpt-5-nano" }
]);

const DEFAULT_PARTICIPANT_MODEL = "gpt-5.4";
const DEFAULT_JUDGE_MODEL = "gpt-5.4";

const OFFICIAL_SCORE_SHEET_TEXT = `
Each judge scores each participant out of 60.

Authoritative scoring instructions:
- Use this rubric as authoritative.
- Score each criterion cumulatively from lower bands to higher bands.
- A higher band may be awarded only if the requirements of all lower bands in that criterion have been satisfied.
- If a lower-band requirement is missing, do not award a higher-band score in that criterion even if some higher-band qualities appear.
- Participants may address rubric elements in any order; score the substance, not the order.
- Within a score band, assign the lower number for weaker or more minimal evidence and the higher number for stronger or more consistent evidence.
-Be exact with numerical score. A perfect score for a criterion is quite rare.

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

const FINAL_JUDGE_SCORECARD_JSON_SCHEMA = {
    name: "final_judge_scorecard",
    strict: true,
    schema: {
        type: "object",
        additionalProperties: false,
        required: ["name", "participantOne", "participantTwo"],
        properties: {
            name: { type: "string" },
            participantOne: {
                type: "object",
                additionalProperties: false,
                required: [
                    "presentationQuestion",
                    "presentationEthics",
                    "presentationViewpoints",
                    "responseToFeedback",
                    "judgesQuestions",
                    "commentary",
                    "respectfulDialogue",
                    "comment"
                ],
                properties: {
                    presentationQuestion: { type: "integer", minimum: 0, maximum: 5 },
                    presentationEthics: { type: "integer", minimum: 0, maximum: 5 },
                    presentationViewpoints: { type: "integer", minimum: 0, maximum: 5 },
                    responseToFeedback: { type: "integer", minimum: 0, maximum: 10 },
                    judgesQuestions: { type: "integer", minimum: 0, maximum: 20 },
                    commentary: { type: "integer", minimum: 0, maximum: 10 },
                    respectfulDialogue: { type: "integer", minimum: 0, maximum: 5 },
                    comment: { type: "string" }
                }
            },
            participantTwo: {
                type: "object",
                additionalProperties: false,
                required: [
                    "presentationQuestion",
                    "presentationEthics",
                    "presentationViewpoints",
                    "responseToFeedback",
                    "judgesQuestions",
                    "commentary",
                    "respectfulDialogue",
                    "comment"
                ],
                properties: {
                    presentationQuestion: { type: "integer", minimum: 0, maximum: 5 },
                    presentationEthics: { type: "integer", minimum: 0, maximum: 5 },
                    presentationViewpoints: { type: "integer", minimum: 0, maximum: 5 },
                    responseToFeedback: { type: "integer", minimum: 0, maximum: 10 },
                    judgesQuestions: { type: "integer", minimum: 0, maximum: 20 },
                    commentary: { type: "integer", minimum: 0, maximum: 10 },
                    respectfulDialogue: { type: "integer", minimum: 0, maximum: 5 },
                    comment: { type: "string" }
                }
            }
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
const VOICE_AUTO_SEND_DELAY_MS = 2000;
const VOICE_SILENCE_STOP_DELAY_MS = 2000;
const VOICE_SILENCE_SEND_DELAY_MS = 150;
const LIVE_PREVIEW_POLL_MS = 1200;
const LIVE_PREVIEW_MIN_BLOB_BYTES = 4000;
const MAX_TTS_CHARS = 2500;
const SPEECH_CHUNK_MAX = 420;
const AUTO_SPEAK_MESSAGE_KINDS = new Set(["moderator", "ai", "ai-alt", "judge"]);
const AUTO_SPEAK_VOICES = Object.freeze({
    moderator: "sage",
    ai: "shimmer",
    "ai-alt": "alloy",
    judge1: "alloy",
    judge2: "ash",
    judge3: "verse",
    judge: "alloy"
});
const BROWSER_VOICE_HINTS = Object.freeze({
    moderator: ["aria", "samantha", "karen", "zira", "female"],
    ai: ["ava", "victoria", "serena", "zira", "female"],
    "ai-alt": ["brian", "thomas", "daniel", "guy", "male"],
    judge1: ["jenny", "ava", "victoria", "serena", "female"],
    judge2: ["brian", "alex", "thomas", "daniel", "male"],
    judge3: ["ava", "zira", "samantha", "serena", "female"]
});
const BROWSER_VOICE_HINTS_FR_CA = Object.freeze({
    moderator: ["amélie", "marie", "chantal", "sylvie", "female"],
    ai: ["amélie", "marie", "sylvie", "female"],
    "ai-alt": ["nicolas", "thomas", "mathieu", "male"],
    judge1: ["amélie", "marie", "female"],
    judge2: ["nicolas", "thomas", "male"],
    judge3: ["sylvie", "marie", "female"]
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

function normalizeVoiceMode(value) {
    return String(value || "").toLowerCase() === "browser" ? "browser" : "openai";
}

function localizedHref(path, locale = activeLocale) {
    const url = new URL(path, window.location.href);
    url.searchParams.set("lang", normalizeLocale(locale));
    return url.toString();
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
const instructionsBadgeEl = document.getElementById("instructionsBadge");
const instructionsLinkEl = document.getElementById("instructionsLink");
const localeToggleBtnEl = document.getElementById("localeToggleBtn");

const participantOneTypeSelectEl = document.getElementById("participantOneTypeSelect");
const participantOneModelWrapEl = document.getElementById("participantOneModelWrap");
const participantOneModelSelectEl = document.getElementById("participantOneModelSelect");
const humanNameInputEl = document.getElementById("humanNameInput");
const aiNameInputEl = document.getElementById("aiNameInput");
const coinCallSelectEl = document.getElementById("coinCallSelect");
const judgeModeSelectEl = document.getElementById("judgeModeSelect");
const voiceModeSelectEl = document.getElementById("voiceModeSelect");
const modelSelectEl = document.getElementById("modelSelect");

const case1TitleInputEl = document.getElementById("case1TitleInput");
const case1QuestionInputEl = document.getElementById("case1QuestionInput");
const case1TextInputEl = document.getElementById("case1TextInput");
const case1FileInputEl = document.getElementById("case1FileInput");

const case2TitleInputEl = document.getElementById("case2TitleInput");
const case2QuestionInputEl = document.getElementById("case2QuestionInput");
const case2TextInputEl = document.getElementById("case2TextInput");
const case2FileInputEl = document.getElementById("case2FileInput");

const startMatchBtnEl = document.getElementById("startMatchBtn");
const resetMatchBtnEl = document.getElementById("resetMatchBtn");
const nextActionBtnEl = document.getElementById("nextActionBtn");

const coinChoicePanelEl = document.getElementById("coinChoicePanel");
const leadBtnEl = document.getElementById("leadBtn");
const passBtnEl = document.getElementById("passBtn");

const currentPhaseTitleEl = document.getElementById("currentPhaseTitle");
const currentPhaseMetaEl = document.getElementById("currentPhaseMeta");
const phaseListEl = document.getElementById("phaseList");

const timerDisplayEl = document.getElementById("timerDisplay");
const timerHintEl = document.getElementById("timerHint");
const pauseTimerBtnEl = document.getElementById("pauseTimerBtn");
const resumeTimerBtnEl = document.getElementById("resumeTimerBtn");
const resetTimerBtnEl = document.getElementById("resetTimerBtn");

const composerFormEl = document.getElementById("composerForm");
const messageInputEl = document.getElementById("messageInput");
const submitTurnBtnEl = document.getElementById("submitTurnBtn");
const micBtnEl = document.getElementById("micBtn");
const liveVoiceWrapEl = document.getElementById("liveVoiceWrap");
const liveVoicePreviewEl = document.getElementById("liveVoicePreview");

const aiJudgePanelEl = document.getElementById("aiJudgePanel");
const humanJudgePanelEl = document.getElementById("humanJudgePanel");
const computeHumanResultBtnEl = document.getElementById("computeHumanResultBtn");

const scoreSummaryEl = document.getElementById("scoreSummary");
const scoreCardsEl = document.getElementById("scoreCards");

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
let savedApiKeysTitleEl = null;
let savedApiKeysEmptyEl = null;
let savedApiKeysListEl = null;
let useSelectedApiKeyBtnEl = null;
let removeSelectedApiKeyBtnEl = null;
let newApiKeyTitleEl = null;
let newApiKeyInputEl = null;
let saveNewApiKeyBtnEl = null;
let apiKeyDialogCloseBtnEl = null;
let initialApiKeyDialogShown = false;

const state = {
    locale: INITIAL_LOCALE,
    transcript: [],
    phases: [],
    currentPhaseIndex: -1,
    busy: false,
    started: false,
    completed: false,
    waitingForCoinChoice: false,
    coinWinner: "",
    phaseReady: false,
    phaseAwaitingPlaybackForId: "",
    pendingAutoActionPhaseId: "",
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
    voiceMode: "openai",
    judgeQuestionCache: { 1: [], 2: [] },
    aiJudgeQuestionDraftCache: { 1: [], 2: [] },
    lastJudgeQuestionByCase: { 1: "", 2: "" },
    askedJudgeQuestions: {},
    aiJudgeQuestionDraftPromises: {},
    aiJudgeQuestionDraftErrors: {},
    aiJudgeQuestionPreparationPromises: {},
    aiJudgeQuestionPreparationErrors: {},
    aiPreparedTurns: {},
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
    recognition: null,
    recognitionShouldRestart: false,
    liveSpeechFinal: "",
    liveSpeechInterim: "",
    draftBeforeRecording: "",
    livePreviewMode: "",
    livePreviewTimer: null,
    livePreviewInFlight: false,
    livePreviewAbortController: null,
    livePreviewRequestId: 0,
    voiceAutoSendTimer: null,
    voiceAutoSendExpectedText: "",
    voiceAutoSendArmed: false,
    voiceSilenceTimer: null,
    voiceSpeechDetected: false,
    voiceAutoSubmitSuppressed: false,
    voiceStopReason: "",
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
    speechPlaybackActive: false,
    forceBrowserSpeech: false,
        speechProgressMessageIndex: -1,
        speechProgressNormalizedCursor: 0,
        speechProgressReadTo: 0,
        speechProgressSpeakStart: 0,
        speechProgressSpeakEnd: 0,
        speechFollowRaf: null,
        speechFollowWantsSmooth: false,
        speechChunkCounts: new Map(),
        speechCompletionCallbacks: new Map()
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

function clipInlineText(value, max = 160) {
    const text = normalizeSpeechText(value);
    if (!text) return "";
    return text.length > max ? `${text.slice(0, max).trim()}…` : text;
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

function getCurrentLiveSpeechText() {
    return normalizeSpeechText(`${state.liveSpeechFinal} ${state.liveSpeechInterim}`);
}

function createLocalId(prefix = "id") {
    if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function maskApiKey(key) {
    const clean = sanitizeText(key);
    if (!clean) return "";
    if (clean.length <= 10) return `${clean.slice(0, 4)}••••`;
    return `${clean.slice(0, 7)}••••${clean.slice(-4)}`;
}

function loadSavedApiKeyRecords() {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.apiKeys) || "[]");
        if (!Array.isArray(parsed)) return [];
        return parsed
        .map((item) => {
            if (typeof item === "string") {
                return {
                    id: createLocalId("api"),
             key: sanitizeText(item),
             createdAt: "",
             lastUsedAt: ""
                };
            }
            if (!item || typeof item !== "object") return null;
            return {
                id: sanitizeText(item.id) || createLocalId("api"),
             key: sanitizeText(item.key),
             createdAt: sanitizeText(item.createdAt),
             lastUsedAt: sanitizeText(item.lastUsedAt)
            };
        })
        .filter((item) => item && item.key);
    } catch {
        return [];
    }
}

function persistSavedApiKeyRecords(records) {
    const cleaned = (Array.isArray(records) ? records : [])
    .map((item) => ({
        id: sanitizeText(item?.id) || createLocalId("api"),
                    key: sanitizeText(item?.key),
                    createdAt: sanitizeText(item?.createdAt) || new Date().toISOString(),
                    lastUsedAt: sanitizeText(item?.lastUsedAt)
    }))
    .filter((item) => item.key);
    localStorage.setItem(STORAGE_KEYS.apiKeys, JSON.stringify(cleaned));
}

function getActiveApiKeyId() {
    return sanitizeText(localStorage.getItem(STORAGE_KEYS.activeApiKeyId) || "");
}

function setActiveApiKeyId(id) {
    const clean = sanitizeText(id);
    if (clean) localStorage.setItem(STORAGE_KEYS.activeApiKeyId, clean);
    else localStorage.removeItem(STORAGE_KEYS.activeApiKeyId);
}

function getSortedApiKeyRecords() {
    return loadSavedApiKeyRecords().sort((a, b) => {
        const left = new Date(a.lastUsedAt || a.createdAt || 0).getTime();
        const right = new Date(b.lastUsedAt || b.createdAt || 0).getTime();
        return right - left;
    });
}

function getActiveApiKeyRecord() {
    const activeId = getActiveApiKeyId();
    if (!activeId) return null;
    const record = loadSavedApiKeyRecords().find((item) => item.id === activeId) || null;
    if (!record) setActiveApiKeyId("");
    return record;
}

function getApiKey() {
    const active = sanitizeText(getActiveApiKeyRecord()?.key || "");
    if (active) return active;

    const records = getSortedApiKeyRecords();
    if (!records.length) return "";

    const record = activateSavedApiKey(records[0].id);
    return sanitizeText(record?.key || "");
}

function activateSavedApiKey(id) {
    const cleanId = sanitizeText(id);
    if (!cleanId) return null;
    const records = loadSavedApiKeyRecords();
    const record = records.find((item) => item.id === cleanId) || null;
    if (!record) return null;
    record.lastUsedAt = new Date().toISOString();
    persistSavedApiKeyRecords(records);
    setActiveApiKeyId(record.id);
    return record;
}

function saveAndUseApiKey(rawKey) {
    const cleanKey = sanitizeText(rawKey);
    if (!cleanKey) throw new Error(l("Enter an API key first.", "Entrez d’abord une clé API."));

    const records = loadSavedApiKeyRecords();
    const existing = records.find((item) => item.key === cleanKey);
    if (existing) {
        existing.lastUsedAt = new Date().toISOString();
        persistSavedApiKeyRecords(records);
        setActiveApiKeyId(existing.id);
        return existing;
    }

    const record = {
        id: createLocalId("api"),
        key: cleanKey,
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString()
    };
    records.unshift(record);
    persistSavedApiKeyRecords(records);
    setActiveApiKeyId(record.id);
    return record;
}

function removeSavedApiKey(id) {
    const cleanId = sanitizeText(id);
    if (!cleanId) return;
    const remaining = loadSavedApiKeyRecords().filter((item) => item.id !== cleanId);
    persistSavedApiKeyRecords(remaining);
    if (getActiveApiKeyId() === cleanId) setActiveApiKeyId("");
}

function formatApiKeyTimestamp(isoString) {
    if (!isoString) return "";
    try {
        return new Date(isoString).toLocaleString();
    } catch {
        return "";
    }
}

function getSelectedApiKeyIdFromDialog() {
    return sanitizeText(
        apiKeyDialogEl?.querySelector('input[name="savedApiKeyChoice"]:checked')?.value || ""
    );
}

function ensureApiKeyUiStyles() {
    if (document.getElementById("localApiKeyUiStyles")) return;
    const style = document.createElement("style");
    style.id = "localApiKeyUiStyles";
    style.textContent = `
    .local-api-key-dialog {
        border: none;
        padding: 0;
        background: transparent;
        width: min(760px, calc(100vw - 24px));
        max-width: 100%;
    }

    .local-api-key-dialog::backdrop {
        background: rgba(17, 26, 52, 0.48);
        backdrop-filter: blur(6px);
    }

    .local-api-key-dialog-card {
        background: rgba(255, 255, 255, 0.92);
        border: 1px solid rgba(97, 122, 191, 0.16);
        border-radius: 28px;
        box-shadow: 0 20px 60px rgba(31, 51, 107, 0.12);
        backdrop-filter: blur(12px);
        padding: 20px;
        display: grid;
        gap: 16px;
        color: #18233f;
    }

    .local-api-key-dialog-head {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
        flex-wrap: wrap;
    }

    .local-api-key-section {
        border: 1px solid rgba(97, 122, 191, 0.16);
        background: rgba(255, 255, 255, 0.62);
        border-radius: 20px;
        padding: 14px;
        display: grid;
        gap: 12px;
    }

    .local-api-key-list {
        display: grid;
        gap: 10px;
        max-height: 240px;
        overflow-y: auto;
    }

    .local-api-key-row {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        border: 1px solid rgba(97, 122, 191, 0.16);
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.68);
        padding: 12px;
        cursor: pointer;
    }

    .local-api-key-row input[type="radio"] {
        width: auto;
        margin-top: 4px;
    }

    .local-api-key-row-body {
        display: grid;
        gap: 6px;
    }

    .local-api-key-row-meta {
        color: #5d6d93;
        font-size: 0.9rem;
        line-height: 1.4;
    }
    `;
    document.head.appendChild(style);
}

function ensureApiKeyUi() {
    ensureApiKeyUiStyles();

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

        <div class="local-api-key-section">
        <div id="savedApiKeysTitle" class="phase-title"></div>
        <div id="savedApiKeysEmpty" class="small-note"></div>
        <div id="savedApiKeysList" class="local-api-key-list"></div>
        <div class="button-cluster">
        <button type="button" id="useSelectedApiKeyBtn" class="secondary-btn"></button>
        <button type="button" id="removeSelectedApiKeyBtn" class="ghost-btn"></button>
        </div>
        </div>

        <div class="local-api-key-section">
        <div id="newApiKeyTitle" class="phase-title"></div>
        <input id="newApiKeyInput" type="password" autocomplete="off" spellcheck="false" />
        <div class="button-cluster">
        <button type="button" id="saveNewApiKeyBtn" class="primary-btn"></button>
        </div>
        </div>
        </div>
        `;
        document.body.appendChild(dialog);
        apiKeyDialogEl = dialog;
    }

    apiKeyDialogEyebrowEl = document.getElementById("apiKeyDialogEyebrow");
    apiKeyDialogTitleEl = document.getElementById("apiKeyDialogTitle");
    apiKeyDialogCopyEl = document.getElementById("apiKeyDialogCopy");
    savedApiKeysTitleEl = document.getElementById("savedApiKeysTitle");
    savedApiKeysEmptyEl = document.getElementById("savedApiKeysEmpty");
    savedApiKeysListEl = document.getElementById("savedApiKeysList");
    useSelectedApiKeyBtnEl = document.getElementById("useSelectedApiKeyBtn");
    removeSelectedApiKeyBtnEl = document.getElementById("removeSelectedApiKeyBtn");
    newApiKeyTitleEl = document.getElementById("newApiKeyTitle");
    newApiKeyInputEl = document.getElementById("newApiKeyInput");
    saveNewApiKeyBtnEl = document.getElementById("saveNewApiKeyBtn");
    apiKeyDialogCloseBtnEl = document.getElementById("apiKeyDialogCloseBtn");

    if (manageApiKeysBtnEl && manageApiKeysBtnEl.dataset.bound !== "1") {
        manageApiKeysBtnEl.dataset.bound = "1";
        manageApiKeysBtnEl.addEventListener("click", openApiKeyDialog);
    }

    if (useSelectedApiKeyBtnEl && useSelectedApiKeyBtnEl.dataset.bound !== "1") {
        useSelectedApiKeyBtnEl.dataset.bound = "1";
        useSelectedApiKeyBtnEl.addEventListener("click", useSelectedApiKeyFromDialog);
    }

    if (removeSelectedApiKeyBtnEl && removeSelectedApiKeyBtnEl.dataset.bound !== "1") {
        removeSelectedApiKeyBtnEl.dataset.bound = "1";
        removeSelectedApiKeyBtnEl.addEventListener("click", deleteSelectedApiKeyFromDialog);
    }

    if (saveNewApiKeyBtnEl && saveNewApiKeyBtnEl.dataset.bound !== "1") {
        saveNewApiKeyBtnEl.dataset.bound = "1";
        saveNewApiKeyBtnEl.addEventListener("click", saveNewApiKeyFromDialog);
    }

    if (apiKeyDialogCloseBtnEl && apiKeyDialogCloseBtnEl.dataset.bound !== "1") {
        apiKeyDialogCloseBtnEl.dataset.bound = "1";
        apiKeyDialogCloseBtnEl.addEventListener("click", () => {
            closeApiKeyDialog();
            refreshControls();
        });
    }

    if (newApiKeyInputEl && newApiKeyInputEl.dataset.bound !== "1") {
        newApiKeyInputEl.dataset.bound = "1";
        newApiKeyInputEl.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                saveNewApiKeyFromDialog();
            }
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
    if (manageApiKeysBtnEl) manageApiKeysBtnEl.textContent = l("API Keys", "Clés API");
    if (apiKeyDialogEyebrowEl) apiKeyDialogEyebrowEl.textContent = l("Local API setup", "Configuration API locale");
    if (apiKeyDialogTitleEl) apiKeyDialogTitleEl.textContent = l("Choose an API key", "Choisissez une clé API");
    if (apiKeyDialogCopyEl) {
        apiKeyDialogCopyEl.textContent = l(
            "This app stores saved keys only in this browser. Select a saved key or add a new one.",
            "Cette application enregistre les clés seulement dans ce navigateur. Sélectionnez une clé enregistrée ou ajoutez-en une nouvelle."
        );
    }
    if (savedApiKeysTitleEl) savedApiKeysTitleEl.textContent = l("Saved keys", "Clés enregistrées");
    if (savedApiKeysEmptyEl) savedApiKeysEmptyEl.textContent = l("No saved keys yet.", "Aucune clé enregistrée pour le moment.");
    if (useSelectedApiKeyBtnEl) useSelectedApiKeyBtnEl.textContent = l("Use selected key", "Utiliser la clé sélectionnée");
    if (removeSelectedApiKeyBtnEl) removeSelectedApiKeyBtnEl.textContent = l("Delete selected key", "Supprimer la clé sélectionnée");
    if (newApiKeyTitleEl) newApiKeyTitleEl.textContent = l("Add a new key", "Ajouter une nouvelle clé");
    if (newApiKeyInputEl) newApiKeyInputEl.placeholder = l("Paste a new OpenAI API key here", "Collez ici une nouvelle clé API OpenAI");
    if (saveNewApiKeyBtnEl) saveNewApiKeyBtnEl.textContent = l("Save and use new key", "Enregistrer et utiliser la nouvelle clé");
    if (apiKeyDialogCloseBtnEl) apiKeyDialogCloseBtnEl.textContent = l("Close", "Fermer");
}

function renderSavedApiKeyList() {
    if (!savedApiKeysListEl || !savedApiKeysEmptyEl) return;

    const records = getSortedApiKeyRecords();
    const selectedId = getSelectedApiKeyIdFromDialog() || getActiveApiKeyId() || records[0]?.id || "";

    savedApiKeysListEl.innerHTML = "";
    savedApiKeysEmptyEl.hidden = records.length > 0;

    if (useSelectedApiKeyBtnEl) useSelectedApiKeyBtnEl.disabled = !records.length;
    if (removeSelectedApiKeyBtnEl) removeSelectedApiKeyBtnEl.disabled = !records.length;

    if (!records.length) return;

    records.forEach((record) => {
        const row = document.createElement("label");
        row.className = "local-api-key-row";

        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "savedApiKeyChoice";
        radio.value = record.id;
        radio.checked = record.id === selectedId;

        const body = document.createElement("div");
        body.className = "local-api-key-row-body";

        const title = document.createElement("div");
        title.className = "phase-title";
        title.textContent = maskApiKey(record.key);

        const meta = document.createElement("div");
        meta.className = "local-api-key-row-meta";

        const parts = [];
        if (record.id === getActiveApiKeyId()) parts.push(l("currently active", "clé active"));
        if (record.lastUsedAt) {
            parts.push(
                isFrenchLocale()
                ? `dernière utilisation : ${formatApiKeyTimestamp(record.lastUsedAt)}`
                : `last used: ${formatApiKeyTimestamp(record.lastUsedAt)}`
            );
        }

        meta.textContent = parts.join(" • ");

        body.appendChild(title);
        if (meta.textContent) body.appendChild(meta);

        row.appendChild(radio);
        row.appendChild(body);
        savedApiKeysListEl.appendChild(row);
    });
}

function updateApiKeyStatusUi() {
    if (!apiKeyStatusBadgeEl) return;
    const activeRecord = getActiveApiKeyRecord();
    if (activeRecord) {
        apiKeyStatusBadgeEl.textContent = isFrenchLocale()
        ? `Clé API active : ${maskApiKey(activeRecord.key)}`
        : `API key active: ${maskApiKey(activeRecord.key)}`;
        apiKeyStatusBadgeEl.className = "status-chip active";
        apiKeyStatusBadgeEl.title = l("Stored locally in this browser.", "Stockée localement dans ce navigateur.");
        return;
    }

    apiKeyStatusBadgeEl.textContent = l("API key required", "Clé API requise");
    apiKeyStatusBadgeEl.className = "status-chip inactive";
    apiKeyStatusBadgeEl.title = l("Choose or save a key to use the app.", "Choisissez ou enregistrez une clé pour utiliser l’application.");
}

function updateApiKeyUi() {
    ensureApiKeyUi();
    updateApiKeyUiText();
    renderSavedApiKeyList();
    updateApiKeyStatusUi();
}

function openApiKeyDialog() {
    updateApiKeyUi();
    if (newApiKeyInputEl) newApiKeyInputEl.value = "";
    if (!apiKeyDialogEl) return;

    if (typeof apiKeyDialogEl.showModal === "function") {
        if (!apiKeyDialogEl.open) apiKeyDialogEl.showModal();
    } else {
        apiKeyDialogEl.setAttribute("open", "open");
    }

    window.setTimeout(() => {
        const firstRadio = apiKeyDialogEl.querySelector('input[name="savedApiKeyChoice"]:checked') ||
        apiKeyDialogEl.querySelector('input[name="savedApiKeyChoice"]');
        if (firstRadio) firstRadio.focus();
        else newApiKeyInputEl?.focus();
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

function maybeShowInitialApiKeyDialog() {
    if (initialApiKeyDialogShown) return;
    initialApiKeyDialogShown = true;

    if (getApiKey()) {
        updateApiKeyUi();
        refreshControls();
        return;
    }

    openApiKeyDialog();
}

function useSelectedApiKeyFromDialog() {
    const id = getSelectedApiKeyIdFromDialog();
    if (!id) {
        setStatus(l("Select a saved API key first.", "Sélectionnez d’abord une clé API enregistrée."), true);
        return;
    }

    const record = activateSavedApiKey(id);
    if (!record) {
        updateApiKeyUi();
        refreshControls();
        setStatus(l("That saved API key no longer exists.", "Cette clé API enregistrée n’existe plus."), true);
        return;
    }

    closeApiKeyDialog();
    updateApiKeyUi();
    refreshControls();
    setStatus(
        isFrenchLocale()
        ? `Utilisation de la clé API ${maskApiKey(record.key)}.`
        : `Using API key ${maskApiKey(record.key)}.`
    );
}

function saveNewApiKeyFromDialog() {
    try {
        const record = saveAndUseApiKey(newApiKeyInputEl?.value || "");
        if (newApiKeyInputEl) newApiKeyInputEl.value = "";
        closeApiKeyDialog();
        updateApiKeyUi();
        refreshControls();
        setStatus(
            isFrenchLocale()
            ? `Nouvelle clé API enregistrée et activée : ${maskApiKey(record.key)}.`
            : `Saved and activated new API key ${maskApiKey(record.key)}.`
        );
    } catch (error) {
        setStatus(error?.message || l("Could not save the API key.", "Impossible d’enregistrer la clé API."), true);
    }
}

function deleteSelectedApiKeyFromDialog() {
    const id = getSelectedApiKeyIdFromDialog();
    if (!id) {
        setStatus(l("Select a saved API key first.", "Sélectionnez d’abord une clé API enregistrée."), true);
        return;
    }

    removeSavedApiKey(id);
    updateApiKeyUi();
    refreshControls();

    if (!getApiKey()) {
        setStatus(l("Saved API key deleted. Choose or add another key.", "Clé API supprimée. Choisissez ou ajoutez-en une autre."), true);
    } else {
        setStatus(l("Saved API key deleted.", "Clé API supprimée."));
    }
}

function normalizeMatchModel(value) {
    const normalized = String(value || "").trim();
    return AVAILABLE_MATCH_MODELS.some((option) => option.value === normalized)
    ? normalized
    : DEFAULT_PARTICIPANT_MODEL;
}

function populateMatchModelSelect(selectEl, selectedValue = DEFAULT_PARTICIPANT_MODEL) {
    if (!selectEl) return;
    const finalValue = normalizeMatchModel(selectedValue || selectEl.value || DEFAULT_PARTICIPANT_MODEL);
    selectEl.innerHTML = "";
    AVAILABLE_MATCH_MODELS.forEach((optionData) => {
        const option = document.createElement("option");
        option.value = optionData.value;
        option.textContent = optionData.label;
        selectEl.appendChild(option);
    });
    selectEl.value = finalValue;
}

function populateAllMatchModelSelects() {
    populateMatchModelSelect(participantOneModelSelectEl, participantOneModelSelectEl?.value || DEFAULT_PARTICIPANT_MODEL);
    populateMatchModelSelect(modelSelectEl, modelSelectEl?.value || DEFAULT_PARTICIPANT_MODEL);
}

function updateVoiceDisclosure() {
    const note = document.getElementById("voiceDisclosureNote");
    if (!note) return;
    note.textContent = "";
}

function syncVoiceModeStateFromControls() {
    state.voiceMode = normalizeVoiceMode(voiceModeSelectEl?.value || state.voiceMode || "openai");
    updateVoiceDisclosure();
}

function shouldUseOpenAiSpeechPlayback() {
    return normalizeVoiceMode(state.voiceMode) === "openai" && !!getApiKey() && !state.forceBrowserSpeech;
}

function shouldUseBrowserSpeechPlayback() {
    return !shouldUseOpenAiSpeechPlayback();
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
                min: 625,
                max: 650,
                preferredTarget: 635,
                revisionTolerance: 100,
                label: "625-650 words"
            };
        }

        if (phase.kind === "speech" && (phase.subtype === "commentary" || phase.subtype === "response")) {
            return {
                min: 360,
                max: 380,
                preferredTarget: 372,
                revisionTolerance: 100,
                label: "360-380 words."
            };
        }

        if (phase.kind === "judgeAnswer") {
            return {
                min: 255,
                max: 295,
                preferredTarget: 270,
                revisionTolerance: 100,
                label: "255-295 words."
            };
        }

        return null;
    }

    if (phase.kind === "speech" && phase.subtype === "presentation") {
        return {
            min: 645,
            max: 670,
            preferredTarget: 660,
            revisionTolerance: 100,
            label: "645-670 words"
        };
    }

    if (phase.kind === "speech" && (phase.subtype === "commentary" || phase.subtype === "response")) {
        return {
            min: 368,
            max: 393,
            preferredTarget: 380,
            revisionTolerance: 100,
            label: "368-390 words."
        };
    }

    if (phase.kind === "judgeAnswer") {
        return {
            min: 260,
            max: 300,
            preferredTarget: 275,
            revisionTolerance: 100,
            label: "260-300 words."
        };
    }

    return null;
}

function clampWordTarget(wordCount, guidance) {
    if (!guidance) return Math.max(0, Math.round(Number(wordCount) || 0));
    const fallback = guidance.preferredTarget || guidance.max || 0;
    return Math.round(clampNumber(Number(wordCount) || fallback, guidance.min, guidance.max));
}

function getAiRevisionWordPlan(phase, baselineWordCount, currentDraftText) {
    const guidance = getPhaseWordGuidance(phase);
    if (!guidance) return null;
    const originalDraftWordCount = Math.max(0, Math.round(Number(baselineWordCount) || 0));
    const currentDraftWordCount = countWords(currentDraftText);
    const targetWordCount = clampWordTarget(originalDraftWordCount || currentDraftWordCount || guidance.preferredTarget, guidance);
    const tolerance = guidance.revisionTolerance || 12;
    return {
        originalDraftWordCount,
        currentDraftWordCount,
        targetWordCount,
        allowedMin: Math.max(guidance.min, targetWordCount - tolerance),
        allowedMax: Math.min(guidance.max, targetWordCount + tolerance),
        hardMin: guidance.min,
        hardMax: guidance.max,
        preferredTarget: guidance.preferredTarget
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
        voiceMode: normalizeVoiceMode(voiceModeSelectEl?.value),
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
    if (voiceModeSelectEl) voiceModeSelectEl.value = "openai";
    if (participantOneTypeSelectEl) participantOneTypeSelectEl.value = "human";
    populateAllMatchModelSelects();
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.setup) || "{}");
        if (parsed && typeof parsed === "object") {
            const legacyModel = normalizeMatchModel(parsed.model || DEFAULT_PARTICIPANT_MODEL);
            if (typeof parsed.participantOneType === "string") participantOneTypeSelectEl.value = normalizeParticipantMode(parsed.participantOneType);
            if (typeof parsed.humanName === "string") humanNameInputEl.value = parsed.humanName;
            if (typeof parsed.aiName === "string") aiNameInputEl.value = parsed.aiName;
            if (typeof parsed.coinCall === "string") coinCallSelectEl.value = parsed.coinCall;
            if (typeof parsed.judgeMode === "string") judgeModeSelectEl.value = parsed.judgeMode;
            if (typeof parsed.voiceMode === "string" && voiceModeSelectEl) voiceModeSelectEl.value = normalizeVoiceMode(parsed.voiceMode);
            participantOneModelSelectEl.value = normalizeMatchModel(parsed.participantOneModel || legacyModel);
            modelSelectEl.value = normalizeMatchModel(parsed.participantTwoModel || legacyModel);
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
    syncVoiceModeStateFromControls();
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
    const ids = new Set([...state.speechChunkCounts.keys(), ...state.speechCompletionCallbacks.keys()]);
    state.speechChunkCounts.clear();
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
    if (!state.transcript.length) {
        emptyStateEl.hidden = false;
        chatEl.appendChild(emptyStateEl);
        return;
    }
    emptyStateEl.hidden = true;
    state.transcript.forEach((message, index) => chatEl.appendChild(createMessageElement(message, index)));
    syncSpeechProgressToUi(false);
    if (isSpeechFollowActive()) queueSpeechFollowScroll(false);
    else chatEl.scrollTop = chatEl.scrollHeight;
}

function ensureSpeechAudioEl() {
    if (state.speechAudioEl && document.body.contains(state.speechAudioEl)) return state.speechAudioEl;
    const audioEl = document.createElement("audio");
    audioEl.preload = "auto";
    audioEl.hidden = true;
    audioEl.setAttribute("aria-hidden", "true");
    document.body.appendChild(audioEl);
    state.speechAudioEl = audioEl;
    return audioEl;
}

function injectVoiceDisclosure() {
    let note = document.getElementById("voiceDisclosureNote");
    if (!note) {
        note = document.createElement("div");
        note.id = "voiceDisclosureNote";
        note.className = "small-note";
        statusLineEl.insertAdjacentElement("afterend", note);
    }
    updateVoiceDisclosure();
}

function isSpeechPlaybackActive() {
    const audioEl = state.speechAudioEl;
    const browserSpeaking = "speechSynthesis" in window && (window.speechSynthesis.speaking || window.speechSynthesis.pending);
    const audioPlaying = !!(audioEl && audioEl.src && typeof audioEl.paused === "boolean" && !audioEl.paused);
    return state.speechProcessing || state.speechPlaybackActive || !!state.speechQueue.length || !!state.currentSpeechController || !!state.openAiSpeechLookaheadPromise || !!state.openAiSpeechLookaheadPrepared || browserSpeaking || audioPlaying;
}

function refreshSpeechUi() {
    if (!stopSpeechBtnEl) return;
    stopSpeechBtnEl.disabled = !isSpeechPlaybackActive();
    stopSpeechBtnEl.textContent = l("Stop Reading", "Arrêter la lecture");
}

function ensureSpeechUi() {
    ensureSpeechAudioEl();
    injectVoiceDisclosure();
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
    } catch {}
    audioEl.onended = null;
    audioEl.onerror = null;
    if (state.currentAudioUrl) {
        try { URL.revokeObjectURL(state.currentAudioUrl); } catch {}
        state.currentAudioUrl = "";
    }
    audioEl.removeAttribute("src");
    try { audioEl.load(); } catch {}
}

function clearOpenAiSpeechLookahead(restoreEntry = false) {
    const queuedEntry = restoreEntry ? state.openAiSpeechLookaheadEntry : null;
    if (state.currentSpeechController && state.currentSpeechControllerKind === "lookahead") {
        try { state.currentSpeechController.abort(); } catch {}
    }
    const preparedUrl = state.openAiSpeechLookaheadPrepared?.audioUrl || "";
    if (preparedUrl) {
        try { URL.revokeObjectURL(preparedUrl); } catch {}
    }
    if (queuedEntry) state.speechQueue.unshift(queuedEntry);
    state.openAiSpeechLookaheadPromise = null;
    state.openAiSpeechLookaheadPrepared = null;
    state.openAiSpeechLookaheadEntry = null;
    if (state.currentSpeechControllerKind === "lookahead") state.currentSpeechControllerKind = "";
    refreshSpeechUi();
}

function stopSpeechPlayback(showMessage = false, { resolveCallbacks = true } = {}) {
    state.speechToken += 1;
    state.speechQueue = [];
    state.speechProcessing = false;
    clearOpenAiSpeechLookahead(false);
    state.speechPlaybackActive = false;
    state.forceBrowserSpeech = false;
    rejectCurrentSpeechPlayback();
    if (state.currentSpeechController) {
        try { state.currentSpeechController.abort(); } catch {}
        state.currentSpeechController = null;
    }
    state.currentSpeechControllerKind = "";
    if ("speechSynthesis" in window) {
        try { window.speechSynthesis.cancel(); } catch {}
    }
    resetSpeechAudioEl();
    resetSpeechProgressState({ clearUi: true });
    if (resolveCallbacks) finalizeAllSpeechPlaybackCallbacks();
    else {
        state.speechChunkCounts.clear();
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

function buildSpeechInstructions(entry) {
    const voiceKey = String(entry?.voiceKey || entry?.kind || "");
    if (isFrenchLocale()) {
        if (voiceKey === "moderator") return "Parle clairement, calmement et formellement comme un modérateur officiel de la Coupe éthique Canada, en français québécois naturel. Utilise une voix mature, posée et légèrement plus autoritaire. Ceci est une voix générée par IA.";
        if (voiceKey.startsWith("judge")) return "Parle clairement, brièvement et avec neutralité comme un juge de la Coupe éthique Canada, en français québécois naturel. Ceci est une voix générée par IA.";
        if (voiceKey === "ai-alt") return "Parle clairement, naturellement et avec réflexion comme un seul participant de la Coupe éthique Canada, en français québécois naturel. Utilise une voix plus grave et plus posée, distincte de l’autre participante IA. Ceci est une voix générée par IA.";
        return "Parle clairement, naturellement et avec réflexion comme un seul participant de la Coupe éthique Canada, en français québécois naturel. Utilise une voix chaleureuse, articulée et distincte de l’autre participante IA s’il y en a une. Ceci est une voix générée par IA.";
    }
    if (voiceKey === "moderator") return "Speak clearly, calmly, and formally like an official Ethics Bowl moderator. Use a mature female voice with a steady, measured cadence and a slightly lower, more authoritative tone. This is an AI-generated voice.";
    if (voiceKey.startsWith("judge")) return "Speak clearly, briefly, and neutrally like an Ethics Bowl judge. This is an AI-generated voice.";
    if (voiceKey === "ai-alt") return "Speak clearly, naturally, and thoughtfully like a single Ethics Bowl participant. Use a grounded, lower, more measured voice clearly distinct from the other AI participant. This is an AI-generated voice.";
    return "Speak clearly, naturally, and thoughtfully like a single Ethics Bowl participant. Use a warm, articulate voice that is brighter and more conversational than the moderator and clearly distinct from the other AI participant if there is one. This is an AI-generated voice.";
}

function pickBrowserVoice(voiceKey) {
    if (!("speechSynthesis" in window) || typeof window.speechSynthesis.getVoices !== "function") return null;
    const allVoices = window.speechSynthesis.getVoices();
    if (!allVoices.length) return null;
    const localizedVoices = isFrenchLocale()
    ? allVoices.filter((voice) => /^fr(-|_)?ca$/i.test(voice.lang || "") || /^fr/i.test(voice.lang || ""))
    : allVoices.filter((voice) => /^en/i.test(voice.lang || ""));
    const voices = localizedVoices.length ? localizedVoices : allVoices;
    const hintMap = isFrenchLocale() ? BROWSER_VOICE_HINTS_FR_CA : BROWSER_VOICE_HINTS;
    const hints = hintMap[voiceKey] || [];
    for (const hint of hints) {
        const match = voices.find((voice) => String(voice.name || "").toLowerCase().includes(String(hint).toLowerCase()));
        if (match) return match;
    }
    const fallbackIndexByKey = { moderator: 0, ai: 1, "ai-alt": 2, judge1: 3, judge2: 4, judge3: 5 };
    const index = fallbackIndexByKey[voiceKey] ?? 0;
    return voices[index % voices.length] || voices[0] || null;
}

function getBrowserSpeechSettings(entry) {
    const voiceKey = String(entry?.voiceKey || entry?.kind || "");
    if (voiceKey === "moderator") return { rate: 0.98, pitch: 0.94 };
    if (voiceKey === "ai") return { rate: 1.01, pitch: 1.08 };
    if (voiceKey === "ai-alt") return { rate: 0.98, pitch: 0.9 };
    if (voiceKey === "judge1") return { rate: 1.01, pitch: 0.96 };
    if (voiceKey === "judge2") return { rate: 0.99, pitch: 1.06 };
    if (voiceKey === "judge3") return { rate: 1.03, pitch: 1.12 };
    return { rate: 1, pitch: 1 };
}

async function fetchOpenAiSpeechAudio(entry, token, { controllerKind = "direct" } = {}) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("No API key available for OpenAI speech.");
    if (token !== state.speechToken) return null;
    const controller = new AbortController();
    state.currentSpeechController = controller;
    state.currentSpeechControllerKind = controllerKind;
    refreshSpeechUi();
    try {
        const response = await fetch(OPENAI_SPEECH_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: "gpt-4o-mini-tts",
                voice: AUTO_SPEAK_VOICES[entry.voiceKey] || AUTO_SPEAK_VOICES[entry.kind] || "alloy",
                input: entry.text.slice(0, MAX_TTS_CHARS),
                                 instructions: buildSpeechInstructions(entry),
                                 response_format: "mp3"
            }),
            signal: controller.signal
        });
        if (token !== state.speechToken) return null;
        if (!response.ok) throw new Error(await parseApiError(response));
        const blob = await response.blob();
        if (token !== state.speechToken) return null;
        if (!blob.size) throw new Error("Empty speech audio response.");
        return { entry, audioUrl: URL.createObjectURL(blob) };
    } finally {
        if (state.currentSpeechController === controller) {
            state.currentSpeechController = null;
            state.currentSpeechControllerKind = "";
        }
        refreshSpeechUi();
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
    state.speechPlaybackActive = true;
    refreshSpeechUi();
    queueSpeechFollowScroll(true);
    try {
        await new Promise(async (resolve, reject) => {
            const rejectRef = (error) => {
                if (state.currentSpeechReject === rejectRef) state.currentSpeechReject = null;
                reject(error);
            };
            const resolveRef = () => {
                if (state.currentSpeechReject === rejectRef) state.currentSpeechReject = null;
                resolve();
            };
            state.currentSpeechReject = rejectRef;
            audioEl.onended = resolveRef;
            audioEl.onerror = () => rejectRef(new Error("AI voice playback failed."));
            try { await audioEl.play(); } catch { rejectRef(new Error("Voice autoplay was blocked.")); }
        });
    } finally {
        state.speechPlaybackActive = false;
        refreshSpeechUi();
    }
}

async function playBrowserSpeechChunk(entry, token) {
    if (!("speechSynthesis" in window)) throw new Error("Browser speech playback is unavailable.");
    if (token !== state.speechToken) return;
    state.speechPlaybackActive = true;
    refreshSpeechUi();
    queueSpeechFollowScroll(true);
    try {
        await new Promise((resolve, reject) => {
            const utterance = new SpeechSynthesisUtterance(entry.text);
            const settings = getBrowserSpeechSettings(entry);
            const voice = pickBrowserVoice(entry.voiceKey || entry.kind);
            utterance.rate = settings.rate;
            utterance.pitch = settings.pitch;
            utterance.lang = isFrenchLocale() ? "fr-CA" : "en-US";
            if (voice) utterance.voice = voice;
            const rejectRef = (error) => {
                if (state.currentSpeechReject === rejectRef) state.currentSpeechReject = null;
                reject(error);
            };
            const resolveRef = () => {
                if (state.currentSpeechReject === rejectRef) state.currentSpeechReject = null;
                resolve();
            };
            state.currentSpeechReject = rejectRef;
            utterance.onend = resolveRef;
            utterance.onerror = (event) => rejectRef(new Error(event?.error || "Browser voice playback failed."));
            try { window.speechSynthesis.speak(utterance); } catch (error) { rejectRef(error); }
        });
    } finally {
        state.speechPlaybackActive = false;
        refreshSpeechUi();
    }
}

function kickOpenAiSpeechLookahead(token) {
    if (!shouldUseOpenAiSpeechPlayback()) return;
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

async function handleOpenAiSpeechFailure(error, token, fallbackEntry = null, restoreLookahead = false) {
    if (token !== state.speechToken) return false;
    console.warn("OpenAI speech failed, falling back to browser speech:", error);
    if (restoreLookahead) clearOpenAiSpeechLookahead(true);
    else clearOpenAiSpeechLookahead(false);
    resetSpeechAudioEl();
    state.forceBrowserSpeech = true;
    refreshSpeechUi();
    const entry = fallbackEntry || error?.speechEntry || null;
    if (!entry?.text) {
        setStatus(l("OpenAI voice failed. Falling back to browser voice.", "La voix OpenAI a échoué. Retour à la voix du navigateur."), true);
        return true;
    }
    beginSpeechProgressForQueueEntry(entry);
    try {
        await playBrowserSpeechChunk(entry, token);
        setStatus(l("OpenAI voice failed. Falling back to browser voice.", "La voix OpenAI a échoué. Retour à la voix du navigateur."), true);
        return true;
    } catch (browserError) {
        console.error("Browser speech failed:", browserError);
        setStatus(browserError?.message || l("Read-aloud failed.", "La lecture a échoué."), true);
        return false;
    }
}

async function processSpeechQueue(token = state.speechToken) {
    if (state.speechProcessing) return;
    state.speechProcessing = true;
    refreshSpeechUi();
    try {
        while (token === state.speechToken) {
            const useBrowserVoice = shouldUseBrowserSpeechPlayback();
            if (useBrowserVoice) {
                const entry = state.speechQueue.shift();
                if (!entry) break;
                beginSpeechProgressForQueueEntry(entry);
                try {
                    await playBrowserSpeechChunk(entry, token);
                    markSpeechChunkComplete(entry.transcriptIndex);
                } catch (error) {
                    if (token !== state.speechToken || error?.name === "AbortError" || error?.message === STOP_SPEECH_ERROR) break;
                    console.error("Speech playback failed:", error);
                    finalizeSpeechPlaybackForMessage(entry.transcriptIndex);
                    setStatus(error?.message || l("Read-aloud failed.", "La lecture a échoué."), true);
                    break;
                } finally {
                    resetSpeechAudioEl();
                    refreshSpeechUi();
                }
                continue;
            }
            let prepared = null;
            try {
                prepared = await getNextOpenAiSpeechPrepared(token);
            } catch (error) {
                const failedEntry = error?.speechEntry || null;
                const recovered = await handleOpenAiSpeechFailure(error, token, failedEntry, false);
                if (recovered) {
                    if (failedEntry) markSpeechChunkComplete(failedEntry.transcriptIndex);
                    continue;
                }
                if (failedEntry) finalizeSpeechPlaybackForMessage(failedEntry.transcriptIndex);
                break;
            }
            if (!prepared) break;
            beginSpeechProgressForQueueEntry(prepared.entry);
            kickOpenAiSpeechLookahead(token);
            try {
                await playPreparedOpenAiSpeechChunk(prepared, token);
                markSpeechChunkComplete(prepared.entry.transcriptIndex);
            } catch (error) {
                if (token !== state.speechToken || error?.name === "AbortError" || error?.message === STOP_SPEECH_ERROR) break;
                const recovered = await handleOpenAiSpeechFailure(error, token, prepared.entry, true);
                if (recovered) {
                    markSpeechChunkComplete(prepared.entry.transcriptIndex);
                    continue;
                }
                finalizeSpeechPlaybackForMessage(prepared.entry.transcriptIndex);
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

function enqueueTranscriptSpeech(kind, text, transcriptIndex = -1, voiceKey = "") {
    if (!AUTO_SPEAK_MESSAGE_KINDS.has(kind)) return;
    const normalized = normalizeSpeechText(text);
    if (!normalized) return;
    const chunks = chunkTextForSpeech(normalized, SPEECH_CHUNK_MAX)
    .map((chunk) => ({
        kind,
        voiceKey: voiceKey || kind,
        text: chunk.slice(0, MAX_TTS_CHARS),
                     transcriptIndex
    }))
    .filter((entry) => entry.text);
    if (!chunks.length) {
        finalizeSpeechPlaybackForMessage(transcriptIndex);
        return;
    }
    trackSpeechChunksForMessage(transcriptIndex, chunks.length);
    ensureSpeechUi();
    state.speechQueue.push(...chunks);
    if (state.speechPlaybackActive && shouldUseOpenAiSpeechPlayback() && !state.openAiSpeechLookaheadPromise && !state.openAiSpeechLookaheadPrepared) {
        kickOpenAiSpeechLookahead(state.speechToken);
    }
    refreshSpeechUi();
    void processSpeechQueue(state.speechToken);
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
                              substantive: options.substantive !== false
    });
    const transcriptIndex = state.transcript.length - 1;
    const onPlaybackComplete = typeof options.onPlaybackComplete === "function" ? options.onPlaybackComplete : null;
    const willAutoSpeak = !options.silent && AUTO_SPEAK_MESSAGE_KINDS.has(kind) && !!normalizeSpeechText(text);
    if (onPlaybackComplete) {
        if (willAutoSpeak) registerSpeechCompletionCallback(transcriptIndex, onPlaybackComplete);
        else {
            window.setTimeout(() => {
                try { onPlaybackComplete(); } catch (error) { console.error("Immediate playback callback failed:", error); }
            }, 0);
        }
    }
    renderTranscript();
    if (!options.silent) enqueueTranscriptSpeech(kind, text, transcriptIndex, voiceKey);
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

/* --------------------- AI prep / judge prep / scoring helpers --------------------- */
/* unchanged logic, only locale-aware visible strings and labels updated below */

async function maybePrepareAiTurnForPhase(phase, options = {}) {
    const phaseId = phase?.id || "";
    const revisionPasses = Math.max(0, Math.floor(Number(options?.revisionPasses) || 0));
    if (!phaseId || !isAiControlledRole(phase.speaker)) return "";
    const cached = getPreparedAiTurnText(phaseId);
    if (cached) return cached;
    if (state.aiPreparationPromises[phaseId]) return state.aiPreparationPromises[phaseId];
    const runId = state.matchRunId;
    let trackedPromise = null;
    trackedPromise = (async () => {
        try {
            const maxTokens = phase.kind === "judgeAnswer" ? 1500 : phase.subtype === "presentation" ? 2000 : 2000;
            const boundJudgeQuestion = phase.kind === "judgeAnswer" ? getJudgeQuestionForAnswerPhase(phase) : "";
            if (phase.kind === "judgeAnswer" && !boundJudgeQuestion) {
                throw new Error(isFrenchLocale()
                ? `La question du ${judgeLabel(phase.judgeNumber)} manque, donc ${speakerName(phase.speaker)} ne peut pas encore y répondre.`
                : `Judge ${phase.judgeNumber}'s question is missing, so ${speakerName(phase.speaker)} cannot answer it yet.`);
            }
            let text = sanitizeText(await callOpenAI({
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
            const baselineRevisionWordCount = countWords(text);
            for (let revisionNumber = 1; revisionNumber <= revisionPasses; revisionNumber += 1) {
                const revisedText = sanitizeText(await callOpenAI({
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
            }
            if (runId !== state.matchRunId) return "";
            state.aiPreparedTurns[phaseId] = { text, preparedAt: new Date().toISOString(), passCount: 1 + revisionPasses };
            delete state.aiPreparationErrors[phaseId];
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
    void maybePrepareAiTurnForPhase(targetPhase, { revisionPasses: 2 }).catch((error) => {
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

function primeCurrentAiJudgeQuestionRevision(phase) {
    if (!phase || state.judgeMode !== "ai" || phase.kind !== "judgeQuestion") return;
    void maybePrepareAiJudgeQuestion(phase.caseNum, phase.judgeNumber).catch((error) => {
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
}

function updatePhaseHeader() {
    const phase = getCurrentPhase();
    if (!state.started && !state.completed) {
        currentPhaseTitleEl.textContent = l("Setup", "Configuration");
        currentPhaseMetaEl.textContent = l("Upload two cases and start the match.", "Téléversez deux cas et démarrez le match.");
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

function maybeAutoTriggerCurrentPhase() {
    const phase = getCurrentPhase();
    if (!phase || !state.phaseReady || state.completed) return;
    if (state.busy || state.isRecording || state.voiceFinalizePending) return;
    if (isCurrentPhaseAwaitingPlayback(phase)) return;
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
    appendMessage("judge", name, cleanText, {
        caseNum: phase.caseNum,
            phaseId: phase.id,
            judgeNumber: judge.number,
            silent: true
    });
    const preparedAnswerTarget = getJudgeAnswerTargetForQuestionPhase(phase);
    if (preparedAnswerTarget && isAiControlledRole(preparedAnswerTarget.speaker)) {
        void maybePrepareAiTurnForPhase(preparedAnswerTarget).catch((error) => {
            console.error("AI judge-answer preparation failed:", error);
        });
    }
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
            if (!stopRecordingAndFinalize("timeout", l("Time is up. Finalizing the recorded text and submitting it.", "Le temps est écoulé. Finalisation du texte enregistré et soumission."))) {
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
        state.timer.remaining -= 1;
        if (state.timer.remaining < 0) state.timer.remaining = 0;
        timerDisplayEl.textContent = formatClock(state.timer.remaining);
        const currentPhase = getCurrentPhase();
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
        return;
    }
    scoreSummaryEl.textContent = isFrenchLocale()
    ? `${caseLabel(1)} mené par : ${speakerName(state.leadByCase[1])}. ${caseLabel(2)} mené par : ${speakerName(state.leadByCase[2])}. Mode des juges : ${state.judgeMode === "ai" ? "juges IA" : "juges humains"}.`
    : `Case #1 leader: ${speakerName(state.leadByCase[1])}. Case #2 leader: ${speakerName(state.leadByCase[2])}. Judge mode: ${state.judgeMode === "ai" ? "AI judges" : "Human judges"}.`;
}

function renderScorecards(cards, tally, sourceMode = "ai") {
    scoreCardsEl.innerHTML = "";
    cards.forEach((card) => {
        const article = document.createElement("article");
        article.className = "score-card";
        const head = document.createElement("div");
        head.className = "score-card-head";
        const name = document.createElement("div");
        name.className = "phase-title";
        name.textContent = card.name || l("Judge", "Juge");
        const pill = document.createElement("span");
        pill.className = "score-pill";
        if (card.humanScore > card.aiScore) pill.textContent = isFrenchLocale() ? `Vote pour ${speakerName("human")}` : `${speakerName("human")} vote`;
        else if (card.aiScore > card.humanScore) pill.textContent = isFrenchLocale() ? `Vote pour ${speakerName("ai")}` : `${speakerName("ai")} vote`;
        else pill.textContent = l("Tie vote", "Vote nul");
        head.appendChild(name);
        head.appendChild(pill);
        const scores = document.createElement("div");
        scores.className = "score-note";
        scores.textContent = `${speakerName("human")}: ${card.humanScore}/60 • ${speakerName("ai")}: ${card.aiScore}/60`;
        article.appendChild(head);
        article.appendChild(scores);

        if (card.humanBreakdown) {
            const humanBreakdownNote = document.createElement("div");
            humanBreakdownNote.className = "score-note";
            humanBreakdownNote.textContent = isFrenchLocale()
            ? `${speakerName("human")} — détail : ${formatOfficialParticipantBreakdown(card.humanBreakdown)}`
            : `${speakerName("human")} breakdown: ${formatOfficialParticipantBreakdown(card.humanBreakdown)}`;
            article.appendChild(humanBreakdownNote);
        }
        if (card.aiBreakdown) {
            const aiBreakdownNote = document.createElement("div");
            aiBreakdownNote.className = "score-note";
            aiBreakdownNote.textContent = isFrenchLocale()
            ? `${speakerName("ai")} — détail : ${formatOfficialParticipantBreakdown(card.aiBreakdown)}`
            : `${speakerName("ai")} breakdown: ${formatOfficialParticipantBreakdown(card.aiBreakdown)}`;
            article.appendChild(aiBreakdownNote);
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
        } else if (card.comment) {
            const genericNote = document.createElement("div");
            genericNote.className = "score-note";
            genericNote.textContent = card.comment;
            article.appendChild(genericNote);
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
    let humanVotes = 0;
    let aiVotes = 0;
    cards.forEach((card) => {
        if (card.humanScore > card.aiScore) humanVotes += 1;
        else if (card.aiScore > card.humanScore) aiVotes += 1;
        else {
            humanVotes += 0.5;
            aiVotes += 0.5;
        }
    });
    let result = "tie";
    if (humanVotes > aiVotes) result = "human";
    if (aiVotes > humanVotes) result = "ai";
    return { humanVotes, aiVotes, result };
}

function parseApiErrorText(raw) {
    try {
        const parsed = JSON.parse(raw);
        return parsed?.error?.message || raw;
    } catch {
        return raw;
    }
}

async function parseApiError(response) {
    const raw = await response.text();
    return parseApiErrorText(raw) || `HTTP ${response.status}`;
}

function extractTextFromOutputItem(item) {
    if (!item || typeof item !== "object") return "";
    let text = "";
    if (typeof item.text === "string") text += item.text;
    if (typeof item.output_text === "string") text += item.output_text;
    if (typeof item.refusal === "string") text += item.refusal;
    if (typeof item.content === "string") text += item.content;
    if (Array.isArray(item.content)) {
        item.content.forEach((part) => {
            if (typeof part?.text === "string") text += part.text;
            if (typeof part?.refusal === "string") text += part.refusal;
            if (typeof part?.content === "string") text += part.content;
        });
    }
    return text;
}

function tryParseJsonString(raw) {
    const text = stripJsonFence(String(raw || "").trim());
    if (!text) return null;
    try { return JSON.parse(text); } catch {}
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) {
        try { return JSON.parse(text.slice(first, last + 1)); } catch {}
    }
    return null;
}

function extractStructuredJsonFromOutputItem(item) {
    if (!item || typeof item !== "object") return null;
    if (item.parsed && typeof item.parsed === "object") return item.parsed;
    if (item.json && typeof item.json === "object") return item.json;
    if (item.output_json && typeof item.output_json === "object") return item.output_json;
    if (item.result && typeof item.result === "object") return item.result;
    if (Array.isArray(item.content)) {
        for (const part of item.content) {
            if (!part || typeof part !== "object") continue;
            if (part.parsed && typeof part.parsed === "object") return part.parsed;
            if (part.json && typeof part.json === "object") return part.json;
            if (part.output_json && typeof part.output_json === "object") return part.output_json;
            if (part.result && typeof part.result === "object") return part.result;
            const parsedFromText = tryParseJsonString(part.text || part.output_text || part.content || part.arguments || "");
            if (parsedFromText && typeof parsedFromText === "object") return parsedFromText;
        }
    }
    const parsedFromStrings = tryParseJsonString(item.text || item.output_text || item.content || item.arguments || "");
    if (parsedFromStrings && typeof parsedFromStrings === "object") return parsedFromStrings;
    return null;
}

function extractStructuredJsonFromResponseObject(responseObj) {
    if (!responseObj || typeof responseObj !== "object") return null;
    if (responseObj.output_parsed && typeof responseObj.output_parsed === "object") return responseObj.output_parsed;
    if (responseObj.parsed && typeof responseObj.parsed === "object") return responseObj.parsed;
    if (Array.isArray(responseObj.output)) {
        for (const item of responseObj.output) {
            const parsed = extractStructuredJsonFromOutputItem(item);
            if (parsed && typeof parsed === "object") return parsed;
        }
    }
    let fallbackText = "";
    if (typeof responseObj.output_text === "string") fallbackText = responseObj.output_text;
    else if (Array.isArray(responseObj.output_text)) {
        fallbackText = responseObj.output_text.map((item) => {
            if (typeof item === "string") return item;
            if (typeof item?.text === "string") return item.text;
            return "";
        }).join("");
    } else if (typeof responseObj.text === "string") fallbackText = responseObj.text;
    const parsedFromFallback = tryParseJsonString(fallbackText);
    return parsedFromFallback && typeof parsedFromFallback === "object" ? parsedFromFallback : null;
}

function extractTextFromResponseObject(responseObj) {
    if (!responseObj || typeof responseObj !== "object") return "";
    if (typeof responseObj.output_text === "string" && responseObj.output_text.trim()) return responseObj.output_text.trim();
    if (Array.isArray(responseObj.output_text)) {
        const joined = responseObj.output_text.map((item) => {
            if (typeof item === "string") return item;
            if (typeof item?.text === "string") return item.text;
            return "";
        }).join("").trim();
        if (joined) return joined;
    }
    if (typeof responseObj.text === "string" && responseObj.text.trim()) return responseObj.text.trim();
    const output = Array.isArray(responseObj.output) ? responseObj.output : [];
    return output.map(extractTextFromOutputItem).join("").trim();
}

function modelSupportsReasoningEffort(modelName) {
    return /^gpt-5(?:[.-]|$)/i.test(String(modelName || ""));
}

async function callOpenAI({
    model = DEFAULT_JUDGE_MODEL,
    systemPrompt,
    userPrompt,
    maxTokens = 800,
    reasoningEffort = null,
    jsonSchema = null
}) {
    const apiKey = getApiKey();
    if (!apiKey) {
        openApiKeyDialog();
        throw new Error(l("Choose or save an API key first.", "Choisissez ou enregistrez d’abord une clé API."));
    }
    const resolvedModel = String(model || DEFAULT_JUDGE_MODEL).trim() || DEFAULT_JUDGE_MODEL;
    const body = {
        model: resolvedModel,
        instructions: [HARDCODED_ETHICS_BOWL_RULES, localeDirectiveForModels(), systemPrompt].filter(Boolean).join("\n\n"),
        input: userPrompt,
        max_output_tokens: maxTokens
    };
    if (jsonSchema) {
        body.text = {
            format: {
                type: "json_schema",
                name: jsonSchema.name,
                strict: jsonSchema.strict !== false,
                schema: jsonSchema.schema
            }
        };
    }
    if (reasoningEffort && modelSupportsReasoningEffort(resolvedModel)) body.reasoning = { effort: reasoningEffort };
    const response = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(await parseApiError(response));
    const data = await response.json();
    if (jsonSchema) {
        const structured = extractStructuredJsonFromResponseObject(data);
        if (structured && typeof structured === "object") return structured;
        const text = extractTextFromResponseObject(data);
        const parsed = tryParseJsonString(text);
        if (parsed && typeof parsed === "object") return parsed;
        throw new Error(l("The model returned no structured JSON.", "Le modèle n’a renvoyé aucun JSON structuré."));
    }
    const text = extractTextFromResponseObject(data);
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

function buildAiScoringSystemPrompt(judgeNumber = null) {
    const instructions = getStoredText(STORAGE_KEYS.instructions);
    return [
        judgeNumber
        ? `You are Judge ${judgeNumber}, one neutral academic philosopher judge filling out one independent final score sheet.`
        : "You are a neutral academic philosopher judge filling out one independent final score sheet.",
        "Use careful ethical reasoning and apply the rubric strictly before assigning each numeric subscore.",
        "Use the exact hardcoded score-sheet categories and numeric ranges supplied by the app.",
        "Treat the transcript provided by the app as the source of truth for what was said.",
        "Work independently. Do not simulate a panel and do not return multiple judges in one answer.",
        "Return only valid JSON.",
        "Use whole-number scores only.",
        "Score Participant 1 and Participant 2 separately and fairly.",
        "Do not reward or penalize either participant for being human-controlled or AI-controlled.",
        instructions ? `Additional model instructions:\n${instructions}` : ""
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
    state.lastJudgeQuestionByCase[phase.caseNum] = clean;
    state.askedJudgeQuestions[phase.id] = clean;
    const answerPhaseId = getJudgeAnswerPhaseId(phase.caseNum, phase.judgeNumber);
    state.askedJudgeQuestions[answerPhaseId] = clean;
    delete state.aiPreparedTurns[answerPhaseId];
    delete state.aiPreparationErrors[answerPhaseId];
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
            const raw = await callOpenAI({
                model: getJudgeModel(),
                                         systemPrompt: buildAiJudgeSystemPrompt(),
                                         userPrompt: prompt,
                                         maxTokens: 600,
                                         reasoningEffort: "low"
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
            const raw = await callOpenAI({
                model: getJudgeModel(),
                                         systemPrompt: buildAiJudgeSystemPrompt(),
                                         userPrompt: prompt,
                                         maxTokens: 600,
                                         reasoningEffort: "low"
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
    const caseTranscript = clipText(transcriptAsPlainText(phase.caseNum), 15000);
    const wordGuidance = getPhaseWordGuidance(phase);

    let phaseInstruction = "";
    let targetWords = "";

    if (phase.kind === "speech" && phase.subtype === "presentation") {
        phaseInstruction =
        "Give a concise Ethics Bowl presentation. Answer the moderator's question directly. The judges' grading criteria are A (0-5): The participant presented a clear, identifiable position and supported it with identifiable reasons and the reasons were well articulated and jointly coherent. Criterion B (0-5): The participant identified the deep moral tension or tensions and applied moral concepts, such as duties, values, rights, or responsibilities, to relevant aspects of the case in a way that tackled the underlying moral tensions within the case. Presentation criterion C (0-5): The participant acknowledged strong, conflicting viewpoints and charitably explained why they pose a serious challenge to the participant's position and argued that the participant's position better defuses the moral tension within the case.";
    targetWords = `Length target: ${wordGuidance.min}-${wordGuidance.max} words. Aim near ${wordGuidance.preferredTarget} words. Hard cap: ${wordGuidance.max} words.`;
    }
    if (phase.kind === "speech" && phase.subtype === "commentary") {
        phaseInstruction =
        "Offer a concise commentary on the leading participant's presentation. The judges' grading criteria are (0-10): The participant prioritized the main suggestions, questions, and critiques and charitably explained why they pose a serious challenge to the participant's position, in a way that made the participant's position clearer, and refined the participant's position, or clearly explained why such refinement was not required.";
    targetWords = `Length target: ${wordGuidance.min}-${wordGuidance.max} words. Aim near ${wordGuidance.preferredTarget} words. Hard cap: ${wordGuidance.max} words.`;
    }
    if (phase.kind === "speech" && phase.subtype === "response") {
        phaseInstruction =
        "Respond directly to the commentary and address the main challenge fairly. The judges' grading criteria are (0-10): The participant developed a manageably small number of suggestions, questions, and critiques and constructively critiqued the presentation with focus on salient, important moral considerations and provided the presenting participant with novel options to modify their position.";
    targetWords = `Length target: ${wordGuidance.min}-${wordGuidance.max} words. Aim near ${wordGuidance.preferredTarget} words. Hard cap: ${wordGuidance.max} words.`;
    }
    if (isJudgeAnswer) {
        phaseInstruction = [
            "Answer the judge's exact question as posed.",
            "Your first sentence must directly answer that exact question.",
            "If the question is yes/no, start with 'Yes' or 'No.'",
            "If the question asks which principle, value, duty, or consideration matters most, name it explicitly in the first sentence.",
            "Do not sidestep, broaden, or reframe the question before answering it.",
            "The judges' grading criteria are (0-20): The participant answered the judge's question clearly, explicitly explained how the question impacts the participant's position in a way that made the participant's position clearer and refined the participant's position, or clearly explained why such refinement was not required."
        ].join(" ");
        targetWords = `Length target: ${wordGuidance.min}-${wordGuidance.max} words. Aim near ${wordGuidance.preferredTarget} words. Hard cap: ${wordGuidance.max} words.`;
        return [
            `Current phase: ${phase.title}`,
            `Exact judge question:\n${judgeQuestion || "[Missing judge question]"}`,
            phaseInstruction,
            targetWords,
            "Before finalizing internally, check the approximate word count and keep the answer inside the target range.",
            `Current case title: ${caseData.title}`,
            `Moderator question: ${caseData.question}`,
            `Case text:\n${clipText(caseData.text, 6000)}`,
            `Transcript so far for this case:\n${caseTranscript || "[No prior transcript for this case yet.]"}`,
            "Stay tightly focused on the judge's exact wording.",
            "Output plain text only."
        ].filter(Boolean).join("\n\n");
    }
    return [
        `Current case title: ${caseData.title}`,
        `Moderator question: ${caseData.question}`,
        `Case text:\n${clipText(caseData.text, 9000)}`,
        `Transcript so far for this case:\n${caseTranscript || "[No prior transcript for this case yet.]"}`,
        `Current phase: ${phase.title}`,
        phaseInstruction,
        targetWords,
        "Output plain text only."
    ].filter(Boolean).join("\n\n");
}

function buildAiTurnRevisionPrompt(phase, draftText, revisionNumber, totalRevisions, baselineWordCount = 0) {
    const draft = sanitizeText(draftText);
    const wordPlan = getAiRevisionWordPlan(phase, baselineWordCount, draft);
    const wordCountSection = wordPlan ? [
        `Original first-draft word count: ${wordPlan.originalDraftWordCount || wordPlan.currentDraftWordCount} words.`,
        `Current draft word count: ${wordPlan.currentDraftWordCount} words.`,
        wordPlan.originalDraftWordCount && wordPlan.originalDraftWordCount !== wordPlan.targetWordCount
        ? `Because this phase must stay within ${wordPlan.hardMin}-${wordPlan.hardMax} words, revise toward ${wordPlan.targetWordCount} words.`
        : `Target about ${wordPlan.targetWordCount} words.`,
        `Allowed revision window for this pass: ${wordPlan.allowedMin}-${wordPlan.allowedMax} words.`,
        `Hard cap: ${wordPlan.hardMax} words.`,
        "You must hit the word target exactly.",
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

async function enforcePhaseWordCount(phase, draftText, options = {}) {
    const draft = sanitizeText(draftText);
    const guidance = getPhaseWordGuidance(phase);
    if (!draft || !guidance) return draft;
    const mode = options.mode === "revision" ? "revision" : "initial";
    const baselineWordCount = Math.max(0, Math.round(Number(options.baselineWordCount) || 0));
    const plan = getAiRevisionWordPlan(phase, baselineWordCount, draft);
    const currentWordCount = countWords(draft);
    const allowedMin = mode === "revision" ? plan.allowedMin : guidance.min;
    const allowedMax = mode === "revision" ? plan.allowedMax : guidance.max;
    const targetWordCount = mode === "revision" ? plan.targetWordCount : guidance.preferredTarget;
    if (currentWordCount >= allowedMin && currentWordCount <= allowedMax) return draft;
    const prompt = [
        `You are fixing the word count for ${phase.title}.`,
        buildAiTurnPrompt(phase),
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
        `Current draft:\n${clipText(draft, 15000)}`,
        "Output plain text only."
    ].join("\n\n");
    const repaired = sanitizeText(await callOpenAI({
        model: getParticipantModel(phase.speaker),
                                                   systemPrompt: buildAiDebaterSystemPrompt(phase.speaker),
                                                   userPrompt: prompt,
                                                   maxTokens: phase.kind === "judgeAnswer" ? 1200 : phase.subtype === "presentation" ? 2000 : 2000,
                                                   reasoningEffort: "low"
    }));
    return pickBetterWordCountDraft(draft, repaired, targetWordCount, allowedMin, allowedMax);
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
    const revised = sanitizeText(await callOpenAI({
        model: getParticipantModel(phase.speaker),
                                                  systemPrompt: buildAiDebaterSystemPrompt(phase.speaker),
                                                  userPrompt: prompt,
                                                  maxTokens: 1200,
                                                  reasoningEffort: "low"
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
        const text = sanitizeText(await maybePrepareAiTurnForPhase(targetPhase, { revisionPasses: 2 }));
        if (!text) throw new Error(l("The model returned no text.", "Le modèle n’a renvoyé aucun texte."));
        const current = getCurrentPhase();
        if (!current || current.id !== phaseId || state.completed) {
            setStatus(isFrenchLocale() ? `Le caucus de ${speaker} s’est terminé après le changement de phase.` : `${speaker}'s conferral finished after the phase had already moved on.`);
            return false;
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
        clearPhaseAwaitingPlayback(phaseId);
        setStatus(error?.message || l("Failed during AI conferral.", "Échec pendant le caucus IA."), true);
        return false;
    } finally {
        setBusy(false);
    }
}

async function generateAiTurnForPhase(phase) {
    const phaseId = phase?.id || "";
    if (!phaseId) return false;
    const speaker = speakerName(phase.speaker);
    const hasPrepared = !!getPreparedAiTurnText(phaseId);
    const hasPendingPreparation = !!state.aiPreparationPromises[phaseId];
    setBusy(true);
    setStatus(
        hasPrepared
        ? isFrenchLocale() ? `${speaker} est prêt.` : `${speaker}'s ${phase.subtype || "answer"} is ready.`
        : hasPendingPreparation
        ? isFrenchLocale() ? `Finalisation du texte préparé de ${speaker}...` : `Finishing ${speaker}'s prepared ${phase.subtype || "answer"}...`
        : isFrenchLocale() ? `Génération du texte de ${speaker}...` : `Generating ${speaker}'s ${phase.subtype || "answer"}...`
    );
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
                onPlaybackComplete: () => {
                    const activePhase = getCurrentPhase();
                    if (!activePhase || activePhase.id !== phaseId || state.completed) return;
                    if (state.phaseAwaitingPlaybackForId !== phaseId) return;
                    clearPhaseAwaitingPlayback(phaseId);
                    advancePhase();
                }
        });
        setStatus(isFrenchLocale() ? `${speaker} a terminé.` : `${speaker} has finished.`);
        return true;
    } catch (error) {
        console.error(error);
        clearPhaseAwaitingPlayback(phaseId);
        setStatus(error?.message || l("Failed to generate the AI turn.", "La génération du tour IA a échoué."), true);
        return false;
    } finally {
        setBusy(false);
    }
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
        setPhaseAwaitingPlayback(phaseId);
        appendMessage("judge", judgeLabel(phase.judgeNumber), finalQuestion, {
            caseNum: phase.caseNum,
                phaseId,
                judgeNumber: phase.judgeNumber,
                onPlaybackComplete: () => {
                    const activePhase = getCurrentPhase();
                    if (!activePhase || activePhase.id !== phaseId || state.completed) return;
                    if (state.phaseAwaitingPlaybackForId !== phaseId) return;
                    clearPhaseAwaitingPlayback(phaseId);
                    advancePhase();
                }
        });
        const preparedAnswerTarget = getJudgeAnswerTargetForQuestionPhase(phase);
        if (preparedAnswerTarget && isAiControlledRole(preparedAnswerTarget.speaker)) {
            void maybePrepareAiTurnForPhase(preparedAnswerTarget).catch((error) => {
                console.error("AI judge-answer preparation failed:", error);
            });
        }
        setStatus(isFrenchLocale() ? `${judgeLabel(phase.judgeNumber)} a posé sa question.` : `${judgeLabel(phase.judgeNumber)} has asked a question.`);
        return true;
    } catch (error) {
        console.error(error);
        clearPhaseAwaitingPlayback(phaseId);
        setStatus(error?.message || l("Failed to generate the judge question.", "La génération de la question du juge a échoué."), true);
        return false;
    } finally {
        setBusy(false);
    }
}

function normalizeIntegerScore(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(60, n));
}

function normalizeIntegerScoreInRange(value, min, max) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return null;
    return Math.max(min, Math.min(max, n));
}

function normalizeOfficialParticipantBreakdown(raw) {
    if (!raw || typeof raw !== "object") return null;
    const breakdown = {
        presentationQuestion: normalizeIntegerScoreInRange(raw.presentationQuestion, 1, 5),
        presentationEthics: normalizeIntegerScoreInRange(raw.presentationEthics, 1, 5),
        presentationViewpoints: normalizeIntegerScoreInRange(raw.presentationViewpoints, 1, 5),
        responseToFeedback: normalizeIntegerScoreInRange(raw.responseToFeedback, 0, 10),
        judgesQuestions: normalizeIntegerScoreInRange(raw.judgesQuestions, 0, 20),
        commentary: normalizeIntegerScoreInRange(raw.commentary, 0, 10),
        respectfulDialogue: normalizeIntegerScoreInRange(raw.respectfulDialogue, 0, 5),
        comment: sanitizeText(raw.comment)
    };
    const requiredKeys = [
        "presentationQuestion", "presentationEthics", "presentationViewpoints",
        "responseToFeedback", "judgesQuestions", "commentary", "respectfulDialogue"
    ];
    return requiredKeys.every((key) => breakdown[key] != null) ? breakdown : null;
}

function totalOfficialParticipantBreakdown(breakdown) {
    if (!breakdown) return null;
    return breakdown.presentationQuestion + breakdown.presentationEthics + breakdown.presentationViewpoints + breakdown.responseToFeedback + breakdown.judgesQuestions + breakdown.commentary + breakdown.respectfulDialogue;
}

function formatOfficialParticipantBreakdown(breakdown) {
    if (!breakdown) return "";
    const presentationTotal = breakdown.presentationQuestion + breakdown.presentationEthics + breakdown.presentationViewpoints;
    if (isFrenchLocale()) {
        return [
            `Présentation ${presentationTotal}/15`,
            `(${breakdown.presentationQuestion}/5 clarté/cohérence, ${breakdown.presentationEthics}/5 éthique, ${breakdown.presentationViewpoints}/5 points de vue)`,
            `Réponse aux commentaires ${breakdown.responseToFeedback}/10`,
            `Réponses aux juges ${breakdown.judgesQuestions}/20`,
            `Commentaire ${breakdown.commentary}/10`,
            `Dialogue respectueux ${breakdown.respectfulDialogue}/5`
        ].join(" • ");
    }
    return [
        `Presentation ${presentationTotal}/15`,
        `(${breakdown.presentationQuestion}/5 clear/coherent, ${breakdown.presentationEthics}/5 ethics, ${breakdown.presentationViewpoints}/5 viewpoints)`,
        `Response to feedback ${breakdown.responseToFeedback}/10`,
        `Judges' questions ${breakdown.judgesQuestions}/20`,
        `Commentary ${breakdown.commentary}/10`,
        `Respectful dialogue ${breakdown.respectfulDialogue}/5`
    ].join(" • ");
}

function buildAiSingleJudgeScoringPrompt(judgeNumber, scoringTranscript) {
    const participantOneLedCase = state.leadByCase[1] === "human" ? 1 : 2;
    const participantTwoLedCase = state.leadByCase[1] === "ai" ? 1 : 2;
    return [
        `This is a completed Ethics Bowl-style match between Participant 1, "${speakerName("human")}", and Participant 2, "${speakerName("ai")}".`,
        `You are Judge ${judgeNumber}. Complete exactly one independent final score sheet. Do not simulate the other judges or return a panel answer.`,
        `Participant 1 is ${participantControlSummary("human")}. Participant 2 is ${participantControlSummary("ai")}.`,
        "Score the arguments only. Do not reward or penalize a side for being human-controlled or AI-controlled.",
        OFFICIAL_SCORE_SHEET_TEXT.trim(),
        "Important scoring instructions:",
        `- For ${speakerName("human")} (Participant 1), the presentation /15, response to feedback /10, and judges' questions /20 must be based only on Case #${participantOneLedCase}.`,
        `- For ${speakerName("ai")} (Participant 2), the presentation /15, response to feedback /10, and judges' questions /20 must be based only on Case #${participantTwoLedCase}.`,
        `- ${speakerName("human")}'s commentary /10 must be based on the case not led by ${speakerName("human")}.`,
        `- ${speakerName("ai")}'s commentary /10 must be based on the case not led by ${speakerName("ai")}.`,
        "- Respectful dialogue /5 is across the full match.",
        "- Use whole numbers only.",
        "- All participant turns and judge questions/answers below are exact stored transcript entries from the app, reproduced in full.",
        "Return strict JSON exactly in this shape:",
        `{"name":"Judge ${judgeNumber}","participantOne":{"presentationQuestion":4,"presentationEthics":4,"presentationViewpoints":4,"responseToFeedback":8,"judgesQuestions":16,"commentary":8,"respectfulDialogue":5,"comment":"..."},"participantTwo":{"presentationQuestion":4,"presentationEthics":5,"presentationViewpoints":4,"responseToFeedback":7,"judgesQuestions":17,"commentary":8,"respectfulDialogue":5,"comment":"..."}}`,
        "Do not include markdown fences.",
        "Each comment should be brief, concrete, and charitable.",
        `Substantive transcript of the full match:\n${scoringTranscript}`
    ].join("\n\n");
}

function normalizeAiFinalJudgeScorecardResponse(rawJudge, judgeNumber) {
    const normalizedInput = typeof rawJudge === "string" ? extractJsonObject(rawJudge) : rawJudge;
    const source = (normalizedInput && typeof normalizedInput === "object" && normalizedInput.scorecard && typeof normalizedInput.scorecard === "object")
    ? normalizedInput.scorecard
    : (normalizedInput && typeof normalizedInput === "object" && normalizedInput.judge && typeof normalizedInput.judge === "object")
    ? normalizedInput.judge
    : Array.isArray(normalizedInput?.judges)
    ? normalizedInput.judges[0]
    : Array.isArray(normalizedInput)
    ? normalizedInput[0]
    : normalizedInput;

    const participantOneBreakdown = normalizeOfficialParticipantBreakdown(source?.participantOne || source?.human);
    const participantTwoBreakdown = normalizeOfficialParticipantBreakdown(source?.participantTwo || source?.ai);
    if (!participantOneBreakdown || !participantTwoBreakdown) throw new Error(l("AI judge did not return the full official score-sheet breakdown.", "Le juge IA n’a pas renvoyé le détail complet de la fiche officielle."));
    return {
        name: sanitizeText(source?.name) || judgeLabel(judgeNumber),
        humanScore: totalOfficialParticipantBreakdown(participantOneBreakdown),
        aiScore: totalOfficialParticipantBreakdown(participantTwoBreakdown),
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
            const prompt = buildAiSingleJudgeScoringPrompt(judgeNumber, scoringTranscript);
            const parsed = await callOpenAI({
                model: getJudgeModel(),
                                            systemPrompt: buildAiScoringSystemPrompt(judgeNumber),
                                            userPrompt: prompt,
                                            maxTokens: 3000,
                                            reasoningEffort: "medium",
                                            jsonSchema: FINAL_JUDGE_SCORECARD_JSON_SCHEMA
            });
            const card = normalizeAiFinalJudgeScorecardResponse(parsed, judgeNumber);
            if (expectedRunId !== state.matchRunId) return null;
            state.aiFinalJudgeScorecards[judgeNumber] = card;
            delete state.aiFinalJudgeScoringErrors[judgeNumber];
            return card;
        } catch (error) {
            if (expectedRunId === state.matchRunId) state.aiFinalJudgeScoringErrors[judgeNumber] = error?.message || isFrenchLocale() ? `La génération de la fiche finale du ${judgeLabel(judgeNumber)} a échoué.` : `Failed to generate Judge ${judgeNumber}'s final scorecard.`;
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

function validateBeforeStart() {
    if (!getApiKey()) {
        openApiKeyDialog();
        throw new Error(l("Choose or save an API key first.", "Choisissez ou enregistrez d’abord une clé API."));
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

function syncLiveSpeechToUi() {
    const liveText = getCurrentLiveSpeechText();
    showLiveVoicePreview(liveText || l("Listening...", "Écoute..."));
    messageInputEl.value = combineDraftAndSpeech(state.draftBeforeRecording, liveText);
    syncActiveJudgeDraftFromMainComposer();
}

function resetLiveSpeechState() {
    state.liveSpeechFinal = "";
    state.liveSpeechInterim = "";
    state.draftBeforeRecording = "";
    hideLiveVoicePreview();
}

function clearVoiceAutoSendTimer() {
    if (state.voiceAutoSendTimer) {
        clearTimeout(state.voiceAutoSendTimer);
        state.voiceAutoSendTimer = null;
    }
}

function cancelPendingVoiceAutoSend() {
    clearVoiceAutoSendTimer();
    state.voiceAutoSendArmed = false;
    state.voiceAutoSendExpectedText = "";
}

function armVoiceAutoSendTimer(delayMs = VOICE_AUTO_SEND_DELAY_MS) {
    clearVoiceAutoSendTimer();
    state.voiceAutoSendTimer = window.setTimeout(attemptVoiceAutoSend, Math.max(0, delayMs));
}

function scheduleVoiceAutoSend() {
    cancelPendingVoiceAutoSend();
}

function attemptVoiceAutoSend() {
    cancelPendingVoiceAutoSend();
}

function clearVoiceSilenceTimer() {
    if (state.voiceSilenceTimer) {
        clearTimeout(state.voiceSilenceTimer);
        state.voiceSilenceTimer = null;
    }
}

function resetVoiceCaptureState() {
    clearVoiceSilenceTimer();
    state.voiceSpeechDetected = false;
    state.voiceAutoSubmitSuppressed = false;
    state.voiceStopReason = "";
    state.voiceFinalizePending = false;
}

function noteVoiceActivity(text) {
    if (!state.isRecording) return;
    const normalized = normalizeSpeechText(text);
    if (!normalized) return;
    state.voiceSpeechDetected = true;
    clearVoiceSilenceTimer();
}

function getVoiceComposerPhaseContext() {
    return getPhaseById(state.pendingVoiceSubmission?.phaseId || "") || getCurrentPhase();
}

function getVoiceResultStatus({ usedLiveFallback = false, transcriptionFailed = false, pendingSubmitReason = "" } = {}) {
    const phase = getVoiceComposerPhaseContext();
    const isJudgeQuestion = isHumanJudgeQuestionPhase(phase);
    const reviewPhrase = isJudgeQuestion
    ? l("Review it and press Ask when ready.", "Relisez et cliquez sur Poser la question quand vous êtes prête.")
    : l("Review it and press Send when ready.", "Relisez et cliquez sur Soumettre quand vous êtes prête.");
    if (pendingSubmitReason === "timeout") {
        if (transcriptionFailed && usedLiveFallback) {
            return isJudgeQuestion
            ? l("Time is up. OpenAI transcription failed, so the live transcript was kept and the question will be asked.", "Le temps est écoulé. La transcription OpenAI a échoué, donc le texte en direct a été conservé et la question sera posée.")
            : l("Time is up. OpenAI transcription failed, so the live transcript was kept and will be submitted.", "Le temps est écoulé. La transcription OpenAI a échoué, donc le texte en direct a été conservé et sera soumis.");
        }
        if (usedLiveFallback) {
            return isJudgeQuestion
            ? l("Time is up. Using the live transcript and asking the question.", "Le temps est écoulé. Utilisation du texte en direct et envoi de la question.")
            : l("Time is up. Using the live transcript and submitting it.", "Le temps est écoulé. Utilisation du texte en direct et soumission.");
        }
        return isJudgeQuestion
        ? l("Time is up. Finalizing the transcript and asking the question.", "Le temps est écoulé. Finalisation de la transcription et envoi de la question.")
        : l("Time is up. Finalizing the transcript and submitting it.", "Le temps est écoulé. Finalisation de la transcription et soumission.");
    }
    if (pendingSubmitReason === "manual") {
        if (transcriptionFailed && usedLiveFallback) {
            return isJudgeQuestion
            ? l("OpenAI transcription failed, so the live transcript was kept. Asking the question now.", "La transcription OpenAI a échoué, donc le texte en direct a été conservé. Envoi de la question maintenant.")
            : l("OpenAI transcription failed, so the live transcript was kept. Submitting now.", "La transcription OpenAI a échoué, donc le texte en direct a été conservé. Soumission en cours.");
        }
        if (usedLiveFallback) {
            return isJudgeQuestion
            ? l("Using the live transcript. Asking the question now.", "Utilisation du texte en direct. Envoi de la question maintenant.")
            : l("Using the live transcript. Submitting now.", "Utilisation du texte en direct. Soumission en cours.");
        }
        return isJudgeQuestion
        ? l("Finalizing the transcript and asking the question now.", "Finalisation de la transcription et envoi de la question.")
        : l("Finalizing the transcript and submitting now.", "Finalisation de la transcription et soumission.");
    }
    if (transcriptionFailed && usedLiveFallback) {
        return isFrenchLocale()
        ? `La transcription OpenAI a échoué, donc le texte en direct a été conservé. ${reviewPhrase}`
        : `OpenAI transcription failed, so the live transcript was kept. ${reviewPhrase}`;
    }
    if (usedLiveFallback) return isFrenchLocale() ? `Texte en direct utilisé. ${reviewPhrase}` : `Used the live transcript. ${reviewPhrase}`;
    return isFrenchLocale() ? `Texte vocal inséré. ${reviewPhrase}` : `Voice text inserted. ${reviewPhrase}`;
}

function applyVoiceInputResult(voiceText, statusText, options = {}) {
    const combined = combineDraftAndSpeech(state.draftBeforeRecording, voiceText);
    const { isError = false } = options;
    messageInputEl.value = combined;
    syncActiveJudgeDraftFromMainComposer({ persist: true });
    setStatus(statusText, isError);
}

function getSpeechRecognitionCtor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function stopTrackSpeechRecognition() {
    state.recognitionShouldRestart = false;
    if (!state.recognition) return;
    try { state.recognition.stop(); } catch {}
}

function startTrackSpeechRecognition() {
    const SpeechRecognitionCtor = getSpeechRecognitionCtor();
    if (!SpeechRecognitionCtor) return false;
    try {
        const recognition = new SpeechRecognitionCtor();
        state.recognition = recognition;
        state.recognitionShouldRestart = true;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = isFrenchLocale() ? "fr-CA" : (document.documentElement.lang || navigator.language || "en-US");
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
            if (state.livePreviewMode !== "recognition") return;
            const previousLiveText = getCurrentLiveSpeechText();
            let interim = "";
            for (let i = event.resultIndex; i < event.results.length; i += 1) {
                const transcript = event.results[i]?.[0]?.transcript || "";
                if (event.results[i].isFinal) {
                    state.liveSpeechFinal = normalizeSpeechText(`${state.liveSpeechFinal} ${transcript}`);
                } else {
                    interim += ` ${transcript}`;
                }
            }
            state.liveSpeechInterim = normalizeSpeechText(interim);
            syncLiveSpeechToUi();
            const nextLiveText = getCurrentLiveSpeechText();
            if (nextLiveText && nextLiveText !== previousLiveText) noteVoiceActivity(nextLiveText);
        };

            recognition.onerror = (event) => {
                const ignorable = new Set(["aborted", "no-speech"]);
                if (!ignorable.has(event.error)) console.warn("SpeechRecognition error:", event.error);
                if (!state.isRecording) return;
                if (state.livePreviewMode !== "recognition") return;
                if (ignorable.has(event.error)) return;
                stopTrackSpeechRecognition();
                startApiLivePreview();
                setStatus(l("Recording... using OpenAI live preview.", "Enregistrement... utilisation de l’aperçu OpenAI en direct."));
            };

            recognition.onend = () => {
                if (state.isRecording && state.recognitionShouldRestart && state.livePreviewMode === "recognition") {
                    try {
                        recognition.start();
                    } catch (error) {
                        console.warn("SpeechRecognition restart failed:", error);
                        stopTrackSpeechRecognition();
                        startApiLivePreview();
                        setStatus(l("Recording... using OpenAI live preview.", "Enregistrement... utilisation de l’aperçu OpenAI en direct."));
                    }
                } else if (state.recognition === recognition) {
                    state.recognition = null;
                }
            };

            recognition.start();
            state.livePreviewMode = "recognition";
            return "recognition";
    } catch (error) {
        console.warn("SpeechRecognition unavailable:", error);
        state.recognition = null;
        state.recognitionShouldRestart = false;
        return false;
    }
}

function clearLivePreviewTimer() {
    if (state.livePreviewTimer) {
        clearInterval(state.livePreviewTimer);
        state.livePreviewTimer = null;
    }
}

function abortLivePreviewRequest() {
    if (state.livePreviewAbortController) {
        try { state.livePreviewAbortController.abort(); } catch {}
        state.livePreviewAbortController = null;
    }
}

async function requestApiLivePreview() {
    if (state.livePreviewMode !== "api") return;
    if (state.livePreviewInFlight) return;
    const apiKey = getApiKey();
    if (!apiKey) return;
    if (!state.audioChunks.length) return;
    const mime = state.mediaRecorder?.mimeType || "audio/webm";
    const blob = new Blob(state.audioChunks, { type: mime });
    if (!blob.size || blob.size < LIVE_PREVIEW_MIN_BLOB_BYTES) return;
    const requestId = ++state.livePreviewRequestId;
    const controller = new AbortController();
    state.livePreviewInFlight = true;
    state.livePreviewAbortController = controller;
    try {
        const formData = new FormData();
        const extension = mime.includes("ogg") ? "ogg" : "webm";
        formData.append("file", blob, `live-preview.${extension}`);
        formData.append("model", "gpt-4o-mini-transcribe");
        formData.append("language", isFrenchLocale() ? "fr" : "en");
        const response = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: formData,
            signal: controller.signal
        });
        if (!response.ok) throw new Error(await parseApiError(response));
        const data = await response.json();
        if (requestId !== state.livePreviewRequestId) return;
        if (state.livePreviewMode !== "api") return;
        const previewText = normalizeSpeechText(data?.text || "");
        if (!previewText) return;
        const previousLiveText = getCurrentLiveSpeechText();
        state.liveSpeechFinal = previewText;
        state.liveSpeechInterim = "";
        syncLiveSpeechToUi();
        setStatus(l("Recording... transcribing live.", "Enregistrement... transcription en direct."));
        const nextLiveText = getCurrentLiveSpeechText();
        if (nextLiveText && nextLiveText !== previousLiveText) noteVoiceActivity(nextLiveText);
    } catch (error) {
        if (error?.name !== "AbortError") console.warn("Live preview transcription failed:", error);
    } finally {
        if (state.livePreviewAbortController === controller) state.livePreviewAbortController = null;
        if (requestId === state.livePreviewRequestId) state.livePreviewInFlight = false;
    }
}

function startApiLivePreview() {
    stopTrackSpeechRecognition();
    clearLivePreviewTimer();
    abortLivePreviewRequest();
    state.livePreviewMode = "api";
    state.livePreviewInFlight = false;
    state.livePreviewRequestId += 1;
    state.livePreviewTimer = window.setInterval(() => { void requestApiLivePreview(); }, LIVE_PREVIEW_POLL_MS);
}

function stopApiLivePreview() {
    clearLivePreviewTimer();
    abortLivePreviewRequest();
    state.livePreviewInFlight = false;
    state.livePreviewRequestId += 1;
}

function startLivePreview() {
    stopLivePreview();
    state.liveSpeechFinal = "";
    state.liveSpeechInterim = "";
    if (startTrackSpeechRecognition()) return "recognition";
    startApiLivePreview();
    return "api";
}

function stopLivePreview() {
    clearVoiceSilenceTimer();
    stopTrackSpeechRecognition();
    stopApiLivePreview();
    state.livePreviewMode = "";
    if (state.recognition) state.recognition = null;
}

function hasUsableMediaStream(stream) {
    if (!stream || typeof stream.getAudioTracks !== "function") return false;
    const tracks = stream.getAudioTracks();
    if (!tracks.length) return false;
    return tracks.some((track) => track.readyState === "live");
}

function releaseMicrophoneStream() {
    stopLivePreview();
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
    clearVoiceSilenceTimer();
    state.mediaRecorder = null;
    state.audioChunks = [];
    refreshControls();
}

function stopRecordingAndFinalize(reason = "manual", statusText = l("Stopping recording...", "Arrêt de l’enregistrement...")) {
    if (!state.isRecording || !state.mediaRecorder) return false;
    state.voiceStopReason = reason;
    state.voiceFinalizePending = true;
    clearVoiceSilenceTimer();
    state.isRecording = false;
    refreshControls();
    stopLivePreview();
    try {
        if (state.mediaRecorder.state !== "inactive") state.mediaRecorder.stop();
    } catch {}
    setStatus(statusText);
    return true;
}

async function transcribeAudio(blob) {
    const apiKey = getApiKey();
    const liveFallback = getCurrentLiveSpeechText();
    let finalText = "";
    let statusText = "";
    let isError = false;
    let restoreDraft = false;
    try {
        if (!blob || !blob.size) {
            if (liveFallback) {
                finalText = liveFallback;
                statusText = getVoiceResultStatus({ usedLiveFallback: true, pendingSubmitReason: getPendingVoiceSubmissionReason() });
            } else {
                restoreDraft = true;
                statusText = getPendingVoiceSubmissionReason() === "timeout" ? l("Time is up. No audio was captured.", "Le temps est écoulé. Aucun audio n’a été capté.") : l("No audio was captured.", "Aucun audio n’a été capté.");
                isError = true;
            }
            return;
        }
        if (!apiKey) {
            openApiKeyDialog();
            if (liveFallback) {
                finalText = liveFallback;
                statusText = getVoiceResultStatus({ usedLiveFallback: true, pendingSubmitReason: getPendingVoiceSubmissionReason() });
                isError = true;
            } else {
                restoreDraft = true;
                statusText = l("Choose or save an API key first.", "Choisissez ou enregistrez d’abord une clé API.");
                isError = true;
            }
            return;
        }
        setBusy(true);
        setStatus(l("Finalizing transcript...", "Finalisation de la transcription..."));
        const formData = new FormData();
        const mime = blob.type || "audio/webm";
        const extension = mime.includes("ogg") ? "ogg" : "webm";
        formData.append("file", blob, `recording.${extension}`);
        formData.append("model", "gpt-4o-mini-transcribe");
        formData.append("language", isFrenchLocale() ? "fr" : "en");
        const response = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: formData
        });
        if (!response.ok) throw new Error(await parseApiError(response));
        const data = await response.json();
        finalText = normalizeSpeechText(data?.text || "") || liveFallback;
        if (!finalText) throw new Error(l("No speech was detected.", "Aucune parole n’a été détectée."));
        statusText = getVoiceResultStatus({ pendingSubmitReason: getPendingVoiceSubmissionReason() });
    } catch (error) {
        console.error("Transcription failed:", error);
        if (liveFallback) {
            finalText = liveFallback;
            statusText = getVoiceResultStatus({
                usedLiveFallback: true,
                transcriptionFailed: true,
                pendingSubmitReason: getPendingVoiceSubmissionReason()
            });
            isError = true;
        } else {
            restoreDraft = true;
            statusText = error?.message || l("Transcription failed.", "La transcription a échoué.");
            isError = true;
        }
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
    cancelPendingVoiceAutoSend();

    if (state.isRecording && state.mediaRecorder) {
        stopRecordingAndFinalize("manual", l("Stopping recording...", "Arrêt de l’enregistrement..."));
        return;
    }
    if (!navigator.mediaDevices || typeof MediaRecorder === "undefined") {
        setStatus(l("Audio recording is not supported in this browser.", "L’enregistrement audio n’est pas pris en charge dans ce navigateur."), true);
        return;
    }
    if (!getApiKey()) {
        openApiKeyDialog();
        setStatus(l("Choose or save an API key first.", "Choisissez ou enregistrez d’abord une clé API."), true);
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
        state.liveSpeechFinal = "";
        state.liveSpeechInterim = "";
        state.voiceSpeechDetected = false;
        state.voiceAutoSubmitSuppressed = false;
        state.voiceStopReason = "";
        state.voiceFinalizePending = false;
        state.isRecording = true;
        showLiveVoicePreview(l("Listening...", "Écoute..."));
        refreshControls();

        recorder.ondataavailable = (event) => {
            if (event.data && event.data.size) state.audioChunks.push(event.data);
        };

            recorder.onerror = () => {
                state.isRecording = false;
                stopLivePreview();
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
            const previewMode = startLivePreview();
            if (previewMode === "recognition") {
                setStatus(l("Recording... dictation will keep accumulating until you stop or submit.", "Enregistrement... la dictée s’accumule jusqu’à l’arrêt ou à la soumission."));
            } else {
                setStatus(l("Recording... live text is coming from OpenAI and will keep accumulating until you stop or submit.", "Enregistrement... le texte en direct provient d’OpenAI et s’accumule jusqu’à l’arrêt ou à la soumission."));
            }
    } catch (error) {
        console.error("Microphone error:", error);
        state.isRecording = false;
        stopLivePreview();
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
    cancelPendingVoiceAutoSend();
    stopSpeechPlayback(false, { resolveCallbacks: false });
    stopLivePreview();
    releaseMicrophoneStream();
    state.isRecording = false;
    state.voiceFinalizePending = false;
    clearPendingVoiceSubmission();

    state.transcript = [];
    state.phases = [];
    state.currentPhaseIndex = -1;
    state.busy = false;
    state.started = false;
    state.completed = false;
    state.waitingForCoinChoice = false;
    state.coinWinner = "";
    state.phaseReady = false;
    state.phaseAwaitingPlaybackForId = "";
    state.pendingAutoActionPhaseId = "";
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
    state.aiPreparationPromises = {};
    state.aiPreparationErrors = {};
    state.mainComposerHydratedPhaseId = "";
    state.speechChunkCounts = new Map();
    state.speechCompletionCallbacks = new Map();
    state.voiceMode = normalizeVoiceMode(voiceModeSelectEl?.value || "openai");
    state.participantTypes = {
        human: normalizeParticipantMode(participantOneTypeSelectEl?.value || "human"),
        ai: "ai"
    };
    state.participantModels = {
        human: normalizeMatchModel(participantOneModelSelectEl?.value || DEFAULT_PARTICIPANT_MODEL),
        ai: normalizeMatchModel(modelSelectEl?.value || DEFAULT_PARTICIPANT_MODEL)
    };
    state.judgeModel = DEFAULT_JUDGE_MODEL;
    resetLiveSpeechState();
    resetVoiceCaptureState();
    stopTimer();
    renderTranscript();
    renderPhaseList();
    clearScoreboard();
}

function fullReset() {
    resetStateForNewMatch();
    syncVoiceModeStateFromControls();
    syncParticipantSetupUi();
    currentPhaseTitleEl.textContent = l("Setup", "Configuration");
    currentPhaseMetaEl.textContent = l("Upload two cases and start the match.", "Téléversez deux cas et démarrez le match.");
    timerDisplayEl.textContent = "--:--";
    timerHintEl.textContent = l("No active timed phase yet.", "Aucune phase minutée en cours.");
    coinChoicePanelEl.hidden = true;
    messageInputEl.value = "";
    hideLiveVoicePreview();
    setStatus(
        getApiKey()
        ? l("Ready.", "Prêt.")
        : l("Choose or save an API key to begin.", "Choisissez ou enregistrez une clé API pour commencer.")
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

function startMatch() {
    try {
        const { case1, case2 } = validateBeforeStart();
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
        state.voiceMode = normalizeVoiceMode(voiceModeSelectEl?.value || "openai");
        updateVoiceDisclosure();

        appendMessage("moderator", moderatorLabel(), l(
            `Welcome to this Ethics Bowl-style match between ${state.names.human} and ${state.names.ai}. This site uses the official two-case structure, adapted for two single participants.`,
            `Bienvenue à ce match de la Coupe éthique Canada entre ${state.names.human} et ${state.names.ai}. Ce site utilise la structure officielle à deux cas, adaptée à deux participantes individuelles.`
        ));

        appendMessage("moderator", moderatorLabel(), l(
            `Participant 1, ${state.names.human}, is ${participantControlSummary("human")}. Participant 2, ${state.names.ai}, is ${participantControlSummary("ai")}. Any AI-controlled participant is treated as a single opponent, not a team.`,
                                                       `Le participant 1, ${state.names.human}, est ${participantControlSummary("human")}. Le participant 2, ${state.names.ai}, est ${participantControlSummary("ai")}. Toute participante contrôlée par l’IA est traitée comme une seule adversaire, et non comme une équipe.`
        ));

        appendMessage("moderator", moderatorLabel(), l(
            "The coin-toss winner chooses whether to lead or pass on Case #1, the other participant leads Case #2, there is a judges' period after each case, and both participants are questioned once during their led case.",
            "La gagnante du tirage choisit si elle mène ou passe au cas 1, l’autre participante mène le cas 2, il y a une période des juges après chaque cas, et chaque participante reçoit une question pendant le cas qu’elle mène."
        ));

        appendMessage("moderator", moderatorLabel(), l(
            "This match uses the official Ethics Bowl timings: three minutes for every confer period, five minutes for each presentation, three minutes for commentary and response, and a ten-minute judges' period divided evenly across the three judges.",
            "Ce match utilise les temps officiels du la Coupe éthique Canada : trois minutes pour chaque caucus, cinq minutes pour chaque présentation, trois minutes pour le commentaire et la réplique, et une période des juges de dix minutes répartie entre les trois juges."
        ));

        const coinCall = coinCallSelectEl.value;
        const coinResult = Math.random() < 0.5 ? "heads" : "tails";
        const winner = coinCall === coinResult ? "human" : "ai";
        state.coinWinner = winner;

        appendMessage("moderator", moderatorLabel(), isFrenchLocale()
        ? `${speakerName("human")} a choisi ${coinSideLabel(coinCall)}. Le résultat est ${coinSideLabel(coinResult)}. ${speakerName(winner)} gagne le tirage.`
        : `${speakerName("human")} called ${coinCall}. The coin is ${coinResult}. ${speakerName(winner)} wins the toss.`
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
        return isFrenchLocale()
        ? `Nous sommes maintenant prêtes à commencer le ${caseLabel(phase.caseNum)}. Le cas s’intitule « ${caseData.title} ». La question est : ${caseData.question} ${leader} mènera ce cas et ${responder} répondra.`
        : `We are ready to begin Case #${phase.caseNum}. The case is "${caseData.title}". The question is: ${caseData.question} ${leader} will lead this case, and ${responder} will respond.`;
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
        ? `Juges, veuillez maintenant attribuer le pointage du ${caseLabel(phase.caseNum)}. Le résultat final sera déterminé par les votes, et non seulement par le total cumulatif.`
        : `Judges, please score Case #${phase.caseNum} now. The match result will later be determined by votes, not cumulative score alone.`;
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
    if (phase.duration) {
        setTimerForPhase(phase);
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
            onPlaybackComplete: () => activatePhaseAfterModerator(phase.id)
    });
}

function advancePhase() {
    if (state.completed) return;
    if (state.currentPhaseIndex + 1 >= state.phases.length) return;
    cancelPendingVoiceAutoSend();
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

function refreshControls() {
    ensureSpeechUi();
    updateApiKeyUi();
    syncParticipantSetupUi();
    refreshParticipantScoreLabels();
    const phase = getCurrentPhase();
    const hasApiKey = !!getApiKey();
    const composerActive = currentPhaseUsesMainComposer(phase);
    const humanTurn = currentPhaseRequiresHumanSubmission(phase);
    const judgeQuestionComposerActive = phase && state.phaseReady && isHumanJudgeQuestionPhase(phase);
    const waitingForPlayback = isCurrentPhaseAwaitingPlayback(phase);
    const locked = state.busy || state.isRecording || state.voiceFinalizePending || waitingForPlayback;
    const submitLocked = state.completed || state.busy || state.voiceFinalizePending || waitingForPlayback;

    [
        participantOneTypeSelectEl, participantOneModelSelectEl, humanNameInputEl, aiNameInputEl, coinCallSelectEl,
        judgeModeSelectEl, voiceModeSelectEl, modelSelectEl, case1TitleInputEl, case1QuestionInputEl, case1TextInputEl,
        case1FileInputEl, case2TitleInputEl, case2QuestionInputEl, case2TextInputEl, case2FileInputEl
    ].forEach((el) => {
        if (!el) return;
        el.disabled = state.started || state.waitingForCoinChoice || locked;
    });

    startMatchBtnEl.disabled = !hasApiKey || state.started || state.waitingForCoinChoice || locked;
    resetMatchBtnEl.disabled = locked;

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

    micBtnEl.disabled = ((!composerActive || state.completed || !hasApiKey) && !state.isRecording) || ((state.busy || state.voiceFinalizePending) && !state.isRecording);
    micBtnEl.textContent = state.isRecording ? l("■ Stop Recording", "■ Arrêter l’enregistrement") : l("● Record Voice", "● Enregistrer la voix");
    micBtnEl.classList.toggle("recording", state.isRecording);

    const hasTimedPhase = !!phase?.duration;
    const timerExists = !!state.timer.intervalId;
    pauseTimerBtnEl.disabled = !hasTimedPhase || !state.phaseReady || !timerExists || !state.timer.running;
    resumeTimerBtnEl.disabled = !hasTimedPhase || !state.phaseReady || !timerExists || state.timer.running || state.timer.remaining <= 0;
    resetTimerBtnEl.disabled = !hasTimedPhase || !state.phaseReady;

    if (!state.started) {
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

    computeHumanResultBtnEl.disabled = judgeModeSelectEl.value !== "human" || state.busy || state.isRecording || state.voiceFinalizePending;

    updateComposerPlaceholder();
    refreshJudgeStatuses();
    updateComposerModeIndicator();
    refreshSpeechUi();
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
        if (!stopRecordingAndFinalize("submit", getStopRecordingAndSubmitStatusText(phase))) resolvePendingVoiceSubmission();
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
        if (!stopRecordingAndFinalize("submit", getStopRecordingAndSubmitStatusText(phase))) resolvePendingVoiceSubmission();
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

async function loadCaseFile(fileInput, textInput, titleInput) {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
        const text = await file.text();
        textInput.value = text;
        if (!sanitizeText(titleInput.value)) titleInput.value = file.name.replace(/\.[^.]+$/, "");
        saveSetup();
        setStatus(isFrenchLocale() ? `${file.name} chargé.` : `Loaded ${file.name}.`);
    } catch (error) {
        console.error(error);
        setStatus(l("Could not read the uploaded file.", "Impossible de lire le fichier téléversé."), true);
    }
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
}

startMatchBtnEl.addEventListener("click", startMatch);
resetMatchBtnEl.addEventListener("click", fullReset);
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
        if (stopRecordingAndFinalize("interrupted", l("Stopping recording so you can edit the draft.", "Arrêt de l’enregistrement pour vous permettre de modifier le brouillon."))) return;
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
judgeModeSelectEl, voiceModeSelectEl, modelSelectEl, case1TitleInputEl, case1QuestionInputEl, case1TextInputEl,
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
voiceModeSelectEl.addEventListener("change", () => {
    syncVoiceModeStateFromControls();
    refreshControls();
});

judgeInputs.forEach((judge) => {
    judge.question.addEventListener("input", () => {
        const phase = getCurrentPhase();
        if (phase && state.phaseReady && isHumanJudgeQuestionPhase(phase) && phase.judgeNumber === judge.number && !state.isRecording && !state.voiceFinalizePending) {
            messageInputEl.value = judge.question.value;
        }
    });
});

case1FileInputEl.addEventListener("change", () => { void loadCaseFile(case1FileInputEl, case1TextInputEl, case1TitleInputEl); });
case2FileInputEl.addEventListener("change", () => { void loadCaseFile(case2FileInputEl, case2TextInputEl, case2TitleInputEl); });

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
    syncVoiceModeStateFromControls();
    refreshControls();
});

window.addEventListener("pagehide", () => {
    stopSpeechPlayback(false, { resolveCallbacks: false });
    releaseMicrophoneStream();
});

window.addEventListener("beforeunload", () => {
    stopSpeechPlayback(false, { resolveCallbacks: false });
    releaseMicrophoneStream();
});

loadSetup();
ensureSpeechUi();
fullReset();
applyLocaleToUi();
updateConfigBadges();
updateApiKeyUi();
refreshControls();
maybeShowInitialApiKeyDialog();
