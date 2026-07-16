"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    computeVoteTally,
    normalizeThresholdAudit,
    normalizeWholeNumberInRange,
    totalOfficialParticipantBreakdown
} = require("../src/shared/scorecard-tally");

test("official breakdown totals preserve valid zero scores", () => {
    assert.equal(totalOfficialParticipantBreakdown({
        presentationQuestion: 0,
        presentationEthics: 0,
        presentationViewpoints: 0,
        responseToFeedback: 0,
        judgesQuestions: 0,
        commentary: 0,
        respectfulDialogue: 0
    }), 0);
    assert.equal(totalOfficialParticipantBreakdown({
        presentationQuestion: 5,
        presentationEthics: 5,
        presentationViewpoints: 5,
        responseToFeedback: 10,
        judgesQuestions: 20,
        commentary: 10,
        respectfulDialogue: 5
    }), 60);
});

test("score normalization rejects blank, fractional, and out-of-range values", () => {
    assert.equal(normalizeWholeNumberInRange("", 0, 60), null);
    assert.equal(normalizeWholeNumberInRange("4.5", 0, 60), null);
    assert.equal(normalizeWholeNumberInRange(61, 0, 60), null);
    assert.equal(normalizeWholeNumberInRange(true, 0, 60), null);
    assert.equal(normalizeWholeNumberInRange([], 0, 60), null);
    assert.equal(normalizeWholeNumberInRange("42", 0, 60), 42);
});

test("threshold audits require evidence and keep scores inside the declared band", () => {
    assert.deepEqual(normalizeThresholdAudit({
        score: 7,
        highestSatisfiedBand: "6-8",
        evidence: "The response identifies and addresses the central challenge.",
        limitation: "The clarification remains somewhat general.",
        hasMaterialLimitation: false,
        unmetNextThreshold: "It does not refine the original position."
    }, "responseToFeedback"), {
        score: 7,
        highestSatisfiedBand: "6-8",
        evidence: "The response identifies and addresses the central challenge.",
        limitation: "The clarification remains somewhat general.",
        hasMaterialLimitation: false,
        unmetNextThreshold: "It does not refine the original position."
    });
    assert.equal(normalizeThresholdAudit({
        score: 9,
        highestSatisfiedBand: "6-8",
        evidence: "Some evidence.",
        limitation: "A material omission remains.",
        hasMaterialLimitation: true,
        unmetNextThreshold: "Some missing requirement."
    }, "responseToFeedback"), null);
    assert.equal(normalizeThresholdAudit({
        score: 4,
        highestSatisfiedBand: "4-5",
        evidence: "",
        limitation: "The reasoning is not consistently coherent.",
        hasMaterialLimitation: true,
        unmetNextThreshold: "The reasoning is not consistently coherent."
    }, "presentationQuestion"), null);
    assert.equal(normalizeThresholdAudit({
        score: 17,
        highestSatisfiedBand: "16-20",
        evidence: "All three answers explain and refine the position.",
        limitation: "One answer is less precise than the others.",
        hasMaterialLimitation: false,
        unmetNextThreshold: "No higher threshold; top-band requirements were satisfied."
    }, "judgesQuestions")?.score, 17);
    assert.equal(normalizeThresholdAudit({
        score: 20,
        highestSatisfiedBand: "16-20",
        evidence: "All answers meet every top-band threshold.",
        limitation: "One answer leaves a substantive objection unresolved.",
        hasMaterialLimitation: true,
        unmetNextThreshold: "No higher threshold exists."
    }, "judgesQuestions")?.score, 18);
    assert.equal(normalizeThresholdAudit({
        score: 5,
        highestSatisfiedBand: "4-5",
        evidence: "The position and reasons are clear and coherent.",
        limitation: "A substantive transition in the reasoning remains unclear.",
        hasMaterialLimitation: true,
        unmetNextThreshold: "No higher threshold exists."
    }, "presentationQuestion")?.score, 4);
    assert.equal(normalizeThresholdAudit({
        score: 10,
        highestSatisfiedBand: "9-10",
        evidence: "The response clarifies and refines the position.",
        limitation: "One major critique receives only a partial answer.",
        hasMaterialLimitation: true,
        unmetNextThreshold: "No higher threshold exists."
    }, "responseToFeedback")?.score, 9);
    assert.equal(normalizeThresholdAudit({
        score: 4,
        highestSatisfiedBand: "4-5",
        evidence: "The position is clear.",
        limitation: "The structure is uneven.",
        unmetNextThreshold: "No higher threshold exists."
    }, "presentationQuestion"), null);
});

test("three judges produce three independent tallies before votes are combined", () => {
    const tally = computeVoteTally([
        { judgeNumber: 1, humanScore: 48, aiScore: 45 },
        { judgeNumber: 2, humanScore: 44, aiScore: 47 },
        { judgeNumber: 3, humanScore: 46, aiScore: 46 }
    ]);
    assert.deepEqual(tally.judges.map(({ judgeNumber, result }) => ({ judgeNumber, result })), [
        { judgeNumber: 1, result: "human" },
        { judgeNumber: 2, result: "ai" },
        { judgeNumber: 3, result: "tie" }
    ]);
    assert.equal(tally.humanVotes, 1.5);
    assert.equal(tally.aiVotes, 1.5);
    assert.equal(tally.result, "tie");
    assert.throws(() => computeVoteTally([{ humanScore: 40, aiScore: 39 }]), /Exactly three/);
});
