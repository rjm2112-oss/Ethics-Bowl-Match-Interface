(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root){root.EthicsRenderer=root.EthicsRenderer||{};root.EthicsRenderer["score-format"]=api;}})(typeof globalThis==="object"?globalThis:this,function(){"use strict";
    const dependencies=Object.freeze({"services": ["isFrenchLocale"], "settings": ["SCORECARD_TALLY"], "ui": [], "platform": ["window"]});
    function create(context) {
        function normalizeIntegerScore(value) {
            return context.settings.SCORECARD_TALLY.normalizeWholeNumberInRange(value, 0, 60);
        }


        function normalizeOfficialParticipantBreakdown(raw) {
            return context.settings.SCORECARD_TALLY.normalizeOfficialParticipantBreakdown(raw);
        }


        function totalOfficialParticipantBreakdown(breakdown) {
            return context.settings.SCORECARD_TALLY.totalOfficialParticipantBreakdown(breakdown);
        }


        function formatOfficialCriterionScore(breakdown, criterionKey) {
            const score = breakdown?.[criterionKey];
            const maximum = context.settings.SCORECARD_TALLY.OFFICIAL_BREAKDOWN_RANGES[criterionKey]?.[1] ?? 0;
            return `${score}/${maximum}`;
        }


        function formatOfficialParticipantBreakdown(breakdown) {
            if (!breakdown) return "";
            const presentationTotal = breakdown.presentationQuestion + breakdown.presentationEthics + breakdown.presentationViewpoints;
            if (context.services.isFrenchLocale()) {
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


        function normalizeAiFinalJudgeScorecardResponse(rawJudge, judgeNumber) {
            return context.platform.window.EthicsFinalScoring.normalize(rawJudge,judgeNumber,context.state.locale);
        }
        return Object.freeze({normalizeIntegerScore,normalizeOfficialParticipantBreakdown,totalOfficialParticipantBreakdown,formatOfficialCriterionScore,formatOfficialParticipantBreakdown,normalizeAiFinalJudgeScorecardResponse});
    }
    return Object.freeze({create,dependencies});
});
