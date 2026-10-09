(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root){root.EthicsRenderer=root.EthicsRenderer||{};root.EthicsRenderer["turns"]=api;}})(typeof globalThis==="object"?globalThis:this,function(){"use strict";
    const dependencies=Object.freeze({"services": ["advancePhase", "appendParticipantMessage", "blockAutoGenerationForPhase", "buildAiDebaterSystemPrompt", "buildAiTurnPrompt", "callAI", "clearPhaseAwaitingPlayback", "countWords", "getCurrentPhase", "getJudgeQuestionForAnswerPhase", "getParticipantModel", "isAiControlledRole", "isCurrentPhaseAwaitingPlayback", "isFrenchLocale", "judgeLabel", "l", "maybeCompletePreparedAiConferral", "phasePreloadsAutoSpeechDuringModerator", "phaseSubtypeLabel", "phaseUsesNaturalModeratorHandoff", "prepareWholeSpeechAudioForPhase", "primeWholeSpeechAudioForPhase", "sanitizeText", "setBusy", "setPhaseAwaitingPlayback", "setStatus", "speakerName", "startTimerWithAutoSpeech"], "settings": ["AI_TURN_PROMPTS", "MODEL_CATALOG", "PARTICIPANT_SPEECH_HANDOFF_GAP_MS", "TIMED_SPEECH_TIMER_LEAD_MS", "TIMING_TEST_MODE"], "ui": [], "platform": ["console"]});
    function create(context) {
        function getLinkedAiPreparationTarget(phase) {
            if (!phase) return null;
            const nextPhase = context.state.phases[context.state.currentPhaseIndex + 1] || null;
            if (!nextPhase) return null;
            if (
                phase.kind === "confer" &&
                context.services.isAiControlledRole(phase.speaker) &&
                nextPhase.kind === "speech" &&
                context.services.isAiControlledRole(nextPhase.speaker) &&
                nextPhase.caseNum === phase.caseNum &&
                nextPhase.subtype === phase.subtype
            ) return nextPhase;
            return null;
        }


        function getPreparedAiTurnText(phaseId) {
            const phase = context.state.phases.find(item => item.id === phaseId);
            const record = context.state.aiPreparedTurns[phaseId];
            if (phase?.kind === "judgeAnswer" && record?.question !== context.services.getJudgeQuestionForAnswerPhase(phase)) return "";
            return context.services.sanitizeText(record?.text || "");
        }


        function getAiTurnMaxOutputTokens(phase) {
            if (!phase) return 2200;
            if (phase.kind === "judgeAnswer") return 3000;
            if (phase.subtype === "presentation") return 4000;
            if (phase.subtype === "commentary" || phase.subtype === "response") return 2800;
            return 2200;
        }


        async function maybePrepareAiTurnForPhase(phase) {
            const phaseId = phase?.id || "";
            if (!phaseId || context.state.sessionClosed || context.state.completed || context.state.interruptedPhaseIds?.has(phaseId) || !context.services.isAiControlledRole(phase.speaker)) return "";
            const boundQuestion = phase.kind === "judgeAnswer" ? context.services.getJudgeQuestionForAnswerPhase(phase) : "";
            const record=context.state.aiPreparedTurns[phaseId];
            const cached=record && record.question===boundQuestion ? record.text : "";
            if (cached) return cached;
            if (context.state.aiPreparationPromises[phaseId]) return context.state.aiPreparationPromises[phaseId];
            const runId = context.state.matchRunId;
            const isCurrent = () => runId === context.state.matchRunId && !context.state.sessionClosed && !context.state.completed && !context.state.interruptedPhaseIds?.has(phaseId);
            let trackedPromise = null;
            trackedPromise = (async () => {
                try {
                    const boundJudgeQuestion = phase.kind === "judgeAnswer" ? context.services.getJudgeQuestionForAnswerPhase(phase) : "";
                    if (phase.kind === "judgeAnswer" && !boundJudgeQuestion) {
                        throw new Error(context.services.isFrenchLocale()
                            ? `La question du ${context.services.judgeLabel(phase.judgeNumber)} manque, donc ${context.services.speakerName(phase.speaker)} ne peut pas encore y répondre.`
                            : `Judge ${phase.judgeNumber}'s question is missing, so ${context.services.speakerName(phase.speaker)} cannot answer it yet.`);
                    }
                    // Freeze the complete request once. A content retry gets no draft,
                    // count feedback or revised instructions, even if settings change.
                    const model = context.services.getParticipantModel(phase.speaker);
                    const request = Object.freeze({
                        model,
                        reasoningEffort: context.settings.MODEL_CATALOG.getReasoningEffort(model, "participant"),
                        systemPrompt: phase.kind === "judgeAnswer" ? "" : context.services.buildAiDebaterSystemPrompt(phase.speaker),
                        userPrompt: context.services.buildAiTurnPrompt(phase),
                        maxTokens: getAiTurnMaxOutputTokens(phase),
                        role: "participant"
                    });
                    const target = context.settings.AI_TURN_PROMPTS.getWordTarget({duration:phase.duration,locale:context.state.locale})?.target;
                    const validateCurrentQuestion = () => {
                        if (phase.kind === "judgeAnswer" && context.services.sanitizeText(boundJudgeQuestion) !== context.services.getJudgeQuestionForAnswerPhase(phase)) {
                            throw new Error(context.services.l("The judge question changed while the AI answer was being prepared.", "La question du juge a changé pendant la préparation de la réponse IA."));
                        }
                    };
                    const requestAttempt = attempt => context.services.callAI({...request,recordContext:{matchRunId:runId,phaseId,wordTarget:target,contentAttempt:attempt}});
                    let text = context.services.sanitizeText(await requestAttempt(1));
                    if (!isCurrent()) return "";
                    validateCurrentQuestion();
                    if (!text) throw new Error(context.services.l("The model returned no text.", "Le modèle n’a renvoyé aucun texte."));
                    const firstWords = context.services.countWords(text);
                    let contentAttempt = 1;
                    // Integer comparison keeps exactly +/-10% inclusive. No loop:
                    // the second complete answer is selected even if it also misses.
                    if (Number.isFinite(target) && 10 * Math.abs(firstWords - target) > target) {
                        contentAttempt = 2;
                        try {
                            text = context.services.sanitizeText(await requestAttempt(2));
                            if (!isCurrent()) return "";
                            if (!text) throw new Error(context.services.l("The model returned no text.", "Le modèle n’a renvoyé aucun texte."));
                        } catch (error) {
                            if (!isCurrent()) return "";
                            throw new Error(context.services.l(`Fresh answer retry failed: ${error?.message || "generation failed"}`, `La nouvelle réponse a échoué : ${error?.message || "échec de génération"}`));
                        }
                        validateCurrentQuestion();
                    }
                    context.state.aiPreparedTurns[phaseId] = { text, question:boundJudgeQuestion, preparedAt:new Date().toISOString(), wordTarget:target, firstWords, selectedWords:context.services.countWords(text), contentAttempt };
                    delete context.state.aiPreparationErrors[phaseId];
                    context.services.primeWholeSpeechAudioForPhase(phase, text);
                    context.services.maybeCompletePreparedAiConferral();
                    return text;
                } catch (error) {
                    if (isCurrent()) context.state.aiPreparationErrors[phaseId] = error?.message || context.services.l("Failed to prepare AI turn.", "La préparation du tour IA a échoué.");
                    throw error;
                } finally {
                    if (context.state.aiPreparationPromises[phaseId] === trackedPromise) delete context.state.aiPreparationPromises[phaseId];
                }
            })();
            context.state.aiPreparationPromises[phaseId] = trackedPromise;
            return trackedPromise;
        }


        function primeAiPreparationForPhase(phase) {
            const targetPhase = getLinkedAiPreparationTarget(phase);
            if (!targetPhase) return;
            void maybePrepareAiTurnForPhase(targetPhase).catch((error) => {
                context.platform.console.error("AI preparation failed:", error);
            });
        }


        async function handleAiConferPhase(phase) {
            const runId = context.state.matchRunId;
            const isCurrent = () => runId === context.state.matchRunId && !context.state.sessionClosed;
            if (!isCurrent()) return false;
            const phaseId = phase?.id || "";
            const targetPhase = getLinkedAiPreparationTarget(phase);
            const speaker = context.services.speakerName(phase?.speaker);
            if (!phaseId || !targetPhase) {
                context.services.advancePhase();
                return true;
            }
            const hasPrepared = !!getPreparedAiTurnText(targetPhase.id);
            const hasPendingPreparation = !!context.state.aiPreparationPromises[targetPhase.id];
            context.services.setBusy(true);
            context.services.setStatus(
                hasPrepared
                ? context.services.isFrenchLocale() ? `${speaker} a terminé son caucus.` : `${speaker} has finished conferring.`
                : hasPendingPreparation
                ? context.services.isFrenchLocale() ? `${speaker} termine la préparation du ${context.services.phaseSubtypeLabel(targetPhase.subtype).toLowerCase()} pendant le caucus...` : `${speaker} is finishing the prepared ${targetPhase.subtype || "speech"} during conferral...`
                : context.services.isFrenchLocale() ? `${speaker} est en caucus et prépare le texte du ${context.services.phaseSubtypeLabel(targetPhase.subtype).toLowerCase()}...` : `${speaker} is conferring and preparing the ${targetPhase.subtype || "speech"}...`
            );
            try {
                const text = context.services.sanitizeText(await maybePrepareAiTurnForPhase(targetPhase));
                if (!isCurrent()) return false;
                if (!text) throw new Error(context.services.l("The model returned no text.", "Le modèle n’a renvoyé aucun texte."));
                let current = context.services.getCurrentPhase();
                if (!current || current.id !== phaseId || !context.state.phaseReady || context.state.completed) {
                    context.services.setStatus(context.services.isFrenchLocale() ? `Le caucus de ${speaker} s’est terminé après le changement de phase.` : `${speaker}'s conferral finished after the phase had already moved on.`);
                    return false;
                }

                context.services.setStatus(context.services.isFrenchLocale()
                    ? `Calcul de la durée audio et du débit global de ${speaker} pendant le caucus...`
                    : `Measuring ${speaker}'s audio and calculating one whole-speech rate during conferral...`);
                const preparedSpeech = await context.services.prepareWholeSpeechAudioForPhase(targetPhase, text);
                if (!isCurrent()) return false;
                current = context.services.getCurrentPhase();
                if (!current || current.id !== phaseId || !context.state.phaseReady || context.state.completed) {
                    context.services.setStatus(context.services.isFrenchLocale() ? `Le calcul audio de ${speaker} s’est terminé après la fin du caucus.` : `${speaker}'s audio calculation finished after conferral had already ended.`);
                    return false;
                }
                if (!context.settings.TIMING_TEST_MODE && !preparedSpeech) {
                    throw new Error(context.services.l("The prepared speech audio could not be measured.", "L’audio préparé de la prise de parole n’a pas pu être mesuré."));
                }

                context.services.setPhaseAwaitingPlayback(phaseId);
                context.services.appendParticipantMessage(phase.speaker, context.services.l("I yield my time", "Je cède mon temps"), {
                    caseNum: phase.caseNum,
                        phaseId,
                        substantive: false,
                        onPlaybackComplete: () => {
                            if (!isCurrent()) return;
                            const activePhase = context.services.getCurrentPhase();
                            if (!activePhase || activePhase.id !== phaseId || context.state.completed) return;
                            if (context.state.phaseAwaitingPlaybackForId !== phaseId) return;
                            context.services.clearPhaseAwaitingPlayback(phaseId);
                            context.services.advancePhase();
                        }
                });
                context.services.setStatus(context.services.isFrenchLocale() ? `${speaker} a terminé son caucus.` : `${speaker} has finished conferring.`);
                return true;
            } catch (error) {
                if (!isCurrent()) return false;
                context.platform.console.error(error);
                context.services.blockAutoGenerationForPhase(phaseId);
                context.services.clearPhaseAwaitingPlayback(phaseId);
                context.services.setStatus(error?.message || context.services.l("Failed during AI conferral.", "Échec pendant le caucus IA."), true);
                return false;
            } finally {
                if (isCurrent()) context.services.setBusy(false);
            }
        }


        async function generateAiTurnForPhase(phase, options = {}) {
            const runId = context.state.matchRunId;
            const isCurrent = () => runId === context.state.matchRunId && !context.state.sessionClosed;
            if (!isCurrent()) return false;
            const phaseId = phase?.id || "";
            if (!phaseId || context.state.interruptedPhaseIds?.has(phaseId)) return false;
            const duringModerator = options.duringModerator === true;
            const speaker = context.services.speakerName(phase.speaker);
            const hasPrepared = !!getPreparedAiTurnText(phaseId);
            const hasPendingPreparation = !!context.state.aiPreparationPromises[phaseId];
            if (duringModerator) context.services.setPhaseAwaitingPlayback(phaseId);
            if (!duringModerator) {
                context.services.setBusy(true);
                context.services.setStatus(
                    hasPrepared
                    ? context.services.isFrenchLocale() ? `${speaker} est prêt.` : `${speaker}'s ${phase.subtype || "answer"} is ready.`
                    : hasPendingPreparation
                    ? context.services.isFrenchLocale() ? `Finalisation du texte préparé de ${speaker}...` : `Finishing ${speaker}'s prepared ${phase.subtype || "answer"}...`
                    : context.services.isFrenchLocale() ? `Génération du texte de ${speaker}...` : `Generating ${speaker}'s ${phase.subtype || "answer"}...`
                );
            }
            try {
                const text = context.services.sanitizeText(await maybePrepareAiTurnForPhase(phase));
                if (!isCurrent()) return false;
                if (!text) throw new Error(context.services.l("The model returned no text.", "Le modèle n’a renvoyé aucun texte."));
                const current = context.services.getCurrentPhase();
                if (!current || current.id !== phaseId || context.state.completed || context.state.interruptedPhaseIds?.has(phaseId)) {
                    context.services.setStatus(context.services.isFrenchLocale() ? `Le tour de ${speaker} est arrivé après le changement de phase.` : `${speaker}'s turn finished after the phase had already moved on.`);
                    return false;
                }
                delete context.state.aiPreparedTurns[phaseId];
                delete context.state.aiPreparationErrors[phaseId];
                context.services.setPhaseAwaitingPlayback(phaseId);
                context.services.appendParticipantMessage(phase.speaker, text, {
                    caseNum: phase.caseNum,
                        phaseId,
                        hiddenUntilPhaseReady: duringModerator && !context.state.phaseReady,
                        onPlaybackStart: () => {
                            if (!isCurrent()) return;
                            context.services.startTimerWithAutoSpeech(phaseId);
                        },
                        minimumHandoffGapMs: context.services.phaseUsesNaturalModeratorHandoff(phase) ? context.settings.PARTICIPANT_SPEECH_HANDOFF_GAP_MS : 0,
                        speechStartLeadMs: context.settings.TIMED_SPEECH_TIMER_LEAD_MS,
                        onPlaybackComplete: () => {
                            if (!isCurrent()) return;
                            const activePhase = context.services.getCurrentPhase();
                            if (!activePhase || activePhase.id !== phaseId || context.state.completed) return;
                            if (context.state.phaseAwaitingPlaybackForId !== phaseId) return;
                            context.services.clearPhaseAwaitingPlayback(phaseId);
                            context.services.advancePhase();
                        }
                });
                if (!duringModerator) context.services.setStatus(context.services.isFrenchLocale() ? `${speaker} a terminé.` : `${speaker} has finished.`);
                return true;
            } catch (error) {
                if (!isCurrent()) return false;
                context.platform.console.error(error);
                context.services.blockAutoGenerationForPhase(phaseId);
                context.services.clearPhaseAwaitingPlayback(phaseId);
                context.services.setStatus(error?.message || context.services.l("Failed to generate the AI turn.", "La génération du tour IA a échoué."), true);
                return false;
            } finally {
                if (isCurrent() && !duringModerator) context.services.setBusy(false);
            }
        }


        function primeAiSpeechPlaybackDuringModerator(phase) {
            if (!context.services.phasePreloadsAutoSpeechDuringModerator(phase) || context.state.completed) return;
            if (context.services.isCurrentPhaseAwaitingPlayback(phase)) return;
            void generateAiTurnForPhase(phase, { duringModerator: true });
        }
        return Object.freeze({getLinkedAiPreparationTarget,getPreparedAiTurnText,getAiTurnMaxOutputTokens,maybePrepareAiTurnForPhase,primeAiPreparationForPhase,handleAiConferPhase,generateAiTurnForPhase,primeAiSpeechPlaybackDuringModerator});
    }
    return Object.freeze({create,dependencies});
});
