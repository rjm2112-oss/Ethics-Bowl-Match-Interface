(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root){root.EthicsRenderer=root.EthicsRenderer||{};root.EthicsRenderer["questions"]=api;}})(typeof globalThis==="object"?globalThis:this,function(){"use strict";
    const dependencies=Object.freeze({"services": ["advancePhase", "appendMessage", "blockAutoGenerationForPhase", "buildAiJudgeQuestionPrompt", "callAI", "clearPhaseAwaitingPlayback", "clearWholeSpeechPreparation", "extractJsonObject", "getCurrentPhase", "getJudgeModel", "isAiControlledRole", "isFrenchLocale", "judgeLabel", "l", "maybePrepareAiTurnForPhase", "prepareWholeSpeechAudioForPhase", "sanitizeText", "setBusy", "setPhaseAwaitingPlayback", "setStatus", "startTimerWithAutoSpeech", "usesAiJudgeQuestions"], "settings": ["JUDGE_REASONING_EFFORT", "TIMED_SPEECH_TIMER_LEAD_MS"], "ui": [], "platform": ["console"]});
    function create(context) {
        function getAiJudgeQuestionPreparationKey(caseNum, judgeNumber) {
            return `case${Number(caseNum) || 0}-judge${Number(judgeNumber) || 0}`;
        }


        async function maybePrepareAiJudgeQuestion(caseNum, judgeNumber) {
            if (!context.services.usesAiJudgeQuestions()) return "";
            const phase = context.services.getCurrentPhase();
            if (!phase || phase.kind !== "judgeQuestion" || phase.caseNum !== caseNum || phase.judgeNumber !== judgeNumber) return "";
            const cached = getCachedAiJudgeQuestion(caseNum, judgeNumber);
            if (cached) return cached;
            const prepKey = getAiJudgeQuestionPreparationKey(caseNum, judgeNumber);
            if (context.state.aiJudgeQuestionPreparationPromises[prepKey]) return context.state.aiJudgeQuestionPreparationPromises[prepKey];
            const runId = context.state.matchRunId;
            let trackedPromise = null;
            trackedPromise = (async () => {
                try {
                    const question = await ensureAiJudgeQuestion(caseNum, judgeNumber, runId);
                    if (runId !== context.state.matchRunId) return "";
                    delete context.state.aiJudgeQuestionPreparationErrors[prepKey];
                    return question;
                } catch (error) {
                    if (runId === context.state.matchRunId) {
                        context.state.aiJudgeQuestionPreparationErrors[prepKey] = error?.message || context.services.l("Failed to prepare AI judge question.", "La préparation de la question du juge IA a échoué.");
                    }
                    throw error;
                } finally {
                    if (context.state.aiJudgeQuestionPreparationPromises[prepKey] === trackedPromise) delete context.state.aiJudgeQuestionPreparationPromises[prepKey];
                }
            })();
            context.state.aiJudgeQuestionPreparationPromises[prepKey] = trackedPromise;
            return trackedPromise;
        }


        function getJudgeQuestionPhaseId(caseNum, judgeNumber) {
            return `case${caseNum}-judge${judgeNumber}-question`;
        }


        function getJudgeAnswerPhaseId(caseNum, judgeNumber) {
            return `case${caseNum}-judge${judgeNumber}-answer`;
        }


        function getJudgeAnswerTargetForQuestionPhase(phase) {
            if (!phase || phase.kind !== "judgeQuestion") return null;
            const nextPhase = context.state.phases[context.state.currentPhaseIndex + 1] || null;
            if (nextPhase && nextPhase.kind === "judgeAnswer" && nextPhase.caseNum === phase.caseNum && nextPhase.judgeNumber === phase.judgeNumber) {
                return nextPhase;
            }
            return context.state.phases.find((item) => item.kind === "judgeAnswer" && item.caseNum === phase.caseNum && item.judgeNumber === phase.judgeNumber) || null;
        }


        function primeAiJudgeAnswerForFinalQuestion(phase) {
            const answerTarget = getJudgeAnswerTargetForQuestionPhase(phase);
            if (!answerTarget || !context.services.isAiControlledRole(answerTarget.speaker)) return null;

            const finalQuestion = context.services.sanitizeText(
                context.state.askedJudgeQuestions[phase.id] ||
                context.state.askedJudgeQuestions[answerTarget.id] || ""
            );
            if (!finalQuestion) return null;

            // Start answer generation and exact whole-answer audio measurement only
            // after the final question has been locked and stored.
            void context.services.maybePrepareAiTurnForPhase(answerTarget)
            .then((text) => {
                const cleanText = context.services.sanitizeText(text);
                if (!cleanText) return null;
                return context.services.prepareWholeSpeechAudioForPhase(answerTarget, cleanText);
            })
            .catch((error) => {
                context.platform.console.error("AI judge-answer preparation from the final question failed:", error);
            });
            return answerTarget;
        }


        function getJudgeQuestionForAnswerPhase(phase) {
            if (!phase || phase.kind !== "judgeAnswer") return "";
            return context.services.sanitizeText(
                context.state.askedJudgeQuestions[phase.id] ||
                context.state.askedJudgeQuestions[getJudgeQuestionPhaseId(phase.caseNum, phase.judgeNumber)] || ""
            );
        }


        function storeJudgeQuestionForPhase(phase, question) {
            const clean = context.services.sanitizeText(question);
            if (!phase || phase.kind !== "judgeQuestion" || !clean) return;
            const answerPhaseId = getJudgeAnswerPhaseId(phase.caseNum, phase.judgeNumber);
            const previousQuestion = context.services.sanitizeText(
                context.state.askedJudgeQuestions[answerPhaseId] ||
                context.state.askedJudgeQuestions[phase.id] || ""
            );
            const questionChanged = previousQuestion !== clean;
            context.state.lastJudgeQuestionByCase[phase.caseNum] = clean;
            context.state.askedJudgeQuestions[phase.id] = clean;
            context.state.askedJudgeQuestions[answerPhaseId] = clean;
            if (questionChanged) {
                delete context.state.aiPreparedTurns[answerPhaseId];
                delete context.state.aiPreparationErrors[answerPhaseId];
                context.services.clearWholeSpeechPreparation(answerPhaseId);
            }
            const prepKey = getAiJudgeQuestionPreparationKey(phase.caseNum, phase.judgeNumber);
            delete context.state.aiJudgeQuestionPreparationPromises[prepKey];
            delete context.state.aiJudgeQuestionPreparationErrors[prepKey];
        }


        function getCachedAiJudgeQuestion(caseNum, judgeNumber) {
            return context.services.sanitizeText(context.state.judgeQuestionCache?.[caseNum]?.[judgeNumber - 1] || "");
        }


        function cacheAiJudgeQuestion(caseNum, judgeNumber, question) {
            const clean = context.services.sanitizeText(question);
            if (!context.state.judgeQuestionCache[caseNum]) context.state.judgeQuestionCache[caseNum] = [];
            context.state.judgeQuestionCache[caseNum][judgeNumber - 1] = clean;
            return clean;
        }


        async function ensureAiJudgeQuestion(caseNum, judgeNumber, expectedRunId = context.state.matchRunId) {
            const cached = getCachedAiJudgeQuestion(caseNum, judgeNumber);
            if (cached) return cached;
            const prompt = context.services.buildAiJudgeQuestionPrompt(caseNum, judgeNumber);
            const raw = await context.services.callAI({
                model: context.services.getJudgeModel(judgeNumber), systemPrompt: "", userPrompt: prompt,
                maxTokens: 600, reasoningEffort: context.settings.JUDGE_REASONING_EFFORT
            });
            if (expectedRunId !== context.state.matchRunId) return "";
            const parsed = typeof raw === "object" && raw ? raw : context.services.extractJsonObject(raw);
            const question = typeof parsed.question === "string" ? context.services.sanitizeText(parsed.question) : "";
            if (!question) throw new Error(context.services.l("The judge returned a missing or blank JSON question.", "Le juge a renvoyé une question JSON manquante ou vide."));
            return cacheAiJudgeQuestion(caseNum, judgeNumber, question);
        }


        async function askAiJudgeQuestion(phase) {
            const runId = context.state.matchRunId;
            const isCurrent = () => runId === context.state.matchRunId && !context.state.sessionClosed;
            if (!isCurrent()) return false;
            const phaseId = phase?.id || "";
            const prepKey = getAiJudgeQuestionPreparationKey(phase?.caseNum, phase?.judgeNumber);
            const hasPrepared = !!getCachedAiJudgeQuestion(phase?.caseNum, phase?.judgeNumber);
            const hasPendingPreparation = !!context.state.aiJudgeQuestionPreparationPromises[prepKey];
            context.services.setBusy(true);
            context.services.setStatus(
                hasPrepared
                ? context.services.isFrenchLocale() ? `La question du ${context.services.judgeLabel(phase.judgeNumber)} est prête.` : `${context.services.judgeLabel(phase.judgeNumber)}'s question is ready.`
                : hasPendingPreparation
                ? context.services.isFrenchLocale() ? `Préparation de la question du ${context.services.judgeLabel(phase.judgeNumber)}...` : `Preparing ${context.services.judgeLabel(phase.judgeNumber)}'s question...`
                : context.services.isFrenchLocale() ? `Génération de la question du ${context.services.judgeLabel(phase.judgeNumber)}...` : `Generating ${context.services.judgeLabel(phase.judgeNumber)}'s question...`
            );
            try {
                const question = await maybePrepareAiJudgeQuestion(phase.caseNum, phase.judgeNumber);
                if (!isCurrent()) return false;
                const current = context.services.getCurrentPhase();
                if (!current || current.id !== phaseId || context.state.completed) {
                    context.services.setStatus(context.services.isFrenchLocale() ? `La question du ${context.services.judgeLabel(phase.judgeNumber)} est arrivée après le changement de phase.` : `${context.services.judgeLabel(phase.judgeNumber)}'s question arrived after the phase had already moved on.`);
                    return false;
                }
                const finalQuestion = context.services.sanitizeText(question);
                if (!finalQuestion) throw new Error(context.services.isFrenchLocale() ? `La question du juge IA ${phase.judgeNumber} manquait.` : `AI judge question ${phase.judgeNumber} was missing.`);
                context.services.setPhaseAwaitingPlayback(phaseId);
                const questionTranscriptIndex = context.services.appendMessage("judge", context.services.judgeLabel(phase.judgeNumber), finalQuestion, {
                    caseNum: phase.caseNum,
                        phaseId,
                        judgeNumber: phase.judgeNumber,
                        onPlaybackStart: () => {
                            if (!isCurrent()) return;
                            context.services.startTimerWithAutoSpeech(phaseId);
                        },
                        speechStartLeadMs: context.settings.TIMED_SPEECH_TIMER_LEAD_MS,
                        onPlaybackComplete: () => {
                            if (!isCurrent()) return;
                            const activePhase = context.services.getCurrentPhase();
                            if (!activePhase || activePhase.id !== phaseId || context.state.completed) return;
                            if (context.state.phaseAwaitingPlaybackForId !== phaseId) return;
                            const delivered = context.state.transcript[questionTranscriptIndex];
                            if (!["complete","cutoff"].includes(delivered?.speechDeliveryState)) {
                                context.services.clearPhaseAwaitingPlayback(phaseId);
                                context.services.blockAutoGenerationForPhase(phaseId);
                                context.services.setStatus(context.services.l("The interrupted judge question needs verified word alignment.", "La question interrompue du juge nécessite un alignement vérifié des mots."), true);
                                return;
                            }
                            storeJudgeQuestionForPhase(phase, delivered.text);
                            primeAiJudgeAnswerForFinalQuestion(phase);
                            context.services.clearPhaseAwaitingPlayback(phaseId);
                            context.services.advancePhase();
                        }
                });
                context.services.setStatus(context.services.isFrenchLocale() ? `${context.services.judgeLabel(phase.judgeNumber)} pose sa question.` : `${context.services.judgeLabel(phase.judgeNumber)} is asking a question.`);
                return true;
            } catch (error) {
                if (!isCurrent()) return false;
                context.platform.console.error(error);
                context.services.blockAutoGenerationForPhase(phaseId);
                context.services.clearPhaseAwaitingPlayback(phaseId);
                context.services.setStatus(error?.message || context.services.l("Failed to generate the judge question.", "La génération de la question du juge a échoué."), true);
                return false;
            } finally {
                if (isCurrent()) context.services.setBusy(false);
            }
        }
        return Object.freeze({getAiJudgeQuestionPreparationKey,maybePrepareAiJudgeQuestion,getJudgeQuestionPhaseId,getJudgeAnswerPhaseId,getJudgeAnswerTargetForQuestionPhase,primeAiJudgeAnswerForFinalQuestion,getJudgeQuestionForAnswerPhase,storeJudgeQuestionForPhase,getCachedAiJudgeQuestion,cacheAiJudgeQuestion,ensureAiJudgeQuestion,askAiJudgeQuestion});
    }
    return Object.freeze({create,dependencies});
});
