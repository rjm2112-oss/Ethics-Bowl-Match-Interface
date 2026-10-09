(function exposeAiTurnPrompts(root, factory) {
    const aiTurnPrompts = factory(typeof module === "object" && module.exports ? require("./case-packet") : root.EthicsCasePacket);
    if (typeof module === "object" && module.exports) module.exports = aiTurnPrompts;
    if (root) root.EthicsAiTurnPrompts = aiTurnPrompts;
})(typeof globalThis === "object" ? globalThis : this, function createAiTurnPrompts(packetParser) {
    "use strict";

    function buildParticipantSystemPrompt({ participantName = "", opponentName = "", locale = "en", additionalInstructions = "" } = {}) {
        return [
            `You are ${participantName}, a participant in a live Ethics Bowl match against ${opponentName}.`,
            `Response language: ${/^fr(?:-|$)/i.test(locale) ? "Québec French" : "English"}`,
            additionalInstructions.trim() ? `Additional model instructions:\n${additionalInstructions}` : ""
        ].filter(Boolean).join("\n\n");
    }

    function getPhaseInstruction(phase = {}) {
        if (phase.kind === "judgeAnswer") return "Answer the judge's question.";
        if (phase.kind !== "speech") return "";
        if (phase.subtype === "presentation") return "Present an answer to the moderator's question.";
        if (phase.subtype === "commentary") return "Comment on the other participant's presentation.";
        if (phase.subtype === "response") return "Respond to the commentary.";
        return "";
    }

    // Initial calibration: 198 English words / 79.656 s and 309 French words / 129.024 s.
    // Keep a 6% allowance for cadence variation and the existing 350 ms timer lead.
    function getWordTarget({ duration, locale = "en" } = {}) {
        if (!Number.isFinite(duration) || duration <= 0.35) return null;
        const wordsPerMinute = /^fr(?:-|$)/i.test(locale) ? 144 : 149;
        const roundFive = value => Math.max(5, Math.round(value / 5) * 5);
        const target = duration === 140 ? (/^fr(?:-|$)/i.test(locale) ? 315 : 330) : roundFive((duration - 0.35) * wordsPerMinute / 60 * 0.94);
        return Object.freeze({ target });
    }

    function buildWordTargetInstruction({ duration, locale = "en" } = {}) {
        const goal = getWordTarget({ duration, locale });
        return goal ? `Write exactly ${goal.target} words.` : "";
    }

    function buildAiTurnPrompt({ phase = {}, locale = "en", caseData = {}, participantRole = "", transcript = "", judgeQuestion = "", scoringCriteria = "" } = {}) {
        return [
            `Current case: ${phase.caseNum || ""} — ${caseData.title || ""}`,
            `Moderator question: ${caseData.question || ""}`,
            `Case text:\n${packetParser.parse(caseData.text).narrative}`,
            `Current phase: ${phase.title || phase.subtype || phase.kind || ""}`,
            participantRole ? `Participant role in this case: ${participantRole}` : "",
            phase.kind === "judgeAnswer" ? `Judge question:\n${judgeQuestion || "[Missing judge question]"}` : "",
            `Prior discussion in this match:\n${transcript || "[No prior discussion yet.]"}`,
            scoringCriteria,
            getPhaseInstruction(phase),
            phase.kind === "speech" || phase.kind === "judgeAnswer" ? buildWordTargetInstruction({ duration: phase.duration, locale }) : ""
        ].filter(Boolean).join("\n\n");
    }

    function buildJudgeQuestionPrompt({ judgeNumber, locale = "en", participantNames = [], questionedParticipant = "", caseData = {}, transcript = "", scoringCriteria = "", additionalInstructions = "" } = {}) {
        return [
            `You are Judge ${judgeNumber} in an Ethics Bowl match.`,
            `Language: ${/^fr(?:-|$)/i.test(locale) ? "Québec French" : "English"}.`,
            `Participants: ${participantNames.join(", ")}.`,
            `Participant being questioned: ${questionedParticipant}.`,
            `Current case: ${caseData.title || ""}\n${packetParser.parse(caseData.text).narrative}`,
            `Moderator’s question: ${caseData.question || ""}`,
            "Current phase: Judges’ questions.",
            "Time available for your question: 60 seconds.",
            `Prior discussion: ${transcript || "[No prior discussion yet.]"}`,
            `Scoring criteria:\n${scoringCriteria}`,
            additionalInstructions.trim() ? `Additional instructions:\n${additionalInstructions}` : "",
            `Ask one question to ${questionedParticipant} in no more than 75 words.`,
            "Avoid repeating an earlier judge’s question.",
            'Return JSON {"question":"..."}.'
        ].filter(Boolean).join("\n\n");
    }

    function buildJudgeAnswerPrompt({ participantName = "", opponentName = "", locale = "en", duration = 140, caseData = {}, transcript = "", scoringCriteria = "", additionalInstructions = "", judgeNumber, judgeQuestion = "" } = {}) {
        return [
            `You are ${participantName}, a participant in a live Ethics Bowl match against ${opponentName}.`,
            `Language: ${/^fr(?:-|$)/i.test(locale) ? "Québec French" : "English"}.`,
            `Case: ${caseData.title || ""}\n${packetParser.parse(caseData.text).narrative}`,
            `Moderator’s question: ${caseData.question || ""}`,
            "Current phase: Answering a judge’s question.",
            `Prior discussion: ${transcript || "[No prior discussion yet.]"}`,
            `Scoring criteria:\n${scoringCriteria}`,
            additionalInstructions.trim() ? `Additional instructions:\n${additionalInstructions}` : "",
            `Judge ${judgeNumber} asks: ${judgeQuestion}`,
            "Answer the judge’s question.",
            buildWordTargetInstruction({ duration, locale })
        ].filter(Boolean).join("\n\n");
    }

    return Object.freeze({ getWordTarget, buildWordTargetInstruction, buildParticipantSystemPrompt, getPhaseInstruction, buildAiTurnPrompt, buildJudgeQuestionPrompt, buildJudgeAnswerPrompt });
});
