"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    isTimedSpokenPhase,
    mapWithConcurrency,
    shouldReportTimedMessage,
    summarizeTimedSpeech
} = require("../src/shared/speech-timing");

test("speech timing includes the timer lead and preserves sub-second precision", () => {
    const result = summarizeTimedSpeech({
        audioDurationSeconds: 291.875,
        timerLeadMs: 350,
        timerBudgetSeconds: 300,
        wordCount: 750
    });

    assert.equal(result.audioDurationSeconds, 291.875);
    assert.equal(result.timerLeadSeconds, 0.35);
    assert.equal(result.timerConsumedSeconds, 292.225);
    assert.ok(Math.abs(result.remainingSeconds - 7.775) < 1e-9);
    assert.equal(result.overrunSeconds, 0);
    assert.ok(Math.abs(result.wordsPerMinute - (750 * 60 / 291.875)) < 1e-9);
});

test("speech timing reports an overrun instead of a negative remaining value", () => {
    const result = summarizeTimedSpeech({
        audioDurationSeconds: 140.2,
        timerLeadMs: 350,
        timerBudgetSeconds: 140,
        wordCount: 300
    });

    assert.equal(result.remainingSeconds, 0);
    assert.ok(Math.abs(result.overrunSeconds - 0.55) < 1e-9);
    assert.ok(Math.abs(result.signedRemainingSeconds + 0.55) < 1e-9);
});

test("only clocked speech, question, and answer phases are timing-report turns", () => {
    assert.equal(isTimedSpokenPhase({ kind: "speech", duration: 300 }), true);
    assert.equal(isTimedSpokenPhase({ kind: "judgeQuestion", duration: 60 }), true);
    assert.equal(isTimedSpokenPhase({ kind: "judgeAnswer", duration: 140 }), true);
    assert.equal(isTimedSpokenPhase({ kind: "confer", duration: 180 }), false);
    assert.equal(isTimedSpokenPhase({ kind: "moderatorCase", duration: null }), false);
});

test("moderator announcements and judge questions never create timing-result cards", () => {
    const presentation = { kind: "speech", duration: 300 };
    const judgeQuestion = { kind: "judgeQuestion", duration: 60 };
    assert.equal(shouldReportTimedMessage({ kind: "moderator" }, presentation), false);
    assert.equal(shouldReportTimedMessage({ kind: "ai" }, presentation), true);
    assert.equal(shouldReportTimedMessage({ kind: "judge" }, judgeQuestion), false);
    assert.equal(shouldReportTimedMessage({ kind: "ai" }, { kind: "confer", duration: 180 }), false);
});

test("concurrent timing work is bounded and returned in original chunk order", async () => {
    const delays = [35, 5, 20, 1, 10];
    let active = 0;
    let peakActive = 0;

    const results = await mapWithConcurrency(delays, 3, async (delay, index) => {
        active += 1;
        peakActive = Math.max(peakActive, active);
        await new Promise((resolve) => setTimeout(resolve, delay));
        active -= 1;
        return `chunk-${index}`;
    });

    assert.equal(peakActive, 3);
    assert.deepEqual(results, ["chunk-0", "chunk-1", "chunk-2", "chunk-3", "chunk-4"]);
});
