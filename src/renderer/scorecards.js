(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root){root.EthicsRenderer=root.EthicsRenderer||{};root.EthicsRenderer.scorecards=api;}})(typeof globalThis==="object"?globalThis:this,function(){
    "use strict";
    const dependencies=Object.freeze({
    "services": [
        "appendMessage",
        "caseLabel",
        "clearPhaseAwaitingPlayback",
        "formatOfficialParticipantBreakdown",
        "isFrenchLocale",
        "judgeLabel",
        "judgeModeLabel",
        "l",
        "moderatorLabel",
        "normalizeIntegerScore",
        "refreshControls",
        "renderTranscript",
        "renderMatchSetupSummary",
        "sanitizeText",
        "setStatus",
        "speakerName",
        "stopTimer",
        "updatePhaseHeader"
    ],
    "settings": [
        "SCORECARD_TALLY"
    ],
    "ui": [
        "judgeInputs",
        "scoreCardsEl",
        "scoreSummaryEl"
    ],
    "platform": [
        "document"
    ]
});
    function create(context) {
        function clearScoreboard() {
            context.ui.scoreSummaryEl.textContent = "";
            context.ui.scoreCardsEl.innerHTML = "";
        }

        function updateMatchSummaryPlaceholder() {
            if (!context.state.started) clearScoreboard();
            context.services.renderMatchSetupSummary();
        }

        function publishJudgeScorecard(card) {
            if (context.state.sessionClosed || !card) return;
            const scorecard = { ...card, participantNames: {
                human: context.services.speakerName("human"), ai: context.services.speakerName("ai")
            }};
            const existing = context.state.transcript.find(message => message.kind === "judge-result"
                && message.scorecard?.judgeNumber === card.judgeNumber);
            const label = card.name || context.services.judgeLabel(card.judgeNumber);
            const feedback = card.humanComments && card.aiComments
                ? ["human", "ai"].map(role => {
                    const comments = role === "human" ? card.humanComments : card.aiComments;
                    return `${scorecard.participantNames[role]}\n${context.services.l("What the team did well", "Ce que l’équipe a bien fait")}: ${comments.didWell}\n${context.services.l("What needs improvement", "Ce qui doit être amélioré")}: ${comments.needsImprovement}`;
                }).join("\n\n") : (card.comment || "");
            const text = `${scorecard.participantNames.human}: ${card.humanScore}/60 • ${scorecard.participantNames.ai}: ${card.aiScore}/60` + (feedback ? `\n\n${feedback}` : "");
            if (existing) {
                existing.scorecard = scorecard;
                existing.label = label;
                existing.text = text;
                context.services.renderTranscript();
                return;
            }
            context.services.appendMessage("judge-result", label, text, {
                scorecard, silent: true, substantive: false, caseNum: 0, phaseId: "closing"
            });
        }

        function renderScorecards(cards, tally, sourceMode = "ai") {
            // Individual cards already appear incrementally in the dialogue.
            context.ui.scoreCardsEl.innerHTML = "";
            cards.forEach(publishJudgeScorecard);
            const resultText = tally.result === "tie"
            ? context.services.l("Match result: tie.", "Résultat du match : égalité.")
            : context.services.isFrenchLocale()
            ? `Gagnante : ${context.services.speakerName(tally.result)}.`
            : `Winner: ${context.services.speakerName(tally.result)}.`;

            context.ui.scoreSummaryEl.textContent = context.services.isFrenchLocale()
            ? `${context.services.speakerName("human")} : ${tally.humanVotes} votes • ${context.services.speakerName("ai")} : ${tally.aiVotes} votes • ${resultText}`
            : `${context.services.speakerName("human")}: ${tally.humanVotes} votes • ${context.services.speakerName("ai")}: ${tally.aiVotes} votes • ${resultText}`;
        }

        function computeVoteTally(cards) {
            return context.settings.SCORECARD_TALLY.computeVoteTally(cards);
        }

        function readHumanJudgeBreakdown(inputs) {
            const values = Object.fromEntries(Object.entries(context.settings.SCORECARD_TALLY.OFFICIAL_BREAKDOWN_RANGES).map(([key, [min,max]]) =>
                [key, context.settings.SCORECARD_TALLY.normalizeWholeNumberInRange(inputs?.[key]?.value, min, max)]));
            return context.settings.SCORECARD_TALLY.normalizeOfficialParticipantBreakdown(values);
        }

        function refreshHumanScoreTotals() {
            context.ui.judgeInputs.forEach(judge => {
                for (const role of ["human", "ai"]) {
                    const breakdown = readHumanJudgeBreakdown(judge[`${role}Breakdown`]);
                    judge[`${role}Score`].value = breakdown ? String(context.settings.SCORECARD_TALLY.totalOfficialParticipantBreakdown(breakdown)) : "";
                }
            });
        }

        function collectHumanJudgeScorecards() {
            return context.ui.judgeInputs.map((judge) => {
                const humanBreakdown = readHumanJudgeBreakdown(judge.humanBreakdown), aiBreakdown = readHumanJudgeBreakdown(judge.aiBreakdown);
                if (!humanBreakdown || !aiBreakdown) throw new Error(context.services.l("Enter all seven criterion scores within their ranges for each participant and judge.", "Entrez les sept notes de critères dans leurs plages pour chaque participant et juge."));
                const humanComments = { didWell: context.services.sanitizeText(judge.humanDidWell.value), needsImprovement: context.services.sanitizeText(judge.humanNeedsImprovement.value) };
                const aiComments = { didWell: context.services.sanitizeText(judge.aiDidWell.value), needsImprovement: context.services.sanitizeText(judge.aiNeedsImprovement.value) };
                if (![humanComments.didWell,humanComments.needsImprovement,aiComments.didWell,aiComments.needsImprovement].every(Boolean)) throw new Error(context.services.l("Enter what each team did well and what needs improvement for every judge.", "Entrez ce que chaque équipe a bien fait et ce qui doit être amélioré pour chaque juge."));
                return { judgeNumber: judge.number, name: context.services.sanitizeText(judge.name.value) || context.services.judgeLabel(judge.number),
                    humanScore: context.settings.SCORECARD_TALLY.totalOfficialParticipantBreakdown(humanBreakdown), aiScore: context.settings.SCORECARD_TALLY.totalOfficialParticipantBreakdown(aiBreakdown),
                    humanBreakdown, aiBreakdown, humanComments, aiComments };
            });
        }

        function announceFinalResult(cards, sourceMode) {
            if (context.state.completed) return;
            const tally = computeVoteTally(cards);
            renderScorecards(cards, tally, sourceMode);
            let resultLine = context.services.isFrenchLocale() ? "le match se termine par une égalité." : "the match is a tie.";
            if (tally.result === "human") resultLine = context.services.isFrenchLocale() ? `la gagnante est ${context.services.speakerName("human")}.` : `the winning participant is ${context.services.speakerName("human")}.`;
            if (tally.result === "ai") resultLine = context.services.isFrenchLocale() ? `la gagnante est ${context.services.speakerName("ai")}.` : `the winning participant is ${context.services.speakerName("ai")}.`;
            context.services.appendMessage("moderator", context.services.moderatorLabel(), context.services.isFrenchLocale()
            ? `Merci aux deux participantes pour cette excellente ronde. Les juges ont terminé. ${resultLine} On applaudit les deux participantes.`
            : `Thank you to both participants for a great round. The judges have finished. ${resultLine} Let us have a round of applause for both participants.`,
            { caseNum: 0, phaseId: "closing" });
            context.services.setStatus(context.services.l("Match complete.", "Match terminé."));
            context.state.completed = true;
            context.state.phaseReady = false;
            context.services.clearPhaseAwaitingPlayback();
            context.services.stopTimer();
            context.services.updatePhaseHeader();
            context.services.refreshControls();
        }
        return Object.freeze({clearScoreboard,updateMatchSummaryPlaceholder,publishJudgeScorecard,renderScorecards,computeVoteTally,readHumanJudgeBreakdown,refreshHumanScoreTotals,collectHumanJudgeScorecards,announceFinalResult});
    }
    return Object.freeze({create,dependencies});
});
