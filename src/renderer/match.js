(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root){root.EthicsRenderer=root.EthicsRenderer||{};root.EthicsRenderer["match"]=api;}})(typeof globalThis==="object"?globalThis:this,function(){"use strict";
    const dependencies=Object.freeze({"services": ["announceFinalResult", "appendMessage", "appendMessageAndWaitForPlayback", "askAiJudgeQuestion", "buildPhases", "caseLabel", "clearPendingVoiceSubmission", "cancelHumanCoinCall", "clearPhaseAwaitingPlayback", "clearScoreboard", "coinSideLabel", "collectHumanJudgeScorecards", "currentPhaseUsesMainComposer", "cutOffCurrentPhaseReadAloudIfNeeded", "ensureSentenceEnding", "ensureSpeechUi", "finalizeActualAudioCutoff", "formatDurationNatural", "generateAiFinalScores", "generateAiTurnForPhase", "getActiveHumanJudgeName", "getCurrentPhase", "getDefaultParticipantOneName", "getDefaultParticipantTwoName", "getLinkedAiPreparationTarget", "getPreparedAiTurnText", "handleAiConferPhase", "hasDesktopBridge", "hideLiveVoicePreview", "hydrateMainComposerFromActiveJudgeDraftIfNeeded", "isAiControlledRole", "isCurrentPhaseAwaitingPlayback", "isFrenchLocale", "isHumanControlledRole", "isHumanJudgeQuestionPhase", "isHumanMainComposerPhase", "isHumanSubmissionPhase", "judgeLabel", "judgeModeLabel", "l", "messageKindForRole", "moderatorLabel", "normalizeJudgeMode", "normalizeMatchModel", "normalizeParticipantMode", "otherRole", "phaseSubtypeLabel", "phaseTimerStartsWithAutoSpeech", "playCoinTossAnimation", "prepareTimerForAutoSpeech", "prepareTimerForPhaseAnnouncement", "primeAiFinalScoringPreparationForPhase", "primeAiPreparationForPhase", "primeAiSpeechPlaybackDuringModerator", "refreshParticipantScoreLabels", "refreshSpeechUi", "refreshTimingTestUi", "releaseMicrophoneStream", "renderMatchCaseReference", "renderMatchSetupSummary", "renderTranscript", "resetLiveSpeechState", "resetVoiceCaptureState", "requestHumanCoinCall", "resolvePendingVoiceSubmission", "revealTranscriptMessagesForPhase", "sanitizeText", "setPendingVoiceSubmission", "setTimerForPhase", "speakerName", "stopRecordingAndFinalize", "stopSpeechPlayback", "stopTimer", "storeJudgeQuestionForPhase", "syncCoinTossUi", "syncParticipantSetupUi", "syncScreenVisibility", "timingTestResultLimitReached", "titleCase", "updateApiKeyUi", "updateComposerModeIndicator", "updateJudgePanelUi", "updateMatchSummaryPlaceholder", "usesAiFinalScoring", "usesAiJudgeQuestions", "validateBeforeStart"], "settings": ["DEFAULT_JUDGE_MODEL", "DEFAULT_PARTICIPANT_MODEL", "MODEL_CATALOG", "credentialState"], "ui": ["aiJudgePanelEl", "aiNameInputEl", "case1QuestionInputEl", "case1TextInputEl", "case1TitleInputEl", "case2QuestionInputEl", "case2TextInputEl", "case2TitleInputEl", "coinChoicePanelEl", "computeHumanResultBtnEl", "currentPhaseMetaEl", "currentPhaseTitleEl", "humanJudgePanelEl", "humanNameInputEl", "judgeInputs", "judgeModeSelectEl", "judgePanelPresetSelectEl", "leadBtnEl", "liveVoicePreviewEl", "liveVoiceWrapEl", "messageInputEl", "micBtnEl", "modelSelectEl", "moderatorReadFullCaseSelectEl", "newMatchBtnEl", "nextActionBtnEl", "participantOneModelSelectEl", "participantOneTypeSelectEl", "participantTwoTypeSelectEl", "passBtnEl", "pauseTimerBtnEl", "phaseListEl", "resetMatchBtnEl", "resetTimerBtnEl", "resumeTimerBtnEl", "startMatchBtnEl", "statusLineEl", "submitTurnBtnEl", "timerControlButtonsEl", "timerDisplayEl", "timerHintEl"], "platform": ["console", "document", "window"]});
    function create(context) {
        function setStatus(text, isError = false) {
            context.state.composerStatusNotice = {
                text: String(text || ""), error: !!isError,
                phaseId: context.services.getCurrentPhase()?.id || "", matchRunId: context.state.matchRunId
            };
            // Error callbacks can clear recording flags without otherwise refreshing controls.
            if (isError) refreshControls();
            else context.services.updateComposerModeIndicator();
        }


        function setBusy(flag) {
            context.state.busy = !!flag;
            refreshControls();
            if (!context.state.busy) maybeAutoTriggerCurrentPhase();
        }


        function blockAutoGenerationForPhase(phaseId) {
            if (!phaseId) return;
            context.state.autoGenerationBlockedPhaseId = phaseId;
        }


        function clearAutoGenerationBlock(phaseId = "") {
            if (!phaseId || context.state.autoGenerationBlockedPhaseId === phaseId) {
                context.state.autoGenerationBlockedPhaseId = "";
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
            const text = context.services.sanitizeText(value);
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


        function renderPhaseList() {
            context.ui.phaseListEl.innerHTML = "";
            if (!context.state.phases.length) {
                const item = context.platform.document.createElement("li");
                item.className = "phase-item";
                item.textContent = context.services.l("No phases yet.", "Aucune phase pour le moment.");
                context.ui.phaseListEl.appendChild(item);
                return;
            }
            context.state.phases.forEach((phase, index) => {
                const item = context.platform.document.createElement("li");
                item.className = "phase-item";
                if (index < context.state.currentPhaseIndex) item.classList.add("done");
                if (index === context.state.currentPhaseIndex) item.classList.add("current");

                const title = context.platform.document.createElement("div");
                title.className = "phase-title";
                title.textContent = phase.title;

                const meta = context.platform.document.createElement("div");
                meta.className = "phase-meta";
                const parts = [];
                if (phase.caseNum) parts.push(context.services.caseLabel(phase.caseNum));
                if (phase.kind === "speech") parts.push(`${context.services.phaseSubtypeLabel(phase.subtype)} • ${context.services.speakerName(phase.speaker)}`);
                if (phase.kind === "confer") parts.push(`${context.services.l("Confer", "Caucus")} • ${context.services.speakerName(phase.speaker)}`);
                if (phase.kind === "judgeQuestion") parts.push(context.services.isFrenchLocale() ? `${context.services.judgeLabel(phase.judgeNumber)} pose` : `${context.services.judgeLabel(phase.judgeNumber)} asks`);
                if (phase.kind === "judgeAnswer") parts.push(context.services.isFrenchLocale() ? `Réponse au ${context.services.judgeLabel(phase.judgeNumber)} • ${context.services.speakerName(phase.speaker)}` : `${context.services.judgeLabel(phase.judgeNumber)} answer • ${context.services.speakerName(phase.speaker)}`);
                if (phase.duration) parts.push(formatClock(phase.duration));
                meta.textContent = parts.join(" • ");
                item.appendChild(title);
                item.appendChild(meta);
                context.ui.phaseListEl.appendChild(item);
            });
            queueMicrotask(() => {
                const currentItem = context.ui.phaseListEl.querySelector(".phase-item.current");
                if (currentItem && typeof currentItem.scrollIntoView === "function") {
                    currentItem.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
                }
            });
        }


        function updatePhaseHeader() {
            const phase = context.services.getCurrentPhase();
            if (context.state.waitingForCoinCall) {
                context.ui.currentPhaseTitleEl.textContent = context.services.l("Call the coin", "Choisissez face ou pile");
                context.ui.currentPhaseMetaEl.textContent = context.services.l("Choose heads or tails before the flip.", "Choisissez face ou pile avant le tirage.");
                return;
            }
            if (context.state.coinTossAnimating) {
                context.ui.currentPhaseTitleEl.textContent = context.services.l("Coin Toss", "Tirage");
                context.ui.currentPhaseMetaEl.textContent = context.services.l("Determining who controls Case #1.", "Détermination du contrôle du cas 1.");
                return;
            }
            if (context.state.waitingForCoinChoice) {
                context.ui.currentPhaseTitleEl.textContent = context.services.l("Coin Toss Choice", "Choix après le tirage");
                context.ui.currentPhaseMetaEl.textContent = context.services.l("Participant 1 must choose whether to lead or pass on Case #1.", "Le participant 1 doit choisir s’il mène ou passe au cas 1.");
                return;
            }
            if (!context.state.started && !context.state.completed) {
                context.ui.currentPhaseTitleEl.textContent = context.services.l("Setup", "Configuration");
                context.ui.currentPhaseMetaEl.textContent = context.services.l("Enter two cases and start the match.", "Saisissez deux cas et démarrez le match.");
                return;
            }
            if (context.state.completed) {
                context.ui.currentPhaseTitleEl.textContent = context.services.l("Match Complete", "Match terminé");
                context.ui.currentPhaseMetaEl.textContent = context.services.l("The closing phase has ended.", "La phase de clôture est terminée.");
                return;
            }
            if (!phase) {
                context.ui.currentPhaseTitleEl.textContent = context.services.l("Waiting", "En attente");
                context.ui.currentPhaseMetaEl.textContent = context.services.l("No active phase.", "Aucune phase active.");
                return;
            }
            context.ui.currentPhaseTitleEl.textContent = phase.title;
            const details = [];
            if (phase.caseNum) details.push(`${context.services.caseLabel(phase.caseNum)}: ${context.state.cases[phase.caseNum].title}`);
            if (phase.kind === "speech") details.push(`${context.services.l("Speaker", "Oratrice")} : ${context.services.speakerName(phase.speaker)}`);
            if (phase.kind === "confer") details.push(`${context.services.l("Conferring side", "Côté en caucus")} : ${context.services.speakerName(phase.speaker)}`);
            if (phase.kind === "judgeQuestion") details.push(context.services.isFrenchLocale() ? `${context.services.judgeLabel(phase.judgeNumber)} questionne ${context.services.speakerName(phase.answerer)}` : `${context.services.judgeLabel(phase.judgeNumber)} questioning ${context.services.speakerName(phase.answerer)}`);
            if (phase.kind === "judgeAnswer") details.push(`${context.services.l("Answerer", "Répondante")} : ${context.services.speakerName(phase.speaker)}`);
            if (phase.duration) details.push(`${context.services.l("Time", "Temps")} : ${formatClock(phase.duration)}`);
            if (!context.state.phaseReady) details.push(context.services.l("Waiting for moderator", "En attente du modérateur"));
            context.ui.currentPhaseMetaEl.textContent = details.join(" • ");
        }


        function schedulePhaseAdvance(phaseId, delayMs = 120) {
            context.platform.window.setTimeout(() => {
                const current = context.services.getCurrentPhase();
                if (!current || current.id !== phaseId || context.state.completed) return;
                advancePhase();
            }, delayMs);
        }


        function scheduleNextActionForPhase(phaseId, delayMs = 120) {
            if (!phaseId || context.state.pendingAutoActionPhaseId === phaseId) return;
            context.state.pendingAutoActionPhaseId = phaseId;
            context.platform.window.setTimeout(() => {
                if (context.state.pendingAutoActionPhaseId !== phaseId) return;
                context.state.pendingAutoActionPhaseId = "";
                const current = context.services.getCurrentPhase();
                if (!current || current.id !== phaseId || context.state.completed) return;
                if (context.state.busy || context.state.isRecording || context.state.voiceFinalizePending) return;
                if (!context.state.phaseReady) return;
                void handleNextAction();
            }, delayMs);
        }


        function maybeCompletePreparedAiConferral(phase = context.services.getCurrentPhase()) {
            const currentPhase = phase || context.services.getCurrentPhase();
            if (!currentPhase || !context.state.phaseReady || context.state.completed) return false;
            if (context.state.busy || context.state.isRecording || context.state.voiceFinalizePending) return false;
            if (context.services.isCurrentPhaseAwaitingPlayback(currentPhase)) return false;
            if (context.state.autoGenerationBlockedPhaseId === currentPhase.id) return false;
            if (currentPhase.kind !== "confer" || !context.services.isAiControlledRole(currentPhase.speaker)) return false;
            const targetPhase = context.services.getLinkedAiPreparationTarget(currentPhase);
            if (!targetPhase || !context.services.getPreparedAiTurnText(targetPhase.id)) return false;
            if (context.state.pendingAutoActionPhaseId === currentPhase.id) context.state.pendingAutoActionPhaseId = "";
            void context.services.handleAiConferPhase(currentPhase);
            return true;
        }


        function maybeAutoTriggerCurrentPhase() {
            const phase = context.services.getCurrentPhase();
            if (!phase || !context.state.phaseReady || context.state.completed) return;
            if (context.state.busy || context.state.isRecording || context.state.voiceFinalizePending) return;
            if (context.services.isCurrentPhaseAwaitingPlayback(phase)) return;
            if (context.state.autoGenerationBlockedPhaseId === phase.id) return;
            if (maybeCompletePreparedAiConferral(phase)) return;
            if (phase.kind === "closing" && context.state.judgeMode === "ai") {
                scheduleNextActionForPhase(phase.id);
                return;
            }
            if (shouldAutoGenerate(phase)) scheduleNextActionForPhase(phase.id);
        }


        function advanceAfterTimedPhaseExpiration(expiredPhase) {
            const current = context.services.getCurrentPhase();
            if (!current || current.id !== expiredPhase?.id || context.state.completed) return;
            const askedQuestion = context.services.sanitizeText(context.state.askedJudgeQuestions[expiredPhase.id] || "");
            if (expiredPhase.kind === "judgeQuestion" && !askedQuestion) {
                const skipToIndex = context.state.currentPhaseIndex + 2;
                if (skipToIndex < context.state.phases.length) {
                    context.state.currentPhaseIndex = skipToIndex;
                    enterCurrentPhase();
                    return;
                }
            }
            advancePhase();
        }


        async function handleTimedPhaseExpiration(expiredPhase) {
            const runId = context.state.matchRunId;
            if (!expiredPhase || context.state.sessionClosed) return;
            if (context.state.interruptedPhaseIds.has(expiredPhase.id)) return;
            context.state.interruptedPhaseIds.add(expiredPhase.id);
            context.services.stopTimer();
            context.state.phaseReady = false;
            context.services.clearPhaseAwaitingPlayback(expiredPhase.id);
            const wasHumanComposerPhase = context.services.isHumanMainComposerPhase(expiredPhase);
            context.ui.timerHintEl.textContent = context.services.l("Time is up. Advancing when the moderator finishes speaking.", "Le temps est écoulé. Passage après la fin du modérateur.");
            refreshControls();
            if (wasHumanComposerPhase) {
                context.services.setPendingVoiceSubmission("timeout", expiredPhase.id);
                if (context.state.isRecording) {
                    setStatus(context.services.l("Time is up. Finalizing the recorded text and submitting it.", "Le temps est écoulé. Finalisation du texte enregistré et soumission."));
                    if (!context.services.stopRecordingAndFinalize(context.services.l("Time is up. Finalizing the recorded text and submitting it.", "Le temps est écoulé. Finalisation du texte enregistré et soumission."))) {
                        context.services.resolvePendingVoiceSubmission();
                    }
                    return;
                }
                if (context.state.voiceFinalizePending) {
                    setStatus(context.services.l("Time is up. Finalizing the recorded text and submitting it.", "Le temps est écoulé. Finalisation du texte enregistré et soumission."));
                    return;
                }
                context.services.resolvePendingVoiceSubmission();
                return;
            }
            try { await context.services.cutOffCurrentPhaseReadAloudIfNeeded(expiredPhase); }
            catch(error){
                if(runId !== context.state.matchRunId || context.state.sessionClosed || context.services.getCurrentPhase()?.id!==expiredPhase.id || context.state.completed)return;
                blockAutoGenerationForPhase(expiredPhase.id);
                setStatus(context.services.l("Speech transcription failed. Use Retry transcription before continuing.","La transcription a échoué. Réessayez avant de continuer."),true);
                refreshNextActionControl(expiredPhase, false, false);return;
            }
            if(runId !== context.state.matchRunId || context.state.sessionClosed || context.services.getCurrentPhase()?.id!==expiredPhase.id || context.state.completed)return;
            finishTimedPhaseAfterAudioTranscript(expiredPhase);
        }


        function finishTimedPhaseAfterAudioTranscript(expiredPhase) {
            if (expiredPhase.kind === "judgeQuestion" && context.services.usesAiJudgeQuestions()) {
                const question = [...context.state.transcript].reverse().find(message => message.phaseId === expiredPhase.id && message.kind === "judge");
                if (question?.speechDeliveryState === "cutoff" && question.text) context.services.storeJudgeQuestionForPhase(expiredPhase,question.text);
            }
            context.services.primeAiPreparationForPhase(expiredPhase);
            context.services.appendMessage("moderator", context.services.moderatorLabel(), context.services.l("Time.", "Temps."), {
                caseNum: expiredPhase.caseNum || 0,
                    phaseId: expiredPhase.id || "",
                    onPlaybackComplete: () => {
                        const current = context.services.getCurrentPhase();
                        if (!current || current.id !== expiredPhase.id || context.state.completed) return;
                        advanceAfterTimedPhaseExpiration(expiredPhase);
                    }
            });
            setStatus(context.services.l("Time is up for the current phase.", "Le temps est écoulé pour la phase actuelle."));
        }


        function scrollLiveVoicePreviewToBottom() {
            if (!context.ui.liveVoicePreviewEl || context.ui.liveVoiceWrapEl.hidden) return;
            context.platform.window.requestAnimationFrame(() => {
                context.ui.liveVoicePreviewEl.scrollTop = context.ui.liveVoicePreviewEl.scrollHeight;
            });
        }


        function resetStateForNewMatch() {
            context.services.cancelHumanCoinCall();
            const runId=context.state.matchRunId+1,transcriptionId=context.state.finalTranscriptionRequestId+1,locale=context.state.locale,origins=context.state.caseArchiveOrigins;
            context.state.matchRunId=runId;context.state.finalTranscriptionRequestId=transcriptionId;
            context.services.stopSpeechPlayback(false,{resolveCallbacks:false,deliveryReason:"reset"});
            context.services.releaseMicrophoneStream();context.services.stopTimer();
            const audioContext=context.state.timingTestAudioContext;
            if(audioContext && audioContext.state!=="closed")void audioContext.close().catch(()=>{});
            const speechToken=context.state.speechToken;
            const fresh=context.platform.window.EthicsMatchSession.create({locale,modelCatalog:context.settings.MODEL_CATALOG});
            for(const key of Object.keys(context.state))delete context.state[key];
            Object.assign(context.state,fresh,{matchRunId:runId,speechToken,finalTranscriptionRequestId:transcriptionId,caseArchiveOrigins:origins});
            context.state.participantTypes={human:context.services.normalizeParticipantMode(context.ui.participantOneTypeSelectEl.value),ai:context.services.normalizeParticipantMode(context.ui.participantTwoTypeSelectEl.value)};
            context.state.participantModels={human:context.services.normalizeMatchModel(context.ui.participantOneModelSelectEl.value),ai:context.services.normalizeMatchModel(context.ui.modelSelectEl.value)};
            context.state.moderatorReadsFullCase=context.ui.moderatorReadFullCaseSelectEl.value==="yes";
            context.services.renderTranscript();renderPhaseList();context.services.clearScoreboard();context.services.refreshTimingTestUi();
        }


        function fullReset() {
            resetStateForNewMatch();
            context.services.syncParticipantSetupUi();
            context.ui.currentPhaseTitleEl.textContent = context.services.l("Setup", "Configuration");
            context.ui.currentPhaseMetaEl.textContent = context.services.l("Enter two cases and start the match.", "Saisissez deux cas et démarrez le match.");
            context.ui.timerDisplayEl.textContent = "--:--";
            context.ui.timerHintEl.textContent = context.services.l("No active timed phase yet.", "Aucune phase minutée en cours.");
            context.ui.coinChoicePanelEl.hidden = true;
            context.ui.messageInputEl.value = "";
            context.services.hideLiveVoicePreview();
            setStatus(
                context.settings.credentialState.loaded
                ? context.services.l("Ready.", "Prêt.")
                : context.services.l("Checking AI provider credentials...", "Vérification des identifiants des fournisseurs IA...")
            );
            refreshControls();
        }


        function applyCaseOneChoice(decidingRole, choice) {
            const normalizedChoice = choice === "pass" ? "pass" : "lead";
            const case1Leader = normalizedChoice === "lead" ? decidingRole : context.services.otherRole(decidingRole);
            context.state.leadByCase[1] = case1Leader;
            context.state.leadByCase[2] = context.services.otherRole(case1Leader);
            context.services.appendMessage("moderator", context.services.moderatorLabel(),
                          context.services.isFrenchLocale()
                          ? `${context.services.speakerName(decidingRole)} choisit de ${normalizedChoice === "lead" ? "mener" : "passer"} au cas 1. ${context.services.speakerName(context.state.leadByCase[1])} mènera le cas 1 et ${context.services.speakerName(context.state.leadByCase[2])} mènera le cas 2.`
                          : `${context.services.speakerName(decidingRole)} chooses to ${normalizedChoice} on Case #1. ${context.services.speakerName(context.state.leadByCase[1])} will lead Case #1, and ${context.services.speakerName(context.state.leadByCase[2])} will lead Case #2.`
            );
        }


        async function startMatch() {
            try {
                const { case1, case2 } = await context.services.validateBeforeStart();
                resetStateForNewMatch();
                const runId = context.state.matchRunId;
                const isCurrent = () => runId === context.state.matchRunId && !context.state.sessionClosed;
                const participantOneMode = context.services.normalizeParticipantMode(context.ui.participantOneTypeSelectEl.value);
                context.state.participantTypes.human = participantOneMode;
                context.state.participantTypes.ai = context.services.normalizeParticipantMode(context.ui.participantTwoTypeSelectEl?.value || "ai");
                context.state.participantModels.human = context.services.normalizeMatchModel(context.ui.participantOneModelSelectEl.value);
                context.state.participantModels.ai = context.services.normalizeMatchModel(context.ui.modelSelectEl.value);
                context.state.names.human = context.services.sanitizeText(context.ui.humanNameInputEl.value) || context.services.getDefaultParticipantOneName(participantOneMode);
                context.state.names.ai = context.services.sanitizeText(context.ui.aiNameInputEl.value) || context.services.getDefaultParticipantTwoName(context.state.participantTypes.ai);
                context.state.cases[1] = case1;
                context.state.cases[2] = case2;
                context.state.judgeMode = context.services.normalizeJudgeMode(context.ui.judgeModeSelectEl.value);
                context.state.judgePanelPreset = context.settings.MODEL_CATALOG.normalizeJudgePanel(context.ui.judgePanelPresetSelectEl.value);
                context.state.liveScreenActive = true;
                context.services.renderMatchCaseReference();
                context.services.updateMatchSummaryPlaceholder();
                updatePhaseHeader();
                refreshControls();

                context.services.appendMessage("moderator", context.services.moderatorLabel(), context.services.l(
                    `Welcome to this Ethics Bowl match between ${context.state.names.human} and ${context.state.names.ai}. This site uses the official two-case structure, adapted for two single participants.`,
                    `Bienvenue à ce match de la Coupe éthique Canada entre ${context.state.names.human} et ${context.state.names.ai}. Ce site utilise la structure officielle à deux cas, adaptée à deux participantes individuelles.`
                ));

                context.services.appendMessage("moderator", context.services.moderatorLabel(), context.services.l(
                    "The coin-toss winner chooses whether to lead or pass on Case #1, the other participant leads Case #2, there is a judges' period after each case, and both participants are questioned once during their led case.",
                    "La gagnante du tirage choisit si elle mène ou passe au cas 1, l’autre participante mène le cas 2, il y a une période des juges après chaque cas, et chaque participante reçoit une question pendant le cas qu’elle mène."
                ));

                let humanCall;

                await context.services.appendMessageAndWaitForPlayback(
                    "moderator",
                    context.services.moderatorLabel(),
                    context.services.l(
                        `I will now flip a coin. ${context.services.speakerName("human")}, what is your call?`,
                        `Je vais maintenant lancer une pièce. ${context.services.speakerName("human")}, quel est votre choix?`
                    ),
                    {
                        onPlaybackStart: () => {
                            context.state.showCoinTossCeremony = true;
                            if (context.services.isHumanControlledRole("human")) humanCall = context.services.requestHumanCoinCall();
                            refreshControls();
                        }
                    }
                );
                if (!isCurrent()) return;
                const coinCall = humanCall ? await humanCall : (Math.random() < 0.5 ? "heads" : "tails");
                if (!isCurrent() || !coinCall) return;
                await context.services.appendMessageAndWaitForPlayback(
                    context.services.messageKindForRole("human"),
                    context.services.speakerName("human"),
                    context.services.titleCase(context.services.coinSideLabel(coinCall)),
                    { voiceKey: context.services.messageKindForRole("human"), substantive: false }
                );
                if (!isCurrent()) return;
                const coinResult = Math.random() < 0.5 ? "heads" : "tails";
                const winner = coinCall === coinResult ? "human" : "ai";
                const animationCompleted = await context.services.playCoinTossAnimation(coinCall, coinResult, winner);
                if (!animationCompleted) return;

                context.services.appendMessage("moderator", context.services.moderatorLabel(), context.services.isFrenchLocale()
                    ? `${context.services.speakerName("human")} a choisi ${context.services.coinSideLabel(coinCall)}. Le résultat est ${context.services.coinSideLabel(coinResult)}. ${context.services.speakerName(winner)} gagne le tirage.`
                    : `${context.services.speakerName("human")} called ${context.services.coinSideLabel(coinCall)}. The coin is ${context.services.coinSideLabel(coinResult)}. ${context.services.speakerName(winner)} wins the toss.`
                );

                if (context.services.isHumanControlledRole(winner)) {
                    context.state.waitingForCoinChoice = true;
                    context.ui.coinChoicePanelEl.hidden = false;
                    setStatus(context.services.isFrenchLocale() ? `${context.services.speakerName(winner)} a gagné le tirage. Choisissez de mener ou de passer au cas 1.` : `${context.services.speakerName(winner)} won the coin toss. Choose whether to lead or pass on Case #1.`);
                    refreshControls();
                    return;
                }

                const autoChoice = Math.random() < 0.5 ? "lead" : "pass";
                applyCaseOneChoice(winner, autoChoice);
                beginStructuredMatch();
            } catch (error) {
                setStatus(error?.message || context.services.l("Could not start the match.", "Impossible de démarrer le match."), true);
            }
        }


        function beginStructuredMatch() {
            context.state.started = true;
            context.state.phases = context.services.buildPhases();
            context.state.currentPhaseIndex = -1;
            context.state.phaseReady = false;
            context.state.phaseAwaitingPlaybackForId = "";
            context.state.pendingAutoActionPhaseId = "";
            context.state.autoGenerationBlockedPhaseId = "";
            context.state.mainComposerHydratedPhaseId = "";
            context.services.updateMatchSummaryPlaceholder();
            renderPhaseList();
            updatePhaseHeader();
            refreshControls();
            advancePhase();
        }


        function phaseAnnouncementText(phase) {
            if (!phase) return "";
            if (phase.kind === "moderatorCase") {
                const caseData = context.state.cases[phase.caseNum];
                const leader = context.services.speakerName(context.state.leadByCase[phase.caseNum]);
                const responder = context.services.speakerName(context.services.otherRole(context.state.leadByCase[phase.caseNum]));
                const moderatorQuestion = context.services.ensureSentenceEnding(caseData.question, "?");
                if (context.state.moderatorReadsFullCase) {
                    const fullCaseText = context.services.ensureSentenceEnding(caseData.text);
                    return context.services.isFrenchLocale()
                    ? `Nous sommes maintenant prêtes à commencer le ${context.services.caseLabel(phase.caseNum)}. Le cas s’intitule « ${caseData.title} ». Je vais maintenant lire le cas au complet. ${fullCaseText} La question est : ${moderatorQuestion} ${leader} mènera ce cas et ${responder} répondra.`
                    : `We are ready to begin Case #${phase.caseNum}. The case is "${caseData.title}". I will now read the full case. ${fullCaseText} The question is: ${moderatorQuestion} ${leader} will lead this case, and ${responder} will respond.`;
                }
                return context.services.isFrenchLocale()
                ? `Nous sommes maintenant prêtes à commencer le ${context.services.caseLabel(phase.caseNum)}. Le cas s’intitule « ${caseData.title} ». La question est : ${moderatorQuestion} ${leader} mènera ce cas et ${responder} répondra.`
                : `We are ready to begin Case #${phase.caseNum}. The case is "${caseData.title}". The question is: ${moderatorQuestion} ${leader} will lead this case, and ${responder} will respond.`;
            }
            if (phase.kind === "confer") {
                const subtype = phase.subtype === "presentation" ? context.services.l("presentation", "présentation") : phase.subtype === "commentary" ? context.services.l("commentary", "commentaire") : context.services.l("response", "réplique");
                return context.services.isFrenchLocale()
                ? `${context.services.speakerName(phase.speaker)}, vous avez maintenant jusqu’à ${context.services.formatDurationNatural(phase.duration)} pour vous concerter avant votre ${subtype}. L’autre participante doit rester silencieuse.`
                : `${context.services.speakerName(phase.speaker)}, you now have up to ${context.services.formatDurationNatural(phase.duration)} to confer before your ${phase.subtype}. The other participant must remain silent.`;
            }
            if (phase.kind === "speech") {
                if (phase.subtype === "presentation") return context.services.isFrenchLocale()
                    ? `${context.services.speakerName(phase.speaker)}, vous avez maintenant jusqu’à ${context.services.formatDurationNatural(phase.duration)} pour faire votre présentation.`
                    : `${context.services.speakerName(phase.speaker)}, you now have up to ${context.services.formatDurationNatural(phase.duration)} to make your presentation.`;
                if (phase.subtype === "commentary") return context.services.isFrenchLocale()
                    ? `${context.services.speakerName(phase.speaker)}, vous avez maintenant jusqu’à ${context.services.formatDurationNatural(phase.duration)} pour commenter la présentation.`
                    : `${context.services.speakerName(phase.speaker)}, you now have up to ${context.services.formatDurationNatural(phase.duration)} to comment on the presentation.`;
                return context.services.isFrenchLocale()
                ? `${context.services.speakerName(phase.speaker)}, vous avez maintenant jusqu’à ${context.services.formatDurationNatural(phase.duration)} pour répliquer.`
                : `${context.services.speakerName(phase.speaker)}, you now have up to ${context.services.formatDurationNatural(phase.duration)} to respond.`;
            }
            if (phase.kind === "judgeQuestion") {
                return context.services.isFrenchLocale()
                ? `${context.services.judgeLabel(phase.judgeNumber)} peut maintenant poser une question concise à ${context.services.speakerName(phase.answerer)}. Le temps pour la question est limité à ${context.services.formatDurationNatural(phase.duration)}.`
                : `${context.services.judgeLabel(phase.judgeNumber)} may now ask a concise question to ${context.services.speakerName(phase.answerer)}. Question time is capped at ${context.services.formatDurationNatural(phase.duration)}.`;
            }
            if (phase.kind === "judgeAnswer") {
                return context.services.isFrenchLocale()
                ? `${context.services.speakerName(phase.speaker)}, vous avez maintenant jusqu’à ${context.services.formatDurationNatural(phase.duration)} pour répondre au ${context.services.judgeLabel(phase.judgeNumber)}.`
                : `${context.services.speakerName(phase.speaker)}, you now have up to ${context.services.formatDurationNatural(phase.duration)} to answer ${context.services.judgeLabel(phase.judgeNumber)}.`;
            }
            if (phase.kind === "scoring") {
                return context.services.isFrenchLocale()
                ? `Juges, veuillez maintenant attribuer le pointage du ${context.services.caseLabel(phase.caseNum)}.`
                : `Judges, please score Case #${phase.caseNum} now.`;
            }
            if (phase.kind === "closing") {
                return context.services.isFrenchLocale()
                ? "Phase de clôture. Les juges vont finaliser leurs fiches de pointage et le modérateur annoncera la gagnante ou l’égalité."
                : "Closing phase. The judges will finalize their score sheets, and the moderator will announce the winner or whether the match is a tie.";
            }
            return "";
        }


        function shouldAutoGenerate(phase) {
            if (!phase || !context.state.phaseReady || context.state.busy || context.state.isRecording || context.state.voiceFinalizePending) return false;
            if (context.services.isCurrentPhaseAwaitingPlayback(phase)) return false;
            if (phase.kind === "confer" && context.services.isAiControlledRole(phase.speaker)) return true;
            if (phase.kind === "speech" && context.services.isAiControlledRole(phase.speaker)) return true;
            if (phase.kind === "judgeQuestion" && context.services.usesAiJudgeQuestions()) return true;
            if (phase.kind === "judgeAnswer" && context.services.isAiControlledRole(phase.speaker)) return true;
            return false;
        }


        function activatePhaseAfterModerator(phaseId) {
            const phase = context.services.getCurrentPhase();
            if (!phase || phase.id !== phaseId || context.state.completed) return;
            context.state.phaseReady = true;
            context.services.revealTranscriptMessagesForPhase(phaseId);
            if (phase.duration) {
                if (context.services.phaseTimerStartsWithAutoSpeech(phase)) context.services.prepareTimerForAutoSpeech(phase);
                else context.services.setTimerForPhase(phase);
            } else {
                context.ui.timerDisplayEl.textContent = "--:--";
                if (phase.kind === "closing") {
                    context.ui.timerHintEl.textContent = context.state.judgeMode === "ai"
                    ? context.services.l("Generating the final decision automatically.", "Génération automatique de la décision finale.")
                    : context.services.l("Enter the final human-judge scores when ready.", "Entrez les notes finales des juges humains quand vous êtes prête.");
                } else {
                    context.ui.timerHintEl.textContent = context.services.l("No active timed phase.", "Aucune phase minutée active.");
                }
            }
            updatePhaseHeader();
            refreshControls();
            context.services.primeAiPreparationForPhase(phase);
            if (phase.kind === "moderatorCase" || phase.kind === "scoring") {
                schedulePhaseAdvance(phaseId);
                return;
            }
            maybeAutoTriggerCurrentPhase();
        }


        function enterCurrentPhase() {
            const phase = context.services.getCurrentPhase();
            if (!phase) return;
            context.state.phaseReady = false;
            context.services.clearPhaseAwaitingPlayback();
            context.state.pendingAutoActionPhaseId = "";
            clearAutoGenerationBlock();
            context.state.mainComposerHydratedPhaseId = "";
            updatePhaseHeader();
            renderPhaseList();
            context.services.prepareTimerForPhaseAnnouncement(phase);
            refreshControls();
            context.services.primeAiPreparationForPhase(phase);
            context.services.primeAiFinalScoringPreparationForPhase(phase);
            context.services.appendMessage("moderator", context.services.moderatorLabel(), phaseAnnouncementText(phase), {
                caseNum: phase.caseNum || 0,
                    phaseId: phase.id,
                    onPlaybackStart: () => {
                        if (phase.kind === "moderatorCase" && context.state.currentPhaseIndex === 0) {
                            context.state.showCoinTossCeremony = false;
                            refreshControls();
                        }
                        context.services.primeAiSpeechPlaybackDuringModerator(phase);
                    },
                    onPlaybackComplete: () => {
                        activatePhaseAfterModerator(phase.id);
                    }
            });
        }


        function advancePhase() {
            if (context.state.completed || context.services.timingTestResultLimitReached()) return;
            if (context.state.currentPhaseIndex + 1 >= context.state.phases.length) return;
            context.services.clearPhaseAwaitingPlayback();
            context.state.pendingAutoActionPhaseId = "";
            context.state.mainComposerHydratedPhaseId = "";
            context.state.currentPhaseIndex += 1;
            enterCurrentPhase();
        }


        function currentPhaseRequiresHumanSubmission(phase) {
            return context.state.phaseReady && context.services.isHumanSubmissionPhase(phase);
        }


        function refreshJudgeStatuses() {
            context.ui.judgeInputs.forEach((judge) => {
                judge.status.textContent = context.services.l("Idle", "En attente");
                judge.status.className = "status-chip subtle";
            });
            const phase = context.services.getCurrentPhase();
            if (!phase || context.state.judgeMode !== "human") return;
            if (phase.kind === "judgeQuestion") {
                const active = context.ui.judgeInputs.find((judge) => judge.number === phase.judgeNumber);
                if (active) {
                    active.status.textContent = context.state.phaseReady
                    ? context.services.l("Active • Ask in main box", "Actif • Posez dans la boîte principale")
                    : context.services.isFrenchLocale() ? `En attente • ${context.services.caseLabel(phase.caseNum)}` : `Queued • ${context.services.caseLabel(phase.caseNum)}`;
                    active.status.className = "status-chip active";
                }
            }
        }


        function updateComposerPlaceholder() {
            const phase = context.services.getCurrentPhase();
            if (!phase) {
                context.ui.messageInputEl.placeholder = context.services.l("When it is your turn, type here.", "Quand ce sera votre tour, écrivez ici.");
                return;
            }
            if (!context.state.phaseReady) {
                if (context.services.isHumanSubmissionPhase(phase)) {
                    context.ui.messageInputEl.placeholder = context.services.l("Wait for the moderator to finish speaking before entering your turn.", "Attendez que le modérateur ait fini de parler avant d’entrer votre tour.");
                    return;
                }
                if (context.services.isHumanJudgeQuestionPhase(phase)) {
                    context.ui.messageInputEl.placeholder = context.services.l("Wait for the moderator to finish speaking. The active judge's draft will appear here.", "Attendez que le modérateur ait fini de parler. Le brouillon du juge actif apparaîtra ici.");
                    return;
                }
                context.ui.messageInputEl.placeholder = context.services.l("Text and voice inputs become active during human-controlled turns and human judge question phases.", "Les saisies texte et vocales deviennent actives pendant les tours humains et les phases de question des juges humains.");
                return;
            }
            if (phase.kind === "speech" && context.services.isHumanControlledRole(phase.speaker)) {
                if (phase.subtype === "presentation") {
                    context.ui.messageInputEl.placeholder = context.services.isFrenchLocale()
                    ? `Tapez ici la présentation de ${context.services.speakerName(phase.speaker)} pour le ${context.services.caseLabel(phase.caseNum)}, ou utilisez la saisie vocale.`
                    : `Type ${context.services.speakerName(phase.speaker)}'s ${context.services.caseLabel(phase.caseNum)} presentation here, or use voice input.`;
                    return;
                }
                if (phase.subtype === "commentary") {
                    context.ui.messageInputEl.placeholder = context.services.isFrenchLocale()
                    ? `Tapez ici le commentaire de ${context.services.speakerName(phase.speaker)} pour le ${context.services.caseLabel(phase.caseNum)}, ou utilisez la saisie vocale.`
                    : `Type ${context.services.speakerName(phase.speaker)}'s ${context.services.caseLabel(phase.caseNum)} commentary here, or use voice input.`;
                    return;
                }
                context.ui.messageInputEl.placeholder = context.services.isFrenchLocale()
                ? `Tapez ici la réplique de ${context.services.speakerName(phase.speaker)} pour le ${context.services.caseLabel(phase.caseNum)}, ou utilisez la saisie vocale.`
                : `Type ${context.services.speakerName(phase.speaker)}'s ${context.services.caseLabel(phase.caseNum)} response here, or use voice input.`;
                return;
            }
            if (phase.kind === "judgeAnswer" && context.services.isHumanControlledRole(phase.speaker)) {
                context.ui.messageInputEl.placeholder = context.services.isFrenchLocale()
                ? `Tapez ici la réponse de ${context.services.speakerName(phase.speaker)} au ${context.services.judgeLabel(phase.judgeNumber)}, ou utilisez la saisie vocale.`
                : `Type ${context.services.speakerName(phase.speaker)}'s answer to ${context.services.judgeLabel(phase.judgeNumber)} here, or use voice input.`;
                return;
            }
            if (context.services.isHumanJudgeQuestionPhase(phase)) {
                context.ui.messageInputEl.placeholder = context.services.isFrenchLocale()
                ? `${context.services.getActiveHumanJudgeName(phase)} doit taper ou dicter la question ici.`
                : `${context.services.getActiveHumanJudgeName(phase)} should type or dictate the question here.`;
                return;
            }
            context.ui.messageInputEl.placeholder = context.services.l("Text and voice inputs become active during human-controlled turns and human judge question phases.", "Les saisies texte et vocales deviennent actives pendant les tours humains et les phases de question des juges humains.");
        }


        function getAllAiMatchActivityStatus(phase = context.services.getCurrentPhase()) {
            if (context.state.coinTossAnimating) return context.services.l("Automated coin toss in progress...", "Tirage automatisé en cours...");
            if (!phase) return context.services.l("Starting the automated match...", "Démarrage du match automatisé...");
            if (!context.state.phaseReady) {
                return context.services.isFrenchLocale()
                    ? `Transition automatisée vers ${phase.title}...`
                    : `Automated transition to ${phase.title}...`;
            }
            if (context.services.isCurrentPhaseAwaitingPlayback(phase)) {
                return context.services.isFrenchLocale()
                    ? `${phase.title} : traitement de la prise de parole minutée...`
                    : `${phase.title}: processing the timed speech...`;
            }
            if (phase.kind === "confer") {
                return context.services.isFrenchLocale()
                    ? `${context.services.speakerName(phase.speaker)} prépare son ${context.services.phaseSubtypeLabel(phase.subtype).toLowerCase()}...`
                    : `${context.services.speakerName(phase.speaker)} is preparing the ${phase.subtype || "speech"}...`;
            }
            if (phase.kind === "speech") {
                return context.services.isFrenchLocale()
                    ? `${context.services.speakerName(phase.speaker)} effectue automatiquement son ${context.services.phaseSubtypeLabel(phase.subtype).toLowerCase()}...`
                    : `${context.services.speakerName(phase.speaker)} is running the ${phase.subtype || "speech"} automatically...`;
            }
            if (phase.kind === "judgeQuestion") {
                return context.services.isFrenchLocale()
                    ? `${context.services.judgeLabel(phase.judgeNumber)} prépare une question...`
                    : `${context.services.judgeLabel(phase.judgeNumber)} is preparing a question...`;
            }
            if (phase.kind === "judgeAnswer") {
                return context.services.isFrenchLocale()
                    ? `${context.services.speakerName(phase.speaker)} prépare une réponse au ${context.services.judgeLabel(phase.judgeNumber)}...`
                    : `${context.services.speakerName(phase.speaker)} is preparing an answer to ${context.services.judgeLabel(phase.judgeNumber)}...`;
            }
            if (phase.kind === "scoring") return context.services.l("AI judges are scoring the case...", "Les juges IA évaluent le cas...");
            if (phase.kind === "closing") return context.services.l("AI judges are finalizing the decision...", "Les juges IA finalisent la décision...");
            return context.services.isFrenchLocale()
                ? `Exécution automatisée de ${phase.title}...`
                : `Running ${phase.title} automatically...`;
        }


        function replaceGenericReadyStatusForAllAiMatch() {
            const isAllAiMatch = context.state.started
                && !context.state.completed
                && context.services.isAiControlledRole("human")
                && context.services.isAiControlledRole("ai")
                && context.state.judgeMode === "ai";
            if (!isAllAiMatch) return;
            if (context.services.sanitizeText(context.ui.statusLineEl.textContent) !== context.services.l("Ready.", "Prêt.")) return;
            setStatus(getAllAiMatchActivityStatus());
        }


        function refreshNextActionControl(phase, locked, waitingForPlayback) {
            const automatic = !!phase && (
                (["speech", "judgeAnswer", "confer"].includes(phase.kind) && context.services.isAiControlledRole(phase.speaker))
                || (phase.kind === "judgeQuestion" && context.services.usesAiJudgeQuestions())
                || (phase.kind === "closing" && context.services.usesAiFinalScoring())
            );
            const retry = context.state.spokenAudioCutoffRetry;
            const transcriptionRetry = !!retry && retry.runId === context.state.matchRunId
                && retry.prepared?.entry?.phaseId === phase?.id && !!phase;
            const generationRetry = automatic && context.state.autoGenerationBlockedPhaseId === phase.id;
            context.ui.nextActionBtnEl.hidden = context.state.sessionClosed || context.state.completed || (!!retry && !transcriptionRetry)
                || (automatic && !generationRetry && !transcriptionRetry);
            if (transcriptionRetry && context.state.started && !context.state.completed && !context.state.sessionClosed) {
                context.ui.nextActionBtnEl.hidden = false;
                context.ui.nextActionBtnEl.textContent = context.services.l("Retry transcription", "Réessayer la transcription");
                context.ui.nextActionBtnEl.disabled = !!locked;
                return;
            }
            if (context.state.coinTossAnimating) {
                context.ui.nextActionBtnEl.textContent = context.services.l("Coin Toss Running", "Tirage en cours");
                context.ui.nextActionBtnEl.disabled = true;
            } else if (context.state.waitingForCoinCall) {
                context.ui.nextActionBtnEl.textContent = context.services.l("Waiting for the coin call", "En attente du choix de la pièce");
                context.ui.nextActionBtnEl.disabled = true;
            } else if (context.state.waitingForCoinChoice) {
                context.ui.nextActionBtnEl.textContent = context.services.l("Waiting for Coin Toss Choice", "En attente du choix après le tirage");
                context.ui.nextActionBtnEl.disabled = true;
            } else if (!context.state.started) {
                context.ui.nextActionBtnEl.textContent = context.services.l("Advance / Generate", "Avancer / Générer");
                context.ui.nextActionBtnEl.disabled = true;
            } else if (context.state.completed) {
                context.ui.nextActionBtnEl.textContent = context.services.l("Match Complete", "Match terminé");
                context.ui.nextActionBtnEl.disabled = true;
            } else if (!phase) {
                context.ui.nextActionBtnEl.textContent = context.services.l("Advance", "Avancer");
                context.ui.nextActionBtnEl.disabled = false;
            } else if (!context.state.phaseReady) {
                context.ui.nextActionBtnEl.textContent = context.services.l("Moderator Speaking...", "Le modérateur parle...");
                context.ui.nextActionBtnEl.disabled = true;
            } else if (locked) {
                context.ui.nextActionBtnEl.textContent = waitingForPlayback ? context.services.l("Waiting for Read-Aloud", "En attente de la lecture") : context.services.l("Waiting", "En attente");
                context.ui.nextActionBtnEl.disabled = true;
            } else if (phase.kind === "moderatorCase") {
                context.ui.nextActionBtnEl.textContent = context.services.l("Advance", "Avancer");
                context.ui.nextActionBtnEl.disabled = false;
            } else if (phase.kind === "confer" && context.services.isAiControlledRole(phase.speaker)) {
                context.ui.nextActionBtnEl.textContent = context.services.l("Retry AI Confer", "Réessayer le caucus IA");
                context.ui.nextActionBtnEl.disabled = false;
            } else if (phase.kind === "confer") {
                context.ui.nextActionBtnEl.textContent = context.services.l("Advance", "Avancer");
                context.ui.nextActionBtnEl.disabled = false;
            } else if (phase.kind === "speech" && context.services.isAiControlledRole(phase.speaker)) {
                context.ui.nextActionBtnEl.textContent = context.services.getPreparedAiTurnText(phase.id)
                ? context.services.l("Retry Prepared AI Turn", "Réessayer le tour IA préparé")
                : context.services.l("Retry AI Turn", "Réessayer le tour IA");
                context.ui.nextActionBtnEl.disabled = false;
            } else if (phase.kind === "speech" && context.services.isHumanControlledRole(phase.speaker)) {
                context.ui.nextActionBtnEl.textContent = context.services.l("Waiting for Human Turn", "En attente du tour humain");
                context.ui.nextActionBtnEl.disabled = true;
            } else if (phase.kind === "judgeQuestion" && context.services.usesAiJudgeQuestions()) {
                context.ui.nextActionBtnEl.textContent = context.services.isFrenchLocale() ? `Réessayer la question du ${context.services.judgeLabel(phase.judgeNumber)}` : `Retry ${context.services.judgeLabel(phase.judgeNumber)} Question`;
                context.ui.nextActionBtnEl.disabled = false;
            } else if (phase.kind === "judgeQuestion" && context.state.judgeMode === "human") {
                context.ui.nextActionBtnEl.textContent = context.services.isFrenchLocale() ? `En attente du ${context.services.judgeLabel(phase.judgeNumber)}` : `Waiting for ${context.services.judgeLabel(phase.judgeNumber)}`;
                context.ui.nextActionBtnEl.disabled = true;
            } else if (phase.kind === "judgeAnswer" && context.services.isAiControlledRole(phase.speaker)) {
                context.ui.nextActionBtnEl.textContent = context.services.getPreparedAiTurnText(phase.id)
                ? context.services.l("Retry Prepared AI Answer", "Réessayer la réponse IA préparée")
                : context.services.l("Retry AI Answer", "Réessayer la réponse IA");
                context.ui.nextActionBtnEl.disabled = false;
            } else if (phase.kind === "judgeAnswer" && context.services.isHumanControlledRole(phase.speaker)) {
                context.ui.nextActionBtnEl.textContent = context.services.l("Waiting for Human Answer", "En attente de la réponse humaine");
                context.ui.nextActionBtnEl.disabled = true;
            } else if (phase.kind === "scoring") {
                context.ui.nextActionBtnEl.textContent = phase.caseNum === 1 ? context.services.l("Proceed to Case #2", "Passer au cas 2") : context.services.l("Proceed to Closing", "Passer à la clôture");
                context.ui.nextActionBtnEl.disabled = false;
            } else if (phase.kind === "closing") {
                context.ui.nextActionBtnEl.textContent = context.state.judgeMode === "ai"
                ? context.services.l("Retry Final Decision", "Réessayer la décision finale")
                : context.services.l("Compute Human-Judge Result", "Calculer le résultat des juges humains");
                context.ui.nextActionBtnEl.disabled = false;
            }

        }

        function refreshControls() {
            context.services.ensureSpeechUi();
            context.services.updateApiKeyUi();
            context.services.syncParticipantSetupUi();
            context.services.refreshParticipantScoreLabels();
            context.services.syncScreenVisibility();
            context.services.renderMatchSetupSummary();
            context.services.renderMatchCaseReference();
            context.services.syncCoinTossUi();
            const phase = context.services.getCurrentPhase();
            const composerActive = context.services.currentPhaseUsesMainComposer(phase);
            const humanTurn = currentPhaseRequiresHumanSubmission(phase);
            const judgeQuestionComposerActive = phase && context.state.phaseReady && context.services.isHumanJudgeQuestionPhase(phase);
            const waitingForPlayback = context.services.isCurrentPhaseAwaitingPlayback(phase);
            const locked = context.state.busy || context.state.isRecording || context.state.voiceFinalizePending || waitingForPlayback || context.state.coinTossAnimating;
            const submitLocked = context.state.completed || context.state.busy || context.state.voiceFinalizePending || waitingForPlayback || context.state.coinTossAnimating;

            [
                context.platform.document.getElementById("case1QuestionSelect"), context.platform.document.getElementById("case2QuestionSelect"),
                context.ui.participantOneTypeSelectEl, context.ui.participantTwoTypeSelectEl, context.ui.participantOneModelSelectEl, context.ui.humanNameInputEl, context.ui.aiNameInputEl,
                context.ui.judgeModeSelectEl, context.ui.judgePanelPresetSelectEl, context.ui.moderatorReadFullCaseSelectEl, context.ui.modelSelectEl, context.ui.case1TitleInputEl, context.ui.case1QuestionInputEl, context.ui.case1TextInputEl,
                context.ui.case2TitleInputEl, context.ui.case2QuestionInputEl, context.ui.case2TextInputEl
            ].forEach((el) => {
                if (!el) return;
                el.disabled = context.state.liveScreenActive || context.state.started || context.state.waitingForCoinChoice || locked;
            });

            context.ui.startMatchBtnEl.disabled = !context.services.hasDesktopBridge() || !!context.settings.credentialState.pendingProvider || context.state.liveScreenActive || context.state.started || context.state.waitingForCoinChoice || locked;
            context.ui.resetMatchBtnEl.disabled = locked;
            if (context.ui.newMatchBtnEl) context.ui.newMatchBtnEl.disabled = locked;

            context.ui.coinChoicePanelEl.hidden = !context.state.waitingForCoinChoice;
            const coinChoiceNote = context.ui.coinChoicePanelEl.querySelector(".small-note");
            if (coinChoiceNote && context.state.coinWinner) coinChoiceNote.textContent = context.services.isFrenchLocale() ? `${context.services.speakerName(context.state.coinWinner)} a gagné le tirage. Choisissez de mener ou de passer au cas 1.` : `${context.services.speakerName(context.state.coinWinner)} won the toss. Choose whether to lead or pass on Case #1.`;
            context.ui.leadBtnEl.disabled = !context.state.waitingForCoinChoice || locked;
            context.ui.passBtnEl.disabled = !context.state.waitingForCoinChoice || locked;

            context.services.hydrateMainComposerFromActiveJudgeDraftIfNeeded();

            context.ui.messageInputEl.disabled = !composerActive || context.state.completed || context.state.busy;
            context.ui.messageInputEl.readOnly = context.state.isRecording || context.state.voiceFinalizePending || context.state.busy || !composerActive || context.state.completed;
            context.ui.submitTurnBtnEl.disabled = !composerActive || submitLocked;

            if (judgeQuestionComposerActive) {
                context.ui.submitTurnBtnEl.textContent = context.state.isRecording
                ? context.services.isFrenchLocale() ? `Arrêter et poser la question du ${context.services.judgeLabel(phase.judgeNumber)}` : `Stop & Ask ${context.services.judgeLabel(phase.judgeNumber)} Question`
                : context.services.isFrenchLocale() ? `Poser la question du ${context.services.judgeLabel(phase.judgeNumber)}` : `Ask ${context.services.judgeLabel(phase.judgeNumber)} Question`;
            } else {
                context.ui.submitTurnBtnEl.textContent = context.state.isRecording && humanTurn
                ? context.services.l("Stop & Submit Turn", "Arrêter et soumettre")
                : context.services.l("Submit Turn", "Soumettre le tour");
            }

            context.ui.micBtnEl.disabled = ((!composerActive || context.state.completed) && !context.state.isRecording) || ((context.state.busy || context.state.voiceFinalizePending) && !context.state.isRecording);
            context.ui.micBtnEl.textContent = context.state.isRecording ? context.services.l("■ Stop Recording", "■ Arrêter l’enregistrement") : context.services.l("● Record Voice", "● Enregistrer la voix");
            context.ui.micBtnEl.classList.toggle("recording", context.state.isRecording);

            const hasTimedPhase = !!phase?.duration;
            const timerExists = !!context.state.timer.intervalId;
            const aiVsAiMatch = context.services.isAiControlledRole("human") && context.services.isAiControlledRole("ai");
            if (context.ui.timerControlButtonsEl) {
                context.ui.timerControlButtonsEl.hidden = aiVsAiMatch;
                context.ui.timerControlButtonsEl.style.display = aiVsAiMatch ? "none" : "";
            }
            context.ui.pauseTimerBtnEl.disabled = aiVsAiMatch || !hasTimedPhase || !context.state.phaseReady || !timerExists || !context.state.timer.running;
            context.ui.resumeTimerBtnEl.disabled = aiVsAiMatch || !hasTimedPhase || !context.state.phaseReady || !timerExists || context.state.timer.running || context.state.timer.remaining <= 0;
            context.ui.resetTimerBtnEl.disabled = aiVsAiMatch || !hasTimedPhase || !context.state.phaseReady;

            refreshNextActionControl(phase, locked, waitingForPlayback);

            context.services.updateJudgePanelUi();
            context.ui.aiJudgePanelEl.hidden = context.ui.judgeModeSelectEl.value !== "ai";
            context.ui.humanJudgePanelEl.hidden = context.services.usesAiFinalScoring(context.ui.judgeModeSelectEl.value);
            const hybrid = context.ui.judgeModeSelectEl.value === "hybrid";
            const humanPanelHeading = context.ui.humanJudgePanelEl.querySelector(".judge-copy .status-chip");
            if (humanPanelHeading) humanPanelHeading.textContent = hybrid ? context.services.judgeModeLabel("hybrid") : context.services.l("Human judges active", "Juges humains actifs");
            const humanPanelNote = context.ui.humanJudgePanelEl.querySelector(".judge-copy .small-note");
            if (humanPanelNote) humanPanelNote.textContent = hybrid
                ? context.services.l("AI judges ask the questions. Final scores are pending human entry: enter all three judges’ scores to compute the result.", "Les juges IA posent les questions. Les notes finales attendent la saisie humaine : entrez les notes des trois juges pour calculer le résultat.")
                : context.services.l("During each judge-question phase, enter the active judge’s question and click the button for that judge. At the end, enter the three judges’ scores to compute the result.", "Pendant chaque phase de question des juges, entrez la question du juge actif et cliquez sur le bouton de ce juge. À la fin, entrez les notes des trois juges pour calculer le résultat.");
            context.ui.judgeInputs.forEach(judge => { judge.question.closest(".control-group").hidden = hybrid; });

            context.platform.document.querySelectorAll(".ask-judge-btn").forEach((button) => {
                const judgeNumber = Number(button.dataset.judge);
                button.hidden = hybrid;
                const active = !context.state.busy && !context.state.voiceFinalizePending && context.state.started && !context.state.completed && context.state.phaseReady && phase?.kind === "judgeQuestion" && context.state.judgeMode === "human" && phase.judgeNumber === judgeNumber;
                button.disabled = !active;
                button.textContent = context.services.isFrenchLocale() ? `Poser la question du ${context.services.judgeLabel(judgeNumber)}` : `Ask ${context.services.judgeLabel(judgeNumber)} Question`;
            });

            context.ui.computeHumanResultBtnEl.disabled = context.services.usesAiFinalScoring(context.ui.judgeModeSelectEl.value) || context.state.busy || context.state.isRecording || context.state.voiceFinalizePending || context.state.coinTossAnimating;

            updateComposerPlaceholder();
            refreshJudgeStatuses();
            context.services.updateComposerModeIndicator();
            context.services.refreshSpeechUi();
            replaceGenericReadyStatusForAllAiMatch();
        }


        async function handleNextAction() {
            const runId = context.state.matchRunId;
            if (context.state.sessionClosed) return;
            if(context.state.spokenAudioCutoffRetry){
                const retry=context.state.spokenAudioCutoffRetry,phase=context.services.getCurrentPhase();
                if(phase?.id!==retry.prepared.entry.phaseId){setStatus(context.services.l("The speech transcript belongs to an earlier phase.","La transcription appartient à une phase précédente."),true);return;}
                setBusy(true);
                try{await context.services.finalizeActualAudioCutoff(retry.message,retry.prepared,retry.through,retry.runId);if(runId !== context.state.matchRunId || context.state.sessionClosed)return;clearAutoGenerationBlock(phase.id);finishTimedPhaseAfterAudioTranscript(phase);}
                catch(error){if(runId !== context.state.matchRunId || context.state.sessionClosed)return;setStatus(context.services.l("Speech transcription failed. Retry transcription before continuing.","La transcription a échoué. Réessayez avant de continuer."),true);}
                finally{if(runId === context.state.matchRunId && !context.state.sessionClosed){setBusy(false);if(context.state.spokenAudioCutoffRetry){refreshNextActionControl(context.services.getCurrentPhase(), false, false);}}}
                return;
            }
            if (context.state.busy || context.state.isRecording || context.state.voiceFinalizePending || context.state.completed) return;
            const phase = context.services.getCurrentPhase();
            if (!phase || !context.state.phaseReady) return;
            if (context.state.pendingAutoActionPhaseId === phase.id) context.state.pendingAutoActionPhaseId = "";
            if (phase.kind === "confer" && context.services.isAiControlledRole(phase.speaker)) { await context.services.handleAiConferPhase(phase); return; }
            if (phase.kind === "moderatorCase" || phase.kind === "confer" || phase.kind === "scoring") { advancePhase(); return; }
            if (phase.kind === "speech" && context.services.isAiControlledRole(phase.speaker)) { await context.services.generateAiTurnForPhase(phase); return; }
            if (phase.kind === "judgeQuestion" && context.services.usesAiJudgeQuestions()) { await context.services.askAiJudgeQuestion(phase); return; }
            if (phase.kind === "judgeAnswer" && context.services.isAiControlledRole(phase.speaker)) { await context.services.generateAiTurnForPhase(phase); return; }
            if (phase.kind === "closing") {
                if (context.state.judgeMode === "ai") {
                    try {
                        const cards = await context.services.generateAiFinalScores();
                        if (runId !== context.state.matchRunId || context.state.sessionClosed) return;
                        context.services.announceFinalResult(cards, "ai");
                    } catch (error) {
                        if (runId !== context.state.matchRunId || context.state.sessionClosed) return;
                        context.platform.console.error(error);
                        blockAutoGenerationForPhase(phase.id);
                        setStatus(error?.message || context.services.l("Failed to compute final AI-judge result.", "Le calcul du résultat final des juges IA a échoué."), true);
                    }
                    return;
                }
                try {
                    const cards = context.services.collectHumanJudgeScorecards();
                    context.services.announceFinalResult(cards, "human");
                } catch (error) {
                    setStatus(error?.message || context.services.l("Could not compute the human-judge result.", "Impossible de calculer le résultat des juges humains."), true);
                }
            }
        }
        return Object.freeze({setStatus,setBusy,blockAutoGenerationForPhase,clearAutoGenerationBlock,formatBubbleTime,formatClock,countWords,formatPreciseDuration,renderPhaseList,updatePhaseHeader,schedulePhaseAdvance,scheduleNextActionForPhase,maybeCompletePreparedAiConferral,maybeAutoTriggerCurrentPhase,advanceAfterTimedPhaseExpiration,handleTimedPhaseExpiration,finishTimedPhaseAfterAudioTranscript,scrollLiveVoicePreviewToBottom,resetStateForNewMatch,fullReset,applyCaseOneChoice,startMatch,beginStructuredMatch,phaseAnnouncementText,shouldAutoGenerate,activatePhaseAfterModerator,enterCurrentPhase,advancePhase,currentPhaseRequiresHumanSubmission,refreshJudgeStatuses,updateComposerPlaceholder,getAllAiMatchActivityStatus,replaceGenericReadyStatusForAllAiMatch,refreshNextActionControl,refreshControls,handleNextAction});
    }
    return Object.freeze({create,dependencies});
});
