(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root){root.EthicsRenderer=root.EthicsRenderer||{};root.EthicsRenderer["prompts"]=api;}})(typeof globalThis==="object"?globalThis:this,function(){"use strict";
    const dependencies=Object.freeze({"services": ["getJudgeQuestionForAnswerPhase", "getStoredText", "otherRole", "speakerName", "substantiveTranscriptAsPlainText"], "settings": ["AI_TURN_PROMPTS", "ETHICS_BOWL_RUBRIC", "STORAGE_KEYS"], "ui": [], "platform": ["window"]});
    function create(context) {
        function buildAiDebaterSystemPrompt(role) {
            return context.settings.AI_TURN_PROMPTS.buildParticipantSystemPrompt({
                participantName: context.services.speakerName(role),
                opponentName: context.services.speakerName(context.services.otherRole(role)),
                locale: context.state.locale,
                additionalInstructions: context.services.getStoredText(context.settings.STORAGE_KEYS.instructions)
            });
        }


        function buildAiScoringSystemPrompt() {
            return context.platform.window.EthicsFinalScoring.systemPrompt(context.state.locale);
        }


        function buildAiSingleJudgeScoringPrompt(scoringTranscript) {
            return context.platform.window.EthicsFinalScoring.userPrompt({transcript:scoringTranscript,names:{human:context.services.speakerName("human"),ai:context.services.speakerName("ai")},leadByCase:context.state.leadByCase,locale:context.state.locale});
        }


        function buildAiTurnPrompt(phase) {
            if (phase.kind === "judgeAnswer") return context.settings.AI_TURN_PROMPTS.buildJudgeAnswerPrompt({
                participantName: context.services.speakerName(phase.speaker), opponentName: context.services.speakerName(context.services.otherRole(phase.speaker)),
                locale: context.state.locale, duration: phase.duration, caseData: context.state.cases[phase.caseNum],
                transcript: context.services.substantiveTranscriptAsPlainText(phase.caseNum),
                scoringCriteria: context.settings.ETHICS_BOWL_RUBRIC.buildTurnCriteria({phase,locale:context.state.locale}),
                additionalInstructions: context.services.getStoredText(context.settings.STORAGE_KEYS.instructions),
                judgeNumber: phase.judgeNumber, judgeQuestion: context.services.getJudgeQuestionForAnswerPhase(phase)
            });
            return context.settings.AI_TURN_PROMPTS.buildAiTurnPrompt({
                phase, locale: context.state.locale,
                caseData: context.state.cases[phase.caseNum],
                participantRole: phase.speaker === context.state.leadByCase[phase.caseNum] ? "Presenting participant" : "Commenting participant",
                transcript: context.services.substantiveTranscriptAsPlainText(phase.caseNum),
                judgeQuestion: phase.kind === "judgeAnswer" ? context.services.getJudgeQuestionForAnswerPhase(phase) : "",
                scoringCriteria: context.settings.ETHICS_BOWL_RUBRIC.buildTurnCriteria({ phase, locale: context.state.locale })
            });
        }


        function buildAiJudgeQuestionPrompt(caseNum, judgeNumber) {
            return context.settings.AI_TURN_PROMPTS.buildJudgeQuestionPrompt({
                judgeNumber, locale: context.state.locale,
                participantNames: [context.services.speakerName("human"), context.services.speakerName("ai")],
                questionedParticipant: context.services.speakerName(context.state.leadByCase[caseNum]),
                caseData: context.state.cases[caseNum],
                transcript: context.services.substantiveTranscriptAsPlainText(caseNum),
                scoringCriteria: context.settings.ETHICS_BOWL_RUBRIC.buildFullCriteria({locale: context.state.locale}),
                additionalInstructions: context.services.getStoredText(context.settings.STORAGE_KEYS.instructions)
            });
        }
        return Object.freeze({buildAiDebaterSystemPrompt,buildAiScoringSystemPrompt,buildAiSingleJudgeScoringPrompt,buildAiTurnPrompt,buildAiJudgeQuestionPrompt});
    }
    return Object.freeze({create,dependencies});
});
