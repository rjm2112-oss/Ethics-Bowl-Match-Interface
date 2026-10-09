(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root){root.EthicsRenderer=root.EthicsRenderer||{};root.EthicsRenderer["scoring"]=api;}})(typeof globalThis==="object"?globalThis:this,function(){"use strict";
    const dependencies=Object.freeze({"services": ["buildAiScoringSystemPrompt", "buildAiSingleJudgeScoringPrompt", "callAI", "getJudgeModel", "isFrenchLocale", "judgeLabel", "l", "normalizeAiFinalJudgeScorecardResponse", "publishJudgeScorecard", "sanitizeText", "scoringTranscriptAsPlainText", "setBusy", "setStatus", "usesAiFinalScoring"], "settings": ["FINAL_JUDGE_SCORECARD_JSON_SCHEMA", "FINAL_SCORECARD_REQUEST_TIMEOUT_MS", "JUDGE_REASONING_EFFORT"], "ui": [], "platform": ["console"]});
    function create(context) {
        async function maybePrepareAiFinalJudgeScorecard(judgeNumber, expectedRunId = context.state.matchRunId) {
            if (!context.services.usesAiFinalScoring()) throw new Error(context.services.l("Final scores must be entered by human judges in this mode.", "Les notes finales doivent être saisies par les juges humains dans ce mode."));
            if ((context.state.transcript || []).some((message) => message.speechDeliveryState && !["complete","cutoff"].includes(message.speechDeliveryState))) {
                throw new Error(context.services.l("Final judging is waiting for a verified delivered transcript. Interrupted speech has not been aligned yet.", "Le jugement final attend une transcription vérifiée de la parole livrée. La parole interrompue n’a pas encore été alignée."));
            }
            const scoringTranscript = context.services.scoringTranscriptAsPlainText();
            const snapshots = context.state.aiFinalJudgeScoringTranscripts;
            const cached = context.state.aiFinalJudgeScorecards[judgeNumber];
            if (cached && snapshots[judgeNumber] === scoringTranscript) { context.services.publishJudgeScorecard(cached); return cached; }
            if (cached) delete context.state.aiFinalJudgeScorecards[judgeNumber];
            if (context.state.aiFinalJudgeScoringPromises[judgeNumber] && snapshots[judgeNumber] === scoringTranscript) return context.state.aiFinalJudgeScoringPromises[judgeNumber];
            const request = {
                model: context.services.getJudgeModel(judgeNumber),
                systemPrompt: context.services.buildAiScoringSystemPrompt(),
                userPrompt: context.services.buildAiSingleJudgeScoringPrompt(scoringTranscript),
                maxTokens: 6000,
                requestTimeoutMs: context.settings.FINAL_SCORECARD_REQUEST_TIMEOUT_MS,
                reasoningEffort: context.settings.JUDGE_REASONING_EFFORT,
                jsonSchema: context.settings.FINAL_JUDGE_SCORECARD_JSON_SCHEMA
            };
            const requestIdentity = JSON.stringify(request);
            const rejected = context.state.aiFinalJudgeScoringRejections[judgeNumber];
            if (rejected?.requestIdentity === requestIdentity) throw new Error(rejected.message);
            delete context.state.aiFinalJudgeScoringRejections[judgeNumber];
            snapshots[judgeNumber] = scoringTranscript;
            let trackedPromise = null;
            trackedPromise = (async () => {
                try {
                    if (!context.services.sanitizeText(scoringTranscript)) throw new Error(context.services.l("No substantive transcript is available for final AI judging.", "Aucune transcription substantielle n’est disponible pour le jugement final IA."));
                    const parsed = await context.services.callAI(request);
                    if (expectedRunId !== context.state.matchRunId || context.state.sessionClosed
                        || context.state.aiFinalJudgeScoringPromises[judgeNumber] !== trackedPromise
                        || scoringTranscript !== context.services.scoringTranscriptAsPlainText()
                        || (context.state.transcript || []).some((message) => message.speechDeliveryState && !["complete","cutoff"].includes(message.speechDeliveryState))) return null;
                    const card = context.services.normalizeAiFinalJudgeScorecardResponse(parsed, judgeNumber);
                    context.state.aiFinalJudgeScorecards[judgeNumber] = card;
                    delete context.state.aiFinalJudgeScoringErrors[judgeNumber];
                    delete context.state.aiFinalJudgeScoringRejections[judgeNumber];
                    context.services.publishJudgeScorecard(card);
                    return card;
                } catch (error) {
                    if (expectedRunId === context.state.matchRunId && context.state.aiFinalJudgeScoringPromises[judgeNumber] === trackedPromise) {
                        if (/HTTP\s*400/i.test(error?.message || "") && /schema|output_config|unsupported|minimum|maximum/i.test(error?.message || "")) {
                            context.state.aiFinalJudgeScoringRejections[judgeNumber] = { requestIdentity, message: error.message };
                        }
                        context.state.aiFinalJudgeScoringErrors[judgeNumber] = error?.message || (context.services.isFrenchLocale()
                            ? `La génération de la fiche finale du ${context.services.judgeLabel(judgeNumber)} a échoué.`
                            : `Failed to generate Judge ${judgeNumber}'s final scorecard.`);
                    }
                    throw error;
                } finally {
                    if (context.state.aiFinalJudgeScoringPromises[judgeNumber] === trackedPromise) delete context.state.aiFinalJudgeScoringPromises[judgeNumber];
                }
            })();
            context.state.aiFinalJudgeScoringPromises[judgeNumber] = trackedPromise;
            return trackedPromise;
        }


        async function maybePrepareAllAiFinalScorecards(expectedRunId = context.state.matchRunId) {
            if (!context.services.usesAiFinalScoring()) throw new Error(context.services.l("Final scores must be entered by human judges in this mode.", "Les notes finales doivent être saisies par les juges humains dans ce mode."));
            const cards = await Promise.all([1, 2, 3].map((judgeNumber) => maybePrepareAiFinalJudgeScorecard(judgeNumber, expectedRunId)));
            if (expectedRunId !== context.state.matchRunId) return [];
            if (cards.length !== 3 || cards.some((card) => !card || card.humanScore == null || card.aiScore == null)) {
                throw new Error(context.services.l("AI judges returned incomplete scores.", "Les juges IA ont renvoyé des notes incomplètes."));
            }
            return cards;
        }


        function primeAiFinalScoringPreparationForPhase(phase) {
            if (!phase || context.state.judgeMode !== "ai") return;
            if (phase.kind === "scoring" && phase.caseNum === 2) {
                void maybePrepareAllAiFinalScorecards(context.state.matchRunId).catch((error) => {
                    context.platform.console.error("AI final score preparation failed:", error);
                });
            }
        }


        async function generateAiFinalScores() {
            const runId = context.state.matchRunId;
            if (context.state.sessionClosed) return [];
            if (!context.services.usesAiFinalScoring()) throw new Error(context.services.l("Final scores must be entered by human judges in this mode.", "Les notes finales doivent être saisies par les juges humains dans ce mode."));
            const readyCount = [1, 2, 3].filter((judgeNumber) => !!context.state.aiFinalJudgeScorecards[judgeNumber]).length;
            const pendingCount = [1, 2, 3].filter((judgeNumber) => !!context.state.aiFinalJudgeScoringPromises[judgeNumber]).length;
            context.services.setBusy(true);
            context.services.setStatus(
                readyCount === 3
                ? context.services.l("Final AI judge scorecards are ready.", "Les fiches finales des juges IA sont prêtes.")
                : readyCount > 0 || pendingCount > 0
                ? context.services.l("Finishing final AI judge scorecards...", "Finalisation des fiches finales des juges IA...")
                : context.services.l("Generating final AI judge scorecards...", "Génération des fiches finales des juges IA...")
            );
            try {
                return await maybePrepareAllAiFinalScorecards(runId);
            } finally {
                if (runId === context.state.matchRunId && !context.state.sessionClosed) context.services.setBusy(false);
            }
        }
        return Object.freeze({maybePrepareAiFinalJudgeScorecard,maybePrepareAllAiFinalScorecards,primeAiFinalScoringPreparationForPhase,generateAiFinalScores});
    }
    return Object.freeze({create,dependencies});
});
