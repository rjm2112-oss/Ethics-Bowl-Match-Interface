(function exposeScorecardTally(root, factory) {
    const tally = factory();
    if (typeof module === "object" && module.exports) module.exports = tally;
    if (root) root.EthicsScorecardTally = tally;
})(typeof globalThis === "object" ? globalThis : this, function createScorecardTally() {
    "use strict";

    function createThresholdBands(ranges) {
        return Object.freeze(ranges.map(([min, max]) => Object.freeze({
            label: `${min}-${max}`,
            min,
            max
        })));
    }

    const OFFICIAL_BREAKDOWN_RANGES = Object.freeze({
        presentationQuestion: Object.freeze([0, 5]),
        presentationEthics: Object.freeze([0, 5]),
        presentationViewpoints: Object.freeze([0, 5]),
        responseToFeedback: Object.freeze([0, 10]),
        judgesQuestions: Object.freeze([0, 20]),
        commentary: Object.freeze([0, 10]),
        respectfulDialogue: Object.freeze([0, 5])
    });

    const FIVE_POINT_THRESHOLD_BANDS = createThresholdBands([[0, 1], [2, 3], [4, 5]]);
    const TEN_POINT_THRESHOLD_BANDS = createThresholdBands([[0, 2], [3, 5], [6, 8], [9, 10]]);
    const TWENTY_POINT_THRESHOLD_BANDS = createThresholdBands([[0, 5], [6, 10], [11, 15], [16, 20]]);
    const OFFICIAL_THRESHOLD_BANDS = Object.freeze({
        presentationQuestion: FIVE_POINT_THRESHOLD_BANDS,
        presentationEthics: FIVE_POINT_THRESHOLD_BANDS,
        presentationViewpoints: FIVE_POINT_THRESHOLD_BANDS,
        responseToFeedback: TEN_POINT_THRESHOLD_BANDS,
        judgesQuestions: TWENTY_POINT_THRESHOLD_BANDS,
        commentary: TEN_POINT_THRESHOLD_BANDS,
        respectfulDialogue: FIVE_POINT_THRESHOLD_BANDS
    });

    function normalizeWholeNumberInRange(value, min, max) {
        if (value == null) return null;
        const number = typeof value === "number"
            ? value
            : typeof value === "string" && value.trim()
                ? Number(value)
                : NaN;
        if (!Number.isInteger(number) || number < min || number > max) return null;
        return number;
    }

    function totalOfficialParticipantBreakdown(breakdown) {
        if (!breakdown || typeof breakdown !== "object") return null;
        let total = 0;
        for (const [key, [min, max]] of Object.entries(OFFICIAL_BREAKDOWN_RANGES)) {
            const score = normalizeWholeNumberInRange(breakdown[key], min, max);
            if (score == null) return null;
            total += score;
        }
        return total;
    }

    function normalizeThresholdAudit(value, criterionKey) {
        if (!value || typeof value !== "object" || Array.isArray(value)) return null;
        const range = OFFICIAL_BREAKDOWN_RANGES[criterionKey];
        const bands = OFFICIAL_THRESHOLD_BANDS[criterionKey];
        if (!range || !bands) return null;
        const score = normalizeWholeNumberInRange(value.score, range[0], range[1]);
        const highestSatisfiedBand = typeof value.highestSatisfiedBand === "string"
            ? value.highestSatisfiedBand.trim()
            : "";
        const evidence = typeof value.evidence === "string" ? value.evidence.trim() : "";
        const limitation = typeof value.limitation === "string" ? value.limitation.trim() : "";
        const hasMaterialLimitation = typeof value.hasMaterialLimitation === "boolean"
            ? value.hasMaterialLimitation
            : null;
        const unmetNextThreshold = typeof value.unmetNextThreshold === "string"
            ? value.unmetNextThreshold.trim()
            : "";
        const declaredBand = bands.find((band) => band.label === highestSatisfiedBand) || null;
        if (
            score == null ||
            !declaredBand ||
            score < declaredBand.min ||
            score > declaredBand.max ||
            !evidence ||
            !limitation ||
            hasMaterialLimitation == null ||
            !unmetNextThreshold
        ) return null;
        const isTopBand = declaredBand === bands[bands.length - 1];
        const materialLimitationCap = range[1] === 20 ? 18 : declaredBand.min;
        const calibratedScore = isTopBand && hasMaterialLimitation
            ? Math.min(score, materialLimitationCap)
            : score;
        return Object.freeze({
            score: calibratedScore,
            highestSatisfiedBand,
            evidence,
            limitation,
            hasMaterialLimitation,
            unmetNextThreshold
        });
    }

    function computeVoteTally(cards) {
        if (!Array.isArray(cards) || cards.length !== 3) {
            throw new Error("Exactly three judge scorecards are required.");
        }
        const judges = cards.map((card, index) => {
            const humanScore = normalizeWholeNumberInRange(card?.humanScore, 0, 60);
            const aiScore = normalizeWholeNumberInRange(card?.aiScore, 0, 60);
            if (humanScore == null || aiScore == null) {
                throw new Error(`Judge ${index + 1} has an invalid score tally.`);
            }
            const result = humanScore > aiScore ? "human" : aiScore > humanScore ? "ai" : "tie";
            return Object.freeze({
                judgeNumber: Number.isInteger(card?.judgeNumber) ? card.judgeNumber : index + 1,
                humanScore,
                aiScore,
                humanVotes: result === "human" ? 1 : result === "tie" ? 0.5 : 0,
                aiVotes: result === "ai" ? 1 : result === "tie" ? 0.5 : 0,
                result
            });
        });
        const humanVotes = judges.reduce((sum, judge) => sum + judge.humanVotes, 0);
        const aiVotes = judges.reduce((sum, judge) => sum + judge.aiVotes, 0);
        const result = humanVotes > aiVotes ? "human" : aiVotes > humanVotes ? "ai" : "tie";
        return { humanVotes, aiVotes, result, judges };
    }

    return Object.freeze({
        OFFICIAL_BREAKDOWN_RANGES,
        OFFICIAL_THRESHOLD_BANDS,
        computeVoteTally,
        normalizeThresholdAudit,
        normalizeWholeNumberInRange,
        totalOfficialParticipantBreakdown
    });
});
