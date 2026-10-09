"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    computeVoteTally,
    normalizeOfficialParticipantBreakdown,
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

test("numeric criterion scores retain all valid points and reject extra explanations", () => {
    const full = {presentationQuestion:5,presentationEthics:5,presentationViewpoints:5,responseToFeedback:10,judgesQuestions:20,commentary:10,respectfulDialogue:5};
    assert.deepEqual(normalizeOfficialParticipantBreakdown(full),full);
    assert.equal(totalOfficialParticipantBreakdown(normalizeOfficialParticipantBreakdown(full)),60);
    for (const invalid of [
        {...full,comment:"extra"}, {...full,judgesQuestions:21}, {...full,presentationEthics:2.5},
        {...full,commentary:"10"}, {...full,respectfulDialogue:null}, {...full,presentationQuestion:{score:5,evidence:"extra"}},
        [], null, {presentationQuestion:5}
    ]) assert.equal(normalizeOfficialParticipantBreakdown(invalid),null);
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
