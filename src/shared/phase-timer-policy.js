(function exposePhaseTimerPolicy(root, factory) {
    const policy = factory();
    if (typeof module === "object" && module.exports) module.exports = policy;
    if (root) root.EthicsPhaseTimerPolicy = policy;
})(typeof globalThis === "object" ? globalThis : this, function createPhaseTimerPolicy() {
    "use strict";

    function startsWithAutoSpeech(phase, { speakerIsAiControlled = false, judgeMode = "" } = {}) {
        if (!phase?.duration) return false;
        if (phase.kind === "judgeQuestion") return judgeMode === "ai";
        if (phase.kind === "speech" || phase.kind === "judgeAnswer") return speakerIsAiControlled;
        return false;
    }

    function preloadsDuringModerator(phase, { speakerIsAiControlled = false } = {}) {
        return !!phase?.duration && (phase.kind === "speech" || phase.kind === "judgeAnswer") && speakerIsAiControlled;
    }

    function usesNaturalModeratorHandoff(phase, { speakerIsAiControlled = false } = {}) {
        if (!speakerIsAiControlled || phase?.kind !== "speech") return false;
        return phase.subtype === "presentation" || phase.subtype === "commentary" || phase.subtype === "response";
    }

    return Object.freeze({ preloadsDuringModerator, startsWithAutoSpeech, usesNaturalModeratorHandoff });
});
