(function exposeSpeechTiming(root, factory) {
    const speechTiming = factory();
    if (typeof module === "object" && module.exports) module.exports = speechTiming;
    if (root) root.EthicsSpeechTiming = speechTiming;
})(typeof globalThis === "object" ? globalThis : this, function createSpeechTiming() {
    "use strict";

    function finiteNonNegative(value) {
        const number = Number(value);
        return Number.isFinite(number) && number >= 0 ? number : 0;
    }

    function summarizeTimedSpeech({
        audioDurationSeconds = 0,
        timerLeadMs = 0,
        timerBudgetSeconds = 0,
        wordCount = 0
    } = {}) {
        const audioSeconds = finiteNonNegative(audioDurationSeconds);
        const leadSeconds = finiteNonNegative(timerLeadMs) / 1000;
        const budgetSeconds = finiteNonNegative(timerBudgetSeconds);
        const words = Math.max(0, Math.round(finiteNonNegative(wordCount)));
        const timerConsumedSeconds = audioSeconds + leadSeconds;
        const signedRemainingSeconds = budgetSeconds - timerConsumedSeconds;

        return Object.freeze({
            audioDurationSeconds: audioSeconds,
            timerLeadSeconds: leadSeconds,
            timerBudgetSeconds: budgetSeconds,
            timerConsumedSeconds,
            signedRemainingSeconds,
            remainingSeconds: Math.max(0, signedRemainingSeconds),
            overrunSeconds: Math.max(0, -signedRemainingSeconds),
            wordCount: words,
            wordsPerMinute: audioSeconds > 0 ? (words * 60) / audioSeconds : 0
        });
    }

    function isTimedSpokenPhase(phase) {
        return !!phase?.duration
            && (phase.kind === "speech" || phase.kind === "judgeQuestion" || phase.kind === "judgeAnswer");
    }

    function shouldReportTimedMessage(message, phase) {
        return isTimedSpokenPhase(phase)
            && phase?.kind !== "judgeQuestion"
            && message?.kind !== "moderator";
    }

    async function mapWithConcurrency(items, maxConcurrency, worker) {
        const values = Array.from(items || []);
        if (typeof worker !== "function") throw new TypeError("A concurrency worker is required.");
        if (!values.length) return [];

        const requestedConcurrency = Math.floor(Number(maxConcurrency));
        const concurrency = Math.min(
            values.length,
            Number.isFinite(requestedConcurrency) && requestedConcurrency > 0 ? requestedConcurrency : 1
        );
        const results = new Array(values.length);
        let nextIndex = 0;

        async function runWorker() {
            while (nextIndex < values.length) {
                const index = nextIndex;
                nextIndex += 1;
                results[index] = await worker(values[index], index);
            }
        }

        await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
        return results;
    }

    return Object.freeze({
        isTimedSpokenPhase,
        mapWithConcurrency,
        shouldReportTimedMessage,
        summarizeTimedSpeech
    });
});
