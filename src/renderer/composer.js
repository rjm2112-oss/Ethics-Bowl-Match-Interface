(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root){root.EthicsRenderer=root.EthicsRenderer||{};root.EthicsRenderer["composer"]=api;}})(typeof globalThis==="object"?globalThis:this,function(){"use strict";
    const dependencies=Object.freeze({"services": ["advanceAfterTimedPhaseExpiration", "advancePhase", "appendMessage", "appendParticipantMessage", "currentPhaseUsesMainComposer", "getActiveHumanJudgeEntry", "getActiveHumanJudgeName", "getAiJudgeQuestionPreparationKey", "getCachedAiJudgeQuestion", "getCurrentPhase", "getPendingVoiceSubmissionReason", "isAiControlledRole", "isCurrentPhaseAwaitingPlayback", "isFrenchLocale", "isHumanJudgeQuestionPhase", "isSpeechPlaybackActive", "judgeLabel", "l", "moderatorLabel", "primeAiJudgeAnswerForFinalQuestion", "primeAiPreparationForPhase", "resolvePendingVoiceSubmission", "sanitizeText", "saveSetup", "setPendingVoiceSubmission", "setStatus", "speakerName", "stopRecordingAndFinalize", "storeJudgeQuestionForPhase", "usesAiFinalScoring"], "settings": ["COMPOSER_STATUS"], "ui": ["composerFormEl", "composerModeIndicatorEl", "judgeInputs", "liveVoicePreviewEl", "liveVoiceWrapEl", "messageInputEl", "nextActionBtnEl", "statusLineEl"], "platform": ["document"]});
    function create(context) {
        function ensureComposerModeIndicatorUi() {
            if(context.ui.composerModeIndicatorEl)return context.ui.composerModeIndicatorEl;
            const indicator=context.platform.document.createElement("div");
            indicator.id="composerModeIndicator";indicator.className="status-chip active";indicator.hidden=true;
            indicator.style.alignSelf="flex-start";indicator.style.marginBottom="2px";
            context.ui.composerFormEl.insertBefore(indicator,context.ui.messageInputEl);
            context.ui.composerModeIndicatorEl=indicator;return indicator;
        }


        function getComposerStatusSnapshot() {
            const phase = context.services.getCurrentPhase();
            const audio = context.state.speechAudioEl;
            const activeSpeechIndex = context.state.currentDeliveryPlayback?.entry?.transcriptIndex
                ?? context.state.currentSpeechRecordPlayback?.entry?.transcriptIndex
                ?? context.state.speechProgressMessageIndex;
            const speechMessage = context.state.transcript[activeSpeechIndex];
            const playing = !!(audio?.src && !audio.paused && !audio.ended);
            const playbackPaused = !!(context.state.speechPlaybackActive && audio?.src && audio.paused && !audio.ended && audio.currentTime > 0);
            const timerMatches = !!phase && context.state.timer.phaseId === phase.id;
            const judgePrepKey = phase?.kind === "judgeQuestion" ? context.services.getAiJudgeQuestionPreparationKey(phase.caseNum, phase.judgeNumber) : "";
            return {
                locale: context.state.locale, phase, started: context.state.started, completed: context.state.completed,
                audioTranscriptPending:!!context.state.spokenAudioTranscriptionPending,audioTranscriptRetry:!!context.state.spokenAudioCutoffRetry,
                matchRunId: context.state.matchRunId, notice: context.state.composerStatusNotice,
                phaseReady: context.state.phaseReady, busy: context.state.busy,
                coinTossAnimating: context.state.coinTossAnimating, waitingForCoinChoice: context.state.waitingForCoinChoice,
                waitingForCoinCall: context.state.waitingForCoinCall,
                coinWinner: context.state.coinWinner ? context.services.speakerName(context.state.coinWinner) : "",
                actor: phase?.speaker ? context.services.speakerName(phase.speaker) : "",
                judge: context.services.isHumanJudgeQuestionPhase(phase) ? context.services.getActiveHumanJudgeName(phase) : phase?.judgeNumber ? context.services.judgeLabel(phase.judgeNumber) : "",
                judgeMode: context.state.judgeMode, speakerIsAi: !!phase?.speaker && context.services.isAiControlledRole(phase.speaker),
                isRecording: context.state.isRecording, voiceFinalizePending: context.state.voiceFinalizePending,
                pendingSubmitReason: context.services.getPendingVoiceSubmissionReason(),
                submissionAllowed: context.services.currentPhaseUsesMainComposer(phase) && !context.state.completed && !context.state.busy && !context.state.voiceFinalizePending && !context.services.isCurrentPhaseAwaitingPlayback(phase) && !context.state.coinTossAnimating,
                playing, playbackPaused, reader: speechMessage?.label || "",
                audioPending: context.services.isSpeechPlaybackActive(), awaitingPlayback: context.services.isCurrentPhaseAwaitingPlayback(phase),
                preparing: !!(context.state.aiPreparationPromises[phase?.id] || context.state.aiJudgeQuestionPreparationPromises[judgePrepKey] || (phase?.kind === "closing" && context.services.usesAiFinalScoring() && Object.values(context.state.aiFinalJudgeScoringPromises).some(Boolean))),
                prepared: !!(context.state.aiPreparedTurns[phase?.id]?.text || (judgePrepKey && context.services.getCachedAiJudgeQuestion(phase.caseNum, phase.judgeNumber))),
                generationBlocked: !!phase && context.state.autoGenerationBlockedPhaseId === phase.id,
                retryLabel: context.ui.nextActionBtnEl.textContent,
                timerPaused: timerMatches && !!context.state.timer.intervalId && !context.state.timer.running && context.state.timer.remaining > 0,
                timerExpired: timerMatches && context.state.timer.remaining <= 0 && context.state.timer.warnedKeys.has(`${phase.id}:timeup`)
            };
        }


        function updateComposerModeIndicator() {
            const model = context.settings.COMPOSER_STATUS.deriveStatus(getComposerStatusSnapshot());
            const indicator = ensureComposerModeIndicatorUi();
            indicator.hidden = !model.hintVisible;
            indicator.textContent = model.hint;
            indicator.className = `status-chip ${model.hintActive ? "active" : "subtle"}`;
            if (context.ui.statusLineEl.textContent !== model.text) context.ui.statusLineEl.textContent = model.text;
            context.ui.statusLineEl.classList.toggle("error", model.error);
            context.ui.statusLineEl.setAttribute("role", "status");
            context.ui.statusLineEl.setAttribute("aria-live", "polite");
            if (context.state.started && !model.inputInvited) context.ui.messageInputEl.placeholder = model.text;
            context.ui.liveVoiceWrapEl.hidden = !context.state.started || context.state.completed || !(context.state.isRecording || context.state.voiceFinalizePending);
            const voiceLabel = context.ui.liveVoiceWrapEl.querySelector(".bubble-label");
            if (voiceLabel) voiceLabel.textContent = context.state.voiceFinalizePending
                ? context.services.l("Voice transcription", "Transcription vocale")
                : context.services.l("Voice recording", "Enregistrement vocal");
            if (context.state.isRecording || context.state.voiceFinalizePending) {
                context.ui.liveVoicePreviewEl.textContent = context.state.isRecording
                    ? context.services.l("Recording audio. It will be transcribed after you stop.", "Enregistrement audio. Il sera transcrit après l’arrêt.")
                    : context.services.l("Finalizing the voice transcript...", "Finalisation de la transcription vocale...");
            }
            const phase = context.services.getCurrentPhase();
            if (context.services.isHumanJudgeQuestionPhase(phase) && context.state.phaseReady) {
                const activeJudge = context.services.getActiveHumanJudgeEntry(phase);
                if (activeJudge?.status) {
                    activeJudge.status.textContent = model.hint;
                    activeJudge.status.className = indicator.className;
                }
            }
        }


        function hydrateMainComposerFromActiveJudgeDraftIfNeeded(force = false) {
            const phase = context.services.getCurrentPhase();
            if (!phase || !context.state.phaseReady || !context.services.isHumanJudgeQuestionPhase(phase)) {
                context.state.mainComposerHydratedPhaseId = "";
                return;
            }
            const judge = context.services.getActiveHumanJudgeEntry(phase);
            if (!judge?.question) return;
            if (force || context.state.mainComposerHydratedPhaseId !== phase.id) {
                if (!context.state.isRecording && !context.state.voiceFinalizePending) context.ui.messageInputEl.value = String(judge.question.value || "");
                context.state.mainComposerHydratedPhaseId = phase.id;
            }
        }


        function syncActiveJudgeDraftFromMainComposer({ persist = false } = {}) {
            const phase = context.services.getCurrentPhase();
            if (!phase || !context.state.phaseReady || !context.services.isHumanJudgeQuestionPhase(phase)) return;
            const judge = context.services.getActiveHumanJudgeEntry(phase);
            if (!judge?.question) return;
            if (judge.question.value !== context.ui.messageInputEl.value) {
                judge.question.value = context.ui.messageInputEl.value;
                if (persist) context.services.saveSetup();
            }
        }


        function clearMainComposerJudgeBinding() {
            context.state.mainComposerHydratedPhaseId = "";
        }


        function appendHumanTurnMessage(phase, text) {
            const cleanText = context.services.sanitizeText(text);
            if (!phase || !cleanText) return false;
            context.services.appendParticipantMessage(phase.speaker, cleanText, { caseNum: phase.caseNum || 0, phaseId: phase.id });
            context.ui.messageInputEl.value = "";
            return true;
        }


        function appendHumanJudgeQuestionMessage(phase, text) {
            const cleanText = context.services.sanitizeText(text);
            const judge = context.services.getActiveHumanJudgeEntry(phase);
            if (!phase || !judge || !cleanText) return false;
            const name = context.services.sanitizeText(judge.name.value) || context.services.judgeLabel(judge.number);
            judge.question.value = cleanText;
            context.services.storeJudgeQuestionForPhase(phase, cleanText);
            context.services.primeAiJudgeAnswerForFinalQuestion(phase);
            context.services.appendMessage("judge", name, cleanText, {
                caseNum: phase.caseNum,
                    phaseId: phase.id,
                    judgeNumber: judge.number,
                    silent: true
            });
            judge.question.value = "";
            context.ui.messageInputEl.value = "";
            clearMainComposerJudgeBinding();
            context.services.saveSetup();
            return true;
        }


        function commitMainComposerSubmission(phase, text) {
            if (!phase) return false;
            if (context.services.isHumanJudgeQuestionPhase(phase)) return appendHumanJudgeQuestionMessage(phase, text);
            return appendHumanTurnMessage(phase, text);
        }


        function getComposerDraftTextForPhase(phase) {
            if (!phase) return "";
            if (context.services.isHumanJudgeQuestionPhase(phase)) {
                const judge = context.services.getActiveHumanJudgeEntry(phase);
                return context.services.sanitizeText(context.ui.messageInputEl.value || judge?.question?.value || "");
            }
            return context.services.sanitizeText(context.ui.messageInputEl.value);
        }


        function getEmptyComposerErrorMessage(phase) {
            if (context.services.isHumanJudgeQuestionPhase(phase)) {
                return context.services.isFrenchLocale()
                ? `Entrez la question de ${context.services.getActiveHumanJudgeName(phase)} avant de la soumettre.`
                : `Enter ${context.services.getActiveHumanJudgeName(phase)}'s question before submitting.`;
            }
            return context.services.l("Type a response before submitting.", "Tapez une réponse avant de soumettre.");
        }


        function getStopRecordingAndSubmitStatusText(phase) {
            if (context.services.isHumanJudgeQuestionPhase(phase)) {
                return context.services.isFrenchLocale()
                ? `Arrêt de l’enregistrement et envoi de la question de ${context.services.getActiveHumanJudgeName(phase)}...`
                : `Stopping recording and asking ${context.services.getActiveHumanJudgeName(phase)}'s question...`;
            }
            return context.services.l("Stopping recording and submitting...", "Arrêt de l’enregistrement et envoi...");
        }


        function concludeTimedOutHumanPhase(expiredPhase) {
            if (!expiredPhase || context.state.completed) return;
            context.services.primeAiPreparationForPhase(expiredPhase);
            context.services.appendMessage("moderator", context.services.moderatorLabel(), context.services.l("Time.", "Temps."), {
                caseNum: expiredPhase.caseNum || 0,
                    phaseId: expiredPhase.id || "",
                    onPlaybackComplete: () => {
                        const current = context.services.getCurrentPhase();
                        if (!current || current.id !== expiredPhase.id || context.state.completed) return;
                        context.services.advanceAfterTimedPhaseExpiration(expiredPhase);
                    }
            });
        }


        function submitComposerAction() {
            if (context.state.busy || context.state.voiceFinalizePending || context.state.completed) return;
            const phase = context.services.getCurrentPhase();
            if (!context.services.currentPhaseUsesMainComposer(phase)) return;
            if (context.state.isRecording) {
                context.services.setPendingVoiceSubmission("manual", phase.id);
                if (!context.services.stopRecordingAndFinalize(getStopRecordingAndSubmitStatusText(phase))) context.services.resolvePendingVoiceSubmission();
                return;
            }
            const text = getComposerDraftTextForPhase(phase);
            if (!text) {
                context.services.setStatus(getEmptyComposerErrorMessage(phase), true);
                return;
            }
            const didCommit = commitMainComposerSubmission(phase, text);
            if (!didCommit) {
                context.services.setStatus(getEmptyComposerErrorMessage(phase), true);
                return;
            }
            if (context.services.isHumanJudgeQuestionPhase(phase)) context.services.setStatus(context.services.l("Judge question submitted.", "Question du juge soumise."));
            else context.services.setStatus(`${context.services.speakerName(phase.speaker)} ${context.services.l("submitted the current turn.", "a soumis le tour actuel.")}`);
            context.services.advancePhase();
        }


        function askHumanJudgeQuestion(judgeNumber) {
            if (context.state.busy || context.state.voiceFinalizePending || context.state.completed) return;
            const phase = context.services.getCurrentPhase();
            if (!phase || !context.state.phaseReady || phase.kind !== "judgeQuestion" || context.state.judgeMode !== "human" || phase.judgeNumber !== judgeNumber) {
                context.services.setStatus(context.services.isFrenchLocale() ? `Ce n’est pas le tour de question du ${context.services.judgeLabel(judgeNumber)} en ce moment.` : `It is not ${context.services.judgeLabel(judgeNumber)}'s question turn right now.`, true);
                return;
            }
            if (context.state.isRecording) {
                context.services.setPendingVoiceSubmission("manual", phase.id);
                if (!context.services.stopRecordingAndFinalize(getStopRecordingAndSubmitStatusText(phase))) context.services.resolvePendingVoiceSubmission();
                return;
            }
            const judge = context.ui.judgeInputs.find((item) => item.number === judgeNumber);
            if (!judge) return;
            const text = context.services.sanitizeText(context.ui.messageInputEl.value || judge.question.value);
            if (!text) {
                context.services.setStatus(context.services.isFrenchLocale() ? `Entrez la question de ${context.services.getActiveHumanJudgeName(phase)} avant de la poser.` : `Enter ${context.services.getActiveHumanJudgeName(phase)}'s question before asking it.`, true);
                return;
            }
            const didCommit = appendHumanJudgeQuestionMessage(phase, text);
            if (!didCommit) {
                context.services.setStatus(context.services.isFrenchLocale() ? `Entrez la question de ${context.services.getActiveHumanJudgeName(phase)} avant de la poser.` : `Enter ${context.services.getActiveHumanJudgeName(phase)}'s question before asking it.`, true);
                return;
            }
            context.services.setStatus(context.services.isFrenchLocale() ? `${context.services.getActiveHumanJudgeName(phase)} a posé une question.` : `${context.services.getActiveHumanJudgeName(phase)} asked a question.`);
            context.services.advancePhase();
        }
        return Object.freeze({ensureComposerModeIndicatorUi,getComposerStatusSnapshot,updateComposerModeIndicator,hydrateMainComposerFromActiveJudgeDraftIfNeeded,syncActiveJudgeDraftFromMainComposer,clearMainComposerJudgeBinding,appendHumanTurnMessage,appendHumanJudgeQuestionMessage,commitMainComposerSubmission,getComposerDraftTextForPhase,getEmptyComposerErrorMessage,getStopRecordingAndSubmitStatusText,concludeTimedOutHumanPhase,submitComposerAction,askHumanJudgeQuestion});
    }
    return Object.freeze({create,dependencies});
});
