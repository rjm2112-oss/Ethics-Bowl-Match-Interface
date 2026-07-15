(function exposeAiTurnPrompts(root, factory) {
    const aiTurnPrompts = factory();
    if (typeof module === "object" && module.exports) module.exports = aiTurnPrompts;
    if (root) root.EthicsAiTurnPrompts = aiTurnPrompts;
})(typeof globalThis === "object" ? globalThis : this, function createAiTurnPrompts() {
    "use strict";

    const PRESENTATION_INSTRUCTION = "Give a concise Ethics Bowl presentation. Answer the moderator's question directly. The judges' grading criteria are A (0-5): The participant presented a clear, identifiable position and supported it with identifiable reasons and the reasons were well articulated and jointly coherent. Criterion B (0-5): The participant identified the deep moral tension or tensions and applied moral concepts, such as duties, values, rights, or responsibilities, to relevant aspects of the case in a way that tackled the underlying moral tensions within the case. Presentation criterion C (0-5): The participant acknowledged strong, conflicting viewpoints and charitably explained why they pose a serious challenge to the participant's position and argued that the participant's position better defuses the moral tension within the case.";
    const COMMENTARY_INSTRUCTION = "Offer a concise commentary on the leading participant's presentation. The judges' grading criteria are (0-10): The participant developed a manageably small number of suggestions, questions, and critiques, constructively critiqued the presentation, focused on salient and important moral considerations, and provided the presenting participant with novel options to modify their position.";
    const RESPONSE_INSTRUCTION = "Respond directly to the commentary and address the main challenge fairly. The judges' grading criteria are (0-10): The participant prioritized the other participant's main suggestions, questions, and critiques, charitably explained why they pose a serious challenge to the participant's position, made the participant's position clearer, and refined the position or clearly explained why refinement was not required.";
    const JUDGE_ANSWER_INSTRUCTION = [
        "Answer the judge's exact question as posed.",
        "Your first sentence must directly answer that exact question.",
        "If the question is yes/no, start with 'Yes' or 'No.'",
        "If the question asks which principle, value, duty, or consideration matters most, name it explicitly in the first sentence.",
        "Do not sidestep, broaden, or reframe the question before answering it.",
        "The judges' grading criteria are (0-20): The participant answered the judge's question clearly, explicitly explained how the question impacts the participant's position in a way that made the participant's position clearer and refined the participant's position, or clearly explained why such refinement was not required."
    ].join(" ");

    function clipNonTranscriptText(value, maxLength) {
        const text = String(value || "");
        return text.length > maxLength
            ? `${text.slice(0, maxLength)}\n\n[Text clipped for brevity.]`
            : text;
    }

    function getPhaseInstruction(phase = {}) {
        if (phase.kind === "judgeAnswer") return JUDGE_ANSWER_INSTRUCTION;
        if (phase.kind !== "speech") return "";
        if (phase.subtype === "presentation") return PRESENTATION_INSTRUCTION;
        if (phase.subtype === "commentary") return COMMENTARY_INSTRUCTION;
        if (phase.subtype === "response") return RESPONSE_INSTRUCTION;
        return "";
    }

    function buildLengthTarget(wordGuidance) {
        if (!wordGuidance) return "";
        return `Length target: ${wordGuidance.min}-${wordGuidance.max} words. Aim near ${wordGuidance.preferredTarget} words. Hard cap: ${wordGuidance.max} words.`;
    }

    function buildAiTurnPrompt({ phase = {}, caseData = {}, transcript = "", judgeQuestion = "", wordGuidance = null } = {}) {
        const completeTranscript = String(transcript || "");
        const transcriptBlock = completeTranscript || "[No prior transcript for this case yet.]";
        const phaseInstruction = getPhaseInstruction(phase);
        const targetWords = buildLengthTarget(wordGuidance);

        if (phase.kind === "judgeAnswer") {
            return [
                `Current phase: ${phase.title || ""}`,
                `Exact judge question:\n${judgeQuestion || "[Missing judge question]"}`,
                phaseInstruction,
                targetWords,
                "Before finalizing internally, check the approximate word count and keep the answer inside the target range.",
                `Current case title: ${caseData.title || ""}`,
                `Moderator question: ${caseData.question || ""}`,
                `Case text:\n${clipNonTranscriptText(caseData.text, 6000)}`,
                `Transcript so far for this case:\n${transcriptBlock}`,
                "Stay tightly focused on the judge's exact wording.",
                "Output plain text only."
            ].filter(Boolean).join("\n\n");
        }

        return [
            `Current case title: ${caseData.title || ""}`,
            `Moderator question: ${caseData.question || ""}`,
            `Case text:\n${clipNonTranscriptText(caseData.text, 9000)}`,
            `Transcript so far for this case:\n${transcriptBlock}`,
            `Current phase: ${phase.title || ""}`,
            phaseInstruction,
            targetWords,
            "Output plain text only."
        ].filter(Boolean).join("\n\n");
    }

    return Object.freeze({
        PRESENTATION_INSTRUCTION,
        COMMENTARY_INSTRUCTION,
        RESPONSE_INSTRUCTION,
        JUDGE_ANSWER_INSTRUCTION,
        getPhaseInstruction,
        buildAiTurnPrompt
    });
});
