(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root){root.EthicsRenderer=root.EthicsRenderer||{};root.EthicsRenderer.setup=api;}})(typeof globalThis==="object"?globalThis:this,function(){
    "use strict";
    const dependencies=Object.freeze({
    "services": [
        "appendMessage",
        "caseLabel",
        "coinSideLabel",
        "formatModelLabel",
        "getCurrentPhase",
        "getModelProvider",
        "getStoredText",
        "hasCredential",
        "isFrenchLocale",
        "isSpeechPlaybackActive",
        "judgeLabel",
        "l",
        "normalizeMatchModel",
        "normalizeParticipantMode",
        "openApiKeyDialog",
        "populateAllMatchModelSelects",
        "providerLabel",
        "refreshControls",
        "refreshCredentialStatus",
        "refreshHumanScoreTotals",
        "sanitizeText",
        "setStatus",
        "stopSpeechPlayback"
    ],
    "settings": [
        "DEFAULT_PARTICIPANT_MODEL",
        "MODEL_CATALOG",
        "STORAGE_KEYS"
    ],
    "ui": [
        "aiNameInputEl",
        "appHeroEl",
        "appStatusStripEl",
        "case1QuestionInputEl",
        "case1TextInputEl",
        "case1TitleInputEl",
        "case2QuestionInputEl",
        "case2TextInputEl",
        "case2TitleInputEl",
        "chatEl",
        "coinCallPanelEl",
        "coinTossAnimationEl",
        "coinTossCardEl",
        "coinTossCoinEl",
        "coinTossStatusEl",
        "humanNameInputEl",
        "instructionsBadgeEl",
        "judgeInputs",
        "judgeModeSelectEl",
        "judgePanelDefaultEl",
        "judgePanelPresetSelectEl",
        "matchCase1CardEl",
        "matchCase1MetaEl",
        "matchCase1QuestionEl",
        "matchCase1SummaryEl",
        "matchCase1TextEl",
        "matchCase2CardEl",
        "matchCase2MetaEl",
        "matchCase2QuestionEl",
        "matchCase2SummaryEl",
        "matchCase2TextEl",
        "matchScreenEl",
        "matchSetupSummaryEl",
        "modelSelectEl",
        "moderatorReadFullCaseSelectEl",
        "participantOneModelSelectEl",
        "participantOneModelWrapEl",
        "participantOneTypeSelectEl",
        "participantTwoModelWrapEl",
        "participantTwoTypeSelectEl",
        "setupScreenEl"
    ],
    "platform": [
        "Option",
        "document",
        "localStorage",
        "window"
    ]
});
    function create(context) {
        function delayMs(ms) {
            return new Promise((resolve) => {
                context.platform.window.setTimeout(resolve, Math.max(0, ms));
            });
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
            if (context.services.isFrenchLocale()) {
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
            return role === "human" ? context.state.names.human : context.state.names.ai;
        }

        function titleCase(value) {
            const text = String(value || "");
            return text ? text[0].toUpperCase() + text.slice(1) : text;
        }

        function isAiControlledRole(role) {
            return context.state.participantTypes[role] === "ai";
        }

        function isHumanControlledRole(role) {
            return !isAiControlledRole(role);
        }

        function getDefaultParticipantOneName(mode = context.services.normalizeParticipantMode(context.ui.participantOneTypeSelectEl?.value || "human")) {
            return mode === "ai" ? context.services.l("AI Participant 1", "Participante IA 1") : context.services.l("Human", "Humain");
        }

        function getDefaultParticipantTwoName(mode = context.services.normalizeParticipantMode(context.ui.participantTwoTypeSelectEl?.value || "ai")) {
            return mode === "ai" ? context.services.l("AI Participant 2", "Participante IA 2") : context.services.l("Human Participant 2", "Participant humain 2");
        }

        function isHumanJudgeQuestionPhase(phase) {
            return !!phase && phase.kind === "judgeQuestion" && context.state.judgeMode === "human";
        }

        function isHumanMainComposerPhase(phase) {
            return !!phase && (isHumanSubmissionPhase(phase) || isHumanJudgeQuestionPhase(phase));
        }

        function currentPhaseUsesMainComposer(phase) {
            return context.state.phaseReady && isHumanMainComposerPhase(phase);
        }

        function getActiveHumanJudgeEntry(phase = context.services.getCurrentPhase()) {
            if (!phase || phase.kind !== "judgeQuestion") return null;
            return context.ui.judgeInputs.find((judge) => judge.number === phase.judgeNumber) || null;
        }

        function getActiveHumanJudgeName(phase = context.services.getCurrentPhase()) {
            const judge = getActiveHumanJudgeEntry(phase);
            if (!judge) return phase?.judgeNumber ? context.services.judgeLabel(phase.judgeNumber) : context.services.l("Judge", "Juge");
            return context.services.sanitizeText(judge.name.value) || context.services.judgeLabel(judge.number);
        }

        function getParticipantModel(role) {
            return context.services.normalizeMatchModel(context.state.participantModels[role] || context.settings.DEFAULT_PARTICIPANT_MODEL);
        }

        function normalizeJudgeMode(value) {
            return ["ai", "human", "hybrid"].includes(value) ? value : "ai";
        }

        function usesAiJudgeQuestions(mode = context.state.judgeMode) {
            return mode === "ai" || mode === "hybrid";
        }

        function usesAiFinalScoring(mode = context.state.judgeMode) {
            return mode === "ai";
        }

        function judgeModeLabel(mode = context.state.judgeMode) {
            if (mode === "hybrid") return context.services.l("AI questions · Human scores", "Questions IA · Notes humaines");
            return mode === "human" ? context.services.l("Human judges", "Juges humains") : context.services.l("AI judges", "Juges IA");
        }

        function getJudgeModel(judgeNumber) {
            return context.settings.MODEL_CATALOG.getJudgeModelForPanel(context.state.judgePanelPreset, judgeNumber);
        }

        function populateJudgePanelPresetSelect() {
            const selected = context.settings.MODEL_CATALOG.normalizeJudgePanel(context.ui.judgePanelPresetSelectEl.value);
            context.ui.judgePanelPresetSelectEl.replaceChildren(...context.settings.MODEL_CATALOG.JUDGE_PANELS.map(panel => new context.platform.Option(context.services.isFrenchLocale() ? panel.labelFr : panel.labelEn, panel.id)));
            context.ui.judgePanelPresetSelectEl.value = selected;
        }

        function updateJudgePanelUi() {
            const panelSetup = context.platform.document.getElementById("judgePanelSetup");
            panelSetup.hidden = !usesAiJudgeQuestions(context.ui.judgeModeSelectEl.value);
            panelSetup.style.display = panelSetup.hidden ? "none" : "";
            const panel = context.settings.MODEL_CATALOG.getJudgePanel(context.ui.judgePanelPresetSelectEl.value);
            context.platform.document.getElementById("judgePanelSummary").textContent = panel.models.map((model, index) => `${context.services.judgeLabel(index + 1)}: ${context.services.formatModelLabel(model, {includeProvider:false})}`).join("\n");
            const matchModels = context.platform.document.getElementById("matchJudgeModels");
            if (matchModels) {
                const matchPanel = isLiveMatchScreenVisible()
                    ? context.settings.MODEL_CATALOG.getJudgePanel(context.state.judgePanelPreset)
                    : panel;
                matchModels.replaceChildren(...matchPanel.models.map((model, index) => {
                    const row = context.platform.document.createElement("div");
                    const label = context.platform.document.createElement("dt");
                    label.textContent = context.services.judgeLabel(index + 1);
                    const name = context.platform.document.createElement("dd");
                    name.textContent = context.services.formatModelLabel(model, { includeProvider: false });
                    row.appendChild(label);
                    row.appendChild(name);
                    return row;
                }));
            }
        }

        function messageKindForRole(role) {
            if (!isAiControlledRole(role)) return "human";
            return role === "human" ? "ai-alt" : "ai";
        }

        function appendParticipantMessage(role, text, options = {}) {
            const kind = messageKindForRole(role);
            return context.services.appendMessage(kind, speakerName(role), text, { ...options, voiceKey: kind });
        }

        function refreshParticipantScoreLabels() {
            const participantOneName = context.services.sanitizeText(context.ui.humanNameInputEl?.value || "") || context.services.l("Participant 1", "Participant 1");
            const participantTwoName = context.services.sanitizeText(context.ui.aiNameInputEl?.value || "") || context.services.l("Participant 2", "Participant 2");
            context.platform.document.querySelectorAll(".participant-one-score-label").forEach((el) => { el.textContent = participantOneName; });
            context.platform.document.querySelectorAll(".participant-two-score-label").forEach((el) => { el.textContent = participantTwoName; });
        }

        function syncParticipantSetupUi() {
            const participantOneMode = context.services.normalizeParticipantMode(context.ui.participantOneTypeSelectEl?.value || "human");
            if (context.ui.participantOneModelWrapEl) context.ui.participantOneModelWrapEl.hidden = participantOneMode !== "ai";
            if (context.ui.participantTwoModelWrapEl) context.ui.participantTwoModelWrapEl.hidden = context.services.normalizeParticipantMode(context.ui.participantTwoTypeSelectEl?.value || "ai") !== "ai";
            refreshParticipantScoreLabels();
        }

        function waitMs(ms) {
            return new Promise((resolve) => context.platform.window.setTimeout(resolve, ms));
        }

        function appendMessageAndWaitForPlayback(kind, label, text, options = {}) {
            return new Promise((resolve) => {
                context.services.appendMessage(kind, label, text, {
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
            return context.state.liveScreenActive || context.state.coinTossAnimating || context.state.waitingForCoinChoice || context.state.started || context.state.completed || context.state.transcript.length > 0;
        }

        function syncScreenVisibility() {
            const showLiveMatch = isLiveMatchScreenVisible();
            context.platform.document.body.dataset.screen = showLiveMatch ? "match" : "setup";
            context.platform.document.body.dataset.allAi = String(context.state.participantTypes.human === "ai"
                && context.state.participantTypes.ai === "ai" && context.state.judgeMode === "ai");
            context.platform.document.body.dataset.opening = String(showLiveMatch && !context.state.started && !context.state.completed);
            if (context.ui.appHeroEl) context.ui.appHeroEl.hidden = showLiveMatch;
            if (context.ui.appStatusStripEl) context.ui.appStatusStripEl.hidden = showLiveMatch;
            if (context.ui.setupScreenEl) context.ui.setupScreenEl.hidden = showLiveMatch;
            if (context.ui.matchScreenEl) context.ui.matchScreenEl.hidden = !showLiveMatch;
        }

        function buildMatchSummaryItem(label, value, options = {}) {
            const item = context.platform.document.createElement("div");
            item.className = "match-summary-item";
            if (options.kind) item.classList.add(options.kind);

            const itemLabel = context.platform.document.createElement("div");
            itemLabel.className = "match-summary-label";
            itemLabel.textContent = label;

            const itemValue = context.platform.document.createElement("div");
            itemValue.className = "match-summary-value";
            if (value instanceof Node) itemValue.appendChild(value);
            else itemValue.textContent = value;

            item.appendChild(itemLabel);
            item.appendChild(itemValue);
            return item;
        }

        function getLeadSummaryText() {
            if (context.state.waitingForCoinChoice) {
                return context.services.l("Lead choice pending.", "Choix de mène en attente.");
            }
            if (!context.state.started) {
                return context.services.l("Pending toss.", "Tirage en attente.");
            }
            return context.services.isFrenchLocale()
            ? `Nº 1 : ${speakerName(context.state.leadByCase[1])}\nNº 2 : ${speakerName(context.state.leadByCase[2])}`
            : `#1: ${speakerName(context.state.leadByCase[1])}\n#2: ${speakerName(context.state.leadByCase[2])}`;
        }

        function getCoinTossSummaryText() {
            if (context.state.coinTossAnimating) return context.services.l("In progress.", "En cours.");
            if (!context.state.coinResult) return context.services.l("Pending.", "En attente.");
            return context.services.isFrenchLocale()
            ? `${context.services.coinSideLabel(context.state.coinResult)} • ${speakerName(context.state.coinWinner)} gagne`
            : `${context.services.coinSideLabel(context.state.coinResult)} • ${speakerName(context.state.coinWinner)} wins`;
        }

        function buildParticipantModelSummary(participantOneMode, participantTwoMode) {
            const summary = context.platform.document.createElement("div");
            summary.className = "participant-model-summary";
            const participants = [
                {
                    name: context.state.names.human,
                    model: participantOneMode === "ai"
                        ? context.services.formatModelLabel(context.state.participantModels.human, { includeProvider: false })
                        : context.services.l("Human", "Humain")
                },
                {
                    name: context.state.names.ai,
                    model: participantTwoMode === "ai" ? context.services.formatModelLabel(context.state.participantModels.ai, { includeProvider: false }) : context.services.l("Human", "Humain")
                }
            ];
            participants.forEach(({ name, model }) => {
                const line = context.platform.document.createElement("div");
                line.className = "participant-model-line";
                const nameEl = context.platform.document.createElement("div");
                nameEl.className = "participant-summary-name";
                nameEl.textContent = name;
                line.appendChild(nameEl);
                if (String(name).trim().toLocaleLowerCase() !== String(model).trim().toLocaleLowerCase()) {
                    const modelEl = context.platform.document.createElement("div");
                    modelEl.className = "participant-summary-model";
                    modelEl.textContent = model;
                    line.appendChild(modelEl);
                }
                summary.appendChild(line);
            });
            return summary;
        }

        function renderMatchSetupSummary() {
            if (!context.ui.matchSetupSummaryEl) return;
            context.ui.matchSetupSummaryEl.innerHTML = "";
            if (!isLiveMatchScreenVisible()) return;

            const participantOneMode = context.state.started || context.state.coinResult || context.state.waitingForCoinChoice
            ? context.state.participantTypes.human
            : context.services.normalizeParticipantMode(context.ui.participantOneTypeSelectEl?.value || "human");

            const items = [
                {
                    label: context.services.l("Participants", "Participantes"),
                    value: buildParticipantModelSummary(participantOneMode, context.state.started || context.state.coinResult || context.state.waitingForCoinChoice ? context.state.participantTypes.ai : context.services.normalizeParticipantMode(context.ui.participantTwoTypeSelectEl?.value || "ai")),
                    kind: "participants-summary"
                },
                {
                    label: context.services.l("Voice", "Voix"),
                    value: "OpenAI"
                },
                {
                    label: context.services.l("Coin toss", "Tirage"),
                    value: getCoinTossSummaryText(),
                    kind: "coin-summary"
                },
                {
                    label: context.services.l("Cases", "Cas"),
                    value: getLeadSummaryText(),
                    kind: "order-summary"
                }
            ];

            items.forEach((item) => {
                context.ui.matchSetupSummaryEl.appendChild(buildMatchSummaryItem(item.label, item.value, item));
            });
        }

        function renderMatchCaseCard(caseNum, cardEl, summaryEl, metaEl, questionEl, textEl) {
            if (!summaryEl || !metaEl || !questionEl || !textEl) return;
            const caseData = context.state.cases[caseNum] || { title: "", question: "", text: "" };
            const currentPhase = context.services.getCurrentPhase();
            const isCurrentCase = !!currentPhase?.caseNum && currentPhase.caseNum === caseNum;
            const leaderReady = context.state.started;

            summaryEl.textContent = caseData.title
            ? `${context.services.caseLabel(caseNum)} • ${caseData.title}`
            : context.services.caseLabel(caseNum);

            metaEl.textContent = leaderReady
            ? context.services.isFrenchLocale()
                ? `Mène : ${speakerName(context.state.leadByCase[caseNum])}`
                : `Leader: ${speakerName(context.state.leadByCase[caseNum])}`
            : context.services.l("Leader will be confirmed after the toss.", "La meneuse sera confirmée après le tirage.");

            questionEl.textContent = caseData.question
            ? context.services.isFrenchLocale()
                ? `Question : ${caseData.question}`
                : `Question: ${caseData.question}`
            : context.services.l("No moderator question loaded yet.", "Aucune question du modérateur n’est chargée pour le moment.");

            textEl.textContent = caseData.text || context.services.l("No case text loaded yet.", "Aucun texte de cas n’est chargé pour le moment.");

            if (cardEl) {
                cardEl.classList.toggle("current", isCurrentCase);
            }
        }

        function renderMatchCaseReference() {
            renderMatchCaseCard(1, context.ui.matchCase1CardEl, context.ui.matchCase1SummaryEl, context.ui.matchCase1MetaEl, context.ui.matchCase1QuestionEl, context.ui.matchCase1TextEl);
            renderMatchCaseCard(2, context.ui.matchCase2CardEl, context.ui.matchCase2SummaryEl, context.ui.matchCase2MetaEl, context.ui.matchCase2QuestionEl, context.ui.matchCase2TextEl);
        }

        function syncCoinTossFaceLabels() {
            if (!context.ui.coinTossCoinEl) return;
            const [front, back] = context.ui.coinTossCoinEl.querySelectorAll(".coin-face");
            if (front) front.dataset.sideLabel = context.services.coinSideLabel("heads");
            if (back) back.dataset.sideLabel = context.services.coinSideLabel("tails");
        }

        function syncCoinTossUi() {
            syncCoinTossFaceLabels();
            if (context.ui.judgePanelDefaultEl) context.ui.judgePanelDefaultEl.hidden = !!context.state.showCoinTossCeremony;
            if (context.ui.coinTossCardEl) context.ui.coinTossCardEl.hidden = !context.state.showCoinTossCeremony;
            if (context.ui.coinCallPanelEl) context.ui.coinCallPanelEl.hidden = !context.state.waitingForCoinCall;
            if (context.ui.coinTossAnimationEl) {
                context.ui.coinTossAnimationEl.hidden = context.state.waitingForCoinCall;
                context.ui.coinTossAnimationEl.classList.toggle("is-flipping", context.state.coinTossAnimating);
                context.ui.coinTossAnimationEl.classList.toggle("is-settled", !context.state.coinTossAnimating && !!context.state.coinResult);
                context.ui.coinTossAnimationEl.classList.toggle("result-heads", context.state.coinResult === "heads");
                context.ui.coinTossAnimationEl.classList.toggle("result-tails", context.state.coinResult === "tails");
            }

            if (!context.ui.coinTossStatusEl) return;

            if (context.state.waitingForCoinCall) {
                context.ui.coinTossStatusEl.textContent = context.services.l(
                    `${speakerName("human")}, choose heads or tails.`,
                    `${speakerName("human")}, choisissez face ou pile.`);
                return;
            }
            if (context.state.coinTossAnimating) {
                context.ui.coinTossStatusEl.textContent = context.services.l("The coin is being flipped to determine who controls Case #1.", "La pièce est lancée pour déterminer qui contrôlera le cas 1.");
                return;
            }
            if (context.state.waitingForCoinChoice) {
                context.ui.coinTossStatusEl.textContent = context.services.l(`${speakerName(context.state.coinWinner)} won the toss. Choose whether to lead or pass on Case #1.`, `${speakerName(context.state.coinWinner)} a gagné le tirage. Choisissez de mener ou de passer au cas 1.`);
                return;
            }
            if (context.state.showCoinTossCeremony && context.state.started) {
                context.ui.coinTossStatusEl.textContent = context.services.l("Match opening confirmed. Moving into the moderator’s first case announcement.", "Ouverture du match confirmée. Passage à la première annonce de cas du modérateur.");
                return;
            }
            if (context.state.coinResult && context.state.coinWinner) {
                context.ui.coinTossStatusEl.textContent = context.services.isFrenchLocale()
                ? `${speakerName("human")} a choisi ${context.services.coinSideLabel(context.state.coinCall)}. Le résultat est ${context.services.coinSideLabel(context.state.coinResult)}. ${speakerName(context.state.coinWinner)} gagne le tirage.`
                : `${speakerName("human")} called ${context.services.coinSideLabel(context.state.coinCall)}. The coin is ${context.services.coinSideLabel(context.state.coinResult)}. ${speakerName(context.state.coinWinner)} wins the toss.`;
                return;
            }
            context.ui.coinTossStatusEl.textContent = context.services.l("The moderator is preparing the coin toss.", "Le modérateur prépare le tirage.");
        }

        async function playCoinTossAnimation(coinCall, coinResult, winner) {
            const runId = context.state.matchRunId;
            context.state.coinCall = coinCall;
            context.state.coinResult = coinResult;
            context.state.coinWinner = winner;
            context.state.coinTossAnimating = true;
            context.services.refreshControls();
            context.services.setStatus(context.services.l("Running coin toss...", "Tirage en cours..."));
            await waitMs(2400);
            if (runId !== context.state.matchRunId) return false;
            context.state.coinTossAnimating = false;
            context.services.refreshControls();
            return true;
        }

        function isHumanSubmissionPhase(phase) {
            return !!phase && (phase.kind === "speech" || phase.kind === "judgeAnswer") && isHumanControlledRole(phase.speaker);
        }

        function isCurrentPhaseAwaitingPlayback(phase = context.services.getCurrentPhase()) {
            return !!phase && context.state.phaseAwaitingPlaybackForId === phase.id;
        }

        function setPhaseAwaitingPlayback(phaseId) {
            context.state.phaseAwaitingPlaybackForId = phaseId || "";
            context.services.refreshControls();
        }

        function clearPhaseAwaitingPlayback(phaseId = "") {
            if (!phaseId || context.state.phaseAwaitingPlaybackForId === phaseId) {
                context.state.phaseAwaitingPlaybackForId = "";
                context.services.refreshControls();
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
            if (phase.kind === "judgeQuestion" && usesAiJudgeQuestions()) return true;
            if (phase.kind === "judgeAnswer" && isAiControlledRole(phase.speaker)) return true;
            return false;
        }

        function cutOffCurrentPhaseReadAloudIfNeeded(phase) {
            if (!shouldCutOffReadAloudOnTimeout(phase)) return;
            if (!context.services.isSpeechPlaybackActive()) return;
            return context.services.stopSpeechPlayback(false, { resolveCallbacks: false, deliveryReason: "timeout" });
        }

        function readCase(caseNum) {
            const titleEl=caseNum===1?context.ui.case1TitleInputEl:context.ui.case2TitleInputEl;
            const questionEl=caseNum===1?context.ui.case1QuestionInputEl:context.ui.case2QuestionInputEl;
            const textEl=caseNum===1?context.ui.case1TextInputEl:context.ui.case2TextInputEl;
            return {title:context.services.sanitizeText(titleEl.value),question:context.services.sanitizeText(questionEl.value),text:context.platform.window.EthicsCasePacket.parse(context.services.sanitizeText(textEl.value)).narrative};
        }

        function updateConfigBadges() {
            const instructions = context.services.getStoredText(context.settings.STORAGE_KEYS.instructions);
            const instructionsActive = !!instructions;
            context.ui.instructionsBadgeEl.textContent = instructionsActive
            ? context.services.l("Instructions active", "Instructions actives")
            : context.services.l("Instructions inactive", "Instructions inactives");
            context.ui.instructionsBadgeEl.className = `status-chip ${instructionsActive ? "active" : "inactive"}`;
            context.ui.instructionsBadgeEl.title = instructionsActive ? instructions.slice(0, 300) : context.services.l("No saved instructions.", "Aucune instruction enregistrée.");
        }

        function saveSetup() {
            const payload = {
                participantOneType: context.services.normalizeParticipantMode(context.ui.participantOneTypeSelectEl?.value),
                participantTwoType: context.services.normalizeParticipantMode(context.ui.participantTwoTypeSelectEl?.value || "ai"),
                humanName: context.ui.humanNameInputEl.value,
                aiName: context.ui.aiNameInputEl.value,
                judgeMode: normalizeJudgeMode(context.ui.judgeModeSelectEl.value),
                judgePanelPreset: context.settings.MODEL_CATALOG.normalizeJudgePanel(context.ui.judgePanelPresetSelectEl.value),
                moderatorReadFullCase: context.ui.moderatorReadFullCaseSelectEl.value,
                participantOneModel: context.services.normalizeMatchModel(context.ui.participantOneModelSelectEl?.value),
                participantTwoModel: context.services.normalizeMatchModel(context.ui.modelSelectEl?.value),
                case1Title: context.ui.case1TitleInputEl.value,
                    case1Question: context.ui.case1QuestionInputEl.value,
                        case1Text: context.ui.case1TextInputEl.value,
                            case2Title: context.ui.case2TitleInputEl.value,
                                case2Question: context.ui.case2QuestionInputEl.value,
                                    case2Text: context.ui.case2TextInputEl.value,
                                        judges: context.ui.judgeInputs.map((judge) => ({
                                            name: judge.name.value,
                                            question: judge.question.value,
                                            humanScore: judge.humanScore.value,
                                            aiScore: judge.aiScore.value,
                                            humanBreakdown: Object.fromEntries(Object.entries(judge.humanBreakdown).map(([key,input]) => [key,input.value])),
                                            aiBreakdown: Object.fromEntries(Object.entries(judge.aiBreakdown).map(([key,input]) => [key,input.value])),
                                            humanComments: {didWell:judge.humanDidWell.value, needsImprovement:judge.humanNeedsImprovement.value},
                                            aiComments: {didWell:judge.aiDidWell.value, needsImprovement:judge.aiNeedsImprovement.value},
                                            ...(judge.legacyComment ? {legacyComment:judge.legacyComment} : {})
                                        }))
            };
            context.platform.localStorage.setItem(context.settings.STORAGE_KEYS.setup, JSON.stringify({version:1,setup:payload}));
            refreshParticipantScoreLabels();
        }

        function loadSetup() {
            populateJudgePanelPresetSelect();
            if (context.ui.participantOneTypeSelectEl) context.ui.participantOneTypeSelectEl.value = "human";
            if (context.ui.participantTwoTypeSelectEl) context.ui.participantTwoTypeSelectEl.value = "ai";
            context.ui.moderatorReadFullCaseSelectEl.value = "no";
            context.services.populateAllMatchModelSelects();
            try {
                const record = JSON.parse(context.platform.localStorage.getItem(context.settings.STORAGE_KEYS.setup) || "null");
                const parsed = record?.version===1 ? record.setup : null;
                if (parsed && typeof parsed === "object") {
                    if (typeof parsed.participantOneType === "string") context.ui.participantOneTypeSelectEl.value = context.services.normalizeParticipantMode(parsed.participantOneType);
                    if (typeof parsed.participantTwoType === "string") context.ui.participantTwoTypeSelectEl.value = context.services.normalizeParticipantMode(parsed.participantTwoType);
                    if (typeof parsed.humanName === "string") context.ui.humanNameInputEl.value = parsed.humanName;
                    if (typeof parsed.aiName === "string") context.ui.aiNameInputEl.value = parsed.aiName;
                    if (typeof parsed.judgeMode === "string") context.ui.judgeModeSelectEl.value = normalizeJudgeMode(parsed.judgeMode);
                    context.ui.judgePanelPresetSelectEl.value = context.settings.MODEL_CATALOG.normalizeJudgePanel(parsed.judgePanelPreset);
                    if (parsed.moderatorReadFullCase === "yes") context.ui.moderatorReadFullCaseSelectEl.value = "yes";
                    context.ui.participantOneModelSelectEl.value = context.services.normalizeMatchModel(parsed.participantOneModel || context.settings.DEFAULT_PARTICIPANT_MODEL);
                    context.ui.modelSelectEl.value = context.services.normalizeMatchModel(parsed.participantTwoModel || context.settings.DEFAULT_PARTICIPANT_MODEL);
                    if (typeof parsed.case1Title === "string") context.ui.case1TitleInputEl.value = parsed.case1Title;
                    if (typeof parsed.case1Question === "string") context.ui.case1QuestionInputEl.value = parsed.case1Question;
                    if (typeof parsed.case1Text === "string") context.ui.case1TextInputEl.value = parsed.case1Text;
                    if (typeof parsed.case2Title === "string") context.ui.case2TitleInputEl.value = parsed.case2Title;
                    if (typeof parsed.case2Question === "string") context.ui.case2QuestionInputEl.value = parsed.case2Question;
                    if (typeof parsed.case2Text === "string") context.ui.case2TextInputEl.value = parsed.case2Text;
                    if (Array.isArray(parsed.judges)) {
                        parsed.judges.slice(0, 3).forEach((savedJudge, index) => {
                            const judge = context.ui.judgeInputs[index];
                            if (!judge || !savedJudge || typeof savedJudge !== "object") return;
                            if (typeof savedJudge.name === "string") judge.name.value = savedJudge.name;
                            if (typeof savedJudge.question === "string") judge.question.value = savedJudge.question;
                            if (typeof savedJudge.humanScore === "string" || typeof savedJudge.humanScore === "number") judge.humanScore.value = String(savedJudge.humanScore ?? "");
                            if (typeof savedJudge.aiScore === "string" || typeof savedJudge.aiScore === "number") judge.aiScore.value = String(savedJudge.aiScore ?? "");
                            // Preserve an older saved draft without assigning its overall text to either team's new fields.
                            judge.legacyComment = typeof savedJudge.legacyComment === "string" ? savedJudge.legacyComment : (typeof savedJudge.comment === "string" ? savedJudge.comment : "");
                            for (const role of ["human", "ai"]) {
                                for (const [key,input] of Object.entries(judge[`${role}Breakdown`])) {
                                    const value = savedJudge[`${role}Breakdown`]?.[key];
                                    if (typeof value === "string" || typeof value === "number") input.value = String(value);
                                }
                                if (typeof savedJudge[`${role}Comments`]?.didWell === "string") judge[`${role}DidWell`].value = savedJudge[`${role}Comments`].didWell;
                                if (typeof savedJudge[`${role}Comments`]?.needsImprovement === "string") judge[`${role}NeedsImprovement`].value = savedJudge[`${role}Comments`].needsImprovement;
                            }
                        });
                    }
                }
            } catch {}
            context.services.refreshHumanScoreTotals();
            syncParticipantSetupUi();
            refreshParticipantScoreLabels();
        }

        function getMessageBodyEl(index) {
            return context.ui.chatEl.querySelector(`.msg-row[data-message-index="${index}"] .bubble-body`);
        }

        function collectSetupCredentialRequirements() {
            const requirements = new Map();
            const add = (provider, enReason, frReason) => {
                if (!provider) return;
                if (!requirements.has(provider)) requirements.set(provider, []);
                requirements.get(provider).push(context.services.l(enReason, frReason));
            };
            if (context.services.normalizeParticipantMode(context.ui.participantTwoTypeSelectEl?.value || "ai") === "ai") {
            const participantTwoModel = context.services.normalizeMatchModel(context.ui.modelSelectEl?.value);
            add(
                context.services.getModelProvider(participantTwoModel),
                `Participant 2 (${context.services.formatModelLabel(participantTwoModel, { includeProvider: false })})`,
                `participant 2 (${context.services.formatModelLabel(participantTwoModel, { includeProvider: false })})`
            );
            }
            if (context.services.normalizeParticipantMode(context.ui.participantOneTypeSelectEl?.value) === "ai") {
                const participantOneModel = context.services.normalizeMatchModel(context.ui.participantOneModelSelectEl?.value);
                add(
                    context.services.getModelProvider(participantOneModel),
                    `Participant 1 (${context.services.formatModelLabel(participantOneModel, { includeProvider: false })})`,
                    `participant 1 (${context.services.formatModelLabel(participantOneModel, { includeProvider: false })})`
                );
            }
            if (usesAiJudgeQuestions(context.ui.judgeModeSelectEl?.value)) {
                context.settings.MODEL_CATALOG.getJudgePanel(context.ui.judgePanelPresetSelectEl.value).models.forEach((model, index) => {
                    const label = context.services.formatModelLabel(model, {includeProvider:false});
                    add(context.services.getModelProvider(model), `Judge ${index + 1} (${label})`, `juge ${index + 1} (${label})`);
                });
            }
            add("openai", "OpenAI read-aloud", "la lecture OpenAI");
            return requirements;
        }

        async function validateBeforeStart() {
            await context.services.refreshCredentialStatus({ force: true });
            const requirements = collectSetupCredentialRequirements();
            const missing = [...requirements.entries()].filter(([provider]) => !context.services.hasCredential(provider));
            if (missing.length) {
                context.services.openApiKeyDialog(missing[0][0]);
                const details = missing.map(([provider, reasons]) => `${context.services.providerLabel(provider)}: ${reasons.join(", ")}`).join("; ");
                throw new Error(context.services.l(
                    `Configure the required provider credentials before starting (${details}).`,
                    `Configurez les identifiants requis des fournisseurs avant de commencer (${details}).`
                ));
            }
            const case1 = readCase(1);
            const case2 = readCase(2);
            if (!case1.title || !case1.question || !case1.text) throw new Error(context.services.l("Case #1 needs a title, a moderator question, and case text.", "Le cas 1 a besoin d’un titre, d’une question du modérateur et du texte du cas."));
            if (!case2.title || !case2.question || !case2.text) throw new Error(context.services.l("Case #2 needs a title, a moderator question, and case text.", "Le cas 2 a besoin d’un titre, d’une question du modérateur et du texte du cas."));
            return { case1, case2 };
        }

        function renderArchiveOrigins() {
            [1, 2].forEach(slot => {
                const meta = context.state.caseArchiveOrigins?.[slot];
                const note = context.platform.document.getElementById(`case${slot}ArchiveOrigin`);
                if (!note) return;
                note.hidden = !meta;
                note.textContent = "";
                note.hidden = true;
            });
        }
        return Object.freeze({delayMs,numberToWords,formatDurationNatural,otherRole,speakerName,titleCase,isAiControlledRole,isHumanControlledRole,getDefaultParticipantOneName,getDefaultParticipantTwoName,isHumanJudgeQuestionPhase,isHumanMainComposerPhase,currentPhaseUsesMainComposer,getActiveHumanJudgeEntry,getActiveHumanJudgeName,getParticipantModel,normalizeJudgeMode,usesAiJudgeQuestions,usesAiFinalScoring,judgeModeLabel,getJudgeModel,populateJudgePanelPresetSelect,updateJudgePanelUi,messageKindForRole,appendParticipantMessage,refreshParticipantScoreLabels,syncParticipantSetupUi,waitMs,appendMessageAndWaitForPlayback,isLiveMatchScreenVisible,syncScreenVisibility,buildMatchSummaryItem,getLeadSummaryText,getCoinTossSummaryText,buildParticipantModelSummary,renderMatchSetupSummary,renderMatchCaseCard,renderMatchCaseReference,syncCoinTossFaceLabels,syncCoinTossUi,playCoinTossAnimation,isHumanSubmissionPhase,isCurrentPhaseAwaitingPlayback,setPhaseAwaitingPlayback,clearPhaseAwaitingPlayback,getVoiceKeyForMessage,shouldCutOffReadAloudOnTimeout,cutOffCurrentPhaseReadAloudIfNeeded,readCase,updateConfigBadges,saveSetup,loadSetup,getMessageBodyEl,collectSetupCredentialRequirements,validateBeforeStart,renderArchiveOrigins});
    }
    return Object.freeze({create,dependencies});
});
