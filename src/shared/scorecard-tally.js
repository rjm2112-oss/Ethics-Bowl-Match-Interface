(function exposeScorecardTally(root, factory) {
    const tally = factory();
    if (typeof module === "object" && module.exports) module.exports = tally;
    if (root) root.EthicsScorecardTally = tally;
})(typeof globalThis === "object" ? globalThis : this, function createScorecardTally() {
    "use strict";

    const OFFICIAL_BREAKDOWN_RANGES = Object.freeze({
        presentationQuestion: Object.freeze([0, 5]),
        presentationEthics: Object.freeze([0, 5]),
        presentationViewpoints: Object.freeze([0, 5]),
        responseToFeedback: Object.freeze([0, 10]),
        judgesQuestions: Object.freeze([0, 20]),
        commentary: Object.freeze([0, 10]),
        respectfulDialogue: Object.freeze([0, 5])
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

    function normalizeOfficialParticipantBreakdown(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) return null;
        const criteria = Object.keys(OFFICIAL_BREAKDOWN_RANGES);
        if (Object.keys(value).length !== criteria.length) return null;
        const result = {};
        for (const key of criteria) {
            const [min, max] = OFFICIAL_BREAKDOWN_RANGES[key];
            if (!Object.hasOwn(value, key) || typeof value[key] !== "number") return null;
            const score = normalizeWholeNumberInRange(value[key], min, max);
            if (score == null) return null;
            result[key] = score;
        }
        return Object.freeze(result);
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
        computeVoteTally,
        normalizeOfficialParticipantBreakdown,
        normalizeWholeNumberInRange,
        totalOfficialParticipantBreakdown
    });
});
